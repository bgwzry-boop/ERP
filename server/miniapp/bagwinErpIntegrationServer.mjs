import { createServer } from "node:http";

import { createBagwinIntegrationAuthenticator } from "./bagwinIntegrationAuth.mjs";
import { createPostgresBagwinErpIntegrationRepository } from "./bagwinErpIntegrationRepository.mjs";
import { createBagwinErpIntegrationService } from "./bagwinErpIntegrationService.mjs";

const MAX_BODY_BYTES = 1024 * 1024;

function normalizedBasePath(value) {
  const path = `/${String(value ?? "/api").trim().replace(/^\/+|\/+$/g, "")}`;
  return path === "/" ? "" : path;
}

function sendJson(response, statusCode, body) {
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": payload.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(payload);
}

async function readRawBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.byteLength;
    if (length > MAX_BODY_BYTES) {
      const error = new Error("Integration request body is too large.");
      error.statusCode = 413;
      error.code = "BAGWIN_BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

function parseJsonBody(rawBody) {
  if (!rawBody.length) {
    const error = new Error("Integration request body is required.");
    error.statusCode = 400;
    error.code = "BAGWIN_JSON_REQUIRED";
    throw error;
  }
  try {
    return JSON.parse(rawBody.toString("utf8"));
  } catch {
    const error = new Error("Integration request body is not valid JSON.");
    error.statusCode = 400;
    error.code = "BAGWIN_JSON_INVALID";
    throw error;
  }
}

function decodePathValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    const error = new Error("Integration route identifier is invalid.");
    error.statusCode = 400;
    error.code = "BAGWIN_ROUTE_IDENTIFIER_INVALID";
    throw error;
  }
}

function errorResponse(error) {
  const statusCode = Number(error?.statusCode ?? 500);
  if (statusCode >= 500) {
    return { statusCode: 500, body: { code: "BAGWIN_INTERNAL_ERROR", message: "Internal server error." } };
  }
  return {
    statusCode,
    body: {
      code: String(error?.code ?? "BAGWIN_REQUEST_REJECTED"),
      message: String(error?.message ?? "Integration request was rejected."),
    },
  };
}

export function createBagwinErpIntegrationServer(options = {}) {
  const service = options.service;
  const authenticator = options.authenticator;
  const basePath = normalizedBasePath(options.basePath);
  if (!service || !authenticator) throw new Error("Bagwin integration service and authenticator are required.");

  const ordersPath = `${basePath}/v1/integrations/bagwin/orders`;
  const reconciliationPath = `${ordersPath}/reconciliation-export`;
  const lookupPattern = new RegExp(`^${ordersPath}/by-source/([^/]+)$`);
  const statusPattern = new RegExp(`^${ordersPath}/([^/]+)/status$`);

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/healthz") {
        return sendJson(response, 200, { status: "ok", service: "bagwin-erp-integration" });
      }

      const lookupMatch = request.method === "GET" ? url.pathname.match(lookupPattern) : null;
      const statusMatch = request.method === "GET" ? url.pathname.match(statusPattern) : null;
      const isCreate = request.method === "POST" && url.pathname === ordersPath;
      const isReconciliation = request.method === "POST" && url.pathname === reconciliationPath;
      if (!lookupMatch && !statusMatch && !isCreate && !isReconciliation) {
        return sendJson(response, 404, { code: "BAGWIN_ROUTE_NOT_FOUND", message: "Integration route was not found." });
      }

      const rawBody = await readRawBody(request);
      await authenticator.authenticate({ request, url, rawBody });

      if (lookupMatch) {
        return sendJson(response, 200, await service.findBySourceOrderNo(decodePathValue(lookupMatch[1])));
      }
      if (statusMatch) {
        const sourceOrderNo = String(url.searchParams.get("sourceOrderNo") ?? "");
        return sendJson(response, 200, await service.getOrderStatus({
          sourceOrderNo,
          erpOrderId: decodePathValue(statusMatch[1]),
        }));
      }

      const contentType = String(request.headers["content-type"] ?? "").toLowerCase();
      if (!contentType.startsWith("application/json")) {
        const error = new Error("Integration POST requests must use application/json.");
        error.statusCode = 415;
        error.code = "BAGWIN_CONTENT_TYPE_INVALID";
        throw error;
      }
      if (isReconciliation) {
        return sendJson(response, 200, await service.exportReconciliation(parseJsonBody(rawBody)));
      }
      const result = await service.createOrder(parseJsonBody(rawBody));
      return sendJson(response, result.disposition === "created" ? 201 : 200, result);
    } catch (error) {
      const result = errorResponse(error);
      return sendJson(response, result.statusCode, result.body);
    }
  });
}

export function createBagwinErpIntegrationRuntime(options = {}) {
  const databaseUrl = String(options.databaseUrl
    ?? process.env.BAGWIN_ERP_DATABASE_URL
    ?? process.env.ERP_V1_DATABASE_URL
    ?? "").trim();
  if (!databaseUrl) throw new Error("BAGWIN_ERP_DATABASE_URL or ERP_V1_DATABASE_URL is required.");

  const repository = options.repository ?? createPostgresBagwinErpIntegrationRepository({ databaseUrl });
  const service = options.service ?? createBagwinErpIntegrationService({ repository, now: options.now });
  const authenticator = options.authenticator ?? createBagwinIntegrationAuthenticator({
    keyId: options.keyId ?? process.env.BAGWIN_ERP_HMAC_KEY_ID,
    sharedSecret: options.sharedSecret ?? process.env.BAGWIN_ERP_HMAC_SHARED_SECRET,
    maxClockSkewMs: options.maxClockSkewMs,
    now: options.now,
    nonceStore: repository,
  });
  const server = createBagwinErpIntegrationServer({
    service,
    authenticator,
    basePath: options.basePath ?? process.env.BAGWIN_ERP_BASE_PATH ?? "/api",
  });
  return Object.freeze({ repository, service, authenticator, server });
}
