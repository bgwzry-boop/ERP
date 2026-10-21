import { useEffect, useState } from "react";
import { submitInboundAction } from "./submitInbound.js";
import { getRawMaterialColorValue } from "./RawMaterialInboundWorkbench.jsx";
import {
  OFFICE_INBOUND_STEPS,
  applyOfficeRollCorrection,
  buildOfficeMatchedAttachPayload,
  buildOfficeReviewRows,
  evaluateOfficeInboundCompletion,
  listOfficePrintableRolls,
  officeInboundUsesCountGate,
  resolveOfficeInboundStep,
} from "../../domain/officeRawMaterialInboundFlow.js";

export function OfficeInboundFlow({
  attachState,
  documentDraft,
  exceptionState,
  inbound,
  lineDrafts,
  onAction,
  onDocumentDraftChange,
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
  const blockedRow = rows.find((row) => row.blocker);
  const [editingId, setEditingId] = useState("");
  const [stickCount, setStickCount] = useState("");
  const [completing, setCompleting] = useState(false);
  const completion = evaluateOfficeInboundCompletion(inbound, stickCount);
  const countGate = officeInboundUsesCountGate(inbound);

  useEffect(() => {
    setEditingId("");
    setStickCount("");
  }, [inbound?.id, inbound?.status]);

  async function completeInbound() {
    const decision = evaluateOfficeInboundCompletion(inbound, stickCount);
    if (!decision.allowed || attachState?.disabled || completing) return;
    setCompleting(true);
    try {
      let current = inbound;
      for (const roll of decision.pending) {
        const saved = await submitInboundAction(onAction, current, "确认贴标入库", buildOfficeMatchedAttachPayload(current, roll));
        if (!saved?.id) return;
        current = saved;
      }
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

  return (
    <section className="office-inbound-flow raw-material-ocr-review-panel" aria-label="办公室收货">
      <ol className="office-inbound-steps">
        {OFFICE_INBOUND_STEPS.map((item, index) => (
          <li aria-current={item.key === step ? "step" : undefined} key={item.key}>
            <span>{index + 1}</span>
            {item.label}
          </li>
        ))}
      </ol>

      {step === "scan" ? (
        <p className="office-inbound-lead">用上面的扫描或上传。识别只填草稿，不会入库。</p>
      ) : null}

      {step === "review" ? (
        <>
          <div className="office-inbound-lead">
            <strong>核对每一卷的颜色、宽幅、公斤</strong>
            <span>对的不用点。只有看错的卷才改。</span>
          </div>
          <OfficeRollTable
            editingId={editingId}
            onEdit={setEditingId}
            onSave={saveCorrection}
            rows={rows}
          />
          {blockedRow ? <p className="office-inbound-block" role="status">第 {blockedRow.physicalRollIndex} 卷{blockedRow.blocker}，先改这一卷。</p> : null}
          <div className="office-inbound-actions">
            <button
              className="primary-action"
              disabled={Boolean(reviewState?.disabled) || submitting || Boolean(blockedRow) || Boolean(editingId)}
              onClick={onReview}
              type="button"
            >
              {submitting ? "正在保存…" : isReturn ? "确认退货，不入库" : "这批都对，去打印"}
            </button>
            {isReturn ? null : (
              <button
                disabled={Boolean(exceptionState?.disabled)}
                onClick={() => submitInboundAction(onAction, inbound, "标记异常", { reason: "办公室核对时标记异常。" })}
                type="button"
              >
                标记异常
              </button>
            )}
          </div>
        </>
      ) : null}

      {step === "print" ? (
        <>
          <div className="office-inbound-lead">
            <strong>打印 {printableCount} 张卷标</strong>
            <span>一卷一标，用 76×130 面单纸。打完拿到院子，按颜色、宽幅、公斤贴上。</span>
          </div>
          <div className="office-inbound-actions">
            <button
              className="primary-action"
              disabled={Boolean(printState?.disabled) || !printableCount}
              onClick={onPrint}
              title="打印标签只是待贴标，贴到实物并回办公室核对张数后才入库"
              type="button"
            >
              打印 {printableCount} 张卷标
            </button>
          </div>
        </>
      ) : null}

      {step === "complete" ? (
        <>
          <div className="office-inbound-lead">
            <strong>回办公室，核对贴上的张数</strong>
            <span>这单 {completion.rollCount} 卷。张数一样才能一次入库。</span>
          </div>
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
          </label>
          {completion.reason && (stickCount.trim() || !completion.reason.startsWith("先填写")) ? <p className="office-inbound-block" role="status">{completion.reason}</p> : null}
          <div className="office-inbound-actions">
            <button
              className="primary-action"
              disabled={Boolean(attachState?.disabled) || !completion.allowed || completing}
              onClick={completeInbound}
              type="button"
            >
              {completing ? "正在入库…" : "确认入库"}
            </button>
          </div>
          {countGate ? (
            <details className="office-inbound-exception">
              <summary>某一卷对不上</summary>
              <div>
                {(inbound.rolls ?? []).map((roll, index) => (
                  <button key={roll.id} onClick={() => onVerifyRoll?.(roll)} type="button">
                    第 {index + 1} 卷对不上
                  </button>
                ))}
              </div>
            </details>
          ) : null}
        </>
      ) : null}

      {step === "done" ? <p className="office-inbound-lead">这单已经入库，卷料在库存里。</p> : null}
    </section>
  );
}

function OfficeRollTable({ editingId, onEdit, onSave, rows }) {
  if (!rows.length) return <p className="office-inbound-lead">还没有卷。先扫描或上传送货单。</p>;
  return (
    <div className="office-roll-table" role="table" aria-label="逐卷颜色宽幅公斤">
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
            {row.color || "颜色待补"}
          </span>
          <span className="office-roll-fact">{row.widthCm ? `${formatFactNumber(row.widthCm)}cm` : "宽幅待补"}</span>
          <span className="office-roll-fact">{Number(row.weightKg) ? `${formatFactNumber(row.weightKg)}kg` : "公斤待补"}</span>
          {row.lineId ? (
            <button onClick={() => onEdit(editingId === row.reviewId ? "" : row.reviewId)} type="button">
              {editingId === row.reviewId ? "收起" : "改这一卷"}
            </button>
          ) : <span />}
          {editingId === row.reviewId ? (
            <RollEditor key={row.reviewId} onCancel={() => onEdit("")} onSave={(correction) => onSave(row, correction)} row={row} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function RollEditor({ onCancel, onSave, row }) {
  const [color, setColor] = useState(row.color || "");
  const [widthCm, setWidthCm] = useState(row.widthCm || "");
  const [weightKg, setWeightKg] = useState(row.weightKg || "");
  return (
    <form
      className="office-roll-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ color, widthCm, weightKg });
      }}
    >
      <label>颜色<input onChange={(event) => setColor(event.target.value)} value={color} /></label>
      <label>宽幅 cm<input inputMode="decimal" min="0" onChange={(event) => setWidthCm(event.target.value)} step="0.1" type="number" value={widthCm} /></label>
      <label>公斤<input aria-label="本卷公斤" inputMode="decimal" min="0" onChange={(event) => setWeightKg(event.target.value)} step="0.001" type="number" value={weightKg} /></label>
      <div>
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
