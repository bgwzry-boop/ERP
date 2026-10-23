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
assert.equal(resolveRawMaterialFactoryColor({
  supplierName: "宁晋县腾胜无纺布有限公司销售退货单",
  supplierColor: "184",
  standardColors: workspace.standardColors,
  colorAliases: workspace.colorAliases,
}).status, "supplier_rule", "退货单完整标题应复用同一厂家映射");
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

// Disabling an obsolete supplier alias must not require re-enabling its retired color.
workspace.standardColors.find(item => item.id === "SC-WHITE").enabled = false;
const disableBody = {supplierName:"A厂",supplierColor:"184",factoryColor:"本白",enabled:false,reason:"停用旧厂家规则"};
const disabled = await service.saveMapping({workspace,operatorId:"U-MANAGER-A",body:{...disableBody,expectedMapping:service.listMappings(workspace).find(row=>row.id==="CA-A-184")}});
assert.equal(disabled.statusCode,200);
assert.equal(disabled.response.mapping.enabled,false);
assert.equal(workspace.standardColors.find(item=>item.id==="SC-WHITE").enabled,false);
assert.equal(workspace.operationLogs.at(-1).after.enabled,false);
const logCount=workspace.operationLogs.length;
const blocked = await service.saveMapping({workspace,operatorId:"U-MANAGER-A",body:{...disableBody,enabled:true}});
assert.equal(blocked.code,"RAW_MATERIAL_FACTORY_COLOR_DISABLED");
assert.equal(workspace.operationLogs.length,logCount);
assert.equal(workspace.colorAliases.find(item=>item.id==="CA-A-184").enabled,false);

workspace.standardColors.find(item=>item.id==="SC-WHITE").enabled=true;
workspace.colorAliases.push({...workspace.colorAliases.find(item=>item.id==="CA-A-184"),id:"CA-A-DUP",enabled:true});
const beforeConflict=workspace.operationLogs.length;
const ambiguous=await service.saveMapping({workspace,operatorId:"U-MANAGER-A",body:disableBody});
assert.equal(ambiguous.code,"RAW_MATERIAL_COLOR_MAPPING_IDENTITY_CONFLICT");
assert.equal(workspace.operationLogs.length,beforeConflict);
const exact=await service.saveMapping({workspace,operatorId:"U-MANAGER-A",body:{...disableBody,mappingId:"CA-A-DUP",expectedMapping:service.listMappings(workspace).find(row=>row.id==="CA-A-DUP")}});
assert.equal(exact.statusCode,200);
assert.equal(exact.response.mapping.id,"CA-A-DUP");
assert.equal(exact.response.mapping.enabled,false);
const mismatch=await service.saveMapping({workspace,operatorId:"U-MANAGER-A",body:{...disableBody,mappingId:"CA-B-184"}});
assert.equal(mismatch.code,"RAW_MATERIAL_COLOR_MAPPING_IDENTITY_CONFLICT");
