import {resolveStatementVarianceHandling} from "../../shared/statementVarianceCatalog.js";
import { createHash, randomUUID } from "node:crypto";
import { getStatementPaymentBlocker } from "../../shared/statementPaymentPolicy.js";
import { validateBusinessAttachment } from "./businessAttachmentValidationService.mjs";
import { createStatementPolicyService } from "./statementPolicyService.mjs";
import { createStatementExactPaymentCommand } from "./statementExactPaymentCommand.mjs";

const statementPolicyService = createStatementPolicyService();

export function createStatementFinancialCommandService(dependencies = {}) {
  const {
    businessDecisionEvidenceService,
    buildOperationLog,
    buildTodo,
    confirmStatementPayment,
    confirmStatementVariance,
    confirmStatementWriteOff,
    findAttachment,
    findStatement,
    getStatementWriteOffBlocker,
    mapStatementApiStatus = statementPolicyService.mapStatementApiStatus,
    mapVarianceHandlingResult = statementPolicyService.mapVarianceHandlingResult,
    nextId,
    now = () => new Date().toISOString(),
  } = dependencies;
  if (typeof businessDecisionEvidenceService?.prepareDecision !== "function") {
    throw new TypeError("businessDecisionEvidenceService.prepareDecision must be a function");
  }
  for (const [name, value] of Object.entries({
    buildOperationLog,
    buildTodo,
    confirmStatementPayment,
    confirmStatementVariance,
    confirmStatementWriteOff,
    findAttachment,
    findStatement,
    getStatementWriteOffBlocker,
    mapStatementApiStatus,
    mapVarianceHandlingResult,
    nextId,
  })) {
    if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  }

  return {
    settleExactPayment: createStatementExactPaymentCommand({ findStatement, buildOperationLog, now }),
    recordPayment,
    handleVariance,
    writeOffStatement,
  };

  async function recordPayment({ workspace, statementId, body = {}, operatorId }) {
    const statement = findStatement(workspace, statementId);
    if (!statement) return notFound("STATEMENT_NOT_FOUND");
    const idempotencyPayload = { ...body, statementId, attachmentIds: uniqueTextList(body.attachmentIds), operatorId };
    const replay = await workspace.statementPaymentTransactionRepository?.findPaymentReplay?.({ workspace, idempotencyKey: body.idempotencyKey, idempotencyPayload });
    if (replay) return paymentResponse(replay);
    const blocker = getStatementPaymentBlocker(statement);
    if (blocker) return businessError(409, "STATEMENT_PAYMENT_PERIOD_CLOSED", blocker);
    const expectedRevision = requireExpectedRevision(body.expectedRevision);
    if (expectedRevision.error) return expectedRevision.error;
    if(paymentCents(body.amount)===null || paymentCents(statement.receivable,true)===null || paymentCents(statement.received,true)===null) return businessError(422,"STATEMENT_PAYMENT_AMOUNT_INVALID","实收必须为有效金额，账单已有金额须先核实。");
    const attachmentValidation = validatePaymentAttachments({ workspace, statementId, body });
    if (attachmentValidation.error) return attachmentValidation;

    const result = confirmStatementPayment(workspace.statements, statement, {
      amount: body.amount,
      reason: body.remark ?? body.method,
    });
    const nextStatement = {
      ...result.statements.find((item) => item.id === statementId),
      revision: expectedRevision.value,
    };
    const nextStatements = result.statements.map((item) => item.id === statementId ? nextStatement : item);
    const identity = body.idempotencyKey ? createHash("sha256").update(JSON.stringify([statementId, operatorId, body.idempotencyKey])).digest("hex").slice(0, 32) : randomUUID();
    const todo = result.todoInput ? { ...buildTodo(workspace, result.todoInput), id: `T-PAY-${identity}` } : null;
    const paymentRecordId = `PAY-${identity}`;
    const paymentRecord = {
      paymentRecordId,
      bizNo: paymentRecordId,
      statementId,
      customerId: statement.customerId,
      amount: Number(body.amount ?? 0),
      paidAt: body.paidAt ?? now(),
      method: body.method ?? "other",
      status: "recorded",
      attachmentIds: attachmentValidation.attachmentIds,
      operatorId,
      remark: body.remark ?? "",
    };
    const operationLog = buildOperationLog(workspace, {
      targetType: "statement",
      targetId: statementId,
      action: "record_statement_payment",
      id: `LOG-PAY-${identity}`,
      operatorId,
      before: statement,
      after: nextStatement,
    });
    const transaction = await workspace.statementPaymentTransactionRepository.recordStatementPayment({
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload,
      statements: nextStatements,
      statement: nextStatement,
      paymentRecord,
      todo,
      operationLog,
    });
    const committedStatement = resolveCommittedStatement(nextStatement, transaction.statement, expectedRevision.value);
    return success({
      payment: transaction.payment,
      statementStatus: mapStatementApiStatus(committedStatement.status),
      statementRevision: committedStatement.revision,
      varianceAmount: committedStatement.variance,
      todoId: transaction.todo?.id ?? todo?.id,
      operationLogId: transaction.operationLogId,
    });
  }

  async function handleVariance({ workspace, statementId, body = {}, operatorId, actionPermissions = [] }) {
    const statement = findStatement(workspace, statementId);
    if (!statement) return notFound("STATEMENT_NOT_FOUND");
    const settlementPayload={...body,statementId,attachmentIds:uniqueTextList(body.attachmentIds),operatorId};
    const replay=await workspace.statementSettlementTransactionRepository?.findSettlementReplay?.({workspace,scope:"statement.variance.handle",idempotencyKey:body.idempotencyKey,idempotencyPayload:settlementPayload});
    if(replay) return success(buildSettlementReplayResponse(statementId,replay,"handleVariance",businessDecisionEvidenceService,mapStatementApiStatus));
    const periodBlocker = getStatementPaymentBlocker(statement);
    if (periodBlocker) return businessError(409, "STATEMENT_PAYMENT_PERIOD_CLOSED", periodBlocker);
    const attachmentValidation = validatePaymentAttachments({ workspace, statementId, body, maxAttachments: 1 });
    if (attachmentValidation.error) return attachmentValidation;

    const handling=resolveStatementVarianceHandling(body.handlingResult,body.reason);
    if(!handling) return businessError(422,"STATEMENT_VARIANCE_HANDLING_INVALID","请选择明确的差额处理结果，备注不能代替结果。");
    const reason=handling.label;
    const expectedRevision = requireExpectedRevision(body.expectedRevision);
    if (expectedRevision.error) return expectedRevision.error;
    const amounts = validateSettlementAmounts(statement);
    if(amounts.error) return amounts.error;
    const varianceAmount = amounts.variance;
    const hasOpenVarianceTodo = workspace.todos.some(
      (todo) => todo.ref === statementId && todo.type === "收款差额待确认" && !todo.handled,
    );
    const result = confirmStatementVariance(
      workspace.statements,
      statement,
      varianceAmount,
      { reason },
      hasOpenVarianceTodo,
    );
    const nextStatement = {
      ...result.statements.find((item) => item.id === statementId),
      revision: expectedRevision.value,
      varianceHandledAt: now(),
    };
    const nextStatements = result.statements.map((item) => item.id === statementId ? nextStatement : item);
    const todo = result.todoInput ? buildTodo(workspace, result.todoInput) : null;
    const varianceRecord = {
      varianceRecordId: nextId("VAR", workspace.varianceRecords),
      statementId,
      paymentRecordId: body.paymentRecordId ?? "",
      amount: varianceAmount,
      handlingResult: handling.value,
      reason,
      status: "recorded",
      attachmentId: attachmentValidation.attachmentIds[0] ?? "",
      operatorId,
    };
    const operationLog = buildOperationLog(workspace, {
      targetType: "statement",
      targetId: statementId,
      action: "handle_statement_variance",
      operatorId,
      before: statement,
      after: nextStatement,
      reason,
    });
    const decision = prepareFinancialDecision({
      businessDecisionEvidenceService,
      workspace,
      businessType: "statement",
      businessId: statementId,
      decisionScope: "statement_variance",
      operatorId,
      actionPermissions,
      body,
      operationLog,
      authorizationAmount: varianceAmount,
    });
    if (decision.error) return decision;
    operationLog.after = { ...operationLog.after, businessDecisionId: decision.record.id };
    const transaction = await workspace.statementSettlementTransactionRepository.handleStatementVariance({
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, statementId, attachmentIds: attachmentValidation.attachmentIds, operatorId },
      statements: nextStatements,
      statement: nextStatement,
      varianceRecord,
      todo,
      operationLog,
      decisionRecord: decision.record,
      attachmentLinks: decision.attachmentLinks,
    });
    const committedStatement = resolveCommittedStatement(nextStatement, transaction.statement, expectedRevision.value);
    return success({
      varianceRecord: transaction.varianceRecord,
      statementStatus: mapStatementApiStatus(committedStatement.status),
      statementRevision: committedStatement.revision,
      debtAmount: committedStatement.status.includes("欠款") ? varianceAmount : 0,
      todoId: transaction.todo?.id ?? todo?.id,
      operationLogId: transaction.operationLogId,
      businessDecision: businessDecisionEvidenceService.toProjection(transaction.businessDecision ?? decision.record),
    });
  }

  async function writeOffStatement({ workspace, statementId, body = {}, operatorId, actionPermissions = [] }) {
    const statement = findStatement(workspace, statementId);
    if (!statement) return notFound("STATEMENT_NOT_FOUND");
    const settlementPayload={...body,statementId,operatorId};
    const replay=await workspace.statementSettlementTransactionRepository?.findSettlementReplay?.({workspace,scope:"statement.write_off",idempotencyKey:body.idempotencyKey,idempotencyPayload:settlementPayload});
    if(replay) return success(buildSettlementReplayResponse(statementId,replay,"writeOffStatement",businessDecisionEvidenceService,mapStatementApiStatus));
    const periodBlocker = getStatementPaymentBlocker(statement);
    if (periodBlocker) return businessError(409, "STATEMENT_PAYMENT_PERIOD_CLOSED", periodBlocker);
    const expectedRevision = requireExpectedRevision(body.expectedRevision);
    if (expectedRevision.error) return expectedRevision.error;
    if (uniqueTextList(body.attachmentIds).length) {
      return businessError(
        422,
        "STATEMENT_WRITE_OFF_ATTACHMENT_UNSUPPORTED",
        "Write-off attachments are not persisted by this command; link evidence to the payment or variance record first.",
      );
    }
    const amounts = validateSettlementAmounts(statement);
    if(amounts.error) return amounts.error;
    const blockingAmount = amounts.variance;
    const blocker = getStatementWriteOffBlocker(statement, blockingAmount);
    if (blocker) return businessError(409, "STATEMENT_WRITE_OFF_BLOCKED", blocker);
    const result = confirmStatementWriteOff(workspace.statements, statement, blockingAmount);
    const nextStatement = {
      ...result.statements.find((item) => item.id === statementId),
      revision: expectedRevision.value,
    };
    const nextStatements = result.statements.map((item) => item.id === statementId ? nextStatement : item);
    const operationLog = buildOperationLog(workspace, {
      targetType: "statement",
      targetId: statementId,
      action: "write_off_statement",
      operatorId,
      before: statement,
      after: nextStatement,
      reason: body.confirmReason,
    });
    const decision = prepareFinancialDecision({
      businessDecisionEvidenceService,
      workspace,
      businessType: "statement",
      businessId: statementId,
      decisionScope: "statement_write_off",
      operatorId,
      actionPermissions,
      body,
      operationLog,
      authorizationAmount: blockingAmount,
      requireEvidence: true,
    });
    if (decision.error) return decision;
    operationLog.after = { ...operationLog.after, businessDecisionId: decision.record.id };
    const settlementKind = blockingAmount===0 ? "exact_payment" : statement.varianceHandling==="未收差额转欠款" ? "carry_to_debt" : "approved_allowance";
    const writeOffRecordId = nextId("SWO", workspace.statementWriteOffRecords ?? []);
    const writeOffRecord = {
      id: writeOffRecordId,
      statementWriteOffRecordId: writeOffRecordId,
      statementId,
      receivableSnapshot: Number(statement.receivable ?? 0),
      receivedSnapshot: Number(statement.received ?? 0),
      varianceSnapshot: blockingAmount,
      writeOffAmount: settlementKind === "approved_allowance" ? blockingAmount : 0,
      handlingResult: {exact_payment:"足额收款核销",carry_to_debt:"本期确认并转欠款",approved_allowance:"授权抹零并核销"}[settlementKind],
      businessDecisionId: decision.record.id,
      recordedBy: operatorId,
      revision: 1,
      operationLogId: operationLog.id,
      createdAt: now(),
    };
    const transaction = await workspace.statementSettlementTransactionRepository.writeOffStatement({
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, statementId, operatorId },
      statements: nextStatements,
      statement: nextStatement,
      operationLog,
      decisionRecord: decision.record,
      attachmentLinks: decision.attachmentLinks,
      writeOffRecord,
    });
    const committedStatement = resolveCommittedStatement(nextStatement, transaction.statement, expectedRevision.value);
    const variance = Number(committedStatement.variance ?? Math.max(0, committedStatement.receivable - committedStatement.received));
    return success({
      statementId,
      status: mapStatementApiStatus(committedStatement.status),
      statementRevision: committedStatement.revision,
      receivable: Number(committedStatement.receivable ?? 0),
      received: Number(committedStatement.received ?? 0),
      variance,
      debtAmount: committedStatement.status.includes("欠款") ? variance : 0,
      operationLogId: transaction.operationLogId,
      writeOffRecord: transaction.writeOffRecord,
      businessDecision: businessDecisionEvidenceService.toProjection(transaction.businessDecision ?? decision.record),
    });
  }

  function validatePaymentAttachments({ workspace, statementId, body, maxAttachments = Number.POSITIVE_INFINITY }) {
    const attachmentIds = uniqueTextList(body.attachmentIds);
    if (attachmentIds.length > maxAttachments) {
      return businessError(
        422,
        "STATEMENT_VARIANCE_ATTACHMENT_LIMIT",
        "A statement variance record supports at most one attachment.",
      );
    }
    for (const attachmentId of attachmentIds) {
      const validation = validateBusinessAttachment({
        workspace,
        attachmentId,
        findAttachment,
        expectedOwnerType: "statement",
        expectedOwnerId: statementId,
        expectedPurpose: "payment_screenshot",
        requireUploader: true,
        errorCodePrefix: "STATEMENT_PAYMENT_ATTACHMENT",
        label: "statement payment attachment",
      });
      if (!validation.ok) {
        return businessError(validation.statusCode, validation.errorCode, validation.message);
      }
    }
    return { attachmentIds };
  }
}

function prepareFinancialDecision({
  businessDecisionEvidenceService,
  workspace,
  businessType,
  businessId,
  decisionScope,
  operatorId,
  actionPermissions,
  body,
  operationLog,
  authorizationAmount,
  requireEvidence = false,
}) {
  return businessDecisionEvidenceService.prepareDecision({
    workspace,
    businessType,
    businessId,
    decisionScope,
    operatorId,
    actionPermissions,
    delegatedDecision: body.delegatedDecision,
    directDecisionContent: body.directDecisionContent,
    authorizationAmount,
    requireEvidence,
    operationLogId: operationLog.id,
    supersedesDecisionId: String(body.supersedesDecisionId ?? "").trim(),
    idempotencyKey: body.idempotencyKey,
  });
}

function resolveCommittedStatement(requestedStatement, persistedStatement, expectedRevision) {
  return {
    ...requestedStatement,
    ...(persistedStatement ?? {}),
    revision: Math.max(
      Number(persistedStatement?.revision ?? 0),
      Number(expectedRevision ?? 0) + 1,
    ),
  };
}

function requireExpectedRevision(value) {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1) {
    return { error: businessError(422, "EXPECTED_REVISION_REQUIRED", "expectedRevision 必须是当前对账单的正整数版本号。") };
  }
  return { value: revision };
}

function uniqueTextList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => String(item ?? "").trim()).filter(Boolean))];
}

function success(response) {
  return { response };
}

function notFound(code) {
  return { notFound: true, code };
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}

function paymentResponse(transaction) {
  return success({ payment: transaction.payment, statementStatus: statementPolicyService.mapStatementApiStatus(transaction.statement.status), statementRevision: transaction.statement.revision, varianceAmount: transaction.statement.variance, todoId: transaction.todo?.id, operationLogId: transaction.operationLogId });
}

function buildSettlementReplayResponse(statementId,r,kind,evidence,mapStatus) {
 const s=r.statement;return {statementId,status:mapStatus(s.status),statementStatus:mapStatus(s.status),statementRevision:s.revision,receivable:s.receivable,received:s.received,variance:s.variance,varianceRecord:r.varianceRecord,writeOffRecord:r.writeOffRecord,debtAmount:String(s.status).includes('欠款')?s.variance:0,todoId:r.todo?.id,operationLogId:r.operationLogId,businessDecision:evidence.toProjection(r.businessDecision)};
}

function validateSettlementAmounts(statement) {
  const receivable = paymentCents(statement?.receivable, true);
  const received = paymentCents(statement?.received, true);
  if (receivable === null || received === null) return { error: businessError(422, "STATEMENT_SETTLEMENT_AMOUNT_INVALID", "账单应收或已收金额缺失、格式不正确，请先复核账单，不能处理差额或核销。") };
  if (received > receivable) return { error: businessError(409, "STATEMENT_OVERPAYMENT_REQUIRES_RESOLUTION", "本账单存在多收款，请先处理多收，不能作为少收差额核销。") };
  const variance = receivable - received;
  if (statement.variance !== undefined && statement.variance !== null) {
    const declared = paymentCents(statement.variance, true);
    if (declared === null || declared !== variance) return { error: businessError(409, "STATEMENT_VARIANCE_SNAPSHOT_CONFLICT", "账单差额与应收减已收不一致，请先复核账单，不能按旧差额核销。") };
  }
  return { variance: variance / 100 };
}


function paymentCents(value, allowZero = false) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const scaled = Number(value) * 100;
  const cents = Math.round(scaled);
  return Number.isSafeInteger(cents) && cents >= (allowZero ? 0 : 1) && cents <= 99999999999999 && Math.abs(scaled-cents) < 0.000001 ? cents : null;
}
