// 负责人 2026-11-12「销售价格」页：看当前生效的价格、改价存成新版本、看改价记录。
// 全厂统一价；改完立即对之后开的单生效，已下的订单保留下单时的价格快照。
import { randomUUID } from "node:crypto";
import {
  SALES_PRICE_CATEGORIES,
  SALES_PRICE_STYLES,
  diffSalesPriceTables,
  normalizeSalesPriceRules,
  validateSalesPriceTableInput,
} from "../../shared/pricing/factorySalesPriceList.js";

const clean = (value) => String(value ?? "").trim();
const businessError = (statusCode, code, message) => ({ error: true, statusCode, code, message });
const categoryOrder = new Map(SALES_PRICE_CATEGORIES.map((item, index) => [item.key, index]));

function repositoryOf(workspace) {
  const repository = workspace?.masterDataImportTransactionRepository;
  return typeof repository?.listSalesPriceTables === "function" && typeof repository?.saveSalesPriceVersion === "function" ? repository : null;
}

function itemsOf(items, tableId) {
  // 早先用导入表建的价格表没有分类、品名，还可能按「加长提」单独存了一行；页面按款式补分类，
  // 加长提那行不再单列（加长提手现在按长度另加）。
  return items.filter((item) => item.priceTableId === tableId && item.enabled !== false && !/加长|extended/u.test(clean(item.handleType)))
    .map((item) => ({ category: clean(item.category) || SALES_PRICE_STYLES[clean(item.styleKey)] || "regular", styleKey: clean(item.styleKey), sizeKey: clean(item.sizeKey), label: clean(item.label),
      bagPrice: Number(item.bagPrice), sortOrder: Number(item.sortOrder ?? 0) }))
    .sort((a, b) => (categoryOrder.get(a.category) ?? 99) - (categoryOrder.get(b.category) ?? 99) || a.sortOrder - b.sortOrder || a.sizeKey.localeCompare(b.sizeKey));
}

function isActiveNow(table, time) {
  return table.status === "active"
    && (!table.effectiveFrom || Date.parse(table.effectiveFrom) <= time)
    && (!table.effectiveTo || Date.parse(table.effectiveTo) > time);
}

export function projectSalesPrices({ tables = [], items = [] }, now = new Date()) {
  const time = now.getTime();
  const ordered = [...tables].sort((a, b) => Number(b.versionNo) - Number(a.versionNo));
  const active = ordered.filter((table) => isActiveNow(table, time));
  const versions = ordered.map((table) => ({ table, items: itemsOf(items, table.id), rules: normalizeSalesPriceRules(table.rules) }));
  const history = versions.map((version, index) => {
    const previous = versions[index + 1] ?? null;
    return {
      id: clean(version.table.id), versionNo: Number(version.table.versionNo), bizNo: clean(version.table.bizNo), status: clean(version.table.status),
      effectiveFrom: version.table.effectiveFrom ?? null, effectiveTo: version.table.effectiveTo ?? null,
      createdByName: clean(version.table.createdByName) || clean(version.table.createdBy), changeSummary: clean(version.table.changeSummary),
      itemCount: version.items.length,
      changes: previous ? diffSalesPriceTables(previous, version) : [{ kind: "created", text: `建立价格表，共 ${version.items.length} 个价` }],
    };
  });
  const current = active.length === 1 ? versions.find((version) => version.table.id === active[0].id) : null;
  return {
    current: current ? {
      id: clean(current.table.id), versionNo: Number(current.table.versionNo), bizNo: clean(current.table.bizNo),
      effectiveFrom: current.table.effectiveFrom ?? null, changeSummary: clean(current.table.changeSummary),
      createdByName: clean(current.table.createdByName) || clean(current.table.createdBy),
      rules: current.rules, items: current.items,
    } : null,
    // 同时有两个及以上生效版本是数据问题，开单会拒绝报价，这里也如实告诉页面。
    conflict: active.length > 1,
    history,
  };
}

export async function readSalesPrices({ workspace, now = () => new Date() }) {
  const repository = repositoryOf(workspace);
  if (!repository) return businessError(503, "SALES_PRICE_UNAVAILABLE", "销售价格暂时读不出来，请稍后再试。");
  const data = await repository.listSalesPriceTables({ workspace });
  return { salesPrices: projectSalesPrices(data, now()) };
}

export async function saveSalesPriceVersion({ workspace, body = {}, operatorId, now = () => new Date() }) {
  const repository = repositoryOf(workspace);
  if (!repository) return businessError(503, "SALES_PRICE_UNAVAILABLE", "销售价格暂时不能保存，请稍后再试。");
  let validated;
  try { validated = validateSalesPriceTableInput(body); }
  catch (error) { return businessError(422, "SALES_PRICE_INVALID", error.message); }
  const idempotencyKey = clean(body.idempotencyKey);
  if (idempotencyKey.length < 8) return businessError(422, "IDEMPOTENCY_KEY_INVALID", "缺少本次保存标识，请重新点保存。");
  const occurredAt = now().toISOString();
  const before = projectSalesPrices(await repository.listSalesPriceTables({ workspace }), now());
  const expectedCurrentId = clean(body.expectedCurrentId);
  if ((before.current?.id ?? "") !== expectedCurrentId || before.conflict) {
    return businessError(409, "SALES_PRICE_CHANGED", "价格刚被别人改过，请刷新后再改。");
  }
  const changes = before.current ? diffSalesPriceTables(before.current, validated) : [{ kind: "created", text: `建立价格表，共 ${validated.items.length} 个价` }];
  if (before.current && !changes.length) return businessError(422, "SALES_PRICE_UNCHANGED", "价格没有改动，不用保存。");
  // 同一次点击重试（网络断了又点）不重复建版本：用保存标识生成固定的版本编号。
  const tableId = `PT-SALES-${idempotencyKey.replace(/[^A-Za-z0-9-]/gu, "").slice(0, 40) || randomUUID()}`;
  try {
    const saved = await repository.saveSalesPriceVersion({
      workspace, tableId, expectedCurrentId, items: validated.items, rules: validated.rules, changeSummary: validated.changeSummary,
      operatorId, now: occurredAt,
      operationLog: { id: `LOG-SALES-PRICE-${randomUUID()}`, targetType: "price_table", targetId: tableId, action: "save_sales_price_version",
        before: before.current ? { id: before.current.id, versionNo: before.current.versionNo } : null, after: { changes },
        reason: validated.changeSummary, operatorId, pageKey: "sales-prices", occurredAt, createdAt: occurredAt },
    });
    const after = projectSalesPrices(await repository.listSalesPriceTables({ workspace }), now());
    return { salesPrices: after, saved: { versionNo: saved.priceTable?.versionNo ?? after.current?.versionNo ?? null, changes } };
  } catch (error) {
    if (error?.code === "SALES_PRICE_CHANGED" || error?.statusCode === 409 || /duplicate key/u.test(String(error?.message))) {
      return businessError(409, "SALES_PRICE_CHANGED", "价格刚被别人改过（或这次已经保存过），请刷新后再看。");
    }
    throw error;
  }
}
