import { getFulfillmentGoodsDisplay } from "./officeRules.js";
import { allocateFulfillmentAmount } from "../../shared/fulfillmentAmountAllocation.mjs";

export const expressLtlLabelTemplateId = "tpl-p0-express-ltl-label";
export const deliveryNoteTemplateId = "tpl-p0-delivery-note";
export const pickupNoteTemplateId = "tpl-p0-pickup-note";

export function buildFulfillmentPrintTemplate(input = {}) {
  const fulfillment = input.fulfillment ?? {};
  const orderLine = input.orderLine ?? null;
  const customer = input.customer ?? {};
  const snapshot = fulfillment.customerSnapshot ?? {};
  const hasCapturedContact = Boolean(firstContactText(snapshot.contactName, snapshot.contact,
    snapshot.contactPhone, snapshot.phone, snapshot.address));
  const contactSource = hasCapturedContact ? snapshot : customer;
  const printRecord = input.printRecord ?? {};
  const method = fulfillment.method ?? orderLine?.fulfillment ?? "出库";
  const documentType = input.documentType ?? printRecord.documentType ?? getDocumentType(method);
  if (documentType === "package_label") {
    const labels=(input.packageLabelRows??[]).map(row=>({packageId:row.packageId,sequence:row.sequence,packedQty:row.packedQty,
      barcodeText:row.packageId,contents:row.contents,customerName:firstContactText(snapshot.customerName,snapshot.name,customer.name)}));
    return {templateId:printRecord.templateId??expressLtlLabelTemplateId,templateVersion:"physical-package-contents-v1",documentType,title:"内部包裹挂牌",priceHidden:true,
      paper:{name:"80mm 包裹挂牌",widthMm:80,heightMm:100,copies:labels.length,isContinuous:false,copyNames:[]},labels,
      fields:{fulfillmentId:fulfillment.id??fulfillment.fulfillmentId,packageCount:labels.length},
      safeguards:["每包一个独立包码","挂牌与实物逐项人工核对","挂牌不含单价和金额","更正后旧包码失效"]};
  }
  const isExpressLtl = documentType === "express_ltl_label";
  const isFulfillmentNote = !isExpressLtl;
  const packageCount = getPackageCount(fulfillment.packages);
  const packageText = getPackageText(fulfillment.packages, packageCount);
  const quantity = Number(input.pricing?.deliveredQty ?? fulfillment.qty ?? fulfillment.expectedQty ?? orderLine?.qty ?? orderLine?.originalQty ?? 0) || 0;
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
    templateVersion: isExpressLtl ? "p0-express-ltl-label-v1" : `p0-${documentType}-dot-matrix-v2`,
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
      customerName: firstContactText(snapshot.customerName, snapshot.name, customer.name),
      contactName: firstContactText(contactSource.contactName, contactSource.contact),
      phoneTail: getPhoneTail(firstContactText(contactSource.contactPhone, contactSource.phone)),
      address: firstContactText(contactSource.address),
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
  if (["express_ltl_label","package_label"].includes(documentType)) return expressLtlLabelTemplateId;
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
  const pricing = input.pricing ?? buildReferencePricing(orderLine, quantity);
  const amount = pricing.amount;
  const unitPrice = pricing.unitPrice;
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
    unitPriceText: unitPrice !== null && unitPrice !== undefined ? formatUnitPrice(unitPrice) : "待核价",
    amountText: amount !== null && amount !== undefined ? formatMoney(amount) : "待核价",
    otherFeeText: "待核对费用明细",
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
    totalAmountText: amount !== null && amount !== undefined ? formatMoney(amount) : "待核价",
    unitPriceLabel: "折合单价",
    amountLabel: pricing.source === "recorded_statement" ? "本次入账金额" : pricing.source === "price_snapshot" ? "本次计划金额" : "参考金额",
    chargeableQuantityText: `${pricing.chargeableQty ?? quantity}个`,
    freeQuantityText: `${pricing.freeQty ?? 0}个`,
    pricingSource: pricing.source,
    priceSnapshotId: pricing.priceSnapshotId || "",
    statementLineId: pricing.statementLineId || "",
    pricingEvidence: input.pricing ? {...pricing} : null,
    priceStatementText: pricing.source === "recorded_statement" ? "金额沿用本次交付原入账凭据；未取得原单价时不推算单价"
      : !input.pricing || pricing.source === "local_order_reference" ? "金额仅供核对；正式纸单由服务器按价格快照与分批计费记录生成"
      : "按价格快照与当前分批记录计算；折合单价包含分摊费用，最终入账以实际交付为准",
  };
}

function buildReferencePricing(orderLine, quantity) {
  const price = orderLine?.priceSnapshot;
  const totalAmount = price?.finalAmount ?? orderLine?.amount;
  const totalQty = price?.chargeableQty ?? orderLine?.qty ?? orderLine?.originalQty;
  try {
    const allocation = allocateFulfillmentAmount({totalAmount,totalChargeableQty:totalQty,chargeableQty:quantity});
    return {amount:allocation.amount,unitPrice:Number(totalAmount)/Number(totalQty),source:"reference"};
  } catch { return {amount:null,unitPrice:null,source:"unavailable"}; }
}

function formatUnitPrice(value) {
  return `¥${Number(value).toLocaleString("zh-CN", {maximumFractionDigits:6})}`;
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

function firstContactText(...values) { return values.map(value => String(value ?? "").trim()).find(Boolean) ?? ""; }
