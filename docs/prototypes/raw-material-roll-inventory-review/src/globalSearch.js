const DEFAULT_LIMIT = 8;

function text(value) {
  return String(value ?? "").trim();
}

function fold(value) {
  return text(value).toLowerCase();
}

function matchRank(value, query) {
  const haystack = fold(value);
  if (!query || !haystack || !haystack.includes(query)) return 0;
  if (haystack === query) return 3;
  if (haystack.startsWith(query)) return 2;
  return 1;
}

function customerNameOf(line) {
  if (typeof line?.customer === "string") return text(line.customer);
  if (line?.customer && typeof line.customer === "object") return text(line.customer.customerName || line.customer.name);
  return text(line?.customerName);
}

function orderIdentity(line) {
  return text(line?.id || line?.orderLineId);
}

function orderDocument(line) {
  return text(line?.orderNo || line?.orderId || orderIdentity(line));
}

function orderProduct(line) {
  return text(line?.product || line?.productName);
}

function orderColor(line) {
  return text(line?.color || line?.bagColor);
}

// 与客户档案同一来源：对账单优先，没有对账单时才用订单上的客户名。
export function collectGlobalSearchCustomers(data = {}) {
  const records = new Map();
  for (const statement of data.statements || []) {
    const id = text(statement?.customerId);
    if (!id) continue;
    records.set(id, {
      id,
      name: text(statement?.customerName) || id,
      settlementCycle: text(statement?.settlementCycle),
    });
  }
  for (const line of data.orderLines || []) {
    const id = text(line?.customerId);
    if (!id || records.has(id)) continue;
    records.set(id, {
      id,
      name: customerNameOf(line) || id,
      settlementCycle: "",
    });
  }
  return [...records.values()];
}

function allowedSet(allowedNavIds) {
  if (allowedNavIds instanceof Set) return allowedNavIds;
  if (Array.isArray(allowedNavIds)) return new Set(allowedNavIds);
  return null;
}

export function searchGlobalDesktopRecords(data = {}, rawQuery, options = {}) {
  const query = fold(rawQuery);
  if (!query) return [];
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : DEFAULT_LIMIT;
  const allowed = allowedSet(options.allowedNavIds);
  const canOpen = (navId) => !allowed || allowed.has(navId);
  const visibleQuery = text(rawQuery);
  const lines = (data.orderLines || []).filter((line) => orderIdentity(line));
  const linesByCustomer = new Map();
  for (const line of lines) {
    const customerId = text(line.customerId);
    if (!customerId) continue;
    const group = linesByCustomer.get(customerId) || [];
    group.push(line);
    linesByCustomer.set(customerId, group);
  }

  const results = [];
  if (canOpen("customer-records")) {
    for (const customer of collectGlobalSearchCustomers(data)) {
      const nameRank = Math.max(
        matchRank(customer.name, query),
        ...(linesByCustomer.get(customer.id) || []).map((line) => matchRank(customerNameOf(line), query)),
      );
      const idRank = matchRank(customer.id, query);
      const cycleRank = matchRank(customer.settlementCycle, query);
      const rank = Math.max(nameRank, idRank, cycleRank);
      if (!rank) continue;
      const score = 200 + nameRank * 20 + idRank * 10 + cycleRank;
      results.push({
        score,
        kind: "customer",
        navId: "customer-records",
        recordId: customer.id,
        query: visibleQuery,
        title: customer.name,
        detail: ["客户档案", customer.id, customer.settlementCycle].filter(Boolean).join(" · "),
      });
    }
  }

  if (canOpen("order-pool")) {
    for (const line of lines) {
      const customer = customerNameOf(line) || text(line.customerId) || "客户待确认";
      const documentNo = orderDocument(line);
      const identity = orderIdentity(line);
      const product = orderProduct(line) || "订单";
      const size = text(line.size);
      const color = orderColor(line);
      const customerRank = matchRank(customer, query);
      const documentRank = Math.max(matchRank(documentNo, query), matchRank(identity, query), matchRank(line.orderId, query));
      const factRank = Math.max(
        matchRank(product, query),
        matchRank(size, query),
        matchRank(color, query),
        matchRank(line.bagColor, query),
        matchRank(line.printColor, query),
        matchRank(line.handleColor, query),
      );
      const rank = Math.max(customerRank, documentRank, factRank);
      if (!rank) continue;
      const score = 40 + customerRank * 20 + documentRank * 15 + factRank * 5;
      results.push({
        score,
        kind: "order",
        navId: "order-pool",
        recordId: identity,
        query: visibleQuery,
        title: `${customer} · ${product}`,
        detail: ["订单池", size, color, documentNo || identity].filter(Boolean).join(" · "),
      });
    }
  }

  results.sort((left, right) => right.score - left.score
    || left.title.localeCompare(right.title, "zh-CN")
    || left.recordId.localeCompare(right.recordId));
  return results.slice(0, limit).map(({ score, ...result }) => result);
}
