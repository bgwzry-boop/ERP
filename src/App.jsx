import { lazy, Suspense, useEffect, useState } from "react";
import { MenuFoldOutlined } from "@ant-design/icons";
import {
  EntryPage,
  FulfillmentPage,
  InventoryPage,
  MasterDataMaintenancePage,
  OrderPoolPage,
  ProductionPackingPage,
  RawMaterialInboundPage,
  StatementPage,
  TodoPage,
  DriverMobilePage,
  WorkshopMobilePage,
} from "./pages/office/index.jsx";
import {
  allNavigationItems,
  isNavigationPageVisible,
  primaryNavigationItems,
} from "./app/navigation.js";
import { AppNavigation } from "./app/AppNavigation.jsx";
import {
  ActionModal,
  AttachmentViewerModal,
  MasterDataImportTemplateModal,
  OrderLineActionModal,
  RuntimeLoginScreen,
  Topbar,
} from "./app/AppViews.jsx";
import { useOfficeInteractionController } from "./app/useOfficeInteractionController.js";
import { useOfficeWorkspace } from "./app/useOfficeWorkspace.js";
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
import { DataState, WorkspaceNotice, WorkspacePageHeader } from "./shared/ui/operational.jsx";
import {
  defaultSeedUserId,
  getUiActionState,
  seedUserOptions,
} from "./auth/seedPermissions.js";
import {
  createInitialAuthState,
  createLocalSeedAuthState,
  initializeSeedAuth,
  isOfficeApiServerRequired,
  loginRuntimeUser,
  loginSeedUser,
} from "./services/officeAuthService.js";
import { getOfficeOrderLineDetail } from "./services/officeOrderPoolApiClient.js";
import {
  buildPackingTaskId,
  buildProductionTaskId,
  findProductionInventoryItem,
} from "./services/officeProductionPackingApiClient.js";
import { loadOfficeWorkspace } from "./services/officeMockService.js";
import {
  MASTER_DATA_IMPORT_CONTENT_TYPE,
  buildMasterDataImportTemplateMetadata,
  buildMasterDataImportTemplateWorkbook,
} from "./domain/masterDataImportTemplate.js";
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

const V1StatusPage = lazy(() =>
  import("./features/v1-status/V1StatusPage.jsx").then((module) => ({ default: module.V1StatusPage })),
);

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
function readFileAsDataUrl(file) {
  if (!file || typeof FileReader === "undefined") return Promise.resolve("");
  if (typeof file.contentDataUrl === "string") return Promise.resolve(file.contentDataUrl);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

async function copyTextToClipboard(text) {
  const value = String(text ?? "");
  if (!value) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the textarea-based local fallback.
  }
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  let copied;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(textarea);
  }
  return copied;
}

function mergeAttachmentSummaries(existing = [], next = []) {
  const merged = [...(Array.isArray(existing) ? existing : [])];
  next.filter(Boolean).forEach((attachment) => {
    const index = merged.findIndex((item) => item.attachmentId && item.attachmentId === attachment.attachmentId);
    if (index >= 0) {
      merged[index] = { ...merged[index], ...attachment };
    } else {
      merged.push(attachment);
    }
  });
  return merged;
}

function readBlobAsDataUrl(blob) {
  if (!blob || typeof FileReader === "undefined") return Promise.resolve("");
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });
}

function sanitizeDownloadFileName(fileName, fallback = "attachment") {
  const safeName = String(fileName || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ");
  return safeName || fallback;
}

function downloadStatementExcelWorkbook(workbookContent, statement, customer, options = {}) {
  if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") return false;
  const blob = new Blob([workbookContent], {
    type: options.contentType ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeCustomerName = String(customer?.name ?? "customer").replace(/[\\/:*?"<>|\s]+/g, "-");
  link.href = url;
  link.download = sanitizeDownloadFileName(options.fileName, `statement-${statement?.id ?? "preview"}-${safeCustomerName}.xlsx`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

function downloadMasterDataImportTemplateWorkbook(templateKey, operatorName = "ERP") {
  if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") return null;
  const generatedAt = new Date().toISOString();
  const metadata = buildMasterDataImportTemplateMetadata({
    templateKey,
    generatedAt,
    generatedBy: operatorName,
  });
  const workbook = buildMasterDataImportTemplateWorkbook({
    templateKey,
    generatedAt,
    generatedBy: operatorName,
  });
  const blob = new Blob([workbook], { type: MASTER_DATA_IMPORT_CONTENT_TYPE });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = sanitizeDownloadFileName(metadata.fileName, "erp-master-data-import-template.xlsx");
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return metadata;
}

function downloadTextFile(content, options = {}) {
  if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") return false;
  const blob = new Blob([String(content ?? "")], { type: options.contentType ?? "text/plain; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = sanitizeDownloadFileName(options.fileName, "download.txt");
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

export function App() {
  const runtimeServerRequired = isOfficeApiServerRequired();
  const [activePage, setActivePage] = useState("todos");
  const [authState, setAuthState] = useState(() => createInitialAuthState());
  const [runtimeLoginForm, setRuntimeLoginForm] = useState({ loginName: "", password: "" });
  const [runtimeLoginLoading, setRuntimeLoginLoading] = useState(false);
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
    completeFulfillmentAction, markFulfillmentPrepared, reviewFulfillmentDeliveryEvidence,
    saveFulfillmentDispatch, submitFulfillmentException,
    executeProductionPackingAction,
    refreshMasterDataEmployeeAccountReviews, refreshMasterDataImportReviewDrafts,
    refreshStatementDetail, refreshStatements, refreshV1GoLiveStatus,
    executeOrderEntryAction, executeOrderLineAction, openQueuedOrderDraft,
    recognizeOrderDraft, recognizeOrderDraftQueue, refreshOrderDraftQueue,
    runOrderDraftCommand, updateOrderDraftField, prepareOrderDraftFromTemporaryHold, linkCrossDraftShortageCancellation, restoreShortageCancelledLine,
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
    printFulfillmentDocument,
    readFileAsDataUrl,
    saveFulfillmentDispatch,
    setFulfillments,
    setStatements,
    statements,
    submitFulfillmentException,
    todos,
    voidFulfillmentPrintRecord,
  });

  const activeMeta = allNavigationItems.find((item) => item.key === activePage) ?? primaryNavigationItems[0];
  const authSourceLabel = authState.authenticated ? "后端认证" : runtimeServerRequired ? "等待登录" : "本地权限";
  const unhandledTodos = todos.filter((item) => !item.handled).length;

  useEffect(() => {
    if (!isNavigationPageVisible(activePage, permissionContext)) {
      setActivePage(primaryNavigationItems[0].key);
    }
  }, [activePage, permissionContext]);

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
    createMasterDataFailedRowsCorrectionDraft,
    createMasterDataImportConfirmationPlanFromDraft,
    createMasterDataImportExecutionFromPlan,
    createMasterDataImportReviewDraftFromPrecheck,
    downloadMasterDataImportFailedRows,
    downloadMasterDataTemplate,
    enableMasterDataEmployeeAccount,
    issueMasterDataEmployeeAccountPassword,
    openMasterDataTemplatePanel,
    precheckMasterDataTemplate,
    revokeMasterDataEmployeeAccountPassword,
    updateMasterDataEmployeeAssignment,
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

  useEffect(() => {
    let cancelled = false;
    initializeSeedAuth({ serverRequired: runtimeServerRequired }).then((nextAuthState) => {
      if (cancelled) return;
      setAuthState(nextAuthState);
      if (nextAuthState.authenticated) {
        setToast(`已恢复后端登录会话：${nextAuthState.permissions.user.displayName}。`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [runtimeServerRequired]);

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
    if (activePage !== "rawMaterials") return undefined;
    let cancelled = false;
    Promise.all([
      refreshRawMaterialInbounds({ showToast: false }),
      refreshRawMaterialSupplierStatementReviews({ showToast: false }),
      refreshProductionPackingTaskLists({ showToast: false }),
    ]).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshProductionPackingTaskLists, refreshRawMaterialInbounds, refreshRawMaterialSupplierStatementReviews]);

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
    if (activePage !== "packing" && activePage !== "workshopMobile") return undefined;
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

  useEffect(() => {
    if (activePage !== "statements" || !selectedStatementId) return undefined;
    let cancelled = false;
    void syncStatementPaymentAttachmentsFromSource(selectedStatementId, {
      isCancelled: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, authState, currentUserId, selectedStatementId]);

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

  async function switchSeedUser(userId) {
    if (runtimeServerRequired) return;
    const localState = createLocalSeedAuthState(userId, "optimistic_switch");
    setAuthState(localState);
    setToast(`正在切换当前账号：${localState.permissions.user.displayName}。`);

    const nextAuthState = await loginSeedUser(userId);
    setAuthState(nextAuthState);
    const displayName = nextAuthState.permissions.user.displayName;
    if (nextAuthState.source === "api_seed") {
      setToast(`已通过后端 seed 登录切换为：${displayName}。按钮权限按后端返回结果刷新。`);
      return;
    }
    setToast(`已切换当前账号：${displayName}。后端 API 未连接时使用本地 seed 权限降级。`);
  }

  async function submitRuntimeLogin(event) {
    event.preventDefault();
    if (runtimeLoginLoading) return;
    setRuntimeLoginLoading(true);
    const nextAuthState = await loginRuntimeUser(runtimeLoginForm, { serverRequired: true });
    setAuthState(nextAuthState);
    setRuntimeLoginLoading(false);
    if (nextAuthState.authenticated) {
      setRuntimeLoginForm((current) => ({ ...current, password: "" }));
      setToast(`已登录：${nextAuthState.permissions.user.displayName}。权限由后端正式账号返回。`);
    }
  }

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
    handleDraftCommand, linkCancellationIntentToSelectedLine, openOrderLineAction, openQueueDraft, recognize, recognizeQueue, refreshDraftQueue, restoreCancelledDraftLine, updateDraftField,
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
    refreshTodos,
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
    selectedStatementId,
    setStatements,
    setToast,
    statements,
  });
  if (runtimeServerRequired && !authState.authenticated) {
    return (
      <RuntimeLoginScreen
        error={authState.error?.message ?? ""}
        form={runtimeLoginForm}
        loading={runtimeLoginLoading}
        onChange={(field, value) => setRuntimeLoginForm((current) => ({ ...current, [field]: value }))}
        onSubmit={submitRuntimeLogin}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">ERP</div>
          <div>
            <strong>设计中心小工厂</strong>
            <span>P0 办公室端</span>
          </div>
        </div>
        <AppNavigation
          activePage={activePage}
          permissionContext={permissionContext}
          todoCount={unhandledTodos}
          onNavigate={setActivePage}
          onOpenLater={openMasterDataTemplatePanel}
        />
        <button className="collapse-menu">
          <MenuFoldOutlined />
          收起菜单
        </button>
      </aside>

      <div className="workspace">
        <Topbar
          authSourceLabel={authSourceLabel}
          currentUserId={currentUserId}
          currentUser={currentUser}
          onCreateOrder={createOrderFromTopbar}
          onUserChange={switchSeedUser}
          todoCount={unhandledTodos}
          userOptions={runtimeServerRequired ? [currentUser] : seedUserOptions}
          getUiActionState={(surface, action) => getUiActionState(permissionContext, surface, action)}
        />
        <main className="content">
          {toast ? <WorkspaceNotice>{toast}</WorkspaceNotice> : null}
          <WorkspacePageHeader
            title={activeMeta.label}
            description={activePage === "entry" ? "" : activeMeta.description}
            contextLabel={activePage === "entry" ? "" : authSourceLabel}
            onRefresh={activePage === "entry" ? undefined : refreshActivePage}
          />
          {activePage === "todos" && <TodoPage todos={todos} todoMeta={todoMeta} printBatchRecords={printBatchRecords} selectedTodoId={selectedTodoId} onSelect={setSelectedTodoId} view={todoView} setView={setTodoView} onAction={handleTodo} onRepairReference={repairTodoReference} helpers={pageHelpers} />}
          {activePage === "entry" && (
            <EntryPage
              entryText={entryText}
              setEntryText={setEntryText}
              draftRows={draftRows}
              draftStatus={draftStatus}
              selectedDraftId={selectedDraftId}
              setSelectedDraftId={setSelectedDraftId}
              onRecognize={recognize}
              onQueueRecognize={recognizeQueue} onQueueRefresh={refreshDraftQueue} onQueueOpen={openQueueDraft} onQueueCancellationLink={linkCancellationIntentToSelectedLine}
              onDraftFieldChange={updateDraftField}
              onDraftCommand={handleDraftCommand} onRestoreCancelledLine={restoreCancelledDraftLine}
              onAction={entryAction}
              helpers={pageHelpers}
            />
          )}
          {activePage === "orders" && (
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
          {activePage === "inventory" && (
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
          {activePage === "fulfillment" && (
            <FulfillmentPage
              tab={fulfillmentTab}
              setTab={setFulfillmentTab}
              fulfillments={fulfillments}
              orderLines={orderLines}
              selectedId={selectedFulfillmentId}
              setSelectedId={setSelectedFulfillmentId}
              onAction={updateFulfillment}
              helpers={pageHelpers}
            />
          )}
          {activePage === "packing" && (
            <ProductionPackingPage
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
          {activePage === "workshopMobile" && (
            <WorkshopMobilePage
              orderLines={orderLines}
              inventoryRecords={inventoryRecords}
              productionPacking={productionPacking}
              onAction={handleProductionPackingAction}
              helpers={pageHelpers}
            />
          )}
          {activePage === "driverMobile" && (
            <DriverMobilePage
              tasks={driverDeliveryTasks}
              selectedTaskId={selectedDriverTaskId}
              setSelectedTaskId={setSelectedDriverTaskId}
              meta={driverDeliveryMeta}
              onAction={handleDriverDeliveryAction}
              helpers={pageHelpers}
            />
          )}
          {activePage === "statements" && (
            <StatementPage
              statements={statements}
              readMeta={statementReadMeta}
              orderLines={orderLines}
              selectedId={selectedStatementId}
              setSelectedId={setSelectedStatementId}
              onAction={statementAction}
              helpers={pageHelpers}
            />
          )}
          {activePage === "rawMaterials" && (
            <RawMaterialInboundPage
              inbounds={rawMaterialInbounds}
              meta={rawMaterialInboundMeta}
              productionTasks={productionPacking.productionTasks}
              statementReviews={rawMaterialSupplierStatementReviews}
              statementReviewMeta={rawMaterialSupplierStatementReviewMeta}
              selectedId={selectedRawMaterialInboundId}
              setSelectedId={setSelectedRawMaterialInboundId}
              onAction={updateRawMaterialInbound}
              onStatementReviewDraftCreate={saveRawMaterialSupplierStatementReviewDraft}
              onStatementReviewConfirm={confirmRawMaterialSupplierStatementReviewDraft}
              onStatementConfirm={confirmRawMaterialSupplierStatement}
              onPayableDraftGenerate={generateRawMaterialSupplierPayableDraft}
              onPaymentConfirm={confirmRawMaterialSupplierPayment}
              helpers={pageHelpers}
            />
          )}
          {activePage === "masterData" && (
            <MasterDataMaintenancePage
              customers={customers}
              orderLines={orderLines}
              inventoryRecords={inventoryRecords}
              statements={statements}
              employeeAccountReviews={masterDataEmployeeAccountReviews} employeeAccountReadiness={masterDataEmployeeAccountReadiness} employeeAssignmentOptions={masterDataEmployeeAssignmentOptions}
              importReviewDrafts={masterDataImportReviewDrafts}
              importExecutions={masterDataImportExecutions}
              maintenanceDrafts={masterDataMaintenanceDrafts}
              selectedTab={masterDataMaintenanceTab}
              setSelectedTab={setMasterDataMaintenanceTab}
              selectedId={selectedMasterDataId}
              setSelectedId={setSelectedMasterDataId}
              onSaveDraft={saveMasterDataMaintenanceDraft} onUpdateEmployeeAssignment={updateMasterDataEmployeeAssignment}
              onOpenImportTemplate={openMasterDataTemplatePanel}
              helpers={pageHelpers}
            />
          )}
          {activePage === "v1Status" && (
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

      {modal && (
        <ActionModal
          modal={modal}
          fulfillments={fulfillments}
          statements={statements}
          orderLines={orderLines}
          findCustomer={findCustomer}
          getStatementBlockingAmount={getStatementBlockingAmount}
          onClose={closeModal}
          onConfirm={confirmModal}
        />
      )}
      {orderActionModal && <OrderLineActionModal modal={orderActionModal} onClose={closeOrderActionModal} onConfirm={confirmOrderLineAction} />}
      {attachmentViewer && <AttachmentViewerModal attachment={attachmentViewer} onClose={closeAttachmentViewer} onDownload={downloadViewedAttachment} />}
      {masterDataTemplatePanel && (
        <MasterDataImportTemplateModal
          panel={masterDataTemplatePanel}
          onClose={closeMasterDataTemplatePanel}
          onDownload={downloadMasterDataTemplate}
          onPrecheck={precheckMasterDataTemplate}
          precheckState={masterDataPrecheckState}
          reviewDrafts={masterDataImportReviewDrafts}
          onCreateReviewDraft={createMasterDataImportReviewDraftFromPrecheck}
          confirmationPlans={masterDataImportConfirmationPlans}
          onCreateConfirmationPlan={createMasterDataImportConfirmationPlanFromDraft}
          importExecutions={masterDataImportExecutions}
          employeeAccountReviews={masterDataEmployeeAccountReviews}
          lastIssuedEmployeeCredential={lastIssuedEmployeeCredential}
          getUiActionState={(surface, action) => getUiActionState(permissionContext, surface, action)}
          onCreateImportExecution={createMasterDataImportExecutionFromPlan}
          onCommitImportExecution={commitMasterDataImportExecutionFromPlan}
          onDownloadFailedRows={downloadMasterDataImportFailedRows}
          onCreateFailedRowsCorrectionDraft={createMasterDataFailedRowsCorrectionDraft}
          onRefreshEmployeeAccountReviews={(options) => refreshMasterDataEmployeeAccountReviews(options).then((result) => {
            if (result?.feedback) setToast(result.feedback);
            return result;
          })}
          onEnableEmployeeAccount={enableMasterDataEmployeeAccount}
          onIssueEmployeePassword={issueMasterDataEmployeeAccountPassword}
          onRevokeEmployeePassword={revokeMasterDataEmployeeAccountPassword}
        />
      )}
    </div>
  );
}
