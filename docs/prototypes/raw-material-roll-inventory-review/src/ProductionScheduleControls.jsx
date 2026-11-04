import { useEffect, useRef, useState } from "react";
import { listOfficeProductionMachineQueue, publishOfficeProductionSchedule, resequenceOfficeProductionMachineQueue } from "../../../../src/services/officeProductionPackingLazyApi.js";
import { createOfficeIdempotencyKey } from "../../../../src/services/officeApiClientCore.js";
import { releaseSilkScreenTask } from "../../../../src/services/silkScreenClaimApiClient.js";
import { setEarlyShipmentRequest, splitForEarlyShipment } from "../../../../src/services/earlyShipmentApiClient.js";
import { DelegatedBusinessDecisionFields, isDelegatedBusinessDecisionComplete } from "../../../../src/components/DelegatedBusinessDecisionFields.jsx";
import { eligibleProductionMachines, isSelectedProductionMachineAllowed } from "./production-machine-options.js";

// Adapted from the old branch; keep the current API authority, delegation,
// revision checks and a frozen request when transport results are uncertain.
export function ProductionScheduleControls({ selected, formal, onSaved }) {
  const raw = selected?.sourceTask || {};
  const task = raw.productionTask || raw;
  const line = selected?.sourceOrderLine || raw.orderLine || {};
  const permissions = formal.permissionContext?.actionPermissions || [];
  const direct = permissions.includes("production.schedule.direct");
  const [machineId, setMachineId] = useState(task.machineId || "");
  const [qty, setQty] = useState(String(task.plannedQty ?? line.qty ?? ""));
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState({});
  const [queueDecision, setQueueDecision] = useState({});
  const [queue, setQueue] = useState(null);
  const [queueId, setQueueId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const attempt = useRef(null);
  const pending = useRef(false);
  const live = useRef(false);
  const queueVersion = useRef(0);
  const authState = formal.authState;
  const operatorId = formal.permissionContext?.user?.userId;
  const processType = task.taskType || (line.printFlag || line.print === "是" ? "丝印" : "制袋");
  const machines = eligibleProductionMachines(formal.data.machines, processType);
  const selectedMachineAllowed = isSelectedProductionMachineAllowed(machines, machineId);
  const currentQueue = queue?.machines?.find(item => item.machineId === machineId)?.items || [];
  const chosenId = currentQueue.some(item => item.productionTaskId === queueId) ? queueId : currentQueue[0]?.productionTaskId || "";
  const chosenIndex = currentQueue.findIndex(item => item.productionTaskId === chosenId);
  const validQty = /^\d+$/.test(qty) && Number.isSafeInteger(Number(qty)) && Number(qty) > 0;
  const decisionReady = reason.trim() && (direct || isDelegatedBusinessDecisionComplete(decision));
  const queueDecisionReady = reason.trim() && (direct || isDelegatedBusinessDecisionComplete(queueDecision));
  const scheduleId = task.publishedScheduleId || task.scheduleId;
  const awaitingSchedule = /待排产|待排定|未排定/.test(String(task.taskStatus || task.status || selected?.status || ""));
  const locked = busy || uncertain;

  async function loadQueue() {
    const version = ++queueVersion.current;
    const result = await listOfficeProductionMachineQueue({ authState, operatorId }, { serverRequired: true });
    if (live.current && queueVersion.current === version) setQueue(result);
  }
  useEffect(() => { live.current = true; void loadQueue(); return () => { live.current = false; queueVersion.current += 1; }; }, [authState?.session?.accessToken]);

  async function write(kind, payload) {
    if (pending.current) return;
    attempt.current ||= { kind, payload: { ...payload, authState, operatorId, idempotencyKey: createOfficeIdempotencyKey() } };
    pending.current = true; setBusy(true); setMessage("");
    let result;
    try {
      const send = attempt.current.kind === "publish" ? publishOfficeProductionSchedule : resequenceOfficeProductionMachineQueue;
      result = await send(attempt.current.payload, { serverRequired: true });
    } catch { result = null; }
    if (!live.current) return;
    pending.current = false; setBusy(false);
    if (result?.source === "api" && !result.blocked && result.operationLogId) {
      attempt.current = null; setUncertain(false); setReason("");
      setMessage("服务器已保存排产安排，正在刷新任务与机台队列。");
      await loadQueue(); await onSaved?.();
    } else {
      const code = result?.error?.code || "";
      const unknown = !code || result?.source === "api" || /UNAVAILABLE|UNCONFIRMED|TIMEOUT/.test(code) || Number(result?.error?.status) >= 500;
      setUncertain(unknown);
      if (!unknown) { attempt.current = null; await loadQueue(); }
      setMessage(unknown ? "提交结果尚未确认，请按原内容重试；离开后先核对服务器排产，勿重复安排。" : result?.error?.message || "排产未保存，请刷新核对。");
    }
  }
  function decisionPayload(value = decision) { return direct ? { directDecisionContent: { summary: reason.trim() } } : { delegatedDecision: value }; }
  function publish() {
    if (locked || !permissions.includes("production.schedule.publish") || !decisionReady || !validQty || !selectedMachineAllowed || scheduleId || !awaitingSchedule) return;
    void write("publish", { orderLine: line, productionTaskId: task.productionTaskId || selected.id,
      machineId, processType,
      plannedQty: Number(qty), expectedRevision: Number(task.revision ?? raw.revision ?? 1),
      ...decisionPayload(), remark: reason.trim() });
  }
  function move(direction) {
    if (locked || !permissions.includes("production.schedule.sequence.update") || !queueDecisionReady || queue?.source !== "api") return;
    const target = chosenIndex + direction;
    if (chosenIndex < 0 || target < 0 || target >= currentQueue.length) return;
    const next = [...currentQueue]; [next[chosenIndex], next[target]] = [next[target], next[chosenIndex]];
    void write("queue", { machineId, orderedProductionTaskIds: next.map(item => item.productionTaskId),
      affectedRevisions: currentQueue.map(item => ({ productionTaskId: item.productionTaskId, revision: Number(item.revision ?? 1) })),
      expectedRevision: currentQueue.reduce((sum, item) => sum + Number(item.revision ?? 1), 0),
      ...decisionPayload(queueDecision), remark: reason.trim() });
  }
  if (!selected) return <section><h3>办公室排产</h3><p>选择生产任务后安排机台。</p></section>;
  if (String(task.claimedByUserId || "").trim()) return <SilkScreenClaimNotice task={task} authState={authState} canRelease={permissions.includes("production.schedule.publish")} onSaved={onSaved} />;
  return <section className="business-detail-section production-schedule-controls" aria-label="办公室排产">
    <h3>办公室排产</h3>
    {scheduleId ? <p>已发布排产：{scheduleId}</p> : null}
    <label>生产机台<select value={machineId} disabled={locked} onChange={event => { setMachineId(event.target.value); setQueueDecision({}); }}><option value="">选择机台</option>{machines.map(machine => { const id = machine.machineId || machine.id; return <option key={id} value={id}>{machine.name || machine.machineLabel || id}</option>; })}</select></label>
    {!scheduleId && awaitingSchedule ? <label>排产数量（个）<input type="number" min="1" step="1" value={qty} disabled={locked} onChange={event => setQty(event.target.value)} /></label> : null}
    <label>安排或调整依据<textarea value={reason} maxLength={500} disabled={locked} onChange={event => setReason(event.target.value)} placeholder="说明机台安排和交期依据" /></label>
    {!direct && !scheduleId && awaitingSchedule ? <DelegatedBusinessDecisionFields scope="production_schedule" businessType="production_task" businessId={task.productionTaskId || selected.id} authState={authState} operatorId={operatorId} value={decision} onChange={setDecision} title="排产决定代录" disabled={locked} /> : null}
    {machineId && !selectedMachineAllowed ? <p role="alert">原机台已停用或不适合当前工序，请重新选择。</p> : null}
    {!scheduleId && awaitingSchedule ? <button className="primary" type="button" disabled={locked || !permissions.includes("production.schedule.publish") || !decisionReady || !validQty || !selectedMachineAllowed} onClick={publish}>确认并发布排产</button> : null}
    <h3>机台排产队列</h3>
    {!direct && machineId ? <DelegatedBusinessDecisionFields key={machineId} scope="production_schedule" businessType="production_schedule_queue" businessId={machineId} authState={authState} operatorId={operatorId} value={queueDecision} onChange={setQueueDecision} title="机台调序决定代录" disabled={locked} /> : null}
    {!queue ? <p role="status">正在读取机台队列…</p> : queue.source !== "api" || queue.blocked ? <p role="alert">{queue.error?.message || "机台队列读取失败。"}</p> : <>
      <select aria-label="选择队列任务" value={chosenId} disabled={locked || !currentQueue.length} onChange={event => setQueueId(event.target.value)}>{currentQueue.length ? currentQueue.map(item => <option key={item.productionTaskId} value={item.productionTaskId}>{item.queueSeq} · {item.productionTaskId} · {item.status}</option>) : <option value="">该机台暂无排产任务</option>}</select>
      <div className="production-queue-actions"><button type="button" disabled={locked || !queueDecisionReady || !permissions.includes("production.schedule.sequence.update") || chosenIndex <= 0} onClick={() => move(-1)}>上移</button><button type="button" disabled={locked || !queueDecisionReady || !permissions.includes("production.schedule.sequence.update") || chosenIndex < 0 || chosenIndex >= currentQueue.length - 1} onClick={() => move(1)}>下移</button><button type="button" disabled={busy} onClick={() => void loadQueue()}>刷新队列</button></div>
    </>}
    {message ? <p role="status">{message}</p> : null}
    {uncertain ? <button type="button" className="primary" disabled={busy} onClick={() => void write()}>按原内容重试排产</button> : null}
  </section>;
}

// P2-02: a silk-screen printer claimed this task themselves. The office sees who and may release it
// (with a reason) while it has not been started, e.g. when the printer is away.
function SilkScreenClaimNotice({ task, authState, canRelease, onSaved }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  const started = task.taskStatus !== "丝印已排产";
  async function release() {
    if (busy || !reason.trim()) return;
    setBusy(true); setMessage("");
    const result = await releaseSilkScreenTask({ authState, productionTaskId: task.productionTaskId, expectedRevision: Number(task.revision ?? 1), reason: reason.trim() });
    if (!live.current) return;
    setBusy(false);
    if (result.ok) { setReason(""); setMessage("已释放，任务回到丝印领任务池。"); }
    else setMessage(result.error?.message || "释放没有成功，请刷新核对。");
    if (result.ok || result.uncertain) await onSaved?.();
  }
  return <section className="business-detail-section production-schedule-controls" aria-label="丝印工领取">
    <h3>丝印工自己领取</h3>
    <p>已被 <strong>{task.claimedByName || task.claimedByUserId}</strong> 领取，机台 {task.machineId || "—"}{task.claimedAt ? `，领取时间 ${String(task.claimedAt).slice(0, 16).replace("T", " ")}` : ""}。</p>
    {started ? <p>已经开始报数量，不能释放；如需调整请先处理生产记录。</p> : canRelease ? <>
      <label>释放原因<textarea value={reason} maxLength={200} disabled={busy} onChange={event => setReason(event.target.value)} placeholder="例如：师傅请假，先放回任务池" /></label>
      <button type="button" disabled={busy || !reason.trim()} onClick={() => void release()}>{busy ? "释放中…" : "释放这个领取"}</button>
    </> : <p>只有办公室或领取人本人可以释放。</p>}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}

// P2-03 边做边发：办公室和客户说好后点「今天先发（出多少发多少）」；车间下班照常报当日数量，
// 系统就把做好的部分先发（确认完工进打包），剩下的拆成续做明细第二天接着做。单价按整单下单数量不变。
// 车间已经报过数、来不及等时，办公室也可以「现在就按已报数量先发」。
const EARLY_SHIP_CLOSED = new Set(["已完成", "已作废", "已取消", "异常暂停", "数量差异待处理", "待完工确认"]);
export function EarlyShipmentPanel({ selected, formal, onSaved }) {
  const raw = selected?.sourceTask || {};
  const task = raw.productionTask || {};
  const line = raw.orderLine || selected?.sourceOrderLine || {};
  const permissions = formal.permissionContext?.actionPermissions || [];
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  const externalPrint = ["external_print", "外加工印刷", "外加工", "同行加工印刷"].includes(String(line.orderType || ""));
  const finalStage = task.taskType === "制袋" || (task.taskType === "丝印" && externalPrint);
  const planned = Number(task.plannedQty || 0);
  const ready = Number(raw.dailyProgress?.cumulativeQualifiedQty || 0);
  const status = String(task.taskStatus || task.status || "");
  const requested = Boolean(task.earlyShipRequestedAt);
  if (!permissions.includes("production.schedule.publish") || !finalStage || EARLY_SHIP_CLOSED.has(status) || !(planned > 0) || ready >= planned) return null;
  const productionTaskId = task.productionTaskId || selected.id;
  async function finish(result, okText) {
    if (!live.current) return;
    setBusy(false); setConfirming(false);
    if (result.ok) { setNote(""); setMessage(okText(result.data)); }
    else setMessage(result.error?.message || "没有成功，请刷新后再试。");
    if (result.ok || result.uncertain) await onSaved?.();
  }
  async function mark(next) {
    if (busy) return;
    setBusy(true); setMessage("");
    const result = await setEarlyShipmentRequest({ authState: formal.authState, productionTaskId, expectedRevision: Number(task.revision ?? 1), requested: next, note: note.trim() });
    await finish(result, () => next ? "已安排今天先发：车间下班报完当日数量，做好的就自动进打包，剩下的明天接着做。" : "已取消今天先发。");
  }
  async function splitNow() {
    if (busy) return;
    setBusy(true); setMessage("");
    const result = await splitForEarlyShipment({ authState: formal.authState, productionTaskId, expectedRevision: Number(task.revision ?? 1), reason: note.trim() });
    await finish(result, (data) => `已先发 ${data.shippedNowQty} 个${data.completion?.status === "completed" ? "，已进打包" : `（${data.completion?.message || "请车间点「报工完成」后进打包"}）`}；剩下 ${data.remainderQty} 个在续做明细 ${data.remainderOrderLineId} 里接着做。`);
  }
  return <section className="business-detail-section production-schedule-controls" aria-label="边做边发">
    <h3>边做边发</h3>
    <p>整单 {planned} 个，车间已报做好 {ready} 个。</p>
    {requested
      ? <p><strong>已安排今天先发</strong>{task.earlyShipNote ? `（${task.earlyShipNote}）` : ""}：车间下班报完当日数量，做好的自动进打包先发，剩下的拆成续做明细明天接着做。</p>
      : <p>客户要今天先拉一部分时点「今天先发」：车间照常做、下班照常报数，出多少发多少。</p>}
    <label>备注（可不填）<textarea value={note} maxLength={200} disabled={busy} onChange={event => setNote(event.target.value)} placeholder="例如：客户的快递晚上 7 点装车" /></label>
    <div className="production-queue-actions">
      {requested
        ? <button type="button" disabled={busy} onClick={() => void mark(false)}>取消今天先发</button>
        : <button type="button" className="primary" disabled={busy} onClick={() => void mark(true)}>今天先发（出多少发多少）</button>}
      {ready > 0 && !confirming ? <button type="button" disabled={busy} onClick={() => setConfirming(true)}>现在就按已报的 {ready} 个先发</button> : null}
    </div>
    {ready > 0 && confirming ? <div className="production-queue-actions"><button type="button" disabled={busy} onClick={() => setConfirming(false)}>先不拆</button><button type="button" className="primary" disabled={busy} onClick={() => void splitNow()}>{busy ? "处理中…" : `确认：先发 ${ready} 个，续做 ${planned - ready} 个`}</button></div> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
