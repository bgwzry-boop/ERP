import assert from "node:assert/strict";
import {
  buildOfficeWorkspaceProjection,
  isOfficeWorkspaceProjectionEnabled,
} from "../server/services/officeWorkspaceProjectionService.mjs";

const workspace = {
  runtimeConfig: { mode: "demo", production: false },
  securityPolicy: { authSecret: "do-not-expose-auth-secret" },
  runtimeIdentityRepository: { kind: "postgres" },
  attachmentObjectStorage: { accessKey: "do-not-expose-access-key" },
  users: [
    {
      userId: "U-RUNTIME-OFFICE",
      passwordHash: "do-not-expose-password-hash",
      accessToken: "do-not-expose-access-token",
    },
  ],
  customers: [{ id: "C001", name: "测试客户" }],
  orderLines: [{ id: "OL-001", productName: "测试袋" }],
  inventories: [{ id: "INV-001", onHandQty: 100 }],
  todos: [],
  fulfillments: [],
  statements: [],
  statementLines: [],
  statementSendRecords: [],
  statementConfirmationRecords: [],
  operationLogs: [
    {
      id: "LOG-001",
      targetType: "runtime_user",
      before: { passwordHash: "nested-password-hash", status: "pending" },
      after: { accessToken: "nested-access-token", status: "active" },
    },
  ],
};

assert.equal(isOfficeWorkspaceProjectionEnabled(workspace), true);
assert.equal(
  isOfficeWorkspaceProjectionEnabled({ runtimeConfig: { mode: "production", production: true } }),
  false,
);
assert.equal(
  isOfficeWorkspaceProjectionEnabled({ runtimeConfig: { mode: "production", production: false } }),
  false,
);

const projection = buildOfficeWorkspaceProjection(workspace);
assert.equal(projection.projectionVersion, "office-workspace-legacy-v1");
assert.equal(projection.customers[0].name, "测试客户");
assert.equal(projection.orderLines[0].productName, "测试袋");
assert.equal(projection.operationLogs[0].before.status, "pending");
assert.equal(projection.operationLogs[0].before.passwordHash, undefined);
assert.equal(projection.operationLogs[0].after.accessToken, undefined);
assert.equal(projection.users, undefined);
assert.equal(projection.securityPolicy, undefined);
assert.equal(projection.runtimeIdentityRepository, undefined);
assert.equal(projection.attachmentObjectStorage, undefined);

const serialized = JSON.stringify(projection);
for (const secret of [
  "do-not-expose-auth-secret",
  "do-not-expose-access-key",
  "do-not-expose-password-hash",
  "do-not-expose-access-token",
  "nested-password-hash",
  "nested-access-token",
]) {
  assert.equal(serialized.includes(secret), false, `${secret} must not be exposed`);
}

console.log(
  "Office workspace projection checks passed: production is disabled and legacy demo output is allowlisted/redacted.",
);
