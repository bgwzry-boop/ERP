import { useEffect, useState } from "react";
import "../../styles/features/office-inbound-flow.css";
import { formatRawMaterialColorDisplay } from "./rawMaterialColorDisplay.js";
import { submitInboundAction } from "./submitInbound.js";
import { getRawMaterialColorValue } from "./RawMaterialInboundWorkbench.jsx";
import { FACTORY_STANDARD_COLORS } from "../../../shared/factoryStandardColors.js";
import { hasStrongRawMaterialSupplierReturnEvidence } from "../../../shared/rawMaterialSupplierReturn.js";
import {
  applyOfficeRollCorrection,
  buildOfficeReviewRows,
  evaluateOfficeInboundCompletion,
  listOfficePrintableRolls,
  officeInboundUsesCountGate,
  officeReviewSubmitBlocker,
  resolveOfficeInboundStep,
} from "../../domain/officeRawMaterialInboundFlow.js";

export function OfficeInboundFlow({
  actionError = "",
  attachState,
  documentDraft,
  exceptionState,
  inbound,
  lineDrafts,
  onAction,
  onCorrectDirection,
  directionCorrecting = false,
  onOpenColorMapping,
  colorMappingState,
  onDocumentDraftChange,
  onException,
  onLineDraftsChange,
  onPrint,
  onReview,
  onVerifyRoll,
  printState,
  reviewState,
  submitting = false,
}) {
  const step = resolveOfficeInboundStep(inbound);
  const rows = buildOfficeReviewRows(inbound, lineDrafts);
  const printableCount = listOfficePrintableRolls(inbound).length;
  const isReturn = inbound?.documentDirection === "supplier_return";
  const directionConflict = hasStrongRawMaterialSupplierReturnEvidence(inbound);
  const [directionError, setDirectionError] = useState("");
  const blockedRow = rows.find((row) => row.blocker);
  const [editingId, setEditingId] = useState("");
  const [stickCount, setStickCount] = useState("");
  const [completing, setCompleting] = useState(false);
  const completion = evaluateOfficeInboundCompletion(inbound, stickCount);
  const countGate = officeInboundUsesCountGate(inbound);

  useEffect(() => {
    setEditingId("");
    setStickCount("");
    setDirectionError("");
  }, [inbound?.id, inbound?.status]);

  async function completeInbound() {
    const decision = evaluateOfficeInboundCompletion(inbound, stickCount);
    if (!decision.allowed || attachState?.disabled || completing) return;
    setCompleting(true);
    try {
      await submitInboundAction(onAction, inbound, "本单已贴齐/一键入库", {
        location: "原料库-可用区",
        verificationNote: "办公室核对已贴张数与卷数一致，本单已贴齐。",
      });
    } finally {
      setCompleting(false);
    }
  }

  function saveCorrection(row, correction) {
    const next = applyOfficeRollCorrection({
      lineDrafts,
      documentDraft,
      row,
      correction,
    });
    onLineDraftsChange?.(next.lineDrafts);
    onDocumentDraftChange?.(next.documentDraft);
    setEditingId("");
  }

  const canEdit = step === "review";
  const reviewBlocker = canEdit ? officeReviewSubmitBlocker(inbound, documentDraft) : "";
  const actionAlert = actionError && actionError !== reviewBlocker ? actionError : "";
  const markedException = String(inbound?.status || "").includes("异常");
  async function correctDirection() {
    if (directionCorrecting || submitting || reviewState?.disabled) return;
    setDirectionError("");
    try {
      const result = await onCorrectDirection?.();
      if (!result?.id || result.documentDirection !== "supplier_return") {
        setDirectionError("服务器尚未确认更正，原草稿仍保留，请重试。");
      }
    } catch (error) {
      setDirectionError(error?.message || "更正失败，请重试。");
    }
  }
  return (
    <section className="office-inbound-flow raw-material-ocr-review-panel" aria-label="办公室收货">
      {canEdit && directionConflict ? <section className="office-direction-conflict" aria-label="退货单方向纠正">
        <strong>原单含退货明细，不能按收货入库</strong>
        <p>请对照原图确认。改为退货后，重量和金额按负数核对，不要求补入库颜色、规格，也不生成入库卷标。</p>
        <button disabled={reviewState?.disabled || directionCorrecting || submitting} onClick={correctDirection} type="button">
          {directionCorrecting ? "正在改为退货单…" : "改为退货单核对"}
        </button>
        {directionError ? <p role="alert">{directionError}</p> : null}
      </section> : null}
      {!directionConflict ? <OfficeRollTable
        canEdit={canEdit}
        isReturn={isReturn}
        onMapColor={onOpenColorMapping ? (row) => onOpenColorMapping({
          supplierName: inbound.supplierName,
          supplierColor: row.supplierColor,
          factoryColor: row.color,
        }) : undefined}
        mappingDisabled={Boolean(colorMappingState?.disabled) || submitting || !inbound.supplierName}
        editingId={editingId}
        onEdit={setEditingId}
        onSave={saveCorrection}
        rows={rows}
      /> : null}
      {canEdit && blockedRow && !directionConflict ? <p className="office-inbound-block" role="status">第 {blockedRow.physicalRollIndex} 卷{blockedRow.blocker}</p> : null}
      {step === "complete" && completion.reason && (stickCount.trim() || !completion.reason.startsWith("先填写")) ? (
        <p className="office-inbound-block" role="status">{completion.reason}</p>
      ) : null}
      {reviewBlocker && !directionConflict ? (
        // Supplier missing: fill it in right here instead of hunting in the OCR section.
        <label className="office-inbound-supplier">
          <span>供应商还没填，填好后就能点「这批都对，去打印」</span>
          <input
            aria-label="供应商"
            onChange={(event) => onDocumentDraftChange?.({ ...(documentDraft || {}), supplierName: event.target.value })}
            placeholder="输入供应商名称"
            value={documentDraft?.supplierName || ""}
          />
        </label>
      ) : null}
      {actionAlert ? <p className="office-inbound-block" role="alert">{actionAlert}</p> : null}
      {markedException && step === "scan" ? <p className="office-inbound-block" role="status">已标记异常。补齐供应商、重量或原图后再重新复核。</p> : null}
      <div className="office-inbound-actions">
        {canEdit ? (
          <>
            <button
              className="primary-action"
              disabled={Boolean(reviewState?.disabled) || submitting || directionCorrecting || Boolean(blockedRow) || Boolean(reviewBlocker) || Boolean(editingId)}
              onClick={() => onReview?.()}
              title={reviewBlocker || reviewState?.title || ""}
              type="button"
            >
              {submitting ? "正在保存…" : directionConflict ? "请先核对退货方向" : isReturn ? "确认退货，不入库" : "这批都对，去打印"}
            </button>
            {isReturn ? null : (
              <button
                disabled={Boolean(exceptionState?.disabled) || submitting}
                onClick={() => {
                  if (onException) onException({ reason: "办公室核对时标记异常。" });
                  else submitInboundAction(onAction, inbound, "标记异常", { reason: "办公室核对时标记异常。" });
                }}
                type="button"
              >
                {submitting ? "正在保存…" : "标记异常"}
              </button>
            )}
          </>
        ) : null}
        {step === "print" ? (
          <button
            className="primary-action"
            disabled={Boolean(printState?.disabled) || !printableCount}
            onClick={onPrint}
            title="一卷一标。打印标签只是待贴标，贴到实物并回办公室核对张数后才入库"
            type="button"
          >
            打印 {printableCount} 张 · 76×130
          </button>
        ) : null}
        {step === "complete" ? (
          <>
            <label className="office-stick-count">
              <span>已贴张数</span>
              <input
                inputMode="numeric"
                min="0"
                onChange={(event) => setStickCount(event.target.value)}
                step="1"
                type="number"
                value={stickCount}
              />
              <em>/{completion.rollCount}</em>
            </label>
            <button
              className="primary-action"
              disabled={Boolean(attachState?.disabled) || !completion.allowed || completing}
              onClick={completeInbound}
              type="button"
            >
              {completing ? "正在入库…" : "确认入库"}
            </button>
          </>
        ) : null}
        {step === "done" ? <span className="office-inbound-done">{isReturn ? "退货单已复核，不入库" : "已入库"}</span> : null}
      </div>
      {step === "complete" && countGate ? (
        <details className="office-inbound-exception">
          <summary>某一卷对不上</summary>
          <div>
            {(inbound.rolls ?? []).map((roll, index) => (
              <button key={roll.id} onClick={() => onVerifyRoll?.(roll)} type="button">
                第 {index + 1} 卷
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function OfficeRollTable({ canEdit, isReturn, editingId, onEdit, onSave, onMapColor, mappingDisabled, rows }) {
  if (!rows.length) return null;
  return (
    <div className="office-roll-table" role="table" aria-label="核对每一卷的颜色、宽幅、公斤">
      <div className="office-roll-head" role="row">
        <span>卷</span>
        <span>颜色</span>
        <span>宽幅</span>
        <span>公斤</span>
        <span />
      </div>
      {rows.map((row) => (
        <div className={row.blocker ? "office-roll-row is-blocked" : "office-roll-row"} key={row.reviewId} role="row">
          <strong>第 {row.physicalRollIndex} 卷</strong>
          <span className="office-roll-fact">
            <i aria-hidden="true" className="raw-material-color-chip" style={{ "--raw-roll-color": getRawMaterialColorValue(row.color) }} />
            <span className="office-roll-color-text">
              {isReturn ? row.color || row.lineDraft?.returnMaterialCategory || row.supplierColor || "原单未写颜色" : formatRawMaterialColorDisplay(row.color, row.supplierColor)}
            </span>
          </span>
          <span className="office-roll-fact">{row.widthCm ? `${formatFactNumber(row.widthCm)}cm` : isReturn ? "原单未写（可留空）" : "宽幅待补"}</span>
          <span className="office-roll-fact">{Number(row.weightKg) ? `${formatFactNumber(row.weightKg)}kg` : "公斤待补"}</span>
          {canEdit && row.lineId ? (
            <button onClick={() => onEdit(editingId === row.reviewId ? "" : row.reviewId)} type="button">
              {editingId === row.reviewId ? "收起" : "改这一卷"}
            </button>
          ) : <span />}
          {editingId === row.reviewId ? (
            <RollEditor isReturn={isReturn} key={row.reviewId} mappingDisabled={mappingDisabled} onMapColor={onMapColor ? () => { onEdit(""); onMapColor(row); } : undefined} onCancel={() => onEdit("")} onSave={(correction) => onSave(row, correction)} row={row} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function RollEditor({ isReturn, mappingDisabled, onMapColor, onCancel, onSave, row }) {
  const [color, setColor] = useState(row.color || "");
  const [widthCm, setWidthCm] = useState(row.widthCm || "");
  const [weightKg, setWeightKg] = useState(row.weightKg || "");
  return (
    <form
      className="office-roll-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ ...(isReturn ? {} : { color }), widthCm, weightKg });
      }}
    >
      {!isReturn ? <label>厂内标准色（厂家：{row.supplierColor || "未识别"}）<select required={!row.supplierColor} onChange={(event) => setColor(event.target.value)} value={color}><option value="">{row.supplierColor ? "暂用厂家票面色，后续统一" : "请选择对应的厂内标准色"}</option>{FACTORY_STANDARD_COLORS.map((name) => <option key={name} value={name}>{name}</option>)}</select></label> : null}
      <label>宽幅 cm<input inputMode="decimal" min="0" onChange={(event) => setWidthCm(event.target.value)} step="0.1" type="number" value={widthCm} /></label>
      <label>公斤<input aria-label="本卷公斤" inputMode="decimal" min={isReturn ? undefined : "0"} max={isReturn ? "-0.001" : undefined} onChange={(event) => setWeightKg(event.target.value)} step="0.001" type="number" value={weightKg} /></label>
      <div>
        {!isReturn && onMapColor && row.supplierColor ? <button disabled={mappingDisabled} onClick={onMapColor} type="button">维护厂家颜色对应</button> : null}
        <button className="primary-action" type="submit">保存这一卷</button>
        <button onClick={onCancel} type="button">取消</button>
      </div>
    </form>
  );
}

function formatFactNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return Number.isInteger(number) ? String(number) : String(number);
}
