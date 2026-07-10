import { getFulfillmentGoodsDisplay } from "./officeRules.js";

export const expressLtlLabelTemplateId = "tpl-p0-express-ltl-label";
export const deliveryNoteTemplateId = "tpl-p0-delivery-note";
export const pickupNoteTemplateId = "tpl-p0-pickup-note";

export function buildFulfillmentPrintTemplate(input = {}) {
  const fulfillment = input.fulfillment ?? {};
  const orderLine = input.orderLine ?? null;
  const customer = input.customer ?? {};
  const printRecord = input.printRecord ?? {};
  const method = fulfillment.method ?? orderLine?.fulfillment ?? "出库";
  const documentType = getDocumentType(method);
  const isExpressLtl = documentType === "express_ltl_label";
  const isFulfillmentNote = !isExpressLtl;
  const packageCount = getPackageCount(fulfillment.packages);
  const packageText = getPackageText(fulfillment.packages, packageCount);
  const quantity = Number(fulfillment.qty ?? fulfillment.expectedQty ?? orderLine?.qty ?? orderLine?.originalQty ?? 0) || 0;
  const batchNo = printRecord.batchNo ?? input.batchNo ?? "PB-PREVIEW";
  const fulfillmentId = fulfillment.id ?? fulfillment.fulfillmentId ?? "";
  const orderLineNo = fulfillment.lineId ?? fulfillment.orderLineId ?? orderLine?.id ?? "";
  const displayOrderLine = orderLine ? { ...orderLine, qty: quantity } : null;
  const goodsSummary = getFulfillmentGoodsDisplay(
    {
      goods: fulfillment.goods ?? orderLine?.product ?? "",
      qty: quantity,
    },
    displayOrderLine,
  );
  const latestNeededAt = fulfillment.latest ?? fulfillment.latestNeededAt ?? orderLine?.latest ?? "";
  const inventorySource = [fulfillment.zone, fulfillment.source].filter(Boolean).join(" / ");
  const fulfillmentDocumentFields = isFulfillmentNote
    ? buildFulfillmentDocumentFields({
        fulfillment,
        orderLine,
        method,
        quantity,
        packageCount,
        packageText,
        orderLineNo,
        goodsSummary,
        printRecord,
        input,
      })
    : {};

  return {
    templateId: printRecord.templateId ?? getTemplateId(documentType),
    templateVersion: isExpressLtl ? "p0-express-ltl-label-v1" : `p0-${documentType}-dot-matrix-v1`,
    documentType,
    title: isExpressLtl ? "快递快运包裹标签" : getFulfillmentDocumentTitle(documentType, method),
    priceHidden: isExpressLtl,
    paper: {
      name: isExpressLtl ? "80mm x 50mm 标签纸" : "241mm 针式连续二联纸",
      widthMm: isExpressLtl ? 80 : 241,
      heightMm: isExpressLtl ? 50 : 140,
      copies: isExpressLtl ? Math.max(packageCount, 1) : 2,
      isContinuous: isFulfillmentNote,
      copyNames: isFulfillmentNote ? ["客户联", "工厂留底联"] : [],
    },
    fields: {
      printBatchNo: batchNo,
      fulfillmentId,
      orderLineNo,
      customerName: customer.name ?? "",
      contactName: customer.contact ?? "",
      phoneTail: getPhoneTail(customer.phone),
      address: customer.address ?? "",
      fulfillmentMethod: method,
      goodsSummary,
      quantity,
      quantityText: `${quantity}个`,
      packageCount,
      packageText,
      packageSequence: packageCount > 1 ? `1/${packageCount}` : "1/1",
      latestNeededAt,
      inventorySource,
      note: buildLabelNote({ orderLine, fulfillment, isExpressLtl }),
      barcodeText: [fulfillmentId, orderLineNo, batchNo].filter(Boolean).join("|"),
      ...fulfillmentDocumentFields,
    },
    safeguards: isExpressLtl
      ? ["标签不显示价格", "打印后等待快递/快运拉走确认才扣库存", "包裹数量变化时作废旧标签后重打"]
      : ["针式连续纸二联", "正式单据显示价格", "数量、价格、客户或交付方式变化后需要作废并重打"],
  };
}

export function getDocumentType(method) {
  if (method === "快递快运") return "express_ltl_label";
  if (method === "送货") return "delivery_note";
  if (method === "自提") return "pickup_note";
  return "outbound_note";
}

export function getTemplateId(documentType) {
  if (documentType === "express_ltl_label") return expressLtlLabelTemplateId;
  if (documentType === "delivery_note") return deliveryNoteTemplateId;
  return pickupNoteTemplateId;
}

export function getPackageCount(packages) {
  if (typeof packages === "number") return Number.isFinite(packages) ? packages : 0;
  const match = String(packages ?? "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

export function getPhoneTail(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return digits;
}

function buildLabelNote({ orderLine, fulfillment, isExpressLtl }) {
  const notes = [];
  if (orderLine?.note) notes.push(orderLine.note);
  if (Array.isArray(orderLine?.exceptions) && orderLine.exceptions.length) notes.push(orderLine.exceptions.join("、"));
  if (fulfillment?.status && fulfillment.status !== "待打印标签") notes.push(fulfillment.status);
  if (isExpressLtl) notes.push("不显示金额");
  return [...new Set(notes.filter(Boolean))].join("；");
}

function buildFulfillmentDocumentFields({
  fulfillment,
  orderLine,
  method,
  quantity,
  packageCount: _packageCount,
  packageText,
  orderLineNo,
  goodsSummary,
  printRecord,
  input,
}) {
  const amount = Number(orderLine?.amount ?? fulfillment?.amount ?? 0) || 0;
  const unitPrice = quantity > 0 && amount > 0 ? amount / quantity : 0;
  const printEnabled = orderLine?.print === "是" || String(orderLine?.orderType ?? "").includes("印刷");
  const lineItem = {
    lineNo: orderLine?.lineNo ?? getLineNoFromOrderLineNo(orderLineNo),
    orderLineNo,
    productName: orderLine?.product ?? fulfillment?.goods ?? "",
    size: orderLine?.size ?? "",
    color: orderLine?.color ?? "",
    handle: orderLine?.handle ?? "",
    style: orderLine?.style ?? "",
    goodsSummary,
    quantity,
    quantityText: `${quantity}个`,
    packageText,
    unitPriceText: unitPrice > 0 ? formatMoney(unitPrice) : "待核价",
    amountText: amount > 0 ? formatMoney(amount) : "待核价",
    otherFeeText: "无",
    note: buildDocumentLineNote({ orderLine, fulfillment }),
  };
  if (printEnabled) {
    lineItem.printSide = orderLine?.printSide ?? "";
    lineItem.printUnitPriceText = "按价格快照";
  }
  return {
    documentNo: printRecord.printRecordId ?? "",
    paperNo: input.paperNo ?? printRecord.paperNo ?? "",
    copyText: "客户联 / 工厂留底联",
    receiverSignatureLabel: method === "送货" ? "客户签收" : "提货人签收",
    operatorSignatureLabel: "经办人",
    lineItems: [lineItem],
    totalQuantityText: `${quantity}个`,
    totalPackageText: packageText,
    totalAmountText: amount > 0 ? formatMoney(amount) : "待核价",
    priceStatementText: printEnabled ? "印刷订单价格按确认时价格快照核算" : "非印刷订单不显示印刷单价",
  };
}

function getFulfillmentDocumentTitle(documentType, method) {
  if (documentType === "delivery_note") return "送货单";
  if (documentType === "pickup_note") return "自提单";
  return `${method || "出库"}单`;
}

function getLineNoFromOrderLineNo(value) {
  const parts = String(value ?? "").split("-");
  return parts[parts.length - 1] || "";
}

function getPackageText(packages, packageCount) {
  const raw = String(packages ?? "").trim();
  if (raw) return raw;
  return packageCount > 0 ? `${packageCount}包` : "未填";
}

function buildDocumentLineNote({ orderLine, fulfillment }) {
  const notes = [];
  if (orderLine?.handle && orderLine.handle !== "普通提") notes.push(orderLine.handle);
  if (orderLine?.note) notes.push(orderLine.note);
  if (Array.isArray(orderLine?.exceptions)) notes.push(...orderLine.exceptions);
  if (fulfillment?.status) notes.push(fulfillment.status);
  return [...new Set(notes.filter(Boolean))].join("、");
}

function formatMoney(value) {
  const amount = Number(value) || 0;
  return `¥${amount.toLocaleString("zh-CN", {
    minimumFractionDigits: amount % 1 ? 1 : 0,
    maximumFractionDigits: 2,
  })}`;
}
