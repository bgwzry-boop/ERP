#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OFFICIAL_BASE_URL = "https://v2-api.delicloud.com";
const DEFAULT_ROUTE_PATH = "/v1/punches/query";
const relevantEnvNames = [
  "DELI_EPLUS_APP_KEY",
  "DELI_EPLUS_APP_SECRET",
  "DELI_EPLUS_API_BASE_URL",
  "DELI_EPLUS_PAGE_SIZE",
  "DELI_EPLUS_MAX_PAGES",
  "DELI_EPLUS_TIMEOUT_MS",
  "DELI_ATTENDANCE_GATEWAY_DATABASE_URL",
  "DELI_ATTENDANCE_GATEWAY_TOKEN",
  "DELI_ATTENDANCE_GATEWAY_HOST",
  "DELI_ATTENDANCE_GATEWAY_PORT",
  "DELI_ATTENDANCE_GATEWAY_PATH",
];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const env = loadEnvironment({ envFiles: options.envFiles, baseEnv: process.env });
    const envFileAudit = auditEnvFiles(options.envFiles);
    const report = buildDeliAttendanceGatewayProductionPreflight({
      env,
      envFileCount: options.envFiles.length,
      envFileAudit,
    });
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
    process.exit(report.ready ? 0 : 2);
  } catch (error) {
    const message = sanitizeMessage(error?.message || String(error));
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
    } else {
      process.stderr.write(`Deli attendance gateway production preflight failed: ${message}\n`);
    }
    process.exit(1);
  }
}

function parseArgs(args) {
  const options = { envFiles: [], json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--env-file") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--env-file requires a value.");
      options.envFiles.push(value);
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

function helpText() {
  return [
    "Usage: node scripts/run-deli-attendance-gateway-production-preflight.mjs [options]",
    "",
    "Options:",
    "  --env-file <path>  Load the dedicated gateway env file. Can be repeated.",
    "  --json             Print machine-readable redacted JSON.",
    "",
    "Exit codes:",
    "  0  Gateway production configuration is ready for a controlled live precheck",
    "  1  Env file / runner error",
    "  2  Configuration is readable but blocked",
    "",
    "This check never connects to Deli or PostgreSQL and never prints secret values.",
  ].join("\n");
}

function loadEnvironment({ envFiles, baseEnv }) {
  const env = { ...baseEnv };
  for (const envFile of envFiles) {
    const fullPath = resolve(envFile);
    if (!existsSync(fullPath)) throw new Error("Gateway env file not found.");
    Object.assign(env, parseEnvFile(readFileSync(fullPath, "utf8")));
  }
  return env;
}

function parseEnvFile(content) {
  const result = {};
  for (const rawLine of String(content ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const equalsIndex = normalized.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = normalized.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    result[key] = unquoteEnvValue(normalized.slice(equalsIndex + 1).trim());
  }
  return result;
}

function unquoteEnvValue(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  const hashIndex = value.search(/\s#/);
  return hashIndex >= 0 ? value.slice(0, hashIndex).trim() : value;
}

export function buildDeliAttendanceGatewayProductionPreflight({
  env = {},
  envFileCount = 0,
  envFileAudit = {},
} = {}) {
  const criteria = [
    buildSecureEnvFileCriterion({ envFileCount, envFileAudit }),
    buildCredentialCriterion(env),
    buildOfficialApiCriterion(env),
    buildIncrementalSafetyCriterion(env),
    buildPersistentDatabaseCriterion(env),
    buildGatewayBoundaryCriterion(env),
    buildSecretIsolationCriterion(env),
    buildRedactionCriterion(),
  ];
  const blockingCriteria = criteria.filter((item) => item.status !== "passed");
  const passedCount = criteria.length - blockingCriteria.length;
  return {
    status: blockingCriteria.length ? "blocked" : "ready",
    ready: blockingCriteria.length === 0,
    scope: "deli_attendance_gateway_production_preflight",
    checkedAt: new Date().toISOString(),
    envFileCount,
    summary: {
      label: `${passedCount}/${criteria.length} 通过`,
      passedCount,
      totalCount: criteria.length,
      blockingCount: blockingCriteria.length,
      configuredVariableCount: countConfigured(env, relevantEnvNames),
      placeholderValueCount: relevantEnvNames.filter((name) => isPlaceholderValue(env[name])).length,
    },
    criteria,
    blockingCriteria,
    safeguards: {
      nonMutating: true,
      networkRequested: false,
      databaseConnected: false,
      appKeyExposed: false,
      appSecretExposed: false,
      gatewayTokenExposed: false,
      databaseUrlExposed: false,
      secretValuesAcceptedFromCliArguments: false,
    },
    nextActions: blockingCriteria.length
      ? blockingCriteria.map((item) => item.nextAction)
      : [
          "在受控服务器上使用专用低权限账号启动网关。",
          "先执行健康检查，再执行一个小时间窗的真实只读同步预检。",
          "真实只读证据通过前，不得把得力考勤来源标记为现场已验收。",
        ],
  };
}

function buildSecureEnvFileCriterion({ envFileCount, envFileAudit }) {
  const exactlyOneFile = envFileCount === 1;
  const regularFile = envFileAudit.regularFiles === 1;
  const permissionsRestricted = envFileAudit.permissionsRestricted === 1;
  const symlinksRejected = envFileAudit.symbolicLinks === 0;
  const passed = exactlyOneFile && regularFile && permissionsRestricted && symlinksRejected;
  return criterion({
    key: "secure-gateway-env-file",
    label: "专用网关env文件安全",
    passed,
    detail: passed
      ? "使用一个普通、非符号链接且组/其他用户不可读写的专用env文件。"
      : "正式预检必须通过 --env-file 读取一个非符号链接普通文件，且权限不得向group/other开放。",
    evidence: { exactlyOneFile, regularFile, permissionsRestricted, symlinksRejected },
    nextAction: "将专用env文件设为受控所有者和0600权限，再重新运行生产预检。",
  });
}

function buildCredentialCriterion(env) {
  const appKeyReady = hasSecretValue(env.DELI_EPLUS_APP_KEY, 4);
  const appSecretReady = hasSecretValue(env.DELI_EPLUS_APP_SECRET, 8);
  const gatewayTokenReady = hasSecretValue(env.DELI_ATTENDANCE_GATEWAY_TOKEN, 32);
  return criterion({
    key: "deli-credentials",
    label: "得力凭证与网关令牌",
    passed: appKeyReady && appSecretReady && gatewayTokenReady,
    detail: appKeyReady && appSecretReady && gatewayTokenReady
      ? "得力凭证与高强度网关令牌已从环境提供。"
      : "缺少真实得力 App-Key/App-Secret，或网关令牌长度不足32位。",
    evidence: { appKeyReady, appSecretReady, gatewayTokenReady },
    nextAction: "把真实凭证写入权限0600的专用网关 env 文件；不得写入ERP env、Git或聊天记录。",
  });
}

function buildOfficialApiCriterion(env) {
  const rawBaseUrl = cleanText(env.DELI_EPLUS_API_BASE_URL) || OFFICIAL_BASE_URL;
  const target = parseUrl(rawBaseUrl);
  const officialHttpsTarget = target.parsed
    && target.protocol === "https:"
    && target.hostname === "v2-api.delicloud.com"
    && target.port === ""
    && (target.pathname === "/" || target.pathname === "")
    && !target.hasCredentials;
  return criterion({
    key: "official-deli-api",
    label: "得力官方API目标",
    passed: officialHttpsTarget,
    detail: officialHttpsTarget
      ? "上游固定为得力官方HTTPS云接口。"
      : "DELI_EPLUS_API_BASE_URL 必须是 https://v2-api.delicloud.com，且不得带账号、端口或路径。",
    evidence: { parsed: target.parsed, officialHttpsTarget },
    nextAction: "恢复官方服务地址，不要把测试代理或带凭证URL带入生产网关。",
  });
}

function buildIncrementalSafetyCriterion(env) {
  const pageSize = positiveInteger(env.DELI_EPLUS_PAGE_SIZE, 500);
  const maxPages = positiveInteger(env.DELI_EPLUS_MAX_PAGES, 400);
  const timeoutMs = positiveInteger(env.DELI_EPLUS_TIMEOUT_MS, 10_000);
  const pageSizeValid = pageSize >= 1 && pageSize <= 500;
  const maxPagesValid = maxPages >= 1 && maxPages <= 2000;
  const timeoutValid = timeoutMs >= 100 && timeoutMs <= 120_000;
  return criterion({
    key: "incremental-query-safety",
    label: "增量同步安全上限",
    passed: pageSizeValid && maxPagesValid && timeoutValid,
    detail: pageSizeValid && maxPagesValid && timeoutValid
      ? "分页、最大页数与超时均在实现的安全范围内。"
      : "page size、最大页数或超时超出安全范围。",
    evidence: { pageSizeValid, maxPagesValid, timeoutValid },
    nextAction: "使用 page_size 1-500、max_pages 1-2000、timeout 100-120000ms 的受控配置。",
  });
}

function buildPersistentDatabaseCriterion(env) {
  const configured = hasValue(env.DELI_ATTENDANCE_GATEWAY_DATABASE_URL);
  const target = parsePostgresUrl(env.DELI_ATTENDANCE_GATEWAY_DATABASE_URL);
  return criterion({
    key: "persistent-gateway-database",
    label: "持久化游标与脱敏缓存",
    passed: configured && target.valid,
    detail: configured && target.valid
      ? "网关已配置PostgreSQL，用于持久化next_id与最小化打卡缓存。"
      : "缺少有效的 DELI_ATTENDANCE_GATEWAY_DATABASE_URL PostgreSQL连接串。",
    evidence: { configured, postgresUrlValid: target.valid, databaseNamePresent: target.databaseNamePresent },
    nextAction: "配置只允许访问得力游标/缓存表的受限PostgreSQL账号，并先执行迁移0042。",
  });
}

function buildGatewayBoundaryCriterion(env) {
  const host = cleanText(env.DELI_ATTENDANCE_GATEWAY_HOST) || "127.0.0.1";
  const port = positiveInteger(env.DELI_ATTENDANCE_GATEWAY_PORT, 8792);
  const routePath = cleanText(env.DELI_ATTENDANCE_GATEWAY_PATH) || DEFAULT_ROUTE_PATH;
  const loopbackOnly = new Set(["127.0.0.1", "::1", "localhost"]).has(host.toLowerCase());
  const portValid = port >= 1 && port <= 65_535;
  const routePathExact = routePath === DEFAULT_ROUTE_PATH;
  return criterion({
    key: "loopback-gateway-boundary",
    label: "网关监听与反向代理边界",
    passed: loopbackOnly && portValid && routePathExact,
    detail: loopbackOnly && portValid && routePathExact
      ? "网关仅监听loopback，并使用固定查询路径。"
      : "网关必须只监听loopback，并固定使用 /v1/punches/query。",
    evidence: { loopbackOnly, portValid, routePathExact },
    nextAction: "将公网TLS交给Nginx/Caddy；Node网关不要直接监听公网地址。",
  });
}

function buildSecretIsolationCriterion(env) {
  const values = [
    cleanText(env.DELI_EPLUS_APP_KEY),
    cleanText(env.DELI_EPLUS_APP_SECRET),
    cleanText(env.DELI_ATTENDANCE_GATEWAY_TOKEN),
  ].filter(Boolean);
  const unique = new Set(values).size === values.length;
  return criterion({
    key: "secret-isolation",
    label: "三类身份相互隔离",
    passed: values.length === 3 && unique,
    detail: values.length === 3 && unique
      ? "App-Key、App-Secret与网关Bearer令牌相互不同。"
      : "App-Key、App-Secret与网关令牌必须分别配置，禁止复用。",
    evidence: { allThreeConfigured: values.length === 3, allDistinct: unique },
    nextAction: "分别生成并保管三类身份；ERP只持有网关Bearer令牌。",
  });
}

function buildRedactionCriterion() {
  return criterion({
    key: "preflight-redaction",
    label: "预检脱敏边界",
    passed: true,
    detail: "报告只输出布尔状态、计数和固定指导，不输出凭证、连接串或路径。",
    evidence: { secretValuesExposed: false, connectionStringExposed: false, envPathExposed: false },
    nextAction: "保留当前脱敏检查，并在现场报告中只引用受控证据编号。",
  });
}

function criterion({ key, label, passed, detail, evidence, nextAction }) {
  return { key, label, status: passed ? "passed" : "pending", blocking: true, detail, evidence, nextAction };
}

function formatReport(report) {
  const lines = [
    `得力考勤网关生产预检：${report.ready ? "READY" : "BLOCKED"}`,
    `通过：${report.summary.passedCount}/${report.summary.totalCount}`,
    `阻塞：${report.summary.blockingCount}`,
    "",
  ];
  for (const item of report.criteria) {
    lines.push(`[${item.status === "passed" ? "通过" : "阻塞"}] ${item.label}：${item.detail}`);
  }
  lines.push("", "下一步：", ...report.nextActions.map((item) => `- ${item}`), "");
  return lines.join("\n");
}

function parseUrl(value) {
  try {
    const url = new URL(cleanText(value));
    return {
      parsed: true,
      protocol: url.protocol,
      hostname: url.hostname.toLowerCase(),
      port: url.port,
      pathname: url.pathname,
      hasCredentials: Boolean(url.username || url.password),
    };
  } catch {
    return { parsed: false, protocol: "", hostname: "", port: "", pathname: "", hasCredentials: false };
  }
}

function parsePostgresUrl(value) {
  try {
    const url = new URL(cleanText(value));
    const databaseNamePresent = url.pathname.replace(/^\/+/, "").length > 0;
    return {
      valid: ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname) && databaseNamePresent,
      databaseNamePresent,
    };
  } catch {
    return { valid: false, databaseNamePresent: false };
  }
}

function auditEnvFiles(envFiles) {
  let regularFiles = 0;
  let permissionsRestricted = 0;
  let symbolicLinks = 0;
  for (const envFile of envFiles) {
    const fullPath = resolve(envFile);
    const linkStatus = lstatSync(fullPath);
    if (linkStatus.isSymbolicLink()) {
      symbolicLinks += 1;
      continue;
    }
    const status = statSync(fullPath);
    if (status.isFile()) regularFiles += 1;
    if (status.isFile() && (status.mode & 0o077) === 0) permissionsRestricted += 1;
  }
  return { regularFiles, permissionsRestricted, symbolicLinks };
}

function positiveInteger(value, fallback) {
  if (!hasValue(value)) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function hasSecretValue(value, minimumLength) {
  const text = cleanText(value);
  return text.length >= minimumLength && !isPlaceholderValue(text);
}

function isPlaceholderValue(value) {
  const text = cleanText(value).toLowerCase();
  if (!text) return false;
  return text.includes("<replace")
    || text.includes("<restricted")
    || text.includes("changeme")
    || text.includes("example")
    || text.includes("placeholder")
    || text === "todo";
}

function countConfigured(env, names) {
  return names.filter((name) => hasValue(env[name]) && !isPlaceholderValue(env[name])).length;
}

function hasValue(value) {
  return cleanText(value).length > 0;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function sanitizeMessage(message) {
  const text = cleanText(message);
  return text.replace(/(?:postgres(?:ql)?:\/\/|https?:\/\/)[^\s]+/gi, "[redacted-target]");
}

export { auditEnvFiles, formatReport, helpText, loadEnvironment, parseEnvFile };
