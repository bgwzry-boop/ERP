import assert from "node:assert/strict";

import {
  buildWriteDecisionDirectiveTransactionQuery,
  createLocalBusinessDecisionEvidenceRepository,
  createPostgresBusinessDecisionEvidenceRepository,
} from "../server/businessDecisionEvidenceRepository.mjs";
import { createBusinessDecisionDirectiveCommandService } from "../server/services/businessDecisionDirectiveCommandService.mjs";
import { createBusinessDecisionEvidenceService } from "../server/services/businessDecisionEvidenceService.mjs";
import { createBusinessDecisionPolicyService } from "../server/services/businessDecisionPolicyService.mjs";

const clock = () => new Date("2026-07-17T06:00:00.000Z");
const policyService = createBusinessDecisionPolicyService({ now: clock });
const evidenceService = createBusinessDecisionEvidenceService({ policyService, now: clock });
const repository = createLocalBusinessDecisionEvidenceRepository();
const workspace = {
  users: [
    { userId: "U-MOTHER", employeeId: "ERP-MOTHER", displayName: "主要决策人" },
    { userId: "U-AUNT", employeeId: "ERP-AUNT", displayName: "辅助决策人" },
  ],
  employees: [
    { id: "ERP-MOTHER", bizNo: "031", name: "主要决策人", source: "formal", profileStatus: "active" },
    { id: "ERP-AUNT", bizNo: "032", name: "辅助决策人", source: "formal", profileStatus: "active" },
  ],
  businessDecisionAuthorizations: [
    authorization("AUTH-MOTHER-MAJOR", "ERP-MOTHER", "major_exception"),
    authorization("AUTH-AUNT-MAJOR", "ERP-AUNT", "major_exception"),
  ],
  businessDecisionRecords: [],
  businessDecisionEvidenceDrafts: [],
  attachments: [],
  attachmentLinks: [],
  operationLogs: [],
  operationIdempotencyRecords: [],
  todos: [{ id: "T-EX-1", type: "老板确认", summary: "重大异常", urgency: "异常" }],
  businessDecisionEvidenceRepository: repository,
};
const buildOperationLog = (current, input) => ({
  id: `LOG-${String((current.operationLogs?.length ?? 0) + 1).padStart(3, "0")}`,
  ...input,
  occurredAt: clock().toISOString(),
  createdAt: clock().toISOString(),
});
const service = createBusinessDecisionDirectiveCommandService({
  businessDecisionEvidenceService: evidenceService,
  buildOperationLog,
  now: clock,
});
const primaryPermissions = ["business_decision.act_directly", "major_exception.direct"];
const body = {
  idempotencyKey: "decision-major-0001",
  businessType: "todo",
  businessId: "T-EX-1",
  decisionScope: "major_exception",
  outcome: "approve",
  actionLabel: "按方案A处理",
  note: "优先保交期，办公室今天内执行并反馈。",
  taskTitle: "重大交付异常",
  factsSnapshot: [["交期", "今天"], ["影响", "客户出货"]],
};

const first = await service.recordDecisionDirective({ workspace, body, operatorId: "U-MOTHER", actionPermissions: primaryPermissions });
assert.equal(first.statusCode, 201);
assert.equal(first.response.businessDecision.decisionScope, "major_exception");
assert.equal(first.response.businessDecision.decisionMakerEmployeeId, "ERP-MOTHER");
assert.equal(first.response.todo.type, "经营决定待执行");
assert.equal(workspace.businessDecisionRecords.length, 1);
assert.equal(workspace.todos.length, 2);
assert.equal(workspace.operationLogs.length, 1);

const replay = await service.recordDecisionDirective({ workspace, body, operatorId: "U-MOTHER", actionPermissions: primaryPermissions });
assert.equal(replay.statusCode, 200);
assert.equal(replay.response.replayed, true);
assert.equal(replay.response.operationLogId, first.response.operationLogId);
assert.equal(workspace.businessDecisionRecords.length, 1);
assert.equal(workspace.todos.length, 2);

const conflict = await service.recordDecisionDirective({
  workspace,
  body: { ...body, idempotencyKey: "decision-major-0002", note: "另一个客户端尝试覆盖。" },
  operatorId: "U-MOTHER",
  actionPermissions: primaryPermissions,
});
assert.equal(conflict.statusCode, 409);
assert.equal(conflict.code, "BUSINESS_DECISION_ALREADY_TERMINAL");

const denied = await service.recordDecisionDirective({
  workspace: {
    ...workspace,
    businessDecisionRecords: [],
    operationLogs: [],
    operationIdempotencyRecords: [],
    todos: [{ id: "T-EX-2", type: "老板确认", summary: "另一重大异常", urgency: "异常" }],
  },
  body: { ...body, idempotencyKey: "decision-major-aunt", businessId: "T-EX-2" },
  operatorId: "U-AUNT",
  actionPermissions: ["business_decision.act_directly"],
});
assert.equal(denied.statusCode, 403);
assert.equal(denied.code, "BUSINESS_DECISION_DIRECT_PERMISSION_DENIED");

// Having major-exception authority must not allow it to be attached to financial or inventory records.
for (const [businessType, decisionScope] of [
  ["statement", "major_exception"], ["todo", "statement_write_off"],
  ["order", "production_schedule"], ["fulfillment", "raw_material_purchase"],
  ["raw_material_inbound", "raw_material_purchase"],
]) {
  const previousCounts = [workspace.businessDecisionRecords.length, workspace.todos.length, workspace.operationLogs.length];
  const invalid = await service.recordDecisionDirective({
    workspace: { ...workspace, statements: [{ id: "T-EX-1", variance: 9000 }],
      originalOrders: [{ id: "T-EX-1" }], fulfillments: [{ id: "T-EX-1" }], rawMaterialInbounds: [{ id: "T-EX-1" }] },
    body: { ...body, businessType, decisionScope, idempotencyKey: `invalid-${businessType}-${decisionScope}` },
    operatorId: "U-MOTHER", actionPermissions: primaryPermissions,
  });
  assert.equal(invalid.code, "BUSINESS_DECISION_TARGET_SCOPE_MISMATCH", `${businessType}/${decisionScope}`);
  assert.deepEqual([workspace.businessDecisionRecords.length, workspace.todos.length, workspace.operationLogs.length], previousCounts);
}

const financialWorkspace = {
  ...workspace, businessDecisionRecords: [], operationLogs: [], operationIdempotencyRecords: [], todos: [],
  statements: [{ id: "ST-FIN-1", revision: 1, receivable: 10000, received: 1000, variance: null, status: "差额待确认" }],
  businessDecisionAuthorizations: [{ ...authorization("AUTH-FIN", "ERP-MOTHER", "statement_write_off"), maxAmount: 100 }],
};
const financialBody = { ...body, businessType: "statement", businessId: "ST-FIN-1", decisionScope: "statement_write_off", idempotencyKey: "financial-directive" };
const financialPermissions = ["business_decision.act_directly", "statement.write_off.direct"];
for (const authorizationAmount of [undefined, null, 1]) {
  const stale = await service.recordDecisionDirective({ workspace: financialWorkspace, body: { ...financialBody, authorizationAmount }, operatorId: "U-MOTHER", actionPermissions: financialPermissions });
  assert.equal(stale.code, "BUSINESS_DECISION_FINANCIAL_SNAPSHOT_CONFLICT");
  assert.equal(stale.details.currentAmount, 9000);
}
const excessive = await service.recordDecisionDirective({ workspace: financialWorkspace, body: { ...financialBody, authorizationAmount: 9000 }, operatorId: "U-MOTHER", actionPermissions: financialPermissions });
assert.equal(excessive.code, "AMOUNT_EXCEEDED");
assert.equal(financialWorkspace.businessDecisionRecords.length, 0);
assert.equal(financialWorkspace.todos.length, 0);
assert.equal(financialWorkspace.operationLogs.length, 0);
financialWorkspace.statements[0] = { id: "ST-FIN-1", revision: 1, variance: null, receivable: null, received: null };
const unknown = await service.recordDecisionDirective({ workspace: financialWorkspace, body: { ...financialBody, authorizationAmount: 0 }, operatorId: "U-MOTHER", actionPermissions: financialPermissions });
assert.equal(unknown.code, "BUSINESS_DECISION_FINANCIAL_FACTS_UNAVAILABLE");
financialWorkspace.statements[0] = { id: "ST-FIN-1", revision: 1, variance: 50, receivable: 150, received: 100, status: "差额待确认" };
const allowed = await service.recordDecisionDirective({ workspace: financialWorkspace, body: { ...financialBody, authorizationAmount: 50, factsSnapshot: [["差额", "¥0"]] }, operatorId: "U-MOTHER", actionPermissions: financialPermissions });
assert.equal(allowed.statusCode, 201);
assert.ok(financialWorkspace.businessDecisionRecords[0].decisionContent.factsSnapshot.some(([key, value]) => key === "差额" && value === "¥50.00"));

for (const change of [{ revision: 2 }, { received: 101 }, { variance: 49 }, { status: "已核销" }, null]) {
  const changedWorkspace = { ...financialWorkspace, businessDecisionRecords: [], operationLogs: [], operationIdempotencyRecords: [], todos: [],
    statements: [{ id: "ST-FIN-1", revision: 1, variance: 50, receivable: 150, received: 100, status: "差额待确认" }],
    businessDecisionEvidenceRepository: { writeDecisionDirective(input) {
      const sql = buildWriteDecisionDirectiveTransactionQuery(input);
      assert.match(sql.text, /FROM statements WHERE id = .* FOR UPDATE/);
      assert.match(sql.text, /ERP_BUSINESS_DECISION_FINANCIAL_SNAPSHOT_CONFLICT/);
      assert.match(sql.text, /FROM financial_snapshot_guard/);
      input.workspace.statements = change ? [{ ...input.workspace.statements[0], ...change }] : [];
      return repository.writeDecisionDirective(input);
    } },
  };
  const interrupted = await service.recordDecisionDirective({ workspace: changedWorkspace, body: { ...financialBody, authorizationAmount: 50 }, operatorId: "U-MOTHER", actionPermissions: financialPermissions });
  assert.equal(interrupted.code, "BUSINESS_DECISION_FINANCIAL_SNAPSHOT_CONFLICT");
  assert.equal(changedWorkspace.businessDecisionRecords.length, 0);
  assert.equal(changedWorkspace.todos.length, 0);
  assert.equal(changedWorkspace.operationLogs.length, 0);
  assert.equal(changedWorkspace.operationIdempotencyRecords.length, 0);
}

const query = buildWriteDecisionDirectiveTransactionQuery({
  decisionRecord: workspace.businessDecisionRecords[0],
  todo: first.response.todo,
  operationLog: workspace.operationLogs[0],
});
assert.match(query.text, /ERP_BUSINESS_DECISION_ALREADY_TERMINAL/);
assert.match(query.text, /INSERT INTO business_decision_records/);
assert.match(query.text, /INSERT INTO todos/);
assert.match(query.text, /INSERT INTO operation_logs/);

const missingResultRepository = createPostgresBusinessDecisionEvidenceRepository({
  queryJson: async () => null, idempotentTransactionJson: async () => null,
});
await assert.rejects(() => missingResultRepository.writeDecisionDirective({
  decisionRecord: workspace.businessDecisionRecords[0], todo: first.response.todo,
  operationLog: workspace.operationLogs[0], idempotencyKey: "missing-result-check",
}), /returned invalid data/, "missing database result must not fabricate success from submitted input");

console.log("Business decision directive checks passed: formal authorization, first-terminal-wins, idempotent replay, office todo creation, and PostgreSQL transaction SQL are covered.");

function authorization(id, employeeId, decisionScope) {
  return {
    authorizationId: id,
    employeeId,
    decisionScope,
    maxAmount: null,
    activeFrom: "2026-01-01T00:00:00.000Z",
    activeTo: "",
    status: "active",
    authorizationNote: "已确认经营决定授权",
    revision: 1,
  };
}
