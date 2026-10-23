import { useEffect, useRef, useState } from 'react';
import { reviewOfficeProductionFinishedGoodsPhoto } from '../../../../src/services/officeProductionPackingLazyApi.js';
import { ProductionPhotoEvidence } from './ProductionPhotoEvidence.jsx';

export function ProductionPhotoReview({ detail, authState, onSaved, loadContent, review = reviewOfficeProductionFinishedGoodsPhoto }) {
  const [viewed, setViewed] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshBusy = useRef(false);
  const [frozen, setFrozen] = useState(null);
  const [committed, setCommitted] = useState(false);
  const [message, setMessage] = useState('');
  const busy = useRef(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const permissions = authState?.permissions?.actionPermissions || [];
  const allowed = permissions.includes('production.schedule.publish') && permissions.includes('attachment.view');
  async function refreshSaved() {
    if (refreshBusy.current) return;
    refreshBusy.current = true; setRefreshing(true);
    setMessage("审核已保存，正在重新读取结果。");
    try {
      if (typeof onSaved !== "function") throw Error("refresh unavailable");
      const result = await onSaved?.();
      if (result?.blocked || result?.source === 'api_error') throw Error('refresh');
      if (live.current) setMessage('审核已保存，已请求重新读取；任务详情以读取结果为准。');
    } catch {
      if (live.current) setMessage('审核已保存，但刷新失败，请重新读取结果；无需再次提交审核。');
    } finally {
      refreshBusy.current = false;
      if (live.current) setRefreshing(false);
    }
  }
  async function submit(status) {
    if (committed || !allowed || busy.current || (!frozen && !viewed)) return;
    if (!frozen && status === '需重拍' && !reason.trim()) { setMessage('请填写具体退回原因。'); return; }
    const request = frozen || {
      productionTaskId: detail.productionTaskId, orderLineId: detail.orderLineId,
      expectedAttachmentId: detail.finishedGoodsPhoto?.attachmentId,
      expectedRevision: detail.productionTask?.revision, reviewStatus: status,
      reason: reason.trim(), idempotencyKey: crypto.randomUUID(),
    };
    busy.current = true; setPending(true); setFrozen(request); setMessage('');
    try {
      const result = await review({ ...request, authState }, { serverRequired: true });
      if (!live.current) return;
      if (result?.source !== 'api' || result.blocked) {
        const code = result?.error?.code || '';
        const uncertain = !code || /UNAVAILABLE|UNCONFIRMED/.test(code);
        if (!uncertain) setFrozen(null);
        setMessage(result?.error?.message || '结果未确认，请按原内容重试或刷新核对。');
        return;
      }
      setCommitted(true);
      setMessage('审核已保存，正在刷新任务与待办。');
      // Never apply a historical receipt over the current task; reread authoritative state.
      await refreshSaved();
    } catch {
      if (live.current) setMessage('结果未确认，请按原内容重试或刷新核对。');
    } finally {
      busy.current = false;
      if (live.current) setPending(false);
    }
  }
  return <section aria-label="成品图审核">
    <ProductionPhotoEvidence photo={detail.finishedGoodsPhoto || {}} authState={authState} loadContent={loadContent} onViewed={setViewed} />
    <label>审核说明／退回原因<textarea aria-label="审核说明／退回原因" value={reason} disabled={!allowed || pending || Boolean(frozen)} onChange={event => setReason(event.target.value)} /></label>
    {!allowed ? <p>当前账号没有成品图审核权限。</p> : !viewed && !frozen ? <p>请先查看成品原图，再进行审核。</p> : null}
    {committed ? <button type="button" disabled={pending || refreshing} onClick={() => void refreshSaved()}>{refreshing ? "正在读取审核结果…" : "重新读取审核结果"}</button> : frozen ? <button type="button" disabled={!allowed || pending} onClick={() => submit(frozen.reviewStatus)}>{pending ? '正在提交审核…' : '按原内容重试审核'}</button> : <><button type="button" disabled={!allowed || !viewed || pending} onClick={() => submit('已接受')}>确认成品图</button><button type="button" disabled={!allowed || !viewed || pending} onClick={() => submit('需重拍')}>退回重拍</button></>}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
