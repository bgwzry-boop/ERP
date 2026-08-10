import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { toMiniappErrorResponse, MiniappApiError } from "./miniappApiError.mjs";
import { createMiniappAccessTokenService, createWechatCodeExchangeProvider } from "./miniappIdentityService.mjs";
import { createMiniappInMemoryRepository } from "./miniappInMemoryRepository.mjs";
import { createPostgresMiniappRepository } from "./miniappPostgresRepository.mjs";
import { createPostgresMiniappErpProjectionAdapter } from "./miniappErpProjectionAdapter.mjs";
import { createMiniappBffService } from "./miniappBffService.mjs";

function json(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 1024 * 1024) throw new MiniappApiError(413, "BODY_TOO_LARGE", "请求内容过大");
  }
  if (!body) return {};
  try { return JSON.parse(body); }
  catch { throw new MiniappApiError(400, "JSON_INVALID", "请求内容格式不正确"); }
}

function bearerToken(request) {
  const value = String(request.headers.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

export function createMiniappApiServer(options) {
  const service = options.service;
  if (!service) throw new Error("Miniapp BFF service is required");
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/healthz") return json(response, 200, { status: "ok", service: "miniapp-bff" });
      if (request.method === "POST" && url.pathname === "/v1/miniapp/session") {
        const body = await readJson(request);
        return json(response, 200, await service.createSession(body.code));
      }
      const context = await service.requireActiveSession(bearerToken(request));
      if (request.method === "GET" && url.pathname === "/v1/miniapp/bootstrap") return json(response, 200, await service.getBootstrap(context));
      if (request.method === "GET" && url.pathname === "/v1/miniapp/catalog") return json(response, 200, await service.getCatalog(context));
      if (request.method === "GET" && url.pathname === "/v1/miniapp/customers/me/defaults") return json(response, 200, await service.getCustomerDefaults(context));
      if (request.method === "POST" && url.pathname === "/v1/miniapp/quotes/preview") return json(response, 200, await service.previewQuote(context, await readJson(request)));
      if (request.method === "POST" && url.pathname === "/v1/miniapp/special-quotes/preview") return json(response, 200, await service.previewSpecialQuote(context, await readJson(request)));
      if (request.method === "POST" && url.pathname === "/v1/miniapp/inventory/check") return json(response, 200, await service.checkInventory(context, await readJson(request)));
      if (request.method === "GET" && url.pathname === "/v1/miniapp/orders") return json(response, 200, await service.getOrders(context));
      if (request.method === "POST" && url.pathname === "/v1/miniapp/orders") {
        const body = await readJson(request);
        return json(response, 201, await service.createOrder(context, body, request.headers["x-idempotency-key"]));
      }
      const orderMatch = request.method === "GET" && url.pathname.match(/^\/v1\/miniapp\/orders\/([^/]+)$/);
      if (orderMatch) return json(response, 200, await service.getOrder(context, decodeURIComponent(orderMatch[1])));
      throw new MiniappApiError(404, "ROUTE_NOT_FOUND", "接口不存在");
    } catch (error) {
      const result = toMiniappErrorResponse(error);
      json(response, result.statusCode, result.body);
    }
  });
}

export function createMiniappApiRuntime(options = {}) {
  const repositoryMode = options.repositoryMode || process.env.MINIAPP_INTAKE_STORE || "memory";
  if (!new Set(["memory", "postgres"]).has(repositoryMode)) {
    throw new Error(`Unsupported Miniapp intake repository mode: ${repositoryMode}`);
  }
  if (options.runtimeMode === "production" && repositoryMode !== "postgres") {
    throw new Error("Production Miniapp BFF requires MINIAPP_INTAKE_STORE=postgres");
  }
  const databaseUrl = options.databaseUrl
    || process.env.MINIAPP_DATABASE_URL
    || process.env.ERP_V1_DATABASE_URL
    || process.env.DATABASE_URL
    || process.env.PGURL;
  const repository = options.repository || (repositoryMode === "postgres"
    ? createPostgresMiniappRepository({ databaseUrl })
    : createMiniappInMemoryRepository());
  const erpAdapter = options.erpAdapter || (repositoryMode === "postgres"
    ? createPostgresMiniappErpProjectionAdapter({ databaseUrl })
    : null);
  const accessTokens = options.accessTokens || createMiniappAccessTokenService({ secret: options.sessionSecret || process.env.MINIAPP_SESSION_SECRET });
  const identityProvider = options.identityProvider || createWechatCodeExchangeProvider({
    appId: options.wechatAppId || process.env.WECHAT_MINIAPP_APP_ID,
    appSecret: options.wechatAppSecret || process.env.WECHAT_MINIAPP_APP_SECRET,
  });
  const service = createMiniappBffService({
    repository,
    erpAdapter,
    identityProvider,
    accessTokens,
    identityPepper: options.identityPepper || process.env.MINIAPP_IDENTITY_PEPPER,
  });
  return { repository, erpAdapter, service, server: createMiniappApiServer({ service }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  throw new Error("Use server/miniapp/startMiniappApiServer.mjs to start the production Miniapp BFF.");
}
