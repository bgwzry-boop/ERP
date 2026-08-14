import assert from "node:assert/strict";

import { createMiniappApiRuntime, createMiniappApiServer } from "../server/miniapp/miniappApiServer.mjs";
import { createMiniappBffService } from "../server/miniapp/miniappBffService.mjs";
import { createMiniappInMemoryRepository } from "../server/miniapp/miniappInMemoryRepository.mjs";
import { createMiniappAccessTokenService, fingerprintWechatSubject } from "../server/miniapp/miniappIdentityService.mjs";

const identityPepper = "test-identity-pepper-with-at-least-32-bytes";
const tokenSecret = "test-session-secret-with-at-least-32-bytes";
const identities = {
  "code-a": { openId: "openid-customer-a", unionId: "" },
  "code-b": { openId: "openid-customer-b", unionId: "" },
  "code-unbound": { openId: "openid-unbound", unionId: "" },
};

assert.throws(
  () => createMiniappApiRuntime({ runtimeMode: "production", repositoryMode: "memory" }),
  /requires MINIAPP_INTAKE_STORE=postgres/,
);
assert.throws(
  () => createMiniappApiRuntime({ repositoryMode: "unknown" }),
  /Unsupported Miniapp intake repository mode/,
);

const repository = createMiniappInMemoryRepository({
  bindings: [
    {
      id: "BIND-A",
      channel: "wechat_mini_program",
      externalSubjectFingerprint: fingerprintWechatSubject("openid-customer-a", identityPepper),
      customerId: "CUSTOMER-A",
      status: "active",
    },
    {
      id: "BIND-B",
      channel: "wechat_mini_program",
      externalSubjectFingerprint: fingerprintWechatSubject("openid-customer-b", identityPepper),
      customerId: "CUSTOMER-B",
      status: "active",
    },
  ],
});

const adapterCalls = [];
const erpAdapter = {
  async getBootstrap(context) {
    return { customer: { id: context.customerId, name: context.customerId === "CUSTOMER-A" ? "客户甲" : "客户乙" }, pendingCount: 0, announcement: null, employeeName: "不得返回" };
  },
  async getCatalog(context) {
    return { customerScope: context.customerId, priceVersion: "TEST-PRICE-V1", priceTableId: "INTERNAL", products: [{ id: "plain", name: "纯色袋", costPrice: 0.1 }] };
  },
  async getCustomerDefaults(context) {
    return { customerId: context.customerId, deliveryMethod: "到厂自提" };
  },
  async previewQuote(context, line) {
    adapterCalls.push({ type: "quote", customerId: context.customerId, line });
    const unitPrice = line.size === "30×37×10" ? 0.4 : 0.5;
    return { unitPrice, amount: Number((unitPrice * Number(line.quantity || 0)).toFixed(2)), priceVersion: "TEST-PRICE-V1", authoritative: false, grossMargin: 0.8 };
  },
  async checkInventory(context, line) {
    adapterCalls.push({ type: "inventory", customerId: context.customerId, line });
    return { status: "available", label: "库存充足", onHandQty: 9999, zone: "A-01" };
  },
};

const service = createMiniappBffService({
  repository,
  erpAdapter,
  identityProvider: {
    async exchange(code) {
      if (!identities[code]) throw new Error("unexpected test code");
      return identities[code];
    },
  },
  accessTokens: createMiniappAccessTokenService({ secret: tokenSecret }),
  identityPepper,
  now: () => new Date("2026-07-20T06:00:00.000Z"),
});

const server = createMiniappApiServer({ service });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.idempotencyKey ? { "x-idempotency-key": options.idempotencyKey } : {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

try {
  const health = await request("/healthz");
  assert.equal(health.status, 200);

  const unbound = await request("/v1/miniapp/session", { method: "POST", body: { code: "code-unbound" } });
  assert.equal(unbound.status, 403);
  assert.equal(unbound.body.code, "CUSTOMER_NOT_BOUND");

  const sessionA = await request("/v1/miniapp/session", { method: "POST", body: { code: "code-a" } });
  const sessionB = await request("/v1/miniapp/session", { method: "POST", body: { code: "code-b" } });
  assert.equal(sessionA.status, 200);
  assert.equal(sessionA.body.customerBinding, "bound");
  assert.equal(sessionA.body.expiresIn, 7200);

  const catalogA = await request("/v1/miniapp/catalog", { token: sessionA.body.accessToken });
  assert.equal(catalogA.status, 200);
  assert.equal(catalogA.body.customerScope, "CUSTOMER-A");
  assert.equal(catalogA.body.priceTableId, undefined);
  assert.equal(catalogA.body.products[0].costPrice, undefined);

  const payload = {
    customerId: "CUSTOMER-B",
    deliveryMethod: "到厂自提",
    desiredDate: "2026-07-21",
    desiredTime: "13:30",
    address: "客户提交的地址快照",
    quote: { amount: 1, authoritative: false },
    inventorySnapshots: [{ status: "available" }],
    lines: [{
      clientLineId: "L1",
      productType: "stock_plain",
      productName: "纯色袋",
      size: "30×37×10",
      colorId: "red",
      color: "红色",
      handleId: "regular",
      handle: "普通提",
      quantity: 500,
      unitPrice: 0.01,
      specialRequirements: ["snap_button", "not_allowed"],
    }],
  };
  const key = "order-test-key-0001";
  const incompletePrint = await request("/v1/miniapp/orders", {
    method: "POST",
    token: sessionA.body.accessToken,
    idempotencyKey: "order-invalid-print-0001",
    body: {
      ...payload,
      lines: [{
        clientLineId: "PRINT-1",
        productType: "custom_print",
        productName: "定制印刷",
        size: "30×37×10",
        colorId: "white",
        color: "白色",
        handleId: "regular",
        handle: "普通提",
        quantity: 3000,
      }],
    },
  });
  assert.equal(incompletePrint.status, 422);
  assert.equal(incompletePrint.body.code, "CUSTOM_PRINT_FIELD_REQUIRED");
  assert.equal(incompletePrint.body.details.field, "artworkToken");

  const created = await request("/v1/miniapp/orders", { method: "POST", token: sessionA.body.accessToken, idempotencyKey: key, body: payload });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "confirming");
  assert.equal(created.body.statusLabel, "工厂确认中");
  assert.equal(created.body.serverQuote.amount, 200);
  assert.equal(created.body.serverQuote.authoritative, false);
  assert.equal(created.body.serverQuote.lines[0].grossMargin, undefined);
  assert.equal(created.body.inventory.lines[0].onHandQty, undefined);
  assert.equal(created.body.inventory.lines[0].zone, undefined);
  assert.equal(created.body.replayed, false);

  const replay = await request("/v1/miniapp/orders", { method: "POST", token: sessionA.body.accessToken, idempotencyKey: key, body: payload });
  assert.equal(replay.status, 201);
  assert.equal(replay.body.orderId, created.body.orderId);
  assert.equal(replay.body.replayed, true);

  const conflict = await request("/v1/miniapp/orders", {
    method: "POST",
    token: sessionA.body.accessToken,
    idempotencyKey: key,
    body: { ...payload, desiredTime: "14:00" },
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, "IDEMPOTENCY_KEY_REUSED");

  const ownOrder = await request(`/v1/miniapp/orders/${created.body.orderId}`, { token: sessionA.body.accessToken });
  assert.equal(ownOrder.status, 200);
  assert.equal(ownOrder.body.amount, 200);

  const crossCustomer = await request(`/v1/miniapp/orders/${created.body.orderId}`, { token: sessionB.body.accessToken });
  assert.equal(crossCustomer.status, 404);

  const state = repository.inspect();
  assert.equal(state.submissions.length, 1, "idempotent retries must create one intake submission");
  assert.equal(state.submissions[0].customerId, "CUSTOMER-A", "bound customer must override client-supplied customerId");
  assert.equal(state.submissions[0].normalizedPayload.customerId, undefined);
  assert.equal(state.submissions[0].normalizedPayload.lines[0].unitPrice, undefined, "client price must not cross the trust boundary");
  assert.deepEqual(state.submissions[0].normalizedPayload.lines[0].specialRequirements, ["snap_button"]);
  assert.equal(state.submissions[0].status, "draft_created");
  assert.ok(state.submissions[0].draftId.startsWith("DRAFT-"));
  assert.ok(!Object.hasOwn(state.submissions[0], "formalOrderId"), "miniapp intake must not create a formal order");
  assert.ok(adapterCalls.every((call) => call.customerId === "CUSTOMER-A"));

  console.log("Miniapp BFF checks passed: binding, scoped reads, server-side quote/inventory, idempotent draft intake, and cross-customer isolation are enforced.");
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
