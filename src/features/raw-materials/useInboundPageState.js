import { useRawMaterialMeasurement } from "./RawMaterialMeasurementDialog.jsx";
import { canApplySupplierColorToReview } from "./supplierColorReviewScope.js";
import { submitInboundAction } from "./submitInbound.js";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { precheckRawMaterialSupplierStatementWorkbook } from "../../domain/rawMaterialSupplierStatementImport.js";
import { prepareRawMaterialDeliveryNotePages } from "../../services/rawMaterialDeliveryNoteImageClient.js";
import { buildRawMaterialStockLookup, evaluateRawMaterialOrderSupport } from "../../../shared/rawMaterialInventorySupport.js";
import { normalizeRawMaterialSupplierColor } from "../../../shared/rawMaterialFactoryColors.js";
import { buildRawMaterialInboundMetrics, canPrintRawMaterialLabels, canReviewRawMaterialInbound, filterRawMaterialInboundsByKeyword, filterRawMaterialInboundsByTab, formatSupplierPayableAmount } from "../../domain/rawMaterialInboundListState.js";
import { RAW_MATERIAL_INBOUND_TABS, selectRawMaterialInboundMetrics } from "./RawMaterialInboundWorkbench.jsx";
import { listRawMaterialCaptureSupplierOptions } from "../../../shared/rawMaterialSupplierProfiles.js";
import { buildOcrLineReviewDraft } from "./rawMaterialInboundOcrDraft.js";
import { findRawMaterialProductionTaskCandidate } from "./rawMaterialInboundWorkflow.js";
import { officeReviewFieldsForSubmit, officeReviewSubmitBlocker } from "../../domain/officeRawMaterialInboundFlow.js";
import { assertRawMaterialDeliveryNotePageCapacity, buildRawMaterialOcrReviewAction, getRawMaterialOcrReviewSaveFailureMessage, prepareRawMaterialCapturePages, resolveRawMaterialAttachStage, resolveRawMaterialOcrReviewCompletion } from "./rawMaterialInboundPageActions.js";
import { confirmInApp } from "../../shared/ui/confirmDialog.js";


export function useInboundPageState({
  authState,
  currentUser,
  inbounds = [],
  meta = {},
  productionTasks = [],
  statementReviews = [],
  statementReviewMeta = {},
  selectedId,
  setSelectedId,
  onAction: serverAction,
  onDeliveryNoteRecognize,
  onStatementReviewDraftCreate,
  onStatementReviewConfirm,
  onStatementConfirm,
  onPayableDraftGenerate,
  onPaymentConfirm,
  printerDeviceQa = {},
  firstReleaseMode = false,
  initialDesktopView = "卷料库存",
  authoritativeSelectedId = false,
  helpers = {},
}) {
  const { getUiActionState = () => ({ disabled: false, title: "" }), money = (value) => `¥${value}` } = helpers;
  const [activeTab, setActiveTab] = useState(RAW_MATERIAL_INBOUND_TABS[0]);
  const [detailTab, setDetailTab] = useState("入库标签");
  const [keyword, setKeyword] = useState("");
  const [statementImport, setStatementImport] = useState(null);
  const [statementImportLoading, setStatementImportLoading] = useState(false);
  const [statementReviewSaving, setStatementReviewSaving] = useState(false);
  const [deliveryNoteOcrLoading, setDeliveryNoteOcrLoading] = useState(false);
  const [deliveryNoteOcrError, setDeliveryNoteOcrError] = useState("");
  const [deliveryNoteOcrProgress, setDeliveryNoteOcrProgress] = useState("");
  const [deliveryNoteOcrResult, setDeliveryNoteOcrResult] = useState("");
  const [deliveryNoteCapturePages, setDeliveryNoteCapturePages] = useState([]);
  const [deliveryNoteDirectionHint, setDeliveryNoteDirectionHint] = useState("supplier_delivery");
  const [deliveryNoteSupplierHint, setDeliveryNoteSupplierHint] = useState("");
  const [deliveryNotePreviewByInboundId, setDeliveryNotePreviewByInboundId] = useState({});
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [mobileStage, setMobileStage] = useState("home");
  const [mobileMessage, setMobileMessage] = useState(null);
  const [mobileRecordSnapshot, setMobileRecordSnapshot] = useState(null);
  const [ocrReviewSubmitting, setOcrReviewSubmitting] = useState(false);
  const [ocrDraftDiscarding, setOcrDraftDiscarding] = useState(false);
  const [ocrDirectionCorrecting, setOcrDirectionCorrecting] = useState(false);
  const [ocrReviewSubmitError, setOcrReviewSubmitError] = useState("");
  const [ocrReviewDraft, setOcrReviewDraft] = useState({});
  const [ocrLineReviewDraft, setOcrLineReviewDraft] = useState({});
  const [labelVerification, setLabelVerification] = useState(null);
  const [issueSelection, setIssueSelection] = useState(null);
  const [printSheetInbound, setPrintSheetInbound] = useState(null);
  const [desktopView, setDesktopView] = useState(initialDesktopView);
  const [colorMappingOpen, setColorMappingOpen] = useState(false);
  const [colorMappingContext, setColorMappingContext] = useState(null);
  const deliveryNoteOcrAbortRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      deliveryNoteOcrAbortRef.current?.abort();
    };
  }, []);
  const deliveryNoteSupplierOptions = Array.from(new Set(
    [...listRawMaterialCaptureSupplierOptions(), ...inbounds.map((item) => String(item?.supplierName || "").trim()).filter(Boolean)],
  )).sort((left, right) => left.localeCompare(right, "zh-CN"));
  const records = filterRawMaterialInboundsByTab(inbounds, activeTab);
  const visibleRecords = filterRawMaterialInboundsByKeyword(records, keyword);
  const selected = authoritativeSelectedId || mobileStage !== "home" || mobileDetailOpen
    ? inbounds.find((item) => item.id === selectedId && item.status !== "已作废") ?? null
    : visibleRecords.find((item) => item.id === selectedId) ?? visibleRecords[0] ?? null;
  const { handleMeasuredAction: onAction, measurementDialog } = useRawMaterialMeasurement({
    inbounds, selectedId: selected?.id, scope: JSON.stringify([currentUser?.userId, authState?.session?.accessToken, authState?.permissions?.actionPermissions]),
    getUiActionState, onAction: serverAction,
  });
  const selectedStock = selected ? buildRawMaterialStockLookup(inbounds, {
    color: selected.factoryColor || selected.supplierColor,
    widthCm: selected.widthCm,
    gramWeightGsm: selected.gramWeightGsm,
  }) : null;
  const selectedTaskCandidate = selected ? findRawMaterialProductionTaskCandidate(selected, productionTasks) : null;
  const selectedOrderSupport = selectedTaskCandidate
    ? evaluateRawMaterialOrderSupport({ inbounds, order: selectedTaskCandidate })
    : null;
  const costState = getUiActionState("rawMaterial", "查看成本");
  const canViewCost = !costState.disabled;
  const reviewState = getUiActionState("rawMaterial", "复核送货单");
  const voidDraftState = getUiActionState("rawMaterial", "作废误录草稿");
  const printState = getUiActionState("rawMaterial", "打印卷标");
  const attachState = getUiActionState("rawMaterial", "确认贴标入库");
  const issueState = getUiActionState("rawMaterial", "机边领料");
  const consumptionState = getUiActionState("rawMaterial", "确认消耗");
  const leftoverState = getUiActionState("rawMaterial", "余料退回");
  const leftoverReviewState = getUiActionState("rawMaterial", "复核余料可用");
  const exceptionState = getUiActionState("rawMaterial", "标记异常");
  const costDraftState = getUiActionState("rawMaterial", "生成成本草稿");
  const costConfirmState = getUiActionState("rawMaterial", "确认成本草稿");
  const lossCalibrationState = getUiActionState("rawMaterial", "校准损耗");
  const marginSnapshotState = getUiActionState("rawMaterial", "生成毛利快照");
  const marginReviewState = getUiActionState("rawMaterial", "复核毛利快照");
  const payableState = getUiActionState("rawMaterial", "生成应付");
  const paymentState = getUiActionState("rawMaterial", "确认付款");
  const colorMappingState = getUiActionState("rawMaterial", "维护厂家颜色");
  const metrics = selectRawMaterialInboundMetrics(buildRawMaterialInboundMetrics(inbounds), activeTab);
  const mobileOcrReviewActive = selected?.ocrProvider === "tencent_cloud_table_v3" && canReviewRawMaterialInbound(selected);
  const mobileOcrReviewOpen = mobileDetailOpen && mobileOcrReviewActive;
  const mobileSelected = mobileRecordSnapshot?.id === selected?.id ? mobileRecordSnapshot : selected;

  useEffect(() => {
    if (selected?.id) prepareOcrReviewDraft(selected);
  }, [selected?.id]);

  function prepareOcrReviewDraft(inbound) {
    setOcrReviewSubmitError("");
    setOcrReviewDraft(
      Object.fromEntries((inbound?.ocrReviewFields ?? []).map((field) => [field.key, field.value ?? field.recognizedValue ?? ""])),
    );
    setOcrLineReviewDraft(
      Object.fromEntries((inbound?.ocrLines ?? []).map((line) => [line.lineId, buildOcrLineReviewDraft(line, inbound.documentDirection)])),
    );
  }

  function openSupplierColorMapping(context = null) {
    setColorMappingContext(context ? { ...context, inboundId: selected?.id } : null);
    setColorMappingOpen(true);
  }

  function closeSupplierColorMapping() {
    setColorMappingOpen(false);
    setColorMappingContext(null);
  }

  function applySavedSupplierColorMapping(mapping = {}) {
    const factoryColor = String(mapping.factoryColor || "").trim();
    const supplierColor = normalizeRawMaterialSupplierColor(colorMappingContext?.supplierColor);
    if (!canApplySupplierColorToReview(mapping, colorMappingContext, selected) || !factoryColor || !supplierColor) {
      closeSupplierColorMapping();
      return;
    }
    setOcrLineReviewDraft((current) => Object.fromEntries(Object.entries(current).map(([lineId, draft]) => [
      lineId,
      normalizeRawMaterialSupplierColor(draft?.supplierColor) === supplierColor
        ? { ...draft, factoryColor }
        : draft,
    ])));
    setOcrReviewDraft((current) => ({
      ...current,
      factoryColor: String(current.factoryColor || "").trim() || factoryColor,
    }));
    closeSupplierColorMapping();
  }

  function handleSelectInbound(inboundId) {
    setSelectedId(inboundId);
    setMobileDetailOpen(false);
    const inbound = inbounds.find((item) => item.id === inboundId);
    setMobileRecordSnapshot(inbound ?? null);
    prepareOcrReviewDraft(inbound);
  }

  function handleOpenRollSource(roll) {
    if (!roll?.inboundId) return;
    setActiveTab("入库单");
    setKeyword("");
    setDetailTab("入库标签");
    handleSelectInbound(roll.inboundId);
    setDesktopView("收货录入");
  }

  function handleMobileStageChange(stage, inboundId) {
    const inbound = (inboundId ? inbounds.find((item) => item.id === inboundId) : null)
      ?? (mobileRecordSnapshot?.id === selected?.id ? mobileRecordSnapshot : selected);
    if (inbound?.id) {
      setSelectedId(inbound.id);
      setMobileRecordSnapshot(inbound);
      prepareOcrReviewDraft(inbound);
    }
    setMobileMessage(null);
    setMobileStage(stage);
    setMobileDetailOpen(stage === "review" && Boolean(inbound?.id));
    if (stage === "review") setDetailTab("入库标签");
    scrollRawMaterialMobileToTop();
  }

  async function handleDiscardMobileOcrDraft() {
    if (!selected?.id || selected.status !== "已识别待复核") {
      return { ok: false, message: "当前草稿状态已经变化，请返回首页刷新后再处理。" };
    }
    if (voidDraftState.disabled) {
      return { ok: false, message: voidDraftState.title || "当前账号无权放弃这张识别草稿。" };
    }
    setOcrDraftDiscarding(true);
    try {
      const voidedInbound = await onAction?.("作废误录草稿", selected.id, {
        reason: "手机拍单核对时发现颜色或明细识别不正确，放弃当前草稿并重新拍摄下一张单据。",
      });
      if (!voidedInbound?.id || voidedInbound.status !== "已作废") {
        return { ok: false, message: "后台没有确认放弃这张草稿。请重试；当前草稿仍保留，不会误删。" };
      }
      setMobileRecordSnapshot(null);
      setMobileDetailOpen(false);
      setMobileStage("home");
      setMobileMessage({
        tone: "success",
        title: "上一张已放弃",
        body: "它不会再出现在正常收货列表；原图和作废记录仅用于审计。现在可以拍下一张单据。",
      });
      setOcrReviewDraft({});
      setOcrLineReviewDraft({});
      scrollRawMaterialMobileToTop();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error?.message || "放弃草稿失败，请检查网络后重试。" };
    } finally {
      setOcrDraftDiscarding(false);
    }
  }

  async function handleCorrectMobileOcrToSupplierReturn() {
    if (!selected?.id || selected.status !== "已识别待复核") return null;
    if (reviewState.disabled) return null;
    setOcrDirectionCorrecting(true);
    setOcrReviewSubmitError("");
    try {
      const supplierName = String(selected.supplierName || "").trim();
      const correctedInbound = await onAction?.("纠正为供应商退货", selected.id, {
        documentDirectionHint: "supplier_return",
        supplierNameHint: /待确认|未知/u.test(supplierName) ? "" : supplierName,
        reason: "核对原图发现该 OCR 草稿实际为供应商退货单，使用已保存的 OCR 表格按退货方向重新解析。",
      });
      if (!correctedInbound?.id || correctedInbound.documentDirection !== "supplier_return") return null;
      setMobileRecordSnapshot(correctedInbound);
      prepareOcrReviewDraft(correctedInbound);
      setMobileStage("review");
      setMobileDetailOpen(true);
      scrollRawMaterialMobileToTop();
      return correctedInbound;
    } finally {
      setOcrDirectionCorrecting(false);
    }
  }

  async function handleDeliveryNotePageSelect(event) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setDeliveryNoteOcrError("");
    setDeliveryNoteOcrProgress("");
    setDeliveryNoteOcrResult("");
    try {
      assertRawMaterialDeliveryNotePageCapacity(deliveryNoteCapturePages.length, files.length);
    } catch (error) {
      setDeliveryNoteOcrError(error.message);
      return;
    }
    setDeliveryNoteOcrLoading(true);
    try {
      const preparedPages = await prepareRawMaterialCapturePages({
        files,
        existingPages: deliveryNoteCapturePages,
        prepareFilePages: prepareRawMaterialDeliveryNotePages,
        onProgress: setDeliveryNoteOcrProgress,
      });
      setDeliveryNoteCapturePages((current) => [...current, ...preparedPages]);
    } catch (error) {
      setDeliveryNoteOcrError(error?.message || "送货单文件读取失败，请重新选择。");
    } finally {
      setDeliveryNoteOcrProgress("");
      setDeliveryNoteOcrLoading(false);
    }
  }

  async function handleDeliveryNoteRecognize(preparedPages = deliveryNoteCapturePages) {
    if (!preparedPages.length) return;
    if (deliveryNoteDirectionHint === "supplier_return" && !deliveryNoteSupplierHint) {
      setDeliveryNoteOcrError("退货单请先选择退给哪一家供应商，再开始识别。");
      return;
    }
    deliveryNoteOcrAbortRef.current?.abort();
    const controller = new AbortController();
    deliveryNoteOcrAbortRef.current = controller;
    setDeliveryNoteOcrError("");
    setDeliveryNoteOcrProgress(`正在保存第 1/${preparedPages.length} 页原图…`);
    setDeliveryNoteOcrResult("");
    setDeliveryNoteOcrLoading(true);
    try {
      const firstPage = preparedPages[0];
      const inbound = await onDeliveryNoteRecognize?.({
        ...firstPage,
        documentDirectionHint: deliveryNoteDirectionHint,
        supplierNameHint: deliveryNoteSupplierHint,
        pages: preparedPages,
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted && mountedRef.current) {
            setDeliveryNoteOcrProgress(progress?.message || "正在识别送货单…");
          }
        },
      });
      if (controller.signal.aborted || !mountedRef.current) return;
      if (!inbound?.id) {
        setDeliveryNoteOcrError("后台没有生成识别草稿，请查看页面提示后重试。");
        return;
      }
      setActiveTab("入库单");
      setKeyword("");
      setDetailTab("入库标签");
      setSelectedId(inbound.id);
      setDeliveryNotePreviewByInboundId((current) => ({
        ...current,
        [inbound.id]: preparedPages.map((page) => page.sourceContentDataUrl || page.contentDataUrl),
      }));
      setDeliveryNoteCapturePages([]);
      setDeliveryNoteDirectionHint("supplier_delivery");
      setDeliveryNoteSupplierHint("");
      setMobileRecordSnapshot(inbound);
      prepareOcrReviewDraft(inbound);
      setMobileStage("review");
      setMobileMessage(null);
      setMobileDetailOpen(true);
      scrollRawMaterialMobileToTop();
      setDeliveryNoteOcrResult(`识别成功：${inbound.id} · ${inbound.ocrStatus || "等待人工复核"}`);
    } catch (error) {
      if (!controller.signal.aborted && mountedRef.current) {
        setDeliveryNoteOcrError(error?.message || "送货单文件读取失败，请重新选择。");
      }
    } finally {
      if (deliveryNoteOcrAbortRef.current === controller && mountedRef.current) {
        deliveryNoteOcrAbortRef.current = null;
        setDeliveryNoteOcrProgress("");
        setDeliveryNoteOcrLoading(false);
      }
    }
  }

  function handleDeliveryNotePagesClear() {
    deliveryNoteOcrAbortRef.current?.abort();
    deliveryNoteOcrAbortRef.current = null;
    setDeliveryNoteCapturePages([]);
    setDeliveryNoteOcrError("");
    setDeliveryNoteOcrProgress("");
    setDeliveryNoteOcrResult("");
  }

  function handleDeliveryNotePageRemove(sourcePageIndex) {
    setDeliveryNoteCapturePages((current) => current.filter((_, index) => index !== sourcePageIndex));
    setDeliveryNoteOcrError("");
    setDeliveryNoteOcrProgress("");
    setDeliveryNoteOcrResult("");
  }

  async function handleDesktopDeliveryNoteRecognize(event) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setDeliveryNoteOcrLoading(true);
    setDeliveryNoteOcrError("");
    try {
      const preparedPages = await prepareRawMaterialCapturePages({
        files,
        prepareFilePages: prepareRawMaterialDeliveryNotePages,
      });
      await handleDeliveryNoteRecognize(preparedPages);
    } catch (error) {
      setDeliveryNoteOcrError(error?.message || "送货单文件读取失败，请重新选择。");
      setDeliveryNoteOcrLoading(false);
    }
  }

  async function handleOcrReviewConfirm({ excludedRolls = [] } = {}) {
    if (!selected || !canReviewRawMaterialInbound(selected) || ocrReviewSubmitting) return;
    setOcrReviewSubmitError("");
    setOcrReviewSubmitting(true);
    try {
      const reviewAction = buildRawMaterialOcrReviewAction({
        selected,
        reviewFields: ocrReviewDraft,
        lineReviewDraft: ocrLineReviewDraft,
        excludedRolls,
        buildLineReviewDraft: buildOcrLineReviewDraft,
      });
      const { isSupplierReturn } = reviewAction;
      const updatedInbound = await submitInboundAction(onAction, selected, reviewAction.action, reviewAction.payload);
      if (!updatedInbound?.id) {
        setOcrReviewSubmitError(getRawMaterialOcrReviewSaveFailureMessage(isSupplierReturn));
        return;
      }
      let completedInbound = updatedInbound;
      if (!isSupplierReturn) {
        const deferredInbound = await onAction?.("暂缓打印卷标", updatedInbound.id, {
          expectedRevision: updatedInbound.revision,
          reason: "当前试运行阶段略过现场打印；逐卷卷码已经生成，先保存到原料待补标区。",
        });
        if (deferredInbound?.id) completedInbound = deferredInbound;
      }
      const completion = resolveRawMaterialOcrReviewCompletion({ isSupplierReturn, completedInbound });
      setMobileRecordSnapshot(completedInbound);
      setMobileStage(completion.stage);
      setMobileMessage(completion.message);
      setMobileDetailOpen(false);
      scrollRawMaterialMobileToTop();
      return completedInbound;
    } finally {
      setOcrReviewSubmitting(false);
    }
  }

  async function handleOfficeReviewConfirm() {
    if (!selected || !canReviewRawMaterialInbound(selected) || ocrReviewSubmitting) return null;
    setOcrReviewSubmitError("");
    const reviewFields = officeReviewFieldsForSubmit(selected, ocrReviewDraft);
    const blocker = officeReviewSubmitBlocker(selected, reviewFields);
    if (blocker) {
      setOcrReviewSubmitError(blocker);
      return null;
    }
    setOcrReviewSubmitting(true);
    try {
      const reviewAction = buildRawMaterialOcrReviewAction({
        selected,
        reviewFields,
        lineReviewDraft: ocrLineReviewDraft,
        excludedRolls: [],
        buildLineReviewDraft: buildOcrLineReviewDraft,
      });
      if (!reviewAction?.action) return null;
      if (selected.documentDirection !== "supplier_return") {
        reviewAction.payload.note = "OCR 字段已人工复核；请继续打印一卷一标，贴到实物并核对后才进入可用库存。";
      }
      const updatedInbound = await submitInboundAction(onAction, selected, reviewAction.action, reviewAction.payload);
      if (!updatedInbound?.id) return null;
      setOcrReviewSubmitError("");
      return updatedInbound;
    } finally {
      setOcrReviewSubmitting(false);
    }
  }

  async function handleOfficeException(options = {}) {
    if (!selected || exceptionState.disabled || ocrReviewSubmitting) return null;
    setOcrReviewSubmitError("");
    const reason = typeof options?.reason === "string" && options.reason.trim()
      ? options.reason.trim()
      : "办公室核对时标记异常。";
    setOcrReviewSubmitting(true);
    try {
      const updatedInbound = await submitInboundAction(onAction, selected, "标记异常", { reason });
      if (!updatedInbound?.id) return null;
      setOcrReviewSubmitError("");
      return updatedInbound;
    } finally {
      setOcrReviewSubmitting(false);
    }
  }

  async function handlePrintLabels(inboundOverride) {
    // 「这批都对，去打印」passes the freshly reviewed inbound; a click passes an event.
    const activeInbound = inboundOverride?.id && Array.isArray(inboundOverride.rolls) ? inboundOverride : mobileSelected ?? selected;
    if (!activeInbound || printState.disabled || !canPrintRawMaterialLabels(activeInbound)) return null;
    flushSync(() => setPrintSheetInbound(activeInbound));
    document.body.classList.add("raw-material-label-printing");
    try {
      window.print();
    } finally {
      document.body.classList.remove("raw-material-label-printing");
    }
    const labelCount = activeInbound.rolls?.filter((roll) => roll.inventoryStatus !== "可用").length || 0;
    if (!(await confirmInApp({ title: "确认打印结果", message: `请看打印机：${labelCount} 张 76×130 面单都出来了吗？\n没出来就点取消，系统不会记成已打印。`, confirmLabel: "都已打印" }))) {
      setPrintSheetInbound(null);
      setMobileMessage({
        tone: "warning",
        title: "没有确认打印成功",
        body: "系统没有修改卷标状态。请检查打印机、纸张和连接后重新打印。",
      });
      setMobileStage("print-result");
      scrollRawMaterialMobileToTop();
      return null;
    }
    const result = await onAction?.("打印卷标", activeInbound.id);
    setPrintSheetInbound(null);
    if (!result?.id) {
      setMobileMessage({
        tone: "danger",
        title: "后台没有记录打印结果",
        body: "卷标状态没有改变。请检查页面提示后重试，不要直接进入贴标。",
      });
      setMobileStage("print-result");
      scrollRawMaterialMobileToTop();
      return null;
    }
    setMobileRecordSnapshot(result);
    setMobileMessage(null);
    setMobileStage("print-success");
    scrollRawMaterialMobileToTop();
    return result;
  }

  async function handleDeferLabels() {
    const activeInbound = mobileSelected ?? selected;
    if (!activeInbound || activeInbound.status !== "已复核待打印标签" || printState.disabled || !canPrintRawMaterialLabels(activeInbound)) return null;
    const result = await onAction?.("暂缓打印卷标", activeInbound.id, {
      reason: "现场打印设备暂不可用；逐卷卷码已经生成，先保存到原料待补标区。",
    });
    if (!result?.id) {
      setMobileMessage({
        tone: "danger",
        title: "待补标状态没有保存",
        body: "当前单据仍停留在打印步骤，请不要把未贴标卷料当作可用库存。",
      });
      return null;
    }
    setMobileRecordSnapshot(result);
    setMobileMessage(null);
    setMobileStage("label-deferred");
    scrollRawMaterialMobileToTop();
    return result;
  }

  async function handleReprintLabel(roll) {
    if (!selected || !roll || printState.disabled) return null;
    flushSync(() => setPrintSheetInbound({ ...selected, rolls: [roll] }));
    document.body.classList.add("raw-material-label-printing");
    try {
      window.print();
    } finally {
      document.body.classList.remove("raw-material-label-printing");
    }
    if (!(await confirmInApp({ title: "确认打印结果", message: `请确认卷标 ${roll.id} 已从打印机正常输出。\n如果取消或打印失败，请点“取消”，系统不会记录本次重打。`, confirmLabel: "已正常打印" }))) {
      setPrintSheetInbound(null);
      return null;
    }
    const result = await onAction?.("重打卷标", selected.id, { rollId: roll.id, reason: "异常卷重新打印标签。" });
    if (result) setPrintSheetInbound(null);
    return result ?? null;
  }

  async function handleMobileAttach(options) {
    const activeInbound = mobileSelected ?? selected;
    if (!activeInbound?.id) return null;
    const result = await onAction?.("确认贴标入库", activeInbound.id, options);
    if (!result?.id) return null;
    setMobileRecordSnapshot(result);
    const nextStage = resolveRawMaterialAttachStage(result);
    if (nextStage) {
      setMobileStage(nextStage);
      scrollRawMaterialMobileToTop();
    }
    return result;
  }

  async function handleMobileOneClickInbound(options = {}) {
    const activeInbound = mobileSelected ?? selected;
    if (!activeInbound?.id) return null;
    const result = await submitInboundAction(onAction, activeInbound, "本单已贴齐/一键入库", options);
    if (!result?.id) return null;
    setMobileRecordSnapshot(result);
    const rolls = result.rolls ?? [];
    const mismatchCount = rolls.filter((roll) => roll.labelStatus === "标签或实物不符/待确认").length;
    const availableCount = rolls.filter((roll) => roll.inventoryStatus === "可用").length;
    setMobileStage(mismatchCount > 0 || availableCount !== rolls.length ? "receive-partial" : "receive-complete");
    scrollRawMaterialMobileToTop();
    return result;
  }

  function changeTab(tab) {
    setActiveTab(tab);
    setKeyword("");
    setDetailTab(tab === "供应商对账" ? "供应商账" : tab === "机边领料" ? (firstReleaseMode ? "扫码出库" : "领料成本") : "入库标签");
  }

  async function handleSupplierStatementImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setStatementImportLoading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await precheckRawMaterialSupplierStatementWorkbook({
        bytes,
        fileName: file.name,
        supplierName: selected?.supplierName,
        existingInbounds: inbounds,
      });
      setStatementImport(result);
    } catch (error) {
      setStatementImport({
        summary: {
          status: "blocked",
          statusLabel: "无法识别",
          rowCount: 0,
          matchedRowCount: 0,
          candidateRowCount: 0,
          unmatchedRowCount: 0,
          adjustmentCount: 0,
          totalWeightKg: 0,
          totalAmount: 0,
        },
        adapter: { label: "供应商 Excel" },
        fileName: file.name,
        recommendedAction: "Excel 无法读取，请确认是 .xlsx 文件，或先另存后重新上传。",
        rows: [],
        adjustments: [],
        issues: [{
          severity: "error",
          severityLabel: "阻断",
          message: error?.message || String(error),
        }],
      });
    } finally {
      setStatementImportLoading(false);
    }
  }

  async function handleSaveSupplierStatementReviewDraft() {
    if (!statementImport || statementReviewSaving) return;
    setStatementReviewSaving(true);
    try {
      const saved = await onStatementReviewDraftCreate?.(statementImport, {
        supplierName: selected?.supplierName || statementImport.supplierName,
        fileName: statementImport.fileName,
        note: "办公室保存供应商月结 Excel 预检结果，等待人工复核。",
      });
      if (saved?.reviewId) {
        setStatementImport((current) => ({
          ...(current ?? {}),
          savedReviewId: saved.reviewId,
        }));
      }
    } finally {
      setStatementReviewSaving(false);
    }
  }

  function handleConfirmSupplierStatementReview(reviewId, decision) {
    onStatementReviewConfirm?.(reviewId, {
      decision,
      note: "办公室在原材料页标记月结复核草稿状态；不生成应付或付款。",
    });
  }

  function handleConfirmSupplierStatement(reviewId) {
    onStatementConfirm?.(reviewId, {
      note: "办公室确认供应商月结对账一致；只进入待财务付款确认，不直接付款。",
    });
  }

  function handleGenerateSupplierPayableDraft(reviewId) {
    onPayableDraftGenerate?.(reviewId, {
      note: "财务基于已确认供应商月结生成应付草稿；付款仍需另行确认。",
    });
  }

  async function handleConfirmSupplierPayment(review) {
    const payableAmount = Number(review?.supplierPayableDraft?.payableAmount);
    if (!Number.isFinite(payableAmount) || payableAmount <= 0) return;
    const supplierName = review?.supplierName || "当前供应商";
    const payableId = review?.supplierPayableId || "应付草稿待确认";
    const confirmed = await confirmInApp(
      `确认已实际向${supplierName}付款？\n应付单：${payableId}\n付款金额：${formatSupplierPayableAmount(payableAmount, money)}\n确认后将写入付款确认和操作日志；不会影响原材料库存。`,
    );
    if (!confirmed) return;
    onPaymentConfirm?.(review.reviewId, {
      paidAmount: payableAmount,
      paymentMethod: "银行转账",
      note: "财务确认供应商应付草稿已实际付款；只记录付款确认，不写原材料库存。",
    });
  }

  return {
    authState,
    currentUser,
    onAction,
    inbounds,
    meta,
    productionTasks,
    statementReviews,
    statementReviewMeta,
    printerDeviceQa,
    firstReleaseMode,
    money,
    activeTab,
    detailTab,
    setDetailTab,
    keyword,
    setKeyword,
    statementImport,
    statementImportLoading,
    statementReviewSaving,
    deliveryNoteOcrLoading,
    deliveryNoteOcrError,
    deliveryNoteOcrProgress,
    deliveryNoteOcrResult,
    deliveryNoteCapturePages,
    deliveryNoteDirectionHint,
    setDeliveryNoteDirectionHint,
    deliveryNoteSupplierHint,
    setDeliveryNoteSupplierHint,
    deliveryNotePreviewByInboundId,
    mobileStage,
    mobileMessage,
    ocrReviewSubmitting,
    ocrDraftDiscarding,
    ocrDirectionCorrecting,
    ocrReviewSubmitError,
    ocrReviewDraft,
    setOcrReviewDraft,
    ocrLineReviewDraft,
    setOcrLineReviewDraft,
    labelVerification,
    setLabelVerification,
    issueSelection,
    setIssueSelection,
    printSheetInbound,
    desktopView,
    setDesktopView,
    colorMappingOpen,
    colorMappingContext,
    deliveryNoteSupplierOptions,
    records,
    visibleRecords,
    selected,
    selectedStock,
    selectedTaskCandidate,
    selectedOrderSupport,
    canViewCost,
    reviewState,
    voidDraftState,
    printState,
    attachState,
    issueState,
    consumptionState,
    leftoverState,
    leftoverReviewState,
    exceptionState,
    costDraftState,
    costConfirmState,
    lossCalibrationState,
    marginSnapshotState,
    marginReviewState,
    payableState,
    paymentState,
    colorMappingState,
    metrics,
    mobileOcrReviewActive,
    mobileOcrReviewOpen,
    mobileSelected,
    openSupplierColorMapping,
    closeSupplierColorMapping,
    applySavedSupplierColorMapping,
    measurementDialog,
    handleSelectInbound,
    handleOpenRollSource,
    handleMobileStageChange,
    handleDiscardMobileOcrDraft,
    handleCorrectMobileOcrToSupplierReturn,
    handleDeliveryNotePageSelect,
    handleDeliveryNoteRecognize,
    handleDeliveryNotePagesClear,
    handleDeliveryNotePageRemove,
    handleDesktopDeliveryNoteRecognize,
    handleOcrReviewConfirm,
    handleOfficeReviewConfirm,
    handleOfficeException,
    handlePrintLabels,
    handleDeferLabels,
    handleReprintLabel,
    handleMobileAttach,
    handleMobileOneClickInbound,
    changeTab,
    handleSupplierStatementImport,
    handleSaveSupplierStatementReviewDraft,
    handleConfirmSupplierStatementReview,
    handleConfirmSupplierStatement,
    handleGenerateSupplierPayableDraft,
    handleConfirmSupplierPayment
  };
}

function scrollRawMaterialMobileToTop() {
  requestAnimationFrame(() => {
    document.querySelector(".app-shell-mobile-role .content")?.scrollTo({ top: 0, behavior: "auto" });
    window.scrollTo({ top: 0, behavior: "auto" });
  });
}
