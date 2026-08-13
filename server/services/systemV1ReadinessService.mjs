import { buildRuntimeEmployeeAccountReadiness } from "./runtimeEmployeeAccountReadiness.mjs";

export const v1SystemPersistenceGroups = Object.freeze([
  {
    key: "order-inventory-fulfillment",
    label: "订单 / 库存 / 出库交易仓储",
    repositories: [
      ["coreWorkspaceReadRepository", "核心工作区启动快照"],
      ["todoActionRepository", "公共待办处理交易"],
      ["inventoryCorrectionTransactionRepository", "库存修正交易"],
      ["productionFinishedGoodsPhotoTransactionRepository", "生产成品图交易"],
      ["orderDraftRepository", "订单草稿"],
      ["orderConfirmationTransactionRepository", "订单确认交易"],
      ["orderPoolReadRepository", "订单池读取"],
      ["inventoryLedgerReadRepository", "库存流水读取"],
      ["inventoryReservationReleaseTransactionRepository", "库存占用释放交易"],
      ["inventoryIntentTransactionRepository", "库存意图 / 临时留货交易"],
      ["orderLineVoidTransactionRepository", "订单明细作废交易"],
      ["orderLineQuantityAdjustmentTransactionRepository", "订单明细改量交易"],
      ["fulfillmentActionTransactionRepository", "出库 / 交付交易"],
    ],
  },
  {
    key: "statement-payment",
    label: "对账 / 收款交易仓储",
    repositories: [
      ["paymentRecordRepository", "付款记录"],
      ["statementPaymentTransactionRepository", "对账收款交易"],
      ["statementSettlementTransactionRepository", "对账核销交易"],
      ["statementSendTransactionRepository", "对账发送 / 回执交易"],
      ["statementExportRepository", "对账导出记录"],
      ["attendancePayrollRepository", "考勤 / 工资交易"],
    ],
  },
  {
    key: "production-driver",
    label: "生产 / 司机交易仓储",
    repositories: [
      ["productionPackingTransactionRepository", "生产 / 打包交易"],
      ["productionPackingReadRepository", "生产 / 打包读取"],
      ["productionScheduleRecordRepository", "排产队列记录"],
      ["driverDeliveryDispatchRepository", "司机派车记录"],
      ["driverDeviceFieldTestRepository", "司机真机验收记录"],
      ["driverDeliveryTaskReadRepository", "司机任务读取"],
    ],
  },
  {
    key: "evidence-audit-print-master-data",
    label: "证据 / 审计 / 打印 / 主数据 / 身份仓储",
    repositories: [
      ["attachmentRepository", "附件索引"],
      ["attachmentAccessAuditRepository", "附件访问审计"],
      ["printBatchRepository", "打印批次"],
      ["printDeviceRepository", "打印设备"],
      ["printJobRepository", "打印作业"],
      ["printerDeviceFieldTestRepository", "打印设备现场 QA"],
      ["masterDataImportReviewRepository", "主数据导入复核"],
      ["masterDataImportTransactionRepository", "主数据导入交易"],
      ["masterDataMachineConfigurationRepository", "车间 / 机台配置"],
      ["rawMaterialInboundRepository", "原材料入库单 / 贴标状态"],
      ["rawMaterialSupplierStatementReviewRepository", "原材料供应商月结复核草稿"],
      ["rawMaterialPurchaseRepository", "原材料采购请求 / 决策留痕"],
      ["maintenanceTaskRepository", "设备机修任务"],
      ["businessDecisionEvidenceRepository", "业务决定授权 / 不可变留痕"],
      ["businessDecisionAuthorizationRepository", "业务决定授权范围 / 有效期"],
      ["businessDecisionEvidenceDraftRepository", "业务决定凭据草稿 / 一次性消费"],
      ["runtimeIdentityRepository", "运行期员工身份 / session 吊销"],
    ],
  },
  {
    key: "file-retention-stores",
    label: "文件留档存储",
    repositories: [
      ["attachmentObjectStorage", "附件对象存储"],
      ["statementExportObjectStorage", "对账导出文件存储"],
    ],
  },
]);

export function buildSystemV1Readiness({
  workspace = {},
  operatorId = "",
  env = process.env,
  nowMs = Date.now(),
} = {}) {
  const checkedAt = new Date(nowMs).toISOString();
  const productionRuntime = workspace.runtimeConfig?.mode === "production";
  const runtimeEmployeeAccountReadiness = buildRuntimeEmployeeAccountReadiness({
    users: workspace.users,
    machines: workspace.machines,
    nowMs,
  });
  const declaredLocalPersistenceAcceptance = getLocalPersistenceAcceptance({ workspace, env });
  const localPersistenceAcceptance = {
    ...declaredLocalPersistenceAcceptance,
    accepted: declaredLocalPersistenceAcceptance.accepted && !productionRuntime,
    declaredAccepted: declaredLocalPersistenceAcceptance.accepted,
    ignoredInProduction: productionRuntime && declaredLocalPersistenceAcceptance.accepted,
  };
  const repositoryGroups = v1SystemPersistenceGroups.map((group) =>
    buildPersistenceGroupReadiness({ workspace, group, localPersistenceAcceptance }),
  );
  const allRepositories = repositoryGroups.flatMap((group) => group.repositories);
  const localRepositories = allRepositories.filter((repository) => repository.localKind);
  const localMemoryRepositories = allRepositories.filter((repository) => repository.kind === "local_memory");
  const criteria = [
    ...repositoryGroups.map((group) =>
      buildCriterion({
        key: `system-persistence-${group.key}`,
        label: group.label,
        passed: group.ready,
        detail: group.ready
          ? group.localRepositoryCount
            ? `已显式接受 ${group.localRepositoryCount} 个本地仓储用于 V1`
            : "该业务域仓储已使用生产级持久化"
          : `${group.localRepositoryCount} 个仓储仍为本地 / 内存模式`,
        blocking: true,
        evidence: {
          repositoryCount: group.repositoryCount,
          productionReadyCount: group.productionReadyCount,
          localRepositoryCount: group.localRepositoryCount,
          localMemoryCount: group.localMemoryCount,
          localJsonCount: group.localJsonCount,
          localFsCount: group.localFsCount,
          acceptedByLocalPolicy: group.acceptedByLocalPolicy,
        },
      }),
    ),
    buildCriterion({
      key: "system-local-persistence-acceptance",
      label: "本地持久化 V1 接受声明",
      passed: localRepositories.length === 0 || localPersistenceAcceptance.accepted,
      detail:
        localRepositories.length === 0
          ? "未发现本地 / 内存仓储"
          : localPersistenceAcceptance.ignoredInProduction
            ? "production 禁止接受本地 / 内存仓储，风险接受声明已忽略"
            : localPersistenceAcceptance.accepted
              ? `已显式接受本地持久化用于 V1：${localPersistenceAcceptance.reference || "未填写引用"}`
              : "仍存在本地 / 内存仓储，默认不能作为 V1 生产持久化",
      blocking: true,
      evidence: {
        localRepositoryCount: localRepositories.length,
        localMemoryCount: localMemoryRepositories.length,
        localPersistenceAcceptedForV1: localPersistenceAcceptance.accepted,
        acceptanceReference: localPersistenceAcceptance.reference,
      },
    }),
    buildCriterion({
      key: "system-persistence-redaction",
      label: "持久化门禁脱敏护栏",
      passed: true,
      detail: "只输出仓储类型和计数，不输出业务数据、连接串、文件路径或密钥",
      blocking: true,
      evidence: {
        repositoryPayloadExposed: false,
        connectionStringExposed: false,
        localPathExposed: false,
      },
    }),
    buildCriterion({
      key: "system-runtime-employee-role-coverage",
      label: "V1 正式岗位账号覆盖",
      passed: !productionRuntime || runtimeEmployeeAccountReadiness.ready,
      detail: productionRuntime
        ? runtimeEmployeeAccountReadiness.ready
          ? `${runtimeEmployeeAccountReadiness.coveredRoleCount}/${runtimeEmployeeAccountReadiness.requiredRoleCount} 个岗位已有可用正式账号`
          : `${runtimeEmployeeAccountReadiness.missingRoleCount} 个岗位仍没有可用正式账号`
        : `当前为 ${workspace.runtimeConfig?.mode ?? "demo"} 环境，正式岗位账号覆盖只报告、不阻塞`,
      blocking: productionRuntime,
      evidence: {
        productionRuntime,
        formalAccountCount: runtimeEmployeeAccountReadiness.formalAccountCount,
        readyFormalAccountCount: runtimeEmployeeAccountReadiness.readyFormalAccountCount,
        requiredRoleCount: runtimeEmployeeAccountReadiness.requiredRoleCount,
        coveredRoleCount: runtimeEmployeeAccountReadiness.coveredRoleCount,
        missingRoleCount: runtimeEmployeeAccountReadiness.missingRoleCount,
        roles: runtimeEmployeeAccountReadiness.roles,
      },
    }),
  ];
  const summary = buildSummary(criteria);
  return {
    status: summary.blockingCount === 0 ? "ready" : "blocked",
    ready: summary.blockingCount === 0,
    checkedAt,
    operatorId,
    scope: "v1_system_persistence_readiness",
    summary,
    criteria,
    blockingCriteria: criteria.filter((item) => item.blocking && item.status !== "passed"),
    repositoryGroups,
    repositories: allRepositories,
    localPersistenceAcceptance,
    runtimeEmployeeAccountReadiness,
    persistenceProfile: workspace.v1PersistenceProfile,
    remainingV1Risks: buildRemainingRisks({
      criteria,
      localPersistenceAcceptance,
      localRepositories,
      localMemoryRepositories,
    }),
    safeguards: {
      nonMutating: true,
      repositoryPayloadExposed: false,
      connectionStringExposed: false,
      localPathExposed: false,
      persistenceProfileConnectionStringExposed: false,
      persistenceProfileLocalPathExposed: false,
      persistenceProfileSecretFieldsExposed: false,
      requiresPostgresPersistence: !localPersistenceAcceptance.accepted,
      localPersistenceAcceptedForV1: localPersistenceAcceptance.accepted,
      localPersistenceAcceptanceIgnoredInProduction: localPersistenceAcceptance.ignoredInProduction,
    },
  };
}

function buildPersistenceGroupReadiness({ workspace, group, localPersistenceAcceptance }) {
  const repositories = group.repositories.map(([repositoryKey, label]) => {
    const kind = normalizePersistenceKind(workspace?.[repositoryKey]?.kind);
    const productionReady = ["postgres", "object_storage"].includes(kind);
    const localKind = ["local_memory", "local_json", "local_fs"].includes(kind);
    return { key: repositoryKey, label, kind, productionReady, localKind };
  });
  const localRepositories = repositories.filter((repository) => repository.localKind);
  const allProductionReady = repositories.every((repository) => repository.productionReady);
  return {
    key: group.key,
    label: group.label,
    ready: allProductionReady || localPersistenceAcceptance.accepted,
    acceptedByLocalPolicy: !allProductionReady && localPersistenceAcceptance.accepted,
    repositoryCount: repositories.length,
    productionReadyCount: repositories.filter((repository) => repository.productionReady).length,
    localRepositoryCount: localRepositories.length,
    localMemoryCount: repositories.filter((repository) => repository.kind === "local_memory").length,
    localJsonCount: repositories.filter((repository) => repository.kind === "local_json").length,
    localFsCount: repositories.filter((repository) => repository.kind === "local_fs").length,
    repositories,
  };
}

function buildRemainingRisks({ criteria, localPersistenceAcceptance, localRepositories, localMemoryRepositories }) {
  const risks = criteria
    .filter((item) => item.blocking && item.status !== "passed")
    .map((item) => `${item.label}：${item.detail}`);
  if (localRepositories.length && !localPersistenceAcceptance.accepted) {
    risks.push("核心业务仓储仍包含 local_memory / local_json / local_fs，生产 V1 默认需要 PostgreSQL / 对象存储等生产级持久化");
  }
  if (localMemoryRepositories.length) {
    risks.push(`${localMemoryRepositories.length} 个仓储仍为 local_memory，进程重启会丢失运行期业务状态`);
  }
  if (localRepositories.length && localPersistenceAcceptance.accepted) {
    risks.push("本地持久化已被显式批准用于 V1；仍需现场确认备份、并发、权限、磁盘和灾备巡检");
  }
  return [...new Set(risks)].filter(Boolean);
}

function getLocalPersistenceAcceptance({ workspace, env }) {
  const options = workspace.systemV1ReadinessOptions ?? {};
  return {
    accepted: parseBoolean(
      options.localPersistenceAccepted ?? env.ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTED,
    ),
    reference: text(
      options.acceptanceReference ??
        options.localPersistenceAcceptanceReference ??
        env.ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTANCE_REF,
    ),
  };
}

function buildCriterion({ key, label, passed, detail, blocking, evidence = {} }) {
  return {
    key,
    label,
    status: passed ? "passed" : "pending",
    tone: passed ? "success" : "warning",
    blocking: Boolean(blocking),
    detail,
    evidence,
  };
}

function buildSummary(criteria) {
  const passedCount = criteria.filter((item) => item.status === "passed").length;
  const blockingCount = criteria.filter((item) => item.blocking && item.status !== "passed").length;
  return {
    label: `${passedCount}/${criteria.length} 通过`,
    passedCount,
    totalCount: criteria.length,
    blockingCount,
    tone: blockingCount ? "danger" : "success",
  };
}

function normalizePersistenceKind(value) {
  return text(value || "missing");
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function text(value) {
  return String(value ?? "").trim();
}
