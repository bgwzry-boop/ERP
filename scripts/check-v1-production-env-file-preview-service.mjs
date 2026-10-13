import assert from "node:assert/strict";
import {
  buildV1ProductionEnvPreviewEnvironment,
  precheckV1ProductionEnvFilePreview,
} from "../server/services/v1ProductionEnvFilePreviewService.mjs";

const checkedAt = "2026-07-13T14:00:00.000Z";
const operatorId = "U-MANAGER-TEST";

const baseEnv = { EXISTING: "original", KEEP: "yes" };
const previewEnv = buildV1ProductionEnvPreviewEnvironment(
  ["/secure/a.env", "/secure/b.env"],
  {
    baseEnv,
    resolvePath: (value) => value,
    readFile: (filePath) => (filePath.endsWith("a.env") ? "EXISTING=overlaid\nFIRST=1" : "SECOND=2"),
    parseFile(content) {
      return Object.fromEntries(content.split("\n").map((line) => line.split("=")));
    },
  },
);
assert.deepEqual(baseEnv, { EXISTING: "original", KEEP: "yes" });
assert.deepEqual(previewEnv, {
  EXISTING: "overlaid",
  KEEP: "yes",
  FIRST: "1",
  SECOND: "2",
});

const missingResult = precheckV1ProductionEnvFilePreview({
  operatorId,
  env: {},
  now: () => new Date(checkedAt),
});
assert.equal(missingResult.httpStatus, 200);
assert.equal(missingResult.body.status, "not_configured");
assert.equal(missingResult.body.ready, false);
assert.equal(missingResult.body.summary.currentStage, "server_env_file_path");
assert.equal(missingResult.body.summary.appliedInMemory, false);
assert.equal(missingResult.body.safeguards.processEnvMutated, false);

let blockedFileRead = false;
const auditBlockedResult = precheckV1ProductionEnvFilePreview({
  operatorId,
  env: { ERP_V1_PRODUCTION_ENV_FILE: "/secure/blocked.env" },
  now: () => new Date(checkedAt),
  buildAudit: () => buildAuditFixture({ ready: false }),
  readFile() {
    blockedFileRead = true;
    throw new Error("must not read");
  },
});
assert.equal(auditBlockedResult.body.status, "audit_blocked");
assert.equal(auditBlockedResult.body.summary.currentStage, "env_file_audit");
assert.equal(auditBlockedResult.body.summary.appliedInMemory, false);
assert.equal(blockedFileRead, false);

const runtimeEnv = {
  ERP_V1_PRODUCTION_ENV_FILE: "/secure/ready.env",
  EXISTING: "server-value",
};
let receivedPreflight;
const readyResult = precheckV1ProductionEnvFilePreview({
  operatorId,
  env: runtimeEnv,
  now: () => new Date(checkedAt),
  buildAudit: () => buildAuditFixture({ ready: true }),
  resolvePath: (value) => value,
  readFile: () => "EXISTING=file-value\nFILE_ONLY=present",
  buildPreflight(input) {
    receivedPreflight = input;
    return buildPreflightFixture({ ready: true });
  },
});
assert.equal(receivedPreflight.env.EXISTING, "file-value");
assert.equal(receivedPreflight.env.FILE_ONLY, "present");
assert.deepEqual(receivedPreflight.envFiles, ["/secure/ready.env"]);
assert.equal(runtimeEnv.EXISTING, "server-value");
assert.equal(runtimeEnv.FILE_ONLY, undefined);
assert.equal(readyResult.httpStatus, 200);
assert.equal(readyResult.body.status, "ready");
assert.equal(readyResult.body.ready, true);
assert.equal(readyResult.body.summary.currentStage, "env_preflight");
assert.equal(readyResult.body.summary.stageStatus, "ready");
assert.equal(readyResult.body.summary.appliedInMemory, true);
assert.equal(readyResult.body.summary.processEnvMutated, false);
assert.equal(readyResult.body.safeguards.envFileValuesAppliedInMemoryOnly, true);
assert.equal(readyResult.body.safeguards.envFilePathAccepted, false);
assert.equal(JSON.stringify(readyResult).includes("/secure/ready.env"), false);
assert.equal(JSON.stringify(readyResult).includes("FILE_ONLY"), false);

const blockedResult = precheckV1ProductionEnvFilePreview({
  operatorId,
  env: { ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS: "/secure/preview-only.env" },
  now: () => new Date(checkedAt),
  buildAudit: () => buildAuditFixture({ ready: true }),
  resolvePath: (value) => value,
  readFile: () => "VALUE=present",
  buildPreflight: () => buildPreflightFixture({ ready: false }),
});
assert.equal(blockedResult.body.status, "blocked");
assert.equal(blockedResult.body.summary.auditOnlySourceUsed, true);
assert.equal(blockedResult.body.summary.stageStatus, "env_preflight_blocked");
assert.equal(blockedResult.body.summary.appliedInMemory, true);

const sensitiveError = ["postgres://owner:secret@db.internal/prod", "/Users/private/prod.env"].join(" ");
const errorResult = precheckV1ProductionEnvFilePreview({
  operatorId,
  env: { ERP_V1_PRODUCTION_ENV_FILE: "/secure/error.env" },
  now: () => new Date(checkedAt),
  buildAudit: () => buildAuditFixture({ ready: true }),
  readFile() {
    throw new Error(sensitiveError);
  },
});
assert.equal(errorResult.httpStatus, 200);
assert.equal(errorResult.body.status, "error");
assert.equal(errorResult.body.error.code, "V1_PRODUCTION_ENV_FILE_PREVIEW_LIVE_PRECHECK_FAILED");
assert.equal(JSON.stringify(errorResult).includes("postgres://"), false);
assert.equal(JSON.stringify(errorResult).includes("/Users/private"), false);
assert.equal(JSON.stringify(errorResult).includes("/secure/error.env"), false);
assert.equal(errorResult.body.safeguards.processEnvMutated, false);

console.log(
  "V1 production-env file-preview service checks passed: audit gate, memory-only overlay, process-env immutability, preview-only source, redaction, and thin API composition are covered.",
);

function buildAuditFixture({ ready }) {
  return {
    status: ready ? "passed" : "blocked",
    ready,
    checkedAt,
    envFileCount: 1,
    summary: {
      label: ready ? "审计通过" : "审计阻塞",
      fileCount: 1,
      blockingCount: ready ? 0 : 1,
      warningCount: 0,
      passedCount: ready ? 5 : 0,
      placeholderAssignmentCount: 0,
      uncommentedAssignmentCount: 11,
      sensitiveVariableNameCount: 2,
      crossFileDuplicateVariableCount: 0,
    },
    files: [],
    blockingFindings: ready
      ? []
      : [
          {
            key: "unsafe-file",
            label: "文件不安全",
            status: "blocked",
            severity: "blocking",
            detail: "未通过安全审计",
            variables: [],
            nextAction: "修正文件。",
          },
        ],
    warningFindings: [],
    nextActions: ready ? [] : ["修正文件。"],
    safeguards: { nonMutating: true },
  };
}

function buildPreflightFixture({ ready }) {
  const checks = [
    {
      key: "database",
      label: "database",
      severity: "blocking",
      status: ready ? "passed" : "blocked",
      ready,
      detail: ready ? "已通过" : "未通过",
      nextAction: ready ? "" : "补齐配置。",
      requiredVariables: [],
      missingVariables: [],
    },
  ];
  return {
    status: ready ? "passed" : "blocked",
    ready,
    checkedAt,
    summary: {
      passedCount: ready ? 1 : 0,
      totalCount: 1,
      blockingCount: ready ? 0 : 1,
      warningCount: 0,
      placeholderValueCount: 0,
    },
    fixChecklist: checks,
    nextActions: ready ? [] : ["补齐配置。"],
  };
}
