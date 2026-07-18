import { sanitizeV1ProductionPersistenceEvidence } from "./v1ProductionStatusProjectionService.mjs";

export function createV1ProductionPersistenceEvidenceLiveRunService({
  runCommand,
  sanitizeEvidence = sanitizeV1ProductionPersistenceEvidence,
  sanitizeBlockingItem,
  now = () => new Date(),
} = {}) {
  requireFunction(runCommand, "runCommand");
  requireFunction(sanitizeEvidence, "sanitizeEvidence");
  requireFunction(sanitizeBlockingItem, "sanitizeBlockingItem");
  requireFunction(now, "now");

  return { buildResponseBody, run };

  async function run({ operatorId = "" } = {}) {
    const checkedAt = currentTimestamp();
    try {
      const report = await runCommand();
      const persistenceEvidence = sanitizeEvidence(report);
      const ready = persistenceEvidence.ready === true;
      return {
        httpStatus: 200,
        body: buildResponseBody({
          operatorId,
          checkedAt,
          status: persistenceEvidence.status || (ready ? "ready" : "blocked"),
          ready,
          report,
          nextAction:
            persistenceEvidence.nextActions[0] ||
            (ready
              ? "生产持久化留证已通过；继续用当前 API 做 runtime smoke，并回填生产持久化 / 对象存储现场证据。"
              : "按持久化留证阻塞项补齐真实 PostgreSQL、恢复验证库、对象存储或 production env 后重试。"),
        }),
      };
    } catch {
      return {
        httpStatus: 200,
        body: buildResponseBody({
          operatorId,
          checkedAt,
          status: "error",
          ready: false,
          report: {},
          blockingItems: [
            {
              key: "production-persistence-evidence-command-failed",
              label: "生产持久化留证执行失败",
              status: "error",
              detail: "服务端执行生产持久化留证失败，可能是 production env setup latest、安全 env 文件、脚本权限、PostgreSQL 客户端或对象存储探针异常。",
              nextAction: "由技术/管理检查服务端 production env setup、安全 env 文件和持久化留证脚本日志后重试；不要把真实路径或 env 值传给前端。",
            },
          ],
          nextAction: "检查服务端 production env setup、安全 env 文件、PostgreSQL / 对象存储探针环境后重试。",
          error: {
            code: "V1_PRODUCTION_PERSISTENCE_EVIDENCE_LIVE_RUN_FAILED",
            message: "生产持久化留证执行失败，命令输出已脱敏且未返回前端。",
          },
        }),
      };
    }
  }

  function buildResponseBody({
    operatorId = "",
    checkedAt = "",
    status = "",
    ready = false,
    report = {},
    blockingItems = [],
    nextAction = "",
    error = null,
  } = {}) {
    const persistenceEvidence = sanitizeEvidence(report);
    const sanitizedBlockingItems = Array.isArray(blockingItems)
      ? blockingItems.map(sanitizeBlockingItem).filter(Boolean)
      : [];
    const resultStatus = text(status) || (ready === true ? "ready" : persistenceEvidence.status || "blocked");
    const blockingCount = sanitizedBlockingItems.length + persistenceEvidence.summary.blockingCount;
    const label =
      ready === true
        ? "生产持久化留证通过"
        : resultStatus === "error"
          ? "生产持久化留证执行失败"
          : "生产持久化留证仍有阻塞";
    const resolvedNextAction =
      text(nextAction) ||
      persistenceEvidence.nextActions[0] ||
      (ready === true
        ? "保存持久化留证报告，继续执行生产 API runtime smoke 和第一阶段 closeout。"
        : "按持久化留证阻塞项补齐真实 PostgreSQL、恢复验证库、对象存储或 production env 后重试。");
    const body = {
      version: "p0-v1-production-persistence-evidence-live-run-v1",
      scope: "v1_production_persistence_evidence_live_run",
      status: resultStatus,
      ready: ready === true,
      checkedAt: persistenceEvidence.checkedAt || checkedAt || currentTimestamp(),
      operatorId,
      summary: {
        label,
        evidenceLabel: persistenceEvidence.summary.label,
        evidenceStatus: persistenceEvidence.status,
        passedCount: persistenceEvidence.summary.passedCount,
        totalCount: persistenceEvidence.summary.totalCount,
        passedLabel: persistenceEvidence.summary.passedLabel,
        blockingCount,
        blockerLabel: `${blockingCount} 项`,
        warningCount: persistenceEvidence.summary.warningCount,
        warningLabel: `${persistenceEvidence.summary.warningCount} 项`,
        envFileFromProductionSetup: persistenceEvidence.envFileFromProductionSetup === true,
        envFileSourceLabel: persistenceEvidence.envFileSourceLabel,
        persistenceEnvReady: persistenceEvidence.summary.persistenceEnvReady === true,
        postgresReady: persistenceEvidence.summary.postgresReady === true,
        postgresBackupRestoreReady: persistenceEvidence.summary.postgresBackupRestoreReady === true,
        objectStorageReady: persistenceEvidence.summary.objectStorageReady === true,
        objectStorageGovernanceReady: persistenceEvidence.summary.objectStorageGovernanceReady === true,
        requestBodyIgnored: true,
        envFilePathAccepted: false,
        envFilePathExposed: false,
        schemaMigrationApplyExecuted: false,
        restoreResetExplicitlyAllowed: false,
        restoreDatabaseMutated: persistenceEvidence.safeguards.postgresBackupRestoreRestoreDatabaseMutated === true,
        businessDataMutated: false,
        releaseCandidateRefreshed: false,
        goLiveSuiteRefreshed: false,
        physicalPrinterCalled: false,
        driverDeliveryStatusChanged: false,
      },
      persistenceEvidence,
      blockingItems: sanitizedBlockingItems,
      blockingStages: persistenceEvidence.blockingStages,
      serverConfigGuidance: buildServerConfigGuidance({ ready: ready === true, status: resultStatus }),
      nextActions: [resolvedNextAction, ...persistenceEvidence.nextActions].filter(Boolean).slice(0, 8),
      nextAction: resolvedNextAction,
      safeguards: {
        ...persistenceEvidence.safeguards,
        nonMutating: true,
        requestBodyIgnored: true,
        envFileReadFromServerProductionSetupOnly: true,
        envFilePathAcceptedFromRequest: false,
        envFilePathExposed: false,
        rawCommandIncluded: false,
        rawCommandStdoutIncluded: false,
        rawCommandStderrIncluded: false,
        rawPersistenceEvidenceIncluded: false,
        rawEnvFileIncluded: false,
        rawEnvLineIncluded: false,
        envValuesIncluded: false,
        environmentValuesIncluded: false,
        secretValuesIncluded: false,
        connectionStringIncluded: false,
        objectStorageEndpointIncluded: false,
        objectStorageBucketIncluded: false,
        objectStorageObjectKeyIncluded: false,
        signedUrlIncluded: false,
        rawBucketPolicyIncluded: false,
        commandValuesIncluded: false,
        localPathExposed: false,
        businessDataMutated: false,
        schemaMigrationApplyExecuted: false,
        restoreResetExplicitlyAllowed: false,
        physicalPrinterCalled: false,
        driverDeliveryStatusChanged: false,
        releaseCandidateRefreshed: false,
        goLiveSuiteRefreshed: false,
        declaresFullV1Complete: false,
      },
    };
    return error ? { ...body, error } : body;
  }

  function currentTimestamp() {
    const value = now();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new TypeError("production persistence evidence now() must return a valid Date");
    }
    return value.toISOString();
  }
}

function buildServerConfigGuidance({ ready = false, status = "blocked" } = {}) {
  return {
    label: "生产持久化留证使用服务端 production env setup 安全 env 文件",
    status: text(status) || "blocked",
    ready: ready === true,
    envFileSource: "production-env-setup-latest",
    primaryInput: "production env setup latest 安全 env 文件",
    acceptsFrontendPath: false,
    pathValueExposed: false,
    applyMigrationsByDefault: false,
    restoreResetAllowedByDefault: false,
    writesBusinessData: false,
    steps: [
      "先完成 production env setup，确认目标安全 env 文件已 git ignore、未跟踪、权限为 600。",
      "点击持久化留证，系统只复用服务端 setup 安全 env 文件，不接受浏览器路径、env 值或真实值片段。",
      "本入口汇总 env 文件审计、生产持久化 env 子集、迁移计划、PostgreSQL 预检、备份 / 恢复抽样、对象存储 live 预检和 bucket 治理检查。",
      "本入口默认不执行迁移 apply、不授权恢复验证库重置、不刷新 release candidate / go-live suite、不写业务数据。",
    ],
    verificationActions: [
      "node scripts/run-v1-production-persistence-evidence.mjs --use-production-env-setup-env-file --json",
      "POST /api/system/v1-production-persistence-evidence/live-run",
    ],
    safeguards: {
      frontendPathAccepted: false,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      schemaMigrationApplyExecuted: false,
      restoreResetAllowed: false,
      businessDataMutated: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
  };
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}

function text(value) {
  return String(value ?? "").trim();
}
