import { RAW_MATERIAL_FIRST_RELEASE_ENABLED } from "./config/rawMaterialFirstRelease.js";
import { OfficeWorkbenchShell } from "./app/OfficeWorkbenchShell.jsx";
import { createOfficeWorkbenchRuntimes } from "./app/createOfficeWorkbenchRuntimes.js";
import { useOfficeWorkbenchNavigation } from "./app/useOfficeWorkbenchNavigation.js";
import { useOfficeInteractionController } from "./app/useOfficeInteractionController.js";
import { useOfficeWorkspace } from "./app/useOfficeWorkspace.js";
import { useOfficeActivePageEffects } from "./app/useOfficeActivePageEffects.js";
import { createOfficeAttachmentActions } from "./app/createOfficeAttachmentActions.js";
import { createOfficePageHelpers } from "./app/createOfficePageHelpers.js";
import { createOfficeDriverDeliveryActions } from "./app/createOfficeDriverDeliveryActions.js";
import { createOfficeFulfillmentActions } from "./app/createOfficeFulfillmentActions.js";
import { createOfficeInventoryActions } from "./app/createOfficeInventoryActions.js";
import { createOfficeMasterDataActions } from "./app/createOfficeMasterDataActions.js";
import { createOfficeOrderActions } from "./app/createOfficeOrderActions.js";
import { createOfficePageRefreshActions } from "./app/createOfficePageRefreshActions.js";
import { createOfficePrintDeviceActions } from "./app/createOfficePrintDeviceActions.js";
import { createOfficeProductionPackingActions } from "./app/createOfficeProductionPackingActions.js";
import { createOfficeRawMaterialActions } from "./app/createOfficeRawMaterialActions.js";
import { createOfficeTodoActions, createOfficeTodoAppender } from "./app/createOfficeTodoActions.js";
import {
  copyTextToClipboard,
  downloadMasterDataImportTemplateWorkbook,
  downloadStatementExcelWorkbook,
  downloadTextFile,
  mergeAttachmentSummaries,
  readBlobAsDataUrl,
  readFileAsDataUrl,
} from "./app/browserFileActions.js";
import {
  defaultSeedUserId,
  getUiActionState,
  seedUserOptions,
} from "./auth/seedPermissions.js";
import { DataState } from "./shared/ui/operational.jsx";
import { useOfficeScenarioData } from "./app/useOfficeScenarioData.js";
import {
  defaultOrderFilters,
  findCustomer as findCustomerRecord,
  getFulfillmentDocumentLabel,
  getOrderFinanceState as getOrderFinanceStateRecord,
  getStatementBlockingAmount as getStatementBlockingAmountRecord,
  getStatementBucket as getStatementBucketRecord,
  getStatementDisplayDebt as getStatementDisplayDebtRecord,
  getStatementFinancialSummary as getStatementFinancialSummaryRecord,
  getTodoCustomerNotificationDraft,
  isPrintTodo,
  orderMatchesFilters as orderMatchesFiltersRecord,
  resolveLineFromRef,
  sortTodos,
  statementMatchesFilters as statementMatchesFiltersRecord,
} from "./domain/officeRules.js";

export function OfficeWorkbench({
  authState,
  formalLoginRequired,
  logoutRuntimeUserSession,
  runtimeLoginLoading,
  runtimeNotice = "",
  runtimeServerRequired,
  switchSeedUser,
} = {}) {
  const scenarioState = useOfficeScenarioData(runtimeServerRequired);

  if (!scenarioState.data) {
    return (
      <DataState
        title={scenarioState.error ? "本地演示数据加载失败" : "业务数据加载中"}
        detail={scenarioState.error || "正在按需加载本地演示场景。"}
      />
    );
  }

  return <OfficeWorkbenchRuntime
    authState={authState}
    formalLoginRequired={formalLoginRequired}
    logoutRuntimeUserSession={logoutRuntimeUserSession}
    officeScenarioData={scenarioState.data}
    runtimeLoginLoading={runtimeLoginLoading}
    runtimeNotice={runtimeNotice}
    runtimeServerRequired={runtimeServerRequired}
    switchSeedUser={switchSeedUser}
  />;
}

function OfficeWorkbenchRuntime({
  authState,
  formalLoginRequired,
  logoutRuntimeUserSession,
  officeScenarioData,
  runtimeLoginLoading,
  runtimeNotice,
  runtimeServerRequired,
  switchSeedUser,
}) {
  const {
    customers,
    defaultSelections,
    initialFulfillments,
    initialInventories,
    initialOrderLines,
    initialRawMaterialInbounds,
    initialStatements,
    initialTodos,
    sampleText,
  } = officeScenarioData;
  const findCustomer = (id) => findCustomerRecord(customers, id);
  const getOrderFinanceState = (row, statements) => getOrderFinanceStateRecord(row, statements, customers);
  const getStatementBlockingAmount = (statement) => getStatementBlockingAmountRecord(statement, customers);
  const getStatementDisplayDebt = (statement) => getStatementDisplayDebtRecord(statement, customers);
  const getStatementFinancialSummary = (statement) => getStatementFinancialSummaryRecord(statement, customers);
  const getStatementBucket = (statement) => getStatementBucketRecord(statement, customers);
  const orderMatchesFilters = (row, filters, statements) => orderMatchesFiltersRecord(row, filters, statements, customers);
  const statementMatchesFilters = (statement, filters) => statementMatchesFiltersRecord(statement, filters, customers);
  const permissionContext = authState.permissions;
  const currentUser = permissionContext.user;
  const currentUserId = currentUser.userId ?? defaultSeedUserId;
  const canUsePrintDiagnostics = permissionContext.actionPermissions?.includes("fulfillment.print") === true;
  const {
    activeMeta,
    activePage,
    renderedPage,
    roleFocusedShellPage,
    setActivePage,
    setSidebarCollapsed,
    sidebarCollapsed,
  } = useOfficeWorkbenchNavigation({ permissionContext });
  const officeWorkspace = useOfficeWorkspace({
    activePage,
    authState,
    customers,
    currentUser,
    currentUserId,
    defaultSelections,
    initialFulfillments,
    initialInventories,
    initialOrderLines,
    initialRawMaterialInbounds,
    initialStatements,
    initialTodos,
    sampleText,
    serverRequired: runtimeServerRequired,
  });
  const {
    refreshTodos, refreshOrderPool, refreshInventoryRecords, refreshFulfillments,
    refreshDriverDeliveryTasks, refreshRawMaterialInbounds, refreshRawMaterialSupplierStatementReviews,
    refreshProductionPackingTaskLists,
    refreshOfficePrintJobQueue, refreshPrintDriverConfig, refreshPrintDriverCupsDiagnostics,
    refreshPrintDriverReadiness, refreshPrinterDeviceQa,
    confirmBatchPrintResult, dispatchPrintJobQueueItem: executePrintJobDispatch,
    printFulfillmentDocument, retryPrintJobQueueItem: executePrintJobRetry,
    savePrinterDeviceMode: executeSavePrinterDeviceMode,
    savePrinterDeviceQaRecord: executeSavePrinterDeviceQaRecord,
    voidFulfillmentPrintRecord,
    refreshInventoryCorrectionQueue, refreshInventoryIntents, refreshInventoryLedgerEntries,
    loadInventoryCorrectionDetail, createInventoryCorrectionDraft, linkInventoryCorrectionAttachment, confirmInventoryCorrectionDraft,
    completeFulfillmentAction, handoffPaperOutbound, markFulfillmentPrepared, recordWarehouseExecution, reviewFulfillmentDeliveryEvidence,
    saveFulfillmentDispatch, submitFulfillmentException, resolveFulfillmentQuantityVariance,
    executeProductionPackingAction,
    refreshMasterDataEmployeeAccountReviews, refreshMasterDataImportReviewDrafts,
    refreshStatementDetail, refreshStatements, refreshV1GoLiveStatus,
    executeOrderEntryAction, executeOrderLineAction, openQueuedOrderDraft,
    recognizeOrderDraft, recognizeOrderDraftQueue, refreshOrderDraftQueue,
    runOrderDraftCommand, updateOrderDraftField, linkCrossDraftShortageCancellation, restoreShortageCancelledLine,
    todos, setTodos,
    selectedTodoId, setSelectedTodoId, setTodoView,
    orderLines, orderPoolMeta, setOrderPoolMeta,
    setSelectedOrderDetail, entryText, setEntryText,
    draftRows, setDraftRows, draftStatus, setDraftStatus, draftApiMeta, setDraftApiMeta,
    setSelectedDraftId, setOrderFilters,
    selectedOrderId, setSelectedOrderId,
    inventoryRecords,
    inventoryLedgerState,
    selectedStockId, setSelectedStockId,
    setFulfillmentTab, fulfillments, setFulfillments, fulfillmentMeta,
    selectedFulfillmentId, setSelectedFulfillmentId,
    productionPacking, setProductionPackingFocus,
    setProductionPackingDetailState,
    printerDeviceQa, setPrinterDeviceQa,
    driverDeliveryTasks, setDriverDeliveryTasks,
    statements, setStatements, selectedStatementId, setSelectedStatementId, statementReadMeta,
    masterDataPrecheckState, setMasterDataPrecheckState,
    setMasterDataImportReviewDrafts,
    setMasterDataImportConfirmationPlans,
    setMasterDataImportExecutions,
    setMasterDataEmployeeAccountReviews,
    lastIssuedEmployeeCredential, setLastIssuedEmployeeCredential,
    setMasterDataMaintenanceDrafts,
    masterDataMaintenanceTab,
    setRawMaterialInbounds, setRawMaterialInboundMeta,
    setRawMaterialSupplierStatementReviews,
    setRawMaterialSupplierStatementReviewMeta,
    setSelectedRawMaterialInboundId,
    v1StatusActionSetters,
    orderLinesRef, rawMaterialInboundsRef,
    rawMaterialSupplierStatementReviewsRef,
    selectedStockIdRef, printerDeviceQaSelectedIdRef,
    paymentAttachmentSyncKeysRef, customerConfirmationAttachmentSyncKeysRef,
  } = officeWorkspace;
  const addTodo = createOfficeTodoAppender({ setSelectedTodoId, setTodos });

  const interaction = useOfficeInteractionController({
    addTodo,
    authState,
    confirmBatchPrintResult,
    currentUser,
    currentUserId,
    executeOrderLineAction,
    findCustomer,
    fulfillments,
    getStatementBlockingAmount,
    initialToast: "",
    orderLines,
    permissionContext,
    handoffPaperOutbound,
    printFulfillmentDocument,
    readFileAsDataUrl,
    recordWarehouseExecution,
    saveFulfillmentDispatch,
    setFulfillments,
    setStatements,
    statements,
    submitFulfillmentException,
    todos,
    voidFulfillmentPrintRecord,
  });
  const {
    guardUiAction,
    openAttachmentViewer,
    openMasterDataTemplatePanel: showMasterDataTemplatePanel,
    openModal,
    openOrderActionModal,
    setToast,
    toast,
  } = interaction;

  const authSourceLabel = authState.authenticated ? "后端认证" : formalLoginRequired ? "等待登录" : "本地权限";
  const unhandledTodos = todos.filter((item) => !item.handled).length;

  const v1StatusActionController = {
    actionSetters: v1StatusActionSetters,
    authState,
    currentUserId,
    readFileAsDataUrl,
    refreshV1GoLiveStatus,
    setToast,
  };
  const masterDataActions = createOfficeMasterDataActions({
    allowLocalFallback: !runtimeServerRequired,
    authState,
    confirmAction: (message) => window.confirm(message),
    currentUser,
    currentUserId,
    downloadMasterDataImportTemplateWorkbook,
    downloadTextFile,
    getActionState: (action) => getUiActionState(permissionContext, "masterData", action),
    lastIssuedEmployeeCredential,
    masterDataMaintenanceTab,
    masterDataPrecheckState,
    refreshMasterDataEmployeeAccountReviews, refreshMasterDataImportReviewDrafts, refreshV1GoLiveStatus,
    setLastIssuedEmployeeCredential,
    setMasterDataEmployeeAccountReviews,
    setMasterDataImportConfirmationPlans,
    setMasterDataImportExecutions,
    setMasterDataImportReviewDrafts,
    setMasterDataMaintenanceDrafts,
    setMasterDataPrecheckState,
    setToast,
    showMasterDataTemplatePanel,
  });
  const rawMaterialActions = createOfficeRawMaterialActions({
    allowLocalFallback: !runtimeServerRequired,
    authState,
    customers,
    currentUser,
    currentUserId,
    guardUiAction,
    orderLines,
    rawMaterialInboundsRef,
    rawMaterialSupplierStatementReviewsRef,
    setRawMaterialInboundMeta,
    setRawMaterialInbounds,
    setRawMaterialSupplierStatementReviewMeta,
    setRawMaterialSupplierStatementReviews,
    setSelectedRawMaterialInboundId,
    setToast,
  });
  const pageHelpers = createOfficePageHelpers({
    currentUser,
    customers,
    findCustomer,
    getOrderFinanceState,
    getStatementBlockingAmount,
    getStatementBucket,
    getStatementDisplayDebt,
    getStatementFinancialSummary,
    orderMatchesFilters,
    permissionContext,
    sampleText,
    seedUserOptions,
    sortTodos,
    statementMatchesFilters,
  });


  const printDeviceActions = createOfficePrintDeviceActions({
    allowLocalFallback: !runtimeServerRequired,
    dispatchPrintJobQueueItem: executePrintJobDispatch,
    guardUiAction,
    printerDeviceQa,
    printerDeviceQaSelectedIdRef,
    refreshPrinterDeviceQa,
    retryPrintJobQueueItem: executePrintJobRetry,
    savePrinterDeviceMode: executeSavePrinterDeviceMode,
    savePrinterDeviceQaRecord: executeSavePrinterDeviceQaRecord,
    setPrinterDeviceQa,
    setToast,
  });
  const attachmentActions = createOfficeAttachmentActions({
    allowLocalFallback: !runtimeServerRequired,
    authState,
    currentUserId,
    customerConfirmationAttachmentSyncKeysRef,
    paymentAttachmentSyncKeysRef,
    setStatements,
    setToast,
    statements,
  });

  useOfficeActivePageEffects({
    activePage,
    authState,
    canUsePrintDiagnostics,
    currentUserId,
    fulfillments,
    orderLinesRef,
    refreshDriverDeliveryTasks,
    refreshFulfillments,
    refreshInventoryCorrectionQueue,
    refreshInventoryIntents,
    refreshInventoryLedgerEntries,
    refreshInventoryRecords,
    refreshOfficePrintJobQueue,
    refreshOrderPool,
    refreshPrintDriverConfig,
    refreshPrintDriverCupsDiagnostics,
    refreshPrintDriverReadiness,
    refreshPrinterDeviceQa,
    refreshProductionPackingTaskLists,
    refreshRawMaterialInbounds,
    refreshRawMaterialSupplierStatementReviews,
    refreshStatementDetail,
    refreshStatements,
    refreshTodos,
    refreshV1GoLiveStatus,
    selectedOrderId,
    selectedStatementId,
    selectedStockId,
    setOrderPoolMeta,
    setSelectedOrderDetail,
    statements,
    syncStatementCustomerAttachmentsFromSource: attachmentActions.syncStatementCustomerAttachmentsFromSource,
    syncStatementPaymentAttachmentsFromSource: attachmentActions.syncStatementPaymentAttachmentsFromSource,
  });

  const { refreshActivePage } = createOfficePageRefreshActions({
    activeMetaLabel: activeMeta.label,
    activePage,
    allowLocalFallback: !runtimeServerRequired,
    canUsePrintDiagnostics,
    refreshDriverDeliveryTasks,
    refreshFulfillments,
    refreshInventoryLedgerEntries, refreshInventoryIntents,
    refreshInventoryRecords,
    refreshMasterDataEmployeeAccountReviews,
    refreshMasterDataImportReviewDrafts,
    refreshOfficePrintJobQueue,
    refreshOrderPool,
    refreshPrintDriverConfig,
    refreshPrintDriverCupsDiagnostics,
    refreshPrintDriverReadiness,
    refreshPrinterDeviceQa,
    refreshProductionPackingTaskLists,
    refreshRawMaterialInbounds,
    refreshRawMaterialSupplierStatementReviews,
    refreshStatementDetail,
    refreshStatements,
    refreshTodos,
    refreshV1GoLiveStatus,
    selectedStatementId,
    selectedStockIdRef,
    setToast,
  });

  const productionPackingActions = createOfficeProductionPackingActions({
    allowLocalFallback: !runtimeServerRequired,
    authState,
    currentUserId,
    executeProductionPackingAction,
    guardUiAction,
    inventoryRecords,
    orderLines,
    productionPacking,
    refreshOfficePrintJobQueue,
    refreshPrintDriverConfig,
    refreshPrintDriverCupsDiagnostics,
    setProductionPackingDetailState,
    setToast,
  });

  const orderActions = createOfficeOrderActions({
    allowLocalFallback: !runtimeServerRequired,
    authState,
    confirmDiscardDraft: (message) => window.confirm(message), defaultOrderFilters,
    currentUserId,
    draftApiMeta, draftRows, draftStatus, entryText,
    executeOrderEntryAction,
    fulfillmentSource: fulfillmentMeta.source,
    fulfillments,
    guardUiAction, inventoryRecords,
    linkCrossDraftShortageCancellation,
    openOrderActionModal, openQueuedOrderDraft,
    orderLines,
    orderPoolSource: orderPoolMeta.source,
    recognizeOrderDraft, recognizeOrderDraftQueue,
    refreshFulfillments,
    refreshOrderPool, refreshOrderDraftQueue,
    refreshStatements,
    resolveLineFromRef,
    restoreShortageCancelledLine,
    runOrderDraftCommand,
    setActivePage,
    setDraftApiMeta, setDraftRows, setDraftStatus, setEntryText,
    setFulfillmentTab,
    setOrderFilters,
    setSelectedFulfillmentId, setSelectedDraftId, setSelectedStockId,
    setSelectedOrderId,
    setSelectedStatementId,
    setToast,
    statementSource: statementReadMeta.source,
    statements,
    updateOrderDraftField,
  });
  const todoActions = createOfficeTodoActions({
    allowLocalFallback: !runtimeServerRequired,
    authState,
    copyTextToClipboard,
    currentUser,
    currentUserId,
    findCustomer,
    focusFulfillmentByRef: orderActions.focusFulfillmentByRef,
    focusInventoryByRef: orderActions.focusInventoryByRef,
    focusOrderDraftByRef: orderActions.focusOrderDraft,
    focusOrderLine: orderActions.focusOrderLine,
    focusStatementByRef: orderActions.focusStatementByRef,
    getTodoCustomerNotificationDraft,
    guardUiAction,
    isPrintTodo,
    openModal,
    refreshFulfillments, refreshTodos,
    selectedTodoId,
    setSelectedTodoId,
    setTodos,
    setTodoView,
    setToast,
    sortTodos,
    todos,
  });
  const inventoryActions = createOfficeInventoryActions({
    allowLocalFallback: !runtimeServerRequired,
    confirmInventoryCorrectionDraft,
    createInventoryCorrectionDraft,
    defaultOrderFilters,
    fulfillments,
    guardUiAction,
    inventoryLedgerSource: inventoryLedgerState.source,
    linkInventoryCorrectionAttachment,
    loadInventoryCorrectionDetail,
    loadProductionPackingSourceDetail: productionPackingActions.loadProductionPackingSourceDetail,
    orderLines,
    productionPacking,
    refreshInventoryCorrectionQueue,
    refreshInventoryLedgerEntries,
    resolveLineFromRef,
    setActivePage,
    setFulfillmentTab,
    setOrderFilters,
    setProductionPackingDetailState,
    setProductionPackingFocus,
    setSelectedFulfillmentId,
    setSelectedOrderId,
    setToast,
    statements,
  });

  const fulfillmentActions = createOfficeFulfillmentActions({
    allowLocalFallback: !runtimeServerRequired,
    authState,
    completeFulfillmentAction,
    confirmAction: (message) => window.confirm(message),
    currentUserId,
    findCustomer,
    focusOrderLine: orderActions.focusOrderLine,
    fulfillments,
    getFulfillmentDocumentLabel,
    guardUiAction,
    loadAttachmentAccessAudit: attachmentActions.loadAttachmentAccessAudit,
    markFulfillmentPrepared,
    mergeAttachmentSummaries,
    openAttachmentViewer,
    openModal,
    readBlobAsDataUrl,
    refreshTodos,
    reviewFulfillmentDeliveryEvidence,
    resolveFulfillmentQuantityVariance,
    selectedFulfillmentId,
    setActivePage,
    setFulfillments,
    setSelectedTodoId,
    setTodos,
    setToast,
    todos,
  });
  const driverDeliveryActions = createOfficeDriverDeliveryActions({
    addTodo,
    allowLocalFallback: !runtimeServerRequired,
    authState,
    currentUser,
    currentUserId,
    driverDeliveryTasks,
    fulfillments,
    guardUiAction,
    mergeAttachmentSummaries,
    readFileAsDataUrl,
    refreshDriverDeliveryTasks,
    setDriverDeliveryTasks,
    setFulfillments,
    setToast,
    todos,
  });
  const statementActionController = {
    allowLocalFallback: !runtimeServerRequired,
    authState,
    confirmAction: (message) => window.confirm(message),
    currentUser,
    currentUserId,
    downloadStatementExcelWorkbook,
    findCustomer,
    getStatementBlockingAmount,
    guardUiAction,
    loadAttachmentAccessAudit: attachmentActions.loadAttachmentAccessAudit,
    openAttachmentViewer,
    openModal,
    orderLines,
    readBlobAsDataUrl,
    refreshStatementDetail,
    selectedStatementId,
    setStatements,
    setToast,
    statements,
  };
  const { overlayRuntime, pageRuntime } = createOfficeWorkbenchRuntimes({
    attachmentActions,
    authState,
    currentUser,
    customers,
    driverDeliveryActions,
    findCustomer,
    firstReleaseMode: RAW_MATERIAL_FIRST_RELEASE_ENABLED,
    fulfillmentActions,
    getStatementBlockingAmount,
    interaction,
    inventoryActions,
    masterDataActions,
    officeWorkspace,
    orderActions,
    pageHelpers,
    permissionContext,
    printDeviceActions,
    productionPackingActions,
    rawMaterialActions,
    setActivePage,
    statementActionController,
    todoActions,
    v1StatusActionController,
  });
  return <OfficeWorkbenchShell runtime={{
    activeMeta,
    authSourceLabel,
    authState,
    createOrderFromTopbar: orderActions.createOrderFromTopbar,
    currentUser,
    currentUserId,
    firstReleaseMode: RAW_MATERIAL_FIRST_RELEASE_ENABLED,
    formalLoginRequired,
    logoutRuntimeUserSession,
    overlayRuntime,
    pageRuntime,
    permissionContext,
    refreshActivePage,
    renderedPage,
    roleFocusedShellPage,
    runtimeLoginLoading,
    runtimeNotice,
    setActivePage,
    setSidebarCollapsed,
    sidebarCollapsed,
    switchSeedUser,
    toast,
    unhandledTodos,
  }} />;
}
