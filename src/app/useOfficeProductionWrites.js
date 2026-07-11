import { useCallback } from "react";
import {
  createFinishedGoodsPhotoAttachmentInput,
  createOfficeAttachment,
} from "../services/officeAttachmentApiClient.js";
import { isOfficeApiServerRequired } from "../services/officeAuthService.js";
import {
  completeOfficePackingTask,
  buildProductionTaskId,
  findProductionInventoryItem,
  moveOfficeProductionMachineQueueItem,
  publishOfficeProductionSchedule,
  reportOfficeProductionComplete,
  reportOfficeProductionDailyProgress,
  resequenceOfficeProductionMachineQueue,
  reviewOfficeProductionFinishedGoodsPhoto,
  uploadOfficeProductionFinishedGoodsPhoto,
} from "../services/officeProductionPackingApiClient.js";
import { createOfficeTodo } from "../services/officeMockService.js";
import { estimateDataUrlByteSize } from "../services/driverWatermarkImageClient.js";
import { readAttachmentFileAsDataUrl } from "../features/attachments/readAttachmentFile.js";
import {
  getLineColorSpecLabel,
  getLinePrintSide,
  getLineRemark,
} from "../domain/officeRules.js";
import {
  buildFulfillmentFromPacking,
  cleanProductionPackingText,
  inferPackageCountFromQty,
  toProductionPackingNumber,
  upsertPackingTask,
  upsertProductionTaskLine,
} from "../state/officeProductionPackingState.js";

const defaultApi = {
  completeOfficePackingTask,
  createOfficeAttachment,
  moveOfficeProductionMachineQueueItem,
  publishOfficeProductionSchedule,
  reportOfficeProductionComplete,
  reportOfficeProductionDailyProgress,
  resequenceOfficeProductionMachineQueue,
  reviewOfficeProductionFinishedGoodsPhoto,
  uploadOfficeProductionFinishedGoodsPhoto,
};

function withFeedback(result, feedback, extra = {}) {
  return { ...(result ?? {}), ...extra, feedback };
}

function formatBlockedFeedback(prefix, result) {
  return result?.error?.requiredPermission
    ? `${prefix}：缺少权限 ${result.error.requiredPermission}。`
    : `${prefix}：${result?.error?.message ?? "未知错误"}`;
}

function normalizeWriteResultForRuntime(result, { label, serverRequired }) {
  const safeResult = result ?? {};
  if (!serverRequired() || safeResult.source === "api") return safeResult;
  return {
    ...safeResult,
    blocked: true,
    upstreamSource: safeResult.source,
    source: "api_error",
    error: {
      code: safeResult.error?.code ?? "PRODUCTION_WRITE_SERVER_REQUIRED",
      message: safeResult.error?.message ?? `生产模式要求通过后端完成${label}。`,
      ...(safeResult.error?.requiredPermission
        ? { requiredPermission: safeResult.error.requiredPermission }
        : {}),
    },
  };
}

function hasProjectionRefreshFailure(results) {
  return results.some((result) => !result || result.blocked || result.source !== "api");
}

function formatSyncTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function encodeTextBase64(value) {
  const text = String(value ?? "");
  if (typeof btoa !== "function") return "";
  return btoa(unescape(encodeURIComponent(text)));
}

function escapeSvgText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function readProductionPhotoFileAsDataUrl(file) {
  return readAttachmentFileAsDataUrl(file).catch(() => "");
}

export function createFinishedGoodsPhotoSampleFile({ line, productionTaskId, operatorName }) {
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const orderLineId = cleanProductionPackingText(line?.id ?? line?.orderLineId);
  const title = escapeSvgText(line?.product || line?.productName || "成品图");
  const spec = escapeSvgText(
    [line?.size, line?.color || line?.bagColor, line?.handle || line?.handleType]
      .filter(Boolean)
      .join(" "),
  );
  const operator = escapeSvgText(operatorName || "办公室");
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">',
    '<rect width="960" height="640" fill="#f8fafc"/>',
    '<rect x="80" y="72" width="800" height="496" rx="18" fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>',
    '<rect x="220" y="138" width="520" height="330" rx="22" fill="#fefefe" stroke="#94a3b8" stroke-width="2"/>',
    '<path d="M350 138 C355 96 605 96 610 138" fill="none" stroke="#475569" stroke-width="10" stroke-linecap="round"/>',
    `<text x="480" y="240" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" font-weight="700" fill="#0f172a">${title}</text>`,
    `<text x="480" y="310" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#334155">${spec}</text>`,
    '<text x="480" y="378" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#2563eb">Finished goods sample</text>',
    `<text x="120" y="532" font-family="Arial, sans-serif" font-size="24" fill="#475569">Task: ${escapeSvgText(productionTaskId || orderLineId)}</text>`,
    `<text x="120" y="566" font-family="Arial, sans-serif" font-size="24" fill="#475569">Operator: ${operator}</text>`,
    "</svg>",
  ].join("");
  const contentDataUrl = `data:image/svg+xml;base64,${encodeTextBase64(svg)}`;
  return {
    name: `finished-goods-${productionTaskId || orderLineId}-${stamp}.svg`,
    type: "image/svg+xml",
    size: estimateDataUrlByteSize(contentDataUrl) ?? svg.length,
    contentDataUrl,
  };
}

function buildCustomerFinishedGoodsNotificationCopyText(line, customer) {
  const contact = customer?.contact || "您好";
  const lineId = cleanProductionPackingText(line?.id ?? line?.orderLineId);
  const qty = Number(line?.qty ?? line?.plannedQty ?? 0);
  const quantityText = Number.isFinite(qty) && qty > 0 ? `${Math.trunc(qty)}个` : "";
  const goods = [
    line?.product || line?.productName,
    line?.size,
    getLineColorSpecLabel(line),
    getLinePrintSide(line),
    quantityText,
    getLineRemark(line),
  ]
    .map((item) => cleanProductionPackingText(item))
    .filter(Boolean)
    .join(" / ");
  const fulfillment = cleanProductionPackingText(line?.fulfillment ?? line?.fulfillmentMethod);
  const deliveryText = fulfillment ? `我们按原来的${fulfillment}方式继续安排。` : "我们按原交付方式继续安排。";
  return `${contact}，您这单${lineId ? ` ${lineId}` : ""}${goods ? `（${goods}）` : ""}成品已经做好，成品图发您确认。确认可以的话，${deliveryText}`;
}

function buildCustomerFinishedGoodsPhotoPrompt(finishedGoodsPhoto) {
  const fileName =
    cleanProductionPackingText(finishedGoodsPhoto?.fileName) ||
    cleanProductionPackingText(finishedGoodsPhoto?.attachmentId);
  return fileName
    ? `发送客户通知时请附上已复核成品图：${fileName}。`
    : "发送客户通知时请附上已复核成品图。";
}

export function createOfficeProductionWriteActions({
  api = {},
  authState,
  createSampleFile = createFinishedGoodsPhotoSampleFile,
  currentUserDisplayName,
  currentUserId,
  customers = [],
  inventoryRecordsRef,
  orderLinesRef,
  productionPackingRef,
  readPhotoFile = readProductionPhotoFileAsDataUrl,
  refreshFulfillments,
  refreshInventoryRecords,
  refreshOrderPool,
  refreshProductionPackingTaskLists,
  refreshTodos,
  serverRequired = isOfficeApiServerRequired,
  setFulfillments,
  setInventoryRecords,
  setOrderLines,
  setProductionPacking,
  setSelectedTodoId,
  setTodos,
  todosRef,
}) {
  const productionApi = { ...defaultApi, ...api };

  async function refreshCommittedProjections(tasks) {
    const results = await Promise.all(tasks);
    return { results, failed: hasProjectionRefreshFailure(results) };
  }

  async function finishCommittedWrite(result, refreshTasks, successFeedback, refreshFailureFeedback) {
    if (result.source !== "api") return withFeedback(result, successFeedback, { projectionRefreshFailed: false });
    const projection = await refreshCommittedProjections(refreshTasks.map((task) => task()));
    return withFeedback(
      result,
      projection.failed ? refreshFailureFeedback : successFeedback,
      { projectionRefreshFailed: projection.failed },
    );
  }

  function findOrderLine(payload = {}) {
    return (
      payload.orderLine ??
      (productionPackingRef.current.productionTasks ?? []).find(
        (item) => item.id === payload.orderLineId || item.orderLineId === payload.orderLineId,
      ) ??
      orderLinesRef.current.find((item) => item.id === payload.orderLineId || item.orderLineId === payload.orderLineId) ??
      null
    );
  }

  function findProductionLine(payload = {}) {
    return (
      findOrderLine(payload) ??
      (productionPackingRef.current.productionTasks ?? []).find(
        (item) => item.id === payload.orderLineId || item.orderLineId === payload.orderLineId,
      ) ??
      null
    );
  }

  function addTodoIfMissing(input) {
    const existing = todosRef.current.find(
      (item) => item.ref === input.ref && item.type === input.type && !item.handled,
    );
    if (existing) return existing;
    const todo = createOfficeTodo(input);
    setTodos((current) => [todo, ...current]);
    setSelectedTodoId(todo.id);
    return todo;
  }

  async function moveProductionQueue(payload) {
    const result = normalizeWriteResultForRuntime(
      await productionApi.moveOfficeProductionMachineQueueItem({
        authState,
        productionTaskId: payload.productionTaskId,
        targetMachineId: payload.targetMachineId,
        targetQueueSeq: payload.targetQueueSeq,
        operatorId: currentUserId,
        remark: payload.remark || `${currentUserDisplayName} 在打包/标签页移动机台排产任务`,
      }),
      { label: "移动排产任务", serverRequired },
    );
    if (result.blocked) return withFeedback(result, formatBlockedFeedback("后端拒绝移动排产任务", result));

    const movedProductionTask = result.productionTask ?? {};
    const productionTaskId = cleanProductionPackingText(result.productionTaskId ?? payload.productionTaskId);
    const orderLineId = cleanProductionPackingText(movedProductionTask.orderLineId ?? payload.orderLineId);
    const targetMachineId = cleanProductionPackingText(result.targetMachineId ?? payload.targetMachineId);
    const targetQueueSeq = toProductionPackingNumber(result.targetQueueSeq ?? payload.targetQueueSeq, 0);
    const matchesMovedLine = (item) => {
      const itemOrderLineId = cleanProductionPackingText(item?.id ?? item?.orderLineId);
      const itemProductionTaskId = cleanProductionPackingText(
        item?.productionTaskId ?? item?.productionTask?.productionTaskId,
      );
      return (
        (orderLineId && itemOrderLineId === orderLineId) ||
        (productionTaskId && itemProductionTaskId === productionTaskId)
      );
    };
    const buildMovedLine = (line) => line
      ? {
          ...line,
          machineId: targetMachineId,
          productionTaskId: productionTaskId || line.productionTaskId,
          productionTask: {
            ...(line.productionTask ?? {}),
            ...movedProductionTask,
            productionTaskId:
              productionTaskId || movedProductionTask.productionTaskId || line.productionTask?.productionTaskId,
            orderLineId: orderLineId || movedProductionTask.orderLineId || line.orderLineId || line.id,
            machineId: targetMachineId,
          },
        }
      : null;
    const fallbackLine = orderLinesRef.current.find(matchesMovedLine);
    setOrderLines((current) => current.map((item) => (matchesMovedLine(item) ? buildMovedLine(item) : item)));
    setProductionPacking((current) => {
      const currentLine = current.productionTasks?.find(matchesMovedLine) ?? fallbackLine;
      const nextLine = buildMovedLine(currentLine);
      return {
        ...current,
        lastSource: result.source,
        scheduleQueueItems: result.items ?? current.scheduleQueueItems ?? [],
        scheduleQueueMachines: result.machines ?? current.scheduleQueueMachines ?? [],
        scheduleQueueTotal: result.total ?? current.scheduleQueueTotal ?? 0,
        scheduleQueueSource: result.source,
        scheduleQueueError: "",
        scheduleQueueLastSyncedAt: formatSyncTime(),
        scheduleQueueNote: result.note ?? current.scheduleQueueNote ?? "",
        productionTasks: nextLine
          ? upsertProductionTaskLine(current.productionTasks ?? [], nextLine)
          : current.productionTasks ?? [],
      };
    });
    const reasonLabel = cleanProductionPackingText(payload.reasonLabel);
    const reasonText = reasonLabel ? `原因：${reasonLabel}；` : "";
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return finishCommittedWrite(
      result,
      [() => refreshProductionPackingTaskLists({ showToast: false })],
      `已通过${sourceLabel}移动排产任务：${productionTaskId} 到 ${targetMachineId} #${targetQueueSeq || "-"}；${reasonText}只更新机台队列，不入库、不占用、不生成打包任务。`,
      "排产任务已由后端移动，但生产 / 打包任务池刷新失败，请手动刷新。",
    );
  }

  async function resequenceProductionQueue(payload) {
    const result = normalizeWriteResultForRuntime(
      await productionApi.resequenceOfficeProductionMachineQueue({
        authState,
        machineId: payload.machineId,
        orderedProductionTaskIds: payload.orderedProductionTaskIds,
        operatorId: currentUserId,
        remark: payload.remark || `${currentUserDisplayName} 在打包/标签页调整机台排产队列顺序`,
      }),
      { label: "调整排产顺序", serverRequired },
    );
    if (result.blocked) return withFeedback(result, formatBlockedFeedback("后端拒绝调整排产顺序", result));
    setProductionPacking((current) => ({
      ...current,
      scheduleQueueItems: result.items ?? current.scheduleQueueItems ?? [],
      scheduleQueueMachines: result.machines ?? current.scheduleQueueMachines ?? [],
      scheduleQueueTotal: result.total ?? current.scheduleQueueTotal ?? 0,
      scheduleQueueSource: result.source,
      scheduleQueueError: "",
      scheduleQueueLastSyncedAt: formatSyncTime(),
      scheduleQueueNote: result.note ?? current.scheduleQueueNote ?? "",
    }));
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return finishCommittedWrite(
      result,
      [() => refreshProductionPackingTaskLists({ showToast: false })],
      `已通过${sourceLabel}调整${result.machineId}排产顺序：${result.updatedCount} 条；只更新队列顺序，不入库、不占用、不生成打包任务。`,
      "排产顺序已由后端保存，但机台队列刷新失败，请手动刷新。",
    );
  }

  async function publishSchedule(payload) {
    const line = findOrderLine(payload);
    if (!line) return withFeedback({ source: "ui_error", blocked: true }, "未找到对应订单明细，无法发布排产。");
    const result = normalizeWriteResultForRuntime(
      await productionApi.publishOfficeProductionSchedule({
        authState,
        orderLine: line,
        productionTaskId: payload.productionTaskId,
        machineId: payload.machineId,
        processType: payload.processType,
        plannedQty: payload.plannedQty,
        operatorId: currentUserId,
        remark: payload.remark || `${currentUserDisplayName} 在打包/标签页发布排产到车间任务池`,
      }),
      { label: "发布排产", serverRequired },
    );
    if (result.blocked) return withFeedback(result, formatBlockedFeedback("后端拒绝发布排产", result));
    const nextStatus = result.orderLineStatus || result.status || line.status;
    const nextLine = {
      ...line,
      status: nextStatus,
      lineStatus: nextStatus,
      machineId: result.machineId,
      taskType: result.taskType,
      publishedScheduleId: result.publishedScheduleId,
      productionTaskId: result.productionTaskId,
      productionTask: result.productionTask,
    };
    setOrderLines((current) => current.map((item) =>
      item.id === result.orderLineId
        ? {
            ...item,
            status: nextStatus,
            lineStatus: nextStatus,
            machineId: result.machineId,
            taskType: result.taskType,
            publishedScheduleId: result.publishedScheduleId,
            productionTaskId: result.productionTaskId,
          }
        : item,
    ));
    setProductionPacking((current) => ({
      ...current,
      lastSource: result.source,
      productionTasks: upsertProductionTaskLine(current.productionTasks ?? [], nextLine),
    }));
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return finishCommittedWrite(
      result,
      [
        () => refreshOrderPool({ showToast: false }),
        () => refreshProductionPackingTaskLists({ showToast: false }),
      ],
      `已通过${sourceLabel}发布排产：${result.machineId} / ${result.publishedScheduleId}；只下发车间任务，不入库、不占用、不生成打包任务。`,
      "排产已由后端发布，但订单池或生产任务池刷新失败，请手动刷新。",
    );
  }

  async function reportDailyProgress(payload) {
    const line = findOrderLine(payload);
    if (!line) return withFeedback({ source: "ui_error", blocked: true }, "未找到对应订单明细，无法提交生产当日报数。");
    const result = normalizeWriteResultForRuntime(
      await productionApi.reportOfficeProductionDailyProgress({
        authState,
        orderLine: line,
        dailyQualifiedQty: payload.dailyQualifiedQty ?? payload.qualifiedQty,
        exceptionQty: payload.exceptionQty,
        machineCount: payload.machineCount,
        operatorId: currentUserId,
        remark: payload.remark || `${currentUserDisplayName} 在${payload.entryLabel || "车间手机端"}提交跨日当日报数`,
      }),
      { label: "生产当日报数", serverRequired },
    );
    if (result.blocked) return withFeedback(result, formatBlockedFeedback("后端拒绝生产当日报数", result));
    const dailyProgress = {
      latestReportId: result.reportId,
      progressDate: result.progressDate,
      latestDailyQualifiedQty: result.dailyQualifiedQty,
      previousQualifiedQty: result.previousQualifiedQty,
      cumulativeQualifiedQty: result.cumulativeQualifiedQty,
      remainingQty: result.remainingQty,
      plannedQty: result.plannedQty || line.qty,
      carryOver: result.carryOver,
      nextWorkDate: result.nextWorkDate,
      machineCount: result.machineCount,
      machineCountAffectsInventory: false,
      inventoryCreated: false,
      reservationCreated: false,
      packingTaskCreated: false,
    };
    setOrderLines((current) => current.map((item) =>
      item.id === result.orderLineId
        ? { ...item, status: result.taskStatus || result.status, lineStatus: result.taskStatus || result.status, dailyProgress }
        : item,
    ));
    setProductionPacking((current) => ({
      ...current,
      lastSource: result.source,
      productionTasks: (current.productionTasks ?? []).map((item) =>
        item.id === result.orderLineId
          ? { ...item, status: result.taskStatus || result.status, lineStatus: result.taskStatus || result.status, dailyProgress }
          : item,
      ),
      dailyProgressByLineId: { ...(current.dailyProgressByLineId ?? {}), [result.orderLineId]: result },
    }));
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return finishCommittedWrite(
      result,
      [
        () => refreshOrderPool({ showToast: false }),
        () => refreshProductionPackingTaskLists({ showToast: false }),
      ],
      `已通过${sourceLabel}记录当日报数：今日合格 ${result.dailyQualifiedQty} 个，累计 ${result.cumulativeQualifiedQty} 个，剩余 ${result.remainingQty} 个；未入库、未占用、未生成打包任务。`,
      "生产当日报数已由后端提交，但订单池或生产任务池刷新失败，请手动刷新。",
    );
  }

  async function uploadFinishedGoodsPhoto(payload) {
    const line = findProductionLine(payload);
    if (!line) return withFeedback({ source: "ui_error", blocked: true }, "未找到对应订单明细，无法上传成品图。");
    const productionTaskId = payload.productionTaskId || line.productionTaskId || buildProductionTaskId(line);
    const payloadFile = payload.photoFile || payload.file || null;
    const sampleFile = payloadFile
      ? {
          name: payloadFile.name || `finished-goods-${productionTaskId}.jpg`,
          type: payloadFile.type || "image/jpeg",
          size: Number.isFinite(payloadFile.size) ? payloadFile.size : undefined,
          contentDataUrl: await readPhotoFile(payloadFile),
        }
      : createSampleFile({ line, productionTaskId, operatorName: currentUserDisplayName });
    const remark =
      payload.remark ||
      `${currentUserDisplayName} 在${payload.entryLabel || "打包/标签页"}上传定制印刷成品图${payloadFile ? "" : "样张"}`;
    const attachmentResult = normalizeWriteResultForRuntime(
      await productionApi.createOfficeAttachment({
        authState,
        ...createFinishedGoodsPhotoAttachmentInput({
          productionTaskId,
          orderLine: line,
          operatorId: currentUserId,
          remark,
          file: sampleFile,
        }),
      }),
      { label: "成品图附件上传", serverRequired },
    );
    if (attachmentResult.blocked) {
      return withFeedback(attachmentResult, formatBlockedFeedback("后端拒绝上传成品图附件", attachmentResult));
    }
    const attachmentId = attachmentResult.attachment?.attachmentId || "";
    const result = normalizeWriteResultForRuntime(
      await productionApi.uploadOfficeProductionFinishedGoodsPhoto({
        authState,
        orderLine: line,
        productionTaskId,
        attachmentId,
        fileName: attachmentResult.attachment?.fileName || sampleFile.name,
        operatorId: currentUserId,
        remark,
      }),
      { label: "成品图登记", serverRequired },
    );
    if (result.blocked) return withFeedback(result, formatBlockedFeedback("后端拒绝登记成品图", result));
    const finishedGoodsPhoto = result.finishedGoodsPhoto ?? {
      status: "待确认",
      attachmentId,
      fileName: attachmentResult.attachment?.fileName || sampleFile.name,
    };
    const updateLinePhoto = (item) =>
      item.id === result.orderLineId || item.orderLineId === result.orderLineId
        ? {
            ...item,
            finishedGoodsPhoto,
            productionTask: { ...(item.productionTask ?? {}), ...(result.productionTask ?? {}), finishedGoodsPhoto },
          }
        : item;
    setOrderLines((current) => current.map(updateLinePhoto));
    setProductionPacking((current) => ({
      ...current,
      lastSource: result.source,
      productionTasks: (current.productionTasks ?? []).map(updateLinePhoto),
    }));
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    const attachmentSourceLabel = attachmentResult.source === "api" ? "后端 API" : "本地规则降级";
    return finishCommittedWrite(
      result,
      [() => refreshProductionPackingTaskLists({ showToast: false })],
      `已通过${attachmentSourceLabel}上传成品图附件，并通过${sourceLabel}登记为待确认；待办公室复核后才进入待通知客户。`,
      "成品图已由后端登记，但生产任务池刷新失败，请手动刷新。",
    );
  }

  async function reviewFinishedGoodsPhoto(action, payload) {
    const line = findProductionLine(payload);
    if (!line) return withFeedback({ source: "ui_error", blocked: true }, "未找到对应订单明细，无法复核成品图。");
    const reviewStatus = action === "确认成品图" ? "已接受" : "需重拍";
    const productionTaskId = payload.productionTaskId || line.productionTaskId || buildProductionTaskId(line);
    const reason = payload.reason || (reviewStatus === "已接受" ? "办公室确认成品图合格" : "成品图不清晰或角度不完整，需重拍");
    const result = normalizeWriteResultForRuntime(
      await productionApi.reviewOfficeProductionFinishedGoodsPhoto({
        authState,
        orderLine: line,
        productionTaskId,
        reviewStatus,
        reason,
        operatorId: currentUserId,
      }),
      { label: "成品图复核", serverRequired },
    );
    if (result.blocked) return withFeedback(result, formatBlockedFeedback("后端拒绝复核成品图", result));
    const finishedGoodsPhoto = result.finishedGoodsPhoto ?? {
      ...(line.finishedGoodsPhoto ?? {}),
      status: reviewStatus,
      rejectedReason: reviewStatus === "需重拍" ? reason : "",
    };
    const updateLinePhoto = (item) =>
      item.id === result.orderLineId || item.orderLineId === result.orderLineId
        ? {
            ...item,
            finishedGoodsPhoto,
            productionTask: { ...(item.productionTask ?? {}), ...(result.productionTask ?? {}), finishedGoodsPhoto },
          }
        : item;
    setOrderLines((current) => current.map(updateLinePhoto));
    setProductionPacking((current) => ({
      ...current,
      lastSource: result.source,
      productionTasks: (current.productionTasks ?? []).map(updateLinePhoto),
    }));
    const customer = customers.find((item) => item.id === line.customerId || item.customerId === line.customerId) ?? {};
    if (reviewStatus === "已接受") {
      addTodoIfMissing({
        ...(result.todo?.todoId ? { id: result.todo.todoId } : {}),
        type: "待通知客户",
        customerId: line.customerId,
        ref: result.orderLineId,
        summary: `${line.product} ${line.size} 成品图已确认，可通知客户可发货/可安排快递。`,
        wait: "刚刚",
        latest: line.latest,
        urgency: "待处理",
        impact: "V1 人工发送客户通知",
        notificationCopyText:
          result.todo?.notificationCopyText ?? buildCustomerFinishedGoodsNotificationCopyText(line, customer),
        notificationChannel: result.todo?.notificationChannel ?? "微信 / 企业微信人工发送",
        notificationStatus: "待人工发送",
        photoPrompt: result.todo?.photoPrompt ?? buildCustomerFinishedGoodsPhotoPrompt(finishedGoodsPhoto),
      });
    } else {
      addTodoIfMissing({
        ...(result.todo?.todoId ? { id: result.todo.todoId } : {}),
        type: "成品图需重拍",
        customerId: line.customerId,
        ref: result.orderLineId,
        summary: `${line.product} ${line.size}：${reason}`,
        wait: "刚刚",
        latest: line.latest,
        urgency: "异常",
        impact: "未确认前不能进入待通知客户池",
      });
    }
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    const successFeedback = reviewStatus === "已接受"
      ? `已通过${sourceLabel}确认成品图，并进入待通知客户池；客户消息仍由办公室人工发送。`
      : `已通过${sourceLabel}退回成品图并生成重拍待办；未进入待通知客户池。`;
    return finishCommittedWrite(
      result,
      [
        () => refreshProductionPackingTaskLists({ showToast: false }),
        () => refreshTodos({ showToast: false }),
      ],
      successFeedback,
      `${action}已由后端提交，但生产任务池或待办刷新失败，请手动刷新。`,
    );
  }

  async function reportProductionComplete(payload) {
    const line = findOrderLine(payload);
    if (!line) return withFeedback({ source: "ui_error", blocked: true }, "未找到对应订单明细，无法提交生产报工。");
    const inventoryItem = findProductionInventoryItem(line, inventoryRecordsRef.current);
    if (!inventoryItem) {
      return withFeedback(
        { source: "ui_error", blocked: true },
        "未找到匹配的成品库存键，不能把报工数量直接入库；需先补库存主数据。",
      );
    }
    const result = normalizeWriteResultForRuntime(
      await productionApi.reportOfficeProductionComplete({
        authState,
        orderLine: line,
        inventoryItem,
        qualifiedQty: payload.qualifiedQty,
        exceptionQty: payload.exceptionQty,
        machineCount: payload.machineCount,
        operatorId: currentUserId,
        remark: payload.remark || `${currentUserDisplayName} 在${payload.entryLabel || "打包/标签页"}提交生产报工完成`,
      }),
      { label: "生产报工", serverRequired },
    );
    if (result.blocked) return withFeedback(result, formatBlockedFeedback("后端拒绝生产报工", result));
    setOrderLines((current) => current.map((item) =>
      item.id === result.orderLineId
        ? { ...item, status: result.orderLineStatus, lineStatus: result.orderLineStatus, inventory: "生产完成待打包" }
        : item,
    ));
    setInventoryRecords((current) => current.map((item) =>
      item.id === result.inventoryItemId
        ? {
            ...item,
            inStock: Number(item.inStock || 0) + result.qualifiedQty,
            reserved: Number(item.reserved || 0) + result.qualifiedQty,
          }
        : item,
    ));
    setProductionPacking((current) => ({
      ...current,
      lastSource: result.source,
      reportResultsByLineId: { ...current.reportResultsByLineId, [result.orderLineId]: result },
      packingTasks: upsertPackingTask(current.packingTasks, {
        packingTaskId: result.packingTaskId,
        orderLineId: result.orderLineId,
        plannedQty: result.qualifiedQty,
        actualPackedQty: 0,
        packageCount: inferPackageCountFromQty(result.qualifiedQty),
        status: "待打包",
        source: result.source,
      }),
    }));
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return finishCommittedWrite(
      result,
      [
        () => refreshOrderPool({ showToast: false }),
        () => refreshInventoryRecords({ showToast: false }),
        () => refreshProductionPackingTaskLists({ showToast: false }),
      ],
      `已通过${sourceLabel}完成生产报工：合格 ${result.qualifiedQty} 个入库并占用给订单；机器计数只作为凭证，不参与库存。`,
      "生产报工已由后端提交，但订单、库存或生产 / 打包任务池刷新失败，请手动刷新。",
    );
  }

  async function completePacking(payload) {
    const packingTask =
      (productionPackingRef.current.packingTasks ?? []).find((item) => item.packingTaskId === payload.packingTaskId) ??
      payload.packingTask;
    const line =
      orderLinesRef.current.find((item) => item.id === (packingTask?.orderLineId ?? payload.orderLineId)) ??
      payload.orderLine;
    if (!packingTask || !line) {
      return withFeedback({ source: "ui_error", blocked: true }, "未找到对应打包任务或订单明细，无法提交打包完成。");
    }
    const inventoryItem = findProductionInventoryItem(line, inventoryRecordsRef.current);
    const result = normalizeWriteResultForRuntime(
      await productionApi.completeOfficePackingTask({
        authState,
        packingTask,
        orderLine: line,
        inventoryItem,
        actualPackedQty: payload.actualPackedQty,
        packageCount: payload.packageCount,
        labelsPrinted: payload.labelsPrinted,
        operatorId: currentUserId,
        remark: payload.remark || `${currentUserDisplayName} 在${payload.entryLabel || "打包/标签页"}提交打包完成`,
      }),
      { label: "打包完成", serverRequired },
    );
    if (result.blocked) return withFeedback(result, formatBlockedFeedback("后端拒绝打包完成", result));
    const packageCount = result.packageCount || payload.packageCount || packingTask.packageCount || 1;
    setProductionPacking((current) => ({
      ...current,
      lastSource: result.source,
      packingTasks: upsertPackingTask(current.packingTasks, {
        ...packingTask,
        status: result.status,
        actualPackedQty: result.actualPackedQty,
        packageCount,
        packageIds: result.packageIds,
        source: result.source,
      }),
    }));
    setOrderLines((current) => current.map((item) =>
      item.id === result.orderLineId
        ? {
            ...item,
            status: result.orderLineStatus,
            lineStatus: result.orderLineStatus,
            inventory:
              result.orderLineStatus === "待打印标签" || result.orderLineStatus === "待快运拉走"
                ? "待提货锁定"
                : item.inventory,
            exceptions:
              result.orderLineStatus === "待打印标签"
                ? [...new Set([...(item.exceptions ?? []), "待打印标签"])]
                : item.exceptions,
          }
        : item,
    ));
    setFulfillments((current) => {
      const existing = current.find(
        (item) => item.lineId === result.orderLineId || item.orderLineId === result.orderLineId,
      );
      const nextFulfillment = existing
        ? {
            ...existing,
            status: result.fulfillmentStatus || existing.status,
            actualQty: result.actualPackedQty,
            packages: `${packageCount}包`,
            source: "打包完成",
          }
        : buildFulfillmentFromPacking({ orderLine: line, packingResult: result, packageCount });
      return existing
        ? current.map((item) => (item.id === existing.id ? nextFulfillment : item))
        : [nextFulfillment, ...current];
    });
    if (result.orderLineStatus === "待打印标签") {
      addTodoIfMissing({
        type: "待打印标签",
        customerId: line.customerId,
        ref: result.orderLineId,
        summary: `${line.product} ${line.size} 已打包 ${result.actualPackedQty} 个 / ${packageCount} 包，等待打印快递快运标签。`,
        wait: "刚刚",
        latest: line.latest,
        urgency: String(line.latest ?? "").includes("今天") ? "今天" : "普通",
        impact: "等待标签打印",
      });
    }
    const sourceLabel = result.source === "api" ? "后端 API" : "本地规则降级";
    return finishCommittedWrite(
      result,
      [
        () => refreshOrderPool({ showToast: false }),
        () => refreshFulfillments({ showToast: false }),
        () => refreshProductionPackingTaskLists({ showToast: false }),
        () => refreshTodos({ showToast: false }),
      ],
      `已通过${sourceLabel}提交打包完成：${result.actualPackedQty} 个 / ${packageCount} 包；打包完成不扣库存，后续出库或拉走确认再扣减。`,
      "打包完成已由后端提交，但订单、交付、任务池或待办刷新失败，请手动刷新。",
    );
  }

  async function executeProductionPackingAction({ action, payload = {} }) {
    if (action === "移动排产任务" || action === "移动排产机台") return moveProductionQueue(payload);
    if (action === "调整排产顺序" || action === "上移排产" || action === "下移排产") {
      return resequenceProductionQueue(payload);
    }
    if (action === "发布排产") return publishSchedule(payload);
    if (action === "报当日数量") return reportDailyProgress(payload);
    if (action === "上传成品图") return uploadFinishedGoodsPhoto(payload);
    if (action === "确认成品图" || action === "退回成品图") return reviewFinishedGoodsPhoto(action, payload);
    if (action === "报工完成") return reportProductionComplete(payload);
    if (action === "提交打包完成") return completePacking(payload);
    return withFeedback(
      { source: "ui_error", blocked: true, error: { code: "PRODUCTION_ACTION_UNSUPPORTED" } },
      `不支持的生产 / 打包动作：${action || "未指定"}；未修改任何业务状态。`,
    );
  }

  return { executeProductionPackingAction };
}

export function useOfficeProductionWrites(options) {
  const actions = createOfficeProductionWriteActions(options);
  return {
    executeProductionPackingAction: useCallback(actions.executeProductionPackingAction, [
      options.authState,
      options.currentUserDisplayName,
      options.currentUserId,
      options.customers,
      options.inventoryRecordsRef,
      options.orderLinesRef,
      options.productionPackingRef,
      options.serverRequired,
      options.todosRef,
    ]),
  };
}
