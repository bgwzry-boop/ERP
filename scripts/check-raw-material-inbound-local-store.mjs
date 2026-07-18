import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRawMaterialInboundLocalStore,
  rawMaterialInboundStoreKey,
} from "../server/rawMaterialInboundLocalStore.mjs";

const repositorySource = readFileSync(new URL("../server/rawMaterialInboundRepository.mjs", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../server/rawMaterialInboundLocalStore.mjs", import.meta.url), "utf8");

assert.match(repositorySource, /from "\.\/rawMaterialInboundLocalStore\.mjs"/);
assert.ok(repositorySource.split("\n").length <= 2_100, "repository should delegate local persistence while retaining the bounded action state machine");
assert.ok(storeSource.split("\n").length < 90, "local store should stay independently reviewable");

const storageRoot = mkdtempSync(join(tmpdir(), "erp-raw-material-inbound-store-"));
try {
  const store = createRawMaterialInboundLocalStore({ storageRoot });
  const seed = [{ id: "RMI-LOCAL-001", supplierName: "供应商A", rolls: [{ id: "ROLL-001", weightKg: 10 }] }];
  const loadedSeed = store.load({ seedInbounds: seed });
  const filePath = join(storageRoot, rawMaterialInboundStoreKey);
  assert.equal(loadedSeed.rawMaterialInbounds[0].id, "RMI-LOCAL-001");
  assert.equal(existsSync(filePath), true, "first local load should persist the seeded state");

  store.save([{ id: "RMI-LOCAL-002", supplierName: "供应商B", rolls: [{ id: "ROLL-002", weightKg: 12 }] }]);
  assert.equal(store.load().rawMaterialInbounds[0].id, "RMI-LOCAL-002");
  assert.match(readFileSync(filePath, "utf8"), /"updatedAt"/);

  writeFileSync(filePath, "{not-json", "utf8");
  const fallback = store.load({ seedInbounds: seed });
  assert.equal(fallback.rawMaterialInbounds[0].id, "RMI-LOCAL-001", "invalid state should fall back to normalized seeds");
} finally {
  rmSync(storageRoot, { recursive: true, force: true });
}

console.log("Raw-material inbound local store checks passed: seed persistence, normalized reload, and corrupt-state fallback are isolated.");
