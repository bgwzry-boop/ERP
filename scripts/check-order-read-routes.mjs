import assert from "node:assert/strict";
import { handleOrderReadRoutes } from "../server/routes/orderReadRoutes.mjs";

const calls = [];
const workspace = {
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
