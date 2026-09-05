import { InfoGrid, StatusPill } from "../../shared/ui/operational.jsx";
import {
  formatSupplierPayableAmount,
  getSupplierStatementReviewSourceLabel,
  getSupplierStatementReviewTone,
  getSupplierStatementStatusTone,
} from "../../domain/rawMaterialInboundListState.js";

export function SupplierStatementImportPreview({ result = {}, onSaveDraft, saving = false }) {
  const summary = result.summary ?? {};
  const rows = Array.isArray(result.rows) ? result.rows.slice(0, 6) : [];
  const adjustments = Array.isArray(result.adjustments) ? result.adjustments.slice(0, 3) : [];
  const issues = Array.isArray(result.issues) ? result.issues.slice(0, 3) : [];
  const canSave = typeof onSaveDraft === "function" && !result.savedReviewId;
  return (
    <div className="supplier-statement-preview">
      <div className="supplier-statement-preview-head">
        <div>
          <strong>{result.fileName || "供应商月结 Excel"}</strong>
          <span>{result.adapter?.label || "模板待识别"} · {result.recommendedAction || "等待人工复核。"}</span>
        </div>
        <StatusPill tone={getSupplierStatementStatusTone(summary.status)}>{summary.statusLabel || "待识别"}</StatusPill>
      </div>
      <InfoGrid
        rows={[
          ["明细", `${summary.rowCount || 0} 行；匹配 ${summary.matchedRowCount || 0} / 候选 ${summary.candidateRowCount || 0} / 未匹配 ${summary.unmatchedRowCount || 0}`],
          ["退货/调整", `${summary.returnRowCount || 0} 行退货；${summary.adjustmentCount || 0} 个 footer 调整项`],
          ["重量/金额", `${summary.totalWeightKg || 0}kg / ¥${summary.totalAmount || 0}`],
        ]}
      />
      <div className="supplier-statement-review-actions">
        <span>{result.savedReviewId ? `已保存复核草稿：${result.savedReviewId}` : "预检结果可保存为人工复核草稿；不会写库存、应付或付款。"}</span>
        <button
          className="primary-action"
          disabled={!canSave || saving}
          title={result.savedReviewId ? "该预检结果已保存为复核草稿" : ""}
          onClick={onSaveDraft}
        >
          {saving ? "保存中" : "保存复核草稿"}
        </button>
      </div>
      {rows.length ? (
        <div className="supplier-statement-row-list">
          {rows.map((row) => (
            <div className="supplier-statement-row" key={row.id}>
              <div>
                <strong>{row.documentNo || row.batchNo || row.productName || "未命名单据行"}</strong>
                <span>{row.productName || row.spec || "品名待补"} / {row.color || "颜色待补"} / {row.rollLabel || row.batchNo || "卷号待补"}</span>
              </div>
              <span>{row.totalWeightKg ?? row.rollWeightKg ?? "-"}kg</span>
              <span>¥{row.amount ?? "-"}</span>
              <StatusPill tone={row.matchingStatus === "matched" ? "success" : row.matchingStatus === "candidate" ? "warning" : "danger"}>
                {row.matchingStatus === "matched" ? "已匹配" : row.matchingStatus === "candidate" ? "候选匹配" : "未匹配"}
              </StatusPill>
            </div>
          ))}
        </div>
      ) : null}
      {adjustments.length ? (
        <div className="supplier-statement-note-list">
          {adjustments.map((item) => (
            <span key={item.id}>{formatSupplierStatementAdjustment(item)}</span>
          ))}
        </div>
      ) : null}
      {issues.length ? (
        <div className="supplier-statement-issues">
          {issues.map((issue, index) => (
            <span key={`${issue.severity}-${issue.row || index}`}>{issue.severityLabel || "提示"}：{issue.message}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SupplierStatementReviewList({
  reviews = [],
  meta = {},
  onConfirm,
  onStatementConfirm,
  onPayableDraftGenerate,
  onPaymentConfirm,
  payableState = {},
  paymentState = {},
  money = (value) => `¥${value}`,
  firstReleaseMode = false,
}) {
  const recent = reviews.slice(0, 5);
  return (
    <div className="supplier-statement-review-list">
      <div className="supplier-statement-review-list-head">
        <strong>月结复核草稿</strong>
        <span>{getSupplierStatementReviewSourceLabel(meta)}</span>
      </div>
      {recent.length ? (
        recent.map((review) => {
          const isDraft = review.reviewStatus === "draft";
          const canConfirmStatement = review.reviewStatus === "reviewed" && String(review.status ?? "").includes("一致") && !review.statementConfirmationId;
          const canGeneratePayable = review.reviewStatus === "statement_confirmed" && review.statementConfirmationId && !review.supplierPayableId;
          const canConfirmPayment = review.supplierPayableId
            && review.supplierPayableDraft
            && Number(review.supplierPayableDraft.payableAmount) > 0
            && review.paymentStatus !== "已确认付款"
            && !review.supplierPaymentConfirmationId;
          return (
            <div className="supplier-statement-review-row" key={review.reviewId}>
              <div>
                <strong>{review.reviewId}</strong>
                <span>{review.supplierName || "供应商待补"} / {review.fileName || "文件名待补"}</span>
                <span>{review.summaryText || "等待复核摘要"}</span>
                {Array.isArray(review.adjustments) && review.adjustments.length ? (
                  <span>{formatSupplierStatementAdjustment(review.adjustments[0])}</span>
                ) : null}
                {review.statementConfirmationId ? <span>{review.statementConfirmationId} / {review.paymentStatus || "待财务付款确认"}</span> : null}
                {!firstReleaseMode && review.supplierPayableId ? (
                  <span>
                    {review.supplierPayableId} / {review.payableStatus || "待财务复核"} / {formatSupplierPayableAmount(review.supplierPayableDraft?.payableAmount ?? 0, money)}
                  </span>
                ) : null}
                {!firstReleaseMode && review.supplierPaymentConfirmationId ? (
                  <span>
                    {review.supplierPaymentConfirmationId} / 已确认付款 / {formatSupplierPayableAmount(review.supplierPaymentRecord?.paidAmount ?? 0, money)}
                  </span>
                ) : null}
              </div>
              <StatusPill tone={getSupplierStatementReviewTone(review.status)}>{review.status || "待人工复核"}</StatusPill>
              <div className="action-row compact-actions">
                <button disabled={!isDraft} onClick={() => onConfirm?.(review.reviewId, "一致")}>标记一致</button>
                <button disabled={!isDraft} onClick={() => onConfirm?.(review.reviewId, "有差异")}>标记有差异</button>
                <button disabled={!canConfirmStatement} onClick={() => onStatementConfirm?.(review.reviewId)}>确认对账</button>
                {!firstReleaseMode ? <button
                  disabled={!canGeneratePayable || payableState.disabled}
                  title={payableState.disabled ? payableState.title : (!canGeneratePayable ? "需先确认对账且不能重复生成应付" : "")}
                  onClick={() => onPayableDraftGenerate?.(review.reviewId)}
                >
                  生成应付
                </button> : null}
                {!firstReleaseMode ? <button
                  disabled={!canConfirmPayment || paymentState.disabled}
                  title={paymentState.disabled ? paymentState.title : (!canConfirmPayment ? "需先生成金额大于0的应付草稿且不能重复确认付款" : "")}
                  onClick={() => onPaymentConfirm?.(review)}
                >
                  确认付款
                </button> : null}
              </div>
            </div>
          );
        })
      ) : (
        <div className="empty-row">暂无已保存的供应商月结复核草稿。</div>
      )}
    </div>
  );
}

function formatSupplierStatementAdjustment(item = {}) {
  const typeLabel = item.typeLabel || (item.adjustmentType === "paper_tube_deduction" ? "纸管扣项" : "调整项");
  const amountText = item.amount != null ? `¥${formatSupplierAdjustmentNumber(item.amount)}` : "金额待确认";
  const formulaText = item.calculationBasis?.formulaText ? ` · ${item.calculationBasis.formulaText}` : "";
  const reportedText = item.supplierReportedAmount != null && item.supplierReportedAmount !== item.amount
    ? ` · 供应商原金额 ¥${formatSupplierAdjustmentNumber(item.supplierReportedAmount)}`
    : "";
  const scopeText = item.isCurrentPeriod === false ? " · 仅参考不进本期应付" : " · 进入本期复核";
  return `${typeLabel}：${amountText}${formulaText}${reportedText}${scopeText}`;
}

function formatSupplierAdjustmentNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "-");
  return number.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
