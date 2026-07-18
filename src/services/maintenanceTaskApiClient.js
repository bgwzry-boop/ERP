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
    const items = Array.isArray(json?.items) ? json.items.map(normalizeMaintenanceTask).filter(Boolean) : [];
    return { source: "api", items, total: Number(json?.total ?? items.length) };
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
    { authState, operatorId, body },
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
    });
    const json = await readOfficeApiJson(response);
    if (!response.ok) return apiFailure(json, response.status, fallbackMessage);
    return {
      source: "api",
      task: normalizeMaintenanceTask(json?.task),
      todo: json?.todo ?? null,
      operationLogId: cleanText(json?.operationLogId),
      replayed: json?.replayed === true,
    };
  } catch (error) {
    return unavailable("MAINTENANCE_TASK_WRITE_UNAVAILABLE", error, "设备任务未写入服务器，请检查网络后重试。");
  }
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
