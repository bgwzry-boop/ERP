import { PageLoader, RawMaterialRoute, EntryPage, OrderPoolPage, WorkshopMobilePage, MasterDataRoute, V1StatusRoute, OfficeMobilePage, DecisionMobilePage, MaintenanceMobilePage, DesktopRequiredMobilePage, EmployeeAttendanceMobilePage } from "./workspacePageComponents.jsx";
import { renderRegisteredPage } from "./pageRegistry.js";
import { Suspense } from "react";
import { DataState } from "../shared/ui/operational.jsx";
import { buildMasterDataRouteContract } from "./buildMasterDataRouteContract.js";
import { buildStatementRouteContract } from "./buildStatementRouteContract.js";
import { buildV1StatusRouteContract } from "./buildV1StatusRouteContract.js";

























export function OfficeWorkspacePages({ renderedPage, runtime }) {
  const masterDataRouteContract = buildMasterDataRouteContract(runtime);
  const statementRouteContract = buildStatementRouteContract(runtime);
  const v1StatusRouteContract = buildV1StatusRouteContract(runtime);
  const {
    authState,
    changePrinterDeviceQaCheck,
    changePrinterDeviceQaEvidenceField,
    changePrinterDeviceQaField,
    confirmRawMaterialSupplierPayment,
    confirmRawMaterialSupplierStatement,
    confirmRawMaterialSupplierStatementReviewDraft,
    createTemporaryInventoryHold,
    currentUser,
    dispatchPrintJobQueueItem,
    draftRows,
    draftStatus,
    driverDeliveryMeta,
    driverDeliveryTasks,
    entryAction,
    entryText,
    extendTemporaryInventoryHold,
    firstReleaseMode,
    focusFulfillmentByRef,
    focusInventoryLedgerSource,
    focusStatementByRef,
    fulfillments,
    fulfillmentTab,
    generateRawMaterialSupplierPayableDraft,
    handleDraftCommand,
    handleDriverDeliveryAction,
    handleInventoryCorrectionAttachment,
    handleInventoryCorrectionConfirm,
    handleInventoryCorrectionDraft,
    handleProductionPackingAction,
    handleTodo,
    inventoryCorrectionDetailState,
    inventoryCorrectionQueueState,
    inventoryIntentState,
    inventoryLedgerFilters,
    inventoryLedgerState,
    inventoryMeta,
    inventoryRecords,
    linkCancellationIntentToSelectedLine,
    openInventoryCorrectionDetail,
    openOrderLineAction,
    openQueueDraft,
    orderFilters,
    orderLines,
    orderPoolMeta,
    pageHelpers,
    permissionContext,
    prepareOrderDraftFromTemporaryHold,
    printBatchRecords,
    printDriverConfig,
    printDriverCupsDiagnostics,
    printDriverReadiness,
    printerDeviceQa,
    printJobQueue,
    productionPacking,
    productionPackingDetailState,
    productionPackingFocus,
    rawMaterialInboundMeta,
    rawMaterialInbounds,
    rawMaterialSupplierStatementReviewMeta,
    rawMaterialSupplierStatementReviews,
    recognize,
    recognizeQueue,
    recognizeRawMaterialDeliveryNote,
    refreshDraftQueue,
    refreshFulfillments,
    refreshInventoryCorrectionQueueAction,
    refreshInventoryIntents,
    refreshInventoryLedgerAction,
    refreshPrintDriverDiagnostics,
    refreshPrintDriverReadiness,
    refreshPrinterDeviceQa,
    refreshPrintJobs,
    refreshProductionPackingTaskLists,
    releaseTemporaryInventoryHold,
    repairTodoReference,
    restoreCancelledDraftLine,
    retryPrintJobQueueItem,
    roleBoundaryDescription,
    savePrinterDeviceMode,
    savePrinterDeviceQaRecord,
    saveRawMaterialSupplierStatementReviewDraft,
    selectPrinterDeviceQaDevice,
    selectedDraftId,
    selectedDriverTaskId,
    selectedFulfillmentId,
    selectedOrderDetail,
    selectedOrderId,
    selectedRawMaterialInboundId,
    selectedStockId,
    selectedTodoId,
    setActivePage,
    setFulfillmentTab,
    setInventoryLedgerFilters,
    setOrderFilters,
    setSelectedDraftId,
    setSelectedDriverTaskId,
    setSelectedFulfillmentId,
    setSelectedOrderId,
    setSelectedRawMaterialInboundId,
    setSelectedStockId,
    setToast,
    setTodoView,
    setSelectedTodoId,
    statements,
    todos,
    todoMeta,
    todoView,
    updateDraftField,
    updateOrderEntryText,
    updateFulfillment,
    updateRawMaterialInbound,
    uploadDraftArtwork,
  } = runtime;
  return (
    <>
          {renderedPage === "roleBoundary" && (
            <DataState title="当前岗位没有 ERP 操作菜单" detail={roleBoundaryDescription} />
          )}
          {renderedPage === "desktopRequiredMobile" && (
            <Suspense fallback={<DataState title="岗位终端说明加载中" />}>
              <DesktopRequiredMobilePage currentUser={currentUser} />
            </Suspense>
          )}
          {renderedPage === "attendanceMobile" && (
            <Suspense fallback={<DataState title="本人考勤加载中" />}>
              <EmployeeAttendanceMobilePage authState={authState} currentUser={currentUser} />
            </Suspense>
          )}
          {renderedPage === "officeMobile" && (
            <Suspense fallback={<DataState title="办公室手机工作台加载中" />}>
              <OfficeMobilePage onNavigate={setActivePage} />
            </Suspense>
          )}
          {renderRegisteredPage(renderedPage, {
            todos: {
              authState,
              onReminderSaved: runtime.refreshTodos,
              todos: todos,
              todoMeta: todoMeta,
              printBatchRecords: printBatchRecords,
              selectedTodoId: selectedTodoId,
              onSelect: setSelectedTodoId,
              view: todoView,
              setView: setTodoView,
              onAction: handleTodo,
              onRepairReference: repairTodoReference,
              helpers: pageHelpers,
            },
            inventory: {
              inventoryRecords: inventoryRecords,
              inventoryMeta: inventoryMeta,
              inventoryLedgerEntries: inventoryLedgerState.items,
              inventoryLedgerMeta: inventoryLedgerState,
              inventoryLedgerFilters: inventoryLedgerFilters,
              setInventoryLedgerFilters: setInventoryLedgerFilters,
              inventoryCorrectionDetailState: inventoryCorrectionDetailState,
              inventoryCorrectionQueueState: inventoryCorrectionQueueState,
              inventoryIntentState: inventoryIntentState,
              selectedStockId: selectedStockId,
              setSelectedStockId: setSelectedStockId,
              setToast: setToast,
              onCreateCorrectionDraft: handleInventoryCorrectionDraft,
              onLinkCorrectionAttachment: handleInventoryCorrectionAttachment,
              onConfirmCorrectionDraft: handleInventoryCorrectionConfirm,
              onOpenCorrectionDraft: openInventoryCorrectionDetail,
              onRefreshCorrectionQueue: refreshInventoryCorrectionQueueAction,
              onRefreshInventoryLedger: refreshInventoryLedgerAction,
              onRefreshInventoryIntents: refreshInventoryIntents,
              onCreateTemporaryHold: createTemporaryInventoryHold,
              onReleaseTemporaryHold: releaseTemporaryInventoryHold,
              onExtendTemporaryHold: extendTemporaryInventoryHold,
              onConvertTemporaryHoldToOrder: async ({
  hold,
  intent,
  candidate
}) => {
  const result = await prepareOrderDraftFromTemporaryHold({
    hold,
    intent,
    candidate
  });
  if (!result?.blocked) setActivePage("entry");
  return result;
},
              onLocateInventoryLedgerSource: focusInventoryLedgerSource,
              helpers: pageHelpers,
            },
            fulfillment: {
              authState: authState,
              currentUser: currentUser,
              tab: fulfillmentTab,
              setTab: setFulfillmentTab,
              fulfillments: fulfillments,
              orderLines: orderLines,
              selectedId: selectedFulfillmentId,
              setSelectedId: setSelectedFulfillmentId,
              onAction: updateFulfillment,
              onRefresh: () => refreshFulfillments({
  showToast: true
}),
              helpers: pageHelpers,
            },
            packing: {
              authState: authState,
              currentUser: currentUser,
              orderLines: orderLines,
              fulfillments: fulfillments,
              inventoryRecords: inventoryRecords,
              productionPacking: productionPacking,
              focusTarget: productionPackingFocus,
              sourceDetailState: productionPackingDetailState,
              printerDeviceQa: printerDeviceQa,
              printJobQueue: printJobQueue,
              printDriverConfig: printDriverConfig,
              printDriverReadiness: printDriverReadiness,
              printDriverCupsDiagnostics: printDriverCupsDiagnostics,
              onAction: handleProductionPackingAction,
              onRefreshProduction: () => refreshProductionPackingTaskLists({
  showToast: false
}),
              onRefreshPrintDriverConfig: refreshPrintDriverDiagnostics,
              onRefreshPrintDriverReadiness: () => refreshPrintDriverReadiness({
  showToast: true
}),
              onRefreshPrinterDeviceQa: () => refreshPrinterDeviceQa({
  showToast: true
}),
              onSelectPrinterDeviceQaDevice: selectPrinterDeviceQaDevice,
              onChangePrinterDeviceQaField: changePrinterDeviceQaField,
              onChangePrinterDeviceQaCheck: changePrinterDeviceQaCheck,
              onChangePrinterDeviceQaEvidenceField: changePrinterDeviceQaEvidenceField,
              onSavePrinterDeviceMode: savePrinterDeviceMode,
              onSavePrinterDeviceQa: savePrinterDeviceQaRecord,
              onRefreshPrintJobs: refreshPrintJobs,
              onDispatchPrintJob: dispatchPrintJobQueueItem,
              onRetryPrintJob: retryPrintJobQueueItem,
              helpers: pageHelpers,
            },
            driverMobile: {
              tasks: driverDeliveryTasks,
              selectedTaskId: selectedDriverTaskId,
              setSelectedTaskId: setSelectedDriverTaskId,
              meta: driverDeliveryMeta,
              onAction: handleDriverDeliveryAction,
              helpers: pageHelpers,
            },
            warehouseMobile: {
              fulfillments: fulfillments,
              orderLines: orderLines,
              selectedId: selectedFulfillmentId,
              setSelectedId: setSelectedFulfillmentId,
              onAction: updateFulfillment,
              helpers: pageHelpers,
            },
            statements: {
              ...statementRouteContract,
            },
            rawMaterial: {
              view: "inbound",
              firstReleaseMode: firstReleaseMode,
              state: {
  authState,
  currentUser,
  helpers: pageHelpers,
  inbounds: rawMaterialInbounds,
  meta: rawMaterialInboundMeta,
  printerDeviceQa,
  productionTasks: productionPacking.productionTasks,
  selectedId: selectedRawMaterialInboundId,
  statementReviewMeta: rawMaterialSupplierStatementReviewMeta,
  statementReviews: rawMaterialSupplierStatementReviews
},
              actions: {
  onAction: updateRawMaterialInbound,
  onDeliveryNoteRecognize: recognizeRawMaterialDeliveryNote,
  onPayableDraftGenerate: generateRawMaterialSupplierPayableDraft,
  onPaymentConfirm: confirmRawMaterialSupplierPayment,
  onStatementConfirm: confirmRawMaterialSupplierStatement,
  onStatementReviewConfirm: confirmRawMaterialSupplierStatementReviewDraft,
  onStatementReviewDraftCreate: saveRawMaterialSupplierStatementReviewDraft,
  setSelectedId: setSelectedRawMaterialInboundId
},
            },
            payroll: {
              authState: authState,
              currentUser: currentUser,
              permissionContext: permissionContext,
            },
          })}
          {renderedPage === "entry" && (
            <PageLoader component={EntryPage} fallback="订单录入加载中"
              entryText={entryText}
              onEntryTextChange={updateOrderEntryText}
              draftRows={draftRows}
              draftStatus={draftStatus}
              selectedDraftId={selectedDraftId}
              setSelectedDraftId={setSelectedDraftId}
              onRecognize={recognize}
              onQueueRecognize={recognizeQueue} onQueueRefresh={refreshDraftQueue} onQueueOpen={openQueueDraft} onQueueCancellationLink={linkCancellationIntentToSelectedLine}
              onDraftFieldChange={updateDraftField}
              onArtworkUpload={uploadDraftArtwork}
              onDraftCommand={handleDraftCommand} onRestoreCancelledLine={restoreCancelledDraftLine}
              onAction={entryAction}
              helpers={pageHelpers}
            />
          )}
          {renderedPage === "orders" && (
            <PageLoader component={OrderPoolPage} fallback="订单池加载中"
              orderLines={orderLines}
              fulfillments={fulfillments}
              statements={statements}
              selectedOrderId={selectedOrderId}
              setSelectedOrderId={setSelectedOrderId}
              filters={orderFilters}
              setFilters={setOrderFilters}
              orderPoolMeta={orderPoolMeta}
              selectedOrderDetail={selectedOrderDetail}
              onLocateFulfillment={focusFulfillmentByRef}
              onLocateStatement={focusStatementByRef}
              onOrderAction={openOrderLineAction}
              setToast={setToast}
              helpers={pageHelpers}
            />
          )}



          {renderedPage === "workshopMobile" && (
            <PageLoader component={WorkshopMobilePage} fallback="车间工作台加载中"
              authState={authState}
              onPackagesSaved={() => refreshProductionPackingTaskLists({ showToast: false })}
              orderLines={orderLines}
              inventoryRecords={inventoryRecords}
              productionPacking={productionPacking}
              onAction={handleProductionPackingAction}
              onNavigate={setActivePage}
              helpers={pageHelpers}
            />
          )}


          {renderedPage === "decisionMobile" && (
            <Suspense fallback={<DataState title="经营决策工作台加载中" />}>
              <DecisionMobilePage
                authState={authState}
                currentUser={currentUser}
                todos={todos}
                orderLines={orderLines}
                fulfillments={fulfillments}
                statements={statements}
                rawMaterialInbounds={rawMaterialInbounds}
                helpers={pageHelpers}
              />
            </Suspense>
          )}
          {renderedPage === "maintenanceMobile" && (
            <Suspense fallback={<DataState title="设备机修工作台加载中" />}>
              <MaintenanceMobilePage authState={authState} currentUser={currentUser} />
            </Suspense>
          )}


          {renderedPage === "rawMaterialScanner" && (
            <PageLoader component={RawMaterialRoute} fallback="原材料扫码加载中" view="scanner"
              state={{ helpers: pageHelpers, inbounds: rawMaterialInbounds, productionState: productionPacking }}
              actions={{ onAction: updateRawMaterialInbound }}
            />
          )}
          {renderedPage === "masterData" && (
            <Suspense fallback={<DataState title="基础资料工作台加载中" />}><MasterDataRoute
              {...masterDataRouteContract}
            /></Suspense>
          )}

          {renderedPage === "v1Status" && (
            <Suspense fallback={<DataState title="上线状态加载中" />}>
              <V1StatusRoute {...v1StatusRouteContract} />
            </Suspense>
          )}

    </>
  );
}
