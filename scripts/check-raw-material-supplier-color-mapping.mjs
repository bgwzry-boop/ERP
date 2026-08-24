import assert from "node:assert/strict";
import { getRolePermissionSet } from "../shared/auth/roleCatalog.js";
import {
  isRawMaterialFactoryColor,
  listRawMaterialFactoryColors,
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

assert.equal(
  getRolePermissionSet(["office"]).actionPermissions.includes("master_data.raw_material_color.manage"),
  true,
  "the office receiving role needs limited audited color-rule maintenance so an unmapped receipt is not blocked on the phone",
);

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

const customColorSaved = await service.saveMapping({
  workspace,
  operatorId: "U-MANAGER-A",
  body: {
    supplierName: "宁晋县腾胜无纺布有限公司",
    supplierColor: "海水蓝",
    factoryColor: "湖蓝",
    reason: "现场色卡首次确认，建立厂家专属规则",
  },
});
assert.equal(customColorSaved.statusCode, 200);
assert.equal(customColorSaved.response.mapping.factoryColor, "湖蓝");
assert.equal(isRawMaterialFactoryColor("湖蓝", workspace.standardColors), true);
assert.equal(listRawMaterialFactoryColors(workspace.standardColors).includes("湖蓝"), true);
assert.equal(service.listOptions(workspace).factoryColors.includes("湖蓝"), true);
assert.equal(
  resolveRawMaterialFactoryColor({
    supplierName: "宁晋县腾胜无纺布有限公司",
    supplierColor: "海水蓝",
    standardColors: workspace.standardColors,
    colorAliases: workspace.colorAliases,
  }).factoryColor,
  "湖蓝",
);

console.log("Raw-material supplier color mapping checks passed: supplier scope, extensible standard colors, audited maintenance, and OCR resolution are covered.");

function upsert(records, record) {
  const index = records.findIndex((item) => item.id === record.id);
  if (index >= 0) records[index] = { ...records[index], ...record };
  else records.push(record);
}
