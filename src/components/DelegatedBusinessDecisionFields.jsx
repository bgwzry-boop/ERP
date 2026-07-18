import { useEffect, useMemo, useRef, useState } from "react";
import {
  createBusinessDecisionEvidenceDraft,
  getBusinessDecisionEvidenceDraft,
  listOfficeBusinessDecisionAuthorizations,
  voidBusinessDecisionEvidenceAttachment,
} from "../services/officeBusinessDecisionApiClient.js";
import {
  createOfficeAttachment,
  downloadOfficeAttachmentContent,
  inferAttachmentFileType,
} from "../services/officeAttachmentApiClient.js";
import { createOfficeIdempotencyKey } from "../services/officeApiClientCore.js";
import { readAttachmentFileAsDataUrl } from "../features/attachments/readAttachmentFile.js";
import { formatOperationalError } from "../shared/ui/errorPresentation.js";

const channels = [
  ["in_person", "当面"],
  ["phone", "电话"],
  ["wechat", "微信"],
  ["paper", "纸面"],
];

export function DelegatedBusinessDecisionFields({
  scope,
  businessType,
  businessId,
  authState,
  operatorId,
  operatorName,
  value = {},
  onChange,
  title = "经营决定代录",
  disabled = false,
  requireEvidence = false,
}) {
  const [authorizations, setAuthorizations] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [retryFile, setRetryFile] = useState(null);
  const draftKeysRef = useRef(new Map());
  const localDecidedAt = useMemo(() => toLocalDateTime(value.decidedAt), [value.decidedAt]);
  const authDependencyKey = buildAuthDependencyKey(authState);
  const targetKey = `${businessType ?? ""}:${businessId ?? ""}:${scope ?? ""}`;

  useEffect(() => {
    let active = true;
    listOfficeBusinessDecisionAuthorizations({ authState, operatorId, scope }).then((result) => {
      if (!active) return;
      setAuthorizations(result.items ?? []);
      setLoadError(result.blocked ? formatOperationalError(result.error, "授权读取失败，请刷新重试。") : "");
    });
    return () => { active = false; };
  }, [authDependencyKey, operatorId, scope]);

  useEffect(() => {
    let active = true;
    if (!value.evidenceDraftId) {
      setAttachments([]);
      return undefined;
    }
    getBusinessDecisionEvidenceDraft({ authState, operatorId, draftId: value.evidenceDraftId }).then((result) => {
      if (!active) return;
      if (result.blocked) {
        setEvidenceError(formatOperationalError(result.error, "凭据读取失败，请刷新重试。"));
        return;
      }
      const items = (result.attachments ?? []).filter((item) => item.status === "uploaded");
      setAttachments(items);
      if (!sameIds(value.evidenceAttachmentIds, items.map((item) => item.attachmentId))) {
        update({ evidenceAttachmentIds: items.map((item) => item.attachmentId) });
      }
    });
    return () => { active = false; };
  }, [authDependencyKey, operatorId, value.evidenceDraftId]);

  function update(patch) {
    onChange?.({ ...value, ...patch });
  }

  async function ensureDraft() {
    if (value.evidenceDraftId) return value.evidenceDraftId;
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
    if (result.blocked) throw new Error(result.error?.message ?? "创建凭据草稿失败");
    const draftId = result.draft?.draftId;
    if (!draftId) throw new Error("服务端未返回凭据草稿编号。");
    update({ evidenceDraftId: draftId, evidenceAttachmentIds: [] });
    return draftId;
  }

  async function uploadFile(file) {
    if (!file || disabled || evidenceBusy) return;
    setEvidenceBusy(true);
    setEvidenceError("");
    setRetryFile(null);
    try {
      const draftId = await ensureDraft();
      const contentDataUrl = await readAttachmentFileAsDataUrl(file);
      const result = await createOfficeAttachment({
        authState,
        ownerType: "business_decision_evidence_draft",
        ownerId: draftId,
        fileType: inferAttachmentFileType({ mimeType: file.type, fileName: file.name }),
        purpose: "business_decision_evidence",
        fileName: file.name || `经营决定凭据-${Date.now()}.jpg`,
        contentRef: `decision-evidence://${draftId}/${encodeURIComponent(file.name || "capture.jpg")}`,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        contentDataUrl,
        metadata: { businessType, businessId, decisionScope: scope },
        uploadedBy: operatorId,
      });
      if (result.blocked) throw new Error(result.error?.message ?? "凭据上传失败");
      const next = [...attachments, result.attachment].filter(uniqueAttachment);
      setAttachments(next);
      update({ evidenceDraftId: draftId, evidenceAttachmentIds: next.map((item) => item.attachmentId) });
    } catch (error) {
      setEvidenceError(formatOperationalError(error, "凭据上传失败，请重试。"));
      setRetryFile(file);
    } finally {
      setEvidenceBusy(false);
    }
  }

  async function removeAttachment(attachment) {
    if (!value.evidenceDraftId || disabled || evidenceBusy) return;
    setEvidenceBusy(true);
    setEvidenceError("");
    const result = await voidBusinessDecisionEvidenceAttachment({
      authState,
      operatorId,
      draftId: value.evidenceDraftId,
      attachmentId: attachment.attachmentId,
      idempotencyKey: createOfficeIdempotencyKey(),
      reason: "录入人删除未使用的决定凭据",
    });
    setEvidenceBusy(false);
    if (result.blocked) {
      setEvidenceError(formatOperationalError(result.error, "删除凭据失败，请重试。"));
      return;
    }
    const next = attachments.filter((item) => item.attachmentId !== attachment.attachmentId);
    setAttachments(next);
    update({ evidenceAttachmentIds: next.map((item) => item.attachmentId) });
  }

  async function previewAttachment(attachment) {
    setEvidenceError("");
    const result = await downloadOfficeAttachmentContent({ authState, operatorId, attachmentId: attachment.attachmentId });
    if (result.blocked || (!result.contentBlob && !result.content)) {
      setEvidenceError(formatOperationalError(result.error, "凭据预览失败，请重试。"));
      return;
    }
    if (result.contentBlob && typeof URL?.createObjectURL === "function") {
      const objectUrl = URL.createObjectURL(result.contentBlob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }
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
            <label className="button-like"><input hidden disabled={disabled || evidenceBusy || attachments.length >= 5} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(event) => { void uploadFile(event.target.files?.[0]); event.target.value = ""; }} />选择文件</label>
            <label className="button-like"><input hidden disabled={disabled || evidenceBusy || attachments.length >= 5} type="file" accept="image/*" capture="environment" onChange={(event) => { void uploadFile(event.target.files?.[0]); event.target.value = ""; }} />拍照上传</label>
          </div>
          <div className="business-decision-evidence__list">
            {attachments.map((attachment) => (
              <div key={attachment.attachmentId}><span><strong>{attachment.fileName}</strong><small>{attachment.uploadedBy || operatorName || "当前账号"} · {formatDateTime(attachment.uploadedAt)}</small></span><button type="button" disabled={evidenceBusy} onClick={() => previewAttachment(attachment)}>预览</button><button type="button" className="danger-text" disabled={disabled || evidenceBusy} onClick={() => removeAttachment(attachment)}>删除</button></div>
            ))}
            {!attachments.length && requireEvidence ? <p>提交前上传至少一个凭据文件。</p> : null}
          </div>
          {evidenceBusy ? <p>正在处理凭据…</p> : null}
          {retryFile ? <button type="button" disabled={evidenceBusy} onClick={() => uploadFile(retryFile)}>重试上传 {retryFile.name}</button> : null}
          {evidenceError ? <p className="business-decision-fields__error">{evidenceError}</p> : null}
        </div>
      </div>
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
function buildAuthDependencyKey(authState) { return [authState?.source, authState?.session?.accessToken, authState?.permissions?.user?.userId].map((item) => String(item ?? "")).join(":"); }
function toLocalDateTime(value) { if (!value) return ""; const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return offsetDate.toISOString().slice(0, 16); }
function toIsoDateTime(value) { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toISOString(); }
function formatDateTime(value) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-CN", { hour12: false }); }
