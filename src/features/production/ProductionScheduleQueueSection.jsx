import { DataTable } from "../../shared/ui/operational.jsx";
import { BusinessDecisionHistoryPanel } from "../../components/BusinessDecisionHistoryPanel.jsx";
import { BusinessWriteConflictDialog } from "../../components/BusinessWriteConflictDialog.jsx";
import { DelegatedBusinessDecisionFields } from "../../components/DelegatedBusinessDecisionFields.jsx";
import {
  formatProductionScheduleQueueQty,
  formatProductionScheduleQueueSpec,
  formatProductionScheduleQueueStatus,
  queueMoveReasonOptions,
} from "./productionPackingPresentation.js";

export function ProductionScheduleQueueSection({
  authState,
  buildProductionTaskId,
  canMoveScheduleDown,
  canMoveScheduleUp,
  currentUser,
  detailMode,
  onConflictBack,
  onConflictRefresh,
  onMoveDirection,
  onMoveReasonChange,
  onMoveTargetMachineChange,
  onMoveTargetSeqChange,
  onMoveToTarget,
  onScheduleDecisionChange,
  onSelectScheduleQueueItem,
  productionPacking,
  queueMoveDisabled,
  queueMoveImpact,
  queueMovePositionOptions,
  queueMoveReason,
  queueMoveTargetMachineId,
  queueMoveTargetSeq,
  queueMoveTitle,
  scheduleActionConfirmationOpen,
  scheduleActionSubmitting,
  scheduleDecision,
  scheduleDecisionReady,
  scheduleDirectAllowed,
  scheduleQueueItems,
  scheduleQueueMachineOptions,
  scheduleWriteConflict,
  selectedProductionLine,
  selectedScheduleQueueItem,
  sequenceState,
}) {
  return (
    <section className="detail-section compact-section legacy-production-section schedule-queue-section">
      <div className="section-head-row">
        <h3>机台排产队列</h3>
        <div className="section-tools">
          <span className="section-count">{productionPacking.scheduleQueueTotal ?? scheduleQueueItems.length} 条</span>
          <button
            disabled={sequenceState.disabled || !canMoveScheduleUp || !scheduleDecisionReady || scheduleActionConfirmationOpen}
            title={sequenceState.title || (!selectedScheduleQueueItem ? "先选择机台排产队列中的任务" : !canMoveScheduleUp ? "当前任务已在本机台最前" : "上移当前任务")}
            onClick={() => onMoveDirection("up")}
          >
            上移
          </button>
          <button
            disabled={sequenceState.disabled || !canMoveScheduleDown || !scheduleDecisionReady || scheduleActionConfirmationOpen}
            title={sequenceState.title || (!selectedScheduleQueueItem ? "先选择机台排产队列中的任务" : !canMoveScheduleDown ? "当前任务已在本机台最后" : "下移当前任务")}
            onClick={() => onMoveDirection("down")}
          >
            下移
          </button>
          <div className="queue-move-controls" aria-label="移动排产任务">
            <label>
              <span>目标</span>
              <select
                value={queueMoveTargetMachineId}
                disabled={sequenceState.disabled || !selectedScheduleQueueItem || scheduleActionConfirmationOpen}
                title={sequenceState.title || "选择目标机台"}
                onChange={(event) => onMoveTargetMachineChange(event.target.value)}
              >
                {scheduleQueueMachineOptions.map((machineId) => (
                  <option key={machineId} value={machineId}>{machineId}</option>
                ))}
              </select>
            </label>
            <label>
              <span>位置</span>
              <select
                value={String(queueMoveTargetSeq)}
                disabled={sequenceState.disabled || !selectedScheduleQueueItem || scheduleActionConfirmationOpen}
                title={sequenceState.title || "选择插入位置"}
                onChange={(event) => onMoveTargetSeqChange(event.target.value)}
              >
                {queueMovePositionOptions.map((seq) => (
                  <option key={seq} value={seq}>#{seq}</option>
                ))}
              </select>
            </label>
            <label>
              <span>原因</span>
              <select
                value={queueMoveReason.value}
                disabled={sequenceState.disabled || !selectedScheduleQueueItem || scheduleActionConfirmationOpen}
                title={sequenceState.title || "选择本次排产调整原因"}
                onChange={(event) => onMoveReasonChange(event.target.value)}
              >
                {queueMoveReasonOptions.map((reason) => (
                  <option key={reason.value} value={reason.value}>{reason.label}</option>
                ))}
              </select>
            </label>
            <button disabled={queueMoveDisabled} title={queueMoveTitle} onClick={onMoveToTarget}>移动/插队</button>
          </div>
        </div>
      </div>
      <div className="queue-move-impact" aria-live="polite">{queueMoveImpact.text}</div>
      {!scheduleDirectAllowed ? (
        <DelegatedBusinessDecisionFields
          scope="production_schedule"
          businessType="production_task"
          businessId={selectedScheduleQueueItem?.productionTaskId || selectedProductionLine?.productionTaskId || (selectedProductionLine ? buildProductionTaskId(selectedProductionLine) : "")}
          authState={authState}
          operatorId={currentUser?.userId}
          operatorName={currentUser?.displayName}
          value={scheduleDecision}
          onChange={onScheduleDecisionChange}
          title="排产决定代录"
          disabled={scheduleActionSubmitting || scheduleActionConfirmationOpen}
        />
      ) : null}
      {scheduleDirectAllowed ? <p className="form-note">当前管理账号直接决定；操作人、决定内容、目标任务和影响范围仍写入审计。</p> : null}
      <DataTable
        className="production-schedule-queue-table"
        columns={["机台", "顺序", "任务", "客户", "货品规格", "计划/剩余", "状态"]}
        rows={scheduleQueueItems.map((item) => ({
          id: item.scheduleRecordId || item.publishedScheduleId || item.productionTaskId,
          active: Boolean(
            detailMode === "production"
              && selectedProductionLine
              && (item.orderLineId === selectedProductionLine.id
                || item.orderLineId === selectedProductionLine.orderLineId
                || item.productionTaskId === selectedProductionLine.productionTaskId
                || item.productionTaskId === buildProductionTaskId(selectedProductionLine)),
          ),
          tone: item.queueReason === "跨日继续" ? "warning" : "blue",
          onClick: () => onSelectScheduleQueueItem(item),
          cells: [
            item.machineId || "未分配",
            item.queueSeq ? `#${item.queueSeq}` : "-",
            item.publishedScheduleId || item.productionTaskId,
            item.customerName || item.customerId || "未匹配",
            formatProductionScheduleQueueSpec(item),
            formatProductionScheduleQueueQty(item),
            formatProductionScheduleQueueStatus(item),
          ],
        }))}
      />
      <BusinessDecisionHistoryPanel
        authState={authState}
        operatorId={currentUser?.userId}
        businessType="production_schedule_queue"
        businessId={selectedScheduleQueueItem?.machineId}
      />
      <BusinessWriteConflictDialog
        open={Boolean(scheduleWriteConflict)}
        error={scheduleWriteConflict}
        onBack={onConflictBack}
        onRefresh={onConflictRefresh}
      />
    </section>
  );
}
