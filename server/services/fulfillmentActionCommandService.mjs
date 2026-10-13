import { validateBusinessAttachment } from "./businessAttachmentValidationService.mjs";
import { createDeliveryEvidencePolicyService } from "./deliveryEvidencePolicyService.mjs";
import { createInventoryReservationPolicyService } from "./inventoryReservationPolicyService.mjs";
import {
  createFulfillmentActionOrchestrator,
  resolveQuantityVarianceFulfillmentStatus,
  resolveWarehouseExecutionFulfillmentStatus,
} from "./fulfillmentActionOrchestrator.mjs";

const deliveryEvidencePolicyService = createDeliveryEvidencePolicyService();
const inventoryReservationPolicyService = createInventoryReservationPolicyService();

export function createFulfillmentActionCommandService(dependencies = {}) {
  const {
    businessDecisionEvidenceService,
    buildFulfillmentActionRecord,
    buildDriverDeliveryTask,
    buildOperationLog,
    buildTodo,
    confirmFulfillmentException,
    findCustomerName,
    findActiveDriverDeliveryDispatch,
    findAttachmentRecord,
    findDriverDeliveryFulfillment,
    findFulfillment,
    findInventoryItem,
    findOrderLine,
    getDriverDeliveryTaskResponseProjection,
    getFulfillmentSortSequence,
    hasDriverWatermarkEvidence = deliveryEvidencePolicyService.hasDriverWatermarkEvidence,
    isReleasableInventoryReservation = inventoryReservationPolicyService.isReleasableInventoryReservation,
    mapFulfillmentMethod,
    nextId,
    nextPlainId,
    normalizeDeliveryEvidenceReviewStatus = deliveryEvidencePolicyService.normalizeDeliveryEvidenceReviewStatus,
    normalizeTimestamp = deliveryEvidencePolicyService.normalizeTimestamp,
    toInventoryReservationTransactionSummary,
    updateFulfillmentsForAction,
    now = () => new Date(),
  } = dependencies;
  if (typeof businessDecisionEvidenceService?.prepareDecision !== "function") {
    throw new TypeError("businessDecisionEvidenceService.prepareDecision must be a function");
  }
  for (const [name, value] of Object.entries({
    buildFulfillmentActionRecord,
    buildDriverDeliveryTask,
    buildOperationLog,
    buildTodo,
    confirmFulfillmentException,
    findCustomerName,
    findActiveDriverDeliveryDispatch,
    findAttachmentRecord,
    findDriverDeliveryFulfillment,
    findFulfillment,
    findInventoryItem,
    findOrderLine,
    getDriverDeliveryTaskResponseProjection,
    getFulfillmentSortSequence,
    hasDriverWatermarkEvidence,
    isReleasableInventoryReservation,
    mapFulfillmentMethod,
    nextId,
    nextPlainId,
    normalizeDeliveryEvidenceReviewStatus,
    normalizeTimestamp,
    toInventoryReservationTransactionSummary,
    updateFulfillmentsForAction,
  })) {
    requireFunction(value, name);
  }

  function recordFulfillmentAction(workspace, transaction) {
    const fulfillmentId = transaction.fulfillment?.fulfillmentId ?? transaction.fulfillment?.id;
    const current = findFulfillment(workspace, fulfillmentId);
    const expectedRevision = transaction.idempotencyPayload?.expectedRevision;
    const possibleReplay = Boolean(transaction.idempotencyKey)
      && expectedRevision != null
      && Number(expectedRevision) < Number(current?.revision ?? 1);
    const orchestrator = createFulfillmentActionOrchestrator(workspace.fulfillmentActionTransactionRepository);
    return orchestrator.applyAction({
      ...transaction,
      current,
      action: {
        nextStatus: transaction.fulfillment?.status ?? current?.status,
        auditAction: transaction.operationLog?.action,
      },
      body: possibleReplay
        ? { ...transaction.idempotencyPayload, expectedRevision: current.revision }
        : transaction.idempotencyPayload ?? {},
    });
  }

  return {
    createFulfillmentException,
    resolveFulfillmentQuantityVariance,
    handoffPaperOutboundDocument,
    recordWarehouseOutboundExecution,
    updateFulfillmentStatus,
    cancelFulfillment,
    reviewDeliveryEvidence,
    upsertDriverDispatch,
    confirmDriverDeliveryLoaded,
    completeDriverDelivery,
    reportDriverDeliveryException,
    validateDriverTaskAccess,
    buildExceptionRecord,
    buildInventoryMovements,
    emptyInventoryMovements,
  };

  async function createFulfillmentException({ workspace, fulfillmentId, body = {}, operatorId }) {
    const selected = findFulfillment(workspace, fulfillmentId);
    if (!selected) return notFound("FULFILLMENT_NOT_FOUND");
    const modalType = body.exceptionType === "unable_to_outbound" ? "unable" : "mismatch";
    const payload = {
      actualQty: Number(body.actualQty ?? 0),
      reason: body.reasonCode ?? body.reason ?? "other",
    };
    const result = confirmFulfillmentException(workspace.fulfillments, selected, modalType, payload);
    const after = result.fulfillments.find((item) => item.id === fulfillmentId);
    const todo = buildTodo(workspace, {
      ...result.todoInput,
      createdBy: operatorId,
    });
    const fulfillmentException = buildExceptionRecord(workspace, selected, body, modalType, todo, operatorId);
    const operationLog = buildOperationLog(workspace, {
      targetType: "fulfillment",
      targetId: fulfillmentId,
      action: "create_fulfillment_exception",
      operatorId,
      before: selected,
      after,
      reason: payload.reason,
    });
    const transaction = await recordFulfillmentAction(workspace, {
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
      fulfillment: buildFulfillmentActionRecord(workspace, after, {
        operatorId,
        actualQty: payload.actualQty,
      }),
      fulfillmentException,
      todo,
      operationLog,
    });

    return success({
      fulfillmentId,
      status: modalType === "unable" ? "无法出库" : "数量差异待处理",
      todoId: transaction.todo?.id ?? todo.id,
      todoType: transaction.todo?.type ?? todo.type,
      inventoryHoldStatus: "pending_review",
      operationLogId: transaction.operationLogId,
    });
  }

  async function resolveFulfillmentQuantityVariance({
    workspace,
    fulfillmentId,
    body = {},
    operatorId,
    actionPermissions = [],
  }) {
    const before = findFulfillment(workspace, fulfillmentId);
    if (!before) return notFound("FULFILLMENT_NOT_FOUND");
    const expectedRevision = Number(body.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return businessError(422, "EXPECTED_REVISION_REQUIRED", "expectedRevision 必须是当前出库任务的正整数版本号。");
    }
    const resolutionResult = cleanText(body.resolutionResult);
    const allowedResults = ["按实际数量出库", "补货后再出库", "赠送数量", "暂停等待确认", "作废本次出库指令"];
    if (!allowedResults.includes(resolutionResult)) {
      return businessError(422, "FULFILLMENT_QUANTITY_VARIANCE_RESULT_INVALID", "请选择有效的数量差异处理结果。");
    }
    const fulfillmentException = [...(workspace.fulfillmentExceptions ?? [])]
      .filter((record) => cleanText(record.fulfillmentId) === fulfillmentId)
      .filter((record) => cleanText(record.exceptionType) === "quantity_mismatch")
      .filter((record) => !["已解决", "已作废"].includes(cleanText(record.status)))
      .sort((left, right) => String(right.occurredAt ?? right.createdAt ?? "").localeCompare(String(left.occurredAt ?? left.createdAt ?? "")))[0];
    if (!fulfillmentException) {
      return businessError(409, "FULFILLMENT_QUANTITY_VARIANCE_NOT_OPEN", "当前出库任务没有待处理的数量差异。");
    }
    const expectedQty = Math.max(0, Math.trunc(Number(fulfillmentException.expectedQty ?? before.expectedQty ?? before.qty ?? 0)));
    const actualQty = Math.max(0, Math.trunc(Number(fulfillmentException.actualQty ?? before.actualQty ?? 0)));
    const resolvedAt = nowIso(now);
    const after = {
      ...before,
      revision: expectedRevision,
      actualQty,
      status: resolveQuantityVarianceFulfillmentStatus(resolutionResult),
      paperOutboundStatus: resolutionResult === "作废本次出库指令"
        ? "待作废纸单"
        : resolutionResult === "暂停等待确认"
          ? before.paperOutboundStatus
          : "待重新打印",
    };
    const updatedException = {
      ...fulfillmentException,
      status: resolutionResult === "作废本次出库指令" ? "已作废" : "已解决",
      resolutionResult,
      resolvedBy: operatorId,
      resolvedAt,
    };
    const currentTodo = (workspace.todos ?? []).find((todo) =>
      cleanText(todo.id) === cleanText(fulfillmentException.todoId)
      || (!todo.handled && cleanText(todo.ref ?? todo.refId) === fulfillmentId && cleanText(todo.type) === "数量差异待处理"),
    );
    const todo = currentTodo ? {
      ...currentTodo,
      handled: true,
      status: "已处理",
      handledBy: operatorId,
      handledAt: resolvedAt,
      handlingResult: resolutionResult,
      updatedAt: resolvedAt,
    } : null;
    const operationLog = buildOperationLog(workspace, {
      targetType: "fulfillment",
      targetId: fulfillmentId,
      action: "resolve_fulfillment_quantity_variance",
      operatorId,
      before: { fulfillment: before, fulfillmentException, todo: currentTodo ?? null },
      after: { fulfillment: after, fulfillmentException: updatedException, todo },
      reason: cleanText(body.reason) || resolutionResult,
    });
    const decision = businessDecisionEvidenceService.prepareDecision({
      workspace,
      businessType: "fulfillment",
      businessId: fulfillmentId,
      decisionScope: "fulfillment_quantity_variance",
      operatorId,
      actionPermissions,
      delegatedDecision: body.delegatedDecision,
      directDecisionContent: body.directDecisionContent,
      operationLogId: operationLog.id,
      supersedesDecisionId: cleanText(body.supersedesDecisionId),
      idempotencyKey: body.idempotencyKey,
    });
    if (decision.error) return decision;
    operationLog.after.businessDecisionId = decision.record.id;
    const resolutionId = nextPlainId(
      "FQVR",
      `${fulfillmentId}-${(workspace.fulfillmentQuantityVarianceResolutions ?? []).length + 1}`,
    );
    const quantityVarianceResolution = {
      id: resolutionId,
      quantityVarianceResolutionId: resolutionId,
      fulfillmentId,
      fulfillmentExceptionId: cleanText(fulfillmentException.exceptionId ?? fulfillmentException.id),
      expectedQty,
      actualQty,
      resolutionResult,
      businessDecisionId: decision.record.id,
      recordedBy: operatorId,
      revision: 1,
      operationLogId: operationLog.id,
      createdAt: resolvedAt,
      updatedAt: resolvedAt,
    };
    const transaction = await recordFulfillmentAction(workspace, {
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: {
        fulfillmentId,
        expectedRevision,
        resolutionResult,
        reason: cleanText(body.reason),
        delegatedDecision: body.delegatedDecision ?? null,
        directDecisionContent: body.directDecisionContent ?? null,
      },
      fulfillment: buildFulfillmentActionRecord(workspace, after, { operatorId, actualQty }),
      fulfillmentException: updatedException,
      quantityVarianceResolution,
      todo,
      operationLog,
      decisionRecord: decision.record,
      attachmentLinks: decision.attachmentLinks,
    });
    return success({
      fulfillment: transaction.fulfillment,
      fulfillmentException: transaction.fulfillmentException,
      quantityVarianceResolution: transaction.quantityVarianceResolution,
      todo: transaction.todo,
      businessDecision: businessDecisionEvidenceService.toProjection(transaction.businessDecision ?? decision.record),
      inventoryChanged: false,
      statementChanged: false,
      operationLogId: transaction.operationLogId,
    });
  }

  async function handoffPaperOutboundDocument({ workspace, fulfillmentId, body = {}, operatorId }) {
    const before = findFulfillment(workspace, fulfillmentId);
    if (!before) return notFound("FULFILLMENT_NOT_FOUND");
    const revisionError = validateFulfillmentRevision(before, body);
    if (revisionError) return revisionError;
    if (before.legacyStateReviewRequired === true) {
      return businessError(409, "FULFILLMENT_LEGACY_REVIEW_REQUIRED", "Historical fulfillment state must be reviewed before a new paper outbound handoff.");
    }
    const paperDocument = findPaperOutboundDocument(workspace, fulfillmentId, body.paperOutboundDocumentId);
    const paperDocumentError = validatePaperOutboundDocumentVersion(paperDocument, body);
    if (paperDocumentError) return paperDocumentError;
    if (paperDocument.status === "已交库房") {
      return businessError(409, "PAPER_OUTBOUND_ALREADY_HANDED_TO_WAREHOUSE", "This paper outbound document has already been handed to the warehouse.");
    }
    if (paperDocument.status === "已作废") {
      return businessError(409, "PAPER_OUTBOUND_DOCUMENT_VOIDED", "A voided paper outbound document cannot be handed to the warehouse.");
    }
    const printRecord = findFulfillmentPrintRecord(workspace, paperDocument.printRecordId);
    if (!printRecord || !["printed", "reprinted"].includes(String(printRecord.status ?? "").trim())) {
      return businessError(409, "PAPER_OUTBOUND_PRINT_NOT_CONFIRMED", "Paper outbound handoff requires a server-confirmed printed or reprinted document.");
    }

    const handedAt = nowIso(now);
    const nextPaperDocument = {
      ...paperDocument,
      status: "已交库房",
      printedBy: printRecord.operatorId ?? printRecord.printedBy ?? operatorId,
      printedAt: printRecord.printedAt ?? handedAt,
      handedToWarehouseBy: operatorId,
      handedToWarehouseAt: handedAt,
      handoverNote: cleanText(body.note ?? body.handoverNote),
      revision: normalizeRevision(paperDocument.revision) + 1,
      updatedAt: handedAt,
    };
    const after = {
      ...before,
      status: "待库房备货",
      paperOutboundStatus: "已交库房",
      paperOutboundDocumentId: nextPaperDocument.paperOutboundDocumentId ?? nextPaperDocument.id,
      legacyStateReviewRequired: false,
    };
    const operationLog = buildOperationLog(workspace, {
      targetType: "fulfillment",
      targetId: fulfillmentId,
      action: "handoff_paper_outbound_document",
      operatorId,
      before: { fulfillment: before, paperOutboundDocument: paperDocument },
      after: { fulfillment: after, paperOutboundDocument: nextPaperDocument },
      reason: nextPaperDocument.handoverNote || "paper_outbound_handed_to_warehouse",
    });
    const transaction = await recordFulfillmentAction(workspace, {
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
      fulfillment: buildFulfillmentActionRecord(workspace, after, {
        operatorId,
        actualQty: after.actualQty ?? after.qty,
      }),
      paperOutboundDocument: nextPaperDocument,
      operationLog,
    });
    return success({
      fulfillmentId,
      status: transaction.fulfillment?.status ?? after.status,
      paperOutboundDocument: transaction.paperOutboundDocument ?? nextPaperDocument,
      operationLogId: transaction.operationLogId,
    });
  }

  async function recordWarehouseOutboundExecution({ workspace, fulfillmentId, body = {}, operatorId }) {
    const before = findFulfillment(workspace, fulfillmentId);
    if (!before) return notFound("FULFILLMENT_NOT_FOUND");
    const revisionError = validateFulfillmentRevision(before, body);
    if (revisionError) return revisionError;
    if (before.legacyStateReviewRequired === true) {
      return businessError(409, "FULFILLMENT_LEGACY_REVIEW_REQUIRED", "Historical fulfillment state must be reviewed before warehouse execution is recorded.");
    }
    const paperDocument = findPaperOutboundDocument(workspace, fulfillmentId, body.paperOutboundDocumentId);
    const paperDocumentError = validatePaperOutboundDocumentVersion(paperDocument, body);
    if (paperDocumentError) return paperDocumentError;
    if (paperDocument.status !== "已交库房") {
      return businessError(409, "WAREHOUSE_EXECUTION_PAPER_HANDOFF_REQUIRED", "Warehouse execution requires the current paper outbound document to be handed to the warehouse first.");
    }
    const executionResult = normalizeWarehouseExecutionResult(body.result ?? body.executionResult);
    if (!executionResult) {
      return businessError(422, "WAREHOUSE_EXECUTION_RESULT_REQUIRED", "result must be prepared, physical_outbound, quantity_mismatch, or unable_to_outbound.");
    }
    const physicalExecutorEmployeeId = cleanText(body.physicalExecutorEmployeeId);
    if (!physicalExecutorEmployeeId || !findEmployee(workspace, physicalExecutorEmployeeId)) {
      return businessError(422, "WAREHOUSE_PHYSICAL_EXECUTOR_REQUIRED", "A valid physical executor employee ID is required.");
    }
    const feedbackChannel = normalizeFeedbackChannel(body.feedbackChannel);
    if (!feedbackChannel) {
      return businessError(422, "WAREHOUSE_FEEDBACK_CHANNEL_REQUIRED", "feedbackChannel must be 当面、电话、微信、纸面 or 其他.");
    }
    const executedAt = normalizeExecutionTimestamp(body.executedAt, nowIso(now));
    if (!executedAt) return businessError(422, "WAREHOUSE_EXECUTED_AT_INVALID", "executedAt must be a valid timestamp.");

    const expectedQty = Math.max(0, Number(before.qty ?? before.expectedQty ?? 0));
    const suppliedActualQty = body.actualQty === undefined || body.actualQty === null || body.actualQty === ""
      ? null
      : Number(body.actualQty);
    if (suppliedActualQty !== null && (!Number.isFinite(suppliedActualQty) || suppliedActualQty < 0)) {
      return businessError(422, "WAREHOUSE_ACTUAL_QTY_INVALID", "actualQty must be a non-negative number when provided.");
    }
    const actualQty = executionResult === "无法出库" ? 0 : Math.trunc(suppliedActualQty ?? expectedQty);
    if (executionResult === "实物已出库" && actualQty !== expectedQty) {
      return businessError(422, "WAREHOUSE_PHYSICAL_OUTBOUND_QTY_MISMATCH", "A quantity different from the paper instruction must be recorded as 数量不符, not physical outbound.");
    }
    if (executionResult === "数量不符" && actualQty === expectedQty) {
      return businessError(422, "WAREHOUSE_QUANTITY_MISMATCH_REQUIRED", "数量不符 requires an actual quantity different from the paper instruction.");
    }

    const method = mapFulfillmentMethod(before.method);
    const nextStatus = resolveWarehouseExecutionFulfillmentStatus(executionResult, method);
    const after = {
      ...before,
      status: nextStatus,
      actualQty: executionResult === "已备货" ? before.actualQty ?? null : actualQty,
      paperOutboundStatus: "已交库房",
      paperOutboundDocumentId: paperDocument.paperOutboundDocumentId ?? paperDocument.id,
      physicalOutboundAt: executionResult === "实物已出库" ? executedAt : before.physicalOutboundAt ?? "",
      physicalExecutorEmployeeId: executionResult === "实物已出库" ? physicalExecutorEmployeeId : before.physicalExecutorEmployeeId ?? "",
      physicalOutboundDocumentId: executionResult === "实物已出库" ? paperDocument.paperOutboundDocumentId ?? paperDocument.id : before.physicalOutboundDocumentId ?? "",
      physicalOutboundDocumentVersion: executionResult === "实物已出库" ? paperDocument.documentVersion : before.physicalOutboundDocumentVersion ?? 0,
      finalDeliveryStatus: before.finalDeliveryStatus ?? "待最终交付",
      finalDeliveryAt: before.finalDeliveryAt ?? "",
      legacyStateReviewRequired: false,
    };
    const warehouseOutboundExecution = {
      warehouseOutboundExecutionId: nextPlainId(
        "WEX",
        `${fulfillmentId}-${(workspace.warehouseOutboundExecutions ?? []).length + 1}`,
      ),
      fulfillmentId,
      paperOutboundDocumentId: paperDocument.paperOutboundDocumentId ?? paperDocument.id,
      paperDocumentVersion: paperDocument.documentVersion,
      paperDocumentRevision: paperDocument.revision,
      result: executionResult,
      expectedQty,
      actualQty: executionResult === "已备货" ? null : actualQty,
      physicalExecutorEmployeeId,
      feedbackChannel,
      executedAt,
      note: cleanText(body.note ?? body.remark),
      authenticatedOperatorId: operatorId,
      recordedAt: nowIso(now),
      revision: 1,
      createdAt: nowIso(now),
      updatedAt: nowIso(now),
    };
    const exceptionType = executionResult === "数量不符"
      ? "quantity_mismatch"
      : executionResult === "无法出库"
        ? "unable_to_outbound"
        : "";
    const todo = exceptionType
      ? buildWarehouseExecutionTodo(workspace, before, executionResult, actualQty, operatorId)
      : null;
    const fulfillmentException = exceptionType
      ? buildExceptionRecord(
          workspace,
          before,
          {
            exceptionType,
            expectedQty,
            actualQty,
            reasonCode: cleanText(body.reasonCode) || executionResult,
            reason: cleanText(body.reason ?? body.note) || executionResult,
            occurredAt: executedAt,
          },
          executionResult === "无法出库" ? "unable" : "mismatch",
          todo,
          operatorId,
        )
      : null;
    const inventoryMovements = executionResult === "实物已出库"
      ? buildInventoryMovements(workspace, after, {
          actualQty,
          operatorId,
          action: "库房实物出库",
          physicalOutbound: true,
          allowUnreservedInventoryDeduction:
            body.allowUnreservedInventoryDeduction === true || body.inventoryDeductionPolicy === "legacy_stock_match",
        })
      : emptyInventoryMovements(executionResult === "已备货" ? "not_physical_outbound" : "exception_pending_review");
    if (inventoryMovements.error) return businessError(409, inventoryMovements.error.code, inventoryMovements.error.message);
    const operationLog = buildOperationLog(workspace, {
      targetType: "fulfillment",
      targetId: fulfillmentId,
      action: "record_warehouse_outbound_execution",
      operatorId,
      before: { fulfillment: before, paperOutboundDocument: paperDocument },
      after: { fulfillment: after, paperOutboundDocument: paperDocument, warehouseOutboundExecution },
      reason: warehouseOutboundExecution.note || executionResult,
    });
    const transaction = await recordFulfillmentAction(workspace, {
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
      fulfillment: buildFulfillmentActionRecord(workspace, after, {
        operatorId,
        actualQty: after.actualQty,
      }),
      warehouseOutboundExecution,
      fulfillmentException,
      todo,
      inventoryReservations: inventoryMovements.inventoryReservations,
      inventoryLedgerEntries: inventoryMovements.inventoryLedgerEntries,
      inventoryAdjustments: inventoryMovements.inventoryAdjustments,
      operationLog,
    });
    return success({
      fulfillmentId,
      status: transaction.fulfillment?.status ?? after.status,
      warehouseOutboundExecution: transaction.warehouseOutboundExecution ?? warehouseOutboundExecution,
      statementCandidate: false,
      statementId: "",
      inventoryDeductionMode: inventoryMovements.inventoryDeductionMode,
      todoId: transaction.todo?.id ?? todo?.id ?? "",
      operationLogId: transaction.operationLogId,
    });
  }

  async function updateFulfillmentStatus({ workspace, fulfillmentId, action, body = {}, operatorId }) {
    const before = findFulfillment(workspace, fulfillmentId);
    if (!before) return notFound("FULFILLMENT_NOT_FOUND");
    if (!["完成出库/交付", "确认已拉走"].includes(action)) {
      return businessError(
        409,
        "FULFILLMENT_WAREHOUSE_EXECUTION_REQUIRED",
        "Record the current paper document handoff and warehouse execution result before final delivery confirmation.",
      );
    }
    if (body.confirmedFinalDelivery !== true) {
      return businessError(422, "FULFILLMENT_FINAL_CONFIRMATION_REQUIRED", "最终交付必须经过高风险摘要确认后提交。");
    }
    const expectedRevision = Number(body.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return businessError(422, "EXPECTED_REVISION_REQUIRED", "expectedRevision 必须是当前出库任务的正整数版本号。");
    }
    const currentRevision = normalizeRevision(before.revision);
    const possibleReplay = Boolean(before.finalDeliveryAt) && expectedRevision < currentRevision;
    if (!possibleReplay) {
      const revisionError = validateFulfillmentRevision(before, body);
      if (revisionError) return revisionError;
    }
    const method = mapFulfillmentMethod(before.method);
    if (method === "delivery") {
      return businessError(409, "FULFILLMENT_DRIVER_DELIVERY_REQUIRED", "送货任务必须由司机送达确认完成最终交付。");
    }
    if (method === "pickup" && action !== "完成出库/交付") {
      return businessError(422, "FULFILLMENT_FINAL_ACTION_INVALID", "自提任务必须使用最终自提确认。");
    }
    if (method === "express_ltl" && action !== "确认已拉走") {
      return businessError(422, "FULFILLMENT_FINAL_ACTION_INVALID", "快递快运任务必须确认承运方已经拉走。");
    }
    if (!cleanText(before.physicalOutboundAt) || !cleanText(before.physicalOutboundDocumentId)) {
      return businessError(409, "FULFILLMENT_PHYSICAL_OUTBOUND_REQUIRED", "必须先按当前纸质出库单登记库房实物出库。");
    }
    if (before.finalDeliveryAt && !possibleReplay) {
      return businessError(409, "FULFILLMENT_FINAL_DELIVERY_ALREADY_CONFIRMED", "该任务已经完成最终交付确认。");
    }

    const completedAt = nowIso(now);
    const actualQty = Math.max(0, Math.trunc(Number(before.actualQty ?? before.qty ?? 0)));
    const after = {
      ...before,
      revision: expectedRevision,
      status: "已交付",
      finalDeliveryStatus: "已交付",
      finalDeliveryAt: completedAt,
      deliveredAt: completedAt,
      confirmedAt: completedAt,
      confirmedBy: operatorId,
    };
    const statementCandidate = buildFulfillmentStatementCandidate({
      workspace,
      fulfillment: after,
      orderLine: findOrderLine(workspace, after.orderLineId ?? after.lineId),
      actualQty,
      operatorId,
      completedAt,
    });
    const operationLog = buildOperationLog(workspace, {
      targetType: "fulfillment",
      targetId: fulfillmentId,
      action: method === "pickup" ? "confirm_self_pickup_final_delivery" : "confirm_carrier_final_handoff",
      operatorId,
      before,
      after,
      reason: cleanText(body.remark) || (method === "pickup" ? "客户完成最终自提交接" : "承运方完成拉走交接"),
    });
    const transaction = await recordFulfillmentAction(workspace, {
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: {
        fulfillmentId,
        expectedRevision,
        action,
        confirmedFinalDelivery: true,
        remark: cleanText(body.remark),
        operatorId,
      },
      fulfillment: buildFulfillmentActionRecord(workspace, after, {
        operatorId,
        actualQty,
        deliveredAt: completedAt,
        confirmedAt: completedAt,
        confirmedBy: operatorId,
        finalDeliveryStatus: "已交付",
        finalDeliveryAt: completedAt,
      }),
      statementCandidate,
      operationLog,
    });
    return success({
      fulfillmentId,
      status: transaction.fulfillment?.status ?? after.status,
      finalDeliveryStatus: transaction.fulfillment?.finalDeliveryStatus ?? "已交付",
      finalDeliveryAt: transaction.fulfillment?.finalDeliveryAt ?? completedAt,
      statementCandidate: Boolean(statementCandidate),
      statementId: transaction.statement?.id ?? statementCandidate?.statement?.id ?? "",
      inventoryDeductionMode: "already_deducted_at_physical_outbound",
      operationLogId: transaction.operationLogId,
      replayed: transaction.replayed === true,
    });
  }

  async function cancelFulfillment({ workspace, fulfillmentId, body = {}, operatorId }) {
    const before = findFulfillment(workspace, fulfillmentId);
    if (!before) return notFound("FULFILLMENT_NOT_FOUND");
    if (body.fulfillmentId && body.fulfillmentId !== fulfillmentId) {
      return businessError(422, "VALIDATION_ERROR", "fulfillmentId in path and body must match");
    }
    if (!isCancelableFulfillment(before)) {
      return businessError(
        409,
        "FULFILLMENT_NOT_CANCELABLE",
        "Delivered or already-cancelled fulfillment records cannot be cancelled through this route.",
      );
    }

    const canceledAt = body.canceledAt ?? nowIso(now);
    const reason = mapFulfillmentCancelReason(body.reason ?? "office_correction", body.reasonText);
    const after = {
      ...before,
      fulfillmentId: before.fulfillmentId ?? before.id,
      orderLineId: before.orderLineId ?? before.lineId,
      lineId: before.lineId ?? before.orderLineId,
      status: "已取消",
      actualQty: 0,
      canceledAt,
      cancelReason: reason,
      confirmedBy: operatorId,
    };
    const inventoryRelease = buildCancelInventoryRelease(workspace, after, { operatorId, reason });
    const operationLog = buildOperationLog(workspace, {
      targetType: "fulfillment",
      targetId: fulfillmentId,
      action: "cancel_fulfillment",
      operatorId,
      before,
      after: {
        ...after,
        releasedReservationIds: inventoryRelease.inventoryReservations.map((reservation) => reservation.reservationId),
      },
      reason,
    });
    const transaction = await recordFulfillmentAction(workspace, {
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
      fulfillment: buildFulfillmentActionRecord(workspace, after, {
        operatorId,
        actualQty: 0,
        confirmedAt: canceledAt,
      }),
      inventoryReservations: inventoryRelease.inventoryReservations,
      inventoryLedgerEntries: inventoryRelease.inventoryLedgerEntries,
      inventoryAdjustments: inventoryRelease.inventoryAdjustments,
      operationLog,
    });

    return success({
      fulfillmentId,
      orderLineId: transaction.fulfillment?.orderLineId ?? after.orderLineId,
      status: transaction.fulfillment?.status ?? after.status,
      releasedReservations: transaction.inventoryReservations.map(toInventoryReservationTransactionSummary),
      inventoryLedgerIds: transaction.inventoryLedgerEntries.map((entry) => entry.ledgerId),
      operationLogId: transaction.operationLogId,
    });
  }

  async function reviewDeliveryEvidence({ workspace, fulfillmentId, body = {}, operatorId }) {
    const before = findFulfillment(workspace, fulfillmentId);
    if (!before) return notFound("FULFILLMENT_NOT_FOUND");
    if (body.fulfillmentId && body.fulfillmentId !== fulfillmentId) {
      return businessError(422, "VALIDATION_ERROR", "fulfillmentId in path and body must match");
    }
    if (before.method !== "送货") {
      return businessError(
        409,
        "DELIVERY_EVIDENCE_REVIEW_NOT_APPLICABLE",
        "Delivery evidence review only applies to delivery fulfillments.",
      );
    }
    if (!hasDriverWatermarkEvidence(before)) {
      return businessError(
        409,
        "DELIVERY_EVIDENCE_WATERMARK_REQUIRED",
        "Delivery evidence review requires a submitted watermarked delivery photo.",
      );
    }

    const reviewStatus = normalizeDeliveryEvidenceReviewStatus(body.reviewStatus ?? body.decision ?? body.status);
    if (!reviewStatus) {
      return businessError(
        422,
        "DELIVERY_EVIDENCE_REVIEW_STATUS_INVALID",
        "reviewStatus must be approved/reviewed/已复核 or rejected/retake_required/需重拍.",
      );
    }

    const reviewedAt = normalizeTimestamp(body.reviewedAt, nowIso(now));
    const reviewerLabel =
      String(body.reviewerName ?? body.reviewedBy ?? body.reviewerLabel ?? "").trim() ||
      String(operatorId ?? "U-OFFICE-A").trim();
    const reason = String(body.reason ?? body.reasonText ?? body.remark ?? "").trim();
    const issueReason = reviewStatus === "需重拍" ? reason || "水印/定位/照片清晰度需补充" : "";
    const after = {
      ...before,
      deliveryEvidenceReviewStatus: reviewStatus,
      deliveryEvidenceReviewedAt: reviewedAt,
      deliveryEvidenceReviewedBy: reviewerLabel,
      deliveryEvidenceReviewedByUserId: operatorId,
      deliveryEvidenceIssueReason: issueReason,
      deliveryEvidenceReviewRemark: reason,
      deliveryEvidenceReviewUpdatedAt: reviewedAt,
    };
    const todo = reviewStatus === "需重拍" ? buildDeliveryEvidenceRetakeTodo(workspace, after, issueReason, operatorId) : null;
    const operationLog = buildOperationLog(workspace, {
      targetType: "fulfillment",
      targetId: fulfillmentId,
      action: reviewStatus === "需重拍" ? "reject_delivery_evidence" : "review_delivery_evidence",
      operatorId,
      before,
      after,
      reason: issueReason || reason || "delivery_evidence_reviewed",
    });
    const transaction = await recordFulfillmentAction(workspace, {
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
      fulfillment: buildFulfillmentActionRecord(workspace, after, {
        operatorId,
        actualQty: after.actualQty ?? after.qty ?? 0,
        deliveredAt: after.deliveredAt ?? after.completedAt ?? "",
        confirmedAt: after.confirmedAt ?? after.completedAt ?? "",
      }),
      todo,
      operationLog,
    });
    const savedFulfillment = findFulfillment(workspace, fulfillmentId) ?? after;
    return success({
      fulfillmentId,
      reviewStatus,
      reviewedAt,
      reviewedBy: reviewerLabel,
      reviewedByUserId: operatorId,
      issueReason,
      todoId: transaction.todo?.id ?? todo?.id ?? "",
      todoType: transaction.todo?.type ?? todo?.type ?? "",
      task: await getDriverDeliveryTaskResponseProjection(workspace, {
        fulfillmentId,
        operatorId: savedFulfillment.driverId ?? operatorId,
        fallbackFulfillment: savedFulfillment,
      }),
      operationLogId: transaction.operationLogId || operationLog.id,
    });
  }

  async function upsertDriverDispatch({ workspace, fulfillmentId, body = {}, operatorId }) {
    const beforeFulfillment = findFulfillment(workspace, fulfillmentId);
    if (!beforeFulfillment) return notFound("FULFILLMENT_NOT_FOUND");
    if (beforeFulfillment.method !== "送货") {
      return businessError(
        409,
        "FULFILLMENT_DISPATCH_NOT_APPLICABLE",
        "Driver dispatch only applies to delivery fulfillments.",
      );
    }
    if (body.fulfillmentId && body.fulfillmentId !== fulfillmentId) {
      return businessError(422, "VALIDATION_ERROR", "fulfillmentId in path and body must match");
    }

    const driverId = String(body.driverId ?? body.assignedDriverId ?? "").trim();
    if (!driverId) return businessError(422, "VALIDATION_ERROR", "driverId is required.");

    const routeDate = normalizeDateInput(body.routeDate ?? body.deliveryDate);
    if (!routeDate) return businessError(422, "VALIDATION_ERROR", "routeDate must be a valid YYYY-MM-DD date.");

    const routeNo = String(body.routeNo ?? body.routeBatchNo ?? body.route_batch_no ?? "").trim();
    if (!routeNo) return businessError(422, "VALIDATION_ERROR", "routeNo is required.");

    const routeSequence = Math.trunc(Number(body.routeSequence ?? body.stopSequence ?? body.stop_sequence));
    if (!Number.isFinite(routeSequence) || routeSequence <= 0) {
      return businessError(422, "VALIDATION_ERROR", "routeSequence must be greater than 0.");
    }

    const plannedDepartureAt = normalizeOptionalTimestampInput(body.plannedDepartureAt ?? body.departureAt);
    if (plannedDepartureAt === null) {
      return businessError(
        422,
        "VALIDATION_ERROR",
        "plannedDepartureAt must be a valid timestamp when provided.",
      );
    }

    const existingDispatch = findActiveDriverDeliveryDispatch(workspace, fulfillmentId);
    const existingDispatchId = String(existingDispatch.dispatchId ?? existingDispatch.id ?? "").trim();
    const requestedDispatchId = String(body.dispatchId ?? body.id ?? "").trim();
    if (existingDispatchId && requestedDispatchId && requestedDispatchId !== existingDispatchId) {
      return businessError(
        409,
        "DRIVER_DISPATCH_ID_CONFLICT",
        "An active dispatch already exists for this fulfillment; update its revisioned record instead of creating another active dispatch.",
      );
    }

    const assignedAt = normalizeTimestamp(body.assignedAt, nowIso(now));
    const dispatchId =
      existingDispatchId ||
      requestedDispatchId ||
      nextPlainId("DDIS", `${fulfillmentId}-${(workspace.driverDeliveryDispatches ?? []).length + 1}`);
    const dispatch = {
      id: dispatchId,
      dispatchId,
      bizNo: String(body.bizNo ?? existingDispatch.bizNo ?? existingDispatch.biz_no ?? dispatchId).trim() || dispatchId,
      fulfillmentId,
      driverId,
      routeDate,
      routeNo,
      routeBatchNo: routeNo,
      stopSequence: routeSequence,
      routeSequence,
      dispatchStatus: String(body.dispatchStatus ?? existingDispatch.dispatchStatus ?? "已派单").trim() || "已派单",
      plannedDepartureAt: plannedDepartureAt || "",
      assignedBy: operatorId,
      assignedAt,
      remark: String(body.remark ?? "").trim(),
      revision: Math.max(0, Number(existingDispatch.revision ?? 0)),
      createdAt: existingDispatch.createdAt ?? existingDispatch.created_at ?? assignedAt,
      updatedAt: assignedAt,
    };
    const projectedFulfillment = buildFulfillmentDispatchProjection(beforeFulfillment, dispatch);
    const operationLog = buildOperationLog(workspace, {
      targetType: "fulfillment",
      targetId: fulfillmentId,
      action: "update_driver_dispatch",
      operatorId,
      before: {
        fulfillment: beforeFulfillment,
        dispatch: existingDispatchId ? existingDispatch : null,
      },
      after: { fulfillment: projectedFulfillment, dispatch },
      reason: dispatch.remark || "office_driver_dispatch_update",
    });
    const transaction = await workspace.driverDeliveryDispatchRepository.upsertDriverDeliveryDispatch({
      workspace,
      dispatch,
      operationLog,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
    });
    const savedDispatch = transaction.dispatch ?? dispatch;
    const savedFulfillment =
      applyFulfillmentDispatchProjection(workspace, fulfillmentId, savedDispatch) ?? projectedFulfillment;
    const task =
      (await workspace.driverDeliveryTaskReadRepository.getDriverDeliveryTask({
        workspace,
        fulfillmentId,
        operatorId: savedDispatch.driverId,
      })) ??
      buildDriverDeliveryTask(workspace, savedFulfillment, {
        driverId: savedDispatch.driverId,
        sortSequence: getFulfillmentSortSequence(workspace, fulfillmentId),
      });

    return success({
      fulfillmentId,
      dispatch: savedDispatch,
      task,
      operationLogId: transaction.operationLogId || operationLog.id,
    });
  }

  async function confirmDriverDeliveryLoaded({ workspace, fulfillmentId, body = {}, operatorId }) {
    const access = validateDriverTaskAccess(workspace, fulfillmentId, operatorId);
    if (access.errorResult) return access.errorResult;
    const before = access.fulfillment;
    if (body.fulfillmentId && body.fulfillmentId !== fulfillmentId) {
      return businessError(422, "VALIDATION_ERROR", "fulfillmentId in path and body must match");
    }
    if (!isDriverDeliveryLoadable(before)) {
      return businessError(
        409,
        before.status === "已交付" ? "DRIVER_DELIVERY_ALREADY_COMPLETED" : "DRIVER_DELIVERY_NOT_LOADABLE",
        before.status === "已交付"
          ? "Completed delivery tasks cannot be loaded again."
          : "Cancelled or exception delivery tasks must be handled by the office before loading.",
      );
    }
    if (!before.physicalOutboundAt) {
      return businessError(
        409,
        "DRIVER_DELIVERY_WAREHOUSE_OUTBOUND_REQUIRED",
        "Driver loading requires an office-recorded warehouse physical outbound result first.",
      );
    }

    const currentTask = await getDriverDeliveryTaskResponseProjection(workspace, {
      fulfillmentId,
      operatorId,
      fallbackFulfillment: before,
    });
    const packageCheck = validateDriverPackageCheck(currentTask, body.checkedPackageIds);
    if (packageCheck.error) return businessError(422, packageCheck.error.code, packageCheck.error.message);

    const loadedAt = normalizeTimestamp(body.loadedAt, nowIso(now));
    const after = {
      ...before,
      status: "配送中",
      driverStatus: "配送中",
      driverId: operatorId,
      loadedBy: operatorId,
      loadedAt,
      driverRemark: body.remark ?? before.driverRemark ?? "",
    };
    const operationLog = buildOperationLog(workspace, {
      targetType: "fulfillment",
      targetId: fulfillmentId,
      action: "driver_confirm_loaded",
      operatorId,
      before,
      after: {
        ...after,
        checkedPackageIds: packageCheck.checkedPackageIds,
        packageCheckSummary: `${packageCheck.checkedPackageIds.length}/${packageCheck.expectedPackageIds.length}包`,
      },
      reason: body.remark ?? "",
    });
    const transaction = await recordFulfillmentAction(workspace, {
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
      fulfillment: buildFulfillmentActionRecord(workspace, after, {
        operatorId,
        actualQty: after.actualQty ?? after.qty,
        confirmedBy: after.confirmedBy ?? "",
      }),
      operationLog,
    });
    const savedFulfillment = findFulfillment(workspace, fulfillmentId) ?? after;
    return success({
      fulfillmentId,
      status: "配送中",
      task: await getDriverDeliveryTaskResponseProjection(workspace, {
        fulfillmentId,
        operatorId,
        fallbackFulfillment: savedFulfillment,
      }),
      operationLogId: transaction.operationLogId,
    });
  }

  async function completeDriverDelivery({ workspace, fulfillmentId, body = {}, operatorId }) {
    const access = validateDriverTaskAccess(workspace, fulfillmentId, operatorId);
    if (access.errorResult) return access.errorResult;
    const before = access.fulfillment;
    if (body.fulfillmentId && body.fulfillmentId !== fulfillmentId) {
      return businessError(422, "VALIDATION_ERROR", "fulfillmentId in path and body must match");
    }
    const watermarkedPhotoAttachmentId = String(
      body.watermarkedPhotoAttachmentId ?? body.watermarkedPhotoId ?? "",
    ).trim();
    if (!watermarkedPhotoAttachmentId) {
      return businessError(
        422,
        "WATERMARK_PHOTO_REQUIRED",
        "Driver delivery completion requires a persisted watermarked-photo attachment.",
      );
    }
    const isDeliveryEvidenceRetake = before.status === "已交付" && before.deliveryEvidenceReviewStatus === "需重拍";
    if (before.status === "已交付" && !isDeliveryEvidenceRetake) {
      return businessError(
        409,
        "DRIVER_DELIVERY_ALREADY_COMPLETED",
        "This delivery task has already been completed.",
      );
    }
    if (!isDeliveryEvidenceRetake && before.status !== "配送中") {
      return businessError(
        409,
        "DRIVER_DELIVERY_NOT_LOADED",
        "Driver delivery must be confirmed loaded before completion.",
      );
    }

    const evidenceValidation = validateDriverDeliveryEvidenceAttachments({
      workspace,
      fulfillmentId,
      body,
      operatorId,
      watermarkedPhotoAttachmentId,
    });
    if (evidenceValidation.errorResult) return evidenceValidation.errorResult;

    const fulfillments = isDeliveryEvidenceRetake
      ? workspace.fulfillments
      : updateFulfillmentsForAction(workspace.fulfillments, fulfillmentId, "完成送货");
    const baseAfter = fulfillments.find((item) => item.id === fulfillmentId) ?? before;
    const completedAt = normalizeTimestamp(body.completedAt, nowIso(now));
    const actualQty = Math.max(0, Number(body.actualQty ?? baseAfter.actualQty ?? baseAfter.qty ?? 0));
    const watermarkCapturedAt = normalizeTimestamp(
      evidenceValidation.watermarkMetadata.watermarkCapturedAt ??
        body.watermarkCapturedAt ??
        body.watermarkedPhotoCapturedAt,
      completedAt,
    );
    const after = {
      ...baseAfter,
      driverStatus: "已完成",
      driverId: operatorId,
      actualQty,
      receiverName: String(body.receiverName ?? "").trim(),
      paperNoteStatus: String(body.paperNoteStatus ?? "已交回").trim() || "已交回",
      watermarkedPhotoAttached: true,
      watermarkedPhotoAttachmentId,
      watermarkedPhotoUrl: String(evidenceValidation.watermarkAttachment.url ?? "").trim(),
      watermarkId: String(
        evidenceValidation.watermarkMetadata.watermarkId ?? body.watermarkId ?? body.watermarkedPhotoWatermarkId ?? "",
      ).trim(),
      watermarkText: String(evidenceValidation.watermarkMetadata.watermarkText ?? body.watermarkText ?? "").trim(),
      watermarkCapturedAt,
      watermarkLocationLabel: String(
        evidenceValidation.watermarkMetadata.watermarkLocationLabel ??
          body.watermarkLocationLabel ??
          body.locationLabel ??
          "",
      ).trim(),
      watermarkGeoPoint: String(
        evidenceValidation.watermarkMetadata.watermarkGeoPoint ?? body.watermarkGeoPoint ?? body.geoPoint ?? "",
      ).trim(),
      watermarkAddress: String(
        evidenceValidation.watermarkMetadata.watermarkAddress ??
          body.watermarkAddress ??
          body.address ??
          before.address ??
          "",
      ).trim(),
      watermarkOperatorId: operatorId,
      watermarkOperatorName: String(body.watermarkOperatorName ?? "").trim(),
      signaturePhotoAttached: Boolean(evidenceValidation.signatureAttachment),
      signaturePhotoAttachmentId: evidenceValidation.signatureAttachment?.attachmentId ?? "",
      deliveryEvidenceReviewStatus: "待复核",
      deliveryEvidenceReviewedAt: "",
      deliveryEvidenceReviewedBy: "",
      deliveryEvidenceReviewedByUserId: "",
      deliveryEvidenceIssueReason: "",
      deliveryEvidenceReviewRemark: isDeliveryEvidenceRetake ? "司机已补拍，待办公室复核" : "",
      deliveryEvidenceReviewUpdatedAt: completedAt,
      completedAt: isDeliveryEvidenceRetake
        ? baseAfter.completedAt ?? baseAfter.deliveredAt ?? completedAt
        : completedAt,
      deliveredAt: isDeliveryEvidenceRetake ? baseAfter.deliveredAt ?? completedAt : completedAt,
      confirmedAt: isDeliveryEvidenceRetake ? baseAfter.confirmedAt ?? completedAt : completedAt,
      confirmedBy: isDeliveryEvidenceRetake ? baseAfter.confirmedBy ?? operatorId : operatorId,
      finalDeliveryStatus: "已交付",
      finalDeliveryAt: isDeliveryEvidenceRetake ? baseAfter.finalDeliveryAt ?? completedAt : completedAt,
      driverRemark: body.remark ?? baseAfter.driverRemark ?? "",
    };
    const resolvedRetakeTodo = isDeliveryEvidenceRetake
      ? buildResolvedDeliveryEvidenceRetakeTodo(workspace, before, operatorId, completedAt)
      : null;
    const operationLog = buildOperationLog(workspace, {
      targetType: "fulfillment",
      targetId: fulfillmentId,
      action: isDeliveryEvidenceRetake ? "driver_resubmit_delivery_evidence" : "driver_complete_delivery",
      operatorId,
      before,
      after,
      reason:
        body.remark ??
        body.receiverName ??
        (isDeliveryEvidenceRetake ? "driver_delivery_evidence_resubmitted" : "driver_delivery_complete"),
    });
    const inventoryMovements = isDeliveryEvidenceRetake || before.physicalOutboundAt
      ? emptyInventoryMovements(
          isDeliveryEvidenceRetake ? "skipped_delivery_evidence_resubmission" : "already_physical_outbound",
        )
      : buildInventoryMovements(workspace, after, {
          actualQty,
          operatorId,
          action: "完成送货",
          allowUnreservedInventoryDeduction:
            body.allowUnreservedInventoryDeduction === true ||
            body.inventoryDeductionPolicy === "legacy_stock_match",
        });
    if (inventoryMovements.error) {
      return businessError(409, inventoryMovements.error.code, inventoryMovements.error.message);
    }
    const statementCandidate = buildFulfillmentStatementCandidate({
      workspace,
      fulfillment: after,
      orderLine: findOrderLine(workspace, after.orderLineId ?? after.lineId),
      actualQty,
      operatorId,
      completedAt,
    });
    const transaction = await recordFulfillmentAction(workspace, {
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
      fulfillment: buildFulfillmentActionRecord(workspace, after, {
        operatorId,
        actualQty,
        deliveredAt: completedAt,
        confirmedAt: completedAt,
      }),
      inventoryReservations: inventoryMovements.inventoryReservations,
      inventoryLedgerEntries: inventoryMovements.inventoryLedgerEntries,
      inventoryAdjustments: inventoryMovements.inventoryAdjustments,
      statementCandidate,
      todo: resolvedRetakeTodo,
      operationLog,
    });
    const savedFulfillment = findFulfillment(workspace, fulfillmentId) ?? after;
    return success({
      fulfillmentId,
      status: "已完成",
      actualQty,
      statementCandidate: true,
      statementId: transaction.statement?.id ?? statementCandidate?.statement?.id ?? "",
      evidenceResubmission: isDeliveryEvidenceRetake,
      retakeTodoId: transaction.todo?.id ?? resolvedRetakeTodo?.id ?? "",
      inventoryDeductionMode: inventoryMovements.inventoryDeductionMode,
      inventoryLedgerIds: transaction.inventoryLedgerEntries.map((entry) => entry.ledgerId),
      task: await getDriverDeliveryTaskResponseProjection(workspace, {
        fulfillmentId,
        operatorId,
        fallbackFulfillment: savedFulfillment,
      }),
      operationLogId: transaction.operationLogId,
    });
  }

  function validateDriverDeliveryEvidenceAttachments({
    workspace,
    fulfillmentId,
    body,
    operatorId,
    watermarkedPhotoAttachmentId,
  }) {
    const watermarkResult = validateDriverDeliveryEvidenceAttachment({
      workspace,
      attachmentId: watermarkedPhotoAttachmentId,
      fulfillmentId,
      operatorId,
      purpose: "delivery_watermark_photo",
      label: "watermarked delivery photo",
    });
    if (watermarkResult.errorResult) return watermarkResult;

    const signaturePhotoAttachmentId = String(
      body.signaturePhotoAttachmentId ?? body.signaturePhotoId ?? "",
    ).trim();
    if (body.signaturePhotoAttached === true && !signaturePhotoAttachmentId) {
      return {
        errorResult: businessError(
          422,
          "SIGNATURE_PHOTO_ATTACHMENT_REQUIRED",
          "signaturePhotoAttached=true requires a persisted signature-photo attachment.",
        ),
      };
    }
    const signatureResult = signaturePhotoAttachmentId
      ? validateDriverDeliveryEvidenceAttachment({
          workspace,
          attachmentId: signaturePhotoAttachmentId,
          fulfillmentId,
          operatorId,
          purpose: "signature_photo",
          label: "signature photo",
        })
      : { attachment: null };
    if (signatureResult.errorResult) return signatureResult;

    return {
      watermarkAttachment: watermarkResult.attachment,
      signatureAttachment: signatureResult.attachment,
      watermarkMetadata: normalizeDeliveryWatermarkMetadata(watermarkResult.attachment.metadata),
    };
  }

  function validateDriverDeliveryEvidenceAttachment({
    workspace,
    attachmentId,
    fulfillmentId,
    operatorId,
    purpose,
    label,
  }) {
    const validation = validateBusinessAttachment({
      workspace,
      attachmentId,
      findAttachment: findAttachmentRecord,
      expectedOwnerType: "fulfillment",
      expectedOwnerId: fulfillmentId,
      expectedPurpose: purpose,
      expectedUploaderId: operatorId,
      errorCodePrefix: "DELIVERY_EVIDENCE_ATTACHMENT",
      label: `${label} attachment`,
    });
    return validation.ok
      ? { attachment: validation.attachment }
      : {
          errorResult: businessError(
            validation.statusCode,
            validation.errorCode,
            validation.message,
          ),
        };
  }

  async function reportDriverDeliveryException({ workspace, fulfillmentId, body = {}, operatorId }) {
    const access = validateDriverTaskAccess(workspace, fulfillmentId, operatorId);
    if (access.errorResult) return access.errorResult;
    const before = access.fulfillment;
    if (body.fulfillmentId && body.fulfillmentId !== fulfillmentId) {
      return businessError(422, "VALIDATION_ERROR", "fulfillmentId in path and body must match");
    }
    if (before.status === "已交付" || before.status === "已取消") {
      return businessError(
        409,
        "DRIVER_DELIVERY_ALREADY_COMPLETED",
        "Completed or cancelled delivery tasks cannot report delivery exceptions.",
      );
    }
    const reasonText = String(body.reasonText ?? body.reasonCode ?? body.reason ?? "other").trim() || "other";
    const reasonCode = String(body.reasonCode ?? "other").trim() || "other";
    const exceptionOccurredAt = body.occurredAt ?? nowIso(now);
    const after = {
      ...before,
      status: "送货异常",
      driverStatus: "送货异常",
      driverId: operatorId,
      exceptionReasonCode: reasonCode,
      exceptionReason: reasonText,
      exceptionOccurredAt,
      actualQty: Math.max(0, Number(body.actualQty ?? before.actualQty ?? before.qty ?? 0)),
    };
    const orderLine = findOrderLine(workspace, after.lineId ?? after.orderLineId) ?? {};
    const todo = buildTodo(workspace, {
      type: "送货异常待处理",
      customerId: after.customerId,
      ref: fulfillmentId,
      refType: "fulfillment",
      refId: fulfillmentId,
      summary: `${after.goods ?? orderLine.product ?? "送货任务"}：${reasonText}`,
      latest: after.latest ?? orderLine.latest ?? "待确认",
      urgency: "异常",
      impact: "需办公室联系客户、仓库或司机确认下一步",
      createdBy: operatorId,
    });
    const fulfillmentException = buildExceptionRecord(
      workspace,
      before,
      {
        exceptionType: "delivery_exception",
        expectedQty: before.qty,
        actualQty: after.actualQty,
        reasonCode,
        reason: reasonText,
        occurredAt: exceptionOccurredAt,
      },
      "driver_delivery_exception",
      todo,
      operatorId,
    );
    const operationLog = buildOperationLog(workspace, {
      targetType: "fulfillment",
      targetId: fulfillmentId,
      action: "driver_report_delivery_exception",
      operatorId,
      before,
      after,
      reason: reasonText,
    });
    const transaction = await recordFulfillmentAction(workspace, {
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
      fulfillment: buildFulfillmentActionRecord(workspace, after, {
        operatorId,
        actualQty: after.actualQty,
      }),
      fulfillmentException,
      todo,
      operationLog,
    });
    const savedFulfillment = findFulfillment(workspace, fulfillmentId) ?? after;
    return success({
      fulfillmentId,
      status: "送货异常",
      todoId: transaction.todo?.id ?? todo.id,
      todoType: transaction.todo?.type ?? todo.type,
      task: await getDriverDeliveryTaskResponseProjection(workspace, {
        fulfillmentId,
        operatorId,
        fallbackFulfillment: savedFulfillment,
      }),
      operationLogId: transaction.operationLogId,
    });
  }

  function validateDriverTaskAccess(workspace, fulfillmentId, operatorId) {
    const fulfillment = findDriverDeliveryFulfillment(workspace, fulfillmentId);
    if (!fulfillment) return { errorResult: notFound("DRIVER_DELIVERY_TASK_NOT_FOUND") };
    const dispatch = findActiveDriverDeliveryDispatch(workspace, fulfillmentId);
    const dispatchId = String(dispatch.dispatchId ?? dispatch.id ?? "").trim();
    const assignedDriverId = String(dispatch.driverId ?? "").trim();
    if (!dispatchId || !assignedDriverId || assignedDriverId !== String(operatorId ?? "").trim()) {
      return { errorResult: notFound("DRIVER_DELIVERY_TASK_NOT_FOUND") };
    }
    return { fulfillment, dispatch };
  }

  function validateFulfillmentRevision(fulfillment, body) {
    const expectedRevision = Number(body.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return businessError(422, "EXPECTED_REVISION_REQUIRED", "expectedRevision is required for this paper-led outbound action.");
    }
    const currentRevision = normalizeRevision(fulfillment.revision);
    if (expectedRevision !== currentRevision) {
      return businessError(409, "BUSINESS_WRITE_CONFLICT", "This fulfillment was updated by another operator. Reload the latest record before retrying.");
    }
    return null;
  }

  function findPaperOutboundDocument(workspace, fulfillmentId, requestedId) {
    const targetId = cleanText(requestedId);
    const rows = (workspace.paperOutboundDocuments ?? []).filter(
      (item) => cleanText(item.fulfillmentId ?? item.fulfillment_id) === fulfillmentId,
    );
    if (targetId) {
      return rows.find((item) => cleanText(item.paperOutboundDocumentId ?? item.id) === targetId) ?? null;
    }
    return [...rows].sort((left, right) => {
      const versionDelta = Number(right.documentVersion ?? right.document_version ?? 0) - Number(left.documentVersion ?? left.document_version ?? 0);
      if (versionDelta) return versionDelta;
      return String(right.createdAt ?? right.created_at ?? "").localeCompare(String(left.createdAt ?? left.created_at ?? ""));
    })[0] ?? null;
  }

  function validatePaperOutboundDocumentVersion(document, body) {
    if (!document) return businessError(409, "PAPER_OUTBOUND_DOCUMENT_NOT_FOUND", "The current paper outbound document was not found.");
    const expectedVersion = Number(body.paperDocumentVersion ?? body.documentVersion);
    const expectedRevision = Number(body.paperDocumentRevision ?? body.documentRevision);
    const actualVersion = Number(document.documentVersion ?? document.document_version ?? 0);
    const actualRevision = normalizeRevision(document.revision);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1 || !Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return businessError(422, "PAPER_OUTBOUND_DOCUMENT_REVISION_REQUIRED", "paperDocumentVersion and paperDocumentRevision are required.");
    }
    if (expectedVersion !== actualVersion || expectedRevision !== actualRevision) {
      return businessError(409, "BUSINESS_WRITE_CONFLICT", "The paper outbound document was updated or replaced. Reload the current paper document before retrying.");
    }
    return null;
  }

  function findFulfillmentPrintRecord(workspace, printRecordId) {
    const targetId = cleanText(printRecordId);
    return (workspace.printRecords ?? []).find(
      (item) => cleanText(item.printRecordId ?? item.id) === targetId,
    ) ?? null;
  }

  function findEmployee(workspace, employeeId) {
    const targetId = cleanText(employeeId);
    return (workspace.employees ?? []).find(
      (item) => cleanText(item.employeeId ?? item.id) === targetId,
    ) ?? null;
  }

  function normalizeWarehouseExecutionResult(value) {
    const source = cleanText(value);
    return {
      prepared: "已备货",
      "已备货": "已备货",
      physical_outbound: "实物已出库",
      "实物已出库": "实物已出库",
      quantity_mismatch: "数量不符",
      "数量不符": "数量不符",
      unable_to_outbound: "无法出库",
      "无法出库": "无法出库",
    }[source] ?? "";
  }

  function normalizeFeedbackChannel(value) {
    const source = cleanText(value);
    return ["当面", "电话", "微信", "纸面", "其他"].includes(source) ? source : "";
  }

  function normalizeExecutionTimestamp(value, fallback) {
    const source = cleanText(value) || fallback;
    if (!Number.isFinite(Date.parse(source))) return "";
    return new Date(source).toISOString();
  }

  function buildWarehouseExecutionTodo(workspace, fulfillment, result, actualQty, operatorId) {
    const expectedQty = Number(fulfillment.qty ?? fulfillment.expectedQty ?? 0);
    const isUnable = result === "无法出库";
    return buildTodo(workspace, {
      type: isUnable ? "无法出库待处理" : "数量差异待处理",
      customerId: fulfillment.customerId,
      ref: fulfillment.id,
      refType: "fulfillment",
      refId: fulfillment.id,
      summary: isUnable
        ? `${fulfillment.goods ?? fulfillment.id}：库房反馈无法出库`
        : `${fulfillment.goods ?? fulfillment.id}：纸单 ${expectedQty}，库房找到 ${actualQty}`,
      latest: fulfillment.latest ?? fulfillment.latestNeededAt ?? "待确认",
      urgency: "异常",
      impact: "只生成异常待办，未扣库存、未改订单、未生成对账候选",
      createdBy: operatorId,
    });
  }

function cleanText(value) {
  return String(value ?? "").trim();
}

  function normalizeRevision(value) {
    return Math.max(1, Math.trunc(Number(value) || 1));
  }

  function buildExceptionRecord(workspace, selected, body, modalType, todo, operatorId) {
    const reasonCode = String(body.reasonCode ?? body.exceptionReasonCode ?? "").trim();
    const reasonText = String(body.reasonText ?? body.reason ?? reasonCode ?? "other").trim() || "other";
    const occurredAt = body.occurredAt ?? body.createdAt ?? nowIso(now);
    return {
      exceptionId: nextId("FEX", workspace.fulfillmentExceptions),
      fulfillmentId: selected.id,
      exceptionType: body.exceptionType ?? (modalType === "unable" ? "unable_to_outbound" : "quantity_mismatch"),
      expectedQty: Number(body.expectedQty ?? selected.qty ?? 0),
      actualQty: modalType === "unable" ? 0 : Number(body.actualQty ?? 0),
      reasonCode: reasonCode || reasonText,
      reason: reasonText,
      status: "待办公室处理",
      todoId: todo.id,
      reportedBy: operatorId,
      occurredAt,
      createdAt: body.createdAt ?? occurredAt,
    };
  }

  function buildInventoryMovements(workspace, fulfillment, input = {}) {
    const physicalOutbound = input.physicalOutbound === true;
    if (fulfillment.status !== "已交付" && !physicalOutbound) return emptyInventoryMovements("not_delivered");
    const orderLineId = fulfillment.orderLineId ?? fulfillment.lineId ?? "";
    const activeReservations = (workspace.inventoryReservations ?? []).filter(
      (reservation) => reservation.orderLineId === orderLineId && isReleasableInventoryReservation(reservation),
    );
    if (activeReservations.length === 0) {
      return input.allowUnreservedInventoryDeduction
        ? buildUnreservedLegacyInventoryMovements(workspace, fulfillment, input)
        : emptyInventoryMovements("skipped_no_reservation");
    }

    let remainingActualQty = Math.max(0, Number(input.actualQty ?? fulfillment.actualQty ?? fulfillment.qty ?? 0));
    const inventoryReservations = [];
    const inventoryLedgerEntries = [];
    const inventoryAdjustments = [];
    const projectedOnHandByItem = new Map();
    const sourceType = input.action === "确认已拉走"
      ? "fulfillment_pickup"
      : physicalOutbound
        ? "warehouse_physical_outbound"
        : "fulfillment_complete";

    for (const reservation of activeReservations) {
      const reservedQty = Math.max(0, Number(reservation.reservedQty ?? reservation.qty ?? 0));
      if (!reservedQty) continue;
      const deliveredQty = Math.min(remainingActualQty, reservedQty);
      remainingActualQty = Math.max(0, remainingActualQty - deliveredQty);
      inventoryReservations.push({
        ...reservation,
        reservationId: reservation.reservationId ?? reservation.id,
        reservedQty,
        status: "已出库",
      });
      inventoryAdjustments.push({
        inventoryItemId: reservation.inventoryItemId,
        onHandQtyChange: -deliveredQty,
        reservedQtyChange: -reservedQty,
      });
      if (!deliveredQty) continue;

      const inventoryItem = findInventoryItem(workspace, reservation.inventoryItemId);
      const projectedBefore = projectedOnHandByItem.has(reservation.inventoryItemId)
        ? projectedOnHandByItem.get(reservation.inventoryItemId)
        : Number(inventoryItem?.inStock ?? inventoryItem?.onHand ?? 0);
      const projectedAfter = Math.max(0, projectedBefore - deliveredQty);
      projectedOnHandByItem.set(reservation.inventoryItemId, projectedAfter);
      inventoryLedgerEntries.push({
        ledgerId: nextPlainId("LEDGER", `${fulfillment.id}-${reservation.reservationId ?? reservation.id}-OUT`),
        inventoryItemId: reservation.inventoryItemId,
        changeType: "出库扣减",
        qtyBefore: projectedBefore,
        qtyChange: -deliveredQty,
        qtyAfter: projectedAfter,
        sourceType,
        sourceId: fulfillment.id,
        operatorId: input.operatorId ?? "U-OFFICE-A",
        confirmedBy: input.operatorId ?? "U-OFFICE-A",
        reason: physicalOutbound ? "库房实物出库扣减库存" : "完成出库扣减库存",
        remark: physicalOutbound ? `库房实物出库，释放占用 ${reservedQty}` : `释放占用 ${reservedQty}`,
      });
    }

    return { inventoryReservations, inventoryLedgerEntries, inventoryAdjustments, inventoryDeductionMode: "reservation" };
  }

  function emptyInventoryMovements(inventoryDeductionMode = "none") {
    return {
      inventoryReservations: [],
      inventoryLedgerEntries: [],
      inventoryAdjustments: [],
      inventoryDeductionMode,
    };
  }

  function buildUnreservedLegacyInventoryMovements(workspace, fulfillment, input = {}) {
    const fulfillmentId = fulfillment.fulfillmentId ?? fulfillment.id;
    const orderLineId = fulfillment.orderLineId ?? fulfillment.lineId ?? "";
    const orderLine = findOrderLine(workspace, orderLineId);
    const actualQty = Math.max(0, Number(input.actualQty ?? fulfillment.actualQty ?? fulfillment.qty ?? 0));
    if (!orderLine) {
      return inventoryMovementError(
        "LEGACY_FULFILLMENT_ORDER_LINE_NOT_FOUND",
        "Cannot deduct unreserved legacy fulfillment because the order line was not found.",
      );
    }
    if (!actualQty) {
      return inventoryMovementError(
        "LEGACY_FULFILLMENT_ACTUAL_QTY_REQUIRED",
        "Cannot deduct unreserved legacy fulfillment without an actual quantity.",
      );
    }
    if (!isLegacyStockDeductionEligible(orderLine)) {
      return inventoryMovementError(
        "LEGACY_FULFILLMENT_NOT_STOCK_LINE",
        "Unreserved legacy deduction is only allowed for stock/common-goods or printed-stock lines.",
      );
    }
    const inventoryItem = findUniqueMatchingInventory(workspace, orderLine);
    if (!inventoryItem) {
      return inventoryMovementError(
        "LEGACY_FULFILLMENT_INVENTORY_NOT_MATCHED",
        "Cannot deduct unreserved legacy fulfillment because no unique inventory item matched the order line.",
      );
    }

    const onHandBefore = Math.max(0, Number(inventoryItem.inStock ?? inventoryItem.onHand ?? 0));
    const reservedBefore = Math.max(0, Number(inventoryItem.reserved ?? 0));
    const lockedBefore = Math.max(0, Number(inventoryItem.locked ?? inventoryItem.waitingPickupLocked ?? 0));
    const shouldReleaseReserved = shouldReleaseLegacyReservedInventory(orderLine, fulfillment);
    const reservedQtyChange = shouldReleaseReserved ? -Math.min(actualQty, reservedBefore) : 0;
    const availableForUnreserved = Math.max(0, onHandBefore - reservedBefore - lockedBefore);
    if (!shouldReleaseReserved && availableForUnreserved < actualQty) {
      return inventoryMovementError(
        "LEGACY_FULFILLMENT_AVAILABLE_INVENTORY_INSUFFICIENT",
        "Cannot deduct unreserved legacy fulfillment because available inventory is insufficient.",
      );
    }
    if (shouldReleaseReserved && onHandBefore < actualQty) {
      return inventoryMovementError(
        "LEGACY_FULFILLMENT_ON_HAND_INVENTORY_INSUFFICIENT",
        "Cannot deduct unreserved legacy fulfillment because on-hand inventory is insufficient.",
      );
    }

    return {
      inventoryReservations: [],
      inventoryAdjustments: [{ inventoryItemId: inventoryItem.id, onHandQtyChange: -actualQty, reservedQtyChange }],
      inventoryLedgerEntries: [
        {
          ledgerId: nextPlainId("LEDGER", `${fulfillmentId}-LEGACY-OUT`),
          inventoryItemId: inventoryItem.id,
          changeType: "旧单无占用出库扣减",
          qtyBefore: onHandBefore,
          qtyChange: -actualQty,
          qtyAfter: Math.max(0, onHandBefore - actualQty),
          sourceType: input.action === "确认已拉走"
            ? "fulfillment_pickup_legacy"
            : input.physicalOutbound === true
              ? "warehouse_physical_outbound_legacy"
              : "fulfillment_complete_legacy",
          sourceId: fulfillmentId,
          operatorId: input.operatorId ?? "U-OFFICE-A",
          confirmedBy: input.operatorId ?? "U-OFFICE-A",
          reason: "旧单无 reservation，经库存匹配后完成出库扣减",
          remark: shouldReleaseReserved ? `同步释放旧汇总占用 ${Math.abs(reservedQtyChange)}` : "未发现旧汇总占用，仅扣在库",
        },
      ],
      inventoryDeductionMode: shouldReleaseReserved ? "legacy_reserved_stock_match" : "legacy_available_stock_match",
    };
  }

  function inventoryMovementError(code, message) {
    return { ...emptyInventoryMovements("error"), error: { code, message } };
  }

  function buildCancelInventoryRelease(workspace, fulfillment, input = {}) {
    const fulfillmentId = fulfillment.fulfillmentId ?? fulfillment.id;
    const orderLineId = fulfillment.orderLineId ?? fulfillment.lineId ?? "";
    const activeReservations = (workspace.inventoryReservations ?? []).filter(
      (reservation) => reservation.orderLineId === orderLineId && isReleasableInventoryReservation(reservation),
    );
    const inventoryReservations = [];
    const inventoryLedgerEntries = [];
    const inventoryAdjustments = [];
    const projectedReservedByItem = new Map();

    for (const reservation of activeReservations) {
      const reservedQty = Math.max(0, Number(reservation.reservedQty ?? reservation.qty ?? 0));
      if (!reservedQty) continue;
      const reservationId = reservation.reservationId ?? reservation.id;
      const inventoryItem = findInventoryItem(workspace, reservation.inventoryItemId);
      inventoryReservations.push({ ...reservation, reservationId, reservedQty: 0, qty: 0, status: "已释放" });
      inventoryAdjustments.push({ inventoryItemId: reservation.inventoryItemId, reservedQtyChange: -reservedQty });

      const projectedBefore = projectedReservedByItem.has(reservation.inventoryItemId)
        ? projectedReservedByItem.get(reservation.inventoryItemId)
        : Number(inventoryItem?.reserved ?? 0);
      const projectedAfter = Math.max(0, projectedBefore - reservedQty);
      projectedReservedByItem.set(reservation.inventoryItemId, projectedAfter);
      inventoryLedgerEntries.push({
        ledgerId: nextPlainId("LEDGER", `${fulfillmentId}-${reservationId}-CANCEL`),
        inventoryItemId: reservation.inventoryItemId,
        changeType: "取消出库释放占用",
        qtyBefore: projectedBefore,
        qtyChange: -reservedQty,
        qtyAfter: projectedAfter,
        sourceType: "fulfillment_cancel",
        sourceId: fulfillmentId,
        operatorId: input.operatorId ?? "U-OFFICE-A",
        confirmedBy: input.operatorId ?? "U-OFFICE-A",
        reason: input.reason ?? "取消出库任务释放占用",
        remark: `取消出库任务释放占用 ${reservedQty}`,
      });
    }

    return { inventoryReservations, inventoryLedgerEntries, inventoryAdjustments };
  }

  function buildDeliveryEvidenceRetakeTodo(workspace, fulfillment, reason, operatorId) {
    const orderLineId = fulfillment.lineId ?? fulfillment.orderLineId ?? "";
    const existingTodo = (workspace.todos ?? []).find(
      (todo) => todo.type === "照片待重拍" && !todo.handled && (todo.ref === orderLineId || todo.ref === fulfillment.id),
    );
    const customerName = findCustomerName(workspace, fulfillment.customerId);
    const goods = fulfillment.goods ?? (orderLineId || fulfillment.id);
    return buildTodo(workspace, {
      ...(existingTodo ?? {}),
      type: "照片待重拍",
      customerId: fulfillment.customerId ?? "",
      ref: orderLineId || fulfillment.id,
      refType: orderLineId ? "order_line" : "fulfillment",
      refId: orderLineId || fulfillment.id,
      summary: `${customerName} ${goods}：${reason}`,
      latest: fulfillment.latest ?? fulfillment.latestNeededAt ?? "待确认",
      urgency: "异常",
      impact: "需司机补拍水印照片或办公室补充说明",
      createdBy: existingTodo?.createdBy ?? operatorId,
    });
  }

  function buildResolvedDeliveryEvidenceRetakeTodo(workspace, fulfillment, operatorId, handledAt) {
    const orderLineId = fulfillment.lineId ?? fulfillment.orderLineId ?? "";
    const existingTodo = (workspace.todos ?? []).find(
      (todo) =>
        todo.type === "照片待重拍" &&
        !todo.handled &&
        (todo.ref === orderLineId || todo.ref === fulfillment.id),
    );
    if (!existingTodo) return null;
    return {
      ...existingTodo,
      status: "已处理",
      handled: true,
      handledBy: operatorId,
      handledAt,
      handlingResult: "司机已补拍送达水印照片，待办公室复核",
    };
  }

  function buildFulfillmentDispatchProjection(fulfillment, dispatch) {
    if (!fulfillment || !dispatch) return fulfillment;
    return {
      ...fulfillment,
      driverId: dispatch.driverId ?? "",
      routeDate: dispatch.routeDate ?? "",
      routeNo: dispatch.routeNo ?? dispatch.routeBatchNo ?? "",
      routeBatchNo: dispatch.routeBatchNo ?? dispatch.routeNo ?? "",
      routeSequence: Number(dispatch.routeSequence ?? dispatch.stopSequence ?? 0),
      stopSequence: Number(dispatch.stopSequence ?? dispatch.routeSequence ?? 0),
      dispatchStatus: dispatch.dispatchStatus ?? "",
      plannedDepartureAt: dispatch.plannedDepartureAt ?? "",
      dispatchAssignedAt: dispatch.assignedAt ?? dispatch.dispatchAssignedAt ?? "",
      dispatchRemark: dispatch.remark ?? "",
    };
  }

  function applyFulfillmentDispatchProjection(workspace, fulfillmentId, dispatch) {
    const index = (workspace.fulfillments ?? []).findIndex(
      (item) => item.id === fulfillmentId || item.fulfillmentId === fulfillmentId,
    );
    if (index < 0) return null;
    const projected = buildFulfillmentDispatchProjection(workspace.fulfillments[index], dispatch);
    workspace.fulfillments[index] = projected;
    return projected;
  }

  function validateDriverPackageCheck(task, checkedPackageIds) {
    const expectedPackageIds = (task?.packageChecklist ?? [])
      .map((item) => String(item?.packageId ?? item?.id ?? "").trim())
      .filter(Boolean);
    const checked = [...new Set((Array.isArray(checkedPackageIds) ? checkedPackageIds : []).map((id) => String(id ?? "").trim()).filter(Boolean))];
    const expectedSet = new Set(expectedPackageIds);
    const checkedPackageIdsInTask = checked.filter((id) => expectedSet.has(id));
    const missingPackageIds = expectedPackageIds.filter((id) => !checkedPackageIdsInTask.includes(id));
    if (missingPackageIds.length) {
      return {
        error: {
          code: "DRIVER_PACKAGE_CHECK_INCOMPLETE",
          message: `All assigned packages must be checked before loading; ${missingPackageIds.length} package(s) remain unchecked.`,
        },
        expectedPackageIds,
        checkedPackageIds: checkedPackageIdsInTask,
        missingPackageIds,
      };
    }
    return { expectedPackageIds, checkedPackageIds: checkedPackageIdsInTask, missingPackageIds: [] };
  }

  function findUniqueMatchingInventory(workspace, line) {
    const matches = (workspace.inventories ?? []).filter(
      (item) =>
        item.size === line.size &&
        item.color === (line.color ?? line.bagColor) &&
        item.handle === (line.handle ?? line.handleType) &&
        item.style === line.style &&
        !String(item.state ?? "").includes("待处理") &&
        !String(item.state ?? "").includes("报废"),
    );
    return matches.length === 1 ? matches[0] : null;
  }
}

function buildFulfillmentStatementCandidate({ workspace, fulfillment, orderLine, actualQty, operatorId, completedAt }) {
  if (!orderLine || !fulfillment) return null;
  const orderLineId = String(orderLine.id ?? orderLine.orderLineId ?? fulfillment.lineId ?? fulfillment.orderLineId ?? "").trim();
  const customerId = String(orderLine.customerId ?? fulfillment.customerId ?? "").trim();
  if (!orderLineId || !customerId) return null;

  const statements = Array.isArray(workspace.statements) ? workspace.statements : [];
  const alreadyLinked = statements.find((statement) => (statement.lineIds ?? []).includes(orderLineId));
  if (alreadyLinked) {
    return { statement: alreadyLinked, statementLine: null, alreadyLinked: true };
  }

  const eligibleStatement = statements.find((statement) =>
    statement.customerId === customerId &&
    statement.sent !== true &&
    ["待生成", "待发送", "本期待对账"].includes(String(statement.status ?? "").trim()),
  );
  const completedDate = normalizeDateInput(completedAt) || new Date().toISOString().slice(0, 10);
  const amount = calculateDeliveredAmount(orderLine, actualQty);
  const statementId = eligibleStatement?.id ?? createStatementCandidateId(statements, customerId, completedDate);
  const statement = eligibleStatement
    ? {
        ...eligibleStatement,
        receivable: roundMoney(Number(eligibleStatement.receivable ?? 0) + amount),
        lineIds: [...new Set([...(eligibleStatement.lineIds ?? []), orderLineId])],
        revision: Math.max(1, Number(eligibleStatement.revision ?? 1) || 1) + 1,
      }
    : {
        id: statementId,
        customerId,
        status: "待生成",
        receivable: amount,
        received: 0,
        variance: 0,
        period: `${completedDate} 至 ${completedDate}`,
        lineIds: [orderLineId],
        sent: false,
        revision: 1,
        createdBy: operatorId,
        createdAt: completedAt,
      };
  return {
    statement,
    statementLine: {
      id: `STL-${String(fulfillment.id ?? fulfillment.fulfillmentId).replace(/[^a-z0-9-]+/gi, "-")}`,
      statementId,
      orderLineId,
      fulfillmentId: String(fulfillment.id ?? fulfillment.fulfillmentId ?? "").trim(),
      deliveredQty: Math.max(0, Math.trunc(Number(actualQty ?? fulfillment.qty ?? 0))),
      chargeableQty: Math.max(0, Math.trunc(Number(actualQty ?? fulfillment.qty ?? 0))),
      freeQty: 0,
      amount,
      adjustmentAmount: 0,
      finalAmount: amount,
      createdAt: completedAt,
    },
  };
}

function calculateDeliveredAmount(orderLine, actualQty) {
  const orderedQty = Number(orderLine.qty ?? orderLine.originalQty ?? 0);
  const deliveredQty = Number(actualQty ?? orderedQty);
  const orderAmount = Number(orderLine.amount ?? orderLine.finalAmount ?? 0);
  if (!Number.isFinite(orderAmount) || orderAmount <= 0) return 0;
  if (!Number.isFinite(orderedQty) || orderedQty <= 0 || !Number.isFinite(deliveredQty)) return roundMoney(orderAmount);
  return roundMoney(orderAmount * Math.max(0, deliveredQty) / orderedQty);
}

function createStatementCandidateId(statements, customerId, completedDate) {
  const datePart = completedDate.replaceAll("-", "");
  const sequence = String(statements.length + 1).padStart(3, "0");
  return `ST-${datePart}-${customerId}-${sequence}`;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function isLegacyStockDeductionEligible(orderLine) {
  const orderType = String(orderLine.orderType ?? orderLine.order_type ?? "").trim();
  if (orderType.includes("定制") || orderType.includes("外加工")) return false;
  if (orderType.includes("现货") || orderType.includes("通货")) return true;
  const printFlag = String(orderLine.print ?? orderLine.printFlag ?? "").trim();
  return printFlag === "否" || printFlag === "false" || printFlag === "";
}

function shouldReleaseLegacyReservedInventory(orderLine, fulfillment) {
  const values = [
    orderLine.inventory,
    orderLine.inventoryStatus,
    orderLine.status,
    orderLine.lineStatus,
    fulfillment.source,
    fulfillment.status,
  ]
    .map((value) => String(value ?? ""))
    .join(" ");
  return /已占用|待提货锁定|已备货|reserved|locked/i.test(values);
}

function isCancelableFulfillment(fulfillment) {
  const status = String(fulfillment.status ?? "").trim();
  return Boolean(status) && !status.includes("已交付") && !status.includes("已取消");
}

function mapFulfillmentCancelReason(reason, fallback) {
  const reasonMap = {
    customer_cancelled: "客户取消出库",
    outbound_cancelled: "出库任务取消",
    duplicate_fulfillment: "重复出库任务取消",
    stock_recheck_failed: "库存复核后取消出库",
    office_correction: "办公室修正取消出库",
    other: fallback || "其他原因取消出库",
  };
  return reasonMap[reason] ?? fallback ?? reasonMap.office_correction;
}

function isDriverDeliveryLoadable(fulfillment) {
  const status = String(fulfillment?.status ?? "").trim();
  if (!status || status === "已交付" || status === "已取消") return false;
  return !status.includes("异常") && !status.includes("无法") && !status.includes("数量");
}

function normalizeOptionalTimestampInput(value) {
  const timestamp = String(value ?? "").trim();
  if (!timestamp) return "";
  if (!Number.isFinite(Date.parse(timestamp))) return null;
  return new Date(timestamp).toISOString();
}

function normalizeDateInput(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(`${text}T00:00:00.000Z`))) return text;
  if (!Number.isFinite(Date.parse(text))) return "";
  return new Date(text).toISOString().slice(0, 10);
}

function normalizeDeliveryWatermarkMetadata(value) {
  const metadata = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    watermarkId: String(metadata.watermarkId ?? "").trim(),
    watermarkText: String(metadata.watermarkText ?? "").trim(),
    watermarkCapturedAt: String(metadata.watermarkCapturedAt ?? metadata.capturedAt ?? "").trim(),
    watermarkLocationLabel: String(metadata.watermarkLocationLabel ?? metadata.locationLabel ?? "").trim(),
    watermarkGeoPoint: String(metadata.watermarkGeoPoint ?? metadata.geoPoint ?? "").trim(),
    watermarkAddress: String(metadata.watermarkAddress ?? metadata.address ?? "").trim(),
  };
}

function nowIso(now) {
  return new Date(now()).toISOString();
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

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
