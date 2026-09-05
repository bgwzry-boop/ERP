import {
  buildXlsxWorkbookBase64,
  buildXlsxWorkbookFromWorksheets,
  cell,
} from "./xlsxWorkbook.js";
import {
  getV1RuntimeEmployeeRoleInputLabels,
  roleCatalog,
  v1RuntimeEmployeeRoleKeys,
} from "../../shared/auth/roleCatalog.js";
import {
  buildMasterDataImportTemplateMetadata,
  getMasterDataImportTemplateBuildDefinitions,
} from "./masterDataImportTemplateCatalog.js";

export function buildMasterDataImportTemplateWorkbook(input = {}) {
  const metadata = buildMasterDataImportTemplateMetadata(input);
  return buildXlsxWorkbookFromWorksheets({
    title: `${metadata.templateLabel}导入模板`,
    creator: input.generatedBy || "ERP",
    createdAt: metadata.generatedAt,
    worksheets: getWorkbookWorksheets({
      ...input,
      templateKey: metadata.templateId,
      generatedAt: metadata.generatedAt,
      generatedBy: metadata.generatedBy,
    }),
  });
}

export function buildMasterDataImportTemplateWorkbookBase64(input = {}) {
  const metadata = buildMasterDataImportTemplateMetadata(input);
  return buildXlsxWorkbookBase64({
    title: `${metadata.templateLabel}导入模板`,
    creator: input.generatedBy || "ERP",
    createdAt: metadata.generatedAt,
    worksheets: getWorkbookWorksheets({
      ...input,
      templateKey: metadata.templateId,
      generatedAt: metadata.generatedAt,
      generatedBy: metadata.generatedBy,
    }),
  });
}

function getWorkbookWorksheets(input = {}) {
  const metadata = buildMasterDataImportTemplateMetadata(input);
  const definitions = getMasterDataImportTemplateBuildDefinitions(metadata.templateId);
  return [
    buildReadmeWorksheet(metadata, definitions),
    ...definitions.map((definition) => buildDataWorksheet(definition, input)),
    ...definitions.map((definition) => buildExampleWorksheet(definition)),
  ];
}

function buildReadmeWorksheet(metadata, definitions) {
  const includesEmployees = definitions.some((definition) => definition.key === "employees_machines");
  return {
    name: "导入说明",
    columns: [150, 220, 260, 360],
    rows: [
      [cell(`${metadata.templateLabel}导入模板`, { styleId: "Title", mergeAcross: 3 })],
      [cell("模板版本", { styleId: "Label" }), cell(metadata.templateVersion), cell("生成时间", { styleId: "Label" }), cell(formatDateTime(metadata.generatedAt))],
      [cell("导入口径", { styleId: "Label" }), cell("导入前先做整表预检查；发现重复、缺字段、价格高风险或库存异常时生成待确认，不直接落正式数据。", { mergeAcross: 2 })],
      [cell("更新规则", { styleId: "Label" }), cell("用业务编号或名称去重；历史订单、价格快照和库存流水不被后续主数据改动覆盖。", { mergeAcross: 2 })],
      [cell("示例隔离", { styleId: "Label" }), cell("正式数据 Sheet 默认留空；“示例-*”Sheet 只供参考，不参与预检查或导入。复制示例后必须替换“示例-请替换”标记。", { mergeAcross: 2 })],
      [],
      [cell("Sheet", { styleId: "Header" }), cell("用途", { styleId: "Header" }), cell("必填字段", { styleId: "Header" }), cell("字段数", { styleId: "Header" })],
      ...definitions.map((definition) => [
        cell(definition.worksheetName),
        cell(definition.description),
        cell(definition.requiredFields.join("、")),
        cell(definition.columns.length, { styleId: "Number" }),
      ]),
      ...(includesEmployees ? buildEmployeeRoleGuideRows() : []),
    ],
  };
}

function buildDataWorksheet(definition, input = {}) {
  const noteRow = definition.columns.map((column) => {
    const required = definition.requiredFields.includes(column);
    const conditional = definition.conditionalRequiredFields?.includes(column);
    const deferred = definition.deferredFields?.includes(column);
    return cell(required ? "必填" : conditional ? "车间岗必填" : deferred ? "可后补" : "可选", { styleId: required || conditional || deferred ? "Input" : "Muted" });
  });
  const roleLabels = getV1RuntimeEmployeeRoleInputLabels();
  const suppliedRows = Array.isArray(input.dataRowsByKey?.[definition.key])
    ? input.dataRowsByKey[definition.key].slice(0, 1000)
    : null;
  const dataRows = suppliedRows === null
    ? input.includeFixtureRows === true ? [definition.sampleRow] : []
    : suppliedRows.map((row) => definition.columns.map((column) => row?.[column] ?? ""));
  return {
    name: definition.worksheetName,
    columns: definition.columns.map((column) => Math.max(90, Math.min(220, column.length * 16 + 70))),
    rows: [
      definition.columns.map((column) => cell(column, { styleId: "Header" })),
      noteRow,
      ...dataRows.map((row) => row.map((value) => cell(value))),
    ],
    dataValidations: definition.key === "employees_machines"
      ? [{
          sqref: "C3:C1000",
          type: "list",
          formula1: `"${roleLabels.join(",")}"`,
          allowBlank: false,
          promptTitle: "选择标准岗位",
          prompt: "请选择8类V1正式岗位之一。",
          errorTitle: "岗位不在允许范围",
          error: `请选择：${roleLabels.join("、")}`,
        }]
      : [],
  };
}

function buildExampleWorksheet(definition) {
  const exampleRow = [...definition.sampleRow];
  exampleRow[0] = "示例-请替换";
  return {
    name: `示例-${definition.worksheetName}`,
    columns: definition.columns.map((column) => Math.max(90, Math.min(220, column.length * 16 + 70))),
    rows: [
      [cell(`${definition.label}填写示例（不参与导入）`, { styleId: "Title", mergeAcross: Math.max(0, definition.columns.length - 1) })],
      [cell("使用说明", { styleId: "Label" }), cell("请在正式数据 Sheet 填写；如复制本行，必须替换“示例-请替换”及全部演示值。", { mergeAcross: Math.max(0, definition.columns.length - 2) })],
      definition.columns.map((column) => cell(column, { styleId: "Header" })),
      exampleRow.map((value) => cell(value, { styleId: "Muted" })),
    ],
  };
}

function buildEmployeeRoleGuideRows() {
  return [
    [],
    [cell("员工正式账号岗位指引", { styleId: "Section", mergeAcross: 3 })],
    [
      cell("标准岗位", { styleId: "Header" }),
      cell("填写要求", { styleId: "Header" }),
      cell("默认车间 / 机台", { styleId: "Header" }),
      cell("上线口径", { styleId: "Header" }),
    ],
    [
      cell("编号规则", { styleId: "Label" }),
      cell("员工编号为1-32位字母、数字、下划线或短横线，首位必须是字母或数字；按大小写不敏感唯一。", { mergeAcross: 2 }),
    ],
    ...v1RuntimeEmployeeRoleKeys.map((roleKey) => [
      cell(roleCatalog[roleKey].displayName),
      cell("员工编号、员工姓名、主角色必填；兼任岗位填入附加角色，用顿号分隔。"),
      cell(roleKey === "workshop" ? "可导入后在员工机台页手动分配；固定机台需车间+机台。" : roleKey === "packing" ? "杂工可只绑定负责车间，不绑定机台。" : "无需填写，不要使用虚假车间占位。"),
      cell("至少1个已复核、已首次改密、未锁定且未过期的正式账号。"),
    ]),
    [
      cell("注意", { styleId: "Label" }),
      cell("8类岗位必须全部覆盖；同一正式账号可保留一个主角色和多个附加角色；模板样例不计入正式上线就绪。", { mergeAcross: 2 }),
    ],
  ];
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value ?? "").trim();
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
