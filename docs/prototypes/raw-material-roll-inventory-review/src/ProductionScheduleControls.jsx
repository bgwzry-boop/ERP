import { useEffect, useRef, useState } from "react";
import { listOfficeProductionMachineQueue, publishOfficeProductionSchedule, resequenceOfficeProductionMachineQueue } from "../../../../src/services/officeProductionPackingLazyApi.js";
import { createOfficeIdempotencyKey } from "../../../../src/services/officeApiClientCore.js";
import { DelegatedBusinessDecisionFields, isDelegatedBusinessDecisionComplete } from "../../../../src/components/DelegatedBusinessDecisionFields.jsx";

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
  const machines = formal.data.machines || [];
  const currentQueue = queue?.machines?.find(item => item.machineId === machineId)?.items || [];
  const chosenId = currentQueue.some(item => item.productionTaskId === queueId) ? queueId : currentQueue[0]?.productionTaskId || "";
  const chosenIndex = currentQueue.findIndex(item => item.productionTaskId === chosenId);
  const validQty = /^\d+$/.test(qty) && Number.isSafeInteger(Number(qty)) && Number(qty) > 0;
  const decisionReady = reason.trim() && (direct || isDelegatedBusinessDecisionComplete(decision));
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
  function decisionPayload() { return direct ? { directDecisionContent: { summary: reason.trim() } } : { delegatedDecision: decision }; }
  function publish() {
    if (locked || !permissions.includes("production.schedule.publish") || !decisionReady || !validQty || !machineId || scheduleId || !awaitingSchedule) return;
    void write("publish", { orderLine: line, productionTaskId: task.productionTaskId || selected.id,
      machineId, processType: task.taskType || (line.printFlag || line.print === "是" ? "丝印" : "制袋"),
      plannedQty: Number(qty), expectedRevision: Number(task.revision ?? raw.revision ?? 1),
      ...decisionPayload(), remark: reason.trim() });
  }
  function move(direction) {
    if (locked || !permissions.includes("production.schedule.sequence.update") || !decisionReady || queue?.source !== "api") return;
    const target = chosenIndex + direction;
    if (chosenIndex < 0 || target < 0 || target >= currentQueue.length) return;
    const next = [...currentQueue]; [next[chosenIndex], next[target]] = [next[target], next[chosenIndex]];
    void write("queue", { machineId, orderedProductionTaskIds: next.map(item => item.productionTaskId),
      affectedRevisions: currentQueue.map(item => ({ productionTaskId: item.productionTaskId, revision: Number(item.revision ?? 1) })),
      expectedRevision: currentQueue.reduce((sum, item) => sum + Number(item.revision ?? 1), 0),
      ...decisionPayload(), remark: reason.trim() });
  }
  if (!selected) return <section><h3>办公室排产</h3><p>选择生产任务后安排机台。</p></section>;
  return <section className="business-detail-section production-schedule-controls" aria-label="办公室排产">
    <h3>办公室排产</h3>
    {scheduleId ? <p>已发布排产：{scheduleId}</p> : null}
    <label>生产机台<select value={machineId} disabled={locked} onChange={event => setMachineId(event.target.value)}><option value="">选择机台</option>{machines.map(machine => { const id = machine.machineId || machine.id; return <option key={id} value={id}>{machine.name || machine.machineLabel || id}</option>; })}</select></label>
    {!scheduleId && awaitingSchedule ? <label>排产数量（个）<input type="number" min="1" step="1" value={qty} disabled={locked} onChange={event => setQty(event.target.value)} /></label> : null}
    <label>安排或调整依据<textarea value={reason} maxLength={500} disabled={locked} onChange={event => setReason(event.target.value)} placeholder="说明机台安排和交期依据" /></label>
    {!direct ? <DelegatedBusinessDecisionFields scope="production_schedule" businessType="production_task" businessId={task.productionTaskId || selected.id} authState={authState} operatorId={operatorId} value={decision} onChange={setDecision} title="排产决定代录" disabled={locked} /> : null}
    {!scheduleId && awaitingSchedule ? <button className="primary" type="button" disabled={locked || !permissions.includes("production.schedule.publish") || !decisionReady || !validQty || !machineId} onClick={publish}>确认并发布排产</button> : null}
    <h3>机台排产队列</h3>
    {!queue ? <p role="status">正在读取机台队列…</p> : queue.source !== "api" || queue.blocked ? <p role="alert">{queue.error?.message || "机台队列读取失败。"}</p> : <>
      <select aria-label="选择队列任务" value={chosenId} disabled={locked || !currentQueue.length} onChange={event => setQueueId(event.target.value)}>{currentQueue.length ? currentQueue.map(item => <option key={item.productionTaskId} value={item.productionTaskId}>{item.queueSeq} · {item.productionTaskId} · {item.status}</option>) : <option value="">该机台暂无排产任务</option>}</select>
      <div className="production-queue-actions"><button type="button" disabled={locked || !decisionReady || !permissions.includes("production.schedule.sequence.update") || chosenIndex <= 0} onClick={() => move(-1)}>上移</button><button type="button" disabled={locked || !decisionReady || !permissions.includes("production.schedule.sequence.update") || chosenIndex < 0 || chosenIndex >= currentQueue.length - 1} onClick={() => move(1)}>下移</button><button type="button" disabled={busy} onClick={() => void loadQueue()}>刷新队列</button></div>
    </>}
    {message ? <p role="status">{message}</p> : null}
    {uncertain ? <button type="button" className="primary" disabled={busy} onClick={() => void write()}>按原内容重试排产</button> : null}
  </section>;
}
