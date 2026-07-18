import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  sanitizeV1RoleTaskBoard,
  sanitizeV1UnblockPlan,
  sanitizeV1V2BoundaryBrief,
} from "../server/services/v1FieldCoordinationProjectionService.mjs";

const secrets = {
  databaseUrl: "postgresql://erp:secret@db.internal:5432/erp",
  endpoint: "https://minio.internal:9000",
  bucket: "erp-secret-bucket",
  bearer: "Bearer top-secret-token",
  envAssignment: "ERP_AUTH_SECRET=top-secret-auth",
  userPath: "/Users/xu/private/coordination.json",
  varPath: "/var/private/coordination.json",
  artifactPath: ".erp-local-storage/private/coordination.json",
};
const unsafeText = [
  `database-url=${secrets.databaseUrl}`,
  `endpoint=${secrets.endpoint}`,
  `bucket=${secrets.bucket}`,
  secrets.bearer,
  secrets.envAssignment,
  secrets.userPath,
  secrets.varPath,
  secrets.artifactPath,
].join(" ");

const apiServerSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const registrySource = readFileSync(
  new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url),
  "utf8",
);
const statusResponseSource = readFileSync(
  new URL("../server/services/v1GoLiveStatusResponseService.mjs", import.meta.url),
  "utf8",
);
assert.match(statusResponseSource, /from "\.\/v1FieldCoordinationProjectionService\.mjs"/);
assert.match(registrySource, /createV1GoLiveStatusResponseService/);
assert.doesNotMatch(apiServerSource, /function sanitizeV1UnblockPlan/);
assert.doesNotMatch(apiServerSource, /function sanitizeV1RoleTaskBoard/);
assert.doesNotMatch(apiServerSource, /function sanitizeV1V2BoundaryBrief/);
assert.doesNotMatch(apiServerSource, /function buildV1RoleTaskBoardCategorySummaries/);

const unblockPlan = sanitizeV1UnblockPlan({
  status: "blocked",
  ready: false,
  summary: {
    label: unsafeText,
    taskCount: 4,
    releaseTaskCount: 1,
    evidenceTaskCount: 1,
    signoffTaskCount: 1,
    boundaryTaskCount: 1,
    phaseCount: 1,
    roleCount: 2,
  },
  phases: [{
    key: "production",
    label: unsafeText,
    taskCount: 4,
    releaseTaskCount: 1,
    evidenceTaskCount: 1,
    signoffTaskCount: 1,
    boundaryTaskCount: 1,
    roles: ["技术/管理"],
    nextStep: unsafeText,
    groups: [{ group: unsafeText, count: 4 }],
    firstTasks: [{
      id: "release.env",
      type: "发布门禁",
      primaryRole: "技术/管理",
      roles: ["技术/管理"],
      group: unsafeText,
      title: unsafeText,
      status: "pending",
      action: unsafeText,
    }],
  }],
  roleBuckets: [{ role: "技术/管理", taskCount: 4, p0TaskCount: 4 }],
  firstActions: [{
    id: "release.env",
    type: "发布门禁",
    primaryRole: "技术/管理",
    roles: ["技术/管理"],
    group: unsafeText,
    title: unsafeText,
    status: "pending",
    action: unsafeText,
  }],
});
assert.equal(unblockPlan.status, "blocked");
assert.equal(unblockPlan.ready, false);
assert.equal(unblockPlan.summary.taskCount, 4);
assert.equal(unblockPlan.phases.length, 1);
assert.equal(unblockPlan.roleBuckets[0].taskCount, 4);

const roleTaskBoard = sanitizeV1RoleTaskBoard({
  status: "blocked",
  ready: false,
  summary: { label: unsafeText },
  tasks: [
    buildTask("release.env", "发布门禁", "技术/管理"),
    buildTask("evidence.storage", "现场证据", "仓库/出库"),
    buildTask("signoff.office", "负责人签字", "办公室"),
    buildTask("boundary.v1-v2", "V1/V2 边界", "管理"),
  ],
});
assert.equal(roleTaskBoard.status, "blocked");
assert.equal(roleTaskBoard.ready, false);
assert.equal(roleTaskBoard.available, true);
assert.equal(roleTaskBoard.summary.taskCount, 4);
assert.equal(roleTaskBoard.summary.releaseTaskCount, 1);
assert.equal(roleTaskBoard.summary.evidenceTaskCount, 1);
assert.equal(roleTaskBoard.summary.signoffTaskCount, 1);
assert.equal(roleTaskBoard.summary.boundaryTaskCount, 1);
assert.equal(roleTaskBoard.summary.categoryCount, 4);
assert.equal(roleTaskBoard.summary.roleCount, 4);
assert.deepEqual(
  roleTaskBoard.categorySummaries.map((item) => [item.key, item.count]),
  [["release", 1], ["evidence", 1], ["signoff", 1], ["boundary", 1]],
);

const boundaryBrief = sanitizeV1V2BoundaryBrief({
  ready: false,
  canDeclareV1Complete: true,
  conclusion: unsafeText,
  summary: { label: unsafeText },
  v1MustContinue: [unsafeText],
  v2Categories: [unsafeText],
  v2Differences: [unsafeText],
  moduleDifferences: [{ module: "生产环境", v1: unsafeText, v2: unsafeText }],
  ownerReview: {
    question: unsafeText,
    recommendation: unsafeText,
    approvalRule: unsafeText,
  },
});
assert.equal(boundaryBrief.status, "pending_confirmation");
assert.equal(boundaryBrief.ready, false);
assert.equal(boundaryBrief.canDeclareV1Complete, false);
assert.equal(boundaryBrief.available, true);
assert.equal(boundaryBrief.summary.v1MustContinueCount, 1);
assert.equal(boundaryBrief.summary.v2CategoryCount, 1);
assert.equal(boundaryBrief.summary.v2DifferenceCount, 1);
assert.equal(boundaryBrief.summary.moduleDifferenceCount, 1);
assert.equal(boundaryBrief.summary.ownerReviewRuleCount, 3);

const safeVariableGuidance = "ERP_V1_DATABASE_URL or DATABASE_URL or PGURL";
assert.equal(
  sanitizeV1V2BoundaryBrief({ v1MustContinue: [safeVariableGuidance] }).v1MustContinue[0],
  safeVariableGuidance,
);

const serialized = JSON.stringify({ unblockPlan, roleTaskBoard, boundaryBrief });
for (const secret of Object.values(secrets)) {
  assert.equal(serialized.includes(secret), false, `${secret} must not enter field coordination projections`);
}

function buildTask(id, type, role) {
  return {
    id,
    type,
    group: unsafeText,
    title: unsafeText,
    status: "pending",
    priority: "P0",
    primaryRole: role,
    roles: [role],
    action: unsafeText,
  };
}

console.log(
  "V1 field-coordination projection service checks passed: unblock plan, role categories, boundary truth, and redaction are isolated.",
);
