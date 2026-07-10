export function MetricStrip({ items }) {
  return (
    <div className="metric-strip">
      {items.map(([label, value, tone]) => (
        <div className={`metric ${tone}`} key={label}>
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
        rows.map((row) => (
          <button className={`data-row ${row.active ? "active" : ""} ${row.tone ?? ""}`} key={row.id} onClick={row.onClick}>
            {row.cells.map((cell, index) => <span key={`${row.id}-${index}`}>{cell}</span>)}
          </button>
        ))
      ) : (
        <div className="empty-row">没有匹配记录</div>
      )}
    </div>
  );
}

export function DetailPane({ title, subtitle, children }) {
  return (
    <aside className="detail-pane">
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

export function StatusPill({ tone = "neutral", children }) {
  return <span className={`status ${tone}`}>{children}</span>;
}

export function Segmented({ value, onChange, items }) {
  return (
    <div className="segmented">
      {items.map((item) => (
        <button className={value === item ? "selected" : ""} key={item} onClick={() => onChange(item)}>{item}</button>
      ))}
    </div>
  );
}
