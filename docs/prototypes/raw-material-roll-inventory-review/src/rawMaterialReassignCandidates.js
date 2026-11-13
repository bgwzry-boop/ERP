import { normalizeRawMaterialColorKey } from "../../../../src/features/raw-materials/rawMaterialInboundWorkflow.js";

// 负责人 2026-11-08：布照样整卷领；订单改了 / 领错单时，机边这卷剩下的料转挂到实际做的订单，
// 之后的消耗和成本算新订单。已经确认用掉的部分仍算原来那单。
export const CLOSED_TASK = new Set(["已完成", "已取消", "已作废"]);
export const CLOSED_LINE = new Set(["已关闭", "已取消", "已作废", "已交付", "已入库"]);
export const idOf = (row) => row?.productionTaskId ?? row?.id ?? "";
export const lineIdOf = (row) => row?.orderLineId ?? row?.order_line_id ?? row?.lineId ?? row?.id ?? "";

export function buildReassignCandidates({ roll, productionTasks = [], orderLines = [] }) {
  const colorKey = normalizeRawMaterialColorKey(roll?.factoryColor || roll?.supplierColor);
  const lines = new Map(orderLines.map((line) => [lineIdOf(line), line]));
  return productionTasks
    .filter((task) => idOf(task) && idOf(task) !== roll?.productionTaskId && !CLOSED_TASK.has(task.taskStatus ?? task.status))
    .map((task) => ({ task, line: lines.get(task.orderLineId ?? task.order_line_id) }))
    .filter(({ line }) => line && !CLOSED_LINE.has(line.lineStatus ?? line.status))
    .filter(({ line }) => !colorKey || normalizeRawMaterialColorKey(line.bagColor ?? line.color) === colorKey)
    .map(({ task, line }) => ({
      productionTaskId: idOf(task),
      label: [line.customerName || line.customer || line.customerId, line.size, line.bagColor ?? line.color, `${line.qty ?? line.originalQty ?? ""}个`, task.taskType, task.taskStatus ?? task.status].filter(Boolean).join(" "),
    }));
}
