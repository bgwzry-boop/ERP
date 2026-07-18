import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPostgresParameterBinder } from "../server/postgresSqlParameters.mjs";
import {
  buildInsertOperationLogSql,
  buildInsertProductionExceptionSql,
  buildInsertTodoEventSql,
  buildInsertTodoSql,
  buildUpdateProductionExceptionSql,
  buildUpdateTodoSql,
} from "../server/productionPackingExceptionTodoSqlFragments.mjs";

checkProductionExceptionFragments();
checkTodoAndAuditFragments();
checkRepositoryBoundary();

console.log("Production packing exception/todo SQL fragments check passed: exception, todo, event, and audit writes stay parameterized and guarded.");

function checkProductionExceptionFragments() {
  const parameters = createPostgresParameterBinder();
  const insertedSql = buildInsertProductionExceptionSql(
    {
      productionExceptionId: "PEX-SQL-FRAGMENT-001",
      bizNo: "PEX-001",
      productionTaskId: "PT-SQL-FRAGMENT-001",
      orderLineId: "OL-SQL-FRAGMENT-001",
      processType: "制袋",
      machineId: "BAG-01",
      operatorId: "U-WORKSHOP-A",
      exceptionType: "机器问题",
      continuationMode: "暂停等确认",
      status: "异常暂停",
      estimatedLossQty: 8,
      affectsDelivery: true,
      remark: "operator O'Brien",
      evidence: { reportedFrom: "workshop" },
      occurredAt: "2026-07-16T10:00:00.000Z",
      createdAt: "2026-07-16T10:00:00.000Z",
    },
    parameters,
    "write_guard",
  );
  assert.match(insertedSql, /INSERT INTO production_exception_records/);
  assert.match(insertedSql, /JOIN write_guard ON write_guard\.ok/);
  assert.match(insertedSql, /ON CONFLICT \(id\) DO NOTHING/);
  assert.ok(!insertedSql.includes("operator O'Brien"));
  assert.equal(parameters.values.includes("operator O'Brien"), true);
  assert.equal(buildInsertProductionExceptionSql(null, createPostgresParameterBinder()), "SELECT NULL::json AS result WHERE false");

  const updatedSql = buildUpdateProductionExceptionSql(
    {
      productionExceptionId: "PEX-SQL-FRAGMENT-001",
      status: "已恢复",
      resolutionCode: "resume",
      resolutionNote: "office O'Brien",
      resolvedBy: "U-OFFICE-A",
      resolvedAt: "2026-07-16T11:00:00.000Z",
      evidence: { resolution: "resume" },
    },
    parameters,
    "write_guard",
  );
  assert.match(updatedSql, /UPDATE production_exception_records/);
  assert.match(updatedSql, /resolution_code/);
  assert.match(updatedSql, /AND EXISTS \(SELECT 1 FROM write_guard WHERE ok\)/);
  assert.equal(buildUpdateProductionExceptionSql(null, createPostgresParameterBinder()), "SELECT NULL::json AS result WHERE false");
}

function checkTodoAndAuditFragments() {
  const parameters = createPostgresParameterBinder();
  const todo = {
    id: "TODO-SQL-FRAGMENT-001",
    bizNo: "TODO-001",
    type: "生产异常",
    refType: "production_task",
    refId: "PT-SQL-FRAGMENT-001",
    priority: "高",
    status: "未处理",
    summary: "todo O'Brien",
    dueAt: null,
    remindAt: null,
    handledBy: null,
    handledAt: null,
    handlingResult: null,
    createdBy: "U-WORKSHOP-A",
    createdAt: "2026-07-16T10:00:00.000Z",
    updatedAt: "2026-07-16T10:00:00.000Z",
  };
  const todoSql = buildInsertTodoSql(todo, parameters, "write_guard");
  assert.match(todoSql, /INSERT INTO todos/);
  assert.match(todoSql, /FROM write_guard WHERE ok/);
  assert.ok(!todoSql.includes("todo O'Brien"));
  assert.equal(parameters.values.includes("todo O'Brien"), true);

  const updatedTodoSql = buildUpdateTodoSql(
    { ...todo, status: "已处理", handledBy: "U-OFFICE-A", handledAt: "2026-07-16T11:00:00.000Z" },
    parameters,
    "write_guard",
  );
  assert.match(updatedTodoSql, /UPDATE todos/);
  assert.match(updatedTodoSql, /AND EXISTS \(SELECT 1 FROM write_guard WHERE ok\)/);

  const todoEventSql = buildInsertTodoEventSql(
    {
      eventId: "TODO-EVENT-SQL-FRAGMENT-001",
      todoId: todo.id,
      eventType: "todo_source:production_exception_reported",
      eventPayload: { note: "event O'Brien" },
      operatorId: "U-WORKSHOP-A",
      occurredAt: "2026-07-16T10:00:00.000Z",
      createdAt: "2026-07-16T10:00:00.000Z",
    },
    parameters,
    "inserted_todo",
  );
  assert.match(todoEventSql, /INSERT INTO todo_events/);
  assert.match(todoEventSql, /FROM inserted_todo/);
  assert.ok(!todoEventSql.includes("event O'Brien"));
  assert.equal(parameters.values.some((value) => JSON.stringify(value).includes("event O'Brien")), true);

  const auditSql = buildInsertOperationLogSql(
    {
      id: "LOG-SQL-FRAGMENT-001",
      targetType: "production_task",
      targetId: "PT-SQL-FRAGMENT-001",
      action: "resolve_production_exception",
      before: { status: "异常暂停" },
      after: { status: "制袋中" },
      reason: "audit O'Brien",
      operatorId: "U-OFFICE-A",
      pageKey: "production_packing",
      occurredAt: "2026-07-16T11:00:00.000Z",
      createdAt: "2026-07-16T11:00:00.000Z",
    },
    parameters,
    "write_guard",
  );
  assert.match(auditSql, /INSERT INTO operation_logs/);
  assert.match(auditSql, /FROM write_guard WHERE ok/);
  assert.match(auditSql, /ON CONFLICT \(id\) DO UPDATE SET/);
  assert.ok(!auditSql.includes("audit O'Brien"));
  assert.equal(parameters.values.includes("audit O'Brien"), true);
  assert.equal(buildInsertTodoSql(null, createPostgresParameterBinder()), "SELECT NULL::json AS result WHERE false");
  assert.equal(buildUpdateTodoSql(null, createPostgresParameterBinder()), "SELECT NULL::json AS result WHERE false");
  assert.equal(buildInsertTodoEventSql(null, createPostgresParameterBinder()), "SELECT NULL::json AS result WHERE false");
}

function checkRepositoryBoundary() {
  const repositorySource = readFileSync(new URL("../server/productionPackingTransactionRepository.mjs", import.meta.url), "utf8");
  const fragmentsSource = readFileSync(new URL("../server/productionPackingExceptionTodoSqlFragments.mjs", import.meta.url), "utf8");
  assert.match(repositorySource, /from "\.\/productionPackingExceptionTodoSqlFragments\.mjs"/);
  assert.doesNotMatch(repositorySource, /function buildInsertProductionExceptionSql\(/);
  assert.doesNotMatch(repositorySource, /function buildInsertTodoSql\(/);
  assert.doesNotMatch(repositorySource, /function buildInsertOperationLogSql\(/);
  assert.match(fragmentsSource, /export function buildInsertProductionExceptionSql\(/);
  assert.match(fragmentsSource, /export function buildInsertOperationLogSql\(/);
  assert.ok(repositorySource.split("\n").length <= 1_050, "transaction repository should delegate exception/todo SQL fragments while atomically persisting schedule records");
  assert.ok(fragmentsSource.split("\n").length <= 300, "exception/todo SQL fragments should remain independently reviewable");
}
