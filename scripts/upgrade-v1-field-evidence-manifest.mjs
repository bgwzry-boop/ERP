#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildV1FieldEvidenceManifestTemplate,
  manifestSchema,
  requiredEvidenceGroupKeys,
  requiredSignoffRoles,
  serializeManifestJson,
  validateV1FieldEvidenceManifest,
} from "./v1FieldEvidenceManifest.mjs";

export const legacyManifestSchema = "erp-v1-field-evidence-manifest-v1";

const payrollAttendanceGroupKey = "payroll_attendance_pilot";
const knownItemStatuses = new Set(["pending", "passed", "accepted", "blocked", "not_applicable"]);
const knownSignoffStatuses = new Set(["pending", "signed", "accepted", "blocked"]);

if (isCli(import.meta.url)) runCli();

export function upgradeV1FieldEvidenceManifest(sourceManifest, options = {}) {
  assertLegacyManifestShape(sourceManifest);

  const upgradedAt = normalizeTimestamp(options.upgradedAt) || new Date().toISOString();
  const upgradedManifest = buildV1FieldEvidenceManifestTemplate();
  upgradedManifest.updatedAt = upgradedAt;
  upgradedManifest.environment = mergeKnownTextFields(upgradedManifest.environment, sourceManifest.environment);

  const sourceGroups = new Map(sourceManifest.evidenceGroups.map((group) => [group.key, group]));
  let preservedEvidenceItemCount = 0;
  let preservedCompletedEvidenceItemCount = 0;

  for (const targetGroup of upgradedManifest.evidenceGroups) {
    const sourceGroup = sourceGroups.get(targetGroup.key);
    if (!sourceGroup) continue;
    const sourceItems = new Map(sourceGroup.items.map((item) => [item.key, item]));
    for (const targetItem of targetGroup.items) {
      const sourceItem = sourceItems.get(targetItem.key);
      if (!sourceItem) continue;
      targetItem.status = knownItemStatuses.has(sourceItem.status) ? sourceItem.status : "pending";
      targetItem.evidenceRef = cleanText(sourceItem.evidenceRef);
      targetItem.notes = cleanText(sourceItem.notes);
      preservedEvidenceItemCount += 1;
      if (["passed", "accepted"].includes(targetItem.status) && targetItem.evidenceRef) {
        preservedCompletedEvidenceItemCount += 1;
      }
    }
  }

  const sourceSignoffCount = sourceManifest.signoffs.length;
  const sourceCompletedSignoffCount = sourceManifest.signoffs.filter((signoff) =>
    knownSignoffStatuses.has(signoff.status)
    && ["signed", "accepted"].includes(signoff.status)
    && cleanText(signoff.signer)
    && cleanText(signoff.signedAt)).length;

  const previousBoundaryStatus = cleanText(sourceManifest.v1V2BoundaryConfirmed?.status) || "pending";
  upgradedManifest.v1V2BoundaryConfirmed.status = "pending";
  upgradedManifest.v1V2BoundaryConfirmed.confirmedBy = "";
  upgradedManifest.v1V2BoundaryConfirmed.confirmedAt = "";

  const validation = validateV1FieldEvidenceManifest(upgradedManifest);
  if (!validation.schemaValid) {
    throw new Error("upgraded_manifest_failed_current_schema_validation");
  }

  const addedGroup = upgradedManifest.evidenceGroups.find((group) => group.key === payrollAttendanceGroupKey);
  return {
    manifest: upgradedManifest,
    result: {
      scope: "v1_field_evidence_manifest_upgrade",
      status: "upgraded",
      ready: validation.ready,
      sourceSchema: legacyManifestSchema,
      targetSchema: manifestSchema,
      summary: {
        preservedEvidenceItemCount,
        preservedCompletedEvidenceItemCount,
        addedEvidenceGroupCount: 1,
        addedEvidenceItemCount: addedGroup?.items?.length || 0,
        sourceSignoffCount,
        sourceCompletedSignoffCount,
        activeSignoffCount: 0,
        signoffConfirmationReset: sourceCompletedSignoffCount > 0,
        boundaryConfirmationReset: previousBoundaryStatus === "confirmed",
        requiredEvidenceItemCount: validation.summary.requiredEvidenceItemsTotal,
        completedEvidenceItemCount: validation.summary.requiredEvidenceItemsCompleted,
        requiredSignoffCount: validation.summary.requiredSignoffsTotal,
        completedSignoffCount: validation.summary.requiredSignoffsCompleted,
        blockingCount: validation.summary.blockingCount,
      },
      safeguards: {
        sourceManifestModified: false,
        sourceAndOutputMustDiffer: true,
        existingOutputOverwritten: false,
        evidenceRefsPrinted: false,
        signerNamesPrinted: false,
        addedEvidenceDefaultsPending: Boolean(
          addedGroup?.items?.every((item) => item.status === "pending" && !item.evidenceRef),
        ),
        expandedBoundaryRequiresReconfirmation: true,
        expandedScopeRequiresFreshSignoffs: true,
        possibleSensitiveEvidenceRefCount: validation.safeguards.possibleSensitiveEvidenceRefCount || 0,
      },
    },
  };
}

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const inputPath = resolve(options.input);
    const outputPath = resolve(options.output);
    if (inputPath === outputPath) throw new Error("input_and_output_must_differ");
    if (existsSync(outputPath)) throw new Error("output_already_exists");

    const sourceManifest = readJson(inputPath);
    const { manifest, result } = upgradeV1FieldEvidenceManifest(sourceManifest);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serializeManifestJson(manifest), { flag: "wx", mode: 0o600 });

    const commandResult = {
      ...result,
      outputWritten: true,
    };
    if (options.json) process.stdout.write(`${JSON.stringify(commandResult, null, 2)}\n`);
    else process.stdout.write(formatCommandResult(commandResult));
  } catch (error) {
    const message = error?.message || String(error);
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify({
        scope: "v1_field_evidence_manifest_upgrade",
        status: "error",
        ready: false,
        error: { code: safeErrorCode(message) },
      }, null, 2)}\n`);
    } else {
      process.stderr.write(`V1 field evidence manifest upgrade failed: ${safeErrorCode(message)}\n`);
    }
    process.exitCode = 1;
  }
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") {
      options.input = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      options.output = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    throw new Error("unknown_argument");
  }
  if (!options.input) throw new Error("input_required");
  if (!options.output) throw new Error("output_required");
  return options;
}

function helpText() {
  return [
    "Usage: node scripts/upgrade-v1-field-evidence-manifest.mjs --input <legacy-v1.json> --output <new-v2.json> [--json]",
    "",
    "The command preserves matching evidence and adds the required payroll/attendance group as pending.",
    "Because the V1 scope expanded, current signoffs and the V1/V2 boundary must be confirmed again in the v2 draft.",
    "It never edits the source, never overwrites an existing output, and never prints evidence refs or signer names.",
  ].join("\n");
}

function assertLegacyManifestShape(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("legacy_manifest_invalid");
  if (manifest.schema !== legacyManifestSchema) throw new Error("unsupported_source_schema");
  if (!Array.isArray(manifest.evidenceGroups) || !Array.isArray(manifest.signoffs)) {
    throw new Error("legacy_manifest_invalid");
  }
  const legacyGroupKeys = requiredEvidenceGroupKeys.filter((key) => key !== payrollAttendanceGroupKey);
  const sourceGroupKeys = new Set(manifest.evidenceGroups.map((group) => group?.key));
  if (legacyGroupKeys.some((key) => !sourceGroupKeys.has(key))) throw new Error("legacy_manifest_required_group_missing");
  if (manifest.evidenceGroups.some((group) => !Array.isArray(group?.items))) throw new Error("legacy_manifest_invalid");
  const sourceSignoffRoles = new Set(manifest.signoffs.map((signoff) => signoff?.role));
  if (requiredSignoffRoles.some((role) => !sourceSignoffRoles.has(role))) {
    throw new Error("legacy_manifest_required_signoff_missing");
  }
  if (!manifest.v1V2BoundaryConfirmed || typeof manifest.v1V2BoundaryConfirmed !== "object") {
    throw new Error("legacy_manifest_boundary_missing");
  }
}

function mergeKnownTextFields(target = {}, source = {}) {
  return Object.fromEntries(Object.keys(target).map((key) => [key, cleanText(source?.[key]) || target[key]]));
}

function normalizeTimestamp(value) {
  const text = cleanText(value);
  return text && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : "";
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readJson(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("input_not_readable_json");
  }
  return parsed;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name.slice(2)}_required`);
  return value;
}

function safeErrorCode(message) {
  const code = String(message || "upgrade_failed").trim();
  return /^[a-z0-9_-]{1,80}$/i.test(code) ? code : "upgrade_failed";
}

function formatCommandResult(result) {
  return [
    "V1 field evidence manifest upgrade: UPGRADED",
    `Schema: ${result.sourceSchema} -> ${result.targetSchema}`,
    `Evidence: preserved ${result.summary.preservedEvidenceItemCount}, added ${result.summary.addedEvidenceItemCount} pending`,
    `Signoffs: reset ${result.summary.sourceCompletedSignoffCount} completed legacy signoffs; current 0/${result.summary.requiredSignoffCount}`,
    `Current validation: ${result.ready ? "ready" : "blocked"}, blockers ${result.summary.blockingCount}`,
    "",
  ].join("\n");
}

function isCli(metaUrl) {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(metaUrl);
}
