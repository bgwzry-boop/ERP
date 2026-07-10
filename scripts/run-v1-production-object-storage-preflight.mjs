#!/usr/bin/env node

import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAttachmentObjectStorage } from "../server/attachmentObjectStorage.mjs";
import { createStatementExportObjectStorage } from "../server/statementExportObjectStorage.mjs";
import { loadEnvironment } from "./run-v1-production-env-preflight.mjs";
import {
  defaultProductionEnvSetupJsonPath,
  productionEnvFileSourceLabel,
  resolveProductionEnvSetupEnvFiles,
} from "./productionEnvSetupEnvFileResolver.mjs";

const attachmentRequiredEnvNames = [
  "ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT",
  "ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET",
  "ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID",
  "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
];
const statementRequiredEnvNames = [
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT",
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET",
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID",
  "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY",
];
const defaultAttachmentProvider = "s3_compatible";
const defaultRegion = "us-east-1";
const defaultAttachmentKeyPrefix = "attachments";
const defaultStatementExportKeyPrefix = "statement-exports";
const defaultSignedUrlTtlSeconds = 120;

if (isCliEntrypoint()) runCli();

async function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const env = loadEnvironment({ envFiles: options.envFiles, baseEnv: process.env });
    const report = await buildProductionObjectStoragePreflight({
      env,
      envFiles: options.envFiles,
      envFileSource: options.envFileSource,
      envFileSourceSummary: options.envFileSourceSummary,
      envFileFromProductionSetup: options.envFileFromProductionSetup,
      signedUrlTtlSeconds: options.signedUrlTtlSeconds,
    });
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatProductionObjectStoragePreflight(report));
    }
    process.exit(report.ready ? 0 : 2);
  } catch (error) {
    const message = redactObjectStorageText(error?.message || String(error));
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 production object storage preflight failed: ${message}\n`);
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
    json: false,
    signedUrlTtlSeconds: defaultSignedUrlTtlSeconds,
    productionEnvSetupJsonPath: defaultProductionEnvSetupJsonPath,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
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
  const envFileResolution = resolveProductionEnvSetupEnvFiles({
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
    "Usage: node scripts/run-v1-production-object-storage-preflight.mjs [options]",
    "",
    "Options:",
    "  --env-file <path>              Load secure production env file. Can be repeated.",
    "  --use-production-env-setup-env-file",
    "                                  Reuse the secure env file recorded by production env setup.",
    "  --production-env-setup-json <path>",
    "                                  Production env setup JSON. Defaults to .erp-local-storage/v1-production-env-setup/latest.json.",
    "  --signed-url-ttl-seconds <n>   TTL for attachment signed URL probe. Defaults to 120.",
    "  --json                         Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  Attachment and statement-export object storage live probes are ready",
    "  1  Env file / runner error",
    "  2  Object storage checks are readable but still blocked for V1 production",
    "",
    "This check writes small diagnostic objects to object storage, reads them back, generates a signed URL, and deletes them.",
    "Bucket governance is checked by run-v1-production-object-storage-governance-check.mjs.",
    "The report is redacted: it does not print endpoints, buckets, keys, credentials, object keys, or signed URLs.",
  ].join("\n");
}

async function buildProductionObjectStoragePreflight({
  env = process.env,
  envFiles = [],
  envFileSource = envFiles.length ? "cli" : "none",
  envFileSourceSummary = envFiles.length ? `${envFiles.length} 个命令行 env 文件` : "未传入 env 文件",
  envFileFromProductionSetup = false,
  checkedAt = new Date().toISOString(),
  fetchImpl = globalThis.fetch,
  now = new Date(),
  signedUrlTtlSeconds = defaultSignedUrlTtlSeconds,
} = {}) {
  const runId = buildRunId(checkedAt);
  const sensitiveValues = collectSensitiveValues(env);
  const criteria = [];

  const attachmentConfig = buildAttachmentConfig(env);
  criteria.push(buildAttachmentConfigCriterion(attachmentConfig));

  if (attachmentConfig.ready) {
    criteria.push(...(await runAttachmentLiveProbe({ attachmentConfig, fetchImpl, now, runId, signedUrlTtlSeconds, sensitiveValues })));
  } else {
    criteria.push(skippedCriterion({
      key: "attachment-object-storage-live-probe",
      label: "附件对象存储写入 / 读回 / 清理",
      detail: "附件对象存储配置未通过，未执行远端写入探针。",
      nextAction: "先补齐附件对象存储 endpoint、bucket、access key 和 secret key。",
    }));
    criteria.push(skippedCriterion({
      key: "attachment-object-storage-signed-url-probe",
      label: "附件对象存储短期访问地址读回",
      detail: "附件对象存储配置未通过，未生成签名 URL。",
      nextAction: "先让附件对象存储写入 / 读回 / 清理探针通过。",
    }));
  }

  const statementConfig = buildStatementExportConfig(env, attachmentConfig);
  criteria.push(buildStatementConfigCriterion(statementConfig));
  if (statementConfig.ready) {
    criteria.push(await runStatementExportLiveProbe({ statementConfig, fetchImpl, now, runId, sensitiveValues }));
  } else {
    criteria.push(skippedCriterion({
      key: "statement-export-object-storage-live-probe",
      label: "对账导出对象存储写入 / 读回 / 清理",
      detail: "对账导出对象存储配置未通过，未执行远端写入探针。",
      nextAction: "补齐对账导出对象存储配置，或保持独立配置为空并补齐附件对象存储 fallback。",
    }));
  }

  criteria.push(redactionCriterion());

  const passedCount = criteria.filter((item) => item.status === "passed").length;
  const blockingCriteria = criteria.filter((item) => item.blocking !== false && item.status !== "passed");
  const warningCriteria = criteria.filter((item) => item.status === "warning");
  const ready = blockingCriteria.length === 0;

  return {
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt,
    scope: "v1_production_object_storage_preflight",
    envFileCount: envFiles.length,
    envFileSource,
    envFileSourceLabel: productionEnvFileSourceLabel(envFileSource),
    envFileSourceSummary,
    envFileFromProductionSetup: Boolean(envFileFromProductionSetup || envFileSource === "production_env_setup"),
    summary: {
      label: `${passedCount}/${criteria.length} 通过`,
      passedCount,
      totalCount: criteria.length,
      blockingCount: blockingCriteria.length,
      warningCount: warningCriteria.length,
      envFileSource,
      envFileSourceLabel: productionEnvFileSourceLabel(envFileSource),
      envFileFromProductionSetup: Boolean(envFileFromProductionSetup || envFileSource === "production_env_setup"),
    },
    criteria,
    blockingCriteria,
    warningCriteria,
    safeguards: {
      writesDiagnosticObjects: true,
      deletesDiagnosticObjects: true,
      readsBucketGovernance: false,
      businessDataMutated: false,
      endpointExposed: false,
      bucketExposed: false,
      accessKeyExposed: false,
      secretKeyExposed: false,
      sessionTokenExposed: false,
      objectStorageKeyPrefixExposed: false,
      objectKeyExposed: false,
      signedUrlExposed: false,
      payloadExposed: false,
      envFileReadFromProductionSetup: Boolean(envFileFromProductionSetup || envFileSource === "production_env_setup"),
    },
    nextActions: buildNextActions({ ready, blockingCriteria }),
  };
}

function buildAttachmentConfig(env) {
  const keyPrefixConfigured = Boolean(cleanValue(env.ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX));
  const keyPrefixValid = !keyPrefixConfigured || isObjectStorageKeyPrefix(env.ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX);
  const values = {
    provider: cleanValue(env.ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER) || defaultAttachmentProvider,
    endpoint: cleanValue(env.ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT),
    bucket: cleanValue(env.ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET),
    region: cleanValue(env.ERP_ATTACHMENT_OBJECT_STORAGE_REGION) || defaultRegion,
    accessKeyId: cleanValue(env.ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID),
    secretAccessKey: cleanValue(env.ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY),
    sessionToken: cleanValue(env.ERP_ATTACHMENT_OBJECT_STORAGE_SESSION_TOKEN),
    keyPrefix: keyPrefixValid ? cleanKeyPrefix(env.ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX) || defaultAttachmentKeyPrefix : defaultAttachmentKeyPrefix,
    forcePathStyle: parseBoolean(env.ERP_ATTACHMENT_OBJECT_STORAGE_FORCE_PATH_STYLE, true),
  };
  const missingVariables = attachmentRequiredEnvNames.filter((name) => !cleanValue(env[name]));
  if (!keyPrefixValid) missingVariables.push("ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX valid object key prefix");
  const unsupportedProvider = values.provider !== defaultAttachmentProvider;
  return {
    ready: missingVariables.length === 0 && !unsupportedProvider && keyPrefixValid,
    mode: "object_storage",
    values,
    missingVariables,
    unsupportedProvider,
    keyPrefixConfigured,
    keyPrefixValid,
    invalidKeyPrefix: keyPrefixConfigured && !keyPrefixValid,
    source: "attachment",
  };
}

function buildStatementExportConfig(env, attachmentConfig) {
  const explicitConfiguredCount = statementRequiredEnvNames.filter((name) => cleanValue(env[name])).length;
  const explicitComplete = explicitConfiguredCount === statementRequiredEnvNames.length;
  const usesAttachmentFallback = explicitConfiguredCount === 0 && attachmentConfig.ready;
  const explicitKeyPrefixConfigured = Boolean(cleanValue(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX));
  const explicitKeyPrefixValid = !explicitKeyPrefixConfigured || isObjectStorageKeyPrefix(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX);
  const missingVariables = explicitComplete || usesAttachmentFallback ? [] : statementRequiredEnvNames.filter((name) => !cleanValue(env[name]));
  if (!explicitKeyPrefixValid) missingVariables.push("ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX valid object key prefix");
  const values = usesAttachmentFallback
    ? {
        ...attachmentConfig.values,
        keyPrefix: explicitKeyPrefixValid
          ? cleanKeyPrefix(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX) || defaultStatementExportKeyPrefix
          : defaultStatementExportKeyPrefix,
      }
    : {
        provider: cleanValue(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_PROVIDER) || defaultAttachmentProvider,
        endpoint: cleanValue(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT),
        bucket: cleanValue(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET),
        region: cleanValue(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_REGION) || defaultRegion,
        accessKeyId: cleanValue(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID),
        secretAccessKey: cleanValue(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY),
        sessionToken: cleanValue(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SESSION_TOKEN),
        keyPrefix: explicitKeyPrefixValid
          ? cleanKeyPrefix(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX) || defaultStatementExportKeyPrefix
          : defaultStatementExportKeyPrefix,
        forcePathStyle: parseBoolean(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_FORCE_PATH_STYLE, true),
      };
  const unsupportedProvider = values.provider !== defaultAttachmentProvider;
  return {
    ready: (explicitComplete || usesAttachmentFallback) && !unsupportedProvider && explicitKeyPrefixValid,
    mode: "object_storage",
    values,
    missingVariables,
    explicitConfiguredCount,
    explicitTotalCount: statementRequiredEnvNames.length,
    explicitKeyPrefixConfigured,
    keyPrefixValid: explicitKeyPrefixValid,
    invalidKeyPrefix: explicitKeyPrefixConfigured && !explicitKeyPrefixValid,
    usesAttachmentFallback,
    unsupportedProvider,
    source: usesAttachmentFallback ? "attachment_fallback" : "statement_export",
  };
}

function buildAttachmentConfigCriterion(config) {
  return criterion({
    key: "attachment-object-storage-config",
    label: "附件对象存储配置",
    status: config.ready ? "passed" : "pending",
    detail: config.ready
      ? "附件对象存储 endpoint、bucket、access key、secret key 和 provider 已配置。"
      : config.unsupportedProvider
        ? "附件对象存储 provider 不是当前支持的 s3_compatible。"
        : config.invalidKeyPrefix
          ? "附件对象存储 key prefix 不是合法相对对象 key 前缀。"
          : `缺少：${config.missingVariables.join(", ")}`,
    nextAction: config.ready
      ? "继续执行附件对象存储写入 / 读回 / 清理和签名 URL 探针。"
      : config.invalidKeyPrefix
        ? "把 ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX 改为相对对象 key prefix，不能是 URL、绝对路径、../、反斜杠、空路径段或带空白。"
        : "补齐附件对象存储配置；真实值只放安全 env 文件。",
    evidence: {
      providerS3Compatible: config.values.provider === defaultAttachmentProvider,
      endpointConfigured: Boolean(config.values.endpoint),
      bucketConfigured: Boolean(config.values.bucket),
      accessKeyConfigured: Boolean(config.values.accessKeyId),
      secretKeyConfigured: Boolean(config.values.secretAccessKey),
      sessionTokenConfigured: Boolean(config.values.sessionToken),
      keyPrefixConfigured: config.keyPrefixConfigured,
      keyPrefixValid: config.keyPrefixValid,
      forcePathStyleConfigured: typeof config.values.forcePathStyle === "boolean",
    },
  });
}

function buildStatementConfigCriterion(config) {
  return criterion({
    key: "statement-export-object-storage-config",
    label: "对账导出对象存储配置",
    status: config.ready ? "passed" : "pending",
    detail: config.ready
      ? config.usesAttachmentFallback
        ? "对账导出对象存储使用完整附件对象存储 fallback。"
        : "对账导出对象存储 endpoint、bucket、access key 和 secret key 已独立配置。"
      : config.unsupportedProvider
        ? "对账导出对象存储 provider 不是当前支持的 s3_compatible。"
        : config.invalidKeyPrefix
          ? "对账导出对象存储 key prefix 不是合法相对对象 key 前缀。"
          : `缺少独立配置，且附件对象存储 fallback 不完整：${config.missingVariables.join(", ")}`,
    nextAction: config.ready
      ? "继续执行对账导出对象存储写入 / 读回 / 清理探针。"
      : config.invalidKeyPrefix
        ? "把 ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX 改为相对对象 key prefix，不能是 URL、绝对路径、../、反斜杠、空路径段或带空白。"
        : "补齐对账导出对象存储配置，或保持独立配置为空并补齐附件对象存储 fallback。",
    evidence: {
      explicitConfiguredCount: config.explicitConfiguredCount,
      explicitTotalCount: config.explicitTotalCount,
      usesAttachmentFallback: config.usesAttachmentFallback,
      providerS3Compatible: config.values.provider === defaultAttachmentProvider,
      explicitKeyPrefixConfigured: config.explicitKeyPrefixConfigured,
      keyPrefixConfigured: config.explicitKeyPrefixConfigured || config.usesAttachmentFallback,
      keyPrefixValid: config.keyPrefixValid,
    },
  });
}

async function runAttachmentLiveProbe({ attachmentConfig, fetchImpl, now, runId, signedUrlTtlSeconds, sensitiveValues }) {
  const storage = createAttachmentObjectStorage({
    mode: "object_storage",
    ...attachmentConfig.values,
    fetch: fetchImpl,
    now,
  });
  const attachmentId = `ATT-V1-OBJ-${runId}`;
  const payloadText = `erp-v1-object-storage-preflight attachment ${runId}`;
  const contentPayload = {
    contentType: "text/plain",
    buffer: Buffer.from(payloadText, "utf8"),
  };
  const expectedDigest = createHash("sha256").update(contentPayload.buffer).digest("hex");
  let stored = null;
  let cleanupOk = false;
  let readOk = false;
  let digestOk = false;
  let signedUrlOk = false;
  try {
    stored = await storage.putObject({ attachmentId, fileName: "attachment-proof.txt", contentPayload });
    const read = await storage.readObject({
      attachment: {
        attachmentId,
        storageProvider: stored.storageProvider,
        storageKey: stored.storageKey,
        mimeType: contentPayload.contentType,
      },
    });
    readOk = read?.buffer?.toString("utf8") === payloadText;
    digestOk = stored.contentDigest === expectedDigest && createHash("sha256").update(read?.buffer || "").digest("hex") === expectedDigest;

    try {
      const access = storage.createAccessUrl({
        attachmentId,
        storageKey: stored.storageKey,
        ttlSeconds: signedUrlTtlSeconds,
        now,
      });
      const response = await fetchImpl(access.accessUrl, { method: "GET" });
      const buffer = response?.ok ? Buffer.from(await response.arrayBuffer()) : Buffer.from("");
      signedUrlOk = response?.ok === true && buffer.toString("utf8") === payloadText;
    } catch {
      signedUrlOk = false;
    }
  } catch (error) {
    return [
      failedCriterion({
        key: "attachment-object-storage-live-probe",
        label: "附件对象存储写入 / 读回 / 清理",
        detail: `附件对象存储 live 探针失败：${redactObjectStorageText(error?.message || String(error), sensitiveValues)}`,
        nextAction: "检查附件对象存储 endpoint、bucket 策略、密钥权限、网络和 path-style 配置后重跑。",
      }),
      skippedCriterion({
        key: "attachment-object-storage-signed-url-probe",
        label: "附件对象存储短期访问地址读回",
        detail: "附件对象存储写入 / 读回探针未通过，未继续验证签名 URL。",
        nextAction: "先让附件对象存储写入 / 读回 / 清理探针通过。",
      }),
    ];
  } finally {
    if (stored?.storageKey) {
      try {
        const deleted = await storage.deleteObject({ storageKey: stored.storageKey });
        cleanupOk = deleted.deleted !== false;
      } catch {
        cleanupOk = false;
      }
    }
  }

  return [
    criterion({
      key: "attachment-object-storage-live-probe",
      label: "附件对象存储写入 / 读回 / 清理",
      status: readOk && digestOk && cleanupOk ? "passed" : "pending",
      detail:
        readOk && digestOk && cleanupOk
          ? "附件诊断对象已写入、读回摘要一致，并已删除。"
          : "附件诊断对象写入 / 读回 / 清理未全部通过。",
      nextAction:
        readOk && digestOk && cleanupOk
          ? "保留本预检报告编号，继续做真实附件上传样本和访问审计留证。"
          : "检查 bucket 写读删权限和生命周期策略，确认诊断对象是否残留。",
      evidence: {
        storageProviderObjectStorage: stored?.storageProvider === "object_storage",
        writeOk: Boolean(stored?.storageKey),
        readOk,
        digestOk,
        cleanupOk,
        diagnosticObjectKeyExposed: false,
        payloadExposed: false,
      },
    }),
    criterion({
      key: "attachment-object-storage-signed-url-probe",
      label: "附件对象存储短期访问地址读回",
      status: signedUrlOk ? "passed" : "pending",
      detail: signedUrlOk ? "附件短期签名 URL 已生成并可读回诊断对象。" : "附件短期签名 URL 生成或读回失败。",
      nextAction: signedUrlOk
        ? "现场仍需用真实附件样本验证过期策略和访问审计记录。"
        : "检查对象存储签名算法、path-style / virtual-hosted-style、临时凭证和外网可达性。",
      evidence: {
        signedUrlGenerated: Boolean(stored?.storageKey),
        signedUrlReadOk: signedUrlOk,
        ttlSeconds: signedUrlTtlSeconds,
        signedUrlExposed: false,
      },
    }),
  ];
}

async function runStatementExportLiveProbe({ statementConfig, fetchImpl, now, runId, sensitiveValues }) {
  const storage = createStatementExportObjectStorage({
    mode: "object_storage",
    ...statementConfig.values,
    fetch: fetchImpl,
    now,
  });
  const payloadText = `erp-v1-object-storage-preflight statement export ${runId}`;
  const exportFile = {
    exportFileId: `DL-V1-OBJ-${runId}`,
    statementId: `ST-V1-OBJ-${runId}`,
    previewType: "customer_send",
    downloadToken: `DL-V1-OBJ-${runId}`,
    fileName: "statement-export-proof.xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    content: Buffer.from(payloadText, "utf8").toString("base64"),
    contentEncoding: "base64",
  };
  let stored = null;
  let cleanupOk = false;
  let readOk = false;
  let digestOk = false;
  try {
    stored = await storage.putExportFile({ exportFile });
    const read = await storage.readExportFile({
      exportFile: {
        ...exportFile,
        storageProvider: stored.storageProvider,
        storageKey: stored.storageKey,
      },
    });
    readOk = read?.buffer?.toString("utf8") === payloadText;
    const expectedDigest = `sha256:${createHash("sha256").update(payloadText).digest("hex")}`;
    digestOk = stored.contentDigest === expectedDigest;
  } catch (error) {
    return failedCriterion({
      key: "statement-export-object-storage-live-probe",
      label: "对账导出对象存储写入 / 读回 / 清理",
      detail: `对账导出对象存储 live 探针失败：${redactObjectStorageText(error?.message || String(error), sensitiveValues)}`,
      nextAction: "检查对账导出对象存储 endpoint、bucket 策略、密钥权限、网络和 path-style 配置后重跑。",
    });
  } finally {
    if (stored?.storageKey) {
      try {
        const deleted = await storage.deleteExportFile({ storageKey: stored.storageKey });
        cleanupOk = deleted.deleted !== false;
      } catch {
        cleanupOk = false;
      }
    }
  }
  return criterion({
    key: "statement-export-object-storage-live-probe",
    label: "对账导出对象存储写入 / 读回 / 清理",
    status: readOk && digestOk && cleanupOk ? "passed" : "pending",
    detail:
      readOk && digestOk && cleanupOk
        ? "对账导出诊断对象已写入、读回摘要一致，并已删除。"
        : "对账导出诊断对象写入 / 读回 / 清理未全部通过。",
    nextAction:
      readOk && digestOk && cleanupOk
        ? "保留本预检报告编号，继续用真实客户对账单导出 / 重下载样本留证。"
        : "检查 bucket 写读删权限并确认诊断对象是否残留。",
    evidence: {
      storageProviderObjectStorage: stored?.storageProvider === "object_storage",
      usesAttachmentFallback: statementConfig.usesAttachmentFallback,
      writeOk: Boolean(stored?.storageKey),
      readOk,
      digestOk,
      cleanupOk,
      diagnosticObjectKeyExposed: false,
      payloadExposed: false,
    },
  });
}

function formatProductionObjectStoragePreflight(report) {
  const lines = [
    `V1 production object storage preflight: ${report.ready ? "READY" : "BLOCKED"} (${report.summary.label})`,
    `Env files checked: ${report.envFileCount}`,
    `Env file source: ${report.envFileSourceLabel || productionEnvFileSourceLabel(report.envFileSource)}`,
    "",
    "Criteria:",
  ];
  for (const item of report.criteria) {
    lines.push(`- ${item.status === "passed" ? "PASSED" : item.status === "warning" ? "WARNING" : "BLOCKED"} ${item.label}: ${item.detail}`);
    if (item.nextAction) lines.push(`  - Next: ${item.nextAction}`);
  }
  lines.push(
    "",
    "Safeguards:",
    `- Writes diagnostic objects: ${yesNo(report.safeguards.writesDiagnosticObjects)}`,
    `- Deletes diagnostic objects: ${yesNo(report.safeguards.deletesDiagnosticObjects)}`,
    `- Reads bucket governance: ${yesNo(report.safeguards.readsBucketGovernance)}`,
    `- Business data mutated: ${yesNo(report.safeguards.businessDataMutated)}`,
    `- Endpoint exposed: ${yesNo(report.safeguards.endpointExposed)}`,
    `- Bucket exposed: ${yesNo(report.safeguards.bucketExposed)}`,
    `- Access key exposed: ${yesNo(report.safeguards.accessKeyExposed)}`,
    `- Secret key exposed: ${yesNo(report.safeguards.secretKeyExposed)}`,
    `- Object storage key prefix exposed: ${yesNo(report.safeguards.objectStorageKeyPrefixExposed)}`,
    `- Object key exposed: ${yesNo(report.safeguards.objectKeyExposed)}`,
    `- Signed URL exposed: ${yesNo(report.safeguards.signedUrlExposed)}`,
    `- Env file read from production setup: ${yesNo(report.safeguards.envFileReadFromProductionSetup)}`,
  );
  if (report.nextActions.length > 0) {
    lines.push("", "Next actions:");
    for (const action of report.nextActions.slice(0, 6)) lines.push(`- ${action}`);
  }
  lines.push("");
  return lines.join("\n");
}

function criterion({ key, label, status, detail, nextAction = "", evidence = {}, blocking = true }) {
  return {
    key,
    label,
    status,
    ready: status === "passed",
    blocking,
    detail: redactObjectStorageText(detail),
    nextAction: redactObjectStorageText(nextAction),
    evidence,
  };
}

function failedCriterion({ key, label, detail, nextAction }) {
  return criterion({ key, label, status: "pending", detail, nextAction });
}

function skippedCriterion({ key, label, detail, nextAction }) {
  return criterion({
    key,
    label,
    status: "pending",
    detail,
    nextAction,
    evidence: {
      skipped: true,
    },
  });
}

function redactionCriterion() {
  return criterion({
    key: "object-storage-redaction-safeguard",
    label: "对象存储预检输出脱敏护栏",
    status: "passed",
    detail: "报告只输出变量名、状态、计数和布尔值，不输出对象存储地址、bucket、密钥、对象 key、签名 URL 或 payload。",
    evidence: {
      endpointExposed: false,
      bucketExposed: false,
      accessKeyExposed: false,
      secretKeyExposed: false,
      objectStorageKeyPrefixExposed: false,
      objectKeyExposed: false,
      signedUrlExposed: false,
      payloadExposed: false,
    },
  });
}

function buildNextActions({ ready, blockingCriteria }) {
  if (ready) {
    return [
      "把本预检报告编号或输出留入现场证据：附件对象存储、对账导出对象存储和 bucket 治理读回已通过。",
      "继续补对象存储控制台截图、备份策略负责人确认、访问审计查询和真实业务附件样本。",
      "用真实附件上传、短期访问地址、访问审计和真实客户对账导出样本回填现场证据。",
      "重新执行生产上线组合预检和 release candidate 刷新预检。",
    ];
  }
  return blockingCriteria.slice(0, 6).map((item) => item.nextAction || item.detail);
}

function collectSensitiveValues(env) {
  return [
    ...attachmentRequiredEnvNames,
    ...statementRequiredEnvNames,
    "ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER",
    "ERP_ATTACHMENT_OBJECT_STORAGE_REGION",
    "ERP_ATTACHMENT_OBJECT_STORAGE_SESSION_TOKEN",
    "ERP_ATTACHMENT_OBJECT_STORAGE_KEY_PREFIX",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_PROVIDER",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_REGION",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SESSION_TOKEN",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_KEY_PREFIX",
  ]
    .map((name) => cleanValue(env[name]))
    .filter(Boolean);
}

function redactObjectStorageText(value, sensitiveValues = []) {
  let text = String(value ?? "");
  for (const sensitiveValue of sensitiveValues.filter(Boolean).sort((left, right) => right.length - left.length)) {
    if (sensitiveValue.length < 3) continue;
    text = text.split(sensitiveValue).join("[redacted]");
  }
  return text
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted-url]")
    .replace(/(endpoint|bucket|access[_-]?key|secret|token|credential|signature)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/Credential=([^,\s]+)/g, "Credential=[redacted]")
    .replace(/Signature=([a-f0-9]+)/gi, "Signature=[redacted]")
    .replace(/at \"[^\"\s]+\"/g, 'at "[redacted-host]"')
    .replace(/host=[^\s]+/gi, "host=[redacted-host]");
}

function buildRunId(checkedAt) {
  return String(checkedAt || new Date().toISOString())
    .replace(/[^0-9A-Za-z]+/g, "")
    .slice(0, 20) || "run";
}

function cleanValue(value) {
  const text = String(value ?? "").trim();
  return isPlaceholderValue(text) ? "" : text;
}

function cleanKeyPrefix(value) {
  return cleanValue(value).replace(/^\/+|\/+$/g, "");
}

function isObjectStorageKeyPrefix(value) {
  const raw = String(value ?? "");
  const text = raw.trim();
  if (!text || isPlaceholderValue(text)) return false;
  if (raw !== text) return false;
  if (text.length > 512) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return false;
  if (text.startsWith("/") || text.includes("\\") || /\s/.test(text)) return false;
  const segments = text.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return false;
  return true;
}

function isPlaceholderValue(value) {
  const text = String(value ?? "").trim();
  return /<\s*(REPLACE_WITH|OPTIONAL)_?[A-Z0-9_ -]*\s*>/i.test(text) || /\bREPLACE_WITH_[A-Z0-9_]+\b/i.test(text);
}

function parseBoolean(value, fallback) {
  const text = cleanValue(value);
  if (!text) return fallback;
  return ["1", "true", "yes", "on"].includes(text.toLowerCase());
}

function yesNo(value) {
  return value ? "yes" : "no";
}

export {
  buildProductionObjectStoragePreflight,
  formatProductionObjectStoragePreflight,
  parseArgs,
  redactObjectStorageText,
};
