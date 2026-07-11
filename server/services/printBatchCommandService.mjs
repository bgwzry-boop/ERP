import { createHash, randomUUID } from "node:crypto";
import { createPrintBatchRecord } from "../../src/state/officeTodoActions.js";

export function createPrintBatchCommandService({ buildOperationLog, now = () => new Date() } = {}) {
  assertFunction(buildOperationLog, "buildOperationLog");

  return {
    async createPrintBatch({ workspace, body = {}, operatorId, operatorName }) {
      const createdAt = normalizeTimestamp(body.createdAt, nowIso(now));
      const printBatchRecord = createPrintBatchRecord({
        ...body,
        printBatchId: normalizeText(body.printBatchId) || buildPrintBatchId(body.idempotencyKey),
        sequence: (workspace.printBatchRecords ?? []).length + 1,
        operatorId,
        operatorName: normalizeText(operatorName) || findOperatorName(workspace, operatorId),
        createdAt,
      });
      const operationLog = buildOperationLog(workspace, {
        targetType: "print_batch",
        targetId: printBatchRecord.printBatchId,
        action: "create_print_batch",
        operatorId,
        reason: printBatchRecord.summary,
      });
      const recordWithLog = {
        ...printBatchRecord,
        operationLogId: operationLog.id,
      };
      const transaction = await workspace.printBatchRepository.createPrintBatchRecord({
        workspace,
        printBatchRecord: recordWithLog,
        operationLog: {
          ...operationLog,
          after: recordWithLog,
        },
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: body,
      });
      return {
        printBatchRecord: transaction.printBatchRecord,
        operationLogId: transaction.operationLogId,
      };
    },
  };
}

function buildPrintBatchId(idempotencyKey) {
  const normalizedKey = normalizeText(idempotencyKey);
  if (normalizedKey) {
    const digest = createHash("sha256").update(normalizedKey).digest("hex").slice(0, 16).toUpperCase();
    return `PB-API-${digest}`;
  }
  return `PB-API-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
}

function findOperatorName(workspace, operatorId) {
  const normalizedId = normalizeText(operatorId);
  const user = (workspace.users ?? []).find(
    (item) => normalizeText(item.userId ?? item.id) === normalizedId,
  );
  return normalizeText(user?.displayName ?? user?.display_name ?? user?.name) || normalizedId;
}

function normalizeTimestamp(value, fallback) {
  const timestamp = normalizeText(value);
  return timestamp && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : fallback;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function nowIso(now) {
  return new Date(now()).toISOString();
}

function assertFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
