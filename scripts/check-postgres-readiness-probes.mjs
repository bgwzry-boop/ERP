// 防止 PostgreSQL 测试启动竞态回归。
//
// 官方 postgres 镜像初始化时会先启动一个只监听 Unix socket 的临时实例，跑完初始化脚本后关掉再启动正式实例。
// 如果用 socket 方式的 pg_isready 判断就绪，可能恰好碰到临时实例，随后在重启间隙连接失败
// （CI 报错：connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed）。
// 临时实例不监听 TCP，所以 pg_isready 必须带 -h 127.0.0.1。

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const self = fileURLToPath(import.meta.url);

function listScripts(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : listScripts(full);
    return /\.(m?js)$/.test(entry.name) && full !== self ? [full] : [];
  });
}

const offenders = [];
let probes = 0;
for (const file of [...listScripts(join(repoRoot, "scripts")), ...listScripts(join(repoRoot, "server"))]) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/["']pg_isready["']/g)) {
    probes += 1;
    // 参数可能写成多行数组，取调用后一小段判断。
    const window = source.slice(match.index, match.index + 240);
    if (!/["'](?:-h|--host)["']\s*,\s*["']127\.0\.0\.1["']/.test(window)) {
      const line = source.slice(0, match.index).split("\n").length;
      offenders.push(`${relative(repoRoot, file)}:${line}`);
    }
  }
}

assert.ok(probes > 0, "expected to find pg_isready probes in scripts/");
assert.deepEqual(offenders, [], `pg_isready must probe over TCP (-h 127.0.0.1) to avoid the init-restart race:\n  ${offenders.join("\n  ")}`);
console.log(`PostgreSQL readiness probes check passed: ${probes} pg_isready probes all wait for the TCP listener.`);
