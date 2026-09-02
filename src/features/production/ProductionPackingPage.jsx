import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  DataState,
  DataTable,
  DetailPane,
  Timeline,
} from "../../shared/ui/operational.jsx";
import {
  buildPackingTaskRows,
  buildPrintWorkspaceItems,
  findFocusedProductionLine,
  findScheduleQueueItemForLine,
  getBooleanInput,
  getDefaultQueueMoveTargetMachineId,
  getNormalizedQueueMoveSeq,
  getNumericInput,
  getProductionDailyProgress,
  getProductionFinishedGoodsPhoto,
  getProductionMachineIdLabel,
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
  PackingCompletionSection,
  ProductionFinishedGoodsPhotoSection,
  ProductionPackingDetailHeader,
  ProductionPackingSourceDetailCard,
  ProductionReportConfirmationPanel,
  ProductionScheduleDecisionSection,
  ProductionTaskReportInputs,
} from "./ProductionPackingDetailSections.jsx";
import { ProductionScheduleActionConfirmationDialog } from "./ProductionScheduleActionConfirmationDialog.jsx";
import { ProductionPackingTaskPane } from "./ProductionPackingTaskPane.jsx";
import {
  buildProductionExceptionResolutionEffects,
  isTerminalProductionException,
  ProductionExceptionPanel,
  productionExceptionResolutionOptions,
} from "./ProductionExceptionPanel.jsx";
import { buildPackingCompletionSummary } from "../../services/packingCompletionConfirmationClient.js";
import { buildProductionReportSummary } from "../../services/productionReportConfirmationClient.js";
import { isDelegatedBusinessDecisionComplete } from "../../components/DelegatedBusinessDecisionFields.jsx";

const PRODUCTION_WORKBENCH_TABS = [
  { value: "production", label: "生产任务" },
  { value: "packing", label: "打包任务" },
  { value: "print", label: "打印与设备" },
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

  const taskPaneRuntime = {
    activePrintWorkspaceTab, activeWorkbenchTab, authState, buildProductionTaskId,
    canMoveScheduleDown, canMoveScheduleUp, completedPackingTaskCount, currentUser,
    detailMode, findCustomer, focusNotice, getLineColorSpecLabel, getLinePrintSide,
    onConflictBack: () => setScheduleWriteConflict(null),
    onConflictRefresh: async () => {
      await onRefreshProduction?.();
      setScheduleWriteConflict(null);
      setScheduleActionConfirmation(null);
    },
    onMoveDirection: moveSelectedScheduleQueue,
    onMoveReasonChange: updateQueueMoveReason,
    onMoveTargetMachineChange: updateQueueMoveTargetMachine,
    onMoveTargetSeqChange: updateQueueMoveTargetSeq,
    onMoveToTarget: moveSelectedScheduleQueueToTarget,
    onPackingTaskFilterChange: setPackingTaskFilter,
    onPrintWorkspaceTabChange: setActivePrintWorkspaceTab,
    onProductionTaskPriorityChange: setProductionTaskPriority,
    onScheduleDecisionChange: setScheduleDecision,
    onSelectPackingTask: selectPackingTask,
    onSelectProductionLine: selectProductionLine,
    onSelectScheduleQueueItem: selectScheduleQueueItem,
    packingTaskFilter, packingTasks, pendingPackingTaskCount, printWorkspaceItems,
    productionAttentionCount, productionLines, productionPacking, productionTaskCards,
    productionTaskPriority, queueMoveDisabled, queueMoveImpact, queueMovePositionOptions,
    queueMoveReason, queueMoveTargetMachineId, queueMoveTargetSeq, queueMoveTitle,
    resolveInventoryItem, scheduleActionConfirmationOpen: Boolean(scheduleActionConfirmation),
    scheduleActionSubmitting, scheduleDecision, scheduleDecisionReady, scheduleDirectAllowed,
    scheduleQueueItems, scheduleQueueMachineOptions, scheduleQueueStatusText,
    scheduleWriteConflict, selectedPackingTask, selectedProductionLine,
    selectedScheduleQueueItem, sequenceState, stats, statusTone, taskListStatusText,
    visiblePackingTasks, workbenchTabs: PRODUCTION_WORKBENCH_TABS,
  };

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
      <ProductionPackingTaskPane runtime={taskPaneRuntime} />
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
            <ProductionPackingDetailHeader
              detailInventoryItem={detailInventoryItem}
              detailLine={detailLine}
              detailMode={detailMode}
              findCustomer={findCustomer}
              getLineColorSpecLabel={getLineColorSpecLabel}
              getLinePrintSide={getLinePrintSide}
              getLineRemark={getLineRemark}
              latestProductionException={latestProductionException}
              selectedFinishedGoodsPhoto={selectedFinishedGoodsPhoto}
              selectedPackingTask={selectedPackingTask}
              selectedProductionMachineId={selectedProductionMachineId}
              selectedPublishedScheduleId={selectedPublishedScheduleId}
              selectedProductionTaskId={buildProductionTaskId(selectedProductionLine)}
            />
            <div className="production-detail-scroll">
            {visibleSourceDetail ? (
              <ProductionPackingSourceDetailCard detailState={visibleSourceDetail} detailMode={detailMode} />
            ) : null}
            {detailMode === "production" ? (
              <>
                {!productionReportConfirmation ? (
                  <ProductionTaskReportInputs
                    completeReportTriggerRef={productionCompleteReportTriggerRef}
                    confirmationOpen={Boolean(productionReportConfirmation)}
                    onChange={updateReportInput}
                    onRequestComplete={() => requestProductionReportConfirmation("complete")}
                    reportDisabled={reportDisabled}
                    reportExceptionQty={reportExceptionQty}
                    reportMachineCount={reportMachineCount}
                    reportQualifiedQty={reportQualifiedQty}
                    reportTitle={reportTitle}
                    selectedProductionLine={selectedProductionLine}
                  />
                ) : null}
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
                <ProductionFinishedGoodsPhotoSection
                  finishedGoodsPhoto={selectedFinishedGoodsPhoto}
                  onAccept={() =>
                    onAction("确认成品图", {
                      orderLineId: selectedProductionLine.id,
                      orderLine: selectedProductionLine,
                      productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
                    })
                  }
                  onReject={() =>
                    onAction("退回成品图", {
                      orderLineId: selectedProductionLine.id,
                      orderLine: selectedProductionLine,
                      productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
                    })
                  }
                  onUpload={() =>
                    onAction("上传成品图", {
                      orderLineId: selectedProductionLine.id,
                      orderLine: selectedProductionLine,
                      productionTaskId: selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine),
                    })
                  }
                  rejectDisabled={finishedPhotoRejectDisabled}
                  rejectTitle={finishedPhotoRejectTitle}
                  reviewDisabled={finishedPhotoReviewDisabled}
                  reviewTitle={finishedPhotoReviewTitle}
                  uploadDisabled={finishedPhotoUploadDisabled}
                  uploadTitle={finishedPhotoUploadTitle}
                />
                <ProductionScheduleDecisionSection
                  authState={authState}
                  businessId={selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine)}
                  currentUser={currentUser}
                  disabled={scheduleActionSubmitting || Boolean(scheduleActionConfirmation)}
                  directAllowed={scheduleDirectAllowed}
                  onChange={setScheduleDecision}
                  scheduleDecision={scheduleDecision}
                />
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
                <ProductionReportConfirmationPanel
                  confirmation={productionReportConfirmation}
                  confirmationRef={productionReportConfirmationRef}
                  onConfirm={confirmProductionReport}
                  onKeyDown={handleProductionReportConfirmationKeyDown}
                  onReturnToEdit={returnToProductionReportEdit}
                  reportDailyDisabled={reportDailyDisabled}
                  reportDisabled={reportDisabled}
                />
              </>
            ) : (
              <PackingCompletionSection
                confirmation={packingCompletionConfirmation}
                confirmationRef={packingCompletionConfirmationRef}
                confirmationTriggerRef={packingCompletionTriggerRef}
                onChange={updatePackingInput}
                onConfirm={confirmPackingCompletion}
                onKeyDown={handlePackingCompletionConfirmationKeyDown}
                onRequest={requestPackingCompletion}
                onReturnToEdit={returnToPackingCompletionEdit}
                packageCount={packingPackageCount}
                packedQty={packingActualQty}
                packingDisabled={packingDisabled}
                packingTitle={packingTitle}
              />
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
