import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import { withLocalRepositoryFixture } from "./helpers/localRepositoryFixture.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "attachment-object-storage-live");
const bucketName = "erp-v1-attachment-live-check";
const keyPrefix = "attachment-live-check";
const accessKeyId = "ERP_ATTACHMENT_LIVE_AKID";
const secretAccessKey = "ERP_ATTACHMENT_LIVE_SECRET_SHOULD_NOT_LEAK";

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });

const objectStorageServer = createFakeS3CompatibleServer({ bucketName });

try {
  await listen(objectStorageServer.server);
  const endpoint = `http://127.0.0.1:${objectStorageServer.server.address().port}`;
  const apiServer = createApiServer(withLocalRepositoryFixture({ allowLocalFixture: true,
    attachmentRepositoryOptions: { storageRoot },
    attachmentAccessAuditRepositoryOptions: { storageRoot },
    attachmentObjectStorageOptions: {
      mode: "object_storage",
      provider: "s3_compatible",
      endpoint,
      bucket: bucketName,
      region: "cn-v1-live",
      accessKeyId,
      secretAccessKey,
      keyPrefix,
      forcePathStyle: true,
    },
  }));

  try {
    await listen(apiServer);
    const apiBaseUrl = `http://127.0.0.1:${apiServer.address().port}/api`;
    await checkBusinessAttachmentRoundTrip(apiBaseUrl, endpoint);
    await checkDiagnosticsAndReadiness(apiBaseUrl, objectStorageServer);
  } finally {
    await closeServer(apiServer);
  }

  console.log(
    "Attachment object storage live check passed: API upload/read, signed URL, diagnostics, V1 readiness, cleanup, and redaction are covered against an HTTP S3-compatible endpoint.",
  );
} finally {
  await closeServer(objectStorageServer.server);
  rmSync(storageRoot, { recursive: true, force: true });
}

async function checkBusinessAttachmentRoundTrip(apiBaseUrl, endpoint) {
  const attachmentText = "erp object storage live attachment proof";
  const attachment = await postJson(apiBaseUrl, "/attachments", {
    ownerType: "statement",
    ownerId: "ST-OBJECT-LIVE-001",
    fileType: "image",
    purpose: "payment_screenshot",
    fileName: "object storage proof.png",
    contentRef: "live-check-upload",
    uploadedBy: "U-OFFICE-A",
    mimeType: "image/png",
    fileSize: Buffer.byteLength(attachmentText),
    contentDataUrl: `data:image/png;base64,${Buffer.from(attachmentText, "utf8").toString("base64")}`,
    metadata: {
      source: "attachment-object-storage-live-check",
    },
  });
  assert.equal(attachment.storageProvider, "object_storage");
  assert.match(attachment.storageKey, new RegExp(`^${escapeRegExp(keyPrefix)}/ATT-?\\d+/object_storage_proof\\.png$`));
  assert.equal(attachment.contentDigest, createHash("sha256").update(attachmentText).digest("hex"));

  const permissionRead = await getText(apiBaseUrl, `/attachments/${attachment.attachmentId}/content`);
  assert.equal(permissionRead.status, 200);
  assert.equal(permissionRead.text, attachmentText);
  assert.match(permissionRead.contentType, /image\/png/);

  const access = await postlessJson(
    apiBaseUrl,
    `/attachments/${attachment.attachmentId}/access-url?ttlSeconds=300`,
  );
  assert.equal(access.deliveryMode, "object_storage_signed_url");
  assert.equal(access.storageProvider, "object_storage");
  assert.match(access.accessUrl, new RegExp(`^${escapeRegExp(endpoint)}/${escapeRegExp(bucketName)}/`));
  const accessUrl = new URL(access.accessUrl);
  assert.equal(accessUrl.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.equal(accessUrl.searchParams.get("X-Amz-Expires"), "300");
  assert.match(accessUrl.searchParams.get("X-Amz-Signature"), /^[a-f0-9]{64}$/);
  assert.doesNotMatch(access.accessUrl, new RegExp(escapeRegExp(secretAccessKey)));

  const signedRead = await fetchText(access.accessUrl);
  assert.equal(signedRead.status, 200);
  assert.equal(signedRead.text, attachmentText);

  const accessLogs = await postlessJson(apiBaseUrl, `/attachments/${attachment.attachmentId}/access-logs`);
  assert.equal(accessLogs.attachmentId, attachment.attachmentId);
  assert.ok(
    accessLogs.items?.some(
      (item) =>
        item.action === "attachment_access_url_created" &&
        item.deliveryMode === "object_storage_signed_url" &&
        item.operatorId === "U-OFFICE-A",
    ),
    "object-storage access URL creation should be audit logged",
  );
  assert.ok(
    accessLogs.items?.some(
      (item) =>
        item.action === "attachment_content_read" &&
        item.accessMode === "permission" &&
        item.operatorId === "U-OFFICE-A",
    ),
    "permission content read should be audit logged",
  );
}

async function checkDiagnosticsAndReadiness(apiBaseUrl, objectStorageServer) {
  const beforeDiagnosticRequestCount = objectStorageServer.requests.length;
  const diagnostics = await postlessJson(apiBaseUrl, "/attachments/storage-diagnostics");
  assert.equal(diagnostics.status, "ok");
  assert.equal(diagnostics.ready, true);
  assert.equal(diagnostics.storageKind, "object_storage");
  assert.equal(diagnostics.storageProvider, "object_storage");
  assert.equal(diagnostics.configured, true);
  assert.deepEqual(diagnostics.missingConfigFields, []);
  assert.equal(diagnostics.writeOk, true);
  assert.equal(diagnostics.readOk, true);
  assert.equal(diagnostics.digestOk, true);
  assert.equal(diagnostics.cleanupOk, true);
  assert.equal(diagnostics.secretFieldsExposed, false);
  assert.match(diagnostics.diagnosticStorageKey, new RegExp(`^${escapeRegExp(keyPrefix)}/ATT-STORAGE-CHECK-`));
  assert.equal(diagnostics.contentDigest, diagnostics.expectedDigest);
  assert.equal(diagnostics.readDigest, diagnostics.expectedDigest);

  const diagnosticRequests = objectStorageServer.requests.slice(beforeDiagnosticRequestCount);
  assert.deepEqual(
    diagnosticRequests.map((item) => item.method),
    ["PUT", "GET", "DELETE"],
    "storage diagnostics should write, read, and delete one diagnostic object",
  );
  for (const request of diagnosticRequests) {
    assert.equal(request.hasAuthorizationHeader, true, `${request.method} diagnostic request should be SigV4 signed`);
    assert.equal(request.hasAmzDateHeader, true, `${request.method} diagnostic request should include x-amz-date`);
  }
  assert.equal(
    objectStorageServer.objects.has(diagnostics.diagnosticStorageKey),
    false,
    "diagnostic object should be deleted from the object-storage endpoint",
  );

  const readiness = await postlessJson(apiBaseUrl, "/attachments/v1-readiness");
  assert.equal(readiness.status, "ready");
  assert.equal(readiness.ready, true);
  assert.equal(readiness.summary.label, "5/5 通过");
  assert.equal(readiness.summary.blockingCount, 0);
  assert.equal(readiness.storageMode.storageKind, "object_storage");
  assert.equal(readiness.storageMode.storageProvider, "object_storage");
  assert.equal(readiness.storageMode.objectStorageLive, true);
  assert.equal(readiness.storageMode.localFsAcceptedForV1, false);
  assert.equal(readiness.safeguards.nonMutating, true);
  assert.equal(readiness.safeguards.diagnosticObjectCleanedUp, true);
  assert.equal(readiness.safeguards.secretFieldsExposed, false);
  assert.equal(readiness.safeguards.requiresObjectStorageLive, true);
  assert.equal(readiness.safeguards.localStorageAcceptedForV1, false);
  assert.equal(readiness.safeguards.payloadExposed, false);
  assert.equal(readiness.blockingCriteria.length, 0);
  assertNoSensitiveOutput(JSON.stringify({ diagnostics, readiness }));
}

function createFakeS3CompatibleServer({ bucketName: expectedBucket }) {
  const objects = new Map();
  const requests = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const key = extractStorageKey({ pathname: url.pathname, expectedBucket });
      if (!key) {
        sendText(response, 404, "bucket or object key not found");
        return;
      }
      const method = String(request.method ?? "GET").toUpperCase();
      const requestRecord = {
        method,
        key,
        hasAuthorizationHeader: Boolean(request.headers.authorization),
        hasAmzDateHeader: Boolean(request.headers["x-amz-date"] || url.searchParams.get("X-Amz-Date")),
        hasPayloadHashHeader: Boolean(request.headers["x-amz-content-sha256"]),
        presigned: url.searchParams.has("X-Amz-Signature"),
      };
      requests.push(requestRecord);

      if (method === "PUT") {
        assert.equal(requestRecord.hasAuthorizationHeader, true, "PUT should include SigV4 authorization");
        assert.equal(requestRecord.hasAmzDateHeader, true, "PUT should include x-amz-date");
        assert.equal(requestRecord.hasPayloadHashHeader, true, "PUT should include x-amz-content-sha256");
        const body = await readBody(request);
        objects.set(key, {
          buffer: body,
          contentType: String(request.headers["content-type"] ?? "application/octet-stream"),
        });
        sendText(response, 200, "");
        return;
      }

      if (method === "GET") {
        assert.equal(
          requestRecord.hasAuthorizationHeader || requestRecord.presigned,
          true,
          "GET should be signed by header or presigned URL",
        );
        assert.equal(requestRecord.hasAmzDateHeader, true, "GET should include SigV4 date");
        const object = objects.get(key);
        if (!object) {
          sendText(response, 404, "object not found");
          return;
        }
        response.writeHead(200, {
          "content-type": object.contentType,
          "content-length": String(object.buffer.length),
          connection: "close",
        });
        response.end(object.buffer);
        return;
      }

      if (method === "DELETE") {
        assert.equal(requestRecord.hasAuthorizationHeader, true, "DELETE should include SigV4 authorization");
        assert.equal(requestRecord.hasAmzDateHeader, true, "DELETE should include x-amz-date");
        const existed = objects.delete(key);
        sendText(response, existed ? 204 : 404, "");
        return;
      }

      sendText(response, 405, "method not allowed");
    } catch (error) {
      sendText(response, 500, error?.message || "fake object storage error");
    }
  });
  return { server, objects, requests };
}

function extractStorageKey({ pathname, expectedBucket }) {
  const decodedPath = decodeURIComponent(String(pathname ?? ""));
  const prefix = `/${expectedBucket}/`;
  if (!decodedPath.startsWith(prefix)) return "";
  return decodedPath.slice(prefix.length).replace(/^\/+/, "");
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function postJson(baseUrl, route, body) {
  return fetchJson(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": "U-OFFICE-A",
      connection: "close",
    },
    body: JSON.stringify(body),
  });
}

function postlessJson(baseUrl, route) {
  return fetchJson(`${baseUrl}${route}`, {
    headers: {
      "x-erp-user-id": "U-OFFICE-A",
      connection: "close",
    },
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function getText(baseUrl, route) {
  return fetchText(`${baseUrl}${route}`, {
    headers: {
      "x-erp-user-id": "U-OFFICE-A",
      connection: "close",
    },
  });
}

async function fetchText(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  return {
    status: response.status,
    text: await response.text(),
    contentType: response.headers.get("content-type") ?? "",
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${url} request timed out after 10000ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    connection: "close",
  });
  response.end(body);
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server?.listening) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    server.close(finish);
    server.closeIdleConnections?.();
    const timeout = setTimeout(() => {
      server.closeAllConnections?.();
      finish();
    }, 1000);
    timeout.unref?.();
  });
}

function assertNoSensitiveOutput(output) {
  assert.doesNotMatch(output, new RegExp(escapeRegExp(secretAccessKey)), "readiness output leaked secret access key");
  assert.doesNotMatch(output, /["']authorization["']\s*:/i, "readiness output leaked authorization header field");
  assert.doesNotMatch(output, /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/i, "readiness output leaked bearer credential text");
  assert.doesNotMatch(output, /x-amz-security-token/i, "readiness output leaked session-token header text");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
