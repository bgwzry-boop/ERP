import { useEffect, useMemo, useRef, useState } from "react";
import {
  createBusinessDecisionEvidenceDraft,
  getBusinessDecisionEvidenceDraft,
  listOfficeBusinessDecisionAuthorizations,
  voidBusinessDecisionEvidenceAttachment,
} from "../services/officeBusinessDecisionApiClient.js";
import {
  uploadOfficeAttachmentFile,
  downloadOfficeAttachmentContent,
  inferAttachmentFileType,
} from "../services/officeAttachmentApiClient.js";
import { createOfficeIdempotencyKey } from "../services/officeApiClientCore.js";
import { formatOperationalError } from "../shared/ui/errorPresentation.js";
import { DocumentCameraCapture } from "./DocumentCameraCapture.jsx";

const channels = [
  ["in_person", "当面"],
  ["phone", "电话"],
  ["wechat", "微信"],
  ["paper", "纸面"],
];

export function DelegatedBusinessDecisionFields(props) {
  const identity = JSON.stringify([props.businessType, props.businessId, props.scope, props.operatorId, buildAuthDependencyKey(props.authState)]);
  return <DecisionEvidenceFields key={identity} {...props} />;
}

function DecisionEvidenceFields({
  scope,
  businessType,
  businessId,
  authState,
  operatorId,
  operatorName,
  value = {},
  onChange,
  onReadinessChange,
  title = "经营决定代录",
  disabled = false,
  requireEvidence = false,
}) {
  const [authorizationLoading, setAuthorizationLoading] = useState(true);
  const [draftLoading, setDraftLoading] = useState(Boolean(value.evidenceDraftId));
  const [readAttempt, setReadAttempt] = useState(0);
  const [authorizations, setAuthorizations] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [retryFile, setRetryFile] = useState(null);
  const fileInputRef = useRef(null);
  const draftKeysRef = useRef(new Map());
  const fileKeysRef = useRef(new WeakMap());
  const removalKeysRef = useRef(new Map());
  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const readEpochRef = useRef(0);
  const attachmentsRef = useRef([]);
  const latestRef = useRef({value, onChange, disabled, onReadinessChange});
  latestRef.current = {value, onChange, disabled, onReadinessChange};
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; latestRef.current.onReadinessChange?.(false); }; }, []);
  function live() { return mountedRef.current && !latestRef.current.disabled; }
  function saveAttachments(items) { attachmentsRef.current = items; setAttachments(items); }
  function beginEvidence() {
    if (!live() || busyRef.current) return false;
    latestRef.current.onReadinessChange?.(false);
    busyRef.current = true; readEpochRef.current += 1; setEvidenceBusy(true); setEvidenceError(""); return true;
  }
  function endEvidence() {
    readEpochRef.current += 1; busyRef.current = false;
    if (mountedRef.current) setEvidenceBusy(false);
  }
  function validateDraft(draft, expectedId) {
    if (!draft?.draftId || (expectedId && draft.draftId !== expectedId) || draft.businessType !== businessType || draft.businessId !== businessId || draft.decisionScope !== scope || draft.status !== 'pending') {
      throw new Error('凭据草稿与当前业务不一致，或已提交/作废，请重新核对。');
    }
    return draft.draftId;
  }
  const localDecidedAt = useMemo(() => toLocalDateTime(value.decidedAt), [value.decidedAt]);
  const authDependencyKey = buildAuthDependencyKey(authState);
  const targetKey = `${businessType ?? ""}:${businessId ?? ""}:${scope ?? ""}`;

  useEffect(() => {
    let active = true;
    latestRef.current.onReadinessChange?.(false);
    setAuthorizationLoading(true); setLoadError("");
    listOfficeBusinessDecisionAuthorizations({ authState, operatorId, scope }).then((result) => {
      if (!active) return;
      setAuthorizations(result.items ?? []);
      setLoadError(result.blocked ? formatOperationalError(result.error, "授权读取失败，请刷新重试。") : "");
    }).catch(error => { if (active) { setAuthorizations([]); setLoadError(formatOperationalError(error, "授权读取失败，请刷新重试。")); } }).finally(() => { if (active) setAuthorizationLoading(false); });
    return () => { active = false; };
  }, [authDependencyKey, operatorId, scope, readAttempt]);

  useEffect(() => {
    let active = true;
    const epoch = readEpochRef.current;
    latestRef.current.onReadinessChange?.(false);
    setDraftLoading(Boolean(value.evidenceDraftId));
    if (!value.evidenceDraftId) {
      saveAttachments([]);
      return undefined;
    }
    saveAttachments([]);
    setEvidenceError("");
    getBusinessDecisionEvidenceDraft({ authState, operatorId, draftId: value.evidenceDraftId }, {serverRequired:true}).then((result) => {
      if (!active || !live() || epoch !== readEpochRef.current) return;
      if (result.blocked) {
        setEvidenceError(formatOperationalError(result.error, "凭据读取失败，请刷新重试。"));
        return;
      }
      try { validateDraft(result.draft, value.evidenceDraftId); }
      catch(error) { setEvidenceError(formatOperationalError(error)); update({evidenceAttachmentIds: []}); return; }
      const items = (result.attachments ?? []).filter((item) => item.status === "uploaded");
      saveAttachments(items);
      if (!sameIds(value.evidenceAttachmentIds, items.map((item) => item.attachmentId))) {
        update({ evidenceAttachmentIds: items.map((item) => item.attachmentId) });
      }
    }).catch(error => { if (active && live() && epoch === readEpochRef.current) setEvidenceError(formatOperationalError(error, "凭据读取失败，请刷新重试。")); }).finally(() => { if (active) setDraftLoading(false); });
    return () => { active = false; };
  }, [authDependencyKey, operatorId, value.evidenceDraftId, disabled, readAttempt]);

  const evidenceReady = !authorizationLoading && !draftLoading && !evidenceBusy && !loadError && !evidenceError && !retryFile
    && authorizations.some(item => item.employeeId === value.decisionMakerEmployeeId)
    && sameIds(value.evidenceAttachmentIds, attachments.map(item => item.attachmentId))
    && attachments.every(item => item.hasContent === true)
    && (!requireEvidence || attachments.length > 0);
  useEffect(() => { onReadinessChange?.(evidenceReady); }, [evidenceReady, onReadinessChange]);

  function reloadEvidence(discardRetry = false) {
    latestRef.current.onReadinessChange?.(false);
    setAuthorizationLoading(true);
    setDraftLoading(Boolean(value.evidenceDraftId));
    if (discardRetry) { setRetryFile(null); setEvidenceError(""); }
    setReadAttempt(attempt => attempt + 1);
  }

  function update(patch) {
    if (live()) latestRef.current.onChange?.({ ...latestRef.current.value, ...patch });
  }

  async function ensureDraft() {
    if (latestRef.current.value.evidenceDraftId) {
      const draftId = latestRef.current.value.evidenceDraftId;
      const result = await getBusinessDecisionEvidenceDraft({authState, operatorId, draftId}, {serverRequired:true});
      if (!live()) return null;
      if (result.blocked) throw new Error(result.error?.message || '凭据草稿读取失败');
      validateDraft(result.draft, draftId);
      saveAttachments((result.attachments ?? []).filter(item => item.status === 'uploaded'));
      return draftId;
    }
    if (!businessType || !businessId) throw new Error("当前业务对象尚未准备好，不能上传决定凭据。");
    let idempotencyKey = draftKeysRef.current.get(targetKey);
    if (!idempotencyKey) {
      idempotencyKey = createOfficeIdempotencyKey();
      draftKeysRef.current.set(targetKey, idempotencyKey);
    }
    const result = await createBusinessDecisionEvidenceDraft({
      authState,
      operatorId,
      idempotencyKey,
      businessType,
      businessId,
      decisionScope: scope,
    });
    if (!live()) return null;
    if (result.blocked) throw new Error(result.error?.message ?? "创建凭据草稿失败");
    const draftId = result.draft?.draftId;
    validateDraft(result.draft);
    update({ evidenceDraftId: draftId, evidenceAttachmentIds: [] });
    return draftId;
  }

  async function uploadFile(file) {
    if (!file || !beginEvidence()) return;
    setRetryFile(null);
    try {
      const draftId = await ensureDraft();
      if (!live() || !draftId) return;
      if (attachmentsRef.current.length >= 5) throw new Error('每个决定最多上传5个凭据文件。');
      let idempotencyKey = fileKeysRef.current.get(file);
      if (!idempotencyKey) { idempotencyKey = createOfficeIdempotencyKey(); fileKeysRef.current.set(file, idempotencyKey); }
      const result = await uploadOfficeAttachmentFile({
        authState,
        ownerType: "business_decision_evidence_draft",
        ownerId: draftId,
        fileType: inferAttachmentFileType({ mimeType: file.type, fileName: file.name }),
        purpose: "business_decision_evidence",
        fileName: file.name || "经营决定凭据.jpg",
        contentRef: `decision-evidence://${draftId}/${encodeURIComponent(file.name || "capture.jpg")}`,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        file,
        metadata: { businessType, businessId, decisionScope: scope },
        uploadedBy: operatorId,
      }, {serverRequired:true, idempotencyKey});
      if (!live() || latestRef.current.value.evidenceDraftId !== draftId) return;
      if (result.blocked || result.source !== "api") throw new Error(result.error?.message ?? "凭据上传失败");
      if (!result.attachment?.attachmentId || result.attachment.status !== 'uploaded' || result.attachment.hasContent !== true || result.attachment.ownerType !== 'business_decision_evidence_draft' || result.attachment.ownerId !== draftId || result.attachment.purpose !== 'business_decision_evidence') throw new Error('服务端未返回完整且归属正确的凭据，请重试原文件。');
      const next = [...attachmentsRef.current, result.attachment].filter(uniqueAttachment);
      saveAttachments(next);
      fileKeysRef.current.delete(file);
      update({ evidenceDraftId: draftId, evidenceAttachmentIds: next.map((item) => item.attachmentId) });
    } catch (error) {
      if (!live()) return;
      setEvidenceError(formatOperationalError(error, "凭据上传失败，请重试。"));
      setRetryFile(file);
    } finally {
      endEvidence();
    }
  }

  async function removeAttachment(attachment) {
    const draftId = latestRef.current.value.evidenceDraftId;
    if (!draftId || !beginEvidence()) return;
    try {
      let key = removalKeysRef.current.get(attachment.attachmentId);
      if (!key) { key = createOfficeIdempotencyKey(); removalKeysRef.current.set(attachment.attachmentId, key); }
      const result = await voidBusinessDecisionEvidenceAttachment({
        authState, operatorId, draftId,
        attachmentId: attachment.attachmentId, idempotencyKey: key,
        reason: "录入人删除未使用的决定凭据",
      }, {serverRequired:true});
      if (!live() || latestRef.current.value.evidenceDraftId !== draftId) return;
      if (result.blocked || result.source !== "api") throw new Error(result.error?.message || '删除凭据失败');
      if (result.attachment?.attachmentId !== attachment.attachmentId || result.attachment.status !== 'voided') throw new Error('服务端未确认凭据删除，请重试原操作。');
      const next = attachmentsRef.current.filter(item => item.attachmentId !== attachment.attachmentId);
      saveAttachments(next); update({evidenceAttachmentIds: next.map(item => item.attachmentId)});
    } catch(error) {
      if (live()) setEvidenceError(formatOperationalError(error, '删除凭据失败，请重试。'));
    } finally { endEvidence(); }
  }

  async function previewAttachment(attachment) {
    if (!beginEvidence()) return;
    try {
      const result = await downloadOfficeAttachmentContent({ authState, operatorId, attachmentId: attachment.attachmentId }, {serverRequired:true});
      if (!live()) return;
      if (result.blocked || !result.contentBlob) throw new Error(result.error?.message || '凭据原文件暂不可用');
      const objectUrl = URL.createObjectURL(result.contentBlob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch(error) {
      if (live()) setEvidenceError(formatOperationalError(error, '凭据预览失败，请重试。'));
    } finally { endEvidence(); }
  }

  const noAuthorization = !loadError && authorizations.length === 0;
  return (
    <section className="business-decision-fields" aria-label={title}>
      <div className="business-decision-fields__heading">
        <div><strong>{title}</strong><span>决定人与系统操作人分别留痕</span></div>
        <span className="business-decision-fields__operator">系统操作人：{operatorName || operatorId || "当前账号"}</span>
      </div>
      <div className="business-decision-fields__grid">
        <label>
          <span>业务决定人</span>
          <select disabled={disabled || Boolean(loadError) || noAuthorization} value={value.decisionMakerEmployeeId ?? ""} onChange={(event) => update({ decisionMakerEmployeeId: event.target.value })}>
            <option value="">请选择有效授权员工</option>
            {authorizations.map((item) => <option key={item.authorizationId} value={item.employeeId}>{item.employeeName || item.employeeId}{item.employeeNo ? `（${item.employeeNo}）` : ""}</option>)}
          </select>
        </label>
        <label><span>决定渠道</span><select disabled={disabled} value={value.decisionChannel ?? ""} onChange={(event) => update({ decisionChannel: event.target.value })}><option value="">请选择</option>{channels.map(([channel, label]) => <option key={channel} value={channel}>{label}</option>)}</select></label>
        <label><span>决定时间</span><input disabled={disabled} type="datetime-local" value={localDecidedAt} onChange={(event) => update({ decidedAt: toIsoDateTime(event.target.value) })} /></label>
        <label><span>授权依据</span><input disabled={disabled} value={value.authorizationBasis ?? ""} onChange={(event) => update({ authorizationBasis: event.target.value })} placeholder="如：微信群内确认" /></label>
        <label className="business-decision-fields__wide"><span>决定内容</span><textarea disabled={disabled} rows={2} value={value.decisionContent?.summary ?? ""} onChange={(event) => update({ decisionContent: { ...(value.decisionContent ?? {}), summary: event.target.value } })} placeholder="写清本次决定及适用范围" /></label>
        <div className="business-decision-fields__wide business-decision-evidence">
          <div className="business-decision-evidence__toolbar">
            <span>凭据附件{requireEvidence ? " *" : ""}</span>
            <button type="button" className="button-like" disabled={disabled || evidenceBusy || attachments.length >= 5} onClick={() => fileInputRef.current?.click()}>选择文件</button>
            <input ref={fileInputRef} hidden disabled={disabled || evidenceBusy || attachments.length >= 5} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(event) => { void uploadFile(event.target.files?.[0]); event.target.value = ""; }} />
            <DocumentCameraCapture className="button-like" disabled={disabled || evidenceBusy || attachments.length >= 5} fileNamePrefix="decision-evidence" label="用高拍仪/摄像头拍照" onCapture={(file) => { void uploadFile(file); }} />
          </div>
          <div className="business-decision-evidence__list">
            {attachments.map((attachment) => (
              <div key={attachment.attachmentId}><span><strong>{attachment.fileName}</strong><small>{attachment.uploadedBy || operatorName || "当前账号"} · {formatDateTime(attachment.uploadedAt)}</small></span><button type="button" disabled={disabled || evidenceBusy} onClick={() => previewAttachment(attachment)}>预览</button><button type="button" className="danger-text" disabled={disabled || evidenceBusy} onClick={() => removeAttachment(attachment)}>删除</button></div>
            ))}
            {!attachments.length && requireEvidence ? <p>提交前上传至少一个凭据文件。</p> : null}
          </div>
          {evidenceBusy ? <p>正在处理凭据…</p> : null}
          {retryFile ? <button type="button" disabled={disabled || evidenceBusy} onClick={() => uploadFile(retryFile)}>重试上传 {retryFile.name}</button> : null}
          {retryFile ? <button type="button" disabled={disabled || evidenceBusy} onClick={() => reloadEvidence(true)}>取消文件重试并核对已保存凭据</button> : null}
          {evidenceError ? <p className="business-decision-fields__error">{evidenceError}</p> : null}
        </div>
      </div>
      {loadError || evidenceError ? <button type="button" disabled={evidenceBusy || disabled} onClick={() => reloadEvidence()}>重新读取授权与凭据</button> : null}
      {loadError ? <p className="business-decision-fields__error">{loadError}</p> : null}
      {noAuthorization ? <p className="business-decision-fields__error">没有可用授权，请先在“员工机台 → 业务决定授权”中授权。</p> : null}
    </section>
  );
}

export function isDelegatedBusinessDecisionComplete(value = {}, { requireEvidence = false } = {}) {
  return Boolean(
    value.decisionMakerEmployeeId && value.decisionChannel && value.decidedAt && value.decisionContent?.summary?.trim() && value.authorizationBasis?.trim() &&
    (!requireEvidence || (value.evidenceDraftId && value.evidenceAttachmentIds?.length > 0)),
  );
}

function uniqueAttachment(item, index, items) { return items.findIndex((candidate) => candidate.attachmentId === item.attachmentId) === index; }
function sameIds(left = [], right = []) { return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort()); }
function buildAuthDependencyKey(authState) { return JSON.stringify([authState?.source, authState?.session?.accessToken, authState?.permissions?.user?.userId, [...(authState?.permissions?.actionPermissions ?? [])].sort()]); }
function toLocalDateTime(value) { if (!value) return ""; const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return offsetDate.toISOString().slice(0, 16); }
function toIsoDateTime(value) { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toISOString(); }
function formatDateTime(value) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-CN", { hour12: false }); }
