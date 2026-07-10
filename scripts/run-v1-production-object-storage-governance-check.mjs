#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createS3SignedRequest } from "../server/attachmentObjectStorage.mjs";
import { loadEnvironment } from "./run-v1-production-env-preflight.mjs";
import { redactObjectStorageText } from "./run-v1-production-object-storage-preflight.mjs";
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
const defaultProvider = "s3_compatible";
const defaultRegion = "us-east-1";

if (isCliEntrypoint()) runCli();

async function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const env = loadEnvironment({ envFiles: options.envFiles, baseEnv: process.env });
    const report = await buildProductionObjectStorageGovernanceCheck({
      env,
      envFiles: options.envFiles,
      envFileSource: options.envFileSource,
      envFileSourceSummary: options.envFileSourceSummary,
      envFileFromProductionSetup: options.envFileFromProductionSetup,
    });
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatProductionObjectStorageGovernanceCheck(report));
    }
    process.exit(report.ready ? 0 : 2);
  } catch (error) {
    const message = redactObjectStorageText(error?.message || String(error));
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 production object storage governance check failed: ${message}\n`);
    }
    process.exit(1);
  }
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args) {
  const options = { envFiles: [], json: false, productionEnvSetupJsonPath: defaultProductionEnvSetupJsonPath };
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
    "Usage: node scripts/run-v1-production-object-storage-governance-check.mjs [options]",
    "",
    "Options:",
    "  --env-file <path>                    Load secure production env file. Can be repeated.",
    "  --use-production-env-setup-env-file  Reuse the secure env file recorded by production env setup.",
    "  --production-env-setup-json <path>   Production env setup JSON. Defaults to .erp-local-storage/v1-production-env-setup/latest.json.",
    "  --json                               Print machine-readable JSON.",
    "",
    "Exit codes:",
    "  0  Bucket governance APIs prove required V1 safeguards",
    "  1  Env file / runner error",
    "  2  Governance checks are readable but still blocked for V1 production",
    "",
    "This check reads bucket versioning, lifecycle, encryption and policy metadata. It does not write objects.",
    "The report is redacted: it does not print endpoints, buckets, keys, credentials, signed requests, response bodies or raw policies.",
  ].join("\n");
}

async function buildProductionObjectStorageGovernanceCheck({
  env = process.env,
  envFiles = [],
  envFileSource = envFiles.length ? "cli" : "none",
  envFileSourceSummary = envFiles.length ? `${envFiles.length} 个命令行 env 文件` : "未传入 env 文件",
  envFileFromProductionSetup = false,
  checkedAt = new Date().toISOString(),
  fetchImpl = globalThis.fetch,
  now = new Date(checkedAt),
} = {}) {
  const sensitiveValues = collectSensitiveValues(env);
  const attachmentConfig = buildAttachmentConfig(env);
  const statementConfig = buildStatementExportConfig(env, attachmentConfig);
  const criteria = [
    buildConfigCriterion({
      key: "attachment-object-storage-governance-config",
      label: "附件对象存储 bucket 治理配置",
      config: attachmentConfig,
      readyDetail: "附件对象存储 bucket 治理检查所需 endpoint、bucket、密钥和 provider 已配置。",
      blockedAction: "补齐附件对象存储 endpoint、bucket、access key 和 secret key 后重跑。",
    }),
    buildConfigCriterion({
      key: "statement-export-object-storage-governance-config",
      label: "对账导出对象存储 bucket 治理配置",
      config: statementConfig,
      readyDetail: statementConfig.usesAttachmentFallback
        ? "对账导出对象存储使用附件 bucket fallback，治理检查复用同一个 bucket。"
        : "对账导出对象存储 bucket 治理检查所需 endpoint、bucket、密钥和 provider 已配置。",
      blockedAction: "补齐对账导出对象存储配置，或保持独立配置为空并补齐附件对象存储 fallback。",
    }),
  ];

  const targets = dedupeTargets([attachmentConfig, statementConfig].filter((config) => config.ready));
  for (const target of targets) {
    criteria.push(...(await runTargetGovernanceChecks({ target, fetchImpl, now, sensitiveValues })));
  }
  if (targets.length === 0) {
    criteria.push(skippedCriterion({
      key: "object-storage-bucket-governance-api-checks",
      label: "对象存储 bucket 治理 API 检查",
      detail: "对象存储配置未通过，未读取 bucket 版本控制、生命周期、加密或策略。",
      nextAction: "先补齐对象存储配置并通过 live 写读删预检。",
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
    scope: "v1_production_object_storage_governance_check",
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
      bucketTargetCount: targets.length,
      envFileSource,
      envFileSourceLabel: productionEnvFileSourceLabel(envFileSource),
      envFileFromProductionSetup: Boolean(envFileFromProductionSetup || envFileSource === "production_env_setup"),
    },
    criteria,
    blockingCriteria,
    warningCriteria,
    safeguards: {
      readsBucketGovernanceOnly: true,
      writesDiagnosticObjects: false,
      deletesDiagnosticObjects: false,
      businessDataMutated: false,
      endpointExposed: false,
      bucketExposed: false,
      accessKeyExposed: false,
      secretKeyExposed: false,
      sessionTokenExposed: false,
      signedRequestExposed: false,
      rawPolicyExposed: false,
      rawResponseBodyExposed: false,
      envFileReadFromProductionSetup: Boolean(envFileFromProductionSetup || envFileSource === "production_env_setup"),
    },
    nextActions: buildNextActions({ ready, blockingCriteria, warningCriteria }),
  };
}

function buildAttachmentConfig(env) {
  const values = {
    provider: cleanValue(env.ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER) || defaultProvider,
    endpoint: cleanEndpoint(env.ERP_ATTACHMENT_OBJECT_STORAGE_ENDPOINT),
    bucket: cleanValue(env.ERP_ATTACHMENT_OBJECT_STORAGE_BUCKET),
    region: cleanValue(env.ERP_ATTACHMENT_OBJECT_STORAGE_REGION) || defaultRegion,
    accessKeyId: cleanValue(env.ERP_ATTACHMENT_OBJECT_STORAGE_ACCESS_KEY_ID),
    secretAccessKey: cleanValue(env.ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY),
    sessionToken: cleanValue(env.ERP_ATTACHMENT_OBJECT_STORAGE_SESSION_TOKEN),
    forcePathStyle: parseBoolean(env.ERP_ATTACHMENT_OBJECT_STORAGE_FORCE_PATH_STYLE, true),
  };
  const missingVariables = attachmentRequiredEnvNames.filter((name) => !cleanValue(env[name]));
  const unsupportedProvider = values.provider !== defaultProvider;
  return {
    source: "attachment",
    label: "附件对象存储",
    ready: missingVariables.length === 0 && !unsupportedProvider,
    missingVariables,
    unsupportedProvider,
    usesAttachmentFallback: false,
    values,
  };
}

function buildStatementExportConfig(env, attachmentConfig) {
  const explicitConfiguredCount = statementRequiredEnvNames.filter((name) => cleanValue(env[name])).length;
  const explicitComplete = explicitConfiguredCount === statementRequiredEnvNames.length;
  const usesAttachmentFallback = explicitConfiguredCount === 0 && attachmentConfig.ready;
  const missingVariables = explicitComplete || usesAttachmentFallback ? [] : statementRequiredEnvNames.filter((name) => !cleanValue(env[name]));
  const values = usesAttachmentFallback
    ? { ...attachmentConfig.values }
    : {
        provider: cleanValue(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_PROVIDER) || defaultProvider,
        endpoint: cleanEndpoint(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT),
        bucket: cleanValue(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_BUCKET),
        region: cleanValue(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_REGION) || defaultRegion,
        accessKeyId: cleanValue(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ACCESS_KEY_ID),
        secretAccessKey: cleanValue(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SECRET_ACCESS_KEY),
        sessionToken: cleanValue(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SESSION_TOKEN),
        forcePathStyle: parseBoolean(env.ERP_STATEMENT_EXPORT_OBJECT_STORAGE_FORCE_PATH_STYLE, true),
      };
  const unsupportedProvider = values.provider !== defaultProvider;
  return {
    source: usesAttachmentFallback ? "statement_export_fallback" : "statement_export",
    label: usesAttachmentFallback ? "对账导出对象存储 fallback" : "对账导出对象存储",
    ready: (explicitComplete || usesAttachmentFallback) && !unsupportedProvider,
    missingVariables,
    explicitConfiguredCount,
    explicitTotalCount: statementRequiredEnvNames.length,
    unsupportedProvider,
    usesAttachmentFallback,
    values,
  };
}

function dedupeTargets(configs) {
  const targets = [];
  const byKey = new Map();
  for (const config of configs) {
    const key = [
      config.values.provider,
      config.values.endpoint,
      config.values.bucket,
      config.values.region,
      config.values.accessKeyId,
      config.values.forcePathStyle ? "path" : "virtual",
    ].join("|");
    let target = byKey.get(key);
    if (!target) {
      target = {
        id: `bucket-${targets.length + 1}`,
        labels: [],
        values: config.values,
      };
      byKey.set(key, target);
      targets.push(target);
    }
    target.labels.push(config.label);
  }
  return targets;
}

async function runTargetGovernanceChecks({ target, fetchImpl, now, sensitiveValues }) {
  const [versioning, lifecycle, encryption, policy] = await Promise.all([
    readBucketSubresource({ target, subresource: "versioning", fetchImpl, now, sensitiveValues }),
    readBucketSubresource({ target, subresource: "lifecycle", fetchImpl, now, sensitiveValues }),
    readBucketSubresource({ target, subresource: "encryption", fetchImpl, now, sensitiveValues }),
    readBucketSubresource({ target, subresource: "policy", fetchImpl, now, sensitiveValues }),
  ]);
  return [
    buildVersioningCriterion({ target, result: versioning }),
    buildLifecycleCriterion({ target, result: lifecycle }),
    buildEncryptionCriterion({ target, result: encryption }),
    buildPolicyCriterion({ target, result: policy }),
  ];
}

async function readBucketSubresource({ target, subresource, fetchImpl, now, sensitiveValues }) {
  try {
    const request = createS3SignedRequest({
      config: target.values,
      method: "GET",
      storageKey: "",
      payloadHash: "UNSIGNED-PAYLOAD",
      now,
      queryParams: [[subresource, ""]],
    });
    const response = await fetchImpl(request.url, {
      method: "GET",
      headers: request.headers,
    });
    const text = typeof response?.text === "function" ? await response.text() : "";
    return {
      ok: response?.ok === true,
      status: Number(response?.status) || 0,
      text,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: redactObjectStorageText(error?.message || String(error), sensitiveValues),
      text: "",
    };
  }
}

function buildVersioningCriterion({ target, result }) {
  const statusText = extractXmlTag(result.text, "Status");
  const enabled = result.ok && statusText === "Enabled";
  return criterion({
    key: `${target.id}-versioning-enabled`,
    label: `${targetLabel(target)}版本控制`,
    status: enabled ? "passed" : "pending",
    detail: enabled
      ? "bucket 版本控制已启用，可降低误删或覆盖附件的恢复风险。"
      : result.ok
        ? "bucket 版本控制未启用或状态不可确认。"
        : `bucket 版本控制 API 不可读，HTTP ${result.status || "error"}。`,
    nextAction: enabled
      ? "继续保留控制台截图或本报告作为附件 bucket 备份 / 恢复策略证据的一部分。"
      : "在对象存储控制台启用版本控制，或提供等价备份策略的现场证据并回填 manifest。",
    evidence: {
      bucketTarget: target.id,
      apiReadable: result.ok,
      versioningEnabled: enabled,
      httpStatus: sanitizeStatus(result.status),
    },
  });
}

function buildLifecycleCriterion({ target, result }) {
  const enabledRuleCount = countEnabledLifecycleRules(result.text);
  const passed = result.ok && enabledRuleCount > 0;
  return criterion({
    key: `${target.id}-lifecycle-enabled`,
    label: `${targetLabel(target)}生命周期规则`,
    status: passed ? "passed" : "pending",
    detail: passed
      ? "bucket 生命周期配置可读，且至少有 1 条启用规则。"
      : result.ok
        ? "bucket 生命周期配置可读，但没有启用规则。"
        : `bucket 生命周期 API 不可读，HTTP ${result.status || "error"}。`,
    nextAction: passed
      ? "继续确认诊断对象、临时文件和历史版本保留周期符合现场政策。"
      : "配置生命周期规则，并把控制台截图或本报告回填到 `attachment_bucket_policy_checked` 证据。",
    evidence: {
      bucketTarget: target.id,
      apiReadable: result.ok,
      enabledRuleCount,
      httpStatus: sanitizeStatus(result.status),
    },
  });
}

function buildEncryptionCriterion({ target, result }) {
  const algorithm = extractXmlTag(result.text, "SSEAlgorithm");
  const passed = result.ok && Boolean(algorithm);
  return criterion({
    key: `${target.id}-server-side-encryption`,
    label: `${targetLabel(target)}服务端加密`,
    status: passed ? "passed" : "pending",
    detail: passed
      ? "bucket 默认服务端加密配置可读。"
      : result.ok
        ? "bucket 加密配置可读，但未找到默认加密算法。"
        : `bucket 加密配置 API 不可读，HTTP ${result.status || "error"}。`,
    nextAction: passed
      ? "继续确认密钥权限和访问审计留存策略。"
      : "启用 bucket 默认服务端加密，或提供厂商控制台截图作为等价证据。",
    evidence: {
      bucketTarget: target.id,
      apiReadable: result.ok,
      serverSideEncryptionConfigured: passed,
      algorithmConfigured: Boolean(algorithm),
      httpStatus: sanitizeStatus(result.status),
    },
  });
}

function buildPolicyCriterion({ target, result }) {
  const policyReadable = result.ok && String(result.text || "").trim().length > 0;
  return criterion({
    key: `${target.id}-policy-readable`,
    label: `${targetLabel(target)}权限策略可读性`,
    status: policyReadable ? "passed" : "warning",
    blocking: false,
    detail: policyReadable
      ? "bucket 权限策略可读；报告不会输出原始策略内容。"
      : `bucket policy API 未返回可读策略，HTTP ${result.status || "error"}。`,
    nextAction: policyReadable
      ? "继续由现场负责人确认最小权限和访问审计。"
      : "如果厂商使用 IAM / RAM / CAM 而不是 bucket policy，保留控制台权限截图并回填现场证据。",
    evidence: {
      bucketTarget: target.id,
      apiReadable: result.ok,
      policyReadable,
      policyBodyExposed: false,
      httpStatus: sanitizeStatus(result.status),
    },
  });
}

function buildConfigCriterion({ key, label, config, readyDetail, blockedAction }) {
  return criterion({
    key,
    label,
    status: config.ready ? "passed" : "pending",
    detail: config.ready
      ? readyDetail
      : config.unsupportedProvider
        ? "当前只支持 s3_compatible 对象存储治理检查。"
        : `缺少：${config.missingVariables.join(", ")}`,
    nextAction: config.ready ? "继续读取 bucket 治理 API。" : blockedAction,
    evidence: {
      providerS3Compatible: config.values.provider === defaultProvider,
      endpointConfigured: Boolean(config.values.endpoint),
      bucketConfigured: Boolean(config.values.bucket),
      accessKeyConfigured: Boolean(config.values.accessKeyId),
      secretKeyConfigured: Boolean(config.values.secretAccessKey),
      sessionTokenConfigured: Boolean(config.values.sessionToken),
      usesAttachmentFallback: Boolean(config.usesAttachmentFallback),
      explicitConfiguredCount: config.explicitConfiguredCount,
      explicitTotalCount: config.explicitTotalCount,
    },
  });
}

function criterion({ key, label, status, detail, nextAction = "", evidence = {}, blocking = true }) {
  return {
    key,
    label,
    status,
    ready: status === "passed" || blocking === false,
    blocking,
    detail: redactObjectStorageText(detail),
    nextAction: redactObjectStorageText(nextAction),
    evidence,
  };
}

function skippedCriterion({ key, label, detail, nextAction }) {
  return criterion({
    key,
    label,
    status: "pending",
    detail,
    nextAction,
    evidence: { skipped: true },
  });
}

function redactionCriterion() {
  return criterion({
    key: "object-storage-governance-redaction-safeguard",
    label: "对象存储治理检查输出脱敏护栏",
    status: "passed",
    detail: "报告只输出变量名、状态、计数、HTTP 状态码和布尔值，不输出 endpoint、bucket、密钥、签名请求、bucket policy 或响应正文。",
    evidence: {
      endpointExposed: false,
      bucketExposed: false,
      accessKeyExposed: false,
      secretKeyExposed: false,
      signedRequestExposed: false,
      rawPolicyExposed: false,
      rawResponseBodyExposed: false,
    },
  });
}

function formatProductionObjectStorageGovernanceCheck(report) {
  const lines = [
    `V1 production object storage governance check: ${report.ready ? "READY" : "BLOCKED"} (${report.summary.label})`,
    `Env files checked: ${report.envFileCount}`,
    `Env file source: ${report.envFileSourceLabel || productionEnvFileSourceLabel(report.envFileSource)}`,
    `Bucket targets checked: ${report.summary.bucketTargetCount}`,
    "",
    "Criteria:",
  ];
  for (const item of report.criteria) {
    lines.push(`- ${formatStatus(item.status)} ${item.label}: ${item.detail}`);
    if (item.nextAction) lines.push(`  - Next: ${item.nextAction}`);
  }
  lines.push(
    "",
    "Safeguards:",
    `- Reads bucket governance only: ${yesNo(report.safeguards.readsBucketGovernanceOnly)}`,
    `- Writes diagnostic objects: ${yesNo(report.safeguards.writesDiagnosticObjects)}`,
    `- Business data mutated: ${yesNo(report.safeguards.businessDataMutated)}`,
    `- Endpoint exposed: ${yesNo(report.safeguards.endpointExposed)}`,
    `- Bucket exposed: ${yesNo(report.safeguards.bucketExposed)}`,
    `- Secret key exposed: ${yesNo(report.safeguards.secretKeyExposed)}`,
    `- Signed request exposed: ${yesNo(report.safeguards.signedRequestExposed)}`,
    `- Raw policy exposed: ${yesNo(report.safeguards.rawPolicyExposed)}`,
    `- Env file read from production setup: ${yesNo(report.safeguards.envFileReadFromProductionSetup)}`,
  );
  if (report.nextActions.length > 0) {
    lines.push("", report.ready ? "Next actions:" : "Next blockers:");
    for (const action of report.nextActions.slice(0, 8)) lines.push(`- ${action}`);
  }
  lines.push("");
  return redactObjectStorageText(lines.join("\n"));
}

function buildNextActions({ ready, blockingCriteria, warningCriteria }) {
  if (ready) {
    const actions = [
      "把本治理检查报告和对象存储 live 写读删预检报告一起回填到 `attachment_bucket_policy_checked` 现场证据。",
      "继续用真实附件、真实客户对账导出样本和访问审计记录补齐 object_storage 证据组。",
    ];
    if (warningCriteria.length) actions.push("bucket policy 未自动读到的项目，用对象存储控制台权限截图或 IAM / RAM / CAM 审计记录补证。");
    return actions;
  }
  return blockingCriteria.slice(0, 8).map((item) => item.nextAction || item.detail);
}

function targetLabel(target) {
  return `${target.labels.join(" + ")} `;
}

function extractXmlTag(text, tagName) {
  const match = String(text || "").match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([^<]+)</${tagName}>`, "i"));
  return match ? match[1].trim() : "";
}

function countEnabledLifecycleRules(text) {
  const source = String(text || "");
  const ruleMatches = source.match(/<Rule\b[\s\S]*?<\/Rule>/gi) || [];
  return ruleMatches.filter((rule) => /<Status(?:\s[^>]*)?>\s*Enabled\s*<\/Status>/i.test(rule)).length;
}

function sanitizeStatus(status) {
  const value = Number(status);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function collectSensitiveValues(env) {
  return [
    ...attachmentRequiredEnvNames,
    ...statementRequiredEnvNames,
    "ERP_ATTACHMENT_OBJECT_STORAGE_PROVIDER",
    "ERP_ATTACHMENT_OBJECT_STORAGE_REGION",
    "ERP_ATTACHMENT_OBJECT_STORAGE_SESSION_TOKEN",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_PROVIDER",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_REGION",
    "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_SESSION_TOKEN",
  ]
    .map((name) => cleanValue(env[name]))
    .filter(Boolean);
}

function cleanEndpoint(value) {
  return cleanValue(value).replace(/\/+$/g, "");
}

function cleanValue(value) {
  const text = String(value ?? "").trim();
  return isPlaceholderValue(text) ? "" : text;
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

function formatStatus(status) {
  if (status === "passed") return "PASSED";
  if (status === "warning") return "WARNING";
  return "BLOCKED";
}

function yesNo(value) {
  return value ? "yes" : "no";
}

export {
  buildProductionObjectStorageGovernanceCheck,
  formatProductionObjectStorageGovernanceCheck,
  parseArgs,
};
