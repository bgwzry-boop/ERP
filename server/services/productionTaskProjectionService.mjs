export function createProductionTaskProjectionService(dependencies = {}) {
  const {
    buildPhotoSummary,
    cleanServerText,
    findOrderLine,
    now = () => new Date(),
  } = dependencies;
  for (const [name, value] of Object.entries({ buildPhotoSummary, cleanServerText, findOrderLine, now })) {
    if (typeof value !== "function") {
      throw new TypeError(`createProductionTaskProjectionService requires ${name} to be a function`);
    }
  }

  return Object.freeze({
    buildProductionTaskFromBody,
    inferProductionMachineIdFromTaskType,
    inferProductionTaskTypeFromOrderLine,
    isProductionTaskCompletedStatus,
    resolvePublishedProductionLineStatus,
    resolvePublishedProductionTaskStatus,
    toProductionTaskSummary,
  });

  function buildProductionTaskFromBody(workspace, productionTaskId, body) {
    const orderLineId = body.orderLineId ?? body.lineId ?? "";
    const orderLine = findOrderLine(workspace, orderLineId);
    if (!orderLine) return null;
    const taskType = body.processType ?? inferProductionTaskTypeFromOrderLine(orderLine);
    const plannedQty = Number(body.plannedQty ?? orderLine.qty ?? orderLine.originalQty ?? 0);
    return {
      id: productionTaskId,
      productionTaskId,
      bizNo: body.bizNo ?? productionTaskId,
      orderLineId,
      lineId: orderLineId,
      taskType,
      machineId: body.machineId ?? inferProductionMachineIdFromTaskType(taskType),
      plannedQty,
      qty: plannedQty,
      taskStatus: "待开始",
      status: "待开始",
      createdBy: orderLine.createdBy ?? "",
      createdAt: body.createdAt ?? now().toISOString(),
    };
  }

  function inferProductionTaskTypeFromOrderLine(orderLine) {
    const status = cleanServerText(orderLine?.lineStatus ?? orderLine?.status);
    if (status.includes("丝印") || status.includes("补印")) return "丝印";
    return "制袋";
  }

  function inferProductionMachineIdFromTaskType(taskType) {
    return cleanServerText(taskType).includes("丝印") ? "PRINT-01" : "BAG-01";
  }

  function isProductionTaskCompletedStatus(status) {
    const text = cleanServerText(status);
    return text === "已完成" || text.toLowerCase() === "completed" || text.toLowerCase() === "done";
  }

  function resolvePublishedProductionTaskStatus({ taskType, beforeTask, beforeOrderLine }) {
    const currentStatus = cleanServerText(
      beforeTask?.taskStatus ??
        beforeTask?.status ??
        beforeOrderLine?.lineStatus ??
        beforeOrderLine?.status,
    );
    if (!currentStatus || currentStatus.includes("待排产") || currentStatus === "待开始") {
      return `${cleanServerText(taskType) || "制袋"}已排产`;
    }
    return currentStatus;
  }

  function resolvePublishedProductionLineStatus({ taskType, beforeOrderLine, taskStatus }) {
    const currentStatus = cleanServerText(beforeOrderLine?.lineStatus ?? beforeOrderLine?.status);
    if (!currentStatus || currentStatus.includes("待排产")) {
      return `${cleanServerText(taskType) || "制袋"}已排产`;
    }
    return cleanServerText(taskStatus) || currentStatus;
  }

  function toProductionTaskSummary(task, orderLine) {
    const productionTaskId = task.productionTaskId ?? task.id;
    return {
      productionTaskId,
      bizNo: task.bizNo ?? productionTaskId,
      orderLineId: task.orderLineId ?? task.lineId ?? orderLine?.id ?? "",
      taskType: task.taskType ?? task.processType ?? "",
      machineId: task.machineId ?? "",
      publishedScheduleId: task.publishedScheduleId ?? "",
      plannedQty: Number(task.plannedQty ?? task.qty ?? orderLine?.qty ?? 0),
      taskStatus: task.taskStatus ?? task.status ?? "",
      status: task.status ?? task.taskStatus ?? "",
      revision: Math.max(1, Math.trunc(Number(task.revision ?? 1))),
      finishedGoodsPhoto: buildPhotoSummary(null, task, orderLine),
      createdBy: task.createdBy ?? "",
      createdAt: task.createdAt ?? "",
      updatedAt: task.updatedAt ?? "",
    };
  }
}
