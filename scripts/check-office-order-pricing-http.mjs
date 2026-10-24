import { quoteOfficeOrderDraft } from "../src/services/officeOrderPricingApiClient.js";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApiServer } from "../server/apiServer.mjs";
import { createLocalOrderConfirmationTransactionRepository } from "../server/orderConfirmationTransactionRepository.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { buildPublishedOrderPriceFixture } from "./helpers/publishedOrderPriceFixture.mjs";
import {
  closeTestServer,
  getTestServerBaseUrl,
  listenTestServer,
  requestJson,
} from "./helpers/apiIntegrationTestHarness.mjs";
const receiptInput = {
  draftId: "D-RECEIPT",
  clientRevision: 1,
  rows: [{ id: "EXPECTED-LINE", qty: 100, print: "否", orderType: "stock" }],
  authState: { session: { accessToken: "synthetic" } },
  idempotencyKey: "receipt-validation-key",
};
const validReceipt = {
  quote: {
    quoteId: "OQ-SYNTHETIC",
    draftId: "D-RECEIPT",
    clientRevision: 2,
    excludedDraftLineIds: [],
    groups: [],
    affectedOrders: [],
    lines: [
      {
        draftLineId: "EXPECTED-LINE",
        bagPrice: 0.9,
        printPrice: 0,
        otherFee: 0,
        adjustmentAmount: 0,
        chargeableQty: 100,
        amount: 90,
      },
    ],
  },
};
const receipt = async (value) =>
  quoteOfficeOrderDraft(receiptInput, {
    serverRequired: true,
    fetchImpl: async () =>
      new Response(JSON.stringify(value), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });
assert.equal((await receipt(validReceipt)).source, "api");
for (const mutate of [
  (q) => (q.clientRevision = 1),
  (q) => (q.lines[0].draftLineId = "OTHER-LINE"),
  (q) => q.lines.push({ ...q.lines[0] }),
  (q) => delete q.groups,
  (q) => delete q.affectedOrders,
  (q) => (q.lines[0].amount = -1),
  (q) => delete q.lines[0].chargeableQty,
  (q) => (q.lines[0].amount = 0),
]) {
  const bad = structuredClone(validReceipt);
  mutate(bad.quote);
  assert.equal(
    (await receipt(bad)).error.code,
    "ORDER_PRICE_QUOTE_RECEIPT_INVALID",
  );
}
const storageRoot = await mkdtemp(join(tmpdir(), "erp-office-quote-http-"));
const localConfirmation = createLocalOrderConfirmationTransactionRepository();
let liveWorkspace;
const printer = {
  id: "PRINTER-HTTP-PRICING",
  printDeviceId: "PRINTER-HTTP-PRICING",
  name: "合成办公室打印机",
  status: "active",
  driverMode: "system_printer",
  connectionType: "system_printer",
  supportedDocumentTypes: ["pickup_note"],
  defaultDocumentTypes: ["pickup_note"],
};
const server = createApiServer(
  withLocalRepositoryFixture({
    runtimeMode: "test",
    runtimeStorageRoot: storageRoot,
    seedSource: "synthetic",
    applyProductionEnvFile: false,
    authMode: "prototype",
    authSecret: randomBytes(32).toString("hex"),
    fixedPreviewUserId: "U-MANAGER-A",
    allowLegacyIdentityHeaders: false,
    allowActionPermissionOverride: false,
    allowDefaultSeedUser: false,
    orderConfirmationTransactionRepository: {
      ...localConfirmation,
      confirmOrder(input) {
        const result = localConfirmation.confirmOrder(input);
        liveWorkspace = input.workspace;
        return result;
      },
    },
    printDeviceRepository: {
      async listPrintDevices() {
        return [printer];
      },
      async getDefaultPrintDevice() {
        return printer;
      },
    },
    coreWorkspaceReadRepository: {
      kind: "local_memory",
      loadState: () => buildPublishedOrderPriceFixture({ bagPrice: 0.9 }),
    },
  }),
);
try {
  await server.ready;
  await listenTestServer(server);
  const base = getTestServerBaseUrl(server);
  let token;
  const api = (path, body, method = "POST") =>
    requestJson(base, `/api${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  assert.ok(
    [401, 403].includes(
      (await api("/order-drafts/missing/price-quote", { expectedRevision: 1 }))
        .status,
    ),
  );
  const login = await api("/auth/prototype-login", { userId: "U-MANAGER-A" });
  token = login.body.session.accessToken;
  const create = async (key, text = "王五包装 30*38红5000个 明天自提") => {
    const r = await api("/order-drafts/recognize", {
      customerId: "C003",
      sourceText: text,
      idempotencyKey: key,
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const draft = await create("http-office-quote-create");
  const id = draft.draft.draftId;
  const line = draft.lines[0];
  const price = await api(`/order-drafts/${id}/price-quote`, {
    expectedRevision: draft.draft.clientRevision,
    lines: draft.lines,
    idempotencyKey: "http-office-quote-valid",
    bagPrice: 0.01,
    overrides: [],
  });
  assert.equal(price.status, 200, JSON.stringify(price.body));
  assert.equal(price.body.quote.lines[0].bagPrice, 0.9);
  assert.equal(price.body.quote.lines[0].amount, 4500);
  const missing = await api(`/order-drafts/${id}/confirm`, {
    expectedRevision: price.body.quote.clientRevision,
    lines: draft.lines,
    idempotencyKey: "http-office-no-quote-id",
  });
  assert.equal(missing.status, 409);
  assert.equal(missing.body.code, "ORDER_PRICE_QUOTE_CHANGED");
  const confirmed = await api(`/order-drafts/${id}/confirm`, {
    expectedRevision: price.body.quote.clientRevision,
    lines: draft.lines,
    pricingQuoteId: price.body.quote.quoteId,
    idempotencyKey: "http-office-price-confirm",
    bagPrice: 0.01,
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal(confirmed.body.priceSnapshots[0].finalAmount, 4500);
  assert.equal(
    confirmed.body.priceSnapshots[0].sourceEvidence.officeQuoteId,
    price.body.quote.quoteId,
  );
  assert.equal(confirmed.body.priceSnapshots[0].createdBy, "U-MANAGER-A");
  const special = await create("http-office-special-create");
  const sid = special.draft.draftId;
  const lines = special.lines.map((l) => ({
    ...l,
    orderType: "custom_special",
    size: "43*31*12",
  }));
  const zeroReason = await api(`/order-drafts/${sid}/price-quote`, {
    expectedRevision: special.draft.clientRevision,
    lines,
    overrides: [{ draftLineId: line.draftLineId, bagPrice: 0.8 }],
    idempotencyKey: "http-office-reason-missing",
  });
  assert.equal(zeroReason.status, 422);
  const override = await api(`/order-drafts/${sid}/price-quote`, {
    expectedRevision: special.draft.clientRevision,
    lines,
    overrides: [
      {
        draftLineId: lines[0].draftLineId,
        bagPrice: 0.8,
        reason: "客户议价，已核对本单成交价",
      },
    ],
    operatorId: "FORGED",
    idempotencyKey: "http-office-override-valid",
  });
  assert.equal(override.status, 200, JSON.stringify(override.body));
  assert.equal(override.body.quote.lines[0].amount, 4000);
  assert.equal(override.body.quote.lines[0].override.operatorId, "U-MANAGER-A");
  const finish = await api(`/order-drafts/${sid}/confirm`, {
    expectedRevision: override.body.quote.clientRevision,
    lines,
    pricingQuoteId: override.body.quote.quoteId,
    idempotencyKey: "http-office-override-confirm",
  });
  assert.equal(finish.status, 200, JSON.stringify(finish.body));
  assert.equal(
    finish.body.priceSnapshots[0].overrideReason,
    "客户议价，已核对本单成交价",
  );

  const workspaceFacts = () =>
    structuredClone(
      Object.fromEntries(
        [
          "orderDrafts",
          "orders",
          "orderLines",
          "productionTasks",
          "priceSnapshots",
          "fulfillments",
          "inventories",
          "inventoryReservations",
          "inventoryLedgerEntries",
          "orderLineChangeRecords",
          "operationLogs",
          "rawMaterialInbounds",
          "printRecords",
          "printJobs",
          "paperOutboundDocuments",
        ].map((key) => [key, liveWorkspace[key] ?? []]),
      ),
    );
  const printLines = (draft, content) =>
    draft.lines.map((row) => ({
      ...row,
      orderType: "custom_print",
      print: "是",
      printFlag: true,
      product: content,
      productName: content,
      printSide: "单面",
      printColor: "黑色",
      printContent: content,
      artworkStatus: "已上传",
    }));
  const originalPrintingOrder = async (key) => {
    const source = await create(`${key}-original`);
    const rows = printLines(source, `合成HTTP商标-${key}`);
    const quote = await api(`/order-drafts/${source.draft.draftId}/price-quote`, {
      expectedRevision: source.draft.clientRevision,
      lines: rows,
      idempotencyKey: `${key}-original-quote`,
    });
    assert.equal(quote.status, 200, JSON.stringify(quote.body));
    const saved = await api(`/order-drafts/${source.draft.draftId}/confirm`, {
      expectedRevision: quote.body.quote.clientRevision,
      lines: rows,
      pricingQuoteId: quote.body.quote.quoteId,
      idempotencyKey: `${key}-original-confirm`,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const orderLineId = saved.body.orderLines[0].id;
    const task = liveWorkspace.productionTasks.find(
      (row) =>
        (row.orderLineId ?? row.lineId) === orderLineId &&
        /丝印|印刷/u.test(row.taskType),
    );
    assert.ok(task, "A confirmed printing order has an actual printing task");
    return { orderLineId, task, content: rows[0].printContent };
  };
  const prepareSupplement = async (original, key) => {
    const source = await create(`${key}-supplement`);
    const rows = printLines(source, original.content);
    const body = {
      expectedRevision: source.draft.clientRevision,
      lines: rows,
      supplementation: {
        orderLineIds: [original.orderLineId],
        targetDraftLineId: rows[0].draftLineId,
        confirmedSameBatch: true,
        batchReference: `HTTP-SAME-BATCH-${key}`,
        reason: "客户补单，在原印刷批次开印前一同印刷",
      },
      idempotencyKey: `${key}-supplement-quote`,
    };
    const quote = await api(
      `/order-drafts/${source.draft.draftId}/price-quote`,
      body,
    );
    assert.equal(quote.status, 200, JSON.stringify(quote.body));
    assert.equal(quote.body.quote.affectedOrders[0].revisedPrintPrice, 0.06);
    return {
      draftId: source.draft.draftId,
      quote: quote.body.quote,
      rows,
      quoteBody: { ...body, expectedRevision: quote.body.quote.clientRevision },
      confirmBody: {
        expectedRevision: quote.body.quote.clientRevision,
        lines: rows,
        pricingQuoteId: quote.body.quote.quoteId,
        confirmedAffectedOrderLineIds: [original.orderLineId],
        idempotencyKey: `${key}-supplement-confirm`,
      },
    };
  };
  const issueMaterial = async (original, key, task = original.task) => {
    const inboundId = `RAW-HTTP-${key}`;
    const rollId = `ROLL-HTTP-${key}`;
    const taskId = task.id ?? task.productionTaskId;
    const issueRecordId = `ISSUE-HTTP-${key}`;
    await liveWorkspace.rawMaterialInboundRepository.createRawMaterialInboundDraft({
      workspace: liveWorkspace,
      inbound: {
        id: inboundId,
        revision: 1,
        status: "已入库",
        unit: "kg",
        supplierName: "合成原料厂",
        rolls: [
          {
            id: rollId,
            weightKg: 10,
            inventoryStatus: "机边领用",
            issueRecordId,
            productionTaskId: taskId,
            machineId: task.machineId || "PRINT-HTTP-01",
          },
        ],
        rawMaterialIssueRecords: [
          {
            issueRecordId,
            rollId,
            machineId: task.machineId || "PRINT-HTTP-01",
            productionTaskId: taskId,
            productionTaskOrderLineId: original.orderLineId,
            productionTaskMatchStatus: "已匹配",
          },
        ],
      },
    });
    return { inboundId, rollId };
  };
  const consumeMaterial = async ({ inboundId, rollId }, key) => {
    const consumed = await api(
      `/raw-material-inbounds/${inboundId}/confirm-consumption`,
      {
        rollId,
        expectedRevision: 1,
        consumedWeightKg: 5,
        idempotencyKey: `${key}-consume`,
      },
    );
    assert.equal(consumed.status, 200, JSON.stringify(consumed.body));
    assert.equal(
      consumed.body.inbound.rawMaterialConsumptionRecords[0].consumedWeightKg,
      5,
    );
    assert.equal(
      (await liveWorkspace.rawMaterialInboundRepository.loadState())
        .rawMaterialInbounds.find((row) => row.id === inboundId)
        .rawMaterialConsumptionRecords[0].consumedWeightKg,
      5,
      "The signed consumption endpoint persisted a real positive consumption",
    );
  };
  const rejectStaleAndFreshSupplement = async (supplement, key, code) => {
    liveWorkspace.rawMaterialInbounds = (
      await liveWorkspace.rawMaterialInboundRepository.loadState()
    ).rawMaterialInbounds;
    liveWorkspace.printJobs = (
      await liveWorkspace.printJobRepository.loadState()
    ).printJobs;
    const before = workspaceFacts();
    const stale = await api(
      `/order-drafts/${supplement.draftId}/confirm`,
      supplement.confirmBody,
    );
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    assert.equal(stale.body.code, code);
    assert.deepEqual(workspaceFacts(), before, "A stale quote writes no order/price/audit data");
    const fresh = await api(
      `/order-drafts/${supplement.draftId}/price-quote`,
      { ...supplement.quoteBody, idempotencyKey: `${key}-fresh-quote` },
    );
    assert.equal(fresh.status, 409, JSON.stringify(fresh.body));
    assert.equal(fresh.body.code, code);
    assert.deepEqual(workspaceFacts(), before, "A rejected fresh quote changes no business data");
  };

  // The original task remains pending: only the real 5kg consumption proves
  // that printing has executed. A quote obtained before it must also fail.
  const consumedOriginal = await originalPrintingOrder("print-consumed");
  const consumedRoll = await issueMaterial(consumedOriginal, "print-consumed");
  const consumedSupplement = await prepareSupplement(consumedOriginal, "print-consumed");
  await consumeMaterial(consumedRoll, "print-consumed");
  await rejectStaleAndFreshSupplement(
    consumedSupplement,
    "print-consumed",
    "ORDER_PRINT_SUPPLEMENT_NOT_ELIGIBLE",
  );

  // Merely issuing a roll to the printing task is still eligible; do not
  // mistake a machine-side location for a positive consumption record.
  const issuedOriginal = await originalPrintingOrder("issued-only");
  await issueMaterial(issuedOriginal, "issued-only");
  const issuedSupplement = await prepareSupplement(issuedOriginal, "issued-only");
  const issuedConfirmed = await api(
    `/order-drafts/${issuedSupplement.draftId}/confirm`,
    issuedSupplement.confirmBody,
  );
  assert.equal(issuedConfirmed.status, 200, JSON.stringify(issuedConfirmed.body));

  // A bag-making task/report and material consumption do not prove that the
  // separate printing task has started. Both phases share the order identity.
  const bagOriginal = await originalPrintingOrder("bag-only");
  const bagTask = {
    ...bagOriginal.task,
    id: `TASK-BAG-HTTP-${bagOriginal.orderLineId}`,
    productionTaskId: `TASK-BAG-HTTP-${bagOriginal.orderLineId}`,
    taskType: "制袋",
    taskStatus: "制袋中",
    status: "制袋中",
    machineId: "BAG-HTTP-01",
  };
  liveWorkspace.productionTasks.push(bagTask);
  liveWorkspace.workshopReports.push({
    id: `REPORT-BAG-HTTP-${bagOriginal.orderLineId}`,
    orderLineId: bagOriginal.orderLineId,
    productionTaskId: bagTask.id,
    processType: "制袋",
    actualQty: 10,
  });
  const bagRoll = await issueMaterial(bagOriginal, "bag-only", bagTask);
  await consumeMaterial(bagRoll, "bag-only");
  const bagSupplement = await prepareSupplement(bagOriginal, "bag-only");
  const bagConfirmed = await api(
    `/order-drafts/${bagSupplement.draftId}/confirm`,
    bagSupplement.confirmBody,
  );
  assert.equal(bagConfirmed.status, 200, JSON.stringify(bagConfirmed.body));

  // Legacy status labels cannot hide an actual delivery timestamp.
  const deliveredOriginal = await originalPrintingOrder("physical-outbound");
  const deliveredSupplement = await prepareSupplement(deliveredOriginal, "physical-outbound");
  const deliveredFulfillment = liveWorkspace.fulfillments.find(
    (row) => (row.orderLineId ?? row.lineId) === deliveredOriginal.orderLineId,
  );
  assert.ok(deliveredFulfillment);
  deliveredFulfillment.status = "待出库";
  deliveredFulfillment.physicalOutboundAt = new Date().toISOString();
  await rejectStaleAndFreshSupplement(
    deliveredSupplement,
    "physical-outbound",
    "ORDER_PRINT_SUPPLEMENT_NOT_ELIGIBLE",
  );

  // A real signed print command persists its paper, record and queued job.
  // Supplementation must request explicit voiding instead of hiding them.
  const printedOriginal = await originalPrintingOrder("active-paper");
  const printedSupplement = await prepareSupplement(printedOriginal, "active-paper");
  const printedFulfillment = liveWorkspace.fulfillments.find(
    (row) => (row.orderLineId ?? row.lineId) === printedOriginal.orderLineId,
  );
  const printed = await api(`/fulfillments/${printedFulfillment.id}/print`, {
    printAction: "first_print",
    printDeviceId: printer.id,
    idempotencyKey: "http-supplement-active-paper",
  });
  assert.equal(printed.status, 200, JSON.stringify(printed.body));
  assert.ok(printed.body.printRecord);
  assert.ok(liveWorkspace.paperOutboundDocuments.some(
    (row) => row.fulfillmentId === printedFulfillment.id && row.status !== "已作废",
  ));
  await rejectStaleAndFreshSupplement(
    printedSupplement,
    "active-paper",
    "ERP_ORDER_DOCUMENTS_ACTIVE_CONFLICT",
  );
  console.log(
    "Office pricing signed HTTP: anonymous denial; authoritative quote and audited override; immutable accepted snapshots; real persisted 5kg printing consumption, delivery timestamps and signed active printing reject stale confirmation and fresh supplementation without partial writes; issue-only and bag-making execution/consumption remain eligible passed.",
  );
} finally {
  await closeTestServer(server);
  await rm(storageRoot, { recursive: true, force: true });
}
