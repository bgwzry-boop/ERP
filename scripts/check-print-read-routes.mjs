import assert from "node:assert/strict";
import { handlePrintReadRoutes } from "../server/routes/printReadRoutes.mjs";

const calls = [];
const repositoryCalls = [];
const workspace = {
  printBatchRepository: {
    async listPrintBatchRecords({ filters }) {
      repositoryCalls.push({ kind: "batches", filters });
      return [{ printBatchId: "PB-1" }];
    },
  },
  printDeviceRepository: {
    async listPrintDevices({ filters }) {
      repositoryCalls.push({ kind: "devices", filters });
      return [{ printDeviceId: "PRN-1" }];
    },
  },
  printJobRepository: {
    async listPrintJobs({ filters }) {
      repositoryCalls.push({ kind: "jobs", filters });
      return [{ printJobId: "PJ-1" }];
    },
  },
};
const dependencies = {
  response: {},
  workspace,
  permissionContext: { actionPermissions: ["fulfillment.print"] },
  authContext: { userId: "U-AUTH" },
  writeActionPermissions: {
    printFulfillment: "fulfillment.print",
    recordPrintDeviceFieldTest: "print.device_qa.record",
  },
  sendJson(response, status, body) {
    calls.push({ kind: "json", response, status, body });
  },
  sendNotFound(response, code) {
    calls.push({ kind: "notFound", response, code });
  },
  paginate(items, query) {
    return { items, page: Number(query.get("page") ?? 1), total: items.length };
  },
  async findPrintJob(_workspace, id) {
    return id === "PJ-1" ? { printJobId: id } : null;
  },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  getPermissionOperatorId(permissionContext, authContext, fallback) {
    calls.push({ kind: "operator", permissionContext, authContext, fallback });
    return "U-RESOLVED";
  },
  getPrintDriverConfigurationResponse() {
    return { mode: "guarded" };
  },
  getPrintDriverSpoolDiagnosticsResponse({ workspace, operatorId }) {
    return { source: "spool", workspace, operatorId };
  },
  getPrintDriverCupsDiagnosticsResponse({ workspace, operatorId }) {
    return { source: "cups", workspace, operatorId };
  },
  getPrintDriverV1ReadinessResponse({ workspace, operatorId }) {
    return { source: "readiness", workspace, operatorId };
  },
  async listPrinterDeviceFieldTestsRoute(input) {
    calls.push({ kind: "fieldTests", ...input });
  },
};

await expectDriverConfig();
await expectDriverDiagnostics("/api/print-driver/spool-diagnostics", "spool");
await expectDriverDiagnostics("/api/print-driver/cups-diagnostics", "cups");
await expectDriverDiagnostics("/api/print-driver/v1-readiness", "readiness");
await expectDeviceFieldTests();
await expectJson("/api/print-batches?status=printed&todoId=T-1&page=2", { items: [{ printBatchId: "PB-1" }], page: 2, total: 1 });
assert.deepEqual(repositoryCalls.pop(), { kind: "batches", filters: { status: "printed", todoId: "T-1" } });

await expectJson("/api/print-devices?deviceType=label_printer&documentType=package_label", { items: [{ printDeviceId: "PRN-1" }], page: 1, total: 1 });
assert.deepEqual(repositoryCalls.pop(), {
  kind: "devices",
  filters: { status: null, deviceType: "label_printer", documentType: "package_label" },
});

await expectJson("/api/print-jobs?status=queued&targetId=F-1", { items: [{ printJobId: "PJ-1" }], page: 1, total: 1 });
assert.deepEqual(repositoryCalls.pop(), {
  kind: "jobs",
  filters: { status: "queued", targetType: null, targetId: "F-1", printRecordId: null, printDeviceId: null },
});

await expectJson("/api/print-jobs/PJ-1", { printJob: { printJobId: "PJ-1" } });
await expectNotFound("/api/print-jobs/MISSING", "PRINT_JOB_NOT_FOUND");
assert.equal(await handlePrintReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/print-jobs/PJ-1/dispatch") }), false);
assert.equal(await handlePrintReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/print-devices/PRN-1/field-tests/extra") }), false);
calls.length = 0;
assert.equal(
  await handlePrintReadRoutes({
    ...dependencies,
    url: new URL("http://erp.test/api/print-driver/spool-diagnostics"),
    requireActionPermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);
calls.length = 0;
assert.equal(
  await handlePrintReadRoutes({
    ...dependencies,
    url: new URL("http://erp.test/api/print-devices/PRN-1/field-tests"),
    requireActionPermission() {
      calls.push({ kind: "fieldTestsDenied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "fieldTestsDenied" }]);

console.log("print read routes checks passed");

async function expectJson(pathname, body) {
  assert.equal(await handlePrintReadRoutes({ ...dependencies, url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls.pop(), { kind: "json", response: dependencies.response, status: 200, body });
}

async function expectNotFound(pathname, code) {
  assert.equal(await handlePrintReadRoutes({ ...dependencies, url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls.pop(), { kind: "notFound", response: dependencies.response, code });
}

async function expectDriverConfig() {
  calls.length = 0;
  assert.equal(await handlePrintReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/print-driver/config") }), true);
  assert.deepEqual(calls, [{ kind: "json", response: dependencies.response, status: 200, body: { mode: "guarded" } }]);
}

async function expectDriverDiagnostics(pathname, source) {
  calls.length = 0;
  assert.equal(await handlePrintReadRoutes({ ...dependencies, url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls, [
    {
      kind: "permission",
      response: dependencies.response,
      permissionContext: dependencies.permissionContext,
      permission: "fulfillment.print",
    },
    {
      kind: "operator",
      permissionContext: dependencies.permissionContext,
      authContext: dependencies.authContext,
      fallback: "U-OFFICE-A",
    },
    {
      kind: "json",
      response: dependencies.response,
      status: 200,
      body: { source, workspace: dependencies.workspace, operatorId: "U-RESOLVED" },
    },
  ]);
}

async function expectDeviceFieldTests() {
  calls.length = 0;
  assert.equal(
    await handlePrintReadRoutes({
      ...dependencies,
      url: new URL("http://erp.test/api/print-devices/PRN%2F1/field-tests?page=2"),
    }),
    true,
  );
  assert.deepEqual(calls, [
    {
      kind: "permission",
      response: dependencies.response,
      permissionContext: dependencies.permissionContext,
      permission: "print.device_qa.record",
    },
    {
      kind: "fieldTests",
      response: dependencies.response,
      workspace: dependencies.workspace,
      printDeviceId: "PRN/1",
      searchParams: new URL("http://erp.test/?page=2").searchParams,
    },
  ]);
}
