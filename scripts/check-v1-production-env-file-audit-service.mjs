import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getConfiguredV1ProductionEnvApplicationFileConfig,
  getConfiguredV1ProductionEnvApplicationFiles,
  getConfiguredV1ProductionEnvAuditFileConfig,
  getConfiguredV1ProductionEnvValuesFileConfig,
  precheckV1ProductionEnvFileAudit,
  sanitizeV1ProductionEnvFileAuditLivePrecheck,
} from "../server/services/v1ProductionEnvFileAuditService.mjs";

const checkedAt = "2026-07-13T13:00:00.000Z";
const operatorId = "U-MANAGER-TEST";

const auditSource = getConfiguredV1ProductionEnvAuditFileConfig({
  ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS: " /secure/a.env, /secure/b.env ",
  ERP_V1_PRODUCTION_ENV_FILE: "/secure/runtime.env",
  ERP_V1_ENV_FILE: "/secure/fallback.env",
});
assert.deepEqual(auditSource.envFiles, ["/secure/a.env", "/secure/b.env"]);
assert.equal(auditSource.selectedEnvVariable, "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS");
assert.equal(auditSource.selectedSourceKind, "primary");
assert.equal(auditSource.configuredSourceVariableCount, 3);
assert.equal(auditSource.ignoredConfiguredFallbackVariableCount, 2);
assert.equal(auditSource.primaryEnvVariable, "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS");

const applicationSource = getConfiguredV1ProductionEnvApplicationFileConfig({
  env: {
    ERP_V1_ENV_FILE: "/secure/fallback.env",
    ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS: "/secure/audit-only.env",
  },
});
assert.deepEqual(applicationSource.envFiles, ["/secure/fallback.env"]);
assert.equal(applicationSource.selectedEnvVariable, "ERP_V1_ENV_FILE");
assert.equal(applicationSource.auditOnlySourceUsed, false);
assert.equal(applicationSource.ignoredConfiguredAuditOnlyVariableCount, 1);
assert.deepEqual(
  getConfiguredV1ProductionEnvApplicationFiles({
    env: {
      ERP_V1_ENV_FILE: "/secure/fallback.env",
      ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS: "/secure/audit-only.env",
    },
  }),
  ["/secure/fallback.env"],
);

const previewSource = getConfiguredV1ProductionEnvApplicationFileConfig({
  allowAuditOnlyFallback: true,
  env: { ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS: "/secure/preview.env" },
});
assert.deepEqual(previewSource.envFiles, ["/secure/preview.env"]);
assert.equal(previewSource.auditOnlySourceUsed, true);

const valuesSource = getConfiguredV1ProductionEnvValuesFileConfig({
  ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE: "/secure/minimum.env",
  ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE: "/secure/legacy.env",
});
assert.deepEqual(valuesSource.envFiles, ["/secure/minimum.env"]);
assert.equal(valuesSource.selectedSourceKind, "fallback");
assert.equal(valuesSource.ignoredConfiguredFallbackVariableCount, 1);

const missingResult = precheckV1ProductionEnvFileAudit({
  operatorId,
  env: {},
  now: () => new Date(checkedAt),
});
assert.equal(missingResult.httpStatus, 200);
assert.equal(missingResult.body.status, "not_configured");
assert.equal(missingResult.body.ready, false);
assert.equal(missingResult.body.summary.configuredEnvFileCount, 0);
assert.equal(missingResult.body.summary.envFilePathAccepted, false);
assert.equal(missingResult.body.blockingFindings[0].key, "server-env-file-audit-path-not-configured");
assert.equal(missingResult.body.safeguards.envFileReadByRequest, false);

let receivedAuditInput;
const passedResult = precheckV1ProductionEnvFileAudit({
  operatorId,
  env: { ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS: "/secure/production.env" },
  now: () => new Date(checkedAt),
  buildAudit(input) {
    receivedAuditInput = input;
    return buildAuditFixture();
  },
});
assert.deepEqual(receivedAuditInput, { envFiles: ["/secure/production.env"] });
assert.equal(passedResult.httpStatus, 200);
assert.equal(passedResult.body.status, "passed");
assert.equal(passedResult.body.ready, true);
assert.equal(passedResult.body.summary.selectedEnvVariable, "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS");
assert.equal(passedResult.body.files[0].label, "env 文件 1");
assert.equal(passedResult.body.files[0].fileMode, "600");
assert.equal(passedResult.body.safeguards.envFilePathExposed, false);
assert.equal(JSON.stringify(passedResult).includes("/secure/production.env"), false);
assert.equal(JSON.stringify(passedResult).includes("DATABASE_PASSWORD_VALUE"), false);

const sensitiveError = ["postgres://owner:secret@db.internal/prod", "/Users/private/prod.env"].join(" ");
const failedResult = precheckV1ProductionEnvFileAudit({
  operatorId,
  env: { ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS: "/secure/broken.env" },
  now: () => new Date(checkedAt),
  buildAudit() {
    throw new Error(sensitiveError);
  },
});
assert.equal(failedResult.httpStatus, 200);
assert.equal(failedResult.body.status, "blocked");
assert.equal(failedResult.body.error.code, "V1_PRODUCTION_ENV_FILE_AUDIT_LIVE_PRECHECK_FAILED");
assert.equal(JSON.stringify(failedResult).includes("postgres://"), false);
assert.equal(JSON.stringify(failedResult).includes("/Users/private"), false);
assert.equal(JSON.stringify(failedResult).includes("/secure/broken.env"), false);

const sanitized = sanitizeV1ProductionEnvFileAuditLivePrecheck(buildAuditFixture());
assert.equal(sanitized.files[0].path, undefined);
assert.equal(sanitized.files[0].variableNames, undefined);
assert.deepEqual(sanitized.blockingFindings, []);
assert.equal(sanitized.safeguards.rawEnvFileIncluded, false);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../server/routes/systemWriteRoutes.mjs", import.meta.url), "utf8");
assert.doesNotMatch(apiSource, /function precheckSystemV1ProductionEnvFileAudit/);
assert.match(routeSource, /precheckProductionEnvFileAudit:[\s\S]*precheckV1ProductionEnvFileAudit\(\{ operatorId \}\)/);
assert.doesNotMatch(routeSource, /buildProductionEnvFileAuditReport|readFileSync/);
for (const oldDefinition of [
  "buildV1ProductionEnvFileAuditPrecheckBody",
  "buildV1ProductionEnvFileAuditServerConfigGuidance",
  "buildConfiguredV1ProductionEnvFileConfig",
  "sanitizeV1ProductionEnvFileAuditFinding",
]) {
  assert.doesNotMatch(apiSource, new RegExp(`function ${oldDefinition}\\(`));
}

console.log(
  "V1 production-env file-audit service checks passed: source precedence, audit-only fallback, redaction, failure handling, shared projection, and thin API composition are covered.",
);

function buildAuditFixture() {
  return {
    status: "passed",
    ready: true,
    checkedAt,
    envFileCount: 1,
    summary: {
      label: "安全审计通过",
      fileCount: 1,
      blockingCount: 0,
      warningCount: 0,
      passedCount: 5,
      placeholderAssignmentCount: 0,
      uncommentedAssignmentCount: 11,
      sensitiveVariableNameCount: 2,
      crossFileDuplicateVariableCount: 0,
    },
    files: [
      {
        path: "/secure/production.env",
        insideWorkspace: false,
        git: { outsideWorkspace: true, tracked: false, ignored: true },
        fileMode: "600",
        uncommentedAssignmentCount: 11,
        placeholderAssignmentCount: 0,
        duplicateVariableCount: 0,
        sensitiveVariableNameCount: 2,
        variableNames: ["ERP_V1_DATABASE_URL", "DATABASE_PASSWORD_VALUE"],
      },
    ],
    blockingFindings: [],
    warningFindings: [],
    nextActions: ["继续执行生产 env 预检。"],
    safeguards: {
      nonMutating: true,
      envValuesExposed: false,
      connectionStringExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      commentsCopied: false,
      rawLineContentCopied: false,
    },
  };
}
