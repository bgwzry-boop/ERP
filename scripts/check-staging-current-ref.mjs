#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const expectedCommit = String(process.env.ERP_EXPECTED_STAGING_COMMIT || process.argv[2] || "").trim().toLowerCase();
if (!/^[a-f0-9]{40}$/.test(expectedCommit)) {
  console.error("Usage: ERP_EXPECTED_STAGING_COMMIT=<40-char commit> npm run review:staging-current:check");
  process.exit(2);
}

let remoteCommit = "";
try {
  const output = execFileSync(
    "git",
    ["ls-remote", "--heads", "origin", "refs/heads/codex/staging-current"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();
  remoteCommit = String(output.split(/\s+/)[0] || "").toLowerCase();
} catch {
  remoteCommit = "";
}

if (remoteCommit !== expectedCommit) {
  console.error("BLOCKED staging-current does not match the immutable deployed commit.");
  process.exit(2);
}

console.log(`PASS staging-current is the deployed immutable commit ${expectedCommit.slice(0, 12)}.`);
