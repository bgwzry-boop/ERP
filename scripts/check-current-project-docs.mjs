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
  assert.match(source, currentVersionPattern, `${name} should expose the current version`);
  assert.match(source, /docs\/history\/status\//, `${name} should link its history archive`);
}
for (const source of [currentDocs.chineseStatus, currentDocs.projectStatus, currentDocs.decisions]) {
  assert.match(source, /through-2026-08-12\.md/, "compressed current docs should link the full 2026-08-12 snapshot");
}

assert.ok(lineCount(currentDocs.chineseStatus) <= 110, "Chinese current status should stay concise");
assert.ok(lineCount(currentDocs.projectStatus) <= 100, "Project status should stay concise");
assert.ok(lineCount(currentDocs.roadmap) <= 90, "Roadmap should stay concise");
assert.ok(lineCount(currentDocs.decisions) <= 130, "Active decisions should stay concise");

for (const source of [currentDocs.chineseStatus, currentDocs.projectStatus]) {
  for (const truth of ["97-98%", "80-83%", "0/4", "1/5", "5/11", "0/40", "0/6", "59"]) {
    assert.equal(source.includes(truth), true, `current status should include ${truth}`);
  }
}
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

assert.match(entrySource, new RegExp(`当前 ${currentVersionPattern.source} 可执行整改方案`));
assert.match(entrySource, /docs\/history\/status/);
assert.match(rectificationPlan, new RegExp(`当前版本：${currentVersionPattern.source}`));
assert.match(rectificationPlan, /发布门禁.*`0\/4`/);
assert.match(rectificationPlan, /现场证据.*`0\/34`/);
assert.match(rectificationPlan, /负责人签字.*`0\/6`/);

console.log(`Current project docs check passed: concise current files and complete V8.80 archives are consistent (${Object.values(currentDocs).reduce((sum, source) => sum + lineCount(source), 0)} current lines).`);
