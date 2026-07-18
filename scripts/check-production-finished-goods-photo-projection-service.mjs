import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createProductionFinishedGoodsPhotoProjectionService } from "../server/services/productionFinishedGoodsPhotoProjectionService.mjs";

const buildCalls = [];
assert.throws(
  () => createProductionFinishedGoodsPhotoProjectionService(),
  /buildTodo must be a function/,
);
const service = createProductionFinishedGoodsPhotoProjectionService({
  buildTodo(workspace, input) {
    buildCalls.push({ workspace, input: structuredClone(input) });
    return { ...input, status: input.status ?? "未处理", handled: input.handled ?? false };
  },
});
const orderLine = {
  orderLineId: "OL-1",
  customer_id: "C-1",
  productName: "定制袋",
  orderType: "定制印刷",
  size: "35*41",
  color: "白色",
  handle: "加长提",
  handleColor: "黑色",
  print: true,
  printColor: "黑色",
  printSide: "double",
  quantity: "1200",
  note: "提手颜色更换",
  fulfillment_method: "express_ltl",
  latest_needed_at: "2026-07-15T10:00:00.000Z",
};
const productionTask = {
  productionTaskId: "PT-1",
  order_line_id: "OL-1",
  finished_goods_photo_file_name: "成品图-白印黑.jpg",
  finishedGoodsPhoto: {
    status: "已接受",
    required: true,
    attachment_id: "ATT-1",
    uploaded_at: "2026-07-14T06:00:00.000Z",
    uploaded_by: "U-WORKSHOP",
    history: [
      {
        status: "待确认",
        attachment_id: "ATT-1",
        file_name: "初拍.jpg",
        uploaded_at: "2026-07-14T06:00:00.000Z",
        uploaded_by: "U-WORKSHOP",
        remark: "车间首拍",
      },
      { status: "", attachment_id: "" },
    ],
  },
};
const workspace = {
  customers: [{ id: "C-1", name: "白鲸自营店", contact: "张经理" }],
  attachments: [{ attachmentId: "ATT-1", fileName: "仓储成品图.jpg" }],
  todos: [
    {
      todoId: "T-EXISTING",
      type: "待通知客户",
      refId: "OL-1",
      status: "未处理",
      notificationChannel: "企业微信",
      createdBy: "U-OFFICE-OLD",
    },
  ],
};
const before = structuredClone({ workspace, orderLine, productionTask });

const summary = service.buildPhotoSummary(workspace, productionTask, orderLine);
assert.equal(summary.status, "已接受");
assert.equal(summary.required, true);
assert.equal(summary.attachmentId, "ATT-1");
assert.equal(summary.fileName, "成品图-白印黑.jpg");
assert.equal(summary.uploadedAt, "2026-07-14T06:00:00.000Z");
assert.equal(summary.uploadedBy, "U-WORKSHOP");
assert.equal(summary.history.length, 1, "nested finished-goods photo history must be preserved");
assert.equal(summary.history[0].reason, "车间首拍");

const notification = service.buildCustomerNotificationTodo(
  workspace,
  orderLine,
  productionTask,
  "U-OFFICE",
  "T-NEW",
);
assert.equal(notification.id, "T-EXISTING", "open legacy refId todo should be reused");
assert.equal(notification.ref, "OL-1");
assert.equal(notification.refType, "order_line");
assert.equal(notification.notificationChannel, "企业微信");
assert.equal(notification.createdBy, "U-OFFICE-OLD");
assert.match(notification.notificationCopyText, /白印黑 \/ 白袋黑提 \/ 双面 \/ 1200个/);
assert.match(notification.notificationCopyText, /按原来的快递快运方式继续安排/);
assert.doesNotMatch(notification.notificationCopyText, /\b(?:express_ltl|double|single|pickup|delivery)\b/);
assert.equal(notification.photoPrompt, "发送客户通知时请附上已复核成品图：成品图-白印黑.jpg。");

const retake = service.buildPhotoRetakeTodo(
  { ...workspace, todos: [] },
  orderLine,
  productionTask,
  "袋口没有拍全",
  "U-OFFICE",
  "T-RETAKE",
);
assert.equal(retake.id, "T-RETAKE");
assert.equal(retake.type, "成品图需重拍");
assert.match(retake.summary, /袋口没有拍全/);
assert.equal(retake.urgency, "异常");

assert.equal(service.normalizeReviewStatus("accepted"), "已接受");
assert.equal(service.normalizeReviewStatus("retake_required"), "需重拍");
assert.equal(service.normalizeReviewStatus("unknown"), "");
assert.equal(service.isPhotoRequired({ order_type: "定制印刷" }), true);
assert.equal(service.isPhotoRequired({ print_flag: true }), true);
assert.equal(service.isPhotoRequired({ order_type: "现货" }), false);
assert.equal(buildCalls.length, 2);
assert.deepEqual({ workspace, orderLine, productionTask }, before, "projection service must not mutate inputs");

const nestedOnly = service.buildPhotoSummary(null, {
  finishedGoodsPhoto: {
    attachmentId: "ATT-NESTED",
    fileName: "nested.jpg",
    reviewedAt: "2026-07-14T07:00:00.000Z",
  },
});
assert.equal(nestedOnly.fileName, "nested.jpg");
assert.equal(nestedOnly.reviewedAt, "2026-07-14T07:00:00.000Z");

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url), "utf8");
assert.match(registrySource, /createProductionFinishedGoodsPhotoProjectionService/);
assert.match(registrySource, /productionFinishedGoodsPhotoProjectionService\.buildPhotoSummary/);
assert.match(registrySource, /productionFinishedGoodsPhotoProjectionService\.buildCustomerNotificationTodo/);
for (const oldHelper of [
  "function buildFinishedGoodsPhotoSummary",
  "function normalizeFinishedGoodsPhotoHistory",
  "function isFinishedGoodsPhotoRequired",
  "function normalizeFinishedGoodsPhotoReviewStatus",
  "function buildFinishedGoodsCustomerNotificationTodo",
  "function buildFinishedGoodsCustomerNotificationText",
  "function buildFinishedGoodsNotificationGoods",
  "function buildFinishedGoodsPhotoPrompt",
  "function buildFinishedGoodsPhotoRetakeTodo",
  "function findOpenTodoByTypeAndRef",
]) {
  assert.equal(apiSource.includes(oldHelper), false, `${oldHelper} should not remain in the API composition root`);
}

console.log(
  "Production finished-goods photo projection checks passed: nested history, legacy aliases, todo reuse, factory shorthand, Chinese customer copy, and thin API wiring are covered.",
);
