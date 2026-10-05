import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApiServer } from "../server/apiServer.mjs";
import { loadSeedWorkspace } from "../server/seedData.mjs";
import {
  loadOfficeSeedWorkspace,
  realSampleCoverageKeys,
} from "../server/seeds/officeSeedLoader.mjs";
import { loadSyntheticOfficeSeed } from "../server/seeds/syntheticOfficeSeed.mjs";
import {
  closeTestServer as close,
  getTestServerBaseUrl,
  listenTestServer as listen,
} from "./helpers/apiIntegrationTestHarness.mjs";

const defaultWorkspace = loadOfficeSeedWorkspace();
assert.equal(defaultWorkspace.seedDataset?.source, "synthetic");
assert.equal(defaultWorkspace.seedDataset?.datasetId, "p0-synthetic-fixtures");
assert.throws(
  () => loadOfficeSeedWorkspace({ source: "unknown" }),
  (error) => error?.code === "ERP_OFFICE_SEED_SOURCE_INVALID",
);

const root = mkdtempSync(join(tmpdir(), "erp-real-sample-seed-"));
const privateFile = join(root, "real-sample.json");
try {
  const validPayload = createValidPayload();
  writePrivateJson(privateFile, validPayload);

  const realWorkspace = loadOfficeSeedWorkspace({
    source: "real-sample",
    realSampleSeedFile: privateFile,
    runtimeMode: "test",
  });
  assert.equal(realWorkspace.seedDataset?.source, "real_sample");
  assert.equal(realWorkspace.seedDataset?.datasetId, "real-sample-check-001");
  assert.equal(realWorkspace.seedDataset?.caseCount, 20);
  assert.equal(realWorkspace.scenario.id, "real-sample-check");
  assert.notEqual(realWorkspace.customers, validPayload.workspace.customers);
  assert.equal(loadSeedWorkspace({ source: "real_sample", realSampleSeedFile: privateFile, runtimeMode: "test" }).seedDataset?.source, "real_sample");

  const server = createApiServer({ allowLocalFixture: true,
    runtimeMode: "test",
    seedSource: "real_sample",
    realSampleSeedFile: privateFile,
  });
  try {
    await listen(server);
    await server.ready;
    const response = await fetch(`${getTestServerBaseUrl(server)}/api/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).seed.scenarioId, "real-sample-check");
  } finally {
    await close(server);
  }

  chmodSync(privateFile, 0o644);
  assert.throws(
    () => loadOfficeSeedWorkspace({ source: "real_sample", realSampleSeedFile: privateFile, runtimeMode: "test" }),
    (error) => error?.code === "ERP_REAL_SAMPLE_SEED_FILE_NOT_PRIVATE",
  );
  writePrivateJson(privateFile, validPayload);

  const identifierPayload = createValidPayload();
  identifierPayload.cases[0].messages[0].text = "请联系 13812345678";
  writePrivateJson(privateFile, identifierPayload);
  assert.throws(
    () => loadOfficeSeedWorkspace({ source: "real_sample", realSampleSeedFile: privateFile, runtimeMode: "test" }),
    (error) => error?.code === "ERP_REAL_SAMPLE_SEED_IDENTIFIER_DETECTED" && !/13812345678/.test(error.message),
  );
  writePrivateJson(privateFile, validPayload);

  const incompletePayload = createValidPayload();
  incompletePayload.cases[0].coverage = [];
  writePrivateJson(privateFile, incompletePayload);
  assert.throws(
    () => loadOfficeSeedWorkspace({ source: "real_sample", realSampleSeedFile: privateFile, runtimeMode: "test" }),
    (error) => error?.code === "ERP_REAL_SAMPLE_SEED_CASE_INVALID",
  );
  writePrivateJson(privateFile, validPayload);

  assert.throws(
    () => loadOfficeSeedWorkspace({ source: "real_sample", realSampleSeedFile: privateFile, runtimeMode: "production" }),
    (error) => error?.code === "ERP_PRODUCTION_SEED_NOT_ALLOWED",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(
  "Office seed loader checks passed: default synthetic mode, private real-sample switching, schema/coverage/identifier guards, API selection, and production isolation are covered.",
);

function createValidPayload() {
  const workspace = sanitizeWorkspace(loadSyntheticOfficeSeed());
  workspace.scenario = { ...workspace.scenario, id: "real-sample-check", label: "匿名样例验证" };
  return {
    schemaVersion: "erp-real-sample-office-seed-v1",
    sourceKind: "confirmed_anonymized_real_sample",
    datasetId: "real-sample-check-001",
    cases: Array.from({ length: 20 }, (_, index) => ({
      id: `CASE-${String(index + 1).padStart(3, "0")}`,
      coverage: [realSampleCoverageKeys[index % realSampleCoverageKeys.length]],
      messages: [
        {
          id: `MSG-${String(index + 1).padStart(3, "0")}`,
          senderRole: index % 2 === 0 ? "customer" : "office",
          sentAt: `2026-07-12 ${String(9 + (index % 8)).padStart(2, "0")}:00`,
          text: `匿名样例消息 ${index + 1}`,
        },
      ],
    })),
    workspace,
  };
}

function sanitizeWorkspace(workspace) {
  return JSON.parse(
    JSON.stringify(workspace)
      .replaceAll("张三服饰", "匿名客户一")
      .replaceAll("美的空调", "定制袋")
      .replaceAll("白鲸自营店", "匿名客户二")
      .replaceAll("张三", "联系人甲"),
  );
}

function writePrivateJson(file, value) {
  writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
  chmodSync(file, 0o600);
}
