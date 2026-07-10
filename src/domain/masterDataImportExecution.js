import {
  MASTER_DATA_IMPORT_EXECUTION_PAYLOAD_VERSION,
  buildMasterDataImportExecutionPayload,
} from "./masterDataImportExecutionPayload.js";

export const MASTER_DATA_IMPORT_EXECUTION_VERSION = "p0-master-data-import-execution-v1";

const defaultBlockingCapabilities = [
  "PostgreSQL 主数据事务写入器",
  "任一失败行整批回滚验证",
  "失败行下载接口 / UI",
  "正式操作日志事务内落库",
];

export function canCreateMasterDataImportExecution(confirmationPlan) {
  return Boolean(confirmationPlan)
    && cleanText(confirmationPlan.planId)
    && cleanText(confirmationPlan.status) !== "voided";
}

export function createMasterDataImportExecution(input = {}) {
  const confirmationPlan = input.confirmationPlan ?? {};
  if (!canCreateMasterDataImportExecution(confirmationPlan)) {
    throw new Error("基础资料导入执行记录只能从未作废的确认计划生成。");
  }

  const requestedAt = cleanText(input.requestedAt) || new Date().toISOString();
  const requestedBy = cleanText(input.requestedBy) || cleanText(input.operatorId) || "unknown";
  const writerKind = cleanText(input.officialWriterKind) || "not_configured";
  const officialImportEnabled = input.officialImportEnabled === true || confirmationPlan.officialImportEnabled === true;
  const officialWriteScope = officialImportEnabled
    ? cleanText(input.officialWriteScope) || "master_data_import_v1"
    : "none";
  const importPayload = buildMasterDataImportExecutionPayload(confirmationPlan);
  const status = resolveExecutionStatus({ confirmationPlan, writerKind, officialImportEnabled, importPayload });
  const blockingReasons = buildBlockingReasons({ confirmationPlan, writerKind, officialImportEnabled, importPayload });
  const targetTables = unique(confirmationPlan.targetTables ?? []);
  const writeBatches = normalizeExecutionBatches(confirmationPlan.writeBatches, status);

  return {
    version: MASTER_DATA_IMPORT_EXECUTION_VERSION,
    executionId: buildExecutionId(confirmationPlan, requestedAt),
    planId: cleanText(confirmationPlan.planId),
    draftId: cleanText(confirmationPlan.draftId),
    fileName: cleanText(confirmationPlan.fileName),
    requestedAt,
    requestedBy,
    status,
    statusLabel: getMasterDataImportExecutionStatusLabel(status),
    officialWriterKind: writerKind,
    officialImportEnabled,
    officialWriteAttempted: false,
    officialWriteScope,
    transactionStarted: false,
    finishedAt: status.startsWith("blocked_") ? requestedAt : "",
    summary: {
      dataRowCount: toFiniteNumber(confirmationPlan.summary?.dataRowCount),
      sheetCount: writeBatches.length,
      targetTableCount: targetTables.length,
      stagedRowCount: importPayload.summary.stagedRowCount,
      writableRowCount: importPayload.summary.writableRowCount,
      failedRowCount: importPayload.summary.failedRowCount,
      targetRecordCount: importPayload.summary.targetRecordCount,
      blockedReasonCount: blockingReasons.length,
    },
    writeBatches,
    targetTables,
    importPayloadVersion: MASTER_DATA_IMPORT_EXECUTION_PAYLOAD_VERSION,
    importPayload,
    failedRows: importPayload.failedRows,
    failedRowsDownload: importPayload.failedRowsDownload,
    blockingReasons,
    nextRequiredCapabilities: [...defaultBlockingCapabilities],
    safeguards: [
      "执行记录必须从已保存的确认计划读取，不能直接用前端传入的旧草稿写库。",
      "正式主数据写入器未配置或管理账号未显式确认前，API 只保存阻断记录，不尝试写正式数据。",
      "价格、库存和权限相关资料仍需人工复核和事务保护后才能正式生效。",
    ],
    operationLogDraft: {
      action: getExecutionOperationAction(status),
      subjectType: "master_data_import_confirmation_plan",
      subjectId: cleanText(confirmationPlan.planId),
      operatorId: requestedBy,
      occurredAt: requestedAt,
      message: `基础资料导入执行记录已生成，状态：${getMasterDataImportExecutionStatusLabel(status)}。`,
    },
  };
}

export function getMasterDataImportExecutionSummary(execution) {
  if (!execution) return "";
  return `${execution.statusLabel || "待处理"} · ${execution.summary?.dataRowCount ?? 0} 行 · ${execution.summary?.blockedReasonCount ?? 0} 项阻断`;
}

export function getMasterDataImportExecutionStatusLabel(status) {
  if (status === "blocked_manual_review_required") return "需先人工复核";
  if (status === "blocked_import_rows_missing") return "缺少导入行数据";
  if (status === "blocked_failed_rows_ready") return "已生成失败行";
  if (status === "blocked_official_writer_not_configured") return "未接正式写入";
  if (status === "ready_for_transaction_writer") return "待事务写入器执行";
  if (status === "committed") return "已正式导入";
  if (status === "failed") return "导入失败已回滚";
  if (status === "voided") return "已作废";
  return "待处理";
}

function resolveExecutionStatus({ confirmationPlan, writerKind, officialImportEnabled, importPayload }) {
  if (cleanText(confirmationPlan.status) === "manual_review_required") {
    return "blocked_manual_review_required";
  }
  if (!importPayload.hasStagedRows) {
    return "blocked_import_rows_missing";
  }
  if (importPayload.summary.failedRowCount > 0) {
    return "blocked_failed_rows_ready";
  }
  if (!officialImportEnabled || !isConfiguredWriterKind(writerKind)) {
    return "blocked_official_writer_not_configured";
  }
  return "ready_for_transaction_writer";
}

function buildBlockingReasons({ confirmationPlan, writerKind, officialImportEnabled, importPayload }) {
  const reasons = [];
  if (cleanText(confirmationPlan.status) === "manual_review_required") {
    reasons.push("确认计划仍处于需人工复核状态。");
  }
  if (!importPayload.hasStagedRows) {
    reasons.push("确认计划缺少经过预检查的行数据，必须重新上传 Excel 生成计划。");
  }
  if (importPayload.summary.failedRowCount > 0) {
    reasons.push(`存在 ${importPayload.summary.failedRowCount} 行不能正式导入，已生成失败行文件。`);
  }
  if (!officialImportEnabled) {
    reasons.push("确认计划仍为 officialImportEnabled=false，禁止正式写入。");
  }
  if (!isConfiguredWriterKind(writerKind)) {
    reasons.push("正式主数据 PostgreSQL 写入器尚未配置。");
  }
  return reasons.length ? reasons : ["等待事务写入器接管执行。"];
}

function isConfiguredWriterKind(writerKind) {
  return ["local_transaction", "local", "postgres"].includes(cleanText(writerKind));
}

function normalizeExecutionBatches(writeBatches = [], status) {
  return (Array.isArray(writeBatches) ? writeBatches : []).map((batch) => ({
    sheetKey: cleanText(batch.sheetKey),
    sheetLabel: cleanText(batch.sheetLabel),
    worksheetName: cleanText(batch.worksheetName),
    dataRowCount: toFiniteNumber(batch.dataRowCount),
    targetTables: unique(batch.targetTables ?? []),
    writeMode: cleanText(batch.writeMode),
    executionStatus: status.startsWith("blocked_") ? "blocked" : "pending",
    failureCount: 0,
    insertedCount: 0,
    updatedCount: 0,
  }));
}

function getExecutionOperationAction(status) {
  if (status.startsWith("blocked_")) return "master_data_import_execution_blocked";
  return "master_data_import_execution_requested";
}

function buildExecutionId(confirmationPlan, requestedAt) {
  const date = compactDate(requestedAt || confirmationPlan.createdAt);
  const seed = [
    confirmationPlan.planId,
    confirmationPlan.draftId,
    confirmationPlan.fileName,
    confirmationPlan.createdAt,
    requestedAt,
    confirmationPlan.summary?.dataRowCount,
  ].map(cleanText).join("|");
  return `MDE-${date}-${stableHash(seed)}`;
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
  return Array.from(new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean)));
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
