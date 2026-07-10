#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateV1FieldEvidenceManifest } from "./v1FieldEvidenceManifest.mjs";

const defaultManifestPath = join("docs", "development", "v1-field-evidence-manifest.template.json");

try {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = resolve(options.manifest || defaultManifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const report = validateV1FieldEvidenceManifest(manifest);
  const commandResult = {
    ...report,
    manifestPath,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(commandResult, null, 2)}\n`);
  } else {
    process.stdout.write(formatCommandResult(commandResult));
  }

  if (!report.schemaValid) process.exit(1);
  process.exit(report.ready || options.allowBlockedExitZero ? 0 : 2);
} catch (error) {
  const message = error?.message || String(error);
  if (process.argv.includes("--json")) {
    process.stdout.write(
      `${JSON.stringify(
        {
          scope: "v1_field_evidence_manifest_validation",
          status: "error",
          ready: false,
          schemaValid: false,
          error: { message },
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stderr.write(`V1 field evidence manifest validation failed: ${message}\n`);
  }
  process.exit(1);
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--manifest") {
      options.manifest = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--allow-blocked-exit-zero") {
      options.allowBlockedExitZero = true;
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
    "Usage: node scripts/validate-v1-field-evidence-manifest.mjs [options]",
    "",
    "Options:",
    "  --manifest <path>          Filled manifest path, default docs/development/v1-field-evidence-manifest.template.json",
    "  --allow-blocked-exit-zero  Print a blocked report but exit 0 for archival workflows",
    "  --json                     Print machine-readable validation result",
    "",
    "Exit codes:",
    "  0  Manifest is ready, or --allow-blocked-exit-zero was used",
    "  1  Manifest cannot be read or does not match the expected schema",
    "  2  Manifest is readable but V1 evidence remains blocked",
  ].join("\n");
}

function formatCommandResult(report) {
  const lines = [
    `V1 field evidence manifest: ${report.status.toUpperCase()}`,
    `Summary: ${report.summary?.label || ""}`,
    `Manifest: ${report.manifestPath}`,
    "",
  ];

  if (!report.schemaValid) {
    lines.push("Schema errors:");
    for (const error of report.schemaErrors || []) lines.push(`- ${error}`);
    return `${lines.join("\n")}\n`;
  }

  lines.push("Groups:");
  for (const group of report.groups || []) {
    lines.push(
      `- ${group.label}: ${group.status}, required ${group.completedRequired}/${group.requiredTotal}, blocked ${group.blockedRequired}`,
    );
  }
  lines.push("");
  lines.push("Signoffs:");
  for (const signoff of report.signoffs || []) {
    lines.push(`- ${signoff.role}: ${signoff.blocking ? "blocked" : "ready"}, status=${signoff.status}`);
  }
  lines.push("");
  lines.push(`V1/V2 boundary: ${report.boundary?.blocking ? "blocked" : "ready"}, status=${report.boundary?.status || ""}`);

  if (report.blockers?.length) {
    lines.push("");
    lines.push("Blocking items:");
    for (const blocker of report.blockers) {
      const prefix = blocker.groupLabel ? `${blocker.groupLabel} / ` : "";
      lines.push(`- ${prefix}${blocker.label}: ${blocker.status || "invalid"} (${blocker.reason})`);
    }
  }

  lines.push("");
  lines.push(
    `Safeguards: evidenceRefsRedacted=${Boolean(report.safeguards?.evidenceRefsRedacted)}, possibleSensitiveEvidenceRefCount=${report.safeguards?.possibleSensitiveEvidenceRefCount || 0}`,
  );
  return `${lines.join("\n")}\n`;
}
