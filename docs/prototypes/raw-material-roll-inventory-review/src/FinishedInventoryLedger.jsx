import { useEffect, useState } from "react";
import { listOfficeInventoryLedgerEntries } from "../../../../src/services/officeInventoryApiClient.js";
import { inventoryLedgerQuantityLabel } from "../../../../src/domain/inventoryLedgerQuantityLabel.js";

const ledgerTime = new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"});
function displayLedgerTime(value) {
  if (!value || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return "未记录有效时间";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? ledgerTime.format(date) : "未记录有效时间";
}

export function FinishedInventoryLedger({ authState, inventoryItemId, onNavigate, initialPage = 1, onPageChange }) {
  return <Ledger key={`${inventoryItemId}:${authState?.session?.accessToken || ""}`} authState={authState} inventoryItemId={inventoryItemId} onNavigate={onNavigate} initialPage={initialPage} onPageChange={onPageChange} />;
}
function Ledger({ authState, inventoryItemId, onNavigate, initialPage, onPageChange }) {
  const [page, setPage] = useState(() => Number.isSafeInteger(initialPage) && initialPage > 0 ? initialPage : 1);
  useEffect(() => { onPageChange?.(page); }, [page]);
  const [navigationError, setNavigationError] = useState("");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const requestKey = `${page}:${revision}`;
  const current = result?.requestKey === requestKey ? result : null;
  useEffect(() => {
    let active = true;
    setNavigationError("");
    if (!inventoryItemId) return;
    listOfficeInventoryLedgerEntries({ authState, page, pageSize: 10, filters: { inventoryItemId } }, { serverRequired: true })
      .then(value => {
        if (!active) return;
        if (value.source !== "api" || value.blocked) throw new Error(value.error?.message || "流水读取失败，请重试。");
        if (value.page !== page || value.pageSize !== 10 || !Number.isSafeInteger(value.total) || value.total < 0 || !Array.isArray(value.items) || value.items.length > 10 || value.total < value.items.length) throw new Error("流水分页信息不一致，请重新读取。");
        if (new Set(value.items.map(item => item.ledgerId)).size !== value.items.length) throw new Error("流水记录重复，请重新读取。");
        if (value.items.some(item => item.inventoryItemId !== inventoryItemId)) throw new Error("流水与当前库存项不一致，请重新读取。");
        setResult({ ...value, requestKey });
      }).catch(error => { if (active) setResult({ requestKey, error: error.message || "流水读取失败，请重试。" }); });
    return () => { active = false; };
  }, [inventoryItemId, page, revision]);
  if (!inventoryItemId) return null;
  return <section className="finished-inventory-stock-section" aria-label="当前库存项流水">
    <header className="finished-inventory-section-heading"><h3>库存流水</h3>
    <button className="secondary-button" type="button" onClick={() => setRevision(value => value + 1)}>刷新流水</button></header>
    {navigationError ? <p role="alert">{navigationError}</p> : null}
    {!current ? <p role="status">正在读取流水…</p> : current.error ? <p role="alert">{current.error}</p> : <>
      {!current.items.length ? <p>当前页暂无流水</p> : current.items.map(entry => <article key={entry.ledgerId}>
        <h4>{entry.changeType || "未标明变动类型"}</h4>
        <dl className="business-facts">
          <div><dt>{inventoryLedgerQuantityLabel(entry)}</dt><dd>{entry.qtyBefore} → {entry.qtyAfter}（变动 {entry.qtyChange > 0 ? "+" : ""}{entry.qtyChange}）</dd></div>
          <div><dt>时间 / 操作人</dt><dd>{displayLedgerTime(entry.occurredAt)} · {entry.operatorName || entry.operatorId || "未记录"}</dd></div>
          <div style={{ gridColumn: "1 / -1" }}><dt>原因</dt><dd>{entry.reason || "未记录"}</dd></div>
          <div style={{ gridColumn: "1 / -1" }}><dt>来源编号</dt><dd>{entry.sourceId || "未记录"}</dd></div>
        </dl>
        {entry.sourceType === "fulfillment_cancel" && entry.sourceId && onNavigate ? <button className="secondary-button" type="button" onClick={() => {
          setNavigationError("");
          if (onNavigate("outbound-delivery", { fulfillmentId: entry.sourceId }) === false) setNavigationError("当前账号无法进入出库交付，请核对页面权限。");
        }}>查看来源出库记录</button> : null}
      </article>)}
      <p>第 {page} 页 · 共 {current.total} 条</p>
    </>}
    <div className="business-heading-actions">
      <button className="secondary-button" type="button" disabled={!current || page === 1} onClick={() => setPage(value => value - 1)}>上一页流水</button>
      <button className="secondary-button" type="button" disabled={!current || Boolean(current.error) || page * 10 >= current.total} onClick={() => setPage(value => value + 1)}>下一页流水</button>
    </div>
  </section>;
}
