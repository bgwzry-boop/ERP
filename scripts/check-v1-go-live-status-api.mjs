import assert from "node:assert/strict";
import { createApiServer } from "../server/apiServer.mjs";
import { createSeedSession } from "../server/authSeed.mjs";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  closeTestServer as closeServer,
  getTestServerBaseUrl,
  listenTestServer as listen,
} from "./helpers/apiIntegrationTestHarness.mjs";
import {
  v1PersistenceRepositoryObjectKeys,
  v1PersistenceStorageObjectKeys,
} from "../server/v1PersistenceProfile.mjs";
import { prepareV1GoLiveStatusFixture } from "./helpers/v1GoLiveStatusFixture.mjs";
import {
  applyOfficeV1ProductionFirstStageValues,
  generateOfficeV1FieldEvidenceDraftManifest,
  normalizeV1GoLiveStatusForClient,
  precheckOfficeV1AttachmentRetention,
  precheckOfficeV1DriverReadiness,
  precheckOfficeV1Persistence,
  precheckOfficeV1ProductionGoLive,
  precheckOfficeV1ProductionEnv,
  precheckOfficeV1ProductionEnvIntake,
  precheckOfficeV1ProductionEnvFileAudit,
  precheckOfficeV1ProductionEnvFilePreview,
  precheckOfficeV1ProductionFirstStageValuesDryRun,
  precheckOfficeV1ReleaseCandidateRefresh,
  precheckOfficeV1RuntimeReadiness,
  precheckOfficeV1V2Boundary,
  refreshOfficeV1V2ScopeBrief,
  refreshOfficeV1ReleaseCandidate,
  runOfficeV1ProductionEnvSetup,
  runOfficeV1ProductionFirstStageExecution,
  runOfficeV1ProductionPersistenceEvidence,
  validateOfficeV1FieldEvidenceDraftManifest,
} from "../src/services/officeV1GoLiveStatusApiClient.js";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";
import { assertClientGoLiveStatus, assertInitialGoLiveStatus, goLiveAssertions } from "./go-live/assertions.mjs";

const originalProductionEnvFileAuditPaths = process.env.ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS;
const originalProductionEnvFile = process.env.ERP_V1_PRODUCTION_ENV_FILE;
const originalV1EnvFile = process.env.ERP_V1_ENV_FILE;
const originalProductionEnvValuesFile = process.env.ERP_V1_PRODUCTION_ENV_VALUES_FILE;
const originalProductionEnvMinimumValuesFile = process.env.ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE;
const originalProductionEnvValuesFragmentFile = process.env.ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE;
const originalProductionEnvValuesApplyEnabled = process.env.ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED;
const originalV1GoLiveArtifactRoot = process.env.ERP_V1_GO_LIVE_ARTIFACT_ROOT;
const originalD49EmployeeIntakePrecheckReportPath = process.env.ERP_V1_D49_EMPLOYEE_INTAKE_PRECHECK_REPORT_PATH;
const originalD49EmployeeIntakeWorkbookPath = process.env.ERP_V1_D49_EMPLOYEE_INTAKE_WORKBOOK_PATH;
const fixtureArtifactRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-go-live-status-api");
const fixtureD49EmployeeIntakePrecheckReportPath = join(fixtureArtifactRoot, "d49-employee-intake-precheck.json");
const fixtureD49EmployeeIntakeWorkbookPath = join(fixtureArtifactRoot, "d49-employee-intake-workbook.xlsx");
const fixtureD49EmployeeIntakeWorkbookBytes = Buffer.from("D49 controlled workbook fixture", "utf8");
const fixtureD49EmployeeIntakeCheckedAt = new Date().toISOString();
const expectedPersistenceRepositoryCount =
  v1PersistenceRepositoryObjectKeys.length + v1PersistenceStorageObjectKeys.length;
const officeDemoReadinessToken = createSeedSession("U-MANAGER-A").accessToken;
const driverDemoReadinessToken = createSeedSession("U-DRIVER-A").accessToken;

process.env.ERP_V1_GO_LIVE_ARTIFACT_ROOT = fixtureArtifactRoot;
process.env.ERP_V1_D49_EMPLOYEE_INTAKE_PRECHECK_REPORT_PATH = fixtureD49EmployeeIntakePrecheckReportPath;
process.env.ERP_V1_D49_EMPLOYEE_INTAKE_WORKBOOK_PATH = fixtureD49EmployeeIntakeWorkbookPath;
const server = createApiServer(withLocalRepositoryFixture({ allowLocalFixture: true }));

try {
  await listen(server);
  const baseUrl = getTestServerBaseUrl(server);
  await prepareV1GoLiveStatusFixture(fixtureArtifactRoot, {
    apiBaseUrl: `${baseUrl}/api`,
    d49EmployeeIntakePrecheckReportPath: fixtureD49EmployeeIntakePrecheckReportPath,
    d49EmployeeIntakeWorkbookPath: fixtureD49EmployeeIntakeWorkbookPath,
    d49EmployeeIntakeWorkbookBytes: fixtureD49EmployeeIntakeWorkbookBytes,
    d49EmployeeIntakeCheckedAt: fixtureD49EmployeeIntakeCheckedAt,
  });
  const response = await fetch(`${baseUrl}/api/system/v1-go-live-status`, {
    headers: {
      "x-erp-user-id": "U-MANAGER-A",
    },
  });
  assert.equal(response.status, 200, "/api/system/v1-go-live-status should return 200");
  const json = await response.json();

  const {
    expectedIntakeRowCount,
    expectedBlockingTargetCount,
    expectedWarningTargetCount,
    initialDraftManifestAvailable,
    initialDraftFreshnessReady,
    initialDraftFreshnessLabel,
  } = assertInitialGoLiveStatus(json);

  const unsafeValuesDir = join(".erp-local-storage", "tmp-values-fragment-audit-check");
  const unsafeValuesFile = join(unsafeValuesDir, "unsafe-values.env.example");
  mkdirSync(unsafeValuesDir, { recursive: true });
  writeFileSync(
    unsafeValuesFile,
    [
      "ERP_V1_DATABASE_URL=postgres://fake-secret-should-not-leak",
      "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=fake-secret-should-not-leak",
      "",
    ].join("\n"),
  );
  chmodSync(unsafeValuesFile, 0o600);
  process.env.ERP_V1_PRODUCTION_ENV_VALUES_FILE = unsafeValuesFile;
  delete process.env.ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE;
  delete process.env.ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE;

  const unsafeValuesStatusResponse = await fetch(`${baseUrl}/api/system/v1-go-live-status`, {
    headers: {
      "x-erp-user-id": "U-MANAGER-A",
    },
  });
  assert.equal(unsafeValuesStatusResponse.status, 200);
  const unsafeValuesStatusJson = await unsafeValuesStatusResponse.json();
  goLiveAssertions.assertUnsafeValuesStatus({ unsafeValuesStatusJson });
  const unsafeValuesStatusSerialized = JSON.stringify(unsafeValuesStatusJson);
  assert.ok(!unsafeValuesStatusSerialized.includes(unsafeValuesFile));
  assert.ok(!unsafeValuesStatusSerialized.includes("fake-secret-should-not-leak"));

  const unsafeValuesDryRunResponse = await fetch(`${baseUrl}/api/system/v1-production-first-stage-values-dry-run/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      valuesFilePath: "/Users/should-not-be-read/values.env",
      fakeSecret: "fake-secret-should-not-leak",
    }),
  });
  assert.equal(unsafeValuesDryRunResponse.status, 200);
  const unsafeValuesDryRunJson = await unsafeValuesDryRunResponse.json();
  goLiveAssertions.assertUnsafeValuesDryRun({ unsafeValuesDryRunJson });
  const unsafeValuesDryRunSerialized = JSON.stringify(unsafeValuesDryRunJson);
  goLiveAssertions.assertUnsafeValuesDryRunSerialized({ unsafeValuesDryRunSerialized, unsafeValuesFile });
  restoreProductionEnvValuesFileEnv();
  goLiveAssertions.assertGoLive({ json });

  const serialized = JSON.stringify(json);
  goLiveAssertions.assertSerialized({ serialized });

  const deniedDraftResponse = await fetch(`${baseUrl}/api/system/v1-field-evidence-intake/draft-manifest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(deniedDraftResponse.status, 403, "warehouse should not be allowed to generate V1 field evidence draft manifest");
  const deniedDraftJson = await deniedDraftResponse.json();
  assert.equal(deniedDraftJson.requiredPermission, "system.v1_field_evidence_intake.apply");

  const deniedValidationResponse = await fetch(`${baseUrl}/api/system/v1-field-evidence-intake/validate-draft-manifest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(deniedValidationResponse.status, 403, "warehouse should not be allowed to validate V1 field evidence draft manifest");
  const deniedValidationJson = await deniedValidationResponse.json();
  assert.equal(deniedValidationJson.requiredPermission, "system.v1_field_evidence.validate");

  const deniedProductionEnvPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(deniedProductionEnvPrecheckResponse.status, 403, "warehouse should not be allowed to precheck current V1 production env");
  const deniedProductionEnvPrecheckJson = await deniedProductionEnvPrecheckResponse.json();
  assert.equal(deniedProductionEnvPrecheckJson.requiredPermission, "system.v1_production_env.precheck");

  const deniedProductionEnvSetupResponse = await fetch(`${baseUrl}/api/system/v1-production-env-setup/live-run`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedProductionEnvSetupResponse.status,
    403,
    "warehouse should not be allowed to run V1 production env setup",
  );
  const deniedProductionEnvSetupJson = await deniedProductionEnvSetupResponse.json();
  assert.equal(deniedProductionEnvSetupJson.requiredPermission, "system.v1_production_env_setup.run");

  const deniedProductionEnvIntakePrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-intake/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedProductionEnvIntakePrecheckResponse.status,
    403,
    "warehouse should not be allowed to precheck V1 production env intake",
  );
  const deniedProductionEnvIntakePrecheckJson = await deniedProductionEnvIntakePrecheckResponse.json();
  assert.equal(deniedProductionEnvIntakePrecheckJson.requiredPermission, "system.v1_production_env_intake.precheck");

  const deniedProductionEnvFileAuditPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-file-audit/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedProductionEnvFileAuditPrecheckResponse.status,
    403,
    "warehouse should not be allowed to precheck current V1 production env file audit",
  );
  const deniedProductionEnvFileAuditPrecheckJson = await deniedProductionEnvFileAuditPrecheckResponse.json();
  assert.equal(deniedProductionEnvFileAuditPrecheckJson.requiredPermission, "system.v1_production_env_file_audit.precheck");

  const deniedProductionEnvFilePreviewPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-file-preview/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedProductionEnvFilePreviewPrecheckResponse.status,
    403,
    "warehouse should not be allowed to precheck current V1 production env file preview",
  );
  const deniedProductionEnvFilePreviewPrecheckJson = await deniedProductionEnvFilePreviewPrecheckResponse.json();
  assert.equal(deniedProductionEnvFilePreviewPrecheckJson.requiredPermission, "system.v1_production_env_file_preview.precheck");

  const deniedProductionGoLivePrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-go-live/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedProductionGoLivePrecheckResponse.status,
    403,
    "warehouse should not be allowed to precheck current V1 production go-live",
  );
  const deniedProductionGoLivePrecheckJson = await deniedProductionGoLivePrecheckResponse.json();
  assert.equal(deniedProductionGoLivePrecheckJson.requiredPermission, "system.v1_production_go_live.precheck");

  const deniedProductionPersistenceEvidenceResponse = await fetch(
    `${baseUrl}/api/system/v1-production-persistence-evidence/live-run`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-WAREHOUSE-A",
      },
      body: "{}",
    },
  );
  assert.equal(
    deniedProductionPersistenceEvidenceResponse.status,
    403,
    "warehouse should not be allowed to run production persistence evidence",
  );
  const deniedProductionPersistenceEvidenceJson = await deniedProductionPersistenceEvidenceResponse.json();
  assert.equal(
    deniedProductionPersistenceEvidenceJson.requiredPermission,
    "system.v1_production_persistence_evidence.run",
  );

  const deniedProductionFirstStageExecutionResponse = await fetch(
    `${baseUrl}/api/system/v1-production-first-stage-execution/live-run`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-WAREHOUSE-A",
      },
      body: "{}",
    },
  );
  assert.equal(
    deniedProductionFirstStageExecutionResponse.status,
    403,
    "warehouse should not be allowed to run production first-stage execution",
  );
  const deniedProductionFirstStageExecutionJson = await deniedProductionFirstStageExecutionResponse.json();
  assert.equal(
    deniedProductionFirstStageExecutionJson.requiredPermission,
    "system.v1_production_first_stage_execution.run",
  );

  const deniedProductionFirstStageValuesDryRunPrecheckResponse = await fetch(
    `${baseUrl}/api/system/v1-production-first-stage-values-dry-run/live-precheck`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-WAREHOUSE-A",
      },
      body: "{}",
    },
  );
  assert.equal(
    deniedProductionFirstStageValuesDryRunPrecheckResponse.status,
    403,
    "warehouse should not be allowed to precheck production first-stage values dry-run",
  );
  const deniedProductionFirstStageValuesDryRunPrecheckJson = await deniedProductionFirstStageValuesDryRunPrecheckResponse.json();
  assert.equal(
    deniedProductionFirstStageValuesDryRunPrecheckJson.requiredPermission,
    "system.v1_production_first_stage_values_dry_run.precheck",
  );

  const deniedProductionFirstStageValuesApplyResponse = await fetch(
    `${baseUrl}/api/system/v1-production-first-stage-values-apply/live-run`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-WAREHOUSE-A",
      },
      body: "{}",
    },
  );
  assert.equal(
    deniedProductionFirstStageValuesApplyResponse.status,
    403,
    "warehouse should not be allowed to apply production first-stage values",
  );
  const deniedProductionFirstStageValuesApplyJson = await deniedProductionFirstStageValuesApplyResponse.json();
  assert.equal(
    deniedProductionFirstStageValuesApplyJson.requiredPermission,
    "system.v1_production_first_stage_values_apply.run",
  );

  const deniedPersistencePrecheckResponse = await fetch(`${baseUrl}/api/system/v1-persistence/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(deniedPersistencePrecheckResponse.status, 403, "warehouse should not be allowed to precheck current V1 persistence");
  const deniedPersistencePrecheckJson = await deniedPersistencePrecheckResponse.json();
  assert.equal(deniedPersistencePrecheckJson.requiredPermission, "system.v1_persistence.precheck");

  const deniedAttachmentRetentionPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-attachment-retention/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedAttachmentRetentionPrecheckResponse.status,
    403,
    "warehouse should not be allowed to precheck current V1 attachment retention",
  );
  const deniedAttachmentRetentionPrecheckJson = await deniedAttachmentRetentionPrecheckResponse.json();
  assert.equal(deniedAttachmentRetentionPrecheckJson.requiredPermission, "system.v1_attachment_retention.precheck");

  const deniedRuntimeReadinessPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-runtime-readiness/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedRuntimeReadinessPrecheckResponse.status,
    403,
    "warehouse should not be allowed to precheck current V1 runtime readiness",
  );
  const deniedRuntimeReadinessPrecheckJson = await deniedRuntimeReadinessPrecheckResponse.json();
  assert.equal(deniedRuntimeReadinessPrecheckJson.requiredPermission, "system.v1_runtime_readiness.precheck");

  const deniedV1V2BoundaryPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-v2-boundary/precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedV1V2BoundaryPrecheckResponse.status,
    403,
    "warehouse should not be allowed to precheck V1/V2 boundary",
  );
  const deniedV1V2BoundaryPrecheckJson = await deniedV1V2BoundaryPrecheckResponse.json();
  assert.equal(deniedV1V2BoundaryPrecheckJson.requiredPermission, "system.v1_v2_boundary.precheck");

  const deniedV1V2ScopeBriefRefreshResponse = await fetch(`${baseUrl}/api/system/v1-v2-scope-brief/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(
    deniedV1V2ScopeBriefRefreshResponse.status,
    403,
    "warehouse should not be allowed to refresh V1/V2 scope brief",
  );
  const deniedV1V2ScopeBriefRefreshJson = await deniedV1V2ScopeBriefRefreshResponse.json();
  assert.equal(deniedV1V2ScopeBriefRefreshJson.requiredPermission, "system.v1_v2_scope_brief.refresh");

  const deniedRefreshPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-release-candidate/refresh-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: "{}",
  });
  assert.equal(deniedRefreshPrecheckResponse.status, 403, "warehouse should not be allowed to precheck V1 release candidate refresh");
  const deniedRefreshPrecheckJson = await deniedRefreshPrecheckResponse.json();
  assert.equal(deniedRefreshPrecheckJson.requiredPermission, "system.v1_release_candidate.refresh_precheck");

  const draftResponse = await fetch(`${baseUrl}/api/system/v1-field-evidence-intake/draft-manifest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: "{}",
  });
  assert.equal(draftResponse.status, 200, "/api/system/v1-field-evidence-intake/draft-manifest should return 200 for management");
  const draftJson = await draftResponse.json();
  goLiveAssertions.assertDraft({ draftJson });
  const serializedDraft = JSON.stringify(draftJson);
  goLiveAssertions.assertSerializedDraft({ serializedDraft });

  const clientDraftResult = await generateOfficeV1FieldEvidenceDraftManifest(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientDraft({ clientDraftResult });

  const validationResponse = await fetch(`${baseUrl}/api/system/v1-field-evidence-intake/validate-draft-manifest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: "{}",
  });
  assert.equal(validationResponse.status, 200, "/api/system/v1-field-evidence-intake/validate-draft-manifest should return 200 for management");
  const validationJson = await validationResponse.json();
  goLiveAssertions.assertValidation({ validationJson });
  const serializedValidation = JSON.stringify(validationJson);
  goLiveAssertions.assertSerializedValidation({ serializedValidation });

  const clientValidationResult = await validateOfficeV1FieldEvidenceDraftManifest(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientValidation({ clientValidationResult });

  const fieldEvidenceCsvPath = join(fixtureArtifactRoot, "v1-field-evidence-intake", "evidence-items.csv");
  const originalFieldEvidenceCsv = readFileSync(fieldEvidenceCsvPath, "utf8");
  writeFileSync(fieldEvidenceCsvPath, `${originalFieldEvidenceCsv}\n`);
  try {
    const staleStatusResponse = await fetch(`${baseUrl}/api/system/v1-go-live-status`, {
      headers: {
        "x-erp-user-id": "U-MANAGER-A",
      },
    });
    assert.equal(staleStatusResponse.status, 200, "V1 go-live status should return stale draft freshness after CSV changes");
    const staleStatusJson = await staleStatusResponse.json();
    assert.equal(staleStatusJson.fieldEvidenceDraftFreshness.status, "stale");
    assert.equal(staleStatusJson.fieldEvidenceDraftFreshness.ready, false);
    assert.equal(staleStatusJson.fieldEvidenceIntakeGuidance.summary.draftFreshnessStatus, "stale");
    assert.equal(staleStatusJson.fieldEvidenceIntakeQuality.summary.draftFreshnessStatus, "stale");
    assert.equal(staleStatusJson.fieldEvidenceIntakeQuality.summary.draftFreshnessLabel, "已过期");
    assert.equal(staleStatusJson.fieldEvidenceIntakeQuality.summary.canRefreshReleaseCandidate, false);
    assert.ok(staleStatusJson.fieldEvidenceIntakeQuality.checks.some((item) => item.key === "draft-freshness" && item.ready === false));

    const staleValidationResponse = await fetch(`${baseUrl}/api/system/v1-field-evidence-intake/validate-draft-manifest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-MANAGER-A",
      },
      body: "{}",
    });
    assert.equal(staleValidationResponse.status, 200, "stale draft validation should still return sanitized validation body");
    const staleValidationJson = await staleValidationResponse.json();
    assert.equal(staleValidationJson.status, "stale");
    assert.equal(staleValidationJson.ready, false);
    assert.equal(staleValidationJson.summary.draftFreshnessStatus, "stale");
    assert.equal(staleValidationJson.summary.draftFreshnessLabel, "已过期");
    assert.ok(staleValidationJson.blockers.some((item) => item.type === "draft_freshness"));

    const staleRefreshPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-release-candidate/refresh-precheck`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-MANAGER-A",
      },
      body: "{}",
    });
    assert.equal(staleRefreshPrecheckResponse.status, 200, "stale refresh precheck should return a blocked precheck");
    const staleRefreshPrecheckJson = await staleRefreshPrecheckResponse.json();
    assert.equal(staleRefreshPrecheckJson.summary.draftFreshnessStatus, "stale");
    assert.equal(staleRefreshPrecheckJson.summary.draftFreshnessReady, false);
    assert.ok(staleRefreshPrecheckJson.blockers.some((item) => item.key === "field-evidence-draft-stale"));
    assert.equal(staleRefreshPrecheckJson.safeguards.draftFreshnessChecked, true);
    assert.equal(staleRefreshPrecheckJson.safeguards.digestValuesIncluded, false);
  } finally {
    writeFileSync(fieldEvidenceCsvPath, originalFieldEvidenceCsv);
  }

  const productionEnvPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", ERP_V1_DATABASE_URL: "SUPER_SECRET" }),
  });
  assert.equal(productionEnvPrecheckResponse.status, 200, "/api/system/v1-production-env/live-precheck should return 200 for management");
  const productionEnvPrecheckJson = await productionEnvPrecheckResponse.json();
  assert.equal(productionEnvPrecheckJson.version, "p0-v1-production-env-live-precheck-v1");
  assert.equal(productionEnvPrecheckJson.scope, "v1_production_env_live_precheck");
  assert.equal(productionEnvPrecheckJson.status, "blocked");
  assert.equal(productionEnvPrecheckJson.ready, false);
  assert.equal(productionEnvPrecheckJson.summary.readinessLabel, "2/12");
  assert.equal(productionEnvPrecheckJson.summary.passedCount, 2);
  assert.equal(productionEnvPrecheckJson.summary.totalCount, 12);
  assert.equal(productionEnvPrecheckJson.summary.blockingCount, 8);
  assert.equal(productionEnvPrecheckJson.summary.warningCount, 2);
  assert.equal(productionEnvPrecheckJson.summary.currentRuntime, true);
  assert.equal(productionEnvPrecheckJson.summary.envFilePathAccepted, false);
  assert.equal(productionEnvPrecheckJson.summary.releaseCandidateRefreshed, false);
  assert.equal(productionEnvPrecheckJson.summary.goLiveSuiteRefreshed, false);
  assert.equal(productionEnvPrecheckJson.checks.length, 12);
  assert.equal(productionEnvPrecheckJson.blockingChecks.length, 8);
  assert.equal(productionEnvPrecheckJson.warningChecks.length, 2);
  assert.ok(
    productionEnvPrecheckJson.blockingChecks.some((item) =>
      item.key === "v1-persistence-profile" &&
      item.missingVariables.includes("ERP_V1_PERSISTENCE_PROFILE=postgres")
    ),
  );
  assert.ok(
    productionEnvPrecheckJson.blockingChecks.some((item) =>
      item.key === "attachment-object-storage-env" &&
      item.missingVariables.includes("ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY")
    ),
  );
  assert.ok(
    productionEnvPrecheckJson.blockingChecks.some((item) =>
      item.key === "postgres-restore-validation-env" &&
      item.missingVariables.includes("ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL")
    ),
  );
  assert.equal(productionEnvPrecheckJson.safeguards.nonMutating, true);
  assert.equal(productionEnvPrecheckJson.safeguards.liveProcessEnvChecked, true);
  assert.equal(productionEnvPrecheckJson.safeguards.requestBodyIgnored, true);
  assert.equal(productionEnvPrecheckJson.safeguards.envFilePathAccepted, false);
  assert.equal(productionEnvPrecheckJson.safeguards.envFileReadByRequest, false);
  assert.equal(productionEnvPrecheckJson.safeguards.rawProductionEnvPreflightIncluded, false);
  assert.equal(productionEnvPrecheckJson.safeguards.rawEnvFileAuditIncluded, false);
  assert.equal(productionEnvPrecheckJson.safeguards.rawEnvFileIncluded, false);
  assert.equal(productionEnvPrecheckJson.safeguards.environmentValuesIncluded, false);
  assert.equal(productionEnvPrecheckJson.safeguards.envValuesIncluded, false);
  assert.equal(productionEnvPrecheckJson.safeguards.commandValuesIncluded, false);
  assert.equal(productionEnvPrecheckJson.safeguards.secretValuesIncluded, false);
  assert.equal(productionEnvPrecheckJson.safeguards.releaseCandidateRefreshed, false);
  assert.equal(productionEnvPrecheckJson.safeguards.goLiveSuiteRefreshed, false);
  const serializedProductionEnvPrecheck = JSON.stringify(productionEnvPrecheckJson);
  assert.doesNotMatch(serializedProductionEnvPrecheck, /\.erp-local-storage|filled-manifest|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedProductionEnvPrecheck, /SUPER_SECRET|SECRET_VALUE|pass@prod-db/i);

  const clientProductionEnvPrecheckResult = await precheckOfficeV1ProductionEnv(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientProductionEnvPrecheck({ clientProductionEnvPrecheckResult });

  const productionEnvSetupResponse = await fetch(`${baseUrl}/api/system/v1-production-env-setup/live-run`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      targetEnvFilePath: "/Users/should-not-be-read/secure-prod.env",
      importFrom: "/private/should-not-be-read/import.env",
      ERP_V1_DATABASE_URL: "postgres://user:SUPER_SECRET_SETUP@prod-db.internal/erp",
      token: "SUPER_SECRET_SETUP",
    }),
  });
  assert.equal(
    productionEnvSetupResponse.status,
    200,
    "/api/system/v1-production-env-setup/live-run should return 200 for management",
  );
  const productionEnvSetupJson = await productionEnvSetupResponse.json();
  goLiveAssertions.assertProductionEnvSetup({ productionEnvSetupJson });
  const serializedProductionEnvSetup = JSON.stringify(productionEnvSetupJson);
  assert.doesNotMatch(serializedProductionEnvSetup, /SUPER_SECRET_SETUP|prod-db\.internal|should-not-be-read|\/Users\/|\/private|\.erp-local-storage|secure-prod\.env/);

  const clientProductionEnvSetupResult = await runOfficeV1ProductionEnvSetup(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientProductionEnvSetup({ clientProductionEnvSetupResult });

  const productionEnvIntakePrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-intake/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      envFilePath: "/Users/should-not-be-read/production.env",
      ERP_V1_DATABASE_URL: "postgres://user:pass@prod-db.internal/erp",
      token: "SUPER_SECRET_ENV_INTAKE",
    }),
  });
  assert.equal(
    productionEnvIntakePrecheckResponse.status,
    200,
    "/api/system/v1-production-env-intake/live-precheck should return 200 for management",
  );
  const productionEnvIntakePrecheckJson = await productionEnvIntakePrecheckResponse.json();
  goLiveAssertions.assertProductionEnvIntakePrecheck({ productionEnvIntakePrecheckJson });
  const liveIntakeSummary = productionEnvIntakePrecheckJson.summary;
  const liveIntakeRowCount = liveIntakeSummary.intakeRowCount;
  const liveBlockingTargetCount = liveIntakeSummary.blockingCount;
  const liveWarningTargetCount = liveIntakeSummary.warningCount;
  goLiveAssertions.assertProductionEnvIntakePrecheck2({ liveIntakeRowCount, productionEnvIntakePrecheckJson, liveBlockingTargetCount, liveWarningTargetCount });
  const serializedProductionEnvIntakePrecheck = JSON.stringify(productionEnvIntakePrecheckJson);
  assert.doesNotMatch(serializedProductionEnvIntakePrecheck, /SUPER_SECRET_ENV_INTAKE|postgres:\/\/user:pass|should-not-be-read|\/Users\/|\/private\//);

  const clientProductionEnvIntakePrecheckResult = await precheckOfficeV1ProductionEnvIntake(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientProductionEnvIntakePrecheck({ clientProductionEnvIntakePrecheckResult, liveIntakeRowCount, liveBlockingTargetCount });

  clearProductionEnvFileAuditEnv();
  const productionEnvFileAuditPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-file-audit/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", token: "SUPER_SECRET_ENV_FILE_PATH" }),
  });
  assert.equal(
    productionEnvFileAuditPrecheckResponse.status,
    200,
    "/api/system/v1-production-env-file-audit/live-precheck should return 200 for management when audit path is not configured",
  );
  const productionEnvFileAuditPrecheckJson = await productionEnvFileAuditPrecheckResponse.json();
  goLiveAssertions.assertProductionEnvFileAuditPrecheck({ productionEnvFileAuditPrecheckJson });
  const serializedProductionEnvFileAuditPrecheck = JSON.stringify(productionEnvFileAuditPrecheckJson);
  assert.doesNotMatch(serializedProductionEnvFileAuditPrecheck, /SUPER_SECRET_ENV_FILE_PATH|\/Users\/|\/private\//);

  const clientProductionEnvFileAuditPrecheckResult = await precheckOfficeV1ProductionEnvFileAudit(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientProductionEnvFileAuditPrecheck({ clientProductionEnvFileAuditPrecheckResult });

  const productionEnvFilePreviewPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-file-preview/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", ERP_V1_DATABASE_URL: "SUPER_SECRET_FILE_PREVIEW" }),
  });
  assert.equal(
    productionEnvFilePreviewPrecheckResponse.status,
    200,
    "/api/system/v1-production-env-file-preview/live-precheck should return 200 for management when env file path is not configured",
  );
  const productionEnvFilePreviewPrecheckJson = await productionEnvFilePreviewPrecheckResponse.json();
  goLiveAssertions.assertProductionEnvFilePreviewPrecheck({ productionEnvFilePreviewPrecheckJson });
  const serializedProductionEnvFilePreviewPrecheck = JSON.stringify(productionEnvFilePreviewPrecheckJson);
  assert.doesNotMatch(serializedProductionEnvFilePreviewPrecheck, /SUPER_SECRET_FILE_PREVIEW|\/Users\/|\/private\//);

  const clientProductionEnvFilePreviewPrecheckResult = await precheckOfficeV1ProductionEnvFilePreview(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientProductionEnvFilePreviewPrecheck({ clientProductionEnvFilePreviewPrecheckResult });

  const productionGoLivePrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-go-live/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", token: "SUPER_SECRET_GO_LIVE" }),
  });
  assert.equal(
    productionGoLivePrecheckResponse.status,
    200,
    "/api/system/v1-production-go-live/live-precheck should return 200 for management when env file path is not configured",
  );
  const productionGoLivePrecheckJson = await productionGoLivePrecheckResponse.json();
  goLiveAssertions.assertProductionGoLivePrecheck({ productionGoLivePrecheckJson });
  const serializedProductionGoLivePrecheck = JSON.stringify(productionGoLivePrecheckJson);
  assert.doesNotMatch(serializedProductionGoLivePrecheck, /SUPER_SECRET_GO_LIVE|\/Users\/|\/private\//);

  const clientProductionGoLivePrecheckResult = await precheckOfficeV1ProductionGoLive(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientProductionGoLivePrecheck({ clientProductionGoLivePrecheckResult });

  const productionPersistenceEvidenceResponse = await fetch(
    `${baseUrl}/api/system/v1-production-persistence-evidence/live-run`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-MANAGER-A",
      },
      body: JSON.stringify({
        envFilePath: "/Users/should-not-be-read/.env",
        valuesFilePath: "/Users/should-not-be-read/values.env",
        apiBaseUrl: "http://SUPER_SECRET_PERSISTENCE_EVIDENCE_API.invalid/api",
        token: "SUPER_SECRET_PERSISTENCE_EVIDENCE",
      }),
    },
  );
  assert.equal(
    productionPersistenceEvidenceResponse.status,
    200,
    "/api/system/v1-production-persistence-evidence/live-run should return 200 for management with current blocked env",
  );
  const productionPersistenceEvidenceJson = await productionPersistenceEvidenceResponse.json();
  goLiveAssertions.assertProductionPersistenceEvidence({ productionPersistenceEvidenceJson });
  const serializedProductionPersistenceEvidence = JSON.stringify(productionPersistenceEvidenceJson);
  assert.doesNotMatch(serializedProductionPersistenceEvidence, /SUPER_SECRET_PERSISTENCE_EVIDENCE|SUPER_SECRET_PERSISTENCE_EVIDENCE_API|\/Users\/|\/private|values\.env|\.erp-local-storage/);

  const clientProductionPersistenceEvidenceResult = await runOfficeV1ProductionPersistenceEvidence(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientProductionPersistenceEvidence({ clientProductionPersistenceEvidenceResult });

  const productionFirstStageExecutionResponse = await fetch(
    `${baseUrl}/api/system/v1-production-first-stage-execution/live-run`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-MANAGER-A",
        host: "attacker.invalid:9443",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({
        envFilePath: "/Users/should-not-be-read/.env",
        valuesFilePath: "/Users/should-not-be-read/values.env",
        apiBaseUrl: "http://SUPER_SECRET_FIRST_STAGE_API.invalid/api",
        token: "SUPER_SECRET_FIRST_STAGE",
      }),
    },
  );
  assert.equal(
    productionFirstStageExecutionResponse.status,
    200,
    "/api/system/v1-production-first-stage-execution/live-run should return 200 for management with current blocked env",
  );
  const productionFirstStageExecutionJson = await productionFirstStageExecutionResponse.json();
  goLiveAssertions.assertProductionFirstStageExecution({ productionFirstStageExecutionJson, liveIntakeRowCount, liveBlockingTargetCount });
  const serializedProductionFirstStageExecution = JSON.stringify(productionFirstStageExecutionJson);
  assert.doesNotMatch(serializedProductionFirstStageExecution, /SUPER_SECRET_FIRST_STAGE|SUPER_SECRET_FIRST_STAGE_API|\/Users\/|\/private|values\.env/);

  const clientProductionFirstStageExecutionResult = await runOfficeV1ProductionFirstStageExecution(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientProductionFirstStageExecution({ clientProductionFirstStageExecutionResult });

  clearProductionEnvValuesFileEnv();
  const productionFirstStageValuesDryRunPrecheckResponse = await fetch(
    `${baseUrl}/api/system/v1-production-first-stage-values-dry-run/live-precheck`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-MANAGER-A",
      },
      body: JSON.stringify({
        valuesFilePath: "/Users/should-not-be-read/.env",
        token: "SUPER_SECRET_VALUES",
      }),
    },
  );
  assert.equal(
    productionFirstStageValuesDryRunPrecheckResponse.status,
    200,
    "/api/system/v1-production-first-stage-values-dry-run/live-precheck should return 200 for management when values file is not configured",
  );
  const productionFirstStageValuesDryRunPrecheckJson = await productionFirstStageValuesDryRunPrecheckResponse.json();
  goLiveAssertions.assertProductionFirstStageValuesDryRunPrecheck({ productionFirstStageValuesDryRunPrecheckJson });
  const serializedProductionFirstStageValuesDryRunPrecheck = JSON.stringify(productionFirstStageValuesDryRunPrecheckJson);
  assert.doesNotMatch(serializedProductionFirstStageValuesDryRunPrecheck, /SUPER_SECRET_VALUES|\/Users\/|\/private|\.erp-local-storage/);

  const clientProductionFirstStageValuesDryRunPrecheckResult = await precheckOfficeV1ProductionFirstStageValuesDryRun(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientProductionFirstStageValuesDryRunPrecheck({ clientProductionFirstStageValuesDryRunPrecheckResult });

  clearProductionEnvValuesFileEnv();
  const productionFirstStageValuesApplyDisabledResponse = await fetch(
    `${baseUrl}/api/system/v1-production-first-stage-values-apply/live-run`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-MANAGER-A",
      },
      body: JSON.stringify({
        valuesFilePath: "/Users/should-not-be-read/.env",
        token: "SUPER_SECRET_VALUES_APPLY",
      }),
    },
  );
  assert.equal(
    productionFirstStageValuesApplyDisabledResponse.status,
    200,
    "/api/system/v1-production-first-stage-values-apply/live-run should return disabled by default",
  );
  const productionFirstStageValuesApplyDisabledJson = await productionFirstStageValuesApplyDisabledResponse.json();
  goLiveAssertions.assertProductionFirstStageValuesApplyDisabled({ productionFirstStageValuesApplyDisabledJson });
  const serializedProductionFirstStageValuesApplyDisabled = JSON.stringify(productionFirstStageValuesApplyDisabledJson);
  assert.doesNotMatch(serializedProductionFirstStageValuesApplyDisabled, /SUPER_SECRET_VALUES_APPLY|\/Users\/|\/private|\.erp-local-storage/);

  const clientProductionFirstStageValuesApplyDisabledResult = await applyOfficeV1ProductionFirstStageValues(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientProductionFirstStageValuesApplyDisabled({ clientProductionFirstStageValuesApplyDisabledResult });

  clearProductionEnvValuesFileEnv();
  process.env.ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED = "true";
  const productionFirstStageValuesApplyNotConfiguredResponse = await fetch(
    `${baseUrl}/api/system/v1-production-first-stage-values-apply/live-run`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-erp-user-id": "U-MANAGER-A",
      },
      body: JSON.stringify({
        valuesFilePath: "/Users/should-not-be-read/.env",
        token: "SUPER_SECRET_VALUES_APPLY_ENABLED",
      }),
    },
  );
  assert.equal(productionFirstStageValuesApplyNotConfiguredResponse.status, 200);
  const productionFirstStageValuesApplyNotConfiguredJson = await productionFirstStageValuesApplyNotConfiguredResponse.json();
  goLiveAssertions.assertProductionFirstStageValuesApplyNotConfigured({ productionFirstStageValuesApplyNotConfiguredJson });
  const serializedProductionFirstStageValuesApplyNotConfigured = JSON.stringify(productionFirstStageValuesApplyNotConfiguredJson);
  assert.doesNotMatch(serializedProductionFirstStageValuesApplyNotConfigured, /SUPER_SECRET_VALUES_APPLY_ENABLED|\/Users\/|\/private|\.erp-local-storage/);
  clearProductionEnvValuesFileEnv();

  process.env.ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS = join(process.cwd(), "docs", "development", "v1-production.env.example");
  delete process.env.ERP_V1_PRODUCTION_ENV_FILE;
  delete process.env.ERP_V1_ENV_FILE;
  const auditBlockedProductionEnvFilePreviewPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-file-preview/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", token: "SUPER_SECRET_AUDIT_BLOCKED_PREVIEW" }),
  });
  assert.equal(
    auditBlockedProductionEnvFilePreviewPrecheckResponse.status,
    200,
    "/api/system/v1-production-env-file-preview/live-precheck should separate configured audit blockers from missing paths",
  );
  const auditBlockedProductionEnvFilePreviewPrecheckJson = await auditBlockedProductionEnvFilePreviewPrecheckResponse.json();
  goLiveAssertions.assertAuditBlockedProductionEnvFilePreviewPrecheck({ auditBlockedProductionEnvFilePreviewPrecheckJson });
  const serializedAuditBlockedProductionEnvFilePreviewPrecheck = JSON.stringify(auditBlockedProductionEnvFilePreviewPrecheckJson);
  assert.doesNotMatch(serializedAuditBlockedProductionEnvFilePreviewPrecheck, /SUPER_SECRET_AUDIT_BLOCKED_PREVIEW|\/Users\/|\/private\//);

  const auditStorageRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-production-env-file-audit-live");
  const partialAuditEnvPath = join(auditStorageRoot, "partial-live.env");
  const safeAuditEnvPath = join(auditStorageRoot, "secure-live.env");
  mkdirSync(auditStorageRoot, { recursive: true });
  writeFileSync(
    partialAuditEnvPath,
    [
      "ERP_V1_PERSISTENCE_PROFILE=postgres",
      "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  chmodSync(partialAuditEnvPath, 0o600);
  process.env.ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS = partialAuditEnvPath;

  const envBlockedProductionEnvFilePreviewPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-file-preview/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", token: "SUPER_SECRET_ENV_BLOCKED_PREVIEW" }),
  });
  assert.equal(
    envBlockedProductionEnvFilePreviewPrecheckResponse.status,
    200,
    "/api/system/v1-production-env-file-preview/live-precheck should separate audit-ready files from env preflight blockers",
  );
  const envBlockedProductionEnvFilePreviewPrecheckJson = await envBlockedProductionEnvFilePreviewPrecheckResponse.json();
  goLiveAssertions.assertEnvBlockedProductionEnvFilePreviewPrecheck({ envBlockedProductionEnvFilePreviewPrecheckJson });
  const serializedEnvBlockedProductionEnvFilePreviewPrecheck = JSON.stringify(envBlockedProductionEnvFilePreviewPrecheckJson);
  assert.doesNotMatch(serializedEnvBlockedProductionEnvFilePreviewPrecheck, /SUPER_SECRET_ENV_BLOCKED_PREVIEW|partial-live\.env|\/Users\/|\/private\//);

  const envBlockedClientProductionEnvFilePreviewPrecheckResult = await precheckOfficeV1ProductionEnvFilePreview(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertEnvBlockedClientProductionEnvFilePreviewPrecheck({ envBlockedClientProductionEnvFilePreviewPrecheckResult });

  const auditOnlyProductionGoLivePrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-go-live/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", token: "SUPER_SECRET_AUDIT_ONLY_GO_LIVE" }),
  });
  assert.equal(
    auditOnlyProductionGoLivePrecheckResponse.status,
    200,
    "/api/system/v1-production-go-live/live-precheck should not treat audit-only env file paths as API startup env application",
  );
  const auditOnlyProductionGoLivePrecheckJson = await auditOnlyProductionGoLivePrecheckResponse.json();
  goLiveAssertions.assertAuditOnlyProductionGoLivePrecheck({ auditOnlyProductionGoLivePrecheckJson });
  const serializedAuditOnlyProductionGoLivePrecheck = JSON.stringify(auditOnlyProductionGoLivePrecheckJson);
  assert.doesNotMatch(serializedAuditOnlyProductionGoLivePrecheck, /SUPER_SECRET_AUDIT_ONLY_GO_LIVE|partial-live\.env|\/Users\/|\/private\//);

  writeFileSync(
    safeAuditEnvPath,
    [
      "ERP_RUNTIME_MODE=production",
      "ERP_V1_PERSISTENCE_PROFILE=postgres",
      "ERP_V1_DATABASE_URL=postgres://v1_user:SUPER_SECRET_LIVE@prod-db.internal:5432/erp",
      "ERP_V1_POSTGRES_RESTORE_TEST_DATABASE_URL=postgres://v1_restore:SUPER_SECRET_LIVE@restore-db.internal:5432/erp_restore",
      "ERP_V1_POSTGRES_RESTORE_RESET_ALLOWED=false",
      "ERP_V1_FILE_STORAGE_PROFILE=object_storage",
      "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT=https://oss-live-secret.example.com",
      "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET=erp-v1-live-private-bucket",
      "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID=AKIA_LIVE_SECRET",
      "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY=SUPER_SECRET_LIVE_ACCESS_KEY",
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT=https://oss-live-secret.example.com",
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET=erp-v1-live-statement-private-bucket",
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID=AKIA_LIVE_STATEMENT_SECRET",
      "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY=SUPER_SECRET_LIVE_STATEMENT_ACCESS_KEY",
      "ERP_SYSTEM_PRINTER_ENABLED=true",
      "ERP_SYSTEM_PRINTER_ADAPTER=command_bridge",
      "ERP_SYSTEM_PRINTER_COMMAND=/usr/local/bin/lp-live-secret",
      "ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON=[\"scripts/print-command-bridge.mjs\",\"--print-job-id\",\"{printJobId}\"]",
      "ERP_SYSTEM_PRINTER_ALLOWLIST=/usr/local/bin/lp-live-secret",
      "ERP_PRINT_COMMAND_BRIDGE_SPOOL_DIR=.erp-local-storage/print-spool-live-secret",
      "ERP_PRINT_COMMAND_BRIDGE_MODE=cups_lp",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_ALLOWLIST=Label-Live,DotMatrix-Live",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_PRINTER=Label-Live",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_COMMAND=/usr/bin/lpstat-live-secret",
      "ERP_PRINT_COMMAND_BRIDGE_CUPS_STATUS_ARGS_JSON=[\"-p\",\"{printer}\"]",
      "ERP_V1_READINESS_API_BASE_URL=http://127.0.0.1:8787/api",
      "ERP_V1_READINESS_OPERATOR_ID=U-MANAGER-A",
      `ERP_V1_READINESS_TOKEN=${officeDemoReadinessToken}`,
      "ERP_V1_READINESS_DRIVER_OPERATOR_ID=U-DRIVER-A",
      `ERP_V1_READINESS_DRIVER_TOKEN=${driverDemoReadinessToken}`,
      "ERP_V1_FIELD_ACCEPTANCE_OUTPUT_DIR=.erp-local-storage/v1-field-acceptance-live-secret",
      "ERP_V1_FIELD_ACCEPTANCE_API_BASE_URL=http://127.0.0.1:8787/api",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  chmodSync(safeAuditEnvPath, 0o600);
  delete process.env.ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS;
  process.env.ERP_V1_PRODUCTION_ENV_FILE = safeAuditEnvPath;
  process.env.ERP_V1_ENV_FILE = safeAuditEnvPath;

  const configuredProductionEnvFileAuditPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-file-audit/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", token: "SUPER_SECRET_CONFIGURED_ENV_FILE_PATH" }),
  });
  assert.equal(
    configuredProductionEnvFileAuditPrecheckResponse.status,
    200,
    "/api/system/v1-production-env-file-audit/live-precheck should return 200 for configured safe env file",
  );
  const configuredProductionEnvFileAuditPrecheckJson = await configuredProductionEnvFileAuditPrecheckResponse.json();
  goLiveAssertions.assertConfiguredProductionEnvFileAuditPrecheck({ configuredProductionEnvFileAuditPrecheckJson });
  const serializedConfiguredProductionEnvFileAuditPrecheck = JSON.stringify(configuredProductionEnvFileAuditPrecheckJson);
  assert.doesNotMatch(serializedConfiguredProductionEnvFileAuditPrecheck, /\.erp-local-storage|secure-live\.env|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedConfiguredProductionEnvFileAuditPrecheck, /SUPER_SECRET|oss-live-secret|lp-live-secret|print-spool-live-secret/i);

  const configuredClientProductionEnvFileAuditPrecheckResult = await precheckOfficeV1ProductionEnvFileAudit(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertConfiguredClientProductionEnvFileAuditPrecheck({ configuredClientProductionEnvFileAuditPrecheckResult });

  const configuredProductionEnvFilePreviewPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-env-file-preview/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", token: "SUPER_SECRET_CONFIGURED_ENV_FILE_PREVIEW" }),
  });
  assert.equal(
    configuredProductionEnvFilePreviewPrecheckResponse.status,
    200,
    "/api/system/v1-production-env-file-preview/live-precheck should return 200 for configured safe env file",
  );
  const configuredProductionEnvFilePreviewPrecheckJson = await configuredProductionEnvFilePreviewPrecheckResponse.json();
  goLiveAssertions.assertConfiguredProductionEnvFilePreviewPrecheck({ configuredProductionEnvFilePreviewPrecheckJson });
  const serializedConfiguredProductionEnvFilePreviewPrecheck = JSON.stringify(configuredProductionEnvFilePreviewPrecheckJson);
  goLiveAssertions.assertSerializedConfiguredProductionEnvFilePreviewPrecheck({ serializedConfiguredProductionEnvFilePreviewPrecheck, escapeRegExp, officeDemoReadinessToken, driverDemoReadinessToken });

  const configuredClientProductionEnvFilePreviewPrecheckResult = await precheckOfficeV1ProductionEnvFilePreview(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertConfiguredClientProductionEnvFilePreviewPrecheck({ configuredClientProductionEnvFilePreviewPrecheckResult });

  const configuredProductionGoLivePrecheckResponse = await fetch(`${baseUrl}/api/system/v1-production-go-live/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ envFilePath: "/Users/should-not-be-read/.env", token: "SUPER_SECRET_CONFIGURED_GO_LIVE" }),
  });
  assert.equal(
    configuredProductionGoLivePrecheckResponse.status,
    200,
    "/api/system/v1-production-go-live/live-precheck should return 200 for configured safe env file",
  );
  const configuredProductionGoLivePrecheckJson = await configuredProductionGoLivePrecheckResponse.json();
  goLiveAssertions.assertConfiguredProductionGoLivePrecheck({ configuredProductionGoLivePrecheckJson });
  const serializedConfiguredProductionGoLivePrecheck = JSON.stringify(configuredProductionGoLivePrecheckJson);
  assert.doesNotMatch(serializedConfiguredProductionGoLivePrecheck, /\.erp-local-storage|secure-live\.env|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedConfiguredProductionGoLivePrecheck, /SUPER_SECRET|oss-live-secret|lp-live-secret|print-spool-live-secret/i);

  const configuredClientProductionGoLivePrecheckResult = await precheckOfficeV1ProductionGoLive(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertConfiguredClientProductionGoLivePrecheck({ configuredClientProductionGoLivePrecheckResult });
  restoreProductionEnvFileAuditEnv();

  const persistencePrecheckResponse = await fetch(`${baseUrl}/api/system/v1-persistence/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({ connectionString: "postgres://SUPER_SECRET@127.0.0.1/db", localPath: "/Users/should-not-leak" }),
  });
  assert.equal(persistencePrecheckResponse.status, 200, "/api/system/v1-persistence/live-precheck should return 200 for management");
  const persistencePrecheckJson = await persistencePrecheckResponse.json();
  goLiveAssertions.assertPersistencePrecheck({ persistencePrecheckJson, expectedPersistenceRepositoryCount });
  const serializedPersistencePrecheck = JSON.stringify(persistencePrecheckJson);
  assert.doesNotMatch(serializedPersistencePrecheck, /\.erp-local-storage|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedPersistencePrecheck, /SUPER_SECRET|postgres:\/\/|pass@prod-db/i);

  const clientPersistencePrecheckResult = await precheckOfficeV1Persistence(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientPersistencePrecheck({ clientPersistencePrecheckResult, expectedPersistenceRepositoryCount });

  const attachmentRetentionPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-attachment-retention/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      storageKey: "attachments/storage-diagnostics/SUPER_SECRET_OBJECT",
      localPath: "/Users/should-not-leak/.erp-local-storage",
      token: "SECRET_ATTACHMENT_VALUE",
    }),
  });
  assert.equal(
    attachmentRetentionPrecheckResponse.status,
    200,
    "/api/system/v1-attachment-retention/live-precheck should return 200 for management",
  );
  const attachmentRetentionPrecheckJson = await attachmentRetentionPrecheckResponse.json();
  goLiveAssertions.assertAttachmentRetentionPrecheck({ attachmentRetentionPrecheckJson });
  const serializedAttachmentRetentionPrecheck = JSON.stringify(attachmentRetentionPrecheckJson);
  goLiveAssertions.assertSerializedAttachmentRetentionPrecheck({ serializedAttachmentRetentionPrecheck });

  const clientAttachmentRetentionPrecheckResult = await precheckOfficeV1AttachmentRetention(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientAttachmentRetentionPrecheck({ clientAttachmentRetentionPrecheckResult });

  const driverReadinessPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-driver-readiness/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      driverOperatorId: "SHOULD_BE_IGNORED",
      rawNativePayload: "SECRET_NATIVE_PAYLOAD",
      scannedText: "SECRET_PACKAGE_SCAN_TEXT",
      photoDataUrl: "data:image/png;base64,SECRET_PHOTO",
      gps: "SECRET_GPS",
      localPath: "/Users/should-not-leak/.erp-local-storage",
    }),
  });
  assert.equal(
    driverReadinessPrecheckResponse.status,
    200,
    "/api/system/v1-driver-readiness/live-precheck should return 200 for management",
  );
  const driverReadinessPrecheckJson = await driverReadinessPrecheckResponse.json();
  goLiveAssertions.assertDriverReadinessPrecheck({ driverReadinessPrecheckJson });
  const serializedDriverReadinessPrecheck = JSON.stringify(driverReadinessPrecheckJson);
  goLiveAssertions.assertSerializedDriverReadinessPrecheck({ serializedDriverReadinessPrecheck });

  const deniedDriverReadinessPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-driver-readiness/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: JSON.stringify({}),
  });
  assert.equal(deniedDriverReadinessPrecheckResponse.status, 403);
  const deniedDriverReadinessPrecheckJson = await deniedDriverReadinessPrecheckResponse.json();
  assert.equal(deniedDriverReadinessPrecheckJson.requiredPermission, "system.v1_driver_readiness.precheck");

  const clientDriverReadinessPrecheckResult = await precheckOfficeV1DriverReadiness(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientDriverReadinessPrecheck({ clientDriverReadinessPrecheckResult });

  const runtimeReadinessPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-runtime-readiness/live-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
      host: "attacker.invalid:9443",
      "x-forwarded-proto": "https",
    },
    body: JSON.stringify({ apiBaseUrl: "http://SUPER_SECRET.invalid/api", bearerToken: "SECRET_VALUE" }),
  });
  assert.equal(
    runtimeReadinessPrecheckResponse.status,
    200,
    "/api/system/v1-runtime-readiness/live-precheck should return 200 for management",
  );
  const runtimeReadinessPrecheckJson = await runtimeReadinessPrecheckResponse.json();
  goLiveAssertions.assertRuntimeReadinessPrecheck({ runtimeReadinessPrecheckJson });
  const serializedRuntimeReadinessPrecheck = JSON.stringify(runtimeReadinessPrecheckJson);
  goLiveAssertions.assertSerializedRuntimeReadinessPrecheck({ serializedRuntimeReadinessPrecheck });

  const clientRuntimeReadinessPrecheckResult = await precheckOfficeV1RuntimeReadiness(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientRuntimeReadinessPrecheck({ clientRuntimeReadinessPrecheckResult });

  const v1V2BoundaryPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-v2-boundary/precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      confirmedBy: "SHOULD_BE_IGNORED",
      token: "SUPER_SECRET_BOUNDARY_TOKEN",
    }),
  });
  assert.equal(v1V2BoundaryPrecheckResponse.status, 200, "/api/system/v1-v2-boundary/precheck should return 200 for management");
  const v1V2BoundaryPrecheckJson = await v1V2BoundaryPrecheckResponse.json();
  goLiveAssertions.assertV1V2BoundaryPrecheck({ v1V2BoundaryPrecheckJson });
  const serializedV1V2BoundaryPrecheck = JSON.stringify(v1V2BoundaryPrecheckJson);
  goLiveAssertions.assertSerializedV1V2BoundaryPrecheck({ serializedV1V2BoundaryPrecheck });

  const clientV1V2BoundaryPrecheckResult = await precheckOfficeV1V2Boundary(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientV1V2BoundaryPrecheck({ clientV1V2BoundaryPrecheckResult });

  const v1V2ScopeBriefRefreshResponse = await fetch(`${baseUrl}/api/system/v1-v2-scope-brief/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      v2Differences: ["SHOULD_BE_IGNORED"],
      token: "SUPER_SECRET_SCOPE_TOKEN",
      outputDir: "/Users/fake/v1-v2",
    }),
  });
  assert.equal(v1V2ScopeBriefRefreshResponse.status, 200, "/api/system/v1-v2-scope-brief/refresh should return 200 for management");
  const v1V2ScopeBriefRefreshJson = await v1V2ScopeBriefRefreshResponse.json();
  goLiveAssertions.assertV1V2ScopeBriefRefresh({ v1V2ScopeBriefRefreshJson });
  const serializedV1V2ScopeBriefRefresh = JSON.stringify(v1V2ScopeBriefRefreshJson);
  assert.doesNotMatch(serializedV1V2ScopeBriefRefresh, /\.erp-local-storage|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedV1V2ScopeBriefRefresh, /SHOULD_BE_IGNORED|SUPER_SECRET_SCOPE_TOKEN/);

  const clientV1V2ScopeBriefRefreshResult = await refreshOfficeV1V2ScopeBrief(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientV1V2ScopeBriefRefresh({ clientV1V2ScopeBriefRefreshResult });

  const refreshPrecheckResponse = await fetch(`${baseUrl}/api/system/v1-release-candidate/refresh-precheck`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: "{}",
  });
  assert.equal(refreshPrecheckResponse.status, 200, "/api/system/v1-release-candidate/refresh-precheck should return 200 for management");
  const refreshPrecheckJson = await refreshPrecheckResponse.json();
  goLiveAssertions.assertRefreshPrecheck({ refreshPrecheckJson, json });
  const serializedRefreshPrecheck = JSON.stringify(refreshPrecheckJson);
  goLiveAssertions.assertSerializedRefreshPrecheck({ serializedRefreshPrecheck });

  const clientRefreshPrecheckResult = await precheckOfficeV1ReleaseCandidateRefresh(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientRefreshPrecheck({ clientRefreshPrecheckResult, json });

  const refreshCandidateDeniedResponse = await fetch(`${baseUrl}/api/system/v1-release-candidate/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-WAREHOUSE-A",
    },
    body: JSON.stringify({ token: "SUPER_SECRET_WAREHOUSE_REFRESH_TOKEN" }),
  });
  assert.equal(refreshCandidateDeniedResponse.status, 403, "warehouse should not be allowed to refresh release candidate");

  const refreshCandidateResponse = await fetch(`${baseUrl}/api/system/v1-release-candidate/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-MANAGER-A",
    },
    body: JSON.stringify({
      envFilePath: "/Users/should-not-be-read/.env",
      bearerToken: "SUPER_SECRET_RELEASE_REFRESH_TOKEN",
      commandArgs: ["--env-file", "/private/secret.env"],
    }),
  });
  assert.equal(refreshCandidateResponse.status, 409, "release candidate refresh should be blocked before precheck is ready");
  const refreshCandidateJson = await refreshCandidateResponse.json();
  goLiveAssertions.assertRefreshCandidate({ refreshCandidateJson, json });
  const serializedRefreshCandidate = JSON.stringify(refreshCandidateJson);
  assert.doesNotMatch(serializedRefreshCandidate, /\.erp-local-storage|filled-manifest|\/Users\/|\/private\//);
  assert.doesNotMatch(serializedRefreshCandidate, /SUPER_SECRET|SECRET_VALUE|pass@prod-db/i);

  const clientRefreshCandidateResult = await refreshOfficeV1ReleaseCandidate(
    { operatorId: "U-MANAGER-A" },
    { apiBaseUrl: `${baseUrl}/api` },
  );
  goLiveAssertions.assertClientRefreshCandidate({ clientRefreshCandidateResult });

  const refreshedResponse = await fetch(`${baseUrl}/api/system/v1-go-live-status`, {
    headers: {
      "x-erp-user-id": "U-MANAGER-A",
    },
  });
  assert.equal(refreshedResponse.status, 200, "V1 go-live status should refresh after draft generation");
  const refreshedJson = await refreshedResponse.json();
  goLiveAssertions.assertRefreshed({ refreshedJson });

  const clientStatus = normalizeV1GoLiveStatusForClient(json);
  assertClientGoLiveStatus({
    clientStatus,
    json,
    expectedBlockingTargetCount,
    expectedIntakeRowCount,
    expectedWarningTargetCount,
    initialDraftManifestAvailable,
    initialDraftFreshnessReady,
    initialDraftFreshnessLabel,
  });

  console.log("V1 go-live status API check passed: backend artifacts, redaction, and frontend normalization are covered.");
} finally {
  restoreProductionEnvFileAuditEnv();
  restoreProductionEnvValuesFileEnv();
  await closeServer(server, { forceAfterMs: 1_000 });
  restoreEnvValue("ERP_V1_GO_LIVE_ARTIFACT_ROOT", originalV1GoLiveArtifactRoot);
  restoreEnvValue("ERP_V1_D49_EMPLOYEE_INTAKE_PRECHECK_REPORT_PATH", originalD49EmployeeIntakePrecheckReportPath);
  restoreEnvValue("ERP_V1_D49_EMPLOYEE_INTAKE_WORKBOOK_PATH", originalD49EmployeeIntakeWorkbookPath);
  rmSync(fixtureArtifactRoot, { recursive: true, force: true });
}

function clearProductionEnvFileAuditEnv() {
  delete process.env.ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS;
  delete process.env.ERP_V1_PRODUCTION_ENV_FILE;
  delete process.env.ERP_V1_ENV_FILE;
}

function clearProductionEnvValuesFileEnv() {
  delete process.env.ERP_V1_PRODUCTION_ENV_VALUES_FILE;
  delete process.env.ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE;
  delete process.env.ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE;
  delete process.env.ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED;
}

function restoreProductionEnvFileAuditEnv() {
  restoreEnvValue("ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS", originalProductionEnvFileAuditPaths);
  restoreEnvValue("ERP_V1_PRODUCTION_ENV_FILE", originalProductionEnvFile);
  restoreEnvValue("ERP_V1_ENV_FILE", originalV1EnvFile);
}

function restoreProductionEnvValuesFileEnv() {
  restoreEnvValue("ERP_V1_PRODUCTION_ENV_VALUES_FILE", originalProductionEnvValuesFile);
  restoreEnvValue("ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE", originalProductionEnvMinimumValuesFile);
  restoreEnvValue("ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE", originalProductionEnvValuesFragmentFile);
  restoreEnvValue("ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED", originalProductionEnvValuesApplyEnabled);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function restoreEnvValue(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
