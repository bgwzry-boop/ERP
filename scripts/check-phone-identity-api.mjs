import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { createApiServer } from "../server/apiServer.mjs";
import {
  closeTestServer,
  getTestServerBaseUrl,
  listenTestServer,
  requestJson,
} from "./helpers/apiIntegrationTestHarness.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "phone-identity-api");
rmSync(storageRoot, { recursive: true, force: true });

assert.throws(
  () => createApiServer({ allowLocalFixture: true,
    runtimeMode: "test",
    phoneRegistrationEnabled: true,
    authSecret: "phone-identity-api-missing-sender-secret",
    applyProductionEnvFile: false,
  }),
  /phoneVerificationSender/,
  "the phone identity flag must fail startup when no real verification sender is configured",
);

await checkDisabledBoundary();
await checkPhoneIdentityFlow();
await checkStrictDisabledBoundary();

rmSync(storageRoot, { recursive: true, force: true });
console.log(
  "Phone identity API checks passed: default-disabled and strict boundaries, public phone verification, permissionless pending sessions, personnel assignment, same-session permission activation, first-release allowance, and OTP re-login are covered.",
);

async function checkDisabledBoundary() {
  const server = createApiServer({ allowLocalFixture: true,
    runtimeMode: "test",
    applyProductionEnvFile: false,
    runtimeIdentityRepositoryOptions: { storageRoot: join(storageRoot, "disabled") },
  });
  await listenTestServer(server);
  try {
    const response = await requestJson(getTestServerBaseUrl(server), "/api/auth/phone-registration/request-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "13800000001" }),
      expectedStatus: 404,
    });
    assert.equal(response.body.code, "PHONE_IDENTITY_FLOW_DISABLED");
  } finally {
    await closeTestServer(server);
  }
}

async function checkStrictDisabledBoundary() {
  const server = createApiServer({ allowLocalFixture: true,
    runtimeMode: "test",
    strictAuth: true,
    authSecret: "phone-identity-api-strict-secret",
    applyProductionEnvFile: false,
    runtimeIdentityRepositoryOptions: { storageRoot: join(storageRoot, "strict-disabled") },
  });
  await listenTestServer(server);
  try {
    const response = await requestJson(getTestServerBaseUrl(server), "/api/auth/phone-registration/request-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "13800000001" }),
      expectedStatus: 401,
    });
    assert.equal(response.body.code, "AUTH_SESSION_REQUIRED");
  } finally {
    await closeTestServer(server);
  }
}

async function checkPhoneIdentityFlow() {
  const sentMessages = [];
  const server = createApiServer({ allowLocalFixture: true,
    runtimeMode: "test",
    firstReleaseScope: "raw_material",
    phoneRegistrationEnabled: true,
    phoneVerificationSender: async (message) => {
      sentMessages.push(message);
      return { deliveryReference: `SMS-API-${sentMessages.length}` };
    },
    authSecret: "phone-identity-api-secret",
    applyProductionEnvFile: false,
    runtimeIdentityRepositoryOptions: { storageRoot: join(storageRoot, "enabled") },
    coreWorkspaceReadRepository: {
      kind: "local_memory",
      async loadState() {
        return {
          employees: [
            {
              id: "EMP-PHONE-API-1",
              bizNo: "EMP-PHONE-API-1",
              name: "赵海宁",
              roleName: "办公室",
              defaultWorkshop: "",
              defaultMachineId: "",
              accountEnabled: false,
              profileStatus: "pending_admin_review",
              requestedEnabled: false,
              updatedAt: "2026-07-24T13:00:00.000Z",
            },
          ],
        };
      },
    },
  });
  await listenTestServer(server);
  const baseUrl = getTestServerBaseUrl(server);
  const jsonHeaders = { "content-type": "application/json" };
  try {
    const requestCode = await requestJson(baseUrl, "/api/auth/phone-registration/request-code", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ phone: "13800000001" }),
      expectedStatus: 202,
    });
    assert.equal(requestCode.body.accepted, true);
    assert.equal(requestCode.body.phone, "+86138****0001");
    assert.equal(JSON.stringify(requestCode.body).includes(sentMessages[0].verificationCode), false);
    assert.equal(sentMessages.length, 1);

    const registration = await requestJson(baseUrl, "/api/auth/phone-registration/complete", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        phone: "13800000001",
        code: sentMessages[0].verificationCode,
        displayName: "赵海宁",
      }),
      expectedStatus: 201,
    });
    assert.equal(registration.body.assignmentRequired, true);
    assert.equal(registration.body.registrationStatus, "pending_assignment");
    assert.equal(registration.body.permissions.actionPermissions.length, 0);
    const pendingAccessToken = registration.body.session.accessToken;
    const userId = registration.body.user.userId;

    const pendingSession = await requestJson(baseUrl, "/api/auth/me", {
      headers: { authorization: `Bearer ${pendingAccessToken}` },
      expectedStatus: 200,
    });
    assert.equal(pendingSession.body.permissions.user.registrationStatus, "pending_assignment");
    assert.equal(pendingSession.body.permissions.actionPermissions.length, 0);

    const pendingList = await requestJson(
      baseUrl,
      "/api/master-data/personnel/registration-reviews?status=pending_assignment",
      { headers: { "x-erp-user-id": "U-MANAGER-A" }, expectedStatus: 200 },
    );
    assert.equal(pendingList.body.total, 1);
    assert.equal(pendingList.body.items[0].userId, userId);
    assert.equal(pendingList.body.items[0].phoneE164, "+8613800000001");

    const assignment = await requestJson(
      baseUrl,
      `/api/master-data/personnel/registration-reviews/${encodeURIComponent(userId)}/assign`,
      {
        method: "POST",
        headers: { ...jsonHeaders, "x-erp-user-id": "U-MANAGER-A" },
        body: JSON.stringify({
          confirmed: true,
          employeeId: "EMP-PHONE-API-1",
          roleKey: "office",
          roleKeys: ["office"],
          assignmentNote: "API 回归：人员管理员已核对手机号、员工档案和办公室岗位",
        }),
        expectedStatus: 200,
      },
    );
    assert.equal(assignment.body.assigned, true);
    assert.equal(assignment.body.registrationReview.registrationStatus, "active");
    assert(assignment.body.permissions.actionPermissions.includes("raw_material.inbound.review"));

    const activatedSameSession = await requestJson(baseUrl, "/api/auth/me", {
      headers: { authorization: `Bearer ${pendingAccessToken}` },
      expectedStatus: 200,
    });
    assert.equal(activatedSameSession.body.permissions.user.registrationStatus, "active");
    assert(activatedSameSession.body.permissions.actionPermissions.includes("raw_material.inbound.review"));

    const requestLoginCode = await requestJson(baseUrl, "/api/auth/phone-login/request-code", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ phone: "13800000001" }),
      expectedStatus: 202,
    });
    assert.equal(requestLoginCode.body.accepted, true);
    assert.equal(sentMessages.length, 2);
    const login = await requestJson(baseUrl, "/api/auth/phone-login", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ phone: "13800000001", code: sentMessages[1].verificationCode }),
      expectedStatus: 200,
    });
    assert.equal(login.body.assignmentRequired, false);
    assert(login.body.permissions.actionPermissions.includes("raw_material.inbound.review"));

    const unknownRequest = await requestJson(baseUrl, "/api/auth/phone-login/request-code", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ phone: "13900000002" }),
      expectedStatus: 202,
    });
    assert.equal(unknownRequest.body.accepted, true);
    assert.equal(sentMessages.length, 2);
  } finally {
    await closeTestServer(server);
  }
}
