import { useEffect, useRef, useState } from "react";
import { createOfficeIdempotencyKey, packageGroupRequest } from "./packageGroupApiClient.js";
import { isStockOrderType } from "../../../shared/orderRouting.js";
import "./mixed-packages.css";

const retainedRequests = new Map();
let activeIdentity = "";

export function SinglePackingWorkbench({ authState, packingTaskId, orderLineId, onSaved, onBusyChange, disabled = false }) {
  const [detail, setDetail] = useState(null), [count, setCount] = useState("1"), [uniform, setUniform] = useState("");
  const [rows, setRows] = useState([]), [reason, setReason] = useState(""), [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [message, setMessage] = useState(""), [reload, setReload] = useState(0);
  const generation = useRef(0), unknown = useRef(false), sending = useRef(false), restoreFocus = useRef(false), trigger = useRef(null), summary = useRef(null), callbacks = useRef({ onSaved, onBusyChange });
  callbacks.current = { onSaved, onBusyChange };
  const permissions = authState?.permissions?.actionPermissions ?? [];
  const identity = JSON.stringify([authState?.session?.accessToken, authState?.permissions?.user?.userId, [...permissions].sort()]);
  const cacheKey = JSON.stringify([identity, packingTaskId, orderLineId]);
  const request = (path, options = {}) => packageGroupRequest(path, { authState, serverRequired: true, ...options });
  useEffect(() => {
    if (activeIdentity !== identity) { retainedRequests.clear(); activeIdentity = identity; }
    const gen = ++generation.current, controller = new AbortController();
    setDetail(null); setMessage("正在读取本明细打包任务…"); setPending(null); setBusy(false); setUncertain(false); unknown.current = false; sending.current = false;
    setRows([]); setCount("1"); setUniform(""); setReason("");
    if (packingTaskId && orderLineId) request(`/packing-tasks/${encodeURIComponent(packingTaskId)}`, { signal: controller.signal }).then(data => {
      if (generation.current !== gen) return;
      if (data.packingTaskId !== packingTaskId || data.orderLineId !== orderLineId || !data.packingTask || !data.orderLine || !Array.isArray(data.packages) || isStockOrderType(data.orderLine.orderType)) throw Error("任务与本明细不符，请刷新核对；通货请使用混装入口。");
      setDetail(data);
      const retained = retainedRequests.get(cacheKey);
      if (retained) {
        setRows(retained.rows); setReason(retained.reason); setPending(retained.pending); setUncertain(true); unknown.current = true;
        setMessage("已恢复未确认结果的原请求，请按原摘要重试，勿重新登记。");
      } else setMessage("");
    }).catch(error => { if (generation.current === gen && error.code !== "REQUEST_ABORTED") setMessage(error.message); });
    else setMessage("请选择需要单独打包的定制明细。");
    return () => { controller.abort(); if (generation.current === gen) generation.current++; };
    // A task or signed identity change owns a new read and invalidates old callbacks.
  }, [packingTaskId, orderLineId, identity, reload]);
  useEffect(() => { callbacks.current.onBusyChange?.(busy || Boolean(pending)); }, [busy, pending]);
  useEffect(() => () => callbacks.current.onBusyChange?.(false), []);
  useEffect(() => { if (pending) summary.current?.focus(); else if (restoreFocus.current) { restoreFocus.current = false; trigger.current?.focus(); } }, [pending]);
  useEffect(() => {
    if (!busy && !uncertain) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, uncertain]);
  const completed = detail?.packingTask?.status === "已完成" && !pending;
  const locked = disabled || !permissions.includes("packing.complete") || !detail || completed || busy || Boolean(pending);
  const total = rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
  const valid = rows.length > 0 && Number.isSafeInteger(total) && total > 0 && rows.every(row => Number.isSafeInteger(Number(row.qty)) && Number(row.qty) > 0 && row.confirmed) && reason.trim();
  function makeRows() {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 1000) { setMessage("实际包数须为 1 至 1000。"); return; }
    setRows(Array.from({ length: n }, () => ({ qty: "", confirmed: false }))); setMessage("");
  }
  function fillUniform() {
    if (!Number.isSafeInteger(Number(uniform)) || Number(uniform) <= 0) { setMessage("每包数量须为正整数。"); return; }
    setRows(rows.map(() => ({ qty: uniform, confirmed: false }))); setMessage("");
  }
  function prepare() {
    if (locked || !valid) return;
    const body = { packingTaskId, orderLineId, fulfillmentId: detail.fulfillment?.fulfillmentId ?? detail.fulfillment?.id,
      actualPackedQty: total, packageCount: rows.length, packages: rows.map(row => ({ packedQty: Number(row.qty), orderLineId })),
      remark: reason.trim(), idempotencyKey: createOfficeIdempotencyKey() };
    setPending(body); setMessage("");
  }
  function returnToEdit() { if (busy || uncertain) return; restoreFocus.current = true; setPending(null); setMessage(""); }
  async function save() {
    if (!pending || sending.current) return;
    const gen = generation.current, body = pending;
    sending.current = true; setBusy(true);
    retainedRequests.set(cacheKey, { pending: body, rows, reason });
    try {
      const result = await request(`/packing-tasks/${encodeURIComponent(body.packingTaskId)}/complete`, { method: "POST", body, idempotencyKey: body.idempotencyKey });
      if (generation.current !== gen) return;
      if (!result.operationLogId || result.packingTaskId !== body.packingTaskId || result.orderLineId !== body.orderLineId || (body.fulfillmentId && result.fulfillmentId !== body.fulfillmentId) || result.actualPackedQty !== body.actualPackedQty || result.status !== "已完成" || result.inventoryDeducted !== false || !Array.isArray(result.packageIds) || result.packageIds.length !== body.packageCount || result.packageIds.some(id => typeof id !== "string" || !id) || new Set(result.packageIds).size !== body.packageCount) throw Error("打包保存回执不完整，请保留原请求重试，不要重新登记。");
      retainedRequests.delete(cacheKey); unknown.current = false; setUncertain(false); setPending(null);
      setDetail(current => ({ ...current, packingTask: { ...current.packingTask, status: "已完成" }, packages: result.packageIds.map((packageId, index) => ({ packageId, packedQty: body.packages[index].packedQty })) }));
      setMessage(`本明细 ${body.packageCount} 个包裹已保存，等待办公室打印挂牌；保存不代表已打印。`);
      try { await callbacks.current.onSaved?.(result); } catch { if (generation.current === gen) setMessage("包裹已保存，列表刷新失败，可刷新核对本明细。"); }
    } catch (error) {
      if (generation.current !== gen) return;
      const rejected = [403, 409, 422].includes(error.status) && !unknown.current;
      if (rejected) { retainedRequests.delete(cacheKey); restoreFocus.current = true; setPending(null); }
      else { unknown.current = true; setUncertain(true); }
      setMessage(`${error.message}${rejected ? " 本次未接受，填写内容已保留，请核对后再提交。" : " 原摘要与提交编号已保留，只能按原请求重试。"}`);
    } finally { if (generation.current === gen) { sending.current = false; setBusy(false); } }
  }
  return <section className="mixed-package-workbench" aria-label="定制单独打包登记">
    <header><div><h3>定制单独打包</h3><p>只登记本明细的实物包裹，不与其他明细混装。</p></div><button type="button" disabled={busy || Boolean(pending)} onClick={() => setReload(value => value + 1)}>刷新本明细</button></header>
    {message ? <p role="status" className="package-message">{message}</p> : null}
    {detail ? <>
      <p>{detail.orderLine.size} · {detail.orderLine.color || detail.orderLine.bagColor} · {orderLineId}</p>
      {!completed ? <><fieldset disabled={locked}><legend>本明细实际包裹</legend>
        <div className="package-toolbar"><label>实际包数<input type="number" min="1" max="1000" inputMode="numeric" value={count} onChange={event => setCount(event.target.value)} /></label><button type="button" onClick={makeRows}>生成逐包核对表</button><label>每包数量<input type="number" min="1" inputMode="numeric" value={uniform} onChange={event => setUniform(event.target.value)} /></label><button type="button" onClick={fillUniform}>每包填入此数量</button></div>
        {rows.map((row, index) => <div className="package-edit-row" key={index}><h4>第 {index + 1}/{rows.length} 包</h4><label className="package-item-input"><span>本明细数量</span><input aria-label={`第${index + 1}包数量`} type="number" min="1" step="1" inputMode="numeric" value={row.qty} onChange={event => setRows(current => current.map((item, i) => i === index ? { qty: event.target.value, confirmed: false } : item))} /><span>个</span></label><label className="package-confirm"><input type="checkbox" checked={row.confirmed} onChange={event => setRows(current => current.map((item, i) => i === index ? { ...item, confirmed: event.target.checked } : item))} />我已对照本包实物核实本明细数量</label></div>)}
        <label className="package-reason">登记依据<textarea aria-label="登记依据" maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
      </fieldset><p>实装 {total} / 计划 {detail.packingTask.plannedQty} 个{total !== Number(detail.packingTask.plannedQty) ? "；有差异，保存后待办公室核对。" : ""}</p>
      {pending ? <div className="package-fixed-summary" role="region" aria-label="确认本明细单独打包" ref={summary} tabIndex={-1} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); returnToEdit(); } }}><strong>即将保存 {pending.packageCount} 包，共 {pending.actualPackedQty} 个</strong><p>{pending.packages.map((item, index) => `第${index + 1}包 ${item.packedQty}个`).join("；")}。依据：{pending.remark}</p><p>仅更新本明细和独立包码，不扣库存；挂牌仍需真实打印。</p><button type="button" disabled={busy} onClick={() => void save()}>{busy ? "正在保存…" : "确认保存 / 原请求重试"}</button><button type="button" disabled={busy || uncertain} onClick={returnToEdit}>返回修改</button></div> : <button type="button" className="package-primary" disabled={locked || !valid} ref={trigger} onClick={prepare}>核对并登记本明细包裹</button>}
      </> : <><h4>本明细已保存的包裹</h4><ol>{detail.packages.map(item => <li key={item.packageId}>{item.packedQty} 个 · {item.packageId}</li>)}</ol></>}
    </> : null}
  </section>;
}
