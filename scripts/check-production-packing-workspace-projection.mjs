import assert from "node:assert/strict";
import { applyProductionPackingWorkspaceMutation } from "../server/productionPackingWorkspaceProjection.mjs";

const workspace = createWorkspace();

checkLocalProjection(workspace);
checkAuthoritativeInventoryProjection(workspace);

console.log("Production packing workspace projection check passed: local and authoritative workspace mappings are covered.");

function checkLocalProjection(target) {
  applyProductionPackingWorkspaceMutation({
    workspace: target,
    productionTask: {
      productionTaskId: "PT-WORKSPACE-001",
      orderLineId: "OL-WORKSPACE-001",
      taskStatus: "已完成",
    },
    workshopReport: { reportId: "WR-WORKSPACE-001", orderLineId: "OL-WORKSPACE-001", qualifiedQty: 80 },
    productionException: { productionExceptionId: "PEX-WORKSPACE-001", productionTaskId: "PT-WORKSPACE-001" },
    packingTask: { packingTaskId: "PKT-WORKSPACE-001", orderLineId: "OL-WORKSPACE-001", plannedQty: 80 },
    machineCapacityBaseline: {
      capacityBaselineId: "MCB-WORKSPACE-001",
      machineId: "BAG-01",
      sizeKey: "30*38",
      sourceKind: "production_report",
      effectiveFrom: "2026-07-16",
      dailyCapacityQty: 80,
    },
    packages: [{ packageId: "PKG-WORKSPACE-001", orderLineId: "OL-WORKSPACE-001", packedQty: 80 }],
    fulfillment: { fulfillmentId: "FUL-WORKSPACE-001", orderLineId: "OL-WORKSPACE-001", expectedQty: 80, actualQty: 80, status: "待打印标签" },
    orderLine: { orderLineId: "OL-WORKSPACE-001", lineStatus: "待打印标签", exceptionTags: [] },
    inventoryAdjustments: [{ inventoryItemId: "INV-WORKSPACE-001", onHandQtyChange: 80, reservedQtyChange: 80 }],
    inventoryReservations: [{ reservationId: "RSV-WORKSPACE-001", orderLineId: "OL-WORKSPACE-001", inventoryItemId: "INV-WORKSPACE-001", reservedQty: 80 }],
    inventoryLedgerEntries: [{ ledgerId: "LEDGER-WORKSPACE-001", inventoryItemId: "INV-WORKSPACE-001", qtyChange: 80 }],
    todo: { id: "TODO-WORKSPACE-001", summary: "打印标签" },
    todoEvent: { eventId: "TODO-EVENT-WORKSPACE-001", todoId: "TODO-WORKSPACE-001" },
    operationLog: { id: "LOG-WORKSPACE-001", action: "complete_production_report" },
  });

  assert.equal(target.productionTasks[0].status, "已完成");
  assert.equal(target.workshopReports[0].id, "WR-WORKSPACE-001");
  assert.equal(target.productionExceptions[0].id, "PEX-WORKSPACE-001");
  assert.equal(target.packingTasks[0].qty, 80);
  assert.equal(target.packages[0].qty, 80);
  assert.equal(target.fulfillments[0].lineId, "OL-WORKSPACE-001");
  assert.equal(target.orderLines[0].status, "待打印标签");
  assert.equal(target.inventories[0].inStock, 180);
  assert.equal(target.inventories[0].reserved, 80);
  assert.equal(target.inventories[0].revision, 2);
  assert.equal(target.inventoryReservations[0].qty, 80);
  assert.equal(target.inventoryLedgers[0].id, "LEDGER-WORKSPACE-001");
  assert.equal(target.todos[0].id, "TODO-WORKSPACE-001");
  assert.equal(target.todoEvents[0].eventId, "TODO-EVENT-WORKSPACE-001");
  assert.equal(target.operationLogs[0].action, "complete_production_report");

  applyProductionPackingWorkspaceMutation({
    workspace: target,
    machineCapacityBaseline: {
      capacityBaselineId: "MCB-WORKSPACE-002",
      machineId: "BAG-01",
      sizeKey: "30*38",
      sourceKind: "production_report",
      effectiveFrom: "2026-07-16T10:00:00.000Z",
      dailyCapacityQty: 20,
    },
  });
  assert.equal(target.machineCapacityBaselines.length, 1);
  assert.equal(target.machineCapacityBaselines[0].dailyCapacityQty, 100);
}

function checkAuthoritativeInventoryProjection(target) {
  applyProductionPackingWorkspaceMutation({
    workspace: target,
    authoritative: true,
    machineCapacityBaseline: {
      capacityBaselineId: "MCB-WORKSPACE-003",
      machineId: "BAG-01",
      sizeKey: "30*38",
      sourceKind: "production_report",
      effectiveFrom: "2026-07-16",
      dailyCapacityQty: 125,
    },
    inventoryItems: [
      { inventoryItemId: "INV-WORKSPACE-001", onHandQty: 175, reservedQty: 75, waitingPickupLockedQty: 5, revision: 4 },
      { inventoryItemId: "INV-WORKSPACE-002", onHandQty: 50, reservedQty: 0, waitingPickupLockedQty: 0, revision: 1 },
    ],
  });

  assert.equal(target.machineCapacityBaselines[0].dailyCapacityQty, 125);
  assert.equal(target.inventories[0].inStock, 175);
  assert.equal(target.inventories[0].onHand, 175);
  assert.equal(target.inventories[0].locked, 5);
  assert.equal(target.inventories[0].revision, 4);
  assert.equal(target.inventories[1].id, "INV-WORKSPACE-002");
  assert.equal(target.inventories[1].inStock, 50);
}

function createWorkspace() {
  return {
    productionTasks: [],
    workshopReports: [],
    productionExceptions: [],
    packingTasks: [],
    packages: [],
    fulfillments: [],
    orderLines: [],
    inventories: [{ id: "INV-WORKSPACE-001", inStock: 100, reserved: 0, locked: 0, revision: 1 }],
    inventoryReservations: [],
    inventoryLedgers: [],
    machineCapacityBaselines: [],
    todos: [],
    todoEvents: [],
    operationLogs: [],
  };
}
