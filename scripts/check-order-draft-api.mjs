import assert from "node:assert/strict";
import { createApiServer } from "../server/apiServer.mjs";

const server = createApiServer({ runtimeMode: "test", applyProductionEnvFile: false });
await server.ready;
await listen(server);

try {
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const headers = { "content-type": "application/json", "x-erp-user-id": "U-OFFICE-A" };
  const recognition = await requestJson(baseUrl, "/api/order-drafts/recognize", {
    method: "POST",
    headers,
    body: { sourceText: "王五包装 30*38红10个 明天自提", operatorId: "U-OFFICE-A" },
  });
  assert.equal(recognition.status, 200);
  assert.equal(recognition.json.draft.clientRevision, 1);
  const draftId = recognition.json.draft.draftId;
  const line = {
    draftLineId: `${draftId}-01-SAVED`,
    customerId: "C003",
    customer: "王五包装",
    productName: "空白袋",
    size: "30*38*10",
    bagColor: "红色",
    handleType: "普通提",
    style: "空白袋",
    qty: 10,
    fulfillmentMethod: "自提",
    latestNeededAt: "明天",
    printFlag: false,
  };

  const firstSave = await requestJson(baseUrl, `/api/order-drafts/${draftId}`, {
    method: "PATCH",
    headers,
    body: {
      sourceText: "王五包装 30*38红10个 明天自提",
      customerId: "C003",
      operatorId: "U-OFFICE-A",
      clientRevision: 1,
      draftStatus: "待补充信息",
      lines: [line],
    },
  });
  assert.equal(firstSave.status, 200);
  assert.equal(firstSave.json.draft.clientRevision, 2);
  assert.equal(firstSave.json.todos[0].type, "订单草稿待确认");

  const staleSave = await requestJson(baseUrl, `/api/order-drafts/${draftId}`, {
    method: "PATCH",
    headers,
    body: {
      sourceText: "旧页面覆盖尝试",
      customerId: "C003",
      operatorId: "U-OFFICE-A",
      clientRevision: 1,
      draftStatus: "待审核",
      lines: [line],
    },
  });
  assert.equal(staleSave.status, 409);
  assert.equal(staleSave.json.code, "BUSINESS_WRITE_CONFLICT");

  const secondSave = await requestJson(baseUrl, `/api/order-drafts/${draftId}`, {
    method: "PATCH",
    headers,
    body: {
      sourceText: "王五包装 30*38红10个 明天自提",
      customerId: "C003",
      operatorId: "U-OFFICE-A",
      clientRevision: 2,
      draftStatus: "待审核",
      lines: [line],
    },
  });
  assert.equal(secondSave.status, 200);
  assert.equal(secondSave.json.draft.clientRevision, 3);

  const missing = await requestJson(baseUrl, "/api/order-drafts/DRAFT-MISSING", {
    method: "PATCH",
    headers,
    body: { clientRevision: 1, lines: [line] },
  });
  assert.equal(missing.status, 404);
  assert.equal(missing.json.code, "ORDER_DRAFT_NOT_FOUND");
} finally {
  await close(server);
}

console.log("Order draft API check passed: committed revision increments, stale saves, and missing drafts are covered.");

function requestJson(baseUrl, pathname, options) {
  return fetch(`${baseUrl}${pathname}`, {
    method: options.method,
    headers: options.headers,
    body: JSON.stringify(options.body),
  }).then(async (response) => ({ status: response.status, json: await response.json() }));
}

function listen(serverInstance) {
  return new Promise((resolvePromise, reject) => {
    serverInstance.once("error", reject);
    serverInstance.listen(0, "127.0.0.1", resolvePromise);
  });
}

function close(serverInstance) {
  return new Promise((resolvePromise) => serverInstance.close(resolvePromise));
}
