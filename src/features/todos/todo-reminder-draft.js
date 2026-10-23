const choices = new Set(["稍后30分钟", "稍后2小时", "稍后明早", "稍后指定时间"]);
const prefix = "erp.todo-reminder-draft.v1:";

export function reminderDraftOwner(authState) {
  const userId = String(authState?.session?.userId || "").trim();
  const permissionUserId = String(authState?.permissions?.user?.userId || "").trim();
  return authState?.session?.accessToken && userId && (!permissionUserId || permissionUserId === userId) ? userId : "";
}

export function readReminderDraft(owner, todoId, storage = browserStorage()) {
  try {
    requireScope(owner, todoId, storage);
    const text = storage.getItem(key(owner, todoId));
    if (text === null) return { draft: null, error: "" };
    const record = JSON.parse(text);
    if (record.version !== 1 || record.owner !== owner || record.todoId !== todoId || !validDraft(record.draft, todoId)) throw new Error("invalid draft");
    return { draft: record.draft, error: "" };
  } catch {
    return { draft: null, error: "无法读取本次提醒草稿，未覆盖已有内容。请恢复浏览器存储后重试。" };
  }
}

export function writeReminderDraft(owner, todoId, draft, storage = browserStorage()) {
  try {
    requireScope(owner, todoId, storage);
    if (!validDraft(draft, todoId)) throw new Error("invalid draft");
    // Only reminder choices and the frozen command are persisted, never auth tokens.
    const pending = draft.pending ? {
      todoId, action: draft.pending.action, reason: draft.pending.reason,
      ...(draft.pending.snoozeUntil ? { snoozeUntil: draft.pending.snoozeUntil } : {}),
      idempotencyKey: draft.pending.idempotencyKey,
    } : null;
    const value = JSON.stringify({ version: 1, owner, todoId, draft: { choice: draft.choice, time: draft.time, pending } });
    storage.setItem(key(owner, todoId), value);
    if (storage.getItem(key(owner, todoId)) !== value) throw new Error("draft not retained");
    return { error: "" };
  } catch {
    return { error: "浏览器未能保存提醒草稿，本次尚未发送。请恢复浏览器存储后重试。" };
  }
}

function validDraft(draft, todoId) {
  if (!draft || !choices.has(draft.choice) || typeof draft.time !== "string" || draft.time.length > 30) return false;
  const request = draft.pending;
  if (!request) return request === null;
  return request.todoId === todoId && request.action === draft.choice && request.reason === draft.choice
    && /^todo-reminder-[0-9a-f-]{36}$/i.test(request.idempotencyKey || "")
    && (request.snoozeUntil === undefined || (typeof request.snoozeUntil === "string" && Number.isFinite(Date.parse(request.snoozeUntil))))
    && (request.action === "稍后指定时间"
      ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(draft.time) && Date.parse(`${draft.time}:00+08:00`) === Date.parse(request.snoozeUntil)
      : request.snoozeUntil === undefined);
}

function key(owner, todoId) { return `${prefix}${encodeURIComponent(owner)}:${encodeURIComponent(todoId)}`; }
function requireScope(owner, todoId, storage) { if (!owner || !todoId || !storage) throw new Error("missing reminder draft scope"); }
function browserStorage() { try { return globalThis.sessionStorage ?? null; } catch { return null; } }
