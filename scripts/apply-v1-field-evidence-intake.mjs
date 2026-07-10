#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateV1FieldEvidenceManifest } from "./v1FieldEvidenceManifest.mjs";

export const defaultManifestPath = join("docs", "development", "v1-field-evidence-manifest.template.json");
export const defaultCsvPath = join(".erp-local-storage", "v1-field-evidence-intake", "evidence-items.csv");
export const defaultSignoffBoundaryCsvPath = join(".erp-local-storage", "v1-field-evidence-intake", "signoff-boundary.csv");
export const defaultOutputPath = join(".erp-local-storage", "v1-field-evidence-intake", "filled-manifest.draft.json");
const acceptedStatuses = new Set(["pending", "passed", "accepted", "blocked", "not_applicable"]);
const completionStatuses = new Set(["passed", "accepted"]);
const acceptedSignoffStatuses = new Set(["pending", "signed", "accepted", "blocked"]);
const completionSignoffStatuses = new Set(["signed", "accepted"]);
const acceptedBoundaryStatuses = new Set(["pending", "confirmed", "blocked"]);
const inputSnapshotSchema = "erp-v1-field-evidence-intake-snapshot-v1";

if (isCli(import.meta.url)) runCli();

export function applyV1FieldEvidenceIntakeFromFiles(options = {}) {
  const manifestPath = resolve(options.manifestPath || defaultManifestPath);
  const hasExplicitCsv = Boolean(options.csv || options.csvPath);
  const signoffBoundaryCsvPath = options.signoffBoundaryCsvPath ? resolve(options.signoffBoundaryCsvPath) : "";
  const shouldReadEvidenceCsv = Boolean(hasExplicitCsv || !signoffBoundaryCsvPath);
  const csvPath = shouldReadEvidenceCsv ? resolve(options.csv || options.csvPath || defaultCsvPath) : "";
  const outputPath = resolve(options.outputPath || defaultOutputPath);
  const manifest = readJson(manifestPath, "V1 field evidence manifest");
  const evidenceCsvText = shouldReadEvidenceCsv
    ? readText(csvPath, "V1 field evidence intake CSV")
    : "";
  const signoffBoundaryCsvText = signoffBoundaryCsvPath
    ? readText(signoffBoundaryCsvPath, "V1 signoff and boundary intake CSV")
    : "";
  const evidenceRows = shouldReadEvidenceCsv ? parseCsv(evidenceCsvText) : [];
  const signoffBoundaryRows = signoffBoundaryCsvPath ? parseCsv(signoffBoundaryCsvText) : [];
  const result = applyRowsToManifest({
    manifest,
    evidenceRows,
    signoffBoundaryRows,
    evidenceCsvText,
    signoffBoundaryCsvText,
    manifestPath,
    csvPath,
    signoffBoundaryCsvPath,
    outputPath,
  });

  if (result.invalidRows.length > 0) {
    return buildPublicResult({ result, outputPath, outputWritten: false });
  }

  const shouldWriteOutput = options.writeOutput !== false;
  if (shouldWriteOutput) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(result.manifest, null, 2)}\n`);
  }
  return buildPublicResult({ result, outputPath, outputWritten: shouldWriteOutput });
}

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const output = applyV1FieldEvidenceIntakeFromFiles({
      manifestPath: options.manifest,
      csv: options.csv,
      csvPath: options.csv,
      signoffBoundaryCsvPath: options.signoffBoundaryCsv,
      outputPath: options.output,
      writeOutput: true,
    });
    if (options.json) process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    else process.stdout.write(formatCommandResult(output));
    process.exit(output.summary?.invalidRowCount > 0 ? 1 : 0);
  } catch (error) {
    const message = error?.message || String(error);
    if (process.argv.includes("--json")) {
      process.stdout.write(
        `${JSON.stringify({ scope: "v1_field_evidence_intake_apply", status: "error", ready: false, error: { message } }, null, 2)}\n`,
      );
    } else {
      process.stderr.write(`V1 field evidence intake apply failed: ${message}\n`);
    }
    process.exit(1);
  }
}

function isCli(metaUrl) {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(metaUrl);
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--manifest") {
      options.manifest = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--csv") {
      options.csv = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--signoff-boundary-csv") {
      options.signoffBoundaryCsv = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      options.output = readValue(args, index, arg);
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
    "Usage: node scripts/apply-v1-field-evidence-intake.mjs [options]",
    "",
    "Options:",
    "  --manifest <path>  Source field-evidence manifest, default docs/development/v1-field-evidence-manifest.template.json",
    "  --csv <path>       Filled intake CSV, default .erp-local-storage/v1-field-evidence-intake/evidence-items.csv",
    "  --signoff-boundary-csv <path>",
    `                     Filled signoff/boundary CSV, default when supplied is ${defaultSignoffBoundaryCsvPath}`,
    "  --output <path>    Draft output manifest, default .erp-local-storage/v1-field-evidence-intake/filled-manifest.draft.json",
    "  --json             Print a machine-readable summary",
    "",
    "Rows are applied only when onsiteStatus is explicit. passed/accepted evidence rows require onsiteEvidenceRef.",
    "signed/accepted signoffs require onsiteSigner and onsiteSignedAt; confirmed boundary rows require onsiteConfirmedBy and onsiteConfirmedAt.",
    "The command never edits the source manifest in place and never prints raw evidence refs or raw signer names.",
  ].join("\n");
}

function readText(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${displayInputPath(path)}`);
  return readFileSync(path, "utf8");
}

function readJson(path, label) {
  const text = readText(path, label);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not readable JSON: ${displayInputPath(path)}`);
  }
}

function applyRowsToManifest({
  manifest,
  evidenceRows,
  signoffBoundaryRows,
  evidenceCsvText = "",
  signoffBoundaryCsvText = "",
  manifestPath,
  csvPath,
  signoffBoundaryCsvPath,
  outputPath,
}) {
  const generatedAt = new Date().toISOString();
  const draft = JSON.parse(JSON.stringify(manifest));
  const groupsByKey = new Map((draft.evidenceGroups || []).map((group) => [group.key, group]));
  const signoffsByRole = new Map((draft.signoffs || []).map((signoff) => [signoff.role, signoff]));
  const invalidRows = [];
  const skippedRows = [];
  const appliedRows = [];
  const appliedEvidenceRows = [];
  const appliedSignoffRows = [];
  const appliedBoundaryRows = [];

  for (const [rowIndex, row] of evidenceRows.entries()) {
    const displayRow = rowIndex + 2;
    const groupKey = value(row.groupKey);
    const itemKey = value(row.itemKey);
    const onsiteStatus = value(row.onsiteStatus);
    const onsiteEvidenceRef = value(row.onsiteEvidenceRef);
    const onsiteNotes = value(row.onsiteNotes);
    const hasOnsiteValues = Boolean(onsiteStatus || onsiteEvidenceRef || onsiteNotes);

    if (!groupKey || !itemKey) {
      invalidRows.push(publicInvalidRow("evidence", displayRow, groupKey, itemKey, "groupKey and itemKey are required"));
      continue;
    }
    const group = groupsByKey.get(groupKey);
    const item = group?.items?.find((candidate) => candidate.key === itemKey);
    if (!group || !item) {
      invalidRows.push(publicInvalidRow("evidence", displayRow, groupKey, itemKey, "row does not match an evidence item in the manifest"));
      continue;
    }
    if (!hasOnsiteValues) {
      skippedRows.push({ type: "evidence", row: displayRow, groupKey, itemKey, reason: "no onsite values" });
      continue;
    }
    if (!onsiteStatus) {
      invalidRows.push(publicInvalidRow("evidence", displayRow, groupKey, itemKey, "onsiteStatus is required when onsite evidence values are present"));
      continue;
    }
    if (!acceptedStatuses.has(onsiteStatus)) {
      invalidRows.push(publicInvalidRow("evidence", displayRow, groupKey, itemKey, `onsiteStatus must be one of ${Array.from(acceptedStatuses).join(", ")}`));
      continue;
    }
    if (completionStatuses.has(onsiteStatus) && !onsiteEvidenceRef) {
      invalidRows.push(publicInvalidRow("evidence", displayRow, groupKey, itemKey, "passed or accepted evidence requires onsiteEvidenceRef"));
      continue;
    }
    if (hasSensitiveMarker(onsiteEvidenceRef) || hasSensitiveMarker(onsiteNotes)) {
      invalidRows.push(publicInvalidRow("evidence", displayRow, groupKey, itemKey, "onsite evidence contains a sensitive-looking value"));
      continue;
    }

    item.status = onsiteStatus;
    if (onsiteEvidenceRef) item.evidenceRef = onsiteEvidenceRef;
    if (onsiteNotes) item.notes = onsiteNotes;
    const appliedRow = {
      type: "evidence",
      row: displayRow,
      groupKey,
      itemKey,
      onsiteStatus,
      evidenceRefFilled: Boolean(onsiteEvidenceRef),
      notesFilled: Boolean(onsiteNotes),
    };
    appliedRows.push(appliedRow);
    appliedEvidenceRows.push(appliedRow);
  }

  for (const [rowIndex, row] of signoffBoundaryRows.entries()) {
    const displayRow = rowIndex + 2;
    const recordType = value(row.recordType).toLowerCase();
    if (recordType === "signoff") {
      const role = value(row.role);
      const onsiteStatus = value(row.onsiteStatus);
      const onsiteSigner = value(row.onsiteSigner);
      const onsiteSignedAt = value(row.onsiteSignedAt);
      const onsiteNotes = value(row.onsiteNotes);
      const hasOnsiteValues = Boolean(onsiteStatus || onsiteSigner || onsiteSignedAt || onsiteNotes);
      const signoff = signoffsByRole.get(role);
      if (!role) {
        invalidRows.push(publicInvalidRow("signoff", displayRow, "signoff", role, "role is required for signoff rows"));
        continue;
      }
      if (!signoff) {
        invalidRows.push(publicInvalidRow("signoff", displayRow, "signoff", role, "row does not match a signoff role in the manifest"));
        continue;
      }
      if (!hasOnsiteValues) {
        skippedRows.push({ type: "signoff", row: displayRow, role, reason: "no onsite values" });
        continue;
      }
      if (!onsiteStatus) {
        invalidRows.push(publicInvalidRow("signoff", displayRow, "signoff", role, "onsiteStatus is required when onsite signoff values are present"));
        continue;
      }
      if (!acceptedSignoffStatuses.has(onsiteStatus)) {
        invalidRows.push(
          publicInvalidRow("signoff", displayRow, "signoff", role, `onsiteStatus must be one of ${Array.from(acceptedSignoffStatuses).join(", ")}`),
        );
        continue;
      }
      if (completionSignoffStatuses.has(onsiteStatus) && (!onsiteSigner || !onsiteSignedAt)) {
        invalidRows.push(publicInvalidRow("signoff", displayRow, "signoff", role, "signed or accepted signoff requires onsiteSigner and onsiteSignedAt"));
        continue;
      }
      if (hasSensitiveMarker(onsiteSigner) || hasSensitiveMarker(onsiteSignedAt) || hasSensitiveMarker(onsiteNotes)) {
        invalidRows.push(publicInvalidRow("signoff", displayRow, "signoff", role, "onsite signoff contains a sensitive-looking value"));
        continue;
      }
      signoff.status = onsiteStatus;
      if (onsiteSigner) signoff.signer = onsiteSigner;
      if (onsiteSignedAt) signoff.signedAt = onsiteSignedAt;
      if (onsiteNotes) signoff.notes = onsiteNotes;
      const appliedRow = {
        type: "signoff",
        row: displayRow,
        role,
        onsiteStatus,
        signerFilled: Boolean(onsiteSigner),
        signedAtFilled: Boolean(onsiteSignedAt),
        notesFilled: Boolean(onsiteNotes),
      };
      appliedRows.push(appliedRow);
      appliedSignoffRows.push(appliedRow);
      continue;
    }

    if (recordType === "boundary") {
      const boundary = draft.v1V2BoundaryConfirmed || {};
      const boundaryKey = value(row.role) || "v1_v2_boundary";
      const onsiteStatus = value(row.onsiteStatus);
      const onsiteConfirmedBy = value(row.onsiteConfirmedBy);
      const onsiteConfirmedAt = value(row.onsiteConfirmedAt);
      const onsiteNotes = value(row.onsiteNotes);
      const hasOnsiteValues = Boolean(onsiteStatus || onsiteConfirmedBy || onsiteConfirmedAt || onsiteNotes);
      if (!hasOnsiteValues) {
        skippedRows.push({ type: "boundary", row: displayRow, key: boundaryKey, reason: "no onsite values" });
        continue;
      }
      if (!onsiteStatus) {
        invalidRows.push(publicInvalidRow("boundary", displayRow, "boundary", boundaryKey, "onsiteStatus is required when onsite boundary values are present"));
        continue;
      }
      if (!acceptedBoundaryStatuses.has(onsiteStatus)) {
        invalidRows.push(
          publicInvalidRow("boundary", displayRow, "boundary", boundaryKey, `onsiteStatus must be one of ${Array.from(acceptedBoundaryStatuses).join(", ")}`),
        );
        continue;
      }
      if (onsiteStatus === "confirmed" && (!onsiteConfirmedBy || !onsiteConfirmedAt)) {
        invalidRows.push(publicInvalidRow("boundary", displayRow, "boundary", boundaryKey, "confirmed boundary requires onsiteConfirmedBy and onsiteConfirmedAt"));
        continue;
      }
      if (hasSensitiveMarker(onsiteConfirmedBy) || hasSensitiveMarker(onsiteConfirmedAt) || hasSensitiveMarker(onsiteNotes)) {
        invalidRows.push(publicInvalidRow("boundary", displayRow, "boundary", boundaryKey, "onsite boundary confirmation contains a sensitive-looking value"));
        continue;
      }
      boundary.status = onsiteStatus;
      if (onsiteConfirmedBy) boundary.confirmedBy = onsiteConfirmedBy;
      if (onsiteConfirmedAt) boundary.confirmedAt = onsiteConfirmedAt;
      if (onsiteNotes) boundary.notes = onsiteNotes;
      draft.v1V2BoundaryConfirmed = boundary;
      const appliedRow = {
        type: "boundary",
        row: displayRow,
        key: boundaryKey,
        onsiteStatus,
        confirmedByFilled: Boolean(onsiteConfirmedBy),
        confirmedAtFilled: Boolean(onsiteConfirmedAt),
        notesFilled: Boolean(onsiteNotes),
      };
      appliedRows.push(appliedRow);
      appliedBoundaryRows.push(appliedRow);
      continue;
    }

    if (!recordType) {
      skippedRows.push({ type: "signoff_boundary", row: displayRow, reason: "no recordType" });
      continue;
    }
    invalidRows.push(publicInvalidRow("signoff_boundary", displayRow, recordType, "", "recordType must be signoff or boundary"));
  }

  draft.updatedAt = generatedAt;
  draft.fieldEvidenceIntakeSnapshot = buildInputSnapshot({
    generatedAt,
    evidenceCsvText,
    signoffBoundaryCsvText,
    evidenceRows,
    signoffBoundaryRows,
    csvPath,
    signoffBoundaryCsvPath,
  });
  const validation = validateV1FieldEvidenceManifest(draft);
  return {
    scope: "v1_field_evidence_intake_apply",
    status: invalidRows.length ? "invalid" : validation.ready ? "ready_draft_written" : "blocked_draft_written",
    ready: invalidRows.length ? false : validation.ready,
    generatedAt,
    sources: {
      manifest: displayInputPath(manifestPath),
      csv: csvPath ? displayInputPath(csvPath) : "",
      signoffBoundaryCsv: signoffBoundaryCsvPath ? displayInputPath(signoffBoundaryCsvPath) : "",
      output: displayInputPath(outputPath),
    },
    summary: {
      appliedRowCount: appliedRows.length,
      appliedEvidenceRowCount: appliedEvidenceRows.length,
      appliedSignoffRowCount: appliedSignoffRows.length,
      appliedBoundaryRowCount: appliedBoundaryRows.length,
      skippedRowCount: skippedRows.length,
      invalidRowCount: invalidRows.length,
      evidence: validation.summary?.label || "",
      requiredEvidenceItems: `${validation.summary?.requiredEvidenceItemsCompleted || 0}/${validation.summary?.requiredEvidenceItemsTotal || 0}`,
      signoffs: `${validation.summary?.requiredSignoffsCompleted || 0}/${validation.summary?.requiredSignoffsTotal || 0}`,
      boundary: validation.boundary?.blocking ? "pending" : "confirmed",
      inputSnapshot: {
        schema: inputSnapshotSchema,
        generatedAt,
        evidenceCsvIncluded: Boolean(csvPath),
        evidenceRowCount: evidenceRows.length,
        signoffBoundaryCsvIncluded: Boolean(signoffBoundaryCsvPath),
        signoffBoundaryRowCount: signoffBoundaryRows.length,
        rawCsvIncluded: false,
        digestValuesPrinted: false,
      },
    },
    validation: {
      status: validation.status,
      ready: validation.ready,
      summary: validation.summary,
    },
    appliedRows,
    appliedEvidenceRows,
    appliedSignoffRows,
    appliedBoundaryRows,
    skippedRows,
    invalidRows,
    safeguards: {
      sourceManifestMutated: false,
      outputWritesDraftOnly: true,
      inputSnapshotWritten: true,
      rawEvidenceRefsPrinted: false,
      rawSignersPrinted: false,
      rawCsvPrinted: false,
      digestValuesPrinted: false,
      sensitiveRowsRejected: invalidRows.some((row) => row.reason.includes("sensitive")),
    },
    manifest: draft,
  };
}

function buildInputSnapshot({
  generatedAt,
  evidenceCsvText,
  signoffBoundaryCsvText,
  evidenceRows,
  signoffBoundaryRows,
  csvPath,
  signoffBoundaryCsvPath,
}) {
  const evidenceCsvIncluded = Boolean(csvPath);
  const signoffBoundaryCsvIncluded = Boolean(signoffBoundaryCsvPath);
  return {
    schema: inputSnapshotSchema,
    generatedAt,
    evidenceCsv: {
      included: evidenceCsvIncluded,
      digestAlgorithm: "sha256",
      digest: evidenceCsvIncluded ? digestText(evidenceCsvText) : "",
      rowCount: evidenceCsvIncluded ? evidenceRows.length : 0,
    },
    signoffBoundaryCsv: {
      included: signoffBoundaryCsvIncluded,
      digestAlgorithm: "sha256",
      digest: signoffBoundaryCsvIncluded ? digestText(signoffBoundaryCsvText) : "",
      rowCount: signoffBoundaryCsvIncluded ? signoffBoundaryRows.length : 0,
    },
    safeguards: {
      rawCsvIncluded: false,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      localPathIncluded: false,
    },
  };
}

function digestText(text) {
  return createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function buildPublicResult({ result, outputPath, outputWritten }) {
  const { manifest: _manifest, ...publicResult } = result;
  return {
    ...publicResult,
    files: {
      outputManifest: displayInputPath(outputPath),
      outputWritten: Boolean(outputWritten),
    },
  };
}

function publicInvalidRow(type, row, groupKey, itemKey, reason) {
  return {
    type,
    row,
    groupKey,
    itemKey,
    reason,
    fixHint: fixHintForInvalidRow({ type, reason }),
  };
}

function fixHintForInvalidRow({ type, reason }) {
  if (/onsiteStatus is required/i.test(reason)) {
    return type === "boundary"
      ? "填写 onsiteStatus；边界确认用 confirmed，暂未确认用 pending 或 blocked。"
      : "填写 onsiteStatus；证据用 passed/accepted/blocked/pending/not_applicable，签字用 signed/accepted/blocked/pending。";
  }
  if (/must be one of/i.test(reason)) {
    return type === "signoff"
      ? "signoff 行 onsiteStatus 只能填 pending、signed、accepted 或 blocked。"
      : type === "boundary"
        ? "boundary 行 onsiteStatus 只能填 pending、confirmed 或 blocked。"
        : "证据行 onsiteStatus 只能填 pending、passed、accepted、blocked 或 not_applicable。";
  }
  if (/passed or accepted evidence requires onsiteEvidenceRef/i.test(reason)) {
    return "passed/accepted 证据必须填写 onsiteEvidenceRef；只填证据编号、截图文件名、报告名或内部归档编号。";
  }
  if (/requires onsiteSigner and onsiteSignedAt/i.test(reason)) {
    return "signed/accepted 签字必须填写 onsiteSigner 和 onsiteSignedAt；时间建议使用 2026-07-04T10:00:00+08:00 格式。";
  }
  if (/confirmed boundary requires onsiteConfirmedBy and onsiteConfirmedAt/i.test(reason)) {
    return "confirmed 边界确认必须填写 onsiteConfirmedBy 和 onsiteConfirmedAt；时间建议使用 2026-07-04T10:00:00+08:00 格式。";
  }
  if (/sensitive-looking value/i.test(reason)) {
    return "删除连接串、密钥、命令路径、spool 路径或 token；改填脱敏证据编号、截图文件名或内部归档编号。";
  }
  if (/does not match/i.test(reason)) {
    return "不要改 groupKey、itemKey、recordType 或 role；请从最新采集包 CSV 复制原始行再填写 onsite 字段。";
  }
  if (/required/i.test(reason)) {
    return "补齐必填定位字段；请从最新采集包 CSV 复制原始行再填写 onsite 字段。";
  }
  return "按 intake-rules.zh-CN.md 修正该行后重新运行回填脚本。";
}

function value(input) {
  return String(input || "").trim();
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
  const headers = records[0].map((header) => header.trim());
  return records
    .slice(1)
    .filter((record) => record.some((entry) => String(entry || "").trim()))
    .map((record) => {
      const rowObject = {};
      for (const [index, header] of headers.entries()) rowObject[header] = record[index] || "";
      return rowObject;
    });
}

function hasSensitiveMarker(input) {
  return /postgres:\/\/|mysql:\/\/|mongodb:\/\/|AKIA[0-9A-Z_]{8,}|secret|password|passwd|access[_-]?key|\/var\/spool|\/usr\/bin\/lp/i.test(
    String(input || ""),
  );
}

function formatCommandResult(result) {
  return [
    `V1 field evidence intake apply: ${result.status.toUpperCase()}`,
    `Applied rows: ${result.summary?.appliedRowCount ?? 0}`,
    `Skipped rows: ${result.summary?.skippedRowCount ?? 0}`,
    `Invalid rows: ${result.summary?.invalidRowCount ?? 0}`,
    `Evidence: ${result.summary?.evidence || ""}`,
    result.files?.outputManifest ? `Output: ${result.files.outputManifest}` : "",
    "",
  ].join("\n");
}

function displayInputPath(path) {
  const relativePath = relative(process.cwd(), resolve(path));
  if (!relativePath.startsWith("..") && !relativePath.startsWith("/") && relativePath !== "") return relativePath;
  return `[external:${String(path).split(/[\\/]/).pop()}]`;
}
