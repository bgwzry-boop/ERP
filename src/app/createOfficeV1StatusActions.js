import {
  createOfficeAttachment,
  createV1FieldEvidenceAttachmentInput,
  createV1FieldEvidenceAttachmentListInput,
  createV1SignoffBoundaryAttachmentInput,
  createV1SignoffBoundaryAttachmentListInput,
  listOfficeAttachments,
} from "../services/officeAttachmentApiClient.js";
import {
  getOfficePrintDriverCupsDiagnostics,
  getOfficePrintDriverSpoolDiagnostics,
  getOfficePrintDriverV1Readiness,
} from "../services/officePrintDriverConfigApiClient.js";
import {
  applyOfficeV1ProductionFirstStageValues,
  generateOfficeV1FieldEvidenceDraftManifest,
  precheckOfficeV1AttachmentRetention,
  precheckOfficeV1DriverReadiness,
  precheckOfficeV1Persistence,
  precheckOfficeV1ProductionEnv,
  precheckOfficeV1ProductionEnvIntake,
  precheckOfficeV1ProductionEnvFileAudit,
  precheckOfficeV1ProductionEnvFilePreview,
  precheckOfficeV1ProductionFirstStageValuesDryRun,
  precheckOfficeV1ProductionGoLive,
  precheckOfficeV1ReleaseCandidateRefresh,
  precheckOfficeV1RuntimeReadiness,
  precheckOfficeV1V2Boundary,
  refreshOfficeV1V2ScopeBrief,
  refreshOfficeV1ReleaseCandidate,
  runOfficeV1ProductionEnvSetup,
  runOfficeV1ProductionFirstStageExecution,
  runOfficeV1ProductionPersistenceEvidence,
  stageOfficeV1FieldEvidenceIntakeRow,
  validateOfficeV1FieldEvidenceDraftManifest,
} from "../services/officeV1GoLiveStatusApiClient.js";

const defaultApi = {
  applyOfficeV1ProductionFirstStageValues,
  createOfficeAttachment,
  generateOfficeV1FieldEvidenceDraftManifest,
  getOfficePrintDriverCupsDiagnostics,
  getOfficePrintDriverSpoolDiagnostics,
  getOfficePrintDriverV1Readiness,
  listOfficeAttachments,
  precheckOfficeV1AttachmentRetention,
  precheckOfficeV1DriverReadiness,
  precheckOfficeV1Persistence,
  precheckOfficeV1ProductionEnv,
  precheckOfficeV1ProductionEnvIntake,
  precheckOfficeV1ProductionEnvFileAudit,
  precheckOfficeV1ProductionEnvFilePreview,
  precheckOfficeV1ProductionFirstStageValuesDryRun,
  precheckOfficeV1ProductionGoLive,
  precheckOfficeV1ReleaseCandidateRefresh,
  precheckOfficeV1RuntimeReadiness,
  precheckOfficeV1V2Boundary,
  refreshOfficeV1V2ScopeBrief,
  refreshOfficeV1ReleaseCandidate,
  runOfficeV1ProductionEnvSetup,
  runOfficeV1ProductionFirstStageExecution,
  runOfficeV1ProductionPersistenceEvidence,
  stageOfficeV1FieldEvidenceIntakeRow,
  validateOfficeV1FieldEvidenceDraftManifest,
};

const attachmentPreview = (attachment) => ({
  attachmentId: attachment.attachmentId,
  fileName: attachment.fileName,
  status: attachment.status,
  ownerId: attachment.ownerId,
});

const attachmentListPreview = (item) => ({
  attachmentId: item.attachmentId,
  fileName: item.fileName,
  status: item.status,
  fileType: item.fileType,
  createdAt: item.createdAt,
  hasContent: item.hasContent === true,
});

export function createOfficeV1StatusActions({
  actionSetters,
  api = defaultApi,
  authState,
  currentUserId,
  now = () => new Date().toISOString(),
  readFileAsDataUrl,
  refreshV1GoLiveStatus,
  setToast,
}) {
  const commonInput = () => ({ authState, operatorId: currentUserId });

  async function runStatusAction({
    failureLabel,
    input = {},
    operation,
    resultKey,
    setAction,
    successMessage,
  }) {
    setAction((current) => ({ ...current, loading: true, error: "" }));
    const result = await operation({ ...commonInput(), ...input });
    const actionResult = result[resultKey];
    setAction({
      loading: false,
      error: result.error?.message || "",
      result: actionResult,
      lastSyncedAt: now(),
    });
    setToast(actionResult
      ? successMessage(actionResult, result)
      : `${failureLabel}失败：${result.error?.message || "API 不可用"}。`);
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  const generateV1FieldEvidenceDraftManifest = () => runStatusAction({
    setAction: actionSetters.fieldEvidenceDraft,
    operation: api.generateOfficeV1FieldEvidenceDraftManifest,
    resultKey: "draftResult",
    failureLabel: "现场证据 manifest 草稿生成",
    successMessage: (draft, result) => {
      const suffix = result.blocked
        ? result.error?.requiredPermission
          ? `缺少权限 ${result.error.requiredPermission}`
          : result.error?.message || "仍需修正 CSV"
        : `证据 ${draft.summary?.evidenceProgress || "0/40"}，签字 ${draft.summary?.signoffProgress || "0/6"}`;
      return `现场证据 manifest 草稿：${draft.statusLabel || "草稿已处理"}；${suffix}。`;
    },
  });

  const validateV1FieldEvidenceDraftManifest = () => runStatusAction({
    setAction: actionSetters.fieldEvidenceValidation,
    operation: api.validateOfficeV1FieldEvidenceDraftManifest,
    resultKey: "validationResult",
    failureLabel: "现场证据 manifest 草稿校验",
    successMessage: (validation, result) => {
      const suffix = result.blocked
        ? result.error?.requiredPermission
          ? `缺少权限 ${result.error.requiredPermission}`
          : result.error?.message || "草稿需修正"
        : `证据 ${validation.summary?.evidenceProgress || "0/40"}，签字 ${validation.summary?.signoffProgress || "0/6"}`;
      return `现场证据 manifest 草稿校验：${validation.statusLabel || "校验完成"}；${suffix}。`;
    },
  });

  const precheckV1ProductionEnv = () => runStatusAction({
    setAction: actionSetters.productionEnvPrecheck,
    operation: api.precheckOfficeV1ProductionEnv,
    resultKey: "precheckResult",
    failureLabel: "当前生产 env 预检",
    successMessage: (precheck) => `当前生产 env 预检：${precheck.statusLabel || "预检完成"}；通过 ${precheck.summary?.readinessLabel || "0/10"}，阻塞 ${precheck.summary?.blockerLabel || "0 项"}。`,
  });

  const runV1ProductionEnvSetup = () => runStatusAction({
    setAction: actionSetters.productionEnvSetup,
    operation: api.runOfficeV1ProductionEnvSetup,
    resultKey: "setupResult",
    failureLabel: "生产 env 安全草稿 setup",
    successMessage: (setup) => `生产 env 安全草稿：${setup.statusLabel || "setup 完成"}；env ${setup.summary?.envPreflightLabel || "0/0"}，修正 ${setup.summary?.remainingFixItemCount ?? 0} 项。`,
  });

  const precheckV1ProductionEnvIntake = () => runStatusAction({
    setAction: actionSetters.productionEnvIntakePrecheck,
    operation: api.precheckOfficeV1ProductionEnvIntake,
    resultKey: "precheckResult",
    failureLabel: "生产 env 真实值校验",
    successMessage: (precheck) => `生产 env 真实值校验：${precheck.statusLabel || "校验完成"}；清单 ${precheck.summary?.configuredLabel || "0/0"}，最小补值 ${precheck.summary?.minimumBlockingLabel || "0/0"}，阻塞 ${precheck.summary?.blockerLabel || "0 项"}。`,
  });

  const precheckV1ProductionEnvFileAudit = () => runStatusAction({
    setAction: actionSetters.productionEnvFileAuditPrecheck,
    operation: api.precheckOfficeV1ProductionEnvFileAudit,
    resultKey: "precheckResult",
    failureLabel: "env 文件审计预检",
    successMessage: (precheck) => `env 文件审计预检：${precheck.statusLabel || "预检完成"}；配置文件 ${precheck.summary?.configuredEnvFileCount ?? 0} 个，阻塞 ${precheck.summary?.blockingLabel || "0 项"}，警告 ${precheck.summary?.warningLabel || "0 项"}。`,
  });

  const stageV1FieldEvidenceIntakeRow = (row) => runStatusAction({
    setAction: actionSetters.fieldEvidenceStageRow,
    operation: api.stageOfficeV1FieldEvidenceIntakeRow,
    resultKey: "stageResult",
    input: { row },
    failureLabel: "现场草稿行保存",
    successMessage: (stage, result) => {
      const suffix = result.blocked
        ? result.error?.requiredPermission
          ? `缺少权限 ${result.error.requiredPermission}`
          : result.error?.message || "草稿行需修正"
        : `证据 ${stage.summary?.evidenceProgress || "0/40"}，签字 ${stage.summary?.signoffProgress || "0/6"}`;
      return `现场草稿行：${stage.summary?.rowLabel || "现场证据行"} ${stage.statusLabel || "草稿已处理"}；${suffix}。`;
    },
  });

  const precheckV1RuntimeReadiness = () => runStatusAction({
    setAction: actionSetters.runtimeReadinessPrecheck,
    operation: api.precheckOfficeV1RuntimeReadiness,
    resultKey: "precheckResult",
    failureLabel: "当前运行时总门禁预检",
    successMessage: (precheck) => `当前运行时总门禁预检：${precheck.statusLabel || "预检完成"}；通过 ${precheck.summary?.readinessLabel || "0/11"}，阻塞 ${precheck.summary?.blockerLabel || "0 项"}。`,
  });

  const precheckV1ProductionEnvFilePreview = () => runStatusAction({
    setAction: actionSetters.productionEnvFilePreviewPrecheck,
    operation: api.precheckOfficeV1ProductionEnvFilePreview,
    resultKey: "precheckResult",
    failureLabel: "env 文件应用预检",
    successMessage: (precheck) => `env 文件应用预检：${precheck.statusLabel || "预检完成"}；通过 ${precheck.summary?.readinessLabel || "0/10"}，阻塞 ${precheck.summary?.blockerLabel || "0 项"}，${precheck.summary?.appliedInMemory ? "已做内存预检" : "未读取变量"}。`,
  });

  const precheckV1ProductionGoLive = () => runStatusAction({
    setAction: actionSetters.productionGoLivePrecheck,
    operation: api.precheckOfficeV1ProductionGoLive,
    resultKey: "precheckResult",
    failureLabel: "生产上线组合预检",
    successMessage: (precheck) => `生产上线组合预检：${precheck.statusLabel || "预检完成"}；阶段 ${precheck.summary?.readinessLabel || "0/4"}，阻塞 ${precheck.summary?.blockerLabel || "0 项"}。`,
  });

  const precheckV1ProductionFirstStageValuesDryRun = () => runStatusAction({
    setAction: actionSetters.productionFirstStageValuesDryRun,
    operation: api.precheckOfficeV1ProductionFirstStageValuesDryRun,
    resultKey: "precheckResult",
    failureLabel: "第一阶段真实值 dry-run",
    successMessage: (precheck) => `第一阶段真实值 dry-run：${precheck.statusLabel || "预检完成"}；${precheck.summary?.valuesFilePathConfigured ? "片段已配置" : "片段未配置"}，最小补值 ${precheck.dryRunCoverage?.minimumBlockingLabel || "0/0"}，预计 env ${precheck.dryRunCoverage?.envPreflightLabel || "0/0"}。`,
  });

  const runV1ProductionFirstStageExecution = () => runStatusAction({
    setAction: actionSetters.productionFirstStageExecution,
    operation: api.runOfficeV1ProductionFirstStageExecution,
    resultKey: "executionResult",
    failureLabel: "第一阶段执行",
    successMessage: (execution) => `第一阶段执行：${execution.statusLabel || "执行完成"}；步骤 ${execution.summary?.passedLabel || "0/0"}，阻塞 ${execution.summary?.blockerLabel || "0 项"}。`,
  });

  const runV1ProductionPersistenceEvidence = () => runStatusAction({
    setAction: actionSetters.productionPersistenceEvidence,
    operation: api.runOfficeV1ProductionPersistenceEvidence,
    resultKey: "evidenceResult",
    failureLabel: "生产持久化留证",
    successMessage: (evidence) => `生产持久化留证：${evidence.statusLabel || "执行完成"}；阶段 ${evidence.summary?.passedLabel || "0/0"}，阻塞 ${evidence.summary?.blockerLabel || "0 项"}。`,
  });

  const applyV1ProductionFirstStageValues = () => runStatusAction({
    setAction: actionSetters.productionFirstStageValuesApply,
    operation: api.applyOfficeV1ProductionFirstStageValues,
    resultKey: "applyResult",
    failureLabel: "第一阶段真实值正式合并",
    successMessage: (apply) => `第一阶段真实值正式合并：${apply.statusLabel || "执行完成"}；${apply.summary?.applyEnabled ? "开关已启用" : "开关未启用"}，写入变量 ${apply.summary?.appliedVariableCount ?? 0}，env ${apply.summary?.envPreflightLabel || "0/0"}。`,
  });

  const precheckV1Persistence = () => runStatusAction({
    setAction: actionSetters.persistencePrecheck,
    operation: api.precheckOfficeV1Persistence,
    resultKey: "precheckResult",
    failureLabel: "系统持久化预检",
    successMessage: (precheck) => `系统持久化预检：${precheck.statusLabel || "预检完成"}；通过 ${precheck.summary?.readinessLabel || "0/7"}，生产仓储 ${precheck.summary?.repositoryLabel || "0/0"}，本地 ${precheck.summary?.localRepositoryLabel || "0 个"}。`,
  });

  const precheckV1AttachmentRetention = () => runStatusAction({
    setAction: actionSetters.attachmentRetentionPrecheck,
    operation: api.precheckOfficeV1AttachmentRetention,
    resultKey: "precheckResult",
    failureLabel: "附件留档预检",
    successMessage: (precheck) => `附件留档预检：${precheck.statusLabel || "预检完成"}；通过 ${precheck.summary?.readinessLabel || "0/5"}，存储 ${precheck.summary?.storageKindLabel || "未知"}，对象存储 ${precheck.summary?.objectStorageLive ? "是" : "否"}，清理 ${precheck.summary?.diagnosticObjectCleanedUp ? "是" : "否"}。`,
  });

  const precheckV1PrintSpool = () => runStatusAction({
    setAction: actionSetters.printSpoolPrecheck,
    operation: api.getOfficePrintDriverSpoolDiagnostics,
    resultKey: "diagnostics",
    failureLabel: "打印 spool 预检",
    successMessage: (diagnostics) => `打印 spool 预检：${diagnostics.ready ? "已通过" : "仍未通过"}；写入 ${diagnostics.writeOk ? "是" : "否"}，待打回读 ${diagnostics.pendingPollOk ? "是" : "否"}，完成回读 ${diagnostics.completedPollOk ? "是" : "否"}，清理 ${diagnostics.cleanupOk ? "是" : "否"}。`,
  });

  const precheckV1PrintCups = () => runStatusAction({
    setAction: actionSetters.printCupsPrecheck,
    operation: api.getOfficePrintDriverCupsDiagnostics,
    resultKey: "diagnostics",
    failureLabel: "CUPS 队列预检",
    successMessage: (diagnostics) => `CUPS 队列预检：${diagnostics.ready ? "已通过" : "仍未通过"}；队列配置 ${diagnostics.cupsPrinterConfigured ? "是" : "否"}，白名单 ${diagnostics.cupsPrinterAllowed ? "是" : "否"}，状态命令 ${diagnostics.cupsStatusCommandRunnable ? "是" : "否"}。`,
  });

  const precheckV1PrintReadiness = () => runStatusAction({
    setAction: actionSetters.printReadinessPrecheck,
    operation: api.getOfficePrintDriverV1Readiness,
    resultKey: "readiness",
    failureLabel: "打印 V1 门禁预检",
    successMessage: (readiness) => {
      const devices = Array.isArray(readiness.deviceReadiness) ? readiness.deviceReadiness : [];
      return `打印 V1 门禁预检：${readiness.ready ? "已通过" : "仍未通过"}；${readiness.summary?.label || "0/0 通过"}，${readiness.summary?.blockingCount ?? 0} 项阻塞，设备 ${devices.filter((item) => item.ready).length}/${devices.length}。`;
    },
  });

  const precheckV1DriverReadiness = () => runStatusAction({
    setAction: actionSetters.driverReadinessPrecheck,
    operation: api.precheckOfficeV1DriverReadiness,
    resultKey: "precheckResult",
    failureLabel: "司机真机门禁预检",
    successMessage: (precheck) => `司机真机门禁预检：${precheck.statusLabel || "预检完成"}；通过 ${precheck.summary?.readinessLabel || "0/6"}，阻塞 ${precheck.summary?.blockerLabel || "0 项"}，原生 ${precheck.summary?.nativeSupportedLabel || "0/2"}，任务 ${precheck.summary?.deliveryTaskCount ?? 0} 条。`,
  });

  async function uploadAttachment({
    buildInput,
    failureCode,
    failureLabel,
    failureMessage,
    file,
    item,
    remark,
    setAction,
    successMessage,
  }) {
    setAction((current) => ({ ...current, loading: true, error: "" }));
    const contentDataUrl = await readFileAsDataUrl(file);
    const attachmentInput = buildInput({
      ...item,
      operatorId: currentUserId,
      remark,
      file: file ? { name: file.name, type: file.type, size: file.size, contentDataUrl } : null,
    });
    const result = await api.createOfficeAttachment({ authState, ...attachmentInput });
    const registered = result.source === "api" && /^ATT-/.test(result.attachment?.attachmentId || "");
    const normalizedResult = registered
      ? { source: result.source, attachment: result.attachment, blocked: false, error: null }
      : {
          source: result.source,
          attachment: result.attachment ?? null,
          blocked: true,
          error: result.error ?? { code: failureCode, message: failureMessage },
        };
    setAction({
      loading: false,
      error: normalizedResult.error?.message || "",
      result: registered ? attachmentPreview(normalizedResult.attachment) : null,
      lastSyncedAt: now(),
    });
    setToast(registered
      ? successMessage(normalizedResult.attachment)
      : `${failureLabel}：${normalizedResult.error?.message || "API 不可用"}。`);
    return normalizedResult;
  }

  const uploadV1FieldEvidenceAttachment = ({ evidenceItem, file, remark = "" }) => uploadAttachment({
    buildInput: createV1FieldEvidenceAttachmentInput,
    failureCode: "V1_FIELD_EVIDENCE_ATTACHMENT_NOT_BACKEND_REGISTERED",
    failureLabel: "现场证据附件登记失败",
    failureMessage: "证据附件必须由后端登记为 ATT-* 后，才能写入 V1 现场证据草稿。",
    file,
    item: { evidenceItem },
    remark,
    setAction: actionSetters.fieldEvidenceAttachment,
    successMessage: (attachment) => `现场证据附件已登记：${attachment.attachmentId}，可写入证据草稿。`,
  });

  const uploadV1SignoffBoundaryAttachment = ({ signoffItem, file, remark = "" }) => uploadAttachment({
    buildInput: createV1SignoffBoundaryAttachmentInput,
    failureCode: "V1_SIGNOFF_BOUNDARY_ATTACHMENT_NOT_BACKEND_REGISTERED",
    failureLabel: "签字 / 边界附件登记失败",
    failureMessage: "签字 / 边界附件必须由后端登记为 ATT-* 后，才能作为 V1 留档引用。",
    file,
    item: { signoffItem },
    remark,
    setAction: actionSetters.signoffBoundaryAttachment,
    successMessage: (attachment) => `签字 / 边界附件已登记：${attachment.attachmentId}，可填入备注留档。`,
  });

  async function listAttachments({
    buildInput,
    failureCode,
    failureMessage,
    item,
    listLabel,
    setAction,
  }) {
    setAction((current) => ({ ...current, loading: true, error: "" }));
    const listInput = buildInput({ ...item, operatorId: currentUserId });
    const result = await api.listOfficeAttachments({ authState, ...listInput });
    const backendItems = result.source === "api"
      ? (result.items || []).filter((attachment) => /^ATT-/.test(attachment.attachmentId || ""))
      : [];
    const normalizedResult = result.source === "api"
      ? {
          source: result.source,
          blocked: false,
          ownerId: listInput.ownerId,
          items: backendItems,
          total: Number.isFinite(result.total) ? result.total : backendItems.length,
          error: null,
        }
      : {
          source: result.source,
          blocked: true,
          ownerId: listInput.ownerId,
          items: [],
          total: 0,
          error: result.error ?? { code: failureCode, message: failureMessage },
        };
    setAction({
      loading: false,
      error: normalizedResult.error?.message || "",
      ownerId: normalizedResult.ownerId,
      result: normalizedResult.blocked
        ? null
        : {
            ownerId: normalizedResult.ownerId,
            total: normalizedResult.total,
            items: normalizedResult.items.slice(0, 5).map(attachmentListPreview),
          },
      lastSyncedAt: now(),
    });
    setToast(normalizedResult.blocked
      ? `${listLabel}查询失败：${normalizedResult.error?.message || "API 不可用"}。`
      : `${listLabel}已查询：${backendItems.length} 个可复用后端附件。`);
    return normalizedResult;
  }

  const listV1FieldEvidenceAttachments = ({ evidenceItem }) => listAttachments({
    buildInput: createV1FieldEvidenceAttachmentListInput,
    failureCode: "V1_FIELD_EVIDENCE_ATTACHMENT_LIST_NOT_BACKEND_REGISTERED",
    failureMessage: "证据附件列表必须从后端 API 读取，不能使用本地附件降级结果。",
    item: { evidenceItem },
    listLabel: "现场证据附件",
    setAction: actionSetters.fieldEvidenceAttachmentList,
  });

  const listV1SignoffBoundaryAttachments = ({ signoffItem }) => listAttachments({
    buildInput: createV1SignoffBoundaryAttachmentListInput,
    failureCode: "V1_SIGNOFF_BOUNDARY_ATTACHMENT_LIST_NOT_BACKEND_REGISTERED",
    failureMessage: "签字 / 边界附件列表必须从后端 API 读取，不能使用本地附件降级结果。",
    item: { signoffItem },
    listLabel: "签字 / 边界附件",
    setAction: actionSetters.signoffBoundaryAttachmentList,
  });

  const precheckV1V2Boundary = () => runStatusAction({
    setAction: actionSetters.v1V2BoundaryPrecheck,
    operation: api.precheckOfficeV1V2Boundary,
    resultKey: "precheckResult",
    failureLabel: "V1/V2 边界预检",
    successMessage: (precheck) => `V1/V2 边界预检：${precheck.statusLabel || "预检完成"}；边界 ${precheck.summary?.boundaryLabel || "待确认"}，V1 必做 ${precheck.summary?.v1MustContinueLabel || "0 项"}，V2 差异 ${precheck.summary?.v2DifferenceLabel || "0 项"}，阻塞 ${precheck.summary?.blockerLabel || "0 项"}。`,
  });

  const refreshV1V2ScopeBrief = () => runStatusAction({
    setAction: actionSetters.v1V2ScopeBriefRefresh,
    operation: api.refreshOfficeV1V2ScopeBrief,
    resultKey: "refreshResult",
    failureLabel: "V1/V2 差异摘要刷新",
    successMessage: (refresh) => `V1/V2 差异摘要：${refresh.statusLabel || "已刷新"}；V1 必做 ${refresh.summary?.v1MustContinueLabel || "0 项"}，V2 差异 ${refresh.summary?.v2DifferenceLabel || "0 项"}，摘要 ${refresh.summary?.scopeBriefRefreshed ? "已刷新" : "未刷新"}。`,
  });

  const precheckV1ReleaseCandidateRefresh = () => runStatusAction({
    setAction: actionSetters.releaseCandidateRefreshPrecheck,
    operation: api.precheckOfficeV1ReleaseCandidateRefresh,
    resultKey: "precheckResult",
    failureLabel: "刷新候选预检",
    successMessage: (precheck) => `刷新候选预检：${precheck.statusLabel || "预检完成"}；证据 ${precheck.summary?.evidenceProgress || "0/40"}，生产 env ${precheck.summary?.productionEnvPreflightLabel || "0/10"}，阻塞 ${precheck.summary?.blockerLabel || "0 项"}。`,
  });

  const refreshV1ReleaseCandidate = () => runStatusAction({
    setAction: actionSetters.releaseCandidateRefresh,
    operation: api.refreshOfficeV1ReleaseCandidate,
    resultKey: "refreshResult",
    failureLabel: "刷新候选",
    successMessage: (refresh) => `刷新候选：${refresh.statusLabel || "刷新完成"}；${refresh.summary?.releaseGateLabel || refresh.summary?.label || "发布候选"}，阻塞 ${refresh.summary?.blockerLabel || "0 项"}，候选 ${refresh.summary?.releaseCandidateRefreshed ? "已刷新" : "未刷新"}。`,
  });

  return {
    applyV1ProductionFirstStageValues,
    generateV1FieldEvidenceDraftManifest,
    listV1FieldEvidenceAttachments,
    listV1SignoffBoundaryAttachments,
    precheckV1AttachmentRetention,
    precheckV1DriverReadiness,
    precheckV1Persistence,
    precheckV1PrintCups,
    precheckV1PrintReadiness,
    precheckV1PrintSpool,
    precheckV1ProductionEnv,
    precheckV1ProductionEnvFileAudit,
    precheckV1ProductionEnvFilePreview,
    precheckV1ProductionEnvIntake,
    precheckV1ProductionFirstStageValuesDryRun,
    precheckV1ProductionGoLive,
    precheckV1ReleaseCandidateRefresh,
    precheckV1RuntimeReadiness,
    precheckV1V2Boundary,
    refreshV1ReleaseCandidate,
    refreshV1V2ScopeBrief,
    runV1ProductionEnvSetup,
    runV1ProductionFirstStageExecution,
    runV1ProductionPersistenceEvidence,
    stageV1FieldEvidenceIntakeRow,
    uploadV1FieldEvidenceAttachment,
    uploadV1SignoffBoundaryAttachment,
    validateV1FieldEvidenceDraftManifest,
  };
}
