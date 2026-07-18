import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { loadSyntheticOfficeSeed } from "../server/seeds/syntheticOfficeSeed.mjs";
import { realSampleCoverageKeys } from "../server/seeds/officeSeedLoader.mjs";
import { precheckRealSampleOfficeSeed } from "../server/seeds/realSampleOfficeSeedIntake.mjs";

const root = mkdtempSync(join(tmpdir(), "erp-real-sample-intake-"));
const sampleDir = join(root, ".erp-local-storage", "real-samples");
const templateFile = join(sampleDir, "template.json");
const validFile = join(sampleDir, "valid.json");
const templateScript = new URL("./run-real-sample-seed-template.mjs", import.meta.url);
const precheckScript = new URL("./run-real-sample-seed-precheck.mjs", import.meta.url);

try {
  mkdirSync(sampleDir, { recursive: true, mode: 0o700 });
  chmodSync(sampleDir, 0o700);
  const generated = run(templateScript, ["--confirm-template-create", "--output-file", templateFile, "--json"]);
  assert.equal(generated.status, 0, generated.stderr);
  const templateReport = JSON.parse(generated.stdout);
  assert.equal(templateReport.status, "written");
  assert.equal(templateReport.summary.templateContainsBusinessData, false);
  assert.equal(statSync(templateFile).mode & 0o077, 0);
  const template = JSON.parse(readFileSync(templateFile, "utf8"));
  assert.deepEqual(template.cases, []);
  assert.deepEqual(template.workspace.customers, []);
  assert.doesNotMatch(JSON.stringify(template), /张三服饰|138\d{8}/);

  const noOverwrite = run(templateScript, ["--confirm-template-create", "--output-file", templateFile, "--json"]);
  assert.equal(noOverwrite.status, 1);
  assert.equal(JSON.parse(noOverwrite.stdout).error.code, "REAL_SAMPLE_TEMPLATE_EXISTS");
  assert.doesNotMatch(noOverwrite.stdout, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const templatePrecheck = run(precheckScript, ["--file", templateFile, "--allow-blocked-exit-zero", "--json"]);
  assert.equal(templatePrecheck.status, 0, templatePrecheck.stderr);
  assert.equal(JSON.parse(templatePrecheck.stdout).error.code, "ERP_REAL_SAMPLE_SEED_CASE_COUNT_INVALID");

  const validPayload = createValidPayload();
  writePrivateJson(validFile, validPayload);
  const readyPrecheck = run(precheckScript, ["--file", validFile, "--json"]);
  assert.equal(readyPrecheck.status, 0, readyPrecheck.stderr);
  const readyReport = JSON.parse(readyPrecheck.stdout);
  assert.equal(readyReport.ready, true);
  assert.equal(readyReport.summary.caseCount, 20);
  assert.equal(readyReport.summary.sourceMessageCount, 20);
  assert.deepEqual(readyReport.summary.coverageKeys, realSampleCoverageKeys);
  assert.equal(readyReport.safeguards.sourceMessagesIncluded, false);
  assert.doesNotMatch(readyPrecheck.stdout, /匿名客户一|匿名样例消息/);

  const invalidArgs = run(precheckScript, ["--unknown", "--json"]);
  assert.equal(invalidArgs.status, 1);
  assert.equal(JSON.parse(invalidArgs.stdout).error.code, "REAL_SAMPLE_SEED_PRECHECK_ARGUMENT_INVALID");
  assert.doesNotMatch(invalidArgs.stderr, /Error:|at file:/);

  const identityPayload = createValidPayload();
  identityPayload.cases[0].messages[0].text = "联系 13812345678";
  writePrivateJson(validFile, identityPayload);
  const blocked = precheckRealSampleOfficeSeed({ file: validFile, projectRoot: root });
  assert.equal(blocked.ready, false);
  assert.equal(blocked.error.code, "ERP_REAL_SAMPLE_SEED_IDENTIFIER_DETECTED");
  assert.doesNotMatch(JSON.stringify(blocked), /13812345678|匿名样例消息/);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(
  "Real-sample seed intake checks passed: private empty template, no-overwrite, redacted blocked/ready precheck, coverage, and identifier safety are covered.",
);

function run(script, args) {
  return spawnSync(process.execPath, [script.pathname, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function createValidPayload() {
  const workspace = sanitizeWorkspace(loadSyntheticOfficeSeed());
  workspace.scenario = { ...workspace.scenario, id: "real-sample-intake-check", label: "匿名样例验证" };
  return {
    schemaVersion: "erp-real-sample-office-seed-v1",
    sourceKind: "confirmed_anonymized_real_sample",
    datasetId: "real-sample-intake-check-001",
    cases: Array.from({ length: 20 }, (_, index) => ({
      id: `CASE-${String(index + 1).padStart(3, "0")}`,
      coverage: [realSampleCoverageKeys[index % realSampleCoverageKeys.length]],
      messages: [
        {
          id: `MSG-${String(index + 1).padStart(3, "0")}`,
          senderRole: index % 2 === 0 ? "customer" : "office",
          sentAt: `2026-07-12 ${String(9 + (index % 8)).padStart(2, "0")}:00`,
          text: `匿名样例消息 ${index + 1}`,
        },
      ],
    })),
    workspace,
  };
}

function sanitizeWorkspace(workspace) {
  return JSON.parse(
    JSON.stringify(workspace)
      .replaceAll("张三服饰", "匿名客户一")
      .replaceAll("美的空调", "定制袋")
      .replaceAll("白鲸自营店", "匿名客户二")
      .replaceAll("张三", "联系人甲"),
  );
}

function writePrivateJson(file, value) {
  writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
  chmodSync(file, 0o600);
}
