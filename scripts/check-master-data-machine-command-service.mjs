import assert from "node:assert/strict";
import { buildDefaultMasterDataMachines } from "../server/masterDataMachineConfigurationRepository.mjs";
import { buildLegacyImportedMachineId } from "../shared/masterDataMachineIdentity.js";
import {
  createMasterDataMachineCommandService,
  listMasterDataMachines,
} from "../server/services/masterDataMachineCommandService.mjs";

const fixedNow = new Date("2026-07-15T09:00:00.000Z");
let logSequence = 0;
const service = createMasterDataMachineCommandService({
  now: () => fixedNow,
  buildOperationLog(_workspace, input) {
    logSequence += 1;
    return {
      id: `LOG-MACHINE-${logSequence}`,
      ...input,
      occurredAt: fixedNow.toISOString(),
      createdAt: fixedNow.toISOString(),
    };
  },
});
assert.throws(() => createMasterDataMachineCommandService(), /buildOperationLog must be a function/);

const workspace = createWorkspace();
assert.equal(listMasterDataMachines(workspace).length, 13);
assert.equal(listMasterDataMachines(workspace, { workshop: "丝印车间" }).length, 4);
assert.equal(listMasterDataMachines(workspace, { keyword: "2号制袋" })[0]?.machineId, "BAG-02");
workspace.employees.push({
  employeeId: "EMP-LEGACY-1",
  name: "历史1号机员工",
  roleName: "车间报工",
  defaultMachineId: buildLegacyImportedMachineId("1号机", "1号车间"),
  assignmentMode: "fixed_machine",
  profileStatus: "pending_admin_review",
});
const legacyOccupied = listMasterDataMachines(workspace).find((machine) => machine.machineId === "BAG-01");
assert.equal(legacyOccupied.assignedEmployeeCount, 1);
assert.equal(legacyOccupied.assignedEmployees[0].employeeId, "EMP-LEGACY-1");
workspace.employees = [];

const invalid = await service.createMachine({
  workspace,
  body: { machineId: "非法 编号", name: "测试机", machineType: "other", workshop: "测试车间", status: "active", reason: "测试" },
  operatorId: "U-MANAGER-A",
});
assert.equal(invalid.code, "MASTER_DATA_MACHINE_ID_INVALID");

const created = await service.createMachine({
  workspace,
  body: { machineId: "bag-10", name: "10号制袋机", machineType: "bag_making", workshop: "4号车间", status: "active", reason: "新增4号车间机台" },
  operatorId: "U-MANAGER-A",
});
assert.equal(created.statusCode, 200);
assert.equal(created.response.machine.machineId, "BAG-10");
assert.equal(created.response.machine.workshop, "4号车间");
assert.equal(created.response.machine.lastChange.operatorId, "U-MANAGER-A");
assert.equal(created.response.machine.lastChange.reason, "新增4号车间机台");
assert.equal(workspace.operationLogs.at(-1).action, "master_data_machine_created");

const duplicate = await service.createMachine({
  workspace,
  body: { machineId: "BAG-10", name: "重复", machineType: "other", workshop: "4号车间", status: "active", reason: "重复" },
  operatorId: "U-MANAGER-A",
});
assert.equal(duplicate.code, "MASTER_DATA_MACHINE_ALREADY_EXISTS");

const stale = await service.updateMachine({
  workspace,
  machineId: "BAG-10",
  body: { name: "10号制袋机", machineType: "bag_making", workshop: "4号车间", status: "active", reason: "调整名称", expectedUpdatedAt: "2026-07-15T08:00:00.000Z" },
  operatorId: "U-MANAGER-A",
});
assert.equal(stale.code, "MASTER_DATA_MACHINE_WRITE_CONFLICT");

workspace.employees.push({ employeeId: "EMP-1", name: "高彦芹", roleName: "车间报工", defaultMachineId: "BAG-10", assignmentMode: "fixed_machine", profileStatus: "account_enabled" });
const occupiedProjection = listMasterDataMachines(workspace).find((machine) => machine.machineId === "BAG-10");
assert.equal(occupiedProjection.assignedEmployeeCount, 1);
assert.deepEqual(occupiedProjection.assignedEmployees, [{ employeeId: "EMP-1", name: "高彦芹", roleName: "车间报工", assignmentMode: "fixed_machine" }]);
const occupied = await service.updateMachine({
  workspace,
  machineId: "BAG-10",
  body: { name: "10号制袋机", machineType: "bag_making", workshop: "3号车间", status: "inactive", reason: "搬迁停用", expectedUpdatedAt: fixedNow.toISOString() },
  operatorId: "U-MANAGER-A",
});
assert.equal(occupied.code, "MASTER_DATA_MACHINE_ASSIGNED_EMPLOYEE_CONFLICT");
assert.equal(occupied.details.assignedEmployeeCount, 1);

workspace.employees = [];
const updated = await service.updateMachine({
  workspace,
  machineId: "BAG-10",
  body: { name: "10号制袋机（备用）", machineType: "bag_making", workshop: "3号车间", status: "maintenance", reason: "搬迁后检修", expectedUpdatedAt: fixedNow.toISOString() },
  operatorId: "U-MANAGER-A",
});
assert.equal(updated.statusCode, 200);
assert.equal(updated.response.machine.status, "maintenance");
assert.equal(updated.response.machine.enabled, false);
assert.equal(updated.response.machine.workshop, "3号车间");
assert.equal(updated.response.machine.lastChange.operatorId, "U-MANAGER-A");
assert.equal(updated.response.machine.lastChange.reason, "搬迁后检修");
assert.equal(workspace.operationLogs.at(-1).action, "master_data_machine_updated");
assert.equal(listMasterDataMachines(workspace, { status: "maintenance" }).length, 1);

console.log("Master-data machine command checks passed: create, validation, optimistic conflict, named occupancy, update, filters, and latest audit are covered.");

function createWorkspace() {
  const workspace = {
    machines: buildDefaultMasterDataMachines(),
    employees: [],
    operationLogs: [],
  };
  workspace.masterDataMachineConfigurationRepository = {
    async upsertMachine({ machine, operationLog }) {
      const index = workspace.machines.findIndex((item) => item.machineId === machine.machineId);
      workspace.machines = index < 0
        ? [...workspace.machines, machine]
        : workspace.machines.map((item, itemIndex) => itemIndex === index ? machine : item);
      workspace.operationLogs = [...workspace.operationLogs, operationLog];
      return { machine, operationLogId: operationLog.id };
    },
  };
  return workspace;
}
