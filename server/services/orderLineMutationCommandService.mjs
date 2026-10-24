import {hasOrderActiveDocuments} from "../orderMutationDocumentGuard.mjs";
import {hasOrderProductionExecution} from "../orderMutationProductionGuard.mjs";
import { createInventoryReservationPolicyService } from "./inventoryReservationPolicyService.mjs";
import { hasExecutedDelivery } from "../orderMutationDeliveryGuard.mjs";

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
    previewOrderLineQuantity,
  };

  async function voidOrderLine({ workspace: targetWorkspace, orderLineId, body = {}, operatorId }) {
    const workspace = await readCurrentMutationWorkspace(targetWorkspace);
    const before = findOrderLine(workspace, orderLineId);
    if (!before) return notFound("ORDER_LINE_NOT_FOUND");
    if (body.orderLineId && body.orderLineId !== orderLineId) {
      return businessError(422, "VALIDATION_ERROR", "orderLineId in path and body must match");
    }

    const idempotencyPayload = { ...body, orderLineId, operatorId };
    const replay = await workspace.orderLineVoidTransactionRepository.findIdempotentReplay?.({
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload,
    });
    if (replay) return success(buildVoidResponse(orderLineId, replay));
    await refreshMutationGuardSources(workspace);
    const stale = validateReviewedRevision(before, body);
    if (stale) return stale;
    if (hasOrderActiveDocuments(workspace, orderLineId)) return businessError(409, "ERP_ORDER_DOCUMENTS_ACTIVE_CONFLICT", "请先作废旧单据再改单；改单后重印。");
    const groupGuard = validatePrintGroupMutation(workspace, orderLineId);
    if (groupGuard) return groupGuard;
    if (!isVoidableOrderLine(before, workspace)) {
      return businessError(
        409,
        "ORDER_LINE_NOT_VOIDABLE",
        "本单已关闭或已有实际生产、出库或送货，不能直接作废。",
      );
    }
    if ((workspace.statementLines ?? []).some(line => (line.orderLineId ?? line.order_line_id) === orderLineId)) {
      return businessError(409, "ORDER_LINE_HAS_STATEMENT", "本单已关联账单，请由财务办理独立更正；不能作废订单后遗留原应收。");
    }

    const reason = mapOrderLineVoidReason(body.reason ?? "order_cancelled", body.reasonText);
    const voidedAt = nowIso(now);
    const afterOrderLine = {
      ...before,
      orderLineId: before.orderLineId ?? before.id,
      orderId: before.orderId ?? before.orderNo,
      revision: Number(before.revision ?? 1) + 1,
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
      workspace: targetWorkspace,
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

  async function adjustOrderLineQuantity({ workspace: targetWorkspace, orderLineId, body = {}, operatorId }) {
    const workspace = await readCurrentMutationWorkspace(targetWorkspace);
    const before = findOrderLine(workspace, orderLineId);
    if (!before) return notFound("ORDER_LINE_NOT_FOUND");
    if (body.orderLineId && body.orderLineId !== orderLineId) {
      return businessError(422, "VALIDATION_ERROR", "orderLineId in path and body must match");
    }

    const idempotencyPayload = { ...body, orderLineId, operatorId };
    const replay = await workspace.orderLineQuantityAdjustmentTransactionRepository.findIdempotentReplay?.({
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload,
    });
    if (replay) return success(buildQuantityAdjustmentResponse(orderLineId, replay));
    await refreshMutationGuardSources(workspace);
    const stale = validateReviewedRevision(before, body);
    if (stale) return stale;
    if (hasOrderActiveDocuments(workspace, orderLineId)) return businessError(409, "ERP_ORDER_DOCUMENTS_ACTIVE_CONFLICT", "请先作废旧单据再改单；改单后重印。");
    const groupGuard = validatePrintGroupMutation(workspace, orderLineId);
    if (groupGuard) return groupGuard;
    if (!isVoidableOrderLine(before, workspace)) {
      return businessError(
        409,
        "ORDER_LINE_QUANTITY_NOT_ADJUSTABLE",
        "本单已关闭或已有实际生产、出库或送货，不能直接改量。",
      );
    }

    const previousQty = getOrderLineOriginalQty(before);
    const requestedQty=body.newQty ?? body.qty ?? body.originalQty;
    const newQty=Number(requestedQty);
    if (!["number","string"].includes(typeof requestedQty) || !Number.isSafeInteger(newQty) || newQty <= 0) {
      return businessError(422, "VALIDATION_ERROR", "新数量须为大于零的有效整数，不能自动取整。");
    }
    if (newQty === previousQty) {
      return businessError(
        409,
        "ORDER_LINE_QUANTITY_UNCHANGED",
        "newQty must be different from the current order quantity.",
      );
    }

    const activeFulfillments = (workspace.fulfillments ?? []).filter(item =>
      (item.lineId ?? item.orderLineId) === orderLineId && !/已交付|已取消/.test(String(item.status ?? "")));
    const linkedStatementLines = (workspace.statementLines ?? []).filter(item =>
      (item.orderLineId ?? item.order_line_id) === orderLineId);
    if (activeFulfillments.length > 1 || linkedStatementLines.length > 1) {
      return businessError(409, "ORDER_LINE_SPLIT_ALLOCATION_REQUIRED", "该订单已关联多批交付或多条账单，需先明确各批数量与金额分配，不能直接整单改量。");
    }
    const adjustedAt = nowIso(now);
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
    if (financialChange.error) return financialChange;
    if (body.expectedFinalAmount !== undefined && (!Number.isFinite(body.expectedFinalAmount) || roundMoney(body.expectedFinalAmount) !== financialChange.priceSnapshot.finalAmount)) return businessError(409, "ORDER_LINE_REVIEW_AMOUNT_CHANGED", "改量金额已变化，请重新核对后确认，尚未修改订单。");
    const afterOrderLine = {
      ...before,
      orderLineId: before.orderLineId ?? before.id,
      orderId: before.orderId ?? before.orderNo,
      revision: Number(before.revision ?? 1) + 1,
      originalQty: newQty,
      qty: newQty,
      amount: financialChange.priceSnapshot.finalAmount,
      lineStatus: (workspace.productionTasks??[]).some(task=>(task.orderLineId??task.lineId)===orderLineId&&!["已取消","已作废"].includes(task.taskStatus??task.status))?"待排产":before.lineStatus ?? before.status ?? "待出库",
      status: (workspace.productionTasks??[]).some(task=>(task.orderLineId??task.lineId)===orderLineId&&!["已取消","已作废"].includes(task.taskStatus??task.status))?"待排产":before.status ?? before.lineStatus ?? "待出库",
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
        actualQty: null,
        actual_qty: null,
        status: ["已备货", "待库房备货"].includes(fulfillment.status) ? "待出库" : fulfillment.status,
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
      workspace: targetWorkspace,
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

  async function previewOrderLineQuantity({ workspace: source, orderLineId, body = {}, operatorId }) {
    const workspace = await readCurrentMutationWorkspace(source);
    await refreshMutationGuardSources(workspace);
    const before = findOrderLine(workspace, orderLineId);
    if (!before) return notFound("ORDER_LINE_NOT_FOUND");
    const stale = validateReviewedRevision(before, body);
    if (stale) return stale;
    if (hasOrderActiveDocuments(workspace, orderLineId)) return businessError(409, "ERP_ORDER_DOCUMENTS_ACTIVE_CONFLICT", "请先作废旧单据再改单；改单后重印。");
    const groupGuard = validatePrintGroupMutation(workspace, orderLineId);
    if (groupGuard) return groupGuard;
    if (!isVoidableOrderLine(before, workspace)) return businessError(409, "ORDER_LINE_QUANTITY_NOT_ADJUSTABLE", "本单已有生产或实际交付，不能直接改量。");
    const newQty = Number(body.newQty);
    const previousQty = getOrderLineOriginalQty(before);
    if (!Number.isSafeInteger(newQty) || newQty <= 0 || newQty === previousQty) return businessError(422, "VALIDATION_ERROR", "请填写与原数量不同的正整数。");
    const value = buildFinancialChange(workspace, {orderLine: before, orderLineId, previousQty, newQty, operatorId, reason:"改量预览", adjustedAt:nowIso(now)});
    if (value.error) return value;
    return success({orderLineId, revision:Number(before.revision ?? 1), previousQty, newQty,
      previousAmount:Number(findLatestPriceSnapshot(workspace,orderLineId)?.finalAmount ?? before.amount), finalAmount:value.priceSnapshot.finalAmount,
      priceSnapshotId:value.priceSnapshot.priceSnapshotId, readOnly:true});
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
    if (latestSnapshot?.ambiguous) return businessError(409, "ORDER_LINE_PRICE_SOURCE_AMBIGUOUS", "最新价格记录存在无法判定先后的不同来源，请先复核价格依据，未修改数量或账单。");
    const rawAmount = latestSnapshot && Object.hasOwn(latestSnapshot, "finalAmount") ? latestSnapshot.finalAmount
      : latestSnapshot && Object.hasOwn(latestSnapshot, "amount") ? latestSnapshot.amount : input.orderLine.amount;
    const numeric = value => ["number", "string"].includes(typeof value) && String(value).trim() ? Number(value) : NaN;
    const currentAmount = numeric(rawAmount);
    const currentChargeableQty = numeric(latestSnapshot?.chargeableQty === undefined ? input.previousQty : latestSnapshot.chargeableQty);
    const otherFee = latestSnapshot?.otherFee === undefined ? 0 : numeric(latestSnapshot.otherFee);
    const adjustmentAmount = latestSnapshot?.adjustmentAmount === undefined ? 0 : numeric(latestSnapshot.adjustmentAmount);
    const invalidPrice = () => businessError(409, "ORDER_LINE_PRICE_INVALID", "原订单价格或改量金额无效，请先复核价格依据，未修改数量或账单。");
    if (!Number.isSafeInteger(currentChargeableQty) || currentChargeableQty <= 0 ||
      ![currentAmount, otherFee, adjustmentAmount].every(value => Number.isFinite(value) && Math.abs(value) < 1e12) ||
      currentAmount < 0 || otherFee < 0 ||
      ![latestSnapshot?.bagPrice === undefined ? 0 : latestSnapshot.bagPrice, latestSnapshot?.printPrice === undefined ? 0 : latestSnapshot.printPrice].every(value => Number.isFinite(numeric(value)) && numeric(value) >= 0 && numeric(value) < 1e10)) return invalidPrice();
    if (currentChargeableQty !== input.previousQty) return businessError(409, "ORDER_LINE_BILLING_ALLOCATION_REQUIRED", "原单包含赠送或部分计费数量，请先核对实际、计费和赠送分配，不能直接整单改量。");
    if (currentAmount === 0 && !(latestSnapshot && (String(latestSnapshot.overrideReason ?? "").trim() || String(latestSnapshot.sourceEvidence?.override?.reason ?? "").trim()))) return invalidPrice();
    const variableAmount = currentAmount - otherFee - adjustmentAmount;
    const derivedUnitPrice = currentChargeableQty > 0 ? variableAmount / currentChargeableQty : 0;
    const snapshotComponentUnitPrice =
      Number(latestSnapshot?.bagPrice ?? 0) + Number(latestSnapshot?.printPrice ?? 0);
    const keepSnapshotComponents =
      latestSnapshot &&
      snapshotComponentUnitPrice > 0 &&
      roundMoney(snapshotComponentUnitPrice * currentChargeableQty + otherFee + adjustmentAmount) === roundMoney(currentAmount);
    const bagPrice = keepSnapshotComponents ? Number(latestSnapshot.bagPrice ?? 0) : derivedUnitPrice;
    const printPrice = keepSnapshotComponents ? Number(latestSnapshot.printPrice ?? 0) : 0;
    const lineAmount = roundMoney((bagPrice + printPrice) * input.newQty);
    const finalAmount = roundMoney(lineAmount + otherFee + adjustmentAmount);
    if (![bagPrice, printPrice].every(value => Number.isFinite(value) && value >= 0 && value < 1e10) ||
      ![lineAmount, finalAmount].every(value => Number.isFinite(value) && value >= 0 && value < 1e12)) return invalidPrice();
    const versionNo = getNextQuantityAdjustmentPriceVersion(workspace, input.orderLineId);
    const priceSnapshot = {
      priceSnapshotId: nextPlainId("PS", `${input.orderLineId}-QTY-${versionNo}`),
      orderLineId: input.orderLineId,
      snapshotType: "quantity_adjustment",
      versionNo,
      bagPrice: Math.round(bagPrice * 10000) / 10000,
      printPrice: Math.round(printPrice * 10000) / 10000,
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
    const tasks=(workspace.productionTasks??[]).filter(task=>(task.orderLineId??task.lineId)===input.orderLineId&&!["已取消","已作废"].includes(task.taskStatus??task.status));
    if (tasks.length && !activeReservations.length) {
      if (tasks.some(task=>Number(task.plannedQty)!==input.previousQty)) return {ok:false,statusCode:409,code:"ORDER_PRODUCTION_ALLOCATION_REQUIRED",message:"原生产任务数量与整单不同，请先核对分批生产分配，不能直接整单改量。"};
      return {ok:true,inventoryReservations:[],inventoryAdjustments:[],inventoryLedgerEntries:[]};
    }
    if (tasks.length) return {ok:false,statusCode:409,code:"ORDER_PRODUCTION_ALLOCATION_REQUIRED",message:"本单同时关联现货占用与生产任务，请先核对各自数量分配，不能直接整单改量。"};
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
  if (hasOrderProductionExecution(workspace,orderLine.id??orderLine.orderLineId)) return false;
  if (!status || status.includes("已关闭") || status.includes("已取消") || status.includes("已交付")) return false;
  if (status.includes("丝印") || status.includes("制袋") || status.includes("打包")) return false;
  const orderLineId = orderLine.id ?? orderLine.orderLineId;
  return !(workspace.fulfillments ?? [])
    .filter((fulfillment) => (fulfillment.lineId ?? fulfillment.orderLineId) === orderLineId)
    .some((fulfillment) => hasExecutedDelivery(fulfillment) || String(fulfillment.status ?? "").includes("已交付"));
}

function getOrderLineOriginalQty(orderLine) {
  const qty = Math.trunc(Number(orderLine?.originalQty ?? orderLine?.qty ?? 0));
  return Number.isFinite(qty) ? qty : 0;
}

function findLatestPriceSnapshot(workspace, orderLineId) {
  const sorted = [...(workspace.priceSnapshots ?? [])]
    .filter((snapshot) => (snapshot.orderLineId ?? snapshot.order_line_id) === orderLineId)
    .sort((left, right) => {
      const leftCreated = Date.parse(left.createdAt ?? left.created_at ?? "") || 0;
      const rightCreated = Date.parse(right.createdAt ?? right.created_at ?? "") || 0;
      if (rightCreated !== leftCreated) return rightCreated - leftCreated;
      return Number(right.versionNo ?? right.version_no ?? 0) - Number(left.versionNo ?? left.version_no ?? 0);
    });
  const latest = sorted[0];
  if (!latest) return null;
  const latestTime = Date.parse(latest.createdAt ?? latest.created_at ?? "") || 0;
  const latestType = latest.snapshotType ?? latest.snapshot_type;
  if (sorted.some(snapshot => (Date.parse(snapshot.createdAt ?? snapshot.created_at ?? "") || 0) === latestTime &&
    (snapshot.snapshotType ?? snapshot.snapshot_type) !== latestType)) return { ambiguous: true };
  return latest;
}

function validatePrintGroupMutation(workspace, orderLineId) {
  const latest = findLatestPriceSnapshot(workspace, orderLineId);
  const group = (latest?.sourceEvidence ?? latest?.source_evidence)?.officePricingGroup;
  if (Number(group?.memberCount) > 1) return businessError(409, "ORDER_PRINT_GROUP_REQUOTE_REQUIRED",
    "本单参加了多条订单合组印刷报价。请先按整组重新核价，再改量或移除成员，不能只改本行而保留其他行旧阶梯价。");
  return null;
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

async function readCurrentMutationWorkspace(workspace) {
  if (workspace.coreWorkspaceReadRepository?.kind !== "postgres") return workspace;
  const state = await workspace.coreWorkspaceReadRepository.loadState();
  const keys = ["orderLines", "fulfillments", "priceSnapshots", "inventories", "inventoryReservations", "statementLines", "statements", "productionTasks", "workshopReports", "packingTasks", "packages"];
  if (keys.some(key => !Array.isArray(state?.[key]))) throw Object.assign(new Error("订单事实读取不完整，请重试，未修改业务数据。"), {code:"ORDER_MUTATION_SOURCE_UNAVAILABLE",statusCode:503});
  return {...workspace, ...state};
}
async function refreshMutationGuardSources(workspace) {
  if (workspace.coreWorkspaceReadRepository?.kind !== "postgres") return;
  const raw = await workspace.rawMaterialInboundRepository?.loadState?.();
  const jobs = await workspace.printJobRepository?.loadState?.();
  if (!Array.isArray(raw?.rawMaterialInbounds) || !Array.isArray(jobs?.printJobs) || !Array.isArray(workspace.paperOutboundDocuments) || !Array.isArray(workspace.printRecords)) {
    throw Object.assign(new Error("订单单据或原料消耗读取不完整，请重试，未修改业务数据。"), {code:"ORDER_MUTATION_SOURCE_UNAVAILABLE",statusCode:503});
  }
  Object.assign(workspace, raw, jobs);
}
function validateReviewedRevision(before, body) {
  if (body.expectedRevision === undefined) return null;
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision <= 0) return businessError(422, "EXPECTED_REVISION_REQUIRED", "请重新读取有效订单版本。");
  if (body.expectedRevision !== Number(before.revision ?? 1)) return businessError(409, "ORDER_LINE_REVISION_CONFLICT", "订单已被其他人更新，请重新读取并核对，输入已保留。");
  return null;
}
