import { createInventoryReservationPolicyService } from "./inventoryReservationPolicyService.mjs";

const inventoryReservationPolicyService = createInventoryReservationPolicyService();

export function createOrderLineMutationCommandService(dependencies = {}) {
  const {
    buildOperationLog,
    findInventoryItem,
    findOrderLine,
    isReleasableInventoryReservation = inventoryReservationPolicyService.isReleasableInventoryReservation,
    nextPlainId,
    summarizeOrderLineForChange,
    toInventoryQuantitySnapshot,
    toInventoryReservationTransactionSummary,
    now = () => new Date(),
  } = dependencies;
  for (const [name, value] of Object.entries({
    buildOperationLog,
    findInventoryItem,
    findOrderLine,
    isReleasableInventoryReservation,
    nextPlainId,
    summarizeOrderLineForChange,
    toInventoryQuantitySnapshot,
    toInventoryReservationTransactionSummary,
  })) {
    requireFunction(value, name);
  }

  return {
    voidOrderLine,
    adjustOrderLineQuantity,
  };

  async function voidOrderLine({ workspace, orderLineId, body = {}, operatorId }) {
    const before = findOrderLine(workspace, orderLineId);
    if (!before) return notFound("ORDER_LINE_NOT_FOUND");
    if (body.orderLineId && body.orderLineId !== orderLineId) {
      return businessError(422, "VALIDATION_ERROR", "orderLineId in path and body must match");
    }

    const idempotencyPayload = { ...body, operatorId };
    const replay = await workspace.orderLineVoidTransactionRepository.findIdempotentReplay?.({
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload,
    });
    if (replay) return success(buildVoidResponse(orderLineId, replay));
    if (!isVoidableOrderLine(before, workspace)) {
      return businessError(
        409,
        "ORDER_LINE_NOT_VOIDABLE",
        "Delivered, closed, or production-started order lines cannot be voided directly.",
      );
    }

    const reason = mapOrderLineVoidReason(body.reason ?? "order_cancelled", body.reasonText);
    const voidedAt = body.voidedAt ?? nowIso(now);
    const afterOrderLine = {
      ...before,
      orderLineId: before.orderLineId ?? before.id,
      orderId: before.orderId ?? before.orderNo,
      lineStatus: "已关闭",
      status: "已关闭",
      exceptionTags: appendUniqueText(before.exceptionTags ?? before.exceptions ?? [], "订单已作废"),
      exceptions: appendUniqueText(before.exceptions ?? before.exceptionTags ?? [], "订单已作废"),
      closedAt: voidedAt,
      voidedAt,
      voidedBy: operatorId,
      voidReason: reason,
    };
    const fulfillmentRecords = (workspace.fulfillments ?? [])
      .filter((fulfillment) => (fulfillment.lineId ?? fulfillment.orderLineId) === orderLineId)
      .filter((fulfillment) => !String(fulfillment.status ?? "").includes("已交付"))
      .map((fulfillment) => ({
        ...fulfillment,
        fulfillmentId: fulfillment.fulfillmentId ?? fulfillment.id,
        orderLineId: fulfillment.orderLineId ?? fulfillment.lineId,
        status: "已取消",
        confirmedBy: operatorId,
      }));
    const inventoryRelease = buildOrderLineVoidInventoryRelease(workspace, {
      orderLineId,
      operatorId,
      reason,
    });
    const beforeSummary = summarizeOrderLineForChange(before);
    const afterSummary = summarizeOrderLineForChange(afterOrderLine);
    const orderLineChangeRecord = {
      changeRecordId: nextPlainId(
        "OLCR",
        `${orderLineId}-VOID-${(workspace.orderLineChangeRecords ?? []).length + 1}`,
      ),
      orderLineId,
      changedFields: ["line_status", "void_reason", "inventory_reservation"],
      before: beforeSummary,
      after: afterSummary,
      reason,
      documentReprintRequired: fulfillmentRecords.some(
        (fulfillment) => String(fulfillment.status ?? "") === "已取消",
      ),
      changedBy: operatorId,
      createdAt: voidedAt,
    };
    const operationLog = buildOperationLog(workspace, {
      targetType: "order_line",
      targetId: orderLineId,
      action: "void_order_line",
      operatorId,
      before: beforeSummary,
      after: {
        ...afterSummary,
        releasedReservationIds: inventoryRelease.inventoryReservations.map(
          (reservation) => reservation.reservationId,
        ),
        canceledFulfillmentIds: fulfillmentRecords.map((fulfillment) => fulfillment.fulfillmentId),
      },
      reason,
    });
    const transaction = await workspace.orderLineVoidTransactionRepository.voidOrderLine({
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload,
      expectedOrderLineRevision: Number(before.revision ?? 1),
      orderLine: afterOrderLine,
      fulfillmentRecords,
      inventoryReservations: inventoryRelease.inventoryReservations,
      inventoryAdjustments: inventoryRelease.inventoryAdjustments,
      inventoryLedgerEntries: inventoryRelease.inventoryLedgerEntries,
      orderLineChangeRecord,
      operationLog,
    });

    return success(buildVoidResponse(orderLineId, transaction));
  }

  async function adjustOrderLineQuantity({ workspace, orderLineId, body = {}, operatorId }) {
    const before = findOrderLine(workspace, orderLineId);
    if (!before) return notFound("ORDER_LINE_NOT_FOUND");
    if (body.orderLineId && body.orderLineId !== orderLineId) {
      return businessError(422, "VALIDATION_ERROR", "orderLineId in path and body must match");
    }

    const idempotencyPayload = { ...body, operatorId };
    const replay = await workspace.orderLineQuantityAdjustmentTransactionRepository.findIdempotentReplay?.({
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload,
    });
    if (replay) return success(buildQuantityAdjustmentResponse(orderLineId, replay));
    if (!isVoidableOrderLine(before, workspace)) {
      return businessError(
        409,
        "ORDER_LINE_QUANTITY_NOT_ADJUSTABLE",
        "Delivered, closed, or production-started order lines cannot be quantity-adjusted directly.",
      );
    }

    const previousQty = getOrderLineOriginalQty(before);
    const newQty = Math.trunc(Number(body.newQty ?? body.qty ?? body.originalQty));
    if (!Number.isFinite(newQty) || newQty <= 0) {
      return businessError(422, "VALIDATION_ERROR", "newQty must be a positive integer.");
    }
    if (newQty === previousQty) {
      return businessError(
        409,
        "ORDER_LINE_QUANTITY_UNCHANGED",
        "newQty must be different from the current order quantity.",
      );
    }

    const adjustedAt = body.adjustedAt ?? nowIso(now);
    const reason = mapOrderLineQuantityAdjustmentReason(body.reason ?? "customer_change", body.reasonText);
    const qtyDelta = newQty - previousQty;
    const financialChange = buildFinancialChange(workspace, {
      orderLine: before,
      orderLineId,
      previousQty,
      newQty,
      operatorId,
      reason,
      adjustedAt,
    });
    const afterOrderLine = {
      ...before,
      orderLineId: before.orderLineId ?? before.id,
      orderId: before.orderId ?? before.orderNo,
      originalQty: newQty,
      qty: newQty,
      amount: financialChange.priceSnapshot.finalAmount,
      lineStatus: before.lineStatus ?? before.status ?? "待出库",
      status: before.status ?? before.lineStatus ?? "待出库",
      exceptionTags: before.exceptionTags ?? before.exceptions ?? [],
      exceptions: before.exceptions ?? before.exceptionTags ?? [],
    };
    const fulfillmentRecords = (workspace.fulfillments ?? [])
      .filter((fulfillment) => (fulfillment.lineId ?? fulfillment.orderLineId) === orderLineId)
      .filter((fulfillment) => {
        const status = String(fulfillment.status ?? "");
        return !status.includes("已交付") && !status.includes("已取消");
      })
      .map((fulfillment) => ({
        ...fulfillment,
        fulfillmentId: fulfillment.fulfillmentId ?? fulfillment.id,
        orderLineId: fulfillment.orderLineId ?? fulfillment.lineId,
        expectedQty: newQty,
        qty: newQty,
        confirmedBy: operatorId,
      }));
    const inventoryChange = buildQuantityAdjustmentInventoryChange(workspace, {
      orderLineId,
      previousQty,
      newQty,
      qtyDelta,
      operatorId,
      reason,
    });
    if (!inventoryChange.ok) {
      return businessError(
        inventoryChange.statusCode,
        inventoryChange.code,
        inventoryChange.message,
      );
    }

    const changedFields = ["original_qty"];
    if (fulfillmentRecords.length > 0) changedFields.push("fulfillment_expected_qty");
    if (inventoryChange.inventoryReservations.length > 0) changedFields.push("inventory_reservation");
    changedFields.push("price_snapshot");
    if (financialChange.statementLines.length > 0) changedFields.push("statement_amount");
    const beforeSummary = summarizeOrderLineForChange(before);
    const afterSummary = summarizeOrderLineForChange(afterOrderLine);
    const changeAfter = {
      ...afterSummary,
      previousQty,
      qtyDelta,
      finalAmount: financialChange.priceSnapshot.finalAmount,
      priceSnapshotId: financialChange.priceSnapshot.priceSnapshotId,
      adjustedReservationIds: inventoryChange.inventoryReservations.map(
        (reservation) => reservation.reservationId,
      ),
      adjustedStatementLineIds: financialChange.statementLines.map((line) => line.statementLineId),
    };
    const orderLineChangeRecord = {
      changeRecordId: nextPlainId(
        "OLCR",
        `${orderLineId}-QTY-${newQty}-${(workspace.orderLineChangeRecords ?? []).length + 1}`,
      ),
      orderLineId,
      changedFields,
      before: beforeSummary,
      after: changeAfter,
      reason,
      documentReprintRequired: fulfillmentRecords.length > 0,
      changedBy: operatorId,
      createdAt: adjustedAt,
    };
    const operationLog = buildOperationLog(workspace, {
      targetType: "order_line",
      targetId: orderLineId,
      action: "adjust_order_line_quantity",
      operatorId,
      before: beforeSummary,
      after: {
        ...changeAfter,
        adjustedFulfillmentIds: fulfillmentRecords.map((fulfillment) => fulfillment.fulfillmentId),
        adjustedStatementIds: financialChange.statementRecords.map((statement) => statement.statementId),
      },
      reason,
    });
    const transaction = await workspace.orderLineQuantityAdjustmentTransactionRepository.adjustOrderLineQuantity({
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload,
      expectedOrderLineRevision: Number(before.revision ?? 1),
      orderLine: afterOrderLine,
      fulfillmentRecords,
      priceSnapshots: [financialChange.priceSnapshot],
      inventoryReservations: inventoryChange.inventoryReservations,
      inventoryAdjustments: inventoryChange.inventoryAdjustments,
      inventoryLedgerEntries: inventoryChange.inventoryLedgerEntries,
      statementLines: financialChange.statementLines,
      statementRecords: financialChange.statementRecords,
      orderLineChangeRecord,
      operationLog,
    });

    return success(
      buildQuantityAdjustmentResponse(orderLineId, transaction, {
        previousQty,
        newQty,
        qtyDelta,
        fallbackPriceSnapshot: financialChange.priceSnapshot,
        fallbackStatus: afterOrderLine.lineStatus,
      }),
    );
  }

  function buildVoidResponse(orderLineId, transaction) {
    return {
      orderLineId,
      status: transaction.orderLine?.lineStatus ?? "已关闭",
      releasedReservations: transaction.inventoryReservations.map(toInventoryReservationTransactionSummary),
      canceledFulfillmentIds: transaction.fulfillmentRecords.map((fulfillment) => fulfillment.fulfillmentId),
      inventoryLedgerIds: transaction.inventoryLedgerEntries.map((ledger) => ledger.ledgerId),
      orderLineChangeRecordId: transaction.orderLineChangeRecordId,
      operationLogId: transaction.operationLogId,
    };
  }

  function buildQuantityAdjustmentResponse(orderLineId, transaction, fallback = {}) {
    const previousQty = Number(transaction.previousQty ?? fallback.previousQty ?? 0);
    const newQty = Number(
      transaction.newQty ?? fallback.newQty ?? transaction.orderLine?.originalQty ?? 0,
    );
    const qtyDelta = Number(transaction.qtyDelta ?? fallback.qtyDelta ?? newQty - previousQty);
    const priceSnapshot = transaction.priceSnapshots[0] ?? fallback.fallbackPriceSnapshot ?? null;
    return {
      orderLineId,
      previousQty,
      newQty,
      qtyDelta,
      status: transaction.orderLine?.lineStatus ?? fallback.fallbackStatus ?? "",
      adjustedReservations: transaction.inventoryReservations.map(toInventoryReservationTransactionSummary),
      adjustedFulfillmentIds: transaction.fulfillmentRecords.map((fulfillment) => fulfillment.fulfillmentId),
      inventoryLedgerIds: transaction.inventoryLedgerEntries.map((ledger) => ledger.ledgerId),
      priceSnapshot,
      finalAmount: priceSnapshot?.finalAmount ?? 0,
      adjustedStatementLines: transaction.statementLines,
      adjustedStatements: transaction.statementRecords,
      orderLineChangeRecordId: transaction.orderLineChangeRecordId,
      operationLogId: transaction.operationLogId,
    };
  }

  function buildFinancialChange(workspace, input) {
    const latestSnapshot = findLatestPriceSnapshot(workspace, input.orderLineId);
    const currentAmount = Number(
      latestSnapshot?.finalAmount ?? latestSnapshot?.amount ?? input.orderLine.amount ?? 0,
    );
    const currentChargeableQty = Number(latestSnapshot?.chargeableQty ?? input.previousQty ?? 0);
    const otherFee = Number(latestSnapshot?.otherFee ?? 0);
    const adjustmentAmount = Number(latestSnapshot?.adjustmentAmount ?? 0);
    const variableAmount = currentAmount - otherFee - adjustmentAmount;
    const derivedUnitPrice = currentChargeableQty > 0 ? variableAmount / currentChargeableQty : 0;
    const snapshotComponentUnitPrice =
      Number(latestSnapshot?.bagPrice ?? 0) + Number(latestSnapshot?.printPrice ?? 0);
    const keepSnapshotComponents =
      latestSnapshot &&
      snapshotComponentUnitPrice > 0 &&
      Math.abs(snapshotComponentUnitPrice - derivedUnitPrice) < 0.0001;
    const bagPrice = keepSnapshotComponents ? Number(latestSnapshot.bagPrice ?? 0) : derivedUnitPrice;
    const printPrice = keepSnapshotComponents ? Number(latestSnapshot.printPrice ?? 0) : 0;
    const lineAmount = roundMoney((bagPrice + printPrice) * input.newQty);
    const finalAmount = roundMoney(lineAmount + otherFee + adjustmentAmount);
    const versionNo = getNextQuantityAdjustmentPriceVersion(workspace, input.orderLineId);
    const priceSnapshot = {
      priceSnapshotId: nextPlainId("PS", `${input.orderLineId}-QTY-${versionNo}`),
      orderLineId: input.orderLineId,
      snapshotType: "quantity_adjustment",
      versionNo,
      bagPrice: roundMoney(bagPrice),
      printPrice: roundMoney(printPrice),
      otherFee,
      adjustmentAmount,
      chargeableQty: input.newQty,
      finalAmount,
      amount: finalAmount,
      overrideReason: `订单改量 ${input.previousQty} -> ${input.newQty}，按原订单单价重算`,
      createdBy: input.operatorId,
      createdAt: input.adjustedAt,
    };
    const statementLines = buildAdjustedStatementLines(workspace, {
      orderLineId: input.orderLineId,
      newQty: input.newQty,
      lineAmount,
    });
    return {
      priceSnapshot,
      statementLines,
      statementRecords: buildAdjustedStatementRecords(workspace, statementLines),
    };
  }

  function buildQuantityAdjustmentInventoryChange(workspace, input) {
    const activeReservations = (workspace.inventoryReservations ?? []).filter(
      (reservation) =>
        reservation.orderLineId === input.orderLineId && isReleasableInventoryReservation(reservation),
    );
    return input.qtyDelta < 0
      ? buildQuantityReductionInventoryChange(workspace, activeReservations, input)
      : buildQuantityIncreaseInventoryChange(workspace, activeReservations, input);
  }

  function buildQuantityReductionInventoryChange(workspace, activeReservations, input) {
    const inventoryReservations = [];
    const inventoryAdjustments = [];
    const inventoryLedgerEntries = [];
    const projectedReservedByItem = new Map();
    let remainingReleaseQty = Math.abs(input.qtyDelta);

    for (const reservation of activeReservations) {
      if (remainingReleaseQty <= 0) break;
      const reservedQty = Math.max(0, Number(reservation.reservedQty ?? reservation.qty ?? 0));
      if (!reservedQty) continue;
      const releasedQty = Math.min(reservedQty, remainingReleaseQty);
      const remainingReservedQty = Math.max(0, reservedQty - releasedQty);
      const reservationId = reservation.reservationId ?? reservation.id;
      const inventoryItem = findInventoryItem(workspace, reservation.inventoryItemId);
      if (!inventoryItem) {
        return {
          ok: false,
          statusCode: 404,
          code: "INVENTORY_ITEM_NOT_FOUND",
          message: `Inventory item ${reservation.inventoryItemId} was not found for quantity adjustment.`,
        };
      }

      inventoryReservations.push({
        ...reservation,
        reservationId,
        reservedQty: remainingReservedQty,
        qty: remainingReservedQty,
        status: remainingReservedQty > 0 ? "生效" : "已释放",
        revision: Number(reservation.revision ?? 1),
        expectedReservedQty: reservedQty,
        expectedStatus: reservation.status,
      });
      inventoryAdjustments.push({
        inventoryItemId: reservation.inventoryItemId,
        reservedQtyChange: -releasedQty,
        expectedRevision: Number(inventoryItem.revision ?? 1),
        expectedReservedQty: Number(inventoryItem.reserved ?? 0),
      });
      const projectedBefore = projectedReservedByItem.has(reservation.inventoryItemId)
        ? projectedReservedByItem.get(reservation.inventoryItemId)
        : Number(inventoryItem.reserved ?? 0);
      const projectedAfter = Math.max(0, projectedBefore - releasedQty);
      projectedReservedByItem.set(reservation.inventoryItemId, projectedAfter);
      inventoryLedgerEntries.push({
        ledgerId: nextPlainId(
          "LEDGER",
          `${input.orderLineId}-${reservationId}-QTY-${input.newQty}-${inventoryLedgerEntries.length + 1}`,
        ),
        inventoryItemId: reservation.inventoryItemId,
        changeType: "订单改量释放占用",
        qtyBefore: projectedBefore,
        qtyChange: -releasedQty,
        qtyAfter: projectedAfter,
        sourceType: "order_line_quantity_adjustment",
        sourceId: input.orderLineId,
        operatorId: input.operatorId,
        confirmedBy: input.operatorId,
        reason: input.reason,
        remark: `订单改量 ${input.previousQty} -> ${input.newQty}，释放占用 ${releasedQty}`,
      });
      remainingReleaseQty -= releasedQty;
    }

    return { ok: true, inventoryReservations, inventoryAdjustments, inventoryLedgerEntries };
  }

  function buildQuantityIncreaseInventoryChange(workspace, activeReservations, input) {
    const increaseQty = input.qtyDelta;
    const reservation = activeReservations[0];
    if (!reservation) {
      return {
        ok: false,
        statusCode: 409,
        code: "ORDER_LINE_RESERVATION_REQUIRED_FOR_QUANTITY_INCREASE",
        message: "Quantity increase requires an active inventory reservation to extend.",
      };
    }
    const inventoryItem = findInventoryItem(workspace, reservation.inventoryItemId);
    if (!inventoryItem) {
      return {
        ok: false,
        statusCode: 404,
        code: "INVENTORY_ITEM_NOT_FOUND",
        message: `Inventory item ${reservation.inventoryItemId} was not found for quantity adjustment.`,
      };
    }
    const currentAvailableQty = toInventoryQuantitySnapshot(inventoryItem).available;
    if (currentAvailableQty < increaseQty) {
      return {
        ok: false,
        statusCode: 409,
        code: "AVAILABLE_QTY_NOT_ENOUGH",
        message: `Only ${currentAvailableQty} units are available; ${increaseQty} more units are required.`,
      };
    }

    const reservationId = reservation.reservationId ?? reservation.id;
    const reservedBefore = Math.max(0, Number(reservation.reservedQty ?? reservation.qty ?? 0));
    const reservedAfter = reservedBefore + increaseQty;
    const itemReservedBefore = Number(inventoryItem.reserved ?? 0);
    return {
      ok: true,
      inventoryReservations: [
        {
          ...reservation,
          reservationId,
          reservedQty: reservedAfter,
          qty: reservedAfter,
          status: "生效",
          revision: Number(reservation.revision ?? 1),
          expectedReservedQty: reservedBefore,
          expectedStatus: reservation.status,
        },
      ],
      inventoryAdjustments: [
        {
          inventoryItemId: reservation.inventoryItemId,
          reservedQtyChange: increaseQty,
          expectedRevision: Number(inventoryItem.revision ?? 1),
          expectedReservedQty: itemReservedBefore,
        },
      ],
      inventoryLedgerEntries: [
        {
          ledgerId: nextPlainId("LEDGER", `${input.orderLineId}-${reservationId}-QTY-${input.newQty}`),
          inventoryItemId: reservation.inventoryItemId,
          changeType: "订单改量补占用",
          qtyBefore: itemReservedBefore,
          qtyChange: increaseQty,
          qtyAfter: itemReservedBefore + increaseQty,
          sourceType: "order_line_quantity_adjustment",
          sourceId: input.orderLineId,
          operatorId: input.operatorId,
          confirmedBy: input.operatorId,
          reason: input.reason,
          remark: `订单改量 ${input.previousQty} -> ${input.newQty}，补占用 ${increaseQty}`,
        },
      ],
    };
  }

  function buildOrderLineVoidInventoryRelease(workspace, input) {
    const activeReservations = (workspace.inventoryReservations ?? []).filter(
      (reservation) =>
        reservation.orderLineId === input.orderLineId && isReleasableInventoryReservation(reservation),
    );
    const inventoryReservations = [];
    const inventoryAdjustments = [];
    const inventoryLedgerEntries = [];
    const projectedReservedByItem = new Map();

    for (const reservation of activeReservations) {
      const reservedQty = Math.max(0, Number(reservation.reservedQty ?? reservation.qty ?? 0));
      if (!reservedQty) continue;
      const reservationId = reservation.reservationId ?? reservation.id;
      const inventoryItem = findInventoryItem(workspace, reservation.inventoryItemId);
      inventoryReservations.push({
        ...reservation,
        reservationId,
        reservedQty: 0,
        qty: 0,
        status: "已释放",
        revision: Number(reservation.revision ?? 1),
        expectedReservedQty: reservedQty,
        expectedStatus: reservation.status,
      });
      inventoryAdjustments.push({
        inventoryItemId: reservation.inventoryItemId,
        reservedQtyChange: -reservedQty,
        expectedRevision: Number(inventoryItem?.revision ?? 1),
        expectedReservedQty: Number(inventoryItem?.reserved ?? 0),
      });
      const projectedBefore = projectedReservedByItem.has(reservation.inventoryItemId)
        ? projectedReservedByItem.get(reservation.inventoryItemId)
        : Number(inventoryItem?.reserved ?? 0);
      const projectedAfter = Math.max(0, projectedBefore - reservedQty);
      projectedReservedByItem.set(reservation.inventoryItemId, projectedAfter);
      inventoryLedgerEntries.push({
        ledgerId: nextPlainId("LEDGER", `${input.orderLineId}-${reservationId}-VOID`),
        inventoryItemId: reservation.inventoryItemId,
        changeType: "释放占用",
        qtyBefore: projectedBefore,
        qtyChange: -reservedQty,
        qtyAfter: projectedAfter,
        sourceType: "order_line_void",
        sourceId: input.orderLineId,
        operatorId: input.operatorId,
        confirmedBy: input.operatorId,
        reason: input.reason,
        remark: `订单作废释放占用 ${reservedQty}`,
      });
    }

    return { inventoryReservations, inventoryAdjustments, inventoryLedgerEntries };
  }
}

function isVoidableOrderLine(orderLine, workspace) {
  const status = String(orderLine.status ?? orderLine.lineStatus ?? "").trim();
  if (!status || status.includes("已关闭") || status.includes("已取消") || status.includes("已交付")) return false;
  if (status.includes("丝印") || status.includes("制袋") || status.includes("打包")) return false;
  const orderLineId = orderLine.id ?? orderLine.orderLineId;
  return !(workspace.fulfillments ?? [])
    .filter((fulfillment) => (fulfillment.lineId ?? fulfillment.orderLineId) === orderLineId)
    .some((fulfillment) => String(fulfillment.status ?? "").includes("已交付"));
}

function getOrderLineOriginalQty(orderLine) {
  const qty = Math.trunc(Number(orderLine?.originalQty ?? orderLine?.qty ?? 0));
  return Number.isFinite(qty) ? qty : 0;
}

function findLatestPriceSnapshot(workspace, orderLineId) {
  return [...(workspace.priceSnapshots ?? [])]
    .filter((snapshot) => (snapshot.orderLineId ?? snapshot.order_line_id) === orderLineId)
    .sort((left, right) => {
      const leftCreated = Date.parse(left.createdAt ?? left.created_at ?? "") || 0;
      const rightCreated = Date.parse(right.createdAt ?? right.created_at ?? "") || 0;
      if (rightCreated !== leftCreated) return rightCreated - leftCreated;
      return Number(right.versionNo ?? right.version_no ?? 0) - Number(left.versionNo ?? left.version_no ?? 0);
    })[0] ?? null;
}

function getNextQuantityAdjustmentPriceVersion(workspace, orderLineId) {
  const versions = (workspace.priceSnapshots ?? [])
    .filter((snapshot) => (snapshot.orderLineId ?? snapshot.order_line_id) === orderLineId)
    .filter((snapshot) => (snapshot.snapshotType ?? snapshot.snapshot_type) === "quantity_adjustment")
    .map((snapshot) => Number(snapshot.versionNo ?? snapshot.version_no ?? 0))
    .filter(Number.isFinite);
  return (versions.length ? Math.max(...versions) : 0) + 1;
}

function buildAdjustedStatementLines(workspace, input) {
  return (workspace.statementLines ?? [])
    .filter((line) => (line.orderLineId ?? line.order_line_id) === input.orderLineId)
    .map((line) => {
      const adjustmentAmount = Number(line.adjustmentAmount ?? line.adjustment_amount ?? 0);
      const amount = roundMoney(input.lineAmount);
      return {
        ...line,
        statementLineId: line.statementLineId ?? line.id,
        statementId: line.statementId ?? line.statement_id,
        orderLineId: input.orderLineId,
        deliveredQty: input.newQty,
        chargeableQty: input.newQty,
        freeQty: Number(line.freeQty ?? line.free_qty ?? 0),
        amount,
        adjustmentAmount,
        finalAmount: roundMoney(amount + adjustmentAmount),
        expectedRevision: Number(line.revision ?? 1),
        expectedDeliveredQty: Number(line.deliveredQty ?? line.delivered_qty ?? 0),
        expectedChargeableQty: Number(line.chargeableQty ?? line.chargeable_qty ?? 0),
        expectedFinalAmount: Number(line.finalAmount ?? line.final_amount ?? line.amount ?? 0),
      };
    });
}

function buildAdjustedStatementRecords(workspace, adjustedStatementLines) {
  if (!adjustedStatementLines.length) return [];
  const adjustedById = new Map(
    adjustedStatementLines.map((line) => [line.statementLineId ?? line.id, line]),
  );
  const statementIds = [...new Set(adjustedStatementLines.map((line) => line.statementId).filter(Boolean))];
  return statementIds.map((statementId) => {
    const statement = (workspace.statements ?? []).find(
      (item) => item.id === statementId || item.statementId === statementId,
    ) ?? {};
    const lines = (workspace.statementLines ?? [])
      .filter((line) => (line.statementId ?? line.statement_id) === statementId)
      .map((line) => adjustedById.get(line.statementLineId ?? line.id) ?? line);
    const receivable = roundMoney(
      lines.reduce(
        (sum, line) => sum + Number(line.finalAmount ?? line.final_amount ?? line.amount ?? 0),
        0,
      ),
    );
    const received = Number(statement.received ?? statement.receivedAmount ?? 0);
    return {
      ...statement,
      statementId,
      status: statement.status ?? "",
      receivable,
      received,
      variance: roundMoney(Math.max(0, receivable - received)),
      revision: Number(statement.revision ?? 1),
    };
  });
}

function mapOrderLineVoidReason(reason, fallback) {
  const reasonMap = {
    order_cancelled: "客户取消订单",
    duplicate_order: "重复订单作废",
    recognition_error: "识别错误作废",
    stock_not_available: "库存不足取消",
    management_rejected: "管理拒绝接单",
    qty_changed: "订单改量作废重建",
    customer_rejected: "客户拒绝等待取消",
    other: fallback || "其他原因作废",
  };
  return reasonMap[reason] ?? fallback ?? reasonMap.order_cancelled;
}

function mapOrderLineQuantityAdjustmentReason(reason, fallback) {
  const reasonMap = {
    customer_change: "客户改量",
    recognition_error: "识别数量修正",
    stock_recheck: "库存复核后改量",
    office_correction: "办公室修正数量",
    management_approved: "管理批准改量",
    other: fallback || "其他原因改量",
  };
  return reasonMap[reason] ?? fallback ?? reasonMap.customer_change;
}

function appendUniqueText(values, value) {
  const list = Array.isArray(values)
    ? values.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  if (!list.includes(value)) list.push(value);
  return list;
}

function roundMoney(value) {
  return Math.round(Number(value ?? 0) * 100) / 100;
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
