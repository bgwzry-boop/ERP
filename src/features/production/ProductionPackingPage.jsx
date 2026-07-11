import { useEffect, useRef, useState } from "react";
import { DataTable, DetailPane, InfoGrid, MetricStrip, StatusPill, Timeline } from "../../components/ui.jsx";
import {
  PRINTER_DEVICE_FIELD_TEST_EVIDENCE_ITEMS,
  PRINTER_DEVICE_FIELD_TEST_STATUS_OPTIONS,
  getPrinterDeviceFieldTestEvidenceSummary,
  getPrinterDeviceFieldTestSummary,
} from "../../services/printerDeviceFieldTestClient.js";
import {
  buildPrintDriverReadinessChecklist,
  getPrintDriverReadinessSummary,
} from "../../services/officePrintDriverConfigApiClient.js";
import {
  buildOfficePrintDriverIntegrationKit,
  getOfficePrintDriverIntegrationKitSummary,
} from "../../services/officePrintDriverIntegrationKitClient.js";
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

const PRINT_DRIVER_MODE_OPTIONS = [
  { value: "preview_only", label: "仅预览" },
  { value: "system_printer", label: "系统打印" },
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
  const [activeDetail, setActiveDetail] = useState(productionLines.length ? "production" : "packing");
  const [reportInputs, setReportInputs] = useState({});
  const [packingInputs, setPackingInputs] = useState({});
  const [queueMoveDraft, setQueueMoveDraft] = useState({
    targetMachineId: "",
    targetQueueSeq: "1",
    reasonCode: "supervisor_order",
  });
  const selectedProductionLine = productionLines.find((item) => item.id === selectedProductionLineId) ?? productionLines[0] ?? null;
  const selectedPackingTask = packingTasks.find((item) => item.packingTaskId === selectedPackingTaskId) ?? packingTasks[0] ?? null;
  const resolveInventoryItem = (line, task = null) => findProductionInventoryItem(line, inventoryRecords) ?? line?.inventoryItem ?? task?.inventoryItem ?? null;
  const detailMode = activeDetail === "packing" && selectedPackingTask ? "packing" : "production";
  const detailLine = detailMode === "packing" ? selectedPackingTask?.orderLine : selectedProductionLine;
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
    setActiveDetail("production");
  }

  function selectPackingTask(taskId) {
    setSelectedPackingTaskId(taskId);
    setActiveDetail("packing");
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
      setActiveDetail("packing");
      lastAppliedFocusKeyRef.current = focusTarget.focusKey;
      return;
    }

    if (focusTarget.mode === "production") {
      const targetLine = findFocusedProductionLine(productionLines, focusTarget, buildProductionTaskId);
      if (!targetLine) return;
      setSelectedProductionLineId(targetLine.id);
      setActiveDetail("production");
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
    <section className="page-grid split-detail">
      <div className="table-pane">
        <MetricStrip items={stats} />
        <div className="toolbar-line">
          <span>生产报工只认合格数量；机器计数只做凭证。打包完成不扣库存。</span>
          <strong className="toolbar-focus-hint">{taskListStatusText}</strong>
          <strong className="toolbar-focus-hint">{scheduleQueueStatusText}</strong>
          {focusNotice ? <strong className="toolbar-focus-hint">{focusNotice}</strong> : null}
        </div>
        <section className="detail-section compact-section">
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
        <section className="detail-section compact-section">
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
        <section className="detail-section compact-section">
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
      </div>
      <DetailPane
        title={detailMode === "packing" ? selectedPackingTask?.packingTaskId ?? "打包任务" : selectedProductionLine ? buildProductionTaskId(selectedProductionLine) : "生产报工"}
        subtitle={detailLine ? `${findCustomer(detailLine.customerId).name} · ${detailLine.id}` : "未选择"}
      >
        {detailLine ? (
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
            <InfoGrid
              rows={[
                ["货品", `${detailLine.product} / ${detailLine.size}`],
                ["颜色/印刷/提手", `${getLineColorSpecLabel(detailLine)} / ${getLinePrintSide(detailLine)}`],
                ["数量", `${detailLine.qty} 个`],
                ["交付", `${detailLine.fulfillment} · ${detailLine.latest}`],
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
                <section className="detail-section">
                  <h3>报工字段</h3>
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
                </section>
                <section className="detail-section">
                  <h3>事务结果</h3>
                  <p>报当日数量只记录跨日进度，不入库、不占用、不生成打包任务；报工完成才会把合格数量入库并占用给该订单。</p>
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
                    报工完成
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
          <div className="empty-row">暂无生产或打包任务</div>
        )}
      </DetailPane>
    </section>
  );
}

function PrinterDeviceQaPanel({
  qaState = {},
  saveState = {},
  deviceModeSaveState = {},
  onRefresh,
  onSelectDevice,
  onChangeField,
  onChangeCheck,
  onChangeEvidence,
  onSaveDeviceMode,
  onSave,
}) {
  const devices = Array.isArray(qaState.devices) ? qaState.devices : [];
  const checks = Array.isArray(qaState.checks) ? qaState.checks : [];
  const selectedDevice = devices.find((item) => item.printDeviceId === qaState.selectedDeviceId) ?? null;
  const latestRecord = qaState.latestRecord ?? selectedDevice?.latestFieldTestRecord ?? null;
  const summary = getPrinterDeviceFieldTestSummary(checks);
  const evidence = qaState.evidence ?? latestRecord?.evidence ?? latestRecord?.summary?.evidence ?? {};
  const evidenceSummary = getPrinterDeviceFieldTestEvidenceSummary(evidence);
  const currentDriverMode = getPrinterDeviceDriverMode(selectedDevice);
  const draftDriverMode = qaState.driverModeDraft || currentDriverMode;
  const driverModeChanged = Boolean(selectedDevice && draftDriverMode !== currentDriverMode);
  const sourceLabel = getPrinterDeviceQaSourceLabel(qaState);
  const sourceTone = qaState.error ? "danger" : qaState.source === "api" || qaState.recordSource === "api" ? "success" : qaState.source === "idle" ? "neutral" : "warning";
  const saveDisabled = Boolean(saveState.disabled || qaState.loading || qaState.saving || !qaState.selectedDeviceId);
  const saveModeDisabled = Boolean(
    deviceModeSaveState.disabled ||
      qaState.loading ||
      qaState.savingDeviceMode ||
      !qaState.selectedDeviceId ||
      !driverModeChanged,
  );
  const saveTitle =
    saveState.title ||
    (!qaState.selectedDeviceId
      ? "请先选择打印设备"
      : qaState.loading
        ? "设备验收记录刷新中"
        : "");
  const statusText = qaState.error
    ? qaState.error
    : latestRecord
      ? `最新记录 ${latestRecord.recordId} · ${formatPrinterDeviceQaDateTime(latestRecord.checkedAt)}`
      : qaState.loading
        ? "正在读取打印设备和验收记录"
        : "暂无已保存验收记录";

  return (
    <section className="detail-section driver-field-test-section printer-device-qa-section">
      <div className="section-title-row printer-device-qa-head">
        <div>
          <h3>打印设备验收</h3>
          <small>{statusText}</small>
        </div>
        <div className="printer-device-qa-head-actions">
          <StatusPill tone={sourceTone}>{sourceLabel}</StatusPill>
          <button type="button" onClick={onRefresh} disabled={qaState.loading}>
            {qaState.loading ? "刷新中" : "刷新"}
          </button>
        </div>
      </div>
      <div className="printer-device-qa-select-row">
        <label>
          <span>设备</span>
          <select
            value={qaState.selectedDeviceId ?? ""}
            onChange={(event) => onSelectDevice?.(event.target.value)}
            disabled={qaState.loading || !devices.length}
          >
            {devices.length ? null : <option value="">未配置打印设备</option>}
            {devices.map((device) => (
              <option value={device.printDeviceId} key={device.printDeviceId}>
                {device.name || device.printDeviceId}
              </option>
            ))}
          </select>
        </label>
        <span className={`driver-device-summary ${summary.tone}`}>{summary.label}</span>
      </div>
      <div className="printer-device-mode-row">
        <div className={`printer-device-mode-current ${currentDriverMode === "system_printer" ? "success" : "warning"}`}>
          <span>当前模式</span>
          <strong>{getPrintDriverModeLabel(currentDriverMode)}</strong>
          <small>{currentDriverMode === "system_printer" ? "允许真实系统打印" : "仅预览，不出纸"}</small>
        </div>
        <label>
          <span>目标模式</span>
          <select
            value={draftDriverMode}
            onChange={(event) => onChangeField?.("driverModeDraft", event.target.value)}
            disabled={qaState.loading || qaState.savingDeviceMode || !qaState.selectedDeviceId}
          >
            {PRINT_DRIVER_MODE_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onSaveDeviceMode}
          disabled={saveModeDisabled}
          title={
            deviceModeSaveState.title ||
            (!qaState.selectedDeviceId
              ? "请先选择打印设备"
              : !driverModeChanged
                ? "设备模式没有变化"
                : "")
          }
        >
          {qaState.savingDeviceMode ? "保存中" : "保存设备模式"}
        </button>
      </div>
      <small className="printer-device-mode-note">
        切到系统打印只代表 ERP 允许派发真实打印，仍需 V1 门禁、spool 回读和现场 QA 通过。
      </small>
      <div className="driver-field-test-form printer-device-qa-form">
        <label>
          <span>设备标签</span>
          <input
            value={qaState.deviceLabel ?? ""}
            onChange={(event) => onChangeField?.("deviceLabel", event.target.value)}
            placeholder="如 标签机A"
          />
        </label>
        <label>
          <span>驱动/连接</span>
          <input
            value={qaState.driverLabel ?? ""}
            onChange={(event) => onChangeField?.("driverLabel", event.target.value)}
            placeholder="如 EPSON LQ-610KII/615KII / USB"
          />
        </label>
        <label>
          <span>纸张</span>
          <input
            value={qaState.paperLabel ?? ""}
            onChange={(event) => onChangeField?.("paperLabel", event.target.value)}
            placeholder="如 80x60 热敏标签"
          />
        </label>
      </div>
      <div className="driver-field-test-list printer-device-qa-checks">
        {checks.map((item) => (
          <label className={`driver-field-test-row ${item.tone}`} key={item.key}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.target}</span>
              <small>现场手动确认，保存后生成 PDQA 验收记录</small>
            </div>
            <select value={item.status} onChange={(event) => onChangeCheck?.(item.key, event.target.value)}>
              {PRINTER_DEVICE_FIELD_TEST_STATUS_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="printer-device-qa-evidence">
        <div className="printer-device-qa-evidence-head">
          <strong>验收证据</strong>
          <span className={`driver-device-summary ${evidenceSummary.tone}`}>{evidenceSummary.label}</span>
        </div>
        <div className="printer-device-qa-evidence-grid">
          {PRINTER_DEVICE_FIELD_TEST_EVIDENCE_ITEMS.map((item) => (
            <label key={item.key}>
              <span>{item.label}</span>
              <input
                value={evidence[item.key] ?? ""}
                onChange={(event) => onChangeEvidence?.(item.key, event.target.value)}
                placeholder={item.placeholder}
              />
            </label>
          ))}
        </div>
      </div>
      <div className="driver-field-test-note printer-device-qa-note">
        <input
          value={qaState.note ?? ""}
          onChange={(event) => onChangeField?.("note", event.target.value)}
          placeholder="记录样张、扫码、驱动回写、作废重打问题"
        />
        <button type="button" onClick={onSave} disabled={saveDisabled} title={saveTitle}>
          {qaState.saving ? "保存中" : "保存验收"}
        </button>
      </div>
      {latestRecord ? (
        <div className="driver-field-test-record printer-device-qa-record">
          <strong>{latestRecord.recordId}</strong>
          <span>{latestRecord.summary?.label ?? "已记录"}</span>
          <small>
            {[latestRecord.deviceLabel, latestRecord.driverLabel, latestRecord.paperLabel, latestRecord.operatorName]
              .filter(Boolean)
              .join(" · ")}
          </small>
          {latestRecord.evidence ? (
            <small>{getPrinterDeviceFieldTestEvidenceSummary(latestRecord.evidence).label}</small>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function getPrinterDeviceDriverMode(printDevice = {}) {
  if (!printDevice || typeof printDevice !== "object") return "preview_only";
  return String(printDevice.settings?.driverMode ?? printDevice.driverMode ?? "preview_only").trim() || "preview_only";
}

function getPrintDriverModeLabel(driverMode) {
  const option = PRINT_DRIVER_MODE_OPTIONS.find((item) => item.value === driverMode);
  return option?.label ?? driverMode ?? "待补";
}

function getPrinterDeviceQaSourceLabel(qaState = {}) {
  if (qaState.loading) return "刷新中";
  if (qaState.saving) return "保存中";
  if (qaState.error) return "验收异常";
  if (qaState.recordSource === "api" || qaState.source === "api") return "后端验收";
  if (qaState.source === "local_fallback" || qaState.recordSource === "local_fallback") return "本地降级";
  if (qaState.source === "idle") return "未读取";
  return "待确认";
}

function formatPrinterDeviceQaDateTime(value) {
  if (!value) return "时间待补";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PrintDriverV1ReadinessPanel({ readinessState = {}, onRefresh }) {
  const readiness = readinessState.readiness;
  const summary = getPrintDriverV1ReadinessSummary(readinessState);
  const sourceLabel = getPrintDriverV1ReadinessSourceLabel(readinessState);
  const statusText = readinessState.error
    ? readinessState.error
    : readinessState.loading
      ? "正在读取 V1 打印上线门禁"
      : readinessState.lastSyncedAt
        ? `最新同步 ${readinessState.lastSyncedAt}`
        : "待刷新上线门禁";
  const rows = buildPrintDriverV1ReadinessRows(readiness);
  const criteria = Array.isArray(readiness?.criteria) ? readiness.criteria : [];
  const deviceReadiness = Array.isArray(readiness?.deviceReadiness) ? readiness.deviceReadiness : [];
  const remainingRisks = Array.isArray(readiness?.remainingV1Risks) ? readiness.remainingV1Risks : [];

  return (
    <section className={`detail-section print-driver-diagnostics-section print-driver-v1-readiness-section ${summary.tone}`}>
      <div className="section-title-row print-driver-diagnostics-head">
        <div>
          <h3>V1 打印上线门禁</h3>
          <small>{statusText}</small>
        </div>
        <div className="printer-device-qa-head-actions">
          <StatusPill tone={summary.tone}>{summary.label}</StatusPill>
          <button type="button" onClick={onRefresh} disabled={readinessState.loading}>
            {readinessState.loading ? "刷新中" : "刷新"}
          </button>
        </div>
      </div>
      <div className="print-driver-diagnostics-meta">
        <span>{sourceLabel}</span>
        <span>{getPrintDriverV1ReadinessSafetyLabel(readiness)}</span>
      </div>
      <div className="print-driver-diagnostics-grid">
        {rows.map((row) => (
          <div className={row.tone ?? ""} key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            <small>{row.meta}</small>
          </div>
        ))}
      </div>
      <div className="print-driver-readiness">
        <div className="print-driver-readiness-head">
          <strong>上线阻塞项</strong>
          <span className={summary.tone}>{readiness?.summary?.label ?? "未读取"}</span>
        </div>
        {criteria.length ? (
          <div className="print-driver-readiness-list">
            {criteria.map((item) => (
              <div className={`print-driver-readiness-row ${item.tone}`} key={item.key}>
                <span>{item.statusLabel}</span>
                <strong>{item.label}</strong>
                <small>{item.detail || "详情待补"}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-row compact-empty">刷新后显示配置、spool、CUPS、设备和现场 QA 门禁。</div>
        )}
      </div>
      <div className="print-driver-readiness print-driver-v1-device-list">
        <div className="print-driver-readiness-head">
          <strong>必需设备组</strong>
          <span className={summary.tone}>{formatPrintDriverV1DeviceSummary(deviceReadiness)}</span>
        </div>
        {deviceReadiness.length ? (
          <div className="print-driver-readiness-list">
            {deviceReadiness.map((item) => (
              <div className={`print-driver-readiness-row ${item.ready ? "success" : "warning"}`} key={item.key}>
                <span>{item.ready ? "通过" : "阻塞"}</span>
                <strong>{item.label}</strong>
                <small>{formatPrintDriverV1DeviceDetail(item)}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-row compact-empty">暂无设备门禁结果。</div>
        )}
      </div>
      {remainingRisks.length ? (
        <div className="print-driver-v1-risks">
          {remainingRisks.slice(0, 4).map((risk) => (
            <span key={risk}>{risk}</span>
          ))}
        </div>
      ) : null}
      <p className="print-driver-diagnostics-note">{getPrintDriverV1ReadinessNote(readinessState)}</p>
    </section>
  );
}

function getPrintDriverV1ReadinessSummary(readinessState = {}) {
  if (readinessState.loading) return { label: "读取中", tone: "neutral" };
  if (readinessState.source === "local_fallback") return { label: "后端未连", tone: "warning" };
  if (readinessState.error || readinessState.source === "api_error") return { label: "门禁异常", tone: "danger" };
  const readiness = readinessState.readiness;
  if (!readiness) return { label: "未读取", tone: "neutral" };
  if (readiness.ready) return { label: "V1 可验收", tone: "success" };
  const blockingCount = Number(readiness.summary?.blockingCount ?? 0);
  return { label: blockingCount ? `${blockingCount} 项阻塞` : "未就绪", tone: "danger" };
}

function getPrintDriverV1ReadinessSourceLabel(readinessState = {}) {
  if (readinessState.loading) return "读取中";
  if (readinessState.source === "api") return "后端门禁";
  if (readinessState.source === "local_fallback") return "本地降级";
  if (readinessState.source === "api_error") return "后端拒绝";
  if (readinessState.source === "idle") return "未读取";
  return "待确认";
}

function buildPrintDriverV1ReadinessRows(readiness = null) {
  const summary = readiness?.summary ?? {};
  const documents = Array.isArray(readiness?.requiredDocumentTypes) ? readiness.requiredDocumentTypes : [];
  const devices = Array.isArray(readiness?.deviceReadiness) ? readiness.deviceReadiness : [];
  const readyDevices = devices.filter((item) => item.ready).length;
  return [
    {
      label: "门禁状态",
      value: readiness?.ready ? "满足 V1 条件" : "未满足",
      meta: summary.label || "刷新后判断",
      tone: readiness?.ready ? "success" : "warning",
    },
    {
      label: "阻塞项",
      value: `${Number(summary.blockingCount ?? 0)} 项`,
      meta: `${Number(summary.passedCount ?? 0)}/${Number(summary.totalCount ?? 0)} 已通过`,
      tone: Number(summary.blockingCount ?? 0) ? "warning" : "success",
    },
    {
      label: "覆盖单据",
      value: `${documents.length} 类`,
      meta: documents.map(getPrintDriverDocumentTypeLabel).join(" / ") || "范围待补",
      tone: documents.length ? "success" : "warning",
    },
    {
      label: "设备组",
      value: `${readyDevices}/${devices.length} 通过`,
      meta: devices.map((item) => item.label).join(" / ") || "设备待补",
      tone: devices.length && readyDevices === devices.length ? "success" : "warning",
    },
  ];
}

function getPrintDriverV1ReadinessSafetyLabel(readiness = null) {
  if (!readiness) return "未读取安全护栏";
  const safeguards = readiness.safeguards ?? {};
  if (safeguards.physicalPrinterCalled) return "已触发物理打印：需检查";
  if (safeguards.commandValueExposed || safeguards.commandArgsExposed || safeguards.spoolPathExposed || safeguards.payloadExposed) {
    return "敏感信息暴露：需检查";
  }
  return safeguards.nonPrinting ? "门禁检查不触发实体打印" : "门禁安全状态待确认";
}

function formatPrintDriverV1DeviceSummary(devices = []) {
  if (!devices.length) return "0/0 通过";
  const readyCount = devices.filter((item) => item.ready).length;
  return `${readyCount}/${devices.length} 通过`;
}

function formatPrintDriverV1DeviceDetail(item = {}) {
  const device = item.printDevice;
  const qaLabel = item.latestFieldTestSummary?.label || (item.latestFieldTestRecord ? "QA 已记录" : "QA 待补");
  const paperLabel = [device?.paperName, device?.paperWidthMm && device?.paperHeightMm ? `${device.paperWidthMm}x${device.paperHeightMm}mm` : ""]
    .filter(Boolean)
    .join(" ");
  return [
    device?.name || "设备资料待补",
    `模式 ${device?.driverMode || "待补"}`,
    qaLabel,
    paperLabel,
  ].filter(Boolean).join(" · ");
}

function getPrintDriverDocumentTypeLabel(value) {
  const normalized = String(value ?? "").trim();
  const labels = {
    express_ltl_label: "快递快运标签",
    package_label: "包裹标签",
    outbound_note: "出库单",
    pickup_note: "自提单",
    delivery_note: "送货单",
  };
  return labels[normalized] ?? normalized;
}

function getPrintDriverV1ReadinessNote(readinessState = {}) {
  if (readinessState.source === "local_fallback") return "后端不可用时不能证明打印链路已满足 V1 上线条件。";
  const readiness = readinessState.readiness;
  if (!readiness) return "刷新后汇总配置、spool、CUPS 队列、设备模式和现场 QA。";
  if (readiness.ready) return "系统证据满足 V1 打印上线门禁；真实出纸、纸张对位和扫码仍按现场 QA 记录保留。";
  return "门禁仍有阻塞项，默认不能按真实打印链路上线。";
}

function PrintDriverDiagnosticsPanel({ driverState = {}, cupsDiagnosticsState = {}, onRefresh }) {
  const config = driverState.config;
  const summary = getPrintDriverDiagnosticsSummary(driverState);
  const sourceLabel = getPrintDriverDiagnosticsSourceLabel(driverState);
  const readinessChecklist = buildPrintDriverReadinessChecklist(config);
  const readinessSummary = getPrintDriverReadinessSummary(config);
  const cupsDiagnostics = cupsDiagnosticsState.diagnostics;
  const cupsSummary = getPrintDriverCupsDiagnosticsSummary(cupsDiagnosticsState);
  const cupsRows = buildPrintDriverCupsDiagnosticsRows(cupsDiagnostics);
  const cupsBlockers = Array.isArray(cupsDiagnostics?.blockers) ? cupsDiagnostics.blockers : [];
  const environmentPreflight = getPrintDriverEnvironmentPreflight(config);
  const integrationKit = buildOfficePrintDriverIntegrationKit({ config });
  const integrationKitSummary = getOfficePrintDriverIntegrationKitSummary(integrationKit);
  const statusText = driverState.error
    ? driverState.error
    : driverState.loading
      ? "正在读取后端打印驱动配置"
      : driverState.lastSyncedAt
        ? `最新同步 ${driverState.lastSyncedAt}`
        : "待刷新驱动诊断";
  const rows = buildPrintDriverDiagnosticsRows(config);

  return (
    <section className={`detail-section print-driver-diagnostics-section ${summary.tone}`}>
      <div className="section-title-row print-driver-diagnostics-head">
        <div>
          <h3>打印驱动诊断</h3>
          <small>{statusText}</small>
        </div>
        <div className="printer-device-qa-head-actions">
          <StatusPill tone={summary.tone}>{summary.label}</StatusPill>
          <button type="button" onClick={onRefresh} disabled={driverState.loading}>
            {driverState.loading ? "刷新中" : "刷新"}
          </button>
        </div>
      </div>
      <div className="print-driver-diagnostics-meta">
        <span>{sourceLabel}</span>
        <span>{getPrintDriverDiagnosticsSafetyLabel(config)}</span>
      </div>
      <div className="print-driver-diagnostics-grid">
        {rows.map((row) => (
          <div className={row.tone ?? ""} key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            <small>{row.meta}</small>
          </div>
        ))}
      </div>
      <div className="print-driver-readiness">
        <div className="print-driver-readiness-head">
          <strong>配置检查清单</strong>
          <span className={readinessSummary.tone}>{readinessSummary.label}</span>
        </div>
        <div className="print-driver-readiness-list">
          {readinessChecklist.map((item) => (
            <div className={`print-driver-readiness-row ${item.tone}`} key={item.key}>
              <span>{item.status}</span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="print-driver-readiness print-driver-cups-diagnostics">
        <div className="print-driver-readiness-head">
          <strong>CUPS 队列预检</strong>
          <span className={cupsSummary.tone}>{cupsSummary.label}</span>
        </div>
        {cupsRows.length ? (
          <div className="print-driver-readiness-list">
            {cupsRows.map((item) => (
              <div className={`print-driver-readiness-row ${item.tone}`} key={item.key}>
                <span>{item.status}</span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-row compact-empty">刷新后显示 CUPS 队列状态预检。</div>
        )}
        {cupsBlockers.length ? (
          <div className="print-driver-v1-risks">
            {cupsBlockers.slice(0, 3).map((item) => (
              <span key={item.key}>{item.detail || item.label}</span>
            ))}
          </div>
        ) : null}
      </div>
      {environmentPreflight.items.length ? (
        <div className="print-driver-readiness print-driver-environment-preflight">
          <div className="print-driver-readiness-head">
            <strong>本机环境预检</strong>
            <span className={environmentPreflight.summary.tone}>{environmentPreflight.summary.label}</span>
          </div>
          <div className="print-driver-readiness-list">
            {environmentPreflight.items.map((item) => (
              <div className={`print-driver-readiness-row ${item.tone}`} key={item.key}>
                <span>{item.statusLabel}</span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="print-driver-integration-kit">
        <div className="print-driver-readiness-head">
          <strong>{integrationKit.title}</strong>
          <span className={integrationKit.ready ? "success" : "warning"}>{integrationKit.version}</span>
        </div>
        <div className="print-driver-integration-summary">
          <strong>{integrationKitSummary}</strong>
          <small>
            模式 {integrationKit.commandBridge.mode} · 参数 {integrationKit.commandBridge.argumentTemplate.join(" ")} · 状态 pending→sent / completed→printed / failed→failed / canceled→canceled
          </small>
        </div>
        <div className="print-driver-integration-list">
          {integrationKit.items.map((item) => (
            <div className={`print-driver-integration-row ${item.tone}`} key={item.key}>
              <span>{item.ready ? "可联调" : "待配置"}</span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </div>
          ))}
        </div>
      </div>
      <p className="print-driver-diagnostics-note">{getPrintDriverDiagnosticsNote(driverState)}</p>
    </section>
  );
}

function getPrintDriverCupsDiagnosticsSummary(cupsDiagnosticsState = {}) {
  if (cupsDiagnosticsState.loading) return { label: "读取中", tone: "neutral" };
  if (cupsDiagnosticsState.source === "local_fallback") return { label: "后端未连", tone: "warning" };
  if (cupsDiagnosticsState.error || cupsDiagnosticsState.source === "api_error") return { label: "预检异常", tone: "danger" };
  const diagnostics = cupsDiagnosticsState.diagnostics;
  if (!diagnostics) return { label: "未读取", tone: "neutral" };
  if (diagnostics.ready) return { label: "队列可访问", tone: "success" };
  if (diagnostics.status === "not_configured") return { label: "未配置", tone: "warning" };
  return { label: "未通过", tone: "danger" };
}

function buildPrintDriverCupsDiagnosticsRows(diagnostics = null) {
  if (!diagnostics) return [];
  const preflight = diagnostics.preflightResult;
  const safeguardsOk =
    diagnostics.safeguards?.nonPrinting !== false &&
    !diagnostics.safeguards?.physicalPrinterCalled &&
    !diagnostics.safeguards?.printFileCreated &&
    !diagnostics.safeguards?.commandValueExposed &&
    !diagnostics.safeguards?.commandArgsExposed &&
    !diagnostics.safeguards?.stdoutExposed &&
    !diagnostics.safeguards?.stderrExposed &&
    !diagnostics.safeguards?.payloadExposed;
  return [
    {
      key: "cups-printer-configured",
      label: "CUPS 打印机名",
      status: diagnostics.cupsPrinterConfigured ? "通过" : "待配置",
      detail: diagnostics.cupsPrinterConfigured ? "后端已配置目标队列名" : "需配置目标 CUPS 打印机名",
      tone: diagnostics.cupsPrinterConfigured ? "success" : "warning",
    },
    {
      key: "cups-printer-allowlist",
      label: "队列白名单",
      status: diagnostics.cupsPrinterAllowed ? "通过" : "阻塞",
      detail: diagnostics.cupsPrinterAllowed
        ? "目标队列命中后端白名单"
        : "目标队列未命中白名单，不能进入真实打印验收",
      tone: diagnostics.cupsPrinterAllowed ? "success" : "warning",
    },
    {
      key: "cups-status-command",
      label: "状态命令",
      status: diagnostics.cupsStatusCommandRunnable ? "通过" : "阻塞",
      detail: diagnostics.cupsStatusCommandRunnable
        ? `状态命令可运行，仅回传字节数 stdout ${preflight?.stdoutBytes ?? 0} / stderr ${preflight?.stderrBytes ?? 0}`
        : `状态命令未通过${preflight?.errorCode ? `：${preflight.errorCode}` : ""}`,
      tone: diagnostics.cupsStatusCommandRunnable ? "success" : "warning",
    },
    {
      key: "cups-non-printing-safeguards",
      label: "安全护栏",
      status: safeguardsOk ? "通过" : "需检查",
      detail: safeguardsOk
        ? "不读取 payload、不生成打印文件、不提交实体打印、不暴露命令或输出内容"
        : "预检安全护栏异常，需检查命令、输出或实体打印调用是否暴露",
      tone: safeguardsOk ? "success" : "danger",
    },
  ];
}

function getPrintDriverEnvironmentPreflight(config = null) {
  const fallback = {
    summary: {
      label: "0/0 通过",
      tone: "warning",
      passedCount: 0,
      totalCount: 0,
      blockingCount: 0,
    },
    items: [],
  };
  if (!config?.environmentPreflight || !Array.isArray(config.environmentPreflight.items)) return fallback;
  return {
    ...fallback,
    ...config.environmentPreflight,
    summary: {
      ...fallback.summary,
      ...(config.environmentPreflight.summary ?? {}),
    },
  };
}

function getPrintDriverDiagnosticsSummary(driverState = {}) {
  if (driverState.loading) return { label: "读取中", tone: "neutral" };
  if (driverState.source === "local_fallback") return { label: "后端未连", tone: "warning" };
  if (driverState.error || driverState.source === "api_error") return { label: "配置异常", tone: "danger" };
  const config = driverState.config;
  if (!config) return { label: "未读取", tone: "neutral" };
  if (config.realDispatchAvailable && config.commandBridgeStatusReadbackAvailable) {
    return { label: "命令桥+回读", tone: "success" };
  }
  if (config.realDispatchAvailable) return { label: "可提交命令桥", tone: "blue" };
  if (config.dryRunEnabled) return { label: "Dry-run", tone: "warning" };
  if (!config.systemPrinterEnabled) return { label: "系统打印未启用", tone: "warning" };
  return { label: "真实派发已保护", tone: "warning" };
}

function getPrintDriverDiagnosticsSourceLabel(driverState = {}) {
  if (driverState.loading) return "读取中";
  if (driverState.source === "api") return "后端配置";
  if (driverState.source === "local_fallback") return "本地降级";
  if (driverState.source === "api_error") return "后端拒绝";
  if (driverState.source === "idle") return "未读取";
  return "待确认";
}

function buildPrintDriverDiagnosticsRows(config = null) {
  const safeConfig = config ?? {};
  const allowList = Array.isArray(safeConfig.allowedPrinterNames) ? safeConfig.allowedPrinterNames : [];
  return [
    {
      label: "适配器",
      value: getPrintDriverAdapterKindLabel(safeConfig.kind),
      meta: safeConfig.adapterName || "名称待补",
      tone: safeConfig.dryRunEnabled ? "warning" : "",
    },
    {
      label: "系统打印",
      value: safeConfig.systemPrinterEnabled ? "已启用" : "未启用",
      meta: safeConfig.dryRunEnabled ? "Dry-run 不触碰实体打印机" : "实体打印需后端环境变量开启",
      tone: safeConfig.systemPrinterEnabled ? "success" : "warning",
    },
    {
      label: "桥接方式",
      value: getPrintDriverBridgeKindLabel(safeConfig.systemPrinterAdapterKind),
      meta: safeConfig.systemPrinterCommandConfigured ? "命令已配置" : "命令未配置",
      tone: safeConfig.systemPrinterCommandConfigured ? "success" : "warning",
    },
    {
      label: "状态回读",
      value: safeConfig.commandBridgeStatusReadbackAvailable ? "可读本地 spool" : "未启用",
      meta: safeConfig.systemPrinterCommandTimeoutMs ? `${safeConfig.systemPrinterCommandTimeoutMs}ms 超时` : "无超时配置",
      tone: safeConfig.commandBridgeStatusReadbackAvailable ? "success" : "warning",
    },
    {
      label: "打印机白名单",
      value: allowList.length ? `${allowList.length} 台` : "未配置",
      meta: allowList.join(" / ") || "真实派发前必须限制目标设备",
      tone: allowList.length ? "success" : "warning",
    },
    {
      label: "真实派发",
      value: safeConfig.realDispatchAvailable ? "可提交命令桥" : "已保护",
      meta: safeConfig.safeguards?.physicalPrinterCallsBlocked ? "实体打印调用被保护" : "实体打印调用可达",
      tone: safeConfig.realDispatchAvailable ? "success" : "warning",
    },
  ];
}

function getPrintDriverAdapterKindLabel(value) {
  const normalized = String(value ?? "").trim();
  if (normalized === "dry_run_adapter") return "Dry-run";
  if (normalized === "guarded_adapter") return "Guarded";
  if (normalized === "unknown") return "未知";
  return normalized || "未读取";
}

function getPrintDriverBridgeKindLabel(value) {
  const normalized = String(value ?? "").trim();
  if (normalized === "command_bridge") return "命令桥";
  if (normalized === "none") return "未选择";
  if (normalized === "unsupported") return "不支持";
  if (normalized === "unknown") return "未知";
  return normalized || "未读取";
}

function getPrintDriverDiagnosticsSafetyLabel(config = null) {
  if (!config) return "未读取驱动保护状态";
  if (config.safeguards?.commandValueExposed) return "命令值暴露：需检查";
  if (config.safeguards?.physicalPrinterCallsBlocked) return "实体打印调用受保护";
  return "实体打印调用可达";
}

function getPrintDriverDiagnosticsNote(driverState = {}) {
  const config = driverState.config;
  if (driverState.source === "local_fallback") return "后端不可用时只显示保护性降级状态，不能据此判断实体打印已完成。";
  if (!config) return "刷新后查看后端驱动模式、命令桥和状态回读能力。";
  if (config.realDispatchAvailable && config.commandBridgeStatusReadbackAvailable) {
    return "可提交命令桥；是否完成仍以本地 spool 状态回读和现场验收为准。";
  }
  if (config.realDispatchAvailable) return "可提交命令桥；提交成功不等于纸张已打出，仍需现场验收。";
  return "真实派发当前被保护；打印作业可预览或排队，但不能视为实体打印完成。";
}

function PrintJobQueuePanel({
  queueState = {},
  dispatchState = {},
  retryState = {},
  onRefresh,
  onDispatch,
  onRetry,
}) {
  const items = Array.isArray(queueState.items) ? queueState.items.filter(Boolean) : [];
  const visibleItems = items.slice(0, 6);
  const failedCount = items.filter((item) => item.jobStatus === "failed").length;
  const queuedCount = items.filter((item) => item.jobStatus === "queued").length;
  const sourceLabel = getPrintJobQueueSourceLabel(queueState);
  const sourceTone = queueState.error ? "danger" : queueState.source === "api" ? "success" : queueState.source === "idle" ? "neutral" : "warning";
  const statusText = queueState.error
    ? queueState.error
    : queueState.loading
      ? "正在读取后端打印作业状态"
      : queueState.lastSyncedAt
        ? `最新同步 ${queueState.lastSyncedAt}`
        : "待刷新打印作业";

  return (
    <section className="detail-section print-job-queue-section">
      <div className="section-title-row print-job-queue-head">
        <div>
          <h3>打印作业池</h3>
          <small>{statusText}</small>
        </div>
        <div className="printer-device-qa-head-actions">
          <StatusPill tone={sourceTone}>{sourceLabel}</StatusPill>
          <button type="button" onClick={onRefresh} disabled={queueState.loading}>
            {queueState.loading ? "刷新中" : "刷新"}
          </button>
        </div>
      </div>
      <div className="print-job-stats">
        <span>最近 {items.length}</span>
        <span>待派发 {queuedCount}</span>
        <span className={failedCount ? "danger" : ""}>失败 {failedCount}</span>
      </div>
      {visibleItems.length ? (
        <div className="print-job-list">
          {visibleItems.map((printJob) => {
            const statusTone = getPrintJobStatusTone(printJob.jobStatus);
            const canDispatch = printJob.jobStatus === "queued";
            const canRetry = printJob.jobStatus === "failed" || printJob.jobStatus === "canceled";
            const actionState = canDispatch ? dispatchState : canRetry ? retryState : {};
            const busy = queueState.actionJobId === printJob.printJobId;
            const actionBlockedByOther = Boolean(queueState.actionJobId && !busy);
            const actionDisabled = Boolean(actionState.disabled || queueState.loading || actionBlockedByOther || (!canDispatch && !canRetry));
            const actionTitle =
              actionState.title ||
              (actionBlockedByOther
                ? "已有打印作业操作进行中"
                : !canDispatch && !canRetry
                  ? "当前状态不需要办公室手动操作"
                  : "");
            return (
              <div className={`print-job-row ${statusTone}`} key={printJob.printJobId}>
                <div className="print-job-main">
                  <div>
                    <strong>{printJob.printJobId}</strong>
                    <StatusPill tone={statusTone}>{getPrintJobStatusLabel(printJob.jobStatus)}</StatusPill>
                  </div>
                  <span>{getPrintJobSummary(printJob)}</span>
                  <small>{getPrintJobMetaText(printJob)}</small>
                  {printJob.errorMessage ? <em>{printJob.errorMessage}</em> : null}
                </div>
                <div className="print-job-actions">
                  {canDispatch ? (
                    <button type="button" disabled={actionDisabled} title={actionTitle} onClick={() => onDispatch?.(printJob.printJobId)}>
                      {busy ? "派发中" : "派发"}
                    </button>
                  ) : canRetry ? (
                    <button type="button" disabled={actionDisabled} title={actionTitle} onClick={() => onRetry?.(printJob.printJobId)}>
                      {busy ? "重试中" : "重试"}
                    </button>
                  ) : (
                    <span>{getPrintJobActionHint(printJob.jobStatus)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-row">暂无打印作业，打印单据后会在这里显示队列状态。</div>
      )}
    </section>
  );
}

function getPrintJobQueueSourceLabel(queueState = {}) {
  if (queueState.loading) return "刷新中";
  if (queueState.error) return "作业异常";
  if (queueState.source === "api") return "后端作业";
  if (queueState.source === "local_fallback") return "本地降级";
  if (queueState.source === "idle") return "未读取";
  return "待确认";
}

function getPrintJobStatusLabel(status) {
  const normalized = String(status ?? "").trim();
  const labels = {
    queued: "待派发",
    sent: "已派发",
    printed: "已打印",
    failed: "失败",
    canceled: "已取消",
    preview_only: "仅预览",
  };
  return (labels[normalized] ?? normalized) || "状态待补";
}

function getPrintJobStatusTone(status) {
  if (status === "printed") return "success";
  if (status === "sent") return "blue";
  if (status === "queued") return "warning";
  if (status === "failed") return "danger";
  if (status === "canceled") return "neutral";
  return "neutral";
}

function getPrintJobDocumentLabel(documentType) {
  const normalized = String(documentType ?? "").trim();
  const labels = {
    express_ltl_label: "包裹标签",
    package_label: "包裹标签",
    pickup_note: "自提单",
    delivery_note: "送货单",
    outbound_note: "出库单",
  };
  return (labels[normalized] ?? normalized) || "单据待补";
}

function getPrintJobSummary(printJob = {}) {
  return [
    getPrintJobDocumentLabel(printJob.documentType),
    printJob.targetId,
    printJob.printDeviceName || printJob.printDeviceId || "设备待补",
  ].filter(Boolean).join(" / ");
}

function getPrintJobMetaText(printJob = {}) {
  const attemptNo = Number(printJob.attemptNo ?? 0);
  return [
    printJob.printRecordId,
    attemptNo > 0 ? `第 ${attemptNo} 次` : "首次",
    printJob.driverMode || "驱动待补",
    formatPrintJobTimeLabel(printJob.updatedAt || printJob.finishedAt || printJob.sentAt || printJob.queuedAt || printJob.createdAt),
  ].filter(Boolean).join(" · ");
}

function getPrintJobActionHint(status) {
  if (status === "preview_only") return "预览";
  if (status === "sent") return "等回写";
  if (status === "printed") return "完成";
  return "无操作";
}

function formatPrintJobTimeLabel(value) {
  if (!value) return "时间待补";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
