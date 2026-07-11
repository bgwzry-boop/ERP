export function createFulfillmentActionCommandService(dependencies = {}) {
  const {
    buildFulfillmentActionRecord,
    buildOperationLog,
    buildTodo,
    confirmFulfillmentException,
    findCustomerName,
    findFulfillment,
    findInventoryItem,
    findOrderLine,
    getDriverDeliveryTaskResponseProjection,
    hasDriverWatermarkEvidence,
    isReleasableInventoryReservation,
    mapFulfillmentMethod,
    nextId,
    nextPlainId,
    normalizeDeliveryEvidenceReviewStatus,
    normalizeTimestamp,
    toInventoryReservationTransactionSummary,
    updateFulfillmentsForAction,
    now = () => new Date(),
  } = dependencies;
  for (const [name, value] of Object.entries({
    buildFulfillmentActionRecord,
    buildOperationLog,
    buildTodo,
    confirmFulfillmentException,
    findCustomerName,
    findFulfillment,
    findInventoryItem,
    findOrderLine,
    getDriverDeliveryTaskResponseProjection,
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

  return {
    createFulfillmentException,
    updateFulfillmentStatus,
    cancelFulfillment,
    reviewDeliveryEvidence,
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
    const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
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

  async function updateFulfillmentStatus({ workspace, fulfillmentId, action, body = {}, operatorId }) {
    const before = findFulfillment(workspace, fulfillmentId);
    if (!before) return notFound("FULFILLMENT_NOT_FOUND");
    if (
      action === "确认已拉走" &&
      mapFulfillmentMethod(before.method) === "express_ltl" &&
      (!before.printed || before.status !== "待确认拉走")
    ) {
      return businessError(
        409,
        "FULFILLMENT_PRINT_NOT_CONFIRMED",
        "Express/LTL pickup requires a trusted printed status before confirmation.",
      );
    }
    const fulfillments = updateFulfillmentsForAction(workspace.fulfillments, fulfillmentId, action);
    const after = fulfillments.find((item) => item.id === fulfillmentId);
    const operationLog = buildOperationLog(workspace, {
      targetType: "fulfillment",
      targetId: fulfillmentId,
      action:
        action === "确认已拉走"
          ? "confirm_fulfillment_pickup"
          : action === "标记已备货"
            ? "mark_fulfillment_prepared"
            : "complete_fulfillment",
      operatorId,
      before,
      after,
    });
    const actualQty = Number(body.actualQty ?? after.qty ?? 0);
    const inventoryMovements = buildInventoryMovements(workspace, after, {
      actualQty,
      operatorId,
      action,
      allowUnreservedInventoryDeduction:
        body.allowUnreservedInventoryDeduction === true || body.inventoryDeductionPolicy === "legacy_stock_match",
    });
    if (inventoryMovements.error) {
      return businessError(409, inventoryMovements.error.code, inventoryMovements.error.message);
    }
    const completedAt = body.completedAt ?? body.pickedAt ?? (after.status === "已交付" ? nowIso(now) : "");
    const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
      fulfillment: buildFulfillmentActionRecord(workspace, after, {
        operatorId,
        actualQty,
        deliveredAt: completedAt,
        confirmedAt: after.status === "已交付" ? completedAt : "",
      }),
      inventoryReservations: inventoryMovements.inventoryReservations,
      inventoryLedgerEntries: inventoryMovements.inventoryLedgerEntries,
      inventoryAdjustments: inventoryMovements.inventoryAdjustments,
      operationLog,
    });
    return success({
      fulfillmentId,
      status: after.status,
      actualQty,
      statementCandidate: after.status === "已交付",
      statementId: after.status === "已交付" ? "" : undefined,
      inventoryDeductionMode: inventoryMovements.inventoryDeductionMode,
      inventoryLedgerIds: transaction.inventoryLedgerEntries.map((entry) => entry.ledgerId),
      operationLogId: transaction.operationLogId,
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
    const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
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
    const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
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
    if (fulfillment.status !== "已交付") return emptyInventoryMovements("not_delivered");
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
    const sourceType = input.action === "确认已拉走" ? "fulfillment_pickup" : "fulfillment_complete";

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
        reason: "完成出库扣减库存",
        remark: `释放占用 ${reservedQty}`,
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
          sourceType: input.action === "确认已拉走" ? "fulfillment_pickup_legacy" : "fulfillment_complete_legacy",
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
      summary: `${customerName} ${goods}：${reason}`,
      latest: fulfillment.latest ?? fulfillment.latestNeededAt ?? "待确认",
      urgency: "异常",
      impact: "需司机补拍水印照片或办公室补充说明",
      createdBy: existingTodo?.createdBy ?? operatorId,
    });
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
