import assert from "node:assert/strict";
import { handleFulfillmentReadRoutes } from "../server/routes/fulfillmentReadRoutes.mjs";

const calls = [];
const workspace = {
  fulfillments: [
    { id: "F-1", lineId: "ORD-1", goods: "白袋", status: "待出库", method: "送货" },
    { id: "F-2", lineId: "ORD-2", goods: "黄袋", status: "已交付", method: "自提" },
  ],
};
const dependencies = {
  response: {},
  workspace,
  sendJson(response, status, body) {
    calls.push({ kind: "json", response, status, body });
  },
  sendNotFound(response, code) {
    calls.push({ kind: "notFound", response, code });
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
  toFulfillmentListItem(_workspace, item) {
    return { fulfillmentId: item.id, status: item.status, method: item.method };
  },
  buildFulfillmentMetrics(items) {
    return { openCount: items.filter((item) => item.status !== "已交付").length };
  },
};

assert.equal(
  await handleFulfillmentReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/fulfillments?method=%E9%80%81%E8%B4%A7&page=2") }),
  true,
);
assert.deepEqual(calls.pop(), {
  kind: "json",
  response: dependencies.response,
  status: 200,
  body: { items: [{ fulfillmentId: "F-1", status: "待出库", method: "送货" }], page: 2, total: 1, metrics: { openCount: 1 } },
});

assert.equal(
  await handleFulfillmentReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/fulfillments/F-1") }),
  true,
);
assert.deepEqual(calls.pop(), { kind: "json", response: dependencies.response, status: 200, body: workspace.fulfillments[0] });

assert.equal(
  await handleFulfillmentReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/fulfillments/MISSING") }),
  true,
);
assert.deepEqual(calls.pop(), { kind: "notFound", response: dependencies.response, code: "FULFILLMENT_NOT_FOUND" });

assert.equal(
  await handleFulfillmentReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/fulfillments/F-1/print") }),
  false,
);

console.log("fulfillment read routes checks passed");
