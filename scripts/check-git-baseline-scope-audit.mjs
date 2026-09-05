import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_OUTPUT_PATH,
  buildGitBaselineScopeReport,
  inspectGitBaselineScope,
  parsePorcelainStatus,
  scanChangedContent,
  writeGitBaselineScopeReport,
} from "./run-git-baseline-scope-audit.mjs";

const parsed = parsePorcelainStatus(
  " M src/App.jsx\0?? server/newService.mjs\0R  docs/new.md\0docs/old.md\0",
);
assert.deepEqual(parsed, [
  { status: " M", path: "src/App.jsx" },
  { status: "??", path: "server/newService.mjs" },
  { status: "R ", path: "docs/new.md", originalPath: "docs/old.md" },
]);

const classified = buildGitBaselineScopeReport({
  entries: [
    { status: " M", path: "PROJECT_STATUS.md" },
    { status: " M", path: ".gitignore" },
    { status: "??", path: "design.md" },
    { status: " M", path: "package.json" },
    { status: " M", path: "package-lock.json" },
    { status: " M", path: "vite.config.mjs" },
    { status: "??", path: "playwright.review.config.mjs" },
    { status: "??", path: "server/services/example.mjs" },
    { status: " M", path: "src/App.jsx" },
    { status: " M", path: "scripts/check-api-skeleton.mjs" },
    { status: "??", path: "e2e/v1-d49-layout.spec.mjs" },
    { status: "??", path: "review-e2e/complete-review-receipt.spec.mjs" },
    { status: " M", path: "deploy/production/erp-service.env.example" },
  ],
  remoteCount: 0,
  branch: "codex/audit",
  head: "1234567890ab",
});
assert.equal(classified.scopeSafe, true);
assert.equal(classified.releaseReady, false);
assert.equal(classified.summary.changedFileCount, 13);
assert.equal(classified.summary.classifiedCount, 13);
assert.equal(classified.summary.unclassifiedCount, 0);
assert.deepEqual(classified.blockers, ["controlled_git_remote_missing", "worktree_not_clean"]);
assert.equal(classified.stagingReview.readOnly, true);
assert.equal(classified.stagingReview.readyToStartReview, true);
assert.deepEqual(
  classified.stagingReview.batches.map((batch) => batch.key),
  ["runtime_domain", "frontend_ui", "verification", "engineering_tooling", "governance_docs"],
);
assert.equal(classified.stagingReview.batches.find((batch) => batch.key === "verification")?.count, 3);
assert.equal(classified.groups.find((group) => group.key === "verification")?.count, 3);
assert.equal(classified.groups.find((group) => group.key === "engineering_tooling")?.count, 6);
assert.equal(
  classified.groups
    .filter((group) => !["verification", "engineering_tooling"].includes(group.key))
    .every((group) => group.count === (group.key === "governance_docs" ? 2 : 1)),
  true,
);

const payrollEvidencePreview = buildGitBaselineScopeReport({
  entries: [
    { status: " M", path: "index.html" },
    { status: "??", path: "qa/payroll-adjustment-evidence-preview.html" },
    { status: "??", path: "qa/payroll-position-rate-preview.html" },
  ],
  remoteCount: 1,
});
assert.equal(payrollEvidencePreview.scopeSafe, true);
assert.equal(payrollEvidencePreview.groups.find((group) => group.key === "frontend_ui")?.count, 1);
assert.equal(payrollEvidencePreview.groups.find((group) => group.key === "verification")?.count, 2);

const cleanReady = buildGitBaselineScopeReport({
  entries: [],
  remoteCount: 1,
  branch: "main",
  head: "abcdef123456",
});
assert.equal(cleanReady.scopeSafe, true);
assert.equal(cleanReady.releaseReady, true);
assert.deepEqual(cleanReady.blockers, []);

const contentRoot = mkdtempSync(join(tmpdir(), "erp-git-scope-content-"));
try {
  mkdirSync(join(contentRoot, "server"), { recursive: true });
  writeFileSync(
    join(contentRoot, "server", "unsafe.mjs"),
    [
      "const databaseUrl = 'postgres://real_user:real_password@db.internal:5432/erp';",
      ["-----BEGIN", "PRIVATE KEY-----"].join(" "),
    ].join("\n"),
  );
  const contentFindings = scanChangedContent({
    rootDir: contentRoot,
    entries: [{ status: "??", path: "server/unsafe.mjs" }],
  });
  assert.deepEqual(contentFindings.map((item) => item.rule), [
    "database_url_with_password",
    "private_key",
  ]);
  assert.doesNotMatch(JSON.stringify(contentFindings), /real_password|BEGIN PRIVATE KEY/);
} finally {
  rmSync(contentRoot, { recursive: true, force: true });
}

const blocked = buildGitBaselineScopeReport({
  entries: [
    { status: "??", path: ".env.production" },
    { status: "??", path: "screenshots/private.png" },
    { status: "??", path: "unknown.bin" },
    { status: "??", path: "unknown.bin" },
  ],
  remoteCount: 1,
  contentFindings: [{ path: "server/config.mjs", rule: "private_key", line: 4, matchedValue: "must-not-leak" }],
});
assert.equal(blocked.scopeSafe, false);
assert.deepEqual(blocked.sensitivePaths, [".env.production"]);
assert.deepEqual(blocked.forbiddenPaths, ["screenshots/private.png"]);
assert.deepEqual(blocked.unclassifiedPaths, [".env.production", "screenshots/private.png", "unknown.bin", "unknown.bin"]);
assert.deepEqual(blocked.duplicatePaths, ["unknown.bin"]);
assert.equal(blocked.summary.sensitiveContentFindingCount, 1);
assert.equal(blocked.stagingReview.readyToStartReview, false);
assert.deepEqual(blocked.stagingReview.blockers, ["scope_audit_not_safe"]);
assert.deepEqual(blocked.sensitiveContentFindings, [
  { path: "server/config.mjs", rule: "private_key", line: 4 },
]);
assert.doesNotMatch(JSON.stringify(blocked), /must-not-leak/);
assert.equal(blocked.blockers.includes("sensitive_content"), true);

const auditTooling = buildGitBaselineScopeReport({ entries: [{ status: " M", path: "eslint.config.mjs" }, { status: " M", path: "README.md" }, { status: " M", path: "DESIGN.md" }], remoteCount: 1 });
assert.equal(auditTooling.scopeSafe, true);
assert.equal(auditTooling.groups.find((group) => group.key === "engineering_tooling")?.count, 1);
assert.equal(auditTooling.groups.find((group) => group.key === "governance_docs")?.count, 2);

const live = inspectGitBaselineScope();
assert.equal(live.scopeSafe, true, JSON.stringify({ blockers: live.blockers, unclassified: live.unclassifiedPaths }));
assert.equal(live.summary.changedFileCount, live.summary.classifiedCount);
assert.equal(live.summary.remoteCount > 0, true);
assert.equal(live.blockers.includes("controlled_git_remote_missing"), false);
assert.equal(live.summary.sensitiveContentFindingCount, 0);
assert.equal(live.releaseReady, live.summary.changedFileCount === 0);
assert.equal(live.safeguards.readOnly, true);
assert.equal(live.safeguards.gitAddExecuted, false);
assert.equal(live.safeguards.matchedContentIncluded, false);
assert.equal(live.stagingReview.readOnly, true);
assert.equal(live.stagingReview.readyToStartReview, live.summary.stagedCount === 0);
assert.equal(live.stagingReview.batches.length, live.groups.filter((group) => group.count > 0).length);

const latestOutputPath = writeGitBaselineScopeReport(live);
assert.equal(latestOutputPath.endsWith(DEFAULT_OUTPUT_PATH), true);
assert.deepEqual(JSON.parse(readFileSync(latestOutputPath, "utf8")), live);

console.log(
  `Git baseline scope audit passed: ${live.summary.changedFileCount} changed files are classified across ${live.summary.groupCount} ownership groups; release readiness is ${live.releaseReady ? "ready" : "blocked"}.`,
);
