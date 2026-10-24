import { useEffect, useRef, useState } from "react";
import { getOfficeOrderPrintGroup, previewOfficeOrderPrintGroupCorrection, correctOfficeOrderPrintGroup } from "../../../../src/services/officeOrderPrintGroupApiClient.js";
import { createOfficeIdempotencyKey } from "../../../../src/services/officeApiClientCore.js";
import { financeSessionKey, hasFinancePermission, money } from "./finance-dialog-model.js";
import { ReviewDialog } from "./ReviewDialog.jsx";
import "./finance-dialogs.css";

// Deliberately memory-only: keep the exact unresolved write across remounts of
// this signed session, without persisting access tokens or business data on disk.
const unresolvedCorrections = new Map();
const unit = value => typeof value === "number" && Number.isFinite(value) ? `¥${value.toFixed(4)}` : "待核实";
const actionLabel = { keep: "保留", reduce: "减量", void: "作废本行" };
const dialogStyles = `.finance-dialog.print-group-correction-dialog { --blue: var(--orange); --blue-strong: var(--orange); }
.finance-dialog.print-group-correction-dialog button.primary { color: var(--nav); box-shadow: none; }
.print-group-correction-dialog input[type="checkbox"] { accent-color: var(--orange); }
.print-group-correction-dialog table { min-width: 720px; font-variant-numeric: tabular-nums; }
.print-group-correction-dialog tbody th { background: var(--surface); font-weight: 500; }
.print-group-correction-dialog input[inputmode="numeric"] { min-width: 90px; }
.print-group-correction-dialog caption { text-align: left; padding: 8px 0; }`;

export function OrderPrintGroupCorrectionDialog(props) {
  const identity = financeSessionKey(props.orderLineId, props.authState);
  return <CorrectionForm key={identity} {...props} identity={identity} />;
}

function CorrectionForm({ orderLineId, authState, onClose, onSaved, onPendingChange, identity }) {
  const recovered = unresolvedCorrections.get(identity);
  const [group, setGroup] = useState(recovered?.input.group ?? null);
  const [edits, setEdits] = useState(recovered?.edits ?? {});
  const [mode, setMode] = useState(recovered?.input.mode ?? "amend");
  const [reason, setReason] = useState(recovered?.input.reason ?? "");
  const [preview, setPreview] = useState(recovered?.input.preview ?? null);
  const [checked, setChecked] = useState(recovered?.checked ?? []);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(recovered ? "上次更正尚未取得完整回执，请按原请求重试。" : "");
  const [pending, setPending] = useState(Boolean(recovered));
  const [done, setDone] = useState(null);
  const live = useRef(false), inFlight = useRef(false), generation = useRef(0);
  const request = useRef(recovered ?? null), readAbort = useRef(null);
  const callbacks = useRef({ onClose, onSaved, onPendingChange });
  callbacks.current = { onClose, onSaved, onPendingChange };

  async function load() {
    if (request.current || inFlight.current) return;
    inFlight.current = true;
    const ticket = ++generation.current;
    const controller = new AbortController();
    readAbort.current = controller;
    setBusy("read"); setError(""); setGroup(null); setPreview(null); setChecked([]);
    const result = await getOfficeOrderPrintGroup({ orderLineId, authState }, { signal: controller.signal });
    if (!live.current || ticket !== generation.current || readAbort.current !== controller) return;
    readAbort.current = null;
    inFlight.current = false; setBusy("");
    if (result.source === "api" && !result.blocked) {
      setGroup(result);
      setEdits(Object.fromEntries(result.members.map(row => [row.orderLineId, { qty: String(row.qty), void: false }])));
    } else setError(result.error?.message || "完整印刷组暂时未读取成功，请重新读取。");
  }

  useEffect(() => {
    live.current = true;
    if (!recovered) void load();
    return () => {
      live.current = false; generation.current++;
      // StrictMode replays setup after cleanup. Release only the read owned by
      // this effect; an unresolved write keeps its original request and lock.
      const activeRead = readAbort.current;
      if (activeRead) {
        readAbort.current = null;
        activeRead.abort();
        inFlight.current = false;
      }
    };
  }, []);
  useEffect(() => {
    if (!pending) return;
    callbacks.current.onPendingChange?.(true, request.current.ownerKey);
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  const locked = Boolean(busy) || pending || Boolean(preview) || Boolean(done);
  const rows = group?.members ?? [];
  const members = rows.map(row => ({
    orderLineId: row.orderLineId, expectedRevision: row.revision,
    newQty: mode === "void_all" || edits[row.orderLineId]?.void ? row.qty : Number(edits[row.orderLineId]?.qty),
    void: mode === "void_all" || edits[row.orderLineId]?.void === true,
  }));
  const reduces = members.some((row, index) => !row.void && row.newQty < rows[index].qty);
  const voids = members.some(row => row.void);
  const allowed = (!reduces || hasFinancePermission(authState, "order.quantity.adjust")) &&
    (!voids || hasFinancePermission(authState, "order.void")) &&
    (hasFinancePermission(authState, "order.quantity.adjust") || hasFinancePermission(authState, "order.void"));

  function dismiss() {
    if (inFlight.current || request.current || busy || pending) return;
    if (preview && !done) { setPreview(null); setChecked([]); setError(""); return; }
    callbacks.current.onClose?.();
  }
  function editLine(id, change) {
    if (locked) return;
    setEdits(current => ({ ...current, [id]: { ...current[id], ...change } }));
    setError("");
  }
  async function prepare(event) {
    event.preventDefault();
    if (inFlight.current || request.current || !group?.canCorrect || !allowed || preview || done) return;
    if (!reason.trim()) { setError("请填写本次减量或作废的实际原因。"); return; }
    for (const row of members) {
      const prior = rows.find(member => member.orderLineId === row.orderLineId);
      if (!row.void && (!/^\d+$/u.test(edits[row.orderLineId]?.qty ?? "") || !Number.isSafeInteger(row.newQty) || row.newQty <= 0 || row.newQty > prior.qty)) {
        setError("新数量须为不超过原数量的正整数；不需要本行时请选择“作废本行”。"); return;
      }
    }
    if (!reduces && !voids) { setError("尚未减少数量或作废明细，无需提交。"); return; }
    inFlight.current = true; setBusy("preview"); setError("");
    const input = { orderLineId, authState, group, expectedGroupRevision: group.groupRevision, members, mode, reason: reason.trim() };
    const result = await previewOfficeOrderPrintGroupCorrection(input);
    if (!live.current) return;
    inFlight.current = false; setBusy("");
    if (result.source === "api" && !result.blocked) { setPreview(result); setChecked([]); }
    else setError(result.error?.message || "未能核对整组更正，请重新读取后重试。");
  }
  async function submit() {
    if (inFlight.current || done || !preview || !allowed || (!request.current && checked.length !== rows.length)) return;
    const frozen = request.current ?? {
      ownerKey: `print-group-correction:${createOfficeIdempotencyKey()}`,
      input: structuredClone({ orderLineId, authState, group, expectedGroupRevision: group.groupRevision, members, mode,
        reason: reason.trim(), preview, previewHash: preview.previewHash, idempotencyKey: createOfficeIdempotencyKey() }),
      edits: structuredClone(edits), checked: [...checked], uncertain: false,
    };
    request.current = frozen;
    unresolvedCorrections.set(identity, frozen);
    inFlight.current = true; setBusy("save"); setPending(true); setError("");
    callbacks.current.onPendingChange?.(true, frozen.ownerKey);
    let result;
    try { result = await correctOfficeOrderPrintGroup(frozen.input); } catch { result = null; }
    if (!live.current) { frozen.uncertain = true; return; }
    inFlight.current = false; setBusy("");
    if (result?.source === "api" && !result.blocked) {
      request.current = null; unresolvedCorrections.delete(identity); setPending(false); setDone(result);
      callbacks.current.onPendingChange?.(false, frozen.ownerKey);
      try {
        const refreshed = await callbacks.current.onSaved?.(result);
        if (live.current && refreshed?.source === "api_partial") setError("整组更正已保存，但部分列表未刷新，请重新读取服务器数据核对。");
      } catch { if (live.current) setError("整组更正已保存，列表刷新失败；请重新读取服务器数据核对。"); }
    } else if (!frozen.uncertain && result?.error?.definitive === true) {
      request.current = null; unresolvedCorrections.delete(identity); setPending(false); setPreview(null); setChecked([]);
      callbacks.current.onPendingChange?.(false, frozen.ownerKey);
      setError(`${result.error.message} 输入已保留，请重新读取完整组后核对。`);
    } else {
      frozen.uncertain = true;
      setError("更正结果尚未确认，全部内容已锁定。请按原请求重试，取得服务器完整回执前不要重复办理。");
    }
  }

  return <ReviewDialog className="finance-dialog print-group-correction-dialog" labelledBy="print-group-correction-title" onClose={dismiss}>
    <style>{dialogStyles}</style>
    <header><div><span>{rows[0]?.customerName || "订单明细"} · {orderLineId}</span><h2 id="print-group-correction-title">整组印刷订单更正</h2><p>完整组一起核对，沿用各行已确认单价。</p></div><button type="button" aria-label="关闭整组更正" disabled={Boolean(busy) || pending} onClick={dismiss}>×</button></header>
    <div className="finance-dialog-content">
      {!group && busy === "read" ? <p role="status">正在读取完整印刷组和当前金额…</p> : null}
      {!group && !busy ? <button type="button" onClick={() => void load()}>重新读取完整组</button> : null}
      {group ? <>
        <p className="finance-muted">减量保留原袋子、印刷单价，不重新套用阶梯。作废本行只取消该明细；“作废全组”仅取消下面列出的组成员。</p>
        {group.blockers.length ? <section aria-label="暂不能更正的原因"><h3>请先处理以下事项</h3><ul>{group.blockers.map((item, index) => <li key={`${item.code}-${item.orderLineId}-${index}`}>{item.orderLineId ? `${item.orderLineId}：` : ""}{item.message}</li>)}</ul></section> : null}
        {done ? <section className="finance-notice" role="status"><h3>整组更正已保存</h3><p>更正后合计 {done.totals.newQty} 个，金额 {money(done.totals.finalAmount)}。原价格和变更记录均已保留。</p><p>未开始的保留任务已退回待排产，请重新核对排产；作废明细的未执行任务已关闭。</p></section> : <form onSubmit={prepare}>
          <fieldset disabled={locked || !group.canCorrect}>
            <label>更正范围<select aria-label="更正范围" value={mode} onChange={event => { setMode(event.target.value); setError(""); }}><option value="amend">逐条减量或作废</option><option value="void_all">作废全组明细</option></select></label>
            <div className="finance-table-scroll"><table><caption className="finance-muted">当前组共 {rows.length} 条明细，全部列入本次核对</caption><thead><tr><th scope="col">订单明细 / 货品</th><th scope="col">原数量 / 原金额</th><th scope="col">冻结单价</th><th scope="col">本次动作</th><th scope="col">新数量（个）</th></tr></thead><tbody>{rows.map(row => <tr key={row.orderLineId}>
              <th scope="row">{row.orderLineId}<p>{row.product} · {row.size} · {row.color}</p><p className="finance-muted">{row.status}</p></th>
              <td>{row.qty} 个<p>{money(row.amount)}</p></td><td>袋子 {unit(row.bagPrice)}<p>印刷 {unit(row.printPrice)}</p></td>
              <td><select aria-label={`${row.orderLineId} 更正动作`} value={mode === "void_all" || edits[row.orderLineId]?.void ? "void" : "keep"} disabled={mode === "void_all"} onChange={event => editLine(row.orderLineId, { void: event.target.value === "void" })}><option value="keep">保留或减量</option><option value="void">作废本行</option></select></td>
              <td>{mode === "void_all" || edits[row.orderLineId]?.void ? "作废后不再生产、交付" : <input type="text" aria-label={`${row.orderLineId} 新数量`} inputMode="numeric" value={edits[row.orderLineId]?.qty ?? ""} onChange={event => editLine(row.orderLineId, { qty: event.target.value })} required />}</td>
            </tr>)}</tbody></table></div>
            <label className="finance-span">更正原因<textarea aria-label="整组更正原因" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} required rows={2} /></label>
          </fieldset>
          {!allowed ? <p className="finance-warning">当前账号缺少本次所需的{reduces ? "改量" : ""}{reduces && voids ? "和" : ""}{voids ? "作废" : !reduces ? "订单更正" : ""}权限。</p> : null}
          {preview ? <section className="finance-confirm" aria-label="整组更正最终核对"><h3>{mode === "void_all" ? "确认作废全组明细" : "逐条确认更正结果"}</h3>
            <p>单价保持不变。请核对每一行的数量和金额，包括未改动的组成员。</p>
            <div className="finance-table-scroll"><table><thead><tr><th scope="col">逐行确认</th><th scope="col">动作</th><th scope="col">数量变化</th><th scope="col">金额变化</th></tr></thead><tbody>{preview.members.map(row => <tr key={row.orderLineId}>
              <th scope="row"><label className="finance-check"><input type="checkbox" aria-label={`确认 ${row.orderLineId} 的数量和金额`} checked={checked.includes(row.orderLineId)} disabled={Boolean(busy) || pending} onChange={event => setChecked(current => event.target.checked ? [...new Set([...current, row.orderLineId])] : current.filter(id => id !== row.orderLineId))} />{row.orderLineId}</label></th><td>{actionLabel[row.action]}</td><td>{row.previousQty} → {row.newQty} 个</td><td>{money(row.previousAmount)} → {money(row.finalAmount)}</td>
            </tr>)}</tbody></table></div>
            <dl><div><dt>原数量</dt><dd>{preview.totals.previousQty} 个</dd></div><div><dt>更正后数量</dt><dd>{preview.totals.newQty} 个</dd></div><div><dt>原金额</dt><dd>{money(preview.totals.previousAmount)}</dd></div><div><dt>更正后金额</dt><dd>{money(preview.totals.finalAmount)}</dd></div></dl>
            <p>原因：{preview.reason}</p><p>所有组成员同步留存新版本。减量后的未开始任务退回待排产，原排产撤下后需重新确认；作废行关闭未执行任务并释放占用。已生产、实包、实际出库、有效纸单或已有账单的记录由服务器阻止直接更正。</p>
            <div className="finance-actions"><button type="button" disabled={Boolean(busy) || pending} onClick={() => { setPreview(null); setChecked([]); setError(""); }}>返回修改</button><button type="button" className="primary" disabled={Boolean(busy) || !allowed || (!pending && checked.length !== rows.length)} onClick={() => void submit()}>{busy === "save" ? "正在保存整组更正…" : pending ? "按原请求重试" : "确认整组更正"}</button></div>
          </section> : <div className="finance-actions"><button type="button" disabled={Boolean(busy) || pending} onClick={() => void load()}>重新读取完整组</button><button type="submit" className="primary" disabled={Boolean(busy) || pending || !group.canCorrect || !allowed}>{busy === "preview" ? "正在核对…" : "核对整组更正"}</button></div>}
        </form>}
      </> : null}
      {error ? <p className="finance-error" role="alert">{error}</p> : null}
    </div><footer><button type="button" disabled={Boolean(busy) || pending} onClick={dismiss}>{preview && !done ? "返回修改" : "关闭"}</button></footer>
  </ReviewDialog>;
}
