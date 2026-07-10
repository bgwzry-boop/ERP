import assert from "node:assert/strict";
import { handleInventoryReadRoutes } from "../server/routes/inventoryReadRoutes.mjs";

const calls = [];
const workspace = {
  inventories: [
    { id: "INV-1", size: "30*38", color: "白色", handle: "普通提", style: "空白袋", zone: "A", state: "可用" },
    { id: "INV-2", size: "25*32", color: "黄色", handle: "加长提", style: "背心袋", zone: "B", state: "占用" },
  ],
  inventoryLedgerReadRepository: {
    async listInventoryLedgerEntries({ query }) {
      return { items: [{ ledgerEntryId: "LED-1" }], page: Number(query.get("page") ?? 1) };
    },
  },
  inventoryCorrectionDrafts: [{ correctionDraftId: "ICD-1", inventoryItemId: "INV-1" }],
};
const dependencies = {
  response: {},
  workspace,
  sendJson(response, status, body) {
    calls.push({ response, status, body });
  },
  sendNotFound(response, code) {
    calls.push({ response, status: 404, body: { code } });
  },
  filterByKeyword(items, keyword, fields) {
    if (!keyword) return items;
    return items.filter((item) => fields.some((field) => item[field]?.includes(keyword)));
  },
  filterByValue(items, value, field) {
    return value ? items.filter((item) => item[field] === value) : items;
  },
  paginate(items, query) {
    return { items, page: Number(query.get("page") ?? 1), total: items.length };
  },
  cleanServerText(value) {
    return String(value ?? "").trim();
  },
  findInventoryCorrectionDraft(_workspace, correctionDraftId) {
    return workspace.inventoryCorrectionDrafts.find((item) => item.correctionDraftId === correctionDraftId) ?? null;
  },
  buildInventoryCorrectionDraftDetail(_workspace, draft) {
    return { correctionDraftId: draft.correctionDraftId, detail: true };
  },
  filterInventoryCorrectionDraftSummaries(items) {
    return items;
  },
  toInventoryCorrectionDraftSummary(_workspace, draft) {
    return { correctionDraftId: draft.correctionDraftId };
  },
};

assert.equal(
  await handleInventoryReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/inventory/items?color=%E7%99%BD%E8%89%B2&page=2") }),
  true,
);
assert.deepEqual(calls.pop(), {
  response: dependencies.response,
  status: 200,
  body: { items: [workspace.inventories[0]], page: 2, total: 1 },
});

assert.equal(
  await handleInventoryReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/inventory/correction-drafts?page=2") }),
  true,
);
assert.deepEqual(calls.pop(), {
  response: dependencies.response,
  status: 200,
  body: {
    items: [{ correctionDraftId: "ICD-1" }],
    page: 2,
    total: 1,
    filters: { status: "待确认生效", inventoryItemId: "", keyword: "" },
  },
});

assert.equal(
  await handleInventoryReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/inventory/correction-drafts/ICD-1") }),
  true,
);
assert.deepEqual(calls.pop(), {
  response: dependencies.response,
  status: 200,
  body: { correctionDraftId: "ICD-1", detail: true },
});

assert.equal(
  await handleInventoryReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/inventory/correction-drafts/MISSING") }), true);
assert.deepEqual(calls.pop(), { response: dependencies.response, status: 404, body: { code: "INVENTORY_CORRECTION_DRAFT_NOT_FOUND" } });

assert.equal(
  await handleInventoryReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/inventory/ledger-entries?page=3") }),
  true,
);
assert.deepEqual(calls.pop(), {
  response: dependencies.response,
  status: 200,
  body: { items: [{ ledgerEntryId: "LED-1" }], page: 3 },
});

assert.equal(
  await handleInventoryReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/fulfillments") }),
  false,
);

console.log("inventory read routes checks passed");
