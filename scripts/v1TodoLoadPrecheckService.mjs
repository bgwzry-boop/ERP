import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { normalizeConfiguredV1ApiBaseUrl } from "../server/services/v1ApiTargetPolicy.mjs";
import { authenticateV1ReadinessRole } from "./v1ReadinessRuntimeAuth.mjs";

const limits = Object.freeze({
  requestCount: 2_000,
  concurrency: 50,
  pageSize: 200,
  timeoutMs: 30_000,
  maxP95Ms: 60_000,
});

export async function runV1TodoLoadPrecheck({
  apiBaseUrl,
  confirmed = false,
  authInput,
  requestCount = 100,
  concurrency = 10,
  pageSize = 100,
  timeoutMs = 5_000,
  maxP95Ms = 1_000,
  maxErrorRate = 0,
  checkedAt = new Date().toISOString(),
  fetchImpl = globalThis.fetch,
  nowMs = () => performance.now(),
} = {}) {
  if (confirmed !== true) {
    throw new Error("Read-load confirmation is required before any API request is sent.");
  }
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");
  if (typeof nowMs !== "function") throw new Error("A monotonic clock is required.");

  const normalizedApiBaseUrl = normalizeConfiguredV1ApiBaseUrl(apiBaseUrl);
  const config = validateConfig({ requestCount, concurrency, pageSize, timeoutMs, maxP95Ms, maxErrorRate });
  const target = describeTarget(normalizedApiBaseUrl);
  let authentication;

  try {
    authentication = await authenticateV1ReadinessRole({
      apiBaseUrl: normalizedApiBaseUrl,
      runtimeMode: "production",
      health: { seed: { runtimeConfig: { mode: "production", production: true } } },
      authInput,
      fetchImpl,
      timeoutMs: config.timeoutMs,
    });
  } catch (error) {
    return buildAuthenticationBlockedReport({ checkedAt, config, target, error });
  }

  if (authentication.formalRuntimeSession !== true || authentication.legacyIdentityHeaderUsed === true) {
    return buildAuthenticationBlockedReport({
      checkedAt,
      config,
      target,
      error: new Error("The precheck requires a formal runtime session and rejects legacy identity headers."),
    });
  }

  const sessionProbe = await requestJson({
    apiBaseUrl: normalizedApiBaseUrl,
    path: "/auth/me",
    headers: authentication.headers,
    timeoutMs: config.timeoutMs,
    fetchImpl,
  });
  const formalSessionVerified =
    sessionProbe.ok === true &&
    sessionProbe.body?.authenticated === true &&
    sessionProbe.body?.session?.sessionType === "runtime" &&
    Boolean(cleanText(sessionProbe.body?.permissions?.user?.userId));
  if (!formalSessionVerified) {
    return buildAuthenticationBlockedReport({
      checkedAt,
      config,
      target,
      error: new Error(
        sessionProbe.ok
          ? "The authenticated session is not a server-verified formal runtime session."
          : `Formal runtime session verification returned HTTP ${sessionProbe.statusCode || 0}.`,
      ),
      authSource: authentication.source,
    });
  }

  const overallStartedAt = nowMs();
  const attempts = await runBoundedWorkers({
    count: config.requestCount,
    concurrency: config.concurrency,
    task: () =>
      requestTodoPage({
        apiBaseUrl: normalizedApiBaseUrl,
        headers: authentication.headers,
        pageSize: config.pageSize,
        timeoutMs: config.timeoutMs,
        fetchImpl,
        nowMs,
      }),
  });
  const elapsedMs = Math.max(0, nowMs() - overallStartedAt);
  return buildCompletedReport({
    checkedAt,
    config,
    target,
    authSource: authentication.source,
    attempts,
    elapsedMs,
  });
}

function validateConfig(values) {
  const config = {
    requestCount: boundedInteger(values.requestCount, "requestCount", 1, limits.requestCount),
    concurrency: boundedInteger(values.concurrency, "concurrency", 1, limits.concurrency),
    pageSize: boundedInteger(values.pageSize, "pageSize", 1, limits.pageSize),
    timeoutMs: boundedInteger(values.timeoutMs, "timeoutMs", 100, limits.timeoutMs),
    maxP95Ms: boundedNumber(values.maxP95Ms, "maxP95Ms", 1, limits.maxP95Ms),
    maxErrorRate: boundedNumber(values.maxErrorRate, "maxErrorRate", 0, 1),
  };
  if (config.concurrency > config.requestCount) {
    throw new Error("concurrency must not exceed requestCount.");
  }
  return config;
}

function describeTarget(apiBaseUrl) {
  const parsed = new URL(apiBaseUrl);
  const hostname = parsed.hostname.toLowerCase();
  return {
    protocol: parsed.protocol.replace(":", ""),
    loopback: hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1",
    apiPathValidated: true,
    embeddedCredentials: false,
    addressExposed: false,
  };
}

async function runBoundedWorkers({ count, concurrency, task }) {
  const results = new Array(count);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < count) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function requestTodoPage({ apiBaseUrl, headers, pageSize, timeoutMs, fetchImpl, nowMs }) {
  const startedAt = nowMs();
  const response = await requestJson({
    apiBaseUrl,
    path: `/todos?status=all&page=1&pageSize=${pageSize}`,
    headers,
    timeoutMs,
    fetchImpl,
  });
  const latencyMs = Math.max(0, nowMs() - startedAt);
  if (!response.ok) {
    return {
      ok: false,
      latencyMs,
      category: response.category,
      statusCode: response.statusCode,
    };
  }

  const items = response.body?.items;
  if (!Array.isArray(items)) {
    return { ok: false, latencyMs, category: "contract", statusCode: response.statusCode };
  }
  const serverSortValid = items.every((item, index) => Number(item?.serverSortIndex) === index);
  const reminderPolicyValid =
    response.body?.reminderPolicy?.source === "server" &&
    cleanText(response.body?.reminderPolicy?.version) !== "";
  if (!serverSortValid || !reminderPolicyValid) {
    return {
      ok: false,
      latencyMs,
      category: !serverSortValid ? "server_sort_contract" : "reminder_policy_contract",
      statusCode: response.statusCode,
      serverSortValid,
      reminderPolicyValid,
    };
  }
  return {
    ok: true,
    latencyMs,
    statusCode: response.statusCode,
    itemCount: items.length,
    serverSortValid,
    reminderPolicyValid,
    snapshotSignature: hashSnapshot(items),
  };
}

async function requestJson({ apiBaseUrl, path, headers, timeoutMs, fetchImpl }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${apiBaseUrl}${path}`, {
      method: "GET",
      headers: { accept: "application/json", authorization: headers.authorization },
      signal: controller.signal,
    });
    const raw = await response.text();
    let body = {};
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        return { ok: false, statusCode: response.status, category: "invalid_json", body: {} };
      }
    }
    if (!response.ok) {
      return { ok: false, statusCode: response.status, category: `http_${response.status}`, body: {} };
    }
    return { ok: true, statusCode: response.status, category: "ok", body };
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      category: error?.name === "AbortError" ? "timeout" : "network",
      body: {},
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildCompletedReport({ checkedAt, config, target, authSource, attempts, elapsedMs }) {
  const successful = attempts.filter((item) => item.ok);
  const failures = attempts.filter((item) => !item.ok);
  const latencies = attempts.map((item) => item.latencyMs);
  const p50Ms = percentile(latencies, 0.5);
  const p95Ms = percentile(latencies, 0.95);
  const maxMs = latencies.length ? Math.max(...latencies) : 0;
  const errorRate = config.requestCount ? failures.length / config.requestCount : 1;
  const errorRatePassed = errorRate <= config.maxErrorRate;
  const latencyPassed = p95Ms <= config.maxP95Ms;
  const loadExecuted = attempts.length === config.requestCount && successful.length > 0;
  const contractPassed = successful.length > 0 && failures.every((item) => item.category !== "contract") &&
    attempts.every((item) => !["server_sort_contract", "reminder_policy_contract", "invalid_json"].includes(item.category));
  const snapshotVariantCount = new Set(successful.map((item) => item.snapshotSignature)).size;
  const snapshotChanged = snapshotVariantCount > 1;
  const ready = loadExecuted && errorRatePassed && latencyPassed && contractPassed;
  const stages = [
    passedStage("formal-runtime-auth", "正式运行时会话", "服务端已验证正式runtime会话。"),
    resultStage({
      key: "todo-read-load",
      label: "待办只读负载",
      ready: loadExecuted,
      detail: `${successful.length}/${config.requestCount} 次GET成功，错误率 ${formatPercent(errorRate)}。`,
      nextAction: "检查HTTP状态分布、网络和API日志后重跑。",
    }),
    resultStage({
      key: "todo-server-contract",
      label: "服务端提醒与排序合同",
      ready: contractPassed,
      detail: contractPassed
        ? "成功响应均包含连续serverSortIndex和服务端提醒策略。"
        : "至少一个响应缺少有效serverSortIndex、提醒策略或JSON结构。",
      nextAction: "先修复待办列表服务端排序/提醒响应合同，再执行容量预检查。",
    }),
    resultStage({
      key: "todo-latency-threshold",
      label: "待办读取延迟阈值",
      ready: latencyPassed,
      detail: `P95 ${formatMs(p95Ms)}，阈值 ${formatMs(config.maxP95Ms)}。`,
      nextAction: "检查数据库查询、连接池、网络和实例资源，降低P95后重跑。",
    }),
    resultStage({
      key: "todo-error-rate-threshold",
      label: "待办读取错误率阈值",
      ready: errorRatePassed,
      detail: `错误率 ${formatPercent(errorRate)}，阈值 ${formatPercent(config.maxErrorRate)}。`,
      nextAction: "消除超时、权限或5xx错误后重跑。",
    }),
  ];
  const warnings = snapshotChanged
    ? [{ key: "snapshot_changed", detail: "负载期间待办快照发生变化；每次响应内部排序仍单独校验。" }]
    : [];
  return sanitizeReport({
    scope: "v1_todo_load_precheck",
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt,
    target,
    config,
    authentication: {
      source: cleanText(authSource),
      formalRuntimeSession: true,
      serverVerified: true,
      sessionType: "runtime",
      identityExposed: false,
    },
    summary: {
      label: `${stages.filter((item) => item.ready).length}/${stages.length} 通过`,
      requestCount: config.requestCount,
      successCount: successful.length,
      errorCount: failures.length,
      errorRate: round(errorRate, 6),
      elapsedMs: round(elapsedMs),
      throughputPerSecond: elapsedMs > 0 ? round((config.requestCount * 1000) / elapsedMs, 2) : 0,
      latencyMs: { p50: round(p50Ms), p95: round(p95Ms), max: round(maxMs) },
      snapshotVariantCount,
      snapshotChanged,
      warningCount: warnings.length,
    },
    errorBreakdown: buildErrorBreakdown(failures),
    stages,
    blockingStages: stages.filter((item) => !item.ready),
    warnings,
    safeguards: buildSafeguards(config),
    nextActions: stages.filter((item) => !item.ready).map((item) => item.nextAction).filter(Boolean),
  });
}

function buildAuthenticationBlockedReport({ checkedAt, config, target, error, authSource = "none" }) {
  const stage = resultStage({
    key: "formal-runtime-auth",
    label: "正式运行时会话",
    ready: false,
    detail: publicErrorMessage(error),
    nextAction: "使用正式runtime token，或用正式登录名和密码换取会话后重跑；seed和旧身份请求头均不接受。",
  });
  return sanitizeReport({
    scope: "v1_todo_load_precheck",
    status: "blocked",
    ready: false,
    checkedAt,
    target,
    config,
    authentication: {
      source: cleanText(authSource),
      formalRuntimeSession: false,
      serverVerified: false,
      sessionType: "unknown",
      identityExposed: false,
    },
    summary: {
      label: "0/1 通过",
      requestCount: config.requestCount,
      successCount: 0,
      errorCount: 0,
      errorRate: 0,
      elapsedMs: 0,
      throughputPerSecond: 0,
      latencyMs: { p50: 0, p95: 0, max: 0 },
      snapshotVariantCount: 0,
      snapshotChanged: false,
      warningCount: 0,
    },
    errorBreakdown: [],
    stages: [stage],
    blockingStages: [stage],
    warnings: [],
    safeguards: buildSafeguards(config),
    nextActions: [stage.nextAction],
  });
}

function buildSafeguards(config) {
  return {
    explicitReadLoadConfirmation: true,
    businessReadOnly: true,
    businessDataMutated: false,
    businessProbeMethod: "GET",
    onlyAuthenticationLoginMayUsePost: true,
    legacyIdentityHeaderUsed: false,
    formalRuntimeAuthenticationRequired: true,
    requestCountBounded: config.requestCount <= limits.requestCount,
    concurrencyBounded: config.concurrency <= limits.concurrency,
    responsePayloadStored: false,
    todoIdentityStored: false,
    credentialsExposed: false,
    apiAddressExposed: false,
    embeddedApiCredentialsAllowed: false,
    physicalPrinterCalled: false,
  };
}

function passedStage(key, label, detail) {
  return { key, label, status: "passed", ready: true, detail, nextAction: "" };
}

function resultStage({ key, label, ready, detail, nextAction }) {
  return { key, label, status: ready ? "passed" : "blocked", ready, detail, nextAction: ready ? "" : nextAction };
}

function buildErrorBreakdown(failures) {
  const counts = new Map();
  for (const item of failures) {
    const key = cleanText(item.category) || "unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, count]) => ({ category, count }));
}

function hashSnapshot(items) {
  const ids = items.map((item) => cleanText(item?.todoId || item?.id));
  return createHash("sha256").update(JSON.stringify(ids)).digest("hex");
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function boundedInteger(value, name, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return number;
}

function boundedNumber(value, name, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${name} must be a number from ${minimum} to ${maximum}.`);
  }
  return number;
}

function publicErrorMessage(error) {
  return redactText(error?.message || error).slice(0, 240);
}

function redactText(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/erp-runtime-session-v1\.[A-Za-z0-9._~+/=-]+/g, "[redacted-runtime-token]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted-api-url]")
    .replace(/\/(?:Users|private|var|tmp)\/[^\s"'<>]+/g, "[redacted-path]");
}

function sanitizeReport(report) {
  return JSON.parse(redactText(JSON.stringify(report)));
}

function formatPercent(value) {
  return `${round(Number(value) * 100, 2)}%`;
}

function formatMs(value) {
  return `${round(value)}ms`;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

export const V1_TODO_LOAD_PRECHECK_LIMITS = limits;
export { redactText as redactV1TodoLoadPrecheckText };
