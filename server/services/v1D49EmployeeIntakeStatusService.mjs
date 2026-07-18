import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { roleCatalog } from "../../shared/auth/roleCatalog.js";
import { requiredV1RuntimeEmployeeRoles } from "./runtimeEmployeeAccountReadiness.mjs";

const EXPECTED_SCOPE = "v1_d49_employee_workbook_precheck";
const EXPECTED_VERSION = "v1-d49-employee-workbook-precheck-v2";
const DEFAULT_REPORT_PATH = join(
  ".erp-local-storage",
  "v1-d49-employee-intake",
  "final-precheck",
  "latest.json",
);
const DEFAULT_WORKBOOK_PATH = join(
  ".erp-local-storage",
  "v1-d49-employee-intake",
  "d49-formal-employee-machine-import-draft.xlsx",
);
const MAX_REPORT_BYTES = 512 * 1024;
const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024;
const MAX_REPORT_AGE_MS = 72 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export function buildV1D49EmployeeIntakeStatus({
  now = () => new Date(),
  loadReport = loadLatestControlledPrecheckReport,
  loadWorkbookEvidence = loadControlledWorkbookEvidence,
} = {}) {
  const currentTime = safeDate(now());
  const fallbackCheckedAt = currentTime.toISOString();
  try {
    const report = loadReport();
    if (!isExpectedReport(report) || !hasSafeReportBoundary(report.safeguards)) {
      return unavailableStatus(fallbackCheckedAt);
    }
    const freshness = buildFreshness({
      report,
      workbookEvidence: loadWorkbookEvidence(),
      nowMs: currentTime.getTime(),
    });

    const reportRoles = new Map(
      (Array.isArray(report.roleCoverage?.roles) ? report.roleCoverage.roles : [])
        .filter((role) => requiredV1RuntimeEmployeeRoles.includes(cleanKey(role?.roleKey)))
        .map((role) => [cleanKey(role.roleKey), role]),
    );
    const roles = requiredV1RuntimeEmployeeRoles.map((roleKey) => {
      const reportRole = reportRoles.get(roleKey) ?? {};
      const rowCount = nonNegativeInteger(reportRole.rowCount);
      return {
        roleKey,
        roleLabel: roleCatalog[roleKey]?.displayName ?? roleKey,
        covered: reportRole.covered === true && rowCount > 0,
        rowCount,
      };
    });
    const employeeRowCount = nonNegativeInteger(report.summary?.employeeRowCount);
    const coveredRoleCount = roles.filter((role) => role.covered).length;
    const requiredRoleCount = requiredV1RuntimeEmployeeRoles.length;
    const missingRoles = roles.filter((role) => !role.covered);
    const errorCount = nonNegativeInteger(report.summary?.errorCount);
    const warningCount = nonNegativeInteger(report.summary?.warningCount);
    const missingEmployeeNumberCount = (Array.isArray(report.issues) ? report.issues : [])
      .filter(isMissingEmployeeNumberIssue)
      .length;
    const ready = freshness.fresh
      && report.ready === true
      && report.uploadAllowed === true
      && errorCount === 0
      && missingEmployeeNumberCount === 0
      && coveredRoleCount === requiredRoleCount;
    const status = !freshness.fresh
      ? "stale"
      : ready
      ? "ready_for_upload"
      : missingEmployeeNumberCount > 0
        ? "needs_employee_numbers"
        : missingRoles.length > 0
          ? "needs_role_coverage"
          : "review_required";

    return {
      version: "p0-v1-d49-employee-intake-status-v2",
      scope: "v1_d49_employee_intake_status",
      available: true,
      fresh: freshness.fresh,
      status,
      ready,
      uploadAllowed: ready,
      checkedAt: safeIsoDate(report.checkedAt, fallbackCheckedAt),
      freshness,
      summary: {
        label: buildStatusLabel({ freshness, ready, employeeRowCount, missingEmployeeNumberCount, missingRoles }),
        employeeRowCount,
        coveredRoleCount,
        requiredRoleCount,
        missingRoleCount: missingRoles.length,
        coverageLabel: `${coveredRoleCount}/${requiredRoleCount}`,
        errorCount,
        warningCount,
        issueCount: errorCount + warningCount,
        missingEmployeeNumberCount,
        blockerCount: errorCount,
        blockerLabel: `${errorCount} 项`,
        freshnessLabel: freshness.label,
      },
      roles,
      missingRoleLabels: missingRoles.map((role) => role.roleLabel),
      nextAction: buildNextAction({ freshness, ready, employeeRowCount, missingEmployeeNumberCount, missingRoles }),
      safeguards: safeOutputSafeguards(true, freshness.sourceMatched),
    };
  } catch {
    return unavailableStatus(fallbackCheckedAt);
  }
}

function loadLatestControlledPrecheckReport() {
  const configuredPath = String(process.env.ERP_V1_D49_EMPLOYEE_INTAKE_PRECHECK_REPORT_PATH ?? "").trim();
  const source = readFileSync(configuredPath || DEFAULT_REPORT_PATH, "utf8");
  if (Buffer.byteLength(source, "utf8") > MAX_REPORT_BYTES) {
    throw new Error("D49 controlled precheck report is too large");
  }
  return JSON.parse(source);
}

function loadControlledWorkbookEvidence() {
  const configuredPath = String(process.env.ERP_V1_D49_EMPLOYEE_INTAKE_WORKBOOK_PATH ?? "").trim();
  const workbookPath = configuredPath || DEFAULT_WORKBOOK_PATH;
  const stat = statSync(workbookPath);
  if (!stat.isFile() || stat.size > MAX_WORKBOOK_BYTES) {
    throw new Error("D49 controlled workbook is unavailable or too large");
  }
  const bytes = readFileSync(workbookPath);
  return {
    workbookDigest: createHash("sha256").update(bytes).digest("hex"),
    workbookByteLength: bytes.length,
  };
}

function isExpectedReport(report) {
  return report
    && typeof report === "object"
    && report.scope === EXPECTED_SCOPE
    && report.version === EXPECTED_VERSION
    && report.summary
    && typeof report.summary === "object"
    && report.roleCoverage
    && typeof report.roleCoverage === "object"
    && report.sourceEvidence
    && typeof report.sourceEvidence === "object"
    && report.sourceEvidence.version === "v1-d49-workbook-source-evidence-v1"
    && report.sourceEvidence.digestAlgorithm === "sha256"
    && /^[a-f0-9]{64}$/.test(String(report.sourceEvidence.workbookDigest ?? ""))
    && nonNegativeInteger(report.sourceEvidence.workbookByteLength) > 0;
}

function hasSafeReportBoundary(safeguards = {}) {
  return safeguards.readOnly === true
    && safeguards.formalDataWritten === false
    && safeguards.employeeNamesIncluded === false
    && safeguards.employeeNumbersIncluded === false
    && safeguards.workbookPathIncluded === false
    && safeguards.stagedRowsIncluded === false
    && safeguards.passwordsIncluded === false
    && safeguards.seedAccountsCountedAsReady === false
    && safeguards.uploadStillRequiresServerPrecheck === true
    && safeguards.workbookDigestIncluded === true;
}

function isMissingEmployeeNumberIssue(issue = {}) {
  return issue?.severity === "error"
    && String(issue.field ?? "").trim() === "员工编号"
    && String(issue.message ?? "").includes("不能为空");
}

function buildStatusLabel({ freshness, ready, employeeRowCount, missingEmployeeNumberCount, missingRoles }) {
  if (!freshness.fresh) return `受控草稿上次预检不可作为当前结果：${freshness.label}`;
  if (ready) return `受控草稿 ${employeeRowCount} 人，已通过离线预检查`;
  if (missingEmployeeNumberCount > 0) {
    return `受控草稿 ${employeeRowCount} 人，仍缺 ${missingEmployeeNumberCount} 个员工编号`;
  }
  if (missingRoles.length > 0) return `受控草稿仍缺 ${missingRoles.length} 个正式岗位`;
  return "受控草稿仍需人工复核";
}

function buildNextAction({ freshness, ready, employeeRowCount, missingEmployeeNumberCount, missingRoles }) {
  if (!freshness.fresh) {
    return "受控员工工作簿或预检时效已变化；重新运行D49专用离线预检查，确认新报告与当前工作簿一致后再继续。";
  }
  if (ready) return "离线预检查已通过；由有权限的管理人员打开员工导入，网页端仍会再次执行服务端预检查。";
  if (missingEmployeeNumberCount > 0) {
    const roleNote = missingRoles.length
      ? `；${missingRoles.map((role) => role.roleLabel).join("、")}按当前决定可暂不填写，但D49会继续保持阻塞`
      : "";
    return `受控草稿已有 ${employeeRowCount} 名员工；先补齐 ${missingEmployeeNumberCount} 个员工编号并重新预检查${roleNote}。`;
  }
  if (missingRoles.length > 0) {
    return `补充${missingRoles.map((role) => role.roleLabel).join("、")}正式员工后重新预检查；未补齐前D49保持阻塞。`;
  }
  return "按离线预检查结果修正受控草稿后重新预检查，uploadAllowed=true后再进入网页上传。";
}

function unavailableStatus(checkedAt) {
  return {
    version: "p0-v1-d49-employee-intake-status-v2",
    scope: "v1_d49_employee_intake_status",
    available: false,
    fresh: false,
    status: "unavailable",
    ready: false,
    uploadAllowed: false,
    checkedAt,
    freshness: unavailableFreshness(),
    summary: {
      label: "受控员工草稿预检结果不可用",
      employeeRowCount: 0,
      coveredRoleCount: 0,
      requiredRoleCount: requiredV1RuntimeEmployeeRoles.length,
      missingRoleCount: requiredV1RuntimeEmployeeRoles.length,
      coverageLabel: `0/${requiredV1RuntimeEmployeeRoles.length}`,
      errorCount: 0,
      warningCount: 0,
      issueCount: 0,
      missingEmployeeNumberCount: 0,
      blockerCount: 0,
      blockerLabel: "未读取",
      freshnessLabel: "未验证",
    },
    roles: [],
    missingRoleLabels: [],
    nextAction: "重新运行D49专用员工工作簿离线预检查；报告通过脱敏边界校验后才会显示聚合结果。",
    safeguards: safeOutputSafeguards(false, false),
  };
}

function safeOutputSafeguards(reportRedactionVerified, sourceEvidenceVerified) {
  return {
    readOnly: true,
    reportRedactionVerified,
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
    sourceEvidenceVerified,
    workbookDigestIncluded: false,
  };
}

function buildFreshness({ report, workbookEvidence, nowMs }) {
  const checkedAtMs = Date.parse(String(report.checkedAt ?? ""));
  const checkedAtValid = Number.isFinite(checkedAtMs)
    && checkedAtMs <= nowMs + MAX_FUTURE_SKEW_MS;
  const ageMs = checkedAtValid ? Math.max(0, nowMs - checkedAtMs) : null;
  const withinMaxAge = checkedAtValid && ageMs <= MAX_REPORT_AGE_MS;
  const reportDigest = String(report.sourceEvidence?.workbookDigest ?? "").trim().toLowerCase();
  const currentDigest = String(workbookEvidence?.workbookDigest ?? "").trim().toLowerCase();
  const reportByteLength = nonNegativeInteger(report.sourceEvidence?.workbookByteLength);
  const currentByteLength = nonNegativeInteger(workbookEvidence?.workbookByteLength);
  const sourceMatched = /^[a-f0-9]{64}$/.test(currentDigest)
    && reportDigest === currentDigest
    && reportByteLength > 0
    && reportByteLength === currentByteLength;
  const fresh = checkedAtValid && withinMaxAge && sourceMatched;
  const status = !checkedAtValid
    ? "invalid_checked_at"
    : !sourceMatched
      ? "workbook_changed"
      : !withinMaxAge
        ? "expired"
        : "fresh";
  return {
    fresh,
    status,
    label: status === "fresh"
      ? "当前工作簿与预检报告一致"
      : status === "workbook_changed"
        ? "工作簿已变化，需重新预检"
        : status === "expired"
          ? "预检已超过72小时"
          : "预检时间异常",
    checkedAtValid,
    withinMaxAge,
    sourceMatched,
    maxAgeHours: MAX_REPORT_AGE_MS / (60 * 60 * 1000),
    ageHours: ageMs === null ? null : Math.floor(ageMs / (60 * 60 * 1000)),
  };
}

function unavailableFreshness() {
  return {
    fresh: false,
    status: "unavailable",
    label: "未验证",
    checkedAtValid: false,
    withinMaxAge: false,
    sourceMatched: false,
    maxAgeHours: MAX_REPORT_AGE_MS / (60 * 60 * 1000),
    ageHours: null,
  };
}

function safeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function safeIsoDate(value, fallback) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
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
