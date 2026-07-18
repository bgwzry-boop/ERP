import { createPostgresPoolClient } from "./postgresPoolClient.mjs";
import { createPostgresParameterBinder } from "./postgresSqlParameters.mjs";
import { createPostgresTransactionExecutor } from "./postgresTransactionExecutor.mjs";
import {
  normalizeInventoryAdjustments,
  normalizeInventoryLedgerEntries,
  normalizeInventoryReservations,
  normalizeOperationLog,
  normalizeOrderLine,
  normalizePackingCompletionTransactionResult,
  normalizePackingTask,
  normalizePackages,
  normalizeProductionException,
  normalizeProductionDailyProgressTransactionResult,
  normalizeProductionExceptionTransactionResult,
  normalizeProductionReportTransactionResult,
  normalizeProductionSchedulePublishTransactionResult,
  normalizeProductionScheduleRecord,
  normalizeProductionTask,
  normalizeTodo,
  normalizeTodoEvent,
  normalizeWorkshopReport,
  normalizeMachineCapacityBaseline,
  normalizeFulfillment,
} from "./productionPackingTransactionRecordNormalizer.mjs";
import { buildUpsertProductionScheduleRecordsSql } from "./productionScheduleRecordRepository.mjs";
import { applyProductionPackingWorkspaceMutation } from "./productionPackingWorkspaceProjection.mjs";
import {
  buildInsertWorkshopReportSql,
  buildUpdateOrderLineSql,
  buildUpsertMachineCapacityBaselineSql,
  buildUpsertPackingTaskSql,
  buildUpsertProductionTaskSql,
} from "./productionPackingTaskSqlFragments.mjs";
import {
  buildInsertInventoryLedgerEntriesSql,
  buildInsertInventoryReservationsSql,
  buildInsertPackagesSql,
  buildUpdateFulfillmentSql,
  buildUpdateInventoryItemsSql,
} from "./productionPackingFulfillmentInventorySqlFragments.mjs";
import {
  buildInsertOperationLogSql,
  buildInsertProductionExceptionSql,
  buildInsertTodoEventSql,
  buildInsertTodoSql,
  buildUpdateProductionExceptionSql,
  buildUpdateTodoSql,
} from "./productionPackingExceptionTodoSqlFragments.mjs";
import {
  buildIdempotencyConflictError,
  buildIdempotencyRequestHash,
  buildPostgresIdempotencyRequest,
  resolveRepositoryIdempotencyKey,
} from "./idempotency.mjs";
import {
  buildBusinessDecisionAttachmentLinksCte,
  buildInsertBusinessDecisionCte,
  buildSupersedeBusinessDecisionCte,
  normalizeDecisionRecord,
} from "./businessDecisionEvidenceRepository.mjs";

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
  const productionExceptionResults = new Map();
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

    recordProductionException(input) {
      const replay = readLocalProductionExceptionReplay(productionExceptionResults, input, "production.exception.record");
      if (replay) return replay;
      const transaction = normalizeProductionExceptionTransactionResult({
        productionTask: input.productionTask,
        productionException: input.productionException,
        todo: input.todo ?? null,
        todoEvent: input.todoEvent ?? null,
        operationLogId: input.operationLog?.id ?? "",
      });
      applyProductionPackingWorkspaceMutation({
        workspace: input.workspace,
        productionTask: transaction.productionTask,
        productionException: transaction.productionException,
        todo: transaction.todo,
        todoEvent: transaction.todoEvent,
        operationLog: input.operationLog,
      });
      saveLocalProductionExceptionReplay(productionExceptionResults, input, transaction, "production.exception.record");
      return transaction;
    },

    resolveProductionException(input) {
      const replay = readLocalProductionExceptionReplay(productionExceptionResults, input, "production.exception.resolve");
      if (replay) return replay;
      const transaction = normalizeProductionExceptionTransactionResult({
        productionTask: input.productionTask,
        productionException: input.productionException,
        todo: input.todo ?? null,
        todoEvent: input.todoEvent ?? null,
        operationLogId: input.operationLog?.id ?? "",
      });
      applyProductionPackingWorkspaceMutation({
        workspace: input.workspace,
        productionTask: transaction.productionTask,
        productionException: transaction.productionException,
        todo: transaction.todo,
        todoEvent: transaction.todoEvent,
        operationLog: input.operationLog,
      });
      saveLocalProductionExceptionReplay(productionExceptionResults, input, transaction, "production.exception.resolve");
      return transaction;
    },

    publishProductionSchedule(input) {
      const transaction = {
        ...normalizeProductionSchedulePublishTransactionResult({
        productionTask: input.productionTask,
        productionScheduleRecord: input.productionScheduleRecord,
        orderLine: input.orderLine,
        operationLogId: input.operationLog?.id ?? "",
        }),
        businessDecision: normalizeDecisionRecord(input.decisionRecord),
      };
      if (!transaction.businessDecision || !transaction.productionScheduleRecord) {
        throw new Error("A business decision and schedule record are required to publish a production schedule");
      }
      const committed = input.workspace.businessDecisionEvidenceRepository.commitDecisionBundle({
        workspace: input.workspace,
        decisionRecord: transaction.businessDecision,
        attachmentLinks: input.attachmentLinks,
        operationLog: input.operationLog,
        idempotencyScope: "production.schedule.publish",
        idempotencyKey: input.idempotencyKey,
        idempotencyPayload: input.idempotencyPayload,
        applyBusinessMutation(stagedWorkspace) {
          const currentTask = (stagedWorkspace.productionTasks ?? []).find(
            (task) => String(task?.productionTaskId ?? task?.id ?? "").trim() === transaction.productionTask.productionTaskId,
          );
          if (currentTask && Number(currentTask.revision ?? 1) !== Number(transaction.productionTask.revision ?? 1)) {
            const error = new Error("排产任务已被另一位办公室人员更新，请刷新后重新确认。");
            error.statusCode = 409;
            error.code = "BUSINESS_WRITE_CONFLICT";
            error.details = { currentRevision: Number(currentTask.revision ?? 1) };
            throw error;
          }
          const currentScheduleRecord = (stagedWorkspace.productionScheduleRecords ?? []).find(
            (record) =>
              String(record?.machineId ?? record?.machine_id ?? "").trim() === transaction.productionScheduleRecord.machineId &&
              String(record?.productionTaskId ?? record?.production_task_id ?? "").trim() === transaction.productionTask.productionTaskId,
          );
          const committedTransaction = {
            ...transaction,
            productionTask: {
              ...transaction.productionTask,
              revision: currentTask ? Number(currentTask.revision ?? 1) + 1 : 1,
            },
            productionScheduleRecord: {
              ...transaction.productionScheduleRecord,
              revision: currentScheduleRecord ? Number(currentScheduleRecord.revision ?? 1) + 1 : 1,
            },
          };
          applyProductionPackingWorkspaceMutation({
            workspace: stagedWorkspace,
            productionTask: committedTransaction.productionTask,
            orderLine: committedTransaction.orderLine,
          });
          upsertProductionScheduleRecord(stagedWorkspace, committedTransaction.productionScheduleRecord);
          return {
            commitKeys: ["productionTasks", "productionScheduleRecords", "orderLines"],
            result: committedTransaction,
          };
        },
      });
      return {
        ...committed.businessResult,
        businessDecision: committed.businessDecision,
        replayed: committed.replayed === true,
      };
    },

    completePackingTask(input) {
      const transaction = normalizePackingCompletionTransactionResult({
        packingTask: input.packingTask,
        packages: input.packages ?? [],
        fulfillment: input.fulfillment ?? null,
        orderLine: input.orderLine ?? null,
        inventoryLedgerEntries: input.inventoryLedgerEntries ?? [],
        todo: input.todo ?? null,
        todoEvent: input.todoEvent ?? null,
        operationLogId: input.operationLog?.id ?? "",
      });
      applyProductionPackingWorkspaceMutation({
        workspace: input.workspace,
        packingTask: transaction.packingTask,
        packages: transaction.packages,
        fulfillment: transaction.fulfillment,
        orderLine: transaction.orderLine,
        inventoryLedgerEntries: transaction.inventoryLedgerEntries,
        todo: transaction.todo,
        todoEvent: transaction.todoEvent,
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

    async recordProductionException(input) {
      const builtQuery = buildRecordProductionExceptionTransactionQuery(input);
      const saved = normalizeProductionExceptionTransactionResult(
        await executeIdempotentProductionTransaction({
          input,
          scope: "production.exception.record",
          query: builtQuery,
          idempotentTransactionJson,
          resourceLocks: buildProductionResourceLocks(input),
        }),
      );
      if (!saved.productionTask || !saved.productionException || !saved.todo) {
        throw new Error("PostgreSQL production exception transaction returned an invalid result");
      }
      applyProductionPackingWorkspaceMutation({
        workspace: input.workspace,
        authoritative: true,
        productionTask: saved.productionTask,
        productionException: saved.productionException,
        todo: saved.todo,
        todoEvent: saved.todoEvent,
        operationLog: toSavedOperationLog(input.operationLog, saved.operationLogId),
      });
      return saved;
    },

    async resolveProductionException(input) {
      const builtQuery = buildResolveProductionExceptionTransactionQuery(input);
      const saved = normalizeProductionExceptionTransactionResult(
        await executeIdempotentProductionTransaction({
          input,
          scope: "production.exception.resolve",
          query: builtQuery,
          idempotentTransactionJson,
          resourceLocks: buildProductionResourceLocks(input),
        }),
      );
      if (!saved.productionTask || !saved.productionException || !saved.todo) {
        throw new Error("PostgreSQL production exception resolution transaction returned an invalid result");
      }
      applyProductionPackingWorkspaceMutation({
        workspace: input.workspace,
        authoritative: true,
        productionTask: saved.productionTask,
        productionException: saved.productionException,
        todo: saved.todo,
        todoEvent: saved.todoEvent,
        operationLog: toSavedOperationLog(input.operationLog, saved.operationLogId),
      });
      return saved;
    },

    async publishProductionSchedule(input) {
      const builtQuery = buildPublishProductionScheduleTransactionQuery(input);
      const rawSaved = await executeIdempotentProductionTransaction({
          input,
          scope: "production.schedule.publish",
          query: builtQuery,
          idempotentTransactionJson,
          resourceLocks: buildProductionResourceLocks(input),
        });
      const saved = {
        ...normalizeProductionSchedulePublishTransactionResult(rawSaved),
        businessDecision: normalizeDecisionRecord(rawSaved?.businessDecision ?? rawSaved?.business_decision),
      };
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
      upsertProductionScheduleRecord(input.workspace, saved.productionScheduleRecord);
      applyBusinessDecisionWorkspaceMutation(input.workspace, saved.businessDecision, input.attachmentLinks);
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
        todo: saved.todo,
        todoEvent: saved.todoEvent,
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

function readLocalProductionExceptionReplay(store, input = {}, scope) {
  const key = resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id);
  const existing = store.get(`${scope}:${key}`);
  if (!existing) return null;
  if (existing.requestHash !== buildIdempotencyRequestHash(input.idempotencyPayload ?? {})) {
    throw buildIdempotencyConflictError();
  }
  return structuredClone(existing.result);
}

function saveLocalProductionExceptionReplay(store, input = {}, result, scope) {
  const key = resolveRepositoryIdempotencyKey(input.idempotencyKey, input.operationLog?.id);
  store.set(`${scope}:${key}`, {
    requestHash: buildIdempotencyRequestHash(input.idempotencyPayload ?? {}),
    result: structuredClone(result),
  });
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
    disallowedStatuses: ["已完成", "异常暂停", "数量差异待处理", "已作废"],
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

export function buildRecordProductionExceptionTransactionSql(input) {
  return buildRecordProductionExceptionTransactionQuery(input).text;
}

export function buildRecordProductionExceptionTransactionQuery(input) {
  const productionTask = normalizeProductionTask(input.productionTask);
  const productionException = normalizeProductionException(input.productionException);
  const orderLine = normalizeOrderLine(input.orderLine);
  const todo = normalizeTodo(input.todo);
  const todoEvent = normalizeTodoEvent(input.todoEvent);
  const operationLog = normalizeOperationLog(input.operationLog);
  if (!productionTask || !productionException || !todo || !todoEvent || !operationLog) {
    throw new Error("Production task, production exception, todo, todo event, and operation log are required");
  }

  const parameters = createPostgresParameterBinder();
  const writeGuardCtes = buildProductionWriteGuardCtes({
    productionTask,
    orderLine,
    inventoryAdjustments: [],
    disallowedStatuses: ["已完成", "已作废"],
  }, parameters);
  return {
    text: `
BEGIN;
WITH ${writeGuardCtes}
upserted_production_task AS (
  ${buildUpsertProductionTaskSql(productionTask, parameters, "write_guard")}
),
inserted_production_exception AS (
  ${buildInsertProductionExceptionSql(productionException, parameters, "write_guard")}
),
inserted_todo AS (
  ${buildInsertTodoSql(todo, parameters, "write_guard")}
),
inserted_todo_event AS (
  ${buildInsertTodoEventSql(todoEvent, parameters, "inserted_todo")}
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters, "write_guard")}
)
SELECT json_build_object(
  'productionTask', (SELECT result FROM upserted_production_task),
  'productionException', (SELECT result FROM inserted_production_exception),
  'todo', (SELECT result FROM inserted_todo),
  'todoEvent', (SELECT result FROM inserted_todo_event),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
}

export function buildResolveProductionExceptionTransactionSql(input) {
  return buildResolveProductionExceptionTransactionQuery(input).text;
}

export function buildResolveProductionExceptionTransactionQuery(input) {
  const productionTask = normalizeProductionTask(input.productionTask);
  const productionException = normalizeProductionException(input.productionException);
  const todo = normalizeTodo(input.todo);
  const todoEvent = normalizeTodoEvent(input.todoEvent);
  const operationLog = normalizeOperationLog(input.operationLog);
  if (!productionTask || !productionException || !todo || !todoEvent || !operationLog) {
    throw new Error("Production task, production exception, todo, todo event, and operation log are required for exception resolution");
  }

  const parameters = createPostgresParameterBinder();
  const writeGuardCtes = buildProductionExceptionResolutionWriteGuardCtes({ productionTask, productionException, todo }, parameters);
  return {
    text: `
BEGIN;
WITH ${writeGuardCtes}
updated_production_task AS (
  ${buildUpsertProductionTaskSql(productionTask, parameters, "write_guard")}
),
updated_production_exception AS (
  ${buildUpdateProductionExceptionSql(productionException, parameters, "write_guard")}
),
updated_todo AS (
  ${buildUpdateTodoSql(todo, parameters, "write_guard")}
),
inserted_todo_event AS (
  ${buildInsertTodoEventSql(todoEvent, parameters, "updated_todo")}
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters, "write_guard")}
)
SELECT json_build_object(
  'productionTask', (SELECT result FROM updated_production_task),
  'productionException', (SELECT result FROM updated_production_exception),
  'todo', (SELECT result FROM updated_todo),
  'todoEvent', (SELECT result FROM inserted_todo_event),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
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
    disallowedStatuses: ["已完成", "待完工确认", "异常暂停", "数量差异待处理", "已作废"],
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
  const productionScheduleRecord = normalizeProductionScheduleRecord(input.productionScheduleRecord);
  const orderLine = normalizeOrderLine(input.orderLine);
  const operationLog = normalizeOperationLog(input.operationLog);
  const decisionRecord = normalizeDecisionRecord(input.decisionRecord);
  if (!productionTask || !productionScheduleRecord || !operationLog || !decisionRecord) {
    throw new Error("Production task, schedule record, business decision, and operation log are required for production schedule publish transaction");
  }

  const parameters = createPostgresParameterBinder();
  const writeGuardCtes = buildProductionWriteGuardCtes({
    productionTask,
    orderLine,
    inventoryAdjustments: [],
    disallowedStatuses: ["已完成", "异常暂停", "数量差异待处理", "已作废"],
  }, parameters);
  const decisionCtes = buildProductionScheduleDecisionCtes(decisionRecord, input.attachmentLinks, parameters);
  return {
    text: `
BEGIN;
WITH ${writeGuardCtes}
upserted_production_task AS (
  ${buildUpsertProductionTaskSql(productionTask, parameters, "write_guard")}
),
upserted_schedule_record AS (
  ${buildUpsertProductionScheduleRecordsSql([productionScheduleRecord], parameters, "upserted_production_task")}
),
updated_order_line AS (
  ${buildUpdateOrderLineSql(orderLine, parameters, "write_guard")}
),
inserted_operation_log AS (
  ${buildInsertOperationLogSql(operationLog, parameters, "write_guard")}
),
${decisionCtes}
SELECT json_build_object(
  'productionTask', (SELECT result FROM upserted_production_task),
  'productionScheduleRecord', (SELECT result FROM upserted_schedule_record),
  'orderLine', (SELECT result FROM updated_order_line),
  'businessDecision', (SELECT result FROM inserted_business_decision),
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
  const todo = normalizeTodo(input.todo);
  const todoEvent = normalizeTodoEvent(input.todoEvent);
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
inserted_todo AS (
  ${buildInsertTodoSql(todo, parameters, "write_guard")}
),
inserted_todo_event AS (
  ${buildInsertTodoEventSql(todoEvent, parameters, "inserted_todo")}
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
  'todo', (SELECT result FROM inserted_todo),
  'todoEvent', (SELECT result FROM inserted_todo_event),
  'operationLogId', (SELECT id FROM inserted_operation_log)
) AS result;
COMMIT;
`.trim(),
    values: parameters.values,
  };
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

function buildProductionExceptionResolutionWriteGuardCtes({ productionTask, productionException, todo }, parameters) {
  return `locked_production_task AS MATERIALIZED (
  SELECT id, revision, task_status FROM production_tasks
  WHERE id = ${parameters.text(productionTask.productionTaskId)}
  FOR UPDATE
),
locked_production_exception AS MATERIALIZED (
  SELECT id, production_task_id, status FROM production_exception_records
  WHERE id = ${parameters.text(productionException.productionExceptionId)}
  FOR UPDATE
),
locked_todo AS MATERIALIZED (
  SELECT id, ref_type, ref_id FROM todos
  WHERE id = ${parameters.text(todo.id)}
  FOR UPDATE
),
write_guard AS MATERIALIZED (
  SELECT erp_require(
    EXISTS (
      SELECT 1 FROM locked_production_task
      WHERE revision = ${parameters.integer(productionTask.revision ?? 1)}
        AND task_status <> ALL(${parameters.textArray(["已完成", "已作废"])})
    ),
    'ERP_PRODUCTION_TASK_CONCURRENCY_CONFLICT'
  )
  AND erp_require(
    EXISTS (
      SELECT 1 FROM locked_production_exception
      WHERE production_task_id = ${parameters.text(productionTask.productionTaskId)}
        AND status <> ALL(${parameters.textArray(["已恢复生产", "已作废"])})
    ),
    'ERP_PRODUCTION_EXCEPTION_CONCURRENCY_CONFLICT'
  )
  AND erp_require(
    EXISTS (
      SELECT 1 FROM locked_todo
      WHERE ref_type = 'production_task'
        AND ref_id = ${parameters.text(productionTask.productionTaskId)}
    ),
    'ERP_TODO_CONCURRENCY_CONFLICT'
  ) AS ok
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

function buildProductionScheduleDecisionCtes(decisionRecord, attachmentLinks, parameters) {
  return `superseded_business_decision AS (
  ${buildSupersedeBusinessDecisionCte(decisionRecord, parameters, "write_guard")}
),
inserted_business_decision AS (
  ${buildInsertBusinessDecisionCte(decisionRecord, parameters, "write_guard")}
),
inserted_business_decision_attachment_links AS (
  ${buildBusinessDecisionAttachmentLinksCte(attachmentLinks, parameters, "inserted_business_decision")}
)`;
}

function applyBusinessDecisionWorkspaceMutation(workspace, businessDecision, attachmentLinks = []) {
  const decision = normalizeDecisionRecord(businessDecision);
  if (!workspace || !decision) return;
  workspace.businessDecisionRecords = [
    decision,
    ...(workspace.businessDecisionRecords ?? []).filter(
      (record) => String(record?.id ?? record?.businessDecisionId ?? "").trim() !== decision.id,
    ),
  ];
  for (const link of Array.isArray(attachmentLinks) ? attachmentLinks : []) {
    const linkId = String(link?.id ?? "").trim();
    workspace.attachmentLinks = [
      link,
      ...(workspace.attachmentLinks ?? []).filter((record) => String(record?.id ?? "").trim() !== linkId),
    ];
  }
}

function upsertProductionScheduleRecord(workspace, value) {
  const record = normalizeProductionScheduleRecord(value);
  if (!workspace || !record) return;
  workspace.productionScheduleRecords = [
    record,
    ...(workspace.productionScheduleRecords ?? []).filter(
      (item) =>
        String(item?.scheduleRecordId ?? item?.id ?? "").trim() !== record.scheduleRecordId &&
        !(
          String(item?.machineId ?? item?.machine_id ?? "").trim() === record.machineId &&
          String(item?.productionTaskId ?? item?.production_task_id ?? "").trim() === record.productionTaskId
        ),
    ),
  ];
}
