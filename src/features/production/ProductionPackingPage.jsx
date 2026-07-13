import { useEffect, useRef, useState } from "react";
import {
  DataState,
  DataTable,
  DetailPane,
  InfoGrid,
  MetricStrip,
  OperationalPanel,
  PanelHeader,
  StatusPill,
  Timeline,
} from "../../shared/ui/operational.jsx";
import {
  buildPackingTaskRows,
  buildProductionPackingSourceDetailRows,
  findFocusedProductionLine,
  findScheduleQueueItemForLine,
  formatCompactDateTime,
  formatProductionDailyProgressLabel,
  formatProductionFinishedGoodsPhotoLabel,
  formatProductionScheduleQueueQty,
  formatProductionScheduleQueueSpec,
  formatProductionScheduleQueueStatus,
  getBooleanInput,
  getDefaultQueueMoveTargetMachineId,
  getNormalizedQueueMoveSeq,
  getNumericInput,
  getProductionDailyProgress,
  getProductionFinishedGoodsPhoto,
  getProductionFinishedGoodsPhotoTone,
  getProductionMachineIdLabel,
  getProductionPackingDetailSourceLabel,
  getProductionPackingFocusNotice,
  getProductionPackingTaskListStatusText,
  getProductionProcessLabel,
  getProductionPublishedScheduleId,
  getProductionScheduleQueueStatusText,
  getQueueMoveImpactSummary,
  getQueueMovePositionOptions,
  getQueueMoveReason,
  getScheduleQueueItemsForMachine,
  getScheduleQueueMachineOptions,
  getVisibleProductionPackingSourceDetail,
  inferPackageCountFromQty,
  isProductionFinishedGoodsPhotoRequired,
  isProductionPackingTaskListFromApi,
  isProductionReportCandidate,
  moveScheduleQueueItem,
  queueMoveReasonOptions,
  sortScheduleQueueItemsBySeq,
} from "./productionPackingPresentation.js";
import { PrinterDeviceQaPanel, PrintJobQueuePanel } from "./ProductionPrintDevicePanels.jsx";
import { PrintDriverV1ReadinessPanel } from "./ProductionPrintReadinessPanel.jsx";
import { PrintDriverDiagnosticsPanel } from "./ProductionPrintDiagnosticsPanel.jsx";

const PRODUCTION_WORKBENCH_TABS = [
  { value: "production", label: "生产任务" },
  { value: "packing", label: "打包任务" },
  { value: "print", label: "打印与设备" },
];

export function ProductionPackingPage({
  orderLines,
  inventoryRecords,
  productionPacking,
  focusTarget,
  sourceDetailState,
  printerDeviceQa,
  printJobQueue,
  printDriverConfig,
  printDriverReadiness,
  printDriverCupsDiagnostics,
  onAction,
  onRefreshPrintDriverConfig,
  onRefreshPrintDriverReadiness,
  onRefreshPrinterDeviceQa,
  onSelectPrinterDeviceQaDevice,
  onChangePrinterDeviceQaField,
  onChangePrinterDeviceQaCheck,
  onChangePrinterDeviceQaEvidenceField,
  onSavePrinterDeviceMode,
  onSavePrinterDeviceQa,
  onRefreshPrintJobs,
  onDispatchPrintJob,
  onRetryPrintJob,
  helpers,
}) {
  const {
    buildProductionTaskId,
    findCustomer,
    findProductionInventoryItem,
    getLineColorSpecLabel,
    getLinePrintSide,
    getLineRemark,
    getUiActionState,
    statusTone,
  } = helpers;
  const taskListFromApi = isProductionPackingTaskListFromApi(productionPacking);
  const taskListStatusText = getProductionPackingTaskListStatusText(productionPacking);
  const apiProductionLines = Array.isArray(productionPacking.productionTasks) ? productionPacking.productionTasks.filter(Boolean) : [];
  const baseProductionLines = taskListFromApi ? apiProductionLines.filter(isProductionReportCandidate) : orderLines.filter(isProductionReportCandidate);
  const focusedProductionLine =
    focusTarget?.mode === "production"
      ? findFocusedProductionLine([...apiProductionLines, ...orderLines], focusTarget, buildProductionTaskId)
      : null;
  const productionLines =
    focusedProductionLine && !baseProductionLines.some((line) => line.id === focusedProductionLine.id)
      ? [focusedProductionLine, ...baseProductionLines]
      : baseProductionLines;
  const packingTasks = buildPackingTaskRows({
    orderLines,
    packingTasks: productionPacking.packingTasks,
    includeLocalProjections: !taskListFromApi,
  });
  const lastAppliedFocusKeyRef = useRef("");
  const [selectedProductionLineId, setSelectedProductionLineId] = useState(productionLines[0]?.id ?? "");
  const [selectedPackingTaskId, setSelectedPackingTaskId] = useState(packingTasks[0]?.packingTaskId ?? "");
  const [activeWorkbenchTab, setActiveWorkbenchTab] = useState(productionLines.length ? "production" : "packing");
  const [productionTaskPriority, setProductionTaskPriority] = useState("attention");
  const [reportInputs, setReportInputs] = useState({});
  const [packingInputs, setPackingInputs] = useState({});
  const [queueMoveDraft, setQueueMoveDraft] = useState({
    targetMachineId: "",
    targetQueueSeq: "1",
    reasonCode: "supervisor_order",
  });
  const resolveInventoryItem = (line, task = null) => findProductionInventoryItem(line, inventoryRecords) ?? line?.inventoryItem ?? task?.inventoryItem ?? null;
  const isAttentionProductionLine = (line) => !resolveInventoryItem(line) || line.confidence === "medium";
  const productionAttentionCount = productionLines.filter(isAttentionProductionLine).length;
  const productionTaskCards = [...productionLines].sort((left, right) => {
    const leftAttention = Number(isAttentionProductionLine(left));
    const rightAttention = Number(isAttentionProductionLine(right));
    return productionTaskPriority === "attention" ? rightAttention - leftAttention : leftAttention - rightAttention;
  });
  const selectedProductionLine = productionTaskCards.find((item) => item.id === selectedProductionLineId) ?? productionTaskCards[0] ?? null;
  const selectedPackingTask = packingTasks.find((item) => item.packingTaskId === selectedPackingTaskId) ?? packingTasks[0] ?? null;
  const detailMode = activeWorkbenchTab === "packing" && selectedPackingTask ? "packing" : "production";
  const detailLine = activeWorkbenchTab === "print" ? null : detailMode === "packing" ? selectedPackingTask?.orderLine : selectedProductionLine;
  const detailInventoryItem = detailLine ? resolveInventoryItem(detailLine, selectedPackingTask) : null;
  const reportState = getUiActionState("productionPacking", "报工完成");
  const reportDailyState = getUiActionState("productionPacking", "报当日数量");
  const publishScheduleState = getUiActionState("productionPacking", "发布排产");
  const uploadFinishedPhotoState = getUiActionState("productionPacking", "上传成品图");
  const acceptFinishedPhotoState = getUiActionState("productionPacking", "确认成品图");
  const rejectFinishedPhotoState = getUiActionState("productionPacking", "退回成品图");
  const packingState = getUiActionState("productionPacking", "提交打包完成");
  const reportQualifiedQty = getNumericInput(reportInputs, selectedProductionLine?.id, "qualifiedQty", selectedProductionLine?.qty ?? 0);
  const reportExceptionQty = getNumericInput(reportInputs, selectedProductionLine?.id, "exceptionQty", 0);
  const reportMachineCount = getNumericInput(reportInputs, selectedProductionLine?.id, "machineCount", "");
  const packingActualQty = getNumericInput(packingInputs, selectedPackingTask?.packingTaskId, "actualPackedQty", selectedPackingTask?.plannedQty ?? 0);
  const packingPackageCount = getNumericInput(packingInputs, selectedPackingTask?.packingTaskId, "packageCount", selectedPackingTask?.packageCount ?? inferPackageCountFromQty(selectedPackingTask?.plannedQty));
  const packingLabelsPrinted = getBooleanInput(packingInputs, selectedPackingTask?.packingTaskId, "labelsPrinted", false);
  const selectedProductionCanReport = selectedProductionLine ? isProductionReportCandidate(selectedProductionLine) : false;
  const selectedPublishedScheduleId = getProductionPublishedScheduleId(selectedProductionLine);
  const selectedProductionMachineId = getProductionMachineIdLabel(selectedProductionLine);
  const selectedFinishedGoodsPhoto = getProductionFinishedGoodsPhoto(selectedProductionLine);
  const selectedFinishedGoodsPhotoRequired = isProductionFinishedGoodsPhotoRequired(selectedProductionLine);
  const scheduleQueueItems = Array.isArray(productionPacking.scheduleQueueItems)
    ? productionPacking.scheduleQueueItems.filter(Boolean)
    : [];
  const scheduleQueueStatusText = getProductionScheduleQueueStatusText(productionPacking);
  const sequenceState = getUiActionState("productionPacking", "调整排产顺序");
  const selectedScheduleQueueItem = findScheduleQueueItemForLine(scheduleQueueItems, selectedProductionLine, buildProductionTaskId);
  const selectedMachineScheduleQueueItems = selectedScheduleQueueItem
    ? scheduleQueueItems
        .filter((item) => item.machineId === selectedScheduleQueueItem.machineId)
        .sort(sortScheduleQueueItemsBySeq)
    : [];
  const scheduleQueueMachineOptions = getScheduleQueueMachineOptions(scheduleQueueItems, productionLines);
  const selectedScheduleSourceMachineId = String(selectedScheduleQueueItem?.machineId ?? "").trim();
  const queueMoveTargetMachineId = scheduleQueueMachineOptions.includes(queueMoveDraft.targetMachineId)
    ? queueMoveDraft.targetMachineId
    : getDefaultQueueMoveTargetMachineId(scheduleQueueMachineOptions, selectedScheduleSourceMachineId);
  const queueMoveTargetItems = getScheduleQueueItemsForMachine(
    scheduleQueueItems,
    queueMoveTargetMachineId,
    selectedScheduleQueueItem?.productionTaskId,
  );
  const queueMovePositionOptions = getQueueMovePositionOptions(queueMoveTargetItems);
  const queueMoveTargetSeq = getNormalizedQueueMoveSeq(queueMoveDraft.targetQueueSeq, queueMovePositionOptions.length);
  const selectedScheduleQueueIndex = selectedScheduleQueueItem
    ? selectedMachineScheduleQueueItems.findIndex((item) => item.productionTaskId === selectedScheduleQueueItem.productionTaskId)
    : -1;
  const canMoveScheduleUp = selectedScheduleQueueIndex > 0;
  const canMoveScheduleDown = selectedScheduleQueueIndex >= 0 && selectedScheduleQueueIndex < selectedMachineScheduleQueueItems.length - 1;
  const queueMoveReason = getQueueMoveReason(queueMoveDraft.reasonCode);
  const queueMoveImpact = getQueueMoveImpactSummary({
    selectedItem: selectedScheduleQueueItem,
    sourceItems: selectedMachineScheduleQueueItems,
    sourceIndex: selectedScheduleQueueIndex,
    targetMachineId: queueMoveTargetMachineId,
    targetItems: queueMoveTargetItems,
    targetSeq: queueMoveTargetSeq,
    reasonLabel: queueMoveReason.label,
  });
  const queueMoveSamePosition =
    selectedScheduleQueueItem &&
    selectedScheduleSourceMachineId === queueMoveTargetMachineId &&
    Math.max(1, Math.trunc(Number(selectedScheduleQueueItem.queueSeq ?? 1))) === queueMoveTargetSeq;
  const queueMoveDisabled =
    sequenceState.disabled || !selectedScheduleQueueItem || !queueMoveTargetMachineId || queueMoveSamePosition;
  const queueMoveTitle =
    sequenceState.title ||
    (!selectedScheduleQueueItem
      ? "先选择机台排产队列中的任务"
      : !queueMoveTargetMachineId
        ? "没有可移动的目标机台"
        : queueMoveSamePosition
          ? "目标机台和位置与当前一致"
          : `移动到 ${queueMoveTargetMachineId} #${queueMoveTargetSeq}`);
  const visibleSourceDetail = getVisibleProductionPackingSourceDetail(sourceDetailState, {
    detailMode,
    selectedProductionLine,
    selectedPackingTask,
    buildProductionTaskId,
  });
  const focusNotice = getProductionPackingFocusNotice(focusTarget, {
    detailMode,
    selectedProductionLine,
    selectedPackingTask,
    buildProductionTaskId,
  });
  const stats = [
    ["待报工", baseProductionLines.length, baseProductionLines.length ? "warning" : "success"],
    ["排产队列", productionPacking.scheduleQueueTotal ?? scheduleQueueItems.length, scheduleQueueItems.length ? "blue" : "success"],
    ["跨日继续", baseProductionLines.filter((line) => getProductionDailyProgress(line)?.carryOver).length, "blue"],
    ["待打包", packingTasks.filter((item) => item.status !== "已完成").length, "blue"],
    ["已打包", packingTasks.filter((item) => item.status === "已完成").length, "success"],
  ];
  const reportDisabled = reportState.disabled || !selectedProductionLine || !detailInventoryItem || !selectedProductionCanReport;
  const reportTitle = reportState.title || (!selectedProductionCanReport ? "该订单明细已完成生产报工或不在可报工状态" : !detailInventoryItem ? "未找到匹配库存键，不能报工入库" : "");
  const reportDailyDisabled = reportDailyState.disabled || !selectedProductionLine || !selectedProductionCanReport;
  const reportDailyTitle = reportDailyState.title || (!selectedProductionCanReport ? "该订单明细已完成生产报工或不在可报工状态" : "");
  const publishScheduleDisabled = publishScheduleState.disabled || !selectedProductionLine || !selectedProductionCanReport || Boolean(selectedPublishedScheduleId);
  const publishScheduleTitle = publishScheduleState.title || (selectedPublishedScheduleId ? "该生产任务已发布到车间任务池" : !selectedProductionCanReport ? "该订单明细不在可发布排产状态" : "");
  const finishedPhotoUploadDisabled = uploadFinishedPhotoState.disabled || !selectedProductionLine || !selectedFinishedGoodsPhotoRequired;
  const finishedPhotoUploadTitle =
    uploadFinishedPhotoState.title ||
    (!selectedProductionLine
      ? "请先选择生产任务"
      : !selectedFinishedGoodsPhotoRequired
        ? "空白通货补货默认不强制上传成品图"
        : "");
  const finishedPhotoReviewDisabled =
    acceptFinishedPhotoState.disabled ||
    !selectedProductionLine ||
    !selectedFinishedGoodsPhoto.attachmentId ||
    selectedFinishedGoodsPhoto.status === "已接受";
  const finishedPhotoReviewTitle =
    acceptFinishedPhotoState.title ||
    (!selectedFinishedGoodsPhoto.attachmentId
      ? "先上传成品图"
      : selectedFinishedGoodsPhoto.status === "已接受"
        ? "成品图已确认"
        : "");
  const finishedPhotoRejectDisabled =
    rejectFinishedPhotoState.disabled ||
    !selectedProductionLine ||
    !selectedFinishedGoodsPhoto.attachmentId ||
    selectedFinishedGoodsPhoto.status === "需重拍";
  const finishedPhotoRejectTitle =
    rejectFinishedPhotoState.title ||
    (!selectedFinishedGoodsPhoto.attachmentId
      ? "先上传成品图"
      : selectedFinishedGoodsPhoto.status === "需重拍"
        ? "已退回重拍"
        : "");
  const packingDisabled = packingState.disabled || !selectedPackingTask || selectedPackingTask.status === "已完成";
  const packingTitle = packingState.title || (selectedPackingTask?.status === "已完成" ? "该打包任务已完成" : "");

  function selectProductionLine(lineId) {
    setSelectedProductionLineId(lineId);
    setActiveWorkbenchTab("production");
  }

  function selectPackingTask(taskId) {
    setSelectedPackingTaskId(taskId);
    setActiveWorkbenchTab("packing");
  }

  function selectScheduleQueueItem(queueItem) {
    const targetLine = productionLines.find((line) => {
      const lineTaskId = buildProductionTaskId(line);
      return (
        queueItem.productionTaskId === line.productionTaskId ||
        queueItem.productionTaskId === lineTaskId ||
        queueItem.orderLineId === line.id ||
        queueItem.orderLineId === line.orderLineId
      );
    });
    if (!targetLine) return;
    selectProductionLine(targetLine.id);
  }

  function moveSelectedScheduleQueue(direction) {
    if (!selectedScheduleQueueItem) return;
    const nextOrderedItems = moveScheduleQueueItem(selectedMachineScheduleQueueItems, selectedScheduleQueueItem.productionTaskId, direction);
    if (!nextOrderedItems.length) return;
    onAction("调整排产顺序", {
      machineId: selectedScheduleQueueItem.machineId,
      orderedProductionTaskIds: nextOrderedItems.map((item) => item.productionTaskId),
      remark: `${selectedScheduleQueueItem.machineId} ${selectedScheduleQueueItem.productionTaskId} ${direction === "up" ? "上移" : "下移"}`,
    });
  }

  function moveSelectedScheduleQueueToTarget() {
    if (queueMoveDisabled) return;
    onAction("移动排产任务", {
      productionTaskId: selectedScheduleQueueItem.productionTaskId,
      orderLineId: selectedScheduleQueueItem.orderLineId,
      sourceMachineId: selectedScheduleQueueItem.machineId,
      targetMachineId: queueMoveTargetMachineId,
      targetQueueSeq: queueMoveTargetSeq,
      reasonCode: queueMoveReason.value,
      reasonLabel: queueMoveReason.label,
      impactSummary: queueMoveImpact.remark,
      remark: `${queueMoveReason.label}：${selectedScheduleQueueItem.productionTaskId} 从 ${selectedScheduleQueueItem.machineId} 移到 ${queueMoveTargetMachineId} #${queueMoveTargetSeq}；${queueMoveImpact.remark}`,
    });
  }

  function updateQueueMoveTargetMachine(targetMachineId) {
    setQueueMoveDraft((current) => ({
      ...current,
      targetMachineId,
      targetQueueSeq: "1",
    }));
  }

  function updateQueueMoveTargetSeq(targetQueueSeq) {
    setQueueMoveDraft((current) => ({
      ...current,
      targetQueueSeq,
    }));
  }

  function updateQueueMoveReason(reasonCode) {
    setQueueMoveDraft((current) => ({
      ...current,
      reasonCode,
    }));
  }

  useEffect(() => {
    if (!focusTarget?.focusKey || lastAppliedFocusKeyRef.current === focusTarget.focusKey) return;
    if (focusTarget.mode === "packing") {
      const taskId = String(focusTarget.taskId ?? focusTarget.packingTaskId ?? "").trim();
      const targetTask =
        packingTasks.find((task) => task.packingTaskId === taskId) ??
        packingTasks.find((task) => task.orderLineId === focusTarget.orderLineId);
      if (!targetTask) return;
      setSelectedPackingTaskId(targetTask.packingTaskId);
      setActiveWorkbenchTab("packing");
      lastAppliedFocusKeyRef.current = focusTarget.focusKey;
      return;
    }

    if (focusTarget.mode === "production") {
      const targetLine = findFocusedProductionLine(productionLines, focusTarget, buildProductionTaskId);
      if (!targetLine) return;
      setSelectedProductionLineId(targetLine.id);
      setActiveWorkbenchTab("production");
      lastAppliedFocusKeyRef.current = focusTarget.focusKey;
    }
  }, [focusTarget, packingTasks, productionLines, buildProductionTaskId]);

  function updateReportInput(field, value) {
    if (!selectedProductionLine) return;
    setReportInputs((current) => ({
      ...current,
      [selectedProductionLine.id]: {
        ...(current[selectedProductionLine.id] ?? {}),
        [field]: value,
      },
    }));
  }

  function updatePackingInput(field, value) {
    if (!selectedPackingTask) return;
    setPackingInputs((current) => ({
      ...current,
      [selectedPackingTask.packingTaskId]: {
        ...(current[selectedPackingTask.packingTaskId] ?? {}),
        [field]: value,
      },
    }));
  }

  return (
    <section className="page-stack production-packing-shell">
      <div className="packing-workbench-tabs" role="tablist" aria-label="打包与标签工作台">
        {PRODUCTION_WORKBENCH_TABS.map((tab) => (
          <button
            type="button"
            role="tab"
            id={`production-workbench-tab-${tab.value}`}
            aria-controls="production-workbench-panel"
            aria-selected={activeWorkbenchTab === tab.value}
            className={activeWorkbenchTab === tab.value ? "active" : ""}
            key={tab.value}
            onClick={() => setActiveWorkbenchTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <section
        className={`page-grid split-detail production-packing-workbench production-mode-${activeWorkbenchTab}`}
        id="production-workbench-panel"
        role="tabpanel"
        aria-labelledby={`production-workbench-tab-${activeWorkbenchTab}`}
      >
      <OperationalPanel className="table-pane production-packing-list-panel" ariaLabel="生产与打包任务列表">
        <MetricStrip items={stats} ariaLabel="生产与打包状态摘要" />
        <PanelHeader
          title="生产 / 打包任务池"
          summary="生产报工只认合格数量；机器计数只做凭证。打包完成不扣库存。"
          actions={(
            <div className="production-status-hints">
              <strong className="toolbar-focus-hint">{taskListStatusText}</strong>
              <strong className="toolbar-focus-hint">{scheduleQueueStatusText}</strong>
              {focusNotice ? <strong className="toolbar-focus-hint">{focusNotice}</strong> : null}
            </div>
          )}
        />
        {activeWorkbenchTab === "production" ? (
          <div className="production-task-focus-toolbar">
            <div>
              <button
                type="button"
                className={productionTaskPriority === "attention" ? "active attention" : ""}
                aria-pressed={productionTaskPriority === "attention"}
                onClick={() => setProductionTaskPriority("attention")}
              >
                异常优先 ({productionAttentionCount})
              </button>
              <button
                type="button"
                className={productionTaskPriority === "normal" ? "active normal" : ""}
                aria-pressed={productionTaskPriority === "normal"}
                onClick={() => setProductionTaskPriority("normal")}
              >
                正常优先 ({Math.max(0, productionLines.length - productionAttentionCount)})
              </button>
            </div>
            <span className="production-task-machine-count">{scheduleQueueMachineOptions.length} 台机台</span>
          </div>
        ) : null}
        <div className="production-task-cards" aria-label={`${PRODUCTION_WORKBENCH_TABS.find((tab) => tab.value === activeWorkbenchTab)?.label ?? "任务"}列表`}>
          {activeWorkbenchTab === "production" ? productionTaskCards.map((line) => {
            const inventoryItem = resolveInventoryItem(line);
            const isActive = line.id === selectedProductionLine?.id;
            return (
              <button className={`production-task-card ${isActive ? "active" : ""}`} key={line.id} onClick={() => selectProductionLine(line.id)}>
                <StatusPill tone={inventoryItem ? (line.confidence === "medium" ? "warning" : "success") : "danger"}>{inventoryItem ? (line.confidence === "medium" ? "待复核" : "正常") : "缺货"}</StatusPill>
                <div className="production-task-card-main">
                  <strong>{buildProductionTaskId(line)}</strong>
                  <span>{findCustomer(line.customerId).name} · {line.size} · {getLineColorSpecLabel(line)} · {getLinePrintSide(line)}</span>
                  <small>计划 {line.qty} 个 · {line.latest}交付 · {line.fulfillment}</small>
                </div>
                <b>{inventoryItem ? line.status : "缺库存键"}</b>
              </button>
            );
          }) : activeWorkbenchTab === "packing" ? packingTasks.map((task) => {
            const line = task.orderLine;
            const isActive = task.packingTaskId === selectedPackingTask?.packingTaskId;
            return (
              <button className={`production-task-card ${isActive ? "active" : ""}`} key={task.packingTaskId} onClick={() => selectPackingTask(task.packingTaskId)}>
                <StatusPill tone={statusTone(task.status)}>{task.status}</StatusPill>
                <div className="production-task-card-main">
                  <strong>{task.packingTaskId}</strong>
                  <span>{findCustomer(line.customerId).name} · {line.size} · {getLineColorSpecLabel(line)}</span>
                  <small>计划 {task.plannedQty} 个 · {task.packageCount ?? inferPackageCountFromQty(task.plannedQty)} 包</small>
                </div>
                <b>{task.labelsPrinted ? "标签已打印" : "待打包"}</b>
              </button>
            );
          }) : (
            <DataState title="打印与设备" detail="在右侧查看设备验收、驱动状态和打印作业队列。" compact />
          )}
        </div>
        <section className="detail-section compact-section legacy-production-section schedule-queue-section">
          <div className="section-head-row">
            <h3>机台排产队列</h3>
            <div className="section-tools">
              <span className="section-count">{productionPacking.scheduleQueueTotal ?? scheduleQueueItems.length} 条</span>
              <button
                disabled={sequenceState.disabled || !canMoveScheduleUp}
                title={sequenceState.title || (!selectedScheduleQueueItem ? "先选择机台排产队列中的任务" : !canMoveScheduleUp ? "当前任务已在本机台最前" : "上移当前任务")}
                onClick={() => moveSelectedScheduleQueue("up")}
              >
                上移
              </button>
              <button
                disabled={sequenceState.disabled || !canMoveScheduleDown}
                title={sequenceState.title || (!selectedScheduleQueueItem ? "先选择机台排产队列中的任务" : !canMoveScheduleDown ? "当前任务已在本机台最后" : "下移当前任务")}
                onClick={() => moveSelectedScheduleQueue("down")}
              >
                下移
              </button>
              <div className="queue-move-controls" aria-label="移动排产任务">
                <label>
                  <span>目标</span>
                  <select
                    value={queueMoveTargetMachineId}
                    disabled={sequenceState.disabled || !selectedScheduleQueueItem}
                    title={sequenceState.title || "选择目标机台"}
                    onChange={(event) => updateQueueMoveTargetMachine(event.target.value)}
                  >
                    {scheduleQueueMachineOptions.map((machineId) => (
                      <option key={machineId} value={machineId}>
                        {machineId}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>位置</span>
                  <select
                    value={String(queueMoveTargetSeq)}
                    disabled={sequenceState.disabled || !selectedScheduleQueueItem}
                    title={sequenceState.title || "选择插入位置"}
                    onChange={(event) => updateQueueMoveTargetSeq(event.target.value)}
                  >
                    {queueMovePositionOptions.map((seq) => (
                      <option key={seq} value={seq}>
                        #{seq}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>原因</span>
                  <select
                    value={queueMoveReason.value}
                    disabled={sequenceState.disabled || !selectedScheduleQueueItem}
                    title={sequenceState.title || "选择本次排产调整原因"}
                    onChange={(event) => updateQueueMoveReason(event.target.value)}
                  >
                    {queueMoveReasonOptions.map((reason) => (
                      <option key={reason.value} value={reason.value}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button disabled={queueMoveDisabled} title={queueMoveTitle} onClick={moveSelectedScheduleQueueToTarget}>
                  移动/插队
                </button>
              </div>
            </div>
          </div>
          <div className="queue-move-impact" aria-live="polite">
            {queueMoveImpact.text}
          </div>
          <DataTable
            className="production-schedule-queue-table"
            columns={["机台", "顺序", "任务", "客户", "货品规格", "计划/剩余", "状态"]}
            rows={scheduleQueueItems.map((item) => {
              const active =
                detailMode === "production" &&
                selectedProductionLine &&
                (item.orderLineId === selectedProductionLine.id ||
                  item.orderLineId === selectedProductionLine.orderLineId ||
                  item.productionTaskId === selectedProductionLine.productionTaskId ||
                  item.productionTaskId === buildProductionTaskId(selectedProductionLine));
              return {
                id: item.scheduleRecordId || item.publishedScheduleId || item.productionTaskId,
                active,
                tone: item.queueReason === "跨日继续" ? "warning" : "blue",
                onClick: () => selectScheduleQueueItem(item),
                cells: [
                  item.machineId || "未分配",
                  item.queueSeq ? `#${item.queueSeq}` : "-",
                  item.publishedScheduleId || item.productionTaskId,
                  item.customerName || item.customerId || "未匹配",
                  formatProductionScheduleQueueSpec(item),
                  formatProductionScheduleQueueQty(item),
                  formatProductionScheduleQueueStatus(item),
                ],
              };
            })}
          />
        </section>
        <section className="detail-section compact-section legacy-production-section production-task-section">
          <div className="section-head-row">
            <h3>生产报工</h3>
            <span className="section-count">{productionLines.length} 条</span>
          </div>
          <DataTable
            className="production-task-table"
            columns={["任务", "客户", "货品", "规格", "计划", "工序", "状态", "进度/库存"]}
            rows={productionLines.map((line) => {
              const inventoryItem = resolveInventoryItem(line);
              const progressLabel = formatProductionDailyProgressLabel(line);
              return {
                id: line.id,
                active: line.id === selectedProductionLine?.id && detailMode === "production",
                tone: inventoryItem ? statusTone(line.status) : "danger",
                onClick: () => selectProductionLine(line.id),
                cells: [
                  buildProductionTaskId(line),
                  findCustomer(line.customerId).name,
                  line.product,
                  `${line.size} ${getLineColorSpecLabel(line)}`,
                  line.qty,
                  getProductionProcessLabel(line),
                  line.status,
                  progressLabel || (inventoryItem ? inventoryItem.zone : "缺库存键"),
                ],
              };
            })}
          />
        </section>
        <section className="detail-section compact-section legacy-production-section packing-task-section">
          <div className="section-head-row">
            <h3>打包任务</h3>
            <span className="section-count">{packingTasks.length} 条</span>
          </div>
          <DataTable
            className="packing-task-table"
            columns={["任务", "客户", "货品", "规格", "计划", "实包", "包裹", "状态"]}
            rows={packingTasks.map((task) => {
              const line = task.orderLine;
              return {
                id: task.packingTaskId,
                active: task.packingTaskId === selectedPackingTask?.packingTaskId && detailMode === "packing",
                tone: statusTone(task.status),
                onClick: () => selectPackingTask(task.packingTaskId),
                cells: [
                  task.packingTaskId,
                  findCustomer(line.customerId).name,
                  line.product,
                  `${line.size} ${getLineColorSpecLabel(line)}`,
                  task.plannedQty,
                  task.actualPackedQty || "未填",
                  `${task.packageCount ?? inferPackageCountFromQty(task.plannedQty)}包`,
                  task.status,
                ],
              };
            })}
          />
        </section>
      </OperationalPanel>
      <DetailPane
        className="production-packing-detail-pane"
        title={activeWorkbenchTab === "print" ? "打印与设备" : detailMode === "packing" ? selectedPackingTask?.packingTaskId ?? "打包任务" : selectedProductionLine ? buildProductionTaskId(selectedProductionLine) : "生产报工"}
        subtitle={activeWorkbenchTab === "print" ? "设备验收、驱动状态与打印作业" : detailLine ? `${findCustomer(detailLine.customerId).name} · ${detailLine.id}` : "未选择"}
      >
        {activeWorkbenchTab === "print" ? (
          <>
            <PrinterDeviceQaPanel
              qaState={printerDeviceQa}
              saveState={getUiActionState("productionPacking", "保存打印验收")}
              deviceModeSaveState={getUiActionState("productionPacking", "保存设备模式")}
              onRefresh={onRefreshPrinterDeviceQa}
              onSelectDevice={onSelectPrinterDeviceQaDevice}
              onChangeField={onChangePrinterDeviceQaField}
              onChangeCheck={onChangePrinterDeviceQaCheck}
              onChangeEvidence={onChangePrinterDeviceQaEvidenceField}
              onSaveDeviceMode={onSavePrinterDeviceMode}
              onSave={onSavePrinterDeviceQa}
            />
            <PrintDriverV1ReadinessPanel
              readinessState={printDriverReadiness}
              onRefresh={onRefreshPrintDriverReadiness}
            />
            <PrintDriverDiagnosticsPanel
              driverState={printDriverConfig}
              cupsDiagnosticsState={printDriverCupsDiagnostics}
              onRefresh={onRefreshPrintDriverConfig}
            />
            <PrintJobQueuePanel
              queueState={printJobQueue}
              dispatchState={getUiActionState("productionPacking", "派发打印作业")}
              retryState={getUiActionState("productionPacking", "重试打印作业")}
              onRefresh={onRefreshPrintJobs}
              onDispatch={onDispatchPrintJob}
              onRetry={onRetryPrintJob}
            />
          </>
        ) : detailLine ? (
          <>
            <div className="production-current-task">
              <span>当前任务</span>
              <strong>{detailMode === "packing" ? selectedPackingTask?.packingTaskId : buildProductionTaskId(selectedProductionLine)}</strong>
              <p>{findCustomer(detailLine.customerId).name} · {detailLine.size} · {getLineColorSpecLabel(detailLine)} · {getLinePrintSide(detailLine)}</p>
            </div>
            <InfoGrid
              rows={[
                ["计划数量", `${detailLine.qty} 个`],
                ["交付", detailLine.latest],
                ["交付方式", detailLine.fulfillment],
                ["状态", detailMode === "packing" ? selectedPackingTask.status : detailLine.status],
                ["机台", detailMode === "production" ? selectedProductionMachineId : "打包台待分配"],
                ["货品", `${detailLine.product} / ${detailLine.size}`],
                ["颜色/印刷/提手", `${getLineColorSpecLabel(detailLine)} / ${getLinePrintSide(detailLine)}`],
                ["排产发布", detailMode === "production" ? (selectedPublishedScheduleId ? `${selectedProductionMachineId} / ${selectedPublishedScheduleId}` : "未发布到车间任务池") : "生产完成后进入打包"],
                ["库存键", detailInventoryItem ? `${detailInventoryItem.id} / ${detailInventoryItem.zone}` : "未找到匹配库存键"],
                ["跨日进度", formatProductionDailyProgressLabel(detailLine) || "暂无日报数"],
                ["成品图", detailMode === "production" ? formatProductionFinishedGoodsPhotoLabel(selectedFinishedGoodsPhoto) : "生产侧确认"],
                ["备注", getLineRemark(detailLine) || "无"],
              ]}
            />
            {visibleSourceDetail ? (
              <ProductionPackingSourceDetailCard detailState={visibleSourceDetail} detailMode={detailMode} />
            ) : null}
            {detailMode === "production" ? (
              <>
                <section className="detail-section production-machine-proof">
                  <div className="section-title-row">
                    <h3>机器计数 / 动作次数（仅作生产凭证）</h3>
                    <button type="button" onClick={() => updateReportInput("machineCount", 0)}>清零计数</button>
                  </div>
                  <div className="machine-proof-metrics">
                    <span>计划动作次数<strong>{Number(selectedProductionLine.qty || 0).toLocaleString("zh-CN")} 次</strong></span>
                    <span>机器动作次数<strong>{Number(reportMachineCount || 0).toLocaleString("zh-CN")} 次</strong></span>
                    <span>良品动作次数<strong>{Number(reportQualifiedQty || 0).toLocaleString("zh-CN")} 次</strong></span>
                    <span>不良动作次数<strong>{Number(reportExceptionQty || 0).toLocaleString("zh-CN")} 次</strong></span>
                  </div>
                  <p>仅用于生产过程追溯，不作为合格数量、库存、履约数量或计费数量。</p>
                </section>
                <section className="detail-section">
                  <h3>合格产出（用于交付与入库）</h3>
                  <div className="detail-form">
                    <label>
                      <span>合格数量</span>
                      <input type="number" min="1" value={reportQualifiedQty} onChange={(event) => updateReportInput("qualifiedQty", event.target.value)} />
                    </label>
                    <label>
                      <span>异常/废品数</span>
                      <input type="number" min="0" value={reportExceptionQty} onChange={(event) => updateReportInput("exceptionQty", event.target.value)} />
                    </label>
                    <label>
                      <span>机器计数/动作次数</span>
                      <input type="number" min="0" placeholder="只作凭证" value={reportMachineCount} onChange={(event) => updateReportInput("machineCount", event.target.value)} />
                    </label>
                  </div>
                  <div className="action-row production-qualified-submit">
                    <button
                      className="primary-action"
                      disabled={reportDisabled}
                      title={reportTitle}
                      onClick={() =>
                        onAction("报工完成", {
                          orderLineId: selectedProductionLine.id,
                          orderLine: selectedProductionLine,
                          qualifiedQty: Number(reportQualifiedQty || 0),
                          exceptionQty: Number(reportExceptionQty || 0),
                          machineCount: reportMachineCount === "" ? undefined : Number(reportMachineCount),
                        })
                      }
                    >
                      提交合格数量
                    </button>
                  </div>
                </section>
                <section className="detail-section production-transaction-result">
                  <h3>事务结果</h3>
                  <p>报当日数量只记录跨日进度，不入库、不占用、不生成打包任务；报工完成才会把合格数量入库并占用给该订单。</p>
                </section>
                <section className="detail-section production-task-history">
                  <h3>任务历史（本任务）</h3>
                  <DataTable
                    className="production-task-history-table"
                    columns={["时间", "类型", "机台", "数量/次数", "操作人", "备注"]}
                    rows={[]}
                  />
                </section>
                <section className="detail-section finished-goods-photo-section">
                  <div className="section-title-row">
                    <h3>定制成品图</h3>
                    <StatusPill tone={getProductionFinishedGoodsPhotoTone(selectedFinishedGoodsPhoto)}>
                      {selectedFinishedGoodsPhoto.status}
                    </StatusPill>
                  </div>
                  <InfoGrid
                    rows={[
                      ["附件", selectedFinishedGoodsPhoto.fileName || selectedFinishedGoodsPhoto.attachmentId || "未上传"],
                      ["上传", selectedFinishedGoodsPhoto.uploadedAt ? formatCompactDateTime(selectedFinishedGoodsPhoto.uploadedAt) : "未上传"],
                      ["复核", selectedFinishedGoodsPhoto.reviewedAt ? formatCompactDateTime(selectedFinishedGoodsPhoto.reviewedAt) : "待确认"],
                      ["退回原因", selectedFinishedGoodsPhoto.rejectedReason || "无"],
                    ]}
                  />
                  <div className="action-row">
                    <button
                      disabled={finishedPhotoUploadDisabled}
                      title={finishedPhotoUploadTitle}
                      onClick={() =>
                        onAction("上传成品图", {
                          orderLineId: selectedProductionLine.id,
                          orderLine: selectedProductionLine,
                          productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
                        })
                      }
                    >
                      上传成品图
                    </button>
                    <button
                      className="primary-action"
                      disabled={finishedPhotoReviewDisabled}
                      title={finishedPhotoReviewTitle}
                      onClick={() =>
                        onAction("确认成品图", {
                          orderLineId: selectedProductionLine.id,
                          orderLine: selectedProductionLine,
                          productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
                        })
                      }
                    >
                      确认成品图
                    </button>
                    <button
                      disabled={finishedPhotoRejectDisabled}
                      title={finishedPhotoRejectTitle}
                      onClick={() =>
                        onAction("退回成品图", {
                          orderLineId: selectedProductionLine.id,
                          orderLine: selectedProductionLine,
                          productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
                        })
                      }
                    >
                      退回重拍
                    </button>
                  </div>
                </section>
                <div className="action-row">
                  <button
                    disabled={publishScheduleDisabled}
                    title={publishScheduleTitle}
                    onClick={() =>
                      onAction("发布排产", {
                        orderLineId: selectedProductionLine.id,
                        orderLine: selectedProductionLine,
                        productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
                        processType: getProductionProcessLabel(selectedProductionLine),
                        machineId: selectedProductionMachineId,
                        plannedQty: selectedProductionLine.qty,
                      })
                    }
                  >
                    {selectedPublishedScheduleId ? "已发布排产" : "发布排产"}
                  </button>
                  <button
                    disabled={reportDailyDisabled}
                    title={reportDailyTitle}
                    onClick={() =>
                      onAction("报当日数量", {
                        orderLineId: selectedProductionLine.id,
                        orderLine: selectedProductionLine,
                        dailyQualifiedQty: Number(reportQualifiedQty || 0),
                        exceptionQty: Number(reportExceptionQty || 0),
                        machineCount: reportMachineCount === "" ? undefined : Number(reportMachineCount),
                      })
                    }
                  >
                    报当日数量
                  </button>
                </div>
              </>
            ) : (
              <>
                <section className="detail-section">
                  <h3>包裹明细</h3>
                  <div className="detail-form">
                    <label>
                      <span>实际打包数量</span>
                      <input type="number" min="1" value={packingActualQty} onChange={(event) => updatePackingInput("actualPackedQty", event.target.value)} />
                    </label>
                    <label>
                      <span>包裹数</span>
                      <input type="number" min="1" value={packingPackageCount} onChange={(event) => updatePackingInput("packageCount", event.target.value)} />
                    </label>
                    <label>
                      <span>标签状态</span>
                      <select value={packingLabelsPrinted ? "已打印" : "未打印"} onChange={(event) => updatePackingInput("labelsPrinted", event.target.value === "已打印")}>
                        <option>未打印</option>
                        <option>已打印</option>
                      </select>
                    </label>
                  </div>
                </section>
                <section className="detail-section">
                  <h3>事务结果</h3>
                  <p>提交后生成包裹记录，快递快运未打印标签时进入待打印标签；打包完成本身不扣库存。</p>
                </section>
                <div className="action-row">
                  <button
                    className="primary-action"
                    disabled={packingDisabled}
                    title={packingTitle}
                    onClick={() =>
                      onAction("提交打包完成", {
                        packingTaskId: selectedPackingTask.packingTaskId,
                        packingTask: selectedPackingTask,
                        orderLineId: selectedPackingTask.orderLineId,
                        orderLine: selectedPackingTask.orderLine,
                        actualPackedQty: Number(packingActualQty || 0),
                        packageCount: Number(packingPackageCount || 1),
                        labelsPrinted: packingLabelsPrinted,
                      })
                    }
                  >
                    提交打包完成
                  </button>
                </div>
              </>
            )}
            <Timeline
              items={[
                detailMode === "production" ? "车间完成生产" : "生产完成进入打包",
                detailMode === "production" ? "办公室/生产管理确认合格数量" : "打包工确认实际包裹",
                detailMode === "production" ? "入库并生成订单占用" : "生成包裹和标签下一步",
                detailMode === "production" ? "进入待打包" : "出库/拉走时再扣库存",
              ]}
            />
          </>
        ) : (
          <DataState title="暂无生产或打包任务" detail="刷新任务池或确认排产是否已发布。" compact />
        )}
      </DetailPane>
      </section>
    </section>
  );
}

function ProductionPackingSourceDetailCard({ detailState, detailMode }) {
  const sourceLabel = getProductionPackingDetailSourceLabel(detailState?.source);
  const sourceTone = detailState?.source === "api" ? "success" : detailState?.error ? "danger" : "warning";
  const rows = buildProductionPackingSourceDetailRows(detailState, detailMode);

  return (
    <section className="detail-section production-source-detail-section">
      <div className="section-head-row">
        <h3>来源详情</h3>
        <StatusPill tone={sourceTone}>{sourceLabel}</StatusPill>
      </div>
      <InfoGrid rows={rows} />
    </section>
  );
}
