import {
  readOfficeApiJson,
  requestOfficeApi,
  toOfficeApiError,
} from "./officeApiClientCore.js";

export async function listMaintenanceTasks(input = {}, options = {}) {
  const { authState, operatorId, status = "all", taskType = "", machineId = "" } = input;
  const search = new URLSearchParams();
  if (status) search.set("status", status);
  if (taskType) search.set("taskType", taskType);
  if (machineId) search.set("machineId", machineId);
  try {
    const response = await requestOfficeApi(`/maintenance/tasks?${search.toString()}`, {
      ...options,
      authState,
      operatorId,
    });
    const json = await readOfficeApiJson(response);
    if (!response.ok) return apiFailure(json, response.status, "设备任务读取失败。");
    const statuses = new Set(['待检查','待处理','待维护','处理中','已恢复','等待配件','需要停机','转办公室协调','已完成']);
    if (!Array.isArray(json?.items) || !Number.isSafeInteger(json.total) || json.total !== json.items.length
      || json.items.some(item => !cleanText(item?.id ?? item?.taskId)
        || (item.id && item.taskId && item.id !== item.taskId)
        || !Number.isSafeInteger(item.revision) || item.revision < 1 || !statuses.has(item.status))
      || new Set(json.items.map(item => cleanText(item.id ?? item.taskId))).size !== json.items.length) {
      return unavailable('MAINTENANCE_TASK_LIST_INVALID', null, '设备任务数据不完整或相互冲突，请重新读取后再处理。');
    }
    const items = json.items.map(normalizeMaintenanceTask);
    return { source: "api", items, total: json.total };
  } catch (error) {
    return unavailable("MAINTENANCE_TASK_LIST_UNAVAILABLE", error, "设备任务服务暂时不可用，请稍后重试。");
  }
}

export async function createMaintenanceTask(input = {}, options = {}) {
  const { authState, operatorId, ...body } = input;
  return writeMaintenanceTask("/maintenance/tasks", { authState, operatorId, body }, options, "设备任务创建失败。");
}

export async function updateMaintenanceTask(input = {}, options = {}) {
  const { authState, operatorId, taskId, ...body } = input;
  if (!cleanText(taskId)) {
    return { source: "client_validation", blocked: true, error: { code: "MAINTENANCE_TASK_REQUIRED", message: "缺少设备任务编号。" } };
  }
  return writeMaintenanceTask(
    `/maintenance/tasks/${encodeURIComponent(taskId)}/update`,
    { authState, operatorId, body, taskId: cleanText(taskId) },
    options,
    "设备任务提交失败。",
  );
}

async function writeMaintenanceTask(path, input, options, fallbackMessage) {
  try {
    const response = await requestOfficeApi(path, {
      ...options,
      authState: input.authState,
      operatorId: input.operatorId,
      method: "POST",
      body: input.body,
      idempotencyKey: options.idempotencyKey ?? input.body.idempotencyKey,
    });
    const json = await readOfficeApiJson(response);
    if (!response.ok) {
      if (response.status === 408 || response.status >= 500) {
        return unavailable("MAINTENANCE_TASK_SAVE_UNCONFIRMED", null, "服务器未能确认本次保存结果，请保留原内容和请求号重试。");
      }
      return apiFailure(json, response.status, fallbackMessage);
    }
    const task = normalizeMaintenanceTask(json?.task);
    const expectedRevision = input.taskId ? input.body.expectedRevision + 1 : 1;
    if (!task || !cleanText(json?.operationLogId) || !Number.isSafeInteger(json?.task?.revision)
      || json.task.revision !== expectedRevision
      || (input.taskId && (task.id !== input.taskId || task.status !== input.body.status))
      || (!input.taskId && !matchesCreationReceipt(task, input))
      || cleanText(json?.todo?.id ?? json?.todo?.todoId) !== `T-${task.id}`) {
      return unavailable("MAINTENANCE_TASK_SAVE_UNCONFIRMED", null, "未收到完整且匹配的保存回执，结果待核实，请保留原内容和请求号重试。");
    }
    return {
      source: "api",
      task,
      todo: json?.todo ?? null,
      operationLogId: cleanText(json?.operationLogId),
      replayed: json?.replayed === true,
    };
  } catch (error) {
    return unavailable("MAINTENANCE_TASK_WRITE_UNAVAILABLE", error, "未能确认设备任务是否已保存，请保留原内容和请求号重试。");
  }
}

function matchesCreationReceipt(task, { body, operatorId }) {
  const type = cleanText(body.type ?? body.taskType);
  const initialStatus = { "设备报修": "待处理", "日常巡检": "待检查", "预防维护": "待维护" }[type];
  const requestedDate = cleanText(body.dueAt);
  const returnedDate = cleanText(task.dueAt);
  const datesMatch = !requestedDate && !returnedDate
    || Boolean(requestedDate && returnedDate && Number.isFinite(Date.parse(requestedDate))
      && Date.parse(requestedDate) === Date.parse(returnedDate));
  return Boolean(initialStatus && task.status === initialStatus
    && task.machineId === cleanText(body.machineId) && task.type === type
    && task.faultCategory === cleanText(body.faultCategory) && task.summary === cleanText(body.summary)
    && task.priority === (cleanText(body.priority) || "普通")
    && task.assignedTechnicianEmployeeId === cleanText(body.assignedTechnicianEmployeeId)
    && cleanText(task.createdBy) === cleanText(operatorId) && datesMatch);
}

export function normalizeMaintenanceTask(value = {}) {
  const id = cleanText(value?.id ?? value?.taskId);
  if (!id) return null;
  return {
    ...value,
    id,
    taskId: id,
    machineId: cleanText(value.machineId),
    machineName: cleanText(value.machineName),
    type: cleanText(value.type),
    faultCategory: cleanText(value.faultCategory),
    priority: cleanText(value.priority) || "普通",
    status: cleanText(value.status),
    summary: cleanText(value.summary),
    dueAt: cleanText(value.dueAt),
    finding: cleanText(value.finding),
    actionTaken: cleanText(value.actionTaken),
    photoAttachmentIds: stringList(value.photoAttachmentIds),
    assignedTechnicianEmployeeId: cleanText(value.assignedTechnicianEmployeeId),
    actualTechnicianEmployeeId: cleanText(value.actualTechnicianEmployeeId),
    completedAt: cleanText(value.completedAt),
    revision: Math.max(1, Math.trunc(Number(value.revision ?? 1)) || 1),
    updatedAt: cleanText(value.updatedAt),
  };
}

function apiFailure(json, status, fallbackMessage) {
  return {
    source: "api_error",
    blocked: true,
    error: toOfficeApiError(json, status, fallbackMessage),
  };
}

function unavailable(code, error, message) {
  return {
    source: "api_error",
    blocked: true,
    error: { code, message, detail: error?.message ?? String(error) },
  };
}

function stringList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(cleanText).filter(Boolean))];
}

function cleanText(value) {
  return String(value ?? "").trim();
}
