import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function prepareV1GoLiveStatusFixture(
  artifactRoot,
  {
    apiBaseUrl,
    d49EmployeeIntakePrecheckReportPath,
    d49EmployeeIntakeWorkbookPath,
    d49EmployeeIntakeWorkbookBytes,
    d49EmployeeIntakeCheckedAt,
  },
) {
  if (!artifactRoot) throw new TypeError("prepareV1GoLiveStatusFixture requires artifactRoot");
  if (!apiBaseUrl) throw new TypeError("prepareV1GoLiveStatusFixture requires apiBaseUrl");
  if (!d49EmployeeIntakePrecheckReportPath) {
    throw new TypeError("prepareV1GoLiveStatusFixture requires d49EmployeeIntakePrecheckReportPath");
  }
  if (!d49EmployeeIntakeWorkbookPath) {
    throw new TypeError("prepareV1GoLiveStatusFixture requires d49EmployeeIntakeWorkbookPath");
  }
  if (!d49EmployeeIntakeWorkbookBytes) {
    throw new TypeError("prepareV1GoLiveStatusFixture requires d49EmployeeIntakeWorkbookBytes");
  }
  if (!d49EmployeeIntakeCheckedAt) {
    throw new TypeError("prepareV1GoLiveStatusFixture requires d49EmployeeIntakeCheckedAt");
  }

  rmSync(artifactRoot, { recursive: true, force: true });
  mkdirSync(artifactRoot, { recursive: true });
  writeFileSync(d49EmployeeIntakeWorkbookPath, d49EmployeeIntakeWorkbookBytes);
  writeFileSync(
    d49EmployeeIntakePrecheckReportPath,
    `${JSON.stringify(
      buildD49EmployeeIntakePrecheckFixture({
        workbookBytes: d49EmployeeIntakeWorkbookBytes,
        checkedAt: d49EmployeeIntakeCheckedAt,
      }),
      null,
      2,
    )}\n`,
    "utf8",
  );

  const blockedEnvPath = join(artifactRoot, "blocked-production.env");
  const setupJsonPath = join(artifactRoot, "production-env-setup.json");
  const suiteOutputRoot = join(artifactRoot, "v1-go-live-suite");
  const intakeCsvPath = join(artifactRoot, "v1-go-live-handoff", "production-env-real-value-intake.csv");
  const todoLoadPath = join(artifactRoot, "v1-todo-load-precheck", "latest.json");

  writeFileSync(blockedEnvPath, "# Intentionally incomplete production fixture.\n", "utf8");
  chmodSync(blockedEnvPath, 0o600);

  await runFixtureCommand(
    "V1 go-live suite",
    [
      "scripts/run-v1-go-live-suite.mjs",
      "--output-root",
      suiteOutputRoot,
      "--refresh-release-candidate",
      "--sync-canonical-latest",
      "--canonical-root",
      artifactRoot,
      "--env-file",
      blockedEnvPath,
      "--api-base-url",
      apiBaseUrl,
      "--json",
    ],
    [0],
    { ERP_V1_GO_LIVE_SUITE_IGNORE_DEFAULT_ARTIFACTS: "true" },
  );

  await runFixtureCommand(
    "production env intake",
    [
      "scripts/run-v1-production-env-intake-verify.mjs",
      "--env-file",
      blockedEnvPath,
      "--intake-csv",
      intakeCsvPath,
      "--output-dir",
      join(artifactRoot, "v1-production-env-intake-verify"),
      "--json",
    ],
    [2],
  );
  await runFixtureCommand(
    "production persistence evidence",
    [
      "scripts/run-v1-production-persistence-evidence.mjs",
      "--env-file",
      blockedEnvPath,
      "--output-dir",
      join(artifactRoot, "v1-production-persistence-evidence"),
      "--json",
    ],
    [2],
  );

  writeFileSync(
    setupJsonPath,
    `${JSON.stringify(
      {
        scope: "v1_production_env_setup",
        status: "prepared",
        setupReady: true,
        checkedAt: new Date(Date.now() + 60_000).toISOString(),
        envFile: {
          path: blockedEnvPath,
          gitIgnored: true,
          gitTracked: false,
          fileMode: "600",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await runFixtureCommand(
    "production first-stage execution",
    [
      "scripts/run-v1-production-first-stage-execution.mjs",
      "--use-production-env-setup-env-file",
      "--production-env-setup-json",
      setupJsonPath,
      "--production-env-intake-csv",
      intakeCsvPath,
      "--output-dir",
      join(artifactRoot, "v1-production-first-stage-execution"),
      "--json",
    ],
    [2],
  );
  mkdirSync(join(artifactRoot, "v1-todo-load-precheck"), { recursive: true });
  writeFileSync(
    todoLoadPath,
    `${JSON.stringify(
      {
        scope: "v1_todo_load_precheck",
        status: "ready",
        ready: true,
        checkedAt: new Date().toISOString(),
        target: {
          protocol: "https",
          loopback: false,
          apiPathValidated: true,
          embeddedCredentials: false,
          addressExposed: false,
          rawAddress: "https://erp.internal.example/api",
        },
        config: { maxP95Ms: 1000, maxErrorRate: 0 },
        authentication: {
          formalRuntimeSession: true,
          serverVerified: true,
          sessionType: "runtime",
          identityExposed: false,
          operatorIdentity: "SECRET-TODO-IDENTITY",
        },
        summary: {
          label: "5/5 通过",
          requestCount: 100,
          successCount: 100,
          errorCount: 0,
          errorRate: 0,
          throughputPerSecond: 125,
          latencyMs: { p50: 120, p95: 240, max: 320 },
          snapshotChanged: false,
        },
        blockingStages: [],
        warnings: [],
        safeguards: {
          explicitReadLoadConfirmation: true,
          businessReadOnly: true,
          businessDataMutated: false,
          requestCountBounded: true,
          concurrencyBounded: true,
          responsePayloadStored: false,
          todoIdentityStored: false,
          credentialsExposed: false,
          apiAddressExposed: false,
          physicalPrinterCalled: false,
        },
        responsePayload: "SECRET-TODO-PAYLOAD",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { blockedEnvPath, setupJsonPath, suiteOutputRoot, intakeCsvPath, todoLoadPath };
}

function runFixtureCommand(label, args, expectedStatuses, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status) => {
      if (expectedStatuses.includes(status)) {
        resolve();
        return;
      }
      reject(new Error(`${label} fixture failed with exit ${status}: ${stderr || stdout}`));
    });
  });
}

function buildD49EmployeeIntakePrecheckFixture({ workbookBytes, checkedAt }) {
  const rowCounts = {
    office: 3,
    warehouse: 2,
    finance: 0,
    workshop: 9,
    packing: 3,
    driver: 1,
    management: 0,
    technical_operations: 1,
  };
  return {
    scope: "v1_d49_employee_workbook_precheck",
    version: "v1-d49-employee-workbook-precheck-v2",
    status: "blocked",
    ready: false,
    uploadAllowed: false,
    checkedAt,
    summary: {
      employeeRowCount: 19,
      coveredRoleCount: 6,
      requiredRoleCount: 8,
      coverageLabel: "6/8",
      errorCount: 19,
      warningCount: 0,
    },
    roleCoverage: {
      roles: Object.entries(rowCounts).map(([roleKey, rowCount]) => ({
        roleKey,
        covered: rowCount > 0,
        rowCount,
      })),
    },
    payrollAttendanceReadiness: {
      required: true,
      ready: false,
      complete: false,
      employeeCount: 19,
      completeCount: 0,
      incompleteCount: 19,
      profileReadyCount: 0,
      wageReadyCount: 0,
      attendanceMappingReadyCount: 0,
      coverageLabel: "0/19",
    },
    sourceEvidence: {
      version: "v1-d49-workbook-source-evidence-v1",
      digestAlgorithm: "sha256",
      workbookDigest: createHash("sha256").update(workbookBytes).digest("hex"),
      workbookByteLength: workbookBytes.length,
    },
    issues: Array.from({ length: 19 }, (_, index) => ({
      severity: "error",
      row: index + 3,
      field: "员工编号",
      message: "员工编号 不能为空。",
    })),
    safeguards: {
      readOnly: true,
      formalDataWritten: false,
      employeeNamesIncluded: false,
      employeeNumbersIncluded: false,
      workbookPathIncluded: false,
      stagedRowsIncluded: false,
      passwordsIncluded: false,
      seedAccountsCountedAsReady: false,
      uploadStillRequiresServerPrecheck: true,
      workbookDigestIncluded: true,
    },
  };
}
