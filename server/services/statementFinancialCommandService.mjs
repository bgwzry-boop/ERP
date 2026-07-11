import { validateBusinessAttachment } from "./businessAttachmentValidationService.mjs";

export function createStatementFinancialCommandService(dependencies = {}) {
  const {
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
    now = () => new Date().toISOString(),
  } = dependencies;
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
    recordPayment,
    handleVariance,
    writeOffStatement,
  };

  async function recordPayment({ workspace, statementId, body = {}, operatorId }) {
    const statement = findStatement(workspace, statementId);
    if (!statement) return notFound("STATEMENT_NOT_FOUND");
    const attachmentValidation = validatePaymentAttachments({ workspace, statementId, body });
    if (attachmentValidation.error) return attachmentValidation;

    const result = confirmStatementPayment(workspace.statements, statement, {
      amount: body.amount,
      reason: body.remark ?? body.method,
    });
    const nextStatement = result.statements.find((item) => item.id === statementId);
    const todo = result.todoInput ? buildTodo(workspace, result.todoInput) : null;
    const paymentRecordId = nextId("PAY", workspace.paymentRecords);
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
      operatorId,
      before: statement,
      after: nextStatement,
    });
    const transaction = await workspace.statementPaymentTransactionRepository.recordStatementPayment({
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, attachmentIds: attachmentValidation.attachmentIds, operatorId },
      statements: result.statements,
      statement: nextStatement,
      paymentRecord,
      todo,
      operationLog,
    });
    return success({
      payment: transaction.payment,
      statementStatus: mapStatementApiStatus(nextStatement.status),
      varianceAmount: nextStatement.variance,
      todoId: transaction.todo?.id ?? todo?.id,
      operationLogId: transaction.operationLogId,
    });
  }

  async function handleVariance({ workspace, statementId, body = {}, operatorId }) {
    const statement = findStatement(workspace, statementId);
    if (!statement) return notFound("STATEMENT_NOT_FOUND");
    const attachmentValidation = validatePaymentAttachments({ workspace, statementId, body, maxAttachments: 1 });
    if (attachmentValidation.error) return attachmentValidation;

    const reason = mapVarianceHandlingResult(body.handlingResult, body.reason);
    const varianceAmount = Number(
      body.varianceAmount ?? statement.variance ?? Math.max(0, statement.receivable - statement.received),
    );
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
    const nextStatement = result.statements.find((item) => item.id === statementId);
    const todo = result.todoInput ? buildTodo(workspace, result.todoInput) : null;
    const varianceRecord = {
      varianceRecordId: nextId("VAR", workspace.varianceRecords),
      statementId,
      paymentRecordId: body.paymentRecordId ?? "",
      amount: varianceAmount,
      handlingResult: body.handlingResult ?? reason,
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
    const transaction = await workspace.statementSettlementTransactionRepository.handleStatementVariance({
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, attachmentIds: attachmentValidation.attachmentIds, operatorId },
      statements: result.statements,
      statement: nextStatement,
      varianceRecord,
      todo,
      operationLog,
    });
    return success({
      varianceRecord: transaction.varianceRecord,
      statementStatus: mapStatementApiStatus(nextStatement.status),
      debtAmount: nextStatement.status.includes("欠款") ? varianceAmount : 0,
      todoId: transaction.todo?.id ?? todo?.id,
      operationLogId: transaction.operationLogId,
    });
  }

  async function writeOffStatement({ workspace, statementId, body = {}, operatorId }) {
    const statement = findStatement(workspace, statementId);
    if (!statement) return notFound("STATEMENT_NOT_FOUND");
    if (uniqueTextList(body.attachmentIds).length) {
      return businessError(
        422,
        "STATEMENT_WRITE_OFF_ATTACHMENT_UNSUPPORTED",
        "Write-off attachments are not persisted by this command; link evidence to the payment or variance record first.",
      );
    }
    const blockingAmount = Number(statement.variance ?? Math.max(0, statement.receivable - statement.received));
    const blocker = getStatementWriteOffBlocker(statement, blockingAmount);
    if (blocker) return businessError(409, "STATEMENT_WRITE_OFF_BLOCKED", blocker);
    const result = confirmStatementWriteOff(workspace.statements, statement, blockingAmount);
    const nextStatement = result.statements.find((item) => item.id === statementId);
    const operationLog = buildOperationLog(workspace, {
      targetType: "statement",
      targetId: statementId,
      action: "write_off_statement",
      operatorId,
      before: statement,
      after: nextStatement,
      reason: body.confirmReason,
    });
    const transaction = await workspace.statementSettlementTransactionRepository.writeOffStatement({
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
      statements: result.statements,
      statement: nextStatement,
      operationLog,
    });
    const variance = Number(nextStatement.variance ?? Math.max(0, nextStatement.receivable - nextStatement.received));
    return success({
      statementId,
      status: mapStatementApiStatus(nextStatement.status),
      receivable: Number(nextStatement.receivable ?? 0),
      received: Number(nextStatement.received ?? 0),
      variance,
      debtAmount: nextStatement.status.includes("欠款") ? variance : 0,
      operationLogId: transaction.operationLogId,
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
