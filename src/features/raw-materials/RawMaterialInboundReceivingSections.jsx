import { RAW_MATERIAL_WHOLE_ROLL_MACHINE_LABELS, resolveRawMaterialWholeRollMachine } from "../../domain/rawMaterialWholeRollPolicy.js";
import { InfoGrid, StatusPill } from "../../shared/ui/operational.jsx";
import { OfficeInboundFlow } from "./OfficeInboundFlow.jsx";
import { officeInboundUsesCountGate } from "../../domain/officeRawMaterialInboundFlow.js";
import { submitInboundAction } from "./submitInbound.js";
import {
  canConfirmRawMaterialConsumptionRoll,
  canIssueRawMaterialRoll,
  canPrintRawMaterialLabels,
  canReviewRawMaterialInbound,
  formatRawMaterialDeliveryNoteNo,
} from "../../domain/rawMaterialInboundListState.js";
import { formatRawMaterialWeight } from "./RawMaterialInboundWorkbench.jsx";
import {
  buildRawMaterialConsumptionOptions,
  buildRawMaterialIssueOptions,
  buildRawMaterialLabelVerificationDraft,
  buildRawMaterialPartialConsumptionOptions,
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
  actionError = "",
  actionStates,
  canViewCost,
  detailTab,
  firstReleaseMode,
  issueSelection,
  labelVerification,
  money,
  ocrLineReviewDraft,
  ocrReviewDraft,
  ocrReviewSubmitting = false,
  onAction,
  onOfficeException,
  onOfficeReviewConfirm,
  onPrintLabels,
  onReprintLabel,
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
    print: printState,
    review: reviewState,
    voidDraft: voidDraftState,
  } = actionStates;
  const handlePrintLabels = onPrintLabels;
  const handleReprintLabel = onReprintLabel;

  return (
    <>
<section className="detail-section operational-detail-section-first" hidden={detailTab !== "入库标签"}>
  <OfficeInboundFlow
    actionError={actionError}
    attachState={attachState}
    documentDraft={ocrReviewDraft}
    exceptionState={exceptionState}
    inbound={selected}
    lineDrafts={ocrLineReviewDraft}
    onAction={onAction}
    onDocumentDraftChange={setOcrReviewDraft}
    onException={onOfficeException}
    onLineDraftsChange={setOcrLineReviewDraft}
    onPrint={handlePrintLabels}
    onReview={selected.ocrProvider === "tencent_cloud_table_v3" ? onOfficeReviewConfirm : () => submitInboundAction(onAction, selected, "复核送货单")}
    onVerifyRoll={(roll) => setLabelVerification(buildRawMaterialLabelVerificationDraft(selected, roll))}
    printState={printState}
    reviewState={reviewState}
    submitting={ocrReviewSubmitting}
  />
  <details className="office-receive-more">
  <summary>单据与 OCR 原文</summary>
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
            const lineDraft = ocrLineReviewDraft[line.lineId] ?? buildOcrLineReviewDraft(line, selected.documentDirection);
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
                            ...(current[line.lineId] ?? buildOcrLineReviewDraft(line, selected.documentDirection)),
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
        onClick={() => onOfficeReviewConfirm?.()}
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
      onClick={selected.ocrProvider === "tencent_cloud_table_v3" ? () => onOfficeReviewConfirm?.() : () => onAction?.("复核送货单", selected.id)}
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
  </details>
</section>
<section className="detail-section raw-material-roll-section" hidden={!(["入库标签", "领料成本", "扫码出库"].includes(detailTab))}>
<h3>{detailTab === "入库标签" ? "卷/件标签" : firstReleaseMode ? "按卷扫码出库" : "卷/件领料与消耗"}</h3>
<div className="raw-material-roll-list">
  {(selected.rolls ?? []).filter((roll) => detailTab !== "入库标签" || /不符|作废|重打/.test(roll.labelStatus || "")).map((roll) => {
    const canAttachRoll = roll.labelStatus === "已打印待贴标" && roll.inventoryStatus !== "可用" && !officeInboundUsesCountGate(selected);
    const canIssueRoll = canIssueRawMaterialRoll(roll);
    const canConfirmConsumption = canConfirmRawMaterialConsumptionRoll(roll);
    const canPartialConsumeRoll = canConfirmConsumption && Number(roll.weightKg || 0) > 0;
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
          onClick={() => setIssueSelection(buildRawMaterialIssueOptions(selected, roll, [], true))}
        >
          {firstReleaseMode ? "扫码出库" : "机边领料"}
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


      </div>
    );
  })}
</div>
{labelVerification ? (
  <form
    className="raw-material-label-verification"
    onSubmit={async (event) => {
      event.preventDefault();
      if (!labelVerification.matchResult || labelVerification.inboundId !== selected.id) return;
      const result = await onAction?.("确认贴标入库", selected.id, {
        rollId: labelVerification.rollId,
        expectedRevision: labelVerification.expectedRevision,
        expectedLabelVersion: labelVerification.expectedLabelVersion,
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
  <form className="raw-material-label-verification raw-material-issue-selection" onSubmit={async (event) => {
    event.preventDefault();
    const machineId = resolveRawMaterialWholeRollMachine(issueSelection.machineId);
    if (!machineId) return;
    const result = await onAction?.("扫码出库", selected.id, { ...issueSelection, machineId, productionTaskId: "" });
    if (result) setIssueSelection(null);
  }}>
    <strong>整卷出库：{issueSelection.rollId}</strong>
    <span>出库后整卷转为机边，剩余重量仍在机边，不恢复可用库存。</span>
    <label>请选择 1号机 到 9号机
      <select required value={issueSelection.machineId || ""} onChange={(event) => setIssueSelection((current) => ({ ...current, machineId: event.target.value }))}>
        <option value="">请选择机台</option>
        {RAW_MATERIAL_WHOLE_ROLL_MACHINE_LABELS.map((machine) => <option key={machine} value={machine}>{machine}</option>)}
      </select>
    </label>
    <label>说明<textarea value={issueSelection.note || ""} onChange={(event) => setIssueSelection((current) => ({ ...current, note: event.target.value }))} /></label>
    <div className="action-row">
      <button className="primary-action" disabled={issueState.disabled || !resolveRawMaterialWholeRollMachine(issueSelection.machineId)} type="submit">确认整卷出库到机边</button>
      <button onClick={() => setIssueSelection(null)} type="button">取消</button>
    </div>
  </form>
) : null}
</section>
    </>
  );
}
