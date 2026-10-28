import { lazy, Suspense, useRef } from "react";
import { DocumentCameraCapture } from "../../components/DocumentCameraCapture.jsx";
import { DataState, DetailPane, Segmented } from "../../shared/ui/operational.jsx";
import { RAW_MATERIAL_DETAIL_TABS, RawMaterialDetailOverview } from "./RawMaterialInboundWorkbench.jsx";
import { RawMaterialPurchasePanel } from "./RawMaterialPurchasePanel.jsx";
import { RawMaterialInboundReceivingSections } from "./RawMaterialInboundReceivingSections.jsx";
import { RawMaterialInboundSupportingSections } from "./RawMaterialInboundSupportingSections.jsx";
import { buildOcrLineReviewDraft } from "./rawMaterialInboundOcrDraft.js";
const RawMaterialMobileOcrReview = lazy(() => import("./RawMaterialMobileOcrReview.jsx").then((module) => ({
  default: module.RawMaterialMobileOcrReview,
})));
const RAW_MATERIAL_FIRST_RELEASE_DETAIL_TABS = ["入库标签", "扫码出库", "供应商账", "记录"];

export function InboundDetail({ state }) {
  const {
    authState,
    currentUser,
    onAction,
    meta,
    productionTasks,
    statementReviews,
    statementReviewMeta,
    firstReleaseMode,
    money,
    detailTab,
    setDetailTab,
    statementImport,
    statementImportLoading,
    statementReviewSaving,
    deliveryNoteOcrLoading,
    deliveryNoteOcrError,
    deliveryNoteOcrResult,
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
    costDraftState,
    costConfirmState,
    lossCalibrationState,
    marginSnapshotState,
    marginReviewState,
    payableState,
    paymentState,
    colorMappingState,
    mobileOcrReviewActive,
    openSupplierColorMapping,
    handleMobileStageChange,
    handleDiscardMobileOcrDraft,
    handleCorrectMobileOcrToSupplierReturn,
    handleDesktopDeliveryNoteRecognize,
    handleOcrReviewConfirm,
    handlePrintLabels,
    handleReprintLabel,
    handleSupplierStatementImport,
    handleSaveSupplierStatementReviewDraft,
    handleConfirmSupplierStatementReview,
    handleConfirmSupplierStatement,
    handleGenerateSupplierPayableDraft,
    handleConfirmSupplierPayment
  } = state;
  const systemCameraRef = useRef(null);
  return (<DetailPane
        className={`raw-material-detail-pane ${mobileOcrReviewActive ? "has-mobile-ocr-review" : ""}`}
        title={selected?.supplierName ?? "原材料入库"}
        subtitle={selected?.status ?? "原材料入库"}
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
        <div className="raw-material-ocr-upload-bar">
          <div className="raw-material-ocr-copy" title="供应商原始单号有则录、没有就留空">
            <strong>扫描或上传送货单</strong>
            <span>OCR 仅预填；识别不会直接入库</span>
          </div>
          <div className="raw-material-ocr-upload-actions">
            <DocumentCameraCapture
              className={`button-like raw-material-camera-button ${reviewState.disabled || deliveryNoteOcrLoading ? "is-disabled" : ""}`}
              disabled={reviewState.disabled || deliveryNoteOcrLoading}
              fileNamePrefix="delivery-note"
              label={deliveryNoteOcrLoading ? "正在识别…" : "用高拍仪/摄像头拍照"}
              onCapture={(file) => handleDesktopDeliveryNoteRecognize({ target: { files: [file], value: "" } })}
              onUseSystemCamera={() => systemCameraRef.current?.click()}
            />
            <input
              accept="image/jpeg,image/png,image/bmp"
              capture="environment"
              disabled={reviewState.disabled || deliveryNoteOcrLoading}
              hidden
              onChange={handleDesktopDeliveryNoteRecognize}
              ref={systemCameraRef}
              type="file"
            />
            <label
              className={`button-like raw-material-file-button ${reviewState.disabled || deliveryNoteOcrLoading ? "is-disabled" : ""}`}
              title={reviewState.title || "图片原图最大 30MB 并自动处理；PDF 暂限 7.5MB"}
            >
              {deliveryNoteOcrLoading ? "处理中…" : "扫描 / 上传送货单"}
              <input
                accept="image/png,image/jpeg,image/bmp,application/pdf"
                disabled={reviewState.disabled || deliveryNoteOcrLoading}
                hidden
                multiple
                onChange={handleDesktopDeliveryNoteRecognize}
                type="file"
              />
            </label>
          </div>
          {deliveryNoteOcrResult ? <span className="raw-material-ocr-success" role="status">{deliveryNoteOcrResult}</span> : null}
          {deliveryNoteOcrError ? <span className="raw-material-ocr-error" role="alert">{deliveryNoteOcrError}</span> : null}
        </div>
        {firstReleaseMode ? null : <RawMaterialPurchasePanel authState={authState} currentUser={currentUser} />}
        {selected ? (
          <>
            <RawMaterialDetailOverview selected={selected} />
            <div className="operational-detail-tabs raw-material-detail-tabs">
              <Segmented ariaLabel="原材料详情视图" value={detailTab} onChange={setDetailTab} items={firstReleaseMode ? RAW_MATERIAL_FIRST_RELEASE_DETAIL_TABS : RAW_MATERIAL_DETAIL_TABS} />
            </div>
            <div className="raw-material-detail-scroll">
              <RawMaterialInboundReceivingSections
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
                detailTab={detailTab}
                firstReleaseMode={firstReleaseMode}
                issueSelection={issueSelection}
                labelVerification={labelVerification}
                money={money}
                ocrLineReviewDraft={ocrLineReviewDraft}
                ocrReviewDraft={ocrReviewDraft}
                onAction={onAction}
                onOcrReviewConfirm={handleOcrReviewConfirm}
                onPrintLabels={handlePrintLabels}
                onReprintLabel={handleReprintLabel}
                productionTasks={productionTasks}
                selected={selected}
                selectedOrderSupport={selectedOrderSupport}
                selectedStock={selectedStock}
                selectedTaskCandidate={selectedTaskCandidate}
                setIssueSelection={setIssueSelection}
                setLabelVerification={setLabelVerification}
                setOcrLineReviewDraft={setOcrLineReviewDraft}
                setOcrReviewDraft={setOcrReviewDraft}
              />
              <RawMaterialInboundSupportingSections
                actionStates={{
                  costConfirm: costConfirmState,
                  costDraft: costDraftState,
                  lossCalibration: lossCalibrationState,
                  marginReview: marginReviewState,
                  marginSnapshot: marginSnapshotState,
                  payable: payableState,
                  payment: paymentState,
                }}
                canViewCost={canViewCost}
                detailTab={detailTab}
                firstReleaseMode={firstReleaseMode}
                money={money}
                onAction={onAction}
                onPayableDraftGenerate={handleGenerateSupplierPayableDraft}
                onPaymentConfirm={handleConfirmSupplierPayment}
                onStatementConfirm={handleConfirmSupplierStatement}
                onStatementImport={handleSupplierStatementImport}
                onStatementReviewConfirm={handleConfirmSupplierStatementReview}
                onStatementReviewDraftSave={handleSaveSupplierStatementReviewDraft}
                selected={selected}
                statementImport={statementImport}
                statementImportLoading={statementImportLoading}
                statementReviewMeta={statementReviewMeta}
                statementReviewSaving={statementReviewSaving}
                statementReviews={statementReviews}
              />
            </div>
          </>
        ) : (
          <DataState title="暂无原材料入库单" detail="调整视图或搜索条件后重试。" compact />
        )}
      </DetailPane>);
}
