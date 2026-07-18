import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleTodoWriteRoutes } from "../server/routes/todoWriteRoutes.mjs";

const calls = [];
const todo = { id: "T-1", type: "缺货待确认" };
const labelTodo = { id: "T-2", type: "待打印标签" };
const fulfillment = { id: "F-1", status: "待出库" };
const dependencies = {
  response: {},
  workspace: {},
  body: { action: "mark_handled" },
  permissionContext: { actionPermissions: ["todo.handle"], user: { displayName: "认证办公室" } },
  authContext: { userId: "U-AUTH" },
  writeActionPermissions: {
    handleTodo: "todo.handle",
    repairTodoReference: "todo.reference.repair",
    repairMissingFulfillment: "todo.fulfillment.repair",
  },
  requireActionPermission(response, permissionContext, permission) {
    calls.push({ kind: "permission", response, permissionContext, permission });
    return true;
  },
  getPermissionOperatorId(permissionContext, authContext, fallback) {
    calls.push({ kind: "operator", permissionContext, authContext, fallback });
    return "U-RESOLVED";
  },
  todoCommandService: {
    async handleTodo(input) {
      calls.push({ kind: "handle", ...input });
      return { todo, operationLogId: "LOG-HANDLE" };
    },
    async repairTodoReference(input) {
      calls.push({ kind: "reference", ...input });
      return { todo, operationLogId: "LOG-REFERENCE" };
    },
    async repairMissingFulfillment(input) {
      calls.push({ kind: "fulfillment", ...input });
      return {
        todo,
        labelTodo,
        fulfillment,
        packages: [{ packageId: "PKG-1" }, { id: "PKG-2" }],
        operationLogId: "LOG-FULFILLMENT",
      };
    },
  },
  todoReadProjectionService: {
    projectTodo(input) {
      calls.push({ kind: "todoProjection", ...input });
      return { todoId: input.todo.id, type: input.todo.type };
    },
  },
  fulfillmentReadProjectionService: {
    projectFulfillment(input) {
      calls.push({ kind: "fulfillmentProjection", ...input });
      return { fulfillmentId: input.fulfillment.id, status: input.fulfillment.status };
    },
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

await expectTodo("handle", "todo.handle", "handle", "LOG-HANDLE");
await expectTodo("reference", "todo.reference.repair", "reference", "LOG-REFERENCE", {
  refType: "order_line",
  refId: "ORD-1",
  reason: "人工核对",
});
await expectFulfillmentRepair();
await expectFailure({ notFound: true, code: "TODO_NOT_FOUND" }, {
  kind: "notFound",
  response: dependencies.response,
  code: "TODO_NOT_FOUND",
});
await expectFailure({ error: true, statusCode: 409, code: "TODO_REFERENCE_CONFLICT", message: "reference changed" }, {
  kind: "businessError",
  response: dependencies.response,
  statusCode: 409,
  code: "TODO_REFERENCE_CONFLICT",
  message: "reference changed",
});

calls.length = 0;
assert.equal(
  await run("POST", "/api/todos/T-1/handle", dependencies.body, {
    requireActionPermission() {
      calls.push({ kind: "denied" });
      return false;
    },
  }),
  true,
);
assert.deepEqual(calls, [{ kind: "denied" }]);
assert.equal(await run("GET", "/api/todos/T-1/handle"), false);
assert.equal(await run("POST", "/api/todos/T-1"), false);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../server/routes/todoWriteRoutes.mjs", import.meta.url), "utf8");
for (const removedWrapper of ["handleTodoRoute", "repairTodoReferenceRoute", "repairMissingFulfillmentRoute"]) {
  assert.doesNotMatch(apiSource, new RegExp(`async function ${removedWrapper}\\b`));
}
assert.match(apiSource, /handleTodoWriteRoutes\([\s\S]*todoCommandService,[\s\S]*todoReadProjectionService,[\s\S]*fulfillmentReadProjectionService,[\s\S]*sendBusinessError,/);
assert.doesNotMatch(routeSource, /todoActionRepository|TodoTransactionRepository|validateTodoReference|buildOperationLog|buildTodo/);

console.log("todo write routes checks passed: three permissions, authenticated operators, custom projections, failures, and thin API wiring are covered");

async function expectTodo(action, permission, kind, operationLogId, body = dependencies.body) {
  calls.length = 0;
  assert.equal(await run("POST", `/api/todos/T-1/${action}`, body), true);
  assert.deepEqual(calls, [
    permissionCall(permission),
    operatorCall(),
    commandCall(kind, body),
    { kind: "todoProjection", workspace: dependencies.workspace, todo },
    {
      kind: "json",
      response: dependencies.response,
      statusCode: 200,
      result: { todo: { todoId: "T-1", type: "缺货待确认" }, operationLogId },
    },
  ]);
}

async function expectFulfillmentRepair() {
  const body = { reason: "根据打包记录补建" };
  calls.length = 0;
  assert.equal(await run("POST", "/api/todos/T-1/fulfillment-repair", body), true);
  assert.deepEqual(calls, [
    permissionCall("todo.fulfillment.repair"),
    operatorCall(),
    commandCall("fulfillment", body),
    { kind: "todoProjection", workspace: dependencies.workspace, todo },
    { kind: "todoProjection", workspace: dependencies.workspace, todo: labelTodo },
    { kind: "fulfillmentProjection", workspace: dependencies.workspace, fulfillment },
    {
      kind: "json",
      response: dependencies.response,
      statusCode: 200,
      result: {
        todo: { todoId: "T-1", type: "缺货待确认" },
        labelTodo: { todoId: "T-2", type: "待打印标签" },
        fulfillment: { fulfillmentId: "F-1", status: "待出库" },
        packageIds: ["PKG-1", "PKG-2"],
        operationLogId: "LOG-FULFILLMENT",
      },
    },
  ]);
}

async function expectFailure(result, expectedResponse) {
  calls.length = 0;
  assert.equal(
    await run("POST", "/api/todos/T-1/handle", dependencies.body, {
      todoCommandService: { ...dependencies.todoCommandService, handleTodo: async () => result },
    }),
    true,
  );
  assert.deepEqual(calls, [permissionCall("todo.handle"), operatorCall(), expectedResponse]);
}

function run(method, pathname, body = dependencies.body, overrides = {}) {
  return handleTodoWriteRoutes({
    ...dependencies,
    ...overrides,
    body,
    method,
    url: new URL(`http://erp.test${pathname}`),
  });
}

function permissionCall(permission) {
  return { kind: "permission", response: dependencies.response, permissionContext: dependencies.permissionContext, permission };
}

function operatorCall() {
  return { kind: "operator", permissionContext: dependencies.permissionContext, authContext: dependencies.authContext, fallback: "U-OFFICE-A" };
}

function commandCall(kind, body) {
  return {
    kind,
    workspace: dependencies.workspace,
    todoId: "T-1",
    body,
    operatorId: "U-RESOLVED",
    operatorName: "认证办公室",
  };
}
