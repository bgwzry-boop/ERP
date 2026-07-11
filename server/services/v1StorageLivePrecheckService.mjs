import { buildAttachmentV1Readiness } from "./fileRetentionV1ReadinessService.mjs";
import { buildSystemV1Readiness } from "./systemV1ReadinessService.mjs";

export function precheckV1Persistence({
  workspace,
  operatorId,
  now = () => new Date(),
  buildReadiness = buildSystemV1Readiness,
} = {}) {
  const checkedAt = now().toISOString();
  try {
    const readiness = buildReadiness({ workspace, operatorId });
    return {
      httpStatus: 200,
      body: projectV1PersistenceLivePrecheck(readiness, { checkedAt, operatorId }),
    };
  } catch {
    return {
      httpStatus: 500,
      body: buildPersistenceError({ checkedAt, operatorId }),
    };
  }
}

export async function precheckV1AttachmentRetention({
  workspace,
  operatorId,
  now = () => new Date(),
  buildReadiness = buildAttachmentV1Readiness,
} = {}) {
  const checkedAt = now().toISOString();
  try {
    const readiness = await buildReadiness({ workspace, operatorId });
    return {
      httpStatus: 200,
      body: projectV1AttachmentRetentionLivePrecheck(readiness, { checkedAt, operatorId }),
    };
  } catch {
    return {
      httpStatus: 500,
      body: buildAttachmentError({ checkedAt, operatorId }),
    };
  }
}

export function sanitizeV1LivePrecheckCriterion(item = {}) {
  const status = text(item.status) || "pending";
  const ready = status === "passed";
  return {
    key: text(item.key) || "runtime-readiness-criterion",
    label: text(item.label) || "运行时门禁项",
    status,
    statusLabel: ready ? "已通过" : "阻塞",
    ready,
    blocking: item.blocking !== false,
    detail: text(item.detail),
  };
}

function projectV1PersistenceLivePrecheck(readiness = {}, { checkedAt, operatorId } = {}) {
  const criteria = Array.isArray(readiness.criteria) ? readiness.criteria.map(sanitizeV1LivePrecheckCriterion) : [];
  const blockingCriteria = criteria.filter((item) => item.blocking && !item.ready);
  const repositoryGroups = Array.isArray(readiness.repositoryGroups)
    ? readiness.repositoryGroups.map(projectPersistenceRepositoryGroup).filter((item) => item.label)
    : [];
  const repositories = repositoryGroups.flatMap((group) => group.repositories);
  const passedCount = nonNegativeInteger(readiness.summary?.passedCount || criteria.filter((item) => item.ready).length);
  const totalCount = nonNegativeInteger(readiness.summary?.totalCount || criteria.length);
  const blockingCount = nonNegativeInteger(readiness.summary?.blockingCount || blockingCriteria.length);
  const productionReadyRepositoryCount = repositories.filter((item) => item.productionReady).length;
  const localRepositoryCount = repositories.filter((item) => item.localKind).length;
  const ready = readiness.ready === true && blockingCount === 0;
  const readinessLabel = totalCount ? `${passedCount}/${totalCount}` : text(readiness.summary?.label || "0/7");
  const nextActions = [
    ...blockingCriteria.slice(0, 3).map((item) => `${item.label}：${item.detail}`),
    localRepositoryCount
      ? "将 V1 仓储切到 PostgreSQL，将附件 / 对账导出切到对象存储后重新执行系统持久化预检。"
      : "",
  ].filter(Boolean);
  return {
    version: "p0-v1-persistence-live-precheck-v1",
    scope: "v1_persistence_live_precheck",
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt: text(readiness.checkedAt) || checkedAt || new Date().toISOString(),
    operatorId,
    summary: {
      label: ready ? "当前系统 V1 持久化已通过" : "当前系统 V1 持久化仍未通过",
      readinessLabel,
      passedCount,
      totalCount,
      blockingCount,
      blockerCount: blockingCriteria.length,
      passedLabel: readinessLabel,
      blockerLabel: `${blockingCriteria.length} 项`,
      repositoryGroupCount: repositoryGroups.length,
      repositoryGroupLabel: `${repositoryGroups.length} 组`,
      repositoryCount: repositories.length,
      repositoryLabel: `${productionReadyRepositoryCount}/${repositories.length}`,
      productionReadyRepositoryCount,
      localRepositoryCount,
      localRepositoryLabel: `${localRepositoryCount} 个`,
      localMemoryCount: repositories.filter((item) => item.kind === "local_memory").length,
      localJsonCount: repositories.filter((item) => item.kind === "local_json").length,
      localFsCount: repositories.filter((item) => item.kind === "local_fs").length,
      currentRuntime: true,
      requestBodyIgnored: true,
      localPersistenceAcceptedForV1: readiness.safeguards?.localPersistenceAcceptedForV1 === true,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
    criteria,
    blockingCriteria,
    repositoryGroups,
    nextActions: nextActions.slice(0, 5),
    nextAction: ready
      ? "当前系统 V1 持久化门禁已通过；仍需结合生产 env、现场证据、签字和 release candidate 复核。"
      : nextActions[0] || "先处理系统 V1 持久化阻塞，再重新跑 runtime readiness 和 release candidate。",
    safeguards: buildPersistenceSafeguards(readiness),
  };
}

function projectPersistenceRepositoryGroup(group = {}) {
  const repositories = Array.isArray(group.repositories)
    ? group.repositories.map(projectPersistenceRepository).filter((item) => item.label)
    : [];
  const ready = group.ready === true;
  const repositoryCount = nonNegativeInteger(group.repositoryCount || repositories.length);
  const localRepositoryCount = nonNegativeInteger(
    group.localRepositoryCount || repositories.filter((item) => item.localKind).length,
  );
  const productionReadyCount = nonNegativeInteger(
    group.productionReadyCount || repositories.filter((item) => item.productionReady).length,
  );
  return {
    key: text(group.key) || "system-persistence-group",
    label: text(group.label) || "系统持久化分组",
    status: ready ? "passed" : "pending",
    statusLabel: ready ? "已通过" : "阻塞",
    ready,
    acceptedByLocalPolicy: group.acceptedByLocalPolicy === true,
    repositoryCount,
    productionReadyCount,
    localRepositoryCount,
    localMemoryCount: nonNegativeInteger(
      group.localMemoryCount || repositories.filter((item) => item.kind === "local_memory").length,
    ),
    localJsonCount: nonNegativeInteger(
      group.localJsonCount || repositories.filter((item) => item.kind === "local_json").length,
    ),
    localFsCount: nonNegativeInteger(
      group.localFsCount || repositories.filter((item) => item.kind === "local_fs").length,
    ),
    repositoryLabel: `${productionReadyCount}/${repositoryCount}`,
    localRepositoryLabel: `${localRepositoryCount} 个`,
    nextAction: ready
      ? "该分组已满足 V1 持久化要求。"
      : "将该分组仍为 local_memory / local_json / local_fs 的仓储切到生产 PostgreSQL 或对象存储。",
    repositories,
  };
}

function projectPersistenceRepository(repository = {}) {
  const kind = text(repository.kind) || "unknown";
  const productionReady = repository.productionReady === true;
  return {
    key: text(repository.key) || "system-repository",
    label: text(repository.label) || "系统仓储",
    kind,
    kindLabel: persistenceKindLabel(kind),
    status: productionReady ? "passed" : "pending",
    statusLabel: productionReady ? "生产级" : "本地/内存",
    productionReady,
    localKind: repository.localKind === true,
  };
}

function persistenceKindLabel(kind) {
  return (
    {
      postgres: "PostgreSQL",
      object_storage: "对象存储",
      local_memory: "本地内存",
      local_json: "本地 JSON",
      local_fs: "本地文件",
    }[kind] || kind || "未知"
  );
}

function buildPersistenceSafeguards(readiness) {
  const safeguards = readiness?.safeguards && typeof readiness.safeguards === "object" ? readiness.safeguards : {};
  return {
    nonMutating: true,
    currentRuntime: true,
    requestBodyIgnored: true,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    rawSystemV1ReadinessIncluded: false,
    repositoryPayloadExposed: Boolean(safeguards.repositoryPayloadExposed),
    connectionStringExposed: Boolean(safeguards.connectionStringExposed),
    localPathExposed: Boolean(safeguards.localPathExposed),
    persistenceProfileConnectionStringExposed: Boolean(safeguards.persistenceProfileConnectionStringExposed),
    persistenceProfileLocalPathExposed: Boolean(safeguards.persistenceProfileLocalPathExposed),
    persistenceProfileSecretFieldsExposed: Boolean(safeguards.persistenceProfileSecretFieldsExposed),
    localPersistenceAcceptanceReferenceIncluded: false,
    environmentValuesIncluded: false,
    commandValuesIncluded: false,
    secretValuesIncluded: false,
  };
}

function projectV1AttachmentRetentionLivePrecheck(readiness = {}, { checkedAt, operatorId } = {}) {
  const criteria = Array.isArray(readiness.criteria) ? readiness.criteria.map(sanitizeV1LivePrecheckCriterion) : [];
  const blockingCriteria = criteria.filter((item) => item.blocking && !item.ready);
  const diagnostics = projectAttachmentDiagnostics(readiness.diagnostics);
  const storageMode = projectAttachmentStorageMode(readiness.storageMode);
  const passedCount = nonNegativeInteger(readiness.summary?.passedCount || criteria.filter((item) => item.ready).length);
  const totalCount = nonNegativeInteger(readiness.summary?.totalCount || criteria.length);
  const blockingCount = nonNegativeInteger(readiness.summary?.blockingCount || blockingCriteria.length);
  const ready = readiness.ready === true && blockingCount === 0;
  const readinessLabel = totalCount ? `${passedCount}/${totalCount}` : text(readiness.summary?.label || "0/5");
  const remainingV1Risks = stringList(readiness.remainingV1Risks).slice(0, 5);
  const nextActions = [
    ...blockingCriteria.slice(0, 3).map((item) => `${item.label}：${item.detail}`),
    storageMode.objectStorageLive
      ? ""
      : "将附件留档切到真实 OSS/S3/COS 对象存储，或完成本地留档 V1 特批签字后重新预检。",
  ].filter(Boolean);
  return {
    version: "p0-v1-attachment-retention-live-precheck-v1",
    scope: "v1_attachment_retention_live_precheck",
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt: text(readiness.checkedAt) || checkedAt || new Date().toISOString(),
    operatorId,
    summary: {
      label: ready ? "当前附件 V1 留档已通过" : "当前附件 V1 留档仍未通过",
      readinessLabel,
      passedCount,
      totalCount,
      blockingCount,
      blockerCount: blockingCriteria.length,
      passedLabel: readinessLabel,
      blockerLabel: `${blockingCriteria.length} 项`,
      currentRuntime: true,
      requestBodyIgnored: true,
      diagnosticReady: diagnostics.ready,
      diagnosticObjectCleanedUp: diagnostics.cleanupOk,
      configured: diagnostics.configured,
      missingConfigFieldCount: diagnostics.missingConfigFields.length,
      storageKind: storageMode.storageKind,
      storageProvider: storageMode.storageProvider,
      storageKindLabel: attachmentStorageKindLabel(storageMode.storageKind || storageMode.storageProvider),
      objectStorageLive: storageMode.objectStorageLive,
      localFsAcceptedForV1: storageMode.localFsAcceptedForV1,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
    criteria,
    blockingCriteria,
    diagnostics,
    storageMode,
    remainingV1Risks,
    nextActions: nextActions.slice(0, 5),
    nextAction: ready
      ? "当前附件 V1 留档门禁已通过；仍需结合现场证据、签字和 release candidate 复核。"
      : nextActions[0] || "先处理附件 V1 留档阻塞，再重新跑 runtime readiness 和 release candidate。",
    safeguards: buildAttachmentSafeguards(readiness),
  };
}

function projectAttachmentDiagnostics(diagnostics = {}) {
  return {
    status: text(diagnostics.status),
    ready: diagnostics.ready === true,
    storageKind: text(diagnostics.storageKind),
    storageProvider: text(diagnostics.storageProvider),
    configured: diagnostics.configured === true,
    missingConfigFields: stringList(diagnostics.missingConfigFields),
    writeOk: diagnostics.writeOk === true,
    readOk: diagnostics.readOk === true,
    digestOk: diagnostics.digestOk === true,
    cleanupOk: diagnostics.cleanupOk === true,
    secretFieldsExposed: diagnostics.secretFieldsExposed === true,
  };
}

function projectAttachmentStorageMode(storageMode = {}) {
  return {
    storageKind: text(storageMode.storageKind),
    storageProvider: text(storageMode.storageProvider),
    objectStorageLive: storageMode.objectStorageLive === true,
    localFsAcceptedForV1: storageMode.localFsAcceptedForV1 === true,
  };
}

function attachmentStorageKindLabel(kind) {
  const normalized = text(kind);
  return (
    {
      object_storage: "对象存储",
      local_fs: "本地文件",
      local_json: "本地 JSON",
      local_memory: "本地内存",
    }[normalized] || normalized || "未知"
  );
}

function buildAttachmentSafeguards(readiness) {
  const safeguards = readiness?.safeguards && typeof readiness.safeguards === "object" ? readiness.safeguards : {};
  return {
    nonMutating: true,
    currentRuntime: true,
    requestBodyIgnored: true,
    diagnosticObjectCreated: Boolean(readiness),
    diagnosticObjectCleanedUp: Boolean(safeguards.diagnosticObjectCleanedUp),
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    rawAttachmentV1ReadinessIncluded: false,
    rawStorageDiagnosticsIncluded: false,
    diagnosticObjectIdIncluded: false,
    diagnosticStorageKeyIncluded: false,
    digestValuesIncluded: false,
    localFsAcceptanceReferenceIncluded: false,
    payloadExposed: Boolean(safeguards.payloadExposed),
    secretFieldsExposed: Boolean(safeguards.secretFieldsExposed),
    environmentValuesIncluded: false,
    commandValuesIncluded: false,
    secretValuesIncluded: false,
    localPathExposed: false,
  };
}

function buildPersistenceError({ checkedAt, operatorId }) {
  return {
    version: "p0-v1-persistence-live-precheck-v1",
    scope: "v1_persistence_live_precheck",
    status: "error",
    ready: false,
    checkedAt,
    operatorId,
    summary: {
      label: "当前系统 V1 持久化预检失败",
      readinessLabel: "0/7",
      passedCount: 0,
      totalCount: 0,
      blockingCount: 0,
      blockerCount: 0,
      repositoryGroupCount: 0,
      repositoryCount: 0,
      productionReadyRepositoryCount: 0,
      localRepositoryCount: 0,
      localMemoryCount: 0,
      localJsonCount: 0,
      localFsCount: 0,
      currentRuntime: true,
      requestBodyIgnored: true,
      localPersistenceAcceptedForV1: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
    criteria: [],
    blockingCriteria: [],
    repositoryGroups: [],
    nextActions: [],
    nextAction: "检查当前 API workspace 初始化和系统 V1 readiness 是否可用后重试。",
    error: { code: "V1_PERSISTENCE_LIVE_PRECHECK_FAILED", message: "当前系统 V1 持久化预检失败。" },
    safeguards: buildPersistenceSafeguards(null),
  };
}

function buildAttachmentError({ checkedAt, operatorId }) {
  return {
    version: "p0-v1-attachment-retention-live-precheck-v1",
    scope: "v1_attachment_retention_live_precheck",
    status: "error",
    ready: false,
    checkedAt,
    operatorId,
    summary: {
      label: "当前附件 V1 留档预检失败",
      readinessLabel: "0/5",
      passedCount: 0,
      totalCount: 0,
      blockingCount: 0,
      blockerCount: 0,
      currentRuntime: true,
      requestBodyIgnored: true,
      diagnosticReady: false,
      diagnosticObjectCleanedUp: false,
      configured: false,
      missingConfigFieldCount: 0,
      storageKind: "",
      storageProvider: "",
      storageKindLabel: "未知",
      objectStorageLive: false,
      localFsAcceptedForV1: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
    criteria: [],
    blockingCriteria: [],
    diagnostics: {},
    storageMode: {},
    remainingV1Risks: [],
    nextActions: [],
    nextAction: "检查附件对象存储适配器和 V1 留档门禁是否可用后重试。",
    error: { code: "V1_ATTACHMENT_RETENTION_LIVE_PRECHECK_FAILED", message: "当前附件 V1 留档预检失败。" },
    safeguards: buildAttachmentSafeguards(null),
  };
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

function text(value) {
  return String(value ?? "").trim();
}

function stringList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return raw.map(text).filter(Boolean);
}
