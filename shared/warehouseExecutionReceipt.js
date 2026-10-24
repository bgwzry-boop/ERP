const text = value => typeof value === "string" ? value.trim() : "";

// A 2xx response alone is not proof that this exact task/paper was committed.
export function hasWarehouseExecutionReceipt(receipt, input) {
  const execution = receipt?.warehouseOutboundExecution, paper = input.paperOutboundDocument;
  return Boolean(text(input.fulfillment?.id) && text(paper?.paperOutboundDocumentId ?? paper?.id)
    && text(receipt?.operationLogId) && text(receipt?.status)
    && text(receipt?.fulfillmentId) === text(input.fulfillment?.id)
    && text(execution?.warehouseOutboundExecutionId ?? execution?.id)
    && text(execution?.fulfillmentId) === text(input.fulfillment?.id)
    && text(execution?.paperOutboundDocumentId) === text(paper?.paperOutboundDocumentId ?? paper?.id)
    && Number.isSafeInteger(Number(paper?.documentVersion)) && Number(paper.documentVersion) > 0
    && Number(execution?.paperDocumentVersion) === Number(paper.documentVersion)
    && text(execution?.result) === text(input.result));
}
