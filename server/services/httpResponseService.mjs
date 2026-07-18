import {
  getCorsAllowedRequestHeaders,
  isCorsRequestAllowed,
} from "../apiSecurityPolicy.mjs";

const allowedMethods = "GET, POST, PATCH, OPTIONS";
const exposedFileHeaders = "content-disposition, content-type";

export function createHttpResponseService() {
  function buildCorsHeaders(response, options = {}) {
    const securityPolicy = response.erpSecurityPolicy;
    const exposeHeaders = options.exposeHeaders
      ? { "access-control-expose-headers": options.exposeHeaders }
      : {};

    if (!securityPolicy?.strictAuth) {
      return {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": allowedMethods,
        "access-control-allow-headers": getCorsAllowedRequestHeaders(securityPolicy),
        ...exposeHeaders,
      };
    }

    const origin = String(response.erpRequestOrigin ?? "").trim();
    if (!origin || !isCorsRequestAllowed(securityPolicy, origin)) return {};
    return {
      "access-control-allow-origin": origin,
      vary: "Origin",
      "access-control-allow-methods": allowedMethods,
      "access-control-allow-headers": getCorsAllowedRequestHeaders(securityPolicy),
      ...exposeHeaders,
    };
  }

  function createResponseBuffer(body, contentEncoding = "") {
    if (Buffer.isBuffer(body)) return body;
    if (body instanceof Uint8Array) return Buffer.from(body);
    if (body instanceof ArrayBuffer) return Buffer.from(body);
    const content = String(body ?? "");
    return contentEncoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8");
  }

  function sendJson(response, statusCode, payload) {
    const body = statusCode === 204 ? "" : JSON.stringify(payload, null, 2);
    response.writeHead(statusCode, {
      "content-type": "application/json; charset=utf-8",
      ...buildCorsHeaders(response),
    });
    response.end(body);
  }

  function sendFile(response, statusCode, body, options = {}) {
    const content = createResponseBuffer(body, options.contentEncoding);
    response.writeHead(statusCode, {
      "content-type": options.contentType ?? "application/octet-stream",
      "content-length": content.length,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(options.fileName ?? "download.bin")}`,
      ...buildCorsHeaders(response, { exposeHeaders: exposedFileHeaders }),
    });
    response.end(content);
  }

  function sendInlineFile(response, statusCode, body, options = {}) {
    const content = createResponseBuffer(body, options.contentEncoding);
    response.writeHead(statusCode, {
      "content-type": options.contentType ?? "application/octet-stream",
      "content-length": content.length,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(options.fileName ?? "attachment.bin")}`,
      ...buildCorsHeaders(response, { exposeHeaders: exposedFileHeaders }),
    });
    response.end(content);
  }

  function sendNotFound(response, code) {
    return sendJson(response, 404, {
      code,
      message: "The requested route or record does not exist.",
    });
  }

  function sendBusinessError(response, statusCode, code, message, details = {}) {
    const safeDetails = details && typeof details === "object" && !Array.isArray(details) ? details : {};
    return sendJson(response, statusCode, { ...safeDetails, code, message });
  }

  return Object.freeze({
    buildCorsHeaders,
    createResponseBuffer,
    sendBusinessError,
    sendFile,
    sendInlineFile,
    sendJson,
    sendNotFound,
  });
}
