export const MASTER_DATA_IMPORT_EXECUTION_PAYLOAD_VERSION = "p0-master-data-import-execution-payload-v1";

const supportedSheetKeys = new Set(["customers", "product_specs", "price_tables", "inventory_items", "employees_machines"]);

const unsupportedSheetReasons = {};

export function buildMasterDataImportExecutionPayload(confirmationPlan = {}) {
  const stagedSheets = normalizeStagedRows(confirmationPlan.stagedRows);
  const targetRecords = createEmptyTargetRecords();
  const failedRows = [];
  const writableRows = [];

  for (const sheet of stagedSheets) {
    for (const row of sheet.rows) {
      if (!supportedSheetKeys.has(sheet.sheetKey)) {
        failedRows.push(createFailedRow(sheet, row, unsupportedSheetReasons[sheet.sheetKey] || "该 sheet 暂未接入正式导入写入器。"));
        continue;
      }
      const mapped = mapRowToTargetRecords(sheet, row);
      if (mapped.failedReason) {
        failedRows.push(createFailedRow(sheet, row, mapped.failedReason));
        continue;
      }
      appendTargetRecords(targetRecords, mapped.targetRecords);
      writableRows.push({
        sheetKey: sheet.sheetKey,
        worksheetName: sheet.worksheetName,
        rowNumber: row.rowNumber,
        targetRecordTypes: Object.entries(mapped.targetRecords)
          .filter(([, records]) => records.length > 0)
          .map(([recordType]) => recordType),
      });
    }
  }

  const failedRowsDownload = buildFailedRowsDownload({
    planId: confirmationPlan.planId,
    failedRows,
  });

  return {
    version: MASTER_DATA_IMPORT_EXECUTION_PAYLOAD_VERSION,
    planId: cleanText(confirmationPlan.planId),
    draftId: cleanText(confirmationPlan.draftId),
    hasStagedRows: stagedSheets.some((sheet) => sheet.rows.length > 0),
    supportedSheetKeys: [...supportedSheetKeys],
    unsupportedSheetKeys: Object.keys(unsupportedSheetReasons),
    stagedSheets,
    writableRows,
    failedRows,
    failedRowsDownload,
    targetRecords,
    summary: {
      stagedRowCount: stagedSheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
      writableRowCount: writableRows.length,
      failedRowCount: failedRows.length,
      targetRecordCount: countTargetRecords(targetRecords),
      supportedSheetCount: stagedSheets.filter((sheet) => supportedSheetKeys.has(sheet.sheetKey)).length,
      unsupportedSheetCount: stagedSheets.filter((sheet) => !supportedSheetKeys.has(sheet.sheetKey)).length,
    },
  };
}

export function normalizeStagedRows(stagedRows) {
  return (Array.isArray(stagedRows) ? stagedRows : [])
    .map((sheet) => {
      const sheetKey = cleanText(sheet.sheetKey ?? sheet.key);
      const worksheetName = cleanText(sheet.worksheetName);
      const rows = (Array.isArray(sheet.rows) ? sheet.rows : [])
        .map((row) => ({
          rowNumber: toFiniteNumber(row.rowNumber),
          values: normalizeValues(row.values),
        }))
        .filter((row) => row.rowNumber > 0 && Object.values(row.values).some(Boolean));
      return {
        sheetKey,
        worksheetName,
        rows,
      };
    })
    .filter((sheet) => sheet.sheetKey && sheet.rows.length > 0);
}

function mapRowToTargetRecords(sheet, row) {
  if (sheet.sheetKey === "customers") return mapCustomerRow(row);
  if (sheet.sheetKey === "product_specs") return mapProductSpecRow(row);
  if (sheet.sheetKey === "price_tables") return mapPriceTableRow(row);
  if (sheet.sheetKey === "inventory_items") return mapInventoryItemRow(row);
  if (sheet.sheetKey === "employees_machines") return mapEmployeeMachineRow(row);
  return { failedReason: "该 sheet 暂未接入正式导入写入器。" };
}

function mapCustomerRow(row) {
  const name = cleanText(row.values["客户名称"]);
  if (!name) return { failedReason: "客户名称为空，不能生成客户主数据。" };
  const customerId = cleanText(row.values["客户编号"]) || stableId("C-IMP", name);
  const contactName = cleanText(row.values["联系人姓名"]);
  const phone = cleanText(row.values["手机号"]);
  const address = cleanText(row.values["详细地址"]);
  const targetRecords = createEmptyTargetRecords();
  targetRecords.customers.push({
    id: customerId,
    bizNo: customerId,
    name,
    shortName: name.slice(0, 12),
    settlementCycle: cleanText(row.values["结算周期"]) || "未设置",
    riskStatus: cleanText(row.values["风险状态"]) || "正常",
    enabled: normalizeEnabled(row.values["启用状态"]),
  });
  if (contactName || phone) {
    const contactId = stableId("CC-IMP", `${customerId}|${contactName}|${phone}`);
    targetRecords.customerContacts.push({
      id: contactId,
      customerId,
      contactName,
      phone,
      role: cleanText(row.values["联系人角色"]),
      isDefault: true,
      remark: cleanText(row.values["客户备注"]),
    });
    if (address) {
      targetRecords.customerAddresses.push({
        id: stableId("CA-IMP", `${customerId}|${address}`),
        customerId,
        contactId,
        address,
        area: cleanText(row.values["地址区域"]),
        defaultFulfillmentMethod: cleanText(row.values["默认交付方式"]),
        isDefault: true,
        remark: cleanText(row.values["打包/交付偏好"]),
      });
    }
  }
  for (const note of [
    ["customer", row.values["客户备注"]],
    ["office", row.values["办公室备注"]],
    ["finance", row.values["财务备注"]],
  ]) {
    const content = cleanText(note[1]);
    if (!content) continue;
    targetRecords.customerNotes.push({
      id: stableId("CN-IMP", `${customerId}|${note[0]}|${content}`),
      customerId,
      noteType: note[0],
      content,
      visibleTo: note[0],
    });
  }
  return { targetRecords };
}

function mapProductSpecRow(row) {
  const size = cleanText(row.values["标准尺寸"]);
  const color = cleanText(row.values["标准颜色"]);
  const handleType = cleanText(row.values["提手类型"]);
  const style = cleanText(row.values["成品款式"]);
  if (!size || !color || !handleType || !style) return { failedReason: "规格、颜色、提手和成品款式必须完整。" };
  const colorId = stableId("SC-IMP", color);
  const sizeId = cleanText(row.values["规格编号"]) || stableId("SIZE-IMP", size);
  const styleId = stableId("STYLE-IMP", style);
  const targetRecords = createEmptyTargetRecords();
  targetRecords.standardColors.push({
    id: colorId,
    colorKey: stableKey(color),
    name: color,
    enabled: normalizeEnabled(row.values["启用状态"]),
  });
  for (const alias of splitAliases(row.values["颜色别名"])) {
    targetRecords.colorAliases.push({
      id: stableId("CA-ALIAS", `${alias}|global`),
      alias,
      standardColorId: colorId,
      sourceType: "global",
      sourceId: "",
      enabled: true,
    });
  }
  targetRecords.sizeSpecs.push({
    id: sizeId,
    sizeKey: stableKey(size),
    displayName: size,
    widthMm: toNullableNumber(row.values["袋体宽幅cm"]),
    heightMm: toNullableNumber(row.values["布长cm"]),
    metadata: {
      customerAlias: cleanText(row.values["客户叫法"]),
      productionSize: cleanText(row.values["实际生产尺寸"]),
      handleType,
      style,
      remark: cleanText(row.values["备注"]),
    },
    enabled: normalizeEnabled(row.values["启用状态"]),
  });
  targetRecords.finishedGoodsStyles.push({
    id: styleId,
    styleKey: stableKey(style),
    name: style,
    enabled: normalizeEnabled(row.values["启用状态"]),
    allowedSizeKeys: [stableKey(size)],
  });
  return { targetRecords };
}

function mapPriceTableRow(row) {
  const tableName = cleanText(row.values["价格表名称"]);
  const priceType = cleanText(row.values["价格类型"]);
  const size = cleanText(row.values["尺寸"]);
  const price = toNullableNumber(row.values["单价"]);
  if (!tableName || !priceType || !size || price == null) return { failedReason: "价格表名称、价格类型、尺寸和单价必须完整。" };
  const tableId = cleanText(row.values["价格表编号"]) || stableId("PT-IMP", tableName);
  const color = cleanText(row.values["颜色"]);
  const colorId = color ? stableId("SC-IMP", color) : "";
  const targetRecords = createEmptyTargetRecords();
  targetRecords.priceTables.push({
    id: tableId,
    bizNo: tableId,
    name: tableName,
    status: "pending_review",
    effectiveFrom: cleanText(row.values["生效日期"]),
  });
  if (color) {
    targetRecords.standardColors.push({
      id: colorId,
      colorKey: stableKey(color),
      name: color,
      enabled: true,
    });
  }
  targetRecords.priceTableItems.push({
    id: stableId("PTI-IMP", `${tableId}|${priceType}|${size}|${color}|${row.values["提手类型"]}|${row.values["成品款式"]}|${row.values["印刷面"]}|${row.values["阶梯起量"]}`),
    priceTableId: tableId,
    sizeKey: stableKey(size),
    standardColorId: colorId,
    handleType: cleanText(row.values["提手类型"]),
    styleKey: stableKey(row.values["成品款式"]),
    bagPrice: priceType.includes("印") ? 0 : price,
    printPrice: priceType.includes("印") ? price : 0,
    otherFee: toNullableNumber(row.values["加长提加价"]) ?? 0,
    minQty: toFiniteNumber(row.values["阶梯起量"]) || 1,
    enabled: false,
  });
  return { targetRecords };
}

function mapInventoryItemRow(row) {
  const size = cleanText(row.values["尺寸"]);
  const color = cleanText(row.values["颜色"]);
  const handleType = cleanText(row.values["提手类型"]);
  const style = cleanText(row.values["成品款式"]);
  const zone = cleanText(row.values["库区"]);
  const onHandQty = toFiniteNumber(row.values["在库数量"]);
  if (!size || !color || !handleType || !style || !zone) return { failedReason: "库存尺寸、颜色、提手、款式和库区必须完整。" };
  const colorId = stableId("SC-IMP", color);
  const inventoryState = cleanText(row.values["库存状态"]) || "仓库已清点";
  const inventoryId = cleanText(row.values["库存编号"]) || stableId("INV-IMP", `${size}|${color}|${handleType}|${style}|${zone}|${inventoryState}`);
  const targetRecords = createEmptyTargetRecords();
  targetRecords.standardColors.push({
    id: colorId,
    colorKey: stableKey(color),
    name: color,
    enabled: true,
  });
  targetRecords.inventoryItems.push({
    id: inventoryId,
    inventoryKey: `${size}|${color}|${handleType}|${style}|${zone}|${inventoryState}`,
    size,
    standardColorId: colorId,
    handleType,
    style,
    zone,
    inventoryState,
    onHandQty,
    reservedQty: toFiniteNumber(row.values["已占用"]),
    waitingPickupLockedQty: toFiniteNumber(row.values["待提货锁定"]),
    pendingHandlingQty: toFiniteNumber(row.values["待处理"]),
    trustLevel: cleanText(row.values["可信度"]) || "待复核",
  });
  targetRecords.inventoryLedgerEntries.push({
    id: stableId("LEDGER-IMP", `${inventoryId}|${row.values["盘点日期"]}|${onHandQty}`),
    inventoryItemId: inventoryId,
    changeType: "initial_import",
    qtyBefore: 0,
    qtyChange: onHandQty,
    qtyAfter: onHandQty,
    sourceType: "master_data_import",
    sourceId: inventoryId,
    occurredAt: cleanText(row.values["盘点日期"]),
    reason: "基础资料初始库存导入",
    remark: cleanText(row.values["来源备注"]),
  });
  return { targetRecords };
}

function mapEmployeeMachineRow(row) {
  const employeeName = cleanText(row.values["员工姓名"]);
  const roleName = cleanText(row.values["角色"]);
  const defaultWorkshop = cleanText(row.values["默认车间"]);
  if (!employeeName || !roleName || !defaultWorkshop) return { failedReason: "员工姓名、角色和默认车间必须完整。" };

  const employeeId = cleanText(row.values["员工编号"]) || stableId("EMP-IMP", `${employeeName}|${roleName}|${defaultWorkshop}`);
  const machineName = cleanText(row.values["机台名称"]) || cleanText(row.values["默认机台"]);
  const machineWorkshop = cleanText(row.values["机台车间"]) || defaultWorkshop;
  const machineId = cleanText(row.values["机台编号"]) || (machineName ? stableId("MACH-IMP", `${machineName}|${machineWorkshop}`) : "");
  const capacitySize = cleanText(row.values["产能尺寸"]);
  const dailyCapacityQty = toFiniteNumber(row.values["粗略日产量"]);
  const effectiveFrom = cleanText(row.values["生效日期"]);
  const targetRecords = createEmptyTargetRecords();

  targetRecords.employees.push({
    id: employeeId,
    bizNo: employeeId,
    userId: "",
    name: employeeName,
    roleName,
    defaultWorkshop,
    defaultMachineId: machineId,
    baseHourlyWage: toNullableNumber(row.values["基础时薪"]) ?? 0,
    positionAllowanceHourly: toNullableNumber(row.values["岗位补贴/小时"]) ?? 0,
    wageEffectiveFrom: effectiveFrom,
    accountEnabled: false,
    profileStatus: "pending_admin_review",
    requestedEnabled: normalizeEnabled(row.values["启用状态"]),
    remark: cleanText(row.values["备注"]),
  });

  if (machineId && machineName) {
    targetRecords.machines.push({
      id: machineId,
      bizNo: machineId,
      name: machineName,
      machineType: "bag_making",
      workshop: machineWorkshop,
      status: normalizeEnabled(row.values["启用状态"]) ? "active" : "inactive",
      enabled: normalizeEnabled(row.values["启用状态"]),
      settings: {
        defaultOperatorName: employeeName,
        defaultWorkshop,
      },
    });
    targetRecords.employeeMachineAssignments.push({
      id: stableId("EMA-IMP", `${employeeId}|${machineId}|default|${effectiveFrom}`),
      employeeId,
      machineId,
      assignmentType: "default",
      workshop: machineWorkshop,
      effectiveFrom,
      enabled: normalizeEnabled(row.values["启用状态"]),
    });
  }

  if (machineId && capacitySize && dailyCapacityQty > 0) {
    targetRecords.machineCapacityBaselines.push({
      id: stableId("MCB-IMP", `${machineId}|${capacitySize}|${effectiveFrom}|manual_estimate`),
      machineId,
      sizeKey: stableKey(capacitySize),
      dailyCapacityQty,
      hourlyCapacityQty: null,
      sourceKind: "manual_estimate",
      confidence: "low",
      effectiveFrom,
      remark: "基础资料导入的人工估算产能，后续用生产汇总单校准。",
    });
  }

  return { targetRecords };
}

function buildFailedRowsDownload({ planId, failedRows }) {
  const safePlanId = cleanText(planId) || "MDE";
  const content = [
    ["计划ID", "Sheet", "行号", "失败原因", "原始数据"].join(","),
    ...failedRows.map((row) => [
      csvCell(safePlanId),
      csvCell(row.worksheetName),
      csvCell(row.rowNumber),
      csvCell(row.reason),
      csvCell(JSON.stringify(row.values)),
    ].join(",")),
  ].join("\n");
  return {
    required: failedRows.length > 0,
    fileName: `master-data-import-failed-rows-${safePlanId}.csv`,
    contentType: "text/csv; charset=utf-8",
    content,
    rowCount: failedRows.length,
  };
}

function createFailedRow(sheet, row, reason) {
  return {
    sheetKey: sheet.sheetKey,
    worksheetName: sheet.worksheetName,
    rowNumber: row.rowNumber,
    reason,
    values: row.values,
  };
}

function appendTargetRecords(targetRecords, addition) {
  for (const [key, records] of Object.entries(addition ?? {})) {
    if (!Array.isArray(targetRecords[key]) || !Array.isArray(records)) continue;
    const existingIds = new Set(targetRecords[key].map((record) => cleanText(record.id)).filter(Boolean));
    for (const record of records) {
      const id = cleanText(record.id);
      if (id && existingIds.has(id)) continue;
      targetRecords[key].push(record);
      if (id) existingIds.add(id);
    }
  }
}

function createEmptyTargetRecords() {
  return {
    customers: [],
    customerContacts: [],
    customerAddresses: [],
    customerNotes: [],
    standardColors: [],
    colorAliases: [],
    sizeSpecs: [],
    finishedGoodsStyles: [],
    priceTables: [],
    priceTableItems: [],
    inventoryItems: [],
    inventoryLedgerEntries: [],
    employees: [],
    machines: [],
    employeeMachineAssignments: [],
    machineCapacityBaselines: [],
  };
}

function countTargetRecords(targetRecords) {
  return Object.values(targetRecords).reduce((sum, records) => sum + (Array.isArray(records) ? records.length : 0), 0);
}

function splitAliases(value) {
  return cleanText(value)
    .split(/[\/,，、\s]+/)
    .map(cleanText)
    .filter(Boolean);
}

function normalizeValues(values = {}) {
  return Object.fromEntries(Object.entries(values ?? {}).map(([key, value]) => [cleanText(key), cleanText(value)]));
}

function normalizeEnabled(value) {
  const text = cleanText(value);
  return text !== "停用" && text !== "禁用" && text !== "false";
}

function stableId(prefix, value) {
  return `${prefix}-${stableHash(value)}`;
}

function stableKey(value) {
  const text = cleanText(value);
  return text
    .toLowerCase()
    .replace(/[\s*×xX]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function stableHash(value) {
  let hash = 2166136261;
  const text = cleanText(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(8, "0").slice(0, 8);
}

function csvCell(value) {
  const text = cleanText(value).replace(/"/g, "\"\"");
  return `"${text}"`;
}

function toNullableNumber(value) {
  const text = cleanText(value).replace(/,/g, "");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function toFiniteNumber(value) {
  const number = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
