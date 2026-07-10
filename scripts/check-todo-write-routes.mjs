import assert from "node:assert/strict";
import { handleTodoWriteRoutes } from "../server/routes/todoWriteRoutes.mjs";

const calls = [];
const dependencies = {
  response: {},
  workspace: {},
  body: { action: "mark_handled" },
  permissionContext: { actionPermissions: ["todo.handle"] },
  writeActionPermissions: { handleTodo: "todo.handle" },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  handleTodoRoute({ response, workspace, todoId, body }) {
    calls.push({ kind: "handle", response, workspace, todoId, body });
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
  { kind: "handle", response: dependencies.response, workspace: dependencies.workspace, todoId: "T-1", body: dependencies.body },
]);

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
