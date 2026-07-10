#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProductionEnvSetupEnvFiles } from "./productionEnvSetupEnvFileResolver.mjs";
import { buildProductionEnvFileAuditReport } from "./run-v1-production-env-file-audit.mjs";
import { buildProductionEnvPreflight, loadEnvironment } from "./run-v1-production-env-preflight.mjs";
import { runDbMigrations } from "./run-db-migrations.mjs";
import {
  buildProductionPostgresPreflight,
  redactSensitiveText,
} from "./run-v1-production-postgres-preflight.mjs";
import {
  buildProductionPostgresBackupRestoreCheck,
  redactSensitiveText as redactPostgresBackupRestoreText,
} from "./run-v1-production-postgres-backup-restore-check.mjs";
import {
  buildProductionObjectStoragePreflight,
  redactObjectStorageText,
} from "./run-v1-production-object-storage-preflight.mjs";
import { buildProductionObjectStorageGovernanceCheck } from "./run-v1-production-object-storage-governance-check.mjs";

const defaultOutputDir = ".erp-local-storage/v1-production-persistence-evidence";
const defaultProductionEnvSetupJsonPath = ".erp-local-storage/v1-production-env-setup/latest.json";
const persistenceEnvCriterionKeys = new Set([
  "v1-persistence-profile",
  "postgres-restore-validation-env",
  "attachment-object-storage-env",
  "statement-export-object-storage-env",
  "preflight-redaction-safeguard",
]);

if (isCliEntrypoint()) runCli();

async function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = await buildProductionPersistenceEvidence({
      envFiles: options.envFiles,
      envFileSource: options.envFileSource,
      envFileSourceSummary: options.envFileSourceSummary,
      envFileFromProductionSetup: options.envFileFromProductionSetup,
      baseEnv: process.env,
      psqlCommand: options.psqlCommand,
      pgDumpCommand: options.pgDumpCommand,
      restoreDatabaseUrl: options.restoreDatabaseUrl,
      allowRestoreReset: options.allowRestoreReset,
      signedUrlTtlSeconds: options.signedUrlTtlSeconds,
    });
    const outputReport = options.write
      ? {
          ...report,
          artifacts: writeProductionPersistenceEvidenceArtifacts(report, {
            outputDir: options.outputDir,
          }),
        }
      : report;
    if (options.json) {
      process.stdout.write(`${JSON.stringify(outputReport, null, 2)}\n`);
    } else {
      process.stdout.write(formatProductionPersistenceEvidence(outputReport));
    }
    process.exit(report.ready ? 0 : 2);
  } catch (error) {
    const message = redactPersistenceEvidenceText(error?.message || String(error));
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 production persistence evidence failed: ${message}\n`);
    }
    process.exit(1);
  }
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args) {
  const options = {
    envFiles: [],
    envFileFromProductionSetup: false,
    envFileSource: "none",
    envFileSourceSummary: "未传入 env 文件",
    json: false,
    outputDir: defaultOutputDir,
    productionEnvSetupJsonPath: defaultProductionEnvSetupJsonPath,
    psqlCommand: "psql",
    pgDumpCommand: "pg_dump",
    signedUrlTtlSeconds: 120,
    write: true,
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
    if (arg === "--env-file") {
      options.envFiles.push(readValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--use-production-env-setup-env-file") {
      options.useProductionEnvSetupEnvFile = true;
      continue;
    }
    if (arg === "--production-env-setup-json") {
      options.productionEnvSetupJsonPath = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--psql-command") {
      options.psqlCommand = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--pg-dump-command") {
      options.pgDumpCommand = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--restore-database-url") {
      options.restoreDatabaseUrl = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--allow-restore-reset") {
      options.allowRestoreReset = true;
      continue;
    }
    if (arg === "--signed-url-ttl-seconds") {
      const value = Number(readValue(args, index, arg));
      if (!Number.isFinite(value) || value <= 0) throw new Error(`${arg} must be a positive number.`);
      options.signedUrlTtlSeconds = Math.floor(value);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  const envFileResolution = resolveProductionPersistenceEvidenceEnvFiles({
    envFiles: options.envFiles,
    productionEnvSetupJsonPath: options.productionEnvSetupJsonPath,
    useProductionEnvSetupEnvFile: options.useProductionEnvSetupEnvFile,
  });
  options.envFiles = envFileResolution.envFiles;
  options.envFileSource = envFileResolution.source;
  options.envFileSourceSummary = envFileResolution.summary;
  options.envFileFromProductionSetup = envFileResolution.usedProductionEnvSetup;
  return options;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function helpText() {
  return [
    "Usage: node -- scripts/run-v1-production-persistence-evidence.mjs --use-production-env-setup-env-file [options]",
    "   or: node -- scripts/run-v1-production-persistence-evidence.mjs --env-file <secure-env-file> [options]",
    "",
    "Options:",
    "  --use-production-env-setup-env-file",
    "                                  Reuse the safe env file recorded by production env setup. Preferred for normal V1 go-live.",
    "  --env-file <path>              Load and audit secure production env file. Can be repeated. Use only when bypassing setup.",
    "  --production-env-setup-json <path>",
    "                                  Production env setup JSON. Defaults to .erp-local-storage/v1-production-env-setup/latest.json.",
    "  --output-dir <path>            Write redacted evidence files. Defaults to .erp-local-storage/v1-production-persistence-evidence.",
    "  --psql-command <path>          PostgreSQL client command. Defaults to psql.",
    "  --pg-dump-command <path>       PostgreSQL dump command. Defaults to pg_dump.",
    "  --restore-database-url <url>   Dedicated restore-validation database URL. Overrides env.",
    "  --allow-restore-reset          Allow resetting the restore-validation database public schema.",
    "  --signed-url-ttl-seconds <n>   TTL for attachment signed URL probe. Defaults to 120.",
    "  --no-write                     Do not write JSON / Markdown evidence files.",
    "  --json                         Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  Production persistence first-phase evidence is ready",
    "  1  Runner error",
    "  2  Evidence is readable but still blocked for V1 production persistence",
    "",
    "This runner does not apply migrations and does not mutate business data. PostgreSQL probes use TEMP data and object-storage probes use diagnostic objects that are deleted.",
    "PostgreSQL backup / restore validation is read-only for the production source database and resets only the dedicated restore-validation database when explicitly allowed.",
    "Object-storage governance reads bucket versioning, lifecycle, encryption and policy metadata; it does not write objects.",
    "The report is redacted: it does not print env values, database URLs, endpoints, buckets, secrets, object keys, signed URLs, command values, bucket policies or payloads.",
  ].join("\n");
}

function resolveProductionPersistenceEvidenceEnvFiles({
  envFiles = [],
  productionEnvSetupJsonPath = defaultProductionEnvSetupJsonPath,
  useProductionEnvSetupEnvFile = false,
} = {}) {
  if (envFiles.length) {
    return {
      envFiles,
      source: "cli",
      summary: `${envFiles.length} 个命令行 env 文件`,
      usedProductionEnvSetup: false,
    };
  }
  if (!useProductionEnvSetupEnvFile) {
    return {
      envFiles: [],
      source: "none",
      summary: "未传入 env 文件",
      usedProductionEnvSetup: false,
    };
  }
  return resolveProductionEnvSetupEnvFiles({
    productionEnvSetupJsonPath,
    useProductionEnvSetupEnvFile: true,
  });
}

function cleanString(value) {
  return String(value || "").trim();
}

async function buildProductionPersistenceEvidence({
  envFiles = [],
  envFileSource = "",
  envFileSourceSummary = "",
  envFileFromProductionSetup = false,
  baseEnv = process.env,
  psqlCommand = "psql",
  pgDumpCommand = "pg_dump",
  restoreDatabaseUrl = "",
  allowRestoreReset,
  commandRunner,
  fetchImpl,
  checkedAt = new Date().toISOString(),
  now = new Date(checkedAt),
  signedUrlTtlSeconds = 120,
  tempDirFactory,
} = {}) {
  const envFileAudit = buildEnvFileAuditStage({ envFiles });
  const env = loadEnvironment({ envFiles, baseEnv });
  const envPreflight = buildProductionEnvPreflight({ env, envFiles });
  const persistenceEnvStage = buildPersistenceEnvStage(envPreflight);
  const migrationPlanStage = buildMigrationPlanStage({ envFiles, baseEnv, psqlCommand, commandRunner });
  const postgresPreflight = buildProductionPostgresPreflight({
    env,
    envFiles,
    psqlCommand,
    commandRunner,
    checkedAt,
  });
  const postgresStage = buildReportStage({
    key: "production-postgres-preflight",
    label: "生产 PostgreSQL 结构 / 权限 live 预检",
    report: postgresPreflight,
    detail: postgresPreflight.summary.label,
    evidence: {
      passedCount: postgresPreflight.summary.passedCount,
      totalCount: postgresPreflight.summary.totalCount,
      migrationCount: postgresPreflight.summary.migrationCount,
      requiredTableCount: postgresPreflight.summary.requiredTableCount,
    },
  });
  const postgresBackupRestoreCheck = buildProductionPostgresBackupRestoreCheck({
    env,
    envFiles,
    psqlCommand,
    pgDumpCommand,
    restoreDatabaseUrl,
    allowRestoreReset,
    commandRunner,
    checkedAt,
    tempDirFactory,
  });
  const postgresBackupRestoreStage = buildReportStage({
    key: "production-postgres-backup-restore-check",
    label: "生产 PostgreSQL 备份 / 恢复抽样验证",
    report: postgresBackupRestoreCheck,
    detail: postgresBackupRestoreCheck.summary.label,
    evidence: {
      passedCount: postgresBackupRestoreCheck.summary.passedCount,
      totalCount: postgresBackupRestoreCheck.summary.totalCount,
      schemaDumpBytes: postgresBackupRestoreCheck.summary.schemaDumpBytes,
      migrationDataDumpBytes: postgresBackupRestoreCheck.summary.migrationDataDumpBytes,
      restoreDatabaseMutated: Boolean(postgresBackupRestoreCheck.safeguards.restoreDatabaseMutated),
      dumpFilesRemoved: Boolean(postgresBackupRestoreCheck.safeguards.dumpFilesRemoved),
    },
  });
  const objectStoragePreflight = await buildProductionObjectStoragePreflight({
    env,
    envFiles,
    fetchImpl,
    checkedAt,
    now,
    signedUrlTtlSeconds,
  });
  const objectStorageStage = buildReportStage({
    key: "production-object-storage-preflight",
    label: "生产对象存储 live 预检",
    report: objectStoragePreflight,
    detail: objectStoragePreflight.summary.label,
    evidence: {
      passedCount: objectStoragePreflight.summary.passedCount,
      totalCount: objectStoragePreflight.summary.totalCount,
      warningCount: objectStoragePreflight.summary.warningCount,
      keyPrefixExposed: Boolean(objectStoragePreflight.safeguards?.objectStorageKeyPrefixExposed),
    },
  });
  const objectStorageGovernance = await buildProductionObjectStorageGovernanceCheck({
    env,
    envFiles,
    fetchImpl,
    checkedAt,
    now,
  });
  const objectStorageGovernanceStage = buildReportStage({
    key: "production-object-storage-governance-check",
    label: "生产对象存储 bucket 治理检查",
    report: objectStorageGovernance,
    detail: objectStorageGovernance.summary.label,
    evidence: {
      passedCount: objectStorageGovernance.summary.passedCount,
      totalCount: objectStorageGovernance.summary.totalCount,
      warningCount: objectStorageGovernance.summary.warningCount,
      bucketTargetCount: objectStorageGovernance.summary.bucketTargetCount,
      readsBucketGovernanceOnly: Boolean(objectStorageGovernance.safeguards.readsBucketGovernanceOnly),
    },
  });
  const redactionStage = passedStage({
    key: "persistence-evidence-redaction-safeguard",
    label: "生产持久化留证脱敏护栏",
    detail: "输出只保留阶段状态、计数和下一步，不输出 env 值、连接串、对象存储地址、bucket、key prefix、密钥、对象 key、签名 URL、bucket policy、命令值或 payload。",
    evidence: {
      envValuesExposed: false,
      databaseUrlExposed: false,
      endpointExposed: false,
      bucketExposed: false,
      objectStorageKeyPrefixExposed: false,
      secretFieldsExposed: false,
      objectKeyExposed: false,
      signedUrlExposed: false,
      rawBucketPolicyExposed: false,
      commandValueExposed: false,
      payloadExposed: false,
    },
  });

  const stages = [
    envFileAudit,
    persistenceEnvStage,
    migrationPlanStage,
    postgresStage,
    postgresBackupRestoreStage,
    objectStorageStage,
    objectStorageGovernanceStage,
    redactionStage,
  ];
  const passedCount = stages.filter((item) => item.status === "passed").length;
  const blockingStages = stages.filter((item) => item.status !== "passed");
  const warningCount =
    envPreflight.summary.warningCount +
    (envFileAudit.evidence.warningCount || 0) +
    objectStorageGovernance.summary.warningCount;
  const ready = blockingStages.length === 0;

  return {
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt,
    scope: "v1_production_persistence_evidence",
    envFileCount: envFiles.length,
    envFileSource: cleanString(envFileSource) || (envFiles.length ? "cli" : "none"),
    envFileSourceLabel:
      cleanString(envFileSourceSummary) || (envFiles.length ? `${envFiles.length} 个 env 文件` : "未传入 env 文件"),
    envFileFromProductionSetup: envFileFromProductionSetup === true,
    summary: {
      label: `${passedCount}/${stages.length} 阶段通过`,
      passedCount,
      totalCount: stages.length,
      blockingCount: blockingStages.length,
      warningCount,
      postgresReady: postgresPreflight.ready,
      postgresBackupRestoreReady: postgresBackupRestoreCheck.ready,
      objectStorageReady: objectStoragePreflight.ready,
      objectStorageGovernanceReady: objectStorageGovernance.ready,
      persistenceEnvReady: persistenceEnvStage.status === "passed",
      envFileSource: cleanString(envFileSource) || (envFiles.length ? "cli" : "none"),
      envFileSourceLabel:
        cleanString(envFileSourceSummary) || (envFiles.length ? `${envFiles.length} 个 env 文件` : "未传入 env 文件"),
      envFileFromProductionSetup: envFileFromProductionSetup === true,
    },
    stages,
    blockingStages,
    safeguards: {
      nonMutatingBusinessData: true,
      migrationApplyExecuted: false,
      postgresTempTableWriteProbeRolledBack: Boolean(postgresPreflight.safeguards?.tempTableWriteProbeRolledBack),
      postgresBackupRestoreSourceDatabaseMutated: Boolean(postgresBackupRestoreCheck.safeguards?.sourceDatabaseMutated),
      postgresBackupRestoreRestoreDatabaseMutated: Boolean(postgresBackupRestoreCheck.safeguards?.restoreDatabaseMutated),
      postgresBackupRestoreResetExplicitlyAllowed: Boolean(
        postgresBackupRestoreCheck.safeguards?.restoreResetExplicitlyAllowed,
      ),
      postgresBackupRestoreDumpFilesRemoved: Boolean(postgresBackupRestoreCheck.safeguards?.dumpFilesRemoved),
      objectStorageDiagnosticObjectsDeleted: Boolean(objectStoragePreflight.safeguards?.deletesDiagnosticObjects),
      objectStorageGovernanceWritesObjects: Boolean(objectStorageGovernance.safeguards?.writesDiagnosticObjects),
      objectStorageGovernanceReadsBucketMetadata: Boolean(objectStorageGovernance.safeguards?.readsBucketGovernanceOnly),
      envValuesExposed: false,
      databaseUrlExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      objectStorageKeyPrefixExposed: false,
      secretFieldsExposed: false,
      objectKeyExposed: false,
      signedUrlExposed: false,
      rawBucketPolicyExposed: false,
      payloadExposed: false,
      envFilePathAcceptedFromRequest: false,
      envFilePathExposed: false,
      envFileReadFromProductionSetup: envFileFromProductionSetup === true,
    },
    nextActions: buildNextActions({ ready, blockingStages }),
  };
}

function buildEnvFileAuditStage({ envFiles }) {
  if (!envFiles.length) {
    return blockedStage({
      key: "production-env-file-audit",
      label: "生产 env 文件安全审计",
      detail: "未提供 --env-file；真实生产持久化留证必须从安全未跟踪 env 文件开始。",
      nextAction: "先运行 production env setup 并补齐真实值后重跑：node scripts/run-v1-production-persistence-evidence.mjs --use-production-env-setup-env-file。只有绕开 setup 报告时才显式传入 --env-file <secure-env-file>。",
      evidence: {
        envFileCount: 0,
        blockingCount: 1,
        warningCount: 0,
      },
    });
  }
  const report = buildProductionEnvFileAuditReport({ envFiles });
  return buildReportStage({
    key: "production-env-file-audit",
    label: "生产 env 文件安全审计",
    report,
    detail: report.summary.label,
    nextAction: firstAction(report.nextActions),
    evidence: {
      envFileCount: report.envFileCount,
      blockingCount: report.summary.blockingCount,
      warningCount: report.summary.warningCount,
      placeholderAssignmentCount: report.summary.placeholderAssignmentCount,
      uncommentedAssignmentCount: report.summary.uncommentedAssignmentCount,
      sensitiveVariableNameCount: report.summary.sensitiveVariableNameCount,
      crossFileDuplicateVariableCount: report.summary.crossFileDuplicateVariableCount,
    },
  });
}

function buildPersistenceEnvStage(envPreflight) {
  const selectedCriteria = envPreflight.criteria.filter((item) => persistenceEnvCriterionKeys.has(item.key));
  const blockingCriteria = selectedCriteria.filter((item) => item.blocking !== false && item.status !== "passed");
  const warningCriteria = selectedCriteria.filter((item) => item.blocking === false && item.status !== "passed");
  const passedCount = selectedCriteria.filter((item) => item.status === "passed").length;
  const ready = blockingCriteria.length === 0;
  return stage({
    key: "production-persistence-env-subset",
    label: "生产持久化 env 子集",
    status: ready ? "passed" : "blocked",
    detail: `${passedCount}/${selectedCriteria.length} 项生产持久化 env 条件通过；完整 V1 env 预检为 ${envPreflight.summary.label}。`,
    nextAction: ready
      ? "继续执行 PostgreSQL 和对象存储 live 预检；打印 / CUPS env 可在下一阶段继续补。"
      : firstAction(blockingCriteria.map((item) => item.nextAction || item.detail)),
    evidence: {
      selectedCriterionKeys: selectedCriteria.map((item) => item.key),
      passedCount,
      totalCount: selectedCriteria.length,
      blockingCount: blockingCriteria.length,
      warningCount: warningCriteria.length,
      fullEnvPassedCount: envPreflight.summary.passedCount,
      fullEnvTotalCount: envPreflight.summary.totalCount,
      fullEnvBlockingCount: envPreflight.summary.blockingCount,
      fullEnvWarningCount: envPreflight.summary.warningCount,
    },
  });
}

function buildMigrationPlanStage({ envFiles, baseEnv, psqlCommand, commandRunner }) {
  try {
    const result = runDbMigrations({
      options: {
        dryRun: true,
        apply: false,
        envFiles,
        psqlCommand,
      },
      baseEnv,
      commandRunner,
      logger: () => {},
    });
    return passedStage({
      key: "db-migration-plan",
      label: "数据库迁移计划可读",
      detail: `已读取 ${result.totalCount} 个迁移文件；本阶段未执行 --apply。`,
      nextAction: "生产库备份确认后，如 PostgreSQL 预检提示迁移缺失，再执行 node scripts/run-db-migrations.mjs --env-file <secure-env-file> --apply。",
      evidence: {
        mode: result.mode,
        totalCount: result.totalCount,
        createdTableCount: result.createdTableCount,
        migrationApplyExecuted: false,
      },
    });
  } catch (error) {
    return blockedStage({
      key: "db-migration-plan",
      label: "数据库迁移计划可读",
      detail: redactPersistenceEvidenceText(error?.message || String(error)),
      nextAction: "先修复 db/migrations 文件顺序、checksum 或 SQL 草案，再重跑生产持久化留证。",
      evidence: {
        migrationApplyExecuted: false,
      },
    });
  }
}

function buildReportStage({ key, label, report, detail, nextAction: _nextAction, evidence = {} }) {
  return stage({
    key,
    label,
    status: report.ready ? "passed" : "blocked",
    detail,
    nextAction: report.ready ? firstAction(report.nextActions) : firstAction(report.nextActions),
    evidence: {
      ...evidence,
      reportStatus: report.status,
      blockingCount: report.summary?.blockingCount || 0,
      warningCount: report.summary?.warningCount || 0,
    },
  });
}

function stage({ key, label, status, detail, nextAction = "", evidence = {} }) {
  return {
    key,
    label,
    status,
    ready: status === "passed",
    detail: redactPersistenceEvidenceText(detail),
    nextAction: redactPersistenceEvidenceText(nextAction),
    evidence,
  };
}

function passedStage(options) {
  return stage({ ...options, status: "passed" });
}

function blockedStage(options) {
  return stage({ ...options, status: "blocked" });
}

function buildNextActions({ ready, blockingStages }) {
  if (ready) {
    return [
      "把 latest.md / latest.json 留入 V1 现场证据：生产 env、PostgreSQL 和对象存储首阶段 live 证据已通过。",
      "用同一份安全 env 启动当前生产 API，再执行 node scripts/run-v1-production-go-live-precheck.mjs --use-production-env-setup-env-file。",
      "继续把 bucket 权限 / 生命周期 / 备份策略治理报告、真实附件上传和真实客户对账导出样本回填现场证据。",
    ];
  }
  return blockingStages.slice(0, 6).map((item) => `${item.label}：${item.nextAction || item.detail}`);
}

function writeProductionPersistenceEvidenceArtifacts(report, { outputDir = defaultOutputDir } = {}) {
  const dir = resolve(outputDir);
  mkdirSync(dir, { recursive: true });
  const stamp = String(report.checkedAt || new Date().toISOString())
    .replace(/[^0-9A-Za-z]+/g, "")
    .slice(0, 20);
  const jsonPath = resolve(dir, `v1-production-persistence-evidence-${stamp}.json`);
  const markdownPath = resolve(dir, `v1-production-persistence-evidence-${stamp}.md`);
  const latestJsonPath = resolve(dir, "latest.json");
  const latestMarkdownPath = resolve(dir, "latest.md");
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = formatProductionPersistenceEvidence(report);
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

function formatProductionPersistenceEvidence(report) {
  const lines = [
    `# V1 Production Persistence Evidence`,
    "",
    `Status: ${report.ready ? "READY" : "BLOCKED"} (${report.summary.label})`,
    `Checked at: ${report.checkedAt}`,
    `Env files checked: ${Number(report.envFileCount) || 0}`,
    "",
    "## Stages",
  ];
  for (const item of report.stages) {
    lines.push(`- ${item.status.toUpperCase()} ${item.label}: ${item.detail}`);
    if (item.nextAction && item.status !== "passed") lines.push(`  - Next: ${item.nextAction}`);
  }
  lines.push(
    "",
    "## Safeguards",
    `- Migration apply executed: ${yesNo(report.safeguards.migrationApplyExecuted)}`,
    `- Business data mutated: ${yesNo(!report.safeguards.nonMutatingBusinessData)}`,
    `- PostgreSQL TEMP write probe rolled back: ${yesNo(report.safeguards.postgresTempTableWriteProbeRolledBack)}`,
    `- PostgreSQL backup / restore source mutated: ${yesNo(report.safeguards.postgresBackupRestoreSourceDatabaseMutated)}`,
    `- PostgreSQL restore database mutated: ${yesNo(report.safeguards.postgresBackupRestoreRestoreDatabaseMutated)}`,
    `- PostgreSQL restore dump files removed: ${yesNo(report.safeguards.postgresBackupRestoreDumpFilesRemoved)}`,
    `- Object-storage diagnostic objects deleted: ${yesNo(report.safeguards.objectStorageDiagnosticObjectsDeleted)}`,
    `- Object-storage governance writes objects: ${yesNo(report.safeguards.objectStorageGovernanceWritesObjects)}`,
    `- Object-storage governance reads bucket metadata: ${yesNo(report.safeguards.objectStorageGovernanceReadsBucketMetadata)}`,
    `- Env values exposed: ${yesNo(report.safeguards.envValuesExposed)}`,
    `- Database URL exposed: ${yesNo(report.safeguards.databaseUrlExposed)}`,
    `- Object-storage endpoint exposed: ${yesNo(report.safeguards.objectStorageEndpointExposed)}`,
    `- Object-storage bucket exposed: ${yesNo(report.safeguards.objectStorageBucketExposed)}`,
    `- Object-storage key prefix exposed: ${yesNo(report.safeguards.objectStorageKeyPrefixExposed)}`,
    `- Secret fields exposed: ${yesNo(report.safeguards.secretFieldsExposed)}`,
    `- Object key exposed: ${yesNo(report.safeguards.objectKeyExposed)}`,
    `- Signed URL exposed: ${yesNo(report.safeguards.signedUrlExposed)}`,
    `- Raw bucket policy exposed: ${yesNo(report.safeguards.rawBucketPolicyExposed)}`,
    `- Payload exposed: ${yesNo(report.safeguards.payloadExposed)}`,
    "",
    report.ready ? "## Next" : "## Next Blockers",
  );
  for (const action of report.nextActions) lines.push(`- ${action}`);
  if (report.artifacts) {
    lines.push("", "## Artifacts", `- JSON: ${report.artifacts.latestJsonPath}`, `- Markdown: ${report.artifacts.latestMarkdownPath}`);
  }
  lines.push("");
  return redactPersistenceEvidenceText(lines.join("\n"));
}

function firstAction(values) {
  return Array.isArray(values) ? String(values.find(Boolean) || "") : String(values || "");
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function redactPersistenceEvidenceText(value) {
  return redactObjectStorageText(formatProductionPostgresPreflightText(redactPostgresBackupRestoreText(redactSensitiveText(value))));
}

function formatProductionPostgresPreflightText(value) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[redacted-postgres-url]")
    .replace(/(DATABASE_URL|PGURL)=([^\s]+)/gi, "$1=[redacted]")
    .replace(/(ERP_[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|ACCESS_KEY|BUCKET|ENDPOINT)[A-Z0-9_]*)=([^\s]+)/gi, "$1=[redacted]")
    .replace(/\bAKIA[A-Z0-9_]+\b/g, "[redacted-access-key]")
    .replace(/\bSUPER_SECRET_[A-Z0-9_]+\b/g, "[redacted-secret]");
}

export {
  buildProductionPersistenceEvidence,
  formatProductionPersistenceEvidence,
  parseArgs,
  redactPersistenceEvidenceText,
  writeProductionPersistenceEvidenceArtifacts,
};
