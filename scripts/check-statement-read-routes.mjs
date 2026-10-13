import assert from "node:assert/strict";
import { handleStatementReadRoutes } from "../server/routes/statementReadRoutes.mjs";

const calls = [];
const workspace = {
  statements: [{ id: "ST-1", customerId: "C-1", status: "待收款" }],
  statementExportObjectStorage: { id: "statement-storage" },
};
const customers = [
  { customerId: "C-1", customerName: "白鲸", statementId: "ST-1", status: "待收款" },
  { customerId: "C-2", customerName: "美的", statementId: "ST-2", status: "已结清" },
];
const dependencies = {
  response: {},
  workspace,
  permissionContext: { actionPermissions: ["statement.preview"] },
  authContext: { userId: "U-AUTH" },
  writeActionPermissions: { previewStatement: "statement.preview" },
  sendJson(response, status, body) {
    calls.push({ kind: "json", response, status, body });
  },
  sendNotFound(response, code) {
    calls.push({ kind: "notFound", response, code });
  },
  sendCommandResponse(response, result) {
    calls.push({ kind: "commandResponse", response, result });
  },
  sendFile(response, statusCode, body, options) {
    calls.push({ kind: "file", response, statusCode, body, options });
  },
  getStatementCustomers() {
    return customers;
  },
  filterByKeyword(items, keyword, fields) {
    if (!keyword) return items;
    return items.filter((item) => fields.some((field) => item[field]?.includes(keyword)));
  },
  filterByValue(items, value, field) {
    return value ? items.filter((item) => item[field] === value) : items;
  },
  paginate(items, query) {
    return { items, page: Number(query.get("page") ?? 1), total: items.length };
  },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  getPermissionOperatorId(permissionContext, authContext, fallback) {
    calls.push({ kind: "operator", permissionContext, authContext, fallback });
    return "U-RESOLVED";
  },
  async runStatementExportStorageDiagnostics(storage) {
    calls.push({ kind: "storage", storage });
    return { status: "ready" };
  },
  async buildStatementExportV1Readiness(input) {
    calls.push({ kind: "readiness", ...input });
    return { status: "blocked" };
  },
  statementExportFileService: {
    async listExports(input) {
      calls.push({ kind: "exports", ...input });
      return { response: { items: [{ downloadToken: "DL-1" }] } };
    },
    async getExportDownload(input) {
      calls.push({ kind: "download", ...input });
      if (input.downloadToken === "MISSING") return { notFound: true, code: "STATEMENT_EXPORT_NOT_FOUND" };
      return { response: { body: Buffer.from("xlsx"), options: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName: "statement.xlsx" } } };
    },
  },
};

await expectProtectedRoute("/api/statements/export-storage-diagnostics", [
  { kind: "storage", storage: workspace.statementExportObjectStorage },
  { kind: "json", response: dependencies.response, status: 200, body: { status: "ready" } },
]);
await expectProtectedRoute("/api/statements/export-v1-readiness", [
  { kind: "readiness", workspace, operatorId: "U-RESOLVED" },
  { kind: "json", response: dependencies.response, status: 200, body: { status: "blocked" } },
], true);
await expectProtectedRoute("/api/statements/ST%2F1/exports", [
  { kind: "exports", workspace, statementId: "ST/1" },
  { kind: "commandResponse", response: dependencies.response, result: { response: { items: [{ downloadToken: "DL-1" }] } } },
]);
await expectProtectedRoute("/api/statements/ST%2F1/exports/DL%2F1", [
  { kind: "download", workspace, statementId: "ST/1", downloadToken: "DL/1" },
  { kind: "file", response: dependencies.response, statusCode: 200, body: Buffer.from("xlsx"), options: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName: "statement.xlsx" } },
]);
await expectProtectedRoute("/api/statements/ST-1/exports/MISSING", [
  { kind: "download", workspace, statementId: "ST-1", downloadToken: "MISSING" },
  { kind: "notFound", response: dependencies.response, code: "STATEMENT_EXPORT_NOT_FOUND" },
]);
assert.equal(
  await handleStatementReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/statements/customers?status=%E5%BE%85%E6%94%B6%E6%AC%BE&page=2") }),
  true,
);
assert.deepEqual(calls.pop(), {
  kind: "json",
  response: dependencies.response,
  status: 200,
  body: { items: [customers[0]], page: 2, total: 1 },
});

assert.equal(
  await handleStatementReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/statements/ST-1") }),
  true,
);
assert.deepEqual(calls.pop(), { kind: "json", response: dependencies.response, status: 200, body: workspace.statements[0] });

assert.equal(
  await handleStatementReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/statements/MISSING") }),
  true,
);
assert.deepEqual(calls.pop(), { kind: "notFound", response: dependencies.response, code: "STATEMENT_NOT_FOUND" });

calls.length = 0;
assert.equal(
  await handleStatementReadRoutes({
    ...dependencies,
    url: new URL("http://erp.test/api/statements/export-storage-diagnostics"),
    requireActionPermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);
assert.equal(await handleStatementReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/statements/ST-1/exports/DL-1/extra") }), false);

console.log("statement read routes checks passed: customer/detail reads, diagnostics, export list/download, permissions, 404, and thin API wiring are covered");

async function expectProtectedRoute(pathname, expectedCalls, needsOperator = false) {
  calls.length = 0;
  assert.equal(await handleStatementReadRoutes({ ...dependencies, url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls.shift(), {
    kind: "permission",
    response: dependencies.response,
    permissionContext: dependencies.permissionContext,
    permission: "statement.preview",
  });
  if (needsOperator) {
    assert.deepEqual(calls.shift(), {
      kind: "operator",
      permissionContext: dependencies.permissionContext,
      authContext: dependencies.authContext,
      fallback: "U-OFFICE-A",
    });
  }
  assert.deepEqual(calls, expectedCalls);
}
