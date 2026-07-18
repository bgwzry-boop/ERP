import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPostgresParameterBinder } from "../server/postgresSqlParameters.mjs";
import {
  buildInsertWorkshopReportSql,
  buildUpdateOrderLineSql,
  buildUpsertMachineCapacityBaselineSql,
  buildUpsertPackingTaskSql,
  buildUpsertProductionTaskSql,
} from "../server/productionPackingTaskSqlFragments.mjs";

checkProductionTaskFragment();
checkWorkshopAndOrderLineFragments();
checkPackingAndCapacityFragments();
checkRepositoryBoundary();

console.log("Production packing task SQL fragments check passed: bound task, report, order-line, packing, and capacity SQL are isolated.");

function checkProductionTaskFragment() {
  const parameters = createPostgresParameterBinder();
  const sql = buildUpsertProductionTaskSql({
    productionTaskId: "PT-SQL-FRAGMENT-001",
    bizNo: "PT-O'Brien",
    orderLineId: "OL-SQL-FRAGMENT-001",
    taskType: "制袋",
    machineId: "BAG-01",
    plannedQty: 80,
    taskStatus: "制袋中",
    publishedScheduleId: "SCH-001",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-16T10:00:00.000Z",
  }, parameters, "write_guard");

  assert.match(sql, /INSERT INTO production_tasks/);
  assert.match(sql, /JOIN write_guard ON write_guard\.ok/);
  assert.match(sql, /ON CONFLICT \(id\) DO UPDATE SET/);
  assert.match(sql, /revision = production_tasks\.revision \+ 1/);
  assert.ok(!sql.includes("O'Brien"));
  assert.equal(parameters.values.includes("PT-O'Brien"), true);
  assert.equal(buildUpsertProductionTaskSql(null, createPostgresParameterBinder()), "SELECT NULL::json AS result WHERE false");
}

function checkWorkshopAndOrderLineFragments() {
  const parameters = createPostgresParameterBinder();
  const reportSql = buildInsertWorkshopReportSql({
    reportId: "WR-SQL-FRAGMENT-001",
    productionTaskId: "PT-SQL-FRAGMENT-001",
    orderLineId: "OL-SQL-FRAGMENT-001",
    processType: "制袋",
    machineId: "BAG-01",
    operatorId: "U-WORKSHOP-A",
    qualifiedQty: 80,
    exceptionQty: 0,
    machineCount: 12345,
    startedAt: "2026-07-16T09:00:00.000Z",
    completedAt: "2026-07-16T10:00:00.000Z",
    remark: "operator O'Brien",
    evidence: { source: "workshop" },
    createdAt: "2026-07-16T10:00:00.000Z",
  }, parameters, "write_guard");
  assert.match(reportSql, /INSERT INTO workshop_reports/);
  assert.match(reportSql, /machine_count/);
  assert.match(reportSql, /JOIN write_guard ON write_guard\.ok/);
  assert.ok(!reportSql.includes("operator O'Brien"));
  assert.equal(parameters.values.includes("operator O'Brien"), true);

  const orderLineSql = buildUpdateOrderLineSql({
    orderLineId: "OL-SQL-FRAGMENT-001",
    lineStatus: "待打包",
    exceptionTags: ["需复核"],
  }, parameters, "write_guard");
  assert.match(orderLineSql, /UPDATE order_lines/);
  assert.match(orderLineSql, /AND EXISTS \(SELECT 1 FROM write_guard WHERE ok\)/);
  assert.equal(buildUpdateOrderLineSql(null, createPostgresParameterBinder()), "SELECT NULL::json AS result WHERE false");
}

function checkPackingAndCapacityFragments() {
  const packingParameters = createPostgresParameterBinder();
  const packingSql = buildUpsertPackingTaskSql({
    packingTaskId: "PKT-SQL-FRAGMENT-001",
    bizNo: "PKT-001",
    orderLineId: "OL-SQL-FRAGMENT-001",
    plannedQty: 80,
    actualPackedQty: 80,
    status: "已完成",
    createdBy: "U-PACKING-A",
    createdAt: "2026-07-16T10:00:00.000Z",
  }, packingParameters, "write_guard");
  assert.match(packingSql, /INSERT INTO packing_tasks/);
  assert.match(packingSql, /actual_packed_qty/);
  assert.match(packingSql, /revision = packing_tasks\.revision \+ 1/);

  const capacityParameters = createPostgresParameterBinder();
  const capacitySql = buildUpsertMachineCapacityBaselineSql({
    capacityBaselineId: "MCB-SQL-FRAGMENT-001",
    machineId: "BAG-01",
    sizeKey: "30*38",
    dailyCapacityQty: 80,
    hourlyCapacityQty: null,
    sourceKind: "production_report",
    confidence: "medium",
    effectiveFrom: "not-a-date",
    remark: "capacity O'Brien",
    createdBy: "U-OFFICE-A",
    createdAt: "2026-07-16T10:00:00.000Z",
  }, capacityParameters, "write_guard");
  assert.match(capacitySql, /INSERT INTO machine_capacity_baselines/);
  assert.match(capacitySql, /WHERE EXISTS \(SELECT 1 FROM machines/);
  assert.match(capacitySql, /CURRENT_DATE/);
  assert.match(capacitySql, /daily_capacity_qty = machine_capacity_baselines\.daily_capacity_qty \+ EXCLUDED\.daily_capacity_qty/);
  assert.ok(!capacitySql.includes("capacity O'Brien"));
  assert.equal(capacityParameters.values.includes("capacity O'Brien"), true);
  assert.equal(buildUpsertPackingTaskSql(null, createPostgresParameterBinder()), "SELECT NULL::json AS result WHERE false");
  assert.equal(buildUpsertMachineCapacityBaselineSql(null, createPostgresParameterBinder()), "SELECT NULL::json AS result WHERE false");
}

function checkRepositoryBoundary() {
  const repositorySource = readFileSync(new URL("../server/productionPackingTransactionRepository.mjs", import.meta.url), "utf8");
  const fragmentsSource = readFileSync(new URL("../server/productionPackingTaskSqlFragments.mjs", import.meta.url), "utf8");
  assert.match(repositorySource, /from "\.\/productionPackingTaskSqlFragments\.mjs"/);
  assert.doesNotMatch(repositorySource, /function buildUpsertProductionTaskSql\(/);
  assert.match(fragmentsSource, /export function buildUpsertProductionTaskSql\(/);
  assert.ok(repositorySource.split("\n").length <= 1400, "transaction repository should delegate shared task SQL fragments");
  assert.ok(fragmentsSource.split("\n").length <= 320, "task SQL fragments should remain independently reviewable");
}
