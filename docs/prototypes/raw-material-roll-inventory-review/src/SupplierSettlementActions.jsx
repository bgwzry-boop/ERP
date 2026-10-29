import { useEffect, useState } from "react";
import { confirmInApp } from "../../../../src/shared/ui/confirmDialog.js";
import {
  nextSupplierSettlementAction,
  supplierPaymentRecords,
  supplierPaymentTotals,
  validateSupplierPaymentForm,
} from "./supplier-settlement-model.js";

const yuan = (value) => `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const errorText = (result, fallback) => result?.error?.message || fallback;

export function SupplierStatementUpload({ formal, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    setError("");
    const checked = await formal.actions.precheckSupplierStatement(file);
    setBusy(false);
    if (checked.source !== "local_precheck") {
      setError(errorText(checked, "对账单识别失败。"));
      return;
    }
    setPreview(checked.result);
  }

  async function save() {
    if (!preview || busy) return;
    setBusy(true);
    const result = await formal.actions.saveSupplierStatementReviewDraft(preview);
    setBusy(false);
    if (result?.source !== "api") {
      setError(errorText(result, "保存对账单失败。"));
      return;
    }
    setPreview(null);
    onSaved?.(result.review);
  }

  const summary = preview?.summary || {};
  const blocking = (preview?.issues || []).filter((issue) => issue.severity === "error");
  return <>
    <label className={`supplier-upload-button${busy ? " busy" : ""}`}>
      {busy ? "处理中…" : "上传月结 Excel"}
      <input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="上传供应商月结 Excel" disabled={busy} onChange={handleFile} type="file" />
    </label>
    {error ? <div className="business-notice danger" role="alert">{error}</div> : null}
    {preview ? <section aria-label="对账单预检" className="supplier-upload-preview">
      <header><strong>{preview.fileName || "供应商月结 Excel"}</strong><span>{preview.adapter?.label || "通用模板"}</span></header>
      <p>共 {summary.rowCount || 0} 行：匹配 {summary.matchedRowCount || 0}，待确认 {summary.candidateRowCount || 0}，未匹配 {summary.unmatchedRowCount || 0}；金额合计 {yuan(summary.totalAmount)}。</p>
      {blocking.length ? <ul className="supplier-upload-issues">{blocking.slice(0, 3).map((issue, index) => <li key={index}>{issue.message}</li>)}</ul> : null}
      <footer>
        <button onClick={() => setPreview(null)} type="button">取消</button>
        <button className="primary" disabled={busy || blocking.length > 0} onClick={save} title={blocking.length ? "对账单有阻断问题，不能保存" : ""} type="button">保存，开始核对</button>
      </footer>
    </section> : null}
  </>;
}

export function SupplierSettlementActionPanel({ record, formal, onNotice }) {
  const action = nextSupplierSettlementAction(record);
  const totals = supplierPaymentTotals(record);
  const records = supplierPaymentRecords(record);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ paidAmount: "", roundingAmount: "", paymentMethod: "银行转账", paymentReferenceNo: "", note: "" });
  useEffect(() => {
    setError("");
    setForm({ paidAmount: totals.remaining ? String(totals.remaining) : "", roundingAmount: "", paymentMethod: "银行转账", paymentReferenceNo: "", note: "" });
  }, [record?.reviewId, record?.revision, totals.remaining]);

  async function run(label, write, success) {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await write();
    setBusy(false);
    if (result?.source !== "api") {
      setError(errorText(result, `${label}失败。`));
      return;
    }
    onNotice?.(success);
  }

  const id = record?.reviewId;
  const check = validateSupplierPaymentForm(record, form);
  const paymentRows = records.length ? <section className="business-detail-section"><h3>付款记录</h3><ol className="supplier-payment-history">{records.map((item, index) => <li key={item.supplierPaymentConfirmationId || index}>
    <strong>第 {item.installmentNo || index + 1} 笔</strong><span>{yuan(item.paidAmount)}{Number(item.roundingAmount) > 0 ? ` · 抹零 ${yuan(item.roundingAmount)}` : ""}</span><small>{item.paymentMethod || "银行转账"}{item.paymentReferenceNo ? ` · ${item.paymentReferenceNo}` : ""}{item.paidAt ? ` · ${String(item.paidAt).slice(0, 10)}` : ""}</small>
  </li>)}</ol></section> : null;

  if (!action) return <>{paymentRows}<p className="supplier-action-done">该月结已付清，无需操作。</p></>;
  if (action.key.startsWith("blocked")) return <>{paymentRows}<p className="supplier-action-blocked">{action.label}</p></>;

  return <>
    {paymentRows}
    <section aria-label="下一步操作" className="business-detail-section supplier-next-action">
      <h3>下一步：{action.label}</h3>
      {action.key === "review" ? <div className="supplier-action-row">
        <button className="primary" disabled={busy} onClick={async () => {
          if (!await confirmInApp("确认这份对账单与系统里的入库记录一致？")) return;
          run("核对", () => formal.actions.confirmSupplierStatementReview(id, "一致"), "已标记为一致，下一步确认对账。");
        }} type="button">核对一致</button>
        <button disabled={busy} onClick={async () => {
          if (!await confirmInApp("标记为有差异？需要和供应商核实后重新上传对账单。")) return;
          run("核对", () => formal.actions.confirmSupplierStatementReview(id, "有差异"), "已标记为有差异，请与供应商核实。");
        }} type="button">有差异</button>
      </div> : null}
      {action.key === "confirm-statement" ? <button className="primary" disabled={busy} onClick={async () => {
        if (!await confirmInApp("确认对账？确认后进入待付款，本步不会付款。")) return;
        run("确认对账", () => formal.actions.confirmSupplierStatement(id), "对账已确认，下一步生成应付。");
      }} type="button">确认对账</button> : null}
      {action.key === "generate-payable" ? <button className="primary" disabled={busy} onClick={async () => {
        if (!await confirmInApp("按已确认的对账金额生成应付？")) return;
        run("生成应付", () => formal.actions.generateSupplierPayable(id), "应付已生成，可以登记付款。");
      }} type="button">生成应付</button> : null}
      {action.key === "pay" ? <form className="supplier-payment-form" onSubmit={async (event) => {
        event.preventDefault();
        if (!check.ok) { setError(check.message); return; }
        if (!await confirmInApp(`确认登记：${check.message}\n不会影响原材料库存。`)) return;
        run("登记付款", () => formal.actions.confirmSupplierPayment(id, { ...form, paidAmount: check.paidAmount, roundingAmount: check.roundingAmount }), check.clears ? "已付清。" : `已登记，剩余 ${yuan(check.remainingAfter)}。`);
      }}>
        <dl className="business-facts"><div><dt>应付</dt><dd>{yuan(totals.payable)}</dd></div><div><dt>已付</dt><dd>{yuan(totals.paid)}</dd></div><div><dt>已抹零</dt><dd>{yuan(totals.rounding)}</dd></div><div><dt>剩余未付</dt><dd><strong>{yuan(totals.remaining)}</strong></dd></div></dl>
        <label><span>本次实付（元）</span><input aria-label="本次实付" inputMode="decimal" min="0" onChange={(event) => setForm((current) => ({ ...current, paidAmount: event.target.value }))} step="0.01" type="number" value={form.paidAmount} /></label>
        <label><span>抹零（元，付清时填）</span><input aria-label="抹零" inputMode="decimal" min="0" onChange={(event) => setForm((current) => ({ ...current, roundingAmount: event.target.value }))} placeholder="0" step="0.01" type="number" value={form.roundingAmount} /></label>
        <label><span>付款方式</span><select aria-label="付款方式" onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))} value={form.paymentMethod}>{["银行转账", "微信", "支付宝", "现金", "承兑汇票"].map((method) => <option key={method}>{method}</option>)}</select></label>
        <label><span>流水号 / 凭证号（选填）</span><input aria-label="流水号" onChange={(event) => setForm((current) => ({ ...current, paymentReferenceNo: event.target.value }))} value={form.paymentReferenceNo} /></label>
        <p className={check.ok ? "supplier-payment-hint" : "supplier-payment-hint warn"}>{check.message}</p>
        <button className="primary" disabled={busy || !check.ok} type="submit">{busy ? "提交中…" : "登记付款"}</button>
      </form> : null}
      {error ? <div className="business-notice danger" role="alert">{error}</div> : null}
    </section>
  </>;
}
