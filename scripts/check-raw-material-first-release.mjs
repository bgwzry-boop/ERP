import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRawMaterialCode39Bars, normalizeRawMaterialBarcodeValue } from "../src/domain/rawMaterialLabelBarcode.js";
import {
  findRawMaterialRollByScan,
  getRawMaterialScanOutboundBlocker,
  normalizeRawMaterialScanCode,
} from "../src/domain/rawMaterialScanOutbound.js";
import { applyRawMaterialInboundAction } from "../server/rawMaterialInboundRepository.mjs";
import { assertRawMaterialFirstReleaseBuildEnv } from "../vite.config.mjs";

assert.doesNotThrow(() => assertRawMaterialFirstReleaseBuildEnv({ VITE_ERP_RUNTIME_MODE: "test" }));
assert.doesNotThrow(() => assertRawMaterialFirstReleaseBuildEnv({
  VITE_ERP_RUNTIME_MODE: "production",
  VITE_RAW_MATERIAL_FIRST_RELEASE: "true",
}));
for (const firstReleaseValue of [undefined, "", "false", "0"]) {
  assert.throws(
    () => assertRawMaterialFirstReleaseBuildEnv({
      VITE_ERP_RUNTIME_MODE: "production",
      VITE_RAW_MATERIAL_FIRST_RELEASE: firstReleaseValue,
    }),
    (error) => error?.code === "VITE_FIRST_RELEASE_SCOPE_REQUIRED",
  );
}

assert.equal(normalizeRawMaterialBarcodeValue("rm-001/2"), "RM-001/2");
const barcode = buildRawMaterialCode39Bars("RM-001");
assert.equal(barcode.encodedValue, "*RM-001*");
assert.equal(barcode.bars.length > 20, true);
assert.equal(barcode.width > 0, true);
assert.equal(normalizeRawMaterialScanCode("*rm-001*"), "RM-001");

const availableInbound = {
  id: "RMI-FIRST-001",
  revision: 1,
  supplierName: "首发供应商",
  deliveryNoteNo: "DN-FIRST-001",
  materialType: "无纺布",
  productName: "无纺布卷料",
  factoryColor: "红色",
  supplierColor: "大红",
  spec: "80cm*90g",
  widthCm: 80,
  gramWeightGsm: 90,
  status: "已贴标入库/可用",
  rolls: [{
    id: "RM-FIRST-001",
    supplierRollNo: "SUP-ROLL-001",
    inventoryStatus: "可用",
    labelStatus: "已贴标/可用库存",
    location: "原料库-可用区",
    weightKg: 96.5,
    widthCm: 80,
    gramWeightGsm: 90,
    factoryColor: "红色",
    spec: "80cm*90g",
  }],
};

const match = findRawMaterialRollByScan([availableInbound], "rm-first-001");
assert.equal(match.inbound.id, availableInbound.id);
assert.equal(match.roll.id, "RM-FIRST-001");
assert.equal(getRawMaterialScanOutboundBlocker(match), "");
assert.match(
  getRawMaterialScanOutboundBlocker({ ...match, roll: { ...match.roll, inventoryStatus: "机边领用", machineId: "3号机" } }),
  /已出库到 3号机/,
);

const issued = applyRawMaterialInboundAction({
  inbounds: [availableInbound],
  workspace: { rawMaterialInbounds: [availableInbound] },
  inboundId: availableInbound.id,
  action: "扫码出库",
  operatorId: "U-WAREHOUSE-A",
  operatorName: "杂工A",
  serverNow: "2026-07-17T08:00:00.000Z",
  body: {
    expectedRevision: 1,
    rollId: "RM-FIRST-001",
    machineId: "3号机",
    issuePurpose: "生产领料（首发阶段暂不关联订单）",
  },
});

assert.equal(issued.inbound.revision, 2);
assert.equal(issued.inbound.rolls[0].inventoryStatus, "机边领用");
assert.equal(issued.inbound.rolls[0].machineId, "3号机");
assert.equal(issued.inbound.rolls[0].productionTaskId, "");
assert.equal(issued.inbound.rawMaterialIssueRecords[0].productionTaskMatchStatus, "首发阶段未关联任务");
assert.equal(issued.inbound.rawMaterialIssueRecords[0].factoryColor, "红色");
assert.equal(issued.inbound.rawMaterialIssueRecords[0].issuedWeightKg, 96.5);
assert.match(issued.inbound.nextStep, /首发阶段暂不关联订单或生产任务/);

const scannerPageSource = readFileSync(new URL("../src/features/raw-materials/RawMaterialScannerPage.jsx", import.meta.url), "utf8");
const labelSheetSource = readFileSync(new URL("../src/features/raw-materials/RawMaterialLabelPrintSheet.jsx", import.meta.url), "utf8");
const inboundPageSource = readFileSync(new URL("../src/features/raw-materials/RawMaterialInboundPage.jsx", import.meta.url), "utf8");
const frontendBuildEnv = readFileSync(new URL("../deploy/production/frontend-build.env.example", import.meta.url), "utf8");
const backendServiceEnv = readFileSync(new URL("../deploy/production/erp-service.env.example", import.meta.url), "utf8");
for (const contract of ["扫描标签上的卷码", "选择机台", "确认扫码出库", "暂不关联订单", "不需要再手抄"]) {
  assert.equal(scannerPageSource.includes(contract), true, `scanner page should retain ${contract}`);
}
assert.match(scannerPageSource, /<select[\s\S]*RAW_MATERIAL_MACHINE_OPTIONS/);
for (const contract of ["RawMaterialCode39", "出库时扫描本卷码", "宽幅", "重量"]) {
  assert.equal(labelSheetSource.includes(contract), true, `label print sheet should retain ${contract}`);
}
assert.match(frontendBuildEnv, /VITE_RAW_MATERIAL_FIRST_RELEASE=true/);
assert.match(backendServiceEnv, /^ERP_FIRST_RELEASE_SCOPE=raw_material$/m);
assert.match(inboundPageSource, /系统不会标记为已打印/);

console.log("raw-material first-release checks passed: label barcode, standalone scan outbound, traceability, and rollout flag are covered.");
