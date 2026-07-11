import { useEffect, useState } from "react";
import { SearchOutlined } from "@ant-design/icons";
import {
  DataState,
  DataTable,
  DetailPane,
  FilterBar,
  InfoGrid,
  MetricStrip,
  OperationalPanel,
  PanelHeader,
  Segmented,
  StatusPill,
  Timeline,
} from "../../shared/ui/operational.jsx";
import { precheckRawMaterialSupplierStatementWorkbook } from "../../domain/rawMaterialSupplierStatementImport.js";
import {
  buildRawMaterialInboundMetrics,
  canConfirmRawMaterialConsumptionRoll,
  canConfirmRawMaterialAttachment,
  canIssueRawMaterialRoll,
  canIssueRawMaterialToMachine,
  canPrintRawMaterialLabels,
  canReturnRawMaterialLeftoverRoll,
  canReviewRawMaterialInbound,
  canReviewRawMaterialLeftoverRoll,
  filterRawMaterialInboundsByKeyword,
  filterRawMaterialInboundsByTab,
  formatRawMaterialDeliveryNoteNo,
  formatSupplierPayableAmount,
  getRawMaterialInboundSourceLabel,
  getRawMaterialInboundTone,
  getSupplierStatementReviewSourceLabel,
  getSupplierStatementReviewTone,
  getSupplierStatementStatusTone,
} from "../../domain/rawMaterialInboundListState.js";

const rawMaterialInboundTabs = ["入库单", "待贴标", "机边领料", "供应商对账"];

export function RawMaterialInboundPage({
  inbounds = [],
  meta = {},
  productionTasks = [],
  statementReviews = [],
  statementReviewMeta = {},
  selectedId,
  setSelectedId,
  onAction,
  onStatementReviewDraftCreate,
  onStatementReviewConfirm,
  onStatementConfirm,
  onPayableDraftGenerate,
  onPaymentConfirm,
  helpers = {},
}) {
  const { getUiActionState = () => ({ disabled: false, title: "" }), money = (value) => `¥${value}` } = helpers;
  const [activeTab, setActiveTab] = useState(rawMaterialInboundTabs[0]);
  const [keyword, setKeyword] = useState("");
  const [statementImport, setStatementImport] = useState(null);
  const [statementImportLoading, setStatementImportLoading] = useState(false);
  const [statementReviewSaving, setStatementReviewSaving] = useState(false);
  const records = filterRawMaterialInboundsByTab(inbounds, activeTab);
  const visibleRecords = filterRawMaterialInboundsByKeyword(records, keyword);
  const selected = visibleRecords.find((item) => item.id === selectedId) ?? visibleRecords[0] ?? null;
  const costState = getUiActionState("rawMaterial", "查看成本");
  const canViewCost = !costState.disabled;
  const reviewState = getUiActionState("rawMaterial", "复核送货单");
  const printState = getUiActionState("rawMaterial", "打印卷标");
  const attachState = getUiActionState("rawMaterial", "确认贴标入库");
  const issueState = getUiActionState("rawMaterial", "机边领料");
  const consumptionState = getUiActionState("rawMaterial", "确认消耗");
  const leftoverState = getUiActionState("rawMaterial", "余料退回");
  const leftoverReviewState = getUiActionState("rawMaterial", "复核余料可用");
  const exceptionState = getUiActionState("rawMaterial", "标记异常");
  const costDraftState = getUiActionState("rawMaterial", "生成成本草稿");
  const costConfirmState = getUiActionState("rawMaterial", "确认成本草稿");
  const lossCalibrationState = getUiActionState("rawMaterial", "校准损耗");
  const marginSnapshotState = getUiActionState("rawMaterial", "生成毛利快照");
  const marginReviewState = getUiActionState("rawMaterial", "复核毛利快照");
  const payableState = getUiActionState("rawMaterial", "生成应付");
  const paymentState = getUiActionState("rawMaterial", "确认付款");
  const metrics = buildRawMaterialInboundMetrics(inbounds);

  useEffect(() => {
    if (!selected) return;
    if (selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected?.id, selectedId, setSelectedId]);

  function changeTab(tab) {
    setActiveTab(tab);
    setKeyword("");
  }

  async function handleSupplierStatementImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setStatementImportLoading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await precheckRawMaterialSupplierStatementWorkbook({
        bytes,
        fileName: file.name,
        supplierName: selected?.supplierName,
        existingInbounds: inbounds,
      });
      setStatementImport(result);
    } catch (error) {
      setStatementImport({
        summary: {
          status: "blocked",
          statusLabel: "无法识别",
          rowCount: 0,
          matchedRowCount: 0,
          candidateRowCount: 0,
          unmatchedRowCount: 0,
          adjustmentCount: 0,
          totalWeightKg: 0,
          totalAmount: 0,
        },
        adapter: { label: "供应商 Excel" },
        fileName: file.name,
        recommendedAction: "Excel 无法读取，请确认是 .xlsx 文件，或先另存后重新上传。",
        rows: [],
        adjustments: [],
        issues: [{
          severity: "error",
          severityLabel: "阻断",
          message: error?.message || String(error),
        }],
      });
    } finally {
      setStatementImportLoading(false);
    }
  }

  async function handleSaveSupplierStatementReviewDraft() {
    if (!statementImport || statementReviewSaving) return;
    setStatementReviewSaving(true);
    try {
      const saved = await onStatementReviewDraftCreate?.(statementImport, {
        supplierName: selected?.supplierName || statementImport.supplierName,
        fileName: statementImport.fileName,
        note: "办公室保存供应商月结 Excel 预检结果，等待人工复核。",
      });
      if (saved?.reviewId) {
        setStatementImport((current) => ({
          ...(current ?? {}),
          savedReviewId: saved.reviewId,
        }));
      }
    } finally {
      setStatementReviewSaving(false);
    }
  }

  function handleConfirmSupplierStatementReview(reviewId, decision) {
    onStatementReviewConfirm?.(reviewId, {
      decision,
      note: "办公室在原材料页标记月结复核草稿状态；不生成应付或付款。",
    });
  }

  function handleConfirmSupplierStatement(reviewId) {
    onStatementConfirm?.(reviewId, {
      note: "办公室确认供应商月结对账一致；只进入待财务付款确认，不直接付款。",
    });
  }

  function handleGenerateSupplierPayableDraft(reviewId) {
    onPayableDraftGenerate?.(reviewId, {
      note: "财务基于已确认供应商月结生成应付草稿；付款仍需另行确认。",
    });
  }

  function handleConfirmSupplierPayment(review) {
    onPaymentConfirm?.(review.reviewId, {
      paidAmount: review.supplierPayableDraft?.payableAmount,
      paymentMethod: "银行转账",
      note: "财务确认供应商应付草稿已实际付款；只记录付款确认，不写原材料库存。",
    });
  }

  return (
    <section className="page-grid split-detail raw-material-inbound-page raw-material-workbench">
      <OperationalPanel className="table-pane raw-material-list-panel" ariaLabel="原材料入库列表">
        <PanelHeader
          title="原材料工作台"
          summary={`OCR 仅预填，打印标签只是待贴标；${getRawMaterialInboundSourceLabel(meta)}`}
          actions={(
            <div className="raw-material-panel-actions">
              <Segmented ariaLabel="原材料视图" value={activeTab} onChange={changeTab} items={rawMaterialInboundTabs} />
              <button className="ghost-button" onClick={() => setKeyword("")}>重置</button>
            </div>
          )}
        />
        <FilterBar
          className="raw-material-filter-bar"
          ariaLabel="原材料搜索"
          summary={`命中 ${visibleRecords.length} / ${records.length} 条；成本和单价只给有权限账号查看。`}
          secondarySummary={`${activeTab} · 原材料入库`}
        >
          <label className="search small">
            <SearchOutlined />
            <input placeholder="搜索供应商 / 供应商单号 / ERP 入库单 / 原料 / 颜色 / 批号" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          </label>
        </FilterBar>
        <MetricStrip items={metrics} ariaLabel="原材料状态摘要" />
        <DataTable
          className="raw-material-inbound-table"
          columns={["供应商", "外部/内部单号", "原料", "规格/颜色", "卷/重量", "状态", "下一步"]}
          rows={visibleRecords.map((item) => ({
            id: item.id,
            active: item.id === selected?.id,
            tone: getRawMaterialInboundTone(item.status),
            onClick: () => setSelectedId(item.id),
            cells: [
              item.supplierName,
              formatRawMaterialDeliveryNoteNo(item),
              item.productName || item.materialType,
              `${item.spec} / ${item.factoryColor || item.supplierColor}`,
              `${item.rollCount || item.rolls?.length || 0}${item.materialType === "提手" ? "件" : "卷"} / ${formatRawMaterialWeight(item)}`,
              item.status,
              item.nextStep,
            ],
          }))}
        />
      </OperationalPanel>
      <DetailPane
        className="raw-material-detail-pane"
        title={selected ? `${selected.supplierName} · ${formatRawMaterialDeliveryNoteNo(selected)}` : "原材料入库"}
        subtitle={selected ? `${selected.status} · ${selected.source}` : "原材料送货单 OCR / 一卷一标"}
      >
        {selected ? (
          <>
            <InfoGrid
              rows={[
                ["原料", `${selected.productName || selected.materialType} / ${selected.materialType}`],
                ["外部/内部单号", formatRawMaterialDeliveryNoteNo(selected)],
                ["规格颜色", `${selected.spec} / ${selected.supplierColor} -> ${selected.factoryColor}`],
                ["卷/件数", `${selected.rollCount || selected.rolls?.length || 0}`],
                ["重量/单位", `${formatRawMaterialWeight(selected)} / ${selected.unit || "未填"}`],
                ["单价/金额", canViewCost ? formatRawMaterialCost(selected, money) : "成本权限可见"],
                ["库位", selected.location || "待分配"],
                ["OCR", selected.ocrStatus || "待识别"],
                ["签单", selected.signedNoteStatus || "待上传"],
              ]}
            />
            <section className="detail-section">
              <h3>入库动作</h3>
              <p>OCR 仅预填字段；供应商原始单号有则录、没有就留空，内部统一用 ERP 入库单号和卷号追踪；人工复核、打印卷标和贴标扫码是三个独立状态，不能跳过贴标扫码直接形成可用原材料库存。</p>
              <div className="action-row raw-material-actions">
                <button
                  className="primary-action"
                  disabled={reviewState.disabled || !canReviewRawMaterialInbound(selected)}
                  title={reviewState.title || (!canReviewRawMaterialInbound(selected) ? "当前状态无需复核" : "")}
                  onClick={() => onAction?.("复核送货单", selected.id)}
                >
                  复核送货单
                </button>
                <button
                  disabled={printState.disabled || !canPrintRawMaterialLabels(selected)}
                  title={printState.title || (!canPrintRawMaterialLabels(selected) ? "先完成送货单复核" : "")}
                  onClick={() => onAction?.("打印卷标", selected.id)}
                >
                  打印卷标
                </button>
                <button
                  disabled={attachState.disabled || !canConfirmRawMaterialAttachment(selected)}
                  title={attachState.title || (!canConfirmRawMaterialAttachment(selected) ? "先打印卷标并贴到实物" : "")}
                  onClick={() => onAction?.("确认贴标入库", selected.id)}
                >
                  确认全部贴标
                </button>
                <button
                  disabled={issueState.disabled || !canIssueRawMaterialToMachine(selected)}
                  title={issueState.title || (!canIssueRawMaterialToMachine(selected) ? "只有已贴标扫码可用的卷/件才能机边领料" : "")}
                  onClick={() => onAction?.("机边领料", selected.id, buildRawMaterialIssueOptions(selected, null, productionTasks))}
                >
                  全部机边领料
                </button>
                <button
                  disabled={exceptionState.disabled || selected.status === "入库异常/待确认"}
                  title={exceptionState.title || ""}
                  onClick={() => onAction?.("标记异常", selected.id, { reason: "页面手工标记异常。" })}
                >
                  标记异常
                </button>
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
            <section className="detail-section">
              <h3>卷/件标签</h3>
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
                      <span>{roll.consumptionStatus || roll.signedNoteStatus || "待扫码/签单"}</span>
                      <button
                        disabled={attachState.disabled || !canAttachRoll}
                        title={attachState.title || (!canAttachRoll ? "该卷/件还未到可贴标确认状态" : "")}
                        onClick={() => onAction?.("确认贴标入库", selected.id, { rollId: roll.id })}
                      >
                        贴标确认
                      </button>
                      <button
                        disabled={issueState.disabled || !canIssueRoll}
                        title={issueState.title || (!canIssueRoll ? "该卷/件还不是可用库存，或已经领到机边" : "")}
                        onClick={() => onAction?.("机边领料", selected.id, buildRawMaterialIssueOptions(selected, roll, productionTasks))}
                      >
                        机边领料
                      </button>
                      <button
                        disabled={issueState.disabled || !canPartialIssueRoll}
                        title={issueState.title || (!canPartialIssueRoll ? "只有有重量的可用卷料才能拆卷部分领料" : "")}
                        onClick={() => onAction?.("机边领料", selected.id, buildRawMaterialPartialIssueOptions(selected, roll, productionTasks))}
                      >
                        部分领料
                      </button>
                      <button
                        disabled={consumptionState.disabled || !canConfirmConsumption}
                        title={consumptionState.title || (!canConfirmConsumption ? "只有机边领用且待消耗确认的卷/件才能确认消耗" : "")}
                        onClick={() => onAction?.("确认消耗", selected.id, buildRawMaterialConsumptionOptions(selected, roll))}
                      >
                        确认消耗
                      </button>
                      <button
                        disabled={consumptionState.disabled || !canPartialConsumeRoll}
                        title={consumptionState.title || (!canPartialConsumeRoll ? "只有有重量的机边卷料才能登记部分消耗" : "")}
                        onClick={() => onAction?.("确认消耗", selected.id, buildRawMaterialPartialConsumptionOptions(selected, roll))}
                      >
                        部分消耗
                      </button>
                      <button
                        disabled={leftoverState.disabled || !canReturnLeftover}
                        title={leftoverState.title || (!canReturnLeftover ? "只有机边领用的卷/件才能退回余料" : "")}
                        onClick={() => onAction?.("余料退回", selected.id, buildRawMaterialLeftoverReturnOptions(selected, roll))}
                      >
                        余料退回
                      </button>
                      <button
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
            </section>
            <section className="detail-section">
              <h3>机边领料 / 消耗</h3>
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
                {!(
                  (selected.rawMaterialIssueRecords ?? []).length ||
                  (selected.rawMaterialSplitRecords ?? []).length ||
                  (selected.rawMaterialConsumptionRecords ?? []).length ||
                  (selected.rawMaterialLeftoverReturnRecords ?? []).length ||
                  (selected.rawMaterialLeftoverReviewRecords ?? []).length ||
                  (selected.rawMaterialCostAllocationDrafts ?? []).length ||
                  (selected.rawMaterialCostAllocationConfirmations ?? []).length ||
                  (selected.rawMaterialCostLossCalibrations ?? []).length ||
                  (selected.rawMaterialOrderMarginSnapshots ?? []).length ||
                  (selected.rawMaterialOrderMarginReports ?? []).length
                ) ? <span>暂无机边领料 / 消耗 / 余料记录。</span> : null}
              </div>
            </section>
            <section className="detail-section">
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
                    <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleSupplierStatementImport} />
                  </label>
                  <span>{statementImportLoading ? "正在识别供应商月结单..." : "支持白侯重1-重5、北陈批号明细和通用字段预检查。"}</span>
                </div>
                {statementImport ? (
                  <SupplierStatementImportPreview
                    result={statementImport}
                    onSaveDraft={handleSaveSupplierStatementReviewDraft}
                    saving={statementReviewSaving}
                  />
                ) : null}
                <SupplierStatementReviewList
                  reviews={statementReviews}
                  meta={statementReviewMeta}
                  onConfirm={handleConfirmSupplierStatementReview}
                  onStatementConfirm={handleConfirmSupplierStatement}
                  onPayableDraftGenerate={handleGenerateSupplierPayableDraft}
                  onPaymentConfirm={handleConfirmSupplierPayment}
                  payableState={payableState}
                  paymentState={paymentState}
                  money={money}
                />
              </div>
            </section>
            <section className="detail-section">
              <h3>流程记录</h3>
              <Timeline items={buildRawMaterialInboundTimeline(selected)} />
            </section>
          </>
        ) : (
          <DataState title="暂无原材料入库单" detail="调整视图或搜索条件后重试。" compact />
        )}
      </DetailPane>
    </section>
  );
}

function SupplierStatementImportPreview({ result = {}, onSaveDraft, saving = false }) {
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

function formatSupplierStatementAdjustment(item = {}) {
  const typeLabel = item.typeLabel || (item.adjustmentType === "paper_tube_deduction" ? "纸管扣项" : "调整项");
  const amountText = item.amount != null ? `¥${formatSupplierAdjustmentNumber(item.amount)}` : "金额待确认";
  const formulaText = item.calculationBasis?.formulaText ? ` · ${item.calculationBasis.formulaText}` : "";
  const reportedText =
    item.supplierReportedAmount != null && item.supplierReportedAmount !== item.amount
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

function SupplierStatementReviewList({
  reviews = [],
  meta = {},
  onConfirm,
  onStatementConfirm,
  onPayableDraftGenerate,
  onPaymentConfirm,
  payableState = {},
  paymentState = {},
  money = (value) => `¥${value}`,
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
          const canConfirmStatement =
            review.reviewStatus === "reviewed" && String(review.status ?? "").includes("一致") && !review.statementConfirmationId;
          const canGeneratePayable =
            review.reviewStatus === "statement_confirmed" && review.statementConfirmationId && !review.supplierPayableId;
          const canConfirmPayment =
            review.supplierPayableId &&
            review.supplierPayableDraft &&
            review.paymentStatus !== "已确认付款" &&
            !review.supplierPaymentConfirmationId;
          return (
            <div className="supplier-statement-review-row" key={review.reviewId}>
              <div>
                <strong>{review.reviewId}</strong>
                <span>{review.supplierName || "供应商待补"} / {review.fileName || "文件名待补"}</span>
                <span>{review.summaryText || "等待复核摘要"}</span>
                {Array.isArray(review.adjustments) && review.adjustments.length ? (
                  <span>{formatSupplierStatementAdjustment(review.adjustments[0])}</span>
                ) : null}
                {review.statementConfirmationId ? (
                  <span>{review.statementConfirmationId} / {review.paymentStatus || "待财务付款确认"}</span>
                ) : null}
                {review.supplierPayableId ? (
                  <span>
                    {review.supplierPayableId} / {review.payableStatus || "待财务复核"} / {formatSupplierPayableAmount(review.supplierPayableDraft?.payableAmount ?? 0, money)}
                  </span>
                ) : null}
                {review.supplierPaymentConfirmationId ? (
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
                <button
                  disabled={!canGeneratePayable || payableState.disabled}
                  title={payableState.disabled ? payableState.title : (!canGeneratePayable ? "需先确认对账且不能重复生成应付" : "")}
                  onClick={() => onPayableDraftGenerate?.(review.reviewId)}
                >
                  生成应付
                </button>
                <button
                  disabled={!canConfirmPayment || paymentState.disabled}
                  title={paymentState.disabled ? paymentState.title : (!canConfirmPayment ? "需先生成应付草稿且不能重复确认付款" : "")}
                  onClick={() => onPaymentConfirm?.(review)}
                >
                  确认付款
                </button>
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

function canGenerateRawMaterialCostDraft(item = {}) {
  const existingConsumptionIds = new Set((item.rawMaterialCostAllocationDrafts ?? []).map((record) => record.consumptionRecordId).filter(Boolean));
  return (item.rawMaterialConsumptionRecords ?? []).some((record) => {
    if (existingConsumptionIds.has(record.consumptionRecordId)) return false;
    const issueRecord = (item.rawMaterialIssueRecords ?? []).find((issue) => issue.issueRecordId === record.issueRecordId)
      || (item.rawMaterialIssueRecords ?? []).find((issue) => issue.rollId === record.rollId);
    return Boolean(issueRecord?.productionTaskId && issueRecord?.productionTaskMatchStatus === "已匹配");
  });
}

function canConfirmRawMaterialCostDraft(item = {}) {
  return (item.rawMaterialCostAllocationDrafts ?? []).some((record) => !record.costConfirmationId && record.allocationStatus !== "已复核/待损耗校准");
}

function canCalibrateRawMaterialLoss(item = {}) {
  const calibratedConfirmationIds = new Set(
    (item.rawMaterialCostLossCalibrations ?? [])
      .flatMap((record) => [record.costConfirmationId, ...(record.costConfirmationIds ?? [])])
      .filter(Boolean),
  );
  return (item.rawMaterialCostAllocationConfirmations ?? []).some(
    (record) => !calibratedConfirmationIds.has(record.costConfirmationId) && record.lossCalibrationStatus !== "已校准/待毛利确认",
  );
}

function canGenerateRawMaterialMarginSnapshot(item = {}) {
  const snapshottedCalibrationIds = new Set(
    (item.rawMaterialOrderMarginSnapshots ?? []).flatMap((record) => record.lossCalibrationIds ?? []).filter(Boolean),
  );
  return (item.rawMaterialCostLossCalibrations ?? []).some(
    (record) => !snapshottedCalibrationIds.has(record.lossCalibrationId) && record.marginEffect !== "margin_snapshot_pending_review",
  );
}

function canReviewRawMaterialMarginSnapshot(item = {}) {
  const reportedSnapshotIds = new Set(
    (item.rawMaterialOrderMarginReports ?? []).flatMap((record) => record.marginSnapshotIds ?? []).filter(Boolean),
  );
  return (item.rawMaterialOrderMarginSnapshots ?? []).some((record) => {
    if (reportedSnapshotIds.has(record.marginSnapshotId)) return false;
    if (record.marginEffect === "reviewed_margin_report_snapshot" || record.reviewStatus === "已财务复核/报表可用") return false;
    const missingRevenue = (record.lineItems ?? []).some(
      (line) => Number(line.salesAmount || 0) <= 0 || line.marginStatus === "需补订单收入",
    );
    return !missingRevenue && !(record.warnings ?? []).some((warning) => String(warning).includes("缺少订单销售金额"));
  });
}

function buildRawMaterialIssueOptions(item = {}, roll = null, productionTasks = []) {
  const targetTask = findRawMaterialProductionTaskCandidate(item, productionTasks);
  const machineId = targetTask?.machineId || (item.materialType === "提手" ? "提手备料区" : "BAG-01");
  return {
    rollId: roll?.id,
    machineId,
    productionTaskId: targetTask?.productionTaskId || "",
    issuePurpose: "生产领料",
    issuedWeightKg: roll?.weightKg || undefined,
    issuedQuantity: roll && !roll.weightKg ? 1 : undefined,
    note: targetTask?.productionTaskId
      ? `V1 按生产任务 ${targetTask.productionTaskId} 领料；等待生产报工确认消耗，不生成成品数量或成本分摊。`
      : "V1 整卷/整件机边领料；未匹配生产任务时只允许先形成机边留痕，成本分摊前必须补关联。",
  };
}

function buildRawMaterialPartialIssueOptions(item = {}, roll = null, productionTasks = []) {
  const targetTask = findRawMaterialProductionTaskCandidate(item, productionTasks);
  const machineId = targetTask?.machineId || (item.materialType === "提手" ? "提手备料区" : "BAG-01");
  const fullWeight = Number(roll?.weightKg || 0);
  const issuedWeightKg = fullWeight > 0 ? Math.max(0.001, Math.round((fullWeight / 2) * 1000) / 1000) : undefined;
  return {
    rollId: roll?.id,
    machineId,
    productionTaskId: targetTask?.productionTaskId || "",
    issuePurpose: "生产领料",
    issuedWeightKg,
    partialIssue: true,
    note: targetTask?.productionTaskId
      ? `V1 按生产任务 ${targetTask.productionTaskId} 拆卷部分领料；剩余重量保留可用，等待后续称重复核和成本流程。`
      : "V1 拆卷部分领料；未匹配生产任务时只允许先形成机边留痕，成本分摊前必须补关联。",
  };
}

function findRawMaterialProductionTaskCandidate(item = {}, productionTasks = []) {
  if (item.materialType === "提手") return null;
  const materialColorKey = normalizeRawMaterialColorKey(item.factoryColor || item.supplierColor);
  const rows = (Array.isArray(productionTasks) ? productionTasks : [])
    .filter((task) => task?.productionTaskId)
    .filter((task) => {
      const taskType = String(task.taskType || task.productionTask?.taskType || "");
      if (taskType.includes("丝印")) return false;
      const taskColorKey = normalizeRawMaterialColorKey(task.bagColor || task.color || task.orderLine?.bagColor);
      return !materialColorKey || !taskColorKey || materialColorKey === taskColorKey;
    })
    .sort((left, right) => {
      const leftPublished = left.publishedScheduleId ? 0 : 1;
      const rightPublished = right.publishedScheduleId ? 0 : 1;
      if (leftPublished !== rightPublished) return leftPublished - rightPublished;
      return String(left.productionTaskId).localeCompare(String(right.productionTaskId));
    });
  return rows[0] || null;
}

function normalizeRawMaterialColorKey(value) {
  const text = String(value || "")
    .trim()
    .replace(/本白/g, "白")
    .replace(/大红/g, "红")
    .replace(/浅黄/g, "黄")
    .replace(/深黄/g, "黄")
    .replace(/色/g, "")
    .replace(/\s+/g, "");
  if (!text) return "";
  const hit = ["白", "黑", "红", "黄", "蓝", "绿", "灰", "粉", "紫", "橙"].find((token) => text.includes(token));
  return hit || text;
}

function buildRawMaterialConsumptionOptions(item = {}, roll = null) {
  return {
    rollId: roll?.id,
    machineId: roll?.machineId || item.machineId || (item.materialType === "提手" ? "提手备料区" : "制袋机-01"),
    productionTaskId: roll?.productionTaskId || item.productionTaskId || "",
    consumedWeightKg: roll?.weightKg || undefined,
    consumedQuantity: roll && !roll.weightKg ? 1 : undefined,
    machineCount: "",
    qualifiedOutputQuantity: 0,
    note: "V1 只确认整卷/整件消耗；机台计数只作动作证据，不生成成品数量或成本分摊。",
  };
}

function buildRawMaterialPartialConsumptionOptions(item = {}, roll = null) {
  const machineSideWeight = Number(roll?.weightKg || roll?.remainingMachineSideWeightKg || 0);
  const consumedWeightKg = machineSideWeight > 0 ? Math.max(0.001, Math.round((machineSideWeight / 2) * 1000) / 1000) : undefined;
  return {
    rollId: roll?.id,
    machineId: roll?.machineId || item.machineId || (item.materialType === "提手" ? "提手备料区" : "制袋机-01"),
    productionTaskId: roll?.productionTaskId || item.productionTaskId || "",
    consumedWeightKg,
    machineCount: "",
    qualifiedOutputQuantity: 0,
    partialConsumption: true,
    note: "V1 记录机边部分消耗，剩余重量仍在机边；机台计数只作动作证据，不生成成品数量或成本分摊。",
  };
}

function buildRawMaterialLeftoverReturnOptions(item = {}, roll = null) {
  return {
    rollId: roll?.id,
    machineId: roll?.machineId || item.machineId || (item.materialType === "提手" ? "提手备料区" : "制袋机-01"),
    productionTaskId: roll?.productionTaskId || item.productionTaskId || "",
    leftoverWeightKg: roll?.weightKg || undefined,
    leftoverQuantity: roll && !roll.weightKg ? 1 : undefined,
    returnLocation: "余料区",
    reason: "机边余料退回",
    note: "V1 余料退回先进入待复核，不自动变可用库存，不做成本分摊。",
  };
}

function buildRawMaterialLeftoverReviewOptions(_item = {}, roll = null) {
  const reviewedWeightKg = Number(roll?.leftoverWeightKg) || Number(roll?.weightKg) || undefined;
  return {
    rollId: roll?.id,
    reviewedWeightKg,
    reviewedQuantity: roll && !reviewedWeightKg ? Number(roll.leftoverQuantity || 1) : undefined,
    reviewLocation: "原料库-余料可用区",
    reason: "余料重新称重复核通过",
    note: "V1 余料复核只把退回余料转回可用原材料库存，不做成本分摊或毛利计算。",
  };
}

function buildRawMaterialLossCalibrationOptions(item = {}) {
  const latestConfirmation = [...(item.rawMaterialCostAllocationConfirmations ?? [])].reverse()[0] ?? {};
  const expectedOutputQuantity = Number(latestConfirmation.confirmedQuantity || 0) || 1000;
  const actualQualifiedOutputQuantity = Math.max(0, Math.round(expectedOutputQuantity * 0.98));
  return {
    expectedOutputQuantity,
    actualQualifiedOutputQuantity,
    note: "V1 损耗校准第一版；先形成待毛利确认的成本校准快照，不自动更新订单毛利。",
  };
}

function buildRawMaterialMarginSnapshotOptions() {
  return {
    note: "V1 订单毛利快照第一版；只供财务复核，不自动写客户对账或最终结算。",
  };
}

function buildRawMaterialMarginReviewOptions() {
  return {
    note: "V1 毛利快照财务复核第一版；生成内部毛利报表，不自动写客户对账或收款结算。",
  };
}

function getRawMaterialRollTone(roll = {}) {
  if (roll.inventoryStatus === "可用") return "success";
  if (roll.inventoryStatus === "机边领用") return "warning";
  if (roll.inventoryStatus === "已消耗") return "success";
  if (roll.inventoryStatus === "余料待复核") return "warning";
  if (roll.leftoverReviewRecordId) return "success";
  if (String(roll.inventoryStatus ?? "").includes("异常")) return "danger";
  return "neutral";
}

function formatRawMaterialWeight(item = {}) {
  const weight = Number(item.totalWeightKg || 0);
  if (!weight) return item.unit === "件" ? `${item.rollCount || item.rolls?.length || 0}件` : "未填重量";
  return `${weight}kg`;
}

function formatRawMaterialCost(item = {}, money) {
  const unitPrice = Number(item.unitPrice || 0);
  const amount = Number(item.amount || 0);
  const unit = item.unit || "单位";
  return `${money(unitPrice)}/${unit} / ${money(amount)}`;
}

function buildRawMaterialInboundTimeline(item = {}) {
  const rows = [
    `${item.receivedAt || "到货时间未填"} 原材料送货单拍照${item.deliveryNoteNo ? "" : "（供应商未提供单号）"}`,
    item.ocrStatus || "OCR 待识别",
  ];
  if (item.reviewedAt) rows.push(`${formatRawMaterialTimelineTime(item.reviewedAt)} ${item.reviewedBy || "办公室"}复核原材料送货单`);
  if (item.labelPrintedAt) rows.push(`${formatRawMaterialTimelineTime(item.labelPrintedAt)} ${item.labelPrintedBy || "库房"}打印卷标`);
  const attached = (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "可用");
  if (attached.length) rows.push(`已贴标扫码 ${attached.length}/${item.rolls?.length || attached.length} 卷/件`);
  const split = (item.rawMaterialSplitRecords ?? []).length;
  if (split) rows.push(`已拆卷部分领料 ${split} 次；剩余重量仍保留库存状态`);
  const issued = (item.rawMaterialIssueRecords ?? []).length;
  if (issued) rows.push(`已机边领料 ${issued} 卷/件；等待生产报工确认消耗`);
  const consumed = (item.rawMaterialConsumptionRecords ?? []).length;
  if (consumed) rows.push(`已确认消耗 ${consumed} 卷/件；仍不生成成品数量或成本分摊`);
  const returned = (item.rawMaterialLeftoverReturnRecords ?? []).length;
  if (returned) rows.push(`已退回余料 ${returned} 卷/件；等待重新称重 / 复核`);
  const leftoverReviewed = (item.rawMaterialLeftoverReviewRecords ?? []).length;
  if (leftoverReviewed) rows.push(`余料复核通过 ${leftoverReviewed} 卷/件；已转回可用库存`);
  const lossCalibrations = (item.rawMaterialCostLossCalibrations ?? []).length;
  if (lossCalibrations) rows.push(`损耗校准 ${lossCalibrations} 次；仍需毛利报表确认`);
  const marginSnapshots = (item.rawMaterialOrderMarginSnapshots ?? []).length;
  if (marginSnapshots) rows.push(`毛利快照 ${marginSnapshots} 次；等待财务复核，不写最终结算`);
  const marginReports = (item.rawMaterialOrderMarginReports ?? []).length;
  if (marginReports) rows.push(`毛利报表 ${marginReports} 次；已财务复核，客户对账仍走独立流程`);
  rows.push(item.nextStep || "等待下一步");
  return rows;
}

function formatRawMaterialIssueRecord(record = {}) {
  const quantity = Number(record.issuedWeightKg) > 0 ? `${record.issuedWeightKg}kg` : `${record.issuedQuantity || 1}${record.unit || "件"}`;
  const splitText = record.splitRecordId ? ` / 源卷 ${record.sourceRollId || "待补"} / 剩余 ${record.remainingWeightKg || 0}kg` : "";
  const machineSideRemaining = Number(record.remainingMachineSideWeightKg || 0) > 0 ? ` / 机边余 ${record.remainingMachineSideWeightKg}kg` : "";
  const taskMatch = record.productionTaskMatchStatus ? ` / ${record.productionTaskMatchStatus}${record.productionTaskId ? ` ${record.productionTaskId}` : ""}` : "";
  return `${record.issueRecordId || "领料记录"}：${record.rollId || "卷号待补"} / ${quantity}${splitText}${machineSideRemaining} / ${record.machineId || "机边待分配"}${taskMatch} / ${record.consumptionStatus || "待生产消耗确认"}`;
}

function formatRawMaterialSplitRecord(record = {}) {
  const taskMatch = record.productionTaskMatchStatus ? ` / ${record.productionTaskMatchStatus}${record.productionTaskId ? ` ${record.productionTaskId}` : ""}` : "";
  return `${record.splitRecordId || "拆卷记录"}：${record.sourceRollId || "源卷待补"} -> ${record.issuedRollId || "机边卷待补"} / 领 ${record.issuedWeightKg || 0}kg / 余 ${record.remainingWeightKg || 0}kg / ${record.machineId || "机边待分配"}${taskMatch}`;
}

function formatRawMaterialTaskMatch(item = {}) {
  const latestIssueRecord = [...(item.rawMaterialIssueRecords ?? [])].reverse()[0] ?? null;
  const status = item.productionTaskMatchStatus || latestIssueRecord?.productionTaskMatchStatus || "未关联生产任务";
  const taskId = item.productionTaskId || latestIssueRecord?.productionTaskId || "";
  const reason = item.productionTaskMatchReason || latestIssueRecord?.productionTaskMatchReason || "";
  const goodsSpec = item.productionTaskGoodsSpec || latestIssueRecord?.productionTaskGoodsSpec || "";
  return [status, taskId, goodsSpec, reason].filter(Boolean).join(" / ");
}

function formatRawMaterialConsumptionRecord(record = {}) {
  const quantity = Number(record.consumedWeightKg) > 0 ? `${record.consumedWeightKg}kg` : `${record.consumedQuantity || 1}${record.unit || "件"}`;
  const remaining = Number(record.remainingMachineSideWeightKg || 0) > 0 ? ` / 机边余 ${record.remainingMachineSideWeightKg}kg` : "";
  return `${record.consumptionRecordId || "消耗记录"}：${record.rollId || "卷号待补"} / ${quantity}${remaining} / ${record.machineId || "机边待分配"} / ${record.consumptionStatus || "已确认消耗"}`;
}

function formatRawMaterialLeftoverReturnRecord(record = {}) {
  const quantity = Number(record.leftoverWeightKg) > 0 ? `${record.leftoverWeightKg}kg` : `${record.leftoverQuantity || 1}${record.unit || "件"}`;
  const status = record.reviewStatus || record.consumptionStatus || "待复核";
  return `${record.leftoverReturnRecordId || "余料记录"}：${record.rollId || "卷号待补"} / ${quantity} / ${record.returnLocation || "余料区"} / ${status}`;
}

function formatRawMaterialLeftoverReviewRecord(record = {}) {
  const quantity = Number(record.reviewedWeightKg) > 0 ? `${record.reviewedWeightKg}kg` : `${record.reviewedQuantity || 1}${record.unit || "件"}`;
  return `${record.leftoverReviewRecordId || "余料复核"}：${record.rollId || "卷号待补"} / ${quantity} / ${record.reviewLocation || "原料库-余料可用区"} / 可用`;
}

function formatRawMaterialCostDraftSummary(item = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const count = item.rawMaterialCostAllocationDrafts?.length || item.costAllocationDraftCount || 0;
  if (!count) return "未生成";
  const status = item.costAllocationStatus || "成本草稿待复核";
  const amount = Number(item.costAllocationDraftAmount || 0);
  return canViewCost && amount > 0 ? `${status} / ${count} 条 / ${money(amount)}` : `${status} / ${count} 条`;
}

function formatRawMaterialCostConfirmationSummary(item = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const count = item.rawMaterialCostAllocationConfirmations?.length || item.costAllocationConfirmedCount || 0;
  if (!count) return "未确认";
  const status = item.costAllocationReviewStatus || item.costAllocationStatus || "已复核/待损耗校准";
  const amount = Number(item.costAllocationConfirmedAmount || 0);
  return canViewCost && amount > 0 ? `${status} / ${count} 次 / ${money(amount)}` : `${status} / ${count} 次`;
}

function formatRawMaterialLossCalibrationSummary(item = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const count = item.rawMaterialCostLossCalibrations?.length || item.lossCalibrationCount || 0;
  if (!count) return "待校准";
  const status = item.lossCalibrationStatus || item.costAllocationReviewStatus || "已校准/待毛利确认";
  const amount = Number(item.lossCalibrationAmount || 0);
  const rate = Number(item.lossCalibrationRatePercent || 0);
  const rateText = rate > 0 ? ` / 损耗 ${rate}%` : "";
  return canViewCost && amount > 0 ? `${status} / ${count} 次${rateText} / ${money(amount)}` : `${status} / ${count} 次${rateText}`;
}

function formatRawMaterialMarginSnapshotSummary(item = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const count = item.rawMaterialOrderMarginSnapshots?.length || item.marginSnapshotCount || 0;
  if (!count) return "待生成";
  const status = item.marginSnapshotStatus || item.costAllocationReviewStatus || "已生成/待财务复核";
  const grossProfit = Number(item.marginSnapshotGrossProfitAmount || 0);
  const rate = Number(item.marginSnapshotGrossMarginRatePercent || 0);
  const rateText = rate ? ` / ${rate}%` : "";
  return canViewCost ? `${status} / ${count} 次 / 毛利 ${money(grossProfit)}${rateText}` : `${status} / ${count} 次`;
}

function formatRawMaterialMarginReportSummary(item = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const count = item.rawMaterialOrderMarginReports?.length || item.marginReportCount || 0;
  if (!count) return "待复核";
  const status = item.marginReportStatus || item.costAllocationReviewStatus || "已生成内部毛利报表";
  const grossProfit = Number(item.marginReportGrossProfitAmount || item.marginSnapshotGrossProfitAmount || 0);
  const rate = Number(item.marginReportGrossMarginRatePercent || item.marginSnapshotGrossMarginRatePercent || 0);
  const rateText = rate ? ` / ${rate}%` : "";
  return canViewCost ? `${status} / ${count} 次 / 毛利 ${money(grossProfit)}${rateText}` : `${status} / ${count} 次`;
}

function formatRawMaterialCostAllocationDraft(record = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const quantity = Number(record.allocatedWeightKg) > 0
    ? `${record.allocatedWeightKg}kg`
    : `${record.allocatedQuantity || 1}${record.unit || "件"}`;
  const amount = canViewCost ? ` / ${money(record.allocatedCostAmount || 0)}` : "";
  const task = record.productionTaskId ? ` / ${record.productionTaskId}` : "";
  const goods = record.productionTaskGoodsSpec ? ` / ${record.productionTaskGoodsSpec}` : "";
  return `${record.costAllocationDraftId || "成本草稿"}：${record.rollId || "卷号待补"} / ${quantity}${amount}${task}${goods} / ${record.allocationStatus || "草稿/待成本复核"}`;
}

function formatRawMaterialCostAllocationConfirmation(record = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const quantity = Number(record.confirmedWeightKg) > 0
    ? `${record.confirmedWeightKg}kg`
    : `${record.confirmedQuantity || record.confirmedCount || 1}项`;
  const amount = canViewCost ? ` / ${money(record.confirmedCostAmount || 0)}` : "";
  const tasks = record.productionTaskIds?.length ? ` / ${record.productionTaskIds.join(",")}` : "";
  return `${record.costConfirmationId || "成本确认"}：${quantity}${amount}${tasks} / ${record.reviewStatus || "已复核/待损耗校准"}`;
}

function formatRawMaterialCostLossCalibration(record = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const quantity = Number(record.actualQualifiedOutputQuantity || 0) > 0 && Number(record.expectedOutputQuantity || 0) > 0
    ? `${record.actualQualifiedOutputQuantity}/${record.expectedOutputQuantity} 合格`
    : `${record.confirmedWeightKg || record.confirmedCount || 1}项`;
  const amount = canViewCost ? ` / ${money(record.confirmedCostAmount || 0)}` : "";
  const rate = Number(record.lossRatePercent || 0) > 0 ? ` / 损耗 ${record.lossRatePercent}%` : "";
  const tasks = record.productionTaskIds?.length ? ` / ${record.productionTaskIds.join(",")}` : "";
  return `${record.lossCalibrationId || "损耗校准"}：${quantity}${amount}${rate}${tasks} / ${record.calibrationStatus || "已校准/待毛利确认"}`;
}

function formatRawMaterialOrderMarginSnapshot(record = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const lineCount = record.lineItems?.length || record.orderLineIds?.length || 0;
  const amount = canViewCost
    ? ` / 收 ${money(record.totalSalesAmount || 0)} / 料 ${money(record.totalMaterialCostAmount || 0)} / 毛利 ${money(record.grossProfitAmount || 0)}`
    : "";
  const rate = canViewCost && Number(record.grossMarginRatePercent || 0) ? ` / ${record.grossMarginRatePercent}%` : "";
  const lines = record.orderLineIds?.length ? ` / ${record.orderLineIds.join(",")}` : "";
  return `${record.marginSnapshotId || "毛利快照"}：${lineCount || 1} 单${amount}${rate}${lines} / ${record.reviewStatus || "已生成/待财务复核"}`;
}

function formatRawMaterialOrderMarginReport(record = {}, canViewCost = false, money = (value) => `¥${value}`) {
  const lineCount = record.lineItems?.length || record.orderLineIds?.length || 0;
  const amount = canViewCost
    ? ` / 收 ${money(record.totalSalesAmount || 0)} / 料 ${money(record.totalMaterialCostAmount || 0)} / 毛利 ${money(record.grossProfitAmount || 0)}`
    : "";
  const rate = canViewCost && Number(record.grossMarginRatePercent || 0) ? ` / ${record.grossMarginRatePercent}%` : "";
  const snapshots = record.marginSnapshotIds?.length ? ` / 快照 ${record.marginSnapshotIds.join(",")}` : "";
  return `${record.marginReportId || "毛利报表"}：${lineCount || 1} 单${amount}${rate}${snapshots} / ${record.reviewStatus || "已财务复核/报表可用"}`;
}

function formatRawMaterialTimelineTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
