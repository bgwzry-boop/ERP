import {
  getLineColorSpecLabel,
  getLinePrintSide,
  getLineRemark,
} from "../../src/domain/officeRules.js";
import { getFulfillmentMethodLabel } from "../../src/shared/labels.js";

export function createProductionFinishedGoodsPhotoProjectionService({ buildTodo } = {}) {
  requireFunction(buildTodo, "buildTodo");

  return {
    buildCustomerNotificationText,
    buildCustomerNotificationTodo,
    buildNotificationGoods,
    buildPhotoPrompt,
    buildPhotoRetakeTodo,
    buildPhotoSummary,
    isPhotoRequired,
    normalizeHistory,
    normalizeReviewStatus,
  };

  function buildPhotoSummary(workspace, productionTask = {}, orderLine = {}) {
    const sourcePhoto = object(productionTask.finishedGoodsPhoto ?? productionTask.finished_goods_photo);
    const attachmentId = text(
      productionTask.finishedGoodsPhotoAttachmentId ??
        productionTask.finished_goods_photo_attachment_id ??
        sourcePhoto.attachmentId ??
        sourcePhoto.attachment_id,
    );
    const attachment = workspace && attachmentId ? findAttachment(workspace, attachmentId) : null;
    const status = text(
      productionTask.finishedGoodsPhotoStatus ??
        productionTask.finished_goods_photo_status ??
        sourcePhoto.status,
    ) || (attachmentId ? "待确认" : "未上传");

    return {
      status,
      required: sourcePhoto.required === true || isPhotoRequired(orderLine),
      attachmentId,
      fileName:
        text(productionTask.finishedGoodsPhotoFileName ?? productionTask.finished_goods_photo_file_name) ||
        text(sourcePhoto.fileName ?? sourcePhoto.file_name) ||
        text(attachment?.fileName ?? attachment?.file_name) ||
        attachmentId,
      uploadedAt: text(
        productionTask.finishedGoodsPhotoUploadedAt ??
          productionTask.finished_goods_photo_uploaded_at ??
          sourcePhoto.uploadedAt ??
          sourcePhoto.uploaded_at,
      ),
      uploadedBy: text(
        productionTask.finishedGoodsPhotoUploadedBy ??
          productionTask.finished_goods_photo_uploaded_by ??
          sourcePhoto.uploadedBy ??
          sourcePhoto.uploaded_by,
      ),
      reviewedAt: text(
        productionTask.finishedGoodsPhotoReviewedAt ??
          productionTask.finished_goods_photo_reviewed_at ??
          sourcePhoto.reviewedAt ??
          sourcePhoto.reviewed_at,
      ),
      reviewedBy: text(
        productionTask.finishedGoodsPhotoReviewedBy ??
          productionTask.finished_goods_photo_reviewed_by ??
          sourcePhoto.reviewedBy ??
          sourcePhoto.reviewed_by,
      ),
      rejectedReason: text(
        productionTask.finishedGoodsPhotoRejectedReason ??
          productionTask.finished_goods_photo_rejected_reason ??
          sourcePhoto.rejectedReason ??
          sourcePhoto.rejected_reason,
      ),
      history: normalizeHistory(
        productionTask.finishedGoodsPhotoHistory ??
          productionTask.finished_goods_photo_history ??
          sourcePhoto.history,
      ),
    };
  }

  function normalizeHistory(value) {
    return Array.isArray(value)
      ? value
          .map((item) => ({
            status: text(item?.status),
            attachmentId: text(item?.attachmentId ?? item?.attachment_id),
            fileName: text(item?.fileName ?? item?.file_name),
            uploadedAt: text(item?.uploadedAt ?? item?.uploaded_at),
            uploadedBy: text(item?.uploadedBy ?? item?.uploaded_by),
            reviewedAt: text(item?.reviewedAt ?? item?.reviewed_at),
            reviewedBy: text(item?.reviewedBy ?? item?.reviewed_by),
            reason: text(item?.reason ?? item?.remark),
          }))
          .filter((item) => item.status || item.attachmentId)
      : [];
  }

  function isPhotoRequired(orderLine = {}) {
    const orderType = text(orderLine.orderType ?? orderLine.order_type);
    const printFlag = text(orderLine.print ?? orderLine.printFlag ?? orderLine.print_flag);
    const status = text(orderLine.status ?? orderLine.lineStatus ?? orderLine.line_status);
    return (
      orderType.includes("定制") ||
      orderType.includes("印刷") ||
      printFlag === "是" ||
      printFlag.toLowerCase() === "true" ||
      status.includes("丝印") ||
      status.includes("制袋")
    );
  }

  function normalizeReviewStatus(value) {
    const status = text(value);
    if (["已接受", "通过", "确认", "accepted", "accept"].includes(status)) return "已接受";
    if (["需重拍", "退回", "退回重拍", "rejected", "retake_required", "reject"].includes(status)) return "需重拍";
    return "";
  }

  function buildCustomerNotificationTodo(workspace, orderLine, productionTask, operatorId, todoId) {
    const orderLineId = getOrderLineId(orderLine, productionTask);
    const existingTodo = findOpenTodo(workspace, "待通知客户", orderLineId);
    const customerId = text(orderLine?.customerId ?? orderLine?.customer_id);
    const customerName = findCustomerName(workspace, customerId);
    const goods = buildTodoGoods(orderLine);
    return buildTodo(workspace, {
      ...(existingTodo ?? {}),
      id: existingTodo?.id ?? existingTodo?.todoId ?? todoId,
      type: "待通知客户",
      customerId,
      ref: orderLineId,
      refType: "order_line",
      refId: orderLineId,
      summary: `${customerName || customerId} ${goods || orderLineId}：成品图已确认，可人工通知客户可发货/可安排快递`,
      latest: text(orderLine?.latest ?? orderLine?.latestNeededAt ?? orderLine?.latest_needed_at) || "待确认",
      urgency: "待处理",
      impact: "V1 仅生成待办和可复制通知，客户消息仍由办公室人工发送",
      notificationCopyText: buildCustomerNotificationText(workspace, orderLine, productionTask),
      notificationChannel: existingTodo?.notificationChannel || "微信 / 企业微信人工发送",
      notificationStatus: existingTodo?.notificationStatus || "待人工发送",
      photoPrompt: buildPhotoPrompt(productionTask),
      createdBy: existingTodo?.createdBy ?? operatorId,
    });
  }

  function buildCustomerNotificationText(workspace, orderLine, productionTask) {
    const customerId = text(orderLine?.customerId ?? orderLine?.customer_id);
    const customer = array(workspace?.customers).find((item) => text(item.id ?? item.customerId) === customerId);
    const contact = text(customer?.contact) || "您好";
    const orderLineId = getOrderLineId(orderLine, productionTask);
    const goods = buildNotificationGoods(orderLine);
    const fulfillment = text(orderLine?.fulfillment ?? orderLine?.fulfillmentMethod ?? orderLine?.fulfillment_method);
    const fulfillmentLabel = fulfillment ? getFulfillmentMethodLabel(fulfillment, "") : "";
    const deliveryText = fulfillmentLabel
      ? `我们按原来的${fulfillmentLabel}方式继续安排。`
      : "我们按原交付方式继续安排。";
    return `${contact}，您这单${orderLineId ? ` ${orderLineId}` : ""}${goods ? `（${goods}）` : ""}成品已经做好，成品图发您确认。确认可以的话，${deliveryText}`;
  }

  function buildNotificationGoods(orderLine) {
    if (!orderLine) return "";
    const qty = Number(orderLine.qty ?? orderLine.quantity ?? orderLine.originalQty ?? 0);
    const quantityText = Number.isFinite(qty) && qty > 0 ? `${Math.trunc(qty)}个` : "";
    return [
      orderLine.productName ?? orderLine.product,
      orderLine.size,
      getLineColorSpecLabel(orderLine),
      mapPrintSide(getLinePrintSide(orderLine)),
      quantityText,
      getLineRemark(orderLine),
    ]
      .map(text)
      .filter(Boolean)
      .join(" / ");
  }

  function buildPhotoPrompt(productionTask = {}) {
    const photo = object(productionTask.finishedGoodsPhoto ?? productionTask.finished_goods_photo);
    const attachmentId = text(
      productionTask.finishedGoodsPhotoAttachmentId ??
        productionTask.finished_goods_photo_attachment_id ??
        photo.attachmentId ??
        photo.attachment_id,
    );
    const fileName =
      text(productionTask.finishedGoodsPhotoFileName ?? productionTask.finished_goods_photo_file_name) ||
      text(photo.fileName ?? photo.file_name) ||
      attachmentId;
    return fileName
      ? `发送客户通知时请附上已复核成品图：${fileName}。`
      : "发送客户通知时请附上已复核成品图。";
  }

  function buildPhotoRetakeTodo(workspace, orderLine, productionTask, reason, operatorId, todoId) {
    const orderLineId = getOrderLineId(orderLine, productionTask);
    const existingTodo = findOpenTodo(workspace, "成品图需重拍", orderLineId);
    const customerId = text(orderLine?.customerId ?? orderLine?.customer_id);
    const customerName = findCustomerName(workspace, customerId);
    const goods = buildTodoGoods(orderLine);
    return buildTodo(workspace, {
      ...(existingTodo ?? {}),
      id: existingTodo?.id ?? existingTodo?.todoId ?? todoId,
      type: "成品图需重拍",
      customerId,
      ref: orderLineId,
      refType: "order_line",
      refId: orderLineId,
      summary: `${customerName || customerId} ${goods || orderLineId}：${text(reason) || "办公室退回成品图，需车间重拍"}`,
      latest: text(orderLine?.latest ?? orderLine?.latestNeededAt ?? orderLine?.latest_needed_at) || "待确认",
      urgency: "异常",
      impact: "未确认前不能进入待通知客户池",
      createdBy: existingTodo?.createdBy ?? operatorId,
    });
  }
}

function getOrderLineId(orderLine, productionTask) {
  return text(
    orderLine?.id ??
      orderLine?.orderLineId ??
      orderLine?.order_line_id ??
      productionTask?.orderLineId ??
      productionTask?.order_line_id,
  );
}

function buildTodoGoods(orderLine) {
  return [
    orderLine?.productName ?? orderLine?.product,
    orderLine?.size,
    orderLine?.color ?? orderLine?.bagColor ?? orderLine?.bag_color,
  ]
    .map(text)
    .filter(Boolean)
    .join(" ");
}

function findAttachment(workspace, attachmentId) {
  return array(workspace?.attachments).find(
    (item) => text(item.attachmentId ?? item.id) === attachmentId,
  );
}

function findCustomerName(workspace, customerId) {
  const customer = array(workspace?.customers).find(
    (item) => text(item.id ?? item.customerId) === customerId,
  );
  return text(customer?.name ?? customer?.shortName);
}

function findOpenTodo(workspace, type, ref) {
  return array(workspace?.todos).find(
    (todo) =>
      text(todo.type) === type &&
      text(todo.ref ?? todo.refId ?? todo.ref_id) === ref &&
      todo.handled !== true &&
      !["已处理", "completed", "done"].includes(text(todo.status).toLowerCase()),
  ) ?? null;
}

function mapPrintSide(value) {
  if (value === "single") return "单面";
  if (value === "double") return "双面";
  return value;
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value ?? "").trim();
}
