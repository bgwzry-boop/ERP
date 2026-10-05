import { submitInboundAction } from "./submitInbound.js";
import { useState } from "react";
import { flushSync } from "react-dom";
import {
  buildOcrLineReviewDraft,
  createRawMaterialDeliveryNoteCaptureId,
  findRawMaterialProductionTaskCandidate,
  inferDeliveryNoteMimeType,
  isSupportedDeliveryNoteFile,
  scrollRawMaterialMobileToTop,
} from "./InboundDetail.jsx";
import { precheckRawMaterialSupplierStatementWorkbook } from "../../domain/rawMaterialSupplierStatementImport.js";
import { prepareRawMaterialDeliveryNoteFile } from "../../services/rawMaterialDeliveryNoteImageClient.js";
import { buildRawMaterialStockLookup, evaluateRawMaterialOrderSupport } from "../../../shared/rawMaterialInventorySupport.js";
import {
  buildRawMaterialInboundMetrics,
  canPrintRawMaterialLabels,
  canReviewRawMaterialInbound,
  filterRawMaterialInboundsByKeyword,
  filterRawMaterialInboundsByTab,
  formatSupplierPayableAmount,
} from "../../domain/rawMaterialInboundListState.js";
import {
  RAW_MATERIAL_INBOUND_TABS,
  selectRawMaterialInboundMetrics,
} from "./RawMaterialInboundWorkbench.jsx";

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
  onAction,
  onDeliveryNoteRecognize,
  onStatementReviewDraftCreate,
  onStatementReviewConfirm,
  onStatementConfirm,
  onPayableDraftGenerate,
  onPaymentConfirm,
  printerDeviceQa = {},
  firstReleaseMode = false,
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
  const [deliveryNotePreviewByInboundId, setDeliveryNotePreviewByInboundId] = useState({});
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [mobileStage, setMobileStage] = useState("home");
  const [mobileMessage, setMobileMessage] = useState(null);
  const [mobileRecordSnapshot, setMobileRecordSnapshot] = useState(null);
  const [ocrReviewSubmitting, setOcrReviewSubmitting] = useState(false);
  const [ocrReviewSubmitError, setOcrReviewSubmitError] = useState("");
  const [ocrReviewDraft, setOcrReviewDraft] = useState({});
  const [ocrLineReviewDraft, setOcrLineReviewDraft] = useState({});
  const [labelVerification, setLabelVerification] = useState(null);
  const [issueSelection, setIssueSelection] = useState(null);
  const [printSheetInbound, setPrintSheetInbound] = useState(null);
  const [desktopView, setDesktopView] = useState("卷料库存");
  const records = filterRawMaterialInboundsByTab(inbounds, activeTab);
  const visibleRecords = filterRawMaterialInboundsByKeyword(records, keyword);
  const selected = visibleRecords.find((item) => item.id === selectedId) ?? visibleRecords[0] ?? null;
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
  const metrics = selectRawMaterialInboundMetrics(buildRawMaterialInboundMetrics(inbounds), activeTab);
  const mobileOcrReviewActive = selected?.ocrProvider === "tencent_cloud_table_v3" && canReviewRawMaterialInbound(selected);
  const mobileOcrReviewOpen = mobileDetailOpen && mobileOcrReviewActive;
  const mobileSelected = mobileRecordSnapshot?.id === selected?.id ? mobileRecordSnapshot : selected;

  function prepareOcrReviewDraft(inbound) {
    setOcrReviewSubmitError("");
    setOcrReviewDraft(
      Object.fromEntries((inbound?.ocrReviewFields ?? []).map((field) => [field.key, field.value ?? field.recognizedValue ?? ""])),
    );
    setOcrLineReviewDraft(
      Object.fromEntries((inbound?.ocrLines ?? []).map((line) => [line.lineId, buildOcrLineReviewDraft(line)])),
    );
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

  async function handleDeliveryNotePageSelect(event) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setDeliveryNoteOcrError("");
    setDeliveryNoteOcrProgress("");
    setDeliveryNoteOcrResult("");
    if (deliveryNoteCapturePages.length + files.length > 4) {
      setDeliveryNoteOcrError("同一张送货单最多添加 4 页，请删除多余页面后重试。");
      return;
    }
    setDeliveryNoteOcrLoading(true);
    try {
      const captureId = deliveryNoteCapturePages[0]?.captureId || createRawMaterialDeliveryNoteCaptureId();
      const preparedPages = [];
      for (const [fileIndex, file] of files.entries()) {
        setDeliveryNoteOcrProgress(`正在准备第 ${deliveryNoteCapturePages.length + fileIndex + 1} 页预览…`);
        const mimeType = file.type || inferDeliveryNoteMimeType(file.name);
        if (!isSupportedDeliveryNoteFile(mimeType)) throw new Error("只支持 PNG、JPG、JPEG、BMP 图片或 PDF。");
        const prepared = await prepareRawMaterialDeliveryNoteFile(file, { mimeType });
        preparedPages.push({
          fileName: file.name,
          mimeType: prepared.mimeType,
          fileSize: prepared.fileSize,
          contentDataUrl: prepared.contentDataUrl,
          sourceMimeType: prepared.sourceMimeType,
          sourceFileSize: prepared.sourceFileSize,
          sourceContentDataUrl: prepared.sourceContentDataUrl,
          sourceFile: prepared.sourceFile,
          captureId,
          sourceNormalizedForOcr: prepared.normalized,
        });
      }
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
    setDeliveryNoteOcrError("");
    setDeliveryNoteOcrProgress(`正在保存第 1/${preparedPages.length} 页原图…`);
    setDeliveryNoteOcrResult("");
    setDeliveryNoteOcrLoading(true);
    try {
      const firstPage = preparedPages[0];
      const inbound = await onDeliveryNoteRecognize?.({
        ...firstPage,
        pages: preparedPages,
        onProgress: (progress) => setDeliveryNoteOcrProgress(progress?.message || "正在识别送货单…"),
      });
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
      setMobileRecordSnapshot(inbound);
      prepareOcrReviewDraft(inbound);
      setMobileStage("review");
      setMobileMessage(null);
      setMobileDetailOpen(true);
      scrollRawMaterialMobileToTop();
      setDeliveryNoteOcrResult(`识别成功：${inbound.id} · ${inbound.ocrStatus || "等待人工复核"}`);
    } catch (error) {
      setDeliveryNoteOcrError(error?.message || "送货单文件读取失败，请重新选择。");
    } finally {
      setDeliveryNoteOcrProgress("");
      setDeliveryNoteOcrLoading(false);
    }
  }

  function handleDeliveryNotePagesClear() {
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
      const captureId = createRawMaterialDeliveryNoteCaptureId();
      const preparedPages = [];
      for (const file of files.slice(0, 4)) {
        const mimeType = file.type || inferDeliveryNoteMimeType(file.name);
        if (!isSupportedDeliveryNoteFile(mimeType)) throw new Error("只支持 PNG、JPG、JPEG、BMP 图片或 PDF。");
        const prepared = await prepareRawMaterialDeliveryNoteFile(file, { mimeType });
        preparedPages.push({
          fileName: file.name,
          mimeType: prepared.mimeType,
          fileSize: prepared.fileSize,
          contentDataUrl: prepared.contentDataUrl,
          sourceMimeType: prepared.sourceMimeType,
          sourceFileSize: prepared.sourceFileSize,
          sourceContentDataUrl: prepared.sourceContentDataUrl,
          sourceFile: prepared.sourceFile,
          captureId,
          sourceNormalizedForOcr: prepared.normalized,
        });
      }
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
      const exclusionsByLineId = new Map();
      for (const exclusion of excludedRolls) {
        const current = exclusionsByLineId.get(exclusion.lineId) ?? [];
        current.push(exclusion);
        exclusionsByLineId.set(exclusion.lineId, current);
      }
      const isSupplierReturn = selected.documentDirection === "supplier_return";
      const updatedInbound = await submitInboundAction(onAction, selected, "复核送货单", {
        reviewFields: ocrReviewDraft,
        lineReviews: (selected.ocrLines ?? []).map((line) => {
          const exclusions = exclusionsByLineId.get(line.lineId) ?? [];
          return {
            lineId: line.lineId,
            values: ocrLineReviewDraft[line.lineId] ?? buildOcrLineReviewDraft(line),
            excludedRollIndices: exclusions.map((entry) => entry.lineRollIndex),
            exclusionReason: exclusions[0]?.reason ?? "",
          };
        }),
        reason: `办公室对照原始${isSupplierReturn ? "退货单" : "送货单"}人工核对并确认腾讯云 OCR 字段。`,
        note: isSupplierReturn
          ? "退货 OCR 字段已人工复核；不生成入库卷码、标签或可用库存，金额作为负数厂家对账依据。"
          : "OCR 字段已人工复核；仍需打印、实物贴标和逐卷人工核对后才能形成可用库存。",
      });
      if (!updatedInbound?.id) {
        setOcrReviewSubmitError(`${isSupplierReturn ? "退货单" : "送货单"}没有保存到服务器。当前填写内容仍保留，请稍后重试；如果持续失败，请联系管理员，不要重复拍单。`);
        return;
      }
      setMobileRecordSnapshot(updatedInbound);
      setMobileStage(isSupplierReturn ? "return-complete" : "print");
      setMobileMessage(null);
      setMobileDetailOpen(false);
      scrollRawMaterialMobileToTop();
      return updatedInbound;
    } finally {
      setOcrReviewSubmitting(false);
    }
  }

  async function handlePrintLabels() {
    const activeInbound = mobileSelected ?? selected;
    if (!activeInbound || printState.disabled || !canPrintRawMaterialLabels(activeInbound)) return null;
    flushSync(() => setPrintSheetInbound(activeInbound));
    document.body.classList.add("raw-material-label-printing");
    try {
      window.print();
    } finally {
      document.body.classList.remove("raw-material-label-printing");
    }
    if (!window.confirm(`请确认 ${activeInbound.rolls?.filter((roll) => roll.inventoryStatus !== "可用").length || 0} 张卷标已从打印机正常输出。\n如果取消或打印失败，请点“取消”，系统不会标记为已打印。`)) {
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
    const result = await submitInboundAction(onAction, activeInbound, "打印卷标");
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

  async function handleReprintLabel(roll) {
    if (!selected || !roll || printState.disabled) return null;
    flushSync(() => setPrintSheetInbound({ ...selected, rolls: [roll] }));
    document.body.classList.add("raw-material-label-printing");
    try {
      window.print();
    } finally {
      document.body.classList.remove("raw-material-label-printing");
    }
    if (!window.confirm(`请确认卷标 ${roll.id} 已从打印机正常输出。\n如果取消或打印失败，请点“取消”，系统不会记录本次重打。`)) {
      setPrintSheetInbound(null);
      return null;
    }
    const result = await submitInboundAction(onAction, selected, "重打卷标", { rollId: roll.id, reason: "异常卷重新打印标签。" });
    if (result) setPrintSheetInbound(null);
    return result ?? null;
  }

  async function handleMobileAttach(options) {
    const activeInbound = mobileSelected ?? selected;
    if (!activeInbound?.id) return null;
    const result = await submitInboundAction(onAction, activeInbound, "确认贴标入库", options);
    if (!result?.id) return null;
    setMobileRecordSnapshot(result);
    const rolls = result.rolls ?? [];
    const pendingCount = rolls.filter((roll) => roll.labelStatus === "已打印待贴标").length;
    const mismatchCount = rolls.filter((roll) => roll.labelStatus === "标签或实物不符/待确认").length;
    const availableCount = rolls.filter((roll) => roll.inventoryStatus === "可用").length;
    if (pendingCount === 0 && rolls.length > 0) {
      setMobileStage(mismatchCount > 0 ? "receive-partial" : availableCount === rolls.length ? "receive-complete" : "attach");
      scrollRawMaterialMobileToTop();
    }
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

  function handleConfirmSupplierPayment(review) {
    const payableAmount = Number(review?.supplierPayableDraft?.payableAmount);
    if (!Number.isFinite(payableAmount) || payableAmount <= 0) return;
    const supplierName = review?.supplierName || "当前供应商";
    const payableId = review?.supplierPayableId || "应付草稿待确认";
    const confirmed = window.confirm(
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
    activeTab,
    attachState,
    authState,
    canViewCost,
    changeTab,
    consumptionState,
    costConfirmState,
    costDraftState,
    currentUser,
    deliveryNoteCapturePages,
    deliveryNoteOcrError,
    deliveryNoteOcrLoading,
    deliveryNoteOcrProgress,
    deliveryNoteOcrResult,
    deliveryNotePreviewByInboundId,
    desktopView,
    detailTab,
    exceptionState,
    firstReleaseMode,
    handleConfirmSupplierPayment,
    handleConfirmSupplierStatement,
    handleConfirmSupplierStatementReview,
    handleDeliveryNotePageRemove,
    handleDeliveryNotePageSelect,
    handleDeliveryNotePagesClear,
    handleDeliveryNoteRecognize,
    handleDesktopDeliveryNoteRecognize,
    handleGenerateSupplierPayableDraft,
    handleMobileAttach,
    handleMobileStageChange,
    handleOcrReviewConfirm,
    handleOpenRollSource,
    handlePrintLabels,
    handleReprintLabel,
    handleSaveSupplierStatementReviewDraft,
    handleSelectInbound,
    handleSupplierStatementImport,
    inbounds,
    issueSelection,
    issueState,
    keyword,
    labelVerification,
    leftoverReviewState,
    leftoverState,
    lossCalibrationState,
    marginReviewState,
    marginSnapshotState,
    meta,
    metrics,
    mobileMessage,
    mobileOcrReviewActive,
    mobileOcrReviewOpen,
    mobileSelected,
    mobileStage,
    money,
    ocrLineReviewDraft,
    ocrReviewDraft,
    ocrReviewSubmitError,
    ocrReviewSubmitting,
    onAction,
    payableState,
    paymentState,
    printSheetInbound,
    printState,
    printerDeviceQa,
    productionTasks,
    records,
    reviewState,
    selected,
    selectedOrderSupport,
    selectedStock,
    selectedTaskCandidate,
    setDesktopView,
    setDetailTab,
    setIssueSelection,
    setKeyword,
    setLabelVerification,
    setOcrLineReviewDraft,
    setOcrReviewDraft,
    statementImport,
    statementImportLoading,
    statementReviewMeta,
    statementReviewSaving,
    statementReviews,
    visibleRecords
  };
}
