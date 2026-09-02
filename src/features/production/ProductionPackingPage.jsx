import { lazy, Suspense, useEffect, useRef, useState } from "react";
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
  buildPrintWorkspaceItems,
  buildProductionPackingSourceDetailRows,
  findFocusedProductionLine,
  findScheduleQueueItemForLine,
  formatCompactDateTime,
  formatProductionDailyProgressLabel,
  formatProductionFinishedGoodsPhotoLabel,
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
  sortScheduleQueueItemsBySeq,
} from "./productionPackingPresentation.js";
import {
  ProductionPackingTaskCards,
  ProductionPackingTaskTables,
} from "./ProductionPackingTaskLists.jsx";
import { ProductionScheduleActionConfirmationDialog } from "./ProductionScheduleActionConfirmationDialog.jsx";
import { ProductionScheduleQueueSection } from "./ProductionScheduleQueueSection.jsx";
import {
  buildProductionExceptionResolutionEffects,
  isTerminalProductionException,
  ProductionExceptionPanel,
  productionExceptionResolutionOptions,
} from "./ProductionExceptionPanel.jsx";
import { buildPackingCompletionSummary } from "../../services/packingCompletionConfirmationClient.js";
import { buildProductionReportSummary } from "../../services/productionReportConfirmationClient.js";
import {
  DelegatedBusinessDecisionFields,
  isDelegatedBusinessDecisionComplete,
} from "../../components/DelegatedBusinessDecisionFields.jsx";
import { BusinessDecisionHistoryPanel } from "../../components/BusinessDecisionHistoryPanel.jsx";

const PRODUCTION_WORKBENCH_TABS = [
  { value: "production", label: "生产任务" },
  { value: "packing", label: "打包任务" },
  { value: "print", label: "打印与设备" },
];

const PACKING_TASK_FILTERS = [
  { value: "pending", label: "待打包" },
  { value: "completed", label: "已完成" },
  { value: "all", label: "全部" },
];

const ProductionPrintWorkspaceDetail = lazy(() => import("./ProductionPrintWorkspaceDetail.jsx").then((module) => ({
  default: module.ProductionPrintWorkspaceDetail,
})));

export function ProductionPackingPage({
  authState,
  currentUser,
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
  onRefreshProduction,
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
  const [packingTaskFilter, setPackingTaskFilter] = useState("pending");
  const [activePrintWorkspaceTab, setActivePrintWorkspaceTab] = useState("qa");
  const [reportInputs, setReportInputs] = useState({});
  const [packingInputs, setPackingInputs] = useState({});
  const [productionReportConfirmation, setProductionReportConfirmation] = useState(null);
  const productionReportConfirmationRef = useRef(null);
  const productionDailyReportTriggerRef = useRef(null);
  const productionCompleteReportTriggerRef = useRef(null);
  const restoreProductionReportTriggerKindRef = useRef("");
  const [productionExceptionResolutionConfirmation, setProductionExceptionResolutionConfirmation] = useState(null);
  const productionExceptionResolutionConfirmationRef = useRef(null);
  const productionExceptionResolutionTriggerRef = useRef(null);
  const restoreProductionExceptionResolutionTriggerRef = useRef(false);
  const [packingCompletionConfirmation, setPackingCompletionConfirmation] = useState(null);
  const packingCompletionConfirmationRef = useRef(null);
  const packingCompletionTriggerRef = useRef(null);
  const restorePackingCompletionTriggerFocusRef = useRef(false);
  const [queueMoveDraft, setQueueMoveDraft] = useState({
    targetMachineId: "",
    targetQueueSeq: "1",
    reasonCode: "supervisor_order",
  });
  const [scheduleDecision, setScheduleDecision] = useState({
    decisionChannel: "wechat",
    decidedAt: new Date().toISOString(),
    decisionContent: { summary: "" },
    authorizationBasis: "",
    evidenceDraftId: "",
    evidenceAttachmentIds: [],
  });
  const [scheduleActionConfirmation, setScheduleActionConfirmation] = useState(null);
  const [scheduleActionSubmitting, setScheduleActionSubmitting] = useState(false);
  const scheduleActionDialogRef = useRef(null);
  const scheduleActionTriggerRef = useRef(null);
  const restoreScheduleActionTriggerRef = useRef(false);
  const [scheduleWriteConflict, setScheduleWriteConflict] = useState(null);
  const resolveInventoryItem = (line, task = null) => findProductionInventoryItem(line, inventoryRecords) ?? line?.inventoryItem ?? task?.inventoryItem ?? null;
  const isAttentionProductionLine = (line) => !resolveInventoryItem(line) || line.confidence === "medium";
  const productionAttentionCount = productionLines.filter(isAttentionProductionLine).length;
  const productionTaskCards = [...productionLines].sort((left, right) => {
    const leftAttention = Number(isAttentionProductionLine(left));
    const rightAttention = Number(isAttentionProductionLine(right));
    return productionTaskPriority === "attention" ? rightAttention - leftAttention : leftAttention - rightAttention;
  });
  const selectedProductionLine = productionTaskCards.find((item) => item.id === selectedProductionLineId) ?? productionTaskCards[0] ?? null;
  const pendingPackingTaskCount = packingTasks.filter((item) => item.status !== "已完成").length;
  const completedPackingTaskCount = packingTasks.length - pendingPackingTaskCount;
  const visiblePackingTasks = packingTasks.filter((item) => {
    if (packingTaskFilter === "pending") return item.status !== "已完成";
    if (packingTaskFilter === "completed") return item.status === "已完成";
    return true;
  });
  const selectedPackingTask = visiblePackingTasks.find((item) => item.packingTaskId === selectedPackingTaskId) ?? visiblePackingTasks[0] ?? null;
  const printWorkspaceItems = buildPrintWorkspaceItems({
    printerDeviceQa,
    printDriverReadiness,
    printDriverConfig,
    printJobQueue,
  });
  const activePrintWorkspace = printWorkspaceItems.find((item) => item.value === activePrintWorkspaceTab) ?? printWorkspaceItems[0];
  const detailMode = activeWorkbenchTab === "packing" ? "packing" : "production";
  const detailLine = activeWorkbenchTab === "print" ? null : detailMode === "packing" ? selectedPackingTask?.orderLine : selectedProductionLine;
  const detailInventoryItem = detailLine ? resolveInventoryItem(detailLine, selectedPackingTask) : null;
  const reportState = getUiActionState("productionPacking", "报工完成");
  const reportDailyState = getUiActionState("productionPacking", "报当日数量");
  const productionExceptionState = getUiActionState("productionPacking", "上报生产异常");
  const productionExceptionResolutionState = getUiActionState("productionPacking", "处理生产异常");
  const publishScheduleState = getUiActionState("productionPacking", "发布排产");
  const uploadFinishedPhotoState = getUiActionState("productionPacking", "上传成品图");
  const acceptFinishedPhotoState = getUiActionState("productionPacking", "确认成品图");
  const rejectFinishedPhotoState = getUiActionState("productionPacking", "退回成品图");
  const packingState = getUiActionState("productionPacking", "提交打包完成");
  const reportQualifiedQty = getNumericInput(reportInputs, selectedProductionLine?.id, "qualifiedQty", selectedProductionLine?.qty ?? 0);
  const reportExceptionQty = getNumericInput(reportInputs, selectedProductionLine?.id, "exceptionQty", 0);
  const reportMachineCount = getNumericInput(reportInputs, selectedProductionLine?.id, "machineCount", "");
  const productionExceptionType = String(reportInputs[selectedProductionLine?.id]?.exceptionType ?? "");
  const productionExceptionLossQty = getNumericInput(reportInputs, selectedProductionLine?.id, "estimatedLossQty", 0);
  const productionExceptionAffectsDelivery = getBooleanInput(reportInputs, selectedProductionLine?.id, "exceptionAffectsDelivery", false);
  const productionExceptionRemark = String(reportInputs[selectedProductionLine?.id]?.exceptionRemark ?? "");
  const productionExceptionResolutionCode = String(reportInputs[selectedProductionLine?.id]?.exceptionResolutionCode ?? "");
  const productionExceptionResolutionNote = String(reportInputs[selectedProductionLine?.id]?.exceptionResolutionNote ?? "");
  const packingActualQty = getNumericInput(packingInputs, selectedPackingTask?.packingTaskId, "actualPackedQty", selectedPackingTask?.plannedQty ?? 0);
  const packingPackageCount = getNumericInput(packingInputs, selectedPackingTask?.packingTaskId, "packageCount", selectedPackingTask?.packageCount ?? inferPackageCountFromQty(selectedPackingTask?.plannedQty));
  const selectedProductionCanReport = selectedProductionLine ? isProductionReportCandidate(selectedProductionLine) : false;
  const selectedProductionPaused = isProductionReportingBlocked(selectedProductionLine);
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
  const scheduleDirectAllowed = authState?.permissions?.actionPermissions?.includes("production.schedule.direct") === true;
  const scheduleDecisionReady = scheduleDirectAllowed || isDelegatedBusinessDecisionComplete(scheduleDecision);
  const scheduleDecisionPayload = (summary) => scheduleDirectAllowed
    ? { directDecisionContent: { summary } }
    : { delegatedDecision: scheduleDecision };
  const queueMoveDisabled =
    sequenceState.disabled || !selectedScheduleQueueItem || !queueMoveTargetMachineId || queueMoveSamePosition || !scheduleDecisionReady || Boolean(scheduleActionConfirmation);
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
  const reportDisabled = reportState.disabled || !selectedProductionLine || !detailInventoryItem || !selectedProductionCanReport || selectedProductionPaused;
  const reportTitle = reportState.title || (selectedProductionPaused ? "任务因生产异常暂停，需先由生产管理处理" : !selectedProductionCanReport ? "该订单明细已完成生产报工或不在可报工状态" : !detailInventoryItem ? "未找到匹配库存键，不能报工入库" : "");
  const reportDailyDisabled = reportDailyState.disabled || !selectedProductionLine || !selectedProductionCanReport || selectedProductionPaused;
  const reportDailyTitle = reportDailyState.title || (selectedProductionPaused ? "任务因生产异常暂停，需先由生产管理处理" : !selectedProductionCanReport ? "该订单明细已完成生产报工或不在可报工状态" : "");
  const productionExceptionDisabled = productionExceptionState.disabled || !selectedProductionLine || !productionExceptionType;
  const productionExceptionTitle = productionExceptionState.title || (!productionExceptionType ? "请先选择异常类型" : "");
  const latestProductionException =
    selectedProductionLine?.latestException ?? productionPacking.productionExceptionsByLineId?.[selectedProductionLine?.id] ?? null;
  const productionExceptionResolutionTerminal = isTerminalProductionException(latestProductionException);
  const productionExceptionResolutionDisabled =
    productionExceptionResolutionState.disabled ||
    !selectedProductionLine ||
    !latestProductionException?.productionExceptionId ||
    productionExceptionResolutionTerminal ||
    !productionExceptionResolutionCode ||
    !productionExceptionResolutionNote;
  const productionExceptionResolutionTitle =
    productionExceptionResolutionState.title ||
    (!latestProductionException?.productionExceptionId
      ? "当前任务没有可处理的生产异常"
      : productionExceptionResolutionTerminal
        ? "该生产异常已完成最终处理"
        : !productionExceptionResolutionCode
          ? "请选择处理结果"
          : !productionExceptionResolutionNote
            ? "请填写处理说明"
            : "");
  const publishScheduleDisabled = publishScheduleState.disabled || !selectedProductionLine || !selectedProductionCanReport || Boolean(selectedPublishedScheduleId) || !scheduleDecisionReady;
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

  useEffect(() => {
    setProductionReportConfirmation(null);
    setProductionExceptionResolutionConfirmation(null);
  }, [selectedProductionLine?.id, activeWorkbenchTab]);

  useEffect(() => {
    if (productionReportConfirmation) {
      productionReportConfirmationRef.current?.focus();
      return;
    }
    const triggerKind = restoreProductionReportTriggerKindRef.current;
    if (!triggerKind) return;
    restoreProductionReportTriggerKindRef.current = "";
    (triggerKind === "daily" ? productionDailyReportTriggerRef : productionCompleteReportTriggerRef).current?.focus();
  }, [productionReportConfirmation]);

  useEffect(() => {
    if (productionExceptionResolutionConfirmation) {
      productionExceptionResolutionConfirmationRef.current?.focus();
      return;
    }
    if (restoreProductionExceptionResolutionTriggerRef.current) {
      restoreProductionExceptionResolutionTriggerRef.current = false;
      productionExceptionResolutionTriggerRef.current?.focus();
    }
  }, [productionExceptionResolutionConfirmation]);

  useEffect(() => {
    setPackingCompletionConfirmation(null);
  }, [selectedPackingTask?.packingTaskId, activeWorkbenchTab]);

  useEffect(() => {
    if (packingCompletionConfirmation) {
      packingCompletionConfirmationRef.current?.focus();
      return;
    }
    if (restorePackingCompletionTriggerFocusRef.current) {
      restorePackingCompletionTriggerFocusRef.current = false;
      packingCompletionTriggerRef.current?.focus();
    }
  }, [packingCompletionConfirmation]);

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

  function requestScheduleAction(action, payload, summary, effects) {
    if (!scheduleDecisionReady || scheduleActionSubmitting || scheduleActionConfirmation) return;
    if (typeof document !== "undefined") scheduleActionTriggerRef.current = document.activeElement;
    setScheduleWriteConflict(null);
    setScheduleActionConfirmation({
      action,
      payload: structuredClone({
        ...payload,
        idempotencyKey: payload.idempotencyKey || buildScheduleActionIdempotencyKey(action, payload),
      }),
      summary,
      effects,
      directAllowed: scheduleDirectAllowed,
      selectedTask: selectedScheduleQueueItem ? structuredClone(selectedScheduleQueueItem) : null,
      selectedLine: selectedProductionLine ? structuredClone(selectedProductionLine) : null,
    });
  }

  function returnToScheduleActionEdit() {
    if (scheduleActionSubmitting) return;
    restoreScheduleActionTriggerRef.current = true;
    setScheduleActionConfirmation(null);
  }

  async function submitScheduleAction() {
    if (!scheduleActionConfirmation || scheduleActionSubmitting) return;
    setScheduleActionSubmitting(true);
    const result = await onAction(scheduleActionConfirmation.action, scheduleActionConfirmation.payload);
    setScheduleActionSubmitting(false);
    setScheduleActionConfirmation(null);
    if (result?.error?.status === 409 || String(result?.error?.code ?? "").includes("CONFLICT")) {
      setScheduleWriteConflict(result.error);
    } else if (!result?.error) {
      setScheduleDecision({
        decisionChannel: "wechat",
        decidedAt: new Date().toISOString(),
        decisionContent: { summary: "" },
        authorizationBasis: "",
        evidenceDraftId: "",
        evidenceAttachmentIds: [],
      });
    }
  }

  useEffect(() => {
    if (scheduleActionConfirmation) {
      scheduleActionDialogRef.current?.focus();
      return;
    }
    if (!restoreScheduleActionTriggerRef.current) return;
    restoreScheduleActionTriggerRef.current = false;
    scheduleActionTriggerRef.current?.focus?.();
  }, [scheduleActionConfirmation]);

  function moveSelectedScheduleQueue(direction) {
    if (!selectedScheduleQueueItem || !scheduleDecisionReady || scheduleActionConfirmation) return;
    const nextOrderedItems = moveScheduleQueueItem(selectedMachineScheduleQueueItems, selectedScheduleQueueItem.productionTaskId, direction);
    if (!nextOrderedItems.length) return;
    const summary = `${selectedScheduleQueueItem.machineId} 队列${direction === "up" ? "上移" : "下移"} ${selectedScheduleQueueItem.productionTaskId}`;
    requestScheduleAction("调整排产顺序", {
      ...scheduleDecisionPayload(summary),
      machineId: selectedScheduleQueueItem.machineId,
      businessDecisionTargetId: selectedScheduleQueueItem.productionTaskId,
      orderedProductionTaskIds: nextOrderedItems.map((item) => item.productionTaskId),
      affectedRevisions: selectedMachineScheduleQueueItems.map((item) => ({
        productionTaskId: item.productionTaskId,
        revision: Number(item.revision ?? 0),
      })),
      expectedRevision: selectedMachineScheduleQueueItems.reduce(
        (sum, item) => sum + Number(item.revision ?? 0),
        0,
      ),
      remark: `${selectedScheduleQueueItem.machineId} ${selectedScheduleQueueItem.productionTaskId} ${direction === "up" ? "上移" : "下移"}`,
    }, summary, `将同机台 ${nextOrderedItems.length} 条任务按新顺序整体写入；不改库存、合格数量、打包或对账。`);
  }

  function moveSelectedScheduleQueueToTarget() {
    if (queueMoveDisabled) return;
    const summary = `${selectedScheduleQueueItem.productionTaskId} 调整到 ${queueMoveTargetMachineId} #${queueMoveTargetSeq}`;
    requestScheduleAction("移动排产任务", {
      ...scheduleDecisionPayload(summary),
      productionTaskId: selectedScheduleQueueItem.productionTaskId,
      expectedRevision: Number(selectedScheduleQueueItem.revision ?? 0),
      orderLineId: selectedScheduleQueueItem.orderLineId,
      sourceMachineId: selectedScheduleQueueItem.machineId,
      targetMachineId: queueMoveTargetMachineId,
      targetQueueSeq: queueMoveTargetSeq,
      reasonCode: queueMoveReason.value,
      reasonLabel: queueMoveReason.label,
      impactSummary: queueMoveImpact.remark,
      remark: `${queueMoveReason.label}：${selectedScheduleQueueItem.productionTaskId} 从 ${selectedScheduleQueueItem.machineId} 移到 ${queueMoveTargetMachineId} #${queueMoveTargetSeq}；${queueMoveImpact.remark}`,
    }, summary, `${queueMoveImpact.remark}；更新受影响排产记录、决定证据和审计，不改库存、报工或对账。`);
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

  function buildProductionReportPayload(kind) {
    if (!selectedProductionLine) return null;
    const customer = findCustomer(selectedProductionLine.customerId);
    const qualifiedQty = Number(reportQualifiedQty || 0);
    return {
      entryLabel: "生产/打包工作台",
      productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
      productionTask: selectedProductionLine.productionTask ?? selectedProductionLine,
      orderLineId: selectedProductionLine.id,
      orderLine: selectedProductionLine,
      customerName: customer?.name ?? selectedProductionLine.customerName ?? "",
      goodsSummary: [
        selectedProductionLine.product ?? selectedProductionLine.productName,
        selectedProductionLine.size,
        getLineColorSpecLabel(selectedProductionLine),
        getLinePrintSide(selectedProductionLine),
        getLineRemark(selectedProductionLine),
      ].filter(Boolean).join(" · "),
      ...(kind === "daily" ? { dailyQualifiedQty: qualifiedQty } : { qualifiedQty }),
      exceptionQty: Number(reportExceptionQty || 0),
      machineCount: reportMachineCount === "" ? undefined : Number(reportMachineCount),
    };
  }

  function submitProductionException(continuationMode) {
    if (!selectedProductionLine || !productionExceptionType) return;
    onAction("上报生产异常", {
      entryLabel: "生产/打包工作台",
      productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
      orderLineId: selectedProductionLine.id,
      orderLine: selectedProductionLine,
      exceptionType: productionExceptionType,
      continuationMode,
      estimatedLossQty: Number(productionExceptionLossQty || 0),
      affectsDelivery: productionExceptionAffectsDelivery,
      remark: productionExceptionRemark,
    });
  }

  function requestProductionExceptionResolutionConfirmation() {
    if (!selectedProductionLine || !latestProductionException || productionExceptionResolutionDisabled) return;
    const resolutionLabel =
      productionExceptionResolutionOptions.find((item) => item.value === productionExceptionResolutionCode)?.label ??
      productionExceptionResolutionCode;
    setProductionExceptionResolutionConfirmation({
      payload: {
        entryLabel: "生产/打包工作台",
        productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
        orderLineId: selectedProductionLine.id,
        orderLine: selectedProductionLine,
        productionException: latestProductionException,
        productionExceptionId: latestProductionException.productionExceptionId,
        resolutionCode: productionExceptionResolutionCode,
        resolutionNote: productionExceptionResolutionNote,
      },
      summary: {
        title: `确认异常处理：${resolutionLabel}`,
        fields: [
          { label: "生产任务", value: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine) },
          { label: "客户", value: findCustomer(selectedProductionLine.customerId).name },
          { label: "货品", value: `${selectedProductionLine.product ?? selectedProductionLine.productName ?? ""} / ${selectedProductionLine.size ?? ""}` },
          { label: "异常", value: `${latestProductionException.exceptionType ?? "生产异常"} / ${latestProductionException.status ?? "待处理"}` },
          { label: "处理结果", value: resolutionLabel },
          { label: "处理说明", value: productionExceptionResolutionNote },
        ],
        effects: buildProductionExceptionResolutionEffects(productionExceptionResolutionCode),
      },
    });
  }

  function confirmProductionExceptionResolution() {
    if (!productionExceptionResolutionConfirmation) return;
    const payload = productionExceptionResolutionConfirmation.payload;
    setProductionExceptionResolutionConfirmation(null);
    onAction("处理生产异常", { ...payload, resolutionConfirmed: true });
  }

  function returnToProductionExceptionResolutionEdit() {
    restoreProductionExceptionResolutionTriggerRef.current = true;
    setProductionExceptionResolutionConfirmation(null);
  }

  function handleProductionExceptionResolutionConfirmationKeyDown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    returnToProductionExceptionResolutionEdit();
  }

  function requestProductionReportConfirmation(kind) {
    const payload = buildProductionReportPayload(kind);
    if (!payload) return;
    setProductionReportConfirmation({
      kind,
      action: kind === "daily" ? "报当日数量" : "报工完成",
      payload,
      summary: buildProductionReportSummary({
        kind,
        productionTask: payload.productionTask,
        orderLine: selectedProductionLine,
        customerName: payload.customerName,
        payload,
      }),
    });
  }

  function confirmProductionReport() {
    if (!productionReportConfirmation) return;
    const { action, payload } = productionReportConfirmation;
    setProductionReportConfirmation(null);
    onAction(action, { ...payload, productionReportConfirmed: true });
  }

  function returnToProductionReportEdit() {
    restoreProductionReportTriggerKindRef.current = productionReportConfirmation?.kind ?? "";
    setProductionReportConfirmation(null);
  }

  function handleProductionReportConfirmationKeyDown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    returnToProductionReportEdit();
  }

  function buildPackingCompletionPayload() {
    if (!selectedPackingTask?.orderLine) return null;
    const orderLine = selectedPackingTask.orderLine;
    const customer = findCustomer(orderLine.customerId);
    return {
      entryLabel: "生产/打包工作台",
      packingTaskId: selectedPackingTask.packingTaskId,
      packingTask: selectedPackingTask,
      orderLineId: selectedPackingTask.orderLineId,
      orderLine,
      customerName: customer?.name ?? orderLine.customerName ?? "",
      goodsSummary: [
        orderLine.product ?? orderLine.productName,
        orderLine.size,
        getLineColorSpecLabel(orderLine),
        getLinePrintSide(orderLine),
        getLineRemark(orderLine),
      ].filter(Boolean).join(" · "),
      actualPackedQty: Number(packingActualQty || 0),
      packageCount: Number(packingPackageCount || 1),
    };
  }

  function requestPackingCompletion() {
    const payload = buildPackingCompletionPayload();
    if (!payload) return;
    setPackingCompletionConfirmation({
      payload,
      summary: buildPackingCompletionSummary({
        packingTask: selectedPackingTask,
        orderLine: selectedPackingTask.orderLine,
        customerName: payload.customerName,
        payload,
      }),
    });
  }

  function confirmPackingCompletion() {
    if (!packingCompletionConfirmation) return;
    const { payload } = packingCompletionConfirmation;
    setPackingCompletionConfirmation(null);
    onAction("提交打包完成", { ...payload, packingCompletionConfirmed: true });
  }

  function returnToPackingCompletionEdit() {
    restorePackingCompletionTriggerFocusRef.current = true;
    setPackingCompletionConfirmation(null);
  }

  function handlePackingCompletionConfirmationKeyDown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    returnToPackingCompletionEdit();
  }

  return (
    <>
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
        <ProductionPackingTaskCards
          activePrintWorkspaceTab={activePrintWorkspaceTab}
          activeWorkbenchTab={activeWorkbenchTab}
          buildProductionTaskId={buildProductionTaskId}
          completedPackingTaskCount={completedPackingTaskCount}
          findCustomer={findCustomer}
          getLineColorSpecLabel={getLineColorSpecLabel}
          getLinePrintSide={getLinePrintSide}
          onPackingTaskFilterChange={setPackingTaskFilter}
          onPrintWorkspaceTabChange={setActivePrintWorkspaceTab}
          onProductionTaskPriorityChange={setProductionTaskPriority}
          onSelectPackingTask={selectPackingTask}
          onSelectProductionLine={selectProductionLine}
          packingTaskFilter={packingTaskFilter}
          packingTaskFilters={PACKING_TASK_FILTERS}
          packingTasks={packingTasks}
          pendingPackingTaskCount={pendingPackingTaskCount}
          printWorkspaceItems={printWorkspaceItems}
          productionAttentionCount={productionAttentionCount}
          productionLines={productionLines}
          productionTaskCards={productionTaskCards}
          productionTaskPriority={productionTaskPriority}
          resolveInventoryItem={resolveInventoryItem}
          scheduleQueueMachineCount={scheduleQueueMachineOptions.length}
          selectedPackingTask={selectedPackingTask}
          selectedProductionLine={selectedProductionLine}
          statusTone={statusTone}
          visiblePackingTasks={visiblePackingTasks}
          workbenchTabs={PRODUCTION_WORKBENCH_TABS}
        />
        <ProductionScheduleQueueSection
          authState={authState}
          buildProductionTaskId={buildProductionTaskId}
          canMoveScheduleDown={canMoveScheduleDown}
          canMoveScheduleUp={canMoveScheduleUp}
          currentUser={currentUser}
          detailMode={detailMode}
          onConflictBack={() => setScheduleWriteConflict(null)}
          onConflictRefresh={async () => {
            await onRefreshProduction?.();
            setScheduleWriteConflict(null);
            setScheduleActionConfirmation(null);
          }}
          onMoveDirection={moveSelectedScheduleQueue}
          onMoveReasonChange={updateQueueMoveReason}
          onMoveTargetMachineChange={updateQueueMoveTargetMachine}
          onMoveTargetSeqChange={updateQueueMoveTargetSeq}
          onMoveToTarget={moveSelectedScheduleQueueToTarget}
          onScheduleDecisionChange={setScheduleDecision}
          onSelectScheduleQueueItem={selectScheduleQueueItem}
          productionPacking={productionPacking}
          queueMoveDisabled={queueMoveDisabled}
          queueMoveImpact={queueMoveImpact}
          queueMovePositionOptions={queueMovePositionOptions}
          queueMoveReason={queueMoveReason}
          queueMoveTargetMachineId={queueMoveTargetMachineId}
          queueMoveTargetSeq={queueMoveTargetSeq}
          queueMoveTitle={queueMoveTitle}
          scheduleActionConfirmationOpen={Boolean(scheduleActionConfirmation)}
          scheduleActionSubmitting={scheduleActionSubmitting}
          scheduleDecision={scheduleDecision}
          scheduleDecisionReady={scheduleDecisionReady}
          scheduleDirectAllowed={scheduleDirectAllowed}
          scheduleQueueItems={scheduleQueueItems}
          scheduleQueueMachineOptions={scheduleQueueMachineOptions}
          scheduleWriteConflict={scheduleWriteConflict}
          selectedProductionLine={selectedProductionLine}
          selectedScheduleQueueItem={selectedScheduleQueueItem}
          sequenceState={sequenceState}
        />
        <ProductionPackingTaskTables
          buildProductionTaskId={buildProductionTaskId}
          detailMode={detailMode}
          findCustomer={findCustomer}
          getLineColorSpecLabel={getLineColorSpecLabel}
          onSelectPackingTask={selectPackingTask}
          onSelectProductionLine={selectProductionLine}
          packingTasks={packingTasks}
          productionLines={productionLines}
          resolveInventoryItem={resolveInventoryItem}
          selectedPackingTask={selectedPackingTask}
          selectedProductionLine={selectedProductionLine}
          statusTone={statusTone}
        />
      </OperationalPanel>
      <DetailPane
        className="production-packing-detail-pane"
        title={activeWorkbenchTab === "print" ? "打印与设备" : detailMode === "packing" ? selectedPackingTask?.packingTaskId ?? "打包任务" : selectedProductionLine ? buildProductionTaskId(selectedProductionLine) : "生产报工"}
        subtitle={activeWorkbenchTab === "print" ? "设备验收、驱动状态与打印作业" : detailLine ? `${findCustomer(detailLine.customerId).name} · ${detailLine.id}` : "未选择"}
      >
        {activeWorkbenchTab === "print" ? (
          <Suspense fallback={<DataState title="打印与设备工作台加载中" compact />}>
            <ProductionPrintWorkspaceDetail
              activePrintWorkspace={activePrintWorkspace}
              activePrintWorkspaceTab={activePrintWorkspaceTab}
              getUiActionState={getUiActionState}
              onChangePrinterDeviceQaCheck={onChangePrinterDeviceQaCheck}
              onChangePrinterDeviceQaEvidenceField={onChangePrinterDeviceQaEvidenceField}
              onChangePrinterDeviceQaField={onChangePrinterDeviceQaField}
              onDispatchPrintJob={onDispatchPrintJob}
              onRefreshPrintDriverConfig={onRefreshPrintDriverConfig}
              onRefreshPrintDriverReadiness={onRefreshPrintDriverReadiness}
              onRefreshPrintJobs={onRefreshPrintJobs}
              onRefreshPrinterDeviceQa={onRefreshPrinterDeviceQa}
              onRetryPrintJob={onRetryPrintJob}
              onSavePrinterDeviceMode={onSavePrinterDeviceMode}
              onSavePrinterDeviceQa={onSavePrinterDeviceQa}
              onSelectPrinterDeviceQaDevice={onSelectPrinterDeviceQaDevice}
              printDriverConfig={printDriverConfig}
              printDriverCupsDiagnostics={printDriverCupsDiagnostics}
              printDriverReadiness={printDriverReadiness}
              printJobQueue={printJobQueue}
              printerDeviceQa={printerDeviceQa}
            />
          </Suspense>
        ) : detailLine ? (
          <>
            <div className="production-detail-fixed">
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
                  ["生产异常", detailMode === "production" && latestProductionException ? `${latestProductionException.exceptionType} · ${latestProductionException.continuationMode}` : "无"],
                  ["备注", getLineRemark(detailLine) || "无"],
                ]}
              />
            </div>
            <div className="production-detail-scroll">
            {visibleSourceDetail ? (
              <ProductionPackingSourceDetailCard detailState={visibleSourceDetail} detailMode={detailMode} />
            ) : null}
            {detailMode === "production" ? (
              <>
                {!productionReportConfirmation ? (
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
                      disabled={reportDisabled || Boolean(productionReportConfirmation)}
                      ref={productionCompleteReportTriggerRef}
                      title={reportTitle}
                      onClick={() => requestProductionReportConfirmation("complete")}
                    >
                      提交合格数量
                    </button>
                  </div>
                </section>
                  </>
                ) : null}
                <section className="detail-section production-transaction-result">
                  <h3>事务结果</h3>
                  <p>报当日数量只记录跨日进度，不入库、不占用、不生成打包任务；报工完成才会把合格数量入库并占用给该订单。</p>
                </section>
                <ProductionExceptionPanel
                  affectsDelivery={productionExceptionAffectsDelivery}
                  estimatedLossQty={productionExceptionLossQty}
                  exceptionDisabled={productionExceptionDisabled}
                  exceptionRemark={productionExceptionRemark}
                  exceptionTitle={productionExceptionTitle}
                  exceptionType={productionExceptionType}
                  latestException={latestProductionException}
                  onChangeField={updateReportInput}
                  onConfirmResolution={confirmProductionExceptionResolution}
                  onRequestResolutionConfirmation={requestProductionExceptionResolutionConfirmation}
                  onResolutionConfirmationKeyDown={handleProductionExceptionResolutionConfirmationKeyDown}
                  onReturnToResolutionEdit={returnToProductionExceptionResolutionEdit}
                  onSubmitException={submitProductionException}
                  productionReportConfirmationOpen={Boolean(productionReportConfirmation)}
                  resolutionCode={productionExceptionResolutionCode}
                  resolutionConfirmation={productionExceptionResolutionConfirmation}
                  resolutionConfirmationRef={productionExceptionResolutionConfirmationRef}
                  resolutionDisabled={productionExceptionResolutionDisabled}
                  resolutionNote={productionExceptionResolutionNote}
                  resolutionTerminal={productionExceptionResolutionTerminal}
                  resolutionTitle={productionExceptionResolutionTitle}
                  resolutionTriggerRef={productionExceptionResolutionTriggerRef}
                />
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
                <section className="detail-section production-schedule-decision-section">
                  <h3>排产经营决定</h3>
                  {!scheduleDirectAllowed ? (
                    <DelegatedBusinessDecisionFields
                      scope="production_schedule"
                      businessType="production_task"
                      businessId={selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine)}
                      authState={authState}
                      operatorId={currentUser?.userId}
                      operatorName={currentUser?.displayName}
                      value={scheduleDecision}
                      onChange={setScheduleDecision}
                      title="排产决定代录"
                      disabled={scheduleActionSubmitting || Boolean(scheduleActionConfirmation)}
                    />
                  ) : (
                    <p className="form-note">当前管理账号直接决定；操作人、决定内容、目标任务和影响范围仍写入审计。</p>
                  )}
                  <BusinessDecisionHistoryPanel
                    authState={authState}
                    operatorId={currentUser?.userId}
                    businessType="production_task"
                    businessId={selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine)}
                  />
                </section>
                <div className="action-row">
                  <button
                    disabled={publishScheduleDisabled || Boolean(productionReportConfirmation) || Boolean(scheduleActionConfirmation)}
                    title={publishScheduleTitle}
                    onClick={() => {
                      const summary = `发布 ${selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine)} 排产`;
                      requestScheduleAction("发布排产", {
                        ...scheduleDecisionPayload(summary),
                        orderLineId: selectedProductionLine.id,
                        orderLine: selectedProductionLine,
                        productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
                        processType: getProductionProcessLabel(selectedProductionLine),
                        machineId: selectedProductionMachineId,
                        plannedQty: selectedProductionLine.qty,
                        expectedRevision: Number(
                          selectedProductionLine.productionTask?.revision ?? selectedProductionLine.revision ?? 0,
                        ),
                      }, summary, "创建/更新正式排产记录并进入车间任务池，写入决定证据和审计；不直接生成库存、打包或对账。")
                    }}
                  >
                    {selectedPublishedScheduleId ? "已发布排产" : "发布排产"}
                  </button>
                  <button
                    disabled={reportDailyDisabled || Boolean(productionReportConfirmation)}
                    ref={productionDailyReportTriggerRef}
                    title={reportDailyTitle}
                    onClick={() => requestProductionReportConfirmation("daily")}
                  >
                    报当日数量
                  </button>
                </div>
                {productionReportConfirmation ? (
                  <section
                    aria-describedby="production-report-confirmation-summary"
                    aria-labelledby="production-report-confirmation-title"
                    aria-live="assertive"
                    className="production-report-confirmation"
                    onKeyDown={handleProductionReportConfirmationKeyDown}
                    ref={productionReportConfirmationRef}
                    role="region"
                    tabIndex={-1}
                  >
                    <div className="production-report-confirmation-head">
                      <div>
                        <strong id="production-report-confirmation-title">{productionReportConfirmation.summary.title}</strong>
                        <span id="production-report-confirmation-summary">
                          {productionReportConfirmation.kind === "daily"
                            ? "确认后才会写入当日进度；按 Esc 可返回修改。"
                            : "确认后才会完成生产、入库、占用并创建待打包任务；按 Esc 可返回修改。"}
                        </span>
                      </div>
                      <StatusPill tone="warning">高风险写入</StatusPill>
                    </div>
                    <div className="production-report-confirmation-grid">
                      {productionReportConfirmation.summary.fields.map((item) => (
                        <div key={item.label}>
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                    <ul className="production-report-confirmation-effects">
                      {productionReportConfirmation.summary.effects.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                    <div className="production-report-confirmation-actions">
                      <button type="button" onClick={returnToProductionReportEdit}>返回修改</button>
                      <button
                        className="primary-action"
                        type="button"
                        disabled={productionReportConfirmation.kind === "daily" ? reportDailyDisabled : reportDisabled}
                        onClick={confirmProductionReport}
                      >
                        {productionReportConfirmation.kind === "daily" ? "确认提交当日报数" : "确认完成生产报工"}
                      </button>
                    </div>
                  </section>
                ) : null}
              </>
            ) : (
              <>
                {!packingCompletionConfirmation ? (
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
                      </div>
                    </section>
                    <section className="detail-section">
                      <h3>事务结果</h3>
                      <p>提交后生成包裹记录；快递快运统一进入待打印标签，只有服务端确认打印作业完成后才进入下一步。打包完成本身不扣库存。</p>
                    </section>
                  </>
                ) : null}
                <div className="action-row">
                  <button
                    className="primary-action"
                    disabled={packingDisabled || Boolean(packingCompletionConfirmation)}
                    ref={packingCompletionTriggerRef}
                    title={packingTitle}
                    onClick={requestPackingCompletion}
                  >
                    提交打包完成
                  </button>
                </div>
                {packingCompletionConfirmation ? (
                  <section
                    aria-describedby="production-packing-completion-confirmation-summary"
                    aria-labelledby="production-packing-completion-confirmation-title"
                    aria-live="assertive"
                    className="packing-completion-confirmation"
                    onKeyDown={handlePackingCompletionConfirmationKeyDown}
                    ref={packingCompletionConfirmationRef}
                    role="region"
                    tabIndex={-1}
                  >
                    <div className="packing-completion-confirmation-head">
                      <div>
                        <strong id="production-packing-completion-confirmation-title">{packingCompletionConfirmation.summary.title}</strong>
                        <span id="production-packing-completion-confirmation-summary">确认后才会生成包裹并写入打包结果；按 Esc 可返回修改。</span>
                      </div>
                      <StatusPill tone="warning">高风险写入</StatusPill>
                    </div>
                    <div className="packing-completion-confirmation-grid">
                      {packingCompletionConfirmation.summary.fields.map((item) => (
                        <div key={item.label}>
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                    <ul className="packing-completion-confirmation-effects">
                      {packingCompletionConfirmation.summary.effects.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                    <div className="packing-completion-confirmation-actions">
                      <button type="button" onClick={returnToPackingCompletionEdit}>返回修改</button>
                      <button className="primary-action" type="button" disabled={packingDisabled} onClick={confirmPackingCompletion}>确认提交打包完成</button>
                    </div>
                  </section>
                ) : null}
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
            </div>
          </>
        ) : (
          <DataState title="暂无生产或打包任务" detail="刷新任务池或确认排产是否已发布。" compact />
        )}
      </DetailPane>
      </section>
    </section>
    <ProductionScheduleActionConfirmationDialog
      buildProductionTaskId={buildProductionTaskId}
      confirmation={scheduleActionConfirmation}
      currentUser={currentUser}
      dialogRef={scheduleActionDialogRef}
      onReturnToEdit={returnToScheduleActionEdit}
      onSubmit={submitScheduleAction}
      submitting={scheduleActionSubmitting}
    />
    </>
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

function isProductionReportingBlocked(line) {
  const status = String(line?.status ?? line?.lineStatus ?? "").trim();
  return ["异常暂停", "数量差异待处理", "已作废"].includes(status);
}

function buildScheduleActionIdempotencyKey(action, payload = {}) {
  const taskId = payload.productionTaskId || payload.machineId || "queue";
  const revision = Number(payload.expectedRevision ?? 0);
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const actionToken = {
    发布排产: "publish",
    移动排产任务: "move",
    调整排产顺序: "resequence",
  }[action] ?? "action";
  return `production-schedule:${actionToken}:${taskId}:${revision}:${uuid}`;
}
