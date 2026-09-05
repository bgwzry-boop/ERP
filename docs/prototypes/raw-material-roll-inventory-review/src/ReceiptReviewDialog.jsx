import { useEffect, useMemo, useState } from "react";
import { ReviewDialog } from "./ReviewDialog.jsx";
import { ReceiptSourcePreview } from "./ReceiptSourcePreview.jsx";
import { buildReceiptHeaderDraft, RECEIPT_HEADER_FIELDS, validateDesktopReceiptReview } from "./receipt-review.js";
import { buildOcrLineReviewDraft, OCR_LINE_REVIEW_FIELDS, isNumericOcrLineField } from "../../../../src/features/raw-materials/rawMaterialInboundOcrDraft.js";
import { projectRawMaterialOcrPhysicalRollReviewRows } from "../../../../shared/rawMaterialOcrLineReview.js";
import { listOfficeRawMaterialSupplierColorMappings } from "../../../../src/features/raw-materials/rawMaterialSupplierColorMappingApiClient.js";

export function ReceiptReviewDialog({ inbound, authState, duplicateAcknowledged, onClose, onSave }) {
  const [snapshot] = useState(inbound);
  const lines = snapshot.ocrLines || [];
  const [reviewFields, setReviewFields] = useState(() => buildReceiptHeaderDraft(snapshot));
  const [lineDrafts, setLineDrafts] = useState(() => Object.fromEntries(lines.map((line) => [line.lineId, buildOcrLineReviewDraft(line, snapshot.documentDirection)])));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(lines[0]?.sourcePageIndex ?? 0);
  const [seenPages, setSeenPages] = useState({});
  const [confirmedRolls, setConfirmedRolls] = useState({});
  const [exclusions, setExclusions] = useState({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [colors, setColors] = useState([]);
  const [colorsLoading, setColorsLoading] = useState(true);
  const [colorsError, setColorsError] = useState("");
  const [colorRetry, setColorRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setColorsError(""); setColorsLoading(true);
    void listOfficeRawMaterialSupplierColorMappings({ authState }, { serverRequired: true, signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setColorsLoading(false);
      if (result.source === "api") setColors(result.options.factoryColors);
      else setColorsError(result.error?.message || "标准色读取失败");
    });
    return () => controller.abort();
  }, [authState, colorRetry]);
  const line = lines[selectedIndex];
  const draft = lineDrafts[line?.lineId] || {};
  const standardColors = colors.map((color) => typeof color === "string" ? { name: color, enabled: true } : color);
  // Invalid counts are left for validation; do not allocate an unbounded preview.
  const physicalRows = useMemo(() => projectRawMaterialOcrPhysicalRollReviewRows({ lines: line ? [line] : [], lineDrafts: { [line?.lineId]: { ...draft, rollCount: Math.min(500, Math.max(1, Number(draft.rollCount) || 1)) } }, documentDirection: snapshot.documentDirection }), [line, draft, snapshot.documentDirection]);
  const lineReviews = lines.map((item) => ({ lineId: item.lineId, values: lineDrafts[item.lineId], excludedRollIndices: exclusions[item.lineId]?.indices || [], exclusionReason: exclusions[item.lineId]?.reason || "" }));
  let blocker = "";
  try { validateDesktopReceiptReview({ inbound: snapshot, reviewFields, lineReviews, standardColors, seenPages, confirmedRolls, reason }); }
  catch (failure) { blocker = failure.message; }
  if (colorsLoading) blocker = "正在读取厂内标准色目录…";
  if (colorsError) blocker = "标准色目录未成功读取，请重试后复核。";
  const changeLine = (key, value) => {
    setLineDrafts((current) => ({ ...current, [line.lineId]: { ...current[line.lineId], [key]: value } }));
    setConfirmedRolls((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !id.startsWith(`${line.lineId}:`))));
    if (key === "rollCount") setExclusions((current) => ({ ...current, [line.lineId]: { indices: [], reason: "" } }));
    setError("");
  };
  const save = async () => {
    if (busy || blocker) return;
    setBusy(true); setError("");
    try {
      const payload = validateDesktopReceiptReview({ inbound: snapshot, reviewFields, lineReviews, standardColors, seenPages, confirmedRolls, reason });
      if (duplicateAcknowledged) payload.reason = `已对照疑似重复候选，确认不是同一票据。${payload.reason}`;
      const result = await onSave(payload);
      if (result?.source !== "api" || !result.inbound?.id) setError(result?.error?.message || "保存失败，编辑内容已保留，请重试。");
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <ReviewDialog className="receipt-review-dialog" labelledBy="receipt-review-title" onClose={() => { if (!busy) onClose(); }}>
    <header><div><span>{snapshot.id} · {snapshot.documentDirection === "supplier_return" ? "厂家退货" : "厂家送货"}</span><h2 id="receipt-review-title">对照原图逐卷复核</h2></div><button aria-label="关闭" disabled={busy} onClick={onClose} type="button">×</button></header>
    <div className="receipt-review-layout">
      <section className="receipt-review-source"><h3>审计原图</h3><ReceiptSourcePreview inbound={snapshot} authState={authState} pageIndex={pageIndex} onPageChange={setPageIndex} onPageReady={(index) => setSeenPages((current) => current[index] ? current : { ...current, [index]: true })} /></section>
      <fieldset className="receipt-review-editor" disabled={busy}>
        <details><summary>单据字段与全单汇总（共 {lines.length} 行）</summary><p>按整张单据核对；分页小计不能代替全单汇总。厂家票面颜色与厂内标准色分别保留。</p><div className="receipt-review-fields">{RECEIPT_HEADER_FIELDS.map(([key, label]) => <label key={key}><span>{label}</span><input value={reviewFields[key]} onChange={(event) => { setReviewFields((current) => ({ ...current, [key]: event.target.value })); setConfirmedRolls({}); setError(""); }} /></label>)}</div></details>
        {snapshot.documentPriceReferenceOnly ? <p className="receipt-review-warning">服务器将票面价格标记为参考价；行内重量 × 单价仍需核对，全单声明金额单独留档。</p> : null}
        <nav aria-label="逐行复核" className="receipt-review-line-nav">{lines.map((item, index) => <button aria-pressed={index === selectedIndex} key={item.lineId} onClick={() => { setSelectedIndex(index); setPageIndex(item.sourcePageIndex ?? 0); }} type="button">第 {index + 1} 行 · 第 {Number(item.sourcePageIndex) + 1} 页</button>)}</nav>
        {line ? <><h3>明细 {selectedIndex + 1} · 原表第 {Number(line.sourceRowIndex) + 1} 行</h3><p className="receipt-review-original">票面原文：{line.sourceText || "未记录，请对照原图"}</p>
          <div className="receipt-review-fields">{OCR_LINE_REVIEW_FIELDS.filter(([key]) => key !== "returnMaterialCategory" || snapshot.documentDirection === "supplier_return").map(([key, label]) => <label key={key}><span>{label}</span>{key === "factoryColor" ? <select value={draft[key]} onChange={(event) => changeLine(key, event.target.value)}><option value="">请选择厂内标准色</option>{draft[key] && !standardColors.some((color) => color.name === draft[key]) ? <option value={draft[key]}>{draft[key]}（待核验）</option> : null}{standardColors.map((color) => <option key={color.name} value={color.name}>{color.name}</option>)}</select> : <input inputMode={isNumericOcrLineField(key) || key === "rollWeightsKg" ? "decimal" : undefined} value={draft[key]} onChange={(event) => changeLine(key, event.target.value)} />}<small>识别值：{String(line.recognizedValues?.[key] ?? line.values?.[key] ?? "未识别")}</small></label>)}</div>
          {colorsError ? <p role="alert">{colorsError} <button onClick={() => setColorRetry((value) => value + 1)} type="button">重试标准色目录</button></p> : null}
          <p>修改当前行后，需要重新逐卷确认。分卷重量按实物顺序填写，不能平均分摊；本次选择颜色不会修改厂家映射。</p>
          <div className="receipt-review-rolls">{physicalRows.map((roll) => <div key={roll.reviewId}><label><input type="checkbox" checked={Boolean(confirmedRolls[roll.reviewId])} disabled={!seenPages[line.sourcePageIndex] || pageIndex !== line.sourcePageIndex} onChange={(event) => setConfirmedRolls((current) => ({ ...current, [roll.reviewId]: event.target.checked }))} />第 {roll.lineRollIndex + 1} 卷 · {roll.factoryColor || "颜色待确认"} · {roll.spec || "规格待确认"} · {roll.weightKg || "待补"} kg，已对照来源页核对</label><label><input type="checkbox" checked={(exclusions[line.lineId]?.indices || []).includes(roll.lineRollIndex)} onChange={(event) => { const checked = event.target.checked; setExclusions((current) => ({ ...current, [line.lineId]: { ...current[line.lineId], indices: checked ? [...(current[line.lineId]?.indices || []), roll.lineRollIndex] : (current[line.lineId]?.indices || []).filter((index) => index !== roll.lineRollIndex) } })); setConfirmedRolls((current) => ({ ...current, [roll.reviewId]: false })); }} />这是误识别卷，排除</label></div>)}</div>
          {(exclusions[line.lineId]?.indices || []).length ? <label className="receipt-review-reason">排除依据<input value={exclusions[line.lineId]?.reason || ""} onChange={(event) => setExclusions((current) => ({ ...current, [line.lineId]: { ...current[line.lineId], reason: event.target.value } }))} /></label> : null}
        </> : <p role="alert">草稿没有可复核明细，请重新识别；不能只确认汇总。</p>}
        <label className="receipt-review-reason">复核依据 / 修改说明<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="记录与原图核对的结论，以及修改字段的依据" /></label>
      </fieldset>
    </div>
    <footer><p role={error ? "alert" : "status"}>{error || blocker || "所有原图、逐卷确认和汇总校验已通过，可以保存到服务器。"}</p><div><button disabled={busy} onClick={onClose} type="button">返回</button><button className="primary" disabled={busy || Boolean(blocker)} onClick={save} type="button">{busy ? "正在保存…" : "确认复核并保存"}</button></div></footer>
  </ReviewDialog>;
}
