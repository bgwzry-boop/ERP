#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildV1FieldEvidenceManifestTemplate } from "./v1FieldEvidenceManifest.mjs";
import { redactCloseoutText } from "./run-v1-production-first-stage-closeout.mjs";

const defaultEvidenceCsvPath = join(".erp-local-storage", "v1-field-evidence-intake", "evidence-items.csv");
const defaultPersistenceEvidencePath = join(".erp-local-storage", "v1-production-persistence-evidence", "latest.json");
const defaultRuntimeSmokePath = join(".erp-local-storage", "v1-production-runtime-smoke", "latest.json");
const defaultOutputDir = join(".erp-local-storage", "v1-production-first-stage-evidence-suggestions");
const evidenceHeaders = [
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
];
const firstStageGroupKeys = new Set(["production_persistence", "object_storage"]);

if (isCliEntrypoint()) runCli();

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = buildProductionFirstStageEvidenceSuggestions({
      evidenceCsvPath: options.evidenceCsv,
      persistenceEvidencePath: options.persistenceEvidenceJson,
      runtimeSmokePath: options.runtimeSmokeJson,
      checkedAt: options.checkedAt,
      overwrite: options.overwrite,
      write: options.write,
      outputDir: options.outputDir,
    });
    if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else process.stdout.write(formatProductionFirstStageEvidenceSuggestions(report));
    process.exit(0);
  } catch (error) {
    const message = redactSuggestionText(error?.message || String(error));
    if (process.argv.includes("--json")) {
      process.stdout.write(
        `${JSON.stringify({ scope: "v1_production_first_stage_evidence_suggestions", status: "error", ready: false, error: { message } }, null, 2)}\n`,
      );
    } else {
      process.stderr.write(`V1 production first-stage evidence suggestions failed: ${message}\n`);
    }
    process.exit(1);
  }
}

function isCliEntrypoint() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function parseArgs(args) {
  const options = {
    evidenceCsv: defaultEvidenceCsvPath,
    persistenceEvidenceJson: defaultPersistenceEvidencePath,
    runtimeSmokeJson: defaultRuntimeSmokePath,
    outputDir: defaultOutputDir,
    json: false,
    write: true,
    overwrite: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--no-write") {
      options.write = false;
      continue;
    }
    if (arg === "--overwrite") {
      options.overwrite = true;
      continue;
    }
    if (arg === "--evidence-csv") {
      options.evidenceCsv = readArgValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--persistence-evidence-json") {
      options.persistenceEvidenceJson = readArgValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--runtime-smoke-json") {
      options.runtimeSmokeJson = readArgValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = readArgValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--checked-at") {
      options.checkedAt = readArgValue(args, index, arg);
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

function readArgValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function helpText() {
  return [
    "Usage: node scripts/run-v1-production-first-stage-evidence-suggestions.mjs [options]",
    "",
    "Options:",
    "  --evidence-csv <path>              Source intake CSV. Defaults to .erp-local-storage/v1-field-evidence-intake/evidence-items.csv",
    "  --persistence-evidence-json <path> Redacted production persistence evidence JSON.",
    "  --runtime-smoke-json <path>        Redacted production runtime smoke JSON.",
    "  --output-dir <path>                Write suggestion CSV / JSON / Markdown files.",
    "  --overwrite                        Replace existing onsite fields in the suggestion CSV.",
    "  --no-write                         Do not write artifacts.",
    "  --json                             Print machine-readable summary.",
    "",
    "This command only writes review suggestions. It does not mutate source CSV, source reports, production env, field manifest, release candidate, or go-live suite.",
    "Fully automated evidence is suggested as accepted only when covered by redacted first-stage reports; partial/manual items remain pending or blank.",
  ].join("\n");
}

function buildProductionFirstStageEvidenceSuggestions({
  evidenceCsvPath = defaultEvidenceCsvPath,
  persistenceEvidencePath = defaultPersistenceEvidencePath,
  runtimeSmokePath = defaultRuntimeSmokePath,
  checkedAt = new Date().toISOString(),
  overwrite = false,
  write = true,
  outputDir = defaultOutputDir,
} = {}) {
  const sourceRows = readEvidenceRows(evidenceCsvPath);
  const persistenceEvidence = readOptionalJson(persistenceEvidencePath, "production persistence evidence");
  const runtimeSmoke = readOptionalJson(runtimeSmokePath, "production runtime smoke");
  const stageState = buildStageState({ persistenceEvidence, runtimeSmoke });
  const suggestions = [];
  const outputRows = sourceRows.map((row) => {
    const decision = decideSuggestion({ row, stageState, checkedAt });
    if (!decision || !firstStageGroupKeys.has(value(row.groupKey))) return row;
    const hasExistingOnsiteValues = Boolean(value(row.onsiteStatus) || value(row.onsiteEvidenceRef) || value(row.onsiteNotes));
    if (hasExistingOnsiteValues && !overwrite) {
      suggestions.push({
        groupKey: value(row.groupKey),
        itemKey: value(row.itemKey),
        itemLabel: value(row.itemLabel),
        coverage: "preserved_existing",
        status: value(row.onsiteStatus) || "existing",
        evidenceRefSuggested: false,
        noteSuggested: false,
      });
      return row;
    }
    if (decision.coverage === "manual_only") {
      suggestions.push(decisionPublic(row, decision));
      return row;
    }
    const nextRow = { ...row };
    if (decision.onsiteStatus) nextRow.onsiteStatus = decision.onsiteStatus;
    if (decision.onsiteEvidenceRef) nextRow.onsiteEvidenceRef = decision.onsiteEvidenceRef;
    if (decision.onsiteNotes) nextRow.onsiteNotes = decision.onsiteNotes;
    suggestions.push(decisionPublic(row, decision));
    return nextRow;
  });
  const summary = buildSummary({ sourceRows, suggestions, stageState, persistenceEvidence, runtimeSmoke });
  const report = {
    scope: "v1_production_first_stage_evidence_suggestions",
    status: "review_required",
    ready: false,
    generatedAt: checkedAt,
    conclusion:
      "已生成第一阶段现场证据回填建议；该结果必须经现场负责人复核后再应用，不能替代真实现场证据、签字或 V1/V2 边界确认。",
    sources: {
      evidenceCsv: displayInputPath(evidenceCsvPath),
      persistenceEvidenceJson: persistenceEvidence.available ? displayInputPath(persistenceEvidencePath) : "",
      runtimeSmokeJson: runtimeSmoke.available ? displayInputPath(runtimeSmokePath) : "",
      rawSourceReportsIncluded: false,
    },
    sourceReports: {
      persistenceEvidence: sourceReportSummary(persistenceEvidence.data, "v1_production_persistence_evidence"),
      runtimeSmoke: sourceReportSummary(runtimeSmoke.data, "v1_production_runtime_smoke"),
    },
    summary,
    stageState,
    suggestions,
    nextActions: buildNextActions({ summary, persistenceEvidence, runtimeSmoke }),
    safeguards: {
      sourceCsvMutated: false,
      sourceReportsMutated: false,
      sourceManifestMutated: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      productionEnvMutated: false,
      suggestionsRequireHumanReview: true,
      declaresFullV1Complete: false,
      rawSourceReportsIncluded: false,
      rawEvidenceRefsFromSourceIncluded: false,
      rawSecretsIncluded: false,
    },
  };
  const safeReport = redactSuggestionReport(report);
  if (write) {
    const files = writeSuggestionArtifacts({
      report: safeReport,
      rows: outputRows,
      outputDir,
      checkedAt,
    });
    return { ...safeReport, files };
  }
  return {
    ...safeReport,
    files: {
      outputWritten: false,
    },
  };
}

function readEvidenceRows(path) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) return buildRowsFromManifestTemplate();
  const rows = parseCsv(readFileSync(resolved, "utf8"));
  return rows.map((row) => {
    const normalized = {};
    for (const header of evidenceHeaders) normalized[header] = value(row[header]);
    return normalized;
  });
}

function buildRowsFromManifestTemplate() {
  const manifest = buildV1FieldEvidenceManifestTemplate();
  return manifest.evidenceGroups.flatMap((group) =>
    group.items.map((item) => ({
      groupKey: group.key,
      groupLabel: group.label,
      ownerRole: group.ownerRole,
      itemKey: item.key,
      itemLabel: item.label,
      required: item.required ? "yes" : "no",
      status: item.status || "pending",
      evidenceRefFilled: item.evidenceRef ? "yes" : "no",
      onsiteStatus: "",
      onsiteEvidenceRef: "",
      onsiteNotes: "",
    })),
  );
}

function readOptionalJson(path, label) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) return { available: false, data: null, label };
  try {
    return { available: true, data: JSON.parse(readFileSync(resolved, "utf8")), label };
  } catch {
    return { available: false, data: null, label, unreadable: true };
  }
}

function buildStageState({ persistenceEvidence, runtimeSmoke }) {
  const persistence = persistenceEvidence.data || {};
  const runtime = runtimeSmoke.data || {};
  const persistenceStages = stagesByKey(persistence);
  const runtimeStages = stagesByKey(runtime);
  const persistenceEnv = persistenceStages.get("production-persistence-env-subset");
  const fullEnvBlockingCount = numberOrZero(persistenceEnv?.evidence?.fullEnvBlockingCount);
  const fullEnvTotalCount = numberOrZero(persistenceEnv?.evidence?.fullEnvTotalCount);
  const fullEnvPassedCount = numberOrZero(persistenceEnv?.evidence?.fullEnvPassedCount);
  return {
    persistenceEvidenceReady: persistence.ready === true,
    runtimeSmokeReady: runtime.ready === true,
    postgresPreflightReady: isStagePassed(persistenceStages, "production-postgres-preflight"),
    postgresBackupRestoreReady: isStagePassed(persistenceStages, "production-postgres-backup-restore-check"),
    objectStoragePreflightReady: isStagePassed(persistenceStages, "production-object-storage-preflight"),
    objectStorageGovernanceReady: isStagePassed(persistenceStages, "production-object-storage-governance-check"),
    runtimeProductionProfileReady: isStagePassed(runtimeStages, "runtime-production-profile"),
    fullProductionEnvPreflightReady: fullEnvTotalCount > 0 && fullEnvBlockingCount === 0 && fullEnvPassedCount >= fullEnvTotalCount,
    fullProductionEnvPassedCount: fullEnvPassedCount,
    fullProductionEnvTotalCount: fullEnvTotalCount,
    firstStageCloseoutAutoReady: persistence.ready === true && runtime.ready === true,
  };
}

function stagesByKey(report = {}) {
  return new Map((Array.isArray(report.stages) ? report.stages : []).map((stage) => [stage.key, stage]));
}

function isStagePassed(stages, key) {
  const stage = stages.get(key);
  return stage?.status === "passed" || stage?.ready === true;
}

function decideSuggestion({ row, stageState, checkedAt }) {
  const groupKey = value(row.groupKey);
  const itemKey = value(row.itemKey);
  if (!firstStageGroupKeys.has(groupKey)) return null;
  const stamp = compactTimestamp(checkedAt);
  const accepted = ({ source, note }) => ({
    coverage: "auto_covered",
    onsiteStatus: "accepted",
    onsiteEvidenceRef: `AUTO:${source}:${stamp}`,
    onsiteNotes: note,
  });
  const partial = ({ note }) => ({
    coverage: "partial_auto_support",
    onsiteStatus: "pending",
    onsiteEvidenceRef: "",
    onsiteNotes: note,
  });
  const manual = ({ note }) => ({
    coverage: "manual_only",
    onsiteStatus: "",
    onsiteEvidenceRef: "",
    onsiteNotes: note,
  });

  if (groupKey === "production_persistence") {
    if (itemKey === "postgres_migration_applied") {
      return stageState.postgresPreflightReady
        ? accepted({ source: "production-postgres-preflight", note: "自动化报告已确认生产库迁移记录与本地迁移清单匹配；现场仍需复核报告归档。" })
        : manual({ note: "需先运行生产 PostgreSQL 结构 / 权限 live 预检并通过。" });
    }
    if (itemKey === "postgres_backup_configured") {
      return stageState.postgresBackupRestoreReady
        ? partial({ note: "自动化恢复抽样已通过；仍需人工确认生产备份策略、负责人、巡检频率和告警路径。" })
        : manual({ note: "需人工确认备份策略，并运行备份 / 恢复抽样验证。" });
    }
    if (itemKey === "postgres_restore_sample_checked") {
      return stageState.postgresBackupRestoreReady
        ? accepted({ source: "production-postgres-backup-restore-check", note: "自动化报告已确认恢复样本在专用验证库通过，且生产源库保持只读。" })
        : manual({ note: "需运行生产 PostgreSQL 备份 / 恢复抽样验证并保留报告。" });
    }
    if (itemKey === "postgres_roles_checked") {
      return stageState.postgresPreflightReady
        ? accepted({ source: "production-postgres-preflight", note: "自动化报告已确认核心表权限和临时写入回滚探针通过。" })
        : manual({ note: "需运行生产 PostgreSQL 结构 / 权限 live 预检。" });
    }
    if (itemKey === "production_env_preflight_10_of_10") {
      const fullEnvTargetLabel = targetPassLabel(stageState.fullProductionEnvTotalCount);
      if (stageState.fullProductionEnvPreflightReady) {
        return accepted({ source: "production-env-preflight", note: `自动化报告显示完整 V1 生产环境变量预检达到 ${fullEnvTargetLabel}。` });
      }
      return stageState.fullProductionEnvTotalCount > 0
        ? partial({
            note: `当前自动化报告未证明完整 ${fullEnvTargetLabel}；已读到 ${stageState.fullProductionEnvPassedCount}/${stageState.fullProductionEnvTotalCount}，仍需补齐生产 env 后重跑。`,
          })
        : manual({ note: "需先运行生产 env 预检，并达到完整全项通过后再回填该项。" });
    }
  }

  if (groupKey === "object_storage") {
    if (itemKey === "attachment_bucket_policy_checked") {
      return stageState.objectStorageGovernanceReady
        ? partial({ note: "自动化治理检查已读回 bucket 版本控制、生命周期、加密 / policy 能力；仍需人工确认备份策略和控制台留档。" })
        : manual({ note: "需运行对象存储 bucket 治理检查，并补控制台 / 备份策略证据。" });
    }
    if (itemKey === "attachment_upload_readback_checked") {
      return stageState.objectStoragePreflightReady
        ? accepted({ source: "production-object-storage-preflight", note: "自动化报告已确认附件诊断对象写入、读回、摘要一致和清理。" })
        : manual({ note: "需运行生产对象存储 live 预检并通过附件写入 / 读回。" });
    }
    if (itemKey === "attachment_signed_url_checked") {
      return stageState.objectStoragePreflightReady
        ? accepted({ source: "production-object-storage-preflight", note: "自动化报告已确认附件短期签名 URL 可读且未泄露签名值。" })
        : manual({ note: "需运行生产对象存储 live 预检并验证短期访问地址。" });
    }
    if (itemKey === "attachment_access_audit_checked") {
      return manual({ note: "当前自动化报告不查询云厂商访问审计；需人工提供访问审计可查询证据。" });
    }
    if (itemKey === "statement_export_storage_checked") {
      return stageState.objectStoragePreflightReady
        ? accepted({ source: "production-object-storage-preflight", note: "自动化报告已确认对账导出诊断文件写入、读回、摘要一致和清理。" })
        : manual({ note: "需运行生产对象存储 live 预检并验证对账导出文件可重新下载。" });
    }
  }
  return manual({ note: "该证据项不属于第一阶段自动化覆盖范围。" });
}

function decisionPublic(row, decision) {
  return {
    groupKey: value(row.groupKey),
    itemKey: value(row.itemKey),
    itemLabel: value(row.itemLabel),
    coverage: decision.coverage,
    status: decision.onsiteStatus || "unchanged",
    evidenceRefSuggested: Boolean(decision.onsiteEvidenceRef),
    noteSuggested: Boolean(decision.onsiteNotes),
  };
}

function buildSummary({ sourceRows, suggestions, stageState, persistenceEvidence, runtimeSmoke }) {
  const firstStageRows = sourceRows.filter((row) => firstStageGroupKeys.has(value(row.groupKey)));
  const autoAcceptedSuggestionCount = suggestions.filter((item) => item.coverage === "auto_covered").length;
  const partialSuggestionCount = suggestions.filter((item) => item.coverage === "partial_auto_support").length;
  const manualOnlyCount = suggestions.filter((item) => item.coverage === "manual_only").length;
  const preservedExistingCount = suggestions.filter((item) => item.coverage === "preserved_existing").length;
  return {
    label: `${autoAcceptedSuggestionCount} 项可建议自动接受，${partialSuggestionCount} 项只有部分自动化支撑，${manualOnlyCount} 项仍需人工证据`,
    sourceEvidenceRows: sourceRows.length,
    firstStageEvidenceRows: firstStageRows.length,
    autoAcceptedSuggestionCount,
    partialSuggestionCount,
    manualOnlyCount,
    preservedExistingCount,
    firstStageManualReviewStillRequired: partialSuggestionCount + manualOnlyCount > 0,
    persistenceEvidenceReady: persistenceEvidence.data?.ready === true,
    runtimeSmokeReady: runtimeSmoke.data?.ready === true,
    firstStageCloseoutAutoReportsReady: stageState.firstStageCloseoutAutoReady,
    suggestedCsvAppliesOnlyDraft: true,
  };
}

function sourceReportSummary(report, expectedScope) {
  if (!report) return { included: false, ready: false, status: "missing", expectedScope };
  return {
    included: true,
    expectedScope,
    scope: value(report.scope),
    status: value(report.status || "unknown"),
    ready: report.ready === true,
    label: value(report.summary?.label || ""),
    rawReportIncluded: false,
  };
}

function buildNextActions({ summary, persistenceEvidence, runtimeSmoke }) {
  const actions = [];
  if (!persistenceEvidence.available)
    actions.push(
      "先运行生产持久化留证：node -- scripts/run-v1-production-persistence-evidence.mjs --use-production-env-setup-env-file；如需绕开 setup 报告，再改用 --env-file <secure-env-file>。",
    );
  if (!runtimeSmoke.available)
    actions.push(
      "再运行生产 API runtime smoke：node -- scripts/run-v1-production-runtime-smoke.mjs --use-production-env-setup-env-file；如需绕开 setup 报告，再改用 --env-file <secure-env-file>。",
    );
  if (summary.autoAcceptedSuggestionCount > 0) {
    actions.push("现场负责人复核 suggested-evidence-items.csv，确认无误后用 apply-v1-field-evidence-intake 生成 draft manifest。");
  }
  if (summary.firstStageManualReviewStillRequired) {
    actions.push("继续人工补齐备份策略负责人、bucket 备份策略 / 控制台证据和附件访问审计证据。");
  }
  actions.push("回填后重新运行 first-stage closeout；不要把本建议报告当作负责人签字或 V1 完成证明。");
  return actions;
}

function writeSuggestionArtifacts({ report, rows, outputDir, checkedAt }) {
  const dir = resolve(outputDir);
  mkdirSync(dir, { recursive: true });
  const stamp = compactTimestamp(checkedAt);
  const suggestedCsvPath = join(dir, "suggested-evidence-items.csv");
  const jsonPath = join(dir, `v1-production-first-stage-evidence-suggestions-${stamp}.json`);
  const markdownPath = join(dir, `v1-production-first-stage-evidence-suggestions-${stamp}.md`);
  const latestJsonPath = join(dir, "latest.json");
  const latestMarkdownPath = join(dir, "latest.md");
  const publicFiles = {
    outputDir: displayInputPath(dir),
    suggestedCsv: displayInputPath(suggestedCsvPath),
    json: displayInputPath(jsonPath),
    markdown: displayInputPath(markdownPath),
    latestJson: displayInputPath(latestJsonPath),
    latestMarkdown: displayInputPath(latestMarkdownPath),
    outputWritten: true,
  };
  const jsonReport = { ...report, files: publicFiles };
  const json = `${JSON.stringify(jsonReport, null, 2)}\n`;
  const markdown = formatProductionFirstStageEvidenceSuggestions(jsonReport);
  writeFileSync(suggestedCsvPath, serializeCsv(rows));
  writeFileSync(jsonPath, json);
  writeFileSync(markdownPath, markdown);
  writeFileSync(latestJsonPath, json);
  writeFileSync(latestMarkdownPath, markdown);
  return publicFiles;
}

function formatProductionFirstStageEvidenceSuggestions(report) {
  const lines = [
    "# V1 Production First-Stage Evidence Suggestions",
    "",
    `Status: REVIEW REQUIRED (${report.summary.label})`,
    `Generated at: ${report.generatedAt}`,
    "",
    "## Source Reports",
    `- Production persistence evidence: ${report.sourceReports.persistenceEvidence.status} ${report.sourceReports.persistenceEvidence.label || ""}`,
    `- Runtime smoke: ${report.sourceReports.runtimeSmoke.status} ${report.sourceReports.runtimeSmoke.label || ""}`,
    "",
    "## Suggestions",
    `- Auto accepted suggestions: ${report.summary.autoAcceptedSuggestionCount}`,
    `- Partial automation support: ${report.summary.partialSuggestionCount}`,
    `- Manual-only first-stage items: ${report.summary.manualOnlyCount}`,
    `- Existing onsite rows preserved: ${report.summary.preservedExistingCount}`,
    "",
  ];
  for (const item of report.suggestions) {
    lines.push(`- ${item.coverage} ${item.groupKey}/${item.itemKey}: ${item.itemLabel}`);
  }
  lines.push("", "## Safeguards");
  lines.push("- Source CSV mutated: no");
  lines.push("- Source reports mutated: no");
  lines.push("- Release candidate refreshed: no");
  lines.push("- Declares full V1 complete: no");
  lines.push("- Suggestions require human review: yes");
  lines.push("", "## Next");
  for (const action of report.nextActions) lines.push(`- ${action}`);
  if (report.files?.suggestedCsv) {
    lines.push("", "## Files", `- Suggested CSV: ${report.files.suggestedCsv}`, `- Latest JSON: ${report.files.latestJson || ""}`);
  }
  lines.push("");
  return redactSuggestionText(lines.join("\n"));
}

function parseCsv(text) {
  const records = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char === "\r") continue;
    cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    records.push(row);
  }
  if (records.length === 0) return [];
  const headers = records[0].map((header) => value(header));
  return records
    .slice(1)
    .filter((record) => record.some((entry) => value(entry)))
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] || ""])));
}

function serializeCsv(rows) {
  const lines = [evidenceHeaders.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(evidenceHeaders.map((header) => csvCell(row[header] || "")).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function csvCell(valueToSerialize) {
  return `"${String(valueToSerialize ?? "").replaceAll('"', '""')}"`;
}

function compactTimestamp(valueToFormat) {
  const text = value(valueToFormat || new Date().toISOString());
  const parsed = Number.isNaN(Date.parse(text)) ? new Date() : new Date(text);
  return parsed.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function displayInputPath(path) {
  const resolved = resolve(path);
  const relativePath = relative(process.cwd(), resolved);
  if (!relativePath.startsWith("..") && !relativePath.startsWith("/") && relativePath !== "") return relativePath;
  return `[external:${String(path).split(/[\\/]/).pop()}]`;
}

function redactSuggestionReport(report) {
  return JSON.parse(redactSuggestionText(JSON.stringify(report)));
}

function redactSuggestionText(input) {
  return redactCloseoutText(String(input ?? ""))
    .replace(/AUTO:[A-Za-z0-9_-]+:\d{8}T\d{6}Z/g, (match) => match)
    .replace(/\/(?:Users|private|var|tmp)\/[^\s"',<>]+/g, "[redacted-local-path]");
}

function value(input) {
  return String(input ?? "").trim();
}

function numberOrZero(input) {
  const number = Number(input);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function targetPassLabel(totalCount) {
  const total = numberOrZero(totalCount);
  return total > 0 ? `${total}/${total}` : "全项通过";
}

export {
  buildProductionFirstStageEvidenceSuggestions,
  formatProductionFirstStageEvidenceSuggestions,
  parseArgs,
};
