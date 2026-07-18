#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { redactRuntimeSmokeText } from "./run-v1-production-runtime-smoke.mjs";
import { validateV1FieldEvidenceManifest } from "./v1FieldEvidenceManifest.mjs";

const defaultPersistenceEvidencePath = ".erp-local-storage/v1-production-persistence-evidence/latest.json";
const defaultRuntimeSmokePath = ".erp-local-storage/v1-production-runtime-smoke/latest.json";
const defaultTodoLoadPrecheckPath = ".erp-local-storage/v1-todo-load-precheck/latest.json";
const defaultFieldEvidenceManifestPath = "docs/development/v1-field-evidence-manifest.template.json";
const defaultOutputDir = ".erp-local-storage/v1-production-first-stage-closeout";
const defaultMaxAgeHours = 72;
const requiredProductionPersistenceEvidenceKeys = [
  "postgres_migration_applied",
  "postgres_backup_configured",
  "postgres_restore_sample_checked",
  "postgres_roles_checked",
  "production_env_preflight_10_of_10",
];
const requiredObjectStorageEvidenceKeys = [
  "attachment_bucket_policy_checked",
  "attachment_upload_readback_checked",
  "attachment_signed_url_checked",
  "attachment_access_audit_checked",
  "statement_export_storage_checked",
];

if (isCliEntrypoint()) runCli();

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = buildProductionFirstStageCloseout({
      persistenceEvidencePath: options.persistenceEvidencePath,
      runtimeSmokePath: options.runtimeSmokePath,
      todoLoadPrecheckPath: options.todoLoadPrecheckPath,
      fieldEvidenceManifestPath: options.fieldEvidenceManifestPath,
      maxAgeHours: options.maxAgeHours,
      now: new Date(),
    });
    const outputReport = redactCloseoutReport(
      options.write
        ? {
            ...report,
            artifacts: writeProductionFirstStageCloseoutArtifacts(report, { outputDir: options.outputDir }),
          }
        : report,
    );
    if (options.json) {
      process.stdout.write(`${JSON.stringify(outputReport, null, 2)}\n`);
    } else {
      process.stdout.write(formatProductionFirstStageCloseout(outputReport));
    }
    process.exit(report.ready ? 0 : 2);
  } catch (error) {
    const message = redactCloseoutText(error?.message || String(error));
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 production first-stage closeout failed: ${message}\n`);
    }
    process.exit(1);
  }
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args) {
  const options = {
    persistenceEvidencePath: defaultPersistenceEvidencePath,
    runtimeSmokePath: defaultRuntimeSmokePath,
    todoLoadPrecheckPath: defaultTodoLoadPrecheckPath,
    fieldEvidenceManifestPath: defaultFieldEvidenceManifestPath,
    outputDir: defaultOutputDir,
    maxAgeHours: defaultMaxAgeHours,
    write: true,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--no-write") {
      options.write = false;
      continue;
    }
    if (arg === "--persistence-evidence-json") {
      options.persistenceEvidencePath = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--runtime-smoke-json") {
      options.runtimeSmokePath = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--todo-load-precheck-json") {
      options.todoLoadPrecheckPath = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--field-evidence-manifest") {
      options.fieldEvidenceManifestPath = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--max-age-hours") {
      options.maxAgeHours = parseNonNegativeNumber(readValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function parseNonNegativeNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be zero or a positive number.`);
  return number;
}

function helpText() {
  return [
    "Usage: node scripts/run-v1-production-first-stage-closeout.mjs [options]",
    "",
    "Options:",
    "  --persistence-evidence-json <path>  Redacted persistence evidence JSON. Defaults to .erp-local-storage/v1-production-persistence-evidence/latest.json.",
    "  --runtime-smoke-json <path>         Redacted runtime smoke JSON. Defaults to .erp-local-storage/v1-production-runtime-smoke/latest.json.",
    "  --todo-load-precheck-json <path>    Redacted production todo-load precheck JSON. Defaults to .erp-local-storage/v1-todo-load-precheck/latest.json.",
    "  --field-evidence-manifest <path>    Filled V1 field evidence manifest. Defaults to the pending template.",
    "  --max-age-hours <n>                 Maximum report age. Defaults to 72; use 0 to disable freshness blocking.",
    "  --output-dir <path>                 Write redacted closeout files. Defaults to .erp-local-storage/v1-production-first-stage-closeout.",
    "  --no-write                          Do not write JSON / Markdown closeout files.",
    "  --json                              Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  First-stage production env / persistence evidence is ready for owner closeout",
    "  1  Runner/read/write error",
    "  2  Closeout is readable but still blocked",
    "",
    "This closeout does not connect to external services. It validates three redacted evidence reports plus production_persistence and object_storage field evidence groups.",
  ].join("\n");
}

function buildProductionFirstStageCloseout({
  persistenceEvidencePath = defaultPersistenceEvidencePath,
  runtimeSmokePath = defaultRuntimeSmokePath,
  todoLoadPrecheckPath = defaultTodoLoadPrecheckPath,
  fieldEvidenceManifestPath = defaultFieldEvidenceManifestPath,
  maxAgeHours = defaultMaxAgeHours,
  checkedAt = new Date().toISOString(),
  now = new Date(checkedAt),
} = {}) {
  const persistenceArtifact = readEvidenceArtifact({
    artifactKey: "production-persistence-evidence",
    label: "生产持久化首阶段留证",
    filePath: persistenceEvidencePath,
    expectedScope: "v1_production_persistence_evidence",
  });
  const runtimeArtifact = readEvidenceArtifact({
    artifactKey: "production-runtime-smoke",
    label: "生产 API 运行态 smoke",
    filePath: runtimeSmokePath,
    expectedScope: "v1_production_runtime_smoke",
  });
  const todoLoadArtifact = readEvidenceArtifact({
    artifactKey: "todo-load-precheck",
    label: "生产待办只读容量预检查",
    filePath: todoLoadPrecheckPath,
    expectedScope: "v1_todo_load_precheck",
  });
  const manifestArtifact = readEvidenceArtifact({
    artifactKey: "field-evidence-manifest",
    label: "现场证据 manifest",
    filePath: fieldEvidenceManifestPath,
  });
  const manifestValidation = manifestArtifact.readable
    ? validateV1FieldEvidenceManifest(manifestArtifact.report)
    : buildMissingManifestValidation(manifestArtifact);
  const productionPersistenceGroup = getEvidenceGroup(manifestValidation, "production_persistence");
  const objectStorageGroup = getEvidenceGroup(manifestValidation, "object_storage");
  const stages = [
    buildArtifactStage(persistenceArtifact),
    buildArtifactStage(runtimeArtifact),
    buildArtifactStage(todoLoadArtifact),
    buildReportReadyStage({
      artifact: persistenceArtifact,
      key: "persistence-evidence-ready",
      label: "持久化首阶段证据 ready",
      readyDetail: "生产 env 文件、PostgreSQL 预检和对象存储 live 预检汇总证据已 ready。",
      blockedDetail: "生产持久化首阶段留证未 ready。",
    }),
    buildReportReadyStage({
      artifact: runtimeArtifact,
      key: "runtime-smoke-ready",
      label: "生产 API 运行态 smoke ready",
      readyDetail: "API 已能用同一份安全 env 启动并读回 PostgreSQL / 对象存储 profile。",
      blockedDetail: "生产 API 运行态 smoke 未 ready。",
    }),
    buildReportReadyStage({
      artifact: todoLoadArtifact,
      key: "todo-load-precheck-ready",
      label: "生产待办只读容量预检查 ready",
      readyDetail: "正式 runtime 会话下的待办只读容量、延迟、错误率和服务端合同均已达标。",
      blockedDetail: "生产待办只读容量预检查未 ready。",
    }),
    buildTodoLoadProductionTargetStage(todoLoadArtifact),
    buildFreshnessStage({ artifacts: [persistenceArtifact, runtimeArtifact, todoLoadArtifact], maxAgeHours, now }),
    buildManifestArtifactStage({ manifestArtifact, manifestValidation }),
    buildRequiredEvidenceGroupStage({
      key: "first-stage-production-persistence-evidence",
      label: "生产持久化现场证据",
      group: productionPersistenceGroup,
      requiredKeys: requiredProductionPersistenceEvidenceKeys,
      readyDetail: "生产库迁移、备份、恢复演练、账号权限和 env 预检现场证据均已填写。",
      blockedDetail: "production_persistence 仍有现场证据未完成。",
    }),
    buildRequiredEvidenceGroupStage({
      key: "first-stage-object-storage-evidence",
      label: "对象存储现场证据",
      group: objectStorageGroup,
      requiredKeys: requiredObjectStorageEvidenceKeys,
      readyDetail: "bucket 策略、附件读回、签名 URL、访问审计和对账导出现场证据均已填写。",
      blockedDetail: "object_storage 仍有现场证据未完成。",
    }),
    buildSafeguardsStage({ persistenceArtifact, runtimeArtifact, todoLoadArtifact, manifestValidation }),
  ];
  const passedCount = stages.filter((item) => item.status === "passed").length;
  const blockingCount = stages.length - passedCount;
  const ready = blockingCount === 0;
  const report = {
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt,
    scope: "v1_production_first_stage_closeout",
    summary: {
      label: `${passedCount}/${stages.length} 通过`,
      passedCount,
      totalCount: stages.length,
      blockingCount,
      warningCount: 0,
    },
    stages,
    blockingStages: stages.filter((item) => item.status !== "passed"),
    evidenceSummary: {
      persistenceEvidence: summarizeArtifact(persistenceArtifact),
      runtimeSmoke: summarizeArtifact(runtimeArtifact),
      todoLoadPrecheck: summarizeTodoLoadArtifact(todoLoadArtifact),
      fieldEvidenceManifest: summarizeManifestArtifact(manifestArtifact, manifestValidation),
      productionPersistenceEvidence: summarizeEvidenceGroup(productionPersistenceGroup, requiredProductionPersistenceEvidenceKeys),
      objectStorageEvidence: summarizeEvidenceGroup(objectStorageGroup, requiredObjectStorageEvidenceKeys),
      maxAgeHours,
      sourceArtifactPathsIncluded: false,
      rawReportsIncluded: false,
      rawEvidenceRefsIncluded: false,
    },
    safeguards: {
      nonMutating: true,
      externalServiceCalledByCloseout: false,
      sourceReportsRequired: true,
      fieldEvidenceManifestRequired: true,
      productionTodoLoadPrecheckRequired: true,
      rawSourceReportsIncluded: false,
      rawEvidenceRefsIncluded: false,
      sourceArtifactPathExposed: false,
      envValuesExposed: false,
      databaseUrlExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      commandArgsExposed: false,
      payloadExposed: false,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
      declaresFullV1Complete: false,
    },
    nextActions: buildNextActions(stages, ready),
  };
  return redactCloseoutReport(report);
}

function buildMissingManifestValidation(manifestArtifact) {
  return {
    scope: "v1_field_evidence_manifest_validation",
    status: "invalid",
    ready: false,
    schemaValid: false,
    schemaErrors: [manifestArtifact.error || "manifest is unavailable"],
    groups: [],
    blockers: [],
    safeguards: {
      evidenceRefsRedacted: true,
      possibleSensitiveEvidenceRefCount: 0,
      rawEvidenceRefsIncludedInReport: false,
    },
  };
}

function readEvidenceArtifact({ artifactKey, label, filePath, expectedScope }) {
  const fullPath = resolve(filePath);
  if (!existsSync(fullPath)) {
    return {
      artifactKey,
      label,
      expectedScope,
      available: false,
      readable: false,
      error: `Evidence JSON not found: ${filePath}`,
      rawPathIncluded: false,
    };
  }
  try {
    const stats = statSync(fullPath);
    if (!stats.isFile()) throw new Error("Evidence path is not a file.");
    const parsed = JSON.parse(readFileSync(fullPath, "utf8"));
    return {
      artifactKey,
      label,
      expectedScope,
      available: true,
      readable: true,
      report: parsed,
      bytes: stats.size,
      rawPathIncluded: false,
    };
  } catch (error) {
    return {
      artifactKey,
      label,
      expectedScope,
      available: true,
      readable: false,
      error: error?.message || String(error),
      rawPathIncluded: false,
    };
  }
}

function buildArtifactStage(artifact) {
  const scope = cleanString(artifact.report?.scope);
  const passed = artifact.readable === true && (!artifact.expectedScope || scope === artifact.expectedScope);
  return {
    key: `${artifact.artifactKey}-artifact`,
    label: `${artifact.label}文件`,
    status: passed ? "passed" : "blocked",
    ready: passed,
    detail: passed
      ? `${artifact.label} JSON 可读取且 scope 正确。`
      : artifact.readable
        ? `${artifact.label} JSON scope 不匹配。`
        : artifact.error || `${artifact.label} JSON 不可读取。`,
    summary: {
      label: passed ? "1/1 通过" : "0/1 通过",
      passedCount: passed ? 1 : 0,
      totalCount: 1,
      blockingCount: passed ? 0 : 1,
      warningCount: 0,
    },
    evidence: {
      available: artifact.available === true,
      readable: artifact.readable === true,
      scope,
      expectedScope: artifact.expectedScope,
      byteCount: numberOrZero(artifact.bytes),
      rawPathIncluded: false,
    },
    nextAction: passed ? "继续检查报告 ready 状态。" : `先生成 ${artifact.label} latest.json 后重跑 closeout。`,
  };
}

function buildReportReadyStage({ artifact, key, label, readyDetail, blockedDetail }) {
  const report = artifact.report || {};
  const ready = artifact.readable === true && report.ready === true && cleanString(report.status) === "ready";
  return {
    key,
    label,
    status: ready ? "passed" : "blocked",
    ready,
    detail: ready ? readyDetail : blockedDetail,
    summary: {
      label: cleanString(report.summary?.label) || (ready ? "ready" : "blocked"),
      passedCount: numberOrZero(report.summary?.passedCount),
      totalCount: numberOrZero(report.summary?.totalCount),
      blockingCount: ready ? 0 : Math.max(1, numberOrZero(report.summary?.blockingCount)),
      warningCount: numberOrZero(report.summary?.warningCount),
    },
    evidence: {
      sourceStatus: cleanString(report.status || "unavailable"),
      sourceReady: report.ready === true,
      checkedAt: cleanString(report.checkedAt),
      rawReportIncluded: false,
    },
    blockingItems: sanitizeBlockingStages(report.blockingStages),
    nextAction: ready
      ? "继续检查证据时效和安全护栏。"
      : firstAction(report.nextActions) || `先处理 ${label} 阻塞项，再重跑 closeout。`,
  };
}

function buildFreshnessStage({ artifacts, maxAgeHours, now }) {
  if (Number(maxAgeHours) <= 0) {
    return {
      key: "evidence-freshness",
      label: "证据时效",
      status: "passed",
      ready: true,
      detail: "证据时效检查已按 --max-age-hours 0 关闭。",
      summary: { label: "时效检查关闭", passedCount: 1, totalCount: 1, blockingCount: 0, warningCount: 0 },
      evidence: { maxAgeHours: 0 },
      nextAction: "继续检查安全护栏。",
    };
  }
  const checks = artifacts.map((artifact) => {
    const checkedAt = cleanString(artifact.report?.checkedAt);
    const parsed = checkedAt ? new Date(checkedAt) : null;
    const valid = parsed instanceof Date && !Number.isNaN(parsed.getTime());
    const ageHours = valid ? Math.max(0, (now.getTime() - parsed.getTime()) / 3600000) : Number.POSITIVE_INFINITY;
    return {
      key: artifact.artifactKey,
      label: artifact.label,
      checkedAt,
      valid,
      ageHours: Number.isFinite(ageHours) ? Number(ageHours.toFixed(2)) : null,
      status: valid && ageHours <= maxAgeHours ? "passed" : "pending",
    };
  });
  const blockingItems = checks.filter((item) => item.status !== "passed");
  return {
    key: "evidence-freshness",
    label: "证据时效",
    status: blockingItems.length === 0 ? "passed" : "blocked",
    ready: blockingItems.length === 0,
    detail:
      blockingItems.length === 0
        ? `${checks.length} 份第一阶段证据均在 ${maxAgeHours} 小时内。`
        : `${blockingItems.length} 份第一阶段证据缺少 checkedAt 或超过 ${maxAgeHours} 小时。`,
    summary: {
      label: `${checks.length - blockingItems.length}/${checks.length} 通过`,
      passedCount: checks.length - blockingItems.length,
      totalCount: checks.length,
      blockingCount: blockingItems.length,
      warningCount: 0,
    },
    checks,
    blockingItems: blockingItems.map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      detail: item.valid ? `证据年龄 ${item.ageHours} 小时，超过上限。` : "缺少有效 checkedAt。",
    })),
    nextAction:
      blockingItems.length === 0
        ? "继续检查安全护栏。"
        : "重新生成过期或缺少时间戳的第一阶段证据后重跑 closeout。",
  };
}

function buildTodoLoadProductionTargetStage(todoLoadArtifact) {
  const target = todoLoadArtifact.report?.target || {};
  const passed =
    todoLoadArtifact.readable === true &&
    target.apiPathValidated === true &&
    target.embeddedCredentials === false &&
    target.addressExposed === false &&
    target.loopback === false &&
    cleanString(target.protocol) === "https";
  return {
    key: "todo-load-production-target",
    label: "待办容量真实生产目标",
    status: passed ? "passed" : "blocked",
    ready: passed,
    detail: passed
      ? "容量预检查来自非本机 HTTPS 长驻 API，且报告未暴露目标地址或内嵌凭据。"
      : "容量预检查必须来自非本机 HTTPS 长驻生产 API；本机实验室报告不能作为第一阶段签收证据。",
    summary: {
      label: passed ? "1/1 通过" : "0/1 通过",
      passedCount: passed ? 1 : 0,
      totalCount: 1,
      blockingCount: passed ? 0 : 1,
      warningCount: 0,
    },
    evidence: {
      protocol: cleanString(target.protocol),
      loopback: target.loopback === true,
      apiPathValidated: target.apiPathValidated === true,
      embeddedCredentials: target.embeddedCredentials === true,
      addressExposed: target.addressExposed === true,
    },
    nextAction: passed
      ? "继续检查报告时效和安全护栏。"
      : "对真实非本机 HTTPS 长驻生产 API 显式运行待办只读容量预检查后重跑 closeout。",
  };
}

function buildManifestArtifactStage({ manifestArtifact, manifestValidation }) {
  const passed = manifestArtifact.readable === true && manifestValidation.schemaValid === true;
  return {
    key: "field-evidence-manifest-artifact",
    label: "现场证据 manifest 文件",
    status: passed ? "passed" : "blocked",
    ready: passed,
    detail: passed ? "现场证据 manifest 可读取且 schema 正确。" : manifestArtifact.error || "现场证据 manifest 不可读取或 schema 错误。",
    summary: {
      label: passed ? "1/1 通过" : "0/1 通过",
      passedCount: passed ? 1 : 0,
      totalCount: 1,
      blockingCount: passed ? 0 : 1,
      warningCount: 0,
    },
    evidence: {
      available: manifestArtifact.available === true,
      readable: manifestArtifact.readable === true,
      schemaValid: manifestValidation.schemaValid === true,
      schemaErrorCount: Array.isArray(manifestValidation.schemaErrors) ? manifestValidation.schemaErrors.length : 0,
      wholeManifestReady: manifestValidation.ready === true,
      rawPathIncluded: false,
    },
    nextAction: passed ? "继续检查生产持久化和对象存储现场证据组。" : "先修正现场证据 manifest 格式后重跑 closeout。",
  };
}

function buildRequiredEvidenceGroupStage({ key, label, group, requiredKeys, readyDetail, blockedDetail }) {
  const itemMap = new Map((group?.items || []).map((item) => [item.key, item]));
  const checks = requiredKeys.map((itemKey) => {
    const item = itemMap.get(itemKey);
    const passed =
      Boolean(item) &&
      ["passed", "accepted"].includes(cleanString(item.status)) &&
      item.evidenceRefFilled === true;
    return {
      key: itemKey,
      label: cleanString(item?.label || itemKey),
      status: passed ? "passed" : "pending",
      ready: passed,
      detail: passed ? "状态已通过且 evidenceRef 已填写。" : "需要状态为 passed/accepted，并填写 evidenceRef。",
    };
  });
  const blockingItems = checks.filter((item) => item.status !== "passed");
  return {
    key,
    label,
    status: blockingItems.length === 0 ? "passed" : "blocked",
    ready: blockingItems.length === 0,
    detail: blockingItems.length === 0 ? readyDetail : `${blockedDetail} 缺 ${blockingItems.length}/${checks.length} 项。`,
    summary: {
      label: `${checks.length - blockingItems.length}/${checks.length} 通过`,
      passedCount: checks.length - blockingItems.length,
      totalCount: checks.length,
      blockingCount: blockingItems.length,
      warningCount: 0,
    },
    checks,
    blockingItems,
    evidence: {
      groupFound: Boolean(group),
      groupStatus: cleanString(group?.status || "missing"),
      requiredEvidenceItemsTotal: requiredKeys.length,
      requiredEvidenceItemsCompleted: checks.length - blockingItems.length,
      rawEvidenceRefsIncluded: false,
    },
    nextAction:
      blockingItems.length === 0
        ? "继续检查第一阶段安全护栏。"
        : `先在现场证据 manifest 的 ${cleanString(group?.key || key)} 组补齐 passed/accepted 和 evidenceRef。`,
  };
}

function buildSafeguardsStage({ persistenceArtifact, runtimeArtifact, todoLoadArtifact, manifestValidation }) {
  const persistence = persistenceArtifact.report?.safeguards || {};
  const runtime = runtimeArtifact.report?.safeguards || {};
  const todoLoad = todoLoadArtifact.report || {};
  const todoLoadAuthentication = todoLoad.authentication || {};
  const todoLoadSafeguards = todoLoad.safeguards || {};
  const manifestSafeguards = manifestValidation.safeguards || {};
  const checks = [
    safeguardCheck({
      key: "persistence-redacted",
      label: "持久化证据敏感信息未暴露",
      passed:
        persistence.envValuesExposed === false &&
        persistence.databaseUrlExposed === false &&
        persistence.objectStorageEndpointExposed === false &&
        persistence.objectStorageBucketExposed === false &&
        persistence.secretFieldsExposed === false &&
        persistence.payloadExposed === false,
      detail: "持久化证据不能暴露 env 值、数据库 URL、对象存储 endpoint / bucket、密钥或 payload。",
    }),
    safeguardCheck({
      key: "persistence-probes-clean",
      label: "持久化探针不改业务数据",
      passed:
        persistence.migrationApplyExecuted === false &&
        persistence.nonMutatingBusinessData === true &&
        persistence.postgresTempTableWriteProbeRolledBack === true &&
        persistence.objectStorageDiagnosticObjectsDeleted === true,
      detail: "持久化首阶段留证必须只使用临时表回滚探针和可清理诊断对象。",
    }),
    safeguardCheck({
      key: "runtime-redacted",
      label: "runtime smoke 敏感信息未暴露",
      passed:
        runtime.envValuesExposed === false &&
        runtime.databaseUrlExposed === false &&
        runtime.objectStorageEndpointExposed === false &&
        runtime.objectStorageBucketExposed === false &&
        runtime.secretFieldsExposed === false &&
        runtime.commandValueExposed === false &&
        runtime.commandArgsExposed === false &&
        runtime.payloadExposed === false,
      detail: "runtime smoke 不能暴露 env 值、数据库 URL、对象存储信息、命令值、命令参数或 payload。",
    }),
    safeguardCheck({
      key: "runtime-process-stopped",
      label: "runtime smoke 进程护栏",
      passed:
        ((runtime.apiProcessSpawned === true && runtime.apiProcessTerminated === true) ||
          (runtime.apiProcessSpawned === false && runtime.externalApiProbed === true)) &&
        runtime.businessDataMutated === false &&
        runtime.physicalPrinterCalled === false &&
        runtime.driverDeliveryStatusChanged === false,
      detail: "runtime smoke 若启动临时 API 必须停止；若探测长驻 API 必须只读，且不能改业务数据、调用打印机或改司机状态。",
    }),
    safeguardCheck({
      key: "todo-load-formal-runtime-auth",
      label: "待办容量正式会话护栏",
      passed:
        todoLoadAuthentication.formalRuntimeSession === true &&
        todoLoadAuthentication.serverVerified === true &&
        cleanString(todoLoadAuthentication.sessionType) === "runtime" &&
        todoLoadAuthentication.identityExposed === false &&
        todoLoadSafeguards.formalRuntimeAuthenticationRequired === true &&
        todoLoadSafeguards.legacyIdentityHeaderUsed === false,
      detail: "容量预检查必须由服务端再次验证正式runtime会话，拒绝seed和旧身份头，且不能暴露身份。",
    }),
    safeguardCheck({
      key: "todo-load-read-only-bounds",
      label: "待办容量只读与硬上限护栏",
      passed:
        todoLoadSafeguards.explicitReadLoadConfirmation === true &&
        todoLoadSafeguards.businessReadOnly === true &&
        todoLoadSafeguards.businessDataMutated === false &&
        cleanString(todoLoadSafeguards.businessProbeMethod) === "GET" &&
        todoLoadSafeguards.requestCountBounded === true &&
        todoLoadSafeguards.concurrencyBounded === true &&
        todoLoadSafeguards.physicalPrinterCalled === false,
      detail: "容量预检查必须显式确认、只调用受硬上限约束的GET，且不能改业务数据或调用打印机。",
    }),
    safeguardCheck({
      key: "todo-load-redacted",
      label: "待办容量报告脱敏护栏",
      passed:
        todoLoadSafeguards.responsePayloadStored === false &&
        todoLoadSafeguards.todoIdentityStored === false &&
        todoLoadSafeguards.credentialsExposed === false &&
        todoLoadSafeguards.apiAddressExposed === false &&
        todoLoadSafeguards.embeddedApiCredentialsAllowed === false,
      detail: "容量报告不能保存响应payload、待办编号、身份、凭据、API地址或内嵌API凭据。",
    }),
    safeguardCheck({
      key: "manifest-evidence-ref-redacted",
      label: "现场证据引用未泄露敏感字段",
      passed:
        manifestSafeguards.evidenceRefsRedacted === true &&
        manifestSafeguards.rawEvidenceRefsIncludedInReport !== true &&
        numberOrZero(manifestSafeguards.possibleSensitiveEvidenceRefCount) === 0,
      detail: "现场证据引用只能是报告编号、截图名、附件编号或签字单编号，不能包含密钥、连接串、命令路径或 spool 路径。",
    }),
  ];
  const blockingItems = checks.filter((item) => item.status !== "passed");
  return {
    key: "first-stage-safeguards",
    label: "第一阶段安全护栏",
    status: blockingItems.length === 0 ? "passed" : "blocked",
    ready: blockingItems.length === 0,
    detail:
      blockingItems.length === 0
        ? "三份第一阶段证据和现场证据引用的正式认证、脱敏、只读、硬上限和进程停止护栏均通过。"
        : `${blockingItems.length} 项第一阶段安全护栏未通过。`,
    summary: {
      label: `${checks.length - blockingItems.length}/${checks.length} 通过`,
      passedCount: checks.length - blockingItems.length,
      totalCount: checks.length,
      blockingCount: blockingItems.length,
      warningCount: 0,
    },
    checks,
    blockingItems,
    nextAction:
      blockingItems.length === 0
        ? "第一阶段 closeout 可作为生产环境 / 持久化签收依据。"
        : "重新生成有完整安全护栏的持久化证据、runtime smoke 和待办容量报告后重跑 closeout。",
  };
}

function safeguardCheck({ key, label, passed, detail }) {
  return {
    key,
    label,
    status: passed ? "passed" : "pending",
    ready: passed === true,
    detail,
  };
}

function summarizeArtifact(artifact) {
  const report = artifact.report || {};
  return {
    available: artifact.available === true,
    readable: artifact.readable === true,
    status: cleanString(report.status || "unavailable"),
    ready: report.ready === true,
    scope: cleanString(report.scope),
    checkedAt: cleanString(report.checkedAt),
    summaryLabel: cleanString(report.summary?.label),
    rawPathIncluded: false,
  };
}

function summarizeTodoLoadArtifact(artifact) {
  const report = artifact.report || {};
  const summary = report.summary || {};
  const latency = summary.latencyMs || {};
  const config = report.config || {};
  return {
    ...summarizeArtifact(artifact),
    requestCount: numberOrZero(summary.requestCount),
    successCount: numberOrZero(summary.successCount),
    errorCount: numberOrZero(summary.errorCount),
    errorRate: finiteNumberOrZero(summary.errorRate),
    throughputPerSecond: finiteNumberOrZero(summary.throughputPerSecond),
    latencyMs: {
      p50: finiteNumberOrZero(latency.p50),
      p95: finiteNumberOrZero(latency.p95),
      max: finiteNumberOrZero(latency.max),
    },
    thresholds: {
      maxP95Ms: finiteNumberOrZero(config.maxP95Ms),
      maxErrorRate: finiteNumberOrZero(config.maxErrorRate),
    },
    snapshotChanged: summary.snapshotChanged === true,
    serverVerifiedFormalRuntimeSession:
      report.authentication?.formalRuntimeSession === true && report.authentication?.serverVerified === true,
    productionTarget:
      report.target?.loopback === false && cleanString(report.target?.protocol) === "https",
    rawResponseIncluded: false,
    todoIdentityIncluded: false,
    apiAddressIncluded: false,
  };
}

function getEvidenceGroup(manifestValidation = {}, key) {
  return (manifestValidation.groups || []).find((group) => group.key === key) || null;
}

function summarizeManifestArtifact(manifestArtifact, manifestValidation) {
  return {
    available: manifestArtifact.available === true,
    readable: manifestArtifact.readable === true,
    schemaValid: manifestValidation.schemaValid === true,
    status: cleanString(manifestValidation.status || "unavailable"),
    ready: manifestValidation.ready === true,
    summaryLabel: cleanString(manifestValidation.summary?.label),
    rawPathIncluded: false,
  };
}

function summarizeEvidenceGroup(group, requiredKeys) {
  return {
    groupFound: Boolean(group),
    status: cleanString(group?.status || "missing"),
    ready: group?.ready === true,
    requiredTotal: numberOrZero(group?.requiredTotal || requiredKeys.length),
    completedRequired: numberOrZero(group?.completedRequired),
    blockedRequired: numberOrZero(group?.blockedRequired),
    rawEvidenceRefsIncluded: false,
  };
}

function sanitizeBlockingStages(items = []) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 8).map((item) => ({
    key: cleanString(item.key),
    label: cleanString(item.label),
    status: cleanString(item.status),
    detail: cleanString(item.detail),
  }));
}

function buildNextActions(stages, ready) {
  if (ready) {
    return [
      "把 first-stage closeout、persistence evidence、runtime smoke 和 todo load precheck 的 latest 报告编号写入现场证据包。",
      "继续下一阶段真实打印链路：标签机 / 针式机、CUPS、出纸、扫码和纸张对位。",
    ];
  }
  return stages
    .filter((item) => item.status !== "passed")
    .map((item) => cleanString(item.nextAction))
    .filter(Boolean)
    .slice(0, 8);
}

function writeProductionFirstStageCloseoutArtifacts(report, { outputDir = defaultOutputDir } = {}) {
  mkdirSync(outputDir, { recursive: true });
  const safeTimestamp = cleanString(report.checkedAt || new Date().toISOString()).replace(/[:.]/g, "-");
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = formatProductionFirstStageCloseout(report);
  const jsonPath = join(outputDir, `first-stage-closeout-${safeTimestamp}.json`);
  const markdownPath = join(outputDir, `first-stage-closeout-${safeTimestamp}.md`);
  const latestJsonPath = join(outputDir, "latest.json");
  const latestMarkdownPath = join(outputDir, "latest.md");
  writeFileSync(jsonPath, json);
  writeFileSync(markdownPath, markdown);
  writeFileSync(latestJsonPath, json);
  writeFileSync(latestMarkdownPath, markdown);
  return {
    outputDir,
    jsonPath,
    markdownPath,
    latestJsonPath,
    latestMarkdownPath,
  };
}

function formatProductionFirstStageCloseout(report) {
  const lines = [
    "# V1 Production First-Stage Closeout",
    "",
    `Status: ${report.ready ? "READY" : "BLOCKED"} (${report.summary.label})`,
    `Checked at: ${report.checkedAt}`,
    "",
    "## Stages",
  ];
  for (const stage of report.stages) {
    lines.push(`- ${stage.status.toUpperCase()} ${stage.label}: ${stage.detail}`);
    if (stage.nextAction && stage.status !== "passed") lines.push(`  - Next: ${stage.nextAction}`);
  }
  lines.push(
    "",
    "## Evidence Summary",
    `- Persistence evidence: ${report.evidenceSummary.persistenceEvidence.status} ${report.evidenceSummary.persistenceEvidence.summaryLabel}`,
    `- Runtime smoke: ${report.evidenceSummary.runtimeSmoke.status} ${report.evidenceSummary.runtimeSmoke.summaryLabel}`,
    `- Todo load precheck: ${report.evidenceSummary.todoLoadPrecheck.status} ${report.evidenceSummary.todoLoadPrecheck.summaryLabel}`,
    `- Todo load requests: ${report.evidenceSummary.todoLoadPrecheck.successCount}/${report.evidenceSummary.todoLoadPrecheck.requestCount}; error rate ${report.evidenceSummary.todoLoadPrecheck.errorRate}; P50/P95 ${report.evidenceSummary.todoLoadPrecheck.latencyMs.p50}/${report.evidenceSummary.todoLoadPrecheck.latencyMs.p95}ms; throughput ${report.evidenceSummary.todoLoadPrecheck.throughputPerSecond} req/s`,
    `- Todo load production target: ${yesNo(report.evidenceSummary.todoLoadPrecheck.productionTarget)}`,
    `- Field evidence manifest: ${report.evidenceSummary.fieldEvidenceManifest.status} ${report.evidenceSummary.fieldEvidenceManifest.summaryLabel}`,
    `- Production persistence evidence: ${report.evidenceSummary.productionPersistenceEvidence.completedRequired}/${report.evidenceSummary.productionPersistenceEvidence.requiredTotal}`,
    `- Object-storage evidence: ${report.evidenceSummary.objectStorageEvidence.completedRequired}/${report.evidenceSummary.objectStorageEvidence.requiredTotal}`,
    `- Source artifact paths included: ${yesNo(report.evidenceSummary.sourceArtifactPathsIncluded)}`,
    `- Raw reports included: ${yesNo(report.evidenceSummary.rawReportsIncluded)}`,
    `- Raw evidence refs included: ${yesNo(report.evidenceSummary.rawEvidenceRefsIncluded)}`,
    "",
    "## Safeguards",
    `- External service called by closeout: ${yesNo(report.safeguards.externalServiceCalledByCloseout)}`,
    `- Source artifact path exposed: ${yesNo(report.safeguards.sourceArtifactPathExposed)}`,
    `- Env values exposed: ${yesNo(report.safeguards.envValuesExposed)}`,
    `- Database URL exposed: ${yesNo(report.safeguards.databaseUrlExposed)}`,
    `- Object-storage endpoint exposed: ${yesNo(report.safeguards.objectStorageEndpointExposed)}`,
    `- Object-storage bucket exposed: ${yesNo(report.safeguards.objectStorageBucketExposed)}`,
    `- Secret fields exposed: ${yesNo(report.safeguards.secretFieldsExposed)}`,
    `- Command values exposed: ${yesNo(report.safeguards.commandValueExposed)}`,
    `- Physical printer called: ${yesNo(report.safeguards.physicalPrinterCalled)}`,
    `- Declares full V1 complete: ${yesNo(report.safeguards.declaresFullV1Complete)}`,
    "",
    report.ready ? "## Next" : "## Next Blockers",
  );
  for (const action of report.nextActions) lines.push(`- ${action}`);
  if (report.artifacts) {
    lines.push("", "## Artifacts", `- JSON: ${report.artifacts.latestJsonPath}`, `- Markdown: ${report.artifacts.latestMarkdownPath}`);
  }
  lines.push("");
  return redactCloseoutText(lines.join("\n"));
}

function redactCloseoutReport(report) {
  return JSON.parse(redactCloseoutText(JSON.stringify(report)));
}

function redactCloseoutText(value) {
  return redactRuntimeSmokeText(value);
}

function firstAction(values) {
  return Array.isArray(values) ? cleanString(values.find(Boolean) || "") : cleanString(values);
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberOrZero(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.trunc(number);
}

function finiteNumberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function yesNo(value) {
  return value ? "yes" : "no";
}

export {
  buildProductionFirstStageCloseout,
  formatProductionFirstStageCloseout,
  parseArgs,
  redactCloseoutText,
  writeProductionFirstStageCloseoutArtifacts,
};
