import assert from "node:assert/strict";
import { createApiServer } from "../server/apiServer.mjs";

const server = createApiServer({ runtimeMode: "test", applyProductionEnvFile: false });
await server.ready;
await listen(server);

try {
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const headers = { "content-type": "application/json", "x-erp-user-id": "U-OFFICE-A" };
  const recognition = await writeJson(baseUrl, "/order-drafts/recognize", {
    sourceMessages: [
      {
        id: "MSG-SPLIT-API-001",
        conversationId: "GROUP-SPLIT-API",
        customerId: "C001",
        sender: "张三服饰",
        senderRole: "customer",
        sentAt: "2099-07-12 09:00",
        text: "30*38 红色10个 明天自提",
      },
      {
        id: "MSG-SPLIT-API-002",
        conversationId: "GROUP-SPLIT-API",
        customerId: "C001",
        sender: "张三服饰",
        senderRole: "customer",
        sentAt: "2099-07-12 09:02",
        text: "再加 30*38 红色20个 后天送货",
      },
    ],
    customerId: "C001",
    currentDraftStatus: "待审核",
    idempotencyKey: "order-draft-split-recognize-api-001",
  }, headers);
  assert.equal(recognition.lines.length, 2);
  assert.equal(recognition.recognition.summary.originalOrderCount, 1);

  const preview = await writeJson(
    baseUrl,
    `/order-drafts/${encodeURIComponent(recognition.draft.draftId)}/split-preview`,
    {
      clientRevision: recognition.draft.clientRevision,
      sourceText: "同一客户两个交付批次",
      lines: recognition.lines,
    },
    headers,
  );
  assert.equal(preview.splitPlan.groups.length, 2);
  assert.equal(preview.splitPlan.canConfirm, true);
  assert.equal(preview.splitPlan.groups.reduce((sum, group) => sum + group.quantityTotal, 0), 30);
  assert.deepEqual(new Set(preview.splitPlan.groups.map((group) => group.fulfillmentMethod)), new Set(["自提", "送货"]));

  const confirmation = await writeJson(
    baseUrl,
    `/order-drafts/${encodeURIComponent(recognition.draft.draftId)}/split-confirm`,
    {
      clientRevision: recognition.draft.clientRevision,
      sourceText: "同一客户两个交付批次",
      lines: recognition.lines,
      splitPlanHash: preview.splitPlan.planHash,
      idempotencyKey: "order-draft-split-confirm-api-001",
    },
    headers,
  );
  assert.equal(confirmation.splitConfirmed, true);
  assert.equal(confirmation.orderIds.length, 2);
  assert.equal(new Set(confirmation.orderIds).size, 2);
  assert.equal(confirmation.orderLines.length, 2);
  assert.equal(confirmation.fulfillmentTasks.length, 2);

  const orderPool = await getJson(baseUrl, "/order-lines?customerId=C001&pageSize=100", headers);
  const splitLines = orderPool.items.filter((line) => confirmation.orderIds.includes(line.orderNo));
  assert.equal(splitLines.length, 2);
  assert.deepEqual(new Set(splitLines.map((line) => line.orderNo)), new Set(confirmation.orderIds));
  assert.deepEqual(new Set(splitLines.map((line) => line.fulfillmentMethod)), new Set(["自提", "送货"]));

  const replay = await writeJson(
    baseUrl,
    `/order-drafts/${encodeURIComponent(recognition.draft.draftId)}/split-confirm`,
    {
      clientRevision: recognition.draft.clientRevision,
      sourceText: "同一客户两个交付批次",
      lines: recognition.lines,
      splitPlanHash: preview.splitPlan.planHash,
      idempotencyKey: "order-draft-split-confirm-api-001",
    },
    headers,
  );
  assert.deepEqual(replay, confirmation, "same-key split confirmation must replay the first success response");
  const orderPoolAfterReplay = await getJson(baseUrl, "/order-lines?customerId=C001&pageSize=100", headers);
  assert.equal(
    orderPoolAfterReplay.items.filter((line) => confirmation.orderIds.includes(line.orderNo)).length,
    2,
    "repeated split confirmation must not create duplicate orders",
  );

  const reusedKeyConflict = await writeJson(
    baseUrl,
    `/order-drafts/${encodeURIComponent(recognition.draft.draftId)}/split-confirm`,
    {
      clientRevision: recognition.draft.clientRevision,
      sourceText: "同一幂等键但请求内容变化",
      lines: recognition.lines,
      splitPlanHash: preview.splitPlan.planHash,
      idempotencyKey: "order-draft-split-confirm-api-001",
    },
    headers,
    409,
  );
  assert.equal(reusedKeyConflict.code, "IDEMPOTENCY_KEY_REUSED");

  console.log("Order draft split API check passed: backend preview, reviewed-plan hash, atomic multi-order confirmation, exact success replay, and changed-payload rejection are covered.");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

async function getJson(baseUrl, path, headers) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  const json = await response.json();
  assert.equal(response.status, 200, JSON.stringify(json));
  return json;
}

async function writeJson(baseUrl, path, body, headers, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(json));
  return json;
}

function listen(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.once("error", reject);
    serverInstance.listen(0, "127.0.0.1", resolve);
  });
}
