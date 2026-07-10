import { DataTable, DetailPane, InfoGrid, MetricStrip, Segmented, StatusPill, Timeline } from "../../components/ui.jsx";
import { formatAttachmentSize } from "../attachments/attachmentPresentation.js";

export function FulfillmentPage({ tab, setTab, fulfillments, orderLines, selectedId, setSelectedId, onAction, helpers }) {
  const {
    findCustomer,
    findOrderLine,
    getDeliveryEvidenceReviewStatus,
    getDeliveryEvidenceReviewTone,
    getFulfillmentActions,
    getFulfillmentDocumentLabel,
    getFulfillmentGoodsDisplay,
    getFulfillmentNextStep,
    getUiActionState,
    getLineColorSpecLabel,
    getLinePrintSide,
    getLineRemark,
    isCustomProductLine,
    statusTone,
  } = helpers;
  const filtered = fulfillments.filter((item) => tab === "全部" || item.method === tab);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? fulfillments[0];
  const selectedLine = findOrderLine(orderLines, selected.lineId);
  const customerInfo = findCustomer(selected.customerId);
  const actions = getFulfillmentActions(selected);
  const selectedGoods = getFulfillmentGoodsDisplay(selected, selectedLine);
  const selectedLineRemark = getLineRemark(selectedLine);
  const deliveryEvidenceFiles = Array.isArray(selected.deliveryEvidenceAttachmentFiles) ? selected.deliveryEvidenceAttachmentFiles : [];
  const watermarkedEvidenceFile = findDeliveryEvidenceFile(deliveryEvidenceFiles, selected.watermarkedPhotoAttachmentId, "delivery_watermark_photo");
  const signatureEvidenceFile = findDeliveryEvidenceFile(deliveryEvidenceFiles, selected.signaturePhotoAttachmentId, "signature_photo");
  const evidenceReviewStatus = getDeliveryEvidenceReviewStatus(selected);
  const evidenceReviewState = getUiActionState("fulfillment", "证据复核通过");
  const evidenceRejectState = getUiActionState("fulfillment", "退回重拍");
  const watermarkedViewState = getUiActionState("fulfillment", "查看水印照片");
  const signatureViewState = getUiActionState("fulfillment", "查看签收照片");
  const selectedPrintStatus =
    selected.printRecordStatus === "voided"
      ? `已作废，待重打 ${selected.printBatch ?? ""}`.trim()
      : selected.printed
        ? `已打印 ${selected.printBatch ?? ""}`.trim()
        : "未打印/预览";
  const goodsRows = isCustomProductLine(selectedLine)
    ? [
        ["品名", selectedLine.product],
        ["尺寸", selectedLine.size],
        ["袋色/印色/提手色", `${selectedLine.color} / ${selectedLine.printColor || "印色待确认"} / ${selectedLine.handleColor || "同袋色/未特殊"}`],
        ["颜色简写", getLineColorSpecLabel(selectedLine)],
        ["单双面", getLinePrintSide(selectedLine)],
        ["备注", selectedLineRemark || "无"],
      ]
    : [["货品/规格", selectedGoods]];
  const stats = [
    ["未完成", fulfillments.filter((item) => item.status !== "已交付").length, "warning"],
    ["今天/急", fulfillments.filter((item) => item.latest.includes("今天")).length, "blue"],
    ["异常", fulfillments.filter((item) => item.status.includes("数量") || item.status.includes("无法")).length, "danger"],
    ["待拉走", fulfillments.filter((item) => item.status === "待确认拉走").length, "success"],
  ];
  return (
    <section className="page-grid split-detail">
      <div className="table-pane">
        <div className="toolbar-line">
          <Segmented value={tab} onChange={setTab} items={["全部", "自提", "送货", "快递快运"]} />
          <span>今日要交付、未完成、异常优先</span>
        </div>
        <MetricStrip items={stats} />
        <DataTable
          className="fulfillment-table"
          columns={["交付方式", "客户", "订单尾号", "货品/规格", "数量", "包裹", "最晚", "状态", "备注"]}
          rows={filtered.map((row) => ({
            id: row.id,
            active: row.id === selected.id,
            tone: statusTone(row.status),
            onClick: () => setSelectedId(row.id),
            cells: [row.method, findCustomer(row.customerId).name, row.lineId.slice(-5), getFulfillmentGoodsDisplay(row, findOrderLine(orderLines, row.lineId)), row.qty, row.packages, row.latest, row.status, formatFulfillmentTableRemark(row)],
          }))}
        />
      </div>
      <DetailPane title={`${selected.method} · ${selected.status}`} subtitle={`${customerInfo.name} · ${selected.lineId}`}>
        <InfoGrid
          rows={[
            ["联系人", `${customerInfo.contact} ${customerInfo.phone}`],
            ["地址", customerInfo.address],
            ...goodsRows,
            ["数量/包裹", `${selected.qty} 个 / ${selected.packages}`],
            ...(selected.method === "送货"
              ? [
                  ["派单路线", formatFulfillmentDispatchSummary(selected)],
                  ["计划发车", selected.plannedDepartureAt || "未排"],
                ]
              : []),
            ["库存来源", `${selected.zone} / ${selected.source}`],
            ["单据状态", selectedPrintStatus],
            ["下一步", getFulfillmentNextStep(selected)],
            ["实际数量", selected.actualQty == null ? "未填" : `${selected.actualQty} 个`],
          ]}
        />
        <section className="detail-section document-preview">
          <h3>{getFulfillmentDocumentLabel(selected)}预览</h3>
          <p>{customerInfo.name} / {selectedGoods} / {selected.packages}</p>
        </section>
        {selected.method === "送货" && (
          <section className={`detail-section delivery-evidence-review ${evidenceReviewStatus === "需重拍" ? "alert" : ""}`}>
            <div className="section-head-row">
              <h3>送达证据复核</h3>
              <StatusPill tone={getDeliveryEvidenceReviewTone(evidenceReviewStatus)}>{evidenceReviewStatus}</StatusPill>
            </div>
            <div className="delivery-evidence-cards">
              <DeliveryEvidenceCard
                title="水印照片"
                required
                attachmentId={selected.watermarkedPhotoAttachmentId}
                file={watermarkedEvidenceFile}
                emptyText="未提交水印照片"
                actionState={watermarkedViewState}
                onView={() => onAction("查看水印照片", selected.id, { attachmentId: selected.watermarkedPhotoAttachmentId })}
              />
              <DeliveryEvidenceCard
                title="签收照片"
                attachmentId={selected.signaturePhotoAttachmentId}
                file={signatureEvidenceFile}
                emptyText="未提交，可选"
                actionState={signatureViewState}
                onView={() => onAction("查看签收照片", selected.id, { attachmentId: selected.signaturePhotoAttachmentId })}
              />
            </div>
            <InfoGrid
              rows={[
                ["水印编号", selected.watermarkId || watermarkedEvidenceFile?.metadata?.watermarkId || "待生成"],
                ["拍摄/提交时间", selected.watermarkCapturedAt || watermarkedEvidenceFile?.metadata?.watermarkCapturedAt || selected.completedAt || "未记录"],
                ["定位", [selected.watermarkLocationLabel || watermarkedEvidenceFile?.metadata?.watermarkLocationLabel, selected.watermarkGeoPoint || watermarkedEvidenceFile?.metadata?.watermarkGeoPoint].filter(Boolean).join(" / ") || "未记录"],
                ["复核记录", selected.deliveryEvidenceReviewedAt ? `${selected.deliveryEvidenceReviewedBy || "未知账号"} / ${selected.deliveryEvidenceReviewedAt}` : selected.deliveryEvidenceIssueReason || "未复核"],
              ]}
            />
            <div className="action-row">
              <button
                className="primary-action"
                disabled={evidenceReviewState.disabled || !selected.watermarkedPhotoAttachmentId || evidenceReviewStatus === "已复核"}
                title={evidenceReviewState.title || (!selected.watermarkedPhotoAttachmentId ? "缺少水印照片，不能复核通过" : evidenceReviewStatus === "已复核" ? "送达证据已复核" : "")}
                onClick={() => onAction("证据复核通过", selected.id)}
              >
                证据复核通过
              </button>
              <button
                disabled={evidenceRejectState.disabled || !selected.watermarkedPhotoAttachmentId}
                title={evidenceRejectState.title || (!selected.watermarkedPhotoAttachmentId ? "缺少水印照片，不能退回重拍" : "")}
                onClick={() => onAction("退回重拍", selected.id)}
              >
                退回重拍
              </button>
            </div>
          </section>
        )}
        <section className="detail-section">
          <h3>场景规则</h3>
          <p>{getFulfillmentNextStep(selected)}</p>
        </section>
        {(selected.exceptionReason || selected.status.includes("数量") || selected.status.includes("无法")) && (
          <section className="detail-section alert">
            <h3>异常处理</h3>
            <p>{selected.exceptionReason ? `${selected.exceptionReason}；` : ""}需办公室确认客户沟通、改单、补货或重打单据。</p>
          </section>
        )}
        <div className="action-row">
          {actions.map((item) => {
            const actionState = getUiActionState("fulfillment", item.label);
            return <button className={item.variant === "primary" ? "primary-action" : ""} disabled={actionState.disabled} key={item.label} title={actionState.title} onClick={() => onAction(item.label, selected.id)}>{item.label}</button>;
          })}
        </div>
        <Timeline
          items={[
            "办公室创建交付任务",
            selected.printed ? `${getFulfillmentDocumentLabel(selected)}已打印` : `${getFulfillmentDocumentLabel(selected)}待打印/预览`,
            selected.status,
            selected.status === "已交付" ? "进入对账/收款" : "等待下一步操作",
          ]}
        />
      </DetailPane>
    </section>
  );
}

function formatFulfillmentDispatchSummary(item) {
  const routeDate = item.routeDate || "未排日期";
  const routeNo = item.routeNo || item.routeBatchNo || "未分趟";
  const sequence = Number(item.routeSequence ?? item.stopSequence ?? 0);
  const sequenceText = sequence > 0 ? `第 ${sequence} 站` : "未排站序";
  const status = item.dispatchStatus || "未派单";
  return [routeDate, routeNo, sequenceText, status].filter(Boolean).join(" / ");
}

function formatFulfillmentTableRemark(item) {
  if (item.status.includes("数量") || item.status.includes("无法")) return "需办公室处理";
  if (item.method === "快递快运" && item.status === "待确认拉走") return "等拉走确认";
  const routeSequence = Number(item.routeSequence ?? item.stopSequence ?? 0);
  if (item.method === "送货" && routeSequence > 0) return `${item.routeNo || item.routeBatchNo || "未分趟"} #${routeSequence}`;
  return "正常";
}

function DeliveryEvidenceCard({ title, required = false, attachmentId = "", file = null, emptyText = "未提交", actionState = {}, onView }) {
  const canView = Boolean(attachmentId);
  const statusText = attachmentId ? "已提交" : emptyText;
  const metaText = file
    ? [file.fileName || attachmentId, file.mimeType || file.contentType, formatAttachmentSize(file.fileSize)].filter(Boolean).join(" · ")
    : attachmentId || "无附件 ID";
  return (
    <div className="delivery-evidence-card">
      <div>
        <span>{title}{required ? " *" : ""}</span>
        <strong>{statusText}</strong>
        <small>{metaText}</small>
      </div>
      <button disabled={actionState.disabled || !canView} title={actionState.title || (!canView ? "没有可查看的附件" : "")} onClick={onView}>查看</button>
    </div>
  );
}

function findDeliveryEvidenceFile(files = [], attachmentId = "", purpose = "") {
  return files.find((file) => (attachmentId && file.attachmentId === attachmentId) || (purpose && file.purpose === purpose)) ?? null;
}
