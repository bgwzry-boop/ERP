import { createHash, randomUUID } from "node:crypto";
import { validateBusinessAttachment } from "./businessAttachmentValidationService.mjs";

export function createProductionFinishedGoodsPhotoCommandService({
  buildOperationLog,
  buildPhotoSummary,
  buildCustomerNotificationTodo,
  buildPhotoRetakeTodo,
  findAttachment,
  findOrderLine,
  normalizeHistory,
  normalizeReviewStatus,
  now = () => new Date(),
} = {}) {
  return {
    async uploadPhoto({ workspace, productionTaskId, body = {}, operatorId }) {
      const beforeTask = await workspace.productionFinishedGoodsPhotoTransactionRepository.getProductionTask({
        workspace,
        productionTaskId,
      });
      if (!beforeTask) return notFound("PRODUCTION_TASK_NOT_FOUND");
      if (body.productionTaskId && body.productionTaskId !== productionTaskId) return pathMismatch();
      const orderLineId = text(
        body.orderLineId ?? beforeTask.orderLineId ?? beforeTask.order_line_id ?? beforeTask.lineId,
      );
      const orderLine = findOrderLine(workspace, orderLineId);
      if (!orderLine) return notFound("ORDER_LINE_NOT_FOUND");
      const attachmentId = text(body.attachmentId);
      if (!attachmentId) return error(422, "VALIDATION_ERROR", "attachmentId is required when uploading a finished-goods photo.");
      const attachmentValidation = validateFinishedGoodsPhotoAttachment({
        workspace,
        attachmentId,
        productionTaskId,
        operatorId,
        findAttachment,
      });
      if (!attachmentValidation.ok) return attachmentValidation;
      const attachment = attachmentValidation.attachment;

      const timestamp = validTimestamp(body.uploadedAt) || nowIso(now);
      const previousPhoto = buildPhotoSummary(workspace, beforeTask, orderLine);
      const photo = {
        status: "待确认",
        required: previousPhoto.required,
        attachmentId,
        fileName: text(attachment.fileName) || attachmentId,
        uploadedAt: timestamp,
        uploadedBy: operatorId,
        reviewedAt: "",
        reviewedBy: "",
        rejectedReason: "",
        history: [
          ...normalizeHistory(getTaskPhotoHistory(beforeTask)),
          {
            status: "待确认",
            attachmentId,
            fileName: text(attachment.fileName) || attachmentId,
            uploadedAt: timestamp,
            uploadedBy: operatorId,
            remark: text(body.remark),
          },
        ],
      };
      const productionTask = taskWithPhoto(beforeTask, productionTaskId, orderLineId, photo, timestamp);
      const operationLog = buildOperationLog(workspace, {
        id: recordId("LOG-PHOTO", body.idempotencyKey, `upload:${productionTaskId}`),
        targetType: "production_task",
        targetId: productionTaskId,
        action: "upload_finished_goods_photo",
        operatorId,
        before: { productionTask: beforeTask, finishedGoodsPhoto: previousPhoto },
        after: { productionTask, finishedGoodsPhoto: photo, customerNotificationTodoCreated: false },
        reason: text(body.remark) || "上传定制印刷成品图，等待办公室确认",
      });
      return workspace.productionFinishedGoodsPhotoTransactionRepository.uploadPhoto({
        workspace,
        productionTask,
        todos: [],
        todoEvents: [],
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: payload(body, { productionTaskId, operatorId }),
      });
    },

    async reviewPhoto({ workspace, productionTaskId, body = {}, operatorId }) {
      const beforeTask = await workspace.productionFinishedGoodsPhotoTransactionRepository.getProductionTask({
        workspace,
        productionTaskId,
      });
      if (!beforeTask) return notFound("PRODUCTION_TASK_NOT_FOUND");
      if (body.productionTaskId && body.productionTaskId !== productionTaskId) return pathMismatch();
      const orderLineId = text(
        body.orderLineId ?? beforeTask.orderLineId ?? beforeTask.order_line_id ?? beforeTask.lineId,
      );
      const orderLine = findOrderLine(workspace, orderLineId);
      if (!orderLine) return notFound("ORDER_LINE_NOT_FOUND");
      const beforePhoto = buildPhotoSummary(workspace, beforeTask, orderLine);
      if (!beforePhoto.attachmentId) {
        return error(409, "FINISHED_GOODS_PHOTO_REQUIRED", "A finished-goods photo must be uploaded before review.");
      }
      const attachmentValidation = validateFinishedGoodsPhotoAttachment({
        workspace,
        attachmentId: beforePhoto.attachmentId,
        productionTaskId,
        findAttachment,
      });
      if (!attachmentValidation.ok) return attachmentValidation;
      const reviewStatus = normalizeReviewStatus(body.reviewStatus ?? body.status);
      if (!reviewStatus) return error(422, "VALIDATION_ERROR", "reviewStatus must be accepted or retake_required.");

      const timestamp = validTimestamp(body.reviewedAt) || nowIso(now);
      const reason = text(body.reason ?? body.remark);
      const photo = {
        ...beforePhoto,
        status: reviewStatus,
        reviewedAt: timestamp,
        reviewedBy: operatorId,
        rejectedReason: reviewStatus === "需重拍" ? reason || "办公室退回重拍" : "",
        history: [
          ...normalizeHistory(getTaskPhotoHistory(beforeTask)),
          {
            status: reviewStatus,
            attachmentId: beforePhoto.attachmentId,
            fileName: beforePhoto.fileName,
            reviewedAt: timestamp,
            reviewedBy: operatorId,
            reason,
          },
        ],
      };
      const productionTask = taskWithPhoto(beforeTask, productionTaskId, orderLineId, photo, timestamp);
      const todoId = recordId("T-FG", body.idempotencyKey, `${reviewStatus}:${orderLineId}`);
      const primaryTodo = reviewStatus === "已接受"
        ? buildCustomerNotificationTodo(workspace, orderLine, productionTask, operatorId, todoId)
        : buildPhotoRetakeTodo(workspace, orderLine, productionTask, reason, operatorId, todoId);
      const resolvedTodos = reviewStatus === "已接受"
        ? resolveOpenRetakeTodos(workspace.todos, orderLineId, operatorId, timestamp)
        : [];
      const todos = uniqueTodos([primaryTodo, ...resolvedTodos]);
      const todoEvents = todos.map((todo, index) => ({
        eventId: recordId("TE-PHOTO", body.idempotencyKey, `${todo.id}:${index}`),
        todoId: todo.id,
        eventType: todo.id === primaryTodo.id
          ? `todo_source:finished_goods_photo_${reviewStatus === "已接受" ? "accepted" : "retake_required"}`
          : "todo_source:finished_goods_photo_retake_resolved",
        eventPayload: { productionTaskId, orderLineId, todo, finishedGoodsPhoto: photo },
        operatorId,
        occurredAt: timestamp,
        createdAt: timestamp,
      }));
      const operationLog = buildOperationLog(workspace, {
        id: recordId("LOG-PHOTO", body.idempotencyKey, `review:${productionTaskId}`),
        targetType: "production_task",
        targetId: productionTaskId,
        action: reviewStatus === "已接受" ? "accept_finished_goods_photo" : "reject_finished_goods_photo",
        operatorId,
        before: { productionTask: beforeTask, finishedGoodsPhoto: beforePhoto },
        after: {
          productionTask,
          finishedGoodsPhoto: photo,
          todo: primaryTodo,
          customerNotificationTodoCreated: reviewStatus === "已接受",
          retakeTodoCreated: reviewStatus === "需重拍",
        },
        reason: reason || (reviewStatus === "已接受" ? "成品图确认通过，进入待通知客户" : "成品图退回重拍"),
      });
      const result = await workspace.productionFinishedGoodsPhotoTransactionRepository.reviewPhoto({
        workspace,
        productionTask,
        todos,
        todoEvents,
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: payload(body, { productionTaskId, operatorId }),
      });
      return { ...result, todo: result.todos.find((todo) => todo.id === primaryTodo.id) ?? primaryTodo, reviewStatus };
    },
  };
}

function validateFinishedGoodsPhotoAttachment({
  workspace,
  attachmentId,
  productionTaskId,
  operatorId,
  findAttachment,
}) {
  const validation = validateBusinessAttachment({
    workspace,
    attachmentId,
    findAttachment,
    expectedOwnerType: "production_task",
    expectedOwnerId: productionTaskId,
    expectedPurpose: "finished_goods_photo",
    expectedUploaderId: operatorId,
    errorCodePrefix: "FINISHED_GOODS_PHOTO_ATTACHMENT",
    label: "finished-goods photo attachment",
  });
  return validation.ok
    ? validation
    : error(validation.statusCode, validation.errorCode, validation.message);
}

function taskWithPhoto(beforeTask, productionTaskId, orderLineId, photo, timestamp) {
  return {
    ...beforeTask,
    id: productionTaskId,
    productionTaskId,
    orderLineId,
    lineId: orderLineId,
    revision: positiveRevision(beforeTask.revision) + 1,
    finishedGoodsPhoto: photo,
    finishedGoodsPhotoStatus: photo.status,
    finishedGoodsPhotoAttachmentId: photo.attachmentId,
    finishedGoodsPhotoFileName: photo.fileName,
    finishedGoodsPhotoUploadedAt: photo.uploadedAt,
    finishedGoodsPhotoUploadedBy: photo.uploadedBy,
    finishedGoodsPhotoReviewedAt: photo.reviewedAt,
    finishedGoodsPhotoReviewedBy: photo.reviewedBy,
    finishedGoodsPhotoRejectedReason: photo.rejectedReason,
    finishedGoodsPhotoHistory: photo.history,
    updatedAt: timestamp,
  };
}

function resolveOpenRetakeTodos(todos = [], orderLineId, operatorId, timestamp) {
  return todos
    .filter(
      (todo) =>
        todo.type === "成品图需重拍" &&
        text(todo.ref ?? todo.refId ?? todo.ref_id) === orderLineId &&
        !todo.handled,
    )
    .map((todo) => ({
      ...todo,
      status: "已处理",
      handled: true,
      handledBy: operatorId,
      handledAt: timestamp,
      handlingResult: "成品图已重新上传并确认通过",
      updatedAt: timestamp,
    }));
}

function getTaskPhotoHistory(task = {}) {
  return (
    task.finishedGoodsPhotoHistory ??
    task.finished_goods_photo_history ??
    task.finishedGoodsPhoto?.history ??
    task.finished_goods_photo?.history
  );
}

function uniqueTodos(todos) {
  return [...new Map(todos.filter(Boolean).map((todo) => [todo.id, todo])).values()];
}

function payload(body, context) {
  const { operatorId: ignored, ...requestBody } = body;
  return { requestBody, context };
}

function recordId(prefix, key, discriminator) {
  const source = text(key) || randomUUID();
  return `${prefix}-${createHash("sha256").update(`${source}:${discriminator}`).digest("hex").slice(0, 20).toUpperCase()}`;
}

function validTimestamp(value) {
  const source = text(value);
  return source && !Number.isNaN(Date.parse(source)) ? new Date(source).toISOString() : "";
}

function nowIso(now) {
  return new Date(now()).toISOString();
}

function positiveRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 1 ? revision : 1;
}

function pathMismatch() {
  return error(422, "VALIDATION_ERROR", "productionTaskId in path and body must match");
}

function notFound(code) {
  return { notFound: true, code };
}

function error(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}

function text(value) {
  return String(value ?? "").trim();
}
