import assert from "node:assert/strict";
import { handleProductionWriteRoutes } from "../server/routes/productionWriteRoutes.mjs";

const calls = [];
const dependencies = {
  response: {},
  workspace: {},
  body: { operatorId: "U-OFFICE-A" },
  permissionContext: { actionPermissions: [] },
  authContext: { userId: "U-AUTH" },
  writeActionPermissions: {
    publishProductionSchedule: "production.schedule.publish",
    resequenceProductionSchedule: "production.schedule.sequence.update",
    moveProductionSchedule: "production.schedule.sequence.update",
    reportProduction: "production.report.complete",
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
};

for (const [pathname, permission, routeName, expected] of [
  ["/api/production-tasks/PT-1/publish-schedule", "production.schedule.publish", "publishProductionScheduleRoute", { productionTaskId: "PT-1" }],
  ["/api/production-tasks/PT-1/report-complete", "production.report.complete", "reportProductionCompleteRoute", { productionTaskId: "PT-1", operatorId: "U-RESOLVED" }],
  ["/api/production-tasks/PT-1/daily-progress", "production.report.complete", "recordProductionDailyProgressRoute", { productionTaskId: "PT-1", operatorId: "U-RESOLVED" }],
  ["/api/production-tasks/PT-1/finished-goods-photo", "production.report.complete", "uploadProductionFinishedGoodsPhotoRoute", { productionTaskId: "PT-1", operatorId: "U-RESOLVED" }],
  ["/api/production-tasks/PT-1/finished-goods-photo-review", "production.schedule.publish", "reviewProductionFinishedGoodsPhotoRoute", { productionTaskId: "PT-1", operatorId: "U-RESOLVED" }],
  ["/api/production-schedules/machine-queue/resequence", "production.schedule.sequence.update", "resequenceProductionMachineQueueRoute", { operatorId: "U-RESOLVED" }],
  ["/api/production-schedules/machine-queue/move", "production.schedule.sequence.update", "moveProductionMachineQueueItemRoute", { operatorId: "U-RESOLVED" }],
  ["/api/packing-tasks/PKT-1/complete", "packing.complete", "completePackingTaskRoute", { packingTaskId: "PKT-1", operatorId: "U-RESOLVED" }],
]) {
  dependencies[routeName] = async (input) => calls.push({ kind: routeName, ...input });
  await expectHandled(pathname, permission, routeName, expected);
}

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
assert.equal(
  await handleProductionWriteRoutes({ ...dependencies, method: "GET", url: new URL("http://erp.test/api/production-tasks/PT-1/report-complete") }),
  false,
);
assert.equal(
  await handleProductionWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/production-tasks/PT-1") }),
  false,
);

console.log("production write routes checks passed");

async function expectHandled(pathname, permission, routeName, expected) {
  calls.length = 0;
  assert.equal(await handleProductionWriteRoutes({ ...dependencies, method: "POST", url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls.shift(), {
    kind: "permission",
    response: dependencies.response,
    permissionContext: dependencies.permissionContext,
    permission,
  });
  if (expected.operatorId) {
    assert.deepEqual(calls.shift(), {
      kind: "operator",
      permissionContext: dependencies.permissionContext,
      authContext: dependencies.authContext,
      fallback: "U-OFFICE-A",
    });
  }
  assert.deepEqual(calls, [
    {
      kind: routeName,
      response: dependencies.response,
      workspace: dependencies.workspace,
      body: dependencies.body,
      ...expected,
    },
  ]);
}
