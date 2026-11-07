// 缺陷回归：两笔不同客户的识别都必须能落库，草稿明细主键不能跨草稿重复。
// 2026-11-07 现场实测：POST /api/order-drafts/recognize 返回 500
// duplicate key value violates unique constraint "order_draft_lines_pkey"
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { loadMigrationFiles, validateMigrationSet } from "./dbMigrationUtils.mjs";
import { postgresLiveBusinessSeedSql } from "./helpers/postgresLiveBusinessSeed.mjs";
import { createApiSharedServiceRegistry } from "../server/apiSharedServiceRegistry.mjs";
import { createPostgresOrderDraftRepository } from "../server/orderDraftRepository.mjs";
import { createPostgresCoreWorkspaceReadRepository } from "../server/coreWorkspaceReadRepository.mjs";
import { closeSharedPostgresPools } from "../server/postgresPoolClient.mjs";

const container = `erp-draft-line-id-${process.pid}-${Date.now()}`;
const docker = (args) => {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
};
let pool;
try {
  docker(["run", "--rm", "-d", "--name", container, "-p", "127.0.0.1::5432", "-e", "POSTGRES_DB=erp", "-e", "POSTGRES_USER=erp", "-e", "POSTGRES_PASSWORD=erp", "postgres:16-alpine"]);
  for (let attempt = 0; attempt < 60; attempt++) {
    if (spawnSync("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "erp"]).status === 0) break;
    if (attempt === 59) throw new Error("Disposable PostgreSQL startup timeout");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const port = Number(docker(["port", container, "5432/tcp"]).split(":").at(-1));
  const databaseUrl = `postgres://erp:erp@127.0.0.1:${port}/erp`;
  pool = new pg.Pool({ connectionString: databaseUrl });
  const migrations = loadMigrationFiles();
  validateMigrationSet(migrations);
  for (const migration of migrations) await pool.query(migration.sql);
  await pool.query(postgresLiveBusinessSeedSql);
  await pool.query("INSERT INTO users(id,login_name,display_name) VALUES ('U-LINEID','lineid.test','主键回归') ON CONFLICT (id) DO NOTHING");

  const operatorId = "U-LINEID";
  const state = await createPostgresCoreWorkspaceReadRepository({ databaseUrl }).loadState();
  const workspace = {
    ...state,
    orderDraftRepository: createPostgresOrderDraftRepository({ databaseUrl }),
  };
  const service = createApiSharedServiceRegistry().orderDraftCommandService;

  const recognize = (sourceText, idempotencyKey) => service.recognizeOrderDraft({
    workspace,
    operatorId,
    body: { sourceText, sourceMessages: [], sourceChannel: "manual", operatorId, idempotencyKey },
  });

  // 1. 第一笔：负责人实测的原样短写
  const first = await recognize("3037 红 500个", "line-id-check-first");
  assert.ok(first.response, `第一笔识别失败：${JSON.stringify(first)}`);
  assert.ok(first.response.lines.length >= 1, "第一笔应识别出明细");
  const firstIds = first.response.lines.map((line) => line.draftLineId ?? line.id);

  // 2. 第二笔：另一个客户、另一段原文，必须同样能落库
  const second = await recognize("张三服饰，30*38红500个明天下午自提", "line-id-check-second");
  assert.ok(second.response, `第二笔识别失败（跨草稿主键冲突）：${JSON.stringify(second)}`);
  const secondIds = second.response.lines.map((line) => line.draftLineId ?? line.id);
  assert.ok(secondIds.length >= 1, "第二笔应识别出明细");

  // 3. 两张草稿的明细主键必须互不相同
  const overlap = firstIds.filter((id) => secondIds.includes(id));
  assert.deepEqual(overlap, [], `两张草稿复用了同一个明细主键：${overlap.join(", ")}`);

  // 4. 同一草稿重复识别按幂等回放，不新增第二份明细
  const replay = await recognize("3037 红 500个", "line-id-check-first");
  assert.ok(replay.response, `幂等回放失败：${JSON.stringify(replay)}`);
  const lineCount = (await pool.query("SELECT COUNT(*)::int AS n FROM order_draft_lines")).rows[0].n;
  assert.equal(lineCount, firstIds.length + secondIds.length, "重复识别不应重复写入明细");

  // 5. 落库后的明细主键全局唯一，且编号能看出属于哪张草稿
  const persisted = (await pool.query("SELECT id, order_draft_id AS draft FROM order_draft_lines")).rows;
  assert.equal(new Set(persisted.map((line) => line.id)).size, persisted.length, "库里的明细主键必须唯一");
  for (const line of persisted) {
    assert.ok(line.id.includes(line.draft), `明细 ${line.id} 不属于草稿 ${line.draft}`);
  }

  console.log(`ok order-draft-line-id-uniqueness: ${firstIds.length} + ${secondIds.length} 条明细，跨草稿主键唯一`);
} finally {
  await closeSharedPostgresPools?.().catch(() => {});
  await pool?.end().catch(() => {});
  spawnSync("docker", ["rm", "-f", container], { encoding: "utf8" });
}
