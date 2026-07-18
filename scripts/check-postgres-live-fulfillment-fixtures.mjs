import assert from "node:assert/strict";
import {
  buildFulfillmentActionRecord,
  buildFulfillmentExceptionRecord,
  buildFulfillmentOperationLog,
  buildFulfillmentPrintRecord,
  buildFulfillmentTodo,
} from "./helpers/postgresLiveFulfillmentFixtures.mjs";

const fulfillment = buildFulfillmentActionRecord({
  fulfillmentId: "FULFILLMENT-FIXTURE-001",
  method: "快递快运",
  expectedQty: 600,
  actualQty: 580,
  status: "待确认拉走",
});
assert.equal(fulfillment.id, fulfillment.fulfillmentId);
assert.equal(fulfillment.bizNo, fulfillment.fulfillmentId);
assert.equal(fulfillment.lineId, fulfillment.orderLineId);
assert.equal(fulfillment.qty, fulfillment.expectedQty);
assert.equal(fulfillment.actualQty, 580);

const printRecord = buildFulfillmentPrintRecord({ printRecordId: "PR-FIXTURE-001", targetId: fulfillment.fulfillmentId });
assert.equal(printRecord.targetType, "fulfillment");
assert.equal(printRecord.targetId, fulfillment.fulfillmentId);
assert.equal(printRecord.batchNo, "PR-FIXTURE-001-BATCH");

const todo = buildFulfillmentTodo({ todoId: "TODO-FIXTURE-001", refId: fulfillment.orderLineId });
const exception = buildFulfillmentExceptionRecord({
  exceptionId: "FULFILLMENT-EXCEPTION-001",
  fulfillmentId: fulfillment.fulfillmentId,
  todoId: todo.id,
});
assert.equal(exception.fulfillmentId, fulfillment.fulfillmentId);
assert.equal(exception.todoId, todo.id);
assert.equal(exception.expectedQty - exception.actualQty, 10);
assert.equal(todo.ref, fulfillment.orderLineId);

const operationLog = buildFulfillmentOperationLog({
  logId: "LOG-FIXTURE-FULFILLMENT-001",
  action: "complete_fulfillment",
  fulfillmentId: fulfillment.fulfillmentId,
});
assert.equal(operationLog.targetId, fulfillment.fulfillmentId);
assert.equal(operationLog.before.status, "待出库");
assert.equal(operationLog.after.status, "待确认拉走");
assert.equal(operationLog.after.actualQty, 490);

console.log("PostgreSQL live fulfillment fixture checks passed: delivery, print, exception, todo, and audit records are stable.");
