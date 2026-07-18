import { formatOperationalError } from "../../shared/ui/errorPresentation.js";

export function isProductionReportCandidate(line) {
  const status = String(line?.status ?? line?.lineStatus ?? "");
  if (!line || String(line.orderType ?? "").includes("外加工")) return false;
  return (
    status.includes("制袋") ||
    status.includes("丝印") ||
    status.includes("待排产") ||
    status.includes("待补印") ||
    status.includes("跨日继续") ||
    status.includes("待完工确认") ||
    status.includes("异常暂停") ||
    status.includes("数量差异待处理") ||
    status.includes("已作废")
  );
}

export function findFocusedProductionLine(orderLines, focusTarget, buildProductionTaskId) {
  if (!focusTarget) return null;
  const orderLineId = String(focusTarget.orderLineId ?? "").trim();
  const taskId = String(focusTarget.taskId ?? focusTarget.productionTaskId ?? "").trim();
  return (orderLines ?? []).find((line) => {
    const lineId = String(line?.id ?? line?.orderLineId ?? "").trim();
    return (orderLineId && lineId === orderLineId) || (taskId && buildProductionTaskId(line) === taskId);
  }) ?? null;
}

export function getProductionPackingFocusNotice(focusTarget, context) {
  if (!focusTarget?.focusKey) return "";
  const sourceId = String(focusTarget.sourceId ?? "").trim();
  if (focusTarget.mode === "packing") {
    const selectedTaskId = String(context.selectedPackingTask?.packingTaskId ?? "").trim();
    if (selectedTaskId && selectedTaskId === String(focusTarget.taskId ?? "").trim()) {
      return `库存流水定位：${focusTarget.sourceLabel || "打包完成"} / ${sourceId}`;
    }
  }
  if (focusTarget.mode === "production") {
    const selectedLine = context.selectedProductionLine;
    const selectedTaskId = selectedLine ? context.buildProductionTaskId(selectedLine) : "";
    const selectedLineId = String(selectedLine?.id ?? "").trim();
    if (
      selectedTaskId === String(focusTarget.taskId ?? "").trim() ||
      (selectedLineId && selectedLineId === String(focusTarget.orderLineId ?? "").trim())
    ) {
      return `库存流水定位：${focusTarget.sourceLabel || "生产报工"} / ${sourceId}`;
    }
  }
  return "";
}

export function getVisibleProductionPackingSourceDetail(sourceDetailState, context) {
  if (!sourceDetailState?.requestedType || !sourceDetailState?.requestedId) return null;
  if (context.detailMode === "production" && sourceDetailState.requestedType === "production") {
    const selectedTaskId = context.selectedProductionLine ? context.buildProductionTaskId(context.selectedProductionLine) : "";
    if (selectedTaskId && selectedTaskId === sourceDetailState.requestedId) return sourceDetailState;
  }
  if (context.detailMode === "packing" && sourceDetailState.requestedType === "packing") {
    const selectedTaskId = String(context.selectedPackingTask?.packingTaskId ?? "").trim();
    if (selectedTaskId && selectedTaskId === sourceDetailState.requestedId) return sourceDetailState;
  }
  return null;
}

export function buildProductionPackingSourceDetailRows(detailState, detailMode) {
  if (detailState?.loading) {
    return [
      ["读取状态", "正在读取后端详情"],
      ["来源任务", detailState.requestedId],
    ];
  }

  if (detailState?.error && !detailState?.detail) {
    return [
      ["读取状态", detailState.error],
      ["来源任务", detailState.requestedId],
    ];
  }

  const detail = detailState?.detail;
  if (!detail) {
    return [["读取状态", "暂无来源详情"]];
  }

  if (detailMode === "packing") {
    const task = detail.packingTask ?? {};
    const packageCount = detail.packages?.length || task.packageCount || 0;
    return [
      ["任务状态", task.status || "未同步"],
      ["实际/计划", `${Number(task.actualPackedQty ?? 0)} / ${Number(task.plannedQty ?? 0)}`],
      ["包裹", `${packageCount} 包`],
      ["交付状态", detail.fulfillment?.status || "未生成"],
      ["库存流水", `${detail.inventoryLedgerEntries?.length ?? 0} 条`],
      ["库存扣减", detail.inventoryDeducted ? "已扣减" : "未扣减，出库/拉走再扣"],
    ];
  }

  const task = detail.productionTask ?? {};
  const report = detail.latestReport ?? detail.reports?.[0] ?? {};
  const machineCountLabel =
    report.machineCount === null || report.machineCount === undefined || report.machineCount === ""
      ? "未填"
      : `${report.machineCount}（动作次数，不入库）`;
  return [
    ["任务状态", task.taskStatus || task.status || "未同步"],
    ["报工单", report.reportId || "未生成"],
    ["合格/异常", `${Number(report.qualifiedQty ?? 0)} / ${Number(report.exceptionQty ?? 0)}`],
    ["机器计数", machineCountLabel],
    ["库存流水", `${detail.inventoryLedgerEntries?.length ?? 0} 条`],
    ["后续打包", detail.packingTask?.packingTaskId || "未生成"],
  ];
}

export function getProductionPackingDetailSourceLabel(source) {
  if (source === "api") return "后端 API";
  if (source === "local_fallback") return "本地降级";
  if (source === "api_error") return "后端错误";
  return "本地状态";
}

export function isProductionPackingTaskListFromApi(productionPacking) {
  return productionPacking?.taskListSource === "api";
}

export function getProductionPackingTaskListStatusText(productionPacking) {
  if (productionPacking?.taskListLoading) return "任务池刷新中";
  const source = productionPacking?.taskListSource ?? "local";
  const time = productionPacking?.taskListLastSyncedAt ? ` · ${productionPacking.taskListLastSyncedAt}` : "";
  if (productionPacking?.taskListError) return `任务池异常：${formatOperationalError(productionPacking.taskListError)}`;
  if (source === "api") return `后端任务池${time}`;
  if (source === "api_error") return `后端任务池异常${time}`;
  if (source === "local_fallback") return `本地降级任务池${time}`;
  return "本地任务池";
}

export function getProductionScheduleQueueStatusText(productionPacking) {
  if (productionPacking?.taskListLoading) return "排产队列刷新中";
  const source = productionPacking?.scheduleQueueSource ?? "local";
  const time = productionPacking?.scheduleQueueLastSyncedAt ? ` · ${productionPacking.scheduleQueueLastSyncedAt}` : "";
  if (productionPacking?.scheduleQueueError) return `排产队列异常：${formatOperationalError(productionPacking.scheduleQueueError)}`;
  if (source === "api") return `机台队列${time}`;
  if (source === "api_error") return `机台队列异常${time}`;
  if (source === "local_fallback") return `本地降级队列${time}`;
  return "本地队列";
}

export function formatProductionScheduleQueueSpec(item) {
  const product = String(item?.productName ?? "").trim() || "未匹配货品";
  const size = String(item?.size ?? "").trim();
  const colorParts = [
    String(item?.bagColor ?? "").trim(),
    String(item?.handleType ?? "").trim(),
    String(item?.style ?? "").trim(),
  ].filter(Boolean);
  return [product, size, colorParts.join("/")].filter(Boolean).join(" ");
}

export function formatProductionScheduleQueueQty(item) {
  const plannedQty = Math.max(0, Math.trunc(Number(item?.plannedQty ?? 0)));
  const remainingQty = Math.max(0, Math.trunc(Number(item?.remainingQty ?? plannedQty)));
  return `计划 ${plannedQty} / 剩 ${remainingQty}`;
}

export const queueMoveReasonOptions = [
  { value: "supervisor_order", label: "主管安排" },
  { value: "urgent_insert", label: "急单插入" },
  { value: "delivery_risk", label: "交期风险" },
  { value: "material_wait", label: "等料调整" },
  { value: "machine_issue", label: "机器问题" },
  { value: "capacity_balance", label: "机台平衡" },
  { value: "other", label: "其他" },
];

export function getQueueMoveReason(reasonCode) {
  const safeReasonCode = String(reasonCode ?? "").trim();
  return queueMoveReasonOptions.find((item) => item.value === safeReasonCode) ?? queueMoveReasonOptions[0];
}

export function getQueueMoveImpactSummary({
  selectedItem,
  sourceItems,
  sourceIndex,
  targetMachineId,
  targetItems,
  targetSeq,
  reasonLabel,
}) {
  if (!selectedItem) {
    return {
      text: "影响预览：先选择机台排产队列中的任务。",
      remark: "未选择队列任务，未计算影响范围",
    };
  }

  const safeReasonLabel = String(reasonLabel ?? "").trim() || "未填原因";
  const sourceMachineId = String(selectedItem.machineId ?? "").trim() || "未分配";
  const targetMachine = String(targetMachineId ?? "").trim() || "未分配";
  const safeTargetSeq = Math.max(1, Math.trunc(Number(targetSeq ?? 1)));
  const selectedSeq = Math.max(1, Math.trunc(Number(selectedItem.queueSeq ?? sourceIndex + 1)));
  const sourceRows = Array.isArray(sourceItems) ? sourceItems : [];
  const targetRows = Array.isArray(targetItems) ? targetItems : [];
  const sourceItemIndex = sourceIndex >= 0 ? sourceIndex : sourceRows.findIndex((item) => item.productionTaskId === selectedItem.productionTaskId);
  const sameMachine = sourceMachineId === targetMachine;

  if (sameMachine) {
    const affectedCount = Math.abs(selectedSeq - safeTargetSeq);
    const summary = `${sourceMachineId} 内从 #${selectedSeq} 插到 #${safeTargetSeq}，约 ${affectedCount} 条任务顺序受影响`;
    return {
      text: `影响预览：${safeReasonLabel}，${summary}。`,
      remark: summary,
    };
  }

  const sourceAffectedCount = sourceItemIndex >= 0 ? Math.max(0, sourceRows.length - sourceItemIndex - 1) : 0;
  const targetAffectedCount = Math.max(0, targetRows.length - safeTargetSeq + 1);
  const summary = `${sourceMachineId} 移出后 ${sourceAffectedCount} 条重排；${targetMachine} 插入 #${safeTargetSeq} 后 ${targetAffectedCount} 条顺延`;
  return {
    text: `影响预览：${safeReasonLabel}，${summary}。`,
    remark: summary,
  };
}

export function getProductionScheduleRecordSourceLabel(source) {
  const safeSource = String(source ?? "").trim();
  if (safeSource === "manual_resequence") return "手工调序";
  if (safeSource === "machine_reassignment") return "换机台";
  if (safeSource === "queue_insert") return "手工插队";
  return "";
}

export function formatProductionScheduleQueueStatus(item) {
  const base = `${item?.queueReason || "已发布排产"} / ${item?.status || "待执行"}`;
  const sourceLabel = getProductionScheduleRecordSourceLabel(item?.scheduleRecordSource);
  return sourceLabel ? `${base} · ${sourceLabel}` : base;
}

export function findScheduleQueueItemForLine(queueItems, line, buildProductionTaskId) {
  if (!line) return null;
  const lineTaskId = buildProductionTaskId(line);
  return queueItems.find((item) =>
    item.orderLineId === line.id ||
    item.orderLineId === line.orderLineId ||
    item.productionTaskId === line.productionTaskId ||
    item.productionTaskId === lineTaskId
  ) ?? null;
}

export function sortScheduleQueueItemsBySeq(left, right) {
  const leftSeq = Math.max(0, Math.trunc(Number(left?.queueSeq ?? 0)));
  const rightSeq = Math.max(0, Math.trunc(Number(right?.queueSeq ?? 0)));
  if (leftSeq !== rightSeq) return leftSeq - rightSeq;
  return String(left?.productionTaskId ?? "").localeCompare(String(right?.productionTaskId ?? ""));
}

export function getScheduleQueueMachineOptions(queueItems, productionLines) {
  const machineIds = new Set();
  const addMachineId = (value) => {
    const machineId = String(value ?? "").trim();
    if (machineId) machineIds.add(machineId);
  };

  for (const item of queueItems ?? []) addMachineId(item?.machineId);
  for (const line of productionLines ?? []) addMachineId(getProductionMachineIdLabel(line));
  for (const fallbackMachineId of ["BAG-01", "BAG-02", "PRINT-01"]) addMachineId(fallbackMachineId);

  return [...machineIds].sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));
}

export function getDefaultQueueMoveTargetMachineId(machineOptions, sourceMachineId) {
  const safeSourceMachineId = String(sourceMachineId ?? "").trim();
  return machineOptions.find((machineId) => machineId && machineId !== safeSourceMachineId) ?? machineOptions[0] ?? "";
}

export function getScheduleQueueItemsForMachine(queueItems, machineId, excludedProductionTaskId) {
  const safeMachineId = String(machineId ?? "").trim();
  const safeExcludedProductionTaskId = String(excludedProductionTaskId ?? "").trim();
  if (!safeMachineId) return [];
  return (queueItems ?? [])
    .filter((item) => {
      const itemMachineId = String(item?.machineId ?? "").trim();
      const itemProductionTaskId = String(item?.productionTaskId ?? "").trim();
      return itemMachineId === safeMachineId && itemProductionTaskId !== safeExcludedProductionTaskId;
    })
    .sort(sortScheduleQueueItemsBySeq);
}

export function getQueueMovePositionOptions(targetItems) {
  const count = Math.max(1, (targetItems ?? []).length + 1);
  return Array.from({ length: count }, (_, index) => index + 1);
}

export function getNormalizedQueueMoveSeq(value, optionCount) {
  const maxSeq = Math.max(1, Math.trunc(Number(optionCount ?? 1)));
  const seq = Math.trunc(Number(value ?? 1));
  if (!Number.isFinite(seq) || seq < 1) return 1;
  return Math.min(seq, maxSeq);
}

export function moveScheduleQueueItem(items, productionTaskId, direction) {
  const rows = [...(items ?? [])].sort(sortScheduleQueueItemsBySeq);
  const currentIndex = rows.findIndex((item) => item.productionTaskId === productionTaskId);
  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= rows.length) return [];
  const nextRows = [...rows];
  [nextRows[currentIndex], nextRows[nextIndex]] = [nextRows[nextIndex], nextRows[currentIndex]];
  return nextRows;
}

export function buildPackingTaskRows({ orderLines, packingTasks, includeLocalProjections = true }) {
  const rows = [];
  const seen = new Set();
  for (const task of packingTasks ?? []) {
    const packingTaskId = String(task?.packingTaskId ?? "").trim();
    if (!packingTaskId) continue;
    const line = orderLines.find((item) => item.id === task.orderLineId || item.orderLineId === task.orderLineId) ?? task.orderLine;
    if (!line) continue;
    rows.push({
      ...task,
      orderLine: line,
      plannedQty: Number(task.plannedQty ?? line.qty ?? 0),
      packageCount: Number(task.packageCount ?? 0) || inferPackageCountFromQty(task.plannedQty ?? line.qty),
    });
    seen.add(packingTaskId);
  }
  if (!includeLocalProjections) return rows;
  for (const line of orderLines.filter((item) => String(item.status ?? "").includes("待打包"))) {
    const packingTaskId = `PKT-${line.id}`;
    if (seen.has(packingTaskId)) continue;
    rows.push({
      packingTaskId,
      orderLineId: line.id,
      orderLine: line,
      plannedQty: Number(line.qty ?? 0),
      actualPackedQty: 0,
      packageCount: inferPackageCountFromQty(line.qty),
      status: "待打包",
      source: "local_projection",
    });
  }
  return rows;
}

export function getProductionProcessLabel(line) {
  if (line?.taskType) return line.taskType;
  const status = String(line?.status ?? "");
  if (status.includes("丝印") || status.includes("补印")) return "丝印";
  return "制袋";
}

export function getProductionMachineIdLabel(line) {
  const machineId = String(line?.machineId ?? line?.productionTask?.machineId ?? "").trim();
  if (machineId) return machineId;
  return getProductionProcessLabel(line) === "丝印" ? "PRINT-01" : "BAG-01";
}

export function getProductionPublishedScheduleId(line) {
  return String(line?.publishedScheduleId ?? line?.productionTask?.publishedScheduleId ?? "").trim();
}

export function getProductionDailyProgress(line) {
  const progress = line?.dailyProgress;
  if (!progress || typeof progress !== "object") return null;
  const cumulativeQualifiedQty = Number(progress.cumulativeQualifiedQty ?? 0);
  const remainingQty = Number(progress.remainingQty ?? 0);
  if (!Number.isFinite(cumulativeQualifiedQty) && !Number.isFinite(remainingQty)) return null;
  return progress;
}

export function formatProductionDailyProgressLabel(line) {
  const progress = getProductionDailyProgress(line);
  if (!progress) return "";
  const cumulativeQualifiedQty = Math.max(0, Math.trunc(Number(progress.cumulativeQualifiedQty ?? 0)));
  const remainingQty = Math.max(0, Math.trunc(Number(progress.remainingQty ?? 0)));
  const latestDailyQualifiedQty = Math.max(0, Math.trunc(Number(progress.latestDailyQualifiedQty ?? 0)));
  const prefix = latestDailyQualifiedQty > 0 ? `今日 ${latestDailyQualifiedQty}` : "已报";
  return `${prefix} / 累计 ${cumulativeQualifiedQty} / 剩 ${remainingQty}`;
}

export function getProductionFinishedGoodsPhoto(line) {
  const photo = line?.finishedGoodsPhoto ?? line?.productionTask?.finishedGoodsPhoto ?? null;
  if (!photo || typeof photo !== "object") {
    return {
      status: "未上传",
      required: isProductionFinishedGoodsPhotoRequired(line),
      attachmentId: "",
      fileName: "",
      uploadedAt: "",
      uploadedBy: "",
      reviewedAt: "",
      reviewedBy: "",
      rejectedReason: "",
      history: [],
    };
  }
  return {
    status: String(photo.status || "未上传").trim(),
    required: photo.required === true || isProductionFinishedGoodsPhotoRequired(line),
    attachmentId: String(photo.attachmentId || "").trim(),
    fileName: String(photo.fileName || "").trim(),
    uploadedAt: String(photo.uploadedAt || "").trim(),
    uploadedBy: String(photo.uploadedBy || "").trim(),
    reviewedAt: String(photo.reviewedAt || "").trim(),
    reviewedBy: String(photo.reviewedBy || "").trim(),
    rejectedReason: String(photo.rejectedReason || "").trim(),
    history: Array.isArray(photo.history) ? photo.history : [],
  };
}

export function isProductionFinishedGoodsPhotoRequired(line) {
  const orderType = String(line?.orderType ?? "").trim();
  const printFlag = String(line?.print ?? line?.printFlag ?? "").trim();
  const status = String(line?.status ?? line?.lineStatus ?? "").trim();
  return orderType.includes("定制") || orderType.includes("印刷") || printFlag === "是" || status.includes("丝印") || status.includes("制袋");
}

export function formatProductionFinishedGoodsPhotoLabel(photo) {
  if (!photo?.attachmentId) return photo?.required ? "必须上传 / 未上传" : "不强制 / 未上传";
  const fileLabel = photo.fileName || photo.attachmentId;
  return `${photo.status || "待确认"} / ${fileLabel}`;
}

export function getProductionFinishedGoodsPhotoTone(photo) {
  if (photo?.status === "已接受") return "success";
  if (photo?.status === "需重拍") return "danger";
  if (photo?.attachmentId || photo?.status === "待确认") return "warning";
  return "neutral";
}

export function formatCompactDateTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return text.slice(5, 16).replace("T", " ");
}

export const PRINT_WORKSPACE_TABS = [
  { value: "qa", label: "设备验收", summary: "样张、对位、扫码和回写" },
  { value: "readiness", label: "上线门禁", summary: "配置、设备和现场证据" },
  { value: "diagnostics", label: "驱动诊断", summary: "命令桥、CUPS和状态回读" },
  { value: "jobs", label: "打印作业", summary: "派发、失败重试和作业状态" },
];

export function buildPrintWorkspaceItems({ printerDeviceQa = {}, printDriverReadiness = {}, printDriverConfig = {}, printJobQueue = {} }) {
  const qaChecks = Array.isArray(printerDeviceQa.checks) ? printerDeviceQa.checks : [];
  const qaPassedCount = qaChecks.filter((item) => ["passed", "通过", "已通过"].includes(String(item.status ?? ""))).length;
  const readiness = printDriverReadiness.readiness;
  const readinessBlockingCount = Number(readiness?.summary?.blockingCount ?? 0);
  const driverConfig = printDriverConfig.config;
  const driverReady = Boolean(driverConfig?.realDispatchAvailable && driverConfig?.commandBridgeStatusReadbackAvailable);
  const printJobs = Array.isArray(printJobQueue.items) ? printJobQueue.items.filter(Boolean) : [];
  const failedPrintJobCount = printJobs.filter((item) => item.jobStatus === "failed").length;
  const queuedPrintJobCount = printJobs.filter((item) => item.jobStatus === "queued").length;
  const stateByValue = {
    qa: printerDeviceQa.error
      ? { status: "验收异常", tone: "danger", meta: `${qaChecks.length} 项` }
      : printerDeviceQa.latestRecord
        ? { status: "已记录", tone: "success", meta: `${qaPassedCount}/${qaChecks.length} 通过` }
        : { status: "待验收", tone: "warning", meta: `${qaPassedCount}/${qaChecks.length} 通过` },
    readiness: printDriverReadiness.error
      ? { status: "门禁异常", tone: "danger", meta: "需刷新" }
      : readiness?.ready
        ? { status: "可验收", tone: "success", meta: "0 项阻塞" }
        : readiness
          ? { status: "未就绪", tone: "danger", meta: `${readinessBlockingCount} 项阻塞` }
          : { status: "未读取", tone: "neutral", meta: "待刷新" },
    diagnostics: printDriverConfig.error
      ? { status: "配置异常", tone: "danger", meta: "需检查" }
      : driverReady
        ? { status: "命令桥+回读", tone: "success", meta: "可联调" }
        : driverConfig
          ? { status: "待配置", tone: "warning", meta: "未就绪" }
          : { status: "未读取", tone: "neutral", meta: "待刷新" },
    jobs: failedPrintJobCount
      ? { status: "存在失败", tone: "danger", meta: `${failedPrintJobCount} 失败` }
      : queuedPrintJobCount
        ? { status: "待派发", tone: "warning", meta: `${queuedPrintJobCount} 排队` }
        : { status: printJobs.length ? "无阻塞" : "暂无作业", tone: printJobs.length ? "success" : "neutral", meta: `${printJobs.length} 条` },
  };
  return PRINT_WORKSPACE_TABS.map((item) => ({ ...item, ...stateByValue[item.value] }));
}

export function getNumericInput(inputs, id, field, fallback) {
  if (!id) return fallback ?? "";
  return inputs[id]?.[field] ?? fallback ?? "";
}

export function getBooleanInput(inputs, id, field, fallback) {
  if (!id) return Boolean(fallback);
  return inputs[id]?.[field] ?? Boolean(fallback);
}

export function inferPackageCountFromQty(qty) {
  const amount = Number(qty || 0);
  if (amount >= 1800) return 4;
  if (amount >= 1000) return 3;
  if (amount >= 500) return 2;
  return 1;
}
