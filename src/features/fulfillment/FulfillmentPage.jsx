import { useEffect, useRef, useState } from "react";
import {
  CarOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  InboxOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SearchOutlined,
  UnorderedListOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  DataState,
  DataTable,
  DetailPane,
  FilterBar,
  InfoGrid,
  OperationalPanel,
  Segmented,
  StatusPill,
  Timeline,
} from "../../shared/ui/operational.jsx";
import { formatAttachmentSize } from "../attachments/attachmentPresentation.js";
import {
  DelegatedBusinessDecisionFields,
  isDelegatedBusinessDecisionComplete,
} from "../../components/DelegatedBusinessDecisionFields.jsx";
import { BusinessDecisionHistoryPanel } from "../../components/BusinessDecisionHistoryPanel.jsx";
import { BusinessWriteConflictDialog } from "../../components/BusinessWriteConflictDialog.jsx";
import {
  formatBusinessDecisionChannelAndTime,
  getBusinessDecisionContentSummary,
} from "../../components/businessDecisionPresentation.js";
import {
  FULFILLMENT_DETAIL_TABS,
  FULFILLMENT_VIEWS,
  findDeliveryEvidenceFile,
  formatFulfillmentDispatchSummary,
  formatFulfillmentTableRemark,
  formatPaperOutboundDocument,
  fulfillmentMatchesQuery,
  fulfillmentMatchesView,
  getFulfillmentAttentionScore,
  getFulfillmentAttentionTone,
  getFulfillmentListProduct,
  getFulfillmentPaperTone,
} from "./fulfillmentPageModel.js";

export function FulfillmentPage({ authState, currentUser, tab, setTab, fulfillments, orderLines, selectedId, setSelectedId, onAction, onRefresh, helpers }) {
  const [priorityMode, setPriorityMode] = useState("关注优先");
  const [detailTab, setDetailTab] = useState("任务处理");
  const [fulfillmentView, setFulfillmentView] = useState("全部");
  const [query, setQuery] = useState("");
  const [varianceDraft, setVarianceDraft] = useState({
    resolutionResult: "",
    reason: "",
    delegatedDecision: {
      decisionChannel: "wechat",
      decidedAt: new Date().toISOString(),
      decisionContent: { summary: "" },
      authorizationBasis: "",
      evidenceDraftId: "",
      evidenceAttachmentIds: [],
    },
  });
  const [varianceConfirmation, setVarianceConfirmation] = useState(null);
  const [varianceSubmitting, setVarianceSubmitting] = useState(false);
  const varianceDialogRef = useRef(null);
  const varianceTriggerRef = useRef(null);
  const restoreVarianceTriggerRef = useRef(false);
  const [finalDeliveryConfirmation, setFinalDeliveryConfirmation] = useState(null);
  const [finalDeliverySubmitting, setFinalDeliverySubmitting] = useState(false);
  const finalDeliveryDialogRef = useRef(null);
  const finalDeliveryTriggerRef = useRef(null);
  const restoreFinalDeliveryTriggerRef = useRef(false);
  const [writeConflict, setWriteConflict] = useState(null);
  const {
    findCustomer,
    findOrderLine,
    getDeliveryEvidenceReviewStatus,
    getDeliveryEvidenceReviewTone,
    getFulfillmentActions,
    getFulfillmentGoodsDisplay,
    getFulfillmentNextStep,
    getUiActionState,
    getLineColorSpecLabel,
    getLinePrintSide,
    getLineRemark,
    isCustomProductLine,
    statusTone,
  } = helpers;
  const methodMatched = fulfillments.filter((item) => tab === "全部" || item.method === tab);
  const queryMatched = methodMatched.filter((item) => fulfillmentMatchesQuery(item, query, {
    findCustomer,
    findOrderLine,
    getFulfillmentGoodsDisplay,
    orderLines,
  }));
  const filtered = queryMatched.filter((item) => fulfillmentMatchesView(item, fulfillmentView));
  const visibleFulfillments = [...filtered].sort((left, right) => {
    if (priorityMode !== "关注优先") return 0;
    return getFulfillmentAttentionScore(right) - getFulfillmentAttentionScore(left);
  });
  const selected = visibleFulfillments.find((item) => item.id === selectedId) ?? visibleFulfillments[0] ?? null;
  const varianceDirectAllowed = authState?.permissions?.actionPermissions?.includes("fulfillment.quantity_variance.direct") === true;
  const fulfillmentViewTabs = FULFILLMENT_VIEWS.map((label) => ({
    label,
    count: queryMatched.filter((item) => fulfillmentMatchesView(item, label)).length,
  }));
  const activeFilterCount = Number(Boolean(query.trim())) + Number(tab !== "全部") + Number(fulfillmentView !== "全部") + Number(priorityMode !== "关注优先");
  const filterBar = (
    <>
      <FulfillmentStatusTabs value={fulfillmentView} items={fulfillmentViewTabs} onChange={setFulfillmentView} />
      <FilterBar
        className="fulfillment-filter-bar"
        ariaLabel="出库交付筛选"
        summary={`命中 ${visibleFulfillments.length} / ${fulfillments.length} 条交付任务。`}
        secondarySummary={`${tab === "全部" ? "全部交付方式" : tab} · ${priorityMode === "关注优先" ? "异常与急单优先" : "按原始顺序"}`}
        actions={(
          <button type="button" disabled={!activeFilterCount} onClick={resetFilters}>
            <ReloadOutlined /> 重置
          </button>
        )}
      >
        <div className="fulfillment-filter-grid">
          <label className="fulfillment-query-field">
            <span>关键词</span>
            <div className="fulfillment-query-control">
              <SearchOutlined aria-hidden="true" />
              <input
                aria-label="出库交付关键词"
                placeholder="客户 / 订单 / 货品 / 状态"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </label>
          <div className="fulfillment-filter-mode">
            <span>交付方式</span>
            <Segmented ariaLabel="交付方式" value={tab} onChange={setTab} items={["全部", "自提", "送货", "快递快运"]} />
          </div>
          <div className="fulfillment-filter-mode fulfillment-sort-mode">
            <span>排序</span>
            <Segmented ariaLabel="交付任务排序" value={priorityMode} onChange={setPriorityMode} items={["关注优先", "原始顺序"]} />
          </div>
        </div>
      </FilterBar>
    </>
  );

  function resetFilters() {
    setQuery("");
    setTab("全部");
    setFulfillmentView("全部");
    setPriorityMode("关注优先");
  }

  useEffect(() => {
    setVarianceConfirmation(null);
    setVarianceSubmitting(false);
    setFinalDeliveryConfirmation(null);
    setFinalDeliverySubmitting(false);
  }, [selected?.id]);

  useEffect(() => {
    if (varianceConfirmation) {
      varianceDialogRef.current?.focus();
      return;
    }
    if (!restoreVarianceTriggerRef.current) return;
    restoreVarianceTriggerRef.current = false;
    varianceTriggerRef.current?.focus();
  }, [varianceConfirmation]);

  useEffect(() => {
    if (finalDeliveryConfirmation) {
      finalDeliveryDialogRef.current?.focus();
      return;
    }
    if (!restoreFinalDeliveryTriggerRef.current) return;
    restoreFinalDeliveryTriggerRef.current = false;
    finalDeliveryTriggerRef.current?.focus();
  }, [finalDeliveryConfirmation]);

  if (!selected) {
    return (
      <section className="page-grid split-detail operational-split-workbench fulfillment-workbench">
        <OperationalPanel className="table-pane fulfillment-list-panel" ariaLabel="交付任务列表">
          {filterBar}
          <DataState title="没有匹配的交付任务" detail="调整状态、关键词或交付方式后重试。" />
        </OperationalPanel>
        <DetailPane className="fulfillment-detail-pane" title="出库交付" subtitle="暂无可显示任务">
          <DataState title="没有可显示的交付详情" compact />
        </DetailPane>
      </section>
    );
  }

  const selectedLine = findOrderLine(orderLines, selected.lineId);
  const customerInfo = findCustomer(selected.customerId);
  const actions = getFulfillmentActions(selected);
  const selectedGoods = getFulfillmentGoodsDisplay(selected, selectedLine);
  const selectedLineRemark = getLineRemark(selectedLine);
  const deliveryEvidenceFiles = Array.isArray(selected.deliveryEvidenceAttachmentFiles) ? selected.deliveryEvidenceAttachmentFiles : [];
  const watermarkedEvidenceFile = findDeliveryEvidenceFile(deliveryEvidenceFiles, selected.watermarkedPhotoAttachmentId, "delivery_watermark_photo");
  const signatureEvidenceFile = findDeliveryEvidenceFile(deliveryEvidenceFiles, selected.signaturePhotoAttachmentId, "signature_photo");
  const evidenceReviewStatus = getDeliveryEvidenceReviewStatus(selected);
  const evidenceReviewState = getUiActionState("fulfillment", "证据复核通过");
  const evidenceRejectState = getUiActionState("fulfillment", "退回重拍");
  const watermarkedViewState = getUiActionState("fulfillment", "查看水印照片");
  const signatureViewState = getUiActionState("fulfillment", "查看签收照片");
  const selectedPrintStatus =
    selected.printRecordStatus === "voided"
      ? `已作废，待重打 ${selected.printBatch ?? ""}`.trim()
      : selected.printed
        ? `已打印 ${selected.printBatch ?? ""}`.trim()
        : "未打印/预览";
  const paperStatus = selected.paperOutboundStatus || "待生成纸单";
  const physicalOutboundStatus = selected.physicalOutboundAt
    ? `已实物出库${selected.physicalExecutorEmployeeId ? ` / ${selected.physicalExecutorEmployeeId}` : ""}`
    : "未实物出库";
  const finalDeliveryStatus = selected.finalDeliveryStatus || (selected.status === "已交付" ? "已最终交付" : "未最终交付");
  const goodsRows = isCustomProductLine(selectedLine)
    ? [
        ["品名", selectedLine.product],
        ["尺寸", selectedLine.size],
        ["袋色/印色/提手色", `${selectedLine.color} / ${selectedLine.printColor || "印色待确认"} / ${selectedLine.handleColor || "同袋色/未特殊"}`],
        ["颜色简写", getLineColorSpecLabel(selectedLine)],
        ["单双面", getLinePrintSide(selectedLine)],
        ["备注", selectedLineRemark || "无"],
      ]
    : [["货品/规格", selectedGoods]];
  const selectedProductName = selectedLine?.product || selected.goods || "未命名货品";
  const selectedSpec = selectedLine
    ? [...new Set([
        selectedLine.size,
        getLineColorSpecLabel(selectedLine),
        isCustomProductLine(selectedLine) ? getLinePrintSide(selectedLine) : selectedLine.handle,
        selectedLineRemark,
      ].filter(Boolean))].join(" · ")
    : selectedGoods;

  function requestFinalDeliveryConfirmation(action) {
    if (finalDeliverySubmitting || finalDeliveryConfirmation) return;
    setWriteConflict(null);
    setFinalDeliveryConfirmation({
      action,
      fulfillment: structuredClone(selected),
      customerName: customerInfo.name,
      goods: selectedGoods,
      idempotencyKey: buildFinalDeliveryIdempotencyKey(selected.id, selected.revision, action),
    });
  }

  function requestVarianceConfirmation() {
    if (!selected || varianceSubmitting || varianceConfirmation) return;
    setWriteConflict(null);
    setVarianceConfirmation({
      fulfillment: structuredClone(selected),
      customerName: customerInfo.name,
      goods: selectedGoods,
      draft: structuredClone(varianceDraft),
      idempotencyKey: buildBusinessWriteIdempotencyKey("fulfillment-variance", selected.id, selected.revision),
    });
  }

  function returnToVarianceEdit() {
    if (varianceSubmitting) return;
    restoreVarianceTriggerRef.current = true;
    setVarianceConfirmation(null);
  }

  function returnToFinalDeliveryEdit() {
    if (finalDeliverySubmitting) return;
    restoreFinalDeliveryTriggerRef.current = true;
    setFinalDeliveryConfirmation(null);
  }

  async function submitFinalDelivery() {
    if (!finalDeliveryConfirmation || finalDeliverySubmitting) return;
    setFinalDeliverySubmitting(true);
    const snapshot = finalDeliveryConfirmation;
    const result = await onAction(snapshot.action, snapshot.fulfillment.id, {
      confirmedFinalDelivery: true,
      expectedRevision: Number(snapshot.fulfillment.revision ?? 0),
      idempotencyKey: snapshot.idempotencyKey,
    });
    setFinalDeliverySubmitting(false);
    setFinalDeliveryConfirmation(null);
    if (result?.error?.code === "BUSINESS_WRITE_CONFLICT" || result?.error?.status === 409) {
      setWriteConflict(result.error);
    }
  }
  return (
    <section className="page-grid split-detail operational-split-workbench fulfillment-workbench">
      <OperationalPanel className="table-pane fulfillment-list-panel" ariaLabel="交付任务列表">
        {filterBar}
        <DataTable
          className="fulfillment-table"
          columns={["客户 / 订单", "货品与规格", "方式 / 最晚", "数量 / 包裹", "状态", "提示"]}
          rows={visibleFulfillments.map((row) => {
            const rowLine = findOrderLine(orderLines, row.lineId);
            const rowGoods = getFulfillmentListProduct(row, rowLine, getFulfillmentGoodsDisplay);
            const rowRemark = formatFulfillmentTableRemark(row);
            return {
              id: row.id,
              active: row.id === selected.id,
              tone: statusTone(row.status),
              onClick: () => setSelectedId(row.id),
              cells: [
                <FulfillmentCell primary={findCustomer(row.customerId).name} secondary={row.lineId.slice(-5)} />,
                <FulfillmentCell primary={rowGoods.primary} secondary={rowGoods.secondary} />,
                <FulfillmentCell primary={row.method} secondary={row.latest} />,
                <FulfillmentQuantity qty={row.qty} packages={row.packages} />,
                <StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill>,
                <StatusPill tone={getFulfillmentAttentionTone(row, rowRemark)}>{rowRemark}</StatusPill>,
              ],
            };
          })}
        />
      </OperationalPanel>
      <DetailPane className="fulfillment-detail-pane" title={`${selected.method} · ${selected.status}`} subtitle={`${customerInfo.name} · ${selected.lineId}`}>
        <div className="fulfillment-detail-scroll">
          <div className="fulfillment-detail-overview">
            <div className="fulfillment-detail-statuses" aria-label="当前交付状态">
              <StatusPill tone="neutral">{selected.method}</StatusPill>
              <StatusPill tone={statusTone(selected.status)}>{selected.status}</StatusPill>
              <StatusPill tone={getFulfillmentPaperTone(selected)}>{paperStatus}</StatusPill>
              <StatusPill tone={selected.physicalOutboundAt ? "success" : "neutral"}>{physicalOutboundStatus}</StatusPill>
              <StatusPill tone={selected.finalDeliveryAt || selected.status === "已交付" ? "success" : "neutral"}>{finalDeliveryStatus}</StatusPill>
              {selected.method === "送货" ? <StatusPill tone={getDeliveryEvidenceReviewTone(evidenceReviewStatus)}>{evidenceReviewStatus}</StatusPill> : null}
            </div>
            <div className="fulfillment-detail-product">
              <div>
                <span>货品摘要</span>
                <strong>{selectedProductName}</strong>
                <small>{selectedSpec}</small>
              </div>
              <dl>
                <div><dt>数量</dt><dd>{selected.qty}<small> 个</small></dd></div>
                <div><dt>包裹</dt><dd>{selected.packages}</dd></div>
              </dl>
            </div>
          </div>
          <div className="operational-detail-tabs">
            <Segmented ariaLabel="交付详情视图" value={detailTab} onChange={setDetailTab} items={FULFILLMENT_DETAIL_TABS} />
          </div>
          <div hidden={detailTab !== "任务处理"}>
            <FulfillmentDetailSection title="任务信息">
              <FulfillmentDetailFacts
                rows={[
                  ["联系人", `${customerInfo.contact} ${customerInfo.phone}`],
                  ["地址", customerInfo.address],
                  ["库存来源", `${selected.zone} / ${selected.source}`],
                  ["纸质出库单", formatPaperOutboundDocument(selected)],
                  ["纸单交库房", selected.paperOutboundDocument?.handedToWarehouseAt ? `${selected.paperOutboundDocument.handedToWarehouseAt} / ${selected.paperOutboundDocument.handedToWarehouseBy || "办公室待确认"}` : "未交库房"],
                  ["库房实物执行", selected.physicalOutboundAt ? `${selected.physicalExecutorEmployeeId || "执行人待确认"} / ${selected.physicalOutboundAt}` : "未登记"],
                  ["最终交付", selected.finalDeliveryAt || (selected.status === "已交付" ? "已完成，时间待补" : "未最终交付")],
                  ["实际数量", selected.actualQty == null ? "未填" : `${selected.actualQty} 个`],
                  ...(selected.method === "送货"
                    ? [
                        ["派单路线", formatFulfillmentDispatchSummary(selected)],
                        ["计划发车", selected.plannedDepartureAt || "未排"],
                      ]
                    : []),
                ]}
              />
            </FulfillmentDetailSection>
            <FulfillmentDetailSection title="货品信息">
              <FulfillmentDetailFacts rows={goodsRows} />
            </FulfillmentDetailSection>
            <section className="fulfillment-next-step" aria-label="下一步">
              <strong>下一步</strong>
              <p>{getFulfillmentNextStep(selected)}</p>
            </section>
            {(selected.exceptionReason || selected.status.includes("数量") || selected.status.includes("无法")) && (
              <section className="fulfillment-exception" role="alert">
                <strong><WarningOutlined /> 异常处理</strong>
                <p>{selected.exceptionReason ? `${selected.exceptionReason}；` : ""}需办公室确认客户沟通、改单、补货或重打单据。</p>
              </section>
            )}
            {selected.status.includes("数量") ? (
              <section className="fulfillment-variance-resolution">
                <div className="section-head-row"><h3>数量差异处理</h3><span>现场事实已记录，本区仅录经营处理决定</span></div>
                <div className="fulfillment-variance-resolution__fields">
                  <label><span>处理结果</span><select value={varianceDraft.resolutionResult} onChange={(event) => setVarianceDraft({ ...varianceDraft, resolutionResult: event.target.value })}><option value="">请选择</option>{["按实际数量出库", "补货后再出库", "赠送数量", "暂停等待确认", "作废本次出库指令"].map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label><span>处理说明</span><input value={varianceDraft.reason} onChange={(event) => setVarianceDraft({ ...varianceDraft, reason: event.target.value })} /></label>
                </div>
                {!varianceDirectAllowed ? (
                  <DelegatedBusinessDecisionFields
                    scope="fulfillment_quantity_variance"
                    businessType="fulfillment"
                    businessId={selected.id}
                    authState={authState}
                    operatorId={currentUser?.userId}
                    operatorName={currentUser?.displayName}
                    value={varianceDraft.delegatedDecision}
                    onChange={(delegatedDecision) => setVarianceDraft({ ...varianceDraft, delegatedDecision })}
                    title="数量差异决定代录"
                    disabled={varianceSubmitting || Boolean(varianceConfirmation)}
                  />
                ) : null}
                <div className="action-row"><button ref={varianceTriggerRef} className="primary-action" disabled={!varianceDraft.resolutionResult || !varianceDraft.reason.trim() || (!varianceDirectAllowed && !isDelegatedBusinessDecisionComplete(varianceDraft.delegatedDecision))} onClick={requestVarianceConfirmation}>复核处理摘要</button></div>
                {varianceConfirmation ? (
                  <div
                    className="fulfillment-variance-confirmation"
                    role="dialog"
                    aria-modal="true"
                    aria-label="确认数量差异处理"
                    ref={varianceDialogRef}
                    tabIndex={-1}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape") return;
                      event.preventDefault();
                      returnToVarianceEdit();
                    }}
                  >
                    <h3>确认数量差异处理</h3>
                    <InfoGrid rows={[
                      ["任务 / 客户", `${varianceConfirmation.fulfillment.id} / ${varianceConfirmation.customerName}`],
                      ["货品", varianceConfirmation.goods],
                      ["纸单数量 / 实际数量", `${varianceConfirmation.fulfillment.qty} / ${varianceConfirmation.fulfillment.actualQty ?? "待确认"}`],
                      ["处理结果", varianceConfirmation.draft.resolutionResult],
                      ["处理说明", varianceConfirmation.draft.reason],
                      ["业务决定人", varianceConfirmation.draft.delegatedDecision.decisionMakerEmployeeId || "当前管理账号"],
                      ["系统操作人", currentUser?.displayName || currentUser?.userId],
                      ["决定渠道 / 时间", formatBusinessDecisionChannelAndTime(varianceDirectAllowed ? null : varianceConfirmation.draft.delegatedDecision)],
                      ["决定内容", getBusinessDecisionContentSummary({ delegatedDecision: varianceDirectAllowed ? null : varianceConfirmation.draft.delegatedDecision, directSummary: varianceConfirmation.draft.reason })],
                      ["授权依据", varianceConfirmation.draft.delegatedDecision.authorizationBasis || "本人当前有效授权"],
                      ["预计影响", "更新差异记录、待办、出库状态和审计；本命令不直接扣库存、不生成对账。"],
                    ]} />
                    <div className="action-row"><button disabled={varianceSubmitting} onClick={returnToVarianceEdit}>返回修改</button><button className="primary-action" disabled={varianceSubmitting} onClick={async () => {
                      setVarianceSubmitting(true);
                      const snapshot = varianceConfirmation;
                      const result = await onAction("处理数量差异", snapshot.fulfillment.id, {
                        expectedRevision: Number(snapshot.fulfillment.revision ?? 0),
                        idempotencyKey: snapshot.idempotencyKey,
                        resolutionResult: snapshot.draft.resolutionResult,
                        reason: snapshot.draft.reason,
                        ...(varianceDirectAllowed ? { directDecisionContent: { summary: snapshot.draft.reason } } : { delegatedDecision: snapshot.draft.delegatedDecision }),
                      });
                      setVarianceSubmitting(false);
                      setVarianceConfirmation(null);
                      if (result?.error?.code === "BUSINESS_WRITE_CONFLICT" || result?.error?.status === 409) setWriteConflict(result.error);
                      else if (!result?.error) setVarianceDraft(createFulfillmentVarianceDraft());
                    }}>{varianceSubmitting ? "提交中…" : "确认提交"}</button></div>
                  </div>
                ) : null}
                <BusinessDecisionHistoryPanel authState={authState} operatorId={currentUser?.userId} businessType="fulfillment" businessId={selected.id} />
              </section>
            ) : null}
            <div className="action-row operational-detail-actions fulfillment-detail-actions">
              {actions.map((item) => {
                const actionState = getUiActionState("fulfillment", item.label);
                const isFinalDeliveryAction = item.label === "确认最终自提" || item.label === "确认已拉走";
                return (
                  <button
                    className={item.variant === "primary" ? "primary-action" : ""}
                    disabled={actionState.disabled || (isFinalDeliveryAction && (finalDeliverySubmitting || Boolean(finalDeliveryConfirmation)))}
                    key={item.label}
                    ref={isFinalDeliveryAction ? finalDeliveryTriggerRef : undefined}
                    title={actionState.title}
                    onClick={() => isFinalDeliveryAction ? requestFinalDeliveryConfirmation(item.label) : onAction(item.label, selected.id)}
                  >
                    <FulfillmentActionIcon label={item.label} /> {item.label}
                  </button>
                );
              })}
            </div>
            {finalDeliveryConfirmation ? (
              <section
                className="fulfillment-final-delivery-confirmation"
                role="dialog"
                aria-modal="true"
                aria-labelledby="fulfillment-final-delivery-title"
                ref={finalDeliveryDialogRef}
                tabIndex={-1}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  returnToFinalDeliveryEdit();
                }}
              >
                <h3 id="fulfillment-final-delivery-title">确认最终交付</h3>
                <InfoGrid rows={[
                  ["任务 / 客户", `${finalDeliveryConfirmation.fulfillment.id} / ${finalDeliveryConfirmation.customerName}`],
                  ["货品 / 方式", `${finalDeliveryConfirmation.goods} / ${finalDeliveryConfirmation.fulfillment.method}`],
                  ["纸单数量 / 实际数量", `${finalDeliveryConfirmation.fulfillment.qty} / ${finalDeliveryConfirmation.fulfillment.actualQty ?? "未记录"}`],
                  ["包裹", finalDeliveryConfirmation.fulfillment.packages || "未记录"],
                  ["纸质出库单", formatPaperOutboundDocument(finalDeliveryConfirmation.fulfillment)],
                  ["库房实物执行", `${finalDeliveryConfirmation.fulfillment.physicalExecutorEmployeeId || "未记录"} / ${finalDeliveryConfirmation.fulfillment.physicalOutboundAt || "未记录"}`],
                  ["反馈渠道", finalDeliveryConfirmation.fulfillment.latestWarehouseExecution?.feedbackChannel || "未记录"],
                  ["系统操作人", currentUser?.displayName || currentUser?.userId],
                  ["预计影响", "确认最终交接、创建对账候选并写入审计；库存已在库房实物出库时扣减，本次不会重复扣减。"],
                ]} />
                <div className="action-row">
                  <button type="button" disabled={finalDeliverySubmitting} onClick={returnToFinalDeliveryEdit}>返回修改</button>
                  <button type="button" className="primary-action" disabled={finalDeliverySubmitting} onClick={submitFinalDelivery}>
                    {finalDeliverySubmitting ? "提交中…" : "确认最终交付"}
                  </button>
                </div>
              </section>
            ) : null}
          </div>
          <div hidden={detailTab !== "单据/证据"}>
            <section className="detail-section document-preview operational-detail-section-first">
              <h3>纸质出库单与打印证据</h3>
              <p>{formatPaperOutboundDocument(selected)} / {selectedPrintStatus}</p>
              <p>{customerInfo.name} / {selectedGoods} / {selected.packages}</p>
              <small>打印确认不等于实物出库；纸单须交库房后，再由办公室回录库房实物结果。</small>
            </section>
            {selected.method === "送货" && (
              <section className={`detail-section delivery-evidence-review ${evidenceReviewStatus === "需重拍" ? "alert" : ""}`}>
                <div className="section-head-row">
                  <h3>送达证据复核</h3>
                  <StatusPill tone={getDeliveryEvidenceReviewTone(evidenceReviewStatus)}>{evidenceReviewStatus}</StatusPill>
                </div>
                <div className="delivery-evidence-cards">
                  <DeliveryEvidenceCard
                    title="水印照片"
                    required
                    attachmentId={selected.watermarkedPhotoAttachmentId}
                    file={watermarkedEvidenceFile}
                    emptyText="未提交水印照片"
                    actionState={watermarkedViewState}
                    onView={() => onAction("查看水印照片", selected.id, { attachmentId: selected.watermarkedPhotoAttachmentId })}
                  />
                  <DeliveryEvidenceCard
                    title="签收照片"
                    attachmentId={selected.signaturePhotoAttachmentId}
                    file={signatureEvidenceFile}
                    emptyText="未提交，可选"
                    actionState={signatureViewState}
                    onView={() => onAction("查看签收照片", selected.id, { attachmentId: selected.signaturePhotoAttachmentId })}
                  />
                </div>
                <InfoGrid
                  rows={[
                    ["水印编号", selected.watermarkId || watermarkedEvidenceFile?.metadata?.watermarkId || "待生成"],
                    ["拍摄/提交时间", selected.watermarkCapturedAt || watermarkedEvidenceFile?.metadata?.watermarkCapturedAt || selected.completedAt || "未记录"],
                    ["定位", [selected.watermarkLocationLabel || watermarkedEvidenceFile?.metadata?.watermarkLocationLabel, selected.watermarkGeoPoint || watermarkedEvidenceFile?.metadata?.watermarkGeoPoint].filter(Boolean).join(" / ") || "未记录"],
                    ["复核记录", selected.deliveryEvidenceReviewedAt ? `${selected.deliveryEvidenceReviewedBy || "未知账号"} / ${selected.deliveryEvidenceReviewedAt}` : selected.deliveryEvidenceIssueReason || "未复核"],
                  ]}
                />
                <div className="action-row">
                  <button
                    className="primary-action"
                    disabled={evidenceReviewState.disabled || !selected.watermarkedPhotoAttachmentId || evidenceReviewStatus === "已复核"}
                    title={evidenceReviewState.title || (!selected.watermarkedPhotoAttachmentId ? "缺少水印照片，不能复核通过" : evidenceReviewStatus === "已复核" ? "送达证据已复核" : "")}
                    onClick={() => onAction("证据复核通过", selected.id)}
                  >
                    <CheckCircleOutlined /> 证据复核通过
                  </button>
                  <button
                    disabled={evidenceRejectState.disabled || !selected.watermarkedPhotoAttachmentId}
                    title={evidenceRejectState.title || (!selected.watermarkedPhotoAttachmentId ? "缺少水印照片，不能退回重拍" : "")}
                    onClick={() => onAction("退回重拍", selected.id)}
                  >
                    <WarningOutlined /> 退回重拍
                  </button>
                </div>
              </section>
            )}
          </div>
          <div className="operational-detail-timeline fulfillment-detail-timeline" hidden={detailTab !== "流转记录"}>
            <Timeline
              items={[
                "办公室创建交付任务",
                `${formatPaperOutboundDocument(selected)} / ${selectedPrintStatus}`,
                selected.paperOutboundDocument?.handedToWarehouseAt ? `纸单已交库房：${selected.paperOutboundDocument.handedToWarehouseAt}` : "纸单尚未交库房",
                selected.physicalOutboundAt ? `库房实物已出库：${selected.physicalOutboundAt}` : "尚未登记库房实物出库",
                selected.finalDeliveryAt || selected.status === "已交付" ? "已最终交付，进入对账/收款" : "等待最终交付确认",
              ]}
            />
          </div>
        </div>
      </DetailPane>
      <BusinessWriteConflictDialog
        open={Boolean(writeConflict)}
        error={writeConflict}
        onBack={() => setWriteConflict(null)}
        onRefresh={async () => { setWriteConflict(null); setVarianceConfirmation(null); setFinalDeliveryConfirmation(null); await onRefresh?.(); }}
      />
    </section>
  );
}

function createFulfillmentVarianceDraft() {
  return {
    resolutionResult: "",
    reason: "",
    delegatedDecision: {
      decisionChannel: "wechat",
      decidedAt: new Date().toISOString(),
      decisionContent: { summary: "" },
      authorizationBasis: "",
      evidenceDraftId: "",
      evidenceAttachmentIds: [],
    },
  };
}

function buildFinalDeliveryIdempotencyKey(fulfillmentId, revision, action) {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const actionToken = action === "确认最终自提" ? "self-pickup" : action === "确认已拉走" ? "carrier-pickup" : "action";
  return `fulfillment-final:${fulfillmentId}:${revision}:${actionToken}:${uuid}`;
}

function buildBusinessWriteIdempotencyKey(scope, businessId, revision) {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${scope}:${businessId}:${revision}:${uuid}`;
}

function FulfillmentStatusTabs({ value, items, onChange }) {
  return (
    <div className="fulfillment-status-tabs" role="tablist" aria-label="交付状态快捷筛选">
      {items.map((item) => (
        <button type="button" role="tab" aria-selected={value === item.label} className={value === item.label ? "active" : ""} key={item.label} onClick={() => onChange(item.label)}>
          <span>{item.label}</span>
          <strong>{item.count}</strong>
        </button>
      ))}
    </div>
  );
}

function FulfillmentCell({ primary, secondary }) {
  return (
    <span className="fulfillment-cell-stack" title={`${primary} / ${secondary}`}>
      <strong>{primary}</strong>
      <small>{secondary}</small>
    </span>
  );
}

function FulfillmentQuantity({ qty, packages }) {
  return (
    <span className="fulfillment-quantity-cell">
      <strong>{qty}<small> 个</small></strong>
      <span>{packages}</span>
    </span>
  );
}

function FulfillmentDetailSection({ title, children }) {
  return (
    <section className="fulfillment-detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function FulfillmentDetailFacts({ rows }) {
  return (
    <dl className="fulfillment-detail-facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function FulfillmentActionIcon({ label }) {
  if (label.includes("打印") || label.includes("重打") || label.includes("作废旧")) return <PrinterOutlined aria-hidden="true" />;
  if (label.includes("纸单")) return <FileTextOutlined aria-hidden="true" />;
  if (label.includes("库房")) return <InboxOutlined aria-hidden="true" />;
  if (label.includes("完成") || label.includes("确认已")) return <CheckCircleOutlined aria-hidden="true" />;
  if (label.includes("备货")) return <InboxOutlined aria-hidden="true" />;
  if (label.includes("派单")) return <CarOutlined aria-hidden="true" />;
  if (label.includes("待办")) return <UnorderedListOutlined aria-hidden="true" />;
  if (label.includes("订单")) return <FileTextOutlined aria-hidden="true" />;
  return <WarningOutlined aria-hidden="true" />;
}

function DeliveryEvidenceCard({ title, required = false, attachmentId = "", file = null, emptyText = "未提交", actionState = {}, onView }) {
  const canView = Boolean(attachmentId);
  const statusText = attachmentId ? "已提交" : emptyText;
  const metaText = file
    ? [file.fileName || attachmentId, file.mimeType || file.contentType, formatAttachmentSize(file.fileSize)].filter(Boolean).join(" · ")
    : attachmentId || "无附件 ID";
  return (
    <div className="delivery-evidence-card">
      <div>
        <span>{title}{required ? " *" : ""}</span>
        <strong>{statusText}</strong>
        <small>{metaText}</small>
      </div>
      <button disabled={actionState.disabled || !canView} title={actionState.title || (!canView ? "没有可查看的附件" : "")} onClick={onView}>查看</button>
    </div>
  );
}
