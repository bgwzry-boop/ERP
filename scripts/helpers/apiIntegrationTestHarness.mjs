const DEFAULT_HOST = "127.0.0.1";

export function listenTestServer(server, { host = DEFAULT_HOST } = {}) {
  if (!server) throw new TypeError("listenTestServer requires a server");
  if (server.listening) return Promise.resolve(server);

  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      server.off("listening", handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off("error", handleError);
      resolve(server);
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(0, host);
  });
}

export function closeTestServer(server, { forceAfterMs = 0 } = {}) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    let forceTimer;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(forceTimer);
      if (error) reject(error);
      else resolve();
    };

    server.close(finish);
    if (forceAfterMs > 0) {
      server.closeIdleConnections?.();
      forceTimer = setTimeout(() => {
        server.closeAllConnections?.();
        finish();
      }, forceAfterMs);
      forceTimer.unref?.();
    }
  });
}

export function getTestServerBaseUrl(server, { host = DEFAULT_HOST } = {}) {
  const address = server?.address?.();
  if (!address || typeof address === "string") {
    throw new Error("Test server is not listening on a TCP port");
  }
  return `http://${host}:${address.port}`;
}

export async function requestJson(baseUrl, route, options = {}) {
  const {
    closeConnection = false,
    expectedStatus,
    timeoutMs = 0,
    ...fetchOptions
  } = options;
  const method = normalizeMethod(fetchOptions.method);
  const timeoutController = timeoutMs > 0 ? new AbortController() : null;
  const timeout = timeoutController
    ? setTimeout(() => timeoutController.abort(), timeoutMs)
    : null;

  try {
    const response = await fetch(resolveUrl(baseUrl, route), {
      ...fetchOptions,
      headers: {
        ...(fetchOptions.headers ?? {}),
        ...(closeConnection ? { connection: "close" } : {}),
      },
      signal: combineAbortSignals(fetchOptions.signal, timeoutController?.signal),
    });
    const text = await response.text();
    let body = {};

    if (text) {
      try {
        body = JSON.parse(text);
      } catch (error) {
        throw new Error(
          `${method} ${route} returned invalid JSON (HTTP ${response.status}): ${summarizeBody(text)}`,
          { cause: error },
        );
      }
    }

    assertExpectedStatus({ method, route, response, expectedStatus, body });
    return { status: response.status, headers: response.headers, body };
  } catch (error) {
    if (timeoutController?.signal.aborted) {
      throw new Error(`${method} ${route} timed out after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getJson(baseUrl, route, options = {}) {
  const result = await requestJson(baseUrl, route, {
    ...options,
    method: "GET",
    expectedStatus: options.expectedStatus ?? 200,
  });
  return result.body;
}

export async function postJson(baseUrl, route, body, options = {}) {
  return sendJson(baseUrl, route, body, { ...options, method: "POST" });
}

export async function patchJson(baseUrl, route, body, options = {}) {
  return sendJson(baseUrl, route, body, { ...options, method: "PATCH" });
}

export async function getText(baseUrl, route, options = {}) {
  const expectedStatus = options.expectedStatus ?? 200;
  const response = await fetch(resolveUrl(baseUrl, route), {
    method: "GET",
    headers: options.headers ?? {},
  });
  const text = await response.text();
  assertExpectedStatus({ method: "GET", route, response, expectedStatus, body: text });
  return {
    text,
    contentType: response.headers.get("content-type") ?? "",
    contentDisposition: response.headers.get("content-disposition") ?? "",
  };
}

export async function getBinary(baseUrl, route, options = {}) {
  const expectedStatus = options.expectedStatus ?? 200;
  const response = await fetch(resolveUrl(baseUrl, route), {
    method: "GET",
    headers: options.headers ?? {},
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  assertExpectedStatus({
    method: "GET",
    route,
    response,
    expectedStatus,
    body: new TextDecoder().decode(bytes),
  });
  return {
    bytes,
    contentType: response.headers.get("content-type") ?? "",
    contentDisposition: response.headers.get("content-disposition") ?? "",
  };
}

async function sendJson(baseUrl, route, body, options) {
  const result = await requestJson(baseUrl, route, {
    method: options.method,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    body: JSON.stringify(body),
    expectedStatus: options.expectedStatus ?? 200,
  });
  return result.body;
}

function assertExpectedStatus({ method, route, response, expectedStatus, body }) {
  if (
    expectedStatus === undefined
    || (expectedStatus === "ok" && response.ok)
    || (Array.isArray(expectedStatus) && expectedStatus.includes(response.status))
    || response.status === expectedStatus
  ) return;
  const expectedLabel = expectedStatus === "ok"
    ? "HTTP 2xx"
    : Array.isArray(expectedStatus)
      ? `one of HTTP ${expectedStatus.join(", ")}`
      : `HTTP ${expectedStatus}`;
  throw new Error(
    `${method} ${route} expected ${expectedLabel} but returned HTTP ${response.status}: ${summarizeBody(body)}`,
  );
}

function combineAbortSignals(...signals) {
  const activeSignals = signals.filter(Boolean);
  if (activeSignals.length <= 1) return activeSignals[0];
  if (typeof AbortSignal.any === "function") return AbortSignal.any(activeSignals);
  return activeSignals.find((signal) => signal.aborted) ?? activeSignals[0];
}

function normalizeMethod(method) {
  return String(method || "GET").toUpperCase();
}

function resolveUrl(baseUrl, route) {
  return new URL(route, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

function summarizeBody(body) {
  const serialized = typeof body === "string" ? body : JSON.stringify(body);
  return serialized.length <= 800 ? serialized : `${serialized.slice(0, 800)}...`;
}
