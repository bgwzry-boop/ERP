export function createFulfillmentActionCommandService(dependencies = {}) {
  const {
    buildFulfillmentActionRecord,
    buildDriverDeliveryTask,
    buildOperationLog,
    buildTodo,
    confirmFulfillmentException,
    findCustomerName,
    findActiveDriverDeliveryDispatch,
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
    now = () => new Date(),
  } = dependencies;
  for (const [name, value] of Object.entries({
    buildFulfillmentActionRecord,
    buildDriverDeliveryTask,
    buildOperationLog,
    buildTodo,
    confirmFulfillmentException,
    findCustomerName,
    findActiveDriverDeliveryDispatch,
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

  return {
    createFulfillmentException,
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
    const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
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
    if (!hasDriverWatermarkEvidence(body)) {
      return businessError(
        422,
        "WATERMARK_PHOTO_REQUIRED",
        "Driver delivery completion requires a watermarked delivery photo.",
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

    const fulfillments = isDeliveryEvidenceRetake
      ? workspace.fulfillments
      : updateFulfillmentsForAction(workspace.fulfillments, fulfillmentId, "完成送货");
    const baseAfter = fulfillments.find((item) => item.id === fulfillmentId) ?? before;
    const completedAt = normalizeTimestamp(body.completedAt, nowIso(now));
    const actualQty = Math.max(0, Number(body.actualQty ?? baseAfter.actualQty ?? baseAfter.qty ?? 0));
    const watermarkCapturedAt = normalizeTimestamp(
      body.watermarkCapturedAt ?? body.watermarkedPhotoCapturedAt,
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
      watermarkedPhotoAttachmentId: String(
        body.watermarkedPhotoAttachmentId ?? body.watermarkedPhotoId ?? "",
      ).trim(),
      watermarkedPhotoUrl: String(body.watermarkedPhotoUrl ?? "").trim(),
      watermarkId: String(body.watermarkId ?? body.watermarkedPhotoWatermarkId ?? "").trim(),
      watermarkText: String(body.watermarkText ?? "").trim(),
      watermarkCapturedAt,
      watermarkLocationLabel: String(body.watermarkLocationLabel ?? body.locationLabel ?? "").trim(),
      watermarkGeoPoint: String(body.watermarkGeoPoint ?? body.geoPoint ?? "").trim(),
      watermarkAddress: String(body.watermarkAddress ?? body.address ?? before.address ?? "").trim(),
      watermarkOperatorId: operatorId,
      watermarkOperatorName: String(body.watermarkOperatorName ?? "").trim(),
      signaturePhotoAttached: body.signaturePhotoAttached === true,
      signaturePhotoAttachmentId: String(body.signaturePhotoAttachmentId ?? body.signaturePhotoId ?? "").trim(),
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
    const inventoryMovements = isDeliveryEvidenceRetake
      ? emptyInventoryMovements("skipped_delivery_evidence_resubmission")
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
    const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
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
      todo: resolvedRetakeTodo,
      operationLog,
    });
    const savedFulfillment = findFulfillment(workspace, fulfillmentId) ?? after;
    return success({
      fulfillmentId,
      status: "已完成",
      actualQty,
      statementCandidate: true,
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
      ref: after.lineId ?? after.orderLineId,
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
    const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
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
