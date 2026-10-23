// The desktop filters operate on a complete collection. Never present a first
// page (or a partially failed scan) as the full business ledger.
export async function readCompleteCollection(readPage, { pageSize = 200, maxPages = 100 } = {}) {
  const items = [];
  const identities = new Set();
  let expectedTotal;
  let first;
  const fail = (message) => ({ source: "api_error", blocked: true, items: [], total: 0,
    error: { code: "REVIEW_COLLECTION_INCOMPLETE", message } });
  try {
    for (let page = 1; page <= maxPages; page += 1) {
      const result = await readPage({ page, pageSize });
      if (result?.source !== "api" || result.blocked) return fail(result?.error?.message || "列表读取失败，请重试。");
      const { total, items: batch } = result;
      const actualSize = result.pageSize ?? pageSize;
      if (!Array.isArray(batch) || !Number.isSafeInteger(total) || total < 0
        || !Number.isSafeInteger(actualSize) || actualSize < 1 || batch.length > actualSize
        || (result.page !== undefined && result.page !== page)) return fail("服务器分页信息不完整，请刷新核对。");
      if (expectedTotal !== undefined && expectedTotal !== total) return fail("读取期间记录总数发生变化，请刷新后重试。");
      expectedTotal = total;
      first ??= result;
      for (const item of batch) {
        const identity = item.id ?? item.orderLineId ?? item.draftId ?? item.todoId ?? item.inventoryItemId
          ?? item.fulfillmentId ?? item.statementId ?? item.customerId ?? item.reviewId ?? item.productionTaskId
          ?? item.packingTaskId ?? item.printJobId ?? item.printDeviceId ?? item.employeeId ?? item.machineId;
        // Rows without stable identities are still checked by full content;
        // a server ignoring page must fail rather than loop or duplicate rows.
        const key = identity === undefined ? JSON.stringify(item) : String(identity);
        if (identities.has(key)) return fail("分页记录重复或读取期间发生变化，请刷新核对。");
        identities.add(key);
        items.push(item);
      }
      if (items.length > total) return fail("服务器记录数量与分页总数不一致，请刷新核对。");
      if (items.length === total) return { ...first, items, total, complete: true, pagesRead: page };
      if (!batch.length) return fail("服务器列表提前结束，尚有记录未读取，请刷新核对。");
    }
    return fail("记录过多，超过本工作台完整读取范围；请联系管理员分期查询，当前不展示不完整结果。");
  } catch (error) { return fail(error?.message || "列表读取失败，请重试。"); }
}

export function createReadGenerationGuard() {
  const generations = new Map();
  return {
    begin(key) { const version = (generations.get(key) || 0) + 1; generations.set(key, version); return version; },
    current(key, version) { return generations.get(key) === version; },
  };
}
