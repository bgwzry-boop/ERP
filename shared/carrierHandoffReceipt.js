import { normalizeCarrierHandoffTimestamp } from "./fulfillmentHandoffTime.js";

export function readCarrierHandoffReceipt(receipt, input) {
  const text = value => typeof value === "string" ? value.trim() : "";
  const actual = normalizeCarrierHandoffTimestamp(input.actualHandoffAt), recorded = normalizeCarrierHandoffTimestamp(receipt?.finalDeliveryAt);
  if (!text(input.fulfillment?.id) || receipt?.fulfillmentId !== input.fulfillment.id || receipt?.status !== "已交付"
    || !text(receipt?.operationLogId) || !recorded || (input.actualHandoffAt !== undefined && (!actual || actual !== recorded))
    || (receipt?.statementCandidate === true && !text(receipt.statementId))) return { source: "api_error", blocked: true,
    error: { code: "CARRIER_HANDOFF_UNCONFIRMED", message: "拉走回执不完整或与本次任务、实际时间不符，请用原内容重试核对。" } };
  return { source: "api", fulfillmentId: receipt.fulfillmentId, status: receipt.status, finalDeliveryStatus: receipt.finalDeliveryStatus,
    finalDeliveryAt: receipt.finalDeliveryAt, confirmedAt: receipt.confirmedAt, statementCandidate: receipt.statementCandidate,
    statementId: receipt.statementId, inventoryDeductionMode: receipt.inventoryDeductionMode, operationLogId: receipt.operationLogId };
}
