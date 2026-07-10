#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  buildGeneratorSummary,
  buildV1FieldEvidenceChecklistMarkdown,
  buildV1FieldEvidenceManifestTemplate,
  serializeManifestJson,
} from "./v1FieldEvidenceManifest.mjs";

const defaultJsonPath = join("docs", "development", "v1-field-evidence-manifest.template.json");
const defaultMarkdownPath = join("docs", "development", "v1-field-evidence-checklist.zh-CN.md");

try {
  const options = parseArgs(process.argv.slice(2));
  const manifest = buildV1FieldEvidenceManifestTemplate();
  const manifestJson = serializeManifestJson(manifest);
  const checklistMarkdown = buildV1FieldEvidenceChecklistMarkdown(manifest);

  if (options.write) {
    writeText(options.outputJson, manifestJson);
    writeText(options.outputMarkdown, checklistMarkdown);
  }

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        buildGeneratorSummary({
          outputJsonPath: options.outputJson,
          outputMarkdownPath: options.outputMarkdown,
        }),
        null,
        2,
      )}\n`,
    );
  } else if (options.markdown) {
    process.stdout.write(checklistMarkdown);
  } else {
    process.stdout.write(manifestJson);
  }
} catch (error) {
  process.stderr.write(`V1 field evidence manifest generation failed: ${error?.message || error}\n`);
  process.exit(1);
}

function parseArgs(args) {
  const options = {
    outputJson: defaultJsonPath,
    outputMarkdown: defaultMarkdownPath,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--write") {
      options.write = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--markdown") {
      options.markdown = true;
      continue;
    }
    if (arg === "--output-json") {
      options.outputJson = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--output-markdown") {
      options.outputMarkdown = readValue(args, index, arg);
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
    "Usage: node scripts/generate-v1-field-evidence-manifest.mjs [options]",
    "",
    "Options:",
    "  --write                    Write JSON template and Markdown checklist.",
    "  --output-json <path>       JSON template path, default docs/development/v1-field-evidence-manifest.template.json",
    "  --output-markdown <path>   Markdown checklist path, default docs/development/v1-field-evidence-checklist.zh-CN.md",
    "  --markdown                 Print Markdown checklist instead of the JSON template.",
    "  --json                     Print a summary instead of template content.",
  ].join("\n");
}

function writeText(path, content) {
  const fullPath = resolve(path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}
