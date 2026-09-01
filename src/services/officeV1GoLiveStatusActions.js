import {
  readOfficeApiJson as readJson,
  requestOfficeApi,
  toOfficeApiError as toApiError,
} from "./officeApiClientCore.js";

export function createOfficeV1GoLiveStatusActions(normalizers = {}) {
  const actions = {
    getOfficeV1GoLiveStatus: createStatusReadAction(normalizers.normalizeV1GoLiveStatusForClient),
    generateOfficeV1FieldEvidenceDraftManifest: createPostAction({
      path: "/system/v1-field-evidence-intake/draft-manifest",
      resultKey: "draftResult",
      normalize: normalizers.normalizeV1FieldEvidenceDraftManifestResult,
      fallbackMessage: "生成现场证据 manifest 草稿失败。",
      unavailableCode: "V1_FIELD_EVIDENCE_DRAFT_API_UNAVAILABLE",
    }),
    validateOfficeV1FieldEvidenceDraftManifest: createPostAction({
      path: "/system/v1-field-evidence-intake/validate-draft-manifest",
      resultKey: "validationResult",
      normalize: normalizers.normalizeV1FieldEvidenceDraftValidationResult,
      fallbackMessage: "校验现场证据 manifest 草稿失败。",
      unavailableCode: "V1_FIELD_EVIDENCE_DRAFT_VALIDATION_API_UNAVAILABLE",
    }),
    stageOfficeV1FieldEvidenceIntakeRow: createPostAction({
      path: "/system/v1-field-evidence-intake/stage-row",
      resultKey: "stageResult",
      normalize: normalizers.normalizeV1FieldEvidenceStageRowResult,
      body: (input) => input.row || {},
      fallbackMessage: "保存现场证据草稿行失败。",
      unavailableCode: "V1_FIELD_EVIDENCE_STAGE_ROW_API_UNAVAILABLE",
    }),
    precheckOfficeV1ProductionEnv: createPostAction({
      path: "/system/v1-production-env/live-precheck",
      resultKey: "precheckResult",
      normalize: normalizers.normalizeV1ProductionEnvLivePrecheckResult,
      fallbackMessage: "当前生产 env 预检失败。",
      unavailableCode: "V1_PRODUCTION_ENV_LIVE_PRECHECK_API_UNAVAILABLE",
    }),
    runOfficeV1ProductionEnvSetup: createPostAction({
      path: "/system/v1-production-env-setup/live-run",
      resultKey: "setupResult",
      normalize: normalizers.normalizeV1ProductionEnvSetupLiveRunResult,
      blockedWhenNotReady: true,
      fallbackMessage: "生产 env 安全草稿 setup 失败。",
      unavailableCode: "V1_PRODUCTION_ENV_SETUP_LIVE_RUN_API_UNAVAILABLE",
    }),
    precheckOfficeV1ProductionEnvIntake: createPostAction({
      path: "/system/v1-production-env-intake/live-precheck",
      resultKey: "precheckResult",
      normalize: normalizers.normalizeV1ProductionEnvIntakeLivePrecheckResult,
      blockedWhenNotReady: true,
      fallbackMessage: "生产 env 真实值校验失败。",
      unavailableCode: "V1_PRODUCTION_ENV_INTAKE_LIVE_PRECHECK_API_UNAVAILABLE",
    }),
    precheckOfficeV1ProductionEnvFileAudit: createPostAction({
      path: "/system/v1-production-env-file-audit/live-precheck",
      resultKey: "precheckResult",
      normalize: normalizers.normalizeV1ProductionEnvFileAuditLivePrecheckResult,
      fallbackMessage: "当前 env 文件安全审计预检失败。",
      unavailableCode: "V1_PRODUCTION_ENV_FILE_AUDIT_LIVE_PRECHECK_API_UNAVAILABLE",
    }),
    precheckOfficeV1ProductionEnvFilePreview: createPostAction({
      path: "/system/v1-production-env-file-preview/live-precheck",
      resultKey: "precheckResult",
      normalize: normalizers.normalizeV1ProductionEnvLivePrecheckResult,
      fallbackMessage: "当前 env 文件应用预检失败。",
      unavailableCode: "V1_PRODUCTION_ENV_FILE_PREVIEW_LIVE_PRECHECK_API_UNAVAILABLE",
    }),
    precheckOfficeV1ProductionGoLive: createPostAction({
      path: "/system/v1-production-go-live/live-precheck",
      resultKey: "precheckResult",
      normalize: normalizers.normalizeV1ProductionGoLiveLivePrecheckResult,
      blockedWhenNotReady: true,
      fallbackMessage: "生产上线组合预检失败。",
      unavailableCode: "V1_PRODUCTION_GO_LIVE_LIVE_PRECHECK_API_UNAVAILABLE",
    }),
    precheckOfficeV1RuntimeReadiness: createPostAction({
      path: "/system/v1-runtime-readiness/live-precheck",
      resultKey: "precheckResult",
      normalize: normalizers.normalizeV1RuntimeReadinessLivePrecheckResult,
      fallbackMessage: "当前运行时总门禁预检失败。",
      unavailableCode: "V1_RUNTIME_READINESS_LIVE_PRECHECK_API_UNAVAILABLE",
    }),
    precheckOfficeV1ProductionFirstStageValuesDryRun: createPostAction({
      path: "/system/v1-production-first-stage-values-dry-run/live-precheck",
      resultKey: "precheckResult",
      normalize: normalizers.normalizeV1ProductionFirstStageValuesDryRunLivePrecheckResult,
      blockedWhenNotReady: true,
      fallbackMessage: "第一阶段真实值 dry-run 预检失败。",
      unavailableCode: "V1_PRODUCTION_FIRST_STAGE_VALUES_DRY_RUN_LIVE_PRECHECK_API_UNAVAILABLE",
    }),
    runOfficeV1ProductionFirstStageExecution: createPostAction({
      path: "/system/v1-production-first-stage-execution/live-run",
      resultKey: "executionResult",
      normalize: normalizers.normalizeV1ProductionFirstStageExecutionLiveRunResult,
      blockedWhenNotReady: true,
      fallbackMessage: "第一阶段执行失败。",
      unavailableCode: "V1_PRODUCTION_FIRST_STAGE_EXECUTION_LIVE_RUN_API_UNAVAILABLE",
    }),
    runOfficeV1ProductionPersistenceEvidence: createPostAction({
      path: "/system/v1-production-persistence-evidence/live-run",
      resultKey: "evidenceResult",
      normalize: normalizers.normalizeV1ProductionPersistenceEvidenceLiveRunResult,
      blockedWhenNotReady: true,
      fallbackMessage: "生产持久化留证失败。",
      unavailableCode: "V1_PRODUCTION_PERSISTENCE_EVIDENCE_LIVE_RUN_API_UNAVAILABLE",
    }),
    applyOfficeV1ProductionFirstStageValues: createPostAction({
      path: "/system/v1-production-first-stage-values-apply/live-run",
      resultKey: "applyResult",
      normalize: normalizers.normalizeV1ProductionFirstStageValuesApplyLiveRunResult,
      blockedWhenNotReady: true,
      fallbackMessage: "第一阶段真实值正式合并失败。",
      unavailableCode: "V1_PRODUCTION_FIRST_STAGE_VALUES_APPLY_LIVE_RUN_API_UNAVAILABLE",
    }),
    precheckOfficeV1Persistence: createPostAction({
      path: "/system/v1-persistence/live-precheck",
      resultKey: "precheckResult",
      normalize: normalizers.normalizeV1PersistenceLivePrecheckResult,
      fallbackMessage: "当前系统持久化预检失败。",
      unavailableCode: "V1_PERSISTENCE_LIVE_PRECHECK_API_UNAVAILABLE",
    }),
    precheckOfficeV1AttachmentRetention: createPostAction({
      path: "/system/v1-attachment-retention/live-precheck",
      resultKey: "precheckResult",
      normalize: normalizers.normalizeV1AttachmentRetentionLivePrecheckResult,
      fallbackMessage: "当前附件 V1 留档预检失败。",
      unavailableCode: "V1_ATTACHMENT_RETENTION_LIVE_PRECHECK_API_UNAVAILABLE",
    }),
    precheckOfficeV1DriverReadiness: createPostAction({
      path: "/system/v1-driver-readiness/live-precheck",
      resultKey: "precheckResult",
      normalize: normalizers.normalizeV1DriverReadinessLivePrecheckResult,
      fallbackMessage: "当前司机端 V1 真机门禁预检失败。",
      unavailableCode: "V1_DRIVER_READINESS_LIVE_PRECHECK_API_UNAVAILABLE",
    }),
    precheckOfficeV1V2Boundary: createPostAction({
      path: "/system/v1-v2-boundary/precheck",
      resultKey: "precheckResult",
      normalize: normalizers.normalizeV1V2BoundaryPrecheckResult,
      fallbackMessage: "V1/V2 边界预检失败。",
      unavailableCode: "V1_V2_BOUNDARY_PRECHECK_API_UNAVAILABLE",
    }),
    refreshOfficeV1V2ScopeBrief: createPostAction({
      path: "/system/v1-v2-scope-brief/refresh",
      resultKey: "refreshResult",
      normalize: normalizers.normalizeV1V2ScopeBriefRefreshResult,
      fallbackMessage: "刷新 V1/V2 差异摘要失败。",
      unavailableCode: "V1_V2_SCOPE_BRIEF_REFRESH_API_UNAVAILABLE",
    }),
    precheckOfficeV1ReleaseCandidateRefresh: createPostAction({
      path: "/system/v1-release-candidate/refresh-precheck",
      resultKey: "precheckResult",
      normalize: normalizers.normalizeV1ReleaseCandidateRefreshPrecheckResult,
      fallbackMessage: "刷新 release candidate 前置预检失败。",
      unavailableCode: "V1_RELEASE_CANDIDATE_REFRESH_PRECHECK_API_UNAVAILABLE",
    }),
    refreshOfficeV1ReleaseCandidate: createPostAction({
      path: "/system/v1-release-candidate/refresh",
      resultKey: "refreshResult",
      normalize: normalizers.normalizeV1ReleaseCandidateRefreshResult,
      blockedWhenNotReady: true,
      fallbackMessage: "刷新 release candidate / go-live suite 失败。",
      unavailableCode: "V1_RELEASE_CANDIDATE_REFRESH_API_UNAVAILABLE",
    }),
  };

  Object.entries(actions).forEach(([name, action]) => {
    if (typeof action !== "function") throw new TypeError(`V1 action ${name} is not configured`);
  });
  return actions;
}

function createStatusReadAction(normalize) {
  requireNormalizer(normalize, "normalizeV1GoLiveStatusForClient");
  return async function getOfficeV1GoLiveStatus(input = {}, options = {}) {
    const { authState, operatorId } = input;
    try {
      const response = await requestOfficeApi("/system/v1-go-live-status", {
        ...options,
        authState,
        method: "GET",
        operatorId,
      });
    const json = await readJson(response, {});
      if (!response.ok) {
        return {
          source: "api_error",
          statusData: null,
          error: toApiError(json, response.status, "V1 上线状态 API 返回错误。"),
        };
      }
      return { source: "api", statusData: normalize(json), error: null };
    } catch (error) {
      return {
        source: "local_fallback",
        statusData: null,
        error: toUnavailableError("V1_GO_LIVE_STATUS_API_UNAVAILABLE", error),
      };
    }
  };
}

function createPostAction({
  path,
  resultKey,
  normalize,
  body = () => ({}),
  blockedWhenNotReady = false,
  fallbackMessage,
  unavailableCode,
}) {
  requireNormalizer(normalize, resultKey);
  return async function runV1Action(input = {}, options = {}) {
    const { authState, operatorId } = input;
    try {
      const response = await requestOfficeApi(path, {
        ...options,
        authState,
        method: "POST",
        operatorId,
        body: body(input),
      });
    const json = await readJson(response, {});
      const result = normalize(json);
      if (!response.ok) {
        return {
          source: "api_error",
          [resultKey]: result,
          blocked: true,
          error: toApiError(json, response.status, fallbackMessage),
        };
      }
      return {
        source: "api",
        [resultKey]: result,
        blocked: blockedWhenNotReady ? result?.ready !== true : false,
        error: null,
      };
    } catch (error) {
      return {
        source: "local_fallback",
        [resultKey]: null,
        blocked: true,
        error: toUnavailableError(unavailableCode, error),
      };
    }
  };
}

function requireNormalizer(normalize, label) {
  if (typeof normalize !== "function") throw new TypeError(`Missing V1 normalizer: ${label}`);
}

function toUnavailableError(code, error) {
  return { code, message: error?.message ?? String(error) };
}
