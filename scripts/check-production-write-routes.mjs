import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleProductionWriteRoutes } from "../server/routes/productionWriteRoutes.mjs";

const calls = [];
const dependencies = {
  response: {},
  workspace: {},
  body: { idempotencyKey: "production-write-route-check" },
  permissionContext: { actionPermissions: [] },
  authContext: { user: { userId: "U-AUTH" } },
  writeActionPermissions: {
    publishProductionSchedule: "production.schedule.publish",
    resequenceProductionSchedule: "production.schedule.sequence.update",
    moveProductionSchedule: "production.schedule.sequence.update",
    reportProduction: "production.report.complete",
    resolveProductionException: "production.exception.resolve",
    completePacking: "packing.complete",
  },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  getPermissionOperatorId(permissionContext, authContext, fallback) {
    calls.push({ kind: "operator", permissionContext, authContext, fallback });
    return "U-RESOLVED";
  },
  productionSchedulingCommandService: {},
  productionReportingCommandService: {},
  productionFinishedGoodsPhotoCommandService: {},
  packingCommandService: {},
  productionFinishedGoodsPhotoProjectionService: {
    buildPhotoSummary(workspace, productionTask, orderLine) {
      calls.push({ kind: "photoSummary", workspace, productionTask, orderLine });
      return { status: "待确认" };
    },
  },
  todoReadProjectionService: {
    summarizeTodo(todo) {
      calls.push({ kind: "todoSummary", todo });
      return { id: todo.id, type: todo.type };
    },
  },
  findOrderLine(workspace, orderLineId) {
    calls.push({ kind: "findOrderLine", workspace, orderLineId });
    return { id: orderLineId, product: "定制袋" };
  },
  toProductionTaskSummary(productionTask, orderLine) {
    calls.push({ kind: "taskSummary", productionTask, orderLine });
    return { id: productionTask.id, orderLineId: orderLine.id };
  },
  summarizeOrderLineForChange(orderLine) {
    calls.push({ kind: "lineSummary", orderLine });
    return { id: orderLine.id, product: orderLine.product };
  },
  sendCommandResponse(response, result, options) {
    calls.push({ kind: "response", response, result, options });
  },
  sendJson(response, statusCode, result) {
    calls.push({ kind: "json", response, statusCode, result });
  },
  sendNotFound(response, code) {
    calls.push({ kind: "notFound", response, code });
  },
  sendBusinessError(response, statusCode, code, message) {
    calls.push({ kind: "businessError", response, statusCode, code, message });
  },
};

for (const [serviceName, commandName, kind] of [
  ["productionSchedulingCommandService", "publishSchedule", "publish"],
  ["productionSchedulingCommandService", "resequenceMachineQueue", "resequence"],
  ["productionSchedulingCommandService", "moveMachineQueueItem", "move"],
  ["productionReportingCommandService", "completeProductionReport", "complete"],
  ["productionReportingCommandService", "recordDailyProgress", "daily"],
  ["productionReportingCommandService", "recordProductionException", "exception"],
  ["productionReportingCommandService", "resolveProductionException", "exceptionResolution"],
  ["packingCommandService", "completePackingTask", "packing"],
]) {
  dependencies[serviceName][commandName] = async (input) => {
    calls.push({ kind, ...input });
    return { response: { command: kind } };
  };
}
dependencies.productionFinishedGoodsPhotoCommandService.uploadPhoto = async (input) => {
  calls.push({ kind: "photoUpload", ...input });
  return { productionTask: { id: "PT-1", orderLineId: "OL-1" }, operationLogId: "LOG-UPLOAD" };
};
dependencies.productionFinishedGoodsPhotoCommandService.reviewPhoto = async (input) => {
  calls.push({ kind: "photoReview", ...input });
  return {
    productionTask: { id: "PT-1", orderLineId: "OL-1" },
    todo: { id: "T-1", type: "待通知客户" },
    reviewStatus: "已接受",
    operationLogId: "LOG-REVIEW",
  };
};

for (const [pathname, permission, kind, identifiers] of [
  ["/api/production-tasks/PT-1/publish-schedule", "production.schedule.publish", "publish", { productionTaskId: "PT-1" }],
  ["/api/production-tasks/PT-1/report-complete", "production.report.complete", "complete", { productionTaskId: "PT-1" }],
  ["/api/production-tasks/PT-1/daily-progress", "production.report.complete", "daily", { productionTaskId: "PT-1" }],
  ["/api/production-tasks/PT-1/exception", "production.report.complete", "exception", { productionTaskId: "PT-1" }],
  ["/api/production-tasks/PT-1/exception-resolution", "production.exception.resolve", "exceptionResolution", { productionTaskId: "PT-1" }],
  ["/api/production-schedules/machine-queue/resequence", "production.schedule.sequence.update", "resequence", {}],
  ["/api/production-schedules/machine-queue/move", "production.schedule.sequence.update", "move", {}],
  ["/api/packing-tasks/PKT-1/complete", "packing.complete", "packing", { packingTaskId: "PKT-1" }],
]) {
  await expectStandard(pathname, permission, kind, identifiers);
}
await expectPhoto("/api/production-tasks/PT-1/finished-goods-photo", "production.report.complete", "photoUpload", false);
await expectPhoto("/api/production-tasks/PT-1/finished-goods-photo-review", "production.schedule.publish", "photoReview", true);

await expectPhotoFailure({ notFound: true, code: "PRODUCTION_TASK_NOT_FOUND" }, {
  kind: "notFound",
  response: dependencies.response,
  code: "PRODUCTION_TASK_NOT_FOUND",
});
await expectPhotoFailure({ error: true, statusCode: 422, code: "VALIDATION_ERROR", message: "attachment required" }, {
  kind: "businessError",
  response: dependencies.response,
  statusCode: 422,
  code: "VALIDATION_ERROR",
  message: "attachment required",
});

calls.length = 0;
assert.equal(
  await handleProductionWriteRoutes({
    ...dependencies,
    method: "POST",
    url: new URL("http://erp.test/api/production-tasks/PT-1/report-complete"),
    requireActionPermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);
assert.equal(await handleProductionWriteRoutes({ ...dependencies, method: "GET", url: new URL("http://erp.test/api/production-tasks/PT-1/report-complete") }), false);
assert.equal(await handleProductionWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/production-tasks/PT-1") }), false);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../server/routes/productionWriteRoutes.mjs", import.meta.url), "utf8");
for (const removedWrapper of [
  "publishProductionScheduleRoute",
  "resequenceProductionMachineQueueRoute",
  "moveProductionMachineQueueItemRoute",
  "recordProductionDailyProgressRoute",
  "uploadProductionFinishedGoodsPhotoRoute",
  "reviewProductionFinishedGoodsPhotoRoute",
  "reportProductionCompleteRoute",
  "completePackingTaskRoute",
]) {
  assert.doesNotMatch(apiSource, new RegExp(`async function ${removedWrapper}\\b`));
}
assert.match(apiSource, /handleProductionWriteRoutes\([\s\S]*productionSchedulingCommandService,[\s\S]*productionReportingCommandService,[\s\S]*productionFinishedGoodsPhotoCommandService,[\s\S]*packingCommandService,[\s\S]*sendCommandResponse,/);
assert.doesNotMatch(routeSource, /TransactionRepository|buildCustomerNotificationTodo|buildPhotoRetakeTodo|updateProduction/);

console.log("production write routes checks passed: permissions, authenticated operators, schedule/report/exception-resolution/photo/packing commands, photo projections, failures, and thin API wiring are covered");

async function expectStandard(pathname, permission, kind, identifiers) {
  calls.length = 0;
  assert.equal(await run(pathname), true);
  const actionPermissions = ["publish", "resequence", "move"].includes(kind)
    ? { actionPermissions: dependencies.permissionContext.actionPermissions }
    : {};
  assert.deepEqual(calls, [
    permissionCall(permission),
    operatorCall(),
    { kind, workspace: dependencies.workspace, body: dependencies.body, operatorId: "U-RESOLVED", ...actionPermissions, ...identifiers },
    { kind: "response", response: dependencies.response, result: { response: { command: kind } }, options: undefined },
  ]);
}

async function expectPhoto(pathname, permission, kind, review) {
  calls.length = 0;
  assert.equal(await run(pathname), true);
  const productionTask = { id: "PT-1", orderLineId: "OL-1" };
  const orderLine = { id: "OL-1", product: "定制袋" };
  const commandResult = review
    ? { productionTask, todo: { id: "T-1", type: "待通知客户" }, reviewStatus: "已接受", operationLogId: "LOG-REVIEW" }
    : { productionTask, operationLogId: "LOG-UPLOAD" };
  const expected = [
    permissionCall(permission),
    operatorCall(),
    { kind, workspace: dependencies.workspace, productionTaskId: "PT-1", body: dependencies.body, operatorId: "U-RESOLVED" },
    { kind: "findOrderLine", workspace: dependencies.workspace, orderLineId: "OL-1" },
    { kind: "taskSummary", productionTask, orderLine },
    { kind: "lineSummary", orderLine },
    { kind: "photoSummary", workspace: dependencies.workspace, productionTask, orderLine },
  ];
  if (review) expected.push({ kind: "todoSummary", todo: commandResult.todo });
  expected.push({
    kind: "json",
    response: dependencies.response,
    statusCode: 200,
    result: {
      productionTaskId: "PT-1",
      orderLineId: "OL-1",
      productionTask: { id: "PT-1", orderLineId: "OL-1" },
      orderLine: { id: "OL-1", product: "定制袋" },
      finishedGoodsPhoto: { status: "待确认" },
      customerNotificationTodoCreated: review,
      retakeTodoCreated: false,
      inventoryCreated: false,
      reservationCreated: false,
      packingTaskCreated: false,
      operationLogId: review ? "LOG-REVIEW" : "LOG-UPLOAD",
      ...(review ? { todo: { id: "T-1", type: "待通知客户" } } : {}),
    },
  });
  assert.deepEqual(calls, expected);
}

async function expectPhotoFailure(result, responseCall) {
  calls.length = 0;
  assert.equal(
    await handleProductionWriteRoutes({
      ...dependencies,
      method: "POST",
      url: new URL("http://erp.test/api/production-tasks/PT-1/finished-goods-photo"),
      productionFinishedGoodsPhotoCommandService: { ...dependencies.productionFinishedGoodsPhotoCommandService, uploadPhoto: async () => result },
    }),
    true,
  );
  assert.deepEqual(calls, [permissionCall("production.report.complete"), operatorCall(), responseCall]);
}

function run(pathname) {
  return handleProductionWriteRoutes({ ...dependencies, method: "POST", url: new URL(`http://erp.test${pathname}`) });
}

function permissionCall(permission) {
  return { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, permission };
}

function operatorCall() {
  return { kind: "operator", permissionContext: dependencies.permissionContext, authContext: dependencies.authContext, fallback: "U-OFFICE-A" };
}
