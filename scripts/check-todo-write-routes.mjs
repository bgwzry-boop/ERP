import assert from "node:assert/strict";
import { handleTodoWriteRoutes } from "../server/routes/todoWriteRoutes.mjs";

const calls = [];
const dependencies = {
  response: {},
  workspace: {},
  body: { action: "mark_handled" },
  permissionContext: { actionPermissions: ["todo.handle"], user: { displayName: "认证办公室" } },
  authContext: { userId: "U-AUTH" },
  writeActionPermissions: { handleTodo: "todo.handle", repairTodoReference: "todo.handle" },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  getPermissionOperatorId(permissionContext, authContext, fallback) {
    calls.push({ kind: "operator", permissionContext, authContext, fallback });
    return "U-AUTH";
  },
  handleTodoRoute(input) {
    calls.push({ kind: "handle", ...input });
  },
  repairTodoReferenceRoute(input) {
    calls.push({ kind: "repair", ...input });
  },
};

assert.equal(
  await handleTodoWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/todos/T-1/handle") }),
  true,
);
assert.deepEqual(calls, [
  {
    kind: "permission",
    response: dependencies.response,
    permissionContext: dependencies.permissionContext,
    permission: "todo.handle",
  },
  {
    kind: "operator",
    permissionContext: dependencies.permissionContext,
    authContext: dependencies.authContext,
    fallback: "U-OFFICE-A",
  },
  {
    kind: "handle",
    response: dependencies.response,
    workspace: dependencies.workspace,
    todoId: "T-1",
    body: dependencies.body,
    operatorId: "U-AUTH",
    operatorName: "认证办公室",
  },
]);

calls.length = 0;
assert.equal(
  await handleTodoWriteRoutes({ ...dependencies, body: { refType: "order_line", refId: "ORD-1", reason: "人工核对" }, method: "POST", url: new URL("http://erp.test/api/todos/T-1/reference") }),
  true,
);
assert.equal(calls[0]?.kind, "permission");
assert.equal(calls[0]?.permission, "todo.handle");
assert.equal(calls[2]?.kind, "repair");
assert.equal(calls[2]?.todoId, "T-1");

calls.length = 0;
assert.equal(
  await handleTodoWriteRoutes({
    ...dependencies,
    method: "POST",
    url: new URL("http://erp.test/api/todos/T-1/handle"),
    requireActionPermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);

assert.equal(
  await handleTodoWriteRoutes({ ...dependencies, method: "GET", url: new URL("http://erp.test/api/todos/T-1/handle") }),
  false,
);
assert.equal(
  await handleTodoWriteRoutes({ ...dependencies, method: "POST", url: new URL("http://erp.test/api/todos/T-1") }),
  false,
);

console.log("todo write routes checks passed");
