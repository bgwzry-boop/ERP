import { useEffect, useRef, useState } from "react";
import {
  CheckCircleOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  NotificationOutlined,
  ReloadOutlined,
  SearchOutlined,
  SendOutlined,
  WalletOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  DataState,
  DataTable,
  FilterBar,
  InfoGrid,
  OperationalPanel,
  Segmented,
  StatusPill,
} from "../../shared/ui/operational.jsx";
import { formatAttachmentSize, isInlineImageAttachment } from "../attachments/attachmentPresentation.js";
import { varianceHandlingOptions } from "../../domain/officeRules.js";
import {
  DelegatedBusinessDecisionFields,
  isDelegatedBusinessDecisionComplete,
} from "../../components/DelegatedBusinessDecisionFields.jsx";
import { BusinessDecisionHistoryPanel } from "../../components/BusinessDecisionHistoryPanel.jsx";
import { formatOperationalError } from "../../shared/ui/errorPresentation.js";
import { BusinessWriteConflictDialog } from "../../components/BusinessWriteConflictDialog.jsx";
import {
  formatBusinessDecisionChannelAndTime,
  getBusinessDecisionContentSummary,
} from "../../components/businessDecisionPresentation.js";
import {
  STATEMENT_ACTIONS_BY_TAB,
  STATEMENT_DETAIL_TABS,
  STATEMENT_QUICK_FILTERS,
  buildStatementDecisionIdempotencyKey,
  createStatementDecisionDraft,
  getStatementBucketTone,
  getStatementExportTimeLabel,
  getStatementExportTokenLabel,
  getStatementExportTypeLabel,
} from "./statementPageModel.js";

export function StatementPage({ authState, currentUser, statements, orderLines, readMeta, selectedId, setSelectedId, onAction, onRefresh, helpers }) {
  const {
    defaultStatementFilters,
    findCustomer,
    findOrderLine,
    getLineColorSpecLabel,
    getOrderLineShortNo,
    getStatementBlockingAmount,
    getStatementBucket,
    getStatementFinancialSummary,
    getUiActionState,
    money,
    statementFilterOptions,
    statementMatchesFilters,
  } = helpers;
  const [filters, setFilters] = useState(defaultStatementFilters);
  const [detailTab, setDetailTab] = useState("本期明细");
  const [decisionDraft, setDecisionDraft] = useState(null);
  const [decisionConfirmation, setDecisionConfirmation] = useState(null);
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const decisionDialogRef = useRef(null);
  const decisionTriggerRef = useRef(null);
  const restoreDecisionTriggerRef = useRef(false);
  const [writeConflict, setWriteConflict] = useState(null);
  const filtered = statements.filter((item) => statementMatchesFilters(item, filters));
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const statusOptions = statementFilterOptions.map((status) => ({
    status,
    count: statements.filter((item) => statementMatchesFilters(item, { ...filters, status })).length,
  }));
  const statementMetrics = statusOptions.filter((item) => ["本期待对账", "欠款/差额", "收款待确认"].includes(item.status));
  const activeFilterCount = Number(Boolean(filters.query.trim())) + Number(filters.status !== defaultStatementFilters.status);

  useEffect(() => {
    setDecisionDraft(null);
    setDecisionConfirmation(null);
    setWriteConflict(null);
  }, [selected?.id]);

  useEffect(() => {
    if (decisionConfirmation) {
      decisionDialogRef.current?.focus();
      return;
    }
    if (!restoreDecisionTriggerRef.current) return;
    restoreDecisionTriggerRef.current = false;
    decisionTriggerRef.current?.focus();
  }, [decisionConfirmation]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters() {
    setFilters(defaultStatementFilters);
  }

  const statementFilter = (
    <FilterBar
      className="statement-filter-bar"
      ariaLabel="客户对账筛选"
      summary={`命中 ${filtered.length} / ${statements.length} 张对账单`}
      secondarySummary={statementMetrics.map((item) => `${item.status} ${item.count}`).join(" · ")}
      actions={<button type="button" disabled={!activeFilterCount} onClick={resetFilters}><ReloadOutlined /> 重置</button>}
    >
      <div className="statement-filter-fields">
        <label>
          <span>客户 / 对账单</span>
          <div className="statement-query-control">
            <SearchOutlined aria-hidden="true" />
            <input aria-label="对账客户或单号" placeholder="客户名 / 单号 / 联系人" value={filters.query} onChange={(event) => updateFilter("query", event.target.value)} />
          </div>
        </label>
        <label>
          <span>范围</span>
          <select aria-label="对账范围" value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
            {statusOptions.map((item) => <option key={item.status} value={item.status}>{item.status} · {item.count}</option>)}
          </select>
        </label>
      </div>
    </FilterBar>
  );

  if (!selected) {
    return (
      <section className="page-grid statement-layout operational-statement-layout statement-workbench">
        <OperationalPanel className="customer-list statement-customer-panel" ariaLabel="客户对账列表">
          <StatementCustomerHeader count={filtered.length} source={readMeta?.source} summary={readMeta?.loading ? "正在读取后端对账数据" : "暂无匹配对账数据"} />
          <StatementQuickFilters value={filters.status} options={statusOptions} onChange={(status) => updateFilter("status", status)} />
          {statementFilter}
          <DataState
            title={readMeta?.error ? "对账数据读取失败" : statements.length ? "没有匹配客户" : "当前账期暂无客户对账单"}
            detail={readMeta?.error ? formatOperationalError(readMeta.error) : (statements.length ? "调整客户或范围筛选后重试。" : "生成对账单后会在这里显示。")}
            tone={readMeta?.error ? "danger" : "empty"}
          />
        </OperationalPanel>
        <OperationalPanel className="statement-main statement-detail-panel" ariaLabel="客户对账详情">
          <DataState title="没有可显示的对账详情" detail="从左侧选择客户对账单后显示财务口径和明细。" />
        </OperationalPanel>
      </section>
    );
  }
  const customerInfo = findCustomer(selected.customerId);
  const lines = selected.lineIds.map((id) => findOrderLine(orderLines, id)).filter(Boolean);
  const adjustment = Number(selected.adjustment || 0);
  const blockingAmount = getStatementBlockingAmount(selected);
  const financialSummary = getStatementFinancialSummary(selected);
  const bucket = getStatementBucket(selected);
  const exportRecords = Array.isArray(selected.exportRecords) ? selected.exportRecords : [];
  const paymentAttachments = Array.isArray(selected.paymentAttachmentFiles) ? selected.paymentAttachmentFiles : [];
  const customerConfirmationAttachments = Array.isArray(selected.customerConfirmationAttachmentFiles)
    ? selected.customerConfirmationAttachmentFiles
    : [];
  const customerConfirmationAttachmentIds = Array.isArray(selected.customerConfirmationAttachmentIds)
    ? selected.customerConfirmationAttachmentIds
    : [];
  const customerConfirmationAttachmentRows = customerConfirmationAttachments.length
    ? customerConfirmationAttachments
    : customerConfirmationAttachmentIds.map((attachmentId) => ({
        attachmentId,
        fileName: attachmentId,
        hasContent: false,
      }));
  const refreshExportState = getUiActionState("statements", "刷新导出记录");
  const downloadExportState = getUiActionState("statements", "下载导出文件");
  const previewPaymentProofState = getUiActionState("statements", "查看付款凭证");
  const previewCustomerConfirmationAttachmentState = getUiActionState("statements", "查看客户确认附件");
  const varianceDirectAllowed = authState?.permissions?.actionPermissions?.includes("statement.variance.direct") === true;
  const writeOffDirectAllowed = authState?.permissions?.actionPermissions?.includes("statement.write_off.direct") === true;
  const activeDecisionDirectAllowed = decisionDraft?.type === "variance" ? varianceDirectAllowed : writeOffDirectAllowed;
  const decisionReady = Boolean(
    decisionDraft?.reason?.trim()
    && (decisionDraft.type !== "variance" || decisionDraft.handlingResult)
    && (activeDecisionDirectAllowed || isDelegatedBusinessDecisionComplete(
      decisionDraft.delegatedDecision,
      { requireEvidence: decisionDraft.type === "write_off" },
    )),
  );

  function startDecisionFlow(action) {
    if (action !== "差额待确认" && action !== "确认核销") {
      onAction(action, selected.id);
      return;
    }
    if (action === "差额待确认" && blockingAmount <= 0 && selected.received >= selected.receivable) {
      onAction(action, selected.id);
      return;
    }
    setDecisionDraft(createStatementDecisionDraft(action === "差额待确认" ? "variance" : "write_off"));
    setDecisionConfirmation(null);
    setWriteConflict(null);
    setDetailTab("本期明细");
  }

  async function submitDecision() {
    if (!decisionConfirmation || decisionSubmitting) return;
    setDecisionSubmitting(true);
    const snapshot = decisionConfirmation;
    const directAllowed = snapshot.directAllowed;
    const decisionSummary = snapshot.flow.type === "variance"
      ? `${snapshot.flow.handlingResult}：${snapshot.flow.reason}`
      : `确认核销：${snapshot.flow.reason}`;
    const result = await onAction(
      snapshot.flow.type === "variance" ? "差额待确认" : "确认核销",
      snapshot.statement.id,
      {
        confirmedDecision: true,
        expectedRevision: Number(snapshot.statement.revision ?? 0),
        idempotencyKey: snapshot.idempotencyKey,
        reason: snapshot.flow.reason,
        ...(snapshot.flow.type === "variance" ? { handlingResult: snapshot.flow.handlingResult } : {}),
        ...(directAllowed
          ? { directDecisionContent: { summary: decisionSummary } }
          : { delegatedDecision: snapshot.flow.delegatedDecision }),
      },
    );
    setDecisionSubmitting(false);
    setDecisionConfirmation(null);
    if (result?.error?.status === 409 || result?.error?.code === "BUSINESS_WRITE_CONFLICT") {
      setWriteConflict(result.error);
      return;
    }
    if (!result?.blocked) setDecisionDraft(null);
  }

  function openDecisionConfirmation() {
    if (!decisionReady || decisionSubmitting || decisionConfirmation) return;
    setWriteConflict(null);
    setDecisionConfirmation({
      statement: structuredClone(selected),
      customer: structuredClone(customerInfo),
      flow: structuredClone(decisionDraft),
      financialSummary: structuredClone(financialSummary),
      blockingAmount,
      directAllowed: activeDecisionDirectAllowed,
      idempotencyKey: buildStatementDecisionIdempotencyKey(decisionDraft.type, selected.id, selected.revision),
    });
  }

  function returnToDecisionEdit() {
    if (decisionSubmitting) return;
    restoreDecisionTriggerRef.current = true;
    setDecisionConfirmation(null);
  }
  return (
    <section className="page-grid statement-layout operational-statement-layout statement-workbench">
      <OperationalPanel className="customer-list statement-customer-panel" ariaLabel="客户对账列表">
        <StatementCustomerHeader count={filtered.length} source={readMeta?.source} summary={readMeta?.source === "api" ? `后端对账 ${readMeta.total ?? statements.length} 条` : "本地客户账务"} />
        <StatementQuickFilters value={filters.status} options={statusOptions} onChange={(status) => updateFilter("status", status)} />
        {statementFilter}
        <div className="statement-customer-scroll">
          {filtered.map((item) => {
            const customer = findCustomer(item.customerId);
            const itemSummary = getStatementFinancialSummary(item);
            const itemBucket = getStatementBucket(item);
            return (
              <button type="button" className={item.id === selected.id ? "customer-row active" : "customer-row"} key={item.id} onClick={() => setSelectedId(item.id)}>
                <span className="customer-row-head">
                  <strong>{customer.name}</strong>
                  <StatusPill tone={getStatementBucketTone(itemBucket)}>{itemBucket}</StatusPill>
                </span>
                <small>{item.id} · {customer.cycle} · 上次 {customer.lastStatement}</small>
                <span className="customer-row-money">
                  <span>本期 {money(itemSummary.currentReceivable)}</span>
                  <strong>待收 {money(itemSummary.cumulativeDebt)}</strong>
                </span>
              </button>
            );
          })}
          {!filtered.length && <DataState title="没有匹配客户" compact />}
        </div>
      </OperationalPanel>
      <OperationalPanel className="statement-main statement-detail-panel" ariaLabel="客户对账详情">
        <div className="statement-detail-overview">
          <div className="statement-detail-identity">
            <div>
              <span>{selected.id} · {selected.period}</span>
              <h2>{customerInfo.name}</h2>
            </div>
            <div className="statement-detail-statuses" aria-label="对账当前状态">
              <StatusPill tone={getStatementBucketTone(bucket)}>{bucket}</StatusPill>
              <StatusPill tone={selected.sent ? "success" : "neutral"}>{selected.sent ? "已发送" : "未发送"}</StatusPill>
              {selected.customerConfirmationStatus ? <StatusPill tone="success">客户已确认</StatusPill> : null}
            </div>
          </div>
          <div className="statement-summary" aria-label="对账财务可信金额">
            {[
              ["本期应收", financialSummary.currentReceivable, ""],
              ["本期实收", financialSummary.currentReceived, "settled"],
              ["本期未收", financialSummary.currentUnpaid, financialSummary.currentUnpaid > 0 ? "warning" : "settled"],
              ["历史欠款", financialSummary.historicalDebt, financialSummary.historicalDebt > 0 ? "warning" : "settled"],
              ["累计欠款", financialSummary.cumulativeDebt, financialSummary.cumulativeDebt > 0 ? "danger" : "settled"],
            ].map(([label, value, tone]) => (
              <div className={tone} key={label}>
                <span>{label}</span>
                <strong>{money(value)}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="statement-detail-scroll">
          <div className="operational-detail-tabs statement-detail-tabs">
            <Segmented ariaLabel="对账详情视图" value={detailTab} onChange={setDetailTab} items={STATEMENT_DETAIL_TABS} />
          </div>
          <section className="statement-detail-section operational-detail-section-first" hidden={detailTab !== "本期明细"}>
            <StatementFacts
              rows={[
                ["对账状态", `${selected.status} · ${bucket}`],
                ["账期 / 周期", `${selected.period} · ${customerInfo.cycle}`],
                ["发送记录", selected.sent ? selected.sentAt || "已发送/待补渠道" : "未发送"],
                ["差额结果", selected.varianceHandling || "未选择"],
                ["付款凭证", selected.paymentEvidenceStatus || "未登记付款截图"],
                ["导出文件", selected.exportArchiveStatus || "未生成导出文件"],
                ["客户确认", selected.customerConfirmationStatus || "未登记"],
              ]}
            />
          </section>
        <section className="statement-detail-section operational-detail-section-first" hidden={detailTab !== "凭证/确认"}>
          <div className="section-head-row">
            <h3>付款凭证预览</h3>
            <span className="section-count">{paymentAttachments.length ? `${paymentAttachments.length} 张` : "未登记"}</span>
          </div>
          {paymentAttachments.length ? (
            <div className="payment-proof-list">
              {paymentAttachments.map((file) => {
                const canPreview = Boolean(file.previewDataUrl || file.hasContent);
                const canInlinePreview = Boolean(file.previewDataUrl && isInlineImageAttachment(file));
                return (
                  <div className="payment-proof-row" key={file.attachmentId || file.fileName}>
                    <div className="payment-proof-thumb">
                      {canInlinePreview ? <img src={file.previewDataUrl} alt={file.fileName || "付款凭证预览"} /> : <span>{file.hasContent || file.previewDataUrl ? "可查看" : "待上传"}</span>}
                    </div>
                    <div className="payment-proof-meta">
                      <strong>{file.fileName || file.attachmentId || "付款截图"}</strong>
                      <small>{[file.mimeType || file.contentType || "类型待补", formatAttachmentSize(file.fileSize), file.previewStatus || (file.hasContent ? "可读取内容" : "待上传内容")].filter(Boolean).join(" · ")}</small>
                    </div>
                    <button
                      disabled={previewPaymentProofState.disabled || !canPreview}
                      title={previewPaymentProofState.title || (canPreview ? "" : "当前附件没有可读取内容")}
                      onClick={() => onAction("查看付款凭证", selected.id, { attachmentId: file.attachmentId })}
                    >
                      查看
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p>暂无付款截图；登记实收时可选择截图，保存后在这里预览。</p>
          )}
        </section>
        <section className="statement-detail-section" hidden={detailTab !== "凭证/确认"}>
          <h3>发送归档</h3>
          {selected.sent ? (
            <InfoGrid
              rows={[
                ["发送渠道", selected.sendChannel || "渠道待补"],
                ["发送对象", selected.sendRecipient || "对象待补"],
                ["发送人", selected.sendOperator || "操作人待补"],
                ["发送文件", selected.sendExportFileName || "未关联客户发送版文件"],
                ["回执状态", selected.sendReceiptStatus ? `${selected.sendReceiptStatus}${selected.sendReceiptAt ? ` · ${getStatementExportTimeLabel(selected.sendReceiptAt)}` : ""}` : "待回执"],
              ]}
            />
          ) : (
            <p>未发送；生成客户发送版预览后再标记已发送，可关联发送文件。</p>
          )}
        </section>
        <section className="statement-detail-section" hidden={detailTab !== "凭证/确认"}>
          <h3>客户确认</h3>
          {selected.customerConfirmationStatus ? (
            <InfoGrid
              rows={[
                [
                  "确认状态",
                  `${selected.customerConfirmationStatus}${selected.customerConfirmedAt ? ` · ${getStatementExportTimeLabel(selected.customerConfirmedAt)}` : ""}`,
                ],
                ["确认人/来源", selected.customerConfirmedBy || selected.sendRecipient || "客户联系人"],
                ["确认内容", selected.customerConfirmationContent || "客户回复确认无误"],
                ["确认渠道", selected.customerConfirmationChannel || selected.sendChannel || "微信"],
                ["关联附件", customerConfirmationAttachmentRows.length ? `${customerConfirmationAttachmentRows.length} 个附件` : "未关联附件"],
              ]}
            />
          ) : (
            <p>未登记客户确认；客户回复“没问题 / 确认”后可登记为对账证据。</p>
          )}
          {customerConfirmationAttachmentRows.length ? (
            <div className="payment-proof-list">
              {customerConfirmationAttachmentRows.map((file) => {
                const canPreview = Boolean(file.previewDataUrl || file.hasContent);
                const canInlinePreview = Boolean(file.previewDataUrl && isInlineImageAttachment(file));
                return (
                  <div className="payment-proof-row" key={file.attachmentId || file.fileName}>
                    <div className="payment-proof-thumb">
                      {canInlinePreview ? <img src={file.previewDataUrl} alt={file.fileName || "客户确认附件预览"} /> : <span>{file.hasContent || file.previewDataUrl ? "可查看" : "待上传"}</span>}
                    </div>
                    <div className="payment-proof-meta">
                      <strong>{file.fileName || file.attachmentId || "客户确认附件"}</strong>
                      <small>{[file.mimeType || file.contentType || "类型待补", formatAttachmentSize(file.fileSize), file.previewStatus || (file.hasContent ? "可读取内容" : "待上传内容")].filter(Boolean).join(" · ")}</small>
                    </div>
                    <button
                      disabled={previewCustomerConfirmationAttachmentState.disabled || !canPreview}
                      title={previewCustomerConfirmationAttachmentState.title || (canPreview ? "" : "当前附件没有可读取内容")}
                      onClick={() => onAction("查看客户确认附件", selected.id, { attachmentId: file.attachmentId })}
                    >
                      查看
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
        <section className="statement-detail-section operational-detail-section-first" hidden={detailTab !== "导出/归档"}>
          <div className="section-head-row">
            <h3>导出历史</h3>
            <button disabled={refreshExportState.disabled} title={refreshExportState.title} onClick={() => onAction("刷新导出记录", selected.id)}>刷新</button>
          </div>
          {exportRecords.length ? (
            <div className="export-history-list">
              {exportRecords.slice(0, 4).map((record, index) => (
                <div className="export-history-row" key={`${record.downloadToken || record.fileName}-${index}`}>
                  <strong>V{exportRecords.length - index} · {getStatementExportTypeLabel(record.previewType)}</strong>
                  <span>{record.fileName || "文件名待补"}</span>
                  <small>{getStatementExportTimeLabel(record.createdAt)} · 令牌 {getStatementExportTokenLabel(record.downloadToken)}</small>
                  <button
                    disabled={downloadExportState.disabled || !record.downloadToken}
                    title={!record.downloadToken ? "缺少下载令牌，无法重下历史文件。" : downloadExportState.title}
                    onClick={() => onAction("下载导出文件", selected.id, { exportRecord: record })}
                  >
                    下载
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p>暂无导出记录；生成预览或导出 Excel 后会显示客户发送版 / 内部留档版。</p>
          )}
        </section>
        <div hidden={detailTab !== "本期明细"}>
          <DataTable
            className="statement-table"
            columns={["明细/产品", "规格", "交付", "计费数", "应收", "备注"]}
            rows={lines.map((row) => ({
              id: row.id,
              tone: row.exceptions.length ? "warning" : "neutral",
              cells: [`${getOrderLineShortNo(row)} / ${row.product}`, `${row.size} ${getLineColorSpecLabel(row)}`, row.fulfillment, row.qty, money(row.amount), row.exceptions.join("、") || "正常"],
            }))}
          />
        </div>
        <section hidden={detailTab !== "本期明细"} className={`statement-variance-summary ${blockingAmount > 0 || financialSummary.cumulativeDebt > 0 ? "warning" : "settled"}`}>
          <strong><WarningOutlined /> 本期差额与历史欠款</strong>
          <p>本期未收 {money(financialSummary.currentUnpaid)}；历史欠款 {money(financialSummary.historicalDebt)}；累计待收 {money(financialSummary.cumulativeDebt)}。</p>
          <small>
            {blockingAmount > 0
              ? `核销前仍需按当前规则处理 ${money(blockingAmount)}，结果为 ${selected.varianceHandling || "未选择"}。`
              : "当前没有额外差额阻断，到账后可按权限确认核销。"}
            {adjustment !== 0 ? ` 本期调整 ${money(adjustment)}，内部原因必须保留。` : " 本期暂未记录调整。"}
          </small>
          {selected.paymentNote && <p>收款备注：{selected.paymentNote}</p>}
        </section>
        {decisionDraft ? (
          <section hidden={detailTab !== "本期明细"} className="statement-business-decision" aria-label="财务经营决定">
            <div className="section-head-row">
              <div><h3>{decisionDraft.type === "variance" ? "差额处理决定" : "核销决定"}</h3><span>决定人与系统操作人分别留痕；提交前冻结本次复核快照</span></div>
              <button type="button" disabled={decisionSubmitting || Boolean(decisionConfirmation)} onClick={() => setDecisionDraft(null)}>取消</button>
            </div>
            <div className="statement-business-decision__fields">
              {decisionDraft.type === "variance" ? (
                <label><span>处理结果</span><select disabled={decisionSubmitting || Boolean(decisionConfirmation)} value={decisionDraft.handlingResult} onChange={(event) => setDecisionDraft({ ...decisionDraft, handlingResult: event.target.value })}><option value="">请选择</option>{varianceHandlingOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
              ) : null}
              <label><span>{decisionDraft.type === "variance" ? "处理说明" : "核销说明"}</span><input disabled={decisionSubmitting || Boolean(decisionConfirmation)} value={decisionDraft.reason} onChange={(event) => setDecisionDraft({ ...decisionDraft, reason: event.target.value })} /></label>
            </div>
            {!activeDecisionDirectAllowed ? (
              <DelegatedBusinessDecisionFields
                scope={decisionDraft.type === "variance" ? "statement_variance" : "statement_write_off"}
                businessType="statement"
                businessId={selected.id}
                authState={authState}
                operatorId={currentUser?.userId}
                operatorName={currentUser?.displayName}
                value={decisionDraft.delegatedDecision}
                onChange={(delegatedDecision) => setDecisionDraft({ ...decisionDraft, delegatedDecision })}
                title={decisionDraft.type === "variance" ? "差额处理决定代录" : "核销决定代录"}
                disabled={decisionSubmitting || Boolean(decisionConfirmation)}
                requireEvidence={decisionDraft.type === "write_off"}
              />
            ) : <p className="form-note">当前账号具有本人直接决定权限；决定内容与系统操作人仍会分别写入决定和操作日志。</p>}
            <div className="action-row"><button ref={decisionTriggerRef} type="button" className="primary-action" disabled={!decisionReady || decisionSubmitting || Boolean(decisionConfirmation)} onClick={openDecisionConfirmation}>复核财务影响摘要</button></div>
            {decisionConfirmation ? (
              <div
                className="statement-business-decision__confirmation"
                role="dialog"
                aria-modal="true"
                aria-label="确认财务经营决定"
                ref={decisionDialogRef}
                tabIndex={-1}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  returnToDecisionEdit();
                }}
              >
                <h3>{decisionConfirmation.flow.type === "variance" ? "确认差额处理" : "确认对账核销"}</h3>
                <InfoGrid rows={[
                  ["对账单 / 客户", `${decisionConfirmation.statement.id} / ${decisionConfirmation.customer.name}`],
                  ["本期应收 / 实收", `${money(decisionConfirmation.financialSummary.currentReceivable)} / ${money(decisionConfirmation.financialSummary.currentReceived)}`],
                  ["本期未收 / 历史欠款", `${money(decisionConfirmation.financialSummary.currentUnpaid)} / ${money(decisionConfirmation.financialSummary.historicalDebt)}`],
                  ["累计欠款 / 本次差额", `${money(decisionConfirmation.financialSummary.cumulativeDebt)} / ${money(decisionConfirmation.blockingAmount)}`],
                  ["处理结果", decisionConfirmation.flow.type === "variance" ? decisionConfirmation.flow.handlingResult : "确认核销"],
                  ["处理说明", decisionConfirmation.flow.reason],
                  ["业务决定人", decisionConfirmation.directAllowed ? (currentUser?.displayName || currentUser?.userId) : decisionConfirmation.flow.delegatedDecision.decisionMakerEmployeeId],
                  ["系统操作人", currentUser?.displayName || currentUser?.userId],
                  ["决定渠道 / 时间", formatBusinessDecisionChannelAndTime(decisionConfirmation.directAllowed ? null : decisionConfirmation.flow.delegatedDecision)],
                  ["决定内容", getBusinessDecisionContentSummary({
                    delegatedDecision: decisionConfirmation.directAllowed ? null : decisionConfirmation.flow.delegatedDecision,
                    directSummary: decisionConfirmation.flow.type === "variance"
                      ? `${decisionConfirmation.flow.handlingResult}：${decisionConfirmation.flow.reason}`
                      : `确认核销：${decisionConfirmation.flow.reason}`,
                  })],
                  ["授权依据", decisionConfirmation.directAllowed ? "本人当前有效权限" : decisionConfirmation.flow.delegatedDecision.authorizationBasis],
                  ["预计影响", decisionConfirmation.flow.type === "variance" ? "更新差额、欠款/待办、决定证据和审计记录；不直接改库存。" : "更新结算状态并写入核销、决定证据和审计记录；不直接改库存。"],
                ]} />
                <div className="action-row"><button type="button" disabled={decisionSubmitting} onClick={returnToDecisionEdit}>返回修改</button><button type="button" className="primary-action" disabled={decisionSubmitting} onClick={submitDecision}>{decisionSubmitting ? "提交中…" : "确认提交"}</button></div>
              </div>
            ) : null}
          </section>
        ) : null}
        <BusinessDecisionHistoryPanel authState={authState} operatorId={currentUser?.userId} businessType="statement" businessId={selected.id} />
        </div>
        <StatementActionBar
          actions={STATEMENT_ACTIONS_BY_TAB[detailTab]}
          detailTab={detailTab}
          getUiActionState={getUiActionState}
          onAction={startDecisionFlow}
        />
        <BusinessWriteConflictDialog
          open={Boolean(writeConflict)}
          error={writeConflict}
          onBack={() => setWriteConflict(null)}
          onRefresh={async () => {
            await onRefresh?.();
            setWriteConflict(null);
            setDecisionConfirmation(null);
          }}
        />
      </OperationalPanel>
    </section>
  );
}

function StatementCustomerHeader({ count, source, summary }) {
  return (
    <div className="statement-customer-head">
      <div>
        <span>客户账务</span>
        <h2>客户对账</h2>
        <small>{summary}</small>
      </div>
      <StatusPill tone={source === "api" ? "success" : "neutral"}>{count} 张</StatusPill>
    </div>
  );
}

function StatementQuickFilters({ value, options, onChange }) {
  return (
    <div className="statement-quick-filters" role="tablist" aria-label="对账快捷范围">
      {STATEMENT_QUICK_FILTERS.map((status) => {
        const count = options.find((item) => item.status === status)?.count ?? 0;
        const label = status === "默认待处理" ? "待处理" : status === "欠款/差额" ? "欠款" : "收款";
        return (
          <button type="button" role="tab" aria-selected={value === status} className={value === status ? "active" : ""} key={status} onClick={() => onChange(status)}>
            <span>{label}</span>
            <strong>{count}</strong>
          </button>
        );
      })}
    </div>
  );
}

function StatementFacts({ rows }) {
  return (
    <dl className="statement-facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatementActionBar({ actions, detailTab, getUiActionState, onAction }) {
  return (
    <div className="statement-actions operational-detail-actions">
      <span>{detailTab}操作</span>
      <div>
        {actions.map((item) => {
          const actionState = getUiActionState("statements", item);
          return (
            <button type="button" className={item === "确认核销" ? "primary-action" : ""} disabled={actionState.disabled} key={item} title={actionState.title} onClick={() => onAction(item)}>
              <StatementActionIcon label={item} /> {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatementActionIcon({ label }) {
  if (label.includes("Excel")) return <FileExcelOutlined aria-hidden="true" />;
  if (label.includes("预览")) return <FileTextOutlined aria-hidden="true" />;
  if (label.includes("发送")) return <SendOutlined aria-hidden="true" />;
  if (label.includes("回执") || label.includes("客户确认")) return <NotificationOutlined aria-hidden="true" />;
  if (label.includes("实收")) return <WalletOutlined aria-hidden="true" />;
  if (label.includes("核销")) return <CheckCircleOutlined aria-hidden="true" />;
  return <WarningOutlined aria-hidden="true" />;
}
