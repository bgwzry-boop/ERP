export function canGenerateRawMaterialCostDraft(item = {}) {
  const existingConsumptionIds = new Set((item.rawMaterialCostAllocationDrafts ?? []).map((record) => record.consumptionRecordId).filter(Boolean));
  return (item.rawMaterialConsumptionRecords ?? []).some((record) => {
    if (existingConsumptionIds.has(record.consumptionRecordId)) return false;
    const issueRecord = (item.rawMaterialIssueRecords ?? []).find((issue) => issue.issueRecordId === record.issueRecordId)
      || (item.rawMaterialIssueRecords ?? []).find((issue) => issue.rollId === record.rollId);
    return Boolean(issueRecord?.productionTaskId && issueRecord?.productionTaskMatchStatus === "已匹配");
  });
}

export function canConfirmRawMaterialCostDraft(item = {}) {
  return (item.rawMaterialCostAllocationDrafts ?? []).some((record) => !record.costConfirmationId && record.allocationStatus !== "已复核/待损耗校准");
}

export function canCalibrateRawMaterialLoss(item = {}) {
  const calibratedConfirmationIds = new Set(
    (item.rawMaterialCostLossCalibrations ?? [])
      .flatMap((record) => [record.costConfirmationId, ...(record.costConfirmationIds ?? [])])
      .filter(Boolean),
  );
  return (item.rawMaterialCostAllocationConfirmations ?? []).some(
    (record) => !calibratedConfirmationIds.has(record.costConfirmationId) && record.lossCalibrationStatus !== "已校准/待毛利确认",
  );
}

export function canGenerateRawMaterialMarginSnapshot(item = {}) {
  const snapshottedCalibrationIds = new Set(
    (item.rawMaterialOrderMarginSnapshots ?? []).flatMap((record) => record.lossCalibrationIds ?? []).filter(Boolean),
  );
  return (item.rawMaterialCostLossCalibrations ?? []).some(
    (record) => !snapshottedCalibrationIds.has(record.lossCalibrationId) && record.marginEffect !== "margin_snapshot_pending_review",
  );
}

export function canReviewRawMaterialMarginSnapshot(item = {}) {
  const reportedSnapshotIds = new Set(
    (item.rawMaterialOrderMarginReports ?? []).flatMap((record) => record.marginSnapshotIds ?? []).filter(Boolean),
  );
  return (item.rawMaterialOrderMarginSnapshots ?? []).some((record) => {
    if (reportedSnapshotIds.has(record.marginSnapshotId)) return false;
    if (record.marginEffect === "reviewed_margin_report_snapshot" || record.reviewStatus === "已财务复核/报表可用") return false;
    const missingRevenue = (record.lineItems ?? []).some(
      (line) => Number(line.salesAmount || 0) <= 0 || line.marginStatus === "需补订单收入",
    );
    return !missingRevenue && !(record.warnings ?? []).some((warning) => String(warning).includes("缺少订单销售金额"));
  });
}

export function buildRawMaterialIssueOptions(item = {}, roll = null, productionTasks = [], standalone = false) {
  const targetTask = findRawMaterialProductionTaskCandidate(item, productionTasks);
  const machineId = standalone ? "" : targetTask?.machineId || (item.materialType === "提手" ? "提手备料区" : "BAG-01");
  return {
    rollId: roll?.id,
    machineId,
    productionTaskId: targetTask?.productionTaskId || "",
    partialIssue: false,
    issuePurpose: standalone ? "生产领料（首发阶段暂不关联订单）" : "生产领料",
    issuedWeightKg: roll?.weightKg || undefined,
    issuedQuantity: roll && !roll.weightKg ? 1 : undefined,
    note: standalone
      ? "杂工按卷码扫码出库；系统自动留存颜色、规格、宽幅和重量，首发阶段暂不关联订单或生产任务。"
      : targetTask?.productionTaskId
      ? `V1 按生产任务 ${targetTask.productionTaskId} 领料；等待生产报工确认消耗，不生成成品数量或成本分摊。`
      : "V1 整卷/整件机边领料；未匹配生产任务时只允许先形成机边留痕，成本分摊前必须补关联。",
  };
}

export function buildRawMaterialPartialIssueOptions(item = {}, roll = null, productionTasks = []) {
  const targetTask = findRawMaterialProductionTaskCandidate(item, productionTasks);
  const machineId = targetTask?.machineId || (item.materialType === "提手" ? "提手备料区" : "BAG-01");
  const fullWeight = Number(roll?.weightKg || 0);
  const issuedWeightKg = fullWeight > 0 ? Math.max(0.001, Math.round((fullWeight / 2) * 1000) / 1000) : undefined;
  return {
    rollId: roll?.id,
    machineId,
    productionTaskId: targetTask?.productionTaskId || "",
    issuePurpose: "生产领料",
    issuedWeightKg,
    partialIssue: true,
    note: targetTask?.productionTaskId
      ? `V1 按生产任务 ${targetTask.productionTaskId} 拆卷部分领料；剩余重量保留可用，等待后续称重复核和成本流程。`
      : "V1 拆卷部分领料；未匹配生产任务时只允许先形成机边留痕，成本分摊前必须补关联。",
  };
}

export function buildRawMaterialIssueTaskOptions(productionTasks = []) {
  return (Array.isArray(productionTasks) ? productionTasks : [])
    .map((task) => ({
      productionTaskId: task?.productionTaskId || task?.productionTask?.productionTaskId || task?.id || "",
      machineId: task?.machineId || task?.productionTask?.machineId || "",
      label: [
        task?.productionTaskId || task?.productionTask?.productionTaskId || task?.id,
        task?.orderLine?.productName || task?.productName || task?.productionTask?.taskType || "生产任务",
        task?.machineId || task?.productionTask?.machineId,
      ].filter(Boolean).join(" · "),
    }))
    .filter((task) => task.productionTaskId);
}

export function findRawMaterialProductionTaskOption(productionTasks = [], productionTaskId = "") {
  return buildRawMaterialIssueTaskOptions(productionTasks).find((task) => task.productionTaskId === productionTaskId) ?? null;
}

export function findRawMaterialProductionTaskCandidate(item = {}, productionTasks = []) {
  if (item.materialType === "提手") return null;
  const materialColorKey = normalizeRawMaterialColorKey(item.factoryColor || item.supplierColor);
  const rows = (Array.isArray(productionTasks) ? productionTasks : [])
    .filter((task) => task?.productionTaskId)
    .filter((task) => {
      const taskType = String(task.taskType || task.productionTask?.taskType || "");
      if (taskType.includes("丝印")) return false;
      const taskColorKey = normalizeRawMaterialColorKey(task.bagColor || task.color || task.orderLine?.bagColor);
      return !materialColorKey || !taskColorKey || materialColorKey === taskColorKey;
    })
    .sort((left, right) => {
      const leftPublished = left.publishedScheduleId ? 0 : 1;
      const rightPublished = right.publishedScheduleId ? 0 : 1;
      if (leftPublished !== rightPublished) return leftPublished - rightPublished;
      return String(left.productionTaskId).localeCompare(String(right.productionTaskId));
    });
  return rows[0] || null;
}

export function normalizeRawMaterialColorKey(value) {
  const text = String(value || "")
    .trim()
    .replace(/本白/g, "白")
    .replace(/大红/g, "红")
    .replace(/浅黄/g, "黄")
    .replace(/深黄/g, "黄")
    .replace(/色/g, "")
    .replace(/\s+/g, "");
  if (!text) return "";
  const hit = ["白", "黑", "红", "黄", "蓝", "绿", "灰", "粉", "紫", "橙"].find((token) => text.includes(token));
  return hit || text;
}

export function buildRawMaterialConsumptionOptions(item = {}, roll = null) {
  return {
    rollId: roll?.id,
    machineId: roll?.machineId || item.machineId || (item.materialType === "提手" ? "提手备料区" : "制袋机-01"),
    productionTaskId: roll?.productionTaskId || item.productionTaskId || "",
    consumedWeightKg: roll?.weightKg || undefined,
    consumedQuantity: roll && !roll.weightKg ? 1 : undefined,
    machineCount: "",
    qualifiedOutputQuantity: 0,
    note: "V1 只确认整卷/整件消耗；机台计数只作动作证据，不生成成品数量或成本分摊。",
  };
}

export function buildRawMaterialPartialConsumptionOptions(item = {}, roll = null) {
  const machineSideWeight = Number(roll?.weightKg || roll?.remainingMachineSideWeightKg || 0);
  const consumedWeightKg = machineSideWeight > 0 ? Math.max(0.001, Math.round((machineSideWeight / 2) * 1000) / 1000) : undefined;
  return {
    rollId: roll?.id,
    machineId: roll?.machineId || item.machineId || (item.materialType === "提手" ? "提手备料区" : "制袋机-01"),
    productionTaskId: roll?.productionTaskId || item.productionTaskId || "",
    consumedWeightKg,
    machineCount: "",
    qualifiedOutputQuantity: 0,
    partialConsumption: true,
    note: "V1 记录机边部分消耗，剩余重量仍在机边；机台计数只作动作证据，不生成成品数量或成本分摊。",
  };
}

export function buildRawMaterialLeftoverReturnOptions(item = {}, roll = null) {
  return {
    rollId: roll?.id,
    machineId: roll?.machineId || item.machineId || (item.materialType === "提手" ? "提手备料区" : "制袋机-01"),
    productionTaskId: roll?.productionTaskId || item.productionTaskId || "",
    leftoverWeightKg: roll?.weightKg || undefined,
    leftoverQuantity: roll && !roll.weightKg ? 1 : undefined,
    returnLocation: "余料区",
    reason: "机边余料退回",
    note: "V1 余料退回先进入待复核，不自动变可用库存，不做成本分摊。",
  };
}

export function buildRawMaterialLeftoverReviewOptions(_item = {}, roll = null) {
  const reviewedWeightKg = Number(roll?.leftoverWeightKg) || Number(roll?.weightKg) || undefined;
  return {
    rollId: roll?.id,
    reviewedWeightKg,
    reviewedQuantity: roll && !reviewedWeightKg ? Number(roll.leftoverQuantity || 1) : undefined,
    reviewLocation: "原料库-余料可用区",
    reason: "余料重新称重复核通过",
    note: "V1 余料复核只把退回余料转回可用原材料库存，不做成本分摊或毛利计算。",
  };
}

export function buildRawMaterialLossCalibrationOptions(item = {}) {
  const latestConfirmation = [...(item.rawMaterialCostAllocationConfirmations ?? [])].reverse()[0] ?? {};
  const expectedOutputQuantity = Number(latestConfirmation.confirmedQuantity || 0) || 1000;
  const actualQualifiedOutputQuantity = Math.max(0, Math.round(expectedOutputQuantity * 0.98));
  return {
    expectedOutputQuantity,
    actualQualifiedOutputQuantity,
    note: "V1 损耗校准第一版；先形成待毛利确认的成本校准快照，不自动更新订单毛利。",
  };
}

export function buildRawMaterialMarginSnapshotOptions() {
  return {
    note: "V1 订单毛利快照第一版；只供财务复核，不自动写客户对账或最终结算。",
  };
}

export function buildRawMaterialMarginReviewOptions() {
  return {
    note: "V1 毛利快照财务复核第一版；生成内部毛利报表，不自动写客户对账或收款结算。",
  };
}

export function getRawMaterialRollTone(roll = {}) {
  if (roll.inventoryStatus === "可用") return "success";
  if (roll.inventoryStatus === "机边领用") return "warning";
  if (roll.inventoryStatus === "已消耗") return "success";
  if (roll.inventoryStatus === "余料待复核") return "warning";
  if (roll.leftoverReviewRecordId) return "success";
  if (String(roll.inventoryStatus ?? "").includes("异常") || String(roll.labelStatus ?? "").includes("不符")) return "danger";
  return "neutral";
}

export function buildRawMaterialLabelVerificationDraft(item = {}, roll = {}) {
  return {
    rollId: roll.id || "",
    matchResult: "",
    checkedWeightKg: roll.weightKg ?? "",
    checkedColor: roll.factoryColor || item.factoryColor || item.supplierColor || "",
    checkedSpec: roll.spec || item.spec || "",
    location: "原料库-可用区",
    verificationNote: "",
  };
}

export function formatRawMaterialLabelVerification(roll = {}) {
  const verification = roll.labelVerification;
  if (!verification) return roll.labelStatus === "已打印待贴标" ? "待逐卷人工核对" : "未记录核对";
  const result = verification.matchResult === "mismatched" ? "实物不符，已隔离" : "实物一致";
  const version = verification.labelVersion || roll.labelVersion;
  const verifier = verification.verifiedByUserId || roll.labelVerifiedByUserId || "操作人待补";
  return `${result} · 标签V${version || "?"} · ${verifier}`;
}

export function formatRawMaterialOptionalAttachment(value) {
  const text = String(value || "").trim();
  if (!text) return "可选，非入库门禁";
  if (text.includes("待上传") || text.includes("待扫码") || text.includes("扫码上传") || text.includes("签单")) return "可选附件，未作为入库门禁";
  return text;
}

export function formatRawMaterialCost(item = {}, money) {
  const unitPrice = Number(item.unitPrice || 0);
  const amount = Number(item.amount || 0);
  const unit = item.unit || "单位";
  return `${money(unitPrice)}/${unit} / ${money(amount)}`;
}

export function buildRawMaterialInboundTimeline(item = {}) {
  const rows = [
    `${item.receivedAt || "到货时间未填"} 原材料送货单拍照${item.deliveryNoteNo ? "" : "（供应商未提供单号）"}`,
    item.ocrStatus || "OCR 待识别",
  ];
  if (item.reviewedAt) rows.push(`${formatRawMaterialTimelineTime(item.reviewedAt)} ${item.reviewedBy || "办公室"}复核原材料送货单`);
  if (item.labelPrintedAt) rows.push(`${formatRawMaterialTimelineTime(item.labelPrintedAt)} ${item.labelPrintedBy || "库房"}打印卷标`);
  const attached = (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "可用");
  if (attached.length) rows.push(`已贴标并逐卷人工核对 ${attached.length}/${item.rolls?.length || attached.length} 卷/件`);
  const split = (item.rawMaterialSplitRecords ?? []).length;
  if (split) rows.push(`已拆卷部分领料 ${split} 次；剩余重量仍保留库存状态`);
  const issued = (item.rawMaterialIssueRecords ?? []).length;
  if (issued) rows.push(`已机边领料 ${issued} 卷/件；等待生产报工确认消耗`);
  const consumed = (item.rawMaterialConsumptionRecords ?? []).length;
  if (consumed) rows.push(`已确认消耗 ${consumed} 卷/件；仍不生成成品数量或成本分摊`);
  const returned = (item.rawMaterialLeftoverReturnRecords ?? []).length;
  if (returned) rows.push(`已退回余料 ${returned} 卷/件；等待重新称重 / 复核`);
  const leftoverReviewed = (item.rawMaterialLeftoverReviewRecords ?? []).length;
  if (leftoverReviewed) rows.push(`余料复核通过 ${leftoverReviewed} 卷/件；已转回可用库存`);
  const lossCalibrations = (item.rawMaterialCostLossCalibrations ?? []).length;
  if (lossCalibrations) rows.push(`损耗校准 ${lossCalibrations} 次；仍需毛利报表确认`);
  const marginSnapshots = (item.rawMaterialOrderMarginSnapshots ?? []).length;
  if (marginSnapshots) rows.push(`毛利快照 ${marginSnapshots} 次；等待财务复核，不写最终结算`);
  const marginReports = (item.rawMaterialOrderMarginReports ?? []).length;
  if (marginReports) rows.push(`毛利报表 ${marginReports} 次；已财务复核，客户对账仍走独立流程`);
  rows.push(item.nextStep || "等待下一步");
  return rows;
}

export function formatRawMaterialIssueRecord(record = {}) {
  const quantity = Number(record.issuedWeightKg) > 0 ? `${record.issuedWeightKg}kg` : `${record.issuedQuantity || 1}${record.unit || "件"}`;
  const splitText = record.splitRecordId ? ` / 源卷 ${record.sourceRollId || "待补"} / 剩余 ${record.remainingWeightKg || 0}kg` : "";
  const machineSideRemaining = Number(record.remainingMachineSideWeightKg || 0) > 0 ? ` / 机边余 ${record.remainingMachineSideWeightKg}kg` : "";
  const taskMatch = record.productionTaskMatchStatus ? ` / ${record.productionTaskMatchStatus}${record.productionTaskId ? ` ${record.productionTaskId}` : ""}` : "";
  return `${record.issueRecordId || "领料记录"}：${record.rollId || "卷号待补"} / ${quantity}${splitText}${machineSideRemaining} / ${record.machineId || "机边待分配"}${taskMatch} / ${record.consumptionStatus || "待生产消耗确认"}`;
}

export function formatRawMaterialSplitRecord(record = {}) {
  const taskMatch = record.productionTaskMatchStatus ? ` / ${record.productionTaskMatchStatus}${record.productionTaskId ? ` ${record.productionTaskId}` : ""}` : "";
  return `${record.splitRecordId || "拆卷记录"}：${record.sourceRollId || "源卷待补"} -> ${record.issuedRollId || "机边卷待补"} / 领 ${record.issuedWeightKg || 0}kg / 余 ${record.remainingWeightKg || 0}kg / ${record.machineId || "机边待分配"}${taskMatch}`;
}

export function formatRawMaterialTaskMatch(item = {}) {
  const latestIssueRecord = [...(item.rawMaterialIssueRecords ?? [])].reverse()[0] ?? null;
  const status = item.productionTaskMatchStatus || latestIssueRecord?.productionTaskMatchStatus || "未关联生产任务";
  const taskId = item.productionTaskId || latestIssueRecord?.productionTaskId || "";
  const reason = item.productionTaskMatchReason || latestIssueRecord?.productionTaskMatchReason || "";
  const goodsSpec = item.productionTaskGoodsSpec || latestIssueRecord?.productionTaskGoodsSpec || "";
  return [status, taskId, goodsSpec, reason].filter(Boolean).join(" / ");
}

export function formatRawMaterialConsumptionRecord(record = {}) {
  const quantity = Number(record.consumedWeightKg) > 0 ? `${record.consumedWeightKg}kg` : `${record.consumedQuantity || 1}${record.unit || "件"}`;
  const remaining = Number(record.remainingMachineSideWeightKg || 0) > 0 ? ` / 机边余 ${record.remainingMachineSideWeightKg}kg` : "";
  return `${record.consumptionRecordId || "消耗记录"}：${record.rollId || "卷号待补"} / ${quantity}${remaining} / ${record.machineId || "机边待分配"} / ${record.consumptionStatus || "已确认消耗"}`;
}

export function formatRawMaterialLeftoverReturnRecord(record = {}) {
  const quantity = Number(record.leftoverWeightKg) > 0 ? `${record.leftoverWeightKg}kg` : `${record.leftoverQuantity || 1}${record.unit || "件"}`;
  const status = record.reviewStatus || record.consumptionStatus || "待复核";
  return `${record.leftoverReturnRecordId || "余料记录"}：${record.rollId || "卷号待补"} / ${quantity} / ${record.returnLocation || "余料区"} / ${status}`;
}

export function formatRawMaterialLeftoverReviewRecord(record = {}) {
  const quantity = Number(record.reviewedWeightKg) > 0 ? `${record.reviewedWeightKg}kg` : `${record.reviewedQuantity || 1}${record.unit || "件"}`;
  return `${record.leftoverReviewRecordId || "余料复核"}：${record.rollId || "卷号待补"} / ${quantity} / ${record.reviewLocation || "原料库-余料可用区"} / 可用`;
}

export function formatRawMaterialCostDraftSummary(item = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const count = item.rawMaterialCostAllocationDrafts?.length || item.costAllocationDraftCount || 0;
  if (!count) return "未生成";
  const status = item.costAllocationStatus || "成本草稿待复核";
  const amount = Number(item.costAllocationDraftAmount || 0);
  return canViewCost && amount > 0 ? `${status} / ${count} 条 / ${money(amount)}` : `${status} / ${count} 条`;
}

export function formatRawMaterialCostConfirmationSummary(item = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const count = item.rawMaterialCostAllocationConfirmations?.length || item.costAllocationConfirmedCount || 0;
  if (!count) return "未确认";
  const status = item.costAllocationReviewStatus || item.costAllocationStatus || "已复核/待损耗校准";
  const amount = Number(item.costAllocationConfirmedAmount || 0);
  return canViewCost && amount > 0 ? `${status} / ${count} 次 / ${money(amount)}` : `${status} / ${count} 次`;
}

export function formatRawMaterialLossCalibrationSummary(item = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const count = item.rawMaterialCostLossCalibrations?.length || item.lossCalibrationCount || 0;
  if (!count) return "待校准";
  const status = item.lossCalibrationStatus || item.costAllocationReviewStatus || "已校准/待毛利确认";
  const amount = Number(item.lossCalibrationAmount || 0);
  const rate = Number(item.lossCalibrationRatePercent || 0);
  const rateText = rate > 0 ? ` / 损耗 ${rate}%` : "";
  return canViewCost && amount > 0 ? `${status} / ${count} 次${rateText} / ${money(amount)}` : `${status} / ${count} 次${rateText}`;
}

export function formatRawMaterialMarginSnapshotSummary(item = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const count = item.rawMaterialOrderMarginSnapshots?.length || item.marginSnapshotCount || 0;
  if (!count) return "待生成";
  const status = item.marginSnapshotStatus || item.costAllocationReviewStatus || "已生成/待财务复核";
  const grossProfit = Number(item.marginSnapshotGrossProfitAmount || 0);
  const rate = Number(item.marginSnapshotGrossMarginRatePercent || 0);
  const rateText = rate ? ` / ${rate}%` : "";
  return canViewCost ? `${status} / ${count} 次 / 毛利 ${money(grossProfit)}${rateText}` : `${status} / ${count} 次`;
}

export function formatRawMaterialMarginReportSummary(item = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const count = item.rawMaterialOrderMarginReports?.length || item.marginReportCount || 0;
  if (!count) return "待复核";
  const status = item.marginReportStatus || item.costAllocationReviewStatus || "已生成内部毛利报表";
  const grossProfit = Number(item.marginReportGrossProfitAmount || item.marginSnapshotGrossProfitAmount || 0);
  const rate = Number(item.marginReportGrossMarginRatePercent || item.marginSnapshotGrossMarginRatePercent || 0);
  const rateText = rate ? ` / ${rate}%` : "";
  return canViewCost ? `${status} / ${count} 次 / 毛利 ${money(grossProfit)}${rateText}` : `${status} / ${count} 次`;
}

export function formatRawMaterialCostAllocationDraft(record = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const quantity = Number(record.allocatedWeightKg) > 0
    ? `${record.allocatedWeightKg}kg`
    : `${record.allocatedQuantity || 1}${record.unit || "件"}`;
  const amount = canViewCost ? ` / ${money(record.allocatedCostAmount || 0)}` : "";
  const task = record.productionTaskId ? ` / ${record.productionTaskId}` : "";
  const goods = record.productionTaskGoodsSpec ? ` / ${record.productionTaskGoodsSpec}` : "";
  return `${record.costAllocationDraftId || "成本草稿"}：${record.rollId || "卷号待补"} / ${quantity}${amount}${task}${goods} / ${record.allocationStatus || "草稿/待成本复核"}`;
}

export function formatRawMaterialCostAllocationConfirmation(record = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const quantity = Number(record.confirmedWeightKg) > 0
    ? `${record.confirmedWeightKg}kg`
    : `${record.confirmedQuantity || record.confirmedCount || 1}项`;
  const amount = canViewCost ? ` / ${money(record.confirmedCostAmount || 0)}` : "";
  const tasks = record.productionTaskIds?.length ? ` / ${record.productionTaskIds.join(",")}` : "";
  return `${record.costConfirmationId || "成本确认"}：${quantity}${amount}${tasks} / ${record.reviewStatus || "已复核/待损耗校准"}`;
}

export function formatRawMaterialCostLossCalibration(record = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const quantity = Number(record.actualQualifiedOutputQuantity || 0) > 0 && Number(record.expectedOutputQuantity || 0) > 0
    ? `${record.actualQualifiedOutputQuantity}/${record.expectedOutputQuantity} 合格`
    : `${record.confirmedWeightKg || record.confirmedCount || 1}项`;
  const amount = canViewCost ? ` / ${money(record.confirmedCostAmount || 0)}` : "";
  const rate = Number(record.lossRatePercent || 0) > 0 ? ` / 损耗 ${record.lossRatePercent}%` : "";
  const tasks = record.productionTaskIds?.length ? ` / ${record.productionTaskIds.join(",")}` : "";
  return `${record.lossCalibrationId || "损耗校准"}：${quantity}${amount}${rate}${tasks} / ${record.calibrationStatus || "已校准/待毛利确认"}`;
}

export function formatRawMaterialOrderMarginSnapshot(record = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const lineCount = record.lineItems?.length || record.orderLineIds?.length || 0;
  const amount = canViewCost
    ? ` / 收 ${money(record.totalSalesAmount || 0)} / 料 ${money(record.totalMaterialCostAmount || 0)} / 毛利 ${money(record.grossProfitAmount || 0)}`
    : "";
  const rate = canViewCost && Number(record.grossMarginRatePercent || 0) ? ` / ${record.grossMarginRatePercent}%` : "";
  const lines = record.orderLineIds?.length ? ` / ${record.orderLineIds.join(",")}` : "";
  return `${record.marginSnapshotId || "毛利快照"}：${lineCount || 1} 单${amount}${rate}${lines} / ${record.reviewStatus || "已生成/待财务复核"}`;
}

export function formatRawMaterialOrderMarginReport(record = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const lineCount = record.lineItems?.length || record.orderLineIds?.length || 0;
  const amount = canViewCost
    ? ` / 收 ${money(record.totalSalesAmount || 0)} / 料 ${money(record.totalMaterialCostAmount || 0)} / 毛利 ${money(record.grossProfitAmount || 0)}`
    : "";
  const rate = canViewCost && Number(record.grossMarginRatePercent || 0) ? ` / ${record.grossMarginRatePercent}%` : "";
  const snapshots = record.marginSnapshotIds?.length ? ` / 快照 ${record.marginSnapshotIds.join(",")}` : "";
  return `${record.marginReportId || "毛利报表"}：${lineCount || 1} 单${amount}${rate}${snapshots} / ${record.reviewStatus || "已财务复核/报表可用"}`;
}

export function formatRawMaterialTimelineTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function formatRawMaterialStructuredSpec(item = {}) {
  const display = String(item.specDisplay || item.spec || "未填规格").trim();
  const raw = String(item.specRaw || item.spec || "").trim();
  return raw && display !== raw ? `${display}（原始：${raw}）` : display;
}

export function formatRawMaterialOrderSupport(support, task) {
  if (!task) return "未关联订单；选择订单后按颜色、宽幅和可用重量判断";
  if (!support || support.supportStatus === "需复核") return `${task.productionTaskId || "订单"}：尺寸/颜色待复核`;
  if (support.supportStatus === "支持订单") {
    return `${task.productionTaskId || "订单"}：支持，需${support.requiredWeightKg}kg / 可用${support.availableWeightKg}kg`;
  }
  return `${task.productionTaskId || "订单"}：不足${support.shortageWeightKg}kg（需${support.requiredWeightKg}kg）`;
}
