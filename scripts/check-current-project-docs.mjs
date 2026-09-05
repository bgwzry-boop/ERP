import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function lineCount(source) {
  return source.length === 0 ? 0 : source.replace(/\n$/, "").split("\n").length;
}

const currentDocs = {
  chineseStatus: read("01_当前状态与下一步.md"),
  projectStatus: read("PROJECT_STATUS.md"),
  roadmap: read("ROADMAP.md"),
  decisions: read("DECISIONS.md"),
};
const archives = {
  chineseStatus: read("docs/history/status/01_当前状态与下一步-through-v8.80.md"),
  projectStatus: read("docs/history/status/PROJECT_STATUS-through-v8.80.md"),
  roadmap: read("docs/history/status/ROADMAP-through-v8.80.md"),
  decisions: read("docs/history/status/DECISIONS-through-v8.80.md"),
};
const currentSnapshots = {
  chineseStatus: read("docs/history/status/01_当前状态与下一步-through-2026-08-12.md"),
  projectStatus: read("docs/history/status/PROJECT_STATUS-through-2026-08-12.md"),
  decisions: read("docs/history/status/DECISIONS-through-2026-08-12.md"),
};
const entrySource = read("00_项目入口.md");
const rectificationPlan = read("docs/development/rectification-plan-2026-07-12.zh-CN.md");
const currentVersion = "V8.306";
const currentVersionPattern = new RegExp(currentVersion.replace(".", "\\."));

for (const [name, source] of Object.entries(currentDocs)) {
  assert.match(source, /docs\/history\//, `${name} should link its dated history`);
}
assert.match(currentDocs.chineseStatus, /[a-f0-9]{40}/, "current release facts require immutable commits");
assert.match(currentDocs.chineseStatus, /codex\/staging-current/);
assert.match(currentDocs.chineseStatus, /未部署/);
assert.match(currentDocs.chineseStatus, /本轮没有部署/);
assert.match(currentDocs.projectStatus, /01_当前状态与下一步\.md/, "English entry must reuse the canonical status");
for (const source of [currentDocs.chineseStatus, currentDocs.projectStatus]) {
  assert.doesNotMatch(source, /97-98%|80-83%/, "historical estimates must not masquerade as current evidence");
}
const ruleArchive = read("docs/history/audit-2026-09-05/AGENTS-before-reorganization.md");
const originalRules = ruleArchive.slice(ruleArchive.indexOf("# Prototype Instructions"));
const migration = JSON.parse(read("docs/history/audit-2026-09-05/rule-migration-index.json"));
assert.equal(createHash("sha256").update(originalRules).digest("hex"), migration.sourceSha256, "original instructions must remain intact");
const ruleBody = originalRules.split("Prototype-specific design decisions:")[1].split("Keep project-management context current:")[0];
const ruleBlocks = ruleBody.trim().split(/\n(?=- )/u).map((block) => block.trim());
assert.equal(ruleBlocks.length, migration.ruleCount);
const routedRules = readdirSync(new URL("../docs/rules/", import.meta.url)).filter((name) => name.endsWith(".md")).map((name) => read(`docs/rules/${name}`));
routedRules.push(read("docs/history/audit-2026-09-05/superseded-decisions.md"));
for (const block of ruleBlocks) assert.equal(routedRules.filter((source) => source.includes(block)).length, 1, "each original rule must be retained exactly once in routed rules or explicit history");
assert.ok(Buffer.byteLength(read("AGENTS.md")) < 16000, "global instructions should stay compact and route domain details");
assert.match(read("README.md"), /npm run review:dev/);
assert.match(read("README.md"), /npm run review:check/);
assert.match(read("design.md"), /工作台 \/ 订单管理 \/ 原料管理 \/ 生产交付 \/ 库存管理 \/ 财务管理 \/ 基础资料 \/ 系统管理/);

assert.ok(lineCount(currentDocs.chineseStatus) <= 110, "Chinese current status should stay concise");
assert.ok(lineCount(currentDocs.projectStatus) <= 100, "Project status should stay concise");
assert.ok(lineCount(currentDocs.roadmap) <= 90, "Roadmap should stay concise");
assert.ok(lineCount(currentDocs.decisions) <= 130, "Active decisions should stay concise");

for (const phase of ["D49", "D50", "D51", "D52", "D53"]) {
  assert.equal(currentDocs.roadmap.includes(phase), true, `roadmap should include ${phase}`);
}
assert.match(currentDocs.decisions, /D49 -> D50 -> D51 -> D52 -> D53/);
assert.match(currentDocs.decisions, /Status documents keep only current truth and links/);

assert.ok(lineCount(archives.chineseStatus) >= 1_600, "Chinese status archive should preserve the prior log");
assert.ok(lineCount(archives.projectStatus) >= 1_600, "Project status archive should preserve the prior log");
assert.ok(lineCount(archives.roadmap) >= 570, "Roadmap archive should preserve the prior log");
assert.ok(lineCount(archives.decisions) >= 2_490, "Decision archive should preserve the prior log");
for (const source of Object.values(archives)) {
  assert.match(source, /V8\.80/, "each archive should include the V8.80 boundary");
}
assert.ok(lineCount(currentSnapshots.chineseStatus) >= 120, "2026-08-12 Chinese status snapshot should preserve the prior current file");
assert.ok(lineCount(currentSnapshots.projectStatus) >= 120, "2026-08-12 project-status snapshot should preserve the prior current file");
assert.ok(lineCount(currentSnapshots.decisions) >= 180, "2026-08-12 decision snapshot should preserve the prior current file");
for (const source of Object.values(currentSnapshots)) {
  assert.match(source, currentVersionPattern, "each 2026-08-12 snapshot should preserve the current-version boundary");
}

assert.match(entrySource, /01_当前状态与下一步\.md/);
assert.match(entrySource, /历史执行方案/);
assert.match(entrySource, /docs\/history\/status/);
assert.match(rectificationPlan, new RegExp(`当前版本：${currentVersionPattern.source}`));
assert.match(rectificationPlan, /发布门禁.*`0\/4`/);
assert.match(rectificationPlan, /现场证据.*`0\/34`/);
assert.match(rectificationPlan, /负责人签字.*`0\/6`/);

console.log(`Current project docs check passed: concise current files and complete V8.80 archives are consistent (${Object.values(currentDocs).reduce((sum, source) => sum + lineCount(source), 0)} current lines).`);
