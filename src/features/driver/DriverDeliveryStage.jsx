import { StatusPill } from "../../shared/ui/operational.jsx";

export function DriverDeliveryStage({
  task,
  completeState,
  watermarkedPhotoAttached,
  deliveryCompletionConfirmation,
  deliveryCompletionTriggerRef,
  deliveryCompletionConfirmationRef,
  onSubmit,
  onReturnToEdit,
  onConfirm,
  onConfirmationKeyDown,
  actualQty,
  receiverName,
  paperNoteStatus,
  watermarkLocationLabel,
  watermarkGeoPoint,
  watermarkLocationStatus,
  watermarkedPhotoFile,
  signaturePhotoFile,
  signaturePhotoAttached,
  deliveryPhotoCameraActive,
  deliveryPhotoCameraStatus,
  deliveryPhotoCameraStatusTone,
  photoPreviewUrls,
  watermarkPreview,
  watermarkPreviewLines,
  remark,
  deliveryPhotoVideoRef,
  onUpdateInput,
  onCaptureLocation,
  onToggleDeliveryPhotoCamera,
  onCaptureDeliveryPhoto,
}) {
  return (
    <section className="detail-section mobile-role-stage driver-delivery-stage">
      <h3>送达凭证</h3>
      <div className="action-row mobile-role-stage-actions driver-stage-action-bar">
        <button
          className="primary-action"
          disabled={completeState.disabled || task.status !== "配送中" || !watermarkedPhotoAttached || Boolean(deliveryCompletionConfirmation)}
          ref={deliveryCompletionTriggerRef}
          title={completeState.title || (task.status !== "配送中" ? "配送中任务才能提交送达" : !watermarkedPhotoAttached ? "完成送货必须有水印照片" : "")}
          onClick={() => onSubmit("提交送达")}
        >
          提交送达
        </button>
      </div>
      {deliveryCompletionConfirmation ? (
        <section
          aria-describedby="driver-delivery-confirmation-summary"
          aria-labelledby="driver-delivery-confirmation-title"
          aria-live="assertive"
          className="driver-delivery-confirmation"
          onKeyDown={onConfirmationKeyDown}
          ref={deliveryCompletionConfirmationRef}
          role="region"
          tabIndex={-1}
        >
          <div className="driver-delivery-confirmation-head">
            <div>
              <strong id="driver-delivery-confirmation-title">{deliveryCompletionConfirmation.summary.title}</strong>
              <span id="driver-delivery-confirmation-summary">确认后才会上传凭证并完成送货；按 Esc 可返回修改。</span>
            </div>
            <StatusPill tone="warning">高风险写入</StatusPill>
          </div>
          <div className="driver-delivery-confirmation-grid">
            {deliveryCompletionConfirmation.summary.fields.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}
          </div>
          <ul className="driver-delivery-confirmation-effects">
            {deliveryCompletionConfirmation.summary.effects.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <div className="driver-delivery-confirmation-actions">
            <button type="button" onClick={onReturnToEdit}>返回修改</button>
            <button className="primary-action" type="button" onClick={onConfirm}>确认提交送达</button>
          </div>
        </section>
      ) : null}
      {!deliveryCompletionConfirmation ? (
        <div className="detail-form driver-proof-form">
          <label>
            <span>实际数量</span>
            <input type="number" min="0" value={actualQty} onChange={(event) => onUpdateInput("actualQty", event.target.value)} />
          </label>
          <label>
            <span>收货人</span>
            <input value={receiverName} onChange={(event) => onUpdateInput("receiverName", event.target.value)} placeholder="客户签收人" />
          </label>
          <label>
            <span>纸质联状态</span>
            <select value={paperNoteStatus} onChange={(event) => onUpdateInput("paperNoteStatus", event.target.value)}>
              <option>已交回</option>
              <option>客户留存</option>
              <option>未带回</option>
            </select>
          </label>
          <label className="driver-location-row">
            <span>定位备注</span>
            <div className="inline-control">
              <input value={watermarkLocationLabel} onChange={(event) => onUpdateInput("watermarkLocationLabel", event.target.value)} placeholder="门店、门岗、仓库区域" />
              <button type="button" onClick={onCaptureLocation}>读取定位</button>
            </div>
            <small>{watermarkGeoPoint || watermarkLocationStatus || "提交时写入地址/定位快照"}</small>
          </label>
          <label className="evidence-row">
            <span>水印照片</span>
            <input accept="image/*" capture="environment" type="file" onChange={(event) => onUpdateInput("watermarkedPhotoFile", event.target.files?.[0] ?? null)} />
            <div className="delivery-photo-camera-actions">
              <button type="button" onClick={onToggleDeliveryPhotoCamera}>{deliveryPhotoCameraActive ? "停止相机" : "打开相机"}</button>
              <button type="button" disabled={!deliveryPhotoCameraActive} onClick={onCaptureDeliveryPhoto}>拍照</button>
            </div>
            <small className={deliveryPhotoCameraStatusTone === "danger" ? "scan-error" : ""}>{deliveryPhotoCameraStatus || "可直接拍送货水印照片，也可继续上传文件。"}</small>
            <video ref={deliveryPhotoVideoRef} className={deliveryPhotoCameraActive ? "delivery-photo-camera-preview" : "delivery-photo-camera-preview hidden"} muted playsInline />
            <small>{watermarkedPhotoFile?.name || (watermarkedPhotoAttached ? "已记录水印照片" : "必须上传")}</small>
            {photoPreviewUrls.watermarked ? (
              <div className="photo-proof-preview watermarked-preview">
                <img alt="送货水印照片预览" src={photoPreviewUrls.watermarked} />
                <div className="photo-watermark-overlay">{watermarkPreviewLines.map((line) => <span key={line}>{line}</span>)}</div>
              </div>
            ) : null}
          </label>
          <label className="evidence-row">
            <span>签收照片</span>
            <input accept="image/*" capture="environment" type="file" onChange={(event) => onUpdateInput("signaturePhotoFile", event.target.files?.[0] ?? null)} />
            <small>{signaturePhotoFile?.name || (signaturePhotoAttached ? "已记录签收照片" : "可选")}</small>
            {photoPreviewUrls.signature ? <div className="photo-proof-preview"><img alt="签收照片预览" src={photoPreviewUrls.signature} /></div> : null}
          </label>
          <label>
            <span>备注</span>
            <input value={remark} onChange={(event) => onUpdateInput("remark", event.target.value)} placeholder="楼层、门岗、客户补充说明" />
          </label>
          {watermarkPreview ? (
            <div className="watermark-preview">
              <span>水印信息</span>
              <strong>{watermarkPreview.title}</strong>
              <p>{watermarkPreview.text}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
