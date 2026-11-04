import { getFulfillmentGoodsDisplay } from "./officeRules.js";
import { allocateFulfillmentAmount } from "../../shared/fulfillmentAmountAllocation.mjs";
import { fulfillmentDocumentTypeFor } from "../../shared/fulfillmentDocumentType.js";
import { resolvePrintColorCount } from "../../shared/largeMachinePrintPricing.js";
import { DEFAULT_COMPANY_PRINT_PROFILE, DELIVERY_NOTE_PAPER, DELIVERY_NOTE_SIGNATURES, amountInChineseUppercase, formatLegacyUnitPrice, normalizeCompanyPrintProfile } from "../../shared/deliveryNoteLayout.js";

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
  const documentType = input.documentType ?? printRecord.documentType ?? fulfillmentDocumentTypeFor({...fulfillment, method}, input.action);
  if (documentType === "package_label") {
    const labels=(input.packageLabelRows??fulfillment.packageLabelRows??[]).map(row=>({packageId:row.packageId,sequence:row.sequence,packedQty:row.packedQty,
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
    templateVersion: isExpressLtl ? "p0-express-ltl-label-v1" : `p2-${documentType}-legacy-three-price-v1`,
    documentType,
    title: isExpressLtl ? "快递快运包裹标签" : getFulfillmentDocumentTitle(documentType, method),
    priceHidden: isExpressLtl,
    paper: {
      name: isExpressLtl ? "80mm x 50mm 标签纸" : DELIVERY_NOTE_PAPER.name,
      widthMm: isExpressLtl ? 80 : DELIVERY_NOTE_PAPER.widthMm,
      heightMm: isExpressLtl ? 50 : DELIVERY_NOTE_PAPER.heightMm,
      copies: isExpressLtl ? Math.max(packageCount, 1) : DELIVERY_NOTE_PAPER.copyNames.length,
      isContinuous: isFulfillmentNote,
      copyNames: isFulfillmentNote ? [...DELIVERY_NOTE_PAPER.copyNames] : [],
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
      : ["针式连续纸三联", "正式单据显示价格", "数量、价格、客户或交付方式变化后需要作废并重打"],
  };
}

export function getDocumentType(method) {
  return fulfillmentDocumentTypeFor({method});
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
  // P2-05: 多出来的写明赠送（下单 5000 出 5010 → 按 5000 计价，10 个赠送）。
  const company = normalizeCompanyPrintProfile(input.companyProfile ?? DEFAULT_COMPANY_PRINT_PROFILE);
  const quantityNote = String(pricing.quantityNote ?? "").trim() || (Number(pricing.freeQty) > 0 ? `多出 ${Number(pricing.freeQty)} 个赠送，不收费` : "");
  const printEnabled = orderLine?.print === "是" || String(orderLine?.orderType ?? "").includes("印刷");
  const lineItem = {
    lineNo: orderLine?.lineNo ?? getLineNoFromOrderLineNo(orderLineNo),
    orderLineNo,
    productName: orderLine?.product ?? fulfillment?.goods ?? "",
    size: orderLine?.size ?? "",
    color: orderLine?.color ?? orderLine?.bagColor ?? "",
    handle: orderLine?.handle ?? "",
    style: orderLine?.style ?? "",
    goodsSummary,
    quantity,
    quantityText: `${quantity}个`,
    packageText,
    unitPriceText: unitPrice !== null && unitPrice !== undefined ? formatUnitPrice(unitPrice) : "待核价",
    amountText: amount !== null && amount !== undefined ? formatMoney(amount) : "待核价",
    amount: amount !== null && amount !== undefined && Number.isFinite(Number(amount)) ? Number(amount) : null,
    otherFeeText: "待核对费用明细",
    // P2-07 方案二：产品名称、规格、颜色、实发数量、计价数量、单价（袋子/印刷/长提/加扣）、金额、备注。
    // 多做赠送不写备注：实发 1010、计价 1000，金额按计价数量算。
    deliveredQtyText: String(quantity),
    chargeableQtyText: String(Number.isSafeInteger(Number(pricing.chargeableQty)) ? Number(pricing.chargeableQty) : quantity),
    deliveredQty: quantity,
    chargeableQty: Number.isSafeInteger(Number(pricing.chargeableQty)) ? Number(pricing.chargeableQty) : quantity,
    unit: "个",
    bagUnitPriceText: formatLegacyUnitPrice(pricing.unitPrices?.bag),
    // 负责人 2026-11-04：印刷单价客户默认是单色，双色、三色直接写在单价后面：0.2(双色)。
    printingUnitPriceText: printingPriceText(orderLine, pricing.unitPrices?.print),
    handleUnitPriceText: formatLegacyUnitPrice(pricing.unitPrices?.handle),
    snapUnitPriceText: formatLegacyUnitPrice(pricing.unitPrices?.snap),
    remark: buildSheetRemark({ orderLine, fulfillment, pricing }),
    note: [input.batchProgress, quantityNote, buildDocumentLineNote({ orderLine, fulfillment })].filter(Boolean).join("；"),
  };
  if (printEnabled) {
    lineItem.printSide = orderLine?.printSide ?? "";
    lineItem.printUnitPriceText = "按价格快照";
  }
  return {
    documentNo: printRecord.printRecordId ?? "",
    paperNo: input.paperNo ?? printRecord.paperNo ?? "",
    copyText: DELIVERY_NOTE_PAPER.copyNames.join(" / "),
    companyName: company.companyName,
    companyContactName: company.contactName,
    companyAddress: company.address,
    companyPhone: company.phone,
    footerNote: company.footerNote,
    senderSignatureText: DELIVERY_NOTE_SIGNATURES.sender,
    receiverSignatureText: DELIVERY_NOTE_SIGNATURES.receiver,
    documentDateText: documentDate(printRecord, input),
    // 负责人 2026-11-04：客户是 A、实际来拿货的是 B 时，单子上单独印「提货人：B」（送货单印收货人）。
    // 送货单（司机送货）不印提货人；只有自提单、出库单印。
    pickerName: printRecord?.documentType === "delivery_note" || input.documentType === "delivery_note" ? "" : String(input.pickerName ?? fulfillment?.receiverName ?? "").trim().slice(0, 20),
    pickerLabel: "提货人",
    totalAmount: amount !== null && amount !== undefined && Number.isFinite(Number(amount)) ? Number(amount) : null,
    totalQuantity: quantity,
    totalAmountUppercase: amount !== null && amount !== undefined ? amountInChineseUppercase(amount) : "",
    receiverSignatureLabel: method === "送货" ? "客户签收" : "提货人签收",
    operatorSignatureLabel: "经办人",
    lineItems: [lineItem],
    totalQuantityText: `${quantity}个`,
    batchProgressText: input.batchProgress || "",
    quantityNoteText: quantityNote,
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

// 负责人 2026-11-04：备注一栏系统自动写。几色写在印刷单价后面（没有单独印刷单价时才写进备注）；
// 长提、加扣没有单独单价的（以前的订单），写「加长提」「加扣」；（负责人 2026-11-04：赠送看实发/计价两列，不写备注；不写现货、不印仓库列）
const CHINESE_COUNTS = ["", "单", "双", "三", "四", "五", "六", "七", "八"];
function buildSheetRemark({ orderLine, fulfillment, pricing }) {
  const parts = [];
  const printing = orderLine?.print === "是" || orderLine?.printFlag === true || /印刷/.test(String(orderLine?.orderType ?? "")) || /print/.test(String(orderLine?.orderType ?? ""));
  // 印刷有单独单价时，几色已经写在印刷单价后面；没有单独印刷单价时才写进备注。
  if (printing && !(Number(pricing.unitPrices?.print) > 0)) {
    const detail = printDetail(orderLine);
    if (detail) parts.push(detail);
  }
  if (/加长|长提/.test(String(orderLine?.handle ?? orderLine?.handleType ?? "")) && !(Number(pricing.unitPrices?.handle) > 0)) parts.push("加长提");
  if (hasSnapButton(orderLine) && !(Number(pricing.unitPrices?.snap) > 0)) parts.push("加扣");
  for (const extra of [orderLine?.note, fulfillment?.note]) if (String(extra ?? "").trim()) parts.push(String(extra).trim());
  return [...new Set(parts)].join("、");
}

function printDetail(orderLine) {
  const colors = resolvePrintColorCount(orderLine ?? {});
  // 负责人 2026-11-04：单面双面机印同价，不写；只写几色。
  return colors >= 2 ? `${CHINESE_COUNTS[colors] ?? colors}色` : "";
}

function printingPriceText(orderLine, printPrice) {
  const text = formatLegacyUnitPrice(printPrice);
  const detail = text ? printDetail(orderLine) : "";
  return detail ? `${text}(${detail})` : text;
}

function hasSnapButton(orderLine) {
  if (!orderLine) return false;
  const requirements = [orderLine.specialRequirements, orderLine.specification?.specialRequirements].flat().filter(Boolean);
  return requirements.includes("snap_button") || orderLine.hasSnap === true || orderLine.snap === true
    || /按扣|加扣/.test([orderLine.snapRequirement, orderLine.style, orderLine.requirements].filter(Boolean).join(" "));
}

function documentDate(printRecord, input) {
  const raw = input.documentDate ?? printRecord?.printedAt ?? printRecord?.createdAt ?? "";
  const time = Date.parse(raw);
  if (!Number.isFinite(time)) return "";
  // 单据日期按北京时间
  return new Date(time + 8 * 3600 * 1000).toISOString().slice(0, 10);
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
