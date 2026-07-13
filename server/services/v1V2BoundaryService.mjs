import { summarizeV1FieldEvidenceIntakeSignoffRows } from "./v1FieldEvidenceProjectionService.mjs";
import { sanitizeV1V2BoundaryBrief } from "./v1FieldCoordinationProjectionService.mjs";
import { sanitizeV1RoleTaskActionText } from "./v1StatusTextSanitizer.mjs";

export function createV1V2BoundaryService({
  readStatusArtifacts,
  getArtifactRoot,
  runScopeBriefRefreshCommand,
  now = () => new Date(),
} = {}) {
  requireFunction(readStatusArtifacts, "readStatusArtifacts");
  requireFunction(getArtifactRoot, "getArtifactRoot");
  requireFunction(runScopeBriefRefreshCommand, "runScopeBriefRefreshCommand");

  return {
    precheck({ operatorId } = {}) {
      const checkedAt = now().toISOString();
      const artifacts = readStatusArtifacts();
      const completion = artifacts.completionSnapshot?.value ?? {};
      const boundaryBrief = sanitizeV1V2BoundaryBrief(artifacts.v1V2Scope?.value ?? {}, completion);
      const signoffSummary = summarizeV1FieldEvidenceIntakeSignoffRows(
        artifacts.fieldEvidenceSignoffBoundaryCsv?.value,
      );
      const blockers = buildPrecheckBlockers({ boundaryBrief, signoffSummary });
      const ready =
        boundaryBrief.available === true &&
        boundaryBrief.canDeclareV1Complete === true &&
        signoffSummary.boundaryReady === true &&
        blockers.length === 0;

      return {
        httpStatus: 200,
        body: buildPrecheckBody({ checkedAt, operatorId, boundaryBrief, signoffSummary, blockers, ready }),
      };
    },

    async refreshScopeBrief({ operatorId } = {}) {
      const checkedAt = now().toISOString();
      try {
        await runScopeBriefRefreshCommand({ artifactRoot: getArtifactRoot() });
        const artifacts = readStatusArtifacts();
        const completion = artifacts.completionSnapshot?.value ?? {};
        const scopeBrief = sanitizeV1V2BoundaryBrief(artifacts.v1V2Scope?.value ?? {}, completion);
        return {
          httpStatus: 200,
          body: buildRefreshSuccessBody({ checkedAt, operatorId, scopeBrief }),
        };
      } catch {
        return {
          httpStatus: 500,
          body: buildRefreshErrorBody({ checkedAt, operatorId }),
        };
      }
    },
  };
}

function buildPrecheckBody({ checkedAt, operatorId, boundaryBrief, signoffSummary, blockers, ready }) {
  return {
    version: "p0-v1-v2-boundary-precheck-v1",
    scope: "v1_v2_boundary_precheck",
    status: ready ? "ready" : signoffSummary.boundaryReady ? "confirmed_but_v1_blocked" : "pending_confirmation",
    ready,
    checkedAt,
    operatorId,
    summary: {
      label: ready ? "V1/V2 边界已确认且 V1 可继续放行复核" : "V1/V2 边界仍不能作为 V1 放行依据",
      boundaryLabel: signoffSummary.boundaryLabel,
      boundaryReady: signoffSummary.boundaryReady,
      canDeclareV1Complete: boundaryBrief.canDeclareV1Complete,
      scopeBriefAvailable: boundaryBrief.available,
      v1MustContinueCount: boundaryBrief.summary.v1MustContinueCount,
      v2CategoryCount: boundaryBrief.summary.v2CategoryCount,
      v2DifferenceCount: boundaryBrief.summary.v2DifferenceCount,
      moduleDifferenceCount: boundaryBrief.summary.moduleDifferenceCount,
      ownerReviewRuleCount: boundaryBrief.summary.ownerReviewRuleCount,
      v1MustContinueLabel: `${boundaryBrief.summary.v1MustContinueCount} 项`,
      v2CategoryLabel: `${boundaryBrief.summary.v2CategoryCount} 类`,
      v2DifferenceLabel: `${boundaryBrief.summary.v2DifferenceCount} 项`,
      moduleDifferenceLabel: `${boundaryBrief.summary.moduleDifferenceCount} 个模块`,
      blockerCount: blockers.length,
      blockerShownCount: blockers.length,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      requestBodyIgnored: true,
    },
    v1MustContinue: boundaryBrief.v1MustContinue,
    v2Categories: boundaryBrief.v2Categories,
    v2Differences: boundaryBrief.v2Differences.slice(0, 5),
    moduleDifferences: boundaryBrief.moduleDifferences.slice(0, 5),
    ownerReview: boundaryBrief.ownerReview,
    blockers,
    nextAction: ready
      ? "边界确认已满足；继续刷新 release candidate / go-live suite，并复核现场证据和签字。"
      : blockers[0]?.nextAction || "负责人先复核 V1 必做项和 V2 延后项，再填写边界确认人和确认时间。",
    safeguards: buildPrecheckSafeguards(),
  };
}

function buildPrecheckBlockers({ boundaryBrief, signoffSummary }) {
  const blockers = [];
  if (boundaryBrief.available !== true) {
    blockers.push(buildBlocker({
      key: "v1-v2-brief-missing",
      label: "V1/V2 差异摘要缺失",
      detail: "当前没有可供负责人复核的 V1/V2 差异摘要。",
      nextAction: "先生成 V1/V2 差异摘要，再做边界确认。",
    }));
  }
  if (boundaryBrief.summary.v1MustContinueCount > 0 && boundaryBrief.canDeclareV1Complete !== true) {
    blockers.push(buildBlocker({
      key: "v1-must-continue-open",
      label: "V1 必做项仍未完成",
      detail: `还有 ${boundaryBrief.summary.v1MustContinueCount} 项 V1 必做内容不能后移到 V2。`,
      nextAction: "先按 V1 必做清单处理生产配置、真实设备、现场证据和签字。",
    }));
  }
  if (signoffSummary.boundaryReady !== true) {
    blockers.push(buildBlocker({
      key: "v1-v2-boundary-confirmation-missing",
      label: "V1/V2 边界确认未完成",
      detail: `边界状态：${signoffSummary.boundaryLabel || "待确认"}。`,
      nextAction: "负责人确认 V1 必做项和 V2 延后项，并填写确认人和确认时间。",
    }));
  }
  if (boundaryBrief.summary.ownerReviewRuleCount <= 0) {
    blockers.push(buildBlocker({
      key: "owner-review-rule-missing",
      label: "负责人复核规则缺失",
      detail: "V1/V2 差异摘要没有负责人复核问题、建议或放行规则。",
      nextAction: "补齐负责人复核规则，明确 V2 差异不能替代 V1 门禁。",
    }));
  }
  return blockers.slice(0, 8);
}

function buildBlocker({ key, label, detail, nextAction }) {
  return {
    key: cleanText(key),
    label: sanitizeV1RoleTaskActionText(label),
    status: "blocked",
    blocking: true,
    detail: sanitizeV1RoleTaskActionText(detail),
    nextAction: sanitizeV1RoleTaskActionText(nextAction),
  };
}

function buildPrecheckSafeguards() {
  return {
    nonMutating: true,
    requestBodyIgnored: true,
    boundaryConfirmationMutated: false,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    rawV1V2ScopeIncluded: false,
    rawEvidenceRefsIncluded: false,
    rawSignersIncluded: false,
    rawNotesIncluded: false,
    artifactPathExposed: false,
    rawSecretsIncluded: false,
    environmentValuesIncluded: false,
    commandValuesIncluded: false,
  };
}

function buildRefreshSuccessBody({ checkedAt, operatorId, scopeBrief }) {
  const ready = scopeBrief.ready === true;
  return {
    version: "p0-v1-v2-scope-brief-refresh-v1",
    scope: "v1_v2_scope_brief_refresh",
    status: ready ? "ready_scope_brief_refreshed" : "blocked_scope_brief_refreshed",
    ready,
    checkedAt,
    operatorId,
    summary: {
      label: ready ? "V1/V2 差异摘要已刷新且 V1 边界可复核" : "V1/V2 差异摘要已刷新但 V1 仍未完成",
      canDeclareV1Complete: scopeBrief.canDeclareV1Complete === true,
      scopeBriefAvailable: scopeBrief.available === true,
      v1MustContinueCount: scopeBrief.summary.v1MustContinueCount,
      v2CategoryCount: scopeBrief.summary.v2CategoryCount,
      v2DifferenceCount: scopeBrief.summary.v2DifferenceCount,
      moduleDifferenceCount: scopeBrief.summary.moduleDifferenceCount,
      ownerReviewRuleCount: scopeBrief.summary.ownerReviewRuleCount,
      v1MustContinueLabel: `${scopeBrief.summary.v1MustContinueCount} 项`,
      v2CategoryLabel: `${scopeBrief.summary.v2CategoryCount} 类`,
      v2DifferenceLabel: `${scopeBrief.summary.v2DifferenceCount} 项`,
      moduleDifferenceLabel: `${scopeBrief.summary.moduleDifferenceCount} 个模块`,
      scopeBriefRefreshed: true,
      boundaryConfirmationMutated: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      requestBodyIgnored: true,
    },
    conclusion: scopeBrief.conclusion,
    v1MustContinue: scopeBrief.v1MustContinue,
    v2Categories: scopeBrief.v2Categories,
    v2Differences: scopeBrief.v2Differences.slice(0, 10),
    moduleDifferences: scopeBrief.moduleDifferences.slice(0, 8),
    ownerReview: scopeBrief.ownerReview,
    nextAction: ready
      ? "差异摘要已刷新；继续由负责人复核 V1/V2 边界并刷新 release candidate。"
      : scopeBrief.nextAction || "差异摘要已刷新；先按 V1 必做清单处理阻塞，再复核 V2 延后项。",
    safeguards: buildRefreshSafeguards({ refreshed: true }),
  };
}

function buildRefreshErrorBody({ checkedAt, operatorId }) {
  return {
    version: "p0-v1-v2-scope-brief-refresh-v1",
    scope: "v1_v2_scope_brief_refresh",
    status: "scope_brief_refresh_failed",
    ready: false,
    checkedAt,
    operatorId,
    error: {
      code: "V1_V2_SCOPE_BRIEF_REFRESH_FAILED",
      message: "刷新 V1/V2 差异摘要失败，命令输出已脱敏且未返回前端。",
    },
    summary: {
      label: "V1/V2 差异摘要刷新失败",
      canDeclareV1Complete: false,
      scopeBriefAvailable: false,
      v1MustContinueCount: 0,
      v2CategoryCount: 0,
      v2DifferenceCount: 0,
      moduleDifferenceCount: 0,
      ownerReviewRuleCount: 0,
      v1MustContinueLabel: "0 项",
      v2CategoryLabel: "0 类",
      v2DifferenceLabel: "0 项",
      moduleDifferenceLabel: "0 个模块",
      scopeBriefRefreshed: false,
      boundaryConfirmationMutated: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      requestBodyIgnored: true,
    },
    v1MustContinue: [],
    v2Categories: [],
    v2Differences: [],
    moduleDifferences: [],
    ownerReview: {},
    nextAction: "由技术/管理复核 V1/V2 范围文档和完成度快照是否存在，再重新刷新差异摘要。",
    safeguards: buildRefreshSafeguards({ refreshed: false }),
  };
}

function buildRefreshSafeguards({ refreshed = false } = {}) {
  return {
    requestBodyIgnored: true,
    scopeBriefRefreshed: Boolean(refreshed),
    sourceScopeMarkdownMutated: false,
    completionSnapshotMutated: false,
    fieldEvidenceMutated: false,
    boundaryConfirmationMutated: false,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    businessDataMutated: false,
    rawV1V2ScopeIncluded: false,
    rawEvidenceRefsIncluded: false,
    rawSignersIncluded: false,
    rawNotesIncluded: false,
    rawCommandStdoutIncluded: false,
    rawCommandStderrIncluded: false,
    artifactPathExposed: false,
    localPathExposed: false,
    environmentValuesIncluded: false,
    commandValuesIncluded: false,
    rawSecretsIncluded: false,
  };
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function requireFunction(value, label) {
  if (typeof value !== "function") throw new TypeError(`${label} must be a function.`);
}
