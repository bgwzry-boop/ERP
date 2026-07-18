import { createHash } from "node:crypto";
import { normalizeIdempotencyKey } from "../idempotency.mjs";
import { normalizeMaintenanceTask } from "../maintenanceTaskRepository.mjs";

const taskTypes = new Set(["设备报修", "日常巡检", "预防维护"]);
const priorities = new Set(["普通", "今天", "本周", "异常"]);
const updateStatuses = new Set(["处理中", "已恢复", "等待配件", "需要停机", "转办公室协调"]);
const terminalStatuses = new Set(["已恢复", "已完成"]);

export function createMaintenanceTaskCommandService({ buildOperationLog, now = () => new Date() } = {}) {
  if (typeof buildOperationLog !== "function") throw new TypeError("buildOperationLog must be a function.");
  if (typeof now !== "function") throw new TypeError("now must be a function.");
  return Object.freeze({ createTask, updateTask });

  async function createTask({ workspace, body = {}, operatorId } = {}) {
    const idempotencyKey = readIdempotencyKey(body);
    if (idempotencyKey.error) return idempotencyKey;
    const machine = findMachine(workspace, body.machineId);
    if (!machine) return error(404, "MAINTENANCE_MACHINE_NOT_FOUND", "请选择有效机台后再创建任务。");
    const type = cleanText(body.type ?? body.taskType);
    const priority = cleanText(body.priority) || "普通";
    const faultCategory = cleanText(body.faultCategory);
    const summary = cleanText(body.summary);
    if (!taskTypes.has(type)) return error(422, "MAINTENANCE_TASK_TYPE_INVALID", "设备任务类型无效。");
    if (!priorities.has(priority)) return error(422, "MAINTENANCE_TASK_PRIORITY_INVALID", "设备任务优先级无效。");
    if (!faultCategory || faultCategory.length > 80) return error(422, "MAINTENANCE_FAULT_CATEGORY_REQUIRED", "请填写 80 个字以内的故障或检查分类。");
    if (summary.length < 2 || summary.length > 300) return error(422, "MAINTENANCE_TASK_SUMMARY_REQUIRED", "请填写 2–300 个字的任务说明。");
    const dueAt = nullableTimestamp(body.dueAt);
    if (body.dueAt && !dueAt) return error(422, "MAINTENANCE_TASK_DUE_AT_INVALID", "最晚处理时间无效。");
    const assignedEmployeeId = cleanText(body.assignedTechnicianEmployeeId);
    if (assignedEmployeeId && !findFormalEmployee(workspace, assignedEmployeeId)) {
      return error(422, "MAINTENANCE_ASSIGNEE_INVALID", "指定机修人员必须是有效正式员工。");
    }
    const timestamp = now().toISOString();
    const taskId = buildStableId("MT", idempotencyKey.value);
    const task = normalizeMaintenanceTask({
      id: taskId,
      bizNo: taskId,
      machineId: cleanText(machine.id ?? machine.machineId),
      machineName: cleanText(machine.name ?? machine.machineName ?? machine.label),
      type,
      faultCategory,
      priority,
      status: initialStatus(type),
      summary,
      dueAt,
      finding: "",
      actionTaken: "",
      photoAttachmentIds: [],
      assignedTechnicianEmployeeId: assignedEmployeeId,
      actualTechnicianEmployeeId: "",
      completedAt: "",
      createdBy: operatorId,
      updatedBy: operatorId,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const todo = buildMaintenanceTodo(task, { operatorId, timestamp });
    const operationLog = buildOperationLog(workspace, {
      targetType: "maintenance_task",
      targetId: task.id,
      action: "maintenance_task_created",
      before: null,
      after: taskSnapshot(task),
      reason: summary,
      operatorId,
      pageKey: "maintenance_mobile",
    });
    return write(workspace, "createTask", {
      workspace, task, todo, operationLog,
      idempotencyKey: idempotencyKey.value,
      idempotencyPayload: { machineId: task.machineId, type, faultCategory, priority, summary, dueAt, assignedEmployeeId },
    }, 201);
  }

  async function updateTask({ workspace, taskId, body = {}, operatorId } = {}) {
    const idempotencyKey = readIdempotencyKey(body);
    if (idempotencyKey.error) return idempotencyKey;
    const current = findTask(workspace, taskId);
    if (!current) return error(404, "MAINTENANCE_TASK_NOT_FOUND", "设备任务不存在。");
    if (terminalStatuses.has(current.status)) return error(409, "MAINTENANCE_TASK_ALREADY_COMPLETED", "该设备任务已经完工，不能覆盖历史结果。");
    const expectedRevision = positiveInteger(body.expectedRevision);
    if (!expectedRevision) return error(400, "EXPECTED_REVISION_REQUIRED", "提交前必须携带当前任务版本。");
    if (expectedRevision !== current.revision) {
      return error(409, "MAINTENANCE_TASK_REVISION_CONFLICT", "任务已被其他人更新，请刷新后重试。", { currentTask: current });
    }
    const technician = resolveFormalTechnician(workspace, operatorId);
    if (technician.error) return technician;
    const status = cleanText(body.status);
    const finding = cleanText(body.finding);
    const actionTaken = cleanText(body.actionTaken ?? body.action);
    if (!updateStatuses.has(status)) return error(422, "MAINTENANCE_TASK_STATUS_INVALID", "请选择有效处理状态。");
    if (finding.length < 2 || finding.length > 500) return error(422, "MAINTENANCE_FINDING_REQUIRED", "请填写 2–500 个字的检查发现。");
    if (actionTaken.length < 2 || actionTaken.length > 500) return error(422, "MAINTENANCE_ACTION_REQUIRED", "请填写 2–500 个字的采取措施。");
    const photoAttachmentIds = [...new Set([
      ...current.photoAttachmentIds,
      ...stringList(body.photoAttachmentIds),
    ])];
    const attachmentValidation = validateMaintenanceAttachments(workspace, current.id, photoAttachmentIds, operatorId);
    if (attachmentValidation.error) return attachmentValidation;
    const terminal = terminalStatuses.has(status);
    if (terminal && body.completionConfirmed !== true) {
      return error(422, "MAINTENANCE_COMPLETION_CONFIRMATION_REQUIRED", "提交完工前必须确认冻结的任务、照片和处理结果摘要。");
    }
    if (terminal && !photoAttachmentIds.length) {
      return error(422, "MAINTENANCE_COMPLETION_PHOTO_REQUIRED", "提交完工必须至少上传一张设备照片。");
    }
    const timestamp = now().toISOString();
    const task = normalizeMaintenanceTask({
      ...current,
      status,
      finding,
      actionTaken,
      photoAttachmentIds,
      actualTechnicianEmployeeId: technician.employee.id,
      completedAt: terminal ? timestamp : "",
      updatedBy: operatorId,
      revision: current.revision + 1,
      updatedAt: timestamp,
    });
    const todo = buildMaintenanceTodo(task, { operatorId, timestamp });
    const operationLog = buildOperationLog(workspace, {
      targetType: "maintenance_task",
      targetId: task.id,
      action: terminal ? "maintenance_task_completed" : "maintenance_task_progress_updated",
      before: taskSnapshot(current),
      after: taskSnapshot(task),
      reason: actionTaken,
      operatorId,
      pageKey: "maintenance_mobile",
    });
    return write(workspace, "updateTask", {
      workspace, task, todo, operationLog, expectedRevision,
      idempotencyKey: idempotencyKey.value,
      idempotencyPayload: {
        taskId: task.id, expectedRevision, status, finding, actionTaken,
        photoAttachmentIds, completionConfirmed: body.completionConfirmed === true,
      },
    }, 200);
  }

  async function write(workspace, repositoryMethod, input, statusCode) {
    try {
      const saved = await workspace.maintenanceTaskRepository[repositoryMethod](input);
      return {
        statusCode: saved.replayed === true ? 200 : statusCode,
        response: {
          task: saved.task,
          todo: saved.todo,
          operationLogId: saved.operationLogId || input.operationLog.id,
          replayed: saved.replayed === true,
        },
      };
    } catch (caught) {
      const message = String(caught?.message ?? "");
      if (caught?.code === "BUSINESS_WRITE_CONFLICT" || message.includes("ERP_MAINTENANCE_TASK_REVISION_CONFLICT")) {
        return error(409, "MAINTENANCE_TASK_REVISION_CONFLICT", "任务已被其他人更新，请刷新后重试。", { currentTask: findTask(workspace, input.task.id) });
      }
      if (message.includes("ERP_MAINTENANCE_TASK_CREATE_CONFLICT")) {
        return error(409, "MAINTENANCE_TASK_CREATE_CONFLICT", "设备任务编号已经存在。");
      }
      if (Number.isInteger(caught?.statusCode)) return error(caught.statusCode, caught.code, caught.message, caught.details);
      throw caught;
    }
  }
}

function buildMaintenanceTodo(task, { operatorId, timestamp }) {
  const id = `T-${task.id}`;
  const terminal = terminalStatuses.has(task.status);
  return {
    id,
    todoId: id,
    bizNo: id,
    type: `${task.type} · 设备任务`,
    refType: "maintenance_task",
    refId: task.id,
    priority: task.priority,
    status: terminal ? "已处理" : "未处理",
    summary: `${task.machineName} · ${task.faultCategory} · ${task.status}；${task.summary}`,
    dueAt: task.dueAt,
    remindAt: "",
    handledBy: terminal ? operatorId : "",
    handledAt: terminal ? timestamp : "",
    handlingResult: terminal ? `${task.finding}；${task.actionTaken}` : task.status,
    createdBy: task.createdBy || operatorId,
    createdAt: task.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

function validateMaintenanceAttachments(workspace, taskId, attachmentIds, operatorId) {
  for (const attachmentId of attachmentIds) {
    const attachment = (workspace?.attachments ?? []).find((item) => cleanText(item.attachmentId ?? item.id) === attachmentId);
    if (!attachment) return error(422, "MAINTENANCE_ATTACHMENT_NOT_FOUND", "设备照片不存在或尚未上传完成。");
    if (
      cleanText(attachment.ownerType) !== "maintenance_task"
      || cleanText(attachment.ownerId) !== taskId
      || cleanText(attachment.purpose) !== "maintenance_evidence"
      || cleanText(attachment.status) !== "uploaded"
      || attachment.hasContent !== true
      || cleanText(attachment.uploadedBy) !== cleanText(operatorId)
    ) {
      return error(422, "MAINTENANCE_ATTACHMENT_INVALID", "设备照片必须由当前机修人员上传并绑定当前任务。");
    }
  }
  return { ok: true };
}

function resolveFormalTechnician(workspace, operatorId) {
  const user = (workspace?.users ?? []).find((item) => cleanText(item.userId ?? item.id) === cleanText(operatorId));
  const employee = findFormalEmployee(workspace, user?.employeeId);
  if (!user || !employee) return error(403, "MAINTENANCE_FORMAL_TECHNICIAN_REQUIRED", "机修处理必须使用已绑定正式员工档案的本人账号。");
  return { ok: true, user, employee };
}

function findFormalEmployee(workspace, employeeId) {
  const employee = (workspace?.employees ?? []).find((item) => cleanText(item.id ?? item.employeeId) === cleanText(employeeId));
  if (!employee || !cleanText(employee.name)) return null;
  const source = cleanText(employee.sourceType ?? employee.source).toLowerCase();
  const status = cleanText(employee.profileStatus ?? employee.profile_status).toLowerCase();
  if (["seed", "demo", "synthetic", "real_sample", "isolated_test_fixture"].some((item) => source.includes(item))) return null;
  if (["retired", "voided", "merged", "departed", "left"].some((item) => status.includes(item))) return null;
  return employee;
}

function findMachine(workspace, machineId) {
  const id = cleanText(machineId);
  return (workspace?.machines ?? []).find((item) => cleanText(item.id ?? item.machineId) === id) ?? null;
}

function findTask(workspace, taskId) {
  return normalizeMaintenanceTask((workspace?.maintenanceTasks ?? []).find((item) => cleanText(item.id ?? item.taskId) === cleanText(taskId)));
}

function taskSnapshot(task) {
  return {
    taskId: task.id,
    machineId: task.machineId,
    machineName: task.machineName,
    type: task.type,
    faultCategory: task.faultCategory,
    priority: task.priority,
    status: task.status,
    finding: task.finding,
    actionTaken: task.actionTaken,
    photoAttachmentIds: task.photoAttachmentIds,
    actualTechnicianEmployeeId: task.actualTechnicianEmployeeId,
    completedAt: task.completedAt,
    revision: task.revision,
  };
}

function readIdempotencyKey(body) {
  try {
    const value = normalizeIdempotencyKey(body.idempotencyKey);
    return value ? { ok: true, value } : error(400, "IDEMPOTENCY_KEY_REQUIRED", "设备任务写入必须提供幂等键。");
  } catch (caught) {
    return error(caught.statusCode || 400, caught.code || "IDEMPOTENCY_KEY_INVALID", caught.message);
  }
}

function buildStableId(prefix, key) {
  return `${prefix}-${createHash("sha256").update(key).digest("hex").slice(0, 20).toUpperCase()}`;
}

function initialStatus(type) {
  return { 设备报修: "待处理", 日常巡检: "待检查", 预防维护: "待维护" }[type] ?? "待处理";
}

function nullableTimestamp(value) {
  if (!value) return "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function stringList(value) {
  return (Array.isArray(value) ? value : []).map(cleanText).filter(Boolean);
}

function positiveInteger(value) {
  const number = Math.trunc(Number(value));
  return number > 0 ? number : 0;
}

function error(statusCode, code, message, details) {
  return { error: true, statusCode, code, message, ...(details === undefined ? {} : { details }) };
}

function cleanText(value) {
  return String(value ?? "").trim();
}
