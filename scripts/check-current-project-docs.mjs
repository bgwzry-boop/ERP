import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
const entrySource = read("00_项目入口.md");
const rectificationPlan = read("docs/development/rectification-plan-2026-07-12.zh-CN.md");
const currentVersion = "V8.306";
const currentVersionPattern = new RegExp(currentVersion.replace(".", "\\."));
const archiveCommit = "84d88b4838469e31b47e37bb90fda23036149404";
const archiveUrlPrefix = `https://github.com/bgwzry-boop/ERP/blob/${archiveCommit}/docs/history/status/`;

for (const [name, source] of Object.entries(currentDocs)) {
  assert.match(source, currentVersionPattern, `${name} should expose the current version`);
  assert.ok(source.includes(archiveUrlPrefix), `${name} should link its fixed historical commit`);
}
for (const source of [currentDocs.chineseStatus, currentDocs.projectStatus, currentDocs.decisions]) {
  assert.match(source, /through-2026-08-12\.md/, "compressed current docs should link the full 2026-08-12 snapshot");
}

assert.ok(lineCount(currentDocs.chineseStatus) <= 110, "Chinese current status should stay concise");
assert.ok(lineCount(currentDocs.projectStatus) <= 100, "Project status should stay concise");
assert.ok(lineCount(currentDocs.roadmap) <= 90, "Roadmap should stay concise");
assert.ok(lineCount(currentDocs.decisions) <= 130, "Active decisions should stay concise");

for (const source of [currentDocs.chineseStatus, currentDocs.projectStatus]) {
  assert.match(source, /(?:更新：|Updated:) \d{4}-\d{2}-\d{2}/, "current status must date its observations without freezing an obsolete date");
  const currentRelease = source.split(/## (?:当前唯一版本|Current Verified Release)/)[1]?.split("\n## ")[0] ?? "";
  assert.match(currentRelease, /codex\/staging-current/, "current status must identify the one canonical branch");
  assert.match(currentRelease, /npm run release:check/, "current identity must be read live rather than maintained as a stale handwritten SHA");
  assert.match(source, /`[a-f0-9]{40}`/, "historical release evidence retains full commits");
  assert.match(source, /`[a-f0-9]{64}`/, "historical release evidence retains full lock digests");
  assert.match(currentRelease, /\/api\/health/, "current release must include API identity evidence");
  assert.match(currentRelease, /bagwin-complete-review-4174/, "local review must carry its application identity");
  assert.doesNotMatch(currentRelease, /codex\/(?:p0-office-hardening|full-baseline-integration-20261013)/, "historical task branches must not return as the current version");
  assert.match(source, /controlled-release-governance\.zh-CN\.md/, "all current status documents must link the executable release contract");
  assert.match(source, /历史基线|Historical Sources Only/, "historical baselines must be explicitly separated from current identity");
  assert.match(source, /本地修改稿 · 未部署/, "local preview must not be represented as a release");
  assert.match(source, /标签机未准备|label printer is not ready/, "printer readiness must retain the owner's actual answer");
}
for (const phase of ["D49", "D50", "D51", "D52", "D53"]) {
  assert.equal(currentDocs.roadmap.includes(phase), true, `roadmap should include ${phase}`);
}
assert.match(currentDocs.decisions, /D49 -> D50 -> D51 -> D52 -> D53/);
assert.match(currentDocs.decisions, /Status documents keep only current truth and links/);

assert.match(entrySource, new RegExp(`当前 ${currentVersionPattern.source} 可执行整改方案`));
assert.match(entrySource, /github\.com\/bgwzry-boop\/ERP\/blob\/84d88b4/);
assert.match(rectificationPlan, new RegExp(`当前版本：${currentVersionPattern.source}`));
assert.match(rectificationPlan, /发布门禁.*`0\/4`/);
assert.match(rectificationPlan, /现场证据.*`0\/34`/);
assert.match(rectificationPlan, /负责人签字.*`0\/6`/);

console.log(`Current project docs check passed: concise current files link to the fixed historical commit (${Object.values(currentDocs).reduce((sum, source) => sum + lineCount(source), 0)} current lines).`);
