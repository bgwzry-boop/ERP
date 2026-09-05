import { DataState, DataTable, StatusPill } from "../../shared/ui/operational.jsx";
import {
  formatProductionDailyProgressLabel,
  getProductionProcessLabel,
  inferPackageCountFromQty,
} from "./productionPackingPresentation.js";
import {
  PackingTaskFilterTabs,
  PrintWorkspaceListHeader,
  PrintWorkspaceNavigation,
} from "./ProductionPackingNavigation.jsx";

export function ProductionPackingTaskCards({
  activePrintWorkspaceTab,
  activeWorkbenchTab,
  buildProductionTaskId,
  completedPackingTaskCount,
  findCustomer,
  getLineColorSpecLabel,
  getLinePrintSide,
  onPackingTaskFilterChange,
  onPrintWorkspaceTabChange,
  onProductionTaskPriorityChange,
  onSelectPackingTask,
  onSelectProductionLine,
  packingTaskFilter,
  packingTaskFilters,
  packingTasks,
  pendingPackingTaskCount,
  printWorkspaceItems,
  productionAttentionCount,
  productionLines,
  productionTaskCards,
  productionTaskPriority,
  resolveInventoryItem,
  scheduleQueueMachineCount,
  selectedPackingTask,
  selectedProductionLine,
  statusTone,
  visiblePackingTasks,
  workbenchTabs,
}) {
  return (
    <>
      {activeWorkbenchTab === "production" ? (
        <div className="production-task-focus-toolbar">
          <div>
            <button
              type="button"
              className={productionTaskPriority === "attention" ? "active attention" : ""}
              aria-pressed={productionTaskPriority === "attention"}
              onClick={() => onProductionTaskPriorityChange("attention")}
            >
              异常优先 ({productionAttentionCount})
            </button>
            <button
              type="button"
              className={productionTaskPriority === "normal" ? "active normal" : ""}
              aria-pressed={productionTaskPriority === "normal"}
              onClick={() => onProductionTaskPriorityChange("normal")}
            >
              正常优先 ({Math.max(0, productionLines.length - productionAttentionCount)})
            </button>
          </div>
          <span className="production-task-machine-count">{scheduleQueueMachineCount} 台机台</span>
        </div>
      ) : activeWorkbenchTab === "packing" ? (
        <PackingTaskFilterTabs
          filters={packingTaskFilters}
          value={packingTaskFilter}
          counts={{ pending: pendingPackingTaskCount, completed: completedPackingTaskCount, all: packingTasks.length }}
          visibleCount={visiblePackingTasks.length}
          onChange={onPackingTaskFilterChange}
        />
      ) : (
        <PrintWorkspaceListHeader />
      )}
      <div className="production-task-cards" aria-label={`${workbenchTabs.find((tab) => tab.value === activeWorkbenchTab)?.label ?? "任务"}列表`}>
        {activeWorkbenchTab === "production" ? productionTaskCards.map((line) => {
          const inventoryItem = resolveInventoryItem(line);
          const isActive = line.id === selectedProductionLine?.id;
          return (
            <button className={`production-task-card ${isActive ? "active" : ""}`} key={line.id} onClick={() => onSelectProductionLine(line.id)}>
              <StatusPill tone={inventoryItem ? (line.confidence === "medium" ? "warning" : "success") : "danger"}>{inventoryItem ? (line.confidence === "medium" ? "待复核" : "正常") : "缺货"}</StatusPill>
              <div className="production-task-card-main">
                <strong>{buildProductionTaskId(line)}</strong>
                <span>{findCustomer(line.customerId).name} · {line.size} · {getLineColorSpecLabel(line)} · {getLinePrintSide(line)}</span>
                <small>计划 {line.qty} 个 · {line.latest}交付 · {line.fulfillment}</small>
              </div>
              <b>{inventoryItem ? line.status : "缺库存键"}</b>
            </button>
          );
        }) : activeWorkbenchTab === "packing" ? visiblePackingTasks.map((task) => {
          const line = task.orderLine;
          const isActive = task.packingTaskId === selectedPackingTask?.packingTaskId;
          return (
            <button className={`production-task-card ${isActive ? "active" : ""}`} key={task.packingTaskId} onClick={() => onSelectPackingTask(task.packingTaskId)}>
              <StatusPill tone={statusTone(task.status)}>{task.status}</StatusPill>
              <div className="production-task-card-main">
                <strong>{task.packingTaskId}</strong>
                <span>{findCustomer(line.customerId).name} · {line.size} · {getLineColorSpecLabel(line)}</span>
                <small>计划 {task.plannedQty} 个 · {task.packageCount ?? inferPackageCountFromQty(task.plannedQty)} 包</small>
              </div>
              <b>{task.status === "已完成" ? "待打印标签" : "待打包"}</b>
            </button>
          );
        }) : <PrintWorkspaceNavigation items={printWorkspaceItems} value={activePrintWorkspaceTab} onChange={onPrintWorkspaceTabChange} />}
        {activeWorkbenchTab === "packing" && !visiblePackingTasks.length ? <DataState title="当前视图没有打包任务" detail="切换待打包、已完成或全部查看。" compact /> : null}
      </div>
    </>
  );
}

export function ProductionPackingTaskTables({
  buildProductionTaskId,
  detailMode,
  findCustomer,
  getLineColorSpecLabel,
  onSelectPackingTask,
  onSelectProductionLine,
  packingTasks,
  productionLines,
  resolveInventoryItem,
  selectedPackingTask,
  selectedProductionLine,
  statusTone,
}) {
  return (
    <>
      <section className="detail-section compact-section legacy-production-section production-task-section">
        <div className="section-head-row">
          <h3>生产报工</h3>
          <span className="section-count">{productionLines.length} 条</span>
        </div>
        <DataTable
          className="production-task-table"
          columns={["任务", "客户", "货品", "规格", "计划", "工序", "状态", "进度/库存"]}
          rows={productionLines.map((line) => {
            const inventoryItem = resolveInventoryItem(line);
            const progressLabel = formatProductionDailyProgressLabel(line);
            return {
              id: line.id,
              active: line.id === selectedProductionLine?.id && detailMode === "production",
              tone: inventoryItem ? statusTone(line.status) : "danger",
              onClick: () => onSelectProductionLine(line.id),
              cells: [
                buildProductionTaskId(line),
                findCustomer(line.customerId).name,
                line.product,
                `${line.size} ${getLineColorSpecLabel(line)}`,
                line.qty,
                getProductionProcessLabel(line),
                line.status,
                progressLabel || (inventoryItem ? inventoryItem.zone : "缺库存键"),
              ],
            };
          })}
        />
      </section>
      <section className="detail-section compact-section legacy-production-section packing-task-section">
        <div className="section-head-row">
          <h3>打包任务</h3>
          <span className="section-count">{packingTasks.length} 条</span>
        </div>
        <DataTable
          className="packing-task-table"
          columns={["任务", "客户", "货品", "规格", "计划", "实包", "包裹", "状态"]}
          rows={packingTasks.map((task) => {
            const line = task.orderLine;
            return {
              id: task.packingTaskId,
              active: task.packingTaskId === selectedPackingTask?.packingTaskId && detailMode === "packing",
              tone: statusTone(task.status),
              onClick: () => onSelectPackingTask(task.packingTaskId),
              cells: [
                task.packingTaskId,
                findCustomer(line.customerId).name,
                line.product,
                `${line.size} ${getLineColorSpecLabel(line)}`,
                task.plannedQty,
                task.actualPackedQty || "未填",
                `${task.packageCount ?? inferPackageCountFromQty(task.plannedQty)}包`,
                task.status,
              ],
            };
          })}
        />
      </section>
    </>
  );
}
