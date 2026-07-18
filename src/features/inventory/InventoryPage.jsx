import { useState } from "react";
import { SearchOutlined } from "@ant-design/icons";
import {
  DataState,
  DataTable,
  DetailPane,
  FilterBar,
  InfoGrid,
  OperationalPanel,
  Segmented,
  StatusPill,
} from "../../shared/ui/operational.jsx";
import { formatOperationalError } from "../../shared/ui/errorPresentation.js";

const INVENTORY_DETAIL_TABS = ["概览", "留货", "流水", "修正"];

const defaultInventoryLedgerPanelFilters = {
  keyword: "",
  changeType: "全部",
  sourceType: "全部",
  dateFrom: "",
  dateTo: "",
};

const inventoryLedgerChangeTypeOptions = [
  { value: "全部", label: "全部变动" },
  { value: "correction", label: "库存修正" },
  { value: "订单占用", label: "订单占用" },
  { value: "释放占用", label: "释放占用" },
  { value: "出库扣减", label: "出库扣减" },
  { value: "生产入库", label: "生产入库" },
  { value: "生产完成占用", label: "生产占用" },
  { value: "打包完成确认", label: "打包完成" },
  { value: "订单改量释放占用", label: "改量释放" },
  { value: "订单改量补占用", label: "改量补占" },
  { value: "取消出库释放占用", label: "取消出库" },
];

const inventoryLedgerSourceTypeOptions = [
  { value: "全部", label: "全部来源" },
  { value: "inventory_correction", label: "库存修正" },
  { value: "order_confirm", label: "订单确认" },
  { value: "inventory_reservation_release", label: "释放占用" },
  { value: "order_line_quantity_adjustment", label: "订单改量" },
  { value: "order_line_void", label: "订单作废" },
  { value: "fulfillment_complete", label: "完成出库" },
  { value: "fulfillment_pickup", label: "确认拉走" },
  { value: "fulfillment_cancel", label: "取消出库" },
  { value: "production_report", label: "生产报工" },
  { value: "production_report_reservation", label: "生产占用" },
  { value: "packing_complete", label: "打包完成" },
];

export function InventoryPage({
  inventoryRecords,
  inventoryMeta = {},
  inventoryLedgerEntries = [],
  inventoryLedgerMeta = {},
  inventoryLedgerFilters = defaultInventoryLedgerPanelFilters,
  setInventoryLedgerFilters,
  inventoryCorrectionDetailState = {},
  inventoryCorrectionQueueState = {},
  inventoryIntentState = {},
  selectedStockId,
  setSelectedStockId,
  setToast,
  onCreateCorrectionDraft,
  onLinkCorrectionAttachment,
  onConfirmCorrectionDraft,
  onOpenCorrectionDraft,
  onRefreshCorrectionQueue,
  onRefreshInventoryLedger,
  onRefreshInventoryIntents,
  onCreateTemporaryHold,
  onReleaseTemporaryHold,
  onExtendTemporaryHold,
  onConvertTemporaryHoldToOrder,
  onLocateInventoryLedgerSource,
  helpers,
}) {
  const { availableQty, formatStockKey, getStockStateGroup, getStockStateTone, getStockTone, getStockTrustLabel, getUiActionState, isPendingStock, uniqueStockOptions } = helpers;
  const [filters, setFilters] = useState({ query: "", size: "全部", color: "全部", handle: "全部", style: "全部", trust: "全部" });
  const [stockView, setStockView] = useState("常用库存");
  const [detailTab, setDetailTab] = useState("概览");
  const [requestQty, setRequestQty] = useState(500);
  const [correctionActual, setCorrectionActual] = useState("");
  const [correctionReason, setCorrectionReason] = useState("盘点差异");
  const [correctionDraft, setCorrectionDraft] = useState(null);
  const [correctionEvidenceFile, setCorrectionEvidenceFile] = useState(null);
  const [correctionEvidenceUploading, setCorrectionEvidenceUploading] = useState(false);
  const [holdInventorySelections, setHoldInventorySelections] = useState({});
  const [holdExpiryDrafts, setHoldExpiryDrafts] = useState({});
  const [holdExtensionDrafts, setHoldExtensionDrafts] = useState({});
  const ledgerFilters = { ...defaultInventoryLedgerPanelFilters, ...inventoryLedgerFilters };
  const visible = inventoryRecords.filter((item) => {
    const queryText = `${item.size} ${item.color} ${item.handle} ${item.style} ${item.zone} ${item.state}`.toLowerCase();
    if (!inventoryMatchesView(item, stockView, { availableQty, isPendingStock })) return false;
    if (filters.query.trim() && !queryText.includes(filters.query.trim().toLowerCase())) return false;
    if (filters.size !== "全部" && item.size !== filters.size) return false;
    if (filters.color !== "全部" && item.color !== filters.color) return false;
    if (filters.handle !== "全部" && item.handle !== filters.handle) return false;
    if (filters.style !== "全部" && item.style !== filters.style) return false;
    if (filters.trust !== "全部" && (filters.trust === "估算/待复核") !== item.estimated) return false;
    return true;
  });
  const hasVisibleInventory = visible.length > 0;
  const selected = visible.find((item) => item.id === selectedStockId) ?? visible[0] ?? inventoryRecords[0];
  if (!inventoryRecords.length) {
    return (
      <section className="page-grid split-detail operational-split-workbench inventory-workbench">
        <OperationalPanel className="table-pane inventory-list-panel" ariaLabel="库存记录列表">
          <DataState title="暂无库存记录" detail="请先导入并审核库存基础数据。" />
        </OperationalPanel>
        <DetailPane className="inventory-detail-pane" title="库存查询" subtitle="暂无可显示库存">
          <InfoGrid rows={[["列表", getInventoryListSourceLabel(inventoryMeta)]]} />
          <DataState title="没有可显示的库存详情" compact />
        </DetailPane>
      </section>
    );
  }
  const selectedLedgerEntries = inventoryLedgerEntries
    .filter((entry) => !entry.inventoryItemId || entry.inventoryItemId === selected.id)
    .slice(0, 20);
  const available = availableQty(selected);
  const safeRequestQty = Number(requestQty || 0);
  const shortage = Math.max(0, safeRequestQty - available);
  const similarStocks = inventoryRecords
    .filter((item) => item.id !== selected.id)
    .filter((item) => item.size === selected.size && item.handle === selected.handle && item.style === selected.style)
    .filter((item) => !isPendingStock(item) && availableQty(item) > 0)
    .slice(0, 3);
  const customerText =
    shortage > 0
      ? `${formatStockKey(selected)} 当前可用 ${Math.max(0, available)} 个，您要 ${safeRequestQty} 个还差 ${shortage} 个。可以确认等生产、先发可用数量，或改数量/颜色/款式。`
      : `${formatStockKey(selected)} 当前可用 ${available} 个，可满足 ${safeRequestQty} 个；正式确认前我们会再复核库存。`;
  const stockViewTabs = getInventoryViewTabs(inventoryRecords, { availableQty, isPendingStock });
  const correctionState = getUiActionState("inventory", "生成修正草稿");
  const correctionConfirmState = getUiActionState("inventory", "确认修正生效");
  const correctionQueueItems = Array.isArray(inventoryCorrectionQueueState.items) ? inventoryCorrectionQueueState.items : [];
  const inventoryIntents = Array.isArray(inventoryIntentState.items) ? inventoryIntentState.items : [];
  const temporaryHolds = Array.isArray(inventoryIntentState.holds) ? inventoryIntentState.holds : [];

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters() {
    setFilters({ query: "", size: "全部", color: "全部", handle: "全部", style: "全部", trust: "全部" });
    setStockView("常用库存");
    setToast("库存筛选已重置，默认隐藏待处理/报废库存。");
  }

  function confirmInventoryCorrection(item) {
    const correctionDraftId = String(item?.correctionDraftId ?? item?.id ?? "").trim() || "草稿号待确认";
    const inventoryReference = [item?.stockKey || item?.inventoryItemId || "库存项待确认", item?.zone]
      .filter(Boolean)
      .join(" / ");
    const confirmed = window.confirm(
      `确认库存修正生效？\n修正草稿：${correctionDraftId}\n库存项：${inventoryReference}\n系统库存：${item?.systemQty ?? "待确认"}\n实盘库存：${item?.actualQty ?? "待确认"}\n差异：${formatInventoryLedgerQty(item?.diff)}\n原因：${item?.reason || "原因待确认"}\n\n确认后将更新库存、写入库存流水、处理关联待办和操作日志；请确认盘点结果已复核。`,
    );
    if (!confirmed) return;
    onConfirmCorrectionDraft?.(item);
  }

  function updateLedgerFilter(field, value) {
    setInventoryLedgerFilters?.((current) => ({
      ...defaultInventoryLedgerPanelFilters,
      ...current,
      [field]: value,
    }));
  }

  function applyLedgerFilters(nextFilters = ledgerFilters) {
    const normalized = normalizeInventoryLedgerPanelFilters(nextFilters);
    setInventoryLedgerFilters?.(normalized);
    onRefreshInventoryLedger?.({ stockId: selected.id, filters: normalized, showToast: true });
  }

  function resetLedgerFilters() {
    setInventoryLedgerFilters?.(defaultInventoryLedgerPanelFilters);
    onRefreshInventoryLedger?.({ stockId: selected.id, filters: defaultInventoryLedgerPanelFilters, showToast: true });
    setToast("库存流水筛选已重置。");
  }

  function handleLedgerFilterKeyDown(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyLedgerFilters();
  }

  async function createCorrectionDraft() {
    if (correctionState.disabled) {
      setToast(correctionState.title);
      return;
    }
    const actualQty = correctionActual === "" ? selected.inStock : Number(correctionActual || 0);
    if (actualQty < 0) {
      setToast("实盘数量不能小于 0。");
      return;
    }
    const draft = await onCreateCorrectionDraft?.({ stock: selected, actualQty, reason: correctionReason });
    if (draft) setCorrectionDraft(draft);
  }

  async function uploadCorrectionEvidence() {
    if (!correctionDraft?.id && !correctionDraft?.correctionDraftId) {
      setToast("请先生成库存修正草稿。");
      return;
    }
    if (!correctionEvidenceFile) {
      setToast("请先选择库存修正凭证图片或 PDF。");
      return;
    }
    setCorrectionEvidenceUploading(true);
    try {
      const result = await onLinkCorrectionAttachment?.({ draft: correctionDraft, file: correctionEvidenceFile });
      if (!result?.blocked && result?.attachmentIds) {
        setCorrectionDraft((current) => ({
          ...current,
          attachmentIds: result.attachmentIds,
          revision: result.linkage?.revision ?? current?.revision,
        }));
        setCorrectionEvidenceFile(null);
      }
    } finally {
      setCorrectionEvidenceUploading(false);
    }
  }

  async function runTemporaryHoldAction(action, payload) {
    const result = await action?.(payload);
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  return (
    <section className="page-grid split-detail operational-split-workbench inventory-workbench">
      <OperationalPanel className="table-pane inventory-list-panel" ariaLabel="库存记录列表">
        <div className="inventory-status-tabs" role="tablist" aria-label="库存状态快捷筛选">
          {stockViewTabs.map((item) => (
            <button
              type="button"
              role="tab"
              aria-selected={stockView === item.label}
              className={stockView === item.label ? "active" : ""}
              key={item.label}
              onClick={() => setStockView(item.label)}
            >
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </button>
          ))}
        </div>
        <FilterBar
          className="inventory-filter-bar"
          ariaLabel="库存查询筛选"
          summary={`命中 ${visible.length} / ${inventoryRecords.length} 个库存键；${getInventoryListSourceLabel(inventoryMeta)}。`}
          secondarySummary={`当前显示${stockView}${stockView === "待处理" ? "，仅供核对" : ""}`}
          actions={<button type="button" className="ghost-button" onClick={resetFilters}>重置</button>}
        >
          <div className="filter-grid inventory-filter-grid">
            <label className="inventory-query-field">
              <span>关键词</span>
              <div className="inventory-query-control">
                <SearchOutlined />
                <input aria-label="库存关键词" placeholder="尺寸 / 颜色 / 款式 / 库区" value={filters.query} onChange={(event) => updateFilter("query", event.target.value)} />
              </div>
            </label>
            {[
              ["size", "尺寸", uniqueStockOptions(inventoryRecords, "size")],
              ["color", "颜色", uniqueStockOptions(inventoryRecords, "color")],
              ["handle", "提手", uniqueStockOptions(inventoryRecords, "handle")],
              ["style", "款式", uniqueStockOptions(inventoryRecords, "style")],
            ].map(([field, label, options]) => (
              <label key={field}>
                <span>{label}</span>
                <select value={filters[field]} onChange={(event) => updateFilter(field, event.target.value)}>
                  <option>全部</option>
                  {options.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            ))}
            <label>
              <span>可信度</span>
              <select value={filters.trust} onChange={(event) => updateFilter("trust", event.target.value)}>
                {["全部", "已清点", "估算/待复核"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          {inventoryMeta.error && <DataState title="库存列表同步失败" detail={formatOperationalError(inventoryMeta.error)} tone="danger" compact />}
        </FilterBar>
        {hasVisibleInventory ? (
          <DataTable
            className="inventory-table"
            columns={["库存规格", "款式 / 库区", "状态", "在库", "占用 / 锁定", "可用", "可信"]}
            rows={visible.map((row) => {
              const available = availableQty(row);
              return {
                id: row.id,
                active: row.id === selected.id,
              tone: getStockTone(row),
              onClick: () => setSelectedStockId(row.id),
              cells: [
                  <InventoryCell primary={`${row.size} / ${row.color}`} secondary={row.handle} />,
                  <InventoryCell primary={row.style} secondary={row.zone} />,
                  <StatusPill tone={getStockStateTone(getStockStateGroup(row))}>{getStockStateGroup(row)}</StatusPill>,
                  <InventoryQuantity value={row.inStock} />,
                  <InventoryQuantity value={`${row.reserved} / ${row.locked}`} />,
                  <InventoryQuantity value={available} strong />,
                  <StatusPill tone={row.estimated ? "warning" : "success"}>{getStockTrustLabel(row)}</StatusPill>,
                ],
              };
            })}
          />
        ) : (
          <DataState title="没有匹配的库存键" detail="调整筛选条件或重置筛选后重试。" />
        )}
      </OperationalPanel>
      <DetailPane className="inventory-detail-pane" title="库存明细" subtitle={hasVisibleInventory ? `${selected.size} ${selected.color} ${selected.handle} ${selected.style}` : "当前筛选无结果"}>
        {hasVisibleInventory ? (
          <div className="inventory-detail-scroll">
        <div className="inventory-detail-overview">
          <div className="inventory-detail-statuses" aria-label="当前库存状态">
            <StatusPill tone={getStockStateTone(getStockStateGroup(selected))}>{getStockStateGroup(selected)}</StatusPill>
            <StatusPill tone={selected.estimated ? "warning" : "success"}>{getStockTrustLabel(selected)}</StatusPill>
          </div>
          <div className="inventory-detail-product">
            <div>
              <span>库存规格</span>
              <strong>{selected.size} / {selected.color}</strong>
              <small>{selected.handle} / {selected.style} / {selected.zone}</small>
            </div>
            <dl>
              <div><dt>可用</dt><dd>{available}<small> 个</small></dd></div>
              <div><dt>在库</dt><dd>{selected.inStock}<small> 个</small></dd></div>
            </dl>
          </div>
        </div>
        <div className="operational-detail-tabs">
          <Segmented ariaLabel="库存详情视图" value={detailTab} onChange={setDetailTab} items={INVENTORY_DETAIL_TABS} />
        </div>
        <div className="inventory-detail-section" hidden={detailTab !== "概览"}>
          <dl className="inventory-detail-facts">
            <div><dt>精确库存键</dt><dd>{formatStockKey(selected)}</dd></div>
            <div><dt>库区</dt><dd>{selected.zone}</dd></div>
            <div><dt>已占用</dt><dd>{selected.reserved} 个</dd></div>
            <div><dt>待提货锁定</dt><dd>{selected.locked} 个</dd></div>
            <div><dt>待处理</dt><dd>{selected.pending} 个</dd></div>
            <div><dt>来源摘要</dt><dd>{selected.estimated ? "估算库存 / 待复核" : selected.state}</dd></div>
          </dl>
        </div>
        <section className="detail-section inventory-hold-section operational-detail-section-first" hidden={detailTab !== "留货"}>
          <div className="inventory-ledger-head">
            <div>
              <h3>库存意图与临时留货</h3>
              <p>
                {inventoryIntentState.loading
                  ? "正在读取库存意图"
                  : inventoryIntentState.lastSyncedAt
                    ? `后端库存意图 · ${inventoryIntents.length} 条 / 留货 ${temporaryHolds.length} 条 · ${inventoryIntentState.lastSyncedAt}`
                    : "询库存不占用；客户明确要求留货后才创建临时占用"}
              </p>
            </div>
            <button
              type="button"
              className="ghost-button"
              disabled={inventoryIntentState.loading}
              onClick={() => runTemporaryHoldAction(onRefreshInventoryIntents, { showToast: true })}
            >
              刷新意图
            </button>
          </div>
          {inventoryIntentState.error ? (
            <p className="ledger-message danger">{formatOperationalError(inventoryIntentState.error)}</p>
          ) : inventoryIntentState.loading ? (
            <p className="ledger-message">正在加载库存意图和临时留货。</p>
          ) : inventoryIntents.length ? (
            <div className="inventory-correction-queue-list inventory-intent-list">
              {inventoryIntents.map((intent) => {
                const candidates = Array.isArray(intent.candidate?.parsedCandidates) ? intent.candidate.parsedCandidates : [];
                const canCreate = intent.intentType === "temporary_hold"
                  && ["临时留货-待确认", "待创建留货"].includes(intent.intentStatus);
                const mutating = inventoryIntentState.mutatingId === (intent.intentId || intent.id);
                return (
                  <div className="inventory-correction-queue-row inventory-intent-row" key={intent.intentId || intent.id}>
                    <div>
                      <StatusPill tone={getInventoryIntentTone(intent.intentStatus)}>{intent.intentStatus}</StatusPill>
                      <strong>{getInventoryIntentTypeLabel(intent.intentType)}</strong>
                      <span>{intent.customerId || "客户待确认"} / {intent.sourceMessageId}</span>
                    </div>
                    <p>{intent.sourceText || "原消息为空"}</p>
                    {candidates.map((candidate, candidateIndex) => {
                      const candidateKey = `${intent.intentId || intent.id}:${candidateIndex}`;
                      const matches = inventoryRecords.filter((item) => inventoryMatchesHoldCandidate(item, candidate));
                      const selectedInventoryItemId = holdInventorySelections[candidateKey] ?? (matches.length === 1 ? matches[0].id : "");
                      const expiryNeedsReview = intent.candidate?.requiresExpiryReview === true;
                      const expiryDraft = holdExpiryDrafts[candidateKey] ?? "";
                      return (
                        <div className="inventory-intent-candidate" key={candidateKey}>
                          <span>{formatHoldCandidate(candidate)}</span>
                          {canCreate && (
                            <>
                              <select
                                aria-label="选择留货库存项"
                                value={selectedInventoryItemId}
                                onChange={(event) => setHoldInventorySelections((current) => ({ ...current, [candidateKey]: event.target.value }))}
                              >
                                <option value="">{matches.length ? "选择库存项" : "无精确库存项"}</option>
                                {matches.map((item) => (
                                  <option key={item.id} value={item.id}>{item.zone} / 可用 {availableQty(item)}</option>
                                ))}
                              </select>
                              {expiryNeedsReview ? (
                                <label className="inventory-hold-expiry-review">
                                  <span>19:30后留货，确认未来到期时间</span>
                                  <input
                                    type="datetime-local"
                                    aria-label="新留货到期时间"
                                    value={expiryDraft}
                                    onInput={(event) => {
                                      const value = event.currentTarget.value;
                                      setHoldExpiryDrafts((current) => ({ ...current, [candidateKey]: value }));
                                    }}
                                  />
                                </label>
                              ) : (
                                <small>默认到期：当天19:30</small>
                              )}
                              <button
                                type="button"
                                disabled={mutating || !selectedInventoryItemId || (expiryNeedsReview && !expiryDraft)}
                                title={!selectedInventoryItemId ? "先选择与候选规格一致的库存项" : expiryNeedsReview && !expiryDraft ? "19:30后新留货必须人工确认未来到期时间" : ""}
                                onClick={() => runTemporaryHoldAction(onCreateTemporaryHold, {
                                  intent,
                                  candidateIndex,
                                  inventoryItemId: selectedInventoryItemId,
                                  qty: candidate.qty,
                                  expiresAt: expiryNeedsReview ? toShanghaiExpiryIso(expiryDraft) : intent.candidate?.expiresAt,
                                  reason: expiryNeedsReview ? "办公室确认19:30后新留货到期时间" : "客户明确要求临时留货",
                                })}
                              >
                                {mutating ? "处理中" : "创建留货"}
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                    <small>{formatInventoryCorrectionTime(intent.updatedAt || intent.createdAt)} · 版本 {intent.revision}</small>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="ledger-message">暂无库存询问或临时留货意图。</p>
          )}
          {temporaryHolds.some((hold) => hold.status === "生效") && (
            <div className="inventory-hold-active-list">
              <h3>生效中的临时留货</h3>
              {temporaryHolds.filter((hold) => hold.status === "生效").map((hold) => {
                const holdId = hold.reservationId || hold.id;
                const draft = holdExtensionDrafts[holdId] ?? { expiresAt: "", reason: "" };
                const mutating = inventoryIntentState.mutatingId === holdId;
                return (
                  <div className="inventory-correction-queue-row inventory-hold-active-row" key={holdId}>
                    <div>
                      <StatusPill tone="warning">生效</StatusPill>
                      <strong>{holdId}</strong>
                      <span>{formatHoldInventoryItem(hold.inventoryItem)} / {hold.reservedQty} 个</span>
                    </div>
                    <p>到期：{formatInventoryCorrectionTime(hold.expiresAt)}；客户 {hold.customerId || "待确认"}</p>
                    <div className="inventory-hold-extension-form">
                      <button
                        type="button"
                        disabled={mutating}
                        onClick={() => runTemporaryHoldAction(onConvertTemporaryHoldToOrder, {
                          hold,
                          intent: hold.intent,
                          candidate: resolveTemporaryHoldCandidate(hold),
                        })}
                      >转订单</button>
                      <input
                        type="datetime-local"
                        aria-label="新的留货到期时间"
                        value={draft.expiresAt}
                        onChange={(event) => setHoldExtensionDrafts((current) => ({ ...current, [holdId]: { ...draft, expiresAt: event.target.value } }))}
                      />
                      <input
                        aria-label="延长留货原因"
                        placeholder="授权延长原因"
                        value={draft.reason}
                        onChange={(event) => setHoldExtensionDrafts((current) => ({ ...current, [holdId]: { ...draft, reason: event.target.value } }))}
                      />
                      <button
                        type="button"
                        disabled={mutating || !draft.expiresAt || !draft.reason.trim()}
                        onClick={() => runTemporaryHoldAction(onExtendTemporaryHold, { hold, ...draft })}
                      >延长</button>
                      <button
                        type="button"
                        className="danger-button"
                        disabled={mutating}
                        onClick={() => {
                          if (!window.confirm(`确认释放临时留货 ${holdId}？释放后库存会恢复可用。`)) return;
                          void runTemporaryHoldAction(onReleaseTemporaryHold, { hold, reason: "办公室确认释放临时留货" });
                        }}
                      >释放</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <section className="detail-section inventory-ledger-section operational-detail-section-first" hidden={detailTab !== "流水"}>
          <div className="inventory-ledger-head">
            <div>
              <h3>库存流水</h3>
              <p>
                {inventoryLedgerMeta.loading
                  ? "正在读取库存变动历史"
                  : inventoryLedgerMeta.lastSyncedAt
                    ? `${getInventoryLedgerSourceLabel(inventoryLedgerMeta.source)} · ${inventoryLedgerMeta.total ?? selectedLedgerEntries.length} 条 · ${inventoryLedgerMeta.lastSyncedAt}`
                    : "按当前库存键读取真实变动来源"}
              </p>
            </div>
            <button
              className="ghost-button"
              disabled={inventoryLedgerMeta.loading}
              onClick={() => onRefreshInventoryLedger?.({ stockId: selected.id, filters: ledgerFilters, showToast: true })}
            >
              刷新流水
            </button>
          </div>
          <div className="inventory-ledger-filters">
            <label className="inventory-ledger-filter-keyword">
              <span>关键词</span>
              <input
                placeholder="流水号 / 来源单号 / 操作人"
                value={ledgerFilters.keyword}
                onChange={(event) => updateLedgerFilter("keyword", event.target.value)}
                onKeyDown={handleLedgerFilterKeyDown}
              />
            </label>
            <label>
              <span>变动</span>
              <select value={ledgerFilters.changeType} onChange={(event) => updateLedgerFilter("changeType", event.target.value)}>
                {inventoryLedgerChangeTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>来源</span>
              <select value={ledgerFilters.sourceType} onChange={(event) => updateLedgerFilter("sourceType", event.target.value)}>
                {inventoryLedgerSourceTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>起始</span>
              <input type="date" value={ledgerFilters.dateFrom} onChange={(event) => updateLedgerFilter("dateFrom", event.target.value)} />
            </label>
            <label>
              <span>截止</span>
              <input type="date" value={ledgerFilters.dateTo} onChange={(event) => updateLedgerFilter("dateTo", event.target.value)} />
            </label>
            <div className="inventory-ledger-filter-actions">
              <button type="button" disabled={inventoryLedgerMeta.loading} onClick={() => applyLedgerFilters()}>
                <SearchOutlined /> 筛选
              </button>
              <button type="button" disabled={inventoryLedgerMeta.loading} onClick={resetLedgerFilters}>重置</button>
            </div>
          </div>
          <p className="inventory-ledger-filter-summary">
            {getInventoryLedgerFilterSummary(ledgerFilters)}
          </p>
          {inventoryLedgerMeta.error ? (
            <p className="ledger-message danger">{formatOperationalError(inventoryLedgerMeta.error)}</p>
          ) : inventoryLedgerMeta.loading ? (
            <p className="ledger-message">正在加载库存流水。</p>
          ) : selectedLedgerEntries.length ? (
            <div className="inventory-ledger-list">
              {selectedLedgerEntries.map((entry) => (
                <div className="inventory-ledger-row" key={entry.ledgerId}>
                  <div>
                    <StatusPill tone={getInventoryLedgerTone(entry)}>{getInventoryLedgerChangeLabel(entry.changeType)}</StatusPill>
                    <strong>数量 {formatInventoryLedgerQty(entry.qtyChange)}</strong>
                    <span>库存 {entry.qtyBefore} → {entry.qtyAfter}</span>
                  </div>
                  <p className="inventory-ledger-source">
                    <span>{getInventoryLedgerSourceText(entry)}</span>
                    <button
                      type="button"
                      disabled={!entry.sourceId}
                      onClick={() => onLocateInventoryLedgerSource?.(entry)}
                    >
                      {getInventoryLedgerLocateLabel(entry)}
                    </button>
                  </p>
                  <small>{entry.ledgerId} · {formatInventoryLedgerTime(entry.occurredAt || entry.createdAt)} · {entry.operatorName || entry.operatorId || "操作人待确认"}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="ledger-message">当前库存键暂无流水记录；确认订单占用、出库、释放占用或库存修正确认后会写入。</p>
          )}
        </section>
        {(inventoryCorrectionDetailState.loading || inventoryCorrectionDetailState.error || inventoryCorrectionDetailState.detail) && (
          <section className="detail-section inventory-correction-detail-section" hidden={detailTab === "概览"}>
            <div className="inventory-correction-detail-head">
              <div>
                <h3>库存修正详情</h3>
                <p>
                  {inventoryCorrectionDetailState.loading
                    ? "正在读取修正记录"
                    : inventoryCorrectionDetailState.lastSyncedAt
                      ? `${getInventoryCorrectionDetailSourceLabel(inventoryCorrectionDetailState.source)} · ${inventoryCorrectionDetailState.lastSyncedAt}`
                      : "从库存流水打开的修正记录"}
                </p>
              </div>
              {inventoryCorrectionDetailState.detail?.status && (
                <StatusPill tone={getInventoryCorrectionStatusTone(inventoryCorrectionDetailState.detail.status)}>
                  {inventoryCorrectionDetailState.detail.status}
                </StatusPill>
              )}
            </div>
            {inventoryCorrectionDetailState.error ? (
              <p className="ledger-message danger">{formatOperationalError(inventoryCorrectionDetailState.error)}</p>
            ) : inventoryCorrectionDetailState.loading ? (
              <p className="ledger-message">正在加载库存修正详情。</p>
            ) : inventoryCorrectionDetailState.detail ? (
              <InventoryCorrectionDetail detail={inventoryCorrectionDetailState.detail} />
            ) : null}
          </section>
        )}
        <section className="detail-section inventory-correction-queue-section operational-detail-section-first" hidden={detailTab !== "修正"}>
          <div className="inventory-correction-detail-head">
            <div>
              <h3>库存修正确认队列</h3>
              <p>
                {inventoryCorrectionQueueState.loading
                  ? "正在读取待确认修正"
                  : inventoryCorrectionQueueState.lastSyncedAt
                    ? `${getInventoryCorrectionQueueSourceLabel(inventoryCorrectionQueueState.source)} · ${inventoryCorrectionQueueState.total ?? correctionQueueItems.length} 条 · ${inventoryCorrectionQueueState.lastSyncedAt}`
                    : "发起草稿后由有确认权限账号处理"}
              </p>
            </div>
            <button
              className="ghost-button"
              disabled={inventoryCorrectionQueueState.loading}
              onClick={() => onRefreshCorrectionQueue?.({ showToast: true })}
            >
              刷新队列
            </button>
          </div>
          {inventoryCorrectionQueueState.error ? (
            <p className="ledger-message danger">{formatOperationalError(inventoryCorrectionQueueState.error)}</p>
          ) : inventoryCorrectionQueueState.loading ? (
            <p className="ledger-message">正在加载库存修正确认队列。</p>
          ) : correctionQueueItems.length ? (
            <div className="inventory-correction-queue-list">
              {correctionQueueItems.map((item) => {
                const draftId = item.correctionDraftId || item.id;
                const disabledReason =
                  item.status !== "待确认生效"
                    ? "只有待确认生效的修正草稿可以确认。"
                    : correctionConfirmState.disabled
                      ? correctionConfirmState.title
                      : "";
                const confirming = inventoryCorrectionQueueState.confirmingId === draftId;
                return (
                  <div className="inventory-correction-queue-row" key={draftId}>
                    <div>
                      <StatusPill tone={getInventoryCorrectionStatusTone(item.status)}>{item.status}</StatusPill>
                      <strong>{draftId}</strong>
                      <span>{item.stockKey || item.inventoryItemId}{item.zone ? ` / ${item.zone}` : ""}</span>
                    </div>
                    <p>
                      系统 {item.systemQty} → 实盘 {item.actualQty}，差异 {formatInventoryLedgerQty(item.diff)}；{item.reason || "原因待确认"}
                    </p>
                    <small>{item.operatorName || item.operatorId || "发起人待确认"} · {formatInventoryCorrectionTime(item.createdAt)}</small>
                    <div className="inventory-correction-queue-actions">
                      <button type="button" onClick={() => { setDetailTab("修正"); onOpenCorrectionDraft?.(draftId); }}>查看详情</button>
                      <button
                        type="button"
                        disabled={Boolean(disabledReason) || confirming}
                        title={disabledReason || ""}
                        onClick={() => confirmInventoryCorrection(item)}
                      >
                        {confirming ? "确认中" : "确认生效"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="ledger-message">暂无待确认库存修正草稿。</p>
          )}
        </section>
        <section hidden={detailTab !== "概览"} className={shortage > 0 ? "detail-section alert" : "detail-section"}>
          <h3>缺货判断</h3>
          <div className="inline-form-row">
            <label>
              <span>客户要货数量</span>
              <input type="number" min="0" value={requestQty} onChange={(event) => setRequestQty(Number(event.target.value || 0))} />
            </label>
          </div>
          <p>{shortage > 0 ? `当前缺口 ${shortage} 个；建议先确认客户是否等生产、先发可用数量，或改数量/颜色/款式。` : `当前可用 ${available} 个，可满足本次查询数量。正式承诺客户前仍需重新校验。`}</p>
        </section>
        <section className="detail-section" hidden={detailTab !== "概览"}>
          <h3>参考提示</h3>
          {similarStocks.length ? (
            <ul className="reference-list">
              {similarStocks.map((item) => (
                <li key={item.id}>{item.color} / {item.zone} / 可用 {availableQty(item)} 个 / {getStockTrustLabel(item)}</li>
              ))}
            </ul>
          ) : (
            <p>没有同尺寸、同提手、同款式的可用参考库存。</p>
          )}
          <p>近似颜色/尺寸只作参考；不能一键替代，也不能自动生成有货话术。</p>
        </section>
        <section className="detail-section" hidden={detailTab !== "概览"}>
          <h3>客户话术</h3>
          <p>{customerText}</p>
        </section>
        <section className="detail-section operational-detail-section-first" hidden={detailTab !== "修正"}>
          <h3>库存修正草稿</h3>
          <div className="detail-form">
            <label>
              <span>系统在库</span>
              <input value={selected.inStock} readOnly />
            </label>
            <label>
              <span>实盘数量</span>
              <input type="number" min="0" placeholder={`${selected.inStock}`} value={correctionActual} onChange={(event) => setCorrectionActual(event.target.value)} />
            </label>
            <label>
              <span>差异原因</span>
              <select value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)}>
                {["盘点差异", "找不到货", "包装/标签问题", "车间报数需复核", "待处理转报废", "其他"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span>修正凭证</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(event) => setCorrectionEvidenceFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          {correctionDraft && (
            <div className="correction-draft">
              <StatusPill tone="warning">{correctionDraft.status}</StatusPill>
              <strong>{correctionDraft.id}</strong>
              <p>{correctionDraft.stockKey} / {correctionDraft.zone}：系统 {correctionDraft.systemQty}，实盘 {correctionDraft.actualQty}，差异 {correctionDraft.diff}；{correctionDraft.reason}</p>
              <small>凭证 {correctionDraft.attachmentIds?.length ?? 0} 个</small>
            </div>
          )}
        </section>
        <div className="action-row operational-detail-actions inventory-detail-actions" hidden={detailTab !== "修正"}>
          <button className="primary-action" disabled={correctionState.disabled} title={correctionState.title} onClick={createCorrectionDraft}>生成修正草稿</button>
          <button
            type="button"
            disabled={!correctionDraft || !correctionEvidenceFile || correctionEvidenceUploading}
            onClick={uploadCorrectionEvidence}
          >
            {correctionEvidenceUploading ? "上传中" : "上传修正凭证"}
          </button>
          <button onClick={() => setToast(`已复制客户话术：${customerText}`)}>复制客户话术</button>
        </div>
          </div>
        ) : (
          <DataState title="没有可显示的库存详情" detail="当前筛选没有命中库存键，可重置筛选继续查询。" compact />
        )}
      </DetailPane>
    </section>
  );
}

function InventoryCell({ primary, secondary }) {
  return (
    <span className="inventory-cell-stack" title={`${primary} / ${secondary}`}>
      <strong>{primary}</strong>
      <small>{secondary}</small>
    </span>
  );
}

function InventoryQuantity({ value, strong = false }) {
  return <span className={`inventory-quantity-cell${strong ? " strong" : ""}`}>{value}</span>;
}

function getInventoryViewTabs(inventoryRecords, { availableQty, isPendingStock }) {
  return [
    { label: "常用库存", count: inventoryRecords.filter((item) => !isPendingStock(item)).length },
    { label: "全部", count: inventoryRecords.length },
    { label: "有可用量", count: inventoryRecords.filter((item) => !isPendingStock(item) && availableQty(item) > 0).length },
    { label: "占用/锁定", count: inventoryRecords.filter((item) => !isPendingStock(item) && (item.reserved > 0 || item.locked > 0)).length },
    { label: "缺货/零可用", count: inventoryRecords.filter((item) => !isPendingStock(item) && availableQty(item) <= 0).length },
    { label: "待处理", count: inventoryRecords.filter(isPendingStock).length },
  ];
}

function inventoryMatchesView(item, view, { availableQty, isPendingStock }) {
  if (view === "全部") return true;
  if (view === "有可用量") return !isPendingStock(item) && availableQty(item) > 0;
  if (view === "占用/锁定") return !isPendingStock(item) && (item.reserved > 0 || item.locked > 0);
  if (view === "缺货/零可用") return !isPendingStock(item) && availableQty(item) <= 0;
  if (view === "待处理") return isPendingStock(item);
  return !isPendingStock(item);
}

function normalizeInventoryLedgerPanelFilters(filters = {}) {
  return {
    keyword: String(filters.keyword ?? "").trim(),
    changeType: String(filters.changeType ?? "全部").trim() || "全部",
    sourceType: String(filters.sourceType ?? "全部").trim() || "全部",
    dateFrom: String(filters.dateFrom ?? "").trim(),
    dateTo: String(filters.dateTo ?? "").trim(),
  };
}

function getInventoryLedgerFilterSummary(filters = {}) {
  const normalized = normalizeInventoryLedgerPanelFilters(filters);
  const labels = [];
  if (normalized.keyword) labels.push(`关键词 ${normalized.keyword}`);
  if (normalized.changeType !== "全部") labels.push(getInventoryLedgerChangeLabel(normalized.changeType));
  if (normalized.sourceType !== "全部") labels.push(getInventoryLedgerSourceTypeLabel(normalized.sourceType));
  if (normalized.dateFrom || normalized.dateTo) {
    labels.push(`${normalized.dateFrom || "开始"} 至 ${normalized.dateTo || "今天"}`);
  }
  return labels.length ? `筛选：${labels.join(" / ")}` : "筛选：全部流水";
}

function getInventoryLedgerSourceTypeLabel(value) {
  const found = inventoryLedgerSourceTypeOptions.find((option) => option.value === value);
  return found?.label ?? value;
}

function InventoryCorrectionDetail({ detail }) {
  const operatorText = detail.operatorName || detail.operatorId || "发起人待确认";
  const confirmedText = detail.confirmedByName || detail.confirmedBy || (detail.status === "已确认生效" ? "确认人待确认" : "未确认");
  return (
    <div className="inventory-correction-detail">
      <InfoGrid
        rows={[
          ["修正单号", detail.correctionDraftId],
          ["库存键", `${detail.stockKey || detail.inventoryItemId || "库存键待确认"}${detail.zone ? ` / ${detail.zone}` : ""}`],
          ["修正数量", `系统 ${detail.systemQty} → 实盘 ${detail.actualQty}，差异 ${formatInventoryLedgerQty(detail.diff)}`],
          ["原因/备注", [detail.reason, detail.remark].filter(Boolean).join("；") || "未填写"],
          ["关联凭证", `${detail.attachmentIds?.length ?? 0} 个`],
          ["发起/确认", `${operatorText} / ${confirmedText}`],
          ["时间", `${formatInventoryCorrectionTime(detail.createdAt)} / ${formatInventoryCorrectionTime(detail.confirmedAt || detail.updatedAt)}`],
        ]}
      />
      {detail.ledger && (
        <div className="inventory-correction-ledger">
          <span>关联流水</span>
          <strong>{detail.ledger.ledgerId}</strong>
          <small>{getInventoryLedgerChangeLabel(detail.ledger.changeType)} · 库存 {detail.ledger.qtyBefore} → {detail.ledger.qtyAfter}</small>
        </div>
      )}
      {detail.operationLogs?.length ? (
        <div className="inventory-correction-audit">
          {detail.operationLogs.map((log) => (
            <div className="inventory-correction-audit-row" key={log.operationLogId || log.id}>
              <span>{getInventoryCorrectionOperationLabel(log.action)}</span>
              <strong>{log.operatorId || "操作人待确认"}</strong>
              <small>{formatInventoryCorrectionTime(log.createdAt)}{log.reason ? ` · ${log.reason}` : ""}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="ledger-message">暂无可展示的操作记录。</p>
      )}
    </div>
  );
}

function getInventoryLedgerTone(entry) {
  const qtyChange = Number(entry?.qtyChange ?? 0);
  if (qtyChange > 0) return "success";
  if (qtyChange < 0) return "danger";
  return "neutral";
}

function formatInventoryLedgerQty(value) {
  const qty = Number(value ?? 0);
  if (!Number.isFinite(qty)) return "0";
  if (qty > 0) return `+${qty}`;
  return String(qty);
}

function getInventoryLedgerSourceText(entry) {
  const type = String(entry?.sourceType ?? "").trim();
  const id = String(entry?.sourceId ?? "").trim();
  const labels = {
    inventory_correction: "库存修正",
    inventory_reservation: "库存占用",
    inventory_reservation_release: "释放占用",
    order_confirm: "订单确认",
    order_line: "订单明细",
    order_line_quantity_adjustment: "订单改量",
    order_line_void: "订单作废",
    fulfillment_complete: "完成出库",
    fulfillment_complete_legacy: "旧单出库扣减",
    fulfillment_pickup: "确认拉走",
    fulfillment_pickup_legacy: "旧单确认拉走",
    fulfillment_cancel: "取消出库",
    production_report: "生产报工",
    production_report_reservation: "生产占用",
    packing_complete: "打包完成",
  };
  const typeLabel = labels[type] || type || "来源待确认";
  return id ? `${typeLabel} · ${id}` : typeLabel;
}

function getInventoryLedgerLocateLabel(entry) {
  const type = String(entry?.sourceType ?? "").trim();
  if (!entry?.sourceId) return "无来源";
  if (["fulfillment_complete", "fulfillment_complete_legacy", "fulfillment_pickup", "fulfillment_pickup_legacy", "fulfillment_cancel"].includes(type)) {
    return "定位出库";
  }
  if (["order_confirm", "order_line", "order_line_quantity_adjustment", "order_line_void", "inventory_reservation", "inventory_reservation_release"].includes(type)) {
    return "定位订单";
  }
  if (["production_report", "production_report_reservation", "packing_complete"].includes(type)) return "打开打包";
  if (type === "inventory_correction") return "查看修正";
  return "定位来源";
}

function getInventoryLedgerChangeLabel(value) {
  const type = String(value ?? "").trim();
  const labels = {
    correction: "库存修正",
    reservation: "库存占用",
    release: "释放占用",
    outbound: "出库扣减",
    return: "退回入库",
    pending_handling: "转待处理",
    订单占用: "订单占用",
    释放占用: "释放占用",
    出库扣减: "出库扣减",
    生产入库: "生产入库",
    生产完成占用: "生产占用",
    打包完成确认: "打包完成",
    取消出库释放占用: "取消出库",
    订单改量释放占用: "改量释放",
    订单改量补占用: "改量补占",
  };
  return labels[type] || type || "库存变动";
}

function getInventoryLedgerSourceLabel(source) {
  if (source === "api") return "后端 API";
  if (source === "local_fallback") return "本地降级";
  if (source === "api_error") return "后端返回错误";
  return "本地演示";
}

function getInventoryListSourceLabel(meta = {}) {
  if (meta.loading) return "库存列表同步中";
  const source = meta.source;
  const synced = meta.lastSyncedAt ? ` · ${meta.lastSyncedAt}` : "";
  if (source === "api") return `后端库存列表${synced}`;
  if (source === "local_fallback") return `本地库存降级${synced}`;
  if (source === "api_error") return "后端库存列表返回错误";
  return "本地库存演示";
}

function getInventoryCorrectionDetailSourceLabel(source) {
  if (source === "api") return "后端修正详情";
  if (source === "local_fallback") return "本地修正降级";
  if (source === "api_error") return "后端返回错误";
  return "修正详情";
}

function getInventoryCorrectionQueueSourceLabel(source) {
  if (source === "api") return "后端确认队列";
  if (source === "local_fallback") return "本地修正队列";
  if (source === "api_error") return "后端返回错误";
  return "确认队列";
}

function getInventoryCorrectionStatusTone(status) {
  const text = String(status ?? "");
  if (text.includes("待")) return "warning";
  if (text.includes("已确认")) return "success";
  if (text.includes("作废") || text.includes("拒绝")) return "neutral";
  return "warning";
}

function getInventoryCorrectionOperationLabel(action) {
  const labels = {
    create_inventory_correction_draft: "发起修正",
    link_inventory_correction_attachments: "关联修正凭证",
    confirm_inventory_correction_draft: "确认生效",
  };
  return labels[action] || action || "操作记录";
}

function getInventoryIntentTypeLabel(type) {
  const labels = {
    inventory_inquiry: "询库存",
    merchant_reply: "商家库存回复",
    inventory_confirmation: "客户确认库存意向",
    temporary_hold: "临时留货请求",
    shortage_cancellation: "库存不足取消",
    duplicate_candidate: "疑似重复消息",
  };
  return labels[type] || type || "库存意图";
}

function getInventoryIntentTone(status) {
  const text = String(status ?? "");
  if (text.includes("取消") || text.includes("过期")) return "neutral";
  if (text.includes("生效") || text.includes("已转订单")) return "success";
  if (text.includes("重复") || text.includes("待确认") || text.includes("待创建")) return "warning";
  return "blue";
}

function inventoryMatchesHoldCandidate(item, candidate) {
  const same = (left, right) => String(left ?? "").trim() === String(right ?? "").trim();
  const optional = (left, right) => !String(right ?? "").trim() || same(left, right);
  return same(item.size, candidate.size)
    && same(item.color, candidate.color ?? candidate.bagColor)
    && optional(item.handle ?? item.handleType, candidate.handle ?? candidate.handleType)
    && optional(item.style, candidate.style);
}

function formatHoldCandidate(candidate) {
  return [
    candidate.product || candidate.productName,
    candidate.size,
    candidate.color || candidate.bagColor,
    candidate.handle || candidate.handleType,
    candidate.style,
    candidate.qty ? `${candidate.qty} 个` : "数量待确认",
  ].filter(Boolean).join(" / ");
}

function toShanghaiExpiryIso(value) {
  const normalized = String(value ?? "").trim();
  if (!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) return "";
  const parsed = new Date(`${normalized}:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function formatHoldInventoryItem(item) {
  if (!item) return "库存项待确认";
  return [item.size, item.color, item.handle || item.handleType, item.style, item.zone].filter(Boolean).join(" / ");
}

function resolveTemporaryHoldCandidate(hold) {
  if (hold?.metadata?.candidate) return hold.metadata.candidate;
  const candidates = hold?.intent?.candidate?.parsedCandidates;
  const index = Number(hold?.metadata?.candidateIndex ?? 0);
  return Array.isArray(candidates) ? candidates[index] ?? candidates[0] : null;
}

function formatInventoryLedgerTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待确认";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatInventoryCorrectionTime(value) {
  if (!value) return "时间待确认";
  return formatInventoryLedgerTime(value);
}
