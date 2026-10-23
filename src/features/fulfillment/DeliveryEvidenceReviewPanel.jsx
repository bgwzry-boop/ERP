import { useEffect, useRef, useState } from "react";
import { useFulfillmentDetail } from "./useFulfillmentDetail.js";
import { reviewOfficeDeliveryEvidence } from "../../services/officeFulfillmentApiClient.js";
import { downloadOfficeAttachmentContent } from "../../services/officeAttachmentApiClient.js";
import "./delivery-evidence-review.css";

export function DeliveryEvidenceReviewPanel(props) {
  const [drafts, setDrafts] = useState({});
  const key = `${props.fulfillmentId}:${props.authState?.session?.accessToken || ""}`;
  return <ReviewForm key={key} {...props} reason={drafts[key] || ""} setReason={value => setDrafts(current => ({ ...current, [key]: value }))} />;
}
function ReviewForm({ authState, fulfillmentId, onReviewed, reason, setReason }) {
  const detail = useFulfillmentDetail({ authState, fulfillmentId });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState(null);
  const busy = useRef(false);
  const alive = useRef(true);
  const objectUrl = useRef("");
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }; }, []);
  const permissions = [...(authState?.permissions?.actionPermissions || []), ...(authState?.permissions?.buttonPermissions || [])];
  const allowed = permissions.includes("delivery.evidence.review");
  const record = detail.fulfillment;
  const currentRecord = useRef(record);
  currentRecord.current = record;
  const previewMatchesRecord = preview && [record?.watermarkedPhotoAttachmentId, record?.signaturePhotoAttachmentId].includes(preview.attachmentId);
  useEffect(() => {
    if (preview && !previewMatchesRecord) {
      URL.revokeObjectURL(preview.url);
      if (objectUrl.current === preview.url) objectUrl.current = "";
      setPreview(null);
    }
  }, [preview, previewMatchesRecord]);
  async function view(attachmentId, title) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await downloadOfficeAttachmentContent({ authState, attachmentId }, { serverRequired: true });
      if (!alive.current) return;
      if (result.source !== "api" || result.blocked || !result.contentBlob || !/^image\/(jpeg|png|webp)$/i.test(result.contentType.split(";")[0])) throw new Error(result.error?.message || "未能读取有效照片，请重试。");
      if (![currentRecord.current?.watermarkedPhotoAttachmentId, currentRecord.current?.signaturePhotoAttachmentId].includes(attachmentId)) throw new Error("照片已更新，请重新查看当前证据。");
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(result.contentBlob);
      setPreview({ url: objectUrl.current, title, attachmentId });
    } catch (failure) { if (alive.current) setError(failure.message || "照片读取失败，请重试。"); }
    finally { busy.current = false; if (alive.current) setPending(false); }
  }
  async function review(reviewStatus) {
    if (busy.current || !allowed || !record?.watermarkedPhotoAttachmentId || (reviewStatus === "需重拍" && !reason.trim())) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await reviewOfficeDeliveryEvidence({ authState, fulfillment: record, reviewStatus, reason: reason.trim() }, { serverRequired: true });
      if (!alive.current) return;
      if (result.source !== "api" || result.blocked) throw new Error(result.error?.message || "复核保存失败，请重试。");
      detail.refresh();
      onReviewed?.(`送达证据：${result.reviewStatus}`);
    } catch (failure) { if (alive.current) setError(failure.message || "复核保存失败，请重试。"); }
    finally { busy.current = false; if (alive.current) setPending(false); }
  }
  return <section className="delivery-review-panel" aria-label="送达证据复核">
    <h3>送达证据复核</h3>
    {detail.loading ? <p role="status">正在读取送达证据…</p> : null}
    {detail.error ? <p role="alert">{detail.error}</p> : null}
    {record ? <>
      <p>复核状态：{record.deliveryEvidenceReviewStatus || "未复核"}</p>
      <div className="delivery-review-actions">{[[record.watermarkedPhotoAttachmentId, "水印照片"], [record.signaturePhotoAttachmentId, "签收照片"]].map(([id, title]) => <button type="button" key={title} disabled={!id || pending} onClick={() => view(id, title)}>{id ? `查看${title}` : `${title}未提交`}</button>)}</div>
      {previewMatchesRecord ? <figure><img src={preview.url} alt={preview.title} /><figcaption>{preview.title}</figcaption></figure> : null}
      <p>定位：{record.watermarkLocationLabel || "未记录"}；提交时间：{record.completedAt || "未记录"}</p>
      {record.deliveryEvidenceIssueReason ? <p>重拍要求：{record.deliveryEvidenceIssueReason}</p> : null}
      {!allowed ? <p>当前账号没有送达证据复核权限。</p> : null}
      {!record.watermarkedPhotoAttachmentId ? <p>司机提交水印照片后才能复核。</p> : null}
      <label>退回重拍原因<textarea rows={3} maxLength={500} value={reason} disabled={pending} onChange={event => setReason(event.target.value)} placeholder="说明照片哪里不清楚、需要补拍什么" /></label>
      <div className="delivery-review-actions">
        <button type="button" disabled={pending || !allowed || !record.watermarkedPhotoAttachmentId || record.deliveryEvidenceReviewStatus === "已复核"} onClick={() => review("已复核")}>证据复核通过</button>
        <button type="button" disabled={pending || !allowed || !record.watermarkedPhotoAttachmentId || !reason.trim()} onClick={() => review("需重拍")}>退回重拍</button>
      </div>
    </> : null}
    {pending ? <p role="status">正在处理，请稍候…</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <button type="button" disabled={pending} onClick={detail.refresh}>重新读取证据</button>
  </section>;
}
