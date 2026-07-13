import { normalizeMasterDataEmployeeRoleCoverage } from "./masterDataImportReviewQueue.js";

export const MASTER_DATA_IMPORT_CONFIRMATION_PLAN_VERSION = "p0-master-data-import-confirmation-plan-v1";

const sheetWriteContracts = {
  customers: {
    label: "客户档案",
    targetTables: ["customers", "customer_contacts", "customer_addresses", "customer_notes"],
    writeMode: "confirm_then_upsert",
    rule: "客户主体、联系人、地址和客户群不静默覆盖，冲突必须人工确认。",
  },
  price_tables: {
    label: "价格表",
    targetTables: ["price_tables", "price_table_items"],
    writeMode: "insert_pending_review",
    rule: "价格导入后先进入待审核，不直接影响订单计价。",
  },
  product_specs: {
    label: "尺寸颜色款式",
    targetTables: ["standard_colors", "color_aliases", "size_specs", "finished_goods_styles"],
    writeMode: "confirm_then_upsert",
    rule: "规格、颜色、提手和款式必须作为订单识别、价格和库存键的统一来源。",
  },
  inventory_items: {
    label: "初始库存",
    targetTables: ["inventory_items", "inventory_ledger_entries"],
    writeMode: "initial_balance_with_ledger",
    rule: "初始库存必须写盘点 / 修正流水，不允许只改库存总数。",
  },
  employees_machines: {
    label: "员工机台",
    targetTables: ["employees", "machines", "employee_machine_assignments", "machine_capacity_baselines"],
    writeMode: "confirm_then_upsert",
    rule: "员工账号默认不启用；岗位、机台、默认绑定和粗略产能导入后仍需按权限复核。",
  },
};

export function canCreateMasterDataImportConfirmationPlan(reviewDraft) {
  return Boolean(reviewDraft)
    && reviewDraft.status !== "blocked"
    && reviewDraft.canEnterReviewQueue !== false
    && toFiniteNumber(reviewDraft.summary?.errorCount) === 0;
}

export function createMasterDataImportConfirmationPlan(input = {}) {
  const reviewDraft = input.reviewDraft ?? {};
  if (!canCreateMasterDataImportConfirmationPlan(reviewDraft)) {
    throw new Error("导入确认计划只能从无阻断项的确认队列草稿生成。");
  }

  const createdAt = cleanText(input.createdAt) || new Date().toISOString();
  const createdBy = cleanText(input.createdBy) || cleanText(input.confirmedBy) || "unknown";
  const writeBatches = buildWriteBatches(reviewDraft.sheets);
  const stagedRows = normalizeStagedRows(reviewDraft.stagedRows);
  const requiresManualReview = Boolean(reviewDraft.summary?.requiresManualReview);
  const status = requiresManualReview ? "manual_review_required" : "ready_for_final_confirmation";
  const targetTables = unique(writeBatches.flatMap((batch) => batch.targetTables));
  const stagedRowCount = stagedRows.reduce((sum, sheet) => sum + sheet.rows.length, 0);
  const employeeRoleCoverage = normalizeMasterDataEmployeeRoleCoverage(reviewDraft.employeeRoleCoverage);

  return {
    version: MASTER_DATA_IMPORT_CONFIRMATION_PLAN_VERSION,
    planId: buildConfirmationPlanId(reviewDraft, createdAt),
    draftId: cleanText(reviewDraft.draftId),
    fileName: cleanText(reviewDraft.fileName),
    createdAt,
    createdBy,
    status,
    statusLabel: getMasterDataImportConfirmationPlanStatusLabel(status),
    officialImportEnabled: false,
    officialWriteScope: "none",
    summary: {
      dataRowCount: toFiniteNumber(reviewDraft.summary?.dataRowCount),
      sheetCount: writeBatches.length,
      targetTableCount: targetTables.length,
      warningCount: toFiniteNumber(reviewDraft.summary?.warningCount),
      requiresManualReview,
      stagedRowCount,
      employeeRoleCoverageLabel: employeeRoleCoverage.coverageLabel,
    },
    employeeRoleCoverage,
    writeBatches,
    stagedRows,
    targetTables,
    operationLogDraft: {
      action: "master_data_import_confirmation_plan_created",
      subjectType: "master_data_import_review_draft",
      subjectId: cleanText(reviewDraft.draftId),
      operatorId: createdBy,
      occurredAt: createdAt,
      message: `基础资料导入确认计划已生成，当前不写正式数据：${cleanText(reviewDraft.draftId)}`,
    },
    transactionPolicy: {
      required: true,
      isolation: "read_committed_or_stronger",
      rollbackOnAnyFailedRow: true,
      failedRowDownloadRequired: true,
      operationLogRequiredBeforeWrite: true,
    },
    safeguards: [
      "确认导入必须由有权限人员触发。",
      "正式导入前必须重新读取确认队列草稿，避免旧预检查结果被重复使用。",
      "客户、规格、员工、机台采用冲突复核后写入，不允许静默覆盖。",
      "价格导入默认进入待审核，不直接改变订单价格快照。",
      "库存导入必须生成初始盘点 / 修正流水，历史订单和库存流水不被重写。",
      "任一行写入失败时整批事务回滚，并生成失败行下载文件。",
    ],
  };
}

function normalizeStagedRows(stagedRows) {
  return (Array.isArray(stagedRows) ? stagedRows : [])
    .map((sheet) => ({
      sheetKey: cleanText(sheet.sheetKey ?? sheet.key),
      worksheetName: cleanText(sheet.worksheetName),
      rows: (Array.isArray(sheet.rows) ? sheet.rows : [])
        .map((row) => ({
          rowNumber: toFiniteNumber(row.rowNumber),
          values: normalizeRowValues(row.values),
        }))
        .filter((row) => row.rowNumber > 0 && Object.values(row.values).some(Boolean)),
    }))
    .filter((sheet) => sheet.sheetKey && sheet.rows.length > 0);
}

function normalizeRowValues(values = {}) {
  return Object.fromEntries(Object.entries(values ?? {}).map(([key, value]) => [cleanText(key), cleanText(value)]));
}

export function getMasterDataImportConfirmationPlanSummary(plan) {
  if (!plan) return "";
  const roleLabel = plan.employeeRoleCoverage?.available ? ` · 岗位 ${plan.employeeRoleCoverage.coverageLabel}` : "";
  return `${plan.statusLabel || "待处理"} · ${plan.summary?.dataRowCount ?? 0} 行 · ${plan.summary?.targetTableCount ?? 0} 张目标表${roleLabel}`;
}

export function getMasterDataImportConfirmationPlanStatusLabel(status) {
  if (status === "manual_review_required") return "需先复核";
  if (status === "ready_for_final_confirmation") return "待最终确认";
  if (status === "confirmed") return "已确认";
  if (status === "voided") return "已作废";
  return "待处理";
}

function buildWriteBatches(sheets = []) {
  return (Array.isArray(sheets) ? sheets : [])
    .filter((sheet) => toFiniteNumber(sheet.dataRowCount) > 0)
    .map((sheet) => {
      const contract = sheetWriteContracts[sheet.key] ?? {
        label: cleanText(sheet.label) || cleanText(sheet.key),
        targetTables: ["master_data_import_staging"],
        writeMode: "staging_review_required",
        rule: "未知资料类型只能先进入暂存复核。",
      };
      return {
        sheetKey: cleanText(sheet.key),
        sheetLabel: contract.label,
        worksheetName: cleanText(sheet.worksheetName),
        dataRowCount: toFiniteNumber(sheet.dataRowCount),
        targetTables: [...contract.targetTables],
        writeMode: contract.writeMode,
        rule: contract.rule,
      };
    });
}

function buildConfirmationPlanId(reviewDraft, createdAt) {
  const date = compactDate(createdAt || reviewDraft.createdAt || reviewDraft.checkedAt);
  const seed = [
    reviewDraft.draftId,
    reviewDraft.fileName,
    reviewDraft.checkedAt,
    createdAt,
    reviewDraft.summary?.dataRowCount,
    reviewDraft.summary?.warningCount,
  ].map(cleanText).join("|");
  return `MDP-${date}-${stableHash(seed)}`;
}

function stableHash(value) {
  let hash = 2166136261;
  const text = cleanText(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
}

function compactDate(value) {
  const text = cleanText(value);
  const match = text.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (match) return `${match[1]}${match[2]}${match[3]}`;
  return "00000000";
}

function unique(values) {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
