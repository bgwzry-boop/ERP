import { DataState, MetricStrip, StatusPill } from "../../shared/ui/operational.jsx";
import { getDriverRouteLabel, getDriverRouteStopLabel } from "../../services/driverMobileApiClient.js";

export function DriverTaskList({ stats, visibleTasks, selectedTask, onSelect, statusTone }) {
  return (
    <>
      <MetricStrip items={stats} ariaLabel="司机送货任务摘要" />
      <div className="mobile-task-list">
        {visibleTasks.length ? visibleTasks.map((task) => (
          <button
            className={`mobile-task-row ${task.fulfillmentId === selectedTask?.fulfillmentId ? "active" : ""}`}
            key={task.fulfillmentId}
            onClick={() => onSelect(task.fulfillmentId)}
          >
            <div>
              <strong>[送货] {task.customerName} · {task.orderTail || task.orderLineId.slice(-5)}</strong>
              <span>{task.addressArea} · {getDriverRouteStopLabel(task)} · {task.packageSummary} · {task.qty} 个</span>
              <small>{getDriverRouteLabel(task)} · {task.latest} · {task.goodsSummary}</small>
            </div>
            <StatusPill tone={task.status === "配送中" ? "blue" : task.status === "送货异常" ? "danger" : statusTone(task.status)}>
              {task.status}
            </StatusPill>
          </button>
        )) : <DataState title="当前视图没有司机送货任务" detail="切换任务状态或刷新后重试。" compact />}
      </div>
    </>
  );
}
