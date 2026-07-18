import assert from "node:assert/strict";
import { handleTodoReadRoutes } from "../server/routes/todoReadRoutes.mjs";

const calls = [];
const workspace = {
  todos: [
    { id: "T-1", type: "待打印标签", ref: "ORD-1", summary: "待打印", impact: "交付", handled: false, rank: 600 },
    { id: "T-2", type: "缺货待处理", ref: "ORD-2", summary: "已处理", impact: "库存", handled: true },
    { id: "T-3", type: "订单异常", ref: "ORD-3", summary: "急单", impact: "交付", handled: false, rank: 0 },
  ],
};
const dependencies = {
  response: {},
  workspace,
  sendJson(response, status, body) {
    calls.push({ response, status, body });
  },
  todoReadProjectionService: {
    listTodos({ workspace: inputWorkspace, searchParams }) {
      assert.equal(inputWorkspace, workspace);
      assert.equal(searchParams.get("status"), "open");
      assert.equal(searchParams.get("page"), "2");
      return {
        items: [{ todoId: "T-3", status: "open", summary: "急单", serverSortRank: 0, serverSortIndex: 0 }],
        page: 2,
        pageSize: 50,
        total: 2,
        reminderPolicy: { source: "server", version: "v1", redDotAfterMinutes: 30, followUpAfterMinutes: 1440, pinDueToday: true },
      };
    },
  },
};

assert.equal(
  await handleTodoReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/todos?status=open&page=2") }),
  true,
);
assert.deepEqual(calls.pop(), {
  response: dependencies.response,
  status: 200,
  body: {
    items: [{ todoId: "T-3", status: "open", summary: "急单", serverSortRank: 0, serverSortIndex: 0 }],
    page: 2,
    pageSize: 50,
    total: 2,
    reminderPolicy: { source: "server", version: "v1", redDotAfterMinutes: 30, followUpAfterMinutes: 1440, pinDueToday: true },
  },
});

assert.equal(
  await handleTodoReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/operation-logs") }),
  false,
);

console.log("todo read routes checks passed");
