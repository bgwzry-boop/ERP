import assert from "node:assert/strict";
import { handleStatementReadRoutes } from "../server/routes/statementReadRoutes.mjs";

const calls = [];
const workspace = {
  statements: [{ id: "ST-1", customerId: "C-1", status: "待收款" }],
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
  async getStatementExportStorageDiagnosticsRoute(input) {
    calls.push({ kind: "storage", ...input });
  },
  async getStatementExportV1ReadinessRoute(input) {
    calls.push({ kind: "readiness", ...input });
  },
  async listStatementExportsRoute(input) {
    calls.push({ kind: "exports", ...input });
  },
  async downloadStatementExportRoute(input) {
    calls.push({ kind: "download", ...input });
  },
};

await expectProtectedRoute("/api/statements/export-storage-diagnostics", "storage");
await expectProtectedRoute("/api/statements/export-v1-readiness", "readiness", { operatorId: "U-RESOLVED" }, "U-OFFICE-A");
await expectProtectedRoute("/api/statements/ST%2F1/exports", "exports", { statementId: "ST/1" });
await expectProtectedRoute("/api/statements/ST%2F1/exports/DL%2F1", "download", { statementId: "ST/1", downloadToken: "DL/1" });
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

console.log("statement read routes checks passed");

async function expectProtectedRoute(pathname, kind, identifiers = {}, fallback = "") {
  calls.length = 0;
  assert.equal(await handleStatementReadRoutes({ ...dependencies, url: new URL(`http://erp.test${pathname}`) }), true);
  assert.deepEqual(calls.shift(), {
    kind: "permission",
    response: dependencies.response,
    permissionContext: dependencies.permissionContext,
    permission: "statement.preview",
  });
  if (fallback) {
    assert.deepEqual(calls.shift(), {
      kind: "operator",
      permissionContext: dependencies.permissionContext,
      authContext: dependencies.authContext,
      fallback,
    });
  }
  assert.deepEqual(calls, [{ kind, response: dependencies.response, workspace: dependencies.workspace, ...identifiers }]);
}
