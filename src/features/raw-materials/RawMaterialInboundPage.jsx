import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  DataState,
  DetailPane,
  InfoGrid,
  Segmented,
  StatusPill,
  Timeline,
} from "../../shared/ui/operational.jsx";
import { precheckRawMaterialSupplierStatementWorkbook } from "../../domain/rawMaterialSupplierStatementImport.js";
import { prepareRawMaterialDeliveryNotePages } from "../../services/rawMaterialDeliveryNoteImageClient.js";
import {
  buildRawMaterialStockLookup,
  evaluateRawMaterialOrderSupport,
} from "../../../shared/rawMaterialInventorySupport.js";
import {
  buildRawMaterialInboundMetrics,
  canConfirmRawMaterialConsumptionRoll,
  canIssueRawMaterialRoll,
  canPrintRawMaterialLabels,
  canReturnRawMaterialLeftoverRoll,
  canReviewRawMaterialInbound,
  canReviewRawMaterialLeftoverRoll,
  filterRawMaterialInboundsByKeyword,
  filterRawMaterialInboundsByTab,
  formatRawMaterialDeliveryNoteNo,
  formatSupplierPayableAmount,
} from "../../domain/rawMaterialInboundListState.js";
import {
  formatRawMaterialWeight,
  RAW_MATERIAL_DETAIL_TABS,
  RAW_MATERIAL_INBOUND_TABS,
  RawMaterialDetailOverview,
  RawMaterialInboundListPane,
  RawMaterialRollInventoryWorkbench,
  selectRawMaterialInboundMetrics,
} from "./RawMaterialInboundWorkbench.jsx";
import { RawMaterialMobileReceiving } from "./RawMaterialMobileReceiving.jsx";
import { RawMaterialLabelPrintSheet } from "./RawMaterialLabelPrintSheet.jsx";
import { RawMaterialPurchasePanel } from "./RawMaterialPurchasePanel.jsx";
import {
  SupplierStatementImportPreview,
  SupplierStatementReviewList,
} from "./RawMaterialSupplierStatementReview.jsx";
import {
  buildRawMaterialConsumptionOptions,
  buildRawMaterialInboundTimeline,
  buildRawMaterialIssueOptions,
  buildRawMaterialIssueTaskOptions,
  buildRawMaterialLabelVerificationDraft,
  buildRawMaterialLeftoverReturnOptions,
  buildRawMaterialLeftoverReviewOptions,
  buildRawMaterialLossCalibrationOptions,
  buildRawMaterialMarginReviewOptions,
  buildRawMaterialMarginSnapshotOptions,
  buildRawMaterialPartialConsumptionOptions,
  buildRawMaterialPartialIssueOptions,
  canCalibrateRawMaterialLoss,
  canConfirmRawMaterialCostDraft,
  canGenerateRawMaterialCostDraft,
  canGenerateRawMaterialMarginSnapshot,
  canReviewRawMaterialMarginSnapshot,
  findRawMaterialProductionTaskCandidate,
  findRawMaterialProductionTaskOption,
  formatRawMaterialConsumptionRecord,
  formatRawMaterialCost,
  formatRawMaterialCostAllocationConfirmation,
  formatRawMaterialCostAllocationDraft,
  formatRawMaterialCostConfirmationSummary,
  formatRawMaterialCostDraftSummary,
  formatRawMaterialCostLossCalibration,
  formatRawMaterialIssueRecord,
  formatRawMaterialLabelVerification,
  formatRawMaterialLeftoverReturnRecord,
  formatRawMaterialLeftoverReviewRecord,
  formatRawMaterialLossCalibrationSummary,
  formatRawMaterialMarginReportSummary,
  formatRawMaterialMarginSnapshotSummary,
  formatRawMaterialOptionalAttachment,
  formatRawMaterialOrderMarginReport,
  formatRawMaterialOrderMarginSnapshot,
  formatRawMaterialOrderSupport,
  formatRawMaterialSplitRecord,
  formatRawMaterialStructuredSpec,
  formatRawMaterialTaskMatch,
  getRawMaterialRollTone,
} from "./rawMaterialInboundWorkflow.js";

const RawMaterialMobileOcrReview = lazy(() => import("./RawMaterialMobileOcrReview.jsx").then((module) => ({
  default: module.RawMaterialMobileOcrReview,
})));
const RawMaterialSupplierColorMappingDialog = lazy(() => import("./RawMaterialSupplierColorMappingDialog.jsx").then((module) => ({
  default: module.RawMaterialSupplierColorMappingDialog,
})));

const RAW_MATERIAL_FIRST_RELEASE_DETAIL_TABS = ["入库标签", "扫码出库", "供应商账", "记录"];

const OCR_LINE_REVIEW_FIELDS = [
  ["productName", "品名"],
  ["materialType", "材料"],
  ["supplierColor", "供应商颜色"],
  ["factoryColor", "厂内标准色 *"],
  ["spec", "规格 *"],
  ["rollCount", "卷/件数 *"],
  ["totalWeightKg", "行总重 kg"],
  ["unit", "单位 *"],
  ["unitPrice", "单价"],
  ["amount", "金额"],
  ["supplierRollNo", "供应商卷号"],
  ["rollWeightsKg", "分卷重量 kg"],
];

export function RawMaterialInboundPage({
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
  const [deliveryNoteDirectionHint, setDeliveryNoteDirectionHint] = useState("supplier_delivery");
  const [deliveryNoteSupplierHint, setDeliveryNoteSupplierHint] = useState("");
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
  const [colorMappingOpen, setColorMappingOpen] = useState(false);
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
    inbounds.map((item) => String(item?.supplierName || "").trim()).filter(Boolean),
  )).sort((left, right) => left.localeCompare(right, "zh-CN"));
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
        const preparedFilePages = await prepareRawMaterialDeliveryNotePages(file, { mimeType });
        if (deliveryNoteCapturePages.length + preparedPages.length + preparedFilePages.length > 4) {
          throw new Error("同一张送货单最多添加 4 页，请删除多余页面后重试。");
        }
        preparedPages.push(...preparedFilePages.map((prepared, pageOffset) =>
          toDeliveryNoteCapturePage({ prepared, file, captureId, pageOffset })
        ));
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
      const captureId = createRawMaterialDeliveryNoteCaptureId();
      const preparedPages = [];
      for (const file of files.slice(0, 4)) {
        const mimeType = file.type || inferDeliveryNoteMimeType(file.name);
        if (!isSupportedDeliveryNoteFile(mimeType)) throw new Error("只支持 PNG、JPG、JPEG、BMP 图片或 PDF。");
        const preparedFilePages = await prepareRawMaterialDeliveryNotePages(file, { mimeType });
        if (preparedPages.length + preparedFilePages.length > 4) {
          throw new Error("同一张送货单最多添加 4 页，请删除多余页面后重试。");
        }
        preparedPages.push(...preparedFilePages.map((prepared, pageOffset) =>
          toDeliveryNoteCapturePage({ prepared, file, captureId, pageOffset })
        ));
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
      const updatedInbound = await onAction?.("复核送货单", selected.id, {
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
          : "OCR 字段已人工复核；每卷独立卷码生成后先保存为待补标，补打并逐卷贴标核对后才能形成可用库存。",
      });
      if (!updatedInbound?.id) {
        setOcrReviewSubmitError(`${isSupplierReturn ? "退货单" : "送货单"}没有保存到服务器。当前填写内容仍保留，请稍后重试；如果持续失败，请联系管理员，不要重复拍单。`);
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
      setMobileRecordSnapshot(completedInbound);
      setMobileStage(isSupplierReturn ? "return-complete" : completedInbound.status === "已入库待补打标签" ? "label-deferred" : "print");
      if (!isSupplierReturn && completedInbound.status !== "已入库待补打标签") {
        setMobileMessage({
          tone: "warning",
          title: "卷码已生成，但待补标状态没有保存",
          body: "单据仍停留在打印步骤；请点“暂不打印，保存为待补标”，不要把未贴标卷料当作可用库存。",
        });
      } else {
        setMobileMessage(null);
      }
      setMobileDetailOpen(false);
      scrollRawMaterialMobileToTop();
      return completedInbound;
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
    if (!window.confirm(`请确认卷标 ${roll.id} 已从打印机正常输出。\n如果取消或打印失败，请点“取消”，系统不会记录本次重打。`)) {
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

  return (
    <section className={`page-grid split-detail operational-split-workbench raw-material-inbound-page raw-material-workbench ${desktopView === "卷料库存" ? "is-roll-inventory-view" : "is-receiving-view"} ${mobileOcrReviewOpen ? "is-mobile-detail-open" : ""}`}>
      <RawMaterialLabelPrintSheet inbound={printSheetInbound} />
      {colorMappingOpen ? (
        <Suspense fallback={null}>
          <RawMaterialSupplierColorMappingDialog
            authState={authState}
            currentUser={currentUser}
            onClose={() => setColorMappingOpen(false)}
          />
        </Suspense>
      ) : null}
      <RawMaterialMobileReceiving
        attachState={attachState}
        deliveryNoteOcrError={deliveryNoteOcrError}
        deliveryNoteOcrLoading={deliveryNoteOcrLoading}
        deliveryNoteOcrProgress={deliveryNoteOcrProgress}
        deliveryNoteOcrResult={deliveryNoteOcrResult}
        capturedPages={deliveryNoteCapturePages}
        mobileMessage={mobileMessage}
        mobileStage={mobileStage}
        documentDirectionHint={deliveryNoteDirectionHint}
        supplierNameHint={deliveryNoteSupplierHint}
        supplierOptions={deliveryNoteSupplierOptions}
        onAttach={handleMobileAttach}
        onDeliveryNotePageSelect={handleDeliveryNotePageSelect}
        onDeliveryNotePageRemove={handleDeliveryNotePageRemove}
        onDeliveryNotePagesClear={handleDeliveryNotePagesClear}
        onDocumentDirectionHintChange={(direction) => {
          setDeliveryNoteDirectionHint(direction);
          if (direction !== "supplier_return") setDeliveryNoteSupplierHint("");
        }}
        onSupplierNameHintChange={setDeliveryNoteSupplierHint}
        onDeferPrint={handleDeferLabels}
        onDeliveryNoteRecognize={() => handleDeliveryNoteRecognize()}
        onPrint={handlePrintLabels}
        onStageChange={handleMobileStageChange}
        printState={printState}
        printerDeviceQa={printerDeviceQa}
        records={inbounds}
        reviewState={reviewState}
        selected={mobileSelected}
      />
      <RawMaterialRollInventoryWorkbench
        colorMappingState={colorMappingState}
        inbounds={inbounds}
        meta={meta}
        onOpenColorMappings={() => setColorMappingOpen(true)}
        onOpenReceiving={() => setDesktopView("收货录入")}
        onOpenSource={handleOpenRollSource}
      />
      <RawMaterialInboundListPane
        activeTab={activeTab}
        inbounds={inbounds}
        keyword={keyword}
        meta={meta}
        metrics={metrics}
        onKeywordChange={setKeyword}
        onSelect={handleSelectInbound}
        onTabChange={changeTab}
        records={records}
        selectedId={selected?.id}
        visibleRecords={visibleRecords}
        firstReleaseMode={firstReleaseMode}
        onOpenInventory={() => setDesktopView("卷料库存")}
      />
      <DetailPane
        className={`raw-material-detail-pane ${mobileOcrReviewActive ? "has-mobile-ocr-review" : ""}`}
        title={selected?.supplierName ?? "原材料入库"}
        subtitle={selected?.status ?? "原材料入库"}
      >
        <button className="raw-material-mobile-back" onClick={() => handleMobileStageChange("home")} type="button">返回收货步骤</button>
        {mobileOcrReviewActive ? (
          <Suspense fallback={<DataState title="正在打开核对页面" description="正在载入逐卷核对清单…" />}>
            <RawMaterialMobileOcrReview
              authState={authState}
              disabled={reviewState.disabled}
              documentDraft={ocrReviewDraft}
              key={selected.id}
              lineDrafts={ocrLineReviewDraft}
              onBack={() => handleMobileStageChange("home")}
              onDocumentFieldChange={(key, value) => setOcrReviewDraft((current) => ({ ...current, [key]: value }))}
              onLineFieldChange={(lineId, key, value) => setOcrLineReviewDraft((current) => ({
                ...current,
                [lineId]: {
                  ...(current[lineId] ?? buildOcrLineReviewDraft(selected.ocrLines?.find((line) => line.lineId === lineId))),
                  [key]: value,
                },
              }))}
              onSubmit={handleOcrReviewConfirm}
              operatorId={currentUser?.userId}
              selected={selected}
              sourcePreviewDataUrls={deliveryNotePreviewByInboundId[selected.id]}
              submitError={meta.error || ocrReviewSubmitError}
              submitting={ocrReviewSubmitting}
            />
          </Suspense>
        ) : null}
        <div className="raw-material-ocr-upload-bar">
          <div className="raw-material-ocr-copy" title="供应商原始单号有则录、没有就留空">
            <strong>识别送货单</strong>
            <span>OCR 仅预填；识别不会直接入库</span>
          </div>
          <div className="raw-material-ocr-upload-actions">
            <label
              className={`button-like raw-material-camera-button ${reviewState.disabled || deliveryNoteOcrLoading ? "is-disabled" : ""}`}
              title={reviewState.title || "调用手机后置摄像头拍摄送货单，原图最大 30MB，系统自动处理后识别"}
            >
              {deliveryNoteOcrLoading ? "正在识别…" : "直接拍照"}
              <input
                accept="image/jpeg,image/png,image/bmp"
                capture="environment"
                disabled={reviewState.disabled || deliveryNoteOcrLoading}
                hidden
                onChange={handleDesktopDeliveryNoteRecognize}
                type="file"
              />
            </label>
            <label
              className={`button-like raw-material-file-button ${reviewState.disabled || deliveryNoteOcrLoading ? "is-disabled" : ""}`}
              title={reviewState.title || "图片原图最大 30MB 并自动处理；PDF 暂限 7.5MB"}
            >
              {deliveryNoteOcrLoading ? "处理中…" : "相册 / PDF"}
              <input
                accept="image/png,image/jpeg,image/bmp,application/pdf"
                disabled={reviewState.disabled || deliveryNoteOcrLoading}
                hidden
                multiple
                onChange={handleDesktopDeliveryNoteRecognize}
                type="file"
              />
            </label>
          </div>
          {deliveryNoteOcrResult ? <span className="raw-material-ocr-success" role="status">{deliveryNoteOcrResult}</span> : null}
          {deliveryNoteOcrError ? <span className="raw-material-ocr-error" role="alert">{deliveryNoteOcrError}</span> : null}
        </div>
        {firstReleaseMode ? null : <RawMaterialPurchasePanel authState={authState} currentUser={currentUser} />}
        {selected ? (
          <>
            <RawMaterialDetailOverview selected={selected} />
            <div className="operational-detail-tabs raw-material-detail-tabs">
              <Segmented ariaLabel="原材料详情视图" value={detailTab} onChange={setDetailTab} items={firstReleaseMode ? RAW_MATERIAL_FIRST_RELEASE_DETAIL_TABS : RAW_MATERIAL_DETAIL_TABS} />
            </div>
            <div className="raw-material-detail-scroll">
              <section className="detail-section operational-detail-section-first" hidden={detailTab !== "入库标签"}>
                <h3>入库动作</h3>
                {selected.ocrProvider === "tencent_cloud_table_v3" && canReviewRawMaterialInbound(selected) ? (
                  <div className="raw-material-ocr-review-panel">
                    <div className="raw-material-ocr-review-heading">
                      <div>
                        <strong>腾讯云 OCR 人工复核</strong>
                        <span>原图附件 {selected.sourceAttachmentId || "已保存"} · 请求 {selected.ocrRequestId || "待记录"}</span>
                      </div>
                      <span>{selected.ocrStatus}</span>
                    </div>
                    <div className="raw-material-ocr-review-grid">
                      {(selected.ocrReviewFields ?? []).map((field) => (
                        <label key={field.key}>
                          <span>{field.label}{field.required ? " *" : ""}</span>
                          <input
                            aria-label={`${field.label} OCR 复核值`}
                            inputMode={isNumericOcrField(field.key) ? "decimal" : undefined}
                            min={field.key === "rollCount" ? "1" : undefined}
                            onChange={(event) => setOcrReviewDraft((current) => ({
                              ...current,
                              [field.key]: isNumericOcrField(field.key) ? event.target.value : event.target.value,
                            }))}
                            step={field.key === "rollCount" ? "1" : isNumericOcrField(field.key) ? "0.001" : undefined}
                            type={isNumericOcrField(field.key) ? "number" : "text"}
                            value={ocrReviewDraft[field.key] ?? ""}
                          />
                          <small>
                            识别值：{String(field.recognizedValue || "未识别")} · 可信度 {Math.round(Number(field.confidence) || 0)}% · {field.reviewStatus || "待人工复核"}
                          </small>
                        </label>
                      ))}
                    </div>
                    {(selected.ocrLines ?? []).length ? (
                      <div className="raw-material-ocr-lines" aria-label="OCR 逐行复核">
                        {(selected.ocrLines ?? []).map((line, index) => {
                          const lineDraft = ocrLineReviewDraft[line.lineId] ?? buildOcrLineReviewDraft(line);
                          const recognizedValues = line.recognizedValues ?? line.values ?? {};
                          return (
                            <div className="raw-material-ocr-line-review" key={line.lineId}>
                              <div className="raw-material-ocr-line-heading">
                                <strong>第 {index + 1} 行</strong>
                                <span>{line.sourceText || Object.values(recognizedValues).filter(Boolean).join(" | ") || "该行未识别到有效文字"}</span>
                                <em>{line.reviewStatus || "待人工复核"}</em>
                              </div>
                              <div className="raw-material-ocr-line-grid">
                                {OCR_LINE_REVIEW_FIELDS.map(([key, label]) => (
                                  <label key={key}>
                                    <span>{label}</span>
                                    <input
                                      aria-label={`OCR 明细 ${line.lineId} ${label}`}
                                      inputMode={isNumericOcrLineField(key) ? "decimal" : undefined}
                                      min={key === "rollCount" ? "1" : undefined}
                                      onChange={(event) => setOcrLineReviewDraft((current) => ({
                                        ...current,
                                        [line.lineId]: {
                                          ...(current[line.lineId] ?? buildOcrLineReviewDraft(line)),
                                          [key]: event.target.value,
                                        },
                                      }))}
                                      step={key === "rollCount" ? "1" : isNumericOcrLineField(key) ? "0.001" : undefined}
                                      type={isNumericOcrLineField(key) ? "number" : "text"}
                                      value={lineDraft[key] ?? ""}
                                    />
                                    <small>识别值：{formatOcrLineRecognizedValue(recognizedValues[key])} · {Math.round(Number(line.confidences?.[key]) || 0)}%</small>
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                    <button
                      className="primary-action"
                      disabled={reviewState.disabled}
                      onClick={handleOcrReviewConfirm}
                      type="button"
                    >
                      确认人工复核
                    </button>
                  </div>
                ) : null}
                <div className="action-row raw-material-actions">
                  <button
                    className="primary-action"
                    disabled={reviewState.disabled || !canReviewRawMaterialInbound(selected)}
                    title={reviewState.title || (!canReviewRawMaterialInbound(selected) ? "当前状态无需复核" : "")}
                    onClick={selected.ocrProvider === "tencent_cloud_table_v3" ? handleOcrReviewConfirm : () => onAction?.("复核送货单", selected.id)}
                  >
                    复核送货单
                  </button>
                  <button
                    disabled={voidDraftState.disabled || selected.status !== "已识别待复核"}
                    title={voidDraftState.title || (selected.status !== "已识别待复核" ? "只有未复核、未打印、未形成库存的误录草稿可以作废" : "保留原图和操作审计，不形成库存")}
                    onClick={() => {
                      const reason = globalThis.prompt?.("请输入作废误录草稿的原因（必填）：", "");
                      if (!String(reason ?? "").trim()) return;
                      onAction?.("作废误录草稿", selected.id, { reason: String(reason).trim() });
                    }}
                    type="button"
                  >
                    作废误录草稿
                  </button>
                  <button
                    disabled={printState.disabled || !canPrintRawMaterialLabels(selected)}
                    title={printState.title || (!canPrintRawMaterialLabels(selected) ? "先完成送货单复核" : "打印标签只是待贴标，贴到实物并核对后才入库")}
                    onClick={handlePrintLabels}
                  >
                    打印一卷一标
                  </button>
                  <button
                    disabled={exceptionState.disabled || selected.status === "入库异常/待确认"}
                    title={exceptionState.title || ""}
                    onClick={() => onAction?.("标记异常", selected.id, { reason: "页面手工标记异常。" })}
                  >
                    标记异常
                  </button>
                </div>
                <InfoGrid
                  rows={[
                    ["原料", `${selected.productName || selected.materialType} / ${selected.materialType}`],
                    ["外部/内部单号", formatRawMaterialDeliveryNoteNo(selected)],
                    ["规格颜色", `${formatRawMaterialStructuredSpec(selected)} / ${selected.supplierColor} -> ${selected.factoryColor}`],
                    ["主要查询键", `${selected.factoryColor || selected.supplierColor || "颜色待补"} / ${selected.widthCm || "?"}cm / ${selected.gramWeightGsm || "?"}克`],
                    ["同色同宽可用", `${selectedStock?.availableWeightKg || 0}kg / ${selectedStock?.availableRollCount || 0}卷`],
                    ...(firstReleaseMode ? [] : [["订单支持", formatRawMaterialOrderSupport(selectedOrderSupport, selectedTaskCandidate)]]),
                    ["卷/件数", `${selected.rollCount || selected.rolls?.length || 0}`],
                    ["重量/单位", `${formatRawMaterialWeight(selected)} / ${selected.unit || "未填"}`],
                    ["单价/金额", canViewCost ? formatRawMaterialCost(selected, money) : "成本权限可见"],
                    ["库位", selected.location || "待分配"],
                    ["OCR", selected.ocrStatus || "待识别"],
                    ["单据附件", formatRawMaterialOptionalAttachment(selected.signedNoteStatus)],
                  ]}
                />
              </section>
              <section className="detail-section raw-material-roll-section" hidden={!(["入库标签", "领料成本", "扫码出库"].includes(detailTab))}>
              <h3>{detailTab === "入库标签" ? "卷/件标签" : firstReleaseMode ? "按卷扫码出库" : "卷/件领料与消耗"}</h3>
              <div className="raw-material-roll-list">
                {(selected.rolls ?? []).map((roll) => {
                  const canAttachRoll = roll.labelStatus === "已打印待贴标" && roll.inventoryStatus !== "可用";
                  const canIssueRoll = canIssueRawMaterialRoll(roll);
                  const canPartialIssueRoll = canIssueRoll && Number(roll.weightKg || 0) > 0;
                  const canConfirmConsumption = canConfirmRawMaterialConsumptionRoll(roll);
                  const canPartialConsumeRoll = canConfirmConsumption && Number(roll.weightKg || 0) > 0;
                  const canReturnLeftover = canReturnRawMaterialLeftoverRoll(roll);
                  const canReviewLeftover = canReviewRawMaterialLeftoverRoll(roll);
                  return (
                    <div className="raw-material-roll-row" key={roll.id}>
                      <div>
                        <strong>{roll.id}</strong>
                        <span>{roll.supplierRollNo} / {roll.weightKg ? `${roll.weightKg}kg` : selected.unit || "件"}</span>
                      </div>
                      <StatusPill tone={getRawMaterialRollTone(roll)}>{roll.labelStatus} / {roll.inventoryStatus || "不可用"}</StatusPill>
                      <span>{roll.location || "待分配"}</span>
                      <span>{formatRawMaterialLabelVerification(roll)}</span>
                      <button
                        hidden={detailTab !== "入库标签"}
                        disabled={attachState.disabled || !canAttachRoll}
                        title={attachState.title || (!canAttachRoll ? "该卷/件还未到可贴标确认状态" : "")}
                        onClick={() => setLabelVerification(buildRawMaterialLabelVerificationDraft(selected, roll))}
                      >
                        核对并确认
                      </button>
                      <button
                        hidden={detailTab !== "入库标签" || roll.labelStatus !== "标签或实物不符/待确认"}
                        disabled={printState.disabled}
                        title={printState.title || "只作废当前异常卷的旧标签，不影响其他已确认卷"}
                        onClick={() => onAction?.("作废卷标", selected.id, { rollId: roll.id, reason: "标签与实物不符，作废当前卷旧标签。" })}
                      >
                        作废旧标签
                      </button>
                      <button
                        hidden={detailTab !== "入库标签" || roll.labelStatus !== "标签已作废/待重打"}
                        disabled={printState.disabled}
                        title={printState.title || "只重打当前异常卷的标签，重打后仍需重新逐卷核对"}
                        onClick={() => handleReprintLabel(roll)}
                      >
                        重打本卷标签
                      </button>
                      <button
                        hidden={!(["领料成本", "扫码出库"].includes(detailTab))}
                        disabled={issueState.disabled || !canIssueRoll}
                        title={issueState.title || (!canIssueRoll ? "该卷/件还不是可用库存，或已经领到机边" : "")}
                        onClick={() => setIssueSelection(buildRawMaterialIssueOptions(selected, roll, firstReleaseMode ? [] : productionTasks, firstReleaseMode))}
                      >
                        {firstReleaseMode ? "扫码出库" : "机边领料"}
                      </button>
                      <button
                        hidden={firstReleaseMode || detailTab !== "领料成本"}
                        disabled={issueState.disabled || !canPartialIssueRoll}
                        title={issueState.title || (!canPartialIssueRoll ? "只有有重量的可用卷料才能拆卷部分领料" : "")}
                        onClick={() => setIssueSelection(buildRawMaterialPartialIssueOptions(selected, roll, productionTasks))}
                      >
                        部分领料
                      </button>
                      <button
                        hidden={firstReleaseMode || detailTab !== "领料成本"}
                        disabled={consumptionState.disabled || !canConfirmConsumption}
                        title={consumptionState.title || (!canConfirmConsumption ? "只有机边领用且待消耗确认的卷/件才能确认消耗" : "")}
                        onClick={() => onAction?.("确认消耗", selected.id, buildRawMaterialConsumptionOptions(selected, roll))}
                      >
                        确认消耗
                      </button>
                      <button
                        hidden={firstReleaseMode || detailTab !== "领料成本"}
                        disabled={consumptionState.disabled || !canPartialConsumeRoll}
                        title={consumptionState.title || (!canPartialConsumeRoll ? "只有有重量的机边卷料才能登记部分消耗" : "")}
                        onClick={() => onAction?.("确认消耗", selected.id, buildRawMaterialPartialConsumptionOptions(selected, roll))}
                      >
                        部分消耗
                      </button>
                      <button
                        hidden={firstReleaseMode || detailTab !== "领料成本"}
                        disabled={leftoverState.disabled || !canReturnLeftover}
                        title={leftoverState.title || (!canReturnLeftover ? "只有机边领用的卷/件才能退回余料" : "")}
                        onClick={() => onAction?.("余料退回", selected.id, buildRawMaterialLeftoverReturnOptions(selected, roll))}
                      >
                        余料退回
                      </button>
                      <button
                        hidden={firstReleaseMode || detailTab !== "领料成本"}
                        disabled={leftoverReviewState.disabled || !canReviewLeftover}
                        title={leftoverReviewState.title || (!canReviewLeftover ? "只有余料待复核的卷/件才能复核转可用" : "")}
                        onClick={() => onAction?.("复核余料可用", selected.id, buildRawMaterialLeftoverReviewOptions(selected, roll))}
                      >
                        复核余料
                      </button>
                    </div>
                  );
                })}
              </div>
              {labelVerification ? (
                <form
                  className="raw-material-label-verification"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!labelVerification.matchResult) return;
                    const result = await onAction?.("确认贴标入库", selected.id, {
                      rollId: labelVerification.rollId,
                      matchResult: labelVerification.matchResult,
                      checkedWeightKg: labelVerification.checkedWeightKg,
                      checkedColor: labelVerification.checkedColor,
                      checkedSpec: labelVerification.checkedSpec,
                      location:
                        labelVerification.matchResult === "mismatched" && labelVerification.location === "原料库-可用区"
                          ? "原料隔离区"
                          : labelVerification.location,
                      verificationNote: labelVerification.verificationNote,
                    });
                    if (result) setLabelVerification(null);
                  }}
                >
                  <div>
                    <strong>逐卷贴标核对：{labelVerification.rollId}</strong>
                    <span>只会影响当前卷/件；不一致将隔离，其他已确认卷保持可用。</span>
                  </div>
                  <label>结果
                    <select
                      onChange={(event) => setLabelVerification((current) => ({ ...current, matchResult: event.target.value }))}
                      value={labelVerification.matchResult}
                    >
                      <option value="">请选择</option>
                      <option value="matched">标签与实物一致</option>
                      <option value="mismatched">标签与实物不一致</option>
                    </select>
                  </label>
                  <label>实物重量 kg<input min="0" onChange={(event) => setLabelVerification((current) => ({ ...current, checkedWeightKg: event.target.value }))} step="0.001" type="number" value={labelVerification.checkedWeightKg} /></label>
                  <label>实物颜色<input onChange={(event) => setLabelVerification((current) => ({ ...current, checkedColor: event.target.value }))} value={labelVerification.checkedColor} /></label>
                  <label>实物规格<input onChange={(event) => setLabelVerification((current) => ({ ...current, checkedSpec: event.target.value }))} value={labelVerification.checkedSpec} /></label>
                  <label>库位<input onChange={(event) => setLabelVerification((current) => ({ ...current, location: event.target.value }))} value={labelVerification.location} /></label>
                  <label>说明<textarea onChange={(event) => setLabelVerification((current) => ({ ...current, verificationNote: event.target.value }))} value={labelVerification.verificationNote} /></label>
                  <div className="action-row">
                    <button className="primary-action" disabled={attachState.disabled || !labelVerification.matchResult} type="submit">确认本卷核对</button>
                    <button onClick={() => setLabelVerification(null)} type="button">取消</button>
                  </div>
                </form>
              ) : null}
              {issueSelection ? (
                <form
                  className="raw-material-label-verification raw-material-issue-selection"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!issueSelection.machineId || (!firstReleaseMode && !issueSelection.productionTaskId)) return;
                    const result = await onAction?.(firstReleaseMode ? "扫码出库" : "机边领料", selected.id, issueSelection);
                    if (result) setIssueSelection(null);
                  }}
                >
                  <div>
                    <strong>领料确认：{issueSelection.rollId}</strong>
                    <span>{firstReleaseMode ? "只需选择领用机台；颜色、规格、宽幅和重量由卷码自动带出，暂不关联订单。" : "选择生产任务和机台后才会移动该卷/件到机边；不生成成品数量或成本。"}</span>
                  </div>
                  {!firstReleaseMode ? <label>生产任务
                    <select
                      onChange={(event) => {
                        const task = findRawMaterialProductionTaskOption(productionTasks, event.target.value);
                        setIssueSelection((current) => ({
                          ...current,
                          productionTaskId: event.target.value,
                          machineId: task?.machineId || current.machineId,
                        }));
                      }}
                      value={issueSelection.productionTaskId}
                    >
                      <option value="">请选择生产任务</option>
                      {buildRawMaterialIssueTaskOptions(productionTasks).map((task) => (
                        <option key={task.productionTaskId} value={task.productionTaskId}>{task.label}</option>
                      ))}
                    </select>
                  </label> : null}
                  <label>机台 / 机边区域<input onChange={(event) => setIssueSelection((current) => ({ ...current, machineId: event.target.value }))} value={issueSelection.machineId} /></label>
                  {issueSelection.partialIssue ? (
                    <label>本次领料 kg<input min="0.001" onChange={(event) => setIssueSelection((current) => ({ ...current, issuedWeightKg: event.target.value }))} step="0.001" type="number" value={issueSelection.issuedWeightKg} /></label>
                  ) : null}
                  <label>说明<textarea onChange={(event) => setIssueSelection((current) => ({ ...current, note: event.target.value }))} value={issueSelection.note || ""} /></label>
                  <div className="action-row">
                    <button className="primary-action" disabled={issueState.disabled || !issueSelection.machineId || (!firstReleaseMode && !issueSelection.productionTaskId)} type="submit">{firstReleaseMode ? "确认扫码出库" : "确认领料到机边"}</button>
                    <button onClick={() => setIssueSelection(null)} type="button">取消</button>
                  </div>
                </form>
              ) : null}
              </section>
              <section className="detail-section operational-detail-section-first raw-material-stage-actions" hidden={firstReleaseMode || detailTab !== "领料成本"}>
              <h3>领料与成本动作</h3>
              <p>机边领料只移动原材料状态；成本、损耗和毛利按独立复核步骤推进，不把机器计数或领料记录当成合格产量。</p>
              <div className="action-row raw-material-actions">
                <button
                  disabled={costDraftState.disabled || !canGenerateRawMaterialCostDraft(selected)}
                  title={costDraftState.title || (!canGenerateRawMaterialCostDraft(selected) ? "需先确认消耗，且领料记录必须已匹配生产任务" : "")}
                  onClick={() => onAction?.("生成成本草稿", selected.id, { note: "V1 生成原材料成本分摊草稿；仍需成本/管理复核。" })}
                >
                  生成成本草稿
                </button>
                <button
                  disabled={costConfirmState.disabled || !canConfirmRawMaterialCostDraft(selected)}
                  title={costConfirmState.title || (!canConfirmRawMaterialCostDraft(selected) ? "需先生成待复核成本草稿" : "")}
                  onClick={() => onAction?.("确认成本草稿", selected.id, { note: "V1 复核确认原材料成本快照；损耗和毛利仍走独立流程。" })}
                >
                  确认成本草稿
                </button>
                <button
                  disabled={lossCalibrationState.disabled || !canCalibrateRawMaterialLoss(selected)}
                  title={lossCalibrationState.title || (!canCalibrateRawMaterialLoss(selected) ? "需先确认成本草稿，且不能重复校准损耗" : "")}
                  onClick={() => onAction?.("校准损耗", selected.id, buildRawMaterialLossCalibrationOptions(selected))}
                >
                  校准损耗
                </button>
                <button
                  disabled={marginSnapshotState.disabled || !canGenerateRawMaterialMarginSnapshot(selected)}
                  title={marginSnapshotState.title || (!canGenerateRawMaterialMarginSnapshot(selected) ? "需先完成损耗校准，且不能重复生成毛利快照" : "")}
                  onClick={() => onAction?.("生成毛利快照", selected.id, buildRawMaterialMarginSnapshotOptions(selected))}
                >
                  生成毛利快照
                </button>
                <button
                  disabled={marginReviewState.disabled || !canReviewRawMaterialMarginSnapshot(selected)}
                  title={marginReviewState.title || (!canReviewRawMaterialMarginSnapshot(selected) ? "需先生成毛利快照，且订单收入必须完整、不能重复复核" : "")}
                  onClick={() => onAction?.("复核毛利快照", selected.id, buildRawMaterialMarginReviewOptions(selected))}
                >
                  复核毛利快照
                </button>
              </div>
              </section>
              <section className="detail-section raw-material-machine-section" hidden={!(["领料成本", "扫码出库"].includes(detailTab))}>
              <h3>{firstReleaseMode ? "扫码出库记录" : "机边领料 / 消耗"}</h3>
              <InfoGrid
                rows={[
                  ["领料状态", selected.issueStatus || (selected.rawMaterialIssueRecords?.length ? "部分领料/机边" : "未领料")],
                  ["机台/任务", `${selected.machineId || "未分配"} / ${selected.productionTaskId || "未关联生产任务"}`],
                  ["任务匹配", formatRawMaterialTaskMatch(selected)],
                  ["领料记录", `${selected.rawMaterialIssueRecords?.length || 0}`],
                  ["拆卷记录", `${selected.rawMaterialSplitRecords?.length || 0}`],
                  ["消耗确认", `${selected.rawMaterialConsumptionRecords?.length || 0}`],
                  ["余料退回", `${selected.rawMaterialLeftoverReturnRecords?.length || 0}`],
                  ["余料复核", `${selected.rawMaterialLeftoverReviewRecords?.length || 0}`],
                  ["成本草稿", formatRawMaterialCostDraftSummary(selected, canViewCost, money)],
                  ["成本确认", formatRawMaterialCostConfirmationSummary(selected, canViewCost, money)],
                  ["损耗校准", formatRawMaterialLossCalibrationSummary(selected, canViewCost, money)],
                  ["毛利快照", formatRawMaterialMarginSnapshotSummary(selected, canViewCost, money)],
                  ["毛利报表", formatRawMaterialMarginReportSummary(selected, canViewCost, money)],
                ]}
              />
              <div className="supplier-statement-note-list">
                {(selected.rawMaterialIssueRecords ?? []).slice(0, 4).map((record) => (
                  <span key={record.issueRecordId}>{formatRawMaterialIssueRecord(record)}</span>
                ))}
                {(selected.rawMaterialSplitRecords ?? []).slice(0, 4).map((record) => (
                  <span key={record.splitRecordId}>{formatRawMaterialSplitRecord(record)}</span>
                ))}
                {(selected.rawMaterialConsumptionRecords ?? []).slice(0, 4).map((record) => (
                  <span key={record.consumptionRecordId}>{formatRawMaterialConsumptionRecord(record)}</span>
                ))}
                {(selected.rawMaterialLeftoverReturnRecords ?? []).slice(0, 4).map((record) => (
                  <span key={record.leftoverReturnRecordId}>{formatRawMaterialLeftoverReturnRecord(record)}</span>
                ))}
                {(selected.rawMaterialLeftoverReviewRecords ?? []).slice(0, 4).map((record) => (
                  <span key={record.leftoverReviewRecordId}>{formatRawMaterialLeftoverReviewRecord(record)}</span>
                ))}
                {(selected.rawMaterialCostAllocationDrafts ?? []).slice(0, 4).map((record) => (
                  <span key={record.costAllocationDraftId}>{formatRawMaterialCostAllocationDraft(record, canViewCost, money)}</span>
                ))}
                {(selected.rawMaterialCostAllocationConfirmations ?? []).slice(0, 3).map((record) => (
                  <span key={record.costConfirmationId}>{formatRawMaterialCostAllocationConfirmation(record, canViewCost, money)}</span>
                ))}
                {(selected.rawMaterialCostLossCalibrations ?? []).slice(0, 3).map((record) => (
                  <span key={record.lossCalibrationId}>{formatRawMaterialCostLossCalibration(record, canViewCost, money)}</span>
                ))}
                {(selected.rawMaterialOrderMarginSnapshots ?? []).slice(0, 3).map((record) => (
                  <span key={record.marginSnapshotId}>{formatRawMaterialOrderMarginSnapshot(record, canViewCost, money)}</span>
                ))}
                {(selected.rawMaterialOrderMarginReports ?? []).slice(0, 3).map((record) => (
                  <span key={record.marginReportId}>{formatRawMaterialOrderMarginReport(record, canViewCost, money)}</span>
                ))}
                {(selected.rawMaterialCostAllocationWarnings ?? []).slice(0, 3).map((warning) => (
                  <span key={warning}>成本草稿提示：{warning}</span>
                ))}
                {!(
                  (selected.rawMaterialIssueRecords ?? []).length ||
                  (selected.rawMaterialSplitRecords ?? []).length ||
                  (selected.rawMaterialConsumptionRecords ?? []).length ||
                  (selected.rawMaterialLeftoverReturnRecords ?? []).length ||
                  (selected.rawMaterialLeftoverReviewRecords ?? []).length ||
                  (selected.rawMaterialCostAllocationDrafts ?? []).length ||
                  (selected.rawMaterialCostAllocationConfirmations ?? []).length ||
                  (selected.rawMaterialCostLossCalibrations ?? []).length ||
                  (selected.rawMaterialOrderMarginSnapshots ?? []).length ||
                  (selected.rawMaterialOrderMarginReports ?? []).length
                ) ? <span>暂无机边领料 / 消耗 / 余料记录。</span> : null}
              </div>
              </section>
              <section className="detail-section operational-detail-section-first" hidden={detailTab !== "供应商账"}>
              <h3>供应商对账</h3>
              <InfoGrid
                rows={[
                  ["月结状态", selected.statementStatus || "待上传"],
                  ["匹配摘要", selected.statementSummary || "等待供应商月结 Excel"],
                  ["差异项", (selected.statementDifferences ?? []).join(" / ") || "暂无"],
                ]}
              />
              <p>供应商月结对账只确认 ERP 入库记录和供应商 Excel 是否一致；确认对账不等于付款，付款仍走财务对账收款流程。</p>
              <div className="raw-material-statement-import">
                <div className="toolbar-line">
                  <label className="file-upload-button">
                    上传月结 Excel
                    <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleSupplierStatementImport} />
                  </label>
                  <span>{statementImportLoading ? "正在识别供应商月结单..." : "支持白侯重1-重5、北陈批号明细和通用字段预检查。"}</span>
                </div>
                {statementImport ? (
                  <SupplierStatementImportPreview
                    result={statementImport}
                    onSaveDraft={handleSaveSupplierStatementReviewDraft}
                    saving={statementReviewSaving}
                  />
                ) : null}
                <SupplierStatementReviewList
                  reviews={statementReviews}
                  meta={statementReviewMeta}
                  onConfirm={handleConfirmSupplierStatementReview}
                  onStatementConfirm={handleConfirmSupplierStatement}
                  onPayableDraftGenerate={handleGenerateSupplierPayableDraft}
                  onPaymentConfirm={handleConfirmSupplierPayment}
                  payableState={payableState}
                  paymentState={paymentState}
                  money={money}
                  firstReleaseMode={firstReleaseMode}
                />
              </div>
              </section>
              <section className="detail-section operational-detail-section-first" hidden={detailTab !== "记录"}>
                <h3>流程记录</h3>
                <Timeline items={buildRawMaterialInboundTimeline(selected)} />
              </section>
            </div>
          </>
        ) : (
          <DataState title="暂无原材料入库单" detail="调整视图或搜索条件后重试。" compact />
        )}
      </DetailPane>
    </section>
  );
}

function inferDeliveryNoteMimeType(fileName) {
  const name = String(fileName ?? "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".bmp")) return "image/bmp";
  if (/\.jpe?g$/.test(name)) return "image/jpeg";
  return "";
}

function isSupportedDeliveryNoteFile(mimeType) {
  return ["image/png", "image/jpeg", "image/jpg", "image/bmp", "application/pdf"].includes(String(mimeType ?? "").toLowerCase());
}

function toDeliveryNoteCapturePage({ prepared, file, captureId }) {
  return {
    fileName: prepared.sourceFile?.name || (prepared.pdfPageNumber
      ? `${String(file?.name || "送货单.pdf").replace(/\.pdf$/iu, "")}-第${prepared.pdfPageNumber}页.jpg`
      : file?.name),
    mimeType: prepared.mimeType,
    fileSize: prepared.fileSize,
    contentDataUrl: prepared.contentDataUrl,
    sourceMimeType: prepared.sourceMimeType,
    sourceFileSize: prepared.sourceFileSize,
    sourceContentDataUrl: prepared.sourceContentDataUrl,
    sourceFile: prepared.sourceFile,
    captureId,
    sourceNormalizedForOcr: prepared.normalized,
    pdfPageNumber: prepared.pdfPageNumber || undefined,
  };
}

function createRawMaterialDeliveryNoteCaptureId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `RMCAP-${uuid}`;
  return `RMCAP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function isNumericOcrField(key) {
  return ["rollCount", "totalWeightKg", "unitPrice", "amount"].includes(key);
}

function isNumericOcrLineField(key) {
  return ["rollCount", "totalWeightKg", "unitPrice", "amount"].includes(key);
}

function buildOcrLineReviewDraft(line = {}) {
  const values = line.values ?? {};
  return Object.fromEntries(OCR_LINE_REVIEW_FIELDS.map(([key]) => [
    key,
    key === "rollWeightsKg" && Array.isArray(values[key]) ? values[key].join(", ") : values[key] ?? "",
  ]));
}

function scrollRawMaterialMobileToTop() {
  requestAnimationFrame(() => {
    document.querySelector(".app-shell-mobile-role .content")?.scrollTo({ top: 0, behavior: "auto" });
    window.scrollTo({ top: 0, behavior: "auto" });
  });
}

function formatOcrLineRecognizedValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "未识别";
  return String(value ?? "").trim() || "未识别";
}
