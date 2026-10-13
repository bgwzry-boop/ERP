export function makeOrderLine(input) {
  const orderLine = {
    id: `${input.orderNo}-${input.lineNo}`,
    orderNo: input.orderNo,
    lineNo: input.lineNo,
    customerId: input.customerId,
    product: input.product,
    size: input.size,
    color: input.color,
    handle: input.handle,
    style: input.style,
    print: input.print,
    qty: input.qty,
    orderType: input.orderType,
    status: input.status,
    fulfillment: input.fulfillment,
    latest: input.latest,
    amount: input.amount,
    exceptions: input.exceptions,
    inventory: input.inventory,
    printSide: input.printSide,
    printColor: input.printColor,
    note: input.note,
    handleColor: input.handleColor,
  };
  return {
    ...orderLine,
    ...(input.artworkStatus ? { artworkStatus: input.artworkStatus } : {}),
    ...(input.artworkAttachment ? { artworkAttachment: input.artworkAttachment } : {}),
  };
}

export function makeFulfillment(input) {
  return {
    id: input.id,
    method: input.method,
    customerId: input.customerId,
    lineId: input.lineId,
    goods: input.goods,
    qty: input.qty,
    packages: input.packages,
    status: input.status,
    latest: input.latest,
    zone: input.zone,
    source: input.source,
    printed: input.status === "已交付",
  };
}
