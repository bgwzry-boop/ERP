import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { createApiServer } from "../server/apiServer.mjs";
import { projectTodoReminder, sortTodoReminderItems } from "../server/services/todoReminderPolicyService.mjs";
import { createLocalTodoActionRepository } from "../server/todoActionRepository.mjs";
import {
  closeTestServer,
  getTestServerBaseUrl,
  listenTestServer,
  requestJson,
} from "./helpers/apiIntegrationTestHarness.mjs";

const pressureResult = runReminderPressureCheck();
const concurrentRepository = createConcurrentTodoRepository();
const server = createApiServer({ allowLocalFixture: true,
  runtimeMode: "test",
  applyProductionEnvFile: false,
  todoActionRepository: concurrentRepository,
});
await server.ready;
await listenTestServer(server);

try {
  const baseUrl = getTestServerBaseUrl(server);
  const operators = ["U-OFFICE-A", "U-MANAGER-A"];
  const writes = operators.map((operatorId, index) => requestJson(baseUrl, "/api/todos/T001/handle", {
    method: "POST",
    expectedStatus: [200, 409],
    headers: {
      "content-type": "application/json",
      "x-erp-user-id": operatorId,
    },
    body: JSON.stringify({
      action: "mark_handled",
      handlingResult: `${operatorId} 并发处理`,
      reason: "多账号并发回归",
      idempotencyKey: `todo-concurrency-${index + 1}-001`,
    }),
  }));
  const writeResults = await Promise.all(writes);

  assert.deepEqual(writeResults.map((result) => result.status).sort((left, right) => left - right), [200, 409]);
  assert.equal(writeResults.find((result) => result.status === 409)?.body.code, "BUSINESS_WRITE_CONFLICT");
  assert.equal(concurrentRepository.metrics.recordAttempts, 2);
  assert.equal(concurrentRepository.metrics.successfulWrites, 1);

  const readOperators = ["U-OFFICE-A", "U-WAREHOUSE-A", "U-FINANCE-A", "U-MANAGER-A"];
  const readRequests = Array.from({ length: 160 }, (_, index) => {
    const operatorId = readOperators[index % readOperators.length];
    return () => requestJson(baseUrl, "/api/todos?status=all&page=1&pageSize=8", {
      expectedStatus: 200,
      headers: { "x-erp-user-id": operatorId },
    });
  });
  const readResults = [];
  for (let offset = 0; offset < readRequests.length; offset += 20) {
    readResults.push(...await Promise.all(readRequests.slice(offset, offset + 20).map((request) => request())));
  }
  assert(readResults.every((result) => result.status === 200));
  assert(readResults.every((result) => result.body.total === 8));
  assert(readResults.every((result) => result.body.items.length === 8));
  assert(readResults.every((result) => result.body.items.every(
    (item, index) => item.serverSortIndex === index && Number.isFinite(item.serverSortRank),
  )));
  assert.equal(new Set(readResults.map((result) => result.body.items.map((item) => item.todoId).join("|"))).size, 1);
  const handledTodo = readResults[0].body.items.find((item) => item.todoId === "T001");
  assert.equal(handledTodo.handled, true);
  assert(operators.includes(handledTodo.handledBy));

  console.log(
    `Todo pressure/concurrency checks passed: 10,000 reminders projected and sorted in ${pressureResult.elapsedMs}ms; `
      + "160 reads across 4 accounts stayed stable; 2 concurrent writes produced exactly 1 commit and 1 conflict.",
  );
} finally {
  await closeTestServer(server, { forceAfterMs: 1_000 });
}

function runReminderPressureCheck() {
  const now = new Date("2026-07-13T02:30:00.000Z");
  const todos = Array.from({ length: 10_000 }, (_, index) => ({
    id: `T-PRESSURE-${String(index).padStart(5, "0")}`,
    createdAt: new Date(now.getTime() - index * 60_000).toISOString(),
    latestNeededAt: new Date(now.getTime() + ((index % 5) - 2) * 86_400_000).toISOString(),
    urgency: ["普通", "急", "今天", "异常", "关注"][index % 5],
    handled: index % 17 === 0,
    remindAt: index % 19 === 0 ? new Date(now.getTime() + 3_600_000).toISOString() : "",
  }));
  const startedAt = performance.now();
  const projected = todos.map((todo) => ({ ...todo, ...projectTodoReminder(todo, { now }) }));
  const sorted = sortTodoReminderItems(projected);
  const elapsedMs = Math.round(performance.now() - startedAt);

  assert.equal(sorted.length, todos.length);
  assert.equal(new Set(sorted.map((todo) => todo.id)).size, todos.length);
  assert(sorted.every((todo, index) => todo.serverSortIndex === index));
  assert(sorted.every((todo, index) => index === 0 || sorted[index - 1].serverSortRank <= todo.serverSortRank));
  assert.equal(todos.some((todo) => Object.hasOwn(todo, "serverSortIndex")), false);
  for (const level of ["normal", "red_dot", "follow_up", "snoozed", "handled"]) {
    assert(projected.some((todo) => todo.reminderLevel === level), `Missing reminder pressure sample for ${level}`);
  }
  assert(elapsedMs < 3_000, `10,000 reminder projection exceeded the 3s regression budget: ${elapsedMs}ms`);
  return { elapsedMs };
}

function createConcurrentTodoRepository() {
  const repository = createLocalTodoActionRepository();
  const waitingReaders = [];
  let barrierReadCount = 0;
  const metrics = { recordAttempts: 0, successfulWrites: 0 };
  return {
    ...repository,
    metrics,
    async getTodo(input) {
      const snapshot = await repository.getTodo(input);
      if (input.todoId === "T001" && barrierReadCount < 2) {
        barrierReadCount += 1;
        await new Promise((resolve) => {
          waitingReaders.push(resolve);
          if (waitingReaders.length === 2) {
            queueMicrotask(() => waitingReaders.splice(0).forEach((release) => release()));
          }
        });
      }
      return snapshot;
    },
    async recordTodoAction(input) {
      metrics.recordAttempts += 1;
      const result = await repository.recordTodoAction(input);
      metrics.successfulWrites += 1;
      return result;
    },
  };
}
