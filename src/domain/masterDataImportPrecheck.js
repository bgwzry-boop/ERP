import {
  MASTER_DATA_IMPORT_TEMPLATE_VERSION,
  getMasterDataImportWorksheetSpecs,
} from "./masterDataImportTemplate.js";
import {
  getV1RuntimeEmployeeRoleInputLabels,
  normalizeV1RuntimeEmployeeRoleKey,
  normalizeV1RuntimeEmployeeRoleKeys,
  roleCatalog,
  splitV1RuntimeEmployeeRoleInputs,
  v1RuntimeEmployeeRoleKeys,
} from "../../shared/auth/roleCatalog.js";
import { isValidEmployeeNumber } from "../../shared/auth/employeeIdentity.js";

export const MASTER_DATA_IMPORT_PRECHECK_VERSION = "p0-master-data-import-precheck-v1";

const severityOrder = {
  error: 3,
  warning: 2,
  info: 1,
};

const importedDateFieldNames = new Set(["生效日期", "盘点日期"]);
const excelDateMsPerDay = 24 * 60 * 60 * 1000;
const excelDateBaseUtcMs = Date.UTC(1899, 11, 30);

export async function precheckMasterDataImportWorkbook(input = {}) {
  const bytes = normalizeBytes(input.bytes ?? input.workbook);
  const workbook = await readMasterDataWorkbook(bytes);
  return precheckParsedMasterDataWorkbook(workbook, {
    fileName: input.fileName,
    checkedAt: input.checkedAt,
  });
}

export async function readMasterDataWorkbook(bytes) {
  const entries = await readZipEntries(bytes);
  const workbookXml = readZipTextEntry(entries, "xl/workbook.xml");
  const relsXml = readZipTextEntry(entries, "xl/_rels/workbook.xml.rels");
  const sharedStrings = parseSharedStrings(readOptionalZipTextEntry(entries, "xl/sharedStrings.xml"));
  const sheets = parseWorkbookSheets(workbookXml, relsXml).map((sheet) => {
    const xml = readZipTextEntry(entries, sheet.path);
    return {
      ...sheet,
      rows: parseWorksheetRows(xml, sharedStrings),
    };
  });
  return {
    workbookXml,
    sheets,
  };
}

export function precheckParsedMasterDataWorkbook(workbook, input = {}) {
  const specs = getMasterDataImportWorksheetSpecs();
  const sheetsByName = new Map((workbook.sheets ?? []).map((sheet) => [sheet.name, sheet]));
  const issues = [];
  const activeSpecs = getActiveWorksheetSpecs(specs, sheetsByName);
  const sheetResults = activeSpecs.map((spec) => checkSheet(spec, sheetsByName.get(spec.worksheetName), issues));
  checkCrossSheetProductSpecs(sheetResults, issues);
  const sortedIssues = sortIssues(issues);
  const errorCount = sortedIssues.filter((issue) => issue.severity === "error").length;
  const warningCount = sortedIssues.filter((issue) => issue.severity === "warning").length;
  const dataRowCount = sheetResults.reduce((sum, sheet) => sum + sheet.dataRowCount, 0);
  const summaryStatus = errorCount ? "blocked" : warningCount ? "review" : "passed";
  const employeeRoleCoverage = buildEmployeeRoleCoverage(sheetResults);
  return {
    version: MASTER_DATA_IMPORT_PRECHECK_VERSION,
    templateVersion: MASTER_DATA_IMPORT_TEMPLATE_VERSION,
    fileName: cleanText(input.fileName),
    checkedAt: cleanText(input.checkedAt) || new Date().toISOString(),
    summary: {
      status: summaryStatus,
      statusLabel: getSummaryStatusLabel(summaryStatus),
      dataRowCount,
      sheetCount: sheetResults.length,
      checkedSheetCount: sheetResults.filter((sheet) => sheet.present).length,
      errorCount,
      warningCount,
      issueCount: sortedIssues.length,
      importAllowed: errorCount === 0,
      recommendedAction: getRecommendedAction(summaryStatus),
    },
    sheets: sheetResults.map(({ rows, ...sheet }) => sheet),
    stagedRows: buildStagedRows(sheetResults),
    employeeRoleCoverage,
    issues: sortedIssues,
  };
}

function getActiveWorksheetSpecs(specs, sheetsByName) {
  const presentKeys = new Set(
    specs.filter((spec) => sheetsByName.has(spec.worksheetName)).map((spec) => spec.key),
  );
  if (presentKeys.has("price_tables") || presentKeys.has("inventory_items")) {
    presentKeys.add("product_specs");
  }
  if (presentKeys.size === 0) return specs;
  return specs.filter((spec) => presentKeys.has(spec.key));
}

function buildEmployeeRoleCoverage(sheetResults) {
  const employeeSheet = sheetResults.find((sheet) => sheet.key === "employees_machines");
  const rowCounts = new Map(v1RuntimeEmployeeRoleKeys.map((roleKey) => [roleKey, 0]));
  for (const row of employeeSheet?.rows ?? []) {
    const roleKeys = normalizeV1RuntimeEmployeeRoleKeys([
      row.values?.["角色"],
      row.values?.["附加角色"],
    ]);
    for (const roleKey of roleKeys) rowCounts.set(roleKey, (rowCounts.get(roleKey) ?? 0) + 1);
  }
  const roles = v1RuntimeEmployeeRoleKeys.map((roleKey) => ({
    roleKey,
    roleLabel: roleCatalog[roleKey].displayName,
    covered: (rowCounts.get(roleKey) ?? 0) > 0,
    rowCount: rowCounts.get(roleKey) ?? 0,
  }));
  const coveredRoleCount = roles.filter((role) => role.covered).length;
  return {
    available: employeeSheet?.present === true,
    complete: coveredRoleCount === roles.length,
    employeeRowCount: employeeSheet?.rows?.length ?? 0,
    requiredRoleCount: roles.length,
    coveredRoleCount,
    missingRoleCount: roles.length - coveredRoleCount,
    coverageLabel: `${coveredRoleCount}/${roles.length}`,
    missingRoleLabels: roles.filter((role) => !role.covered).map((role) => role.roleLabel),
    roles,
  };
}

function buildStagedRows(sheetResults) {
  return sheetResults
    .map((sheet) => ({
      sheetKey: sheet.key,
      worksheetName: sheet.worksheetName,
      rows: (sheet.rows ?? []).map((row) => ({
        rowNumber: row.rowNumber,
        values: row.values,
      })),
    }))
    .filter((sheet) => sheet.rows.length > 0);
}

function checkSheet(spec, sheet, issues) {
  if (!sheet) {
    const issue = createIssue("error", spec.worksheetName, "", "", `缺少 ${spec.worksheetName} sheet，不能导入该类基础资料。`);
    issues.push(issue);
    return {
      key: spec.key,
      label: spec.label,
      worksheetName: spec.worksheetName,
      present: false,
      status: "error",
      dataRowCount: 0,
      expectedColumnCount: spec.columns.length,
      foundColumnCount: 0,
      missingColumns: [...spec.columns],
      missingRequiredFields: [...spec.requiredFields],
      rows: [],
      issues: [issue],
    };
  }

  const header = normalizeHeader(sheet.rows[0]?.cells ?? []);
  const columnIndexes = buildColumnIndexes(header);
  const missingColumns = spec.columns.filter((column) => !columnIndexes.has(column));
  const missingRequiredFields = spec.requiredFields.filter((column) => !columnIndexes.has(column));
  const rows = getDataRows(sheet.rows, columnIndexes, spec.columns, spec.worksheetName);
  const sheetIssues = [];

  if (rows.length === 0) {
    const issue = createIssue("error", spec.worksheetName, "", "", `${spec.worksheetName} 没有可导入数据，请至少填写 1 行后再上传。`);
    sheetIssues.push(issue);
    issues.push(issue);
  }

  for (const field of missingColumns) {
    const severity = spec.requiredFields.includes(field) ? "error" : "warning";
    const issue = createIssue(severity, spec.worksheetName, "", field, `缺少${severity === "error" ? "必填" : "建议"}字段：${field}。`);
    sheetIssues.push(issue);
    issues.push(issue);
  }

  for (const row of rows) {
    for (const field of spec.requiredFields) {
      if (!cleanText(row.values[field])) {
        const issue = createIssue("error", spec.worksheetName, row.rowNumber, field, `${field} 不能为空。`);
        sheetIssues.push(issue);
        issues.push(issue);
      }
    }
    checkBusinessRules(spec, row, sheetIssues, issues);
  }

  checkDuplicates(spec, rows, sheetIssues, issues);

  const errorCount = sheetIssues.filter((issue) => issue.severity === "error").length;
  const warningCount = sheetIssues.filter((issue) => issue.severity === "warning").length;
  return {
    key: spec.key,
    label: spec.label,
    worksheetName: spec.worksheetName,
    present: true,
    status: errorCount ? "error" : warningCount ? "warning" : "ok",
    dataRowCount: rows.length,
    expectedColumnCount: spec.columns.length,
    foundColumnCount: header.filter(Boolean).length,
    missingColumns,
    missingRequiredFields,
    rows,
    issues: sheetIssues,
  };
}

function checkBusinessRules(spec, row, sheetIssues, allIssues) {
  if (Object.values(row.values).some((value) => cleanText(value).includes("示例-请替换"))) {
    addIssue("error", row, "", "检测到未替换的模板示例标记；请填写真实资料，不要导入示例数据。", sheetIssues, allIssues);
  }
  if (spec.key === "customers") {
    checkAllowedValue(row, "风险状态", ["正常", "关注", "暂停接单", "黑名单"], "warning", sheetIssues, allIssues);
    checkAllowedValue(row, "启用状态", ["启用", "停用"], "warning", sheetIssues, allIssues);
  }
  if (spec.key === "price_tables") {
    checkPositiveNumber(row, "单价", true, sheetIssues, allIssues);
    checkPositiveNumber(row, "阶梯起量", false, sheetIssues, allIssues);
    checkNonNegativeNumber(row, "加长提加价", false, sheetIssues, allIssues);
    const price = parseNumber(row.values["单价"]);
    if (Number.isFinite(price) && price >= 5) {
      addIssue("warning", row, "单价", "单价明显偏高，导入前需要人工确认价格表。", sheetIssues, allIssues);
    }
    const reviewStatus = cleanText(row.values["审核状态"]);
    if (reviewStatus && reviewStatus !== "待审核") {
      addIssue("warning", row, "审核状态", "价格导入应先进入待审核，不建议直接生效。", sheetIssues, allIssues);
    }
  }
  if (spec.key === "product_specs") {
    checkPositiveNumber(row, "袋体宽幅cm", false, sheetIssues, allIssues);
    checkPositiveNumber(row, "布长cm", false, sheetIssues, allIssues);
    checkAllowedValue(row, "启用状态", ["启用", "停用"], "warning", sheetIssues, allIssues);
  }
  if (spec.key === "inventory_items") {
    checkNonNegativeNumber(row, "在库数量", true, sheetIssues, allIssues);
    checkNonNegativeNumber(row, "已占用", false, sheetIssues, allIssues);
    checkNonNegativeNumber(row, "待提货锁定", false, sheetIssues, allIssues);
    checkNonNegativeNumber(row, "待处理", false, sheetIssues, allIssues);
    checkAllowedValue(row, "库存状态", ["可用", "已占用", "缺货", "待处理", "报废"], "warning", sheetIssues, allIssues);
    const onHand = parseNumber(row.values["在库数量"]) ?? 0;
    const reserved = parseNumber(row.values["已占用"]) ?? 0;
    const locked = parseNumber(row.values["待提货锁定"]) ?? 0;
    const pending = parseNumber(row.values["待处理"]) ?? 0;
    if (reserved + locked + pending > onHand) {
      addIssue("error", row, "在库数量", "已占用 + 待提货锁定 + 待处理 不能大于在库数量。", sheetIssues, allIssues);
    }
  }
  if (spec.key === "employees_machines") {
    checkNonNegativeNumber(row, "基础时薪", false, sheetIssues, allIssues);
    checkNonNegativeNumber(row, "岗位补贴/小时", false, sheetIssues, allIssues);
    checkPositiveNumber(row, "粗略日产量", false, sheetIssues, allIssues);
    checkAllowedValue(row, "启用状态", ["启用", "停用"], "warning", sheetIssues, allIssues);
    const roleName = cleanText(row.values["角色"]);
    const employeeNumber = cleanText(row.values["员工编号"]);
    if (employeeNumber && !isValidEmployeeNumber(employeeNumber)) {
      addIssue("error", row, "员工编号", "员工编号须为1-32位字母、数字、下划线或短横线，且首位必须是字母或数字。", sheetIssues, allIssues);
    }
    const roleKey = normalizeV1RuntimeEmployeeRoleKey("", roleName);
    if (roleName && !roleKey) {
      addIssue(
        "error",
        row,
        "角色",
        `角色无法映射到V1正式岗位，建议使用：${getV1RuntimeEmployeeRoleInputLabels().join("、")}。`,
        sheetIssues,
        allIssues,
      );
    }
    const additionalRoleInputs = splitV1RuntimeEmployeeRoleInputs(row.values["附加角色"]);
    const invalidAdditionalRoles = additionalRoleInputs.filter(
      (value) => !normalizeV1RuntimeEmployeeRoleKey(value, value),
    );
    if (invalidAdditionalRoles.length) {
      addIssue(
        "error",
        row,
        "附加角色",
        `附加角色无法映射到V1正式岗位：${invalidAdditionalRoles.join("、")}。`,
        sheetIssues,
        allIssues,
      );
    }
  }
}

function checkCrossSheetProductSpecs(sheetResults, allIssues) {
  const specSheet = sheetResults.find((sheet) => sheet.key === "product_specs");
  if (!specSheet?.rows?.length) return;
  const productKeys = new Set(
    specSheet.rows
      .map((row) => buildProductSpecKey(row.values, ["标准尺寸", "标准颜色", "提手类型", "成品款式"]))
      .filter(Boolean),
  );
  for (const sheet of sheetResults.filter((item) => item.key === "price_tables" || item.key === "inventory_items")) {
    for (const row of sheet.rows ?? []) {
      const key = buildProductSpecKey(row.values, sheet.key === "price_tables"
        ? ["尺寸", "颜色", "提手类型", "成品款式"]
        : ["尺寸", "颜色", "提手类型", "成品款式"]);
      if (key && !productKeys.has(key)) {
        const issue = createIssue(
          "error",
          sheet.worksheetName,
          row.rowNumber,
          sheet.key === "price_tables" ? "尺寸" : "尺寸",
          "该尺寸 / 颜色 / 提手 / 款式未在尺寸颜色款式 sheet 定义，不能安全匹配价格或库存键。",
        );
        allIssues.push(issue);
        sheet.issues.push(issue);
        sheet.status = "error";
      }
    }
  }
}

function checkDuplicates(spec, rows, sheetIssues, allIssues) {
  const keyGroups = getDuplicateKeyGroups(spec.key);
  for (const group of keyGroups) {
    const seen = new Map();
    for (const row of rows) {
      const rawKey = group.fields.map((field) => cleanText(row.values[field])).join("|");
      const key = group.caseInsensitive ? rawKey.toLowerCase() : rawKey;
      if (!key.replace(/\|/g, "")) continue;
      if (seen.has(key)) {
        addIssue("error", row, group.fields[0], `${group.label} 重复：${key.replace(/\|/g, " / ")}。`, sheetIssues, allIssues);
      } else {
        seen.set(key, row);
      }
    }
  }
}

function getDuplicateKeyGroups(specKey) {
  const map = {
    customers: [
      { label: "客户名称", fields: ["客户名称"] },
      { label: "客户编号", fields: ["客户编号"] },
    ],
    price_tables: [
      { label: "价格项", fields: ["价格表名称", "价格类型", "客户编号", "生效日期", "尺寸", "成品款式", "颜色", "提手类型", "印刷面", "阶梯起量"] },
    ],
    product_specs: [
      { label: "规格键", fields: ["标准尺寸", "标准颜色", "提手类型", "成品款式"] },
    ],
    inventory_items: [
      { label: "库存键", fields: ["尺寸", "颜色", "提手类型", "成品款式", "库区"] },
    ],
    employees_machines: [
      { label: "员工编号", fields: ["员工编号"], caseInsensitive: true },
    ],
  };
  return map[specKey] ?? [];
}

function checkAllowedValue(row, field, allowedValues, severity, sheetIssues, allIssues) {
  const value = cleanText(row.values[field]);
  if (!value || allowedValues.includes(value)) return;
  addIssue(severity, row, field, `${field} 建议使用：${allowedValues.join("、")}。`, sheetIssues, allIssues);
}

function checkPositiveNumber(row, field, required, sheetIssues, allIssues) {
  const value = cleanText(row.values[field]);
  if (!value && !required) return;
  const number = parseNumber(value);
  if (!Number.isFinite(number) || number <= 0) {
    addIssue(required ? "error" : "warning", row, field, `${field} 应为大于 0 的数字。`, sheetIssues, allIssues);
  }
}

function checkNonNegativeNumber(row, field, required, sheetIssues, allIssues) {
  const value = cleanText(row.values[field]);
  if (!value && !required) return;
  const number = parseNumber(value);
  if (!Number.isFinite(number) || number < 0) {
    addIssue(required ? "error" : "warning", row, field, `${field} 应为不小于 0 的数字。`, sheetIssues, allIssues);
  }
}

function getDataRows(rows, columnIndexes, columns, worksheetName) {
  return rows
    .slice(1)
    .filter((row) => !isNoteRow(row.cells) && !isBlankRow(row.cells))
    .map((row) => {
      const values = {};
      for (const column of columns) {
        const index = columnIndexes.get(column);
        values[column] = index == null ? "" : normalizeImportedCellValue(column, row.cells[index]);
      }
      return {
        rowNumber: row.rowNumber,
        worksheetName,
        values,
      };
    });
}

function normalizeHeader(row) {
  return row.map(cleanText);
}

function buildColumnIndexes(header) {
  const map = new Map();
  header.forEach((column, index) => {
    if (column && !map.has(column)) map.set(column, index);
  });
  return map;
}

function isNoteRow(cells) {
  const values = cells.map(cleanText).filter(Boolean);
  return values.length > 0 && values.every((value) => value === "必填" || value === "可选" || value === "可后补" || value === "车间岗必填");
}

function isBlankRow(cells) {
  return cells.every((value) => !cleanText(value));
}

async function readZipEntries(bytes) {
  const buffer = normalizeBytes(bytes);
  const centralDirectoryEntries = await readZipEntriesFromCentralDirectory(buffer);
  if (centralDirectoryEntries.size > 0) return centralDirectoryEntries;
  return readZipEntriesFromLocalHeaders(buffer);
}

async function readZipEntriesFromLocalHeaders(buffer) {
  const entries = new Map();
  let offset = 0;
  while (offset + 4 <= buffer.length) {
    const signature = readUint32(buffer, offset);
    if (signature !== 0x04034b50) break;
    const compressionMethod = readUint16(buffer, offset + 8);
    const compressedSize = readUint32(buffer, offset + 18);
    const fileNameLength = readUint16(buffer, offset + 26);
    const extraLength = readUint16(buffer, offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    const contentStart = nameEnd + extraLength;
    const contentEnd = contentStart + compressedSize;
    const name = decodeUtf8(buffer.slice(nameStart, nameEnd));
    if ((!compressedSize && !name.endsWith("/")) || contentEnd > buffer.length) {
      throw new Error("当前预检查只能读取标准 xlsx ZIP 条目，请使用系统生成模板重新整理后上传。");
    }
    if (name.endsWith("/")) {
      offset = contentEnd;
      continue;
    }
    const compressed = buffer.slice(contentStart, contentEnd);
    const content = compressionMethod === 0 ? compressed : await inflateZipEntry(compressed, compressionMethod, name);
    entries.set(name, content);
    offset = contentEnd;
  }
  return entries;
}

async function readZipEntriesFromCentralDirectory(buffer) {
  const eocdOffset = findEndOfCentralDirectoryOffset(buffer);
  if (eocdOffset < 0) return new Map();
  const centralDirectoryOffset = readUint32(buffer, eocdOffset + 16);
  const centralDirectorySize = readUint32(buffer, eocdOffset + 12);
  const entryCount = readUint16(buffer, eocdOffset + 10);
  if (!centralDirectoryOffset || centralDirectoryOffset + centralDirectorySize > buffer.length) return new Map();
  const entries = new Map();
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount && offset + 46 <= buffer.length; index += 1) {
    const signature = readUint32(buffer, offset);
    if (signature !== 0x02014b50) break;
    const compressionMethod = readUint16(buffer, offset + 10);
    const compressedSize = readUint32(buffer, offset + 20);
    const fileNameLength = readUint16(buffer, offset + 28);
    const extraLength = readUint16(buffer, offset + 30);
    const commentLength = readUint16(buffer, offset + 32);
    const localHeaderOffset = readUint32(buffer, offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    const name = decodeUtf8(buffer.slice(nameStart, nameEnd));
    offset = nameEnd + extraLength + commentLength;
    if (!name || name.endsWith("/")) continue;
    if (localHeaderOffset + 30 > buffer.length || readUint32(buffer, localHeaderOffset) !== 0x04034b50) {
      throw new Error("当前预检查无法定位 xlsx ZIP 条目，请重新另存后上传。");
    }
    const localFileNameLength = readUint16(buffer, localHeaderOffset + 26);
    const localExtraLength = readUint16(buffer, localHeaderOffset + 28);
    const contentStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const contentEnd = contentStart + compressedSize;
    if (contentEnd > buffer.length) {
      throw new Error("当前预检查无法完整读取 xlsx ZIP 条目，请重新另存后上传。");
    }
    const compressed = buffer.slice(contentStart, contentEnd);
    const content = compressionMethod === 0 ? compressed : await inflateZipEntry(compressed, compressionMethod, name);
    entries.set(name, content);
  }
  return entries;
}

function findEndOfCentralDirectoryOffset(buffer) {
  const maxCommentLength = 0xffff;
  const minOffset = Math.max(0, buffer.length - maxCommentLength - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (readUint32(buffer, offset) === 0x06054b50) return offset;
  }
  return -1;
}

async function inflateZipEntry(bytes, compressionMethod, name) {
  if (compressionMethod !== 8) {
    throw new Error(`当前预检查不支持该 xlsx 压缩方式：${name}。`);
  }
  if (typeof DecompressionStream === "undefined") {
    throw new Error("当前浏览器不支持读取压缩 xlsx，请上传系统直接生成的模板文件。");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const response = new Response(stream);
  return new Uint8Array(await response.arrayBuffer());
}

function readZipTextEntry(entries, name) {
  const entry = entries.get(name);
  if (!entry) throw new Error(`xlsx 缺少必要文件：${name}`);
  return decodeUtf8(entry);
}

function readOptionalZipTextEntry(entries, name) {
  const entry = entries.get(name);
  return entry ? decodeUtf8(entry) : "";
}

function parseWorkbookSheets(workbookXml, relsXml) {
  const rels = new Map();
  for (const match of relsXml.matchAll(/<(?:[\w.-]+:)?Relationship\b[^>]*\/?>/g)) {
    const attrs = parseAttributes(match[0]);
    if (attrs.Id && attrs.Target) rels.set(attrs.Id, normalizeWorkbookTarget(attrs.Target));
  }
  return Array.from(workbookXml.matchAll(/<(?:[\w.-]+:)?sheet\b[^>]*\/?>/g)).map((match) => {
    const attrs = parseAttributes(match[0]);
    const relId = attrs["r:id"];
    return {
      name: decodeXml(attrs.name),
      relId,
      path: rels.get(relId) ?? "",
    };
  }).filter((sheet) => sheet.name && sheet.path);
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  return Array.from(xml.matchAll(/<(?:[\w.-]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?si>/g)).map((match) =>
    Array.from(match[1].matchAll(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>/g))
      .map((textMatch) => decodeXml(textMatch[1]))
      .join(""),
  );
}

function parseWorksheetRows(xml, sharedStrings) {
  return Array.from(xml.matchAll(/<(?:[\w.-]+:)?row\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?row>/g)).map((rowMatch, rowIndex) => {
    const rowAttrs = parseAttributes(rowMatch[1]);
    const cells = [];
    let nextColumnIndex = 0;
    for (const cellMatch of rowMatch[2].matchAll(/<(?:[\w.-]+:)?c\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/(?:[\w.-]+:)?c>)/g)) {
      const attrs = parseAttributes(cellMatch[1]);
      const index = attrs.r ? getColumnIndex(attrs.r) : nextColumnIndex;
      cells[index] = parseCellValue(attrs, cellMatch[2] ?? "", sharedStrings);
      nextColumnIndex = index + 1;
    }
    return {
      rowNumber: Number(rowAttrs.r) || rowIndex + 1,
      cells: cells.map((value) => cleanText(value)),
    };
  });
}

function parseCellValue(attrs, cellXml, sharedStrings) {
  if (attrs.t === "inlineStr") {
    return Array.from(cellXml.matchAll(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>/g))
      .map((match) => decodeXml(match[1]))
      .join("");
  }
  const raw = readXmlElementText(cellXml, "v");
  if (!raw) return "";
  if (attrs.t === "s") return sharedStrings[Number(raw)] ?? "";
  if (attrs.t === "e") return "";
  return raw;
}

function parseAttributes(text) {
  const attrs = {};
  for (const match of text.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[match[1]] = decodeXml(match[2] ?? match[3] ?? "");
  }
  return attrs;
}

function normalizeWorkbookTarget(target) {
  const cleanTarget = String(target || "").replace(/^\/+/, "");
  const rawPath = cleanTarget.startsWith("xl/") ? cleanTarget : `xl/${cleanTarget}`;
  const parts = [];
  for (const part of rawPath.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

function getColumnIndex(ref = "") {
  const letters = String(ref).match(/[A-Z]+/i)?.[0] ?? "A";
  return letters.toUpperCase().split("").reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function addIssue(severity, row, field, message, sheetIssues, allIssues) {
  const issue = createIssue(severity, row.worksheetName, row.rowNumber, field, message);
  sheetIssues.push(issue);
  allIssues.push(issue);
}

function createIssue(severity, sheet, row, field, message) {
  return {
    severity,
    severityLabel: severity === "error" ? "阻断" : severity === "warning" ? "需确认" : "提示",
    sheet,
    row,
    field,
    message,
  };
}

function sortIssues(issues) {
  return [...issues].sort((a, b) =>
    (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0)
    || String(a.sheet).localeCompare(String(b.sheet), "zh-Hans-CN")
    || Number(a.row || 0) - Number(b.row || 0),
  );
}

function buildProductSpecKey(values, fields) {
  const parts = fields.map((field) => cleanText(values[field]));
  return parts.every(Boolean) ? parts.join("|") : "";
}

function parseNumber(value) {
  const text = cleanText(value).replace(/,/g, "");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function normalizeImportedCellValue(field, value) {
  const text = cleanText(value);
  if (!text || !importedDateFieldNames.has(field)) return text;
  return normalizeImportedDateValue(text) ?? text;
}

function normalizeImportedDateValue(value) {
  const text = cleanText(value);
  const textDate =
    text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
    || text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
  if (textDate) {
    return formatValidatedDate(Number(textDate[1]), Number(textDate[2]), Number(textDate[3]));
  }
  return convertExcelDateSerialToDateString(text);
}

function convertExcelDateSerialToDateString(value) {
  const text = cleanText(value);
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const serial = Number(text);
  if (!Number.isFinite(serial) || serial <= 0 || serial > 60000) return null;
  const date = new Date(excelDateBaseUtcMs + Math.floor(serial) * excelDateMsPerDay);
  const year = date.getUTCFullYear();
  if (year < 1990 || year > 2100) return null;
  return formatDateParts(year, date.getUTCMonth() + 1, date.getUTCDate());
}

function formatValidatedDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return formatDateParts(year, month, day);
}

function formatDateParts(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function readXmlElementText(xml, tagName) {
  const optionalPrefix = "(?:[\\w.-]+:)?";
  const match = String(xml ?? "").match(new RegExp(`<${optionalPrefix}${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${optionalPrefix}${tagName}>`));
  return match ? decodeXml(match[1]) : "";
}

function getSummaryStatusLabel(status) {
  const labels = {
    passed: "可进入确认",
    review: "需人工确认",
    blocked: "不通过",
  };
  return labels[status] ?? "未知";
}

function getRecommendedAction(status) {
  if (status === "passed") return "未发现阻断问题，可进入导入确认队列。";
  if (status === "review") return "存在需人工确认项，确认后再进入导入队列。";
  return "存在阻断问题，需修正 Excel 后重新预检查。";
}

function readUint16(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

function readUint32(buffer, offset) {
  return (buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24)) >>> 0;
}

function normalizeBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error("预检查需要 xlsx 二进制内容。");
}

function decodeUtf8(bytes) {
  return new TextDecoder().decode(bytes);
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function cleanText(value) {
  return String(value ?? "").trim();
}
