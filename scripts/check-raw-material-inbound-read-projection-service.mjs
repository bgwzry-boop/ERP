import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildRawMaterialInboundListResponse,
  buildRawMaterialInboundMetrics,
  normalizeRawMaterialInboundListQuery,
} from "../server/services/rawMaterialInboundReadProjectionService.mjs";

const repositorySource = readFileSync(new URL("../server/rawMaterialInboundRepository.mjs", import.meta.url), "utf8");
const serviceSource = readFileSync(
  new URL("../server/services/rawMaterialInboundReadProjectionService.mjs", import.meta.url),
  "utf8",
);

assert.match(repositorySource, /from "\.\/services\/rawMaterialInboundReadProjectionService\.mjs"/);
assert.ok(repositorySource.split("\n").length <= 2_000, "repository should delegate raw-material list projection");
assert.ok(serviceSource.split("\n").length < 180, "read projection service should stay independently reviewable");

const inbounds = [
  {
    id: "RMI-001",
    supplierName: "白侯无纺布",
    receivedAt: "2026-07-04T01:00:00.000Z",
    status: "已识别待复核",
    materialType: "无纺布",
    productName: "白色无纺布",
    factoryColor: "本白",
    rolls: [{ id: "ROLL-001", inventoryStatus: "不可用", labelStatus: "待生成标签" }],
  },
  {
    id: "RMI-002",
    supplierName: "红袋材料",
    receivedAt: "2026-07-05T01:00:00.000Z",
    status: "已贴标入库/可用",
    rolls: [{ id: "ROLL-002", inventoryStatus: "可用", labelStatus: "已贴标入库/可用" }],
  },
  {
    id: "RMI-003",
    supplierName: "黄袋材料",
    receivedAt: "2026-07-06T01:00:00.000Z",
    status: "已复核待打印标签",
    rolls: [{ id: "ROLL-003", inventoryStatus: "机边领用", labelStatus: "已打印待贴标" }],
    rawMaterialSplitRecords: [
      { splitRecordId: "RMI-SPLIT-001", inboundId: "RMI-003", sourceRollId: "ROLL-003", issuedRollId: "ROLL-003-S01" },
    ],
  },
];

assert.deepEqual(normalizeRawMaterialInboundListQuery(new URLSearchParams({ keyword: "白侯", page: "2", pageSize: "10" })), {
  keyword: "白侯",
  status: "",
  page: 2,
  pageSize: 10,
});

const list = buildRawMaterialInboundListResponse(inbounds, { keyword: "材料", page: 1, pageSize: 2 });
assert.deepEqual(list.items.map((item) => item.id), ["RMI-003", "RMI-002"]);
assert.equal(list.total, 2);
assert.equal(list.page, 1);
assert.equal(list.pageSize, 2);
assert.deepEqual(list.metrics, {
  totalCount: 3,
  pendingReviewCount: 1,
  pendingLabelCount: 1,
  partiallyLabeledCount: 0,
  availableCount: 1,
  issuedCount: 0,
  consumptionConfirmedCount: 0,
  leftoverPendingCount: 0,
  leftoverReviewedCount: 0,
  splitRollCount: 1,
  costAllocationDraftCount: 0,
  costAllocationConfirmedCount: 0,
  lossCalibrationCount: 0,
  marginSnapshotCount: 0,
  marginReportCount: 0,
  exceptionCount: 0,
  availableRollCount: 1,
  machineSideRollCount: 1,
  consumedRollCount: 0,
  leftoverPendingRollCount: 0,
  leftoverReviewedRollCount: 0,
  unavailableRollCount: 2,
});
assert.deepEqual(buildRawMaterialInboundListResponse(inbounds, { status: "已识别待复核" }).items.map((item) => item.id), ["RMI-001"]);
assert.deepEqual(buildRawMaterialInboundMetrics(inbounds), list.metrics);

console.log("Raw-material inbound read projection service checks passed: filters, paging, sorting, and status metrics are isolated.");
