import { useEffect, useRef, useState } from "react";
import PackageLabelsPreview from "../features/printing/PhysicalLabelsPreview.jsx";
import { toFactoryDatetimeLocal } from "../../shared/fulfillmentHandoffTime.js";
import { createOfficeIdempotencyKey } from "../services/officeApiClientCore.js";
import { readPrintCommandDraft, savePrintCommandDraft, clearPrintCommandDraft } from "../features/printing/print-command-draft.js";
import {
  batchPrintResultOptions,
  getOfficeModalInitialNumberValue,
  getOfficeModalInitialReason,
  officeModalReasonOptions,
  officeModalTitles,
  printVoidReasonOptions,
} from "../state/officeModalActions.js";
import { buildFulfillmentPrintTemplate } from "../domain/printTemplates.js";
import {
  findOrderLine,
  getFulfillmentDocumentLabel,
  money,
  varianceHandlingOptions,
} from "../domain/officeRules.js";
import {
  formatFileSize,
} from "./attachmentViewUtils.js";


const orderQuantityReasonOptions = ["客户改量", "识别数量修正", "库存复核后改量", "办公室修正数量", "管理批准改量", "其他原因改量"];
const orderVoidReasonOptions = ["客户取消订单", "重复订单作废", "识别错误作废", "库存不足取消", "管理拒绝接单", "订单改量作废重建", "客户拒绝等待取消", "其他原因作废"];
const evidenceAttachmentAccept = "image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt";

export function OrderLineActionModal({ modal, onClose, onConfirm, inline = false }) {
  const line = modal.orderLine ?? {};
  const isQuantityAction = modal.type === "quantity";
  const currentQty = Number(line.qty ?? line.originalQty ?? 0);
  const customerLabel = line.customer ?? line.customerName ?? "";
  const productLabel = line.product ?? line.productName ?? "";
  const [newQty, setNewQty] = useState(String(currentQty || ""));
  const [reason, setReason] = useState(isQuantityAction ? orderQuantityReasonOptions[0] : orderVoidReasonOptions[0]);
  const nextQty = Number(newQty);
  const confirmDisabled = isQuantityAction && (!Number.isSafeInteger(nextQty) || nextQty <= 0 || nextQty === currentQty);
  const quantityHint = !Number.isSafeInteger(nextQty) || nextQty <= 0 ? "请填写大于零的整数数量。" : nextQty === currentQty ? "新数量与当前数量相同，无需提交。" : "";
  const title = isQuantityAction ? "调整正式单数量" : "作废正式单";
  const confirmLabel = isQuantityAction ? "确认改量" : "确认作废";

  const pending = useRef(false);
  const request = useRef(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    if (pending.current || confirmDisabled) return;
    pending.current = true;
    setBusy(true);
    setError("");
    request.current ??= { newQty: nextQty, reason, idempotencyKey: createOfficeIdempotencyKey() };
    try {
      const result = await onConfirm(request.current);
      if (result?.source === "api" && !result.blocked) {
        setUncertain(false);
        request.current = null;
      } else {
        const code = String(result?.error?.code || "");
        const status = Number(result?.error?.status || 0);
        const unknown = !result || /UNAVAILABLE|UNCONFIRMED|IDEMPOTENCY_KEY_REUSED/.test(code) || status >= 500 || status === 408 || status === 429;
        setUncertain(unknown);
        if (!unknown) request.current = null;
        setError(result?.feedback || result?.error?.message || "提交结果未确认，请用原内容重试。");
      }
    } catch {
      setUncertain(true);
      setError("未收到服务器确认，请用原内容重试。");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className={inline ? "order-inline-editor" : "modal-backdrop"} role={inline ? undefined : "presentation"}>
      <section className={inline ? "order-inline-form" : "modal"} role={inline ? undefined : "dialog"} aria-modal={inline ? undefined : true} aria-label={title}>
        <div className="modal-title">
          <div>
            <span>正式订单动作</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" aria-label="关闭订单操作" disabled={busy} onClick={onClose}>×</button>
        </div>
        <div className="form-grid">
          <label>
            订单明细
            <input value={`${line.orderNo ?? line.id ?? ""}-${line.lineNo ?? ""}`} readOnly />
          </label>
          <label>
            客户 / 货品
            <input value={`${customerLabel} / ${productLabel}`} readOnly />
          </label>
          <label>
            当前数量
            <input value={currentQty || ""} readOnly />
          </label>
          {isQuantityAction && (
            <label>
              新数量
              <input aria-label="新数量" type="number" min="1" step="1" disabled={busy || uncertain} aria-invalid={!Number.isSafeInteger(nextQty) || nextQty <= 0} value={newQty} onChange={(event) => setNewQty(event.target.value)} />
              {quantityHint ? <span>{quantityHint}</span> : null}
            </label>
          )}
          <label>
            原因
            <select disabled={busy || uncertain} value={reason} onChange={(event) => setReason(event.target.value)}>
              {(isQuantityAction ? orderQuantityReasonOptions : orderVoidReasonOptions).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
        {error ? <p role="alert">{error}</p> : null}
        {uncertain ? <p>已保留本次提交内容。关闭后请先刷新核对订单，再决定是否修改。</p> : null}
        <div className="modal-actions">
          <button disabled={busy} onClick={onClose}>取消</button>
          <button className="primary-action" disabled={busy || confirmDisabled} onClick={confirm}>{busy ? "提交中…" : uncertain ? "用原内容重试" : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

function PrintTemplatePreview({ template, fulfillment }) {
  if (!template) {
    return (
      <div className="print-sheet">
        <h3>{fulfillment ? getFulfillmentDocumentLabel(fulfillment) : "单据"}预览</h3>
        <p>未找到可预览的打印数据。</p>
      </div>
    );
  }
  if (template.documentType === "package_label") {
    return <section aria-label="逐包挂牌预览"><h3>内部包裹挂牌</h3><p>每个实际包裹一张挂牌；核对实物后贴牌，旧码失效后须重印。</p><PackageLabelsPreview packages={(template.labels ?? []).map((label, index) => ({...label, packageSeq:index+1}))}/></section>;
  }
  const { fields } = template;
  return (
    <div className="print-template-sheet">
      <div className="label-header">
        <div>
          <span>{template.documentType === "express_ltl_label" ? "EXPRESS / LTL" : "FULFILLMENT"}</span>
          <h3>{template.title}</h3>
        </div>
        <strong>{fields.printBatchNo}</strong>
      </div>
      <div className="label-grid">
        <div>
          <span>客户</span>
          <strong>{fields.customerName}</strong>
        </div>
        <div>
          <span>电话尾号</span>
          <strong>{fields.phoneTail || "-"}</strong>
        </div>
        <div>
          <span>订单明细</span>
          <strong>{fields.orderLineNo}</strong>
        </div>
        <div>
          <span>数量/包数</span>
          <strong>{fields.quantityText} / {fields.packageText}</strong>
        </div>
      </div>
      <div className="label-goods">
        <span>货品摘要</span>
        <strong>{fields.goodsSummary}</strong>
      </div>
      {!template.priceHidden && Array.isArray(fields.lineItems) && fields.lineItems.length ? (
        <div className="print-line-table">
          <div className="print-line-head">
            <span>明细</span>
            <span>货品/规格</span>
            <span>数量</span>
            <span>金额</span>
          </div>
          {fields.lineItems.map((item) => (
            <div className="print-line-row" key={item.orderLineNo || item.lineNo}>
              <span>{item.lineNo || "-"}</span>
              <strong>{item.goodsSummary}</strong>
              <span>{item.quantityText} / {item.packageText}</span>
              <span>{item.unitPriceText} / {item.amountText}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="label-grid compact">
        <div>
          <span>交付</span>
          <strong>{fields.fulfillmentMethod}</strong>
        </div>
        <div>
          <span>最晚</span>
          <strong>{fields.latestNeededAt || "-"}</strong>
        </div>
        <div>
          <span>库区/来源</span>
          <strong>{fields.inventorySource || "-"}</strong>
        </div>
        <div>
          <span>包裹序号</span>
          <strong>{fields.packageSequence}</strong>
        </div>
      </div>
      {!template.priceHidden ? (
        <div className="label-grid compact document-money-grid">
          <div>
            <span>合计数量</span>
            <strong>{fields.totalQuantityText || fields.quantityText}</strong>
          </div>
          <div>
            <span>合计金额</span>
            <strong>{fields.totalAmountText || "-"}</strong>
          </div>
          <div>
            <span>价格说明</span>
            <strong>{fields.priceStatementText || "-"}</strong>
          </div>
          <div>
            <span>联次</span>
            <strong>{fields.copyText || "-"}</strong>
          </div>
        </div>
      ) : null}
      <div className="label-note">
        <span>备注</span>
        <strong>{fields.note || "无"}</strong>
      </div>
      <div className="label-barcode" aria-label="标签条码文本">
        <span>{fields.barcodeText}</span>
      </div>
      <div className="label-footer">
        {template.safeguards.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function toDateInputValue(value) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (!text || !Number.isFinite(Date.parse(text))) return "";
  return new Date(text).toISOString().slice(0, 10);
}

function toDatetimeLocalInputValue(value, fallbackDate) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return text.slice(0, 16);
  if (text && Number.isFinite(Date.parse(text))) return new Date(text).toISOString().slice(0, 16);
  return `${fallbackDate}T08:30`;
}

export function ActionModal({
  modal,
  fulfillments,
  statements,
  orderLines,
  findCustomer,
  getStatementBlockingAmount,
  onClose,
  onConfirm,
}) {
  const [warehouseRequest, setWarehouseRequest] = useState(null);
  const [warehouseSubmitting, setWarehouseSubmitting] = useState(false);
  const [warehouseUncertain, setWarehouseUncertain] = useState(false);
  const warehousePending = useRef(false);
  const isPrintCommand = ["print", "printVoid"].includes(modal.type);
  const [printDraft, setPrintDraft] = useState(() => isPrintCommand ? readPrintCommandDraft(modal) : { request: null, error: "" });
  const [printSubmitting, setPrintSubmitting] = useState(false);
  const [printError, setPrintError] = useState("");
  const [printConflict, setPrintConflict] = useState(false);
  const printBusy = useRef(false);
  const printMounted = useRef(true);
  const printDialog = useRef(null);
  useEffect(() => { printMounted.current = true; return () => { printMounted.current = false; }; }, []);
  useEffect(() => {
    if (!isPrintCommand || typeof document === "undefined") return;
    const panel = printDialog.current, previous = document.activeElement;
    const items = () => [...panel.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"]')];
    (panel.querySelector('select:not(:disabled)') ?? items()[0])?.focus();
    const keydown = event => {
      if (event.key === "Escape") { event.preventDefault(); if (!printBusy.current) onClose(); }
      if (event.key === "Tab") {
        const targets = items(), first = targets[0], last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    panel.addEventListener("keydown", keydown);
    return () => { panel.removeEventListener("keydown", keydown); if (previous?.isConnected) previous.focus(); };
  }, []);
  const fulfillment = warehouseRequest?.fulfillmentSnapshot ?? printDraft.request?.fulfillment ?? fulfillments.find((item) => item.id === modal.fulfillmentId);
  const fulfillmentDocumentLabel = fulfillment ? getFulfillmentDocumentLabel(fulfillment) : "单据/标签";
  const fulfillmentLine = fulfillment ? findOrderLine(orderLines, fulfillment.lineId ?? fulfillment.orderLineId) : null;
  const printTemplate = printDraft.request?.preview ?? (fulfillment
    ? buildFulfillmentPrintTemplate({
        fulfillment,
        orderLine: fulfillmentLine,
        customer: findCustomer(fulfillment.customerId),
        action: modal.action,
      })
    : null);
  const statement = statements.find((item) => item.id === modal.statementId);
  const statementLines = statement ? statement.lineIds.map((id) => findOrderLine(orderLines, id)).filter(Boolean) : [];
  const preview = modal.preview;
  const previewSummary = preview?.summary ?? {
    receivable: Number(statement?.receivable ?? 0),
    received: Number(statement?.received ?? 0),
    variance: Number(statement?.variance ?? 0),
    lineCount: statementLines.length,
  };
  const previewLines = preview?.lines?.length
    ? preview.lines
    : statementLines.map((line, index) => ({
        statementLineId: `${statement?.id ?? "ST"}-${index + 1}`,
        orderLineId: line.id,
        orderNo: `${line.orderNo}-${line.lineNo}`,
        productName: line.product,
        goodsSpec: `${line.size} ${line.color}`,
        billQty: line.qty,
        finalAmount: line.amount,
      }));
  const [numberValue, setNumberValue] = useState(getOfficeModalInitialNumberValue(modal, { fulfillment, statement, getStatementBlockingAmount }));
  const [reason, setReason] = useState(printDraft.request?.reason ?? getOfficeModalInitialReason(modal));
  const [attachPaymentProof, setAttachPaymentProof] = useState(modal.type === "payment");
  const [paymentProofRemark, setPaymentProofRemark] = useState("");
  const [paymentProofFile, setPaymentProofFile] = useState(null);
  const [paymentProofPreviewUrl, setPaymentProofPreviewUrl] = useState("");
  const [customerConfirmationContent, setCustomerConfirmationContent] = useState("客户回复确认无误");
  const [attachCustomerConfirmationProof, setAttachCustomerConfirmationProof] = useState(modal.type === "customerConfirmation");
  const [customerConfirmationRemark, setCustomerConfirmationRemark] = useState("");
  const [customerConfirmationProofFile, setCustomerConfirmationProofFile] = useState(null);
  const [customerConfirmationPreviewUrl, setCustomerConfirmationPreviewUrl] = useState("");
  const [attachmentError, setAttachmentError] = useState("");
  const batchPrintPackages = modal.type === "batchPrintResult" ? modal.printPackages ?? [] : [];
  const [selectedPrintedPackageIds, setSelectedPrintedPackageIds] = useState(() => batchPrintPackages.map((item) => item.packageId));
  const dispatchDefaultRouteDate = toDateInputValue(fulfillment?.routeDate) || new Date().toISOString().slice(0, 10);
  const [dispatchDriverId, setDispatchDriverId] = useState(fulfillment?.driverId || "");
  const [dispatchRouteDate, setDispatchRouteDate] = useState(dispatchDefaultRouteDate);
  const [dispatchRouteNo, setDispatchRouteNo] = useState(fulfillment?.routeNo || fulfillment?.routeBatchNo || "虎门线-A");
  const [dispatchRouteSequence, setDispatchRouteSequence] = useState(String(fulfillment?.routeSequence || fulfillment?.stopSequence || 1));
  const [dispatchPlannedDepartureAt, setDispatchPlannedDepartureAt] = useState(
    toDatetimeLocalInputValue(fulfillment?.plannedDepartureAt, dispatchDefaultRouteDate),
  );
  const [dispatchEditorIdentity] = useState(()=>({dispatchId:fulfillment?.dispatchId ?? "",expectedRevision:fulfillment?.dispatchRevision ?? 0,idempotencyKey:createOfficeIdempotencyKey()}));
  const dispatchBusy = useRef(false);
  const dispatchAlive = useRef(true);
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false);
  const [dispatchError, setDispatchError] = useState("");
  const [dispatchRequest, setDispatchRequest] = useState(null);
  const [driverRoster, setDriverRoster] = useState({loading:true,items:[],error:""});
  const [driverRosterAttempt, setDriverRosterAttempt] = useState(0);
  useEffect(()=>{dispatchAlive.current=true;return()=>{dispatchAlive.current=false;};},[]);
  useEffect(()=>{
    if(modal.type!=="dispatch") return;
    const controller=new AbortController();
    setDriverRoster({loading:true,items:[],error:""});
    Promise.resolve().then(()=>modal.loadDrivers?.(controller.signal)).then(result=>{
      if(controller.signal.aborted) return;
      const items=result?.drivers;
      const ids=new Set();
      if(result?.source!=="api" || result.blocked || !Array.isArray(items) || items.some(item=>!item || typeof item.userId!=="string" || !item.userId || typeof item.name!=="string" || !item.name || ids.has(item.userId) || !ids.add(item.userId))) setDriverRoster({loading:false,items:[],error:result?.error?.message || "司机名单读取失败，请重试。"});
      else setDriverRoster({loading:false,items,error:""});
    }).catch(()=>{if(!controller.signal.aborted)setDriverRoster({loading:false,items:[],error:"司机名单读取失败，请重试。"});});
    return ()=>controller.abort();
  },[modal.type,modal.loadDrivers,driverRosterAttempt]);
  const dispatchDriverAvailable=driverRoster.items.some(item=>item.userId===dispatchDriverId);
  const [dispatchRemark, setDispatchRemark] = useState(fulfillment?.dispatchRemark || "");
  const initialWarehouseResult = modal.initialWarehouseResult || "已备货";
  const [paperHandoffNote, setPaperHandoffNote] = useState("");
  const [warehouseResult, setWarehouseResult] = useState(initialWarehouseResult);
  const [warehousePhysicalExecutorEmployeeId, setWarehousePhysicalExecutorEmployeeId] = useState("");
  const [warehouseFeedbackChannel, setWarehouseFeedbackChannel] = useState("当面");
  const [warehouseExecutedAt, setWarehouseExecutedAt] = useState(
    () => toFactoryDatetimeLocal(new Date().toISOString()),
  );
  const [warehouseActualQty, setWarehouseActualQty] = useState(
    initialWarehouseResult === "无法出库" ? "0" : String(fulfillment?.qty ?? ""),
  );
  const [warehouseNote, setWarehouseNote] = useState("");
  const [warehouseReviewOpen, setWarehouseReviewOpen] = useState(false);

  useEffect(() => {
    if (!paymentProofFile || !String(paymentProofFile.type ?? "").startsWith("image/")) {
      setPaymentProofPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(paymentProofFile);
    setPaymentProofPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [paymentProofFile]);

  useEffect(() => {
    if (!customerConfirmationProofFile || !String(customerConfirmationProofFile.type ?? "").startsWith("image/")) {
      setCustomerConfirmationPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(customerConfirmationProofFile);
    setCustomerConfirmationPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [customerConfirmationProofFile]);

  function handlePaymentProofFileChange(event) {
    const file = event.target.files?.[0] ?? null;
    setPaymentProofFile(file);
    setAttachmentError("");
    if (file) {
      setAttachPaymentProof(true);
      setPaymentProofRemark(`付款凭证附件：${file.name}`);
    }
  }

  function handleCustomerConfirmationFileChange(event) {
    const file = event.target.files?.[0] ?? null;
    setCustomerConfirmationProofFile(file);
    setAttachmentError("");
    if (file) {
      setAttachCustomerConfirmationProof(true);
      setCustomerConfirmationRemark(`客户确认附件：${file.name}`);
    }
  }

  function getFirstBatchPackageIds(count) {
    const safeCount = Math.max(0, Math.min(batchPrintPackages.length, Math.trunc(Number(count) || 0)));
    return batchPrintPackages.slice(0, safeCount).map((item) => item.packageId);
  }

  function handleBatchPrintReasonChange(nextReason) {
    setReason(nextReason);
    if (modal.type !== "batchPrintResult") return;
    if (nextReason === "全部打出") {
      setSelectedPrintedPackageIds(batchPrintPackages.map((item) => item.packageId));
      setNumberValue(String(batchPrintPackages.length));
      return;
    }
    if (nextReason === "部分打出") {
      const partialCount = Math.max(1, Math.min(batchPrintPackages.length - 1, Math.trunc(Number(numberValue) || batchPrintPackages.length - 1)));
      setSelectedPrintedPackageIds(getFirstBatchPackageIds(partialCount));
      setNumberValue(String(partialCount));
      return;
    }
    setSelectedPrintedPackageIds([]);
    setNumberValue("0");
  }

  function handleBatchPrintNumberChange(value) {
    setNumberValue(value);
    if (modal.type === "batchPrintResult" && reason === "部分打出") {
      setSelectedPrintedPackageIds(getFirstBatchPackageIds(value));
    }
  }

  function toggleBatchPrintPackage(packageId) {
    setSelectedPrintedPackageIds((current) => {
      const exists = current.includes(packageId);
      const next = exists ? current.filter((item) => item !== packageId) : [...current, packageId];
      setNumberValue(String(next.length));
      return next;
    });
  }

  async function confirm() {
    if (isPrintCommand) {
      if (printBusy.current || printConflict || printDraft.error) return;
      if (!fulfillment) { setPrintError("未找到对应单据，请刷新后重新核对。"); return; }
      const request = printDraft.request ?? {
        idempotencyKey: createOfficeIdempotencyKey(), reason,
        fulfillment: Object.fromEntries(["id", "method", "packingGroupAnchorId", "activePrintRecordId", "printRecordId", "lastPrintRecordId"].filter(key => fulfillment[key] !== undefined).map(key => [key, fulfillment[key]])),
        printRecordId: modal.printRecordId ?? fulfillment.activePrintRecordId ?? fulfillment.printRecordId ?? "",
        preview: printTemplate,
      };
      const storageError = savePrintCommandDraft(modal, request);
      if (storageError) { setPrintError(storageError); return; }
      setPrintDraft({ request, error: "" });
      printBusy.current = true; setPrintSubmitting(true); setPrintError("");
      try {
        const result = await onConfirm({ reason: request.reason, printRequest: request });
        if (result?.confirmed === true) clearPrintCommandDraft(modal, request);
        else if (printMounted.current) {
          setPrintError(result?.feedback || "尚未确认操作成功，已保留原请求，请重试。");
          setPrintConflict(/CONFLICT|STALE|VERSION|KEY_REUSED/.test(result?.error?.code || ""));
        }
      } catch {
        if (printMounted.current) setPrintError("未能确认服务器结果，已保留原请求，请重试。");
      } finally {
        printBusy.current = false;
        if (printMounted.current) setPrintSubmitting(false);
      }
      return;
    }
    if (modal.type === "paperHandoff") {
      onConfirm({ note: paperHandoffNote });
      return;
    }
    if (modal.type === "warehouseExecution") {
      if (warehousePending.current) return;
      const actualQty = warehouseResult === "已备货" ? null : Number(warehouseActualQty);
      const expectedQty = Number(fulfillment?.qty ?? 0);
      if (!warehousePhysicalExecutorEmployeeId.trim()) {
        setAttachmentError("请选择或填写实际执行库房人员的正式员工编号。");
        return;
      }
      if (!warehouseExecutedAt) {
        setAttachmentError("请填写库房实际执行时间。");
        return;
      }
      if (warehouseResult !== "已备货" && (!Number.isFinite(actualQty) || actualQty < 0)) {
        setAttachmentError("请填写有效的实际数量。");
        return;
      }
      if (warehouseResult === "实物已出库" && actualQty !== expectedQty) {
        setAttachmentError("实物已出库仅支持数量与纸单一致；数量不同请登记“数量不符”。");
        return;
      }
      if (!warehouseReviewOpen) {
        setAttachmentError("");
        setWarehouseRequest({ result: warehouseResult, physicalExecutorEmployeeId: warehousePhysicalExecutorEmployeeId.trim(),
          feedbackChannel: warehouseFeedbackChannel, executedAt: warehouseExecutedAt, actualQty, note: warehouseNote.trim(),
          idempotencyKey: createOfficeIdempotencyKey(), fulfillmentSnapshot: structuredClone(fulfillment), paperDocumentSnapshot: structuredClone(fulfillment.paperOutboundDocument) });
        setWarehouseReviewOpen(true);
        return;
      }
      warehousePending.current = true;
      setWarehouseSubmitting(true);
      await import("./submitWarehouseExecution.js").then(({ submitWarehouseExecution }) => submitWarehouseExecution({ request: warehouseRequest, onConfirm, mounted: printMounted, pending: warehousePending,
        setSubmitting: setWarehouseSubmitting, setError: setAttachmentError, setUncertain: setWarehouseUncertain,
        reset: () => { setWarehouseRequest(null); setWarehouseReviewOpen(false); } })).catch(() => { warehousePending.current = false; setWarehouseSubmitting(false); setAttachmentError("操作未加载完成，请用原内容重试。"); });
      return;
    }
    if (modal.type === "payment" && attachPaymentProof && !paymentProofFile) {
      setAttachmentError("已勾选付款凭证，请选择实际文件；如暂不留存凭证，请取消勾选后再登记实收。");
      return;
    }
    if (modal.type === "customerConfirmation" && attachCustomerConfirmationProof && !customerConfirmationProofFile) {
      setAttachmentError("已勾选确认附件，请选择实际文件；如仅登记客户回复，请取消勾选后再提交。");
      return;
    }
    if (modal.type === "dispatch") {
      if(dispatchBusy.current || (!dispatchRequest && (driverRoster.loading || !dispatchDriverAvailable))) return;
      const request=dispatchRequest ?? {...dispatchEditorIdentity,driverId:dispatchDriverId,routeDate:dispatchRouteDate,routeNo:dispatchRouteNo,routeSequence:Number(dispatchRouteSequence),plannedDepartureAt:dispatchPlannedDepartureAt,remark:dispatchRemark};
      dispatchBusy.current=true;setDispatchSubmitting(true);setDispatchError("");setDispatchRequest(request);
      try {
        const result=await onConfirm(request);
        if(dispatchAlive.current && (result?.blocked || result?.source!=="api")) {
          setDispatchError(result?.feedback || result?.error?.message || "尚未确认派车保存成功，请核对后重试。");
          if(!["FULFILLMENT_DISPATCH_API_UNAVAILABLE","FULFILLMENT_DISPATCH_SAVE_UNCONFIRMED"].includes(result?.error?.code))setDispatchRequest(null);
        }
      } catch { if(dispatchAlive.current)setDispatchError("未能确认保存结果，已保留原内容，请重试。"); }
      finally {dispatchBusy.current=false;if(dispatchAlive.current)setDispatchSubmitting(false);}
      return;
    }
    const printedPackageIds =
      modal.type === "batchPrintResult"
        ? reason === "全部打出"
          ? batchPrintPackages.map((item) => item.packageId)
          : reason === "部分打出"
            ? selectedPrintedPackageIds
            : []
        : [];
    onConfirm({
      actualQty: Number(numberValue),
      amount: Number(numberValue),
      reason,
      printedPackageIds,
      attachPaymentProof,
      paymentProofRemark,
      paymentProofFile: paymentProofFile
        ? paymentProofFile
        : null,
      attachCustomerConfirmationProof,
      customerConfirmationContent,
      customerConfirmationRemark,
      customerConfirmationProofFile: customerConfirmationProofFile
        ? customerConfirmationProofFile
        : null,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={printDialog} className="modal" role="dialog" aria-modal="true" aria-label={officeModalTitles[modal.type]}>
        <div className="modal-title">
          <div>
            <span>业务操作</span>
            <h2>{officeModalTitles[modal.type]}</h2>
          </div>
          <button className="icon-button" aria-label="关闭业务操作" disabled={printSubmitting || dispatchSubmitting || warehouseSubmitting || warehouseUncertain} onClick={onClose}>×</button>
        </div>
        {modal.type === "print" ? (
          <PrintTemplatePreview template={printTemplate} fulfillment={fulfillment} />
        ) : modal.type === "printVoid" ? (
          <div className="form-grid">
            <label>
              旧{fulfillmentDocumentLabel}批次
              <input value={fulfillment?.printBatch ?? fulfillment?.activePrintRecordId ?? modal.printRecordId ?? "待确认"} readOnly />
            </label>
            <label>
              作废原因
              <select disabled={printSubmitting || Boolean(printDraft.request)} value={reason} onChange={(event) => setReason(event.target.value)}>
                {printVoidReasonOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <div className="form-note">
              作废后当前{fulfillmentDocumentLabel}不能继续用于交付确认，需要先重打生成新{fulfillmentDocumentLabel}。
            </div>
          </div>
        ) : modal.type === "dispatch" ? (
          <div className="form-grid">
            <label>
              司机
              <select aria-label="司机" disabled={Boolean(dispatchRequest) || driverRoster.loading || Boolean(driverRoster.error)} value={dispatchDriverId} onChange={(event) => setDispatchDriverId(event.target.value)}>
                <option value="">请选择司机</option>
                {dispatchDriverId && !dispatchDriverAvailable ? <option value={dispatchDriverId} disabled>原司机不在当前名单，请重新选择</option> : null}
                {driverRoster.items.map((item) => (
                  <option key={item.userId} value={item.userId}>{item.name}</option>
                ))}
              </select>
            </label>
            <label>
              路线日期
              <input disabled={Boolean(dispatchRequest)} type="date" value={dispatchRouteDate} onChange={(event) => setDispatchRouteDate(event.target.value)} />
            </label>
            <label>
              路线趟号
              <input disabled={Boolean(dispatchRequest)} value={dispatchRouteNo} onChange={(event) => setDispatchRouteNo(event.target.value)} />
            </label>
            <label>
              站序
              <input disabled={Boolean(dispatchRequest)} type="number" min="1" value={dispatchRouteSequence} onChange={(event) => setDispatchRouteSequence(event.target.value)} />
            </label>
            <label>
              计划发车
              <input disabled={Boolean(dispatchRequest)} type="datetime-local" value={dispatchPlannedDepartureAt} onChange={(event) => setDispatchPlannedDepartureAt(event.target.value)} />
            </label>
            <label>
              备注
              <input disabled={Boolean(dispatchRequest)} value={dispatchRemark} placeholder="如：先送客户仓、等包裹标签" onChange={(event) => setDispatchRemark(event.target.value)} />
            </label>
            {driverRoster.loading ? <p role="status">正在读取司机名单…</p> : driverRoster.error ? <p role="alert">{driverRoster.error} <button type="button" onClick={()=>setDriverRosterAttempt(value=>value+1)}>重试读取司机</button></p> : !driverRoster.items.length ? <p role="status">暂无可选司机，请联系管理员核对司机账号。<button type="button" onClick={()=>setDriverRosterAttempt(value=>value+1)}>刷新司机名单</button></p> : null}
            {dispatchError ? <p role="alert">{dispatchError}</p> : null}
            {dispatchRequest ? <p>保存结果待核对，重试会使用原内容。修改前请先刷新核对。</p> : null}
            <div className="form-note">
              保存后司机端任务按路线日期、趟号和站序排序；装车和送达仍由司机端单独确认。
            </div>
          </div>
        ) : modal.type === "paperHandoff" ? (
          <div className="form-grid">
            <label>
              当前纸单
              <input value={`V${fulfillment?.paperOutboundDocument?.documentVersion ?? fulfillment?.paperOutboundDocumentVersion ?? "待确认"}`} readOnly />
            </label>
            <label>
              打印状态
              <input value={fulfillment?.printRecordStatus === "reprinted" ? "已重打" : fulfillment?.printRecordStatus === "printed" ? "已打印" : "待确认"} readOnly />
            </label>
            <label className="wide-field">
              交接备注
              <input value={paperHandoffNote} placeholder="如：纸单已交郭青格，等库房找货" onChange={(event) => setPaperHandoffNote(event.target.value)} />
            </label>
            <div className="form-note">
              这里只登记办公室将已验证纸单交给库房。交库房不等于实物已出库，也不产生库存扣减或对账。
            </div>
          </div>
        ) : modal.type === "warehouseExecution" ? (
          warehouseReviewOpen ? (
            <div className="form-grid">
              <label>
                纸单版本
                <input value={`V${fulfillment?.paperOutboundDocument?.documentVersion ?? fulfillment?.paperOutboundDocumentVersion ?? "待确认"}`} readOnly />
              </label>
              <label>
                库房结果
                <input value={warehouseResult} readOnly />
              </label>
              <label>
                实物执行人
                <input value={warehousePhysicalExecutorEmployeeId} readOnly />
              </label>
              <label>
                实际执行时间
                <input value={warehouseExecutedAt.replace("T", " ")} readOnly />
              </label>
              <label>
                纸单 / 实际数量
                <input value={`${fulfillment?.qty ?? 0} / ${warehouseResult === "已备货" ? "未出库" : warehouseActualQty} 个`} readOnly />
              </label>
              <label>
                反馈渠道
                <input value={warehouseFeedbackChannel} readOnly />
              </label>
              <label className="wide-field">
                备注
                <input value={warehouseNote || "无"} readOnly />
              </label>
              <div className="form-note" role="alert">
                {warehouseResult === "实物已出库"
                  ? fulfillment?.method === "送货"
                    ? "确认后只登记库房实物出库并进入待司机装车；客户送达前不会生成对账候选。"
                    : "确认后只登记库房实物出库并扣减库存；客户自提或承运方拉走必须下一步单独确认，届时才生成对账候选。"
                  : warehouseResult === "数量不符"
                    ? "确认后只生成数量差异待办，不扣库存、不改单、不生成对账。"
                    : warehouseResult === "无法出库"
                      ? "确认后只生成无法出库待办，不扣库存、不改单、不生成对账。"
                      : "确认后仅登记已备货，库存和对账均不变化。"}
              </div>
            </div>
          ) : (
            <div className="form-grid">
              <label>
                当前纸单
                <input value={`V${fulfillment?.paperOutboundDocument?.documentVersion ?? fulfillment?.paperOutboundDocumentVersion ?? "待确认"} / ${fulfillment?.qty ?? 0} 个`} readOnly />
              </label>
              <label>
                库房反馈结果
                <select disabled={modal.prepareOnly} value={warehouseResult} onChange={(event) => {
                  const next = event.target.value;
                  setWarehouseResult(next);
                  setAttachmentError("");
                  if (next === "已备货") setWarehouseActualQty("");
                  if (next === "实物已出库") setWarehouseActualQty(String(fulfillment?.qty ?? ""));
                  if (next === "无法出库") setWarehouseActualQty("0");
                }}>
                  {(modal.prepareOnly ? ['已备货'] : ['已备货', '实物已出库', '数量不符', '无法出库']).map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                实物执行人员工编号
                <input value={warehousePhysicalExecutorEmployeeId} placeholder="如：ERP-0008" onChange={(event) => setWarehousePhysicalExecutorEmployeeId(event.target.value)} />
              </label>
              <label>
                反馈渠道
                <select value={warehouseFeedbackChannel} onChange={(event) => setWarehouseFeedbackChannel(event.target.value)}>
                  {['当面', '电话', '微信', '纸面', '其他'].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                实际执行时间
                <input type="datetime-local" step="1" value={warehouseExecutedAt} onChange={(event) => setWarehouseExecutedAt(event.target.value)} />
              </label>
              <label>
                {warehouseResult === "已备货" ? "实际数量" : "实际出库数量"}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={warehouseActualQty}
                  disabled={warehouseResult === "已备货"}
                  onChange={(event) => setWarehouseActualQty(event.target.value)}
                />
              </label>
              <label className="wide-field">
                备注
                <input value={warehouseNote} placeholder="如：只找到 430 个，纸单与实物不符" onChange={(event) => setWarehouseNote(event.target.value)} />
              </label>
              <div className="form-note">
                {modal.prepareOnly ? "当前纸单已打印，可先登记备货；纸单到达并核对后才能登记实物出库。本次不扣库存、不生成对账。" : "库房核对当前纸单与实物后反馈结果。数量不符、无法出库只进入异常处理；不能直接改订单或创建对账。"}
              </div>
              {attachmentError && <div className="form-note" role="alert">{attachmentError}</div>}
            </div>
          )
        ) : modal.type === "customerConfirmation" ? (
          <div className="form-grid">
            <label className="wide-field">
              确认内容
              <textarea rows={3} value={customerConfirmationContent} onChange={(event) => setCustomerConfirmationContent(event.target.value)} />
            </label>
            <label>
              确认渠道
              <input value={statement?.sendChannel || "微信"} readOnly />
            </label>
            <label>
              确认来源
              <input value={statement?.sendRecipient || "客户联系人"} readOnly />
            </label>
            <div className="form-check-row">
              <span>确认附件</span>
              <label>
                <input type="checkbox" checked={attachCustomerConfirmationProof} onChange={(event) => {
                  setAttachCustomerConfirmationProof(event.target.checked);
                  if (!event.target.checked) setAttachmentError("");
                }} />
                聊天截图/确认附件
              </label>
            </div>
            <label>
              附件备注
              <input value={customerConfirmationRemark} disabled={!attachCustomerConfirmationProof} onChange={(event) => setCustomerConfirmationRemark(event.target.value)} />
            </label>
            <label>
              选择附件
              <input type="file" accept={evidenceAttachmentAccept} disabled={!attachCustomerConfirmationProof} onChange={handleCustomerConfirmationFileChange} />
            </label>
            {customerConfirmationProofFile && (
              <div className="attachment-preview">
                {customerConfirmationPreviewUrl ? <img src={customerConfirmationPreviewUrl} alt="客户确认附件预览" /> : <span>文件</span>}
                <div>
                  <strong>{customerConfirmationProofFile.name}</strong>
                  <small>{formatFileSize(customerConfirmationProofFile.size)} · {customerConfirmationProofFile.type || "未知类型"}</small>
                </div>
              </div>
            )}
            <div className="form-note">
              客户回复“确认 / 没问题”时登记为对账证据；勾选附件后必须选择真实文件，未留存附件可取消勾选后提交。
            </div>
            {attachmentError && <div className="form-note" role="alert">{attachmentError}</div>}
          </div>
        ) : modal.type === "batchPrintResult" ? (
          <div className="form-grid">
            <label>
              本批待办
              <input value={`${modal.totalTasks ?? 0} 条 / ${modal.totalLabels ?? 0} 张标签`} readOnly />
            </label>
            <label>
              打印结果
              <select value={reason} onChange={(event) => handleBatchPrintReasonChange(event.target.value)}>
                {batchPrintResultOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              已打出标签数
              <input value={numberValue} disabled={reason !== "部分打出"} onChange={(event) => handleBatchPrintNumberChange(event.target.value)} />
            </label>
            {batchPrintPackages.length ? (
              <div className="print-package-checklist">
                <span>包裹标签明细</span>
                <div>
                  {batchPrintPackages.map((item) => {
                    const checked = reason === "全部打出" || (reason === "部分打出" && selectedPrintedPackageIds.includes(item.packageId));
                    return (
                      <label className={checked ? "checked" : ""} key={item.packageId}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={reason !== "部分打出"}
                          onChange={() => toggleBatchPrintPackage(item.packageId)}
                        />
                        <strong>{item.labelText ?? `第 ${item.packageSeq}/${item.packageCount} 包`}</strong>
                        <small>{item.todoRef ?? item.todoId}</small>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="form-note">
              此处只记录人工核对结果；未打出继续留在待打印，结果不确定进入异常核对。交付状态只由可信 spool / 驱动 printed 回读推进。
            </div>
          </div>
        ) : modal.type === "statementPreview" ? (
          <div className="print-sheet">
            <h3>{statement ? findCustomer(statement.customerId).name : ""} 对账单</h3>
            <p>账期：{statement?.period} 应收：{money(previewSummary.receivable || 0)} 已收：{money(previewSummary.received || 0)} 差额：{money(previewSummary.variance || 0)}</p>
            {previewLines.map((line) => (
              <p key={line.statementLineId || line.orderLineId}>
                {line.orderNo} {line.productName} {line.goodsSpec} {line.billQty} 个 {money(line.finalAmount ?? line.amount ?? 0)}
              </p>
            ))}
            {preview?.downloadToken && <p>Excel 文件：已生成；预览不等于已发送。</p>}
          </div>
        ) : (
          <div className="form-grid">
            <label>
              {modal.type === "payment" ? "本期累计实收金额" : modal.type === "variance" ? "差额金额" : modal.type === "unable" ? "实际找到数量" : "实际数量"}
              <input value={numberValue} readOnly={modal.type === "variance"} onChange={(event) => setNumberValue(event.target.value)} />
            </label>
            <label>
              {modal.type === "variance" ? "处理结果" : "原因"}
              <select value={reason} onChange={(event) => setReason(event.target.value)}>
                {(modal.type === "variance" ? varianceHandlingOptions : officeModalReasonOptions).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            {modal.type === "payment" && (
              <>
                <p className="form-note">填写截至本次核对时，这张账单已收到的总金额。此前累计20元、本次核对累计50元时填写50元，不能再相加成70元。</p>
                <div className="form-check-row">
                  <span>付款凭证</span>
                  <label>
                    <input type="checkbox" checked={attachPaymentProof} onChange={(event) => {
                      setAttachPaymentProof(event.target.checked);
                      if (!event.target.checked) setAttachmentError("");
                    }} />
                    付款截图/附件
                  </label>
                </div>
                <label>
                  凭证备注
                  <input value={paymentProofRemark} disabled={!attachPaymentProof} onChange={(event) => setPaymentProofRemark(event.target.value)} />
                </label>
                <label>
                  选择附件
                  <input type="file" accept={evidenceAttachmentAccept} disabled={!attachPaymentProof} onChange={handlePaymentProofFileChange} />
                </label>
                {paymentProofFile && (
                  <div className="attachment-preview">
                    {paymentProofPreviewUrl ? <img src={paymentProofPreviewUrl} alt="付款截图预览" /> : <span>文件</span>}
                    <div>
                      <strong>{paymentProofFile.name}</strong>
                      <small>{formatFileSize(paymentProofFile.size)} · {paymentProofFile.type || "未知类型"}</small>
                    </div>
                  </div>
                )}
                <div className="form-note">
                  勾选付款凭证后必须选择真实文件；如暂不留存凭证，可取消勾选后仅登记实收。
                </div>
              </>
            )}
            {attachmentError && <div className="form-note" role="alert">{attachmentError}</div>}
          </div>
        )}
        {isPrintCommand && (printDraft.error || printError || printDraft.request) ? <div className="form-grid">
          {printDraft.error || printError ? <div className="form-note" role="alert">{printDraft.error || printError}</div> : null}
          {printDraft.request ? <p className="form-note">已保留第一次提交的单据和内容。重试沿用原请求；关闭后再次进入本操作也可继续。</p> : null}
          {printConflict ? <div className="form-note">数据已变化，请先检查当前打印任务和单据，再重新核对。<button type="button" onClick={() => { clearPrintCommandDraft(modal, printDraft.request); onClose(); }}>结束本次重试并关闭</button></div> : null}
        </div> : null}
        {modal.type === "warehouseExecution" && warehouseReviewOpen && attachmentError && <p role="alert">{attachmentError}</p>}
        <div className="modal-actions">
          <button disabled={printSubmitting || dispatchSubmitting || warehouseSubmitting || warehouseUncertain} onClick={warehouseReviewOpen && modal.type === "warehouseExecution" ? () => { setWarehouseReviewOpen(false); setWarehouseRequest(null); } : onClose}>{warehouseReviewOpen && modal.type === "warehouseExecution" ? "返回修改" : isPrintCommand && printDraft.request ? "稍后重试" : "取消"}</button>
          <button className="primary-action" disabled={warehouseSubmitting || dispatchSubmitting || (modal.type === "dispatch" && !dispatchRequest && (driverRoster.loading || !dispatchDriverAvailable)) || (isPrintCommand && (printSubmitting || printConflict || Boolean(printDraft.error)))} onClick={confirm}>{isPrintCommand && printSubmitting ? "正在确认…" : isPrintCommand && printDraft.request ? "用原请求重试" : modal.type === "print" ? modal.action : modal.type === "warehouseExecution" ? warehouseSubmitting ? "保存中…" : warehouseUncertain ? "用原内容重试" : warehouseReviewOpen ? "确认回录" : "下一步确认" : modal.type === "paperHandoff" ? "确认交库房" : modal.type === "statementPreview" ? "确认预览" : modal.type === "printVoid" ? "确认作废" : modal.type === "batchPrintResult" ? "确认结果" : modal.type === "dispatch" ? dispatchSubmitting ? "保存中…" : dispatchRequest ? "用原内容重试" : "保存派单" : modal.type === "customerConfirmation" ? "登记确认" : modal.type === "mismatch" ? "提交数量差异" : modal.type === "unable" ? "提交无法出库" : "确认提交"}</button>
        </div>
      </section>
    </div>
  );
}
