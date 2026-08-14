import { validateV1FieldEvidenceManifest } from "../../scripts/v1FieldEvidenceManifest.mjs";
import { sanitizeV1FieldEvidenceDraftManifestValidationResult } from "./v1FieldEvidenceDraftService.mjs";
import {
  buildV1FieldEvidenceDraftFreshness,
  normalizeV1FieldEvidenceDraftManifestStatus,
  sanitizeV1FieldEvidenceIntakeQuality,
} from "./v1FieldEvidenceProjectionService.mjs";
import { sanitizeV1ProductionEnvGate } from "./v1ProductionStatusProjectionService.mjs";
import { sanitizeV1ProductionEnvFileConfigSourceStatuses } from "./v1ProductionEnvFileAuditService.mjs";
import { sanitizeV1SensitiveStatusText } from "./v1StatusTextSanitizer.mjs";

export function createV1ReleaseCandidateRefreshPrecheckService({
  readStatusArtifacts,
  precheckProductionGoLive,
  sanitizeProductionGoLiveGate,
  buildProductionEnvGate = sanitizeV1ProductionEnvGate,
  buildDraftFreshness = buildV1FieldEvidenceDraftFreshness,
  buildFieldEvidenceQuality = sanitizeV1FieldEvidenceIntakeQuality,
  normalizeDraftManifestStatus = normalizeV1FieldEvidenceDraftManifestStatus,
  buildDraftValidation = defaultDraftValidation,
  now = () => new Date(),
} = {}) {
  requireFunction(readStatusArtifacts, "readStatusArtifacts");
  requireFunction(precheckProductionGoLive, "precheckProductionGoLive");
  requireFunction(sanitizeProductionGoLiveGate, "sanitizeProductionGoLiveGate");

  return {
    async precheck({ request, operatorId } = {}) {
      const checkedAt = now().toISOString();
      const artifacts = readStatusArtifacts();
      const completion = artifacts?.completionSnapshot?.value ?? {};
      const suite = artifacts?.goLiveSuite?.value ?? {};
      const releaseCandidate = artifacts?.releaseCandidate?.value ?? {};
      const productionEnvGate = buildProductionEnvGate(
        releaseCandidate.envPreflight,
        releaseCandidate.envFileAudit,
        completion.releaseCandidate?.envPreflight?.fixChecklist ??
          suite.releaseCandidate?.envPreflight?.fixChecklist ??
          [],
      );
      const productionGoLiveResult = await precheckProductionGoLive({ request, operatorId });
      const productionGoLiveGate = sanitizeProductionGoLiveGate(productionGoLiveResult?.body);
      const draftFreshness = buildDraftFreshness(
        artifacts?.fieldEvidenceItemsCsv?.value,
        artifacts?.fieldEvidenceSignoffBoundaryCsv?.value,
        artifacts?.fieldEvidenceDraftManifest,
      );
      const fieldEvidenceQuality = buildFieldEvidenceQuality(
        artifacts?.fieldEvidenceItemsCsv?.value,
        artifacts?.fieldEvidenceSignoffBoundaryCsv?.value,
        {
          rulesArtifact: artifacts?.fieldEvidenceIntakeRules,
          draftManifestArtifact: artifacts?.fieldEvidenceDraftManifest,
          draftFreshness,
        },
      );
      const draftManifestStatus = normalizeDraftManifestStatus(artifacts?.fieldEvidenceDraftManifest);
      const draftValidation = buildDraftValidation(
        artifacts?.fieldEvidenceDraftManifest,
        draftFreshness,
        checkedAt,
      );
      const evidenceProgress =
        cleanProgress(draftValidation?.summary?.evidenceProgress) ||
        cleanProgress(fieldEvidenceQuality?.summary?.evidenceProgress) ||
        "0/40";
      const signoffProgress =
        cleanProgress(draftValidation?.summary?.signoffProgress) ||
        cleanProgress(fieldEvidenceQuality?.summary?.signoffProgress) ||
        "0/6";
      const evidenceGroupsReadyLabel =
        cleanProgress(draftValidation?.summary?.evidenceGroupsReadyLabel) || "0/7";
      const boundaryReady = Boolean(
        draftValidation?.boundary?.ready || fieldEvidenceQuality?.summary?.boundaryReady,
      );
      const boundaryLabel =
        sanitizeText(draftValidation?.boundary?.label) ||
        sanitizeText(fieldEvidenceQuality?.summary?.boundaryLabel) ||
        "待确认";
      const blockers = buildBlockers({
        draftManifestStatus,
        draftFreshness,
        draftValidation,
        productionEnvGate,
        productionGoLiveGate,
        evidenceProgress,
        signoffProgress,
        evidenceGroupsReadyLabel,
        boundaryReady,
        boundaryLabel,
      });
      const ready =
        draftManifestStatus === "available" &&
        draftFreshness?.ready === true &&
        draftValidation?.ready === true &&
        productionEnvGate?.ready === true &&
        productionGoLiveGate?.ready === true &&
        boundaryReady &&
        blockers.length === 0;

      return {
        httpStatus: 200,
        body: {
          version: "p0-v1-release-candidate-refresh-precheck-v1",
          scope: "v1_release_candidate_refresh_precheck",
          status: ready ? "ready_to_refresh" : "blocked",
          ready,
          checkedAt,
          operatorId,
          summary: {
            label: ready ? "已具备刷新 release candidate 条件" : "暂不能刷新 release candidate",
            draftManifestStatus: cleanStatus(draftManifestStatus) || "missing",
            draftManifestLabel: formatDraftManifestStatusLabel(draftManifestStatus),
            draftFreshnessStatus: cleanStatus(draftFreshness?.status),
            draftFreshnessLabel: sanitizeText(draftFreshness?.label),
            draftFreshnessReady: draftFreshness?.ready === true,
            draftValidationStatus: cleanStatus(draftValidation?.status),
            evidenceProgress,
            signoffProgress,
            evidenceGroupsReadyLabel,
            productionEnvPreflightLabel: cleanProgress(productionEnvGate?.summary?.readinessLabel) || "0/10",
            productionEnvBlockingCount: nonNegativeInteger(productionEnvGate?.summary?.blockingCount),
            productionEnvWarningCount: nonNegativeInteger(productionEnvGate?.summary?.warningCount),
            productionGoLiveStatus: cleanStatus(productionGoLiveGate?.status),
            productionGoLiveLabel: sanitizeText(productionGoLiveGate?.summary?.label),
            productionGoLiveReadinessLabel:
              cleanProgress(productionGoLiveGate?.summary?.readinessLabel) || "0/5",
            productionGoLiveBlockingCount: nonNegativeInteger(
              productionGoLiveGate?.summary?.blockingCount,
            ),
            productionGoLiveFirstBlockedStageKey: cleanKey(
              productionGoLiveGate?.summary?.firstBlockedStageKey,
            ),
            productionGoLiveFirstBlockedStageLabel: sanitizeText(
              productionGoLiveGate?.summary?.firstBlockedStageLabel,
            ),
            productionGoLiveSourceStatuses: sanitizeV1ProductionEnvFileConfigSourceStatuses({
              sources: productionGoLiveGate?.summary?.sourceStatuses,
            }),
            productionGoLiveReady: productionGoLiveGate?.ready === true,
            boundaryLabel,
            releaseCandidateRefreshAllowed: ready,
            releaseCandidateRefreshed: false,
            goLiveSuiteRefreshed: false,
            blockerCount: blockers.length,
            blockerShownCount: blockers.length,
          },
          blockers,
          nextAction: ready
            ? "可以使用安全 env 文件刷新 release candidate / go-live suite；刷新后仍需负责人按页面门禁复核。"
            : "先补齐现场证据、负责人签字、V1/V2 边界、生产 env 和当前生产上线组合门禁，再刷新 release candidate / go-live suite。",
          safeguards: buildSafeguards({
            draftManifestAvailable: draftManifestStatus === "available",
            draftFreshnessChecked: true,
            productionGoLivePrecheckIncluded: true,
          }),
        },
      };
    },
  };
}

function defaultDraftValidation(draftManifestArtifact = {}, draftFreshness = null, checkedAt = "") {
  if (!isPlainObject(draftManifestArtifact) || draftManifestArtifact.status !== "loaded") {
    return missingDraftValidation();
  }
  const validation = validateV1FieldEvidenceManifest(draftManifestArtifact.value);
  const sanitized = sanitizeV1FieldEvidenceDraftManifestValidationResult(validation, {
    checkedAt,
    draftManifestAvailable: true,
    draftFreshness,
  });
  return {
    status: sanitized.status,
    ready: sanitized.ready,
    schemaValid: sanitized.schemaValid,
    summary: sanitized.summary,
    boundary: sanitized.boundary,
  };
}

function missingDraftValidation() {
  return {
    status: "missing",
    ready: false,
    schemaValid: false,
    summary: {
      evidenceProgress: "0/40",
      signoffProgress: "0/6",
      evidenceGroupsReadyLabel: "0/7",
      blockingIssueCount: 0,
    },
    boundary: { status: "pending", label: "待确认", ready: false },
  };
}

function buildBlockers(input) {
  const blockers = [];
  const {
    draftManifestStatus,
    draftFreshness,
    draftValidation,
    productionEnvGate,
    productionGoLiveGate,
    evidenceProgress,
    signoffProgress,
    evidenceGroupsReadyLabel,
    boundaryReady,
    boundaryLabel,
  } = input;
  if (draftManifestStatus !== "available") {
    blockers.push(blocker("field-evidence-draft-missing", "现场证据 manifest 草稿未生成", "页面还没有可用于刷新候选的现场证据草稿。", "先点击生成草稿，再校验草稿。"));
  } else if (isPlainObject(draftFreshness) && draftFreshness.ready !== true) {
    blockers.push(blocker("field-evidence-draft-stale", "现场证据 manifest 草稿不是当前 CSV 版本", `草稿新鲜度：${sanitizeText(draftFreshness.label) || "需重生成"}。`, "重新生成现场证据 manifest 草稿，再执行校验和刷新预检。"));
  } else if (draftValidation?.schemaValid === false) {
    blockers.push(blocker("field-evidence-draft-invalid", "现场证据 manifest 草稿结构异常", "草稿结构不符合 V1 现场证据 manifest。", "重新生成草稿或按模板修正后再校验。"));
  } else if (draftValidation?.ready !== true) {
    blockers.push(blocker("field-evidence-draft-blocked", "现场证据草稿校验未通过", `证据 ${evidenceProgress}，签字 ${signoffProgress}，证据组 ${evidenceGroupsReadyLabel}。`, "补齐真实生产、打印、司机真机、业务试跑证据和负责人签字。"));
  }
  if (productionEnvGate?.ready !== true) {
    blockers.push(blocker("production-env-preflight-blocked", "生产环境变量预检未通过", `生产 env ${cleanProgress(productionEnvGate?.summary?.readinessLabel) || "0/10"} 通过，${nonNegativeInteger(productionEnvGate?.summary?.blockingCount)} 项阻塞。`, "先填写安全 env 文件，完成 env 文件审计和生产环境变量预检。"));
  }
  if (productionGoLiveGate?.ready !== true) {
    const firstStage = sanitizeText(productionGoLiveGate?.summary?.firstBlockedStageLabel);
    blockers.push(blocker("production-go-live-combo-blocked", "当前生产上线组合预检未通过", `生产上线组合门禁 ${cleanProgress(productionGoLiveGate?.summary?.readinessLabel) || "0/5"} 通过，${sanitizeText(productionGoLiveGate?.summary?.blockerLabel) || "1 项"} 阻塞。${firstStage ? `首个阶段：${firstStage}。` : ""}`, "先在当前 API 实例完成安全 env 文件审计、生产 env 预检、运行时 readiness 和生产 profile 确认。"));
  }
  if (!isProgressComplete(signoffProgress)) {
    blockers.push(blocker("signoff-incomplete", "负责人签字未完成", `负责人签字 ${signoffProgress}。`, "补齐办公室、仓库/出库、车间、司机、财务、技术/管理签字。"));
  }
  if (!boundaryReady) {
    blockers.push(blocker("v1-v2-boundary-pending", "V1/V2 边界未确认", `边界状态：${boundaryLabel || "待确认"}。`, "负责人确认 V1 必做项和 V2 延后项，并填写确认人和时间。"));
  }
  return blockers.slice(0, 8);
}

function blocker(key, label, detail, nextAction) {
  return {
    key,
    label: sanitizeText(label),
    status: "blocked",
    blocking: true,
    detail: sanitizeText(detail),
    nextAction: sanitizeText(nextAction),
  };
}

function buildSafeguards({
  draftManifestAvailable = false,
  draftFreshnessChecked = false,
  productionGoLivePrecheckIncluded = false,
} = {}) {
  return {
    nonMutating: true,
    refreshPrecheckOnly: true,
    draftManifestAvailable: Boolean(draftManifestAvailable),
    draftFreshnessChecked: Boolean(draftFreshnessChecked),
    productionGoLivePrecheckIncluded: Boolean(productionGoLivePrecheckIncluded),
    sourceManifestMutated: false,
    draftManifestMutated: false,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    rawEvidenceRefsIncluded: false,
    rawSignersIncluded: false,
    rawNotesIncluded: false,
    rawFieldEvidenceDraftManifestIncluded: false,
    digestValuesIncluded: false,
    rawProductionGoLivePrecheckIncluded: false,
    rawProductionEnvPreflightIncluded: false,
    rawEnvFileAuditIncluded: false,
    artifactPathExposed: false,
    localPathExposed: false,
    currentRuntimeChecked: Boolean(productionGoLivePrecheckIncluded),
    productionEnvAppliedToProcess: false,
    physicalPrinterCalled: false,
    environmentValuesIncluded: false,
    commandValuesIncluded: false,
    rawSecretsIncluded: false,
  };
}

function formatDraftManifestStatusLabel(status) {
  if (status === "available") return "已生成";
  if (status === "invalid") return "草稿异常";
  return "未生成";
}

function isProgressComplete(value) {
  const match = cleanProgress(value).match(/^(\d+)\/(\d+)$/);
  return Boolean(match && Number(match[2]) > 0 && Number(match[1]) >= Number(match[2]));
}

function cleanProgress(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^\d+\s*\/\s*\d+$/.test(text) ? text.replace(/\s/g, "") : "";
}

function sanitizeText(value) {
  return sanitizeV1SensitiveStatusText(value);
}

function cleanKey(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_.:-]{1,120}$/.test(text) ? text : "";
}

function cleanStatus(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(text) ? text : "";
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
