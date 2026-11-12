import { useMemo, useState } from "react";
import { buildReassignCandidates, CLOSED_LINE, CLOSED_TASK, idOf, lineIdOf } from "./rawMaterialReassignCandidates.js";

export function RawMaterialReassignPanel({ roll, productionTasks, orderLines, disabled, onReassign }) {
  const candidates = useMemo(() => buildReassignCandidates({ roll, productionTasks, orderLines }), [roll, productionTasks, orderLines]);
  const [productionTaskId, setProductionTaskId] = useState("");
  const [reason, setReason] = useState("");
  const current = (productionTasks ?? []).find((task) => idOf(task) === roll?.productionTaskId);
  const currentLine = current ? (orderLines ?? []).find((line) => lineIdOf(line) === (current.orderLineId ?? current.order_line_id)) : null;
  const currentClosed = Boolean(current && (CLOSED_TASK.has(current.taskStatus ?? current.status) || CLOSED_LINE.has(currentLine?.lineStatus ?? currentLine?.status)));
  const ready = productionTaskId && reason.trim() && !disabled;
  return <section aria-labelledby="raw-reassign-title" className="raw-stock-reassign">
    <h3 id="raw-reassign-title">转挂到别的订单</h3>
    <p className="raw-stock-reassign-hint">订单改了或领错单时用：这卷机边剩下的 {roll?.weightKg} kg 改挂到实际要做的订单，之后的消耗和成本算新订单；已经确认用掉的部分仍算原来那单。</p>
    {currentClosed ? <p className="raw-stock-reassign-warning" role="status">这卷原来挂的订单已经作废或取消，请转挂到实际做的订单后再确认消耗。</p> : null}
    {candidates.length === 0 ? <p role="status">没有同颜色、还在做的订单可以转挂。</p> : <>
      <label>实际要做的订单<select disabled={disabled} onChange={(event) => setProductionTaskId(event.target.value)} value={productionTaskId}>
        <option value="">请选择</option>
        {candidates.map((item) => <option key={item.productionTaskId} value={item.productionTaskId}>{item.label}</option>)}
      </select></label>
      <label>转挂原因<textarea disabled={disabled} onChange={(event) => setReason(event.target.value)} placeholder="例如：客户减量，剩下的布做别的单 / 领错单" value={reason} /></label>
      <div className="action-row"><button className="primary-action" disabled={!ready} onClick={async () => {
        const saved = await onReassign({ productionTaskId, reason: reason.trim() });
        if (saved) { setProductionTaskId(""); setReason(""); }
      }} type="button">转挂到这个订单</button></div>
    </>}
  </section>;
}
