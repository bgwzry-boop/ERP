import assert from "node:assert/strict";
import { sanitizeV1ProductionEnvValuesApplyReport } from "../server/services/v1ProductionEnvValuesApplyProjectionService.mjs";

const missing = sanitizeV1ProductionEnvValuesApplyReport({
  scope: "wrong_scope",
  ready: true,
  summary: { appliedVariableCount: 99 },
});
assert.equal(missing.status, "missing");
assert.equal(missing.ready, false);

const sensitiveText = [
  "postgres://owner:secret@db.internal/prod",
  "https://storage.internal/private",
  "/Users/private/production.env",
  "ERP_DATABASE_PASSWORD=secret-value",
].join(" ");
const projected = sanitizeV1ProductionEnvValuesApplyReport({
  scope: "v1_production_env_real_value_intake_apply",
  status: "ready",
  ready: true,
  checkedAt: "2026-07-13T18:00:00.000Z",
  summary: {
    label: `真实值已合并 ${sensitiveText}`,
    sourceAssignmentCount: 3.9,
    appliedVariableCount: -1,
    targetChanged: true,
    targetMode: "setup_target",
    setupReady: true,
    envPreflightReady: true,
    envPreflightPassedCount: 11,
    envPreflightTotalCount: 11,
    intakeVerificationReady: true,
  },
  sourceEnvFile: {
    path: "/Users/private/values.env",
    exists: true,
    auditReady: true,
    auditStatus: "passed",
    assignmentCount: 3,
  },
  targetEnvFile: {
    path: "/Users/private/production.env",
    exists: true,
    auditReadyBefore: true,
    auditStatusBefore: "passed",
    applied: true,
    changed: true,
    fileMode: "600",
  },
  intakeCsv: {
    path: "/Users/private/intake.csv",
    ready: true,
    rowCount: 11,
    allowedVariableCount: 11,
    missingHeaders: ["filled", sensitiveText],
  },
  appliedVariables: ["ERP_RUNTIME_MODE", "ERP_DATABASE_URL", "INVALID KEY"],
  skippedVariables: {
    unknownSourceVariables: ["UNKNOWN_VALUE", "bad key"],
  },
  alternativeGroups: [
    {
      groupKey: "database-url",
      variableCount: 2,
      configuredKeyCount: 1,
      configuredKeys: ["ERP_DATABASE_URL", "bad key"],
      status: "passed",
      severity: "blocking",
      rawValues: ["secret"],
    },
  ],
  setupRefresh: {
    status: "ready",
    ready: true,
    setupReady: true,
    summary: { label: `setup ready ${sensitiveText}`, remainingFixItemCount: 0 },
    envPreflight: {
      ready: true,
      status: "passed",
      passedCount: 11,
      totalCount: 11,
      firstRemainingFixItems: [
        { key: "database", label: `数据库 ${sensitiveText}`, missingVariables: ["ERP_DATABASE_URL"] },
      ],
    },
  },
  intakeVerification: {
    status: "passed",
    ready: true,
    summary: { intakeRowCount: 11, configuredRowCount: 11 },
    firstBlockingFindings: [
      {
        type: "variable_row",
        label: `数据库 ${sensitiveText}`,
        variableKey: "ERP_DATABASE_URL",
        status: "blocked",
        detail: sensitiveText,
        nextAction: sensitiveText,
      },
    ],
  },
  blockingFindings: [
    {
      key: "database",
      label: `数据库 ${sensitiveText}`,
      severity: "blocking",
      detail: sensitiveText,
      nextAction: sensitiveText,
      variables: ["ERP_DATABASE_URL", "bad key"],
    },
  ],
  nextActions: [`继续 ${sensitiveText}`],
  safeguards: { onlyIntakeVariablesApplied: true, targetFileMode0600: true },
});

assert.equal(projected.status, "ready");
assert.equal(projected.ready, true);
assert.equal(projected.summary.sourceAssignmentCount, 3);
assert.equal(projected.summary.appliedVariableCount, 2);
assert.deepEqual(projected.appliedVariables, ["ERP_RUNTIME_MODE", "ERP_DATABASE_URL"]);
assert.deepEqual(projected.skippedVariables.unknownSourceVariables, ["UNKNOWN_VALUE"]);
assert.deepEqual(projected.alternativeGroups[0].configuredKeys, ["ERP_DATABASE_URL"]);
assert.equal(projected.targetEnvFile.fileMode, "600");
assert.equal(projected.sourceEnvFile.pathIncluded, false);
assert.equal(projected.targetEnvFile.pathIncluded, false);
assert.equal(projected.intakeCsv.pathIncluded, false);
assert.equal(projected.safeguards.envValuesExposed, false);
assert.equal(projected.safeguards.targetFileMode0600, true);

const serialized = JSON.stringify(projected);
for (const secret of ["postgres://", "storage.internal", "/Users/private", "secret-value"]) {
  assert.equal(serialized.includes(secret), false, `projection must redact ${secret}`);
}

const invalidMode = sanitizeV1ProductionEnvValuesApplyReport({
  scope: "v1_production_env_real_value_intake_apply",
  targetEnvFile: { fileMode: "/Users/private/600" },
});
assert.equal(invalidMode.targetEnvFile.fileMode, "");

console.log(
  "V1 production-env values-apply projection checks passed: allowlisted variables, normalized counts, path exclusion, sensitive-text redaction, and API extraction are covered.",
);
