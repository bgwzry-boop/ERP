import { useEffect, useRef, useState } from "react";
import { dispatchOfficePrintJob, getOfficePrintJob, retryOfficePrintJob } from "../../../../src/services/officePrintJobApiClient.js";
import { createOfficeIdempotencyKey } from "../../../../src/services/officeApiClientCore.js";
import { ReviewDialog } from "./ReviewDialog.jsx";
import { evidenceTime, financeSessionKey, hasFinancePermission, printAction, printStatusLabels } from "./finance-dialog-model.js";
import { requireApiResult, useFinanceDialogAction } from "./useFinanceDialogAction.js";
import "./finance-dialogs.css";

export function PrintJobDetailDialog(props) {
  return <PrintJobDetailSession key={financeSessionKey(props.printJobId, props.authState)} {...props} />;
}

function PrintJobDetailSession({ printJobId, authState, onClose, onUpdated }) {
  const [currentId, setCurrentId] = useState(printJobId);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [reason, setReason] = useState("");
  const [verified, setVerified] = useState(false);
  const [notice, setNotice] = useState("");
  const request = useRef(null);
  const busyRef = useRef(false);
  const action = useFinanceDialogAction(value => { busyRef.current = value; });
  const permitted = hasFinancePermission(authState, "fulfillment.print");
  const kind = printAction(job);
  const payload = job?.payloadSnapshot ?? job?.payload ?? {};
  const template = payload.printTemplate ?? {};
  const preview = job?.driverMode === "preview_only";
  function close() { if (!busyRef.current) onClose?.(); }
  function refresh() { if (action.conflict) request.current = null; action.resetError(); setJob(null); setRetry(value => value + 1); }
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setLoading(true); setLoadError("");
    if (!permitted) { setLoading(false); setLoadError("当前账号没有查看打印作业的权限。"); return; }
    getOfficePrintJob({ authState, printJobId: currentId }, { serverRequired: true, signal: controller.signal }).then(result => {
      if (!live) return;
      if (result.source === "api" && result.printJob?.printJobId === currentId) setJob(result.printJob);
      else setLoadError(result.error?.message || "读取打印作业失败。");
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; controller.abort(); };
  }, [currentId, retry]);
  function submit() {
    if (!kind || !verified || !reason.trim()) return;
    if (!request.current) request.current = { id: currentId, kind, reason: reason.trim(), key: createOfficeIdempotencyKey() };
    const frozen = request.current;
    action.run(async (signal, live) => {
      const method = frozen.kind === "retry" ? retryOfficePrintJob : dispatchOfficePrintJob;
      const result = requireApiResult(await method({ authState, printJobId: frozen.id, reason: frozen.reason, retryReason: frozen.reason }, { serverRequired: true, signal, idempotencyKey: frozen.key }), value => value.operationLogId && value.printJob?.printJobId && (frozen.kind === "retry" ? value.sourcePrintJob?.printJobId === frozen.id && value.printJob.sourcePrintJobId === frozen.id : value.printJob.printJobId === frozen.id));
      if (!live()) return;
      request.current = null; setVerified(false); setReason("");
      setNotice(frozen.kind === "retry" ? "已建立新的重试作业，请核对后派发。" : preview ? "预览请求已提交；这不代表打印机已经出纸。" : "已提交派发，完成状态以设备回执为准。");
      setCurrentId(result.printJob.printJobId); setJob(result.printJob);
      try { await onUpdated?.(result.printJob); } catch { setNotice("操作已保存，列表未刷新，请稍后刷新列表。"); }
    });
  }
  return <ReviewDialog labelledBy="print-job-detail-title" className="finance-dialog print-job-dialog" onClose={close}>
    <header><div><span>{currentId}</span><h2 id="print-job-detail-title">打印作业详情</h2><p>{job ? printStatusLabels[job.jobStatus] || job.jobStatus : "读取作业"}</p></div><button type="button" aria-label="关闭打印作业详情" disabled={action.busy} onClick={close}>×</button></header>
    <div className="finance-dialog-content" aria-busy={loading || action.busy}>
      {notice ? <p role="status" className="finance-notice">{notice}</p> : null}
      {loading ? <p role="status">正在读取打印作业…</p> : loadError ? <p role="alert" className="finance-error">{loadError}</p> : job ? <>
        <dl className="finance-summary"><div><dt>关联业务</dt><dd>{job.targetId || "未提供"}</dd></div><div><dt>打印设备</dt><dd>{job.printDeviceName || job.printDeviceId || "未指定"}</dd></div><div><dt>打印方式</dt><dd>{preview ? "仅预览，不出纸" : job.driverMode === "system_printer" ? "系统打印机" : job.driverMode || "未提供"}</dd></div><div><dt>第几次作业</dt><dd>{job.attemptNo}</dd></div><div><dt>创建时间</dt><dd>{evidenceTime(job.createdAt)}</dd></div><div><dt>派发时间</dt><dd>{evidenceTime(job.sentAt)}</dd></div></dl>
        <section><h3>本次打印内容</h3><p>{template.documentTitle || template.title || job.documentType || "未提供单据类型"}</p><p className="finance-muted">模板：{job.templateId || "未提供"} · 业务记录：{job.printRecordId || "未提供"}</p><dl className="finance-summary"><div><dt>客户</dt><dd>{payload.customer?.name || payload.customer?.customerName || payload.customerName || template.fields?.customerName || template.customerName || "未提供"}</dd></div><div><dt>纸张</dt><dd>{template.paper?.name || template.paperSize || "按设备模板"}</dd></div></dl><dl className="finance-summary"><div><dt>货品与规格</dt><dd>{template.fields?.goodsSummary || payload.goodsSummary || "未提供"}</dd></div><div><dt>数量</dt><dd>{template.fields?.quantityText || (template.fields?.quantity != null ? `${template.fields.quantity} 个` : "未提供")}</dd></div><div><dt>包数</dt><dd>{template.fields?.packageText || "未提供"}</dd></div><div><dt>金额</dt><dd>{template.priceHidden ? "此类标签不显示价格" : template.fields?.totalAmountText || template.fields?.amountText || "以打印明细为准"}</dd></div></dl><p className="finance-muted">这里核对作业与模板身份；实际出纸后仍须核对字迹、裁切及挂牌与实物是否一致。</p></section>
        {job.errorMessage ? <p role="alert" className="finance-error">{job.errorMessage}</p> : null}
        {kind && permitted ? <section><h3>{kind === "retry" ? "建立重试作业" : preview ? "生成预览" : "派发到打印机"}</h3><fieldset disabled={action.busy || Boolean(request.current)}><legend className="sr-only">打印操作确认</legend><label>操作说明<textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} /></label><label className="finance-check"><input type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)} />{kind === "retry" ? "已检查原作业和实际出纸情况，确认需要重试。" : "已核对关联业务、打印内容与目标设备。"}</label></fieldset><button type="button" className="primary" disabled={action.busy || !verified || !reason.trim() || action.conflict} onClick={submit}>{action.busy ? "提交中…" : kind === "retry" ? "确认建立重试作业" : preview ? "确认生成预览" : "确认派发"}</button></section> : <p className="finance-muted">{job.jobStatus === "sent" ? "已交给设备处理，请刷新查看设备回执。不能手动标成已打印。" : "当前状态没有可派发或重试的操作。"}</p>}
      </> : null}
      {action.error ? <p role="alert" className="finance-error">{action.error} 如网络中断，请先刷新核对作业，再决定是否重试。</p> : null}
    </div><footer><button type="button" disabled={loading || action.busy} onClick={refresh}>刷新作业</button><button type="button" disabled={action.busy} onClick={close}>返回列表</button></footer>
  </ReviewDialog>;
}
