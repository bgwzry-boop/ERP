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
import { createOfficeDriverDeliveryActions } from "./app/createOfficeDriverDeliveryActions.js";
import { createOfficeRawMaterialActions } from "./app/createOfficeRawMaterialActions.js";
import { createOfficeV1StatusActions } from "./app/createOfficeV1StatusActions.js";
import { isInlineImageAttachment } from "./app/attachmentViewUtils.js";
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
import {
  downloadOfficeAttachmentContent,
  listOfficeAttachmentAccessLogs,
  listOfficeAttachments,
} from "./services/officeAttachmentApiClient.js";
import { getOfficeOrderLineDetail } from "./services/officeOrderPoolApiClient.js";
import { handleOfficeTodoAction } from "./services/officeTodoApiClient.js";
import {
  buildPackingTaskId,
  buildProductionTaskId,
  findProductionInventoryItem,
  getOfficePackingTaskDetail,
  getOfficeProductionTaskDetail,
} from "./services/officeProductionPackingApiClient.js";
import {
  createPrinterDeviceFieldTestChecks,
  createPrinterDeviceFieldTestEvidence,
  normalizePrinterDeviceFieldTestEvidence,
  normalizePrinterDeviceFieldTestChecks,
} from "./services/printerDeviceFieldTestClient.js";
import {
  buildStatementExcelWorkbook,
  downloadOfficeStatementExport,
  listOfficeStatementExports,
  markOfficeStatementSentViaApi,
  previewOfficeStatement,
  recordOfficeStatementSendReceipt,
  writeOffOfficeStatement,
} from "./services/officeStatementApiClient.js";
import {
  confirmOfficeStatementWriteOff,
  createOfficeTodo,
  loadOfficeWorkspace,
  markOfficeStatementSent,
} from "./services/officeMockService.js";
import {
  upsertMasterDataEmployeeAccountReview,
  upsertMasterDataImportExecution,
  upsertMasterDataImportReviewDraft,
} from "./state/officeMasterDataState.js";
import {
  getPrinterDeviceDriverMode,
  getPrinterDeviceQaDriverLabel,
  getPrinterDeviceQaPaperLabel,
} from "./state/officePrintState.js";
import {
  getStatementWriteOffBlocker,
  recordStatementSendReceipt,
  recordStatementExport,
  syncStatementCustomerConfirmationAttachments,
  syncStatementPaymentAttachments,
  syncStatementExportRecords,
  updateStatementCustomerConfirmationAttachmentPreview,
  updateStatementPaymentAttachmentPreview,
} from "./state/officeStatementActions.js";
import { getProductionPackingFocusFromLedgerEntry } from "./domain/productionPackingSourceFocus.js";
import {
  MASTER_DATA_IMPORT_CONTENT_TYPE,
  buildMasterDataImportTemplateMetadata,
  buildMasterDataImportTemplateWorkbook,
} from "./domain/masterDataImportTemplate.js";
import { precheckMasterDataImportWorkbook } from "./domain/masterDataImportPrecheck.js";
import {
  canCreateMasterDataImportReviewDraft,
  createMasterDataImportReviewDraft,
} from "./domain/masterDataImportReviewQueue.js";
import {
  canCreateMasterDataImportConfirmationPlan,
} from "./domain/masterDataImportConfirmationPlan.js";
import {
  createOfficeMasterDataImportConfirmationPlan,
  createOfficeMasterDataImportFailedRowsCorrectionDraft,
  createOfficeMasterDataImportExecution,
  downloadOfficeMasterDataImportFailedRows,
  enableOfficeMasterDataEmployeeAccount,
  issueOfficeMasterDataEmployeeAccountPassword,
  revokeOfficeMasterDataEmployeeAccountPassword,
} from "./services/officeMasterDataImportApiClient.js";
import {
  getBatchPrintPackageRows,
  getBatchPrintStats,
  getNextOpenTodoId,
  markTodoCustomerNotificationSent,
  markTodoCustomerPending,
  markTodoHandled,
  markTodoManagementViewed,
  markTodoNotificationCopyPrepared,
  reopenTodo,
  snoozeTodo,
} from "./state/officeTodoActions.js";
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

function findAttachmentSummaryById(files = [], attachmentId = "") {
  return (Array.isArray(files) ? files : []).find((file) => file.attachmentId === attachmentId) ?? null;
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

function getFileNameFromContentDisposition(contentDisposition = "") {
  const encodedMatch = String(contentDisposition).match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }
  const plainMatch = String(contentDisposition).match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? "";
}

function sanitizeDownloadFileName(fileName, fallback = "attachment") {
  const safeName = String(fileName || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ");
  return safeName || fallback;
}

function downloadAttachmentPreview(attachment) {
  if (typeof document === "undefined" || !attachment?.previewDataUrl) return false;
  const link = document.createElement("a");
  const fileName = sanitizeDownloadFileName(
    attachment.fileName || getFileNameFromContentDisposition(attachment.contentDisposition),
    `${attachment.attachmentId || "payment-proof"}.png`,
  );
  link.href = attachment.previewDataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
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
    refreshInventoryCorrectionQueue, refreshInventoryLedgerEntries,
    loadInventoryCorrectionDetail, createInventoryCorrectionDraft, linkInventoryCorrectionAttachment, confirmInventoryCorrectionDraft,
    completeFulfillmentAction, markFulfillmentPrepared, reviewFulfillmentDeliveryEvidence,
    saveFulfillmentDispatch, submitFulfillmentException,
    executeProductionPackingAction,
    refreshMasterDataEmployeeAccountReviews, refreshMasterDataImportReviewDrafts,
    refreshStatementDetail, refreshStatements, refreshV1GoLiveStatus,
    executeOrderEntryAction, executeOrderLineAction, recognizeOrderDraft,
    runOrderDraftCommand, updateOrderDraftField,
    todos, setTodos, todoMeta, printBatchRecords,
    selectedTodoId, setSelectedTodoId, todoView, setTodoView,
    orderLines, orderPoolMeta, setOrderPoolMeta,
    selectedOrderDetail, setSelectedOrderDetail, entryText, setEntryText,
    draftRows, draftStatus,
    selectedDraftId, setSelectedDraftId, orderFilters, setOrderFilters,
    selectedOrderId, setSelectedOrderId,
    inventoryRecords, inventoryMeta,
    inventoryLedgerState, inventoryLedgerFilters, setInventoryLedgerFilters,
    inventoryCorrectionDetailState,
    inventoryCorrectionQueueState,
    selectedStockId, setSelectedStockId,
    fulfillmentTab, setFulfillmentTab, fulfillments, setFulfillments,
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
    masterDataEmployeeAccountReviews, setMasterDataEmployeeAccountReviews,
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
  });

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
  function openMasterDataTemplatePanel(sourceLabel) {
    showMasterDataTemplatePanel({
      sourceLabel,
      openedAt: new Date().toISOString(),
    });
    setMasterDataPrecheckState({ status: "idle" });
    void refreshMasterDataImportReviewDrafts({ silent: true });
    setToast(`已打开${sourceLabel || "基础资料"}导入模板；正式写入仍需经过确认计划和导入执行记录。`);
  }

  function downloadMasterDataTemplate(templateKey) {
    const metadata = downloadMasterDataImportTemplateWorkbook(
      templateKey,
      currentUser.displayName || currentUser.name || currentUserId || "ERP",
    );
    if (!metadata) {
      setToast("当前环境未触发模板下载。");
      return;
    }
    setToast(`已生成${metadata.templateLabel}导入模板：${metadata.fileName}。`);
  }

  async function precheckMasterDataTemplate(file) {
    if (!file) return;
    setMasterDataPrecheckState({
      status: "checking",
      fileName: file.name,
    });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await precheckMasterDataImportWorkbook({
        bytes,
        fileName: file.name,
        checkedAt: new Date().toISOString(),
      });
      setMasterDataPrecheckState({
        status: "done",
        fileName: file.name,
        result,
      });
      setToast(`预检查完成：${result.summary.statusLabel}，阻断 ${result.summary.errorCount} 项，需确认 ${result.summary.warningCount} 项。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMasterDataPrecheckState({
        status: "error",
        fileName: file.name,
        error: message,
      });
      setToast(`预检查失败：${message}`);
    }
  }

  function createMasterDataImportReviewDraftFromPrecheck() {
    const precheckResult = masterDataPrecheckState.result;
    if (!precheckResult) {
      setToast("请先上传基础资料模板并完成预检查。");
      return;
    }
    if (!canCreateMasterDataImportReviewDraft(precheckResult)) {
      setToast("预检查存在阻断项，需先修正后重新上传，暂不能进入确认队列。");
      return;
    }
    const draft = createMasterDataImportReviewDraft({
      precheckResult,
      requestedBy: currentUser.displayName || currentUser.name || currentUserId,
      createdAt: new Date().toISOString(),
    });
    setMasterDataImportReviewDrafts((items) => upsertMasterDataImportReviewDraft(items, draft));
    setToast(`已加入导入确认队列：${draft.draftId}（${draft.statusLabel}）。`);
  }

  async function createMasterDataImportConfirmationPlanFromDraft(draft) {
    if (!canCreateMasterDataImportConfirmationPlan(draft)) {
      setToast("该导入草稿存在阻断项，不能生成正式导入确认计划。");
      return;
    }
    const result = await createOfficeMasterDataImportConfirmationPlan({
      authState,
      operatorId: currentUserId,
      reviewDraft: draft,
      createdBy: currentUser.displayName || currentUser.name || currentUserId,
    });
    if (result.blocked) {
      setToast(`生成导入确认计划失败：${result.error?.message || "权限或接口错误"}`);
      return;
    }
    const plan = result.confirmationPlan;
    if (!plan) {
      setToast("生成导入确认计划失败：未返回计划内容。");
      return;
    }
    setMasterDataImportConfirmationPlans((items) => {
      const next = [plan, ...items.filter((item) => item.draftId !== plan.draftId)];
      return next.slice(0, 6);
    });
    const sourceLabel = result.source === "api" ? "API 已保存" : "本地草稿";
    setToast(`已生成导入确认计划：${plan.planId}（${plan.statusLabel}，${sourceLabel}）。`);
  }

  async function createMasterDataImportExecutionFromPlan(plan) {
    const actionState = getUiActionState(permissionContext, "masterData", "生成执行记录");
    if (actionState.disabled) {
      setToast(actionState.title);
      return;
    }
    const result = await createOfficeMasterDataImportExecution({
      authState,
      operatorId: currentUserId,
      planId: plan.planId,
      confirmationPlan: plan,
      requestedBy: currentUser.displayName || currentUser.name || currentUserId,
    });
    if (result.blocked) {
      setToast(`生成导入执行记录失败：${result.error?.message || "权限或接口错误"}`);
      return;
    }
    const execution = result.importExecution;
    if (!execution) {
      setToast("生成导入执行记录失败：未返回执行记录。");
      return;
    }
    setMasterDataImportExecutions((items) => upsertMasterDataImportExecution(items, execution));
    setToast(`已生成导入执行记录：${execution.executionId}（${execution.statusLabel}）。`);
  }

  async function commitMasterDataImportExecutionFromPlan(plan) {
    const actionState = getUiActionState(permissionContext, "masterData", "正式导入");
    if (actionState.disabled) {
      setToast(actionState.title);
      return;
    }
    const result = await createOfficeMasterDataImportExecution({
      authState,
      operatorId: currentUserId,
      planId: plan.planId,
      confirmationPlan: plan,
      requestedAt: new Date().toISOString(),
      requestedBy: currentUser.displayName || currentUser.name || currentUserId,
      officialImportEnabled: true,
      officialWriterKind: "local_transaction",
    });
    if (result.importExecution) {
      setMasterDataImportExecutions((items) => upsertMasterDataImportExecution(items, result.importExecution));
    }
    if (result.blocked) {
      setToast(`正式导入失败：${result.error?.message || "权限或事务错误"}`);
      return;
    }
    const execution = result.importExecution;
    if (!execution) {
      setToast("正式导入失败：未返回执行记录。");
      return;
    }
    const recordCount = execution.summary?.transactionRecordCount ?? execution.summary?.targetRecordCount ?? 0;
    setToast(`已正式导入：${execution.executionId}，写入 ${recordCount} 条主数据记录。`);
    await refreshMasterDataEmployeeAccountReviews({ silent: true });
  }

  async function downloadMasterDataImportFailedRows(execution) {
    const actionState = getUiActionState(permissionContext, "masterData", "下载失败行");
    if (actionState.disabled) {
      setToast(actionState.title);
      return;
    }
    const inlineDownload = execution?.failedRowsDownload;
    try {
      const result = await downloadOfficeMasterDataImportFailedRows({
        authState,
        operatorId: currentUserId,
        executionId: execution.executionId,
      });
      if (!result.blocked && result.content) {
        const downloaded = downloadTextFile(result.content, {
          fileName: result.fileName || inlineDownload?.fileName,
          contentType: result.contentType || inlineDownload?.contentType,
        });
        setToast(downloaded ? `已下载失败行：${result.fileName || inlineDownload?.fileName}。` : "当前环境未触发失败行下载。");
        return;
      }
      if (!inlineDownload?.content) {
        setToast(`下载失败行失败：${result.error?.message || "接口未返回失败行内容"}`);
        return;
      }
    } catch {
      if (!inlineDownload?.content) {
        setToast("下载失败行失败：接口不可用且本地没有失败行内容。");
        return;
      }
    }
    const downloaded = downloadTextFile(inlineDownload.content, {
      fileName: inlineDownload.fileName,
      contentType: inlineDownload.contentType,
    });
    setToast(downloaded ? `已下载失败行：${inlineDownload.fileName}。` : "当前环境未触发失败行下载。");
  }

  async function createMasterDataFailedRowsCorrectionDraft(execution, rowCorrections = []) {
    const actionState = getUiActionState(permissionContext, "masterData", "生成修正草稿");
    if (actionState.disabled) {
      setToast(actionState.title);
      return;
    }
    if (!execution?.executionId) {
      setToast("缺少导入执行记录 ID，不能生成修正草稿。");
      return;
    }
    const result = await createOfficeMasterDataImportFailedRowsCorrectionDraft({
      authState,
      operatorId: currentUserId,
      executionId: execution.executionId,
      rowCorrections,
      createdAt: new Date().toISOString(),
    });
    if (result.blocked) {
      setToast(`生成失败行修正草稿失败：${result.error?.message || "权限或接口错误"}`);
      return;
    }
    const draft = result.reviewDraft;
    if (!draft) {
      setToast("生成失败行修正草稿失败：未返回草稿内容。");
      return;
    }
    setMasterDataImportReviewDrafts((items) => upsertMasterDataImportReviewDraft(items, draft));
    const unresolved = Number(draft.correctionSummary?.unresolvedRowCount ?? draft.summary?.unresolvedRowCount ?? 0);
    const rowCount = Number(draft.correctionSummary?.failedRowCount ?? draft.summary?.failedRowCount ?? draft.summary?.dataRowCount ?? 0);
    setToast(unresolved > 0
      ? `已生成失败行修正草稿：${draft.draftId}，共 ${rowCount} 行，需先核对修正后再生成计划。`
      : `已生成失败行修正草稿：${draft.draftId}，共 ${rowCount} 行，可继续生成确认计划。`);
  }

  async function enableMasterDataEmployeeAccount(review) {
    const actionState = getUiActionState(permissionContext, "masterData", "复核启用员工账号");
    if (actionState.disabled) {
      setToast(actionState.title);
      return;
    }
    const result = await enableOfficeMasterDataEmployeeAccount({
      authState,
      operatorId: currentUserId,
      employeeId: review.employeeId,
      roleKey: review.recommendedRoleKey,
      loginName: review.loginName,
      userId: review.userId,
      reviewNote: "已复核导入员工岗位、默认机台和角色，启用内部账号资料。",
    });
    if (result.blocked) {
      setToast(`启用员工账号失败：${result.error?.message || "权限或接口错误"}`);
      return;
    }
    if (!result.employeeAccountReview) {
      setToast("启用员工账号失败：未返回复核记录。");
      return;
    }
    setMasterDataEmployeeAccountReviews((items) => upsertMasterDataEmployeeAccountReview(items, result.employeeAccountReview));
    setToast(`已启用员工账号：${result.employeeAccountReview.name || result.employeeAccountReview.employeeId}（${result.employeeAccountReview.loginName || result.employeeAccountReview.userId}）。`);
  }

  async function issueMasterDataEmployeeAccountPassword(review) {
    const actionState = getUiActionState(permissionContext, "masterData", "发放员工临时密码");
    if (actionState.disabled) {
      setToast(actionState.title);
      return;
    }
    if (!review?.accountEnabled) {
      setToast("请先复核启用员工账号，再发放临时密码。");
      return;
    }
    const result = await issueOfficeMasterDataEmployeeAccountPassword({
      authState,
      operatorId: currentUserId,
      employeeId: review.employeeId,
      roleKey: review.recommendedRoleKey,
      loginName: review.loginName,
      userId: review.userId,
      issueNote: "管理员发放员工首次临时登录密码。",
    });
    if (result.blocked) {
      setToast(`发放员工临时密码失败：${result.error?.message || "权限或接口错误"}`);
      return;
    }
    if (!result.employeeAccountReview || !result.issuedCredential) {
      setToast("发放员工临时密码失败：未返回本次账号密码。");
      return;
    }
    setMasterDataEmployeeAccountReviews((items) => upsertMasterDataEmployeeAccountReview(items, result.employeeAccountReview));
    setLastIssuedEmployeeCredential({
      ...result.issuedCredential,
      employeeId: result.employeeAccountReview.employeeId,
      employeeName: result.employeeAccountReview.name,
      operationLogId: result.operationLogId,
    });
    setToast(`已发放临时密码：${result.issuedCredential.loginName || result.issuedCredential.userId}。`);
  }

  async function revokeMasterDataEmployeeAccountPassword(review) {
    const actionState = getUiActionState(permissionContext, "masterData", "撤销员工密码");
    if (actionState.disabled) {
      setToast(actionState.title);
      return;
    }
    if (!review?.accountEnabled || !review?.userId) {
      setToast("该员工账号还未启用，不能撤销密码。");
      return;
    }
    if (review.passwordStatus === "password_revoked" || review.loginEnabled === false) {
      setToast("该员工密码已撤销，无需重复操作。");
      return;
    }
    const confirmed = window.confirm(`确认撤销 ${review.name || review.loginName || review.employeeId} 的登录密码？撤销后该员工无法继续登录，已有会话会失效。`);
    if (!confirmed) return;

    const result = await revokeOfficeMasterDataEmployeeAccountPassword({
      authState,
      operatorId: currentUserId,
      employeeId: review.employeeId,
      revokeNote: "管理员在基础资料员工账号复核中撤销员工登录密码。",
    });
    if (result.blocked) {
      setToast(`撤销员工密码失败：${result.error?.message || "权限或接口错误"}`);
      return;
    }
    if (!result.employeeAccountReview) {
      setToast("撤销员工密码失败：未返回复核记录。");
      return;
    }
    setMasterDataEmployeeAccountReviews((items) => upsertMasterDataEmployeeAccountReview(items, result.employeeAccountReview));
    if (lastIssuedEmployeeCredential?.employeeId === result.employeeAccountReview.employeeId) {
      setLastIssuedEmployeeCredential(null);
    }
    setToast(`已撤销员工密码：${result.employeeAccountReview.name || result.employeeAccountReview.loginName || result.employeeAccountReview.employeeId}。`);
  }

  function saveMasterDataMaintenanceDraft(input = {}) {
    if (!guardUiAction("masterData", "生成维护草稿")) return null;
    const draftId = `MDM-${Date.now().toString(36).toUpperCase()}`;
    const recordLabel = String(input.recordLabel ?? input.record?.label ?? input.record?.name ?? input.recordId ?? "主数据记录").trim();
    const fieldLabel = String(input.fieldLabel ?? input.field ?? "字段").trim();
    const nextValue = String(input.nextValue ?? "").trim();
    const reason = String(input.reason ?? "").trim() || "办公室维护草稿，待管理复核后通过导入确认流程写入。";
    const draft = {
      draftId,
      tab: String(input.tab ?? masterDataMaintenanceTab).trim() || "基础资料",
      recordId: String(input.recordId ?? input.record?.id ?? "").trim(),
      recordLabel,
      field: String(input.field ?? fieldLabel).trim(),
      fieldLabel,
      nextValue,
      reason,
      status: "待复核",
      createdBy: currentUser.displayName || currentUserId,
      createdAt: new Date().toISOString(),
    };
    setMasterDataMaintenanceDrafts((current) => [draft, ...current].slice(0, 12));
    setToast(`已生成基础资料维护草稿 ${draftId}：${recordLabel} / ${fieldLabel}。正式写入仍需走导入确认。`);
    return draft;
  }

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

  function addTodo(input) {
    const todo = createOfficeTodo(input);
    setTodos((current) => [todo, ...current]);
    setSelectedTodoId(todo.id);
  }

  useEffect(() => {
    if (activePage !== "v1Status") return;
    void refreshV1GoLiveStatus();
  }, [activePage, refreshV1GoLiveStatus]);

  async function dispatchPrintJobQueueItem(printJobId) {
    if (!guardUiAction("productionPacking", "派发打印作业")) return;
    const result = await executePrintJobDispatch(printJobId);
    if (result?.feedback) setToast(result.feedback);
  }

  async function retryPrintJobQueueItem(printJobId) {
    if (!guardUiAction("productionPacking", "重试打印作业")) return;
    const result = await executePrintJobRetry(printJobId);
    if (result?.feedback) setToast(result.feedback);
  }

  function selectPrinterDeviceQaDevice(printDeviceId) {
    const selectedDevice = printerDeviceQa.devices.find((item) => item.printDeviceId === printDeviceId) ?? null;
    printerDeviceQaSelectedIdRef.current = printDeviceId;
    setPrinterDeviceQa((current) => ({
      ...current,
      selectedDeviceId: printDeviceId,
      fieldTests: [],
      latestRecord: null,
      checks: createPrinterDeviceFieldTestChecks(),
      deviceLabel: selectedDevice?.name ?? "",
      driverLabel: getPrinterDeviceQaDriverLabel(selectedDevice),
      driverModeDraft: selectedDevice ? getPrinterDeviceDriverMode(selectedDevice) : "preview_only",
      paperLabel: getPrinterDeviceQaPaperLabel(selectedDevice),
      evidence: createPrinterDeviceFieldTestEvidence(),
      error: "",
    }));
    void refreshPrinterDeviceQa({ selectedDeviceId: printDeviceId, showToast: false });
  }

  function changePrinterDeviceQaField(field, value) {
    setPrinterDeviceQa((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function changePrinterDeviceQaCheck(checkKey, status) {
    setPrinterDeviceQa((current) => ({
      ...current,
      checks: normalizePrinterDeviceFieldTestChecks(
        current.checks.map((item) => (
          item.key === checkKey
            ? { ...item, status }
            : item
        )),
      ),
    }));
  }

  function changePrinterDeviceQaEvidenceField(field, value) {
    setPrinterDeviceQa((current) => ({
      ...current,
      evidence: normalizePrinterDeviceFieldTestEvidence({
        ...(current.evidence ?? {}),
        [field]: value,
      }),
    }));
  }

  async function savePrinterDeviceMode() {
    if (!guardUiAction("productionPacking", "保存设备模式")) return;
    const result = await executeSavePrinterDeviceMode();
    if (result?.feedback) setToast(result.feedback);
  }

  async function savePrinterDeviceQaRecord() {
    if (!guardUiAction("productionPacking", "保存打印验收")) return;
    const result = await executeSavePrinterDeviceQaRecord();
    if (result?.feedback) setToast(result.feedback);
  }

  async function loadAttachmentAccessAudit(attachmentId) {
    const result = await listOfficeAttachmentAccessLogs({
      authState,
      attachmentId,
      operatorId: currentUserId,
      limit: 6,
    });

    if (result.blocked) {
      return {
        source: "api_error",
        status: result.error?.requiredPermission
          ? `后端拒绝访问记录：缺少权限 ${result.error.requiredPermission}`
          : `后端拒绝访问记录：${result.error?.message ?? "未知错误"}`,
        items: [],
        total: 0,
      };
    }

    if (result.source !== "api") {
      return {
        source: result.source,
        status: "访问记录暂不可用",
        items: [],
        total: 0,
      };
    }

    return {
      source: "api",
      status: result.items.length ? `最近 ${result.items.length} 条 / 共 ${result.total} 条` : "暂无访问记录",
      items: result.items,
      total: result.total,
    };
  }

  function downloadViewedAttachment(attachment) {
    const downloaded = downloadAttachmentPreview(attachment);
    const label = attachment.viewerTitle?.replace("预览", "") || (attachment.statementId ? "对账附件" : "附件");
    setToast(
      downloaded
        ? `已下载${label}：${attachment.fileName || attachment.attachmentId || label}。`
        : `当前${label}没有可下载的预览内容。`,
    );
  }

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
    refreshInventoryCorrectionQueue({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshInventoryCorrectionQueue]);

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
    const syncKey = `${currentUserId}:${selectedStatementId}:payment_screenshot`;
    if (paymentAttachmentSyncKeysRef.current.has(syncKey)) return undefined;
    paymentAttachmentSyncKeysRef.current.add(syncKey);
    let cancelled = false;
    const currentStatement = statements.find((item) => item.id === selectedStatementId);
    listOfficeAttachments({
      authState,
      ownerType: "statement",
      ownerId: selectedStatementId,
      purpose: "payment_screenshot",
      operatorId: currentUserId,
      localAttachments: currentStatement?.paymentAttachmentFiles ?? [],
    }).then((result) => {
      if (cancelled || result.blocked || !result.items?.length) return;
      setStatements((current) =>
        syncStatementPaymentAttachments(
          current,
          selectedStatementId,
          result.items.map((item) => ({ ...item, source: result.source })),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, authState, currentUserId, selectedStatementId]);

  useEffect(() => {
    if (activePage !== "statements" || !selectedStatementId) return undefined;
    const syncKey = `${currentUserId}:${selectedStatementId}:statement_customer_confirmation`;
    if (customerConfirmationAttachmentSyncKeysRef.current.has(syncKey)) return undefined;
    customerConfirmationAttachmentSyncKeysRef.current.add(syncKey);
    let cancelled = false;
    const currentStatement = statements.find((item) => item.id === selectedStatementId);
    listOfficeAttachments({
      authState,
      ownerType: "statement",
      ownerId: selectedStatementId,
      purpose: "statement_customer_confirmation",
      operatorId: currentUserId,
      localAttachments: currentStatement?.customerConfirmationAttachmentFiles ?? [],
    }).then((result) => {
      if (cancelled || result.blocked || !result.items?.length) return;
      setStatements((current) =>
        syncStatementCustomerConfirmationAttachments(
          current,
          selectedStatementId,
          result.items.map((item) => ({ ...item, source: result.source })),
        ),
      );
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

  function refreshActivePage() {
    if (activePage === "todos") {
      void refreshTodos({ showToast: true }).then((result) => {
        if (result?.feedback) setToast(result.feedback);
      });
      return;
    }
    if (activePage === "orders") {
      void refreshOrderPool({ showToast: true }).then((result) => {
        if (result?.feedback) setToast(result.feedback);
      });
      return;
    }
    if (activePage === "driverMobile") {
      void refreshDriverDeliveryTasks({ showToast: true }).then((result) => {
        if (result?.feedback) setToast(result.feedback);
      });
      return;
    }
    if (activePage === "inventory") {
      void refreshInventoryRecords({ showToast: true }).then((result) => {
        if (result?.feedback) setToast(result.feedback);
        const stockId = result?.selectedStockId ?? selectedStockIdRef.current;
        void refreshInventoryLedgerEntries({ stockId, showToast: false });
      });
      return;
    }
    if (activePage === "fulfillment") {
      void refreshFulfillments({ showToast: true }).then((result) => {
        if (result?.feedback) setToast(result.feedback);
      });
      return;
    }
    if (activePage === "statements") {
      void refreshStatements({ showToast: true }).then((result) => {
        if (result?.feedback) setToast(result.feedback);
        const statementId = result?.selectedStatementId ?? selectedStatementId;
        if (statementId) void refreshStatementDetail({ statementId, showToast: false });
      });
      return;
    }
    if (activePage === "masterData") {
      void Promise.all([
        refreshMasterDataImportReviewDrafts({ silent: true }),
        refreshMasterDataEmployeeAccountReviews({ silent: true }),
      ]).then(() => {
        setToast("基础资料维护页已刷新：导入草稿和员工账号复核状态已同步。");
      });
      return;
    }
    if (activePage === "rawMaterials") {
      void Promise.all([
        refreshRawMaterialInbounds({ showToast: false }),
        refreshRawMaterialSupplierStatementReviews({ showToast: false }),
      ]).then(() => {
        setToast("原材料入库单和供应商月结复核草稿已刷新；月结草稿仍不影响库存或付款。");
      });
      return;
    }
    if (activePage === "v1Status") {
      void refreshV1GoLiveStatus({ showToast: true }).then((result) => {
        if (result?.feedback) setToast(result.feedback);
      });
      return;
    }
    if (activePage === "packing" || activePage === "workshopMobile") {
      if (activePage === "packing") {
        const refreshActions = [
          refreshProductionPackingTaskLists({ showToast: false }),
          refreshPrintDriverConfig({ showToast: false }),
          refreshPrinterDeviceQa({ showToast: false }),
          refreshOfficePrintJobQueue({ showToast: false }),
        ];
        if (canUsePrintDiagnostics) {
          refreshActions.push(
            refreshPrintDriverReadiness({ showToast: false }),
            refreshPrintDriverCupsDiagnostics({ showToast: false }),
          );
        }
        void Promise.all(refreshActions).then(() => {
          setToast("打包/标签任务池、打印上线门禁、打印驱动诊断、CUPS 队列预检、打印设备验收和打印作业池已刷新。");
        });
        return;
      }
      void refreshProductionPackingTaskLists({ showToast: true }).then((result) => {
        if (result?.feedback) setToast(result.feedback);
      });
      return;
    }
    setToast(`${activeMeta.label} 已刷新本地假数据。`);
  }

  function createOrderFromTopbar() {
    if (!guardUiAction("topbar", "新建订单")) return;
    setActivePage("entry");
  }

  function focusOrderLine(ref, reason = "订单池") {
    const line = resolveLineFromRef(orderLines, statements, ref);
    setActivePage("orders");
    if (!line) {
      setOrderFilters(defaultOrderFilters);
      setToast(`已打开订单池，但未找到 ${ref} 对应的订单明细。`);
      return null;
    }
    setSelectedOrderId(line.id);
    setOrderFilters({ ...defaultOrderFilters, customerId: line.customerId });
    setToast(`已从${reason}定位到订单明细 ${line.id}。`);
    return line;
  }

  function focusFulfillmentByRef(ref) {
    const line = resolveLineFromRef(orderLines, statements, ref);
    const fulfillment = fulfillments.find((item) => item.lineId === ref) ?? fulfillments.find((item) => item.lineId === line?.id) ?? fulfillments.find((item) => item.lineId.startsWith(line?.orderNo ?? ref));
    if (fulfillment) {
      setSelectedFulfillmentId(fulfillment.id);
      setFulfillmentTab(fulfillment.method);
      setActivePage("fulfillment");
      setToast(`已定位到出库 / 交付记录 ${fulfillment.lineId}。`);
      return;
    }
    focusOrderLine(ref, "待办");
    setToast(`未找到 ${ref} 的出库记录，已定位到订单池明细。`);
  }

  function focusStatementByRef(ref) {
    const line = resolveLineFromRef(orderLines, statements, ref);
    const statement = statements.find((item) => item.id === ref) ?? statements.find((item) => item.lineIds.includes(line?.id));
    if (statement) {
      setSelectedStatementId(statement.id);
      setActivePage("statements");
      setToast(`已定位到对账 / 收款记录 ${statement.id}。`);
      return;
    }
    focusOrderLine(ref, "待办");
    setToast(`未找到 ${ref} 的对账记录，已定位到订单池明细。`);
  }

  async function openInventoryCorrectionDetail(correctionDraftId, sourceEntry = null) {
    setActivePage("inventory");
    const result = await loadInventoryCorrectionDetail(correctionDraftId, sourceEntry, { showToast: true });
    if (result?.feedback) setToast(result.feedback);
    return result?.detail ?? null;
  }

  async function loadProductionPackingSourceDetail(focusTarget) {
    const requestedType = String(focusTarget?.mode ?? "").trim();
    const requestedId = String(focusTarget?.taskId ?? focusTarget?.productionTaskId ?? focusTarget?.packingTaskId ?? "").trim();
    if (!requestedType || !requestedId) {
      setProductionPackingDetailState({
        source: "local",
        detail: null,
        requestedType,
        requestedId,
        loading: false,
        error: "未找到可读取的生产/打包来源任务 ID。",
        lastSyncedAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      });
      return null;
    }

    setProductionPackingDetailState({
      source: "api",
      detail: null,
      requestedType,
      requestedId,
      loading: true,
      error: "",
      lastSyncedAt: "",
    });

    const orderLineId = String(focusTarget?.orderLineId ?? "").trim();
    const orderLine =
      orderLines.find((item) => item.id === orderLineId || item.orderLineId === orderLineId) ??
      productionPacking.productionTasks?.find((item) => item.id === orderLineId || item.orderLineId === orderLineId) ??
      productionPacking.packingTasks?.find((item) => item.orderLineId === orderLineId)?.orderLine;
    const inventoryItem = orderLine ? findProductionInventoryItem(orderLine, inventoryRecords) : null;
    const reportResult =
      (orderLineId ? productionPacking.reportResultsByLineId?.[orderLineId] : null) ??
      productionPacking.productionTasks?.find((item) => item.productionTaskId === requestedId || item.orderLineId === orderLineId)?.latestReport ??
      Object.values(productionPacking.reportResultsByLineId ?? {}).find(
        (item) => item?.reportId === focusTarget?.sourceId || item?.productionTaskId === requestedId,
      );

    const result =
      requestedType === "packing"
        ? await getOfficePackingTaskDetail({
            authState,
            packingTaskId: requestedId,
            packingTask: productionPacking.packingTasks.find((item) => item.packingTaskId === requestedId),
            orderLine,
            inventoryItem,
            operatorId: currentUserId,
          })
        : await getOfficeProductionTaskDetail({
            authState,
            productionTaskId: requestedId,
            orderLine,
            reportResult,
            inventoryItem,
            operatorId: currentUserId,
          });

    const lastSyncedAt = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    if (result.blocked) {
      const message = result.error?.requiredPermission
        ? `后端拒绝读取生产/打包来源详情：缺少权限 ${result.error.requiredPermission}。`
        : `后端拒绝读取生产/打包来源详情：${result.error?.message ?? "未知错误"}`;
      setProductionPackingDetailState({
        source: result.source,
        detail: null,
        requestedType,
        requestedId,
        loading: false,
        error: message,
        lastSyncedAt,
      });
      setToast(message);
      return null;
    }

    setProductionPackingDetailState({
      source: result.source,
      detail: result.detail,
      requestedType,
      requestedId,
      loading: false,
      error: result.error?.message ?? "",
      lastSyncedAt,
    });
    return result.detail;
  }

  function focusInventoryLedgerSource(entry) {
    const sourceType = String(entry?.sourceType ?? "").trim();
    const sourceId = String(entry?.sourceId ?? "").trim();
    if (!sourceId) {
      setToast(`库存流水 ${entry?.ledgerId ?? ""} 暂无来源单据 ID。`);
      return;
    }

    const fulfillmentSourceTypes = new Set([
      "fulfillment_complete",
      "fulfillment_complete_legacy",
      "fulfillment_pickup",
      "fulfillment_pickup_legacy",
      "fulfillment_cancel",
    ]);
    const orderLineSourceTypes = new Set([
      "order_confirm",
      "order_line",
      "order_line_quantity_adjustment",
      "order_line_void",
      "inventory_reservation",
      "inventory_reservation_release",
    ]);
    const productionSourceTypes = new Set(["production_report", "production_report_reservation", "packing_complete"]);

    const fulfillment =
      fulfillments.find((item) => item.id === sourceId) ??
      fulfillments.find((item) => item.fulfillmentId === sourceId) ??
      fulfillments.find((item) => item.lineId === sourceId);
    const orderLine = resolveLineFromRef(orderLines, statements, sourceId);

    if (productionSourceTypes.has(sourceType)) {
      const focusTarget = getProductionPackingFocusFromLedgerEntry(entry, {
        orderLines: [...(productionPacking.productionTasks ?? []), ...orderLines],
        productionPacking,
        buildProductionTaskId,
        buildPackingTaskId,
      });
      setActivePage("packing");
      if (focusTarget) {
        const nextFocusTarget = {
          ...focusTarget,
          focusKey: `${entry?.ledgerId ?? sourceId}-${Date.now()}`,
        };
        setProductionPackingFocus(nextFocusTarget);
        void loadProductionPackingSourceDetail(nextFocusTarget);
        const targetLabel = focusTarget.mode === "packing" ? "打包任务" : "生产报工任务";
        setToast(`已从库存流水定位到${targetLabel} ${focusTarget.taskId}。`);
      } else {
        setProductionPackingDetailState({
          source: "local",
          detail: null,
          requestedType: "",
          requestedId: "",
          loading: false,
          error: `未找到来源 ${sourceId} 对应的生产或打包任务。`,
          lastSyncedAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        });
        setToast(`已打开打包 / 标签页；未找到来源 ${sourceId} 对应的生产或打包任务。`);
      }
      return;
    }

    if (fulfillmentSourceTypes.has(sourceType) && fulfillment) {
      setSelectedFulfillmentId(fulfillment.id);
      setFulfillmentTab(fulfillment.method);
      setActivePage("fulfillment");
      setToast(`已从库存流水定位到出库 / 交付记录 ${fulfillment.id}。`);
      return;
    }

    if (orderLineSourceTypes.has(sourceType) && orderLine) {
      setSelectedOrderId(orderLine.id);
      setOrderFilters({ ...defaultOrderFilters, customerId: orderLine.customerId });
      setActivePage("orders");
      setToast(`已从库存流水定位到订单明细 ${orderLine.id}。`);
      return;
    }

    if (fulfillment) {
      setSelectedFulfillmentId(fulfillment.id);
      setFulfillmentTab(fulfillment.method);
      setActivePage("fulfillment");
      setToast(`已从库存流水定位到出库 / 交付记录 ${fulfillment.id}。`);
      return;
    }

    if (orderLine) {
      setSelectedOrderId(orderLine.id);
      setOrderFilters({ ...defaultOrderFilters, customerId: orderLine.customerId });
      setActivePage("orders");
      setToast(`已从库存流水定位到订单明细 ${orderLine.id}。`);
      return;
    }

    if (sourceType === "inventory_correction") {
      void openInventoryCorrectionDetail(sourceId, entry);
      return;
    }

    setToast(`暂不能定位库存流水来源 ${sourceType || "未知类型"} / ${sourceId}。`);
  }

  function openOrderLineAction(action, orderLine) {
    if (!orderLine) {
      setToast("请先选择一条订单明细。");
      return;
    }
    const label = action === "quantity" ? "调整正式单数量" : "作废正式单";
    if (!guardUiAction("orders", label)) return;
    openOrderActionModal({
      type: action,
      orderLineId: orderLine.id,
      orderLine,
    });
  }

  async function handleTodo(action, todoId = selectedTodoId) {
    if (!guardUiAction("todo", action)) return;
    const selected = todos.find((item) => item.id === todoId);
    if (!selected && action !== "批量打印标签") return;

    if (action === "打印标签") {
      if (!selected || !isPrintTodo(selected)) {
        setToast("当前待办不是打印类待办，不能走标签打印确认。");
        return;
      }
      const stats = getBatchPrintStats([selected]);
      openModal({
        type: "batchPrintResult",
        action,
        todoIds: [selected.id],
        printPackages: getBatchPrintPackageRows([selected]),
        totalTasks: stats.totalTasks,
        totalLabels: stats.totalLabels,
      });
      return;
    }

    if (action === "处理完成" || action === "确认已查看") {
      const apiResult = await handleOfficeTodoAction({
        authState,
        todoId,
        action,
        operatorId: currentUserId,
        handlingResult: action,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝处理待办：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝处理待办：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      setTodos((current) => markTodoHandled(current, todoId, action, currentUser.displayName));
      const nextOpenId = getNextOpenTodoId(todos, todoId, sortTodos);
      if (nextOpenId) setSelectedTodoId(nextOpenId);
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`${selected.type} 已通过${sourceLabel}记录实际处理人：${currentUser.displayName}，进入今日已处理。`);
      return;
    }

    if (action === "重新打开") {
      const apiResult = await handleOfficeTodoAction({
        authState,
        todoId,
        action,
        operatorId: currentUserId,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝重新打开待办：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝重新打开待办：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      setTodos((current) => reopenTodo(current, todoId));
      setTodoView("未处理");
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`已通过${sourceLabel}重新打开该待办，回到未处理列表。`);
      return;
    }

    if (action === "批量打印标签") {
      const printTodos = todos.filter((item) => !item.handled && isPrintTodo(item));
      if (!printTodos.length) {
        setToast("当前没有可批量处理的打印类待办。");
        return;
      }
      const stats = getBatchPrintStats(printTodos);
      openModal({
        type: "batchPrintResult",
        action,
        todoIds: printTodos.map((item) => item.id),
        printPackages: getBatchPrintPackageRows(printTodos),
        totalTasks: stats.totalTasks,
        totalLabels: stats.totalLabels,
      });
      return;
    }

    if (action.startsWith("稍后")) {
      const apiResult = await handleOfficeTodoAction({
        authState,
        todoId,
        action,
        operatorId: currentUserId,
        reason: action,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝设置稍后提醒：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝设置稍后提醒：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      const result = snoozeTodo(todos, todoId, action);
      setTodos((current) => snoozeTodo(current, todoId, action).todos);
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`已通过${sourceLabel}给 ${selected.type} 设置稍后提醒：${result.reminder}，不改变待办处理状态。`);
      return;
    }

    if (action === "打开订单录入") {
      setActivePage("entry");
      setToast("已切到订单录入页；P0 先用页面跳转模拟从待办打开草稿。");
      return;
    }
    if (action === "打开订单池" || action === "打开订单") {
      focusOrderLine(selected.ref, "待办");
      return;
    }
    if (action === "打开库存查询") {
      setActivePage("inventory");
      setToast("已切到库存查询；缺货待办后续会补库存键定位。");
      return;
    }
    if (action === "打开出库异常") {
      focusFulfillmentByRef(selected.ref);
      return;
    }
    if (action === "打开对账收款") {
      focusStatementByRef(selected.ref);
      return;
    }
    if (action === "打开管理查看") {
      const apiResult = await handleOfficeTodoAction({
        authState,
        todoId,
        action,
        operatorId: currentUserId,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝记录管理查看：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝记录管理查看：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      setTodos((current) => markTodoManagementViewed(current, todoId));
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`管理手机端仍是后续模块，P0 已通过${sourceLabel}记录已提示。`);
      return;
    }
    if (action === "复制通知话术") {
      const customer = selected ? findCustomer(selected.customerId) : null;
      const notificationDraft = getTodoCustomerNotificationDraft(selected, customer);
      const copyText = notificationDraft?.copyText ?? "";
      const copied = await copyTextToClipboard(copyText);
      if (!copied) {
        setToast("当前浏览器未允许自动复制，请在待办详情中手动选中文案发送。");
        return;
      }
      const apiResult = await handleOfficeTodoAction({
        authState,
        todoId,
        action,
        operatorId: currentUserId,
        handlingResult: "已复制客户通知话术",
        notificationChannel: notificationDraft.channel,
        notificationContent: copyText,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝记录通知话术复制：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝记录通知话术复制：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      setTodos((current) =>
        markTodoNotificationCopyPrepared(current, todoId, {
          notificationCopyText: copyText,
          notificationChannel: notificationDraft.channel,
          operatorName: currentUser.displayName,
        }),
      );
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`已复制客户通知话术，并通过${sourceLabel}记录；待办保持未处理，发送后再确认。`);
      return;
    }
    if (action === "确认已通知客户") {
      const customer = selected ? findCustomer(selected.customerId) : null;
      const notificationDraft = getTodoCustomerNotificationDraft(selected, customer);
      const apiResult = await handleOfficeTodoAction({
        authState,
        todoId,
        action,
        operatorId: currentUserId,
        handlingResult: "已人工通知客户",
        notificationChannel: notificationDraft?.channel,
        notificationContent: notificationDraft?.copyText,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝确认客户通知：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝确认客户通知：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      setTodos((current) =>
        markTodoCustomerNotificationSent(current, todoId, {
          notificationCopyText: notificationDraft?.copyText,
          notificationChannel: notificationDraft?.channel,
          operatorName: currentUser.displayName,
        }),
      );
      const nextOpenId = getNextOpenTodoId(todos, todoId, sortTodos);
      if (nextOpenId) setSelectedTodoId(nextOpenId);
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`已通过${sourceLabel}记录客户已由办公室人工通知；没有自动发送客户消息。`);
      return;
    }
    if (action === "客户待确认") {
      setTodos((current) => markTodoCustomerPending(current, todoId));
      setToast("已标记客户待确认，不释放库存、不自动改单。");
      return;
    }
    if (action === "打印预览") {
      setToast("已打开打印预览占位；真实模板和打印权限后接。");
      return;
    }
    setToast(`${action} 已模拟执行。`);
  }

  async function recognize() {
    if (!guardUiAction("entry", "识别")) return;
    const result = await recognizeOrderDraft();
    if (result?.feedback) setToast(result.feedback);
  }

  function updateDraftField(id, field, value) {
    updateOrderDraftField(id, field, value);
  }

  function handleDraftCommand(action) {
    const result = runOrderDraftCommand(action);
    if (result?.feedback) setToast(result.feedback);
  }

  async function entryAction(label) {
    if (!guardUiAction("entry", label)) return;
    const result = await executeOrderEntryAction(label);
    if (result?.navigateTo) setActivePage(result.navigateTo);
    if (result?.feedback) setToast(result.feedback);
  }

  async function handleInventoryCorrectionDraft({ stock, actualQty, reason }) {
    if (!guardUiAction("inventory", "生成修正草稿")) return null;
    const result = await createInventoryCorrectionDraft({ stock, actualQty, reason });
    if (result?.feedback) setToast(result.feedback);
    return result?.blocked ? null : result?.draft ?? null;
  }

  async function handleInventoryCorrectionAttachment(payload) {
    if (!guardUiAction("inventory", "生成修正草稿")) return null;
    const result = await linkInventoryCorrectionAttachment(payload);
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  async function handleInventoryCorrectionConfirm(draft) {
    if (!guardUiAction("inventory", "确认修正生效")) return null;
    const result = await confirmInventoryCorrectionDraft(draft);
    if (result?.feedback) setToast(result.feedback);
    return result?.blocked ? null : result?.confirmation ?? null;
  }

  async function updateFulfillment(action, fulfillmentId = selectedFulfillmentId, actionPayload = {}) {
    if (!guardUiAction("fulfillment", action)) return;
    const selected = fulfillments.find((item) => item.id === fulfillmentId) ?? fulfillments[0];
    if (!selected) {
      setToast("当前没有可操作的出库 / 交付记录。");
      return;
    }
    const targetFulfillmentId = selected.id;
    if (action === "查看水印照片" || action === "查看签收照片") {
      const isSignature = action === "查看签收照片";
      const attachmentId = actionPayload.attachmentId || (isSignature ? selected.signaturePhotoAttachmentId : selected.watermarkedPhotoAttachmentId);
      const attachmentFile = findAttachmentSummaryById(selected.deliveryEvidenceAttachmentFiles, attachmentId);
      const viewerTitle = isSignature ? "签收照片预览" : "送达水印照片预览";
      if (!attachmentId) {
        setToast(isSignature ? "当前送货记录没有签收照片附件。" : "当前送货记录没有水印照片附件。");
        return;
      }
      if (attachmentFile?.previewDataUrl) {
        const accessAudit = await loadAttachmentAccessAudit(attachmentId);
        openAttachmentViewer({
          ...attachmentFile,
          attachmentId,
          viewerTitle,
          accessAudit,
          fulfillmentId: selected.id,
        });
        setFulfillments((current) =>
          current.map((item) =>
            item.id === selected.id
              ? {
                  ...item,
                  deliveryEvidenceAttachmentFiles: mergeAttachmentSummaries(item.deliveryEvidenceAttachmentFiles, [{ ...attachmentFile, accessAudit }]),
                }
              : item,
          ),
        );
        setToast(`已打开${isSignature ? "签收照片" : "送达水印照片"}预览：${attachmentFile.fileName || attachmentId}。`);
        return;
      }
      const contentResult = await downloadOfficeAttachmentContent({
        authState,
        attachmentId,
        operatorId: currentUserId,
      });
      if (contentResult.blocked) {
        setToast(
          contentResult.error?.requiredPermission
            ? `后端拒绝读取送达证据：缺少权限 ${contentResult.error.requiredPermission}。`
            : `后端拒绝读取送达证据：${contentResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      if (contentResult.source !== "api") {
        setToast("送达证据内容读取 API 暂不可用，已保留附件记录。");
        return;
      }
      const previewDataUrl = contentResult.contentBlob ? await readBlobAsDataUrl(contentResult.contentBlob) : "";
      const isImagePreview = isInlineImageAttachment({
        previewDataUrl,
        contentType: contentResult.contentType,
        mimeType: contentResult.contentType || attachmentFile?.mimeType,
      });
      const accessAudit = await loadAttachmentAccessAudit(attachmentId);
      const nextPreview = {
        ...attachmentFile,
        attachmentId,
        fileName: attachmentFile?.fileName || attachmentId,
        mimeType: contentResult.contentType || attachmentFile?.mimeType,
        contentType: contentResult.contentType,
        contentDisposition: contentResult.contentDisposition,
        previewDataUrl,
        previewStatus: previewDataUrl ? (isImagePreview ? "已加载预览" : "已读取内容，可下载原文件") : "未读取到内容",
        accessAudit,
        fulfillmentId: selected.id,
        viewerTitle,
      };
      setFulfillments((current) =>
        current.map((item) =>
          item.id === selected.id
            ? {
                ...item,
                deliveryEvidenceAttachmentFiles: mergeAttachmentSummaries(item.deliveryEvidenceAttachmentFiles, [nextPreview]),
              }
            : item,
        ),
      );
      if (previewDataUrl) openAttachmentViewer(nextPreview);
      setToast(
        previewDataUrl
          ? isImagePreview
            ? `已通过后端 API 读取${isSignature ? "签收照片" : "送达水印照片"}并显示预览。`
            : `已通过后端 API 读取${isSignature ? "签收照片" : "送达水印照片"}，可下载原文件查看。`
          : "已读取送达证据，当前没有可下载内容。",
      );
      return;
    }
    if (action === "证据复核通过") {
      const result = await reviewFulfillmentDeliveryEvidence({ action, fulfillment: selected });
      if (result?.feedback) setToast(result.feedback);
      return;
    }
    if (action === "退回重拍") {
      const reason = actionPayload.reason || "水印/定位/照片清晰度需补充";
      const result = await reviewFulfillmentDeliveryEvidence({
        action,
        fulfillment: selected,
        reason,
        customerName: findCustomer(selected.customerId).name,
      });
      if (result?.feedback) setToast(result.feedback);
      return;
    }
    if (action === "打开订单") {
      focusOrderLine(selected.lineId, "出库 / 交付");
      return;
    }
    if (action === "打开待办") {
      const todoType = selected.status.includes("数量") ? "数量差异待处理" : "无法出库待处理";
      let existingTodo = todos.find((item) => item.ref === selected.lineId && item.type === todoType && !item.handled)
        ?? todos.find((item) => item.ref === selected.lineId && item.type === todoType);
      if (!existingTodo) {
        const todoResult = await refreshTodos({ showToast: false });
        existingTodo = todoResult?.items?.find(
          (item) => item.ref === selected.lineId && item.type === todoType && !item.handled,
        ) ?? todoResult?.items?.find((item) => item.ref === selected.lineId && item.type === todoType);
      }
      if (existingTodo) {
        setSelectedTodoId(existingTodo.id);
      } else if (!runtimeServerRequired) {
        const todo = createOfficeTodo({
          type: todoType,
          customerId: selected.customerId,
          ref: selected.lineId,
          summary: `${selected.goods} 当前状态：${selected.status}，需办公室继续处理`,
          latest: selected.latest,
          urgency: "异常",
          impact: "影响出库交付",
        });
        setTodos((current) => [todo, ...current]);
        setSelectedTodoId(todo.id);
      } else {
        setToast("后端未返回该出库异常对应的公共待办，production 不创建本地替代记录。");
        return;
      }
      setActivePage("todos");
      setToast(existingTodo ? "已打开该出库异常对应的公共待办。" : "未找到已有待办，已补建一条公共待办。");
      return;
    }
    if (action === "编辑派单") {
      if (selected.method !== "送货") {
        setToast("编辑派单只用于送货交付记录。");
        return;
      }
      openModal({ type: "dispatch", fulfillmentId: targetFulfillmentId });
      return;
    }
    if (action === "数量不符") {
      openModal({ type: "mismatch", fulfillmentId: targetFulfillmentId });
      return;
    }
    if (action === "无法出库") {
      openModal({ type: "unable", fulfillmentId: targetFulfillmentId });
      return;
    }
    if (action === "作废旧标签" || action === "作废旧单据") {
      const printRecordId = selected.activePrintRecordId ?? selected.printRecordId;
      if (!printRecordId) {
        setToast("当前只有本地已打印状态，缺少可作废的打印记录 ID；请先重新打开最新 API 数据后再作废。");
        return;
      }
      openModal({ type: "printVoid", fulfillmentId: targetFulfillmentId, printRecordId, action });
      return;
    }
    if (action === "打印预览" || action.includes("打印") || action.includes("重打")) {
      openModal({ type: "print", fulfillmentId: targetFulfillmentId, action });
      return;
    }
    if (action === "标记已备货") {
      const result = await markFulfillmentPrepared({ fulfillment: selected });
      if (result?.feedback) setToast(result.feedback);
      return;
    }
    if (action === "确认已拉走" && selected.method !== "快递快运") {
      setToast("确认已拉走只用于快递/快运；自提和送货用完成出库/交付。");
      return;
    }
    if (action === "确认已拉走" && selected.method === "快递快运" && !selected.printed && selected.status !== "待确认拉走") {
      setToast("快递/快运需要先打印标签并进入待确认拉走，再确认已拉走。");
      return;
    }
    if (action === "确认已拉走" && selected.printRecordStatus === "voided") {
      setToast("旧标签已作废，必须先重打标签，生成新有效标签后才能确认拉走。");
      return;
    }
    if ((action === "完成自提" || action === "完成送货") && selected.printRecordStatus === "voided") {
      const documentLabel = getFulfillmentDocumentLabel(selected);
      setToast(`旧${documentLabel}已作废，必须先重打${documentLabel}，生成新有效${documentLabel}后才能完成交付。`);
      return;
    }
    if ((action === "完成自提" || action === "完成送货") && selected.status.includes("待打印")) {
      setToast("当前单据/标签还未打印，先打印预览后再完成交付。");
      return;
    }

    if (action === "确认已拉走" || action === "完成自提" || action === "完成送货" || action === "完成出库/交付") {
      const result = await completeFulfillmentAction({ action, fulfillment: selected });
      if (result?.feedback) setToast(result.feedback);
      return;
    }

    setToast(`不支持的出库 / 交付动作：${action || "未指定"}；未修改任何业务状态。`);
  }

  async function handleProductionPackingAction(action, payload = {}) {
    if (!guardUiAction("productionPacking", action)) return null;
    const result = await executeProductionPackingAction({ action, payload });
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

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
  async function statementAction(action, statementId = selectedStatementId, actionPayload = {}) {
    if (!guardUiAction("statements", action)) return;
    const selected = statements.find((item) => item.id === statementId) ?? statements[0];
    const customer = findCustomer(selected.customerId);
    const blockingAmount = getStatementBlockingAmount(selected);

    if (action === "查看付款凭证") {
      const attachmentId = typeof actionPayload === "string" ? actionPayload : actionPayload?.attachmentId;
      const attachmentFile = (selected.paymentAttachmentFiles ?? []).find((file) => file.attachmentId === attachmentId);
      if (!attachmentId) {
        setToast("未找到付款凭证附件 ID，无法预览。");
        return;
      }
      if (attachmentFile?.previewDataUrl) {
        const accessAudit = await loadAttachmentAccessAudit(attachmentId);
        openAttachmentViewer({
          ...attachmentFile,
          accessAudit,
          statementId: selected.id,
        });
        setStatements((current) =>
          updateStatementPaymentAttachmentPreview(current, selected.id, attachmentId, {
            accessAudit,
          }),
        );
        setToast(`已打开付款凭证预览：${attachmentFile.fileName || attachmentId}。`);
        return;
      }
      const contentResult = await downloadOfficeAttachmentContent({
        authState,
        attachmentId,
        operatorId: currentUserId,
      });
      if (contentResult.blocked) {
        setToast(
          contentResult.error?.requiredPermission
            ? "后端拒绝读取付款凭证：缺少权限 " + contentResult.error.requiredPermission + "。"
            : "后端拒绝读取付款凭证：" + (contentResult.error?.message ?? "未知错误"),
        );
        return;
      }
      if (contentResult.source !== "api") {
        setStatements((current) =>
          updateStatementPaymentAttachmentPreview(current, selected.id, attachmentId, {
            previewStatus: "读取失败，API 不可用",
          }),
        );
        setToast("付款凭证内容读取 API 暂不可用，已保留附件记录。");
        return;
      }
      const previewDataUrl = contentResult.contentBlob ? await readBlobAsDataUrl(contentResult.contentBlob) : "";
      const isImagePreview = isInlineImageAttachment({
        previewDataUrl,
        contentType: contentResult.contentType,
        mimeType: contentResult.contentType || attachmentFile?.mimeType,
      });
      const accessAudit = await loadAttachmentAccessAudit(attachmentId);
      const nextPreview = {
        ...attachmentFile,
        attachmentId,
        fileName: attachmentFile?.fileName || attachmentId,
        mimeType: contentResult.contentType || attachmentFile?.mimeType,
        contentType: contentResult.contentType,
        contentDisposition: contentResult.contentDisposition,
        previewDataUrl,
        previewStatus: previewDataUrl ? (isImagePreview ? "已加载预览" : "已读取内容，可下载原文件") : "未读取到内容",
        accessAudit,
        statementId: selected.id,
      };
      setStatements((current) =>
        updateStatementPaymentAttachmentPreview(current, selected.id, attachmentId, {
          previewDataUrl: nextPreview.previewDataUrl,
          previewStatus: nextPreview.previewStatus,
          contentType: nextPreview.contentType,
          contentDisposition: nextPreview.contentDisposition,
          accessAudit: nextPreview.accessAudit,
        }),
      );
      if (previewDataUrl) {
        openAttachmentViewer(nextPreview);
      }
      setToast(
        previewDataUrl
          ? isImagePreview
            ? "已通过后端 API 读取付款凭证并显示预览。"
            : "已通过后端 API 读取付款凭证，可下载原文件查看。"
          : "已通过后端 API 读取付款凭证，当前没有可下载内容。",
      );
      return;
    }

    if (action === "查看客户确认附件") {
      const attachmentId = typeof actionPayload === "string" ? actionPayload : actionPayload?.attachmentId;
      const attachmentFile = (selected.customerConfirmationAttachmentFiles ?? []).find((file) => file.attachmentId === attachmentId);
      if (!attachmentId) {
        setToast("未找到客户确认附件 ID，无法预览。");
        return;
      }
      if (attachmentFile?.previewDataUrl) {
        const accessAudit = await loadAttachmentAccessAudit(attachmentId);
        openAttachmentViewer({
          ...attachmentFile,
          accessAudit,
          statementId: selected.id,
          viewerTitle: "客户确认附件预览",
        });
        setStatements((current) =>
          updateStatementCustomerConfirmationAttachmentPreview(current, selected.id, attachmentId, {
            accessAudit,
          }),
        );
        setToast(`已打开客户确认附件预览：${attachmentFile.fileName || attachmentId}。`);
        return;
      }
      const contentResult = await downloadOfficeAttachmentContent({
        authState,
        attachmentId,
        operatorId: currentUserId,
      });
      if (contentResult.blocked) {
        setToast(
          contentResult.error?.requiredPermission
            ? "后端拒绝读取客户确认附件：缺少权限 " + contentResult.error.requiredPermission + "。"
            : "后端拒绝读取客户确认附件：" + (contentResult.error?.message ?? "未知错误"),
        );
        return;
      }
      if (contentResult.source !== "api") {
        setStatements((current) =>
          updateStatementCustomerConfirmationAttachmentPreview(current, selected.id, attachmentId, {
            previewStatus: "读取失败，API 不可用",
          }),
        );
        setToast("客户确认附件内容读取 API 暂不可用，已保留附件记录。");
        return;
      }
      const previewDataUrl = contentResult.contentBlob ? await readBlobAsDataUrl(contentResult.contentBlob) : "";
      const isImagePreview = isInlineImageAttachment({
        previewDataUrl,
        contentType: contentResult.contentType,
        mimeType: contentResult.contentType || attachmentFile?.mimeType,
      });
      const accessAudit = await loadAttachmentAccessAudit(attachmentId);
      const nextPreview = {
        ...attachmentFile,
        attachmentId,
        fileName: attachmentFile?.fileName || attachmentId,
        mimeType: contentResult.contentType || attachmentFile?.mimeType,
        contentType: contentResult.contentType,
        contentDisposition: contentResult.contentDisposition,
        previewDataUrl,
        previewStatus: previewDataUrl ? (isImagePreview ? "已加载预览" : "已读取内容，可下载原文件") : "未读取到内容",
        accessAudit,
        statementId: selected.id,
        viewerTitle: "客户确认附件预览",
      };
      setStatements((current) =>
        updateStatementCustomerConfirmationAttachmentPreview(current, selected.id, attachmentId, {
          previewDataUrl: nextPreview.previewDataUrl,
          previewStatus: nextPreview.previewStatus,
          contentType: nextPreview.contentType,
          contentDisposition: nextPreview.contentDisposition,
          accessAudit: nextPreview.accessAudit,
        }),
      );
      if (previewDataUrl) {
        openAttachmentViewer(nextPreview);
      }
      setToast(
        previewDataUrl
          ? isImagePreview
            ? "已通过后端 API 读取客户确认附件并显示预览。"
            : "已通过后端 API 读取客户确认附件，可下载原文件查看。"
          : "已通过后端 API 读取客户确认附件，当前没有可下载内容。",
      );
      return;
    }

    if (action === "生成对账单预览") {
      const apiResult = await previewOfficeStatement({
        authState,
        statement: selected,
        orderLines,
        customer,
        operatorId: currentUserId,
        previewType: "customer_send",
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? "后端拒绝生成对账预览：缺少权限 " + apiResult.error.requiredPermission + "。"
            : "后端拒绝生成对账预览：" + (apiResult.error?.message ?? "未知错误"),
        );
        return;
      }
      openModal({ type: "statementPreview", statementId: selected.id, preview: apiResult.preview, previewSource: apiResult.source });
      if (apiResult.source === "api" && apiResult.preview?.downloadToken) {
        await refreshStatementExportRecords(selected);
      }
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast("已通过" + sourceLabel + "生成客户发送版对账单预览；预览不等于已发送。");
      return;
    }

    if (action === "导出占位" || action === "导出Excel") {
      const apiResult = await previewOfficeStatement({
        authState,
        statement: selected,
        orderLines,
        customer,
        operatorId: currentUserId,
        previewType: "internal_archive",
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? "后端拒绝生成导出文件：缺少权限 " + apiResult.error.requiredPermission + "。"
            : "后端拒绝生成导出文件：" + (apiResult.error?.message ?? "未知错误"),
        );
        return;
      }
      const exportResult = await downloadOfficeStatementExport({
        authState,
        statement: selected,
        preview: apiResult.preview,
        operatorId: currentUserId,
      });
      if (exportResult.blocked) {
        setToast(
          exportResult.error?.requiredPermission
            ? "后端拒绝下载导出文件：缺少权限 " + exportResult.error.requiredPermission + "。"
            : "后端拒绝下载导出文件：" + (exportResult.error?.message ?? "未知错误"),
        );
        return;
      }
      const workbookContent =
        exportResult.source === "api"
          ? exportResult.workbookData
          : buildStatementExcelWorkbook(apiResult.preview, { statement: selected, customer });
      const downloaded = downloadStatementExcelWorkbook(workbookContent, selected, customer, {
        fileName: exportResult.fileName,
        contentType: exportResult.contentType,
      });
      const exportSourceLabel = exportResult.source === "api" ? "后端 API 文件" : "本地规则降级";
      const exportRecordPayload = {
        fileName: exportResult.fileName || "statement-" + selected.id + "-" + (customer?.name ?? "customer") + ".xlsx",
        source: exportSourceLabel,
        downloadToken: apiResult.preview?.downloadToken,
        previewType: apiResult.preview?.previewType,
        contentType: exportResult.contentType,
      };
      const listResult = exportResult.source === "api" ? await refreshStatementExportRecords(selected) : null;
      if (listResult?.source !== "api") {
        setStatements((current) => recordStatementExport(current, selected, exportRecordPayload));
      }
      setToast("已通过" + exportSourceLabel + "生成内部留档 Excel 文件" + (downloaded ? "，包含对账汇总和交付明细。" : "，当前环境未触发下载。"));
      return;
    }

    if (action === "刷新导出记录") {
      const listResult = await refreshStatementExportRecords(selected);
      if (listResult?.blocked) {
        setToast(
          listResult.error?.requiredPermission
            ? "后端拒绝查询导出记录：缺少权限 " + listResult.error.requiredPermission + "。"
            : "后端拒绝查询导出记录：" + (listResult.error?.message ?? "未知错误"),
        );
        return;
      }
      const sourceLabel = listResult?.source === "api" ? "后端 API" : "本地记录";
      setToast("已通过" + sourceLabel + "刷新导出记录，共 " + (listResult?.total ?? 0) + " 条。");
      return;
    }

    if (action === "下载导出文件") {
      const exportRecord = actionPayload.exportRecord;
      if (!exportRecord?.downloadToken) {
        setToast("该导出记录缺少下载令牌，无法重下历史文件。");
        return;
      }
      const exportResult = await downloadOfficeStatementExport({
        authState,
        statement: selected,
        exportRecord,
        operatorId: currentUserId,
        allowLocalFallback: false,
      });
      if (exportResult.blocked) {
        setToast(
          exportResult.error?.requiredPermission
            ? "后端拒绝下载历史导出文件：缺少权限 " + exportResult.error.requiredPermission + "。"
            : "后端拒绝下载历史导出文件：" + (exportResult.error?.message ?? "未知错误"),
        );
        return;
      }
      if (exportResult.source !== "api") {
        setToast("历史导出文件下载接口暂不可用，未重新生成本地文件。");
        return;
      }
      const downloaded = downloadStatementExcelWorkbook(exportResult.workbookData, selected, customer, {
        fileName: exportResult.fileName || exportRecord.fileName,
        contentType: exportResult.contentType || exportRecord.contentType,
      });
      setToast(
        downloaded
          ? "已重新下载历史导出文件：" + (exportResult.fileName || exportRecord.fileName || "对账 Excel") + "。"
          : "历史导出文件已读取，但当前环境未触发下载。",
      );
      return;
    }

    if (action === "登记实收") {
      openModal({ type: "payment", statementId: selected.id });
      return;
    }

    if (action === "标记已发送") {
      const sentTo = findCustomer(selected.customerId).contact;
      const sendChannel = "微信";
      const apiResult = await markOfficeStatementSentViaApi({
        authState,
        statement: selected,
        operatorId: currentUserId,
        sentTo,
        channel: "wechat",
        remark: currentUser.displayName + " 在对账 / 收款页标记发送。",
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? "后端拒绝标记发送：缺少权限 " + apiResult.error.requiredPermission + "。"
            : "后端拒绝标记发送：" + (apiResult.error?.message ?? "未知错误"),
        );
        return;
      }
      setStatements((current) =>
        markOfficeStatementSent({
          statements: current,
          statementId: selected.id,
          payload: {
            sendRecordId: apiResult.sendRecordId,
            channel: sendChannel,
            sentTo,
            operatorName: currentUser.displayName,
            remark: currentUser.displayName + " 在对账 / 收款页标记发送。",
          },
        }),
      );
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast("已通过" + sourceLabel + "记录对账发送渠道、发送人和发送时间。");
      return;
    }

    if (action === "标记已读回执") {
      if (!selected.sent || !selected.sendRecordId) {
        setToast("当前对账单还没有发送记录，不能登记客户已读回执。");
        return;
      }
      const apiResult = await recordOfficeStatementSendReceipt({
        authState,
        statement: selected,
        operatorId: currentUserId,
        receiptStatus: "read",
        remark: currentUser.displayName + " 在对账 / 收款页登记客户已读回执。",
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? "后端拒绝登记回执：缺少权限 " + apiResult.error.requiredPermission + "。"
            : "后端拒绝登记回执：" + (apiResult.error?.message ?? "未知错误"),
        );
        return;
      }
      setStatements((current) =>
        recordStatementSendReceipt(current, selected.id, {
          receiptStatus: apiResult.receiptStatus || "read",
          receiptAt: apiResult.receiptAt,
          operatorName: currentUser.displayName,
          remark: currentUser.displayName + " 在对账 / 收款页登记客户已读回执。",
        }),
      );
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast("已通过" + sourceLabel + "登记客户已读回执。");
      return;
    }

    if (action === "登记客户确认") {
      if (!selected.sent || !selected.sendRecordId) {
        setToast("当前对账单还没有发送记录，不能登记客户确认。");
        return;
      }
      openModal({ type: "customerConfirmation", statementId: selected.id });
      return;
    }

    if (action === "差额待确认") {
      if (blockingAmount <= 0 && selected.received >= selected.receivable) {
        setToast("当前没有差额，无需进入差额处理。");
        return;
      }
      openModal({ type: "variance", statementId: selected.id });
      return;
    }

    if (action === "确认核销") {
      const blocker = getStatementWriteOffBlocker(selected, blockingAmount);
      if (blocker) {
        setToast(blocker);
        return;
      }
      const apiResult = await writeOffOfficeStatement({
        authState,
        statement: selected,
        operatorId: currentUserId,
        confirmReason: currentUser.displayName + " 确认核销 / 欠款状态。",
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? "后端拒绝确认核销：缺少权限 " + apiResult.error.requiredPermission + "。"
            : "后端拒绝确认核销：" + (apiResult.error?.message ?? "未知错误"),
        );
        return;
      }
      const result = confirmOfficeStatementWriteOff({ statements, statement: selected, blockingAmount });
      setStatements(result.statements);
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast("已通过" + sourceLabel + "记录：" + result.toast.replace("办公室A", currentUser.displayName));
      return;
    }

    setToast(action + " 已模拟完成；正式 Excel 样式等拿到模板后适配。");
  }

  async function refreshStatementExportRecords(statement) {
    const listResult = await listOfficeStatementExports({
      authState,
      statement,
      operatorId: currentUserId,
    });
    if (!listResult.blocked) {
      setStatements((current) => syncStatementExportRecords(current, statement, listResult.items, {
        source: listResult.source === "api" ? "后端 API 文件" : "本地记录",
      }));
    }
    return listResult;
  }

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
            description={activeMeta.description}
            contextLabel={authSourceLabel}
            onRefresh={refreshActivePage}
          />
          {activePage === "todos" && <TodoPage todos={todos} todoMeta={todoMeta} printBatchRecords={printBatchRecords} selectedTodoId={selectedTodoId} onSelect={setSelectedTodoId} view={todoView} setView={setTodoView} onAction={handleTodo} helpers={pageHelpers} />}
          {activePage === "entry" && (
            <EntryPage
              entryText={entryText}
              setEntryText={setEntryText}
              draftRows={draftRows}
              draftStatus={draftStatus}
              selectedDraftId={selectedDraftId}
              setSelectedDraftId={setSelectedDraftId}
              onRecognize={recognize}
              onDraftFieldChange={updateDraftField}
              onDraftCommand={handleDraftCommand}
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
              inventoryCorrectionQueueState={inventoryCorrectionQueueState}
              selectedStockId={selectedStockId}
              setSelectedStockId={setSelectedStockId}
              setToast={setToast}
              onCreateCorrectionDraft={handleInventoryCorrectionDraft}
              onLinkCorrectionAttachment={handleInventoryCorrectionAttachment}
              onConfirmCorrectionDraft={handleInventoryCorrectionConfirm}
              onOpenCorrectionDraft={openInventoryCorrectionDetail}
              onRefreshCorrectionQueue={(options) => refreshInventoryCorrectionQueue(options).then((result) => {
                if (result?.feedback) setToast(result.feedback);
                return result;
              })}
              onRefreshInventoryLedger={(options) => refreshInventoryLedgerEntries(options).then((result) => {
                if (result?.feedback) setToast(result.feedback);
                return result;
              })}
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
              onRefreshPrintDriverConfig={() => {
                void Promise.all([
                  refreshPrintDriverConfig({ showToast: false }),
                  refreshPrintDriverCupsDiagnostics({ showToast: false }),
                ]).then(() => {
                  setToast("打印驱动诊断和 CUPS 队列预检已刷新。");
                });
              }}
              onRefreshPrintDriverReadiness={() => refreshPrintDriverReadiness({ showToast: true })}
              onRefreshPrinterDeviceQa={() => refreshPrinterDeviceQa({ showToast: true })}
              onSelectPrinterDeviceQaDevice={selectPrinterDeviceQaDevice}
              onChangePrinterDeviceQaField={changePrinterDeviceQaField}
              onChangePrinterDeviceQaCheck={changePrinterDeviceQaCheck}
              onChangePrinterDeviceQaEvidenceField={changePrinterDeviceQaEvidenceField}
              onSavePrinterDeviceMode={savePrinterDeviceMode}
              onSavePrinterDeviceQa={savePrinterDeviceQaRecord}
              onRefreshPrintJobs={() => refreshOfficePrintJobQueue({ showToast: true })}
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
              employeeAccountReviews={masterDataEmployeeAccountReviews}
              importReviewDrafts={masterDataImportReviewDrafts}
              importExecutions={masterDataImportExecutions}
              maintenanceDrafts={masterDataMaintenanceDrafts}
              selectedTab={masterDataMaintenanceTab}
              setSelectedTab={setMasterDataMaintenanceTab}
              selectedId={selectedMasterDataId}
              setSelectedId={setSelectedMasterDataId}
              onSaveDraft={saveMasterDataMaintenanceDraft}
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
