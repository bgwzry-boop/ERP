import { createHash, randomUUID } from "node:crypto";
import { getAllowedTodoReferenceTypes, getTodoReferenceErrorCode, resolveTodoReference } from "./todoReferenceService.mjs";

const reminderLabels = {
  稍后30分钟: "30 分钟后",
  稍后2小时: "2 小时后",
  稍后明早: "明早 09:00",
};

export function createTodoCommandService({ buildOperationLog, now = () => new Date() } = {}) {
  if (typeof buildOperationLog !== "function") throw new TypeError("buildOperationLog must be a function");

  return {
    async handleTodo({ workspace, todoId, body = {}, operatorId, operatorName }) {
      const action = cleanText(body.action);
      if (!supportedActions.has(action)) {
        return businessError(422, "VALIDATION_ERROR", `Unsupported todo action: ${action}`);
      }
      const replay = body.idempotencyKey
        ? await workspace.todoActionRepository.findTodoActionReplay?.({
          action, todoId, idempotencyKey: body.idempotencyKey, idempotencyPayload: body,
        }) : null;
      if (replay) return replay;
      const before = await workspace.todoActionRepository.getTodo({ workspace, todoId });
      if (!before) return { notFound: true, code: "TODO_NOT_FOUND" };
      const alreadyHandled = isTodoHandled(before);
      if (alreadyHandled && ["mark_handled", "batch_print_confirm", "batch_print_result_pending", "customer_notification_sent", "customer_pending", "snooze"].includes(action)) {
        return businessError(409, "TODO_ALREADY_HANDLED", "该待办已处理；再次处理前请先明确重新打开");
      }
      if (!alreadyHandled && action === "reopen") {
        return businessError(409, "TODO_ALREADY_OPEN", "该待办已经处于未处理状态，请刷新后继续");
      }
      const maintenanceTodo = cleanText(before.refType ?? before.ref_type) === "maintenance_task"
        || ["设备报修 · 设备任务", "日常巡检 · 设备任务", "预防维护 · 设备任务"].includes(before.type);
      if (maintenanceTodo && action === "reopen") {
        return businessError(409, "TODO_MAINTENANCE_REOPEN_REQUIRES_SOURCE", "已完工设备任务保留原维修结果，不能单独重开待办。设备再次出现问题时，请在设备报修中新建任务并说明关联的原任务编号。");
      }
      if (maintenanceTodo && ["mark_handled", "batch_print_confirm", "customer_notification_sent"].includes(action)) {
        return businessError(409, "TODO_MAINTENANCE_RESULT_REQUIRED", "设备待办须由机修本人提交有效完工结果后同步完成，请进入设备报修查看处理记录。");
      }
      if (before.type === "成品图需重拍" && ["mark_handled", "batch_print_confirm", "customer_notification_sent"].includes(action)) {
        return businessError(409, "TODO_PHOTO_REVIEW_REQUIRED", "重拍待办须在对应生产任务的成品图审核通过后自动完成，请打开生产任务核对原图");
      }
      if (before.type === "生产异常" && ["mark_handled", "batch_print_confirm", "customer_notification_sent"].includes(action)) {
        return businessError(409, "TODO_PRODUCTION_EXCEPTION_RESOLUTION_REQUIRED", "请打开生产任务处理对应异常；只有异常处理的终态决定才能完成该待办，记录售后或质量问题仍需继续跟进。");
      }

      if ((before.type === "待打印标签" && ["mark_handled", "batch_print_confirm", "customer_notification_sent"].includes(action))
        || action === "batch_print_confirm") {
        return businessError(409, "TODO_PRINT_SOURCE_REQUIRED", "打印待办由当前有效的标签打印结果完成，请进入出库交付执行打印；人工结果登记不能代替打印确认");
      }

      const timestamp = nowIso(now);
      if (action === "snooze") {
        const explicit = cleanText(body.snoozeUntil ?? body.remindAt);
        if (body.reason === "稍后指定时间" && !explicit) {
          return businessError(422, "TODO_REMINDER_TIME_REQUIRED", "请选择提醒日期和时间");
        }
        if (explicit && (!isValidReminderInstant(explicit) || Date.parse(explicit) <= Date.parse(timestamp))) {
          return businessError(422, "TODO_REMINDER_TIME_INVALID", "提醒时间必须是带时区的有效未来时间，请重新选择");
        }
      }
      const after = {
        ...applyTodoAction({ before, action, body, operatorId, timestamp }),
        updatedAt: advanceTodoVersion(before.updatedAt, timestamp),
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
    async repairTodoReference({ workspace, todoId, body = {}, operatorId, operatorName }) {
      const refType = cleanText(body.refType).toLowerCase();
      const refId = cleanText(body.refId);
      const reason = cleanText(body.reason);
      if (!refType || !refId || !reason) {
        return businessError(422, "VALIDATION_ERROR", "refType、refId 和 reason 均为必填项");
      }
      const replay = body.idempotencyKey
        ? await workspace.todoActionRepository.findTodoActionReplay?.({
          action: "repair_reference", todoId, idempotencyKey: body.idempotencyKey,
          idempotencyPayload: { refType, refId, reason },
        }) : null;
      if (replay) return { ...replay, reference: {
        referenceStatus: "valid", referenceReason: "",
        resolvedRefType: replay.todo.refType, resolvedRefId: replay.todo.refId,
      } };
      const before = await workspace.todoActionRepository.getTodo({ workspace, todoId });
      if (!before) return { notFound: true, code: "TODO_NOT_FOUND" };
      if (isTodoHandled(before)) return businessError(409, "TODO_ALREADY_HANDLED", "已处理待办不能重新关联业务引用");
      if (resolveTodoReference(workspace, before).referenceStatus === "valid") {
        return businessError(409, "TODO_REFERENCE_STILL_VALID", "当前待办引用仍然有效，无需重新关联");
      }
      if (!getAllowedTodoReferenceTypes(before).includes(refType)) {
        return businessError(422, "TODO_REFERENCE_TYPE_INCOMPATIBLE", "该业务类型不能关联到当前待办");
      }

      const timestamp = nowIso(now);
      const candidate = { ...before, refType, refId, ref: refId };
      const reference = resolveTodoReference(workspace, candidate);
      if (reference.referenceStatus !== "valid") {
        return businessError(422, getTodoReferenceErrorCode(reference, refId, refType), reference.referenceReason || "重新关联目标不存在或不支持校验");
      }
      const after = {
        ...candidate,
        refType: reference.resolvedRefType,
        refId: reference.resolvedRefId,
        ref: reference.resolvedRefId,
        lastAction: "待办引用已重新关联",
        referenceRepair: {
          beforeRefType: cleanText(before.refType),
          beforeRefId: cleanText(before.refId ?? before.ref),
          afterRefType: reference.resolvedRefType,
          afterRefId: reference.resolvedRefId,
          reason,
          operatorId,
          operatorName: cleanText(operatorName) || operatorId,
          repairedAt: timestamp,
        },
        updatedAt: advanceTodoVersion(before.updatedAt, timestamp),
        createdAt: cleanText(before.createdAt) || timestamp,
      };
      const action = "repair_reference";
      const operationLogId = buildTodoOperationLogId(todoId, action, body.idempotencyKey);
      const operationLog = buildOperationLog(workspace, {
        id: operationLogId,
        targetType: "todo",
        targetId: todoId,
        action: "repair_todo_reference",
        operatorId,
        before,
        after,
        reason,
      });
      const todoEvent = {
        eventId: `TE-${operationLog.id}`,
        todoId,
        eventType: "repair_todo_reference",
        eventPayload: { action, todo: after, operatorName: cleanText(operatorName) || operatorId },
        operatorId,
        occurredAt: timestamp,
        createdAt: timestamp,
      };
      const result = await workspace.todoActionRepository.recordTodoAction({
        workspace,
        action,
        before,
        expectedUpdatedAt: before.updatedAt,
        todo: after,
        todoEvent,
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { refType, refId, reason },
      });
      return { ...result, reference };
    },
    async repairMissingFulfillment({ workspace, todoId, body = {}, operatorId, operatorName }) {
      const reason = cleanText(body.reason);
      const idempotencyKey = cleanText(body.idempotencyKey);
      if (!reason) return businessError(422, "VALIDATION_ERROR", "reason 为必填项");
      const idempotencyPayload = { todoId, reason };
      const replay = idempotencyKey
        ? await workspace.todoActionRepository.findFulfillmentRepairReplay?.({ workspace, idempotencyKey, idempotencyPayload })
        : null;
      if (replay) return replay;

      const before = await workspace.todoActionRepository.getTodo({ workspace, todoId });
      if (!before) return { notFound: true, code: "TODO_NOT_FOUND" };
      if (cleanText(before.type) !== "出库交付待补建") {
        return businessError(409, "TODO_FULFILLMENT_REPAIR_TYPE_MISMATCH", "仅“出库交付待补建”待办可执行该修复");
      }
      if (isTodoHandled(before)) {
        return businessError(409, "TODO_ALREADY_HANDLED", "该待办已经处理，不能重复补建出库交付");
      }
      const reference = resolveTodoReference(workspace, before);
      if (reference.referenceStatus !== "valid" || reference.resolvedRefType !== "order_line") {
        return businessError(409, "TODO_FULFILLMENT_REPAIR_REFERENCE_INVALID", "待办必须有效关联到一个订单行");
      }

      const orderLineId = reference.resolvedRefId;
      const orderLine = findById(workspace.orderLines, orderLineId, "orderLineId");
      if (!orderLine) return { notFound: true, code: "ORDER_LINE_NOT_FOUND" };
      if (findFulfillmentByOrderLineId(workspace, orderLineId)) {
        return businessError(409, "FULFILLMENT_ALREADY_EXISTS", "该订单行已经存在出库交付记录，未重复补建");
      }
      if (normalizeFulfillmentMethod(orderLine.fulfillmentMethod ?? orderLine.fulfillment) !== "express_ltl") {
        return businessError(409, "FULFILLMENT_REPAIR_METHOD_UNSUPPORTED", "V1 仅允许补建快递快运交付记录");
      }

      const completedPackingTasks = (workspace.packingTasks ?? []).filter(
        (task) => cleanText(task.orderLineId ?? task.lineId) === orderLineId && cleanText(task.status) === "已完成",
      );
      if (completedPackingTasks.length === 0) {
        return businessError(409, "PACKING_COMPLETION_REQUIRED", "补建前必须存在已完成的打包任务");
      }
      if (completedPackingTasks.length > 1) {
        return businessError(409, "PACKING_TASK_AMBIGUOUS", "该订单行存在多个已完成打包任务，需先人工核对");
      }
      const packingTask = completedPackingTasks[0];
      const packages = (workspace.packages ?? []).filter(
        (record) => cleanText(record.orderLineId ?? record.lineId) === orderLineId,
      );
      if (packages.length === 0) {
        return businessError(409, "PACKING_PACKAGES_REQUIRED", "补建前必须存在已提交的包裹明细");
      }
      if (packages.some((record) => cleanText(record.fulfillmentId))) {
        return businessError(409, "PACKAGE_FULFILLMENT_CONFLICT", "包裹已经关联其他出库交付记录，未执行补建");
      }
      const packedQty = packages.reduce((sum, record) => sum + finiteInteger(record.packedQty ?? record.qty), 0);
      const actualPackedQty = finiteInteger(packingTask.actualPackedQty);
      if (actualPackedQty <= 0 || packedQty !== actualPackedQty) {
        return businessError(409, "PACKING_PACKAGE_QTY_MISMATCH", "包裹数量合计与打包实数不一致，需先核对");
      }

      const timestamp = nowIso(now);
      const fulfillmentId = nextRepairId("F-REPAIR", orderLineId);
      const labelTodoId = nextRepairId("T-LABEL", todoId);
      const customer = findById(workspace.customers, cleanText(orderLine.customerId));
      const fulfillment = {
        id: fulfillmentId,
        fulfillmentId,
        bizNo: fulfillmentId,
        orderLineId,
        lineId: orderLineId,
        customerId: cleanText(orderLine.customerId),
        customerSnapshot: buildCustomerSnapshot(customer),
        method: cleanText(orderLine.fulfillmentMethod ?? orderLine.fulfillment) || "快递快运",
        expectedQty: finiteInteger(orderLine.originalQty ?? orderLine.qty),
        qty: finiteInteger(orderLine.originalQty ?? orderLine.qty),
        actualQty: packedQty,
        status: "待打印标签",
        latestNeededAt: cleanText(orderLine.latestNeededAt ?? orderLine.latest),
        latest: cleanText(orderLine.latestNeededAt ?? orderLine.latest) || "待确认",
        goods: buildGoodsSummary(orderLine),
        packages: `${packages.length}包`,
        source: "缺失交付受控补建",
        revision: 1,
        createdBy: operatorId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const completedTodo = {
        ...before,
        status: "已处理",
        handled: true,
        handledBy: operatorId,
        handledAt: timestamp,
        handlingResult: `已补建出库交付 ${fulfillmentId}`,
        lastAction: `已补建出库交付 ${fulfillmentId}`,
        updatedAt: advanceTodoVersion(before.updatedAt, timestamp),
      };
      const labelTodo = {
        id: labelTodoId,
        todoId: labelTodoId,
        bizNo: labelTodoId,
        type: "待打印标签",
        customerId: fulfillment.customerId,
        ref: fulfillmentId,
        refType: "fulfillment",
        refId: fulfillmentId,
        priority: "普通",
        urgency: String(fulfillment.latest).includes("今天") ? "今天" : "普通",
        status: "未处理",
        handled: false,
        summary: `${fulfillment.goods || orderLineId} 已补建出库交付，${packedQty} 个 / ${packages.length} 包等待打印快递快运标签。`,
        latest: fulfillment.latest,
        impact: "出库交付已补建，可进入可信标签打印",
        createdBy: operatorId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const augmentedWorkspace = { ...workspace, fulfillments: [fulfillment, ...(workspace.fulfillments ?? [])] };
      if (resolveTodoReference(augmentedWorkspace, labelTodo).referenceStatus !== "valid") {
        return businessError(409, "FULFILLMENT_REPAIR_PROJECTION_INVALID", "补建后的标签待办引用校验失败");
      }

      const operationLogId = buildTodoOperationLogId(todoId, "repair_missing_fulfillment", idempotencyKey);
      const operationLog = buildOperationLog(workspace, {
        id: operationLogId,
        targetType: "todo",
        targetId: todoId,
        action: "repair_missing_fulfillment",
        operatorId,
        before,
        after: {
          todo: completedTodo,
          fulfillment,
          packageIds: packages.map((record) => cleanText(record.packageId ?? record.id)),
          labelTodoId,
        },
        reason,
      });
      const oldTodoEvent = buildTodoEvent({
        eventId: nextRepairId("TE-FULFILL-REPAIR", todoId),
        todo: completedTodo,
        eventType: "fulfillment_repair_completed",
        eventPayload: { fulfillmentId, orderLineId, packingTaskId: cleanText(packingTask.packingTaskId ?? packingTask.id) },
        operatorId,
        operatorName,
        timestamp,
      });
      const newTodoEvent = buildTodoEvent({
        eventId: nextRepairId("TE-FULFILL-LABEL", todoId),
        todo: labelTodo,
        eventType: "todo_source:fulfillment_repaired",
        eventPayload: { fulfillmentId, orderLineId, sourceTodoId: todoId },
        operatorId,
        operatorName,
        timestamp,
      });
      return workspace.todoActionRepository.repairMissingFulfillment({
        workspace,
        beforeTodo: before,
        expectedUpdatedAt: before.updatedAt,
        completedTodo,
        labelTodo,
        oldTodoEvent,
        newTodoEvent,
        fulfillment,
        packages,
        packingTask,
        orderLine,
        operationLog,
        idempotencyKey,
        idempotencyPayload,
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
  "customer_pending",
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
    };
  }
  if (action === "snooze") {
    const reason = cleanText(body.reason) || "稍后30分钟";
    const explicit = cleanText(body.snoozeUntil ?? body.remindAt);
    const reminder = explicit ? new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new Date(explicit)) : reminderLabels[reason] ?? "稍后";
    return {
      ...before,
      reminder,
      remindAt: resolveReminderTimestamp(reason, body.snoozeUntil ?? body.remindAt, timestamp),
      lastAction: `稍后提醒：${reminder}`,
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
    };
  }
  if (action === "mark_viewed") {
    return { ...before, lastAction: "管理查看已提示" };
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
    };
  }
  if (action === "customer_pending") {
    return {
      ...before,
      status: "未处理",
      handled: false,
      reminder: "等待客户回复",
      lastAction: cleanText(body.handlingResult) || "客户待确认",
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
  };
}

function isTodoHandled(todo) { return todo.handled === true || cleanText(todo.status) === "已处理"; }

// updatedAt doubles as the optimistic write token. Keep it increasing even
// when the server clock has not advanced; actual event/handling times stay on
// the server clock and are not synthesized from this token.
function advanceTodoVersion(previous, timestamp) {
  const prior = Date.parse(previous);
  return new Date(Math.max(Date.parse(timestamp), Number.isFinite(prior) ? prior + 1 : 0)).toISOString();
}

function isValidReminderInstant(value) {
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const date = new Date(`${parts[1]}-${parts[2]}-${parts[3]}T00:00:00Z`);
  return date.getUTCFullYear() === Number(parts[1]) && date.getUTCMonth() + 1 === Number(parts[2]) && date.getUTCDate() === Number(parts[3]);
}

function resolveReminderTimestamp(reason, explicitValue, timestamp) {
  const explicit = cleanText(explicitValue);
  if (explicit && Number.isFinite(Date.parse(explicit))) return new Date(explicit).toISOString();
  const base = new Date(timestamp);
  if (reason === "稍后2小时") return new Date(base.getTime() + 2 * 60 * 60 * 1000).toISOString();
  if (reason === "稍后明早") {
    // Shift to the factory calendar before adding a day; UTC's date is
    // still yesterday between 00:00 and 07:59 in China.
    const factoryDay = new Date(base.getTime() + 8 * 60 * 60 * 1000);
    factoryDay.setUTCDate(factoryDay.getUTCDate() + 1);
    factoryDay.setUTCHours(9, 0, 0, 0);
    return new Date(factoryDay.getTime() - 8 * 60 * 60 * 1000).toISOString();
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

function findById(rows, id, alternateKey = "") {
  const safeId = cleanText(id);
  return (rows ?? []).find((item) => cleanText(item.id ?? item[alternateKey]) === safeId) ?? null;
}

function findFulfillmentByOrderLineId(workspace, orderLineId) {
  return (workspace.fulfillments ?? []).find(
    (item) => cleanText(item.orderLineId ?? item.lineId) === cleanText(orderLineId),
  ) ?? null;
}

function normalizeFulfillmentMethod(value) {
  const text = cleanText(value);
  if (text === "快递快运" || text === "express_ltl") return "express_ltl";
  if (text === "自提" || text === "pickup") return "pickup";
  if (text === "送货" || text === "delivery") return "delivery";
  return text || "pending";
}

function buildCustomerSnapshot(customer = {}) {
  return {
    customerId: cleanText(customer.id ?? customer.customerId),
    name: cleanText(customer.name),
    shortName: cleanText(customer.shortName ?? customer.name),
    contact: cleanText(customer.contact),
    phone: cleanText(customer.phone),
    address: cleanText(customer.address),
  };
}

function buildGoodsSummary(orderLine) {
  return [
    orderLine.productName ?? orderLine.product,
    orderLine.size,
    orderLine.bagColor ?? orderLine.color,
  ].map(cleanText).filter(Boolean).join(" ");
}

function buildTodoEvent({ eventId, todo, eventType, eventPayload, operatorId, operatorName, timestamp }) {
  return {
    eventId,
    todoId: todo.id,
    eventType,
    eventPayload: {
      ...eventPayload,
      todo,
      operatorName: cleanText(operatorName) || operatorId,
    },
    operatorId,
    occurredAt: timestamp,
    createdAt: timestamp,
  };
}

function nextRepairId(prefix, value) {
  return `${prefix}-${cleanText(value).replace(/[^a-z0-9]+/gi, "-")}`;
}

function nowIso(now) {
  return new Date(now()).toISOString();
}

function cleanText(value) {
  return String(value ?? "").trim();
}
