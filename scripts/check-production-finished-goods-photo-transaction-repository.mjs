import assert from "node:assert/strict";
import {
  buildReviewPhotoTransactionQuery,
  buildUploadPhotoTransactionQuery,
} from "../server/productionFinishedGoodsPhotoTransactionRepository.mjs";

const now = "2026-07-11T04:00:00.000Z";
const common = {
  productionTask: {
    id: "PT-1",
    productionTaskId: "PT-1",
    orderLineId: "OL-1",
    revision: 2,
    finishedGoodsPhoto: { status: "待确认", attachmentId: "ATT-1", history: [] },
    updatedAt: now,
  },
  operationLog: {
    id: "LOG-1",
    targetType: "production_task",
    targetId: "PT-1",
    action: "upload_finished_goods_photo",
    before: {},
    after: {},
    reason: "upload",
    operatorId: "U-1",
    pageKey: "api",
    occurredAt: now,
    createdAt: now,
  },
};

const upload = buildUploadPhotoTransactionQuery(common);
assert.match(upload.text, /FOR UPDATE/);
assert.match(upload.text, /ERP_PRODUCTION_PHOTO_CONCURRENCY_CONFLICT/);
assert.match(upload.text, /finished_goods_photo/);
assert.match(upload.text, /INSERT INTO operation_logs/);

const todo = {
  id: "T-1",
  type: "待通知客户",
  ref: "OL-1",
  summary: "成品图已确认",
  status: "未处理",
  createdBy: "U-2",
  createdAt: now,
  updatedAt: now,
};
const review = buildReviewPhotoTransactionQuery({
  ...common,
  productionTask: { ...common.productionTask, revision: 3, finishedGoodsPhoto: { status: "已接受", attachmentId: "ATT-1" } },
  todos: [todo],
  todoEvents: [{ eventId: "TE-1", todoId: "T-1", eventType: "accepted", eventPayload: { todo }, operatorId: "U-2", occurredAt: now, createdAt: now }],
  operationLog: { ...common.operationLog, id: "LOG-2", action: "accept_finished_goods_photo" },
});
assert.match(review.text, /INSERT INTO todos/);
assert.match(review.text, /INSERT INTO todo_events/);
assert.match(review.text, /ON CONFLICT \(id\) DO UPDATE/);
assert.ok(review.values.includes("U-2"));
assert.ok(!review.text.includes("成品图已确认"), "todo values must use SQL parameters");

console.log("production finished-goods photo transaction repository checks passed");
