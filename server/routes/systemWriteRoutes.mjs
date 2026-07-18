const routeDefinitions = [
  ["/api/system/v1-field-evidence-intake/draft-manifest", "applyV1FieldEvidenceIntake", "generateFieldEvidenceDraftManifest", "operator"],
  ["/api/system/v1-field-evidence-intake/validate-draft-manifest", "validateV1FieldEvidenceDraft", "validateFieldEvidenceDraftManifest", "operator"],
  ["/api/system/v1-field-evidence-intake/stage-row", "applyV1FieldEvidenceIntake", "stageFieldEvidenceRow", "body"],
  ["/api/system/v1-production-env/live-precheck", "precheckV1ProductionEnv", "precheckProductionEnv", "operator"],
  ["/api/system/v1-production-env-setup/live-run", "runV1ProductionEnvSetup", "runProductionEnvSetup", "operator"],
  ["/api/system/v1-production-env-intake/live-precheck", "precheckV1ProductionEnvIntake", "precheckProductionEnvIntake", "operator"],
  ["/api/system/v1-production-env-file-audit/live-precheck", "precheckV1ProductionEnvFileAudit", "precheckProductionEnvFileAudit", "operator"],
  ["/api/system/v1-production-env-file-preview/live-precheck", "precheckV1ProductionEnvFilePreview", "precheckProductionEnvFilePreview", "operator"],
  ["/api/system/v1-production-go-live/live-precheck", "precheckV1ProductionGoLive", "precheckProductionGoLive", "request"],
  ["/api/system/v1-production-persistence-evidence/live-run", "runV1ProductionPersistenceEvidence", "runProductionPersistenceEvidence", "operator"],
  ["/api/system/v1-production-first-stage-execution/live-run", "runV1ProductionFirstStageExecution", "runProductionFirstStageExecution", "request"],
  ["/api/system/v1-production-first-stage-values-dry-run/live-precheck", "precheckV1ProductionFirstStageValuesDryRun", "precheckProductionFirstStageValuesDryRun", "operator"],
  ["/api/system/v1-production-first-stage-values-apply/live-run", "applyV1ProductionFirstStageValues", "runProductionFirstStageValuesApply", "operator"],
  ["/api/system/v1-persistence/live-precheck", "precheckV1Persistence", "precheckPersistence", "workspace"],
  ["/api/system/v1-attachment-retention/live-precheck", "precheckV1AttachmentRetention", "precheckAttachmentRetention", "workspace"],
  ["/api/system/v1-driver-readiness/live-precheck", "precheckV1DriverReadiness", "precheckDriverReadiness", "workspace"],
  ["/api/system/v1-runtime-readiness/live-precheck", "precheckV1RuntimeReadiness", "precheckRuntimeReadiness", "request"],
  ["/api/system/v1-v2-boundary/precheck", "precheckV1V2Boundary", "precheckV1V2Boundary", "operator"],
  ["/api/system/v1-v2-scope-brief/refresh", "refreshV1V2ScopeBrief", "refreshV1V2ScopeBrief", "operator"],
  ["/api/system/v1-release-candidate/refresh-precheck", "precheckV1ReleaseCandidateRefresh", "precheckV1ReleaseCandidateRefresh", "request"],
  ["/api/system/v1-release-candidate/refresh", "refreshV1ReleaseCandidate", "refreshV1ReleaseCandidate", "request"],
];

export async function handleSystemWriteRoutes({
  method,
  url,
  request,
  response,
  workspace,
  body,
  permissionContext,
  authContext,
  writeActionPermissions,
  requireActionPermission,
  getPermissionOperatorId,
  sendJson,
  v1FieldEvidenceDraftService,
  v1FieldEvidenceStagingService,
  precheckV1ProductionEnv,
  runV1ProductionEnvSetup,
  v1LocalCommandRunnerService,
  precheckV1ProductionEnvIntake,
  precheckV1ProductionEnvFileAudit,
  precheckV1ProductionEnvFilePreview,
  v1ProductionGoLivePrecheckService,
  v1ProductionPersistenceEvidenceLiveRunService,
  v1ProductionFirstStageExecutionLiveRunService,
  v1ProductionFirstStageValuesDryRunLivePrecheckService,
  v1ProductionEnvValuesApplyService,
  precheckV1Persistence,
  precheckV1AttachmentRetention,
  precheckV1DriverReadiness,
  precheckV1RuntimeReadiness,
  v1V2BoundaryService,
  v1ReleaseCandidateRefreshPrecheckService,
  v1ReleaseCandidateRefreshService,
}) {
  if (method !== "POST") return false;

  const definition = routeDefinitions.find(([pathname]) => pathname === url.pathname);
  if (!definition) return false;

  const [, permissionKey, handlerName, inputKind] = definition;
  if (!requireActionPermission(response, permissionContext, writeActionPermissions[permissionKey])) return true;

  const operatorId = getPermissionOperatorId(permissionContext, authContext, "SYSTEM");
  const input = { operatorId };
  if (inputKind === "body") input.body = body;
  if (inputKind === "request") input.request = request;
  if (inputKind === "workspace") input.workspace = workspace;

  const handlers = createSystemWriteHandlers({
    v1FieldEvidenceDraftService,
    v1FieldEvidenceStagingService,
    precheckV1ProductionEnv,
    runV1ProductionEnvSetup,
    v1LocalCommandRunnerService,
    precheckV1ProductionEnvIntake,
    precheckV1ProductionEnvFileAudit,
    precheckV1ProductionEnvFilePreview,
    v1ProductionGoLivePrecheckService,
    v1ProductionPersistenceEvidenceLiveRunService,
    v1ProductionFirstStageExecutionLiveRunService,
    v1ProductionFirstStageValuesDryRunLivePrecheckService,
    v1ProductionEnvValuesApplyService,
    precheckV1Persistence,
    precheckV1AttachmentRetention,
    precheckV1DriverReadiness,
    precheckV1RuntimeReadiness,
    v1V2BoundaryService,
    v1ReleaseCandidateRefreshPrecheckService,
    v1ReleaseCandidateRefreshService,
  });
  const result = await handlers[handlerName](input);
  sendJson(response, result.httpStatus, result.body);
  return true;
}

function createSystemWriteHandlers(dependencies) {
  const {
    v1FieldEvidenceDraftService,
    v1FieldEvidenceStagingService,
    precheckV1ProductionEnv,
    runV1ProductionEnvSetup,
    v1LocalCommandRunnerService,
    precheckV1ProductionEnvIntake,
    precheckV1ProductionEnvFileAudit,
    precheckV1ProductionEnvFilePreview,
    v1ProductionGoLivePrecheckService,
    v1ProductionPersistenceEvidenceLiveRunService,
    v1ProductionFirstStageExecutionLiveRunService,
    v1ProductionFirstStageValuesDryRunLivePrecheckService,
    v1ProductionEnvValuesApplyService,
    precheckV1Persistence,
    precheckV1AttachmentRetention,
    precheckV1DriverReadiness,
    precheckV1RuntimeReadiness,
    v1V2BoundaryService,
    v1ReleaseCandidateRefreshPrecheckService,
    v1ReleaseCandidateRefreshService,
  } = dependencies;

  return {
    generateFieldEvidenceDraftManifest: ({ operatorId }) =>
      v1FieldEvidenceDraftService.generateDraft({ operatorId }),
    validateFieldEvidenceDraftManifest: ({ operatorId }) =>
      v1FieldEvidenceDraftService.validateDraft({ operatorId }),
    stageFieldEvidenceRow: ({ body, operatorId }) =>
      v1FieldEvidenceStagingService.stageRow({ body, operatorId }),
    precheckProductionEnv: ({ operatorId }) => precheckV1ProductionEnv({ operatorId }),
    runProductionEnvSetup: ({ operatorId }) =>
      runV1ProductionEnvSetup({
        operatorId,
        runCommand: v1LocalCommandRunnerService.runV1ProductionEnvSetupCommand,
      }),
    precheckProductionEnvIntake: ({ operatorId }) => precheckV1ProductionEnvIntake({ operatorId }),
    precheckProductionEnvFileAudit: ({ operatorId }) => precheckV1ProductionEnvFileAudit({ operatorId }),
    precheckProductionEnvFilePreview: ({ operatorId }) => precheckV1ProductionEnvFilePreview({ operatorId }),
    precheckProductionGoLive: ({ request, operatorId }) =>
      v1ProductionGoLivePrecheckService.precheck({ request, operatorId }),
    runProductionPersistenceEvidence: ({ operatorId }) =>
      v1ProductionPersistenceEvidenceLiveRunService.run({ operatorId }),
    runProductionFirstStageExecution: ({ request, operatorId }) =>
      v1ProductionFirstStageExecutionLiveRunService.run({ request, operatorId }),
    precheckProductionFirstStageValuesDryRun: ({ operatorId }) =>
      v1ProductionFirstStageValuesDryRunLivePrecheckService.precheck({ operatorId }),
    runProductionFirstStageValuesApply: ({ operatorId }) =>
      v1ProductionEnvValuesApplyService.run({ operatorId }),
    precheckPersistence: ({ workspace, operatorId }) => precheckV1Persistence({ workspace, operatorId }),
    precheckAttachmentRetention: ({ workspace, operatorId }) =>
      precheckV1AttachmentRetention({ workspace, operatorId }),
    precheckDriverReadiness: ({ workspace, operatorId }) =>
      precheckV1DriverReadiness({ workspace, operatorId }),
    precheckRuntimeReadiness: ({ request, operatorId }) =>
      precheckV1RuntimeReadiness({ request, operatorId }),
    precheckV1V2Boundary: ({ operatorId }) => v1V2BoundaryService.precheck({ operatorId }),
    refreshV1V2ScopeBrief: ({ operatorId }) => v1V2BoundaryService.refreshScopeBrief({ operatorId }),
    precheckV1ReleaseCandidateRefresh: ({ request, operatorId }) =>
      v1ReleaseCandidateRefreshPrecheckService.precheck({ request, operatorId }),
    refreshV1ReleaseCandidate: ({ request, operatorId }) =>
      v1ReleaseCandidateRefreshService.refresh({ request, operatorId }),
  };
}
