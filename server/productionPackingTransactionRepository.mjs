import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import { buildPostgresIdempotencyRequest, resolveRepositoryIdempotencyKey } from "./idempotency.mjs";

export function createProductionPackingTransactionRepository(options = {}) {
  const mode =
    options.mode ??
    process.env.ERP_PRODUCTION_PACKING_TRANSACTION_STORE ??
    process.env.ERP_PRODUCTION_STORE ??
    "local";
  if (mode === "postgres") {
    return createPostgresProductionPackingTransactionRepository({
      ...options,
      databaseUrl:
        options.databaseUrl ?? process.env.ERP_PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.PGURL,
    });
  }
  if (mode === "local") return createLocalProductionPackingTransactionRepository();
  throw new Error(`Unsupported production packing transaction repository mode: ${mode}`);
}

export function createLocalProductionPackingTransactionRepository() {
  return {
    kind: "local_memory",

    recordProductionReport(input) {
      const transaction = normalizeProductionReportTransactionResult({
        productionTask: input.productionTask,
        workshopReport: input.workshopReport,
        orderLine: input.orderLine,
        packingTask: input.packingTask ?? null,
        machineCapacityBaseline: input.machineCapacityBaseline ?? null,
        inventoryReservations: input.inventoryReservations ?? [],
        inventoryLedgerEntries: input.inventoryLedgerEntries ?? [],
        operationLogId: input.operationLog?.id ?? "",
      });
      applyProductionPackingWorkspaceMutation({
        workspace: input.workspace,
        productionTask: transaction.productionTask,
        workshopReport: transaction.workshopReport,
        orderLine: transaction.orderLine,
        packingTask: transaction.packingTask,
        machineCapacityBaseline: transaction.machineCapacityBaseline,
        inventoryReservations: transaction.inventoryReservations,
        inventoryLedgerEntries: transaction.inventoryLedgerEntries,
        inventoryAdjustments: input.inventoryAdjustments ?? [],
        operationLog: input.operationLog,
      });
      return transaction;
    },

    recordProductionDailyProgress(input) {
      const transaction = normalizeProductionDailyProgressTransactionResult({
        productionTask: input.productionTask,
        workshopReport: input.workshopReport,
        operationLogId: input.operationLog?.id ?? "",
      });
      applyProductionPackingWorkspaceMutation({
        workspace: input.workspace,
        productionTask: transaction.productionTask,
        workshopReport: transaction.workshopReport,
        operationLog: input.operationLog,
      });
      return transaction;
    },

    publishProductionSchedule(input) {
      const transaction = normalizeProductionSchedulePublishTransactionResult({
        productionTask: input.productionTask,
        orderLine: input.orderLine,
        operationLogId: input.operationLog?.id ?? "",
      });
      applyProductionPackingWorkspaceMutation({
        workspace: input.workspace,
        productionTask: transaction.productionTask,
        orderLine: transaction.orderLine,
        operationLog: input.operationLog,
      });
      return transaction;
    },

    completePackingTask(input) {
      const transaction = normalizePackingCompletionTransactionResult({
        packingTask: input.packingTask,
        packages: input.packages ?? [],
        fulfillment: input.fulfillment ?? null,
        orderLine: input.orderLine ?? null,
        inventoryLedgerEntries: input.inventoryLedgerEntries ?? [],
        operationLogId: input.operationLog?.id ?? "",
      });
      applyProductionPackingWorkspaceMutation({
        workspace: input.workspace,
        packingTask: transaction.packingTask,
        packages: transaction.packages,
        fulfillment: transaction.fulfillment,
        orderLine: transaction.orderLine,
        inventoryLedgerEntries: transaction.inventoryLedgerEntries,
        inventoryAdjustments: input.inventoryAdjustments ?? [],
        operationLog: input.operationLog,
      });
      return transaction;
    },
  };
}

export function createPostgresProductionPackingTransactionRepository(options = {}) {
  const databaseUrl = options.databaseUrl;
  const postgresClient =
    options.postgresClient ?? (options.queryJson || options.transactionJson ? null : createPostgresPoolClient({ databaseUrl }));
  const { idempotentTransactionJson } = createPostgresTransactionExecutor({
    ...options,
    databaseUrl,
    postgresClient,
  });

  return {
    kind: "postgres",

    async recordProductionReport(input) {
      const builtQuery = buildRecordProductionReportTransactionQuery(input);
      const saved = normalizeProductionReportTransactionResult(
        await executeIdempotentProductionTransaction({
          input,
          scope: "production.report.complete",
          query: builtQuery,
          idempotentTransactionJson,
          resourceLocks: buildProductionResourceLocks(input),
        }),
      );
      if (!saved.productionTask || !saved.workshopReport) {
        throw new Error("PostgreSQL production report transaction returned an invalid result");
      }
      applyProductionPackingWorkspaceMutation({
        workspace: input.workspace,
        authoritative: true,
        productionTask: saved.productionTask,
        workshopReport: saved.workshopReport,
        orderLine: saved.orderLine,
        packingTask: saved.packingTask,
        machineCapacityBaseline: saved.machineCapacityBaseline,
        inventoryReservations: saved.inventoryReservations,
        inventoryLedgerEntries: saved.inventoryLedgerEntries,
        inventoryItems: saved.inventoryItems,
        inventoryAdjustments: input.inventoryAdjustments ?? [],
        operationLog: toSavedOperationLog(input.operationLog, saved.operationLogId),
      });
      return saved;
    },

    async recordProductionDailyProgress(input) {
      const builtQuery = buildRecordProductionDailyProgressTransactionQuery(input);
      const saved = normalizeProductionDailyProgressTransactionResult(
        await executeIdempotentProductionTransaction({
          input,
          scope: "production.daily_progress.record",
          query: builtQuery,
          idempotentTransactionJson,
          resourceLocks: buildProductionResourceLocks(input),
        }),
      );
      if (!saved.productionTask || !saved.workshopReport) {
        throw new Error("PostgreSQL production daily progress transaction returned an invalid result");
      }
      applyProductionPackingWorkspaceMutation({
        workspace: input.workspace,
        authoritative: true,
        productionTask: saved.productionTask,
        workshopReport: saved.workshopReport,
        operationLog: toSavedOperationLog(input.operationLog, saved.operationLogId),
      });
      return saved;
    },

    async publishProductionSchedule(input) {
      const builtQuery = buildPublishProductionScheduleTransactionQuery(input);
      const saved = normalizeProductionSchedulePublishTransactionResult(
        await executeIdempotentProductionTransaction({
          input,
          scope: "production.schedule.publish",
          query: builtQuery,
          idempotentTransactionJson,
          resourceLocks: buildProductionResourceLocks(input),
        }),
      );
      if (!saved.productionTask) {
        throw new Error("PostgreSQL production schedule publish transaction returned an invalid result");
      }
      applyProductionPackingWorkspaceMutation({
        workspace: input.workspace,
        authoritative: true,
        productionTask: saved.productionTask,
        orderLine: saved.orderLine,
        operationLog: toSavedOperationLog(input.operationLog, saved.operationLogId),
      });
      return saved;
    },

    async completePackingTask(input) {
      const builtQuery = buildCompletePackingTaskTransactionQuery(input);
      const saved = normalizePackingCompletionTransactionResult(
        await executeIdempotentProductionTransaction({
          input,
          scope: "packing.complete",
          query: builtQuery,
          idempotentTransactionJson,
          resourceLocks: buildPackingResourceLocks(input),
        }),
      );
      if (!saved.packingTask) {
        throw new Error("PostgreSQL packing completion transaction returned an invalid result");
      }
      applyProductionPackingWorkspaceMutation({
        workspace: input.workspace,
        authoritative: true,
        packingTask: saved.packingTask,
        packages: saved.packages,
        fulfillment: saved.fulfillment,
        orderLine: saved.orderLine,
        inventoryLedgerEntries: saved.inventoryLedgerEntries,
        inventoryItems: saved.inventoryItems,
        inventoryAdjustments: input.inventoryAdjustments ?? [],
        operationLog: toSavedOperationLog(input.operationLog, saved.operationLogId),
      });
      return saved;
    },
  };
}

function executeIdempotentProductionTransaction({ input, scope, query, idempotentTransactionJson, resourceLocks }) {
  return idempotentTransactionJson(
    buildPostgresIdempotencyRequest({
      scope,
      idempotencyKey: resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id),
      payload: input.idempotencyPayload ?? {},
      operatorId: input.operationLog?.operatorId,
      targetType: input.operationLog?.targetType,
      targetId: input.operationLog?.targetId,
      resourceLocks,
      query,
    }),
  );
}

function toSavedOperationLog(operationLog, operationLogId) {
  const id = String(operationLogId ?? "").trim();
  return operationLog && id ? { ...operationLog, id } : null;
}

function buildProductionResourceLocks(input) {
  return [
    `production-task:${input.productionTask?.productionTaskId ?? input.productionTask?.id ?? ""}`,
    `order-line:${input.orderLine?.orderLineId ?? input.productionTask?.orderLineId ?? ""}`,
    ...(input.inventoryAdjustments ?? []).map((item) => `inventory-item:${item.inventoryItemId ?? ""}`),
    ...(input.inventoryReservations ?? []).map((item) => `inventory-reservation:${item.reservationId ?? ""}`),
  ];
}

function buildPackingResourceLocks(input) {
  return [
    `packing-task:${input.packingTask?.packingTaskId ?? input.packingTask?.id ?? ""}`,
    `order-line:${input.orderLine?.orderLineId ?? input.packingTask?.orderLineId ?? ""}`,
    ...(input.fulfillment ? [`fulfillment:${input.fulfillment.fulfillmentId ?? input.fulfillment.id ?? ""}`] : []),
  ];
}

export function buildRecordProductionReportTransactionSql(input) {
  return buildRecordProductionReportTransactionQuery(input).text;
}

export function buildRecordProductionReportTransactionQuery(input) {
  const productionTask = normalizeProductionTask(input.productionTask);
  const workshopReport = normalizeWorkshopReport(input.workshopReport);
  const orderLine = normalizeOrderLine(input.orderLine);
  const packingTask = normalizePackingTask(input.packingTask);
  const machineCapacityBaseline = normalizeMachineCapacityBaseline(input.machineCapacityBaseline ?? input.capacityBaseline);
  const inventoryReservations = normalizeInventoryReservations(input.inventoryReservations ?? []);
  const inventoryAdjustments = normalizeInventoryAdjustments(input.inventoryAdjustments ?? []);
  const inventoryLedgerEntries = normalizeInventoryLedgerEntries(input.inventoryLedgerEntries ?? []);
  const operationLog = normalizeOperationLog(input.operationLog);
  if (!productionTask || !workshopReport || !operationLog) {
    throw new Error("Production task, workshop report, and operation log are required for production report transaction");
  }

  const parameters = createPostgresParameterBinder();
  const writeGuardCtes = buildProductionWriteGuardCtes({
    productionTask,
    orderLine,
    inventoryAdjustments,
    disallowedStatuses: ["已完成"],
  }, parameters);
  return {
    text: `
BEGIN;
WITH ${writeGuardCtes}
upserted_production_task AS (
  ${buildUpsertProductionTaskSql(productionTask, parameters, "write_guard")}
),
inserted_workshop_report AS (
  ${buildInsertWorkshopReportSql(workshopReport, parameters, "write_guard")}
),
updated_order_line AS (
  ${buildUpdateOrderLineSql(orderLine, parameters, "write_guard")}
),
upserted_packing_task AS (
  ${buildUpsertPackingTaskSql(packingTask, parameters, "write_guard")}
),
upserted_machine_capacity_baseline AS (
  ${buildUpsertMachineCapacityBaselineSql(machineCapacityBaseline, parameters, "write_guard")}
),
inserted_inventory_reservations AS (
  ${buildInsertInventoryReservationsSql(inventoryReservations, parameters, "write_guard")}
),
updated_inventory_items AS (
  ${buildUpdateInventoryItemsSql(inventoryAdjustments, parameters, "write_guard")}
),
inserted_inventory_ledger_entries AS (
  ${buildInsertInventoryLedgerEntriesSql(inventoryLedgerEntries, parameters, "write_guard")}
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters, "write_guard")}
)
SELECT json_build_object(
  'productionTask', (SELECT result FROM upserted_production_task),
  'workshopReport', (SELECT result FROM inserted_workshop_report),
  'orderLine', (SELECT result FROM updated_order_line),
  'packingTask', (SELECT result FROM upserted_packing_task),
  'machineCapacityBaseline', (SELECT result FROM upserted_machine_capacity_baseline),
  'inventoryReservations', (SELECT COALESCE(json_agg(result ORDER BY result->>'reservationId'), '[]'::json) FROM inserted_inventory_reservations),
  'inventoryItems', (SELECT COALESCE(json_agg(result ORDER BY result->>'inventoryItemId'), '[]'::json) FROM updated_inventory_items),
  'inventoryLedgerEntries', (SELECT COALESCE(json_agg(result ORDER BY result->>'ledgerId'), '[]'::json) FROM inserted_inventory_ledger_entries),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function buildRecordProductionDailyProgressTransactionSql(input) {
  return buildRecordProductionDailyProgressTransactionQuery(input).text;
}

export function buildRecordProductionDailyProgressTransactionQuery(input) {
  const productionTask = normalizeProductionTask(input.productionTask);
  const workshopReport = normalizeWorkshopReport(input.workshopReport);
  const orderLine = normalizeOrderLine(input.orderLine);
  const operationLog = normalizeOperationLog(input.operationLog);
  if (!productionTask || !workshopReport || !operationLog) {
    throw new Error("Production task, workshop daily progress report, and operation log are required");
  }

  const parameters = createPostgresParameterBinder();
  const writeGuardCtes = buildProductionWriteGuardCtes({
    productionTask,
    orderLine,
    inventoryAdjustments: [],
    disallowedStatuses: ["已完成", "待完工确认"],
  }, parameters);
  return {
    text: `
BEGIN;
WITH ${writeGuardCtes}
upserted_production_task AS (
  ${buildUpsertProductionTaskSql(productionTask, parameters, "write_guard")}
),
inserted_workshop_report AS (
  ${buildInsertWorkshopReportSql(workshopReport, parameters, "write_guard")}
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters, "write_guard")}
)
SELECT json_build_object(
  'productionTask', (SELECT result FROM upserted_production_task),
  'workshopReport', (SELECT result FROM inserted_workshop_report),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function buildPublishProductionScheduleTransactionSql(input) {
  return buildPublishProductionScheduleTransactionQuery(input).text;
}

export function buildPublishProductionScheduleTransactionQuery(input) {
  const productionTask = normalizeProductionTask(input.productionTask);
  const orderLine = normalizeOrderLine(input.orderLine);
  const operationLog = normalizeOperationLog(input.operationLog);
  if (!productionTask || !operationLog) {
    throw new Error("Production task and operation log are required for production schedule publish transaction");
  }

  const parameters = createPostgresParameterBinder();
  const writeGuardCtes = buildProductionWriteGuardCtes({
    productionTask,
    orderLine,
    inventoryAdjustments: [],
    disallowedStatuses: ["已完成"],
  }, parameters);
  return {
    text: `
BEGIN;
WITH ${writeGuardCtes}
upserted_production_task AS (
  ${buildUpsertProductionTaskSql(productionTask, parameters, "write_guard")}
),
updated_order_line AS (
  ${buildUpdateOrderLineSql(orderLine, parameters, "write_guard")}
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters, "write_guard")}
)
SELECT json_build_object(
  'productionTask', (SELECT result FROM upserted_production_task),
  'orderLine', (SELECT result FROM updated_order_line),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function buildCompletePackingTaskTransactionSql(input) {
  return buildCompletePackingTaskTransactionQuery(input).text;
}

export function buildCompletePackingTaskTransactionQuery(input) {
  const packingTask = normalizePackingTask(input.packingTask);
  const packages = normalizePackages(input.packages ?? []);
  const fulfillment = normalizeFulfillment(input.fulfillment);
  const orderLine = normalizeOrderLine(input.orderLine);
  const inventoryAdjustments = normalizeInventoryAdjustments(input.inventoryAdjustments ?? []);
  const inventoryLedgerEntries = normalizeInventoryLedgerEntries(input.inventoryLedgerEntries ?? []);
  const operationLog = normalizeOperationLog(input.operationLog);
  if (!packingTask || !operationLog) {
    throw new Error("Packing task and operation log are required for packing completion transaction");
  }

  const parameters = createPostgresParameterBinder();
  const writeGuardCtes = buildPackingWriteGuardCtes({ packingTask, orderLine, fulfillment }, parameters);
  return {
    text: `
BEGIN;
WITH ${writeGuardCtes}
upserted_packing_task AS (
  ${buildUpsertPackingTaskSql(packingTask, parameters, "write_guard")}
),
inserted_packages AS (
  ${buildInsertPackagesSql(packages, parameters, "write_guard")}
),
updated_fulfillment AS (
  ${buildUpdateFulfillmentSql(fulfillment, parameters, "write_guard")}
),
updated_order_line AS (
  ${buildUpdateOrderLineSql(orderLine, parameters, "write_guard")}
),
updated_inventory_items AS (
  ${buildUpdateInventoryItemsSql(inventoryAdjustments, parameters, "write_guard")}
),
inserted_inventory_ledger_entries AS (
  ${buildInsertInventoryLedgerEntriesSql(inventoryLedgerEntries, parameters, "write_guard")}
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters, "write_guard")}
)
SELECT json_build_object(
  'packingTask', (SELECT result FROM upserted_packing_task),
  'packages', (SELECT COALESCE(json_agg(result ORDER BY (result->>'packageSeq')::int), '[]'::json) FROM inserted_packages),
  'fulfillment', (SELECT result FROM updated_fulfillment),
  'orderLine', (SELECT result FROM updated_order_line),
  'inventoryItems', (SELECT COALESCE(json_agg(result ORDER BY result->>'inventoryItemId'), '[]'::json) FROM updated_inventory_items),
  'inventoryLedgerEntries', (SELECT COALESCE(json_agg(result ORDER BY result->>'ledgerId'), '[]'::json) FROM inserted_inventory_ledger_entries),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function normalizeProductionReportTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return {
      productionTask: null,
      workshopReport: null,
      orderLine: null,
      packingTask: null,
      machineCapacityBaseline: null,
      inventoryReservations: [],
      inventoryItems: [],
      inventoryLedgerEntries: [],
      operationLogId: "",
    };
  }
  return {
    productionTask: normalizeProductionTask(value.productionTask ?? value.production_task),
    workshopReport: normalizeWorkshopReport(value.workshopReport ?? value.workshop_report),
    orderLine: normalizeOrderLine(value.orderLine ?? value.order_line),
    packingTask: normalizePackingTask(value.packingTask ?? value.packing_task),
    machineCapacityBaseline: normalizeMachineCapacityBaseline(value.machineCapacityBaseline ?? value.machine_capacity_baseline),
    inventoryReservations: normalizeInventoryReservations(value.inventoryReservations ?? value.inventory_reservations ?? []),
    inventoryItems: normalizeInventoryItems(value.inventoryItems ?? value.inventory_items ?? []),
    inventoryLedgerEntries: normalizeInventoryLedgerEntries(value.inventoryLedgerEntries ?? value.inventory_ledger_entries ?? []),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

export function normalizeProductionDailyProgressTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return {
      productionTask: null,
      workshopReport: null,
      operationLogId: "",
    };
  }
  return {
    productionTask: normalizeProductionTask(value.productionTask ?? value.production_task),
    workshopReport: normalizeWorkshopReport(value.workshopReport ?? value.workshop_report),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

export function normalizeProductionSchedulePublishTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return {
      productionTask: null,
      orderLine: null,
      operationLogId: "",
    };
  }
  return {
    productionTask: normalizeProductionTask(value.productionTask ?? value.production_task),
    orderLine: normalizeOrderLine(value.orderLine ?? value.order_line),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

export function normalizePackingCompletionTransactionResult(value) {
  if (!value || typeof value !== "object") {
    return {
      packingTask: null,
      packages: [],
      fulfillment: null,
      orderLine: null,
      inventoryItems: [],
      inventoryLedgerEntries: [],
      operationLogId: "",
    };
  }
  return {
    packingTask: normalizePackingTask(value.packingTask ?? value.packing_task),
    packages: normalizePackages(value.packages ?? []),
    fulfillment: normalizeFulfillment(value.fulfillment),
    orderLine: normalizeOrderLine(value.orderLine ?? value.order_line),
    inventoryItems: normalizeInventoryItems(value.inventoryItems ?? value.inventory_items ?? []),
    inventoryLedgerEntries: normalizeInventoryLedgerEntries(value.inventoryLedgerEntries ?? value.inventory_ledger_entries ?? []),
    operationLogId: String(value.operationLogId ?? value.operation_log_id ?? "").trim(),
  };
}

function applyProductionPackingWorkspaceMutation(input) {
  const workspace = input.workspace;
  if (!workspace) return;
  if (input.productionTask) {
    workspace.productionTasks = upsertById(workspace.productionTasks ?? [], toWorkspaceProductionTask(input.productionTask));
  }
  if (input.workshopReport) {
    workspace.workshopReports = upsertById(workspace.workshopReports ?? [], toWorkspaceWorkshopReport(input.workshopReport));
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
  if (input.operationLog) {
    workspace.operationLogs = upsertById(workspace.operationLogs ?? [], input.operationLog);
  }
}

function buildProductionWriteGuardCtes({ productionTask, orderLine, inventoryAdjustments, disallowedStatuses }, parameters) {
  const inventoryIds = inventoryAdjustments.map((item) => item.inventoryItemId);
  const taskStatusGuard = disallowedStatuses.length
    ? `AND task_status <> ALL(${parameters.textArray(disallowedStatuses)})`
    : "";
  const orderLineCondition = orderLine
    ? `EXISTS (
      SELECT 1 FROM locked_order_line
      WHERE revision = ${parameters.integer(orderLine.revision ?? 1)}
    )`
    : "TRUE";
  const inventoryConditions = inventoryAdjustments
    .filter((item) => item.expectedRevision !== null)
    .map(
      (item) => `erp_require(EXISTS (
      SELECT 1 FROM locked_inventory_items
      WHERE id = ${parameters.text(item.inventoryItemId)}
        AND revision = ${parameters.integer(item.expectedRevision)}
        ${item.expectedOnHandQty === null ? "" : `AND on_hand_qty = ${parameters.integer(item.expectedOnHandQty)}`}
        ${item.expectedReservedQty === null ? "" : `AND reserved_qty = ${parameters.integer(item.expectedReservedQty)}`}
    ), 'ERP_INVENTORY_CONCURRENCY_CONFLICT')`,
    )
    .join("\n    AND ");
  return `locked_production_task AS MATERIALIZED (
  SELECT id, revision, task_status FROM production_tasks
  WHERE id = ${parameters.text(productionTask.productionTaskId)}
  FOR UPDATE
),
locked_order_line AS MATERIALIZED (
  SELECT id, revision FROM order_lines
  WHERE id = ${parameters.text(orderLine?.orderLineId ?? productionTask.orderLineId)}
  FOR UPDATE
),
locked_inventory_items AS MATERIALIZED (
  SELECT id, revision, on_hand_qty, reserved_qty FROM inventory_items
  WHERE id = ANY(${parameters.textArray(inventoryIds)})
  FOR UPDATE
),
write_guard AS MATERIALIZED (
  SELECT erp_require(
    (
      NOT EXISTS (SELECT 1 FROM locked_production_task)
      OR EXISTS (
        SELECT 1 FROM locked_production_task
        WHERE revision = ${parameters.integer(productionTask.revision ?? 1)}
        ${taskStatusGuard}
      )
    ),
    'ERP_PRODUCTION_TASK_CONCURRENCY_CONFLICT'
  )
  AND erp_require(${orderLineCondition}, 'ERP_ORDER_LINE_CONCURRENCY_CONFLICT')
  ${inventoryConditions ? `AND ${inventoryConditions}` : ""} AS ok
),`;
}

function buildPackingWriteGuardCtes({ packingTask, orderLine, fulfillment }, parameters) {
  const orderLineCondition = orderLine
    ? `EXISTS (SELECT 1 FROM locked_order_line WHERE revision = ${parameters.integer(orderLine.revision ?? 1)})`
    : "TRUE";
  const fulfillmentCondition = fulfillment
    ? `EXISTS (SELECT 1 FROM locked_fulfillment WHERE revision = ${parameters.integer(fulfillment.revision ?? 1)})`
    : "TRUE";
  return `locked_packing_task AS MATERIALIZED (
  SELECT id, revision, status FROM packing_tasks
  WHERE id = ${parameters.text(packingTask.packingTaskId)}
  FOR UPDATE
),
locked_order_line AS MATERIALIZED (
  SELECT id, revision FROM order_lines
  WHERE id = ${parameters.text(orderLine?.orderLineId ?? packingTask.orderLineId)}
  FOR UPDATE
),
locked_fulfillment AS MATERIALIZED (
  SELECT id, revision FROM fulfillment_records
  WHERE id = ${parameters.text(fulfillment?.fulfillmentId ?? "")}
  FOR UPDATE
),
write_guard AS MATERIALIZED (
  SELECT erp_require(
    EXISTS (
      SELECT 1 FROM locked_packing_task
      WHERE revision = ${parameters.integer(packingTask.revision ?? 1)}
        AND status <> '已完成'
    ),
    'ERP_PACKING_TASK_CONCURRENCY_CONFLICT'
  )
  AND erp_require(${orderLineCondition}, 'ERP_ORDER_LINE_CONCURRENCY_CONFLICT')
  AND erp_require(${fulfillmentCondition}, 'ERP_FULFILLMENT_CONCURRENCY_CONFLICT') AS ok
),`;
}

function buildUpsertProductionTaskSql(productionTask, parameters, dependency = "") {
  if (!productionTask) return "SELECT NULL::json AS result WHERE false";
  const values = `(
  ${parameters.text(productionTask.productionTaskId)},
  ${parameters.text(productionTask.bizNo)},
  ${parameters.text(productionTask.orderLineId)},
  ${parameters.text(productionTask.taskType)},
  ${parameters.nullableText(productionTask.machineId)},
  ${parameters.integer(productionTask.plannedQty)},
  ${parameters.text(productionTask.taskStatus)},
  ${parameters.nullableText(productionTask.publishedScheduleId)},
  1,
  ${parameters.nullableText(productionTask.createdBy)},
  ${timestampParameter(productionTask.createdAt, parameters)},
  now()
)`;
  return `INSERT INTO production_tasks (
  id,
  biz_no,
  order_line_id,
  task_type,
  machine_id,
  planned_qty,
  task_status,
  published_schedule_id,
  revision,
  created_by,
  created_at,
  updated_at
) ${buildInsertValuesSource(values, ["id", "biz_no", "order_line_id", "task_type", "machine_id", "planned_qty", "task_status", "published_schedule_id", "revision", "created_by", "created_at", "updated_at"], dependency)}
ON CONFLICT (id) DO UPDATE SET
  task_type = EXCLUDED.task_type,
  machine_id = EXCLUDED.machine_id,
  planned_qty = EXCLUDED.planned_qty,
  task_status = EXCLUDED.task_status,
  published_schedule_id = EXCLUDED.published_schedule_id,
  revision = production_tasks.revision + 1,
  updated_at = now()
RETURNING ${productionTaskJsonExpression("production_tasks")} AS result`;
}

function buildInsertWorkshopReportSql(report, parameters, dependency = "") {
  const values = `(
  ${parameters.text(report.reportId)},
  ${parameters.nullableText(report.productionTaskId)},
  ${parameters.text(report.orderLineId)},
  ${parameters.text(report.processType)},
  ${parameters.nullableText(report.machineId)},
  ${parameters.nullableText(report.operatorId)},
  ${parameters.integer(report.qualifiedQty)},
  ${parameters.integer(report.exceptionQty)},
  ${parameters.nullableInteger(report.machineCount)},
  ${parameters.nullableTimestamp(report.startedAt)},
  ${parameters.nullableTimestamp(report.completedAt)},
  ${parameters.nullableText(report.remark)},
  ${parameters.json(report.evidence)},
  ${timestampParameter(report.createdAt, parameters)}
)`;
  return `INSERT INTO workshop_reports (
  id,
  production_task_id,
  order_line_id,
  process_type,
  machine_id,
  operator_id,
  qualified_qty,
  exception_qty,
  machine_count,
  started_at,
  completed_at,
  remark,
  evidence_json,
  created_at
) ${buildInsertValuesSource(values, ["id", "production_task_id", "order_line_id", "process_type", "machine_id", "operator_id", "qualified_qty", "exception_qty", "machine_count", "started_at", "completed_at", "remark", "evidence_json", "created_at"], dependency)}
ON CONFLICT (id) DO UPDATE SET
  qualified_qty = EXCLUDED.qualified_qty,
  exception_qty = EXCLUDED.exception_qty,
  machine_count = EXCLUDED.machine_count,
  completed_at = EXCLUDED.completed_at,
  remark = EXCLUDED.remark,
  evidence_json = EXCLUDED.evidence_json
RETURNING ${workshopReportJsonExpression("workshop_reports")} AS result`;
}

function buildUpdateOrderLineSql(orderLine, parameters, dependency = "") {
  if (!orderLine) return "SELECT NULL::json AS result WHERE false";
  return `UPDATE order_lines
SET
  line_status = ${parameters.text(orderLine.lineStatus)},
  exception_tags = ${parameters.textArray(orderLine.exceptionTags)},
  revision = order_lines.revision + 1,
  updated_at = now()
WHERE id = ${parameters.text(orderLine.orderLineId)}
${buildWriteGuardCondition(dependency)}
RETURNING ${orderLineJsonExpression("order_lines")} AS result`;
}

function buildUpsertPackingTaskSql(packingTask, parameters, dependency = "") {
  if (!packingTask) return "SELECT NULL::json AS result WHERE false";
  const values = `(
  ${parameters.text(packingTask.packingTaskId)},
  ${parameters.text(packingTask.bizNo)},
  ${parameters.text(packingTask.orderLineId)},
  ${parameters.integer(packingTask.plannedQty)},
  ${parameters.integer(packingTask.actualPackedQty)},
  ${parameters.text(packingTask.status)},
  1,
  ${parameters.nullableText(packingTask.createdBy)},
  ${timestampParameter(packingTask.createdAt, parameters)},
  now()
)`;
  return `INSERT INTO packing_tasks (
  id,
  biz_no,
  order_line_id,
  planned_qty,
  actual_packed_qty,
  status,
  revision,
  created_by,
  created_at,
  updated_at
) ${buildInsertValuesSource(values, ["id", "biz_no", "order_line_id", "planned_qty", "actual_packed_qty", "status", "revision", "created_by", "created_at", "updated_at"], dependency)}
ON CONFLICT (id) DO UPDATE SET
  planned_qty = EXCLUDED.planned_qty,
  actual_packed_qty = EXCLUDED.actual_packed_qty,
  status = EXCLUDED.status,
  revision = packing_tasks.revision + 1,
  updated_at = now()
RETURNING ${packingTaskJsonExpression("packing_tasks")} AS result`;
}

function buildUpsertMachineCapacityBaselineSql(record, parameters, dependency = "") {
  if (!record) return "SELECT NULL::json AS result WHERE false";
  return `INSERT INTO machine_capacity_baselines (
  id,
  machine_id,
  size_key,
  daily_capacity_qty,
  hourly_capacity_qty,
  source_kind,
  confidence,
  effective_from,
  remark,
  created_by,
  created_at,
  updated_at
)
SELECT
  ${parameters.text(record.capacityBaselineId)},
  ${parameters.text(record.machineId)},
  ${parameters.text(record.sizeKey)},
  ${parameters.integer(record.dailyCapacityQty)},
  ${parameters.nullableInteger(record.hourlyCapacityQty)},
  ${parameters.text(record.sourceKind)},
  ${parameters.text(record.confidence)},
  ${dateParameter(record.effectiveFrom, parameters)},
  ${parameters.nullableText(record.remark)},
  ${parameters.nullableText(record.createdBy)},
  ${timestampParameter(record.createdAt, parameters)},
  now()
WHERE EXISTS (SELECT 1 FROM machines WHERE id = ${parameters.text(record.machineId)})
${buildWriteGuardCondition(dependency)}
ON CONFLICT (machine_id, size_key, source_kind, effective_from) DO UPDATE SET
  daily_capacity_qty = machine_capacity_baselines.daily_capacity_qty + EXCLUDED.daily_capacity_qty,
  hourly_capacity_qty = EXCLUDED.hourly_capacity_qty,
  confidence = EXCLUDED.confidence,
  remark = EXCLUDED.remark,
  updated_at = now()
RETURNING ${machineCapacityBaselineJsonExpression("machine_capacity_baselines")} AS result`;
}

function buildInsertPackagesSql(packages, parameters, dependency = "") {
  if (packages.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = packages
    .map(
      (record) => `(
    ${parameters.text(record.packageId)},
    ${parameters.text(record.bizNo)},
    ${parameters.text(record.orderLineId)},
    ${parameters.nullableText(record.fulfillmentId)},
    ${parameters.integer(record.packageSeq)},
    ${parameters.integer(record.packageCount)},
    ${parameters.integer(record.packedQty)},
    ${parameters.nullableText(record.labelPrintRecordId)},
    ${parameters.text(record.status)},
    ${parameters.nullableText(record.createdBy)},
    ${timestampParameter(record.createdAt, parameters)},
    now()
  )`,
    )
    .join(",\n");
  return `INSERT INTO packages (
  id,
  biz_no,
  order_line_id,
  fulfillment_id,
  package_seq,
  package_count,
  packed_qty,
  label_print_record_id,
  status,
  created_by,
  created_at,
  updated_at
) ${buildInsertValuesSource(values, ["id", "biz_no", "order_line_id", "fulfillment_id", "package_seq", "package_count", "packed_qty", "label_print_record_id", "status", "created_by", "created_at", "updated_at"], dependency)}
ON CONFLICT (id) DO UPDATE SET
  fulfillment_id = EXCLUDED.fulfillment_id,
  package_seq = EXCLUDED.package_seq,
  package_count = EXCLUDED.package_count,
  packed_qty = EXCLUDED.packed_qty,
  label_print_record_id = EXCLUDED.label_print_record_id,
  status = EXCLUDED.status,
  updated_at = now()
RETURNING ${packageJsonExpression("packages")} AS result`;
}

function buildUpdateFulfillmentSql(fulfillment, parameters, dependency = "") {
  if (!fulfillment) return "SELECT NULL::json AS result WHERE false";
  return `UPDATE fulfillment_records
SET
  expected_qty = ${parameters.integer(fulfillment.expectedQty)},
  actual_qty = ${parameters.nullableInteger(fulfillment.actualQty)},
  status = ${parameters.text(fulfillment.status)},
  confirmed_by = COALESCE(${parameters.nullableText(fulfillment.confirmedBy)}, confirmed_by),
  revision = fulfillment_records.revision + 1,
  updated_at = now()
WHERE id = ${parameters.text(fulfillment.fulfillmentId)}
${buildWriteGuardCondition(dependency)}
RETURNING ${fulfillmentJsonExpression("fulfillment_records")} AS result`;
}

function buildInsertInventoryReservationsSql(records, parameters, dependency = "") {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = records
    .map(
      (record) => `(
    ${parameters.text(record.reservationId)},
    ${parameters.text(record.orderLineId)},
    ${parameters.text(record.inventoryItemId)},
    ${parameters.integer(record.reservedQty)},
    ${parameters.text(record.reservationType)},
    ${parameters.text(record.status)},
    ${parameters.nullableTimestamp(record.expiresAt)},
    ${parameters.nullableText(record.createdBy)},
    ${timestampParameter(record.createdAt, parameters)},
    now()
  )`,
    )
    .join(",\n");
  return `INSERT INTO inventory_reservations (
  id,
  order_line_id,
  inventory_item_id,
  reserved_qty,
  reservation_type,
  status,
  expires_at,
  created_by,
  created_at,
  updated_at
) ${buildInsertValuesSource(values, ["id", "order_line_id", "inventory_item_id", "reserved_qty", "reservation_type", "status", "expires_at", "created_by", "created_at", "updated_at"], dependency)}
ON CONFLICT (id) DO UPDATE SET
  reserved_qty = EXCLUDED.reserved_qty,
  reservation_type = EXCLUDED.reservation_type,
  status = EXCLUDED.status,
  updated_at = now()
RETURNING ${inventoryReservationJsonExpression("inventory_reservations")} AS result`;
}

function buildUpdateInventoryItemsSql(records, parameters, dependency = "") {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = records
    .map(
      (record) =>
        `(${parameters.text(record.inventoryItemId)}, ${parameters.integer(record.onHandQtyChange)}, ${parameters.integer(
          record.reservedQtyChange,
        )}, ${parameters.integer(record.waitingPickupLockedQtyChange)})`,
    )
    .join(",\n");
  return `UPDATE inventory_items AS item
SET
  on_hand_qty = GREATEST(0, item.on_hand_qty + delta.on_hand_qty_change),
  reserved_qty = GREATEST(0, item.reserved_qty + delta.reserved_qty_change),
  waiting_pickup_locked_qty = GREATEST(0, item.waiting_pickup_locked_qty + delta.waiting_pickup_locked_qty_change),
  revision = item.revision + 1,
  updated_at = now()
FROM (
  SELECT
    inventory_item_id,
    SUM(on_hand_qty_change)::INTEGER AS on_hand_qty_change,
    SUM(reserved_qty_change)::INTEGER AS reserved_qty_change,
    SUM(waiting_pickup_locked_qty_change)::INTEGER AS waiting_pickup_locked_qty_change
  FROM (VALUES
${values}
  ) AS raw(inventory_item_id, on_hand_qty_change, reserved_qty_change, waiting_pickup_locked_qty_change)
  GROUP BY inventory_item_id
) AS delta
WHERE item.id = delta.inventory_item_id
${buildWriteGuardCondition(dependency)}
RETURNING json_build_object(
  'inventoryItemId', item.id,
  'onHandQty', item.on_hand_qty,
  'reservedQty', item.reserved_qty,
  'waitingPickupLockedQty', item.waiting_pickup_locked_qty,
  'revision', item.revision
) AS result`;
}

function buildInsertInventoryLedgerEntriesSql(records, parameters, dependency = "") {
  if (records.length === 0) return "SELECT NULL::json AS result WHERE false";
  const values = records
    .map(
      (record) => `(
    ${parameters.text(record.ledgerId)},
    ${parameters.text(record.inventoryItemId)},
    ${parameters.text(record.changeType)},
    ${parameters.integer(record.qtyBefore)},
    ${parameters.integer(record.qtyChange)},
    ${parameters.integer(record.qtyAfter)},
    ${parameters.text(record.sourceType)},
    ${parameters.text(record.sourceId)},
    ${parameters.nullableText(record.operatorId)},
    ${parameters.nullableText(record.confirmedBy)},
    ${timestampParameter(record.occurredAt, parameters)},
    ${timestampParameter(record.createdAt, parameters)},
    ${parameters.nullableText(record.reason)},
    ${parameters.nullableText(record.remark)}
  )`,
    )
    .join(",\n");
  return `INSERT INTO inventory_ledger_entries (
  id,
  inventory_item_id,
  change_type,
  qty_before,
  qty_change,
  qty_after,
  source_type,
  source_id,
  operator_id,
  confirmed_by,
  occurred_at,
  created_at,
  reason,
  remark
) ${buildInsertValuesSource(values, ["id", "inventory_item_id", "change_type", "qty_before", "qty_change", "qty_after", "source_type", "source_id", "operator_id", "confirmed_by", "occurred_at", "created_at", "reason", "remark"], dependency)}
ON CONFLICT (id) DO UPDATE SET
  inventory_item_id = EXCLUDED.inventory_item_id,
  change_type = EXCLUDED.change_type,
  qty_before = EXCLUDED.qty_before,
  qty_change = EXCLUDED.qty_change,
  qty_after = EXCLUDED.qty_after,
  source_type = EXCLUDED.source_type,
  source_id = EXCLUDED.source_id,
  reason = EXCLUDED.reason,
  remark = EXCLUDED.remark
RETURNING ${inventoryLedgerJsonExpression("inventory_ledger_entries")} AS result`;
}

function buildInsertValuesSource(values, columns, dependency) {
  if (!dependency) return `VALUES\n${values}`;
  return `SELECT payload.*
FROM (VALUES\n${values}) AS payload(${columns.join(", ")})
JOIN ${dependency} ON ${dependency}.ok`;
}

function buildWriteGuardCondition(dependency) {
  return dependency ? `AND EXISTS (SELECT 1 FROM ${dependency} WHERE ok)` : "";
}

function buildInsertOperationLogSql(operationLog, parameters, dependency = "") {
  const values = `${parameters.text(operationLog.id)},
  ${parameters.text(operationLog.targetType)},
  ${parameters.text(operationLog.targetId)},
  ${parameters.text(operationLog.action)},
  ${parameters.json(operationLog.before)},
  ${parameters.json(operationLog.after)},
  ${parameters.nullableText(operationLog.reason)},
  ${parameters.nullableText(operationLog.operatorId)},
  ${parameters.text(operationLog.pageKey)},
  ${timestampParameter(operationLog.occurredAt, parameters)},
  ${timestampParameter(operationLog.createdAt, parameters)}`;
  return `INSERT INTO operation_logs (
  id,
  target_type,
  target_id,
  action,
  before_json,
  after_json,
  reason,
  operator_id,
  page_key,
  occurred_at,
  created_at
) ${dependency ? `SELECT ${values} FROM ${dependency} WHERE ok` : `VALUES (${values})`}
ON CONFLICT (id) DO UPDATE SET
  target_type = EXCLUDED.target_type,
  target_id = EXCLUDED.target_id,
  action = EXCLUDED.action,
  before_json = EXCLUDED.before_json,
  after_json = EXCLUDED.after_json,
  reason = EXCLUDED.reason,
  operator_id = EXCLUDED.operator_id,
  page_key = EXCLUDED.page_key
RETURNING id`;
}

function normalizeProductionTask(record) {
  if (!record || typeof record !== "object") return null;
  const productionTaskId = String(record.productionTaskId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? record.lineId ?? "").trim();
  if (!productionTaskId || !orderLineId) return null;
  return {
    ...record,
    productionTaskId,
    bizNo: String(record.bizNo ?? record.biz_no ?? productionTaskId).trim() || productionTaskId,
    orderLineId,
    taskType: String(record.taskType ?? record.task_type ?? "制袋").trim() || "制袋",
    machineId: String(record.machineId ?? record.machine_id ?? "").trim(),
    plannedQty: toFiniteInteger(record.plannedQty ?? record.planned_qty ?? record.qty),
    taskStatus: String(record.taskStatus ?? record.task_status ?? record.status ?? "待开始").trim() || "待开始",
    publishedScheduleId: String(record.publishedScheduleId ?? record.published_schedule_id ?? "").trim(),
    revision: positiveRevision(record.revision),
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
    updatedAt: record.updatedAt ?? record.updated_at ?? "",
  };
}

function normalizeWorkshopReport(record) {
  if (!record || typeof record !== "object") return null;
  const reportId = String(record.reportId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? "").trim();
  if (!reportId || !orderLineId) return null;
  return {
    reportId,
    productionTaskId: String(record.productionTaskId ?? record.production_task_id ?? "").trim(),
    orderLineId,
    processType: String(record.processType ?? record.process_type ?? "制袋").trim() || "制袋",
    machineId: String(record.machineId ?? record.machine_id ?? "").trim(),
    operatorId: String(record.operatorId ?? record.operator_id ?? "").trim(),
    qualifiedQty: toFiniteInteger(record.qualifiedQty ?? record.qualified_qty ?? 0),
    exceptionQty: toFiniteInteger(record.exceptionQty ?? record.exception_qty ?? 0),
    machineCount: optionalInteger(record.machineCount ?? record.machine_count),
    startedAt: record.startedAt ?? record.started_at ?? "",
    completedAt: record.completedAt ?? record.completed_at ?? new Date().toISOString(),
    remark: String(record.remark ?? "").trim(),
    evidence: normalizeObject(record.evidence ?? record.evidence_json),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

function normalizePackingTask(record) {
  if (!record || typeof record !== "object") return null;
  const packingTaskId = String(record.packingTaskId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? record.lineId ?? "").trim();
  if (!packingTaskId || !orderLineId) return null;
  return {
    ...record,
    packingTaskId,
    bizNo: String(record.bizNo ?? record.biz_no ?? packingTaskId).trim() || packingTaskId,
    orderLineId,
    plannedQty: toFiniteInteger(record.plannedQty ?? record.planned_qty ?? record.qty),
    actualPackedQty: toFiniteInteger(record.actualPackedQty ?? record.actual_packed_qty ?? 0),
    status: String(record.status ?? "待打包").trim() || "待打包",
    revision: positiveRevision(record.revision),
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

function normalizeMachineCapacityBaseline(record) {
  if (!record || typeof record !== "object") return null;
  const capacityBaselineId = String(record.capacityBaselineId ?? record.id ?? "").trim();
  const machineId = String(record.machineId ?? record.machine_id ?? "").trim();
  const sizeKey = String(record.sizeKey ?? record.size_key ?? "").trim();
  if (!capacityBaselineId || !machineId || !sizeKey) return null;
  return {
    capacityBaselineId,
    machineId,
    sizeKey,
    dailyCapacityQty: toFiniteInteger(record.dailyCapacityQty ?? record.daily_capacity_qty ?? 0),
    hourlyCapacityQty: optionalInteger(record.hourlyCapacityQty ?? record.hourly_capacity_qty),
    sourceKind: String(record.sourceKind ?? record.source_kind ?? "production_report").trim() || "production_report",
    confidence: String(record.confidence ?? "medium").trim() || "medium",
    effectiveFrom: normalizeDateText(record.effectiveFrom ?? record.effective_from),
    remark: String(record.remark ?? "").trim(),
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

function normalizePackages(records) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => normalizePackage(record)).filter(Boolean);
}

function normalizePackage(record) {
  if (!record || typeof record !== "object") return null;
  const packageId = String(record.packageId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? "").trim();
  if (!packageId || !orderLineId) return null;
  return {
    packageId,
    bizNo: String(record.bizNo ?? record.biz_no ?? packageId).trim() || packageId,
    orderLineId,
    fulfillmentId: String(record.fulfillmentId ?? record.fulfillment_id ?? "").trim(),
    packageSeq: toFiniteInteger(record.packageSeq ?? record.package_seq ?? 1),
    packageCount: toFiniteInteger(record.packageCount ?? record.package_count ?? 1),
    packedQty: toFiniteInteger(record.packedQty ?? record.packed_qty ?? record.qty),
    labelPrintRecordId: String(record.labelPrintRecordId ?? record.label_print_record_id ?? "").trim(),
    status: String(record.status ?? "待打印标签").trim() || "待打印标签",
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

function normalizeFulfillment(record) {
  if (!record || typeof record !== "object") return null;
  const fulfillmentId = String(record.fulfillmentId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? record.lineId ?? "").trim();
  if (!fulfillmentId || !orderLineId) return null;
  return {
    ...record,
    fulfillmentId,
    orderLineId,
    expectedQty: toFiniteInteger(record.expectedQty ?? record.expected_qty ?? record.qty),
    actualQty: optionalInteger(record.actualQty ?? record.actual_qty),
    status: String(record.status ?? "").trim(),
    confirmedBy: String(record.confirmedBy ?? record.confirmed_by ?? "").trim(),
    revision: positiveRevision(record.revision),
  };
}

function normalizeOrderLine(record) {
  if (!record || typeof record !== "object") return null;
  const orderLineId = String(record.orderLineId ?? record.id ?? "").trim();
  if (!orderLineId) return null;
  return {
    ...record,
    orderLineId,
    lineStatus: String(record.lineStatus ?? record.line_status ?? record.status ?? "").trim(),
    revision: positiveRevision(record.revision),
    exceptionTags: Array.isArray(record.exceptionTags)
      ? record.exceptionTags
      : Array.isArray(record.exception_tags)
        ? record.exception_tags
        : Array.isArray(record.exceptions)
          ? record.exceptions
          : [],
  };
}

function normalizeInventoryReservations(records) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => normalizeInventoryReservation(record)).filter(Boolean);
}

function normalizeInventoryReservation(record) {
  if (!record || typeof record !== "object") return null;
  const reservationId = String(record.reservationId ?? record.id ?? "").trim();
  const orderLineId = String(record.orderLineId ?? record.order_line_id ?? "").trim();
  const inventoryItemId = String(record.inventoryItemId ?? record.inventory_item_id ?? "").trim();
  if (!reservationId || !orderLineId || !inventoryItemId) return null;
  return {
    reservationId,
    orderLineId,
    inventoryItemId,
    reservedQty: toFiniteInteger(record.reservedQty ?? record.reserved_qty ?? record.qty),
    reservationType: String(record.reservationType ?? record.reservation_type ?? "生产完成待出库占用").trim() || "生产完成待出库占用",
    status: String(record.status ?? "生效").trim() || "生效",
    expiresAt: record.expiresAt ?? record.expires_at ?? "",
    createdBy: String(record.createdBy ?? record.created_by ?? "").trim(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

function normalizeInventoryAdjustments(records) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => normalizeInventoryAdjustment(record)).filter(Boolean);
}

function normalizeInventoryAdjustment(record) {
  if (!record || typeof record !== "object") return null;
  const inventoryItemId = String(record.inventoryItemId ?? record.inventory_item_id ?? "").trim();
  if (!inventoryItemId) return null;
  return {
    inventoryItemId,
    onHandQtyChange: toFiniteInteger(record.onHandQtyChange ?? record.on_hand_qty_change ?? 0),
    reservedQtyChange: toFiniteInteger(record.reservedQtyChange ?? record.reserved_qty_change ?? 0),
    waitingPickupLockedQtyChange: toFiniteInteger(
      record.waitingPickupLockedQtyChange ?? record.waiting_pickup_locked_qty_change ?? 0,
    ),
    expectedRevision: optionalInteger(record.expectedRevision ?? record.expected_revision),
    expectedOnHandQty: optionalInteger(record.expectedOnHandQty ?? record.expected_on_hand_qty),
    expectedReservedQty: optionalInteger(record.expectedReservedQty ?? record.expected_reserved_qty),
  };
}

function normalizeInventoryItems(records) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => normalizeInventoryItem(record)).filter(Boolean);
}

function normalizeInventoryItem(record) {
  if (!record || typeof record !== "object") return null;
  const inventoryItemId = String(record.inventoryItemId ?? record.inventory_item_id ?? record.id ?? "").trim();
  if (!inventoryItemId) return null;
  return {
    inventoryItemId,
    onHandQty: toFiniteInteger(record.onHandQty ?? record.on_hand_qty ?? record.inStock),
    reservedQty: toFiniteInteger(record.reservedQty ?? record.reserved_qty ?? record.reserved),
    waitingPickupLockedQty: toFiniteInteger(
      record.waitingPickupLockedQty ?? record.waiting_pickup_locked_qty ?? record.locked,
    ),
    revision: positiveRevision(record.revision),
  };
}

function normalizeInventoryLedgerEntries(records) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => normalizeInventoryLedgerEntry(record)).filter(Boolean);
}

function normalizeInventoryLedgerEntry(record) {
  if (!record || typeof record !== "object") return null;
  const ledgerId = String(record.ledgerId ?? record.id ?? "").trim();
  const inventoryItemId = String(record.inventoryItemId ?? record.inventory_item_id ?? "").trim();
  if (!ledgerId || !inventoryItemId) return null;
  return {
    ledgerId,
    inventoryItemId,
    changeType: String(record.changeType ?? record.change_type ?? "").trim() || "生产入库",
    qtyBefore: toFiniteInteger(record.qtyBefore ?? record.qty_before ?? 0),
    qtyChange: toFiniteInteger(record.qtyChange ?? record.qty_change ?? 0),
    qtyAfter: toFiniteInteger(record.qtyAfter ?? record.qty_after ?? 0),
    sourceType: String(record.sourceType ?? record.source_type ?? "production_report").trim() || "production_report",
    sourceId: String(record.sourceId ?? record.source_id ?? "").trim(),
    operatorId: String(record.operatorId ?? record.operator_id ?? "").trim(),
    confirmedBy: String(record.confirmedBy ?? record.confirmed_by ?? "").trim(),
    occurredAt: record.occurredAt ?? record.occurred_at ?? new Date().toISOString(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
    reason: String(record.reason ?? "").trim(),
    remark: String(record.remark ?? "").trim(),
  };
}

function normalizeOperationLog(record) {
  if (!record || typeof record !== "object") return null;
  const id = String(record.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    targetType: String(record.targetType ?? record.target_type ?? "").trim(),
    targetId: String(record.targetId ?? record.target_id ?? "").trim(),
    action: String(record.action ?? "").trim(),
    before: record.before ?? null,
    after: record.after ?? null,
    reason: String(record.reason ?? "").trim(),
    operatorId: String(record.operatorId ?? record.operator_id ?? "").trim(),
    pageKey: String(record.pageKey ?? record.page_key ?? "api").trim() || "api",
    occurredAt: record.occurredAt ?? record.occurred_at ?? new Date().toISOString(),
    createdAt: record.createdAt ?? record.created_at ?? new Date().toISOString(),
  };
}

function productionTaskJsonExpression(alias) {
  return `json_build_object(
    'productionTaskId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'orderLineId', ${alias}.order_line_id,
    'taskType', ${alias}.task_type,
    'machineId', ${alias}.machine_id,
    'plannedQty', ${alias}.planned_qty,
    'taskStatus', ${alias}.task_status,
    'publishedScheduleId', ${alias}.published_schedule_id,
    'revision', ${alias}.revision,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at,
    'updatedAt', ${alias}.updated_at
  )`;
}

function workshopReportJsonExpression(alias) {
  return `json_build_object(
    'reportId', ${alias}.id,
    'productionTaskId', ${alias}.production_task_id,
    'orderLineId', ${alias}.order_line_id,
    'processType', ${alias}.process_type,
    'machineId', ${alias}.machine_id,
    'operatorId', ${alias}.operator_id,
    'qualifiedQty', ${alias}.qualified_qty,
    'exceptionQty', ${alias}.exception_qty,
    'machineCount', ${alias}.machine_count,
    'startedAt', ${alias}.started_at,
    'completedAt', ${alias}.completed_at,
    'remark', ${alias}.remark,
    'evidence', ${alias}.evidence_json,
    'createdAt', ${alias}.created_at
  )`;
}

function packingTaskJsonExpression(alias) {
  return `json_build_object(
    'packingTaskId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'orderLineId', ${alias}.order_line_id,
    'plannedQty', ${alias}.planned_qty,
    'actualPackedQty', ${alias}.actual_packed_qty,
    'status', ${alias}.status,
    'revision', ${alias}.revision,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function machineCapacityBaselineJsonExpression(alias) {
  return `json_build_object(
    'capacityBaselineId', ${alias}.id,
    'machineId', ${alias}.machine_id,
    'sizeKey', ${alias}.size_key,
    'dailyCapacityQty', ${alias}.daily_capacity_qty,
    'hourlyCapacityQty', ${alias}.hourly_capacity_qty,
    'sourceKind', ${alias}.source_kind,
    'confidence', ${alias}.confidence,
    'effectiveFrom', ${alias}.effective_from,
    'remark', ${alias}.remark,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function packageJsonExpression(alias) {
  return `json_build_object(
    'packageId', ${alias}.id,
    'bizNo', ${alias}.biz_no,
    'orderLineId', ${alias}.order_line_id,
    'fulfillmentId', ${alias}.fulfillment_id,
    'packageSeq', ${alias}.package_seq,
    'packageCount', ${alias}.package_count,
    'packedQty', ${alias}.packed_qty,
    'labelPrintRecordId', ${alias}.label_print_record_id,
    'status', ${alias}.status,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function fulfillmentJsonExpression(alias) {
  return `json_build_object(
    'fulfillmentId', ${alias}.id,
    'orderLineId', ${alias}.order_line_id,
    'expectedQty', ${alias}.expected_qty,
    'actualQty', ${alias}.actual_qty,
    'status', ${alias}.status,
    'confirmedBy', ${alias}.confirmed_by,
    'revision', ${alias}.revision
  )`;
}

function orderLineJsonExpression(alias) {
  return `json_build_object(
    'orderLineId', ${alias}.id,
    'lineStatus', ${alias}.line_status,
    'exceptionTags', ${alias}.exception_tags,
    'revision', ${alias}.revision
  )`;
}

function inventoryReservationJsonExpression(alias) {
  return `json_build_object(
    'reservationId', ${alias}.id,
    'orderLineId', ${alias}.order_line_id,
    'inventoryItemId', ${alias}.inventory_item_id,
    'reservedQty', ${alias}.reserved_qty,
    'reservationType', ${alias}.reservation_type,
    'status', ${alias}.status,
    'expiresAt', ${alias}.expires_at,
    'createdBy', ${alias}.created_by,
    'createdAt', ${alias}.created_at
  )`;
}

function inventoryLedgerJsonExpression(alias) {
  return `json_build_object(
    'ledgerId', ${alias}.id,
    'inventoryItemId', ${alias}.inventory_item_id,
    'changeType', ${alias}.change_type,
    'qtyBefore', ${alias}.qty_before,
    'qtyChange', ${alias}.qty_change,
    'qtyAfter', ${alias}.qty_after,
    'sourceType', ${alias}.source_type,
    'sourceId', ${alias}.source_id,
    'operatorId', ${alias}.operator_id,
    'confirmedBy', ${alias}.confirmed_by,
    'occurredAt', ${alias}.occurred_at,
    'createdAt', ${alias}.created_at,
    'reason', ${alias}.reason,
    'remark', ${alias}.remark
  )`;
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

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function optionalInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  return toFiniteInteger(value);
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

function timestampParameter(value, parameters) {
  const text = String(value ?? "").trim();
  return text && !Number.isNaN(Date.parse(text)) ? parameters.timestamp(text) : "now()";
}

function dateParameter(value, parameters) {
  const text = normalizeDateText(value);
  return text ? `${parameters.text(text)}::date` : "CURRENT_DATE";
}
