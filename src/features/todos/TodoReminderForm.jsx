import { useEffect, useRef, useState } from "react";
import { handleOfficeTodoAction } from "../../services/officeTodoApiClient.js";
import "./todo-reminder.css";
import { reminderDraftOwner, readReminderDraft, writeReminderDraft } from "./todo-reminder-draft.js";

const options = [["稍后30分钟", "30 分钟后"], ["稍后2小时", "2 小时后"], ["稍后明早", "明早 09:00"], ["稍后指定时间", "指定时间"]];
const formatTime = (value) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));

export function TodoReminderForm(props) {
  return <ReminderForm key={`${props.todo.id}:${reminderDraftOwner(props.authState)}:${props.authState?.session?.accessToken || ""}`} {...props} />;
}

function ReminderForm({ todo, authState, onSaved, save = handleOfficeTodoAction }) {
  const allowed = authState?.permissions?.actionPermissions?.includes("todo.handle") === true;
  const owner = reminderDraftOwner(authState);
  const [restored] = useState(() => owner ? readReminderDraft(owner, todo.id) : { draft: null, error: "" });
  const savedDraft = restored.draft;
  const [choice, setChoice] = useState(savedDraft?.choice || "稍后30分钟");
  const [time, setTime] = useState(savedDraft?.time || "");
  const [pending, setPending] = useState(savedDraft?.pending || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(restored.error);
  const [notice, setNotice] = useState("");
  const gate = useRef(false);
  const live = useRef(true);
  const current = useRef({ allowed, authState });
  current.current = { allowed, authState };
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    if (!allowed || restored.error) return;
    const result = writeReminderDraft(owner, todo.id, { choice, time, pending });
    if (result.error) setError(result.error);
  }, [owner, todo.id, choice, time, pending, allowed, restored.error]);

  async function submit(event) {
    event.preventDefault();
    if (gate.current || !allowed || (todo.handled && !pending)) return;
    if (restored.error) { setError(restored.error); return; }
    let request = pending;
    if (!request) {
      let snoozeUntil;
      if (choice === "稍后指定时间") {
        const parsed = Date.parse(`${time}:00+08:00`);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time) || !Number.isFinite(parsed) || parsed <= Date.now()) {
          setError("请选择未来的提醒日期和时间（北京时间）。"); return;
        }
        snoozeUntil = new Date(parsed).toISOString();
      }
      request = { todoId: todo.id, action: choice, reason: choice, snoozeUntil, idempotencyKey: `todo-reminder-${crypto.randomUUID()}` };
    }
    const stored = writeReminderDraft(owner, todo.id, { choice, time, pending: request });
    if (stored.error) { setError(stored.error); return; }
    setPending(request);
    const session = authState;
    gate.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await save({ ...request, authState: session }, { serverRequired: true });
      if (!live.current || current.current.authState !== session || !current.current.allowed) return;
      const saved = result?.todo;
      if (result?.source !== "api" || result.blocked) {
        if (["TODO_REMINDER_TIME_REQUIRED", "TODO_REMINDER_TIME_INVALID", "TODO_ALREADY_HANDLED"].includes(result?.error?.code)) setPending(null);
        throw new Error(result?.error?.message || "暂未确认保存结果，请用原请求重试。");
      }
      if (saved?.id !== todo.id || !result.operationLogId || !Number.isFinite(Date.parse(saved?.remindAt)) || (request.snoozeUntil && Date.parse(saved.remindAt) !== Date.parse(request.snoozeUntil))) {
        throw new Error("返回结果与本次提醒不匹配，请用原请求重试。");
      }
      setPending(null); setNotice(`已保存：${formatTime(saved.remindAt)}（北京时间）`);
      try { await onSaved?.(saved); } catch { if (live.current) setNotice(`已保存：${formatTime(saved.remindAt)}；列表刷新失败，请刷新列表。`); }
    } catch (failure) {
      if (live.current && current.current.authState === session && current.current.allowed) setError(failure.message || "保存失败，请重试。");
    } finally {
      gate.current = false;
      if (live.current) setBusy(false);
    }
  }

  return <section className="todo-reminder-form" aria-label="待办提醒设置">
    <h3>稍后提醒</h3>
    {todo.remindAt && Number.isFinite(Date.parse(todo.remindAt)) ? <p>已设时间：{formatTime(todo.remindAt)}（北京时间）</p> : null}
    {!allowed ? <p>当前账号只能查看待办，没有设置提醒的权限。</p> : todo.handled && !pending ? <p>该待办已处理，无需设置提醒。</p> : <form onSubmit={submit}>
      <fieldset disabled={busy || Boolean(pending)}>
        <label>提醒时间<select value={choice} onChange={event => { setChoice(event.target.value); setError(""); }}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {choice === "稍后指定时间" ? <label>日期和时间（北京时间）<input type="datetime-local" value={time} onChange={event => { setTime(event.target.value); setError(""); }} required /></label> : null}
      </fieldset>
      <button type="submit" disabled={busy}>{busy ? "正在保存…" : pending ? "用原请求重试" : "保存提醒"}</button>
      {pending && !busy ? <p>结果尚未确认，已保留本次选择；请重试取回保存结果。</p> : null}
    </form>}
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </section>;
}
