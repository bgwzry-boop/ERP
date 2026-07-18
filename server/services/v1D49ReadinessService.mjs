import { buildProductionEnvPreflight } from "../../scripts/run-v1-production-env-preflight.mjs";
import { buildProductionEnvFileAuditReport } from "../../scripts/run-v1-production-env-file-audit.mjs";
import { buildProductionEnvIntakeVerifyReport } from "../../scripts/run-v1-production-env-intake-verify.mjs";
import { buildRuntimeEmployeeAccountReadiness } from "./runtimeEmployeeAccountReadiness.mjs";
import { buildV1ProductionEnvPreviewEnvironment } from "./v1ProductionEnvFilePreviewService.mjs";
import {
  resolveV1ProductionEnvSetupSafeEnvFileForIntakeLivePrecheck,
  V1_PRODUCTION_ENV_INTAKE_CSV_PATH,
} from "./v1ProductionEnvIntakePrecheckService.mjs";
import { sanitizeV1ProductionEnvIntakeVerification } from "./v1ProductionStatusProjectionService.mjs";
import { sanitizeV1SensitiveStatusText } from "./v1StatusTextSanitizer.mjs";
import { buildV1D49EmployeeIntakeStatus } from "./v1D49EmployeeIntakeStatusService.mjs";

export function buildV1D49Readiness({
  workspace = {},
  operatorId = "",
  now = () => new Date(),
  buildEmployeeReadiness = buildRuntimeEmployeeAccountReadiness,
  buildEmployeeIntakeStatus = buildV1D49EmployeeIntakeStatus,
  resolveSetup = resolveV1ProductionEnvSetupSafeEnvFileForIntakeLivePrecheck,
  buildEnvFileAudit = buildProductionEnvFileAuditReport,
  buildPreviewEnvironment = buildV1ProductionEnvPreviewEnvironment,
  buildEnvPreflight = buildProductionEnvPreflight,
  buildEnvIntakeVerification = buildProductionEnvIntakeVerifyReport,
  intakeCsv = V1_PRODUCTION_ENV_INTAKE_CSV_PATH,
} = {}) {
  const checkedAt = now().toISOString();
  const employees = sanitizeEmployeeReadiness(
    buildEmployeeReadiness({ users: workspace.users, machines: workspace.machines, nowMs: Date.parse(checkedAt) }),
  );
  const employeeIntake = sanitizeEmployeeIntakeStatus(
    buildEmployeeIntakeStatus({ now: () => new Date(checkedAt) }),
  );
  const setup = resolveSetup();
  const environment = buildEnvironmentReadiness({
    checkedAt,
    setup,
    buildEnvFileAudit,
    buildPreviewEnvironment,
    buildEnvPreflight,
    buildEnvIntakeVerification,
    intakeCsv,
  });
  const employeeBlockers = employees.roles
    .filter((role) => role.ready !== true)
    .map((role) => blocker({
      key: `formal-role-${role.roleKey}`,
      category: "employee",
      label: `${role.roleLabel}正式账号未就绪`,
      detail: role.accountCount > 0
        ? `${role.accountCount} 个正式账号中可用 ${role.readyAccountCount} 个。`
        : "未导入该岗位的正式账号。",
      nextAction: role.blockers.length
        ? `处理：${role.blockers.map((item) => item.label).join("、")}。`
        : "导入该岗位正式员工，完成账号启用、首次改密和有效期复核。",
    }));
  const blockers = [...employeeBlockers, ...environment.blockers];
  const ready = employees.ready === true && environment.ready === true && blockers.length === 0;
  return {
    version: "p0-v1-d49-readiness-v3",
    scope: "v1_d49_readiness",
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt,
    operatorId,
    summary: {
      label: ready ? "D49 真实员工和 production env 已就绪" : "D49 真实员工和 production env 仍有阻塞",
      employeeRoleLabel: `${employees.coveredRoleCount}/${employees.requiredRoleCount}`,
      coveredRoleCount: employees.coveredRoleCount,
      requiredRoleCount: employees.requiredRoleCount,
      missingRoleCount: employees.missingRoleCount,
      formalAccountCount: employees.formalAccountCount,
      readyFormalAccountCount: employees.readyFormalAccountCount,
      employeeIntakeAvailable: employeeIntake.available,
      employeeIntakeFresh: employeeIntake.fresh,
      employeeIntakeStatusLabel: employeeIntake.summary.label,
      employeeIntakeRowCount: employeeIntake.summary.employeeRowCount,
      employeeIntakeCoverageLabel: employeeIntake.summary.coverageLabel,
      employeeNumberMissingCount: employeeIntake.summary.missingEmployeeNumberCount,
      envSetupReady: environment.setupReady,
      envAuditReady: environment.auditReady,
      envPreflightLabel: environment.preflightLabel,
      envPreflightPassedCount: environment.preflightPassedCount,
      envPreflightTotalCount: environment.preflightTotalCount,
      envIntakeReady: environment.intakeReady,
      envIntakeConfiguredLabel: environment.intakeConfiguredLabel,
      blockerCount: blockers.length,
      blockerLabel: `${blockers.length} 项`,
      currentRuntimeMode: cleanKey(workspace.runtimeConfig?.mode) || "unknown",
      blocksRegardlessOfDemoMode: true,
    },
    employees,
    employeeIntake,
    environment: {
      status: environment.status,
      ready: environment.ready,
      setupReady: environment.setupReady,
      auditReady: environment.auditReady,
      preflightReady: environment.preflightReady,
      preflightLabel: environment.preflightLabel,
      preflightPassedCount: environment.preflightPassedCount,
      preflightTotalCount: environment.preflightTotalCount,
      preflightBlockingCount: environment.preflightBlockingCount,
      preflightWarningCount: environment.preflightWarningCount,
      intakeReady: environment.intakeReady,
      intakeConfiguredLabel: environment.intakeConfiguredLabel,
      intakeBlockingCount: environment.intakeBlockingCount,
      intakeWarningCount: environment.intakeWarningCount,
    },
    blockers,
    nextAction: buildD49NextAction({ ready, employees, employeeIntake, blockers }),
    safeguards: {
      nonMutating: true,
      demoModeDoesNotBypassEmployeeReadiness: true,
      seedAccountsCountedAsFormal: false,
      rawEmployeeIdentifiersIncluded: false,
      employeeIntakeNamesIncluded: false,
      employeeIntakeNumbersIncluded: false,
      employeeIntakeWorkbookPathIncluded: false,
      employeeIntakeIssueRowsIncluded: false,
      employeeIntakeRawIssuesIncluded: false,
      employeeIntakeWorkbookDigestIncluded: false,
      loginNamesIncluded: false,
      passwordDataIncluded: false,
      envFilePathIncluded: false,
      envValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageEndpointIncluded: false,
      objectStorageBucketIncluded: false,
      secretFieldsIncluded: false,
      commandValuesIncluded: false,
      rawIntakeCsvIncluded: false,
      productionEnvFileMutated: false,
      runtimeEnvironmentMutated: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
  };
}

function buildD49NextAction({ ready, employees, employeeIntake, blockers }) {
  if (ready) return "D49 已就绪；继续D50真实PostgreSQL、恢复库、对象存储和长驻API。";
  if (employees.ready !== true && employeeIntake.available) return employeeIntake.nextAction;
  return blockers[0]?.nextAction || "导入真实员工并补齐production env后重新刷新上线状态。";
}

function sanitizeEmployeeIntakeStatus(value = {}) {
  const safeBoundary = value.safeguards?.reportRedactionVerified === true
    && value.safeguards?.employeeNamesIncluded === false
    && value.safeguards?.employeeNumbersIncluded === false
    && value.safeguards?.workbookPathIncluded === false
    && value.safeguards?.issueRowsIncluded === false
    && value.safeguards?.rawIssuesIncluded === false
    && value.safeguards?.workbookDigestIncluded === false;
  const available = value.available === true && safeBoundary;
  const fresh = available && value.fresh === true;
  const summary = value?.summary && typeof value.summary === "object" ? value.summary : {};
  const freshness = value?.freshness && typeof value.freshness === "object" ? value.freshness : {};
  const roles = available && Array.isArray(value.roles)
    ? value.roles.map((role) => ({
        roleKey: cleanKey(role.roleKey),
        roleLabel: sanitizeText(role.roleLabel),
        covered: role.covered === true,
        rowCount: nonNegativeInteger(role.rowCount),
      })).filter((role) => role.roleKey)
    : [];
  return {
    version: cleanKey(value.version),
    scope: cleanKey(value.scope),
    available,
    fresh,
    status: available ? cleanKey(value.status) || "unavailable" : "unavailable",
    ready: fresh && value.ready === true,
    uploadAllowed: fresh && value.uploadAllowed === true,
    checkedAt: sanitizeText(value.checkedAt),
    freshness: {
      fresh,
      status: available ? cleanKey(freshness.status) || "unavailable" : "unavailable",
      label: available ? sanitizeText(freshness.label) || "未验证" : "未验证",
      checkedAtValid: freshness.checkedAtValid === true,
      withinMaxAge: freshness.withinMaxAge === true,
      sourceMatched: freshness.sourceMatched === true,
      maxAgeHours: nonNegativeInteger(freshness.maxAgeHours, 72),
      ageHours: Number.isFinite(Number(freshness.ageHours))
        ? nonNegativeInteger(freshness.ageHours)
        : null,
    },
    summary: {
      label: available ? sanitizeText(summary.label) : "受控员工草稿预检结果不可用",
      employeeRowCount: available ? nonNegativeInteger(summary.employeeRowCount) : 0,
      coveredRoleCount: available ? nonNegativeInteger(summary.coveredRoleCount) : 0,
      requiredRoleCount: nonNegativeInteger(summary.requiredRoleCount, 8),
      missingRoleCount: available ? nonNegativeInteger(summary.missingRoleCount) : 8,
      coverageLabel: available ? sanitizeText(summary.coverageLabel) || "0/8" : "0/8",
      errorCount: available ? nonNegativeInteger(summary.errorCount) : 0,
      warningCount: available ? nonNegativeInteger(summary.warningCount) : 0,
      issueCount: available ? nonNegativeInteger(summary.issueCount) : 0,
      missingEmployeeNumberCount: available ? nonNegativeInteger(summary.missingEmployeeNumberCount) : 0,
      blockerCount: available ? nonNegativeInteger(summary.blockerCount) : 0,
      blockerLabel: available ? sanitizeText(summary.blockerLabel) || "未读取" : "未读取",
      freshnessLabel: available ? sanitizeText(summary.freshnessLabel) || "未验证" : "未验证",
    },
    roles,
    missingRoleLabels: available && Array.isArray(value.missingRoleLabels)
      ? value.missingRoleLabels.map(sanitizeText).filter(Boolean)
      : [],
    nextAction: available
      ? sanitizeText(value.nextAction)
      : "重新运行D49专用员工工作簿离线预检查；报告通过脱敏边界校验后才会显示聚合结果。",
    safeguards: {
      readOnly: value.safeguards?.readOnly === true,
      reportRedactionVerified: safeBoundary,
      formalDataWritten: false,
      employeeNamesIncluded: false,
      employeeNumbersIncluded: false,
      workbookPathIncluded: false,
      issueRowsIncluded: false,
      rawIssuesIncluded: false,
      stagedRowsIncluded: false,
      passwordsIncluded: false,
      seedAccountsCountedAsReady: false,
      uploadStillRequiresServerPrecheck: true,
      sourceEvidenceVerified: value.safeguards?.sourceEvidenceVerified === true,
      workbookDigestIncluded: false,
    },
  };
}

function buildEnvironmentReadiness({
  checkedAt,
  setup,
  buildEnvFileAudit,
  buildPreviewEnvironment,
  buildEnvPreflight,
  buildEnvIntakeVerification,
  intakeCsv,
}) {
  const setupBlockers = Array.isArray(setup?.blockingItems)
    ? setup.blockingItems.map((item) => sanitizeExternalBlocker(item, "setup")).filter(Boolean)
    : [];
  if (setup?.ready !== true || !Array.isArray(setup.envFiles) || setup.envFiles.length !== 1) {
    return {
      status: cleanKey(setup?.status) || "not_configured",
      ready: false,
      setupReady: false,
      auditReady: false,
      preflightReady: false,
      preflightLabel: "0/11",
      preflightPassedCount: 0,
      preflightTotalCount: 11,
      preflightBlockingCount: 1,
      preflightWarningCount: 0,
      intakeReady: false,
      intakeConfiguredLabel: "0/0",
      intakeBlockingCount: setupBlockers.length || 1,
      intakeWarningCount: 0,
      blockers: setupBlockers.length ? setupBlockers : [blocker({
        key: "production-env-setup-not-ready",
        category: "environment",
        label: "production env setup 未就绪",
        detail: "无法安全定位唯一、未跟踪且权限600的production env文件。",
        nextAction: "先运行production env setup，再刷新D49就绪状态。",
      })],
    };
  }

  try {
    const envFiles = setup.envFiles;
    const audit = buildEnvFileAudit({ envFiles });
    const preflight = audit.ready === true
      ? buildEnvPreflight({ env: buildPreviewEnvironment(envFiles), envFiles })
      : buildEnvPreflight({ env: {}, envFiles: [] });
    const intakeReport = buildEnvIntakeVerification({ envFiles, intakeCsv });
    const intake = sanitizeV1ProductionEnvIntakeVerification(intakeReport);
    const preflightChecks = Array.isArray(preflight.checks) ? preflight.checks : [];
    const passedCount = nonNegativeInteger(preflight.summary?.passedCount);
    const totalCount = nonNegativeInteger(preflight.summary?.totalCount, preflightChecks.length || 11);
    const preflightBlockers = preflightChecks
      .filter((item) => item?.ready !== true && item?.severity !== "warning")
      .map((item) => sanitizeExternalBlocker(item, "env-preflight"))
      .filter(Boolean);
    const auditBlockers = Array.isArray(audit.blockingFindings)
      ? audit.blockingFindings.map((item) => sanitizeExternalBlocker(item, "env-audit")).filter(Boolean)
      : [];
    const intakeBlockers = Array.isArray(intake.blockingFindings)
      ? intake.blockingFindings.map((item) => sanitizeExternalBlocker(item, "env-intake")).filter(Boolean)
      : [];
    const blockers = [...auditBlockers, ...preflightBlockers, ...intakeBlockers];
    const ready = audit.ready === true && preflight.ready === true && intake.ready === true && blockers.length === 0;
    return {
      status: ready ? "ready" : "blocked",
      ready,
      setupReady: true,
      auditReady: audit.ready === true,
      preflightReady: preflight.ready === true,
      preflightLabel: `${passedCount}/${totalCount}`,
      preflightPassedCount: passedCount,
      preflightTotalCount: totalCount,
      preflightBlockingCount: nonNegativeInteger(preflight.summary?.blockingCount, preflightBlockers.length),
      preflightWarningCount: nonNegativeInteger(preflight.summary?.warningCount),
      intakeReady: intake.ready === true,
      intakeConfiguredLabel: sanitizeText(intake.summary?.configuredLabel) || "0/0",
      intakeBlockingCount: nonNegativeInteger(intake.summary?.blockingCount, intakeBlockers.length),
      intakeWarningCount: nonNegativeInteger(intake.summary?.warningCount),
      blockers,
    };
  } catch {
    return {
      status: "error",
      ready: false,
      setupReady: true,
      auditReady: false,
      preflightReady: false,
      preflightLabel: "0/11",
      preflightPassedCount: 0,
      preflightTotalCount: 11,
      preflightBlockingCount: 1,
      preflightWarningCount: 0,
      intakeReady: false,
      intakeConfiguredLabel: "0/0",
      intakeBlockingCount: 1,
      intakeWarningCount: 0,
      blockers: [blocker({
        key: "d49-production-env-precheck-failed",
        category: "environment",
        label: "D49 production env 预检失败",
        detail: `服务端执行env审计、内存预检或intake校验失败（${checkedAt}）。`,
        nextAction: "由技术/管理检查production env setup、安全env文件和intake清单后重试。",
      })],
    };
  }
}

function sanitizeEmployeeReadiness(value = {}) {
  const roles = Array.isArray(value.roles)
    ? value.roles.map((role) => ({
        roleKey: cleanKey(role.roleKey),
        roleLabel: sanitizeText(role.roleLabel),
        ready: role.ready === true,
        accountCount: nonNegativeInteger(role.accountCount),
        readyAccountCount: nonNegativeInteger(role.readyAccountCount),
        blockers: Array.isArray(role.blockers)
          ? role.blockers.map((item) => ({
              code: cleanKey(item.code),
              label: sanitizeText(item.label),
              count: nonNegativeInteger(item.count),
            }))
          : [],
      }))
    : [];
  return {
    ready: value.ready === true,
    requiredRoleCount: nonNegativeInteger(value.requiredRoleCount, roles.length || 8),
    coveredRoleCount: nonNegativeInteger(value.coveredRoleCount),
    missingRoleCount: nonNegativeInteger(value.missingRoleCount, roles.filter((role) => !role.ready).length),
    formalAccountCount: nonNegativeInteger(value.formalAccountCount),
    readyFormalAccountCount: nonNegativeInteger(value.readyFormalAccountCount),
    roles,
  };
}

function sanitizeExternalBlocker(value = {}, category) {
  if (!value || typeof value !== "object") return null;
  const label = sanitizeText(value.label);
  if (!label) return null;
  return blocker({
    key: cleanKey(value.key) || `${category}-blocked`,
    category,
    label,
    detail: sanitizeText(value.detail || value.message),
    nextAction: sanitizeText(value.nextAction),
  });
}

function blocker({ key, category, label, detail, nextAction }) {
  return {
    key: cleanKey(key),
    category: cleanKey(category),
    label: sanitizeText(label),
    status: "blocked",
    blocking: true,
    detail: sanitizeText(detail),
    nextAction: sanitizeText(nextAction),
  };
}

function sanitizeText(value) {
  return sanitizeV1SensitiveStatusText(value);
}

function cleanKey(value) {
  return String(value ?? "").trim().replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 120);
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) return Math.trunc(parsed);
  const fallbackParsed = Number(fallback);
  return Number.isFinite(fallbackParsed) && fallbackParsed >= 0 ? Math.trunc(fallbackParsed) : 0;
}
