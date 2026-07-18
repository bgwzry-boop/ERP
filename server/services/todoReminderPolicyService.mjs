const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;
const chinaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const TODO_REMINDER_POLICY = Object.freeze({
  source: "server",
  version: "v1",
  redDotAfterMinutes: 30,
  followUpAfterMinutes: DAY_MINUTES,
  pinDueToday: true,
});

export function getTodoReminderPolicyMetadata() {
  return { ...TODO_REMINDER_POLICY };
}

export function projectTodoReminder(todo = {}, { now = new Date(), policy = TODO_REMINDER_POLICY } = {}) {
  const nowMs = toTimestamp(now) ?? Date.now();
  const createdAtMs = toTimestamp(todo.createdAt);
  const legacyWaitingMinutes = parseLegacyWaitingMinutes(todo.wait);
  const waitingMinutes = createdAtMs === null
    ? legacyWaitingMinutes
    : Math.max(0, Math.floor((nowMs - createdAtMs) / MINUTE_MS));
  const waitingSource = createdAtMs === null
    ? legacyWaitingMinutes > 0 || String(todo.wait ?? "").includes("刚刚") ? "legacy_wait" : "unknown"
    : "created_at";
  const remindAtMs = toTimestamp(todo.remindAt ?? todo.snoozeUntil);
  const activeSnooze = !todo.handled && remindAtMs !== null && remindAtMs > nowMs;
  const deadline = resolveDeadline(todo.latestNeededAt ?? todo.latest, nowMs);
  const reminderLevel = resolveReminderLevel({
    handled: Boolean(todo.handled),
    activeSnooze,
    waitingMinutes,
    policy,
  });
  const reminderLevelLabel = getReminderLevelLabel(reminderLevel);
  const serverSortRank = resolveServerSortRank(todo, {
    activeSnooze,
    dueToday: deadline.dueToday,
    reminderLevel,
  });

  return {
    waitingMinutes,
    waitingLabel: formatWaitingLabel(waitingMinutes, todo.wait),
    waitingSource,
    reminderLevel,
    reminderLevelLabel,
    activeSnooze,
    dueToday: deadline.dueToday,
    overdue: deadline.overdue,
    serverSortRank,
  };
}

export function sortTodoReminderItems(items = []) {
  return [...items]
    .sort((left, right) => {
      const rankDiff = numberOr(left.serverSortRank, 600) - numberOr(right.serverSortRank, 600);
      if (rankDiff) return rankDiff;
      if (Boolean(left.overdue) !== Boolean(right.overdue)) return left.overdue ? -1 : 1;
      if (Boolean(left.dueToday) !== Boolean(right.dueToday)) return left.dueToday ? -1 : 1;
      const waitDiff = numberOr(right.waitingMinutes, parseLegacyWaitingMinutes(right.wait))
        - numberOr(left.waitingMinutes, parseLegacyWaitingMinutes(left.wait));
      if (waitDiff) return waitDiff;
      return todoIdentity(left).localeCompare(todoIdentity(right), "zh-CN");
    })
    .map((item, serverSortIndex) => ({ ...item, serverSortIndex }));
}

function resolveReminderLevel({ handled, activeSnooze, waitingMinutes, policy }) {
  if (handled) return "handled";
  if (activeSnooze) return "snoozed";
  if (waitingMinutes >= policy.followUpAfterMinutes) return "follow_up";
  if (waitingMinutes >= policy.redDotAfterMinutes) return "red_dot";
  return "normal";
}

function getReminderLevelLabel(level) {
  if (level === "handled") return "已处理";
  if (level === "snoozed") return "稍后提醒";
  if (level === "follow_up") return "已转跟进";
  if (level === "red_dot") return "红点提醒";
  return "正常";
}

function resolveServerSortRank(todo, projection) {
  if (todo.handled) return 900;
  if (projection.activeSnooze) return 800;
  const urgency = cleanText(todo.urgency);
  if (urgency === "急") return 0;
  if (urgency === "今天" || projection.dueToday) return 50;
  if (
    urgency === "异常" ||
    todo.referenceStatus === "missing" ||
    todo.printResultStatus === "unknown"
  ) return 100;
  if (projection.reminderLevel === "follow_up") return 300;
  if (projection.reminderLevel === "red_dot") return 400;
  if (urgency === "关注") return 500;
  return 600;
}

function resolveDeadline(value, nowMs) {
  const text = cleanText(value);
  if (!text) return { dueToday: false, overdue: false };
  if (text.includes("昨天")) return { dueToday: false, overdue: true };
  if (text.includes("今天")) return { dueToday: true, overdue: false };
  const timestamp = toTimestamp(text);
  if (timestamp === null) return { dueToday: false, overdue: false };
  const deadlineDay = chinaCalendarDay(timestamp);
  const today = chinaCalendarDay(nowMs);
  return {
    dueToday: deadlineDay === today,
    overdue: deadlineDay < today,
  };
}

function chinaCalendarDay(timestamp) {
  const parts = chinaDateFormatter.formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseLegacyWaitingMinutes(value) {
  const text = cleanText(value);
  if (!text || text.includes("刚刚")) return 0;
  const amount = Number(text.match(/\d+/)?.[0] ?? 0);
  if (text.includes("天")) return amount * DAY_MINUTES;
  if (text.includes("小时")) return amount * 60;
  return amount;
}

function formatWaitingLabel(minutes, fallback) {
  if (minutes <= 0) return cleanText(fallback) || "刚刚";
  if (minutes < 60) return `${minutes}分钟`;
  if (minutes < DAY_MINUTES) return `${Math.floor(minutes / 60)}小时`;
  return `${Math.floor(minutes / DAY_MINUTES)}天`;
}

function toTimestamp(value) {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = cleanText(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function todoIdentity(todo) {
  return cleanText(todo.todoId ?? todo.id ?? todo.refId ?? todo.ref);
}

function cleanText(value) {
  return String(value ?? "").trim();
}
