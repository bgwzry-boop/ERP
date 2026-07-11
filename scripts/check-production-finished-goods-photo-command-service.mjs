import assert from "node:assert/strict";
import { createLocalProductionFinishedGoodsPhotoTransactionRepository } from "../server/productionFinishedGoodsPhotoTransactionRepository.mjs";
import { createProductionFinishedGoodsPhotoCommandService } from "../server/services/productionFinishedGoodsPhotoCommandService.mjs";

const now = new Date("2026-07-11T04:00:00.000Z");
const workspace = {
  productionTasks: [{ id: "PT-1", productionTaskId: "PT-1", orderLineId: "OL-1", revision: 1 }],
  orderLines: [{ id: "OL-1", customerId: "C-1", productName: "定制袋", size: "30*38", orderType: "定制印刷" }],
  attachments: [{ attachmentId: "ATT-1", fileName: "finished.png" }],
  todos: [],
  todoEvents: [],
  operationLogs: [],
  productionFinishedGoodsPhotoTransactionRepository: createLocalProductionFinishedGoodsPhotoTransactionRepository(),
};

const service = createProductionFinishedGoodsPhotoCommandService({
  now: () => now,
  buildOperationLog(current, input) {
    return { ...input, before: input.before, after: input.after, pageKey: "api", occurredAt: now.toISOString(), createdAt: now.toISOString() };
  },
  buildPhotoSummary(current, task) {
    return task.finishedGoodsPhoto ?? { status: "未上传", required: true, attachmentId: "", history: [] };
  },
  buildCustomerNotificationTodo(current, line, task, operatorId, todoId) {
    return {
      id: todoId,
      type: "待通知客户",
      ref: line.id,
      summary: "成品图已确认",
      status: "未处理",
      handled: false,
      priority: "待处理",
      createdBy: operatorId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  },
  buildPhotoRetakeTodo(current, line, task, reason, operatorId, todoId) {
    return { id: todoId, type: "成品图需重拍", ref: line.id, summary: reason, handled: false, createdBy: operatorId };
  },
  findAttachment(current, id) {
    return current.attachments.find((item) => item.attachmentId === id);
  },
  findOrderLine(current, id) {
    return current.orderLines.find((item) => item.id === id);
  },
  normalizeHistory(value) {
    return Array.isArray(value) ? value : [];
  },
  normalizeReviewStatus(value) {
    return value === "已接受" ? "已接受" : value === "需重拍" ? "需重拍" : "";
  },
});

const uploaded = await service.uploadPhoto({
  workspace,
  productionTaskId: "PT-1",
  body: { attachmentId: "ATT-1", operatorId: "U-SPOOFED", idempotencyKey: "photo-upload-test-001" },
  operatorId: "U-WORKSHOP",
});
assert.equal(uploaded.productionTask.finishedGoodsPhoto.status, "待确认");
assert.equal(uploaded.productionTask.finishedGoodsPhoto.uploadedBy, "U-WORKSHOP");
assert.equal(uploaded.productionTask.revision, 2);
assert.equal(workspace.operationLogs[0].operatorId, "U-WORKSHOP");

const reviewed = await service.reviewPhoto({
  workspace,
  productionTaskId: "PT-1",
  body: { reviewStatus: "已接受", operatorId: "U-SPOOFED", idempotencyKey: "photo-review-test-001" },
  operatorId: "U-OFFICE",
});
assert.equal(reviewed.productionTask.finishedGoodsPhoto.status, "已接受");
assert.equal(reviewed.productionTask.finishedGoodsPhoto.reviewedBy, "U-OFFICE");
assert.equal(reviewed.todo.type, "待通知客户");
assert.equal(reviewed.todo.createdBy, "U-OFFICE");
assert.equal(workspace.todoEvents[0].eventType, "todo_source:finished_goods_photo_accepted");
assert.equal(workspace.operationLogs[0].action, "accept_finished_goods_photo");

console.log("production finished-goods photo command service checks passed");
