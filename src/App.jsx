import { useEffect, useState } from "react";
import {
  BellOutlined,
  DownloadOutlined,
  DownOutlined,
  MenuFoldOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
  UserOutlined,
} from "@ant-design/icons";
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
  V1StatusPage,
  DriverMobilePage,
  WorkshopMobilePage,
} from "./pages/office/index.jsx";
import {
  allNavigationItems,
  isNavigationPageVisible,
  primaryNavigationItems,
} from "./app/navigation.js";
import { AppNavigation } from "./app/AppNavigation.jsx";
import { useOfficeInteractionController } from "./app/useOfficeInteractionController.js";
import { useOfficeWorkspace } from "./app/useOfficeWorkspace.js";
import { WorkspaceNotice, WorkspacePageHeader } from "./shared/ui/operational.jsx";
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
  createDeliveryEvidenceAttachmentInput,
  createOfficeAttachment,
  createV1FieldEvidenceAttachmentInput,
  createV1FieldEvidenceAttachmentListInput,
  createV1SignoffBoundaryAttachmentInput,
  createV1SignoffBoundaryAttachmentListInput,
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
  confirmOfficeRawMaterialSupplierStatement,
  confirmOfficeRawMaterialSupplierStatementReview,
  confirmOfficeRawMaterialSupplierPayment,
  createOfficeRawMaterialSupplierStatementReviewDraft,
  generateOfficeRawMaterialSupplierPayableDraft,
  updateOfficeRawMaterialInboundAction,
} from "./services/officeRawMaterialApiClient.js";
import {
  getOfficePrintDriverCupsDiagnostics,
  getOfficePrintDriverSpoolDiagnostics,
  getOfficePrintDriverV1Readiness,
} from "./services/officePrintDriverConfigApiClient.js";
import {
  applyOfficeV1ProductionFirstStageValues,
  generateOfficeV1FieldEvidenceDraftManifest,
  precheckOfficeV1AttachmentRetention,
  precheckOfficeV1DriverReadiness,
  precheckOfficeV1Persistence,
  precheckOfficeV1ProductionEnv,
  precheckOfficeV1ProductionEnvIntake,
  precheckOfficeV1ProductionEnvFileAudit,
  precheckOfficeV1ProductionEnvFilePreview,
  precheckOfficeV1ProductionFirstStageValuesDryRun,
  precheckOfficeV1ProductionGoLive,
  precheckOfficeV1ReleaseCandidateRefresh,
  precheckOfficeV1RuntimeReadiness,
  precheckOfficeV1V2Boundary,
  refreshOfficeV1V2ScopeBrief,
  refreshOfficeV1ReleaseCandidate,
  runOfficeV1ProductionEnvSetup,
  runOfficeV1ProductionFirstStageExecution,
  runOfficeV1ProductionPersistenceEvidence,
  stageOfficeV1FieldEvidenceIntakeRow,
  validateOfficeV1FieldEvidenceDraftManifest,
} from "./services/officeV1GoLiveStatusApiClient.js";
import {
  createPrinterDeviceFieldTestChecks,
  createPrinterDeviceFieldTestEvidence,
  normalizePrinterDeviceFieldTestEvidence,
  normalizePrinterDeviceFieldTestChecks,
} from "./services/printerDeviceFieldTestClient.js";
import {
  completeDriverDeliveryTask,
  confirmDriverDeliveryLoaded,
  getDriverLoadPackageCheckState,
  recordDriverDeviceFieldTest,
  reportDriverDeliveryException,
} from "./services/driverMobileApiClient.js";
import {
  createWatermarkedDeliveryImageDataUrl,
  estimateDataUrlByteSize,
  getWatermarkedDeliveryFileName,
} from "./services/driverWatermarkImageClient.js";
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
  batchPrintResultOptions,
  getOfficeModalInitialNumberValue,
  getOfficeModalInitialReason,
  officeModalReasonOptions,
  officeModalTitles,
  printVoidReasonOptions,
} from "./state/officeModalActions.js";
import {
  canRevokeEmployeePassword,
  formatCompactDateTime,
  getEmployeePasswordStatusLabel,
  getEmployeeReviewRowTone,
  getMasterDataExecutionFailedRows,
  getMasterDataExecutionTone,
  getMasterDataFailedRowFields,
  getMasterDataFailedRowKey,
  getMasterDataPrecheckTone,
  hasCommittedMasterDataImportExecution,
  normalizeMasterDataFailedRowValues,
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
import { buildFulfillmentPrintTemplate } from "./domain/printTemplates.js";
import { getProductionPackingFocusFromLedgerEntry } from "./domain/productionPackingSourceFocus.js";
import {
  MASTER_DATA_IMPORT_CONTENT_TYPE,
  buildMasterDataImportTemplateMetadata,
  buildMasterDataImportTemplateWorkbook,
  getMasterDataImportTemplateDefinitions,
  getMasterDataImportTemplateSets,
  getMasterDataImportTemplateSummary,
} from "./domain/masterDataImportTemplate.js";
import { precheckMasterDataImportWorkbook } from "./domain/masterDataImportPrecheck.js";
import {
  canCreateMasterDataImportReviewDraft,
  createMasterDataImportReviewDraft,
  getMasterDataImportReviewDraftSummary,
} from "./domain/masterDataImportReviewQueue.js";
import {
  canCreateMasterDataImportConfirmationPlan,
  getMasterDataImportConfirmationPlanSummary,
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
  varianceHandlingOptions,
} from "./domain/officeRules.js";

const orderQuantityReasonOptions = ["客户改量", "识别数量修正", "库存复核后改量", "办公室修正数量", "管理批准改量", "其他原因改量"];
const orderVoidReasonOptions = ["客户取消订单", "重复订单作废", "识别错误作废", "库存不足取消", "管理拒绝接单", "订单改量作废重建", "客户拒绝等待取消", "其他原因作废"];
const driverDispatchOptions = [
  { driverId: "U-DRIVER-A", name: "司机A" },
];

const officeScenarioData = loadOfficeWorkspace();
const {
  scenario: activeScenario,
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
const evidenceAttachmentAccept = "image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt";

function formatFileSize(size) {
  const bytes = Number(size || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatAttachmentAccessTime(value) {
  if (!value) return "时间未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getAttachmentAccessActionLabel(action) {
  const labels = {
    attachment_access_url_created: "生成访问地址",
    attachment_content_read: "读取内容",
  };
  return labels[action] ?? action ?? "访问";
}

function getAttachmentAccessModeLabel(record) {
  if (record?.accessMode === "signed_url") return "签名链接";
  if (record?.accessMode === "permission") return "权限读取";
  if (record?.deliveryMode === "object_storage_signed_url") return "对象存储直连";
  return record?.deliveryMode || "访问方式未记录";
}

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

function buildDriverDeliveryWatermarkMetadata({ task, operatorId, operatorName, locationLabel = "", geoPoint = "", capturedAt = new Date() }) {
  const capturedAtIso = capturedAt instanceof Date ? capturedAt.toISOString() : new Date(capturedAt).toISOString();
  const stamp = capturedAtIso.replace(/[-:T.Z]/g, "").slice(0, 14);
  const taskToken = String(task?.fulfillmentId || task?.orderLineId || "TASK").replace(/[^A-Za-z0-9]/g, "").slice(-8) || "TASK";
  const watermarkId = `WM-${stamp}-${taskToken}`;
  const orderRef = task?.orderTail || task?.orderLineId || task?.fulfillmentId || "";
  const safeLocationLabel = String(locationLabel || task?.addressArea || "定位待补").trim();
  const safeGeoPoint = String(geoPoint || "").trim();
  const address = String(task?.address || "").trim();
  const driverName = String(operatorName || operatorId || "").trim();
  const watermarkText = [
    task?.customerName ? `${task.customerName} ${orderRef}` : orderRef,
    task?.deliveryNoteNo ? `单据 ${task.deliveryNoteNo}` : "",
    address ? `地址 ${address}` : "",
    driverName ? `司机 ${driverName}` : "",
    `时间 ${capturedAtIso}`,
    `定位 ${[safeLocationLabel, safeGeoPoint].filter(Boolean).join(" / ")}`,
    `水印 ${watermarkId}`,
  ]
    .filter(Boolean)
    .join(" / ");

  return {
    watermarkId,
    watermarkText,
    watermarkCapturedAt: capturedAtIso,
    watermarkLocationLabel: safeLocationLabel,
    watermarkGeoPoint: safeGeoPoint,
    watermarkAddress: address,
    watermarkOperatorId: operatorId,
    watermarkOperatorName: driverName,
    watermarkOrderRef: orderRef,
    deliveryNoteNo: task?.deliveryNoteNo || "",
    fulfillmentId: task?.fulfillmentId || "",
  };
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

function isInlineImageAttachment(attachment = {}) {
  const contentType = String(attachment.contentType || attachment.mimeType || "").toLowerCase();
  const dataUrl = String(attachment.previewDataUrl || "").toLowerCase();
  return contentType.startsWith("image/") || dataUrl.startsWith("data:image/");
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
    loadInventoryCorrectionDetail, createInventoryCorrectionDraft, confirmInventoryCorrectionDraft,
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
    initialToast: `P0 原型已载入：${activeScenario.name}。`,
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

  async function generateV1FieldEvidenceDraftManifest() {
    setV1FieldEvidenceDraftAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await generateOfficeV1FieldEvidenceDraftManifest({
      authState,
      operatorId: currentUserId,
    });
    setV1FieldEvidenceDraftAction({
      loading: false,
      error: result.error?.message || "",
      result: result.draftResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.draftResult) {
      const statusLabel = result.draftResult.statusLabel || "草稿已处理";
      const evidenceProgress = result.draftResult.summary?.evidenceProgress || "0/34";
      const signoffProgress = result.draftResult.summary?.signoffProgress || "0/6";
      const suffix = result.blocked
        ? result.error?.requiredPermission
          ? `缺少权限 ${result.error.requiredPermission}`
          : result.error?.message || "仍需修正 CSV"
        : `证据 ${evidenceProgress}，签字 ${signoffProgress}`;
      setToast(`现场证据 manifest 草稿：${statusLabel}；${suffix}。`);
    } else {
      setToast(`现场证据 manifest 草稿生成失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function validateV1FieldEvidenceDraftManifest() {
    setV1FieldEvidenceValidationAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await validateOfficeV1FieldEvidenceDraftManifest({
      authState,
      operatorId: currentUserId,
    });
    setV1FieldEvidenceValidationAction({
      loading: false,
      error: result.error?.message || "",
      result: result.validationResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.validationResult) {
      const statusLabel = result.validationResult.statusLabel || "校验完成";
      const evidenceProgress = result.validationResult.summary?.evidenceProgress || "0/34";
      const signoffProgress = result.validationResult.summary?.signoffProgress || "0/6";
      const suffix = result.blocked
        ? result.error?.requiredPermission
          ? `缺少权限 ${result.error.requiredPermission}`
          : result.error?.message || "草稿需修正"
        : `证据 ${evidenceProgress}，签字 ${signoffProgress}`;
      setToast(`现场证据 manifest 草稿校验：${statusLabel}；${suffix}。`);
    } else {
      setToast(`现场证据 manifest 草稿校验失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function precheckV1ProductionEnv() {
    setV1ProductionEnvPrecheckAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await precheckOfficeV1ProductionEnv({
      authState,
      operatorId: currentUserId,
    });
    setV1ProductionEnvPrecheckAction({
      loading: false,
      error: result.error?.message || "",
      result: result.precheckResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.precheckResult) {
      const statusLabel = result.precheckResult.statusLabel || "预检完成";
      const readinessLabel = result.precheckResult.summary?.readinessLabel || "0/10";
      const blockerLabel = result.precheckResult.summary?.blockerLabel || "0 项";
      setToast(`当前生产 env 预检：${statusLabel}；通过 ${readinessLabel}，阻塞 ${blockerLabel}。`);
    } else {
      setToast(`当前生产 env 预检失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function runV1ProductionEnvSetup() {
    setV1ProductionEnvSetupAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await runOfficeV1ProductionEnvSetup({
      authState,
      operatorId: currentUserId,
    });
    setV1ProductionEnvSetupAction({
      loading: false,
      error: result.error?.message || "",
      result: result.setupResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.setupResult) {
      const statusLabel = result.setupResult.statusLabel || "setup 完成";
      const envPreflightLabel = result.setupResult.summary?.envPreflightLabel || "0/0";
      const remainingFixItemCount = result.setupResult.summary?.remainingFixItemCount ?? 0;
      setToast(`生产 env 安全草稿：${statusLabel}；env ${envPreflightLabel}，修正 ${remainingFixItemCount} 项。`);
    } else {
      setToast(`生产 env 安全草稿 setup 失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function precheckV1ProductionEnvIntake() {
    setV1ProductionEnvIntakePrecheckAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await precheckOfficeV1ProductionEnvIntake({
      authState,
      operatorId: currentUserId,
    });
    setV1ProductionEnvIntakePrecheckAction({
      loading: false,
      error: result.error?.message || "",
      result: result.precheckResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.precheckResult) {
      const statusLabel = result.precheckResult.statusLabel || "校验完成";
      const configuredLabel = result.precheckResult.summary?.configuredLabel || "0/0";
      const minimumBlockingLabel = result.precheckResult.summary?.minimumBlockingLabel || "0/0";
      const blockerLabel = result.precheckResult.summary?.blockerLabel || "0 项";
      setToast(`生产 env 真实值校验：${statusLabel}；清单 ${configuredLabel}，最小补值 ${minimumBlockingLabel}，阻塞 ${blockerLabel}。`);
    } else {
      setToast(`生产 env 真实值校验失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function precheckV1ProductionEnvFileAudit() {
    setV1ProductionEnvFileAuditPrecheckAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await precheckOfficeV1ProductionEnvFileAudit({
      authState,
      operatorId: currentUserId,
    });
    setV1ProductionEnvFileAuditPrecheckAction({
      loading: false,
      error: result.error?.message || "",
      result: result.precheckResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.precheckResult) {
      const statusLabel = result.precheckResult.statusLabel || "预检完成";
      const fileCount = result.precheckResult.summary?.configuredEnvFileCount ?? 0;
      const blockerLabel = result.precheckResult.summary?.blockingLabel || "0 项";
      const warningLabel = result.precheckResult.summary?.warningLabel || "0 项";
      setToast(`env 文件审计预检：${statusLabel}；配置文件 ${fileCount} 个，阻塞 ${blockerLabel}，警告 ${warningLabel}。`);
    } else {
      setToast(`env 文件审计预检失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function stageV1FieldEvidenceIntakeRow(row) {
    setV1FieldEvidenceStageRowAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await stageOfficeV1FieldEvidenceIntakeRow({
      authState,
      operatorId: currentUserId,
      row,
    });
    setV1FieldEvidenceStageRowAction({
      loading: false,
      error: result.error?.message || "",
      result: result.stageResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.stageResult) {
      const statusLabel = result.stageResult.statusLabel || "草稿已处理";
      const evidenceProgress = result.stageResult.summary?.evidenceProgress || "0/34";
      const signoffProgress = result.stageResult.summary?.signoffProgress || "0/6";
      const rowLabel = result.stageResult.summary?.rowLabel || "现场证据行";
      const suffix = result.blocked
        ? result.error?.requiredPermission
          ? `缺少权限 ${result.error.requiredPermission}`
          : result.error?.message || "草稿行需修正"
        : `证据 ${evidenceProgress}，签字 ${signoffProgress}`;
      setToast(`现场草稿行：${rowLabel} ${statusLabel}；${suffix}。`);
    } else {
      setToast(`现场草稿行保存失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function precheckV1RuntimeReadiness() {
    setV1RuntimeReadinessPrecheckAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await precheckOfficeV1RuntimeReadiness({
      authState,
      operatorId: currentUserId,
    });
    setV1RuntimeReadinessPrecheckAction({
      loading: false,
      error: result.error?.message || "",
      result: result.precheckResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.precheckResult) {
      const statusLabel = result.precheckResult.statusLabel || "预检完成";
      const readinessLabel = result.precheckResult.summary?.readinessLabel || "0/11";
      const blockerLabel = result.precheckResult.summary?.blockerLabel || "0 项";
      setToast(`当前运行时总门禁预检：${statusLabel}；通过 ${readinessLabel}，阻塞 ${blockerLabel}。`);
    } else {
      setToast(`当前运行时总门禁预检失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function precheckV1ProductionEnvFilePreview() {
    setV1ProductionEnvFilePreviewPrecheckAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await precheckOfficeV1ProductionEnvFilePreview({
      authState,
      operatorId: currentUserId,
    });
    setV1ProductionEnvFilePreviewPrecheckAction({
      loading: false,
      error: result.error?.message || "",
      result: result.precheckResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.precheckResult) {
      const statusLabel = result.precheckResult.statusLabel || "预检完成";
      const readinessLabel = result.precheckResult.summary?.readinessLabel || "0/10";
      const blockerLabel = result.precheckResult.summary?.blockerLabel || "0 项";
      const appliedLabel = result.precheckResult.summary?.appliedInMemory ? "已做内存预检" : "未读取变量";
      setToast(`env 文件应用预检：${statusLabel}；通过 ${readinessLabel}，阻塞 ${blockerLabel}，${appliedLabel}。`);
    } else {
      setToast(`env 文件应用预检失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function precheckV1ProductionGoLive() {
    setV1ProductionGoLivePrecheckAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await precheckOfficeV1ProductionGoLive({
      authState,
      operatorId: currentUserId,
    });
    setV1ProductionGoLivePrecheckAction({
      loading: false,
      error: result.error?.message || "",
      result: result.precheckResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.precheckResult) {
      const statusLabel = result.precheckResult.statusLabel || "预检完成";
      const readinessLabel = result.precheckResult.summary?.readinessLabel || "0/4";
      const blockerLabel = result.precheckResult.summary?.blockerLabel || "0 项";
      setToast(`生产上线组合预检：${statusLabel}；阶段 ${readinessLabel}，阻塞 ${blockerLabel}。`);
    } else {
      setToast(`生产上线组合预检失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function precheckV1ProductionFirstStageValuesDryRun() {
    setV1ProductionFirstStageValuesDryRunAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await precheckOfficeV1ProductionFirstStageValuesDryRun({
      authState,
      operatorId: currentUserId,
    });
    setV1ProductionFirstStageValuesDryRunAction({
      loading: false,
      error: result.error?.message || "",
      result: result.precheckResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.precheckResult) {
      const statusLabel = result.precheckResult.statusLabel || "预检完成";
      const minimumBlockingLabel = result.precheckResult.dryRunCoverage?.minimumBlockingLabel || "0/0";
      const envPreflightLabel = result.precheckResult.dryRunCoverage?.envPreflightLabel || "0/0";
      const configuredLabel = result.precheckResult.summary?.valuesFilePathConfigured ? "片段已配置" : "片段未配置";
      setToast(`第一阶段真实值 dry-run：${statusLabel}；${configuredLabel}，最小补值 ${minimumBlockingLabel}，预计 env ${envPreflightLabel}。`);
    } else {
      setToast(`第一阶段真实值 dry-run 失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function runV1ProductionFirstStageExecution() {
    setV1ProductionFirstStageExecutionAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await runOfficeV1ProductionFirstStageExecution({
      authState,
      operatorId: currentUserId,
    });
    setV1ProductionFirstStageExecutionAction({
      loading: false,
      error: result.error?.message || "",
      result: result.executionResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.executionResult) {
      const statusLabel = result.executionResult.statusLabel || "执行完成";
      const passedLabel = result.executionResult.summary?.passedLabel || "0/0";
      const blockerLabel = result.executionResult.summary?.blockerLabel || "0 项";
      setToast(`第一阶段执行：${statusLabel}；步骤 ${passedLabel}，阻塞 ${blockerLabel}。`);
    } else {
      setToast(`第一阶段执行失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function runV1ProductionPersistenceEvidence() {
    setV1ProductionPersistenceEvidenceAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await runOfficeV1ProductionPersistenceEvidence({
      authState,
      operatorId: currentUserId,
    });
    setV1ProductionPersistenceEvidenceAction({
      loading: false,
      error: result.error?.message || "",
      result: result.evidenceResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.evidenceResult) {
      const statusLabel = result.evidenceResult.statusLabel || "执行完成";
      const passedLabel = result.evidenceResult.summary?.passedLabel || "0/0";
      const blockerLabel = result.evidenceResult.summary?.blockerLabel || "0 项";
      setToast(`生产持久化留证：${statusLabel}；阶段 ${passedLabel}，阻塞 ${blockerLabel}。`);
    } else {
      setToast(`生产持久化留证失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function applyV1ProductionFirstStageValues() {
    setV1ProductionFirstStageValuesApplyAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await applyOfficeV1ProductionFirstStageValues({
      authState,
      operatorId: currentUserId,
    });
    setV1ProductionFirstStageValuesApplyAction({
      loading: false,
      error: result.error?.message || "",
      result: result.applyResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.applyResult) {
      const statusLabel = result.applyResult.statusLabel || "执行完成";
      const enabledLabel = result.applyResult.summary?.applyEnabled ? "开关已启用" : "开关未启用";
      const appliedCount = result.applyResult.summary?.appliedVariableCount ?? 0;
      const envPreflightLabel = result.applyResult.summary?.envPreflightLabel || "0/0";
      setToast(`第一阶段真实值正式合并：${statusLabel}；${enabledLabel}，写入变量 ${appliedCount}，env ${envPreflightLabel}。`);
    } else {
      setToast(`第一阶段真实值正式合并失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function precheckV1Persistence() {
    setV1PersistencePrecheckAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await precheckOfficeV1Persistence({
      authState,
      operatorId: currentUserId,
    });
    setV1PersistencePrecheckAction({
      loading: false,
      error: result.error?.message || "",
      result: result.precheckResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.precheckResult) {
      const statusLabel = result.precheckResult.statusLabel || "预检完成";
      const readinessLabel = result.precheckResult.summary?.readinessLabel || "0/7";
      const repositoryLabel = result.precheckResult.summary?.repositoryLabel || "0/0";
      const localLabel = result.precheckResult.summary?.localRepositoryLabel || "0 个";
      setToast(`系统持久化预检：${statusLabel}；通过 ${readinessLabel}，生产仓储 ${repositoryLabel}，本地 ${localLabel}。`);
    } else {
      setToast(`系统持久化预检失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function precheckV1AttachmentRetention() {
    setV1AttachmentRetentionPrecheckAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await precheckOfficeV1AttachmentRetention({
      authState,
      operatorId: currentUserId,
    });
    setV1AttachmentRetentionPrecheckAction({
      loading: false,
      error: result.error?.message || "",
      result: result.precheckResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.precheckResult) {
      const statusLabel = result.precheckResult.statusLabel || "预检完成";
      const readinessLabel = result.precheckResult.summary?.readinessLabel || "0/5";
      const storageLabel = result.precheckResult.summary?.storageKindLabel || "未知";
      const objectStorageLabel = result.precheckResult.summary?.objectStorageLive ? "是" : "否";
      const cleanupLabel = result.precheckResult.summary?.diagnosticObjectCleanedUp ? "是" : "否";
      setToast(`附件留档预检：${statusLabel}；通过 ${readinessLabel}，存储 ${storageLabel}，对象存储 ${objectStorageLabel}，清理 ${cleanupLabel}。`);
    } else {
      setToast(`附件留档预检失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function precheckV1PrintSpool() {
    setV1PrintSpoolPrecheckAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await getOfficePrintDriverSpoolDiagnostics({
      authState,
      operatorId: currentUserId,
    });
    setV1PrintSpoolPrecheckAction({
      loading: false,
      error: result.error?.message || "",
      result: result.diagnostics,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.diagnostics) {
      const statusLabel = result.diagnostics.ready ? "已通过" : "仍未通过";
      const writeLabel = result.diagnostics.writeOk ? "是" : "否";
      const pendingLabel = result.diagnostics.pendingPollOk ? "是" : "否";
      const completedLabel = result.diagnostics.completedPollOk ? "是" : "否";
      const cleanupLabel = result.diagnostics.cleanupOk ? "是" : "否";
      setToast(`打印 spool 预检：${statusLabel}；写入 ${writeLabel}，待打回读 ${pendingLabel}，完成回读 ${completedLabel}，清理 ${cleanupLabel}。`);
    } else {
      setToast(`打印 spool 预检失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function precheckV1PrintCups() {
    setV1PrintCupsPrecheckAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await getOfficePrintDriverCupsDiagnostics({
      authState,
      operatorId: currentUserId,
    });
    setV1PrintCupsPrecheckAction({
      loading: false,
      error: result.error?.message || "",
      result: result.diagnostics,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.diagnostics) {
      const statusLabel = result.diagnostics.ready ? "已通过" : "仍未通过";
      const printerLabel = result.diagnostics.cupsPrinterConfigured ? "是" : "否";
      const allowLabel = result.diagnostics.cupsPrinterAllowed ? "是" : "否";
      const commandLabel = result.diagnostics.cupsStatusCommandRunnable ? "是" : "否";
      setToast(`CUPS 队列预检：${statusLabel}；队列配置 ${printerLabel}，白名单 ${allowLabel}，状态命令 ${commandLabel}。`);
    } else {
      setToast(`CUPS 队列预检失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function precheckV1PrintReadiness() {
    setV1PrintReadinessPrecheckAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await getOfficePrintDriverV1Readiness({
      authState,
      operatorId: currentUserId,
    });
    setV1PrintReadinessPrecheckAction({
      loading: false,
      error: result.error?.message || "",
      result: result.readiness,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.readiness) {
      const statusLabel = result.readiness.ready ? "已通过" : "仍未通过";
      const summaryLabel = result.readiness.summary?.label || "0/0 通过";
      const blockingLabel = `${result.readiness.summary?.blockingCount ?? 0} 项阻塞`;
      const deviceReadyCount = Array.isArray(result.readiness.deviceReadiness)
        ? result.readiness.deviceReadiness.filter((item) => item.ready).length
        : 0;
      const deviceTotal = Array.isArray(result.readiness.deviceReadiness)
        ? result.readiness.deviceReadiness.length
        : 0;
      setToast(`打印 V1 门禁预检：${statusLabel}；${summaryLabel}，${blockingLabel}，设备 ${deviceReadyCount}/${deviceTotal}。`);
    } else {
      setToast(`打印 V1 门禁预检失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function precheckV1DriverReadiness() {
    setV1DriverReadinessPrecheckAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await precheckOfficeV1DriverReadiness({
      authState,
      operatorId: currentUserId,
    });
    setV1DriverReadinessPrecheckAction({
      loading: false,
      error: result.error?.message || "",
      result: result.precheckResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.precheckResult) {
      const statusLabel = result.precheckResult.statusLabel || "预检完成";
      const readinessLabel = result.precheckResult.summary?.readinessLabel || "0/6";
      const blockerLabel = result.precheckResult.summary?.blockerLabel || "0 项";
      const nativeLabel = result.precheckResult.summary?.nativeSupportedLabel || "0/2";
      const taskCount = result.precheckResult.summary?.deliveryTaskCount ?? 0;
      setToast(`司机真机门禁预检：${statusLabel}；通过 ${readinessLabel}，阻塞 ${blockerLabel}，原生 ${nativeLabel}，任务 ${taskCount} 条。`);
    } else {
      setToast(`司机真机门禁预检失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function uploadV1FieldEvidenceAttachment({ evidenceItem, file, remark = "" }) {
    setV1FieldEvidenceAttachmentAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const contentDataUrl = await readFileAsDataUrl(file);
    const attachmentInput = createV1FieldEvidenceAttachmentInput({
      evidenceItem,
      operatorId: currentUserId,
      remark,
      file: file
        ? {
            name: file.name,
            type: file.type,
            size: file.size,
            contentDataUrl,
          }
        : null,
    });
    const result = await createOfficeAttachment({
      authState,
      ...attachmentInput,
    });
    const backendAttachmentRegistered = result.source === "api" && /^ATT-/.test(result.attachment?.attachmentId || "");
    const normalizedResult = backendAttachmentRegistered
      ? {
          source: result.source,
          attachment: result.attachment,
          blocked: false,
          error: null,
        }
      : {
          source: result.source,
          attachment: result.attachment ?? null,
          blocked: true,
          error: result.error ?? {
            code: "V1_FIELD_EVIDENCE_ATTACHMENT_NOT_BACKEND_REGISTERED",
            message: "证据附件必须由后端登记为 ATT-* 后，才能写入 V1 现场证据草稿。",
          },
        };
    setV1FieldEvidenceAttachmentAction({
      loading: false,
      error: normalizedResult.error?.message || "",
      result: !normalizedResult.blocked && normalizedResult.attachment
        ? {
            attachmentId: normalizedResult.attachment.attachmentId,
            fileName: normalizedResult.attachment.fileName,
            status: normalizedResult.attachment.status,
            ownerId: normalizedResult.attachment.ownerId,
          }
        : null,
      lastSyncedAt: new Date().toISOString(),
    });
    if (normalizedResult.attachment && !normalizedResult.blocked) {
      setToast(`现场证据附件已登记：${normalizedResult.attachment.attachmentId}，可写入证据草稿。`);
    } else {
      setToast(`现场证据附件登记失败：${normalizedResult.error?.message || "API 不可用"}。`);
    }
    return normalizedResult;
  }

  async function listV1FieldEvidenceAttachments({ evidenceItem }) {
    setV1FieldEvidenceAttachmentListAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const listInput = createV1FieldEvidenceAttachmentListInput({
      evidenceItem,
      operatorId: currentUserId,
    });
    const result = await listOfficeAttachments({
      authState,
      ...listInput,
    });
    const backendItems = result.source === "api"
      ? (result.items || []).filter((item) => /^ATT-/.test(item.attachmentId || ""))
      : [];
    const normalizedResult = result.source === "api"
      ? {
          source: result.source,
          blocked: false,
          ownerId: listInput.ownerId,
          items: backendItems,
          total: Number.isFinite(result.total) ? result.total : backendItems.length,
          error: null,
        }
      : {
          source: result.source,
          blocked: true,
          ownerId: listInput.ownerId,
          items: [],
          total: 0,
          error: result.error ?? {
            code: "V1_FIELD_EVIDENCE_ATTACHMENT_LIST_NOT_BACKEND_REGISTERED",
            message: "证据附件列表必须从后端 API 读取，不能使用本地附件降级结果。",
          },
        };
    setV1FieldEvidenceAttachmentListAction({
      loading: false,
      error: normalizedResult.error?.message || "",
      ownerId: normalizedResult.ownerId,
      result: !normalizedResult.blocked
        ? {
            ownerId: normalizedResult.ownerId,
            total: normalizedResult.total,
            items: normalizedResult.items.slice(0, 5).map((item) => ({
              attachmentId: item.attachmentId,
              fileName: item.fileName,
              status: item.status,
              fileType: item.fileType,
              createdAt: item.createdAt,
              hasContent: item.hasContent === true,
            })),
          }
        : null,
      lastSyncedAt: new Date().toISOString(),
    });
    if (!normalizedResult.blocked) {
      setToast(`现场证据附件已查询：${backendItems.length} 个可复用后端附件。`);
    } else {
      setToast(`现场证据附件查询失败：${normalizedResult.error?.message || "API 不可用"}。`);
    }
    return normalizedResult;
  }

  async function uploadV1SignoffBoundaryAttachment({ signoffItem, file, remark = "" }) {
    setV1SignoffBoundaryAttachmentAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const contentDataUrl = await readFileAsDataUrl(file);
    const attachmentInput = createV1SignoffBoundaryAttachmentInput({
      signoffItem,
      operatorId: currentUserId,
      remark,
      file: file
        ? {
            name: file.name,
            type: file.type,
            size: file.size,
            contentDataUrl,
          }
        : null,
    });
    const result = await createOfficeAttachment({
      authState,
      ...attachmentInput,
    });
    const backendAttachmentRegistered = result.source === "api" && /^ATT-/.test(result.attachment?.attachmentId || "");
    const normalizedResult = backendAttachmentRegistered
      ? {
          source: result.source,
          attachment: result.attachment,
          blocked: false,
          error: null,
        }
      : {
          source: result.source,
          attachment: result.attachment ?? null,
          blocked: true,
          error: result.error ?? {
            code: "V1_SIGNOFF_BOUNDARY_ATTACHMENT_NOT_BACKEND_REGISTERED",
            message: "签字 / 边界附件必须由后端登记为 ATT-* 后，才能作为 V1 留档引用。",
          },
        };
    setV1SignoffBoundaryAttachmentAction({
      loading: false,
      error: normalizedResult.error?.message || "",
      result: !normalizedResult.blocked && normalizedResult.attachment
        ? {
            attachmentId: normalizedResult.attachment.attachmentId,
            fileName: normalizedResult.attachment.fileName,
            status: normalizedResult.attachment.status,
            ownerId: normalizedResult.attachment.ownerId,
          }
        : null,
      lastSyncedAt: new Date().toISOString(),
    });
    if (normalizedResult.attachment && !normalizedResult.blocked) {
      setToast(`签字 / 边界附件已登记：${normalizedResult.attachment.attachmentId}，可填入备注留档。`);
    } else {
      setToast(`签字 / 边界附件登记失败：${normalizedResult.error?.message || "API 不可用"}。`);
    }
    return normalizedResult;
  }

  async function listV1SignoffBoundaryAttachments({ signoffItem }) {
    setV1SignoffBoundaryAttachmentListAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const listInput = createV1SignoffBoundaryAttachmentListInput({
      signoffItem,
      operatorId: currentUserId,
    });
    const result = await listOfficeAttachments({
      authState,
      ...listInput,
    });
    const backendItems = result.source === "api"
      ? (result.items || []).filter((item) => /^ATT-/.test(item.attachmentId || ""))
      : [];
    const normalizedResult = result.source === "api"
      ? {
          source: result.source,
          blocked: false,
          ownerId: listInput.ownerId,
          items: backendItems,
          total: Number.isFinite(result.total) ? result.total : backendItems.length,
          error: null,
        }
      : {
          source: result.source,
          blocked: true,
          ownerId: listInput.ownerId,
          items: [],
          total: 0,
          error: result.error ?? {
            code: "V1_SIGNOFF_BOUNDARY_ATTACHMENT_LIST_NOT_BACKEND_REGISTERED",
            message: "签字 / 边界附件列表必须从后端 API 读取，不能使用本地附件降级结果。",
          },
        };
    setV1SignoffBoundaryAttachmentListAction({
      loading: false,
      error: normalizedResult.error?.message || "",
      ownerId: normalizedResult.ownerId,
      result: !normalizedResult.blocked
        ? {
            ownerId: normalizedResult.ownerId,
            total: normalizedResult.total,
            items: normalizedResult.items.slice(0, 5).map((item) => ({
              attachmentId: item.attachmentId,
              fileName: item.fileName,
              status: item.status,
              fileType: item.fileType,
              createdAt: item.createdAt,
              hasContent: item.hasContent === true,
            })),
          }
        : null,
      lastSyncedAt: new Date().toISOString(),
    });
    if (!normalizedResult.blocked) {
      setToast(`签字 / 边界附件已查询：${backendItems.length} 个可复用后端附件。`);
    } else {
      setToast(`签字 / 边界附件查询失败：${normalizedResult.error?.message || "API 不可用"}。`);
    }
    return normalizedResult;
  }

  async function precheckV1V2Boundary() {
    setV1V2BoundaryPrecheckAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await precheckOfficeV1V2Boundary({
      authState,
      operatorId: currentUserId,
    });
    setV1V2BoundaryPrecheckAction({
      loading: false,
      error: result.error?.message || "",
      result: result.precheckResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.precheckResult) {
      const statusLabel = result.precheckResult.statusLabel || "预检完成";
      const boundaryLabel = result.precheckResult.summary?.boundaryLabel || "待确认";
      const v1MustContinue = result.precheckResult.summary?.v1MustContinueLabel || "0 项";
      const v2Differences = result.precheckResult.summary?.v2DifferenceLabel || "0 项";
      const blockerLabel = result.precheckResult.summary?.blockerLabel || "0 项";
      setToast(`V1/V2 边界预检：${statusLabel}；边界 ${boundaryLabel}，V1 必做 ${v1MustContinue}，V2 差异 ${v2Differences}，阻塞 ${blockerLabel}。`);
    } else {
      setToast(`V1/V2 边界预检失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function refreshV1V2ScopeBrief() {
    setV1V2ScopeBriefRefreshAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await refreshOfficeV1V2ScopeBrief({
      authState,
      operatorId: currentUserId,
    });
    setV1V2ScopeBriefRefreshAction({
      loading: false,
      error: result.error?.message || "",
      result: result.refreshResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.refreshResult) {
      const statusLabel = result.refreshResult.statusLabel || "已刷新";
      const v1MustContinue = result.refreshResult.summary?.v1MustContinueLabel || "0 项";
      const v2Differences = result.refreshResult.summary?.v2DifferenceLabel || "0 项";
      const refreshed = result.refreshResult.summary?.scopeBriefRefreshed ? "已刷新" : "未刷新";
      setToast(`V1/V2 差异摘要：${statusLabel}；V1 必做 ${v1MustContinue}，V2 差异 ${v2Differences}，摘要 ${refreshed}。`);
    } else {
      setToast(`V1/V2 差异摘要刷新失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function precheckV1ReleaseCandidateRefresh() {
    setV1ReleaseCandidateRefreshPrecheckAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await precheckOfficeV1ReleaseCandidateRefresh({
      authState,
      operatorId: currentUserId,
    });
    setV1ReleaseCandidateRefreshPrecheckAction({
      loading: false,
      error: result.error?.message || "",
      result: result.precheckResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.precheckResult) {
      const statusLabel = result.precheckResult.statusLabel || "预检完成";
      const evidenceProgress = result.precheckResult.summary?.evidenceProgress || "0/34";
      const productionEnv = result.precheckResult.summary?.productionEnvPreflightLabel || "0/10";
      const blockerLabel = result.precheckResult.summary?.blockerLabel || "0 项";
      setToast(`刷新候选预检：${statusLabel}；证据 ${evidenceProgress}，生产 env ${productionEnv}，阻塞 ${blockerLabel}。`);
    } else {
      setToast(`刷新候选预检失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

  async function refreshV1ReleaseCandidate() {
    setV1ReleaseCandidateRefreshAction((current) => ({
      ...current,
      loading: true,
      error: "",
    }));
    const result = await refreshOfficeV1ReleaseCandidate({
      authState,
      operatorId: currentUserId,
    });
    setV1ReleaseCandidateRefreshAction({
      loading: false,
      error: result.error?.message || "",
      result: result.refreshResult,
      lastSyncedAt: new Date().toISOString(),
    });
    if (result.refreshResult) {
      const statusLabel = result.refreshResult.statusLabel || "刷新完成";
      const releaseLabel = result.refreshResult.summary?.releaseGateLabel || result.refreshResult.summary?.label || "发布候选";
      const blockerLabel = result.refreshResult.summary?.blockerLabel || "0 项";
      const refreshed = result.refreshResult.summary?.releaseCandidateRefreshed ? "已刷新" : "未刷新";
      setToast(`刷新候选：${statusLabel}；${releaseLabel}，阻塞 ${blockerLabel}，候选 ${refreshed}。`);
    } else {
      setToast(`刷新候选失败：${result.error?.message || "API 不可用"}。`);
    }
    await refreshV1GoLiveStatus({ showToast: false });
    return result;
  }

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

  async function updateRawMaterialInbound(action, inboundId, options = {}) {
    if (!guardUiAction("rawMaterial", action)) return;
    const target = rawMaterialInboundsRef.current.find((item) => item.id === inboundId);
    if (!target) {
      setToast(`未找到原材料入库单 ${inboundId}。`);
      return;
    }
    const now = new Date().toISOString();
    const operatorName = currentUser.displayName || currentUserId;
    const toastText = buildRawMaterialInboundToastText(action, target, options);
    const result = await updateOfficeRawMaterialInboundAction({
      authState,
      operatorId: currentUserId,
      operatorName,
      inboundId,
      action,
      rollId: options.rollId,
      reason: options.reason,
      machineId: options.machineId,
      productionTaskId: options.productionTaskId,
      issuePurpose: options.issuePurpose,
      issuedWeightKg: options.issuedWeightKg,
      issuedQuantity: options.issuedQuantity,
      consumedWeightKg: options.consumedWeightKg,
      consumedQuantity: options.consumedQuantity,
      leftoverWeightKg: options.leftoverWeightKg,
      leftoverQuantity: options.leftoverQuantity,
      returnLocation: options.returnLocation,
      reviewedWeightKg: options.reviewedWeightKg,
      reviewedQuantity: options.reviewedQuantity,
      reviewLocation: options.reviewLocation,
      machineCount: options.machineCount,
      qualifiedOutputQuantity: options.qualifiedOutputQuantity,
      note: options.note,
    });

    if (!result.blocked && result.inbound?.id) {
      setRawMaterialInbounds((current) =>
        current.map((item) => (item.id === inboundId ? result.inbound : item)),
      );
      setRawMaterialInboundMeta((current) => ({
        ...current,
        source: "api",
        error: "",
        lastSyncedAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      }));
      setSelectedRawMaterialInboundId(inboundId);
      setToast(toastText);
      return;
    }

    if (result.error?.requiredPermission || result.error?.status === 403) {
      setRawMaterialInboundMeta((current) => ({
        ...current,
        source: result.source,
        error: result.error?.message ?? "原材料入库动作 API 返回错误。",
      }));
      setToast(
        result.error?.requiredPermission
          ? `后端拒绝原材料动作：缺少权限 ${result.error.requiredPermission}。`
          : `后端拒绝原材料动作：${result.error?.message ?? "未知错误"}`,
      );
      return;
    }

    if (result.error?.status && result.error.status < 500) {
      setRawMaterialInboundMeta((current) => ({
        ...current,
        source: result.source,
        error: result.error?.message ?? "原材料入库动作 API 返回业务校验错误。",
      }));
      setToast(`后端拒绝原材料动作：${result.error?.message ?? "业务校验未通过"}`);
      return;
    }

    const localResult = applyRawMaterialInboundLocalAction(rawMaterialInboundsRef.current, {
      action,
      inboundId,
      options,
      now,
      operatorName,
    });
    setRawMaterialInbounds(localResult.items);
    setRawMaterialInboundMeta((current) => ({
      ...current,
      source: "local_fallback",
      error: result.error?.message ?? "",
      lastSyncedAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    }));
    setSelectedRawMaterialInboundId(inboundId);
    setToast(toastText);
  }

  function buildRawMaterialInboundToastText(action, target, options = {}) {
    const reference = formatRawMaterialInboundReference(target);
    if (action === "复核送货单") {
      return `已复核 ${reference}，下一步打印一卷一标；OCR 仍只作为预填证据。`;
    }
    if (action === "打印卷标") {
      return `已打印 ${reference} 的卷标；打印只是待贴标状态，不能直接作为可用库存。`;
    }
    if (action === "确认贴标入库") {
      return options.rollId
        ? `已确认 ${options.rollId} 贴标扫码并上传签单信息，可作为原材料可用库存。`
        : `已确认 ${reference} 全部贴标扫码，可作为原材料可用库存。`;
    }
    if (action === "机边领料") {
      const machine = options.machineId || "机边待分配";
      if (options.partialIssue) {
        return `已记录 ${options.rollId} 拆卷领料 ${options.issuedWeightKg}kg 到 ${machine}；剩余重量保留可用，仍不做成本分摊。`;
      }
      return options.rollId
        ? `已记录 ${options.rollId} 整卷/整件机边领料到 ${machine}；等待生产报工确认消耗。`
        : `已记录 ${reference} 可用卷/件机边领料到 ${machine}；不生成成品数量或成本分摊。`;
    }
    if (action === "确认消耗") {
      if (options.partialConsumption) {
        return `已确认 ${options.rollId} 部分消耗 ${options.consumedWeightKg}kg；剩余重量仍在机边，不生成成品或成本分摊。`;
      }
      return options.rollId
        ? `已确认 ${options.rollId} 整卷/整件原材料消耗；不按机台计数生成成品或成本分摊。`
        : `已确认 ${reference} 的机边原材料消耗；后续成本分摊和损耗校准仍需单独流程。`;
    }
    if (action === "余料退回") {
      const location = options.returnLocation || "余料区";
      return options.rollId
        ? `已记录 ${options.rollId} 余料退回到 ${location}，先进入待复核，不自动变可用库存。`
        : `已记录 ${reference} 机边余料退回到 ${location}，等待重新称重和复核。`;
    }
    if (action === "复核余料可用") {
      const location = options.reviewLocation || "原料库-余料可用区";
      return options.rollId
        ? `已复核 ${options.rollId} 余料并转回 ${location} 可用库存；成本分摊仍需单独流程。`
        : `已复核 ${reference} 的余料并转回可用库存；不自动生成成本或毛利。`;
    }
    if (action === "生成成本草稿") {
      return `已为 ${reference} 生成原材料成本分摊草稿；仍需成本/管理复核、损耗校准和毛利报表确认。`;
    }
    if (action === "确认成本草稿") {
      return `已确认 ${reference} 的原材料成本草稿为成本快照；仍需损耗校准和订单毛利报表确认。`;
    }
    if (action === "校准损耗") {
      const rate = Number(options.lossRatePercent);
      const rateText = Number.isFinite(rate) && rate > 0 ? `，损耗率 ${rate}%` : "";
      return `已校准 ${reference} 的原材料损耗${rateText}；仍需订单毛利报表确认。`;
    }
    if (action === "生成毛利快照") {
      return `已为 ${reference} 生成订单毛利快照；等待财务复核，不自动写客户对账或最终结算。`;
    }
    if (action === "复核毛利快照") {
      return `已复核 ${reference} 的订单毛利快照，并生成内部毛利报表；客户对账和收款结算仍走独立流程。`;
    }
    if (action === "标记异常") {
      return `已把 ${reference} 标记为入库异常，需补照片、补重量或找供应商确认。`;
    }
    return `原材料入库单 ${reference} 已更新。`;
  }

  function formatRawMaterialInboundReference(target = {}) {
    return target.deliveryNoteNo || `${target.id}（供应商未提供单号）`;
  }

  function buildLocalRawMaterialSplitRollId(rolls = [], sourceRollId = "") {
    const existingIds = new Set((Array.isArray(rolls) ? rolls : []).map((roll) => String(roll.id ?? "").trim()));
    for (let index = 1; index < 100; index += 1) {
      const candidate = `${sourceRollId}-S${String(index).padStart(2, "0")}`;
      if (!existingIds.has(candidate)) return candidate;
    }
    return `${sourceRollId}-S${Date.now().toString(36).toUpperCase()}`;
  }

  function roundLocalRawMaterialWeight(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(number * 1000) / 1000;
  }

  function roundLocalRawMaterialMoney(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(number * 100) / 100;
  }

  function applyRawMaterialInboundLocalAction(items, input = {}) {
    const { action, inboundId, options = {}, now, operatorName } = input;
    let updatedItem = null;
    const nextItems = items.map((item) => {
      if (item.id !== inboundId) return item;
      if (action === "复核送货单") {
        updatedItem = {
          ...item,
          status: "已复核待打印标签",
          ocrStatus: "人工复核已通过",
          reviewedBy: operatorName,
          reviewedAt: now,
          nextStep: "打印系统卷标；标签打印后仍需贴标扫码才算可用原料。",
          rolls: (item.rolls ?? []).map((roll) => ({
            ...roll,
            labelStatus: roll.inventoryStatus === "可用" ? roll.labelStatus : "待打印标签",
          })),
        };
        return updatedItem;
      }
      if (action === "打印卷标") {
        updatedItem = {
          ...item,
          status: "已打印待贴标",
          labelPrintedBy: operatorName,
          labelPrintedAt: now,
          nextStep: "把标签贴到对应卷料，手机扫码并上传签单信息后再入库可用。",
          rolls: (item.rolls ?? []).map((roll) => ({
            ...roll,
            labelStatus: roll.inventoryStatus === "可用" ? roll.labelStatus : "已打印待贴标",
          })),
        };
        return updatedItem;
      }
      if (action === "确认贴标入库") {
        const rollId = options.rollId ?? "";
        const nextRolls = (item.rolls ?? []).map((roll) => {
          if (rollId && roll.id !== rollId) return roll;
          if (roll.inventoryStatus === "可用") return roll;
          return {
            ...roll,
            labelStatus: "已贴标入库/可用",
            inventoryStatus: "可用",
            signedNoteStatus: "已扫码/签单",
            scannedAt: now,
            scannedBy: operatorName,
            location: roll.location?.includes("待") ? "原料库-可用区" : roll.location,
          };
        });
        const availableCount = nextRolls.filter((roll) => roll.inventoryStatus === "可用").length;
        const nextStatus = availableCount === nextRolls.length ? "已贴标入库/可用" : "部分贴标";
        updatedItem = {
          ...item,
          status: nextStatus,
          signedNoteStatus: nextStatus === "已贴标入库/可用" ? "已扫码/签单" : "部分签单已上传",
          confirmedBy: operatorName,
          confirmedAt: now,
          nextStep: nextStatus === "已贴标入库/可用" ? "可领料；后续进入供应商月结对账。" : "继续贴标扫码剩余卷/件。",
          rolls: nextRolls,
        };
        return updatedItem;
      }
      if (action === "机边领料") {
        const rollId = options.rollId ?? "";
        const machineId = options.machineId || "BAG-01";
        const productionTaskId = options.productionTaskId || "";
        const issuePurpose = options.issuePurpose || "生产领料";
        const targetRolls = (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "可用" && (!rollId || roll.id === rollId));
        if (!targetRolls.length) return item;
        const issueRecordPrefix = `RMI-ISS-${now.slice(0, 10).replaceAll("-", "")}-${Date.now().toString(36).toUpperCase()}`;
        const splitRecordPrefix = `RMI-SPLIT-LOCAL-${Date.now().toString(36).toUpperCase()}`;
        const issuedSourceRollIds = new Set(targetRolls.map((roll) => roll.id));
        const splitRecords = [];
        const issueRecords = targetRolls.map((roll, index) => {
          const fullWeightKg = Number(roll.weightKg) || 0;
          const requestedWeightKg = Number(options.issuedWeightKg);
          const isPartialIssue = rollId === roll.id && fullWeightKg > 0 && requestedWeightKg > 0 && fullWeightKg - requestedWeightKg > 0.001;
          const issuedRollId = isPartialIssue ? buildLocalRawMaterialSplitRollId(item.rolls, roll.id) : roll.id;
          const issuedWeightKg = isPartialIssue ? roundLocalRawMaterialWeight(requestedWeightKg) : fullWeightKg;
          const remainingWeightKg = isPartialIssue ? roundLocalRawMaterialWeight(fullWeightKg - requestedWeightKg) : 0;
          const splitRecordId = isPartialIssue ? `${splitRecordPrefix}-${String(splitRecords.length + 1).padStart(2, "0")}` : "";
          if (isPartialIssue) {
            splitRecords.push({
              splitRecordId,
              inboundId: item.id,
              sourceRollId: roll.id,
              issuedRollId,
              supplierRollNo: roll.supplierRollNo,
              materialType: item.materialType,
              productName: item.productName,
              spec: item.spec,
              factoryColor: item.factoryColor,
              sourceWeightKg: fullWeightKg,
              issuedWeightKg,
              remainingWeightKg,
              unit: item.unit || "kg",
              splitMode: "部分领料/拆卷",
              machineId,
              productionTaskId,
              splitBy: operatorName,
              splitAt: now,
              note: options.note || "V1 记录拆卷领料和剩余可用重量；仍不做成本分摊或损耗校准。",
            });
          }
          return {
            issueRecordId: `${issueRecordPrefix}-${String(index + 1).padStart(2, "0")}`,
            inboundId: item.id,
            rollId: issuedRollId,
            sourceRollId: isPartialIssue ? roll.id : "",
            splitRecordId,
            supplierRollNo: roll.supplierRollNo,
            materialType: item.materialType,
            productName: item.productName,
            spec: item.spec,
            factoryColor: item.factoryColor,
            issuedWeightKg,
            issuedQuantity: fullWeightKg > 0 ? 0 : 1,
            sourceWeightKg: fullWeightKg,
            remainingWeightKg,
            unit: item.unit || (fullWeightKg > 0 ? "kg" : "件"),
            machineId,
            productionTaskId,
            issuePurpose,
            issueMode: isPartialIssue ? "部分领料/拆卷" : "整卷/整件领料",
            consumptionStatus: "待生产消耗确认",
            issuedBy: operatorName,
            issuedAt: now,
            note: options.note || (isPartialIssue
              ? "V1 记录拆卷机边领料，剩余重量保留可用；不生成成品数量或成本分摊。"
              : "V1 记录整卷/整件机边领料，不生成成品数量，不做成本分摊。"),
          };
        });
        const nextRolls = (item.rolls ?? []).flatMap((roll) => {
          if (!issuedSourceRollIds.has(roll.id)) return [roll];
          const splitRecord = splitRecords.find((entry) => entry.sourceRollId === roll.id);
          if (splitRecord) {
            const record = issueRecords.find((entry) => entry.rollId === splitRecord.issuedRollId);
            return [
              {
                ...roll,
                weightKg: splitRecord.remainingWeightKg,
                inventoryStatus: "可用",
                splitRecordId: splitRecord.splitRecordId,
                splitStatus: "已拆卷/部分领料",
                splitAt: now,
                splitBy: operatorName,
                originalWeightKg: splitRecord.sourceWeightKg,
                splitIssuedWeightKg: splitRecord.issuedWeightKg,
                splitRemainingWeightKg: splitRecord.remainingWeightKg,
              },
              {
                ...roll,
                id: splitRecord.issuedRollId,
                supplierRollNo: roll.supplierRollNo ? `${roll.supplierRollNo}/拆1` : `${roll.id}/拆1`,
                weightKg: splitRecord.issuedWeightKg,
                parentRollId: roll.id,
                sourceRollId: roll.id,
                splitRecordId: splitRecord.splitRecordId,
                splitStatus: "拆出机边领料",
                inventoryStatus: "机边领用",
                location: `机边-${machineId}`,
                issueRecordId: record?.issueRecordId || "",
                issuedAt: now,
                issuedBy: operatorName,
                machineId,
                productionTaskId,
                issuePurpose,
                consumptionStatus: "待生产消耗确认",
              },
            ];
          }
          const record = issueRecords.find((entry) => entry.rollId === roll.id);
          return [{
            ...roll,
            inventoryStatus: "机边领用",
            location: `机边-${machineId}`,
            issueRecordId: record?.issueRecordId || "",
            issuedAt: now,
            issuedBy: operatorName,
            machineId,
            productionTaskId,
            issuePurpose,
            consumptionStatus: "待生产消耗确认",
          }];
        });
        const issuedCount = nextRolls.filter((roll) => roll.inventoryStatus === "机边领用").length;
        const nextStatus = nextRolls.length > 0 && issuedCount === nextRolls.length ? "已领料/机边" : "部分领料/机边";
        updatedItem = {
          ...item,
          status: nextStatus,
          issueStatus: nextStatus,
          issuedBy: operatorName,
          issuedAt: now,
          machineId,
          productionTaskId,
          nextStep: "等待生产报工时确认原材料消耗；机台计数仍只作凭证，不直接生成成品或成本分摊。",
          rawMaterialIssueRecords: [...(item.rawMaterialIssueRecords ?? []), ...issueRecords],
          rawMaterialSplitRecords: [...(item.rawMaterialSplitRecords ?? []), ...splitRecords],
          rolls: nextRolls,
        };
        return updatedItem;
      }
      if (action === "确认消耗") {
        const rollId = options.rollId ?? "";
        const targetRolls = (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "机边领用" && (!rollId || roll.id === rollId));
        if (!targetRolls.length) return item;
        const consumptionRecordPrefix = `RMI-CONS-LOCAL-${Date.now().toString(36).toUpperCase()}`;
        const consumedRollIds = new Set(targetRolls.map((roll) => roll.id));
        const consumptionRecords = targetRolls.map((roll, index) => {
          const issueRecord = (item.rawMaterialIssueRecords ?? []).find((record) => record.rollId === roll.id);
          const machineSideWeightKg = Number(roll.weightKg) || Number(issueRecord?.remainingWeightKg) || Number(issueRecord?.issuedWeightKg) || 0;
          const requestedWeightKg = Number(options.consumedWeightKg);
          const isPartialConsumption = machineSideWeightKg > 0 && requestedWeightKg > 0 && machineSideWeightKg - requestedWeightKg > 0.001;
          const consumedWeightKg = isPartialConsumption ? roundLocalRawMaterialWeight(requestedWeightKg) : machineSideWeightKg;
          const remainingMachineSideWeightKg = isPartialConsumption ? roundLocalRawMaterialWeight(machineSideWeightKg - requestedWeightKg) : 0;
          return {
            consumptionRecordId: `${consumptionRecordPrefix}-${String(index + 1).padStart(2, "0")}`,
            inboundId: item.id,
            issueRecordId: roll.issueRecordId || issueRecord?.issueRecordId || "",
            rollId: roll.id,
            supplierRollNo: roll.supplierRollNo,
            materialType: item.materialType,
            productName: item.productName,
            spec: item.spec,
            factoryColor: item.factoryColor,
            consumedWeightKg,
            consumedQuantity: consumedWeightKg > 0 ? 0 : 1,
            consumedFromWeightKg: machineSideWeightKg,
            remainingMachineSideWeightKg,
            partialConsumption: isPartialConsumption,
            unit: item.unit || (consumedWeightKg > 0 ? "kg" : "件"),
            machineId: options.machineId || roll.machineId || issueRecord?.machineId || "机边待分配",
            productionTaskId: options.productionTaskId || roll.productionTaskId || issueRecord?.productionTaskId || "",
            consumptionStatus: isPartialConsumption ? "部分消耗/机边" : "已确认消耗",
            confirmedBy: operatorName,
            confirmedAt: now,
            note: options.note || (isPartialConsumption
              ? "V1 记录机边部分消耗，剩余重量仍在机边；不生成成品数量，不做成本分摊。"
              : "V1 仅确认整卷/整件已消耗；不生成成品数量，不做成本分摊。"),
          };
        });
        const nextRolls = (item.rolls ?? []).map((roll) => {
          if (!consumedRollIds.has(roll.id)) return roll;
          const record = consumptionRecords.find((entry) => entry.rollId === roll.id);
          if (record?.partialConsumption) {
            return {
              ...roll,
              weightKg: record.remainingMachineSideWeightKg,
              inventoryStatus: "机边领用",
              consumptionStatus: "部分消耗/机边",
              consumptionRecordId: record?.consumptionRecordId || "",
              consumedAt: now,
              consumedBy: operatorName,
              lastConsumedWeightKg: record.consumedWeightKg,
              remainingMachineSideWeightKg: record.remainingMachineSideWeightKg,
            };
          }
          return {
            ...roll,
            inventoryStatus: "已消耗",
            location: "已消耗归档",
            consumptionStatus: "已确认消耗",
            consumptionRecordId: record?.consumptionRecordId || "",
            consumedAt: now,
            consumedBy: operatorName,
          };
        });
        const nextIssueRecords = (item.rawMaterialIssueRecords ?? []).map((record) =>
          consumedRollIds.has(record.rollId)
            ? (() => {
                const consumptionRecord = consumptionRecords.find((entry) => entry.rollId === record.rollId);
                return {
                  ...record,
                  consumptionStatus: consumptionRecord?.partialConsumption ? "部分消耗/机边" : "已确认消耗",
                  consumptionRecordId: consumptionRecord?.consumptionRecordId || "",
                  consumedWeightKg: roundLocalRawMaterialWeight(Number(record.consumedWeightKg || 0) + Number(consumptionRecord?.consumedWeightKg || 0)),
                  remainingWeightKg: Number(consumptionRecord?.remainingMachineSideWeightKg) || 0,
                  consumedAt: now,
                };
              })()
            : record,
        );
        const machineSideCount = nextRolls.filter((roll) => roll.inventoryStatus === "机边领用").length;
        const consumedCount = nextRolls.filter((roll) => roll.inventoryStatus === "已消耗").length;
        const nextStatus = machineSideCount ? "部分消耗确认" : consumedCount === nextRolls.length ? "已消耗确认" : "部分消耗确认";
        updatedItem = {
          ...item,
          status: nextStatus,
          issueStatus: nextStatus,
          consumptionStatus: nextStatus,
          consumedBy: operatorName,
          consumedAt: now,
          nextStep: "已形成原材料消耗留痕；后续成本分摊、损耗校准和毛利报表仍需独立流程。",
          rawMaterialIssueRecords: nextIssueRecords,
          rawMaterialConsumptionRecords: [...(item.rawMaterialConsumptionRecords ?? []), ...consumptionRecords],
          rolls: nextRolls,
        };
        return updatedItem;
      }
      if (action === "余料退回") {
        const rollId = options.rollId ?? "";
        const returnLocation = options.returnLocation || "余料区";
        const targetRolls = (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "机边领用" && (!rollId || roll.id === rollId));
        if (!targetRolls.length) return item;
        const returnRecordPrefix = `RMI-RET-LOCAL-${Date.now().toString(36).toUpperCase()}`;
        const returnedRollIds = new Set(targetRolls.map((roll) => roll.id));
        const returnRecords = targetRolls.map((roll, index) => {
          const issueRecord = (item.rawMaterialIssueRecords ?? []).find((record) => record.rollId === roll.id);
          const issuedWeightKg = Number(issueRecord?.issuedWeightKg) || Number(roll.weightKg) || 0;
          const machineSideWeightKg = Number(roll.weightKg) || Number(issueRecord?.remainingWeightKg) || issuedWeightKg;
          return {
            leftoverReturnRecordId: `${returnRecordPrefix}-${String(index + 1).padStart(2, "0")}`,
            inboundId: item.id,
            issueRecordId: roll.issueRecordId || issueRecord?.issueRecordId || "",
            rollId: roll.id,
            supplierRollNo: roll.supplierRollNo,
            materialType: item.materialType,
            productName: item.productName,
            spec: item.spec,
            factoryColor: item.factoryColor,
            issuedWeightKg,
            machineSideWeightKg,
            leftoverWeightKg: machineSideWeightKg > 0 ? Math.min(Number(options.leftoverWeightKg || machineSideWeightKg), machineSideWeightKg) : 0,
            leftoverQuantity: machineSideWeightKg > 0 ? 0 : Number(options.leftoverQuantity || 1),
            unit: item.unit || (issuedWeightKg > 0 ? "kg" : "件"),
            machineId: options.machineId || roll.machineId || issueRecord?.machineId || "机边待分配",
            productionTaskId: options.productionTaskId || roll.productionTaskId || issueRecord?.productionTaskId || "",
            returnLocation,
            returnReason: options.reason || "机边余料退回",
            consumptionStatus: "已退回余料/待复核",
            returnedBy: operatorName,
            returnedAt: now,
            note: options.note || "V1 余料退回先进入待复核，不自动变可用库存，不做成本分摊。",
          };
        });
        const nextRolls = (item.rolls ?? []).map((roll) => {
          if (!returnedRollIds.has(roll.id)) return roll;
          const record = returnRecords.find((entry) => entry.rollId === roll.id);
          return {
            ...roll,
            inventoryStatus: "余料待复核",
            location: returnLocation,
            consumptionStatus: "已退回余料/待复核",
            leftoverReturnRecordId: record?.leftoverReturnRecordId || "",
            leftoverWeightKg: record?.leftoverWeightKg || 0,
            leftoverQuantity: record?.leftoverQuantity || 0,
            returnedAt: now,
            returnedBy: operatorName,
          };
        });
        const nextIssueRecords = (item.rawMaterialIssueRecords ?? []).map((record) =>
          returnedRollIds.has(record.rollId)
            ? {
                ...record,
                consumptionStatus: "已退回余料/待复核",
                leftoverReturnRecordId: returnRecords.find((entry) => entry.rollId === record.rollId)?.leftoverReturnRecordId || "",
                returnedAt: now,
              }
            : record,
        );
        const machineSideCount = nextRolls.filter((roll) => roll.inventoryStatus === "机边领用").length;
        const nextStatus = machineSideCount ? "部分余料退回" : "余料待复核";
        updatedItem = {
          ...item,
          status: nextStatus,
          issueStatus: nextStatus,
          consumptionStatus: nextStatus,
          leftoverReturnedBy: operatorName,
          leftoverReturnedAt: now,
          nextStep: "余料已退回待复核；需重新称重 / 贴标确认后，后续版本才能再次转可用或参与成本分摊。",
          rawMaterialIssueRecords: nextIssueRecords,
          rawMaterialLeftoverReturnRecords: [...(item.rawMaterialLeftoverReturnRecords ?? []), ...returnRecords],
          rolls: nextRolls,
        };
        return updatedItem;
      }
      if (action === "复核余料可用") {
        const rollId = options.rollId ?? "";
        const reviewLocation = options.reviewLocation || "原料库-余料可用区";
        const targetRolls = (item.rolls ?? []).filter((roll) => roll.inventoryStatus === "余料待复核" && (!rollId || roll.id === rollId));
        if (!targetRolls.length) return item;
        const reviewRecordPrefix = `RMI-LREV-LOCAL-${Date.now().toString(36).toUpperCase()}`;
        const reviewedRollIds = new Set(targetRolls.map((roll) => roll.id));
        const reviewRecords = targetRolls.map((roll, index) => {
          const returnRecord = (item.rawMaterialLeftoverReturnRecords ?? []).find((record) => record.rollId === roll.id && !record.leftoverReviewRecordId)
            || (item.rawMaterialLeftoverReturnRecords ?? []).find((record) => record.rollId === roll.id);
          const returnedWeightKg = Number(roll.leftoverWeightKg) || Number(returnRecord?.leftoverWeightKg) || 0;
          const returnedQuantity = Number(roll.leftoverQuantity) || Number(returnRecord?.leftoverQuantity) || (returnedWeightKg > 0 ? 0 : 1);
          const reviewedWeightKg = returnedWeightKg > 0 ? Number(options.reviewedWeightKg || returnedWeightKg) : 0;
          const reviewedQuantity = returnedWeightKg > 0 ? 0 : Number(options.reviewedQuantity || returnedQuantity || 1);
          return {
            leftoverReviewRecordId: `${reviewRecordPrefix}-${String(index + 1).padStart(2, "0")}`,
            inboundId: item.id,
            leftoverReturnRecordId: roll.leftoverReturnRecordId || returnRecord?.leftoverReturnRecordId || "",
            issueRecordId: roll.issueRecordId || returnRecord?.issueRecordId || "",
            rollId: roll.id,
            supplierRollNo: roll.supplierRollNo,
            materialType: item.materialType,
            productName: item.productName,
            spec: item.spec,
            factoryColor: item.factoryColor,
            returnedWeightKg,
            returnedQuantity,
            reviewedWeightKg,
            reviewedQuantity,
            unit: item.unit || (returnedWeightKg > 0 ? "kg" : "件"),
            reviewLocation,
            reviewStatus: "复核通过/可用",
            reviewedBy: operatorName,
            reviewedAt: now,
            note: options.note || "V1 余料复核只转回可用原材料库存，不做成本分摊或毛利计算。",
          };
        });
        const nextRolls = (item.rolls ?? []).map((roll) => {
          if (!reviewedRollIds.has(roll.id)) return roll;
          const record = reviewRecords.find((entry) => entry.rollId === roll.id);
          return {
            ...roll,
            weightKg: record?.reviewedWeightKg > 0 ? record.reviewedWeightKg : roll.weightKg,
            labelStatus: "已贴标入库/可用",
            inventoryStatus: "可用",
            location: reviewLocation,
            signedNoteStatus: "余料复核已扫码/签单",
            consumptionStatus: "余料已复核/可用",
            leftoverReviewRecordId: record?.leftoverReviewRecordId || "",
            leftoverReviewedWeightKg: record?.reviewedWeightKg || 0,
            leftoverReviewedQuantity: record?.reviewedQuantity || 0,
            leftoverReviewedAt: now,
            leftoverReviewedBy: operatorName,
          };
        });
        const nextIssueRecords = (item.rawMaterialIssueRecords ?? []).map((record) =>
          reviewedRollIds.has(record.rollId)
            ? {
                ...record,
                consumptionStatus: "余料已复核/可用",
                leftoverReviewRecordId: reviewRecords.find((entry) => entry.rollId === record.rollId)?.leftoverReviewRecordId || "",
                leftoverReviewedAt: now,
              }
            : record,
        );
        const nextReturnRecords = (item.rawMaterialLeftoverReturnRecords ?? []).map((record) =>
          reviewedRollIds.has(record.rollId)
            ? {
                ...record,
                consumptionStatus: "余料已复核/可用",
                leftoverReviewRecordId: reviewRecords.find((entry) => entry.rollId === record.rollId)?.leftoverReviewRecordId || "",
                reviewStatus: "复核通过/可用",
                reviewedAt: now,
                reviewedBy: operatorName,
              }
            : record,
        );
        const availableCount = nextRolls.filter((roll) => roll.inventoryStatus === "可用").length;
        const consumedCount = nextRolls.filter((roll) => roll.inventoryStatus === "已消耗").length;
        const machineSideCount = nextRolls.filter((roll) => roll.inventoryStatus === "机边领用").length;
        const leftoverPendingCount = nextRolls.filter((roll) => roll.inventoryStatus === "余料待复核").length;
        const nextStatus = leftoverPendingCount
          ? "部分余料复核"
          : machineSideCount
            ? "部分领料/机边"
            : availableCount === nextRolls.length
              ? "余料已复核/可用"
              : availableCount + consumedCount === nextRolls.length
                ? "部分消耗确认"
                : "部分余料复核";
        updatedItem = {
          ...item,
          status: nextStatus,
          issueStatus: nextStatus,
          consumptionStatus: nextStatus,
          leftoverReviewedBy: operatorName,
          leftoverReviewedAt: now,
          nextStep: "余料复核通过，已回到可用原材料库存；成本分摊、损耗校准和毛利仍需独立流程。",
          rawMaterialIssueRecords: nextIssueRecords,
          rawMaterialLeftoverReturnRecords: nextReturnRecords,
          rawMaterialLeftoverReviewRecords: [...(item.rawMaterialLeftoverReviewRecords ?? []), ...reviewRecords],
          rolls: nextRolls,
        };
        return updatedItem;
      }
      if (action === "生成成本草稿") {
        const unitPrice = Number(item.unitPrice || 0);
        const existingDrafts = item.rawMaterialCostAllocationDrafts ?? [];
        const existingConsumptionIds = new Set(existingDrafts.map((record) => record.consumptionRecordId).filter(Boolean));
        const draftPrefix = `RMCA-LOCAL-${Date.now().toString(36).toUpperCase()}`;
        const warnings = [];
        let localDraftIndex = existingDrafts.length;
        const drafts = (item.rawMaterialConsumptionRecords ?? []).flatMap((record) => {
          if (existingConsumptionIds.has(record.consumptionRecordId)) return [];
          const issueRecord = (item.rawMaterialIssueRecords ?? []).find((issue) => issue.issueRecordId === record.issueRecordId)
            || (item.rawMaterialIssueRecords ?? []).find((issue) => issue.rollId === record.rollId);
          if (!issueRecord || issueRecord.productionTaskMatchStatus !== "已匹配" || !issueRecord.productionTaskId || !unitPrice) {
            warnings.push(`${record.consumptionRecordId || "消耗记录"}：未匹配生产任务或缺少单价，未生成成本草稿`);
            return [];
          }
          const allocatedWeightKg = roundLocalRawMaterialWeight(record.consumedWeightKg || 0);
          const allocatedQuantity = allocatedWeightKg > 0 ? 0 : Number(record.consumedQuantity || 0) || 1;
          const unit = record.unit || item.unit || (allocatedWeightKg > 0 ? "kg" : "件");
          const amount = roundLocalRawMaterialMoney((allocatedWeightKg > 0 ? allocatedWeightKg : allocatedQuantity) * unitPrice);
          localDraftIndex += 1;
          return [{
            costAllocationDraftId: `${draftPrefix}-${String(localDraftIndex).padStart(2, "0")}`,
            inboundId: item.id,
            consumptionRecordId: record.consumptionRecordId,
            issueRecordId: issueRecord.issueRecordId,
            rollId: record.rollId,
            sourceRollId: issueRecord.sourceRollId || "",
            splitRecordId: issueRecord.splitRecordId || "",
            supplierName: item.supplierName,
            deliveryNoteNo: item.deliveryNoteNo,
            materialType: item.materialType,
            productName: item.productName,
            spec: item.spec,
            factoryColor: item.factoryColor,
            unit,
            unitPrice,
            allocatedWeightKg,
            allocatedQuantity,
            allocatedCostAmount: amount,
            productionTaskId: issueRecord.productionTaskId,
            orderLineId: issueRecord.productionTaskOrderLineId || "",
            productionTaskMachineId: issueRecord.productionTaskMachineId || issueRecord.machineId || "",
            productionTaskGoodsSpec: issueRecord.productionTaskGoodsSpec || "",
            allocationBasis: allocatedWeightKg > 0 ? `${allocatedWeightKg}kg * ${unitPrice}元/kg` : `${allocatedQuantity}${unit} * ${unitPrice}元/${unit}`,
            allocationStatus: "草稿/待成本复核",
            costEffect: "draft_only",
            marginEffect: "none",
            lossCalibrationStatus: "待损耗校准",
            generatedBy: operatorName,
            generatedAt: now,
            note: options.note || "V1 原材料成本分摊草稿；不直接确认订单毛利，需成本/管理复核。",
          }];
        });
        if (!drafts.length) return item;
        const nextIssueRecords = (item.rawMaterialIssueRecords ?? []).map((record) => {
          const draft = drafts.find((entry) => entry.issueRecordId === record.issueRecordId);
          return draft
            ? {
                ...record,
                costAllocationStatus: "成本草稿待复核",
                costAllocationDraftId: draft.costAllocationDraftId,
                allocatedCostAmount: draft.allocatedCostAmount,
                allocatedWeightKg: draft.allocatedWeightKg,
                allocatedQuantity: draft.allocatedQuantity,
              }
            : record;
        });
        const nextConsumptionRecords = (item.rawMaterialConsumptionRecords ?? []).map((record) => {
          const draft = drafts.find((entry) => entry.consumptionRecordId === record.consumptionRecordId);
          return draft
            ? {
                ...record,
                costAllocationStatus: "成本草稿待复核",
                costAllocationDraftId: draft.costAllocationDraftId,
                allocatedCostAmount: draft.allocatedCostAmount,
                allocatedWeightKg: draft.allocatedWeightKg,
                allocatedQuantity: draft.allocatedQuantity,
              }
            : record;
        });
        const nextDrafts = [...existingDrafts, ...drafts];
        updatedItem = {
          ...item,
          costAllocationStatus: "成本草稿待复核",
          costAllocationDraftedBy: operatorName,
          costAllocationDraftedAt: now,
          costAllocationDraftCount: nextDrafts.length,
          costAllocationDraftAmount: roundLocalRawMaterialMoney(nextDrafts.reduce((sum, record) => sum + Number(record.allocatedCostAmount || 0), 0)),
          costAllocationReviewStatus: "待成本复核",
          nextStep: "已生成原材料成本分摊草稿；仍需成本/管理复核、损耗校准和订单毛利报表确认。",
          rawMaterialIssueRecords: nextIssueRecords,
          rawMaterialConsumptionRecords: nextConsumptionRecords,
          rawMaterialCostAllocationDrafts: nextDrafts,
          rawMaterialCostAllocationWarnings: warnings,
        };
        return updatedItem;
      }
      if (action === "确认成本草稿") {
        const existingDrafts = item.rawMaterialCostAllocationDrafts ?? [];
        const confirmableDrafts = existingDrafts.filter((record) => !record.costConfirmationId && record.allocationStatus !== "已复核/待损耗校准");
        if (!confirmableDrafts.length) return item;
        const confirmation = {
          costConfirmationId: `RMCC-LOCAL-${Date.now().toString(36).toUpperCase()}`,
          inboundId: item.id,
          supplierName: item.supplierName,
          deliveryNoteNo: item.deliveryNoteNo,
          costAllocationDraftIds: confirmableDrafts.map((record) => record.costAllocationDraftId).filter(Boolean),
          consumptionRecordIds: confirmableDrafts.map((record) => record.consumptionRecordId).filter(Boolean),
          issueRecordIds: confirmableDrafts.map((record) => record.issueRecordId).filter(Boolean),
          productionTaskIds: [...new Set(confirmableDrafts.map((record) => record.productionTaskId).filter(Boolean))],
          orderLineIds: [...new Set(confirmableDrafts.map((record) => record.orderLineId).filter(Boolean))],
          confirmedCount: confirmableDrafts.length,
          confirmedWeightKg: roundLocalRawMaterialWeight(confirmableDrafts.reduce((sum, record) => sum + Number(record.allocatedWeightKg || 0), 0)),
          confirmedQuantity: confirmableDrafts.reduce((sum, record) => sum + Number(record.allocatedQuantity || 0), 0),
          confirmedCostAmount: roundLocalRawMaterialMoney(confirmableDrafts.reduce((sum, record) => sum + Number(record.allocatedCostAmount || 0), 0)),
          reviewStatus: "已复核/待损耗校准",
          costEffect: "confirmed_material_cost_snapshot",
          marginEffect: "none",
          lossCalibrationStatus: "待损耗校准",
          confirmedBy: operatorName,
          confirmedAt: now,
          note: options.note || "V1 成本草稿复核确认；只形成原材料成本快照，不自动更新订单毛利。",
        };
        const confirmedDraftIds = new Set(confirmation.costAllocationDraftIds);
        const confirmedIssueRecordIds = new Set(confirmation.issueRecordIds);
        const confirmedConsumptionRecordIds = new Set(confirmation.consumptionRecordIds);
        const nextDrafts = existingDrafts.map((record) =>
          confirmedDraftIds.has(record.costAllocationDraftId)
            ? {
                ...record,
                allocationStatus: "已复核/待损耗校准",
                costEffect: "confirmed_material_cost_snapshot",
                marginEffect: "none",
                lossCalibrationStatus: "待损耗校准",
                confirmedCostAmount: record.allocatedCostAmount,
                confirmedBy: operatorName,
                confirmedAt: now,
                costConfirmationId: confirmation.costConfirmationId,
                reviewNote: options.note || "V1 成本草稿复核确认；损耗校准和毛利报表仍需独立流程。",
              }
            : record,
        );
        const nextIssueRecords = (item.rawMaterialIssueRecords ?? []).map((record) =>
          confirmedIssueRecordIds.has(record.issueRecordId)
            ? {
                ...record,
                costAllocationStatus: "成本已复核待损耗校准",
                costConfirmationId: confirmation.costConfirmationId,
                confirmedCostAmount: Number(record.allocatedCostAmount) || 0,
                costConfirmedAt: now,
                costConfirmedBy: operatorName,
              }
            : record,
        );
        const nextConsumptionRecords = (item.rawMaterialConsumptionRecords ?? []).map((record) =>
          confirmedConsumptionRecordIds.has(record.consumptionRecordId)
            ? {
                ...record,
                costAllocationStatus: "成本已复核待损耗校准",
                costConfirmationId: confirmation.costConfirmationId,
                confirmedCostAmount: Number(record.allocatedCostAmount) || 0,
                costConfirmedAt: now,
                costConfirmedBy: operatorName,
              }
            : record,
        );
        const allConfirmedDrafts = nextDrafts.filter((record) => record.allocationStatus === "已复核/待损耗校准");
        updatedItem = {
          ...item,
          costAllocationStatus: "成本已复核待损耗校准",
          costAllocationReviewStatus: "已复核/待损耗校准",
          costAllocationConfirmedBy: operatorName,
          costAllocationConfirmedAt: now,
          costAllocationConfirmedCount: allConfirmedDrafts.length,
          costAllocationConfirmedAmount: roundLocalRawMaterialMoney(
            allConfirmedDrafts.reduce((sum, record) => sum + Number(record.confirmedCostAmount || record.allocatedCostAmount || 0), 0),
          ),
          costAllocationConfirmationId: confirmation.costConfirmationId,
          nextStep: "成本草稿已复核为原材料成本快照；仍需损耗校准和订单毛利报表确认。",
          rawMaterialIssueRecords: nextIssueRecords,
          rawMaterialConsumptionRecords: nextConsumptionRecords,
          rawMaterialCostAllocationDrafts: nextDrafts,
          rawMaterialCostAllocationConfirmations: [...(item.rawMaterialCostAllocationConfirmations ?? []), confirmation],
        };
        return updatedItem;
      }
      if (action === "校准损耗") {
        const existingConfirmations = item.rawMaterialCostAllocationConfirmations ?? [];
        if (!existingConfirmations.length) return item;
        const existingCalibrations = item.rawMaterialCostLossCalibrations ?? [];
        const calibratedConfirmationIds = new Set(
          existingCalibrations
            .flatMap((record) => [record.costConfirmationId, ...(record.costConfirmationIds ?? [])])
            .filter(Boolean),
        );
        const calibratableConfirmations = existingConfirmations.filter(
          (record) => !calibratedConfirmationIds.has(record.costConfirmationId) && record.lossCalibrationStatus !== "已校准/待毛利确认",
        );
        if (!calibratableConfirmations.length) return item;
        const relatedDraftIds = new Set(calibratableConfirmations.flatMap((record) => record.costAllocationDraftIds ?? []).filter(Boolean));
        const relatedDrafts = (item.rawMaterialCostAllocationDrafts ?? []).filter((record) => relatedDraftIds.has(record.costAllocationDraftId));
        const expectedOutputQuantity = Number(options.expectedOutputQuantity ?? options.plannedOutputQuantity ?? options.estimatedOutputQuantity ?? 0) || 0;
        const actualQualifiedOutputQuantity =
          Number(options.actualQualifiedOutputQuantity ?? options.actualOutputQuantity ?? options.qualifiedOutputQuantity ?? 0) || 0;
        const explicitLossQuantity = Number(options.lossQuantity ?? options.lossOutputQuantity ?? 0) || 0;
        const lossQuantity = explicitLossQuantity > 0
          ? explicitLossQuantity
          : expectedOutputQuantity > 0
            ? Math.max(0, expectedOutputQuantity - actualQualifiedOutputQuantity)
            : 0;
        const lossRatePercent = expectedOutputQuantity > 0 ? Math.round((lossQuantity / expectedOutputQuantity) * 10000) / 100 : 0;
        const confirmedCostAmount = roundLocalRawMaterialMoney(
          calibratableConfirmations.reduce((sum, record) => sum + Number(record.confirmedCostAmount || 0), 0)
            || relatedDrafts.reduce((sum, record) => sum + Number(record.confirmedCostAmount || record.allocatedCostAmount || 0), 0),
        );
        const calibration = {
          lossCalibrationId: `RMCL-LOCAL-${Date.now().toString(36).toUpperCase()}`,
          inboundId: item.id,
          supplierName: item.supplierName,
          deliveryNoteNo: item.deliveryNoteNo,
          costConfirmationId: calibratableConfirmations[0]?.costConfirmationId || "",
          costConfirmationIds: calibratableConfirmations.map((record) => record.costConfirmationId).filter(Boolean),
          costAllocationDraftIds: [...relatedDraftIds],
          consumptionRecordIds: calibratableConfirmations.flatMap((record) => record.consumptionRecordIds ?? []).filter(Boolean),
          issueRecordIds: calibratableConfirmations.flatMap((record) => record.issueRecordIds ?? []).filter(Boolean),
          productionTaskIds: [...new Set(calibratableConfirmations.flatMap((record) => record.productionTaskIds ?? []).filter(Boolean))],
          orderLineIds: [...new Set(calibratableConfirmations.flatMap((record) => record.orderLineIds ?? []).filter(Boolean))],
          confirmedCount: calibratableConfirmations.reduce((sum, record) => sum + Number(record.confirmedCount || 0), 0),
          confirmedWeightKg: roundLocalRawMaterialWeight(calibratableConfirmations.reduce((sum, record) => sum + Number(record.confirmedWeightKg || 0), 0)),
          confirmedQuantity: calibratableConfirmations.reduce((sum, record) => sum + Number(record.confirmedQuantity || 0), 0),
          confirmedCostAmount,
          expectedOutputQuantity,
          actualQualifiedOutputQuantity,
          lossQuantity,
          lossRatePercent,
          calibrationBasis: expectedOutputQuantity > 0
            ? `${actualQualifiedOutputQuantity}/${expectedOutputQuantity} 合格产量，损耗 ${lossQuantity}，损耗率 ${lossRatePercent}%`
            : "V1 手工损耗校准；现场尚未提供预计合格产量，先记录成本快照待毛利确认。",
          calibrationStatus: "已校准/待毛利确认",
          costEffect: "loss_calibrated_material_cost_snapshot",
          marginEffect: "pending_margin_snapshot",
          calibratedBy: operatorName,
          calibratedAt: now,
          note: options.note || "V1 损耗校准第一版；只形成待毛利确认的成本校准快照。",
        };
        const calibratedConfirmationIdSet = new Set(calibration.costConfirmationIds);
        const calibratedDraftIdSet = new Set(calibration.costAllocationDraftIds);
        const calibratedIssueRecordIds = new Set(calibration.issueRecordIds);
        const calibratedConsumptionRecordIds = new Set(calibration.consumptionRecordIds);
        const nextDrafts = (item.rawMaterialCostAllocationDrafts ?? []).map((record) =>
          calibratedDraftIdSet.has(record.costAllocationDraftId)
            ? {
                ...record,
                allocationStatus: "已校准/待毛利确认",
                costEffect: "loss_calibrated_material_cost_snapshot",
                marginEffect: "pending_margin_snapshot",
                lossCalibrationStatus: "已校准/待毛利确认",
                lossCalibrationId: calibration.lossCalibrationId,
                lossRatePercent,
                calibratedCostAmount: record.confirmedCostAmount || record.allocatedCostAmount,
                calibratedBy: operatorName,
                calibratedAt: now,
              }
            : record,
        );
        const nextConfirmations = existingConfirmations.map((record) =>
          calibratedConfirmationIdSet.has(record.costConfirmationId)
            ? {
                ...record,
                reviewStatus: "已校准/待毛利确认",
                costEffect: "loss_calibrated_material_cost_snapshot",
                marginEffect: "pending_margin_snapshot",
                lossCalibrationStatus: "已校准/待毛利确认",
                lossCalibrationId: calibration.lossCalibrationId,
                lossRatePercent,
                calibratedBy: operatorName,
                calibratedAt: now,
              }
            : record,
        );
        const nextIssueRecords = (item.rawMaterialIssueRecords ?? []).map((record) =>
          calibratedIssueRecordIds.has(record.issueRecordId)
            ? {
                ...record,
                costAllocationStatus: "损耗已校准待毛利确认",
                lossCalibrationId: calibration.lossCalibrationId,
                lossRatePercent,
                lossCalibratedAt: now,
                lossCalibratedBy: operatorName,
              }
            : record,
        );
        const nextConsumptionRecords = (item.rawMaterialConsumptionRecords ?? []).map((record) =>
          calibratedConsumptionRecordIds.has(record.consumptionRecordId)
            ? {
                ...record,
                costAllocationStatus: "损耗已校准待毛利确认",
                lossCalibrationId: calibration.lossCalibrationId,
                lossRatePercent,
                lossCalibratedAt: now,
                lossCalibratedBy: operatorName,
              }
            : record,
        );
        const nextCalibrations = [...existingCalibrations, calibration];
        updatedItem = {
          ...item,
          costAllocationStatus: "损耗已校准待毛利确认",
          costAllocationReviewStatus: "已校准/待毛利确认",
          lossCalibrationStatus: "已校准/待毛利确认",
          lossCalibratedBy: operatorName,
          lossCalibratedAt: now,
          lossCalibrationCount: nextCalibrations.length,
          lossCalibrationId: calibration.lossCalibrationId,
          lossCalibrationRatePercent: lossRatePercent,
          lossCalibrationActualOutputQuantity: actualQualifiedOutputQuantity,
          lossCalibrationExpectedOutputQuantity: expectedOutputQuantity,
          lossCalibrationAmount: confirmedCostAmount,
          nextStep: "损耗已校准为原材料成本校准快照；仍需订单毛利报表确认。",
          rawMaterialIssueRecords: nextIssueRecords,
          rawMaterialConsumptionRecords: nextConsumptionRecords,
          rawMaterialCostAllocationDrafts: nextDrafts,
          rawMaterialCostAllocationConfirmations: nextConfirmations,
          rawMaterialCostLossCalibrations: nextCalibrations,
        };
        return updatedItem;
      }
      if (action === "生成毛利快照") {
        const existingCalibrations = item.rawMaterialCostLossCalibrations ?? [];
        if (!existingCalibrations.length) return item;
        const existingSnapshots = item.rawMaterialOrderMarginSnapshots ?? [];
        const snapshottedCalibrationIds = new Set(
          existingSnapshots.flatMap((record) => record.lossCalibrationIds ?? []).filter(Boolean),
        );
        const eligibleCalibrations = existingCalibrations.filter(
          (record) => !snapshottedCalibrationIds.has(record.lossCalibrationId) && record.marginEffect !== "margin_snapshot_pending_review",
        );
        if (!eligibleCalibrations.length) return item;
        const relatedDraftIds = new Set(eligibleCalibrations.flatMap((record) => record.costAllocationDraftIds ?? []).filter(Boolean));
        const relatedDrafts = (item.rawMaterialCostAllocationDrafts ?? []).filter((record) => relatedDraftIds.has(record.costAllocationDraftId));
        const orderLineIds = [
          ...new Set([
            ...eligibleCalibrations.flatMap((record) => record.orderLineIds ?? []),
            ...relatedDrafts.map((record) => record.orderLineId),
          ].filter(Boolean)),
        ];
        if (!orderLineIds.length) return item;
        const totalCalibratedCostAmount = roundLocalRawMaterialMoney(
          eligibleCalibrations.reduce((sum, record) => sum + Number(record.confirmedCostAmount || 0), 0)
            || relatedDrafts.reduce((sum, record) => sum + Number(record.calibratedCostAmount || record.confirmedCostAmount || record.allocatedCostAmount || 0), 0),
        );
        const warnings = [];
        const lineItems = orderLineIds.map((orderLineId) => {
          const orderLine = orderLines.find((line) => line.id === orderLineId || line.orderLineId === orderLineId) ?? {};
          const customer = customers.find((record) => record.id === orderLine.customerId) ?? {};
          const lineDrafts = relatedDrafts.filter((record) => record.orderLineId === orderLineId);
          const materialCostAmount = roundLocalRawMaterialMoney(
            lineDrafts.reduce((sum, record) => sum + Number(record.calibratedCostAmount || record.confirmedCostAmount || record.allocatedCostAmount || 0), 0)
              || (orderLineIds.length ? totalCalibratedCostAmount / orderLineIds.length : totalCalibratedCostAmount),
          );
          const salesAmount = roundLocalRawMaterialMoney(Number(orderLine.amount || orderLine.finalAmount || orderLine.totalAmount || 0) || 0);
          const grossProfitAmount = salesAmount > 0 ? roundLocalRawMaterialMoney(salesAmount - materialCostAmount) : 0;
          const grossMarginRatePercent = salesAmount > 0 ? Math.round((grossProfitAmount / salesAmount) * 10000) / 100 : 0;
          if (!salesAmount) warnings.push(`${orderLineId}：缺少订单销售金额，毛利率待补订单收入后复核`);
          return {
            orderLineId,
            orderNo: orderLine.orderNo || "",
            customerId: orderLine.customerId || "",
            customerName: customer.name || orderLine.customerName || "",
            productName: orderLine.productName || orderLine.product || "",
            goodsSpec: [orderLine.productName || orderLine.product, orderLine.size, orderLine.color, orderLine.qty ? `${orderLine.qty}个` : ""].filter(Boolean).join(" "),
            quantity: Number(orderLine.qty || orderLine.quantity || 0) || 0,
            salesAmount,
            materialCostAmount,
            grossProfitAmount,
            grossMarginRatePercent,
            marginStatus: salesAmount > 0 ? "已生成/待财务复核" : "需补订单收入",
            costAllocationDraftIds: lineDrafts.map((record) => record.costAllocationDraftId).filter(Boolean),
            productionTaskIds: [...new Set(lineDrafts.map((record) => record.productionTaskId).filter(Boolean))],
          };
        });
        const totalSalesAmount = roundLocalRawMaterialMoney(lineItems.reduce((sum, record) => sum + Number(record.salesAmount || 0), 0));
        const totalMaterialCostAmount = roundLocalRawMaterialMoney(lineItems.reduce((sum, record) => sum + Number(record.materialCostAmount || 0), 0));
        const grossProfitAmount = totalSalesAmount > 0 ? roundLocalRawMaterialMoney(totalSalesAmount - totalMaterialCostAmount) : 0;
        const grossMarginRatePercent = totalSalesAmount > 0 ? Math.round((grossProfitAmount / totalSalesAmount) * 10000) / 100 : 0;
        const snapshot = {
          marginSnapshotId: `RMMG-LOCAL-${Date.now().toString(36).toUpperCase()}`,
          inboundId: item.id,
          supplierName: item.supplierName,
          deliveryNoteNo: item.deliveryNoteNo,
          lossCalibrationIds: eligibleCalibrations.map((record) => record.lossCalibrationId).filter(Boolean),
          costConfirmationIds: [...new Set(eligibleCalibrations.flatMap((record) => record.costConfirmationIds ?? []).filter(Boolean))],
          costAllocationDraftIds: [...relatedDraftIds],
          consumptionRecordIds: [...new Set(eligibleCalibrations.flatMap((record) => record.consumptionRecordIds ?? []).filter(Boolean))],
          issueRecordIds: [...new Set(eligibleCalibrations.flatMap((record) => record.issueRecordIds ?? []).filter(Boolean))],
          productionTaskIds: [...new Set(eligibleCalibrations.flatMap((record) => record.productionTaskIds ?? []).filter(Boolean))],
          orderLineIds,
          lineItems,
          totalSalesAmount,
          totalMaterialCostAmount,
          grossProfitAmount,
          grossMarginRatePercent,
          reviewStatus: "已生成/待财务复核",
          costEffect: "loss_calibrated_material_cost_snapshot",
          marginEffect: "margin_snapshot_pending_review",
          generatedBy: operatorName,
          generatedAt: now,
          note: options.note || "V1 订单毛利快照第一版；只供财务复核，不自动写客户对账或最终结算。",
          warnings,
        };
        const snapshotCalibrationIds = new Set(snapshot.lossCalibrationIds);
        const snapshotDraftIds = new Set(snapshot.costAllocationDraftIds);
        const snapshotConfirmationIds = new Set(snapshot.costConfirmationIds);
        const snapshotIssueRecordIds = new Set(snapshot.issueRecordIds);
        const snapshotConsumptionRecordIds = new Set(snapshot.consumptionRecordIds);
        const nextDrafts = (item.rawMaterialCostAllocationDrafts ?? []).map((record) =>
          snapshotDraftIds.has(record.costAllocationDraftId)
            ? {
                ...record,
                allocationStatus: "毛利快照待复核",
                marginEffect: "margin_snapshot_pending_review",
                marginSnapshotId: snapshot.marginSnapshotId,
                marginSnapshotStatus: "已生成/待财务复核",
                marginSnapshotGeneratedBy: operatorName,
                marginSnapshotGeneratedAt: now,
              }
            : record,
        );
        const nextConfirmations = (item.rawMaterialCostAllocationConfirmations ?? []).map((record) =>
          snapshotConfirmationIds.has(record.costConfirmationId)
            ? {
                ...record,
                reviewStatus: "毛利快照待复核",
                marginEffect: "margin_snapshot_pending_review",
                marginSnapshotId: snapshot.marginSnapshotId,
                marginSnapshotStatus: "已生成/待财务复核",
                marginSnapshotGeneratedBy: operatorName,
                marginSnapshotGeneratedAt: now,
              }
            : record,
        );
        const nextCalibrations = existingCalibrations.map((record) =>
          snapshotCalibrationIds.has(record.lossCalibrationId)
            ? {
                ...record,
                calibrationStatus: "已生成毛利快照/待复核",
                marginEffect: "margin_snapshot_pending_review",
                marginSnapshotId: snapshot.marginSnapshotId,
                marginSnapshotStatus: "已生成/待财务复核",
                marginSnapshotGeneratedBy: operatorName,
                marginSnapshotGeneratedAt: now,
              }
            : record,
        );
        const nextIssueRecords = (item.rawMaterialIssueRecords ?? []).map((record) =>
          snapshotIssueRecordIds.has(record.issueRecordId)
            ? {
                ...record,
                costAllocationStatus: "毛利快照待复核",
                marginSnapshotId: snapshot.marginSnapshotId,
                marginSnapshotGeneratedAt: now,
                marginSnapshotGeneratedBy: operatorName,
              }
            : record,
        );
        const nextConsumptionRecords = (item.rawMaterialConsumptionRecords ?? []).map((record) =>
          snapshotConsumptionRecordIds.has(record.consumptionRecordId)
            ? {
                ...record,
                costAllocationStatus: "毛利快照待复核",
                marginSnapshotId: snapshot.marginSnapshotId,
                marginSnapshotGeneratedAt: now,
                marginSnapshotGeneratedBy: operatorName,
              }
            : record,
        );
        const nextSnapshots = [...existingSnapshots, snapshot];
        updatedItem = {
          ...item,
          costAllocationStatus: "毛利快照待复核",
          costAllocationReviewStatus: "毛利快照待复核",
          marginSnapshotStatus: "已生成/待财务复核",
          marginSnapshotCount: nextSnapshots.length,
          marginSnapshotId: snapshot.marginSnapshotId,
          marginSnapshotTotalSalesAmount: totalSalesAmount,
          marginSnapshotMaterialCostAmount: totalMaterialCostAmount,
          marginSnapshotGrossProfitAmount: grossProfitAmount,
          marginSnapshotGrossMarginRatePercent: grossMarginRatePercent,
          marginSnapshotGeneratedBy: operatorName,
          marginSnapshotGeneratedAt: now,
          nextStep: "已生成订单毛利快照，等待财务复核；不自动写客户对账或最终财务结算。",
          rawMaterialIssueRecords: nextIssueRecords,
          rawMaterialConsumptionRecords: nextConsumptionRecords,
          rawMaterialCostAllocationDrafts: nextDrafts,
          rawMaterialCostAllocationConfirmations: nextConfirmations,
          rawMaterialCostLossCalibrations: nextCalibrations,
          rawMaterialOrderMarginSnapshots: nextSnapshots,
          rawMaterialCostAllocationWarnings: [...(item.rawMaterialCostAllocationWarnings ?? []), ...warnings],
        };
        return updatedItem;
      }
      if (action === "复核毛利快照") {
        const existingSnapshots = item.rawMaterialOrderMarginSnapshots ?? [];
        if (!existingSnapshots.length) return item;
        const existingReports = item.rawMaterialOrderMarginReports ?? [];
        const reportedSnapshotIds = new Set(existingReports.flatMap((record) => record.marginSnapshotIds ?? []).filter(Boolean));
        const reviewableSnapshots = existingSnapshots.filter(
          (record) =>
            !reportedSnapshotIds.has(record.marginSnapshotId) &&
            record.marginEffect !== "reviewed_margin_report_snapshot" &&
            record.reviewStatus !== "已财务复核/报表可用",
        );
        if (!reviewableSnapshots.length) return item;
        const missingRevenue = reviewableSnapshots.some(
          (record) =>
            (record.lineItems ?? []).some((line) => Number(line.salesAmount || 0) <= 0 || line.marginStatus === "需补订单收入") ||
            (record.warnings ?? []).some((warning) => String(warning).includes("缺少订单销售金额")),
        );
        if (missingRevenue) return item;
        const lineItems = reviewableSnapshots.flatMap((snapshot) =>
          (snapshot.lineItems ?? []).map((line) => ({
            ...line,
            marginSnapshotId: snapshot.marginSnapshotId,
            marginStatus: "已财务复核/报表可用",
          })),
        );
        const totalSalesAmount = roundLocalRawMaterialMoney(lineItems.reduce((sum, record) => sum + Number(record.salesAmount || 0), 0));
        const totalMaterialCostAmount = roundLocalRawMaterialMoney(lineItems.reduce((sum, record) => sum + Number(record.materialCostAmount || 0), 0));
        const grossProfitAmount = roundLocalRawMaterialMoney(totalSalesAmount - totalMaterialCostAmount);
        const grossMarginRatePercent = totalSalesAmount > 0 ? Math.round((grossProfitAmount / totalSalesAmount) * 10000) / 100 : 0;
        const report = {
          marginReportId: `RMMR-LOCAL-${Date.now().toString(36).toUpperCase()}`,
          inboundId: item.id,
          supplierName: item.supplierName,
          deliveryNoteNo: item.deliveryNoteNo,
          marginSnapshotIds: reviewableSnapshots.map((record) => record.marginSnapshotId).filter(Boolean),
          lossCalibrationIds: [...new Set(reviewableSnapshots.flatMap((record) => record.lossCalibrationIds ?? []).filter(Boolean))],
          costConfirmationIds: [...new Set(reviewableSnapshots.flatMap((record) => record.costConfirmationIds ?? []).filter(Boolean))],
          costAllocationDraftIds: [...new Set(reviewableSnapshots.flatMap((record) => record.costAllocationDraftIds ?? []).filter(Boolean))],
          consumptionRecordIds: [...new Set(reviewableSnapshots.flatMap((record) => record.consumptionRecordIds ?? []).filter(Boolean))],
          issueRecordIds: [...new Set(reviewableSnapshots.flatMap((record) => record.issueRecordIds ?? []).filter(Boolean))],
          productionTaskIds: [...new Set(reviewableSnapshots.flatMap((record) => record.productionTaskIds ?? []).filter(Boolean))],
          orderLineIds: [...new Set(reviewableSnapshots.flatMap((record) => record.orderLineIds ?? []).filter(Boolean))],
          lineItems,
          totalSalesAmount,
          totalMaterialCostAmount,
          grossProfitAmount,
          grossMarginRatePercent,
          reviewStatus: "已财务复核/报表可用",
          reportStatus: "已生成内部毛利报表",
          costEffect: "loss_calibrated_material_cost_snapshot",
          marginEffect: "reviewed_margin_report_snapshot",
          reviewedBy: operatorName,
          reviewedAt: now,
          note: options.note || "V1 毛利快照财务复核第一版；生成内部毛利报表，不自动写客户对账或收款结算。",
          warnings: [],
        };
        const reportSnapshotIds = new Set(report.marginSnapshotIds);
        const reportDraftIds = new Set(report.costAllocationDraftIds);
        const reportConfirmationIds = new Set(report.costConfirmationIds);
        const reportCalibrationIds = new Set(report.lossCalibrationIds);
        const reportIssueRecordIds = new Set(report.issueRecordIds);
        const reportConsumptionRecordIds = new Set(report.consumptionRecordIds);
        const nextDrafts = (item.rawMaterialCostAllocationDrafts ?? []).map((record) =>
          reportDraftIds.has(record.costAllocationDraftId)
            ? {
                ...record,
                allocationStatus: "毛利已复核/报表可用",
                marginEffect: "reviewed_margin_report_snapshot",
                marginReportId: report.marginReportId,
                marginReviewStatus: "已财务复核/报表可用",
                marginReviewedBy: operatorName,
                marginReviewedAt: now,
              }
            : record,
        );
        const nextConfirmations = (item.rawMaterialCostAllocationConfirmations ?? []).map((record) =>
          reportConfirmationIds.has(record.costConfirmationId)
            ? {
                ...record,
                reviewStatus: "毛利已复核/报表可用",
                marginEffect: "reviewed_margin_report_snapshot",
                marginReportId: report.marginReportId,
                marginReviewStatus: "已财务复核/报表可用",
                marginReviewedBy: operatorName,
                marginReviewedAt: now,
              }
            : record,
        );
        const nextCalibrations = (item.rawMaterialCostLossCalibrations ?? []).map((record) =>
          reportCalibrationIds.has(record.lossCalibrationId)
            ? {
                ...record,
                calibrationStatus: "毛利已复核/报表可用",
                marginEffect: "reviewed_margin_report_snapshot",
                marginReportId: report.marginReportId,
                marginReviewStatus: "已财务复核/报表可用",
                marginReviewedBy: operatorName,
                marginReviewedAt: now,
              }
            : record,
        );
        const nextIssueRecords = (item.rawMaterialIssueRecords ?? []).map((record) =>
          reportIssueRecordIds.has(record.issueRecordId)
            ? {
                ...record,
                costAllocationStatus: "毛利已复核/报表可用",
                marginReportId: report.marginReportId,
                marginReviewedAt: now,
                marginReviewedBy: operatorName,
              }
            : record,
        );
        const nextConsumptionRecords = (item.rawMaterialConsumptionRecords ?? []).map((record) =>
          reportConsumptionRecordIds.has(record.consumptionRecordId)
            ? {
                ...record,
                costAllocationStatus: "毛利已复核/报表可用",
                marginReportId: report.marginReportId,
                marginReviewedAt: now,
                marginReviewedBy: operatorName,
              }
            : record,
        );
        const nextSnapshots = existingSnapshots.map((record) =>
          reportSnapshotIds.has(record.marginSnapshotId)
            ? {
                ...record,
                reviewStatus: "已财务复核/报表可用",
                reportStatus: "已生成内部毛利报表",
                marginEffect: "reviewed_margin_report_snapshot",
                marginReportId: report.marginReportId,
                reviewedBy: operatorName,
                reviewedAt: now,
                lineItems: (record.lineItems ?? []).map((line) => ({
                  ...line,
                  marginStatus: "已财务复核/报表可用",
                })),
              }
            : record,
        );
        const nextReports = [...existingReports, report];
        updatedItem = {
          ...item,
          costAllocationStatus: "毛利已复核/报表可用",
          costAllocationReviewStatus: "毛利已复核/报表可用",
          marginSnapshotStatus: "已财务复核/报表可用",
          marginReportStatus: "已生成内部毛利报表",
          marginReportCount: nextReports.length,
          marginReportId: report.marginReportId,
          marginReportTotalSalesAmount: totalSalesAmount,
          marginReportMaterialCostAmount: totalMaterialCostAmount,
          marginReportGrossProfitAmount: grossProfitAmount,
          marginReportGrossMarginRatePercent: grossMarginRatePercent,
          marginReviewedBy: operatorName,
          marginReviewedAt: now,
          nextStep: "毛利快照已财务复核，已形成内部毛利报表；客户对账和最终收款结算仍走独立流程。",
          rawMaterialIssueRecords: nextIssueRecords,
          rawMaterialConsumptionRecords: nextConsumptionRecords,
          rawMaterialCostAllocationDrafts: nextDrafts,
          rawMaterialCostAllocationConfirmations: nextConfirmations,
          rawMaterialCostLossCalibrations: nextCalibrations,
          rawMaterialOrderMarginSnapshots: nextSnapshots,
          rawMaterialOrderMarginReports: nextReports,
        };
        return updatedItem;
      }
      if (action === "标记异常") {
        updatedItem = {
          ...item,
          status: "入库异常/待确认",
          exceptionBy: operatorName,
          exceptionAt: now,
          nextStep: "补照片 / 补重量 / 供应商确认后重新复核。",
          note: `${item.note || ""} 入库异常：${options.reason || "现场标记异常，待补充。"}`.trim(),
        };
        return updatedItem;
      }
      return item;
    });
    return { items: nextItems, updatedItem };
  }

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

  async function saveRawMaterialSupplierStatementReviewDraft(statementResult, options = {}) {
    if (!guardUiAction("rawMaterial", "复核送货单")) return null;
    const result = await createOfficeRawMaterialSupplierStatementReviewDraft({
      authState,
      operatorId: currentUserId,
      statementResult,
      supplierName: options.supplierName,
      fileName: options.fileName,
      note: options.note,
    });
    if (result.blocked || !result.review?.reviewId) {
      setRawMaterialSupplierStatementReviewMeta((current) => ({
        ...current,
        source: result.source,
        error: result.error?.message ?? "保存供应商月结复核草稿失败。",
      }));
      setToast(
        result.error?.requiredPermission
          ? `后端拒绝保存月结复核草稿：缺少权限 ${result.error.requiredPermission}。`
          : `保存月结复核草稿失败：${result.error?.message ?? "未知错误"}`,
      );
      return null;
    }
    setRawMaterialSupplierStatementReviews((current) => [
      result.review,
      ...current.filter((item) => item.reviewId !== result.review.reviewId),
    ].slice(0, 20));
    setRawMaterialSupplierStatementReviewMeta((current) => ({
      ...current,
      source: "api",
      total: Math.max(current.total || 0, rawMaterialSupplierStatementReviewsRef.current.length + 1),
      error: "",
      lastSyncedAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    }));
    setToast(`已保存供应商月结复核草稿 ${result.review.reviewId}；仍不写库存、不生成应付、不确认付款。`);
    return result.review;
  }

  async function confirmRawMaterialSupplierStatementReviewDraft(reviewId, options = {}) {
    if (!guardUiAction("rawMaterial", "复核送货单")) return null;
    const result = await confirmOfficeRawMaterialSupplierStatementReview({
      authState,
      operatorId: currentUserId,
      reviewId,
      decision: options.decision,
      note: options.note,
    });
    if (result.blocked || !result.review?.reviewId) {
      setToast(
        result.error?.requiredPermission
          ? `后端拒绝确认月结复核草稿：缺少权限 ${result.error.requiredPermission}。`
          : `确认月结复核草稿失败：${result.error?.message ?? "未知错误"}`,
      );
      return null;
    }
    setRawMaterialSupplierStatementReviews((current) =>
      current.map((item) => (item.reviewId === result.review.reviewId ? result.review : item)),
    );
    setToast(`已标记月结复核草稿 ${result.review.reviewId} 为${result.review.status}；财务付款仍需另走确认。`);
    return result.review;
  }

  async function confirmRawMaterialSupplierStatement(reviewId, options = {}) {
    if (!guardUiAction("rawMaterial", "复核送货单")) return null;
    const result = await confirmOfficeRawMaterialSupplierStatement({
      authState,
      operatorId: currentUserId,
      reviewId,
      note: options.note,
    });
    if (result.blocked || !result.review?.reviewId) {
      setToast(
        result.error?.requiredPermission
          ? `后端拒绝确认供应商月结对账：缺少权限 ${result.error.requiredPermission}。`
          : `确认供应商月结对账失败：${result.error?.message ?? "未知错误"}`,
      );
      return null;
    }
    setRawMaterialSupplierStatementReviews((current) =>
      current.map((item) => (item.reviewId === result.review.reviewId ? result.review : item)),
    );
    setToast(
      `已确认供应商月结对账 ${result.review.statementConfirmationId || result.review.reviewId}；付款状态：${result.review.paymentStatus || "待财务付款确认"}。`,
    );
    return result.review;
  }

  async function generateRawMaterialSupplierPayableDraft(reviewId, options = {}) {
    if (!guardUiAction("rawMaterial", "生成应付")) return null;
    const result = await generateOfficeRawMaterialSupplierPayableDraft({
      authState,
      operatorId: currentUserId,
      reviewId,
      note: options.note,
    });
    if (result.blocked || !result.review?.reviewId) {
      setToast(
        result.error?.requiredPermission
          ? `后端拒绝生成供应商应付草稿：缺少权限 ${result.error.requiredPermission}。`
          : `生成供应商应付草稿失败：${result.error?.message ?? "未知错误"}`,
      );
      return null;
    }
    setRawMaterialSupplierStatementReviews((current) =>
      current.map((item) => (item.reviewId === result.review.reviewId ? result.review : item)),
    );
    const amount = result.review.supplierPayableDraft?.payableAmount ?? result.payableDraft?.payableAmount ?? 0;
    setToast(`已生成供应商应付草稿 ${result.review.supplierPayableId}，金额 ¥${amount}；付款仍需财务确认。`);
    return result.review;
  }

  async function confirmRawMaterialSupplierPayment(reviewId, options = {}) {
    if (!guardUiAction("rawMaterial", "确认付款")) return null;
    const result = await confirmOfficeRawMaterialSupplierPayment({
      authState,
      operatorId: currentUserId,
      reviewId,
      paidAmount: options.paidAmount,
      paymentMethod: options.paymentMethod,
      paymentAccount: options.paymentAccount,
      paymentReferenceNo: options.paymentReferenceNo,
      paymentVoucherNo: options.paymentVoucherNo,
      paidAt: options.paidAt,
      note: options.note,
    });
    if (result.blocked || !result.review?.reviewId) {
      setToast(
        result.error?.requiredPermission
          ? `后端拒绝确认供应商付款：缺少权限 ${result.error.requiredPermission}。`
          : `确认供应商付款失败：${result.error?.message ?? "未知错误"}`,
      );
      return null;
    }
    setRawMaterialSupplierStatementReviews((current) =>
      current.map((item) => (item.reviewId === result.review.reviewId ? result.review : item)),
    );
    const paymentId = result.review.supplierPaymentConfirmationId || result.paymentRecord?.supplierPaymentConfirmationId;
    const amount = result.review.supplierPaymentRecord?.paidAmount ?? result.paymentRecord?.paidAmount ?? 0;
    setToast(`已确认供应商付款 ${paymentId}，金额 ¥${amount}；该动作只记录付款，不写原材料库存。`);
    return result.review;
  }

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
    if (activePage !== "packing") return undefined;
    let cancelled = false;
    refreshPrintDriverConfig({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshPrintDriverConfig]);

  useEffect(() => {
    if (activePage !== "packing") return undefined;
    let cancelled = false;
    refreshPrintDriverReadiness({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshPrintDriverReadiness]);

  useEffect(() => {
    if (activePage !== "packing") return undefined;
    let cancelled = false;
    refreshPrintDriverCupsDiagnostics({ showToast: false }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [activePage, refreshPrintDriverCupsDiagnostics]);

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
        void Promise.all([
          refreshProductionPackingTaskLists({ showToast: false }),
          refreshPrintDriverConfig({ showToast: false }),
          refreshPrintDriverReadiness({ showToast: false }),
          refreshPrintDriverCupsDiagnostics({ showToast: false }),
          refreshPrinterDeviceQa({ showToast: false }),
          refreshOfficePrintJobQueue({ showToast: false }),
        ]).then(() => {
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

  async function handleDriverDeliveryAction(action, payload = {}) {
    if (!guardUiAction("driverMobile", action)) return;
    const task = driverDeliveryTasks.find((item) => item.fulfillmentId === payload.fulfillmentId) ?? payload.task ?? driverDeliveryTasks[0];
    const fulfillment = fulfillments.find((item) => item.id === (task?.fulfillmentId ?? payload.fulfillmentId));
    if (!task || !fulfillment) {
      setToast("未找到司机送货任务，无法继续。");
      return;
    }

    if (action === "保存验收") {
      const apiResult = await recordDriverDeviceFieldTest({
        authState,
        task,
        fulfillmentId: task.fulfillmentId,
        operatorId: currentUserId,
        record: payload.record,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝保存现场验收：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝保存现场验收：${apiResult.error?.message ?? "未知错误"}`,
        );
        return apiResult;
      }
      const savedRecord = apiResult.record ?? payload.record;
      setFulfillments((current) =>
        current.map((item) =>
          item.id === task.fulfillmentId
            ? {
                ...item,
                deviceFieldTestRecord: savedRecord,
                deviceFieldTestSummary: savedRecord?.summary ?? null,
              }
            : item,
        ),
      );
      setDriverDeliveryTasks((current) =>
        current.map((item) =>
          item.fulfillmentId === task.fulfillmentId
            ? {
                ...item,
                deviceFieldTestRecord: savedRecord,
                deviceFieldTestSummary: savedRecord?.summary ?? null,
              }
            : item,
        ),
      );
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`已通过${sourceLabel}保存司机现场验收：${savedRecord?.summary?.label ?? "已记录"}。`);
      if (apiResult.source === "api") void refreshDriverDeliveryTasks({ showToast: false });
      return apiResult;
    }

    if (action === "确认已装车") {
      const routeRemark = [payload.routeLabel, payload.routeStopLabel]
        .filter((item) => item && item !== "未排路线" && item !== "未排站序")
        .join(" ");
      const packageCheckState = getDriverLoadPackageCheckState(task, payload.checkedPackageIds ?? []);
      if (!packageCheckState.allChecked) {
        setToast(`请先核对全部包裹：当前 ${packageCheckState.summary}，还有 ${packageCheckState.missingCount} 包未确认。`);
        return;
      }
      const apiResult = await confirmDriverDeliveryLoaded({
        authState,
        task,
        fulfillmentId: task.fulfillmentId,
        operatorId: currentUserId,
        remark: payload.remark || `${currentUser.displayName} 在司机端确认已装车${routeRemark ? `：${routeRemark}` : ""}`,
        checkedPackageIds: payload.checkedPackageIds ?? [],
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝确认装车：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝确认装车：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      setFulfillments((current) =>
        current.map((item) =>
          item.id === task.fulfillmentId
            ? {
                ...item,
                status: "配送中",
                driverStatus: "配送中",
                driverId: currentUserId,
                loadedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
      setDriverDeliveryTasks((current) =>
        current.map((item) => (item.fulfillmentId === task.fulfillmentId ? { ...item, status: "配送中", loadedAt: new Date().toISOString() } : item)),
      );
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`已通过${sourceLabel}记录司机已装车${routeRemark ? `：${routeRemark}` : ""}，${packageCheckState.summary} 已核对，任务进入配送中。`);
      if (apiResult.source === "api") void refreshDriverDeliveryTasks({ showToast: false });
      return;
    }

    if (action === "提交送达") {
      let watermarkedPhotoAttachmentId = payload.watermarkedPhotoAttachmentId || "";
      let signaturePhotoAttachmentId = payload.signaturePhotoAttachmentId || "";
      let watermarkedPhotoAttachment = null;
      let signaturePhotoAttachment = null;
      let deliveryEvidenceSource = "";
      let watermarkMetadata = buildDriverDeliveryWatermarkMetadata({
        task,
        operatorId: currentUserId,
        operatorName: currentUser.displayName || currentUser.loginName || currentUserId,
        locationLabel: payload.watermarkLocationLabel,
        geoPoint: payload.watermarkGeoPoint,
      });

      if (payload.watermarkedPhotoFile && !watermarkedPhotoAttachmentId) {
        const contentDataUrl = await readFileAsDataUrl(payload.watermarkedPhotoFile);
        const watermarkedContentDataUrl = await createWatermarkedDeliveryImageDataUrl(contentDataUrl, watermarkMetadata);
        const watermarkedFileName = getWatermarkedDeliveryFileName(payload.watermarkedPhotoFile.name, watermarkMetadata.watermarkId);
        const watermarkImageStatus = watermarkedContentDataUrl !== contentDataUrl ? "pixel_watermark_rendered" : "metadata_only";
        watermarkMetadata = {
          ...watermarkMetadata,
          watermarkImageStatus,
          originalFileName: payload.watermarkedPhotoFile.name,
          uploadedFileName: watermarkedFileName,
        };
        const attachmentInput = createDeliveryEvidenceAttachmentInput({
          task,
          fulfillmentId: task.fulfillmentId,
          operatorId: currentUserId,
          evidenceType: "watermark",
          remark: payload.remark || `${currentUser.displayName} 上传送货水印照片；${watermarkMetadata.watermarkId}`,
          metadata: watermarkMetadata,
          file: {
            name: watermarkedFileName,
            size: estimateDataUrlByteSize(watermarkedContentDataUrl) ?? payload.watermarkedPhotoFile.size,
            type: "image/jpeg",
            contentDataUrl: watermarkedContentDataUrl,
          },
        });
        const attachmentResult = await createOfficeAttachment({
          authState,
          ...attachmentInput,
        });
        if (attachmentResult.blocked) {
          setToast(
            attachmentResult.error?.requiredPermission
              ? `后端拒绝上传送货水印照片：缺少权限 ${attachmentResult.error.requiredPermission}。`
              : `后端拒绝上传送货水印照片：${attachmentResult.error?.message ?? "未知错误"}`,
          );
          return;
        }
        watermarkedPhotoAttachment = attachmentResult.attachment ?? null;
        watermarkedPhotoAttachmentId = watermarkedPhotoAttachment?.attachmentId || "";
        deliveryEvidenceSource = attachmentResult.source;
      }

      if (payload.signaturePhotoFile && !signaturePhotoAttachmentId) {
        const contentDataUrl = await readFileAsDataUrl(payload.signaturePhotoFile);
        const attachmentInput = createDeliveryEvidenceAttachmentInput({
          task,
          fulfillmentId: task.fulfillmentId,
          operatorId: currentUserId,
          evidenceType: "signature",
          remark: payload.remark || `${currentUser.displayName} 上传送货签收照片`,
          metadata: {
            relatedWatermarkId: watermarkMetadata.watermarkId,
            capturedAt: watermarkMetadata.watermarkCapturedAt,
            fulfillmentId: task.fulfillmentId,
            deliveryNoteNo: task.deliveryNoteNo || "",
          },
          file: {
            name: payload.signaturePhotoFile.name,
            size: payload.signaturePhotoFile.size,
            type: payload.signaturePhotoFile.type,
            contentDataUrl,
          },
        });
        const attachmentResult = await createOfficeAttachment({
          authState,
          ...attachmentInput,
        });
        if (attachmentResult.blocked) {
          setToast(
            attachmentResult.error?.requiredPermission
              ? `后端拒绝上传签收照片：缺少权限 ${attachmentResult.error.requiredPermission}。`
              : `后端拒绝上传签收照片：${attachmentResult.error?.message ?? "未知错误"}`,
          );
          return;
        }
        signaturePhotoAttachment = attachmentResult.attachment ?? null;
        signaturePhotoAttachmentId = signaturePhotoAttachment?.attachmentId || "";
        deliveryEvidenceSource = deliveryEvidenceSource || attachmentResult.source;
      }

      const apiResult = await completeDriverDeliveryTask({
        authState,
        task,
        fulfillmentId: task.fulfillmentId,
        actualQty: payload.actualQty ?? task.qty,
        operatorId: currentUserId,
        watermarkedPhotoAttached: payload.watermarkedPhotoAttached,
        watermarkedPhotoAttachmentId,
        ...watermarkMetadata,
        signaturePhotoAttached: payload.signaturePhotoAttached,
        signaturePhotoAttachmentId,
        receiverName: payload.receiverName,
        paperNoteStatus: payload.paperNoteStatus,
        remark: payload.remark || `${currentUser.displayName} 在司机端提交送达凭证`,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝完成送货：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝完成送货：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      const completedAt = new Date().toISOString();
      const deliveryEvidenceAttachments = [watermarkedPhotoAttachment, signaturePhotoAttachment].filter(Boolean);
      setFulfillments((current) =>
        current.map((item) =>
          item.id === task.fulfillmentId
            ? {
                ...item,
                status: "已交付",
                driverStatus: "已完成",
                actualQty: Number(payload.actualQty ?? task.qty ?? item.qty ?? 0),
                printed: true,
                deliveredAt: completedAt,
                completedAt,
                confirmedBy: currentUserId,
                receiverName: payload.receiverName || item.receiverName || "",
                paperNoteStatus: payload.paperNoteStatus || item.paperNoteStatus || "已交回",
                watermarkedPhotoAttached: true,
                watermarkedPhotoAttachmentId: watermarkedPhotoAttachmentId || item.watermarkedPhotoAttachmentId || "",
                ...watermarkMetadata,
                signaturePhotoAttached: Boolean(payload.signaturePhotoAttached || signaturePhotoAttachmentId),
                signaturePhotoAttachmentId: signaturePhotoAttachmentId || item.signaturePhotoAttachmentId || "",
                deliveryEvidenceReviewStatus: "待复核",
                deliveryEvidenceReviewedAt: "",
                deliveryEvidenceReviewedBy: "",
                deliveryEvidenceIssueReason: "",
                deliveryEvidenceAttachmentFiles: mergeAttachmentSummaries(item.deliveryEvidenceAttachmentFiles, deliveryEvidenceAttachments),
              }
            : item,
        ),
      );
      setDriverDeliveryTasks((current) =>
        current.map((item) =>
          item.fulfillmentId === task.fulfillmentId
            ? {
                ...item,
                status: "已完成",
                completedAt,
                receiverName: payload.receiverName || item.receiverName,
                paperNoteStatus: payload.paperNoteStatus || item.paperNoteStatus || "已交回",
                watermarkedPhotoAttached: true,
                watermarkedPhotoAttachmentId: watermarkedPhotoAttachmentId || item.watermarkedPhotoAttachmentId || "",
                ...watermarkMetadata,
                signaturePhotoAttached: Boolean(payload.signaturePhotoAttached || signaturePhotoAttachmentId),
                signaturePhotoAttachmentId: signaturePhotoAttachmentId || item.signaturePhotoAttachmentId || "",
                deliveryEvidenceReviewStatus: "待复核",
              }
            : item,
        ),
      );
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      const evidenceLabel = watermarkedPhotoAttachmentId
        ? `，水印照片附件 ${watermarkedPhotoAttachmentId} 已保存`
        : deliveryEvidenceSource
          ? "，水印照片已上传"
          : "，水印照片已记录";
      setToast(`已通过${sourceLabel}提交送达凭证${evidenceLabel}；送达证据等待办公室复核。`);
      if (apiResult.source === "api") void refreshDriverDeliveryTasks({ showToast: false });
      return;
    }

    if (action === "装车异常" || action === "送货异常") {
      const reason = payload.reason || (action === "装车异常" ? "装车少货" : "其他");
      const apiResult = await reportDriverDeliveryException({
        authState,
        task,
        fulfillmentId: task.fulfillmentId,
        operatorId: currentUserId,
        reason,
        actualQty: payload.actualQty ?? task.qty,
        remark: payload.remark || reason,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝记录送货异常：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝记录送货异常：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      setFulfillments((current) =>
        current.map((item) =>
          item.id === task.fulfillmentId
            ? {
                ...item,
                status: "送货异常",
                driverStatus: "送货异常",
                exceptionReason: reason,
                actualQty: Number(payload.actualQty ?? task.qty ?? item.qty ?? 0),
              }
            : item,
        ),
      );
      setDriverDeliveryTasks((current) =>
        current.map((item) =>
          item.fulfillmentId === task.fulfillmentId
            ? { ...item, status: "送货异常", exceptionReason: reason, officeNote: reason }
            : item,
        ),
      );
      const existingTodo = todos.find((item) => item.ref === task.orderLineId && item.type === "送货异常待处理" && !item.handled);
      if (!existingTodo) {
        addTodo({
          id: apiResult.todoId || undefined,
          type: "送货异常待处理",
          customerId: task.customerId,
          ref: task.orderLineId,
          summary: `${task.customerName} ${task.goodsSummary}：${reason}`,
          latest: task.latest,
          urgency: "异常",
          impact: "需办公室联系客户、仓库或司机确认下一步",
        });
      }
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`已通过${sourceLabel}记录${action}，异常回到办公室公共待办。`);
      if (apiResult.source === "api") void refreshDriverDeliveryTasks({ showToast: false });
    }
  }

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
          <WorkspaceNotice>{toast}</WorkspaceNotice>
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
          )}
        </main>
      </div>

      {modal && <ActionModal modal={modal} fulfillments={fulfillments} statements={statements} orderLines={orderLines} onClose={closeModal} onConfirm={confirmModal} />}
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

function RuntimeLoginScreen({ error, form, loading, onChange, onSubmit }) {
  return (
    <main className="runtime-login-shell">
      <form className="runtime-login-panel" onSubmit={onSubmit}>
        <div className="runtime-login-brand">
          <div className="brand-mark">ERP</div>
          <div>
            <strong>设计中心小工厂</strong>
            <span>生产系统</span>
          </div>
        </div>
        <div className="runtime-login-heading">
          <h1>账号登录</h1>
          <p>使用已启用的正式员工账号。</p>
        </div>
        <label className="runtime-login-field">
          <span>登录名</span>
          <input
            autoComplete="username"
            autoFocus
            name="loginName"
            onChange={(event) => onChange("loginName", event.target.value)}
            placeholder="请输入登录名"
            value={form.loginName}
          />
        </label>
        <label className="runtime-login-field">
          <span>密码</span>
          <input
            autoComplete="current-password"
            name="password"
            onChange={(event) => onChange("password", event.target.value)}
            placeholder="请输入密码"
            type="password"
            value={form.password}
          />
        </label>
        {error ? <p className="runtime-login-error" role="alert">{error}</p> : null}
        <button className="primary-button runtime-login-submit" disabled={loading} type="submit">
          <UserOutlined />
          {loading ? "登录中" : "登录"}
        </button>
      </form>
    </main>
  );
}

function Topbar({ authSourceLabel, currentUserId, currentUser, onCreateOrder, onUserChange, todoCount, userOptions, getUiActionState }) {
  const createOrderState = getUiActionState("topbar", "新建订单");
  return (
    <header className="topbar">
      <div className="factory-switcher">
        虎门工厂
        <DownOutlined />
      </div>
      <label className="search">
        <SearchOutlined />
        <input placeholder="搜索客户 / 订单 / 尺寸 / 颜色 / 单据" />
      </label>
      <div className="sync-status">
        <span className="dot" />
        {authSourceLabel}
      </div>
      <span className="last-sync">当前：2026-06-29 10:30</span>
      <button className="primary-button" disabled={createOrderState.disabled} title={createOrderState.title} onClick={onCreateOrder}>
        <PlusOutlined />
        新建订单
      </button>
      <button className="icon-button has-badge" aria-label={`通知 ${todoCount}`} data-count={todoCount}>
        <BellOutlined />
      </button>
      <button className="icon-button" aria-label="用户">
        <UserOutlined />
      </button>
      <div className="user-block">
        <strong>{currentUser.displayName}</strong>
        {userOptions.length > 1 ? (
          <select aria-label="切换当前账号" value={currentUserId} onChange={(event) => onUserChange(event.target.value)}>
            {userOptions.map((item) => (
              <option key={item.userId} value={item.userId}>{item.displayName} · {item.roleLabel}</option>
            ))}
          </select>
        ) : (
          <span>{currentUser.defaultRole || "正式账号"}</span>
        )}
      </div>
    </header>
  );
}

function AttachmentViewerModal({ attachment, onClose, onDownload }) {
  const viewerTitle = attachment.viewerTitle || (attachment.statementId ? "付款凭证预览" : "附件预览");
  const title = attachment.fileName || attachment.attachmentId || viewerTitle;
  const typeLabel = attachment.mimeType || attachment.contentType || "类型未记录";
  const sizeLabel = Number.isFinite(Number(attachment.fileSize)) ? formatFileSize(attachment.fileSize) : "大小未记录";
  const timeLabel = attachment.uploadedAt || attachment.createdAt || "时间未记录";
  const canDownload = Boolean(attachment.previewDataUrl);
  const canInlinePreview = Boolean(attachment.previewDataUrl && isInlineImageAttachment(attachment));
  const accessAudit = attachment.accessAudit ?? { items: [], total: 0, status: "访问记录未加载" };
  const accessItems = Array.isArray(accessAudit.items) ? accessAudit.items : [];

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal attachment-viewer-modal" role="dialog" aria-modal="true" aria-label={viewerTitle}>
        <div className="modal-title">
          <div>
            <span>{viewerTitle}</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        <div className="attachment-viewer-body">
          {canInlinePreview ? (
            <img src={attachment.previewDataUrl} alt={title} />
          ) : attachment.previewDataUrl ? (
            <div className="attachment-viewer-file-card">
              <strong>{title}</strong>
              <span>{typeLabel}</span>
              <small>当前附件已读取，可下载原文件查看。</small>
            </div>
          ) : (
            <div className="attachment-viewer-empty">当前附件还没有可读取内容</div>
          )}
        </div>
        <div className="attachment-viewer-meta">
          <span>{typeLabel}</span>
          <span>{sizeLabel}</span>
          <span>{timeLabel}</span>
          {attachment.previewStatus && <span>{attachment.previewStatus}</span>}
        </div>
        <section className="attachment-viewer-audit" aria-label="附件访问记录">
          <div className="attachment-viewer-audit-head">
            <strong>访问记录</strong>
            <span>{accessAudit.status}</span>
          </div>
          {accessItems.length ? (
            <div className="attachment-viewer-audit-list">
              {accessItems.map((record) => (
                <div className="attachment-viewer-audit-row" key={record.logId || record.operationLogId}>
                  <span>{getAttachmentAccessActionLabel(record.action)}</span>
                  <strong>{record.operatorId || "未知账号"}</strong>
                  <small>{getAttachmentAccessModeLabel(record)} · {formatAttachmentAccessTime(record.occurredAt)}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="attachment-viewer-audit-empty">{accessAudit.status || "暂无访问记录"}</div>
          )}
        </section>
        <div className="modal-actions">
          <button disabled={!canDownload} onClick={() => onDownload(attachment)}>下载附件</button>
          <button className="primary-action" onClick={onClose}>关闭</button>
        </div>
      </section>
    </div>
  );
}

function MasterDataImportTemplateModal({
  panel,
  onClose,
  onDownload,
  onPrecheck,
  precheckState,
  reviewDrafts,
  onCreateReviewDraft,
  confirmationPlans,
  onCreateConfirmationPlan,
  importExecutions,
  employeeAccountReviews,
  lastIssuedEmployeeCredential,
  getUiActionState,
  onCreateImportExecution,
  onCommitImportExecution,
  onDownloadFailedRows,
  onCreateFailedRowsCorrectionDraft,
  onRefreshEmployeeAccountReviews,
  onEnableEmployeeAccount,
  onIssueEmployeePassword,
  onRevokeEmployeePassword,
}) {
  const templateSets = getMasterDataImportTemplateSets();
  const definitions = getMasterDataImportTemplateDefinitions();
  const sourceLabel = panel?.sourceLabel || "基础资料";
  const precheck = precheckState ?? { status: "idle" };
  const precheckResult = precheck.result;
  const topIssues = precheckResult?.issues?.slice(0, 6) ?? [];
  const statusTone = getMasterDataPrecheckTone(precheckResult?.summary?.status);
  const draftItems = Array.isArray(reviewDrafts) ? reviewDrafts : [];
  const planItems = Array.isArray(confirmationPlans) ? confirmationPlans : [];
  const executionItems = Array.isArray(importExecutions) ? importExecutions : [];
  const employeeReviewItems = Array.isArray(employeeAccountReviews) ? employeeAccountReviews : [];
  const canQueuePrecheckResult = precheckResult ? canCreateMasterDataImportReviewDraft(precheckResult) : false;
  const createExecutionState = getUiActionState?.("masterData", "生成执行记录") ?? { disabled: false, title: "" };
  const commitExecutionState = getUiActionState?.("masterData", "正式导入") ?? { disabled: false, title: "" };
  const downloadFailedRowsState = getUiActionState?.("masterData", "下载失败行") ?? { disabled: false, title: "" };
  const createCorrectionDraftState = getUiActionState?.("masterData", "生成修正草稿") ?? { disabled: false, title: "" };
  const refreshEmployeeReviewState = getUiActionState?.("masterData", "刷新员工复核") ?? { disabled: false, title: "" };
  const enableEmployeeReviewState = getUiActionState?.("masterData", "复核启用员工账号") ?? { disabled: false, title: "" };
  const issueEmployeePasswordState = getUiActionState?.("masterData", "发放员工临时密码") ?? { disabled: false, title: "" };
  const revokeEmployeePasswordState = getUiActionState?.("masterData", "撤销员工密码") ?? { disabled: false, title: "" };
  const [expandedCorrectionExecutionId, setExpandedCorrectionExecutionId] = useState("");
  const [failedRowCorrectionEditors, setFailedRowCorrectionEditors] = useState({});

  function handlePrecheckFileChange(event) {
    const file = event.target.files?.[0];
    if (file) onPrecheck(file);
    event.target.value = "";
  }

  function toggleFailedRowCorrectionEditor(execution) {
    const executionId = String(execution?.executionId ?? "").trim();
    if (!executionId) return;
    setExpandedCorrectionExecutionId((current) => (current === executionId ? "" : executionId));
  }

  function updateFailedRowCorrectionValue(execution, row, field, value) {
    const executionId = String(execution?.executionId ?? "").trim();
    const rowKey = getMasterDataFailedRowKey(row);
    const fieldKey = String(field ?? "").trim();
    if (!executionId || !rowKey || !fieldKey) return;
    setFailedRowCorrectionEditors((current) => {
      const executionEdits = current[executionId] ?? {};
      const currentRowEdit = executionEdits[rowKey] ?? {
        touched: false,
        values: normalizeMasterDataFailedRowValues(row.values),
      };
      return {
        ...current,
        [executionId]: {
          ...executionEdits,
          [rowKey]: {
            touched: true,
            values: {
              ...currentRowEdit.values,
              [fieldKey]: value,
            },
          },
        },
      };
    });
  }

  function resetFailedRowCorrectionRow(execution, row) {
    const executionId = String(execution?.executionId ?? "").trim();
    const rowKey = getMasterDataFailedRowKey(row);
    if (!executionId || !rowKey) return;
    setFailedRowCorrectionEditors((current) => {
      const executionEdits = { ...(current[executionId] ?? {}) };
      delete executionEdits[rowKey];
      const next = { ...current };
      if (Object.keys(executionEdits).length) next[executionId] = executionEdits;
      else delete next[executionId];
      return next;
    });
  }

  function getFailedRowCorrectionValues(execution, row) {
    const executionId = String(execution?.executionId ?? "").trim();
    const rowKey = getMasterDataFailedRowKey(row);
    return failedRowCorrectionEditors[executionId]?.[rowKey]?.values ?? normalizeMasterDataFailedRowValues(row.values);
  }

  function isFailedRowCorrectionTouched(execution, row) {
    const executionId = String(execution?.executionId ?? "").trim();
    const rowKey = getMasterDataFailedRowKey(row);
    return failedRowCorrectionEditors[executionId]?.[rowKey]?.touched === true;
  }

  function buildFailedRowCorrections(execution) {
    const executionId = String(execution?.executionId ?? "").trim();
    const executionEdits = failedRowCorrectionEditors[executionId] ?? {};
    return getMasterDataExecutionFailedRows(execution)
      .map((row) => {
        const rowEdit = executionEdits[getMasterDataFailedRowKey(row)];
        if (!rowEdit?.touched) return null;
        return {
          sheetKey: row.sheetKey,
          rowNumber: row.rowNumber,
          values: normalizeMasterDataFailedRowValues(rowEdit.values),
        };
      })
      .filter(Boolean);
  }

  function handleCreateFailedRowsCorrectionDraft(execution) {
    onCreateFailedRowsCorrectionDraft?.(execution, buildFailedRowCorrections(execution));
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal master-data-template-modal" role="dialog" aria-modal="true" aria-label="基础资料导入模板">
        <div className="modal-title">
          <div>
            <span>{sourceLabel}</span>
            <h2>基础资料导入模板</h2>
          </div>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        <div className="master-data-template-summary">
          {templateSets.map((item) => (
            <button className="master-data-template-card" key={item.key} onClick={() => onDownload(item.key)}>
              <div>
                <strong>{item.label}</strong>
                <span>{getMasterDataImportTemplateSummary(item.key)}</span>
              </div>
              <DownloadOutlined />
            </button>
          ))}
        </div>
        <section className="master-data-template-fields" aria-label="模板字段">
          <div className="master-data-template-fields-head">
            <strong>模板范围</strong>
            <span>导入前整表预检查，确认后才落正式数据</span>
          </div>
          <div className="master-data-template-field-grid">
            {definitions.map((definition) => (
              <div className="master-data-template-field-row" key={definition.key}>
                <strong>{definition.label}</strong>
                <span>{definition.description}</span>
                <small>必填：{definition.requiredFields.join("、")} · {definition.columnCount} 字段</small>
              </div>
            ))}
          </div>
        </section>
        <section className="master-data-precheck-panel" aria-label="导入预检查">
          <div className="master-data-precheck-head">
            <div>
              <strong>上传预检查</strong>
              <span>只检查字段、重复、价格、库存和规格匹配，不落正式数据</span>
            </div>
            <label className="master-data-upload-button">
              <UploadOutlined />
              上传并预检查
              <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handlePrecheckFileChange} />
            </label>
          </div>
          {precheck.status === "checking" && (
            <div className="master-data-precheck-empty">
              正在检查 {precheck.fileName || "导入模板"}...
            </div>
          )}
          {precheck.status === "error" && (
            <div className="master-data-precheck-error">
              <strong>预检查失败</strong>
              <span>{precheck.error}</span>
            </div>
          )}
          {precheck.status !== "checking" && precheck.status !== "error" && !precheckResult && (
            <div className="master-data-precheck-empty">
              下载模板填写后上传，系统会先生成预检查结果。
            </div>
          )}
          {precheckResult && (
            <div className="master-data-precheck-result">
              <div className="master-data-precheck-stats">
                <span className={`master-data-precheck-status ${statusTone}`}>
                  <strong>{precheckResult.summary.statusLabel}</strong>
                  <small>状态</small>
                </span>
                <span>
                  <strong>{precheckResult.summary.dataRowCount}</strong>
                  <small>数据行</small>
                </span>
                <span>
                  <strong>{precheckResult.summary.errorCount}</strong>
                  <small>阻断</small>
                </span>
                <span>
                  <strong>{precheckResult.summary.warningCount}</strong>
                  <small>需确认</small>
                </span>
              </div>
              <div className="master-data-precheck-note">{precheckResult.summary.recommendedAction}</div>
              <div className="master-data-precheck-sheets">
                {precheckResult.sheets.map((sheet) => (
                  <span className={`master-data-precheck-sheet ${sheet.status}`} key={sheet.key}>
                    {sheet.label} · {sheet.dataRowCount} 行
                  </span>
                ))}
              </div>
              <div className="master-data-precheck-issues">
                {topIssues.length ? topIssues.map((issue, index) => (
                  <div className={`master-data-precheck-issue ${issue.severity}`} key={`${issue.sheet}-${issue.row}-${issue.field}-${index}`}>
                    <strong>{issue.severityLabel}</strong>
                    <span>{issue.sheet}{issue.row ? ` · 第 ${issue.row} 行` : ""}{issue.field ? ` · ${issue.field}` : ""}</span>
                    <small>{issue.message}</small>
                  </div>
                )) : (
                  <div className="master-data-precheck-empty compact">未发现阻断或需确认问题</div>
                )}
              </div>
              <div className="master-data-review-actions">
                <button
                  className="primary-action"
                  disabled={!canQueuePrecheckResult}
                  title={canQueuePrecheckResult ? "生成待确认草稿，不写正式数据" : "存在阻断项，需先修正后重新预检查"}
                  onClick={onCreateReviewDraft}
                >
                  加入确认队列
                </button>
                <span>{canQueuePrecheckResult ? "生成待确认草稿，后续再接权限、审计和正式落库。" : "先处理阻断项，当前不能进入确认队列。"}</span>
              </div>
            </div>
          )}
        </section>
        <section className="master-data-review-panel" aria-label="导入确认队列">
          <div className="master-data-review-head">
            <strong>导入确认队列</strong>
            <span>当前为草稿队列，不写正式客户 / 价格 / 库存资料</span>
          </div>
          {draftItems.length ? (
            <div className="master-data-review-list">
              {draftItems.map((draft) => (
	                <div className={`master-data-review-row ${draft.statusTone}`} key={draft.draftId}>
	                  <div>
	                    <strong>{draft.draftId}</strong>
	                    <span>{getMasterDataImportReviewDraftSummary(draft)}</span>
	                    <small>{draft.fileName || "未记录文件名"} · {draft.requestedBy || "未知账号"}{draft.sourceExecutionId ? ` · 来源 ${draft.sourceExecutionId}` : ""}</small>
	                  </div>
                  <em>{draft.statusLabel}</em>
                  <button
                    className="master-data-review-plan-button"
                    disabled={!canCreateMasterDataImportConfirmationPlan(draft)}
                    title={canCreateMasterDataImportConfirmationPlan(draft) ? "生成正式导入前的审计和事务计划，不写库" : "阻断草稿不能生成确认计划"}
                    onClick={() => onCreateConfirmationPlan?.(draft)}
                  >
                    生成计划
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="master-data-review-empty">
              预检查通过后可加入确认队列，等待后续正式导入确认。
            </div>
          )}
        </section>
        <section className="master-data-confirmation-panel" aria-label="导入确认计划">
          <div className="master-data-review-head">
            <strong>导入确认计划</strong>
            <span>生成目标表和事务保护项，管理账号可执行正式导入</span>
          </div>
          {planItems.length ? (
            <div className="master-data-confirmation-list">
              {planItems.map((plan) => (
                <div className="master-data-confirmation-row" key={plan.planId}>
                  <div>
                    <strong>{plan.planId}</strong>
                    <span>{getMasterDataImportConfirmationPlanSummary(plan)}</span>
                    <small>{plan.operationLogId || plan.operationLogDraft?.action || "待生成操作日志"} · {plan.persistenceStatus || "本地确认计划"} · {plan.createdBy || "未知账号"}</small>
                  </div>
                  <em>{plan.statusLabel}</em>
                  <div className="master-data-confirmation-actions">
                    <button
                      disabled={createExecutionState.disabled}
                      title={createExecutionState.title || "生成 MDE-* 执行记录，默认不写正式数据"}
                      onClick={() => onCreateImportExecution?.(plan)}
                    >
                      生成执行记录
                    </button>
                    <button
                      className="danger-action"
                      disabled={commitExecutionState.disabled || hasCommittedMasterDataImportExecution(executionItems, plan.planId)}
                      title={commitExecutionState.title || (hasCommittedMasterDataImportExecution(executionItems, plan.planId) ? "该计划已有正式导入记录" : "管理账号显式确认后执行本地事务写入")}
                      onClick={() => onCommitImportExecution?.(plan)}
                    >
                      正式导入
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="master-data-review-empty">
              从确认队列草稿生成计划后，管理账号才能生成执行记录或正式导入。
            </div>
          )}
        </section>
        <section className="master-data-execution-panel" aria-label="导入执行记录">
          <div className="master-data-review-head">
            <strong>导入执行记录</strong>
            <span>默认阻断记录不写库；正式导入成功后显示 committed</span>
          </div>
          {executionItems.length ? (
            <div className="master-data-execution-list">
              {executionItems.map((execution) => {
                const failedRowsRequired = execution.failedRowsDownload?.required === true || Number(execution.summary?.failedRowCount) > 0;
                const failedRows = getMasterDataExecutionFailedRows(execution);
                const correctionRows = buildFailedRowCorrections(execution);
                const correctionRowCount = correctionRows.length;
                const editorExpanded = expandedCorrectionExecutionId === execution.executionId;
                return (
	                  <div className={`master-data-execution-row ${getMasterDataExecutionTone(execution.status)}`} key={execution.executionId}>
	                    <div>
	                      <strong>{execution.executionId}</strong>
	                      <span>{execution.statusLabel || execution.status} · {execution.summary?.writableRowCount ?? 0} 可写行 · {execution.summary?.failedRowCount ?? 0} 失败行{correctionRowCount ? ` · 已修正 ${correctionRowCount} 行` : ""}</span>
	                      <small>{execution.planId} · {execution.persistenceStatus || "API 执行记录"} · {execution.officialWriteAttempted ? "已尝试正式写入" : "未写正式数据"}</small>
	                    </div>
	                    <em>{execution.officialWriteScope || "none"}</em>
	                    <div className="master-data-execution-actions">
	                      <button
	                        disabled={!failedRowsRequired || downloadFailedRowsState.disabled}
	                        title={downloadFailedRowsState.title || (failedRowsRequired ? "下载本次执行生成的失败行 CSV" : "当前执行记录没有失败行")}
	                        onClick={() => onDownloadFailedRows?.(execution)}
	                      >
	                        下载失败行
	                      </button>
	                      <button
	                        disabled={!failedRows.length || createCorrectionDraftState.disabled}
	                        title={createCorrectionDraftState.title || (failedRows.length ? "展开失败行字段并在页面内修正" : "当前执行记录没有失败行明细")}
	                        onClick={() => toggleFailedRowCorrectionEditor(execution)}
	                      >
	                        {editorExpanded ? "收起修正" : "修正字段"}
	                      </button>
	                      <button
	                        disabled={!failedRowsRequired || createCorrectionDraftState.disabled}
	                        title={createCorrectionDraftState.title || (failedRowsRequired ? "把失败行生成新的确认草稿，继续走生成计划 / 正式导入流程" : "当前执行记录没有失败行")}
	                        onClick={() => handleCreateFailedRowsCorrectionDraft(execution)}
	                      >
	                        {correctionRowCount ? `生成草稿(${correctionRowCount})` : "生成修正草稿"}
	                      </button>
	                    </div>
	                    {editorExpanded && (
	                      <div className="master-data-failed-row-editor" aria-label="失败行字段修正">
	                        <div className="master-data-failed-row-editor-head">
	                          <strong>失败行字段修正</strong>
	                          <span>已修正 {correctionRowCount}/{failedRows.length} 行；只把改过的行作为修正字段传入草稿。</span>
	                        </div>
	                        <div className="master-data-failed-row-list">
	                          {failedRows.map((row) => {
	                            const values = getFailedRowCorrectionValues(execution, row);
	                            const fields = getMasterDataFailedRowFields({ ...row, values });
	                            const touched = isFailedRowCorrectionTouched(execution, row);
	                            return (
	                              <div className={`master-data-failed-row-card ${touched ? "touched" : ""}`} key={getMasterDataFailedRowKey(row)}>
	                                <div className="master-data-failed-row-meta">
	                                  <div>
	                                    <strong>{row.worksheetName || row.sheetKey} · 第 {row.rowNumber} 行</strong>
	                                    <span>{row.reason || "未记录失败原因"}</span>
	                                  </div>
	                                  <button
	                                    type="button"
	                                    disabled={!touched}
	                                    onClick={() => resetFailedRowCorrectionRow(execution, row)}
	                                  >
	                                    重置
	                                  </button>
	                                </div>
	                                {fields.length ? (
	                                  <div className="master-data-failed-row-fields">
	                                    {fields.map(({ field, value }) => (
	                                      <label key={field}>
	                                        <span>{field}</span>
	                                        <input
	                                          value={value}
	                                          onChange={(event) => updateFailedRowCorrectionValue(execution, row, field, event.target.value)}
	                                        />
	                                      </label>
	                                    ))}
	                                  </div>
	                                ) : (
	                                  <small className="master-data-failed-row-empty">该失败行没有可编辑字段，需下载失败行后重新整理 Excel。</small>
	                                )}
	                              </div>
	                            );
	                          })}
	                        </div>
	                      </div>
	                    )}
	                  </div>
                );
              })}
            </div>
          ) : (
            <div className="master-data-review-empty">
              生成执行记录后会在这里显示阻断原因、失败行下载和正式导入结果。
            </div>
          )}
        </section>
        <section className="master-data-employee-review-panel" aria-label="员工账号复核">
          <div className="master-data-review-head master-data-employee-review-head">
            <div>
              <strong>员工账号复核</strong>
              <span>员工导入后默认未启用，管理账号复核岗位 / 机台 / 角色后启用</span>
            </div>
            <button
              disabled={refreshEmployeeReviewState.disabled}
              title={refreshEmployeeReviewState.title || "刷新正式导入后的员工待复核账号"}
              onClick={() => onRefreshEmployeeAccountReviews?.()}
            >
              <ReloadOutlined />
              刷新复核
            </button>
          </div>
          {employeeReviewItems.length ? (
            <div className="master-data-employee-review-list">
              {employeeReviewItems.map((review) => {
                const passwordStatusLabel = getEmployeePasswordStatusLabel(review);
                const canRevokePassword = canRevokeEmployeePassword(review);
                return (
                  <div className={`master-data-employee-review-row ${getEmployeeReviewRowTone(review)}`} key={review.employeeId}>
                    <div>
                      <strong>{review.name || review.bizNo || review.employeeId}</strong>
                      <span>{review.roleName || review.recommendedRoleLabel || "未填岗位"} · {review.defaultWorkshop || "未填车间"} · {review.defaultMachineId || "未绑机台"}</span>
                      <small>
                        {review.bizNo || review.employeeId} · {review.loginName || "待生成登录名"} · {passwordStatusLabel}
                        {review.passwordRevokedAt ? ` ${formatCompactDateTime(review.passwordRevokedAt)}` : ""}
                        {review.passwordChangedAt ? ` · 改密 ${formatCompactDateTime(review.passwordChangedAt)}` : ""}
                        {review.remark ? ` · ${review.remark}` : ""}
                      </small>
                    </div>
                    <em>{review.statusLabel || review.status}</em>
                    <div className="master-data-employee-review-actions">
                      <button
                        disabled={review.accountEnabled || enableEmployeeReviewState.disabled}
                        title={enableEmployeeReviewState.title || (review.accountEnabled ? "该员工账号已启用" : "复核并启用导入员工账号")}
                        onClick={() => onEnableEmployeeAccount?.(review)}
                      >
                        {review.accountEnabled ? "已启用" : "复核启用"}
                      </button>
                      <button
                        disabled={!review.accountEnabled || issueEmployeePasswordState.disabled}
                        title={issueEmployeePasswordState.title || (review.accountEnabled ? "生成本次可见的临时密码，并启用动态登录" : "先复核启用员工账号")}
                        onClick={() => onIssueEmployeePassword?.(review)}
                      >
                        {review.passwordIssuedAt ? "重发密码" : "发临时密码"}
                      </button>
                      <button
                        className="danger-action"
                        disabled={!canRevokePassword || revokeEmployeePasswordState.disabled}
                        title={revokeEmployeePasswordState.title || (canRevokePassword ? "撤销登录密码并让已有会话失效" : "仅已启用且未撤销的员工账号可撤销密码")}
                        onClick={() => onRevokeEmployeePassword?.(review)}
                      >
                        撤销密码
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="master-data-review-empty">
              正式导入包含员工资料后，点击刷新可查看待管理员复核的员工账号。
            </div>
          )}
          {lastIssuedEmployeeCredential && (
            <div className="master-data-employee-credential">
              <div>
                <strong>{lastIssuedEmployeeCredential.employeeName || lastIssuedEmployeeCredential.userId}</strong>
                <span>临时密码仅本次返回；首次登录需改密，规则：至少 10 位、含字母和数字、不含空格，且不能包含登录名 / 员工 ID</span>
              </div>
              <code>{lastIssuedEmployeeCredential.loginName || lastIssuedEmployeeCredential.userId}</code>
              <code>{lastIssuedEmployeeCredential.temporaryPassword}</code>
            </div>
          )}
        </section>
        <div className="modal-actions">
          <button onClick={() => onDownload("all")}>
            <DownloadOutlined />
            下载全量模板
          </button>
          <button className="primary-action" onClick={onClose}>关闭</button>
        </div>
      </section>
    </div>
  );
}

function OrderLineActionModal({ modal, onClose, onConfirm }) {
  const line = modal.orderLine ?? {};
  const isQuantityAction = modal.type === "quantity";
  const currentQty = Number(line.qty ?? line.originalQty ?? 0);
  const customerLabel = line.customer ?? line.customerName ?? "";
  const productLabel = line.product ?? line.productName ?? "";
  const [newQty, setNewQty] = useState(String(currentQty || ""));
  const [reason, setReason] = useState(isQuantityAction ? orderQuantityReasonOptions[0] : orderVoidReasonOptions[0]);
  const nextQty = Number(newQty);
  const confirmDisabled = isQuantityAction && (!Number.isFinite(nextQty) || nextQty <= 0 || nextQty === currentQty);
  const title = isQuantityAction ? "调整正式单数量" : "作废正式单";
  const confirmLabel = isQuantityAction ? "确认改量" : "确认作废";

  function confirm() {
    if (confirmDisabled) return;
    onConfirm({
      newQty: nextQty,
      reason,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-title">
          <div>
            <span>正式订单动作</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        <div className="form-grid">
          <label>
            订单明细
            <input value={`${line.orderNo ?? line.id ?? ""}-${line.lineNo ?? ""}`} readOnly />
          </label>
          <label>
            客户 / 货品
            <input value={`${customerLabel} / ${productLabel}`} readOnly />
          </label>
          <label>
            当前数量
            <input value={currentQty || ""} readOnly />
          </label>
          {isQuantityAction && (
            <label>
              新数量
              <input type="number" min="1" step="1" value={newQty} onChange={(event) => setNewQty(event.target.value)} />
            </label>
          )}
          <label>
            原因
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              {(isQuantityAction ? orderQuantityReasonOptions : orderVoidReasonOptions).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary-action" disabled={confirmDisabled} onClick={confirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

function PrintTemplatePreview({ template, fulfillment }) {
  if (!template) {
    return (
      <div className="print-sheet">
        <h3>{fulfillment ? getFulfillmentDocumentLabel(fulfillment) : "单据"}预览</h3>
        <p>未找到可预览的打印数据。</p>
      </div>
    );
  }
  const { fields } = template;
  return (
    <div className="print-template-sheet">
      <div className="label-header">
        <div>
          <span>{template.documentType === "express_ltl_label" ? "EXPRESS / LTL" : "FULFILLMENT"}</span>
          <h3>{template.title}</h3>
        </div>
        <strong>{fields.printBatchNo}</strong>
      </div>
      <div className="label-grid">
        <div>
          <span>客户</span>
          <strong>{fields.customerName}</strong>
        </div>
        <div>
          <span>电话尾号</span>
          <strong>{fields.phoneTail || "-"}</strong>
        </div>
        <div>
          <span>订单明细</span>
          <strong>{fields.orderLineNo}</strong>
        </div>
        <div>
          <span>数量/包数</span>
          <strong>{fields.quantityText} / {fields.packageText}</strong>
        </div>
      </div>
      <div className="label-goods">
        <span>货品摘要</span>
        <strong>{fields.goodsSummary}</strong>
      </div>
      {!template.priceHidden && Array.isArray(fields.lineItems) && fields.lineItems.length ? (
        <div className="print-line-table">
          <div className="print-line-head">
            <span>明细</span>
            <span>货品/规格</span>
            <span>数量</span>
            <span>金额</span>
          </div>
          {fields.lineItems.map((item) => (
            <div className="print-line-row" key={item.orderLineNo || item.lineNo}>
              <span>{item.lineNo || "-"}</span>
              <strong>{item.goodsSummary}</strong>
              <span>{item.quantityText} / {item.packageText}</span>
              <span>{item.unitPriceText} / {item.amountText}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="label-grid compact">
        <div>
          <span>交付</span>
          <strong>{fields.fulfillmentMethod}</strong>
        </div>
        <div>
          <span>最晚</span>
          <strong>{fields.latestNeededAt || "-"}</strong>
        </div>
        <div>
          <span>库区/来源</span>
          <strong>{fields.inventorySource || "-"}</strong>
        </div>
        <div>
          <span>包裹序号</span>
          <strong>{fields.packageSequence}</strong>
        </div>
      </div>
      {!template.priceHidden ? (
        <div className="label-grid compact document-money-grid">
          <div>
            <span>合计数量</span>
            <strong>{fields.totalQuantityText || fields.quantityText}</strong>
          </div>
          <div>
            <span>合计金额</span>
            <strong>{fields.totalAmountText || "-"}</strong>
          </div>
          <div>
            <span>价格说明</span>
            <strong>{fields.priceStatementText || "-"}</strong>
          </div>
          <div>
            <span>联次</span>
            <strong>{fields.copyText || "-"}</strong>
          </div>
        </div>
      ) : null}
      <div className="label-note">
        <span>备注</span>
        <strong>{fields.note || "无"}</strong>
      </div>
      <div className="label-barcode" aria-label="标签条码文本">
        <span>{fields.barcodeText}</span>
      </div>
      <div className="label-footer">
        {template.safeguards.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function toDateInputValue(value) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (!text || !Number.isFinite(Date.parse(text))) return "";
  return new Date(text).toISOString().slice(0, 10);
}

function toDatetimeLocalInputValue(value, fallbackDate) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return text.slice(0, 16);
  if (text && Number.isFinite(Date.parse(text))) return new Date(text).toISOString().slice(0, 16);
  return `${fallbackDate}T08:30`;
}

function ActionModal({ modal, fulfillments, statements, orderLines, onClose, onConfirm }) {
  const fulfillment = fulfillments.find((item) => item.id === modal.fulfillmentId);
  const fulfillmentDocumentLabel = fulfillment ? getFulfillmentDocumentLabel(fulfillment) : "单据/标签";
  const fulfillmentLine = fulfillment ? findOrderLine(orderLines, fulfillment.lineId ?? fulfillment.orderLineId) : null;
  const printTemplate = fulfillment
    ? buildFulfillmentPrintTemplate({
        fulfillment,
        orderLine: fulfillmentLine,
        customer: findCustomer(fulfillment.customerId),
        action: modal.action,
      })
    : null;
  const statement = statements.find((item) => item.id === modal.statementId);
  const statementLines = statement ? statement.lineIds.map((id) => findOrderLine(orderLines, id)).filter(Boolean) : [];
  const preview = modal.preview;
  const previewSummary = preview?.summary ?? {
    receivable: Number(statement?.receivable ?? 0),
    received: Number(statement?.received ?? 0),
    variance: Number(statement?.variance ?? 0),
    lineCount: statementLines.length,
  };
  const previewLines = preview?.lines?.length
    ? preview.lines
    : statementLines.map((line, index) => ({
        statementLineId: `${statement?.id ?? "ST"}-${index + 1}`,
        orderLineId: line.id,
        orderNo: `${line.orderNo}-${line.lineNo}`,
        productName: line.product,
        goodsSpec: `${line.size} ${line.color}`,
        billQty: line.qty,
        finalAmount: line.amount,
      }));
  const [numberValue, setNumberValue] = useState(getOfficeModalInitialNumberValue(modal, { fulfillment, statement, getStatementBlockingAmount }));
  const [reason, setReason] = useState(getOfficeModalInitialReason(modal));
  const [attachPaymentProof, setAttachPaymentProof] = useState(modal.type === "payment");
  const [paymentProofRemark, setPaymentProofRemark] = useState("付款截图占位，正式上传后替换。");
  const [paymentProofFile, setPaymentProofFile] = useState(null);
  const [paymentProofPreviewUrl, setPaymentProofPreviewUrl] = useState("");
  const [customerConfirmationContent, setCustomerConfirmationContent] = useState("客户回复确认无误");
  const [attachCustomerConfirmationProof, setAttachCustomerConfirmationProof] = useState(modal.type === "customerConfirmation");
  const [customerConfirmationRemark, setCustomerConfirmationRemark] = useState("客户确认截图/聊天记录待补。");
  const [customerConfirmationProofFile, setCustomerConfirmationProofFile] = useState(null);
  const [customerConfirmationPreviewUrl, setCustomerConfirmationPreviewUrl] = useState("");
  const batchPrintPackages = modal.type === "batchPrintResult" ? modal.printPackages ?? [] : [];
  const [selectedPrintedPackageIds, setSelectedPrintedPackageIds] = useState(() => batchPrintPackages.map((item) => item.packageId));
  const dispatchDefaultRouteDate = toDateInputValue(fulfillment?.routeDate) || new Date().toISOString().slice(0, 10);
  const [dispatchDriverId, setDispatchDriverId] = useState(fulfillment?.driverId || "U-DRIVER-A");
  const [dispatchRouteDate, setDispatchRouteDate] = useState(dispatchDefaultRouteDate);
  const [dispatchRouteNo, setDispatchRouteNo] = useState(fulfillment?.routeNo || fulfillment?.routeBatchNo || "虎门线-A");
  const [dispatchRouteSequence, setDispatchRouteSequence] = useState(String(fulfillment?.routeSequence || fulfillment?.stopSequence || 1));
  const [dispatchPlannedDepartureAt, setDispatchPlannedDepartureAt] = useState(
    toDatetimeLocalInputValue(fulfillment?.plannedDepartureAt, dispatchDefaultRouteDate),
  );
  const [dispatchRemark, setDispatchRemark] = useState(fulfillment?.dispatchRemark || "");

  useEffect(() => {
    if (!paymentProofFile || !String(paymentProofFile.type ?? "").startsWith("image/")) {
      setPaymentProofPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(paymentProofFile);
    setPaymentProofPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [paymentProofFile]);

  useEffect(() => {
    if (!customerConfirmationProofFile || !String(customerConfirmationProofFile.type ?? "").startsWith("image/")) {
      setCustomerConfirmationPreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(customerConfirmationProofFile);
    setCustomerConfirmationPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [customerConfirmationProofFile]);

  function handlePaymentProofFileChange(event) {
    const file = event.target.files?.[0] ?? null;
    setPaymentProofFile(file);
    if (file) {
      setAttachPaymentProof(true);
      setPaymentProofRemark(`付款凭证附件：${file.name}`);
    }
  }

  function handleCustomerConfirmationFileChange(event) {
    const file = event.target.files?.[0] ?? null;
    setCustomerConfirmationProofFile(file);
    if (file) {
      setAttachCustomerConfirmationProof(true);
      setCustomerConfirmationRemark(`客户确认附件：${file.name}`);
    }
  }

  function getFirstBatchPackageIds(count) {
    const safeCount = Math.max(0, Math.min(batchPrintPackages.length, Math.trunc(Number(count) || 0)));
    return batchPrintPackages.slice(0, safeCount).map((item) => item.packageId);
  }

  function handleBatchPrintReasonChange(nextReason) {
    setReason(nextReason);
    if (modal.type !== "batchPrintResult") return;
    if (nextReason === "全部打出") {
      setSelectedPrintedPackageIds(batchPrintPackages.map((item) => item.packageId));
      setNumberValue(String(batchPrintPackages.length));
      return;
    }
    if (nextReason === "部分打出") {
      const partialCount = Math.max(1, Math.min(batchPrintPackages.length - 1, Math.trunc(Number(numberValue) || batchPrintPackages.length - 1)));
      setSelectedPrintedPackageIds(getFirstBatchPackageIds(partialCount));
      setNumberValue(String(partialCount));
      return;
    }
    setSelectedPrintedPackageIds([]);
    setNumberValue("0");
  }

  function handleBatchPrintNumberChange(value) {
    setNumberValue(value);
    if (modal.type === "batchPrintResult" && reason === "部分打出") {
      setSelectedPrintedPackageIds(getFirstBatchPackageIds(value));
    }
  }

  function toggleBatchPrintPackage(packageId) {
    setSelectedPrintedPackageIds((current) => {
      const exists = current.includes(packageId);
      const next = exists ? current.filter((item) => item !== packageId) : [...current, packageId];
      setNumberValue(String(next.length));
      return next;
    });
  }

  function confirm() {
    if (modal.type === "dispatch") {
      onConfirm({
        driverId: dispatchDriverId,
        routeDate: dispatchRouteDate,
        routeNo: dispatchRouteNo,
        routeSequence: Number(dispatchRouteSequence),
        plannedDepartureAt: dispatchPlannedDepartureAt,
        remark: dispatchRemark,
      });
      return;
    }
    const printedPackageIds =
      modal.type === "batchPrintResult"
        ? reason === "全部打出"
          ? batchPrintPackages.map((item) => item.packageId)
          : reason === "部分打出"
            ? selectedPrintedPackageIds
            : []
        : [];
    onConfirm({
      actualQty: Number(numberValue),
      amount: Number(numberValue),
      reason,
      printedPackageIds,
      attachPaymentProof,
      paymentProofRemark,
      paymentProofFile: paymentProofFile
        ? paymentProofFile
        : null,
      attachCustomerConfirmationProof,
      customerConfirmationContent,
      customerConfirmationRemark,
      customerConfirmationProofFile: customerConfirmationProofFile
        ? customerConfirmationProofFile
        : null,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-label={officeModalTitles[modal.type]}>
        <div className="modal-title">
          <div>
            <span>业务操作</span>
            <h2>{officeModalTitles[modal.type]}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        {modal.type === "print" ? (
          <PrintTemplatePreview template={printTemplate} fulfillment={fulfillment} />
        ) : modal.type === "printVoid" ? (
          <div className="form-grid">
            <label>
              旧{fulfillmentDocumentLabel}批次
              <input value={fulfillment?.printBatch ?? fulfillment?.activePrintRecordId ?? modal.printRecordId ?? "待确认"} readOnly />
            </label>
            <label>
              作废原因
              <select value={reason} onChange={(event) => setReason(event.target.value)}>
                {printVoidReasonOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <div className="form-note">
              作废后当前{fulfillmentDocumentLabel}不能继续用于交付确认，需要先重打生成新{fulfillmentDocumentLabel}。
            </div>
          </div>
        ) : modal.type === "dispatch" ? (
          <div className="form-grid">
            <label>
              司机
              <select value={dispatchDriverId} onChange={(event) => setDispatchDriverId(event.target.value)}>
                {driverDispatchOptions.map((item) => (
                  <option key={item.driverId} value={item.driverId}>{item.name}</option>
                ))}
              </select>
            </label>
            <label>
              路线日期
              <input type="date" value={dispatchRouteDate} onChange={(event) => setDispatchRouteDate(event.target.value)} />
            </label>
            <label>
              路线趟号
              <input value={dispatchRouteNo} onChange={(event) => setDispatchRouteNo(event.target.value)} />
            </label>
            <label>
              站序
              <input type="number" min="1" value={dispatchRouteSequence} onChange={(event) => setDispatchRouteSequence(event.target.value)} />
            </label>
            <label>
              计划发车
              <input type="datetime-local" value={dispatchPlannedDepartureAt} onChange={(event) => setDispatchPlannedDepartureAt(event.target.value)} />
            </label>
            <label>
              备注
              <input value={dispatchRemark} placeholder="如：先送客户仓、等包裹标签" onChange={(event) => setDispatchRemark(event.target.value)} />
            </label>
            <div className="form-note">
              保存后司机端任务按路线日期、趟号和站序排序；装车和送达仍由司机端单独确认。
            </div>
          </div>
        ) : modal.type === "customerConfirmation" ? (
          <div className="form-grid">
            <label className="wide-field">
              确认内容
              <textarea rows={3} value={customerConfirmationContent} onChange={(event) => setCustomerConfirmationContent(event.target.value)} />
            </label>
            <label>
              确认渠道
              <input value={statement?.sendChannel || "微信"} readOnly />
            </label>
            <label>
              确认来源
              <input value={statement?.sendRecipient || "客户联系人"} readOnly />
            </label>
            <div className="form-check-row">
              <span>确认附件</span>
              <label>
                <input type="checkbox" checked={attachCustomerConfirmationProof} onChange={(event) => setAttachCustomerConfirmationProof(event.target.checked)} />
                聊天截图/确认附件
              </label>
            </div>
            <label>
              附件备注
              <input value={customerConfirmationRemark} disabled={!attachCustomerConfirmationProof} onChange={(event) => setCustomerConfirmationRemark(event.target.value)} />
            </label>
            <label>
              选择附件
              <input type="file" accept={evidenceAttachmentAccept} disabled={!attachCustomerConfirmationProof} onChange={handleCustomerConfirmationFileChange} />
            </label>
            {customerConfirmationProofFile && (
              <div className="attachment-preview">
                {customerConfirmationPreviewUrl ? <img src={customerConfirmationPreviewUrl} alt="客户确认附件预览" /> : <span>文件</span>}
                <div>
                  <strong>{customerConfirmationProofFile.name}</strong>
                  <small>{formatFileSize(customerConfirmationProofFile.size)} · {customerConfirmationProofFile.type || "未知类型"}</small>
                </div>
              </div>
            )}
            <div className="form-note">
              客户回复“确认 / 没问题”时登记为对账证据；附件可上传微信 / 企业微信截图、PDF 或表格文件。
            </div>
          </div>
        ) : modal.type === "batchPrintResult" ? (
          <div className="form-grid">
            <label>
              本批待办
              <input value={`${modal.totalTasks ?? 0} 条 / ${modal.totalLabels ?? 0} 张标签`} readOnly />
            </label>
            <label>
              打印结果
              <select value={reason} onChange={(event) => handleBatchPrintReasonChange(event.target.value)}>
                {batchPrintResultOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              已打出标签数
              <input value={numberValue} disabled={reason !== "部分打出"} onChange={(event) => handleBatchPrintNumberChange(event.target.value)} />
            </label>
            {batchPrintPackages.length ? (
              <div className="print-package-checklist">
                <span>包裹标签明细</span>
                <div>
                  {batchPrintPackages.map((item) => {
                    const checked = reason === "全部打出" || (reason === "部分打出" && selectedPrintedPackageIds.includes(item.packageId));
                    return (
                      <label className={checked ? "checked" : ""} key={item.packageId}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={reason !== "部分打出"}
                          onChange={() => toggleBatchPrintPackage(item.packageId)}
                        />
                        <strong>{item.labelText ?? `第 ${item.packageSeq}/${item.packageCount} 包`}</strong>
                        <small>{item.todoRef ?? item.todoId}</small>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="form-note">
              此处只记录人工核对结果；未打出继续留在待打印，结果不确定进入异常核对。交付状态只由可信 spool / 驱动 printed 回读推进。
            </div>
          </div>
        ) : modal.type === "statementPreview" ? (
          <div className="print-sheet">
            <h3>{statement ? findCustomer(statement.customerId).name : ""} 对账单</h3>
            <p>账期：{statement?.period} 应收：{money(previewSummary.receivable || 0)} 已收：{money(previewSummary.received || 0)} 差额：{money(previewSummary.variance || 0)}</p>
            {previewLines.map((line) => (
              <p key={line.statementLineId || line.orderLineId}>
                {line.orderNo} {line.productName} {line.goodsSpec} {line.billQty} 个 {money(line.finalAmount ?? line.amount ?? 0)}
              </p>
            ))}
            {preview?.downloadToken && <p>Excel 文件：已生成；预览不等于已发送。</p>}
          </div>
        ) : (
          <div className="form-grid">
            <label>
              {modal.type === "payment" ? "实收金额" : modal.type === "variance" ? "差额金额" : modal.type === "unable" ? "实际找到数量" : "实际数量"}
              <input value={numberValue} readOnly={modal.type === "variance"} onChange={(event) => setNumberValue(event.target.value)} />
            </label>
            <label>
              {modal.type === "variance" ? "处理结果" : "原因"}
              <select value={reason} onChange={(event) => setReason(event.target.value)}>
                {(modal.type === "variance" ? varianceHandlingOptions : officeModalReasonOptions).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            {modal.type === "payment" && (
              <>
                <div className="form-check-row">
                  <span>付款凭证</span>
                  <label>
                    <input type="checkbox" checked={attachPaymentProof} onChange={(event) => setAttachPaymentProof(event.target.checked)} />
                    付款截图/附件
                  </label>
                </div>
                <label>
                  凭证备注
                  <input value={paymentProofRemark} disabled={!attachPaymentProof} onChange={(event) => setPaymentProofRemark(event.target.value)} />
                </label>
                <label>
                  选择附件
                  <input type="file" accept={evidenceAttachmentAccept} disabled={!attachPaymentProof} onChange={handlePaymentProofFileChange} />
                </label>
                {paymentProofFile && (
                  <div className="attachment-preview">
                    {paymentProofPreviewUrl ? <img src={paymentProofPreviewUrl} alt="付款截图预览" /> : <span>文件</span>}
                    <div>
                      <strong>{paymentProofFile.name}</strong>
                      <small>{formatFileSize(paymentProofFile.size)} · {paymentProofFile.type || "未知类型"}</small>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary-action" onClick={confirm}>{modal.type === "statementPreview" ? "确认预览" : modal.type === "printVoid" ? "确认作废" : modal.type === "batchPrintResult" ? "确认结果" : modal.type === "dispatch" ? "保存派单" : modal.type === "customerConfirmation" ? "登记确认" : modal.type === "mismatch" ? "提交数量差异" : modal.type === "unable" ? "提交无法出库" : "确认提交"}</button>
        </div>
      </section>
    </div>
  );
}
