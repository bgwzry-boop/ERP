import assert from "node:assert/strict";
import { checkPostgresLiveAttachmentRepositoryScenario } from "./helpers/postgresLiveAttachmentRepositoryScenario.mjs";

const createInputs = [];
let primaryAttachment = null;
let concurrentAttachment = null;

const attachmentRepository = {
  async loadState() {
    return { attachments: [] };
  },
  async createAttachment(input) {
    createInputs.push(input);
    if (input.idempotencyPayload.contentDigest === "b".repeat(64)) {
      const error = new Error("Idempotency key reused");
      error.statusCode = 409;
      error.code = "IDEMPOTENCY_KEY_REUSED";
      throw error;
    }
    if (input.idempotencyKey.startsWith("attachment-live-repo")) {
      if (!primaryAttachment) {
        primaryAttachment = input.attachment;
        return { attachment: primaryAttachment, deduplicated: false, operationLogId: input.operationLog.id };
      }
      if (input.idempotencyKey === "attachment-live-repo-002") {
        return { attachment: primaryAttachment, deduplicated: true, operationLogId: input.operationLog.id };
      }
      return { attachment: primaryAttachment, deduplicated: false, operationLogId: input.operationLog.id };
    }
    if (!concurrentAttachment) {
      concurrentAttachment = input.attachment;
      return { attachment: concurrentAttachment, deduplicated: false, operationLogId: input.operationLog.id };
    }
    return { attachment: concurrentAttachment, deduplicated: true, operationLogId: input.operationLog.id };
  },
  async listAttachments() {
    return [primaryAttachment];
  },
  async findAttachmentById() {
    return primaryAttachment;
  },
  async findAttachmentByDigest() {
    return primaryAttachment;
  },
};

const auditRepository = {
  async recordAccessLog({ accessLog }) {
    return accessLog;
  },
  async listAccessLogs() {
    return { total: 1, items: [{ operationLogId: "LOG-LIVE-REPO-001" }] };
  },
};

const countBySql = [
  ["operation_logs WHERE id = 'LOG-LIVE-ATTACHMENT-001'", 1],
  ["attachments WHERE id LIKE 'ATT-LIVE-REPO-%'", 1],
  ["attachment_content_dedup_keys WHERE owner_id = 'ST-LIVE-REPO-001'", 1],
  ["operation_logs WHERE id LIKE 'LOG-LIVE-ATTACHMENT-%'", 2],
  ["operation_idempotency_keys WHERE scope = 'attachment.create'", 2],
  ["attachments WHERE id LIKE 'ATT-LIVE-CONCURRENT-%'", 1],
  ["attachment_content_dedup_keys WHERE owner_id = 'ST-LIVE-REPO-CONCURRENT'", 1],
  ["operation_logs WHERE id LIKE 'LOG-LIVE-ATTACHMENT-CONCURRENT-%'", 2],
];

function runPsql(sql, { capture } = {}) {
  assert.equal(capture, true);
  const count = countBySql.find(([fragment]) => sql.includes(fragment))?.[1];
  assert.notEqual(count, undefined, `unexpected SQL: ${sql}`);
  return `${count}\n`;
}

await checkPostgresLiveAttachmentRepositoryScenario({
  attachmentRepository,
  auditRepository,
  runPsql,
});

assert.equal(createInputs.length, 6);
assert.equal(primaryAttachment.attachmentId, "ATT-LIVE-REPO-001");
assert.equal(concurrentAttachment.contentDigest, "c".repeat(64));
await assert.rejects(
  () => checkPostgresLiveAttachmentRepositoryScenario(),
  /requires attachment and audit repositories/,
);

console.log("PostgreSQL live attachment repository scenario checks passed: idempotency, deduplication, concurrency, and access audit boundaries are stable.");
