import assert from "node:assert/strict";
import {
  STATEMENT_ACTIONS_BY_TAB,
  STATEMENT_DETAIL_TABS,
  STATEMENT_QUICK_FILTERS,
  buildStatementDecisionIdempotencyKey,
  createStatementDecisionDraft,
  getStatementBucketTone,
  getStatementExportTimeLabel,
  getStatementExportTokenLabel,
  getStatementExportTypeLabel,
} from "../src/features/statements/statementPageModel.js";

assert.deepEqual(STATEMENT_DETAIL_TABS, ["本期明细", "凭证/确认", "导出/归档"]);
assert.deepEqual(STATEMENT_QUICK_FILTERS, ["默认待处理", "欠款/差额", "收款待确认"]);
assert.deepEqual(STATEMENT_ACTIONS_BY_TAB, {
  本期明细: ["生成对账单预览", "登记实收", "差额待确认", "确认核销"],
  "凭证/确认": ["标记已发送", "标记已读回执", "登记客户确认", "登记实收"],
  "导出/归档": ["生成对账单预览", "导出Excel"],
});

const fixedNow = "2026-09-02T08:30:00.000Z";
assert.deepEqual(createStatementDecisionDraft("variance", () => fixedNow), {
  type: "variance",
  handlingResult: "",
  reason: "",
  delegatedDecision: {
    decisionChannel: "wechat",
    decidedAt: fixedNow,
    decisionContent: { summary: "" },
    authorizationBasis: "",
    evidenceDraftId: "",
    evidenceAttachmentIds: [],
  },
});

assert.equal(getStatementBucketTone("已结清"), "success");
assert.equal(getStatementBucketTone("欠款/差额"), "danger");
assert.equal(getStatementBucketTone("收款待确认"), "warning");
assert.equal(getStatementBucketTone("本期待对账"), "blue");

assert.equal(getStatementExportTypeLabel("customer_send"), "客户发送版");
assert.equal(getStatementExportTypeLabel("internal_archive"), "内部留档版");
assert.equal(getStatementExportTypeLabel("unknown"), "导出文件");
assert.equal(getStatementExportTimeLabel("2026-09-02T08:30:00.000Z"), "09-02 08:30");
assert.equal(getStatementExportTimeLabel("2026-09-02 08:30"), "2026-09-02 08:30");
assert.equal(getStatementExportTimeLabel(""), "时间待补");
assert.equal(getStatementExportTokenLabel("DL-1234567890123456"), "...7890123456");
assert.equal(getStatementExportTokenLabel("DL-123"), "DL-123");
assert.equal(getStatementExportTokenLabel(""), "待补");

assert.equal(
  buildStatementDecisionIdempotencyKey("variance", "ST-001", 4, () => "nonce-001"),
  "statement-variance:ST-001:4:nonce-001",
);
assert.notEqual(
  buildStatementDecisionIdempotencyKey("write_off", "ST-001", 4, () => "nonce-001"),
  buildStatementDecisionIdempotencyKey("write_off", "ST-001", 5, () => "nonce-001"),
  "statement revisions must remain part of the idempotency scope",
);

console.log("Office statement page model checks passed: tab actions, decision drafts, status tones, export labels, and idempotency scopes are behavior-covered.");
