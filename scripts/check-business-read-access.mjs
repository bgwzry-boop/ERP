import assert from "node:assert/strict";
import { getEffectivePermissionsForRuntimeUser } from "../server/authSeed.mjs";
import { createRequestAuthorizationService } from "../server/services/requestAuthorizationService.mjs";
import { authorizeBusinessRead, authorizeProductionWriteScope, canReadOfficeProduction, getTrustedWorkerMachine } from "../server/services/businessReadAccessService.mjs";
import { handleProductionReadRoutes } from "../server/routes/productionReadRoutes.mjs";

let result;
const sendJson = (_response, status, body) => { result = { status, body }; };
const { requireAnyActionPermission } = createRequestAuthorizationService({ sendJson });
const context = (role, extra = {}) => getEffectivePermissionsForRuntimeUser({ userId: "U-1", roles: [role], defaultRole: role, enabled: true, loginEnabled: true, passwordHash: "fixture", passwordStatus: "active", ...extra });
for (const path of ["order-lines", "order-drafts", "production-tasks", "packing-tasks", "inventory/items", "statements", "fulfillments", "todos", "operation-logs", "raw-material-inbounds", "system/status"]) {
  assert.equal(authorizeBusinessRead({ url: new URL(`http://local/api/${path}`), permissionContext: context("driver"), requireAnyActionPermission, response: {} }), false, path);
  assert.equal(result.status, 403);
}
for (const [role, path] of [["office", "order-lines"], ["finance", "statements"], ["workshop", "production-tasks"], ["packing", "packing-tasks"], ["warehouse", "raw-material-rolls"]]) {
  assert.equal(authorizeBusinessRead({ url: new URL(`http://local/api/${path}`), permissionContext: context(role), requireAnyActionPermission, response: {} }), true, `${role}:${path}`);
}
assert.equal(authorizeBusinessRead({ url: new URL("http://local/api/order-lines"), permissionContext: context("office", { permissionDenylist: ["order.read"] }), requireAnyActionPermission, response: {} }), false);

const readOnlyOffice = context("office", { permissionDenylist: ["production.schedule.publish", "production.report.complete"] });
assert.equal(canReadOfficeProduction(readOnlyOffice), true, "Denying schedule publication must not remove office production reads");
assert.equal(canReadOfficeProduction(context("workshop")), false);
assert.equal(canReadOfficeProduction(context("office", { permissionDenylist: ["production.read.all"] })), false);

const worker = context("workshop", { employeeId: "E-1", defaultMachineId: "OLD" });
const task = (machineId) => ({ productionTaskId: machineId, productionTask: { machineId, publishedScheduleId: "S-1" }, orderLine: { id: "OL-1", qty: 100, amount: 999, debtAmount: 100 }, statement: { amount: 999 }, inventoryItem: { id: "I-1", availableQty: 123 } });
let receivedQuery;
const workspace = { users: [{ userId: "U-1", employeeId: "E-1", defaultMachineId: "OLD" }], employees: [{ employeeId: "E-1", defaultMachineId: "BAG-01" }], productionPackingReadRepository: {
  async listProductionTasks({ query }) { receivedQuery = query; return { items: [task("BAG-01")], total: 1 }; },
  async getProductionTaskDetail({ productionTaskId }) { return productionTaskId === "UNKNOWN" ? null : task(productionTaskId); },
} };
assert.equal(getTrustedWorkerMachine(workspace, worker), "BAG-01");
assert.equal(getTrustedWorkerMachine({ ...workspace, employees: [] }, worker), "");
const deps = { workspace, permissionContext: worker, response: {}, sendJson, sendNotFound: (_r, code) => { result = { status: 404, body: { code } }; } };
await handleProductionReadRoutes({ ...deps, url: new URL("http://local/api/production-tasks?machineId=OTHER&visibility=all") });
assert.equal(receivedQuery.get("machineId"), "BAG-01");
assert.equal(receivedQuery.get("visibility"), "workshop_mobile");
assert.equal(result.body.items[0].orderLine.amount, undefined);
assert.equal(result.body.items[0].statement, undefined);
assert.equal(result.body.items[0].inventoryItem.availableQty, undefined);
await handleProductionReadRoutes({ ...deps, url: new URL("http://local/api/production-tasks/OTHER") });
assert.equal(result.status, 404);
for (const id of ["OTHER", "UNKNOWN"]) for (const action of ["report-complete", "daily-progress", "exception", "finished-goods-photo"]) {
  assert.equal(await authorizeProductionWriteScope({ ...deps, url: new URL(`http://local/api/production-tasks/${id}/${action}`) }), false);
  assert.equal(result.status, 403);
}
assert.equal(await authorizeProductionWriteScope({ ...deps, url: new URL("http://local/api/production-tasks/BAG-01/report-complete") }), true);

await handleProductionReadRoutes({ ...deps, permissionContext: readOnlyOffice, url: new URL("http://local/api/production-tasks?machineId=OTHER") });
assert.equal(result.status, 200);
assert.equal(receivedQuery.get("machineId"), "OTHER");
assert.equal(receivedQuery.get("visibility"), null);
await handleProductionReadRoutes({ ...deps, permissionContext: readOnlyOffice, url: new URL("http://local/api/production-tasks/OTHER") });
assert.equal(result.status, 200);
const workerWithAllReads = context("workshop", { employeeId: "E-1", permissionAllowlist: ["production.read.all"] });
assert.equal(canReadOfficeProduction(workerWithAllReads), true);
assert.equal(await authorizeProductionWriteScope({ ...deps, permissionContext: workerWithAllReads, url: new URL("http://local/api/production-tasks/OTHER/report-complete") }), false);
assert.equal(result.status, 403, "Read-all must not grant cross-machine reporting");

workspace.productionPackingReadRepository.listPackingTasks = async () => ({items: [{packingTaskId: "PK-1", statement: {amount: 999}}]});
const officeWithoutProductionScope = context("office", {permissionDenylist: ["production.read.all"]});
await handleProductionReadRoutes({ ...deps, permissionContext: officeWithoutProductionScope, url: new URL("http://local/api/packing-tasks") });
assert.equal(result.body.items[0].statement.amount, 999, "Packing scope is independent of production scope");
const officeWithoutPackingScope = context("office", {permissionDenylist: ["packing.read.all"]});
await handleProductionReadRoutes({ ...deps, permissionContext: officeWithoutPackingScope, url: new URL("http://local/api/packing-tasks") });
assert.equal(result.body.items[0].statement, undefined, "Denying office packing projection must retain the operational projection only");
console.log("business read access checks passed: independent production/packing read scopes, write isolation, role gates, explicit deny, machine assignment and minimal fields");
