import { createHash, randomUUID } from "node:crypto";

const reminderLabels = {
  稍后30分钟: "30 分钟后",
  稍后2小时: "2 小时后",
  稍后明早: "明早 09:00",
  稍后指定时间: "今天 17:30",
};

export function createTodoCommandService({ buildOperationLog, now = () => new Date() } = {}) {
  if (typeof buildOperationLog !== "function") throw new TypeError("buildOperationLog must be a function");

  return {
    async handleTodo({ workspace, todoId, body = {}, operatorId, operatorName }) {
      const action = cleanText(body.action);
      if (!supportedActions.has(action)) {
        return businessError(422, "VALIDATION_ERROR", `Unsupported todo action: ${action}`);
      }
      const before = await workspace.todoActionRepository.getTodo({ workspace, todoId });
      if (!before) return { notFound: true, code: "TODO_NOT_FOUND" };

      const timestamp = nowIso(now);
      const after = {
        ...applyTodoAction({ before, action, body, operatorId, timestamp }),
        createdAt: cleanText(before.createdAt) || timestamp,
      };
      const operationLogId = buildTodoOperationLogId(todoId, action, body.idempotencyKey);
      const operationLog = buildOperationLog(workspace, {
        id: operationLogId,
        targetType: "todo",
        targetId: todoId,
        action: `handle_todo:${action}`,
        operatorId,
        before,
        after,
        reason: body.reason,
      });
      const todoEvent = {
        eventId: `TE-${operationLog.id}`,
        todoId,
        eventType: `handle_todo:${action}`,
        eventPayload: {
          action,
          todo: after,
          operatorName: cleanText(operatorName) || operatorId,
        },
        operatorId,
        occurredAt: timestamp,
        createdAt: timestamp,
      };
      return workspace.todoActionRepository.recordTodoAction({
        workspace,
        action,
        before,
        expectedUpdatedAt: before.updatedAt,
        todo: after,
        todoEvent,
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: body,
      });
    },
  };
}

const supportedActions = new Set([
  "mark_handled",
  "batch_print_confirm",
  "batch_print_result_pending",
  "snooze",
  "reopen",
  "mark_viewed",
  "customer_notification_copied",
  "customer_notification_sent",
]);

function applyTodoAction({ before, action, body, operatorId, timestamp }) {
  if (action === "mark_handled" || action === "batch_print_confirm") {
    return {
      ...before,
      status: "已处理",
      handled: true,
      handledBy: operatorId,
      handledAt: timestamp,
      handlingResult: cleanText(body.handlingResult) || action,
      lastAction: cleanText(body.handlingResult) || action,
      updatedAt: timestamp,
    };
  }
  if (action === "batch_print_result_pending") {
    const printResultStatus = body.printResultStatus ?? (body.reason === "不确定" ? "unknown" : "not_printed");
    return {
      ...before,
      status: "未处理",
      handled: false,
      priority: printResultStatus === "unknown" ? "异常" : before.priority,
      urgency: printResultStatus === "unknown" ? "异常" : before.urgency,
      reminder: printResultStatus === "unknown" ? "打印异常待核对" : "未打出，待重打",
      lastAction: body.handlingResult ?? "批量打印结果待处理",
      printResultStatus,
      printedLabelCount: finiteInteger(body.printedLabelCount),
      pendingLabelCount: finiteInteger(body.pendingLabelCount ?? body.totalLabelCount),
      totalLabelCount: finiteInteger(body.totalLabelCount),
      printedPackageIds: stringList(body.printedPackageIds),
      pendingPackageIds: stringList(body.pendingPackageIds),
      printPackages: Array.isArray(body.printPackages) ? body.printPackages : before.printPackages,
      updatedAt: timestamp,
    };
  }
  if (action === "snooze") {
    const reason = cleanText(body.reason) || "稍后30分钟";
    const reminder = reminderLabels[reason] ?? "稍后";
    return {
      ...before,
      reminder,
      remindAt: resolveReminderTimestamp(reason, body.snoozeUntil ?? body.remindAt, timestamp),
      lastAction: `稍后提醒：${reminder}`,
      updatedAt: timestamp,
    };
  }
  if (action === "reopen") {
    return {
      ...before,
      status: "未处理",
      handled: false,
      handledBy: "",
      handledAt: "",
      handlingResult: "",
      reminder: "",
      remindAt: "",
      lastAction: "重新打开",
      updatedAt: timestamp,
    };
  }
  if (action === "mark_viewed") {
    return { ...before, lastAction: "管理查看已提示", updatedAt: timestamp };
  }
  if (action === "customer_notification_copied") {
    return {
      ...before,
      notificationCopyText: cleanText(body.notificationContent) || before.notificationCopyText || "",
      notificationChannel: cleanText(body.notificationChannel) || before.notificationChannel || "微信 / 企业微信人工发送",
      notificationStatus: "话术已复制",
      notificationCopiedBy: operatorId,
      notificationCopiedAt: timestamp,
      lastAction: cleanText(body.handlingResult) || "已复制客户通知话术",
      updatedAt: timestamp,
    };
  }
  return {
    ...before,
    status: "已处理",
    handled: true,
    handledBy: operatorId,
    handledAt: timestamp,
    notificationCopyText: cleanText(body.notificationContent) || before.notificationCopyText || "",
    notificationChannel: cleanText(body.notificationChannel) || before.notificationChannel || "微信 / 企业微信人工发送",
    notificationStatus: "已通知客户",
    notifiedBy: operatorId,
    notifiedAt: timestamp,
    handlingResult: cleanText(body.handlingResult) || "已人工通知客户",
    lastAction: cleanText(body.handlingResult) || "已人工通知客户",
    updatedAt: timestamp,
  };
}

function resolveReminderTimestamp(reason, explicitValue, timestamp) {
  const explicit = cleanText(explicitValue);
  if (explicit && Number.isFinite(Date.parse(explicit))) return new Date(explicit).toISOString();
  const base = new Date(timestamp);
  if (reason === "稍后2小时") return new Date(base.getTime() + 2 * 60 * 60 * 1000).toISOString();
  if (reason === "稍后明早") {
    base.setUTCDate(base.getUTCDate() + 1);
    base.setUTCHours(1, 0, 0, 0);
    return base.toISOString();
  }
  if (reason === "稍后指定时间") {
    base.setUTCHours(9, 30, 0, 0);
    return base.toISOString();
  }
  return new Date(base.getTime() + 30 * 60 * 1000).toISOString();
}

function buildTodoOperationLogId(todoId, action, idempotencyKey) {
  const source = cleanText(idempotencyKey);
  if (source) {
    const digest = createHash("sha256").update(`${todoId}:${action}:${source}`).digest("hex").slice(0, 20).toUpperCase();
    return `LOG-TODO-${digest}`;
  }
  return `LOG-TODO-${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}

function finiteInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function stringList(value) {
  return Array.isArray(value) ? [...new Set(value.map(cleanText).filter(Boolean))] : [];
}

function nowIso(now) {
  return new Date(now()).toISOString();
}

function cleanText(value) {
  return String(value ?? "").trim();
}
