import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handlePrintWriteRoutes } from "../server/routes/printWriteRoutes.mjs";

const calls = [];
const dependencies = {
  response: {},
  workspace: {},
  body: { idempotencyKey: "print-write-route-check" },
  permissionContext: { actionPermissions: ["fulfillment.print"], user: { displayName: "认证操作人" } },
  authContext: { user: { userId: "U-AUTH" } },
  writeActionPermissions: {
    printFulfillment: "fulfillment.print",
    recordPrintDeviceFieldTest: "print.device_qa.record",
    printJobDriverCallback: "print.job.callback",
  },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  getPermissionOperatorId(permissionContext, authContext, fallback) {
    calls.push({ kind: "operator", permissionContext, authContext, fallback });
    return `resolved:${fallback}`;
  },
  printBatchCommandService: {},
  printDeviceCommandService: {},
  printJobLifecycleService: {},
  sendJson(response, statusCode, result) {
    calls.push({ kind: "json", response, statusCode, result });
  },
  sendCommandRecord(response, result, options) {
    calls.push({ kind: "record", response, result, options });
  },
};

for (const [serviceName, commandName, kind] of [
  ["printBatchCommandService", "createPrintBatch", "batch"],
  ["printDeviceCommandService", "upsertPrintDevice", "device"],
  ["printDeviceCommandService", "updatePrintDeviceDriverMode", "driverMode"],
  ["printDeviceCommandService", "recordPrinterDeviceFieldTest", "fieldTest"],
  ["printJobLifecycleService", "updatePrintJobStatus", "jobStatus"],
  ["printJobLifecycleService", "dispatchPrintJob", "dispatch"],
  ["printJobLifecycleService", "pollPrintJobs", "statusPoll"],
  ["printJobLifecycleService", "recordPrintJobDriverStatus", "driverStatus"],
  ["printJobLifecycleService", "pollPrintJobById", "pollStatus"],
  ["printJobLifecycleService", "retryPrintJob", "retry"],
]) {
  dependencies[serviceName][commandName] = async (input) => {
    calls.push({ kind, ...input });
    return { command: kind };
  };
}

await expectHandled("/api/print-batches", "batch", "fulfillment.print", {}, "U-OFFICE-A", "json", undefined, true);
await expectHandled("/api/print-devices", "device", "fulfillment.print", {}, "U-OFFICE-A", "json");
await expectHandled("/api/print-devices/PRN-1/driver-mode", "driverMode", "fulfillment.print", { printDeviceId: "PRN-1" }, "U-OFFICE-A");
await expectHandled("/api/print-devices/PRN-1/field-tests", "fieldTest", "print.device_qa.record", { printDeviceId: "PRN-1" }, "U-OFFICE-A");
await expectHandled("/api/print-jobs/status-poll", "statusPoll", "print.job.callback", {}, "U-PRINT-DRIVER-A");
for (const [action, kind, permission, fallback] of [
  ["status", "jobStatus", "fulfillment.print", "U-OFFICE-A"],
  ["dispatch", "dispatch", "fulfillment.print", "U-OFFICE-A"],
  ["driver-status", "driverStatus", "print.job.callback", "U-PRINT-DRIVER-A"],
  ["poll-status", "pollStatus", "print.job.callback", "U-PRINT-DRIVER-A"],
  ["retry", "retry", "fulfillment.print", "U-OFFICE-A"],
]) {
  await expectHandled(
    `/api/print-jobs/PJ-1/${action}`,
    kind,
    permission,
    { printJobId: "PJ-1" },
    fallback,
    "record",
    { notFoundCode: "PRINT_JOB_NOT_FOUND" },
  );
}

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
assert.equal(await handlePrintWriteRoutes({ ...dependencies, method: "GET", url: new URL("http://erp.test/api/print-batches") }), false);
assert.equal(await handlePrintWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/print-jobs/PJ-1") }), false);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../server/routes/printWriteRoutes.mjs", import.meta.url), "utf8");
for (const removedWrapper of [
  "createPrintBatchRoute",
  "upsertPrintDeviceRoute",
  "updatePrintDeviceDriverModeRoute",
  "recordPrinterDeviceFieldTestRoute",
  "updatePrintJobStatusRoute",
  "dispatchPrintJobRoute",
  "pollPrintJobsRoute",
  "recordPrintJobDriverStatusRoute",
  "pollPrintJobDriverStatusRoute",
  "retryPrintJobRoute",
]) {
  assert.doesNotMatch(apiSource, new RegExp(`async function ${removedWrapper}\\b`));
}
assert.match(apiSource, /handlePrintWriteRoutes\([\s\S]*printBatchCommandService,[\s\S]*printDeviceCommandService,[\s\S]*printJobLifecycleService,[\s\S]*sendJson,[\s\S]*sendCommandRecord,/);
assert.doesNotMatch(routeSource, /workspace\.printDriverAdapter|recordPrinterDeviceFieldTestAcceptance|normalizePrinterDeviceFieldTestChecks/);

console.log("print write routes checks passed: permissions, authenticated operators, raw/record responses, job 404s, non-printing QA, and thin API wiring are covered");

async function expectHandled(pathname, kind, permission, identifiers, fallback, responseKind = "record", options, includeOperatorName = false) {
  calls.length = 0;
  assert.equal(
    await handlePrintWriteRoutes({ ...dependencies, method: "POST", url: new URL(`http://erp.test${pathname}`) }),
    true,
  );
  const operatorId = `resolved:${fallback}`;
  const commandCall = {
    kind,
    workspace: dependencies.workspace,
    body: dependencies.body,
    operatorId,
    ...identifiers,
    ...(includeOperatorName ? { operatorName: dependencies.permissionContext.user.displayName } : {}),
  };
  const responseCall = responseKind === "json"
    ? { kind: "json", response: dependencies.response, statusCode: 200, result: { command: kind } }
    : { kind: "record", response: dependencies.response, result: { command: kind }, options };
  assert.deepEqual(calls, [
    { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, permission },
    { kind: "operator", permissionContext: dependencies.permissionContext, authContext: dependencies.authContext, fallback },
    commandCall,
    responseCall,
  ]);
}
