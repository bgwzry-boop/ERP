import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { loadMigrationFiles, validateMigrationSet } from "./dbMigrationUtils.mjs";
import { closeSharedPostgresPools } from "../server/postgresPoolClient.mjs";
import { createPostgresErpPriceReleaseRepository } from "../server/miniapp/erpPriceReleaseRepository.mjs";
import {
  createErpPriceReleaseService,
  erpPriceReleaseSha256,
} from "../server/miniapp/erpPriceReleaseService.mjs";
import { createPostgresErpPriceReleaseDeliveryRepository } from "../server/miniapp/erpPriceReleaseDeliveryRepository.mjs";
import { createErpPriceReleaseDeliveryAdapter } from "../server/miniapp/erpPriceReleaseDeliveryAdapter.mjs";
import { createErpPriceReleaseDeliveryWorker } from "../server/miniapp/erpPriceReleaseDeliveryWorker.mjs";
import { createPostgresBagwinErpIntegrationRepository } from "../server/miniapp/bagwinErpIntegrationRepository.mjs";
import { createBagwinErpIntegrationRuntime } from "../server/miniapp/bagwinErpIntegrationServer.mjs";
import { createLocalAttachmentObjectStorage } from "../server/attachmentObjectStorage.mjs";
import { createMiniappArtworkTransferAdapter } from "../server/miniapp/miniappArtworkTransferAdapter.mjs";
import { createPostgresMiniappArtworkTransferRepository } from "../server/miniapp/miniappArtworkTransferRepository.mjs";
import { createMiniappArtworkTransferWorker } from "../server/miniapp/miniappArtworkTransferWorker.mjs";

import { migrate } from "../../下单小程序/server/src/db/migrate.ts";
import { createPool } from "../../下单小程序/server/src/db/pool.ts";
import { requestHash } from "../../下单小程序/server/src/shared/canonical-json.ts";
import {
  loadCatalogFile,
  loadCustomerPriceFile,
} from "../../下单小程序/server/src/modules/master-data/master-data-files.ts";
import {
  publicSpecialQuoteRules,
  specialBagMaterialPriceSnapshot,
  specialBagPricingRules,
} from "../../下单小程序/server/src/modules/special-quotes/special-pricing.ts";
import {
  ErpPriceReleaseAuthenticator,
  PostgresErpPriceReleaseNonceStore,
} from "../../下单小程序/server/src/modules/erp-price-releases/erp-price-release-auth.ts";
import { createErpPriceReleaseInboundServer } from "../../下单小程序/server/src/modules/erp-price-releases/erp-price-release-inbound-server.ts";
import { PostgresErpPriceReleaseService } from "../../下单小程序/server/src/modules/erp-price-releases/erp-price-release-service.ts";
import { OrderRepository } from "../../下单小程序/server/src/modules/orders/order-repository.ts";
import { LocalObjectStorage } from "../../下单小程序/server/src/adapters/object-storage.ts";
import {
  ErpArtworkAuthenticator,
  PostgresErpArtworkNonceStore,
} from "../../下单小程序/server/src/modules/erp-artwork-transfer/erp-artwork-auth.ts";
import { createErpArtworkInboundServer } from "../../下单小程序/server/src/modules/erp-artwork-transfer/erp-artwork-inbound-server.ts";
import { PostgresErpArtworkTransferRepository } from "../../下单小程序/server/src/modules/erp-artwork-transfer/erp-artwork-repository.ts";
import { HttpErpOrderAdapter } from "../../下单小程序/server/src/modules/erp/http-erp-adapter.ts";
import { ErpSyncRepository } from "../../下单小程序/server/src/modules/erp/erp-sync-repository.ts";
import { ErpSyncWorker } from "../../下单小程序/server/src/modules/erp/erp-sync-worker.ts";
import {
  ErpReconciliationRepository,
} from "../../下单小程序/server/src/modules/erp/erp-reconciliation-repository.ts";
import {
  parseErpReconciliationExport,
  reconcileErpOrders,
} from "../../下单小程序/server/src/modules/erp/erp-reconciliation.ts";

const { Pool } = pg;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const erpRoot = path.resolve(scriptDirectory, "..");
const miniappRoot = path.resolve(erpRoot, "../下单小程序");
const dockerImage = process.env.ERP_POSTGRES_DOCKER_IMAGE || "postgres:16-alpine";
const runId = `${process.pid}-${Date.now()}`;
const erpContainer = `erp-miniapp-dual-erp-${runId}`;
const miniappContainer = `erp-miniapp-dual-bff-${runId}`;
const erpDatabaseName = "erp_miniapp_integration_test";
const miniappDatabaseName = "miniapp_test_dual";
const miniappCustomerId = "11111111-1111-4111-8111-111111111111";
const erpCustomerId = "CUSTOMER-DUAL-E2E";
const priceKeyId = "dual-price-release-v1";
const priceSharedSecret = "dual-price-release-secret-2026-08-04";
const orderKeyId = "dual-bagwin-orders-v1";
const orderSharedSecret = "dual-bagwin-orders-secret-2026-08-04";
const artworkKeyId = "dual-artwork-transfer-v1";
const artworkSharedSecret = "dual-artwork-transfer-secret-2026-08-04";
const priceVersion = "ERP-DUAL-PRICE-V1";
const badPriceVersion = "ERP-DUAL-PRICE-V2-REJECTED";
const orderNo = "WT20260804ABCDEF0123";

let erpPool;
let miniappPool;
let priceServer;
let bagwinServer;
let artworkServer;
let artworkRoot;
let erpAttachmentRoot;

try {
  assertDockerAvailable();
  startPostgresContainer(erpContainer, erpDatabaseName, "erp", "erp-dual-password");
  startPostgresContainer(miniappContainer, miniappDatabaseName, "miniapp", "miniapp-dual-password");
  await Promise.all([
    waitForPostgres(erpContainer, "erp", erpDatabaseName),
    waitForPostgres(miniappContainer, "miniapp", miniappDatabaseName),
  ]);

  const erpPort = dockerPort(erpContainer);
  const miniappPort = dockerPort(miniappContainer);
  const erpDatabaseUrl = safeDatabaseUrl({
    databaseName: erpDatabaseName,
    expectedName: /^erp_[a-z0-9_]*_test$/,
    user: "erp",
    password: "erp-dual-password",
    port: erpPort,
  });
  const miniappDatabaseUrl = safeDatabaseUrl({
    databaseName: miniappDatabaseName,
    expectedName: /^miniapp_test(?:_[a-z0-9][a-z0-9_]*)?$/,
    user: "miniapp",
    password: "miniapp-dual-password",
    port: miniappPort,
  });

  applyErpMigrations(erpContainer, "erp", erpDatabaseName);
  erpPool = new Pool({ connectionString: erpDatabaseUrl, max: 6 });
  miniappPool = createPool({ databaseUrl: miniappDatabaseUrl, databaseSsl: false });
  await assertDatabaseIdentity(erpPool, erpDatabaseName);
  await assertDatabaseIdentity(miniappPool, miniappDatabaseName);
  await migrate(miniappPool);
  await seedCustomerMapping({ erpPool, miniappPool });

  const effectiveFrom = new Date(Date.now() - 30_000).toISOString();
  const firstBundle = await buildPriceBundle(priceVersion, effectiveFrom);
  const firstDigest = erpPriceReleaseSha256(firstBundle);
  assert.equal(firstDigest, requestHash(firstBundle));

  const miniappPriceService = new PostgresErpPriceReleaseService(miniappPool, () => new Date());
  const miniappPriceAuthenticator = new ErpPriceReleaseAuthenticator({
    keyId: priceKeyId,
    sharedSecret: priceSharedSecret,
    nonceStore: new PostgresErpPriceReleaseNonceStore(miniappPool),
    now: () => new Date(),
  });
  priceServer = createErpPriceReleaseInboundServer({
    service: miniappPriceService,
    authenticator: miniappPriceAuthenticator,
    readiness: async () => {
      const result = await miniappPool.query(
        "SELECT to_regclass('public.erp_price_releases')::text AS releases, to_regclass('public.erp_price_release_request_nonces')::text AS nonces",
      );
      assert.deepEqual(result.rows[0], {
        releases: "erp_price_releases",
        nonces: "erp_price_release_request_nonces",
      });
    },
  });
  const priceBaseUrl = await listen(priceServer);
  assert.equal((await fetch(`${priceBaseUrl}ready`)).status, 200);

  const erpPriceRepository = createPostgresErpPriceReleaseRepository({ pool: erpPool });
  const erpPriceDeliveryRepository = createPostgresErpPriceReleaseDeliveryRepository({ pool: erpPool });
  const erpPriceService = createErpPriceReleaseService({
    repository: erpPriceRepository,
    now: () => new Date(),
  });
  const priceDeliveryAdapter = createErpPriceReleaseDeliveryAdapter({
    baseUrl: priceBaseUrl,
    keyId: priceKeyId,
    sharedSecret: priceSharedSecret,
  });
  const priceDeliveryWorker = createErpPriceReleaseDeliveryWorker({
    repository: erpPriceDeliveryRepository,
    adapter: priceDeliveryAdapter,
    now: () => new Date(),
    requestTimeoutMs: 5_000,
    maxAttempts: 3,
  });

  const firstRelease = await publishPriceRelease({
    service: erpPriceService,
    bundle: firstBundle,
  });
  assert.deepEqual(await priceDeliveryWorker.processBatch(), {
    claimed: 1,
    delivered: 1,
    waiting: 0,
    retried: 0,
    dead: 0,
    lost: 0,
  });
  await assertPriceActivated({
    erpPool,
    miniappPool,
    releaseId: firstRelease.id,
    version: priceVersion,
    digest: firstDigest,
  });

  const badBundle = await buildPriceBundle(
    badPriceVersion,
    new Date(Date.now() - 15_000).toISOString(),
  );
  badBundle.catalog.specialQuoteRules.extendedHandleUnitAddon = Number(
    badBundle.catalog.specialQuoteRules.extendedHandleUnitAddon,
  ) + 0.01;
  await publishPriceRelease({ service: erpPriceService, bundle: badBundle });
  assert.deepEqual(await priceDeliveryWorker.processBatch(), {
    claimed: 1,
    delivered: 0,
    waiting: 0,
    retried: 0,
    dead: 1,
    lost: 0,
  });
  await assertFailedPriceStayedStale({ erpPool, miniappPool });

  const bagwinRepository = createPostgresBagwinErpIntegrationRepository({ pool: erpPool });
  const bagwinRuntime = createBagwinErpIntegrationRuntime({
    databaseUrl: erpDatabaseUrl,
    repository: bagwinRepository,
    keyId: orderKeyId,
    sharedSecret: orderSharedSecret,
    now: () => new Date(),
  });
  bagwinServer = bagwinRuntime.server;
  const bagwinBaseUrl = `${await listen(bagwinServer)}api/`;

  const submittedAt = new Date();
  const orderId = randomUUID();
  const orderLineId = randomUUID();
  const artworkFileId = randomUUID();
  const artworkContent = Buffer.from("%PDF-1.7\nsynthetic dual-database artwork\n", "utf8");
  const artworkSha256 = createHash("sha256").update(artworkContent).digest("hex");
  artworkRoot = await mkdtemp(path.join(tmpdir(), "miniapp-dual-artwork-"));
  erpAttachmentRoot = await mkdtemp(path.join(tmpdir(), "erp-dual-attachment-"));
  const miniappArtworkStorage = new LocalObjectStorage(artworkRoot);
  const artworkReference = await miniappArtworkStorage.putObjectImmutable(
    `dual/${artworkFileId}.pdf`,
    artworkContent,
    "application/pdf",
  );
  await miniappPool.query(
    `INSERT INTO artwork_files (
       id, customer_id, purpose, original_name, extension, mime_type, byte_size,
       content_sha256, content_sha256_verified_at, storage_key, storage_zone,
       storage_version_id, storage_etag, status, scan_result_json, scan_generation,
       scan_required_scanner, promoted_at, expires_at, ready_at, created_at, updated_at
     ) VALUES (
       $1, $2, 'print_artwork', 'dual-proof.pdf', 'pdf', 'application/pdf', $3,
       $4, $5, $6, 'clean', $7, $8, 'ready', $9::jsonb, 1,
       'basic-signature-v1', $5, $10, $5, $5, $5
     )`,
    [
      artworkFileId,
      miniappCustomerId,
      artworkReference.byteSize,
      artworkReference.sha256,
      submittedAt,
      artworkReference.key,
      artworkReference.versionId,
      artworkReference.etag,
      JSON.stringify({ passed: true, scanner: "basic-signature-v1", reason: null }),
      new Date(submittedAt.getTime() + 24 * 60 * 60 * 1_000),
    ],
  );
  const orderRepository = new OrderRepository(
    miniappPool,
    undefined,
    "basic-signature-v1",
    false,
    true,
  );
  const orderCommand = {
    customerId: miniappCustomerId,
    placedByBindingId: null,
    placedByName: "双库联调采购员",
    placedByPhoneMasked: "138 **** 5678",
    placedByRole: "buyer",
    idempotencyKey: "dual-database-order-0001",
    requestHash: requestHash({ orderNo, submittedAt: submittedAt.toISOString() }),
    orderId,
    orderNo,
    deliveryMethod: "到厂自提",
    desiredDate: null,
    desiredTime: null,
    addressSnapshot: { displayText: "双库联调地址" },
    packagingPreference: "独立扎包",
    priceVersion,
    estimatedAmount: 340,
    submittedAt,
    idempotencyExpiresAt: new Date(submittedAt.getTime() + 24 * 60 * 60 * 1_000),
    lines: [{
      id: orderLineId,
      position: 0,
      clientLineId: "L1",
      productType: "custom_print",
      productName: "定制印刷袋",
      skuId: "ERP-SKU-DUAL-RED-3037",
      size: "30×37×10",
      colorId: "red",
      bagColor: "红色",
      handleId: "regular",
      handleColor: "红色",
      quantity: 1_000,
      artworkFileId,
      specification: {
        printContent: "双库联调",
        printColor: "黑色",
        printSide: "single",
        specialRequirements: [],
      },
      quote: {
        priceVersion,
        basePrice: 0.34,
        handleAddon: 0,
        specialRequirementAddon: 0,
        includedSnapButton: false,
        printColorCount: 0,
        printFeePerColor: 0,
        printFee: 0,
        unitPrice: 0.34,
        quantity: 1_000,
        amount: 340,
        excludedFees: ["运费", "税费"],
        plateFeeIncluded: false,
        authoritative: true,
        note: "ERP 已发布价格",
      },
      inventory: {
        status: "available",
        label: "库存充足",
        note: "办公室仍需复核",
      },
    }],
  };
  const created = await orderRepository.create(orderCommand);
  assert.equal(created.replayed, false);
  assert.equal((await orderRepository.create(orderCommand)).replayed, true);

  let dropFirstCreateResponse = true;
  const orderAdapter = new HttpErpOrderAdapter({
    baseUrl: bagwinBaseUrl,
    keyId: orderKeyId,
    sharedSecret: orderSharedSecret,
    fetchFn: async (url, init) => {
      const response = await fetch(url, init);
      const pathname = new URL(url).pathname;
      if (dropFirstCreateResponse && init?.method === "POST" &&
          pathname.endsWith("/v1/integrations/bagwin/orders")) {
        dropFirstCreateResponse = false;
        await response.body?.cancel().catch(() => undefined);
        throw new TypeError("simulated_response_loss_after_erp_commit");
      }
      return response;
    },
  });
  const syncRepository = new ErpSyncRepository(miniappPool);
  const syncWorker = new ErpSyncWorker(syncRepository, orderAdapter, {
    workerId: "dual-db:orders",
    batchSize: 4,
    leaseMs: 10_000,
    requestTimeoutMs: 3_000,
    maxAttempts: 4,
    retryBaseMs: 1_000,
    retryMaxMs: 2_000,
    statusRefreshMs: 10_000,
    random: () => 0.5,
    now: () => new Date(),
  });

  const lostResponse = await syncWorker.processBatch();
  assert.equal(lostResponse.retried, 1);
  assert.equal(lostResponse.created, 0);
  await assertDraftOnlyIntake({ erpPool, expectedCount: 1 });
  await assertMiniappOrderRetained({ miniappPool, orderId, expectedSyncStatus: "failed" });

  await miniappPool.query(
    "UPDATE erp_sync_jobs SET next_attempt_at = now() WHERE order_id = $1 AND job_type = 'create_order'",
    [orderId],
  );
  const recovered = await syncWorker.processBatch();
  assert.equal(recovered.created, 1);
  assert.equal(recovered.retried, 0);
  await assertDraftOnlyIntake({ erpPool, expectedCount: 1 });
  await assertMiniappOrderRetained({ miniappPool, orderId, expectedSyncStatus: "synced" });

  await assertFormalConfirmationBlockedByArtwork({ erpPool, shouldBlock: true });
  const artworkAuthenticator = new ErpArtworkAuthenticator({
    keyId: artworkKeyId,
    sharedSecret: artworkSharedSecret,
    nonceStore: new PostgresErpArtworkNonceStore(miniappPool),
    now: () => new Date(),
  });
  artworkServer = createErpArtworkInboundServer({
    authenticator: artworkAuthenticator,
    repository: new PostgresErpArtworkTransferRepository(miniappPool, "basic-signature-v1"),
    storage: miniappArtworkStorage,
    readiness: async () => {
      const result = await miniappPool.query(
        "SELECT to_regclass('public.erp_artwork_transfer_audit')::text AS audit",
      );
      assert.equal(result.rows[0].audit, "erp_artwork_transfer_audit");
    },
  });
  const artworkBaseUrl = await listen(artworkServer);
  assert.equal((await fetch(`${artworkBaseUrl}ready`)).status, 200);
  const artworkTransferRepository = createPostgresMiniappArtworkTransferRepository({ pool: erpPool });
  const artworkTransferWorker = createMiniappArtworkTransferWorker({
    repository: artworkTransferRepository,
    adapter: createMiniappArtworkTransferAdapter({
      baseUrl: artworkBaseUrl,
      keyId: artworkKeyId,
      sharedSecret: artworkSharedSecret,
    }),
    storage: createLocalAttachmentObjectStorage({ storageRoot: erpAttachmentRoot }),
    workerId: "dual-db:artwork",
    batchSize: 1,
    maxAttempts: 3,
    requestTimeoutMs: 5_000,
    now: () => new Date(),
  });
  const artworkTransferSummary = await artworkTransferWorker.processBatch();
  const artworkTransferDiagnostic = await erpPool.query(
    `SELECT status, last_error_code, attempt_count, source_order_no, source_line_id,
            artwork_file_id
       FROM miniapp_artwork_transfer_jobs
      WHERE artwork_file_id = $1`,
    [artworkFileId],
  );
  assert.deepEqual(artworkTransferSummary, {
    claimed: 1,
    succeeded: 1,
    retried: 0,
    dead: 0,
    lost: 0,
  }, JSON.stringify(artworkTransferDiagnostic.rows));
  await assertArtworkTransferred({
    erpPool,
    miniappPool,
    artworkFileId,
    artworkSha256,
    expectedBytes: artworkContent.byteLength,
  });
  await assertFormalConfirmationBlockedByArtwork({ erpPool, shouldBlock: false });

  const frozenRequest = await miniappPool.query(
    `SELECT request_payload_json, request_sha256
       FROM erp_sync_jobs
      WHERE order_id = $1 AND job_type = 'create_order'`,
    [orderId],
  );
  const requestPayload = frozenRequest.rows[0].request_payload_json;
  const requestSha256 = frozenRequest.rows[0].request_sha256;
  const replay = await orderAdapter.ensureOrder({
    sourceOrderNo: orderNo,
    payload: requestPayload,
    payloadSha256: requestSha256,
    signal: new AbortController().signal,
  });
  assert.equal(replay.disposition, "existing");
  const conflictingPayload = structuredClone(requestPayload);
  conflictingPayload.lines[0].quantity = 1_001;
  await assert.rejects(
    orderAdapter.ensureOrder({
      sourceOrderNo: orderNo,
      payload: conflictingPayload,
      payloadSha256: requestHash(conflictingPayload),
      signal: new AbortController().signal,
    }),
    (error) => error?.code === "erp_source_payload_conflict" && error?.retryable === false,
  );

  await miniappPool.query(
    "UPDATE erp_sync_jobs SET next_attempt_at = now() WHERE order_id = $1 AND job_type = 'refresh_status'",
    [orderId],
  );
  const refreshed = await syncWorker.processBatch();
  assert.equal(refreshed.refreshed, 1);
  const publicProjection = await miniappPool.query(
    "SELECT status, status_label, erp_status_observed_at FROM miniapp_orders WHERE id = $1",
    [orderId],
  );
  assert.equal(publicProjection.rows[0].status, "confirming");
  assert.equal(publicProjection.rows[0].status_label, "工厂确认中");
  assert.ok(publicProjection.rows[0].erp_status_observed_at instanceof Date);

  await new Promise((resolve) => setTimeout(resolve, 20));
  const reconciliationWindow = {
    from: new Date(submittedAt.getTime() - 1_000),
    to: new Date(Date.now() - 1),
  };
  const remoteExport = parseErpReconciliationExport(await signedJsonRequest({
    baseUrl: bagwinBaseUrl,
    path: "v1/integrations/bagwin/orders/reconciliation-export",
    method: "POST",
    body: {
      schemaVersion: 1,
      window: {
        from: reconciliationWindow.from.toISOString(),
        to: reconciliationWindow.to.toISOString(),
      },
    },
    keyId: orderKeyId,
    sharedSecret: orderSharedSecret,
  }));
  const localWindow = await new ErpReconciliationRepository(miniappPool).readWindow({
    ...reconciliationWindow,
    limit: 100,
  });
  assert.equal(localWindow.truncated, false);
  const reconciliation = reconcileErpOrders(localWindow.orders, remoteExport);
  assert.deepEqual(reconciliation, {
    schemaVersion: 1,
    consistent: true,
    localOrderCount: 1,
    remoteOrderCount: 1,
    matchedOrderCount: 1,
    findingCount: 0,
    findingsTruncated: false,
    findingCounts: {},
    findings: [],
  });

  console.log([
    `Miniapp/ERP dual-database integration check passed against ${dockerImage}.`,
    "Verified: four-eyes ERP price publication, HMAC delivery, atomic BFF activation, failed-release stale-price safety, immutable order price digest, response-loss recovery by source lookup, ERP draft/todo-only intake, one-time HMAC artwork pull with SHA verification and confirmation gate, public status refresh, and zero-difference reconciliation.",
    "Both databases were disposable loopback-only test targets; no existing ERP or mini-program database was read or written.",
  ].join("\n"));
} finally {
  if (priceServer?.listening) await closeServer(priceServer).catch(() => undefined);
  if (bagwinServer?.listening) await closeServer(bagwinServer).catch(() => undefined);
  if (artworkServer?.listening) await closeServer(artworkServer).catch(() => undefined);
  await closeSharedPostgresPools().catch(() => undefined);
  await Promise.all([
    erpPool?.end().catch(() => undefined),
    miniappPool?.end().catch(() => undefined),
  ]);
  removeTestContainer(erpContainer);
  removeTestContainer(miniappContainer);
  if (artworkRoot) await rm(artworkRoot, { recursive: true, force: true }).catch(() => undefined);
  if (erpAttachmentRoot) await rm(erpAttachmentRoot, { recursive: true, force: true }).catch(() => undefined);
}

function assertDockerAvailable() {
  const result = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    throw new Error("Docker must be running for npm run miniapp-erp-dual-db:check.");
  }
}

function startPostgresContainer(containerName, databaseName, user, password) {
  runDocker([
    "run", "--rm", "--detach", "--name", containerName,
    "--publish", "127.0.0.1::5432",
    "--env", `POSTGRES_DB=${databaseName}`,
    "--env", `POSTGRES_USER=${user}`,
    "--env", `POSTGRES_PASSWORD=${password}`,
    dockerImage,
  ]);
}

async function waitForPostgres(containerName, user, databaseName) {
  let lastOutput = "";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = spawnSync(
      "docker",
      ["exec", containerName, "pg_isready", "-U", user, "-d", databaseName],
      { encoding: "utf8" },
    );
    if (result.status === 0) return;
    lastOutput = result.stderr || result.stdout || `status ${result.status}`;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Disposable PostgreSQL did not become ready: ${lastOutput}`);
}

function dockerPort(containerName) {
  const result = spawnSync("docker", ["port", containerName, "5432/tcp"], {
    encoding: "utf8",
  });
  const port = String(result.stdout || "").trim().match(/:(\d+)$/)?.[1];
  if (result.status !== 0 || !port) throw new Error("Unable to resolve disposable PostgreSQL port.");
  return Number(port);
}

function safeDatabaseUrl({ databaseName, expectedName, user, password, port }) {
  assert.match(databaseName, expectedName);
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65_535);
  const url = new URL("postgres://127.0.0.1/");
  url.username = user;
  url.password = password;
  url.port = String(port);
  url.pathname = `/${databaseName}`;
  assert.equal(url.hostname, "127.0.0.1");
  assert.match(decodeURIComponent(url.pathname.slice(1)), expectedName);
  return url.toString();
}

function applyErpMigrations(containerName, user, databaseName) {
  const migrations = loadMigrationFiles();
  validateMigrationSet(migrations);
  runPsql(containerName, user, databaseName, `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
  `);
  for (const migration of migrations) {
    runPsql(containerName, user, databaseName, [
      "BEGIN;",
      migration.sql.trim(),
      `INSERT INTO schema_migrations (id, filename, checksum) VALUES (${sqlLiteral(migration.id)}, ${sqlLiteral(migration.filename)}, ${sqlLiteral(migration.checksum)});`,
      "COMMIT;",
    ].join("\n\n"));
  }
}

function runPsql(containerName, user, databaseName, sql) {
  const result = spawnSync("docker", [
    "exec", "--interactive", containerName,
    "psql", "-U", user, "-d", databaseName, "-X",
    "-v", "ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--pset=footer=off",
  ], { input: sql, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Disposable ERP migration failed.");
  }
}

function runDocker(args) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `docker ${args[0]} failed`);
  }
  return String(result.stdout || "").trim();
}

function removeTestContainer(containerName) {
  if (!/^erp-miniapp-dual-(?:erp|bff)-\d+-\d+$/.test(containerName)) return;
  spawnSync("docker", ["rm", "--force", containerName], { encoding: "utf8" });
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function assertDatabaseIdentity(pool, expectedDatabase) {
  const result = await pool.query(
    "SELECT current_database() AS database_name, pg_is_in_recovery() AS is_in_recovery",
  );
  assert.deepEqual(result.rows[0], {
    database_name: expectedDatabase,
    is_in_recovery: false,
  });
}

async function seedCustomerMapping({ erpPool, miniappPool }) {
  await miniappPool.query(
    `INSERT INTO customers
      (id, erp_customer_id, company_name, contact_name, mobile_masked,
       delivery_method, address_json, packaging_preference, status)
     VALUES ($1, $2, '双库联调客户', '联调联系人', '138 **** 5678',
             '到厂自提', '{}'::jsonb, '独立扎包', 'active')`,
    [miniappCustomerId, erpCustomerId],
  );
  await erpPool.query(
    `INSERT INTO users (id, login_name, display_name, department) VALUES
      ('U-DUAL-PRICE-EDITOR', 'dual.price.editor', '价格编辑', 'office'),
      ('U-DUAL-PRICE-REVIEWER', 'dual.price.reviewer', '价格复核', 'management')`,
  );
  await erpPool.query(
    `INSERT INTO customers (id, biz_no, name, short_name, enabled)
     VALUES ($1, 'C-DUAL-E2E', '双库联调客户', '双库联调', true)`,
    [erpCustomerId],
  );
  await erpPool.query(
    `INSERT INTO miniapp_customer_accounts
      (miniapp_customer_id, customer_id, status, created_by, verified_by, verified_at)
     VALUES ($1, $2, 'active', 'U-DUAL-PRICE-EDITOR',
             'U-DUAL-PRICE-REVIEWER', now())`,
    [miniappCustomerId, erpCustomerId],
  );
}

async function buildPriceBundle(version, effectiveFrom) {
  const [catalog, customerPrices] = await Promise.all([
    loadCatalogFile(path.join(miniappRoot, "miniprogram/data/catalog.js"), {
      allowJavaScript: true,
    }),
    loadCustomerPriceFile(path.join(
      miniappRoot,
      "server/seed/customer-prices.snapshot.example.json",
    )),
  ]);
  const rules = { ...structuredClone(specialBagPricingRules), effectiveFrom };
  const materialPrice = {
    ...structuredClone(specialBagMaterialPriceSnapshot),
    effectiveFrom,
    provisional: false,
  };
  catalog.priceVersion = version;
  catalog.specialQuoteRules = publicSpecialQuoteRules(rules, materialPrice);
  const firstCustomerPrice = customerPrices.snapshots[0];
  assert.ok(firstCustomerPrice);
  customerPrices.snapshots = [{
    ...structuredClone(firstCustomerPrice),
    customerId: miniappCustomerId,
    catalogVersion: version,
    priceVersion: version,
    effectiveFrom,
    effectiveTo: null,
  }];
  return {
    schemaVersion: "factory-order-erp-price-release/v1",
    priceVersion: version,
    effectiveFrom,
    changeSummary: `${version} 双库联调发布`,
    catalog,
    customerPrices,
    specialSizePricing: { rules, materialPrice },
    bootstrap: {
      version: `announcement-${version}`,
      effectiveFrom,
      announcement: {
        id: `price-${version}`,
        tag: "价格调整",
        title: "价格版本更新",
        summary: "确认页将按当前生效版本重新计价。",
        content: "请提交前确认最新金额。",
        effectiveAt: effectiveFrom,
        autoPopup: true,
      },
      featuredUpdates: [],
    },
  };
}

async function publishPriceRelease({ service, bundle }) {
  const draft = await service.createDraft({
    bundle,
    createdBy: "U-DUAL-PRICE-EDITOR",
  });
  assert.equal(draft.status, "draft");
  await assert.rejects(
    service.review({ releaseId: draft.id, reviewedBy: "U-DUAL-PRICE-EDITOR" }),
    /Creator and reviewer must be different/,
  );
  const reviewed = await service.review({
    releaseId: draft.id,
    reviewedBy: "U-DUAL-PRICE-REVIEWER",
  });
  assert.equal(reviewed.status, "reviewed");
  const published = await service.publish({
    releaseId: draft.id,
    publishedBy: "U-DUAL-PRICE-REVIEWER",
  });
  assert.equal(published.status, "delivering");
  return published;
}

async function assertPriceActivated({ erpPool, miniappPool, releaseId, version, digest }) {
  const erp = await erpPool.query(
    `SELECT status, payload_sha256, bff_activated_at IS NOT NULL AS activated
       FROM miniapp_price_releases WHERE id = $1`,
    [releaseId],
  );
  assert.deepEqual(erp.rows[0], {
    status: "published",
    payload_sha256: digest,
    activated: true,
  });
  const miniapp = await miniappPool.query(
    `SELECT status, payload_sha256, activated_at IS NOT NULL AS activated
       FROM erp_price_releases WHERE price_version = $1`,
    [version],
  );
  assert.deepEqual(miniapp.rows[0], {
    status: "active",
    payload_sha256: digest,
    activated: true,
  });
  const projections = await miniappPool.query(
    `SELECT
       (SELECT count(*)::integer FROM catalog_snapshots WHERE version = $1) AS catalogs,
       (SELECT count(*)::integer FROM customer_price_snapshots WHERE price_version = $1) AS customer_prices,
       (SELECT count(*)::integer FROM bootstrap_snapshots WHERE price_version = $1) AS announcements`,
    [version],
  );
  assert.deepEqual(projections.rows[0], {
    catalogs: 1,
    customer_prices: 1,
    announcements: 1,
  });
}

async function assertFailedPriceStayedStale({ erpPool, miniappPool }) {
  const erp = await erpPool.query(
    `SELECT release.status AS release_status, job.status AS job_status,
            job.last_error_code
       FROM miniapp_price_releases release
       JOIN miniapp_price_release_delivery_jobs job ON job.release_id = release.id
      WHERE release.price_version = $1`,
    [badPriceVersion],
  );
  assert.deepEqual(erp.rows[0], {
    release_status: "delivering",
    job_status: "dead",
    last_error_code: "miniapp_price_release_rejected_422",
  });
  const miniapp = await miniappPool.query(
    `SELECT
       (SELECT price_version FROM erp_price_releases WHERE status = 'active') AS active_version,
       (SELECT count(*)::integer FROM erp_price_releases WHERE price_version = $1) AS rejected_release_count,
       (SELECT count(*)::integer FROM bootstrap_snapshots WHERE price_version = $1) AS rejected_announcement_count`,
    [badPriceVersion],
  );
  assert.deepEqual(miniapp.rows[0], {
    active_version: priceVersion,
    rejected_release_count: 0,
    rejected_announcement_count: 0,
  });
}

async function assertDraftOnlyIntake({ erpPool, expectedCount }) {
  const result = await erpPool.query(
    `SELECT json_build_object(
       'submissions', (SELECT count(*)::integer FROM order_intake_submissions WHERE idempotency_scope = 'bagwin:orders'),
       'intakeLines', (SELECT count(*)::integer FROM order_intake_lines),
       'snapshots', (SELECT count(*)::integer FROM order_intake_snapshots WHERE authoritative = true),
       'drafts', (SELECT count(*)::integer FROM order_drafts WHERE source_channel = 'mini_program'),
       'todos', (SELECT count(*)::integer FROM todos WHERE type = '小程序订单待确认'),
       'artworkJobs', (SELECT count(*)::integer FROM miniapp_artwork_transfer_jobs),
       'artworkAttachments', (SELECT count(*)::integer FROM attachments WHERE purpose = 'miniapp_print_artwork'),
       'formalOrders', (SELECT count(*)::integer FROM original_orders),
       'inventoryReservations', (SELECT count(*)::integer FROM inventory_reservations),
       'productionTasks', (SELECT count(*)::integer FROM production_tasks),
       'fulfillments', (SELECT count(*)::integer FROM fulfillment_records)
     ) AS result`,
  );
  assert.deepEqual(result.rows[0].result, {
    submissions: expectedCount,
    intakeLines: expectedCount,
    snapshots: expectedCount,
    drafts: expectedCount,
    todos: expectedCount,
    artworkJobs: expectedCount,
    artworkAttachments: 0,
    formalOrders: 0,
    inventoryReservations: 0,
    productionTasks: 0,
    fulfillments: 0,
  });
  const identity = await erpPool.query(
    `SELECT biz_no, external_submission_id, draft_id
       FROM order_intake_submissions
      WHERE idempotency_scope = 'bagwin:orders'`,
  );
  assert.deepEqual(identity.rows[0], {
    biz_no: orderNo,
    external_submission_id: orderNo,
    draft_id: `DRAFT-${orderNo}`,
  });
}

async function assertFormalConfirmationBlockedByArtwork({ erpPool, shouldBlock }) {
  const query = `SELECT erp_require(
    NOT EXISTS (
      SELECT 1
      FROM order_intake_submissions AS submission
      JOIN miniapp_artwork_transfer_jobs AS artwork_job
        ON artwork_job.submission_id = submission.id
      WHERE submission.external_submission_id = $1
        AND artwork_job.status <> 'succeeded'
    ),
    'ERP_MINIAPP_ARTWORK_NOT_READY'
  ) AS ready`;
  if (shouldBlock) {
    await assert.rejects(
      erpPool.query(query, [orderNo]),
      /ERP_MINIAPP_ARTWORK_NOT_READY/,
    );
  } else {
    const result = await erpPool.query(query, [orderNo]);
    assert.equal(result.rows[0].ready, true);
  }
}

async function assertArtworkTransferred({
  erpPool,
  miniappPool,
  artworkFileId,
  artworkSha256,
  expectedBytes,
}) {
  const erp = await erpPool.query(
    `SELECT job.status, job.expected_sha256, job.expected_byte_size,
            attachment.id AS attachment_id, attachment.content_digest,
            attachment.file_size_bytes, attachment.has_content,
            link.owner_type, link.owner_id, link.purpose
       FROM miniapp_artwork_transfer_jobs AS job
       JOIN attachments AS attachment ON attachment.id = job.attachment_id
       JOIN attachment_links AS link ON link.attachment_id = attachment.id
      WHERE job.artwork_file_id = $1`,
    [artworkFileId],
  );
  assert.deepEqual(erp.rows[0], {
    status: "succeeded",
    expected_sha256: artworkSha256,
    expected_byte_size: String(expectedBytes),
    attachment_id: erp.rows[0].attachment_id,
    content_digest: artworkSha256,
    file_size_bytes: String(expectedBytes),
    has_content: true,
    owner_type: "order_draft_line",
    owner_id: erp.rows[0].owner_id,
    purpose: "print_artwork",
  });
  assert.match(erp.rows[0].attachment_id, /-ATT$/);
  assert.match(erp.rows[0].owner_id, /^DRAFT-WT\d{8}[A-F0-9]{10}-01$/);
  const miniapp = await miniappPool.query(
    `SELECT result, content_sha256, byte_size
       FROM erp_artwork_transfer_audit
      WHERE artwork_file_id = $1`,
    [artworkFileId],
  );
  assert.deepEqual(miniapp.rows, [{
    result: "succeeded",
    content_sha256: artworkSha256,
    byte_size: String(expectedBytes),
  }]);
}

async function assertMiniappOrderRetained({ miniappPool, orderId, expectedSyncStatus }) {
  const result = await miniappPool.query(
    `SELECT order_no, price_version, locked_price_sha256,
            erp_sync_status, erp_order_id
       FROM miniapp_orders WHERE id = $1`,
    [orderId],
  );
  assert.equal(result.rows[0].order_no, orderNo);
  assert.equal(result.rows[0].price_version, priceVersion);
  assert.match(result.rows[0].locked_price_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.rows[0].erp_sync_status, expectedSyncStatus);
  if (expectedSyncStatus === "synced") {
    assert.equal(result.rows[0].erp_order_id, `INTAKE-${orderNo}`);
  } else {
    assert.equal(result.rows[0].erp_order_id, null);
  }
}

async function signedJsonRequest({ baseUrl, path: requestPath, method, body, keyId, sharedSecret }) {
  const url = new URL(requestPath.replace(/^\/+/, ""), baseUrl);
  const encodedBody = body === null ? "" : JSON.stringify(body);
  const bodySha256 = createHash("sha256").update(encodedBody).digest("hex");
  const timestamp = new Date().toISOString();
  const nonce = createHash("sha256").update(randomUUID()).digest("hex").slice(0, 32);
  const canonical = [
    "bagwin-hmac-v1",
    timestamp,
    nonce,
    method,
    `${url.pathname}${url.search}`,
    bodySha256,
  ].join("\n");
  const signature = createHmac("sha256", sharedSecret).update(canonical).digest("hex");
  const response = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      ...(body === null ? {} : { "content-type": "application/json" }),
      "x-bagwin-auth-version": "1",
      "x-bagwin-key-id": keyId,
      "x-bagwin-timestamp": timestamp,
      "x-bagwin-nonce": nonce,
      "x-bagwin-content-sha256": bodySha256,
      "x-bagwin-signature": signature,
    },
    ...(body === null ? {} : { body: encodedBody }),
  });
  const value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value));
  return value;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}/`);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
