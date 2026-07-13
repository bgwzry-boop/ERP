import {
  CheckCircleOutlined,
  DownOutlined,
  ExclamationCircleFilled,
  InfoCircleFilled,
  WarningFilled,
} from "@ant-design/icons";
import { useState } from "react";
import { getDraftFieldReviews, getPendingDraftFieldReviews } from "../../../shared/orderDraftFieldReview.mjs";
import {
  DataState,
  OperationalPanel,
  StatusPill,
} from "../../shared/ui/operational.jsx";

const ENTRY_STEPS = [
  { id: 1, title: "第一步：粘贴原文" },
  { id: 2, title: "第二步：校对明细" },
  { id: 3, title: "第三步：库存与确认" },
];

export function EntryPage({ entryText, setEntryText, draftRows, draftStatus, selectedDraftId, setSelectedDraftId, onRecognize, onQueueRecognize, onQueueRefresh, onQueueOpen, onQueueCancellationLink, onDraftFieldChange, onDraftCommand, onRestoreCancelledLine, onAction, helpers }) {
  const [splitPreview, setSplitPreview] = useState(null);
  const [splitConfirming, setSplitConfirming] = useState(false);
  const [draftQueue, setDraftQueue] = useState({ batchId: "", items: [], summary: null, loading: false });
  const { editableColors, getDraftColorSpecLabel, getDraftMissingFields, getDraftTypeLabel, getUiActionState, money, sampleText } = helpers;
  const selected = draftRows.find((item) => item.id === selectedDraftId) ?? draftRows[0];
  const selectedIndex = selected ? draftRows.indexOf(selected) : -1;
  const selectedCancelled = isCancelledDraftRow(selected);
  const activeDraftRows = draftRows.filter((item) => !isCancelledDraftRow(item));
  const cancelledRows = draftRows.filter(isCancelledDraftRow);
  const selectedMissing = selected && !selectedCancelled ? getDraftMissingFields(selected) : [];
  const selectedFieldReviews = selected ? getDraftFieldReviews(selected) : [];
  const selectedPendingReviews = selected ? getPendingDraftFieldReviews(selected) : [];
  const missingRows = activeDraftRows.filter((item) => getDraftMissingFields(item).length > 0);
  const inventoryIssueRows = activeDraftRows.filter((item) => !["可用", "正常"].includes(String(item.inventory ?? "").trim()));
  const reviewRows = activeDraftRows.filter((item) => getPendingDraftFieldReviews(item).length || (item.confidence !== "high" && !getDraftFieldReviews(item).length));
  const draftCustomerIds = [...new Set(draftRows.map((item) => item.customerId).filter(Boolean))];
  const draftCustomerId = draftCustomerIds.length === 1 ? draftCustomerIds[0] : "";
  const deliveryGroups = [...new Set(activeDraftRows.map((item) => `${item.fulfillment || "待确认"} · ${item.latest || "待确认"}`))];
  const attentionRows = new Set([...missingRows, ...inventoryIssueRows, ...reviewRows]);
  const currentStep = !entryText.trim() || !draftRows.length ? 1 : attentionRows.size ? 2 : 3;
  const quantityTotal = activeDraftRows.reduce((sum, item) => sum + toFiniteNumber(item.qty), 0);
  const amountTotal = activeDraftRows.reduce((sum, item) => sum + toFiniteNumber(item.amount), 0);
  const recognizeState = getUiActionState("entry", "识别");
  const draftState = getUiActionState("entry", "保存草稿");
  const confirmState = getUiActionState("entry", "保存并确认");
  const splitState = getUiActionState("entry", "拆分订单");
  const voidState = getUiActionState("entry", "作废草稿");
  const issues = buildValidationIssues({ draftRows, missingRows, inventoryIssueRows, reviewRows, getDraftMissingFields });
  const locateDraftRow = (rowId) => {
    setSelectedDraftId(rowId);
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-draft-id="${rowId}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };
  const recognizeIntoQueue = async () => {
    setDraftQueue((current) => ({ ...current, loading: true }));
    const result = await onQueueRecognize();
    setDraftQueue({
      batchId: result?.queueBatch?.batchId ?? "",
      items: result?.drafts ?? [],
      summary: result?.queueBatch?.summary ?? null,
      loading: false,
    });
  };
  const refreshQueue = async () => {
    setDraftQueue((current) => ({ ...current, loading: true }));
    const result = await onQueueRefresh(draftQueue.batchId);
    setDraftQueue((current) => ({
      ...current,
      items: result?.items ?? current.items,
      summary: result?.summary ?? current.summary,
      loading: false,
    }));
  };

  return (
    <section className="page-stack entry-workbench">
      <OperationalPanel className="entry-main-panel" ariaLabel="订单录入校对">
        <ol className="entry-progress" aria-label="订单录入步骤">
          {ENTRY_STEPS.map((step) => (
            <li
              className={step.id < currentStep ? "complete" : step.id === currentStep ? "active" : ""}
              aria-current={step.id === currentStep ? "step" : undefined}
              key={step.id}
            >
              <b>{step.id < currentStep ? <CheckCircleOutlined /> : step.id}</b>
              <strong>{step.title}</strong>
            </li>
          ))}
        </ol>

        <section className="entry-source-section" aria-label="客户原文识别">
          <h2>客户原文识别</h2>
          <div className="entry-capture-body">
            <div className="entry-textarea-wrap">
              <textarea aria-label="订单原文" value={entryText} onChange={(event) => setEntryText(event.target.value)} />
              <div className="entry-recognition-meta">
                <span>字数：{entryText.trim().length}/1000</span>
                <strong><CheckCircleOutlined /> {draftRows.length ? `识别完成（${draftRows.length}行）` : "等待识别"}</strong>
              </div>
            </div>
            <div className="entry-actions entry-capture-actions">
              <button className="primary-button" disabled={recognizeState.disabled} title={recognizeState.title} onClick={onRecognize}>识别</button>
              <button disabled={recognizeState.disabled || draftQueue.loading} title={recognizeState.title} onClick={recognizeIntoQueue}>识别入队</button>
              <button onClick={() => setEntryText("")}>清空</button>
              <button onClick={() => setEntryText(sampleText)}>填入样例</button>
            </div>
          </div>
        </section>

        {draftQueue.batchId || draftQueue.items.length ? (
          <section className="entry-queue-section" aria-label="订单草稿队列">
            <div className="entry-section-heading entry-queue-heading">
              <h2>草稿队列 <span>订单 {draftQueue.summary?.orderDraftCount ?? 0} · 库存/复核 {draftQueue.summary?.intentDraftCount ?? 0}</span></h2>
              <button type="button" disabled={draftQueue.loading} onClick={refreshQueue}>{draftQueue.loading ? "刷新中" : "刷新"}</button>
            </div>
            <div className="entry-queue-list" role="list">
              {draftQueue.items.map((item) => {
                const isOrderDraft = item.kind === "order_draft";
                const cancellationIntent = item.inventoryIntents?.find((intent) => intent.intentType === "shortage_cancellation");
                const cancellationCustomerId = cancellationIntent?.customerId || item.draft?.customerId;
                const canLinkCancellation = item.kind === "cancellation_review" && cancellationIntent && cancellationCustomerId && selected?.customerId === cancellationCustomerId && !selectedCancelled;
                return (
                  <article
                    role="listitem"
                    className={isOrderDraft ? "order" : "intent"}
                    key={item.queueItemId ?? item.draft?.draftId}
                  >
                    <button
                      type="button"
                      className="entry-queue-card-main"
                      disabled={!isOrderDraft}
                      onClick={() => onQueueOpen(item)}
                      title={isOrderDraft ? "打开独立订单草稿" : "该项保留为库存或复核上下文，不生成订单明细"}
                    >
                      <span>{isOrderDraft ? "订单草稿" : getQueueKindLabel(item.kind)}</span>
                      <strong>{item.draft?.customerName || item.draft?.customerId || "待确认客户"}</strong>
                      <small>{item.status} · {item.sourceMessageIds?.length ?? 0} 条来源 · {item.rows?.length ?? 0} 行明细</small>
                    </button>
                    {item.kind === "cancellation_review" ? (
                      <button
                        type="button"
                        className="entry-queue-link-cancellation"
                        disabled={!canLinkCancellation}
                        title={canLinkCancellation ? "把来源取消消息关联到当前选中的未确认明细" : "请先确认来源客户，并选择同客户的未取消草稿明细"}
                        onClick={async () => {
                          if (!window.confirm("确认将这条取消消息关联到当前选中明细？关联后该行不会生成正式订单，原消息上下文将保留。")) return;
                          const result = await onQueueCancellationLink(cancellationIntent.intentId ?? cancellationIntent.id);
                          if (result && !result.blocked) await refreshQueue();
                        }}
                      >关联到当前行</button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="entry-table-section" aria-label="识别明细">
          <div className="entry-section-heading">
            <h2>识别明细 <span>（可编辑）</span></h2>
          </div>
          <div className={`entry-draft-context ${draftCustomerIds.length > 1 ? "danger" : ""}`}>
            <label>
              <span>本次客户</span>
              <select
                aria-label="本次订单客户"
                disabled={!activeDraftRows.length}
                value={draftCustomerId}
                onChange={(event) => activeDraftRows.forEach((row) => onDraftFieldChange(row.id, "customerId", event.target.value))}
              >
                <option value="">{draftCustomerIds.length > 1 ? "识别出多个客户" : "待确认"}</option>
                {helpers.customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
              </select>
            </label>
            <div>
              <strong>{draftCustomerIds.length > 1 ? "不同客户必须拆成独立草稿" : "整张草稿归属一个客户"}</strong>
              <span>{activeDraftRows.length} 条待确认 · {cancelledRows.length} 条已取消 · {deliveryGroups.length} 个交付批次 · 来源：手工录入 / 粘贴识别</span>
            </div>
          </div>
          <div className="entry-table-tools">
            <button disabled={selectedCancelled} title={selectedCancelled ? "已取消明细需保留原始关联，不能合并" : undefined} onClick={() => onDraftCommand("合并下一行")}>合并下一行</button>
            <button disabled={selectedCancelled} title={selectedCancelled ? "已取消明细需保留原始关联，不能拆分" : undefined} onClick={() => onDraftCommand("拆分当前行")}>拆分明细行</button>
            <button
              className="entry-delete-row"
              disabled={selectedCancelled}
              title={selectedCancelled ? "已取消明细需保留原文证据，不能删除" : undefined}
              onClick={() => {
                if (window.confirm("确认删除当前明细行？删除后需重新核对订单数量、库存和金额。")) onDraftCommand("删除当前行");
              }}
            >
              删除当前行
            </button>
          </div>
          <EntryDraftTable
            rows={draftRows}
            selectedId={selected?.id}
            onSelect={setSelectedDraftId}
            onChange={onDraftFieldChange}
            helpers={helpers}
          />
        </section>
      </OperationalPanel>

      <aside className="entry-review-panel" aria-label="识别校验和当前行详情">
        <section className="entry-review-overview">
          <div className="entry-review-metrics" role="list" aria-label="识别异常统计">
            <ReviewMetric icon={<ExclamationCircleFilled />} label="缺字段" value={missingRows.length} tone="danger" />
            <ReviewMetric icon={<WarningFilled />} label="库存异常" value={inventoryIssueRows.length} tone="danger" />
            <ReviewMetric icon={<InfoCircleFilled />} label="识别待复核" value={reviewRows.length} tone="warning" />
          </div>
          <div className="entry-issue-heading">
            <h2>错误/异常列表 <span>（点击定位行）</span></h2>
            <button type="button" onClick={onRecognize}>刷新</button>
          </div>
          <div className="entry-issue-list">
            {issues.length ? issues.slice(0, 9).map((issue) => (
              <button type="button" className={issue.tone} key={issue.id} onClick={() => locateDraftRow(issue.row.id)}>
                <span className="entry-issue-dot" aria-hidden="true" />
                <strong>{issue.label}</strong>
                <small>第{issue.rowIndex + 1}行</small>
              </button>
            )) : <p className="entry-no-issues"><CheckCircleOutlined /> 当前明细无阻塞异常</p>}
          </div>
        </section>

        <section className="entry-selected-panel" aria-label="当前选中行详情">
          <div className="entry-detail-heading">
            <h2>当前选中行详情 {selectedIndex >= 0 ? `（第${selectedIndex + 1}行）` : ""}</h2>
          </div>
          {selected ? (
            <div className="entry-selected-content">
              <dl className="entry-detail-facts">
                <Fact label="置信度" value={getConfidenceScore(selected.confidence)} tone="success" />
                <Fact label="草稿状态" value={draftStatus} badge />
                {selectedCancelled ? <Fact label="取消状态" value="库存不足取消（不生成订单）" tone="danger" badge /> : null}
                <Fact label="业务类型" value={getDraftTypeLabel(selected)} badge />
                <Fact label="底袋款式" value={selected.style} />
                <Fact label="颜色短写" value={getDraftColorSpecLabel(selected)} badge />
                <Fact label="提手颜色" value={selected.handleColor || "同袋色/未特殊"} badge />
                <Fact label="原文片段" value={selected.source} wide />
                <Fact
                  label="印刷稿件"
                  value={selected.artworkStatus ?? (selected.print === "是" ? "待上传" : "非印刷不需要")}
                  action={selected.print === "是" && !selectedCancelled ? (
                    <label className="entry-upload-action">
                      上传
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(event) => {
                          if (event.target.files?.length) onDraftFieldChange(selected.id, "artworkStatus", "已上传");
                        }}
                      />
                    </label>
                  ) : null}
                  wide
                />
                <div className="entry-customer-note">
                  <dt>客户备注</dt>
                  <dd><input disabled={selectedCancelled} value={selected.note ?? ""} onChange={(event) => onDraftFieldChange(selected.id, "note", event.target.value)} placeholder="请输入客户备注（选填）" /></dd>
                </div>
                <Fact label="单价快照" value={`${getUnitPrice(selected)} / 个`} wide />
              </dl>

              {selectedFieldReviews.length ? (
                <section className="entry-field-reviews" aria-label="识别字段复核">
                  <h3>识别字段复核 <span>{selectedPendingReviews.length ? `${selectedPendingReviews.length} 项待确认` : "已完成"}</span></h3>
                  {selectedFieldReviews.map((review) => (
                    <div className={review.status === "confirmed" ? "confirmed" : "pending"} key={review.reviewId}>
                      <div>
                        <strong>{review.fieldLabel}</strong>
                        <span>{review.originalValue || "原值不明确"} → {review.suggestedValue || "请人工修改"}</span>
                        <small>{review.reason}</small>
                      </div>
                      {review.status === "confirmed" ? (
                        <b><CheckCircleOutlined /> {review.confirmationMethod === "edited" ? "已修改确认" : "已接受"}</b>
                      ) : (
                        <button
                          type="button"
                          disabled={selectedCancelled || !review.suggestedValue}
                          title={review.suggestedValue ? "确认当前候选值正确" : "没有可靠候选值，请直接修改相关字段"}
                          onClick={() => onDraftFieldChange(selected.id, "fieldReviewConfirmation", review.reviewId)}
                        >接受候选值</button>
                      )}
                    </div>
                  ))}
                </section>
              ) : null}

              <div className="entry-print-form">
                {selected.print === "是" ? (
                  <>
                    <label>
                      <span>印刷颜色</span>
                      <select disabled={selectedCancelled} value={selected.printColor ?? "待确认"} onChange={(event) => onDraftFieldChange(selected.id, "printColor", event.target.value)}>
                        <option>待确认</option>
                        {withCurrentColor(editableColors, selected.printColor).map((color) => <option key={color}>{color}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>印刷面</span>
                      <select disabled={selectedCancelled} value={selected.printSide ?? "待确认"} onChange={(event) => onDraftFieldChange(selected.id, "printSide", event.target.value)}>
                        <option>待确认</option>
                        <option>单面</option>
                        <option>双面</option>
                      </select>
                    </label>
                  </>
                ) : null}
                <label>
                  <span>提手颜色</span>
                  <select disabled={selectedCancelled} value={selected.handleColor ?? ""} onChange={(event) => onDraftFieldChange(selected.id, "handleColor", event.target.value)}>
                    <option value="">同袋色/未特殊</option>
                    <option>待确认</option>
                    {withCurrentColor(editableColors, selected.handleColor).map((color) => <option key={color}>{color}</option>)}
                  </select>
                </label>
                <label className="entry-note-field">
                  <span>备注</span>
                  <textarea disabled={selectedCancelled} value={selected.note ?? ""} onChange={(event) => onDraftFieldChange(selected.id, "note", event.target.value)} placeholder="请输入备注（选填）" />
                </label>
              </div>

              <div className={`entry-selected-check ${selectedCancelled || selectedMissing.length ? "danger" : "success"}`} aria-label="缺字段检查">
                {selectedCancelled ? "该明细已按库存不足取消，将保留证据但不生成正式订单" : selectedMissing.length ? `仍缺：${selectedMissing.join("、")}` : "当前行已完成必要字段校对"}
              </div>
              {selectedCancelled ? (
                <button
                  type="button"
                  className="entry-restore-cancelled"
                  onClick={() => {
                    if (window.confirm("确认客户已经恢复订购该明细？恢复后会重新进入库存、价格和字段校验，原取消记录仍保留。")) {
                      onRestoreCancelledLine(selected.id);
                    }
                  }}
                >恢复订购</button>
              ) : null}
            </div>
          ) : <DataState title="未选择识别明细" detail="识别订单原文后，可在此复核印刷、提手和备注。" compact />}
        </section>
      </aside>

      <footer className="entry-confirm-footer">
        <div className="entry-summary-metrics">
          <span>已识别 <strong>{draftRows.length}</strong> 行</span>
          {cancelledRows.length ? <span>已取消 <strong>{cancelledRows.length}</strong> 行</span> : null}
          <span>数量合计 <strong>{quantityTotal.toLocaleString("zh-CN")}</strong> 个</span>
          <span>金额合计 <strong>{money(amountTotal)}</strong></span>
        </div>
        <div className="entry-footer-actions">
          <button disabled={draftState.disabled} title={draftState.title} onClick={() => onAction("保存草稿")}>保存草稿</button>
          <button
            disabled={splitState.disabled}
            title={splitState.title}
            onClick={async () => {
              const result = await onAction("拆分订单");
              if (result?.splitPlan && !result.blocked) setSplitPreview(result.splitPlan);
            }}
          >按客户/交付拆单</button>
          <details className="entry-more-menu">
            <summary>更多</summary>
            <button disabled={voidState.disabled} title={voidState.title} onClick={() => onAction("作废草稿")}>作废草稿</button>
          </details>
          <button className="primary-action" disabled={confirmState.disabled} title={confirmState.title} onClick={() => onAction("保存并确认")}>保存并确认</button>
        </div>
      </footer>

      {splitPreview ? (
        <div className="entry-split-backdrop" role="presentation">
          <section className="entry-split-dialog" role="dialog" aria-modal="true" aria-labelledby="entry-split-title">
            <header>
              <div>
                <h2 id="entry-split-title">拆单预览</h2>
                <p>按客户、原始消息订单组、交付方式和最晚时间生成独立正式订单。</p>
              </div>
              <button type="button" aria-label="关闭拆单预览" disabled={splitConfirming} onClick={() => setSplitPreview(null)}>×</button>
            </header>
            <div className="entry-split-summary">
              <span>正式订单 <strong>{splitPreview.groups.length}</strong> 张</span>
              <span>有效明细 <strong>{splitPreview.activeDraftLineCount}</strong> 行</span>
              <span>取消保留 <strong>{splitPreview.cancelledDraftLineIds?.length ?? 0}</strong> 行</span>
            </div>
            <div className="entry-split-groups" role="list" aria-label="拆单分组">
              {splitPreview.groups.map((group) => (
                <article className={group.requiresReview ? "review" : ""} role="listitem" key={group.groupId}>
                  <div className="entry-split-group-index">{group.sequence}</div>
                  <div>
                    <strong>{group.customerName || group.customerId || "客户待确认"}</strong>
                    <span>{group.fulfillmentMethod} · {group.latestNeededAt}</span>
                    <small>来源组 {group.sourceGroupId} · {group.lineCount} 行</small>
                  </div>
                  <div className="entry-split-group-totals">
                    <strong>{Number(group.quantityTotal ?? 0).toLocaleString("zh-CN")} 个</strong>
                    <span>{money(group.amountTotal)}</span>
                  </div>
                  {group.reviewReasons?.length ? <p>{group.reviewReasons.join("、")}</p> : null}
                </article>
              ))}
            </div>
            {splitPreview.noSplitNeeded ? <p className="entry-split-warning">当前只有一个交付组，无需拆成多个正式订单。</p> : null}
            <footer>
              <button type="button" disabled={splitConfirming} onClick={() => setSplitPreview(null)}>返回修改</button>
              <button
                type="button"
                className="primary-action"
                disabled={!splitPreview.canConfirm || splitConfirming}
                onClick={async () => {
                  setSplitConfirming(true);
                  try {
                    const result = await onAction("确认拆单", { splitPlanHash: splitPreview.planHash });
                    if (result && !result.blocked) setSplitPreview(null);
                  } finally {
                    setSplitConfirming(false);
                  }
                }}
              >{splitConfirming ? "确认中" : `确认生成 ${splitPreview.groups.length} 张订单`}</button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ReviewMetric({ icon, label, value, tone }) {
  return (
    <div className={`entry-review-metric ${tone}`} role="listitem">
      <span>{icon}{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Fact({ label, value, tone = "", badge = false, action = null, wide = false }) {
  return (
    <div className={`${wide ? "wide" : ""} ${tone}`.trim()}>
      <dt>{label}</dt>
      <dd><span className={badge ? "entry-fact-badge" : ""}>{value || "—"}</span>{action}</dd>
    </div>
  );
}

function buildValidationIssues({ draftRows, missingRows, inventoryIssueRows, reviewRows, getDraftMissingFields }) {
  const issues = [];
  const add = (row, label, tone, kind) => {
    const rowIndex = draftRows.indexOf(row);
    const id = `${kind}-${row.id}`;
    if (!issues.some((item) => item.id === id)) issues.push({ id, row, rowIndex, label, tone });
  };
  missingRows.forEach((row) => add(row, `缺 ${getDraftMissingFields(row).join("、")}`, "danger", "missing"));
  inventoryIssueRows.forEach((row) => add(row, `库存${String(row.inventory).replace(/^库存/, "")}`, row.inventory?.startsWith("缺货") ? "danger" : "warning", "inventory"));
  reviewRows.forEach((row) => {
    const label = row.print === "是" && !["已上传", "已有稿件"].includes(row.artworkStatus) ? "印刷稿件待上传" : "识别内容待确认";
    add(row, label, "warning", "review");
  });
  return issues;
}

function getConfidenceScore(confidence) {
  if (confidence === "high") return "0.96";
  if (confidence === "medium") return "0.92";
  return "0.68";
}

function getUnitPrice(row) {
  const qty = toFiniteNumber(row.qty);
  const amount = toFiniteNumber(row.amount);
  if (!qty) return "¥0.00";
  return `¥${(amount / qty).toFixed(2)}`;
}

function EntrySelect({ ariaLabel, value, onChange, children, disabled = false }) {
  return (
    <span className="entry-select-control">
      <select aria-label={ariaLabel} value={value} onChange={onChange} disabled={disabled}>{children}</select>
      <DownOutlined className="entry-select-arrow" aria-hidden="true" />
    </span>
  );
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getQueueKindLabel(kind) {
  return {
    inventory_inquiry: "库存询问",
    temporary_hold: "临时留货",
    duplicate_review: "重复候选",
    cancellation_review: "取消复核",
    intent_review: "意图复核",
  }[kind] ?? "复核上下文";
}

function isCancelledDraftRow(row) {
  return Boolean(row) && (row.excludedFromConfirmation === true || row.cancellationStatus === "库存不足取消");
}

function withCurrentColor(colors, currentColor) {
  return [...new Set([currentColor, ...colors].filter(Boolean))];
}

function EntryDraftTable({ rows, selectedId, onSelect, onChange, helpers }) {
  const { getDraftTypeLabel, money, statusTone } = helpers;
  const columns = ["序号", "品名", "尺寸", "袋色", "提手类型", "订单类型", "数量（个）", "交付", "最晚", "库存", "预估金额"];
  if (!rows.length) return <DataState title="暂无识别明细" detail="录入订单原文并执行识别后显示。" compact />;

  const updateOrderType = (row, nextType) => {
    if (nextType === "定制印刷") {
      onChange(row.id, "print", "是");
      return;
    }
    onChange(row.id, "print", "否");
    onChange(row.id, "style", nextType);
  };

  return (
    <div className="data-table entry-table" style={{ "--cols": columns.length }}>
      <div className="data-row head">
        {columns.map((column) => <span key={column}>{column}</span>)}
      </div>
      {rows.map((row, index) => {
        const cancelled = isCancelledDraftRow(row);
        return (
        <div className={`data-row entry-edit-row ${row.id === selectedId ? "active" : ""} ${cancelled ? "cancelled" : ""}`} aria-disabled={cancelled || undefined} data-customer-id={row.customerId} data-draft-id={row.id} key={row.id} onClick={() => onSelect(row.id)}>
          <span className="entry-row-number">{index + 1}</span>
          <span><input disabled={cancelled} aria-label={`第${index + 1}行品名`} value={row.product} onChange={(event) => onChange(row.id, "product", event.target.value)} /></span>
          <span><input disabled={cancelled} aria-label={`第${index + 1}行尺寸`} value={row.size} onChange={(event) => onChange(row.id, "size", event.target.value)} /></span>
          <span>
            <EntrySelect disabled={cancelled} ariaLabel={`第${index + 1}行袋色`} value={row.color} onChange={(event) => onChange(row.id, "color", event.target.value)}>
              {withCurrentColor(helpers.editableColors, row.color).map((color) => <option key={color}>{color}</option>)}
              <option>待确认</option>
            </EntrySelect>
          </span>
          <span>
            <EntrySelect disabled={cancelled} ariaLabel={`第${index + 1}行提手类型`} value={row.handle} onChange={(event) => onChange(row.id, "handle", event.target.value)}>
              <option>普通提</option>
              <option>加长提</option>
            </EntrySelect>
          </span>
          <span>
            <EntrySelect disabled={cancelled} ariaLabel={`第${index + 1}行订单类型`} value={getDraftTypeLabel(row)} onChange={(event) => updateOrderType(row, event.target.value)}>
              <option>空白袋</option>
              <option>小熊袋</option>
              <option>喜</option>
              <option>福</option>
              <option>定制印刷</option>
            </EntrySelect>
          </span>
          <span><input disabled={cancelled} aria-label={`第${index + 1}行数量`} type="number" min="0" value={row.qty} onChange={(event) => onChange(row.id, "qty", event.target.value)} /></span>
          <span>
            <EntrySelect disabled={cancelled} ariaLabel={`第${index + 1}行交付方式`} value={row.fulfillment} onChange={(event) => onChange(row.id, "fulfillment", event.target.value)}>
              <option>待确认</option>
              <option>自提</option>
              <option>送货</option>
              <option>快递快运</option>
            </EntrySelect>
          </span>
          <span><input disabled={cancelled} aria-label={`第${index + 1}行最晚时间`} value={row.latest} onChange={(event) => onChange(row.id, "latest", event.target.value)} /></span>
          <span><StatusPill tone={cancelled ? "danger" : statusTone(row.inventory)}>{cancelled ? "库存不足取消" : String(row.inventory).replace("缺货 ", "缺货")}</StatusPill></span>
          <span className="entry-money-cell">{money(row.amount)}</span>
        </div>
        );
      })}
    </div>
  );
}
