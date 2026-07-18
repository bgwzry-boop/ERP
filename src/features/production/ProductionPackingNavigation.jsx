import { StatusPill } from "../../shared/ui/operational.jsx";

export function PackingTaskFilterTabs({ filters, value, counts, visibleCount, onChange }) {
  return (
    <div className="production-task-focus-toolbar production-packing-filter-toolbar" role="tablist" aria-label="打包任务状态">
      <div>
        {filters.map((filter) => (
          <button
            type="button"
            role="tab"
            aria-selected={value === filter.value}
            className={value === filter.value ? "active" : ""}
            key={filter.value}
            onClick={() => onChange(filter.value)}
          >
            {filter.label} ({counts[filter.value] ?? 0})
          </button>
        ))}
      </div>
      <span className="production-task-machine-count">{visibleCount} 条</span>
    </div>
  );
}

export function PrintWorkspaceListHeader() {
  return (
    <div className="production-print-list-head">
      <strong>打印管理</strong>
      <span>4 个管理分区</span>
    </div>
  );
}

export function PrintWorkspaceNavigation({ items, value, onChange }) {
  return items.map((item) => (
    <button
      type="button"
      role="tab"
      aria-selected={value === item.value}
      className={`production-print-nav-item ${value === item.value ? "active" : ""}`}
      key={item.value}
      onClick={() => onChange(item.value)}
    >
      <StatusPill tone={item.tone}>{item.status}</StatusPill>
      <span>
        <strong>{item.label}</strong>
        <small>{item.summary}</small>
      </span>
      <b>{item.meta}</b>
    </button>
  ));
}
