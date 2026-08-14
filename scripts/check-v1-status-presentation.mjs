import assert from "node:assert/strict";
import {
  buildProductionEnvVariableCheckOverlayForPage,
  buildProductionEnvVariableChecksForPage,
  buildV1StatusSummaryForPage,
  formatV1StatusSnapshotTime,
  getProductionEnvTemplateSectionLabel,
  getProductionEnvVariableCheckCountLabelForPage,
  getProductionEnvVariableCheckOverlayItemForPage,
  getV1PhaseTaskTone,
  normalizeV1PhaseGroupForPage,
  normalizeV1PhaseTaskForPage,
  v1ModuleCompletionRows,
  v1StatusSnapshotMaxAgeMs,
  v1UnblockPlan,
} from "../src/features/v1-status/v1StatusPresentation.js";

assert.equal(v1StatusSnapshotMaxAgeMs, 15 * 60 * 1000);
assert.equal(formatV1StatusSnapshotTime("invalid"), "--");
assert.equal(v1ModuleCompletionRows.length, 16);
assert.equal(v1UnblockPlan.phases.length, 6);

const fallbackSummary = buildV1StatusSummaryForPage(null);
assert.equal(fallbackSummary.statusLabel, "V1 仍未完成");
assert.deepEqual(fallbackSummary.metrics.slice(3).map((item) => item[1]), ["0/4", "0/40", "0/6"]);

const apiSummary = buildV1StatusSummaryForPage({
  statusLabel: "后端阻塞",
  conclusion: "真实状态",
  generatedAt: "07-11 16:00",
  metrics: [["门禁", "1/4", "warning"]],
  gates: [["发布", "1/4", "blocked", "仍阻塞"]],
  blockers: ["真实阻塞"],
});
assert.equal(apiSummary.statusLabel, "后端阻塞");
assert.equal(apiSummary.metrics[0][1], "1/4");
assert.deepEqual(apiSummary.blockers, ["真实阻塞"]);

assert.deepEqual(normalizeV1PhaseTaskForPage(["发布门禁", "环境", "生产 profile", "技术/管理", "补配置"], 2), {
  key: "生产 profile-2",
  type: "发布门禁",
  group: "环境",
  title: "生产 profile",
  primaryRole: "技术/管理",
  roleLabel: "技术/管理",
  status: "pending",
  statusLabel: "待处理",
  action: "补配置",
});
assert.equal(normalizeV1PhaseGroupForPage(["生产环境", 3], 1).countLabel, "3 项");
assert.equal(getV1PhaseTaskTone({ type: "发布门禁" }), "danger");
assert.equal(getV1PhaseTaskTone({ type: "负责人签字" }), "warning");
assert.equal(getV1PhaseTaskTone({ type: "现场证据" }), "blue");

assert.equal(
  getProductionEnvTemplateSectionLabel("# BLOCKING | production | 系统打印 command_bridge 环境变量"),
  "系统打印 command_bridge 环境变量",
);
assert.equal(getProductionEnvTemplateSectionLabel("ERP_RUNTIME_MODE=production"), "");

const baseChecks = [
  { key: "runtime", label: "运行模式" },
  { key: "database", label: "数据库" },
];
const overlay = buildProductionEnvVariableCheckOverlayForPage(baseChecks, [
  {
    sourceLabel: "安全 env 文件应用预检",
    result: {
      checks: [
        { key: "runtime", label: "运行模式", configuredVariableCount: 1, totalVariableCount: 1 },
        { key: "runtime", label: "重复项不应重复", configuredVariableCount: 0, totalVariableCount: 1 },
      ],
    },
  },
  {
    sourceLabel: "当前 env 预检",
    result: { checks: [{ key: "database", label: "数据库" }] },
  },
]);
assert.equal(overlay.sourceLabel, "安全 env 文件应用预检");
assert.equal(overlay.matchedCount, 1);
assert.equal(getProductionEnvVariableCheckOverlayItemForPage(overlay, { key: "runtime" })?.label, "运行模式");
assert.equal(getProductionEnvVariableCheckOverlayItemForPage(overlay, { key: "database" }), null);
assert.equal(getProductionEnvVariableCheckCountLabelForPage({ configuredVariableCount: 2, totalVariableCount: 4 }), "2/4");

assert.deepEqual(
  buildProductionEnvVariableChecksForPage({
    requiredVariables: ["ERP_RUNTIME_MODE", "ERP_V1_DATABASE_URL", "Either A or B"],
    missingVariables: ["ERP_V1_DATABASE_URL"],
    placeholderVariables: ["ERP_RUNTIME_MODE"],
  }),
  [
    { name: "ERP_RUNTIME_MODE", status: "placeholder", statusLabel: "占位" },
    { name: "ERP_V1_DATABASE_URL", status: "missing", statusLabel: "待补" },
    { name: "Either A or B", status: "rule", statusLabel: "规则" },
  ],
);

console.log("V1 status presentation checks passed: fallback truth, phase projection, and env-variable overlays are isolated.");
