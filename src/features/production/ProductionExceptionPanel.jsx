import { InfoGrid, StatusPill } from "../../shared/ui/operational.jsx";
import { formatCompactDateTime } from "./productionPackingPresentation.js";

export const productionExceptionResolutionOptions = [
  { value: "继续生产", label: "继续生产" },
  { value: "改任务顺序", label: "改任务顺序" },
  { value: "等待材料/维修", label: "等待材料/维修" },
  { value: "转数量差异处理", label: "转数量差异处理" },
  { value: "转售后/质量问题", label: "转售后/质量问题" },
  { value: "取消/作废任务", label: "取消/作废任务" },
];

export function isTerminalProductionException(exceptionRecord) {
  return ["已恢复生产", "已作废"].includes(String(exceptionRecord?.status ?? "").trim());
}

export function buildProductionExceptionResolutionEffects(resolutionCode) {
  if (resolutionCode === "继续生产") {
    return ["恢复生产任务至原可执行状态", "关闭当前生产异常待办", "不变更库存、占用、打包或对账"];
  }
  if (resolutionCode === "取消/作废任务") {
    return ["将生产任务置为已作废", "关闭当前生产异常待办", "不自动作废订单，且不变更库存、占用、打包或对账"];
  }
  if (resolutionCode === "转数量差异处理") {
    return ["任务进入数量差异待处理，继续阻断报工", "保留生产异常待办供办公室继续跟进", "不变更库存、占用、打包或对账"];
  }
  return ["任务继续保持异常暂停，报工仍被阻断", "保留生产异常待办供办公室继续跟进", "不变更库存、占用、打包或对账"];
}

export function ProductionExceptionPanel({
  affectsDelivery,
  estimatedLossQty,
  exceptionDisabled,
  exceptionRemark,
  exceptionTitle,
  exceptionType,
  latestException,
  onChangeField,
  onConfirmResolution,
  onRequestResolutionConfirmation,
  onResolutionConfirmationKeyDown,
  onReturnToResolutionEdit,
  onSubmitException,
  productionReportConfirmationOpen,
  resolutionCode,
  resolutionConfirmation,
  resolutionConfirmationRef,
  resolutionDisabled,
  resolutionNote,
  resolutionTerminal,
  resolutionTitle,
  resolutionTriggerRef,
}) {
  const confirmationOpen = Boolean(resolutionConfirmation);
  const reportConfirmationOpen = Boolean(productionReportConfirmationOpen);

  return (
    <>
      <section className="detail-section production-exception-report">
        <div className="section-title-row">
          <h3>生产异常</h3>
          <StatusPill tone={latestException?.continuationMode === "暂停等确认" ? "danger" : "warning"}>
            {latestException?.status || "未上报"}
          </StatusPill>
        </div>
        <div className="detail-form">
          <label>
            <span>异常类型</span>
            <select value={exceptionType} onChange={(event) => onChangeField("exceptionType", event.target.value)}>
              <option value="">请选择</option>
              <option>印刷问题</option>
              <option>材料问题</option>
              <option>机器问题</option>
              <option>尺寸/模具问题</option>
              <option>数量异常</option>
              <option>客户/订单信息不清</option>
              <option>其他</option>
            </select>
          </label>
          <label>
            <span>预估异常数</span>
            <input type="number" min="0" value={estimatedLossQty} onChange={(event) => onChangeField("estimatedLossQty", event.target.value)} />
          </label>
          <label>
            <span>异常说明</span>
            <input value={exceptionRemark} placeholder="其他类型必填" onChange={(event) => onChangeField("exceptionRemark", event.target.value)} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={affectsDelivery} onChange={(event) => onChangeField("exceptionAffectsDelivery", event.target.checked)} />
            <span>可能影响交付时间</span>
          </label>
        </div>
        <p>上报会创建生产异常待办。异常数量仅作追溯，不会写库存、占用、打包或对账。</p>
        <div className="action-row">
          <button disabled={exceptionDisabled || reportConfirmationOpen || confirmationOpen} title={exceptionTitle} onClick={() => onSubmitException("继续生产")}>报异常并继续</button>
          <button className="danger-action" disabled={exceptionDisabled || reportConfirmationOpen || confirmationOpen} title={exceptionTitle} onClick={() => onSubmitException("暂停等确认")}>报异常并暂停</button>
        </div>
      </section>
      {latestException ? (
        <section className="detail-section production-exception-resolution">
          <div className="section-title-row">
            <h3>生产管理处理</h3>
            <StatusPill tone={resolutionTerminal ? "success" : "warning"}>
              {latestException.resolutionCode || "待处理"}
            </StatusPill>
          </div>
          {resolutionTerminal ? (
            <InfoGrid
              rows={[
                ["处理结果", latestException.resolutionCode || latestException.status],
                ["处理说明", latestException.resolutionNote || "无"],
                ["处理时间", latestException.resolvedAt ? formatCompactDateTime(latestException.resolvedAt) : "已留痕"],
              ]}
            />
          ) : (
            <>
              <div className="detail-form">
                <label>
                  <span>处理结果</span>
                  <select value={resolutionCode} onChange={(event) => onChangeField("exceptionResolutionCode", event.target.value)}>
                    <option value="">请选择</option>
                    {productionExceptionResolutionOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>处理说明</span>
                  <input value={resolutionNote} placeholder="必填，写明处理依据" onChange={(event) => onChangeField("exceptionResolutionNote", event.target.value)} />
                </label>
              </div>
              <p>继续生产才会解除报工阻断；调序、等待材料/维修、数量差异和质量问题仍保持任务阻断。作废只作废生产任务，不自动作废订单。</p>
              <div className="action-row">
                <button
                  className="primary-action"
                  disabled={resolutionDisabled || reportConfirmationOpen || confirmationOpen}
                  ref={resolutionTriggerRef}
                  title={resolutionTitle}
                  onClick={onRequestResolutionConfirmation}
                >
                  确认处理异常
                </button>
              </div>
            </>
          )}
          {resolutionConfirmation ? (
            <section
              aria-describedby="production-exception-resolution-confirmation-summary"
              aria-labelledby="production-exception-resolution-confirmation-title"
              aria-live="assertive"
              className="production-report-confirmation"
              onKeyDown={onResolutionConfirmationKeyDown}
              ref={resolutionConfirmationRef}
              role="region"
              tabIndex={-1}
            >
              <div className="production-report-confirmation-head">
                <div>
                  <strong id="production-exception-resolution-confirmation-title">{resolutionConfirmation.summary.title}</strong>
                  <span id="production-exception-resolution-confirmation-summary">确认后写入异常处理决定；按 Esc 可返回修改。</span>
                </div>
                <StatusPill tone="warning">管理确认</StatusPill>
              </div>
              <div className="production-report-confirmation-grid">
                {resolutionConfirmation.summary.fields.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
              <ul className="production-report-confirmation-effects">
                {resolutionConfirmation.summary.effects.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <div className="production-report-confirmation-actions">
                <button type="button" onClick={onReturnToResolutionEdit}>返回修改</button>
                <button className="primary-action" type="button" onClick={onConfirmResolution}>确认处理决定</button>
              </div>
            </section>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
