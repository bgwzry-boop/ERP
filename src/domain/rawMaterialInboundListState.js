export const RAW_MATERIAL_INBOUND_VIEW_KEYS = ["入库单", "退货单", "待贴标", "机边领料", "供应商对账"];

export function buildRawMaterialInboundMetrics(inbounds = []) {
  const pendingReview = inbounds.filter((item) => ["已拍照待识别", "已识别待复核", "待补充/待确认"].includes(item.status)).length;
  const pendingPrint = inbounds.filter((item) => ["已复核待打印标签", "已入库待补打标签"].includes(item.status)).length;
  const pendingAttach = inbounds.filter((item) => item.status === "已打印待贴标" || item.status === "部分贴标").length;
  const supplierReturnCount = inbounds.filter((item) => item.documentDirection === "supplier_return").length;
  const availablePieces = inbounds.reduce(
    (total, item) => total + (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "可用").length,
    0,
  );
  const machineSidePieces = inbounds.reduce(
    (total, item) => total + (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "机边领用").length,
    0,
  );
  const consumedPieces = inbounds.reduce(
    (total, item) => total + (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "已消耗").length,
    0,
  );
  const leftoverPieces = inbounds.reduce(
    (total, item) => total + (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "余料待复核").length,
    0,
  );
  const leftoverReviewedPieces = inbounds.reduce(
    (total, item) => total + (item.rolls ?? []).filter((roll) => roll.leftoverReviewRecordId).length,
    0,
  );
  const splitCount = inbounds.reduce((total, item) => total + (item.rawMaterialSplitRecords?.length || 0), 0);
  const costDraftCount = inbounds.reduce((total, item) => total + (item.rawMaterialCostAllocationDrafts?.length || 0), 0);
  const costConfirmedCount = inbounds.reduce((total, item) => total + (item.rawMaterialCostAllocationConfirmations?.length || 0), 0);
  const lossCalibrationCount = inbounds.reduce((total, item) => total + (item.rawMaterialCostLossCalibrations?.length || 0), 0);
  const marginSnapshotCount = inbounds.reduce((total, item) => total + (item.rawMaterialOrderMarginSnapshots?.length || 0), 0);
  const marginReportCount = inbounds.reduce((total, item) => total + (item.rawMaterialOrderMarginReports?.length || 0), 0);
  return [
    ["待复核", pendingReview, pendingReview ? "warning" : "success"],
    ["待打印", pendingPrint, pendingPrint ? "blue" : "success"],
    ["待贴标", pendingAttach, pendingAttach ? "warning" : "success"],
    ["退货单", supplierReturnCount, supplierReturnCount ? "warning" : "neutral"],
    ["可用卷/件", availablePieces, availablePieces ? "success" : "warning"],
    ["机边领料", machineSidePieces, machineSidePieces ? "warning" : "neutral"],
    ["拆卷", splitCount, splitCount ? "warning" : "neutral"],
    ["已消耗", consumedPieces, consumedPieces ? "success" : "neutral"],
    ["余料待复核", leftoverPieces, leftoverPieces ? "warning" : "neutral"],
    ["余料已复核", leftoverReviewedPieces, leftoverReviewedPieces ? "success" : "neutral"],
    ["成本草稿", costDraftCount, costDraftCount ? "blue" : "neutral"],
    ["成本确认", costConfirmedCount, costConfirmedCount ? "success" : "neutral"],
    ["损耗校准", lossCalibrationCount, lossCalibrationCount ? "success" : "neutral"],
    ["毛利快照", marginSnapshotCount, marginSnapshotCount ? "success" : "neutral"],
    ["毛利报表", marginReportCount, marginReportCount ? "success" : "neutral"],
  ];
}

export function buildRawMaterialInboundViewItems(inbounds = []) {
  return RAW_MATERIAL_INBOUND_VIEW_KEYS.map((key) => ({
    key,
    label: key,
    count: filterRawMaterialInboundsByTab(inbounds, key).length,
  }));
}

export function getSupplierStatementStatusTone(status) {
  if (status === "passed") return "success";
  if (status === "blocked") return "danger";
  return "warning";
}

export function getSupplierStatementReviewTone(status = "") {
  if (status.includes("已确认付款") || status.includes("已完成")) return "success";
  if (status.includes("已确认对账") || status.includes("一致")) return "success";
  if (status.includes("阻断") || status.includes("差异")) return "danger";
  if (status.includes("确认") || status.includes("复核")) return "warning";
  return "neutral";
}

export function getSupplierStatementReviewSourceLabel(meta = {}) {
  if (meta.loading) return "正在同步月结复核草稿";
  if (meta.source === "api") return `后端草稿 ${meta.total ?? 0} 条${meta.lastSyncedAt ? ` · ${meta.lastSyncedAt}` : ""}`;
  if (meta.source === "api_error") return "草稿 API 返回错误";
  return "等待保存第一条复核草稿";
}

export function formatSupplierPayableAmount(value, fallbackMoney = (amount) => `¥${amount}`) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallbackMoney(value);
  return `¥${number.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getRawMaterialInboundSourceLabel(meta = {}) {
  if (meta.loading) return "正在同步原材料入库 API";
  if (meta.source === "api") return `后端 API 已同步${meta.lastSyncedAt ? ` · ${meta.lastSyncedAt}` : ""}`;
  if (meta.source === "local_fallback") return "本地规则降级；API 未连接";
  if (meta.source === "api_error") return "API 返回错误；请检查权限或服务";
  return "本地原型数据";
}

export function getRawMaterialNextActionLabel(item = {}) {
  const status = String(item.status || "");
  if (item.documentDirection === "supplier_return") {
    if (["已拍照待识别", "已识别待复核", "待补充/待确认"].includes(status)) return "核对退货单";
    if (status === "退货单已复核") return "查看退货凭证";
    return "查看退货详情";
  }
  if (["已拍照待识别", "已识别待复核", "待补充/待确认"].includes(status)) return "核对送货单";
  if (status === "已复核待打印标签") return "打印卷标";
  if (status === "已入库待补打标签") return "补打卷标";
  if (status === "已打印待贴标") return "贴标并核对";
  if (status === "部分贴标") return "继续贴标";
  if (status.includes("余料待复核")) return "复核余料";
  if (status.includes("消耗确认")) return "查看消耗记录";
  if (status.includes("领料/机边")) return "确认消耗或退料";
  if (status.includes("可用")) return "可扫码领料";
  return "查看详情";
}

export function formatRawMaterialDeliveryNoteNo(item = {}) {
  const fallbackLabel = item.documentDirection === "supplier_return" ? "退货单" : "入库单";
  return item.deliveryNoteNo || `供应商未提供单号 / ${item.id || `系统${fallbackLabel}待生成`}`;
}

export function filterRawMaterialInboundsByTab(inbounds = [], tab) {
  if (tab === "退货单") return inbounds.filter((item) => item.documentDirection === "supplier_return");
  if (tab === "待贴标") return inbounds.filter((item) => item.documentDirection !== "supplier_return" && (item.status === "已打印待贴标" || item.status === "部分贴标"));
  if (tab === "机边领料") {
    return inbounds.filter((item) => item.documentDirection !== "supplier_return" && (
      item.status.includes("领料/机边") ||
      item.status.includes("消耗确认") ||
      item.status.includes("余料") ||
      (item.rolls ?? []).some((roll) => ["机边领用", "已消耗", "余料待复核"].includes(roll.inventoryStatus) || roll.leftoverReviewRecordId)
    ));
  }
  if (tab === "供应商对账") return inbounds;
  return inbounds.filter((item) => item.documentDirection !== "supplier_return");
}

export function filterRawMaterialInboundsByKeyword(inbounds = [], keyword = "") {
  const query = String(keyword ?? "").trim().toLowerCase();
  if (!query) return inbounds;
  return inbounds.filter((item) =>
    [
      item.id, item.supplierName, item.deliveryNoteNo, item.materialType, item.productName, item.supplierColor,
      item.factoryColor, item.spec, item.status, item.note,
      item.widthCm, item.gramWeightGsm, item.totalWeightKg,
      ...(item.rolls ?? []).flatMap((roll) => [roll.id, roll.supplierRollNo, roll.labelStatus, roll.location, roll.widthCm, roll.weightKg]),
    ].some((value) => String(value ?? "").toLowerCase().includes(query)),
  );
}

export function getRawMaterialInboundTone(status = "") {
  if (status.includes("异常")) return "danger";
  if (status.includes("消耗确认")) return "success";
  if (status.includes("余料") || status.includes("领料/机边") || status.includes("待") || status.includes("部分")) return "warning";
  if (status.includes("可用")) return "success";
  return "blue";
}

export function canReviewRawMaterialInbound(item = {}) {
  return ["已拍照待识别", "已识别待复核", "待补充/待确认"].includes(item.status);
}

export function canPrintRawMaterialLabels(item = {}) {
  const printableRolls = (item.rolls ?? []).filter((roll) => roll.inventoryStatus !== "可用");
  return ["已复核待打印标签", "已入库待补打标签"].includes(item.status)
    && printableRolls.length > 0
    && printableRolls.every((roll) => Number(roll.weightKg) > 0);
}

export function canConfirmRawMaterialAttachment(item = {}) {
  return (item.rolls ?? []).some((roll) => roll.labelStatus === "已打印待贴标" && roll.inventoryStatus !== "可用");
}

export function canIssueRawMaterialToMachine(item = {}) {
  return (item.rolls ?? []).some(canIssueRawMaterialRoll);
}

export function canIssueRawMaterialRoll(roll = {}) {
  return roll.inventoryStatus === "可用" && String(roll.labelStatus || "").includes("已贴标");
}

export function canConfirmRawMaterialConsumptionRoll(roll = {}) {
  return roll.inventoryStatus === "机边领用";
}

export function canReturnRawMaterialLeftoverRoll(roll = {}) {
  return roll.inventoryStatus === "机边领用";
}

export function canReviewRawMaterialLeftoverRoll(roll = {}) {
  return roll.inventoryStatus === "余料待复核";
}
