import { createInventoryReservationPolicyService } from "./inventoryReservationPolicyService.mjs";

const inventoryReservationPolicyService = createInventoryReservationPolicyService();

export function createInventoryReservationReleaseCommandService(dependencies = {}) {
  const {
    buildOperationLog,
    findInventoryItem,
    findInventoryReservation,
    isReleasableInventoryReservation = inventoryReservationPolicyService.isReleasableInventoryReservation,
    nextPlainId,
  } = dependencies;
  for (const [name, value] of Object.entries({
    buildOperationLog,
    findInventoryItem,
    findInventoryReservation,
    isReleasableInventoryReservation,
    nextPlainId,
  })) {
    requireFunction(value, name);
  }

  return { releaseReservation };

  async function releaseReservation({ workspace, reservationId, body = {}, operatorId }) {
    const before = findInventoryReservation(workspace, reservationId);
    if (!before) return notFound("INVENTORY_RESERVATION_NOT_FOUND");
    if (body.reservationId && body.reservationId !== reservationId) {
      return businessError(422, "VALIDATION_ERROR", "reservationId in path and body must match");
    }
    if (before.reservationType === "临时留货") {
      return businessError(
        409,
        "TEMPORARY_HOLD_DEDICATED_RELEASE_REQUIRED",
        "Temporary holds must be released through the inventory hold route so the source intent stays consistent.",
      );
    }
    if (!isReleasableInventoryReservation(before)) {
      return businessError(
        409,
        "INVENTORY_RESERVATION_NOT_ACTIVE",
        "Only active reservations can be released.",
      );
    }

    const inventoryItem = findInventoryItem(workspace, before.inventoryItemId);
    if (!inventoryItem) return notFound("INVENTORY_ITEM_NOT_FOUND");

    const currentReservedQty = Math.max(0, Number(before.reservedQty ?? before.qty ?? 0));
    const requestedReleaseQty = Math.trunc(Number(body.releaseQty ?? currentReservedQty));
    if (!Number.isFinite(requestedReleaseQty) || requestedReleaseQty <= 0) {
      return businessError(422, "VALIDATION_ERROR", "releaseQty must be greater than 0.");
    }
    if (requestedReleaseQty > currentReservedQty) {
      return businessError(
        409,
        "INVENTORY_RELEASE_QTY_EXCEEDS_RESERVED",
        "releaseQty exceeds reserved quantity.",
      );
    }

    const releasedQty = requestedReleaseQty;
    const remainingReservedQty = Math.max(0, currentReservedQty - releasedQty);
    const status = remainingReservedQty > 0 ? "部分释放" : "已释放";
    const after = {
      ...before,
      reservationId: before.reservationId ?? before.id,
      reservedQty: remainingReservedQty,
      status,
    };
    const reservedBefore = Number(inventoryItem.reserved ?? 0);
    const reservedAfter = Math.max(0, reservedBefore - releasedQty);
    const ledger = {
      ledgerId: nextPlainId(
        "LEDGER",
        `${reservationId}-RELEASE-${(workspace.inventoryLedgers ?? []).length + 1}`,
      ),
      inventoryItemId: before.inventoryItemId,
      changeType: "释放占用",
      qtyBefore: reservedBefore,
      qtyChange: -releasedQty,
      qtyAfter: reservedAfter,
      sourceType: "inventory_reservation_release",
      sourceId: body.relatedActionId ?? reservationId,
      operatorId,
      confirmedBy: operatorId,
      reason: mapReleaseReason(body.reason),
      remark: `释放占用 ${releasedQty}`,
    };
    const operationLog = buildOperationLog(workspace, {
      targetType: "inventory_reservation",
      targetId: reservationId,
      action: "release_inventory_reservation",
      operatorId,
      before,
      after,
      reason: ledger.reason,
    });
    const transaction = await workspace.inventoryReservationReleaseTransactionRepository.releaseReservation({
      workspace,
      reservation: after,
      inventoryAdjustment: {
        inventoryItemId: before.inventoryItemId,
        reservedQtyChange: -releasedQty,
      },
      inventoryLedgerEntry: ledger,
      operationLog,
    });

    return success({
      reservationId,
      orderLineId: after.orderLineId,
      inventoryItemId: after.inventoryItemId,
      qty: Number(transaction.reservation?.reservedQty ?? remainingReservedQty),
      releasedQty,
      status: mapApiStatus(transaction.reservation?.status ?? status),
      ledgerId: transaction.inventoryLedgerEntry?.ledgerId ?? ledger.ledgerId,
      operationLogId: transaction.operationLogId,
    });
  }
}

function mapReleaseReason(reason) {
  const reasons = {
    order_cancelled: "订单取消释放库存",
    qty_changed: "订单改量释放库存",
    customer_rejected: "客户拒绝等待释放库存",
    outbound_completed: "出库完成释放库存",
    manual_release: "人工释放库存占用",
    reservation_correction: "库存占用修正",
  };
  return reasons[reason] ?? reasons.manual_release;
}

function mapApiStatus(status) {
  const normalized = String(status ?? "").trim();
  if (normalized === "生效") return "active";
  if (normalized === "已释放") return "released";
  if (normalized === "部分释放") return "partially_released";
  if (normalized === "已出库") return "converted_to_outbound";
  return normalized || "active";
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
