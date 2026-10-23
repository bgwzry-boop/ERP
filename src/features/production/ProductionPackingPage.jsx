import {useDecisionEvidenceGate} from "../../components/useDecisionEvidenceGate.js";
import {formatOperationalError} from "../../shared/ui/errorPresentation.js";
import { useEffect, useRef, useState } from "react";
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
  getProductionPublishedScheduleId,
  getProductionScheduleQueueStatusText,
  getQueueMoveImpactSummary,
  getQueueMovePositionOptions,
  getQueueMoveReason,
  getScheduleQueueItemsForMachine,
  getScheduleQueueMachineOptions,
  getVisibleProductionPackingSourceDetail,
  selectProductionExceptionForFocus,
  inferPackageCountFromQty,
  isProductionFinishedGoodsPhotoRequired,
  isProductionPackingTaskListFromApi,
  isProductionReportCandidate,
  moveScheduleQueueItem,
  sortScheduleQueueItemsBySeq,
} from "./productionPackingPresentation.js";
import { ProductionScheduleActionConfirmationDialog } from "./ProductionScheduleActionConfirmationDialog.jsx";
import { ProductionPackingDetailPane } from "./ProductionPackingDetailPane.jsx";
import { ProductionPackingTaskPane } from "./ProductionPackingTaskPane.jsx";
import {
  buildProductionExceptionResolutionEffects,
  isTerminalProductionException,
  productionExceptionResolutionOptions,
} from "./ProductionExceptionPanel.jsx";
import { buildPackingCompletionSummary } from "../../services/packingCompletionConfirmationClient.js";
import { buildProductionReportSummary } from "../../services/productionReportConfirmationClient.js";
import { isDelegatedBusinessDecisionComplete } from "../../components/DelegatedBusinessDecisionFields.jsx";
import { normalizeOrderType } from "../../../shared/orderRouting.js";
import {
  buildPackingCompletionActionPayload,
  buildProductionExceptionActionPayload,
  buildProductionExceptionResolutionConfirmation,
  buildProductionReportActionPayload,
  buildScheduleActionIdempotencyKey,
  buildScheduleMoveConfirmation,
  buildScheduleResequenceConfirmation,
  isProductionReportingBlocked,
} from "./productionPackingActionBuilders.js";

const PRODUCTION_WORKBENCH_TABS = [
  { value: "production", label: "生产任务" },
  { value: "packing", label: "打包任务" },
  { value: "print", label: "打印与设备" },
];

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
    focusedProductionLine && !baseProductionLines.some((line) => buildProductionTaskId(line) === buildProductionTaskId(focusedProductionLine))
      ? [focusedProductionLine, ...baseProductionLines]
      : baseProductionLines;
  const packingTasks = buildPackingTaskRows({
    orderLines,
    packingTasks: productionPacking.packingTasks,
    includeLocalProjections: !taskListFromApi,
  });
  const lastAppliedFocusKeyRef = useRef("");
  const [selectedProductionTaskId, setSelectedProductionTaskId] = useState(buildProductionTaskId(productionLines[0]));
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
  const scheduleEvidence = useDecisionEvidenceGate();
  const scheduleRequestRef = useRef(null);
  const scheduleContextRef = useRef(0);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleDecision, setScheduleDecision] = useState(createScheduleDecision);
  const [scheduleActionConfirmation, setScheduleActionConfirmation] = useState(null);
  const [scheduleActionSubmitting, setScheduleActionSubmitting] = useState(false);
  const scheduleActionDialogRef = useRef(null);
  const scheduleActionTriggerRef = useRef(null);
  const restoreScheduleActionTriggerRef = useRef(false);
  const [scheduleWriteConflict, setScheduleWriteConflict] = useState(null);
  const resolveInventoryItem = (line, task = null) => findProductionInventoryItem(line, inventoryRecords) ?? line?.inventoryItem ?? task?.inventoryItem ?? null;
  const isAttentionProductionLine = (line) => (!resolveInventoryItem(line) && normalizeOrderType(line?.orderType) !== "custom_special") || line.confidence === "medium";
  const productionAttentionCount = productionLines.filter(isAttentionProductionLine).length;
  const productionTaskCards = [...productionLines].sort((left, right) => {
    const leftAttention = Number(isAttentionProductionLine(left));
    const rightAttention = Number(isAttentionProductionLine(right));
    return productionTaskPriority === "attention" ? rightAttention - leftAttention : leftAttention - rightAttention;
  });
  const selectedProductionLine = productionTaskCards.find((item) => buildProductionTaskId(item) === selectedProductionTaskId) ?? productionTaskCards[0] ?? null;
  const selectedTaskKey = buildProductionTaskId(selectedProductionLine);
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
  const reportQualifiedQty = getNumericInput(reportInputs, selectedTaskKey, "qualifiedQty", selectedProductionLine?.qty ?? 0);
  const reportExceptionQty = getNumericInput(reportInputs, selectedTaskKey, "exceptionQty", 0);
  const reportMachineCount = getNumericInput(reportInputs, selectedTaskKey, "machineCount", "");
  const productionExceptionType = String(reportInputs[selectedTaskKey]?.exceptionType ?? "");
  const productionExceptionLossQty = getNumericInput(reportInputs, selectedTaskKey, "estimatedLossQty", 0);
  const productionExceptionAffectsDelivery = getBooleanInput(reportInputs, selectedTaskKey, "exceptionAffectsDelivery", false);
  const productionExceptionRemark = String(reportInputs[selectedTaskKey]?.exceptionRemark ?? "");
  const productionExceptionResolutionCode = String(reportInputs[selectedTaskKey]?.exceptionResolutionCode ?? "");
  const productionExceptionResolutionNote = String(reportInputs[selectedTaskKey]?.exceptionResolutionNote ?? "");
  const packingActualQty = getNumericInput(packingInputs, selectedPackingTask?.packingTaskId, "actualPackedQty", selectedPackingTask?.plannedQty ?? 0);
  const packingPackageCount = getNumericInput(packingInputs, selectedPackingTask?.packingTaskId, "packageCount", selectedPackingTask?.packageCount ?? inferPackageCountFromQty(selectedPackingTask?.plannedQty));
  const selectedProductionCanReport = selectedProductionLine ? isProductionReportCandidate(selectedProductionLine) : false;
  const selectedProductionIsCustomSpecial = normalizeOrderType(selectedProductionLine?.orderType) === "custom_special";
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
  const scheduleDecisionReady = scheduleDirectAllowed || (scheduleEvidence.ready && isDelegatedBusinessDecisionComplete(scheduleDecision));
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
  const focusNotice = [getProductionPackingFocusNotice(focusTarget, {
    detailMode,
    selectedProductionLine,
    selectedPackingTask,
    buildProductionTaskId,
  }), focusTarget?.taskId === selectedProductionTaskId && focusTarget?.productionExceptionId
    ? `待办对应异常：${focusTarget.productionExceptionId}。读取到该异常后才能处理，不自动切换到最新异常。` : ""].filter(Boolean).join(" · ");
  const stats = [
    ["待报工", baseProductionLines.length, baseProductionLines.length ? "warning" : "success"],
    ["排产队列", productionPacking.scheduleQueueTotal ?? scheduleQueueItems.length, scheduleQueueItems.length ? "blue" : "success"],
    ["跨日继续", baseProductionLines.filter((line) => getProductionDailyProgress(line)?.carryOver).length, "blue"],
    ["待打包", packingTasks.filter((item) => item.status !== "已完成").length, "blue"],
    ["已打包", packingTasks.filter((item) => item.status === "已完成").length, "success"],
  ];
  const reportDisabled = reportState.disabled || !selectedProductionLine || (!detailInventoryItem && !selectedProductionIsCustomSpecial) || !selectedProductionCanReport || selectedProductionPaused;
  const reportTitle = reportState.title || (selectedProductionPaused ? "任务因生产异常暂停，需先由生产管理处理" : !selectedProductionCanReport ? "该订单明细已完成生产报工或不在可报工状态" : !detailInventoryItem && !selectedProductionIsCustomSpecial ? "未找到匹配库存键，不能报工入库" : "");
  const reportDailyDisabled = reportDailyState.disabled || !selectedProductionLine || !selectedProductionCanReport || selectedProductionPaused;
  const reportDailyTitle = reportDailyState.title || (selectedProductionPaused ? "任务因生产异常暂停，需先由生产管理处理" : !selectedProductionCanReport ? "该订单明细已完成生产报工或不在可报工状态" : "");
  const productionExceptionDisabled = productionExceptionState.disabled || !selectedProductionLine || !productionExceptionType;
  const productionExceptionTitle = productionExceptionState.title || (!productionExceptionType ? "请先选择异常类型" : "");
  const latestProductionException = selectProductionExceptionForFocus({ focusTarget, selectedTaskId: selectedProductionTaskId,
    line: selectedProductionLine, detail: visibleSourceDetail?.detail,
    fallback: productionPacking.productionExceptionsByLineId?.[selectedProductionLine?.id] });
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
  }, [selectedProductionTaskId, activeWorkbenchTab]);

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
    setSelectedProductionTaskId(lineId);
    setActiveWorkbenchTab("production");
  }

  function selectPackingTask(taskId) {
    setSelectedPackingTaskId(taskId);
    setActiveWorkbenchTab("packing");
  }

  function selectScheduleQueueItem(queueItem) {
    const targetLine = findFocusedProductionLine(productionLines, queueItem, buildProductionTaskId);
    if (!targetLine) return;
    selectProductionLine(buildProductionTaskId(targetLine));
  }

  useEffect(() => {
    scheduleContextRef.current += 1;
    scheduleRequestRef.current = null;
    setScheduleDecision(createScheduleDecision());
    setScheduleActionConfirmation(null); setScheduleActionSubmitting(false);
    setScheduleWriteConflict(null); setScheduleError("");
  }, [selectedProductionLine?.productionTaskId, selectedProductionLine?.id, activeWorkbenchTab, currentUser?.userId, authState?.session?.accessToken]);

  function requestScheduleAction(action, payload, summary, effects) {
    if (!scheduleDirectAllowed && !scheduleEvidence.isReady()) return;
    if (!scheduleDecisionReady || scheduleActionSubmitting || scheduleActionConfirmation) return;
    setScheduleError("");
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
    if (!scheduleActionConfirmation || scheduleRequestRef.current) return;
    const snapshot = scheduleActionConfirmation;
    if (getUiActionState("productionPacking", snapshot.action).disabled || (snapshot.directAllowed && !scheduleDirectAllowed)) {
      setScheduleError("当前权限已变化，请返回修改并重新核对。"); return;
    }
    const context = scheduleContextRef.current; const request = {};
    scheduleRequestRef.current = request; setScheduleActionSubmitting(true); setScheduleError("");
    try {
      const result = await onAction(snapshot.action, snapshot.payload);
      if (context !== scheduleContextRef.current) return;
      if (result?.error?.status === 409 || result?.error?.statusCode === 409 || String(result?.error?.code ?? "").includes("CONFLICT")) {
        setScheduleActionConfirmation(null); setScheduleWriteConflict(result.error); return;
      }
      if (!result || result.blocked || result.error || result.source !== "api" || !result.operationLogId) {
        setScheduleError(formatOperationalError(result?.error, "未收到排产成功确认，请重试原请求。")); return;
      }
      setScheduleActionConfirmation(null); setScheduleDecision(createScheduleDecision());
    } catch(error) {
      if (context === scheduleContextRef.current) setScheduleError(formatOperationalError(error, "提交失败，请重试原请求。"));
    } finally {
      if (scheduleRequestRef.current === request) { scheduleRequestRef.current = null; setScheduleActionSubmitting(false); }
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
    const confirmation = buildScheduleResequenceConfirmation({
      selectedScheduleQueueItem,
      selectedMachineScheduleQueueItems,
      nextOrderedItems,
      scheduleDecisionPayload,
      direction,
    });
    if (!confirmation) return;
    requestScheduleAction(confirmation.action, confirmation.payload, confirmation.summary, confirmation.effects);
  }

  function moveSelectedScheduleQueueToTarget() {
    if (queueMoveDisabled) return;
    const confirmation = buildScheduleMoveConfirmation({
      selectedScheduleQueueItem,
      queueMoveTargetMachineId,
      queueMoveTargetSeq,
      queueMoveReason,
      queueMoveImpact,
      scheduleDecisionPayload,
    });
    if (!confirmation) return;
    requestScheduleAction(confirmation.action, confirmation.payload, confirmation.summary, confirmation.effects);
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
      setSelectedProductionTaskId(buildProductionTaskId(targetLine));
      setActiveWorkbenchTab("production");
      lastAppliedFocusKeyRef.current = focusTarget.focusKey;
    }
  }, [focusTarget, packingTasks, productionLines, buildProductionTaskId]);

  function updateReportInput(field, value) {
    if (!selectedProductionLine) return;
    setReportInputs((current) => ({
      ...current,
      [selectedTaskKey]: {
        ...(current[selectedTaskKey] ?? {}),
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
    return buildProductionReportActionPayload({
      kind,
      selectedProductionLine,
      findCustomer,
      buildProductionTaskId,
      getLineColorSpecLabel,
      getLinePrintSide,
      getLineRemark,
      reportQualifiedQty,
      reportExceptionQty,
      reportMachineCount,
    });
  }

  function submitProductionException(continuationMode) {
    const payload = buildProductionExceptionActionPayload({
      selectedProductionLine,
      buildProductionTaskId,
      productionExceptionType,
      continuationMode,
      productionExceptionLossQty,
      productionExceptionAffectsDelivery,
      productionExceptionRemark,
    });
    if (payload) onAction("上报生产异常", payload);
  }

  function requestProductionExceptionResolutionConfirmation() {
    if (!selectedProductionLine || !latestProductionException || productionExceptionResolutionDisabled) return;
    setProductionExceptionResolutionConfirmation(buildProductionExceptionResolutionConfirmation({
      selectedProductionLine,
      latestProductionException,
      productionExceptionResolutionCode,
      productionExceptionResolutionNote,
      buildProductionTaskId,
      findCustomer,
      resolutionOptions: productionExceptionResolutionOptions,
      buildResolutionEffects: buildProductionExceptionResolutionEffects,
    }));
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
    return buildPackingCompletionActionPayload({
      selectedPackingTask,
      findCustomer,
      getLineColorSpecLabel,
      getLinePrintSide,
      getLineRemark,
      packingActualQty,
      packingPackageCount,
    });
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
    onSelectPackingTask: selectPackingTask,
    onSelectProductionLine: selectProductionLine,
    onSelectScheduleQueueItem: selectScheduleQueueItem,
    packingTaskFilter, packingTasks, pendingPackingTaskCount, printWorkspaceItems,
    productionAttentionCount, productionLines, productionPacking, productionTaskCards,
    productionTaskPriority, queueMoveDisabled, queueMoveImpact, queueMovePositionOptions,
    queueMoveReason, queueMoveTargetMachineId, queueMoveTargetSeq, queueMoveTitle,
    resolveInventoryItem, scheduleActionConfirmationOpen: Boolean(scheduleActionConfirmation),
    scheduleActionSubmitting, scheduleDecisionReady, scheduleDirectAllowed,
    scheduleQueueItems, scheduleQueueMachineOptions, scheduleQueueStatusText,
    scheduleWriteConflict, selectedPackingTask, selectedProductionLine,
    selectedScheduleQueueItem, sequenceState, stats, statusTone, taskListStatusText,
    visiblePackingTasks, workbenchTabs: PRODUCTION_WORKBENCH_TABS,
  };
  const detailPaneRuntime = {
    activePrintWorkspace, activePrintWorkspaceTab, activeWorkbenchTab, authState,
    buildProductionTaskId, confirmPackingCompletion, confirmProductionExceptionResolution,
    confirmProductionReport, currentUser, detailInventoryItem, detailLine, detailMode,
    findCustomer, finishedPhotoRejectDisabled, finishedPhotoRejectTitle,
    finishedPhotoReviewDisabled, finishedPhotoReviewTitle, finishedPhotoUploadDisabled,
    finishedPhotoUploadTitle, getLineColorSpecLabel, getLinePrintSide, getLineRemark,
    getUiActionState, handlePackingCompletionConfirmationKeyDown,
    handleProductionExceptionResolutionConfirmationKeyDown,
    handleProductionReportConfirmationKeyDown, latestProductionException, onAction,
    onChangePrinterDeviceQaCheck, onChangePrinterDeviceQaEvidenceField,
    onChangePrinterDeviceQaField, onDispatchPrintJob, onRefreshPrintDriverConfig,
    onRefreshPrintDriverReadiness, onRefreshPrintJobs, onRefreshPrinterDeviceQa,
    onRetryPrintJob, onSavePrinterDeviceMode, onSavePrinterDeviceQa,
    onSelectPrinterDeviceQaDevice, packingActualQty, packingCompletionConfirmation,
    packingCompletionConfirmationRef, packingCompletionTriggerRef, packingDisabled,
    packingPackageCount, packingTitle, printDriverConfig, printDriverCupsDiagnostics,
    printDriverReadiness, printJobQueue, printerDeviceQa, productionCompleteReportTriggerRef,
    productionDailyReportTriggerRef, productionExceptionAffectsDelivery,
    productionExceptionDisabled, productionExceptionLossQty, productionExceptionRemark,
    productionExceptionResolutionCode, productionExceptionResolutionConfirmation,
    productionExceptionResolutionConfirmationRef, productionExceptionResolutionDisabled,
    productionExceptionResolutionNote, productionExceptionResolutionTerminal,
    productionExceptionResolutionTitle, productionExceptionResolutionTriggerRef,
    productionExceptionTitle, productionExceptionType, productionReportConfirmation,
    productionReportConfirmationRef, publishScheduleDisabled, publishScheduleTitle,
    reportDailyDisabled, reportDailyTitle, reportDisabled, reportExceptionQty,
    reportMachineCount, reportQualifiedQty, reportTitle, requestPackingCompletion,
    requestProductionExceptionResolutionConfirmation, requestProductionReportConfirmation,
    requestScheduleAction, returnToPackingCompletionEdit,
    returnToProductionExceptionResolutionEdit, returnToProductionReportEdit,
    scheduleActionConfirmation, scheduleActionSubmitting, scheduleDecision,
    scheduleDecisionPayload, scheduleDirectAllowed, onScheduleEvidenceReady: scheduleEvidence.onReadinessChange, selectedFinishedGoodsPhoto,
    selectedPackingTask, selectedProductionLine, selectedProductionMachineId,
    selectedPublishedScheduleId, selectedProductionIsCustomSpecial, setScheduleDecision, submitProductionException,
    updatePackingInput, updateReportInput, visibleSourceDetail,
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
      <ProductionPackingDetailPane runtime={detailPaneRuntime} />
      </section>
    </section>
    <ProductionScheduleActionConfirmationDialog
      buildProductionTaskId={buildProductionTaskId}
      confirmation={scheduleActionConfirmation}
      currentUser={currentUser}
      dialogRef={scheduleActionDialogRef}
      onReturnToEdit={returnToScheduleActionEdit}
      onSubmit={submitScheduleAction}
      error={scheduleError}
      submitting={scheduleActionSubmitting}
    />
    </>
  );
}

function createScheduleDecision() {
  return {decisionChannel:"wechat", decidedAt:new Date().toISOString(), decisionContent:{summary:""}, authorizationBasis:"", evidenceDraftId:"", evidenceAttachmentIds:[]};
}
