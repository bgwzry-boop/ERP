// 负责人 2026-11-04：客户 A 的单子常由他的外包印刷工 B、C 来拿货。给 A 开自提单时，
// 系统按以前来拿过货的人（以及客户资料里登记为「拿货人」的联系人）给出选项，最近来过的排前面；
// 来了新人直接输入名字，打印后就会出现在下次的选项里。
const clean = value => String(value ?? "").trim();
const timeOf = value => { const time = value instanceof Date ? value.getTime() : Date.parse(clean(value)); return Number.isFinite(time) ? time : 0; };
const isPickup = method => ["自提", "pickup", "自提出库"].includes(clean(method));

export function listFulfillmentPickerSuggestions({ workspace, customerId, limit = 10 }) {
  const id = clean(customerId);
  if (!id) return { customerId: "", items: [] };
  const seen = new Map();
  const add = (name, lastUsedAt, source) => {
    const value = clean(name).slice(0, 20);
    if (!value) return;
    const previous = seen.get(value);
    const time = timeOf(lastUsedAt);
    if (!previous || time > previous.time) seen.set(value, { name: value, time, source: previous?.source === "contact" ? "contact" : source });
  };
  for (const row of workspace.fulfillments ?? []) {
    if (clean(row.customerId) !== id || !isPickup(row.method)) continue;
    add(row.receiverName, row.updatedAt ?? row.confirmedAt ?? row.createdAt, "history");
  }
  const customer = (workspace.customers ?? []).find(row => clean(row.id ?? row.customerId) === id);
  for (const contact of customer?.contacts ?? []) {
    if (/拿货|提货/.test(clean(contact.role))) add(contact.contactName ?? contact.name, "", "contact");
  }
  const items = [...seen.values()]
    .sort((a, b) => b.time - a.time || a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, limit)
    .map(({ name, time, source }) => ({ name, lastUsedAt: time ? new Date(time).toISOString() : "", source }));
  return { customerId: id, items };
}
