import { useEffect, useRef, useState } from "react";
import { readOfficeDeliveryExceptionContext, resolveOfficeDriverDeliveryException } from "../../services/officeFulfillmentApiClient.js";
import "./driver-exception-resolution.css";

export function DriverExceptionResolutionPanel(props) {
  return <ResolutionForm key={`${props.fulfillmentId}:${props.authState?.session?.accessToken || ""}`} {...props} />;
}

function ResolutionForm({ authState, fulfillmentId, onResolved }) {
  const allowed = authState?.permissions?.actionPermissions?.includes("delivery.exception.resolve") === true;
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [exceptionId, setExceptionId] = useState("");
  const [quantityVerified, setQuantityVerified] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const alive = useRef(true);
  const dialog = useRef(null);
  const confirmationTrigger = useRef(null);
  const dialogWasOpen = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setRecord(null); setConfirmation(null); setQuantityVerified(false);
    readOfficeDeliveryExceptionContext({ authState, fulfillmentId }).then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.blocked) { setError(result.error?.message || "读取失败，请重试。"); return; }
      setRecord(result.item);
      setExceptionId((result.item.deliveryExceptions || []).find((item) => !["已解决", "已作废"].includes(item.status))?.exceptionId || "");
    });
    return () => { active = false; };
  }, [fulfillmentId, revision, allowed]);
  useEffect(() => {
    if (confirmation) {
      dialog.current?.showModal();
      dialogWasOpen.current = true;
    } else if (dialogWasOpen.current) {
      dialog.current?.close();
      dialogWasOpen.current = false;
      confirmationTrigger.current?.focus?.();
    }
  }, [confirmation]);
  const pending = (record?.deliveryExceptions || []).filter((item) => !["已解决", "已作废"].includes(item.status));
  const selected = pending.find((item) => item.exceptionId === exceptionId);
  const nextStatus = pending.length > 1 ? "仍待处理其他异常" : record?.loadedAt ? "继续配送" : "重新核对装车";
  async function submit() {
    if (!confirmation || submitting || !allowed) return;
    setSubmitting(true); setError("");
    const result = await resolveOfficeDriverDeliveryException({ authState, fulfillmentId, ...confirmation.payload });
    if (!alive.current) return;
    setSubmitting(false);
    if (result.blocked) { setError(result.error?.message || "提交失败，请重试。"); return; }
    setConfirmation(null); setNotice(`已处理异常：${result.status}`);
    setReason(""); setRevision((value) => value + 1);
    onResolved?.(`已处理送货异常：${result.status}`);
  }
  return <section className="driver-exception-resolution" aria-label="送货异常处理">
    <h3>送货异常处理</h3>
    {loading ? <p role="status">正在读取原异常与出库事实…</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {!allowed ? <p>当前账号无送货异常处理权限。</p> : null}
    {!loading && record && pending.length === 0 ? <p>当前没有待处理的送货异常。</p> : null}
    {selected ? <>
      <label>原异常<select disabled={Boolean(confirmation)} value={exceptionId} onChange={(event) => { setExceptionId(event.target.value); setQuantityVerified(false); }}>
        {pending.map((item) => <option key={item.exceptionId} value={item.exceptionId}>{item.reason} · {item.occurredAt || "时间待核实"}</option>)}
      </select></label>
      <p>原应出 {selected.expectedQty ?? "待核实"}；司机实见 {selected.actualQty ?? "待核实"}；已登记实出 {record.actualQty ?? "待核实"}。</p>
      <label>处理说明<textarea value={reason} maxLength={500} disabled={Boolean(confirmation)} onChange={(event) => setReason(event.target.value)} placeholder="记录与司机、客户或库房核实的结果" /></label>
      <label className="driver-exception-resolution-check"><input type="checkbox" checked={quantityVerified} disabled={Boolean(confirmation)} onChange={(event) => setQuantityVerified(event.target.checked)} />已核对原出库数量、包裹与单据，可以按原数量继续执行</label>
      <button ref={confirmationTrigger} type="button" disabled={!allowed || loading || Boolean(confirmation) || !quantityVerified || reason.trim().length < 2} onClick={() => setConfirmation({
        customer: record.customerName, goods: record.goodsSpec, exception: selected.reason, nextStatus,
        quantity: record.actualQty, expectedQty: selected.expectedQty, observedQty: selected.actualQty,
        payload: { expectedRevision: record.revision, exceptionId, reason: reason.trim(), quantityVerified: true, confirmed: true, idempotencyKey: `driver-resolution-${crypto.randomUUID()}` },
      })}>核对并确认处理</button>
    </> : null}
    <button type="button" disabled={submitting || Boolean(confirmation)} onClick={() => setRevision((value) => value + 1)}>重新读取</button>
    <dialog ref={dialog} aria-label="确认送货异常处理" onCancel={(event) => { event.preventDefault(); if (!submitting) setConfirmation(null); }}>
      {confirmation ? <><h3>确认送货异常处理</h3>
        <p>{fulfillmentId} · {confirmation.customer} · {confirmation.goods}</p>
        <p>原异常：{confirmation.exception}</p>
        <p>原应出 {confirmation.expectedQty ?? "待核实"}；司机实见 {confirmation.observedQty ?? "待核实"}；原实出 {confirmation.quantity ?? "待核实"}。</p>
        <p>{confirmation.payload.reason}</p><p>处理后：{confirmation.nextStatus}。保留原异常和处理记录，不改变出库数量、库存或账款。</p>
        {error ? <p role="alert">{error}</p> : null}
        <div><button type="button" disabled={submitting} onClick={() => setConfirmation(null)}>返回修改</button><button type="button" disabled={submitting || !allowed} onClick={submit}>{submitting ? "正在提交…" : "确认处理"}</button></div>
      </> : null}
    </dialog>
  </section>;
}
