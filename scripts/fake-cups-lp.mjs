#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const printer = readArg(args, "--printer") || readArg(args, "-d");
const title = readArg(args, "--job-title") || readArg(args, "-t") || "ERP print job";
const outputFile = readArg(args, "--output-json");
const printFile = args.find((arg) => !String(arg).startsWith("-") && existsSync(arg));

if (!printer) {
  process.stderr.write("printer is required\n");
  process.exit(2);
}
if (!printFile) {
  process.stderr.write("print file is required\n");
  process.exit(3);
}

const content = readFileSync(printFile, "utf8");
if (!content.trim()) {
  process.stderr.write("print file is empty\n");
  process.exit(4);
}

const cupsJobId = `${safePrinter(printer)}-101`;
if (outputFile) {
  writeFileSync(outputFile, `${JSON.stringify({ cupsJobId, printer, title, bytes: Buffer.byteLength(content) })}\n`, "utf8");
}

process.stdout.write(`request id is ${cupsJobId} (1 file(s))\n`);

function readArg(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) return "";
  const next = argv[index + 1];
  if (!next || next.startsWith("--")) return "";
  return next;
}

function safePrinter(value) {
  return String(value ?? "").replace(/[^A-Za-z0-9_.-]/g, "_") || "printer";
}
