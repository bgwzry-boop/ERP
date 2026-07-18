import {
  normalizeMasterDataMachine,
  normalizeMasterDataMachines,
} from "../masterDataMachineConfigurationRepository.mjs";
import { resolveConfiguredMasterDataMachine } from "../../shared/masterDataMachineIdentity.js";

const machineIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const machineTypes = new Set(["bag_making", "screen_printing", "cutting", "packing", "other"]);
const machineStatuses = new Set(["active", "maintenance", "inactive"]);

export function createMasterDataMachineCommandService(dependencies = {}) {
  const { buildOperationLog, now = () => new Date() } = dependencies;
  if (typeof buildOperationLog !== "function") throw new TypeError("buildOperationLog must be a function");

  return { createMachine, updateMachine };

  async function createMachine({ workspace, body = {}, operatorId }) {
    const machineId = cleanText(body.machineId).toUpperCase();
    const validation = validateMachineInput({ ...body, machineId });
    if (validation) return validation;
    if (findMachine(workspace, machineId)) {
      return businessError(409, "MASTER_DATA_MACHINE_ALREADY_EXISTS", "Machine ID already exists.");
    }
    const timestamp = now().toISOString();
    const machine = normalizeMasterDataMachine({
      machineId,
      bizNo: cleanText(body.bizNo) || machineId,
      name: body.name,
      machineType: body.machineType,
      workshop: body.workshop,
      status: body.status,
      enabled: cleanText(body.status) === "active",
      settings: {},
      createdBy: operatorId,
      updatedBy: operatorId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const reason = cleanText(body.reason);
    const operationLog = buildOperationLog(workspace, {
      targetType: "master_data_machine",
      targetId: machineId,
      action: "master_data_machine_created",
      before: null,
      after: machineSnapshot(machine),
      reason,
      operatorId,
      pageKey: "master_data",
    });
    const saved = await workspace.masterDataMachineConfigurationRepository.upsertMachine({
      workspace,
      machine,
      operationLog,
      createOnly: true,
      idempotencyKey: cleanText(body.idempotencyKey) || operationLog.id,
      idempotencyPayload: { machine: machineSnapshot(machine), reason },
    });
    return success(saved, workspace);
  }

  async function updateMachine({ workspace, machineId, body = {}, operatorId }) {
    const safeMachineId = cleanText(machineId).toUpperCase();
    const existing = findMachine(workspace, safeMachineId);
    if (!existing) return businessError(404, "MASTER_DATA_MACHINE_NOT_FOUND", "Machine was not found.");
    const validation = validateMachineInput({ ...body, machineId: safeMachineId });
    if (validation) return validation;
    const expectedUpdatedAt = cleanText(body.expectedUpdatedAt);
    if (!expectedUpdatedAt) {
      return businessError(400, "MASTER_DATA_MACHINE_VERSION_REQUIRED", "Current machine version is required.");
    }
    if (expectedUpdatedAt !== cleanText(existing.updatedAt)) {
      return businessError(409, "MASTER_DATA_MACHINE_WRITE_CONFLICT", "Machine changed; refresh before saving.");
    }
    const nextStatus = cleanText(body.status);
    const nextWorkshop = cleanText(body.workshop);
    const assignedEmployeeCount = countAssignedEmployees(workspace, safeMachineId);
    if (assignedEmployeeCount > 0 && (nextStatus !== "active" || nextWorkshop !== cleanText(existing.workshop))) {
      return businessError(
        409,
        "MASTER_DATA_MACHINE_ASSIGNED_EMPLOYEE_CONFLICT",
        "Reassign employees before disabling or moving this machine.",
        { assignedEmployeeCount },
      );
    }
    const timestamp = now().toISOString();
    const machine = normalizeMasterDataMachine({
      ...existing,
      bizNo: cleanText(body.bizNo) || safeMachineId,
      name: body.name,
      machineType: body.machineType,
      workshop: nextWorkshop,
      status: nextStatus,
      enabled: nextStatus === "active",
      updatedBy: operatorId,
      updatedAt: timestamp,
    });
    const reason = cleanText(body.reason);
    const operationLog = buildOperationLog(workspace, {
      targetType: "master_data_machine",
      targetId: safeMachineId,
      action: "master_data_machine_updated",
      before: machineSnapshot(existing),
      after: machineSnapshot(machine),
      reason,
      operatorId,
      pageKey: "master_data",
    });
    const saved = await workspace.masterDataMachineConfigurationRepository.upsertMachine({
      workspace,
      machine,
      operationLog,
      createOnly: false,
      expectedUpdatedAt,
      idempotencyKey: cleanText(body.idempotencyKey) || operationLog.id,
      idempotencyPayload: { machine: machineSnapshot(machine), expectedUpdatedAt, reason },
    });
    return success(saved, workspace);
  }
}

export function listMasterDataMachines(workspace = {}, filters = {}) {
  const keyword = cleanText(filters.keyword).toLowerCase();
  const status = cleanText(filters.status);
  const workshop = cleanText(filters.workshop);
  return normalizeMasterDataMachines(workspace.machines)
    .filter((machine) => !status || machine.status === status)
    .filter((machine) => !workshop || machine.workshop === workshop)
    .filter((machine) => !keyword || [
      machine.machineId,
      machine.bizNo,
      machine.name,
      machine.workshop,
      machine.machineType,
    ].some((value) => cleanText(value).toLowerCase().includes(keyword)))
    .map((machine) => {
      const assignedEmployees = listAssignedEmployees(workspace, machine);
      return {
        ...machine,
        machineTypeLabel: getMachineTypeLabel(machine.machineType),
        statusLabel: getMachineStatusLabel(machine.status),
        assignedEmployeeCount: assignedEmployees.length,
        assignedEmployees,
        lastChange: summarizeLatestMachineChange(workspace, machine.machineId),
      };
    });
}

function validateMachineInput(input = {}) {
  const machineId = cleanText(input.machineId);
  if (!machineIdPattern.test(machineId)) {
    return businessError(400, "MASTER_DATA_MACHINE_ID_INVALID", "Machine ID must use 1-32 letters, numbers, underscores, or hyphens.");
  }
  if (!cleanText(input.name)) return businessError(400, "MASTER_DATA_MACHINE_NAME_REQUIRED", "Machine name is required.");
  if (!cleanText(input.workshop)) return businessError(400, "MASTER_DATA_MACHINE_WORKSHOP_REQUIRED", "Workshop is required.");
  if (!machineTypes.has(cleanText(input.machineType))) {
    return businessError(400, "MASTER_DATA_MACHINE_TYPE_INVALID", "Unknown machine type.");
  }
  if (!machineStatuses.has(cleanText(input.status))) {
    return businessError(400, "MASTER_DATA_MACHINE_STATUS_INVALID", "Unknown machine status.");
  }
  if (!cleanText(input.reason)) return businessError(400, "MASTER_DATA_MACHINE_REASON_REQUIRED", "Change reason is required.");
  return null;
}

function findMachine(workspace, machineId) {
  return normalizeMasterDataMachines(workspace?.machines).find((machine) => machine.machineId === machineId) ?? null;
}

function countAssignedEmployees(workspace, machineId) {
  const machine = resolveConfiguredMasterDataMachine(workspace?.machines, machineId);
  return machine ? listAssignedEmployees(workspace, machine).length : 0;
}

function listAssignedEmployees(workspace, machine) {
  return (Array.isArray(workspace?.employees) ? workspace.employees : [])
    .filter((employee) =>
      resolveConfiguredMasterDataMachine([machine], employee?.defaultMachineId)
      && cleanText(employee?.profileStatus) !== "merged_duplicate",
    )
    .map((employee) => {
      const employeeId = cleanText(employee.employeeId ?? employee.id);
      return {
        employeeId,
        name: cleanText(employee.name) || employeeId,
        roleName: cleanText(employee.roleName),
        assignmentMode: cleanText(employee.assignmentMode) || "fixed_machine",
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN") || left.employeeId.localeCompare(right.employeeId));
}

function summarizeLatestMachineChange(workspace, machineId) {
  const latest = (Array.isArray(workspace?.operationLogs) ? workspace.operationLogs : [])
    .filter((log) =>
      cleanText(log?.targetType) === "master_data_machine"
      && cleanText(log?.targetId) === machineId
      && ["master_data_machine_created", "master_data_machine_updated"].includes(cleanText(log?.action)),
    )
    .sort(compareOperationLogRecency)
    .at(-1);
  if (!latest) return null;
  return {
    action: cleanText(latest.action),
    operatorId: cleanText(latest.operatorId),
    changedAt: cleanText(latest.occurredAt ?? latest.createdAt),
    reason: cleanText(latest.reason),
  };
}

function compareOperationLogRecency(left = {}, right = {}) {
  const leftTime = Date.parse(left.occurredAt || left.createdAt || "");
  const rightTime = Date.parse(right.occurredAt || right.createdAt || "");
  const safeLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
  const safeRightTime = Number.isFinite(rightTime) ? rightTime : 0;
  if (safeLeftTime !== safeRightTime) return safeLeftTime - safeRightTime;
  return cleanText(left.id).localeCompare(cleanText(right.id));
}

function success(saved, workspace) {
  const machine = normalizeMasterDataMachine(saved?.machine);
  return {
    statusCode: 200,
    response: {
      machine: listMasterDataMachines({ ...workspace, machines: [machine] })[0] ?? machine,
      operationLogId: cleanText(saved?.operationLogId),
    },
  };
}

function machineSnapshot(machine) {
  const value = normalizeMasterDataMachine(machine);
  if (!value) return null;
  return {
    machineId: value.machineId,
    bizNo: value.bizNo,
    name: value.name,
    machineType: value.machineType,
    workshop: value.workshop,
    status: value.status,
    enabled: value.enabled,
  };
}

function getMachineTypeLabel(value) {
  return {
    bag_making: "制袋机",
    screen_printing: "丝印机",
    cutting: "裁切机",
    packing: "打包设备",
    other: "其他设备",
  }[value] ?? "其他设备";
}

function getMachineStatusLabel(value) {
  return { active: "启用", maintenance: "检修中", inactive: "停用" }[value] ?? "停用";
}

function businessError(statusCode, code, message, details) {
  return { error: true, statusCode, code, message, ...(details ? { details } : {}) };
}

function cleanText(value) {
  return String(value ?? "").trim();
}
