#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { validateV1FieldEvidenceManifest } from "./v1FieldEvidenceManifest.mjs";

const defaultOutputDir = join(".erp-local-storage", "v1-field-evidence-intake");
const defaultManifestPath = join("docs", "development", "v1-field-evidence-manifest.template.json");
const defaultReleaseCandidateJsonPath = join(".erp-local-storage", "v1-release-candidate", "latest.json");
const defaultOnsiteTaskBoardJsonPath = join(".erp-local-storage", "v1-onsite-task-board", "latest.json");
const defaultCompletionSnapshotJsonPath = join(".erp-local-storage", "v1-completion-snapshot", "latest.json");

try {
  const options = parseArgs(process.argv.slice(2));
  const outputDir = resolve(options.outputDir || process.env.ERP_V1_FIELD_EVIDENCE_INTAKE_OUTPUT_DIR || defaultOutputDir);
  const manifestPath = resolve(options.manifest || process.env.ERP_V1_FIELD_EVIDENCE_MANIFEST || defaultManifestPath);
  const releaseCandidate = readOptionalJson({
    explicitPath: options.releaseCandidateJson,
    envPath: process.env.ERP_V1_FIELD_EVIDENCE_INTAKE_RELEASE_CANDIDATE_JSON,
    defaultPath: defaultReleaseCandidateJsonPath,
    expectedScope: "v1_release_candidate_check",
    label: "V1 release candidate JSON",
  });
  const onsiteTaskBoard = readOptionalJson({
    explicitPath: options.onsiteTaskBoardJson,
    envPath: process.env.ERP_V1_FIELD_EVIDENCE_INTAKE_ONSITE_TASK_BOARD_JSON,
    defaultPath: defaultOnsiteTaskBoardJsonPath,
    expectedScope: "v1_onsite_task_board",
    label: "V1 onsite task-board JSON",
  });
  const completionSnapshot = readOptionalJson({
    explicitPath: options.completionSnapshotJson,
    envPath: process.env.ERP_V1_FIELD_EVIDENCE_INTAKE_COMPLETION_SNAPSHOT_JSON,
    defaultPath: defaultCompletionSnapshotJsonPath,
    expectedScope: "v1_completion_snapshot",
    label: "V1 completion snapshot JSON",
  });
  const manifest = readJson(manifestPath, "V1 field evidence manifest");
  const validation = validateV1FieldEvidenceManifest(manifest);
  const report = buildIntakeReport({
    manifestPath,
    manifest,
    validation,
    releaseCandidate: releaseCandidate.data,
    releaseCandidatePath: releaseCandidate.path,
    onsiteTaskBoard: onsiteTaskBoard.data,
    onsiteTaskBoardPath: onsiteTaskBoard.path,
    completionSnapshot: completionSnapshot.data,
    completionSnapshotPath: completionSnapshot.path,
  });
  const files = writeIntakePack({ outputDir, report, manifest, validation, onsiteTaskBoard: onsiteTaskBoard.data });
  const result = {
    ...report,
    files,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(formatCommandResult(result));
  }
} catch (error) {
  const message = error?.message || String(error);
  if (process.argv.includes("--json")) {
    process.stdout.write(
      `${JSON.stringify({ scope: "v1_field_evidence_intake_pack", status: "error", ready: false, error: { message } }, null, 2)}\n`,
    );
  } else {
    process.stderr.write(`V1 field evidence intake pack failed: ${message}\n`);
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
    if (arg === "--manifest") {
      options.manifest = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--release-candidate-json") {
      options.releaseCandidateJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--onsite-task-board-json") {
      options.onsiteTaskBoardJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--completion-snapshot-json") {
      options.completionSnapshotJson = readValue(args, index, arg);
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
    "Usage: node scripts/run-v1-field-evidence-intake-pack.mjs [options]",
    "",
    "Options:",
    "  --manifest <path>                    Field-evidence manifest, default docs/development/v1-field-evidence-manifest.template.json",
    "  --output-dir <dir>                  Output directory, default .erp-local-storage/v1-field-evidence-intake",
    "  --release-candidate-json <path>     Optional V1 release-candidate JSON",
    "  --onsite-task-board-json <path>     Optional V1 onsite task-board JSON",
    "  --completion-snapshot-json <path>   Optional V1 completion snapshot JSON",
    "  --json                              Print a machine-readable summary",
    "",
    "This command is non-mutating: it never changes pending evidence to passed and never prints raw evidenceRef values.",
  ].join("\n");
}

function readOptionalJson({ explicitPath, envPath, defaultPath, expectedScope, label }) {
  const selected = explicitPath || envPath || defaultPath;
  const resolved = resolve(selected);
  if (!existsSync(resolved)) {
    if (explicitPath || envPath) throw new Error(`${label} is missing: ${displayInputPath(resolved)}`);
    return { path: "", data: null };
  }
  const data = readJson(resolved, label);
  if (expectedScope && data?.scope !== expectedScope) {
    throw new Error(`${label} has an unexpected shape: ${displayInputPath(resolved)}`);
  }
  return { path: resolved, data };
}

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${displayInputPath(path)}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${label} is not readable JSON: ${displayInputPath(path)}`);
  }
}

function buildIntakeReport({
  manifestPath,
  manifest: _manifest,
  validation,
  releaseCandidate,
  releaseCandidatePath,
  onsiteTaskBoard,
  onsiteTaskBoardPath,
  completionSnapshot,
  completionSnapshotPath,
}) {
  const ready = Boolean(validation.ready);
  const groups = validation.groups.map((group) => ({
    key: group.key,
    label: group.label,
    ownerRole: group.ownerRole,
    status: group.status,
    ready: Boolean(group.ready),
    requiredTotal: Number(group.requiredTotal || 0),
    completedRequired: Number(group.completedRequired || 0),
    blockedRequired: Number(group.blockedRequired || 0),
    outputFile: join("groups", `${group.key}.zh-CN.md`),
  }));
  return {
    scope: "v1_field_evidence_intake_pack",
    status: ready ? "ready_pack_written" : "blocked_pack_written",
    ready,
    generatedAt: new Date().toISOString(),
    conclusion: ready
      ? "现场证据 manifest 已通过；该采集包用于复核留档，不替代负责人最终确认。"
      : "现场证据仍未完成；该采集包用于按证据组补齐材料、签字和 V1/V2 边界确认。",
    sources: {
      fieldEvidenceManifest: displayInputPath(manifestPath),
      releaseCandidateJson: releaseCandidatePath ? displayInputPath(releaseCandidatePath) : "",
      onsiteTaskBoardJson: onsiteTaskBoardPath ? displayInputPath(onsiteTaskBoardPath) : "",
      completionSnapshotJson: completionSnapshotPath ? displayInputPath(completionSnapshotPath) : "",
    },
    summary: {
      label: ready ? "V1 现场证据采集包：READY" : "V1 现场证据采集包：BLOCKED",
      evidence: validation.summary?.label || "",
      evidenceGroups: `${groups.filter((group) => group.ready).length}/${groups.length}`,
      requiredEvidenceItems: `${validation.summary?.requiredEvidenceItemsCompleted || 0}/${validation.summary?.requiredEvidenceItemsTotal || 0}`,
      signoffs: `${validation.summary?.requiredSignoffsCompleted || 0}/${validation.summary?.requiredSignoffsTotal || 0}`,
      boundary: validation.boundary?.blocking ? "pending" : "confirmed",
      releaseCandidate: releaseCandidate?.summary?.label || "",
      v1Readiness: completionSnapshot?.summary?.v1Readiness || "",
      onsiteTasks: onsiteTaskBoard?.summary?.taskCount ?? null,
    },
    releaseCandidate: releaseCandidate
      ? {
          included: true,
          status: stringValue(releaseCandidate.status),
          ready: Boolean(releaseCandidate.ready),
          summary: releaseCandidate.summary || {},
        }
      : { included: false },
    completionSnapshot: completionSnapshot
      ? {
          included: true,
          status: stringValue(completionSnapshot.status),
          ready: Boolean(completionSnapshot.ready),
          summary: completionSnapshot.summary || {},
          blockerGroups: Array.isArray(completionSnapshot.blockerGroups)
            ? completionSnapshot.blockerGroups.map((group) => ({
                gate: stringValue(group.gate),
                count: Number(group.count || 0),
              }))
            : [],
        }
      : { included: false },
    onsiteTaskBoard: onsiteTaskBoard
      ? {
          included: true,
          status: stringValue(onsiteTaskBoard.status),
          ready: Boolean(onsiteTaskBoard.ready),
          summary: onsiteTaskBoard.summary || {},
          roleBuckets: Array.isArray(onsiteTaskBoard.roleBuckets)
            ? onsiteTaskBoard.roleBuckets.map((bucket) => ({
                role: stringValue(bucket.role),
                taskCount: Number(bucket.taskCount || 0),
                p0TaskCount: Number(bucket.p0TaskCount || 0),
              }))
            : [],
        }
      : { included: false },
    groups,
    signoffs: validation.signoffs.map((signoff) => ({
      role: signoff.role,
      required: Boolean(signoff.required),
      status: signoff.status,
      ready: !signoff.blocking,
      signerFilled: Boolean(signoff.signerFilled),
      signedAtFilled: Boolean(signoff.signedAtFilled),
    })),
    boundary: {
      status: validation.boundary?.status || "",
      ready: !validation.boundary?.blocking,
      confirmedByFilled: Boolean(validation.boundary?.confirmedByFilled),
      confirmedAtFilled: Boolean(validation.boundary?.confirmedAtFilled),
      v1ItemCount: Number(validation.boundary?.v1ItemCount || 0),
      v2ItemCount: Number(validation.boundary?.v2ItemCount || 0),
    },
    safeguards: {
      nonMutating: true,
      pendingEvidenceNotAutoAccepted: true,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawNotesIncluded: false,
      possibleSensitiveEvidenceRefCount: Number(validation.safeguards?.possibleSensitiveEvidenceRefCount || 0),
      generatedFilesUseRedactedFillStateOnly: true,
      manifestSchemaValid: validation.schemaValid !== false,
    },
  };
}

function writeIntakePack({ outputDir, report, manifest, validation, onsiteTaskBoard }) {
  mkdirSync(outputDir, { recursive: true });
  const groupsDir = join(outputDir, "groups");
  mkdirSync(groupsDir, { recursive: true });
  const files = {};

  const summaryPath = join(outputDir, "intake-summary.zh-CN.md");
  const manifestPath = join(outputDir, "intake-manifest.json");
  const csvPath = join(outputDir, "evidence-items.csv");
  const rulesPath = join(outputDir, "intake-rules.zh-CN.md");
  const signoffPath = join(outputDir, "signoff-boundary.zh-CN.md");
  const signoffCsvPath = join(outputDir, "signoff-boundary.csv");

  writeFileSync(summaryPath, formatSummaryMarkdown(report));
  writeFileSync(manifestPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(csvPath, formatEvidenceItemsCsv({ manifest, validation }));
  writeFileSync(rulesPath, formatIntakeRulesMarkdown({ report }));
  writeFileSync(signoffPath, formatSignoffBoundaryMarkdown({ manifest, validation }));
  writeFileSync(signoffCsvPath, formatSignoffBoundaryCsv({ manifest, validation }));
  files.summaryMarkdown = displayPath(summaryPath);
  files.intakeManifest = displayPath(manifestPath);
  files.evidenceItemsCsv = displayPath(csvPath);
  files.intakeRulesMarkdown = displayPath(rulesPath);
  files.signoffBoundaryMarkdown = displayPath(signoffPath);
  files.signoffBoundaryCsv = displayPath(signoffCsvPath);
  files.groupMarkdownFiles = [];

  for (const group of report.groups) {
    const manifestGroup = manifest.evidenceGroups.find((candidate) => candidate.key === group.key);
    const validationGroup = validation.groups.find((candidate) => candidate.key === group.key);
    const groupPath = join(outputDir, group.outputFile);
    const relatedTasks = Array.isArray(onsiteTaskBoard?.tasks)
      ? onsiteTaskBoard.tasks.filter((task) => task.type === "现场证据" && task.group === group.label)
      : [];
    writeFileSync(groupPath, formatGroupMarkdown({ manifestGroup, validationGroup, relatedTasks }));
    files.groupMarkdownFiles.push(displayPath(groupPath));
  }

  return files;
}

function formatSummaryMarkdown(report) {
  const lines = [
    "# ERP V1 现场证据采集包",
    "",
    `生成时间：${report.generatedAt}`,
    "",
    `当前结论：${report.ready ? "READY" : "BLOCKED"}`,
    "",
    report.conclusion,
    "",
    "## 当前状态",
    "",
    `- 现场证据：${report.summary.evidence || "未读取"}`,
    `- 证据组完成：${report.summary.evidenceGroups}`,
    `- 必填证据完成：${report.summary.requiredEvidenceItems}`,
    `- 负责人签字完成：${report.summary.signoffs}`,
    `- V1 / V2 边界：${report.summary.boundary}`,
    `- 发布候选：${report.summary.releaseCandidate || "未纳入"}`,
    `- V1 真实上线就绪度：${report.summary.v1Readiness || "未纳入"}`,
    `- 现场任务：${report.summary.onsiteTasks === null ? "未纳入" : `${report.summary.onsiteTasks} 个`}`,
    "",
    "## 证据组采集单",
    "",
    "| 证据组 | 负责人 | 状态 | 必填完成 | 待处理 | 文件 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.groups.map(
      (group) =>
        `| ${escapeMarkdownTable(group.label)} | ${escapeMarkdownTable(group.ownerRole)} | ${group.status} | ${group.completedRequired}/${group.requiredTotal} | ${group.blockedRequired} | \`${group.outputFile}\` |`,
    ),
    "",
    "## 现场使用顺序",
    "",
    "1. 先把本目录的 `groups/*.zh-CN.md` 分给对应负责人，只填证据编号、报告名、截图文件名或签字单编号。",
    "2. 先看 `intake-rules.zh-CN.md`，再统一填写 `evidence-items.csv` 和 `signoff-boundary.csv`；前者回填证据项，后者回填负责人签字和 V1/V2 边界确认。",
    "3. 用 `node scripts/apply-v1-field-evidence-intake.mjs --manifest <current-manifest> --csv evidence-items.csv --signoff-boundary-csv signoff-boundary.csv --output <filled-manifest-draft>` 生成 draft manifest。",
    "4. 跑 `node scripts/validate-v1-field-evidence-manifest.mjs --manifest <filled-manifest-draft>`。",
    "5. 跑 `node scripts/run-v1-release-candidate-check.mjs --use-production-env-setup-env-file --field-evidence-manifest <filled-manifest-draft> --api-base-url <erp-api>`；只有绕开 production env setup 报告时才显式传 `--env-file <secure-env-file>`。",
    "",
    "## 安全边界",
    "",
    "- 本包不修改现场证据 manifest，也不会把 `pending` 自动改成 `passed`。",
    "- 本包不输出原始 `evidenceRef`、签字人、备注、真实 env、连接串或密钥。",
    "- 自动化报告、fake CUPS、本地对象存储和实验室 `11/11` 只能作为代码侧证据，不能替代真实生产和现场签字。",
    "",
  ];
  return `${lines.join("\n")}`;
}

function formatIntakeRulesMarkdown({ report }) {
  const lines = [
    "# ERP V1 现场证据填写规则",
    "",
    "## 适用文件",
    "",
    "- `evidence-items.csv`：逐项填写 40 项现场证据。",
    "- `signoff-boundary.csv`：填写 6 个负责人签字和 V1/V2 边界确认。",
    "- `filled-manifest.draft.json`：由脚本生成，不手工编辑。",
    "",
    "## evidence-items.csv 字段规则",
    "",
    "| 字段 | 填写规则 |",
    "| --- | --- |",
    "| onsiteStatus | 允许 `pending`、`passed`、`accepted`、`blocked`、`not_applicable`。留空且其它 onsite 字段也为空时，该行跳过。 |",
    "| onsiteEvidenceRef | `passed` / `accepted` 必填。只填证据编号、截图文件名、报告名或内部归档编号。 |",
    "| onsiteNotes | 可填简短说明，例如设备型号、样张编号、验收范围；不要填密钥、连接串、命令路径、spool 路径或客户隐私原文。 |",
    "",
    "## signoff-boundary.csv 字段规则",
    "",
    "| recordType | onsiteStatus | 必填字段 |",
    "| --- | --- | --- |",
    "| signoff | `pending`、`signed`、`accepted`、`blocked` | `signed` / `accepted` 必须填写 `onsiteSigner` 和 `onsiteSignedAt`。 |",
    "| boundary | `pending`、`confirmed`、`blocked` | `confirmed` 必须填写 `onsiteConfirmedBy` 和 `onsiteConfirmedAt`。 |",
    "",
    "## 推荐编号和时间格式",
    "",
    "- 证据编号建议使用 `EVT-<组别>-<日期>-<序号>`，例如 `EVT-PRINT-20260704-001`。",
    "- 签字单编号建议写在备注里，例如 `签字单 EVT-SIGN-20260704-001 已归档`。",
    "- 时间建议使用 ISO 格式，例如 `2026-07-04T10:00:00+08:00`。",
    "",
    "## 回填命令",
    "",
    "```bash",
    "node scripts/apply-v1-field-evidence-intake.mjs \\",
    "  --manifest <current-field-evidence-manifest> \\",
    "  --csv .erp-local-storage/v1-field-evidence-intake/evidence-items.csv \\",
    "  --signoff-boundary-csv .erp-local-storage/v1-field-evidence-intake/signoff-boundary.csv \\",
    "  --output .erp-local-storage/v1-field-evidence-intake/filled-manifest.draft.json",
    "",
    "node scripts/validate-v1-field-evidence-manifest.mjs \\",
    "  --manifest .erp-local-storage/v1-field-evidence-intake/filled-manifest.draft.json",
    "",
    "node scripts/run-v1-go-live-suite.mjs \\",
    "  --refresh-release-candidate \\",
    "  --field-evidence-manifest <current-field-evidence-manifest> \\",
    "  --field-evidence-intake-csv .erp-local-storage/v1-field-evidence-intake/evidence-items.csv \\",
    "  --field-evidence-signoff-boundary-csv .erp-local-storage/v1-field-evidence-intake/signoff-boundary.csv \\",
    "  --field-evidence-draft-output .erp-local-storage/v1-field-evidence-intake/filled-manifest.draft.json \\",
    "  --output-root .erp-local-storage/v1-go-live-suite \\",
    "  --sync-canonical-latest",
    "```",
    "",
    "## 当前状态提醒",
    "",
    `- 当前采集包结论：${report.ready ? "READY" : "BLOCKED"}`,
    `- 必填证据完成：${report.summary.requiredEvidenceItems}`,
    `- 负责人签字完成：${report.summary.signoffs}`,
    `- V1/V2 边界：${report.summary.boundary}`,
    "",
    "## 安全边界",
    "",
    "- 采集包和回填脚本不会修改源 manifest，只会生成 draft。",
    "- 不要把真实数据库 URL、对象存储密钥、访问 token、命令路径、spool 路径或客户原文写进 CSV。",
    "- 自动化实验室通过不等于现场通过；真实生产、真实设备、真实业务试跑和负责人签字仍是 V1 准入条件。",
    "",
  ];
  return `${lines.join("\n")}`;
}

function formatGroupMarkdown({ manifestGroup, validationGroup, relatedTasks }) {
  const lines = [
    `# ERP V1 现场证据采集单 - ${manifestGroup.label}`,
    "",
    `负责人：${manifestGroup.ownerRole || "未配置"}`,
    "",
    `当前状态：${validationGroup.ready ? "READY" : "BLOCKED"}`,
    "",
    `必填完成：${validationGroup.completedRequired}/${validationGroup.requiredTotal}`,
    "",
    "## 需要采集的证据",
    "",
    "| 证据项 | 当前状态 | 已有 evidenceRef | 现场填写 evidenceRef | 现场备注 |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const item of validationGroup.items) {
    lines.push(
      `| ${escapeMarkdownTable(item.label)} | ${item.status} | ${item.evidenceRefFilled ? "已填" : "未填"} |  |  |`,
    );
  }

  lines.push("");
  lines.push("## 对应现场任务");
  lines.push("");
  if (relatedTasks.length) {
    lines.push("| 任务 | 角色 | 动作 |");
    lines.push("| --- | --- | --- |");
    for (const task of relatedTasks) {
      lines.push(
        `| ${escapeMarkdownTable(task.title)} | ${escapeMarkdownTable((task.roles || []).join(" / "))} | ${escapeMarkdownTable(task.action)} |`,
      );
    }
  } else {
    lines.push("- 未纳入现场任务清单；按上方证据项逐项补齐。");
  }

  lines.push("");
  lines.push("## 填写要求");
  lines.push("");
  lines.push("- `现场填写 evidenceRef` 只填证据编号、截图文件名、报告路径或签字单编号。");
  lines.push("- 状态只有在真实生产、真实设备或真实业务试跑通过后才改为 `passed` 或 `accepted`。");
  lines.push("- 不要填写数据库连接串、对象存储密钥、命令路径、spool 路径或客户隐私原文。");
  lines.push("");
  return `${lines.join("\n")}`;
}

function formatSignoffBoundaryMarkdown({ manifest, validation }) {
  const lines = [
    "# ERP V1 签字与 V1/V2 边界确认单",
    "",
    "## 负责人签字",
    "",
    "| 角色 | 当前状态 | 签字人已填 | 签字时间已填 | 现场签字人 | 现场签字时间 | 备注 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const signoff of validation.signoffs) {
    lines.push(
      `| ${escapeMarkdownTable(signoff.role)} | ${signoff.status} | ${signoff.signerFilled ? "是" : "否"} | ${signoff.signedAtFilled ? "是" : "否"} |  |  |  |`,
    );
  }
  lines.push("");
  lines.push("## V1 范围");
  lines.push("");
  for (const item of manifest.v1V2BoundaryConfirmed?.v1 || []) lines.push(`- ${item}`);
  lines.push("");
  lines.push("## V2 范围");
  lines.push("");
  for (const item of manifest.v1V2BoundaryConfirmed?.v2 || []) lines.push(`- ${item}`);
  lines.push("");
  lines.push("## 边界确认");
  lines.push("");
  lines.push(`- 当前状态：${validation.boundary?.status || "pending"}`);
  lines.push(`- 已填确认人：${validation.boundary?.confirmedByFilled ? "是" : "否"}`);
  lines.push(`- 已填确认时间：${validation.boundary?.confirmedAtFilled ? "是" : "否"}`);
  lines.push("- 现场确认人：");
  lines.push("- 现场确认时间：");
  lines.push("");
  return `${lines.join("\n")}`;
}

function formatSignoffBoundaryCsv({ validation }) {
  const rows = [
    [
      "recordType",
      "role",
      "label",
      "required",
      "status",
      "filledName",
      "filledTime",
      "onsiteStatus",
      "onsiteSigner",
      "onsiteSignedAt",
      "onsiteConfirmedBy",
      "onsiteConfirmedAt",
      "onsiteNotes",
    ],
  ];
  for (const signoff of validation.signoffs) {
    rows.push([
      "signoff",
      signoff.role,
      signoff.role,
      signoff.required ? "yes" : "no",
      signoff.status,
      signoff.signerFilled ? "yes" : "no",
      signoff.signedAtFilled ? "yes" : "no",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  }
  rows.push([
    "boundary",
    "v1_v2_boundary",
    "V1/V2 边界确认",
    "yes",
    validation.boundary?.status || "pending",
    validation.boundary?.confirmedByFilled ? "yes" : "no",
    validation.boundary?.confirmedAtFilled ? "yes" : "no",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  return `${rows.map((row) => row.map(formatCsvCell).join(",")).join("\n")}\n`;
}

function formatEvidenceItemsCsv({ manifest, validation }) {
  const rows = [
    [
      "groupKey",
      "groupLabel",
      "ownerRole",
      "itemKey",
      "itemLabel",
      "required",
      "status",
      "evidenceRefFilled",
      "onsiteStatus",
      "onsiteEvidenceRef",
      "onsiteNotes",
    ],
  ];
  for (const group of manifest.evidenceGroups) {
    const validationGroup = validation.groups.find((candidate) => candidate.key === group.key);
    for (const item of validationGroup.items) {
      rows.push([
        group.key,
        group.label,
        group.ownerRole || "",
        item.key,
        item.label,
        item.required ? "yes" : "no",
        item.status,
        item.evidenceRefFilled ? "yes" : "no",
        "",
        "",
        "",
      ]);
    }
  }
  return `${rows.map((row) => row.map(formatCsvCell).join(",")).join("\n")}\n`;
}

function formatCsvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function formatCommandResult(result) {
  return [
    `V1 field evidence intake pack: ${result.ready ? "READY" : "BLOCKED"}`,
    `Summary: ${result.summary.evidence}`,
    `Evidence groups: ${result.summary.evidenceGroups}`,
    `Required evidence: ${result.summary.requiredEvidenceItems}`,
    `Signoffs: ${result.summary.signoffs}`,
    `Output: ${result.files?.summaryMarkdown || ""}`,
    "",
  ].join("\n");
}

function escapeMarkdownTable(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .trim();
}

function stringValue(value) {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

function displayPath(path) {
  const absolute = resolve(path);
  const cwd = process.cwd();
  const rel = relative(cwd, absolute);
  if (rel && !rel.startsWith("..") && rel !== ".") return rel;
  return absolute;
}

function displayInputPath(path) {
  return displayPath(path);
}
