import assert from "node:assert/strict";
import {
  buildAccessLog,
  buildAttachment,
  buildOperationLog,
} from "./postgresLiveStatementFixtures.mjs";

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`checkPostgresLiveAttachmentRepositoryScenario requires ${name}.`);
  }
}

export async function checkPostgresLiveAttachmentRepositoryScenario({
  attachmentRepository,
  auditRepository,
  runPsql,
} = {}) {
  if (!attachmentRepository || !auditRepository) {
    throw new TypeError("checkPostgresLiveAttachmentRepositoryScenario requires attachment and audit repositories.");
  }
  requireFunction(attachmentRepository.loadState, "attachmentRepository.loadState()");
  requireFunction(attachmentRepository.createAttachment, "attachmentRepository.createAttachment()");
  requireFunction(attachmentRepository.listAttachments, "attachmentRepository.listAttachments()");
  requireFunction(attachmentRepository.findAttachmentById, "attachmentRepository.findAttachmentById()");
  requireFunction(attachmentRepository.findAttachmentByDigest, "attachmentRepository.findAttachmentByDigest()");
  requireFunction(auditRepository.recordAccessLog, "auditRepository.recordAccessLog()");
  requireFunction(auditRepository.listAccessLogs, "auditRepository.listAccessLogs()");
  requireFunction(runPsql, "runPsql(sql, options)");

  const workspace = { attachments: [], attachmentLinks: [], attachmentAccessLogs: [], operationLogs: [] };
+  assert.equal((await attachmentRepository.loadState()).attachments.length, 0);

  const attachment = buildAttachment({
    attachmentId: "ATT-LIVE-REPO-001",
    ownerId: "ST-LIVE-REPO-001",
    uploadedBy: "U-FINANCE-A",
  });
  const link = {
    id: "ALINK-LIVE-REPO-001",
    attachmentId: attachment.attachmentId,
    ownerType: "statement",
    ownerId: attachment.ownerId,
    purpose: "payment_screenshot",
    createdAt: "2026-07-01T10:30:00.000Z",
  };

  const attachmentOperationLog = buildOperationLog({
    logId: "LOG-LIVE-ATTACHMENT-001",
    action: "create_attachment",
    before: null,
    after: attachment,
  });
  attachmentOperationLog.targetType = "statement";
  attachmentOperationLog.targetId = attachment.ownerId;
  const saved = await attachmentRepository.createAttachment({
    workspace,
    attachment,
    link,
    operationLog: attachmentOperationLog,
    idempotencyKey: "attachment-live-repo-001",
    idempotencyPayload: { ownerId: attachment.ownerId, contentDigest: attachment.contentDigest },
  });
  assert.equal(saved.attachment.attachmentId, attachment.attachmentId);
  assert.equal(saved.attachment.ownerId, "ST-LIVE-REPO-001");
  assert.equal(saved.deduplicated, false);
  assert.equal(saved.operationLogId, attachmentOperationLog.id);

  const replayed = await attachmentRepository.createAttachment({
    workspace,
    attachment,
    link,
    operationLog: attachmentOperationLog,
    idempotencyKey: "attachment-live-repo-001",
    idempotencyPayload: { ownerId: attachment.ownerId, contentDigest: attachment.contentDigest },
  });
  assert.deepEqual(replayed, saved);
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id = 'LOG-LIVE-ATTACHMENT-001';", { capture: true }).trim()),
    1,
  );

  await assert.rejects(
    () =>
      attachmentRepository.createAttachment({
        workspace,
        attachment,
        link,
        operationLog: attachmentOperationLog,
        idempotencyKey: "attachment-live-repo-001",
        idempotencyPayload: { ownerId: attachment.ownerId, contentDigest: "b".repeat(64) },
      }),
    (error) => error?.statusCode === 409 && error?.code === "IDEMPOTENCY_KEY_REUSED",
  );

  const duplicateAttachment = buildAttachment({
    attachmentId: "ATT-LIVE-REPO-002",
    ownerId: attachment.ownerId,
    uploadedBy: "U-FINANCE-A",
  });
  duplicateAttachment.fileName = "payment-proof-postgres-live-copy.png";
  const duplicateOperationLog = buildOperationLog({
    logId: "LOG-LIVE-ATTACHMENT-002",
    action: "create_attachment",
    before: null,
    after: duplicateAttachment,
  });
  duplicateOperationLog.targetType = "statement";
  duplicateOperationLog.targetId = attachment.ownerId;
  const duplicateSaved = await attachmentRepository.createAttachment({
    workspace,
    attachment: duplicateAttachment,
    link: {
      ...link,
      id: "ALINK-LIVE-REPO-002",
      attachmentId: duplicateAttachment.attachmentId,
    },
    operationLog: duplicateOperationLog,
    idempotencyKey: "attachment-live-repo-002",
    idempotencyPayload: { ownerId: duplicateAttachment.ownerId, contentDigest: duplicateAttachment.contentDigest },
  });
  assert.equal(duplicateSaved.deduplicated, true);
  assert.equal(duplicateSaved.attachment.attachmentId, attachment.attachmentId);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM attachments WHERE id LIKE 'ATT-LIVE-REPO-%';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM attachment_content_dedup_keys WHERE owner_id = 'ST-LIVE-REPO-001';", { capture: true }).trim()), 1);
  assert.equal(Number(runPsql("SELECT COUNT(*) FROM operation_logs WHERE id LIKE 'LOG-LIVE-ATTACHMENT-%';", { capture: true }).trim()), 2);
  assert.equal(
    Number(
      runPsql("SELECT COUNT(*) FROM operation_idempotency_keys WHERE scope = 'attachment.create';", { capture: true }).trim(),
    ),
    2,
  );

  const concurrentOwnerId = "ST-LIVE-REPO-CONCURRENT";
  const concurrentInputs = ["LEFT", "RIGHT"].map((side, index) => {
    const concurrentAttachment = buildAttachment({
      attachmentId: `ATT-LIVE-CONCURRENT-${side}`,
      ownerId: concurrentOwnerId,
      uploadedBy: "U-FINANCE-A",
    });
    concurrentAttachment.contentDigest = "c".repeat(64);
    const operationLog = buildOperationLog({
      logId: `LOG-LIVE-ATTACHMENT-CONCURRENT-${side}`,
      action: "create_attachment",
      before: null,
      after: concurrentAttachment,
    });
    operationLog.targetType = "statement";
    operationLog.targetId = concurrentOwnerId;
    return {
      workspace,
      attachment: concurrentAttachment,
      link: {
        ...link,
        id: `ALINK-LIVE-CONCURRENT-${side}`,
        attachmentId: concurrentAttachment.attachmentId,
        ownerId: concurrentOwnerId,
      },
      operationLog,
      idempotencyKey: `attachment-live-concurrent-00${index + 1}`,
      idempotencyPayload: {
        ownerId: concurrentOwnerId,
        contentDigest: concurrentAttachment.contentDigest,
        side,
      },
    };
  });
  const concurrentResults = await Promise.all(concurrentInputs.map((input) => attachmentRepository.createAttachment(input)));
  assert.equal(concurrentResults[0].attachment.attachmentId, concurrentResults[1].attachment.attachmentId);
  assert.equal(concurrentResults.filter((result) => result.deduplicated).length, 1);
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM attachments WHERE id LIKE 'ATT-LIVE-CONCURRENT-%';", { capture: true }).trim()),
    1,
  );
  assert.equal(
    Number(
      runPsql(
        "SELECT COUNT(*) FROM attachment_content_dedup_keys WHERE owner_id = 'ST-LIVE-REPO-CONCURRENT';",
        { capture: true },
      ).trim(),
    ),
    1,
  );
  assert.equal(
    Number(
      runPsql("SELECT COUNT(*) FROM operation_logs WHERE id LIKE 'LOG-LIVE-ATTACHMENT-CONCURRENT-%';", {
        capture: true,
      }).trim(),
    ),
    2,
  );

  const listed = await attachmentRepository.listAttachments({
    filters: {
      ownerType: "statement",
      ownerId: "ST-LIVE-REPO-001",
      purpose: "payment_screenshot",
      fileType: "image",
      keyword: "live",
    },
  });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].storageKey, attachment.storageKey);

  const found = await attachmentRepository.findAttachmentById({ attachmentId: attachment.attachmentId });
  assert.equal(found.fileName, attachment.fileName);
  const foundByDigest = await attachmentRepository.findAttachmentByDigest({
    ownerType: attachment.ownerType,
    ownerId: attachment.ownerId,
    purpose: attachment.purpose,
    contentDigest: attachment.contentDigest,
  });
  assert.equal(foundByDigest.attachmentId, attachment.attachmentId);

  const savedLog = await auditRepository.recordAccessLog({
    workspace,
    accessLog: buildAccessLog({
      logId: "ALOG-LIVE-REPO-001",
      attachmentId: attachment.attachmentId,
      operatorId: "U-FINANCE-A",
      operationLogId: "LOG-LIVE-REPO-001",
    }),
  });
  assert.equal(savedLog.logId, "ALOG-LIVE-REPO-001");

  const accessLogs = await auditRepository.listAccessLogs({ attachmentId: attachment.attachmentId, limit: 10 });
  assert.equal(accessLogs.total, 1);
  assert.equal(accessLogs.items[0].operationLogId, "LOG-LIVE-REPO-001");
}
