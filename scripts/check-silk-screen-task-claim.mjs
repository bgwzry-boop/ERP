import assert from "node:assert/strict";
import { createLocalProductionPackingReadRepository } from "../server/productionPackingReadRepository.mjs";
import { createLocalProductionPackingTransactionRepository } from "../server/productionPackingTransactionRepository.mjs";
import { buildClaimSilkScreenTaskQuery, buildReleaseSilkScreenTaskQuery } from "../server/silkScreenTaskClaimRepository.mjs";
import { createSilkScreenTaskClaimService } from "../server/services/silkScreenTaskClaimService.mjs";
import { handleProductionReadRoutes } from "../server/routes/productionReadRoutes.mjs";
import { inkOrderGroup } from "../shared/silkScreenInkOrder.js";
import { listOfficeProductionTasks } from "../src/services/officeProductionPackingApiClient.js";

// 负责人 2026-11-04：丝印工自己领任务（先印白色，黑色和多色收尾）；领了显示“已被XX领取”，
// 还没开始做时本人或办公室（写原因）可以释放；两个人同时领只能一个成功。
assert.equal(inkOrderGroup({ printColor: "白" }).key, "white");
assert.equal(inkOrderGroup({ printColor: "红色" }).key, "single");
assert.equal(inkOrderGroup({ printColor: "黑" }).key, "black");
assert.equal(inkOrderGroup({ printColor: "红+黑" }).key, "multi");
assert.equal(inkOrderGroup({ printColor: "黑白" }).key, "multi");
assert.equal(inkOrderGroup({ printColor: "双色" }).key, "multi");
assert.equal(inkOrderGroup({ printColor: "白", printColorCount: 2 }).key, "multi");
assert.equal(inkOrderGroup({ printColor: "待确认" }).key, "unknown");

const workspace = {
  machines: [
    { id: "PRINT-01", machineType: "screen_printing", enabled: true, status: "active" },
    { id: "PRINT-02", machineType: "screen_printing", enabled: true, status: "active" },
    { id: "BAG-01", machineType: "bag_making", enabled: true, status: "active" },
  ],
  users: [
    { userId: "U-P1", displayName: "丝印甲", defaultMachineId: "PRINT-01" },
    { userId: "U-P2", displayName: "丝印乙", defaultMachineId: "PRINT-02" },
    { userId: "U-BAG", displayName: "制袋丙", defaultMachineId: "BAG-01" },
  ],
  employees: [],
  orderLines: [
    line("OL-BLACK", "黑", "2026-11-05T00:00:00.000Z"),
    line("OL-WHITE", "白", "2026-11-06T00:00:00.000Z"),
    line("OL-MULTI", "红、黑", "2026-11-04T00:00:00.000Z"),
    line("OL-RED", "红", "2026-11-07T00:00:00.000Z"),
    { ...line("OL-BAG", "", ""), print: "否" },
  ],
  productionTasks: [
    task("PT-BLACK", "OL-BLACK"),
    task("PT-WHITE", "OL-WHITE"),
    task("PT-MULTI", "OL-MULTI"),
    task("PT-RED", "OL-RED"),
    { ...task("PT-BAG", "OL-BAG"), taskType: "制袋" },
  ],
  workshopReports: [],
  operationLogs: [],
};
workspace.productionPackingReadRepository = createLocalProductionPackingReadRepository();
workspace.productionPackingTransactionRepository = createLocalProductionPackingTransactionRepository();
let logSeq = 0;
const service = createSilkScreenTaskClaimService({
  buildOperationLog: (_workspace, input) => ({ id: `LOG-${++logSeq}`, pageKey: "api", ...input }),
  now: () => new Date("2026-11-04T08:00:00.000Z"),
});
const worker = (userId) => ({
  user: { userId, displayName: workspace.users.find((user) => user.userId === userId).displayName },
  actionPermissions: ["production.read", "production.report.complete"],
});
const office = { user: { userId: "U-OFFICE-A", displayName: "办公室" }, actionPermissions: ["production.read", "production.read.all", "production.schedule.publish"] };

// The pool lists only unassigned 丝印 tasks, white first, multi-colour last.
let pool = await readPool(worker("U-P1"));
assert.deepEqual(pool.items.map((item) => item.productionTaskId), ["PT-WHITE", "PT-RED", "PT-BLACK", "PT-MULTI"]);
assert.deepEqual(pool.items.map((item) => item.inkGroupLabel), ["白色（先印）", "其他单色", "黑色（收尾）", "多色（收尾）"]);
assert.equal((await readPool(worker("U-BAG"))).status, 403, "a bag-making worker has no silk-screen pool");

// Claim: moves onto the claimer's machine and shows who took it.
const claimed = await service.claimTask({ workspace, productionTaskId: "PT-WHITE", body: { expectedRevision: 1, idempotencyKey: "claim-white-1" }, operatorId: "U-P1", permissionContext: worker("U-P1") });
assert.equal(claimed.error, undefined, claimed.message);
assert.equal(claimed.response.productionTask.machineId, "PRINT-01");
assert.equal(claimed.response.productionTask.taskStatus, "丝印已排产");
assert.equal(claimed.response.productionTask.claimedByName, "丝印甲");
assert.equal(claimed.response.productionTask.revision, 2);
assert.equal(claimed.response.orderLine.lineStatus, "丝印已排产");
assert.match(claimed.response.productionTask.publishedScheduleId, /^CLAIM-PRINT-01-PT-WHITE-/);
assert.equal(workspace.operationLogs[0].action, "claim_silk_screen_task");

// The same request replays; a second printer is told who has it.
const replay = await service.claimTask({ workspace, productionTaskId: "PT-WHITE", body: { expectedRevision: 1, idempotencyKey: "claim-white-1" }, operatorId: "U-P1", permissionContext: worker("U-P1") });
assert.equal(replay.error, true, "the service refuses before the repository once the task is visibly claimed");
const taken = await service.claimTask({ workspace, productionTaskId: "PT-WHITE", body: { expectedRevision: 2 }, operatorId: "U-P2", permissionContext: worker("U-P2") });
assert.equal(taken.code, "SILK_SCREEN_TASK_ALREADY_CLAIMED");
assert.equal(taken.message, "这个任务已被丝印甲领取。");

// Two printers press 领取 at the same moment on the same revision: exactly one wins.
const results = await Promise.all([
  service.claimTask({ workspace, productionTaskId: "PT-RED", body: { expectedRevision: 1 }, operatorId: "U-P1", permissionContext: worker("U-P1") }),
  service.claimTask({ workspace, productionTaskId: "PT-RED", body: { expectedRevision: 1 }, operatorId: "U-P2", permissionContext: worker("U-P2") }),
]);
assert.equal(results.filter((result) => result.response).length, 1);
const loser = results.find((result) => result.error);
assert.equal(loser.code, "SILK_SCREEN_TASK_ALREADY_CLAIMED");
assert.match(loser.message, /^这个任务刚被丝印[甲乙]领走了。$/);

// Pool now shows claims with their owner; the claimer's own view marks them as theirs.
pool = await readPool(worker("U-P1"));
const white = pool.items.find((item) => item.productionTaskId === "PT-WHITE");
assert.equal(white.productionTask.claimedByName, "丝印甲");
assert.equal(white.claimedByMe, true);
assert.equal((await readPool(worker("U-P2"))).items.find((item) => item.productionTaskId === "PT-WHITE").claimedByMe, false);

// Claims are only for silk-screen tasks and silk-screen machines.
assert.equal((await service.claimTask({ workspace, productionTaskId: "PT-BAG", body: { expectedRevision: 1 }, operatorId: "U-P1", permissionContext: worker("U-P1") })).code, "SILK_SCREEN_CLAIM_TASK_TYPE_INVALID");
assert.equal((await service.claimTask({ workspace, productionTaskId: "PT-BLACK", body: { expectedRevision: 1 }, operatorId: "U-BAG", permissionContext: worker("U-BAG") })).code, "SILK_SCREEN_CLAIM_MACHINE_REQUIRED");
assert.equal((await service.claimTask({ workspace, productionTaskId: "PT-BLACK", body: { expectedRevision: 9 }, operatorId: "U-P1", permissionContext: worker("U-P1") })).code, "BUSINESS_WRITE_CONFLICT");

// Release: another printer may not; the office must give a reason; the claimer may.
assert.equal((await service.releaseTask({ workspace, productionTaskId: "PT-WHITE", body: { expectedRevision: 2 }, operatorId: "U-P2", permissionContext: worker("U-P2") })).code, "SILK_SCREEN_RELEASE_SCOPE_DENIED");
assert.equal((await service.releaseTask({ workspace, productionTaskId: "PT-WHITE", body: { expectedRevision: 2 }, operatorId: "U-OFFICE-A", permissionContext: office })).code, "SILK_SCREEN_RELEASE_REASON_REQUIRED");
const released = await service.releaseTask({ workspace, productionTaskId: "PT-WHITE", body: { expectedRevision: 2 }, operatorId: "U-P1", permissionContext: worker("U-P1") });
assert.equal(released.error, undefined, released.message);
assert.deepEqual(
  [released.response.productionTask.taskStatus, released.response.productionTask.machineId, released.response.productionTask.claimedByUserId, released.response.orderLine.lineStatus],
  ["待排产", "", "", "待排产"],
);
assert.equal((await readPool(worker("U-P2"))).items.find((item) => item.productionTaskId === "PT-WHITE").productionTask.claimedByUserId, "");

// Office release of someone else's claim, with a reason.
const redOwner = results.find((result) => result.response).response.productionTask.claimedByUserId;
const officeRelease = await service.releaseTask({ workspace, productionTaskId: "PT-RED", body: { expectedRevision: 2, reason: "师傅请假" }, operatorId: "U-OFFICE-A", permissionContext: office });
assert.equal(officeRelease.error, undefined, officeRelease.message);
assert.equal(workspace.operationLogs[0].reason, "师傅请假");
assert.ok(redOwner);

// A started task cannot be released.
await service.claimTask({ workspace, productionTaskId: "PT-BLACK", body: { expectedRevision: 1 }, operatorId: "U-P1", permissionContext: worker("U-P1") });
workspace.workshopReports.push({ id: "WR-1", reportId: "WR-1", productionTaskId: "PT-BLACK", orderLineId: "OL-BLACK", processType: "丝印", qualifiedQty: 100, evidence: { reportKind: "daily_progress", carryOver: true } });
assert.equal((await service.releaseTask({ workspace, productionTaskId: "PT-BLACK", body: { expectedRevision: 2 }, operatorId: "U-P1", permissionContext: worker("U-P1") })).code, "SILK_SCREEN_TASK_ALREADY_STARTED");

// PostgreSQL statements carry the same guards inside the transaction.
const claimQuery = buildClaimSilkScreenTaskQuery({
  productionTask: { productionTaskId: "PT-1", orderLineId: "OL-1", taskType: "丝印", machineId: "PRINT-01", publishedScheduleId: "CLAIM-1", claimedByUserId: "U-P1", claimedByName: "丝印甲", claimedAt: "2026-11-04T08:00:00.000Z", revision: 1 },
  operationLog: { id: "LOG-PG-1", targetType: "production_task", targetId: "PT-1", action: "claim_silk_screen_task", operatorId: "U-P1" },
});
assert.match(claimQuery.text, /FOR UPDATE/);
assert.match(claimQuery.text, /claimed_by_user_id IS NULL/);
assert.match(claimQuery.text, /ERP_SILK_SCREEN_CLAIM_CONFLICT/);
assert.match(claimQuery.text, /machine_type = 'screen_printing'/);
const releaseQuery = buildReleaseSilkScreenTaskQuery({
  productionTask: { productionTaskId: "PT-1", orderLineId: "OL-1", taskType: "丝印", revision: 2 },
  claimedByUserId: "U-P1",
  operationLog: { id: "LOG-PG-2", targetType: "production_task", targetId: "PT-1", action: "release_silk_screen_task", operatorId: "U-P1" },
});
assert.match(releaseQuery.text, /NOT EXISTS \(\s*SELECT 1 FROM workshop_reports/);
assert.match(releaseQuery.text, /claimed_by_user_id = NULL/);

// The office/phone client keeps the claim on the task (the desktop shows it, the office releases it).
const listed = await listOfficeProductionTasks({ query: {} }, {
  apiBaseUrl: "http://erp.test/api",
  fetchImpl: async () => new Response(JSON.stringify({ items: [{ productionTaskId: "PT-1", orderLineId: "OL-1", productionTask: { productionTaskId: "PT-1", orderLineId: "OL-1", taskType: "丝印", claimedByUserId: "U-P1", claimedByName: "丝印甲", claimedAt: "2026-11-04T08:00:00.000Z" } }] }), { status: 200, headers: { "content-type": "application/json" } }),
});
assert.equal(listed.source, "api");
assert.deepEqual([listed.items[0].productionTask.claimedByUserId, listed.items[0].productionTask.claimedByName], ["U-P1", "丝印甲"]);

console.log("Silk-screen claims: pool by ink order, one winner per task, release by claimer or office with a reason, not after work started.");

function line(id, printColor, latestNeededAt) {
  return { id, orderLineId: id, orderId: `O-${id}`, customerId: "C1", orderType: "custom_print", print: "是", printColor, latestNeededAt, qty: 1000, lineStatus: "待排产", status: "待排产", revision: 1 };
}

function task(id, orderLineId) {
  return { id, productionTaskId: id, bizNo: id, orderLineId, taskType: "丝印", machineId: "", plannedQty: 1000, taskStatus: "待排产", status: "待排产", publishedScheduleId: "", revision: 1, createdAt: "2026-11-03T00:00:00.000Z" };
}

async function readPool(permissionContext) {
  let sent = null;
  await handleProductionReadRoutes({
    url: new URL("http://erp.test/api/production-schedules/silk-screen-pool"),
    response: {},
    workspace,
    sendJson: (_response, status, body) => { sent = { status, ...body }; },
    sendNotFound: () => { throw new Error("not found"); },
    buildProductionMachineQueueResponse: async () => ({ items: [] }),
    permissionContext,
  });
  return sent;
}
