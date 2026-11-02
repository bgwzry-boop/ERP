import { useEffect, useRef, useState } from "react";
import { PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { receivingReceiptTab } from "../../../../src/domain/officeRawMaterialInboundFlow.js";
import { SemanticTag } from "../../../../src/shared/ui/operational.jsx";
import { getOperationalStateTagValue } from "../../../../src/shared/labels.js";
import { buildReceiptRowPresentation } from "./receipt-presentation.js";
import { FormalReceivingWorkspace } from "./FormalReceivingWorkspace.jsx";
import { CollectionFeedback, EmptyWorkspace, WorkspaceErrorBoundary } from "./WorkspaceFeedback.jsx";
import "./receipt-queue.css";

const tabs = ["全部", "待核对", "退货单", "待打印", "待贴标", "异常"];
const widthKey = "erp.receiving.queueWidth.v1";
const clampWidth = value => Math.min(44, Math.max(27, Number(value) || 34));

export function ReceiptWorkspace({ formal, focusId, onOpenReceive, onManageColors }) {
  const receiving = formal.receiving;
  const { items = [], query = {}, stageCounts = {}, page = 1, pageSize = 20, total = 0 } = receiving;
  const activeTab = query.receiptStage || "全部";
  const [keyword, setKeyword] = useState(query.keyword || "");
  const [showQueue, setShowQueue] = useState(false);
  const queryScope = `${query.keyword || ""}::${query.receiptStage || "全部"}`;
  const [selectionScope, setSelectionScope] = useState(queryScope);
  const [queueWidth, setQueueWidth] = useState(() => { try { return clampWidth(localStorage.getItem(widthKey)); } catch { return 34; } });
  const containerRef = useRef(null);
  const lastFocus = useRef("");
  useEffect(() => { setKeyword(query.keyword || ""); }, [query.keyword]);
  useEffect(() => {
    if (receiving.hasLoaded && !receiving.loading && !receiving.error && !receiving.selectedId && items[0]?.id) { setSelectionScope(queryScope); void formal.actions.selectReceipt(items[0].id); }
  }, [receiving.hasLoaded, receiving.loading, receiving.error, receiving.selectedId, items, queryScope, formal.actions.selectReceipt]);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (keyword.trim() !== (query.keyword || "")) formal.actions.setReceiptQuery({ keyword: keyword.trim() });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [keyword, query.keyword, formal.actions.setReceiptQuery]);
  useEffect(() => {
    if (!focusId || focusId === lastFocus.current) return;
    lastFocus.current = focusId;
    setSelectionScope(queryScope);
    void formal.actions.selectReceipt(focusId);
    setShowQueue(false);
  }, [focusId, queryScope, formal.actions.selectReceipt]);
  useEffect(() => {
    try { localStorage.setItem(widthKey, String(queueWidth)); } catch { /* Layout preference is optional. */ }
  }, [queueWidth]);
  const selected = receiving.selectedInbound;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const selectTab = value => {
    formal.actions.setReceiptQuery({ receiptStage: value === "全部" ? "" : value });
    setShowQueue(true);
  };
  const clearFilters = () => {
    setKeyword("");
    formal.actions.setReceiptQuery({ keyword: "", receiptStage: "" });
  };
  const select = id => { setSelectionScope(queryScope); void formal.actions.selectReceipt(id); setShowQueue(false); };
  const countFor = tab => tab === "全部" ? receiving.metrics?.totalCount : stageCounts?.[tab];
  const hasFilter = Boolean(query.keyword || (query.receiptStage && query.receiptStage !== "全部"));
  const unavailable = Boolean(receiving.loading || receiving.error || receiving.status === "unloaded");
  const selectedVisible = Boolean(selected && (selectionScope === queryScope || focusId === selected.id));
  return <section className="receiving-page">
    <header className="receiving-page-heading"><h1>收货录入</h1><div>
      {onManageColors ? <button className="secondary-button" type="button" onClick={onManageColors}>厂家颜色资料</button> : null}
      <button className="secondary-button" type="button" onClick={() => void formal.actions.refreshReceipts()} disabled={receiving.loading}><ReloadOutlined aria-hidden="true" />刷新</button>
      <button className="primary" onClick={onOpenReceive} type="button"><PlusOutlined aria-hidden="true" />录入送货/退货单</button>
    </div></header>
    <div className={`secondary-workbench receiving-workbench${showQueue ? " is-showing-queue" : ""}`} ref={containerRef} style={{ "--receiving-queue-width": `${queueWidth}%` }}>
      <section className="secondary-list" aria-label="收货单据队列">
        <header><h2>待办单据</h2><span>{Number.isFinite(total) ? `${total} 张` : "—"}</span></header>
        <div aria-label="收货状态" className="secondary-tabs" role="tablist">{tabs.map(tab => <button type="button" key={tab} role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => selectTab(tab)}>{tab} <span>{receiving.hasLoaded ? countFor(tab) ?? "—" : "—"}</span></button>)}</div>
        <label className="receipt-queue-search"><SearchOutlined aria-hidden="true" /><input aria-label="搜索送货单位或单号" placeholder="搜索送货单位 / 单号" value={keyword} onChange={event => setKeyword(event.target.value)} /></label>
        <CollectionFeedback state={receiving} label="收货单据" onRetry={() => void formal.actions.refreshReceipts()} />
        <div className="receipt-queue-items">
          {items.map(row => {
            const view = buildReceiptRowPresentation(row);
            const stage = receivingReceiptTab(row) || view.reviewStatus;
            return <button key={row.id} type="button" className={`receipt-queue-item${row.id === receiving.selectedId ? " selected" : ""}`} aria-pressed={row.id === receiving.selectedId} onClick={() => select(row.id)}>
              <span className="receipt-queue-title"><strong>{view.supplierName}</strong><SemanticTag kind="state" label={stage} size="compact" value={getOperationalStateTagValue(stage === "异常" ? "blocked" : tabs.includes(stage) ? "pending" : row.status)} /></span>
              <span className="receipt-queue-number" title={`${view.ticketText} · ${row.id}`}>{row.deliveryNoteNo || row.id}</span>
              <span className="receipt-queue-summary"><span>{view.countLabel} · {view.totalWeightLabel}</span><time dateTime={row.receivedAt || undefined}>{view.arrivalTime}</time></span>
              {view.duplicateNeedsAttention ? <span className="receipt-queue-warning">{view.duplicateText}</span> : null}
            </button>;
          })}
          {!items.length && !unavailable ? <EmptyWorkspace title={hasFilter ? "没有匹配的单据" : "暂无待办单据"} description={hasFilter ? "清除搜索或切换状态，继续查看其他单据。" : "录入送货或退货单后，在这里核对。"} actionLabel={hasFilter ? "清除筛选" : "录入送货/退货单"} onAction={hasFilter ? clearFilters : onOpenReceive} /> : null}
        </div>
        <footer className="receipt-queue-pagination"><span>共 {Number.isFinite(total) ? total : "—"} 张</span><div><button type="button" aria-label="收货上一页" disabled={page <= 1 || receiving.loading} onClick={() => formal.actions.changeReceiptPage(page - 1)}>‹</button><span>{page} / {Number.isFinite(total) ? pageCount : "—"}</span><button type="button" aria-label="收货下一页" disabled={!Number.isFinite(total) || page >= pageCount || receiving.loading} onClick={() => formal.actions.changeReceiptPage(page + 1)}>›</button></div><select aria-label="每页单据数" value={pageSize} onChange={event => formal.actions.setReceiptQuery({ pageSize: Number(event.target.value) })}>{[10,20,50].map(size => <option key={size} value={size}>{size} 张/页</option>)}</select></footer>
      </section>
      <div className="receipt-splitter" role="separator" aria-label="调整单据列表宽度" aria-orientation="vertical" aria-valuemin={27} aria-valuemax={44} aria-valuenow={queueWidth} tabIndex={0} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); setQueueWidth(current => event.key === "Home" ? 27 : event.key === "End" ? 44 : clampWidth(current + (event.key === "ArrowRight" ? 1 : -1))); } }} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const bounds = containerRef.current.getBoundingClientRect(); setQueueWidth(clampWidth((event.clientX - bounds.left) / bounds.width * 100)); }} onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)} />
      <WorkspaceErrorBoundary workspaceKey={receiving.selectedId}>
        {receiving.selectedId ? <div className="receiving-detail-slot" hidden={!selectedVisible && !receiving.detailState?.loading}><FormalReceivingWorkspace key={receiving.selectedId} formal={formal} selectedId={receiving.selectedId} setSelectedId={select} onBackToQueue={() => setShowQueue(true)} /></div> : null}
        {!selectedVisible && !receiving.detailState?.loading ? <div className="formal-receiving-workspace"><EmptyWorkspace title={receiving.detailState?.error ? "这张单据暂时无法读取" : "选择一张单据开始核对"} error={Boolean(receiving.detailState?.error)} description={receiving.detailState?.error ? "保留当前列表，请重新读取这张单据。" : "可以搜索单号、送货单位，或切换上方状态。"} actionLabel={receiving.detailState?.error ? "重新读取" : "查看单据列表"} onAction={() => receiving.detailState?.error ? select(receiving.selectedId) : setShowQueue(true)} /></div> : null}
      </WorkspaceErrorBoundary>
    </div>
  </section>;
}
