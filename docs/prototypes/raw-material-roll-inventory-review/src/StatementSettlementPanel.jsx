import { useEffect, useRef, useState } from "react";
import { DelegatedBusinessDecisionFields, isDelegatedBusinessDecisionComplete } from "../../../../src/components/DelegatedBusinessDecisionFields.jsx";
import { createOfficeIdempotencyKey } from "../../../../src/services/officeApiClientCore.js";
import { handleOfficeStatementVariance, writeOffOfficeStatement } from "../../../../src/services/officeStatementApiClient.js";
import { settleOfficeStatementExactPayment } from "../../../../src/services/officeStatementExactPaymentApiClient.js";
import { statementVarianceOptions } from "../../../../shared/statementVarianceCatalog.js";
import { getStatementPaymentBlocker } from "../../../../shared/statementPaymentPolicy.js";
import { optionalFinancialAmount } from "../../../../src/services/officeStatementSelectors.js";
import { evidenceTime, hasFinancePermission, money } from "./finance-dialog-model.js";
import { requireApiResult, useFinanceDialogAction } from "./useFinanceDialogAction.js";

export function StatementSettlementPanel({ detail, authState, mode, onBusyChange, onSaved, onRefresh }) {
  const exact = mode === "exact", variance = mode === "variance";
  const permission = exact ? "statement.exact_payment.settle" : variance ? "statement.variance.handle" : "statement.write_off";
  const scope = variance ? "statement_variance" : "statement_write_off";
  const direct = hasFinancePermission(authState, variance ? "statement.variance.direct" : "statement.write_off.direct");
  const title = exact ? "足额款结清" : variance ? "差额处理" : "授权结算与核销";
  const [handling, setHandling] = useState("");
  const [reason, setReason] = useState("");
  const [verified, setVerified] = useState(false);
  const [paymentId, setPaymentId] = useState("");
  const [confirmationId, setConfirmationId] = useState("");
  const [paymentAttachmentId, setPaymentAttachmentId] = useState("");
  const [customerAttachmentId, setCustomerAttachmentId] = useState("");
  const [delegated, setDelegated] = useState({});
  const [evidenceReady, setEvidenceReady] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [uncertain, setUncertain] = useState(false);
  const uncertainRef = useRef(false);
  const busyListener = useRef(onBusyChange);
  busyListener.current = onBusyChange;
  const action = useFinanceDialogAction(value => onBusyChange?.(value || uncertainRef.current));
  useEffect(() => () => busyListener.current?.(false), []);
  const amounts = [detail.receivable, detail.received, detail.variance].map(optionalFinancialAmount);
  const known = amounts.every(value => value !== null);
  const [receivable, received, difference] = amounts;
  const payment = (detail.payments ?? []).find(row => row.paymentRecordId === paymentId);
  const confirmation = (detail.confirmationRecords ?? []).find(row => row.confirmationRecordId === confirmationId);
  const attachments = (detail.attachments ?? []).filter(row => row.status === "uploaded" && row.hasContent);
  const canAct = hasFinancePermission(authState, permission);
  const closed = getStatementPaymentBlocker(detail);

  function review() {
    action.resetError();
    if (!known || !reason.trim() || !verified) return action.setError("请先核实三项金额、填写依据并勾选确认。");
    if (exact && (receivable <= 0 || received !== receivable || difference !== 0)) return action.setError("足额结清仅适用于本期应收与累计实收一致且差额为零；差额须另行处理。");
    if (exact && (!paymentId || !confirmationId || !paymentAttachmentId || !customerAttachmentId)) return action.setError("请分别选择本账单收款与客户回复记录，以及两类留存凭证。");
    if (!exact && (variance && !handling || !direct && (!evidenceReady || !isDelegatedBusinessDecisionComplete(delegated, { requireEvidence: !variance })))) return action.setError("请完成处理结果和有权决定人的凭据核对。");
    setSnapshot({ statement: structuredClone(detail), idempotencyKey: createOfficeIdempotencyKey(),
      input: exact ? { expectedRevision: detail.revision, expectedReceivable: receivable, expectedReceived: received,
        paymentRecordId: paymentId, customerConfirmationRecordId: confirmationId, paymentAttachmentId, customerAttachmentId, matchNote: reason.trim() }
        : { expectedRevision: detail.revision, reason: reason.trim(), confirmReason: reason.trim(), handlingResult: handling,
          varianceAmount: difference, ...(direct ? { directDecisionContent: { summary: reason.trim() } } : { delegatedDecision: structuredClone(delegated) }) } });
  }
  function submit() {
    if (!snapshot) return;
    action.run(async (signal, live) => {
      try {
        const execute = exact ? settleOfficeStatementExactPayment : variance ? handleOfficeStatementVariance : writeOffOfficeStatement;
        const result = await execute({ ...snapshot.input, statement: snapshot.statement, authState,
          operatorId: authState?.permissions?.user?.userId, idempotencyKey: snapshot.idempotencyKey }, { serverRequired: true, signal, idempotencyKey: snapshot.idempotencyKey });
        requireApiResult(result, value => value.operationLogId && (variance ? value.varianceRecord?.statementId === detail.id
          && value.varianceRecord?.varianceRecordId : value.statementId === detail.id && value.writeOffRecord?.statementId === detail.id
          && value.writeOffRecord?.statementWriteOffRecordId));
        uncertainRef.current = false;
        if (live()) { setUncertain(false); await onSaved?.(`${title}已保存。`); }
      } catch (error) {
        uncertainRef.current ||= !error.status || error.status >= 500 || [408, 429].includes(error.status);
        if (live()) setUncertain(uncertainRef.current);
        throw error;
      }
    });
  }
  if (!canAct) return <p className="finance-muted">当前账号没有{title}权限。</p>;
  if (!exact && !direct && !hasFinancePermission(authState, variance ? "statement.variance.record_delegated" : "statement.write_off.record_delegated")) return <p className="finance-muted">当前账号没有本类决定的直接办理或代录授权，请由有权人员处理。</p>;
  if (closed) return <p className="finance-muted">{closed} 后续更正请走独立处理，不能重开本账期。</p>;
  if (!known) return <p className="finance-warning">本期应收、累计实收或差额待核实，暂不能办理结算。</p>;
  if (exact && (receivable <= 0 || received !== receivable || difference !== 0)) return <p className="finance-warning">本期应收、累计实收尚未足额一致，请先登记实际到账；少付差额须另行审批，不能在这里抹去。</p>;
  return <section className="finance-action-panel" aria-label={title}>
    <p>{exact ? "先登记累计实收及本账单客户回复，再分别匹配到账凭证和客户消息或截图；两类凭证须已留存。这里只结清足额款，不批准差额、减免或抹零。" : "差额处理和核销是独立动作。决定人与系统经办人分别留痕；抹零、减免和转欠款须有对应授权。"}</p>
    <fieldset disabled={action.busy || Boolean(snapshot)}><legend className="sr-only">{title}内容</legend>
      {exact ? <div className="finance-form-grid">
        <label>匹配收款记录<select value={paymentId} onChange={event => { setPaymentId(event.target.value); setPaymentAttachmentId(""); }}><option value="">选择当前累计到账记录</option>{(detail.payments ?? []).map(row => <option key={row.paymentRecordId} value={row.paymentRecordId}>{money(row.amount)} · {{ wechat: "微信", alipay: "支付宝", bank_transfer: "银行转账", cash: "现金", other: "其他" }[row.method] || "方式待核实"} · {evidenceTime(row.paidAt)}</option>)}</select></label>
        <label>到账留存凭证<select value={paymentAttachmentId} onChange={event => setPaymentAttachmentId(event.target.value)}><option value="">选择微信或支付宝到账图</option>{attachments.filter(row => row.purpose === "payment_screenshot" && payment?.attachmentIds?.includes(row.attachmentId)).map(row => <option key={row.attachmentId} value={row.attachmentId}>{row.fileName}</option>)}</select></label>
        <label>本账单客户回复<select value={confirmationId} onChange={event => { setConfirmationId(event.target.value); setCustomerAttachmentId(""); }}><option value="">选择实际回复记录</option>{(detail.confirmationRecords ?? []).map(row => <option key={row.confirmationRecordId} value={row.confirmationRecordId}>{row.confirmedByCustomer} · {row.content}</option>)}</select></label>
        <label>客户消息或截图凭证<select value={customerAttachmentId} onChange={event => setCustomerAttachmentId(event.target.value)}><option value="">选择客户留存凭证</option>{attachments.filter(row => row.purpose === "statement_customer_confirmation" && confirmation?.attachmentIds?.includes(row.attachmentId)).map(row => <option key={row.attachmentId} value={row.attachmentId}>{row.fileName}</option>)}</select></label>
      </div> : variance ? <label>差额处理结果<select value={handling} onChange={event => setHandling(event.target.value)}><option value="">请选择</option>{statementVarianceOptions.map(row => <option value={row.value} key={row.value}>{row.label}</option>)}</select></label> : null}
      <label>{exact ? "到账与客户回复的匹配依据" : "本次决定与办理依据"}<textarea value={reason} maxLength={1000} rows={3} onChange={event => setReason(event.target.value)} /></label>
      {!exact && !direct && !snapshot ? <DelegatedBusinessDecisionFields scope={scope} businessType="statement" businessId={detail.id}
        authState={authState} operatorId={authState?.permissions?.user?.userId} value={delegated} onChange={setDelegated}
        onReadinessChange={setEvidenceReady} disabled={action.busy} requireEvidence={!variance} /> : !exact && direct ? <p>当前账号具有本人直接决定权限，仍须填写本次依据并保留服务端审计。</p> : null}
      <label className="finance-check"><input type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)} />已核对当前账单、金额及对应凭据。</label>
    </fieldset>
    {snapshot ? <div className="finance-confirm" role="status"><h4>确认{title}</h4><p>{detail.customerName || detail.customerId} · {detail.id} · 第{snapshot.statement.revision}版</p>
      <dl><div><dt>本期应收</dt><dd>{money(snapshot.statement.receivable)}</dd></div><div><dt>累计实收</dt><dd>{money(snapshot.statement.received)}</dd></div><div><dt>本期差额</dt><dd>{money(snapshot.statement.variance)}</dd></div><div><dt>处理结果</dt><dd>{exact ? "足额结清" : variance ? statementVarianceOptions.find(row => row.value === snapshot.input.handlingResult)?.label : snapshot.statement.varianceHandling || "按当前决定核销"}</dd></div></dl>
      {exact ? <p>到账凭据：{attachments.find(row => row.attachmentId === snapshot.input.paymentAttachmentId)?.fileName}；客户凭据：{attachments.find(row => row.attachmentId === snapshot.input.customerAttachmentId)?.fileName}。</p> : null}
      {!exact && snapshot.input.delegatedDecision ? <p>决定内容：{snapshot.input.delegatedDecision.decisionContent?.summary}；授权依据：{snapshot.input.delegatedDecision.authorizationBasis}。本次决定凭据已锁定 {snapshot.input.delegatedDecision.evidenceAttachmentIds?.length ?? 0} 份。</p> : null}
      <p>提交将更新账单状态并写入结算记录和操作日志；原账单和金额依据继续保留。</p>
      <div className="finance-actions"><button disabled={action.busy || uncertain} type="button" onClick={() => setSnapshot(null)}>返回修改</button><button className="primary" disabled={action.busy || action.conflict && !uncertain} type="button" onClick={submit}>{action.busy ? "保存中…" : uncertain ? "用原内容重试" : "确认办理"}</button></div>
    </div> : <button type="button" className="primary" disabled={action.busy || !verified} onClick={review}>核对结算影响</button>}
    {uncertain ? <p className="finance-warning">提交结果尚未确认，已锁定本次内容和提交编号，请重试核对。</p> : null}
    {action.error ? <p role="alert" className="finance-error">{action.error}</p> : null}
    {action.conflict && !uncertain ? <button type="button" disabled={action.busy} onClick={onRefresh}>刷新账单后重新核对</button> : null}
  </section>;
}
