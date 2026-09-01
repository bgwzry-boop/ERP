import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initialRawMaterialInbounds } from "../src/data/fixtures.js";
import {
  buildFindRawMaterialInboundPayloadQuery,
  buildInsertRawMaterialInboundDraftTransactionQuery,
  buildListRawMaterialInboundPayloadsQuery,
  buildUpsertRawMaterialInboundPayloadTransactionQuery,
} from "../server/rawMaterialInboundPostgresQueryBuilder.mjs";
import { buildListRawMaterialInboundPayloadsQuery as buildRepositoryListQuery } from "../server/rawMaterialInboundRepository.mjs";

const repositorySource = readFileSync(new URL("../server/rawMaterialInboundRepository.mjs", import.meta.url), "utf8");
const builderSource = readFileSync(
  new URL("../server/rawMaterialInboundPostgresQueryBuilder.mjs", import.meta.url),
  "utf8",
);

assert.match(repositorySource, /rawMaterialInboundPostgresQueryBuilder\.mjs/);
assert.ok(
  repositorySource.split("\n").length <= 2_100,
  "repository should keep PostgreSQL query construction delegated despite the bounded raw-material state machine",
);
assert.ok(builderSource.split("\n").length < 190, "query builder should stay independently reviewable");

const listQuery = buildListRawMaterialInboundPayloadsQuery({
  query: { keyword: "O'Brien", status: "已打印待贴标" },
});
assert.match(listQuery.text, /status = \$1::text/);
assert.match(listQuery.text, /payload_json::text ILIKE \$2::text/);
assert.ok(!listQuery.text.includes("O'Brien"));
assert.deepEqual(listQuery.values, ["已打印待贴标", "%O'Brien%"]);
assert.deepEqual(buildRepositoryListQuery({ query: { keyword: "白侯" } }), buildListRawMaterialInboundPayloadsQuery({
  query: { keyword: "白侯" },
}));

const findQuery = buildFindRawMaterialInboundPayloadQuery("RMI-O'BRIEN");
assert.match(findQuery.text, /WHERE id = \$1::text/);
assert.ok(!findQuery.text.includes("RMI-O'BRIEN"));
assert.deepEqual(findQuery.values, ["RMI-O'BRIEN"]);
assert.throws(() => buildFindRawMaterialInboundPayloadQuery(""), /raw material inbound id is required/);

const inbound = { ...initialRawMaterialInbounds[0], revision: 1, status: "已复核待打印标签" };
const operationLog = {
  id: "RMI-LOG-QUERY-001",
  targetType: "raw_material_inbound",
  targetId: inbound.id,
  action: "review",
  before: { status: "已识别待复核" },
  after: { status: "已复核待打印标签" },
  reason: "OCR review",
  operatorId: "U-OFFICE-A",
  pageKey: "raw-material-inbound",
  occurredAt: "2026-07-16T01:00:00.000Z",
  createdAt: "2026-07-16T01:00:00.000Z",
};
const insertQuery = buildInsertRawMaterialInboundDraftTransactionQuery(inbound, operationLog);
assert.match(insertQuery.text, /^BEGIN;/);
assert.match(insertQuery.text, /INSERT INTO raw_material_inbounds/);
assert.match(insertQuery.text, /INSERT INTO operation_logs/);
assert.match(insertQuery.text, /ERP_RAW_MATERIAL_INBOUND_ALREADY_EXISTS/);
assert.ok(!insertQuery.text.includes(inbound.id));
assert.ok(insertQuery.values.includes(inbound.id));

const updateQuery = buildUpsertRawMaterialInboundPayloadTransactionQuery(inbound, operationLog);
assert.match(updateQuery.text, /FOR UPDATE/);
assert.match(updateQuery.text, /revision = raw_material_inbounds\.revision \+ 1/);
assert.match(updateQuery.text, /jsonb_build_object\('revision', raw_material_inbounds\.revision\)/);
assert.doesNotMatch(updateQuery.text, /jsonb_build_object\('revision', revision\)/);
assert.match(updateQuery.text, /ERP_RAW_MATERIAL_INBOUND_CONCURRENCY_CONFLICT/);
assert.match(updateQuery.text, /INSERT INTO operation_logs/);
assert.ok(!updateQuery.text.includes("已复核待打印标签"));
assert.ok(updateQuery.values.includes("已复核待打印标签"));

console.log("Raw-material inbound PostgreSQL query builder checks passed: bound list/find SQL and transactional insert/update builders are isolated.");
