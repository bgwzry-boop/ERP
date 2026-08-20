import assert from "node:assert/strict";
import {
  resolveRawMaterialFactoryColor,
} from "../shared/rawMaterialFactoryColors.js";
import {
  createRawMaterialSupplierColorMappingService,
} from "../server/services/rawMaterialSupplierColorMappingService.mjs";

const standardColors = [
  { id: "SC-WHITE", name: "本白", enabled: true },
  { id: "SC-RED", name: "大红", enabled: true },
];
const colorAliases = [
  { id: "CA-A-184", alias: "184", standardColorId: "SC-WHITE", sourceType: "supplier", sourceId: "A厂", enabled: true },
  { id: "CA-B-184", alias: "184", standardColorId: "SC-RED", sourceType: "supplier", sourceId: "B厂", enabled: true },
];

assert.equal(resolveRawMaterialFactoryColor({ supplierName: "A厂", supplierColor: "184", standardColors, colorAliases }).factoryColor, "本白");
assert.equal(resolveRawMaterialFactoryColor({ supplierName: "B厂", supplierColor: "184", standardColors, colorAliases }).factoryColor, "大红");
assert.equal(resolveRawMaterialFactoryColor({ supplierName: "C厂", supplierColor: "184", standardColors, colorAliases }).status, "unmapped");

const workspace = {
  standardColors: [...standardColors],
  colorAliases: [...colorAliases],
  rawMaterialInbounds: [{ supplierName: "宁晋县腾胜无纺布有限公司" }],
  operationLogs: [],
  masterDataImportTransactionRepository: {
    kind: "test",
    async applyImportExecution({ workspace: target, importExecution, operationLog }) {
      for (const record of importExecution.importPayload.targetRecords.standardColors ?? []) upsert(target.standardColors, record);
      for (const record of importExecution.importPayload.targetRecords.colorAliases ?? []) upsert(target.colorAliases, record);
      target.operationLogs.push(operationLog);
      return { operationLogId: operationLog.id };
    },
  },
};
let logSequence = 0;
const service = createRawMaterialSupplierColorMappingService({
  buildOperationLog: (_workspace, values) => ({ id: `LOG-${++logSequence}`, ...values }),
  now: () => new Date("2026-08-17T08:00:00.000Z"),
});
const saved = await service.saveMapping({
  workspace,
  operatorId: "U-MANAGER-A",
  body: {
    supplierName: "宁晋县腾胜无纺布有限公司",
    supplierColor: "184",
    factoryColor: "本白",
    reason: "按厂家色号表确认",
  },
});
assert.equal(saved.statusCode, 200);
assert.equal(saved.response.mapping.factoryColor, "本白");
assert.equal(workspace.operationLogs[0].reason, "按厂家色号表确认");
assert.equal(service.listOptions(workspace).suppliers[0].supplierName, "宁晋县腾胜无纺布有限公司");
assert.equal(
  resolveRawMaterialFactoryColor({
    supplierName: "宁晋县腾胜无纺布有限公司",
    supplierColor: "184",
    standardColors: workspace.standardColors,
    colorAliases: workspace.colorAliases,
  }).status,
  "supplier_rule",
);

const returnTitleSupplierMapping = resolveRawMaterialFactoryColor({
  supplierName: "宁晋县腾胜无纺布有限公司销售退货单",
  supplierColor: "184",
  standardColors: workspace.standardColors,
  colorAliases: workspace.colorAliases,
});
assert.equal(returnTitleSupplierMapping.status, "supplier_rule");
assert.equal(returnTitleSupplierMapping.factoryColor, "本白");

for (const [supplierColor, factoryColor] of [
  ["酱黄色", "酱黄"],
  ["米黄", "米黄"],
  ["咖啡", "咖啡"],
  ["橄榄绿", "橄榄绿"],
  ["湖蓝", "湖蓝"],
]) {
  const resolution = resolveRawMaterialFactoryColor({
    supplierName: "真实厂家",
    supplierColor,
  });
  assert.equal(resolution.factoryColor, factoryColor);
}
assert.equal(
  resolveRawMaterialFactoryColor({
    supplierName: "真实厂家",
    supplierColor: "彩色",
  }).status,
  "unmapped",
  "笼统的彩色必须保留给人工选择厂内标准色",
);

console.log("Raw-material supplier color mapping checks passed: supplier scope, audited maintenance, and OCR resolution are covered.");

function upsert(records, record) {
  const index = records.findIndex((item) => item.id === record.id);
  if (index >= 0) records[index] = { ...records[index], ...record };
  else records.push(record);
}
