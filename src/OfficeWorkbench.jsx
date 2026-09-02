import { useEffect, useState } from "react";
import { MenuFoldOutlined } from "@ant-design/icons";
import bagwinSidebarLogoUrl from "./assets/brand/BAGWIN_ERP_sidebar_horizontal_color.svg";
import bagwinSymbolUrl from "./assets/brand/BAGWIN_symbol_color.svg";
import { RAW_MATERIAL_FIRST_RELEASE_ENABLED } from "./config/rawMaterialFirstRelease.js";
import {
  allNavigationItems,
  desktopRequiredMobilePage,
  getDefaultNavigationPage,
  getMobileViewportPage,
  isDedicatedMobileRolePage,
  isNavigationPageVisible,
  roleBoundaryPage,
} from "./app/navigation.js";
import { AppNavigation, ContextNavigationStrip } from "./app/AppNavigation.jsx";
import { MobileRoleShellHeader } from "./app/MobileRoleShellHeader.jsx";
import { Topbar } from "./app/AppViews.jsx";
import { WorkspaceOverlayController } from "./app/WorkspaceOverlayController.jsx";
import { useOfficeInteractionController } from "./app/useOfficeInteractionController.js";
import { useOfficeWorkspace } from "./app/useOfficeWorkspace.js";
import { useOfficeActivePageEffects } from "./app/useOfficeActivePageEffects.js";
import { OfficeWorkspacePages } from "./app/OfficeWorkspacePages.jsx";
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
import { createOfficeStatementActions } from "./app/createOfficeStatementActions.js";
import { createOfficeTodoActions, createOfficeTodoAppender } from "./app/createOfficeTodoActions.js";
import { createOfficeV1StatusActions } from "./app/createOfficeV1StatusActions.js";
import {
  copyTextToClipboard,
  downloadMasterDataImportTemplateWorkbook,
  downloadStatementExcelWorkbook,
  downloadTextFile,
  mergeAttachmentSummaries,
  readBlobAsDataUrl,
  readFileAsDataUrl,
} from "./app/browserFileActions.js";
import { WorkspaceNotice, WorkspacePageHeader } from "./shared/ui/operational.jsx";
import {
  defaultSeedUserId,
  getUiActionState,
  seedUserOptions,
} from "./auth/seedPermissions.js";
import { loadOfficeWorkspace } from "./services/officeMockService.js";
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

const officeScenarioData = loadOfficeWorkspace();
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
export function OfficeWorkbench({
  authState,
  formalLoginRequired,
  logoutRuntimeUserSession,
  runtimeLoginLoading,
  runtimeNotice = "",
  runtimeServerRequired,
  switchSeedUser,
} = {}) {
  const [activePage, setActivePage] = useState("todos");
  const [mobileViewport, setMobileViewport] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const permissionContext = authState.permissions;
  const currentUser = permissionContext.user;
  const currentUserId = currentUser.userId ?? defaultSeedUserId;
  const canUsePrintDiagnostics = permissionContext.actionPermissions?.includes("fulfillment.print") === true;
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
    masterDataImportReviewDrafts, setMasterDataImportReviewDrafts,
    masterDataImportConfirmationPlans, setMasterDataImportConfirmationPlans,
    masterDataImportExecutions, setMasterDataImportExecutions,
    masterDataEmployeeAccountReviews, setMasterDataEmployeeAccountReviews,
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

  const {
    attachmentViewer,
    closeAttachmentViewer,
    closeMasterDataTemplatePanel,
    closeModal,
    closeOrderActionModal,
    confirmModal,
    confirmOrderLineAction,
    guardUiAction,
    masterDataTemplatePanel,
    modal,
    openAttachmentViewer,
    openMasterDataTemplatePanel: showMasterDataTemplatePanel,
    openModal,
    openOrderActionModal,
    orderActionModal,
    setToast,
    toast,
  } = useOfficeInteractionController({
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

  const defaultNavigationPage = getDefaultNavigationPage(permissionContext);
  const requestedPage = mobileViewport ? getMobileViewportPage(activePage, permissionContext) : activePage;
  const renderedPage = requestedPage === desktopRequiredMobilePage.key || isNavigationPageVisible(requestedPage, permissionContext) ? requestedPage : defaultNavigationPage;
  const activeMeta = allNavigationItems.find((item) => item.key === renderedPage) ?? roleBoundaryPage;
  const dedicatedMobileRolePage = isDedicatedMobileRolePage(renderedPage);
  const roleFocusedShellPage = dedicatedMobileRolePage || renderedPage === roleBoundaryPage.key
    || (mobileViewport && renderedPage === "rawMaterials");
  const authSourceLabel = authState.authenticated ? "后端认证" : formalLoginRequired ? "等待登录" : "本地权限";
  const unhandledTodos = todos.filter((item) => !item.handled).length;

  useEffect(() => {
    if (!isNavigationPageVisible(activePage, permissionContext)) {
      setActivePage(getDefaultNavigationPage(permissionContext));
    }
  }, [activePage, permissionContext]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => setMobileViewport(media.matches);
    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  const v1StatusActions = createOfficeV1StatusActions({
    actionSetters: v1StatusActionSetters,
    authState,
    currentUserId,
    readFileAsDataUrl,
    refreshV1GoLiveStatus,
    setToast,
  });
  const {
    commitMasterDataImportExecutionFromPlan,
    confirmMasterDataEmployeeIdentity,
    createMasterDataFailedRowsCorrectionDraft,
    createMasterDataImportConfirmationPlanFromDraft,
    createMasterDataImportExecutionFromPlan,
    createMasterDataImportReviewDraftFromPrecheck,
    downloadMasterDataImportFailedRows,
    downloadMasterDataTemplate,
    enableMasterDataEmployeeAccount,
    enableMasterDataEmployeeAccounts,
    issueMasterDataEmployeeAccountPassword,
    openMasterDataTemplatePanel,
    precheckMasterDataTemplate,
    revokeMasterDataEmployeeAccountPassword, saveMasterDataMachine,
    updateMasterDataEmployeeAssignment,
    updateMasterDataEmployeeProfile,
    saveMasterDataMaintenanceDraft,
  } = createOfficeMasterDataActions({
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
  const {
    confirmRawMaterialSupplierPayment,
    confirmRawMaterialSupplierStatement,
    confirmRawMaterialSupplierStatementReviewDraft,
    generateRawMaterialSupplierPayableDraft,
    recognizeRawMaterialDeliveryNote,
    saveRawMaterialSupplierStatementReviewDraft,
    updateRawMaterialInbound,
  } = createOfficeRawMaterialActions({
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


  const {
    changePrinterDeviceQaCheck,
    changePrinterDeviceQaEvidenceField,
    changePrinterDeviceQaField,
    dispatchPrintJobQueueItem,
    retryPrintJobQueueItem,
    savePrinterDeviceMode,
    savePrinterDeviceQaRecord,
    selectPrinterDeviceQaDevice,
  } = createOfficePrintDeviceActions({
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
  const {
    downloadViewedAttachment,
    loadAttachmentAccessAudit,
    syncStatementCustomerAttachmentsFromSource,
    syncStatementPaymentAttachmentsFromSource,
  } = createOfficeAttachmentActions({
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
    syncStatementCustomerAttachmentsFromSource,
    syncStatementPaymentAttachmentsFromSource,
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

  const {
    handleProductionPackingAction,
    loadProductionPackingSourceDetail,
    refreshPrintDriverDiagnostics,
    refreshPrintJobs,
  } = createOfficeProductionPackingActions({
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

  const {
    createOrderFromTopbar,
    entryAction,
    focusFulfillmentByRef, focusInventoryByRef, focusOrderDraft, focusOrderLine, focusStatementByRef,
    handleDraftCommand, linkCancellationIntentToSelectedLine, openOrderLineAction, openQueueDraft, recognize, recognizeQueue, refreshDraftQueue, restoreCancelledDraftLine, uploadDraftArtwork, updateDraftField,
  } = createOfficeOrderActions({
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
  const { handleTodo, repairTodoReference } = createOfficeTodoActions({
    allowLocalFallback: !runtimeServerRequired,
    authState,
    copyTextToClipboard,
    currentUser,
    currentUserId,
    findCustomer,
    focusFulfillmentByRef,
    focusInventoryByRef,
    focusOrderDraftByRef: focusOrderDraft,
    focusOrderLine,
    focusStatementByRef,
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
  const {
    focusInventoryLedgerSource,
    handleInventoryCorrectionAttachment,
    handleInventoryCorrectionConfirm,
    handleInventoryCorrectionDraft,
    openInventoryCorrectionDetail,
    refreshInventoryCorrectionQueueAction,
    refreshInventoryLedgerAction,
  } = createOfficeInventoryActions({
    allowLocalFallback: !runtimeServerRequired,
    confirmInventoryCorrectionDraft,
    createInventoryCorrectionDraft,
    defaultOrderFilters,
    fulfillments,
    guardUiAction,
    inventoryLedgerSource: inventoryLedgerState.source,
    linkInventoryCorrectionAttachment,
    loadInventoryCorrectionDetail,
    loadProductionPackingSourceDetail,
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

  const { updateFulfillment } = createOfficeFulfillmentActions({
    allowLocalFallback: !runtimeServerRequired,
    authState,
    completeFulfillmentAction,
    confirmAction: (message) => window.confirm(message),
    currentUserId,
    findCustomer,
    focusOrderLine,
    fulfillments,
    getFulfillmentDocumentLabel,
    guardUiAction,
    loadAttachmentAccessAudit,
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
  const { handleDriverDeliveryAction } = createOfficeDriverDeliveryActions({
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
  const { statementAction } = createOfficeStatementActions({
    allowLocalFallback: !runtimeServerRequired,
    authState,
    confirmAction: (message) => window.confirm(message),
    currentUser,
    currentUserId,
    downloadStatementExcelWorkbook,
    findCustomer,
    getStatementBlockingAmount,
    guardUiAction,
    loadAttachmentAccessAudit,
    openAttachmentViewer,
    openModal,
    orderLines,
    readBlobAsDataUrl,
    refreshStatementDetail,
    selectedStatementId,
    setStatements,
    setToast,
    statements,
  });
  const pageRuntime = {
    ...officeWorkspace,
    authState,
    canOpenMasterData: isNavigationPageVisible("masterData", permissionContext),
    changePrinterDeviceQaCheck,
    changePrinterDeviceQaEvidenceField,
    changePrinterDeviceQaField,
    confirmRawMaterialSupplierPayment,
    confirmRawMaterialSupplierStatement,
    confirmRawMaterialSupplierStatementReviewDraft,
    currentUser,
    customers,
    dispatchPrintJobQueueItem,
    enableMasterDataEmployeeAccounts,
    entryAction,
    firstReleaseMode: RAW_MATERIAL_FIRST_RELEASE_ENABLED,
    focusFulfillmentByRef,
    focusInventoryLedgerSource,
    focusStatementByRef,
    generateRawMaterialSupplierPayableDraft,
    handleDraftCommand,
    handleDriverDeliveryAction,
    handleInventoryCorrectionAttachment,
    handleInventoryCorrectionConfirm,
    handleInventoryCorrectionDraft,
    handleProductionPackingAction,
    handleTodo,
    linkCancellationIntentToSelectedLine,
    openInventoryCorrectionDetail,
    openMasterDataTemplatePanel,
    openOrderLineAction,
    openQueueDraft,
    pageHelpers,
    permissionContext,
    recognize,
    recognizeQueue,
    recognizeRawMaterialDeliveryNote,
    refreshDraftQueue,
    refreshInventoryCorrectionQueueAction,
    refreshInventoryLedgerAction,
    refreshPrintDriverDiagnostics,
    refreshPrintJobs,
    repairTodoReference,
    restoreCancelledDraftLine,
    retryPrintJobQueueItem,
    roleBoundaryDescription: roleBoundaryPage.description,
    saveMasterDataMachine,
    saveMasterDataMaintenanceDraft,
    savePrinterDeviceMode,
    savePrinterDeviceQaRecord,
    saveRawMaterialSupplierStatementReviewDraft,
    selectPrinterDeviceQaDevice,
    setActivePage,
    setToast,
    statementAction,
    updateDraftField,
    updateFulfillment,
    updateMasterDataEmployeeAssignment,
    updateMasterDataEmployeeProfile,
    updateRawMaterialInbound,
    uploadDraftArtwork,
    v1StatusActions,
  };
  return (
    <div className={`app-shell app-shell-${renderedPage}${roleFocusedShellPage ? " app-shell-mobile-role" : ""}${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      {!roleFocusedShellPage ? <aside className="sidebar">
        <div className="brand">
          <img alt="袋袋赢 BAGWIN" className="brand-logo-horizontal" src={bagwinSidebarLogoUrl} />
          <img alt="袋袋赢 BAGWIN" className="brand-logo-symbol" src={bagwinSymbolUrl} />
        </div>
        <AppNavigation
          activePage={renderedPage}
          collapsed={sidebarCollapsed}
          permissionContext={permissionContext}
          todoCount={unhandledTodos}
          onNavigate={setActivePage}
        />
        <button
          aria-expanded={!sidebarCollapsed}
          className="collapse-menu"
          onClick={() => setSidebarCollapsed((current) => !current)}
          title={sidebarCollapsed ? "展开菜单" : "收起菜单"}
          type="button"
        >
          <MenuFoldOutlined aria-hidden="true" />
          <span>{sidebarCollapsed ? "展开菜单" : "收起菜单"}</span>
        </button>
      </aside> : null}

      <div className="workspace">
        {roleFocusedShellPage ? (
          <MobileRoleShellHeader
            canViewOwnAttendance={permissionContext.actionPermissions?.includes("attendance.self.read") === true}
            currentUser={currentUser}
            currentUserId={currentUserId}
            demoMode={!formalLoginRequired}
            logoutLoading={runtimeLoginLoading}
            onLogout={logoutRuntimeUserSession}
            onNavigate={setActivePage}
            onUserChange={switchSeedUser}
            pageKey={renderedPage}
            userOptions={seedUserOptions}
          />
        ) : <Topbar
          authSourceLabel={authSourceLabel}
          currentUserId={currentUserId} currentUser={currentUser}
          firstReleaseMode={RAW_MATERIAL_FIRST_RELEASE_ENABLED}
          onCreateOrder={createOrderFromTopbar} onLogout={formalLoginRequired && authState.authenticated ? logoutRuntimeUserSession : undefined}
          onOpenTodos={() => setActivePage("todos")}
          onUserChange={switchSeedUser}
          logoutLoading={runtimeLoginLoading} todoCount={unhandledTodos}
          userOptions={formalLoginRequired ? [currentUser] : seedUserOptions}
          getUiActionState={(surface, action) => getUiActionState(permissionContext, surface, action)}
        />}
        <main className="content">
          {runtimeNotice ? <WorkspaceNotice>{runtimeNotice}</WorkspaceNotice> : null}
          {toast && toast !== runtimeNotice ? <WorkspaceNotice>{toast}</WorkspaceNotice> : null}
          {!roleFocusedShellPage ? <WorkspacePageHeader
            title={activeMeta.label}
            onRefresh={renderedPage === "entry" ? undefined : refreshActivePage}
          /> : null}
          {!roleFocusedShellPage ? (
            <ContextNavigationStrip
              activePage={renderedPage}
              onNavigate={setActivePage}
              permissionContext={permissionContext}
              todoCount={unhandledTodos}
            />
          ) : null}
          <OfficeWorkspacePages renderedPage={renderedPage} runtime={pageRuntime} />
        </main>
      </div>

      <WorkspaceOverlayController
        attachmentViewer={attachmentViewer}
        closeAttachmentViewer={closeAttachmentViewer}
        closeMasterDataTemplatePanel={closeMasterDataTemplatePanel}
        closeModal={closeModal}
        closeOrderActionModal={closeOrderActionModal}
        confirmMasterDataEmployeeIdentity={confirmMasterDataEmployeeIdentity}
        confirmModal={confirmModal}
        confirmOrderLineAction={confirmOrderLineAction}
        commitMasterDataImportExecutionFromPlan={commitMasterDataImportExecutionFromPlan}
        createMasterDataFailedRowsCorrectionDraft={createMasterDataFailedRowsCorrectionDraft}
        createMasterDataImportConfirmationPlanFromDraft={createMasterDataImportConfirmationPlanFromDraft}
        createMasterDataImportExecutionFromPlan={createMasterDataImportExecutionFromPlan}
        createMasterDataImportReviewDraftFromPrecheck={createMasterDataImportReviewDraftFromPrecheck}
        downloadMasterDataImportFailedRows={downloadMasterDataImportFailedRows}
        downloadMasterDataTemplate={downloadMasterDataTemplate}
        downloadViewedAttachment={downloadViewedAttachment}
        employeeAccountReviews={masterDataEmployeeAccountReviews}
        enableMasterDataEmployeeAccount={enableMasterDataEmployeeAccount}
        findCustomer={findCustomer}
        fulfillments={fulfillments}
        getStatementBlockingAmount={getStatementBlockingAmount}
        getUiActionState={(surface, action) => getUiActionState(permissionContext, surface, action)}
        importExecutions={masterDataImportExecutions}
        issueMasterDataEmployeeAccountPassword={issueMasterDataEmployeeAccountPassword}
        lastIssuedEmployeeCredential={lastIssuedEmployeeCredential}
        masterDataConfirmationPlans={masterDataImportConfirmationPlans}
        masterDataPrecheckState={masterDataPrecheckState}
        masterDataReviewDrafts={masterDataImportReviewDrafts}
        masterDataTemplatePanel={masterDataTemplatePanel}
        modal={modal}
        onPrecheckMasterDataTemplate={precheckMasterDataTemplate}
        onRefreshEmployeeAccountReviews={(options) => refreshMasterDataEmployeeAccountReviews(options).then((result) => {
          if (result?.feedback) setToast(result.feedback);
          return result;
        })}
        orderActionModal={orderActionModal}
        orderLines={orderLines}
        revokeMasterDataEmployeeAccountPassword={revokeMasterDataEmployeeAccountPassword}
        statements={statements}
      />
    </div>
  );
}
