import {
  normalizeInventoryAdjustments,
  normalizeInventoryItems,
  normalizeInventoryLedgerEntries,
  normalizeInventoryReservations,
  normalizePackages,
} from "./productionPackingTransactionRecordNormalizer.mjs";

export function applyProductionPackingWorkspaceMutation(input) {
  const workspace = input.workspace;
  if (!workspace) return;
  if (input.productionTask) {
    workspace.productionTasks = upsertById(workspace.productionTasks ?? [], toWorkspaceProductionTask(input.productionTask));
  }
  if (input.workshopReport) {
    workspace.workshopReports = upsertById(workspace.workshopReports ?? [], toWorkspaceWorkshopReport(input.workshopReport));
  }
  if (input.productionException) {
    workspace.productionExceptions = upsertById(
      workspace.productionExceptions ?? [],
      toWorkspaceProductionException(input.productionException),
    );
  }
  if (input.packingTask) {
    workspace.packingTasks = upsertById(workspace.packingTasks ?? [], toWorkspacePackingTask(input.packingTask));
  }
  if (input.machineCapacityBaseline) {
    const record = toWorkspaceMachineCapacityBaseline(input.machineCapacityBaseline);
    workspace.machineCapacityBaselines = input.authoritative
      ? upsertAuthoritativeMachineCapacityBaseline(workspace.machineCapacityBaselines ?? [], record)
      : upsertMachineCapacityBaseline(workspace.machineCapacityBaselines ?? [], record);
  }
  for (const packageRecord of normalizePackages(input.packages ?? [])) {
    workspace.packages = upsertById(workspace.packages ?? [], toWorkspacePackage(packageRecord));
  }
  if (input.fulfillment) {
    workspace.fulfillments = upsertById(workspace.fulfillments ?? [], toWorkspaceFulfillment(input.fulfillment));
  }
  if (input.orderLine) {
    workspace.orderLines = upsertById(workspace.orderLines ?? [], toWorkspaceOrderLine(input.orderLine));
  }
  if (input.authoritative && input.inventoryItems?.length) {
    applyAuthoritativeWorkspaceInventoryItems(workspace, input.inventoryItems);
  } else {
    applyWorkspaceInventoryAdjustments(workspace, input.inventoryAdjustments ?? []);
  }
  for (const reservation of normalizeInventoryReservations(input.inventoryReservations ?? [])) {
    workspace.inventoryReservations = upsertById(
      workspace.inventoryReservations ?? [],
      toWorkspaceInventoryReservation(reservation),
    );
  }
  for (const ledgerEntry of normalizeInventoryLedgerEntries(input.inventoryLedgerEntries ?? [])) {
    workspace.inventoryLedgers = upsertById(workspace.inventoryLedgers ?? [], toWorkspaceInventoryLedgerEntry(ledgerEntry));
  }
  if (input.todo) {
    workspace.todos = upsertById(workspace.todos ?? [], input.todo);
  }
  if (input.todoEvent) {
    workspace.todoEvents = upsertById(workspace.todoEvents ?? [], input.todoEvent, (value) => value?.eventId);
  }
  if (input.operationLog) {
    workspace.operationLogs = upsertById(workspace.operationLogs ?? [], input.operationLog);
  }
}

function upsertById(rows, row, getId = (value) => value?.id) {
  if (!row) return rows;
  const id = getId(row);
  if (!id) return rows;
  const index = rows.findIndex((item) => getId(item) === id);
  if (index < 0) return [row, ...rows];
  return rows.map((item, itemIndex) => (itemIndex === index ? { ...item, ...row } : item));
}

function toWorkspaceProductionTask(record) {
  return { id: record.productionTaskId, ...record, status: record.taskStatus };
}

function toWorkspaceWorkshopReport(record) {
  return { id: record.reportId, ...record };
}

function toWorkspaceProductionException(record) {
  return { id: record.productionExceptionId, ...record };
}

function toWorkspacePackingTask(record) {
  return { id: record.packingTaskId, ...record, qty: record.plannedQty };
}

function toWorkspaceMachineCapacityBaseline(record) {
  return { id: record.capacityBaselineId, ...record };
}

function toWorkspacePackage(record) {
  return { id: record.packageId, ...record, qty: record.packedQty };
}

function toWorkspaceFulfillment(record) {
  return {
    id: record.fulfillmentId,
    lineId: record.orderLineId,
    orderLineId: record.orderLineId,
    qty: record.expectedQty,
    actualQty: record.actualQty,
    status: record.status,
    confirmedBy: record.confirmedBy,
  };
}

function toWorkspaceOrderLine(record) {
  return {
    ...record,
    id: record.orderLineId,
    status: record.lineStatus,
    exceptions: record.exceptionTags,
  };
}

function toWorkspaceInventoryReservation(record) {
  return {
    id: record.reservationId,
    reservationId: record.reservationId,
    orderLineId: record.orderLineId,
    inventoryItemId: record.inventoryItemId,
    qty: record.reservedQty,
    reservedQty: record.reservedQty,
    reservationType: record.reservationType,
    status: record.status,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
  };
}

function toWorkspaceInventoryLedgerEntry(record) {
  return { id: record.ledgerId, ...record };
}

function upsertMachineCapacityBaseline(rows, record) {
  if (!record?.id) return rows;
  const recordKey = buildMachineCapacityBaselineKey(record);
  const index = rows.findIndex((item) => item.id === record.id || buildMachineCapacityBaselineKey(item) === recordKey);
  if (index < 0) return [record, ...rows];
  return rows.map((item, itemIndex) =>
    itemIndex === index
      ? {
          ...item,
          ...record,
          id: item.id ?? record.id,
          capacityBaselineId: item.capacityBaselineId ?? item.id ?? record.capacityBaselineId,
          dailyCapacityQty: toFiniteInteger(item.dailyCapacityQty ?? item.daily_capacity_qty ?? 0) + toFiniteInteger(record.dailyCapacityQty),
        }
      : item,
  );
}

function upsertAuthoritativeMachineCapacityBaseline(rows, record) {
  if (!record?.id) return rows;
  const recordKey = buildMachineCapacityBaselineKey(record);
  const index = rows.findIndex((item) => item.id === record.id || buildMachineCapacityBaselineKey(item) === recordKey);
  if (index < 0) return [record, ...rows];
  return rows.map((item, itemIndex) => (itemIndex === index ? { ...item, ...record } : item));
}

function buildMachineCapacityBaselineKey(record) {
  return [
    String(record?.machineId ?? record?.machine_id ?? "").trim(),
    String(record?.sizeKey ?? record?.size_key ?? "").trim(),
    String(record?.sourceKind ?? record?.source_kind ?? "").trim(),
    normalizeDateText(record?.effectiveFrom ?? record?.effective_from),
  ].join("|");
}

function applyWorkspaceInventoryAdjustments(workspace, inventoryAdjustments) {
  const adjustments = normalizeInventoryAdjustments(inventoryAdjustments);
  if (!Array.isArray(workspace.inventories) || adjustments.length === 0) return;
  workspace.inventories = workspace.inventories.map((inventory) => {
    const matchingAdjustments = adjustments.filter((adjustment) => adjustment.inventoryItemId === inventory.id);
    if (matchingAdjustments.length === 0) return inventory;
    return matchingAdjustments.reduce(
      (next, adjustment) => ({
        ...next,
        inStock: Math.max(0, Number(next.inStock ?? next.onHand ?? 0) + adjustment.onHandQtyChange),
        reserved: Math.max(0, Number(next.reserved ?? 0) + adjustment.reservedQtyChange),
        locked: Math.max(0, Number(next.locked ?? next.waitingPickupLocked ?? 0) + adjustment.waitingPickupLockedQtyChange),
        revision: positiveRevision(next.revision) + 1,
      }),
      inventory,
    );
  });
}

function applyAuthoritativeWorkspaceInventoryItems(workspace, inventoryItems) {
  const normalizedItems = normalizeInventoryItems(inventoryItems);
  if (normalizedItems.length === 0) return;
  const itemsById = new Map(normalizedItems.map((item) => [item.inventoryItemId, item]));
  const existingItems = Array.isArray(workspace.inventories) ? workspace.inventories : [];
  const existingIds = new Set(existingItems.map((item) => String(item.id ?? item.inventoryItemId ?? "")));
  workspace.inventories = existingItems.map((inventory) => {
    const id = String(inventory.id ?? inventory.inventoryItemId ?? "");
    const saved = itemsById.get(id);
    if (!saved) return inventory;
    return {
      ...inventory,
      inStock: saved.onHandQty,
      onHand: saved.onHandQty,
      reserved: saved.reservedQty,
      locked: saved.waitingPickupLockedQty,
      waitingPickupLocked: saved.waitingPickupLockedQty,
      revision: saved.revision,
    };
  });
  for (const saved of normalizedItems) {
    if (existingIds.has(saved.inventoryItemId)) continue;
    workspace.inventories.push({
      id: saved.inventoryItemId,
      inventoryItemId: saved.inventoryItemId,
      inStock: saved.onHandQty,
      onHand: saved.onHandQty,
      reserved: saved.reservedQty,
      locked: saved.waitingPickupLockedQty,
      waitingPickupLocked: saved.waitingPickupLockedQty,
      revision: saved.revision,
    });
  }
}

function normalizeDateText(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString().slice(0, 10);
}

function toFiniteInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.trunc(number);
}

function positiveRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 1 ? revision : 1;
}
