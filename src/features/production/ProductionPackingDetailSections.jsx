import { InfoGrid, StatusPill } from "../../shared/ui/operational.jsx";
import { BusinessDecisionHistoryPanel } from "../../components/BusinessDecisionHistoryPanel.jsx";
import { DelegatedBusinessDecisionFields } from "../../components/DelegatedBusinessDecisionFields.jsx";
import {
  buildProductionPackingSourceDetailRows,
  formatCompactDateTime,
  formatProductionDailyProgressLabel,
  formatProductionFinishedGoodsPhotoLabel,
  getProductionFinishedGoodsPhotoTone,
  getProductionPackingDetailSourceLabel,
} from "./productionPackingPresentation.js";

export function ProductionPackingDetailHeader({
  detailInventoryItem,
  detailLine,
  detailMode,
  findCustomer,
  getLineColorSpecLabel,
  getLinePrintSide,
  getLineRemark,
  latestProductionException,
  selectedFinishedGoodsPhoto,
  selectedPackingTask,
  selectedProductionMachineId,
  selectedPublishedScheduleId,
  selectedProductionTaskId,
}) {
  return (
    <div className="production-detail-fixed">
      <div className="production-current-task">
        <span>当前任务</span>
        <strong>{detailMode === "packing" ? selectedPackingTask?.packingTaskId : selectedProductionTaskId}</strong>
        <p>{findCustomer(detailLine.customerId).name} · {detailLine.size} · {getLineColorSpecLabel(detailLine)} · {getLinePrintSide(detailLine)}</p>
      </div>
      <InfoGrid
        rows={[
          ["计划数量", `${detailLine.qty} 个`],
          ["交付", detailLine.latest],
          ["交付方式", detailLine.fulfillment],
          ["状态", detailMode === "packing" ? selectedPackingTask.status : detailLine.status],
          ["机台", detailMode === "production" ? selectedProductionMachineId : "打包台待分配"],
          ["货品", `${detailLine.product} / ${detailLine.size}`],
          ["颜色/印刷/提手", `${getLineColorSpecLabel(detailLine)} / ${getLinePrintSide(detailLine)}`],
          ["排产发布", detailMode === "production" ? (selectedPublishedScheduleId ? `${selectedProductionMachineId} / ${selectedPublishedScheduleId}` : "未发布到车间任务池") : "生产完成后进入打包"],
          ["库存键", detailInventoryItem ? `${detailInventoryItem.id} / ${detailInventoryItem.zone}` : "未找到匹配库存键"],
          ["跨日进度", formatProductionDailyProgressLabel(detailLine) || "暂无日报数"],
          ["成品图", detailMode === "production" ? formatProductionFinishedGoodsPhotoLabel(selectedFinishedGoodsPhoto) : "生产侧确认"],
          ["生产异常", detailMode === "production" && latestProductionException ? `${latestProductionException.exceptionType} · ${latestProductionException.continuationMode}` : "无"],
          ["备注", getLineRemark(detailLine) || "无"],
        ]}
      />
    </div>
  );
}

export function ProductionScheduleDecisionSection({
  authState,
  businessId,
  currentUser,
  disabled,
  directAllowed,
  onChange,
  scheduleDecision,
}) {
  return (
    <section className="detail-section production-schedule-decision-section">
      <h3>排产经营决定</h3>
      {!directAllowed ? (
        <DelegatedBusinessDecisionFields
          scope="production_schedule"
          businessType="production_task"
          businessId={businessId}
          authState={authState}
          operatorId={currentUser?.userId}
          operatorName={currentUser?.displayName}
          value={scheduleDecision}
          onChange={onChange}
          title="排产决定代录"
          disabled={disabled}
        />
      ) : (
        <p className="form-note">当前管理账号直接决定；操作人、决定内容、目标任务和影响范围仍写入审计。</p>
      )}
      <BusinessDecisionHistoryPanel
        authState={authState}
        operatorId={currentUser?.userId}
        businessType="production_task"
        businessId={businessId}
      />
    </section>
  );
}

export function ProductionPackingSourceDetailCard({ detailState, detailMode }) {
  const sourceLabel = getProductionPackingDetailSourceLabel(detailState?.source);
  const sourceTone = detailState?.source === "api" ? "success" : detailState?.error ? "danger" : "warning";
  const rows = buildProductionPackingSourceDetailRows(detailState, detailMode);

  return (
    <section className="detail-section production-source-detail-section">
      <div className="section-head-row">
        <h3>来源详情</h3>
        <StatusPill tone={sourceTone}>{sourceLabel}</StatusPill>
      </div>
      <InfoGrid rows={rows} />
    </section>
  );
}

export function ProductionTaskReportInputs({
  completeReportTriggerRef,
  confirmationOpen,
  onChange,
  onRequestComplete,
  reportDisabled,
  reportExceptionQty,
  reportMachineCount,
  reportQualifiedQty,
  reportTitle,
  selectedProductionLine,
}) {
  return (
    <>
      <section className="detail-section production-machine-proof">
        <div className="section-title-row">
          <h3>机器计数 / 动作次数（仅作生产凭证）</h3>
          <button type="button" onClick={() => onChange("machineCount", 0)}>清零计数</button>
        </div>
        <div className="machine-proof-metrics">
          <span>计划动作次数<strong>{Number(selectedProductionLine.qty || 0).toLocaleString("zh-CN")} 次</strong></span>
          <span>机器动作次数<strong>{Number(reportMachineCount || 0).toLocaleString("zh-CN")} 次</strong></span>
          <span>良品动作次数<strong>{Number(reportQualifiedQty || 0).toLocaleString("zh-CN")} 次</strong></span>
          <span>不良动作次数<strong>{Number(reportExceptionQty || 0).toLocaleString("zh-CN")} 次</strong></span>
        </div>
        <p>仅用于生产过程追溯，不作为合格数量、库存、履约数量或计费数量。</p>
      </section>
      <section className="detail-section">
        <h3>合格产出（用于交付与入库）</h3>
        <div className="detail-form">
          <label>
            <span>合格数量</span>
            <input type="number" min="1" value={reportQualifiedQty} onChange={(event) => onChange("qualifiedQty", event.target.value)} />
          </label>
          <label>
            <span>异常/废品数</span>
            <input type="number" min="0" value={reportExceptionQty} onChange={(event) => onChange("exceptionQty", event.target.value)} />
          </label>
          <label>
            <span>机器计数/动作次数</span>
            <input type="number" min="0" placeholder="只作凭证" value={reportMachineCount} onChange={(event) => onChange("machineCount", event.target.value)} />
          </label>
        </div>
        <div className="action-row production-qualified-submit">
          <button
            className="primary-action"
            disabled={reportDisabled || confirmationOpen}
            ref={completeReportTriggerRef}
            title={reportTitle}
            onClick={onRequestComplete}
          >
            提交合格数量
          </button>
        </div>
      </section>
      <section className="detail-section production-transaction-result">
        <h3>事务结果</h3>
        <p>报当日数量只记录跨日进度，不入库、不占用、不生成打包任务；报工完成才会把合格数量入库并占用给该订单。</p>
      </section>
    </>
  );
}

export function ProductionFinishedGoodsPhotoSection({
  finishedGoodsPhoto,
  onAccept,
  onReject,
  onUpload,
  rejectDisabled,
  rejectTitle,
  reviewDisabled,
  reviewTitle,
  uploadDisabled,
  uploadTitle,
}) {
  return (
    <section className="detail-section finished-goods-photo-section">
      <div className="section-title-row">
        <h3>定制成品图</h3>
        <StatusPill tone={getProductionFinishedGoodsPhotoTone(finishedGoodsPhoto)}>
          {finishedGoodsPhoto.status}
        </StatusPill>
      </div>
      <InfoGrid
        rows={[
          ["附件", finishedGoodsPhoto.fileName || finishedGoodsPhoto.attachmentId || "未上传"],
          ["上传", finishedGoodsPhoto.uploadedAt ? formatCompactDateTime(finishedGoodsPhoto.uploadedAt) : "未上传"],
          ["复核", finishedGoodsPhoto.reviewedAt ? formatCompactDateTime(finishedGoodsPhoto.reviewedAt) : "待确认"],
          ["退回原因", finishedGoodsPhoto.rejectedReason || "无"],
        ]}
      />
      <div className="action-row">
        <button disabled={uploadDisabled} title={uploadTitle} onClick={onUpload}>上传成品图</button>
        <button className="primary-action" disabled={reviewDisabled} title={reviewTitle} onClick={onAccept}>确认成品图</button>
        <button disabled={rejectDisabled} title={rejectTitle} onClick={onReject}>退回重拍</button>
      </div>
    </section>
  );
}

export function ProductionReportConfirmationPanel({
  confirmation,
  confirmationRef,
  onConfirm,
  onKeyDown,
  onReturnToEdit,
  reportDailyDisabled,
  reportDisabled,
}) {
  if (!confirmation) return null;

  return (
    <section
      aria-describedby="production-report-confirmation-summary"
      aria-labelledby="production-report-confirmation-title"
      aria-live="assertive"
      className="production-report-confirmation"
      onKeyDown={onKeyDown}
      ref={confirmationRef}
      role="region"
      tabIndex={-1}
    >
      <div className="production-report-confirmation-head">
        <div>
          <strong id="production-report-confirmation-title">{confirmation.summary.title}</strong>
          <span id="production-report-confirmation-summary">
            {confirmation.kind === "daily"
              ? "确认后才会写入当日进度；按 Esc 可返回修改。"
              : "确认后才会完成生产、入库、占用并创建待打包任务；按 Esc 可返回修改。"}
          </span>
        </div>
        <StatusPill tone="warning">高风险写入</StatusPill>
      </div>
      <div className="production-report-confirmation-grid">
        {confirmation.summary.fields.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      <ul className="production-report-confirmation-effects">
        {confirmation.summary.effects.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <div className="production-report-confirmation-actions">
        <button type="button" onClick={onReturnToEdit}>返回修改</button>
        <button
          className="primary-action"
          type="button"
          disabled={confirmation.kind === "daily" ? reportDailyDisabled : reportDisabled}
          onClick={onConfirm}
        >
          {confirmation.kind === "daily" ? "确认提交当日报数" : "确认完成生产报工"}
        </button>
      </div>
    </section>
  );
}

export function PackingCompletionSection({
  confirmation,
  confirmationRef,
  confirmationTriggerRef,
  onChange,
  onConfirm,
  onKeyDown,
  onRequest,
  onReturnToEdit,
  packageCount,
  packedQty,
  packingDisabled,
  packingTitle,
}) {
  return (
    <>
      {!confirmation ? (
        <>
          <section className="detail-section">
            <h3>包裹明细</h3>
            <div className="detail-form">
              <label>
                <span>实际打包数量</span>
                <input type="number" min="1" value={packedQty} onChange={(event) => onChange("actualPackedQty", event.target.value)} />
              </label>
              <label>
                <span>包裹数</span>
                <input type="number" min="1" value={packageCount} onChange={(event) => onChange("packageCount", event.target.value)} />
              </label>
            </div>
          </section>
          <section className="detail-section">
            <h3>事务结果</h3>
            <p>提交后生成包裹记录；快递快运统一进入待打印标签，只有服务端确认打印作业完成后才进入下一步。打包完成本身不扣库存。</p>
          </section>
        </>
      ) : null}
      <div className="action-row">
        <button
          className="primary-action"
          disabled={packingDisabled || Boolean(confirmation)}
          ref={confirmationTriggerRef}
          title={packingTitle}
          onClick={onRequest}
        >
          提交打包完成
        </button>
      </div>
      {confirmation ? (
        <section
          aria-describedby="production-packing-completion-confirmation-summary"
          aria-labelledby="production-packing-completion-confirmation-title"
          aria-live="assertive"
          className="packing-completion-confirmation"
          onKeyDown={onKeyDown}
          ref={confirmationRef}
          role="region"
          tabIndex={-1}
        >
          <div className="packing-completion-confirmation-head">
            <div>
              <strong id="production-packing-completion-confirmation-title">{confirmation.summary.title}</strong>
              <span id="production-packing-completion-confirmation-summary">确认后才会生成包裹并写入打包结果；按 Esc 可返回修改。</span>
            </div>
            <StatusPill tone="warning">高风险写入</StatusPill>
          </div>
          <div className="packing-completion-confirmation-grid">
            {confirmation.summary.fields.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
          <ul className="packing-completion-confirmation-effects">
            {confirmation.summary.effects.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <div className="packing-completion-confirmation-actions">
            <button type="button" onClick={onReturnToEdit}>返回修改</button>
            <button className="primary-action" type="button" disabled={packingDisabled} onClick={onConfirm}>确认提交打包完成</button>
          </div>
        </section>
      ) : null}
    </>
  );
}
