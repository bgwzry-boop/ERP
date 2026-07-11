import { useState } from "react";
import { DataTable, InfoGrid } from "../../components/ui.jsx";
import { formatAttachmentSize, isInlineImageAttachment } from "../attachments/attachmentPresentation.js";

export function StatementPage({ statements, orderLines, readMeta, selectedId, setSelectedId, onAction, helpers }) {
  const {
    defaultStatementFilters,
    findCustomer,
    findOrderLine,
    getLineColorSpecLabel,
    getOrderLineShortNo,
    getStatementBlockingAmount,
    getStatementBucket,
    getStatementDisplayDebt,
    getStatementFinancialSummary,
    getUiActionState,
    money,
    statementFilterOptions,
    statementMatchesFilters,
  } = helpers;
  const [filters, setFilters] = useState(defaultStatementFilters);
  const filtered = statements.filter((item) => statementMatchesFilters(item, filters));
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? statements.find((item) => item.id === selectedId) ?? statements[0];
  if (!selected) {
    return (
      <section className="page-grid statement-layout">
        <div className="customer-list">
          <div className="panel-head compact">
            <h2>客户对账</h2>
            <span>{readMeta?.loading ? "正在读取后端对账数据" : "暂无对账数据"}</span>
          </div>
          <div className="empty-row">{readMeta?.error || "当前账期暂无客户对账单。"}</div>
        </div>
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
  const statementMetrics = [
    ["本期待对账", statements.filter((item) => getStatementBucket(item) === "本期待对账").length],
    ["欠款/差额", statements.filter((item) => getStatementBucket(item) === "欠款/差额" || getStatementDisplayDebt(item) > 0).length],
    ["收款待确认", statements.filter((item) => getStatementBucket(item) === "收款待确认").length],
  ];

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  return (
    <section className="page-grid statement-layout">
      <div className="customer-list">
        <div className="panel-head compact">
          <h2>客户对账</h2>
          <span>
            默认：本期待对账 / 欠款 / 收款待确认
            {readMeta?.source === "api" ? ` · 后端对账 ${readMeta.total ?? statements.length} 条` : ""}
          </span>
        </div>
        <div className="statement-filter-panel">
          <label>
            <span>客户 / 对账单</span>
            <input placeholder="客户名 / 单号 / 联系人" value={filters.query} onChange={(event) => updateFilter("query", event.target.value)} />
          </label>
          <label>
            <span>范围</span>
            <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
              {statementFilterOptions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <div className="statement-filter-summary">
            <span>{statementMetrics.map(([label, value]) => `${label} ${value}`).join(" · ")}；命中 {filtered.length}</span>
            <button onClick={() => setFilters(defaultStatementFilters)}>重置</button>
          </div>
        </div>
        <div className="statement-customer-scroll">
          {filtered.map((item) => {
            const customer = findCustomer(item.customerId);
            const debtAmount = getStatementFinancialSummary(item).cumulativeDebt;
            return (
              <button className={item.id === selected.id ? "customer-row active" : "customer-row"} key={item.id} onClick={() => setSelectedId(item.id)}>
                <strong>{customer.name}</strong>
                <span>{customer.cycle} · 上次 {customer.lastStatement} · {getStatementBucket(item)}</span>
                <small>{money(item.receivable)} · {item.status}{debtAmount > 0 ? ` · 差额/欠款 ${money(debtAmount)}` : ""}</small>
              </button>
            );
          })}
          {!filtered.length && <div className="empty-row">没有匹配客户</div>}
        </div>
      </div>
      <div className="statement-main">
        <div className="statement-summary">
          <div>
            <span>客户</span>
            <strong>{customerInfo.name}</strong>
          </div>
          <div>
            <span>本期应收</span>
            <strong>{money(financialSummary.currentReceivable)}</strong>
          </div>
          <div>
            <span>本期实收</span>
            <strong>{money(financialSummary.currentReceived)}</strong>
          </div>
          <div className={financialSummary.currentUnpaid > 0 ? "warning" : "settled"}>
            <span>本期未收</span>
            <strong>{money(financialSummary.currentUnpaid)}</strong>
          </div>
          <div className={financialSummary.historicalDebt > 0 ? "warning" : "settled"}>
            <span>历史欠款</span>
            <strong>{money(financialSummary.historicalDebt)}</strong>
          </div>
          <div className={financialSummary.cumulativeDebt > 0 ? "danger" : "settled"}>
            <span>累计欠款</span>
            <strong>{money(financialSummary.cumulativeDebt)}</strong>
          </div>
        </div>
        <section className="detail-section">
          <InfoGrid
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
        <section className="detail-section">
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
        <section className="detail-section">
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
        <section className="detail-section">
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
        <section className="detail-section">
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
        <DataTable
          className="statement-table"
          columns={["明细", "产品", "尺寸/颜色", "交付", "计费数", "原金额", "调整", "应收", "备注"]}
          rows={lines.map((row) => ({
            id: row.id,
            tone: row.exceptions.length ? "warning" : "neutral",
            cells: [getOrderLineShortNo(row), row.product, `${row.size} ${getLineColorSpecLabel(row)}`, row.fulfillment, row.qty, money(row.amount), row.exceptions.length ? "赠送/差异" : money(0), money(row.amount), row.exceptions.join("、") || "正常"],
          }))}
        />
        <section className={blockingAmount > 0 ? "detail-section alert" : "detail-section"}>
          <h3>差额处理</h3>
          <p>
            {blockingAmount > 0
              ? `当前需处理 ${money(blockingAmount)}；处理结果为 ${selected.varianceHandling || "未选择"}。`
              : "当前无待处理差额，确认到账后可核销。"}
            {adjustment !== 0 ? ` 本期调整 ${money(adjustment)}，需保留内部原因。` : " 本期暂未记录调整。"}
          </p>
          {selected.paymentNote && <p>收款备注：{selected.paymentNote}</p>}
        </section>
        <div className="statement-actions">
          {["生成对账单预览", "标记已发送", "标记已读回执", "登记客户确认", "登记实收", "差额待确认", "确认核销", "导出Excel"].map((item) => {
            const actionState = getUiActionState("statements", item);
            return <button className={item === "确认核销" ? "primary-action" : ""} disabled={actionState.disabled} key={item} title={actionState.title} onClick={() => onAction(item, selected.id)}>{item}</button>;
          })}
        </div>
      </div>
    </section>
  );
}

function getStatementExportTypeLabel(previewType) {
  if (previewType === "customer_send") return "客户发送版";
  if (previewType === "internal_archive") return "内部留档版";
  return "导出文件";
}

function getStatementExportTimeLabel(value) {
  const text = String(value ?? "");
  if (!text) return "时间待补";
  if (text.includes("T")) return text.slice(5, 16).replace("T", " ");
  return text;
}

function getStatementExportTokenLabel(value) {
  const text = String(value ?? "");
  if (!text) return "待补";
  return text.length > 10 ? `...${text.slice(-10)}` : text;
}
