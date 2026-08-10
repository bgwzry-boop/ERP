import assert from "node:assert/strict";
import { createPhoneIdentityCommandService, normalizeMainlandChinaPhone } from "../server/services/phoneIdentityCommandService.mjs";

const fixedNow = new Date("2026-07-24T13:00:00.000Z");
let idSequence = 0;
const sentCodes = [];
const persistedStates = [];
const workspace = buildWorkspace();
const service = createPhoneIdentityCommandService({
  buildOperationLog(_workspace, input) {
    return {
      id: `LOG-PHONE-${++idSequence}`,
      ...input,
      occurredAt: fixedNow.toISOString(),
      createdAt: fixedNow.toISOString(),
    };
  },
  now: () => new Date(fixedNow),
  createVerificationCode: () => "123456",
  createId(prefix) {
    return `${prefix}-${++idSequence}`;
  },
});

assert.equal(normalizeMainlandChinaPhone("138 0000 0001"), "+8613800000001");
assert.equal(normalizeMainlandChinaPhone("+86 138-0000-0001"), "+8613800000001");
assert.equal(normalizeMainlandChinaPhone("12800000001"), "");

const disabledWorkspace = buildWorkspace({ enabled: false });
const disabled = await service.requestRegistrationCode({
  workspace: disabledWorkspace,
  body: { phone: "13800000001" },
});
assert.equal(disabled.statusCode, 404);
assert.equal(disabled.code, "PHONE_IDENTITY_FLOW_DISABLED");
assert.equal(disabledWorkspace.phoneVerificationChallenges.length, 0);

const invalidPhone = await service.requestRegistrationCode({
  workspace,
  body: { phone: "123" },
});
assert.equal(invalidPhone.statusCode, 422);
assert.equal(invalidPhone.code, "PHONE_NUMBER_INVALID");

const requested = await service.requestRegistrationCode({
  workspace,
  body: { phone: "13800000001" },
});
assert.equal(requested.statusCode, 202);
assert.equal(requested.response.accepted, true);
assert.equal(requested.response.phone, "+86138****0001");
assert.equal(JSON.stringify(requested.response).includes("123456"), false);
assert.equal(sentCodes.length, 1);
assert.equal(sentCodes[0].verificationCode, "123456");
assert.equal(workspace.phoneVerificationChallenges.length, 1);
assert.match(workspace.phoneVerificationChallenges[0].codeHash, /^[a-f0-9]{64}$/);
assert.equal(JSON.stringify(persistedStates.at(-1)).includes("123456"), false);

const rateLimited = await service.requestRegistrationCode({
  workspace,
  body: { phone: "13800000001" },
});
assert.equal(rateLimited.statusCode, 429);
assert.equal(rateLimited.code, "PHONE_CODE_RATE_LIMITED");

const wrongCode = await service.completeRegistration({
  workspace,
  body: { phone: "13800000001", code: "000000", displayName: "王小明" },
});
assert.equal(wrongCode.statusCode, 422);
assert.equal(wrongCode.code, "PHONE_CODE_INVALID_OR_EXPIRED");
assert.equal(workspace.phoneVerificationChallenges[0].failedAttempts, 1);

const registered = await service.completeRegistration({
  workspace,
  body: {
    phone: "13800000001",
    code: "123456",
    displayName: "王小明",
    invitationCode: "INVITE-OPAQUE-REFERENCE",
  },
});
assert.equal(registered.statusCode, 201);
assert.equal(registered.response.registered, true);
assert.equal(registered.response.assignmentRequired, true);
assert.equal(registered.response.registrationStatus, "pending_assignment");
assert.equal(registered.response.permissions.roles.length, 0);
assert.equal(registered.response.permissions.actionPermissions.length, 0);
assert.equal(registered.response.permissions.user.registrationStatus, "pending_assignment");
assert.equal(registered.response.user.passwordHash, undefined);
assert.equal(registered.response.user.invitationReferenceHash, undefined);
assert.equal(registered.response.user.registrationSource, "invitation");
assert.equal(workspace.operationLogs[0].after.businessPermissionsGranted, false);
assert.equal(JSON.stringify(workspace.operationLogs[0]).includes("13800000001"), false);
assert.equal(workspace.phoneVerificationChallenges[0].consumedAt, fixedNow.toISOString());

const duplicateRegistration = await service.requestRegistrationCode({
  workspace,
  body: { phone: "13800000001" },
});
assert.equal(duplicateRegistration.statusCode, 409);
assert.equal(duplicateRegistration.code, "PHONE_ACCOUNT_ALREADY_EXISTS");

const pendingReviews = service.listRegistrationReviews({
  workspace,
  filters: { status: "pending_assignment", keyword: "138" },
});
assert.equal(pendingReviews.length, 1);
assert.equal(pendingReviews[0].displayName, "王小明");
assert.equal(pendingReviews[0].phoneE164, "+8613800000001");
assert.equal(pendingReviews[0].actionRequired, true);

const userId = registered.response.user.userId;
const unconfirmedAssignment = await service.assignRegistration({
  workspace,
  userId,
  body: { employeeId: "EMP-PHONE-1", roleKeys: ["office"] },
  operatorId: "U-MANAGER-A",
});
assert.equal(unconfirmedAssignment.statusCode, 400);
assert.equal(unconfirmedAssignment.code, "PERSONNEL_ASSIGNMENT_CONFIRMATION_REQUIRED");

const invalidAssignment = await service.assignRegistration({
  workspace,
  userId,
  body: { confirmed: true, employeeId: "EMP-PHONE-1", roleKeys: ["unknown-role"] },
  operatorId: "U-MANAGER-A",
});
assert.equal(invalidAssignment.statusCode, 422);
assert.equal(invalidAssignment.code, "PERSONNEL_ROLE_INVALID");

const assigned = await service.assignRegistration({
  workspace,
  userId,
  body: {
    confirmed: true,
    employeeId: "EMP-PHONE-1",
    roleKey: "office",
    roleKeys: ["office"],
    assignmentNote: "人员管理员核对手机号和员工档案后分配办公室岗位",
  },
  operatorId: "U-MANAGER-A",
});
assert.equal(assigned.statusCode, 200);
assert.equal(assigned.response.assigned, true);
assert.equal(assigned.response.registrationReview.registrationStatus, "active");
assert.equal(assigned.response.registrationReview.employeeId, "EMP-PHONE-1");
assert.deepEqual(assigned.response.registrationReview.roles, ["office"]);
assert(assigned.response.permissions.actionPermissions.includes("raw_material.inbound.review"));
assert.equal(workspace.employees[0].userId, userId);
assert.equal(workspace.employees[0].profileStatus, "account_enabled");
assert.equal(workspace.operationLogs[0].targetType, "personnel_phone_registration_assignment");

const repeatedAssignment = await service.assignRegistration({
  workspace,
  userId,
  body: { confirmed: true, employeeId: "EMP-PHONE-1", roleKeys: ["office"] },
  operatorId: "U-MANAGER-A",
});
assert.equal(repeatedAssignment.statusCode, 409);
assert.equal(repeatedAssignment.code, "PHONE_REGISTRATION_NOT_PENDING");

const loginCode = await service.requestLoginCode({
  workspace,
  body: { phone: "13800000001" },
});
assert.equal(loginCode.statusCode, 202);
assert.equal(sentCodes.length, 2);
assert.equal(sentCodes[1].purpose, "login");
const phoneLogin = await service.loginWithPhoneCode({
  workspace,
  body: { phone: "13800000001", code: "123456" },
});
assert.equal(phoneLogin.statusCode, 200);
assert.equal(phoneLogin.response.assignmentRequired, false);
assert.equal(phoneLogin.response.registrationStatus, "active");
assert(phoneLogin.response.permissions.actionPermissions.includes("raw_material.inbound.review"));
assert(phoneLogin.response.session.accessToken.startsWith("erp-runtime-session-v1."));

const unknownPhoneLoginCode = await service.requestLoginCode({
  workspace,
  body: { phone: "13900000002" },
});
assert.equal(unknownPhoneLoginCode.statusCode, 202);
assert.equal(sentCodes.length, 2, "unknown phone must not receive a login code");
assert.equal(JSON.stringify(unknownPhoneLoginCode.response).includes("not found"), false);

console.log(
  "Phone identity command checks passed: verified self-registration, no-permission pending state, audited personnel assignment, role-derived permissions, OTP login, rate limiting, and non-enumerating unknown login requests are covered.",
);

function buildWorkspace(options = {}) {
  const enabled = options.enabled !== false;
  return {
    securityPolicy: {
      strictAuth: false,
      authSecret: "phone-identity-check-secret",
      allowSeedUsers: true,
      allowLegacyIdentityHeaders: true,
      allowActionPermissionOverride: true,
      allowDefaultSeedUser: true,
      phoneRegistrationEnabled: enabled,
    },
    phoneVerificationSender: async (message) => {
      sentCodes.push(message);
      return { deliveryReference: `SMS-CHECK-${sentCodes.length}` };
    },
    runtimeIdentityRepository: {
      kind: "check",
      async saveState({ workspace: stagedWorkspace }) {
        persistedStates.push(structuredClone({
          users: stagedWorkspace.users,
          employees: stagedWorkspace.employees,
          operationLogs: stagedWorkspace.operationLogs,
          phoneVerificationChallenges: stagedWorkspace.phoneVerificationChallenges,
        }));
        return { saved: true };
      },
    },
    users: [],
    employees: [
      {
        id: "EMP-PHONE-1",
        bizNo: "EMP-PHONE-1",
        name: "王小明",
        roleName: "办公室",
        defaultWorkshop: "",
        defaultMachineId: "",
        accountEnabled: false,
        profileStatus: "pending_admin_review",
        requestedEnabled: false,
        updatedAt: fixedNow.toISOString(),
      },
    ],
    machines: [],
    operationLogs: [],
    phoneVerificationChallenges: [],
  };
}
