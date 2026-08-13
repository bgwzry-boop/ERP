const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function createConfiguredAttendanceProvider(options = {}) {
  const env = options.env ?? process.env;
  const mode = cleanText(options.mode ?? env.ERP_ATTENDANCE_PROVIDER_MODE).toLowerCase();
  if (!mode || mode === "disabled" || mode === "none") return null;
  if (mode !== "http_json") {
    throw new Error(`Unsupported attendance provider mode: ${mode}`);
  }

  const endpoint = normalizeEndpoint(options.endpoint ?? env.ERP_ATTENDANCE_PROVIDER_ENDPOINT, {
    allowInsecureLoopback:
      options.allowInsecureLoopback === true || env.ERP_ATTENDANCE_PROVIDER_ALLOW_INSECURE_LOOPBACK === "true",
  });
  const token = cleanText(options.token ?? env.ERP_ATTENDANCE_PROVIDER_TOKEN);
  const key = cleanText(options.key ?? env.ERP_ATTENDANCE_PROVIDER_KEY).toLowerCase() || "attendance_gateway";
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(key)) {
    throw new Error("ERP_ATTENDANCE_PROVIDER_KEY must be a stable lowercase identifier.");
  }
  const timeoutMs = positiveInteger(
    options.timeoutMs ?? env.ERP_ATTENDANCE_PROVIDER_TIMEOUT_MS,
    10_000,
  );
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("Attendance provider requires fetch support.");
  if (!token) throw new Error("ERP_ATTENDANCE_PROVIDER_TOKEN is required for http_json mode.");

  return Object.freeze({
    key,
    mode,
    endpoint,
    async fetchPunches({ rangeStart, rangeEnd } = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({ rangeStart, rangeEnd }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw providerError(
            "ATTENDANCE_PROVIDER_REQUEST_FAILED",
            `考勤网关请求失败（HTTP ${response.status}）。`,
            response.status,
          );
        }
        const payload = await readJson(response);
        const records = Array.isArray(payload) ? payload : payload?.records;
        if (!Array.isArray(records)) {
          throw providerError(
            "ATTENDANCE_PROVIDER_RESPONSE_INVALID",
            "考勤网关必须返回 records 数组。",
            502,
          );
        }
        return records.map(normalizeGatewayRecord);
      } catch (error) {
        if (error?.name === "AbortError") {
          throw providerError("ATTENDANCE_PROVIDER_TIMEOUT", "考勤网关请求超时。", 504);
        }
        if (cleanText(error?.code).startsWith("ATTENDANCE_PROVIDER_")) throw error;
        throw providerError("ATTENDANCE_PROVIDER_UNAVAILABLE", "考勤网关暂时无法连接。", 502);
      } finally {
        clearTimeout(timer);
      }
    },
  });
}

function normalizeGatewayRecord(value = {}) {
  return {
    externalPunchId: cleanText(value.externalPunchId ?? value.id),
    externalEmployeeId: cleanText(value.externalEmployeeId ?? value.employeeId),
    punchedAt: cleanText(value.punchedAt ?? value.time),
    localWorkDate: cleanText(value.localWorkDate),
    eventType: cleanText(value.eventType) || "punch",
    raw: value && typeof value === "object" ? value : {},
  };
}

function normalizeEndpoint(value, { allowInsecureLoopback = false } = {}) {
  const text = cleanText(value);
  if (!text) throw new Error("ERP_ATTENDANCE_PROVIDER_ENDPOINT is required for http_json mode.");
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("ERP_ATTENDANCE_PROVIDER_ENDPOINT must be an absolute URL.");
  }
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.username || url.password) {
    throw new Error("Attendance provider endpoint must not contain URL credentials.");
  }
  if (url.protocol !== "https:" && !(allowInsecureLoopback && loopback)) {
    throw new Error("Attendance provider endpoint must use HTTPS (loopback may be explicitly allowed for tests).");
  }
  return url.toString();
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    throw providerError("ATTENDANCE_PROVIDER_RESPONSE_INVALID", "考勤网关没有返回有效 JSON。", 502);
  }
}

function providerError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = status;
  return error;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
