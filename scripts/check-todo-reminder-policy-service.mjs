import assert from "node:assert/strict";
import {
  getTodoReminderPolicyMetadata,
  projectTodoReminder,
  sortTodoReminderItems,
} from "../server/services/todoReminderPolicyService.mjs";

const now = new Date("2026-07-13T02:00:00.000Z");

const normal = projectTodoReminder({ id: "T-NORMAL", createdAt: "2026-07-13T01:31:00.000Z" }, { now });
assert.equal(normal.waitingMinutes, 29);
assert.equal(normal.reminderLevel, "normal");

const redDot = projectTodoReminder({ id: "T-RED", createdAt: "2026-07-13T01:30:00.000Z" }, { now });
assert.equal(redDot.waitingMinutes, 30);
assert.equal(redDot.reminderLevel, "red_dot");
assert.equal(redDot.reminderLevelLabel, "红点提醒");

const followUp = projectTodoReminder({ id: "T-FOLLOW", createdAt: "2026-07-12T02:00:00.000Z" }, { now });
assert.equal(followUp.waitingMinutes, 1440);
assert.equal(followUp.reminderLevel, "follow_up");
assert.equal(followUp.waitingLabel, "1天");

const activeSnooze = projectTodoReminder({
  id: "T-SNOOZE",
  createdAt: "2026-07-11T02:00:00.000Z",
  remindAt: "2026-07-13T02:30:00.000Z",
}, { now });
assert.equal(activeSnooze.activeSnooze, true);
assert.equal(activeSnooze.reminderLevel, "snoozed");

const expiredSnooze = projectTodoReminder({
  id: "T-EXPIRED",
  createdAt: "2026-07-11T02:00:00.000Z",
  remindAt: "2026-07-13T01:59:00.000Z",
}, { now });
assert.equal(expiredSnooze.activeSnooze, false);
assert.equal(expiredSnooze.reminderLevel, "follow_up");

const legacy = projectTodoReminder({ id: "T-LEGACY", wait: "2小时", latest: "今天 19:00" }, { now });
assert.equal(legacy.waitingMinutes, 120);
assert.equal(legacy.waitingSource, "legacy_wait");
assert.equal(legacy.dueToday, true);
assert.equal(legacy.serverSortRank, 50);

const items = [
  { todoId: "T-HANDLED", handled: true, ...projectTodoReminder({ handled: true }, { now }) },
  { todoId: "T-SNOOZE", ...activeSnooze },
  { todoId: "T-NORMAL", ...normal },
  { todoId: "T-RED", ...redDot },
  { todoId: "T-FOLLOW", ...followUp },
  { todoId: "T-TODAY", ...projectTodoReminder({ latest: "今天 19:00" }, { now }) },
  { todoId: "T-EXCEPTION", urgency: "异常", ...projectTodoReminder({ urgency: "异常" }, { now }) },
  { todoId: "T-URGENT", urgency: "急", ...projectTodoReminder({ urgency: "急" }, { now }) },
];
const sorted = sortTodoReminderItems(items);
assert.deepEqual(sorted.map((item) => item.todoId), [
  "T-URGENT",
  "T-TODAY",
  "T-EXCEPTION",
  "T-FOLLOW",
  "T-RED",
  "T-NORMAL",
  "T-SNOOZE",
  "T-HANDLED",
]);
assert.deepEqual(sorted.map((item) => item.serverSortIndex), [0, 1, 2, 3, 4, 5, 6, 7]);

assert.deepEqual(getTodoReminderPolicyMetadata(), {
  source: "server",
  version: "v1",
  redDotAfterMinutes: 30,
  followUpAfterMinutes: 1440,
  pinDueToday: true,
});

console.log("todo reminder policy service checks passed");
