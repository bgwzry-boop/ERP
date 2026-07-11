#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  authenticateV1ReadinessRole,
  buildV1ReadinessAuthInput,
} from "./v1ReadinessRuntimeAuth.mjs";

const defaultApiBaseUrl = "http://127.0.0.1:8787/api";
const requiredActionPermissions = ["attachment.view", "statement.preview", "fulfillment.print"];
const requiredDriverActionPermissions = ["delivery.view"];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}

async function runCli() {
try {
  const options = parseArgs(process.argv.slice(2));
  const apiBaseUrl = normalizeApiBaseUrl(
    options.apiBaseUrl ||
      process.env.ERP_V1_READINESS_API_BASE_URL ||
      process.env.VITE_ERP_API_BASE_URL ||
      defaultApiBaseUrl,
  );
  const healthResult = await requestJson(apiBaseUrl, "/health", { headers: {} });
  if (!healthResult.ok) throw new Error(`/health returned HTTP ${healthResult.status}`);
  const operatorAuth = await authenticateV1ReadinessRole({
    apiBaseUrl,
    health: healthResult.json,
    authInput: buildV1ReadinessAuthInput({
      role: "operator",
      overrides: {
        operatorId: options.operatorId ?? process.env.ERP_V1_READINESS_OPERATOR_ID,
        bearerToken: options.bearerToken ?? process.env.ERP_V1_READINESS_TOKEN,
      },
    }),
  });
  const driverAuth = await authenticateV1ReadinessRole({
    apiBaseUrl,
    health: healthResult.json,
    authInput: buildV1ReadinessAuthInput({
      role: "driver",
      overrides: {
        operatorId: options.driverOperatorId ?? process.env.ERP_V1_READINESS_DRIVER_OPERATOR_ID,
        bearerToken: options.driverBearerToken ?? process.env.ERP_V1_READINESS_DRIVER_TOKEN,
      },
    }),
  });
  const responses = await readV1ReadinessSources({
    apiBaseUrl,
    health: healthResult.json,
    headers: operatorAuth.headers,
    driverHeaders: driverAuth.headers,
  });
  assertConfiguredAuthIdentity(operatorAuth, responses.permissions, "operator");
  assertConfiguredAuthIdentity(driverAuth, responses.driverPermissions, "driver");
  responses.authentication = { operator: sanitizeAuthResult(operatorAuth), driver: sanitizeAuthResult(driverAuth) };
  const operatorId = String(responses.permissions?.user?.userId || operatorAuth.operatorId || "").trim();
  const driverOperatorId = String(responses.driverPermissions?.user?.userId || driverAuth.operatorId || "").trim();
  const report = buildV1ReadinessReport({ apiBaseUrl, operatorId, driverOperatorId, responses });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatV1ReadinessReport(report));
  }
  process.exit(report.ready ? 0 : 2);
} catch (error) {
  const message = error?.message || String(error);
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
  } else {
    process.stderr.write(`V1 readiness check failed: ${message}\n`);
  }
  process.exit(1);
}
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--api-base-url") {
      options.apiBaseUrl = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--operator-id") {
      options.operatorId = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--driver-operator-id") {
      options.driverOperatorId = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--bearer-token") {
      options.bearerToken = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--driver-bearer-token") {
      options.driverBearerToken = readValue(args, index, arg);
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

function helpText() {
  return [
    "Usage: node scripts/run-v1-readiness-check.mjs [options]",
    "",
    "Options:",
    "  --api-base-url <url>   ERP API base URL, default http://127.0.0.1:8787/api",
    "  --operator-id <id>     Expected office / management formal user ID",
    "  --driver-operator-id <id> Expected formal driver user ID",
    "  --bearer-token <token> Optional office runtime token; prefer ERP_V1_READINESS_TOKEN in secure env",
    "  --driver-bearer-token <token> Optional driver runtime token; prefer ERP_V1_READINESS_DRIVER_TOKEN",
    "  --json                 Print machine-readable JSON",
    "",
    "Exit codes:",
    "  0  V1 readiness gate is ready",
    "  1  API/read error",
    "  2  Gate is reachable but still blocked",
    "",
    "Production requires formal runtime tokens or secure-env login pairs:",
    "  ERP_V1_READINESS_LOGIN_NAME + ERP_V1_READINESS_PASSWORD",
    "  ERP_V1_READINESS_DRIVER_LOGIN_NAME + ERP_V1_READINESS_DRIVER_PASSWORD",
  ].join("\n");
}

function normalizeApiBaseUrl(value) {
  const baseUrl = String(value || defaultApiBaseUrl).trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("API base URL is required.");
  return baseUrl;
}

function buildHeaders({ operatorId, bearerToken }) {
  const headers = { "content-type": "application/json" };
  if (bearerToken) headers.authorization = `Bearer ${bearerToken}`;
  else if (operatorId) headers["x-erp-user-id"] = operatorId;
  return headers;
}

async function readV1ReadinessSources({ apiBaseUrl, health, headers, driverHeaders }) {
  const openapi = await requestJson(apiBaseUrl, "/openapi/status", { headers, allowHttpError: true });
  if (!openapi.json || typeof openapi.json !== "object") {
    throw new Error(`/openapi/status returned unreadable JSON`);
  }

  const permissions = await requestJson(apiBaseUrl, "/permissions/effective", { headers });
  if (!permissions.ok) throw new Error(`/permissions/effective returned HTTP ${permissions.status}`);
  const driverPermissions = await requestJson(apiBaseUrl, "/permissions/effective", { headers: driverHeaders });
  if (!driverPermissions.ok) throw new Error(`/permissions/effective for driver returned HTTP ${driverPermissions.status}`);

  const actionPermissions = Array.isArray(permissions.json?.actionPermissions)
    ? permissions.json.actionPermissions.map((item) => String(item))
    : [];
  const driverActionPermissions = Array.isArray(driverPermissions.json?.actionPermissions)
    ? driverPermissions.json.actionPermissions.map((item) => String(item))
    : [];

  const responses = {
    health,
    openapi: openapi.json,
    systemPersistence: null,
    permissions: permissions.json,
    driverPermissions: driverPermissions.json,
    attachmentStorage: null,
    attachmentReadiness: null,
    spoolDiagnostics: null,
    cupsDiagnostics: null,
    printReadiness: null,
    driverReadiness: null,
  };

  responses.systemPersistence = await getRequiredJson(apiBaseUrl, "/system/v1-readiness", { headers });

  if (actionPermissions.includes("attachment.view")) {
    responses.attachmentStorage = await getRequiredJson(apiBaseUrl, "/attachments/storage-diagnostics", { headers });
    responses.attachmentReadiness = await getRequiredJson(apiBaseUrl, "/attachments/v1-readiness", { headers });
  }

  if (actionPermissions.includes("fulfillment.print")) {
    responses.spoolDiagnostics = await getRequiredJson(apiBaseUrl, "/print-driver/spool-diagnostics", { headers });
    responses.cupsDiagnostics = await getRequiredJson(apiBaseUrl, "/print-driver/cups-diagnostics", { headers });
    responses.printReadiness = await getRequiredJson(apiBaseUrl, "/print-driver/v1-readiness", { headers });
  }

  if (driverActionPermissions.includes("delivery.view")) {
    responses.driverReadiness = await getRequiredJson(apiBaseUrl, "/driver/v1-readiness", { headers: driverHeaders });
  }

  return responses;
}

function assertConfiguredAuthIdentity(auth, permissions, label) {
  const expectedUserId = String(auth?.operatorId ?? "").trim();
  const actualUserId = String(permissions?.user?.userId ?? "").trim();
  if (expectedUserId && actualUserId && expectedUserId !== actualUserId) {
    throw new Error(`V1 readiness ${label} session identity does not match the configured operator ID.`);
  }
}

function sanitizeAuthResult(auth = {}) {
  return {
    source: String(auth.source ?? ""),
    operatorId: String(auth.operatorId ?? ""),
    formalRuntimeSession: auth.formalRuntimeSession === true,
    legacyIdentityHeaderUsed: auth.legacyIdentityHeaderUsed === true,
    production: auth.production === true,
  };
}

async function getRequiredJson(apiBaseUrl, path, { headers }) {
  const result = await requestJson(apiBaseUrl, path, { headers });
  if (!result.ok) {
    const message = result.json?.error?.message || result.json?.message || `${path} returned HTTP ${result.status}`;
    throw new Error(message);
  }
  return result.json;
}

async function requestJson(apiBaseUrl, path, { headers, allowHttpError = false }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { ...headers, connection: "close" },
      signal: controller.signal,
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok && !allowHttpError) {
      return { ok: false, status: response.status, json };
    }
    return { ok: response.ok, status: response.status, json };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${path} request timed out after 10000ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildV1ReadinessReport({ apiBaseUrl, operatorId, driverOperatorId, responses }) {
  const permissions = normalizePermissions(responses.permissions);
  const missingPermissions = requiredActionPermissions.filter((permission) => !permissions.actionPermissions.includes(permission));
  const driverPermissions = normalizePermissions(responses.driverPermissions);
  const missingDriverPermissions = requiredDriverActionPermissions.filter(
    (permission) => !driverPermissions.actionPermissions.includes(permission),
  );
  const systemPersistence = normalizeSystemPersistenceReadiness(responses.systemPersistence);
  const productionEnvFileApplication = normalizeProductionEnvFileApplication(
    responses.health?.seed?.productionEnvFileApplication,
  );
  const attachmentStorage = normalizeAttachmentStorageDiagnostics(responses.attachmentStorage);
  const attachmentReadiness = normalizeAttachmentV1Readiness(responses.attachmentReadiness);
  const spoolDiagnostics = normalizeSpoolDiagnostics(responses.spoolDiagnostics);
  const cupsDiagnostics = normalizeCupsDiagnostics(responses.cupsDiagnostics);
  const printReadiness = normalizePrintReadiness(responses.printReadiness);
  const driverReadiness = normalizeDriverReadiness(responses.driverReadiness);
  const criteria = [
    buildCriterion({
      key: "api-health",
      label: "API 健康检查",
      passed: responses.health?.status === "ok",
      detail:
        responses.health?.status === "ok"
          ? `服务 ${stringValue(responses.health.service || "erp-p0-api")} 可访问`
          : "API 健康检查未通过",
    }),
    buildCriterion({
      key: "openapi-contract",
      label: "OpenAPI 合同",
      passed: responses.openapi?.valid === true,
      detail:
        responses.openapi?.valid === true
          ? `${numberOrZero(responses.openapi.pathCount)} paths / ${numberOrZero(responses.openapi.schemaCount)} schemas 校验通过`
          : "OpenAPI 草案当前未通过校验",
    }),
    buildCriterion({
      key: "system-v1-persistence",
      label: "系统 V1 持久化门禁",
      passed: systemPersistence.ready === true,
      detail: systemPersistence.ready
        ? "核心仓储持久化门禁全部通过"
        : systemPersistence.available
          ? `系统持久化门禁仍有 ${numberOrZero(systemPersistence.summary.blockingCount)} 项阻塞`
          : "系统持久化门禁未执行",
      evidence: {
        status: systemPersistence.status,
        summary: systemPersistence.summary,
        localRepositoryCount: systemPersistence.localRepositoryCount,
        localMemoryCount: systemPersistence.localMemoryCount,
        localPersistenceAcceptedForV1: systemPersistence.localPersistenceAcceptance.accepted,
      },
    }),
    buildCriterion({
      key: "operator-permissions",
      label: "操作账号权限",
      passed: missingPermissions.length === 0,
      detail:
        missingPermissions.length === 0
          ? `账号 ${permissions.displayName || permissions.userId || operatorId || "token"} 具备 V1 readiness 所需动作权限`
          : `缺少动作权限：${missingPermissions.join(" / ")}`,
      evidence: {
        userId: permissions.userId,
        roles: permissions.roles,
        requiredActionPermissions,
        missingActionPermissions: missingPermissions,
      },
    }),
    buildCriterion({
      key: "driver-operator-permissions",
      label: "司机验收账号权限",
      passed: missingDriverPermissions.length === 0,
      detail:
        missingDriverPermissions.length === 0
          ? `账号 ${driverPermissions.displayName || driverPermissions.userId || driverOperatorId || "driver token"} 具备司机端 readiness 所需动作权限`
          : `缺少动作权限：${missingDriverPermissions.join(" / ")}`,
      evidence: {
        userId: driverPermissions.userId,
        roles: driverPermissions.roles,
        requiredActionPermissions: requiredDriverActionPermissions,
        missingActionPermissions: missingDriverPermissions,
      },
    }),
    buildCriterion({
      key: "attachment-storage-diagnostics",
      label: "附件对象存储诊断",
      passed: attachmentStorage.ready === true,
      detail: attachmentStorage.ready
        ? "附件诊断对象可写、可读、摘要一致且已清理"
        : attachmentStorage.available
          ? "附件对象存储诊断未通过"
          : "当前账号缺少 attachment.view 或诊断未执行",
      evidence: {
        status: attachmentStorage.status,
        storageKind: attachmentStorage.storageKind,
        writeOk: attachmentStorage.writeOk,
        readOk: attachmentStorage.readOk,
        digestOk: attachmentStorage.digestOk,
        cleanupOk: attachmentStorage.cleanupOk,
      },
    }),
    buildCriterion({
      key: "attachment-v1-readiness",
      label: "附件 V1 留档门禁",
      passed: attachmentReadiness.ready === true,
      detail: attachmentReadiness.ready
        ? "附件 V1 留档门禁全部通过"
        : attachmentReadiness.available
          ? `附件 V1 留档门禁仍有 ${numberOrZero(attachmentReadiness.summary.blockingCount)} 项阻塞`
          : "当前账号缺少 attachment.view 或门禁未执行",
      evidence: {
        status: attachmentReadiness.status,
        summary: attachmentReadiness.summary,
        storageKind: attachmentReadiness.storageMode.storageKind,
        storageProvider: attachmentReadiness.storageMode.storageProvider,
        objectStorageLive: attachmentReadiness.storageMode.objectStorageLive,
        localFsAcceptedForV1: attachmentReadiness.storageMode.localFsAcceptedForV1,
      },
    }),
    buildCriterion({
      key: "print-spool-diagnostics",
      label: "打印 spool 状态回读",
      passed: spoolDiagnostics.ready === true,
      detail: spoolDiagnostics.ready
        ? "诊断 spool 可写、pending / completed 可回读且已清理"
        : spoolDiagnostics.available
          ? "打印 spool 状态回读诊断未通过或尚未配置"
          : "当前账号缺少 fulfillment.print 或诊断未执行",
      evidence: {
        status: spoolDiagnostics.status,
        writeOk: spoolDiagnostics.writeOk,
        pendingPollOk: spoolDiagnostics.pendingPollOk,
        completedPollOk: spoolDiagnostics.completedPollOk,
        cleanupOk: spoolDiagnostics.cleanupOk,
      },
    }),
    buildCriterion({
      key: "print-cups-diagnostics",
      label: "CUPS 队列预检",
      passed: cupsDiagnostics.ready === true,
      detail: cupsDiagnostics.ready
        ? "CUPS 队列状态命令可运行且目标队列命中白名单"
        : cupsDiagnostics.available
          ? "CUPS 队列预检未通过或尚未配置"
          : "当前账号缺少 fulfillment.print 或诊断未执行",
      evidence: {
        status: cupsDiagnostics.status,
        cupsPrinterConfigured: cupsDiagnostics.cupsPrinterConfigured,
        cupsPrinterAllowed: cupsDiagnostics.cupsPrinterAllowed,
        cupsStatusCommandConfigured: cupsDiagnostics.cupsStatusCommandConfigured,
        cupsStatusCommandRunnable: cupsDiagnostics.cupsStatusCommandRunnable,
      },
    }),
    buildCriterion({
      key: "print-v1-readiness",
      label: "打印 V1 上线门禁",
      passed: printReadiness.ready === true,
      detail: printReadiness.ready
        ? "打印 V1 门禁全部通过"
        : printReadiness.available
          ? `打印 V1 门禁仍有 ${numberOrZero(printReadiness.summary.blockingCount)} 项阻塞`
          : "当前账号缺少 fulfillment.print 或门禁未执行",
      evidence: {
        status: printReadiness.status,
        summary: printReadiness.summary,
      },
    }),
    buildCriterion({
      key: "driver-v1-readiness",
      label: "司机端 V1 真机门禁",
      passed: driverReadiness.ready === true,
      detail: driverReadiness.ready
        ? "司机端真机门禁全部通过"
        : driverReadiness.available
          ? `司机端 V1 门禁仍有 ${numberOrZero(driverReadiness.summary.blockingCount)} 项阻塞`
          : "当前账号缺少 delivery.view 或门禁未执行",
      evidence: {
        status: driverReadiness.status,
        summary: driverReadiness.summary,
      },
    }),
  ];
  const summary = buildSummary(criteria);
  const remainingV1Risks = buildRemainingV1Risks({
    criteria,
    missingPermissions,
    missingDriverPermissions,
    systemPersistence,
    productionEnvFileApplication,
    attachmentStorage,
    attachmentReadiness,
    spoolDiagnostics,
    cupsDiagnostics,
    printReadiness,
    driverReadiness,
  });
  const safeguards = buildSafeguards({
    attachmentStorage,
    attachmentReadiness,
    systemPersistence,
    productionEnvFileApplication,
    spoolDiagnostics,
    cupsDiagnostics,
    printReadiness,
    driverReadiness,
    authentication: responses.authentication,
  });

  return {
    status: summary.blockingCount === 0 ? "ready" : "blocked",
    ready: summary.blockingCount === 0,
    checkedAt:
      printReadiness.checkedAt ||
      driverReadiness.checkedAt ||
      cupsDiagnostics.checkedAt ||
      spoolDiagnostics.checkedAt ||
      systemPersistence.checkedAt ||
      attachmentReadiness.checkedAt ||
      attachmentStorage.checkedAt ||
      responses.health?.now ||
      new Date().toISOString(),
    apiBaseUrl,
    operatorId,
    driverOperatorId,
    scope: "v1_go_live_readiness",
    summary,
    criteria,
    blockingCriteria: criteria.filter((item) => item.blocking && item.status !== "passed"),
    permissions,
    driverPermissions,
    systemPersistence,
    productionEnvFileApplication,
    attachmentStorage,
    attachmentReadiness,
    spoolDiagnostics,
    cupsDiagnostics,
    printReadiness,
    driverReadiness,
    remainingV1Risks,
    safeguards,
    nextActions: buildNextActions({ summary, criteria, remainingV1Risks }),
  };
}

function normalizePermissions(value = {}) {
  return {
    available: Boolean(value && typeof value === "object"),
    userId: stringValue(value.user?.userId),
    displayName: stringValue(value.user?.displayName),
    roles: Array.isArray(value.roles) ? value.roles.map((item) => stringValue(item)).filter(Boolean) : [],
    actionPermissions: Array.isArray(value.actionPermissions)
      ? value.actionPermissions.map((item) => stringValue(item)).filter(Boolean)
      : [],
  };
}

function normalizeSystemPersistenceReadiness(value) {
  if (!value) {
    return {
      available: false,
      ready: false,
      status: "not_run",
      summary: {},
      criteria: [],
      blockingCriteria: [],
      repositoryGroups: [],
      repositories: [],
      localRepositoryCount: 0,
      localMemoryCount: 0,
      localPersistenceAcceptance: {
        accepted: false,
        reference: "",
      },
      runtimeEmployeeAccountReadiness: normalizeRuntimeEmployeeAccountReadiness(),
      remainingV1Risks: [],
      safeguards: {
        nonMutating: true,
        repositoryPayloadExposed: false,
        connectionStringExposed: false,
        localPathExposed: false,
        requiresPostgresPersistence: true,
        localPersistenceAcceptedForV1: false,
      },
    };
  }
  const criteria = Array.isArray(value.criteria) ? value.criteria.map(normalizeCriterion) : [];
  const repositories = Array.isArray(value.repositories) ? value.repositories.map(normalizeSystemRepository) : [];
  const localPersistenceAcceptance =
    value.localPersistenceAcceptance && typeof value.localPersistenceAcceptance === "object"
      ? value.localPersistenceAcceptance
      : {};
  const safeguards = value.safeguards && typeof value.safeguards === "object" ? value.safeguards : {};
  return {
    available: true,
    status: stringValue(value.status || "unknown"),
    ready: Boolean(value.ready),
    checkedAt: stringValue(value.checkedAt),
    scope: stringValue(value.scope || "v1_system_persistence_readiness"),
    summary: {
      label: stringValue(value.summary?.label || `${criteria.filter((item) => item.status === "passed").length}/${criteria.length} 通过`),
      passedCount: numberOrZero(value.summary?.passedCount),
      totalCount: numberOrZero(value.summary?.totalCount || criteria.length),
      blockingCount: numberOrZero(value.summary?.blockingCount),
    },
    criteria,
    blockingCriteria: criteria.filter((item) => item.blocking && item.status !== "passed"),
    repositoryGroups: Array.isArray(value.repositoryGroups) ? value.repositoryGroups.map(normalizeSystemRepositoryGroup) : [],
    repositories,
    localRepositoryCount: repositories.filter((repository) => repository.localKind).length,
    localMemoryCount: repositories.filter((repository) => repository.kind === "local_memory").length,
    localPersistenceAcceptance: {
      accepted: Boolean(localPersistenceAcceptance.accepted),
      reference: stringValue(localPersistenceAcceptance.reference),
    },
    runtimeEmployeeAccountReadiness: normalizeRuntimeEmployeeAccountReadiness(
      value.runtimeEmployeeAccountReadiness,
    ),
    remainingV1Risks: stringList(value.remainingV1Risks),
    safeguards: {
      nonMutating: safeguards.nonMutating !== false,
      repositoryPayloadExposed: Boolean(safeguards.repositoryPayloadExposed),
      connectionStringExposed: Boolean(safeguards.connectionStringExposed),
      localPathExposed: Boolean(safeguards.localPathExposed),
      requiresPostgresPersistence: safeguards.requiresPostgresPersistence !== false,
      localPersistenceAcceptedForV1: Boolean(safeguards.localPersistenceAcceptedForV1),
    },
  };
}

function normalizeRuntimeEmployeeAccountReadiness(value = {}) {
  return {
    ready: value.ready === true,
    requiredRoleCount: numberOrZero(value.requiredRoleCount),
    coveredRoleCount: numberOrZero(value.coveredRoleCount),
    missingRoleCount: numberOrZero(value.missingRoleCount),
    formalAccountCount: numberOrZero(value.formalAccountCount),
    readyFormalAccountCount: numberOrZero(value.readyFormalAccountCount),
    roles: Array.isArray(value.roles)
      ? value.roles.map((role) => ({
          roleKey: stringValue(role.roleKey),
          roleLabel: stringValue(role.roleLabel),
          ready: role.ready === true,
          accountCount: numberOrZero(role.accountCount),
          readyAccountCount: numberOrZero(role.readyAccountCount),
          blockers: Array.isArray(role.blockers)
            ? role.blockers.map((blocker) => ({
                code: stringValue(blocker.code),
                label: stringValue(blocker.label),
                count: numberOrZero(blocker.count),
              }))
            : [],
        }))
      : [],
  };
}

function normalizeSystemRepositoryGroup(value = {}) {
  return {
    key: stringValue(value.key),
    label: stringValue(value.label),
    ready: Boolean(value.ready),
    acceptedByLocalPolicy: Boolean(value.acceptedByLocalPolicy),
    repositoryCount: numberOrZero(value.repositoryCount),
    productionReadyCount: numberOrZero(value.productionReadyCount),
    localRepositoryCount: numberOrZero(value.localRepositoryCount),
    localMemoryCount: numberOrZero(value.localMemoryCount),
    localJsonCount: numberOrZero(value.localJsonCount),
    localFsCount: numberOrZero(value.localFsCount),
    repositories: Array.isArray(value.repositories) ? value.repositories.map(normalizeSystemRepository) : [],
  };
}

function normalizeSystemRepository(value = {}) {
  return {
    key: stringValue(value.key),
    label: stringValue(value.label),
    kind: stringValue(value.kind),
    productionReady: Boolean(value.productionReady),
    localKind: Boolean(value.localKind),
  };
}

function normalizeProductionEnvFileApplication(value) {
  if (!value || typeof value !== "object") {
    return {
      available: false,
      status: "not_reported",
      ready: false,
      applied: false,
      selectedEnvVariable: "",
      selectedSourceKind: "none",
      selectedEnvVariableLabel: "未上报",
      configuredEnvFileCount: 0,
      configuredSourceVariableCount: 0,
      configuredApplicationSourceVariableCount: 0,
      configuredAuditOnlySourceVariableCount: 0,
      fallbackSourceUsed: false,
      auditOnlySourceConfigured: false,
      ignoredConfiguredFallbackVariableCount: 0,
      sourceStatuses: [],
      assignmentCount: 0,
      auditReady: false,
      auditStatus: "not_reported",
      auditBlockingCount: 0,
      auditWarningCount: 0,
      nextAction: "当前 API 健康检查未上报生产 env 启动应用状态；请使用包含 productionEnvFileApplication 的 API 版本重启后再做生产上线组合预检。",
      safeguards: {
        startupOnly: true,
        processEnvMutated: false,
        auditRequiredBeforeApply: true,
        auditOnlyPathApplied: false,
        frontendPathAccepted: false,
        envFilePathExposed: false,
        rawEnvFileIncluded: false,
        rawEnvFileAuditIncluded: false,
        rawLineContentIncluded: false,
        envValuesIncluded: false,
        secretValuesIncluded: false,
        commandValuesIncluded: false,
        connectionStringExposed: false,
        objectStorageEndpointExposed: false,
        objectStorageBucketExposed: false,
        localPathExposed: false,
      },
    };
  }
  const safeguards = value.safeguards && typeof value.safeguards === "object" ? value.safeguards : {};
  return {
    available: true,
    scope: stringValue(value.scope || "v1_production_env_file_startup_application"),
    status: stringValue(value.status || "unknown"),
    ready: Boolean(value.ready),
    applied: Boolean(value.applied),
    selectedEnvVariable: stringValue(value.selectedEnvVariable),
    selectedSourceKind: stringValue(value.selectedSourceKind || "none"),
    selectedEnvVariableLabel: stringValue(value.selectedEnvVariableLabel),
    configuredEnvFileCount: numberOrZero(value.configuredEnvFileCount),
    configuredSourceVariableCount: numberOrZero(value.configuredSourceVariableCount),
    configuredApplicationSourceVariableCount: numberOrZero(value.configuredApplicationSourceVariableCount),
    configuredAuditOnlySourceVariableCount: numberOrZero(value.configuredAuditOnlySourceVariableCount),
    fallbackSourceUsed: Boolean(value.fallbackSourceUsed),
    auditOnlySourceConfigured: Boolean(value.auditOnlySourceConfigured),
    ignoredConfiguredFallbackVariableCount: numberOrZero(value.ignoredConfiguredFallbackVariableCount),
    sourceStatuses: Array.isArray(value.sourceStatuses)
      ? value.sourceStatuses.map(normalizeProductionEnvFileApplicationSourceStatus)
      : [],
    assignmentCount: numberOrZero(value.assignmentCount),
    auditReady: Boolean(value.auditReady),
    auditStatus: stringValue(value.auditStatus || "unknown"),
    auditBlockingCount: numberOrZero(value.auditBlockingCount),
    auditWarningCount: numberOrZero(value.auditWarningCount),
    nextAction: stringValue(value.nextAction),
    safeguards: {
      startupOnly: safeguards.startupOnly !== false,
      processEnvMutated: Boolean(safeguards.processEnvMutated),
      auditRequiredBeforeApply: safeguards.auditRequiredBeforeApply !== false,
      auditOnlyPathApplied: Boolean(safeguards.auditOnlyPathApplied),
      frontendPathAccepted: Boolean(safeguards.frontendPathAccepted),
      envFilePathExposed: Boolean(safeguards.envFilePathExposed),
      rawEnvFileIncluded: Boolean(safeguards.rawEnvFileIncluded),
      rawEnvFileAuditIncluded: Boolean(safeguards.rawEnvFileAuditIncluded),
      rawLineContentIncluded: Boolean(safeguards.rawLineContentIncluded),
      envValuesIncluded: Boolean(safeguards.envValuesIncluded),
      secretValuesIncluded: Boolean(safeguards.secretValuesIncluded),
      commandValuesIncluded: Boolean(safeguards.commandValuesIncluded),
      connectionStringExposed: Boolean(safeguards.connectionStringExposed),
      objectStorageEndpointExposed: Boolean(safeguards.objectStorageEndpointExposed),
      objectStorageBucketExposed: Boolean(safeguards.objectStorageBucketExposed),
      localPathExposed: Boolean(safeguards.localPathExposed),
    },
  };
}

function normalizeProductionEnvFileApplicationSourceStatus(value = {}) {
  return {
    envVariable: stringValue(value.envVariable),
    kind: stringValue(value.kind),
    label: stringValue(value.label),
    order: numberOrZero(value.order),
    configured: Boolean(value.configured),
    selected: Boolean(value.selected),
    ignored: Boolean(value.ignored),
    ignoredForApplication: Boolean(value.ignoredForApplication),
    envFileCount: numberOrZero(value.envFileCount),
  };
}

function normalizeAttachmentStorageDiagnostics(value) {
  if (!value) return { available: false, ready: false, status: "not_run", blockers: [], safeguards: { secretFieldsExposed: false } };
  return {
    available: true,
    status: stringValue(value.status || "unknown"),
    ready: Boolean(value.ready),
    checkedAt: stringValue(value.checkedAt),
    storageKind: stringValue(value.storageKind || value.storageProvider),
    storageProvider: stringValue(value.storageProvider),
    configured: value.configured !== false,
    missingConfigFields: stringList(value.missingConfigFields),
    writeOk: Boolean(value.writeOk),
    readOk: Boolean(value.readOk),
    digestOk: Boolean(value.digestOk),
    cleanupOk: Boolean(value.cleanupOk),
    safeguards: {
      secretFieldsExposed: Boolean(value.secretFieldsExposed),
    },
  };
}

function normalizeAttachmentV1Readiness(value) {
  if (!value) {
    return {
      available: false,
      ready: false,
      status: "not_run",
      summary: {},
      criteria: [],
      blockingCriteria: [],
      storageMode: {
        storageKind: "",
        storageProvider: "",
        objectStorageLive: false,
        localFsAcceptedForV1: false,
      },
      remainingV1Risks: [],
      safeguards: {
        nonMutating: true,
        diagnosticObjectCleanedUp: false,
        secretFieldsExposed: false,
        requiresObjectStorageLive: true,
        localStorageAcceptedForV1: false,
        payloadExposed: false,
      },
    };
  }
  const criteria = Array.isArray(value.criteria) ? value.criteria.map(normalizeCriterion) : [];
  const storageMode = value.storageMode && typeof value.storageMode === "object" ? value.storageMode : {};
  const safeguards = value.safeguards && typeof value.safeguards === "object" ? value.safeguards : {};
  return {
    available: true,
    status: stringValue(value.status || "unknown"),
    ready: Boolean(value.ready),
    checkedAt: stringValue(value.checkedAt),
    scope: stringValue(value.scope || "v1_attachment_storage_readiness"),
    summary: {
      label: stringValue(value.summary?.label || `${criteria.filter((item) => item.status === "passed").length}/${criteria.length} 通过`),
      passedCount: numberOrZero(value.summary?.passedCount),
      totalCount: numberOrZero(value.summary?.totalCount || criteria.length),
      blockingCount: numberOrZero(value.summary?.blockingCount),
    },
    criteria,
    blockingCriteria: criteria.filter((item) => item.blocking && item.status !== "passed"),
    storageMode: {
      storageKind: stringValue(storageMode.storageKind),
      storageProvider: stringValue(storageMode.storageProvider),
      objectStorageLive: Boolean(storageMode.objectStorageLive),
      localFsAcceptedForV1: Boolean(storageMode.localFsAcceptedForV1),
      acceptanceReference: stringValue(storageMode.acceptanceReference),
    },
    remainingV1Risks: stringList(value.remainingV1Risks),
    safeguards: {
      nonMutating: safeguards.nonMutating !== false,
      diagnosticObjectCleanedUp: Boolean(safeguards.diagnosticObjectCleanedUp),
      secretFieldsExposed: Boolean(safeguards.secretFieldsExposed),
      requiresObjectStorageLive: safeguards.requiresObjectStorageLive !== false,
      localStorageAcceptedForV1: Boolean(safeguards.localStorageAcceptedForV1),
      payloadExposed: Boolean(safeguards.payloadExposed),
    },
  };
}

function normalizeSpoolDiagnostics(value) {
  if (!value) return { available: false, ready: false, status: "not_run", blockers: [], safeguards: { nonPrinting: true } };
  const safeguards = value.safeguards && typeof value.safeguards === "object" ? value.safeguards : {};
  return {
    available: true,
    status: stringValue(value.status || "unknown"),
    ready: Boolean(value.ready),
    checkedAt: stringValue(value.checkedAt),
    scope: stringValue(value.scope || "non_printing_command_bridge_spool_diagnostics"),
    statusReadback: stringValue(value.statusReadback || "spool_file"),
    writeOk: Boolean(value.writeOk),
    pendingPollOk: Boolean(value.pendingPollOk),
    completedPollOk: Boolean(value.completedPollOk),
    cleanupOk: Boolean(value.cleanupOk),
    blockers: Array.isArray(value.blockers) ? value.blockers.map(normalizeBlocker) : [],
    safeguards: {
      nonPrinting: safeguards.nonPrinting !== false,
      commandValueExposed: Boolean(safeguards.commandValueExposed || value.commandValueExposed),
      commandArgsExposed: Boolean(safeguards.commandArgsExposed || value.commandArgsExposed),
      spoolPathExposed: Boolean(safeguards.spoolPathExposed || value.spoolPathExposed),
      payloadExposed: Boolean(safeguards.payloadExposed || value.payloadExposed),
      physicalPrinterCalled: Boolean(safeguards.physicalPrinterCalled || value.physicalPrinterCalled),
    },
  };
}

function normalizeCupsDiagnostics(value) {
  if (!value) return { available: false, ready: false, status: "not_run", blockers: [], safeguards: { nonPrinting: true } };
  const preflight = value.preflightResult && typeof value.preflightResult === "object" ? value.preflightResult : {};
  const safeguards = value.safeguards && typeof value.safeguards === "object" ? value.safeguards : {};
  return {
    available: true,
    status: stringValue(value.status || "unknown"),
    ready: Boolean(value.ready),
    checkedAt: stringValue(value.checkedAt),
    scope: stringValue(value.scope || "non_printing_cups_queue_preflight"),
    cupsQueueStatusReadback: stringValue(value.cupsQueueStatusReadback || "cups_status_command"),
    cupsPrinterConfigured: Boolean(value.cupsPrinterConfigured),
    cupsPrinterAllowed: Boolean(value.cupsPrinterAllowed),
    cupsStatusCommandConfigured: Boolean(value.cupsStatusCommandConfigured),
    cupsStatusCommandRunnable: Boolean(value.cupsStatusCommandRunnable),
    stdoutBytes: numberOrZero(preflight.stdoutBytes),
    stderrBytes: numberOrZero(preflight.stderrBytes),
    errorCode: stringValue(preflight.errorCode),
    message: stringValue(preflight.message),
    blockers: Array.isArray(value.blockers) ? value.blockers.map(normalizeBlocker) : [],
    safeguards: {
      nonPrinting: safeguards.nonPrinting !== false,
      physicalPrinterCalled: Boolean(safeguards.physicalPrinterCalled || value.physicalPrinterCalled),
      commandValueExposed: Boolean(safeguards.commandValueExposed || value.commandValueExposed),
      commandArgsExposed: Boolean(safeguards.commandArgsExposed || value.commandArgsExposed),
      stdoutExposed: Boolean(safeguards.stdoutExposed || value.stdoutExposed),
      stderrExposed: Boolean(safeguards.stderrExposed || value.stderrExposed),
      payloadExposed: Boolean(safeguards.payloadExposed),
      printFileCreated: Boolean(safeguards.printFileCreated),
    },
  };
}

function normalizePrintReadiness(value) {
  if (!value) return { available: false, ready: false, status: "not_run", summary: {}, criteria: [], blockingCriteria: [] };
  const criteria = Array.isArray(value.criteria) ? value.criteria.map(normalizeCriterion) : [];
  return {
    available: true,
    status: stringValue(value.status || "unknown"),
    ready: Boolean(value.ready),
    checkedAt: stringValue(value.checkedAt),
    scope: stringValue(value.scope || "v1_print_go_live_readiness"),
    summary: {
      label: stringValue(value.summary?.label || `${criteria.filter((item) => item.status === "passed").length}/${criteria.length} 通过`),
      passedCount: numberOrZero(value.summary?.passedCount),
      totalCount: numberOrZero(value.summary?.totalCount || criteria.length),
      blockingCount: numberOrZero(value.summary?.blockingCount),
    },
    criteria,
    blockingCriteria: criteria.filter((item) => item.blocking && item.status !== "passed"),
    deviceReadiness: Array.isArray(value.deviceReadiness) ? value.deviceReadiness.map(normalizePrintDeviceReadiness) : [],
    remainingV1Risks: stringList(value.remainingV1Risks),
    safeguards: normalizePrintSafeguards(value.safeguards),
  };
}

function normalizeDriverReadiness(value) {
  if (!value) return { available: false, ready: false, status: "not_run", summary: {}, criteria: [], blockingCriteria: [] };
  const criteria = Array.isArray(value.criteria) ? value.criteria.map(normalizeCriterion) : [];
  return {
    available: true,
    status: stringValue(value.status || "unknown"),
    ready: Boolean(value.ready),
    checkedAt: stringValue(value.checkedAt),
    scope: stringValue(value.scope || "v1_driver_mobile_readiness"),
    summary: {
      label: stringValue(value.summary?.label || `${criteria.filter((item) => item.status === "passed").length}/${criteria.length} 通过`),
      passedCount: numberOrZero(value.summary?.passedCount),
      totalCount: numberOrZero(value.summary?.totalCount || criteria.length),
      blockingCount: numberOrZero(value.summary?.blockingCount),
    },
    criteria,
    blockingCriteria: criteria.filter((item) => item.blocking && item.status !== "passed"),
    deliveryTaskReadiness: {
      total: numberOrZero(value.deliveryTaskReadiness?.total),
      sampleFulfillmentIds: stringList(value.deliveryTaskReadiness?.sampleFulfillmentIds),
    },
    latestFieldTestRecordId: stringValue(value.latestFieldTestRecord?.recordId),
    nativeBridgeDiagnostics: {
      label: stringValue(value.nativeBridgeDiagnostics?.label),
      supportedCount: numberOrZero(value.nativeBridgeDiagnostics?.supportedCount),
      total: numberOrZero(value.nativeBridgeDiagnostics?.total),
    },
    packageLabelScanSample: {
      sampleId: stringValue(value.packageLabelScanSample?.sampleId),
      method: stringValue(value.packageLabelScanSample?.method),
      result: stringValue(value.packageLabelScanSample?.result),
      matchedPackageId: stringValue(value.packageLabelScanSample?.matchedPackageId),
    },
    remainingV1Risks: stringList(value.remainingV1Risks),
    safeguards: normalizeDriverSafeguards(value.safeguards),
  };
}

function normalizePrintDeviceReadiness(value = {}) {
  return {
    key: stringValue(value.key),
    label: stringValue(value.label),
    ready: Boolean(value.ready),
    documentTypes: stringList(value.documentTypes),
    printDevice: value.printDevice
      ? {
          printDeviceId: stringValue(value.printDevice.printDeviceId),
          name: stringValue(value.printDevice.name),
          deviceType: stringValue(value.printDevice.deviceType),
          driverMode: stringValue(value.printDevice.driverMode),
        }
      : null,
    latestFieldTestRecordId: stringValue(value.latestFieldTestRecord?.recordId),
  };
}

function normalizeDriverSafeguards(value = {}) {
  return {
    nonMutating: value.nonMutating !== false,
    deliveryStatusChanged: Boolean(value.deliveryStatusChanged),
    requiresNativeShell: value.requiresNativeShell !== false,
    browserOnlyNotReady: Boolean(value.browserOnlyNotReady),
    physicalLabelScanRequired: value.physicalLabelScanRequired !== false,
    navigationAppRequired: value.navigationAppRequired !== false,
    payloadExposed: Boolean(value.payloadExposed),
  };
}

function normalizePrintSafeguards(value = {}) {
  return {
    nonPrinting: value.nonPrinting !== false,
    physicalPrinterCalled: Boolean(value.physicalPrinterCalled),
    commandValueExposed: Boolean(value.commandValueExposed),
    commandArgsExposed: Boolean(value.commandArgsExposed),
    spoolPathExposed: Boolean(value.spoolPathExposed),
    payloadExposed: Boolean(value.payloadExposed),
  };
}

function buildCriterion({ key, label, passed, detail, evidence = {}, blocking = true }) {
  return {
    key,
    label,
    status: passed ? "passed" : "pending",
    blocking: Boolean(blocking),
    detail: stringValue(detail),
    evidence,
  };
}

function normalizeCriterion(value = {}) {
  return {
    key: stringValue(value.key || "unknown"),
    label: stringValue(value.label || value.key || "门禁项"),
    status: stringValue(value.status || "pending"),
    blocking: Boolean(value.blocking),
    detail: stringValue(value.detail),
  };
}

function normalizeBlocker(value = {}) {
  return {
    key: stringValue(value.key || "blocker"),
    label: stringValue(value.label || value.key || "阻塞项"),
    detail: stringValue(value.detail),
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
  };
}

function buildRemainingV1Risks({
  criteria,
  missingPermissions,
  missingDriverPermissions,
  systemPersistence,
  attachmentStorage,
  attachmentReadiness,
  spoolDiagnostics,
  cupsDiagnostics,
  printReadiness,
  driverReadiness,
}) {
  const risks = [];
  if (missingPermissions.length) risks.push(`readiness 操作账号缺少权限：${missingPermissions.join(" / ")}`);
  if (missingDriverPermissions.length) risks.push(`司机验收账号缺少权限：${missingDriverPermissions.join(" / ")}`);
  for (const item of criteria) {
    if (item.blocking && item.status !== "passed") risks.push(`${item.label}：${item.detail}`);
  }
  for (const risk of systemPersistence.remainingV1Risks ?? []) risks.push(risk);
  if (
    systemPersistence.safeguards?.repositoryPayloadExposed ||
    systemPersistence.safeguards?.connectionStringExposed ||
    systemPersistence.safeguards?.localPathExposed
  ) {
    risks.push("系统持久化门禁输出疑似暴露业务数据、连接串或本地路径");
  }
  if (attachmentStorage.safeguards?.secretFieldsExposed) risks.push("附件存储诊断输出疑似暴露密钥字段");
  if (attachmentReadiness.safeguards?.secretFieldsExposed) risks.push("附件 V1 留档门禁输出疑似暴露密钥字段");
  for (const risk of attachmentReadiness.remainingV1Risks ?? []) risks.push(risk);
  if (spoolDiagnostics.safeguards?.physicalPrinterCalled || cupsDiagnostics.safeguards?.physicalPrinterCalled) {
    risks.push("诊断过程中出现物理打印调用标记，需立即复核安全边界");
  }
  for (const risk of printReadiness.remainingV1Risks ?? []) risks.push(risk);
  for (const risk of driverReadiness.remainingV1Risks ?? []) risks.push(risk);
  if (criteria.every((item) => item.status === "passed")) {
    risks.push("总门禁通过后仍需真实设备出纸、纸张对位、条码扫码、真机拍照和现场签认抽检");
  }
  return [...new Set(risks)].filter(Boolean);
}

function buildSafeguards({
  attachmentStorage,
  attachmentReadiness,
  systemPersistence,
  productionEnvFileApplication,
  spoolDiagnostics,
  cupsDiagnostics,
  printReadiness,
  driverReadiness,
  authentication = {},
}) {
  return {
    formalRuntimeAuthentication:
      authentication.operator?.formalRuntimeSession === true &&
      authentication.driver?.formalRuntimeSession === true,
    legacyIdentityHeaderUsed:
      authentication.operator?.legacyIdentityHeaderUsed === true ||
      authentication.driver?.legacyIdentityHeaderUsed === true,
    operatorAuthSource: String(authentication.operator?.source ?? "unknown"),
    driverAuthSource: String(authentication.driver?.source ?? "unknown"),
    systemReadOnly: systemPersistence.safeguards?.nonMutating !== false,
    systemRepositoryPayloadExposed: Boolean(systemPersistence.safeguards?.repositoryPayloadExposed),
    systemConnectionStringExposed: Boolean(systemPersistence.safeguards?.connectionStringExposed),
    systemLocalPathExposed: Boolean(systemPersistence.safeguards?.localPathExposed),
    systemRequiresPostgresPersistence: systemPersistence.safeguards?.requiresPostgresPersistence !== false,
    systemLocalPersistenceAcceptedForV1: Boolean(systemPersistence.safeguards?.localPersistenceAcceptedForV1),
    productionEnvFileApplicationReported: productionEnvFileApplication.available === true,
    productionEnvAppliedToProcess: productionEnvFileApplication.applied === true,
    productionEnvFileAuditReadyBeforeApply: productionEnvFileApplication.auditReady === true,
    productionEnvFilePathExposed: Boolean(productionEnvFileApplication.safeguards?.envFilePathExposed),
    productionEnvValuesIncluded: Boolean(productionEnvFileApplication.safeguards?.envValuesIncluded),
    productionEnvSecretValuesIncluded: Boolean(productionEnvFileApplication.safeguards?.secretValuesIncluded),
    productionEnvCommandValuesIncluded: Boolean(productionEnvFileApplication.safeguards?.commandValuesIncluded),
    nonPrinting:
      spoolDiagnostics.safeguards?.nonPrinting !== false &&
      cupsDiagnostics.safeguards?.nonPrinting !== false &&
      printReadiness.safeguards?.nonPrinting !== false,
    physicalPrinterCalled: Boolean(
      spoolDiagnostics.safeguards?.physicalPrinterCalled ||
        cupsDiagnostics.safeguards?.physicalPrinterCalled ||
        printReadiness.safeguards?.physicalPrinterCalled,
    ),
    commandValueExposed: Boolean(
      spoolDiagnostics.safeguards?.commandValueExposed ||
        cupsDiagnostics.safeguards?.commandValueExposed ||
        printReadiness.safeguards?.commandValueExposed,
    ),
    commandArgsExposed: Boolean(
      spoolDiagnostics.safeguards?.commandArgsExposed ||
        cupsDiagnostics.safeguards?.commandArgsExposed ||
        printReadiness.safeguards?.commandArgsExposed,
    ),
    stdoutExposed: Boolean(cupsDiagnostics.safeguards?.stdoutExposed),
    stderrExposed: Boolean(cupsDiagnostics.safeguards?.stderrExposed),
    spoolPathExposed: Boolean(spoolDiagnostics.safeguards?.spoolPathExposed || printReadiness.safeguards?.spoolPathExposed),
    payloadExposed: Boolean(
      spoolDiagnostics.safeguards?.payloadExposed ||
        cupsDiagnostics.safeguards?.payloadExposed ||
        printReadiness.safeguards?.payloadExposed,
    ),
    printFileCreated: Boolean(cupsDiagnostics.safeguards?.printFileCreated),
    secretFieldsExposed: Boolean(
      attachmentStorage.safeguards?.secretFieldsExposed ||
        attachmentReadiness.safeguards?.secretFieldsExposed,
    ),
    attachmentReadOnly: attachmentReadiness.safeguards?.nonMutating !== false,
    attachmentRequiresObjectStorageLive: attachmentReadiness.safeguards?.requiresObjectStorageLive !== false,
    attachmentLocalStorageAcceptedForV1: Boolean(attachmentReadiness.safeguards?.localStorageAcceptedForV1),
    attachmentPayloadExposed: Boolean(attachmentReadiness.safeguards?.payloadExposed),
    driverReadOnly: driverReadiness.safeguards?.nonMutating !== false,
    driverDeliveryStatusChanged: Boolean(driverReadiness.safeguards?.deliveryStatusChanged),
    driverRequiresNativeShell: driverReadiness.safeguards?.requiresNativeShell !== false,
    driverBrowserOnlyNotReady: Boolean(driverReadiness.safeguards?.browserOnlyNotReady),
    driverPayloadExposed: Boolean(driverReadiness.safeguards?.payloadExposed),
  };
}

function buildNextActions({ summary, criteria, remainingV1Risks }) {
  if (summary.blockingCount === 0) {
    return [
      "用真实生产 API 环境运行本 runner，并保存 JSON 报告。",
      "继续做真实打印出纸、纸张对位、条码扫码、司机真机和对象存储 live 验收。",
    ];
  }
  const actions = criteria
    .filter((item) => item.blocking && item.status !== "passed")
    .slice(0, 5)
    .map((item) => `${item.label}：${item.detail || "补齐该门禁证据"}`);
  return actions.length ? actions : remainingV1Risks.slice(0, 5);
}

function formatV1ReadinessReport(report) {
  const lines = [
    `V1 readiness: ${report.ready ? "READY" : "BLOCKED"}`,
    `API: ${report.apiBaseUrl}`,
    `Operator: ${report.permissions.displayName || report.operatorId || "token"}`,
    `Driver operator: ${report.driverPermissions.displayName || report.driverOperatorId || "driver token"}`,
    `Gate: ${report.summary.label}; blockers ${report.summary.blockingCount}`,
    "",
    "Criteria:",
  ];
  for (const item of report.criteria) {
    lines.push(`- [${item.status === "passed" ? "passed" : "pending"}] ${item.label}: ${item.detail}`);
  }
  lines.push(
    "",
    `System persistence: ${report.systemPersistence.ready ? "READY" : "BLOCKED"} (${report.systemPersistence.summary?.label || report.systemPersistence.status})`,
    `Attachment storage: ${report.attachmentStorage.ready ? "READY" : "BLOCKED"} (${report.attachmentStorage.status})`,
    `Attachment V1 storage gate: ${report.attachmentReadiness.ready ? "READY" : "BLOCKED"} (${report.attachmentReadiness.summary?.label || report.attachmentReadiness.status})`,
    `Print spool: ${report.spoolDiagnostics.ready ? "READY" : "BLOCKED"} (${report.spoolDiagnostics.status})`,
    `CUPS preflight: ${report.cupsDiagnostics.ready ? "READY" : "BLOCKED"} (${report.cupsDiagnostics.status})`,
    `Print V1 gate: ${report.printReadiness.ready ? "READY" : "BLOCKED"} (${report.printReadiness.summary?.label || report.printReadiness.status})`,
    `Driver V1 gate: ${report.driverReadiness.ready ? "READY" : "BLOCKED"} (${report.driverReadiness.summary?.label || report.driverReadiness.status})`,
    `System persistence is read-only: ${yesNo(
      report.safeguards.systemReadOnly &&
        !report.safeguards.systemRepositoryPayloadExposed &&
        !report.safeguards.systemConnectionStringExposed &&
        !report.safeguards.systemLocalPathExposed,
    )}`,
    `No physical print in diagnostics: ${yesNo(!report.safeguards.physicalPrinterCalled && !report.safeguards.printFileCreated)}`,
    `Attachment readiness is read-only: ${yesNo(report.safeguards.attachmentReadOnly && !report.safeguards.attachmentPayloadExposed)}`,
    `Driver readiness is read-only: ${yesNo(report.safeguards.driverReadOnly && !report.safeguards.driverDeliveryStatusChanged)}`,
  );
  if (report.blockingCriteria.length) {
    lines.push("", "Blocking criteria:");
    for (const item of report.blockingCriteria) {
      lines.push(`- ${item.label}: ${item.detail || item.status}`);
    }
  }
  if (report.remainingV1Risks.length) {
    lines.push("", "Remaining V1 risks:");
    for (const risk of report.remainingV1Risks.slice(0, 10)) {
      lines.push(`- ${risk}`);
    }
  }
  if (report.nextActions.length) {
    lines.push("", "Next actions:");
    for (const action of report.nextActions) {
      lines.push(`- ${action}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter(Boolean);
}

function stringValue(value) {
  return String(value ?? "").trim();
}

function numberOrZero(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
}

function yesNo(value) {
  return value ? "yes" : "no";
}

export {
  buildHeaders,
  buildV1ReadinessReport,
  readV1ReadinessSources,
};
