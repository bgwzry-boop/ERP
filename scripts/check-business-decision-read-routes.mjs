import assert from "node:assert/strict";
import { handleBusinessDecisionReadRoutes } from "../server/routes/businessDecisionReadRoutes.mjs";
import { createBusinessDecisionReadProjectionService } from "../server/services/businessDecisionReadProjectionService.mjs";

const workspace = {
  users: [{ id: "U-OFFICE-A", displayName: "办公室甲" }],
  employees: [{ id: "ERP-MOTHER", bizNo: "031", name: "母亲", profileStatus: "formal_no_account", source: "master_data_import_review" }],
  businessDecisionEvidenceRepository: {
    listBusinessDecisions: async () => [{
      id: "BD-001",
      businessType: "statement",
      businessId: "ST-001",
      decisionScope: "statement_write_off",
      decisionType: "delegated",
      decisionMakerEmployeeId: "ERP-MOTHER",
      decisionMakerEmployeeNoSnapshot: "031",
      decisionMakerNameSnapshot: "母亲",
      decisionChannel: "wechat",
      decidedAt: "2026-07-17T03:30:00.000Z",
      decisionContent: { summary: "同意抹零" },
      authorizationSnapshot: {},
      authorizationBasis: "微信确认",
      evidenceAttachmentIds: [],
      enteredByUserId: "U-OFFICE-A",
      enteredAt: "2026-07-17T04:00:00.000Z",
      status: "active",
      revision: 1,
    }],
    listBusinessDecisionAuthorizations: async () => [{
      id: "AUTH-001",
      employeeId: "ERP-MOTHER",
      decisionScope: "statement_write_off",
      maxAmount: 100,
      activeFrom: "2026-01-01T00:00:00.000Z",
      status: "active",
      revision: 1,
    }],
  },
};
const projection = createBusinessDecisionReadProjectionService();

const decisions = await callRoute("http://erp.local/api/business-decisions?businessType=statement&businessId=ST-001", ["business_decision.read"]);
assert.equal(decisions.handled, true);
assert.equal(decisions.statusCode, 200);
assert.equal(decisions.payload.items[0].decisionMakerName, "母亲");
assert.equal(decisions.payload.items[0].enteredByName, "办公室甲");
assert.equal(decisions.payload.items[0].decisionScopeLabel, "对账抹零 / 核销");
assert.equal(decisions.payload.items[0].decisionChannelLabel, "微信");

const authorizations = await callRoute("http://erp.local/api/business-decision-authorizations?scope=statement_write_off", ["business_decision.read"]);
assert.equal(authorizations.statusCode, 200);
assert.equal(authorizations.payload.items[0].decisionScopeLabel, "对账抹零 / 核销");
assert.equal(authorizations.payload.items[0].maxAmount, 100);

const denied = await callRoute("http://erp.local/api/business-decisions", []);
assert.equal(denied.statusCode, 403);

console.log("Business decision read-route checks passed: permission control, read-only history, authorization projections, and Chinese labels are covered.");

async function callRoute(rawUrl, permissions) {
  const output = { statusCode: 0, payload: null };
  const handled = await handleBusinessDecisionReadRoutes({
    method: "GET",
    url: new URL(rawUrl),
    response: output,
    workspace,
    permissionContext: { actionPermissions: permissions },
    requireActionPermission(response, permissionContext, permission) {
      if (permissionContext.actionPermissions.includes(permission)) return true;
      response.statusCode = 403;
      response.payload = { code: "PERMISSION_DENIED" };
      return false;
    },
    businessDecisionReadProjectionService: projection,
    sendJson(response, statusCode, payload) {
      response.statusCode = statusCode;
      response.payload = payload;
    },
  });
  return { ...output, handled };
}
