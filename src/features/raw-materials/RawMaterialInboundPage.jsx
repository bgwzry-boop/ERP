import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  DataState,
  DetailPane,
  Segmented,
} from "../../shared/ui/operational.jsx";
import { precheckRawMaterialSupplierStatementWorkbook } from "../../domain/rawMaterialSupplierStatementImport.js";
import { prepareRawMaterialDeliveryNotePages } from "../../services/rawMaterialDeliveryNoteImageClient.js";
import {
  buildRawMaterialStockLookup,
  evaluateRawMaterialOrderSupport,
} from "../../../shared/rawMaterialInventorySupport.js";
import {
  buildRawMaterialInboundMetrics,
  canPrintRawMaterialLabels,
  canReviewRawMaterialInbound,
  filterRawMaterialInboundsByKeyword,
  filterRawMaterialInboundsByTab,
  formatSupplierPayableAmount,
} from "../../domain/rawMaterialInboundListState.js";
import {
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
import { RawMaterialInboundReceivingSections } from "./RawMaterialInboundReceivingSections.jsx";
import { RawMaterialInboundSupportingSections } from "./RawMaterialInboundSupportingSections.jsx";
import { buildOcrLineReviewDraft } from "./rawMaterialInboundOcrDraft.js";
import {
  findRawMaterialProductionTaskCandidate,
} from "./rawMaterialInboundWorkflow.js";
import {
  assertRawMaterialDeliveryNotePageCapacity,
  buildRawMaterialOcrReviewAction,
  getRawMaterialOcrReviewSaveFailureMessage,
  prepareRawMaterialCapturePages,
  resolveRawMaterialAttachStage,
  resolveRawMaterialOcrReviewCompletion,
} from "./rawMaterialInboundPageActions.js";

const RawMaterialMobileOcrReview = lazy(() => import("./RawMaterialMobileOcrReview.jsx").then((module) => ({
  default: module.RawMaterialMobileOcrReview,
})));
const RawMaterialSupplierColorMappingDialog = lazy(() => import("./RawMaterialSupplierColorMappingDialog.jsx").then((module) => ({
  default: module.RawMaterialSupplierColorMappingDialog,
})));

const RAW_MATERIAL_FIRST_RELEASE_DETAIL_TABS = ["入库标签", "扫码出库", "供应商账", "记录"];

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
      const updatedInbound = await onAction?.(reviewAction.action, reviewAction.inboundId, reviewAction.payload);
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
    const nextStage = resolveRawMaterialAttachStage(result);
    if (nextStage) {
      setMobileStage(nextStage);
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
              <RawMaterialInboundReceivingSections
                actionStates={{
                  attach: attachState,
                  consumption: consumptionState,
                  exception: exceptionState,
                  issue: issueState,
                  leftover: leftoverState,
                  leftoverReview: leftoverReviewState,
                  print: printState,
                  review: reviewState,
                  voidDraft: voidDraftState,
                }}
                canViewCost={canViewCost}
                detailTab={detailTab}
                firstReleaseMode={firstReleaseMode}
                issueSelection={issueSelection}
                labelVerification={labelVerification}
                money={money}
                ocrLineReviewDraft={ocrLineReviewDraft}
                ocrReviewDraft={ocrReviewDraft}
                onAction={onAction}
                onOcrReviewConfirm={handleOcrReviewConfirm}
                onPrintLabels={handlePrintLabels}
                onReprintLabel={handleReprintLabel}
                productionTasks={productionTasks}
                selected={selected}
                selectedOrderSupport={selectedOrderSupport}
                selectedStock={selectedStock}
                selectedTaskCandidate={selectedTaskCandidate}
                setIssueSelection={setIssueSelection}
                setLabelVerification={setLabelVerification}
                setOcrLineReviewDraft={setOcrLineReviewDraft}
                setOcrReviewDraft={setOcrReviewDraft}
              />
              <RawMaterialInboundSupportingSections
                actionStates={{
                  costConfirm: costConfirmState,
                  costDraft: costDraftState,
                  lossCalibration: lossCalibrationState,
                  marginReview: marginReviewState,
                  marginSnapshot: marginSnapshotState,
                  payable: payableState,
                  payment: paymentState,
                }}
                canViewCost={canViewCost}
                detailTab={detailTab}
                firstReleaseMode={firstReleaseMode}
                money={money}
                onAction={onAction}
                onPayableDraftGenerate={handleGenerateSupplierPayableDraft}
                onPaymentConfirm={handleConfirmSupplierPayment}
                onStatementConfirm={handleConfirmSupplierStatement}
                onStatementImport={handleSupplierStatementImport}
                onStatementReviewConfirm={handleConfirmSupplierStatementReview}
                onStatementReviewDraftSave={handleSaveSupplierStatementReviewDraft}
                selected={selected}
                statementImport={statementImport}
                statementImportLoading={statementImportLoading}
                statementReviewMeta={statementReviewMeta}
                statementReviewSaving={statementReviewSaving}
                statementReviews={statementReviews}
              />
            </div>
          </>
        ) : (
          <DataState title="暂无原材料入库单" detail="调整视图或搜索条件后重试。" compact />
        )}
      </DetailPane>
    </section>
  );
}

function scrollRawMaterialMobileToTop() {
  requestAnimationFrame(() => {
    document.querySelector(".app-shell-mobile-role .content")?.scrollTo({ top: 0, behavior: "auto" });
    window.scrollTo({ top: 0, behavior: "auto" });
  });
}
