#!/usr/bin/env node

const args = process.argv.slice(2);
const printer = readArg(args, "--printer") || readArg(args, "-p");

if (args.includes("--fail")) {
  process.stderr.write("printer queue is unavailable\n");
  process.exit(4);
}

if (!printer) {
  process.stderr.write("printer is required\n");
  process.exit(2);
}

process.stdout.write(`printer ${printer} is idle. enabled since Sat Jul 04 10:00:00 2026\n`);

function readArg(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) return "";
  const next = argv[index + 1];
  if (!next || next.startsWith("--")) return "";
  return next;
}
