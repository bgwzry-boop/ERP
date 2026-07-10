import assert from "node:assert/strict";
import { handleTodoReadRoutes } from "../server/routes/todoReadRoutes.mjs";

const calls = [];
const workspace = {
  todos: [
    { id: "T-1", type: "待打印标签", ref: "ORD-1", summary: "待打印", impact: "交付", handled: false },
    { id: "T-2", type: "缺货待处理", ref: "ORD-2", summary: "已处理", impact: "库存", handled: true },
  ],
};
const dependencies = {
  response: {},
  workspace,
  sendJson(response, status, body) {
    calls.push({ response, status, body });
  },
  filterByKeyword(items, keyword, fields) {
    if (!keyword) return items;
    return items.filter((item) => fields.some((field) => item[field]?.includes(keyword)));
  },
  filterByValue(items, value, field) {
    return value && value !== "all" ? items.filter((item) => item[field] === value) : items;
  },
  paginate(items, query) {
    return { items, page: Number(query.get("page") ?? 1), total: items.length };
  },
  toTodoListItem(_workspace, item) {
    return { todoId: item.id, status: item.handled ? "handled" : "open", summary: item.summary };
  },
};

assert.equal(
  await handleTodoReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/todos?status=open&page=2") }),
  true,
);
assert.deepEqual(calls.pop(), {
  response: dependencies.response,
  status: 200,
  body: { items: [{ todoId: "T-1", status: "open", summary: "待打印" }], page: 2, total: 1 },
});

assert.equal(
  await handleTodoReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/todos?status=handled") }),
  true,
);
assert.deepEqual(calls.pop(), {
  response: dependencies.response,
  status: 200,
  body: { items: [{ todoId: "T-2", status: "handled", summary: "已处理" }], page: 1, total: 1 },
});

assert.equal(
  await handleTodoReadRoutes({ ...dependencies, url: new URL("http://erp.test/api/operation-logs") }),
  false,
);

console.log("todo read routes checks passed");
