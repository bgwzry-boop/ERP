import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CHECK_GROUPS, listCheckGroups, resolveCheckGroup, resolveCheckGroupFrom } from "./check-group-manifest.mjs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const packageScripts = packageJson.scripts ?? {};
const pretestScripts = resolveCheckGroup("pretest");
const coreScripts = resolveCheckGroup("core");
const testScripts = resolveCheckGroup("test");
const batchAScripts = resolveCheckGroup("batch-a");
const batchBScripts = resolveCheckGroup("batch-b");

assert.deepEqual(listCheckGroups(), ["pretest", "test", "core", "batch-a", "batch-b"]);
assert.equal(pretestScripts.length, 6);
assert.equal(coreScripts.length, 118);
assert.equal(testScripts.length, 145);
assert.equal(batchAScripts.length, 7);
assert.equal(batchBScripts.length, 18);
assert.equal(pretestScripts[0], "order-parser:check");
assert.equal(pretestScripts.at(-1), "inventory-intent-api:check");
assert.equal(coreScripts[0], "check-group-runner:check");
assert.equal(coreScripts.at(-1), "v1-production-release-gate:check");
assert.equal(testScripts[0], "lint");
assert.equal(testScripts.at(-1), "v1-production-release-gate:check");
assert.equal(batchAScripts[0], "runtime-config:check");
assert.equal(batchAScripts.at(-1), "v1-persistence-profile:check");
assert.equal(batchBScripts[0], "idempotency:check");
assert.equal(batchBScripts.at(-1), "db:postgres-live:check");
assert.equal(new Set(pretestScripts).size, pretestScripts.length);
assert.equal(new Set(coreScripts).size, coreScripts.length);
assert.equal(new Set(testScripts).size, testScripts.length);
assert.equal(new Set(batchAScripts).size, batchAScripts.length);
assert.equal(new Set(batchBScripts).size, batchBScripts.length);

for (const scriptName of new Set([...pretestScripts, ...testScripts, ...batchAScripts, ...batchBScripts])) {
  assert.equal(typeof packageScripts[scriptName], "string", `group entry should reference package script ${scriptName}`);
}
assert.equal(packageScripts.pretest, "node scripts/run-check-group.mjs pretest");
assert.equal(packageScripts.test, "node scripts/run-check-group.mjs test");
assert.equal(packageScripts["check:core"], "node scripts/run-check-group.mjs core");
assert.equal(packageScripts["batch-a:check"], "node scripts/run-check-group.mjs batch-a");
assert.equal(packageScripts["batch-b:check"], "node scripts/run-check-group.mjs batch-b");
assert.deepEqual(CHECK_GROUPS.test.at(-1), "@core");
assert.throws(
  () => resolveCheckGroupFrom({ first: ["@second"], second: ["@first"] }, "first"),
  /Cyclic check group reference: first -> second -> first/,
);

const runnerPath = fileURLToPath(new URL("./run-check-group.mjs", import.meta.url));
const dryRun = spawnSync(process.execPath, [runnerPath, "test", "--dry-run", "--json"], { encoding: "utf8" });
assert.equal(dryRun.status, 0, dryRun.stderr);
const dryRunSummary = JSON.parse(dryRun.stdout);
assert.equal(dryRunSummary.ok, true);
assert.equal(dryRunSummary.count, 145);
assert.deepEqual(dryRunSummary.scripts, testScripts);

const unknown = spawnSync(process.execPath, [runnerPath, "missing-group"], { encoding: "utf8" });
assert.equal(unknown.status, 2);
assert.match(unknown.stderr, /Unknown check group: missing-group/);
assert.match(unknown.stderr, /Available groups: pretest, test, core, batch-a, batch-b/);

console.log("Check-group runner passed: lifecycle coverage, ordering, nesting, cycle rejection, dry-run output, and unknown-group failure are locked.");
