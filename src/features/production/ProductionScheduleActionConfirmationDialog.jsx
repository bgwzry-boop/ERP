import { createPortal } from "react-dom";
import { InfoGrid } from "../../shared/ui/operational.jsx";
import {
  formatBusinessDecisionChannelAndTime,
  getBusinessDecisionContentSummary,
} from "../../components/businessDecisionPresentation.js";

export function ProductionScheduleActionConfirmationDialog({
  buildProductionTaskId,
  confirmation,
  currentUser,
  dialogRef,
  onReturnToEdit,
  onSubmit,
  submitting,
}) {
  if (!confirmation || typeof document === "undefined") return null;

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal schedule-action-confirmation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-action-confirmation-title"
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || submitting) return;
          event.preventDefault();
          onReturnToEdit();
        }}
      >
        <h3 id="schedule-action-confirmation-title">确认排产经营决定</h3>
        <InfoGrid rows={[
          ["动作", confirmation.action],
          ["任务 / 机台", confirmation.selectedTask ? `${confirmation.selectedTask.productionTaskId} / ${confirmation.selectedTask.machineId}` : `${confirmation.selectedLine?.productionTaskId || buildProductionTaskId(confirmation.selectedLine)} / ${confirmation.payload.machineId}`],
          ["原排产", getScheduleConfirmationOriginalState(confirmation)],
          ["变更后", getScheduleConfirmationTargetState(confirmation)],
          ["决定内容", confirmation.summary],
          ["业务决定人", confirmation.directAllowed ? (currentUser?.displayName || currentUser?.userId) : confirmation.payload.delegatedDecision?.decisionMakerEmployeeId],
          ["系统操作人", currentUser?.displayName || currentUser?.userId],
          ["决定渠道 / 时间", formatBusinessDecisionChannelAndTime(confirmation.directAllowed ? null : confirmation.payload.delegatedDecision)],
          ["决定证据内容", getBusinessDecisionContentSummary({ delegatedDecision: confirmation.directAllowed ? null : confirmation.payload.delegatedDecision, directSummary: confirmation.summary })],
          ["授权依据", confirmation.directAllowed ? "本人当前有效权限" : confirmation.payload.delegatedDecision?.authorizationBasis],
          ["预计影响", confirmation.effects],
        ]} />
        <div className="action-row modal-actions">
          <button type="button" disabled={submitting} onClick={onReturnToEdit}>返回修改</button>
          <button type="button" className="primary-action" disabled={submitting} onClick={onSubmit}>{submitting ? "提交中…" : "确认提交"}</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function getScheduleConfirmationOriginalState(confirmation) {
  if (!confirmation?.selectedTask) return "任务尚未发布排产";
  const queueSeq = Number(confirmation.selectedTask.queueSeq ?? 0);
  return `${confirmation.selectedTask.machineId || "机台待定"}${queueSeq > 0 ? ` #${queueSeq}` : ""}`;
}

function getScheduleConfirmationTargetState(confirmation) {
  const payload = confirmation?.payload ?? {};
  if (Array.isArray(payload.orderedProductionTaskIds)) {
    return `${payload.machineId || confirmation?.selectedTask?.machineId || "机台待定"} 新顺序：${payload.orderedProductionTaskIds.join(" → ")}`;
  }
  const machineId = payload.targetMachineId || payload.machineId || confirmation?.selectedTask?.machineId || "机台待定";
  const queueSeq = Number(payload.targetQueueSeq ?? 0);
  return `${machineId}${queueSeq > 0 ? ` #${queueSeq}` : ""}`;
}
