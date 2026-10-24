const text = value => String(value ?? "").trim();

// Only the current physical paper's trusted print result opens warehouse work.
export function hasTrustedWarehousePaper(document, printRecord, fulfillmentId) {
  return Boolean(document && printRecord
    && !["已作废", "voided"].includes(text(document.status))
    && text(document.fulfillmentId ?? document.fulfillment_id) === text(fulfillmentId)
    && text(document.printRecordId ?? document.print_record_id) === text(printRecord.printRecordId ?? printRecord.id)
    && ["printed", "reprinted"].includes(text(printRecord.status))
    && (!text(printRecord.targetType ?? printRecord.target_type) || text(printRecord.targetType ?? printRecord.target_type) === "fulfillment")
    && (!text(printRecord.targetId ?? printRecord.target_id) || text(printRecord.targetId ?? printRecord.target_id) === text(fulfillmentId)));
}

export function isWarehouseTaskVisible(item = {}) {
  return item.warehouseTaskVisible === true;
}
