import assert from "node:assert/strict";
import { commitLocalAuthorizationWrite } from "../server/businessDecisionAuthorizationRepository.mjs";
import { handleBusinessDecisionAuthorizationWriteRoutes } from "../server/routes/businessDecisionAuthorizationWriteRoutes.mjs";
import { createBusinessDecisionAuthorizationCommandService } from "../server/services/businessDecisionAuthorizationCommandService.mjs";
import { createBusinessDecisionPolicyService } from "../server/services/businessDecisionPolicyService.mjs";
import { createBusinessDecisionReadProjectionService } from "../server/services/businessDecisionReadProjectionService.mjs";
import { roleCatalog } from "../shared/auth/roleCatalog.js";

let logSequence = 0;
const now = () => new Date("2026-07-17T04:00:00.000Z");
const service = createBusinessDecisionAuthorizationCommandService({
  now,
  buildOperationLog(_workspace, input) {
    logSequence += 1;
    return { id: `LOG-AUTH-${logSequence}`, ...input, occurredAt: now().toISOString(), createdAt: now().toISOString() };
  },
});
const workspace = buildWorkspace();
workspace.businessDecisionAuthorizationRepository = { writeAuthorization: commitLocalAuthorizationWrite };

assert.equal(roleCatalog.management.actionPermissions.includes("business_decision.authorization.manage"), true);
assert.equal(roleCatalog.office.actionPermissions.includes("business_decision.authorization.manage"), false);
assert.equal(roleCatalog.finance.actionPermissions.includes("business_decision.authorization.manage"), false);
assert.equal(roleCatalog.office.actionPermissions.includes("business_decision.record_delegated"), true);

const officeDenied = await callRoute("U-OFFICE-A", roleCatalog.office.actionPermissions, {
  idempotencyKey: "office-denied-auth-create",
  employeeId: "ERP-MOTHER",
  decisionScope: "raw_material_purchase",
  activeFrom: "2026-01-01T00:00:00.000Z",
});
assert.equal(officeDenied.statusCode, 403);

const financeDenied = await callRoute("U-FINANCE-A", roleCatalog.finance.actionPermissions, {
  idempotencyKey: "finance-denied-auth-create",
  employeeId: "ERP-MOTHER",
  decisionScope: "raw_material_purchase",
  activeFrom: "2026-01-01T00:00:00.000Z",
});
assert.equal(financeDenied.statusCode, 403);

const created = await service.createAuthorization({
  workspace,
  operatorId: "U-MANAGER-A",
  body: {
    idempotencyKey: "manager-create-mother-purchase-auth",
    employeeId: "ERP-MOTHER",
    decisionScope: "raw_material_purchase",
    maxAmount: 5000,
    activeFrom: "2026-01-01T00:00:00.000Z",
    activeTo: "2026-12-31T23:59:59.999Z",
    authorizationNote: "负责人电话确认",
    createdBy: "FORGED-CREATOR",
    updatedBy: "FORGED-UPDATER",
  },
});
assert.equal(created.statusCode, 201);
assert.equal(created.response.authorization.createdBy, "U-MANAGER-A");
assert.equal(created.response.authorization.updatedBy, "U-MANAGER-A");
assert.equal(workspace.employees.find((item) => item.id === "ERP-MOTHER").accountEnabled, false, "formal employee without an ERP account must be eligible");

const replay = await service.createAuthorization({
  workspace,
  operatorId: "U-MANAGER-A",
  body: {
    idempotencyKey: "manager-create-mother-purchase-auth",
    employeeId: "ERP-MOTHER",
    decisionScope: "raw_material_purchase",
    maxAmount: 5000,
    activeFrom: "2026-01-01T00:00:00.000Z",
    activeTo: "2026-12-31T23:59:59.999Z",
    authorizationNote: "负责人电话确认",
  },
});
assert.equal(replay.response.replayed, true);
assert.equal(replay.response.authorization.authorizationId, created.response.authorization.authorizationId);

for (const [employeeId, code] of [
  ["SEED-EMPLOYEE", "BUSINESS_DECISION_AUTHORIZATION_EMPLOYEE_NOT_FORMAL"],
  ["ERP-DEPARTED", "BUSINESS_DECISION_AUTHORIZATION_EMPLOYEE_STATUS_INVALID"],
  ["ERP-VOIDED", "BUSINESS_DECISION_AUTHORIZATION_EMPLOYEE_STATUS_INVALID"],
]) {
  const rejected = await service.createAuthorization({ workspace, operatorId: "U-MANAGER-A", body: {
    idempotencyKey: `rejected-${employeeId.toLowerCase()}-authorization`, employeeId,
    decisionScope: "raw_material_purchase", activeFrom: "2026-01-01T00:00:00.000Z",
  } });
  assert.equal(rejected.code, code);
}

const negative = await service.createAuthorization({ workspace, operatorId: "U-MANAGER-A", body: {
  idempotencyKey: "negative-authorization-amount", employeeId: "ERP-AUNT", decisionScope: "raw_material_purchase",
  maxAmount: -1, activeFrom: "2026-01-01T00:00:00.000Z",
} });
assert.equal(negative.code, "BUSINESS_DECISION_AUTHORIZATION_AMOUNT_INVALID");
const invalidRange = await service.createAuthorization({ workspace, operatorId: "U-MANAGER-A", body: {
  idempotencyKey: "invalid-authorization-range", employeeId: "ERP-AUNT", decisionScope: "raw_material_purchase",
  activeFrom: "2026-12-31T00:00:00.000Z", activeTo: "2026-01-01T00:00:00.000Z",
} });
assert.equal(invalidRange.code, "BUSINESS_DECISION_AUTHORIZATION_RANGE_INVALID");

const overlap = await service.createAuthorization({ workspace, operatorId: "U-MANAGER-A", body: {
  idempotencyKey: "overlap-mother-purchase-authorization", employeeId: "ERP-MOTHER", decisionScope: "raw_material_purchase",
  activeFrom: "2026-06-01T00:00:00.000Z", activeTo: "2027-01-01T00:00:00.000Z",
} });
assert.equal(overlap.code, "BUSINESS_DECISION_AUTHORIZATION_OVERLAP");

const base = created.response.authorization;
const updateBody = {
  authorizationId: base.authorizationId,
  expectedRevision: base.revision,
  employeeId: base.employeeId,
  decisionScope: base.decisionScope,
  maxAmount: 6000,
  activeFrom: base.activeFrom,
  activeTo: base.activeTo,
  authorizationNote: "并发更新",
};
const [officeA, officeB] = await Promise.all([
  service.updateAuthorization({ workspace, authorizationId: base.authorizationId, operatorId: "U-MANAGER-A", body: { ...updateBody, idempotencyKey: "auth-concurrency-update-a" } }),
  service.updateAuthorization({ workspace, authorizationId: base.authorizationId, operatorId: "U-MANAGER-B", body: { ...updateBody, idempotencyKey: "auth-concurrency-update-b" } }),
]);
assert.deepEqual([officeA.statusCode, officeB.statusCode].sort(), [200, 409]);
const conflictResult = officeA.statusCode === 409 ? officeA : officeB;
assert.equal(conflictResult.details.currentVersion.revision, 2);
assert.equal(conflictResult.details.submittedVersion.expectedRevision, 1);

const policy = createBusinessDecisionPolicyService({ now });
const overAmount = policy.evaluateDecision({
  workspace, operatorId: "U-OFFICE-A",
  actionPermissions: ["business_decision.record_delegated", "raw_material.purchase.record_delegated"],
  decisionScope: "raw_material_purchase", authorizationAmount: 6001,
  delegatedDecision: { decisionMakerEmployeeId: "ERP-MOTHER", decisionChannel: "phone", decidedAt: "2026-07-17T03:30:00.000Z", decisionContent: { summary: "采购" }, authorizationBasis: "电话" },
});
assert.equal(overAmount.code, "AMOUNT_EXCEEDED");

workspace.businessDecisionAuthorizations.push(
  authorization("AUTH-FUTURE", "ERP-AUNT", "production_schedule", "2027-01-01T00:00:00.000Z", ""),
  authorization("AUTH-EXPIRED", "ERP-AUNT", "statement_variance", "2025-01-01T00:00:00.000Z", "2025-12-31T00:00:00.000Z"),
  { ...authorization("AUTH-INACTIVE", "ERP-AUNT", "statement_write_off", "2025-01-01T00:00:00.000Z", ""), status: "inactive", deactivatedAt: now().toISOString(), deactivationReason: "停用" },
);
const projected = createBusinessDecisionReadProjectionService().listAuthorizations(workspace, workspace.businessDecisionAuthorizations, { asOf: now().toISOString() });
assert.equal(projected.find((item) => item.authorizationId === "AUTH-FUTURE").effectiveStatus, "future");
assert.equal(projected.find((item) => item.authorizationId === "AUTH-EXPIRED").effectiveStatus, "expired");
assert.equal(projected.find((item) => item.authorizationId === "AUTH-INACTIVE").effectiveStatus, "inactive");
assert.equal(createBusinessDecisionReadProjectionService().listAuthorizations(workspace, workspace.businessDecisionAuthorizations, { asOf: now().toISOString(), effectiveOnly: true }).some((item) => item.authorizationId === "AUTH-FUTURE"), false);

const current = workspace.businessDecisionAuthorizations.find((item) => item.authorizationId === base.authorizationId);
const deactivated = await service.deactivateAuthorization({ workspace, authorizationId: current.authorizationId, operatorId: "U-MANAGER-A", body: {
  idempotencyKey: "deactivate-mother-purchase-authorization", expectedRevision: current.revision, reason: "授权期结束",
} });
assert.equal(deactivated.response.authorization.status, "inactive");
const replacement = await service.createAuthorization({ workspace, operatorId: "U-MANAGER-A", body: {
  idempotencyKey: "replacement-mother-purchase-authorization", employeeId: "ERP-MOTHER", decisionScope: "raw_material_purchase",
  activeFrom: "2026-01-01T00:00:00.000Z", activeTo: "2026-12-31T23:59:59.999Z", authorizationNote: "新授权行",
} });
assert.equal(replacement.statusCode, 201);
assert.notEqual(replacement.response.authorization.authorizationId, current.authorizationId);

console.log("Business decision authorization management checks passed: permission isolation, formal identities, spoof resistance, dates/amounts/overlap, idempotency, optimistic conflicts, effective projections, deactivation, and new-row reauthorization are covered.");

async function callRoute(userId, permissions, body) {
  const response = {};
  const handled = await handleBusinessDecisionAuthorizationWriteRoutes({
    method: "POST", url: new URL("http://erp.local/api/business-decision-authorizations"), response, workspace, body,
    permissionContext: { actionPermissions: permissions, user: { userId } }, authContext: { userId },
    requireActionPermission(target, context, permission) {
      if (context.actionPermissions.includes(permission)) return true;
      target.statusCode = 403; target.payload = { code: "PERMISSION_DENIED" }; return false;
    },
    getPermissionOperatorId: () => userId,
    businessDecisionAuthorizationCommandService: service,
    sendCommandResponse(target, result) { target.statusCode = result.statusCode; target.payload = result.response ?? result; },
  });
  return { handled, ...response };
}

function buildWorkspace() {
  return {
    users: [
      { id: "U-MANAGER-A", userId: "U-MANAGER-A", employeeId: "ERP-OWNER" },
      { id: "U-MANAGER-B", userId: "U-MANAGER-B", employeeId: "ERP-OWNER" },
      { id: "U-OFFICE-A", userId: "U-OFFICE-A", employeeId: "ERP-OFFICE" },
      { id: "U-FINANCE-A", userId: "U-FINANCE-A", employeeId: "ERP-FINANCE" },
    ],
    employees: [
      { id: "ERP-OWNER", bizNo: "001", name: "负责人", profileStatus: "account_enabled", source: "master_data_import_review", accountEnabled: true },
      { id: "ERP-OFFICE", bizNo: "010", name: "办公室", profileStatus: "account_enabled", source: "master_data_import_review", accountEnabled: true },
      { id: "ERP-MOTHER", bizNo: "031", name: "母亲", profileStatus: "formal_no_account", source: "master_data_import_review", accountEnabled: false },
      { id: "ERP-AUNT", bizNo: "032", name: "姨妈", profileStatus: "formal_no_account", source: "master_data_import_review", accountEnabled: false },
      { id: "SEED-EMPLOYEE", name: "演示员工", profileStatus: "active", source: "seed" },
      { id: "ERP-DEPARTED", name: "已离职", profileStatus: "departed", source: "master_data_import_review" },
      { id: "ERP-VOIDED", name: "已作废", profileStatus: "voided", source: "master_data_import_review" },
    ],
    businessDecisionAuthorizations: [], operationLogs: [], operationIdempotencyRecords: [],
  };
}

function authorization(id, employeeId, decisionScope, activeFrom, activeTo) {
  return { id, authorizationId: id, employeeId, decisionScope, maxAmount: null, activeFrom, activeTo, status: "active", authorizationNote: "测试", revision: 1, createdBy: "U-MANAGER-A", updatedBy: "U-MANAGER-A", createdAt: now().toISOString(), updatedAt: now().toISOString() };
}
