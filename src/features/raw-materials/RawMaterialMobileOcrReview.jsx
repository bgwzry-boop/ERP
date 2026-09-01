import {
  ArrowLeftOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  CheckCircleFilled,
  CloseOutlined,
  FileImageOutlined,
  PrinterOutlined,
  TagOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { downloadOfficeAttachmentContent } from "../../services/officeAttachmentApiClient.js";
import { RAW_MATERIAL_OCR_NORMALIZED_MAX_EDGE } from "../../services/rawMaterialDeliveryNoteImageClient.js";
import demoDeliveryNoteUrl from "../../assets/raw-material-delivery-note-sample.jpg";
import { attachmentUploadLimits } from "../../../shared/attachmentUploadPolicy.js";
import {
  formatRawMaterialMobileSpec,
} from "../../../shared/rawMaterialSpec.js";
import {
  hasReviewableRawMaterialSpec,
  projectRawMaterialOcrPhysicalRollReviewRows,
} from "../../../shared/rawMaterialOcrLineReview.js";
import {
  isRawMaterialFactoryColor,
  RAW_MATERIAL_FACTORY_COLORS,
} from "../../../shared/rawMaterialFactoryColors.js";
import {
  normalizeRawMaterialOcrAngle,
  orientRawMaterialOcrSourceBounds,
  resolveRawMaterialOcrSourceFrame,
  shouldRotateRawMaterialSourcePreview,
  tightenRawMaterialOcrSourceRowBounds,
} from "../../../shared/rawMaterialOcrSourceCrop.js";

const REVIEW_STEPS = [
  ["拍单", CameraOutlined],
  ["核对", CheckCircleOutlined],
  ["打印", PrinterOutlined],
  ["贴标", TagOutlined],
];

const RETURN_REVIEW_STEPS = [
  ["拍单", CameraOutlined],
  ["核对", CheckCircleOutlined],
  ["完成", CheckCircleOutlined],
];

const DEMO_SOURCE_INBOUND_IDS = new Set(["RMI-260704-001", "RMI-0704-001"]);
const EMPTY_SOURCE_PREVIEW_URLS = [];

const PRIMARY_ROLL_FIELDS = [
  ["spec", "规格 / 宽幅", "text", "例如：78×70×2000"],
  ["weightKg", "本卷重量 kg", "number", "0"],
];

const SOURCE_LINE_FIELDS = [
  ["rollCount", "厂家行卷数（用于拆分）", "number"],
  ["totalWeightKg", "厂家行总重 kg（不进入卷标）", "number"],
  ["productName", "品名", "text"],
  ["materialType", "材料", "text"],
  ["unit", "单位", "text"],
  ["supplierRollNo", "供应商卷号", "text"],
  ["unitPrice", "单价", "number"],
  ["amount", "金额", "number"],
];

export function RawMaterialMobileOcrReview({
  authState,
  disabled = false,
  documentDraft = {},
  lineDrafts = {},
  onBack,
  onDocumentFieldChange,
  onLineFieldChange,
  onSubmit,
  operatorId,
  selected,
  sourcePreviewDataUrls = EMPTY_SOURCE_PREVIEW_URLS,
  submitError = "",
  submitting = false,
}) {
  const lines = selected?.ocrLines ?? [];
  const documentDirection = selected?.documentDirection || "supplier_delivery";
  const isSupplierReturn = documentDirection === "supplier_return";
  const [expandedLineId, setExpandedLineId] = useState("");
  const [reviewedRollIds, setReviewedRollIds] = useState([]);
  const [excludedRolls, setExcludedRolls] = useState([]);
  const [pendingExclusion, setPendingExclusion] = useState(null);
  const documentDetailsRef = useRef(null);
  const demoSourcePreviewUrl = DEMO_SOURCE_INBOUND_IDS.has(selected?.id) ? demoDeliveryNoteUrl : "";
  const [sourcePreviews, setSourcePreviews] = useState([]);
  const [activeSourcePageIndex, setActiveSourcePageIndex] = useState(0);
  const [sourcePreviewError, setSourcePreviewError] = useState("");
  const [sourcePreviewOpen, setSourcePreviewOpen] = useState(false);
  const sourcePreview = sourcePreviews[activeSourcePageIndex] ?? sourcePreviews[0] ?? null;
  const sourcePreviewUrl = sourcePreview?.url ?? "";

  useEffect(() => {
    setExpandedLineId("");
    setReviewedRollIds([]);
    setExcludedRolls([]);
    setPendingExclusion(null);
    setSourcePreviewOpen(false);
    setActiveSourcePageIndex(0);
  }, [selected?.id]);

  useEffect(() => {
    let disposed = false;
    const objectUrls = [];
    setSourcePreviewError("");
    setSourcePreviews([]);
    async function buildOrientedSource(url, sourceFileSize = 0, sourcePageIndex = 0) {
      const pageMeta = getOcrPageMeta(selected, sourcePageIndex);
      const pageLines = (selected?.ocrLines ?? []).filter((line) => getLineSourcePageIndex(line) === sourcePageIndex);
      const oriented = await orientRawMaterialSourcePreview(url, pageMeta.angle, {
        lines: pageLines,
        normalizedBinaryBytes: attachmentUploadLimits.rawMaterialOcrBinaryBytes,
        normalizedMaxEdge: RAW_MATERIAL_OCR_NORMALIZED_MAX_EDGE,
        ocrImageHeight: pageMeta.imageHeight,
        ocrImageWidth: pageMeta.imageWidth,
        sourceFileSize,
      });
      if (disposed) {
        if (oriented.revoke) URL.revokeObjectURL(oriented.url);
        return null;
      }
      if (oriented.revoke) objectUrls.push(oriented.url);
      return { ...oriented, sourcePageIndex };
    }
    async function loadSourcePreviews() {
      const inlineUrls = normalizeSourcePreviewUrls(sourcePreviewDataUrls);
      if (inlineUrls.length) {
        const previews = await Promise.all(inlineUrls.map((url, sourcePageIndex) => (
          buildOrientedSource(url, getDataUrlByteLength(url), sourcePageIndex)
        )));
        if (!disposed) setSourcePreviews(previews.filter(Boolean));
        return;
      }
      const attachmentIds = getSourceAttachmentIds(selected);
      if (!attachmentIds.length) {
        const preview = await buildOrientedSource(demoSourcePreviewUrl, 0, 0);
        if (!disposed && preview) setSourcePreviews([preview]);
        return;
      }
      const previews = [];
      for (const [sourcePageIndex, attachmentId] of attachmentIds.entries()) {
        const result = await downloadOfficeAttachmentContent({ attachmentId, authState, operatorId });
        if (disposed) return;
        if (result.blocked || (!result.contentBlob && !result.content)) {
          previews.push({ error: true, sourcePageIndex, sourceCoordinateFrame: null, url: "" });
          continue;
        }
        if (result.contentBlob && typeof URL?.createObjectURL === "function") {
          const downloadedObjectUrl = URL.createObjectURL(result.contentBlob);
          objectUrls.push(downloadedObjectUrl);
          previews.push(await buildOrientedSource(downloadedObjectUrl, result.contentBlob.size, sourcePageIndex));
        } else {
          previews.push(await buildOrientedSource(result.content || "", getDataUrlByteLength(result.content), sourcePageIndex));
        }
      }
      if (!disposed) {
        setSourcePreviews(previews);
        if (previews.some((preview) => preview?.error)) setSourcePreviewError("部分原单页面暂时无法打开");
      }
    }
    void loadSourcePreviews();
    return () => {
      disposed = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [authState, demoSourcePreviewUrl, operatorId, selected?.id, sourcePreviewDataUrls]);

  const reviewRolls = useMemo(
    () => projectRawMaterialOcrPhysicalRollReviewRows({ lines, lineDrafts, documentDirection }),
    [documentDirection, lineDrafts, lines],
  );
  const excludedReviewIds = useMemo(() => new Set(excludedRolls.map((entry) => entry.reviewId)), [excludedRolls]);
  const activeReviewRolls = useMemo(
    () => reviewRolls.filter((roll) => !excludedReviewIds.has(roll.reviewId)),
    [excludedReviewIds, reviewRolls],
  );
  const totalRollCount = activeReviewRolls.length;
  const totalWeightKg = useMemo(() => lines.reduce((total, line) => {
    if (!activeReviewRolls.some((roll) => roll.lineId === line.lineId)) return total;
    const draft = lineDrafts[line.lineId] ?? line.values ?? {};
    const weight = Number(draft.totalWeightKg);
    return total + (Number.isFinite(weight) && Math.abs(weight) > 0 ? weight : 0);
  }, 0), [activeReviewRolls, lineDrafts, lines]);

  if (!lines.length) {
    return (
      <section className="raw-material-mobile-ocr-review" aria-label={isSupplierReturn ? "退货逐件核对" : "全部卷料核对"}>
        <MobileReviewHeader isSupplierReturn={isSupplierReturn} onBack={onBack} />
        <div className="raw-material-mobile-review-empty" role="alert">
          <strong>没有可核对的{isSupplierReturn ? "退货" : "卷料"}明细</strong>
          <span>请返回重新拍摄完整{isSupplierReturn ? "退货单" : "送货单"}，当前草稿不能确认。</span>
        </div>
      </section>
    );
  }

  const reviewedCount = reviewedRollIds.filter((reviewId) => activeReviewRolls.some((roll) => roll.reviewId === reviewId)).length;
  const documentBlockers = getMobileOcrDocumentBlockers(selected?.ocrReviewFields, documentDraft);
  const allReviewed = activeReviewRolls.length > 0 && reviewedCount === activeReviewRolls.length;
  const canSubmit = allReviewed && documentBlockers.length === 0;

  function updateLineField(lineId, key, value) {
    setReviewedRollIds((current) => current.filter((reviewId) => !reviewId.startsWith(`${lineId}:`)));
    onLineFieldChange?.(lineId, key, value);
  }

  function updateRollWeight(roll, value) {
    const currentWeights = normalizeRollWeightsInput(roll.lineDraft.rollWeightsKg, roll.lineRollCount);
    currentWeights[roll.lineRollIndex] = value;
    updateLineField(roll.lineId, "rollWeightsKg", currentWeights);
    if (roll.lineRollCount === 1) onLineFieldChange?.(roll.lineId, "totalWeightKg", value);
  }

  function confirmRoll(roll) {
    if (getMobileOcrRollBlockers(roll, { documentDirection }).length) return;
    setReviewedRollIds((current) => current.includes(roll.reviewId) ? current : [...current, roll.reviewId]);
    setExpandedLineId("");
  }

  function openRollEditor(roll) {
    const currentSpec = String(roll.spec || "").trim();
    const suggestedSpec = String(roll.line?.reviewPrefill?.spec || "").trim();
    const displaySpec = hasReviewableRawMaterialSpec(currentSpec) ? formatRawMaterialMobileSpec(currentSpec) : suggestedSpec;
    if (displaySpec && displaySpec !== currentSpec) updateLineField(roll.lineId, "spec", displaySpec);
    setActiveSourcePageIndex(getLineSourcePageIndex(roll.line));
    setExpandedLineId(roll.reviewId);
  }

  function openDocumentDetails() {
    if (!documentDetailsRef.current) return;
    documentDetailsRef.current.open = true;
    documentDetailsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function syncDocumentSummary(nextExcludedRolls) {
    const excludedIds = new Set(nextExcludedRolls.map((entry) => entry.reviewId));
    const activeRolls = reviewRolls.filter((roll) => !excludedIds.has(roll.reviewId));
    const activeLineIds = new Set(activeRolls.map((roll) => roll.lineId));
    const activeLines = lines.filter((line) => activeLineIds.has(line.lineId));
    const totalWeight = activeLines.reduce((total, line) => total + (Number(lineDrafts[line.lineId]?.totalWeightKg ?? line.values?.totalWeightKg) || 0), 0);
    const totalAmount = activeLines.reduce((total, line) => total + (Number(lineDrafts[line.lineId]?.amount ?? line.values?.amount) || 0), 0);
    onDocumentFieldChange?.("rollCount", activeRolls.length);
    if (Math.abs(Number(documentDraft.totalWeightKg)) > 0) onDocumentFieldChange?.("totalWeightKg", roundReviewNumber(totalWeight, 3));
    if (Math.abs(Number(documentDraft.amount)) > 0) onDocumentFieldChange?.("amount", roundReviewNumber(totalAmount, 2));
  }

  function excludePendingRoll() {
    if (!pendingExclusion) return;
    const exclusion = {
      reviewId: pendingExclusion.reviewId,
      lineId: pendingExclusion.lineId,
      lineRollIndex: pendingExclusion.lineRollIndex,
      reason: `OCR误识别；原${isSupplierReturn ? "退货单" : "送货单"}和现场实物均无此${isSupplierReturn ? "件" : "卷"}。`,
    };
    const nextExcludedRolls = [...excludedRolls.filter((entry) => entry.reviewId !== exclusion.reviewId), exclusion];
    setExcludedRolls(nextExcludedRolls);
    setReviewedRollIds((current) => current.filter((reviewId) => reviewId !== exclusion.reviewId));
    setExpandedLineId("");
    setPendingExclusion(null);
    syncDocumentSummary(nextExcludedRolls);
  }

  function undoLastExclusion() {
    const nextExcludedRolls = excludedRolls.slice(0, -1);
    const restored = excludedRolls.at(-1);
    setExcludedRolls(nextExcludedRolls);
    setExpandedLineId(restored?.reviewId ?? "");
    syncDocumentSummary(nextExcludedRolls);
  }

  return (
    <section aria-busy={submitting} className="raw-material-mobile-ocr-review" aria-label={isSupplierReturn ? "退货逐件核对" : "全部卷料核对"}>
      <MobileReviewHeader isSupplierReturn={isSupplierReturn} onBack={onBack} />
      <MobileReviewProgress isSupplierReturn={isSupplierReturn} />

      <section className="raw-material-mobile-delivery-note" aria-label={isSupplierReturn ? "原退货单" : "原送货单"}>
        <header>
          <div>
            <strong>{isSupplierReturn ? "原退货单" : "原送货单"}</strong>
            <span>{formatDeliveryNoteMeta(selected)}</span>
          </div>
          <button disabled={!sourcePreviewUrl} onClick={() => setSourcePreviewOpen(true)} type="button">
            {sourcePreviewError || (sourcePreviewUrl ? "放大查看" : "原单读取中")}
          </button>
        </header>
        {sourcePreviews.length > 1 ? (
          <nav className="raw-material-mobile-source-pages" aria-label="送货单页码">
            {sourcePreviews.map((preview, index) => (
              <button
                aria-current={activeSourcePageIndex === index ? "page" : undefined}
                className={activeSourcePageIndex === index ? "is-active" : ""}
                disabled={!preview.url}
                key={preview.sourcePageIndex}
                onClick={() => setActiveSourcePageIndex(index)}
                type="button"
              >第 {index + 1} 页</button>
            ))}
          </nav>
        ) : null}
        <button
          className={`raw-material-mobile-source-preview ${sourcePreviewUrl ? "has-image" : ""}`}
          disabled={!sourcePreviewUrl}
          onClick={() => setSourcePreviewOpen(true)}
          type="button"
        >
          <span className="raw-material-mobile-source-image">
            {sourcePreviewUrl ? <img alt={`${isSupplierReturn ? "退货单" : "送货单"}原单预览`} src={sourcePreviewUrl} /> : <FileImageOutlined aria-hidden="true" />}
          </span>
        </button>
      </section>

      <section className="raw-material-mobile-review-overview" aria-label="逐卷核对">
        {excludedRolls.length ? (
          <div className="raw-material-mobile-review-undo" role="status">
            <span>已删除 {excludedRolls.length} 条 OCR 误识别{isSupplierReturn ? "，不会计入退货复核" : "，不会生成卷标"}</span>
            <button onClick={undoLastExclusion} type="button">撤销</button>
          </div>
        ) : null}
        <header>
          <h2>{isSupplierReturn ? "退回" : "识别到"} {totalRollCount || lines.length} {isSupplierReturn ? "件" : "卷"}，共 {formatWeight(totalWeightKg, true)}</h2>
          <span>已确认 {reviewedCount}/{reviewRolls.length}</span>
        </header>
        <div className="raw-material-mobile-review-list" role="list">
          {activeReviewRolls.map((roll, index) => {
            const sourcePageIndex = getLineSourcePageIndex(roll.line);
            const rollSourcePreview = sourcePreviews[sourcePageIndex] ?? null;
            const sourcePageLines = lines.filter((line) => getLineSourcePageIndex(line) === sourcePageIndex);
            const sourcePageLineIndex = sourcePageLines.findIndex((line) => line.lineId === roll.lineId);
            const blockers = getMobileOcrRollBlockers(roll, { documentDirection });
            const reviewed = reviewedRollIds.includes(roll.reviewId);
            const expanded = expandedLineId === roll.reviewId;
            const supplierColor = String(roll.supplierColor || "").trim();
            const color = String((isSupplierReturn ? supplierColor : roll.factoryColor) || "").trim();
            const spec = String(roll.spec || "").trim();
            const specReady = hasReviewableRawMaterialSpec(spec);
            const recognizedSpecValues = roll.line?.values ?? {};
            const recognizedSpecDisplay = String(recognizedSpecValues.specDisplay || "").trim();
            const specDisplay = specReady
              ? formatRawMaterialMobileSpec(spec)
              : recognizedSpecDisplay || formatRawMaterialMobileSpec(spec) || (isSupplierReturn ? "原单未写规格" : "规格没看清");
            const weight = Number(roll.weightKg);
            const statusLabel = reviewed ? "已确认" : blockers.length ? getRollBlockerStatus(blockers) : "待确认";
            const actionLabel = expanded ? "收起" : reviewed ? "修改" : blockers.length ? "补全" : "修改";
            return (
              <article className={`${blockers.length ? "has-blocker" : ""} ${reviewed ? "is-reviewed" : ""}`} key={roll.reviewId} role="listitem">
                <div className="raw-material-mobile-review-evidence-row">
                  <span className="raw-material-mobile-review-line-number">{index + 1}</span>
                  <SourceLineEvidence
                    index={sourcePageLineIndex < 0 ? roll.sourceLineIndex : sourcePageLineIndex}
                    line={roll.line}
                    lineCount={sourcePageLines.length || lines.length}
                    nextLine={sourcePageLines[sourcePageLineIndex + 1]}
                    ocrAngle={getOcrPageMeta(selected, sourcePageIndex).angle}
                    rollInLine={roll.lineRollIndex + 1}
                    rollsInLine={roll.lineRollCount}
                    sourceCoordinateFrame={rollSourcePreview?.sourceCoordinateFrame}
                    sourcePreviewUrl={rollSourcePreview?.url ?? ""}
                  />
                </div>

                <div className="raw-material-mobile-review-line-summary">
                  <span className="raw-material-mobile-review-color" style={{ "--roll-color": getRollColor(color) }} aria-hidden="true" />
                  <span className="line-color">{color || "颜色待补"}</span>
                  <span className={`line-spec ${!specReady && !isSupplierReturn ? "has-blocker" : ""}`}>{specDisplay}</span>
                  <span className="line-weight">{Math.abs(weight) > 0 ? formatWeight(weight, true) : `本${isSupplierReturn ? "件" : "卷"}重量待补`}</span>
                  <em className={`line-status ${reviewed ? "is-reviewed" : blockers.length ? "has-blocker" : ""}`}>
                    {reviewed ? <CheckCircleFilled aria-hidden="true" /> : null}{statusLabel}
                  </em>
                  <span className="line-actions">
                    {!reviewed && !blockers.length ? (
                      <button className="line-confirm" onClick={() => confirmRoll(roll)} type="button">核对正确</button>
                    ) : null}
                    <button
                      aria-expanded={expanded}
                      className="line-edit"
                      onClick={() => expanded ? setExpandedLineId("") : openRollEditor(roll)}
                      type="button"
                    >
                      {actionLabel}
                    </button>
                  </span>
                </div>

                {expanded ? (
                  <section className="raw-material-mobile-review-line-editor" aria-label={`第 ${index + 1} 卷编辑`}>
                    <div className="raw-material-mobile-review-key-fields">
                      {!isSupplierReturn ? (
                        <label>
                          <span>厂内标准色</span>
                          <select
                            aria-label={`第 ${index + 1} 卷厂内标准色`}
                            onChange={(event) => updateLineField(roll.lineId, "factoryColor", event.target.value)}
                            value={roll.lineDraft.factoryColor ?? ""}
                          >
                            <option value="">请选择标准色</option>
                            {RAW_MATERIAL_FACTORY_COLORS.map((colorOption) => (
                              <option key={colorOption} value={colorOption}>{colorOption}</option>
                            ))}
                          </select>
                          <small>{getFactoryColorMappingHint(roll.line, supplierColor)}</small>
                        </label>
                      ) : null}
                      {PRIMARY_ROLL_FIELDS.map(([key, label, type, placeholder]) => (
                        <label key={key}>
                          <span>{label}</span>
                          <input
                            aria-label={`第 ${index + 1} 卷${label}`}
                            inputMode={type === "number" ? "decimal" : undefined}
                            min={type === "number" && !isSupplierReturn ? "0" : undefined}
                            onChange={(event) => key === "weightKg"
                              ? updateRollWeight(roll, event.target.value)
                              : updateLineField(roll.lineId, key, event.target.value)}
                            placeholder={placeholder}
                            step={type === "number" ? "0.001" : undefined}
                            type={type}
                            value={key === "weightKg" ? roll.weightKg : roll.lineDraft[key] ?? ""}
                          />
                        </label>
                      ))}
                    </div>

                    {blockers.length ? <p className="raw-material-mobile-review-blocker" role="alert">还需填写：{blockers.join("、")}</p> : null}

                    <details className="raw-material-mobile-review-more">
                      <summary>其他字段与 OCR 原文</summary>
                      <div className="raw-material-mobile-review-secondary-fields">
                        {SOURCE_LINE_FIELDS.map(([key, label, type]) => (
                          <label key={key}>
                            <span>{label}</span>
                            <input
                              aria-label={`原单第 ${roll.sourceLineIndex + 1} 行${label}`}
                              inputMode={type === "number" ? "decimal" : undefined}
                              min={key === "rollCount" ? "1" : type === "number" && !isSupplierReturn ? "0" : undefined}
                              onChange={(event) => updateLineField(roll.lineId, key, event.target.value)}
                              step={key === "rollCount" ? "1" : type === "number" ? "0.001" : undefined}
                              type={type}
                              value={roll.lineDraft[key] ?? ""}
                            />
                          </label>
                        ))}
                      </div>
                      <p>{roll.line.sourceText || "OCR 未保留该行原文"}</p>
                    </details>

                    <div className="raw-material-mobile-review-line-actions">
                      <button className="remove" onClick={() => setPendingExclusion(roll)} type="button">删除误识别卷</button>
                      <button onClick={() => setExpandedLineId("")} type="button">收起</button>
                      <button className="primary" disabled={blockers.length > 0} onClick={() => confirmRoll(roll)} type="button">
                        <CheckCircleFilled aria-hidden="true" /> 这{isSupplierReturn ? "件" : "卷"}正确
                      </button>
                    </div>
                  </section>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <details className={`raw-material-mobile-review-document ${documentBlockers.length ? "has-blocker" : ""}`} ref={documentDetailsRef}>
        <summary>
          单据信息
          <span>{documentBlockers.length ? `需补 ${documentBlockers.length} 项` : "供应商、单号、金额等"}</span>
        </summary>
        <div>
          {(selected.ocrReviewFields ?? []).map((field) => (
            <label key={field.key}>
              <span>{field.label}{field.required ? " *" : ""}</span>
              <input
                aria-label={`${field.label} OCR 复核值`}
                inputMode={isNumericDocumentField(field.key) ? "decimal" : undefined}
                min={field.key === "rollCount" ? "1" : isNumericDocumentField(field.key) && !isSupplierReturn ? "0" : undefined}
                onChange={(event) => onDocumentFieldChange?.(field.key, event.target.value)}
                step={field.key === "rollCount" ? "1" : isNumericDocumentField(field.key) ? "0.001" : undefined}
                type={isNumericDocumentField(field.key) ? "number" : "text"}
                value={documentDraft[field.key] ?? ""}
              />
            </label>
          ))}
        </div>
      </details>

      <footer className="raw-material-mobile-review-footer">
        <button className="secondary" onClick={openDocumentDetails} type="button">查看单据信息</button>
        <button disabled={disabled || submitting || !canSubmit} onClick={() => onSubmit?.({ excludedRolls })} type="button">
          {submitting
            ? "正在提交…"
            : canSubmit
              ? isSupplierReturn
                ? `确认退货单（${reviewedCount}/${activeReviewRolls.length}）`
                : `确认送货单（${reviewedCount}/${activeReviewRolls.length}）`
              : `已确认 ${reviewedCount}/${activeReviewRolls.length} · ${isSupplierReturn ? "确认退货" : "进入打印"}`}
        </button>
      </footer>

      {submitError ? <p className="raw-material-mobile-review-submit-error" role="alert">{submitError}</p> : null}

      {pendingExclusion ? (
        <div className="raw-material-mobile-exclusion-backdrop" role="dialog" aria-modal="true" aria-labelledby="raw-material-exclusion-title">
          <section>
            <h2 id="raw-material-exclusion-title">确认删除第 {activeReviewRolls.findIndex((roll) => roll.reviewId === pendingExclusion.reviewId) + 1} 卷？</h2>
            <p>只有原{isSupplierReturn ? "退货单" : "送货单"}和现场实物都没有这{isSupplierReturn ? "件" : "卷"}时才删除。删除后{isSupplierReturn ? "不会计入退货复核" : "不会生成卷码或标签"}。</p>
            <small>OCR 原文仍保留在复核记录中，并记录删除人和时间，方便追溯。</small>
            <div>
              <button onClick={() => setPendingExclusion(null)} type="button">返回核对</button>
              <button className="confirm" onClick={excludePendingRoll} type="button">确认删除</button>
            </div>
          </section>
        </div>
      ) : null}

      {sourcePreviewOpen && sourcePreviewUrl ? (
        <div className="raw-material-mobile-source-modal" role="dialog" aria-modal="true" aria-label={`${isSupplierReturn ? "退货单" : "送货单"}原单`}>
          <header><strong>{isSupplierReturn ? "退货单" : "送货单"}原单{sourcePreviews.length > 1 ? ` · 第 ${activeSourcePageIndex + 1} 页` : ""}</strong><button aria-label="关闭原单" onClick={() => setSourcePreviewOpen(false)} type="button"><CloseOutlined aria-hidden="true" /></button></header>
          {sourcePreviews.length > 1 ? (
            <nav className="raw-material-mobile-source-pages is-modal" aria-label="原单页码">
              {sourcePreviews.map((preview, index) => <button className={activeSourcePageIndex === index ? "is-active" : ""} disabled={!preview.url} key={preview.sourcePageIndex} onClick={() => setActiveSourcePageIndex(index)} type="button">第 {index + 1} 页</button>)}
            </nav>
          ) : null}
          <div><img alt={`${isSupplierReturn ? "退货单" : "送货单"}原单`} src={sourcePreviewUrl} /></div>
        </div>
      ) : null}
    </section>
  );
}

async function orientRawMaterialSourcePreview(url, rawAngle, options = {}) {
  const angle = normalizeRawMaterialOcrAngle(rawAngle);
  if (!url || typeof document === "undefined" || typeof Image === "undefined") {
    return { url, revoke: false, sourceCoordinateFrame: null };
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const sourceWidth = Number(image.naturalWidth || image.width || 0);
      const sourceHeight = Number(image.naturalHeight || image.height || 0);
      const sourceCoordinateFrame = resolveRawMaterialOcrSourceFrame({
        ...options,
        sourceWidth,
        sourceHeight,
      });
      const shouldRotate = shouldRotateRawMaterialSourcePreview({
        rawAngle: angle,
        sourceFrame: sourceCoordinateFrame,
        sourceHeight,
        sourceWidth,
      });
      if (angle === 0 || !shouldRotate) {
        resolve({ url, revoke: false, sourceCoordinateFrame });
        return;
      }
      const quarterTurn = angle === 90 || angle === 270;
      const canvas = document.createElement("canvas");
      canvas.width = quarterTurn ? image.naturalHeight : image.naturalWidth;
      canvas.height = quarterTurn ? image.naturalWidth : image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve({ url, revoke: false, sourceCoordinateFrame });
        return;
      }
      if (angle === 90) {
        context.translate(0, canvas.height);
        context.rotate(-Math.PI / 2);
      } else if (angle === 180) {
        context.translate(canvas.width, canvas.height);
        context.rotate(Math.PI);
      } else {
        context.translate(canvas.width, 0);
        context.rotate(Math.PI / 2);
      }
      context.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) resolve({ url, revoke: false, sourceCoordinateFrame });
        else resolve({ url: URL.createObjectURL(blob), revoke: true, sourceCoordinateFrame });
      }, "image/jpeg", 0.92);
    };
    image.onerror = () => resolve({ url, revoke: false, sourceCoordinateFrame: null });
    image.src = url;
  });
}

function MobileReviewHeader({ isSupplierReturn = false, onBack }) {
  return (
    <header className="raw-material-mobile-review-header">
      <button aria-label={`返回${isSupplierReturn ? "退货" : "收货"}步骤`} onClick={onBack} type="button"><ArrowLeftOutlined aria-hidden="true" /></button>
      <strong>{isSupplierReturn ? "核对退货单" : "核对送货单"}</strong>
    </header>
  );
}

function MobileReviewProgress({ isSupplierReturn = false }) {
  const steps = isSupplierReturn ? RETURN_REVIEW_STEPS : REVIEW_STEPS;
  return (
    <ol className={`raw-material-mobile-review-progress ${isSupplierReturn ? "is-return" : ""}`} aria-label={isSupplierReturn ? "退货复核进度" : "收货进度"}>
      {steps.map(([label, Icon], index) => (
        <li className={index < 1 ? "is-complete" : index === 1 ? "is-current" : ""} key={label}>
          <span><Icon aria-hidden="true" /></span>
          <small>{label}</small>
        </li>
      ))}
    </ol>
  );
}

function SourceLineEvidence({ index, line, lineCount, nextLine, ocrAngle, rollInLine = 1, rollsInLine = 1, sourceCoordinateFrame, sourcePreviewUrl }) {
  const orientedBounds = orientRawMaterialOcrSourceBounds(line?.sourceBounds, ocrAngle, sourceCoordinateFrame);
  const nextBounds = orientRawMaterialOcrSourceBounds(nextLine?.sourceBounds, ocrAngle, sourceCoordinateFrame);
  const bounds = tightenRawMaterialOcrSourceRowBounds(orientedBounds, nextBounds);
  const splitLabel = rollsInLine > 1 ? ` · 本卷 ${rollInLine}/${rollsInLine}` : "";
  if (sourcePreviewUrl && bounds) {
    const width = Math.max(1, bounds.right - bounds.left);
    const height = Math.max(1, bounds.bottom - bounds.top);
    return (
      <span className="raw-material-mobile-review-source-crop is-bounded">
        <svg
          aria-label={`原单第 ${index + 1} 行${splitLabel}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          viewBox={`${bounds.left} ${bounds.top} ${width} ${height}`}
        >
          <image
            height={bounds.imageHeight}
            href={sourcePreviewUrl}
            preserveAspectRatio="none"
            width={bounds.imageWidth}
          />
        </svg>
      </span>
    );
  }
  if (sourcePreviewUrl) {
    const sourcePosition = lineCount > 1 ? 32 + (index / Math.max(1, lineCount - 1)) * 40 : 45;
    return <span className="raw-material-mobile-review-source-crop"><img alt={`原单第 ${index + 1} 行${splitLabel}`} src={sourcePreviewUrl} style={{ objectPosition: `center ${sourcePosition}%` }} /></span>;
  }
  return <span className="raw-material-mobile-review-source-text">{line?.sourceText || "原单对应行暂不可预览"}</span>;
}

function normalizeSourcePreviewUrls(values) {
  if (Array.isArray(values)) return values.map((value) => String(value || "").trim()).filter(Boolean);
  const single = String(values || "").trim();
  return single ? [single] : [];
}

function getSourceAttachmentIds(selected = {}) {
  const values = (Array.isArray(selected.sourceAttachmentIds) ? selected.sourceAttachmentIds : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (values.length) return values;
  const single = String(selected.sourceAttachmentId || "").trim();
  return single ? [single] : [];
}

function getLineSourcePageIndex(line = {}) {
  return Math.max(0, Number(line.sourcePageIndex) || 0);
}

function getOcrPageMeta(selected = {}, sourcePageIndex = 0) {
  const page = (Array.isArray(selected.ocrPages) ? selected.ocrPages : [])[sourcePageIndex] ?? {};
  return {
    angle: Number(page.angle ?? selected.ocrAngle) || 0,
    imageWidth: Math.max(0, Number(page.imageWidth ?? selected.ocrImageWidth) || 0),
    imageHeight: Math.max(0, Number(page.imageHeight ?? selected.ocrImageHeight) || 0),
  };
}

function getDataUrlByteLength(value) {
  const base64 = String(value || "").match(/^data:[^;,]+;base64,([\s\S]+)$/i)?.[1]?.replace(/\s+/g, "");
  if (!base64) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function normalizeRollWeightsInput(value, count) {
  const entries = Array.isArray(value)
    ? value
    : String(value ?? "").trim() ? String(value).trim().split(/[,，\s]+/u) : [];
  return Array.from({ length: Math.max(1, count) }, (_, index) => entries[index] ?? "");
}

function getRollColor(value) {
  const color = String(value || "").trim();
  if (/本白|米白|白/u.test(color)) return "var(--erp-roll-white)";
  if (/枣红/u.test(color)) return "var(--erp-roll-wine)";
  if (/大红|红/u.test(color)) return "var(--erp-roll-red)";
  if (/黑/u.test(color)) return "var(--erp-roll-black)";
  if (/蓝/u.test(color)) return "var(--erp-roll-blue)";
  if (/绿/u.test(color)) return "var(--erp-roll-green)";
  if (/黄|金/u.test(color)) return "var(--erp-roll-yellow)";
  return "var(--erp-roll-neutral)";
}

function formatWeight(value, withSpace = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0kg";
  return `${Number(number.toFixed(3))}${withSpace ? " " : ""}kg`;
}

function formatDeliveryNoteMeta(selected = {}) {
  const supplier = String(selected.supplierName || "供应商待确认").trim();
  const date = String(selected.receivedAt || "").trim().slice(0, 10);
  return [supplier, date].filter(Boolean).join(" · ");
}

function roundReviewNumber(value, precision) {
  const scale = 10 ** precision;
  return Math.round((Number(value) || 0) * scale) / scale;
}

function getRollBlockerStatus(blockers = []) {
  if (blockers.includes("规格 / 宽幅")) return "待补宽幅";
  if (blockers.includes("本卷重量")) return "待补重量";
  return "待补资料";
}

function getFactoryColorMappingHint(line = {}, supplierColor = "") {
  const resolution = line.factoryColorResolution ?? {};
  const sourceColor = supplierColor || resolution.supplierColor || "未识别";
  if (resolution.status === "supplier_rule") return `票面：${sourceColor} · 已按该厂家颜色资料换算`;
  if (resolution.status === "global_rule" || resolution.status === "legacy_global_fallback") {
    return `票面：${sourceColor} · 按通用规则预填，请核对实物`;
  }
  if (resolution.status === "ambiguous") return `票面：${sourceColor} · 厂家规则冲突，必须人工选择`;
  if (resolution.status === "canonical_exact") return `票面：${sourceColor} · 与厂内标准色同名`;
  return `票面：${sourceColor} · 该厂家尚无规则，本次需人工选择`;
}

export function getMobileOcrRollBlockers(roll = {}, { documentDirection = "supplier_delivery" } = {}) {
  const blockers = [];
  const line = roll.lineDraft ?? roll;
  const isSupplierReturn = documentDirection === "supplier_return";
  const rollMaterial = String(line.unit ?? "").trim() === "kg" || /布|卷/u.test(`${line.materialType ?? ""}${line.productName ?? ""}`);
  if (!isSupplierReturn && rollMaterial && !isRawMaterialFactoryColor(roll.factoryColor ?? line.factoryColor)) blockers.push("厂内标准色");
  if (!isSupplierReturn && !hasReviewableRawMaterialSpec(roll.spec ?? line.spec)) blockers.push("规格 / 宽幅");
  if (rollMaterial && !(Math.abs(Number(roll.weightKg)) > 0)) blockers.push("本卷重量");
  if (!String(line.productName || line.materialType || "").trim()) blockers.push("品名 / 材料");
  if (!String(line.unit ?? "").trim()) blockers.push("单位");
  return blockers;
}

export function getMobileOcrLineBlockers(line = {}, options = {}) {
  return getMobileOcrRollBlockers({
    lineDraft: line,
    supplierColor: line.supplierColor,
    factoryColor: line.factoryColor,
    spec: line.spec,
    weightKg: Number(line.rollCount) === 1 ? line.totalWeightKg : "",
  }, options);
}

function getMobileOcrDocumentBlockers(fields = [], draft = {}) {
  return (Array.isArray(fields) ? fields : []).filter((field) => {
    if (!field?.required) return false;
    const value = draft[field.key];
    if (field.key === "rollCount") return !Number.isInteger(Number(value)) || Number(value) <= 0;
    return !String(value ?? "").trim();
  });
}

function isNumericDocumentField(key) {
  return ["rollCount", "totalWeightKg", "unitPrice", "amount"].includes(key);
}
