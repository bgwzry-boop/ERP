// P2-04 换模工单（负责人 2026-11-04）：办公室或管理看订单数据决定哪台机、什么时候换模、换成什么；
// 技工手机上收到工单，换好后拍最终试做的袋子上传就完成。这里安排换模、看进度和试做照片。
import { useCallback, useEffect, useRef, useState } from "react";
import { ReloadOutlined } from "@ant-design/icons";
import { createOfficeIdempotencyKey } from "../../../../src/services/officeApiClientCore.js";
import { createMaintenanceTask, listMaintenanceTasks } from "../../../../src/services/maintenanceTaskApiClient.js";
import { downloadOfficeAttachmentContent } from "../../../../src/services/officeAttachmentApiClient.js";
import { hasEffectivePermission } from "./navigation.js";
import "./mold-change.css";

const OPEN_STATUSES = new Set(["待换模", "换模中"]);

export function MoldChangeWorkspace({ formal }) {
  const permissionContext = formal.permissionContext || {};
  const authState = formal.authState;
  const operatorId = permissionContext.user?.userId;
  const canCreate = hasEffectivePermission(permissionContext, "maintenance.task.create");
  const machines = (formal.data.machines || []).filter((machine) => machine.enabled !== false && (machine.status || "active") === "active"
    && ["bag_making", "screen_printing", "cutting"].includes(machine.machineType || machine.type || "bag_making"));
  const [tasks, setTasks] = useState([]);
  const [readError, setReadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ machineId: "", dueAt: "", target: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const live = useRef(true);
  const pendingKey = useRef("");
  useEffect(() => () => { live.current = false; }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await listMaintenanceTasks({ authState, operatorId, status: "all", taskType: "换模" });
    if (!live.current) return;
    setLoading(false);
    if (result.blocked) { setReadError(result.error?.message || "换模工单读取失败。"); return; }
    setReadError("");
    setTasks(result.items || []);
  }, [authState, operatorId]);
  useEffect(() => { void reload(); }, [reload]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    pendingKey.current = "";
    setMessage("");
  }

  const dueIso = toIso(form.dueAt);
  const valid = form.machineId && dueIso && form.target.trim() && form.target.trim().length <= 80;

  async function submit() {
    if (busy || !valid) return;
    setBusy(true); setMessage("");
    pendingKey.current ||= createOfficeIdempotencyKey();
    const result = await createMaintenanceTask({
      authState,
      operatorId,
      idempotencyKey: pendingKey.current,
      type: "换模",
      machineId: form.machineId,
      dueAt: dueIso,
      faultCategory: form.target.trim(),
      summary: form.note.trim() || undefined,
    }, { serverRequired: true });
    if (!live.current) return;
    setBusy(false);
    if (result.task) {
      pendingKey.current = "";
      setForm({ machineId: "", dueAt: "", target: "", note: "" });
      setMessage(`已派出换模工单：${result.task.machineName} 换成 ${result.task.faultCategory}，${formatTime(result.task.dueAt)}。技工手机上会收到。`);
      await reload();
    } else {
      setMessage(result.error?.message || "换模工单没有派出，请检查后重试。");
    }
  }

  const open = tasks.filter((task) => OPEN_STATUSES.has(task.status));
  const done = tasks.filter((task) => !OPEN_STATUSES.has(task.status)).slice(0, 30);

  return <section className="mold-change-workspace" aria-label="换模工单">
    <header className="mold-change-head">
      <div>
        <h1>换模工单</h1>
        <p>看订单定好哪台机、什么时候换、换成什么；技工手机上收到工单，换好后拍最终试做的袋子就完成。</p>
      </div>
      <button type="button" onClick={() => void reload()} disabled={loading}><ReloadOutlined />刷新</button>
    </header>

    {canCreate ? <section className="mold-change-card" aria-label="安排换模">
      <h2>安排换模</h2>
      <div className="mold-change-form">
        <label><span>机台</span>
          <select value={form.machineId} disabled={busy} onChange={(event) => update("machineId", event.target.value)}>
            <option value="">选择机台</option>
            {machines.map((machine) => { const id = machine.machineId || machine.id; return <option key={id} value={id}>{machine.name || machine.machineLabel || id}</option>; })}
          </select>
        </label>
        <label><span>换模时间</span>
          <input type="datetime-local" value={form.dueAt} disabled={busy} onChange={(event) => update("dueAt", event.target.value)} />
        </label>
        <div className="mold-change-quick" aria-label="常用时间">
          <button type="button" disabled={busy} onClick={() => update("dueAt", localInput(0, 18, 0))}>今天下班后（18:00）</button>
          <button type="button" disabled={busy} onClick={() => update("dueAt", localInput(1, 12, 0))}>明天中午（12:00）</button>
        </div>
        <label><span>换成什么</span>
          <input value={form.target} maxLength={80} disabled={busy} placeholder="例如：30*40 模具" onChange={(event) => update("target", event.target.value)} />
        </label>
        <label className="wide"><span>备注（可不填）</span>
          <textarea value={form.note} maxLength={300} disabled={busy} placeholder="例如：为下一单 ORD-1104-003 换的" onChange={(event) => update("note", event.target.value)} />
        </label>
      </div>
      <button type="button" className="primary" disabled={busy || !valid} onClick={() => void submit()}>{busy ? "正在派单…" : "派给技工"}</button>
      {message ? <p role="status">{message}</p> : null}
    </section> : null}

    {readError ? <p role="alert">{readError}</p> : null}
    <section className="mold-change-card" aria-label="待换模">
      <h2>待换模 <small>{open.length} 个</small></h2>
      {open.length ? <ul className="mold-change-list">{open.map((task) => <MoldChangeRow key={task.id} task={task} authState={authState} />)}</ul>
        : <p className="mold-change-empty">{loading ? "正在读取…" : "现在没有待换模的工单。"}</p>}
    </section>
    <section className="mold-change-card" aria-label="已完成的换模">
      <h2>已完成 <small>最近 {done.length} 个</small></h2>
      {done.length ? <ul className="mold-change-list">{done.map((task) => <MoldChangeRow key={task.id} task={task} authState={authState} />)}</ul>
        : <p className="mold-change-empty">还没有完成的换模。</p>}
    </section>
  </section>;
}

function MoldChangeRow({ task, authState }) {
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = useRef("");
  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current); }, []);
  const photoId = (task.photoAttachmentIds || []).at(-1);
  async function showPhoto() {
    if (!photoId || busy) return;
    setBusy(true); setError("");
    const result = await downloadOfficeAttachmentContent({ authState, attachmentId: photoId }, { serverRequired: true });
    setBusy(false);
    if (result.source !== "api" || !result.contentBlob) { setError(result.error?.message || "照片读取失败。"); return; }
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = URL.createObjectURL(result.contentBlob);
    setImage(url.current);
  }
  const doneStatus = !OPEN_STATUSES.has(task.status);
  return <li className={doneStatus ? "done" : ""}>
    <div className="mold-change-info">
      <strong>{task.machineName} · 换成 {task.faultCategory}</strong>
      <span>{formatTime(task.dueAt)} · {task.status}{doneStatus && task.completedAt ? ` · ${formatTime(task.completedAt)} 完成` : ""}</span>
      {task.summary && !task.summary.endsWith(`换成 ${task.faultCategory}`) ? <small>{task.summary}</small> : null}
      {doneStatus && task.actionTaken ? <small>技工：{task.actionTaken}</small> : null}
    </div>
    {photoId ? <button type="button" disabled={busy} onClick={() => void showPhoto()}>{busy ? "读取中…" : "看试做照片"}</button> : null}
    {error ? <p role="alert">{error}</p> : null}
    {image ? <img src={image} alt={`${task.machineName} 换模后的试做袋子`} /> : null}
  </li>;
}

function localInput(daysAhead, hour, minute) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, minute, 0, 0);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:${pad(minute)}`;
}

function toIso(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function formatTime(value) {
  const timestamp = Date.parse(value ?? "");
  if (!Number.isFinite(timestamp)) return "时间未定";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(timestamp));
}
