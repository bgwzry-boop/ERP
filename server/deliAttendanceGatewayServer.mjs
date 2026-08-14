import { createServer } from "node:http";

import { readJsonRequestBody } from "./httpJsonBody.mjs";
import { createPostgresDeliAttendanceGatewayRepository } from "./deliAttendanceGatewayRepository.mjs";
import { createDeliAttendanceGatewayService } from "./deliAttendanceGatewayService.mjs";
import { createDeliEplusAttendanceClient } from "./deliEplusAttendanceClient.mjs";

const DEFAULT_PATH = "/v1/punches/query";
const MAX_BODY_BYTES = 16 * 1024;

export function createDeliAttendanceGatewayServer(options = {}) {
  const service = options.service;
  const routePath = normalizeRoutePath(options.routePath ?? DEFAULT_PATH);
  if (!service || typeof service.fetchPunches !== "function") {
    throw new Error("Deli attendance gateway service is required.");
  }

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/healthz") {
        return sendJson(response, 200, { status: "ok", service: "deli-attendance-gateway" });
      }
      if (request.method !== "POST" || url.pathname !== routePath) {
        return sendJson(response, 404, {
          code: "DELI_ATTENDANCE_GATEWAY_ROUTE_NOT_FOUND",
          message: "考勤网关路由不存在。",
        });
      }
      const contentType = cleanText(request.headers["content-type"]).toLowerCase();
      if (!contentType.startsWith("application/json")) {
        return sendJson(response, 415, {
          code: "DELI_ATTENDANCE_GATEWAY_CONTENT_TYPE_INVALID",
          message: "考勤网关仅接受 application/json。",
        });
      }
      const body = await readJsonRequestBody(request, MAX_BODY_BYTES);
      const result = await service.fetchPunches({
        authorization: request.headers.authorization,
        body,
      });
      return sendJson(response, 200, result);
    } catch (error) {
      const statusCode = safeStatusCode(error?.statusCode);
      return sendJson(response, statusCode, {
        code: safeErrorCode(error?.code, statusCode),
        message: statusCode >= 500 ? "考勤网关暂时无法完成请求。" : safeClientMessage(error?.message),
      });
    }
  });
}

export function createDeliAttendanceGatewayRuntime(options = {}) {
  const client = options.client ?? createDeliEplusAttendanceClient({
    appKey: options.appKey ?? process.env.DELI_EPLUS_APP_KEY,
    appSecret: options.appSecret ?? process.env.DELI_EPLUS_APP_SECRET,
    baseUrl: options.baseUrl ?? process.env.DELI_EPLUS_API_BASE_URL,
    pageSize: options.pageSize ?? process.env.DELI_EPLUS_PAGE_SIZE,
    maxPages: options.maxPages ?? process.env.DELI_EPLUS_MAX_PAGES,
    timeoutMs: options.timeoutMs ?? process.env.DELI_EPLUS_TIMEOUT_MS,
    fetchImpl: options.fetchImpl,
    now: options.now,
  });
  const repository = options.repository ?? (options.service ? null : createPostgresDeliAttendanceGatewayRepository({
    databaseUrl: options.databaseUrl ?? process.env.DELI_ATTENDANCE_GATEWAY_DATABASE_URL,
    providerKey: options.providerKey ?? "deli",
  }));
  const service = options.service ?? createDeliAttendanceGatewayService({
    client,
    repository,
    bearerToken: options.bearerToken ?? process.env.DELI_ATTENDANCE_GATEWAY_TOKEN,
  });
  const server = createDeliAttendanceGatewayServer({
    service,
    routePath: options.routePath ?? process.env.DELI_ATTENDANCE_GATEWAY_PATH,
  });
  return Object.freeze({ client, repository, service, server });
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

function normalizeRoutePath(value) {
  const route = `/${cleanText(value || DEFAULT_PATH).replace(/^\/+|\/+$/g, "")}`;
  if (!/^\/[a-z0-9/_-]+$/i.test(route)) throw new Error("Deli attendance gateway path is invalid.");
  return route;
}

function safeStatusCode(value) {
  const statusCode = Number(value);
  return Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
}

function safeErrorCode(value, statusCode) {
  const code = cleanText(value);
  if (/^[A-Z0-9_]{3,80}$/.test(code)) return code;
  return statusCode >= 500 ? "DELI_ATTENDANCE_GATEWAY_UNAVAILABLE" : "DELI_ATTENDANCE_GATEWAY_REQUEST_REJECTED";
}

function safeClientMessage(value) {
  const message = cleanText(value);
  return message && message.length <= 200 ? message : "考勤网关请求未通过。";
}

function cleanText(value) {
  return String(value ?? "").trim();
}
