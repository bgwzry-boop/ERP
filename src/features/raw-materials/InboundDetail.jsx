import { lazy, Suspense, useState } from "react";
import { DataState, DetailPane, Timeline } from "../../shared/ui/operational.jsx";
import { RawMaterialDetailOverview } from "./RawMaterialInboundWorkbench.jsx";
import { RawMaterialInboundReceivingSections } from "./RawMaterialInboundReceivingSections.jsx";
import { buildRawMaterialInboundTimeline } from "./rawMaterialInboundWorkflow.js";
import { buildOcrLineReviewDraft } from "./rawMaterialInboundOcrDraft.js";
const RawMaterialRecordHistory = lazy(() => import("./RawMaterialRecordHistory.jsx").then((module) => ({ default: module.RawMaterialRecordHistory })));
const RawMaterialMobileOcrReview = lazy(() => import("./RawMaterialMobileOcrReview.jsx").then((module) => ({
  default: module.RawMaterialMobileOcrReview,
})));

export function InboundDetail({ state, headerFacts = null, focusedReceipt = false }) {
  const [actionDock, setActionDock] = useState(null);
  const {
    authState,
    currentUser,
    onAction,
    meta,
    firstReleaseMode,
    money,
    deliveryNotePreviewByInboundId,
    ocrReviewSubmitting,
    ocrDraftDiscarding,
    ocrDirectionCorrecting,
    ocrReviewSubmitError,
    ocrReviewDraft,
    setOcrReviewDraft,
    ocrLineReviewDraft,
    setOcrLineReviewDraft,
    labelVerification,
    setLabelVerification,
    issueSelection,
    setIssueSelection,
    selected,
    selectedStock,
    selectedTaskCandidate,
    selectedOrderSupport,
    canViewCost,
    reviewState,
    voidDraftState,
    printState,
    attachState,
    issueState,
    consumptionState,
    leftoverState,
    leftoverReviewState,
    exceptionState,
    colorMappingState,
    mobileOcrReviewActive,
    openSupplierColorMapping,
    handleMobileStageChange,
    handleDiscardMobileOcrDraft,
    handleCorrectMobileOcrToSupplierReturn,
    handleOcrReviewConfirm,
    handleOfficeReviewConfirm,
    handleOfficeException,
    handlePrintLabels,
    handleReprintLabel,
  } = state;
  return (<DetailPane
        className={`raw-material-detail-pane ${mobileOcrReviewActive ? "has-mobile-ocr-review" : ""}`}
        title={selected?.supplierName ?? "原材料入库"}
        subtitle={focusedReceipt ? "本单信息" : selected?.status ?? "原材料入库"}
      >
        <button className="raw-material-mobile-back" onClick={() => handleMobileStageChange("home")} type="button">返回收货步骤</button>
        {mobileOcrReviewActive ? (
          <Suspense fallback={<DataState title="正在打开核对页面" description="正在载入逐卷核对清单…" />}>
            <RawMaterialMobileOcrReview
              authState={authState}
              disabled={reviewState.disabled}
              directionCorrectionDisabled={reviewState.disabled}
              directionCorrecting={ocrDirectionCorrecting}
              documentDraft={ocrReviewDraft}
              key={`${selected.id}:${selected.documentDirection || "supplier_delivery"}`}
              lineDrafts={ocrLineReviewDraft}
              discardDisabled={voidDraftState.disabled}
              discardDisabledReason={voidDraftState.title}
              discarding={ocrDraftDiscarding}
              onBack={() => handleMobileStageChange("home")}
              onDocumentFieldChange={(key, value) => setOcrReviewDraft((current) => ({ ...current, [key]: value }))}
              onLineFieldChange={(lineId, key, value) => setOcrLineReviewDraft((current) => ({
                ...current,
                [lineId]: {
                  ...(current[lineId] ?? buildOcrLineReviewDraft(selected.ocrLines?.find((line) => line.lineId === lineId), selected.documentDirection)),
                  [key]: value,
                },
              }))}
              colorMappingDisabled={colorMappingState.disabled}
              colorMappingDisabledReason={colorMappingState.title}
              onOpenColorMapping={({ lineId, supplierColor }) => openSupplierColorMapping({
                lineId,
                supplierColor,
                supplierName: selected.supplierName,
                reason: "首次确认该厂家票面颜色与厂内标准色的对应关系",
              })}
              onCorrectDirection={handleCorrectMobileOcrToSupplierReturn}
              onDiscard={handleDiscardMobileOcrDraft}
              onSubmit={handleOcrReviewConfirm}
              operatorId={currentUser?.userId}
              selected={selected}
              sourcePreviewDataUrls={deliveryNotePreviewByInboundId[selected.id]}
              submitError={meta.error || ocrReviewSubmitError}
              submitting={ocrReviewSubmitting}
            />
          </Suspense>
        ) : null}
        {selected ? (
          <>
            {focusedReceipt ? null : <RawMaterialDetailOverview selected={selected} />}
            {headerFacts}
            <div className="raw-material-detail-scroll">
              <RawMaterialInboundReceivingSections
                actionDock={focusedReceipt ? actionDock : null}
                authState={authState}
                operatorId={currentUser?.userId}
                sourcePreviewDataUrls={deliveryNotePreviewByInboundId[selected.id]}
                actionError={ocrReviewSubmitError || meta.officeActionError || ""}
                actionStates={{
                  attach: attachState,
                  consumption: consumptionState,
                  exception: exceptionState,
                  issue: issueState,
                  leftover: leftoverState,
                  leftoverReview: leftoverReviewState,
                  print: printState,
                  review: reviewState,
                  voidDraft: voidDraftState,
                }}
                canViewCost={canViewCost}
                detailTab="入库标签"
                firstReleaseMode={firstReleaseMode}
                issueSelection={issueSelection}
                labelVerification={labelVerification}
                money={money}
                ocrLineReviewDraft={ocrLineReviewDraft}
                ocrReviewDraft={ocrReviewDraft}
                ocrReviewSubmitting={ocrReviewSubmitting}
                directionCorrecting={ocrDirectionCorrecting}
                onCorrectDirection={handleCorrectMobileOcrToSupplierReturn}
                onOpenColorMapping={openSupplierColorMapping}
                colorMappingState={colorMappingState}
                onAction={onAction}
                onOfficeException={handleOfficeException}
                onOfficeReviewConfirm={handleOfficeReviewConfirm}
                onPrintLabels={handlePrintLabels}
                onReprintLabel={handleReprintLabel}
                selected={selected}
                selectedOrderSupport={selectedOrderSupport}
                selectedStock={selectedStock}
                selectedTaskCandidate={selectedTaskCandidate}
                setIssueSelection={setIssueSelection}
                setLabelVerification={setLabelVerification}
                setOcrLineReviewDraft={setOcrLineReviewDraft}
                setOcrReviewDraft={setOcrReviewDraft}
              />
              <ReceiptOperationHistory
                key={selected.id}
                canViewCost={canViewCost}
                money={money}
                selected={selected}
              />
            </div>
            {focusedReceipt ? <div className="formal-receiving-action-dock" ref={setActionDock} /> : null}
          </>
        ) : (
          <DataState title="暂无原材料入库单" detail="调整视图或搜索条件后重试。" compact />
        )}
      </DetailPane>);
}

function ReceiptOperationHistory({ selected, canViewCost, money }) {
  const [open, setOpen] = useState(false);
  return <details className="raw-material-receipt-history" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>操作记录</summary>
    {open ? <div>
      <Timeline items={buildRawMaterialInboundTimeline(selected)} />
      <Suspense fallback={<p role="status">正在读取记录…</p>}><RawMaterialRecordHistory selected={selected} canViewCost={canViewCost} money={money} /></Suspense>
    </div> : null}
  </details>;
}
