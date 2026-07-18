import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  printerDeviceFieldTestRepository: {
    async listPrinterDeviceFieldTests({ filters }) {
      calls.push({ kind: "fieldTests", filters });
      return [{ recordId: "QA-1" }];
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
  async findPrintDevice(sourceWorkspace, id) {
    calls.push({ kind: "findDevice", sourceWorkspace, id });
    return id === "MISSING" ? null : { printDeviceId: id };
  },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  getPermissionOperatorId(permissionContext, authContext, fallback) {
    calls.push({ kind: "operator", permissionContext, authContext, fallback });
    return "U-RESOLVED";
  },
  printDriverDiagnosticsService: {
    getConfiguration({ workspace }) {
      return { mode: "guarded", workspace };
    },
    getSpoolDiagnostics({ workspace, operatorId }) {
      return { source: "spool", workspace, operatorId };
    },
    getCupsDiagnostics({ workspace, operatorId }) {
      return { source: "cups", workspace, operatorId };
    },
    getV1Readiness({ workspace, operatorId }) {
      return { source: "readiness", workspace, operatorId };
    },
  },
};

await expectDriverConfig();
await expectDriverDiagnostics("/api/print-driver/spool-diagnostics", "spool");
await expectDriverDiagnostics("/api/print-driver/cups-diagnostics", "cups");
await expectDriverDiagnostics("/api/print-driver/v1-readiness", "readiness");
await expectDeviceFieldTests();
await expectMissingDeviceFieldTests();
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

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
assert.doesNotMatch(apiSource, /async function listPrinterDeviceFieldTestsRoute\b/);
assert.match(apiSource, /handlePrintReadRoutes\([\s\S]*findPrintDevice,[\s\S]*printDriverDiagnosticsService,/);

console.log("print read routes checks passed: driver diagnostics, repository lists, device QA records, 404, and thin API wiring are covered");

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
  assert.deepEqual(calls, [
    {
      kind: "json",
      response: dependencies.response,
      status: 200,
      body: { mode: "guarded", workspace: dependencies.workspace },
    },
  ]);
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
      kind: "findDevice",
      sourceWorkspace: dependencies.workspace,
      id: "PRN/1",
    },
    {
      kind: "fieldTests",
      filters: { printDeviceId: "PRN/1", printJobId: null, documentType: null, operatorId: null, limit: null },
    },
    {
      kind: "json",
      response: dependencies.response,
      status: 200,
      body: {
        items: [{ recordId: "QA-1" }],
        page: 2,
        total: 1,
        printDevice: { printDeviceId: "PRN/1" },
        latestRecord: { recordId: "QA-1" },
      },
    },
  ]);
}

async function expectMissingDeviceFieldTests() {
  calls.length = 0;
  assert.equal(
    await handlePrintReadRoutes({
      ...dependencies,
      url: new URL("http://erp.test/api/print-devices/MISSING/field-tests"),
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
    { kind: "findDevice", sourceWorkspace: dependencies.workspace, id: "MISSING" },
    { kind: "notFound", response: dependencies.response, code: "PRINT_DEVICE_NOT_FOUND" },
  ]);
}
