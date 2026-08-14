import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  buildBagwinCanonicalRequest,
  createBagwinIntegrationAuthenticator,
  sha256Hex,
} from "../server/miniapp/bagwinIntegrationAuth.mjs";
import {
  buildBagwinCustomerExistsQuery,
  buildBagwinCustomerMappingExistsQuery,
  buildFindEffectiveBagwinPriceReleaseQuery,
  buildBagwinOrderStatusQuery,
  buildBagwinReconciliationExportQuery,
  buildClaimBagwinNonceQuery,
  buildCreateBagwinOrderTransaction,
  buildFindBagwinOrderQuery,
} from "../server/miniapp/bagwinErpIntegrationRepository.mjs";
import {
  bagwinPayloadSha256,
  createBagwinErpIntegrationService,
  projectBagwinPublicStatus,
} from "../server/miniapp/bagwinErpIntegrationService.mjs";
import { createBagwinErpIntegrationServer } from "../server/miniapp/bagwinErpIntegrationServer.mjs";

const now = new Date("2026-08-04T08:00:00.000Z");
const keyId = "bagwin-staging-v1";
const sharedSecret = "s".repeat(32);
const sourceOrderNo = "WT20260804ABCDEF1234";

const order = {
  schemaVersion: 1,
  sourceSystem: "miniapp",
  sourceOrderNo,
  submittedAt: "2026-08-04T07:59:00.000Z",
  customer: {
    miniappCustomerId: "11111111-1111-4111-8111-111111111111",
    erpCustomerId: "CUSTOMER-A",
    companyName: "测试客户",
    contactName: "测试联系人",
    mobileMasked: "138 **** 0000",
  },
  placedBy: {
    name: "采购员",
    phoneMasked: "138 **** 0000",
    role: "buyer",
  },
  delivery: {
    method: "到厂自提",
    desiredDate: "2026-08-06",
    desiredTime: "15:30",
    addressSnapshot: {},
    packagingPreference: "独立扎包",
  },
  pricing: {
    priceVersion: "PRICE-1",
    priceReleaseSha256: "a".repeat(64),
    estimatedAmount: 100,
    confirmedAmount: null,
  },
  lines: [{
    sourceLineId: "22222222-2222-4222-8222-222222222222",
    clientLineId: "L1",
    productType: "stock_plain",
    productName: "无纺布手提袋",
    skuId: "ERP-SKU-1",
    size: "30×37×10",
    colorId: "red",
    bagColor: "红色",
    handleId: "regular",
    handleColor: "红色",
    quantity: 1000,
    artworkFileId: null,
    artwork: null,
    specification: {},
    quoteSnapshot: {},
    inventorySnapshot: { status: "available" },
    estimatedAmount: 100,
  }],
};

function envelope(value = order) {
  return {
    schemaVersion: 1,
    sourceOrderNo: value.sourceOrderNo,
    payloadSha256: bagwinPayloadSha256(value),
    order: value,
  };
}

function createMemoryRepository() {
  const nonces = new Set();
  const orders = new Map();
  const created = [];
  return {
    created,
    async claim(input) {
      const token = `${input.keyId}:${input.nonce}`;
      if (nonces.has(token)) return false;
      nonces.add(token);
      return true;
    },
    async findBySourceOrderNo(source) {
      const item = orders.get(source);
      return item ? {
        sourceOrderNo: item.sourceOrderNo,
        erpOrderId: item.erpOrderId,
        payloadSha256: item.payloadSha256,
      } : null;
    },
    async customerExists(customerId) {
      return customerId === "CUSTOMER-A";
    },
    async customerMappingExists(input) {
      return input.miniappCustomerId === "11111111-1111-4111-8111-111111111111" &&
        input.erpCustomerId === "CUSTOMER-A";
    },
    async findEffectivePriceRelease(input) {
      return input.priceVersion === "PRICE-1" && input.payloadSha256 === "a".repeat(64)
        ? { id: "PRICE-RELEASE-1", priceVersion: "PRICE-1", payloadSha256: input.payloadSha256 }
        : null;
    },
    async createOrderIntake(input) {
      created.push(input);
      const existing = orders.get(input.sourceOrderNo);
      if (existing) return {
        sourceOrderNo: existing.sourceOrderNo,
        erpOrderId: existing.erpOrderId,
        payloadSha256: existing.payloadSha256,
        disposition: "existing",
      };
      const item = {
        sourceOrderNo: input.sourceOrderNo,
        erpOrderId: `INTAKE-${input.sourceOrderNo}`,
        payloadSha256: input.payloadSha256,
        payload: input.rawPayload,
      };
      orders.set(input.sourceOrderNo, item);
      return {
        sourceOrderNo: item.sourceOrderNo,
        erpOrderId: item.erpOrderId,
        payloadSha256: item.payloadSha256,
        disposition: "created",
      };
    },
    async getStatus(input) {
      const item = orders.get(input.sourceOrderNo);
      if (!item || item.erpOrderId !== input.erpOrderId) return null;
      return {
        ...item,
        intakeStatus: "confirmed",
        draftStatus: "已生成正式订单",
        formalOrderCount: 1,
        lineStatuses: ["生产中"],
        productionStatuses: ["进行中"],
        fulfillmentStatuses: [],
        expectedAt: "2026-08-06T15:30:00+08:00",
        observedAt: now.toISOString(),
      };
    },
    async exportReconciliation(input) {
      const items = [...orders.values()]
        .filter((item) => {
          const submittedAt = Date.parse(item.payload.submittedAt);
          return submittedAt >= input.from.getTime() && submittedAt < input.to.getTime();
        })
        .map((item) => ({
          ...item,
          sourceSubmittedAt: item.payload.submittedAt,
          intakeStatus: "confirmed",
          draftStatus: "已生成正式订单",
          formalOrderCount: 1,
          lineStatuses: ["生产中"],
          productionStatuses: ["进行中"],
          fulfillmentStatuses: [],
          observedAt: now.toISOString(),
          confirmedAmount: item.payload.pricing.confirmedAmount,
          lines: item.payload.lines.map((line) => ({ skuId: line.skuId, quantity: line.quantity })),
        }));
      return { sourceOrderCount: items.length, orders: items };
    },
  };
}

let nonceCounter = 0;
function nextNonce() {
  nonceCounter += 1;
  return nonceCounter.toString(16).padStart(32, "0");
}

function signedRequest(path, options = {}) {
  const method = options.method ?? "GET";
  const body = options.body === undefined ? "" : JSON.stringify(options.body);
  const nonce = options.nonce ?? nextNonce();
  const timestamp = options.timestamp ?? now.toISOString();
  const bodySha256 = sha256Hex(body);
  const signature = createHmac("sha256", sharedSecret).update(buildBagwinCanonicalRequest({
    timestamp,
    nonce,
    method,
    pathAndQuery: path,
    bodySha256,
  })).digest("hex");
  return {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      "x-bagwin-auth-version": "1",
      "x-bagwin-key-id": keyId,
      "x-bagwin-timestamp": timestamp,
      "x-bagwin-nonce": nonce,
      "x-bagwin-content-sha256": bodySha256,
      "x-bagwin-signature": options.signature ?? signature,
    },
    ...(body ? { body } : {}),
  };
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, signedRequest(path, options));
  return { status: response.status, body: await response.json() };
}

const nonceQuery = buildClaimBagwinNonceQuery({
  keyId,
  nonce: "1".repeat(32),
  requestTimestamp: now.toISOString(),
  expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
});
assert.match(nonceQuery.text, /ON CONFLICT \(key_id, nonce\) DO NOTHING/);
assert.doesNotMatch(nonceQuery.text, new RegExp(keyId));
assert.equal(nonceQuery.values[0], keyId);

const lookupQuery = buildFindBagwinOrderQuery(sourceOrderNo);
assert.match(lookupQuery.text, /idempotency_scope = 'bagwin:orders'/);
assert.deepEqual(lookupQuery.values, [sourceOrderNo]);

const customerQuery = buildBagwinCustomerExistsQuery("CUSTOMER-A");
assert.match(customerQuery.text, /FROM customers/);
assert.deepEqual(customerQuery.values, ["CUSTOMER-A"]);
const customerMappingQuery = buildBagwinCustomerMappingExistsQuery({
  miniappCustomerId: order.customer.miniappCustomerId,
  erpCustomerId: order.customer.erpCustomerId,
});
assert.match(customerMappingQuery.text, /miniapp_customer_accounts/);
assert.deepEqual(customerMappingQuery.values, [order.customer.miniappCustomerId, "CUSTOMER-A"]);

const priceReleaseQuery = buildFindEffectiveBagwinPriceReleaseQuery({
  priceVersion: "PRICE-1",
  payloadSha256: "a".repeat(64),
  submittedAt: order.submittedAt,
});
assert.match(priceReleaseQuery.text, /miniapp_price_releases/);
assert.match(priceReleaseQuery.text, /bff_activated_at/);
assert.deepEqual(priceReleaseQuery.values.slice(0, 2), ["PRICE-1", "a".repeat(64)]);

const statusQuery = buildBagwinOrderStatusQuery({ sourceOrderNo, erpOrderId: `INTAKE-${sourceOrderNo}` });
assert.match(statusQuery.text, /original_orders/);
assert.match(statusQuery.text, /production_tasks/);
assert.match(statusQuery.text, /fulfillment_records/);
assert.doesNotMatch(statusQuery.text, new RegExp(sourceOrderNo));

const reconciliationQuery = buildBagwinReconciliationExportQuery({
  from: "2026-08-04T07:00:00.000Z",
  to: "2026-08-04T08:00:00.000Z",
});
assert.match(reconciliationQuery.text, /idempotency_scope = 'bagwin:orders'/);
assert.match(reconciliationQuery.text, /sourceOrderCount/);
assert.match(reconciliationQuery.text, /normalized_line_json->>'skuId'/);
assert.match(reconciliationQuery.text, /LIMIT \$3::integer/);

const createQuery = buildCreateBagwinOrderTransaction({
  sourceOrderNo,
  customerId: "CUSTOMER-A",
  payloadSha256: envelope().payloadSha256,
  rawPayload: order,
  normalizedPayload: {
    deliveryMethod: "到厂自提",
    desiredDate: "2026-08-06",
    desiredTime: "15:30",
    addressId: "",
    address: {},
    packagingPreference: "",
    lines: [{
      clientLineId: "L1", productType: "stock_plain", productName: "无纺布手提袋",
      size: "30×37×10", colorId: "red", color: "红色", handleId: "regular",
      handle: "regular", handleColor: "红色", quantity: 1000,
      specialRequirements: [], specialRequirementNote: "",
    }],
  },
  serverQuote: { amount: 100, priceVersion: "PRICE-1", lines: [] },
  inventory: { status: "confirm", label: "库存需确认", lines: [] },
  receivedAt: order.submittedAt,
});
assert.match(createQuery.text, /INSERT INTO order_intake_submissions/);
assert.match(createQuery.text, /INSERT INTO order_drafts/);
assert.match(createQuery.text, /INSERT INTO todos/);
assert.doesNotMatch(createQuery.text, /INSERT INTO original_orders/);
assert.equal(createQuery.ids.intakeId, `INTAKE-${sourceOrderNo}`);

const migration = await readFile(new URL("../db/migrations/0033_bagwin_integration_hmac.sql", import.meta.url), "utf8");
assert.match(migration, /PRIMARY KEY \(key_id, nonce\)/);
assert.match(migration, /expires_at > request_timestamp/);

const repository = createMemoryRepository();
const service = createBagwinErpIntegrationService({ repository, now: () => now });
const authenticator = createBagwinIntegrationAuthenticator({
  keyId,
  sharedSecret,
  nonceStore: repository,
  now: () => now,
});
const server = createBagwinErpIntegrationServer({ service, authenticator, basePath: "/api" });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const healthResponse = await fetch(`${baseUrl}/healthz`);
  assert.equal(healthResponse.status, 200);

  const lookupPath = `/api/v1/integrations/bagwin/orders/by-source/${sourceOrderNo}`;
  const missing = await request(baseUrl, lookupPath);
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, "BAGWIN_ORDER_NOT_FOUND");

  const rejected = await fetch(`${baseUrl}${lookupPath}`, signedRequest(lookupPath, { signature: "0".repeat(64) }));
  assert.equal(rejected.status, 401);

  const createPath = "/api/v1/integrations/bagwin/orders";
  const created = await request(baseUrl, createPath, { method: "POST", body: envelope() });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body, {
    schemaVersion: 1,
    sourceOrderNo,
    erpOrderId: `INTAKE-${sourceOrderNo}`,
    payloadSha256: envelope().payloadSha256,
    disposition: "created",
  });
  assert.equal(repository.created.length, 1);
  assert.equal(repository.created[0].customerId, "CUSTOMER-A");
  assert.equal(repository.created[0].serverQuote.authoritative, true);
  assert.equal(repository.created[0].serverQuote.priceReleaseId, "PRICE-RELEASE-1");
  assert.equal(repository.created[0].serverQuote.priceReleaseSha256, "a".repeat(64));
  assert.equal(repository.created[0].normalizedPayload.customerSnapshot.companyName, "测试客户");
  assert.equal(Object.hasOwn(repository.created[0], "formalOrderId"), false);

  const retry = await request(baseUrl, createPath, { method: "POST", body: envelope() });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.disposition, "existing");
  assert.equal(repository.created.length, 1);

  const replayNonce = nextNonce();
  const firstLookup = await fetch(`${baseUrl}${lookupPath}`, signedRequest(lookupPath, { nonce: replayNonce }));
  assert.equal(firstLookup.status, 200);
  const replayLookup = await fetch(`${baseUrl}${lookupPath}`, signedRequest(lookupPath, { nonce: replayNonce }));
  assert.equal(replayLookup.status, 401);
  assert.equal((await replayLookup.json()).code, "BAGWIN_AUTH_REPLAYED");

  const changedOrder = {
    ...order,
    lines: [{ ...order.lines[0], quantity: 1001 }],
  };
  const conflict = await request(baseUrl, createPath, { method: "POST", body: envelope(changedOrder) });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, "BAGWIN_ORDER_PAYLOAD_CONFLICT");

  const statusPath = `/api/v1/integrations/bagwin/orders/${encodeURIComponent(`INTAKE-${sourceOrderNo}`)}/status?sourceOrderNo=${sourceOrderNo}`;
  const status = await request(baseUrl, statusPath);
  assert.equal(status.status, 200);
  assert.equal(status.body.status, "production");
  assert.equal(status.body.expectedDeliveryDate, "2026-08-06");
  assert.equal(status.body.expectedDeliveryTime, "15:30");
  assert.equal(status.body.productionStatuses, undefined);
  assert.equal(status.body.lineStatuses, undefined);

  const reconciliationPath = "/api/v1/integrations/bagwin/orders/reconciliation-export";
  const reconciliation = await request(baseUrl, reconciliationPath, {
    method: "POST",
    body: {
      schemaVersion: 1,
      window: {
        from: "2026-08-04T07:58:00.000Z",
        to: "2026-08-04T07:59:30.000Z",
      },
    },
  });
  assert.equal(reconciliation.status, 200);
  assert.equal(reconciliation.body.sourceSystem, "erp");
  assert.equal(reconciliation.body.completeness.status, "complete");
  assert.equal(reconciliation.body.completeness.nextCursor, null);
  assert.equal(reconciliation.body.orders.length, 1);
  assert.deepEqual(reconciliation.body.orders[0].lines, [{ skuId: "ERP-SKU-1", quantity: 1000 }]);
  assert.equal(reconciliation.body.orders[0].status, "production");

  const missingCustomerOrder = {
    ...order,
    sourceOrderNo: "WT20260804FFFFFFFFFF",
    customer: { ...order.customer, erpCustomerId: "CUSTOMER-MISSING" },
  };
  const missingCustomer = await request(baseUrl, createPath, { method: "POST", body: envelope(missingCustomerOrder) });
  assert.equal(missingCustomer.status, 422);
  assert.equal(missingCustomer.body.code, "BAGWIN_ERP_CUSTOMER_NOT_FOUND");

  const stale = await request(baseUrl, lookupPath, { timestamp: "2026-08-04T07:00:00.000Z" });
  assert.equal(stale.status, 401);
  assert.equal(stale.body.code, "BAGWIN_AUTH_TIMESTAMP_INVALID");

  assert.equal(projectBagwinPublicStatus({
    sourceOrderNo,
    erpOrderId: `INTAKE-${sourceOrderNo}`,
    intakeStatus: "returned",
    draftStatus: "待补充资料",
  }, now).status, "needs_information");

  assert.equal(projectBagwinPublicStatus({
    sourceOrderNo,
    erpOrderId: `INTAKE-${sourceOrderNo}`,
    formalOrderCount: 1,
    lineStatuses: ["待排产"],
    productionStatuses: ["待开始"],
  }, now).status, "production", "待排产 is a customer-visible production stage");

  assert.equal(projectBagwinPublicStatus({
    sourceOrderNo,
    erpOrderId: `INTAKE-${sourceOrderNo}`,
    formalOrderCount: 1,
    lineStatuses: ["丝印中"],
    productionStatuses: ["进行中"],
  }, now).status, "production");

  assert.equal(projectBagwinPublicStatus({
    sourceOrderNo,
    erpOrderId: `INTAKE-${sourceOrderNo}`,
    formalOrderCount: 1,
    lineStatuses: ["待出库"],
    fulfillmentStatuses: [],
  }, now).status, "delivery", "line delivery state must project even before a fulfillment snapshot appears");

  assert.equal(projectBagwinPublicStatus({
    sourceOrderNo,
    erpOrderId: `INTAKE-${sourceOrderNo}`,
    formalOrderCount: 1,
    lineStatuses: ["丝印中", "已取消"],
    productionStatuses: ["进行中"],
  }, now).status, "production", "one cancelled line must not cancel a multi-line order");

  assert.equal(projectBagwinPublicStatus({
    sourceOrderNo,
    erpOrderId: `INTAKE-${sourceOrderNo}`,
    formalOrderCount: 1,
    lineStatuses: ["已取消", "作废"],
  }, now).status, "cancelled");

  assert.equal(projectBagwinPublicStatus({
    sourceOrderNo,
    erpOrderId: `INTAKE-${sourceOrderNo}`,
    formalOrderCount: 1,
    lineStatuses: ["待确认"],
    productionStatuses: ["已完成"],
  }, now).status, "stocking", "a historical completed task alone must not falsely keep the order in production");

  console.log("Bagwin ERP integration checks passed: HMAC, replay protection, source lookup, draft-only intake, authoritative price-release lock, digest conflict, customer mapping, line-aware status projection, and complete reconciliation export are enforced.");
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
