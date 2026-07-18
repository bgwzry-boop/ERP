import assert from "node:assert/strict";

import {
  listMaintenanceTasks,
  updateMaintenanceTask,
} from "../src/services/maintenanceTaskApiClient.js";

const authState = {
  authenticated: true,
  source: "api_runtime",
  session: { accessToken: "maintenance-client-check-token" },
};
const calls = [];
const fetchImpl = async (url, init) => {
  calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
  if (init.method === "GET") {
    return jsonResponse(200, {
      items: [{ taskId: "MT-001", machineId: "PRINT-01", machineName: "丝印 1 号机", type: "设备报修", status: "待处理", revision: 1 }],
      total: 1,
    });
  }
  return jsonResponse(200, {
    task: {
      taskId: "MT-001",
      machineId: "PRINT-01",
      machineName: "丝印 1 号机",
      type: "设备报修",
      status: "已恢复",
      finding: "传感器松动",
      actionTaken: "重新紧固校准",
      photoAttachmentIds: ["ATT-M-001"],
      revision: 2,
    },
    todo: { todoId: "T-MT-001", status: "已处理" },
    operationLogId: "OP-MT-001",
    replayed: false,
  });
};

const listed = await listMaintenanceTasks(
  { authState, operatorId: "U-MAINT-FORMAL", status: "all" },
  { apiBaseUrl: "http://127.0.0.1:8787/api", fetchImpl },
);
assert.equal(listed.source, "api");
assert.equal(listed.items[0].id, "MT-001");
assert.equal(calls[0].url, "http://127.0.0.1:8787/api/maintenance/tasks?status=all");
assert.equal(calls[0].init.headers.authorization, "Bearer maintenance-client-check-token");

const updated = await updateMaintenanceTask(
  {
    authState,
    operatorId: "U-MAINT-FORMAL",
    taskId: "MT-001",
    expectedRevision: 1,
    finding: "传感器松动",
    actionTaken: "重新紧固校准",
    status: "已恢复",
    photoAttachmentIds: ["ATT-M-001"],
    completionConfirmed: true,
  },
  { apiBaseUrl: "http://127.0.0.1:8787/api", fetchImpl },
);
assert.equal(updated.source, "api");
assert.equal(updated.task.revision, 2);
assert.equal(calls[1].url, "http://127.0.0.1:8787/api/maintenance/tasks/MT-001/update");
assert.equal(calls[1].body.expectedRevision, 1);
assert.equal(calls[1].body.completionConfirmed, true);
assert.ok(calls[1].init.headers["idempotency-key"], "maintenance writes must send an idempotency key");

console.log("Frontend maintenance task API client check passed: authenticated reads, revisioned completion writes, photo IDs, and idempotency headers are covered.");

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}
