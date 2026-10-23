import { useEffect, useRef, useState } from 'react';
import { downloadOfficeAttachmentContent } from '../../../../src/services/officeAttachmentApiClient.js';

export function ProductionPhotoEvidence(props) {
  const { photo = {}, authState } = props;
  const identity = JSON.stringify([photo.attachmentId, authState?.session?.accessToken, authState?.permissions?.actionPermissions?.includes('attachment.view')]);
  return <PhotoContent key={identity} {...props} />;
}

function PhotoContent({ photo = {}, authState, loadContent = downloadOfficeAttachmentContent, onViewed }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(null);
  const imageUrl = useRef('');
  const allowed = authState?.permissions?.actionPermissions?.includes('attachment.view') === true;
  useEffect(() => () => {
    request.current?.abort();
    if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
  }, []);
  async function open() {
    if (!allowed || !photo.attachmentId || request.current) return;
    const controller = new AbortController();
    request.current = controller; setBusy(true); setError('');
    if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
    imageUrl.current = ''; setImage(''); onViewed?.(false);
    try {
      const result = await loadContent({ authState, attachmentId: photo.attachmentId }, { serverRequired: true, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (result.source !== 'api' || result.blocked || !result.contentBlob) throw Error(result.error?.message || '原图读取失败，请重试。');
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(result.contentBlob.type)) throw Error('附件不是支持预览的图片，请核对原文件。');
      if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
      imageUrl.current = URL.createObjectURL(result.contentBlob);
      setImage(imageUrl.current);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message || '原图读取失败，请重试。');
    } finally {
      if (!controller.signal.aborted) { request.current = null; setBusy(false); }
    }
  }
  return <section aria-label="成品图证据"><h3>成品图</h3><p>{photo.status || '未上传'} · {photo.fileName || photo.attachmentId || '暂无照片'}</p>
    {photo.rejectedReason ? <p>退回原因：{photo.rejectedReason}</p> : null}
    <button type="button" disabled={!allowed || !photo.attachmentId || busy} onClick={open}>{busy ? '读取原图中…' : image ? '重新读取原图' : '查看成品原图'}</button>
    {!allowed ? <p>当前账号没有附件查看权限。</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {image ? <img src={image} onLoad={() => onViewed?.(true)} onError={() => {
      if (imageUrl.current !== image) return;
      URL.revokeObjectURL(imageUrl.current); imageUrl.current = ''; setImage(''); onViewed?.(false);
      setError('图片无法解码，请重新读取；仍失败时请车间重新上传。');
    }} alt="当前生产任务的成品原图" style={{ display: 'block', maxWidth: '100%', height: 'auto' }} /> : null}
  </section>;
}
