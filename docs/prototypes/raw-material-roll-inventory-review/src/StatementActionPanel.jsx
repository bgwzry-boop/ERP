import { useRef, useState } from "react";
import { markOfficeStatementSentViaApi, recordOfficeStatementCustomerConfirmation, recordOfficeStatementPayment } from "../../../../src/services/officeStatementApiClient.js";
import { getAttachmentPurposeRule, uploadOfficeAttachmentFile } from "../../../../src/services/officeAttachmentApiClient.js";
import { createOfficeIdempotencyKey } from "../../../../src/services/officeApiClientCore.js";
import { hasFinancePermission, money, paymentReview } from "./finance-dialog-model.js";
import { requireApiResult, useFinanceDialogAction } from "./useFinanceDialogAction.js";

export function StatementActionPanel({ detail, authState, mode, onBusyChange, onSaved, onRefresh }) {
  const payment = mode === "payment";
  const confirmation = mode === "confirmation";
  const permission = payment ? "statement.payment.record" : "statement.send";
  const title = payment ? "登记累计实收" : confirmation ? "登记客户确认" : "登记已发送";
  const purpose = payment ? "payment_screenshot" : "statement_customer_confirmation";
  const attachmentRule = getAttachmentPurposeRule(purpose);
  const attachmentAccept = [...attachmentRule.allowedMimePrefixes.map(prefix => `${prefix}*`), ...attachmentRule.allowedMimeTypes, ...attachmentRule.allowedExtensions].join(",");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [person, setPerson] = useState("");
  const [channel, setChannel] = useState("wechat");
  const [reason, setReason] = useState("");
  const [sendId, setSendId] = useState(detail.sendRecordId || "");
  const [verified, setVerified] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState([]);
  const fileInput = useRef(null);
  const action = useFinanceDialogAction(onBusyChange);
  const attachments = [...(detail.attachments ?? []), ...files.map(row => row.attachment).filter(Boolean)]
    .filter((row, index, all) => row.ownerType === "statement" && row.ownerId === detail.id && row.purpose === purpose && row.status === "uploaded" && row.hasContent === true
      && all.findIndex(item => item.attachmentId === row.attachmentId) === index);
  const terminal = /已核销|已结清/.test(detail.status);
  const blocked = payment && terminal ? "本期已核销或结清，不能在此修改实收。" : confirmation && !(detail.sendRecords ?? []).length ? "请先登记实际发送的对账单，再登记客户回复。" : "";

  function review() {
    action.setError("");
    try {
      if (!verified || !reason.trim()) throw new Error("请填写实际依据，并勾选核对确认。");
      if (!payment && !person.trim()) throw new Error(confirmation ? "请填写客户回复人。" : "请填写实际接收人。");
      if (confirmation && !detail.sendRecords.some(row => row.sendRecordId === sendId)) throw new Error("请选择本张对账单的发送记录。");
      if (files.some(row => !row.attachment)) throw new Error("还有附件未上传成功，请完成上传或移除后再核对。");
      const totals = payment ? paymentReview(detail, amount) : null;
      setSnapshot({
        idempotencyKey: createOfficeIdempotencyKey(), statement: structuredClone(detail), totals,
        input: {
          amount: totals?.amount, method, reason: reason.trim(), remark: reason.trim(),
          channel, sentTo: person.trim(), confirmedByCustomer: person.trim(), content: reason.trim(),
          sendRecordId: sendId, attachmentIds: [...selected],
          sentAt: new Date().toISOString(), confirmedAt: new Date().toISOString(), paidAt: new Date().toISOString(),
        },
      });
    } catch (error) { action.setError(error.message); }
  }

  function upload(row) {
    action.run(async (signal, live) => {
      const result = await uploadOfficeAttachmentFile({ authState, ownerType: "statement", ownerId: detail.id, purpose,
        fileType: row.file.type === "application/pdf" ? "pdf" : "image", file: row.file, contentRef: row.key,
      }, { serverRequired: true, signal, idempotencyKey: row.key });
      requireApiResult(result, value => value.attachment?.attachmentId && value.attachment.ownerType === "statement"
        && value.attachment.ownerId === detail.id && value.attachment.purpose === purpose && value.attachment.hasContent === true && value.attachment.status === "uploaded");
      if (!live()) return;
      setFiles(previous => previous.map(item => item.key === row.key ? { ...item, attachment: result.attachment } : item));
      setSelected(previous => [...new Set([...previous, result.attachment.attachmentId])]);
    });
  }

  function submit() {
    if (!snapshot) return;
    action.run(async (signal, live) => {
      const method = payment ? recordOfficeStatementPayment : confirmation ? recordOfficeStatementCustomerConfirmation : markOfficeStatementSentViaApi;
      const result = await method({ ...snapshot.input, authState, statement: snapshot.statement }, { serverRequired: true, signal, idempotencyKey: snapshot.idempotencyKey });
      requireApiResult(result, value => value.operationLogId && (payment ? value.payment?.statementId === detail.id && value.payment?.paymentRecordId : value.statementId === detail.id && (confirmation ? value.confirmationRecordId : value.sendRecordId)));
      if (live()) await onSaved?.(`${title}已保存。`);
    });
  }

  if (!hasFinancePermission(authState, permission)) return <p className="finance-muted">当前账号没有{title}权限。</p>;
  if (blocked) return <p className="finance-muted">{blocked}</p>;
  return <section className="finance-action-panel" aria-label={title}>
    {payment ? <p>这里保存的是<strong>本期累计实收</strong>，须包含以前到账的款项。保存后仍按原流程核对差额、确认核销。</p> : <p>{confirmation ? "填写客户实际回复；发送成功或已读不代表客户确认。" : "请先通过微信等实际渠道发送，再登记发送记录。此操作不会代发消息。"}</p>}
    <fieldset disabled={action.busy || Boolean(snapshot)}>
      <legend className="sr-only">{title}内容</legend>
      <div className="finance-form-grid">
        {payment ? <><label>本期累计实收（元）<input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder={`原累计 ${Number(detail.received ?? 0).toFixed(2)}`} /></label><label>收款方式<select value={method} onChange={event => setMethod(event.target.value)}><option value="bank_transfer">银行转账</option><option value="wechat">微信</option><option value="cash">现金</option><option value="other">其他</option></select></label></> : <><label>{confirmation ? "客户回复人" : "实际接收人"}<input value={person} onChange={event => setPerson(event.target.value)} /></label><label>实际渠道<select value={channel} onChange={event => setChannel(event.target.value)}><option value="wechat">微信</option><option value="email">邮件</option><option value="other">其他</option></select></label></>}
        {confirmation ? <label className="finance-span">关联发送记录<select value={sendId} onChange={event => setSendId(event.target.value)}><option value="">请选择</option>{detail.sendRecords.map(row => <option key={row.sendRecordId} value={row.sendRecordId}>{row.sendRecordId} · {row.sentTo || "未记录接收人"}</option>)}</select></label> : null}
        <label className="finance-span">{payment ? "到账及调整依据" : confirmation ? "客户回复原文或准确摘要" : "发送说明"}<textarea value={reason} rows={3} onChange={event => setReason(event.target.value)} /></label>
      </div>
      {payment || confirmation ? <div className="finance-evidence-picker"><p>凭证附件（可选）</p>
        {attachments.map(row => <label className="finance-check" key={row.attachmentId}><input type="checkbox" checked={selected.includes(row.attachmentId)} onChange={event => setSelected(previous => event.target.checked ? [...previous, row.attachmentId] : previous.filter(id => id !== row.attachmentId))} />{row.fileName}</label>)}
        {hasFinancePermission(authState, "attachment.create") ? <><label>添加{attachmentRule.allowedLabel}（每个不超过 {Math.floor(attachmentRule.maxBytes / 1024 / 1024)} MB）<input ref={fileInput} type="file" accept={attachmentAccept} onChange={event => { const file = event.target.files?.[0]; if (file) setFiles(previous => [...previous, { key: createOfficeIdempotencyKey(), file }]); event.target.value = ""; }} /></label>{files.filter(row => !row.attachment).map(row => <div className="finance-file" key={row.key}><span>{row.file.name} · 待上传</span><button type="button" onClick={() => upload(row)}>上传凭证</button><button type="button" onClick={() => setFiles(previous => previous.filter(item => item.key !== row.key))}>移除</button></div>)}</> : <p className="finance-muted">当前账号不能上传新附件。</p>}
      </div> : null}
      <label className="finance-check"><input type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)} />{payment ? "已核对累计到账，确认没有遗漏以前的收款。" : confirmation ? "以上为客户实际回复，我已核对。" : "已实际发送给上述接收人。"}</label>
    </fieldset>
    {snapshot ? <div className="finance-confirm" role="status"><h4>保存前核对</h4><p>{detail.customerName || detail.customerId} · {detail.id} · {detail.period || "未提供账期"}</p>{payment ? <dl><div><dt>原累计实收</dt><dd>{money(snapshot.totals.previous)}</dd></div><div><dt>保存后累计</dt><dd>{money(snapshot.totals.amount)}</dd></div><div><dt>本次变更</dt><dd>{money(snapshot.totals.difference)}</dd></div><div><dt>剩余未收</dt><dd>{money(snapshot.totals.unpaid)}</dd></div></dl> : <p>{snapshot.input.sentTo} · {snapshot.input.reason}</p>}{snapshot.totals?.difference < 0 ? <p className="finance-warning">累计实收将减少，请再次确认调整依据。</p> : null}{snapshot.totals?.overpaid > 0 ? <p className="finance-warning">累计实收超过本期应收 {money(snapshot.totals.overpaid)}，请核对是否含其他账期款项。</p> : null}<div className="finance-actions"><button disabled={action.busy} onClick={() => setSnapshot(null)} type="button">返回修改</button><button className="primary" disabled={action.busy || action.conflict} onClick={submit} type="button">{action.busy ? "保存中…" : "确认保存"}</button></div></div> : <button className="primary" disabled={action.busy || !verified} onClick={review} type="button">核对本次登记</button>}
    {action.error ? <p role="alert" className="finance-error">{action.error}</p> : null}
    {action.conflict ? <button disabled={action.busy} onClick={onRefresh} type="button">刷新账单后重新核对</button> : null}
  </section>;
}
