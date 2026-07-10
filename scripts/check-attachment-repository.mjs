import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildFindAttachmentQuery,
  buildFindAttachmentSql,
  buildFindAttachmentByDigestQuery,
  buildFindAttachmentByDigestSql,
  buildInsertAttachmentQuery,
  buildInsertAttachmentSql,
  buildListAttachmentsQuery,
  buildListAttachmentsSql,
  createLocalAttachmentRepository,
  createPostgresAttachmentRepository,
} from "../server/attachmentRepository.mjs";
import {
  buildInsertAttachmentAccessLogQuery,
  buildInsertAttachmentAccessLogSql,
  buildListAttachmentAccessLogsQuery,
  buildListAttachmentAccessLogsSql,
  createLocalAttachmentAccessAuditRepository,
  createPostgresAttachmentAccessAuditRepository,
} from "../server/attachmentAccessAuditRepository.mjs";

const tempRoot = mkdtempSync(join(tmpdir(), "erp-attachment-repository-"));

try {
  checkLocalRepository();
  await checkPostgresRepositorySqlBoundary();
  await checkLocalAccessAuditRepository();
  await checkPostgresAccessAuditRepositorySqlBoundary();
  console.log(
    "Attachment repository check passed: local JSON persistence, access audit persistence, and PostgreSQL SQL boundaries are covered.",
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function checkLocalRepository() {
  const repository = createLocalAttachmentRepository({ storageRoot: tempRoot });
  const workspace = { attachments: [], attachmentLinks: [] };
  const attachment = buildAttachment({
    attachmentId: "ATT-LOCAL-001",
    ownerId: "ST-LOCAL-001",
    storageKey: "attachments/ATT-LOCAL-001/payment-proof.png",
  });
  const link = buildAttachmentLink({
    id: "ALINK-LOCAL-001",
    attachmentId: attachment.attachmentId,
    ownerId: attachment.ownerId,
  });
  const operationLog = buildAttachmentOperationLog({ id: "LOG-ATT-LOCAL-001", targetId: attachment.ownerId });

  const saved = repository.createAttachment({ workspace, attachment, link, operationLog });
  assert.equal(saved.attachment.attachmentId, attachment.attachmentId);
  assert.equal(saved.deduplicated, false);
  assert.equal(saved.operationLogId, operationLog.id);
  assert.equal(workspace.attachments.length, 1);
  assert.equal(workspace.attachmentLinks.length, 1);
  assert.equal(workspace.operationLogs.length, 1);

  const duplicate = repository.createAttachment({
    workspace,
    attachment: buildAttachment({
      attachmentId: "ATT-LOCAL-002",
      ownerId: attachment.ownerId,
      storageKey: "attachments/ATT-LOCAL-002/payment-proof-copy.png",
    }),
    link: buildAttachmentLink({
      id: "ALINK-LOCAL-002",
      attachmentId: "ATT-LOCAL-002",
      ownerId: attachment.ownerId,
    }),
    operationLog: buildAttachmentOperationLog({ id: "LOG-ATT-LOCAL-002", targetId: attachment.ownerId }),
  });
  assert.equal(duplicate.deduplicated, true);
  assert.equal(duplicate.attachment.attachmentId, attachment.attachmentId);
  assert.equal(workspace.attachments.length, 1);
  assert.equal(workspace.attachmentLinks.length, 1);
  assert.equal(workspace.operationLogs.at(0).action, "reuse_attachment_digest");

  const indexPath = join(tempRoot, "metadata", "attachment-records.json");
  assert.equal(existsSync(indexPath), true, "local repository should persist the attachment JSON index");
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  assert.equal(index.attachments[0].attachmentId, attachment.attachmentId);
  assert.equal(index.attachmentLinks[0].ownerId, attachment.ownerId);

  const loaded = repository.loadState();
  assert.equal(loaded.attachments[0].storageKey, attachment.storageKey);
  assert.equal(loaded.attachmentLinks[0].purpose, "payment_screenshot");

  const listed = repository.listAttachments({
    workspace,
    filters: {
      ownerType: "statement",
      ownerId: attachment.ownerId,
      purpose: "payment_screenshot",
      fileType: "image",
      keyword: "payment-proof",
    },
  });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].attachmentId, attachment.attachmentId);

  workspace.attachments.push({
    ...attachment,
    attachmentId: "ATT-LOCAL-LEGACY-DUPLICATE",
    uploadedAt: "2026-07-02T10:30:00.000Z",
  });
  assert.equal(
    repository.listAttachments({ workspace, filters: { ownerId: attachment.ownerId } }).length,
    1,
    "legacy duplicate metadata should remain stored but collapse in business lists",
  );
  assert.equal(
    repository.findAttachmentByDigest({
      workspace,
      ownerType: attachment.ownerType,
      ownerId: attachment.ownerId,
      purpose: attachment.purpose,
      contentDigest: attachment.contentDigest,
    }).attachmentId,
    attachment.attachmentId,
  );

  const found = repository.findAttachmentById({ workspace, attachmentId: attachment.attachmentId });
  assert.equal(found.fileName, attachment.fileName);
  const digestMatch = repository.findAttachmentByDigest({
    workspace,
    ownerType: attachment.ownerType,
    ownerId: attachment.ownerId,
    purpose: attachment.purpose,
    contentDigest: attachment.contentDigest,
  });
  assert.equal(digestMatch.attachmentId, attachment.attachmentId);
}

async function checkPostgresRepositorySqlBoundary() {
  const calls = [];
  const pgAttachment = buildAttachment({
    attachmentId: "ATT-PG-001",
    ownerId: "ST-PG-001",
    storageKey: "attachments/ATT-PG-001/payment-proof.png",
  });
  const pgLink = buildAttachmentLink({
    id: "ALINK-PG-001",
    attachmentId: pgAttachment.attachmentId,
    ownerId: pgAttachment.ownerId,
  });
  const operationLog = buildAttachmentOperationLog({ id: "LOG-ATT-PG-001", targetId: pgAttachment.ownerId });
  const repository = createPostgresAttachmentRepository({
    postgresClient: {
      queryJson(text, values) {
        calls.push({ kind: "query", text, values });
        if (text.includes("json_agg")) return [pgAttachment];
        if (text.includes("attachment_content_dedup_keys")) return pgAttachment;
        if (text.includes("WHERE a.id")) return pgAttachment;
        throw new Error(`Unexpected PostgreSQL repository SQL:\n${text}`);
      },
      transactionJson(text, values) {
        calls.push({ kind: "transaction", text, values });
        return { attachment: pgAttachment, deduplicated: false, operationLogId: operationLog.id };
      },
      idempotentTransactionJson(request) {
        calls.push({ kind: "idempotent", ...request });
        return { attachment: pgAttachment, deduplicated: false, operationLogId: operationLog.id };
      },
    },
  });

  const workspace = { attachments: [], attachmentLinks: [], operationLogs: [] };
  const saved = await repository.createAttachment({
    workspace,
    attachment: pgAttachment,
    link: pgLink,
    operationLog,
    idempotencyKey: "attachment-create-key-001",
    idempotencyPayload: { ownerId: pgAttachment.ownerId, contentDigest: pgAttachment.contentDigest },
  });
  assert.equal(saved.attachment.attachmentId, "ATT-PG-001");
  assert.equal(saved.deduplicated, false);
  assert.equal(calls[0].kind, "idempotent");
  assert.equal(calls[0].scope, "attachment.create");
  assert.ok(calls[0].resourceLocks.some((value) => value.includes("attachment-digest:")));
  assert.match(calls[0].text, /INSERT INTO attachments/);
  assert.match(calls[0].text, /INSERT INTO attachment_links/);
  assert.match(calls[0].text, /INSERT INTO attachment_content_dedup_keys/);
  assert.match(calls[0].text, /INSERT INTO operation_logs/);
  assert.match(calls[0].text, /selected_attachment_record AS MATERIALIZED/);
  assert.match(calls[0].text, /ERP_ATTACHMENT_ID_CONCURRENCY_CONFLICT/);
  assert.match(calls[0].text, /storage_provider/);
  assert.match(calls[0].text, /content_digest/);
  assert.match(calls[0].text, /metadata_json/);
  assert.match(calls[0].text, /\$\d+::jsonb/);
  assert.ok(calls[0].values.includes(pgAttachment.storageKey));
  assert.equal(workspace.operationLogs[0].id, operationLog.id);

  const listed = await repository.listAttachments({
    filters: {
      ownerType: "statement",
      ownerId: "ST-PG-001",
      purpose: "payment_screenshot",
      fileType: "image",
      keyword: "payment-proof",
    },
  });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].storageKey, pgAttachment.storageKey);
  assert.equal(calls[1].kind, "query");
  assert.match(calls[1].text, /l\.owner_type = \$1::text/);
  assert.match(calls[1].text, /l\.owner_id = \$2::text/);
  assert.match(calls[1].text, /a\.file_type = \$4::text/);
  assert.match(calls[1].text, /ILIKE/);
  assert.deepEqual(calls[1].values, ["statement", "ST-PG-001", "payment_screenshot", "image", "%payment-proof%"]);

  const found = await repository.findAttachmentById({ attachmentId: "ATT-PG-001" });
  assert.equal(found.ownerId, "ST-PG-001");
  assert.equal(calls[2].kind, "query");
  assert.match(calls[2].text, /WHERE a\.id = \$1::text/);
  assert.deepEqual(calls[2].values, ["ATT-PG-001"]);

  const digestMatch = await repository.findAttachmentByDigest({
    ownerType: pgAttachment.ownerType,
    ownerId: pgAttachment.ownerId,
    purpose: pgAttachment.purpose,
    contentDigest: pgAttachment.contentDigest,
  });
  assert.equal(digestMatch.attachmentId, pgAttachment.attachmentId);
  assert.equal(calls[3].kind, "query");
  assert.match(calls[3].text, /FROM attachment_content_dedup_keys AS dedup/);
  assert.deepEqual(calls[3].values, [
    pgAttachment.ownerType,
    pgAttachment.ownerId,
    pgAttachment.purpose,
    pgAttachment.contentDigest,
  ]);

  const insertQuery = buildInsertAttachmentQuery(pgAttachment, pgLink, operationLog);
  const insertSql = buildInsertAttachmentSql(pgAttachment, pgLink, operationLog);
  assert.match(insertSql, /file_size_bytes/);
  assert.match(insertSql, /thumbnail_storage_key/);
  assert.match(insertSql, /signed_url_expires_at|metadata_json/);
  assert.match(insertSql, /LEFT JOIN inserted_link/);
  assert.equal(insertQuery.text, insertSql);
  assert.ok(insertQuery.values.length > 20);

  const listQuery = buildListAttachmentsQuery({ ownerType: "statement" });
  const listSql = buildListAttachmentsSql({ ownerType: "statement" });
  assert.match(listSql, /LEFT JOIN attachment_links/);
  assert.match(listSql, /LEFT JOIN attachment_content_dedup_keys dedup/);
  assert.match(listSql, /dedup\.attachment_id IS NULL OR dedup\.attachment_id = a\.id/);
  assert.match(listSql, /json_agg/);
  assert.equal(listQuery.text, listSql);
  assert.deepEqual(listQuery.values, ["statement"]);

  const findQuery = buildFindAttachmentQuery("ATT-PG-001");
  const findSql = buildFindAttachmentSql("ATT-PG-001");
  assert.match(findSql, /LIMIT 1/);
  assert.equal(findQuery.text, findSql);
  assert.deepEqual(findQuery.values, ["ATT-PG-001"]);

  const digestQuery = buildFindAttachmentByDigestQuery(pgAttachment);
  const digestSql = buildFindAttachmentByDigestSql(pgAttachment);
  assert.equal(digestQuery.text, digestSql);
  assert.match(digestSql, /dedup\.content_digest/);
  assert.deepEqual(digestQuery.values, [
    pgAttachment.ownerType,
    pgAttachment.ownerId,
    pgAttachment.purpose,
    pgAttachment.contentDigest,
  ]);
}

async function checkLocalAccessAuditRepository() {
  const repository = createLocalAttachmentAccessAuditRepository({ storageRoot: tempRoot });
  const workspace = { attachmentAccessLogs: [] };
  const accessLog = buildAttachmentAccessLog({
    logId: "LOG-LOCAL-001",
    attachmentId: "ATT-LOCAL-001",
    operatorId: "U-FINANCE-A",
  });

  const saved = await repository.recordAccessLog({ workspace, accessLog });
  assert.equal(saved.logId, accessLog.logId);
  assert.equal(workspace.attachmentAccessLogs.length, 1);

  const indexPath = join(tempRoot, "metadata", "attachment-access-logs.json");
  assert.equal(existsSync(indexPath), true, "local access-audit repository should persist a JSON index");
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  assert.equal(index.attachmentAccessLogs[0].logId, accessLog.logId);
  assert.equal(index.attachmentAccessLogs[0].attachmentId, accessLog.attachmentId);

  const loaded = repository.loadState();
  assert.equal(loaded.attachmentAccessLogs[0].storageKey, accessLog.storageKey);
  assert.equal(loaded.attachmentAccessLogs[0].accessMode, "permission");

  const listed = await repository.listAccessLogs({ workspace, attachmentId: accessLog.attachmentId, limit: 10 });
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0].logId, accessLog.logId);

  const limited = await repository.listAccessLogs({ workspace, attachmentId: accessLog.attachmentId, limit: 0 });
  assert.equal(limited.items.length, 0);
  assert.equal(limited.total, 1);
}

async function checkPostgresAccessAuditRepositorySqlBoundary() {
  const calls = [];
  const accessLog = buildAttachmentAccessLog({
    logId: "LOG-PG-001",
    attachmentId: "ATT-PG-001",
    operatorId: "U-FINANCE-A",
  });
  const repository = createPostgresAttachmentAccessAuditRepository({
    postgresClient: {
      queryJson(text, values) {
        calls.push({ text, values });
        if (text.includes("INSERT INTO attachment_access_logs")) return accessLog;
        if (text.includes("WITH matched AS")) return { items: [accessLog], total: 1 };
        throw new Error(`Unexpected PostgreSQL access-audit repository SQL:\n${text}`);
      },
    },
  });

  const workspace = { attachmentAccessLogs: [] };
  const saved = await repository.recordAccessLog({ workspace, accessLog });
  assert.equal(saved.logId, "LOG-PG-001");
  assert.match(calls[0].text, /INSERT INTO attachment_access_logs/);
  assert.match(calls[0].text, /operation_log_id/);
  assert.match(calls[0].text, /access_mode/);
  assert.match(calls[0].text, /delivery_mode/);
  assert.match(calls[0].text, /metadata_json/);
  assert.match(calls[0].text, /\$\d+::jsonb/);
  assert.ok(calls[0].values.includes(accessLog.storageKey));

  const listed = await repository.listAccessLogs({ attachmentId: "ATT-PG-001", limit: 20 });
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0].attachmentId, "ATT-PG-001");
  assert.match(calls[1].text, /WHERE attachment_id = \$2::text/);
  assert.match(calls[1].text, /ORDER BY occurred_at DESC/);
  assert.match(calls[1].text, /LIMIT \$1::integer/);
  assert.deepEqual(calls[1].values, [20, "ATT-PG-001"]);

  const insertQuery = buildInsertAttachmentAccessLogQuery(accessLog);
  const insertSql = buildInsertAttachmentAccessLogSql(accessLog);
  assert.match(insertSql, /ON CONFLICT \(id\) DO UPDATE/);
  assert.equal(insertQuery.text, insertSql);
  assert.ok(insertQuery.values.length > 15);

  const listQuery = buildListAttachmentAccessLogsQuery({ attachmentId: "ATT-PG-001", limit: 200 });
  const listSql = buildListAttachmentAccessLogsSql({ attachmentId: "ATT-PG-001", limit: 200 });
  assert.match(listSql, /attachment_access_logs/);
  assert.match(listSql, /LIMIT \$1::integer/);
  assert.equal(listQuery.text, listSql);
  assert.deepEqual(listQuery.values, [100, "ATT-PG-001"]);
}

function buildAttachment(overrides = {}) {
  return {
    attachmentId: overrides.attachmentId,
    ownerType: "statement",
    ownerId: overrides.ownerId,
    fileType: "image",
    purpose: "payment_screenshot",
    url: `/api/attachments/${overrides.attachmentId}/content`,
    status: "uploaded",
    uploadedBy: "U-FINANCE-A",
    uploadedAt: "2026-07-01T10:30:00.000Z",
    fileName: "payment-proof.png",
    contentRef: `p0://payment-screenshot/${overrides.ownerId}/repository-check`,
    mimeType: "image/png",
    fileSize: 13,
    contentDataUrl: "",
    storageProvider: "local_fs",
    storageKey: overrides.storageKey,
    contentDigest: "a".repeat(64),
    hasContent: true,
    remark: "repository check",
  };
}

function buildAttachmentAccessLog(overrides = {}) {
  return {
    logId: overrides.logId,
    attachmentId: overrides.attachmentId,
    operationLogId: overrides.logId,
    action: "attachment_content_read",
    operatorId: overrides.operatorId,
    accessMode: "permission",
    deliveryMode: "api_permission",
    storageProvider: "local_fs",
    storageKey: `attachments/${overrides.attachmentId}/payment-proof.png`,
    ownerType: "statement",
    ownerId: "ST-LOCAL-001",
    purpose: "payment_screenshot",
    fileName: "payment-proof.png",
    contentType: "image/png",
    expiresAt: "",
    occurredAt: "2026-07-01T10:30:00.000Z",
  };
}

function buildAttachmentLink(overrides = {}) {
  return {
    id: overrides.id,
    attachmentId: overrides.attachmentId,
    ownerType: "statement",
    ownerId: overrides.ownerId,
    purpose: "payment_screenshot",
    createdAt: "2026-07-01T10:30:00.000Z",
  };
}

function buildAttachmentOperationLog(overrides = {}) {
  return {
    id: overrides.id,
    targetType: "statement",
    targetId: overrides.targetId,
    action: "create_attachment",
    before: null,
    after: null,
    reason: "payment proof",
    operatorId: "U-FINANCE-A",
    pageKey: "api",
    occurredAt: "2026-07-11T10:00:00.000Z",
    createdAt: "2026-07-11T10:00:00.000Z",
  };
}
