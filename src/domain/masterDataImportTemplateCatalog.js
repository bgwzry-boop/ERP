import {
  XLSX_CONTENT_TYPE,
  XLSX_FILE_EXTENSION,
} from "./xlsxWorkbookContract.js";

export const MASTER_DATA_IMPORT_TEMPLATE_VERSION = "p0-master-data-import-template-v2";
export const MASTER_DATA_IMPORT_WORKBOOK_FORMAT = "XLSX Office Open XML";
export const MASTER_DATA_IMPORT_CONTENT_TYPE = XLSX_CONTENT_TYPE;
export const MASTER_DATA_IMPORT_FILE_EXTENSION = XLSX_FILE_EXTENSION;

const templateDefinitions = [
  {
    key: "customers",
    label: "客户档案",
    description: "客户主体、联系人、地址、客户群、结算和风险状态。",
    worksheetName: "客户档案",
    requiredFields: ["客户名称", "联系人姓名", "手机号"],
    columns: [
      "客户编号",
      "客户名称",
      "风险状态",
      "结算周期",
      "默认交付方式",
      "默认价格表",
      "联系人姓名",
      "联系人角色",
      "手机号",
      "电话",
      "地址区域",
      "详细地址",
      "下单群名称",
      "客户备注",
      "办公室备注",
      "财务备注",
      "打包/交付偏好",
      "启用状态",
    ],
    sampleRow: [
      "C-IMPORT-001",
      "张三服饰",
      "正常",
      "月结",
      "自提",
      "袋子价格表1",
      "张老板",
      "老板",
      "13900000001",
      "",
      "虎门",
      "虎门大道 36 号",
      "张三服饰下单群",
      "客户常用 30*38 红色",
      "下单多用微信文字",
      "月结客户，月底对账",
      "自提前先电话确认",
      "启用",
    ],
  },
  {
    key: "price_tables",
    label: "价格表",
    description: "袋子价格、印刷价格和客户专属价格版本。",
    worksheetName: "价格表",
    requiredFields: ["价格表名称", "价格类型", "尺寸", "单价", "生效日期"],
    columns: [
      "价格表编号",
      "价格表名称",
      "价格类型",
      "客户编号",
      "生效日期",
      "尺寸",
      "成品款式",
      "颜色",
      "提手类型",
      "印刷面",
      "阶梯起量",
      "单价",
      "加长提加价",
      "审核状态",
      "备注",
    ],
    sampleRow: [
      "PT-IMPORT-001",
      "袋子价格表1",
      "袋子",
      "",
      "2026-07-03",
      "30*37*10",
      "空白袋",
      "红色",
      "普通提",
      "",
      1,
      0.34,
      0.03,
      "待审核",
      "2026-07-03 图片价格表，价格导入必须整表预检查后确认",
    ],
  },
  {
    key: "product_specs",
    label: "尺寸颜色款式",
    description: "标准尺寸、客户叫法、颜色别名、提手和成品款式。",
    worksheetName: "尺寸颜色款式",
    requiredFields: ["标准尺寸", "标准颜色", "提手类型", "成品款式"],
    columns: [
      "规格编号",
      "客户叫法",
      "标准尺寸",
      "实际生产尺寸",
      "袋体宽幅cm",
      "布长cm",
      "标准颜色",
      "颜色别名",
      "提手类型",
      "成品款式",
      "启用状态",
      "备注",
    ],
    sampleRow: [
      "SPEC-IMPORT-001",
      "30*38",
      "30*37*10",
      "30*37*10",
      90,
      42,
      "红色",
      "大红/红袋",
      "普通提",
      "空白袋",
      "启用",
      "30*38 是客户叫法，实际生产按 30*37*10",
    ],
  },
  {
    key: "inventory_items",
    label: "初始库存",
    description: "按精确库存键导入成品库存、状态、库区和可信度。",
    worksheetName: "初始库存",
    requiredFields: ["尺寸", "颜色", "提手类型", "成品款式", "库区", "库存状态", "在库数量"],
    columns: [
      "库存编号",
      "尺寸",
      "颜色",
      "提手类型",
      "成品款式",
      "库区",
      "库存状态",
      "在库数量",
      "已占用",
      "待提货锁定",
      "待处理",
      "来源备注",
      "可信度",
      "盘点日期",
    ],
    sampleRow: [
      "INV-IMPORT-001",
      "30*37*10",
      "红色",
      "普通提",
      "空白袋",
      "成品仓A",
      "可用",
      2480,
      120,
      0,
      0,
      "2026-07 初始盘点",
      "仓库已清点",
      "2026-07-01",
    ],
  },
  {
    key: "employees_machines",
    label: "员工机台",
    description: "员工编号是稳定身份；主岗位必填，兼任岗位填在附加角色；可批量维护出生/入职日期、工资基础和外部考勤编号，绝不按姓名关联打卡。",
    worksheetName: "员工机台",
    requiredFields: ["员工编号", "员工姓名", "角色"],
    conditionalRequiredFields: [],
    deferredFields: ["默认车间", "默认机台"],
    columns: [
      "员工编号",
      "员工姓名",
      "出生日期",
      "入职日期",
      "角色",
      "附加角色",
      "默认车间",
      "默认机台",
      "基础时薪",
      "岗位补贴/小时",
      "生效日期",
      "考勤来源",
      "考勤人员编号",
      "机台编号",
      "机台名称",
      "机台车间",
      "产能尺寸",
      "粗略日产量",
      "启用状态",
      "备注",
    ],
    sampleRow: [
      "EMP-IMPORT-001",
      "王师傅",
      "1990-03-01",
      "2020-02-01",
      "制袋工",
      "",
      "1号车间",
      "1号机",
      10,
      5,
      "2026-07-01",
      "deli",
      "DL-1001",
      "M-01",
      "1号制袋机",
      "1号车间",
      "30*37*10",
      12000,
      "启用",
      "产能为初始粗略值，后续用报工校准",
    ],
  },
];

const templateSets = {
  all: {
    label: "全量基础资料",
    filePrefix: "erp-master-data-import-template",
    keys: templateDefinitions.map((item) => item.key),
  },
  customers: {
    label: "客户档案",
    filePrefix: "erp-customer-import-template",
    keys: ["customers"],
  },
  prices: {
    label: "价格表",
    filePrefix: "erp-price-import-template",
    keys: ["price_tables", "product_specs"],
  },
  inventory: {
    label: "初始库存",
    filePrefix: "erp-inventory-import-template",
    keys: ["inventory_items", "product_specs"],
  },
  workshop: {
    label: "员工机台",
    filePrefix: "erp-workshop-master-import-template",
    keys: ["employees_machines"],
  },
};

export function getMasterDataImportTemplateDefinitions() {
  return templateDefinitions.map((definition) => ({
    key: definition.key,
    label: definition.label,
    description: definition.description,
    worksheetName: definition.worksheetName,
    requiredFields: [...definition.requiredFields],
    conditionalRequiredFields: [...(definition.conditionalRequiredFields ?? [])],
    deferredFields: [...(definition.deferredFields ?? [])],
    columnCount: definition.columns.length,
  }));
}

export function getMasterDataImportWorksheetSpecs() {
  return templateDefinitions.map((definition) => ({
    key: definition.key,
    label: definition.label,
    description: definition.description,
    worksheetName: definition.worksheetName,
    requiredFields: [...definition.requiredFields],
    conditionalRequiredFields: [...(definition.conditionalRequiredFields ?? [])],
    deferredFields: [...(definition.deferredFields ?? [])],
    columns: [...definition.columns],
  }));
}

export function getMasterDataImportTemplateSets() {
  return Object.entries(templateSets).map(([key, value]) => ({
    key,
    label: value.label,
    filePrefix: value.filePrefix,
    sheetCount: value.keys.length,
  }));
}

export function buildMasterDataImportTemplateMetadata(input = {}) {
  const templateKey = normalizeTemplateKey(input.templateKey);
  const definitions = getMasterDataImportTemplateBuildDefinitions(templateKey);
  return {
    templateId: templateKey,
    templateVersion: MASTER_DATA_IMPORT_TEMPLATE_VERSION,
    workbookFormat: MASTER_DATA_IMPORT_WORKBOOK_FORMAT,
    workbookExtension: MASTER_DATA_IMPORT_FILE_EXTENSION,
    contentType: MASTER_DATA_IMPORT_CONTENT_TYPE,
    contentEncoding: "base64",
    templateLabel: templateSets[templateKey].label,
    worksheetNames: definitions.map((definition) => definition.worksheetName),
    sheetCount: definitions.length,
    generatedAt: cleanText(input.generatedAt) || new Date().toISOString(),
    generatedBy: cleanText(input.generatedBy),
    fileName: getMasterDataImportTemplateFileName(templateKey, input.generatedAt),
    requiredFieldGroups: definitions.map((definition) => ({
      sheet: definition.worksheetName,
      fields: [...definition.requiredFields],
      conditionalFields: [...(definition.conditionalRequiredFields ?? [])],
      deferredFields: [...(definition.deferredFields ?? [])],
    })),
  };
}

export function getMasterDataImportTemplateSummary(templateKey = "all") {
  const key = normalizeTemplateKey(templateKey);
  const definitions = getMasterDataImportTemplateBuildDefinitions(key);
  return `${templateSets[key].label} / ${definitions.length} 个导入 sheet / ${definitions.reduce((sum, item) => sum + item.columns.length, 0)} 个字段`;
}

export function getMasterDataImportTemplateFileName(templateKey = "all", generatedAt = "") {
  const key = normalizeTemplateKey(templateKey);
  const date = normalizeDateSegment(generatedAt || new Date().toISOString());
  return `${templateSets[key].filePrefix}-${date}${MASTER_DATA_IMPORT_FILE_EXTENSION}`;
}

export function getMasterDataImportTemplateBuildDefinitions(templateKey = "all") {
  const normalizedTemplateKey = normalizeTemplateKey(templateKey);
  const set = templateSets[normalizedTemplateKey];
  return set.keys
    .map((key) => templateDefinitions.find((definition) => definition.key === key))
    .filter(Boolean)
    .map((definition) => ({
      ...definition,
      columns: [...definition.columns],
      conditionalRequiredFields: [...(definition.conditionalRequiredFields ?? [])],
      deferredFields: [...(definition.deferredFields ?? [])],
      requiredFields: [...definition.requiredFields],
      sampleRow: [...definition.sampleRow],
    }));
}

function normalizeTemplateKey(value) {
  const key = cleanText(value);
  return Object.hasOwn(templateSets, key) ? key : "all";
}

function normalizeDateSegment(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return cleanText(value).slice(0, 10).replace(/[^0-9-]/g, "") || "today";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
