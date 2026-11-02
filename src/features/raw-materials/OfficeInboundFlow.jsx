import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../styles/features/office-inbound-flow.css";
import { RawMaterialColorDisplay } from "./RawMaterialColorDisplay.jsx";
import { formatRawMaterialColorDisplay } from "./rawMaterialColorDisplay.js";
import { submitInboundAction } from "./submitInbound.js";
import { getRawMaterialColorValue } from "./RawMaterialInboundWorkbench.jsx";
import { FACTORY_STANDARD_COLORS } from "../../../shared/factoryStandardColors.js";
import { hasStrongRawMaterialSupplierReturnEvidence, hasAmbiguousRawMaterialSupplierReturnEvidence, RAW_MATERIAL_MIXED_DIRECTION_MESSAGE } from "../../../shared/rawMaterialSupplierReturn.js";
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
  actionDock = null,
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
  const ambiguousDirection = hasAmbiguousRawMaterialSupplierReturnEvidence(inbound);
  const [directionError, setDirectionError] = useState("");
  const blockedRow = rows.find((row) => row.blocker);
  const [editingId, setEditingId] = useState("");
  const [completing, setCompleting] = useState(false);
  const completion = evaluateOfficeInboundCompletion(inbound);
  const countGate = officeInboundUsesCountGate(inbound);

  useEffect(() => {
    setEditingId("");
    setDirectionError("");
  }, [inbound?.id, inbound?.status]);

  async function completeInbound() {
    const decision = evaluateOfficeInboundCompletion(inbound);
    if (!decision.allowed || attachState?.disabled || completing) return;
    setCompleting(true);
    try {
      await submitInboundAction(onAction, inbound, "本单已贴齐/一键入库", {
        location: "原料库-可用区",
        verificationNote: "办公室确认本单已贴齐，一键入库。",
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
  const actionControls = (
    <div className="office-inbound-actions">
        {canEdit ? (
          <>
            <button
              className="primary-action"
              disabled={Boolean(reviewState?.disabled) || submitting || directionCorrecting || Boolean(blockedRow) || Boolean(reviewBlocker) || Boolean(editingId)}
              onClick={() => onReview?.()}
              title={blockedRow ? `第 ${blockedRow.physicalRollIndex} 卷${blockedRow.blocker}` : reviewBlocker || reviewState?.title || ""}
              type="button"
            >
              {submitting ? "正在保存…" : ambiguousDirection ? "请先核对混合方向" : directionConflict ? "请先核对退货方向" : isReturn ? "确认退货，不入库" : "这批都对，去打印"}
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
            title="一卷一标。打印标签只是待贴标，回办公室确认整单已贴齐后才入库"
            type="button"
          >
            打印 {printableCount} 张 · 76×130
          </button>
        ) : null}
        {step === "complete" ? (
          <>
            <p className="office-inbound-note">不用填已贴张数。这一下表示整单标签都已贴上，不是按识别出来的行数入库。</p>
            <button
              className="primary-action"
              disabled={Boolean(attachState?.disabled) || !completion.allowed || completing}
              onClick={completeInbound}
              type="button"
            >
              {completing ? "正在入库…" : "本单已贴齐/一键入库"}
            </button>
          </>
        ) : null}
        {step === "done" ? <span className="office-inbound-done">{isReturn ? "退货单已复核，不入库" : "已入库"}</span> : null}
      </div>
  );
  return (
    <section className="office-inbound-flow raw-material-ocr-review-panel" aria-label="办公室收货">
      {canEdit && ambiguousDirection ? <p className="office-inbound-block" role="alert">{RAW_MATERIAL_MIXED_DIRECTION_MESSAGE}</p> : null}
      {canEdit && directionConflict ? <section className="office-direction-conflict" aria-label="退货单方向纠正">
        <strong>原单含退货明细，不能按收货入库</strong>
        <p>请对照原图确认。改为退货后，重量和金额按负数核对，不要求补入库颜色、规格，也不生成入库卷标。</p>
        <button disabled={reviewState?.disabled || directionCorrecting || submitting} onClick={correctDirection} type="button">
          {directionCorrecting ? "正在改为退货单…" : "改为退货单核对"}
        </button>
        {directionError ? <p role="alert">{directionError}</p> : null}
      </section> : null}
      {!directionConflict && !ambiguousDirection ? <OfficeRollTable
        canEdit={canEdit}
        editingDisabled={submitting || Boolean(reviewState?.disabled)}
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
      {!directionConflict && !ambiguousDirection && rows.length ? <div className="office-roll-summary"><span>本页明细 <strong>{rows.length}</strong> {isReturn ? "项" : "卷"} · <strong>{formatFactNumber(Math.round(rows.reduce((total, row) => total + (Number(row.weightKg) || 0), 0) * 1000) / 1000)}</strong> kg</span><span>原单总重 {inbound.totalWeightKg == null ? "待确认" : `${formatFactNumber(inbound.totalWeightKg)} kg`}</span></div> : null}
      {canEdit && blockedRow && !directionConflict ? <div className="office-inbound-block office-inbound-block-locate" role="status"><span>第 {blockedRow.physicalRollIndex} 卷{blockedRow.blocker}{!blockedRow.lineId ? "。该历史卷缺少可编辑的识别明细，需先核实并维护原始逐卷资料。" : ""}</span>{blockedRow.lineId ? <button disabled={submitting || Boolean(reviewState?.disabled)} onClick={() => setEditingId(blockedRow.reviewId)} type="button">定位第 {blockedRow.physicalRollIndex} 卷</button> : null}</div> : null}
      {step === "complete" && completion.reason ? (
        <p className="office-inbound-block" role="status">{completion.reason}</p>
      ) : null}
      {reviewBlocker && !directionConflict && !ambiguousDirection ? (
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
      {actionDock ? createPortal(actionControls, actionDock) : actionControls}
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

function OfficeRollTable({ canEdit, isReturn, editingDisabled, editingId, onEdit, onSave, onMapColor, mappingDisabled, rows }) {
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
            <i aria-hidden="true" className="raw-material-color-chip" style={{ "--raw-roll-color": getRawMaterialColorValue(row.color, row.supplierColor) }} />
            <span className="office-roll-color-text" title={isReturn ? undefined : formatRawMaterialColorDisplay(row.color, row.supplierColor)}>
              {isReturn ? row.color || row.lineDraft?.returnMaterialCategory || row.supplierColor || "原单未写颜色" : <RawMaterialColorDisplay factoryColor={row.color} supplierColor={row.supplierColor} />}
            </span>
          </span>
          <span className="office-roll-fact">{row.widthCm ? `${formatFactNumber(row.widthCm)}cm` : isReturn ? "原单未写（可留空）" : "宽幅待补"}</span>
          <span className="office-roll-fact">{Number(row.weightKg) ? `${formatFactNumber(row.weightKg)}kg` : "公斤待补"}</span>
          {canEdit && row.lineId ? (
            <button disabled={editingDisabled} onClick={() => onEdit(editingId === row.reviewId ? "" : row.reviewId)} type="button">
              {editingId === row.reviewId ? "收起" : !isReturn && !row.color && !row.supplierColor ? "补颜色" : "改这一卷"}
            </button>
          ) : <span />}
          {editingId === row.reviewId ? (
            <RollEditor disabled={editingDisabled} isReturn={isReturn} key={row.reviewId} mappingDisabled={mappingDisabled} onMapColor={onMapColor ? () => { onEdit(""); onMapColor(row); } : undefined} onCancel={() => onEdit("")} onSave={(correction) => onSave(row, correction)} row={row} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function RollEditor({ disabled, isReturn, mappingDisabled, onMapColor, onCancel, onSave, row }) {
  const [color, setColor] = useState(row.color || "");
  const [supplierColor, setSupplierColor] = useState(row.supplierColor || "");
  const [widthCm, setWidthCm] = useState(row.widthCm || "");
  const [weightKg, setWeightKg] = useState(row.weightKg || "");
  const editorRef = useRef(null);
  const supplierChanged = supplierColor.trim() !== String(row.supplierColor || "").trim();
  useEffect(() => {
    editorRef.current?.scrollIntoView({ block: "nearest" });
    editorRef.current?.querySelector("input")?.focus({ preventScroll: true });
  }, []);
  return (
    <form
      className="office-roll-editor"
      ref={editorRef}
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        onSave({ ...(isReturn ? {} : { color, supplierColor }), widthCm, weightKg });
      }}
    >
      {!isReturn ? <label>厂家票面颜色<input aria-label={`第 ${row.physicalRollIndex} 卷厂家票面颜色`} disabled={disabled} onChange={(event) => { setSupplierColor(event.target.value); setColor(""); }} placeholder="照原单填写颜色" required={!color} value={supplierColor} /></label> : null}
      <label>宽幅 cm<input disabled={disabled} inputMode="decimal" min={isReturn ? "0" : "0.1"} onChange={(event) => setWidthCm(event.target.value)} required={!isReturn} step="0.1" type="number" value={widthCm} /></label>
      <label>公斤<input aria-label="本卷公斤" disabled={disabled} inputMode="decimal" min={isReturn ? undefined : "0.001"} max={isReturn ? "-0.001" : undefined} onChange={(event) => setWeightKg(event.target.value)} required step="0.001" type="number" value={weightKg} /></label>
      {!isReturn ? <label className="office-roll-standard-color">厂内标准色（可待统一）<select disabled={disabled || supplierChanged} onChange={(event) => setColor(event.target.value)} value={color}><option value="">暂用厂家票面色</option>{FACTORY_STANDARD_COLORS.map((name) => <option key={name} value={name}>{name}</option>)}</select></label> : null}
      <p className="office-roll-editor-help">{supplierChanged ? "票面色更改后，原厂内色对应暂不沿用。" : "本页修改将在下方统一复核时提交。"}{row.lineRollCount > 1 ? `此识别行的 ${row.lineRollCount} 卷共用颜色和宽幅，公斤仅修改本卷。` : ""}</p>
      <div className="office-roll-editor-actions">
        {!isReturn && onMapColor && row.supplierColor ? <button disabled={mappingDisabled || supplierChanged} onClick={onMapColor} type="button">维护厂家颜色对应</button> : null}
        <button className="primary-action" disabled={disabled} type="submit">保存这一卷</button>
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
