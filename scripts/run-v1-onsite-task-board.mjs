#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { validateV1FieldEvidenceManifest } from "./v1FieldEvidenceManifest.mjs";

const defaultOutputDir = join(".erp-local-storage", "v1-onsite-task-board");
const defaultFieldEvidenceManifestPath = join("docs", "development", "v1-field-evidence-manifest.template.json");
const defaultReleaseCandidateJsonPath = join(".erp-local-storage", "v1-release-candidate", "latest.json");
const completionItemStatuses = new Set(["passed", "accepted"]);
const completionSignoffStatuses = new Set(["signed", "accepted"]);
const roleOrder = ["技术/管理", "办公室", "仓库/出库", "车间", "司机", "财务"];
const roleFileSlugs = new Map([
  ["技术/管理", "technical-management"],
  ["办公室", "office"],
  ["仓库/出库", "warehouse-fulfillment"],
  ["车间", "workshop"],
  ["司机", "driver"],
  ["财务", "finance"],
]);

try {
  const options = parseArgs(process.argv.slice(2));
  const outputDir = resolve(options.outputDir || process.env.ERP_V1_ONSITE_TASK_BOARD_OUTPUT_DIR || defaultOutputDir);
  const manifestPath = resolve(
    options.fieldEvidenceManifest ||
      process.env.ERP_V1_FIELD_EVIDENCE_MANIFEST ||
      defaultFieldEvidenceManifestPath,
  );
  const releaseCandidateJsonPath = resolve(
    options.releaseCandidateJson ||
      process.env.ERP_V1_ONSITE_TASK_BOARD_RELEASE_CANDIDATE_JSON ||
      defaultReleaseCandidateJsonPath,
  );
  const manifest = readJson(manifestPath, "V1 field evidence manifest");
  const releaseCandidate = readReleaseCandidate({ path: releaseCandidateJsonPath });
  const report = buildOnsiteTaskBoard({
    manifest,
    manifestPath,
    releaseCandidate,
    releaseCandidateJsonPath,
  });
  const files = writeTaskBoardFiles({ outputDir, report });
  const result = buildCommandResult({ report, files });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatCommandResult(result));
  }
} catch (error) {
  const message = error?.message || String(error);
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ status: "error", ready: false, error: { message } }, null, 2)}\n`);
  } else {
    process.stderr.write(`V1 onsite task board failed: ${message}\n`);
  }
  process.exit(1);
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--field-evidence-manifest") {
      options.fieldEvidenceManifest = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--release-candidate-json") {
      options.releaseCandidateJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function helpText() {
  return [
    "Usage: node scripts/run-v1-onsite-task-board.mjs [options]",
    "",
    "Options:",
    "  --output-dir <dir>                 Output directory, default .erp-local-storage/v1-onsite-task-board",
    "  --field-evidence-manifest <path>   Field-evidence manifest path, default checked-in template or ERP_V1_FIELD_EVIDENCE_MANIFEST",
    "  --release-candidate-json <path>    Release candidate JSON, default .erp-local-storage/v1-release-candidate/latest.json",
    "  --json                             Print a machine-readable summary",
  ].join("\n");
}

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${displayInputPath(path)}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${label} is not readable JSON: ${displayInputPath(path)}`);
  }
}

function readReleaseCandidate({ path }) {
  const releaseCandidate = readJson(path, "V1 release candidate JSON");
  if (releaseCandidate?.scope !== "v1_release_candidate_check") {
    throw new Error(`V1 release candidate JSON has an unexpected shape: ${displayInputPath(path)}`);
  }
  return releaseCandidate;
}

function buildOnsiteTaskBoard({ manifest, manifestPath, releaseCandidate, releaseCandidateJsonPath }) {
  const fieldEvidence = validateV1FieldEvidenceManifest(manifest);
  const evidenceTasks = buildEvidenceTasks(manifest);
  const signoffTasks = buildSignoffTasks(manifest);
  const boundaryTasks = buildBoundaryTasks(manifest);
  const releaseTasks = buildReleaseBlockerTasks(releaseCandidate);
  const tasks = [...releaseTasks, ...evidenceTasks, ...signoffTasks, ...boundaryTasks];
  const roleBuckets = buildRoleBuckets(tasks);
  const ready = Boolean(releaseCandidate.ready && fieldEvidence.ready && tasks.length === 0);
  const summary = {
    label: ready ? "V1 现场任务已清空" : `V1 现场仍有 ${tasks.length} 个待处理任务`,
    taskCount: tasks.length,
    releaseTaskCount: releaseTasks.length,
    evidenceTaskCount: evidenceTasks.length,
    signoffTaskCount: signoffTasks.length,
    boundaryTaskCount: boundaryTasks.length,
    roleCount: roleBuckets.filter((bucket) => bucket.taskCount > 0).length,
    releaseCandidate: releaseCandidate.summary?.label || "",
    fieldEvidence: fieldEvidence.summary?.label || "",
  };

  return {
    scope: "v1_onsite_task_board",
    status: ready ? "ready" : "blocked",
    ready,
    generatedAt: new Date().toISOString(),
    conclusion: ready
      ? "当前发布候选、现场证据、签字和 V1/V2 边界均无剩余任务。"
      : "当前仍不能声明 V1 完成；请按角色任务清单补齐真实环境、真实设备、现场证据和负责人签字。",
    sources: {
      releaseCandidateJson: displayInputPath(releaseCandidateJsonPath),
      fieldEvidenceManifest: displayInputPath(manifestPath),
    },
    summary,
    releaseCandidate: {
      status: releaseCandidate.status,
      ready: Boolean(releaseCandidate.ready),
      summary: releaseCandidate.summary || {},
    },
    fieldEvidence: {
      status: fieldEvidence.status,
      ready: Boolean(fieldEvidence.ready),
      summary: fieldEvidence.summary,
      schemaValid: fieldEvidence.schemaValid !== false,
    },
    roleBuckets,
    tasks,
    v1Scope: stringList(releaseCandidate.v1Scope),
    v2Differences: stringList(releaseCandidate.v2Differences),
    safeguards: {
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawReleaseSecretsExpected: false,
      nonMutating: true,
    },
  };
}

function buildEvidenceTasks(manifest) {
  const tasks = [];
  for (const group of Array.isArray(manifest.evidenceGroups) ? manifest.evidenceGroups : []) {
    const roles = splitRoles(group.ownerRole);
    for (const item of Array.isArray(group.items) ? group.items : []) {
      const status = item.status || "pending";
      const required = item.required === true;
      const evidenceRefFilled = Boolean(String(item.evidenceRef || "").trim());
      const blocked = required && (!completionItemStatuses.has(status) || !evidenceRefFilled);
      if (!blocked) continue;
      const needsEvidenceRef = completionItemStatuses.has(status) && !evidenceRefFilled;
      tasks.push({
        id: `evidence.${group.key || "group"}.${item.key || "item"}`,
        type: "现场证据",
        source: "field_evidence_manifest",
        roles,
        primaryRole: roles[0] || "技术/管理",
        group: stringValue(group.label || group.key),
        title: stringValue(item.label || item.key),
        status,
        priority: "P0",
        evidenceRefFilled,
        action: needsEvidenceRef
          ? "补充 evidenceRef：填写截图编号、报告路径、工单号或现场签字单编号。"
          : "完成真实现场验证，把状态改为 passed 或 accepted，并填写 evidenceRef。",
      });
    }
  }
  return tasks;
}

function buildSignoffTasks(manifest) {
  const tasks = [];
  for (const signoff of Array.isArray(manifest.signoffs) ? manifest.signoffs : []) {
    const status = signoff.status || "pending";
    const signerFilled = Boolean(String(signoff.signer || "").trim());
    const signedAtFilled = Boolean(String(signoff.signedAt || "").trim());
    const blocked = Boolean(signoff.required) && (!completionSignoffStatuses.has(status) || !signerFilled || !signedAtFilled);
    if (!blocked) continue;
    const role = normalizeRole(signoff.role);
    tasks.push({
      id: `signoff.${role}`,
      type: "负责人签字",
      source: "field_evidence_manifest",
      roles: [role],
      primaryRole: role,
      group: "负责人签字",
      title: `${role} 负责人签字`,
      status,
      priority: "P0",
      signerFilled,
      signedAtFilled,
      action: "负责人复核真实证据后，把签字状态改为 signed 或 accepted，并填写 signer / signedAt。",
    });
  }
  return tasks;
}

function buildBoundaryTasks(manifest) {
  const boundary = manifest.v1V2BoundaryConfirmed || {};
  const status = boundary.status || "pending";
  const confirmedByFilled = Boolean(String(boundary.confirmedBy || "").trim());
  const confirmedAtFilled = Boolean(String(boundary.confirmedAt || "").trim());
  if (status === "confirmed" && confirmedByFilled && confirmedAtFilled) return [];
  return [
    {
      id: "boundary.v1_v2",
      type: "V1/V2 边界",
      source: "field_evidence_manifest",
      roles: ["技术/管理"],
      primaryRole: "技术/管理",
      group: "V1/V2 边界确认",
      title: "确认 V1 做到哪里，V2 延后什么",
      status,
      priority: "P0",
      confirmedByFilled,
      confirmedAtFilled,
      action: "由技术 / 管理确认 V1 与 V2 边界，把状态改为 confirmed，并填写 confirmedBy / confirmedAt。",
    },
  ];
}

function buildReleaseBlockerTasks(releaseCandidate) {
  const tasks = [];
  const blockers = Array.isArray(releaseCandidate.blockingItems) ? releaseCandidate.blockingItems : [];
  for (const [index, blocker] of blockers.entries()) {
    const gate = stringValue(blocker.gate);
    if (gate.includes("现场证据")) continue;
    const label = stringValue(blocker.label || blocker.key || `阻塞项 ${index + 1}`);
    const detail = stringValue(blocker.detail || blocker.reason || "补齐该发布门禁");
    const roles = inferReleaseBlockerRoles(`${gate} ${label} ${detail}`);
    tasks.push({
      id: `release.${index + 1}`,
      type: "发布门禁",
      source: "release_candidate",
      roles,
      primaryRole: roles[0],
      group: gate || "发布候选",
      title: label,
      status: stringValue(blocker.status || "pending"),
      priority: "P0",
      action: detail,
    });
  }
  return tasks.slice(0, 12);
}

function buildRoleBuckets(tasks) {
  const knownRoles = new Set(roleOrder);
  for (const task of tasks) for (const role of task.roles || []) knownRoles.add(role);
  const roles = [...roleOrder, ...[...knownRoles].filter((role) => !roleOrder.includes(role)).sort()];
  return roles.map((role) => {
    const roleTasks = tasks.filter((task) => (task.roles || []).includes(role));
    return {
      role,
      taskCount: roleTasks.length,
      p0TaskCount: roleTasks.filter((task) => task.priority === "P0").length,
      tasks: roleTasks.map((task) => task.id),
    };
  });
}

function writeTaskBoardFiles({ outputDir, report }) {
  mkdirSync(outputDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const baseName = `v1-onsite-task-board-${stamp}`;
  const jsonPath = join(outputDir, `${baseName}.json`);
  const markdownPath = join(outputDir, `${baseName}.md`);
  const latestJsonPath = join(outputDir, "latest.json");
  const latestMarkdownPath = join(outputDir, "latest.md");
  const roleMarkdownFiles = writeRoleMarkdownFiles({ outputDir, stamp, report });
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, formatTaskBoardMarkdown(report));
  writeFileSync(latestJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(latestMarkdownPath, formatTaskBoardMarkdown(report));
  return {
    json: displayPath(jsonPath),
    markdown: displayPath(markdownPath),
    latestJson: displayPath(latestJsonPath),
    latestMarkdown: displayPath(latestMarkdownPath),
    roleMarkdownFiles,
  };
}

function buildCommandResult({ report, files }) {
  return {
    status: report.status,
    ready: report.ready,
    generatedAt: report.generatedAt,
    conclusion: report.conclusion,
    summary: report.summary,
    releaseCandidate: report.releaseCandidate,
    fieldEvidence: report.fieldEvidence,
    roleBuckets: report.roleBuckets.map(({ role, taskCount, p0TaskCount }) => ({ role, taskCount, p0TaskCount })),
    safeguards: report.safeguards,
    files,
  };
}

function formatCommandResult(result) {
  return [
    `V1 onsite task board: ${result.ready ? "READY" : "BLOCKED"} (${result.summary.label})`,
    result.conclusion,
    `Markdown: ${result.files.markdown}`,
    `JSON: ${result.files.json}`,
    "",
  ].join("\n");
}

function formatTaskBoardMarkdown(report) {
  const lines = [
    "# ERP V1 现场任务清单",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 当前结论：${report.ready ? "READY" : "BLOCKED"}`,
    `- 发布候选：${report.releaseCandidate.summary?.label || "未返回"} / ${report.releaseCandidate.status}`,
    `- 现场证据：${report.fieldEvidence.summary?.label || "未返回"} / ${report.fieldEvidence.status}`,
    `- 任务汇总：${report.summary.label}`,
    `- 说明：${report.conclusion}`,
    "",
    "## 角色总览",
    "",
    "| 角色 | 待处理任务 | P0 |",
    "| --- | ---: | ---: |",
    ...report.roleBuckets
      .filter((bucket) => bucket.taskCount > 0)
      .map((bucket) => `| ${escapeMarkdownTable(bucket.role)} | ${bucket.taskCount} | ${bucket.p0TaskCount} |`),
    "",
  ];

  for (const bucket of report.roleBuckets.filter((item) => item.taskCount > 0)) {
    const roleTasks = report.tasks.filter((task) => bucket.tasks.includes(task.id));
    lines.push(`## ${bucket.role}`);
    lines.push("");
    lines.push("| 类型 | 分组 | 任务 | 状态 | 下一步 |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const task of roleTasks) {
      lines.push(
        `| ${escapeMarkdownTable(task.type)} | ${escapeMarkdownTable(task.group)} | ${escapeMarkdownTable(task.title)} | ${escapeMarkdownTable(task.status)} | ${escapeMarkdownTable(task.action)} |`,
      );
    }
    lines.push("");
  }

  lines.push("## V1 范围");
  lines.push("");
  for (const item of report.v1Scope.length ? report.v1Scope : ["未返回 V1 范围"]) lines.push(`- ${item}`);
  lines.push("");
  lines.push("## V2 计划差异");
  lines.push("");
  for (const item of report.v2Differences.length ? report.v2Differences : ["未返回 V2 差异"]) lines.push(`- ${item}`);
  lines.push("");
  lines.push("## 安全说明");
  lines.push("");
  lines.push("- 本清单不打印原始 evidenceRef、签字人或真实 env 值。");
  lines.push("- `passed` / `accepted` 仍必须有 evidenceRef；缺 evidenceRef 的证据不会算 V1 ready。");
  lines.push("- 任务清单生成不等于验收通过；最终以 release candidate READY 和负责人签字为准。");
  lines.push("");
  return `${lines.join("\n")}`;
}

function writeRoleMarkdownFiles({ outputDir, stamp, report }) {
  const rolesDir = join(outputDir, "roles");
  mkdirSync(rolesDir, { recursive: true });
  const roleFiles = [];
  for (const [index, bucket] of report.roleBuckets.filter((item) => item.taskCount > 0).entries()) {
    const slug = roleFileSlugs.get(bucket.role) || `role-${index + 1}`;
    const roleTasks = report.tasks.filter((task) => bucket.tasks.includes(task.id));
    const timestampedPath = join(rolesDir, `${slug}-${stamp}.md`);
    const latestPath = join(rolesDir, `${slug}.latest.md`);
    const markdown = formatRoleTaskMarkdown({ report, bucket, roleTasks });
    writeFileSync(timestampedPath, markdown);
    writeFileSync(latestPath, markdown);
    roleFiles.push({
      role: bucket.role,
      taskCount: bucket.taskCount,
      p0TaskCount: bucket.p0TaskCount,
      markdown: displayPath(timestampedPath),
      latestMarkdown: displayPath(latestPath),
    });
  }
  return roleFiles;
}

function formatRoleTaskMarkdown({ report, bucket, roleTasks }) {
  const lines = [
    `# ERP V1 现场任务清单 - ${bucket.role}`,
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 当前结论：${report.ready ? "READY" : "BLOCKED"}`,
    `- 本角色待处理：${bucket.taskCount} 个，其中 P0 ${bucket.p0TaskCount} 个`,
    `- 发布候选：${report.releaseCandidate.summary?.label || "未返回"} / ${report.releaseCandidate.status}`,
    `- 现场证据：${report.fieldEvidence.summary?.label || "未返回"} / ${report.fieldEvidence.status}`,
    "",
    "## 待处理任务",
    "",
    "| 类型 | 分组 | 任务 | 状态 | 下一步 |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const task of roleTasks) {
    lines.push(
      `| ${escapeMarkdownTable(task.type)} | ${escapeMarkdownTable(task.group)} | ${escapeMarkdownTable(task.title)} | ${escapeMarkdownTable(task.status)} | ${escapeMarkdownTable(task.action)} |`,
    );
  }
  lines.push("");
  lines.push("## 安全说明");
  lines.push("");
  lines.push("- 本角色清单不打印原始 evidenceRef、签字人或真实 env 值。");
  lines.push("- 完成任务后仍要回填现场证据 manifest，并重新跑 release candidate。");
  lines.push("- 本清单是执行分工，不是上线批准。");
  lines.push("");
  return `${lines.join("\n")}`;
}

function splitRoles(value) {
  const text = stringValue(value);
  const roles = text
    .split(/[\/、,，]+/)
    .map((item) => normalizeRole(item))
    .filter(Boolean);
  return roles.length ? [...new Set(roles)] : ["技术/管理"];
}

function normalizeRole(value) {
  const role = stringValue(value).trim();
  if (!role) return "";
  if (role.includes("技术") || role.includes("管理")) return "技术/管理";
  if (role.includes("仓库") || role.includes("出库")) return "仓库/出库";
  if (role.includes("办公室")) return "办公室";
  if (role.includes("车间")) return "车间";
  if (role.includes("司机")) return "司机";
  if (role.includes("财务")) return "财务";
  return role;
}

function inferReleaseBlockerRoles(text) {
  const value = stringValue(text);
  const roles = new Set();
  if (/对象存储|附件|对账导出/.test(value)) {
    roles.add("技术/管理");
    roles.add("财务");
  }
  if (/打印|CUPS|spool|command_bridge|标签|针式|printer/i.test(value)) {
    roles.add("技术/管理");
    roles.add("办公室");
    roles.add("仓库/出库");
  }
  if (/司机|真机|扫码|导航|driver|native/i.test(value)) {
    roles.add("技术/管理");
    roles.add("司机");
  }
  if (/车间|打包|生产任务|生产报工|生产\/打包/.test(value)) roles.add("车间");
  if (/环境变量|PostgreSQL|数据库|迁移|profile|备份|权限|账号|CUPS|对象存储/i.test(value)) {
    roles.add("技术/管理");
  }
  return roles.size ? [...roles] : ["技术/管理"];
}

function stringList(value) {
  return Array.isArray(value) ? value.map((item) => stringValue(item)).filter(Boolean) : [];
}

function stringValue(value) {
  return value == null ? "" : String(value);
}

function displayPath(path) {
  const relativePath = relative(process.cwd(), resolve(path));
  if (!relativePath.startsWith("..") && !relativePath.startsWith("/") && relativePath !== "") return relativePath;
  return "[external-output]";
}

function displayInputPath(path) {
  const relativePath = relative(process.cwd(), resolve(path));
  if (!relativePath.startsWith("..") && !relativePath.startsWith("/") && relativePath !== "") return relativePath;
  return "[external-input]";
}

function escapeMarkdownTable(value) {
  return stringValue(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}
