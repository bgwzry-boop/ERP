import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import {
  buildMasterDataImportTemplateWorkbook,
  getMasterDataImportWorksheetSpecs,
} from "../src/domain/masterDataImportTemplate.js";
import {
  MASTER_DATA_IMPORT_PRECHECK_VERSION,
  precheckMasterDataImportWorkbook,
} from "../src/domain/masterDataImportPrecheck.js";
import { buildXlsxWorkbookFromWorksheets, cell } from "../src/domain/xlsxWorkbook.js";

const generatedAt = "2026-07-03T10:30:00.000Z";
const validWorkbook = buildMasterDataImportTemplateWorkbook({
  templateKey: "all",
  includeFixtureRows: true,
  generatedAt,
  generatedBy: "office-admin",
});
const validResult = await precheckMasterDataImportWorkbook({
  bytes: validWorkbook,
  fileName: "erp-master-data-import-template-2026-07-03.xlsx",
  checkedAt: generatedAt,
});

assert.equal(validResult.version, MASTER_DATA_IMPORT_PRECHECK_VERSION);
assert.equal(validResult.summary.status, "passed");
assert.equal(validResult.summary.importAllowed, true);
assert.equal(validResult.summary.dataRowCount, 5);
assert.equal(validResult.summary.checkedSheetCount, 5);
assert.equal(validResult.summary.errorCount, 0);
assert.equal(validResult.summary.warningCount, 0);
assert.equal(validResult.employeeRoleCoverage.available, true);
assert.equal(validResult.employeeRoleCoverage.coverageLabel, "1/8");
assert.equal(validResult.employeeRoleCoverage.coveredRoleCount, 1);
assert.equal(validResult.employeeRoleCoverage.missingRoleCount, 7);
assert.equal(validResult.employeeRoleCoverage.roles.find((role) => role.roleKey === "workshop")?.rowCount, 1);
assert.equal(validResult.employeePayrollAttendanceCoverage.available, true);
assert.equal(validResult.employeePayrollAttendanceCoverage.coverageLabel, "1/1");
assert.equal(validResult.employeePayrollAttendanceCoverage.complete, true);
assert(validResult.sheets.every((sheet) => sheet.status === "ok"), "valid template sheets should pass");
assert.equal(validResult.stagedRows.length, 5);
assert(validResult.stagedRows.some((sheet) => sheet.sheetKey === "customers" && sheet.rows[0].values["客户名称"] === "张三服饰"));
assert(validResult.stagedRows.some((sheet) => sheet.sheetKey === "inventory_items" && sheet.rows[0].values["在库数量"] === "2480"));

const emptyGeneratedResult = await precheckMasterDataImportWorkbook({
  bytes: buildMasterDataImportTemplateWorkbook({ templateKey: "all", generatedAt, generatedBy: "office-admin" }),
  fileName: "empty-system-template.xlsx",
  checkedAt: generatedAt,
});
assert.equal(emptyGeneratedResult.summary.status, "blocked");
assert.equal(emptyGeneratedResult.summary.dataRowCount, 0);
assert.equal(emptyGeneratedResult.summary.errorCount, 5);
assert.equal(emptyGeneratedResult.stagedRows.length, 0);
assert(emptyGeneratedResult.issues.every((issue) => issue.message.includes("没有可导入数据")));

const workshopOnlyResult = await precheckMasterDataImportWorkbook({
  bytes: buildMasterDataImportTemplateWorkbook({ templateKey: "workshop", generatedAt, generatedBy: "office-admin", includeFixtureRows: true }),
  fileName: "erp-workshop-master-import-template-2026-07-03.xlsx",
  checkedAt: generatedAt,
});
assert.equal(workshopOnlyResult.summary.status, "passed");
assert.equal(workshopOnlyResult.summary.checkedSheetCount, 1);
assert.equal(workshopOnlyResult.summary.dataRowCount, 1);
assert.equal(workshopOnlyResult.employeeRoleCoverage.coverageLabel, "1/8");

const employeeSpec = getMasterDataImportWorksheetSpecs().find((spec) => spec.key === "employees_machines");
const officeOnlyWorkbook = buildEmployeeOnlyWorkbook(employeeSpec, {
  员工编号: "EMP-OFFICE-001",
  员工姓名: "陈文员",
  角色: "办公室",
  启用状态: "启用",
});
const officeOnlyResult = await precheckMasterDataImportWorkbook({
  bytes: officeOnlyWorkbook,
  fileName: "office-employees.xlsx",
  checkedAt: generatedAt,
});
assert.equal(officeOnlyResult.summary.status, "passed");
assert.equal(officeOnlyResult.summary.importAllowed, true);
assert.equal(officeOnlyResult.employeeRoleCoverage.roles.find((role) => role.roleKey === "office")?.rowCount, 1);
assert.equal(officeOnlyResult.employeePayrollAttendanceCoverage.coverageLabel, "0/1");
assert.equal(officeOnlyResult.employeePayrollAttendanceCoverage.profileReadyCount, 0);
assert.equal(officeOnlyResult.employeePayrollAttendanceCoverage.wageReadyCount, 0);
assert.equal(officeOnlyResult.employeePayrollAttendanceCoverage.attendanceMappingReadyCount, 0);
assert(!officeOnlyResult.issues.some((issue) => issue.field === "默认车间" || issue.field === "默认机台"));

const ownerMultiRoleResult = await precheckMasterDataImportWorkbook({
  bytes: buildEmployeeOnlyWorkbook(employeeSpec, {
    员工编号: "ERP-0001",
    员工姓名: "负责人",
    角色: "管理",
    附加角色: "财务 / 对账",
  }),
  fileName: "owner-multi-role.xlsx",
  checkedAt: generatedAt,
});
assert.equal(ownerMultiRoleResult.summary.status, "passed");
assert.equal(ownerMultiRoleResult.employeeRoleCoverage.coverageLabel, "2/8");
assert.equal(ownerMultiRoleResult.employeeRoleCoverage.roles.find((role) => role.roleKey === "management")?.rowCount, 1);
assert.equal(ownerMultiRoleResult.employeeRoleCoverage.roles.find((role) => role.roleKey === "finance")?.rowCount, 1);

const missingEmployeeIdResult = await precheckMasterDataImportWorkbook({
  bytes: buildEmployeeOnlyWorkbook(employeeSpec, { 员工姓名: "缺编号员工", 角色: "办公室", 启用状态: "启用" }),
  fileName: "missing-employee-id.xlsx",
  checkedAt: generatedAt,
});
assert.equal(missingEmployeeIdResult.summary.status, "blocked");
assert(missingEmployeeIdResult.issues.some((issue) => issue.message.includes("员工编号 不能为空")));

const invalidEmployeeIdResult = await precheckMasterDataImportWorkbook({
  bytes: buildEmployeeOnlyWorkbook(employeeSpec, { 员工编号: "员工 001", 员工姓名: "非法编号员工", 角色: "办公室", 启用状态: "启用" }),
  fileName: "invalid-employee-id.xlsx",
  checkedAt: generatedAt,
});
assert.equal(invalidEmployeeIdResult.summary.status, "blocked");
assert(invalidEmployeeIdResult.issues.some((issue) => issue.message.includes("员工编号须为1-32位")));

const duplicateEmployeeResult = await precheckMasterDataImportWorkbook({
  bytes: buildEmployeeOnlyWorkbook(employeeSpec, [
    { 员工编号: "EMP-DUP-001", 员工姓名: "员工甲", 角色: "办公室", 启用状态: "启用" },
    { 员工编号: "emp-dup-001", 员工姓名: "员工乙", 角色: "财务 / 对账", 启用状态: "启用" },
  ]),
  fileName: "duplicate-employee-id.xlsx",
  checkedAt: generatedAt,
});
assert.equal(duplicateEmployeeResult.summary.status, "blocked");
assert(duplicateEmployeeResult.issues.some((issue) => issue.message.includes("员工编号 重复")));

const employeePayrollProfileResult = await precheckMasterDataImportWorkbook({
  bytes: buildEmployeeOnlyWorkbook(employeeSpec, {
    员工编号: "EMP-PAY-001",
    员工姓名: "工资员工",
    出生日期: "1988-06-01",
    入职日期: "2020-03-02",
    角色: "财务 / 对账",
    基础时薪: 15.5,
    "岗位补贴/小时": 2,
    生效日期: "2026-08-01",
    考勤来源: "deli",
    考勤人员编号: "D5FN-1001",
  }),
  fileName: "employee-payroll-profile.xlsx",
  checkedAt: generatedAt,
});
assert.equal(employeePayrollProfileResult.summary.status, "passed");
assert.equal(employeePayrollProfileResult.stagedRows[0].rows[0].values["出生日期"], "1988-06-01");
assert.equal(employeePayrollProfileResult.stagedRows[0].rows[0].values["考勤人员编号"], "D5FN-1001");

const invalidEmployeePayrollProfiles = await precheckMasterDataImportWorkbook({
  bytes: buildEmployeeOnlyWorkbook(employeeSpec, [
    { 员工编号: "EMP-PAY-002", 员工姓名: "映射甲", 角色: "办公室", 出生日期: "2026-02-30", 考勤来源: "deli", 考勤人员编号: "D5FN-DUP" },
    { 员工编号: "EMP-PAY-003", 员工姓名: "映射乙", 角色: "办公室", 出生日期: "1990-01-01", 入职日期: "1989-01-01", 考勤来源: "DELI", 考勤人员编号: "D5FN-DUP" },
    { 员工编号: "EMP-PAY-004", 员工姓名: "映射丙", 角色: "办公室", 考勤来源: "deli" },
  ]),
  fileName: "invalid-employee-payroll-profiles.xlsx",
  checkedAt: generatedAt,
});
assert.equal(invalidEmployeePayrollProfiles.summary.status, "blocked");
assert(invalidEmployeePayrollProfiles.issues.some((issue) => issue.field === "出生日期" && issue.message.includes("有效")));
assert(invalidEmployeePayrollProfiles.issues.some((issue) => issue.message.includes("入职日期必须晚于出生日期")));
assert(invalidEmployeePayrollProfiles.issues.some((issue) => issue.message.includes("考勤身份 重复")));
assert(invalidEmployeePayrollProfiles.issues.some((issue) => issue.message.includes("必须同时填写")));

const copiedExampleResult = await precheckMasterDataImportWorkbook({
  bytes: buildEmployeeOnlyWorkbook(employeeSpec, {
    员工编号: "示例-请替换",
    员工姓名: "王师傅",
    角色: "车间报工",
    默认车间: "1号车间",
    默认机台: "1号机",
    启用状态: "启用",
  }),
  fileName: "copied-employee-example.xlsx",
  checkedAt: generatedAt,
});
assert.equal(copiedExampleResult.summary.status, "blocked");
assert(copiedExampleResult.issues.some((issue) => issue.message.includes("未替换的模板示例标记")));

const priceSpec = getMasterDataImportWorksheetSpecs().find((spec) => spec.key === "price_tables");
const priceWithoutSpecsResult = await precheckMasterDataImportWorkbook({
  bytes: buildXlsxWorkbookFromWorksheets({
    worksheets: [{
      name: priceSpec.worksheetName,
      rows: [priceSpec.columns, priceSpec.columns.map((column) => priceSpec.requiredFields.includes(column) ? "必填" : "可选")],
    }],
  }),
  fileName: "price-without-product-specs.xlsx",
  checkedAt: generatedAt,
});
assert.equal(priceWithoutSpecsResult.summary.status, "blocked");
assert(priceWithoutSpecsResult.issues.some((issue) => issue.message.includes("缺少 尺寸颜色款式 sheet")));

const externalWorkbook = buildExternalCompressedSharedStringWorkbook();
const externalResult = await precheckMasterDataImportWorkbook({
  bytes: externalWorkbook,
  fileName: "external-resaved-master-data.xlsx",
  checkedAt: generatedAt,
});

assert.equal(externalResult.summary.status, "passed");
assert.equal(externalResult.summary.importAllowed, true);
assert.equal(externalResult.summary.dataRowCount, 5);
assert(externalResult.stagedRows.some((sheet) => sheet.sheetKey === "customers" && sheet.rows[0].values["客户名称"] === "外部服饰"));
assert(externalResult.stagedRows.some((sheet) => sheet.sheetKey === "price_tables" && sheet.rows[0].values["单价"] === "0.34"));
assert(externalResult.stagedRows.some((sheet) => sheet.sheetKey === "inventory_items" && sheet.rows[0].values["在库数量"] === "2480"));
assert.equal(getExternalStagedValues(externalResult, "price_tables")["生效日期"], "2026-07-03");
assert.equal(getExternalStagedValues(externalResult, "inventory_items")["盘点日期"], "2026-07-01");
assert.equal(getExternalStagedValues(externalResult, "employees_machines")["生效日期"], "2026-07-01");

const namespacePrefixedResult = await precheckMasterDataImportWorkbook({
  bytes: buildNamespacePrefixedEmployeeWorkbook(employeeSpec),
  fileName: "namespace-prefixed-employees.xlsx",
  checkedAt: generatedAt,
});
assert.equal(namespacePrefixedResult.summary.status, "passed");
assert.equal(namespacePrefixedResult.summary.dataRowCount, 1);
assert.equal(namespacePrefixedResult.summary.checkedSheetCount, 1);
assert.equal(namespacePrefixedResult.employeeRoleCoverage.coverageLabel, "1/8");
assert.equal(getExternalStagedValues(namespacePrefixedResult, "employees_machines")["员工编号"], "EMP-NS-001");

const namespacePrefixedMissingIdResult = await precheckMasterDataImportWorkbook({
  bytes: buildNamespacePrefixedEmployeeWorkbook(employeeSpec, { missingEmployeeNumber: true }),
  fileName: "namespace-prefixed-employee-missing-id.xlsx",
  checkedAt: generatedAt,
});
assert.equal(namespacePrefixedMissingIdResult.summary.status, "blocked");
assert(namespacePrefixedMissingIdResult.issues.some((issue) => issue.field === "员工编号" && issue.message.includes("不能为空")));
assert(!namespacePrefixedMissingIdResult.issues.some((issue) => issue.field === "员工姓名"));

const invalidWorkbook = buildXlsxWorkbookFromWorksheets({
  title: "错误基础资料导入模板",
  creator: "test",
  createdAt: generatedAt,
  worksheets: [
    {
      name: "导入说明",
      columns: [120, 160],
      rows: [[cell("错误样例", { styleId: "Title", mergeAcross: 1 })]],
    },
    {
      name: "客户档案",
      columns: [120, 120, 120],
      rows: [
        ["客户编号", "客户名称", "联系人姓名", "手机号", "风险状态", "启用状态"].map((item) => cell(item, { styleId: "Header" })),
        ["可选", "必填", "必填", "必填", "可选", "可选"].map((item) => cell(item)),
        ["C-001", "", "张老板", "", "未知风险", "启用"].map((item) => cell(item)),
      ],
    },
    {
      name: "价格表",
      columns: [120, 120, 120],
      rows: [
        ["价格表名称", "价格类型", "生效日期", "尺寸", "成品款式", "颜色", "提手类型", "阶梯起量", "单价", "审核状态"].map((item) => cell(item, { styleId: "Header" })),
        ["必填", "必填", "必填", "必填", "可选", "可选", "可选", "可选", "必填", "可选"].map((item) => cell(item)),
        ["袋子价格表1", "袋子", "2026-07-01", "30*37*10", "空白袋", "紫色", "普通提", "1", "8", "已生效"].map((item) => cell(item)),
      ],
    },
    {
      name: "尺寸颜色款式",
      columns: [120, 120, 120],
      rows: [
        ["标准尺寸", "标准颜色", "提手类型", "成品款式", "启用状态"].map((item) => cell(item, { styleId: "Header" })),
        ["必填", "必填", "必填", "必填", "可选"].map((item) => cell(item)),
        ["30*37*10", "白色", "普通提", "空白袋", "启用"].map((item) => cell(item)),
      ],
    },
    {
      name: "初始库存",
      columns: [120, 120, 120],
      rows: [
        ["尺寸", "颜色", "提手类型", "成品款式", "库区", "库存状态", "在库数量", "已占用", "待提货锁定", "待处理"].map((item) => cell(item, { styleId: "Header" })),
        ["必填", "必填", "必填", "必填", "必填", "必填", "必填", "可选", "可选", "可选"].map((item) => cell(item)),
        ["30*37*10", "红色", "普通提", "空白袋", "成品仓A", "可用", "10", "20", "0", "0"].map((item) => cell(item)),
      ],
    },
    {
      name: "员工机台",
      columns: [120, 120, 120],
      rows: [
        ["员工姓名", "角色", "默认车间", "默认机台", "粗略日产量", "启用状态"].map((item) => cell(item, { styleId: "Header" })),
        ["必填", "必填", "必填", "可选", "可选", "可选"].map((item) => cell(item)),
        ["王师傅", "神秘岗位", "1号车间", "", "-1", "启用"].map((item) => cell(item)),
        ["李师傅", "制袋工", "1号车间", "", "1000", "启用"].map((item) => cell(item)),
      ],
    },
  ],
});
const invalidResult = await precheckMasterDataImportWorkbook({
  bytes: invalidWorkbook,
  fileName: "invalid-master-data.xlsx",
  checkedAt: generatedAt,
});

assert.equal(invalidResult.summary.status, "blocked");
assert.equal(invalidResult.summary.importAllowed, false);
assert(invalidResult.summary.errorCount >= 4, "invalid template should include blocking errors");
assert(invalidResult.summary.warningCount >= 3, "invalid template should include confirmation warnings");
assert(invalidResult.issues.some((issue) => issue.message.includes("客户名称 不能为空")));
assert(invalidResult.issues.some((issue) => issue.message.includes("手机号 不能为空")));
assert(invalidResult.issues.some((issue) => issue.message.includes("单价明显偏高")));
assert(invalidResult.issues.some((issue) => issue.message.includes("价格导入应先进入待审核")));
assert(invalidResult.issues.some((issue) => issue.message.includes("不能大于在库数量")));
assert(invalidResult.issues.some((issue) => issue.message.includes("未在尺寸颜色款式 sheet 定义")));
assert(invalidResult.issues.some((issue) => issue.message.includes("角色无法映射到V1正式岗位")));
assert(!invalidResult.issues.some((issue) => issue.message.includes("车间岗位必须填写默认机台")));
assert.equal(invalidResult.employeeRoleCoverage.coverageLabel, "1/8");

console.log("master-data import precheck passed");

function buildExternalCompressedSharedStringWorkbook() {
  const specs = getMasterDataImportWorksheetSpecs();
  const sheetNames = ["导入说明", ...specs.map((spec) => spec.worksheetName)];
  const sharedStrings = [];
  const files = [
    { path: "[Content_Types].xml", content: buildContentTypes(sheetNames.length) },
    { path: "_rels/.rels", content: buildRootRels() },
    { path: "xl/workbook.xml", content: buildWorkbookXml(sheetNames) },
    { path: "xl/_rels/workbook.xml.rels", content: buildWorkbookRels(sheetNames.length) },
    { path: "xl/styles.xml", content: "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"/>" },
    { path: "xl/worksheets/sheet1.xml", content: buildExternalWorksheet([["外部 Excel 兼容测试"]], sharedStrings) },
    ...specs.map((spec, index) => ({
      path: `xl/worksheets/sheet${index + 2}.xml`,
      content: buildExternalDataWorksheet(spec, sharedStrings, spec.key === "customers"),
    })),
  ];
  files.push({ path: "xl/sharedStrings.xml", content: buildSharedStringsXml(sharedStrings) });
  return createCompressedZipWithDataDescriptors(files);
}

function buildEmployeeOnlyWorkbook(employeeSpec, values) {
  const valueRows = Array.isArray(values) ? values : [values];
  return buildXlsxWorkbookFromWorksheets({
    title: "员工正式资料导入",
    creator: "test",
    createdAt: generatedAt,
    worksheets: [{
      name: employeeSpec.worksheetName,
      columns: employeeSpec.columns.map(() => 120),
      rows: [
        employeeSpec.columns.map((column) => cell(column, { styleId: "Header" })),
        employeeSpec.columns.map((column) => cell(employeeSpec.requiredFields.includes(column) ? "必填" : employeeSpec.conditionalRequiredFields.includes(column) ? "车间岗必填" : employeeSpec.deferredFields.includes(column) ? "可后补" : "可选")),
        ...valueRows.map((row) => employeeSpec.columns.map((column) => cell(row[column] ?? ""))),
      ],
    }],
  });
}

function buildNamespacePrefixedEmployeeWorkbook(employeeSpec, options = {}) {
  const sharedStrings = [];
  const values = {
    员工编号: options.missingEmployeeNumber ? "" : "EMP-NS-001",
    员工姓名: "命名空间员工",
    角色: "办公室",
    启用状态: "启用",
  };
  const rows = [
    employeeSpec.columns,
    employeeSpec.columns.map((column) => employeeSpec.requiredFields.includes(column) ? "必填" : employeeSpec.conditionalRequiredFields.includes(column) ? "车间岗必填" : employeeSpec.deferredFields.includes(column) ? "可后补" : "可选"),
    employeeSpec.columns.map((column) => values[column] ?? ""),
  ];
  let worksheetXml = buildExternalWorksheet(rows, sharedStrings)
    .replaceAll("<worksheet", "<x:worksheet")
    .replaceAll("</worksheet>", "</x:worksheet>")
    .replaceAll("<sheetData", "<x:sheetData")
    .replaceAll("</sheetData>", "</x:sheetData>")
    .replaceAll("<row", "<x:row")
    .replaceAll("</row>", "</x:row>")
    .replaceAll("<c", "<x:c")
    .replaceAll("</c>", "</x:c>")
    .replaceAll("<v>", "<x:v>")
    .replaceAll("</v>", "</x:v>")
    .replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"');
  if (options.missingEmployeeNumber) {
    worksheetXml = worksheetXml.replace(/<x:c r="A3" t="s"><x:v>\d+<\/x:v><\/x:c>/, '<x:c r="A3" t="str" />');
  }
  const sharedStringsXml = buildSharedStringsXml(sharedStrings)
    .replace("<sst ", "<x:sst ")
    .replace("</sst>", "</x:sst>")
    .replaceAll("<si>", "<x:si>")
    .replaceAll("</si>", "</x:si>")
    .replaceAll("<t>", "<x:t>")
    .replaceAll("</t>", "</x:t>")
    .replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"');
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:sheets><x:sheet name="${escapeXmlText(employeeSpec.worksheetName)}" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:Relationships xmlns:p="http://schemas.openxmlformats.org/package/2006/relationships"><p:Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml"/><p:Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></p:Relationships>`;
  return createCompressedZipWithDataDescriptors([
    { path: "[Content_Types].xml", content: buildContentTypes(1) },
    { path: "_rels/.rels", content: buildRootRels() },
    { path: "xl/workbook.xml", content: workbookXml },
    { path: "xl/_rels/workbook.xml.rels", content: workbookRels },
    { path: "xl/styles.xml", content: "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"/>" },
    { path: "xl/worksheets/sheet1.xml", content: worksheetXml },
    { path: "xl/sharedStrings.xml", content: sharedStringsXml },
  ]);
}

function buildExternalDataWorksheet(spec, sharedStrings, omitHeaderRefs = false) {
  const rows = [
    spec.columns.map((column) => ({ value: column, omitRef: omitHeaderRefs })),
    spec.columns.map((column) => ({ value: spec.requiredFields.includes(column) ? "必填" : "可选", omitRef: omitHeaderRefs })),
    spec.columns.map((column) => externalValueFor(spec.key, column)),
  ];
  return buildExternalWorksheet(rows, sharedStrings);
}

function externalValueFor(sheetKey, column) {
  const values = {
    customers: {
      客户编号: "C-EXT-001",
      客户名称: { value: "外部服饰", richParts: ["外部", "服饰"] },
      风险状态: "正常",
      结算周期: "月结",
      默认交付方式: "自提",
      默认价格表: "外部袋子价格表",
      联系人姓名: "陈老板",
      联系人角色: "老板",
      手机号: "13900000009",
      地址区域: "虎门",
      详细地址: "虎门大道 99 号",
      下单群名称: "外部服饰下单群",
      启用状态: "启用",
    },
    price_tables: {
      价格表编号: "PT-EXT-001",
      价格表名称: "外部袋子价格表",
      价格类型: "袋子",
      生效日期: excelDateSerial("2026-07-03"),
      尺寸: "30*37*10",
      成品款式: "空白袋",
      颜色: "红色",
      提手类型: "普通提",
      阶梯起量: 1,
      单价: { value: 0.34, formula: "0.17*2" },
      加长提加价: 0.03,
      审核状态: "待审核",
      备注: "外部另存 Excel 样本",
    },
    product_specs: {
      规格编号: "SPEC-EXT-001",
      客户叫法: "30*38",
      标准尺寸: "30*37*10",
      实际生产尺寸: "30*37*10",
      袋体宽幅cm: 90,
      布长cm: 42,
      标准颜色: "红色",
      颜色别名: "大红/红袋",
      提手类型: "普通提",
      成品款式: "空白袋",
      启用状态: "启用",
    },
    inventory_items: {
      库存编号: "INV-EXT-001",
      尺寸: "30*37*10",
      颜色: "红色",
      提手类型: "普通提",
      成品款式: "空白袋",
      库区: "成品仓A",
      库存状态: "可用",
      在库数量: { value: 2480, formula: "2500-20" },
      已占用: 120,
      待提货锁定: 0,
      待处理: 0,
      来源备注: "2026-07 初始盘点",
      可信度: "仓库已清点",
      盘点日期: excelDateSerial("2026-07-01"),
    },
    employees_machines: {
      员工编号: "EMP-EXT-001",
      员工姓名: "王师傅",
      角色: "制袋工",
      默认车间: "1号车间",
      默认机台: "1号机",
      基础时薪: 10,
      "岗位补贴/小时": 5,
      生效日期: excelDateSerial("2026-07-01"),
      机台编号: "M-01",
      机台名称: "1号制袋机",
      机台车间: "1号车间",
      产能尺寸: "30*37*10",
      粗略日产量: 12000,
      启用状态: "启用",
    },
  };
  return values[sheetKey]?.[column] ?? "";
}

function getExternalStagedValues(result, sheetKey) {
  const row = result.stagedRows.find((sheet) => sheet.sheetKey === sheetKey)?.rows?.[0];
  assert(row, `missing staged row for ${sheetKey}`);
  return row.values;
}

function excelDateSerial(isoDate) {
  const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  assert(match, `invalid iso date ${isoDate}`);
  const utcMs = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const baseMs = Date.UTC(1899, 11, 30);
  return Math.round((utcMs - baseMs) / (24 * 60 * 60 * 1000));
}

function buildExternalWorksheet(rows, sharedStrings) {
  const rowXml = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((cellValue, columnIndex) => buildExternalCell(cellValue, rowNumber, columnIndex + 1, sharedStrings)).join("");
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

function buildExternalCell(input, rowNumber, columnNumber, sharedStrings) {
  const cellInput = isPlainObject(input) ? input : { value: input };
  const refText = cellInput.omitRef ? "" : ` r="${columnName(columnNumber)}${rowNumber}"`;
  if (cellInput.formula) {
    return `<c${refText}><f>${escapeXmlText(cellInput.formula)}</f><v>${escapeXmlText(cellInput.value)}</v></c>`;
  }
  if (typeof cellInput.value === "number" && Number.isFinite(cellInput.value)) {
    return `<c${refText}><v>${cellInput.value}</v></c>`;
  }
  const sharedStringIndex = sharedStrings.length;
  sharedStrings.push(cellInput.richParts ? { richParts: cellInput.richParts } : { value: String(cellInput.value ?? "") });
  return `<c${refText} t="s"><v>${sharedStringIndex}</v></c>`;
}

function buildSharedStringsXml(sharedStrings) {
  const items = sharedStrings.map((item) => {
    if (Array.isArray(item.richParts)) {
      return `<si>${item.richParts.map((part) => `<r><t>${escapeXmlText(part)}</t></r>`).join("")}</si>`;
    }
    return `<si><t>${escapeXmlText(item.value)}</t></si>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${items}</sst>`;
}

function buildContentTypes(sheetCount) {
  const sheets = Array.from({ length: sheetCount }, (_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets}<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
}

function buildRootRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function buildWorkbookXml(sheetNames) {
  const sheets = sheetNames.map((name, index) =>
    `<sheet name="${escapeXmlText(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}

function buildWorkbookRels(sheetCount) {
  const sheets = Array.from({ length: sheetCount }, (_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet${index + 1}.xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId${sheetCount + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function createCompressedZipWithDataDescriptors(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const contentBytes = encoder.encode(String(file.content ?? ""));
    const compressedBytes = new Uint8Array(deflateRawSync(contentBytes));
    const crc = crc32(contentBytes);
    const localHeader = createLocalZipHeader(nameBytes);
    const dataDescriptor = createZipDataDescriptor({ crc, compressedSize: compressedBytes.length, uncompressedSize: contentBytes.length });
    localParts.push(localHeader, compressedBytes, dataDescriptor);
    centralParts.push(createCentralZipHeader({ nameBytes, crc, compressedSize: compressedBytes.length, uncompressedSize: contentBytes.length, offset }));
    offset += localHeader.length + compressedBytes.length + dataDescriptor.length;
  }
  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
  return concatUint8Arrays([...localParts, ...centralParts, createZipEndRecord(files.length, centralDirectorySize, centralDirectoryOffset)]);
}

function createLocalZipHeader(nameBytes) {
  const header = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 8, true);
  view.setUint16(8, 8, true);
  view.setUint16(26, nameBytes.length, true);
  header.set(nameBytes, 30);
  return header;
}

function createZipDataDescriptor({ crc, compressedSize, uncompressedSize }) {
  const descriptor = new Uint8Array(16);
  const view = new DataView(descriptor.buffer);
  view.setUint32(0, 0x08074b50, true);
  view.setUint32(4, crc, true);
  view.setUint32(8, compressedSize, true);
  view.setUint32(12, uncompressedSize, true);
  return descriptor;
}

function createCentralZipHeader({ nameBytes, crc, compressedSize, uncompressedSize, offset }) {
  const header = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 8, true);
  view.setUint16(10, 8, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, compressedSize, true);
  view.setUint32(24, uncompressedSize, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint32(42, offset, true);
  header.set(nameBytes, 46);
  return header;
}

function createZipEndRecord(fileCount, centralDirectorySize, centralDirectoryOffset) {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  return record;
}

function concatUint8Arrays(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function crc32(bytes) {
  const table = getCrc32Table();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

var crc32Table = null;

function getCrc32Table() {
  if (crc32Table) return crc32Table;
  crc32Table = Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    return crc >>> 0;
  });
  return crc32Table;
}

function columnName(index) {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name || "A";
}

function escapeXmlText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
