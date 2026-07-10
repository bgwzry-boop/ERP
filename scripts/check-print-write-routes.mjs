import assert from "node:assert/strict";
import { handlePrintWriteRoutes } from "../server/routes/printWriteRoutes.mjs";

const calls = [];
const dependencies = {
  response: {},
  workspace: {},
  body: { operatorId: "U-OFFICE-A" },
  permissionContext: { actionPermissions: ["fulfillment.print"] },
  authContext: { userId: "U-AUTH" },
  writeActionPermissions: {
    printFulfillment: "fulfillment.print",
    recordPrintDeviceFieldTest: "print.device_qa.record",
    printJobDriverCallback: "print.job.callback",
  },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  async createPrintBatchRoute({ response, workspace, body }) {
    calls.push({ kind: "batch", response, workspace, body });
  },
  async upsertPrintDeviceRoute({ response, workspace, body }) {
    calls.push({ kind: "device", response, workspace, body });
  },
  getPermissionOperatorId(permissionContext, authContext, fallback) {
    calls.push({ kind: "operator", permissionContext, authContext, fallback });
    return "U-RESOLVED";
  },
};

for (const [routeName, kind] of [
  ["updatePrintDeviceDriverModeRoute", "driverMode"],
  ["recordPrinterDeviceFieldTestRoute", "fieldTest"],
  ["updatePrintJobStatusRoute", "jobStatus"],
  ["dispatchPrintJobRoute", "dispatch"],
  ["pollPrintJobsRoute", "statusPoll"],
  ["recordPrintJobDriverStatusRoute", "driverStatus"],
  ["pollPrintJobDriverStatusRoute", "pollStatus"],
  ["retryPrintJobRoute", "retry"],
]) {
  dependencies[routeName] = async (input) => calls.push({ kind, ...input });
}

await expectHandled("/api/print-batches", "batch");
await expectHandled("/api/print-devices", "device");
await expectHandled("/api/print-devices/PRN-1/driver-mode", "driverMode", "fulfillment.print", { printDeviceId: "PRN-1" }, "U-OFFICE-A");
await expectHandled("/api/print-devices/PRN-1/field-tests", "fieldTest", "print.device_qa.record", { printDeviceId: "PRN-1" }, "U-OFFICE-A");
await expectHandled("/api/print-jobs/PJ-1/status", "jobStatus", "fulfillment.print", { printJobId: "PJ-1" });
await expectHandled("/api/print-jobs/PJ-1/dispatch", "dispatch", "fulfillment.print", { printJobId: "PJ-1" });
await expectHandled("/api/print-jobs/status-poll", "statusPoll", "print.job.callback", {}, "U-PRINT-DRIVER-A");
await expectHandled("/api/print-jobs/PJ-1/driver-status", "driverStatus", "print.job.callback", { printJobId: "PJ-1" }, "U-PRINT-DRIVER-A");
await expectHandled("/api/print-jobs/PJ-1/poll-status", "pollStatus", "print.job.callback", { printJobId: "PJ-1" }, "U-PRINT-DRIVER-A");
await expectHandled("/api/print-jobs/PJ-1/retry", "retry", "fulfillment.print", { printJobId: "PJ-1" });

calls.length = 0;
assert.equal(
  await handlePrintWriteRoutes({
    ...dependencies,
    method: "POST",
    url: new URL("http://erp.test/api/print-batches"),
    requireActionPermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);

assert.equal(
  await handlePrintWriteRoutes({ ...dependencies, method: "GET", url: new URL("http://erp.test/api/print-batches") }),
  false,
);
assert.equal(
  await handlePrintWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/print-jobs/PJ-1") }),
  false,
);

console.log("print write routes checks passed");

async function expectHandled(pathname, expectedKind, permission = "fulfillment.print", identifiers = {}, fallback = "") {
  calls.length = 0;
  assert.equal(await handlePrintWriteRoutes({ ...dependencies, method: "POST", url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls.shift(), {
    kind: "permission",
    response: dependencies.response,
    permissionContext: dependencies.permissionContext,
    permission,
  });
  if (fallback) {
    assert.deepEqual(calls.shift(), {
      kind: "operator",
      permissionContext: dependencies.permissionContext,
      authContext: dependencies.authContext,
      fallback,
    });
  }
  assert.deepEqual(calls, [
    { kind: expectedKind, response: dependencies.response, workspace: dependencies.workspace, body: dependencies.body, ...identifiers, ...(fallback ? { operatorId: "U-RESOLVED" } : {}) },
  ]);
}
