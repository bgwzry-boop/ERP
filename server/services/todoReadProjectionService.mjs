import {
  getTodoReminderPolicyMetadata,
  projectTodoReminder,
  sortTodoReminderItems,
} from "./todoReminderPolicyService.mjs";
import {
  getAllowedTodoReferenceTypes,
  getTodoReferenceTypeLabel,
  listTodoReferenceCandidates,
  resolveTodoReference,
} from "./todoReferenceService.mjs";

const MAX_PAGE_SIZE = 200;

export function createTodoReadProjectionService() {
  return {
    listTodos,
    projectTodo,
    summarizeTodo,
  };
}

export function summarizeTodo(value = {}) {
  const todoId = cleanText(value.todoId ?? value.todo_id ?? value.id);
  const refId = cleanText(value.refId ?? value.ref_id ?? value.ref);
  const refType = cleanText(value.refType ?? value.ref_type) || inferTodoRefType(value, refId);
  const handled = isHandled(value);
  return {
    todoId,
    type: cleanText(value.type),
    customerId: cleanText(value.customerId ?? value.customer_id),
    refType,
    refId,
    handled,
    summary: cleanText(value.summary),
    latestNeededAt: cleanText(value.latestNeededAt ?? value.latest_needed_at ?? value.dueAt ?? value.due_at ?? value.latest),
    urgency: cleanText(value.urgency ?? value.priority),
    impact: cleanText(value.impact),
    notificationCopyText: cleanText(value.notificationCopyText ?? value.notification_copy_text),
    notificationChannel: cleanText(value.notificationChannel ?? value.notification_channel),
    notificationStatus: cleanText(value.notificationStatus ?? value.notification_status),
    photoPrompt: cleanText(value.photoPrompt ?? value.photo_prompt),
  };
}

function listTodos({ workspace, searchParams, now = new Date() }) {
  const projectedAt = normalizeDate(now);
  const keyword = cleanText(searchParams?.get("keyword"));
  const type = cleanText(searchParams?.get("type"));
  const status = cleanText(searchParams?.get("status")) || "open";
  const priority = normalizePriority(searchParams?.get("priority"), "");

  let items = asArray(workspace?.todos).map((todo) => projectTodo({ workspace, todo, now: projectedAt }));
  if (keyword) {
    items = items.filter((item) => [
      item.todoId,
      item.type,
      item.refId,
      item.summary,
      item.impact,
      item.customerName,
    ].some((field) => cleanText(field).includes(keyword)));
  }
  if (type && type !== "all") items = items.filter((item) => item.type === type);
  if (status === "open") items = items.filter((item) => !item.handled);
  if (status === "handled") items = items.filter((item) => item.handled);
  if (priority) items = items.filter((item) => item.priority === priority);

  const sortedItems = sortTodoReminderItems(items);
  return {
    ...paginate(sortedItems, searchParams),
    reminderPolicy: getTodoReminderPolicyMetadata(),
  };
}

function projectTodo({ workspace, todo, now = new Date() }) {
  const projectedAt = normalizeDate(now);
  const summary = summarizeTodo(todo);
  const referenceTodo = {
    ...todo,
    id: summary.todoId,
    todoId: summary.todoId,
    customerId: summary.customerId,
    refType: summary.refType,
    refId: summary.refId,
    ref: summary.refId,
    type: summary.type,
  };
  const reference = resolveTodoReference(workspace ?? {}, referenceTodo);
  const reminderProjection = projectTodoReminder(
    { ...todo, ...summary, ...reference },
    { now: projectedAt },
  );
  const priority = normalizePriority(todo.urgency ?? todo.priority);
  return {
    ...summary,
    ...reference,
    allowedRefTypes: getAllowedTodoReferenceTypes(referenceTodo),
    resolvedRefTypeLabel: getTodoReferenceTypeLabel(reference.resolvedRefType),
    referenceCandidates:
      reference.referenceStatus === "valid" ? [] : listTodoReferenceCandidates(workspace ?? {}, referenceTodo),
    referenceRepair: todo.referenceRepair ?? todo.reference_repair ?? null,
    status: mapTodoStatus(todo, reminderProjection),
    priority,
    customerName: findCustomerName(workspace, summary.customerId),
    title: summary.type,
    wait: cleanText(todo.wait),
    urgency: summary.urgency,
    lastAction: cleanText(todo.lastAction ?? todo.last_action),
    reminder: cleanText(todo.reminder),
    remindAt: cleanText(todo.remindAt ?? todo.remind_at),
    snoozeUntil: cleanText(todo.snoozeUntil ?? todo.snooze_until),
    handledBy: cleanText(todo.handledBy ?? todo.handled_by),
    handledAt: cleanText(todo.handledAt ?? todo.handled_at),
    handlingResult: cleanText(todo.handlingResult ?? todo.handling_result),
    notificationCopiedBy: cleanText(todo.notificationCopiedBy ?? todo.notification_copied_by),
    notificationCopiedAt: cleanText(todo.notificationCopiedAt ?? todo.notification_copied_at),
    notifiedBy: cleanText(todo.notifiedBy ?? todo.notified_by),
    notifiedAt: cleanText(todo.notifiedAt ?? todo.notified_at),
    printResultStatus: cleanText(todo.printResultStatus ?? todo.print_result_status),
    printedLabelCount: nonNegativeInteger(todo.printedLabelCount ?? todo.printed_label_count),
    pendingLabelCount: nonNegativeInteger(todo.pendingLabelCount ?? todo.pending_label_count),
    totalLabelCount: nonNegativeInteger(todo.totalLabelCount ?? todo.total_label_count),
    printedPackageIds: stringList(todo.printedPackageIds ?? todo.printed_package_ids),
    pendingPackageIds: stringList(todo.pendingPackageIds ?? todo.pending_package_ids),
    printPackages: asArray(todo.printPackages ?? todo.print_packages),
    createdAt: normalizeTimestamp(todo.createdAt ?? todo.created_at, projectedAt),
    ...reminderProjection,
  };
}

function paginate(items, searchParams) {
  const page = positiveInteger(searchParams?.get("page"), 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, positiveInteger(searchParams?.get("pageSize"), 50));
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
  };
}

function mapTodoStatus(todo, reminderProjection) {
  if (isHandled(todo)) return "handled";
  if (reminderProjection.activeSnooze) return "snoozed";
  if (todo.reopenedAt ?? todo.reopened_at) return "reopened";
  return "open";
}

function normalizePriority(value, fallback = "normal") {
  const text = cleanText(value).toLowerCase();
  const map = {
    urgent: "urgent",
    exception: "exception",
    management_watch: "management_watch",
    normal: "normal",
    急: "urgent",
    今天: "urgent",
    异常: "exception",
    关注: "management_watch",
    普通: "normal",
  };
  return map[text] ?? fallback;
}

function inferTodoRefType(todo, refId) {
  const type = cleanText(todo.type);
  if (type.includes("设备") || type.includes("报修") || type.includes("巡检") || type.includes("维护")) return "maintenance_task";
  if (type.includes("订单草稿")) return "order_draft";
  if (type.includes("库存修正")) return "inventory_correction";
  if (type.includes("对账") || type.includes("收款")) return "statement";
  if (type.includes("打印") || type.includes("标签") || type.includes("快递") || type.includes("快运") || type.includes("数量")) {
    return "fulfillment";
  }
  if (type.includes("生产") || type.includes("制袋") || type.includes("丝印")) return "production_task";
  if (refId.startsWith("ST-")) return "statement";
  if (refId.startsWith("DRAFT")) return "order_draft";
  if (refId.startsWith("F")) return "fulfillment";
  if (refId.startsWith("MT-")) return "maintenance_task";
  return "order_line";
}

function findCustomerName(workspace, customerId) {
  return cleanText(asArray(workspace?.customers).find((customer) => cleanText(customer.id) === customerId)?.name);
}

function isHandled(todo) {
  const status = cleanText(todo.status).toLowerCase();
  return todo.handled === true || status === "handled" || status === "已处理";
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.trunc(number) : fallback;
}

function normalizeTimestamp(value, fallbackDate) {
  const timestamp = Date.parse(cleanText(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallbackDate.toISOString();
}

function normalizeDate(value) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(cleanText(value));
  return Number.isFinite(timestamp) ? new Date(timestamp) : new Date();
}

function stringList(value) {
  return asArray(value).map(cleanText).filter(Boolean);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value) {
  return String(value ?? "").trim();
}
