import assert from "node:assert/strict";
import {
  precheckV1AttachmentRetention,
  precheckV1Persistence,
  sanitizeV1LivePrecheckCriterion,
} from "../server/services/v1StorageLivePrecheckService.mjs";

const fixedDate = new Date("2026-07-12T12:00:00.000Z");
const now = () => fixedDate;
const operatorId = "U-V1-MANAGEMENT";

const persistenceBlocked = precheckV1Persistence({
  workspace: {},
  operatorId,
  now,
  buildReadiness: () => buildPersistenceReadiness({ ready: false, kind: "local_json" }),
});
assert.equal(persistenceBlocked.httpStatus, 200);
assert.equal(persistenceBlocked.body.status, "blocked");
assert.equal(persistenceBlocked.body.summary.readinessLabel, "1/2");
assert.equal(persistenceBlocked.body.summary.localRepositoryCount, 1);
assert.equal(persistenceBlocked.body.summary.localJsonCount, 1);
assert.equal(persistenceBlocked.body.repositoryGroups[0].repositories[0].kindLabel, "本地 JSON");
assert.equal(persistenceBlocked.body.blockingCriteria.length, 1);
assert.equal(persistenceBlocked.body.safeguards.rawSystemV1ReadinessIncluded, false);

const persistenceReady = precheckV1Persistence({
  workspace: {},
  operatorId,
  now,
  buildReadiness: () => buildPersistenceReadiness({ ready: true, kind: "postgres" }),
});
assert.equal(persistenceReady.body.status, "ready");
assert.equal(persistenceReady.body.summary.repositoryLabel, "1/1");
assert.equal(persistenceReady.body.summary.localRepositoryCount, 0);

const persistenceError = precheckV1Persistence({
  workspace: {},
  operatorId,
  now,
  buildReadiness() {
    throw new Error("postgres://SECRET-PERSISTENCE@private-host/db");
  },
});
assert.equal(persistenceError.httpStatus, 500);
assert.equal(persistenceError.body.error.code, "V1_PERSISTENCE_LIVE_PRECHECK_FAILED");
assert.doesNotMatch(JSON.stringify(persistenceError), /SECRET-PERSISTENCE|postgres:\/\//);

const attachmentBlocked = await precheckV1AttachmentRetention({
  workspace: {},
  operatorId,
  now,
  buildReadiness: async () => buildAttachmentReadiness({ ready: false, storageKind: "local_fs" }),
});
assert.equal(attachmentBlocked.httpStatus, 200);
assert.equal(attachmentBlocked.body.status, "blocked");
assert.equal(attachmentBlocked.body.summary.readinessLabel, "4/5");
assert.equal(attachmentBlocked.body.summary.storageKindLabel, "本地文件");
assert.equal(attachmentBlocked.body.summary.diagnosticObjectCleanedUp, true);
assert.equal(attachmentBlocked.body.blockingCriteria[0].key, "attachment-production-retention-mode");
assert.equal(attachmentBlocked.body.safeguards.diagnosticStorageKeyIncluded, false);
assert.doesNotMatch(JSON.stringify(attachmentBlocked), /SECRET-DIAGNOSTIC|sha256-secret/);

const attachmentReady = await precheckV1AttachmentRetention({
  workspace: {},
  operatorId,
  now,
  buildReadiness: async () => buildAttachmentReadiness({ ready: true, storageKind: "object_storage" }),
});
assert.equal(attachmentReady.body.status, "ready");
assert.equal(attachmentReady.body.summary.readinessLabel, "5/5");
assert.equal(attachmentReady.body.summary.objectStorageLive, true);

const attachmentError = await precheckV1AttachmentRetention({
  workspace: {},
  operatorId,
  now,
  async buildReadiness() {
    throw new Error("SECRET-ATTACHMENT-STORAGE-KEY");
  },
});
assert.equal(attachmentError.httpStatus, 500);
assert.equal(attachmentError.body.error.code, "V1_ATTACHMENT_RETENTION_LIVE_PRECHECK_FAILED");
assert.doesNotMatch(JSON.stringify(attachmentError), /SECRET-ATTACHMENT-STORAGE-KEY/);

assert.deepEqual(sanitizeV1LivePrecheckCriterion({ key: "criterion", label: "门禁", status: "passed" }), {
  key: "criterion",
  label: "门禁",
  status: "passed",
  statusLabel: "已通过",
  ready: true,
  blocking: true,
  detail: "",
});

console.log("V1 storage live-precheck service checks passed");

function buildPersistenceReadiness({ ready, kind }) {
  const criterion = (key, passed) => ({ key, label: key, status: passed ? "passed" : "blocked", blocking: true, detail: passed ? "ok" : "blocked" });
  const productionReady = kind === "postgres";
  return {
    ready,
    checkedAt: fixedDate.toISOString(),
    summary: { passedCount: ready ? 2 : 1, totalCount: 2, blockingCount: ready ? 0 : 1 },
    criteria: [criterion("profile", true), criterion("repositories", ready)],
    repositoryGroups: [
      {
        key: "core",
        label: "核心仓储",
        ready,
        repositoryCount: 1,
        productionReadyCount: productionReady ? 1 : 0,
        localRepositoryCount: productionReady ? 0 : 1,
        repositories: [
          { key: "orders", label: "订单", kind, productionReady, localKind: !productionReady },
        ],
      },
    ],
    safeguards: {
      localPersistenceAcceptedForV1: false,
      repositoryPayloadExposed: false,
      connectionStringExposed: false,
      localPathExposed: false,
    },
  };
}

function buildAttachmentReadiness({ ready, storageKind }) {
  const criteria = ["readwrite", "cleanup", "config", "production-retention-mode", "redaction"].map((key) => ({
    key: `attachment-${key}`,
    label: key,
    status: key === "production-retention-mode" && !ready ? "blocked" : "passed",
    blocking: true,
    detail: key === "production-retention-mode" && !ready ? "object storage required" : "ok",
  }));
  return {
    ready,
    checkedAt: fixedDate.toISOString(),
    summary: { passedCount: ready ? 5 : 4, totalCount: 5, blockingCount: ready ? 0 : 1 },
    criteria,
    diagnostics: {
      status: "ok",
      ready: true,
      storageKind,
      storageProvider: storageKind,
      configured: true,
      missingConfigFields: [],
      writeOk: true,
      readOk: true,
      digestOk: true,
      cleanupOk: true,
      secretFieldsExposed: false,
      diagnosticStorageKey: "SECRET-DIAGNOSTIC",
      contentDigest: "sha256-secret",
    },
    storageMode: {
      storageKind,
      storageProvider: storageKind,
      objectStorageLive: storageKind === "object_storage",
      localFsAcceptedForV1: false,
    },
    remainingV1Risks: ready ? [] : ["真实对象存储未通过"],
    safeguards: { diagnosticObjectCleanedUp: true, payloadExposed: false, secretFieldsExposed: false },
  };
}
