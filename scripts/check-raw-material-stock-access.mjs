import assert from "node:assert/strict";
import { projectRawMaterialRollReadAccess, projectRawMaterialStockInbound } from "../server/services/rawMaterialStockAccessProjectionService.mjs";
import { handleRawMaterialReadRoutes } from "../server/routes/rawMaterialReadRoutes.mjs";
import { handleRawMaterialWriteRoutes } from "../server/routes/rawMaterialWriteRoutes.mjs";
import { listOfficeRawMaterialStockInbounds } from "../src/services/officeRawMaterialStockApiClient.js";
import { findRawMaterialRollByScan, getRawMaterialScanOutboundBlocker } from "../src/domain/rawMaterialScanOutbound.js";
const inbound = {
  id: "I-1", revision: 3, supplierName: "供应商", factoryColor: "白色", widthCm: 70, gramWeightGsm: 78,
  unitPrice: 99, totalAmount: 1234, sourceAttachmentId: "PRIVATE-ATTACHMENT", sourceAttachmentIds: ["PRIVATE-ATTACHMENT"],
  ocrTables: [{ text: "PRIVATE-OCR" }], futurePrivateField: "PRIVATE-FUTURE",
  rolls: [{ id: "R-1", weightKg: 5, inventoryStatus: "可用", labelStatus: "已贴标/可用库存", unitPrice: 99, auditSecret: "PRIVATE-ROLL" }],
  rawMaterialIssueRecords: [{ issueRecordId: "ISS-1", rollId: "R-1", productionTaskId: "TASK-1", issuedWeightKg: 5, unitPrice: 99, secret: "PRIVATE-ISSUE" }],
};
const full = { items: [{ ...inbound.rolls[0], sourceInbound: inbound, supplier: inbound.supplierName, source: inbound.id }], page: 1, pageSize: 200, total: 1, summary: { available: { count: 1, weight: 5 } } };
const stock = projectRawMaterialRollReadAccess(full, { actionPermissions: ["raw_material.stock.read"] });
assert.equal(stock.projectionScope, "stock_only");
assert.equal(stock.items[0].sourceInbound.revision, 3);
assert.equal(JSON.stringify(stock).includes("PRIVATE"), false);
assert.equal(JSON.stringify(stock).includes("unitPrice"), false);
assert.equal(JSON.stringify(stock).includes("totalAmount"), false);
assert.equal(stock.items[0].sourceInbound.rawMaterialIssueRecords[0].productionTaskId, "TASK-1");
assert.equal(projectRawMaterialRollReadAccess(full, { actionPermissions: ["raw_material.inbound.read"] }), full);
assert.equal(JSON.stringify(projectRawMaterialStockInbound(inbound)).includes("PRIVATE"), false);
let payload;
await handleRawMaterialReadRoutes({ url: new URL("http://erp.test/api/raw-material-rolls"), workspace: { rawMaterialInboundRepository: { listRawMaterialRolls: async () => full } }, permissionContext: { actionPermissions: ["raw_material.stock.read"] }, sendJson: (_, code, result) => { assert.equal(code, 200); payload = result; } });
assert.equal(JSON.stringify(payload).includes("PRIVATE"), false);
await handleRawMaterialWriteRoutes({ method: "POST", url: new URL("http://erp.test/api/raw-material-inbounds/I-1/issue-to-machine"), workspace: {rawMaterialInboundRepository:{applyInboundAction:async()=>({inbound,operationLogId:"LOG-1"})}}, body: { expectedRevision: 3 }, permissionContext: { actionPermissions: ["raw_material.issue.create"] }, writeActionPermissions: { issueRawMaterialToMachine: "raw_material.issue.create" }, requireActionPermission: () => true, getPermissionOperatorId: () => "WORKER", rawMaterialCommandService: { recordInboundAction: async () => ({ inbound, operationLogId: "LOG-1" }) }, sendJson: (_, code, result) => { payload = result; }, sendNotFound: () => { throw new Error("route missing"); } });
assert.equal(payload.inbound.revision, 3);
assert.equal(JSON.stringify(payload).includes("PRIVATE"), false);
const safeInbound = projectRawMaterialStockInbound(inbound);
const pages = [Array.from({ length: 200 }, (_, i) => ({ ...stock.items[0], id: `ROLL-${i}`, sourceInbound: { ...safeInbound, rolls: [] } })), [{ ...stock.items[0], id: "ROLL-200", sourceInbound: { ...safeInbound, rolls: [] } }]];
let requests = 0;
const result = await listOfficeRawMaterialStockInbounds({}, { fetchImpl: async (url) => {
  requests += 1;
  assert.match(url, /raw-material-rolls/);
  assert.doesNotMatch(url, /raw-material-inbounds/);
  return new Response(JSON.stringify({ items: pages[Number(new URL(url).searchParams.get("page")) - 1], total: 201 }), { status: 200, headers: { "Content-Type": "application/json" } });
} });
assert.equal(requests, 2);
assert.equal(result.source, "api");
assert.equal(result.items[0].rolls.length, 201);
const match = findRawMaterialRollByScan(result.items, "ROLL-200");
assert.equal(match.inbound.revision, 3);
assert.equal(match.roll.weightKg, 5);
assert.equal(getRawMaterialScanOutboundBlocker(match), "");
const failed = await listOfficeRawMaterialStockInbounds({}, { fetchImpl: async () => new Response(JSON.stringify({ message: "forbidden" }), { status: 403 }) });
assert.equal(failed.blocked, true);
assert.deepEqual(failed.items, []);
const offline = await listOfficeRawMaterialStockInbounds({}, { fetchImpl: async () => { throw new Error("offline"); } });
assert.equal(offline.blocked, true);
assert.deepEqual(offline.items, []);
console.log("Stock-only access passed: explicit field allowlist on reads/writes, full receipt permission separation, complete paged scanner lookup and failure clearing.");
