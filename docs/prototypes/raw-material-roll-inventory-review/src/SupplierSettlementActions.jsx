import { useEffect, useRef, useState } from "react";
import { confirmInApp } from "../../../../src/shared/ui/confirmDialog.js";
import { createOfficeIdempotencyKey } from "../../../../src/services/officeApiClientCore.js";
import { supplierAmountCents } from "../../../../shared/supplierSettlementMoney.js";
import { supplierStatementPeriod } from "../../../../shared/supplierStatementPeriod.js";
import {
  nextSupplierSettlementAction,
  supplierPaymentRecords,
  supplierPaymentTotals,
  validateSupplierPaymentForm,
} from "./supplier-settlement-model.js";

const yuan = (value) => `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const errorText = (result, fallback) => result?.error?.message || fallback;
const receiptUncertain = (result) => {
  const status = Number(result?.error?.status);
  return !status || status >= 500 || [401, 403, 408, 429].includes(status);
};

export function SupplierStatementUpload({ formal, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null);
  const [period, setPeriod] = useState({ periodStart: "", periodEnd: "" });
  const submitting = useRef(false);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy || pending) return;
    setBusy(true);
    setError("");
    const checked = await formal.actions.precheckSupplierStatement(file);
    setBusy(false);
    if (checked.source !== "local_precheck") {
      setError(errorText(checked, "对账单识别失败。"));
      return;
    }
    setPreview(checked.result);
    setPeriod({ periodStart: "", periodEnd: "" });
  }

  async function save() {
    if (!preview || submitting.current || !supplierStatementPeriod(period.periodStart, period.periodEnd)) return;
    const key = pending || createOfficeIdempotencyKey();
    submitting.current = true;
    setBusy(true);
    try {
      const result = await formal.actions.saveSupplierStatementReviewDraft({ ...preview, ...period }, key);
      if (result?.source !== "api" || !result.review?.reviewId || !result.operationLogId) {
        const uncertain = receiptUncertain(result);
        setPending(uncertain ? key : null);
        setError(uncertain ? "保存结果未确认，用原文件再核对一次。" : errorText(result, "保存对账单失败。"));
        return;
      }
      setPending(null);
      setPreview(null);
      setError("");
      onSaved?.(result.review);
    } catch {
      setPending(key);
      setError("保存结果未确认，用原文件再核对一次。");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const summary = preview?.summary || {};
  const blocking = (preview?.issues || []).filter((issue) => issue.severity === "error");
  return <>
    <label className={`supplier-upload-button${busy ? " busy" : ""}`}>
      {busy ? "处理中…" : "上传月结 Excel"}
      <input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="上传供应商月结 Excel" disabled={busy || Boolean(pending)} onChange={handleFile} type="file" />
    </label>
    {error ? <div className="business-notice danger" role="alert">{error}</div> : null}
    {preview ? <section aria-label="对账单预检" className="supplier-upload-preview">
      <header><strong>{preview.fileName || "供应商月结 Excel"}</strong><span>{preview.adapter?.label || "通用模板"}</span></header>
      <p>共 {summary.rowCount || 0} 行：匹配 {summary.matchedRowCount || 0}，待确认 {summary.candidateRowCount || 0}，未匹配 {summary.unmatchedRowCount || 0}；金额合计 {yuan(summary.totalAmount)}。</p>
      <SupplierPeriodFields disabled={busy || Boolean(pending)} value={period} onChange={setPeriod} />
      {blocking.length ? <ul className="supplier-upload-issues">{blocking.slice(0, 3).map((issue, index) => <li key={index}>{issue.message}</li>)}</ul> : null}
      <footer>
        <button disabled={busy || Boolean(pending)} onClick={() => setPreview(null)} type="button">取消</button>
        <button className="primary" disabled={busy || blocking.length > 0 || !supplierStatementPeriod(period.periodStart, period.periodEnd)} onClick={save} title={blocking.length ? "对账单有阻断问题，不能保存" : ""} type="button">{pending ? "按原文件核对保存结果" : "保存，开始核对"}</button>
      </footer>
    </section> : null}
  </>;
}

function readPendingSettlement(key) {
  if (!key) return null;
  try { return JSON.parse(globalThis.sessionStorage?.getItem(key) || "null"); } catch { return null; }
}

function savePendingSettlement(key, value) {
  try {
    if (key && value) globalThis.sessionStorage?.setItem(key, JSON.stringify(value));
    else if (key) globalThis.sessionStorage?.removeItem(key);
  } catch { /* The current page still retains the frozen request. */ }
}

export function SupplierSettlementActionPanel({ record, formal, onNotice }) {
  const action = nextSupplierSettlementAction(record);
  const totals = supplierPaymentTotals(record);
  const records = supplierPaymentRecords(record);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adjustmentInputs, setAdjustmentInputs] = useState({});
  const [period, setPeriod] = useState({ periodStart: record.periodStart || "", periodEnd: record.periodEnd || "" });
  const owner = formal.authState?.session?.userId || formal.operatorId;
  const storageKey = owner && record?.reviewId ? `erp.supplier-settlement.pending.${owner}.${record.reviewId}` : "";
  const [pending, setPending] = useState(() => readPendingSettlement(storageKey));
  const submitting = useRef(false);
  const [form, setForm] = useState({ paidAmount: "", roundingAmount: "", paymentMethod: "银行转账", paymentReferenceNo: "", note: "" });
  useEffect(() => {
    setError("");
    setForm({ paidAmount: totals.remaining ? String(totals.remaining) : "", roundingAmount: "", paymentMethod: "银行转账", paymentReferenceNo: "", note: "" });
    setAdjustmentInputs({});
    setPeriod({ periodStart: record.periodStart || "", periodEnd: record.periodEnd || "" });
  }, [record?.reviewId, record?.revision, totals.remaining]);
  useEffect(() => setPending(readPendingSettlement(storageKey)), [storageKey]);

  async function run(command) {
    if (submitting.current) return;
    const request = pending || { ...command, idempotencyKey: createOfficeIdempotencyKey() };
    if (request.id !== record.reviewId) return;
    const { id, idempotencyKey, args = {} } = request;
    const actions = formal.actions;
    const write = {
      review: () => actions.confirmSupplierStatementReview(id, args.decision, { adjustments: args.adjustments, idempotencyKey }),
      period: () => actions.setSupplierStatementPeriod(id, { ...args, idempotencyKey }),
      statement: () => actions.confirmSupplierStatement(id, idempotencyKey),
      payable: () => actions.generateSupplierPayable(id, idempotencyKey),
      payment: () => actions.confirmSupplierPayment(id, { ...args, idempotencyKey }),
    }[request.kind];
    if (!write) return;
    submitting.current = true;
    setPending(request);
    savePendingSettlement(storageKey, request);
    setBusy(true);
    setError("");
    try {
      const result = await write();
      if (result?.source !== "api" || result.review?.reviewId !== id || !result.operationLogId) {
        if (!receiptUncertain(result)) {
          setPending(null);
          savePendingSettlement(storageKey, null);
        }
        setError(errorText(result, `${request.label}结果未确认。请按原操作再核对一次。`));
        return;
      }
      setPending(null);
      savePendingSettlement(storageKey, null);
      onNotice?.(request.success);
    } catch {
      setError(`${request.label}结果未确认。请按原操作再核对一次。`);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const id = record?.reviewId;
  const check = validateSupplierPaymentForm(record, form);
  const unresolvedRows = (record.rows ?? []).filter((row) => row.matchingStatus !== "matched" && !row.sourceReturnInboundId);
  const unresolvedAdjustments = (record.adjustments ?? []).filter((item) => item.isCurrentPeriod !== false && item.adjustmentType !== "reference_balance"
    && (supplierAmountCents(item.amount) === null || ["different", "missing_amount"].includes(item.calculationStatus)));
  const adjustmentResolved = (item) => supplierAmountCents(adjustmentInputs[item.id]?.amount) !== null && adjustmentInputs[item.id]?.note?.trim();
  const blockedReview = unresolvedRows.length > 0 || unresolvedAdjustments.some((item) => !adjustmentResolved(item))
    || record.summary?.status === "blocked" || (record.issues ?? []).some((item) => item.severity === "error");
  const needsPeriod = !supplierStatementPeriod(record.periodStart, record.periodEnd) &&
    (record.supplierReturnPeriodRequired || record.addedSupplierReturnIds?.length);
  const periodEditor = formal.actions.setSupplierStatementPeriod && !record.statementConfirmationId && ["draft", "reviewed"].includes(record.reviewStatus) ? <details open={needsPeriod || undefined}>
    <summary>{record.periodStart && record.periodEnd ? "更正账期" : "补填账期"}</summary>
    <p>按原月结单填写起止日。保存后将重新核对本期退货，原复核记录保留。</p>
    <SupplierPeriodFields disabled={busy} value={period} onChange={setPeriod} />
    <button type="button" disabled={busy || !supplierStatementPeriod(period.periodStart, period.periodEnd)} onClick={async () => {
      if (!await confirmInApp("按所填账期重新匹配退货并返回待复核？")) return;
      void run({ kind: "period", id, args: { ...period, expectedRevision: record.revision }, label: "保存账期", success: "账期已保存，请重新核对本期明细和扣项。" });
    }}>保存账期并重新核对</button>
  </details> : null;
  const paymentRows = records.length ? <section className="business-detail-section"><h3>付款记录</h3><ol className="supplier-payment-history">{records.map((item, index) => <li key={item.supplierPaymentConfirmationId || index}>
    <strong>第 {item.installmentNo || index + 1} 笔</strong><span>{yuan(item.paidAmount)}{Number(item.roundingAmount) > 0 ? ` · 抹零 ${yuan(item.roundingAmount)}` : ""}</span><small>{item.paymentMethod || "银行转账"}{(item.paymentReferenceNo || item.paymentVoucherNo) ? ` · ${item.paymentReferenceNo || item.paymentVoucherNo}` : ""}{item.paidAt ? ` · ${String(item.paidAt).slice(0, 10)}` : ""}</small>
  </li>)}</ol></section> : null;

  if (pending?.id === id) return <>{paymentRows}<section className="business-detail-section supplier-next-action" aria-label="待核对提交结果">
    <p>{pending.kind === "payment" ? `原付款 ${yuan(pending.args?.paidAmount)}${pending.args?.paymentReferenceNo ? ` · 流水 ${pending.args.paymentReferenceNo}` : ""} ` : ""}{pending.label}结果待核对。</p>
    <button className="primary" disabled={busy} onClick={() => void run(pending)} type="button">{busy ? "核对中…" : "用原提交核对结果"}</button>
    {error ? <p role="alert">{error}</p> : null}
  </section></>;

  if (!action) return <>{paymentRows}<p className="supplier-action-done">该月结已付清，无需操作。</p></>;
  if (action.key.startsWith("blocked")) return <>{paymentRows}<p className="supplier-action-blocked">{action.label}</p>{periodEditor}{error ? <p role="alert">{error}</p> : null}</>;

  return <>
    {paymentRows}
    <section aria-label="下一步操作" className="business-detail-section supplier-next-action">
      <h3>下一步：{action.label}</h3>
      {periodEditor}
      {action.key === "review" ? <>
        <SupplierReviewFacts record={record} />
        {unresolvedRows.length ? <p role="status">有 {unresolvedRows.length} 条未匹配明细。请核对入库记录和供应商原单后重新上传，再标记一致。</p> : null}
        {unresolvedAdjustments.map((item) => <fieldset key={item.id}>
          <legend>{item.label || item.typeLabel}待核对</legend>
          <label>核实后金额（元）<input inputMode="decimal" step="0.01" type="number" value={adjustmentInputs[item.id]?.amount ?? ""} onChange={(event) => setAdjustmentInputs((current) => ({ ...current, [item.id]: { ...current[item.id], amount: event.target.value } }))} /></label>
          <label>核对依据<input value={adjustmentInputs[item.id]?.note ?? ""} onChange={(event) => setAdjustmentInputs((current) => ({ ...current, [item.id]: { ...current[item.id], note: event.target.value } }))} /></label>
        </fieldset>)}
        <div className="supplier-action-row">
        <button className="primary" disabled={busy || blockedReview || needsPeriod} onClick={async () => {
          if (!await confirmInApp("确认这份对账单与系统里的入库记录及扣项一致？")) return;
          const adjustments = unresolvedAdjustments.map((item) => ({ id: item.id, ...adjustmentInputs[item.id], confirmed: true }));
          run({ kind: "review", id, args: { decision: "一致", adjustments }, label: "核对", success: "已标记为一致，下一步确认对账。" });
        }} type="button">核对一致</button>
        <button disabled={busy} onClick={async () => {
          if (!await confirmInApp("标记为有差异？需要和供应商核实后重新上传对账单。")) return;
          run({ kind: "review", id, args: { decision: "有差异" }, label: "核对", success: "已标记为有差异，请与供应商核实。" });
        }} type="button">有差异</button>
      </div></> : null}
      {action.key === "confirm-statement" ? <button className="primary" disabled={busy || needsPeriod} onClick={async () => {
        if (!await confirmInApp("确认对账？确认后进入待付款，本步不会付款。")) return;
        run({ kind: "statement", id, label: "确认对账", success: "对账已确认，下一步生成应付。" });
      }} type="button">确认对账</button> : null}
      {action.key === "generate-payable" ? <button className="primary" disabled={busy} onClick={async () => {
        if (!await confirmInApp("按已确认的对账金额生成应付？")) return;
        run({ kind: "payable", id, label: "生成应付", success: "应付已生成，可以登记付款。" });
      }} type="button">生成应付</button> : null}
      {action.key === "pay" ? <form className="supplier-payment-form" onSubmit={async (event) => {
        event.preventDefault();
        if (!check.ok) { setError(check.message); return; }
        if (!await confirmInApp(`确认登记：${check.message}\n不会影响原材料库存。`)) return;
        run({ kind: "payment", id, args: { ...form, paidAmount: check.paidAmount, roundingAmount: check.roundingAmount }, label: "登记付款", success: check.clears ? "已付清。" : `已登记，剩余 ${yuan(check.remainingAfter)}。` });
      }}>
        <dl className="business-facts"><div><dt>应付</dt><dd>{yuan(totals.payable)}</dd></div><div><dt>已付</dt><dd>{yuan(totals.paid)}</dd></div><div><dt>已抹零</dt><dd>{yuan(totals.rounding)}</dd></div><div><dt>剩余未付</dt><dd><strong>{yuan(totals.remaining)}</strong></dd></div></dl>
        <label><span>本次实付（元）</span><input aria-label="本次实付" inputMode="decimal" min="0" onChange={(event) => setForm((current) => ({ ...current, paidAmount: event.target.value }))} step="0.01" type="number" value={form.paidAmount} /></label>
        <label><span>抹零（元，付清时填）</span><input aria-label="抹零" inputMode="decimal" min="0" onChange={(event) => setForm((current) => ({ ...current, roundingAmount: event.target.value }))} placeholder="0" step="0.01" type="number" value={form.roundingAmount} /></label>
        <label><span>付款方式</span><select aria-label="付款方式" onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))} value={form.paymentMethod}>{["银行转账", "微信", "支付宝", "现金", "承兑汇票"].map((method) => <option key={method}>{method}</option>)}</select></label>
        <label><span>流水号 / 财务凭证号</span><input aria-label="流水号或财务凭证号" placeholder={form.paymentMethod === "现金" ? "填写内部财务凭证号" : "有实付时必填"} required={Number(form.paidAmount) > 0} onChange={(event) => setForm((current) => ({ ...current, paymentReferenceNo: event.target.value }))} value={form.paymentReferenceNo} /></label>
        <p className={check.ok ? "supplier-payment-hint" : "supplier-payment-hint warn"}>{check.message}</p>
        <button className="primary" disabled={busy || !check.ok} type="submit">{busy ? "提交中…" : "登记付款"}</button>
      </form> : null}
      {error ? <div className="business-notice danger" role="alert">{error}</div> : null}
    </section>
  </>;
}

function SupplierPeriodFields({ disabled, value, onChange }) {
  return <fieldset disabled={disabled}>
    <legend>对账期间</legend>
    <label>账期开始<input type="date" value={value.periodStart} onChange={(event) => onChange({ ...value, periodStart: event.target.value })} /></label>
    <label>账期结束<input type="date" min={value.periodStart || undefined} value={value.periodEnd} onChange={(event) => onChange({ ...value, periodEnd: event.target.value })} /></label>
  </fieldset>;
}

function SupplierReviewFacts({ record }) {
  return <details>
    <summary>明细和扣项</summary>
    <ul>{(record.rows ?? []).map((row) => <li key={row.id}>
      <strong>{row.documentNo || row.batchNo || row.productName || row.id}</strong>
      {` ${row.documentDate || "日期待核对"} · ${row.color || ""} ${row.spec || ""} ${row.rollLabel || ""} · ${yuan(row.amount)}`}
      {` ${row.sourceReturnInboundId ? `关联退货单 ${row.sourceReturnInboundId}` : row.matchingStatus === "matched" ? `已匹配${row.matchedInboundId ? ` ${row.matchedInboundId}` : ""}` : "待匹配 / 核对"}`}
    </li>)}</ul>
    <ul>{(record.adjustments ?? []).map((item) => <li key={item.id}>
      <strong>{item.label || item.typeLabel}</strong> {item.amount == null ? "金额待确认" : yuan(item.amount)}
      {item.calculationStatus === "different" ? ` 票面 ${yuan(item.supplierReportedAmount)}，计算 ${yuan(item.calculatedAmount)}` : ""}
      {item.isCurrentPeriod === false ? " 历史参考" : ""}
    </li>)}</ul>
    {(record.issues ?? []).length ? <ul>{record.issues.map((item, index) => <li key={item.id || index}>{item.message}</li>)}</ul> : null}
  </details>;
}
