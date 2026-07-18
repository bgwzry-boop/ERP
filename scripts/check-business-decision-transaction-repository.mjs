import assert from "node:assert/strict";
import { createPostgresParameterBinder } from "../server/postgresSqlParameters.mjs";
import {
  buildBusinessDecisionAttachmentLinksCte,
  buildInsertBusinessDecisionCte,
  buildSupersedeBusinessDecisionCte,
  createLocalBusinessDecisionEvidenceRepository,
} from "../server/businessDecisionEvidenceRepository.mjs";

const repository = createLocalBusinessDecisionEvidenceRepository();
const workspace = {
  businessDecisionRecords: [],
  businessDecisionAuthorizations: [],
  attachments: [{ id: "ATT-1", ownerType: "business_decision_evidence_draft", ownerId: "BDED-001", purpose: "business_decision_evidence", status: "uploaded", hasContent: true, uploadedBy: "U-OFFICE-A", fileType: "image", fileSize: 128 }],
  businessDecisionEvidenceDrafts: [
    { id: "BDED-001", businessType: "raw_material_purchase_request", businessId: "RMP-001", decisionScope: "raw_material_purchase", status: "pending", revision: 1 },
    { id: "BDED-INVALID", businessType: "raw_material_purchase_request", businessId: "RMP-001", decisionScope: "raw_material_purchase", status: "pending", revision: 1 },
  ],
  attachmentLinks: [],
  operationLogs: [],
  rawMaterialPurchaseRequests: [],
};
const decisionRecord = decision("BD-001");
const operationLog = { id: "LOG-001", targetType: "raw_material_purchase_request", targetId: "RMP-001" };
const attachmentLinks = [{ id: "AL-001", attachmentId: "ATT-1", ownerType: "business_decision", ownerId: "BD-001", purpose: "business_decision_evidence" }];

const committed = repository.commitDecisionBundle({
  workspace,
  decisionRecord,
  attachmentLinks,
  operationLog,
  applyBusinessMutation(stagedWorkspace) {
    stagedWorkspace.rawMaterialPurchaseRequests.unshift({ id: "RMP-001", businessDecisionId: decisionRecord.id, revision: 1 });
    return { commitKeys: ["rawMaterialPurchaseRequests"], result: { requestId: "RMP-001" } };
  },
});
assert.equal(committed.replayed, false);
assert.equal(workspace.businessDecisionRecords.length, 1);
assert.equal(workspace.rawMaterialPurchaseRequests.length, 1);
assert.equal(workspace.attachmentLinks.length, 1);
assert.equal(workspace.operationLogs.length, 1);

let mutationCalled = false;
const replay = repository.commitDecisionBundle({
  workspace,
  decisionRecord,
  attachmentLinks,
  operationLog,
  applyBusinessMutation() { mutationCalled = true; },
});
assert.equal(replay.replayed, true);
assert.equal(mutationCalled, false);
assert.equal(workspace.businessDecisionRecords.length, 1);
assert.equal(workspace.rawMaterialPurchaseRequests.length, 1);

const beforeFailure = JSON.stringify(workspace);
assert.throws(() => repository.commitDecisionBundle({
  workspace,
  decisionRecord: decision("BD-INVALID"),
  attachmentLinks: [{ id: "AL-MISSING", attachmentId: "ATT-MISSING", ownerId: "BD-INVALID" }],
  operationLog: { id: "LOG-INVALID" },
  applyBusinessMutation(stagedWorkspace) {
    stagedWorkspace.rawMaterialPurchaseRequests.unshift({ id: "RMP-SHOULD-ROLLBACK" });
    return { commitKeys: ["rawMaterialPurchaseRequests"] };
  },
}), (error) => error.code === "BUSINESS_DECISION_EVIDENCE_ATTACHMENT_INVALID");
assert.equal(JSON.stringify(workspace), beforeFailure, "failed evidence linking must roll back every staged business change");

const replacement = { ...decision("BD-002", false), supersedesDecisionId: "BD-001" };
repository.commitDecisionBundle({
  workspace,
  decisionRecord: replacement,
  operationLog: { id: "LOG-002" },
  applyBusinessMutation() { return { commitKeys: [], result: {} }; },
});
assert.equal(workspace.businessDecisionRecords.find((item) => item.id === "BD-001").status, "superseded");
assert.equal(workspace.businessDecisionRecords.find((item) => item.id === "BD-002").status, "active");

const parameters = createPostgresParameterBinder();
const insertSql = buildInsertBusinessDecisionCte(decisionRecord, parameters);
const linksSql = buildBusinessDecisionAttachmentLinksCte(attachmentLinks, parameters);
const supersedeSql = buildSupersedeBusinessDecisionCte(replacement, parameters);
assert.match(insertSql, /INSERT INTO business_decision_records/);
assert.match(insertSql, /WHERE EXISTS \(SELECT 1 FROM business_write_guard WHERE ok\)/);
assert.match(linksSql, /INSERT INTO attachment_links/);
assert.match(supersedeSql, /status = 'superseded'/);
assert.equal(parameters.values.includes("U-OFFICE-A"), true);

console.log("Business decision repository checks passed: local atomic commit/rollback/replay/supersession and PostgreSQL transaction CTEs are covered.");

function decision(id, includeEvidence = true) {
  return {
    id,
    businessType: "raw_material_purchase_request",
    businessId: "RMP-001",
    decisionScope: "raw_material_purchase",
    decisionType: "delegated",
    decisionMakerEmployeeId: "ERP-MOTHER",
    decisionMakerEmployeeNoSnapshot: "031",
    decisionMakerNameSnapshot: "母亲",
    decisionChannel: "wechat",
    decidedAt: "2026-07-17T03:30:00.000Z",
    decisionContent: { summary: "同意采购" },
    authorizationId: "AUTH-001",
    authorizationSnapshot: { authorizationId: "AUTH-001", decisionScope: "raw_material_purchase" },
    authorizationBasis: "微信确认",
    amountSnapshot: null,
    currency: "CNY",
    evidenceAttachmentIds: includeEvidence ? [id === "BD-INVALID" ? "ATT-MISSING" : "ATT-1"] : [],
    evidenceDraftId: includeEvidence ? (id === "BD-INVALID" ? "BDED-INVALID" : "BDED-001") : "",
    enteredByUserId: "U-OFFICE-A",
    enteredAt: "2026-07-17T04:00:00.000Z",
    status: "active",
    supersedesDecisionId: "",
    lateEntry: false,
    lateEntryReason: "",
    revision: 1,
    operationLogId: "LOG-001",
    createdAt: "2026-07-17T04:00:00.000Z",
    updatedAt: "2026-07-17T04:00:00.000Z",
  };
}
