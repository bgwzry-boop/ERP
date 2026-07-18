import assert from "node:assert/strict";
import {
  buildProductionEnvFixChecklist,
  formatProductionEnvFixChecklistCsv,
  formatProductionEnvFixChecklistMarkdown,
} from "./helpers/v1GoLiveHandoffProductionEnvFixChecklist.mjs";

const productionEnvFixChecklist = buildProductionEnvFixChecklist({
  status: "blocked",
  ready: false,
  checkedAt: "2026-07-16T10:00:00.000Z",
  envFileCount: 1,
  summary: { label: "0/5 生产环境阶段通过" },
  fixChecklist: [
    {
      key: "v1-persistence-profile",
      label: "PostgreSQL|持久化",
      configuredVariableCount: "1",
      totalVariableCount: 3,
      missingVariables: ["ERP_V1_DATABASE_URL"],
      placeholderVariableCount: 1,
      placeholderVariables: ["ERP_V1_DATABASE_URL"],
      nextAction: "填写生产库|连接串",
    },
    {
      key: "local-v1-acceptance-bypass-env",
      label: "本地例外",
      blocking: false,
      configuredVariableCount: 1,
      totalVariableCount: 1,
    },
  ],
});

assert.equal(productionEnvFixChecklist.included, true);
assert.equal(productionEnvFixChecklist.fixItemCount, 2);
assert.equal(productionEnvFixChecklist.blockingItemCount, 1);
assert.equal(productionEnvFixChecklist.warningItemCount, 1);
assert.equal(productionEnvFixChecklist.placeholderVariableCount, 1);
assert.match(productionEnvFixChecklist.items[0].valueGuidance.join("\n"), /postgres/);
assert.match(productionEnvFixChecklist.items[0].verificationSteps.join("\n"), /production-env-preflight/);

const report = {
  generatedAt: "2026-07-16T10:01:00.000Z",
  releaseCandidate: { generatedAt: "2026-07-16T10:00:00.000Z" },
  productionEnvFixChecklist,
};
const markdown = formatProductionEnvFixChecklistMarkdown(report);
const csv = formatProductionEnvFixChecklistCsv(productionEnvFixChecklist.items);

assert.match(markdown, /PostgreSQL\\\|持久化/);
assert.match(markdown, /填写生产库\\\|连接串/);
assert.match(markdown, /不能替代真实服务联通/);
assert.match(csv, /"key","label","ownerRole"/);
assert.match(csv, /"PostgreSQL\|持久化"/);
assert.match(csv, /"填写生产库\|连接串"/);

console.log("V1 go-live handoff production env fix-checklist checks passed: normalization, defaults, Markdown, and CSV are stable.");
