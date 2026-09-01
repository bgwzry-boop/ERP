import { recognizeOrderConversation } from "../src/lib/orderConversationRecognition.js";
import { parseOrderText } from "../src/lib/orderParser.js";
import { confirmDraftOrder } from "../src/state/officeOrderActions.js";
import {
  confirmFulfillmentException,
  updateFulfillmentsForAction,
} from "../src/state/officeFulfillmentActions.js";
import { calculateLinePricing } from "../src/domain/priceTable.js";
import {
  buildFulfillmentPrintTemplate,
  getDocumentType,
  getTemplateId,
} from "../src/domain/printTemplates.js";
import { getStatementExcelTemplateId } from "../src/domain/statementExcelTemplate.js";
import {
  confirmStatementPayment,
  confirmStatementVariance,
  confirmStatementWriteOff,
  getStatementWriteOffBlocker,
  markStatementSent,
  recordStatementCustomerConfirmation,
} from "../src/state/officeStatementActions.js";
import { parseDataUrl } from "./attachmentObjectStorage.mjs";
import { buildPrintDeviceSnapshot } from "./printDeviceRepository.mjs";
import { writeActionPermissions } from "./writeActionPermissions.mjs";
import { createAttachmentCommandService } from "./services/attachmentCreateService.mjs";
import { createAttendancePayrollService } from "./services/attendancePayrollService.mjs";
import { createAttachmentFileAccessService } from "./services/attachmentFileAccessService.mjs";
import { createBusinessDecisionEvidenceService } from "./services/businessDecisionEvidenceService.mjs";
import { createBusinessDecisionDirectiveCommandService } from "./services/businessDecisionDirectiveCommandService.mjs";
import { createBusinessDecisionAuthorizationCommandService } from "./services/businessDecisionAuthorizationCommandService.mjs";
import { createBusinessDecisionEvidenceDraftCommandService } from "./services/businessDecisionEvidenceDraftCommandService.mjs";
import { createBusinessDecisionPolicyService } from "./services/businessDecisionPolicyService.mjs";
import { createBusinessDecisionReadProjectionService } from "./services/businessDecisionReadProjectionService.mjs";
import { createCommandResultHttpAdapterService } from "./services/commandResultHttpAdapterService.mjs";
import { createDemoWorkspaceSeedService } from "./services/demoWorkspaceSeedService.mjs";
import {
  buildDriverDeliveryTask,
  findActiveDriverDeliveryDispatch,
  findDriverDeliveryFulfillment,
  getDriverDeliveryTaskResponseProjection,
  getFulfillmentSortSequence,
} from "./services/driverDeliveryTaskProjectionService.mjs";
import { createDriverDeviceFieldTestCommandService } from "./services/driverDeviceFieldTestCommandService.mjs";
import { createFulfillmentActionCommandService } from "./services/fulfillmentActionCommandService.mjs";
import { createFulfillmentPrintCommandService } from "./services/fulfillmentPrintCommandService.mjs";
import { createFulfillmentReadProjectionService } from "./services/fulfillmentReadProjectionService.mjs";
import { createHttpResponseService } from "./services/httpResponseService.mjs";
import { createInventoryCorrectionCommandService } from "./services/inventoryCorrectionCommandService.mjs";
import {
  buildInventoryQuantitySnapshot,
  createInventoryCorrectionReadProjectionService,
} from "./services/inventoryCorrectionReadProjectionService.mjs";
import { createInventoryReservationReleaseCommandService } from "./services/inventoryReservationReleaseCommandService.mjs";
import { createMasterDataEmployeeAccountCommandService } from "./services/masterDataEmployeeAccountCommandService.mjs";
import { createMasterDataImportCommandService } from "./services/masterDataImportCommandService.mjs";
import { createMasterDataMachineCommandService } from "./services/masterDataMachineCommandService.mjs";
import { createMaintenanceTaskCommandService } from "./services/maintenanceTaskCommandService.mjs";
import { createOrderDraftCommandService } from "./services/orderDraftCommandService.mjs";
import { createOrderLineMutationCommandService } from "./services/orderLineMutationCommandService.mjs";
import { createOrderWorkflowProjectionService } from "./services/orderWorkflowProjectionService.mjs";
import { createPackingCommandService } from "./services/packingCommandService.mjs";
import { createPhoneIdentityCommandService } from "./services/phoneIdentityCommandService.mjs";
import { createPrintBatchCommandService } from "./services/printBatchCommandService.mjs";
import { createPrintDeviceCommandService } from "./services/printDeviceCommandService.mjs";
import { createPrintDriverDiagnosticsService } from "./services/printDriverDiagnosticsService.mjs";
import { createPrintJobBusinessProjectionService } from "./services/printJobBusinessProjectionService.mjs";
import { createPrintJobLifecycleService } from "./services/printJobLifecycleService.mjs";
import { createProductionFinishedGoodsPhotoCommandService } from "./services/productionFinishedGoodsPhotoCommandService.mjs";
import { createProductionFinishedGoodsPhotoProjectionService } from "./services/productionFinishedGoodsPhotoProjectionService.mjs";
import { createProductionMachineQueueReadService } from "./services/productionMachineQueueReadService.mjs";
import { createProductionReportingCommandService } from "./services/productionReportingCommandService.mjs";
import { createProductionSchedulingCommandService } from "./services/productionSchedulingCommandService.mjs";
import { createProductionTaskProjectionService } from "./services/productionTaskProjectionService.mjs";
import { createRawMaterialCommandService } from "./services/rawMaterialCommandService.mjs";
import { createRawMaterialPurchaseCommandService } from "./services/rawMaterialPurchaseCommandService.mjs";
import { createRawMaterialOcrParserService } from "./services/rawMaterialOcrParserService.mjs";
import { createRawMaterialSupplierColorMappingService } from "./services/rawMaterialSupplierColorMappingService.mjs";
import { createRequestAuthorizationService } from "./services/requestAuthorizationService.mjs";
import { createRuntimeAuthCommandService } from "./services/runtimeAuthCommandService.mjs";
import { createStatementCommunicationCommandService } from "./services/statementCommunicationCommandService.mjs";
import { createStatementExportFileService } from "./services/statementExportFileService.mjs";
import { createStatementFinancialCommandService } from "./services/statementFinancialCommandService.mjs";
import { createStatementPreviewProjectionService } from "./services/statementPreviewProjectionService.mjs";
import { createTodoCommandService } from "./services/todoCommandService.mjs";
import { createTodoReadProjectionService } from "./services/todoReadProjectionService.mjs";
import { createTencentCloudTableOcrService } from "./services/tencentCloudTableOcrService.mjs";
import { createV1FieldEvidenceDraftService } from "./services/v1FieldEvidenceDraftService.mjs";
import { createV1FieldEvidenceStagingService } from "./services/v1FieldEvidenceStagingService.mjs";
import { resolveConfiguredOrLoopbackV1ApiBaseUrl } from "./services/v1ApiTargetPolicy.mjs";
import { createV1GoLiveStatusArtifactReaderService } from "./services/v1GoLiveStatusArtifactReaderService.mjs";
import { createV1GoLiveStatusResponseService } from "./services/v1GoLiveStatusResponseService.mjs";
import { createV1LocalCommandRunnerService } from "./services/v1LocalCommandRunnerService.mjs";
import { createV1ProductionEnvValuesApplyService } from "./services/v1ProductionEnvValuesApplyService.mjs";
import { createV1ProductionEnvValuesSafetyStatusService } from "./services/v1ProductionEnvValuesSafetyStatusService.mjs";
import { getConfiguredV1ProductionEnvApplicationFiles } from "./services/v1ProductionEnvFileAuditService.mjs";
import { getConfiguredV1ProductionEnvValuesFileConfig } from "./services/v1ProductionEnvFileAuditService.mjs";
import {
  createV1ProductionGoLivePrecheckService,
  sanitizeV1ProductionGoLiveGateForReleasePrecheck,
} from "./services/v1ProductionGoLivePrecheckService.mjs";
import { createV1ProductionPersistenceEvidenceLiveRunService } from "./services/v1ProductionPersistenceEvidenceLiveRunService.mjs";
import { createV1ProductionFirstStageExecutionLiveRunService } from "./services/v1ProductionFirstStageExecutionLiveRunService.mjs";
import { createV1ProductionFirstStageValuesDryRunLivePrecheckService } from "./services/v1ProductionFirstStageValuesDryRunLivePrecheckService.mjs";
import { createV1ReleaseCandidateRefreshPrecheckService } from "./services/v1ReleaseCandidateRefreshPrecheckService.mjs";
import { createV1ReleaseCandidateRefreshService } from "./services/v1ReleaseCandidateRefreshService.mjs";
import { buildCurrentV1RuntimeReadinessReport } from "./services/v1RuntimeLivePrecheckService.mjs";
import { createV1V2BoundaryService } from "./services/v1V2BoundaryService.mjs";
import { createWorkspaceRecordService } from "./services/workspaceRecordService.mjs";

export function createApiSharedServiceRegistry() {
  const httpResponseService = createHttpResponseService();
  const { sendBusinessError, sendFile, sendInlineFile, sendJson, sendNotFound } = httpResponseService;
  const commandResultHttpAdapterService = createCommandResultHttpAdapterService({
    sendBusinessError,
    sendJson,
    sendNotFound,
  });
  const { sendCommandRecord, sendCommandResponse } = commandResultHttpAdapterService;
  const workspaceRecordService = createWorkspaceRecordService();
  const businessDecisionPolicyService = createBusinessDecisionPolicyService();
  const businessDecisionEvidenceService = createBusinessDecisionEvidenceService({
    policyService: businessDecisionPolicyService,
  });
  const businessDecisionReadProjectionService = createBusinessDecisionReadProjectionService();
  const {
    addOperationLog,
    buildCustomerSnapshot,
    buildFulfillmentActionRecord,
    buildOperationLog,
    buildTodo,
    cleanServerText,
    findAttachmentRecord,
    findCustomerName,
    findFulfillment,
    findInventoryCorrectionDraft,
    findInventoryItem,
    findInventoryReservation,
    findOrderLine,
    findPrintDevice,
    findPrintJob,
    findProductionTask,
    findStatement,
    nextId,
    nextPlainId,
    resolvePersistableCreatedBy,
    summarizeOrderLineForChange,
  } = workspaceRecordService;
  const businessDecisionAuthorizationCommandService = createBusinessDecisionAuthorizationCommandService({ buildOperationLog });
  const businessDecisionEvidenceDraftCommandService = createBusinessDecisionEvidenceDraftCommandService({ buildOperationLog });
  const businessDecisionDirectiveCommandService = createBusinessDecisionDirectiveCommandService({
    businessDecisionEvidenceService,
    buildOperationLog,
  });
  const maintenanceTaskCommandService = createMaintenanceTaskCommandService({ buildOperationLog });
  const attendancePayrollService = createAttendancePayrollService();
  const orderWorkflowProjectionService = createOrderWorkflowProjectionService({ calculateLinePricing });
  const {
    findMatchingInventory,
    mapFulfillmentMethod,
    mapPrintSide,
    toFulfillmentTaskSummary,
    toInventoryCheckResult,
    toInventoryReservationTransactionSummary,
    toOrderLineSummary,
    toPriceSnapshot,
  } = orderWorkflowProjectionService;
  const printJobBusinessProjectionService = createPrintJobBusinessProjectionService({
    buildFulfillmentActionRecord,
    buildOperationLog,
  });
  const requestAuthorizationService = createRequestAuthorizationService({
    sendJson,
    actionPermissions: writeActionPermissions,
  });
  const {
    getPermissionOperatorId,
    requireActionPermission,
    requireAnyActionPermission,
    requireAttachmentCreatePermission,
  } = requestAuthorizationService;
  const printJobLifecycleService = createPrintJobLifecycleService({
    buildOperationLog,
    printJobBusinessProjectionService,
  });
  const fulfillmentPrintCommandService = createFulfillmentPrintCommandService({
    buildFulfillmentActionRecord,
    buildFulfillmentPrintTemplate,
    buildOperationLog,
    buildPrintDeviceSnapshot,
    getDocumentType,
    getTemplateId,
  });
  const printDeviceCommandService = createPrintDeviceCommandService({ buildOperationLog });
  const printBatchCommandService = createPrintBatchCommandService({ buildOperationLog });
  const printDriverDiagnosticsService = createPrintDriverDiagnosticsService();
  const todoCommandService = createTodoCommandService({ buildOperationLog });
  const todoReadProjectionService = createTodoReadProjectionService();
  const fulfillmentReadProjectionService = createFulfillmentReadProjectionService();
  const inventoryCorrectionReadProjectionService = createInventoryCorrectionReadProjectionService();
  const inventoryCorrectionCommandService = createInventoryCorrectionCommandService({
    buildOperationLog,
    buildTodo,
    findAttachment: findAttachmentRecord,
    findInventoryItem,
    toInventoryQuantitySnapshot: buildInventoryQuantitySnapshot,
  });
  const inventoryReservationReleaseCommandService = createInventoryReservationReleaseCommandService({
    buildOperationLog,
    findInventoryItem,
    findInventoryReservation,
    nextPlainId,
  });
  const v1FieldEvidenceStagingService = createV1FieldEvidenceStagingService();
  const v1FieldEvidenceDraftService = createV1FieldEvidenceDraftService();
  const v1GoLiveStatusArtifactReaderService = createV1GoLiveStatusArtifactReaderService();
  const v1ProductionEnvValuesSafetyStatusService = createV1ProductionEnvValuesSafetyStatusService();
  const v1LocalCommandRunnerService = createV1LocalCommandRunnerService();
  const v1ProductionPersistenceEvidenceLiveRunService =
    createV1ProductionPersistenceEvidenceLiveRunService({
      runCommand: v1LocalCommandRunnerService.runV1ProductionPersistenceEvidenceCommand,
      sanitizeBlockingItem: v1ProductionEnvValuesSafetyStatusService.sanitizeBlockingItem,
    });
  const v1ProductionFirstStageExecutionLiveRunService =
    createV1ProductionFirstStageExecutionLiveRunService({
      runCommand: v1LocalCommandRunnerService.runV1ProductionFirstStageExecutionCommand,
      resolveApiBaseUrl: ({ request }) =>
        resolveConfiguredOrLoopbackV1ApiBaseUrl({
          request,
          configuredApiBaseUrl: process.env.ERP_V1_RELEASE_API_BASE_URL,
        }),
      sanitizeBlockingItem: v1ProductionEnvValuesSafetyStatusService.sanitizeBlockingItem,
    });
  const v1ProductionFirstStageValuesDryRunLivePrecheckService =
    createV1ProductionFirstStageValuesDryRunLivePrecheckService({
      getValuesFileConfig: getConfiguredV1ProductionEnvValuesFileConfig,
      buildTargetSetupStatus: v1ProductionEnvValuesSafetyStatusService.buildTargetSetupStatus,
      buildValuesFileAuditStatus: v1ProductionEnvValuesSafetyStatusService.buildValuesFileAuditStatus,
      readStatusArtifacts: v1GoLiveStatusArtifactReaderService.readStatusArtifacts,
      runCommand: v1LocalCommandRunnerService.runV1ProductionFirstStageValuesDryRunCommand,
      buildDryRunProofStatus: v1ProductionEnvValuesSafetyStatusService.buildDryRunProofStatus,
      sanitizeBlockingItem: v1ProductionEnvValuesSafetyStatusService.sanitizeBlockingItem,
    });
  const v1ProductionEnvValuesApplyService = createV1ProductionEnvValuesApplyService({
    buildTargetSetupStatus: v1ProductionEnvValuesSafetyStatusService.buildTargetSetupStatus,
    readStatusArtifacts: v1GoLiveStatusArtifactReaderService.readStatusArtifacts,
    buildDryRunProofStatus: v1ProductionEnvValuesSafetyStatusService.buildDryRunProofStatus,
    buildValuesFileAuditStatus: v1ProductionEnvValuesSafetyStatusService.buildValuesFileAuditStatus,
    runApplyCommand: v1LocalCommandRunnerService.runV1ProductionFirstStageValuesApplyCommand,
    sanitizeBlockingItem: v1ProductionEnvValuesSafetyStatusService.sanitizeBlockingItem,
  });
  const v1GoLiveStatusResponseService = createV1GoLiveStatusResponseService({
    readStatusArtifacts: v1GoLiveStatusArtifactReaderService.readStatusArtifacts,
    buildProductionEnvValuesFragmentSourceStatus: ({ productionEnvIntakeVerification }) =>
      v1ProductionEnvValuesSafetyStatusService.buildFragmentSourceStatus({
        productionEnvIntakeVerification,
        buildServerConfigGuidance:
          v1ProductionFirstStageValuesDryRunLivePrecheckService.buildServerConfigGuidance,
      }),
    buildProductionEnvValuesApplyGateStatus: (input) =>
      v1ProductionEnvValuesApplyService.buildGateStatus(input),
  });
  const v1ProductionGoLivePrecheckService = createV1ProductionGoLivePrecheckService({
    buildRuntimeReadinessReport: buildCurrentV1RuntimeReadinessReport,
  });
  const v1ReleaseCandidateRefreshPrecheckService = createV1ReleaseCandidateRefreshPrecheckService({
    readStatusArtifacts: v1GoLiveStatusArtifactReaderService.readStatusArtifacts,
    precheckProductionGoLive: v1ProductionGoLivePrecheckService.precheck,
    sanitizeProductionGoLiveGate: sanitizeV1ProductionGoLiveGateForReleasePrecheck,
  });
  const v1ReleaseCandidateRefreshService = createV1ReleaseCandidateRefreshService({
    precheckRefresh: v1ReleaseCandidateRefreshPrecheckService.precheck,
    getArtifactRoot: v1GoLiveStatusArtifactReaderService.getArtifactRoot,
    resolveApiBaseUrl: resolveConfiguredOrLoopbackV1ApiBaseUrl,
    runRefreshCommand: v1LocalCommandRunnerService.runV1ReleaseCandidateRefreshCommand,
    getConfiguredEnvFiles: getConfiguredV1ProductionEnvApplicationFiles,
  });
  const v1V2BoundaryService = createV1V2BoundaryService({
    readStatusArtifacts: v1GoLiveStatusArtifactReaderService.readStatusArtifacts,
    getArtifactRoot: v1GoLiveStatusArtifactReaderService.getArtifactRoot,
    runScopeBriefRefreshCommand: v1LocalCommandRunnerService.runV1V2ScopeBriefRefreshCommand,
  });
  const productionFinishedGoodsPhotoProjectionService =
    createProductionFinishedGoodsPhotoProjectionService({ buildTodo });
  const productionTaskProjectionService = createProductionTaskProjectionService({
    buildPhotoSummary: productionFinishedGoodsPhotoProjectionService.buildPhotoSummary,
    cleanServerText,
    findOrderLine,
  });
  const {
    buildProductionTaskFromBody,
    inferProductionMachineIdFromTaskType,
    inferProductionTaskTypeFromOrderLine,
    isProductionTaskCompletedStatus,
    resolvePublishedProductionLineStatus,
    resolvePublishedProductionTaskStatus,
    toProductionTaskSummary,
  } = productionTaskProjectionService;
  const productionFinishedGoodsPhotoCommandService =
    createProductionFinishedGoodsPhotoCommandService({
      buildOperationLog,
      buildPhotoSummary: productionFinishedGoodsPhotoProjectionService.buildPhotoSummary,
      buildCustomerNotificationTodo:
        productionFinishedGoodsPhotoProjectionService.buildCustomerNotificationTodo,
      buildPhotoRetakeTodo: productionFinishedGoodsPhotoProjectionService.buildPhotoRetakeTodo,
      findAttachment: findAttachmentRecord,
      findOrderLine,
      normalizeHistory: productionFinishedGoodsPhotoProjectionService.normalizeHistory,
      normalizeReviewStatus: productionFinishedGoodsPhotoProjectionService.normalizeReviewStatus,
    });
  const productionMachineQueueReadService = createProductionMachineQueueReadService();
  const productionSchedulingCommandService = createProductionSchedulingCommandService({
    businessDecisionEvidenceService,
    buildMachineQueueResponse: productionMachineQueueReadService.buildMachineQueue,
    buildOperationLog,
    buildProductionTaskFromBody,
    findOrderLine,
    findProductionTask,
    inferProductionMachineIdFromTaskType,
    inferProductionTaskTypeFromOrderLine,
    isProductionTaskCompletedStatus,
    resolvePersistableCreatedBy,
    resolvePublishedProductionLineStatus,
    resolvePublishedProductionTaskStatus,
    summarizeOrderLineForChange,
  });
  const productionReportingCommandService = createProductionReportingCommandService({
    buildOperationLog,
    buildProductionTaskFromBody,
    buildTodo,
    findInventoryItem,
    findOrderLine,
    findProductionTask,
    isProductionTaskCompletedStatus,
    resolvePersistableCreatedBy,
    summarizeOrderLineForChange,
  });
  const packingCommandService = createPackingCommandService({
    buildOperationLog,
    buildTodo,
    findInventoryItem,
    resolvePersistableCreatedBy,
  });
  const attachmentFileAccessService = createAttachmentFileAccessService({
    addOperationLog,
    nextId,
  });
  const attachmentCreateCommandService = createAttachmentCommandService({
    parseDataUrl,
    buildOperationLog,
    nextId,
  });
  const statementPreviewProjectionService = createStatementPreviewProjectionService();
  const statementExportFileService = createStatementExportFileService({
    buildStatementPreviewLines: statementPreviewProjectionService.buildPreviewLines,
  });
  const statementCommunicationCommandService = createStatementCommunicationCommandService({
    buildOperationLog,
    buildStatementExportFile: statementExportFileService.buildExportFile,
    buildStatementPreviewLines: statementPreviewProjectionService.buildPreviewLines,
    findAttachment: findAttachmentRecord,
    findStatement,
    getStatementExcelTemplateId,
    markStatementSent,
    nextId,
    nextPlainId,
    recordStatementCustomerConfirmation,
    storeStatementExportFile: statementExportFileService.storeExportFile,
    toStatementExportSummary: statementExportFileService.toExportSummary,
  });
  const statementFinancialCommandService = createStatementFinancialCommandService({
    businessDecisionEvidenceService,
    buildOperationLog,
    buildTodo,
    confirmStatementPayment,
    confirmStatementVariance,
    confirmStatementWriteOff,
    findAttachment: findAttachmentRecord,
    findStatement,
    getStatementWriteOffBlocker,
    nextId,
  });
  const tencentCloudTableOcrService = createTencentCloudTableOcrService();
  const rawMaterialOcrParserService = createRawMaterialOcrParserService();
  const rawMaterialCommandService = createRawMaterialCommandService({
    attachmentCreateCommandService,
    businessDecisionEvidenceService,
    buildOperationLog,
    nextId,
    rawMaterialOcrParserService,
    tencentCloudTableOcrService,
  });
  const rawMaterialPurchaseCommandService = createRawMaterialPurchaseCommandService({ rawMaterialCommandService });
  const rawMaterialSupplierColorMappingService = createRawMaterialSupplierColorMappingService({ buildOperationLog });
  const orderLineMutationCommandService = createOrderLineMutationCommandService({
    buildOperationLog,
    findInventoryItem,
    findOrderLine,
    nextPlainId,
    summarizeOrderLineForChange,
    toInventoryQuantitySnapshot: buildInventoryQuantitySnapshot,
    toInventoryReservationTransactionSummary,
  });
  const orderDraftCommandService = createOrderDraftCommandService({
    buildCustomerSnapshot,
    buildOperationLog,
    buildTodo,
    confirmDraftOrder,
    findCustomerName,
    findInventoryItem,
    findMatchingInventory,
    mapFulfillmentMethod,
    mapPrintSide,
    nextId,
    nextPlainId,
    parseOrderText,
    recognizeOrderConversation,
    toFulfillmentTaskSummary,
    toInventoryCheckResult,
    toInventoryReservationTransactionSummary,
    toOrderLineSummary,
    toPriceSnapshot,
    toTodoSummary: todoReadProjectionService.summarizeTodo,
  });
  const masterDataImportCommandService = createMasterDataImportCommandService({ buildOperationLog });
  const masterDataEmployeeAccountCommandService = createMasterDataEmployeeAccountCommandService({
    buildOperationLog,
  });
  const masterDataMachineCommandService = createMasterDataMachineCommandService({ buildOperationLog });
  const runtimeAuthCommandService = createRuntimeAuthCommandService({ buildOperationLog });
  const phoneIdentityCommandService = createPhoneIdentityCommandService({ buildOperationLog });
  const fulfillmentActionCommandService = createFulfillmentActionCommandService({
    businessDecisionEvidenceService,
    buildFulfillmentActionRecord,
    buildDriverDeliveryTask,
    buildOperationLog,
    buildTodo,
    confirmFulfillmentException,
    findActiveDriverDeliveryDispatch,
    findAttachmentRecord,
    findCustomerName,
    findDriverDeliveryFulfillment,
    findFulfillment,
    findInventoryItem,
    findOrderLine,
    getDriverDeliveryTaskResponseProjection,
    getFulfillmentSortSequence,
    mapFulfillmentMethod,
    nextId,
    nextPlainId,
    toInventoryReservationTransactionSummary,
    updateFulfillmentsForAction,
  });
  const driverDeviceFieldTestCommandService = createDriverDeviceFieldTestCommandService({
    buildDriverDeliveryTask,
    buildOperationLog,
    findFulfillment,
    getFulfillmentSortSequence,
    validateDriverTaskAccess: fulfillmentActionCommandService.validateDriverTaskAccess,
  });
  const demoWorkspaceSeedService = createDemoWorkspaceSeedService({
    buildOperationLog,
    buildPrintDeviceSnapshot,
    findPrintDevice,
    nextPlainId,
  });

  return Object.freeze({
    addOperationLog,
    attachmentCreateCommandService,
    attachmentFileAccessService,
    attendancePayrollService,
    buildOperationLog,
    buildTodo,
    businessDecisionAuthorizationCommandService,
    businessDecisionDirectiveCommandService,
    businessDecisionEvidenceDraftCommandService,
    businessDecisionEvidenceService,
    businessDecisionPolicyService,
    businessDecisionReadProjectionService,
    demoWorkspaceSeedService,
    driverDeviceFieldTestCommandService,
    findAttachmentRecord,
    findFulfillment,
    findInventoryCorrectionDraft,
    findInventoryItem,
    findOrderLine,
    findPrintDevice,
    findPrintJob,
    findProductionTask,
    findStatement,
    fulfillmentActionCommandService,
    fulfillmentPrintCommandService,
    fulfillmentReadProjectionService,
    getPermissionOperatorId,
    inventoryCorrectionCommandService,
    inventoryCorrectionReadProjectionService,
    inventoryReservationReleaseCommandService,
    masterDataEmployeeAccountCommandService,
    masterDataImportCommandService,
    masterDataMachineCommandService,
    maintenanceTaskCommandService,
    nextId,
    orderDraftCommandService,
    orderLineMutationCommandService,
    packingCommandService,
    phoneIdentityCommandService,
    printBatchCommandService,
    printDeviceCommandService,
    printDriverDiagnosticsService,
    printJobBusinessProjectionService,
    printJobLifecycleService,
    productionFinishedGoodsPhotoCommandService,
    productionFinishedGoodsPhotoProjectionService,
    productionMachineQueueReadService,
    productionReportingCommandService,
    productionSchedulingCommandService,
    rawMaterialCommandService,
    rawMaterialPurchaseCommandService,
    rawMaterialOcrParserService,
    rawMaterialSupplierColorMappingService,
    requireActionPermission,
    requireAnyActionPermission,
    requireAttachmentCreatePermission,
    runtimeAuthCommandService,
    sendBusinessError,
    sendCommandRecord,
    sendCommandResponse,
    sendFile,
    sendInlineFile,
    sendJson,
    sendNotFound,
    statementCommunicationCommandService,
    statementExportFileService,
    statementFinancialCommandService,
    statementPreviewProjectionService,
    summarizeOrderLineForChange,
    toProductionTaskSummary,
    todoCommandService,
    todoReadProjectionService,
    tencentCloudTableOcrService,
    v1FieldEvidenceDraftService,
    v1FieldEvidenceStagingService,
    v1GoLiveStatusResponseService,
    v1LocalCommandRunnerService,
    v1ProductionEnvValuesApplyService,
    v1ProductionFirstStageExecutionLiveRunService,
    v1ProductionFirstStageValuesDryRunLivePrecheckService,
    v1ProductionGoLivePrecheckService,
    v1ProductionPersistenceEvidenceLiveRunService,
    v1ReleaseCandidateRefreshPrecheckService,
    v1ReleaseCandidateRefreshService,
    v1V2BoundaryService,
  });
}

export const apiSharedServiceRegistry = createApiSharedServiceRegistry();
