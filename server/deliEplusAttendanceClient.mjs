import { createHash } from "node:crypto";

const OFFICIAL_BASE_URL = "https://v2-api.delicloud.com";
const CLOUD_API_PATH = "/v2.0/cloudappapi";

export function createDeliEplusAttendanceClient(options = {}) {
  const appKey = cleanText(options.appKey);
  const appSecret = cleanText(options.appSecret);
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? OFFICIAL_BASE_URL, {
    allowInsecureLoopback: options.allowInsecureLoopback === true,
  });
  const pageSize = boundedInteger(options.pageSize, 500, 1, 500);
  const maxPages = boundedInteger(options.maxPages, 400, 1, 2000);
  const timeoutMs = boundedInteger(options.timeoutMs, 10_000, 100, 120_000);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  if (!appKey) throw new Error("Deli E+ App-Key is required.");
  if (!appSecret) throw new Error("Deli E+ App-Secret is required.");
  if (typeof fetchImpl !== "function") throw new Error("Deli E+ client requires fetch support.");

  return Object.freeze({
    kind: "deli_eplus_checkin",
    async fetchPunches({ rangeStart, rangeEnd } = {}) {
      const range = normalizeRange(rangeStart, rangeEnd);
      const result = await fetchIncremental({ nextId: 0 });
      return result.records.filter((record) => timestampInsideRange(record.punchedAt, range));
    },
    fetchIncremental,
  });

  async function fetchIncremental({ nextId: requestedNextId = 0 } = {}) {
    let nextId = normalizeCursor(requestedNextId);
    const records = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const payload = await requestOfficialApi({
        fetchImpl,
        baseUrl,
        appKey,
        appSecret,
        timestamp: officialTimestamp(now()),
        timeoutMs,
        nextId,
        pageSize,
      });
      const rows = payload?.data?.data;
      if (!Array.isArray(rows)) {
        throw deliError("DELI_EPLUS_RESPONSE_INVALID", "得力E+考勤响应缺少数据列表。", 502);
      }
      if (!rows.length) return { records, nextId };
      for (const row of rows) records.push(normalizeDeliCheckin(row));
      const returnedNextId = Number(payload?.data?.next_id);
      if (!Number.isSafeInteger(returnedNextId) || returnedNextId <= nextId) {
        throw deliError("DELI_EPLUS_CURSOR_INVALID", "得力E+考勤分页游标无效，已停止同步。", 502);
      }
      nextId = returnedNextId;
    }
    throw deliError("DELI_EPLUS_PAGE_LIMIT_EXCEEDED", "得力E+考勤记录超过安全分页上限，未返回不完整结果。", 502);
  }
}

export function buildDeliEplusSignature({ timestamp, appKey, appSecret } = {}) {
  const value = `${CLOUD_API_PATH}${cleanText(timestamp)}${cleanText(appKey)}${cleanText(appSecret)}`;
  return createHash("md5").update(value).digest("hex");
}

async function requestOfficialApi({ fetchImpl, baseUrl, appKey, appSecret, timestamp, timeoutMs, nextId, pageSize }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(new URL(CLOUD_API_PATH, baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=UTF-8",
        accept: "application/json",
        "App-Key": appKey,
        "App-Timestamp": timestamp,
        "App-Sig": buildDeliEplusSignature({ timestamp, appKey, appSecret }),
        "Api-Module": "CHECKIN",
        "Api-Cmd": "checkin_query",
      },
      body: JSON.stringify({ next_id: nextId, page_size: pageSize }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw deliError("DELI_EPLUS_HTTP_ERROR", `得力E+考勤请求失败（HTTP ${response.status}）。`, 502);
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw deliError("DELI_EPLUS_RESPONSE_INVALID", "得力E+考勤接口没有返回有效JSON。", 502);
    }
    if (Number(payload?.code) !== 0) {
      throw deliError("DELI_EPLUS_API_ERROR", `得力E+考勤接口返回业务错误（code ${safeCode(payload?.code)}）。`, 502);
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw deliError("DELI_EPLUS_TIMEOUT", "得力E+考勤接口请求超时。", 504);
    if (cleanText(error?.code).startsWith("DELI_EPLUS_")) throw error;
    throw deliError("DELI_EPLUS_UNAVAILABLE", "得力E+考勤接口暂时无法连接。", 502);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeDeliCheckin(value = {}) {
  const seconds = Number(value?.check_time);
  const validTimestamp = Number.isFinite(seconds) && seconds > 0;
  const punchedAt = validTimestamp ? new Date(seconds * 1000).toISOString() : "";
  const externalPunchId = cleanText(value?.id);
  const externalEmployeeId = cleanText(value?.ext_id);
  if (!externalPunchId || !externalEmployeeId || !validTimestamp) {
    throw deliError("DELI_EPLUS_RECORD_INVALID", "得力E+考勤记录缺少稳定编号、员工外部编号或有效打卡时间。", 502);
  }
  return {
    externalPunchId,
    externalEmployeeId,
    punchedAt,
    localWorkDate: shanghaiDate(punchedAt),
    eventType: cleanText(value?.check_type) || "punch",
    raw: {
      id: externalPunchId,
      ext_id: externalEmployeeId,
      check_type: cleanText(value?.check_type),
      check_time: seconds,
    },
  };
}

function normalizeRange(rangeStart, rangeEnd) {
  const start = Date.parse(cleanText(rangeStart));
  const end = Date.parse(cleanText(rangeEnd));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw deliError("DELI_EPLUS_RANGE_INVALID", "考勤查询时间范围无效。", 400);
  }
  return { start, end };
}

function timestampInsideRange(value, range) {
  const timestamp = Date.parse(value);
  return timestamp >= range.start && timestamp < range.end;
}

function normalizeCursor(value) {
  const cursor = Number(value);
  if (!Number.isSafeInteger(cursor) || cursor < 0) {
    throw deliError("DELI_EPLUS_CURSOR_INVALID", "得力E+考勤分页游标无效，已停止同步。", 502);
  }
  return cursor;
}

function shanghaiDate(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function normalizeBaseUrl(value, { allowInsecureLoopback = false } = {}) {
  let url;
  try {
    url = new URL(cleanText(value));
  } catch {
    throw new Error("Deli E+ API base URL must be an absolute URL.");
  }
  const loopback = new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname);
  if (url.username || url.password) throw new Error("Deli E+ API base URL must not contain credentials.");
  if (url.protocol !== "https:" && !(allowInsecureLoopback && loopback)) {
    throw new Error("Deli E+ API base URL must use HTTPS.");
  }
  return url.toString();
}

function deliError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

function officialTimestamp(value) {
  const timestamp = String(Number(value));
  if (!/^\d{13}$/.test(timestamp)) {
    throw deliError("DELI_EPLUS_TIMESTAMP_INVALID", "得力E+考勤请求时间戳无效。", 500);
  }
  return timestamp;
}

function safeCode(value) {
  const text = cleanText(value);
  return /^\d{1,8}$/.test(text) ? text : "unknown";
}

function cleanText(value) {
  return String(value ?? "").trim();
}
