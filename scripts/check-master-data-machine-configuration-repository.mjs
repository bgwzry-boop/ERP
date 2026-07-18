import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildDefaultMasterDataMachines,
  buildListMasterDataMachinesQuery,
  buildUpsertMasterDataMachineTransactionQuery,
  createLocalMasterDataMachineConfigurationRepository,
  createMasterDataMachineConfigurationRepository,
  createPostgresMasterDataMachineConfigurationRepository,
  masterDataMachineConfigurationStoreKey,
} from "../server/masterDataMachineConfigurationRepository.mjs";

const storageRoot = mkdtempSync(join(tmpdir(), "erp-machine-config-"));
try {
  const repository = createLocalMasterDataMachineConfigurationRepository({ storageRoot });
  const initialState = repository.loadState();
  assert.equal(repository.kind, "local_json");
  assert.equal(initialState.machines.length, 13);
  assert.equal(initialState.machines.find((machine) => machine.machineId === "BAG-04")?.workshop, "2号车间");
  assert.equal(initialState.machines.find((machine) => machine.machineId === "PRINT-04")?.machineType, "screen_printing");

  const workspace = { machines: initialState.machines, operationLogs: [] };
  const machine = {
    machineId: "BAG-10",
    bizNo: "BAG-10",
    name: "10号制袋机",
    machineType: "bag_making",
    workshop: "4号车间",
    status: "active",
    enabled: true,
    createdBy: "U-MANAGER-A",
    updatedBy: "U-MANAGER-A",
    createdAt: "2026-07-15T09:00:00.000Z",
    updatedAt: "2026-07-15T09:00:00.000Z",
  };
  const operationLog = {
    id: "LOG-MACHINE-1",
    targetType: "master_data_machine",
    targetId: "BAG-10",
    action: "master_data_machine_created",
    reason: "新增4号车间机台",
    operatorId: "U-MANAGER-A",
  };
  const saved = repository.upsertMachine({ workspace, machine, operationLog });
  assert.equal(saved.machine.machineId, "BAG-10");
  assert.equal(saved.operationLogId, "LOG-MACHINE-1");
  assert.equal(workspace.machines.length, 14);

  const reloaded = repository.loadState();
  assert.equal(reloaded.machines.find((item) => item.machineId === "BAG-10")?.workshop, "4号车间");
  assert.equal(reloaded.operationLogs[0]?.id, "LOG-MACHINE-1");
  const storePath = join(storageRoot, masterDataMachineConfigurationStoreKey);
  assert.equal(statSync(storePath).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(storePath, "utf8")).version, 1);
} finally {
  rmSync(storageRoot, { force: true, recursive: true });
}

assert.equal(buildDefaultMasterDataMachines().length, 13);
assert.match(buildListMasterDataMachinesQuery().text, /FROM machines/);
const transactionQuery = buildUpsertMasterDataMachineTransactionQuery({
  machine: {
    machineId: "BAG-10",
    name: "10号制袋机",
    machineType: "bag_making",
    workshop: "4号车间",
    status: "active",
    createdAt: "2026-07-15T09:00:00.000Z",
    updatedAt: "2026-07-15T09:00:00.000Z",
  },
  operationLog: {
    id: "LOG-MACHINE-2",
    targetType: "master_data_machine",
    targetId: "BAG-10",
    action: "master_data_machine_updated",
    reason: "调整机台",
    occurredAt: "2026-07-15T09:00:00.000Z",
    createdAt: "2026-07-15T09:00:00.000Z",
  },
  expectedUpdatedAt: "2026-07-15T08:00:00.000Z",
});
assert.match(transactionQuery.text, /FOR UPDATE/);
assert.match(transactionQuery.text, /ERP_MASTER_DATA_MACHINE_WRITE_CONFLICT/);
assert.match(transactionQuery.text, /INSERT INTO operation_logs/);

let capturedTransaction = null;
const postgresRepository = createPostgresMasterDataMachineConfigurationRepository({
  queryJson: async () => buildDefaultMasterDataMachines().slice(0, 1),
  idempotentTransactionJson: async (request) => {
    capturedTransaction = request;
    return { machine: buildDefaultMasterDataMachines()[0], operationLogId: "LOG-MACHINE-PG" };
  },
});
assert.equal((await postgresRepository.loadState()).machines.length, 1);
const postgresWorkspace = { machines: [], operationLogs: [] };
await postgresRepository.upsertMachine({
  workspace: postgresWorkspace,
  machine: buildDefaultMasterDataMachines()[0],
  operationLog: {
    id: "LOG-MACHINE-PG",
    targetType: "master_data_machine",
    targetId: "BAG-01",
    action: "master_data_machine_created",
    reason: "PostgreSQL test",
    operatorId: "U-MANAGER-A",
  },
  createOnly: true,
});
assert.equal(capturedTransaction.resourceLocks.includes("master-data-machine:BAG-01"), true);
assert.equal(postgresWorkspace.machines[0].machineId, "BAG-01");

assert.throws(
  () => createMasterDataMachineConfigurationRepository({ mode: "unknown" }),
  /Unsupported master-data machine repository mode/,
);

console.log("Master-data machine repository checks passed: defaults, private local persistence, PostgreSQL locking, idempotency, and audit writes are covered.");
