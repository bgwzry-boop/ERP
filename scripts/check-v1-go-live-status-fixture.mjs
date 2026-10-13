import assert from "node:assert/strict";
import { readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import { closeTestServer, getTestServerBaseUrl, listenTestServer } from "./helpers/apiIntegrationTestHarness.mjs";
import { prepareV1GoLiveStatusFixture } from "./helpers/v1GoLiveStatusFixture.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";

const artifactRoot = join(process.cwd(), ".erp-local-storage", "checks", "v1-go-live-status-fixture");
const reportPath = join(artifactRoot, "d49-employee-intake-precheck.json");
const workbookPath = join(artifactRoot, "d49-employee-intake-workbook.xlsx");
const workbookBytes = Buffer.from("D49 controlled workbook fixture", "utf8");
const originalArtifactRoot = process.env.ERP_V1_GO_LIVE_ARTIFACT_ROOT;
const originalReportPath = process.env.ERP_V1_D49_EMPLOYEE_INTAKE_PRECHECK_REPORT_PATH;
const originalWorkbookPath = process.env.ERP_V1_D49_EMPLOYEE_INTAKE_WORKBOOK_PATH;
let server = null;

try {
  process.env.ERP_V1_GO_LIVE_ARTIFACT_ROOT = artifactRoot;
  process.env.ERP_V1_D49_EMPLOYEE_INTAKE_PRECHECK_REPORT_PATH = reportPath;
  process.env.ERP_V1_D49_EMPLOYEE_INTAKE_WORKBOOK_PATH = workbookPath;
  server = createApiServer(withLocalRepositoryFixture({ allowLocalFixture: true }));
  await listenTestServer(server);
  const fixture = await prepareV1GoLiveStatusFixture(artifactRoot, {
    apiBaseUrl: `${getTestServerBaseUrl(server)}/api`,
    d49EmployeeIntakePrecheckReportPath: reportPath,
    d49EmployeeIntakeWorkbookPath: workbookPath,
    d49EmployeeIntakeWorkbookBytes: workbookBytes,
    d49EmployeeIntakeCheckedAt: "2026-07-16T10:00:00.000Z",
  });
  const d49Report = JSON.parse(readFileSync(reportPath, "utf8"));
  const suite = JSON.parse(readFileSync(join(fixture.suiteOutputRoot, "latest.json"), "utf8"));
  const intake = JSON.parse(readFileSync(join(artifactRoot, "v1-production-env-intake-verify", "latest.json"), "utf8"));
  const persistence = JSON.parse(readFileSync(join(artifactRoot, "v1-production-persistence-evidence", "latest.json"), "utf8"));
  const firstStage = JSON.parse(readFileSync(join(artifactRoot, "v1-production-first-stage-execution", "latest.json"), "utf8"));
  const todoLoad = JSON.parse(readFileSync(fixture.todoLoadPath, "utf8"));

  assert.equal(statSync(fixture.blockedEnvPath).mode & 0o777, 0o600);
  assert.equal(d49Report.status, "blocked");
  assert.equal(d49Report.summary.coverageLabel, "6/8");
  assert.equal(d49Report.safeguards.formalDataWritten, false);
  assert.equal(suite.ready, false);
  assert.equal(suite.summary.releaseCandidate, "0/4 发布门禁通过");
  assert.equal(suite.safeguards.nonMutating, true);
  assert.equal(intake.ready, false);
  assert.equal(persistence.ready, false);
  assert.equal(firstStage.ready, false);
  assert.equal(todoLoad.ready, true);
  assert.equal(todoLoad.safeguards.businessDataMutated, false);
  assert.equal(todoLoad.safeguards.physicalPrinterCalled, false);
  console.log("V1 go-live status fixture check passed: blocked artifacts, file mode, and non-mutating safeguards are stable.");
} finally {
  await closeTestServer(server);
  rmSync(artifactRoot, { recursive: true, force: true });
  restoreEnvValue("ERP_V1_GO_LIVE_ARTIFACT_ROOT", originalArtifactRoot);
  restoreEnvValue("ERP_V1_D49_EMPLOYEE_INTAKE_PRECHECK_REPORT_PATH", originalReportPath);
  restoreEnvValue("ERP_V1_D49_EMPLOYEE_INTAKE_WORKBOOK_PATH", originalWorkbookPath);
}

function restoreEnvValue(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
