import { useEffect, useRef, useState } from "react";
import { DataTable, DetailPane, InfoGrid, MetricStrip, Segmented, StatusPill, Timeline } from "../../components/ui.jsx";
import {
  applyDriverPackageScan,
  getDriverLoadPackageCheckState,
  getDriverNavigationUrl,
  getDriverRouteExecutionContext,
  getDriverRouteLabel,
  getDriverRouteStopLabel,
} from "../../services/driverMobileApiClient.js";
import {
  DRIVER_DEVICE_FIELD_TEST_STATUS_OPTIONS,
  appendDriverDeviceFieldTestNote,
  applyDriverPackageCameraFieldTestSignal,
  applyDriverPackageLabelScanFieldTestSignal,
  buildDriverDeviceFieldTestRecord,
  buildDriverPackageLabelScanSample,
  createDriverDeviceFieldTestChecks,
  getDriverDeviceFieldTestContext,
  getDriverDeviceFieldTestSummary,
  getDriverPackageLabelScanSampleSummary,
  updateDriverDeviceFieldTestCheck,
} from "../../services/driverDeviceFieldTestClient.js";
import {
  PRINTER_DEVICE_FIELD_TEST_EVIDENCE_ITEMS,
  PRINTER_DEVICE_FIELD_TEST_STATUS_OPTIONS,
  getPrinterDeviceFieldTestEvidenceSummary,
  getPrinterDeviceFieldTestSummary,
} from "../../services/printerDeviceFieldTestClient.js";
import {
  captureDriverDeliveryPhotoFromVideo,
  startDriverDeliveryPhotoCamera,
} from "../../services/driverCameraPhotoClient.js";
import { getDriverDeviceReadiness } from "../../services/driverDeviceReadinessClient.js";
import { startDriverPackageCameraScanner } from "../../services/driverPackageCameraScannerClient.js";
import {
  getDriverNativePackageScannerSupport,
  requestDriverNativePackageLabelScan,
} from "../../services/driverNativeBridgeClient.js";
import {
  getDriverNativeNavigationSupport,
  requestDriverNativeNavigation,
} from "../../services/driverNativeNavigationBridgeClient.js";
import { getDriverNativeCapabilityDiagnostics } from "../../services/driverNativeCapabilityClient.js";
import {
  buildDriverNativeIntegrationKit,
  getDriverNativeIntegrationKitSummary,
} from "../../services/driverNativeIntegrationKitClient.js";
import {
  buildPrintDriverReadinessChecklist,
  getPrintDriverReadinessSummary,
} from "../../services/officePrintDriverConfigApiClient.js";
import {
  buildOfficePrintDriverIntegrationKit,
  getOfficePrintDriverIntegrationKitSummary,
} from "../../services/officePrintDriverIntegrationKitClient.js";

const PRINT_DRIVER_MODE_OPTIONS = [
  { value: "preview_only", label: "仅预览" },
  { value: "system_printer", label: "系统打印" },
];


export { TodoPage } from "../../features/todos/TodoPage.jsx";

export { V1StatusPage } from "../../features/v1-status/V1StatusPage.jsx";

export { EntryPage } from "../../features/orders/EntryPage.jsx";

export { OrderPoolPage } from "../../features/orders/OrderPoolPage.jsx";

export { InventoryPage } from "../../features/inventory/InventoryPage.jsx";

export { RawMaterialInboundPage } from "../../features/raw-materials/RawMaterialInboundPage.jsx";

export { MasterDataMaintenancePage } from "../../features/master-data/MasterDataMaintenancePage.jsx";


export { FulfillmentPage } from "../../features/fulfillment/FulfillmentPage.jsx";

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

export function WorkshopMobilePage({ orderLines, inventoryRecords, productionPacking, onAction, helpers }) {
  const {
    buildProductionTaskId,
    findCustomer,
    findProductionInventoryItem,
    getLineColorSpecLabel,
    getLinePrintSide,
    getLineRemark,
    getOrderLineShortNo,
    getUiActionState,
    statusTone,
  } = helpers;
  const taskListFromApi = isProductionPackingTaskListFromApi(productionPacking);
  const taskListStatusText = getProductionPackingTaskListStatusText(productionPacking);
  const apiProductionLines = Array.isArray(productionPacking.productionTasks) ? productionPacking.productionTasks.filter(Boolean) : [];
  const productionLines = taskListFromApi ? apiProductionLines.filter(isProductionReportCandidate) : orderLines.filter(isProductionReportCandidate);
  const allPackingTasks = buildPackingTaskRows({
    orderLines,
    packingTasks: productionPacking.packingTasks,
    includeLocalProjections: !taskListFromApi,
  });
  const openPackingTasks = allPackingTasks.filter((task) => task.status !== "已完成");
  const [mode, setMode] = useState(productionLines.length ? "生产报工" : "打包任务");
  const [selectedProductionLineId, setSelectedProductionLineId] = useState(productionLines[0]?.id ?? "");
  const [selectedPackingTaskId, setSelectedPackingTaskId] = useState(openPackingTasks[0]?.packingTaskId ?? "");
  const [reportInputs, setReportInputs] = useState({});
  const [packingInputs, setPackingInputs] = useState({});
  const [finishedPhotoInputs, setFinishedPhotoInputs] = useState({});
  const selectedProductionLine = productionLines.find((item) => item.id === selectedProductionLineId) ?? productionLines[0] ?? null;
  const selectedPackingTask = openPackingTasks.find((item) => item.packingTaskId === selectedPackingTaskId) ?? openPackingTasks[0] ?? null;
  const resolveInventoryItem = (line, task = null) => findProductionInventoryItem(line, inventoryRecords) ?? line?.inventoryItem ?? task?.inventoryItem ?? null;
  const selectedLine = mode === "打包任务" ? selectedPackingTask?.orderLine : selectedProductionLine;
  const selectedInventoryItem = selectedLine ? resolveInventoryItem(selectedLine, selectedPackingTask) : null;
  const reportState = getUiActionState("workshopMobile", "报工完成");
  const reportDailyState = getUiActionState("workshopMobile", "报当日数量");
  const uploadFinishedPhotoState = getUiActionState("workshopMobile", "上传成品图");
  const packingState = getUiActionState("workshopMobile", "提交打包完成");
  const selectedFinishedGoodsPhoto = getProductionFinishedGoodsPhoto(selectedProductionLine);
  const selectedFinishedGoodsPhotoFile = selectedProductionLine ? finishedPhotoInputs[selectedProductionLine.id]?.file ?? null : null;
  const selectedFinishedGoodsPhotoRequired = isProductionFinishedGoodsPhotoRequired(selectedProductionLine);
  const reportQualifiedQty = getNumericInput(reportInputs, selectedProductionLine?.id, "qualifiedQty", selectedProductionLine?.qty ?? 0);
  const reportExceptionQty = getNumericInput(reportInputs, selectedProductionLine?.id, "exceptionQty", 0);
  const reportMachineCount = getNumericInput(reportInputs, selectedProductionLine?.id, "machineCount", "");
  const packingActualQty = getNumericInput(packingInputs, selectedPackingTask?.packingTaskId, "actualPackedQty", selectedPackingTask?.plannedQty ?? 0);
  const packingPackageCount = getNumericInput(packingInputs, selectedPackingTask?.packingTaskId, "packageCount", selectedPackingTask?.packageCount ?? inferPackageCountFromQty(selectedPackingTask?.plannedQty));
  const packingLabelsPrinted = getBooleanInput(packingInputs, selectedPackingTask?.packingTaskId, "labelsPrinted", false);
  const stats = [
    ["生产待报工", productionLines.length, productionLines.length ? "warning" : "success"],
    ["跨日继续", productionLines.filter((line) => getProductionDailyProgress(line)?.carryOver).length, "blue"],
    ["打包待提交", openPackingTasks.length, openPackingTasks.length ? "blue" : "success"],
    ["已打包", allPackingTasks.filter((task) => task.status === "已完成").length, "success"],
  ];
  const reportDisabled = reportState.disabled || !selectedProductionLine || !selectedInventoryItem;
  const reportTitle = reportState.title || (!selectedInventoryItem ? "未找到匹配库存键，不能报工入库" : "");
  const reportDailyDisabled = reportDailyState.disabled || !selectedProductionLine;
  const reportDailyTitle = reportDailyState.title || "";
  const finishedPhotoUploadDisabled = uploadFinishedPhotoState.disabled || !selectedProductionLine || !selectedFinishedGoodsPhotoRequired;
  const finishedPhotoUploadTitle =
    uploadFinishedPhotoState.title ||
    (!selectedProductionLine
      ? "请先选择生产任务"
      : !selectedFinishedGoodsPhotoRequired
        ? "当前任务不强制上传成品图"
        : selectedFinishedGoodsPhotoFile
          ? `上传 ${selectedFinishedGoodsPhotoFile.name || "所选成品图"}`
          : "未选择文件时会登记一张样张，用于原型验证");
  const packingDisabled = packingState.disabled || !selectedPackingTask;
  const packingTitle = packingState.title || "";

  function selectProductionLine(lineId) {
    setSelectedProductionLineId(lineId);
    setMode("生产报工");
  }

  function selectPackingTask(taskId) {
    setSelectedPackingTaskId(taskId);
    setMode("打包任务");
  }

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

  function updateFinishedPhotoFile(file) {
    if (!selectedProductionLine) return;
    setFinishedPhotoInputs((current) => ({
      ...current,
      [selectedProductionLine.id]: {
        ...(current[selectedProductionLine.id] ?? {}),
        file: file ?? null,
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
    <section className="page-grid workshop-mobile-layout">
      <div className="table-pane">
        <MetricStrip items={stats} />
        <div className="panel-head compact mobile-work-head">
          <div>
            <h2>移动任务池</h2>
            <span>车间只报合格数和机器计数；打包只报实包数和包裹数。{taskListStatusText}</span>
          </div>
          <Segmented value={mode} onChange={setMode} items={["生产报工", "打包任务"]} />
        </div>
        <div className="mobile-task-list">
          {mode === "生产报工" ? (
            productionLines.length ? productionLines.map((line) => {
              const customer = findCustomer(line.customerId);
              const inventoryItem = resolveInventoryItem(line);
              const lineTitle = `${getProductionProcessLabel(line)} · ${getOrderLineShortNo(line)}`;
              return (
                <button className={`mobile-task-row ${line.id === selectedProductionLine?.id ? "active" : ""}`} key={line.id} onClick={() => selectProductionLine(line.id)}>
                  <div>
                    <strong>{lineTitle}</strong>
                    <span>{customer.name} · {line.product} {line.size}</span>
                    <small>{getLineColorSpecLabel(line)} · {line.qty} 个 · {formatProductionDailyProgressLabel(line) || line.latest}</small>
                  </div>
                  <StatusPill tone={inventoryItem ? statusTone(line.status) : "danger"}>{inventoryItem ? line.status : "缺库存键"}</StatusPill>
                </button>
              );
            }) : <div className="empty-row">暂无待报工生产任务</div>
          ) : (
            openPackingTasks.length ? openPackingTasks.map((task) => {
              const line = task.orderLine;
              const customer = findCustomer(line.customerId);
              return (
                <button className={`mobile-task-row ${task.packingTaskId === selectedPackingTask?.packingTaskId ? "active" : ""}`} key={task.packingTaskId} onClick={() => selectPackingTask(task.packingTaskId)}>
                  <div>
                    <strong>打包 · {getOrderLineShortNo(line)}</strong>
                    <span>{customer.name} · {line.product} {line.size}</span>
                    <small>{getLineColorSpecLabel(line)} · 计划 {task.plannedQty} 个 · {task.packageCount ?? inferPackageCountFromQty(task.plannedQty)} 包</small>
                  </div>
                  <StatusPill tone={statusTone(task.status)}>{task.status}</StatusPill>
                </button>
              );
            }) : <div className="empty-row">暂无待打包任务</div>
          )}
        </div>
      </div>
      <DetailPane
        title={mode === "打包任务" ? selectedPackingTask?.packingTaskId ?? "打包任务" : selectedProductionLine ? buildProductionTaskId(selectedProductionLine) : "生产报工"}
        subtitle={selectedLine ? `${findCustomer(selectedLine.customerId).name} · ${selectedLine.id}` : "未选择"}
      >
        {selectedLine ? (
          <>
            <InfoGrid
              rows={[
                ["岗位入口", mode === "打包任务" ? "打包工手机端" : `${getProductionProcessLabel(selectedLine)}手机端`],
                ["货品", `${selectedLine.product} / ${selectedLine.size}`],
                ["颜色/单双面", `${getLineColorSpecLabel(selectedLine)} / ${getLinePrintSide(selectedLine)}`],
                ["数量", `${selectedLine.qty} 个`],
                ["交付", `${selectedLine.fulfillment} · ${selectedLine.latest}`],
                ["库存键", selectedInventoryItem ? `${selectedInventoryItem.id} / ${selectedInventoryItem.zone}` : "未找到匹配库存键"],
                ["跨日进度", formatProductionDailyProgressLabel(selectedLine) || "暂无日报数"],
                ["成品图", mode === "生产报工" ? formatProductionFinishedGoodsPhotoLabel(selectedFinishedGoodsPhoto) : "生产侧确认"],
                ["备注", getLineRemark(selectedLine) || "无"],
              ]}
            />
            {mode === "生产报工" ? (
              <>
                <section className="detail-section">
                  <h3>车间报工</h3>
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
                  <p>报当日数量只记录跨日继续和剩余数量，不入库；报工完成才会进入库存和后续打包。</p>
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
                      ["当前附件", selectedFinishedGoodsPhoto.fileName || selectedFinishedGoodsPhoto.attachmentId || "未上传"],
                      ["上传时间", selectedFinishedGoodsPhoto.uploadedAt ? formatCompactDateTime(selectedFinishedGoodsPhoto.uploadedAt) : "未上传"],
                      ["办公室复核", selectedFinishedGoodsPhoto.reviewedAt ? formatCompactDateTime(selectedFinishedGoodsPhoto.reviewedAt) : "待确认"],
                      ["退回原因", selectedFinishedGoodsPhoto.rejectedReason || "无"],
                    ]}
                  />
                  <div className="detail-form single">
                    <label>
                      <span>拍照/选择图片</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={finishedPhotoUploadDisabled}
                        onChange={(event) => updateFinishedPhotoFile(event.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>
                  <p>车间只上传或重拍成品图；是否合格和是否通知客户由办公室复核确认。</p>
                  <div className="action-row">
                    <button
                      disabled={finishedPhotoUploadDisabled}
                      title={finishedPhotoUploadTitle}
                      onClick={() =>
                        onAction("上传成品图", {
                          entryLabel: "车间手机端",
                          orderLineId: selectedProductionLine.id,
                          orderLine: selectedProductionLine,
                          productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
                          photoFile: selectedFinishedGoodsPhotoFile,
                        })
                      }
                    >
                      {selectedFinishedGoodsPhoto.attachmentId ? "重拍/重传成品图" : "上传成品图"}
                    </button>
                  </div>
                </section>
                <div className="action-row">
                  <button
                    disabled={reportDailyDisabled}
                    title={reportDailyTitle}
                    onClick={() =>
                      onAction("报当日数量", {
                        entryLabel: "车间手机端",
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
                        entryLabel: "车间手机端",
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
                  <h3>打包提交</h3>
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
                  <p>打包完成生成包裹和标签下一步；不会扣库存，仍由出库完成或快递快运拉走确认扣减。</p>
                </section>
                <div className="action-row">
                  <button
                    className="primary-action"
                    disabled={packingDisabled}
                    title={packingTitle}
                    onClick={() =>
                      onAction("提交打包完成", {
                        entryLabel: "打包手机端",
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
                mode === "打包任务" ? "生产完成进入打包手机端" : "发布任务到车间手机端",
                mode === "打包任务" ? "打包工填写实包数量和包裹数" : "岗位工填写合格数量和机器计数",
                mode === "打包任务" ? "包裹进入标签/出库下一步" : "合格品入库并占用给订单",
                "关键动作写后端 API 和操作日志",
              ]}
            />
          </>
        ) : (
          <div className="empty-row">当前岗位暂无任务</div>
        )}
      </DetailPane>
    </section>
  );
}

export function DriverMobilePage({ tasks = [], selectedTaskId, setSelectedTaskId, meta = {}, onAction, helpers }) {
  const { currentUser, getUiActionState, statusTone } = helpers;
  const [view, setView] = useState("待送货");
  const [taskInputs, setTaskInputs] = useState({});
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState({ watermarked: "", signature: "" });
  const packageCameraVideoRef = useRef(null);
  const packageCameraScannerRef = useRef(null);
  const deliveryPhotoVideoRef = useRef(null);
  const deliveryPhotoCameraRef = useRef(null);
  const visibleTasks = tasks.filter((task) => view === "全部" || task.status === view);
  const selectedTask =
    visibleTasks.find((item) => item.fulfillmentId === selectedTaskId) ??
    visibleTasks[0] ??
    tasks.find((item) => item.fulfillmentId === selectedTaskId) ??
    tasks[0] ??
    null;
  const currentInput = taskInputs[selectedTask?.fulfillmentId] ?? {};
  const watermarkedPhotoFile = currentInput.watermarkedPhotoFile ?? null;
  const signaturePhotoFile = currentInput.signaturePhotoFile ?? null;
  const watermarkedPhotoAttachmentId = currentInput.watermarkedPhotoAttachmentId ?? selectedTask?.watermarkedPhotoAttachmentId ?? "";
  const signaturePhotoAttachmentId = currentInput.signaturePhotoAttachmentId ?? selectedTask?.signaturePhotoAttachmentId ?? "";
  const watermarkedPhotoAttached =
    currentInput.watermarkedPhotoAttached === true ||
    Boolean(watermarkedPhotoFile) ||
    Boolean(watermarkedPhotoAttachmentId) ||
    selectedTask?.watermarkedPhotoAttached === true;
  const signaturePhotoAttached =
    currentInput.signaturePhotoAttached === true ||
    Boolean(signaturePhotoFile) ||
    Boolean(signaturePhotoAttachmentId) ||
    selectedTask?.signaturePhotoAttached === true;
  const receiverName = currentInput.receiverName ?? selectedTask?.receiverName ?? "";
  const paperNoteStatus = currentInput.paperNoteStatus ?? selectedTask?.paperNoteStatus ?? "已交回";
  const watermarkLocationLabel = currentInput.watermarkLocationLabel ?? selectedTask?.watermarkLocationLabel ?? selectedTask?.addressArea ?? "";
  const watermarkGeoPoint = currentInput.watermarkGeoPoint ?? selectedTask?.watermarkGeoPoint ?? "";
  const watermarkLocationStatus = currentInput.watermarkLocationStatus ?? "";
  const deliveryPhotoCameraActive = currentInput.deliveryPhotoCameraActive === true;
  const deliveryPhotoCameraStatus = currentInput.deliveryPhotoCameraStatus ?? "";
  const exceptionReason = currentInput.exceptionReason ?? "装车少货";
  const remark = currentInput.remark ?? "";
  const actualQty = currentInput.actualQty ?? selectedTask?.qty ?? 0;
  const checkedPackageIds = currentInput.checkedPackageIds ?? selectedTask?.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
  const packageScanText = currentInput.packageScanText ?? "";
  const packageScanStatus = currentInput.packageScanStatus ?? "";
  const packageCameraScanActive = currentInput.packageCameraScanActive === true;
  const packageCameraScanStatus = currentInput.packageCameraScanStatus ?? "";
  const packageNativeScanActive = currentInput.packageNativeScanActive === true;
  const nativePackageScanSupport = getDriverNativePackageScannerSupport();
  const packageNativeScanStatus = currentInput.packageNativeScanStatus ?? nativePackageScanSupport.message;
  const nativeNavigationActive = currentInput.nativeNavigationActive === true;
  const nativeNavigationSupport = getDriverNativeNavigationSupport();
  const nativeNavigationStatus = currentInput.nativeNavigationStatus ?? nativeNavigationSupport.message;
  const nativeNavigationStatusTone = currentInput.nativeNavigationStatusTone ?? (nativeNavigationSupport.supported ? "success" : "neutral");
  const nativeCapabilityDiagnostics = getDriverNativeCapabilityDiagnostics();
  const watermarkPreview = selectedTask
    ? buildDriverWatermarkPreview({
        task: selectedTask,
        currentUser,
        watermarkLocationLabel,
        watermarkGeoPoint,
      })
    : null;
  const watermarkPreviewLines = getDriverWatermarkOverlayLines(watermarkPreview?.text);
  const routeContext = selectedTask ? getDriverRouteExecutionContext(tasks, selectedTask) : null;
  const navigationUrl = selectedTask ? getDriverNavigationUrl(selectedTask) : "";
  const nativeIntegrationKit = selectedTask
    ? buildDriverNativeIntegrationKit({
        task: selectedTask,
        operatorId: currentUser.userId ?? currentUser.id,
        navigationUrl,
        geoPoint: watermarkGeoPoint,
      })
    : null;
  const nativeIntegrationKitSummary = getDriverNativeIntegrationKitSummary(nativeIntegrationKit);
  const packageCheckState = selectedTask ? getDriverLoadPackageCheckState(selectedTask, checkedPackageIds) : { checklist: [], allChecked: true, summary: "无包裹" };
  const loadBlockedByPackageCheck = selectedTask?.status === "待送货" && !packageCheckState.allChecked;
  const loadState = getUiActionState("driverMobile", "确认已装车");
  const completeState = getUiActionState("driverMobile", "提交送达");
  const exceptionAction = selectedTask?.status === "待送货" ? "装车异常" : "送货异常";
  const exceptionState = getUiActionState("driverMobile", exceptionAction);
  const fieldTestSaveState = getUiActionState("driverMobile", "保存验收");
  const stats = [
    ["待送货", tasks.filter((item) => item.status === "待送货").length, "warning"],
    ["配送中", tasks.filter((item) => item.status === "配送中").length, "blue"],
    ["已完成", tasks.filter((item) => item.status === "已完成").length, "success"],
    ["异常", tasks.filter((item) => item.status === "送货异常").length, "danger"],
  ];
  const sourceText = meta.loading
    ? "同步中"
    : meta.source === "api"
      ? `后端 API${meta.lastSyncedAt ? ` · ${meta.lastSyncedAt}` : ""}`
      : "本地任务";
  const deviceReadiness = getDriverDeviceReadiness();
  const fieldTestContext = getDriverDeviceFieldTestContext();
  const deviceFieldTestChecks = currentInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
  const deviceFieldTestSummary = getDriverDeviceFieldTestSummary(deviceFieldTestChecks);
  const deviceFieldTestRecord = currentInput.deviceFieldTestRecord ?? selectedTask?.deviceFieldTestRecord ?? null;
  const packageLabelScanSample = currentInput.packageLabelScanSample ?? deviceFieldTestRecord?.packageLabelScanSample ?? null;
  const packageLabelScanSampleSummary = getDriverPackageLabelScanSampleSummary(packageLabelScanSample);
  const nativeBridgeFieldTestSnapshot =
    currentInput.nativeBridgeDiagnostics ?? deviceFieldTestRecord?.nativeBridgeDiagnostics ?? nativeCapabilityDiagnostics;
  const nativeBridgeFieldTestSnapshotText = (nativeBridgeFieldTestSnapshot?.items ?? [])
    .map((item) => `${item.label}${item.statusLabel} · ${item.bridgeTypeLabel}`)
    .join("；");
  const deviceFieldTestDeviceLabel = currentInput.deviceFieldTestDeviceLabel ?? fieldTestContext.deviceLabel;
  const deviceFieldTestBrowserLabel = currentInput.deviceFieldTestBrowserLabel ?? fieldTestContext.browserLabel;
  const deviceFieldTestNote = currentInput.deviceFieldTestNote ?? "";
  const deviceFieldTestStatus = currentInput.deviceFieldTestStatus ?? (deviceFieldTestRecord ? `已保存：${deviceFieldTestRecord.summary?.label ?? "现场验收记录"}` : "未保存现场验收记录");

  useEffect(() => {
    const nextUrls = { watermarked: "", signature: "" };
    if (typeof URL !== "undefined" && watermarkedPhotoFile) {
      nextUrls.watermarked = URL.createObjectURL(watermarkedPhotoFile);
    }
    if (typeof URL !== "undefined" && signaturePhotoFile) {
      nextUrls.signature = URL.createObjectURL(signaturePhotoFile);
    }
    setPhotoPreviewUrls(nextUrls);
    return () => {
      Object.values(nextUrls).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [selectedTask?.fulfillmentId, watermarkedPhotoFile, signaturePhotoFile]);

  useEffect(() => {
    return () => {
      stopPackageCameraScan({ silent: true });
      stopDeliveryPhotoCamera({ silent: true });
    };
  }, [selectedTask?.fulfillmentId]);

  function selectTask(taskId) {
    setSelectedTaskId(taskId);
  }

  function updateTaskInput(field, value) {
    if (!selectedTask) return;
    setTaskInputs((current) => ({
      ...current,
      [selectedTask.fulfillmentId]: {
        ...(current[selectedTask.fulfillmentId] ?? {}),
        [field]: value,
      },
    }));
  }

  function updateDeviceFieldTestCheck(key, status) {
    if (!selectedTask) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[selectedTask.fulfillmentId] ?? {};
      const currentChecks = currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
      return {
        ...current,
        [selectedTask.fulfillmentId]: {
          ...currentTaskInput,
          deviceFieldTestChecks: updateDriverDeviceFieldTestCheck(currentChecks, key, status, deviceReadiness),
          deviceFieldTestStatus: "现场验收记录未保存",
        },
      };
    });
  }

  function applyPackageCameraFieldTestSignal(taskId, signal) {
    if (!taskId) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[taskId] ?? {};
      const currentChecks = currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
      const nextChecks = applyDriverPackageCameraFieldTestSignal(currentChecks, signal, deviceReadiness);
      const nextTaskInput = {
        ...currentTaskInput,
        deviceFieldTestChecks: nextChecks,
        deviceFieldTestStatus: "现场验收记录未保存",
      };
      if (signal.message) {
        nextTaskInput.deviceFieldTestNote = appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, signal.message);
      }
      return {
        ...current,
        [taskId]: nextTaskInput,
      };
    });
  }

  async function saveDeviceFieldTestRecord() {
    if (!selectedTask) return;
    const taskSnapshot = selectedTask;
    const currentTaskInput = taskInputs[taskSnapshot.fulfillmentId] ?? {};
    const currentChecks = currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
    const record = buildDriverDeviceFieldTestRecord({
      task: taskSnapshot,
      currentUser,
      deviceLabel: currentTaskInput.deviceFieldTestDeviceLabel ?? deviceFieldTestDeviceLabel,
      browserLabel: currentTaskInput.deviceFieldTestBrowserLabel ?? deviceFieldTestBrowserLabel,
      note: currentTaskInput.deviceFieldTestNote ?? deviceFieldTestNote,
      readiness: deviceReadiness,
      checks: currentChecks,
      packageLabelScanSample: currentTaskInput.packageLabelScanSample ?? deviceFieldTestRecord?.packageLabelScanSample,
      nativeBridgeDiagnostics: nativeCapabilityDiagnostics,
    });
    updateTaskInput("deviceFieldTestStatus", "现场验收保存中");
    const result = await onAction?.("保存验收", {
      fulfillmentId: taskSnapshot.fulfillmentId,
      task: taskSnapshot,
      record,
    });
    if (result?.blocked) {
      updateTaskInput("deviceFieldTestStatus", "现场验收保存失败");
      return;
    }
    const savedRecord = result?.record ?? record;
    setTaskInputs((current) => {
      const nextTaskInput = current[taskSnapshot.fulfillmentId] ?? {};
      return {
        ...current,
        [taskSnapshot.fulfillmentId]: {
          ...nextTaskInput,
          deviceFieldTestChecks: savedRecord.checks,
          deviceFieldTestRecord: savedRecord,
          deviceFieldTestDeviceLabel: savedRecord.deviceLabel,
          deviceFieldTestBrowserLabel: savedRecord.browserLabel,
          packageLabelScanSample: savedRecord.packageLabelScanSample,
          nativeBridgeDiagnostics: savedRecord.nativeBridgeDiagnostics,
          deviceFieldTestStatus: `已保存：${savedRecord.summary.label}`,
        },
      };
    });
  }

  function togglePackageCheck(packageId) {
    if (!selectedTask) return;
    const safePackageId = String(packageId ?? "").trim();
    if (!safePackageId) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[selectedTask.fulfillmentId] ?? {};
      const currentIds = Array.isArray(currentTaskInput.checkedPackageIds)
        ? currentTaskInput.checkedPackageIds
        : selectedTask.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
      const exists = currentIds.includes(safePackageId);
      const nextIds = exists ? currentIds.filter((item) => item !== safePackageId) : [...currentIds, safePackageId];
      return {
        ...current,
        [selectedTask.fulfillmentId]: {
          ...currentTaskInput,
          checkedPackageIds: nextIds,
        },
      };
    });
  }

  function setAllPackagesChecked(checked) {
    if (!selectedTask) return;
    setTaskInputs((current) => ({
      ...current,
      [selectedTask.fulfillmentId]: {
        ...(current[selectedTask.fulfillmentId] ?? {}),
        checkedPackageIds: checked ? packageCheckState.checklist.map((item) => item.packageId) : [],
      },
    }));
  }

  function applyPackageScan(scanTextOverride) {
    if (!selectedTask) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[selectedTask.fulfillmentId] ?? {};
      const currentIds = Array.isArray(currentTaskInput.checkedPackageIds)
        ? currentTaskInput.checkedPackageIds
        : selectedTask.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
      const scanText = String(
        typeof scanTextOverride === "string" ? scanTextOverride : (currentTaskInput.packageScanText ?? packageScanText),
      );
      const scanResult = applyDriverPackageScan(selectedTask, currentIds, scanText);
      const scanSucceeded = scanResult.status === "matched" || scanResult.status === "duplicate";
      const shouldRecordScanSample = scanResult.status !== "empty";
      const packageLabelScanSample = shouldRecordScanSample
        ? buildDriverPackageLabelScanSample({
            task: selectedTask,
            checkedPackageIds: currentIds,
            scannedText: scanText,
            scanResult,
            method: "scanner_wedge",
          })
        : currentTaskInput.packageLabelScanSample;
      const nextTaskInput = {
        ...currentTaskInput,
        checkedPackageIds: scanResult.checkedPackageIds,
        packageScanStatus: scanResult.message,
        packageScanStatusTone: scanSucceeded ? "success" : "danger",
        packageScanText: scanResult.status === "matched" ? "" : scanText,
      };
      if (shouldRecordScanSample) {
        const fieldTestMessage = scanSucceeded
          ? `扫码枪/键盘口识别通过：${scanResult.matchedPackageId || scanText}`
          : `扫码枪/键盘口识别异常：${scanResult.message}`;
        nextTaskInput.packageLabelScanSample = packageLabelScanSample;
        nextTaskInput.deviceFieldTestChecks = applyDriverPackageLabelScanFieldTestSignal(
          currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness),
          { type: "package_scan_result", scanStatus: scanResult.status },
          deviceReadiness,
        );
        nextTaskInput.deviceFieldTestNote = appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, fieldTestMessage);
        nextTaskInput.deviceFieldTestStatus = "现场验收记录未保存";
      }
      return {
        ...current,
        [selectedTask.fulfillmentId]: nextTaskInput,
      };
    });
  }

  async function startPackageCameraScan() {
    if (!selectedTask) return;
    const taskSnapshot = selectedTask;
    const taskId = taskSnapshot.fulfillmentId;
    packageCameraScannerRef.current?.stop?.();
    packageCameraScannerRef.current = null;
    setTaskInputs((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? {}),
        packageCameraScanActive: true,
        packageCameraScanStatus: "正在打开相机...",
        packageCameraScanStatusTone: "success",
      },
    }));

    try {
      const session = await startDriverPackageCameraScanner({
        videoElement: packageCameraVideoRef.current,
        onReady: () => {
          applyPackageCameraFieldTestSignal(taskId, {
            type: "camera_opened",
            message: "相机权限已授权，扫码取景框已打开。",
          });
        },
        onStatus: (message) => {
          setTaskInputs((current) => ({
            ...current,
            [taskId]: {
              ...(current[taskId] ?? {}),
              packageCameraScanActive: true,
              packageCameraScanStatus: message,
              packageCameraScanStatusTone: "success",
            },
          }));
        },
        onCode: (code) => {
          packageCameraScannerRef.current = null;
          setTaskInputs((current) => {
            const currentTaskInput = current[taskId] ?? {};
            const currentIds = Array.isArray(currentTaskInput.checkedPackageIds)
              ? currentTaskInput.checkedPackageIds
              : taskSnapshot.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
            const scanResult = applyDriverPackageScan(taskSnapshot, currentIds, code);
            const scanSucceeded = scanResult.status === "matched" || scanResult.status === "duplicate";
            const packageLabelScanSample = buildDriverPackageLabelScanSample({
              task: taskSnapshot,
              checkedPackageIds: currentIds,
              scannedText: code,
              scanResult,
              method: "camera",
            });
            const fieldTestChecks = applyDriverPackageCameraFieldTestSignal(
              currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness),
              { type: "camera_scan_result", scanStatus: scanResult.status },
              deviceReadiness,
            );
            const fieldTestMessage = scanSucceeded
              ? `相机扫码识别通过：${code}`
              : `相机识别到 ${code}，但不属于当前装车清单。`;
            return {
              ...current,
              [taskId]: {
                ...currentTaskInput,
                checkedPackageIds: scanResult.checkedPackageIds,
                packageScanStatus: scanResult.message,
                packageScanStatusTone: scanSucceeded ? "success" : "danger",
                packageScanText: scanResult.status === "matched" ? "" : code,
                packageCameraScanActive: false,
                packageCameraScanStatus: scanSucceeded ? `相机识别：${code}` : scanResult.message,
                packageCameraScanStatusTone: scanSucceeded ? "success" : "danger",
                packageLabelScanSample,
                deviceFieldTestChecks: fieldTestChecks,
                deviceFieldTestNote: appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, fieldTestMessage),
                deviceFieldTestStatus: "现场验收记录未保存",
              },
            };
          });
        },
      });
      packageCameraScannerRef.current = session?.stopped ? null : session;
    } catch (error) {
      packageCameraScannerRef.current = null;
      const message = error?.message ?? "相机扫码启动失败，请继续用扫描枪或手输包裹号。";
      const packageLabelScanSample = buildDriverPackageLabelScanSample({
        task: taskSnapshot,
        checkedPackageIds: taskSnapshot.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [],
        method: "camera",
        result: "camera_error",
        message,
      });
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          packageCameraScanActive: false,
          packageCameraScanStatus: message,
          packageCameraScanStatusTone: "danger",
          packageLabelScanSample,
          deviceFieldTestChecks: applyDriverPackageCameraFieldTestSignal(
            current[taskId]?.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness),
            { type: "camera_error", errorCode: error?.code },
            deviceReadiness,
          ),
          deviceFieldTestNote: appendDriverDeviceFieldTestNote(current[taskId]?.deviceFieldTestNote, message),
          deviceFieldTestStatus: "现场验收记录未保存",
        },
      }));
    }
  }

  async function startNativePackageScan() {
    if (!selectedTask) return;
    const taskSnapshot = selectedTask;
    const taskId = taskSnapshot.fulfillmentId;
    const support = getDriverNativePackageScannerSupport();
    if (!support.supported) {
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          packageNativeScanActive: false,
          packageNativeScanStatus: support.message,
          packageNativeScanStatusTone: "danger",
        },
      }));
      return;
    }

    setTaskInputs((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? {}),
        packageNativeScanActive: true,
        packageNativeScanStatus: "正在调用原生扫码 SDK...",
        packageNativeScanStatusTone: "success",
      },
    }));

    try {
      const nativeResult = await requestDriverNativePackageLabelScan({
        task: taskSnapshot,
        operatorId: currentUser.userId ?? currentUser.id,
      });
      const code = nativeResult.scannedText;
      if (!code) {
        setTaskInputs((current) => ({
          ...current,
          [taskId]: {
            ...(current[taskId] ?? {}),
            packageNativeScanActive: false,
            packageNativeScanStatus: nativeResult.message || "原生扫码 SDK 未返回包裹码。",
            packageNativeScanStatusTone: nativeResult.status === "canceled" ? "success" : "danger",
          },
        }));
        return;
      }

      setTaskInputs((current) => {
        const currentTaskInput = current[taskId] ?? {};
        const currentIds = Array.isArray(currentTaskInput.checkedPackageIds)
          ? currentTaskInput.checkedPackageIds
          : taskSnapshot.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
        const scanResult = applyDriverPackageScan(taskSnapshot, currentIds, code);
        const scanSucceeded = scanResult.status === "matched" || scanResult.status === "duplicate";
        const packageLabelScanSample = buildDriverPackageLabelScanSample({
          task: taskSnapshot,
          checkedPackageIds: currentIds,
          scannedText: code,
          scanResult,
          method: "native_sdk",
          checkedAt: nativeResult.checkedAt,
          message: nativeResult.message || scanResult.message,
        });
        const fieldTestMessage = scanSucceeded
          ? `原生扫码SDK识别通过：${scanResult.matchedPackageId || code}`
          : `原生扫码SDK识别异常：${scanResult.message}`;
        return {
          ...current,
          [taskId]: {
            ...currentTaskInput,
            checkedPackageIds: scanResult.checkedPackageIds,
            packageScanStatus: scanResult.message,
            packageScanStatusTone: scanSucceeded ? "success" : "danger",
            packageScanText: scanResult.status === "matched" ? "" : code,
            packageNativeScanActive: false,
            packageNativeScanStatus: scanSucceeded ? `原生SDK识别：${code}` : scanResult.message,
            packageNativeScanStatusTone: scanSucceeded ? "success" : "danger",
            packageLabelScanSample,
            deviceFieldTestChecks: applyDriverPackageLabelScanFieldTestSignal(
              currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness),
              { type: "package_scan_result", scanStatus: scanResult.status },
              deviceReadiness,
            ),
            deviceFieldTestNote: appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, fieldTestMessage),
            deviceFieldTestStatus: "现场验收记录未保存",
          },
        };
      });
    } catch (error) {
      const message = error?.message ?? "原生扫码 SDK 调用失败，请继续用扫码枪、手输或相机扫码。";
      setTaskInputs((current) => {
        const currentTaskInput = current[taskId] ?? {};
        const currentIds = Array.isArray(currentTaskInput.checkedPackageIds)
          ? currentTaskInput.checkedPackageIds
          : taskSnapshot.packageChecklist?.filter((item) => item.checked === true).map((item) => item.packageId) ?? [];
        return {
          ...current,
          [taskId]: {
            ...currentTaskInput,
            packageNativeScanActive: false,
            packageNativeScanStatus: message,
            packageNativeScanStatusTone: "danger",
            packageLabelScanSample: buildDriverPackageLabelScanSample({
              task: taskSnapshot,
              checkedPackageIds: currentIds,
              method: "native_sdk",
              result: "failed",
              message,
            }),
            deviceFieldTestChecks: applyDriverPackageLabelScanFieldTestSignal(
              currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness),
              { type: "package_scan_result", scanStatus: "failed" },
              deviceReadiness,
            ),
            deviceFieldTestNote: appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, `原生扫码SDK异常：${message}`),
            deviceFieldTestStatus: "现场验收记录未保存",
          },
        };
      });
    }
  }

  async function startNativeNavigation() {
    if (!selectedTask) return;
    const taskSnapshot = selectedTask;
    const taskId = taskSnapshot.fulfillmentId;
    const support = getDriverNativeNavigationSupport();
    if (!navigationUrl) {
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          nativeNavigationActive: false,
          nativeNavigationStatus: "导航地址待补，无法调用原生导航。",
          nativeNavigationStatusTone: "danger",
        },
      }));
      return;
    }
    if (!support.supported) {
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          nativeNavigationActive: false,
          nativeNavigationStatus: support.message,
          nativeNavigationStatusTone: "neutral",
        },
      }));
      return;
    }

    setTaskInputs((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? {}),
        nativeNavigationActive: true,
        nativeNavigationStatus: "正在调用原生导航 SDK...",
        nativeNavigationStatusTone: "success",
      },
    }));

    try {
      const nativeResult = await requestDriverNativeNavigation({
        task: taskSnapshot,
        navigationUrl,
        geoPoint: watermarkGeoPoint,
        operatorId: currentUser.userId ?? currentUser.id,
      });
      const opened = nativeResult.status === "opened";
      const canceled = nativeResult.status === "canceled";
      const message = nativeResult.message || (opened ? "原生导航 SDK 已打开导航。" : "原生导航 SDK 未返回明确结果。");
      setTaskInputs((current) => {
        const currentTaskInput = current[taskId] ?? {};
        const currentChecks = currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
        const nextTaskInput = {
          ...currentTaskInput,
          nativeNavigationActive: false,
          nativeNavigationStatus: message,
          nativeNavigationStatusTone: opened ? "success" : canceled ? "neutral" : "warning",
        };
        if (opened) {
          nextTaskInput.deviceFieldTestChecks = updateDriverDeviceFieldTestCheck(currentChecks, "navigation", "passed", deviceReadiness);
          nextTaskInput.deviceFieldTestNote = appendDriverDeviceFieldTestNote(
            currentTaskInput.deviceFieldTestNote,
            `原生导航SDK打开成功：${nativeResult.mapApp || "系统地图"} · ${taskSnapshot.address}`,
          );
          nextTaskInput.deviceFieldTestStatus = "现场验收记录未保存";
        } else if (nativeResult.status === "failed" || nativeResult.status === "unavailable") {
          nextTaskInput.deviceFieldTestChecks = updateDriverDeviceFieldTestCheck(currentChecks, "navigation", "failed", deviceReadiness);
          nextTaskInput.deviceFieldTestNote = appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, `原生导航SDK异常：${message}`);
          nextTaskInput.deviceFieldTestStatus = "现场验收记录未保存";
        }
        return {
          ...current,
          [taskId]: nextTaskInput,
        };
      });
    } catch (error) {
      const message = error?.message ?? "原生导航 SDK 调用失败，请继续使用外部地图链接。";
      setTaskInputs((current) => {
        const currentTaskInput = current[taskId] ?? {};
        const currentChecks = currentTaskInput.deviceFieldTestChecks ?? createDriverDeviceFieldTestChecks(deviceReadiness);
        return {
          ...current,
          [taskId]: {
            ...currentTaskInput,
            nativeNavigationActive: false,
            nativeNavigationStatus: message,
            nativeNavigationStatusTone: "danger",
            deviceFieldTestChecks: updateDriverDeviceFieldTestCheck(currentChecks, "navigation", "failed", deviceReadiness),
            deviceFieldTestNote: appendDriverDeviceFieldTestNote(currentTaskInput.deviceFieldTestNote, `原生导航SDK异常：${message}`),
            deviceFieldTestStatus: "现场验收记录未保存",
          },
        };
      });
    }
  }

  function stopPackageCameraScan(options = {}) {
    const taskSnapshot = selectedTask;
    packageCameraScannerRef.current?.stop?.();
    packageCameraScannerRef.current = null;
    if (!taskSnapshot) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[taskSnapshot.fulfillmentId] ?? {};
      const nextTaskInput = {
        ...currentTaskInput,
        packageCameraScanActive: false,
      };
      if (!options.silent) {
        nextTaskInput.packageCameraScanStatus = options.message ?? "相机扫码已停止。";
        nextTaskInput.packageCameraScanStatusTone = options.tone ?? "success";
      }
      return {
        ...current,
        [taskSnapshot.fulfillmentId]: nextTaskInput,
      };
    });
  }

  async function startDeliveryPhotoCamera() {
    if (!selectedTask) return;
    const taskId = selectedTask.fulfillmentId;
    deliveryPhotoCameraRef.current?.stop?.();
    deliveryPhotoCameraRef.current = null;
    setTaskInputs((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? {}),
        deliveryPhotoCameraActive: true,
        deliveryPhotoCameraStatus: "正在打开相机...",
        deliveryPhotoCameraStatusTone: "success",
      },
    }));

    try {
      const session = await startDriverDeliveryPhotoCamera({
        videoElement: deliveryPhotoVideoRef.current,
        onStatus: (message) => {
          setTaskInputs((current) => ({
            ...current,
            [taskId]: {
              ...(current[taskId] ?? {}),
              deliveryPhotoCameraActive: true,
              deliveryPhotoCameraStatus: message,
              deliveryPhotoCameraStatusTone: "success",
            },
          }));
        },
      });
      deliveryPhotoCameraRef.current = session?.stopped ? null : session;
    } catch (error) {
      deliveryPhotoCameraRef.current = null;
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          deliveryPhotoCameraActive: false,
          deliveryPhotoCameraStatus: error?.message ?? "相机拍照启动失败，请继续用文件上传水印照片。",
          deliveryPhotoCameraStatusTone: "danger",
        },
      }));
    }
  }

  async function captureDeliveryPhotoFromCamera() {
    if (!selectedTask) return;
    const taskId = selectedTask.fulfillmentId;
    try {
      const photo = await captureDriverDeliveryPhotoFromVideo({
        videoElement: deliveryPhotoVideoRef.current,
        fileName: `delivery-watermark-${taskId}.jpg`,
      });
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          watermarkedPhotoFile: photo.file,
          watermarkedPhotoAttached: true,
          watermarkedPhotoAttachmentId: "",
          deliveryPhotoCameraStatus: `已拍照：${photo.fileName}`,
          deliveryPhotoCameraStatusTone: "success",
        },
      }));
    } catch (error) {
      setTaskInputs((current) => ({
        ...current,
        [taskId]: {
          ...(current[taskId] ?? {}),
          deliveryPhotoCameraStatus: error?.message ?? "拍照失败，请稍后再试或用文件上传。",
          deliveryPhotoCameraStatusTone: "danger",
        },
      }));
    }
  }

  function stopDeliveryPhotoCamera(options = {}) {
    const taskSnapshot = selectedTask;
    deliveryPhotoCameraRef.current?.stop?.();
    deliveryPhotoCameraRef.current = null;
    if (!taskSnapshot) return;
    setTaskInputs((current) => {
      const currentTaskInput = current[taskSnapshot.fulfillmentId] ?? {};
      const nextTaskInput = {
        ...currentTaskInput,
        deliveryPhotoCameraActive: false,
      };
      if (!options.silent) {
        nextTaskInput.deliveryPhotoCameraStatus = options.message ?? "相机拍照已停止。";
        nextTaskInput.deliveryPhotoCameraStatusTone = options.tone ?? "success";
      }
      return {
        ...current,
        [taskSnapshot.fulfillmentId]: nextTaskInput,
      };
    });
  }

  function captureLocation() {
    if (!selectedTask) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      updateTaskInput("watermarkLocationStatus", "当前浏览器不支持定位，已使用送货区域。");
      updateTaskInput("watermarkLocationLabel", watermarkLocationLabel || selectedTask.addressArea || "定位待补");
      return;
    }
    updateTaskInput("watermarkLocationStatus", "正在读取定位...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude);
        const longitude = Number(position.coords.longitude);
        const geoPoint = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
        setTaskInputs((current) => ({
          ...current,
          [selectedTask.fulfillmentId]: {
            ...(current[selectedTask.fulfillmentId] ?? {}),
            watermarkGeoPoint: geoPoint,
            watermarkLocationLabel: watermarkLocationLabel || selectedTask.addressArea || "已读取 GPS",
            watermarkLocationStatus: `已读取 GPS：${geoPoint}`,
          },
        }));
      },
      () => {
        setTaskInputs((current) => ({
          ...current,
          [selectedTask.fulfillmentId]: {
            ...(current[selectedTask.fulfillmentId] ?? {}),
            watermarkLocationLabel: watermarkLocationLabel || selectedTask.addressArea || "定位未授权",
            watermarkLocationStatus: "定位未授权，提交时会保留地址/区域快照。",
          },
        }));
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }

  function submit(action) {
    if (!selectedTask) return;
    onAction(action, {
      task: selectedTask,
      fulfillmentId: selectedTask.fulfillmentId,
      actualQty,
      receiverName,
      paperNoteStatus,
      watermarkedPhotoAttached,
      signaturePhotoAttached,
      watermarkedPhotoFile,
      signaturePhotoFile,
      watermarkedPhotoAttachmentId,
      signaturePhotoAttachmentId,
      watermarkLocationLabel,
      watermarkGeoPoint,
      watermarkPreviewText: watermarkPreview?.text ?? "",
      routeLabel: routeContext?.hasRoute ? routeContext.routeLabel : "",
      routeStopLabel: routeContext?.hasRoute ? routeContext.stopLabel : "",
      routeProgressLabel: routeContext?.routeProgressLabel ?? "",
      navigationUrl,
      checkedPackageIds,
      packageChecklist: packageCheckState.checklist,
      packageCheckSummary: packageCheckState.summary,
      packageCheckAllDone: packageCheckState.allChecked,
      reason: exceptionReason,
      remark,
    });
  }

  return (
    <section className="page-grid workshop-mobile-layout">
      <div className="table-pane">
        <MetricStrip items={stats} />
        <div className="panel-head compact mobile-work-head">
          <div>
            <h2>司机送货任务</h2>
            <span>{sourceText} · {meta.total ?? tasks.length} 条</span>
          </div>
          <Segmented value={view} onChange={setView} items={["待送货", "配送中", "已完成", "送货异常", "全部"]} />
        </div>
        <div className="mobile-task-list">
          {visibleTasks.length ? visibleTasks.map((task) => (
            <button
              className={`mobile-task-row ${task.fulfillmentId === selectedTask?.fulfillmentId ? "active" : ""}`}
              key={task.fulfillmentId}
              onClick={() => selectTask(task.fulfillmentId)}
            >
              <div>
                <strong>[送货] {task.customerName} · {task.orderTail || task.orderLineId.slice(-5)}</strong>
                <span>{task.addressArea} · {getDriverRouteStopLabel(task)} · {task.packageSummary} · {task.qty} 个</span>
                <small>{getDriverRouteLabel(task)} · {task.latest} · {task.goodsSummary}</small>
              </div>
              <StatusPill tone={task.status === "配送中" ? "blue" : task.status === "送货异常" ? "danger" : statusTone(task.status)}>
                {task.status}
              </StatusPill>
            </button>
          )) : <div className="empty-row">当前视图没有司机送货任务</div>}
        </div>
      </div>
      <DetailPane title={selectedTask ? `${selectedTask.customerName} · ${selectedTask.status}` : "司机送货"} subtitle={selectedTask?.orderLineId ?? "未选择"}>
        {selectedTask ? (
          <>
            <InfoGrid
              rows={[
                ["联系人", `${selectedTask.contactName} ${selectedTask.contactPhone}`],
                ["地址", selectedTask.address],
                ["导航区域", selectedTask.addressArea],
                ["路线/站序", `${routeContext?.routeLabel ?? "未排路线"} / ${routeContext?.stopLabel ?? "未排站序"}`],
                ["计划发车", formatDriverDateTime(selectedTask.plannedDepartureAt) || "未排"],
                ["送货单号", selectedTask.deliveryNoteNo],
                ["货品", selectedTask.goodsSummary],
                ["数量/包裹", `${selectedTask.qty} 个 / ${selectedTask.packageSummary}`],
                ["库存来源", selectedTask.inventorySource || "待确认"],
                ["下一步", selectedTask.nextStep],
                ["客户备注", selectedTask.customerNote || "无"],
                ["办公室备注", selectedTask.officeNote || "无"],
              ]}
            />
            <section className="detail-section driver-route-section">
              <h3>路线执行</h3>
              <div className="driver-route-summary">
                <div>
                  <span>当前路线</span>
                  <strong>{routeContext?.routeLabel ?? "未排路线"}</strong>
                  <small>{routeContext?.stopLabel ?? "未排站序"} · {routeContext?.routeProgressLabel ?? "未排"} · {formatDriverDateTime(selectedTask.plannedDepartureAt) || "计划发车未排"}</small>
                </div>
                <div className="driver-route-neighbors">
                  <span>前一站：{formatDriverRouteNeighbor(routeContext?.previousTask)}</span>
                  <span>下一站：{formatDriverRouteNeighbor(routeContext?.nextTask)}</span>
                </div>
                <p>
                  {routeContext?.pendingBeforeCount
                    ? `前方还有 ${routeContext.pendingBeforeCount} 个未装车/未完成站点，装车前注意核对站序。`
                    : routeContext?.hasRoute
                      ? "当前站序可执行；如货物或单据不一致，走装车异常退回办公室处理。"
                      : "该任务尚未排路线；司机可按办公室临时通知执行，后续由办公室补派单。"}
                </p>
                <div className="driver-route-actions">
                  {navigationUrl ? (
                    <a className="route-nav-button" href={navigationUrl} target="_blank" rel="noreferrer">
                      打开导航
                    </a>
                  ) : (
                    <span className="route-nav-button disabled">导航地址待补</span>
                  )}
                  <button
                    type="button"
                    className="route-nav-button secondary"
                    onClick={startNativeNavigation}
                    disabled={!navigationUrl || !nativeNavigationSupport.supported || nativeNavigationActive}
                    title={nativeNavigationSupport.supported ? "调用手机原生地图 SDK" : nativeNavigationSupport.message}
                  >
                    {nativeNavigationActive ? "调用中" : "原生导航"}
                  </button>
                  <span>{selectedTask.address}</span>
                </div>
                <small className={`driver-native-navigation-status ${nativeNavigationStatusTone}`}>
                  {nativeNavigationStatus}
                </small>
              </div>
            </section>
            <section className="detail-section driver-device-section">
              <div className="section-title-row">
                <h3>设备自检</h3>
                <span className={`driver-device-summary ${deviceReadiness.summary.tone}`}>
                  {deviceReadiness.summary.label}
                </span>
              </div>
              <div className="driver-device-grid">
                {deviceReadiness.items.map((item) => (
                  <div className={`driver-device-item ${item.tone}`} key={item.key}>
                    <strong>{item.label}</strong>
                    <span>{item.statusLabel}</span>
                    <small>{item.message}</small>
                  </div>
                ))}
              </div>
              <div className="driver-native-diagnostics">
                <div className="driver-native-diagnostics-head">
                  <strong>原生桥接</strong>
                  <span className={`driver-device-summary ${nativeCapabilityDiagnostics.tone}`}>
                    {nativeCapabilityDiagnostics.label}
                  </span>
                </div>
                <div className="driver-native-diagnostics-grid">
                  {nativeCapabilityDiagnostics.items.map((item) => (
                    <div className={`driver-device-item ${item.tone}`} key={item.key}>
                      <strong>{item.label}</strong>
                      <span>{item.statusLabel} · {item.bridgeTypeLabel}</span>
                      <small>{item.version}</small>
                    </div>
                  ))}
                </div>
                <small>{nativeCapabilityDiagnostics.message}</small>
                {nativeIntegrationKit ? (
                  <div className="driver-native-integration-kit">
                    <strong>{nativeIntegrationKit.title}</strong>
                    <span>{nativeIntegrationKitSummary}</span>
                    <small>{nativeIntegrationKit.eventNames.join(" / ")}</small>
                  </div>
                ) : null}
              </div>
            </section>
            <section className="detail-section driver-field-test-section">
              <div className="section-title-row">
                <h3>现场验收</h3>
                <span className={`driver-device-summary ${deviceFieldTestSummary.tone}`}>
                  {deviceFieldTestSummary.label}
                </span>
              </div>
              <div className="driver-field-test-form">
                <label>
                  <span>手机型号</span>
                  <input
                    value={deviceFieldTestDeviceLabel}
                    onChange={(event) => updateTaskInput("deviceFieldTestDeviceLabel", event.target.value)}
                    placeholder="如 iPhone 15 / 华为 Mate"
                  />
                </label>
                <label>
                  <span>浏览器</span>
                  <input
                    value={deviceFieldTestBrowserLabel}
                    onChange={(event) => updateTaskInput("deviceFieldTestBrowserLabel", event.target.value)}
                    placeholder="如 Chrome / Safari"
                  />
                </label>
              </div>
              <div className="driver-field-test-list">
                {deviceFieldTestChecks.map((item) => (
                  <label className={`driver-field-test-row ${item.tone}`} key={item.key}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.target}</span>
                      <small>{item.readinessMessage ? `自检：${item.readinessMessage}` : "现场手动确认"}</small>
                    </div>
                    <select value={item.status} onChange={(event) => updateDeviceFieldTestCheck(item.key, event.target.value)}>
                      {DRIVER_DEVICE_FIELD_TEST_STATUS_OPTIONS.map((option) => (
                        <option value={option.value} key={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="driver-field-test-note">
                <input
                  value={deviceFieldTestNote}
                  onChange={(event) => updateTaskInput("deviceFieldTestNote", event.target.value)}
                  placeholder="记录手机、权限、扫码或拍照问题"
                />
                <button
                  type="button"
                  onClick={saveDeviceFieldTestRecord}
                  disabled={fieldTestSaveState.disabled}
                  title={fieldTestSaveState.title}
                >
                  保存验收
                </button>
              </div>
              <div className={`driver-field-test-sample ${packageLabelScanSample?.tone ?? "neutral"}`}>
                <strong>标签样本</strong>
                <span>{packageLabelScanSampleSummary}</span>
                <small>
                  {packageLabelScanSample
                    ? `预期 ${packageLabelScanSample.expectedPackageId || "待确认"} · 实扫 ${packageLabelScanSample.scannedText || "未取到码"} · ${formatDriverDateTime(packageLabelScanSample.checkedAt)}`
                    : "扫码枪、手输或相机扫过纸质标签后自动记录。"}
                </small>
              </div>
              <div className={`driver-field-test-sample ${nativeBridgeFieldTestSnapshot?.tone ?? "neutral"}`}>
                <strong>原生快照</strong>
                <span>{nativeBridgeFieldTestSnapshot?.label ?? "未记录原生桥接"}</span>
                <small>{nativeBridgeFieldTestSnapshotText || "保存验收时记录原生壳接入状态。"}</small>
              </div>
              <small className={`driver-field-test-status ${deviceFieldTestRecord?.summary?.tone ?? deviceFieldTestSummary.tone}`}>
                {deviceFieldTestStatus}
              </small>
              {deviceFieldTestRecord ? (
                <div className="driver-field-test-record">
                  <strong>{deviceFieldTestRecord.recordId}</strong>
                  <span>{formatDriverDateTime(deviceFieldTestRecord.checkedAt)}</span>
                  <small>{deviceFieldTestRecord.deviceLabel} · {deviceFieldTestRecord.browserLabel} · {deviceFieldTestRecord.summary.label}</small>
                </div>
              ) : null}
            </section>
            <section className="detail-section driver-load-check-section">
              <div className="section-title-row">
                <h3>装车清单</h3>
                <button type="button" onClick={() => setAllPackagesChecked(!packageCheckState.allChecked)}>
                  {packageCheckState.allChecked ? "取消全选" : "全部核对"}
                </button>
              </div>
              <div className="driver-load-check-summary">
                <strong>{packageCheckState.summary}</strong>
                <span>{packageCheckState.allChecked ? "包裹已核对，可确认装车。" : `还有 ${packageCheckState.missingCount} 包未核对，不能确认装车。`}</span>
              </div>
              <div className="driver-load-scan-row">
                <label>
                  <span>扫码核包</span>
                  <div className="inline-control driver-load-scan-actions">
                    <input
                      value={packageScanText}
                      onChange={(event) => updateTaskInput("packageScanText", event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applyPackageScan(event.currentTarget.value);
                        }
                      }}
                      placeholder="扫描或输入包裹号"
                    />
                    <button type="button" onClick={applyPackageScan}>核对</button>
                    <button type="button" onClick={packageCameraScanActive ? () => stopPackageCameraScan() : startPackageCameraScan}>
                      {packageCameraScanActive ? "停止相机" : "相机扫码"}
                    </button>
                    <button
                      type="button"
                      onClick={startNativePackageScan}
                      disabled={packageNativeScanActive || !nativePackageScanSupport.supported}
                      title={nativePackageScanSupport.message}
                    >
                      {packageNativeScanActive ? "原生扫码中" : "原生扫码"}
                    </button>
                  </div>
                  <small className={currentInput.packageScanStatusTone === "danger" ? "scan-error" : ""}>
                    {packageScanStatus || "扫描枪回车或手输包裹号后自动勾选。"}
                  </small>
                  <small className={currentInput.packageCameraScanStatusTone === "danger" ? "scan-error" : ""}>
                    {packageCameraScanStatus || "相机未启动。"}
                  </small>
                  <small className={currentInput.packageNativeScanStatusTone === "danger" ? "scan-error" : ""}>
                    {packageNativeScanStatus}
                  </small>
                  <video
                    ref={packageCameraVideoRef}
                    className={packageCameraScanActive ? "driver-camera-scan-preview" : "driver-camera-scan-preview hidden"}
                    muted
                    playsInline
                  />
                </label>
              </div>
              <div className="driver-load-package-list">
                {packageCheckState.checklist.map((item) => {
                  const checked = checkedPackageIds.includes(item.packageId);
                  return (
                    <label className={checked ? "driver-load-package checked" : "driver-load-package"} key={item.packageId}>
                      <input type="checkbox" checked={checked} onChange={() => togglePackageCheck(item.packageId)} />
                      <strong>{item.labelText}</strong>
                      <span>{item.quantityText}</span>
                      <small title={item.packageId}>{[item.status, item.packageId].filter(Boolean).join(" · ")}</small>
                    </label>
                  );
                })}
              </div>
            </section>
            <section className="detail-section">
              <h3>送达凭证</h3>
              <div className="detail-form driver-proof-form">
                <label>
                  <span>实际数量</span>
                  <input type="number" min="0" value={actualQty} onChange={(event) => updateTaskInput("actualQty", event.target.value)} />
                </label>
                <label>
                  <span>收货人</span>
                  <input value={receiverName} onChange={(event) => updateTaskInput("receiverName", event.target.value)} placeholder="客户签收人" />
                </label>
                <label>
                  <span>纸质联状态</span>
                  <select value={paperNoteStatus} onChange={(event) => updateTaskInput("paperNoteStatus", event.target.value)}>
                    <option>已交回</option>
                    <option>客户留存</option>
                    <option>未带回</option>
                  </select>
                </label>
                <label className="driver-location-row">
                  <span>定位备注</span>
                  <div className="inline-control">
                    <input value={watermarkLocationLabel} onChange={(event) => updateTaskInput("watermarkLocationLabel", event.target.value)} placeholder="门店、门岗、仓库区域" />
                    <button type="button" onClick={captureLocation}>读取定位</button>
                  </div>
                  <small>{watermarkGeoPoint || watermarkLocationStatus || "提交时写入地址/定位快照"}</small>
                </label>
                <label className="evidence-row">
                  <span>水印照片</span>
                  <input
                    accept="image/*"
                    capture="environment"
                    type="file"
                    onChange={(event) => updateTaskInput("watermarkedPhotoFile", event.target.files?.[0] ?? null)}
                  />
                  <div className="delivery-photo-camera-actions">
                    <button type="button" onClick={deliveryPhotoCameraActive ? () => stopDeliveryPhotoCamera() : startDeliveryPhotoCamera}>
                      {deliveryPhotoCameraActive ? "停止相机" : "打开相机"}
                    </button>
                    <button type="button" disabled={!deliveryPhotoCameraActive} onClick={captureDeliveryPhotoFromCamera}>
                      拍照
                    </button>
                  </div>
                  <small className={currentInput.deliveryPhotoCameraStatusTone === "danger" ? "scan-error" : ""}>
                    {deliveryPhotoCameraStatus || "可直接拍送货水印照片，也可继续上传文件。"}
                  </small>
                  <video
                    ref={deliveryPhotoVideoRef}
                    className={deliveryPhotoCameraActive ? "delivery-photo-camera-preview" : "delivery-photo-camera-preview hidden"}
                    muted
                    playsInline
                  />
                  <small>{watermarkedPhotoFile?.name || (watermarkedPhotoAttached ? "已记录水印照片" : "必须上传")}</small>
                  {photoPreviewUrls.watermarked ? (
                    <div className="photo-proof-preview watermarked-preview">
                      <img alt="送货水印照片预览" src={photoPreviewUrls.watermarked} />
                      <div className="photo-watermark-overlay">
                        {watermarkPreviewLines.map((line) => <span key={line}>{line}</span>)}
                      </div>
                    </div>
                  ) : null}
                </label>
                <label className="evidence-row">
                  <span>签收照片</span>
                  <input
                    accept="image/*"
                    capture="environment"
                    type="file"
                    onChange={(event) => updateTaskInput("signaturePhotoFile", event.target.files?.[0] ?? null)}
                  />
                  <small>{signaturePhotoFile?.name || (signaturePhotoAttached ? "已记录签收照片" : "可选")}</small>
                  {photoPreviewUrls.signature ? (
                    <div className="photo-proof-preview">
                      <img alt="签收照片预览" src={photoPreviewUrls.signature} />
                    </div>
                  ) : null}
                </label>
                <label>
                  <span>备注</span>
                  <input value={remark} onChange={(event) => updateTaskInput("remark", event.target.value)} placeholder="楼层、门岗、客户补充说明" />
                </label>
                {watermarkPreview ? (
                  <div className="watermark-preview">
                    <span>水印信息</span>
                    <strong>{watermarkPreview.title}</strong>
                    <p>{watermarkPreview.text}</p>
                  </div>
                ) : null}
              </div>
            </section>
            <section className="detail-section">
              <h3>异常</h3>
              <div className="detail-form">
                <label>
                  <span>原因</span>
                  <select value={exceptionReason} onChange={(event) => updateTaskInput("exceptionReason", event.target.value)}>
                    <option>装车少货</option>
                    <option>地址不清</option>
                    <option>客户不在</option>
                    <option>拒收</option>
                    <option>其他</option>
                  </select>
                </label>
              </div>
            </section>
            <div className="action-row">
              <button
                className="primary-action"
                disabled={loadState.disabled || selectedTask.status !== "待送货" || loadBlockedByPackageCheck}
                title={
                  loadState.title ||
                  (selectedTask.status !== "待送货"
                    ? "只有待送货任务可确认装车"
                    : loadBlockedByPackageCheck
                      ? "请先核对全部包裹"
                      : "")
                }
                onClick={() => submit("确认已装车")}
              >
                确认已装车{routeContext?.hasRoute ? `（${routeContext.stopLabel}）` : ""}
              </button>
              <button
                className="primary-action"
                disabled={completeState.disabled || selectedTask.status !== "配送中" || !watermarkedPhotoAttached}
                title={completeState.title || (selectedTask.status !== "配送中" ? "配送中任务才能提交送达" : !watermarkedPhotoAttached ? "完成送货必须有水印照片" : "")}
                onClick={() => submit("提交送达")}
              >
                提交送达
              </button>
              <button disabled={exceptionState.disabled || selectedTask.status === "已完成"} title={exceptionState.title} onClick={() => submit(exceptionAction)}>
                {exceptionAction}
              </button>
            </div>
            <Timeline
              items={[
                "办公室创建送货任务",
                routeContext?.hasRoute ? `办公室派单：${routeContext.routeLabel} ${routeContext.stopLabel}` : "路线未排，按临时通知执行",
                selectedTask.loadedAt ? "司机已装车" : "等待司机装车",
                selectedTask.status,
                selectedTask.completedAt ? "回单进入办公室复核" : "等待送达凭证",
              ]}
            />
          </>
        ) : (
          <div className="empty-row">当前没有送货任务</div>
        )}
      </DetailPane>
    </section>
  );
}

function buildDriverWatermarkPreview({ task, currentUser, watermarkLocationLabel, watermarkGeoPoint }) {
  const orderRef = task.orderTail || task.orderLineId || task.fulfillmentId;
  const timeText = task.watermarkCapturedAt ? formatDriverWatermarkTime(task.watermarkCapturedAt) : "提交时生成";
  const locationText = [watermarkLocationLabel || task.addressArea || "定位待补", watermarkGeoPoint].filter(Boolean).join(" / ");
  const watermarkId = task.watermarkId || "提交时生成";
  const driverName = currentUser?.displayName || currentUser?.loginName || task.driverId || "当前司机";
  const existingText = String(task.watermarkText ?? "").trim();
  const text =
    existingText ||
    [
      `${task.customerName} ${orderRef}`,
      task.deliveryNoteNo ? `单据 ${task.deliveryNoteNo}` : "",
      task.address ? `地址 ${task.address}` : "",
      `司机 ${driverName}`,
      `时间 ${timeText}`,
      `定位 ${locationText}`,
      `水印 ${watermarkId}`,
    ]
      .filter(Boolean)
      .join(" / ");
  return {
    title: `水印编号：${watermarkId}`,
    text,
  };
}

function formatDriverRouteNeighbor(task) {
  if (!task) return "无";
  return `${getDriverRouteStopLabel(task)} ${task.customerName || "客户待确认"} ${task.addressArea || ""}`.trim();
}

function formatDriverWatermarkTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDriverDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getDriverWatermarkOverlayLines(text) {
  const parts = String(text ?? "")
    .split(" / ")
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length ? parts.slice(0, 6) : ["水印信息提交时生成"];
}

function isProductionReportCandidate(line) {
  const status = String(line?.status ?? line?.lineStatus ?? "");
  if (!line || String(line.orderType ?? "").includes("外加工")) return false;
  return (
    status.includes("制袋") ||
    status.includes("丝印") ||
    status.includes("待排产") ||
    status.includes("待补印") ||
    status.includes("跨日继续") ||
    status.includes("待完工确认")
  );
}

function findFocusedProductionLine(orderLines, focusTarget, buildProductionTaskId) {
  if (!focusTarget) return null;
  const orderLineId = String(focusTarget.orderLineId ?? "").trim();
  const taskId = String(focusTarget.taskId ?? focusTarget.productionTaskId ?? "").trim();
  return (orderLines ?? []).find((line) => {
    const lineId = String(line?.id ?? line?.orderLineId ?? "").trim();
    return (orderLineId && lineId === orderLineId) || (taskId && buildProductionTaskId(line) === taskId);
  }) ?? null;
}

function getProductionPackingFocusNotice(focusTarget, context) {
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

function getVisibleProductionPackingSourceDetail(sourceDetailState, context) {
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

function buildProductionPackingSourceDetailRows(detailState, detailMode) {
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

function getProductionPackingDetailSourceLabel(source) {
  if (source === "api") return "后端 API";
  if (source === "local_fallback") return "本地降级";
  if (source === "api_error") return "后端错误";
  return "本地状态";
}

function isProductionPackingTaskListFromApi(productionPacking) {
  return productionPacking?.taskListSource === "api";
}

function getProductionPackingTaskListStatusText(productionPacking) {
  if (productionPacking?.taskListLoading) return "任务池刷新中";
  const source = productionPacking?.taskListSource ?? "local";
  const time = productionPacking?.taskListLastSyncedAt ? ` · ${productionPacking.taskListLastSyncedAt}` : "";
  if (productionPacking?.taskListError) return `任务池异常：${productionPacking.taskListError}`;
  if (source === "api") return `后端任务池${time}`;
  if (source === "api_error") return `后端任务池异常${time}`;
  if (source === "local_fallback") return `本地降级任务池${time}`;
  return "本地任务池";
}

function getProductionScheduleQueueStatusText(productionPacking) {
  if (productionPacking?.taskListLoading) return "排产队列刷新中";
  const source = productionPacking?.scheduleQueueSource ?? "local";
  const time = productionPacking?.scheduleQueueLastSyncedAt ? ` · ${productionPacking.scheduleQueueLastSyncedAt}` : "";
  if (productionPacking?.scheduleQueueError) return `排产队列异常：${productionPacking.scheduleQueueError}`;
  if (source === "api") return `机台队列${time}`;
  if (source === "api_error") return `机台队列异常${time}`;
  if (source === "local_fallback") return `本地降级队列${time}`;
  return "本地队列";
}

function formatProductionScheduleQueueSpec(item) {
  const product = String(item?.productName ?? "").trim() || "未匹配货品";
  const size = String(item?.size ?? "").trim();
  const colorParts = [
    String(item?.bagColor ?? "").trim(),
    String(item?.handleType ?? "").trim(),
    String(item?.style ?? "").trim(),
  ].filter(Boolean);
  return [product, size, colorParts.join("/")].filter(Boolean).join(" ");
}

function formatProductionScheduleQueueQty(item) {
  const plannedQty = Math.max(0, Math.trunc(Number(item?.plannedQty ?? 0)));
  const remainingQty = Math.max(0, Math.trunc(Number(item?.remainingQty ?? plannedQty)));
  return `计划 ${plannedQty} / 剩 ${remainingQty}`;
}

const queueMoveReasonOptions = [
  { value: "supervisor_order", label: "主管安排" },
  { value: "urgent_insert", label: "急单插入" },
  { value: "delivery_risk", label: "交期风险" },
  { value: "material_wait", label: "等料调整" },
  { value: "machine_issue", label: "机器问题" },
  { value: "capacity_balance", label: "机台平衡" },
  { value: "other", label: "其他" },
];

function getQueueMoveReason(reasonCode) {
  const safeReasonCode = String(reasonCode ?? "").trim();
  return queueMoveReasonOptions.find((item) => item.value === safeReasonCode) ?? queueMoveReasonOptions[0];
}

function getQueueMoveImpactSummary({
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

function getProductionScheduleRecordSourceLabel(source) {
  const safeSource = String(source ?? "").trim();
  if (safeSource === "manual_resequence") return "手工调序";
  if (safeSource === "machine_reassignment") return "换机台";
  if (safeSource === "queue_insert") return "手工插队";
  return "";
}

function formatProductionScheduleQueueStatus(item) {
  const base = `${item?.queueReason || "已发布排产"} / ${item?.status || "待执行"}`;
  const sourceLabel = getProductionScheduleRecordSourceLabel(item?.scheduleRecordSource);
  return sourceLabel ? `${base} · ${sourceLabel}` : base;
}

function findScheduleQueueItemForLine(queueItems, line, buildProductionTaskId) {
  if (!line) return null;
  const lineTaskId = buildProductionTaskId(line);
  return queueItems.find((item) =>
    item.orderLineId === line.id ||
    item.orderLineId === line.orderLineId ||
    item.productionTaskId === line.productionTaskId ||
    item.productionTaskId === lineTaskId
  ) ?? null;
}

function sortScheduleQueueItemsBySeq(left, right) {
  const leftSeq = Math.max(0, Math.trunc(Number(left?.queueSeq ?? 0)));
  const rightSeq = Math.max(0, Math.trunc(Number(right?.queueSeq ?? 0)));
  if (leftSeq !== rightSeq) return leftSeq - rightSeq;
  return String(left?.productionTaskId ?? "").localeCompare(String(right?.productionTaskId ?? ""));
}

function getScheduleQueueMachineOptions(queueItems, productionLines) {
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

function getDefaultQueueMoveTargetMachineId(machineOptions, sourceMachineId) {
  const safeSourceMachineId = String(sourceMachineId ?? "").trim();
  return machineOptions.find((machineId) => machineId && machineId !== safeSourceMachineId) ?? machineOptions[0] ?? "";
}

function getScheduleQueueItemsForMachine(queueItems, machineId, excludedProductionTaskId) {
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

function getQueueMovePositionOptions(targetItems) {
  const count = Math.max(1, (targetItems ?? []).length + 1);
  return Array.from({ length: count }, (_, index) => index + 1);
}

function getNormalizedQueueMoveSeq(value, optionCount) {
  const maxSeq = Math.max(1, Math.trunc(Number(optionCount ?? 1)));
  const seq = Math.trunc(Number(value ?? 1));
  if (!Number.isFinite(seq) || seq < 1) return 1;
  return Math.min(seq, maxSeq);
}

function moveScheduleQueueItem(items, productionTaskId, direction) {
  const rows = [...(items ?? [])].sort(sortScheduleQueueItemsBySeq);
  const currentIndex = rows.findIndex((item) => item.productionTaskId === productionTaskId);
  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= rows.length) return [];
  const nextRows = [...rows];
  [nextRows[currentIndex], nextRows[nextIndex]] = [nextRows[nextIndex], nextRows[currentIndex]];
  return nextRows;
}

function buildPackingTaskRows({ orderLines, packingTasks, includeLocalProjections = true }) {
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

function getProductionProcessLabel(line) {
  if (line?.taskType) return line.taskType;
  const status = String(line?.status ?? "");
  if (status.includes("丝印") || status.includes("补印")) return "丝印";
  return "制袋";
}

function getProductionMachineIdLabel(line) {
  const machineId = String(line?.machineId ?? line?.productionTask?.machineId ?? "").trim();
  if (machineId) return machineId;
  return getProductionProcessLabel(line) === "丝印" ? "PRINT-01" : "BAG-01";
}

function getProductionPublishedScheduleId(line) {
  return String(line?.publishedScheduleId ?? line?.productionTask?.publishedScheduleId ?? "").trim();
}

function getProductionDailyProgress(line) {
  const progress = line?.dailyProgress;
  if (!progress || typeof progress !== "object") return null;
  const cumulativeQualifiedQty = Number(progress.cumulativeQualifiedQty ?? 0);
  const remainingQty = Number(progress.remainingQty ?? 0);
  if (!Number.isFinite(cumulativeQualifiedQty) && !Number.isFinite(remainingQty)) return null;
  return progress;
}

function formatProductionDailyProgressLabel(line) {
  const progress = getProductionDailyProgress(line);
  if (!progress) return "";
  const cumulativeQualifiedQty = Math.max(0, Math.trunc(Number(progress.cumulativeQualifiedQty ?? 0)));
  const remainingQty = Math.max(0, Math.trunc(Number(progress.remainingQty ?? 0)));
  const latestDailyQualifiedQty = Math.max(0, Math.trunc(Number(progress.latestDailyQualifiedQty ?? 0)));
  const prefix = latestDailyQualifiedQty > 0 ? `今日 ${latestDailyQualifiedQty}` : "已报";
  return `${prefix} / 累计 ${cumulativeQualifiedQty} / 剩 ${remainingQty}`;
}

function getProductionFinishedGoodsPhoto(line) {
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

function isProductionFinishedGoodsPhotoRequired(line) {
  const orderType = String(line?.orderType ?? "").trim();
  const printFlag = String(line?.print ?? line?.printFlag ?? "").trim();
  const status = String(line?.status ?? line?.lineStatus ?? "").trim();
  return orderType.includes("定制") || orderType.includes("印刷") || printFlag === "是" || status.includes("丝印") || status.includes("制袋");
}

function formatProductionFinishedGoodsPhotoLabel(photo) {
  if (!photo?.attachmentId) return photo?.required ? "必须上传 / 未上传" : "不强制 / 未上传";
  const fileLabel = photo.fileName || photo.attachmentId;
  return `${photo.status || "待确认"} / ${fileLabel}`;
}

function getProductionFinishedGoodsPhotoTone(photo) {
  if (photo?.status === "已接受") return "success";
  if (photo?.status === "需重拍") return "danger";
  if (photo?.attachmentId || photo?.status === "待确认") return "warning";
  return "neutral";
}

function formatCompactDateTime(value) {
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

function getNumericInput(inputs, id, field, fallback) {
  if (!id) return fallback ?? "";
  return inputs[id]?.[field] ?? fallback ?? "";
}

function getBooleanInput(inputs, id, field, fallback) {
  if (!id) return Boolean(fallback);
  return inputs[id]?.[field] ?? Boolean(fallback);
}

function inferPackageCountFromQty(qty) {
  const amount = Number(qty || 0);
  if (amount >= 1800) return 4;
  if (amount >= 1000) return 3;
  if (amount >= 500) return 2;
  return 1;
}

export { StatementPage } from "../../features/statements/StatementPage.jsx";
