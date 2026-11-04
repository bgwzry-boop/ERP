// P2-02 丝印个人认领（负责人 2026-11-04）：
// 丝印机没有宽幅限制，但要按油墨颜色排先后（先印白色，黑色和多色放收尾），
// 所以由丝印工自己从任务池里领。领了的任务挂到他的丝印机上、显示“已被XX领取”；
// 还没开始做时，本人可以释放，办公室也可以释放（要写原因）。
import { getTrustedWorkerMachine } from "./businessReadAccessService.mjs";

const CLAIMED_TASK_STATUS = "丝印已排产";
const UNCLAIMED_TASK_STATUS = "待排产";
const CLOSED_LINE_STATUSES = new Set(["已作废", "已取消", "已关闭", "已完成"]);
const OFFICE_RELEASE_PERMISSION = "production.schedule.publish";

export function createSilkScreenTaskClaimService({ buildOperationLog, now = () => new Date() } = {}) {
  if (typeof buildOperationLog !== "function") throw new TypeError("buildOperationLog must be a function");

  return {
    async claimTask({ workspace, productionTaskId, body = {}, operatorId, permissionContext }) {
      const machineId = getTrustedWorkerMachine(workspace, permissionContext);
      if (!machineId) return businessError(403, "PRODUCTION_MACHINE_ASSIGNMENT_REQUIRED", "尚未维护本人的机台安排，请联系办公室。");
      const machine = (workspace.machines ?? []).find((row) => clean(row.id ?? row.machineId) === machineId);
      if (!machine || machine.machineType !== "screen_printing") {
        return businessError(403, "SILK_SCREEN_CLAIM_MACHINE_REQUIRED", "只有丝印机的师傅可以领丝印任务。");
      }
      if (machine.enabled !== true || machine.status !== "active") {
        return businessError(409, "PRODUCTION_MACHINE_NOT_AVAILABLE", "你的丝印机当前停用，请联系办公室。");
      }
      const expectedRevision = positiveRevision(body.expectedRevision);
      if (!expectedRevision) return businessError(422, "VALIDATION_ERROR", "领任务需要带上任务版本，请刷新后重试。");

      const detail = await readDetail(workspace, productionTaskId);
      const beforeTask = detail?.productionTask;
      const beforeOrderLine = detail?.orderLine;
      if (!beforeTask) return notFound("PRODUCTION_TASK_NOT_FOUND");
      if (!beforeOrderLine) return notFound("ORDER_LINE_NOT_FOUND");
      if (beforeTask.taskType !== "丝印") return businessError(409, "SILK_SCREEN_CLAIM_TASK_TYPE_INVALID", "只有丝印任务可以自己领。");
      const claimer = clean(beforeTask.claimedByUserId);
      if (claimer === operatorId) return businessError(409, "SILK_SCREEN_TASK_ALREADY_CLAIMED_BY_YOU", "这个任务你已经领了。");
      if (claimer) return alreadyClaimed(beforeTask);
      if (clean(beforeTask.publishedScheduleId) || clean(beforeTask.machineId)) {
        return businessError(409, "SILK_SCREEN_TASK_ALREADY_SCHEDULED", "办公室已经把这个任务排到机台了，不能再领。");
      }
      if (!clean(beforeTask.taskStatus).includes(UNCLAIMED_TASK_STATUS)) {
        return businessError(409, "SILK_SCREEN_TASK_NOT_CLAIMABLE", `这个任务现在是“${clean(beforeTask.taskStatus)}”，不能领。`);
      }
      if (CLOSED_LINE_STATUSES.has(clean(beforeOrderLine.lineStatus))) {
        return businessError(409, "SILK_SCREEN_TASK_NOT_CLAIMABLE", "这条订单明细已关闭，不能领。");
      }
      if (Number(beforeTask.revision ?? 1) !== expectedRevision) return staleTask(beforeTask);

      const claimedAt = nowIso(now);
      const claimedByName = clean(permissionContext?.user?.displayName) || operatorId;
      const productionTask = {
        ...beforeTask,
        machineId,
        publishedScheduleId: `CLAIM-${safePart(machineId)}-${safePart(productionTaskId)}-${compactTimestamp(claimedAt)}`,
        taskStatus: CLAIMED_TASK_STATUS,
        status: CLAIMED_TASK_STATUS,
        claimedByUserId: operatorId,
        claimedByName,
        claimedAt,
        revision: expectedRevision,
        updatedAt: claimedAt,
      };
      const beforeLineStatus = clean(beforeOrderLine.lineStatus);
      const lineStatus = beforeLineStatus.includes(UNCLAIMED_TASK_STATUS) || !beforeLineStatus ? CLAIMED_TASK_STATUS : beforeLineStatus;
      const orderLine = { ...beforeOrderLine, lineStatus, status: lineStatus };
      const operationLog = buildOperationLog(workspace, {
        targetType: "production_task",
        targetId: productionTaskId,
        action: "claim_silk_screen_task",
        operatorId,
        before: { productionTask: claimSnapshot(beforeTask), orderLineStatus: beforeLineStatus },
        after: { productionTask: claimSnapshot(productionTask), orderLineStatus: lineStatus },
        reason: `丝印工自己领任务（${machineId}）`,
      });
      return runWrite(workspace, productionTaskId, () => workspace.productionPackingTransactionRepository.claimSilkScreenTask({
        workspace,
        productionTask,
        orderLine,
        beforeLineStatus,
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { productionTaskId, expectedRevision, operatorId },
      }), "claimed");
    },

    async releaseTask({ workspace, productionTaskId, body = {}, operatorId, permissionContext }) {
      const expectedRevision = positiveRevision(body.expectedRevision);
      if (!expectedRevision) return businessError(422, "VALIDATION_ERROR", "释放任务需要带上任务版本，请刷新后重试。");
      const detail = await readDetail(workspace, productionTaskId);
      const beforeTask = detail?.productionTask;
      if (!beforeTask) return notFound("PRODUCTION_TASK_NOT_FOUND");
      const claimer = clean(beforeTask.claimedByUserId);
      if (!claimer) return businessError(409, "SILK_SCREEN_TASK_NOT_CLAIMED", "这个任务没有人领，不需要释放。");
      const ownClaim = claimer === operatorId;
      const office = (permissionContext?.actionPermissions ?? []).includes(OFFICE_RELEASE_PERMISSION);
      if (!ownClaim && !office) {
        return businessError(403, "SILK_SCREEN_RELEASE_SCOPE_DENIED", "只能释放自己领的任务；别人领的请找办公室释放。");
      }
      const reason = clean(body.reason);
      if (!ownClaim && !reason) return businessError(422, "SILK_SCREEN_RELEASE_REASON_REQUIRED", "办公室释放别人领的任务，请写明原因。");
      if (hasStarted(detail) || clean(beforeTask.taskStatus) !== CLAIMED_TASK_STATUS) {
        return businessError(409, "SILK_SCREEN_TASK_ALREADY_STARTED", "这个任务已经开始报数量，不能释放；请联系办公室处理。");
      }
      if (Number(beforeTask.revision ?? 1) !== expectedRevision) return staleTask(beforeTask);

      const releasedAt = nowIso(now);
      const productionTask = {
        ...beforeTask,
        machineId: "",
        publishedScheduleId: "",
        taskStatus: UNCLAIMED_TASK_STATUS,
        status: UNCLAIMED_TASK_STATUS,
        claimedByUserId: "",
        claimedByName: "",
        claimedAt: "",
        revision: expectedRevision,
        updatedAt: releasedAt,
      };
      const beforeLineStatus = clean(detail.orderLine?.lineStatus);
      const lineStatus = beforeLineStatus === CLAIMED_TASK_STATUS ? UNCLAIMED_TASK_STATUS : beforeLineStatus;
      const orderLine = detail.orderLine ? { ...detail.orderLine, lineStatus, status: lineStatus } : null;
      const operationLog = buildOperationLog(workspace, {
        targetType: "production_task",
        targetId: productionTaskId,
        action: "release_silk_screen_task",
        operatorId,
        before: { productionTask: claimSnapshot(beforeTask), orderLineStatus: beforeLineStatus },
        after: { productionTask: claimSnapshot(productionTask), orderLineStatus: lineStatus, releasedBy: ownClaim ? "claimer" : "office" },
        reason: reason || "丝印工释放自己领的任务",
      });
      return runWrite(workspace, productionTaskId, () => workspace.productionPackingTransactionRepository.releaseSilkScreenTask({
        workspace,
        productionTask,
        orderLine,
        claimedByUserId: claimer,
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { productionTaskId, expectedRevision, operatorId, reason },
      }), "released");
    },
  };
}

async function runWrite(workspace, productionTaskId, write, outcome) {
  try {
    const saved = await write();
    return {
      response: {
        productionTaskId,
        outcome,
        productionTask: saved.productionTask,
        orderLine: saved.orderLine ?? null,
        operationLogId: saved.operationLogId,
      },
    };
  } catch (error) {
    if (error?.statusCode !== 409) throw error;
    // Someone else got there first (or the office changed the task). Say who, when we can.
    const latest = await readDetail(workspace, productionTaskId).catch(() => null);
    if (outcome === "claimed" && clean(latest?.productionTask?.claimedByUserId)) return alreadyClaimed(latest.productionTask, "刚被");
    return businessError(409, error.code || "BUSINESS_WRITE_CONFLICT", "任务刚有变动，请刷新后再试。");
  }
}

async function readDetail(workspace, productionTaskId) {
  return workspace.productionPackingReadRepository.getProductionTaskDetail({ workspace, productionTaskId });
}

function hasStarted(detail) {
  return (detail?.reports ?? []).length > 0 || Boolean(detail?.latestReport) || Boolean(detail?.dailyProgress);
}

function alreadyClaimed(task, prefix = "已被") {
  const name = clean(task.claimedByName) || "别人";
  return {
    error: true,
    statusCode: 409,
    code: "SILK_SCREEN_TASK_ALREADY_CLAIMED",
    message: prefix === "刚被" ? `这个任务刚被${name}领走了。` : `这个任务已被${name}领取。`,
    details: { claimedByName: name, currentRevision: Number(task.revision ?? 1) },
  };
}

function staleTask(task) {
  return {
    error: true,
    statusCode: 409,
    code: "BUSINESS_WRITE_CONFLICT",
    message: "任务刚有变动，请刷新后再试。",
    details: { currentRevision: Number(task.revision ?? 1) },
  };
}

function claimSnapshot(task) {
  return {
    productionTaskId: task.productionTaskId,
    taskStatus: task.taskStatus,
    machineId: task.machineId || "",
    publishedScheduleId: task.publishedScheduleId || "",
    claimedByUserId: task.claimedByUserId || "",
    claimedByName: task.claimedByName || "",
    revision: Number(task.revision ?? 1),
  };
}

function positiveRevision(value) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 1 ? revision : 0;
}

function clean(value) {
  return String(value ?? "").trim();
}

function safePart(value) {
  return clean(value).replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60);
}

function nowIso(now) {
  const value = now();
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function compactTimestamp(iso) {
  return iso.replace(/[-:.TZ]/g, "").slice(0, 17);
}

function notFound(code) {
  return { notFound: true, code };
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}
