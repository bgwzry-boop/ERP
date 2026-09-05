import { isOfficeApiServerRequired } from "./officeAuthService.js";
import {
  buildOfficeServerRequiredWriteError as buildServerRequiredWriteError,
  readOfficeApiJson as readJson,
  requestOfficeApi as requestTodoApi,
  toOfficeApiError as toApiError,
} from "./officeApiClientCore.js";

export async function listOfficeTodos(input = {}, options = {}) {
  const {
    authState,
    operatorId,
    status = "all",
    type = "",
    keyword = "",
    pageSize = 200,
    localTodos = [],
  } = input;
  const params = new URLSearchParams();
  params.set("status", status);
  params.set("pageSize", String(pageSize));
  if (type) params.set("type", type);
  if (keyword) params.set("keyword", keyword);

  try {
    const response = await requestTodoApi(`/todos?${params.toString()}`, {
      ...options,
      authState,
      method: "GET",
      operatorId,
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "公共待办列表 API 返回错误。"),
        items: localTodos,
        total: localTodos.length,
      };
    }

    const items = Array.isArray(json?.items) ? json.items.map(mapTodoListItem) : [];
    return {
      source: "api",
      items,
      total: Number(json?.total ?? items.length),
      page: Number(json?.page ?? 1),
      pageSize: Number(json?.pageSize ?? pageSize),
      reminderPolicy: mapTodoReminderPolicy(json?.reminderPolicy),
    };
  } catch (error) {
    return {
      source: "local_fallback",
      items: localTodos,
      total: localTodos.length,
      error: {
        code: "TODO_LIST_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function handleOfficeTodoAction(input, options = {}) {
  const {
    authState,
    todoId,
    action,
    operatorId,
    reason,
    handlingResult,
    relatedActionId,
    printResultStatus,
    printedLabelCount,
    pendingLabelCount,
    totalLabelCount,
    printedPackageIds,
    pendingPackageIds,
    printPackages,
    notificationChannel,
    notificationContent,
  } = input;
  const apiPayload = mapTodoUiActionToApiPayload(action, { reason, handlingResult });

  try {
    const response = await requestTodoApi(`/todos/${encodeURIComponent(todoId)}/handle`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        ...apiPayload,
        operatorId,
        relatedActionId,
        printResultStatus,
        printedLabelCount,
        pendingLabelCount,
        totalLabelCount,
        printedPackageIds,
        pendingPackageIds,
        printPackages,
        notificationChannel,
        notificationContent,
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        todoId,
        error: toApiError(json, response.status, "公共待办处理 API 返回错误。"),
      };
    }

    return {
      source: "api",
      todoId,
      todo: json.todo,
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("TODO_HANDLE_API_UNAVAILABLE", error, { todoId });
    }
    return {
      source: "local_fallback",
      todoId,
      error: {
        code: "TODO_HANDLE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function repairOfficeTodoReference(input, options = {}) {
  const { authState, todoId, refType, refId, reason, operatorId, idempotencyKey } = input;
  try {
    const response = await requestTodoApi(`/todos/${encodeURIComponent(todoId)}/reference`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: { refType, refId, reason, idempotencyKey },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        todoId,
        error: toApiError(json, response.status, "待办引用重新关联 API 返回错误。"),
      };
    }
    return {
      source: "api",
      todoId,
      todo: mapTodoListItem(json.todo),
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    return buildServerRequiredWriteError("TODO_REFERENCE_REPAIR_API_UNAVAILABLE", error, { todoId });
  }
}

export async function repairOfficeTodoFulfillment(input, options = {}) {
  const { authState, todoId, reason, operatorId, idempotencyKey } = input;
  try {
    const response = await requestTodoApi(`/todos/${encodeURIComponent(todoId)}/fulfillment-repair`, {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: { reason, idempotencyKey },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        todoId,
        error: toApiError(json, response.status, "出库交付补建 API 返回错误。"),
      };
    }
    return {
      source: "api",
      todoId,
      todo: mapTodoListItem(json.todo),
      labelTodo: mapTodoListItem(json.labelTodo),
      fulfillment: json.fulfillment ?? null,
      packageIds: Array.isArray(json.packageIds) ? json.packageIds : [],
      operationLogId: json.operationLogId,
    };
  } catch (error) {
    return buildServerRequiredWriteError("TODO_FULFILLMENT_REPAIR_API_UNAVAILABLE", error, { todoId });
  }
}

function mapTodoListItem(item = {}) {
  const todoId = cleanText(item.todoId ?? item.id);
  return {
    ...item,
    id: todoId,
    todoId,
    type: cleanText(item.type ?? item.title),
    customerId: cleanText(item.customerId),
    ref: cleanText(item.refId ?? item.ref),
    refId: cleanText(item.refId ?? item.ref),
    summary: cleanText(item.summary),
    wait: cleanText(item.wait) || "刚刚",
    latest: cleanText(item.latestNeededAt ?? item.latest) || "待确认",
    urgency: mapTodoPriorityToUrgency(item.priority, item.urgency),
    impact: cleanText(item.impact),
    handled: item.handled === true || item.status === "handled",
    handledBy: cleanText(item.handledBy),
    handledAt: cleanText(item.handledAt),
    lastAction: cleanText(item.lastAction),
    reminder: cleanText(item.reminder ?? item.snoozeUntil),
    remindAt: cleanText(item.remindAt ?? item.snoozeUntil),
    waitingMinutes: toNonNegativeInteger(item.waitingMinutes),
    waitingLabel: cleanText(item.waitingLabel) || cleanText(item.wait) || "刚刚",
    waitingSource: cleanText(item.waitingSource),
    reminderLevel: cleanText(item.reminderLevel) || "normal",
    reminderLevelLabel: cleanText(item.reminderLevelLabel) || "正常",
    activeSnooze: item.activeSnooze === true,
    dueToday: item.dueToday === true,
    overdue: item.overdue === true,
    serverSortRank: toNonNegativeInteger(item.serverSortRank),
    serverSortIndex: toNonNegativeInteger(item.serverSortIndex),
    printResultStatus: cleanText(item.printResultStatus),
    printedLabelCount: toNonNegativeInteger(item.printedLabelCount),
    pendingLabelCount: toNonNegativeInteger(item.pendingLabelCount),
    totalLabelCount: toNonNegativeInteger(item.totalLabelCount),
    printedPackageIds: Array.isArray(item.printedPackageIds) ? item.printedPackageIds.map(cleanText).filter(Boolean) : [],
    pendingPackageIds: Array.isArray(item.pendingPackageIds) ? item.pendingPackageIds.map(cleanText).filter(Boolean) : [],
    printPackages: Array.isArray(item.printPackages) ? item.printPackages : [],
    notificationCopyText: cleanText(item.notificationCopyText),
    notificationChannel: cleanText(item.notificationChannel),
    notificationStatus: cleanText(item.notificationStatus),
    notificationCopiedBy: cleanText(item.notificationCopiedBy),
    notificationCopiedAt: cleanText(item.notificationCopiedAt),
    photoPrompt: cleanText(item.photoPrompt),
    notifiedBy: cleanText(item.notifiedBy),
    notifiedAt: cleanText(item.notifiedAt),
    createdAt: cleanText(item.createdAt),
    referenceStatus: cleanText(item.referenceStatus) || "unverifiable",
    resolvedRefType: cleanText(item.resolvedRefType ?? item.refType),
    resolvedRefTypeLabel: cleanText(item.resolvedRefTypeLabel),
    resolvedRefId: cleanText(item.resolvedRefId ?? item.refId),
    referenceReason: cleanText(item.referenceReason),
    referenceCandidates: Array.isArray(item.referenceCandidates) ? item.referenceCandidates.map((candidate) => ({
      refType: cleanText(candidate.refType),
      refId: cleanText(candidate.refId),
      label: cleanText(candidate.label),
    })).filter((candidate) => candidate.refType && candidate.refId) : [],
    referenceRepair: item.referenceRepair && typeof item.referenceRepair === "object" ? item.referenceRepair : null,
    allowedRefTypes: Array.isArray(item.allowedRefTypes) ? item.allowedRefTypes.map(cleanText).filter(Boolean) : [],
  };
}

function mapTodoReminderPolicy(value) {
  if (!value || typeof value !== "object") return null;
  return {
    source: cleanText(value.source),
    version: cleanText(value.version),
    redDotAfterMinutes: toNonNegativeInteger(value.redDotAfterMinutes),
    followUpAfterMinutes: toNonNegativeInteger(value.followUpAfterMinutes),
    pinDueToday: value.pinDueToday === true,
  };
}

function mapTodoPriorityToUrgency(priority, fallback) {
  const safeFallback = cleanText(fallback);
  if (safeFallback) return safeFallback;
  const text = cleanText(priority);
  if (text === "urgent") return "急";
  if (text === "exception") return "异常";
  if (text === "management_watch") return "关注";
  return "普通";
}

function toNonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return Math.trunc(number);
}

function cleanText(value) {
  return String(value ?? "").trim();
}

export async function handleOfficeTodoBatch(input, options = {}) {
  const { todoIds = [], ...rest } = input;
  const results = [];

  for (const todoId of todoIds) {
    const result = await handleOfficeTodoAction({ ...rest, todoId }, options);
    if (result.blocked) {
      return {
        source: result.source,
        blocked: true,
        error: result.error,
        results,
      };
    }
    if (result.source === "local_fallback") {
      return {
        source: "local_fallback",
        results,
      };
    }
    results.push(result);
  }

  return {
    source: "api",
    results,
    operationLogIds: results.map((result) => result.operationLogId).filter(Boolean),
  };
}

export function mapTodoUiActionToApiPayload(action, options = {}) {
  if (action === "重新打开") {
    return { action: "reopen", reason: options.reason ?? action };
  }
  if (action?.startsWith("稍后")) {
    return { action: "snooze", reason: options.reason ?? action };
  }
  if (action === "批量打印标签" || action === "打印标签") {
    return {
      action: "batch_print_confirm",
      handlingResult: options.handlingResult ?? action,
      reason: options.reason ?? action,
    };
  }
  if (action === "批量打印结果待处理") {
    return {
      action: "batch_print_result_pending",
      handlingResult: options.handlingResult ?? action,
      reason: options.reason ?? action,
    };
  }
  if (action === "打开管理查看") {
    return {
      action: "mark_viewed",
      handlingResult: options.handlingResult ?? action,
      reason: options.reason ?? action,
    };
  }
  if (action === "复制通知话术") {
    return {
      action: "customer_notification_copied",
      handlingResult: options.handlingResult ?? action,
      reason: options.reason ?? action,
    };
  }
  if (action === "确认已通知客户") {
    return {
      action: "customer_notification_sent",
      handlingResult: options.handlingResult ?? action,
      reason: options.reason ?? action,
    };
  }
  if (action === "客户待确认") {
    return {
      action: "customer_pending",
      handlingResult: options.handlingResult ?? action,
      reason: options.reason ?? action,
    };
  }
  return {
    action: "mark_handled",
    handlingResult: options.handlingResult ?? action,
    reason: options.reason ?? action,
  };
}
