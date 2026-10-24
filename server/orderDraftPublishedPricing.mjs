import { isDeepStrictEqual } from "node:util";
import { findMiniappPriceItem, quoteMiniappCatalogPrice } from "./miniapp/miniappErpProjectionAdapter.mjs";
import { normalizeOrderType } from "../shared/orderRouting.js";

const clean = value => String(value ?? "").trim();
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function publishedOrderPriceError() {
  return Object.assign(new Error("当前通用价格尚未有效发布、存在冲突或未匹配到本单规格，请先核实报价；草稿已保留。"), {
    code: "ORDER_PRICE_SOURCE_REQUIRED", statusCode: 409,
  });
}

// The factory has one shared general price table. Customer bindings are not an
// alternative quotation source. Pending edits never replace an active price.
export function getPublishedOrderPriceSource(workspace, at = new Date()) {
  const time = new Date(at).getTime();
  const tables = (workspace.priceTables ?? []).filter(table => table.status === "active"
    && (!table.effectiveFrom || new Date(table.effectiveFrom).getTime() <= time)
    && (!table.effectiveTo || new Date(table.effectiveTo).getTime() > time));
  if (tables.length !== 1) throw publishedOrderPriceError();
  const table = tables[0];
  const priceTable = { id: clean(table.id), bizNo: clean(table.bizNo), versionNo: Number(table.versionNo ?? 1),
    effectiveFrom: table.effectiveFrom ? new Date(table.effectiveFrom).toISOString() : null,
    effectiveTo: table.effectiveTo ? new Date(table.effectiveTo).toISOString() : null };
  if (!priceTable.id || !Number.isSafeInteger(priceTable.versionNo) || priceTable.versionNo < 1) throw publishedOrderPriceError();
  const priceItems = (workspace.priceTableItems ?? []).filter(item => item.priceTableId === table.id && item.enabled === true)
    .map(item => ({ id: clean(item.id), sizeKey: clean(item.sizeKey),
      size: clean((workspace.sizeSpecs ?? []).find(size => size.sizeKey === item.sizeKey)?.displayName) || clean(item.sizeKey),
      standardColorId: clean(item.standardColorId),
      handleType: clean(item.handleType), styleKey: clean(item.styleKey), bagPrice: Number(item.bagPrice),
      printPrice: Number(item.printPrice), otherFee: Number(item.otherFee), minQty: item.minQty == null ? null : Number(item.minQty),
      colorName: clean((workspace.standardColors ?? []).find(color => color.id === item.standardColorId)?.name),
      colorKey: clean((workspace.standardColors ?? []).find(color => color.id === item.standardColorId)?.colorKey) }))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { priceTable, priceItems };
}

export async function loadOrderDraftPublishedPricing(workspace, lines, at) {
  if (workspace.coreWorkspaceReadRepository?.loadState) {
    const state = await workspace.coreWorkspaceReadRepository.loadState();
    if (!Array.isArray(state?.priceTables) || !Array.isArray(state?.priceTableItems)) throw publishedOrderPriceError();
    for (const key of ["priceTables", "priceTableItems", "standardColors", "sizeSpecs"]) {
      if (Array.isArray(state[key])) workspace[key] = state[key];
    }
  }
  const source = getPublishedOrderPriceSource(workspace, at);
  const prices = new Map();
  for (const row of lines) prices.set(row.id, resolvePublishedRow(source, row));
  return { source, prices };
}

export function resolvePublishedRow(source, row) {
  const type = normalizeOrderType(row.orderType);
  // An arbitrary custom size cannot become a common-goods quote merely by
  // matching a dimension; its formal quotation remains a separate workflow.
  if (type === "custom_special") throw publishedOrderPriceError();
  const printedCommon = type === "stock_printed" || (!type && /小熊|小狗|喜|福/.test(clean(row.style)));
  const laminated = /覆膜/.test(`${row.style} ${row.product}`);
  const printing = !printedCommon && (row.print === "是" || row.printFlag === true || ["custom_print", "external_print"].includes(type));
  const patternText = `${row.style} ${row.product}`;
  const patternId = /小熊|小狗/.test(patternText) ? "dog" : /喜/.test(patternText) ? "xi" : /福/.test(patternText) ? "fu" : row.style;
  const patternName = patternId === "xi" ? "喜" : patternId === "fu" ? "福" : row.style;
  const line = { ...row, quantity: row.qty, handleId: /加长/.test(clean(row.handle)) ? "extended" : "regular",
    productType: printedCommon ? (laminated ? "laminated_printed" : "stock_printed")
      : laminated ? (printing ? "laminated_custom" : "laminated_plain") : printing ? "custom_print" : "stock_plain",
    patternName, patternId,
    printColor: printing ? row.printColor : "", printContent: printing ? row.printContent : "" };
  const match = findMiniappPriceItem(source, line, { requireUnique: true,
    ...(/金银|metallic/i.test(patternText) ? { styleKeys: ["覆膜金银", "laminated_metallic"], requireExplicitStyle: true } : {}) });
  if (!match || ![match.item.bagPrice, match.item.printPrice, match.item.otherFee].every(value => Number.isFinite(value) && value >= 0)) throw publishedOrderPriceError();
  const quote = quoteMiniappCatalogPrice(source, line, match, { preserveUnitPrecision: true });
  const bagPrice = type === "external_print" ? 0 : Math.round((quote.basePrice + quote.handleAddon + Number.EPSILON) * 10_000) / 10_000;
  const amount = type === "external_print" ? money(quote.printFee * row.qty + match.item.otherFee) : quote.amount;
  if ((type === "external_print" ? quote.printFee : bagPrice) <= 0) throw publishedOrderPriceError();
  return { bagPrice, printPrice: quote.printFee, otherFee: match.item.otherFee, amount,
    priceVersion: quote.priceVersion, sourceEvidence: { kind: "erp_published_price", priceTableId: source.priceTable.id,
      priceTableVersion: source.priceTable.versionNo, priceItemId: match.item.id, priceVersion: quote.priceVersion,
      handleFallback: match.handleFallback } };
}

export function applyOrderDraftPublishedPricing(confirmation, pricing) {
  if (!pricing || confirmation.blocked) return;
  confirmation.newLines.forEach((line, index) => {
    const price = pricing.prices.get(confirmation.checkedRows[index]?.id);
    if (!price) throw publishedOrderPriceError();
    line.amount = price.amount;
    line.confirmedPublishedPrice = price;
  });
}

export function assertPublishedOrderPriceSource(workspace, source) {
  if (!source) return;
  if (!isDeepStrictEqual(getPublishedOrderPriceSource(workspace), source)) {
    throw Object.assign(publishedOrderPriceError(), { code: "ERP_ORDER_PRICE_SOURCE_CONFLICT" });
  }
}

export function assertPublishedOrderPriceSnapshots(source, orderLines, priceSnapshots) {
  if (!source) return;
  for (const line of orderLines) {
    const lineId = line.orderLineId ?? line.id;
    const snapshot = priceSnapshots.find(item => item.orderLineId === lineId);
    const expected = resolvePublishedRow(source, { ...line, id: lineId, qty: line.qty ?? line.originalQty,
      handle: line.handle ?? line.handleType, product: line.product ?? line.productName });
    if (!snapshot || snapshot.bagPrice !== expected.bagPrice || snapshot.printPrice !== expected.printPrice
      || snapshot.otherFee !== expected.otherFee || snapshot.finalAmount !== expected.amount
      || snapshot.chargeableQty !== (line.qty ?? line.originalQty)
      || !isDeepStrictEqual(snapshot.sourceEvidence, expected.sourceEvidence)) throw publishedOrderPriceError();
  }
}

export function buildPublishedOrderPriceSourceGuard(source, parameters) {
  if (!source) return "true";
  return `(
    (SELECT count(*) FROM locked_order_price_tables WHERE status = 'active'
      AND (effective_from IS NULL OR effective_from <= now())
      AND (effective_to IS NULL OR effective_to > now())) = 1
    AND EXISTS (SELECT 1 FROM locked_order_price_tables WHERE id = ${parameters.text(source.priceTable.id)}
      AND biz_no = ${parameters.text(source.priceTable.bizNo)} AND version_no = ${parameters.integer(source.priceTable.versionNo)}
      AND status = 'active'
      AND effective_from IS NOT DISTINCT FROM ${parameters.nullableTimestamp(source.priceTable.effectiveFrom)}
      AND effective_to IS NOT DISTINCT FROM ${parameters.nullableTimestamp(source.priceTable.effectiveTo)}
      AND (effective_from IS NULL OR effective_from <= now())
      AND (effective_to IS NULL OR effective_to > now()))
    AND (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', item.id, 'sizeKey', COALESCE(item.size_key, ''),
      'size', COALESCE(size_spec.display_name, item.size_key, ''),
      'standardColorId', COALESCE(item.standard_color_id, ''), 'handleType', COALESCE(item.handle_type, ''),
      'styleKey', COALESCE(item.style_key, ''), 'bagPrice', item.bag_price, 'printPrice', item.print_price,
      'otherFee', item.other_fee, 'minQty', item.min_qty, 'colorName', COALESCE(color.name, ''),
      'colorKey', COALESCE(color.color_key, '')) ORDER BY item.id COLLATE "C"), '[]'::jsonb)
      FROM locked_order_price_items item LEFT JOIN standard_colors color ON color.id = item.standard_color_id
      LEFT JOIN size_specs size_spec ON size_spec.size_key = item.size_key
      WHERE item.price_table_id = ${parameters.text(source.priceTable.id)} AND item.enabled = true
    ) = ${parameters.json(source.priceItems)}
  )`;
}
