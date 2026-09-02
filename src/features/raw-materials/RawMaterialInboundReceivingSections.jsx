import { InfoGrid, StatusPill } from "../../shared/ui/operational.jsx";
import {
  canConfirmRawMaterialConsumptionRoll,
  canIssueRawMaterialRoll,
  canPrintRawMaterialLabels,
  canReturnRawMaterialLeftoverRoll,
  canReviewRawMaterialInbound,
  canReviewRawMaterialLeftoverRoll,
  formatRawMaterialDeliveryNoteNo,
} from "../../domain/rawMaterialInboundListState.js";
import { formatRawMaterialWeight } from "./RawMaterialInboundWorkbench.jsx";
import {
  buildRawMaterialConsumptionOptions,
  buildRawMaterialIssueOptions,
  buildRawMaterialIssueTaskOptions,
  buildRawMaterialLabelVerificationDraft,
  buildRawMaterialLeftoverReturnOptions,
  buildRawMaterialLeftoverReviewOptions,
  buildRawMaterialPartialConsumptionOptions,
  buildRawMaterialPartialIssueOptions,
  findRawMaterialProductionTaskOption,
  formatRawMaterialCost,
  formatRawMaterialLabelVerification,
  formatRawMaterialOptionalAttachment,
  formatRawMaterialOrderSupport,
  formatRawMaterialStructuredSpec,
  getRawMaterialRollTone,
} from "./rawMaterialInboundWorkflow.js";
import {
  OCR_LINE_REVIEW_FIELDS,
  buildOcrLineReviewDraft,
  formatOcrLineRecognizedValue,
  isNumericOcrField,
  isNumericOcrLineField,
} from "./rawMaterialInboundOcrDraft.js";

export function RawMaterialInboundReceivingSections({
  actionStates,
  canViewCost,
  detailTab,
  firstReleaseMode,
  issueSelection,
  labelVerification,
  money,
  ocrLineReviewDraft,
  ocrReviewDraft,
  onAction,
  onOcrReviewConfirm,
  onPrintLabels,
  onReprintLabel,
  productionTasks,
  selected,
  selectedOrderSupport,
  selectedStock,
  selectedTaskCandidate,
  setIssueSelection,
  setLabelVerification,
  setOcrLineReviewDraft,
  setOcrReviewDraft,
}) {
  const {
    attach: attachState,
    consumption: consumptionState,
    exception: exceptionState,
    issue: issueState,
    leftover: leftoverState,
    leftoverReview: leftoverReviewState,
    print: printState,
    review: reviewState,
    voidDraft: voidDraftState,
  } = actionStates;
  const handleOcrReviewConfirm = onOcrReviewConfirm;
  const handlePrintLabels = onPrintLabels;
  const handleReprintLabel = onReprintLabel;

  return (
    <>
<section className="detail-section operational-detail-section-first" hidden={detailTab !== "入库标签"}>
  <h3>入库动作</h3>
  {selected.ocrProvider === "tencent_cloud_table_v3" && canReviewRawMaterialInbound(selected) ? (
    <div className="raw-material-ocr-review-panel">
      <div className="raw-material-ocr-review-heading">
        <div>
          <strong>腾讯云 OCR 人工复核</strong>
          <span>原图附件 {selected.sourceAttachmentId || "已保存"} · 请求 {selected.ocrRequestId || "待记录"}</span>
        </div>
        <span>{selected.ocrStatus}</span>
      </div>
      <div className="raw-material-ocr-review-grid">
        {(selected.ocrReviewFields ?? []).map((field) => (
          <label key={field.key}>
            <span>{field.label}{field.required ? " *" : ""}</span>
            <input
              aria-label={`${field.label} OCR 复核值`}
              inputMode={isNumericOcrField(field.key) ? "decimal" : undefined}
              min={field.key === "rollCount" ? "1" : undefined}
              onChange={(event) => setOcrReviewDraft((current) => ({
                ...current,
                [field.key]: isNumericOcrField(field.key) ? event.target.value : event.target.value,
              }))}
              step={field.key === "rollCount" ? "1" : isNumericOcrField(field.key) ? "0.001" : undefined}
              type={isNumericOcrField(field.key) ? "number" : "text"}
              value={ocrReviewDraft[field.key] ?? ""}
            />
            <small>
              识别值：{String(field.recognizedValue || "未识别")} · 可信度 {Math.round(Number(field.confidence) || 0)}% · {field.reviewStatus || "待人工复核"}
            </small>
          </label>
        ))}
      </div>
      {(selected.ocrLines ?? []).length ? (
        <div className="raw-material-ocr-lines" aria-label="OCR 逐行复核">
          {(selected.ocrLines ?? []).map((line, index) => {
            const lineDraft = ocrLineReviewDraft[line.lineId] ?? buildOcrLineReviewDraft(line);
            const recognizedValues = line.recognizedValues ?? line.values ?? {};
            return (
              <div className="raw-material-ocr-line-review" key={line.lineId}>
                <div className="raw-material-ocr-line-heading">
                  <strong>第 {index + 1} 行</strong>
                  <span>{line.sourceText || Object.values(recognizedValues).filter(Boolean).join(" | ") || "该行未识别到有效文字"}</span>
                  <em>{line.reviewStatus || "待人工复核"}</em>
                </div>
                <div className="raw-material-ocr-line-grid">
                  {OCR_LINE_REVIEW_FIELDS.map(([key, label]) => (
                    <label key={key}>
                      <span>{label}</span>
                      <input
                        aria-label={`OCR 明细 ${line.lineId} ${label}`}
                        inputMode={isNumericOcrLineField(key) ? "decimal" : undefined}
                        min={key === "rollCount" ? "1" : undefined}
                        onChange={(event) => setOcrLineReviewDraft((current) => ({
                          ...current,
                          [line.lineId]: {
                            ...(current[line.lineId] ?? buildOcrLineReviewDraft(line)),
                            [key]: event.target.value,
                          },
                        }))}
                        step={key === "rollCount" ? "1" : isNumericOcrLineField(key) ? "0.001" : undefined}
                        type={isNumericOcrLineField(key) ? "number" : "text"}
                        value={lineDraft[key] ?? ""}
                      />
                      <small>识别值：{formatOcrLineRecognizedValue(recognizedValues[key])} · {Math.round(Number(line.confidences?.[key]) || 0)}%</small>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      <button
        className="primary-action"
        disabled={reviewState.disabled}
        onClick={handleOcrReviewConfirm}
        type="button"
      >
        确认人工复核
      </button>
    </div>
  ) : null}
  <div className="action-row raw-material-actions">
    <button
      className="primary-action"
      disabled={reviewState.disabled || !canReviewRawMaterialInbound(selected)}
      title={reviewState.title || (!canReviewRawMaterialInbound(selected) ? "当前状态无需复核" : "")}
      onClick={selected.ocrProvider === "tencent_cloud_table_v3" ? handleOcrReviewConfirm : () => onAction?.("复核送货单", selected.id)}
    >
      复核送货单
    </button>
    <button
      disabled={voidDraftState.disabled || selected.status !== "已识别待复核"}
      title={voidDraftState.title || (selected.status !== "已识别待复核" ? "只有未复核、未打印、未形成库存的误录草稿可以作废" : "保留原图和操作审计，不形成库存")}
      onClick={() => {
        const reason = globalThis.prompt?.("请输入作废误录草稿的原因（必填）：", "");
        if (!String(reason ?? "").trim()) return;
        onAction?.("作废误录草稿", selected.id, { reason: String(reason).trim() });
      }}
      type="button"
    >
      作废误录草稿
    </button>
    <button
      disabled={printState.disabled || !canPrintRawMaterialLabels(selected)}
      title={printState.title || (!canPrintRawMaterialLabels(selected) ? "先完成送货单复核" : "打印标签只是待贴标，贴到实物并核对后才入库")}
      onClick={handlePrintLabels}
    >
      打印一卷一标
    </button>
    <button
      disabled={exceptionState.disabled || selected.status === "入库异常/待确认"}
      title={exceptionState.title || ""}
      onClick={() => onAction?.("标记异常", selected.id, { reason: "页面手工标记异常。" })}
    >
      标记异常
    </button>
  </div>
  <InfoGrid
    rows={[
      ["原料", `${selected.productName || selected.materialType} / ${selected.materialType}`],
      ["外部/内部单号", formatRawMaterialDeliveryNoteNo(selected)],
      ["规格颜色", `${formatRawMaterialStructuredSpec(selected)} / ${selected.supplierColor} -> ${selected.factoryColor}`],
      ["主要查询键", `${selected.factoryColor || selected.supplierColor || "颜色待补"} / ${selected.widthCm || "?"}cm / ${selected.gramWeightGsm || "?"}克`],
      ["同色同宽可用", `${selectedStock?.availableWeightKg || 0}kg / ${selectedStock?.availableRollCount || 0}卷`],
      ...(firstReleaseMode ? [] : [["订单支持", formatRawMaterialOrderSupport(selectedOrderSupport, selectedTaskCandidate)]]),
      ["卷/件数", `${selected.rollCount || selected.rolls?.length || 0}`],
      ["重量/单位", `${formatRawMaterialWeight(selected)} / ${selected.unit || "未填"}`],
      ["单价/金额", canViewCost ? formatRawMaterialCost(selected, money) : "成本权限可见"],
      ["库位", selected.location || "待分配"],
      ["OCR", selected.ocrStatus || "待识别"],
      ["单据附件", formatRawMaterialOptionalAttachment(selected.signedNoteStatus)],
    ]}
  />
</section>
<section className="detail-section raw-material-roll-section" hidden={!(["入库标签", "领料成本", "扫码出库"].includes(detailTab))}>
<h3>{detailTab === "入库标签" ? "卷/件标签" : firstReleaseMode ? "按卷扫码出库" : "卷/件领料与消耗"}</h3>
<div className="raw-material-roll-list">
  {(selected.rolls ?? []).map((roll) => {
    const canAttachRoll = roll.labelStatus === "已打印待贴标" && roll.inventoryStatus !== "可用";
    const canIssueRoll = canIssueRawMaterialRoll(roll);
    const canPartialIssueRoll = canIssueRoll && Number(roll.weightKg || 0) > 0;
    const canConfirmConsumption = canConfirmRawMaterialConsumptionRoll(roll);
    const canPartialConsumeRoll = canConfirmConsumption && Number(roll.weightKg || 0) > 0;
    const canReturnLeftover = canReturnRawMaterialLeftoverRoll(roll);
    const canReviewLeftover = canReviewRawMaterialLeftoverRoll(roll);
    return (
      <div className="raw-material-roll-row" key={roll.id}>
        <div>
          <strong>{roll.id}</strong>
          <span>{roll.supplierRollNo} / {roll.weightKg ? `${roll.weightKg}kg` : selected.unit || "件"}</span>
        </div>
        <StatusPill tone={getRawMaterialRollTone(roll)}>{roll.labelStatus} / {roll.inventoryStatus || "不可用"}</StatusPill>
        <span>{roll.location || "待分配"}</span>
        <span>{formatRawMaterialLabelVerification(roll)}</span>
        <button
          hidden={detailTab !== "入库标签"}
          disabled={attachState.disabled || !canAttachRoll}
          title={attachState.title || (!canAttachRoll ? "该卷/件还未到可贴标确认状态" : "")}
          onClick={() => setLabelVerification(buildRawMaterialLabelVerificationDraft(selected, roll))}
        >
          核对并确认
        </button>
        <button
          hidden={detailTab !== "入库标签" || roll.labelStatus !== "标签或实物不符/待确认"}
          disabled={printState.disabled}
          title={printState.title || "只作废当前异常卷的旧标签，不影响其他已确认卷"}
          onClick={() => onAction?.("作废卷标", selected.id, { rollId: roll.id, reason: "标签与实物不符，作废当前卷旧标签。" })}
        >
          作废旧标签
        </button>
        <button
          hidden={detailTab !== "入库标签" || roll.labelStatus !== "标签已作废/待重打"}
          disabled={printState.disabled}
          title={printState.title || "只重打当前异常卷的标签，重打后仍需重新逐卷核对"}
          onClick={() => handleReprintLabel(roll)}
        >
          重打本卷标签
        </button>
        <button
          hidden={!(["领料成本", "扫码出库"].includes(detailTab))}
          disabled={issueState.disabled || !canIssueRoll}
          title={issueState.title || (!canIssueRoll ? "该卷/件还不是可用库存，或已经领到机边" : "")}
          onClick={() => setIssueSelection(buildRawMaterialIssueOptions(selected, roll, firstReleaseMode ? [] : productionTasks, firstReleaseMode))}
        >
          {firstReleaseMode ? "扫码出库" : "机边领料"}
        </button>
        <button
          hidden={firstReleaseMode || detailTab !== "领料成本"}
          disabled={issueState.disabled || !canPartialIssueRoll}
          title={issueState.title || (!canPartialIssueRoll ? "只有有重量的可用卷料才能拆卷部分领料" : "")}
          onClick={() => setIssueSelection(buildRawMaterialPartialIssueOptions(selected, roll, productionTasks))}
        >
          部分领料
        </button>
        <button
          hidden={firstReleaseMode || detailTab !== "领料成本"}
          disabled={consumptionState.disabled || !canConfirmConsumption}
          title={consumptionState.title || (!canConfirmConsumption ? "只有机边领用且待消耗确认的卷/件才能确认消耗" : "")}
          onClick={() => onAction?.("确认消耗", selected.id, buildRawMaterialConsumptionOptions(selected, roll))}
        >
          确认消耗
        </button>
        <button
          hidden={firstReleaseMode || detailTab !== "领料成本"}
          disabled={consumptionState.disabled || !canPartialConsumeRoll}
          title={consumptionState.title || (!canPartialConsumeRoll ? "只有有重量的机边卷料才能登记部分消耗" : "")}
          onClick={() => onAction?.("确认消耗", selected.id, buildRawMaterialPartialConsumptionOptions(selected, roll))}
        >
          部分消耗
        </button>
        <button
          hidden={firstReleaseMode || detailTab !== "领料成本"}
          disabled={leftoverState.disabled || !canReturnLeftover}
          title={leftoverState.title || (!canReturnLeftover ? "只有机边领用的卷/件才能退回余料" : "")}
          onClick={() => onAction?.("余料退回", selected.id, buildRawMaterialLeftoverReturnOptions(selected, roll))}
        >
          余料退回
        </button>
        <button
          hidden={firstReleaseMode || detailTab !== "领料成本"}
          disabled={leftoverReviewState.disabled || !canReviewLeftover}
          title={leftoverReviewState.title || (!canReviewLeftover ? "只有余料待复核的卷/件才能复核转可用" : "")}
          onClick={() => onAction?.("复核余料可用", selected.id, buildRawMaterialLeftoverReviewOptions(selected, roll))}
        >
          复核余料
        </button>
      </div>
    );
  })}
</div>
{labelVerification ? (
  <form
    className="raw-material-label-verification"
    onSubmit={async (event) => {
      event.preventDefault();
      if (!labelVerification.matchResult) return;
      const result = await onAction?.("确认贴标入库", selected.id, {
        rollId: labelVerification.rollId,
        matchResult: labelVerification.matchResult,
        checkedWeightKg: labelVerification.checkedWeightKg,
        checkedColor: labelVerification.checkedColor,
        checkedSpec: labelVerification.checkedSpec,
        location:
          labelVerification.matchResult === "mismatched" && labelVerification.location === "原料库-可用区"
            ? "原料隔离区"
            : labelVerification.location,
        verificationNote: labelVerification.verificationNote,
      });
      if (result) setLabelVerification(null);
    }}
  >
    <div>
      <strong>逐卷贴标核对：{labelVerification.rollId}</strong>
      <span>只会影响当前卷/件；不一致将隔离，其他已确认卷保持可用。</span>
    </div>
    <label>结果
      <select
        onChange={(event) => setLabelVerification((current) => ({ ...current, matchResult: event.target.value }))}
        value={labelVerification.matchResult}
      >
        <option value="">请选择</option>
        <option value="matched">标签与实物一致</option>
        <option value="mismatched">标签与实物不一致</option>
      </select>
    </label>
    <label>实物重量 kg<input min="0" onChange={(event) => setLabelVerification((current) => ({ ...current, checkedWeightKg: event.target.value }))} step="0.001" type="number" value={labelVerification.checkedWeightKg} /></label>
    <label>实物颜色<input onChange={(event) => setLabelVerification((current) => ({ ...current, checkedColor: event.target.value }))} value={labelVerification.checkedColor} /></label>
    <label>实物规格<input onChange={(event) => setLabelVerification((current) => ({ ...current, checkedSpec: event.target.value }))} value={labelVerification.checkedSpec} /></label>
    <label>库位<input onChange={(event) => setLabelVerification((current) => ({ ...current, location: event.target.value }))} value={labelVerification.location} /></label>
    <label>说明<textarea onChange={(event) => setLabelVerification((current) => ({ ...current, verificationNote: event.target.value }))} value={labelVerification.verificationNote} /></label>
    <div className="action-row">
      <button className="primary-action" disabled={attachState.disabled || !labelVerification.matchResult} type="submit">确认本卷核对</button>
      <button onClick={() => setLabelVerification(null)} type="button">取消</button>
    </div>
  </form>
) : null}
{issueSelection ? (
  <form
    className="raw-material-label-verification raw-material-issue-selection"
    onSubmit={async (event) => {
      event.preventDefault();
      if (!issueSelection.machineId || (!firstReleaseMode && !issueSelection.productionTaskId)) return;
      const result = await onAction?.(firstReleaseMode ? "扫码出库" : "机边领料", selected.id, issueSelection);
      if (result) setIssueSelection(null);
    }}
  >
    <div>
      <strong>领料确认：{issueSelection.rollId}</strong>
      <span>{firstReleaseMode ? "只需选择领用机台；颜色、规格、宽幅和重量由卷码自动带出，暂不关联订单。" : "选择生产任务和机台后才会移动该卷/件到机边；不生成成品数量或成本。"}</span>
    </div>
    {!firstReleaseMode ? <label>生产任务
      <select
        onChange={(event) => {
          const task = findRawMaterialProductionTaskOption(productionTasks, event.target.value);
          setIssueSelection((current) => ({
            ...current,
            productionTaskId: event.target.value,
            machineId: task?.machineId || current.machineId,
          }));
        }}
        value={issueSelection.productionTaskId}
      >
        <option value="">请选择生产任务</option>
        {buildRawMaterialIssueTaskOptions(productionTasks).map((task) => (
          <option key={task.productionTaskId} value={task.productionTaskId}>{task.label}</option>
        ))}
      </select>
    </label> : null}
    <label>机台 / 机边区域<input onChange={(event) => setIssueSelection((current) => ({ ...current, machineId: event.target.value }))} value={issueSelection.machineId} /></label>
    {issueSelection.partialIssue ? (
      <label>本次领料 kg<input min="0.001" onChange={(event) => setIssueSelection((current) => ({ ...current, issuedWeightKg: event.target.value }))} step="0.001" type="number" value={issueSelection.issuedWeightKg} /></label>
    ) : null}
    <label>说明<textarea onChange={(event) => setIssueSelection((current) => ({ ...current, note: event.target.value }))} value={issueSelection.note || ""} /></label>
    <div className="action-row">
      <button className="primary-action" disabled={issueState.disabled || !issueSelection.machineId || (!firstReleaseMode && !issueSelection.productionTaskId)} type="submit">{firstReleaseMode ? "确认扫码出库" : "确认领料到机边"}</button>
      <button onClick={() => setIssueSelection(null)} type="button">取消</button>
    </div>
  </form>
) : null}
</section>
    </>
  );
}
