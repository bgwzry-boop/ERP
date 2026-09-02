import { lazy, Suspense } from "react";
import {
  DataState,
  DataTable,
  DetailPane,
  Timeline,
} from "../../shared/ui/operational.jsx";
import { getProductionProcessLabel } from "./productionPackingPresentation.js";
import {
  PackingCompletionSection,
  ProductionFinishedGoodsPhotoSection,
  ProductionPackingDetailHeader,
  ProductionPackingSourceDetailCard,
  ProductionReportConfirmationPanel,
  ProductionScheduleDecisionSection,
  ProductionTaskReportInputs,
} from "./ProductionPackingDetailSections.jsx";
import { ProductionExceptionPanel } from "./ProductionExceptionPanel.jsx";

const ProductionPrintWorkspaceDetail = lazy(() => import("./ProductionPrintWorkspaceDetail.jsx").then((module) => ({
  default: module.ProductionPrintWorkspaceDetail,
})));

export function ProductionPackingDetailPane({ runtime }) {
  const {
    activePrintWorkspace, activePrintWorkspaceTab, activeWorkbenchTab, authState,
    buildProductionTaskId, confirmPackingCompletion, confirmProductionExceptionResolution,
    confirmProductionReport, currentUser, detailInventoryItem, detailLine, detailMode,
    findCustomer, finishedPhotoRejectDisabled, finishedPhotoRejectTitle,
    finishedPhotoReviewDisabled, finishedPhotoReviewTitle, finishedPhotoUploadDisabled,
    finishedPhotoUploadTitle, getLineColorSpecLabel, getLinePrintSide, getLineRemark,
    getUiActionState, handlePackingCompletionConfirmationKeyDown,
    handleProductionExceptionResolutionConfirmationKeyDown,
    handleProductionReportConfirmationKeyDown, latestProductionException, onAction,
    onChangePrinterDeviceQaCheck, onChangePrinterDeviceQaEvidenceField,
    onChangePrinterDeviceQaField, onDispatchPrintJob, onRefreshPrintDriverConfig,
    onRefreshPrintDriverReadiness, onRefreshPrintJobs, onRefreshPrinterDeviceQa,
    onRetryPrintJob, onSavePrinterDeviceMode, onSavePrinterDeviceQa,
    onSelectPrinterDeviceQaDevice, packingActualQty, packingCompletionConfirmation,
    packingCompletionConfirmationRef, packingCompletionTriggerRef, packingDisabled,
    packingPackageCount, packingTitle, printDriverConfig, printDriverCupsDiagnostics,
    printDriverReadiness, printJobQueue, printerDeviceQa, productionCompleteReportTriggerRef,
    productionDailyReportTriggerRef, productionExceptionAffectsDelivery,
    productionExceptionDisabled, productionExceptionLossQty, productionExceptionRemark,
    productionExceptionResolutionCode, productionExceptionResolutionConfirmation,
    productionExceptionResolutionConfirmationRef, productionExceptionResolutionDisabled,
    productionExceptionResolutionNote, productionExceptionResolutionTerminal,
    productionExceptionResolutionTitle, productionExceptionResolutionTriggerRef,
    productionExceptionTitle, productionExceptionType, productionReportConfirmation,
    productionReportConfirmationRef, publishScheduleDisabled, publishScheduleTitle,
    reportDailyDisabled, reportDailyTitle, reportDisabled, reportExceptionQty,
    reportMachineCount, reportQualifiedQty, reportTitle, requestPackingCompletion,
    requestProductionExceptionResolutionConfirmation, requestProductionReportConfirmation,
    requestScheduleAction, returnToPackingCompletionEdit,
    returnToProductionExceptionResolutionEdit, returnToProductionReportEdit,
    scheduleActionConfirmation, scheduleActionSubmitting, scheduleDecision,
    scheduleDecisionPayload, scheduleDirectAllowed, selectedFinishedGoodsPhoto,
    selectedPackingTask, selectedProductionLine, selectedProductionMachineId,
    selectedPublishedScheduleId, setScheduleDecision, submitProductionException,
    updatePackingInput, updateReportInput, visibleSourceDetail,
  } = runtime;

  return (
    <DetailPane
      className="production-packing-detail-pane"
      title={activeWorkbenchTab === "print" ? "打印与设备" : detailMode === "packing" ? selectedPackingTask?.packingTaskId ?? "打包任务" : selectedProductionLine ? buildProductionTaskId(selectedProductionLine) : "生产报工"}
      subtitle={activeWorkbenchTab === "print" ? "设备验收、驱动状态与打印作业" : detailLine ? `${findCustomer(detailLine.customerId).name} · ${detailLine.id}` : "未选择"}
    >
      {activeWorkbenchTab === "print" ? (
        <Suspense fallback={<DataState title="打印与设备工作台加载中" compact />}>
          <ProductionPrintWorkspaceDetail
            activePrintWorkspace={activePrintWorkspace}
            activePrintWorkspaceTab={activePrintWorkspaceTab}
            getUiActionState={getUiActionState}
            onChangePrinterDeviceQaCheck={onChangePrinterDeviceQaCheck}
            onChangePrinterDeviceQaEvidenceField={onChangePrinterDeviceQaEvidenceField}
            onChangePrinterDeviceQaField={onChangePrinterDeviceQaField}
            onDispatchPrintJob={onDispatchPrintJob}
            onRefreshPrintDriverConfig={onRefreshPrintDriverConfig}
            onRefreshPrintDriverReadiness={onRefreshPrintDriverReadiness}
            onRefreshPrintJobs={onRefreshPrintJobs}
            onRefreshPrinterDeviceQa={onRefreshPrinterDeviceQa}
            onRetryPrintJob={onRetryPrintJob}
            onSavePrinterDeviceMode={onSavePrinterDeviceMode}
            onSavePrinterDeviceQa={onSavePrinterDeviceQa}
            onSelectPrinterDeviceQaDevice={onSelectPrinterDeviceQaDevice}
            printDriverConfig={printDriverConfig}
            printDriverCupsDiagnostics={printDriverCupsDiagnostics}
            printDriverReadiness={printDriverReadiness}
            printJobQueue={printJobQueue}
            printerDeviceQa={printerDeviceQa}
          />
        </Suspense>
      ) : detailLine ? (
        <>
          <ProductionPackingDetailHeader
            detailInventoryItem={detailInventoryItem}
            detailLine={detailLine}
            detailMode={detailMode}
            findCustomer={findCustomer}
            getLineColorSpecLabel={getLineColorSpecLabel}
            getLinePrintSide={getLinePrintSide}
            getLineRemark={getLineRemark}
            latestProductionException={latestProductionException}
            selectedFinishedGoodsPhoto={selectedFinishedGoodsPhoto}
            selectedPackingTask={selectedPackingTask}
            selectedProductionMachineId={selectedProductionMachineId}
            selectedPublishedScheduleId={selectedPublishedScheduleId}
            selectedProductionTaskId={buildProductionTaskId(selectedProductionLine)}
          />
          <div className="production-detail-scroll">
          {visibleSourceDetail ? (
            <ProductionPackingSourceDetailCard detailState={visibleSourceDetail} detailMode={detailMode} />
          ) : null}
          {detailMode === "production" ? (
            <>
              {!productionReportConfirmation ? (
                <ProductionTaskReportInputs
                  completeReportTriggerRef={productionCompleteReportTriggerRef}
                  confirmationOpen={Boolean(productionReportConfirmation)}
                  onChange={updateReportInput}
                  onRequestComplete={() => requestProductionReportConfirmation("complete")}
                  reportDisabled={reportDisabled}
                  reportExceptionQty={reportExceptionQty}
                  reportMachineCount={reportMachineCount}
                  reportQualifiedQty={reportQualifiedQty}
                  reportTitle={reportTitle}
                  selectedProductionLine={selectedProductionLine}
                />
              ) : null}
              <ProductionExceptionPanel
                affectsDelivery={productionExceptionAffectsDelivery}
                estimatedLossQty={productionExceptionLossQty}
                exceptionDisabled={productionExceptionDisabled}
                exceptionRemark={productionExceptionRemark}
                exceptionTitle={productionExceptionTitle}
                exceptionType={productionExceptionType}
                latestException={latestProductionException}
                onChangeField={updateReportInput}
                onConfirmResolution={confirmProductionExceptionResolution}
                onRequestResolutionConfirmation={requestProductionExceptionResolutionConfirmation}
                onResolutionConfirmationKeyDown={handleProductionExceptionResolutionConfirmationKeyDown}
                onReturnToResolutionEdit={returnToProductionExceptionResolutionEdit}
                onSubmitException={submitProductionException}
                productionReportConfirmationOpen={Boolean(productionReportConfirmation)}
                resolutionCode={productionExceptionResolutionCode}
                resolutionConfirmation={productionExceptionResolutionConfirmation}
                resolutionConfirmationRef={productionExceptionResolutionConfirmationRef}
                resolutionDisabled={productionExceptionResolutionDisabled}
                resolutionNote={productionExceptionResolutionNote}
                resolutionTerminal={productionExceptionResolutionTerminal}
                resolutionTitle={productionExceptionResolutionTitle}
                resolutionTriggerRef={productionExceptionResolutionTriggerRef}
              />
              <section className="detail-section production-task-history">
                <h3>任务历史（本任务）</h3>
                <DataTable
                  className="production-task-history-table"
                  columns={["时间", "类型", "机台", "数量/次数", "操作人", "备注"]}
                  rows={[]}
                />
              </section>
              <ProductionFinishedGoodsPhotoSection
                finishedGoodsPhoto={selectedFinishedGoodsPhoto}
                onAccept={() => submitFinishedGoodsPhotoAction("确认成品图", selectedProductionLine, buildProductionTaskId, onAction)}
                onReject={() => submitFinishedGoodsPhotoAction("退回成品图", selectedProductionLine, buildProductionTaskId, onAction)}
                onUpload={() => submitFinishedGoodsPhotoAction("上传成品图", selectedProductionLine, buildProductionTaskId, onAction)}
                rejectDisabled={finishedPhotoRejectDisabled}
                rejectTitle={finishedPhotoRejectTitle}
                reviewDisabled={finishedPhotoReviewDisabled}
                reviewTitle={finishedPhotoReviewTitle}
                uploadDisabled={finishedPhotoUploadDisabled}
                uploadTitle={finishedPhotoUploadTitle}
              />
              <ProductionScheduleDecisionSection
                authState={authState}
                businessId={selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine)}
                currentUser={currentUser}
                disabled={scheduleActionSubmitting || Boolean(scheduleActionConfirmation)}
                directAllowed={scheduleDirectAllowed}
                onChange={setScheduleDecision}
                scheduleDecision={scheduleDecision}
              />
              <div className="action-row">
                <button
                  disabled={publishScheduleDisabled || Boolean(productionReportConfirmation) || Boolean(scheduleActionConfirmation)}
                  title={publishScheduleTitle}
                  onClick={() => requestPublishSchedule({
                    buildProductionTaskId,
                    requestScheduleAction,
                    scheduleDecisionPayload,
                    selectedProductionLine,
                    selectedProductionMachineId,
                  })}
                >
                  {selectedPublishedScheduleId ? "已发布排产" : "发布排产"}
                </button>
                <button
                  disabled={reportDailyDisabled || Boolean(productionReportConfirmation)}
                  ref={productionDailyReportTriggerRef}
                  title={reportDailyTitle}
                  onClick={() => requestProductionReportConfirmation("daily")}
                >
                  报当日数量
                </button>
              </div>
              <ProductionReportConfirmationPanel
                confirmation={productionReportConfirmation}
                confirmationRef={productionReportConfirmationRef}
                onConfirm={confirmProductionReport}
                onKeyDown={handleProductionReportConfirmationKeyDown}
                onReturnToEdit={returnToProductionReportEdit}
                reportDailyDisabled={reportDailyDisabled}
                reportDisabled={reportDisabled}
              />
            </>
          ) : (
            <PackingCompletionSection
              confirmation={packingCompletionConfirmation}
              confirmationRef={packingCompletionConfirmationRef}
              confirmationTriggerRef={packingCompletionTriggerRef}
              onChange={updatePackingInput}
              onConfirm={confirmPackingCompletion}
              onKeyDown={handlePackingCompletionConfirmationKeyDown}
              onRequest={requestPackingCompletion}
              onReturnToEdit={returnToPackingCompletionEdit}
              packageCount={packingPackageCount}
              packedQty={packingActualQty}
              packingDisabled={packingDisabled}
              packingTitle={packingTitle}
            />
          )}
          <Timeline
            items={[
              detailMode === "production" ? "车间完成生产" : "生产完成进入打包",
              detailMode === "production" ? "办公室/生产管理确认合格数量" : "打包工确认实际包裹",
              detailMode === "production" ? "入库并生成订单占用" : "生成包裹和标签下一步",
              detailMode === "production" ? "进入待打包" : "出库/拉走时再扣库存",
            ]}
          />
          </div>
        </>
      ) : (
        <DataState title="暂无生产或打包任务" detail="刷新任务池或确认排产是否已发布。" compact />
      )}
    </DetailPane>
  );
}

function submitFinishedGoodsPhotoAction(action, line, buildProductionTaskId, onAction) {
  return onAction(action, {
    orderLineId: line.id,
    orderLine: line,
    productionTaskId: line.productionTaskId || buildProductionTaskId(line),
  });
}

function requestPublishSchedule({
  buildProductionTaskId,
  requestScheduleAction,
  scheduleDecisionPayload,
  selectedProductionLine,
  selectedProductionMachineId,
}) {
  const productionTaskId = selectedProductionLine.productionTaskId || buildProductionTaskId(selectedProductionLine);
  const summary = `发布 ${productionTaskId} 排产`;
  requestScheduleAction("发布排产", {
    ...scheduleDecisionPayload(summary),
    orderLineId: selectedProductionLine.id,
    orderLine: selectedProductionLine,
    productionTaskId,
    processType: getProductionProcessLabel(selectedProductionLine),
    machineId: selectedProductionMachineId,
    plannedQty: selectedProductionLine.qty,
    expectedRevision: Number(
      selectedProductionLine.productionTask?.revision ?? selectedProductionLine.revision ?? 0,
    ),
  }, summary, "创建/更新正式排产记录并进入车间任务池，写入决定证据和审计；不直接生成库存、打包或对账。");
}
