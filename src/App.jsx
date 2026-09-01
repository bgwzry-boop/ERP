import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
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
import { RuntimeAuthBoundary } from "./app/RuntimeAuthBoundary.jsx";
import { useRuntimeAuthInitialization } from "./app/useRuntimeAuthInitialization.js";
import { useRuntimeAuthInvalidation, useRuntimeSessionExpiry, useRuntimeSessionRevalidation } from "./app/useRuntimeSessionExpiry.js";
import { useOfficeInteractionController } from "./app/useOfficeInteractionController.js";
import { useOfficeWorkspace } from "./app/useOfficeWorkspace.js";
import { useRawMaterialInboundAutoRefresh } from "./app/useRawMaterialInboundAutoRefresh.js";
import { createOfficeAttachmentActions } from "./app/createOfficeAttachmentActions.js";
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
import { createRuntimeAuthActions } from "./app/createRuntimeAuthActions.js";
import {
  copyTextToClipboard,
  downloadMasterDataImportTemplateWorkbook,
  downloadStatementExcelWorkbook,
  downloadTextFile,
  mergeAttachmentSummaries,
  readBlobAsDataUrl,
  readFileAsDataUrl,
} from "./app/browserFileActions.js";
import { DataState, WorkspaceNotice, WorkspacePageHeader } from "./shared/ui/operational.jsx";
import {
  defaultSeedUserId,
  getUiActionState,
  seedUserOptions,
} from "./auth/seedPermissions.js";
import {
  createInitialAuthState,
  isOfficeApiServerRequired,
  isOfficeSharedDataServerRequired,
} from "./services/officeAuthService.js";
import { getOfficeOrderLineDetail } from "./services/officeOrderPoolLazyApi.js";
import {
  buildPackingTaskId,
  buildProductionTaskId,
  findProductionInventoryItem,
} from "./services/officeProductionPackingSelectors.js";
import { loadOfficeWorkspace } from "./services/officeMockService.js";
import {
  availableQty,
  defaultOrderFilters,
  defaultStatementFilters,
  editableColors,
  findCustomer as findCustomerRecord,
  findOrderLine,
  formatStockKey,
  getDraftColorSpecLabel,
  getDraftMissingFields,
  getDraftNote,
  getDraftStatusTone,
  getDraftTypeLabel,
  getDraftTypeTone,
  getDeliveryEvidenceReviewStatus,
  getDeliveryEvidenceReviewTone,
  getFulfillmentActions,
  getFulfillmentDocumentLabel,
  getFulfillmentGoodsDisplay,
  getFulfillmentNextStep,
  getLineColorSpecLabel,
  getLinePrintSide,
  getLineRemark,
  getOrderExceptionState,
  getOrderFinanceState as getOrderFinanceStateRecord,
  getOrderLineShortNo,
  getStatementBlockingAmount as getStatementBlockingAmountRecord,
  getStatementBucket as getStatementBucketRecord,
  getStatementDisplayDebt as getStatementDisplayDebtRecord,
  getStatementFinancialSummary as getStatementFinancialSummaryRecord,
  getStatementForLine,
  getStockStateGroup,
  getStockStateTone,
  getStockTone,
  getStockTrustLabel,
  getTodoActions,
  getTodoCustomerNotificationDraft,
  getTodoHandlingRule,
  getTodoTone,
  isCustomProductLine,
  isPendingStock,
  isPrintTodo,
  money,
  orderMatchesFilters as orderMatchesFiltersRecord,
  resolveLineFromRef,
  sortTodos,
  statementFilterOptions,
  statementMatchesFilters as statementMatchesFiltersRecord,
  statusTone,
  uniqueStockOptions,
} from "./domain/officeRules.js";

function lazyNamedPage(loadModule, exportName, loadStyles = []) {
  return lazy(async () => {
    const [module] = await Promise.all([loadModule(), ...loadStyles.map((loadStyle) => loadStyle())]);
    return { default: module[exportName] };
  });
}

function PageLoader({ component: Component, fallback, ...props }) {
  return (
    <Suspense fallback={<DataState title={fallback} />}>
      <Component {...props} />
    </Suspense>
  );
}

const TodoPage = lazyNamedPage(() => import("./features/todos/TodoPage.jsx"), "TodoPage", [() => import("./styles/features/todos.css")]);
const EntryPage = lazyNamedPage(() => import("./features/orders/EntryPage.jsx"), "EntryPage", [() => import("./styles/features/orders-entry.css")]);
const OrderPoolPage = lazyNamedPage(() => import("./features/orders/OrderPoolPage.jsx"), "OrderPoolPage", [() => import("./styles/features/orders-pool.css")]);
const InventoryPage = lazyNamedPage(() => import("./features/inventory/InventoryPage.jsx"), "InventoryPage", [() => import("./styles/features/inventory.css")]);
const FulfillmentPage = lazyNamedPage(() => import("./features/fulfillment/FulfillmentPage.jsx"), "FulfillmentPage", [() => import("./styles/features/fulfillment.css")]);
const ProductionPackingPage = lazyNamedPage(() => import("./features/production/ProductionPackingPage.jsx"), "ProductionPackingPage", [() => import("./styles/features/production-print.css"), () => import("./styles/features/print-documents.css")]);
const WorkshopMobilePage = lazyNamedPage(() => import("./features/workshop/WorkshopMobilePage.jsx"), "WorkshopMobilePage", [() => import("./styles/features/mobile-roles.css"), () => import("./styles/features/production-print.css")]);
const DriverMobilePage = lazyNamedPage(() => import("./features/driver/DriverMobilePage.jsx"), "DriverMobilePage", [() => import("./styles/features/mobile-roles.css"), () => import("./styles/features/driver.css")]);
const WarehouseMobilePage = lazyNamedPage(() => import("./features/warehouse/WarehouseMobilePage.jsx"), "WarehouseMobilePage", [() => import("./styles/features/mobile-roles.css"), () => import("./styles/features/warehouse.css")]);
const StatementPage = lazyNamedPage(() => import("./features/statements/StatementPage.jsx"), "StatementPage", [() => import("./styles/features/statements.css")]);
const RawMaterialRoute = lazyNamedPage(() => import("./app/routes/RawMaterialRoute.jsx"), "RawMaterialRoute");
const MasterDataRoute = lazyNamedPage(() => import("./app/routes/MasterDataRoute.jsx"), "MasterDataRoute");
const V1StatusRoute = lazyNamedPage(() => import("./app/routes/V1StatusRoute.jsx"), "V1StatusRoute");
const OfficeMobilePage = lazyNamedPage(() => import("./features/office-mobile/OfficeMobilePage.jsx"), "OfficeMobilePage", [() => import("./styles/features/mobile-roles.css")]);
const DecisionMobilePage = lazyNamedPage(() => import("./features/decisions/DecisionMobilePage.jsx"), "DecisionMobilePage", [() => import("./styles/features/mobile-roles.css"), () => import("./styles/features/role-tools.css")]);
const MaintenanceMobilePage = lazyNamedPage(() => import("./features/maintenance/MaintenanceMobilePage.jsx"), "MaintenanceMobilePage", [() => import("./styles/features/mobile-roles.css"), () => import("./styles/features/role-tools.css")]);
const DesktopRequiredMobilePage = lazyNamedPage(() => import("./features/mobile/DesktopRequiredMobilePage.jsx"), "DesktopRequiredMobilePage", [() => import("./styles/features/mobile-roles.css")]);
const PayrollAttendancePage = lazyNamedPage(() => import("./features/payroll/PayrollAttendancePage.jsx"), "PayrollAttendancePage", [() => import("./styles/features/payroll-attendance.css")]);
const EmployeeAttendanceMobilePage = lazyNamedPage(() => import("./features/payroll/EmployeeAttendanceMobilePage.jsx"), "EmployeeAttendanceMobilePage", [() => import("./styles/features/payroll-attendance.css")]);

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
export function App({ signedPreviewUserId = "" } = {}) {
  const signedPreviewAuthOptions = useMemo(() => {
    const normalizedPreviewUserId = String(signedPreviewUserId ?? "").trim();
    if (!normalizedPreviewUserId) return null;
    return Object.freeze({
      defaultUserId: normalizedPreviewUserId,
      serverRequired: false,
      stagingAuthBypass: true,
    });
  }, [signedPreviewUserId]);
  const formalLoginRequired = isOfficeApiServerRequired(signedPreviewAuthOptions ?? undefined);
  const runtimeServerRequired = isOfficeSharedDataServerRequired();
  const [activePage, setActivePage] = useState("todos");
  const [mobileViewport, setMobileViewport] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [authState, setAuthState] = useState(() => createInitialAuthState(signedPreviewAuthOptions ?? undefined)); const [runtimeLoginForm, setRuntimeLoginForm] = useState({ loginName: "", password: "" });
  const [runtimeLoginLoading, setRuntimeLoginLoading] = useState(false);
  const runtimeLoginRequestRef = useRef(0);
  const [runtimePasswordChangeForm, setRuntimePasswordChangeForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [runtimePasswordChangeError, setRuntimePasswordChangeError] = useState("");
  const [runtimePasswordChangeLoading, setRuntimePasswordChangeLoading] = useState(false);
  const permissionContext = authState.permissions;
  const currentUser = permissionContext.user;
  const currentUserId = currentUser.userId ?? defaultSeedUserId;
  const canUsePrintDiagnostics = permissionContext.actionPermissions?.includes("fulfillment.print") === true;
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
    createTemporaryInventoryHold, releaseTemporaryInventoryHold, extendTemporaryInventoryHold,
    completeFulfillmentAction, handoffPaperOutbound, markFulfillmentPrepared, recordWarehouseExecution, reviewFulfillmentDeliveryEvidence,
    saveFulfillmentDispatch, submitFulfillmentException, resolveFulfillmentQuantityVariance,
    executeProductionPackingAction,
    refreshMasterDataEmployeeAccountReviews, refreshMasterDataImportReviewDrafts,
    refreshStatementDetail, refreshStatements, refreshV1GoLiveStatus,
    executeOrderEntryAction, executeOrderLineAction, openQueuedOrderDraft,
    recognizeOrderDraft, recognizeOrderDraftQueue, refreshOrderDraftQueue,
    runOrderDraftCommand, updateOrderEntryText, updateOrderDraftField, prepareOrderDraftFromTemporaryHold, linkCrossDraftShortageCancellation, restoreShortageCancelledLine,
    todos, setTodos, todoMeta, printBatchRecords,
    selectedTodoId, setSelectedTodoId, todoView, setTodoView,
    orderLines, orderPoolMeta, setOrderPoolMeta,
    selectedOrderDetail, setSelectedOrderDetail, entryText, setEntryText,
    draftRows, setDraftRows, draftStatus, setDraftStatus, draftApiMeta, setDraftApiMeta,
    selectedDraftId, setSelectedDraftId, orderFilters, setOrderFilters,
    selectedOrderId, setSelectedOrderId,
    inventoryRecords, inventoryMeta,
    inventoryLedgerState, inventoryLedgerFilters, setInventoryLedgerFilters,
    inventoryCorrectionDetailState,
    inventoryCorrectionQueueState,
    inventoryIntentState,
    selectedStockId, setSelectedStockId,
    fulfillmentTab, setFulfillmentTab, fulfillments, setFulfillments, fulfillmentMeta,
    selectedFulfillmentId, setSelectedFulfillmentId,
    productionPacking, productionPackingFocus, setProductionPackingFocus,
    productionPackingDetailState, setProductionPackingDetailState,
    printerDeviceQa, setPrinterDeviceQa, printJobQueue,
    printDriverConfig, printDriverReadiness, printDriverCupsDiagnostics,
    driverDeliveryTasks, setDriverDeliveryTasks, driverDeliveryMeta,
    selectedDriverTaskId, setSelectedDriverTaskId,
    statements, setStatements, selectedStatementId, setSelectedStatementId, statementReadMeta,
    masterDataPrecheckState, setMasterDataPrecheckState,
    masterDataImportReviewDrafts, setMasterDataImportReviewDrafts,
    masterDataImportConfirmationPlans, setMasterDataImportConfirmationPlans,
    masterDataImportExecutions, setMasterDataImportExecutions,
    masterDataEmployeeAccountReviews, setMasterDataEmployeeAccountReviews, masterDataEmployeeAccountReadiness, masterDataEmployeeAssignmentOptions,
    lastIssuedEmployeeCredential, setLastIssuedEmployeeCredential,
    masterDataMaintenanceDrafts, setMasterDataMaintenanceDrafts,
    masterDataMaintenanceTab, setMasterDataMaintenanceTab,
    selectedMasterDataId, setSelectedMasterDataId,
    rawMaterialInbounds, setRawMaterialInbounds, rawMaterialInboundMeta, setRawMaterialInboundMeta,
    rawMaterialSupplierStatementReviews, setRawMaterialSupplierStatementReviews,
    rawMaterialSupplierStatementReviewMeta, setRawMaterialSupplierStatementReviewMeta,
    selectedRawMaterialInboundId, setSelectedRawMaterialInboundId,
    v1StatusRouteState, v1StatusActionSetters,
    orderLinesRef, rawMaterialInboundsRef,
    rawMaterialSupplierStatementReviewsRef,
    selectedStockIdRef, printerDeviceQaSelectedIdRef,
    paymentAttachmentSyncKeysRef, customerConfirmationAttachmentSyncKeysRef,
  } = useOfficeWorkspace({
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
  const pageHelpers = {
    availableQty,
    buildPackingTaskId,
    buildProductionTaskId,
    customers,
    defaultOrderFilters,
    defaultStatementFilters,
    editableColors,
    findCustomer,
    findOrderLine,
    findProductionInventoryItem,
    formatStockKey,
    getDraftColorSpecLabel,
    getDraftMissingFields,
    getDraftNote,
    getDraftStatusTone,
    getDraftTypeLabel,
    getDraftTypeTone,
    getDeliveryEvidenceReviewStatus,
    getDeliveryEvidenceReviewTone,
    getFulfillmentActions,
    getFulfillmentDocumentLabel,
    getFulfillmentGoodsDisplay,
    getFulfillmentNextStep,
    getLineColorSpecLabel,
    getLinePrintSide,
    getLineRemark,
    getOrderExceptionState,
    getOrderFinanceState,
    getOrderLineShortNo,
    getStatementBlockingAmount,
    getStatementBucket,
    getStatementDisplayDebt,
    getStatementFinancialSummary,
    getStatementForLine,
    getStockStateGroup,
    getStockStateTone,
    getStockTone,
    getStockTrustLabel,
    getTodoActions,
    getTodoCustomerNotificationDraft,
    getTodoHandlingRule,
    getTodoTone,
    getUiActionState: (surface, action) => getUiActionState(permissionContext, surface, action),
    permissionContext,
    currentUser,
    isCustomProductLine,
    isPendingStock,
    isPrintTodo,
    money,
    seedUserOptions,
    orderMatchesFilters,
    sampleText,
    sortTodos,
    statementFilterOptions,
    statementMatchesFilters,
    statusTone,
    uniqueStockOptions,
  };

  useEffect(() => {
    if (activePage !== "v1Status") return;
    void refreshV1GoLiveStatus();
  }, [activePage, refreshV1GoLiveStatus]);

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

  useRuntimeAuthInitialization({
    authOptions: signedPreviewAuthOptions,
    authState,
    serverRequired: formalLoginRequired,
    setAuthState,
    setToast,
  });

  useEffect(() => {
    let cancelled = false;
    refreshOrderPool({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [refreshOrderPool]);

  useEffect(() => {
    if (activePage !== "driverMobile") return undefined;
    let cancelled = false;
    refreshDriverDeliveryTasks({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshDriverDeliveryTasks]);

  useRawMaterialInboundAutoRefresh({
    activePage,
    refreshRawMaterialInbounds,
    refreshRawMaterialSupplierStatementReviews,
  });

  useEffect(() => {
    if (activePage !== "todos") return undefined;
    let cancelled = false;
    refreshTodos({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshTodos]);

  useEffect(() => {
    if (activePage !== "orders" || !selectedOrderId) return undefined;
    let cancelled = false;
    setOrderPoolMeta((current) => ({ ...current, detailLoading: true, detailError: "" }));
    getOfficeOrderLineDetail({
      authState,
      orderLineId: selectedOrderId,
      operatorId: currentUserId,
      localOrderLines: orderLinesRef.current,
      localFulfillments: fulfillments,
      localStatements: statements,
    }).then((result) => {
      if (cancelled) return;
      if (result.blocked) {
        setSelectedOrderDetail(null);
        setOrderPoolMeta((current) => ({
          ...current,
          detailSource: result.source,
          detailLoading: false,
          detailError: result.error?.message ?? "订单明细详情 API 返回错误。",
        }));
        return;
      }
      setSelectedOrderDetail(result.detail);
      setOrderPoolMeta((current) => ({
        ...current,
        detailSource: result.source,
        detailLoading: false,
        detailError: result.error?.message ?? "",
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, authState, currentUserId, fulfillments, selectedOrderId, statements]);

  useEffect(() => {
    if (activePage !== "inventory") return undefined;
    let cancelled = false;
    refreshInventoryRecords({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshInventoryRecords]);

  useEffect(() => {
    if (activePage !== "fulfillment") return undefined;
    let cancelled = false;
    refreshFulfillments({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshFulfillments]);

  useEffect(() => {
    if (activePage !== "inventory") return undefined;
    let cancelled = false;
    Promise.all([refreshInventoryCorrectionQueue({ showToast: false }), refreshInventoryIntents({ showToast: false })])
      .then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [activePage, refreshInventoryCorrectionQueue, refreshInventoryIntents]);

  useEffect(() => {
    if (activePage !== "inventory" || !selectedStockId) return undefined;
    let cancelled = false;
    refreshInventoryLedgerEntries({ stockId: selectedStockId, showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshInventoryLedgerEntries, selectedStockId]);

  useEffect(() => {
    if (!["packing", "workshopMobile", "rawMaterialScanner"].includes(activePage)) return undefined;
    let cancelled = false;
    refreshProductionPackingTaskLists({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshProductionPackingTaskLists]);

  useEffect(() => {
    if (activePage !== "packing" || !canUsePrintDiagnostics) return undefined;
    let cancelled = false;
    refreshPrintDriverConfig({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, canUsePrintDiagnostics, refreshPrintDriverConfig]);

  useEffect(() => {
    if (activePage !== "packing" || !canUsePrintDiagnostics) return undefined;
    let cancelled = false;
    refreshPrintDriverReadiness({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, canUsePrintDiagnostics, refreshPrintDriverReadiness]);

  useEffect(() => {
    if (activePage !== "packing" || !canUsePrintDiagnostics) return undefined;
    let cancelled = false;
    refreshPrintDriverCupsDiagnostics({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, canUsePrintDiagnostics, refreshPrintDriverCupsDiagnostics]);

  useEffect(() => {
    if (activePage !== "packing") return undefined;
    let cancelled = false;
    refreshPrinterDeviceQa({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshPrinterDeviceQa]);

  useEffect(() => {
    if (activePage !== "packing") return undefined;
    let cancelled = false;
    refreshOfficePrintJobQueue({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshOfficePrintJobQueue]);

  useEffect(() => {
    if (activePage !== "statements") return undefined;
    let cancelled = false;
    refreshStatements({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshStatements]);

  useEffect(() => {
    if (activePage !== "statements" || !selectedStatementId) return undefined;
    let cancelled = false;
    refreshStatementDetail({ statementId: selectedStatementId, showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshStatementDetail, selectedStatementId]);

  const selectedStatementPaymentAttachmentKey = (statements.find(
    (item) => item.id === selectedStatementId,
  )?.paymentAttachmentIds ?? []).join("|");

  useEffect(() => {
    if (activePage !== "statements" || !selectedStatementId) return undefined;
    let cancelled = false;
    void syncStatementPaymentAttachmentsFromSource(selectedStatementId, {
      isCancelled: () => cancelled,
      cacheKey: selectedStatementPaymentAttachmentKey,
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, authState, currentUserId, selectedStatementId, selectedStatementPaymentAttachmentKey]);

  useEffect(() => {
    if (activePage !== "statements" || !selectedStatementId) return undefined;
    let cancelled = false;
    void syncStatementCustomerAttachmentsFromSource(selectedStatementId, {
      isCancelled: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, authState, currentUserId, selectedStatementId]);

  const { expireRuntimeUserSession, invalidateRuntimeUserSession, logoutRuntimeUserSession, revalidateRuntimeUserSession, switchSeedUser, submitRuntimeLogin, submitRuntimePasswordChange } = createRuntimeAuthActions({
    authState,
    runtimeLoginForm, runtimeLoginLoading,
    runtimePasswordChangeForm, runtimePasswordChangeLoading,
    runtimeServerRequired: formalLoginRequired, runtimeLoginRequestRef,
    setAuthState, setRuntimeLoginForm, setRuntimeLoginLoading,
    setRuntimePasswordChangeError, setRuntimePasswordChangeForm, setRuntimePasswordChangeLoading,
    setToast,
  });
  useRuntimeSessionExpiry({ authState, enabled: formalLoginRequired, onExpire: expireRuntimeUserSession });
  useRuntimeAuthInvalidation({ enabled: formalLoginRequired, onInvalidate: invalidateRuntimeUserSession });
  useRuntimeSessionRevalidation({ authState, enabled: formalLoginRequired, onRevalidate: revalidateRuntimeUserSession });
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
  if (formalLoginRequired && (!authState.authenticated || authState.permissions.passwordChangeRequired === true || authState.permissions.user?.mustChangePassword === true)) {
    return (
      <RuntimeAuthBoundary
        authState={authState}
        passwordChange={{
          error: runtimePasswordChangeError,
          form: runtimePasswordChangeForm,
          loading: runtimePasswordChangeLoading,
          onChange: (field, value) => {
            setRuntimePasswordChangeError("");
            setRuntimePasswordChangeForm((current) => ({ ...current, [field]: value }));
          },
          onSubmit: submitRuntimePasswordChange,
        }}
        runtimeLogin={{
          form: runtimeLoginForm,
          loading: runtimeLoginLoading,
          onChange: (field, value) => setRuntimeLoginForm((current) => ({ ...current, [field]: value })),
          onSubmit: submitRuntimeLogin,
        }}
        runtimeServerRequired={formalLoginRequired}
        user={currentUser}
      />
    );
  }

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
          {toast ? <WorkspaceNotice>{toast}</WorkspaceNotice> : null}
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
          {renderedPage === "roleBoundary" && (
            <DataState title="当前岗位没有 ERP 操作菜单" detail={roleBoundaryPage.description} />
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
          {renderedPage === "todos" && <PageLoader component={TodoPage} fallback="待办加载中" todos={todos} todoMeta={todoMeta} printBatchRecords={printBatchRecords} selectedTodoId={selectedTodoId} onSelect={setSelectedTodoId} view={todoView} setView={setTodoView} onAction={handleTodo} onRepairReference={repairTodoReference} helpers={pageHelpers} />}
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
          {renderedPage === "inventory" && (
            <PageLoader component={InventoryPage} fallback="成品库存加载中"
              inventoryRecords={inventoryRecords}
              inventoryMeta={inventoryMeta}
              inventoryLedgerEntries={inventoryLedgerState.items}
              inventoryLedgerMeta={inventoryLedgerState}
              inventoryLedgerFilters={inventoryLedgerFilters}
              setInventoryLedgerFilters={setInventoryLedgerFilters}
              inventoryCorrectionDetailState={inventoryCorrectionDetailState}
              inventoryCorrectionQueueState={inventoryCorrectionQueueState} inventoryIntentState={inventoryIntentState}
              selectedStockId={selectedStockId}
              setSelectedStockId={setSelectedStockId}
              setToast={setToast}
              onCreateCorrectionDraft={handleInventoryCorrectionDraft}
              onLinkCorrectionAttachment={handleInventoryCorrectionAttachment}
              onConfirmCorrectionDraft={handleInventoryCorrectionConfirm}
              onOpenCorrectionDraft={openInventoryCorrectionDetail}
              onRefreshCorrectionQueue={refreshInventoryCorrectionQueueAction}
              onRefreshInventoryLedger={refreshInventoryLedgerAction}
              onRefreshInventoryIntents={refreshInventoryIntents} onCreateTemporaryHold={createTemporaryInventoryHold}
              onReleaseTemporaryHold={releaseTemporaryInventoryHold} onExtendTemporaryHold={extendTemporaryInventoryHold} onConvertTemporaryHoldToOrder={async ({ hold, intent, candidate }) => { const result = await prepareOrderDraftFromTemporaryHold({ hold, intent, candidate }); if (!result?.blocked) setActivePage("entry"); return result; }}
              onLocateInventoryLedgerSource={focusInventoryLedgerSource}
              helpers={pageHelpers}
            />
          )}
          {renderedPage === "fulfillment" && (
            <PageLoader component={FulfillmentPage} fallback="出库工作台加载中"
              authState={authState}
              currentUser={currentUser}
              tab={fulfillmentTab}
              setTab={setFulfillmentTab}
              fulfillments={fulfillments}
              orderLines={orderLines}
              selectedId={selectedFulfillmentId}
              setSelectedId={setSelectedFulfillmentId}
              onAction={updateFulfillment}
              onRefresh={() => refreshFulfillments({ showToast: true })}
              helpers={pageHelpers}
            />
          )}
          {renderedPage === "packing" && (
            <PageLoader component={ProductionPackingPage} fallback="生产打包加载中"
              authState={authState}
              currentUser={currentUser}
              orderLines={orderLines}
              fulfillments={fulfillments}
              inventoryRecords={inventoryRecords}
              productionPacking={productionPacking}
              focusTarget={productionPackingFocus}
              sourceDetailState={productionPackingDetailState}
              printerDeviceQa={printerDeviceQa}
              printJobQueue={printJobQueue}
              printDriverConfig={printDriverConfig}
              printDriverReadiness={printDriverReadiness}
              printDriverCupsDiagnostics={printDriverCupsDiagnostics}
              onAction={handleProductionPackingAction}
              onRefreshProduction={() => refreshProductionPackingTaskLists({ showToast: false })}
              onRefreshPrintDriverConfig={refreshPrintDriverDiagnostics}
              onRefreshPrintDriverReadiness={() => refreshPrintDriverReadiness({ showToast: true })}
              onRefreshPrinterDeviceQa={() => refreshPrinterDeviceQa({ showToast: true })}
              onSelectPrinterDeviceQaDevice={selectPrinterDeviceQaDevice}
              onChangePrinterDeviceQaField={changePrinterDeviceQaField}
              onChangePrinterDeviceQaCheck={changePrinterDeviceQaCheck}
              onChangePrinterDeviceQaEvidenceField={changePrinterDeviceQaEvidenceField}
              onSavePrinterDeviceMode={savePrinterDeviceMode}
              onSavePrinterDeviceQa={savePrinterDeviceQaRecord}
              onRefreshPrintJobs={refreshPrintJobs}
              onDispatchPrintJob={dispatchPrintJobQueueItem}
              onRetryPrintJob={retryPrintJobQueueItem}
              helpers={pageHelpers}
            />
          )}
          {renderedPage === "workshopMobile" && (
            <PageLoader component={WorkshopMobilePage} fallback="车间工作台加载中"
              orderLines={orderLines}
              inventoryRecords={inventoryRecords}
              productionPacking={productionPacking}
              onAction={handleProductionPackingAction}
              onNavigate={setActivePage}
              helpers={pageHelpers}
            />
          )}
          {renderedPage === "driverMobile" && (
            <PageLoader component={DriverMobilePage} fallback="司机工作台加载中"
              tasks={driverDeliveryTasks}
              selectedTaskId={selectedDriverTaskId}
              setSelectedTaskId={setSelectedDriverTaskId}
              meta={driverDeliveryMeta}
              onAction={handleDriverDeliveryAction}
              helpers={pageHelpers}
            />
          )}
          {renderedPage === "warehouseMobile" && (
            <PageLoader component={WarehouseMobilePage} fallback="库房工作台加载中"
              fulfillments={fulfillments}
              orderLines={orderLines}
              selectedId={selectedFulfillmentId}
              setSelectedId={setSelectedFulfillmentId}
              onAction={updateFulfillment}
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
          {renderedPage === "statements" && (
            <PageLoader component={StatementPage} fallback="对账工作台加载中"
              authState={authState}
              currentUser={currentUser}
              statements={statements}
              readMeta={statementReadMeta}
              orderLines={orderLines}
              selectedId={selectedStatementId}
              setSelectedId={setSelectedStatementId}
              onAction={statementAction}
              onRefresh={() => refreshStatementDetail({ statementId: selectedStatementId, showToast: false })}
              helpers={pageHelpers}
            />
          )}
          {renderedPage === "rawMaterials" && (
            <PageLoader component={RawMaterialRoute} fallback="原材料工作台加载中" view="inbound"
              firstReleaseMode={RAW_MATERIAL_FIRST_RELEASE_ENABLED}
              state={{
                authState,
                currentUser,
                helpers: pageHelpers,
                inbounds: rawMaterialInbounds,
                meta: rawMaterialInboundMeta,
                printerDeviceQa,
                productionTasks: productionPacking.productionTasks,
                selectedId: selectedRawMaterialInboundId,
                statementReviewMeta: rawMaterialSupplierStatementReviewMeta,
                statementReviews: rawMaterialSupplierStatementReviews,
              }}
              actions={{
                onAction: updateRawMaterialInbound,
                onDeliveryNoteRecognize: recognizeRawMaterialDeliveryNote,
                onPayableDraftGenerate: generateRawMaterialSupplierPayableDraft,
                onPaymentConfirm: confirmRawMaterialSupplierPayment,
                onStatementConfirm: confirmRawMaterialSupplierStatement,
                onStatementReviewConfirm: confirmRawMaterialSupplierStatementReviewDraft,
                onStatementReviewDraftCreate: saveRawMaterialSupplierStatementReviewDraft,
                setSelectedId: setSelectedRawMaterialInboundId,
              }}
            />
          )}
          {renderedPage === "rawMaterialScanner" && (
            <PageLoader component={RawMaterialRoute} fallback="原材料扫码加载中" view="scanner"
              state={{ helpers: pageHelpers, inbounds: rawMaterialInbounds, productionState: productionPacking }}
              actions={{ onAction: updateRawMaterialInbound }}
            />
          )}
          {renderedPage === "masterData" && (
            <Suspense fallback={<DataState title="基础资料工作台加载中" />}><MasterDataRoute
              state={{
                authState,
                currentUser,
                customers,
                employeeAccountReadiness: masterDataEmployeeAccountReadiness,
                employeeAccountReviews: masterDataEmployeeAccountReviews,
                employeeAssignmentOptions: masterDataEmployeeAssignmentOptions,
                helpers: pageHelpers,
                importExecutions: masterDataImportExecutions,
                importReviewDrafts: masterDataImportReviewDrafts,
                inventoryRecords,
                maintenanceDrafts: masterDataMaintenanceDrafts,
                orderLines,
                selectedId: selectedMasterDataId,
                selectedTab: masterDataMaintenanceTab,
                statements,
              }}
              actions={{
                onBatchEnableEmployeeAccounts: enableMasterDataEmployeeAccounts,
                onOpenImportTemplate: openMasterDataTemplatePanel,
                onSaveDraft: saveMasterDataMaintenanceDraft,
                onSaveMachine: saveMasterDataMachine,
                onUpdateEmployeeAssignment: updateMasterDataEmployeeAssignment,
                onUpdateEmployeeProfile: updateMasterDataEmployeeProfile,
                setSelectedId: setSelectedMasterDataId,
                setSelectedTab: setMasterDataMaintenanceTab,
              }}
            /></Suspense>
          )}
          {renderedPage === "payroll" && (
            <Suspense fallback={<DataState title="工资核算工作台加载中" />}>
              <PayrollAttendancePage authState={authState} currentUser={currentUser} permissionContext={permissionContext} />
            </Suspense>
          )}
          {renderedPage === "v1Status" && (
            <Suspense fallback={<DataState title="上线状态加载中" />}>
              <V1StatusRoute
                actions={v1StatusActions.pageActions}
                state={v1StatusRouteState}
                onOpenEmployeeImport={isNavigationPageVisible("masterData", permissionContext) ? () => { setMasterDataMaintenanceTab("员工机台"); setActivePage("masterData"); openMasterDataTemplatePanel("员工机台"); } : undefined}
              />
            </Suspense>
          )}
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
