import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { MenuFoldOutlined } from "@ant-design/icons";
import bagwinSidebarLogoUrl from "./assets/brand/BAGWIN_ERP_sidebar_horizontal_color.svg";
import bagwinSymbolUrl from "./assets/brand/BAGWIN_symbol_color.svg";
import {
  EntryPage,
  FulfillmentPage,
  InventoryPage,
  OrderPoolPage,
  ProductionPackingPage,
  RawMaterialInboundPage,
  RawMaterialScannerPage,
  StatementPage,
  TodoPage,
  DriverMobilePage,
  WarehouseMobilePage,
  WorkshopMobilePage,
} from "./pages/office/index.jsx";
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
import { WorkspaceOverlays } from "./app/WorkspaceOverlays.jsx";
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
  customers, defaultSelections, findCustomer, getOrderFinanceState,
  getStatementBlockingAmount, getStatementBucket, getStatementDisplayDebt, getStatementFinancialSummary,
  initialFulfillments, initialInventories, initialOrderLines, initialRawMaterialInbounds,
  initialStatements, initialTodos, orderMatchesFilters, sampleText, statementMatchesFilters,
} from "./app/officeScenarioContext.js";
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
import { getOfficeOrderLineDetail } from "./services/officeOrderPoolApiClient.js";
import {
  buildPackingTaskId,
  buildProductionTaskId,
  findProductionInventoryItem,
} from "./services/officeProductionPackingApiClient.js";
import {
  availableQty,
  defaultOrderFilters,
  defaultStatementFilters,
  editableColors,
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
  getOrderLineShortNo,
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
  resolveLineFromRef,
  sortTodos,
  statementFilterOptions,
  statusTone,
  uniqueStockOptions,
} from "./domain/officeRules.js";

const V1StatusPage = lazy(() => import("./features/v1-status/V1StatusPage.jsx").then((module) => ({ default: module.V1StatusPage })));
const OfficeMobilePage = lazy(() => import("./features/office-mobile/OfficeMobilePage.jsx").then((module) => ({ default: module.OfficeMobilePage })));
const DecisionMobilePage = lazy(() => import("./features/decisions/DecisionMobilePage.jsx").then((module) => ({ default: module.DecisionMobilePage })));
const MaintenanceMobilePage = lazy(() => import("./features/maintenance/MaintenanceMobilePage.jsx").then((module) => ({ default: module.MaintenanceMobilePage })));
const DesktopRequiredMobilePage = lazy(() => import("./features/mobile/DesktopRequiredMobilePage.jsx").then((module) => ({ default: module.DesktopRequiredMobilePage })));
const MasterDataMaintenancePage = lazy(() => import("./features/master-data/MasterDataMaintenancePage.jsx").then((module) => ({ default: module.MasterDataMaintenancePage })));
const PayrollAttendancePage = lazy(() => import("./features/payroll/PayrollAttendancePage.jsx").then((module) => ({ default: module.PayrollAttendancePage })));
const EmployeeAttendanceMobilePage = lazy(() => import("./features/payroll/EmployeeAttendanceMobilePage.jsx").then((module) => ({ default: module.EmployeeAttendanceMobilePage })));

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
    v1GoLiveStatusState,
    v1FieldEvidenceDraftAction, setV1FieldEvidenceDraftAction,
    v1FieldEvidenceValidationAction, setV1FieldEvidenceValidationAction,
    v1FieldEvidenceStageRowAction, setV1FieldEvidenceStageRowAction,
    v1FieldEvidenceAttachmentAction, setV1FieldEvidenceAttachmentAction,
    v1FieldEvidenceAttachmentListAction, setV1FieldEvidenceAttachmentListAction,
    v1SignoffBoundaryAttachmentAction, setV1SignoffBoundaryAttachmentAction,
    v1SignoffBoundaryAttachmentListAction, setV1SignoffBoundaryAttachmentListAction,
    v1ProductionEnvPrecheckAction, setV1ProductionEnvPrecheckAction,
    v1ProductionEnvSetupAction, setV1ProductionEnvSetupAction,
    v1ProductionEnvIntakePrecheckAction, setV1ProductionEnvIntakePrecheckAction,
    v1ProductionEnvFileAuditPrecheckAction, setV1ProductionEnvFileAuditPrecheckAction,
    v1ProductionEnvFilePreviewPrecheckAction, setV1ProductionEnvFilePreviewPrecheckAction,
    v1ProductionGoLivePrecheckAction, setV1ProductionGoLivePrecheckAction,
    v1ProductionPersistenceEvidenceAction, setV1ProductionPersistenceEvidenceAction,
    v1ProductionFirstStageExecutionAction, setV1ProductionFirstStageExecutionAction,
    v1ProductionFirstStageValuesDryRunAction, setV1ProductionFirstStageValuesDryRunAction,
    v1ProductionFirstStageValuesApplyAction, setV1ProductionFirstStageValuesApplyAction,
    v1PersistencePrecheckAction, setV1PersistencePrecheckAction,
    v1AttachmentRetentionPrecheckAction, setV1AttachmentRetentionPrecheckAction,
    v1PrintSpoolPrecheckAction, setV1PrintSpoolPrecheckAction,
    v1PrintCupsPrecheckAction, setV1PrintCupsPrecheckAction,
    v1PrintReadinessPrecheckAction, setV1PrintReadinessPrecheckAction,
    v1DriverReadinessPrecheckAction, setV1DriverReadinessPrecheckAction,
    v1RuntimeReadinessPrecheckAction, setV1RuntimeReadinessPrecheckAction,
    v1V2BoundaryPrecheckAction, setV1V2BoundaryPrecheckAction,
    v1V2ScopeBriefRefreshAction, setV1V2ScopeBriefRefreshAction,
    v1ReleaseCandidateRefreshPrecheckAction, setV1ReleaseCandidateRefreshPrecheckAction,
    v1ReleaseCandidateRefreshAction, setV1ReleaseCandidateRefreshAction,
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
  const signedPreviewMobilePage = mobileViewport
    && signedPreviewAuthOptions
    && isNavigationPageVisible("rawMaterials", permissionContext)
      ? "rawMaterials"
      : "";
  const requestedPage = mobileViewport
    ? signedPreviewMobilePage || getMobileViewportPage(activePage, permissionContext)
    : activePage;
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

  const {
    applyV1ProductionFirstStageValues,
    generateV1FieldEvidenceDraftManifest,
    listV1FieldEvidenceAttachments,
    listV1SignoffBoundaryAttachments,
    precheckV1AttachmentRetention,
    precheckV1DriverReadiness,
    precheckV1Persistence,
    precheckV1PrintCups,
    precheckV1PrintReadiness,
    precheckV1PrintSpool,
    precheckV1ProductionEnv,
    precheckV1ProductionEnvFileAudit,
    precheckV1ProductionEnvFilePreview,
    precheckV1ProductionEnvIntake,
    precheckV1ProductionFirstStageValuesDryRun,
    precheckV1ProductionGoLive,
    precheckV1ReleaseCandidateRefresh,
    precheckV1RuntimeReadiness,
    precheckV1V2Boundary,
    refreshV1ReleaseCandidate,
    refreshV1V2ScopeBrief,
    runV1ProductionEnvSetup,
    runV1ProductionFirstStageExecution,
    runV1ProductionPersistenceEvidence,
    stageV1FieldEvidenceIntakeRow,
    uploadV1FieldEvidenceAttachment,
    uploadV1SignoffBoundaryAttachment,
    validateV1FieldEvidenceDraftManifest,
  } = createOfficeV1StatusActions({
    actionSetters: {
      attachmentRetentionPrecheck: setV1AttachmentRetentionPrecheckAction,
      driverReadinessPrecheck: setV1DriverReadinessPrecheckAction,
      fieldEvidenceAttachment: setV1FieldEvidenceAttachmentAction,
      fieldEvidenceAttachmentList: setV1FieldEvidenceAttachmentListAction,
      fieldEvidenceDraft: setV1FieldEvidenceDraftAction,
      fieldEvidenceStageRow: setV1FieldEvidenceStageRowAction,
      fieldEvidenceValidation: setV1FieldEvidenceValidationAction,
      persistencePrecheck: setV1PersistencePrecheckAction,
      printCupsPrecheck: setV1PrintCupsPrecheckAction,
      printReadinessPrecheck: setV1PrintReadinessPrecheckAction,
      printSpoolPrecheck: setV1PrintSpoolPrecheckAction,
      productionEnvFileAuditPrecheck: setV1ProductionEnvFileAuditPrecheckAction,
      productionEnvFilePreviewPrecheck: setV1ProductionEnvFilePreviewPrecheckAction,
      productionEnvIntakePrecheck: setV1ProductionEnvIntakePrecheckAction,
      productionEnvPrecheck: setV1ProductionEnvPrecheckAction,
      productionEnvSetup: setV1ProductionEnvSetupAction,
      productionFirstStageExecution: setV1ProductionFirstStageExecutionAction,
      productionFirstStageValuesApply: setV1ProductionFirstStageValuesApplyAction,
      productionFirstStageValuesDryRun: setV1ProductionFirstStageValuesDryRunAction,
      productionGoLivePrecheck: setV1ProductionGoLivePrecheckAction,
      productionPersistenceEvidence: setV1ProductionPersistenceEvidenceAction,
      releaseCandidateRefresh: setV1ReleaseCandidateRefreshAction,
      releaseCandidateRefreshPrecheck: setV1ReleaseCandidateRefreshPrecheckAction,
      runtimeReadinessPrecheck: setV1RuntimeReadinessPrecheckAction,
      signoffBoundaryAttachment: setV1SignoffBoundaryAttachmentAction,
      signoffBoundaryAttachmentList: setV1SignoffBoundaryAttachmentListAction,
      v1V2BoundaryPrecheck: setV1V2BoundaryPrecheckAction,
      v1V2ScopeBriefRefresh: setV1V2ScopeBriefRefreshAction,
    },
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
            demoMode={!formalLoginRequired && !signedPreviewAuthOptions}
            fixedPreviewMode={Boolean(signedPreviewAuthOptions)}
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
          {renderedPage === "todos" && <TodoPage todos={todos} todoMeta={todoMeta} printBatchRecords={printBatchRecords} selectedTodoId={selectedTodoId} onSelect={setSelectedTodoId} view={todoView} setView={setTodoView} onAction={handleTodo} onRepairReference={repairTodoReference} helpers={pageHelpers} />}
          {renderedPage === "entry" && (
            <EntryPage
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
            <OrderPoolPage
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
            <InventoryPage
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
            <FulfillmentPage
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
            <ProductionPackingPage
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
            <WorkshopMobilePage
              orderLines={orderLines}
              inventoryRecords={inventoryRecords}
              productionPacking={productionPacking}
              onAction={handleProductionPackingAction}
              onNavigate={setActivePage}
              helpers={pageHelpers}
            />
          )}
          {renderedPage === "driverMobile" && (
            <DriverMobilePage
              tasks={driverDeliveryTasks}
              selectedTaskId={selectedDriverTaskId}
              setSelectedTaskId={setSelectedDriverTaskId}
              meta={driverDeliveryMeta}
              onAction={handleDriverDeliveryAction}
              helpers={pageHelpers}
            />
          )}
          {renderedPage === "warehouseMobile" && (
            <WarehouseMobilePage
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
            <StatementPage
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
            <RawMaterialInboundPage
              authState={authState}
              currentUser={currentUser}
              inbounds={rawMaterialInbounds}
              meta={rawMaterialInboundMeta}
              productionTasks={productionPacking.productionTasks}
              statementReviews={rawMaterialSupplierStatementReviews}
              statementReviewMeta={rawMaterialSupplierStatementReviewMeta}
              selectedId={selectedRawMaterialInboundId}
              setSelectedId={setSelectedRawMaterialInboundId}
              onAction={updateRawMaterialInbound}
              onDeliveryNoteRecognize={recognizeRawMaterialDeliveryNote}
              onStatementReviewDraftCreate={saveRawMaterialSupplierStatementReviewDraft}
              onStatementReviewConfirm={confirmRawMaterialSupplierStatementReviewDraft}
              onStatementConfirm={confirmRawMaterialSupplierStatement}
              onPayableDraftGenerate={generateRawMaterialSupplierPayableDraft}
              onPaymentConfirm={confirmRawMaterialSupplierPayment}
              printerDeviceQa={printerDeviceQa}
              helpers={pageHelpers}
              firstReleaseMode={RAW_MATERIAL_FIRST_RELEASE_ENABLED}
            />
          )}
          {renderedPage === "rawMaterialScanner" && (
            <RawMaterialScannerPage
              inbounds={rawMaterialInbounds}
              productionState={productionPacking}
              onAction={updateRawMaterialInbound}
              helpers={pageHelpers}
            />
          )}
          {renderedPage === "masterData" && (
            <Suspense fallback={<DataState title="基础资料工作台加载中" />}><MasterDataMaintenancePage
              authState={authState}
              currentUser={currentUser}
              customers={customers}
              orderLines={orderLines}
              inventoryRecords={inventoryRecords}
              statements={statements}
              employeeAccountReviews={masterDataEmployeeAccountReviews} employeeAccountReadiness={masterDataEmployeeAccountReadiness} employeeAssignmentOptions={masterDataEmployeeAssignmentOptions}
              importReviewDrafts={masterDataImportReviewDrafts}
              importExecutions={masterDataImportExecutions}
              maintenanceDrafts={masterDataMaintenanceDrafts}
              selectedTab={masterDataMaintenanceTab} setSelectedTab={setMasterDataMaintenanceTab}
              selectedId={selectedMasterDataId} setSelectedId={setSelectedMasterDataId}
              onSaveDraft={saveMasterDataMaintenanceDraft} onUpdateEmployeeAssignment={updateMasterDataEmployeeAssignment} onUpdateEmployeeProfile={updateMasterDataEmployeeProfile} onSaveMachine={saveMasterDataMachine}
              onBatchEnableEmployeeAccounts={enableMasterDataEmployeeAccounts} onOpenImportTemplate={openMasterDataTemplatePanel}
              helpers={pageHelpers}
            /></Suspense>
          )}
          {renderedPage === "payroll" && (
            <Suspense fallback={<DataState title="工资核算工作台加载中" />}>
              <PayrollAttendancePage authState={authState} currentUser={currentUser} permissionContext={permissionContext} />
            </Suspense>
          )}
          {renderedPage === "v1Status" && (
            <Suspense fallback={<DataState title="上线状态加载中" />}>
              <V1StatusPage
                fieldEvidenceDraftAction={v1FieldEvidenceDraftAction}
                fieldEvidenceValidationAction={v1FieldEvidenceValidationAction}
                fieldEvidenceStageRowAction={v1FieldEvidenceStageRowAction}
                fieldEvidenceAttachmentAction={v1FieldEvidenceAttachmentAction}
                fieldEvidenceAttachmentListAction={v1FieldEvidenceAttachmentListAction}
                signoffBoundaryAttachmentAction={v1SignoffBoundaryAttachmentAction}
                signoffBoundaryAttachmentListAction={v1SignoffBoundaryAttachmentListAction}
                productionEnvPrecheckAction={v1ProductionEnvPrecheckAction}
                productionEnvSetupAction={v1ProductionEnvSetupAction}
                productionEnvIntakePrecheckAction={v1ProductionEnvIntakePrecheckAction}
                productionEnvFileAuditPrecheckAction={v1ProductionEnvFileAuditPrecheckAction}
                productionEnvFilePreviewPrecheckAction={v1ProductionEnvFilePreviewPrecheckAction}
                productionGoLivePrecheckAction={v1ProductionGoLivePrecheckAction}
                productionPersistenceEvidenceAction={v1ProductionPersistenceEvidenceAction}
                productionFirstStageExecutionAction={v1ProductionFirstStageExecutionAction}
                productionFirstStageValuesDryRunAction={v1ProductionFirstStageValuesDryRunAction}
                productionFirstStageValuesApplyAction={v1ProductionFirstStageValuesApplyAction}
                persistencePrecheckAction={v1PersistencePrecheckAction}
                attachmentRetentionPrecheckAction={v1AttachmentRetentionPrecheckAction}
                printSpoolPrecheckAction={v1PrintSpoolPrecheckAction}
                printCupsPrecheckAction={v1PrintCupsPrecheckAction}
                printReadinessPrecheckAction={v1PrintReadinessPrecheckAction}
                driverReadinessPrecheckAction={v1DriverReadinessPrecheckAction}
                runtimeReadinessPrecheckAction={v1RuntimeReadinessPrecheckAction}
                v1V2BoundaryPrecheckAction={v1V2BoundaryPrecheckAction}
                v1V2ScopeBriefRefreshAction={v1V2ScopeBriefRefreshAction}
                releaseCandidateRefreshPrecheckAction={v1ReleaseCandidateRefreshPrecheckAction}
                releaseCandidateRefreshAction={v1ReleaseCandidateRefreshAction}
                goLiveMeta={v1GoLiveStatusState}
                goLiveStatus={v1GoLiveStatusState.statusData}
                onGenerateFieldEvidenceDraft={generateV1FieldEvidenceDraftManifest}
                onStageFieldEvidenceRow={stageV1FieldEvidenceIntakeRow}
                onUploadFieldEvidenceAttachment={uploadV1FieldEvidenceAttachment}
                onListFieldEvidenceAttachments={listV1FieldEvidenceAttachments}
                onUploadSignoffBoundaryAttachment={uploadV1SignoffBoundaryAttachment}
                onListSignoffBoundaryAttachments={listV1SignoffBoundaryAttachments}
                onPrecheckProductionEnv={precheckV1ProductionEnv}
                onRunProductionEnvSetup={runV1ProductionEnvSetup}
                onPrecheckProductionEnvIntake={precheckV1ProductionEnvIntake}
                onPrecheckProductionEnvFileAudit={precheckV1ProductionEnvFileAudit}
                onPrecheckProductionEnvFilePreview={precheckV1ProductionEnvFilePreview}
                onPrecheckProductionGoLive={precheckV1ProductionGoLive}
                onRunProductionPersistenceEvidence={runV1ProductionPersistenceEvidence}
                onRunProductionFirstStageExecution={runV1ProductionFirstStageExecution}
                onPrecheckProductionFirstStageValuesDryRun={precheckV1ProductionFirstStageValuesDryRun}
                onApplyProductionFirstStageValues={applyV1ProductionFirstStageValues}
                onPrecheckV1Persistence={precheckV1Persistence}
                onPrecheckV1AttachmentRetention={precheckV1AttachmentRetention}
                onPrecheckV1PrintSpool={precheckV1PrintSpool}
                onPrecheckV1PrintCups={precheckV1PrintCups}
                onPrecheckV1PrintReadiness={precheckV1PrintReadiness}
                onPrecheckV1DriverReadiness={precheckV1DriverReadiness}
                onPrecheckRuntimeReadiness={precheckV1RuntimeReadiness}
                onPrecheckV1V2Boundary={precheckV1V2Boundary}
                onRefreshV1V2ScopeBrief={refreshV1V2ScopeBrief}
                onPrecheckReleaseCandidateRefresh={precheckV1ReleaseCandidateRefresh}
                onRefreshReleaseCandidate={refreshV1ReleaseCandidate}
                onValidateFieldEvidenceDraft={validateV1FieldEvidenceDraftManifest}
                onOpenEmployeeImport={isNavigationPageVisible("masterData", permissionContext) ? () => { setMasterDataMaintenanceTab("员工机台"); setActivePage("masterData"); openMasterDataTemplatePanel("员工机台"); } : undefined}
              />
            </Suspense>
          )}
        </main>
      </div>

      <WorkspaceOverlays
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
