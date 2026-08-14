import { timingSafeEqual } from "node:crypto";

export function createDeliAttendanceGatewayService(options = {}) {
  const client = options.client;
  const repository = options.repository;
  const bearerToken = cleanText(options.bearerToken);
  const persistentMode = repository !== undefined && repository !== null;
  if (!persistentMode && options.allowStatelessForTests !== true) {
    throw new Error("Deli attendance gateway requires persistent cursor storage.");
  }
  if (!client || (persistentMode ? typeof client.fetchIncremental !== "function" : typeof client.fetchPunches !== "function")) {
    throw new Error("Deli attendance gateway requires an official client.");
  }
  if (persistentMode && (
    typeof repository.readCursor !== "function"
    || typeof repository.saveBatch !== "function"
    || typeof repository.queryPunches !== "function"
  )) {
    throw new Error("Deli attendance gateway repository is invalid.");
  }
  if (!bearerToken) throw new Error("Deli attendance gateway bearer token is required.");
  let synchronizationQueue = Promise.resolve();

  return Object.freeze({
    async fetchPunches({ authorization, body } = {}) {
      if (!authorized(authorization, bearerToken)) {
        throw gatewayError("DELI_ATTENDANCE_GATEWAY_UNAUTHORIZED", "考勤网关认证失败。", 401);
      }
      const range = normalizeRange(body?.rangeStart, body?.rangeEnd);
      const records = persistentMode
        ? await fetchPersistedRange(range)
        : await client.fetchPunches(range);
      return { records };
    },
  });

  async function fetchPersistedRange(range) {
    const synchronization = synchronizationQueue.then(synchronizeIncremental, synchronizeIncremental);
    synchronizationQueue = synchronization.catch(() => undefined);
    await synchronization;
    return repository.queryPunches(range);
  }

  async function synchronizeIncremental() {
    const expectedNextId = await repository.readCursor();
    const result = await client.fetchIncremental({ nextId: expectedNextId });
    await repository.saveBatch({
      expectedNextId,
      nextId: result.nextId,
      records: result.records,
    });
  }
}

function normalizeRange(rangeStart, rangeEnd) {
  const start = Date.parse(cleanText(rangeStart));
  const end = Date.parse(cleanText(rangeEnd));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw gatewayError("DELI_ATTENDANCE_GATEWAY_RANGE_INVALID", "考勤查询时间范围无效。", 400);
  }
  return {
    rangeStart: new Date(start).toISOString(),
    rangeEnd: new Date(end).toISOString(),
  };
}

function authorized(header, expectedToken) {
  const prefix = "Bearer ";
  const value = cleanText(header);
  if (!value.startsWith(prefix)) return false;
  const actual = Buffer.from(value.slice(prefix.length));
  const expected = Buffer.from(expectedToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function gatewayError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
