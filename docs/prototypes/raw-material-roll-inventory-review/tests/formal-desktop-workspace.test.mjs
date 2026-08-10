import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("desktop workbenches consume formal APIs without fixture fallbacks", async () => {
  const [appSource, workspacesSource, adapterSource] = await Promise.all([
    readSource("../src/App.jsx"),
    readSource("../src/BusinessWorkspaces.jsx"),
    readSource("../src/useFormalDesktopWorkspace.js"),
  ]);

  for (const source of [appSource, workspacesSource, adapterSource]) {
    assert.doesNotMatch(source, /src\/data\/fixtures/, "desktop review must not import the ERP fixture catalog");
    assert.doesNotMatch(source, /createDemo|1500米|评审原型|本地交互|本地校验/, "desktop review must not restore demo-only writes or copy");
  }

  for (const client of [
    "listOfficeTodos",
    "listOfficeDraftQueue",
    "listOfficeOrderLines",
    "listOfficeInventoryItems",
    "listOfficeRawMaterialInbounds",
    "listOfficeProductionTasks",
    "listOfficePackingTasks",
    "listOfficePrintJobs",
  ]) {
    assert.ok(adapterSource.includes(client), `formal desktop adapter should read ${client}`);
  }

  assert.match(adapterSource, /serverRequired:\s*true/, "formal reads must fail closed instead of silently using demo data");
  assert.match(adapterSource, /prepareRawMaterialDeliveryNoteFile/, "desktop OCR upload should retain source normalization and rotation evidence");
  assert.match(adapterSource, /recognizeOfficeRawMaterialDeliveryNote/, "desktop OCR upload should call the formal server action");
  assert.match(adapterSource, /updateOfficeRawMaterialInboundAction/, "raw-material review actions should persist through the formal API");
});

test("supplier statement identifiers use collision-resistant entropy", async () => {
  const repositorySource = await readSource("../../../../server/rawMaterialSupplierStatementReviewRepository.mjs");

  assert.match(repositorySource, /import \{ randomUUID \} from "node:crypto"/, "repository should use cryptographic UUID entropy");
  assert.match(repositorySource, /createCollisionResistantId\("RMSR"/, "review IDs should use the collision-resistant builder");
  assert.match(repositorySource, /createCollisionResistantId\("RMSRC"/, "confirmation IDs should use the collision-resistant builder");
  assert.match(repositorySource, /createCollisionResistantId\("RMSP"/, "payable IDs should use the collision-resistant builder");
  assert.match(repositorySource, /createCollisionResistantId\("RMSPAY"/, "payment IDs should use the collision-resistant builder");
});
