import { InfoGrid, Timeline } from "../../shared/ui/operational.jsx";
import {
  SupplierStatementImportPreview,
  SupplierStatementReviewList,
} from "./RawMaterialSupplierStatementReview.jsx";
import {
  buildRawMaterialInboundTimeline,
  buildRawMaterialLossCalibrationOptions,
  buildRawMaterialMarginReviewOptions,
  buildRawMaterialMarginSnapshotOptions,
  canCalibrateRawMaterialLoss,
  canConfirmRawMaterialCostDraft,
  canGenerateRawMaterialCostDraft,
  canGenerateRawMaterialMarginSnapshot,
  canReviewRawMaterialMarginSnapshot,
  formatRawMaterialConsumptionRecord,
  formatRawMaterialCostAllocationConfirmation,
  formatRawMaterialCostAllocationDraft,
  formatRawMaterialCostConfirmationSummary,
  formatRawMaterialCostDraftSummary,
  formatRawMaterialCostLossCalibration,
  formatRawMaterialIssueRecord,
  formatRawMaterialLeftoverReturnRecord,
  formatRawMaterialLeftoverReviewRecord,
  formatRawMaterialLossCalibrationSummary,
  formatRawMaterialMarginReportSummary,
  formatRawMaterialMarginSnapshotSummary,
  formatRawMaterialOrderMarginReport,
  formatRawMaterialOrderMarginSnapshot,
  formatRawMaterialSplitRecord,
  formatRawMaterialTaskMatch,
} from "./rawMaterialInboundWorkflow.js";

export function RawMaterialInboundSupportingSections({
  actionStates,
  canViewCost,
  detailTab,
  firstReleaseMode,
  money,
  onAction,
  onPayableDraftGenerate,
  onPaymentConfirm,
  onStatementConfirm,
  onStatementImport,
  onStatementReviewConfirm,
  onStatementReviewDraftSave,
  selected,
  statementImport,
  statementImportLoading,
  statementReviewMeta,
  statementReviewSaving,
  statementReviews,
}) {
  const {
    costConfirm: costConfirmState,
    costDraft: costDraftState,
    lossCalibration: lossCalibrationState,
    marginReview: marginReviewState,
    marginSnapshot: marginSnapshotState,
    payable: payableState,
    payment: paymentState,
  } = actionStates;

  return (
    <>
      <section className="detail-section operational-detail-section-first raw-material-stage-actions" hidden={firstReleaseMode || detailTab !== "领料成本"}>
        <h3>领料与成本动作</h3>
        <p>机边领料只移动原材料状态；成本、损耗和毛利按独立复核步骤推进，不把机器计数或领料记录当成合格产量。</p>
        <div className="action-row raw-material-actions">
          <button
            disabled={costDraftState.disabled || !canGenerateRawMaterialCostDraft(selected)}
            title={costDraftState.title || (!canGenerateRawMaterialCostDraft(selected) ? "需先确认消耗，且领料记录必须已匹配生产任务" : "")}
            onClick={() => onAction?.("生成成本草稿", selected.id, { note: "V1 生成原材料成本分摊草稿；仍需成本/管理复核。" })}
          >
            生成成本草稿
          </button>
          <button
            disabled={costConfirmState.disabled || !canConfirmRawMaterialCostDraft(selected)}
            title={costConfirmState.title || (!canConfirmRawMaterialCostDraft(selected) ? "需先生成待复核成本草稿" : "")}
            onClick={() => onAction?.("确认成本草稿", selected.id, { note: "V1 复核确认原材料成本快照；损耗和毛利仍走独立流程。" })}
          >
            确认成本草稿
          </button>
          <button
            disabled={lossCalibrationState.disabled || !canCalibrateRawMaterialLoss(selected)}
            title={lossCalibrationState.title || (!canCalibrateRawMaterialLoss(selected) ? "需先确认成本草稿，且不能重复校准损耗" : "")}
            onClick={() => onAction?.("校准损耗", selected.id, buildRawMaterialLossCalibrationOptions(selected))}
          >
            校准损耗
          </button>
          <button
            disabled={marginSnapshotState.disabled || !canGenerateRawMaterialMarginSnapshot(selected)}
            title={marginSnapshotState.title || (!canGenerateRawMaterialMarginSnapshot(selected) ? "需先完成损耗校准，且不能重复生成毛利快照" : "")}
            onClick={() => onAction?.("生成毛利快照", selected.id, buildRawMaterialMarginSnapshotOptions(selected))}
          >
            生成毛利快照
          </button>
          <button
            disabled={marginReviewState.disabled || !canReviewRawMaterialMarginSnapshot(selected)}
            title={marginReviewState.title || (!canReviewRawMaterialMarginSnapshot(selected) ? "需先生成毛利快照，且订单收入必须完整、不能重复复核" : "")}
            onClick={() => onAction?.("复核毛利快照", selected.id, buildRawMaterialMarginReviewOptions(selected))}
          >
            复核毛利快照
          </button>
        </div>
      </section>
      <section className="detail-section raw-material-machine-section" hidden={!(["领料成本", "扫码出库"].includes(detailTab))}>
        <h3>{firstReleaseMode ? "扫码出库记录" : "机边领料 / 消耗"}</h3>
        <InfoGrid
          rows={[
            ["领料状态", selected.issueStatus || (selected.rawMaterialIssueRecords?.length ? "部分领料/机边" : "未领料")],
            ["机台/任务", `${selected.machineId || "未分配"} / ${selected.productionTaskId || "未关联生产任务"}`],
            ["任务匹配", formatRawMaterialTaskMatch(selected)],
            ["领料记录", `${selected.rawMaterialIssueRecords?.length || 0}`],
            ["拆卷记录", `${selected.rawMaterialSplitRecords?.length || 0}`],
            ["消耗确认", `${selected.rawMaterialConsumptionRecords?.length || 0}`],
            ["余料退回", `${selected.rawMaterialLeftoverReturnRecords?.length || 0}`],
            ["余料复核", `${selected.rawMaterialLeftoverReviewRecords?.length || 0}`],
            ["成本草稿", formatRawMaterialCostDraftSummary(selected, canViewCost, money)],
            ["成本确认", formatRawMaterialCostConfirmationSummary(selected, canViewCost, money)],
            ["损耗校准", formatRawMaterialLossCalibrationSummary(selected, canViewCost, money)],
            ["毛利快照", formatRawMaterialMarginSnapshotSummary(selected, canViewCost, money)],
            ["毛利报表", formatRawMaterialMarginReportSummary(selected, canViewCost, money)],
          ]}
        />
        <div className="supplier-statement-note-list">
          {(selected.rawMaterialIssueRecords ?? []).slice(0, 4).map((record) => (
            <span key={record.issueRecordId}>{formatRawMaterialIssueRecord(record)}</span>
          ))}
          {(selected.rawMaterialSplitRecords ?? []).slice(0, 4).map((record) => (
            <span key={record.splitRecordId}>{formatRawMaterialSplitRecord(record)}</span>
          ))}
          {(selected.rawMaterialConsumptionRecords ?? []).slice(0, 4).map((record) => (
            <span key={record.consumptionRecordId}>{formatRawMaterialConsumptionRecord(record)}</span>
          ))}
          {(selected.rawMaterialLeftoverReturnRecords ?? []).slice(0, 4).map((record) => (
            <span key={record.leftoverReturnRecordId}>{formatRawMaterialLeftoverReturnRecord(record)}</span>
          ))}
          {(selected.rawMaterialLeftoverReviewRecords ?? []).slice(0, 4).map((record) => (
            <span key={record.leftoverReviewRecordId}>{formatRawMaterialLeftoverReviewRecord(record)}</span>
          ))}
          {(selected.rawMaterialCostAllocationDrafts ?? []).slice(0, 4).map((record) => (
            <span key={record.costAllocationDraftId}>{formatRawMaterialCostAllocationDraft(record, canViewCost, money)}</span>
          ))}
          {(selected.rawMaterialCostAllocationConfirmations ?? []).slice(0, 3).map((record) => (
            <span key={record.costConfirmationId}>{formatRawMaterialCostAllocationConfirmation(record, canViewCost, money)}</span>
          ))}
          {(selected.rawMaterialCostLossCalibrations ?? []).slice(0, 3).map((record) => (
            <span key={record.lossCalibrationId}>{formatRawMaterialCostLossCalibration(record, canViewCost, money)}</span>
          ))}
          {(selected.rawMaterialOrderMarginSnapshots ?? []).slice(0, 3).map((record) => (
            <span key={record.marginSnapshotId}>{formatRawMaterialOrderMarginSnapshot(record, canViewCost, money)}</span>
          ))}
          {(selected.rawMaterialOrderMarginReports ?? []).slice(0, 3).map((record) => (
            <span key={record.marginReportId}>{formatRawMaterialOrderMarginReport(record, canViewCost, money)}</span>
          ))}
          {(selected.rawMaterialCostAllocationWarnings ?? []).slice(0, 3).map((warning) => (
            <span key={warning}>成本草稿提示：{warning}</span>
          ))}
          {!hasTraceabilityRecords(selected) ? <span>暂无机边领料 / 消耗 / 余料记录。</span> : null}
        </div>
      </section>
      <section className="detail-section operational-detail-section-first" hidden={detailTab !== "供应商账"}>
        <h3>供应商对账</h3>
        <InfoGrid
          rows={[
            ["月结状态", selected.statementStatus || "待上传"],
            ["匹配摘要", selected.statementSummary || "等待供应商月结 Excel"],
            ["差异项", (selected.statementDifferences ?? []).join(" / ") || "暂无"],
          ]}
        />
        <p>供应商月结对账只确认 ERP 入库记录和供应商 Excel 是否一致；确认对账不等于付款，付款仍走财务对账收款流程。</p>
        <div className="raw-material-statement-import">
          <div className="toolbar-line">
            <label className="file-upload-button">
              上传月结 Excel
              <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onStatementImport} />
            </label>
            <span>{statementImportLoading ? "正在识别供应商月结单..." : "支持白侯重1-重5、北陈批号明细和通用字段预检查。"}</span>
          </div>
          {statementImport ? (
            <SupplierStatementImportPreview
              result={statementImport}
              onSaveDraft={onStatementReviewDraftSave}
              saving={statementReviewSaving}
            />
          ) : null}
          <SupplierStatementReviewList
            reviews={statementReviews}
            meta={statementReviewMeta}
            onConfirm={onStatementReviewConfirm}
            onStatementConfirm={onStatementConfirm}
            onPayableDraftGenerate={onPayableDraftGenerate}
            onPaymentConfirm={onPaymentConfirm}
            payableState={payableState}
            paymentState={paymentState}
            money={money}
            firstReleaseMode={firstReleaseMode}
          />
        </div>
      </section>
      <section className="detail-section operational-detail-section-first" hidden={detailTab !== "记录"}>
        <h3>流程记录</h3>
        <Timeline items={buildRawMaterialInboundTimeline(selected)} />
      </section>
    </>
  );
}

function hasTraceabilityRecords(selected) {
  return Boolean(
    (selected.rawMaterialIssueRecords ?? []).length
      || (selected.rawMaterialSplitRecords ?? []).length
      || (selected.rawMaterialConsumptionRecords ?? []).length
      || (selected.rawMaterialLeftoverReturnRecords ?? []).length
      || (selected.rawMaterialLeftoverReviewRecords ?? []).length
      || (selected.rawMaterialCostAllocationDrafts ?? []).length
      || (selected.rawMaterialCostAllocationConfirmations ?? []).length
      || (selected.rawMaterialCostLossCalibrations ?? []).length
      || (selected.rawMaterialOrderMarginSnapshots ?? []).length
      || (selected.rawMaterialOrderMarginReports ?? []).length,
  );
}
