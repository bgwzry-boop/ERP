import { getConfiguredV1ProductionEnvValuesFileConfig } from "./v1ProductionEnvFileAuditService.mjs";
import { sanitizeV1ProductionEnvIntakeVerification } from "./v1ProductionStatusProjectionService.mjs";
import { sanitizeV1ProductionEnvValuesApplyReport } from "./v1ProductionEnvValuesApplyProjectionService.mjs";
import { createV1ProductionEnvValuesApplyStatusService } from "./v1ProductionEnvValuesApplyStatusService.mjs";
import { isV1ProductionEnvValuesDryRunProofFileBindingBlockedStatus } from "../v1ProductionEnvDryRunProofCore.mjs";

export function createV1ProductionEnvValuesApplyService({
  buildTargetSetupStatus,
  readStatusArtifacts,
  buildDryRunProofStatus,
  buildValuesFileAuditStatus,
  runApplyCommand,
  sanitizeBlockingItem,
  getValuesFileConfig = getConfiguredV1ProductionEnvValuesFileConfig,
  env = process.env,
  now = () => new Date(),
} = {}) {
  requireFunction(buildTargetSetupStatus, "buildTargetSetupStatus");
  requireFunction(readStatusArtifacts, "readStatusArtifacts");
  requireFunction(buildDryRunProofStatus, "buildDryRunProofStatus");
  requireFunction(buildValuesFileAuditStatus, "buildValuesFileAuditStatus");
  requireFunction(runApplyCommand, "runApplyCommand");
  requireFunction(sanitizeBlockingItem, "sanitizeBlockingItem");

  const statusService = createV1ProductionEnvValuesApplyStatusService({
    buildTargetSetupStatus,
    readStatusArtifacts,
    buildDryRunProofStatus,
    buildValuesFileAuditStatus,
    sanitizeBlockingItem,
    getValuesFileConfig,
    env,
    now,
  });

  return {
    run,
    buildGateStatus: statusService.buildGateStatus,
    buildResponseBody: statusService.buildResponseBody,
    buildServerConfigGuidance: statusService.buildServerConfigGuidance,
  };

  async function run({ operatorId } = {}) {
    const checkedAt = now().toISOString();
    const applyEnabled = isApplyEnabled(env);
    const valuesFileConfig = getValuesFileConfig(env);
    const configuredValuesFiles = Array.isArray(valuesFileConfig?.envFiles)
      ? valuesFileConfig.envFiles
      : [];
    const configuredValuesFileCount = configuredValuesFiles.length;
    const targetSetupStatus = buildTargetSetupStatus();
    const artifacts = readStatusArtifacts();
    const currentIntakeVerification = sanitizeV1ProductionEnvIntakeVerification(
      artifacts?.productionEnvIntakeVerification?.value,
    );
    const dryRunProofStatus = buildDryRunProofStatus(
      artifacts?.productionFirstStageExecution?.value,
      currentIntakeVerification,
      {
        valuesFileConfig,
        configuredValuesFileCount,
        checkFileBinding: configuredValuesFileCount === 1,
      },
    );
    const base = {
      operatorId,
      checkedAt,
      ready: false,
      applyEnabled,
      report: {},
      valuesFileConfig,
      configuredValuesFileCount,
      targetSetupStatus,
      dryRunProofStatus,
    };

    if (!applyEnabled) {
      return respond({
        ...base,
        status: "disabled",
        blockingItems: [blocker({
          key: "production-env-values-apply-disabled",
          label: "真实值正式合并未启用",
          detail: "API 进程未启用 ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED，正式合并不会写目标生产 env 草稿。",
          nextAction: "先完成真实值 dry-run并由负责人确认；确认后在API进程启用服务端正式合并开关，重启API再执行正式合并。",
        })],
        nextAction: "先完成真实值 dry-run；确认后由技术/管理启用服务端正式合并开关并重启 API。",
      });
    }
    if (configuredValuesFileCount === 0) {
      return respond({
        ...base,
        status: "not_configured",
        blockingItems: [blocker({
          key: "production-env-values-file-not-configured",
          label: "服务端真实值片段路径未配置",
          detail: "正式合并开关已启用，但API进程未配置服务端真实值片段，不能写目标生产env草稿。",
          nextAction: "在API进程配置一个安全未跟踪的真实值片段后重启API，再执行正式合并。",
        })],
        nextAction: "配置单个安全真实值片段路径后重启 API，再执行正式合并。",
      });
    }
    if (configuredValuesFileCount !== 1) {
      return respond({
        ...base,
        status: "blocked",
        blockingItems: [blocker({
          key: "production-env-values-file-count",
          label: "真实值片段文件数量不唯一",
          detail: "服务端values file配置解析到多个文件，无法判断要正式合并哪一个片段。",
          nextAction: "只保留一个安全未跟踪真实值片段路径，重启API后重试；不要从前端传路径。",
        })],
        nextAction: "把服务端真实值片段配置收敛为单个文件后重试。",
      });
    }
    if (targetSetupStatus?.ready !== true) {
      const targetBlockingItems = Array.isArray(targetSetupStatus?.blockingItems)
        ? targetSetupStatus.blockingItems
        : [];
      return respond({
        ...base,
        status: "target_not_ready",
        blockingItems: targetBlockingItems.length
          ? targetBlockingItems
          : [blocker({
              key: "production-env-setup-target-not-ready",
              label: "目标生产 env 安全草稿未就绪",
              detail: "正式合并开关和真实值片段已配置，但production env setup未确认目标安全env文件可写。",
              nextAction: "先重新运行production env setup，确认目标文件已git ignore、未跟踪且权限为600。",
            })],
        nextAction:
          targetSetupStatus?.nextAction ||
          "先重新运行 production env setup，确认目标安全 env 文件 ready 后再执行正式合并。",
      });
    }

    const valuesFileAuditStatus = buildValuesFileAuditStatus({
      valuesFileConfig,
      configuredValuesFileCount,
    });
    const withAudit = { ...base, valuesFileAuditStatus };
    if (valuesFileAuditStatus?.ready !== true) {
      const auditBlockingItems = Array.isArray(valuesFileAuditStatus?.blockingItems)
        ? valuesFileAuditStatus.blockingItems
        : [];
      return respond({
        ...withAudit,
        status: "audit_blocked",
        blockingItems: auditBlockingItems.length
          ? auditBlockingItems
          : [blocker({
              key: "production-env-values-file-audit-blocked",
              label: "真实值片段安全审计未通过",
              detail: "正式合并开关和目标env已就绪，但真实值片段未通过安全审计。",
              nextAction: "先修正真实值片段安全审计阻塞项，再重启API并重新执行正式合并。",
            })],
        nextAction:
          valuesFileAuditStatus?.nextAction ||
          "先修正真实值片段文件安全审计阻塞项，再重启 API 后执行正式合并。",
      });
    }
    if (dryRunProofStatus?.ready !== true) {
      const status = resolveDryRunBlockedStatus(dryRunProofStatus?.status);
      const bindingBlocked = status === "dry_run_file_binding_blocked";
      return respond({
        ...withAudit,
        status,
        blockingItems: [blocker({
          key: "production-env-values-dry-run-proof-not-ready",
          label: bindingBlocked ? "最近真实值 dry-run 片段绑定未通过" : "最近真实值 dry-run 证明未通过",
          detail: bindingBlocked
            ? "正式合并前，最近dry-run没有证明当前真实值片段指纹一致。"
            : "正式合并前，最近第一阶段latest未证明最小阻塞补值dry-run覆盖。",
          nextAction:
            dryRunProofStatus?.nextAction ||
            "先执行真实值 dry-run，确认最小阻塞补值覆盖并刷新上线状态，再重新执行正式合并。",
        })],
        nextAction:
          dryRunProofStatus?.nextAction ||
          "先执行真实值 dry-run，确认最小阻塞补值覆盖并刷新上线状态，再重新执行正式合并。",
      });
    }

    try {
      const report = await runApplyCommand({ valuesFile: configuredValuesFiles[0] });
      const sanitizedReport = sanitizeV1ProductionEnvValuesApplyReport(report);
      return respond({
        ...withAudit,
        status: sanitizedReport.status || (sanitizedReport.ready ? "ready" : "blocked"),
        ready: sanitizedReport.ready === true,
        report,
        nextAction: sanitizedReport.ready
          ? "真实值已合并且setup、生产env预检和intake校验均ready；下一步用该安全env文件重启生产API并继续第一阶段。"
          : sanitizedReport.nextActions[0] ||
            "真实值已按允许边界处理；继续按setup和intake校验结果补齐剩余生产env项。",
      });
    } catch {
      return respond({
        ...withAudit,
        status: "error",
        blockingItems: [
          {
            ...blocker({
              key: "production-first-stage-values-apply-command-failed",
              label: "真实值正式合并执行失败",
              detail: "服务端执行真实值白名单合并失败，可能是安全env文件、真实值片段或intake CSV未就绪。",
              nextAction: "由技术/管理检查服务端安全文件配置、权限和脱敏报告后重试；不要把真实路径或env值传给前端。",
            }),
            status: "error",
          },
        ],
        nextAction: "检查服务端安全 env 文件、真实值片段和 production env setup 报告后重试。",
        error: {
          code: "V1_PRODUCTION_FIRST_STAGE_VALUES_APPLY_LIVE_RUN_FAILED",
          message: "第一阶段真实值正式合并失败。",
        },
      });
    }
  }

  function respond(input) {
    return { httpStatus: 200, body: statusService.buildResponseBody(input) };
  }
}

function resolveDryRunBlockedStatus(status) {
  if (isV1ProductionEnvValuesDryRunProofFileBindingBlockedStatus(status)) {
    return "dry_run_file_binding_blocked";
  }
  if (status === "stale_or_expired") return "dry_run_expired";
  if (status === "stale_or_mismatched") return "dry_run_stale_or_mismatched";
  return "dry_run_not_ready";
}

function isApplyEnabled(env = {}) {
  const value = typeof env.ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED === "string"
    ? env.ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED.trim().toLowerCase()
    : "";
  return ["1", "true", "yes", "on"].includes(value);
}

function blocker({ key, label, detail, nextAction }) {
  return { key, label, status: "blocked", detail, nextAction };
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
