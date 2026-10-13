import assert from "node:assert/strict";
import { createPrintBatchCommandService } from "../server/services/printBatchCommandService.mjs";

const fixedNow = new Date("2026-07-11T08:30:00.000Z");
const repositoryCalls = [];
const workspace = {
  users: [{ userId: "U-AUTH", displayName: "认证办公室" }],
  printBatchRecords: [],
  printBatchRepository: {
    async createPrintBatchRecord(input) {
      repositoryCalls.push(input);
      return {
        printBatchRecord: input.printBatchRecord,
        operationLogId: input.operationLog.id,
      };
    },
  },
};
const service = createPrintBatchCommandService({
  now: () => fixedNow,
  buildOperationLog(_workspace, input) {
    return {
      id: `LOG-${input.targetId}`,
      ...input,
      before: null,
      after: null,
      pageKey: "api",
      occurredAt: fixedNow.toISOString(),
      createdAt: fixedNow.toISOString(),
    };
  },
});

const result = await service.createPrintBatch({
  workspace,
  operatorId: "U-AUTH",
  operatorName: "认证办公室",
  body: {
    idempotencyKey: "print-batch-command-001",
    operatorId: "U-SPOOFED",
    operatorName: "伪造操作人",
    createdAt: "今天 10:30",
    resultLabel: "部分打出",
    todoIds: ["T-PRINT-1"],
    totalTaskCount: 1,
    totalLabelCount: 2,
    printedLabelCount: 1,
    pendingLabelCount: 1,
    printedPackageIds: ["PKG-1"],
    pendingPackageIds: ["PKG-2"],
    printPackages: [
      { packageId: "PKG-1", status: "printed" },
      { packageId: "PKG-2", status: "pending" },
    ],
  },
});

assert.match(result.printBatchRecord.printBatchId, /^PB-API-[A-F0-9]{16}$/);
assert.equal(result.printBatchRecord.operatorId, "U-AUTH");
assert.equal(result.printBatchRecord.operatorName, "认证办公室");
assert.equal(result.printBatchRecord.createdAt, fixedNow.toISOString());
assert.equal(result.printBatchRecord.status, "partial");
assert.equal(repositoryCalls[0].idempotencyKey, "print-batch-command-001");
assert.equal(repositoryCalls[0].idempotencyPayload.operatorId, "U-SPOOFED");
assert.equal(repositoryCalls[0].operationLog.operatorId, "U-AUTH");
assert.equal(repositoryCalls[0].operationLog.after.operatorId, "U-AUTH");

const repeated = await service.createPrintBatch({
  workspace,
  operatorId: "U-AUTH",
  body: {
    ...repositoryCalls[0].idempotencyPayload,
    idempotencyKey: "print-batch-command-001",
  },
});
assert.equal(repeated.printBatchRecord.printBatchId, result.printBatchRecord.printBatchId);

const explicit = await service.createPrintBatch({
  workspace,
  operatorId: "U-MISSING",
  body: {
    printBatchId: "PB-EXPLICIT-1",
    resultLabel: "全部打出",
    totalLabelCount: 1,
    printedLabelCount: 1,
  },
});
assert.equal(explicit.printBatchRecord.printBatchId, "PB-EXPLICIT-1");
assert.equal(explicit.printBatchRecord.operatorName, "U-MISSING");

console.log(
  "Print batch command service checks passed: authenticated operator, stable IDs, timestamps, and idempotency are isolated.",
);
