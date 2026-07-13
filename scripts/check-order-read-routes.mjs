import assert from "node:assert/strict";
import { handleOrderReadRoutes } from "../server/routes/orderReadRoutes.mjs";

const calls = [];
const workspace = {
  orderDrafts: [
    {
      id: "DRAFT-Q-1",
      draftId: "DRAFT-Q-1",
      customerId: "C001",
      status: "待审核",
      recognitionContext: { queueBatchId: "QBAT-1", queueItemId: "QITEM-1", queueKind: "order_draft" },
    },
    {
      id: "DRAFT-Q-2",
      draftId: "DRAFT-Q-2",
      customerId: "C001",
      status: "询库存-待客户确认",
      recognitionContext: { queueBatchId: "QBAT-1", queueItemId: "QITEM-2", queueKind: "inventory_inquiry" },
    },
  ],
  orderDraftRepository: { kind: "local_memory" },
  inventoryIntents: [{ intentId: "INT-Q-1", sourceDraftId: "DRAFT-Q-2", intentStatus: "库存不足取消-待关联" }],
  orderPoolReadRepository: {
    async listOrderLines({ query }) {
      return { items: [{ orderLineId: "ORD-1" }], page: Number(query.get("page") ?? 1) };
    },
    async getOrderLineDetail({ orderLineId }) {
      return orderLineId === "ORD-1" ? { orderLineId } : null;
    },
  },
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
};

assert.equal(
  await handleOrderReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/order-lines?page=2") }),
  true,
);
assert.deepEqual(calls.pop(), {
  kind: "json",
  response: dependencies.response,
  status: 200,
  body: { items: [{ orderLineId: "ORD-1" }], page: 2 },
});

assert.equal(
  await handleOrderReadRoutes({
    ...dependencies,
    url: new URL("http://erp.test/api/order-drafts?draftId=DRAFT-Q-2&pageSize=1"),
  }),
  true,
);
assert.equal(calls.at(-1).body.items.length, 1);
assert.equal(calls.at(-1).body.items[0].id, "DRAFT-Q-2");
calls.pop();

assert.equal(
  await handleOrderReadRoutes({
    ...dependencies,
    url: new URL("http://erp.test/api/order-drafts?queueOnly=true&queueBatchId=QBAT-1&pageSize=20"),
  }),
  true,
);
assert.deepEqual(calls.pop(), {
  kind: "json",
  response: dependencies.response,
  status: 200,
  body: {
    items: workspace.orderDrafts.map((draft) => ({
      ...draft,
      inventoryIntents: draft.id === "DRAFT-Q-2" ? workspace.inventoryIntents : [],
    })),
    page: 1,
    pageSize: 20,
    total: 2,
    summary: { orderDraftCount: 1, intentDraftCount: 1, reviewCount: 2 },
  },
});

assert.equal(
  await handleOrderReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/order-lines/ORD-1") }),
  true,
);
assert.deepEqual(calls.pop(), {
  kind: "json",
  response: dependencies.response,
  status: 200,
  body: { orderLineId: "ORD-1" },
});

assert.equal(
  await handleOrderReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/order-lines/UNKNOWN") }),
  true,
);
assert.deepEqual(calls.pop(), { kind: "notFound", response: dependencies.response, code: "ORDER_LINE_NOT_FOUND" });

assert.equal(
  await handleOrderReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/fulfillments") }),
  false,
);

console.log("order read routes checks passed");
