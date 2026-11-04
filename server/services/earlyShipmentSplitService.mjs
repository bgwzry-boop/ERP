// P2-03 边做边发（负责人 2026-11-04）：一个定制单（比如 1 万个）当天没做完，到下班出多少发多少，
// 剩下的第二天做完再发。客户那边要能看到这一单是分几批发的。
// 流程：
// 1. 办公室和客户说好后，在生产任务上点「今天先发（出多少发多少）」做标记；
// 2. 车间照常生产，下班照常「报当日数量」。有标记的任务报完数，系统自动：
//    - 原明细改成车间累计报的数量，并按这个数直接确认完工 → 照常入库、生成打包任务；
//    - 剩下的数量拆成一条「续做」明细（指回原明细），带自己的生产任务（同一机台接着做）和交付记录；
//    - 单价不变（仍按整单下单数量定的档），两条金额加起来等于原来的金额；
// 3. 打包工照常装包、一包一个标签，按包发货；送货单写清「本次 / 整单 / 已发 / 待发」。
// 办公室也可以不等报数，直接点「现在就按已报数量先发」。
const CLOSED_LINE_STATUSES = new Set(["已作废", "已取消", "已关闭", "已完成", "已交付"]);
const CLOSED_TASK_STATUSES = new Set(["已完成", "已作废", "已取消"]);
const BLOCKED_TASK_STATUSES = new Set(["异常暂停", "数量差异待处理", "待完工确认"]);
const OUTBOUND_FULFILLMENT_STATUSES = new Set(["已交付", "已取消", "已作废", "已出库", "已拉走", "配送中"]);
export const EARLY_SHIPMENT_SPLIT_SNAPSHOT_TYPE = "early_shipment_split";

export function createEarlyShipmentSplitService({ buildOperationLog, completeProductionReport, now = () => new Date() } = {}) {
  if (typeof buildOperationLog !== "function") throw new TypeError("buildOperationLog must be a function");

  async function split({ workspace, productionTaskId, body = {}, operatorId }) {
    const plan = planEarlyShipmentSplit(workspace, productionTaskId, body);
    if (plan.error || plan.notFound) return plan;
    const splitAt = isoNow(now);
    const records = buildSplitRecords(workspace, plan, { operatorId, splitAt, reason: clean(body.reason) });
    const operationLog = buildOperationLog(workspace, {
      targetType: "order_line",
      targetId: plan.line.id,
      action: "split_order_line_for_early_shipment",
      operatorId,
      before: {
        orderLine: { orderLineId: plan.line.id, qty: plan.plannedQty, revision: plan.lineRevision },
        productionTask: { productionTaskId: plan.task.id, plannedQty: plan.plannedQty, taskStatus: plan.task.status, revision: plan.taskRevision, earlyShipRequestedAt: clean(plan.task.earlyShipRequestedAt) },
        fulfillment: { fulfillmentId: plan.fulfillment.id, expectedQty: plan.plannedQty },
        priceSnapshotId: plan.price.id,
      },
      after: {
        shippedNowQty: plan.readyQty,
        remainderQty: plan.remainderQty,
        remainderOrderLineId: records.remainderLine.id,
        remainderProductionTaskId: records.remainderTask.id,
        remainderFulfillmentId: records.remainderFulfillment.id,
        priceSnapshotIds: [records.linePrice.priceSnapshotId, records.remainderPrice.priceSnapshotId],
        amounts: { shippedNow: records.linePrice.finalAmount, remainder: records.remainderPrice.finalAmount, before: plan.price.finalAmount },
        trigger: body.trigger === "daily_progress" ? "车间下班报数后自动先发" : "办公室直接先发",
      },
      reason: clean(body.reason) || `先发已做好的 ${plan.readyQty} 个，剩下 ${plan.remainderQty} 个续做后再发`,
    });
    let saved;
    try {
      saved = await workspace.productionPackingTransactionRepository.splitForEarlyShipment({
        workspace,
        plan: {
          orderLineId: plan.line.id,
          productionTaskId: plan.task.id,
          fulfillmentId: plan.fulfillment.id,
          priceSnapshotId: plan.price.id,
          lineRevision: plan.lineRevision,
          taskRevision: plan.taskRevision,
          fulfillmentRevision: plan.fulfillmentRevision,
          plannedQty: plan.plannedQty,
          readyQty: plan.readyQty,
          remainderQty: plan.remainderQty,
          taskType: plan.task.taskType,
        },
        ...records,
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { productionTaskId, operatorId, expectedRevision: plan.taskRevision, readyQty: plan.readyQty, reason: clean(body.reason) },
      });
    } catch (error) {
      if (error?.statusCode === 409) return businessError(409, error.code || "BUSINESS_WRITE_CONFLICT", "订单或生产进度刚有变动，请刷新后再操作。");
      throw error;
    }
    // The packers' labels are the count check (owner): the ready part is confirmed complete right
    // away and goes to packing like any finished task. If that step cannot run (for example no
    // matching stock key), the split stands and the task waits for a normal 报工完成.
    const completion = await completeReadyPart(workspace, saved, plan, operatorId, body.idempotencyKey);
    return { response: { ...saved, shippedNowQty: plan.readyQty, remainderQty: plan.remainderQty, completion } };
  }

  async function completeReadyPart(workspace, saved, plan, operatorId, idempotencyKey) {
    if (typeof completeProductionReport !== "function") return { status: "pending", message: "请车间点「报工完成」后进打包。" };
    try {
      const result = await completeProductionReport({
        workspace,
        productionTaskId: plan.task.id,
        operatorId,
        body: {
          qualifiedQty: plan.readyQty,
          orderLineId: plan.line.id,
          processType: plan.task.taskType,
          expectedRevision: Number(saved.productionTask?.revision),
          remark: `先发：按车间已报的 ${plan.readyQty} 个确认完工，打包按包贴标签核数`,
          ...(idempotencyKey ? { idempotencyKey: `${String(idempotencyKey).slice(0, 100)}-complete` } : {}),
        },
      });
      if (result?.response) return { status: "completed", packingTaskId: result.response.packingTaskId ?? "" };
      return { status: "pending", message: `已拆分，但自动确认完工没成功：${result?.message || result?.code || "请车间点「报工完成」"}` };
    } catch (error) {
      return { status: "pending", message: `已拆分，但自动确认完工没成功：${error?.message || "请车间点「报工完成」"}` };
    }
  }

  return {
    splitForEarlyShipment: (input) => split(input),

    // Office: "today ship what is made" (or take the mark off again).
    async setEarlyShipmentRequest({ workspace, productionTaskId, body = {}, operatorId }) {
      const task = normalizeTask(findBy(workspace.productionTasks, productionTaskId, ["productionTaskId", "id"]));
      if (!task) return notFound("PRODUCTION_TASK_NOT_FOUND");
      const requested = body.requested !== false;
      if (positive(body.expectedRevision) !== revisionOf(task)) return staleError(revisionOf(task));
      if (requested) {
        const check = planEarlyShipmentSplit(workspace, productionTaskId, { expectedRevision: revisionOf(task) }, { allowNothingReady: true });
        if (check.error || check.notFound) return check;
      } else if (!clean(task.earlyShipRequestedAt)) {
        return businessError(409, "EARLY_SHIPMENT_NOT_REQUESTED", "这个任务没有安排今天先发。");
      }
      const requestedAt = isoNow(now);
      const note = clean(body.note).slice(0, 200);
      const operationLog = buildOperationLog(workspace, {
        targetType: "production_task",
        targetId: task.id,
        action: requested ? "request_early_shipment" : "cancel_early_shipment",
        operatorId,
        before: { earlyShipRequestedAt: clean(task.earlyShipRequestedAt), revision: revisionOf(task) },
        after: { requested, note },
        reason: note || (requested ? "客户要求今天先发，出多少发多少" : "取消今天先发"),
      });
      try {
        const saved = await workspace.productionPackingTransactionRepository.setEarlyShipmentRequest({
          workspace,
          productionTaskId: task.id,
          expectedRevision: revisionOf(task),
          requested,
          note,
          requestedAt,
          operatorId,
          operationLog,
          idempotencyKey: body.idempotencyKey,
          idempotencyPayload: { productionTaskId: task.id, operatorId, requested, note, expectedRevision: revisionOf(task) },
        });
        return { response: { ...saved, requested } };
      } catch (error) {
        if (error?.statusCode === 409) return businessError(409, error.code || "BUSINESS_WRITE_CONFLICT", "生产任务刚有变动，请刷新后再操作。");
        throw error;
      }
    },

    // Workshop: after the normal end-of-day quantity report on a task the office marked.
    async afterDailyProgress({ workspace, productionTaskId, operatorId, idempotencyKey }) {
      const task = normalizeTask(findBy(workspace.productionTasks, productionTaskId, ["productionTaskId", "id"]));
      if (!task || !clean(task.earlyShipRequestedAt)) return null;
      const result = await split({
        workspace,
        productionTaskId,
        operatorId,
        body: {
          expectedRevision: revisionOf(task),
          trigger: "daily_progress",
          reason: clean(task.earlyShipNote) || "办公室安排今天先发，车间下班报数后出多少发多少",
          ...(idempotencyKey ? { idempotencyKey: `${String(idempotencyKey).slice(0, 100)}-early` } : {}),
        },
      });
      if (result.response) return { status: "split", ...result.response };
      return { status: "not_split", code: result.code, message: result.message };
    },
  };
}

// Pure checks shared by the service and the desktop preview text.
export function planEarlyShipmentSplit(workspace, productionTaskId, body = {}, { allowNothingReady = false } = {}) {
  const task = normalizeTask(findBy(workspace.productionTasks, productionTaskId, ["productionTaskId", "id"]));
  if (!task) return notFound("PRODUCTION_TASK_NOT_FOUND");
  const line = normalizeLine(findBy(workspace.orderLines, task.orderLineId, ["orderLineId", "id"]));
  if (!line) return notFound("ORDER_LINE_NOT_FOUND");
  const taskRevision = revisionOf(task);
  if (positive(body.expectedRevision) !== taskRevision) return staleError(taskRevision);
  if (CLOSED_LINE_STATUSES.has(line.status)) return businessError(409, "EARLY_SHIPMENT_LINE_CLOSED", "这条订单明细已经关闭或交付，不能再拆分先发。");
  if (line.qtyBasis === "incoming_rolls") return businessError(409, "EARLY_SHIPMENT_QTY_BASIS_UNSUPPORTED", "按来料卷数下单的外加工，印完才有数量，不能先发一部分。");
  const externalPrint = ["external_print", "外加工印刷", "外加工", "同行加工印刷"].includes(line.orderType);
  const finalStage = task.taskType === "制袋" || (task.taskType === "丝印" && externalPrint);
  if (!finalStage) return businessError(409, "EARLY_SHIPMENT_STAGE_UNSUPPORTED", "只能在最后一道工序（制袋，外加工是丝印）先发做好的部分。");
  if (CLOSED_TASK_STATUSES.has(task.status)) return businessError(409, "EARLY_SHIPMENT_TASK_CLOSED", "生产任务已经完成，直接走打包即可。");
  if (BLOCKED_TASK_STATUSES.has(task.status)) {
    return businessError(409, "EARLY_SHIPMENT_TASK_BLOCKED", task.status === "待完工确认"
      ? "车间报的数量已经够整单了，请车间直接点「报工完成」。"
      : `生产任务现在是「${task.status}」，先处理完再拆分。`);
  }
  const otherOpenTasks = (workspace.productionTasks ?? []).filter((row) => clean(row.orderLineId ?? row.lineId) === line.id
    && clean(row.productionTaskId ?? row.id) !== task.id && !CLOSED_TASK_STATUSES.has(clean(row.taskStatus ?? row.status)));
  if (otherOpenTasks.length) return businessError(409, "EARLY_SHIPMENT_OTHER_TASK_OPEN", "这条明细还有别的工序没做完，不能先发。");
  const plannedQty = integer(task.plannedQty);
  if (!(plannedQty > 0) || integer(line.qty) !== plannedQty) {
    return businessError(409, "EARLY_SHIPMENT_QTY_ALLOCATION_REQUIRED", "生产计划数量和订单数量不一致，请先核对数量再拆分。");
  }
  const reports = (workspace.workshopReports ?? []).filter((report) => clean(report.productionTaskId ?? report.production_task_id) === task.id);
  if (reports.some((report) => reportKindOf(report) !== "daily_progress")) return businessError(409, "EARLY_SHIPMENT_TASK_CLOSED", "生产任务已经报过完工，直接走打包即可。");
  const readyQty = reports.reduce((sum, report) => sum + Math.max(0, integer(report.qualifiedQty ?? report.qualified_qty)), 0);
  if (!(readyQty > 0) && !allowNothingReady) return businessError(409, "EARLY_SHIPMENT_NOTHING_READY", "车间还没报当日数量，没有做好的可以先发。请车间先在手机上「报当日数量」。");
  if (readyQty >= plannedQty) return businessError(409, "EARLY_SHIPMENT_TASK_BLOCKED", "车间报的数量已经够整单了，请车间直接点「报工完成」。");
  const fulfillments = (workspace.fulfillments ?? []).filter((row) => clean(row.orderLineId ?? row.lineId) === line.id);
  if (fulfillments.length !== 1) return businessError(409, "EARLY_SHIPMENT_FULFILLMENT_REVIEW_REQUIRED", "这条明细的交付记录不是一条，请办公室先核对交付。");
  const fulfillment = normalizeFulfillment(fulfillments[0]);
  if (!fulfillment.untouched || integer(fulfillment.expectedQty) !== plannedQty) {
    return businessError(409, "EARLY_SHIPMENT_FULFILLMENT_STARTED", "这条明细已经开始出库或打印送货单，不能再拆分。");
  }
  const lineId = line.id;
  if ((workspace.packingTasks ?? []).some((row) => clean(row.orderLineId ?? row.lineId) === lineId)
    || (workspace.packages ?? []).some((row) => clean(row.orderLineId ?? row.order_line_id) === lineId)) {
    return businessError(409, "EARLY_SHIPMENT_PACKING_STARTED", "这条明细已经有打包记录，不能再拆分。");
  }
  if ((workspace.statementLines ?? []).some((row) => clean(row.orderLineId ?? row.order_line_id) === lineId)) {
    return businessError(409, "EARLY_SHIPMENT_STATEMENT_EXISTS", "这条明细已经进了对账，不能再拆分。");
  }
  if ((workspace.inventoryReservations ?? []).some((row) => clean(row.orderLineId ?? row.order_line_id) === lineId && clean(row.status) === "生效")) {
    return businessError(409, "EARLY_SHIPMENT_RESERVATION_EXISTS", "这条明细占用了现货库存，请先核对占用再拆分。");
  }
  const price = latestPriceSnapshot(workspace, lineId);
  if (!price) return businessError(409, "EARLY_SHIPMENT_PRICE_REQUIRED", "这条明细缺少订单价格，不能拆分金额。");
  if (price.ambiguous) return businessError(409, "EARLY_SHIPMENT_PRICE_REVIEW_REQUIRED", "这条明细的价格记录不唯一，请先核对价格。");
  if (integer(price.chargeableQty) !== plannedQty || !Number.isFinite(Number(price.finalAmount))) {
    return businessError(409, "EARLY_SHIPMENT_PRICE_REVIEW_REQUIRED", "这条明细含赠送或部分计费，请先核对计费数量再拆分。");
  }
  return {
    task,
    line,
    fulfillment,
    price,
    plannedQty,
    readyQty,
    remainderQty: plannedQty - readyQty,
    taskRevision,
    lineRevision: revisionOf(line),
    fulfillmentRevision: revisionOf(fulfillment),
  };
}

function buildSplitRecords(workspace, plan, { operatorId, splitAt, reason }) {
  const sequence = (workspace.orderLines ?? []).filter((row) => clean(row.splitFromOrderLineId) === plan.line.id).length + 1;
  const suffix = `R${sequence}`;
  const remainderLineId = uniqueId(workspace.orderLines, `${plan.line.id}-${suffix}`);
  const remainderTaskId = uniqueId(workspace.productionTasks, `${plan.task.id}-${suffix}`);
  const remainderFulfillmentId = uniqueId(workspace.fulfillments, `${plan.fulfillment.id}-${suffix}`);
  const otherFee = money(plan.price.otherFee);
  const adjustmentAmount = money(plan.price.adjustmentAmount);
  const variableAmount = money(Number(plan.price.finalAmount) - otherFee - adjustmentAmount);
  const shippedVariable = money(variableAmount * plan.readyQty / plan.plannedQty);
  const remainderVariable = money(variableAmount - shippedVariable);
  const versionNo = Math.max(0, ...(workspace.priceSnapshots ?? [])
    .filter((row) => clean(row.orderLineId ?? row.order_line_id) === plan.line.id && clean(row.snapshotType ?? row.snapshot_type) === "quantity_adjustment")
    .map((row) => integer(row.versionNo ?? row.version_no))) + 1;
  const splitNote = `先发 ${plan.readyQty} 个，剩下 ${plan.remainderQty} 个拆到续做明细 ${remainderLineId}；单价按原下单 ${plan.plannedQty} 个不变`;
  const evidence = { earlyShipmentSplit: { fromOrderLineId: plan.line.id, orderedQty: plan.plannedQty, readyQty: plan.readyQty, remainderQty: plan.remainderQty, sourcePriceSnapshotId: plan.price.id } };
  return {
    remainderLine: { id: remainderLineId, bizNo: `${plan.line.bizNo || plan.line.id}-${suffix}` },
    remainderTask: {
      id: remainderTaskId,
      bizNo: `${plan.task.bizNo || plan.task.id}-${suffix}`,
      publishedScheduleId: plan.task.publishedScheduleId ? `${plan.task.publishedScheduleId}-${suffix}` : "",
      taskStatus: "跨日继续",
    },
    remainderFulfillment: { id: remainderFulfillmentId, bizNo: `${plan.fulfillment.bizNo || plan.fulfillment.id}-${suffix}` },
    linePrice: {
      priceSnapshotId: `PS-${plan.line.id}-SPLIT-${sequence}`,
      snapshotType: "quantity_adjustment",
      versionNo,
      chargeableQty: plan.readyQty,
      finalAmount: money(shippedVariable + otherFee + adjustmentAmount),
      otherFee,
      adjustmentAmount,
      overrideReason: splitNote,
      sourceEvidence: evidence,
    },
    remainderPrice: {
      priceSnapshotId: `PS-${remainderLineId}-SPLIT`,
      snapshotType: EARLY_SHIPMENT_SPLIT_SNAPSHOT_TYPE,
      versionNo: 1,
      chargeableQty: plan.remainderQty,
      finalAmount: remainderVariable,
      otherFee: 0,
      adjustmentAmount: 0,
      overrideReason: splitNote,
      sourceEvidence: evidence,
    },
    operatorId,
    splitAt,
    reason,
  };
}

function latestPriceSnapshot(workspace, orderLineId) {
  const rows = (workspace.priceSnapshots ?? []).filter((row) => clean(row.orderLineId ?? row.order_line_id) === orderLineId);
  if (!rows.length) return null;
  const time = (row) => Date.parse(row.createdAt ?? row.created_at ?? "") || 0;
  // Same order as the delivery-note pricing (newest; a quantity adjustment wins a tie; then version).
  const sorted = [...rows].sort((a, b) => time(b) - time(a)
    || Number(clean(b.snapshotType ?? b.snapshot_type) === "quantity_adjustment") - Number(clean(a.snapshotType ?? a.snapshot_type) === "quantity_adjustment")
    || integer(b.versionNo ?? b.version_no) - integer(a.versionNo ?? a.version_no));
  const latest = sorted[0];
  return {
    id: clean(latest.priceSnapshotId ?? latest.id),
    chargeableQty: latest.chargeableQty ?? latest.chargeable_qty,
    finalAmount: latest.finalAmount ?? latest.final_amount ?? latest.amount,
    otherFee: latest.otherFee ?? latest.other_fee ?? 0,
    adjustmentAmount: latest.adjustmentAmount ?? latest.adjustment_amount ?? 0,
    raw: latest,
  };
}

function normalizeTask(row) {
  if (!row) return null;
  return { ...row, id: clean(row.productionTaskId ?? row.id), orderLineId: clean(row.orderLineId ?? row.lineId), taskType: clean(row.taskType ?? row.processType), status: clean(row.taskStatus ?? row.status), bizNo: clean(row.bizNo), publishedScheduleId: clean(row.publishedScheduleId) };
}

function normalizeLine(row) {
  if (!row) return null;
  return { ...row, id: clean(row.orderLineId ?? row.id), bizNo: clean(row.bizNo), qty: row.qty ?? row.originalQty, orderType: clean(row.orderType), status: clean(row.lineStatus ?? row.status), qtyBasis: clean(row.qtyBasis) || "pieces" };
}

function normalizeFulfillment(row) {
  const status = clean(row.status);
  const untouched = !OUTBOUND_FULFILLMENT_STATUSES.has(status)
    && !row.physicalOutboundAt && !row.loadedAt && !row.deliveredAt && !row.finalDeliveryAt
    && !clean(row.paperOutboundDocumentId) && !clean(row.packingGroupAnchorId)
    && (row.actualQty === undefined || row.actualQty === null || row.actualQty === "");
  return { ...row, id: clean(row.fulfillmentId ?? row.id), bizNo: clean(row.bizNo), status, untouched };
}

function reportKindOf(report) {
  return clean((report.evidence ?? report.evidence_json ?? {})?.reportKind);
}

function findBy(rows, id, keys) {
  const target = clean(id);
  return (rows ?? []).find((row) => keys.some((key) => clean(row?.[key]) === target)) ?? null;
}

function uniqueId(rows, base) {
  const taken = new Set((rows ?? []).flatMap((row) => [row?.id, row?.orderLineId, row?.productionTaskId, row?.fulfillmentId].map(clean)));
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

function revisionOf(row) {
  const value = Number(row?.revision ?? 1);
  return Number.isSafeInteger(value) && value >= 1 ? value : 1;
}

function positive(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 ? number : 0;
}

function integer(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

function clean(value) {
  return String(value ?? "").trim();
}

function isoNow(now) {
  const value = now();
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function staleError(currentRevision) {
  return { error: true, statusCode: 409, code: "BUSINESS_WRITE_CONFLICT", message: "生产任务刚有变动，请刷新后再操作。", details: { currentRevision } };
}

function notFound(code) {
  return { notFound: true, code };
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}
