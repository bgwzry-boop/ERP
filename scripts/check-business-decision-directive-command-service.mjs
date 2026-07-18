import assert from "node:assert/strict";

import {
  buildWriteDecisionDirectiveTransactionQuery,
  createLocalBusinessDecisionEvidenceRepository,
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

const query = buildWriteDecisionDirectiveTransactionQuery({
  decisionRecord: workspace.businessDecisionRecords[0],
  todo: first.response.todo,
  operationLog: workspace.operationLogs[0],
});
assert.match(query.text, /ERP_BUSINESS_DECISION_ALREADY_TERMINAL/);
assert.match(query.text, /INSERT INTO business_decision_records/);
assert.match(query.text, /INSERT INTO todos/);
assert.match(query.text, /INSERT INTO operation_logs/);

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
