// 负责人 2026-11-12「销售价格」：读当前价格和改价记录、保存新版本。
import { createOfficeIdempotencyKey, readOfficeApiJson as readJson, requestOfficeApi, toOfficeApiError as toApiError } from "./officeApiClientCore.js";

export async function getSalesPrices({ authState, operatorId } = {}, options = {}) {
  try {
    const response = await requestOfficeApi("/sales-prices", { ...options, authState, operatorId, method: "GET" });
    const json = await readJson(response);
    if (!response.ok) return { blocked: true, error: toApiError(json, response.status, "销售价格读取失败。") };
    return { salesPrices: json?.salesPrices ?? { current: null, history: [], conflict: false } };
  } catch (error) {
    return { blocked: true, error: { code: "SALES_PRICE_API_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}

export async function saveSalesPriceVersion({ authState, operatorId, expectedCurrentId = "", items = [], rules = {}, changeSummary = "", idempotencyKey } = {}, options = {}) {
  const key = idempotencyKey || createOfficeIdempotencyKey();
  const body = { expectedCurrentId, items, rules, changeSummary, idempotencyKey: key };
  try {
    const response = await requestOfficeApi("/sales-prices/versions", { ...options, authState, operatorId, method: "POST", idempotencyKey: key, body });
    const json = await readJson(response);
    if (!response.ok) return { blocked: true, error: toApiError(json, response.status, "销售价格保存失败。") };
    return { salesPrices: json?.salesPrices, saved: json?.saved };
  } catch (error) {
    return { blocked: true, error: { code: "SALES_PRICE_API_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}
