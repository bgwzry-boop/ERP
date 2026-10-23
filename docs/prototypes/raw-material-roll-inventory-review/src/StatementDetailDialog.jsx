import { useEffect, useRef, useState } from "react";
import { getOfficeStatementDetail, previewOfficeStatement, downloadOfficeStatementExport } from "../../../../src/services/officeStatementApiClient.js";
import { downloadOfficeAttachmentContent } from "../../../../src/services/officeAttachmentApiClient.js";
import { createOfficeIdempotencyKey } from "../../../../src/services/officeApiClientCore.js";
import { ReviewDialog } from "./ReviewDialog.jsx";
import { StatementActionPanel } from "./StatementActionPanel.jsx";
import { evidenceTime, financeSessionKey, hasFinancePermission, money } from "./finance-dialog-model.js";
import { requireApiResult, useFinanceDialogAction } from "./useFinanceDialogAction.js";
import "./finance-dialogs.css";

export function StatementDetailDialog(props) {
  return <StatementDetailSession key={financeSessionKey(props.statementId, props.authState)} {...props} />;
}

function StatementDetailSession({ statementId, authState, onClose, onUpdated }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [active, setActive] = useState("payment");
  const [notice, setNotice] = useState("");
  const [panelBusy, setPanelBusy] = useState(false);
  const writeBusy = useRef(false);
  const exportRequest = useRef(null);
  const action = useFinanceDialogAction(value => { writeBusy.current = value; });
  const busy = panelBusy || action.busy;
  function setBusy(value) { writeBusy.current = value; setPanelBusy(value); }
  function close() { if (!writeBusy.current) onClose?.(); }
  function refresh() { setDetail(null); setRetry(value => value + 1); }
  async function saved(message) {
    setBusy(false); setNotice(message); setDetail(null); setRetry(value => value + 1);
    try { await onUpdated?.(); } catch { setNotice(`${message} 列表未刷新，请稍后刷新列表。`); }
  }
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setLoading(true); setLoadError("");
    if (!hasFinancePermission(authState, "statement.preview")) {
      setLoadError("当前账号没有查看对账单的权限。"); setLoading(false); return;
    }
    getOfficeStatementDetail({ statementId, authState }, { serverRequired: true, signal: controller.signal }).then(result => {
      if (!live) return;
      if (result.source !== "api" || result.blocked || result.detail?.id !== statementId) setLoadError(result.error?.message || "未能读取这张对账单，请重试。");
      else setDetail(result.detail);
    }).catch(error => { if (live) setLoadError(error.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; controller.abort(); };
  }, [retry]);

  function download(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = String(fileName || "对账凭证").replace(/[\\/]/g, "_"); anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportStatement() {
    if (!detail) return;
    if (exportRequest.current?.revision !== detail.revision) exportRequest.current = { revision: detail.revision, key: createOfficeIdempotencyKey() };
    action.run(async (signal, live) => {
      const preview = requireApiResult(await previewOfficeStatement({ authState, statement: detail }, { serverRequired: true, signal, idempotencyKey: exportRequest.current.key }), value => value.preview?.downloadToken);
      const file = requireApiResult(await downloadOfficeStatementExport({ authState, statement: detail, preview: preview.preview, allowLocalFallback: false }, { serverRequired: true, signal }), value => value.workbookData instanceof Uint8Array && value.workbookData.byteLength > 0);
      if (live()) { download(new Blob([file.workbookData], { type: file.contentType }), file.fileName); setNotice("已下载服务器留存的对账文件，请核对后通过实际渠道发送。"); }
    });
  }
  function downloadEvidence(row) {
    action.run(async (signal, live) => {
      const result = requireApiResult(await downloadOfficeAttachmentContent({ authState, attachmentId: row.attachmentId }, { serverRequired: true, signal }), value => value.contentBlob instanceof Blob);
      if (live()) download(result.contentBlob, row.fileName);
    });
  }
  return <ReviewDialog labelledBy="statement-detail-title" className="finance-dialog" onClose={close}>
    <header><div><span>{statementId}</span><h2 id="statement-detail-title">对账明细</h2><p>{detail ? `${detail.customerName || detail.customerId} · ${detail.period || "账期待维护"} · ${detail.status}` : "读取当前账单"}</p></div><button aria-label="关闭对账明细" disabled={busy} type="button" onClick={close}>×</button></header>
    <div className="finance-dialog-content" aria-busy={loading || busy}>
      {notice ? <p className="finance-notice" role="status">{notice}</p> : null}
      {loading ? <p role="status">正在读取账单明细…</p> : loadError ? <div role="alert"><p>{loadError}</p><button type="button" onClick={refresh}>重新读取</button></div> : detail ? <>
        <dl className="finance-summary"><div><dt>本期应收</dt><dd>{money(detail.receivable)}</dd></div><div><dt>本期累计实收</dt><dd>{money(detail.received)}</dd></div><div><dt>本期未收</dt><dd>{money(detail.currentUnpaid)}</dd></div><div><dt>历史欠款</dt><dd>{money(detail.historicalDebt)}</dd></div></dl>
        <section><h3>本期订单明细</h3>{detail.lineSource === "linked_order" ? <p className="finance-muted">以下为账单关联的订单参考明细，尚未形成留存的对账明细版本；金额以本期账单为准。</p> : null}
          {detail.statementLines.length ? <div className="finance-table-scroll"><table><thead><tr><th>订单 / 产品</th><th>规格</th><th>送货 / 计费数量</th><th>金额</th></tr></thead><tbody>{detail.statementLines.map(row => <tr key={row.statementLineId}><td>{row.orderNo}<br />{row.productName}</td><td>{row.goodsSpec || "未提供"}</td><td>{row.deliveredQty} / {row.chargeableQty}</td><td>{money(row.finalAmount)}</td></tr>)}</tbody></table></div> : <p className="finance-muted">这张账单没有可读取的关联明细。</p>}
        </section>
        <section><div className="finance-section-heading"><h3>办理对账</h3><button type="button" disabled={busy} onClick={exportStatement}>下载对账文件</button></div>
          <div className="finance-tabs" role="group" aria-label="对账办理动作">{[["payment", "登记累计实收"], ["send", "登记已发送"], ["confirmation", "登记客户确认"]].map(([key, label]) => <button type="button" key={key} disabled={busy} aria-pressed={active === key} onClick={() => setActive(key)}>{label}</button>)}</div>
          <StatementActionPanel key={`${active}-${detail.revision}-${retry}`} detail={detail} authState={authState} mode={active} onBusyChange={setBusy} onSaved={saved} onRefresh={refresh} />
        </section>
        <section><h3>实收登记记录</h3><p className="finance-muted">每条为当时登记的本期累计实收，不能把这些记录再相加。</p>{detail.payments.length ? <div className="finance-table-scroll"><table><thead><tr><th>登记时间</th><th>累计实收</th><th>经办人</th><th>依据</th></tr></thead><tbody>{detail.payments.map(row => <tr key={row.paymentRecordId}><td>{evidenceTime(row.paidAt)}</td><td>{money(row.amount)}</td><td>{row.operatorId || "未提供"}</td><td>{row.remark || "未填写"}</td></tr>)}</tbody></table></div> : <p className="finance-muted">尚无实收登记记录。</p>}</section>
        <details><summary>发送、客户确认与凭证</summary>
          {(detail.sendRecords ?? []).map(row => <article className="finance-history" key={row.sendRecordId}><strong>发送给 {row.sentTo || "未记录接收人"}</strong><p>{evidenceTime(row.sentAt)} · {row.channel} · {row.remark || "未填写说明"}</p></article>)}
          {(detail.confirmationRecords ?? []).map(row => <article className="finance-history" key={row.confirmationRecordId}><strong>{row.confirmedByCustomer || "客户"}的回复</strong><p>{evidenceTime(row.confirmedAt)} · {row.content}</p></article>)}
          {!(detail.sendRecords?.length || detail.confirmationRecords?.length) ? <p className="finance-muted">尚无发送或客户确认记录。</p> : null}
          <h4>凭证附件</h4>{hasFinancePermission(authState, "attachment.view") ? detail.attachments?.length ? detail.attachments.map(row => <div className="finance-file" key={row.attachmentId}><span>{row.fileName}</span><button type="button" disabled={busy || !row.hasContent || row.status !== "uploaded"} onClick={() => downloadEvidence(row)}>下载凭证</button></div>) : <p className="finance-muted">尚无可读取的凭证。</p> : <p className="finance-muted">当前账号没有查看附件的权限。</p>}
        </details>
        {Number(detail.evidenceWarnings?.mismatchedCustomerPaymentCount) + Number(detail.evidenceWarnings?.unlinkedConfirmationCount) > 0 ? <p role="alert" className="finance-warning">存在归属不一致的历史记录，已从明细中隔离，请管理员核查。</p> : null}
      </> : null}
      {action.error ? <p role="alert" className="finance-error">{action.error}</p> : null}
    </div><footer><button type="button" disabled={busy || loading} onClick={refresh}>刷新明细</button><button type="button" disabled={busy} onClick={close}>返回列表</button></footer>
  </ReviewDialog>;
}
