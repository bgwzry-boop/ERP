import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { listCheckGroups, resolveCheckGroup } from "./check-group-manifest.mjs";

export function runCheckGroup({ groupName, dryRun = false, json = false } = {}) {
  let scripts;
  try {
    scripts = resolveCheckGroup(groupName);
  } catch (error) {
    const message = `${error.message}. Available groups: ${listCheckGroups().join(", ")}`;
    if (json) {
      process.stdout.write(`${JSON.stringify({ ok: false, group: groupName, error: message })}\n`);
    } else {
      process.stderr.write(`${message}\n`);
    }
    return 2;
  }

  if (dryRun) {
    const summary = { ok: true, dryRun: true, group: groupName, count: scripts.length, scripts };
    process.stdout.write(json ? `${JSON.stringify(summary)}\n` : `${scripts.join("\n")}\n`);
    return 0;
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const startedAt = Date.now();
  for (const [index, scriptName] of scripts.entries()) {
    process.stdout.write(`\n[check-group:${groupName}] ${index + 1}/${scripts.length} npm run ${scriptName}\n`);
    const result = spawnSync(npmCommand, ["run", scriptName], {
      env: process.env,
      stdio: "inherit",
    });
    if (result.error || result.status !== 0) {
      const reason = result.error?.message ?? `exit ${result.status ?? "unknown"}${result.signal ? ` / signal ${result.signal}` : ""}`;
      process.stderr.write(`\n[check-group:${groupName}] FAILED at ${index + 1}/${scripts.length}: ${scriptName} (${reason})\n`);
      return result.status || 1;
    }
  }

  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  process.stdout.write(`\n[check-group:${groupName}] PASSED ${scripts.length}/${scripts.length} in ${durationSeconds}s\n`);
  return 0;
}

function parseCliArgs(args) {
  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const positional = args.filter((arg) => !arg.startsWith("--"));
  return {
    groupName: positional[0],
    dryRun: flags.has("--dry-run"),
    json: flags.has("--json"),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCheckGroup(parseCliArgs(process.argv.slice(2)));
}
