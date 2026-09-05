import {
  MetricStrip,
  OperationalPanel,
  PanelHeader,
} from "../../shared/ui/operational.jsx";
import { ProductionScheduleQueueSection } from "./ProductionScheduleQueueSection.jsx";
import {
  ProductionPackingTaskCards,
  ProductionPackingTaskTables,
} from "./ProductionPackingTaskLists.jsx";

const PACKING_TASK_FILTERS = [
  { value: "pending", label: "待打包" },
  { value: "completed", label: "已完成" },
  { value: "all", label: "全部" },
];

export function ProductionPackingTaskPane({ runtime }) {
  const {
    activePrintWorkspaceTab, activeWorkbenchTab, authState, buildProductionTaskId,
    canMoveScheduleDown, canMoveScheduleUp, completedPackingTaskCount, currentUser,
    detailMode, findCustomer, focusNotice, getLineColorSpecLabel, getLinePrintSide,
    onConflictBack, onConflictRefresh, onMoveDirection, onMoveReasonChange,
    onMoveTargetMachineChange, onMoveTargetSeqChange, onMoveToTarget,
    onPackingTaskFilterChange, onPrintWorkspaceTabChange, onProductionTaskPriorityChange,
    onScheduleDecisionChange, onSelectPackingTask, onSelectProductionLine,
    onSelectScheduleQueueItem, packingTaskFilter, packingTasks, pendingPackingTaskCount,
    printWorkspaceItems, productionAttentionCount, productionLines, productionPacking,
    productionTaskCards, productionTaskPriority, queueMoveDisabled, queueMoveImpact,
    queueMovePositionOptions, queueMoveReason, queueMoveTargetMachineId, queueMoveTargetSeq,
    queueMoveTitle, resolveInventoryItem, scheduleActionConfirmationOpen,
    scheduleActionSubmitting, scheduleDecision, scheduleDecisionReady, scheduleDirectAllowed,
    scheduleQueueItems, scheduleQueueMachineOptions, scheduleQueueStatusText,
    scheduleWriteConflict, selectedPackingTask, selectedProductionLine,
    selectedScheduleQueueItem, sequenceState, stats, statusTone, taskListStatusText,
    visiblePackingTasks, workbenchTabs,
  } = runtime;

  return (
    <OperationalPanel className="table-pane production-packing-list-panel" ariaLabel="生产与打包任务列表">
      <MetricStrip items={stats} ariaLabel="生产与打包状态摘要" />
      <PanelHeader
        title="生产 / 打包任务池"
        summary="生产报工只认合格数量；机器计数只做凭证。打包完成不扣库存。"
        actions={(
          <div className="production-status-hints">
            <strong className="toolbar-focus-hint">{taskListStatusText}</strong>
            <strong className="toolbar-focus-hint">{scheduleQueueStatusText}</strong>
            {focusNotice ? <strong className="toolbar-focus-hint">{focusNotice}</strong> : null}
          </div>
        )}
      />
      <ProductionPackingTaskCards
        activePrintWorkspaceTab={activePrintWorkspaceTab}
        activeWorkbenchTab={activeWorkbenchTab}
        buildProductionTaskId={buildProductionTaskId}
        completedPackingTaskCount={completedPackingTaskCount}
        findCustomer={findCustomer}
        getLineColorSpecLabel={getLineColorSpecLabel}
        getLinePrintSide={getLinePrintSide}
        onPackingTaskFilterChange={onPackingTaskFilterChange}
        onPrintWorkspaceTabChange={onPrintWorkspaceTabChange}
        onProductionTaskPriorityChange={onProductionTaskPriorityChange}
        onSelectPackingTask={onSelectPackingTask}
        onSelectProductionLine={onSelectProductionLine}
        packingTaskFilter={packingTaskFilter}
        packingTaskFilters={PACKING_TASK_FILTERS}
        packingTasks={packingTasks}
        pendingPackingTaskCount={pendingPackingTaskCount}
        printWorkspaceItems={printWorkspaceItems}
        productionAttentionCount={productionAttentionCount}
        productionLines={productionLines}
        productionTaskCards={productionTaskCards}
        productionTaskPriority={productionTaskPriority}
        resolveInventoryItem={resolveInventoryItem}
        scheduleQueueMachineCount={scheduleQueueMachineOptions.length}
        selectedPackingTask={selectedPackingTask}
        selectedProductionLine={selectedProductionLine}
        statusTone={statusTone}
        visiblePackingTasks={visiblePackingTasks}
        workbenchTabs={workbenchTabs}
      />
      <ProductionScheduleQueueSection
        authState={authState}
        buildProductionTaskId={buildProductionTaskId}
        canMoveScheduleDown={canMoveScheduleDown}
        canMoveScheduleUp={canMoveScheduleUp}
        currentUser={currentUser}
        detailMode={detailMode}
        onConflictBack={onConflictBack}
        onConflictRefresh={onConflictRefresh}
        onMoveDirection={onMoveDirection}
        onMoveReasonChange={onMoveReasonChange}
        onMoveTargetMachineChange={onMoveTargetMachineChange}
        onMoveTargetSeqChange={onMoveTargetSeqChange}
        onMoveToTarget={onMoveToTarget}
        onScheduleDecisionChange={onScheduleDecisionChange}
        onSelectScheduleQueueItem={onSelectScheduleQueueItem}
        productionPacking={productionPacking}
        queueMoveDisabled={queueMoveDisabled}
        queueMoveImpact={queueMoveImpact}
        queueMovePositionOptions={queueMovePositionOptions}
        queueMoveReason={queueMoveReason}
        queueMoveTargetMachineId={queueMoveTargetMachineId}
        queueMoveTargetSeq={queueMoveTargetSeq}
        queueMoveTitle={queueMoveTitle}
        scheduleActionConfirmationOpen={scheduleActionConfirmationOpen}
        scheduleActionSubmitting={scheduleActionSubmitting}
        scheduleDecision={scheduleDecision}
        scheduleDecisionReady={scheduleDecisionReady}
        scheduleDirectAllowed={scheduleDirectAllowed}
        scheduleQueueItems={scheduleQueueItems}
        scheduleQueueMachineOptions={scheduleQueueMachineOptions}
        scheduleWriteConflict={scheduleWriteConflict}
        selectedProductionLine={selectedProductionLine}
        selectedScheduleQueueItem={selectedScheduleQueueItem}
        sequenceState={sequenceState}
      />
      <ProductionPackingTaskTables
        buildProductionTaskId={buildProductionTaskId}
        detailMode={detailMode}
        findCustomer={findCustomer}
        getLineColorSpecLabel={getLineColorSpecLabel}
        onSelectPackingTask={onSelectPackingTask}
        onSelectProductionLine={onSelectProductionLine}
        packingTasks={packingTasks}
        productionLines={productionLines}
        resolveInventoryItem={resolveInventoryItem}
        selectedPackingTask={selectedPackingTask}
        selectedProductionLine={selectedProductionLine}
        statusTone={statusTone}
      />
    </OperationalPanel>
  );
}
