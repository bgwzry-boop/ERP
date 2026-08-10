import { DatabaseOutlined, ReloadOutlined } from "@ant-design/icons";
import { getSemanticTagDefinition } from "../labels.js";

const semanticTagSizes = new Set(["compact", "standard", "prominent"]);
const legacyStatusToneValues = Object.freeze({
  neutral: "unknown",
  blue: "normal",
  success: "done",
  warning: "pending",
  danger: "blocked",
});

export function WorkspaceNotice({ children, tone = "info" }) {
  return (
    <div className={`workspace-notice ${tone}`} role="status" aria-live="polite">
      <span className="workspace-notice-marker" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function WorkspacePageHeader({ title, description, contextLabel, onRefresh }) {
  return (
    <section className="workspace-page-header">
      <div className="workspace-page-title">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {contextLabel || onRefresh ? (
        <div className="workspace-page-actions">
          {contextLabel ? (
            <span className="workspace-context-label">
              <DatabaseOutlined aria-hidden="true" />
              {contextLabel}
            </span>
          ) : null}
          {onRefresh ? (
            <button type="button" className="ghost-button" onClick={onRefresh}>
              <ReloadOutlined aria-hidden="true" />
              刷新
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function OperationalPanel({ className = "", children, ariaLabel }) {
  return (
    <section className={`operational-panel ${className}`.trim()} aria-label={ariaLabel}>
      {children}
    </section>
  );
}

export function PanelHeader({ title, summary, eyebrow, actions }) {
  return (
    <div className="operational-panel-header">
      <div className="operational-panel-heading">
        {eyebrow ? <div className="operational-panel-eyebrow">{eyebrow}</div> : null}
        <h2>{title}</h2>
        {summary ? <span>{summary}</span> : null}
      </div>
      {actions ? <div className="operational-panel-actions">{actions}</div> : null}
    </div>
  );
}

export function FilterBar({ children, summary, secondarySummary = "", actions, className = "", ariaLabel = "筛选条件" }) {
  return (
    <section className={`operational-filter-bar ${className}`.trim()} aria-label={ariaLabel}>
      <div className="operational-filter-fields">{children}</div>
      {(summary || secondarySummary || actions) ? (
        <div className="operational-filter-footer">
          <div className="operational-filter-summary">
            {summary ? <span>{summary}</span> : null}
            {secondarySummary ? <span>{secondarySummary}</span> : null}
          </div>
          {actions ? <div className="operational-filter-actions">{actions}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

export function DataState({ title, detail = "", tone = "empty", compact = false }) {
  const role = tone === "danger" ? "alert" : "status";
  return (
    <div className={`data-state ${tone} ${compact ? "compact" : ""}`.trim()} role={role}>
      <span className="data-state-marker" aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {detail ? <span>{detail}</span> : null}
      </div>
    </div>
  );
}

export function MetricStrip({ items, ariaLabel = "状态摘要" }) {
  return (
    <div className="metric-strip" role="list" aria-label={ariaLabel}>
      {items.map(([label, value, tone]) => (
        <div className={`metric ${tone}`} role="listitem" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

export function DataTable({ columns, rows, className = "" }) {
  return (
    <div className={`data-table ${className}`} style={{ "--cols": columns.length }}>
      <div className="data-row head">
        {columns.map((column) => <span key={column}>{column}</span>)}
      </div>
      {rows.length ? (
        rows.map((row) => {
          const hasInteractiveCells = row.interactive === true;
          const RowElement = row.onClick && !hasInteractiveCells ? "button" : "div";
          const handleKeyDown = hasInteractiveCells && row.onClick
            ? (event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  row.onClick();
                }
              }
            : undefined;
          return (
            <RowElement
              className={`data-row ${row.active ? "active" : ""} ${row.tone ?? ""}`}
              aria-pressed={row.onClick ? Boolean(row.active) : undefined}
              data-row-id={row.id}
              key={row.id}
              onClick={row.onClick}
              onKeyDown={handleKeyDown}
              role={hasInteractiveCells && row.onClick ? "button" : undefined}
              tabIndex={hasInteractiveCells && row.onClick ? 0 : undefined}
              type={RowElement === "button" ? "button" : undefined}
            >
              {row.cells.map((cell, index) => <span key={`${row.id}-${index}`}>{cell}</span>)}
            </RowElement>
          );
        })
      ) : (
        <DataState title="没有匹配记录" compact />
      )}
    </div>
  );
}

export function DetailPane({ title, subtitle, children, className = "" }) {
  return (
    <aside className={`detail-pane operational-detail-pane ${className}`.trim()}>
      <div className="detail-head">
        <div>
          <span>{subtitle}</span>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </aside>
  );
}

export function InfoGrid({ rows }) {
  return (
    <div className="info-grid">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

export function Timeline({ items }) {
  return (
    <ol className="timeline">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ol>
  );
}

/**
 * Cross-surface business label. Pages provide a semantic kind and value;
 * the shared catalog owns the wording fallback and every visual treatment.
 */
export function SemanticTag({
  kind,
  value,
  size = "standard",
  label,
  className = "",
  title,
}) {
  const definition = getSemanticTagDefinition(kind, value);
  const resolvedSize = semanticTagSizes.has(size) ? size : "standard";
  const resolvedLabel = definition.known ? label ?? definition.label : definition.label;
  return (
    <span
      className={`erp-semantic-tag ${className}`.trim()}
      data-kind={definition.kind}
      data-known={definition.known ? "true" : "false"}
      data-size={resolvedSize}
      data-value={definition.value}
      title={title}
    >
      {resolvedLabel}
    </span>
  );
}

export function StatusPill({ tone = "neutral", children }) {
  const normalizedTone = legacyStatusToneValues[tone] ? tone : "neutral";
  return (
    <SemanticTag
      className={`status ${normalizedTone}`}
      kind="state"
      label={children}
      size="compact"
      value={legacyStatusToneValues[normalizedTone]}
    />
  );
}

export function Segmented({ value, onChange, items, ariaLabel = "视图切换" }) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          type="button"
          role="tab"
          aria-selected={value === item}
          className={value === item ? "selected" : ""}
          key={item}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
