import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createGracefulShutdownController } from "./gracefulShutdown.mjs";
import { closeSharedPostgresPools } from "./postgresPoolClient.mjs";
import { makeTodo } from "../src/data/fixtures.js";
import { recognizeOrderConversation } from "../src/lib/orderConversationRecognition.js";
import { parseOrderText } from "../src/lib/orderParser.js";
import {
  getSeedUser,
  verifyRuntimeSessionToken,
  verifySeedSessionToken,
  runtimeSessionTokenPrefix,
  seedSessionTokenPrefix,
} from "./authSeed.mjs";
import { confirmDraftOrder } from "../src/state/officeOrderActions.js";
import {
  confirmFulfillmentException,
  updateFulfillmentsForAction,
} from "../src/state/officeFulfillmentActions.js";
import {
  getLineColorSpecLabel,
  getLinePrintSide,
  getLineRemark,
  getOrderLineShortNo,
  shortColorName,
} from "../src/domain/officeRules.js";
import { calculateLinePricing } from "../src/domain/priceTable.js";
import { buildFulfillmentPrintTemplate, getDocumentType, getTemplateId } from "../src/domain/printTemplates.js";
import {
  STATEMENT_EXCEL_CONTENT_TYPE,
  STATEMENT_EXCEL_FILE_EXTENSION,
  buildStatementExcelMetadata,
  buildStatementExcelWorkbookBase64,
  getStatementExcelTemplateId,
} from "../src/domain/statementExcelTemplate.js";
import {
  getDriverDeviceFieldTestSummary,
  normalizeDriverPackageLabelScanSample,
  normalizeDriverDeviceFieldTestChecks,
} from "../src/services/driverDeviceFieldTestClient.js";
import { normalizeDriverNativeCapabilityDiagnostics } from "../src/services/driverNativeCapabilityClient.js";
import {
  confirmStatementPayment,
  confirmStatementVariance,
  confirmStatementWriteOff,
  getStatementWriteOffBlocker,
  markStatementSent,
  recordStatementCustomerConfirmation,
} from "../src/state/officeStatementActions.js";
import {
  filterByKeyword,
  filterByValue,
  getEffectivePermissions,
  getStatementCustomers,
  loadSeedWorkspace,
  paginate,
} from "./seedData.mjs";
import { tryValidateOpenApi } from "./openapiValidation.mjs";
import { buildProductionEnvFileAuditReport } from "../scripts/run-v1-production-env-file-audit.mjs";
import { buildProductionEnvValuesDryRunProofReport } from "../scripts/run-v1-production-env-values-dry-run-proof-check.mjs";
import { createAttachmentRepository } from "./attachmentRepository.mjs";
import { createAttachmentAccessAuditRepository } from "./attachmentAccessAuditRepository.mjs";
import { createAttachmentObjectStorage, parseDataUrl } from "./attachmentObjectStorage.mjs";
import { createAttachmentRecord } from "./services/attachmentCreateService.mjs";
import { createPrintJobBusinessProjectionService } from "./services/printJobBusinessProjectionService.mjs";
import { createPrintJobLifecycleService } from "./services/printJobLifecycleService.mjs";
import { createFulfillmentPrintCommandService } from "./services/fulfillmentPrintCommandService.mjs";
import { createPrintDeviceCommandService } from "./services/printDeviceCommandService.mjs";
import { createPrintBatchCommandService } from "./services/printBatchCommandService.mjs";
import { createTodoCommandService } from "./services/todoCommandService.mjs";
import { resolveTodoReference } from "./services/todoReferenceService.mjs";
import { createInventoryCorrectionCommandService } from "./services/inventoryCorrectionCommandService.mjs";
import { createInventoryReservationReleaseCommandService } from "./services/inventoryReservationReleaseCommandService.mjs";
import { createV1FieldEvidenceStagingService } from "./services/v1FieldEvidenceStagingService.mjs";
import { createV1FieldEvidenceDraftService } from "./services/v1FieldEvidenceDraftService.mjs";
import { createProductionFinishedGoodsPhotoCommandService } from "./services/productionFinishedGoodsPhotoCommandService.mjs";
import { buildSystemV1Readiness } from "./services/systemV1ReadinessService.mjs";
import { buildRuntimeEmployeeAccountReadiness } from "./services/runtimeEmployeeAccountReadiness.mjs";
import {
  buildAttachmentV1Readiness,
  buildStatementExportV1Readiness,
  runAttachmentStorageDiagnostics,
  runStatementExportStorageDiagnostics,
} from "./services/fileRetentionV1ReadinessService.mjs";
import { buildDriverV1Readiness as getDriverV1ReadinessResponse } from "./services/driverV1ReadinessService.mjs";
import { buildPrintDriverV1Readiness } from "./services/printDriverV1ReadinessService.mjs";
import { precheckV1DriverReadiness } from "./services/v1DriverLivePrecheckService.mjs";
import { resolveConfiguredOrLoopbackV1ApiBaseUrl } from "./services/v1ApiTargetPolicy.mjs";
import {
  buildCurrentV1RuntimeReadinessReport,
  precheckV1RuntimeReadiness,
} from "./services/v1RuntimeLivePrecheckService.mjs";
import { precheckV1ProductionEnv } from "./services/v1ProductionEnvLivePrecheckService.mjs";
import {
  getConfiguredV1ProductionEnvApplicationFileConfig,
  getConfiguredV1ProductionEnvValuesFileConfig,
  precheckV1ProductionEnvFileAudit,
  sanitizeV1ProductionEnvFileConfigSourceStatuses,
} from "./services/v1ProductionEnvFileAuditService.mjs";
import { precheckV1ProductionEnvFilePreview } from "./services/v1ProductionEnvFilePreviewService.mjs";
import { runV1ProductionEnvSetup } from "./services/v1ProductionEnvSetupService.mjs";
import {
  precheckV1ProductionEnvIntake,
  resolveV1ProductionEnvSetupSafeEnvFileForIntakeLivePrecheck,
  V1_PRODUCTION_ENV_SETUP_JSON_PATH,
} from "./services/v1ProductionEnvIntakePrecheckService.mjs";
import {
  precheckV1AttachmentRetention,
  precheckV1Persistence,
} from "./services/v1StorageLivePrecheckService.mjs";
import { createProductionSchedulingCommandService } from "./services/productionSchedulingCommandService.mjs";
import { createProductionReportingCommandService } from "./services/productionReportingCommandService.mjs";
import { createPackingCommandService } from "./services/packingCommandService.mjs";
import { createStatementCommunicationCommandService } from "./services/statementCommunicationCommandService.mjs";
import { createStatementFinancialCommandService } from "./services/statementFinancialCommandService.mjs";
import { createOrderLineMutationCommandService } from "./services/orderLineMutationCommandService.mjs";
import { createOrderDraftCommandService } from "./services/orderDraftCommandService.mjs";
import { createFulfillmentActionCommandService } from "./services/fulfillmentActionCommandService.mjs";
import { createMasterDataImportCommandService } from "./services/masterDataImportCommandService.mjs";
import {
  buildEmployeeAssignmentOptions,
  createMasterDataEmployeeAccountCommandService,
  toMasterDataEmployeeAccountReview,
} from "./services/masterDataEmployeeAccountCommandService.mjs";
import { createRuntimeAuthCommandService } from "./services/runtimeAuthCommandService.mjs";
import {
  buildV1FieldEvidenceDraftFreshness,
  sanitizeV1FieldEvidenceIntakeGuidance,
  sanitizeV1FieldEvidenceIntakeQuality,
  sanitizeV1FieldEvidenceProgress,
} from "./services/v1FieldEvidenceProjectionService.mjs";
import {
  sanitizeV1RoleTaskActionText,
  sanitizeV1SensitiveStatusText,
} from "./services/v1StatusTextSanitizer.mjs";
import {
  sanitizeV1ProductionEnvFillTemplate,
  sanitizeV1ProductionEnvFixChecklist,
  sanitizeV1ProductionEnvGate,
  sanitizeV1ProductionEnvIntakeVerification,
  sanitizeV1ProductionFirstStageExecution,
  sanitizeV1ProductionPersistenceEvidence,
} from "./services/v1ProductionStatusProjectionService.mjs";
import { sanitizeV1ProductionEnvValuesApplyReport } from "./services/v1ProductionEnvValuesApplyProjectionService.mjs";
import { createV1ProductionEnvValuesApplyService } from "./services/v1ProductionEnvValuesApplyService.mjs";
import { createV1ReleaseCandidateRefreshService } from "./services/v1ReleaseCandidateRefreshService.mjs";
import { createV1ReleaseCandidateRefreshPrecheckService } from "./services/v1ReleaseCandidateRefreshPrecheckService.mjs";
import { createV1V2BoundaryService } from "./services/v1V2BoundaryService.mjs";
import {
  createV1ProductionGoLivePrecheckService,
  sanitizeV1ProductionGoLiveGateForReleasePrecheck,
} from "./services/v1ProductionGoLivePrecheckService.mjs";
import { buildV1D49Readiness } from "./services/v1D49ReadinessService.mjs";
import {
  normalizeV1GoLiveStatus,
  sanitizeV1GoLiveSummary,
  sanitizeV1ModuleCompletion,
  sanitizeV1ModuleDifferences,
  sanitizeV1OwnerDecisionBrief,
  sanitizeV1ReleaseCandidate,
  sanitizeV1StatusTextList,
  sanitizeV1TopBlockers,
} from "./services/v1ReleaseStatusProjectionService.mjs";
import {
  sanitizeV1RoleTaskBoard,
  sanitizeV1UnblockPlan,
  sanitizeV1V2BoundaryBrief,
} from "./services/v1FieldCoordinationProjectionService.mjs";
import {
  buildV1CompletionAudit,
  sanitizeV1FieldAcceptanceReport,
  sanitizeV1RuntimeReadinessBlockers,
} from "./services/v1CompletionAuditProjectionService.mjs";
import {
  buildOfficeWorkspaceProjection,
  isOfficeWorkspaceProjectionEnabled,
} from "./services/officeWorkspaceProjectionService.mjs";
import { createTodoActionRepository } from "./todoActionRepository.mjs";
import { createInventoryCorrectionTransactionRepository } from "./inventoryCorrectionTransactionRepository.mjs";
import { createProductionFinishedGoodsPhotoTransactionRepository } from "./productionFinishedGoodsPhotoTransactionRepository.mjs";
import { createPaymentRecordRepository } from "./paymentRecordRepository.mjs";
import { createStatementPaymentTransactionRepository } from "./statementPaymentTransactionRepository.mjs";
import { createStatementSettlementTransactionRepository } from "./statementSettlementTransactionRepository.mjs";
import { createStatementSendTransactionRepository } from "./statementSendTransactionRepository.mjs";
import { createStatementExportRepository } from "./statementExportRepository.mjs";
import { createStatementExportObjectStorage } from "./statementExportObjectStorage.mjs";
import {
  coreWorkspaceCollectionKeys,
  createCoreWorkspaceReadRepository,
} from "./coreWorkspaceReadRepository.mjs";
import { createOrderDraftRepository } from "./orderDraftRepository.mjs";
import { createOrderConfirmationTransactionRepository } from "./orderConfirmationTransactionRepository.mjs";
import { createOrderPoolReadRepository } from "./orderPoolReadRepository.mjs";
import { createFulfillmentActionTransactionRepository } from "./fulfillmentActionTransactionRepository.mjs";
import { createDriverDeliveryDispatchRepository } from "./driverDeliveryDispatchRepository.mjs";
import { createDriverDeviceFieldTestRepository } from "./driverDeviceFieldTestRepository.mjs";
import { createDriverDeliveryTaskReadRepository } from "./driverDeliveryTaskReadRepository.mjs";
import { createInventoryLedgerReadRepository } from "./inventoryLedgerReadRepository.mjs";
import { createInventoryReservationReleaseTransactionRepository } from "./inventoryReservationReleaseTransactionRepository.mjs";
import { createInventoryIntentTransactionRepository } from "./inventoryIntentTransactionRepository.mjs";
import { createOrderLineVoidTransactionRepository } from "./orderLineVoidTransactionRepository.mjs";
import { createOrderLineQuantityAdjustmentTransactionRepository } from "./orderLineQuantityAdjustmentTransactionRepository.mjs";
import { createProductionPackingReadRepository } from "./productionPackingReadRepository.mjs";
import { createProductionPackingTransactionRepository } from "./productionPackingTransactionRepository.mjs";
import { createProductionScheduleRecordRepository } from "./productionScheduleRecordRepository.mjs";
import { createPrintBatchRepository } from "./printBatchRepository.mjs";
import {
  buildPrintDeviceSnapshot,
  createPrintDeviceRepository,
} from "./printDeviceRepository.mjs";
import { createPrintDriverAdapter } from "./printDriverAdapter.mjs";
import { createPrintJobRepository } from "./printJobRepository.mjs";
import { createPrinterDeviceFieldTestRepository } from "./printerDeviceFieldTestRepository.mjs";
import { createMasterDataImportReviewRepository } from "./masterDataImportReviewRepository.mjs";
import { createMasterDataImportTransactionRepository } from "./masterDataImportTransactionRepository.mjs";
import { createRawMaterialInboundRepository } from "./rawMaterialInboundRepository.mjs";
import { createRawMaterialSupplierStatementReviewRepository } from "./rawMaterialSupplierStatementReviewRepository.mjs";
import {
  createRuntimeIdentityRepository,
  mergeRuntimeIdentityStateIntoWorkspace,
} from "./runtimeIdentityRepository.mjs";
import {
  applyV1PersistenceProfileOptions,
  assertV1ProductionPersistenceRuntime,
} from "./v1PersistenceProfile.mjs";
import {
  applyRuntimeConfigOptions,
  buildRuntimeConfigSummary,
  parseRuntimeModeArg,
  resolveRuntimeConfig,
} from "./runtimeConfig.mjs";
import { loadV1ProductionEnvFilesIntoProcess } from "./productionEnvFileLoader.mjs";
import { readJsonRequestBody } from "./httpJsonBody.mjs";
import {
  isProductionBusinessWritePath,
  readHttpIdempotencyKey,
  requireHttpIdempotencyKey,
} from "./idempotency.mjs";
import {
  buildApiSecurityPolicy,
  getCorsAllowedRequestHeaders,
  getWorkspaceSecurityPolicy,
  isCorsRequestAllowed,
  isPublicApiRoute,
} from "./apiSecurityPolicy.mjs";
import { handleOrderReadRoutes } from "./routes/orderReadRoutes.mjs";
import { handleOrderWriteRoutes } from "./routes/orderWriteRoutes.mjs";
import { handleProductionReadRoutes } from "./routes/productionReadRoutes.mjs";
import { handleProductionWriteRoutes } from "./routes/productionWriteRoutes.mjs";
import { handleInventoryReadRoutes } from "./routes/inventoryReadRoutes.mjs";
import { handleInventoryWriteRoutes } from "./routes/inventoryWriteRoutes.mjs";
import { handleFulfillmentReadRoutes } from "./routes/fulfillmentReadRoutes.mjs";
import { handleFulfillmentWriteRoutes } from "./routes/fulfillmentWriteRoutes.mjs";
import { handleStatementReadRoutes } from "./routes/statementReadRoutes.mjs";
import { handleStatementWriteRoutes } from "./routes/statementWriteRoutes.mjs";
import { handleTodoReadRoutes } from "./routes/todoReadRoutes.mjs";
import { handleTodoWriteRoutes } from "./routes/todoWriteRoutes.mjs";
import { handlePrintReadRoutes } from "./routes/printReadRoutes.mjs";
import { handlePrintWriteRoutes } from "./routes/printWriteRoutes.mjs";
import { handleRawMaterialReadRoutes } from "./routes/rawMaterialReadRoutes.mjs";
import { handleRawMaterialWriteRoutes } from "./routes/rawMaterialWriteRoutes.mjs";
import { handleDriverWriteRoutes } from "./routes/driverWriteRoutes.mjs";
import { handleDriverReadRoutes } from "./routes/driverReadRoutes.mjs";
import { handleMasterDataWriteRoutes } from "./routes/masterDataWriteRoutes.mjs";
import { handleMasterDataReadRoutes } from "./routes/masterDataReadRoutes.mjs";
import { handleAuthReadRoutes } from "./routes/authReadRoutes.mjs";
import { handleAuthWriteRoutes } from "./routes/authWriteRoutes.mjs";
import { handleAttachmentWriteRoutes } from "./routes/attachmentWriteRoutes.mjs";
import { handleAttachmentReadRoutes } from "./routes/attachmentReadRoutes.mjs";
import { handleSystemReadRoutes } from "./routes/systemReadRoutes.mjs";
import { handleSystemWriteRoutes } from "./routes/systemWriteRoutes.mjs";
import {
  buildV1ProductionEnvValuesDryRunProofFileBindingStatus as buildV1ProductionEnvValuesDryRunProofFileBindingStatusCore,
  buildV1ProductionEnvValuesDryRunProofStatus as buildV1ProductionEnvValuesDryRunProofStatusCore,
  buildV1ProductionEnvValuesMinimumFillStatus,
  isV1ProductionEnvValuesDryRunProofFileBindingBlockedStatus,
} from "./v1ProductionEnvDryRunProofCore.mjs";

const writeActionPermissions = {
  recognizeOrderDraft: "order.draft.recognize",
  saveOrderDraft: "order.draft.save",
  confirmOrderDraft: "order.confirm",
  voidOrderLine: "order.void",
  adjustOrderLineQuantity: "order.quantity.adjust",
  createInventoryCorrectionDraft: "inventory.correction.create",
  linkInventoryCorrectionAttachments: "inventory.correction.create",
  confirmInventoryCorrectionDraft: "inventory.correction.confirm",
  releaseInventoryReservation: "inventory.reservation.release",
  createFulfillmentException: "fulfillment.exception.create",
  updateFulfillmentDispatch: "fulfillment.dispatch.update",
  printFulfillment: "fulfillment.print",
  recordPrintDeviceFieldTest: "print.device_qa.record",
  printJobDriverCallback: "print.job.callback",
  completeFulfillment: "fulfillment.complete",
  confirmFulfillmentPickup: "fulfillment.pickup.confirm",
  cancelFulfillment: "fulfillment.cancel",
  reviewDeliveryEvidence: "delivery.evidence.review",
  viewDriverDeliveryTasks: "delivery.view",
  confirmDriverDeliveryLoaded: "delivery.load_confirm",
  completeDriverDelivery: "delivery.complete",
  createDriverDeliveryException: "delivery.exception.create",
  recordDriverDeviceFieldTest: "delivery.device_qa.record",
  publishProductionSchedule: "production.schedule.publish",
  resequenceProductionSchedule: "production.schedule.sequence.update",
  moveProductionSchedule: "production.schedule.sequence.update",
  reportProduction: "production.report.complete",
  completePacking: "packing.complete",
  previewStatement: "statement.preview",
  markStatementSent: "statement.send",
  recordStatementPayment: "statement.payment.record",
  handleStatementVariance: "statement.variance.handle",
  writeOffStatement: "statement.write_off",
  createAttachment: "attachment.create",
  viewAttachment: "attachment.view",
  createMasterDataImportConfirmationPlan: "master_data.import.plan.create",
  executeMasterDataImport: "master_data.import.execute",
  reviewMasterDataEmployeeAccount: "master_data.employee_account.review",
  issueMasterDataEmployeeAccountPassword: "master_data.employee_account.password.issue",
  applyV1FieldEvidenceIntake: "system.v1_field_evidence_intake.apply",
  validateV1FieldEvidenceDraft: "system.v1_field_evidence.validate",
  precheckV1ProductionEnv: "system.v1_production_env.precheck",
  runV1ProductionEnvSetup: "system.v1_production_env_setup.run",
  precheckV1ProductionEnvIntake: "system.v1_production_env_intake.precheck",
  precheckV1ProductionEnvFileAudit: "system.v1_production_env_file_audit.precheck",
  precheckV1ProductionEnvFilePreview: "system.v1_production_env_file_preview.precheck",
  precheckV1ProductionGoLive: "system.v1_production_go_live.precheck",
  runV1ProductionPersistenceEvidence: "system.v1_production_persistence_evidence.run",
  runV1ProductionFirstStageExecution: "system.v1_production_first_stage_execution.run",
  precheckV1ProductionFirstStageValuesDryRun: "system.v1_production_first_stage_values_dry_run.precheck",
  applyV1ProductionFirstStageValues: "system.v1_production_first_stage_values_apply.run",
  precheckV1Persistence: "system.v1_persistence.precheck",
  precheckV1AttachmentRetention: "system.v1_attachment_retention.precheck",
  precheckV1DriverReadiness: "system.v1_driver_readiness.precheck",
  precheckV1RuntimeReadiness: "system.v1_runtime_readiness.precheck",
  precheckV1V2Boundary: "system.v1_v2_boundary.precheck",
  refreshV1V2ScopeBrief: "system.v1_v2_scope_brief.refresh",
  precheckV1ReleaseCandidateRefresh: "system.v1_release_candidate.refresh_precheck",
  refreshV1ReleaseCandidate: "system.v1_release_candidate.refresh",
  reviewRawMaterialInbound: "raw_material.inbound.review",
  createRawMaterialSupplierStatementReview: "raw_material.inbound.review",
  confirmRawMaterialSupplierStatementReview: "raw_material.inbound.review",
  confirmRawMaterialSupplierStatement: "raw_material.inbound.review",
  generateRawMaterialSupplierPayableDraft: "raw_material.supplier_payable.create",
  confirmRawMaterialSupplierPayment: "raw_material.supplier_payment.confirm",
  printRawMaterialInboundLabels: "raw_material.label.print",
  confirmRawMaterialInboundAttachment: "raw_material.label.attach_confirm",
  issueRawMaterialToMachine: "raw_material.issue.create",
  confirmRawMaterialConsumption: "raw_material.consumption.confirm",
  returnRawMaterialLeftover: "raw_material.leftover.return",
  reviewRawMaterialLeftover: "raw_material.leftover.review",
  generateRawMaterialCostDraft: "raw_material.cost.allocate",
  confirmRawMaterialCostDraft: "raw_material.cost.confirm",
  calibrateRawMaterialLoss: "raw_material.cost.calibrate",
  generateRawMaterialMarginSnapshot: "raw_material.margin.snapshot",
  reviewRawMaterialMarginSnapshot: "raw_material.margin.review",
  createRawMaterialInboundException: "raw_material.exception.create",
  handleTodo: "todo.handle",
};

export function createApiServer(options = {}) {
  const productionEnvFileApplication =
    options.productionEnvFileApplication ??
    (options.applyProductionEnvFile === false
      ? loadV1ProductionEnvFilesIntoProcess({ env: {}, targetEnv: {}, throwOnBlocked: false })
      : loadV1ProductionEnvFilesIntoProcess());
  const runtimeConfig = resolveRuntimeConfig(options);
  const runtimeOptions = applyRuntimeConfigOptions(options, runtimeConfig);
  const v1PersistenceProfile = applyV1PersistenceProfileOptions(runtimeOptions);
  const effectiveOptions = v1PersistenceProfile.options;
  const securityPolicy = buildApiSecurityPolicy(effectiveOptions);
  const scenarioId = options.scenarioId ?? process.env.ERP_SCENARIO_ID;
  const workspace = loadSeedWorkspace(scenarioId);
  workspace.securityPolicy = securityPolicy;
  const attachmentRepository =
    effectiveOptions.attachmentRepository ?? createAttachmentRepository(effectiveOptions.attachmentRepositoryOptions);
  const attachmentAccessAuditRepository =
    effectiveOptions.attachmentAccessAuditRepository ??
    createAttachmentAccessAuditRepository(effectiveOptions.attachmentAccessAuditRepositoryOptions);
  const attachmentObjectStorage =
    effectiveOptions.attachmentObjectStorage ?? createAttachmentObjectStorage(effectiveOptions.attachmentObjectStorageOptions);
  const paymentRecordRepository =
    effectiveOptions.paymentRecordRepository ?? createPaymentRecordRepository(effectiveOptions.paymentRecordRepositoryOptions);
  const statementPaymentTransactionRepository =
    effectiveOptions.statementPaymentTransactionRepository ??
    createStatementPaymentTransactionRepository(effectiveOptions.statementPaymentTransactionRepositoryOptions);
  const statementSettlementTransactionRepository =
    effectiveOptions.statementSettlementTransactionRepository ??
    createStatementSettlementTransactionRepository(effectiveOptions.statementSettlementTransactionRepositoryOptions);
  const statementSendTransactionRepository =
    effectiveOptions.statementSendTransactionRepository ??
    createStatementSendTransactionRepository(effectiveOptions.statementSendTransactionRepositoryOptions);
  const statementExportRepository =
    effectiveOptions.statementExportRepository ?? createStatementExportRepository(effectiveOptions.statementExportRepositoryOptions);
  const statementExportObjectStorage =
    effectiveOptions.statementExportObjectStorage ??
    createStatementExportObjectStorage(effectiveOptions.statementExportObjectStorageOptions);
  const coreWorkspaceReadRepository =
    effectiveOptions.coreWorkspaceReadRepository ??
    createCoreWorkspaceReadRepository(effectiveOptions.coreWorkspaceReadRepositoryOptions);
  const todoActionRepository =
    effectiveOptions.todoActionRepository ?? createTodoActionRepository(effectiveOptions.todoActionRepositoryOptions);
  const inventoryCorrectionTransactionRepository =
    effectiveOptions.inventoryCorrectionTransactionRepository ??
    createInventoryCorrectionTransactionRepository(effectiveOptions.inventoryCorrectionTransactionRepositoryOptions);
  const productionFinishedGoodsPhotoTransactionRepository =
    effectiveOptions.productionFinishedGoodsPhotoTransactionRepository ??
    createProductionFinishedGoodsPhotoTransactionRepository(
      effectiveOptions.productionFinishedGoodsPhotoTransactionRepositoryOptions,
    );
  const orderDraftRepository =
    effectiveOptions.orderDraftRepository ?? createOrderDraftRepository(effectiveOptions.orderDraftRepositoryOptions);
  const orderConfirmationTransactionRepository =
    effectiveOptions.orderConfirmationTransactionRepository ??
    createOrderConfirmationTransactionRepository(effectiveOptions.orderConfirmationTransactionRepositoryOptions);
  const orderPoolReadRepository =
    effectiveOptions.orderPoolReadRepository ?? createOrderPoolReadRepository(effectiveOptions.orderPoolReadRepositoryOptions);
  const fulfillmentActionTransactionRepository =
    effectiveOptions.fulfillmentActionTransactionRepository ??
    createFulfillmentActionTransactionRepository(effectiveOptions.fulfillmentActionTransactionRepositoryOptions);
  const driverDeliveryDispatchRepository =
    effectiveOptions.driverDeliveryDispatchRepository ??
    createDriverDeliveryDispatchRepository(effectiveOptions.driverDeliveryDispatchRepositoryOptions);
  const driverDeviceFieldTestRepository =
    effectiveOptions.driverDeviceFieldTestRepository ??
    createDriverDeviceFieldTestRepository(effectiveOptions.driverDeviceFieldTestRepositoryOptions);
  const driverDeliveryTaskReadRepository =
    effectiveOptions.driverDeliveryTaskReadRepository ??
    createDriverDeliveryTaskReadRepository(effectiveOptions.driverDeliveryTaskReadRepositoryOptions);
  const inventoryLedgerReadRepository =
    effectiveOptions.inventoryLedgerReadRepository ??
    createInventoryLedgerReadRepository(effectiveOptions.inventoryLedgerReadRepositoryOptions);
  const inventoryReservationReleaseTransactionRepository =
    effectiveOptions.inventoryReservationReleaseTransactionRepository ??
    createInventoryReservationReleaseTransactionRepository(effectiveOptions.inventoryReservationReleaseTransactionRepositoryOptions);
  const inventoryIntentTransactionRepository =
    effectiveOptions.inventoryIntentTransactionRepository ??
    createInventoryIntentTransactionRepository(effectiveOptions.inventoryIntentTransactionRepositoryOptions);
  const orderLineVoidTransactionRepository =
    effectiveOptions.orderLineVoidTransactionRepository ??
    createOrderLineVoidTransactionRepository(effectiveOptions.orderLineVoidTransactionRepositoryOptions);
  const orderLineQuantityAdjustmentTransactionRepository =
    effectiveOptions.orderLineQuantityAdjustmentTransactionRepository ??
    createOrderLineQuantityAdjustmentTransactionRepository(effectiveOptions.orderLineQuantityAdjustmentTransactionRepositoryOptions);
  const productionPackingTransactionRepository =
    effectiveOptions.productionPackingTransactionRepository ??
    createProductionPackingTransactionRepository(effectiveOptions.productionPackingTransactionRepositoryOptions);
  const productionPackingReadRepository =
    effectiveOptions.productionPackingReadRepository ??
    createProductionPackingReadRepository(effectiveOptions.productionPackingReadRepositoryOptions);
  const productionScheduleRecordRepository =
    effectiveOptions.productionScheduleRecordRepository ??
    createProductionScheduleRecordRepository(effectiveOptions.productionScheduleRecordRepositoryOptions);
  const printBatchRepository =
    effectiveOptions.printBatchRepository ?? createPrintBatchRepository(effectiveOptions.printBatchRepositoryOptions);
  const printDeviceRepository =
    effectiveOptions.printDeviceRepository ?? createPrintDeviceRepository(effectiveOptions.printDeviceRepositoryOptions);
  const printJobRepository =
    effectiveOptions.printJobRepository ?? createPrintJobRepository(effectiveOptions.printJobRepositoryOptions);
  const printerDeviceFieldTestRepository =
    effectiveOptions.printerDeviceFieldTestRepository ??
    createPrinterDeviceFieldTestRepository(effectiveOptions.printerDeviceFieldTestRepositoryOptions);
  const masterDataImportReviewRepository =
    effectiveOptions.masterDataImportReviewRepository ??
    createMasterDataImportReviewRepository(effectiveOptions.masterDataImportReviewRepositoryOptions);
  const masterDataImportTransactionRepository =
    effectiveOptions.masterDataImportTransactionRepository ??
    createMasterDataImportTransactionRepository(effectiveOptions.masterDataImportTransactionRepositoryOptions);
  const rawMaterialInboundRepository =
    effectiveOptions.rawMaterialInboundRepository ??
    createRawMaterialInboundRepository(effectiveOptions.rawMaterialInboundRepositoryOptions);
  const rawMaterialSupplierStatementReviewRepository =
    effectiveOptions.rawMaterialSupplierStatementReviewRepository ??
    createRawMaterialSupplierStatementReviewRepository(
      effectiveOptions.rawMaterialSupplierStatementReviewRepositoryOptions,
    );
  const runtimeIdentityRepository =
    effectiveOptions.runtimeIdentityRepository ??
    createRuntimeIdentityRepository(effectiveOptions.runtimeIdentityRepositoryOptions);
  const printDriverAdapter =
    effectiveOptions.printDriverAdapter ?? createPrintDriverAdapter(effectiveOptions.printDriverAdapterOptions);
  const productionPersistenceValidation = assertV1ProductionPersistenceRuntime({
    runtimeMode: runtimeConfig.mode,
    repositories: {
      attachmentRepository,
      attachmentAccessAuditRepository,
      paymentRecordRepository,
      statementPaymentTransactionRepository,
      statementSettlementTransactionRepository,
      statementSendTransactionRepository,
      statementExportRepository,
      coreWorkspaceReadRepository,
      todoActionRepository,
      inventoryCorrectionTransactionRepository,
      productionFinishedGoodsPhotoTransactionRepository,
      orderDraftRepository,
      orderConfirmationTransactionRepository,
      orderPoolReadRepository,
      fulfillmentActionTransactionRepository,
      driverDeliveryDispatchRepository,
      driverDeviceFieldTestRepository,
      driverDeliveryTaskReadRepository,
      inventoryLedgerReadRepository,
      inventoryReservationReleaseTransactionRepository,
      inventoryIntentTransactionRepository,
      orderLineVoidTransactionRepository,
      orderLineQuantityAdjustmentTransactionRepository,
      productionPackingTransactionRepository,
      productionPackingReadRepository,
      productionScheduleRecordRepository,
      printBatchRepository,
      printDeviceRepository,
      printJobRepository,
      printerDeviceFieldTestRepository,
      masterDataImportReviewRepository,
      masterDataImportTransactionRepository,
      rawMaterialInboundRepository,
      rawMaterialSupplierStatementReviewRepository,
      runtimeIdentityRepository,
    },
    fileStorages: {
      attachmentObjectStorage,
      statementExportObjectStorage,
    },
  });
  workspace.orderDrafts = [];
  workspace.originalOrders = [];
  workspace.operationLogs = [];
  workspace.fulfillmentExceptions = [];
  workspace.driverDeliveryDispatches = workspace.initialDriverDeliveryDispatches ?? [];
  workspace.driverDeviceFieldTests = [];
  workspace.printRecords = [];
  workspace.printBatchRecords = [];
  workspace.printDevices = [];
  workspace.printJobs = [];
  workspace.printerDeviceFieldTests = [];
  workspace.masterDataImportReviewDrafts = [];
  workspace.masterDataImportConfirmationPlans = [];
  workspace.masterDataImportExecutions = [];
  workspace.rawMaterialInbounds = workspace.initialRawMaterialInbounds ?? [];
  workspace.rawMaterialSupplierStatementReviews = [];
  workspace.inventoryCorrectionDrafts = [];
  workspace.inventoryIntents = [];
  workspace.inventoryReservations = [];
  workspace.inventoryLedgers = [];
  workspace.orderLineChangeRecords = [];
  workspace.productionTasks = buildInitialProductionTasks(workspace);
  workspace.productionScheduleRecords = [];
  workspace.workshopReports = [];
  workspace.packingTasks = buildInitialPackingTasks(workspace);
  workspace.packages = [];
  workspace.paymentRecords = [];
  workspace.varianceRecords = [];
  workspace.statementSendRecords = [];
  workspace.statementConfirmationRecords = [];
  workspace.todoEvents = [];
  workspace.statementExportFiles = [];
  workspace.statementLines = [];
  workspace.attachments = [];
  workspace.attachmentLinks = [];
  workspace.attachmentAccessLogs = [];
  workspace.attachmentRepository = attachmentRepository;
  workspace.attachmentAccessAuditRepository = attachmentAccessAuditRepository;
  workspace.attachmentObjectStorage = attachmentObjectStorage;
  workspace.attachmentV1ReadinessOptions = options.attachmentV1ReadinessOptions ?? {};
  workspace.statementExportV1ReadinessOptions = options.statementExportV1ReadinessOptions ?? {};
  workspace.systemV1ReadinessOptions = options.systemV1ReadinessOptions ?? {};
  workspace.productionEnvFileApplication = productionEnvFileApplication;
  workspace.runtimeConfig = buildRuntimeConfigSummary(runtimeConfig);
  workspace.productionPersistenceValidation = productionPersistenceValidation;
  workspace.v1PersistenceProfile = v1PersistenceProfile.summary;
  workspace.paymentRecordRepository = paymentRecordRepository;
  workspace.statementPaymentTransactionRepository = statementPaymentTransactionRepository;
  workspace.statementSettlementTransactionRepository = statementSettlementTransactionRepository;
  workspace.statementSendTransactionRepository = statementSendTransactionRepository;
  workspace.statementExportRepository = statementExportRepository;
  workspace.statementExportObjectStorage = statementExportObjectStorage;
  workspace.coreWorkspaceReadRepository = coreWorkspaceReadRepository;
  workspace.todoActionRepository = todoActionRepository;
  workspace.inventoryCorrectionTransactionRepository = inventoryCorrectionTransactionRepository;
  workspace.productionFinishedGoodsPhotoTransactionRepository = productionFinishedGoodsPhotoTransactionRepository;
  workspace.orderDraftRepository = orderDraftRepository;
  workspace.orderConfirmationTransactionRepository = orderConfirmationTransactionRepository;
  workspace.orderPoolReadRepository = orderPoolReadRepository;
  workspace.fulfillmentActionTransactionRepository = fulfillmentActionTransactionRepository;
  workspace.driverDeliveryDispatchRepository = driverDeliveryDispatchRepository;
  workspace.driverDeviceFieldTestRepository = driverDeviceFieldTestRepository;
  workspace.driverDeliveryTaskReadRepository = driverDeliveryTaskReadRepository;
  workspace.inventoryLedgerReadRepository = inventoryLedgerReadRepository;
  workspace.inventoryReservationReleaseTransactionRepository = inventoryReservationReleaseTransactionRepository;
  workspace.inventoryIntentTransactionRepository = inventoryIntentTransactionRepository;
  workspace.orderLineVoidTransactionRepository = orderLineVoidTransactionRepository;
  workspace.orderLineQuantityAdjustmentTransactionRepository = orderLineQuantityAdjustmentTransactionRepository;
  workspace.productionPackingTransactionRepository = productionPackingTransactionRepository;
  workspace.productionPackingReadRepository = productionPackingReadRepository;
  workspace.productionScheduleRecordRepository = productionScheduleRecordRepository;
  workspace.printBatchRepository = printBatchRepository;
  workspace.printDeviceRepository = printDeviceRepository;
  workspace.printJobRepository = printJobRepository;
  workspace.printerDeviceFieldTestRepository = printerDeviceFieldTestRepository;
  workspace.masterDataImportReviewRepository = masterDataImportReviewRepository;
  workspace.masterDataImportTransactionRepository = masterDataImportTransactionRepository;
  workspace.rawMaterialInboundRepository = rawMaterialInboundRepository;
  workspace.rawMaterialSupplierStatementReviewRepository = rawMaterialSupplierStatementReviewRepository;
  workspace.runtimeIdentityRepository = runtimeIdentityRepository;
  workspace.printDriverAdapter = printDriverAdapter;
  const workspaceReady = loadPersistentWorkspaceState({
    workspace,
    attachmentRepository,
    attachmentAccessAuditRepository,
    paymentRecordRepository,
    statementExportRepository,
    coreWorkspaceReadRepository,
    orderDraftRepository,
    driverDeliveryDispatchRepository,
    driverDeviceFieldTestRepository,
    printerDeviceFieldTestRepository,
    masterDataImportReviewRepository,
    rawMaterialInboundRepository,
    rawMaterialSupplierStatementReviewRepository,
    runtimeIdentityRepository,
    productionScheduleRecordRepository,
    printBatchRepository,
    printDeviceRepository,
    printJobRepository,
  });
  const openapi = tryValidateOpenApi();

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host ?? "127.0.0.1"}`);
    response.erpSecurityPolicy = securityPolicy;
    response.erpRequestOrigin = getHeaderValue(request, "origin");

    try {
      await workspaceReady;
      const authContext = getRequestAuthContext(request, workspace);
      const permissionContext = getRequestPermissionContext(request, authContext, workspace);
      if (securityPolicy.strictAuth && !isCorsRequestAllowed(securityPolicy, response.erpRequestOrigin)) {
        return sendJson(response, 403, {
          code: "CORS_ORIGIN_DENIED",
          message: "The request origin is not allowed by the ERP API security policy.",
        });
      }
      if (request.method === "OPTIONS") {
        return sendJson(response, 204, {});
      }
      if (securityPolicy.strictAuth && !isPublicApiRoute(request.method, url.pathname, securityPolicy) && !authContext.authenticated) {
        return sendJson(response, 401, {
          code: authContext.authError ?? "AUTH_SESSION_REQUIRED",
          message: "A valid authenticated session is required.",
        });
      }
      if (request.method === "GET") {
        return await routeGet({ url, response, workspace, openapi, permissionContext, authContext });
      }
      if (request.method === "POST" || request.method === "PATCH") {
        const body = await readJsonRequestBody(request, securityPolicy.maxJsonBodyBytes);
        return await routeWrite({ method: request.method, request, url, response, workspace, body, permissionContext, authContext });
      }
      return sendJson(response, 405, {
        code: "METHOD_NOT_ALLOWED",
        message: "The P0 backend skeleton supports GET plus a first batch of in-memory POST/PATCH routes.",
      });
    } catch (error) {
      const statusCode = Number(error.statusCode ?? 500);
      return sendJson(response, statusCode, {
        code: error.code ?? (statusCode === 400 ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR"),
        message: securityPolicy.strictAuth && statusCode >= 500 ? "Internal server error." : error.message,
      });
    }
  });
  server.ready = workspaceReady;
  return server;
}

async function loadPersistentWorkspaceState({
  workspace,
  attachmentRepository,
  attachmentAccessAuditRepository,
  paymentRecordRepository,
  statementExportRepository,
  coreWorkspaceReadRepository,
  orderDraftRepository,
  driverDeliveryDispatchRepository,
  driverDeviceFieldTestRepository,
  printerDeviceFieldTestRepository,
  masterDataImportReviewRepository,
  rawMaterialInboundRepository,
  rawMaterialSupplierStatementReviewRepository,
  runtimeIdentityRepository,
  productionScheduleRecordRepository,
  printBatchRepository,
  printDeviceRepository,
  printJobRepository,
}) {
  const persistedCoreWorkspaceState = (await coreWorkspaceReadRepository.loadState?.()) ?? {};
  for (const key of coreWorkspaceCollectionKeys) {
    if (Array.isArray(persistedCoreWorkspaceState[key])) workspace[key] = persistedCoreWorkspaceState[key];
  }
  const persistedOrderDraftState = (await orderDraftRepository.loadState?.()) ?? {};
  workspace.orderDrafts = persistedOrderDraftState.orderDrafts ?? [];
  const persistedDriverDeliveryDispatchState = (await driverDeliveryDispatchRepository.loadState?.()) ?? {};
  const persistedDriverDeliveryDispatches = persistedDriverDeliveryDispatchState.driverDeliveryDispatches ?? [];
  workspace.driverDeliveryDispatches =
    persistedDriverDeliveryDispatches.length || workspace.runtimeConfig?.mode === "production"
      ? persistedDriverDeliveryDispatches
      : workspace.initialDriverDeliveryDispatches ?? [];
  const persistedDriverDeviceFieldTestState = (await driverDeviceFieldTestRepository.loadState?.()) ?? {};
  workspace.driverDeviceFieldTests = persistedDriverDeviceFieldTestState.driverDeviceFieldTests ?? [];
  workspace.printBatchRecords = ((await printBatchRepository.loadState()) ?? {}).printBatchRecords ?? [];
  workspace.printDevices = ((await printDeviceRepository.loadState()) ?? {}).printDevices ?? [];
  workspace.printJobs = ((await printJobRepository.loadState()) ?? {}).printJobs ?? [];
  const persistedPrinterDeviceFieldTestState = (await printerDeviceFieldTestRepository.loadState?.()) ?? {};
  workspace.printerDeviceFieldTests = persistedPrinterDeviceFieldTestState.printerDeviceFieldTests ?? [];
  const persistedMasterDataImportReviewState = (await masterDataImportReviewRepository.loadState?.()) ?? {};
  workspace.masterDataImportReviewDrafts = persistedMasterDataImportReviewState.masterDataImportReviewDrafts ?? [];
  workspace.masterDataImportConfirmationPlans = persistedMasterDataImportReviewState.masterDataImportConfirmationPlans ?? [];
  workspace.masterDataImportExecutions = persistedMasterDataImportReviewState.masterDataImportExecutions ?? [];
  for (const operationLog of persistedMasterDataImportReviewState.operationLogs ?? []) {
    workspace.operationLogs = upsertByKey(workspace.operationLogs, operationLog, "id");
  }
  const persistedRawMaterialInboundState =
    (await rawMaterialInboundRepository.loadState?.({ seedInbounds: workspace.initialRawMaterialInbounds })) ?? {};
  workspace.rawMaterialInbounds = persistedRawMaterialInboundState.rawMaterialInbounds ?? workspace.initialRawMaterialInbounds ?? [];
  const persistedRawMaterialSupplierStatementReviewState =
    (await rawMaterialSupplierStatementReviewRepository.loadState?.()) ?? {};
  workspace.rawMaterialSupplierStatementReviews =
    persistedRawMaterialSupplierStatementReviewState.rawMaterialSupplierStatementReviews ?? [];
  const persistedRuntimeIdentityState = (await runtimeIdentityRepository.loadState?.()) ?? {};
  mergeRuntimeIdentityStateIntoWorkspace(workspace, persistedRuntimeIdentityState);
  const persistedProductionScheduleState = (await productionScheduleRecordRepository.loadState?.()) ?? {};
  workspace.productionScheduleRecords = persistedProductionScheduleState.productionScheduleRecords ?? [];
  workspace.paymentRecords = ((await paymentRecordRepository.loadState()) ?? {}).paymentRecords ?? [];
  workspace.statementExportFiles = ((await statementExportRepository.loadState()) ?? {}).statementExportFiles ?? [];
  const persistedAttachmentState = (await attachmentRepository.loadState()) ?? {};
  workspace.attachments = persistedAttachmentState.attachments ?? [];
  workspace.attachmentLinks = persistedAttachmentState.attachmentLinks ?? [];
  const persistedAttachmentAccessAuditState = (await attachmentAccessAuditRepository.loadState()) ?? {};
  workspace.attachmentAccessLogs = persistedAttachmentAccessAuditState.attachmentAccessLogs ?? [];
  await ensureOfficePrintJobDemoSeeds(workspace);
}

async function routeGet(context) {
  const { url, response, workspace, openapi, permissionContext, authContext } = context;

  if (url.pathname === "/api/health") {
    return sendJson(response, 200, {
      status: "ok",
      service: "erp-p0-api",
      now: new Date().toISOString(),
      openapi: {
        valid: openapi.valid,
        pathCount: openapi.pathCount,
        schemaCount: openapi.schemaCount,
        refCount: openapi.refCount,
      },
      seed: {
        runtimeConfig: workspace.runtimeConfig,
        productionPersistenceValidation: workspace.productionPersistenceValidation,
        scenarioId: workspace.scenario.id,
        customers: workspace.customers.length,
        orderLines: workspace.orderLines.length,
        inventories: workspace.inventories.length,
        todos: workspace.todos.length,
        fulfillments: workspace.fulfillments.length,
        statements: workspace.statements.length,
        attachmentRepository: workspace.attachmentRepository.kind,
        attachmentAccessAuditRepository: workspace.attachmentAccessAuditRepository.kind,
        attachmentObjectStorage: workspace.attachmentObjectStorage.kind,
        paymentRecordRepository: workspace.paymentRecordRepository.kind,
        statementPaymentTransactionRepository: workspace.statementPaymentTransactionRepository.kind,
        statementSettlementTransactionRepository: workspace.statementSettlementTransactionRepository.kind,
        statementSendTransactionRepository: workspace.statementSendTransactionRepository.kind,
        statementExportRepository: workspace.statementExportRepository.kind,
        statementExportObjectStorage: workspace.statementExportObjectStorage.kind,
        coreWorkspaceReadRepository: workspace.coreWorkspaceReadRepository.kind,
        todoActionRepository: workspace.todoActionRepository.kind,
        inventoryCorrectionTransactionRepository: workspace.inventoryCorrectionTransactionRepository.kind,
        productionFinishedGoodsPhotoTransactionRepository: workspace.productionFinishedGoodsPhotoTransactionRepository.kind,
        orderDraftRepository: workspace.orderDraftRepository.kind,
        orderConfirmationTransactionRepository: workspace.orderConfirmationTransactionRepository.kind,
        orderPoolReadRepository: workspace.orderPoolReadRepository.kind,
        fulfillmentActionTransactionRepository: workspace.fulfillmentActionTransactionRepository.kind,
        driverDeliveryDispatchRepository: workspace.driverDeliveryDispatchRepository.kind,
        driverDeviceFieldTestRepository: workspace.driverDeviceFieldTestRepository.kind,
        driverDeliveryTaskReadRepository: workspace.driverDeliveryTaskReadRepository.kind,
        inventoryLedgerReadRepository: workspace.inventoryLedgerReadRepository.kind,
        inventoryReservationReleaseTransactionRepository: workspace.inventoryReservationReleaseTransactionRepository.kind,
        inventoryIntentTransactionRepository: workspace.inventoryIntentTransactionRepository.kind,
        orderLineVoidTransactionRepository: workspace.orderLineVoidTransactionRepository.kind,
        orderLineQuantityAdjustmentTransactionRepository:
          workspace.orderLineQuantityAdjustmentTransactionRepository.kind,
        productionPackingTransactionRepository: workspace.productionPackingTransactionRepository.kind,
        productionPackingReadRepository: workspace.productionPackingReadRepository.kind,
        productionScheduleRecordRepository: workspace.productionScheduleRecordRepository.kind,
        printBatchRepository: workspace.printBatchRepository.kind,
        printDeviceRepository: workspace.printDeviceRepository.kind,
        printJobRepository: workspace.printJobRepository.kind,
        printerDeviceFieldTestRepository: workspace.printerDeviceFieldTestRepository.kind,
        masterDataImportReviewRepository: workspace.masterDataImportReviewRepository.kind,
        masterDataImportTransactionRepository: workspace.masterDataImportTransactionRepository.kind,
        rawMaterialInboundRepository: workspace.rawMaterialInboundRepository.kind,
        rawMaterialSupplierStatementReviewRepository: workspace.rawMaterialSupplierStatementReviewRepository.kind,
        runtimeIdentityRepository: workspace.runtimeIdentityRepository.kind,
        printDriverAdapter: workspace.printDriverAdapter.kind,
        productionEnvFileApplication: workspace.productionEnvFileApplication,
        v1PersistenceProfile: workspace.v1PersistenceProfile,
      },
    });
  }

  if (
    await handleSystemReadRoutes({
      url,
      response,
      workspace,
      openapi,
      permissionContext,
      authContext,
      sendJson,
      getPermissionOperatorId,
      getSystemV1ReadinessResponse,
      getSystemV1GoLiveStatusResponse,
      filterByValue,
    })
  ) {
    return;
  }

  if (await handleAuthReadRoutes({ url, response, permissionContext, authContext, getCurrentAuthSession })) return;

  if (
    await handleAttachmentReadRoutes({
      url,
      response,
      workspace,
      permissionContext,
      authContext,
      writeActionPermissions,
      requireActionPermission,
      getPermissionOperatorId,
      sendBusinessError,
      listAttachmentsRoute,
      getAttachmentStorageDiagnosticsRoute,
      getAttachmentV1ReadinessRoute,
      createAttachmentAccessUrlRoute,
      listAttachmentAccessLogsRoute,
      getAttachmentContentRoute,
    })
  ) {
    return;
  }

  if (url.pathname === "/api/office/workspace") {
    if (!isOfficeWorkspaceProjectionEnabled(workspace)) {
      return sendBusinessError(
        response,
        403,
        "OFFICE_WORKSPACE_PROJECTION_DISABLED",
        "The legacy whole-workspace projection is disabled in production. Use permission-scoped domain APIs.",
      );
    }
    return sendJson(response, 200, buildOfficeWorkspaceProjection(workspace));
  }

  if (await handleOrderReadRoutes({ url, response, workspace, sendJson, sendNotFound })) return;

  if (
    await handleProductionReadRoutes({
      url,
      response,
      workspace,
      sendJson,
      sendNotFound,
      buildProductionMachineQueueResponse,
    })
  ) {
    return;
  }

  if (
    await handleInventoryReadRoutes({
      url,
      response,
      workspace,
      sendJson,
      filterByKeyword,
      filterByValue,
      paginate,
      sendNotFound,
      cleanServerText,
      findInventoryCorrectionDraft,
      buildInventoryCorrectionDraftDetail,
      filterInventoryCorrectionDraftSummaries,
      toInventoryCorrectionDraftSummary,
    })
  ) {
    return;
  }

  if (
    await handleFulfillmentReadRoutes({
      url,
      response,
      workspace,
      sendJson,
      sendNotFound,
      filterByKeyword,
      filterByValue,
      paginate,
      toFulfillmentListItem,
      buildFulfillmentMetrics,
    })
  ) {
    return;
  }

  if (
    await handleStatementReadRoutes({
      url,
      response,
      workspace,
      permissionContext,
      authContext,
      writeActionPermissions,
      requireActionPermission,
      getPermissionOperatorId,
      sendJson,
      sendNotFound,
      getStatementCustomers,
      filterByKeyword,
      filterByValue,
      paginate,
      getStatementExportStorageDiagnosticsRoute,
      getStatementExportV1ReadinessRoute,
      listStatementExportsRoute,
      downloadStatementExportRoute,
    })
  ) {
    return;
  }

  if (
    await handleTodoReadRoutes({
      url,
      response,
      workspace,
      sendJson,
      filterByKeyword,
      filterByValue,
      paginate,
      toTodoListItem,
    })
  ) {
    return;
  }

  if (
    await handlePrintReadRoutes({
      url,
      response,
      workspace,
      permissionContext,
      authContext,
      writeActionPermissions,
      requireActionPermission,
      getPermissionOperatorId,
      sendJson,
      sendNotFound,
      paginate,
      findPrintJob,
      getPrintDriverConfigurationResponse,
      getPrintDriverSpoolDiagnosticsResponse,
      getPrintDriverCupsDiagnosticsResponse,
      getPrintDriverV1ReadinessResponse,
      listPrinterDeviceFieldTestsRoute,
    })
  ) {
    return;
  }

  if (await handleRawMaterialReadRoutes({ url, response, workspace, sendJson, sendNotFound })) return;

  if (
    await handleMasterDataReadRoutes({
      url,
      response,
      workspace,
      permissionContext,
      writeActionPermissions,
      requireActionPermission,
      sendJson,
      paginate,
      listMasterDataEmployeeAccountReviews,
      buildRuntimeEmployeeAccountReadiness,
      buildEmployeeAssignmentOptions,
      downloadMasterDataImportFailedRowsRoute,
    })
  ) {
    return;
  }

  if (
    await handleDriverReadRoutes({
      url,
      response,
      workspace,
      permissionContext,
      authContext,
      writeActionPermissions,
      requireActionPermission,
      getPermissionOperatorId,
      sendJson,
      listDriverDeliveryTasksRoute,
      getDriverDeliveryTaskRoute,
      getDriverV1ReadinessResponse,
    })
  ) {
    return;
  }

  return sendNotFound(response, "ROUTE_NOT_FOUND");
}

async function routeWrite(context) {
  const { method, request, url, response, workspace, body, permissionContext, authContext } = context;
  const idempotencyKey =
    workspace.runtimeConfig?.production && isProductionBusinessWritePath(url.pathname)
      ? requireHttpIdempotencyKey(request, body)
      : readHttpIdempotencyKey(request, body);
  if (idempotencyKey) body.idempotencyKey = idempotencyKey;

  if (
    await handleAuthWriteRoutes({
      method,
      url,
      response,
      workspace,
      body,
      authContext,
      loginSeedAuth,
      loginPrototypeSeedAuth,
      changeRuntimeUserPasswordRoute,
      logoutSeedAuth,
    })
  ) {
    return;
  }

  if (
    await handleAttachmentWriteRoutes({
      method,
      url,
      response,
      workspace,
      body,
      permissionContext,
      operatorId: getPermissionOperatorId(permissionContext, authContext),
      requireAttachmentCreatePermission,
      createAttachmentRoute,
    })
  ) {
    return;
  }

  if (
    await handleSystemWriteRoutes({
      method,
      url,
      request,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      writeActionPermissions,
      requireActionPermission,
      getPermissionOperatorId,
      sendJson,
      handlers: {
        generateFieldEvidenceDraftManifest: generateSystemV1FieldEvidenceIntakeDraftManifest,
        validateFieldEvidenceDraftManifest: validateSystemV1FieldEvidenceDraftManifest,
        stageFieldEvidenceRow: stageSystemV1FieldEvidenceIntakeRow,
        precheckProductionEnv: precheckSystemV1ProductionEnv,
        runProductionEnvSetup: runSystemV1ProductionEnvSetup,
        precheckProductionEnvIntake: precheckSystemV1ProductionEnvIntake,
        precheckProductionEnvFileAudit: precheckSystemV1ProductionEnvFileAudit,
        precheckProductionEnvFilePreview: precheckSystemV1ProductionEnvFilePreview,
        precheckProductionGoLive: precheckSystemV1ProductionGoLive,
        runProductionPersistenceEvidence: runSystemV1ProductionPersistenceEvidence,
        runProductionFirstStageExecution: runSystemV1ProductionFirstStageExecution,
        precheckProductionFirstStageValuesDryRun: precheckSystemV1ProductionFirstStageValuesDryRun,
        runProductionFirstStageValuesApply: runSystemV1ProductionFirstStageValuesApply,
        precheckPersistence: precheckV1Persistence,
        precheckAttachmentRetention: precheckV1AttachmentRetention,
        precheckDriverReadiness: precheckV1DriverReadiness,
        precheckRuntimeReadiness: precheckV1RuntimeReadiness,
        precheckV1V2Boundary: precheckSystemV1V2Boundary,
        refreshV1V2ScopeBrief: refreshSystemV1V2ScopeBrief,
        precheckV1ReleaseCandidateRefresh: precheckSystemV1ReleaseCandidateRefresh,
        refreshV1ReleaseCandidate: refreshSystemV1ReleaseCandidate,
      },
    })
  ) {
    return;
  }

  if (
    await handleTodoWriteRoutes({
      method,
      url,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      writeActionPermissions,
      requireActionPermission,
      getPermissionOperatorId,
      handleTodoRoute,
    })
  ) {
    return;
  }

  if (
    await handlePrintWriteRoutes({
      method,
      url,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      writeActionPermissions,
      requireActionPermission,
      getPermissionOperatorId,
      createPrintBatchRoute,
      upsertPrintDeviceRoute,
      updatePrintDeviceDriverModeRoute,
      recordPrinterDeviceFieldTestRoute,
      updatePrintJobStatusRoute,
      dispatchPrintJobRoute,
      pollPrintJobsRoute,
      recordPrintJobDriverStatusRoute,
      pollPrintJobDriverStatusRoute,
      retryPrintJobRoute,
    })
  ) {
    return;
  }

  if (
    await handleInventoryWriteRoutes({
      method,
      url,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      writeActionPermissions,
      requireActionPermission,
      getPermissionOperatorId,
      createInventoryCorrectionDraftRoute,
      linkInventoryCorrectionAttachmentsRoute,
      confirmInventoryCorrectionDraftRoute,
      releaseInventoryReservationRoute,
      sendJson,
      sendNotFound,
      sendBusinessError,
    })
  ) {
    return;
  }

  if (
    await handleFulfillmentWriteRoutes({
      method,
      url,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      writeActionPermissions,
      requireActionPermission,
      getPermissionOperatorId,
      createFulfillmentExceptionRoute,
      upsertFulfillmentDispatchRoute,
      printFulfillmentRoute,
      voidPrintRecordRoute,
      updateFulfillmentStatusRoute,
      cancelFulfillmentRoute,
      reviewDeliveryEvidenceRoute,
    })
  ) {
    return;
  }

  if (
    await handleStatementWriteRoutes({
      method,
      url,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      writeActionPermissions,
      requireActionPermission,
      getPermissionOperatorId,
      previewStatementRoute,
      markStatementSentRoute,
      markStatementSendReceiptRoute,
      recordStatementCustomerConfirmationRoute,
      recordStatementPaymentRoute,
      handleStatementVarianceRoute,
      writeOffStatementRoute,
    })
  ) {
    return;
  }

  if (
    await handleProductionWriteRoutes({
      method,
      url,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      writeActionPermissions,
      requireActionPermission,
      getPermissionOperatorId,
      publishProductionScheduleRoute,
      resequenceProductionMachineQueueRoute,
      moveProductionMachineQueueItemRoute,
      reportProductionCompleteRoute,
      recordProductionDailyProgressRoute,
      uploadProductionFinishedGoodsPhotoRoute,
      reviewProductionFinishedGoodsPhotoRoute,
      completePackingTaskRoute,
    })
  ) {
    return;
  }

  if (
    await handleRawMaterialWriteRoutes({
      method,
      url,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      writeActionPermissions,
      requireActionPermission,
      getPermissionOperatorId,
      sendNotFound,
      rawMaterialInboundActionRoute,
      createRawMaterialSupplierStatementReviewDraftRoute,
      confirmRawMaterialSupplierStatementReviewRoute,
      confirmRawMaterialSupplierStatementRoute,
      generateRawMaterialSupplierPayableDraftRoute,
      confirmRawMaterialSupplierPaymentRoute,
    })
  ) {
    return;
  }

  if (
    await handleOrderWriteRoutes({
      method,
      url,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      writeActionPermissions,
      requireActionPermission,
      getPermissionOperatorId,
      recognizeOrderDraft,
      recognizeOrderDraftQueue,
      saveOrderDraft,
      restoreShortageCancelledDraftLineRoute,
      linkCrossDraftShortageCancellationRoute,
      previewOrderDraftSplitRoute,
      confirmSplitOrderDraftRoute,
      confirmOrderDraftRoute,
      voidOrderLineRoute,
      adjustOrderLineQuantityRoute,
    })
  ) {
    return;
  }

  if (
    await handleDriverWriteRoutes({
      method,
      url,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      writeActionPermissions,
      requireActionPermission,
      getPermissionOperatorId,
      confirmDriverDeliveryLoadedRoute,
      recordDriverDeviceFieldTestRoute,
      completeDriverDeliveryTaskRoute,
      reportDriverDeliveryExceptionRoute,
    })
  ) {
    return;
  }

  if (
    await handleMasterDataWriteRoutes({
      method,
      url,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      writeActionPermissions,
      requireActionPermission,
      getPermissionOperatorId,
      createMasterDataImportConfirmationPlanRoute,
      createMasterDataImportExecutionRoute,
      createMasterDataFailedRowsCorrectionDraftRoute,
      enableMasterDataEmployeeAccountRoute,
      updateMasterDataEmployeeAssignmentRoute,
      issueMasterDataEmployeeAccountPasswordRoute,
      revokeMasterDataEmployeeAccountPasswordRoute,
    })
  ) {
    return;
  }

  return sendNotFound(response, "ROUTE_NOT_FOUND");
}

async function rawMaterialInboundActionRoute({ response, workspace, inboundId, actionSlug, body, operatorId }) {
  let result;
  try {
    result = await workspace.rawMaterialInboundRepository.recordRawMaterialInboundAction({
      workspace,
      inboundId,
      action: actionSlug,
      body,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: body,
      operatorId,
      operatorName: getUserDisplayName(new Map((workspace.users ?? []).map((user) => [user.id ?? user.userId, user])), operatorId),
    });
  } catch (error) {
    const statusCode = Number(error.statusCode ?? 500);
    const code = error.code || (statusCode === 404 ? "RAW_MATERIAL_INBOUND_NOT_FOUND" : "RAW_MATERIAL_INBOUND_ACTION_FAILED");
    return sendBusinessError(response, statusCode, code, error.message);
  }
  if (result.operationLog) {
    workspace.operationLogs = Array.isArray(workspace.operationLogs) ? workspace.operationLogs : [];
    workspace.operationLogs.unshift(result.operationLog);
  }
  return sendJson(response, 200, {
    inbound: result.inbound,
    operationLogId: result.operationLogId ?? result.operationLog?.id ?? "",
  });
}

async function createRawMaterialSupplierStatementReviewDraftRoute({ response, workspace, body, operatorId }) {
  const statementResult = body.statementResult ?? body.result;
  if (!statementResult || typeof statementResult !== "object") {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "statementResult is required");
  }
  const users = new Map((workspace.users ?? []).map((user) => [user.id ?? user.userId, user]));
  const result = await workspace.rawMaterialSupplierStatementReviewRepository.createReviewDraft({
    workspace,
    statementResult,
    fileName: body.fileName,
    supplierName: body.supplierName,
    note: body.note,
    now: body.now,
    operatorId,
    operatorName: getUserDisplayName(users, operatorId),
  });
  if (result.operationLog) {
    workspace.operationLogs = Array.isArray(workspace.operationLogs) ? workspace.operationLogs : [];
    workspace.operationLogs.unshift(result.operationLog);
  }
  return sendJson(response, 200, {
    review: result.review,
    operationLogId: result.operationLogId ?? result.operationLog?.id ?? "",
  });
}

async function confirmRawMaterialSupplierStatementReviewRoute({ response, workspace, reviewId, body, operatorId }) {
  const users = new Map((workspace.users ?? []).map((user) => [user.id ?? user.userId, user]));
  const result = await workspace.rawMaterialSupplierStatementReviewRepository.confirmReview({
    workspace,
    reviewId,
    decision: body.decision,
    note: body.note,
    now: body.now,
    operatorId,
    operatorName: getUserDisplayName(users, operatorId),
  });
  if (result.operationLog) {
    workspace.operationLogs = Array.isArray(workspace.operationLogs) ? workspace.operationLogs : [];
    workspace.operationLogs.unshift(result.operationLog);
  }
  return sendJson(response, 200, {
    review: result.review,
    operationLogId: result.operationLogId ?? result.operationLog?.id ?? "",
  });
}

async function confirmRawMaterialSupplierStatementRoute({ response, workspace, reviewId, body, operatorId }) {
  const users = new Map((workspace.users ?? []).map((user) => [user.id ?? user.userId, user]));
  const result = await workspace.rawMaterialSupplierStatementReviewRepository.confirmStatement({
    workspace,
    reviewId,
    note: body.note,
    now: body.now,
    operatorId,
    operatorName: getUserDisplayName(users, operatorId),
  });
  if (result.operationLog) {
    workspace.operationLogs = Array.isArray(workspace.operationLogs) ? workspace.operationLogs : [];
    workspace.operationLogs.unshift(result.operationLog);
  }
  return sendJson(response, 200, {
    review: result.review,
    operationLogId: result.operationLogId ?? result.operationLog?.id ?? "",
  });
}

async function generateRawMaterialSupplierPayableDraftRoute({ response, workspace, reviewId, body, operatorId }) {
  const users = new Map((workspace.users ?? []).map((user) => [user.id ?? user.userId, user]));
  const result = await workspace.rawMaterialSupplierStatementReviewRepository.generatePayableDraft({
    workspace,
    reviewId,
    note: body.note,
    now: body.now,
    operatorId,
    operatorName: getUserDisplayName(users, operatorId),
  });
  if (result.operationLog) {
    workspace.operationLogs = Array.isArray(workspace.operationLogs) ? workspace.operationLogs : [];
    workspace.operationLogs.unshift(result.operationLog);
  }
  return sendJson(response, 200, {
    review: result.review,
    payableDraft: result.payableDraft,
    operationLogId: result.operationLogId ?? result.operationLog?.id ?? "",
  });
}

async function confirmRawMaterialSupplierPaymentRoute({ response, workspace, reviewId, body, operatorId }) {
  const users = new Map((workspace.users ?? []).map((user) => [user.id ?? user.userId, user]));
  const result = await workspace.rawMaterialSupplierStatementReviewRepository.confirmPayment({
    workspace,
    reviewId,
    paidAmount: body.paidAmount ?? body.amount,
    paymentMethod: body.paymentMethod,
    paymentAccount: body.paymentAccount,
    paymentReferenceNo: body.paymentReferenceNo,
    paymentVoucherNo: body.paymentVoucherNo,
    paidAt: body.paidAt,
    note: body.note,
    now: body.now,
    operatorId,
    operatorName: getUserDisplayName(users, operatorId),
  });
  if (result.operationLog) {
    workspace.operationLogs = Array.isArray(workspace.operationLogs) ? workspace.operationLogs : [];
    workspace.operationLogs.unshift(result.operationLog);
  }
  return sendJson(response, 200, {
    review: result.review,
    paymentRecord: result.paymentRecord,
    operationLogId: result.operationLogId ?? result.operationLog?.id ?? "",
  });
}

function getRequestPermissionContext(request, authContext = getRequestAuthContext(request), workspace = {}) {
  const effectivePermissions = getEffectivePermissions(authContext.userId, { runtimeUsers: workspace.users });
  const actionPermissionOverride = request.headers["x-erp-action-permissions"];
  const securityPolicy = getWorkspaceSecurityPolicy(workspace);

  if (actionPermissionOverride === undefined || !securityPolicy.allowActionPermissionOverride) {
    return effectivePermissions;
  }

  return {
    ...effectivePermissions,
    actionPermissions: parseActionPermissionOverride(actionPermissionOverride),
  };
}

function getRequestAuthContext(request, workspace = {}) {
  const securityPolicy = getWorkspaceSecurityPolicy(workspace);
  const bearerToken = getBearerToken(request);
  if (bearerToken?.startsWith(`${runtimeSessionTokenPrefix}.`)) {
    const verifiedSession = verifyRuntimeSessionToken(bearerToken, {
      runtimeUsers: workspace.users,
      revokedSessionIds: workspace.revokedSeedSessionJtis,
      authSecret: securityPolicy.authSecret,
    });
    if (verifiedSession.valid) {
      return {
        authenticated: true,
        source: "runtime_session",
        userId: verifiedSession.userId,
        session: verifiedSession.session,
      };
    }
    return {
      authenticated: false,
      source: "invalid_runtime_session",
      userId: "INVALID-RUNTIME-SESSION",
      authError: verifiedSession.reason,
    };
  }

  if (bearerToken?.startsWith(`${seedSessionTokenPrefix}.`)) {
    const verifiedSession = verifySeedSessionToken(bearerToken, {
      runtimeUsers: workspace.users,
      revokedSessionIds: workspace.revokedSeedSessionJtis,
      authSecret: securityPolicy.authSecret,
    });
    if (verifiedSession.valid) {
      if (!securityPolicy.allowSeedUsers && getSeedUser(verifiedSession.userId)) {
        return {
          authenticated: false,
          source: "seed_session_disabled",
          userId: "SEED-SESSION-DISABLED",
          authError: "AUTH_SEED_USER_DISABLED",
        };
      }
      return {
        authenticated: true,
        source: "seed_session",
        userId: verifiedSession.userId,
        session: verifiedSession.session,
      };
    }
    return {
      authenticated: false,
      source: "invalid_seed_session",
      userId: "INVALID-SEED-SESSION",
      authError: verifiedSession.reason,
    };
  }

  const legacySeedBearerMatch = String(bearerToken ?? "").match(/^seed:(.+)$/i);
  if (securityPolicy.allowLegacyIdentityHeaders && legacySeedBearerMatch?.[1]) {
    return {
      authenticated: false,
      source: "legacy_seed_bearer",
      userId: legacySeedBearerMatch[1].trim(),
    };
  }

  const userIdHeader = getHeaderValue(request, "x-erp-user-id");
  if (securityPolicy.allowLegacyIdentityHeaders && userIdHeader) {
    return {
      authenticated: false,
      source: "seed_user_header",
      userId: userIdHeader,
    };
  }

  if (!securityPolicy.allowDefaultSeedUser) {
    return {
      authenticated: false,
      source: "unauthenticated",
      userId: "UNAUTHENTICATED",
      authError: "AUTH_SESSION_REQUIRED",
    };
  }

  return {
    authenticated: false,
    source: "default_seed_user",
    userId: "U-OFFICE-A",
  };
}

function getBearerToken(request) {
  const authorization = getHeaderValue(request, "authorization");
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  return bearerMatch?.[1]?.trim() ?? "";
}

function getHeaderValue(request, headerName) {
  const raw = request.headers[headerName];
  if (Array.isArray(raw)) return raw.join(",").trim();
  return String(raw ?? "").trim();
}

function parseActionPermissionOverride(value) {
  const raw = Array.isArray(value) ? value.join(",") : String(value);
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return [];
  return trimmed
    .split(",")
    .map((permissionKey) => permissionKey.trim())
    .filter(Boolean);
}

function requireActionPermission(response, permissionContext, permissionKey) {
  if (permissionContext.actionPermissions?.includes(permissionKey)) return true;
  sendJson(response, 403, {
    code: "PERMISSION_DENIED",
    message: `Missing action permission: ${permissionKey}`,
    requiredPermission: permissionKey,
  });
  return false;
}

function requireAnyActionPermission(response, permissionContext, permissionKeys) {
  const keys = permissionKeys.filter(Boolean);
  if (keys.some((permissionKey) => permissionContext.actionPermissions?.includes(permissionKey))) return true;
  sendJson(response, 403, {
    code: "PERMISSION_DENIED",
    message: `Missing one of action permissions: ${keys.join(", ")}`,
    requiredPermission: keys.join(" or "),
  });
  return false;
}

function requireAttachmentCreatePermission(response, permissionContext, body = {}) {
  const isInventoryCorrectionEvidence =
    String(body.ownerType ?? "").trim() === "inventory_correction" &&
    String(body.purpose ?? "").trim() === "inventory_correction_evidence";
  if (isInventoryCorrectionEvidence) {
    return requireAnyActionPermission(response, permissionContext, [
      "attachment.inventory_correction.create",
      writeActionPermissions.createAttachment,
    ]);
  }

  const isFinishedGoodsPhoto =
    String(body.ownerType ?? "").trim() === "production_task" &&
    String(body.purpose ?? "").trim() === "finished_goods_photo";
  if (isFinishedGoodsPhoto) {
    return requireAnyActionPermission(response, permissionContext, [
      "attachment.finished_goods_photo.create",
      writeActionPermissions.createAttachment,
    ]);
  }

  const isDeliveryEvidence =
    String(body.ownerType ?? "").trim() === "fulfillment" &&
    ["delivery_watermark_photo", "signature_photo"].includes(String(body.purpose ?? "").trim());
  if (isDeliveryEvidence) {
    return requireAnyActionPermission(response, permissionContext, [
      "attachment.delivery_evidence.create",
      writeActionPermissions.createAttachment,
    ]);
  }
  return requireActionPermission(response, permissionContext, writeActionPermissions.createAttachment);
}

function getPermissionOperatorId(permissionContext, authContext, fallbackUserId = "U-OFFICE-A") {
  const userId = String(permissionContext?.user?.userId ?? authContext?.userId ?? fallbackUserId).trim();
  return userId || fallbackUserId;
}

async function loginSeedAuth({ response, workspace, body }) {
  const result = await runtimeAuthCommandService.login({ workspace, body });
  return sendRuntimeAuthCommandResult(response, result);
}

async function loginPrototypeSeedAuth({ response, workspace, body }) {
  const result = await runtimeAuthCommandService.prototypeLogin({ workspace, body });
  return sendRuntimeAuthCommandResult(response, result);
}

async function changeRuntimeUserPasswordRoute({ response, workspace, body, authContext }) {
  const result = await runtimeAuthCommandService.changePassword({
    workspace,
    body,
    authContext,
  });
  return sendRuntimeAuthCommandResult(response, result);
}

function getCurrentAuthSession({ response, permissionContext, authContext }) {
  const result = runtimeAuthCommandService.getCurrentSession({
    permissionContext,
    authContext,
  });
  return sendRuntimeAuthCommandResult(response, result);
}

async function logoutSeedAuth({ response, workspace, authContext }) {
  const result = await runtimeAuthCommandService.logout({ workspace, authContext });
  return sendRuntimeAuthCommandResult(response, result);
}

function sendRuntimeAuthCommandResult(response, result) {
  return sendJson(response, result.statusCode ?? 200, result.response);
}

function toFulfillmentListItem(workspace, item) {
  const dispatch = findActiveDriverDeliveryDispatch(workspace, item.id);
  return {
    fulfillmentId: item.id,
    customerId: item.customerId,
    orderLineId: item.lineId,
    orderNo: item.lineId,
    customerName: findCustomerName(workspace, item.customerId),
    method: mapFulfillmentMethod(item.method),
    goodsSpec: item.goods,
    expectedQty: Number(item.qty ?? 0),
    actualQty: Number(item.actualQty ?? item.qty ?? 0),
    packageCount: parsePackageCount(item.package),
    package: item.package ?? "",
    packages: item.package ?? "",
    latestNeededAt: item.latest,
    status: item.status,
    inventorySource: item.inventorySource,
    zone: item.zone ?? item.inventorySource ?? "",
    noteFlags: item.noteFlags ?? [],
    watermarkedPhotoAttached: item.watermarkedPhotoAttached === true,
    watermarkedPhotoAttachmentId: item.watermarkedPhotoAttachmentId ?? "",
    signaturePhotoAttached: item.signaturePhotoAttached === true,
    signaturePhotoAttachmentId: item.signaturePhotoAttachmentId ?? "",
    deliveryEvidenceReviewStatus: item.deliveryEvidenceReviewStatus ?? "",
    deliveryEvidenceReviewedAt: item.deliveryEvidenceReviewedAt ?? "",
    deliveryEvidenceReviewedBy: item.deliveryEvidenceReviewedBy ?? "",
    deliveryEvidenceReviewedByUserId: item.deliveryEvidenceReviewedByUserId ?? "",
    deliveryEvidenceIssueReason: item.deliveryEvidenceIssueReason ?? "",
    driverId: dispatch.driverId ?? dispatch.driver_id ?? "",
    routeDate: dispatch.routeDate ?? dispatch.route_date ?? "",
    routeNo: dispatch.routeNo ?? dispatch.routeBatchNo ?? dispatch.route_batch_no ?? "",
    routeSequence: Number(dispatch.routeSequence ?? dispatch.stopSequence ?? dispatch.stop_sequence ?? 0),
    dispatchStatus: dispatch.dispatchStatus ?? dispatch.dispatch_status ?? "",
    plannedDepartureAt: dispatch.plannedDepartureAt ?? dispatch.planned_departure_at ?? "",
    dispatchAssignedAt: dispatch.assignedAt ?? dispatch.dispatchAssignedAt ?? dispatch.assigned_at ?? "",
    dispatchRemark: dispatch.remark ?? "",
  };
}

function buildFulfillmentMetrics(fulfillments) {
  return {
    openCount: fulfillments.filter((item) => item.status !== "已交付").length,
    todayUrgentCount: fulfillments.filter((item) => String(item.latest ?? "").includes("今天")).length,
    exceptionCount: fulfillments.filter((item) => item.status.includes("差异") || item.status.includes("无法")).length,
    waitingPickupCount: fulfillments.filter((item) => item.status.includes("待确认拉走")).length,
  };
}

function toOrderLineSummary(line) {
  return {
    id: line.id,
    lineStatus: line.status,
    exceptionTags: line.flags ?? [],
  };
}

function toPriceSnapshot(line) {
  const pricing = calculateLinePricing({
    ...line,
    print: line.print ?? (line.printFlag ? "是" : "否"),
    qty: line.qty ?? line.originalQty,
  });
  return {
    orderLineId: line.id,
    bagPrice: pricing.bagPrice,
    printPrice: pricing.printPrice,
    otherFee: 0,
    amount: Number(line.amount ?? pricing.amount ?? 0),
    priceVersion: pricing.priceVersion,
  };
}

function toInventoryCheckResult(workspace, draftLine, orderLine) {
  const inventoryItem = findMatchingInventory(workspace, draftLine);
  const currentAvailableQty = Number(inventoryItem?.available ?? 0);
  return {
    orderLineId: orderLine?.id ?? draftLine.id,
    inventoryItemId: inventoryItem?.id ?? "",
    status: mapInventoryCheckStatus(draftLine.inventory),
    requestedQty: Number(draftLine.qty ?? 0),
    recognizedAvailableQty: currentAvailableQty,
    currentAvailableQty,
    shortageQty: Math.max(0, Number(draftLine.qty ?? 0) - currentAvailableQty),
  };
}

function toInventoryReservationTransactionSummary(reservation) {
  return {
    reservationId: reservation.reservationId,
    orderLineId: reservation.orderLineId,
    inventoryItemId: reservation.inventoryItemId,
    qty: Number(reservation.reservedQty ?? reservation.qty ?? 0),
    status: mapInventoryReservationApiStatus(reservation.status),
  };
}

function toFulfillmentTaskSummary(fulfillment) {
  return {
    fulfillmentId: fulfillment.id,
    orderLineId: fulfillment.lineId,
    method: mapFulfillmentMethod(fulfillment.method),
    status: fulfillment.status,
    expectedQty: Number(fulfillment.qty ?? 0),
  };
}

function toTodoSummary(todo) {
  const refId = todo.refId || todo.ref || "";
  return {
    todoId: todo.id,
    type: todo.type,
    customerId: todo.customerId,
    refType: todo.refType || inferTodoRefType({ ...todo, ref: refId }),
    refId,
    handled: Boolean(todo.handled),
    summary: todo.summary,
    latestNeededAt: todo.latest,
    urgency: todo.urgency,
    impact: todo.impact,
    notificationCopyText: todo.notificationCopyText,
    notificationChannel: todo.notificationChannel,
    notificationStatus: todo.notificationStatus,
    photoPrompt: todo.photoPrompt,
  };
}

function toTodoListItem(workspace, todo) {
  return {
    ...toTodoSummary(todo),
    ...resolveTodoReference(workspace, todo),
    status: mapTodoStatus(todo),
    priority: mapTodoPriority(todo.urgency),
    customerName: findCustomerName(workspace, todo.customerId),
    title: todo.type,
    summary: todo.summary,
    wait: todo.wait,
    urgency: todo.urgency,
    impact: todo.impact,
    lastAction: todo.lastAction,
    reminder: todo.reminder,
    latestNeededAt: todo.latest,
    snoozeUntil: todo.snoozeUntil,
    handledBy: todo.handledBy,
    handledAt: todo.handledAt,
    handlingResult: todo.handlingResult,
    notificationCopyText: todo.notificationCopyText,
    notificationChannel: todo.notificationChannel,
    notificationStatus: todo.notificationStatus,
    notificationCopiedBy: todo.notificationCopiedBy,
    notificationCopiedAt: todo.notificationCopiedAt,
    photoPrompt: todo.photoPrompt,
    notifiedBy: todo.notifiedBy,
    notifiedAt: todo.notifiedAt,
    printResultStatus: todo.printResultStatus,
    printedLabelCount: todo.printedLabelCount,
    pendingLabelCount: todo.pendingLabelCount,
    totalLabelCount: todo.totalLabelCount,
    printedPackageIds: todo.printedPackageIds,
    pendingPackageIds: todo.pendingPackageIds,
    printPackages: todo.printPackages,
    createdAt: todo.createdAt ?? new Date().toISOString(),
  };
}

function findMatchingInventory(workspace, line) {
  return workspace.inventories.find(
    (item) =>
      item.size === line.size &&
      item.color === line.color &&
      item.handle === line.handle &&
      item.style === line.style,
  );
}

function toInventoryQuantitySnapshot(inventoryItem, overrides = {}) {
  const onHand = Number(overrides.onHand ?? inventoryItem.inStock ?? 0);
  const reserved = Number(overrides.reserved ?? inventoryItem.reserved ?? 0);
  const waitingPickupLocked = Number(overrides.waitingPickupLocked ?? inventoryItem.locked ?? 0);
  const pendingHandling = Number(overrides.pendingHandling ?? inventoryItem.pending ?? 0);
  return {
    onHand,
    reserved,
    available: onHand - reserved - waitingPickupLocked - pendingHandling,
    waitingPickupLocked,
    pendingHandling,
  };
}

function buildInventoryCorrectionDraftDetail(workspace, draft) {
  const correctionDraftId = draft.correctionDraftId ?? draft.id;
  const inventoryItem = findInventoryItem(workspace, draft.inventoryItemId);
  const qtyBefore = buildInventoryCorrectionQuantitySnapshot(inventoryItem, draft.qtyBefore, draft.expectedQty);
  const requestedQtyAfter = buildInventoryCorrectionQuantitySnapshot(
    inventoryItem,
    draft.requestedQtyAfter,
    draft.actualQty,
  );
  const users = new Map((workspace.users ?? []).map((user) => [user.id ?? user.userId, user]));
  const ledgers = (workspace.inventoryLedgers ?? [])
    .filter((entry) => entry.correctionDraftId === correctionDraftId || entry.sourceId === correctionDraftId)
    .map((entry) => toInventoryCorrectionLedgerSummary(entry, inventoryItem, users, correctionDraftId))
    .sort((left, right) => (Date.parse(right.createdAt) || 0) - (Date.parse(left.createdAt) || 0));
  const operationLogs = (workspace.operationLogs ?? [])
    .filter((log) => log.targetType === "inventory_correction" && log.targetId === correctionDraftId)
    .map(toOperationLogEntry)
    .sort((left, right) => (Date.parse(right.createdAt) || 0) - (Date.parse(left.createdAt) || 0));

  return {
    correctionDraftId,
    inventoryItemId: draft.inventoryItemId,
    status: draft.status,
    reason: draft.reason ?? "",
    remark: draft.remark ?? "",
    qtyBefore,
    requestedQtyAfter,
    qtyAfter: ledgers[0]
      ? {
          ...requestedQtyAfter,
          onHand: ledgers[0].qtyAfter,
          available:
            ledgers[0].qtyAfter -
            Number(requestedQtyAfter.reserved ?? 0) -
            Number(requestedQtyAfter.waitingPickupLocked ?? 0) -
            Number(requestedQtyAfter.pendingHandling ?? 0),
        }
      : null,
    inventoryItem: inventoryItem
      ? {
          id: inventoryItem.id,
          size: inventoryItem.size,
          color: inventoryItem.color,
          handle: inventoryItem.handle,
          handleType: inventoryItem.handle,
          style: inventoryItem.style,
          zone: inventoryItem.zone,
          state: inventoryItem.state,
        }
      : null,
    operatorId: draft.operatorId ?? "",
    operatorName: getUserDisplayName(users, draft.operatorId),
    confirmedBy: draft.confirmedBy ?? "",
    confirmedByName: getUserDisplayName(users, draft.confirmedBy),
    todoId: draft.todoId ?? "",
    attachmentIds: draft.attachmentIds ?? [],
    createdAt: draft.createdAt ?? "",
    updatedAt: draft.updatedAt ?? "",
    confirmedAt: draft.confirmedAt ?? "",
    ledger: ledgers[0] ?? null,
    operationLogs,
  };
}

function toInventoryCorrectionDraftSummary(workspace, draft) {
  const correctionDraftId = draft.correctionDraftId ?? draft.id;
  const inventoryItem = findInventoryItem(workspace, draft.inventoryItemId);
  const qtyBefore = buildInventoryCorrectionQuantitySnapshot(inventoryItem, draft.qtyBefore, draft.expectedQty);
  const requestedQtyAfter = buildInventoryCorrectionQuantitySnapshot(
    inventoryItem,
    draft.requestedQtyAfter,
    draft.actualQty,
  );
  const users = new Map((workspace.users ?? []).map((user) => [user.id ?? user.userId, user]));
  return {
    correctionDraftId,
    inventoryItemId: draft.inventoryItemId,
    inventoryKey: inventoryItem?.inventoryKey ?? inventoryItem?.id ?? draft.inventoryItemId,
    status: draft.status,
    reason: draft.reason ?? "",
    remark: draft.remark ?? "",
    qtyBefore,
    requestedQtyAfter,
    inventoryItem: inventoryItem
      ? {
          id: inventoryItem.id,
          size: inventoryItem.size,
          color: inventoryItem.color,
          handle: inventoryItem.handle,
          handleType: inventoryItem.handle,
          style: inventoryItem.style,
          zone: inventoryItem.zone,
          state: inventoryItem.state,
        }
      : null,
    operatorId: draft.operatorId ?? "",
    operatorName: getUserDisplayName(users, draft.operatorId),
    confirmedBy: draft.confirmedBy ?? "",
    confirmedByName: getUserDisplayName(users, draft.confirmedBy),
    todoId: draft.todoId ?? "",
    attachmentIds: draft.attachmentIds ?? [],
    createdAt: draft.createdAt ?? "",
    updatedAt: draft.updatedAt ?? "",
    confirmedAt: draft.confirmedAt ?? "",
  };
}

function buildInventoryCorrectionQuantitySnapshot(inventoryItem, snapshot, onHandFallback) {
  const onHand = Number(snapshot?.onHand ?? onHandFallback ?? inventoryItem?.inStock ?? 0);
  const base = inventoryItem ? toInventoryQuantitySnapshot(inventoryItem, { onHand }) : { onHand };
  return { ...base, ...(snapshot ?? {}), onHand };
}

function filterInventoryCorrectionDraftSummaries(items, searchParams) {
  let nextItems = items;
  const status = cleanServerText(searchParams.get("status")) || "待确认生效";
  if (status && status !== "全部") nextItems = nextItems.filter((item) => item.status === status);
  const inventoryItemId = cleanServerText(searchParams.get("inventoryItemId"));
  if (inventoryItemId) nextItems = nextItems.filter((item) => item.inventoryItemId === inventoryItemId);
  const keyword = cleanServerText(searchParams.get("keyword")).toLowerCase();
  if (keyword) {
    nextItems = nextItems.filter((item) =>
      [
        item.correctionDraftId,
        item.inventoryItemId,
        item.inventoryKey,
        item.status,
        item.reason,
        item.remark,
        item.inventoryItem?.size,
        item.inventoryItem?.color,
        item.inventoryItem?.handle,
        item.inventoryItem?.style,
        item.inventoryItem?.zone,
        item.operatorId,
        item.operatorName,
        item.confirmedBy,
        item.confirmedByName,
        item.todoId,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }
  return nextItems;
}

function toInventoryCorrectionLedgerSummary(entry, inventoryItem = {}, users = new Map(), correctionDraftId = "") {
  const operatorId = entry.operatorId ?? entry.operator_id ?? "";
  return {
    ledgerId: entry.ledgerId ?? entry.id,
    inventoryItemId: entry.inventoryItemId ?? entry.inventory_item_id ?? inventoryItem?.id ?? "",
    inventoryKey: entry.inventoryKey ?? inventoryItem?.inventoryKey ?? inventoryItem?.id ?? "",
    size: entry.size ?? inventoryItem?.size ?? "",
    colorName: entry.colorName ?? entry.color_name ?? entry.color ?? inventoryItem?.color ?? "",
    color: entry.color ?? entry.colorName ?? entry.color_name ?? inventoryItem?.color ?? "",
    handleType: entry.handleType ?? entry.handle_type ?? entry.handle ?? inventoryItem?.handle ?? "",
    style: entry.style ?? inventoryItem?.style ?? "",
    zone: entry.zone ?? inventoryItem?.zone ?? "",
    inventoryState: entry.inventoryState ?? entry.inventory_state ?? inventoryItem?.state ?? "",
    changeType: entry.changeType ?? entry.change_type ?? "correction",
    qtyBefore: Number(entry.qtyBefore ?? entry.qty_before ?? 0),
    qtyChange: Number(entry.qtyChange ?? entry.qty_change ?? 0),
    qtyAfter: Number(entry.qtyAfter ?? entry.qty_after ?? 0),
    sourceType: entry.sourceType ?? entry.source_type ?? "inventory_correction",
    sourceId: entry.sourceId ?? entry.source_id ?? entry.correctionDraftId ?? correctionDraftId,
    operatorId,
    operatorName: getUserDisplayName(users, operatorId),
    confirmedBy: entry.confirmedBy ?? entry.confirmed_by ?? "",
    confirmedByName: getUserDisplayName(users, entry.confirmedBy ?? entry.confirmed_by),
    occurredAt: entry.occurredAt ?? entry.occurred_at ?? entry.createdAt ?? entry.created_at ?? "",
    createdAt: entry.createdAt ?? entry.created_at ?? entry.occurredAt ?? entry.occurred_at ?? "",
    reason: entry.reason ?? "",
    remark: entry.remark ?? "",
  };
}

function toOperationLogEntry(log) {
  return {
    operationLogId: log.operationLogId ?? log.id,
    targetType: log.targetType ?? "",
    targetId: log.targetId ?? "",
    action: log.action ?? "",
    before: log.before ?? null,
    after: log.after ?? null,
    reason: log.reason ?? "",
    operatorId: log.operatorId ?? "",
    createdAt: log.createdAt ?? log.occurredAt ?? "",
  };
}

function toProductionTaskSummary(task, orderLine) {
  const productionTaskId = task.productionTaskId ?? task.id;
  return {
    productionTaskId,
    bizNo: task.bizNo ?? productionTaskId,
    orderLineId: task.orderLineId ?? task.lineId ?? orderLine?.id ?? "",
    taskType: task.taskType ?? task.processType ?? "",
    machineId: task.machineId ?? "",
    publishedScheduleId: task.publishedScheduleId ?? "",
    plannedQty: Number(task.plannedQty ?? task.qty ?? orderLine?.qty ?? 0),
    taskStatus: task.taskStatus ?? task.status ?? "",
    status: task.status ?? task.taskStatus ?? "",
    revision: Math.max(1, Math.trunc(Number(task.revision ?? 1))),
    finishedGoodsPhoto: buildFinishedGoodsPhotoSummary(null, task, orderLine),
    createdBy: task.createdBy ?? "",
    createdAt: task.createdAt ?? "",
    updatedAt: task.updatedAt ?? "",
  };
}

function getUserDisplayName(users, userId) {
  if (!userId) return "";
  const user = users.get(userId);
  return user?.displayName ?? user?.display_name ?? user?.name ?? "";
}

function mapFulfillmentMethod(value) {
  const map = {
    自提: "pickup",
    送货: "delivery",
    快递快运: "express_ltl",
    待确认: "pending",
  };
  return map[value] ?? value ?? "pending";
}

function mapInventoryCheckStatus(value) {
  if (value === "可用" || value === "有货") return "available";
  if (value === "缺货") return "insufficient";
  if (value === "需复核") return "pending_review";
  return "changed_since_recognition";
}

function mapStatementApiStatus(value) {
  if (value?.includes("已发送")) return "已发送";
  if (value === "已核销") return "已结清";
  return value;
}

function mapTodoStatus(todo) {
  if (todo.handled) return "handled";
  if (todo.snoozeUntil || todo.reminder || String(todo.wait ?? "").includes("稍后") || String(todo.lastAction ?? "").includes("稍后")) return "snoozed";
  if (todo.reopenedAt) return "reopened";
  return "open";
}

function mapTodoPriority(value) {
  const map = {
    急: "urgent",
    今天: "urgent",
    异常: "exception",
    关注: "management_watch",
    普通: "normal",
  };
  return map[value] ?? "normal";
}

function inferTodoRefType(todo) {
  if (todo.ref?.startsWith("ST-")) return "statement";
  if (todo.ref?.startsWith("DRAFT")) return "order_draft";
  if (todo.ref?.startsWith("F")) return "fulfillment";
  return "order_line";
}

function parsePackageCount(value) {
  const match = String(value ?? "").match(/\d+/);
  return match ? Number(match[0]) : 1;
}

function buildDriverDeliveryTask(workspace, fulfillment, options = {}) {
  if (!fulfillment || fulfillment.method !== "送货") return null;
  const orderLineId = fulfillment.orderLineId ?? fulfillment.lineId ?? "";
  const orderLine = findOrderLine(workspace, orderLineId) ?? {};
  const customer = workspace.customers.find((item) => item.id === (fulfillment.customerId ?? orderLine.customerId)) ?? {};
  const printRecord = findActiveFulfillmentPrintRecord(workspace, fulfillment);
  const status = mapDriverDeliveryStatus(fulfillment.status);
  const packageCount = parsePackageCount(fulfillment.packages ?? fulfillment.packageSummary);
  const qty = Number(fulfillment.actualQty ?? fulfillment.qty ?? orderLine.qty ?? 0);
  const address = String(customer.address ?? fulfillment.address ?? "").trim() || "地址待补";
  const dispatch = findActiveDriverDeliveryDispatch(workspace, fulfillment.id ?? fulfillment.fulfillmentId);
  const deliveryNoteNo =
    fulfillment.deliveryNoteNo ??
    fulfillment.printBatch ??
    printRecord?.batchNo ??
    printRecord?.printRecordId ??
    "待打印/回填";

  return {
    driverTaskId: fulfillment.id,
    fulfillmentId: fulfillment.id,
    driverId: String(dispatch.driverId ?? fulfillment.driverId ?? options.driverId ?? "").trim(),
    orderLineId,
    orderTail: getDriverOrderTail(orderLine, orderLineId),
    customerId: fulfillment.customerId ?? orderLine.customerId ?? "",
    customerName: customer.name ?? "客户待确认",
    contactName: customer.contact ?? "联系人待确认",
    contactPhone: customer.phone ?? "电话待确认",
    address,
    addressArea: inferDriverAddressArea(address),
    deliveryNoteNo,
    goodsSummary: buildDriverGoodsSummary({ fulfillment, orderLine, qty }),
    packageSummary: fulfillment.packages ?? `${packageCount}包`,
    packageCount,
    packageChecklist: buildDriverPackageChecklist(workspace, {
      fulfillment,
      orderLineId,
      packageCount,
      qty,
    }),
    qty,
    expectedQty: Number(fulfillment.qty ?? orderLine.qty ?? qty),
    latest: fulfillment.latest ?? orderLine.latest ?? "",
    latestNeededAt: fulfillment.latestNeededAt ?? fulfillment.latest ?? orderLine.latest ?? "",
    status,
    inventorySource: [fulfillment.zone, fulfillment.source].filter(Boolean).join(" / "),
    nextStep: getDriverDeliveryNextStep(status),
    customerNote: getLineRemark(orderLine) || fulfillment.customerNote || "无",
    officeNote: fulfillment.exceptionReason || (Array.isArray(orderLine.exceptions) ? orderLine.exceptions.join("、") : "") || "无",
    exceptionReason: fulfillment.exceptionReason ?? "",
    routeDate: dispatch.routeDate ?? fulfillment.routeDate ?? "",
    routeNo: dispatch.routeNo ?? dispatch.routeBatchNo ?? fulfillment.routeNo ?? fulfillment.routeBatchNo ?? "",
    routeSequence: Number(dispatch.stopSequence ?? dispatch.routeSequence ?? fulfillment.routeSequence ?? 0),
    dispatchStatus: dispatch.dispatchStatus ?? fulfillment.dispatchStatus ?? "",
    plannedDepartureAt: dispatch.plannedDepartureAt ?? fulfillment.plannedDepartureAt ?? "",
    dispatchAssignedAt: dispatch.assignedAt ?? fulfillment.dispatchAssignedAt ?? "",
    receiverName: fulfillment.receiverName ?? "",
    paperNoteStatus: fulfillment.paperNoteStatus ?? "",
    watermarkedPhotoAttached: fulfillment.watermarkedPhotoAttached === true,
    watermarkedPhotoAttachmentId: fulfillment.watermarkedPhotoAttachmentId ?? "",
    watermarkedPhotoUrl: fulfillment.watermarkedPhotoUrl ?? "",
    watermarkId: fulfillment.watermarkId ?? "",
    watermarkText: fulfillment.watermarkText ?? "",
    watermarkCapturedAt: fulfillment.watermarkCapturedAt ?? "",
    watermarkLocationLabel: fulfillment.watermarkLocationLabel ?? "",
    watermarkGeoPoint: fulfillment.watermarkGeoPoint ?? "",
    watermarkAddress: fulfillment.watermarkAddress ?? "",
    watermarkOperatorId: fulfillment.watermarkOperatorId ?? "",
    watermarkOperatorName: fulfillment.watermarkOperatorName ?? "",
    signaturePhotoAttached: fulfillment.signaturePhotoAttached === true,
    signaturePhotoAttachmentId: fulfillment.signaturePhotoAttachmentId ?? "",
    deliveryEvidenceReviewStatus: fulfillment.deliveryEvidenceReviewStatus ?? "",
    deliveryEvidenceReviewedAt: fulfillment.deliveryEvidenceReviewedAt ?? "",
    deliveryEvidenceReviewedBy: fulfillment.deliveryEvidenceReviewedBy ?? "",
    deliveryEvidenceReviewedByUserId: fulfillment.deliveryEvidenceReviewedByUserId ?? "",
    deliveryEvidenceIssueReason: fulfillment.deliveryEvidenceIssueReason ?? "",
    deviceFieldTestRecord: fulfillment.deviceFieldTestRecord ?? null,
    deviceFieldTestSummary: fulfillment.deviceFieldTestSummary ?? fulfillment.deviceFieldTestRecord?.summary ?? null,
    completedAt: fulfillment.completedAt ?? fulfillment.deliveredAt ?? "",
    loadedAt: fulfillment.loadedAt ?? "",
    loadedBy: fulfillment.loadedBy ?? "",
    driverRemark: fulfillment.driverRemark ?? "",
    sortSequence: Number(options.sortSequence ?? getFulfillmentSortSequence(workspace, fulfillment.id)),
  };
}

function buildDriverPackageChecklist(workspace, { fulfillment, orderLineId, packageCount, qty }) {
  const fulfillmentId = String(fulfillment.id ?? fulfillment.fulfillmentId ?? "").trim();
  const packageRows = (workspace.packages ?? [])
    .filter((item) => {
      const itemFulfillmentId = String(item.fulfillmentId ?? "").trim();
      const itemOrderLineId = String(item.orderLineId ?? "").trim();
      return (fulfillmentId && itemFulfillmentId === fulfillmentId) || (orderLineId && itemOrderLineId === orderLineId);
    })
    .sort((a, b) => Number(a.packageSeq ?? 0) - Number(b.packageSeq ?? 0));
  if (packageRows.length) {
    return packageRows.map((item, index) =>
      toDriverPackageChecklistItem(item, {
        index,
        packageCount: packageRows.length,
        fulfillmentId,
      }),
    );
  }
  const count = Math.max(1, Number(packageCount || parsePackageCount(fulfillment.packages ?? fulfillment.packageSummary) || 1));
  const quantities = distributeIntegerQty(qty, count);
  return Array.from({ length: count }, (_, index) =>
    toDriverPackageChecklistItem({}, {
      index,
      packageCount: count,
      fulfillmentId,
      fallbackQty: quantities[index],
      packageSummary: fulfillment.packages ?? fulfillment.packageSummary ?? "",
    }),
  );
}

function toDriverPackageChecklistItem(item = {}, options = {}) {
  const packageSeq = Math.max(1, Number(item.packageSeq ?? item.sequence ?? options.index + 1));
  const packageCount = Math.max(1, Number(item.packageCount ?? options.packageCount ?? 1));
  const packageId =
    String(item.packageId ?? item.id ?? "").trim() ||
    [String(options.fulfillmentId ?? "DRIVER-PKG").trim(), packageSeq].join("-PKG-");
  const packedQty = Math.max(0, Number(item.packedQty ?? item.qty ?? item.expectedQty ?? options.fallbackQty ?? 0));
  const labelText =
    String(item.labelText ?? item.bizNo ?? "").trim() ||
    (String(options.packageSummary ?? "").trim() && packageCount === 1
      ? String(options.packageSummary ?? "").trim()
      : `第 ${packageSeq}/${packageCount} 包`);
  return {
    packageId,
    labelText,
    packageSeq,
    packageCount,
    packedQty,
    quantityText: packedQty ? `${packedQty}个` : "数量待核",
    status: String(item.status ?? "待装车核对").trim(),
    labelPrintRecordId: String(item.labelPrintRecordId ?? "").trim(),
  };
}

function mapDriverDeliveryStatus(value) {
  const status = String(value ?? "").trim();
  if (status === "配送中") return "配送中";
  if (status === "已交付" || status === "已完成") return "已完成";
  if (status.includes("异常") || status.includes("无法") || status.includes("数量")) return "送货异常";
  return "待送货";
}

function getDriverDeliveryNextStep(status) {
  if (status === "配送中") return "到达客户处后提交水印照片，确认完成送货。";
  if (status === "已完成") return "送货已完成，回单进入办公室复核和对账候选。";
  if (status === "送货异常") return "异常已回到办公室处理，司机等待下一步通知。";
  return "先确认已装车，出发后状态进入配送中。";
}

function buildDriverGoodsSummary({ fulfillment, orderLine, qty }) {
  const product = String(orderLine.product ?? fulfillment.goods ?? "").trim();
  const size = String(orderLine.size ?? "").trim();
  const colorSpec = getDriverColorSpecLabel(orderLine);
  const printSide = getLinePrintSide(orderLine);
  const remark = getLineRemark(orderLine);
  return [
    product,
    size,
    colorSpec && colorSpec !== "待确认" ? colorSpec : "",
    printSide && printSide !== "无需印刷" ? printSide : "",
    `${Number(qty || 0)}个`,
    remark,
  ].filter(Boolean).join(" ");
}

function getDriverColorSpecLabel(orderLine = {}) {
  const labels = [];
  const printFlag = String(orderLine.print ?? "").trim();
  const printColor = String(orderLine.printColor ?? "").trim();
  const handleColor = String(orderLine.handleColor ?? "").trim();
  if (printFlag === "是" && printColor && printColor !== "待确认") {
    labels.push(`${shortColorName(orderLine.color)}印${shortColorName(printColor)}`);
  }
  if (handleColor && handleColor !== "待确认") {
    labels.push(`${shortColorName(orderLine.color)}袋${shortColorName(handleColor)}提`);
  }
  return labels.length ? labels.join(" / ") : getLineColorSpecLabel(orderLine);
}

function findDriverDeliveryFulfillment(workspace, fulfillmentId) {
  const id = String(fulfillmentId ?? "").trim();
  const fulfillment = (workspace.fulfillments ?? []).find((item) => item.id === id || item.fulfillmentId === id);
  if (!fulfillment || fulfillment.method !== "送货") return null;
  return fulfillment;
}

function findActiveFulfillmentPrintRecord(workspace, fulfillment) {
  const activePrintRecordId = fulfillment.activePrintRecordId ?? fulfillment.printRecordId ?? "";
  if (activePrintRecordId) {
    const activeRecord = (workspace.printRecords ?? []).find((item) => item.printRecordId === activePrintRecordId);
    if (activeRecord) return activeRecord;
  }
  return [...(workspace.printRecords ?? [])]
    .reverse()
    .find((item) => item.targetType === "fulfillment" && item.targetId === fulfillment.id && item.status !== "voided") ?? null;
}

function findActiveDriverDeliveryDispatch(workspace, fulfillmentId) {
  const id = String(fulfillmentId ?? "").trim();
  return (workspace.driverDeliveryDispatches ?? [])
    .filter((dispatch) => {
      const dispatchFulfillmentId = String(dispatch.fulfillmentId ?? dispatch.fulfillment_id ?? "").trim();
      const status = String(dispatch.dispatchStatus ?? dispatch.dispatch_status ?? "").trim();
      return dispatchFulfillmentId === id && !["已取消", "canceled", "voided"].includes(status);
    })
    .sort((a, b) => {
      const dateDiff = String(a.routeDate ?? a.route_date ?? "").localeCompare(String(b.routeDate ?? b.route_date ?? ""));
      if (dateDiff) return dateDiff;
      const routeDiff = String(a.routeNo ?? a.routeBatchNo ?? a.route_batch_no ?? "").localeCompare(
        String(b.routeNo ?? b.routeBatchNo ?? b.route_batch_no ?? ""),
        "zh-Hans-CN",
      );
      if (routeDiff) return routeDiff;
      const sequenceDiff =
        Number(a.stopSequence ?? a.routeSequence ?? a.stop_sequence ?? 0) -
        Number(b.stopSequence ?? b.routeSequence ?? b.stop_sequence ?? 0);
      if (sequenceDiff) return sequenceDiff;
      return String(b.assignedAt ?? b.assigned_at ?? b.createdAt ?? "").localeCompare(
        String(a.assignedAt ?? a.assigned_at ?? a.createdAt ?? ""),
      );
    })[0] ?? {};
}

function getFulfillmentSortSequence(workspace, fulfillmentId) {
  const index = (workspace.fulfillments ?? []).findIndex((item) => item.id === fulfillmentId);
  return index >= 0 ? index + 1 : 9999;
}

function inferDriverAddressArea(address) {
  const text = String(address ?? "").trim();
  if (!text) return "地址待补";
  const firstToken = text.split(/\s+/)[0];
  return firstToken.length > 8 ? firstToken.slice(0, 8) : firstToken;
}

function getDriverOrderTail(orderLine = {}, orderLineId = "") {
  if (orderLine.orderNo && orderLine.lineNo) return getOrderLineShortNo(orderLine);
  const id = String(orderLine.id ?? orderLineId ?? "").trim();
  const match = id.match(/ORD-\d{4}-(\d+)-(\d+)/);
  if (match) return `#${match[1]}-${match[2]}`;
  return id.slice(-5);
}

function hasDriverWatermarkEvidence(body = {}) {
  return (
    body.watermarkedPhotoAttached === true ||
    Boolean(String(body.watermarkedPhotoAttachmentId ?? "").trim()) ||
    Boolean(String(body.watermarkedPhotoId ?? "").trim()) ||
    Boolean(String(body.watermarkedPhotoUrl ?? "").trim())
  );
}

function normalizeDeliveryEvidenceReviewStatus(value) {
  const raw = String(value ?? "").trim();
  const normalized = raw.toLowerCase();
  if (["已复核", "approved", "reviewed", "pass", "passed", "ok"].includes(normalized)) return "已复核";
  if (["需重拍", "rejected", "reject", "retake_required", "needs_retake", "failed"].includes(normalized)) return "需重拍";
  return "";
}

function normalizeDriverDeviceFieldTestApiRecord(value = {}) {
  const fulfillmentId = cleanServerText(value.fulfillmentId);
  const checkedAt = normalizeTimestamp(value.checkedAt, new Date().toISOString());
  const checks = normalizeDriverDeviceFieldTestChecks(value.checks ?? [], value.readiness ?? {});
  const summary = getDriverDeviceFieldTestSummary(checks);
  const packageLabelScanSample = normalizeDriverPackageLabelScanSample(value.packageLabelScanSample);
  const nativeBridgeDiagnostics = normalizeDriverNativeCapabilityDiagnostics(
    value.nativeBridgeDiagnostics ?? value.native_bridge_diagnostics,
  );
  const recordId =
    cleanServerText(value.recordId) ||
    `DQA-${compactTimestamp(checkedAt)}-${safeRecordPart(fulfillmentId || "TASK")}`;
  return {
    recordId,
    fulfillmentId,
    orderLineId: cleanServerText(value.orderLineId),
    driverId: cleanServerText(value.driverId),
    operatorId: cleanServerText(value.operatorId),
    operatorName: cleanServerText(value.operatorName),
    checkedAt,
    deviceLabel: cleanServerText(value.deviceLabel),
    browserLabel: cleanServerText(value.browserLabel),
    userAgent: cleanServerText(value.userAgent),
    language: cleanServerText(value.language),
    summary,
    checks,
    packageLabelScanSample,
    nativeBridgeDiagnostics,
    note: cleanServerText(value.note),
  };
}

function normalizeTimestamp(value, fallback) {
  const timestamp = String(value ?? "").trim();
  if (timestamp && Number.isFinite(Date.parse(timestamp))) return new Date(timestamp).toISOString();
  return fallback;
}

async function recognizeOrderDraft({ response, workspace, body, operatorId }) {
  const result = await orderDraftCommandService.recognizeOrderDraft({ workspace, body, operatorId });
  return sendJson(response, 200, result.response);
}

async function recognizeOrderDraftQueue({ response, workspace, body, operatorId }) {
  const result = await orderDraftCommandService.recognizeOrderDraftQueue({ workspace, body, operatorId });
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function saveOrderDraft({ response, workspace, draftId, body, operatorId }) {
  const result = await orderDraftCommandService.saveOrderDraft({ workspace, draftId, body, operatorId });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function restoreShortageCancelledDraftLineRoute({ response, workspace, draftId, body, operatorId }) {
  const result = await orderDraftCommandService.restoreShortageCancelledDraftLine({ workspace, draftId, body, operatorId });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function linkCrossDraftShortageCancellationRoute({ response, workspace, draftId, body, operatorId }) {
  const result = await orderDraftCommandService.linkCrossDraftShortageCancellation({ workspace, draftId, body, operatorId });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function confirmOrderDraftRoute({ response, workspace, draftId, body, operatorId }) {
  const result = await orderDraftCommandService.confirmOrderDraft({ workspace, draftId, body, operatorId });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function previewOrderDraftSplitRoute({ response, workspace, draftId, body, operatorId }) {
  const result = await orderDraftCommandService.previewOrderDraftSplit({ workspace, draftId, body, operatorId });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function confirmSplitOrderDraftRoute({ response, workspace, draftId, body, operatorId }) {
  const result = await orderDraftCommandService.confirmSplitOrderDraft({ workspace, draftId, body, operatorId });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function voidOrderLineRoute({ response, workspace, orderLineId, body, operatorId }) {
  const result = await orderLineMutationCommandService.voidOrderLine({
    workspace,
    orderLineId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function adjustOrderLineQuantityRoute({ response, workspace, orderLineId, body, operatorId }) {
  const result = await orderLineMutationCommandService.adjustOrderLineQuantity({
    workspace,
    orderLineId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function createMasterDataFailedRowsCorrectionDraftRoute({ response, workspace, executionId, body, operatorId }) {
  const result = await masterDataImportCommandService.createFailedRowsCorrectionDraft({
    workspace,
    executionId,
    body,
    operatorId,
  });
  return sendMasterDataImportCommandResult(response, result);
}

async function createMasterDataImportConfirmationPlanRoute({ response, workspace, body, operatorId }) {
  const result = await masterDataImportCommandService.createConfirmationPlan({
    workspace,
    body,
    operatorId,
  });
  return sendMasterDataImportCommandResult(response, result);
}

async function createMasterDataImportExecutionRoute({ response, workspace, body, operatorId }) {
  const result = await masterDataImportCommandService.createImportExecution({
    workspace,
    body,
    operatorId,
  });
  return sendMasterDataImportCommandResult(response, result);
}

function sendMasterDataImportCommandResult(response, result) {
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) {
    return sendBusinessError(response, result.statusCode, result.code, result.message);
  }
  return sendJson(response, result.statusCode ?? 200, result.response);
}

async function downloadMasterDataImportFailedRowsRoute({ response, workspace, executionId }) {
  const safeExecutionId = cleanServerText(executionId);
  if (!safeExecutionId) {
    return sendBusinessError(response, 400, "MASTER_DATA_IMPORT_EXECUTION_ID_REQUIRED", "executionId is required.");
  }
  const importExecution = (await workspace.masterDataImportReviewRepository.listImportExecutions({
    workspace,
    filters: { executionId: safeExecutionId },
  }))[0];
  if (!importExecution) {
    return sendNotFound(response, "MASTER_DATA_IMPORT_EXECUTION_NOT_FOUND");
  }
  const failedRowsDownload = importExecution.failedRowsDownload ?? importExecution.importPayload?.failedRowsDownload;
  if (failedRowsDownload?.required !== true || !cleanServerText(failedRowsDownload.content)) {
    return sendBusinessError(
      response,
      409,
      "MASTER_DATA_IMPORT_FAILED_ROWS_NOT_AVAILABLE",
      "This import execution has no failed rows to download.",
    );
  }
  return sendFile(response, 200, failedRowsDownload.content, {
    contentType: failedRowsDownload.contentType || "text/csv; charset=utf-8",
    fileName: failedRowsDownload.fileName || `master-data-import-failed-rows-${safeExecutionId}.csv`,
  });
}

function listMasterDataEmployeeAccountReviews(workspace, filters = {}) {
  const statusFilter = cleanServerText(filters.status);
  const employeeIdFilter = cleanServerText(filters.employeeId);
  const keyword = cleanServerText(filters.keyword).toLowerCase();
  const users = new Map((workspace.users ?? []).map((user) => [cleanServerText(user.userId ?? user.id), user]));
  return (Array.isArray(workspace.employees) ? workspace.employees : [])
    .map((employee) => toMasterDataEmployeeAccountReview(employee, users))
    .filter((review) => {
      if (employeeIdFilter && review.employeeId !== employeeIdFilter) return false;
      if (statusFilter && review.status !== statusFilter && review.profileStatus !== statusFilter) return false;
      if (!keyword) return true;
      return [
        review.employeeId,
        review.bizNo,
        review.name,
        review.roleName,
        review.defaultWorkshop,
        review.defaultMachineId,
        review.loginName,
      ].some((value) => cleanServerText(value).toLowerCase().includes(keyword));
    });
}

async function enableMasterDataEmployeeAccountRoute({ response, workspace, employeeId, body, operatorId }) {
  const result = await masterDataEmployeeAccountCommandService.enableEmployeeAccount({
    workspace,
    employeeId,
    body,
    operatorId,
  });
  return sendMasterDataEmployeeAccountCommandResult(response, result);
}

async function updateMasterDataEmployeeAssignmentRoute({ response, workspace, employeeId, body, operatorId }) {
  const result = await masterDataEmployeeAccountCommandService.updateEmployeeAssignment({
    workspace,
    employeeId,
    body,
    operatorId,
  });
  return sendMasterDataEmployeeAccountCommandResult(response, result);
}

async function issueMasterDataEmployeeAccountPasswordRoute({ response, workspace, employeeId, body, operatorId }) {
  const result = await masterDataEmployeeAccountCommandService.issueEmployeeTemporaryPassword({
    workspace,
    employeeId,
    body,
    operatorId,
  });
  return sendMasterDataEmployeeAccountCommandResult(response, result);
}

async function revokeMasterDataEmployeeAccountPasswordRoute({ response, workspace, employeeId, body, operatorId }) {
  const result = await masterDataEmployeeAccountCommandService.revokeEmployeePassword({
    workspace,
    employeeId,
    body,
    operatorId,
  });
  return sendMasterDataEmployeeAccountCommandResult(response, result);
}

function sendMasterDataEmployeeAccountCommandResult(response, result) {
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) {
    return sendBusinessError(response, result.statusCode, result.code, result.message);
  }
  return sendJson(response, result.statusCode ?? 200, result.response);
}

async function createInventoryCorrectionDraftRoute({ response, workspace, body, operatorId }) {
  const result = await inventoryCorrectionCommandService.createCorrectionDraft({ workspace, body, operatorId });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  const draft = result.correctionDraft;
  return sendJson(response, 200, {
    correctionDraftId: draft.correctionDraftId,
    inventoryItemId: draft.inventoryItemId,
    status: draft.status,
    revision: draft.revision,
    attachmentIds: draft.attachmentIds ?? [],
    qtyBefore: draft.qtyBefore,
    requestedQtyAfter: draft.requestedQtyAfter,
    todoId: result.todo.id,
    operationLogId: result.operationLogId,
  });
}

async function linkInventoryCorrectionAttachmentsRoute({ response, workspace, correctionDraftId, body, operatorId }) {
  const result = await inventoryCorrectionCommandService.linkCorrectionAttachments({
    workspace,
    correctionDraftId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, {
    correctionDraftId: result.correctionDraft.correctionDraftId,
    attachmentIds: result.attachmentIds ?? result.correctionDraft.attachmentIds ?? [],
    revision: result.correctionDraft.revision,
    unchanged: Boolean(result.unchanged),
    operationLogId: result.operationLogId,
  });
}

async function confirmInventoryCorrectionDraftRoute({ response, workspace, correctionDraftId, body, operatorId }) {
  const result = await inventoryCorrectionCommandService.confirmCorrectionDraft({
    workspace,
    correctionDraftId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  const users = new Map((workspace.users ?? []).map((user) => [user.id ?? user.userId, user]));
  return sendJson(response, 200, {
    correctionDraftId: result.correctionDraft.correctionDraftId,
    inventoryItemId: result.inventoryItem.id,
    qtyBefore: result.correctionDraft.qtyBefore,
    qtyAfter: toInventoryQuantitySnapshot(result.inventoryItem),
    ledger: toInventoryCorrectionLedgerSummary(
      result.inventoryLedger,
      result.inventoryItem,
      users,
      result.correctionDraft.correctionDraftId,
    ),
    todo: result.todo ? toTodoListItem(workspace, result.todo) : null,
    operationLogId: result.operationLogId,
  });
}

async function releaseInventoryReservationRoute({ response, workspace, reservationId, body, operatorId }) {
  const result = await inventoryReservationReleaseCommandService.releaseReservation({
    workspace,
    reservationId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function listDriverDeliveryTasksRoute({ response, workspace, searchParams, operatorId }) {
  return sendJson(
    response,
    200,
    await workspace.driverDeliveryTaskReadRepository.listDriverDeliveryTasks({
      workspace,
      query: searchParams,
      operatorId,
    }),
  );
}

async function getDriverDeliveryTaskRoute({ response, workspace, fulfillmentId, operatorId }) {
  const task = await workspace.driverDeliveryTaskReadRepository.getDriverDeliveryTask({
    workspace,
    fulfillmentId,
    operatorId,
  });
  if (!task) return sendNotFound(response, "DRIVER_DELIVERY_TASK_NOT_FOUND");
  return sendJson(response, 200, {
    task,
  });
}

async function getDriverDeliveryTaskResponseProjection(workspace, { fulfillmentId, operatorId, fallbackFulfillment }) {
  const task = await workspace.driverDeliveryTaskReadRepository.getDriverDeliveryTask({
    workspace,
    fulfillmentId,
    operatorId,
  });
  return task ?? buildDriverDeliveryTask(workspace, fallbackFulfillment ?? findFulfillment(workspace, fulfillmentId), {
    driverId: operatorId,
    sortSequence: getFulfillmentSortSequence(workspace, fulfillmentId),
  });
}

function getSystemV1ReadinessResponse({ workspace, operatorId }) {
  return buildSystemV1Readiness({ workspace, operatorId });
}

function getSystemV1GoLiveStatusResponse({ workspace, operatorId }) {
  const checkedAt = new Date().toISOString();
  const artifacts = readV1GoLiveStatusArtifacts();
  const completion = artifacts.completionSnapshot.value ?? {};
  const suite = artifacts.goLiveSuite.value ?? {};
  const releaseCandidateArtifact = artifacts.releaseCandidate.value ?? {};
  const unblockPlan = artifacts.unblockPlan.value ?? suite.unblockPlan ?? {};
  const v1V2Scope = artifacts.v1V2Scope.value ?? {};
  const ownerDecisionBrief = artifacts.ownerDecisionBrief.value ?? {};
  const summary = {
    ...(suite.summary ?? {}),
    ...(completion.summary ?? {}),
  };
  const releaseCandidate = completion.releaseCandidate ?? {};
  const status = normalizeV1GoLiveStatus(completion.status || suite.status);
  const ready = Boolean(completion.ready === true && suite.canDeclareV1Complete === true);
  const moduleCompletion = sanitizeV1ModuleCompletion(
    completion.moduleCompletion ?? suite.moduleCompletion ?? [],
  );
  const v2Differences = sanitizeV1StatusTextList(v1V2Scope.v2Differences ?? completion.v2Differences ?? []);
  const moduleV1V2Differences = sanitizeV1ModuleDifferences(
    v1V2Scope.moduleDifferences ?? completion.moduleV1V2Differences ?? [],
  );
  const missingArtifacts = Object.values(artifacts)
    .filter((artifact) => artifact.status !== "loaded")
    .map((artifact) => artifact.key);
  const sanitizedSummary = sanitizeV1GoLiveSummary(summary);
  const sanitizedReleaseCandidate = sanitizeV1ReleaseCandidate(releaseCandidate);
  const sanitizedOwnerDecisionBrief = sanitizeV1OwnerDecisionBrief(ownerDecisionBrief, completion, suite);
  const runtimeReadinessBlockers = sanitizeV1RuntimeReadinessBlockers(
    releaseCandidateArtifact,
    artifacts.fieldAcceptanceReport.value,
    completion,
  );
  const fieldAcceptanceReport = sanitizeV1FieldAcceptanceReport(artifacts.fieldAcceptanceReport.value);
  const productionEnvGate = sanitizeV1ProductionEnvGate(
    releaseCandidateArtifact.envPreflight,
    releaseCandidateArtifact.envFileAudit,
    completion.releaseCandidate?.envPreflight?.fixChecklist ??
      suite.releaseCandidate?.envPreflight?.fixChecklist ??
      [],
  );
  const fieldEvidenceProgress = sanitizeV1FieldEvidenceProgress(
    artifacts.fieldEvidenceIntake.value,
    releaseCandidateArtifact.fieldEvidenceManifest,
    artifacts.fieldEvidenceItemsCsv.value,
    artifacts.fieldEvidenceSignoffBoundaryCsv.value,
  );
  const fieldEvidenceDraftFreshness = buildV1FieldEvidenceDraftFreshness(
    artifacts.fieldEvidenceItemsCsv.value,
    artifacts.fieldEvidenceSignoffBoundaryCsv.value,
    artifacts.fieldEvidenceDraftManifest,
  );
  const fieldEvidenceIntakeGuidance = sanitizeV1FieldEvidenceIntakeGuidance(
    artifacts.fieldEvidenceItemsCsv.value,
    artifacts.fieldEvidenceSignoffBoundaryCsv.value,
    {
      rulesArtifact: artifacts.fieldEvidenceIntakeRules,
      draftManifestArtifact: artifacts.fieldEvidenceDraftManifest,
      draftFreshness: fieldEvidenceDraftFreshness,
    },
  );
  const fieldEvidenceIntakeQuality = sanitizeV1FieldEvidenceIntakeQuality(
    artifacts.fieldEvidenceItemsCsv.value,
    artifacts.fieldEvidenceSignoffBoundaryCsv.value,
    {
      rulesArtifact: artifacts.fieldEvidenceIntakeRules,
      draftManifestArtifact: artifacts.fieldEvidenceDraftManifest,
      draftFreshness: fieldEvidenceDraftFreshness,
    },
  );
  const roleTaskBoard = sanitizeV1RoleTaskBoard(artifacts.onsiteTaskBoard.value);
  const v1V2BoundaryBrief = sanitizeV1V2BoundaryBrief(v1V2Scope, completion);
  const productionEnvFixChecklist = sanitizeV1ProductionEnvFixChecklist(
    releaseCandidateArtifact.envPreflight?.fixChecklist ??
      completion.releaseCandidate?.envPreflight?.fixChecklist ??
      suite.releaseCandidate?.envPreflight?.fixChecklist ??
      [],
  );
  const productionEnvFillTemplate = sanitizeV1ProductionEnvFillTemplate(
    artifacts.productionEnvFillTemplate.value,
  );
  const productionEnvIntakeVerification = sanitizeV1ProductionEnvIntakeVerification(
    artifacts.productionEnvIntakeVerification.value,
  );
  const productionEnvMinimumValuesFragmentTemplate = sanitizeV1ProductionEnvFillTemplate(
    artifacts.productionEnvMinimumValuesFragmentTemplate.value,
    {
      label: "最小真实值片段模板",
      missingLabel: "最小真实值片段模板未生成",
      templateKind: "minimum_values_fragment",
      fileName: "production-env-minimum-values-fragment.template.env.example",
      targetLabel: productionEnvIntakeVerification.summary?.minimumBlockingLabel,
    },
  );
  const productionFirstStageExecution = sanitizeV1ProductionFirstStageExecution(
    artifacts.productionFirstStageExecution.value,
  );
  const productionPersistenceEvidence = sanitizeV1ProductionPersistenceEvidence(
    artifacts.productionPersistenceEvidence.value,
  );
  const productionEnvValuesFragmentSourceStatus = buildV1ProductionEnvValuesFragmentSourceStatus({
    productionEnvIntakeVerification,
  });
  const productionEnvValuesApplyGateStatus = buildV1ProductionEnvValuesApplyGateStatus({
    productionEnvIntakeVerification,
    productionFirstStageExecution,
  });
  const completionAudit = buildV1CompletionAudit({
    ready,
    summary: sanitizedSummary,
    releaseCandidate: sanitizedReleaseCandidate,
    ownerDecisionBrief: sanitizedOwnerDecisionBrief,
    runtimeReadinessBlockers,
    fieldAcceptanceReport,
    productionEnvGate,
    productionEnvIntakeVerification,
    productionPersistenceEvidence,
    productionFirstStageExecution,
    fieldEvidenceProgress,
    roleTaskBoard,
    v1V2BoundaryBrief,
  });
  const d49Readiness = buildV1D49Readiness({ workspace, operatorId });

  return {
    version: "p0-v1-go-live-status-v1",
    scope: "v1_go_live_status",
    status,
    ready,
    canDeclareV1Complete: ready,
    checkedAt,
    generatedAt: cleanServerText(suite.generatedAt || completion.generatedAt || v1V2Scope.generatedAt),
    operatorId,
    conclusion:
      sanitizeV1SensitiveStatusText(completion.conclusion || suite.conclusion || v1V2Scope.conclusion) ||
      "当前仍不能声明 V1 已完成；必须以发布门禁、现场证据和负责人签字为准。",
    summary: sanitizedSummary,
    releaseCandidate: sanitizedReleaseCandidate,
    ownerDecisionBrief: sanitizedOwnerDecisionBrief,
    completionAudit,
    d49Readiness,
    runtimeReadinessBlockers,
    fieldAcceptanceReport,
    productionEnvGate,
    productionEnvIntakeVerification,
    productionPersistenceEvidence,
    productionFirstStageExecution,
    moduleCompletion,
    unblockPlan: sanitizeV1UnblockPlan(unblockPlan),
    fieldEvidenceProgress,
    fieldEvidenceDraftFreshness,
    fieldEvidenceIntakeGuidance,
    fieldEvidenceIntakeQuality,
    roleTaskBoard,
    v1V2BoundaryBrief,
    productionEnvFixChecklist,
    productionEnvFillTemplate,
    productionEnvMinimumValuesFragmentTemplate,
    productionEnvValuesFragmentSourceStatus,
    productionEnvValuesApplyGateStatus,
    v2Differences,
    v2Categories: sanitizeV1StatusTextList(v1V2Scope.v2Categories ?? suite.summary?.v2Categories ?? []),
    moduleV1V2Differences,
    v1MustContinue: sanitizeV1StatusTextList(v1V2Scope.v1MustContinue ?? completion.v1MustContinue ?? []),
    topBlockers: sanitizeV1TopBlockers(completion.topBlockers ?? []),
    sourceStatus: Object.fromEntries(
      Object.values(artifacts).map((artifact) => [
        artifact.key,
        {
          status: artifact.status,
          label: sanitizeV1SensitiveStatusText(artifact.label),
          reason: sanitizeV1SensitiveStatusText(artifact.reason),
        },
      ]),
    ),
    missingArtifacts,
    safeguards: {
      nonMutating: true,
      artifactPathExposed: false,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawNotesIncluded: false,
      rawEvidenceItemsCsvIncluded: false,
      rawSignoffBoundaryCsvIncluded: false,
      rawFieldEvidenceIntakeRulesIncluded: false,
      rawFieldEvidenceDraftManifestIncluded: false,
      fieldEvidenceDraftFreshnessChecked: true,
      digestValuesIncluded: false,
      rawOnsiteTaskBoardIncluded: false,
      rawOwnerDecisionBriefIncluded: false,
      rawRuntimeReadinessReportIncluded: false,
      rawFieldAcceptanceReportIncluded: false,
      rawProductionEnvPreflightIncluded: false,
      rawProductionEnvIntakeVerificationIncluded: false,
      rawEnvFileAuditIncluded: false,
      rawEnvFileIncluded: false,
      rawSecretsIncluded: false,
      environmentValuesIncluded: false,
      productionEnvValuesIncluded: false,
      productionEnvIntakeValuesIncluded: false,
      rawProductionPersistenceEvidenceIncluded: false,
      productionEnvFillTemplateValuesIncluded: false,
      productionEnvMinimumValuesFragmentTemplateValuesIncluded: false,
      productionEnvValuesFragmentSourceStatusValuesIncluded: false,
      productionEnvValuesApplyGateStatusValuesIncluded: false,
      commandValuesIncluded: false,
      completionRequiresReleaseCandidate: true,
      completionRequiresFieldEvidence: true,
      completionRequiresSignoff: true,
    },
  };
}

function generateSystemV1FieldEvidenceIntakeDraftManifest({ operatorId }) {
  return v1FieldEvidenceDraftService.generateDraft({ operatorId });
}

function validateSystemV1FieldEvidenceDraftManifest({ operatorId }) {
  return v1FieldEvidenceDraftService.validateDraft({ operatorId });
}

function stageSystemV1FieldEvidenceIntakeRow({ body, operatorId }) {
  return v1FieldEvidenceStagingService.stageRow({ body, operatorId });
}

function precheckSystemV1ProductionEnv({ operatorId }) {
  return precheckV1ProductionEnv({ operatorId });
}

async function runSystemV1ProductionEnvSetup({ operatorId }) {
  return runV1ProductionEnvSetup({ operatorId, runCommand: runV1ProductionEnvSetupCommand });
}

function precheckSystemV1ProductionEnvIntake({ operatorId }) {
  return precheckV1ProductionEnvIntake({ operatorId });
}

function precheckSystemV1ProductionEnvFileAudit({ operatorId }) {
  return precheckV1ProductionEnvFileAudit({ operatorId });
}

function precheckSystemV1ProductionEnvFilePreview({ operatorId }) {
  return precheckV1ProductionEnvFilePreview({ operatorId });
}

async function precheckSystemV1ProductionGoLive({ request, operatorId }) {
  return v1ProductionGoLivePrecheckService.precheck({ request, operatorId });
}

async function precheckSystemV1ProductionFirstStageValuesDryRun({ operatorId }) {
  const checkedAt = new Date().toISOString();
  const valuesFileConfig = getConfiguredV1ProductionEnvValuesFileConfig();
  const configuredValuesFiles = valuesFileConfig.envFiles;
  const targetSetupStatus = buildV1ProductionEnvSetupTargetStatus();
  if (configuredValuesFiles.length === 0) {
    return {
      httpStatus: 200,
      body: buildV1ProductionFirstStageValuesDryRunLivePrecheckBody({
        operatorId,
        checkedAt,
        status: "not_configured",
        ready: false,
        report: {},
        valuesFileConfig,
        configuredValuesFileCount: 0,
        targetSetupStatus,
        blockingItems: [
          {
            key: "production-env-values-file-not-configured",
            label: "服务端真实值片段路径未配置",
            status: "blocked",
            detail: "API 进程未配置 ERP_V1_PRODUCTION_ENV_VALUES_FILE，不能执行第一阶段真实值 dry-run。",
            nextAction: "在 API 进程配置 ERP_V1_PRODUCTION_ENV_VALUES_FILE，指向安全未跟踪的真实值片段后重启 API，再执行真实值 dry-run。",
          },
        ],
        nextAction: "在 API 进程配置 ERP_V1_PRODUCTION_ENV_VALUES_FILE，指向安全未跟踪的真实值片段后重启 API，再执行真实值 dry-run。",
      }),
    };
  }
  if (configuredValuesFiles.length !== 1) {
    return {
      httpStatus: 200,
      body: buildV1ProductionFirstStageValuesDryRunLivePrecheckBody({
        operatorId,
        checkedAt,
        status: "blocked",
        ready: false,
        report: {},
        valuesFileConfig,
        configuredValuesFileCount: configuredValuesFiles.length,
        targetSetupStatus,
        blockingItems: [
          {
            key: "production-env-values-file-count",
            label: "真实值片段文件数量不唯一",
            status: "blocked",
            detail: "服务端 values file 配置解析到多个文件，无法判断要 dry-run 哪一个片段。",
            nextAction: "只保留一个安全未跟踪真实值片段路径，重启 API 后重试；不要从前端传路径。",
          },
        ],
        nextAction: "把服务端真实值片段配置收敛为单个文件后重试。",
      }),
    };
  }
  const valuesFileAuditStatus = buildV1ProductionEnvValuesFileAuditStatus({
    valuesFileConfig,
    configuredValuesFileCount: configuredValuesFiles.length,
  });
  if (valuesFileAuditStatus.ready !== true) {
    return {
      httpStatus: 200,
      body: buildV1ProductionFirstStageValuesDryRunLivePrecheckBody({
        operatorId,
        checkedAt,
        status: "audit_blocked",
        ready: false,
        report: {},
        valuesFileConfig,
        configuredValuesFileCount: configuredValuesFiles.length,
        targetSetupStatus,
        valuesFileAuditStatus,
        blockingItems: valuesFileAuditStatus.blockingItems.length
          ? valuesFileAuditStatus.blockingItems
          : [
              {
                key: "production-env-values-file-audit-blocked",
                label: "真实值片段安全审计未通过",
                status: "blocked",
                detail: "服务端配置的真实值片段文件未通过安全审计，不能执行第一阶段真实值 dry-run。",
                nextAction: "先修正真实值片段文件的安全审计阻塞项，再重启 API 并重新执行 dry-run。",
              },
            ],
        nextAction:
          valuesFileAuditStatus.nextAction ||
          "先修正真实值片段文件的安全审计阻塞项，再重启 API 并重新执行 dry-run。",
      }),
    };
  }
  if (targetSetupStatus.ready !== true) {
    return {
      httpStatus: 200,
      body: buildV1ProductionFirstStageValuesDryRunLivePrecheckBody({
        operatorId,
        checkedAt,
        status: "target_not_ready",
        ready: false,
        report: {},
        valuesFileConfig,
        configuredValuesFileCount: configuredValuesFiles.length,
        targetSetupStatus,
        valuesFileAuditStatus,
        blockingItems: [
          {
            key: "production-env-setup-target-not-ready",
            label: "production env setup 目标 env 未就绪",
            status: "blocked",
            detail: "真实值 dry-run 需要复用 production env setup latest 中已审计的目标安全 env 文件；当前目标 setup 未 ready，不能调用第一阶段 dry-run 执行器。",
            nextAction:
              targetSetupStatus.nextAction ||
              "先重新运行 production env setup，确认目标安全 env 文件存在、已 git ignore、未跟踪且权限为 600，再执行真实值 dry-run。",
          },
        ],
        nextAction:
          targetSetupStatus.nextAction ||
          "先重新运行 production env setup，确认目标安全 env 文件 ready 后再执行真实值 dry-run。",
      }),
    };
  }

  try {
    const artifacts = readV1GoLiveStatusArtifacts();
    const currentIntakeVerification = sanitizeV1ProductionEnvIntakeVerification(
      artifacts.productionEnvIntakeVerification.value,
    );
    const report = await runV1ProductionFirstStageValuesDryRunCommand({
      valuesFile: configuredValuesFiles[0],
    });
    const dryRunProofStatus = buildV1ProductionEnvValuesDryRunProofStatus(report, currentIntakeVerification, {
      valuesFileConfig,
      configuredValuesFileCount: configuredValuesFiles.length,
      checkFileBinding: true,
    });
    const ready = dryRunProofStatus.ready === true;
    return {
      httpStatus: 200,
      body: buildV1ProductionFirstStageValuesDryRunLivePrecheckBody({
        operatorId,
        checkedAt,
        status: ready
          ? "ready"
          : isV1ProductionEnvValuesDryRunProofFileBindingBlockedStatus(dryRunProofStatus.status)
            ? "dry_run_file_binding_blocked"
          : dryRunProofStatus.status === "stale_or_mismatched"
            ? "dry_run_stale_or_mismatched"
            : cleanServerText(report.status) || "blocked",
        ready,
        report,
        valuesFileConfig,
        configuredValuesFileCount: configuredValuesFiles.length,
        targetSetupStatus,
        valuesFileAuditStatus,
        dryRunProofStatus,
        nextAction: ready
          ? "真实值片段 dry-run 已覆盖当前最小阻塞补值；负责人确认后可正式合并并继续第一阶段。"
          : dryRunProofStatus.status === "stale_or_mismatched"
            ? dryRunProofStatus.nextAction
            : "按 dry-run 阻塞项修正真实值片段，再重新执行该预检。",
      }),
    };
  } catch {
    return {
      httpStatus: 200,
      body: buildV1ProductionFirstStageValuesDryRunLivePrecheckBody({
        operatorId,
        checkedAt,
        status: "error",
        ready: false,
        report: {},
        valuesFileConfig,
        configuredValuesFileCount: configuredValuesFiles.length,
        targetSetupStatus,
        valuesFileAuditStatus,
        blockingItems: [
          {
            key: "production-first-stage-values-dry-run-command-failed",
            label: "真实值 dry-run 执行失败",
            status: "error",
            detail: "服务端执行第一阶段 values dry-run 失败，可能是生产 env setup 安全 env 文件、真实值片段或 intake CSV 未就绪。",
            nextAction: "由技术/管理检查服务端安全文件配置、权限和第一阶段执行器日志后重试；不要把真实路径或 env 值传给前端。",
          },
        ],
        nextAction: "检查服务端安全 env 文件、真实值片段和 production env setup 报告后重试。",
        error: {
          code: "V1_PRODUCTION_FIRST_STAGE_VALUES_DRY_RUN_LIVE_PRECHECK_FAILED",
          message: "第一阶段真实值 dry-run 预检失败，命令输出已脱敏且未返回前端。",
        },
      }),
    };
  }
}

async function runSystemV1ProductionFirstStageValuesApply({ operatorId }) {
  return v1ProductionEnvValuesApplyService.run({ operatorId });
}
async function runSystemV1ProductionFirstStageExecution({ request, operatorId }) {
  const checkedAt = new Date().toISOString();
  try {
    const report = await runV1ProductionFirstStageExecutionCommand({
      apiBaseUrl: resolveConfiguredOrLoopbackV1ApiBaseUrl({
        request,
        configuredApiBaseUrl: process.env.ERP_V1_RELEASE_API_BASE_URL,
      }),
    });
    const firstStageExecution = sanitizeV1ProductionFirstStageExecution(report);
    const ready = firstStageExecution.ready === true;
    return {
      httpStatus: 200,
      body: buildV1ProductionFirstStageExecutionLiveRunBody({
        operatorId,
        checkedAt,
        status: firstStageExecution.status || (ready ? "ready" : "blocked"),
        ready,
        report,
        nextAction:
          firstStageExecution.nextActions[0] ||
          (ready
            ? "第一阶段执行已通过；继续按 go-live suite 补现场证据、打印、司机真机和真实订单试跑。"
            : "按第一阶段阻塞项补齐真实 PostgreSQL、对象存储、生产 env 或现场证据后重试。"),
      }),
    };
  } catch {
    return {
      httpStatus: 200,
      body: buildV1ProductionFirstStageExecutionLiveRunBody({
        operatorId,
        checkedAt,
        status: "error",
        ready: false,
        report: {},
        blockingItems: [
          {
            key: "production-first-stage-execution-command-failed",
            label: "第一阶段执行失败",
            status: "error",
            detail: "服务端执行第一阶段执行器失败，可能是 production env setup latest、安全 env 文件、脚本权限或本地 API 状态异常。",
            nextAction: "由技术/管理检查服务端 production env setup、安全 env 文件和第一阶段执行器日志后重试；不要把真实路径或 env 值传给前端。",
          },
        ],
        nextAction: "检查服务端 production env setup、安全 env 文件和第一阶段执行器日志后重试。",
        error: {
          code: "V1_PRODUCTION_FIRST_STAGE_EXECUTION_LIVE_RUN_FAILED",
          message: "第一阶段执行失败，命令输出已脱敏且未返回前端。",
        },
      }),
    };
  }
}

async function runSystemV1ProductionPersistenceEvidence({ operatorId }) {
  const checkedAt = new Date().toISOString();
  try {
    const report = await runV1ProductionPersistenceEvidenceCommand();
    const persistenceEvidence = sanitizeV1ProductionPersistenceEvidence(report);
    const ready = persistenceEvidence.ready === true;
    return {
      httpStatus: 200,
      body: buildV1ProductionPersistenceEvidenceLiveRunBody({
        operatorId,
        checkedAt,
        status: persistenceEvidence.status || (ready ? "ready" : "blocked"),
        ready,
        report,
        nextAction:
          persistenceEvidence.nextActions[0] ||
          (ready
            ? "生产持久化留证已通过；继续用当前 API 做 runtime smoke，并回填生产持久化 / 对象存储现场证据。"
            : "按持久化留证阻塞项补齐真实 PostgreSQL、恢复验证库、对象存储或 production env 后重试。"),
      }),
    };
  } catch {
    return {
      httpStatus: 200,
      body: buildV1ProductionPersistenceEvidenceLiveRunBody({
        operatorId,
        checkedAt,
        status: "error",
        ready: false,
        report: {},
        blockingItems: [
          {
            key: "production-persistence-evidence-command-failed",
            label: "生产持久化留证执行失败",
            status: "error",
            detail: "服务端执行生产持久化留证失败，可能是 production env setup latest、安全 env 文件、脚本权限、PostgreSQL 客户端或对象存储探针异常。",
            nextAction: "由技术/管理检查服务端 production env setup、安全 env 文件和持久化留证脚本日志后重试；不要把真实路径或 env 值传给前端。",
          },
        ],
        nextAction: "检查服务端 production env setup、安全 env 文件、PostgreSQL / 对象存储探针环境后重试。",
        error: {
          code: "V1_PRODUCTION_PERSISTENCE_EVIDENCE_LIVE_RUN_FAILED",
          message: "生产持久化留证执行失败，命令输出已脱敏且未返回前端。",
        },
      }),
    };
  }
}

function buildV1ProductionPersistenceEvidenceLiveRunBody({
  operatorId,
  checkedAt,
  status,
  ready,
  report = {},
  blockingItems = [],
  nextAction = "",
  error = null,
} = {}) {
  const persistenceEvidence = sanitizeV1ProductionPersistenceEvidence(report);
  const sanitizedBlockingItems = Array.isArray(blockingItems)
    ? blockingItems.map(sanitizeV1ProductionFirstStageValuesDryRunBlockingItem).filter(Boolean)
    : [];
  const resultStatus = cleanServerText(status) || (ready === true ? "ready" : persistenceEvidence.status || "blocked");
  const blockingCount = sanitizedBlockingItems.length + persistenceEvidence.summary.blockingCount;
  const label =
    ready === true
      ? "生产持久化留证通过"
      : resultStatus === "error"
        ? "生产持久化留证执行失败"
        : "生产持久化留证仍有阻塞";
  const resolvedNextAction =
    cleanServerText(nextAction) ||
    persistenceEvidence.nextActions[0] ||
    (ready === true
      ? "保存持久化留证报告，继续执行生产 API runtime smoke 和第一阶段 closeout。"
      : "按持久化留证阻塞项补齐真实 PostgreSQL、恢复验证库、对象存储或 production env 后重试。");
  const body = {
    version: "p0-v1-production-persistence-evidence-live-run-v1",
    scope: "v1_production_persistence_evidence_live_run",
    status: resultStatus,
    ready: ready === true,
    checkedAt: persistenceEvidence.checkedAt || checkedAt || new Date().toISOString(),
    operatorId,
    summary: {
      label,
      evidenceLabel: persistenceEvidence.summary.label,
      evidenceStatus: persistenceEvidence.status,
      passedCount: persistenceEvidence.summary.passedCount,
      totalCount: persistenceEvidence.summary.totalCount,
      passedLabel: persistenceEvidence.summary.passedLabel,
      blockingCount,
      blockerLabel: `${blockingCount} 项`,
      warningCount: persistenceEvidence.summary.warningCount,
      warningLabel: `${persistenceEvidence.summary.warningCount} 项`,
      envFileFromProductionSetup: persistenceEvidence.envFileFromProductionSetup === true,
      envFileSourceLabel: persistenceEvidence.envFileSourceLabel,
      persistenceEnvReady: persistenceEvidence.summary.persistenceEnvReady === true,
      postgresReady: persistenceEvidence.summary.postgresReady === true,
      postgresBackupRestoreReady: persistenceEvidence.summary.postgresBackupRestoreReady === true,
      objectStorageReady: persistenceEvidence.summary.objectStorageReady === true,
      objectStorageGovernanceReady: persistenceEvidence.summary.objectStorageGovernanceReady === true,
      requestBodyIgnored: true,
      envFilePathAccepted: false,
      envFilePathExposed: false,
      schemaMigrationApplyExecuted: false,
      restoreResetExplicitlyAllowed: false,
      restoreDatabaseMutated: persistenceEvidence.safeguards.postgresBackupRestoreRestoreDatabaseMutated === true,
      businessDataMutated: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
    },
    persistenceEvidence,
    blockingItems: sanitizedBlockingItems,
    blockingStages: persistenceEvidence.blockingStages,
    serverConfigGuidance: buildV1ProductionPersistenceEvidenceServerConfigGuidance({
      ready: ready === true,
      status: resultStatus,
    }),
    nextActions: [resolvedNextAction, ...persistenceEvidence.nextActions].filter(Boolean).slice(0, 8),
    nextAction: resolvedNextAction,
    safeguards: {
      ...persistenceEvidence.safeguards,
      nonMutating: true,
      requestBodyIgnored: true,
      envFileReadFromServerProductionSetupOnly: true,
      envFilePathAcceptedFromRequest: false,
      envFilePathExposed: false,
      rawCommandIncluded: false,
      rawCommandStdoutIncluded: false,
      rawCommandStderrIncluded: false,
      rawPersistenceEvidenceIncluded: false,
      rawEnvFileIncluded: false,
      rawEnvLineIncluded: false,
      envValuesIncluded: false,
      environmentValuesIncluded: false,
      secretValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageEndpointIncluded: false,
      objectStorageBucketIncluded: false,
      objectStorageObjectKeyIncluded: false,
      signedUrlIncluded: false,
      rawBucketPolicyIncluded: false,
      commandValuesIncluded: false,
      localPathExposed: false,
      businessDataMutated: false,
      schemaMigrationApplyExecuted: false,
      restoreResetExplicitlyAllowed: false,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      declaresFullV1Complete: false,
    },
  };
  return error ? { ...body, error } : body;
}

function buildV1ProductionPersistenceEvidenceServerConfigGuidance({ ready = false, status = "blocked" } = {}) {
  return {
    label: "生产持久化留证使用服务端 production env setup 安全 env 文件",
    status: cleanServerText(status) || "blocked",
    ready: ready === true,
    envFileSource: "production-env-setup-latest",
    primaryInput: "production env setup latest 安全 env 文件",
    acceptsFrontendPath: false,
    pathValueExposed: false,
    applyMigrationsByDefault: false,
    restoreResetAllowedByDefault: false,
    writesBusinessData: false,
    steps: [
      "先完成 production env setup，确认目标安全 env 文件已 git ignore、未跟踪、权限为 600。",
      "点击持久化留证，系统只复用服务端 setup 安全 env 文件，不接受浏览器路径、env 值或真实值片段。",
      "本入口汇总 env 文件审计、生产持久化 env 子集、迁移计划、PostgreSQL 预检、备份 / 恢复抽样、对象存储 live 预检和 bucket 治理检查。",
      "本入口默认不执行迁移 apply、不授权恢复验证库重置、不刷新 release candidate / go-live suite、不写业务数据。",
    ],
    verificationActions: [
      "node scripts/run-v1-production-persistence-evidence.mjs --use-production-env-setup-env-file --json",
      "POST /api/system/v1-production-persistence-evidence/live-run",
    ],
    safeguards: {
      frontendPathAccepted: false,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      schemaMigrationApplyExecuted: false,
      restoreResetAllowed: false,
      businessDataMutated: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
  };
}

function buildV1ProductionFirstStageExecutionLiveRunBody({
  operatorId,
  checkedAt,
  status,
  ready,
  report = {},
  blockingItems = [],
  nextAction = "",
  error = null,
} = {}) {
  const firstStageExecution = sanitizeV1ProductionFirstStageExecution(report);
  const sanitizedBlockingItems = Array.isArray(blockingItems)
    ? blockingItems.map(sanitizeV1ProductionFirstStageValuesDryRunBlockingItem).filter(Boolean)
    : [];
  const resultStatus = cleanServerText(status) || (ready === true ? "ready" : firstStageExecution.status || "blocked");
  const blockingCount = sanitizedBlockingItems.length + firstStageExecution.summary.blockingCount;
  const label =
    ready === true
      ? "生产环境 / 持久化第一阶段执行通过"
      : resultStatus === "error"
        ? "生产环境 / 持久化第一阶段执行失败"
        : "生产环境 / 持久化第一阶段仍有阻塞";
  const resolvedNextAction =
    cleanServerText(nextAction) ||
    firstStageExecution.nextActions[0] ||
    (ready === true
      ? "第一阶段执行已通过；继续补真实打印链路、司机真机、真实订单试跑和现场签字。"
      : "按第一阶段阻塞项补齐真实 PostgreSQL、对象存储、生产 env 或现场证据后重试。");
  const body = {
    version: "p0-v1-production-first-stage-execution-live-run-v1",
    scope: "v1_production_first_stage_execution_live_run",
    status: resultStatus,
    ready: ready === true,
    checkedAt: firstStageExecution.checkedAt || checkedAt || new Date().toISOString(),
    operatorId,
    summary: {
      label,
      firstStageLabel: firstStageExecution.summary.label,
      firstStageStatus: firstStageExecution.status,
      passedCount: firstStageExecution.summary.passedCount,
      totalCount: firstStageExecution.summary.totalCount,
      passedLabel: firstStageExecution.summary.passedLabel,
      blockingCount,
      blockerLabel: `${blockingCount} 项`,
      errorCount: firstStageExecution.summary.errorCount,
      errorLabel: firstStageExecution.summary.errorLabel,
      envFileFromProductionSetup: firstStageExecution.execution.envFileFromProductionSetup === true,
      envFileSourceLabel: firstStageExecution.execution.envFileSourceLabel,
      requestBodyIgnored: true,
      envFilePathAccepted: false,
      envFilePathExposed: false,
      productionEnvValuesFileAccepted: false,
      productionEnvValuesApplyExecuted: false,
      productionEnvFileMutated: false,
      applyMigrations: firstStageExecution.execution.applyMigrations === true,
      schemaMigrationApplyExecuted: firstStageExecution.safeguards.schemaMigrationApplyExecuted === true,
      runtimeSmokeUsesCurrentApi: firstStageExecution.execution.runtimeSmokeUsesExistingApi === true,
      runtimeSmokeApiBaseUrlAccepted: false,
      runtimeSmokeApiBaseUrlExposed: false,
      restoreResetExplicitlyAllowed: firstStageExecution.execution.restoreResetExplicitlyAllowed === true,
      businessDataMutated: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
    },
    firstStageExecution,
    blockingItems: sanitizedBlockingItems,
    blockingStages: firstStageExecution.blockingStages,
    serverConfigGuidance: buildV1ProductionFirstStageExecutionServerConfigGuidance({
      ready: ready === true,
      status: resultStatus,
    }),
    nextActions: [resolvedNextAction, ...firstStageExecution.nextActions].filter(Boolean).slice(0, 8),
    nextAction: resolvedNextAction,
    safeguards: {
      nonMutating: true,
      requestBodyIgnored: true,
      envFilePathAcceptedFromRequest: false,
      envFileReadFromServerProductionSetupOnly: true,
      envFilePathExposed: false,
      apiBaseUrlAcceptedFromRequest: false,
      apiBaseUrlReadFromCurrentRequest: true,
      apiBaseUrlExposed: false,
      runtimeSmokeUsesCurrentApi: firstStageExecution.execution.runtimeSmokeUsesExistingApi === true,
      productionEnvValuesFileAcceptedFromRequest: false,
      productionEnvValuesFilePathExposed: false,
      productionEnvValuesApplyExecuted: false,
      targetEnvFilePathExposed: false,
      rawCommandIncluded: false,
      rawCommandStdoutIncluded: false,
      rawCommandStderrIncluded: false,
      rawFirstStageExecutionIncluded: false,
      rawEnvFileIncluded: false,
      rawEnvLineIncluded: false,
      envValuesIncluded: false,
      environmentValuesIncluded: false,
      secretValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageEndpointIncluded: false,
      objectStorageBucketIncluded: false,
      commandValuesIncluded: false,
      spoolPathIncluded: false,
      tokenIncluded: false,
      localPathExposed: false,
      currentApiBaseUrlExposed: false,
      productionEnvFileMutated: false,
      businessDataMutated: false,
      applyMigrations: firstStageExecution.execution.applyMigrations === true,
      schemaMigrationApplyExecuted: firstStageExecution.safeguards.schemaMigrationApplyExecuted === true,
      restoreResetExplicitlyAllowed: firstStageExecution.execution.restoreResetExplicitlyAllowed === true,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      declaresFullV1Complete: false,
    },
  };
  return error ? { ...body, error } : body;
}

function buildV1ProductionFirstStageExecutionServerConfigGuidance({ ready = false, status = "blocked" } = {}) {
  return {
    label: "第一阶段执行使用服务端 production env setup 安全 env 文件",
    status: cleanServerText(status) || "blocked",
    ready: ready === true,
    envFileSource: "production-env-setup-latest",
    primaryInput: "production env setup latest 安全 env 文件",
    acceptsFrontendPath: false,
    pathValueExposed: false,
    restartRequired: false,
    applyMigrationsByDefault: false,
    restoreResetAllowedByDefault: false,
    productionEnvValuesFileAccepted: false,
    runtimeSmokeApiBaseUrlSource: "current-request",
    runtimeSmokeApiBaseUrlAcceptedFromFrontend: false,
    runtimeSmokeApiBaseUrlExposed: false,
    steps: [
      "先完成真实值 dry-run；负责人确认后再正式合并真实值。",
      "确认 production env setup latest 指向同一份安全、未跟踪、0600 权限的生产 env 文件。",
      "点击执行第一阶段，系统只复用服务端 setup 安全 env 文件，不接受浏览器传路径或 env 值。",
      "runtime smoke 使用当前 API 地址做内部探针，但不会接受或返回浏览器传入的 API 地址。",
      "本入口默认不执行迁移 apply、不允许恢复验证库重置、不刷新 release candidate / go-live suite。",
    ],
    verificationActions: [
      "node scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --json",
      "POST /api/system/v1-production-first-stage-execution/live-run",
    ],
    safeguards: {
      frontendPathAccepted: false,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      productionEnvValuesApplyExecuted: false,
      schemaMigrationApplyExecuted: false,
      restoreResetAllowed: false,
      apiBaseUrlAcceptedFromFrontend: false,
      apiBaseUrlExposed: false,
      businessDataMutated: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
  };
}

function buildV1ProductionFirstStageValuesDryRunLivePrecheckBody({
  operatorId,
  checkedAt,
  status,
  ready,
  report = {},
  valuesFileConfig = {},
  configuredValuesFileCount = 0,
  targetSetupStatus = null,
  valuesFileAuditStatus = null,
  dryRunProofStatus = null,
  blockingItems = [],
  nextAction = "",
  error = null,
} = {}) {
  const firstStageExecution = sanitizeV1ProductionFirstStageExecution(report);
  const dryRunCoverage = firstStageExecution.dryRunCoverage;
  const resolvedTargetSetupStatus =
    isPlainServerObject(targetSetupStatus) && targetSetupStatus.available === true
      ? targetSetupStatus
      : buildV1ProductionEnvSetupTargetStatus();
  const targetSetupSummary = isPlainServerObject(resolvedTargetSetupStatus.summary)
    ? resolvedTargetSetupStatus.summary
    : {};
  const targetSetupReady = resolvedTargetSetupStatus.ready === true;
  const resolvedValuesFileAuditStatus =
    isPlainServerObject(valuesFileAuditStatus) && valuesFileAuditStatus.available === true
      ? valuesFileAuditStatus
      : buildV1ProductionEnvValuesFileAuditStatus({ valuesFileConfig, configuredValuesFileCount });
  const valuesFileAuditSummary = isPlainServerObject(resolvedValuesFileAuditStatus.summary)
    ? resolvedValuesFileAuditStatus.summary
    : {};
  const valuesFileAuditReady = resolvedValuesFileAuditStatus.ready === true;
  const normalizedConfiguredValuesFileCount = normalizeV1NonNegativeInteger(configuredValuesFileCount);
  const resolvedDryRunProofStatus =
    isPlainServerObject(dryRunProofStatus) && dryRunProofStatus.status
      ? dryRunProofStatus
      : (() => {
          const artifacts = readV1GoLiveStatusArtifacts();
          return buildV1ProductionEnvValuesDryRunProofStatus(
            artifacts.productionFirstStageExecution.value,
            sanitizeV1ProductionEnvIntakeVerification(artifacts.productionEnvIntakeVerification.value),
            {
              valuesFileConfig,
              configuredValuesFileCount,
              checkFileBinding: normalizedConfiguredValuesFileCount === 1,
            },
          );
        })();
  const dryRunProofReady = resolvedDryRunProofStatus.ready === true;
  const sourceStatuses = sanitizeV1ProductionEnvFileConfigSourceStatuses(valuesFileConfig);
  const selectedEnvVariable = cleanServerText(valuesFileConfig.selectedEnvVariable);
  const selectedEnvVariableLabel = cleanServerText(valuesFileConfig.selectedEnvVariableLabel) || "未配置";
  const selectedSourceKind = cleanServerText(valuesFileConfig.selectedSourceKind) || "none";
  const configuredSourceVariableCount = normalizeV1NonNegativeInteger(valuesFileConfig.configuredSourceVariableCount);
  const sanitizedBlockingItems = Array.isArray(blockingItems)
    ? blockingItems.map(sanitizeV1ProductionFirstStageValuesDryRunBlockingItem).filter(Boolean)
    : [];
  const resultStatus = cleanServerText(status) || (ready === true ? "ready" : "blocked");
  const firstStageBlockingStages = firstStageExecution.blockingStages || [];
  const label =
    ready === true
      ? "第一阶段真实值 dry-run 最小补值已覆盖"
      : resultStatus === "not_configured"
        ? "服务端真实值片段未配置"
        : resultStatus === "error"
          ? "第一阶段真实值 dry-run 预检失败"
          : resultStatus === "dry_run_file_binding_blocked"
            ? "第一阶段真实值 dry-run 片段指纹绑定未通过"
          : resultStatus === "audit_blocked"
            ? "真实值片段安全审计未通过"
          : resultStatus === "target_not_ready"
            ? "目标生产 env 安全草稿未就绪"
            : "第一阶段真实值 dry-run 仍未通过";
  const resolvedNextAction =
    cleanServerText(nextAction) ||
    resolvedTargetSetupStatus.nextAction ||
    dryRunCoverage.nextAction ||
    (ready === true
      ? "负责人确认后可正式合并真实值并继续第一阶段。"
      : "先配置或修正安全真实值片段后重新执行 dry-run。");
  const body = {
    version: "p0-v1-production-first-stage-values-dry-run-live-precheck-v1",
    scope: "v1_production_first_stage_values_dry_run_live_precheck",
    status: resultStatus,
    ready: ready === true,
    checkedAt: firstStageExecution.checkedAt || checkedAt || new Date().toISOString(),
    operatorId,
    summary: {
      label,
      configuredValuesFileCount: normalizedConfiguredValuesFileCount,
      valuesFilePathConfigured: normalizedConfiguredValuesFileCount > 0,
      selectedEnvVariable,
      selectedEnvVariableLabel,
      selectedSourceKind,
      fallbackSourceUsed: valuesFileConfig.fallbackSourceUsed === true,
      configuredSourceVariableCount,
      sourceStatuses,
      requestBodyIgnored: true,
      valuesFilePathAccepted: false,
      valuesFilePathExposed: false,
      targetEnvFromProductionSetup: true,
      targetEnvFilePathExposed: false,
      targetSetupStatus: resolvedTargetSetupStatus.status,
      targetSetupReady,
      targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
      targetSetupEnvFileCount: normalizeV1NonNegativeInteger(targetSetupSummary.envFileCount),
      targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
      valuesFileAuditStatus: resolvedValuesFileAuditStatus.status,
      valuesFileAuditReady,
      valuesFileAuditExecuted: valuesFileAuditSummary.auditExecuted === true,
      valuesFileAuditBlockingCount: normalizeV1NonNegativeInteger(valuesFileAuditSummary.blockingCount),
      valuesFileAuditWarningCount: normalizeV1NonNegativeInteger(valuesFileAuditSummary.warningCount),
      valuesFileAuditPathExposed: false,
      valuesFileAuditValuesIncluded: false,
      dryRunProofStatus: resolvedDryRunProofStatus.status,
      dryRunProofReady,
      dryRunProofIncluded: resolvedDryRunProofStatus.included === true,
      dryRunProofStatusLabel: resolvedDryRunProofStatus.statusLabel,
      dryRunProofFresh: resolvedDryRunProofStatus.fresh === true,
      dryRunProofFreshnessStatus: cleanServerText(resolvedDryRunProofStatus.freshnessStatus),
      dryRunProofFreshnessLabel: cleanServerText(resolvedDryRunProofStatus.freshnessLabel),
      dryRunProofMaxAgeHours: resolvedDryRunProofStatus.maxAgeHours,
      dryRunProofAgeHours: resolvedDryRunProofStatus.ageHours,
      dryRunProofExpiresAt: cleanServerText(resolvedDryRunProofStatus.expiresAt),
      dryRunProofRemainingHours: resolvedDryRunProofStatus.remainingHours,
      dryRunProofCheckedAtIncluded: resolvedDryRunProofStatus.checkedAtIncluded === true,
      dryRunProofCheckedAt: cleanServerText(resolvedDryRunProofStatus.checkedAt),
      dryRunProofMatchesCurrentMinimumPath:
        resolvedDryRunProofStatus.dryRunMatchesCurrentMinimumPath === true,
      dryRunProofMinimumBlockingTargetSignatureIncluded:
        resolvedDryRunProofStatus.dryRunMinimumBlockingTargetSignatureIncluded === true,
      currentMinimumBlockingTargetSignatureIncluded:
        resolvedDryRunProofStatus.currentMinimumBlockingTargetSignatureIncluded === true,
      dryRunProofMinimumBlockingLabel: resolvedDryRunProofStatus.minimumBlockingLabel,
      dryRunProofMinimumBlockingTargetCount: resolvedDryRunProofStatus.minimumBlockingTargetCount,
      dryRunProofMinimumBlockingSatisfiedCount: resolvedDryRunProofStatus.minimumBlockingSatisfiedCount,
      dryRunProofMinimumBlockingMissingCount: resolvedDryRunProofStatus.minimumBlockingMissingCount,
      dryRunProofValuesFingerprintStatus: cleanServerText(resolvedDryRunProofStatus.valuesFingerprintStatus),
      dryRunProofValuesFingerprintStatusLabel: cleanServerText(
        resolvedDryRunProofStatus.valuesFingerprintStatusLabel,
      ),
      dryRunProofValuesFingerprintCompared: resolvedDryRunProofStatus.valuesFingerprintCompared === true,
      dryRunProofValuesFingerprintIncluded: resolvedDryRunProofStatus.valuesFingerprintIncluded === true,
      dryRunProofValuesFingerprintMatched: resolvedDryRunProofStatus.valuesFingerprintMatched === true,
      dryRunProofValuesFingerprintDigestExposed: false,
      dryRunProofValuesFingerprintValuesExposed: false,
      dryRunProofValuesFileUnchangedAfterProof:
        resolvedDryRunProofStatus.valuesFileUnchangedAfterProof === true,
      dryRunProofTargetEnvFileUnchangedAfterProof:
        resolvedDryRunProofStatus.targetEnvFileUnchangedAfterProof === true,
      dryRunProofNextAction: resolvedDryRunProofStatus.nextAction,
      productionEnvFileMutated: false,
      businessDataMutated: false,
      schemaMigrationApplyExecuted: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      dryRunStatusLabel: dryRunCoverage.statusLabel,
      minimumBlockingLabel: dryRunCoverage.minimumBlockingLabel,
      minimumWarningLabel: dryRunCoverage.minimumWarningLabel,
      envPreflightLabel: dryRunCoverage.envPreflightLabel,
      intakeLabel: dryRunCoverage.intakeLabel,
      firstStageStatus: firstStageExecution.status,
      firstStageLabel: firstStageExecution.summary.label,
      blockingCount: sanitizedBlockingItems.length + firstStageBlockingStages.length,
      blockerLabel: `${sanitizedBlockingItems.length + firstStageBlockingStages.length} 项`,
    },
    dryRunCoverage,
    firstStageExecution,
    targetSetupStatus: resolvedTargetSetupStatus,
    valuesFileAuditStatus: resolvedValuesFileAuditStatus,
    dryRunProofStatus: resolvedDryRunProofStatus,
    blockingItems: sanitizedBlockingItems,
    blockingStages: firstStageBlockingStages,
    serverConfigGuidance: buildV1ProductionFirstStageValuesDryRunServerConfigGuidance({
      valuesFileConfig,
      configuredValuesFileCount: normalizedConfiguredValuesFileCount,
      ready: ready === true,
      status: resultStatus,
      targetSetupStatus: resolvedTargetSetupStatus,
      valuesFileAuditStatus: resolvedValuesFileAuditStatus,
      productionEnvValuesDryRunProofStatus: resolvedDryRunProofStatus,
    }),
    nextActions: [resolvedNextAction, ...firstStageExecution.nextActions].filter(Boolean).slice(0, 8),
    nextAction: resolvedNextAction,
    safeguards: {
      nonMutating: true,
      requestBodyIgnored: true,
      valuesFilePathAcceptedFromRequest: false,
      valuesFileReadFromServerConfigOnly: true,
      valuesFilePathExposed: false,
      targetEnvFilePathExposed: false,
      targetEnvComesFromProductionSetup: true,
      targetSetupReady,
      targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
      targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
      valuesFileAuditReady,
      valuesFileAuditStatus: resolvedValuesFileAuditStatus.status,
      valuesFileAuditPathExposed: false,
      valuesFileAuditValuesIncluded: false,
      dryRunProofReady,
      dryRunProofIncluded: resolvedDryRunProofStatus.included === true,
      dryRunProofStatus: resolvedDryRunProofStatus.status,
      dryRunProofValuesIncluded: false,
      dryRunProofFresh: resolvedDryRunProofStatus.fresh === true,
      dryRunProofMaxAgeHours: resolvedDryRunProofStatus.maxAgeHours,
      dryRunProofExpiresAt: cleanServerText(resolvedDryRunProofStatus.expiresAt),
      dryRunProofRemainingHours: resolvedDryRunProofStatus.remainingHours,
      dryRunProofCheckedAtIncluded: resolvedDryRunProofStatus.checkedAtIncluded === true,
      dryRunProofMatchesCurrentMinimumPath:
        resolvedDryRunProofStatus.dryRunMatchesCurrentMinimumPath === true,
      dryRunProofMinimumBlockingTargetSignatureIncluded:
        resolvedDryRunProofStatus.dryRunMinimumBlockingTargetSignatureIncluded === true,
      currentMinimumBlockingTargetSignatureIncluded:
        resolvedDryRunProofStatus.currentMinimumBlockingTargetSignatureIncluded === true,
      dryRunProofMinimumBlockingTargetCount: resolvedDryRunProofStatus.minimumBlockingTargetCount,
      dryRunProofMinimumBlockingMissingCount: resolvedDryRunProofStatus.minimumBlockingMissingCount,
      dryRunProofValuesFingerprintCompared: resolvedDryRunProofStatus.valuesFingerprintCompared === true,
      dryRunProofValuesFingerprintIncluded: resolvedDryRunProofStatus.valuesFingerprintIncluded === true,
      dryRunProofValuesFingerprintMatched: resolvedDryRunProofStatus.valuesFingerprintMatched === true,
      dryRunProofValuesFingerprintDigestExposed: false,
      dryRunProofValuesFingerprintValuesExposed: false,
      dryRunProofValuesFileUnchangedAfterProof:
        resolvedDryRunProofStatus.valuesFileUnchangedAfterProof === true,
      dryRunProofTargetEnvFileUnchangedAfterProof:
        resolvedDryRunProofStatus.targetEnvFileUnchangedAfterProof === true,
      rawCommandIncluded: false,
      rawCommandStdoutIncluded: false,
      rawCommandStderrIncluded: false,
      rawFirstStageExecutionIncluded: false,
      rawProductionEnvValuesFileIncluded: false,
      rawEnvFileIncluded: false,
      rawEnvLineIncluded: false,
      envValuesIncluded: false,
      secretValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageEndpointIncluded: false,
      objectStorageBucketIncluded: false,
      commandValuesIncluded: false,
      spoolPathIncluded: false,
      tokenIncluded: false,
      localPathExposed: false,
      productionEnvFileMutated: false,
      businessDataMutated: false,
      schemaMigrationApplyExecuted: false,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      declaresFullV1Complete: false,
    },
  };
  return error ? { ...body, error } : body;
}

function sanitizeV1ProductionFirstStageValuesDryRunBlockingItem(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const label = sanitizeV1RoleTaskActionText(source.label);
  const key = cleanServerText(source.key);
  if (!label && !key) return null;
  return {
    key,
    label: label || key,
    status: cleanServerText(source.status) || "blocked",
    detail: sanitizeV1RoleTaskActionText(source.detail),
    nextAction: sanitizeV1RoleTaskActionText(source.nextAction),
  };
}

function buildV1ProductionFirstStageValuesDryRunServerConfigGuidance({
  valuesFileConfig = {},
  configuredValuesFileCount = 0,
  ready = false,
  status = "not_configured",
  targetSetupStatus = null,
  valuesFileAuditStatus = null,
  productionEnvMinimumFillStatus = null,
  productionEnvValuesDryRunProofStatus = null,
} = {}) {
  const sourceStatuses = sanitizeV1ProductionEnvFileConfigSourceStatuses(valuesFileConfig);
  const selectedEnvVariable = cleanServerText(valuesFileConfig.selectedEnvVariable);
  const selectedSourceKind = cleanServerText(valuesFileConfig.selectedSourceKind) || "none";
  const selectedEnvVariableLabel = cleanServerText(valuesFileConfig.selectedEnvVariableLabel) || "未配置";
  const resolvedTargetSetupStatus =
    isPlainServerObject(targetSetupStatus) && targetSetupStatus.available === true
      ? targetSetupStatus
      : buildV1ProductionEnvSetupTargetStatus();
  const targetSetupSummary = isPlainServerObject(resolvedTargetSetupStatus.summary)
    ? resolvedTargetSetupStatus.summary
    : {};
  const targetSetupReady = resolvedTargetSetupStatus.ready === true;
  const resolvedValuesFileAuditStatus =
    isPlainServerObject(valuesFileAuditStatus) && valuesFileAuditStatus.available === true
      ? valuesFileAuditStatus
      : buildV1ProductionEnvValuesFileAuditStatus({ valuesFileConfig, configuredValuesFileCount });
  const valuesFileAuditSummary = isPlainServerObject(resolvedValuesFileAuditStatus.summary)
    ? resolvedValuesFileAuditStatus.summary
    : {};
  const minimumFillStatus = buildV1ProductionEnvValuesMinimumFillStatus(productionEnvMinimumFillStatus);
  const dryRunProofStatus = buildV1ProductionEnvValuesDryRunProofStatus(
    productionEnvValuesDryRunProofStatus,
    minimumFillStatus,
    {
      valuesFileConfig,
      configuredValuesFileCount,
      checkFileBinding: normalizeV1NonNegativeInteger(configuredValuesFileCount) === 1,
    },
  );
  const dryRunProofReady = dryRunProofStatus.ready === true;
  return {
    label: configuredValuesFileCount > 0 ? "服务端真实值片段路径已配置" : "服务端真实值片段路径待配置",
    status: configuredValuesFileCount > 0 ? "configured" : "not_configured",
    ready: ready === true,
    primaryEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
    fallbackEnvVariables: ["ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE", "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE"],
    selectedEnvVariable,
    selectedEnvVariableLabel,
    selectedSourceKind,
    fallbackSourceUsed: valuesFileConfig.fallbackSourceUsed === true,
    configuredSourceVariableCount: normalizeV1NonNegativeInteger(valuesFileConfig.configuredSourceVariableCount),
    sourceStatuses,
    configuredValuesFileCount: normalizeV1NonNegativeInteger(configuredValuesFileCount),
    targetSetupStatus: resolvedTargetSetupStatus,
    targetSetupReady,
    targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
    targetSetupEnvFileCount: normalizeV1NonNegativeInteger(targetSetupSummary.envFileCount),
    targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
    valuesFileAuditStatus: resolvedValuesFileAuditStatus.status,
    valuesFileAuditReady: resolvedValuesFileAuditStatus.ready === true,
    valuesFileAuditExecuted: valuesFileAuditSummary.auditExecuted === true,
    valuesFileAuditBlockingCount: normalizeV1NonNegativeInteger(valuesFileAuditSummary.blockingCount),
    valuesFileAuditWarningCount: normalizeV1NonNegativeInteger(valuesFileAuditSummary.warningCount),
    valuesFileAuditPathExposed: false,
    valuesFileAuditValuesIncluded: false,
    intakeVerificationStatus: minimumFillStatus.intakeVerificationStatus,
    intakeVerificationReady: minimumFillStatus.intakeVerificationReady,
    intakeVerificationAvailable: minimumFillStatus.available,
    minimumBlockingReady: minimumFillStatus.minimumBlockingReady,
    minimumBlockingLabel: minimumFillStatus.minimumBlockingLabel,
    minimumBlockingTargetCount: minimumFillStatus.minimumBlockingTargetCount,
    minimumBlockingSatisfiedCount: minimumFillStatus.minimumBlockingSatisfiedCount,
    minimumBlockingMissingCount: minimumFillStatus.minimumBlockingMissingCount,
    minimumBlockingVariableRowCount: minimumFillStatus.minimumBlockingVariableRowCount,
    minimumBlockingAlternativeGroupCount: minimumFillStatus.minimumBlockingAlternativeGroupCount,
    minimumWarningLabel: minimumFillStatus.minimumWarningLabel,
    minimumWarningMissingCount: minimumFillStatus.minimumWarningMissingCount,
    fullIntakeConfiguredLabel: minimumFillStatus.fullIntakeConfiguredLabel,
    dryRunProofStatus: dryRunProofStatus.status,
    dryRunProofReady,
    dryRunProofIncluded: dryRunProofStatus.included === true,
    dryRunProofStatusLabel: dryRunProofStatus.statusLabel,
    dryRunProofFresh: dryRunProofStatus.fresh === true,
    dryRunProofFreshnessStatus: cleanServerText(dryRunProofStatus.freshnessStatus),
    dryRunProofFreshnessLabel: cleanServerText(dryRunProofStatus.freshnessLabel),
    dryRunProofMaxAgeHours: dryRunProofStatus.maxAgeHours,
    dryRunProofAgeHours: dryRunProofStatus.ageHours,
    dryRunProofExpiresAt: cleanServerText(dryRunProofStatus.expiresAt),
    dryRunProofRemainingHours: dryRunProofStatus.remainingHours,
    dryRunProofCheckedAtIncluded: dryRunProofStatus.checkedAtIncluded === true,
    dryRunProofCheckedAt: cleanServerText(dryRunProofStatus.checkedAt),
    dryRunProofMinimumBlockingLabel: dryRunProofStatus.minimumBlockingLabel,
    dryRunProofMinimumBlockingTargetCount: dryRunProofStatus.minimumBlockingTargetCount,
    dryRunProofMinimumBlockingSatisfiedCount: dryRunProofStatus.minimumBlockingSatisfiedCount,
    dryRunProofMinimumBlockingMissingCount: dryRunProofStatus.minimumBlockingMissingCount,
    dryRunProofValuesFingerprintStatus: cleanServerText(dryRunProofStatus.valuesFingerprintStatus),
    dryRunProofValuesFingerprintStatusLabel: cleanServerText(dryRunProofStatus.valuesFingerprintStatusLabel),
    dryRunProofValuesFingerprintCompared: dryRunProofStatus.valuesFingerprintCompared === true,
    dryRunProofValuesFingerprintIncluded: dryRunProofStatus.valuesFingerprintIncluded === true,
    dryRunProofValuesFingerprintMatched: dryRunProofStatus.valuesFingerprintMatched === true,
    dryRunProofValuesFingerprintDigestExposed: false,
    dryRunProofValuesFingerprintValuesExposed: false,
    dryRunProofValuesFileUnchangedAfterProof: dryRunProofStatus.valuesFileUnchangedAfterProof === true,
    dryRunProofTargetEnvFileUnchangedAfterProof: dryRunProofStatus.targetEnvFileUnchangedAfterProof === true,
    dryRunProofNextAction: dryRunProofStatus.nextAction,
    acceptsFrontendPath: false,
    pathValueExposed: false,
    targetEnvFilePathExposed: false,
    restartRequired: true,
    currentDryRunStatus: cleanServerText(status) || "unknown",
    steps: [
      "从交接包复制 production-env-minimum-values-fragment.template.env.example 或 production-env-values-fragment.template.env.example 到安全、未跟踪的真实值片段文件。",
      "只取消注释并填写本轮要补的白名单变量，避免同时填写同一任选组的多个不同值。",
      "在 API 进程环境中配置 ERP_V1_PRODUCTION_ENV_VALUES_FILE，指向该安全真实值片段；不要从浏览器传路径。",
      "确认 production env setup latest 已 ready，且目标安全 env 文件已 git ignore、未跟踪、权限为 600。",
      "重启 API 后，在上线状态页点击真实值 dry-run，确认最小阻塞补值覆盖后再正式合并。",
      "真实值 dry-run 证明默认需在 24 小时内；如超过有效期，重新执行 dry-run 后再正式合并。",
    ],
    verificationActions: [
      "node scripts/run-v1-production-first-stage-execution.mjs --use-production-env-setup-env-file --production-env-values-file <secure-values-env-fragment> --production-env-values-dry-run --json",
      "POST /api/system/v1-production-first-stage-values-dry-run/live-precheck",
    ],
    safeguards: {
      valuesFilePathAcceptedFromFrontend: false,
      valuesFilePathValueIncluded: false,
      targetEnvFileComesFromProductionSetup: true,
      targetSetupReady,
      targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
      targetSetupEnvFileCount: normalizeV1NonNegativeInteger(targetSetupSummary.envFileCount),
      targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
      targetEnvFilePathExposed: false,
      valuesFileAuditReady: resolvedValuesFileAuditStatus.ready === true,
      valuesFileAuditStatus: resolvedValuesFileAuditStatus.status,
      valuesFileAuditPathExposed: false,
      valuesFileAuditValuesIncluded: false,
      minimumBlockingReady: minimumFillStatus.minimumBlockingReady,
      minimumBlockingTargetCount: minimumFillStatus.minimumBlockingTargetCount,
      minimumBlockingMissingCount: minimumFillStatus.minimumBlockingMissingCount,
      dryRunProofReady,
      dryRunProofIncluded: dryRunProofStatus.included === true,
      dryRunProofStatus: dryRunProofStatus.status,
      dryRunProofValuesIncluded: false,
      dryRunProofFresh: dryRunProofStatus.fresh === true,
      dryRunProofMaxAgeHours: dryRunProofStatus.maxAgeHours,
      dryRunProofExpiresAt: cleanServerText(dryRunProofStatus.expiresAt),
      dryRunProofRemainingHours: dryRunProofStatus.remainingHours,
      dryRunProofCheckedAtIncluded: dryRunProofStatus.checkedAtIncluded === true,
      dryRunProofMinimumBlockingTargetCount: dryRunProofStatus.minimumBlockingTargetCount,
      dryRunProofMinimumBlockingMissingCount: dryRunProofStatus.minimumBlockingMissingCount,
      sourceVariableNamesOnly: true,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      productionEnvFileMutated: false,
    },
  };
}

function buildV1ProductionEnvValuesFragmentSourceStatus({ productionEnvIntakeVerification = null } = {}) {
  const valuesFileConfig = getConfiguredV1ProductionEnvValuesFileConfig();
  const configuredValuesFileCount = normalizeV1NonNegativeInteger(valuesFileConfig.configuredEnvFileCount);
  const configuredSourceVariableCount = normalizeV1NonNegativeInteger(valuesFileConfig.configuredSourceVariableCount);
  const targetSetupStatus = buildV1ProductionEnvSetupTargetStatus();
  const targetSetupSummary = isPlainServerObject(targetSetupStatus.summary) ? targetSetupStatus.summary : {};
  const targetSetupReady = targetSetupStatus.ready === true;
  const valuesFileAuditStatus = buildV1ProductionEnvValuesFileAuditStatus({
    valuesFileConfig,
    configuredValuesFileCount,
  });
  const valuesFileAuditReady = valuesFileAuditStatus.ready === true;
  const minimumFillStatus = buildV1ProductionEnvValuesMinimumFillStatus(productionEnvIntakeVerification);
  const ready = configuredValuesFileCount === 1 && targetSetupReady && valuesFileAuditReady;
  const status =
    ready
      ? "configured"
      : configuredValuesFileCount > 1
        ? "multiple_configured"
        : configuredValuesFileCount === 0
          ? "not_configured"
          : !valuesFileAuditReady
            ? "audit_blocked"
            : "target_not_ready";
  const serverConfigGuidance = buildV1ProductionFirstStageValuesDryRunServerConfigGuidance({
    valuesFileConfig,
    configuredValuesFileCount,
    ready,
    status,
    targetSetupStatus,
    valuesFileAuditStatus,
    productionEnvMinimumFillStatus: minimumFillStatus,
  });
  const label =
    ready
      ? "服务端真实值片段来源、安全审计和目标 env 均已就绪"
      : configuredValuesFileCount > 1
        ? "服务端真实值片段来源不唯一"
        : configuredValuesFileCount === 0
          ? "服务端真实值片段来源未配置"
          : !valuesFileAuditReady
            ? "服务端真实值片段来源已配置，但片段安全审计未通过"
            : "服务端真实值片段来源已配置，但目标生产 env 安全草稿未就绪";
  const nextAction =
    ready
      ? "可先执行真实值 dry-run；通过后再由负责人确认正式合并真实值。"
      : configuredValuesFileCount > 1
        ? "只保留一个安全未跟踪真实值片段来源，重启 API 后再执行 dry-run。"
        : configuredValuesFileCount === 0
          ? "在 API 进程配置 ERP_V1_PRODUCTION_ENV_VALUES_FILE，指向安全未跟踪真实值片段并重启 API。"
          : !valuesFileAuditReady
            ? valuesFileAuditStatus.nextAction || "先修正真实值片段文件安全审计阻塞项，再重启 API 后执行 dry-run。"
            : targetSetupStatus.nextAction || "先重新运行 production env setup，确认目标安全 env 文件 ready 后再执行 dry-run。";

  return {
    available: true,
    status,
    ready,
    summary: {
      label,
      configuredValuesFileCount,
      valuesFilePathConfigured: configuredValuesFileCount > 0,
      selectedEnvVariable: cleanServerText(valuesFileConfig.selectedEnvVariable),
      selectedEnvVariableLabel: cleanServerText(valuesFileConfig.selectedEnvVariableLabel) || "未配置",
      selectedSourceKind: cleanServerText(valuesFileConfig.selectedSourceKind) || "none",
      fallbackSourceUsed: valuesFileConfig.fallbackSourceUsed === true,
      configuredSourceVariableCount,
      sourceStatuses: serverConfigGuidance.sourceStatuses,
      primaryEnvVariable: serverConfigGuidance.primaryEnvVariable,
      fallbackEnvVariables: serverConfigGuidance.fallbackEnvVariables,
      acceptsFrontendPath: false,
      pathValueExposed: false,
      restartRequired: true,
      dryRunExecuted: false,
      targetEnvFromProductionSetup: true,
      targetEnvFilePathExposed: false,
      targetSetupStatus: targetSetupStatus.status,
      targetSetupReady,
      targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
      targetSetupEnvFileCount: normalizeV1NonNegativeInteger(targetSetupSummary.envFileCount),
      targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
      valuesFileAuditStatus: valuesFileAuditStatus.status,
      valuesFileAuditReady,
      valuesFileAuditExecuted: valuesFileAuditStatus.summary.auditExecuted === true,
      valuesFileAuditBlockingCount: normalizeV1NonNegativeInteger(valuesFileAuditStatus.summary.blockingCount),
      valuesFileAuditWarningCount: normalizeV1NonNegativeInteger(valuesFileAuditStatus.summary.warningCount),
      valuesFileAuditPathExposed: false,
      valuesFileAuditValuesIncluded: false,
      intakeVerificationStatus: minimumFillStatus.intakeVerificationStatus,
      intakeVerificationReady: minimumFillStatus.intakeVerificationReady,
      intakeVerificationAvailable: minimumFillStatus.available,
      minimumBlockingReady: minimumFillStatus.minimumBlockingReady,
      minimumBlockingLabel: minimumFillStatus.minimumBlockingLabel,
      minimumBlockingTargetCount: minimumFillStatus.minimumBlockingTargetCount,
      minimumBlockingSatisfiedCount: minimumFillStatus.minimumBlockingSatisfiedCount,
      minimumBlockingMissingCount: minimumFillStatus.minimumBlockingMissingCount,
      minimumBlockingVariableRowCount: minimumFillStatus.minimumBlockingVariableRowCount,
      minimumBlockingAlternativeGroupCount: minimumFillStatus.minimumBlockingAlternativeGroupCount,
      minimumWarningLabel: minimumFillStatus.minimumWarningLabel,
      minimumWarningMissingCount: minimumFillStatus.minimumWarningMissingCount,
      fullIntakeConfiguredLabel: minimumFillStatus.fullIntakeConfiguredLabel,
      productionEnvFileMutated: false,
      businessDataMutated: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
    targetSetupStatus,
    valuesFileAuditStatus,
    serverConfigGuidance,
    nextAction,
    safeguards: {
      nonMutating: true,
      valuesFilePathAcceptedFromFrontend: false,
      valuesFilePathValueIncluded: false,
      valuesFileReadFromServerConfigOnly: true,
      sourceVariableNamesOnly: true,
      targetEnvFileComesFromProductionSetup: true,
      targetSetupReady,
      targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
      targetSetupEnvFileCount: normalizeV1NonNegativeInteger(targetSetupSummary.envFileCount),
      targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
      targetEnvFilePathExposed: false,
      valuesFileAuditReady,
      valuesFileAuditStatus: valuesFileAuditStatus.status,
      valuesFileAuditPathExposed: false,
      valuesFileAuditValuesIncluded: false,
      minimumBlockingReady: minimumFillStatus.minimumBlockingReady,
      minimumBlockingTargetCount: minimumFillStatus.minimumBlockingTargetCount,
      minimumBlockingMissingCount: minimumFillStatus.minimumBlockingMissingCount,
      dryRunExecuted: false,
      productionEnvFileMutated: false,
      businessDataMutated: false,
      envValuesIncluded: false,
      secretValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageEndpointIncluded: false,
      objectStorageBucketIncluded: false,
      commandValuesIncluded: false,
      localPathExposed: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      declaresFullV1Complete: false,
    },
  };
}

function buildV1ProductionEnvValuesDryRunProofStatus(
  productionFirstStageExecution = null,
  currentMinimumFillSource = null,
  options = {},
) {
  return buildV1ProductionEnvValuesDryRunProofStatusCore(
    productionFirstStageExecution,
    currentMinimumFillSource,
    {
      ...options,
      buildFileBindingStatus: (args) => buildV1ProductionEnvValuesDryRunProofFileBindingStatus(args),
      sanitizeExecution: (value) => sanitizeV1ProductionFirstStageExecution(value),
    },
  );
}

function buildV1ProductionEnvValuesDryRunProofFileBindingStatus(args = {}) {
  return buildV1ProductionEnvValuesDryRunProofFileBindingStatusCore(args, {
    readProofReport: ({ valuesEnvFile, maxAgeHours }) =>
      buildProductionEnvValuesDryRunProofReport({
        valuesEnvFile,
        useProductionEnvSetupEnvFile: true,
        productionEnvSetupJson: V1_PRODUCTION_ENV_SETUP_JSON_PATH,
        maxAgeHours,
      }),
  });
}

function buildV1ProductionEnvValuesFileAuditStatus({
  valuesFileConfig = {},
  configuredValuesFileCount = null,
} = {}) {
  const envFiles = Array.isArray(valuesFileConfig.envFiles) ? valuesFileConfig.envFiles : [];
  const normalizedConfiguredValuesFileCount = normalizeV1NonNegativeInteger(
    configuredValuesFileCount ?? valuesFileConfig.configuredEnvFileCount ?? envFiles.length,
  );
  const baseSummary = {
    auditExecuted: false,
    auditReportAvailable: false,
    fileCount: normalizedConfiguredValuesFileCount,
    blockingCount: 0,
    warningCount: 0,
    passedCount: 0,
    placeholderAssignmentCount: 0,
    uncommentedAssignmentCount: 0,
    sensitiveVariableNameCount: 0,
    crossFileDuplicateVariableCount: 0,
    pathValueExposed: false,
    valuesFilePathExposed: false,
    envValuesIncluded: false,
    secretValuesIncluded: false,
  };
  const buildSkipped = ({ status, label, nextAction }) => ({
    available: true,
    status,
    ready: false,
    summary: {
      ...baseSummary,
      label,
      auditStatus: status,
      auditReady: false,
    },
    blockingItems: [],
    nextAction,
    safeguards: buildV1ProductionEnvValuesFileAuditSafeguards({ ready: false, status }),
  });

  if (normalizedConfiguredValuesFileCount === 0) {
    return buildSkipped({
      status: "not_run",
      label: "真实值片段文件未配置，安全审计未执行",
      nextAction: "先配置单个安全未跟踪真实值片段文件，重启 API 后再执行审计和 dry-run。",
    });
  }
  if (normalizedConfiguredValuesFileCount !== 1) {
    return buildSkipped({
      status: "not_run",
      label: "真实值片段文件数量不唯一，安全审计未执行",
      nextAction: "只保留一个安全未跟踪真实值片段文件，重启 API 后再执行审计。",
    });
  }

  try {
    const audit = buildProductionEnvFileAuditReport({ envFiles });
    const auditSummary = isPlainServerObject(audit.summary) ? audit.summary : {};
    const ready = audit.ready === true;
    const status = ready ? "passed" : "blocked";
    const blockingItems = sanitizeV1ProductionEnvValuesFileAuditBlockingItems(audit);
    return {
      available: true,
      status,
      ready,
      summary: {
        ...baseSummary,
        label:
          cleanServerText(auditSummary.label) ||
          (ready ? "真实值片段文件安全审计通过" : "真实值片段文件安全审计未通过"),
        auditStatus: status,
        auditReady: ready,
        auditExecuted: true,
        auditReportAvailable: true,
        fileCount: normalizeV1NonNegativeInteger(auditSummary.fileCount, normalizedConfiguredValuesFileCount),
        blockingCount: normalizeV1NonNegativeInteger(auditSummary.blockingCount),
        warningCount: normalizeV1NonNegativeInteger(auditSummary.warningCount),
        passedCount: normalizeV1NonNegativeInteger(auditSummary.passedCount),
        placeholderAssignmentCount: normalizeV1NonNegativeInteger(auditSummary.placeholderAssignmentCount),
        uncommentedAssignmentCount: normalizeV1NonNegativeInteger(auditSummary.uncommentedAssignmentCount),
        sensitiveVariableNameCount: normalizeV1NonNegativeInteger(auditSummary.sensitiveVariableNameCount),
        crossFileDuplicateVariableCount: normalizeV1NonNegativeInteger(auditSummary.crossFileDuplicateVariableCount),
      },
      blockingItems,
      nextAction:
        ready
          ? "真实值片段文件安全审计已通过，可继续执行 dry-run。"
          : audit.nextActions?.map(cleanServerText).filter(Boolean)[0] ||
            "先修正真实值片段文件安全审计阻塞项，再重启 API 后重试。",
      safeguards: buildV1ProductionEnvValuesFileAuditSafeguards({ ready, status }),
    };
  } catch {
    const status = "error";
    return {
      available: true,
      status,
      ready: false,
      summary: {
        ...baseSummary,
        label: "真实值片段文件安全审计失败",
        auditStatus: status,
        auditReady: false,
        auditExecuted: true,
        auditReportAvailable: false,
        blockingCount: 1,
      },
      blockingItems: [
        {
          key: "production-env-values-file-audit-error",
          label: "真实值片段文件不可审计",
          status: "blocked",
          detail: "服务端配置的真实值片段文件缺失、不可读或格式不符合安全审计要求。",
          nextAction: "检查真实值片段文件是否存在、权限是否正确、是否位于安全未跟踪路径；不要把真实路径或 env 值传给前端。",
        },
      ],
      nextAction: "检查真实值片段文件是否存在、权限是否正确、是否位于安全未跟踪路径后重试。",
      safeguards: buildV1ProductionEnvValuesFileAuditSafeguards({ ready: false, status }),
    };
  }
}

function buildV1ProductionEnvValuesFileAuditSafeguards({ ready = false, status = "not_run" } = {}) {
  return {
    nonMutating: true,
    status: cleanServerText(status) || "not_run",
    ready: ready === true,
    valuesFilePathExposed: false,
    pathValueExposed: false,
    envValuesIncluded: false,
    secretValuesIncluded: false,
    connectionStringIncluded: false,
    objectStorageEndpointIncluded: false,
    objectStorageBucketIncluded: false,
    commandValuesIncluded: false,
    spoolPathIncluded: false,
    tokenIncluded: false,
    localPathExposed: false,
    commentsCopied: false,
    rawLineContentCopied: false,
    productionEnvFileMutated: false,
    businessDataMutated: false,
  };
}

function sanitizeV1ProductionEnvValuesFileAuditBlockingItems(audit = {}) {
  const findings = Array.isArray(audit.blockingFindings) ? audit.blockingFindings : [];
  return findings
    .map((finding, index) => ({
      key: cleanServerText(finding.key) || `production-env-values-file-audit-${index + 1}`,
      label: sanitizeV1RoleTaskActionText(finding.label) || "真实值片段安全审计阻塞",
      status: cleanServerText(finding.status) || "blocked",
      detail: sanitizeV1RoleTaskActionText(finding.detail),
      nextAction:
        sanitizeV1RoleTaskActionText(finding.nextAction) ||
        audit.nextActions?.map(cleanServerText).filter(Boolean)[0] ||
        "修正真实值片段文件安全审计阻塞项后重试。",
    }))
    .filter((item) => item.label)
    .slice(0, 6);
}

function buildV1ProductionEnvSetupTargetStatus() {
  const resolution = resolveV1ProductionEnvSetupSafeEnvFileForIntakeLivePrecheck();
  const blockingItems = Array.isArray(resolution.blockingItems)
    ? resolution.blockingItems.map(sanitizeV1ProductionFirstStageValuesDryRunBlockingItem).filter(Boolean).slice(0, 6)
    : [];
  const ready = resolution.ready === true;
  const envFileCount = normalizeV1NonNegativeInteger(resolution.envFileCount);
  const status = ready ? "configured" : cleanServerText(resolution.status) || "blocked";
  const label = ready
    ? "production env setup 目标 env 已就绪"
    : "production env setup 目标 env 未就绪";
  const nextAction =
    cleanServerText(resolution.nextAction) ||
    (ready
      ? "已确认 production env setup 目标安全 env 文件，可在正式合并开关和真实值片段均就绪后写入。"
      : "先重新运行 production env setup，确认目标安全 env 文件存在、已 git ignore、未跟踪且权限为 600。");
  return {
    available: true,
    status,
    ready,
    summary: {
      label,
      setupReportAvailable: resolution.setupReportAvailable === true,
      setupReady: resolution.setupReady === true,
      envFileCount,
      targetEnvFileConfigured: ready || envFileCount > 0,
      targetEnvFromProductionSetup: true,
      targetEnvFilePathExposed: false,
    },
    blockingItems,
    nextAction,
    safeguards: {
      targetEnvFilePathExposed: false,
      localPathExposed: false,
      envValuesIncluded: false,
      secretValuesIncluded: false,
      targetEnvComesFromProductionSetup: true,
      targetSetupReportIncluded: resolution.setupReportAvailable === true,
    },
  };
}

function buildV1ProductionEnvValuesApplyGateStatus({
  productionEnvIntakeVerification = null,
  productionFirstStageExecution = null,
} = {}) {
  const valuesFileConfig = getConfiguredV1ProductionEnvValuesFileConfig();
  const configuredValuesFileCount = normalizeV1NonNegativeInteger(valuesFileConfig.configuredEnvFileCount);
  const configuredSourceVariableCount = normalizeV1NonNegativeInteger(valuesFileConfig.configuredSourceVariableCount);
  const applyEnabled = isV1ProductionEnvValuesApplyEnabled();
  const targetSetupStatus = buildV1ProductionEnvSetupTargetStatus();
  const targetSetupReady = targetSetupStatus.ready === true;
  const targetSetupSummary = targetSetupStatus.summary || {};
  const valuesFileAuditStatus = buildV1ProductionEnvValuesFileAuditStatus({
    valuesFileConfig,
    configuredValuesFileCount,
  });
  const valuesFileAuditReady = valuesFileAuditStatus.ready === true;
  const minimumFillStatus = buildV1ProductionEnvValuesMinimumFillStatus(productionEnvIntakeVerification);
  const dryRunProofStatus = buildV1ProductionEnvValuesDryRunProofStatus(
    productionFirstStageExecution,
    minimumFillStatus,
  );
  const dryRunProofReady = dryRunProofStatus.ready === true;
  const dryRunProofMatchesCurrentMinimumPath = dryRunProofStatus.dryRunMatchesCurrentMinimumPath === true;
  const ready =
    applyEnabled === true &&
    configuredValuesFileCount === 1 &&
    targetSetupReady &&
    valuesFileAuditReady &&
    dryRunProofReady;
  const status =
    ready
      ? "enabled"
      : applyEnabled !== true
        ? "disabled"
        : configuredValuesFileCount > 1
          ? "multiple_configured"
          : configuredValuesFileCount === 0
            ? "not_configured"
            : !valuesFileAuditReady
              ? "audit_blocked"
              : !targetSetupReady
                ? "target_not_ready"
                : dryRunProofStatus.status === "stale_or_expired"
                  ? "dry_run_expired"
                : dryRunProofStatus.status === "stale_or_mismatched"
                  ? "dry_run_stale_or_mismatched"
                  : isV1ProductionEnvValuesDryRunProofFileBindingBlockedStatus(dryRunProofStatus.status)
                    ? "dry_run_file_binding_blocked"
                  : !dryRunProofReady
                    ? "dry_run_not_ready"
                  : "target_not_ready";
  const serverConfigGuidance = buildV1ProductionFirstStageValuesApplyServerConfigGuidance({
    valuesFileConfig,
    configuredValuesFileCount,
    ready,
    status,
    applyEnabled,
    targetSetupStatus,
    valuesFileAuditStatus,
    productionEnvMinimumFillStatus: minimumFillStatus,
    productionEnvValuesDryRunProofStatus: dryRunProofStatus,
  });
  const label =
    ready
      ? "正式合并开关已启用，真实值 dry-run 证明、片段审计和目标 env 均已就绪"
      : applyEnabled !== true
        ? "正式合并开关未启用"
        : configuredValuesFileCount > 1
          ? "正式合并前真实值片段来源不唯一"
          : configuredValuesFileCount === 0
            ? "正式合并开关已启用，但真实值片段未配置"
            : !valuesFileAuditReady
              ? "正式合并开关已启用，但真实值片段安全审计未通过"
              : !targetSetupReady
                ? "正式合并开关已启用，但目标生产 env 安全草稿未就绪"
              : dryRunProofStatus.status === "stale_or_expired"
                ? "正式合并开关已启用，但最近真实值 dry-run 证明已过期"
                : dryRunProofStatus.status === "stale_or_mismatched"
                  ? "正式合并开关已启用，但最近真实值 dry-run 未匹配当前最小补值路径"
                : isV1ProductionEnvValuesDryRunProofFileBindingBlockedStatus(dryRunProofStatus.status)
                  ? "正式合并开关已启用，但最近真实值 dry-run 片段指纹绑定未通过"
                : "正式合并开关已启用，但最近真实值 dry-run 证明未通过";
  const nextAction =
    ready
      ? "真实值 dry-run 通过并由负责人确认后，可执行正式合并真实值。"
      : applyEnabled !== true
        ? "先完成真实值 dry-run；负责人确认后在 API 进程配置 ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED=true，重启 API 后再正式合并。"
        : configuredValuesFileCount > 1
          ? "只保留一个安全未跟踪真实值片段来源，重启 API 后再执行正式合并。"
          : configuredValuesFileCount === 0
            ? "在 API 进程配置 ERP_V1_PRODUCTION_ENV_VALUES_FILE，指向安全未跟踪真实值片段并重启 API。"
            : !valuesFileAuditReady
              ? valuesFileAuditStatus.nextAction || "先修正真实值片段文件安全审计阻塞项，再重启 API 后执行正式合并。"
              : !targetSetupReady
                ? targetSetupStatus.nextAction || "先重新运行 production env setup，确认目标安全 env 文件 ready 后再执行正式合并。"
                : dryRunProofStatus.nextAction || "先完成真实值 dry-run 并刷新上线状态，再执行正式合并。";

  return {
    available: true,
    status,
    ready,
    summary: {
      label,
      applyEnabled,
      applyEnableEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED",
      configuredValuesFileCount,
      valuesFilePathConfigured: configuredValuesFileCount > 0,
      selectedEnvVariable: cleanServerText(valuesFileConfig.selectedEnvVariable),
      selectedEnvVariableLabel: cleanServerText(valuesFileConfig.selectedEnvVariableLabel) || "未配置",
      selectedSourceKind: cleanServerText(valuesFileConfig.selectedSourceKind) || "none",
      fallbackSourceUsed: valuesFileConfig.fallbackSourceUsed === true,
      configuredSourceVariableCount,
      sourceStatuses: serverConfigGuidance.sourceStatuses,
      primaryEnvVariable: serverConfigGuidance.primaryEnvVariable,
      fallbackEnvVariables: serverConfigGuidance.fallbackEnvVariables,
      requestBodyIgnored: true,
      acceptsFrontendPath: false,
      valuesFilePathAccepted: false,
      valuesFilePathExposed: false,
      targetEnvFromProductionSetup: true,
      targetEnvFilePathExposed: false,
      targetSetupStatus: targetSetupStatus.status,
      targetSetupReady,
      targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
      targetSetupEnvFileCount: normalizeV1NonNegativeInteger(targetSetupSummary.envFileCount),
      targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
      valuesFileAuditStatus: valuesFileAuditStatus.status,
      valuesFileAuditReady,
      valuesFileAuditExecuted: valuesFileAuditStatus.summary.auditExecuted === true,
      valuesFileAuditBlockingCount: normalizeV1NonNegativeInteger(valuesFileAuditStatus.summary.blockingCount),
      valuesFileAuditWarningCount: normalizeV1NonNegativeInteger(valuesFileAuditStatus.summary.warningCount),
      valuesFileAuditPathExposed: false,
      valuesFileAuditValuesIncluded: false,
      dryRunProofStatus: dryRunProofStatus.status,
      dryRunProofReady,
      dryRunProofIncluded: dryRunProofStatus.included === true,
      dryRunProofStatusLabel: dryRunProofStatus.statusLabel,
      dryRunProofFresh: dryRunProofStatus.fresh === true,
      dryRunProofFreshnessStatus: cleanServerText(dryRunProofStatus.freshnessStatus),
      dryRunProofFreshnessLabel: cleanServerText(dryRunProofStatus.freshnessLabel),
      dryRunProofMaxAgeHours: dryRunProofStatus.maxAgeHours,
      dryRunProofAgeHours: dryRunProofStatus.ageHours,
      dryRunProofExpiresAt: cleanServerText(dryRunProofStatus.expiresAt),
      dryRunProofRemainingHours: dryRunProofStatus.remainingHours,
      dryRunProofCheckedAtIncluded: dryRunProofStatus.checkedAtIncluded === true,
      dryRunProofCheckedAt: cleanServerText(dryRunProofStatus.checkedAt),
      dryRunProofMatchesCurrentMinimumPath,
      dryRunProofMinimumBlockingTargetSignatureIncluded:
        dryRunProofStatus.dryRunMinimumBlockingTargetSignatureIncluded === true,
      currentMinimumBlockingTargetSignatureIncluded:
        dryRunProofStatus.currentMinimumBlockingTargetSignatureIncluded === true,
      dryRunProofMinimumBlockingLabel: dryRunProofStatus.minimumBlockingLabel,
      dryRunProofMinimumBlockingTargetCount: dryRunProofStatus.minimumBlockingTargetCount,
      dryRunProofMinimumBlockingSatisfiedCount: dryRunProofStatus.minimumBlockingSatisfiedCount,
      dryRunProofMinimumBlockingMissingCount: dryRunProofStatus.minimumBlockingMissingCount,
      dryRunProofValuesFingerprintStatus: cleanServerText(dryRunProofStatus.valuesFingerprintStatus),
      dryRunProofValuesFingerprintStatusLabel: cleanServerText(dryRunProofStatus.valuesFingerprintStatusLabel),
      dryRunProofValuesFingerprintCompared: dryRunProofStatus.valuesFingerprintCompared === true,
      dryRunProofValuesFingerprintIncluded: dryRunProofStatus.valuesFingerprintIncluded === true,
      dryRunProofValuesFingerprintMatched: dryRunProofStatus.valuesFingerprintMatched === true,
      dryRunProofValuesFingerprintDigestExposed: false,
      dryRunProofValuesFingerprintValuesExposed: false,
      dryRunProofValuesFileUnchangedAfterProof: dryRunProofStatus.valuesFileUnchangedAfterProof === true,
      dryRunProofTargetEnvFileUnchangedAfterProof: dryRunProofStatus.targetEnvFileUnchangedAfterProof === true,
      dryRunProofNextAction: dryRunProofStatus.nextAction,
      intakeVerificationStatus: minimumFillStatus.intakeVerificationStatus,
      intakeVerificationReady: minimumFillStatus.intakeVerificationReady,
      intakeVerificationAvailable: minimumFillStatus.available,
      minimumBlockingReady: minimumFillStatus.minimumBlockingReady,
      minimumBlockingLabel: minimumFillStatus.minimumBlockingLabel,
      minimumBlockingTargetCount: minimumFillStatus.minimumBlockingTargetCount,
      minimumBlockingSatisfiedCount: minimumFillStatus.minimumBlockingSatisfiedCount,
      minimumBlockingMissingCount: minimumFillStatus.minimumBlockingMissingCount,
      minimumBlockingVariableRowCount: minimumFillStatus.minimumBlockingVariableRowCount,
      minimumBlockingAlternativeGroupCount: minimumFillStatus.minimumBlockingAlternativeGroupCount,
      minimumWarningLabel: minimumFillStatus.minimumWarningLabel,
      minimumWarningMissingCount: minimumFillStatus.minimumWarningMissingCount,
      fullIntakeConfiguredLabel: minimumFillStatus.fullIntakeConfiguredLabel,
      targetEnvFileMayBeMutated: ready,
      applyExecuted: false,
      productionEnvFileMutated: false,
      businessDataMutated: false,
      schemaMigrationApplyExecuted: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
    targetSetupStatus,
    valuesFileAuditStatus,
    dryRunProofStatus,
    serverConfigGuidance,
    nextAction,
    safeguards: {
      nonMutating: true,
      applyRequiresServerFlag: true,
      requestBodyIgnored: true,
      valuesFilePathAcceptedFromFrontend: false,
      valuesFilePathAcceptedFromRequest: false,
      valuesFilePathValueIncluded: false,
      valuesFileReadFromServerConfigOnly: true,
      sourceVariableNamesOnly: true,
      targetEnvFileComesFromProductionSetup: true,
      valuesFilePathExposed: false,
      targetEnvFilePathExposed: false,
      targetSetupReady,
      targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
      targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
      targetEnvFileMayBeMutated: ready,
      valuesFileAuditReady,
      valuesFileAuditStatus: valuesFileAuditStatus.status,
      valuesFileAuditPathExposed: false,
      valuesFileAuditValuesIncluded: false,
      dryRunProofReady,
      dryRunProofIncluded: dryRunProofStatus.included === true,
      dryRunProofStatus: dryRunProofStatus.status,
      dryRunProofValuesIncluded: false,
      dryRunProofFresh: dryRunProofStatus.fresh === true,
      dryRunProofMaxAgeHours: dryRunProofStatus.maxAgeHours,
      dryRunProofExpiresAt: cleanServerText(dryRunProofStatus.expiresAt),
      dryRunProofRemainingHours: dryRunProofStatus.remainingHours,
      dryRunProofCheckedAtIncluded: dryRunProofStatus.checkedAtIncluded === true,
      dryRunProofMatchesCurrentMinimumPath,
      dryRunProofMinimumBlockingTargetSignatureIncluded:
        dryRunProofStatus.dryRunMinimumBlockingTargetSignatureIncluded === true,
      currentMinimumBlockingTargetSignatureIncluded:
        dryRunProofStatus.currentMinimumBlockingTargetSignatureIncluded === true,
      dryRunProofMinimumBlockingTargetCount: dryRunProofStatus.minimumBlockingTargetCount,
      dryRunProofMinimumBlockingMissingCount: dryRunProofStatus.minimumBlockingMissingCount,
      dryRunProofValuesFingerprintCompared: dryRunProofStatus.valuesFingerprintCompared === true,
      dryRunProofValuesFingerprintIncluded: dryRunProofStatus.valuesFingerprintIncluded === true,
      dryRunProofValuesFingerprintMatched: dryRunProofStatus.valuesFingerprintMatched === true,
      dryRunProofValuesFingerprintDigestExposed: false,
      dryRunProofValuesFingerprintValuesExposed: false,
      dryRunProofValuesFileUnchangedAfterProof: dryRunProofStatus.valuesFileUnchangedAfterProof === true,
      dryRunProofTargetEnvFileUnchangedAfterProof: dryRunProofStatus.targetEnvFileUnchangedAfterProof === true,
      minimumBlockingReady: minimumFillStatus.minimumBlockingReady,
      minimumBlockingTargetCount: minimumFillStatus.minimumBlockingTargetCount,
      minimumBlockingMissingCount: minimumFillStatus.minimumBlockingMissingCount,
      applyExecuted: false,
      productionEnvFileMutated: false,
      businessDataMutated: false,
      schemaMigrationApplyExecuted: false,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      envValuesIncluded: false,
      secretValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageEndpointIncluded: false,
      objectStorageBucketIncluded: false,
      commandValuesIncluded: false,
      localPathExposed: false,
      declaresFullV1Complete: false,
    },
  };
}

function buildV1ProductionFirstStageValuesApplyLiveRunBody({
  operatorId,
  checkedAt,
  status,
  ready,
  applyEnabled = false,
  report = {},
  valuesFileConfig = {},
  configuredValuesFileCount = 0,
  targetSetupStatus = null,
  valuesFileAuditStatus = null,
  dryRunProofStatus = null,
  blockingItems = [],
  nextAction = "",
  error = null,
} = {}) {
  const applyReport = sanitizeV1ProductionEnvValuesApplyReport(report);
  const resolvedTargetSetupStatus =
    isPlainServerObject(targetSetupStatus) && targetSetupStatus.available === true
      ? targetSetupStatus
      : buildV1ProductionEnvSetupTargetStatus();
  const targetSetupSummary = isPlainServerObject(resolvedTargetSetupStatus.summary)
    ? resolvedTargetSetupStatus.summary
    : {};
  const targetSetupReady = resolvedTargetSetupStatus.ready === true;
  const resolvedValuesFileAuditStatus =
    isPlainServerObject(valuesFileAuditStatus) && valuesFileAuditStatus.available === true
      ? valuesFileAuditStatus
      : buildV1ProductionEnvValuesFileAuditStatus({ valuesFileConfig, configuredValuesFileCount });
  const valuesFileAuditSummary = isPlainServerObject(resolvedValuesFileAuditStatus.summary)
    ? resolvedValuesFileAuditStatus.summary
    : {};
  const valuesFileAuditReady = resolvedValuesFileAuditStatus.ready === true;
  const normalizedConfiguredValuesFileCount = normalizeV1NonNegativeInteger(configuredValuesFileCount);
  const resolvedDryRunProofStatus =
    isPlainServerObject(dryRunProofStatus) && dryRunProofStatus.status
      ? dryRunProofStatus
      : buildV1ProductionEnvValuesDryRunProofStatus(
          readV1GoLiveStatusArtifacts().productionFirstStageExecution.value,
          null,
          {
            valuesFileConfig,
            configuredValuesFileCount,
            checkFileBinding: normalizeV1NonNegativeInteger(configuredValuesFileCount) === 1,
          },
        );
  const dryRunProofReady = resolvedDryRunProofStatus.ready === true;
  const sourceStatuses = sanitizeV1ProductionEnvFileConfigSourceStatuses(valuesFileConfig);
  const selectedEnvVariable = cleanServerText(valuesFileConfig.selectedEnvVariable);
  const selectedEnvVariableLabel = cleanServerText(valuesFileConfig.selectedEnvVariableLabel) || "未配置";
  const selectedSourceKind = cleanServerText(valuesFileConfig.selectedSourceKind) || "none";
  const configuredSourceVariableCount = normalizeV1NonNegativeInteger(valuesFileConfig.configuredSourceVariableCount);
  const sanitizedBlockingItems = Array.isArray(blockingItems)
    ? blockingItems.map(sanitizeV1ProductionFirstStageValuesDryRunBlockingItem).filter(Boolean)
    : [];
  const resultStatus = cleanServerText(status) || applyReport.status || (ready === true ? "ready" : "blocked");
  const applied = applyReport.targetEnvFile.applied === true;
  const targetEnvFileMayBeMutated =
    applyEnabled === true &&
    normalizedConfiguredValuesFileCount === 1 &&
    targetSetupReady &&
    valuesFileAuditReady &&
    dryRunProofReady;
  const blockingCount = sanitizedBlockingItems.length + applyReport.blockingFindings.length;
  const label =
    ready === true
      ? "第一阶段真实值已正式合并"
      : resultStatus === "disabled"
        ? "真实值正式合并未启用"
        : resultStatus === "not_configured"
          ? "服务端真实值片段未配置"
          : resultStatus === "audit_blocked"
            ? "真实值片段安全审计未通过"
          : resultStatus === "target_not_ready"
            ? "目标生产 env 安全草稿未就绪"
            : resultStatus === "dry_run_expired"
              ? "最近真实值 dry-run 证明已过期"
            : resultStatus === "dry_run_not_ready"
              ? "最近真实值 dry-run 证明未通过"
            : resultStatus === "dry_run_file_binding_blocked"
              ? "最近真实值 dry-run 片段指纹绑定未通过"
            : resultStatus === "error"
              ? "真实值正式合并失败"
              : applied
                ? "真实值已合并，后续门禁仍需处理"
                : "真实值正式合并未完成";
  const resolvedNextAction =
    cleanServerText(nextAction) ||
    applyReport.nextActions[0] ||
    (ready === true
      ? "用已合并的安全 env 文件重启生产 API，并继续第一阶段持久化留证。"
      : "先完成 dry-run、启用服务端正式合并开关并补齐安全真实值片段后重试。");
  const body = {
    version: "p0-v1-production-first-stage-values-apply-live-run-v1",
    scope: "v1_production_first_stage_values_apply_live_run",
    status: resultStatus,
    ready: ready === true,
    checkedAt: applyReport.checkedAt || checkedAt || new Date().toISOString(),
    operatorId,
    summary: {
      label,
      applyEnabled: applyEnabled === true,
      applyEnableEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED",
      configuredValuesFileCount: normalizedConfiguredValuesFileCount,
      valuesFilePathConfigured: normalizedConfiguredValuesFileCount > 0,
      selectedEnvVariable,
      selectedEnvVariableLabel,
      selectedSourceKind,
      fallbackSourceUsed: valuesFileConfig.fallbackSourceUsed === true,
      configuredSourceVariableCount,
      sourceStatuses,
      requestBodyIgnored: true,
      valuesFilePathAccepted: false,
      valuesFilePathExposed: false,
      targetEnvFromProductionSetup: true,
      targetEnvFilePathExposed: false,
      targetSetupStatus: resolvedTargetSetupStatus.status,
      targetSetupReady,
      targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
      targetSetupEnvFileCount: normalizeV1NonNegativeInteger(targetSetupSummary.envFileCount),
      targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
      valuesFileAuditStatus: resolvedValuesFileAuditStatus.status,
      valuesFileAuditReady,
      valuesFileAuditExecuted: valuesFileAuditSummary.auditExecuted === true,
      valuesFileAuditBlockingCount: normalizeV1NonNegativeInteger(valuesFileAuditSummary.blockingCount),
      valuesFileAuditWarningCount: normalizeV1NonNegativeInteger(valuesFileAuditSummary.warningCount),
      valuesFileAuditPathExposed: false,
      valuesFileAuditValuesIncluded: false,
      dryRunProofStatus: resolvedDryRunProofStatus.status,
      dryRunProofReady,
      dryRunProofIncluded: resolvedDryRunProofStatus.included === true,
      dryRunProofStatusLabel: resolvedDryRunProofStatus.statusLabel,
      dryRunProofFresh: resolvedDryRunProofStatus.fresh === true,
      dryRunProofFreshnessStatus: cleanServerText(resolvedDryRunProofStatus.freshnessStatus),
      dryRunProofFreshnessLabel: cleanServerText(resolvedDryRunProofStatus.freshnessLabel),
      dryRunProofMaxAgeHours: resolvedDryRunProofStatus.maxAgeHours,
      dryRunProofAgeHours: resolvedDryRunProofStatus.ageHours,
      dryRunProofExpiresAt: cleanServerText(resolvedDryRunProofStatus.expiresAt),
      dryRunProofRemainingHours: resolvedDryRunProofStatus.remainingHours,
      dryRunProofCheckedAtIncluded: resolvedDryRunProofStatus.checkedAtIncluded === true,
      dryRunProofCheckedAt: cleanServerText(resolvedDryRunProofStatus.checkedAt),
      dryRunProofMatchesCurrentMinimumPath:
        resolvedDryRunProofStatus.dryRunMatchesCurrentMinimumPath === true,
      dryRunProofMinimumBlockingTargetSignatureIncluded:
        resolvedDryRunProofStatus.dryRunMinimumBlockingTargetSignatureIncluded === true,
      currentMinimumBlockingTargetSignatureIncluded:
        resolvedDryRunProofStatus.currentMinimumBlockingTargetSignatureIncluded === true,
      dryRunProofMinimumBlockingLabel: resolvedDryRunProofStatus.minimumBlockingLabel,
      dryRunProofMinimumBlockingTargetCount: resolvedDryRunProofStatus.minimumBlockingTargetCount,
      dryRunProofMinimumBlockingSatisfiedCount: resolvedDryRunProofStatus.minimumBlockingSatisfiedCount,
      dryRunProofMinimumBlockingMissingCount: resolvedDryRunProofStatus.minimumBlockingMissingCount,
      dryRunProofValuesFingerprintStatus: cleanServerText(resolvedDryRunProofStatus.valuesFingerprintStatus),
      dryRunProofValuesFingerprintStatusLabel: cleanServerText(
        resolvedDryRunProofStatus.valuesFingerprintStatusLabel,
      ),
      dryRunProofValuesFingerprintCompared: resolvedDryRunProofStatus.valuesFingerprintCompared === true,
      dryRunProofValuesFingerprintIncluded: resolvedDryRunProofStatus.valuesFingerprintIncluded === true,
      dryRunProofValuesFingerprintMatched: resolvedDryRunProofStatus.valuesFingerprintMatched === true,
      dryRunProofValuesFingerprintDigestExposed: false,
      dryRunProofValuesFingerprintValuesExposed: false,
      dryRunProofValuesFileUnchangedAfterProof:
        resolvedDryRunProofStatus.valuesFileUnchangedAfterProof === true,
      dryRunProofTargetEnvFileUnchangedAfterProof:
        resolvedDryRunProofStatus.targetEnvFileUnchangedAfterProof === true,
      dryRunProofNextAction: resolvedDryRunProofStatus.nextAction,
      targetEnvFileMayBeMutated,
      productionEnvFileMutated: applied,
      targetEnvChanged: applyReport.targetEnvFile.changed === true,
      targetFileMode0600: applyReport.safeguards.targetFileMode0600 === true,
      appliedVariableCount: applyReport.summary.appliedVariableCount,
      applicableValueCount: applyReport.summary.applicableValueCount,
      blankSourceValueCount: applyReport.summary.blankSourceValueCount,
      unknownSourceVariableCount: applyReport.summary.unknownSourceVariableCount,
      setupReady: applyReport.summary.setupReady,
      envPreflightReady: applyReport.summary.envPreflightReady,
      envPreflightLabel: `${applyReport.summary.envPreflightPassedCount}/${applyReport.summary.envPreflightTotalCount}`,
      intakeVerificationReady: applyReport.summary.intakeVerificationReady,
      intakeVerificationBlockingCount: applyReport.summary.intakeVerificationBlockingCount,
      intakeVerificationWarningCount: applyReport.summary.intakeVerificationWarningCount,
      businessDataMutated: false,
      schemaMigrationApplyExecuted: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      blockingCount,
      blockerLabel: `${blockingCount} 项`,
      warningCount: applyReport.summary.warningCount,
    },
    applyReport,
    targetSetupStatus: resolvedTargetSetupStatus,
    valuesFileAuditStatus: resolvedValuesFileAuditStatus,
    dryRunProofStatus: resolvedDryRunProofStatus,
    blockingItems: sanitizedBlockingItems,
    blockingFindings: applyReport.blockingFindings,
    warningFindings: applyReport.warningFindings,
    serverConfigGuidance: buildV1ProductionFirstStageValuesApplyServerConfigGuidance({
      valuesFileConfig,
      configuredValuesFileCount: normalizedConfiguredValuesFileCount,
      ready: ready === true,
      status: resultStatus,
      applyEnabled,
      targetSetupStatus: resolvedTargetSetupStatus,
      valuesFileAuditStatus: resolvedValuesFileAuditStatus,
      productionEnvValuesDryRunProofStatus: resolvedDryRunProofStatus,
    }),
    nextActions: [resolvedNextAction, ...applyReport.nextActions].filter(Boolean).slice(0, 8),
    nextAction: resolvedNextAction,
    safeguards: {
      nonMutating: applied !== true,
      requestBodyIgnored: true,
      valuesFilePathAcceptedFromRequest: false,
      valuesFileReadFromServerConfigOnly: true,
      valuesFilePathExposed: false,
      targetEnvFilePathExposed: false,
      targetEnvComesFromProductionSetup: true,
      targetSetupReady,
      targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
      targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
      targetEnvFileMayBeMutated,
      valuesFileAuditReady,
      valuesFileAuditStatus: resolvedValuesFileAuditStatus.status,
      valuesFileAuditPathExposed: false,
      valuesFileAuditValuesIncluded: false,
      dryRunProofReady,
      dryRunProofIncluded: resolvedDryRunProofStatus.included === true,
      dryRunProofStatus: resolvedDryRunProofStatus.status,
      dryRunProofValuesIncluded: false,
      dryRunProofFresh: resolvedDryRunProofStatus.fresh === true,
      dryRunProofMaxAgeHours: resolvedDryRunProofStatus.maxAgeHours,
      dryRunProofExpiresAt: cleanServerText(resolvedDryRunProofStatus.expiresAt),
      dryRunProofRemainingHours: resolvedDryRunProofStatus.remainingHours,
      dryRunProofCheckedAtIncluded: resolvedDryRunProofStatus.checkedAtIncluded === true,
      dryRunProofMatchesCurrentMinimumPath:
        resolvedDryRunProofStatus.dryRunMatchesCurrentMinimumPath === true,
      dryRunProofMinimumBlockingTargetSignatureIncluded:
        resolvedDryRunProofStatus.dryRunMinimumBlockingTargetSignatureIncluded === true,
      currentMinimumBlockingTargetSignatureIncluded:
        resolvedDryRunProofStatus.currentMinimumBlockingTargetSignatureIncluded === true,
      dryRunProofValuesFingerprintCompared: resolvedDryRunProofStatus.valuesFingerprintCompared === true,
      dryRunProofValuesFingerprintIncluded: resolvedDryRunProofStatus.valuesFingerprintIncluded === true,
      dryRunProofValuesFingerprintMatched: resolvedDryRunProofStatus.valuesFingerprintMatched === true,
      dryRunProofValuesFingerprintDigestExposed: false,
      dryRunProofValuesFingerprintValuesExposed: false,
      dryRunProofValuesFileUnchangedAfterProof:
        resolvedDryRunProofStatus.valuesFileUnchangedAfterProof === true,
      dryRunProofTargetEnvFileUnchangedAfterProof:
        resolvedDryRunProofStatus.targetEnvFileUnchangedAfterProof === true,
      productionEnvFileMutated: applied,
      targetFileMode0600: applyReport.safeguards.targetFileMode0600 === true,
      rawCommandIncluded: false,
      rawCommandStdoutIncluded: false,
      rawCommandStderrIncluded: false,
      rawApplyReportIncluded: false,
      rawProductionEnvValuesFileIncluded: false,
      rawEnvFileIncluded: false,
      rawEnvLineIncluded: false,
      envValuesIncluded: false,
      secretValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageEndpointIncluded: false,
      objectStorageBucketIncluded: false,
      commandValuesIncluded: false,
      spoolPathIncluded: false,
      tokenIncluded: false,
      localPathExposed: false,
      businessDataMutated: false,
      schemaMigrationApplyExecuted: false,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      declaresFullV1Complete: false,
    },
  };
  return error ? { ...body, error } : body;
}

function buildV1ProductionFirstStageValuesApplyServerConfigGuidance({
  valuesFileConfig = {},
  configuredValuesFileCount = 0,
  ready = false,
  status = "disabled",
  applyEnabled = false,
  targetSetupStatus = null,
  valuesFileAuditStatus = null,
  productionEnvMinimumFillStatus = null,
  productionEnvValuesDryRunProofStatus = null,
} = {}) {
  const sourceStatuses = sanitizeV1ProductionEnvFileConfigSourceStatuses(valuesFileConfig);
  const selectedEnvVariable = cleanServerText(valuesFileConfig.selectedEnvVariable);
  const selectedSourceKind = cleanServerText(valuesFileConfig.selectedSourceKind) || "none";
  const selectedEnvVariableLabel = cleanServerText(valuesFileConfig.selectedEnvVariableLabel) || "未配置";
  const resolvedTargetSetupStatus =
    isPlainServerObject(targetSetupStatus) && targetSetupStatus.available === true
      ? targetSetupStatus
      : buildV1ProductionEnvSetupTargetStatus();
  const targetSetupSummary = isPlainServerObject(resolvedTargetSetupStatus.summary)
    ? resolvedTargetSetupStatus.summary
    : {};
  const normalizedConfiguredValuesFileCount = normalizeV1NonNegativeInteger(configuredValuesFileCount);
  const targetSetupReady = resolvedTargetSetupStatus.ready === true;
  const resolvedValuesFileAuditStatus =
    isPlainServerObject(valuesFileAuditStatus) && valuesFileAuditStatus.available === true
      ? valuesFileAuditStatus
      : buildV1ProductionEnvValuesFileAuditStatus({ valuesFileConfig, configuredValuesFileCount });
  const valuesFileAuditSummary = isPlainServerObject(resolvedValuesFileAuditStatus.summary)
    ? resolvedValuesFileAuditStatus.summary
    : {};
  const valuesFileAuditReady = resolvedValuesFileAuditStatus.ready === true;
  const minimumFillStatus = buildV1ProductionEnvValuesMinimumFillStatus(productionEnvMinimumFillStatus);
  const dryRunProofStatus = buildV1ProductionEnvValuesDryRunProofStatus(
    productionEnvValuesDryRunProofStatus,
    minimumFillStatus,
    {
      valuesFileConfig,
      configuredValuesFileCount: normalizedConfiguredValuesFileCount,
      checkFileBinding: normalizedConfiguredValuesFileCount === 1,
    },
  );
  const dryRunProofReady = dryRunProofStatus.ready === true;
  return {
    label: applyEnabled ? "正式合并开关已启用" : "正式合并开关未启用",
    status: applyEnabled ? "enabled" : "disabled",
    ready: ready === true,
    applyEnableEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED",
    applyEnabled: applyEnabled === true,
    primaryEnvVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
    fallbackEnvVariables: ["ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE", "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE"],
    selectedEnvVariable,
    selectedEnvVariableLabel,
    selectedSourceKind,
    fallbackSourceUsed: valuesFileConfig.fallbackSourceUsed === true,
    configuredSourceVariableCount: normalizeV1NonNegativeInteger(valuesFileConfig.configuredSourceVariableCount),
    sourceStatuses,
    configuredValuesFileCount: normalizedConfiguredValuesFileCount,
    targetSetupStatus: resolvedTargetSetupStatus,
    targetSetupReady,
    targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
    targetSetupEnvFileCount: normalizeV1NonNegativeInteger(targetSetupSummary.envFileCount),
    targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
    valuesFileAuditStatus: resolvedValuesFileAuditStatus.status,
    valuesFileAuditReady,
    valuesFileAuditExecuted: valuesFileAuditSummary.auditExecuted === true,
    valuesFileAuditBlockingCount: normalizeV1NonNegativeInteger(valuesFileAuditSummary.blockingCount),
    valuesFileAuditWarningCount: normalizeV1NonNegativeInteger(valuesFileAuditSummary.warningCount),
    valuesFileAuditPathExposed: false,
    valuesFileAuditValuesIncluded: false,
    dryRunProofStatus: dryRunProofStatus.status,
    dryRunProofReady,
    dryRunProofIncluded: dryRunProofStatus.included === true,
    dryRunProofStatusLabel: dryRunProofStatus.statusLabel,
    dryRunProofFresh: dryRunProofStatus.fresh === true,
    dryRunProofFreshnessStatus: cleanServerText(dryRunProofStatus.freshnessStatus),
    dryRunProofFreshnessLabel: cleanServerText(dryRunProofStatus.freshnessLabel),
    dryRunProofMaxAgeHours: dryRunProofStatus.maxAgeHours,
    dryRunProofAgeHours: dryRunProofStatus.ageHours,
    dryRunProofExpiresAt: cleanServerText(dryRunProofStatus.expiresAt),
    dryRunProofRemainingHours: dryRunProofStatus.remainingHours,
    dryRunProofCheckedAtIncluded: dryRunProofStatus.checkedAtIncluded === true,
    dryRunProofCheckedAt: cleanServerText(dryRunProofStatus.checkedAt),
    dryRunProofMatchesCurrentMinimumPath:
      dryRunProofStatus.dryRunMatchesCurrentMinimumPath === true,
    dryRunProofMinimumBlockingTargetSignatureIncluded:
      dryRunProofStatus.dryRunMinimumBlockingTargetSignatureIncluded === true,
    currentMinimumBlockingTargetSignatureIncluded:
      dryRunProofStatus.currentMinimumBlockingTargetSignatureIncluded === true,
    dryRunProofMinimumBlockingLabel: dryRunProofStatus.minimumBlockingLabel,
    dryRunProofMinimumBlockingTargetCount: dryRunProofStatus.minimumBlockingTargetCount,
    dryRunProofMinimumBlockingSatisfiedCount: dryRunProofStatus.minimumBlockingSatisfiedCount,
    dryRunProofMinimumBlockingMissingCount: dryRunProofStatus.minimumBlockingMissingCount,
    dryRunProofValuesFingerprintStatus: cleanServerText(dryRunProofStatus.valuesFingerprintStatus),
    dryRunProofValuesFingerprintStatusLabel: cleanServerText(dryRunProofStatus.valuesFingerprintStatusLabel),
    dryRunProofValuesFingerprintCompared: dryRunProofStatus.valuesFingerprintCompared === true,
    dryRunProofValuesFingerprintIncluded: dryRunProofStatus.valuesFingerprintIncluded === true,
    dryRunProofValuesFingerprintMatched: dryRunProofStatus.valuesFingerprintMatched === true,
    dryRunProofValuesFingerprintDigestExposed: false,
    dryRunProofValuesFingerprintValuesExposed: false,
    dryRunProofValuesFileUnchangedAfterProof: dryRunProofStatus.valuesFileUnchangedAfterProof === true,
    dryRunProofTargetEnvFileUnchangedAfterProof: dryRunProofStatus.targetEnvFileUnchangedAfterProof === true,
    dryRunProofNextAction: dryRunProofStatus.nextAction,
    intakeVerificationStatus: minimumFillStatus.intakeVerificationStatus,
    intakeVerificationReady: minimumFillStatus.intakeVerificationReady,
    intakeVerificationAvailable: minimumFillStatus.available,
    minimumBlockingReady: minimumFillStatus.minimumBlockingReady,
    minimumBlockingLabel: minimumFillStatus.minimumBlockingLabel,
    minimumBlockingTargetCount: minimumFillStatus.minimumBlockingTargetCount,
    minimumBlockingSatisfiedCount: minimumFillStatus.minimumBlockingSatisfiedCount,
    minimumBlockingMissingCount: minimumFillStatus.minimumBlockingMissingCount,
    minimumBlockingVariableRowCount: minimumFillStatus.minimumBlockingVariableRowCount,
    minimumBlockingAlternativeGroupCount: minimumFillStatus.minimumBlockingAlternativeGroupCount,
    minimumWarningLabel: minimumFillStatus.minimumWarningLabel,
    minimumWarningMissingCount: minimumFillStatus.minimumWarningMissingCount,
    fullIntakeConfiguredLabel: minimumFillStatus.fullIntakeConfiguredLabel,
    acceptsFrontendPath: false,
    pathValueExposed: false,
    targetEnvFilePathExposed: false,
    restartRequired: true,
    currentApplyStatus: cleanServerText(status) || "unknown",
    steps: [
      "先在上线状态页或命令行完成真实值 dry-run，并确认最近第一阶段 latest 已纳入该 dry-run 证明。",
      "由技术/管理在 API 进程环境中配置 ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED=true；默认关闭时不会写目标 env。",
      "确保 ERP_V1_PRODUCTION_ENV_VALUES_FILE 只指向一个安全未跟踪的真实值片段；不要从浏览器传路径或 env 值。",
      "确认 production env setup latest 已 ready，且目标安全 env 文件已 git ignore、未跟踪、权限为 600。",
      "确认最近真实值 dry-run 证明仍在有效期内；默认超过 24 小时必须重新 dry-run。",
      "重启 API 后执行正式合并；合并只写 production env setup 的目标安全 env 草稿，不执行迁移、不刷新候选、不写业务数据。",
    ],
    verificationActions: [
      "node scripts/run-v1-production-env-intake-apply.mjs --values-env-file <secure-values-env-fragment> --json",
      "POST /api/system/v1-production-first-stage-values-apply/live-run",
    ],
    safeguards: {
      applyRequiresServerFlag: true,
      valuesFilePathAcceptedFromFrontend: false,
      valuesFilePathValueIncluded: false,
      targetEnvFileComesFromProductionSetup: true,
      targetSetupReady,
      targetSetupReportAvailable: targetSetupSummary.setupReportAvailable === true,
      targetEnvFileConfigured: targetSetupSummary.targetEnvFileConfigured === true,
      targetEnvFilePathExposed: false,
      valuesFileAuditReady,
      valuesFileAuditStatus: resolvedValuesFileAuditStatus.status,
      valuesFileAuditPathExposed: false,
      valuesFileAuditValuesIncluded: false,
      dryRunProofReady,
      dryRunProofIncluded: dryRunProofStatus.included === true,
      dryRunProofStatus: dryRunProofStatus.status,
      dryRunProofValuesIncluded: false,
      dryRunProofFresh: dryRunProofStatus.fresh === true,
      dryRunProofMaxAgeHours: dryRunProofStatus.maxAgeHours,
      dryRunProofExpiresAt: cleanServerText(dryRunProofStatus.expiresAt),
      dryRunProofRemainingHours: dryRunProofStatus.remainingHours,
      dryRunProofCheckedAtIncluded: dryRunProofStatus.checkedAtIncluded === true,
      dryRunProofMatchesCurrentMinimumPath:
        dryRunProofStatus.dryRunMatchesCurrentMinimumPath === true,
      dryRunProofMinimumBlockingTargetSignatureIncluded:
        dryRunProofStatus.dryRunMinimumBlockingTargetSignatureIncluded === true,
      currentMinimumBlockingTargetSignatureIncluded:
        dryRunProofStatus.currentMinimumBlockingTargetSignatureIncluded === true,
      minimumBlockingReady: minimumFillStatus.minimumBlockingReady,
      minimumBlockingTargetCount: minimumFillStatus.minimumBlockingTargetCount,
      minimumBlockingMissingCount: minimumFillStatus.minimumBlockingMissingCount,
      sourceVariableNamesOnly: true,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      productionEnvFileMayBeMutated:
        applyEnabled === true &&
        normalizedConfiguredValuesFileCount === 1 &&
        targetSetupReady &&
        valuesFileAuditReady &&
        dryRunProofReady,
      businessDataMutated: false,
      schemaMigrationApplyExecuted: false,
    },
  };
}

function isV1ProductionEnvValuesApplyEnabled() {
  const value = cleanServerText(process.env.ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED).toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

function getConfiguredV1ProductionEnvApplicationFiles() {
  return getConfiguredV1ProductionEnvApplicationFileConfig({ allowAuditOnlyFallback: false }).envFiles;
}

function precheckSystemV1V2Boundary({ operatorId }) {
  return v1V2BoundaryService.precheck({ operatorId });
}

async function refreshSystemV1V2ScopeBrief({ operatorId }) {
  return v1V2BoundaryService.refreshScopeBrief({ operatorId });
}

function runV1V2ScopeBriefRefreshCommand({ artifactRoot }) {
  const args = [
    "scripts/run-v1-v2-scope-brief.mjs",
    "--completion-snapshot-json",
    join(artifactRoot, "v1-completion-snapshot", "latest.json"),
    "--output-dir",
    join(artifactRoot, "v1-v2-scope-brief"),
    "--json",
  ];
  return runNodeJsonCommand({
    args,
    timeoutMs: 30000,
    expectedScope: "v1_v2_scope_brief",
    timeoutMessage: "V1/V2 scope brief refresh command timed out.",
    invalidShapeMessage: "V1/V2 scope brief refresh command returned an unexpected shape.",
    nonZeroMessage: "V1/V2 scope brief refresh command exited non-zero.",
    invalidJsonMessage: "V1/V2 scope brief refresh command returned invalid JSON.",
    emptyJsonMessage: "V1/V2 scope brief refresh command returned no JSON.",
  });
}

async function precheckSystemV1ReleaseCandidateRefresh({ request, operatorId }) {
  return v1ReleaseCandidateRefreshPrecheckService.precheck({ request, operatorId });
}
async function refreshSystemV1ReleaseCandidate({ request, operatorId }) {
  return v1ReleaseCandidateRefreshService.refresh({ request, operatorId });
}
function runV1ReleaseCandidateRefreshCommand({
  artifactRoot,
  apiBaseUrl,
  operatorId,
  driverOperatorId,
  envFiles = [],
}) {
  const draftManifestPath = join(artifactRoot, "v1-field-evidence-intake", "filled-manifest.draft.json");
  const outputRoot = join(artifactRoot, "v1-go-live-suite");
  const args = [
    "scripts/run-v1-go-live-suite.mjs",
    "--refresh-release-candidate",
    "--field-evidence-manifest",
    draftManifestPath,
    "--output-root",
    outputRoot,
    "--canonical-root",
    artifactRoot,
    "--sync-canonical-latest",
    "--api-base-url",
    apiBaseUrl,
    "--operator-id",
    operatorId,
    "--driver-operator-id",
    driverOperatorId,
    "--json",
  ];
  for (const envFile of envFiles) args.push("--env-file", envFile);
  return runNodeJsonCommand({ args, timeoutMs: 120000 });
}

function runV1ProductionFirstStageExecutionCommand({ apiBaseUrl = "" } = {}) {
  const args = [
    "scripts/run-v1-production-first-stage-execution.mjs",
    "--use-production-env-setup-env-file",
    "--json",
  ];
  const normalizedApiBaseUrl = cleanServerText(apiBaseUrl);
  if (normalizedApiBaseUrl) args.push("--api-base-url", normalizedApiBaseUrl);
  return runNodeJsonCommand({
    args,
    timeoutMs: 120000,
    expectedScope: "v1_production_first_stage_execution",
    allowedExitCodes: [0, 2],
    timeoutMessage: "V1 production first-stage execution command timed out.",
    invalidShapeMessage: "V1 production first-stage execution command returned an unexpected shape.",
    nonZeroMessage: "V1 production first-stage execution command exited non-zero.",
    invalidJsonMessage: "V1 production first-stage execution command returned invalid JSON.",
    emptyJsonMessage: "V1 production first-stage execution command returned no JSON.",
  });
}

function runV1ProductionPersistenceEvidenceCommand() {
  return runNodeJsonCommand({
    args: [
      "scripts/run-v1-production-persistence-evidence.mjs",
      "--use-production-env-setup-env-file",
      "--json",
    ],
    timeoutMs: 120000,
    expectedScope: "v1_production_persistence_evidence",
    allowedExitCodes: [0, 2],
    timeoutMessage: "V1 production persistence evidence command timed out.",
    invalidShapeMessage: "V1 production persistence evidence command returned an unexpected shape.",
    nonZeroMessage: "V1 production persistence evidence command exited non-zero.",
    invalidJsonMessage: "V1 production persistence evidence command returned invalid JSON.",
    emptyJsonMessage: "V1 production persistence evidence command returned no JSON.",
  });
}

function runV1ProductionEnvSetupCommand() {
  return runNodeJsonCommand({
    args: ["scripts/run-v1-production-env-setup.mjs", "--json"],
    timeoutMs: 120000,
    expectedScope: "v1_production_env_setup",
    allowedExitCodes: [0, 2],
    timeoutMessage: "V1 production env setup command timed out.",
    invalidShapeMessage: "V1 production env setup command returned an unexpected shape.",
    nonZeroMessage: "V1 production env setup command exited non-zero.",
    invalidJsonMessage: "V1 production env setup command returned invalid JSON.",
    emptyJsonMessage: "V1 production env setup command returned no JSON.",
  });
}

function runV1ProductionFirstStageValuesDryRunCommand({ valuesFile }) {
  const args = [
    "scripts/run-v1-production-first-stage-execution.mjs",
    "--use-production-env-setup-env-file",
    "--production-env-values-file",
    valuesFile,
    "--production-env-values-dry-run",
    "--json",
  ];
  return runNodeJsonCommand({
    args,
    timeoutMs: 120000,
    expectedScope: "v1_production_first_stage_execution",
    allowedExitCodes: [0, 2],
    timeoutMessage: "V1 production first-stage values dry-run command timed out.",
    invalidShapeMessage: "V1 production first-stage values dry-run command returned an unexpected shape.",
    nonZeroMessage: "V1 production first-stage values dry-run command exited non-zero.",
    invalidJsonMessage: "V1 production first-stage values dry-run command returned invalid JSON.",
    emptyJsonMessage: "V1 production first-stage values dry-run command returned no JSON.",
  });
}

function runV1ProductionFirstStageValuesApplyCommand({ valuesFile }) {
  const args = [
    "scripts/run-v1-production-env-intake-apply.mjs",
    "--values-env-file",
    valuesFile,
    "--json",
  ];
  return runNodeJsonCommand({
    args,
    timeoutMs: 120000,
    expectedScope: "v1_production_env_real_value_intake_apply",
    allowedExitCodes: [0, 2],
    timeoutMessage: "V1 production first-stage values apply command timed out.",
    invalidShapeMessage: "V1 production first-stage values apply command returned an unexpected shape.",
    nonZeroMessage: "V1 production first-stage values apply command exited non-zero.",
    invalidJsonMessage: "V1 production first-stage values apply command returned invalid JSON.",
    emptyJsonMessage: "V1 production first-stage values apply command returned no JSON.",
  });
}

function runNodeJsonCommand({
  args,
  timeoutMs = 30000,
  expectedScope = "v1_go_live_suite",
  allowedExitCodes = [0],
  timeoutMessage = "V1 release candidate refresh command timed out.",
  nonZeroMessage = "V1 release candidate refresh command exited non-zero.",
  invalidShapeMessage = "V1 release candidate refresh command returned an unexpected shape.",
  invalidJsonMessage = "V1 release candidate refresh command returned invalid JSON.",
  emptyJsonMessage = "V1 release candidate refresh command returned no JSON.",
}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      rejectPromise(new Error(timeoutMessage));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const acceptedExitCodes = Array.isArray(allowedExitCodes) && allowedExitCodes.length ? allowedExitCodes : [0];
      if (!acceptedExitCodes.includes(code)) {
        rejectPromise(new Error(nonZeroMessage));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (expectedScope && parsed?.scope !== expectedScope) {
          rejectPromise(new Error(invalidShapeMessage));
          return;
        }
        resolvePromise(parsed);
      } catch {
        rejectPromise(new Error(stderr ? invalidJsonMessage : emptyJsonMessage));
      }
    });
  });
}

function getV1GoLiveArtifactRoot() {
  return process.env.ERP_V1_GO_LIVE_ARTIFACT_ROOT
    ? resolve(process.env.ERP_V1_GO_LIVE_ARTIFACT_ROOT)
    : join(process.cwd(), ".erp-local-storage");
}

function readV1GoLiveStatusArtifacts() {
  const artifactRoot = getV1GoLiveArtifactRoot();
  return {
    completionSnapshot: readV1GoLiveJsonArtifact({
      key: "completionSnapshot",
      label: "V1 完成度快照",
      filePath: join(artifactRoot, "v1-completion-snapshot", "latest.json"),
    }),
    goLiveSuite: readV1GoLiveJsonArtifact({
      key: "goLiveSuite",
      label: "V1 go-live suite",
      filePath: join(artifactRoot, "v1-go-live-suite", "latest.json"),
    }),
    releaseCandidate: readV1GoLiveJsonArtifact({
      key: "releaseCandidate",
      label: "V1 发布候选报告",
      filePath: join(artifactRoot, "v1-release-candidate", "latest.json"),
    }),
    fieldAcceptanceReport: readFirstV1GoLiveJsonArtifact({
      key: "fieldAcceptanceReport",
      label: "V1 现场验收报告",
      filePaths: [
        join(artifactRoot, "v1-release-candidate", "field-acceptance", "latest.json"),
        join(artifactRoot, "v1-field-acceptance", "latest.json"),
      ],
    }),
    unblockPlan: readFirstV1GoLiveJsonArtifact({
      key: "unblockPlan",
      label: "V1 最小解除阻塞清单",
      filePaths: [
        join(artifactRoot, "v1-go-live-suite", "v1-unblock-plan.json"),
        join(artifactRoot, "v1-go-live-handoff", "v1-unblock-plan.latest.json"),
      ],
    }),
    fieldEvidenceIntake: readV1GoLiveJsonArtifact({
      key: "fieldEvidenceIntake",
      label: "V1 现场证据采集包",
      filePath: join(artifactRoot, "v1-field-evidence-intake", "intake-manifest.json"),
    }),
    fieldEvidenceItemsCsv: readV1GoLiveTextArtifact({
      key: "fieldEvidenceItemsCsv",
      label: "V1 现场证据明细 CSV",
      filePath: join(artifactRoot, "v1-field-evidence-intake", "evidence-items.csv"),
    }),
    fieldEvidenceSignoffBoundaryCsv: readV1GoLiveTextArtifact({
      key: "fieldEvidenceSignoffBoundaryCsv",
      label: "V1 签字与边界 CSV",
      filePath: join(artifactRoot, "v1-field-evidence-intake", "signoff-boundary.csv"),
    }),
    fieldEvidenceIntakeRules: readV1GoLiveTextArtifact({
      key: "fieldEvidenceIntakeRules",
      label: "V1 现场证据填写规则",
      filePath: join(artifactRoot, "v1-field-evidence-intake", "intake-rules.zh-CN.md"),
    }),
    fieldEvidenceDraftManifest: readV1GoLiveJsonArtifact({
      key: "fieldEvidenceDraftManifest",
      label: "V1 现场证据回填草稿",
      filePath: join(artifactRoot, "v1-field-evidence-intake", "filled-manifest.draft.json"),
    }),
    onsiteTaskBoard: readV1GoLiveJsonArtifact({
      key: "onsiteTaskBoard",
      label: "V1 现场角色任务清单",
      filePath: join(artifactRoot, "v1-onsite-task-board", "latest.json"),
    }),
    v1V2Scope: readV1GoLiveJsonArtifact({
      key: "v1V2Scope",
      label: "V1/V2 差异摘要",
      filePath: join(artifactRoot, "v1-v2-scope-brief", "latest.json"),
    }),
    ownerDecisionBrief: readV1GoLiveJsonArtifact({
      key: "ownerDecisionBrief",
      label: "V1 负责人决策摘要",
      filePath: join(artifactRoot, "v1-owner-decision-brief", "latest.json"),
    }),
    productionEnvFillTemplate: readV1GoLiveTextArtifact({
      key: "productionEnvFillTemplate",
      label: "生产 env 安全填写草稿",
      filePath: join(artifactRoot, "v1-go-live-handoff", "production-env-fill-template.env.example"),
    }),
    productionEnvMinimumValuesFragmentTemplate: readV1GoLiveTextArtifact({
      key: "productionEnvMinimumValuesFragmentTemplate",
      label: "生产 env 最小真实值片段模板",
      filePath: join(artifactRoot, "v1-go-live-handoff", "production-env-minimum-values-fragment.template.env.example"),
    }),
    productionEnvIntakeVerification: readFirstV1GoLiveJsonArtifact({
      key: "productionEnvIntakeVerification",
      label: "生产 env 真实值校验",
      filePaths: [
        join(artifactRoot, "v1-production-env-intake-verify", "latest.json"),
        join(artifactRoot, "v1-go-live-handoff", "production-env-intake-verify.latest.json"),
      ],
    }),
    productionPersistenceEvidence: readFirstV1GoLiveJsonArtifact({
      key: "productionPersistenceEvidence",
      label: "生产持久化留证",
      filePaths: [
        join(artifactRoot, "v1-production-persistence-evidence", "latest.json"),
        join(artifactRoot, "v1-go-live-handoff", "production-persistence-evidence.latest.json"),
        join(artifactRoot, "v1-go-live-suite", "go-live-handoff", "production-persistence-evidence.latest.json"),
      ],
    }),
    productionFirstStageExecution: readFirstV1GoLiveJsonArtifact({
      key: "productionFirstStageExecution",
      label: "生产环境 / 持久化第一阶段执行",
      filePaths: [
        join(artifactRoot, "v1-production-first-stage-execution", "latest.json"),
        join(artifactRoot, "v1-go-live-handoff", "production-first-stage-execution.latest.json"),
        join(artifactRoot, "v1-go-live-suite", "go-live-handoff", "production-first-stage-execution.latest.json"),
      ],
    }),
  };
}

function readFirstV1GoLiveJsonArtifact({ key, label, filePaths }) {
  for (const filePath of filePaths) {
    const artifact = readV1GoLiveJsonArtifact({ key, label, filePath });
    if (artifact.status === "loaded") return artifact;
  }
  return {
    key,
    label,
    status: "missing",
    reason: "artifact_missing",
    value: null,
  };
}

function readV1GoLiveJsonArtifact({ key, label, filePath }) {
  if (!existsSync(filePath)) {
    return {
      key,
      label,
      status: "missing",
      reason: "artifact_missing",
      value: null,
    };
  }
  try {
    return {
      key,
      label,
      status: "loaded",
      reason: "",
      value: JSON.parse(readFileSync(filePath, "utf8")),
    };
  } catch {
    return {
      key,
      label,
      status: "invalid",
      reason: "artifact_json_invalid",
      value: null,
    };
  }
}

function readV1GoLiveTextArtifact({ key, label, filePath }) {
  if (!existsSync(filePath)) {
    return {
      key,
      label,
      status: "missing",
      reason: "artifact_missing",
      value: null,
    };
  }
  try {
    return {
      key,
      label,
      status: "loaded",
      reason: "",
      value: readFileSync(filePath, "utf8"),
    };
  } catch {
    return {
      key,
      label,
      status: "invalid",
      reason: "artifact_read_failed",
      value: null,
    };
  }
}

function normalizeV1NonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function isPlainServerObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function upsertFulfillmentDispatchRoute({ response, workspace, fulfillmentId, body, operatorId }) {
  const result = await fulfillmentActionCommandService.upsertDriverDispatch({
    workspace,
    fulfillmentId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}
async function confirmDriverDeliveryLoadedRoute({ response, workspace, fulfillmentId, body, operatorId }) {
  const result = await fulfillmentActionCommandService.confirmDriverDeliveryLoaded({
    workspace,
    fulfillmentId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function recordDriverDeviceFieldTestRoute({ response, workspace, fulfillmentId, body, operatorId }) {
  const access = fulfillmentActionCommandService.validateDriverTaskAccess(workspace, fulfillmentId, operatorId);
  if (access.errorResult?.notFound) return sendNotFound(response, access.errorResult.code);
  const before = access.fulfillment;
  if (body.fulfillmentId && body.fulfillmentId !== fulfillmentId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "fulfillmentId in path and body must match");
  }

  const record = normalizeDriverDeviceFieldTestApiRecord({
    ...body,
    fulfillmentId,
    orderLineId: body.orderLineId ?? before.orderLineId ?? before.lineId,
    driverId: operatorId,
    operatorId,
  });
  if (!record.recordId) {
    return sendBusinessError(response, 422, "DRIVER_DEVICE_FIELD_TEST_RECORD_REQUIRED", "Driver device field-test record is required.");
  }

  const after = {
    ...before,
    deviceFieldTestRecord: record,
    deviceFieldTestSummary: record.summary,
    deviceFieldTestCheckedAt: record.checkedAt,
  };
  const operationLog = buildOperationLog(workspace, {
    targetType: "fulfillment",
    targetId: fulfillmentId,
    action: "driver_record_device_field_test",
    operatorId,
    before: before.deviceFieldTestRecord ?? null,
    after: record,
    reason: record.summary?.label ?? "driver_device_field_test",
  });
  const transaction = await workspace.driverDeviceFieldTestRepository.recordDriverDeviceFieldTest({
    workspace,
    record,
    operationLog,
  });
  const task =
    (await workspace.driverDeliveryTaskReadRepository.getDriverDeliveryTask({
      workspace,
      fulfillmentId,
      operatorId,
    })) ??
    buildDriverDeliveryTask(workspace, findFulfillment(workspace, fulfillmentId) ?? after, {
      driverId: operatorId,
      sortSequence: getFulfillmentSortSequence(workspace, fulfillmentId),
    });
  return sendJson(response, 200, {
    fulfillmentId,
    record: transaction.record ?? record,
    summary: transaction.record?.summary ?? record.summary,
    task,
    operationLogId: transaction.operationLogId || operationLog.id,
  });
}

async function completeDriverDeliveryTaskRoute({ response, workspace, fulfillmentId, body, operatorId }) {
  const result = await fulfillmentActionCommandService.completeDriverDelivery({
    workspace,
    fulfillmentId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}
async function reportDriverDeliveryExceptionRoute({ response, workspace, fulfillmentId, body, operatorId }) {
  const result = await fulfillmentActionCommandService.reportDriverDeliveryException({
    workspace,
    fulfillmentId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}
async function reviewDeliveryEvidenceRoute({ response, workspace, fulfillmentId, body, operatorId }) {
  const result = await fulfillmentActionCommandService.reviewDeliveryEvidence({
    workspace,
    fulfillmentId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function createFulfillmentExceptionRoute({ response, workspace, fulfillmentId, body, operatorId }) {
  const result = await fulfillmentActionCommandService.createFulfillmentException({
    workspace,
    fulfillmentId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function printFulfillmentRoute({ response, workspace, fulfillmentId, body, operatorId }) {
  const result = await fulfillmentPrintCommandService.printFulfillment({ workspace, fulfillmentId, body, operatorId });
  if (result.notFound) return sendNotFound(response, "FULFILLMENT_NOT_FOUND");
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result);
}

async function upsertPrintDeviceRoute({ response, workspace, body, operatorId }) {
  const result = await printDeviceCommandService.upsertPrintDevice({ workspace, body, operatorId });
  return sendJson(response, 200, result);
}

async function updatePrintDeviceDriverModeRoute({ response, workspace, printDeviceId, body, operatorId }) {
  const result = await printDeviceCommandService.updatePrintDeviceDriverMode({
    workspace,
    printDeviceId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result);
}

async function listPrinterDeviceFieldTestsRoute({ response, workspace, printDeviceId, searchParams }) {
  const printDevice = await findPrintDevice(workspace, printDeviceId);
  if (!printDevice) return sendNotFound(response, "PRINT_DEVICE_NOT_FOUND");
  const items = await workspace.printerDeviceFieldTestRepository.listPrinterDeviceFieldTests({
    workspace,
    filters: {
      printDeviceId,
      printJobId: searchParams.get("printJobId"),
      documentType: searchParams.get("documentType"),
      operatorId: searchParams.get("operatorId"),
      limit: searchParams.get("pageSize"),
    },
  });
  return sendJson(response, 200, {
    ...paginate(items, searchParams),
    printDevice,
    latestRecord: items[0] ?? null,
  });
}

async function recordPrinterDeviceFieldTestRoute({ response, workspace, printDeviceId, body, operatorId }) {
  const result = await printDeviceCommandService.recordPrinterDeviceFieldTest({
    workspace,
    printDeviceId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result);
}

const printJobBusinessProjectionService = createPrintJobBusinessProjectionService({
  buildFulfillmentActionRecord,
  buildOperationLog,
});
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
const todoCommandService = createTodoCommandService({ buildOperationLog });
const inventoryCorrectionCommandService = createInventoryCorrectionCommandService({
  buildOperationLog,
  buildTodo,
  findAttachment: findAttachmentRecord,
  findInventoryItem,
  toInventoryQuantitySnapshot,
});
const inventoryReservationReleaseCommandService = createInventoryReservationReleaseCommandService({
  buildOperationLog,
  findInventoryItem,
  findInventoryReservation,
  isReleasableInventoryReservation,
  nextPlainId,
});
const v1FieldEvidenceStagingService = createV1FieldEvidenceStagingService();
const v1FieldEvidenceDraftService = createV1FieldEvidenceDraftService();
const v1ProductionEnvValuesApplyService = createV1ProductionEnvValuesApplyService({
  buildTargetSetupStatus: buildV1ProductionEnvSetupTargetStatus,
  readStatusArtifacts: readV1GoLiveStatusArtifacts,
  buildDryRunProofStatus: buildV1ProductionEnvValuesDryRunProofStatus,
  buildValuesFileAuditStatus: buildV1ProductionEnvValuesFileAuditStatus,
  runApplyCommand: runV1ProductionFirstStageValuesApplyCommand,
  buildResponseBody: buildV1ProductionFirstStageValuesApplyLiveRunBody,
});
const v1ProductionGoLivePrecheckService = createV1ProductionGoLivePrecheckService({
  buildRuntimeReadinessReport: buildCurrentV1RuntimeReadinessReport,
});
const v1ReleaseCandidateRefreshPrecheckService = createV1ReleaseCandidateRefreshPrecheckService({
  readStatusArtifacts: readV1GoLiveStatusArtifacts,
  precheckProductionGoLive: precheckSystemV1ProductionGoLive,
  sanitizeProductionGoLiveGate: sanitizeV1ProductionGoLiveGateForReleasePrecheck,
});
const v1ReleaseCandidateRefreshService = createV1ReleaseCandidateRefreshService({
  precheckRefresh: precheckSystemV1ReleaseCandidateRefresh,
  getArtifactRoot: getV1GoLiveArtifactRoot,
  resolveApiBaseUrl: resolveConfiguredOrLoopbackV1ApiBaseUrl,
  runRefreshCommand: runV1ReleaseCandidateRefreshCommand,
  getConfiguredEnvFiles: getConfiguredV1ProductionEnvApplicationFiles,
});
const v1V2BoundaryService = createV1V2BoundaryService({
  readStatusArtifacts: readV1GoLiveStatusArtifacts,
  getArtifactRoot: getV1GoLiveArtifactRoot,
  runScopeBriefRefreshCommand: runV1V2ScopeBriefRefreshCommand,
});
const productionFinishedGoodsPhotoCommandService = createProductionFinishedGoodsPhotoCommandService({
  buildOperationLog,
  buildPhotoSummary: buildFinishedGoodsPhotoSummary,
  buildCustomerNotificationTodo: buildFinishedGoodsCustomerNotificationTodo,
  buildPhotoRetakeTodo: buildFinishedGoodsPhotoRetakeTodo,
  findAttachment: findAttachmentRecord,
  findOrderLine,
  normalizeHistory: normalizeFinishedGoodsPhotoHistory,
  normalizeReviewStatus: normalizeFinishedGoodsPhotoReviewStatus,
});
const productionSchedulingCommandService = createProductionSchedulingCommandService({
  buildMachineQueueResponse: buildProductionMachineQueueResponse,
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
  findInventoryItem,
  findOrderLine,
  findProductionTask,
  isProductionTaskCompletedStatus,
  resolvePersistableCreatedBy,
  summarizeOrderLineForChange,
});
const packingCommandService = createPackingCommandService({
  buildOperationLog,
  distributeIntegerQty,
  findInventoryItem,
  isReleasableInventoryReservation,
  resolvePersistableCreatedBy,
});
const statementCommunicationCommandService = createStatementCommunicationCommandService({
  buildOperationLog,
  buildStatementExportFile,
  buildStatementPreviewLines,
  findAttachment: findAttachmentRecord,
  findStatement,
  getStatementExcelTemplateId,
  mapStatementApiStatus,
  markStatementSent,
  nextId,
  nextPlainId,
  normalizeStatementSendReceiptStatus,
  recordStatementCustomerConfirmation,
  storeStatementExportFile,
  toStatementExportSummary,
});
const statementFinancialCommandService = createStatementFinancialCommandService({
  buildOperationLog,
  buildTodo,
  confirmStatementPayment,
  confirmStatementVariance,
  confirmStatementWriteOff,
  findAttachment: findAttachmentRecord,
  findStatement,
  getStatementWriteOffBlocker,
  mapStatementApiStatus,
  mapVarianceHandlingResult,
  nextId,
});
const orderLineMutationCommandService = createOrderLineMutationCommandService({
  buildOperationLog,
  findInventoryItem,
  findOrderLine,
  isReleasableInventoryReservation,
  nextPlainId,
  summarizeOrderLineForChange,
  toInventoryQuantitySnapshot,
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
  toTodoSummary,
});
const masterDataImportCommandService = createMasterDataImportCommandService({
  buildOperationLog,
});
const masterDataEmployeeAccountCommandService = createMasterDataEmployeeAccountCommandService({
  buildOperationLog,
});
const runtimeAuthCommandService = createRuntimeAuthCommandService({ buildOperationLog });
const fulfillmentActionCommandService = createFulfillmentActionCommandService({
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
  hasDriverWatermarkEvidence,
  isReleasableInventoryReservation,
  mapFulfillmentMethod,
  nextId,
  nextPlainId,
  normalizeDeliveryEvidenceReviewStatus,
  normalizeTimestamp,
  toInventoryReservationTransactionSummary,
  updateFulfillmentsForAction,
});

async function updatePrintJobStatusRoute({ response, workspace, printJobId, body, operatorId }) {
  const result = await printJobLifecycleService.updatePrintJobStatus({ workspace, printJobId, body, operatorId });
  if (result.notFound) return sendNotFound(response, "PRINT_JOB_NOT_FOUND");
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result);
}

async function dispatchPrintJobRoute({ response, workspace, printJobId, body, operatorId }) {
  const result = await printJobLifecycleService.dispatchPrintJob({ workspace, printJobId, body, operatorId });
  if (result.notFound) return sendNotFound(response, "PRINT_JOB_NOT_FOUND");
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result);
}

async function pollPrintJobsRoute({ response, workspace, body, operatorId }) {
  const result = await printJobLifecycleService.pollPrintJobs({ workspace, body, operatorId });
  return sendJson(response, 200, result);
}

async function pollPrintJobDriverStatusRoute({ response, workspace, printJobId, body, operatorId }) {
  const result = await printJobLifecycleService.pollPrintJobById({ workspace, printJobId, body, operatorId });
  if (result.notFound) return sendNotFound(response, "PRINT_JOB_NOT_FOUND");
  if (result.error) {
    return sendBusinessError(response, result.statusCode, result.code, result.message);
  }
  return sendJson(response, 200, result);
}

async function recordPrintJobDriverStatusRoute({ response, workspace, printJobId, body, operatorId }) {
  const result = await printJobLifecycleService.recordPrintJobDriverStatus({ workspace, printJobId, body, operatorId });
  if (result.notFound) return sendNotFound(response, "PRINT_JOB_NOT_FOUND");
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result);
}

async function retryPrintJobRoute({ response, workspace, printJobId, body, operatorId }) {
  const result = await printJobLifecycleService.retryPrintJob({ workspace, printJobId, body, operatorId });
  if (result.notFound) return sendNotFound(response, "PRINT_JOB_NOT_FOUND");
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result);
}

async function voidPrintRecordRoute({ response, workspace, printRecordId, body, operatorId }) {
  const result = await fulfillmentPrintCommandService.voidPrintRecord({ workspace, printRecordId, body, operatorId });
  if (result.notFound) return sendNotFound(response, "PRINT_RECORD_NOT_FOUND");
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result);
}

async function updateFulfillmentStatusRoute({ response, workspace, fulfillmentId, action, body, operatorId }) {
  const result = await fulfillmentActionCommandService.updateFulfillmentStatus({
    workspace,
    fulfillmentId,
    action,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function cancelFulfillmentRoute({ response, workspace, fulfillmentId, body, operatorId }) {
  const result = await fulfillmentActionCommandService.cancelFulfillment({
    workspace,
    fulfillmentId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

function resolvePersistableCreatedBy(workspace, candidateUserId, fallbackUserId) {
  const candidate = cleanServerText(candidateUserId);
  const knownUserIds = new Set(
    (Array.isArray(workspace.users) ? workspace.users : []).map((user) => cleanServerText(user?.userId ?? user?.id)),
  );
  return candidate && knownUserIds.has(candidate) ? candidate : cleanServerText(fallbackUserId);
}

async function publishProductionScheduleRoute({ response, workspace, productionTaskId, body, operatorId }) {
  const result = await productionSchedulingCommandService.publishSchedule({ workspace, productionTaskId, body, operatorId });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function buildProductionMachineQueueResponse({ workspace, query } = {}) {
  const filters = normalizeProductionMachineQueueQuery(query);
  const productionScheduleRecords = await workspace.productionScheduleRecordRepository.listProductionScheduleRecords({
    workspace,
    filters: {},
  });
  workspace.productionScheduleRecords = productionScheduleRecords;
  const listResult = await workspace.productionPackingReadRepository.listProductionTasks({
    workspace,
    query: {
      status: filters.status || "open",
      machineId: filters.machineId,
      taskType: filters.taskType,
      keyword: filters.keyword,
      pageSize: 200,
    },
  });
  const rows = (listResult.items ?? [])
    .map((item) => buildProductionMachineQueueItem(workspace, item))
    .filter(Boolean)
    .filter((item) => {
      if (filters.machineId && item.machineId !== filters.machineId) return false;
      if (filters.taskType && item.taskType !== filters.taskType) return false;
      if (filters.status && filters.status !== "open" && filters.status !== "未完成" && item.status !== filters.status) return false;
      return matchesProductionMachineQueueKeyword(item, filters.keyword);
    })
    .sort(sortProductionMachineQueueItems)
    .map((item, index, items) => {
      const previousSameMachineCount = items
        .slice(0, index)
        .filter((candidate) => candidate.machineId === item.machineId).length;
      return {
        ...item,
        queueSeq: previousSameMachineCount + 1,
      };
    });
  const machines = Array.from(
    rows.reduce((map, item) => {
      const machine = map.get(item.machineId) ?? {
        machineId: item.machineId,
        machineLabel: item.machineLabel || item.machineId,
        total: 0,
        plannedQty: 0,
        remainingQty: 0,
        items: [],
      };
      machine.total += 1;
      machine.plannedQty += Math.max(0, Math.trunc(Number(item.plannedQty ?? 0)));
      machine.remainingQty += Math.max(0, Math.trunc(Number(item.remainingQty ?? 0)));
      machine.items.push(item);
      map.set(item.machineId, machine);
      return map;
    }, new Map()).values(),
  ).sort((left, right) => left.machineId.localeCompare(right.machineId));
  return {
    items: rows,
    machines,
    total: rows.length,
    generatedAt: new Date().toISOString(),
    source: "derived_from_production_tasks",
    note: "第一版机台排产队列由已发布排产或跨日继续生产任务派生；不代表完整排班、插单或产能排程引擎。",
  };
}

function normalizeProductionMachineQueueQuery(query = {}) {
  return {
    machineId: getServerQueryValue(query, "machineId") || getServerQueryValue(query, "currentMachineId"),
    taskType: getServerQueryValue(query, "taskType") || getServerQueryValue(query, "processType"),
    status: getServerQueryValue(query, "status") || "open",
    keyword: getServerQueryValue(query, "keyword"),
  };
}

function buildProductionMachineQueueItem(workspace, item) {
  const productionTask = item?.productionTask ?? {};
  const productionTaskId = cleanServerText(item?.productionTaskId ?? productionTask.productionTaskId);
  if (!productionTaskId) return null;
  const status = cleanServerText(productionTask.taskStatus ?? productionTask.status);
  if (isProductionTaskCompletedStatus(status)) return null;
  const publishedScheduleId = cleanServerText(productionTask.publishedScheduleId);
  const dailyProgress = normalizeProductionMachineQueueDailyProgress(item?.dailyProgress);
  const carryOver = dailyProgress?.carryOver === true || status === "跨日继续" || status === "待完工确认";
  if (!publishedScheduleId && !carryOver) return null;
  const orderLine =
    item?.orderLine ??
    findOrderLine(workspace, cleanServerText(item?.orderLineId ?? productionTask.orderLineId)) ??
    {};
  const orderLineId = cleanServerText(item?.orderLineId ?? productionTask.orderLineId ?? orderLine.orderLineId ?? orderLine.id);
  const machineId = cleanServerText(productionTask.machineId) || inferProductionMachineIdFromTaskType(productionTask.taskType);
  const plannedQty = Math.max(0, Math.trunc(Number(productionTask.plannedQty ?? orderLine.originalQty ?? orderLine.qty ?? 0)));
  const remainingQty = dailyProgress ? Math.max(0, Math.trunc(Number(dailyProgress.remainingQty ?? 0))) : plannedQty;
  const createdAt = cleanServerText(productionTask.createdAt);
  const scheduleRecord = findProductionScheduleRecord(workspace, {
    productionTaskId,
    publishedScheduleId,
    machineId,
  });
  return {
    scheduleRecordId: cleanServerText(scheduleRecord?.scheduleRecordId) || (publishedScheduleId ? `SQR-${safeRecordPart(publishedScheduleId)}` : `SQR-CARRY-${safeRecordPart(productionTaskId)}`),
    revision: Math.max(1, Math.trunc(Number(scheduleRecord?.revision ?? 1))),
    queueSeq: 0,
    manualQueueSeq: Math.max(0, Math.trunc(Number(scheduleRecord?.queueSeq ?? 0))),
    machineId,
    machineLabel: machineId,
    publishedScheduleId,
    productionTaskId,
    orderLineId,
    taskType: cleanServerText(productionTask.taskType) || "制袋",
    status,
    taskStatus: status,
    queueReason: publishedScheduleId ? "已发布排产" : "跨日继续",
    customerId: cleanServerText(orderLine.customerId),
    customerName: findCustomerName(workspace, orderLine.customerId),
    productName: cleanServerText(orderLine.productName ?? orderLine.product),
    size: cleanServerText(orderLine.size),
    bagColor: cleanServerText(orderLine.bagColor ?? orderLine.color),
    handleType: cleanServerText(orderLine.handleType ?? orderLine.handle),
    style: cleanServerText(orderLine.style),
    plannedQty,
    remainingQty,
    dailyProgress,
    sequenceUpdatedAt: cleanServerText(scheduleRecord?.updatedAt),
    sequenceUpdatedBy: cleanServerText(scheduleRecord?.updatedBy),
    sequenceRemark: cleanServerText(scheduleRecord?.remark),
    scheduleRecordSource: cleanServerText(scheduleRecord?.source),
    createdAt,
    queueSortAt: createdAt || cleanServerText(item?.latestReport?.createdAt ?? item?.latestReport?.completedAt),
  };
}

function normalizeProductionMachineQueueDailyProgress(progress) {
  if (!progress || typeof progress !== "object") return null;
  const cumulativeQualifiedQty = Math.max(0, Math.trunc(Number(progress.cumulativeQualifiedQty ?? 0)));
  const remainingQty = Math.max(0, Math.trunc(Number(progress.remainingQty ?? 0)));
  const latestDailyQualifiedQty = Math.max(0, Math.trunc(Number(progress.latestDailyQualifiedQty ?? 0)));
  if (cumulativeQualifiedQty <= 0 && remainingQty <= 0 && latestDailyQualifiedQty <= 0) return null;
  return {
    latestReportId: cleanServerText(progress.latestReportId),
    progressDate: cleanServerText(progress.progressDate),
    latestDailyQualifiedQty,
    cumulativeQualifiedQty,
    remainingQty,
    plannedQty: Math.max(0, Math.trunc(Number(progress.plannedQty ?? 0))),
    carryOver: progress.carryOver === true || remainingQty > 0,
    nextWorkDate: cleanServerText(progress.nextWorkDate),
    machineCount: progress.machineCount === undefined || progress.machineCount === null ? null : Math.trunc(Number(progress.machineCount)),
    machineCountAffectsInventory: false,
    inventoryCreated: false,
    reservationCreated: false,
    packingTaskCreated: false,
  };
}

function sortProductionMachineQueueItems(left, right) {
  if (left.machineId !== right.machineId) return left.machineId.localeCompare(right.machineId);
  const leftManualSeq = Math.max(0, Math.trunc(Number(left.manualQueueSeq ?? 0)));
  const rightManualSeq = Math.max(0, Math.trunc(Number(right.manualQueueSeq ?? 0)));
  if (leftManualSeq || rightManualSeq) {
    if (leftManualSeq && rightManualSeq && leftManualSeq !== rightManualSeq) return leftManualSeq - rightManualSeq;
    if (leftManualSeq && !rightManualSeq) return -1;
    if (!leftManualSeq && rightManualSeq) return 1;
  }
  const leftCarryOver = left.queueReason === "跨日继续" ? 0 : 1;
  const rightCarryOver = right.queueReason === "跨日继续" ? 0 : 1;
  if (leftCarryOver !== rightCarryOver) return leftCarryOver - rightCarryOver;
  const leftTime = Date.parse(left.queueSortAt || left.createdAt || "") || 0;
  const rightTime = Date.parse(right.queueSortAt || right.createdAt || "") || 0;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return left.productionTaskId.localeCompare(right.productionTaskId);
}

function matchesProductionMachineQueueKeyword(item, keyword) {
  const text = cleanServerText(keyword).toLowerCase();
  if (!text) return true;
  return [
    item.machineId,
    item.publishedScheduleId,
    item.productionTaskId,
    item.orderLineId,
    item.customerName,
    item.productName,
    item.size,
    item.bagColor,
    item.handleType,
    item.style,
    item.status,
  ].some((value) => cleanServerText(value).toLowerCase().includes(text));
}

function getServerQueryValue(query, key) {
  if (!query) return "";
  if (typeof query.get === "function") return cleanServerText(query.get(key));
  if (query instanceof Map) return cleanServerText(query.get(key));
  return cleanServerText(query[key]);
}

async function resequenceProductionMachineQueueRoute({ response, workspace, body, operatorId }) {
  const result = await productionSchedulingCommandService.resequenceMachineQueue({ workspace, body, operatorId });
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function moveProductionMachineQueueItemRoute({ response, workspace, body, operatorId }) {
  const result = await productionSchedulingCommandService.moveMachineQueueItem({ workspace, body, operatorId });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

function findProductionScheduleRecord(workspace, input = {}) {
  const productionTaskId = cleanServerText(input.productionTaskId);
  const publishedScheduleId = cleanServerText(input.publishedScheduleId);
  const machineId = cleanServerText(input.machineId);
  return (workspace.productionScheduleRecords ?? []).find((record) => {
    if (machineId && cleanServerText(record.machineId) !== machineId) return false;
    return (
      (productionTaskId && cleanServerText(record.productionTaskId) === productionTaskId) ||
      (publishedScheduleId && cleanServerText(record.publishedScheduleId) === publishedScheduleId)
    );
  }) ?? null;
}

async function recordProductionDailyProgressRoute({ response, workspace, productionTaskId, body, operatorId }) {
  const result = await productionReportingCommandService.recordDailyProgress({
    workspace,
    productionTaskId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function uploadProductionFinishedGoodsPhotoRoute({ response, workspace, productionTaskId, body, operatorId }) {
  const result = await productionFinishedGoodsPhotoCommandService.uploadPhoto({ workspace, productionTaskId, body, operatorId });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  const productionTask = result.productionTask;
  const orderLine = findOrderLine(workspace, productionTask.orderLineId);
  return sendJson(response, 200, {
    productionTaskId,
    orderLineId: productionTask.orderLineId,
    productionTask: toProductionTaskSummary(productionTask, orderLine),
    orderLine: summarizeOrderLineForChange(orderLine),
    finishedGoodsPhoto: buildFinishedGoodsPhotoSummary(workspace, productionTask, orderLine),
    customerNotificationTodoCreated: false,
    retakeTodoCreated: false,
    inventoryCreated: false,
    reservationCreated: false,
    packingTaskCreated: false,
    operationLogId: result.operationLogId,
  });
}

async function reviewProductionFinishedGoodsPhotoRoute({ response, workspace, productionTaskId, body, operatorId }) {
  const result = await productionFinishedGoodsPhotoCommandService.reviewPhoto({ workspace, productionTaskId, body, operatorId });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  const productionTask = result.productionTask;
  const orderLine = findOrderLine(workspace, productionTask.orderLineId);
  return sendJson(response, 200, {
    productionTaskId,
    orderLineId: productionTask.orderLineId,
    productionTask: toProductionTaskSummary(productionTask, orderLine),
    orderLine: summarizeOrderLineForChange(orderLine),
    finishedGoodsPhoto: buildFinishedGoodsPhotoSummary(workspace, productionTask, orderLine),
    todo: result.todo ? toTodoSummary(result.todo) : null,
    customerNotificationTodoCreated: result.reviewStatus === "已接受",
    retakeTodoCreated: result.reviewStatus === "需重拍",
    inventoryCreated: false,
    reservationCreated: false,
    packingTaskCreated: false,
    operationLogId: result.operationLogId,
  });
}

async function reportProductionCompleteRoute({ response, workspace, productionTaskId, body, operatorId }) {
  const result = await productionReportingCommandService.completeProductionReport({
    workspace,
    productionTaskId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

function isProductionTaskCompletedStatus(status) {
  const text = cleanServerText(status);
  return text === "已完成" || text.toLowerCase() === "completed" || text.toLowerCase() === "done";
}

async function completePackingTaskRoute({ response, workspace, packingTaskId, body, operatorId }) {
  const result = await packingCommandService.completePackingTask({ workspace, packingTaskId, body, operatorId });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function previewStatementRoute({ response, workspace, statementId, body, operatorId }) {
  const result = await statementCommunicationCommandService.previewStatement({ workspace, statementId, body, operatorId });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function downloadStatementExportRoute({ response, workspace, statementId, downloadToken }) {
  const statement = findStatement(workspace, statementId);
  if (!statement) return sendNotFound(response, "STATEMENT_NOT_FOUND");
  const exportFile = await workspace.statementExportRepository.findExportFileByToken({ workspace, statementId, downloadToken });
  if (!exportFile) return sendNotFound(response, "STATEMENT_EXPORT_NOT_FOUND");
  const storedContent = await readStatementExportFileContent(workspace, exportFile);
  if (!storedContent && !exportFile.content) return sendNotFound(response, "STATEMENT_EXPORT_CONTENT_NOT_FOUND");
  return sendFile(response, 200, storedContent?.buffer ?? exportFile.content, {
    contentType: storedContent?.contentType ?? exportFile.contentType,
    contentEncoding: storedContent ? "" : exportFile.contentEncoding,
    fileName: exportFile.fileName,
  });
}

async function listStatementExportsRoute({ response, workspace, statementId }) {
  const statement = findStatement(workspace, statementId);
  if (!statement) return sendNotFound(response, "STATEMENT_NOT_FOUND");
  const items = (await workspace.statementExportRepository.listExportFiles({ workspace, statementId })).map(
    toStatementExportSummary,
  );
  return sendJson(response, 200, {
    items,
    total: items.length,
  });
}

async function markStatementSentRoute({ response, workspace, statementId, body, operatorId }) {
  const result = await statementCommunicationCommandService.markStatementSent({ workspace, statementId, body, operatorId });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function markStatementSendReceiptRoute({ response, workspace, statementId, body, operatorId }) {
  const result = await statementCommunicationCommandService.markStatementSendReceipt({
    workspace,
    statementId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

function normalizeStatementSendReceiptStatus(value) {
  const status = String(value ?? "").trim();
  if (["delivered", "read", "confirmed", "no_response"].includes(status)) return status;
  return "read";
}

async function recordStatementCustomerConfirmationRoute({ response, workspace, statementId, body, operatorId }) {
  const result = await statementCommunicationCommandService.recordStatementCustomerConfirmation({
    workspace,
    statementId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function recordStatementPaymentRoute({ response, workspace, statementId, body, operatorId }) {
  const result = await statementFinancialCommandService.recordPayment({
    workspace,
    statementId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function handleStatementVarianceRoute({ response, workspace, statementId, body, operatorId }) {
  const result = await statementFinancialCommandService.handleVariance({
    workspace,
    statementId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function writeOffStatementRoute({ response, workspace, statementId, body, operatorId }) {
  const result = await statementFinancialCommandService.writeOffStatement({
    workspace,
    statementId,
    body,
    operatorId,
  });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result.response);
}

async function createAttachmentRoute({ response, workspace, body, operatorId }) {
  const result = await createAttachmentRecord({
    workspace,
    body: { ...body, uploadedBy: operatorId },
    parseDataUrl,
    buildOperationLog,
    nextId,
  });
  if (!result.ok) {
    return sendBusinessError(response, result.statusCode, result.errorCode, result.message);
  }
  return sendJson(response, 200, {
    ...toAttachmentSummary(result.attachment),
    deduplicated: result.deduplicated,
    duplicateOfAttachmentId: result.duplicateOfAttachmentId,
    operationLogId: result.operationLogId,
  });
}

async function listAttachmentsRoute({ response, workspace, searchParams }) {
  const items = await workspace.attachmentRepository.listAttachments({
    workspace,
    filters: {
      ownerType: searchParams.get("ownerType"),
      ownerId: searchParams.get("ownerId"),
      purpose: searchParams.get("purpose"),
      fileType: searchParams.get("fileType"),
      keyword: searchParams.get("keyword"),
    },
  });
  return sendJson(response, 200, {
    ...paginate(items.map((attachment) => toAttachmentSummary(attachment)), searchParams),
  });
}

async function getAttachmentStorageDiagnosticsRoute({ response, workspace }) {
  return sendJson(response, 200, await runAttachmentStorageDiagnostics(workspace.attachmentObjectStorage));
}

async function getAttachmentV1ReadinessRoute({ response, workspace, operatorId }) {
  return sendJson(response, 200, await buildAttachmentV1Readiness({ workspace, operatorId }));
}

async function getStatementExportStorageDiagnosticsRoute({ response, workspace }) {
  return sendJson(response, 200, await runStatementExportStorageDiagnostics(workspace.statementExportObjectStorage));
}

async function getStatementExportV1ReadinessRoute({ response, workspace, operatorId }) {
  return sendJson(response, 200, await buildStatementExportV1Readiness({ workspace, operatorId }));
}

async function createAttachmentAccessUrlRoute({ response, workspace, attachmentId, searchParams, authContext }) {
  const attachment = await workspace.attachmentRepository.findAttachmentById({ workspace, attachmentId });
  if (!attachment) return sendNotFound(response, "ATTACHMENT_NOT_FOUND");
  if (!attachment.hasContent) return sendNotFound(response, "ATTACHMENT_CONTENT_NOT_FOUND");
  const ttlSeconds = clampNumber(Number(searchParams.get("ttlSeconds") ?? 900), 60, 3600);
  const access = workspace.attachmentObjectStorage.createAccessUrl({
    attachmentId,
    storageKey: attachment.storageKey,
    ttlSeconds,
  });
  const operationLogId = await recordAttachmentAccessLog(workspace, {
    attachment,
    action: "attachment_access_url_created",
    operatorId: authContext.userId,
    accessMode: "permission",
    deliveryMode: access.deliveryMode,
    expiresAt: access.expiresAt,
  });

  return sendJson(response, 200, {
    attachmentId,
    accessUrl: access.accessUrl,
    expiresAt: access.expiresAt,
    ttlSeconds,
    deliveryMode: access.deliveryMode,
    storageProvider: attachment.storageProvider || "",
    fileName: attachment.fileName || "",
    contentType: attachment.mimeType || "application/octet-stream",
    operationLogId,
  });
}

async function listAttachmentAccessLogsRoute({ response, workspace, attachmentId, searchParams }) {
  const attachment = await workspace.attachmentRepository.findAttachmentById({ workspace, attachmentId });
  if (!attachment) return sendNotFound(response, "ATTACHMENT_NOT_FOUND");
  const limit = clampNumber(Number(searchParams.get("limit") ?? 50), 1, 100);
  const accessLogs = await workspace.attachmentAccessAuditRepository.listAccessLogs({ workspace, attachmentId, limit });
  return sendJson(response, 200, {
    attachmentId,
    items: accessLogs.items,
    total: accessLogs.total,
  });
}

async function getAttachmentContentRoute({ response, workspace, attachmentId, authContext, accessMode }) {
  const attachment = await workspace.attachmentRepository.findAttachmentById({ workspace, attachmentId });
  if (!attachment) return sendNotFound(response, "ATTACHMENT_NOT_FOUND");
  const contentPayload = await workspace.attachmentObjectStorage.readObject({ attachment });
  if (!contentPayload) return sendNotFound(response, "ATTACHMENT_CONTENT_NOT_FOUND");
  await recordAttachmentAccessLog(workspace, {
    attachment,
    action: "attachment_content_read",
    operatorId: accessMode === "signed_url" ? "SIGNED_URL" : authContext.userId,
    accessMode,
    deliveryMode: accessMode === "signed_url" ? "api_proxy_signed_url" : "api_permission",
    contentType: attachment.mimeType || contentPayload.contentType || "application/octet-stream",
  });
  return sendInlineFile(response, 200, contentPayload.buffer, {
    contentType: attachment.mimeType || contentPayload.contentType || "application/octet-stream",
    fileName: attachment.fileName || `${attachment.attachmentId}.bin`,
  });
}

async function recordAttachmentAccessLog(workspace, input) {
  const operationLogId = addOperationLog(workspace, {
    targetType: "attachment",
    targetId: input.attachment.attachmentId,
    action: input.action,
    operatorId: input.operatorId,
    after: {
      ownerType: input.attachment.ownerType,
      ownerId: input.attachment.ownerId,
      purpose: input.attachment.purpose,
      fileName: input.attachment.fileName,
      storageProvider: input.attachment.storageProvider,
      storageKey: input.attachment.storageKey,
      accessMode: input.accessMode,
      deliveryMode: input.deliveryMode,
      expiresAt: input.expiresAt ?? "",
      contentType: input.contentType ?? input.attachment.mimeType ?? "",
    },
  });
  const operationLog = workspace.operationLogs.find((log) => log.id === operationLogId);
  await workspace.attachmentAccessAuditRepository.recordAccessLog({
    workspace,
    accessLog: {
      logId: nextId("ALOG", workspace.attachmentAccessLogs),
      attachmentId: input.attachment.attachmentId,
      operationLogId,
      action: input.action,
      operatorId: input.operatorId,
      accessMode: input.accessMode,
      deliveryMode: input.deliveryMode,
      storageProvider: input.attachment.storageProvider,
      storageKey: input.attachment.storageKey,
      ownerType: input.attachment.ownerType,
      ownerId: input.attachment.ownerId,
      purpose: input.attachment.purpose,
      fileName: input.attachment.fileName,
      contentType: input.contentType ?? input.attachment.mimeType ?? "",
      expiresAt: input.expiresAt ?? "",
      occurredAt: operationLog?.occurredAt ?? new Date().toISOString(),
    },
  });
  return operationLogId;
}

function toAttachmentSummary(attachment) {
  return {
    attachmentId: attachment.attachmentId,
    ownerType: attachment.ownerType,
    ownerId: attachment.ownerId,
    fileType: attachment.fileType,
    purpose: attachment.purpose,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    url: attachment.url,
    hasContent: attachment.hasContent,
    storageProvider: attachment.storageProvider,
    storageKey: attachment.storageKey,
    contentDigest: attachment.contentDigest,
    thumbnailStorageKey: attachment.thumbnailStorageKey,
    thumbnailUrl: attachment.thumbnailUrl,
    signedUrlExpiresAt: attachment.signedUrlExpiresAt,
    metadata: attachment.metadata && typeof attachment.metadata === "object" && !Array.isArray(attachment.metadata) ? attachment.metadata : {},
    status: attachment.status,
    uploadedBy: attachment.uploadedBy,
    uploadedAt: attachment.uploadedAt,
  };
}

async function handleTodoRoute({ response, workspace, todoId, body, operatorId, operatorName }) {
  const result = await todoCommandService.handleTodo({ workspace, todoId, body, operatorId, operatorName });
  if (result.notFound) return sendNotFound(response, result.code);
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, {
    todo: toTodoListItem(workspace, result.todo),
    operationLogId: result.operationLogId,
  });
}

async function createPrintBatchRoute({ response, workspace, body, operatorId, operatorName }) {
  const result = await printBatchCommandService.createPrintBatch({ workspace, body, operatorId, operatorName });
  return sendJson(response, 200, result);
}

function buildStatementPreviewLines(workspace, statement) {
  const persistedLines = (workspace.statementLines ?? []).filter(
    (item) => (item.statementId ?? item.statement_id) === statement.id,
  );
  if (persistedLines.length > 0) {
    return persistedLines.map((statementLine, index) => {
      const lineId = statementLine.orderLineId ?? statementLine.order_line_id;
      const line = workspace.orderLines.find((item) => item.id === lineId);
      return toStatementPreviewLine(workspace, statement, lineId, line, index, statementLine);
    });
  }
  return (statement.lineIds ?? []).map((lineId, index) => {
    const line = workspace.orderLines.find((item) => item.id === lineId);
    return toStatementPreviewLine(workspace, statement, lineId, line, index);
  });
}

function toStatementPreviewLine(workspace, statement, lineId, line, index, persistedLine = null) {
  const deliveredQty = Number(persistedLine?.deliveredQty ?? line?.qty ?? 0);
  const chargeableQty = Number(persistedLine?.chargeableQty ?? deliveredQty);
  const freeQty = Number(persistedLine?.freeQty ?? Math.max(0, deliveredQty - chargeableQty));
  const amount = Number(persistedLine?.amount ?? line?.amount ?? 0);
  const adjustmentAmount = Number(persistedLine?.adjustmentAmount ?? 0);
  const finalAmount = Number(persistedLine?.finalAmount ?? amount + adjustmentAmount);
  const fulfillment = workspace.fulfillments.find((item) => item.lineId === (line?.id ?? lineId));
  return {
    statementLineId: persistedLine?.statementLineId ?? persistedLine?.id ?? `${statement.id}-${String(index + 1).padStart(3, "0")}`,
    statementId: statement.id,
    orderLineId: line?.id ?? lineId,
    fulfillmentId: persistedLine?.fulfillmentId ?? fulfillment?.id ?? "",
    orderNo: line?.orderNo ?? lineId,
    productName: line?.product ?? "未找到明细",
    goodsSpec: buildStatementGoodsSpec(workspace, line),
    remark: getLineRemark(line),
    deliveredQty,
    chargeableQty,
    freeQty,
    billQty: chargeableQty,
    unitPrice: chargeableQty > 0 ? roundMoney(amount / chargeableQty) : 0,
    amount,
    adjustmentAmount,
    finalAmount,
  };
}

function buildStatementGoodsSpec(workspace, line) {
  if (!line) return "";
  const fulfillment = workspace.fulfillments.find((item) => item.lineId === line.id);
  const colorSpec = getLineColorSpecLabel(line);
  const printSide = line.print === "是" ? mapPrintSide(getLinePrintSide(line)) : "";
  const remark = getLineRemark(line);
  return [
    line.product,
    line.size,
    colorSpec,
    printSide,
    `${Number(line.qty ?? 0)}个`,
    fulfillment?.packages ?? "",
    remark,
  ]
    .filter(Boolean)
    .join(" / ");
}

function buildStatementExportFile(workspace, statement, options = {}) {
  const customer = workspace.customers.find((item) => item.id === statement.customerId) ?? {};
  const previewType = options.previewType === "internal_archive" ? "internal_archive" : "customer_send";
  const lines = options.lines ?? buildStatementPreviewLines(workspace, statement);
  const summary = options.summary ?? {
    receivable: Number(statement.receivable ?? 0),
    received: Number(statement.received ?? 0),
    variance: Number(statement.variance ?? 0),
    lineCount: lines.length,
  };
  const safeCustomerName = sanitizeDownloadFileName(customer.name ?? "customer");
  const fileName = `statement-${statement.id}-${safeCustomerName}${STATEMENT_EXCEL_FILE_EXTENSION}`;
  const createdAt = options.createdAt ?? new Date().toISOString();
  const preview = {
    statementId: statement.id,
    previewType,
    summary,
    lines,
    downloadToken: options.downloadToken ?? "",
  };
  const templateContext = {
    statement,
    customer,
    generatedAt: createdAt,
    generatedBy: options.createdBy ?? "",
    templateId: options.templateId ?? getStatementExcelTemplateId(previewType),
  };

  return {
    exportFileId: options.downloadToken ?? "",
    statementId: statement.id,
    previewType,
    downloadToken: options.downloadToken ?? "",
    operationLogId: options.operationLogId ?? "",
    fileName,
    contentType: STATEMENT_EXCEL_CONTENT_TYPE,
    content: buildStatementExcelWorkbookBase64(preview, templateContext),
    contentEncoding: "base64",
    storageProvider: "database",
    storageKey: "",
    contentDigest: "",
    createdBy: options.createdBy ?? "",
    createdAt,
    metadata: buildStatementExcelMetadata(preview, templateContext),
  };
}

function toStatementExportSummary(exportFile) {
  return {
    statementId: exportFile.statementId,
    previewType: exportFile.previewType,
    downloadToken: exportFile.downloadToken,
    operationLogId: exportFile.operationLogId,
    fileName: exportFile.fileName,
    contentType: exportFile.contentType,
    createdAt: exportFile.createdAt,
    templateId: exportFile.metadata?.templateId ?? "",
    templateVersion: exportFile.metadata?.templateVersion ?? "",
    workbookFormat: exportFile.metadata?.workbookFormat ?? "",
    worksheetNames: exportFile.metadata?.worksheetNames ?? [],
    storageProvider: exportFile.storageProvider ?? "",
    storageKeyStored: Boolean(exportFile.storageKey),
    contentDigest: exportFile.contentDigest ?? "",
    contentLength: Number(exportFile.metadata?.contentLength ?? 0),
  };
}

async function storeStatementExportFile(workspace, exportFile) {
  if (!workspace.statementExportObjectStorage?.putExportFile) return exportFile;
  const storage = await workspace.statementExportObjectStorage.putExportFile({ exportFile });
  return {
    ...exportFile,
    storageProvider: storage.storageProvider || exportFile.storageProvider,
    storageKey: storage.storageKey || exportFile.storageKey,
    contentDigest: storage.contentDigest || exportFile.contentDigest,
    metadata: {
      ...exportFile.metadata,
      storageProvider: storage.storageProvider || exportFile.storageProvider,
      storageKeyStored: Boolean(storage.storageKey || exportFile.storageKey),
      contentDigest: storage.contentDigest || exportFile.contentDigest,
      contentLength: storage.contentLength ?? Buffer.byteLength(String(exportFile.content ?? ""), "utf8"),
      contentEncoding: exportFile.contentEncoding || "",
    },
  };
}

async function readStatementExportFileContent(workspace, exportFile) {
  if (!workspace.statementExportObjectStorage?.readExportFile) return null;
  return workspace.statementExportObjectStorage.readExportFile({ exportFile });
}

function sanitizeDownloadFileName(value) {
  const sanitized = String(value ?? "customer").replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "customer";
}

function roundMoney(value) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

function findAttachmentRecord(workspace, attachmentId) {
  const safeAttachmentId = cleanServerText(attachmentId);
  if (!safeAttachmentId) return null;
  return (workspace.attachments ?? []).find((item) => item.attachmentId === safeAttachmentId || item.id === safeAttachmentId) ?? null;
}

function buildFinishedGoodsPhotoSummary(workspace, productionTask = {}, orderLine = {}) {
  const sourcePhoto =
    productionTask.finishedGoodsPhoto && typeof productionTask.finishedGoodsPhoto === "object"
      ? productionTask.finishedGoodsPhoto
      : {};
  const attachmentId = cleanServerText(
    productionTask.finishedGoodsPhotoAttachmentId ??
      productionTask.finished_goods_photo_attachment_id ??
      sourcePhoto.attachmentId,
  );
  const attachment = workspace && attachmentId ? findAttachmentRecord(workspace, attachmentId) : null;
  const status = cleanServerText(
    productionTask.finishedGoodsPhotoStatus ??
      productionTask.finished_goods_photo_status ??
      sourcePhoto.status,
  ) || (attachmentId ? "待确认" : "未上传");
  return {
    status,
    required: sourcePhoto.required === true || isFinishedGoodsPhotoRequired(orderLine),
    attachmentId,
    fileName:
      cleanServerText(productionTask.finishedGoodsPhotoFileName ?? productionTask.finished_goods_photo_file_name) ||
      cleanServerText(attachment?.fileName) ||
      attachmentId,
    uploadedAt: cleanServerText(productionTask.finishedGoodsPhotoUploadedAt ?? productionTask.finished_goods_photo_uploaded_at),
    uploadedBy: cleanServerText(productionTask.finishedGoodsPhotoUploadedBy ?? productionTask.finished_goods_photo_uploaded_by),
    reviewedAt: cleanServerText(productionTask.finishedGoodsPhotoReviewedAt ?? productionTask.finished_goods_photo_reviewed_at),
    reviewedBy: cleanServerText(productionTask.finishedGoodsPhotoReviewedBy ?? productionTask.finished_goods_photo_reviewed_by),
    rejectedReason: cleanServerText(productionTask.finishedGoodsPhotoRejectedReason ?? productionTask.finished_goods_photo_rejected_reason),
    history: normalizeFinishedGoodsPhotoHistory(productionTask.finishedGoodsPhotoHistory ?? productionTask.finished_goods_photo_history),
  };
}

function normalizeFinishedGoodsPhotoHistory(value) {
  return Array.isArray(value)
    ? value
        .map((item) => ({
          status: cleanServerText(item?.status),
          attachmentId: cleanServerText(item?.attachmentId ?? item?.attachment_id),
          fileName: cleanServerText(item?.fileName ?? item?.file_name),
          uploadedAt: cleanServerText(item?.uploadedAt ?? item?.uploaded_at),
          uploadedBy: cleanServerText(item?.uploadedBy ?? item?.uploaded_by),
          reviewedAt: cleanServerText(item?.reviewedAt ?? item?.reviewed_at),
          reviewedBy: cleanServerText(item?.reviewedBy ?? item?.reviewed_by),
          reason: cleanServerText(item?.reason ?? item?.remark),
        }))
        .filter((item) => item.status || item.attachmentId)
    : [];
}

function isFinishedGoodsPhotoRequired(orderLine = {}) {
  const orderType = cleanServerText(orderLine.orderType ?? orderLine.order_type);
  const printFlag = cleanServerText(orderLine.print ?? orderLine.printFlag ?? orderLine.print_flag);
  const status = cleanServerText(orderLine.status ?? orderLine.lineStatus ?? orderLine.line_status);
  return (
    orderType.includes("定制") ||
    orderType.includes("印刷") ||
    printFlag === "是" ||
    printFlag.toLowerCase() === "true" ||
    status.includes("丝印") ||
    status.includes("制袋")
  );
}

function normalizeFinishedGoodsPhotoReviewStatus(value) {
  const text = cleanServerText(value);
  if (["已接受", "通过", "确认", "accepted", "accept"].includes(text)) return "已接受";
  if (["需重拍", "退回", "退回重拍", "rejected", "retake_required", "reject"].includes(text)) return "需重拍";
  return "";
}

function buildFinishedGoodsCustomerNotificationTodo(workspace, orderLine, productionTask, operatorId, todoId) {
  const orderLineId = cleanServerText(orderLine?.id ?? orderLine?.orderLineId ?? productionTask?.orderLineId);
  const existingTodo = findOpenTodoByTypeAndRef(workspace, "待通知客户", orderLineId);
  const customerId = cleanServerText(orderLine?.customerId);
  const customerName = findCustomerName(workspace, customerId);
  const goods = [orderLine?.productName ?? orderLine?.product, orderLine?.size, orderLine?.color ?? orderLine?.bagColor]
    .map(cleanServerText)
    .filter(Boolean)
    .join(" ");
  const notificationCopyText = buildFinishedGoodsCustomerNotificationText(workspace, orderLine, productionTask);
  const photoPrompt = buildFinishedGoodsPhotoPrompt(productionTask);
  const todo = buildTodo(workspace, {
    ...(existingTodo ?? {}),
    id: existingTodo?.id ?? todoId,
    type: "待通知客户",
    customerId,
    ref: orderLineId,
    summary: `${customerName || customerId} ${goods || orderLineId}：成品图已确认，可人工通知客户可发货/可安排快递`,
    latest: cleanServerText(orderLine?.latest ?? orderLine?.latestNeededAt) || "待确认",
    urgency: "待处理",
    impact: "V1 仅生成待办和可复制通知，客户消息仍由办公室人工发送",
    notificationCopyText,
    notificationChannel: existingTodo?.notificationChannel || "微信 / 企业微信人工发送",
    notificationStatus: existingTodo?.notificationStatus || "待人工发送",
    photoPrompt,
    createdBy: existingTodo?.createdBy ?? operatorId,
  });
  return todo;
}

function buildFinishedGoodsCustomerNotificationText(workspace, orderLine, productionTask) {
  const customerId = cleanServerText(orderLine?.customerId);
  const customer = (workspace.customers ?? []).find((item) => item.id === customerId);
  const contact = cleanServerText(customer?.contact) || "您好";
  const orderLineId = cleanServerText(orderLine?.id ?? orderLine?.orderLineId ?? productionTask?.orderLineId);
  const goods = buildFinishedGoodsNotificationGoods(orderLine);
  const fulfillment = cleanServerText(orderLine?.fulfillment ?? orderLine?.fulfillmentMethod);
  const deliveryText = fulfillment ? `我们按原来的${fulfillment}方式继续安排。` : "我们按原交付方式继续安排。";
  return `${contact}，您这单${orderLineId ? ` ${orderLineId}` : ""}${goods ? `（${goods}）` : ""}成品已经做好，成品图发您确认。确认可以的话，${deliveryText}`;
}

function buildFinishedGoodsNotificationGoods(orderLine) {
  if (!orderLine) return "";
  const qty = Number(orderLine.qty ?? orderLine.quantity ?? 0);
  const quantityText = Number.isFinite(qty) && qty > 0 ? `${Math.trunc(qty)}个` : "";
  const remarks = getLineRemark(orderLine);
  return [
    orderLine.productName ?? orderLine.product,
    orderLine.size,
    getLineColorSpecLabel(orderLine),
    getLinePrintSide(orderLine),
    quantityText,
    remarks,
  ]
    .map(cleanServerText)
    .filter(Boolean)
    .join(" / ");
}

function buildFinishedGoodsPhotoPrompt(productionTask) {
  const photo = productionTask?.finishedGoodsPhoto && typeof productionTask.finishedGoodsPhoto === "object" ? productionTask.finishedGoodsPhoto : {};
  const attachmentId =
    cleanServerText(productionTask?.finishedGoodsPhotoAttachmentId) ||
    cleanServerText(photo.attachmentId);
  const fileName =
    cleanServerText(productionTask?.finishedGoodsPhotoFileName) ||
    cleanServerText(photo.fileName) ||
    attachmentId;
  return fileName
    ? `发送客户通知时请附上已复核成品图：${fileName}。`
    : "发送客户通知时请附上已复核成品图。";
}

function buildFinishedGoodsPhotoRetakeTodo(workspace, orderLine, productionTask, reason, operatorId, todoId) {
  const orderLineId = cleanServerText(orderLine?.id ?? orderLine?.orderLineId ?? productionTask?.orderLineId);
  const existingTodo = findOpenTodoByTypeAndRef(workspace, "成品图需重拍", orderLineId);
  const customerId = cleanServerText(orderLine?.customerId);
  const customerName = findCustomerName(workspace, customerId);
  const goods = [orderLine?.productName ?? orderLine?.product, orderLine?.size, orderLine?.color ?? orderLine?.bagColor]
    .map(cleanServerText)
    .filter(Boolean)
    .join(" ");
  const todo = buildTodo(workspace, {
    ...(existingTodo ?? {}),
    id: existingTodo?.id ?? todoId,
    type: "成品图需重拍",
    customerId,
    ref: orderLineId,
    summary: `${customerName || customerId} ${goods || orderLineId}：${cleanServerText(reason) || "办公室退回成品图，需车间重拍"}`,
    latest: cleanServerText(orderLine?.latest ?? orderLine?.latestNeededAt) || "待确认",
    urgency: "异常",
    impact: "未确认前不能进入待通知客户池",
    createdBy: existingTodo?.createdBy ?? operatorId,
  });
  return todo;
}

function findOpenTodoByTypeAndRef(workspace, type, ref) {
  const safeType = cleanServerText(type);
  const safeRef = cleanServerText(ref);
  return (workspace.todos ?? []).find((todo) => todo.type === safeType && todo.ref === safeRef && !todo.handled) ?? null;
}

function buildTodo(workspace, input) {
  return makeTodo({ id: input.id ?? nextId("T-API", workspace.todos), wait: "刚刚", ...input });
}

function buildFulfillmentActionRecord(workspace, fulfillment, input = {}) {
  const orderLineId = fulfillment.orderLineId ?? fulfillment.lineId ?? "";
  const orderLine = workspace.orderLines.find((item) => item.id === orderLineId) ?? {};
  const customerId = fulfillment.customerId ?? orderLine.customerId ?? "";
  const actualQty =
    input.actualQty === null || input.actualQty === undefined || input.actualQty === ""
      ? fulfillment.actualQty ?? fulfillment.qty
      : input.actualQty;
  return {
    ...fulfillment,
    fulfillmentId: fulfillment.fulfillmentId ?? fulfillment.id,
    bizNo: fulfillment.bizNo ?? fulfillment.id,
    orderLineId,
    customerId,
    customerSnapshot: buildCustomerSnapshot(workspace, customerId),
    method: fulfillment.method,
    expectedQty: Number(fulfillment.expectedQty ?? fulfillment.qty ?? orderLine.qty ?? 0),
    actualQty: Number(actualQty ?? 0),
    status: fulfillment.status,
    latestNeededAt: fulfillment.latestNeededAt ?? fulfillment.latest ?? orderLine.latest ?? "",
    deliveredAt: input.deliveredAt ?? fulfillment.deliveredAt ?? "",
    confirmedAt: input.confirmedAt ?? fulfillment.confirmedAt ?? "",
    confirmedBy: input.confirmedBy ?? input.operatorId ?? fulfillment.confirmedBy ?? "",
    createdBy: input.createdBy ?? input.operatorId ?? fulfillment.createdBy ?? "",
  };
}

async function ensureOfficePrintJobDemoSeeds(workspace) {
  if (workspace.runtimeConfig?.production) return;
  const existingIds = new Set((workspace.printJobs ?? []).map((item) => item.printJobId));
  const labelDevice =
    (await findPrintDevice(workspace, "PRN-LABEL-A")) ??
    (workspace.printDevices ?? []).find((item) => item.deviceType === "label_printer") ??
    (workspace.printDevices ?? [])[0] ??
    null;
  if (!labelDevice || !workspace.printJobRepository?.createPrintJob) return;

  const createdAt = new Date().toISOString();
  const demoJobs = [
    buildOfficePrintJobDemoSeed({
      printJobId: "PJ-DEMO-QUEUED-DISPATCH",
      printRecordId: "PR-DEMO-QUEUED-DISPATCH",
      targetId: "F003",
      printDevice: labelDevice,
      jobStatus: "queued",
      driverMode: "system_printer",
      createdAt,
      metadata: {
        demoPurpose: "office_print_job_queue_dispatch",
        note: "用于办公室打印作业池派发按钮验收；当前 guarded adapter 会明确返回未配置真实打印驱动。",
      },
    }),
    buildOfficePrintJobDemoSeed({
      printJobId: "PJ-DEMO-FAILED-RETRY",
      printRecordId: "PR-DEMO-FAILED-RETRY",
      targetId: "F004",
      printDevice: labelDevice,
      jobStatus: "failed",
      driverMode: "system_printer",
      createdAt,
      errorCode: "SYSTEM_PRINTER_ADAPTER_NOT_CONFIGURED",
      errorMessage: "真实打印驱动未配置，等待办公室重试或现场处理。",
      metadata: {
        demoPurpose: "office_print_job_queue_retry",
        note: "用于办公室打印作业池重试按钮验收。",
      },
    }),
  ];

  for (const printJob of demoJobs) {
    if (existingIds.has(printJob.printJobId)) continue;
    const operationLog = buildOperationLog(workspace, {
      targetType: "print_job",
      targetId: printJob.printJobId,
      action: "seed_office_print_job_demo",
      operatorId: "U-PRINT-DRIVER-A",
      after: printJob,
      reason: "Seed office print-job queue demo records for queued dispatch and failed retry validation.",
    });
    await workspace.printJobRepository.createPrintJob({ workspace, printJob, operationLog });
  }
}

function buildOfficePrintJobDemoSeed({
  printJobId,
  printRecordId: _printRecordId,
  targetId,
  printDevice,
  jobStatus,
  driverMode,
  createdAt,
  errorCode = "",
  errorMessage = "",
  metadata = {},
}) {
  const printDeviceSnapshot = buildDemoPrintDeviceSnapshot(printDevice, driverMode);
  const finishedAt = ["failed", "canceled", "printed"].includes(jobStatus) ? createdAt : "";
  return {
    printJobId,
    bizNo: printJobId,
    printRecordId: "",
    targetType: "fulfillment",
    targetId,
    documentType: "express_ltl_label",
    templateId: "tpl-p0-express-ltl-label",
    printDeviceId: printDeviceSnapshot.printDeviceId,
    printDeviceSnapshot,
    driverMode,
    jobStatus,
    attemptNo: 1,
    sourcePrintJobId: "",
    requestedBy: "U-PRINT-DRIVER-A",
    queuedAt: jobStatus === "queued" ? createdAt : "",
    sentAt: "",
    finishedAt,
    errorCode,
    errorMessage,
    payload: {
      printTemplate: {
        templateId: "tpl-p0-express-ltl-label",
        documentType: "express_ltl_label",
        title: "快递快运包裹标签演示",
      },
      request: {
        printAction: "first_print",
        packageIds: [],
      },
    },
    metadata: {
      route: "seed_office_print_job_demo",
      driverBoundary: "guarded_system_printer_demo",
      ...metadata,
    },
    operationLogId: "",
    createdAt,
    updatedAt: createdAt,
  };
}

function buildDemoPrintDeviceSnapshot(printDevice, driverMode) {
  const snapshot = buildPrintDeviceSnapshot(printDevice) ?? {
    printDeviceId: "PRN-DEMO",
    name: "演示打印设备",
    settings: {},
  };
  return {
    ...snapshot,
    settings: {
      ...(snapshot.settings ?? {}),
      driverMode,
    },
  };
}

function getPrintDriverConfigurationResponse(workspace) {
  const adapter = workspace.printDriverAdapter ?? {};
  const configuration =
    typeof adapter.getConfiguration === "function"
      ? adapter.getConfiguration()
      : {
          adapterName: "unknown-print-driver-adapter",
          kind: String(adapter.kind ?? "").trim() || "unknown",
          configurationAvailable: false,
          dryRunEnabled: false,
          systemPrinterEnabled: false,
          systemPrinterAdapterKind: "unknown",
          systemPrinterCommandConfigured: false,
          systemPrinterCommandArgsConfigured: false,
          systemPrinterCommandTimeoutMs: 0,
          allowedPrinterNames: [],
          realDispatchAvailable: false,
          environmentPreflight: {
            checkedAt: new Date().toISOString(),
            scope: "non_printing_environment_preflight",
            summary: {
              label: "0/0 通过",
              passedCount: 0,
              totalCount: 0,
              blockingCount: 0,
              tone: "warning",
            },
            items: [],
            safeguards: {
              nonPrinting: true,
              commandValueExposed: false,
              commandArgsExposed: false,
              spoolPathExposed: false,
            },
          },
          safeguards: {
            commandValueExposed: false,
            physicalPrinterCallsBlocked: true,
          },
        };
  return {
    printDriverAdapter: configuration,
  };
}

function getPrintDriverSpoolDiagnosticsResponse({ workspace, operatorId }) {
  const adapter = workspace.printDriverAdapter ?? {};
  if (typeof adapter.runSpoolDiagnostics !== "function") {
    return {
      status: "not_available",
      ready: false,
      checkedAt: new Date().toISOString(),
      scope: "non_printing_command_bridge_spool_diagnostics",
      operatorId,
      diagnosticPrintJobId: "",
      diagnosticExternalJobId: "",
      statusReadback: "spool_file",
      writeOk: false,
      pendingPollOk: false,
      completedPollOk: false,
      cleanupOk: false,
      secretFieldsExposed: false,
      spoolPathExposed: false,
      physicalPrinterCalled: false,
      configuration: {
        kind: String(adapter.kind ?? "").trim() || "unknown",
        dryRunEnabled: false,
        systemPrinterEnabled: false,
        systemPrinterAdapterKind: "unknown",
        systemPrinterCommandConfigured: false,
        systemPrinterCommandArgsConfigured: false,
        systemPrinterCommandTimeoutMs: 0,
        commandBridgeStatusReadbackAvailable: false,
        allowedPrinterCount: 0,
        realDispatchAvailable: false,
      },
      blockers: [
        {
          key: "spool-diagnostics-adapter-method",
          label: "spool 诊断适配器",
          status: "failed",
          tone: "danger",
          blocking: true,
          detail: "当前打印适配器未提供 spool 诊断方法",
        },
      ],
      pollResults: {
        pending: null,
        completed: null,
      },
      safeguards: {
        nonPrinting: true,
        commandValueExposed: false,
        commandArgsExposed: false,
        spoolPathExposed: false,
        payloadExposed: false,
        physicalPrinterCalled: false,
      },
    };
  }
  return adapter.runSpoolDiagnostics({
    operatorId,
    reason: "api_print_driver_spool_diagnostics",
  });
}

function getPrintDriverCupsDiagnosticsResponse({ workspace, operatorId }) {
  const adapter = workspace.printDriverAdapter ?? {};
  if (typeof adapter.runCupsDiagnostics !== "function") {
    return {
      adapterName: "unknown-print-driver-adapter",
      status: "not_available",
      ready: false,
      checkedAt: new Date().toISOString(),
      scope: "non_printing_cups_queue_preflight",
      operatorId,
      reason: "api_print_driver_cups_diagnostics",
      cupsQueueStatusReadback: "cups_status_command",
      cupsPrinterConfigured: false,
      cupsPrinterAllowed: false,
      cupsStatusCommandConfigured: false,
      cupsStatusCommandRunnable: false,
      physicalPrinterCalled: false,
      commandValueExposed: false,
      commandArgsExposed: false,
      stdoutExposed: false,
      stderrExposed: false,
      configuration: {
        kind: String(adapter.kind ?? "").trim() || "unknown",
        dryRunEnabled: false,
        systemPrinterEnabled: false,
        systemPrinterAdapterKind: "unknown",
        systemPrinterCommandConfigured: false,
        systemPrinterCommandArgsConfigured: false,
        systemPrinterCommandTimeoutMs: 0,
        allowedPrinterCount: 0,
        realDispatchAvailable: false,
      },
      blockers: [
        {
          key: "cups-diagnostics-adapter-method",
          label: "CUPS 队列预检适配器",
          status: "failed",
          tone: "danger",
          blocking: true,
          detail: "当前打印适配器未提供 CUPS 队列预检方法",
        },
      ],
      preflightResult: null,
      safeguards: {
        nonPrinting: true,
        commandValueExposed: false,
        commandArgsExposed: false,
        stdoutExposed: false,
        stderrExposed: false,
        payloadExposed: false,
        printFileCreated: false,
        physicalPrinterCalled: false,
      },
    };
  }
  return adapter.runCupsDiagnostics({
    operatorId,
    reason: "api_print_driver_cups_diagnostics",
  });
}

function getPrintDriverV1ReadinessResponse({ workspace, operatorId }) {
  return buildPrintDriverV1Readiness({
    workspace,
    operatorId,
    getConfiguration: getPrintDriverConfigurationResponse,
    getSpoolDiagnostics: getPrintDriverSpoolDiagnosticsResponse,
    getCupsDiagnostics: getPrintDriverCupsDiagnosticsResponse,
  });
}

function buildInitialProductionTasks(workspace) {
  const productionLines = (workspace.orderLines ?? []).filter((line) => {
    const status = String(line.status ?? line.lineStatus ?? "");
    return status.includes("制袋") || status.includes("丝印") || status.includes("待排产") || status.includes("待补印");
  });
  return productionLines.map((line, index) => {
    const productionTaskId = nextPlainId("PT", line.id ?? line.orderLineId ?? index + 1);
    const status = String(line.status ?? line.lineStatus ?? "");
    const machineId = status.includes("丝印") || status.includes("补印") ? "PRINT-01" : "BAG-01";
    return {
      id: productionTaskId,
      productionTaskId,
      bizNo: productionTaskId,
      orderLineId: line.id ?? line.orderLineId,
      lineId: line.id ?? line.orderLineId,
      taskType: status.includes("丝印") || status.includes("补印") ? "丝印" : "制袋",
      machineId,
      publishedScheduleId: status.includes("待排产") ? "" : nextPlainId("SCH", `${machineId}-${line.id ?? line.orderLineId ?? index + 1}`),
      plannedQty: Number(line.qty ?? line.originalQty ?? 0),
      qty: Number(line.qty ?? line.originalQty ?? 0),
      taskStatus: status || "待开始",
      status: status || "待开始",
      createdBy: "U-OFFICE-A",
      createdAt: new Date().toISOString(),
    };
  });
}

function buildInitialPackingTasks(workspace) {
  const packingLines = (workspace.orderLines ?? []).filter((line) => {
    const status = String(line.status ?? line.lineStatus ?? "");
    return status.includes("待打包");
  });
  return packingLines.map((line, index) => {
    const orderLineId = line.id ?? line.orderLineId ?? index + 1;
    const packingTaskId = nextPlainId("PKT", orderLineId);
    return {
      id: packingTaskId,
      packingTaskId,
      bizNo: packingTaskId,
      orderLineId,
      lineId: orderLineId,
      plannedQty: Number(line.qty ?? line.originalQty ?? 0),
      actualPackedQty: 0,
      qty: Number(line.qty ?? line.originalQty ?? 0),
      status: "待打包",
      createdBy: "U-OFFICE-A",
      createdAt: new Date().toISOString(),
    };
  });
}

function findProductionTask(workspace, id) {
  return (workspace.productionTasks ?? []).find((item) => item.id === id || item.productionTaskId === id);
}

function buildProductionTaskFromBody(workspace, productionTaskId, body) {
  const orderLineId = body.orderLineId ?? body.lineId ?? "";
  const orderLine = findOrderLine(workspace, orderLineId);
  if (!orderLine) return null;
  const taskType = body.processType ?? inferProductionTaskTypeFromOrderLine(orderLine);
  return {
    id: productionTaskId,
    productionTaskId,
    bizNo: body.bizNo ?? productionTaskId,
    orderLineId,
    lineId: orderLineId,
    taskType,
    machineId: body.machineId ?? inferProductionMachineIdFromTaskType(taskType),
    plannedQty: Number(body.plannedQty ?? orderLine.qty ?? orderLine.originalQty ?? 0),
    qty: Number(body.plannedQty ?? orderLine.qty ?? orderLine.originalQty ?? 0),
    taskStatus: "待开始",
    status: "待开始",
    createdBy: orderLine.createdBy ?? "",
    createdAt: body.createdAt ?? new Date().toISOString(),
  };
}

function inferProductionTaskTypeFromOrderLine(orderLine) {
  const status = cleanServerText(orderLine?.lineStatus ?? orderLine?.status);
  if (status.includes("丝印") || status.includes("补印")) return "丝印";
  return "制袋";
}

function inferProductionMachineIdFromTaskType(taskType) {
  return cleanServerText(taskType).includes("丝印") ? "PRINT-01" : "BAG-01";
}

function resolvePublishedProductionTaskStatus({ taskType, beforeTask, beforeOrderLine }) {
  const currentStatus = cleanServerText(beforeTask?.taskStatus ?? beforeTask?.status ?? beforeOrderLine?.lineStatus ?? beforeOrderLine?.status);
  if (!currentStatus || currentStatus.includes("待排产") || currentStatus === "待开始") {
    return `${cleanServerText(taskType) || "制袋"}已排产`;
  }
  return currentStatus;
}

function resolvePublishedProductionLineStatus({ taskType, beforeOrderLine, taskStatus }) {
  const currentStatus = cleanServerText(beforeOrderLine?.lineStatus ?? beforeOrderLine?.status);
  if (!currentStatus || currentStatus.includes("待排产")) return `${cleanServerText(taskType) || "制袋"}已排产`;
  return cleanServerText(taskStatus) || currentStatus;
}

function distributeIntegerQty(totalQty, packageCount) {
  const count = Math.max(1, Math.trunc(Number(packageCount)));
  const total = Math.max(0, Math.trunc(Number(totalQty)));
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function isReleasableInventoryReservation(reservation) {
  const status = String(reservation.status ?? "").trim();
  return status === "生效" || status === "active" || status === "reserved" || status === "部分释放" || status === "partially_released";
}

function mapInventoryReservationApiStatus(status) {
  const normalized = String(status ?? "").trim();
  if (normalized === "生效") return "active";
  if (normalized === "已释放") return "released";
  if (normalized === "部分释放") return "partially_released";
  if (normalized === "已出库") return "converted_to_outbound";
  return normalized || "active";
}

function summarizeOrderLineForChange(orderLine) {
  return {
    orderLineId: orderLine.orderLineId ?? orderLine.id,
    orderId: orderLine.orderId ?? orderLine.orderNo,
    customerId: orderLine.customerId,
    productName: orderLine.productName ?? orderLine.product,
    size: orderLine.size,
    bagColor: orderLine.bagColor ?? orderLine.color,
    handleType: orderLine.handleType ?? orderLine.handle,
    style: orderLine.style,
    originalQty: Number(orderLine.originalQty ?? orderLine.qty ?? 0),
    lineStatus: orderLine.lineStatus ?? orderLine.status,
    fulfillmentMethod: orderLine.fulfillmentMethod ?? orderLine.fulfillment,
    exceptionTags: orderLine.exceptionTags ?? orderLine.exceptions ?? [],
    voidReason: orderLine.voidReason ?? "",
    voidedBy: orderLine.voidedBy ?? "",
    voidedAt: orderLine.voidedAt ?? "",
  };
}

function buildOperationLog(workspace, input) {
  return {
    id: input.id ?? nextId("LOG", workspace.operationLogs),
    targetType: input.targetType,
    targetId: input.targetId,
    action: input.action,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason ?? "",
    operatorId: input.operatorId ?? "U-OFFICE-A",
    pageKey: input.pageKey ?? "api",
    occurredAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

function addOperationLog(workspace, input) {
  const operationLog = buildOperationLog(workspace, input);
  workspace.operationLogs.unshift(operationLog);
  return operationLog.id;
}

function cleanServerText(value) {
  return String(value ?? "").trim();
}

function compactTimestamp(value) {
  return cleanServerText(value).replace(/[-:T.Z]/g, "").slice(0, 14) || "NOW";
}

function safeRecordPart(value) {
  return cleanServerText(value).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "TASK";
}

function nextId(prefix, rows) {
  return `${prefix}-${String(rows.length + 1).padStart(3, "0")}`;
}

function nextPlainId(prefix, value) {
  return `${prefix}-${String(value).replace(/[^a-z0-9]+/gi, "-")}`;
}

function findFulfillment(workspace, id) {
  return workspace.fulfillments.find((item) => item.id === id || item.fulfillmentId === id);
}

async function findPrintJob(workspace, id) {
  const normalizedId = String(id ?? "").trim();
  if (!normalizedId) return null;
  const workspaceJob = (workspace.printJobs ?? []).find(
    (item) => item.printJobId === normalizedId || item.id === normalizedId,
  );
  if (workspaceJob) return workspaceJob;
  const items = await workspace.printJobRepository.listPrintJobs({ workspace, filters: {} });
  return items.find((item) => item.printJobId === normalizedId || item.id === normalizedId) ?? null;
}

async function findPrintDevice(workspace, id) {
  const normalizedId = String(id ?? "").trim();
  if (!normalizedId) return null;
  const workspaceDevice = (workspace.printDevices ?? []).find(
    (item) => item.printDeviceId === normalizedId || item.id === normalizedId,
  );
  if (workspaceDevice) return workspaceDevice;
  const items = await workspace.printDeviceRepository.listPrintDevices({ workspace, filters: {} });
  return items.find((item) => item.printDeviceId === normalizedId || item.id === normalizedId) ?? null;
}

function findOrderLine(workspace, id) {
  return workspace.orderLines.find((item) => item.id === id || item.orderLineId === id);
}

function findInventoryItem(workspace, id) {
  return workspace.inventories.find((item) => item.id === id);
}

function findInventoryCorrectionDraft(workspace, id) {
  return (workspace.inventoryCorrectionDrafts ?? []).find((item) => item.id === id || item.correctionDraftId === id);
}

function findInventoryReservation(workspace, id) {
  return (workspace.inventoryReservations ?? []).find((item) => item.id === id || item.reservationId === id);
}

function findStatement(workspace, id) {
  return workspace.statements.find((item) => item.id === id);
}

function findCustomerName(workspace, customerId) {
  return workspace.customers.find((customer) => customer.id === customerId)?.name ?? "";
}

function upsertByKey(rows = [], record, key) {
  const index = rows.findIndex((item) => item[key] === record[key] || item.id === record[key]);
  if (index === -1) return [record, ...rows];
  return rows.map((item, itemIndex) => (itemIndex === index ? record : item));
}

function buildCustomerSnapshot(workspace, customerId) {
  const customer = workspace.customers.find((item) => item.id === customerId) ?? {};
  return {
    customerId,
    name: customer.name ?? "",
    shortName: customer.shortName ?? customer.name ?? "",
    settlementCycle: customer.settlementCycle ?? "",
  };
}

function mapPrintSide(value) {
  if (value === "single") return "单面";
  if (value === "double") return "双面";
  if (value === "单面" || value === "双面") return value;
  return value || "非印刷";
}

function mapVarianceHandlingResult(value, fallback) {
  const map = {
    carry_to_debt: "未收差额转欠款",
    approved_allowance: "抹零/减免已审批",
    bill_needs_recalc: "账单有误待重算",
    waiting_more_payments: "多笔付款待齐",
    other: fallback || "其他",
  };
  return map[value] ?? fallback ?? value ?? "其他";
}

function buildCorsHeaders(response, options = {}) {
  const securityPolicy = response.erpSecurityPolicy;
  if (!securityPolicy?.strictAuth) {
    return {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
      "access-control-allow-headers": getCorsAllowedRequestHeaders(securityPolicy),
      ...(options.exposeHeaders ? { "access-control-expose-headers": options.exposeHeaders } : {}),
    };
  }

  const origin = String(response.erpRequestOrigin ?? "").trim();
  if (!isCorsRequestAllowed(securityPolicy, origin) || !origin) return {};
  return {
    "access-control-allow-origin": origin,
    vary: "Origin",
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    "access-control-allow-headers": getCorsAllowedRequestHeaders(securityPolicy),
    ...(options.exposeHeaders ? { "access-control-expose-headers": options.exposeHeaders } : {}),
  };
}

function sendJson(response, statusCode, payload) {
  const body = statusCode === 204 ? "" : JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...buildCorsHeaders(response),
  });
  response.end(body);
}

function sendFile(response, statusCode, body, options = {}) {
  const content = createResponseBuffer(body, options.contentEncoding);
  response.writeHead(statusCode, {
    "content-type": options.contentType ?? "application/octet-stream",
    "content-length": content.length,
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(options.fileName ?? "download.bin")}`,
    ...buildCorsHeaders(response, { exposeHeaders: "content-disposition, content-type" }),
  });
  response.end(content);
}

function createResponseBuffer(body, contentEncoding = "") {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  const content = String(body ?? "");
  return contentEncoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8");
}

function sendInlineFile(response, statusCode, content, options = {}) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content ?? "");
  response.writeHead(statusCode, {
    "content-type": options.contentType ?? "application/octet-stream",
    "content-length": buffer.length,
    "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(options.fileName ?? "attachment.bin")}`,
    ...buildCorsHeaders(response, { exposeHeaders: "content-disposition, content-type" }),
  });
  response.end(buffer);
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function sendNotFound(response, code) {
  return sendJson(response, 404, {
    code,
    message: "The requested seed route or record does not exist.",
  });
}

function sendBusinessError(response, statusCode, code, message, details = {}) {
  return sendJson(response, statusCode, { code, message, ...details });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const runtimeMode = parseRuntimeModeArg(process.argv.slice(2));
    const server = createApiServer(runtimeMode ? { runtimeMode } : {});
    await server.ready;
    const port = Number(process.env.ERP_API_PORT ?? 8787);
    const shutdownController = createGracefulShutdownController({
      server,
      closeResources: closeSharedPostgresPools,
      timeoutMs: process.env.ERP_API_SHUTDOWN_TIMEOUT_MS,
    });
    shutdownController.install();
    server.once("error", (error) => {
      console.error(`ERP API server error (${error?.code || "unknown"}).`);
      void shutdownController.shutdown("SERVER_ERROR");
    });
    server.listen(port, "127.0.0.1", () => {
      console.log(`ERP API (${runtimeMode || "auto"}) listening on http://127.0.0.1:${port}`);
    });
  } catch (error) {
    console.error(`ERP API startup failed: ${error.message}`);
    process.exitCode = 1;
  }
}
