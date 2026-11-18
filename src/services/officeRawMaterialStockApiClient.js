import { requestOfficeApi, readOfficeApiJson } from "./officeApiClientCore.js";
import { toRawMaterialApiError } from "./officeRawMaterialApiSupport.js";

export async function listOfficeSupplierReturnStock({ authState, operatorId, page = 1, rollCode = "" } = {}, options = {}) {
  const query = new URLSearchParams({ page, rollCode });
  try {
    const response = await requestOfficeApi(`/raw-material-rolls/supplier-returns?${query}`, { ...options, authState, operatorId });
    const body = await readOfficeApiJson(response);
    if (!response.ok) return { source: "api_error", error: toRawMaterialApiError(body, response.status, "原料退厂记录读取失败。") };
    if (!Array.isArray(body?.items) || !Array.isArray(body?.returnNotes) || !Number.isSafeInteger(body.total)) {
      return { source: "api_error", error: { message: "原料退厂记录不完整，请重新读取。" } };
    }
    return { ...body, source: "api" };
  } catch {
    return { source: "api_error", error: { message: "原料退厂记录暂时无法读取，请重试。" } };
  }
}

// The scanner still consumes inbound-grouped records for optimistic revisions;
// its source is now the stock-only API, never receipt images/prices/OCR payloads.
export async function listOfficeRawMaterialStockInbounds({ authState, operatorId } = {}, options = {}) {
  const grouped = new Map();
  let page = 1;
  let fetched = 0;
  let expectedTotal;
  try {
    while (true) {
      const response = await requestOfficeApi(`/raw-material-rolls?page=${page}&pageSize=200`, { ...options, authState, operatorId });
      const json = await readOfficeApiJson(response);
      if (!response.ok) throw Object.assign(new Error(json?.error?.message || json?.message || "卷料库存读取失败。"), { code: json?.error?.code || json?.code });
      if (!Array.isArray(json.items) || !Number.isSafeInteger(json.total) || json.total < 0) throw new Error("卷料库存分页响应无效。");
      if (expectedTotal !== undefined && expectedTotal !== json.total) throw new Error("卷料库存已发生变化，请重新刷新后扫码。");
      expectedTotal = json.total;
      for (const item of json.items) {
        const source = item.sourceInbound;
        if (!source?.id || !item.id) throw new Error("卷料缺少来源或追溯编号。");
        if (!grouped.has(source.id)) grouped.set(source.id, { ...source, rolls: [], rawMaterialIssueRecords: [] });
        const inbound = grouped.get(source.id);
        if (inbound.revision !== source.revision) throw new Error("卷料来源版本已变化，请重新刷新。");
        if (inbound.rolls.some((roll) => roll.id === item.id)) throw new Error("卷料分页发生重复，请重新刷新。");
        const { sourceInbound, ...roll } = item;
        inbound.rolls.push(roll);
        inbound.rawMaterialIssueRecords.push(...(source.rawMaterialIssueRecords ?? []).filter((record) => !inbound.rawMaterialIssueRecords.some((existing) => existing.issueRecordId === record.issueRecordId)));
      }
      fetched += json.items.length;
      if (fetched >= json.total) break;
      if (!json.items.length) throw new Error("卷料库存分页不完整，请重新刷新。");
      page += 1;
    }
    return { source: "api", items: [...grouped.values()], total: grouped.size, rollTotal: fetched, projectionScope: "stock_only" };
  } catch (error) {
    return { source: "api_error", blocked: true, items: [], total: 0, error: { code: error.code || "RAW_MATERIAL_STOCK_READ_FAILED", message: error.message } };
  }
}
