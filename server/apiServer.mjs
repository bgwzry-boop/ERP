import http from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createGracefulShutdownController } from "./gracefulShutdown.mjs";
import { closeSharedPostgresPools } from "./postgresPoolClient.mjs";
import { makeTodo } from "../src/data/fixtures.js";
import { parseOrderText } from "../src/lib/orderParser.js";
import {
  authenticatePrototypeSeedUser,
  authenticateSeedUser,
  createSeedSession,
  getSeedUser,
  getRuntimeAccountSecurityPolicyResponse,
  getRuntimePasswordExpiresAt,
  getRuntimeUserSecurityState,
  hashRuntimeUserPassword,
  issueRuntimeUserTemporaryPassword,
  verifyRuntimeUserPassword,
  verifySeedSessionToken,
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
  STATEMENT_EXCEL_TEMPLATE_VERSION,
  buildStatementExcelMetadata,
  buildStatementExcelWorkbookBase64,
  getStatementExcelTemplateId,
} from "../src/domain/statementExcelTemplate.js";
import {
  DRIVER_DEVICE_FIELD_TEST_ITEMS,
  getDriverDeviceFieldTestSummary,
  normalizeDriverPackageLabelScanSample,
  normalizeDriverDeviceFieldTestChecks,
} from "../src/services/driverDeviceFieldTestClient.js";
import { normalizeDriverNativeCapabilityDiagnostics } from "../src/services/driverNativeCapabilityClient.js";
import {
  getPrinterDeviceFieldTestEvidenceSummary,
} from "../src/services/printerDeviceFieldTestClient.js";
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
import { applyV1FieldEvidenceIntakeFromFiles } from "../scripts/apply-v1-field-evidence-intake.mjs";
import { buildProductionEnvPreflight, parseEnvFile } from "../scripts/run-v1-production-env-preflight.mjs";
import { buildProductionEnvFileAuditReport } from "../scripts/run-v1-production-env-file-audit.mjs";
import { buildProductionEnvIntakeVerifyReport } from "../scripts/run-v1-production-env-intake-verify.mjs";
import { buildProductionEnvValuesDryRunProofReport } from "../scripts/run-v1-production-env-values-dry-run-proof-check.mjs";
import {
  buildHeaders as buildV1ReadinessHeaders,
  buildV1ReadinessReport,
  readV1ReadinessSources,
} from "../scripts/run-v1-readiness-check.mjs";
import { buildProductionGoLivePrecheckReport } from "../scripts/run-v1-production-go-live-precheck.mjs";
import { validateV1FieldEvidenceManifest } from "../scripts/v1FieldEvidenceManifest.mjs";
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
import { createInventoryCorrectionCommandService } from "./services/inventoryCorrectionCommandService.mjs";
import { createProductionFinishedGoodsPhotoCommandService } from "./services/productionFinishedGoodsPhotoCommandService.mjs";
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
import {
  createDriverDeviceFieldTestRepository,
  normalizeDriverDeviceFieldTestRecord,
} from "./driverDeviceFieldTestRepository.mjs";
import { createDriverDeliveryTaskReadRepository } from "./driverDeliveryTaskReadRepository.mjs";
import { createInventoryLedgerReadRepository } from "./inventoryLedgerReadRepository.mjs";
import { createInventoryReservationReleaseTransactionRepository } from "./inventoryReservationReleaseTransactionRepository.mjs";
import { createOrderLineVoidTransactionRepository } from "./orderLineVoidTransactionRepository.mjs";
import { createOrderLineQuantityAdjustmentTransactionRepository } from "./orderLineQuantityAdjustmentTransactionRepository.mjs";
import { createProductionPackingReadRepository } from "./productionPackingReadRepository.mjs";
import { createProductionPackingTransactionRepository } from "./productionPackingTransactionRepository.mjs";
import { createProductionScheduleRecordRepository } from "./productionScheduleRecordRepository.mjs";
import { createPrintBatchRepository } from "./printBatchRepository.mjs";
import {
  buildPrintDeviceSnapshot,
  createPrintDeviceRepository,
  filterPrintDevices,
} from "./printDeviceRepository.mjs";
import { createPrintDriverAdapter } from "./printDriverAdapter.mjs";
import { createPrintJobRepository } from "./printJobRepository.mjs";
import {
  createPrinterDeviceFieldTestRepository,
  filterPrinterDeviceFieldTests,
} from "./printerDeviceFieldTestRepository.mjs";
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
import { createMasterDataImportConfirmationPlan } from "../src/domain/masterDataImportConfirmationPlan.js";
import { createMasterDataImportExecution } from "../src/domain/masterDataImportExecution.js";
import { createMasterDataImportCorrectionDraftFromFailedRows } from "../src/domain/masterDataImportReviewQueue.js";

const API_DEFAULT_PORT = 8787;

const writeActionPermissions = {
  recognizeOrderDraft: "order.draft.recognize",
  saveOrderDraft: "order.draft.save",
  confirmOrderDraft: "order.confirm",
  voidOrderLine: "order.void",
  adjustOrderLineQuantity: "order.quantity.adjust",
  createInventoryCorrectionDraft: "inventory.correction.create",
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
  workspace.driverDeliveryDispatches = [];
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
  workspace.driverDeliveryDispatches = persistedDriverDeliveryDispatchState.driverDeliveryDispatches ?? [];
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
    return sendJson(response, 200, workspace);
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
        precheckPersistence: precheckSystemV1Persistence,
        precheckAttachmentRetention: precheckSystemV1AttachmentRetention,
        precheckDriverReadiness: precheckSystemV1DriverReadiness,
        precheckRuntimeReadiness: precheckSystemV1RuntimeReadiness,
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
      confirmInventoryCorrectionDraftRoute,
      releaseInventoryReservationRoute,
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
      writeActionPermissions,
      requireActionPermission,
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
      writeActionPermissions,
      requireActionPermission,
      recognizeOrderDraft,
      saveOrderDraft,
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
  if (bearerToken?.startsWith("seed-session.")) {
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
  const securityPolicy = getWorkspaceSecurityPolicy(workspace);
  const matchedRuntimeUser = findRuntimeUserByIdentifiers(workspace, {
    loginName: body.loginName,
    userId: body.userId,
  });
  if (matchedRuntimeUser) {
    return await loginRuntimeUserAuth({ response, workspace, body, runtimeUser: matchedRuntimeUser, securityPolicy });
  }

  if (!securityPolicy.allowSeedUsers) {
    return sendJson(response, 403, {
      code: "AUTH_SEED_LOGIN_DISABLED",
      message: "Seed-user login is disabled by the ERP API security policy.",
    });
  }

  const result = authenticateSeedUser(body, {
    runtimeUsers: workspace.users,
    authSecret: securityPolicy.authSecret,
  });
  if (!result.authenticated) {
    return sendJson(response, 401, result.error);
  }

  const runtimeUser = findRuntimeUserById(workspace, result.permissions.user.userId);
  const session = createSeedSession(result.permissions.user.userId, {
    sessionVersion: runtimeUser?.sessionVersion,
    authSecret: securityPolicy.authSecret,
  });
  return sendJson(response, 200, {
    session,
    permissions: result.permissions,
  });
}

async function loginPrototypeSeedAuth({ response, workspace, body }) {
  const securityPolicy = getWorkspaceSecurityPolicy(workspace);
  if (securityPolicy.strictAuth || !securityPolicy.allowSeedUsers) {
    return sendJson(response, 403, {
      code: "AUTH_SEED_LOGIN_DISABLED",
      message: "Prototype seed login is disabled by the ERP API security policy.",
    });
  }

  const result = authenticatePrototypeSeedUser(body.userId);
  if (!result.authenticated) {
    return sendJson(response, 401, result.error);
  }

  const runtimeUser = findRuntimeUserById(workspace, result.permissions.user.userId);
  const session = createSeedSession(result.permissions.user.userId, {
    sessionVersion: runtimeUser?.sessionVersion,
    authSecret: securityPolicy.authSecret,
  });
  return sendJson(response, 200, {
    session,
    permissions: result.permissions,
  });
}

async function loginRuntimeUserAuth({ response, workspace, body, runtimeUser, securityPolicy = getWorkspaceSecurityPolicy(workspace) }) {
  const nowMs = getAuthEventNowMs(body);
  const nowIso = new Date(nowMs).toISOString();
  const securityState = getRuntimeUserSecurityState(runtimeUser, { nowMs });
  if (securityState.locked) {
    return sendJson(response, 423, buildRuntimeAccountLockedError(securityState));
  }

  if (!runtimeUser.loginEnabled || !verifyRuntimeUserPassword(runtimeUser, body.password, { authSecret: securityPolicy.authSecret })) {
    const failedUser = recordRuntimeUserLoginFailure(workspace, runtimeUser, { nowMs });
    await persistRuntimeIdentityState(workspace);
    const failedSecurityState = getRuntimeUserSecurityState(failedUser, { nowMs });
    if (failedSecurityState.locked) {
      return sendJson(response, 423, buildRuntimeAccountLockedError(failedSecurityState));
    }
    return sendJson(response, 401, {
      code: "AUTHENTICATION_FAILED",
      message: "Login name, user ID, or password is invalid for the seed auth context.",
      securityPolicy: getRuntimeAccountSecurityPolicyResponse(),
    });
  }

  let authenticatedUser = resetRuntimeUserLoginFailures(workspace, runtimeUser, { updatedAt: nowIso });
  const postLoginSecurityState = getRuntimeUserSecurityState(authenticatedUser, { nowMs });
  if (postLoginSecurityState.passwordExpired) {
    authenticatedUser = markRuntimeUserPasswordExpired(workspace, authenticatedUser, {
      expiredAt: nowIso,
      passwordExpiresAt: postLoginSecurityState.passwordExpiresAt,
    });
  }
  await persistRuntimeIdentityState(workspace);

  const permissions = getEffectivePermissions(authenticatedUser.userId, { runtimeUsers: workspace.users });
  const session = createSeedSession(authenticatedUser.userId, {
    sessionVersion: authenticatedUser.sessionVersion,
    authSecret: securityPolicy.authSecret,
  });
  return sendJson(response, 200, {
    session,
    permissions,
  });
}

function buildRuntimeAccountLockedError(securityState = {}) {
  return {
    code: "AUTH_ACCOUNT_LOCKED",
    message: "Runtime employee account is temporarily locked after repeated failed login attempts.",
    lockedUntil: securityState.lockedUntil,
    retryAfterSeconds: securityState.retryAfterSeconds,
    failedLoginCount: securityState.failedLoginCount,
    securityPolicy: getRuntimeAccountSecurityPolicyResponse(),
  };
}

function getAuthEventNowMs(body = {}) {
  const requestedAt = cleanServerText(body.attemptedAt ?? body.loginAt ?? body.now);
  const requestedAtMs = Date.parse(requestedAt);
  return Number.isFinite(requestedAtMs) ? requestedAtMs : Date.now();
}

async function changeRuntimeUserPasswordRoute({ response, workspace, body, authContext }) {
  if (!authContext.authenticated || authContext.source !== "seed_session") {
    return sendJson(response, 401, {
      code: authContext.authError ?? "AUTH_SESSION_REQUIRED",
      message: "A valid seed session bearer token is required before changing password.",
    });
  }

  const userId = cleanServerText(authContext.userId);
  const runtimeUser = findRuntimeUserById(workspace, userId);
  if (!runtimeUser) {
    return sendBusinessError(
      response,
      409,
      "PASSWORD_CHANGE_NOT_SUPPORTED_FOR_SEED_USER",
      "Password changes are only supported for imported runtime employee accounts in the P0 skeleton.",
    );
  }

  const currentPassword = String(body.currentPassword ?? body.oldPassword ?? "");
  const newPassword = String(body.newPassword ?? "");
  const authSecret = getWorkspaceSecurityPolicy(workspace).authSecret;
  const policyError = validateRuntimePasswordChange({ currentPassword, newPassword, user: runtimeUser });
  if (policyError) {
    return sendBusinessError(response, 422, policyError.code, policyError.message, {
      passwordPolicy: getRuntimePasswordPolicyResponse(),
    });
  }
  if (!verifyRuntimeUserPassword(runtimeUser, currentPassword, { authSecret })) {
    return sendJson(response, 401, {
      code: "CURRENT_PASSWORD_INVALID",
      message: "Current password is invalid.",
    });
  }
  if (verifyRuntimeUserPassword(runtimeUser, newPassword, { authSecret })) {
    return sendBusinessError(
      response,
      422,
      "NEW_PASSWORD_MUST_DIFFER",
      "New password must be different from the current password.",
    );
  }

  const changedAt = cleanServerText(body.changedAt) || new Date().toISOString();
  const before = {
    userId: runtimeUser.userId ?? runtimeUser.id,
    loginName: runtimeUser.loginName,
    passwordStatus: runtimeUser.passwordStatus,
    mustChangePassword: runtimeUser.mustChangePassword === true,
    passwordIssuedAt: runtimeUser.passwordIssuedAt,
    passwordChangedAt: runtimeUser.passwordChangedAt,
  };
  const updatedUser = upsertRuntimeUser(workspace, {
    ...runtimeUser,
    loginEnabled: true,
    passwordHash: hashRuntimeUserPassword(newPassword, { userId, authSecret }),
    passwordStatus: "active",
    mustChangePassword: false,
    passwordChangedAt: changedAt,
    passwordChangedBy: userId,
    passwordExpiresAt: getRuntimePasswordExpiresAt({ passwordStatus: "active", passwordChangedAt: changedAt }),
    passwordExpiredAt: "",
    failedLoginCount: 0,
    lastFailedLoginAt: "",
    lockedUntil: "",
    updatedAt: changedAt,
  });
  const updatedEmployee = syncEmployeePasswordChange(workspace, updatedUser, { changedAt });
  const operationLog = buildOperationLog(workspace, {
    targetType: "master_data_employee_account_password",
    targetId: cleanServerText(updatedEmployee?.id) || cleanServerText(updatedUser.employeeId) || userId,
    action: "master_data_employee_account_password_changed",
    before,
    after: {
      userId: updatedUser.userId,
      loginName: updatedUser.loginName,
      passwordStatus: updatedUser.passwordStatus,
      mustChangePassword: updatedUser.mustChangePassword === true,
      passwordChangedAt: updatedUser.passwordChangedAt,
      passwordExpiresAt: updatedUser.passwordExpiresAt,
    },
    reason: cleanServerText(body.changeNote ?? body.note) || "员工首次登录后修改临时密码",
    operatorId: userId,
    pageKey: "auth",
  });
  workspace.operationLogs = Array.isArray(workspace.operationLogs) ? workspace.operationLogs : [];
  workspace.operationLogs.unshift(operationLog);
  await persistRuntimeIdentityState(workspace);

  return sendJson(response, 200, {
    changed: true,
    user: sanitizeRuntimeUserForResponse(updatedUser),
    permissions: getEffectivePermissions(userId, { runtimeUsers: workspace.users }),
    employeeAccountReview: updatedEmployee
      ? toMasterDataEmployeeAccountReview(
          updatedEmployee,
          new Map((workspace.users ?? []).map((item) => [cleanServerText(item.userId ?? item.id), item])),
        )
      : null,
    operationLogId: operationLog.id,
  });
}

function findRuntimeUserById(workspace, userId) {
  const safeUserId = cleanServerText(userId);
  if (!safeUserId) return null;
  return (
    (Array.isArray(workspace.users) ? workspace.users : []).find(
      (user) => cleanServerText(user?.userId ?? user?.id) === safeUserId && cleanServerText(user?.source) === "master_data_import_review",
    ) ?? null
  );
}

function findRuntimeUserByIdentifiers(workspace, identifiers = {}) {
  const safeLoginName = cleanServerText(identifiers.loginName);
  const safeUserId = cleanServerText(identifiers.userId);
  if (!safeLoginName && !safeUserId) return null;
  return (
    (Array.isArray(workspace.users) ? workspace.users : []).find((user) => {
      if (cleanServerText(user?.source) !== "master_data_import_review") return false;
      const userId = cleanServerText(user?.userId ?? user?.id);
      const loginName = cleanServerText(user?.loginName);
      return (safeUserId && userId === safeUserId) || (safeLoginName && loginName === safeLoginName);
    }) ?? null
  );
}

function recordRuntimeUserLoginFailure(workspace, runtimeUser, { nowMs }) {
  if (!runtimeUser?.loginEnabled) return runtimeUser;
  const failedLoginCount = Math.max(0, Number(runtimeUser.failedLoginCount) || 0) + 1;
  const policy = getRuntimeAccountSecurityPolicyResponse();
  const failedAt = new Date(nowMs).toISOString();
  const lockedUntil =
    failedLoginCount >= policy.maxFailedLoginAttempts
      ? new Date(nowMs + policy.lockoutMinutes * 60 * 1000).toISOString()
      : cleanServerText(runtimeUser.lockedUntil);
  return upsertRuntimeUser(workspace, {
    ...runtimeUser,
    failedLoginCount,
    lastFailedLoginAt: failedAt,
    lockedUntil,
    updatedAt: failedAt,
  });
}

function resetRuntimeUserLoginFailures(workspace, runtimeUser, { updatedAt }) {
  if (
    !Number(runtimeUser?.failedLoginCount) &&
    !cleanServerText(runtimeUser?.lastFailedLoginAt) &&
    !cleanServerText(runtimeUser?.lockedUntil)
  ) {
    return runtimeUser;
  }
  return upsertRuntimeUser(workspace, {
    ...runtimeUser,
    failedLoginCount: 0,
    lastFailedLoginAt: "",
    lockedUntil: "",
    updatedAt,
  });
}

function markRuntimeUserPasswordExpired(workspace, runtimeUser, { expiredAt, passwordExpiresAt }) {
  const updatedUser = upsertRuntimeUser(workspace, {
    ...runtimeUser,
    mustChangePassword: true,
    passwordStatus: "password_expired",
    passwordExpiresAt,
    passwordExpiredAt: expiredAt,
    updatedAt: expiredAt,
  });
  syncEmployeePasswordExpired(workspace, updatedUser, { expiredAt, passwordExpiresAt });
  return updatedUser;
}

const runtimePasswordPolicy = Object.freeze({
  minLength: 10,
  requireLetter: true,
  requireNumber: true,
  allowWhitespace: false,
  disallowAccountIdentifiers: true,
});

function getRuntimePasswordPolicyResponse() {
  return {
    ...runtimePasswordPolicy,
    description: "至少 10 位，必须同时包含字母和数字，不能包含空白字符，不能包含登录名、用户 ID 或员工 ID。",
  };
}

function validateRuntimePasswordChange({ currentPassword, newPassword, user = {} }) {
  if (!currentPassword) {
    return { code: "CURRENT_PASSWORD_REQUIRED", message: "Current password is required." };
  }
  if (!newPassword) {
    return { code: "NEW_PASSWORD_REQUIRED", message: "New password is required." };
  }
  if (newPassword.length < runtimePasswordPolicy.minLength) {
    return {
      code: "NEW_PASSWORD_TOO_SHORT",
      message: `New password must be at least ${runtimePasswordPolicy.minLength} characters.`,
    };
  }
  if (/\s/.test(newPassword)) {
    return { code: "NEW_PASSWORD_CONTAINS_SPACE", message: "New password must not contain spaces." };
  }
  if (!/[A-Za-z]/.test(newPassword)) {
    return { code: "NEW_PASSWORD_REQUIRES_LETTER", message: "New password must contain at least one letter." };
  }
  if (!/[0-9]/.test(newPassword)) {
    return { code: "NEW_PASSWORD_REQUIRES_NUMBER", message: "New password must contain at least one number." };
  }
  const normalizedNewPassword = newPassword.toLowerCase();
  const blockedIdentifiers = [
    user.loginName,
    user.userId,
    user.id,
    user.employeeId,
  ]
    .map((item) => cleanServerText(item).toLowerCase())
    .filter((item) => item.length >= 4);
  if (blockedIdentifiers.some((item) => normalizedNewPassword.includes(item))) {
    return {
      code: "NEW_PASSWORD_CONTAINS_ACCOUNT_IDENTIFIER",
      message: "New password must not contain the login name, user ID, or employee ID.",
    };
  }
  return null;
}

function syncEmployeePasswordChange(workspace, user, { changedAt }) {
  const userId = cleanServerText(user?.userId ?? user?.id);
  if (!userId || !Array.isArray(workspace.employees)) return null;
  const index = workspace.employees.findIndex((employee) => cleanServerText(employee.userId) === userId);
  if (index < 0) return null;
  workspace.employees[index] = {
    ...workspace.employees[index],
    loginEnabled: true,
    passwordStatus: "active",
    mustChangePassword: false,
    passwordChangedAt: changedAt,
    passwordChangedBy: userId,
    passwordExpiresAt: getRuntimePasswordExpiresAt({ passwordStatus: "active", passwordChangedAt: changedAt }),
    passwordExpiredAt: "",
    failedLoginCount: 0,
    lastFailedLoginAt: "",
    lockedUntil: "",
    updatedAt: changedAt,
  };
  return workspace.employees[index];
}

function syncEmployeePasswordExpired(workspace, user, { expiredAt, passwordExpiresAt }) {
  const userId = cleanServerText(user?.userId ?? user?.id);
  if (!userId || !Array.isArray(workspace.employees)) return null;
  const index = workspace.employees.findIndex((employee) => cleanServerText(employee.userId) === userId);
  if (index < 0) return null;
  workspace.employees[index] = {
    ...workspace.employees[index],
    passwordStatus: "password_expired",
    mustChangePassword: true,
    passwordExpiresAt,
    passwordExpiredAt: expiredAt,
    updatedAt: expiredAt,
  };
  return workspace.employees[index];
}

function getCurrentAuthSession({ response, permissionContext, authContext }) {
  if (!authContext.authenticated || authContext.source !== "seed_session") {
    return sendJson(response, 401, {
      code: authContext.authError ?? "AUTH_SESSION_REQUIRED",
      message: "A valid seed session bearer token is required.",
    });
  }

  return sendJson(response, 200, {
    authenticated: true,
    session: authContext.session,
    permissions: permissionContext,
  });
}

async function logoutSeedAuth({ response, workspace, authContext }) {
  const sessionJti = cleanServerText(authContext?.session?.jti);
  if (authContext.authenticated && sessionJti) {
    workspace.revokedSeedSessionJtis = Array.isArray(workspace.revokedSeedSessionJtis) ? workspace.revokedSeedSessionJtis : [];
    if (!workspace.revokedSeedSessionJtis.includes(sessionJti)) {
      workspace.revokedSeedSessionJtis.unshift(sessionJti);
    }
    workspace.revokedSeedSessions = Array.isArray(workspace.revokedSeedSessions) ? workspace.revokedSeedSessions : [];
    if (!workspace.revokedSeedSessions.some((item) => cleanServerText(item?.jti) === sessionJti)) {
      workspace.revokedSeedSessions.unshift({
        jti: sessionJti,
        userId: cleanServerText(authContext.userId),
        revokedAt: new Date().toISOString(),
        expiresAt: cleanServerText(authContext.session?.expiresAt),
        reason: "logout",
        source: "seed_session_logout",
      });
    }
    await persistRuntimeIdentityState(workspace);
  }
  return sendJson(response, 200, {
    loggedOut: true,
    tokenRevoked: Boolean(sessionJti),
    sessionUserId: authContext.authenticated ? authContext.userId : null,
    message: sessionJti
      ? "Seed session token has been revoked for the current API process."
      : "No valid seed session token was provided; discard the token on the client.",
  });
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
  return {
    todoId: todo.id,
    type: todo.type,
    customerId: todo.customerId,
    refType: inferTodoRefType(todo),
    refId: todo.ref,
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

function buildFulfillmentDispatchProjection(fulfillment, dispatch) {
  if (!fulfillment || !dispatch) return fulfillment;
  return {
    ...fulfillment,
    driverId: dispatch.driverId ?? "",
    routeDate: dispatch.routeDate ?? "",
    routeNo: dispatch.routeNo ?? dispatch.routeBatchNo ?? "",
    routeBatchNo: dispatch.routeBatchNo ?? dispatch.routeNo ?? "",
    routeSequence: Number(dispatch.routeSequence ?? dispatch.stopSequence ?? 0),
    stopSequence: Number(dispatch.stopSequence ?? dispatch.routeSequence ?? 0),
    dispatchStatus: dispatch.dispatchStatus ?? "",
    plannedDepartureAt: dispatch.plannedDepartureAt ?? "",
    dispatchAssignedAt: dispatch.assignedAt ?? dispatch.dispatchAssignedAt ?? "",
    dispatchRemark: dispatch.remark ?? "",
  };
}

function applyFulfillmentDispatchProjection(workspace, fulfillmentId, dispatch) {
  const index = (workspace.fulfillments ?? []).findIndex((item) => item.id === fulfillmentId || item.fulfillmentId === fulfillmentId);
  if (index < 0) return null;
  const projected = buildFulfillmentDispatchProjection(workspace.fulfillments[index], dispatch);
  workspace.fulfillments[index] = projected;
  return projected;
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

function normalizeOptionalTimestampInput(value) {
  const timestamp = String(value ?? "").trim();
  if (!timestamp) return "";
  if (!Number.isFinite(Date.parse(timestamp))) return null;
  return new Date(timestamp).toISOString();
}

function normalizeDateInput(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(`${text}T00:00:00.000Z`))) return text;
  if (!Number.isFinite(Date.parse(text))) return "";
  return new Date(text).toISOString().slice(0, 10);
}

async function recognizeOrderDraft({ response, workspace, body }) {
  const sourceText = body.sourceText ?? body.text ?? workspace.sampleText;
  const lines = parseOrderText(sourceText, { customers: workspace.customers, inventories: workspace.inventories });
  const draftId =
    body.draftId ??
    (body.idempotencyKey
      ? `DRAFT-API-${createHash("sha256").update(body.idempotencyKey).digest("hex").slice(0, 16).toUpperCase()}`
      : nextId("DRAFT-API", workspace.orderDrafts));
  const customerId = body.customerId ?? lines[0]?.customerId ?? "";
  const draft = buildDraftProjection(null, {
    id: draftId,
    draftId,
    sourceText,
    sourceChannel: body.sourceChannel ?? "manual",
    sourceMessageId: body.sourceMessageId ?? "",
    customerId,
    customerName: findCustomerName(workspace, customerId),
    status: "待审核",
    lines,
    revision: 0,
    clientRevision: 0,
    createdBy: body.operatorId ?? "U-OFFICE-A",
  });
  const operationLog = buildOperationLog(workspace, {
    id: buildDraftOperationLogId("recognize", draftId, 1, body.idempotencyKey),
    targetType: "order_draft",
    targetId: draftId,
    action: "recognize_order_draft",
    operatorId: body.operatorId ?? "U-OFFICE-A",
    after: { lineCount: lines.length, sourceText },
  });
  const transaction = await workspace.orderDraftRepository.saveOrderDraft({
    workspace,
    draft,
    expectedRevision: 0,
    todos: [],
    operationLog,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: body,
  });
  const savedLines = transaction.draft.lines;

  return sendJson(response, 200, {
    draft: summarizeDraft(transaction.draft),
    lines: savedLines.map(toRecognizedDraftLine),
    riskHints: buildDraftRiskHints(savedLines),
    operationLogId: transaction.operationLogId,
  });
}

async function saveOrderDraft({ response, workspace, draftId, body }) {
  const lines = normalizeDraftRows(body.lines ?? [], workspace, body);
  if (!lines.length) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "lines must contain at least one draft line");
  }
  const expectedRevision = parseDraftExpectedRevision(body.clientRevision);
  if (!expectedRevision) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "clientRevision must be a positive integer");
  }
  const previous = await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId });
  if (!previous) return sendNotFound(response, "ORDER_DRAFT_NOT_FOUND");
  const draft = buildDraftProjection(previous, {
    id: draftId,
    draftId,
    sourceText: body.sourceText ?? previous?.sourceText ?? "",
    sourceChannel: body.sourceChannel ?? previous?.sourceChannel ?? "manual",
    sourceMessageId: body.sourceMessageId ?? previous?.sourceMessageId ?? "",
    customerId: body.customerId ?? previous?.customerId ?? lines[0]?.customerId ?? "",
    customerName: findCustomerName(workspace, body.customerId ?? previous?.customerId ?? lines[0]?.customerId),
    status: body.draftStatus ?? "待审核",
    lines,
    revision: expectedRevision,
    clientRevision: expectedRevision,
  });
  const todos =
    draft.status === "待补充信息"
      ? [
          buildTodo(workspace, {
            id: nextPlainId("T-DRAFT", draftId),
            type: "订单草稿待确认",
            customerId: draft.customerId || "C001",
            ref: draftId,
            refType: "order_draft",
            refId: draftId,
            summary: `${lines.length} 行草稿需要补充信息`,
            latest: lines[0]?.latest ?? "待确认",
            urgency: "普通",
            impact: "草稿未生成正式订单",
            createdBy: body.operatorId ?? "U-OFFICE-A",
          }),
        ]
      : [];
  const operationLog = buildOperationLog(workspace, {
    id: buildDraftOperationLogId("save", draftId, expectedRevision + 1, body.idempotencyKey),
    targetType: "order_draft",
    targetId: draftId,
    action: "save_order_draft",
    operatorId: body.operatorId ?? "U-OFFICE-A",
    before: previous,
    after: summarizeDraft(draft),
    reason: body.saveReason,
  });
  const transaction = await workspace.orderDraftRepository.saveOrderDraft({
    workspace,
    draft,
    expectedRevision,
    todos,
    operationLog,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: body,
  });

  return sendJson(response, 200, {
    draft: summarizeDraft(transaction.draft),
    todos: transaction.todos.map(toTodoSummary),
    operationLogId: transaction.operationLogId,
  });
}

async function confirmOrderDraftRoute({ response, workspace, draftId, body }) {
  const lines = normalizeDraftRows(body.lines ?? [], workspace, body);
  if (!lines.length) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "lines must contain at least one draft line");
  }
  const expectedRevision = parseDraftExpectedRevision(body.clientRevision);
  if (!expectedRevision) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "clientRevision must be a positive integer");
  }
  const previous = await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId });
  if (!previous) return sendNotFound(response, "ORDER_DRAFT_NOT_FOUND");
  const result = confirmDraftOrder({
    draftRows: lines,
    inventoryRecords: workspace.inventories,
    orderLines: workspace.orderLines,
    fulfillments: workspace.fulfillments,
    customers: workspace.customers,
  });
  if (result.blocked) {
    const blockedDraft = buildDraftProjection(previous, {
      id: draftId,
      draftId,
      sourceText: body.sourceText ?? previous.sourceText ?? "",
      customerId: body.customerId ?? previous.customerId ?? lines[0]?.customerId ?? "",
      customerName: findCustomerName(workspace, body.customerId ?? previous.customerId ?? lines[0]?.customerId),
      status: result.draftStatus,
      lines: result.checkedRows,
      revision: expectedRevision,
      clientRevision: expectedRevision,
    });
    const operationLog = buildOperationLog(workspace, {
      id: buildDraftOperationLogId("blocked", draftId, expectedRevision + 1, body.idempotencyKey),
      targetType: "order_draft",
      targetId: draftId,
      action: "block_order_draft_confirmation",
      operatorId: body.operatorId ?? "U-OFFICE-A",
      before: summarizeDraft(previous),
      after: summarizeDraft(blockedDraft),
      reason: result.toast,
    });
    await workspace.orderDraftRepository.saveOrderDraft({
      workspace,
      draft: blockedDraft,
      expectedRevision,
      todos: [],
      operationLog,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: body,
    });
    return sendBusinessError(response, 409, "ORDER_DRAFT_BLOCKED", result.toast);
  }

  const confirmedDraft = buildDraftProjection(previous, {
    id: draftId,
    draftId,
    sourceText: body.sourceText ?? previous.sourceText ?? "",
    customerId: body.customerId ?? previous.customerId ?? lines[0]?.customerId ?? "",
    customerName: findCustomerName(workspace, body.customerId ?? previous.customerId ?? lines[0]?.customerId),
    status: result.draftStatus,
    lines: result.checkedRows,
    generatedOrderNo: result.orderNo,
    revision: expectedRevision,
    clientRevision: expectedRevision,
  });
  const operationLog = buildOperationLog(workspace, {
    id: buildDraftOperationLogId("confirm", draftId, expectedRevision + 1, body.idempotencyKey),
    targetType: "order_draft",
    targetId: draftId,
    action: "confirm_order_draft",
    operatorId: body.operatorId ?? "U-OFFICE-A",
    after: { orderNo: result.orderNo, lineCount: result.newLines.length },
  });
  const priceSnapshots = result.newLines.map((line) => ({
    ...toPriceSnapshot(line),
    priceSnapshotId: `PS-${line.id}`,
    snapshotType: "order_confirm",
    versionNo: 1,
    chargeableQty: Number(line.qty ?? 0),
    finalAmount: Number(line.amount ?? 0),
    createdBy: body.operatorId ?? "U-OFFICE-A",
  }));
  const operatorId = body.operatorId ?? "U-OFFICE-A";
  const inventoryReservations = buildOrderConfirmationInventoryReservations(
    workspace,
    result.checkedRows,
    result.newLines,
    operatorId,
  );
  const inventoryLedgerEntries = buildOrderConfirmationInventoryLedgerEntries(workspace, inventoryReservations, operatorId);
  const todos = buildOrderConfirmationTodos(workspace, result.shortageTodoInputs, operatorId);
  const transaction = await workspace.orderConfirmationTransactionRepository.confirmOrder({
    workspace,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: body,
    orderDraft: confirmedDraft,
    expectedDraftRevision: expectedRevision,
    order: buildConfirmedOrderRecord(workspace, draftId, result, body),
    orderLines: result.newLines.map((line) => ({ ...line, createdBy: body.operatorId ?? "U-OFFICE-A" })),
    priceSnapshots,
    fulfillmentRecords: result.newFulfillments.map((fulfillment) => ({
      ...fulfillment,
      expectedQty: fulfillment.qty,
      createdBy: body.operatorId ?? "U-OFFICE-A",
      customerSnapshot: buildCustomerSnapshot(workspace, fulfillment.customerId),
    })),
    inventoryReservations,
    inventoryLedgerEntries,
    todos,
    operationLog,
  });

  return sendJson(response, 200, {
    orderId: transaction.order.orderId,
    orderSummaryStatus: "处理中",
    orderLines: result.newLines.map(toOrderLineSummary),
    priceSnapshots: result.newLines.map(toPriceSnapshot),
    inventoryChecks: result.checkedRows.map((line, index) => toInventoryCheckResult(workspace, line, result.newLines[index])),
    reservations: transaction.inventoryReservations.map(toInventoryReservationTransactionSummary),
    fulfillmentTasks: result.newFulfillments.map(toFulfillmentTaskSummary),
    todos: transaction.todos.map(toTodoSummary),
    operationLogIds: [transaction.operationLogId],
  });
}

async function voidOrderLineRoute({ response, workspace, orderLineId, body }) {
  const before = findOrderLine(workspace, orderLineId);
  if (!before) return sendNotFound(response, "ORDER_LINE_NOT_FOUND");
  if (body.orderLineId && body.orderLineId !== orderLineId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "orderLineId in path and body must match");
  }
  if (!isVoidableOrderLine(before, workspace)) {
    return sendBusinessError(response, 409, "ORDER_LINE_NOT_VOIDABLE", "Delivered, closed, or production-started order lines cannot be voided directly.");
  }

  const operatorId = body.operatorId ?? "U-OFFICE-A";
  const reasonCode = body.reason ?? "order_cancelled";
  const reason = mapOrderLineVoidReason(reasonCode, body.reasonText);
  const voidedAt = body.voidedAt ?? new Date().toISOString();
  const afterOrderLine = {
    ...before,
    orderLineId: before.orderLineId ?? before.id,
    orderId: before.orderId ?? before.orderNo,
    lineStatus: "已关闭",
    status: "已关闭",
    exceptionTags: appendUniqueText(before.exceptionTags ?? before.exceptions ?? [], "订单已作废"),
    exceptions: appendUniqueText(before.exceptions ?? before.exceptionTags ?? [], "订单已作废"),
    closedAt: voidedAt,
    voidedAt,
    voidedBy: operatorId,
    voidReason: reason,
  };
  const fulfillmentRecords = (workspace.fulfillments ?? [])
    .filter((fulfillment) => (fulfillment.lineId ?? fulfillment.orderLineId) === orderLineId)
    .filter((fulfillment) => !String(fulfillment.status ?? "").includes("已交付"))
    .map((fulfillment) => ({
      ...fulfillment,
      fulfillmentId: fulfillment.fulfillmentId ?? fulfillment.id,
      orderLineId: fulfillment.orderLineId ?? fulfillment.lineId,
      status: "已取消",
      confirmedBy: operatorId,
    }));
  const inventoryRelease = buildOrderLineVoidInventoryRelease(workspace, {
    orderLineId,
    operatorId,
    reason,
  });
  const orderLineChangeRecord = {
    changeRecordId: nextPlainId("OLCR", `${orderLineId}-VOID-${(workspace.orderLineChangeRecords ?? []).length + 1}`),
    orderLineId,
    changedFields: ["line_status", "void_reason", "inventory_reservation"],
    before: summarizeOrderLineForChange(before),
    after: summarizeOrderLineForChange(afterOrderLine),
    reason,
    documentReprintRequired: fulfillmentRecords.some((fulfillment) => String(fulfillment.status ?? "") === "已取消"),
    changedBy: operatorId,
    createdAt: voidedAt,
  };
  const operationLog = buildOperationLog(workspace, {
    targetType: "order_line",
    targetId: orderLineId,
    action: "void_order_line",
    operatorId,
    before: summarizeOrderLineForChange(before),
    after: {
      ...summarizeOrderLineForChange(afterOrderLine),
      releasedReservationIds: inventoryRelease.inventoryReservations.map((reservation) => reservation.reservationId),
      canceledFulfillmentIds: fulfillmentRecords.map((fulfillment) => fulfillment.fulfillmentId),
    },
    reason,
  });
  const transaction = await workspace.orderLineVoidTransactionRepository.voidOrderLine({
    workspace,
    orderLine: afterOrderLine,
    fulfillmentRecords,
    inventoryReservations: inventoryRelease.inventoryReservations,
    inventoryAdjustments: inventoryRelease.inventoryAdjustments,
    inventoryLedgerEntries: inventoryRelease.inventoryLedgerEntries,
    orderLineChangeRecord,
    operationLog,
  });

  return sendJson(response, 200, {
    orderLineId,
    status: transaction.orderLine?.lineStatus ?? "已关闭",
    releasedReservations: transaction.inventoryReservations.map(toInventoryReservationTransactionSummary),
    canceledFulfillmentIds: transaction.fulfillmentRecords.map((fulfillment) => fulfillment.fulfillmentId),
    inventoryLedgerIds: transaction.inventoryLedgerEntries.map((ledger) => ledger.ledgerId),
    orderLineChangeRecordId: transaction.orderLineChangeRecordId,
    operationLogId: transaction.operationLogId,
  });
}

async function adjustOrderLineQuantityRoute({ response, workspace, orderLineId, body }) {
  const before = findOrderLine(workspace, orderLineId);
  if (!before) return sendNotFound(response, "ORDER_LINE_NOT_FOUND");
  if (body.orderLineId && body.orderLineId !== orderLineId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "orderLineId in path and body must match");
  }
  if (!isQuantityAdjustableOrderLine(before, workspace)) {
    return sendBusinessError(
      response,
      409,
      "ORDER_LINE_QUANTITY_NOT_ADJUSTABLE",
      "Delivered, closed, or production-started order lines cannot be quantity-adjusted directly.",
    );
  }

  const previousQty = getOrderLineOriginalQty(before);
  const newQty = Math.trunc(Number(body.newQty ?? body.qty ?? body.originalQty));
  if (!Number.isFinite(newQty) || newQty <= 0) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "newQty must be a positive integer.");
  }
  if (newQty === previousQty) {
    return sendBusinessError(response, 409, "ORDER_LINE_QUANTITY_UNCHANGED", "newQty must be different from the current order quantity.");
  }

  const operatorId = body.operatorId ?? "U-OFFICE-A";
  const adjustedAt = body.adjustedAt ?? new Date().toISOString();
  const reason = mapOrderLineQuantityAdjustmentReason(body.reason ?? "customer_change", body.reasonText);
  const qtyDelta = newQty - previousQty;
  const financialChange = buildOrderLineQuantityAdjustmentFinancialChange(workspace, {
    orderLine: before,
    orderLineId,
    previousQty,
    newQty,
    operatorId,
    reason,
    adjustedAt,
  });
  const afterOrderLine = {
    ...before,
    orderLineId: before.orderLineId ?? before.id,
    orderId: before.orderId ?? before.orderNo,
    originalQty: newQty,
    qty: newQty,
    amount: financialChange.priceSnapshot.finalAmount,
    lineStatus: before.lineStatus ?? before.status ?? "待出库",
    status: before.status ?? before.lineStatus ?? "待出库",
    exceptionTags: before.exceptionTags ?? before.exceptions ?? [],
    exceptions: before.exceptions ?? before.exceptionTags ?? [],
  };
  const fulfillmentRecords = (workspace.fulfillments ?? [])
    .filter((fulfillment) => (fulfillment.lineId ?? fulfillment.orderLineId) === orderLineId)
    .filter((fulfillment) => {
      const status = String(fulfillment.status ?? "");
      return !status.includes("已交付") && !status.includes("已取消");
    })
    .map((fulfillment) => ({
      ...fulfillment,
      fulfillmentId: fulfillment.fulfillmentId ?? fulfillment.id,
      orderLineId: fulfillment.orderLineId ?? fulfillment.lineId,
      expectedQty: newQty,
      qty: newQty,
      confirmedBy: operatorId,
    }));
  const inventoryChange = buildOrderLineQuantityAdjustmentInventoryChange(workspace, {
    orderLineId,
    previousQty,
    newQty,
    qtyDelta,
    operatorId,
    reason,
  });
  if (!inventoryChange.ok) {
    return sendBusinessError(response, inventoryChange.statusCode, inventoryChange.code, inventoryChange.message);
  }

  const changedFields = ["original_qty"];
  if (fulfillmentRecords.length > 0) changedFields.push("fulfillment_expected_qty");
  if (inventoryChange.inventoryReservations.length > 0) changedFields.push("inventory_reservation");
  if (financialChange.priceSnapshot) changedFields.push("price_snapshot");
  if (financialChange.statementLines.length > 0) changedFields.push("statement_amount");
  const beforeSummary = summarizeOrderLineForChange(before);
  const afterSummary = summarizeOrderLineForChange(afterOrderLine);
  const orderLineChangeRecord = {
    changeRecordId: nextPlainId("OLCR", `${orderLineId}-QTY-${newQty}-${(workspace.orderLineChangeRecords ?? []).length + 1}`),
    orderLineId,
    changedFields,
    before: beforeSummary,
    after: {
      ...afterSummary,
      previousQty,
      qtyDelta,
      finalAmount: financialChange.priceSnapshot.finalAmount,
      priceSnapshotId: financialChange.priceSnapshot.priceSnapshotId,
      adjustedReservationIds: inventoryChange.inventoryReservations.map((reservation) => reservation.reservationId),
      adjustedStatementLineIds: financialChange.statementLines.map((line) => line.statementLineId),
    },
    reason,
    documentReprintRequired: fulfillmentRecords.length > 0,
    changedBy: operatorId,
    createdAt: adjustedAt,
  };
  const operationLog = buildOperationLog(workspace, {
    targetType: "order_line",
    targetId: orderLineId,
    action: "adjust_order_line_quantity",
    operatorId,
    before: beforeSummary,
    after: {
      ...afterSummary,
      previousQty,
      qtyDelta,
      finalAmount: financialChange.priceSnapshot.finalAmount,
      priceSnapshotId: financialChange.priceSnapshot.priceSnapshotId,
      adjustedReservationIds: inventoryChange.inventoryReservations.map((reservation) => reservation.reservationId),
      adjustedFulfillmentIds: fulfillmentRecords.map((fulfillment) => fulfillment.fulfillmentId),
      adjustedStatementLineIds: financialChange.statementLines.map((line) => line.statementLineId),
      adjustedStatementIds: financialChange.statementRecords.map((statement) => statement.statementId),
    },
    reason,
  });
  const transaction = await workspace.orderLineQuantityAdjustmentTransactionRepository.adjustOrderLineQuantity({
    workspace,
    orderLine: afterOrderLine,
    fulfillmentRecords,
    priceSnapshots: [financialChange.priceSnapshot],
    inventoryReservations: inventoryChange.inventoryReservations,
    inventoryAdjustments: inventoryChange.inventoryAdjustments,
    inventoryLedgerEntries: inventoryChange.inventoryLedgerEntries,
    statementLines: financialChange.statementLines,
    statementRecords: financialChange.statementRecords,
    orderLineChangeRecord,
    operationLog,
  });

  return sendJson(response, 200, {
    orderLineId,
    previousQty,
    newQty,
    qtyDelta,
    status: transaction.orderLine?.lineStatus ?? afterOrderLine.lineStatus,
    adjustedReservations: transaction.inventoryReservations.map(toInventoryReservationTransactionSummary),
    adjustedFulfillmentIds: transaction.fulfillmentRecords.map((fulfillment) => fulfillment.fulfillmentId),
    inventoryLedgerIds: transaction.inventoryLedgerEntries.map((ledger) => ledger.ledgerId),
    priceSnapshot: transaction.priceSnapshots[0] ?? financialChange.priceSnapshot,
    finalAmount: transaction.priceSnapshots[0]?.finalAmount ?? financialChange.priceSnapshot.finalAmount,
    adjustedStatementLines: transaction.statementLines,
    adjustedStatements: transaction.statementRecords,
    orderLineChangeRecordId: transaction.orderLineChangeRecordId,
    operationLogId: transaction.operationLogId,
  });
}

function buildOrderLineQuantityAdjustmentFinancialChange(workspace, input) {
  const latestSnapshot = findLatestPriceSnapshotForOrderLine(workspace, input.orderLineId);
  const currentAmount = Number(latestSnapshot?.finalAmount ?? latestSnapshot?.amount ?? input.orderLine.amount ?? 0);
  const currentChargeableQty = Number(latestSnapshot?.chargeableQty ?? input.previousQty ?? 0);
  const otherFee = Number(latestSnapshot?.otherFee ?? 0);
  const adjustmentAmount = Number(latestSnapshot?.adjustmentAmount ?? 0);
  const variableAmount = currentAmount - otherFee - adjustmentAmount;
  const derivedUnitPrice = currentChargeableQty > 0 ? variableAmount / currentChargeableQty : 0;
  const snapshotComponentUnitPrice = Number(latestSnapshot?.bagPrice ?? 0) + Number(latestSnapshot?.printPrice ?? 0);
  const canKeepSnapshotComponents = latestSnapshot && snapshotComponentUnitPrice > 0 && Math.abs(snapshotComponentUnitPrice - derivedUnitPrice) < 0.0001;
  const bagPrice = canKeepSnapshotComponents ? Number(latestSnapshot.bagPrice ?? 0) : derivedUnitPrice;
  const printPrice = canKeepSnapshotComponents ? Number(latestSnapshot.printPrice ?? 0) : 0;
  const lineAmount = roundMoney((bagPrice + printPrice) * input.newQty);
  const finalAmount = roundMoney(lineAmount + otherFee + adjustmentAmount);
  const versionNo = getNextQuantityAdjustmentPriceVersion(workspace, input.orderLineId);
  const priceSnapshot = {
    priceSnapshotId: nextPlainId("PS", `${input.orderLineId}-QTY-${versionNo}`),
    orderLineId: input.orderLineId,
    snapshotType: "quantity_adjustment",
    versionNo,
    bagPrice: roundMoney(bagPrice),
    printPrice: roundMoney(printPrice),
    otherFee,
    adjustmentAmount,
    chargeableQty: input.newQty,
    finalAmount,
    amount: finalAmount,
    overrideReason: `订单改量 ${input.previousQty} -> ${input.newQty}，按原订单单价重算`,
    createdBy: input.operatorId,
    createdAt: input.adjustedAt,
  };
  const statementLines = buildAdjustedStatementLinesForOrderLine(workspace, {
    orderLineId: input.orderLineId,
    newQty: input.newQty,
    lineAmount,
    finalAmount,
  });
  const statementRecords = buildAdjustedStatementRecords(workspace, statementLines);
  return {
    priceSnapshot,
    statementLines,
    statementRecords,
  };
}

function findLatestPriceSnapshotForOrderLine(workspace, orderLineId) {
  return [...(workspace.priceSnapshots ?? [])]
    .filter((snapshot) => (snapshot.orderLineId ?? snapshot.order_line_id) === orderLineId)
    .sort((left, right) => {
      const leftCreated = Date.parse(left.createdAt ?? left.created_at ?? "") || 0;
      const rightCreated = Date.parse(right.createdAt ?? right.created_at ?? "") || 0;
      if (rightCreated !== leftCreated) return rightCreated - leftCreated;
      return Number(right.versionNo ?? right.version_no ?? 0) - Number(left.versionNo ?? left.version_no ?? 0);
    })[0] ?? null;
}

function getNextQuantityAdjustmentPriceVersion(workspace, orderLineId) {
  const versions = (workspace.priceSnapshots ?? [])
    .filter((snapshot) => (snapshot.orderLineId ?? snapshot.order_line_id) === orderLineId)
    .filter((snapshot) => (snapshot.snapshotType ?? snapshot.snapshot_type) === "quantity_adjustment")
    .map((snapshot) => Number(snapshot.versionNo ?? snapshot.version_no ?? 0))
    .filter(Number.isFinite);
  return (versions.length ? Math.max(...versions) : 0) + 1;
}

function buildAdjustedStatementLinesForOrderLine(workspace, input) {
  return (workspace.statementLines ?? [])
    .filter((line) => (line.orderLineId ?? line.order_line_id) === input.orderLineId)
    .map((line) => {
      const adjustmentAmount = Number(line.adjustmentAmount ?? line.adjustment_amount ?? 0);
      const amount = roundMoney(input.lineAmount);
      return {
        ...line,
        statementLineId: line.statementLineId ?? line.id,
        statementId: line.statementId ?? line.statement_id,
        orderLineId: input.orderLineId,
        deliveredQty: input.newQty,
        chargeableQty: input.newQty,
        freeQty: Number(line.freeQty ?? line.free_qty ?? 0),
        amount,
        adjustmentAmount,
        finalAmount: roundMoney(amount + adjustmentAmount),
      };
    });
}

function buildAdjustedStatementRecords(workspace, adjustedStatementLines) {
  if (!adjustedStatementLines.length) return [];
  const adjustedById = new Map(adjustedStatementLines.map((line) => [line.statementLineId ?? line.id, line]));
  const statementIds = [...new Set(adjustedStatementLines.map((line) => line.statementId).filter(Boolean))];
  return statementIds.map((statementId) => {
    const statement = (workspace.statements ?? []).find((item) => item.id === statementId || item.statementId === statementId) ?? {};
    const lines = (workspace.statementLines ?? [])
      .filter((line) => (line.statementId ?? line.statement_id) === statementId)
      .map((line) => adjustedById.get(line.statementLineId ?? line.id) ?? line);
    const receivable = roundMoney(lines.reduce((sum, line) => sum + Number(line.finalAmount ?? line.final_amount ?? line.amount ?? 0), 0));
    const received = Number(statement.received ?? statement.receivedAmount ?? 0);
    return {
      statementId,
      status: statement.status ?? "",
      receivable,
      received,
      variance: roundMoney(Math.max(0, receivable - received)),
    };
  });
}

async function createMasterDataFailedRowsCorrectionDraftRoute({ response, workspace, executionId, body, operatorId }) {
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

  const failedRows = Array.isArray(importExecution.failedRows)
    ? importExecution.failedRows
    : importExecution.importPayload?.failedRows;
  if (!Array.isArray(failedRows) || failedRows.length === 0) {
    return sendBusinessError(
      response,
      409,
      "MASTER_DATA_IMPORT_FAILED_ROWS_NOT_AVAILABLE",
      "This import execution has no failed rows to generate a correction draft.",
    );
  }

  let reviewDraft;
  try {
    const users = new Map((workspace.users ?? []).map((user) => [user.id ?? user.userId, user]));
    reviewDraft = createMasterDataImportCorrectionDraftFromFailedRows({
      importExecution,
      rowCorrections: Array.isArray(body.rowCorrections) ? body.rowCorrections : [],
      requestedBy: getUserDisplayName(users, operatorId) || operatorId,
      createdAt: body.createdAt ?? new Date().toISOString(),
    });
  } catch (error) {
    return sendBusinessError(
      response,
      422,
      "MASTER_DATA_FAILED_ROWS_CORRECTION_DRAFT_INVALID",
      error instanceof Error ? error.message : String(error),
    );
  }

  const operationLog = buildOperationLog(workspace, {
    targetType: "master_data_import_review_draft",
    targetId: reviewDraft.draftId,
    action: "master_data_import_failed_rows_correction_draft_created",
    before: {
      executionId: importExecution.executionId,
      planId: importExecution.planId,
      status: importExecution.status,
      failedRowCount: failedRows.length,
    },
    after: {
      draftId: reviewDraft.draftId,
      sourceExecutionId: reviewDraft.sourceExecutionId,
      sourcePlanId: reviewDraft.sourcePlanId,
      status: reviewDraft.status,
      correctionSummary: reviewDraft.correctionSummary,
      officialImportEnabled: false,
      officialWriteScope: "none",
    },
    reason: "基础资料导入失败行生成修正草稿",
    operatorId,
    pageKey: "master_data",
  });

  const saved = await workspace.masterDataImportReviewRepository.saveReviewDraft({
    workspace,
    reviewDraft,
    operationLog,
  });

  return sendJson(response, 201, {
    ...saved,
    sourceExecution: {
      executionId: importExecution.executionId,
      planId: importExecution.planId,
      status: importExecution.status,
      statusLabel: importExecution.statusLabel,
    },
    correctionSummary: saved.reviewDraft?.correctionSummary ?? reviewDraft.correctionSummary,
    officialImportEnabled: false,
    officialWriteScope: "none",
  });
}

async function createMasterDataImportConfirmationPlanRoute({ response, workspace, body, operatorId }) {
  const reviewDraft = body.reviewDraft;
  if (!reviewDraft || typeof reviewDraft !== "object") {
    return sendBusinessError(response, 400, "MASTER_DATA_IMPORT_REVIEW_DRAFT_REQUIRED", "reviewDraft is required.");
  }

  let confirmationPlan;
  try {
    const users = new Map((workspace.users ?? []).map((user) => [user.id ?? user.userId, user]));
    confirmationPlan = createMasterDataImportConfirmationPlan({
      reviewDraft,
      createdBy: getUserDisplayName(users, operatorId) || operatorId,
      createdAt: body.createdAt ?? new Date().toISOString(),
    });
  } catch (error) {
    return sendBusinessError(
      response,
      422,
      "MASTER_DATA_IMPORT_CONFIRMATION_PLAN_INVALID",
      error instanceof Error ? error.message : String(error),
    );
  }

  const operationLog = buildOperationLog(workspace, {
    targetType: "master_data_import_confirmation_plan",
    targetId: confirmationPlan.planId,
    action: "master_data_import_confirmation_plan_created",
    before: null,
    after: {
      planId: confirmationPlan.planId,
      draftId: confirmationPlan.draftId,
      status: confirmationPlan.status,
      summary: confirmationPlan.summary,
      targetTables: confirmationPlan.targetTables,
      officialImportEnabled: false,
      officialWriteScope: "none",
    },
    reason: "基础资料导入确认计划草稿",
    operatorId,
    pageKey: "master_data",
  });

  const saved = await workspace.masterDataImportReviewRepository.saveConfirmationPlan({
    workspace,
    reviewDraft,
    confirmationPlan,
    operationLog,
  });

  return sendJson(response, 201, {
    ...saved,
    officialImportEnabled: false,
    officialWriteScope: "none",
  });
}

async function createMasterDataImportExecutionRoute({ response, workspace, body, operatorId }) {
  const planId = cleanServerText(body.planId);
  if (!planId) {
    return sendBusinessError(response, 400, "MASTER_DATA_IMPORT_CONFIRMATION_PLAN_ID_REQUIRED", "planId is required.");
  }

  const confirmationPlan = (await workspace.masterDataImportReviewRepository.listConfirmationPlans({
    workspace,
    filters: { planId },
  }))[0];
  if (!confirmationPlan) {
    return sendNotFound(response, "MASTER_DATA_IMPORT_CONFIRMATION_PLAN_NOT_FOUND");
  }

  let importExecution;
  try {
    const users = new Map((workspace.users ?? []).map((user) => [user.id ?? user.userId, user]));
    const officialImportEnabled = body.officialImportEnabled === true || body.confirmOfficialImport === true;
    const officialWriterKind = cleanServerText(body.officialWriterKind)
      || cleanServerText(process.env.ERP_MASTER_DATA_IMPORT_WRITER)
      || "not_configured";
    importExecution = createMasterDataImportExecution({
      confirmationPlan,
      requestedBy: getUserDisplayName(users, operatorId) || operatorId,
      requestedAt: body.requestedAt ?? new Date().toISOString(),
      officialImportEnabled,
      officialWriterKind,
      officialWriteScope: officialImportEnabled ? "master_data_import_v1" : "none",
    });
  } catch (error) {
    return sendBusinessError(
      response,
      422,
      "MASTER_DATA_IMPORT_EXECUTION_INVALID",
      error instanceof Error ? error.message : String(error),
    );
  }

  const operationLog = buildOperationLog(workspace, {
    targetType: "master_data_import_execution",
    targetId: importExecution.executionId,
    action: importExecution.operationLogDraft.action,
    before: {
      planId: confirmationPlan.planId,
      status: confirmationPlan.status,
      officialImportEnabled: confirmationPlan.officialImportEnabled,
      officialWriteScope: confirmationPlan.officialWriteScope,
    },
    after: {
      executionId: importExecution.executionId,
      planId: importExecution.planId,
      draftId: importExecution.draftId,
      status: importExecution.status,
      summary: importExecution.summary,
      blockingReasons: importExecution.blockingReasons,
      officialWriteAttempted: importExecution.status === "ready_for_transaction_writer",
      officialWriteScope: importExecution.officialWriteScope,
    },
    reason: "基础资料正式导入执行请求",
    operatorId,
    pageKey: "master_data",
  });

  if (importExecution.status === "ready_for_transaction_writer") {
    try {
      const transaction = await workspace.masterDataImportTransactionRepository.applyImportExecution({
        workspace,
        importExecution,
        operationLog,
      });
      const saved = await workspace.masterDataImportReviewRepository.saveImportExecution({
        workspace,
        confirmationPlan,
        importExecution: transaction.importExecution,
        operationLog,
      });
      return sendJson(response, 201, {
        ...saved,
        transactionSummary: transaction.summary,
        officialWriteAttempted: true,
        officialWriteScope: transaction.importExecution.officialWriteScope,
      });
    } catch (error) {
      const failedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      const failedExecution = {
        ...importExecution,
        status: "failed",
        statusLabel: "导入失败已回滚",
        officialWriteAttempted: true,
        officialWriteScope: "master_data_import_v1",
        transactionStarted: true,
        finishedAt: failedAt,
        summary: {
          ...importExecution.summary,
          blockedReasonCount: 1,
        },
        blockingReasons: [message],
        transactionSummary: {
          rollbackApplied: true,
          errorMessage: message,
          failedAt,
        },
      };
      const failedLog = buildOperationLog(workspace, {
        targetType: "master_data_import_execution",
        targetId: failedExecution.executionId,
        action: "master_data_import_execution_failed_rolled_back",
        before: operationLog.after,
        after: {
          executionId: failedExecution.executionId,
          status: failedExecution.status,
          blockingReasons: failedExecution.blockingReasons,
          officialWriteAttempted: true,
          officialWriteScope: failedExecution.officialWriteScope,
          rollbackApplied: true,
        },
        reason: "基础资料正式导入失败，事务已回滚",
        operatorId,
        pageKey: "master_data",
      });
      await workspace.masterDataImportReviewRepository.saveImportExecution({
        workspace,
        confirmationPlan,
        importExecution: failedExecution,
        operationLog: failedLog,
      });
      return sendJson(response, 422, {
        code: "MASTER_DATA_IMPORT_TRANSACTION_FAILED_ROLLED_BACK",
        message,
        importExecution: failedExecution,
        operationLogId: failedLog.id,
      });
    }
  }

  const saved = await workspace.masterDataImportReviewRepository.saveImportExecution({
    workspace,
    confirmationPlan,
    importExecution,
    operationLog,
  });

  return sendJson(response, 201, {
    ...saved,
    officialWriteAttempted: importExecution.officialWriteAttempted,
    officialWriteScope: importExecution.officialWriteScope,
  });
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
  const safeEmployeeId = cleanServerText(employeeId);
  if (!safeEmployeeId) {
    return sendBusinessError(response, 400, "MASTER_DATA_EMPLOYEE_ID_REQUIRED", "employeeId is required.");
  }
  workspace.employees = Array.isArray(workspace.employees) ? workspace.employees : [];
  const employeeIndex = workspace.employees.findIndex((item) => cleanServerText(item?.id) === safeEmployeeId);
  if (employeeIndex < 0) {
    return sendNotFound(response, "MASTER_DATA_EMPLOYEE_NOT_FOUND");
  }

  const before = { ...workspace.employees[employeeIndex] };
  const reviewedAt = cleanServerText(body.reviewedAt) || new Date().toISOString();
  const roleKey = normalizeEmployeeAccountRoleKey(body.roleKey, before.roleName);
  const userId = cleanServerText(body.userId) || cleanServerText(before.userId) || buildEmployeeAccountUserId(before);
  const loginName = cleanServerText(body.loginName) || cleanServerText(before.loginName) || buildEmployeeAccountLoginName(before);
  const reviewNote = cleanServerText(body.reviewNote ?? body.note) || "管理员复核启用导入员工账号";
  const updatedEmployee = {
    ...before,
    userId,
    loginName,
    accountEnabled: true,
    profileStatus: "account_enabled",
    reviewedBy: operatorId,
    reviewedAt,
    reviewedRoleKey: roleKey,
    reviewNote,
    updatedAt: reviewedAt,
  };
  workspace.employees[employeeIndex] = updatedEmployee;

  const user = upsertMasterDataEmployeeUser(workspace, updatedEmployee, {
    roleKey,
    reviewedAt,
  });

  const operationLog = buildOperationLog(workspace, {
    targetType: "master_data_employee_account_review",
    targetId: updatedEmployee.id,
    action: "master_data_employee_account_enabled",
    before: {
      employeeId: before.id,
      userId: before.userId,
      accountEnabled: before.accountEnabled === true,
      profileStatus: before.profileStatus,
    },
    after: {
      employeeId: updatedEmployee.id,
      userId: updatedEmployee.userId,
      loginName: updatedEmployee.loginName,
      accountEnabled: true,
      profileStatus: updatedEmployee.profileStatus,
      reviewedRoleKey: roleKey,
    },
    reason: reviewNote,
    operatorId,
    pageKey: "master_data",
  });
  workspace.operationLogs = Array.isArray(workspace.operationLogs) ? workspace.operationLogs : [];
  workspace.operationLogs.unshift(operationLog);
  await persistRuntimeIdentityState(workspace);

  const users = new Map((workspace.users ?? []).map((item) => [cleanServerText(item.userId ?? item.id), item]));
  return sendJson(response, 200, {
    employeeAccountReview: toMasterDataEmployeeAccountReview(updatedEmployee, users),
    employee: updatedEmployee,
    user: sanitizeRuntimeUserForResponse(user),
    operationLogId: operationLog.id,
  });
}

async function issueMasterDataEmployeeAccountPasswordRoute({ response, workspace, employeeId, body, operatorId }) {
  const safeEmployeeId = cleanServerText(employeeId);
  if (!safeEmployeeId) {
    return sendBusinessError(response, 400, "MASTER_DATA_EMPLOYEE_ID_REQUIRED", "employeeId is required.");
  }
  workspace.employees = Array.isArray(workspace.employees) ? workspace.employees : [];
  const employeeIndex = workspace.employees.findIndex((item) => cleanServerText(item?.id) === safeEmployeeId);
  if (employeeIndex < 0) {
    return sendNotFound(response, "MASTER_DATA_EMPLOYEE_NOT_FOUND");
  }

  const before = { ...workspace.employees[employeeIndex] };
  const accountEnabled = before.accountEnabled === true || cleanServerText(before.profileStatus) === "account_enabled";
  if (!accountEnabled) {
    return sendBusinessError(
      response,
      409,
      "MASTER_DATA_EMPLOYEE_ACCOUNT_NOT_ENABLED",
      "Employee account must be reviewed and enabled before issuing a temporary password.",
    );
  }

  const issuedAt = cleanServerText(body.issuedAt) || new Date().toISOString();
  const roleKey = normalizeEmployeeAccountRoleKey(body.roleKey, before.reviewedRoleKey || before.roleName);
  const userId = cleanServerText(body.userId) || cleanServerText(before.userId) || buildEmployeeAccountUserId(before);
  const loginName = cleanServerText(body.loginName) || cleanServerText(before.loginName) || buildEmployeeAccountLoginName(before);
  const issueNote = cleanServerText(body.issueNote ?? body.note) || "管理员发放员工临时登录密码";
  const existingRuntimeUser = findRuntimeUserById(workspace, userId);
  const issuedPassword = issueRuntimeUserTemporaryPassword(
    {
      userId,
      loginName,
    },
    {
      temporaryPassword: cleanServerText(body.temporaryPassword),
      nowMs: Date.parse(issuedAt) || Date.now(),
      authSecret: getWorkspaceSecurityPolicy(workspace).authSecret,
    },
  );

  const updatedEmployee = {
    ...before,
    userId,
    loginName,
    accountEnabled: true,
    profileStatus: "account_enabled",
    loginEnabled: true,
    passwordStatus: issuedPassword.passwordStatus,
    passwordIssuedBy: operatorId,
    passwordIssuedAt: issuedPassword.passwordIssuedAt,
    mustChangePassword: true,
    passwordIssueNote: issueNote,
    passwordExpiresAt: "",
    passwordExpiredAt: "",
    failedLoginCount: 0,
    lastFailedLoginAt: "",
    lockedUntil: "",
    sessionValidAfter: issuedPassword.passwordIssuedAt,
    updatedAt: issuedPassword.passwordIssuedAt,
  };
  workspace.employees[employeeIndex] = updatedEmployee;

  const baseUser = upsertMasterDataEmployeeUser(workspace, updatedEmployee, {
    roleKey,
    reviewedAt: issuedPassword.passwordIssuedAt,
  });
  const user = upsertRuntimeUser(workspace, {
    ...baseUser,
    loginEnabled: true,
    passwordHash: issuedPassword.passwordHash,
    passwordStatus: issuedPassword.passwordStatus,
    passwordIssuedBy: operatorId,
    passwordIssuedAt: issuedPassword.passwordIssuedAt,
    mustChangePassword: true,
    passwordExpiresAt: "",
    passwordExpiredAt: "",
    failedLoginCount: 0,
    lastFailedLoginAt: "",
    lockedUntil: "",
    sessionValidAfter: issuedPassword.passwordIssuedAt,
    sessionVersion: nextRuntimeSessionVersion(existingRuntimeUser?.sessionVersion),
    updatedAt: issuedPassword.passwordIssuedAt,
  });

  const operationLog = buildOperationLog(workspace, {
    targetType: "master_data_employee_account_password",
    targetId: updatedEmployee.id,
    action: "master_data_employee_account_password_issued",
    before: {
      employeeId: before.id,
      userId: before.userId,
      loginName: before.loginName,
      passwordIssuedAt: before.passwordIssuedAt,
      passwordStatus: before.passwordStatus,
    },
    after: {
      employeeId: updatedEmployee.id,
      userId: updatedEmployee.userId,
      loginName: updatedEmployee.loginName,
      passwordIssuedAt: updatedEmployee.passwordIssuedAt,
      passwordStatus: updatedEmployee.passwordStatus,
      loginEnabled: true,
      mustChangePassword: true,
      lockedUntil: "",
    },
    reason: issueNote,
    operatorId,
    pageKey: "master_data",
  });
  workspace.operationLogs = Array.isArray(workspace.operationLogs) ? workspace.operationLogs : [];
  workspace.operationLogs.unshift(operationLog);
  await persistRuntimeIdentityState(workspace);

  const users = new Map((workspace.users ?? []).map((item) => [cleanServerText(item.userId ?? item.id), item]));
  return sendJson(response, 200, {
    employeeAccountReview: toMasterDataEmployeeAccountReview(updatedEmployee, users),
    issuedCredential: {
      userId,
      loginName,
      temporaryPassword: issuedPassword.temporaryPassword,
      passwordIssuedAt: issuedPassword.passwordIssuedAt,
      passwordStatus: issuedPassword.passwordStatus,
      mustChangePassword: true,
      visibleOnce: true,
    },
    user: sanitizeRuntimeUserForResponse(user),
    operationLogId: operationLog.id,
  });
}

async function revokeMasterDataEmployeeAccountPasswordRoute({ response, workspace, employeeId, body, operatorId }) {
  const safeEmployeeId = cleanServerText(employeeId);
  if (!safeEmployeeId) {
    return sendBusinessError(response, 400, "MASTER_DATA_EMPLOYEE_ID_REQUIRED", "employeeId is required.");
  }
  workspace.employees = Array.isArray(workspace.employees) ? workspace.employees : [];
  const employeeIndex = workspace.employees.findIndex((item) => cleanServerText(item?.id) === safeEmployeeId);
  if (employeeIndex < 0) {
    return sendNotFound(response, "MASTER_DATA_EMPLOYEE_NOT_FOUND");
  }

  const before = { ...workspace.employees[employeeIndex] };
  const userId = cleanServerText(before.userId);
  if (!userId) {
    return sendBusinessError(
      response,
      409,
      "MASTER_DATA_EMPLOYEE_ACCOUNT_NOT_ENABLED",
      "Employee account must be reviewed and enabled before revoking password.",
    );
  }

  const revokedAt = cleanServerText(body.revokedAt) || new Date().toISOString();
  const revokeNote = cleanServerText(body.revokeNote ?? body.note) || "管理员撤销员工登录密码";
  const runtimeUser = findRuntimeUserById(workspace, userId);
  const updatedEmployee = {
    ...before,
    loginEnabled: false,
    passwordStatus: "password_revoked",
    mustChangePassword: false,
    passwordRevokedBy: operatorId,
    passwordRevokedAt: revokedAt,
    passwordRevokeNote: revokeNote,
    passwordExpiresAt: "",
    passwordExpiredAt: "",
    failedLoginCount: 0,
    lastFailedLoginAt: "",
    lockedUntil: "",
    sessionValidAfter: revokedAt,
    updatedAt: revokedAt,
  };
  workspace.employees[employeeIndex] = updatedEmployee;

  let updatedUser = runtimeUser;
  if (runtimeUser) {
    updatedUser = upsertRuntimeUser(workspace, {
      ...runtimeUser,
      loginEnabled: false,
      passwordHash: "",
      passwordStatus: "password_revoked",
      mustChangePassword: false,
      passwordRevokedBy: operatorId,
      passwordRevokedAt: revokedAt,
      passwordExpiresAt: "",
      passwordExpiredAt: "",
      failedLoginCount: 0,
      lastFailedLoginAt: "",
      lockedUntil: "",
      sessionValidAfter: revokedAt,
      sessionVersion: nextRuntimeSessionVersion(runtimeUser.sessionVersion),
      updatedAt: revokedAt,
    });
  }

  const operationLog = buildOperationLog(workspace, {
    targetType: "master_data_employee_account_password",
    targetId: updatedEmployee.id,
    action: "master_data_employee_account_password_revoked",
    before: {
      employeeId: before.id,
      userId: before.userId,
      loginName: before.loginName,
      loginEnabled: before.loginEnabled === true,
      passwordStatus: before.passwordStatus,
      mustChangePassword: before.mustChangePassword === true,
      passwordIssuedAt: before.passwordIssuedAt,
      passwordChangedAt: before.passwordChangedAt,
    },
    after: {
      employeeId: updatedEmployee.id,
      userId: updatedEmployee.userId,
      loginName: updatedEmployee.loginName,
      loginEnabled: false,
      passwordStatus: updatedEmployee.passwordStatus,
      mustChangePassword: false,
      passwordRevokedAt: revokedAt,
      sessionsRevokedAfter: revokedAt,
    },
    reason: revokeNote,
    operatorId,
    pageKey: "master_data",
  });
  workspace.operationLogs = Array.isArray(workspace.operationLogs) ? workspace.operationLogs : [];
  workspace.operationLogs.unshift(operationLog);
  await persistRuntimeIdentityState(workspace);

  const users = new Map((workspace.users ?? []).map((item) => [cleanServerText(item.userId ?? item.id), item]));
  return sendJson(response, 200, {
    revoked: true,
    employeeAccountReview: toMasterDataEmployeeAccountReview(updatedEmployee, users),
    user: updatedUser ? sanitizeRuntimeUserForResponse(updatedUser) : null,
    sessionsRevokedAfter: revokedAt,
    operationLogId: operationLog.id,
  });
}

function toMasterDataEmployeeAccountReview(employee = {}, users = new Map()) {
  const employeeId = cleanServerText(employee.id);
  const userId = cleanServerText(employee.userId);
  const user = userId ? users.get(userId) : null;
  const accountEnabled = employee.accountEnabled === true || cleanServerText(employee.profileStatus) === "account_enabled";
  const roleKey = cleanServerText(employee.reviewedRoleKey) || normalizeEmployeeAccountRoleKey("", employee.roleName);
  const userPasswordStatus = cleanServerText(user?.passwordStatus);
  const employeePasswordStatus = cleanServerText(employee.passwordStatus);
  return {
    employeeId,
    bizNo: cleanServerText(employee.bizNo) || employeeId,
    name: cleanServerText(employee.name),
    roleName: cleanServerText(employee.roleName),
    defaultWorkshop: cleanServerText(employee.defaultWorkshop),
    defaultMachineId: cleanServerText(employee.defaultMachineId),
    requestedEnabled: employee.requestedEnabled === true,
    accountEnabled,
    profileStatus: accountEnabled ? "account_enabled" : cleanServerText(employee.profileStatus) || "pending_admin_review",
    status: accountEnabled ? "account_enabled" : "pending_admin_review",
    statusLabel: accountEnabled ? "已启用" : "待管理员复核",
    recommendedRoleKey: roleKey,
    recommendedRoleLabel: getEmployeeAccountRoleLabel(roleKey),
    loginName: cleanServerText(employee.loginName) || cleanServerText(user?.loginName) || buildEmployeeAccountLoginName(employee),
    userId,
    userDisplayName: cleanServerText(user?.displayName) || cleanServerText(employee.name),
    reviewedBy: cleanServerText(employee.reviewedBy),
    reviewedAt: cleanServerText(employee.reviewedAt),
    reviewNote: cleanServerText(employee.reviewNote),
    loginEnabled: employee.loginEnabled === true || user?.loginEnabled === true,
    passwordIssuedAt: cleanServerText(employee.passwordIssuedAt) || cleanServerText(user?.passwordIssuedAt),
    passwordStatus: userPasswordStatus === "password_expired" ? userPasswordStatus : employeePasswordStatus || userPasswordStatus,
    passwordIssuedBy: cleanServerText(employee.passwordIssuedBy) || cleanServerText(user?.passwordIssuedBy),
    passwordChangedAt: cleanServerText(employee.passwordChangedAt) || cleanServerText(user?.passwordChangedAt),
    passwordChangedBy: cleanServerText(employee.passwordChangedBy) || cleanServerText(user?.passwordChangedBy),
    passwordRevokedAt: cleanServerText(employee.passwordRevokedAt) || cleanServerText(user?.passwordRevokedAt),
    passwordRevokedBy: cleanServerText(employee.passwordRevokedBy) || cleanServerText(user?.passwordRevokedBy),
    mustChangePassword: employee.mustChangePassword === true || user?.mustChangePassword === true,
    passwordExpiresAt: cleanServerText(employee.passwordExpiresAt) || cleanServerText(user?.passwordExpiresAt),
    passwordExpiredAt: cleanServerText(employee.passwordExpiredAt) || cleanServerText(user?.passwordExpiredAt),
    failedLoginCount: Number(user?.failedLoginCount ?? employee.failedLoginCount) || 0,
    lastFailedLoginAt: cleanServerText(user?.lastFailedLoginAt) || cleanServerText(employee.lastFailedLoginAt),
    lockedUntil: cleanServerText(user?.lockedUntil) || cleanServerText(employee.lockedUntil),
    remark: cleanServerText(employee.remark),
    actionRequired: !accountEnabled,
  };
}

function upsertMasterDataEmployeeUser(workspace, employee, options = {}) {
  const roleKey = normalizeEmployeeAccountRoleKey(options.roleKey, employee.roleName);
  const reviewedAt = cleanServerText(options.reviewedAt) || new Date().toISOString();
  const userId = cleanServerText(employee.userId) || buildEmployeeAccountUserId(employee);
  const user = {
    id: userId,
    userId,
    loginName: cleanServerText(employee.loginName) || buildEmployeeAccountLoginName(employee),
    displayName: cleanServerText(employee.name) || userId,
    defaultRole: roleKey,
    department: getEmployeeAccountDepartment(roleKey),
    defaultMachineId: cleanServerText(employee.defaultMachineId),
    enabled: true,
    roles: [roleKey],
    employeeId: cleanServerText(employee.id),
    source: "master_data_import_review",
    updatedAt: reviewedAt,
  };
  workspace.users = Array.isArray(workspace.users) ? workspace.users : [];
  const userIndex = workspace.users.findIndex((item) => cleanServerText(item.userId ?? item.id) === userId);
  if (userIndex >= 0) {
    workspace.users[userIndex] = {
      ...workspace.users[userIndex],
      ...user,
    };
  } else {
    workspace.users.unshift(user);
  }
  return user;
}

function upsertRuntimeUser(workspace, user) {
  const userId = cleanServerText(user?.userId ?? user?.id);
  if (!userId) return user;
  workspace.users = Array.isArray(workspace.users) ? workspace.users : [];
  const userIndex = workspace.users.findIndex((item) => cleanServerText(item.userId ?? item.id) === userId);
  if (userIndex >= 0) {
    workspace.users[userIndex] = {
      ...workspace.users[userIndex],
      ...user,
      id: userId,
      userId,
    };
    return workspace.users[userIndex];
  }
  const nextUser = {
    ...user,
    id: userId,
    userId,
  };
  workspace.users.unshift(nextUser);
  return nextUser;
}

function nextRuntimeSessionVersion(currentVersion) {
  return (Number(currentVersion) || 0) + 1;
}

async function persistRuntimeIdentityState(workspace) {
  if (!workspace?.runtimeIdentityRepository?.saveState) return null;
  return await workspace.runtimeIdentityRepository.saveState({ workspace });
}

function sanitizeRuntimeUserForResponse(user = {}) {
  const { seedPassword, passwordHash, ...safeUser } = user ?? {};
  return safeUser;
}

function buildEmployeeAccountUserId(employee = {}) {
  return `U-EMP-${safeRecordPart(employee.id || employee.bizNo || employee.name).toUpperCase()}`;
}

function buildEmployeeAccountLoginName(employee = {}) {
  const source = cleanServerText(employee.bizNo) || cleanServerText(employee.name) || cleanServerText(employee.id);
  return `emp.${source.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || safeRecordPart(employee.id).toLowerCase()}`;
}

function normalizeEmployeeAccountRoleKey(roleKey, roleName = "") {
  const normalized = cleanServerText(roleKey);
  const allowed = new Set(["office", "warehouse", "finance", "management", "driver", "workshop", "packing"]);
  if (allowed.has(normalized)) return normalized;
  const text = cleanServerText(roleName);
  if (/管理|主管|负责人/.test(text)) return "management";
  if (/办公室|文员|录单|客服/.test(text)) return "office";
  if (/财务|对账|收款/.test(text)) return "finance";
  if (/库房|出库|仓库/.test(text)) return "warehouse";
  if (/司机|送货/.test(text)) return "driver";
  if (/打包|杂工/.test(text)) return "packing";
  return "workshop";
}

function getEmployeeAccountRoleLabel(roleKey) {
  const labels = {
    office: "办公室",
    warehouse: "库房 / 出库",
    finance: "财务 / 对账",
    management: "管理",
    driver: "司机",
    workshop: "车间报工",
    packing: "打包",
  };
  return labels[roleKey] ?? "车间报工";
}

function getEmployeeAccountDepartment(roleKey) {
  const departments = {
    office: "office",
    warehouse: "warehouse",
    finance: "finance",
    management: "management",
    driver: "delivery",
    workshop: "workshop",
    packing: "packing",
  };
  return departments[roleKey] ?? "workshop";
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
    qtyBefore: draft.qtyBefore,
    requestedQtyAfter: draft.requestedQtyAfter,
    todoId: result.todo.id,
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
  const before = findInventoryReservation(workspace, reservationId);
  if (!before) return sendNotFound(response, "INVENTORY_RESERVATION_NOT_FOUND");
  if (body.reservationId && body.reservationId !== reservationId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "reservationId in path and body must match");
  }
  if (!isReleasableInventoryReservation(before)) {
    return sendBusinessError(response, 409, "INVENTORY_RESERVATION_NOT_ACTIVE", "Only active reservations can be released.");
  }

  const inventoryItem = findInventoryItem(workspace, before.inventoryItemId);
  if (!inventoryItem) return sendNotFound(response, "INVENTORY_ITEM_NOT_FOUND");

  const currentReservedQty = Math.max(0, Number(before.reservedQty ?? before.qty ?? 0));
  const requestedReleaseQty = Math.trunc(Number(body.releaseQty ?? currentReservedQty));
  if (!Number.isFinite(requestedReleaseQty) || requestedReleaseQty <= 0) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "releaseQty must be greater than 0.");
  }
  if (requestedReleaseQty > currentReservedQty) {
    return sendBusinessError(response, 409, "INVENTORY_RELEASE_QTY_EXCEEDS_RESERVED", "releaseQty exceeds reserved quantity.");
  }

  const releasedQty = requestedReleaseQty;
  const remainingReservedQty = Math.max(0, currentReservedQty - releasedQty);
  const status = remainingReservedQty > 0 ? "部分释放" : "已释放";
  const after = {
    ...before,
    reservationId: before.reservationId ?? before.id,
    reservedQty: remainingReservedQty,
    status,
  };
  const reservedBefore = Number(inventoryItem.reserved ?? 0);
  const reservedAfter = Math.max(0, reservedBefore - releasedQty);
  const ledger = {
    ledgerId: nextPlainId("LEDGER", `${reservationId}-RELEASE-${workspace.inventoryLedgers.length + 1}`),
    inventoryItemId: before.inventoryItemId,
    changeType: "释放占用",
    qtyBefore: reservedBefore,
    qtyChange: -releasedQty,
    qtyAfter: reservedAfter,
    sourceType: "inventory_reservation_release",
    sourceId: body.relatedActionId ?? reservationId,
    operatorId,
    confirmedBy: operatorId,
    reason: mapInventoryReservationReleaseReason(body.reason),
    remark: `释放占用 ${releasedQty}`,
  };
  const operationLog = buildOperationLog(workspace, {
    targetType: "inventory_reservation",
    targetId: reservationId,
    action: "release_inventory_reservation",
    operatorId,
    before,
    after,
    reason: ledger.reason,
  });
  const transaction = await workspace.inventoryReservationReleaseTransactionRepository.releaseReservation({
    workspace,
    reservation: after,
    inventoryAdjustment: {
      inventoryItemId: before.inventoryItemId,
      reservedQtyChange: -releasedQty,
    },
    inventoryLedgerEntry: ledger,
    operationLog,
  });

  return sendJson(response, 200, {
    reservationId,
    orderLineId: after.orderLineId,
    inventoryItemId: after.inventoryItemId,
    qty: Number(transaction.reservation?.reservedQty ?? remainingReservedQty),
    releasedQty,
    status: mapInventoryReservationApiStatus(transaction.reservation?.status ?? status),
    ledgerId: transaction.inventoryLedgerEntry?.ledgerId ?? ledger.ledgerId,
    operationLogId: transaction.operationLogId,
  });
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

const v1SystemPersistenceGroups = [
  {
    key: "order-inventory-fulfillment",
    label: "订单 / 库存 / 出库交易仓储",
    repositories: [
      ["coreWorkspaceReadRepository", "核心工作区启动快照"],
      ["todoActionRepository", "公共待办处理交易"],
      ["inventoryCorrectionTransactionRepository", "库存修正交易"],
      ["productionFinishedGoodsPhotoTransactionRepository", "生产成品图交易"],
      ["orderDraftRepository", "订单草稿"],
      ["orderConfirmationTransactionRepository", "订单确认交易"],
      ["orderPoolReadRepository", "订单池读取"],
      ["inventoryLedgerReadRepository", "库存流水读取"],
      ["inventoryReservationReleaseTransactionRepository", "库存占用释放交易"],
      ["orderLineVoidTransactionRepository", "订单明细作废交易"],
      ["orderLineQuantityAdjustmentTransactionRepository", "订单明细改量交易"],
      ["fulfillmentActionTransactionRepository", "出库 / 交付交易"],
    ],
  },
  {
    key: "statement-payment",
    label: "对账 / 收款交易仓储",
    repositories: [
      ["paymentRecordRepository", "付款记录"],
      ["statementPaymentTransactionRepository", "对账收款交易"],
      ["statementSettlementTransactionRepository", "对账核销交易"],
      ["statementSendTransactionRepository", "对账发送 / 回执交易"],
      ["statementExportRepository", "对账导出记录"],
    ],
  },
  {
    key: "production-driver",
    label: "生产 / 司机交易仓储",
    repositories: [
      ["productionPackingTransactionRepository", "生产 / 打包交易"],
      ["productionPackingReadRepository", "生产 / 打包读取"],
      ["productionScheduleRecordRepository", "排产队列记录"],
      ["driverDeliveryDispatchRepository", "司机派车记录"],
      ["driverDeviceFieldTestRepository", "司机真机验收记录"],
      ["driverDeliveryTaskReadRepository", "司机任务读取"],
    ],
  },
  {
    key: "evidence-audit-print-master-data",
    label: "证据 / 审计 / 打印 / 主数据 / 身份仓储",
    repositories: [
      ["attachmentRepository", "附件索引"],
      ["attachmentAccessAuditRepository", "附件访问审计"],
      ["printBatchRepository", "打印批次"],
      ["printDeviceRepository", "打印设备"],
      ["printJobRepository", "打印作业"],
      ["printerDeviceFieldTestRepository", "打印设备现场 QA"],
      ["masterDataImportReviewRepository", "主数据导入复核"],
      ["masterDataImportTransactionRepository", "主数据导入交易"],
      ["rawMaterialInboundRepository", "原材料入库单 / 贴标状态"],
      ["rawMaterialSupplierStatementReviewRepository", "原材料供应商月结复核草稿"],
      ["runtimeIdentityRepository", "运行期员工身份 / session 吊销"],
    ],
  },
  {
    key: "file-retention-stores",
    label: "文件留档存储",
    repositories: [
      ["attachmentObjectStorage", "附件对象存储"],
      ["statementExportObjectStorage", "对账导出文件存储"],
    ],
  },
];

function getSystemV1ReadinessResponse({ workspace, operatorId }) {
  const checkedAt = new Date().toISOString();
  const localPersistenceAcceptance = getSystemLocalPersistenceAcceptance(workspace);
  const repositoryGroups = v1SystemPersistenceGroups.map((group) =>
    buildSystemPersistenceGroupReadiness({ workspace, group, localPersistenceAcceptance }),
  );
  const allRepositories = repositoryGroups.flatMap((group) => group.repositories);
  const localRepositories = allRepositories.filter((repository) => repository.localKind);
  const localMemoryRepositories = allRepositories.filter((repository) => repository.kind === "local_memory");
  const criteria = [
    ...repositoryGroups.map((group) =>
      buildReadinessCriterion({
        key: `system-persistence-${group.key}`,
        label: group.label,
        passed: group.ready,
        detail: group.ready
          ? group.localRepositoryCount
            ? `已显式接受 ${group.localRepositoryCount} 个本地仓储用于 V1`
            : "该业务域仓储已使用生产级持久化"
          : `${group.localRepositoryCount} 个仓储仍为本地 / 内存模式`,
        blocking: true,
        evidence: {
          repositoryCount: group.repositoryCount,
          productionReadyCount: group.productionReadyCount,
          localRepositoryCount: group.localRepositoryCount,
          localMemoryCount: group.localMemoryCount,
          localJsonCount: group.localJsonCount,
          localFsCount: group.localFsCount,
          acceptedByLocalPolicy: group.acceptedByLocalPolicy,
        },
      }),
    ),
    buildReadinessCriterion({
      key: "system-local-persistence-acceptance",
      label: "本地持久化 V1 接受声明",
      passed: localRepositories.length === 0 || localPersistenceAcceptance.accepted,
      detail:
        localRepositories.length === 0
          ? "未发现本地 / 内存仓储"
          : localPersistenceAcceptance.accepted
            ? `已显式接受本地持久化用于 V1：${localPersistenceAcceptance.reference || "未填写引用"}`
            : "仍存在本地 / 内存仓储，默认不能作为 V1 生产持久化",
      blocking: true,
      evidence: {
        localRepositoryCount: localRepositories.length,
        localMemoryCount: localMemoryRepositories.length,
        localPersistenceAcceptedForV1: localPersistenceAcceptance.accepted,
        acceptanceReference: localPersistenceAcceptance.reference,
      },
    }),
    buildReadinessCriterion({
      key: "system-persistence-redaction",
      label: "持久化门禁脱敏护栏",
      passed: true,
      detail: "只输出仓储类型和计数，不输出业务数据、连接串、文件路径或密钥",
      blocking: true,
      evidence: {
        repositoryPayloadExposed: false,
        connectionStringExposed: false,
        localPathExposed: false,
      },
    }),
  ];
  const summary = buildReadinessSummary(criteria);
  return {
    status: summary.blockingCount === 0 ? "ready" : "blocked",
    ready: summary.blockingCount === 0,
    checkedAt,
    operatorId,
    scope: "v1_system_persistence_readiness",
    summary,
    criteria,
    blockingCriteria: criteria.filter((item) => item.blocking && item.status !== "passed"),
    repositoryGroups,
    repositories: allRepositories,
    localPersistenceAcceptance,
    persistenceProfile: workspace.v1PersistenceProfile,
    remainingV1Risks: buildSystemPersistenceRemainingRisks({
      criteria,
      localPersistenceAcceptance,
      localRepositories,
      localMemoryRepositories,
    }),
    safeguards: {
      nonMutating: true,
      repositoryPayloadExposed: false,
      connectionStringExposed: false,
      localPathExposed: false,
      persistenceProfileConnectionStringExposed: false,
      persistenceProfileLocalPathExposed: false,
      persistenceProfileSecretFieldsExposed: false,
      requiresPostgresPersistence: !localPersistenceAcceptance.accepted,
      localPersistenceAcceptedForV1: localPersistenceAcceptance.accepted,
    },
  };
}

function getSystemV1GoLiveStatusResponse({ operatorId }) {
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
  const v2Differences = sanitizeStringList(v1V2Scope.v2Differences ?? completion.v2Differences ?? []);
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
      cleanServerText(completion.conclusion || suite.conclusion || v1V2Scope.conclusion) ||
      "当前仍不能声明 V1 已完成；必须以发布门禁、现场证据和负责人签字为准。",
    summary: sanitizedSummary,
    releaseCandidate: sanitizedReleaseCandidate,
    ownerDecisionBrief: sanitizedOwnerDecisionBrief,
    completionAudit,
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
    v2Categories: sanitizeStringList(v1V2Scope.v2Categories ?? suite.summary?.v2Categories ?? []),
    moduleV1V2Differences,
    v1MustContinue: sanitizeStringList(v1V2Scope.v1MustContinue ?? completion.v1MustContinue ?? []),
    topBlockers: sanitizeV1TopBlockers(completion.topBlockers ?? []),
    sourceStatus: Object.fromEntries(
      Object.values(artifacts).map((artifact) => [
        artifact.key,
        {
          status: artifact.status,
          label: artifact.label,
          reason: artifact.reason,
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
  const checkedAt = new Date().toISOString();
  const artifactRoot = getV1GoLiveArtifactRoot();
  try {
    const result = applyV1FieldEvidenceIntakeFromFiles({
      manifestPath: join(process.cwd(), "docs", "development", "v1-field-evidence-manifest.template.json"),
      csvPath: join(artifactRoot, "v1-field-evidence-intake", "evidence-items.csv"),
      signoffBoundaryCsvPath: join(artifactRoot, "v1-field-evidence-intake", "signoff-boundary.csv"),
      outputPath: join(artifactRoot, "v1-field-evidence-intake", "filled-manifest.draft.json"),
      writeOutput: true,
    });
    const invalidRowCount = normalizeV1NonNegativeInteger(result.summary?.invalidRowCount);
    return {
      httpStatus: invalidRowCount > 0 ? 422 : 200,
      body: sanitizeV1FieldEvidenceIntakeDraftManifestResult(result, { operatorId, checkedAt }),
    };
  } catch (error) {
    return {
      httpStatus: 400,
      body: {
        version: "p0-v1-field-evidence-intake-draft-v1",
        scope: "v1_field_evidence_intake_draft_manifest",
        status: "error",
        ready: false,
        checkedAt,
        operatorId,
        error: {
          code: "V1_FIELD_EVIDENCE_INTAKE_DRAFT_FAILED",
          message: "现场证据草稿生成失败：采集包、CSV 或 manifest 模板缺失 / 不可读。",
        },
        summary: {
          appliedRowCount: 0,
          invalidRowCount: 0,
          evidenceProgress: "0/34",
          signoffProgress: "0/6",
          boundaryStatus: "pending",
        },
        invalidRows: [],
        nextAction: "先确认现场证据采集包、CSV 和模板文件存在，再重新生成草稿。",
        safeguards: buildV1FieldEvidenceIntakeDraftSafeguards({ outputWritten: false }),
      },
    };
  }
}

function validateSystemV1FieldEvidenceDraftManifest({ operatorId }) {
  const checkedAt = new Date().toISOString();
  const artifactRoot = getV1GoLiveArtifactRoot();
  try {
    const draftManifestPath = join(artifactRoot, "v1-field-evidence-intake", "filled-manifest.draft.json");
    const manifest = JSON.parse(readFileSync(draftManifestPath, "utf8"));
    const fieldEvidenceCsvPath = join(artifactRoot, "v1-field-evidence-intake", "evidence-items.csv");
    const signoffBoundaryCsvPath = join(artifactRoot, "v1-field-evidence-intake", "signoff-boundary.csv");
    const fieldEvidenceCsv = existsSync(fieldEvidenceCsvPath) ? readFileSync(fieldEvidenceCsvPath, "utf8") : "";
    const signoffBoundaryCsv = existsSync(signoffBoundaryCsvPath) ? readFileSync(signoffBoundaryCsvPath, "utf8") : "";
    const draftFreshness = buildV1FieldEvidenceDraftFreshness(fieldEvidenceCsv, signoffBoundaryCsv, {
      status: "loaded",
      value: manifest,
    });
    const validation = validateV1FieldEvidenceManifest(manifest);
    return {
      httpStatus: validation.schemaValid === false ? 422 : 200,
      body: sanitizeV1FieldEvidenceDraftManifestValidationResult(validation, {
        operatorId,
        checkedAt,
        draftManifestAvailable: true,
        draftFreshness,
      }),
    };
  } catch (error) {
    return {
      httpStatus: 400,
      body: {
        version: "p0-v1-field-evidence-draft-validation-v1",
        scope: "v1_field_evidence_draft_manifest_validation",
        status: "error",
        ready: false,
        schemaValid: false,
        checkedAt,
        operatorId,
        error: {
          code: "V1_FIELD_EVIDENCE_DRAFT_VALIDATION_FAILED",
          message: "现场证据 manifest 草稿校验失败：草稿缺失或不可读。",
        },
        summary: {
          evidenceProgress: "0/34",
          signoffProgress: "0/6",
          evidenceGroupsReadyLabel: "0/6",
          blockingIssueCount: 0,
          blockerShownCount: 0,
          draftManifestStatus: "missing",
          releaseCandidateRefreshed: false,
        },
        blockers: [],
        groups: [],
        signoffs: [],
        boundary: {
          status: "pending",
          label: "待确认",
          ready: false,
        },
        nextAction: "先生成 manifest 草稿，再执行草稿校验。",
        safeguards: buildV1FieldEvidenceDraftValidationSafeguards({ draftManifestAvailable: false }),
      },
    };
  }
}

function stageSystemV1FieldEvidenceIntakeRow({ body, operatorId }) {
  const checkedAt = new Date().toISOString();
  const artifactRoot = getV1GoLiveArtifactRoot();
  try {
    const payload = isPlainServerObject(body) ? body : {};
    const rowType = cleanServerText(payload.rowType || payload.type || payload.recordType);
    const intakeDir = join(artifactRoot, "v1-field-evidence-intake");
    const stageResult =
      rowType === "evidence"
        ? stageV1FieldEvidenceCsvRow({
            csvPath: join(intakeDir, "evidence-items.csv"),
            payload,
          })
        : rowType === "signoff" || rowType === "boundary"
          ? stageV1SignoffBoundaryCsvRow({
              csvPath: join(intakeDir, "signoff-boundary.csv"),
              payload: {
                ...payload,
                rowType,
              },
            })
          : {
              ok: false,
              httpStatus: 422,
              error: {
                code: "V1_FIELD_EVIDENCE_STAGE_ROW_TYPE_INVALID",
                message: "rowType 必须是 evidence、signoff 或 boundary。",
              },
              row: null,
            };

    if (!stageResult.ok) {
      return {
        httpStatus: stageResult.httpStatus || 422,
        body: buildV1FieldEvidenceStageRowErrorBody({
          checkedAt,
          operatorId,
          error: stageResult.error,
          row: stageResult.row,
        }),
      };
    }

    const draftManifestPath = join(artifactRoot, "v1-field-evidence-intake", "filled-manifest.draft.json");
    const draftResult = applyV1FieldEvidenceIntakeFromFiles({
      manifestPath: join(process.cwd(), "docs", "development", "v1-field-evidence-manifest.template.json"),
      csvPath: join(artifactRoot, "v1-field-evidence-intake", "evidence-items.csv"),
      signoffBoundaryCsvPath: join(artifactRoot, "v1-field-evidence-intake", "signoff-boundary.csv"),
      outputPath: draftManifestPath,
      writeOutput: true,
    });
    const draftManifest = sanitizeV1FieldEvidenceIntakeDraftManifestResult(draftResult, { operatorId, checkedAt });
    const fieldEvidenceCsv = readFileSync(join(artifactRoot, "v1-field-evidence-intake", "evidence-items.csv"), "utf8");
    const signoffBoundaryCsv = readFileSync(join(artifactRoot, "v1-field-evidence-intake", "signoff-boundary.csv"), "utf8");
    let draftValidation = isPlainServerObject(draftResult.validation) ? draftResult.validation : {};
    try {
      draftValidation = validateV1FieldEvidenceManifest(JSON.parse(readFileSync(draftManifestPath, "utf8")));
    } catch (error) {
      draftValidation = isPlainServerObject(draftResult.validation) ? draftResult.validation : {};
    }
    const evidenceCloseout = buildV1FieldEvidenceStageRowEvidenceCloseout(fieldEvidenceCsv, draftValidation);
    const closeout = buildV1FieldEvidenceStageRowCloseout(signoffBoundaryCsv, draftValidation);
    const invalidRowCount = normalizeV1NonNegativeInteger(draftManifest.summary?.invalidRowCount);
    const ready = draftManifest.ready === true && invalidRowCount === 0;
    return {
      httpStatus: invalidRowCount > 0 ? 422 : 200,
      body: {
        version: "p0-v1-field-evidence-intake-stage-row-v1",
        scope: "v1_field_evidence_intake_stage_row",
        status: invalidRowCount > 0 ? "invalid" : ready ? "ready_draft_written" : "blocked_draft_written",
        ready,
        checkedAt,
        operatorId,
        row: stageResult.row,
        summary: {
          rowType: stageResult.row.type,
          rowLabel: stageResult.row.label,
          rowStatus: stageResult.row.status,
          csvUpdated: true,
          draftWritten: draftManifest.output?.draftWritten === true,
          evidenceProgress: draftManifest.summary?.evidenceProgress || "0/34",
          signoffProgress: draftManifest.summary?.signoffProgress || "0/6",
          boundaryLabel: draftManifest.summary?.boundaryLabel || "待确认",
          invalidRowCount,
          releaseCandidateRefreshed: false,
        },
        evidenceCloseout,
        closeout,
        draftManifest,
        nextAction:
          invalidRowCount > 0
            ? "该行已保存到采集包，但当前 CSV 仍有无效行；按提示修正后重新生成草稿。"
            : ready
              ? "草稿已生成且现场证据 / 签字 / 边界均满足；下一步用刷新预检确认能否刷新 release candidate。"
              : "草稿行已保存并生成 draft manifest；继续补齐剩余现场证据、负责人签字和 V1/V2 边界。",
        safeguards: buildV1FieldEvidenceStageRowSafeguards({
          csvUpdated: true,
          draftWritten: draftManifest.output?.draftWritten === true,
        }),
      },
    };
  } catch (error) {
    return {
      httpStatus: 400,
      body: buildV1FieldEvidenceStageRowErrorBody({
        checkedAt,
        operatorId,
        error: {
          code: "V1_FIELD_EVIDENCE_STAGE_ROW_FAILED",
          message: "现场证据草稿行保存失败：采集包 CSV 或 manifest 模板缺失 / 不可读。",
        },
      }),
    };
  }
}

function precheckSystemV1ProductionEnv({ operatorId }) {
  const checkedAt = new Date().toISOString();
  try {
    const envPreflight = buildProductionEnvPreflight({ env: process.env, envFiles: [] });
    const productionEnvGate = sanitizeV1ProductionEnvGate(envPreflight, {}, envPreflight.fixChecklist);
    const blockingChecks = productionEnvGate.checks.filter((item) => item.severity === "blocking" && !item.ready);
    const warningChecks = productionEnvGate.checks.filter((item) => item.severity === "warning" && !item.ready);
    const ready = productionEnvGate.ready === true && blockingChecks.length === 0;
    return {
      httpStatus: 200,
      body: {
        version: "p0-v1-production-env-live-precheck-v1",
        scope: "v1_production_env_live_precheck",
        status: ready ? "ready" : "blocked",
        ready,
        checkedAt: productionEnvGate.checkedAt || envPreflight.checkedAt || checkedAt,
        operatorId,
        summary: {
          label: ready ? "当前运行环境已通过生产 env 预检" : "当前运行环境仍未通过生产 env 预检",
          readinessLabel: productionEnvGate.summary.readinessLabel || "0/10",
          passedCount: productionEnvGate.summary.passedCount,
          totalCount: productionEnvGate.summary.totalCount,
          blockingCount: productionEnvGate.summary.blockingCount,
          warningCount: productionEnvGate.summary.warningCount,
          placeholderValueCount: productionEnvGate.summary.placeholderValueCount,
          envFileCount: 0,
          currentRuntime: true,
          envFilePathAccepted: false,
          releaseCandidateRefreshed: false,
          goLiveSuiteRefreshed: false,
          blockerCount: blockingChecks.length,
          warningCheckCount: warningChecks.length,
        },
        checks: productionEnvGate.checks,
        blockingChecks,
        warningChecks,
        nextActions: productionEnvGate.nextActions,
        nextAction: ready
          ? "当前 API 进程 env 已满足 V1 生产预检；仍需结合 env 文件审计、现场证据、签字和 release candidate 复核。"
          : productionEnvGate.nextAction,
        safeguards: {
          ...productionEnvGate.safeguards,
          nonMutating: true,
          liveProcessEnvChecked: true,
          requestBodyIgnored: true,
          envFilePathAccepted: false,
          envFileReadByRequest: false,
          rawProductionEnvPreflightIncluded: false,
          rawEnvFileAuditIncluded: false,
          rawEnvFileIncluded: false,
          environmentValuesIncluded: false,
          envValuesIncluded: false,
          commandValuesIncluded: false,
          secretValuesIncluded: false,
          releaseCandidateRefreshed: false,
          goLiveSuiteRefreshed: false,
        },
      },
    };
  } catch (error) {
    return {
      httpStatus: 500,
      body: {
        version: "p0-v1-production-env-live-precheck-v1",
        scope: "v1_production_env_live_precheck",
        status: "error",
        ready: false,
        checkedAt,
        operatorId,
        error: {
          code: "V1_PRODUCTION_ENV_LIVE_PRECHECK_FAILED",
          message: "当前运行环境生产 env 预检失败。",
        },
        summary: {
          label: "当前运行环境生产 env 预检失败",
          readinessLabel: "0/10",
          passedCount: 0,
          totalCount: 0,
          blockingCount: 0,
          warningCount: 0,
          envFileCount: 0,
          currentRuntime: true,
          envFilePathAccepted: false,
          releaseCandidateRefreshed: false,
          goLiveSuiteRefreshed: false,
        },
        checks: [],
        blockingChecks: [],
        warningChecks: [],
        nextActions: [],
        nextAction: "检查 API 进程环境变量和预检脚本是否可用后重试。",
        safeguards: {
          nonMutating: true,
          liveProcessEnvChecked: true,
          requestBodyIgnored: true,
          envFilePathAccepted: false,
          envFileReadByRequest: false,
          rawProductionEnvPreflightIncluded: false,
          rawEnvFileAuditIncluded: false,
          rawEnvFileIncluded: false,
          environmentValuesIncluded: false,
          envValuesIncluded: false,
          commandValuesIncluded: false,
          secretValuesIncluded: false,
          releaseCandidateRefreshed: false,
          goLiveSuiteRefreshed: false,
        },
      },
    };
  }
}

async function runSystemV1ProductionEnvSetup({ operatorId }) {
  const checkedAt = new Date().toISOString();
  try {
    const report = await runV1ProductionEnvSetupCommand();
    const setup = sanitizeV1ProductionEnvSetupReport(report);
    const ready = setup.ready === true;
    return {
      httpStatus: 200,
      body: buildV1ProductionEnvSetupLiveRunBody({
        operatorId,
        checkedAt,
        status: setup.status || (ready ? "ready" : setup.setupReady ? "prepared" : "blocked"),
        ready,
        report,
        nextAction:
          setup.nextActions[0] ||
          (ready
            ? "生产 env 安全草稿已通过变量预检；下一步用该 env 启动生产 API 并执行第一阶段。"
            : setup.setupReady
              ? "安全 env 草稿已准备；继续按最小真实值片段补齐 PostgreSQL、对象存储、打印和现场证据变量。"
              : "按 setup 阻塞项修正目标安全 env 文件路径、git ignore 或权限后重试。"),
      }),
    };
  } catch {
    return {
      httpStatus: 200,
      body: buildV1ProductionEnvSetupLiveRunBody({
        operatorId,
        checkedAt,
        status: "error",
        ready: false,
        report: {},
        setupFindings: [
          {
            key: "production-env-setup-command-failed",
            label: "生产 env setup 执行失败",
            status: "error",
            detail: "服务端执行 production env setup 失败，可能是模板、目标目录、文件权限或脚本环境异常。",
            nextAction: "由技术/管理检查服务器日志和 setup 目标目录；不要把真实 env 路径或值传给前端。",
          },
        ],
        nextAction: "检查 production env setup 命令环境后重试。",
        error: {
          code: "V1_PRODUCTION_ENV_SETUP_LIVE_RUN_FAILED",
          message: "生产 env 安全草稿 setup 失败，命令输出已脱敏且未返回前端。",
        },
      }),
    };
  }
}

function buildV1ProductionEnvSetupLiveRunBody({
  operatorId,
  checkedAt,
  status,
  ready,
  report = {},
  setupFindings = [],
  nextAction = "",
  error = null,
} = {}) {
  const setup = sanitizeV1ProductionEnvSetupReport(report);
  const sanitizedSetupFindings = Array.isArray(setupFindings) && setupFindings.length
    ? setupFindings.map(sanitizeV1ProductionEnvSetupFinding).filter(Boolean)
    : setup.setupFindings;
  const resultStatus =
    cleanServerText(status) ||
    (ready === true
      ? "ready"
      : setup.available
        ? setup.status || (setup.setupReady ? "prepared" : "blocked")
        : "error");
  const setupReady = setup.setupReady === true;
  const envPreflightReady = setup.envPreflight.ready === true;
  const remainingFixItems = Array.isArray(setup.envPreflight.remainingFixItems)
    ? setup.envPreflight.remainingFixItems
    : [];
  const blockingCount = sanitizedSetupFindings.length + normalizeV1NonNegativeInteger(setup.summary.setupBlockingCount);
  const label =
    ready === true
      ? "生产 env 安全草稿已通过"
      : resultStatus === "error"
        ? "生产 env 安全草稿 setup 失败"
        : setupReady
          ? "生产 env 安全草稿已准备"
          : "生产 env 安全草稿仍有阻塞";
  const resolvedNextAction =
    cleanServerText(nextAction) ||
    setup.nextActions[0] ||
    (ready === true
      ? "用该安全 env 文件启动生产 API，并继续执行生产环境 / 持久化第一阶段。"
      : setupReady
        ? "按最小真实值片段补齐 PostgreSQL、对象存储、打印桥、CUPS 和验收账号真实值后重跑校验。"
        : "修正 production env setup 目标安全 env 文件、git ignore、权限或模板后重试。");
  const body = {
    version: "p0-v1-production-env-setup-live-run-v1",
    scope: "v1_production_env_setup_live_run",
    status: resultStatus,
    ready: ready === true,
    checkedAt: setup.checkedAt || checkedAt || new Date().toISOString(),
    operatorId,
    summary: {
      label,
      setupLabel: setup.summary.label,
      setupStatus: setup.status,
      setupReady,
      productionReady: ready === true,
      generated: setup.summary.generated === true,
      imported: setup.summary.imported === true,
      overwritten: setup.summary.overwritten === true,
      targetExistedBefore: setup.summary.targetExistedBefore === true,
      auditReady: setup.audit.ready === true,
      auditStatus: setup.audit.status,
      envPreflightReady,
      envPreflightStatus: setup.envPreflight.status,
      envPreflightLabel: setup.envPreflight.readinessLabel,
      envPreflightPassedCount: setup.envPreflight.passedCount,
      envPreflightTotalCount: setup.envPreflight.totalCount,
      envPreflightBlockingCount: setup.envPreflight.blockingCount,
      envPreflightWarningCount: setup.envPreflight.warningCount,
      remainingFixItemCount: remainingFixItems.length || setup.summary.remainingFixItemCount,
      blockingCount,
      blockerLabel: `${blockingCount} 项`,
      requestBodyIgnored: true,
      frontendTargetPathAccepted: false,
      frontendImportPathAccepted: false,
      frontendEnvValuesAccepted: false,
      targetEnvFilePathExposed: false,
      targetEnvFileConfigured: setup.envFile.assignmentCount > 0 || setup.envFile.existedBefore === true,
      targetEnvFileWritten: setup.summary.generated === true || setup.summary.imported === true || setup.summary.overwritten === true,
      targetEnvFileOverwritten: setup.summary.overwritten === true,
      targetEnvDraftMayBeCreated: true,
      productionEnvRealValuesWritten: false,
      setupReportRefreshed: setup.available === true,
      productionEnvValuesApplyExecuted: false,
      businessDataMutated: false,
      schemaMigrationApplyExecuted: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
    },
    setup,
    setupFindings: sanitizedSetupFindings,
    remainingFixItems,
    serverConfigGuidance: buildV1ProductionEnvSetupServerConfigGuidance({
      setup,
      status: resultStatus,
      ready: ready === true,
    }),
    nextActions: [resolvedNextAction, ...setup.nextActions].filter(Boolean).slice(0, 8),
    nextAction: resolvedNextAction,
    safeguards: {
      requestBodyIgnored: true,
      frontendTargetPathAccepted: false,
      frontendImportPathAccepted: false,
      frontendEnvValuesAccepted: false,
      forceOverwriteEnabled: false,
      importFromEnabled: false,
      targetEnvFilePathExposed: false,
      envValuesIncluded: false,
      environmentValuesIncluded: false,
      connectionStringExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      spoolPathExposed: false,
      rawTemplateValuesCopied: false,
      importedEnvValuesExposed: false,
      productionEnvRealValuesWritten: false,
      targetEnvDraftMayBeCreated: true,
      targetEnvFileOverwritten: setup.summary.overwritten === true,
      setupReportRefreshed: setup.available === true,
      productionEnvFilePathIncluded: false,
      productionEnvValuesApplyExecuted: false,
      schemaMigrationApplyExecuted: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
      businessDataMutated: false,
      declaresFullV1Complete: false,
    },
  };
  return error ? { ...body, error } : body;
}

function buildV1ProductionEnvSetupServerConfigGuidance({ setup = {}, status = "blocked", ready = false } = {}) {
  return {
    label: "生产 env setup 受控入口",
    status: cleanServerText(status) || "blocked",
    ready: ready === true,
    setupReady: setup.setupReady === true,
    targetSource: "server-default",
    templateSource: "checked-in v1-production.env.example",
    primaryInput: "server-default production env setup",
    acceptsFrontendTargetPath: false,
    acceptsFrontendImportPath: false,
    acceptsFrontendEnvValues: false,
    targetEnvFilePathExposed: false,
    forceOverwriteEnabled: false,
    importFromEnabled: false,
    setupReportRefreshed: setup.available === true,
    steps: [
      "点击后由服务端按默认模板生成或复核安全生产 env 草稿。",
      "入口不接受浏览器传入目标路径、导入路径或真实 env 值。",
      "入口不使用 --force，不覆盖已有安全 env 文件；已有文件只复核安全状态和变量预检。",
      "补齐真实值仍要在服务器安全 env 文件或安全片段中完成，再跑真实值 dry-run 和正式合并。",
    ],
    verificationActions: [
      "node scripts/run-v1-production-env-setup.mjs --json",
      "POST /api/system/v1-production-env-setup/live-run",
    ],
    safeguards: {
      frontendTargetPathAccepted: false,
      frontendImportPathAccepted: false,
      frontendEnvValuesAccepted: false,
      targetEnvFilePathExposed: false,
      forceOverwriteEnabled: false,
      importFromEnabled: false,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      productionEnvValuesApplyExecuted: false,
      schemaMigrationApplyExecuted: false,
      businessDataMutated: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
  };
}

function precheckSystemV1ProductionEnvIntake({ operatorId }) {
  const checkedAt = new Date().toISOString();
  const setupEnvResolution = resolveV1ProductionEnvSetupSafeEnvFileForIntakeLivePrecheck();
  if (setupEnvResolution.ready !== true) {
    return {
      httpStatus: 200,
      body: buildV1ProductionEnvIntakeLivePrecheckBody({
        operatorId,
        checkedAt,
        status: setupEnvResolution.status,
        ready: false,
        report: {},
        setupEnvResolution,
        blockingItems: setupEnvResolution.blockingItems,
        nextAction: setupEnvResolution.nextAction,
      }),
    };
  }

  try {
    const report = buildProductionEnvIntakeVerifyReport({
      envFiles: setupEnvResolution.envFiles,
      intakeCsv: V1_PRODUCTION_ENV_INTAKE_CSV_PATH,
    });
    const verification = sanitizeV1ProductionEnvIntakeVerification(report);
    const ready = verification.ready === true;
    return {
      httpStatus: 200,
      body: buildV1ProductionEnvIntakeLivePrecheckBody({
        operatorId,
        checkedAt,
        status: ready ? "ready" : verification.status || "blocked",
        ready,
        report,
        setupEnvResolution,
        nextAction:
          verification.nextActions[0] ||
          (ready
            ? "生产 env 真实值 intake 校验已通过；继续执行生产 env 变量预检和第一阶段。"
            : "按真实值 intake 阻塞项补齐安全 env 文件或清单验收列，再重新校验真实值。"),
      }),
    };
  } catch {
    return {
      httpStatus: 200,
      body: buildV1ProductionEnvIntakeLivePrecheckBody({
        operatorId,
        checkedAt,
        status: "error",
        ready: false,
        report: {},
        setupEnvResolution,
        blockingItems: [
          {
            key: "production-env-intake-live-precheck-failed",
            label: "生产 env 真实值校验执行失败",
            status: "error",
            detail: "服务端执行生产 env 真实值 intake 校验失败，可能是 setup 安全 env 文件或 intake CSV 未就绪。",
            nextAction: "由技术/管理检查 production env setup、真实值 intake CSV 和安全 env 文件后重试；不要把真实路径或 env 值传给前端。",
          },
        ],
        nextAction: "检查 production env setup 安全文件和真实值 intake CSV 后重试。",
        error: {
          code: "V1_PRODUCTION_ENV_INTAKE_LIVE_PRECHECK_FAILED",
          message: "生产 env 真实值 intake 校验失败。",
        },
      }),
    };
  }
}

function precheckSystemV1ProductionEnvFileAudit({ operatorId }) {
  const checkedAt = new Date().toISOString();
  const envFileConfig = getConfiguredV1ProductionEnvAuditFileConfig();
  const configuredEnvFiles = envFileConfig.envFiles;
  if (configuredEnvFiles.length === 0) {
    return {
      httpStatus: 200,
      body: buildV1ProductionEnvFileAuditPrecheckBody({
        operatorId,
        checkedAt,
        status: "not_configured",
        ready: false,
        audit: {
          status: "not_configured",
          ready: false,
          checkedAt,
          envFileCount: 0,
          summary: {
            label: "服务端未配置安全 env 文件审计路径",
            fileCount: 0,
            blockingCount: 1,
            warningCount: 0,
            passedCount: 0,
            placeholderAssignmentCount: 0,
            uncommentedAssignmentCount: 0,
            sensitiveVariableNameCount: 0,
            crossFileDuplicateVariableCount: 0,
          },
          files: [],
          blockingFindings: [
            {
              key: "server-env-file-audit-path-not-configured",
              label: "服务端 env 文件审计路径未配置",
              status: "blocked",
              severity: "blocking",
              detail: "API 进程未配置 ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS。",
              nextAction: "在服务端配置安全未跟踪 env 文件路径后，重启 API 并重新审计。",
              variables: [],
            },
          ],
          warningFindings: [],
          nextActions: ["在 API 进程配置 ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS，指向安全未跟踪 env 文件。"],
          safeguards: {
            nonMutating: true,
            envValuesExposed: false,
            connectionStringExposed: false,
            secretFieldsExposed: false,
            commandValueExposed: false,
            commentsCopied: false,
            rawLineContentCopied: false,
          },
        },
        configuredEnvFileCount: 0,
        envFileConfig,
      }),
    };
  }

  try {
    const audit = buildProductionEnvFileAuditReport({ envFiles: configuredEnvFiles });
    return {
      httpStatus: 200,
      body: buildV1ProductionEnvFileAuditPrecheckBody({
        operatorId,
        checkedAt,
        status: audit.ready ? "passed" : "blocked",
        ready: audit.ready === true,
        audit,
        configuredEnvFileCount: configuredEnvFiles.length,
        envFileConfig,
      }),
    };
  } catch (error) {
    const audit = {
      status: "blocked",
      ready: false,
      checkedAt,
      envFileCount: configuredEnvFiles.length,
      summary: {
        label: "服务端 env 文件审计失败",
        fileCount: configuredEnvFiles.length,
        blockingCount: 1,
        warningCount: 0,
        passedCount: 0,
        placeholderAssignmentCount: 0,
        uncommentedAssignmentCount: 0,
        sensitiveVariableNameCount: 0,
        crossFileDuplicateVariableCount: 0,
      },
      files: [],
      blockingFindings: [
        {
          key: "server-env-file-audit-failed",
          label: "服务端 env 文件不可审计",
          status: "blocked",
          severity: "blocking",
          detail: "服务端配置的 env 文件缺失、不可读或格式不符合审计要求。",
          nextAction: "检查服务端 env 文件路径、权限和格式后重试；不要把真实路径或 env 值传给前端。",
          variables: [],
        },
      ],
      warningFindings: [],
      nextActions: ["检查 API 进程配置的 env 文件是否存在、可读、未被 git 跟踪且位于忽略路径。"],
      safeguards: {
        nonMutating: true,
        envValuesExposed: false,
        connectionStringExposed: false,
        secretFieldsExposed: false,
        commandValueExposed: false,
        commentsCopied: false,
        rawLineContentCopied: false,
      },
    };
    return {
      httpStatus: 200,
      body: {
        ...buildV1ProductionEnvFileAuditPrecheckBody({
          operatorId,
          checkedAt,
          status: "blocked",
          ready: false,
          audit,
          configuredEnvFileCount: configuredEnvFiles.length,
          envFileConfig,
        }),
        error: {
          code: "V1_PRODUCTION_ENV_FILE_AUDIT_LIVE_PRECHECK_FAILED",
          message: "服务端 env 文件安全审计失败。",
        },
      },
    };
  }
}

function precheckSystemV1ProductionEnvFilePreview({ operatorId }) {
  const checkedAt = new Date().toISOString();
  const envFileConfig = getConfiguredV1ProductionEnvApplicationFileConfig({ allowAuditOnlyFallback: true });
  const configuredEnvFiles = envFileConfig.envFiles;
  if (configuredEnvFiles.length === 0) {
    return {
      httpStatus: 200,
      body: buildV1ProductionEnvFilePreviewPrecheckBody({
        operatorId,
        checkedAt,
        status: "not_configured",
        ready: false,
        configuredEnvFileCount: 0,
        fallbackChecks: [
          buildV1ProductionEnvPreviewFallbackCheck({
            key: "server-env-file-preview-path-not-configured",
            label: "服务端 env 文件路径未配置",
            detail: "API 进程未配置 ERP_V1_PRODUCTION_ENV_FILE 或 ERP_V1_ENV_FILE。",
            nextAction: "先在服务端配置 API 启动应用生产 env 的安全未跟踪文件，再执行文件应用预检。",
            requiredVariables: ["ERP_V1_PRODUCTION_ENV_FILE or ERP_V1_ENV_FILE"],
            missingVariables: ["ERP_V1_PRODUCTION_ENV_FILE"],
          }),
        ],
        nextAction: "在 API 进程配置 ERP_V1_PRODUCTION_ENV_FILE=<secure-env-file> 并重启 API；ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS 只用于只读审计 / 预览。",
        envFileConfig,
      }),
    };
  }

  try {
    const audit = buildProductionEnvFileAuditReport({ envFiles: configuredEnvFiles });
    if (audit.ready !== true) {
      return {
        httpStatus: 200,
        body: buildV1ProductionEnvFilePreviewPrecheckBody({
          operatorId,
          checkedAt,
          status: "audit_blocked",
          ready: false,
          audit,
          configuredEnvFileCount: configuredEnvFiles.length,
          fallbackChecks: [
            buildV1ProductionEnvPreviewFallbackCheck({
              key: "server-env-file-preview-audit-blocked",
              label: "env 文件安全审计未通过",
              detail: "服务端配置的 env 文件仍有安全审计阻塞项，未继续读取变量做应用预检。",
              nextAction: "先修正 env 文件审计阻塞，再重新执行文件应用预检。",
              requiredVariables: ["通过 env 文件安全审计"],
              missingVariables: ["env 文件安全审计通过"],
            }),
          ],
          nextAction: "先修正 env 文件审计阻塞，再重新执行文件应用预检。",
          envFileConfig,
        }),
      };
    }

    const previewEnv = buildV1ProductionEnvPreviewEnvironment(configuredEnvFiles);
    const envPreflight = buildProductionEnvPreflight({ env: previewEnv, envFiles: configuredEnvFiles });
    const productionEnvGate = sanitizeV1ProductionEnvGate(envPreflight, audit, envPreflight.fixChecklist);
    const blockingChecks = productionEnvGate.checks.filter((item) => item.severity === "blocking" && !item.ready);
    const ready = productionEnvGate.ready === true && blockingChecks.length === 0;
    return {
      httpStatus: 200,
      body: buildV1ProductionEnvFilePreviewPrecheckBody({
        operatorId,
        checkedAt,
        status: ready ? "ready" : "blocked",
        ready,
        audit,
        productionEnvGate,
        configuredEnvFileCount: configuredEnvFiles.length,
        nextAction: ready
          ? "该服务端 env 文件内容可使生产 env 预检通过；下一步用同一安全文件启动 API，再跑运行时 readiness 和 release candidate。"
          : productionEnvGate.nextAction,
        envFileConfig,
      }),
    };
  } catch (error) {
    return {
      httpStatus: 200,
      body: {
        ...buildV1ProductionEnvFilePreviewPrecheckBody({
          operatorId,
          checkedAt,
          status: "error",
          ready: false,
          configuredEnvFileCount: configuredEnvFiles.length,
          fallbackChecks: [
            buildV1ProductionEnvPreviewFallbackCheck({
              key: "server-env-file-preview-failed",
              label: "服务端 env 文件应用预检失败",
              detail: "服务端配置的 env 文件缺失、不可读或无法解析为预检环境。",
              nextAction: "检查服务端 env 文件路径、权限和 KEY=VALUE 格式后重试。",
              requiredVariables: ["可读取的安全 env 文件"],
              missingVariables: ["可读取的安全 env 文件"],
            }),
          ],
          nextAction: "检查服务端 env 文件路径、权限和 KEY=VALUE 格式后重试；不要把路径或 env 值传给前端。",
          envFileConfig,
        }),
        error: {
          code: "V1_PRODUCTION_ENV_FILE_PREVIEW_LIVE_PRECHECK_FAILED",
          message: "服务端 env 文件应用预检失败。",
        },
      },
    };
  }
}

async function precheckSystemV1ProductionGoLive({ request, operatorId }) {
  const checkedAt = new Date().toISOString();
  const envFileConfig = getConfiguredV1ProductionEnvApplicationFileConfig({ allowAuditOnlyFallback: false });
  const configuredEnvFiles = envFileConfig.envFiles;
  try {
    const envFileAudit =
      configuredEnvFiles.length > 0
        ? buildProductionEnvFileAuditReport({ envFiles: configuredEnvFiles })
        : buildV1ProductionGoLiveMissingEnvFileAudit({ checkedAt });
    const envPreflight =
      configuredEnvFiles.length > 0 && envFileAudit.ready === true
        ? buildProductionEnvPreflight({
            env: buildV1ProductionEnvPreviewEnvironment(configuredEnvFiles),
            envFiles: configuredEnvFiles,
          })
        : buildProductionEnvPreflight({ env: process.env, envFiles: [] });
    const envIntakeVerification =
      configuredEnvFiles.length > 0
        ? buildProductionEnvIntakeVerifyReport({ envFiles: configuredEnvFiles })
        : buildV1ProductionGoLiveMissingEnvIntakeVerification({ checkedAt });
    const runtimeReadiness = await buildCurrentV1RuntimeReadinessReport({
      request,
      operatorId,
    });
    const report = buildProductionGoLivePrecheckReport({
      checkedAt,
      envFileAudit,
      envIntakeVerification,
      envPreflight,
      runtimeReadiness,
      envFileCount: configuredEnvFiles.length,
    });
    return {
      httpStatus: 200,
      body: buildV1ProductionGoLivePrecheckBody({
        report,
        operatorId,
        checkedAt,
        configuredEnvFileCount: configuredEnvFiles.length,
        envFileConfig,
      }),
    };
  } catch (error) {
    return {
      httpStatus: 500,
      body: buildV1ProductionGoLivePrecheckErrorBody({
        operatorId,
        checkedAt,
        configuredEnvFileCount: configuredEnvFiles.length,
        envFileConfig,
      }),
    };
  }
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
  const checkedAt = new Date().toISOString();
  const applyEnabled = isV1ProductionEnvValuesApplyEnabled();
  const valuesFileConfig = getConfiguredV1ProductionEnvValuesFileConfig();
  const configuredValuesFiles = valuesFileConfig.envFiles;
  const targetSetupStatus = buildV1ProductionEnvSetupTargetStatus();
  const artifacts = readV1GoLiveStatusArtifacts();
  const currentIntakeVerification = sanitizeV1ProductionEnvIntakeVerification(
    artifacts.productionEnvIntakeVerification.value,
  );
  const dryRunProofStatus = buildV1ProductionEnvValuesDryRunProofStatus(
    artifacts.productionFirstStageExecution.value,
    currentIntakeVerification,
    {
      valuesFileConfig,
      configuredValuesFileCount: configuredValuesFiles.length,
      checkFileBinding: configuredValuesFiles.length === 1,
    },
  );
  if (!applyEnabled) {
    return {
      httpStatus: 200,
      body: buildV1ProductionFirstStageValuesApplyLiveRunBody({
        operatorId,
        checkedAt,
        status: "disabled",
        ready: false,
        applyEnabled,
        report: {},
        valuesFileConfig,
        configuredValuesFileCount: configuredValuesFiles.length,
        targetSetupStatus,
        dryRunProofStatus,
        blockingItems: [
          {
            key: "production-env-values-apply-disabled",
            label: "真实值正式合并未启用",
            status: "blocked",
            detail: "API 进程未启用 ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED，正式合并不会写目标生产 env 草稿。",
            nextAction:
              "先完成真实值 dry-run 并由负责人确认；确认后在 API 进程配置 ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED=true，重启 API，再执行正式合并。",
          },
        ],
        nextAction: "先完成真实值 dry-run；确认后由技术/管理启用服务端正式合并开关并重启 API。",
      }),
    };
  }
  if (configuredValuesFiles.length === 0) {
    return {
      httpStatus: 200,
      body: buildV1ProductionFirstStageValuesApplyLiveRunBody({
        operatorId,
        checkedAt,
        status: "not_configured",
        ready: false,
        applyEnabled,
        report: {},
        valuesFileConfig,
        configuredValuesFileCount: 0,
        targetSetupStatus,
        dryRunProofStatus,
        blockingItems: [
          {
            key: "production-env-values-file-not-configured",
            label: "服务端真实值片段路径未配置",
            status: "blocked",
            detail: "正式合并开关已启用，但 API 进程未配置 ERP_V1_PRODUCTION_ENV_VALUES_FILE，不能写目标生产 env 草稿。",
            nextAction:
              "在 API 进程配置 ERP_V1_PRODUCTION_ENV_VALUES_FILE，指向安全未跟踪的真实值片段后重启 API，再执行正式合并。",
          },
        ],
        nextAction: "配置单个安全真实值片段路径后重启 API，再执行正式合并。",
      }),
    };
  }
  if (configuredValuesFiles.length !== 1) {
    return {
      httpStatus: 200,
      body: buildV1ProductionFirstStageValuesApplyLiveRunBody({
        operatorId,
        checkedAt,
        status: "blocked",
        ready: false,
        applyEnabled,
        report: {},
        valuesFileConfig,
        configuredValuesFileCount: configuredValuesFiles.length,
        targetSetupStatus,
        dryRunProofStatus,
        blockingItems: [
          {
            key: "production-env-values-file-count",
            label: "真实值片段文件数量不唯一",
            status: "blocked",
            detail: "服务端 values file 配置解析到多个文件，无法判断要正式合并哪一个片段。",
            nextAction: "只保留一个安全未跟踪真实值片段路径，重启 API 后重试；不要从前端传路径。",
          },
        ],
        nextAction: "把服务端真实值片段配置收敛为单个文件后重试。",
      }),
    };
  }
  if (targetSetupStatus.ready !== true) {
    return {
      httpStatus: 200,
      body: buildV1ProductionFirstStageValuesApplyLiveRunBody({
        operatorId,
        checkedAt,
        status: "target_not_ready",
        ready: false,
        applyEnabled,
        report: {},
        valuesFileConfig,
        configuredValuesFileCount: configuredValuesFiles.length,
        targetSetupStatus,
        dryRunProofStatus,
        blockingItems: targetSetupStatus.blockingItems.length
          ? targetSetupStatus.blockingItems
          : [
              {
                key: "production-env-setup-target-not-ready",
                label: "目标生产 env 安全草稿未就绪",
                status: "blocked",
                detail: "正式合并开关和真实值片段已配置，但 production env setup 未确认目标安全 env 文件可写。",
                nextAction: "先重新运行 production env setup，确认目标安全 env 文件存在、已 git ignore、未跟踪且权限为 600，再执行正式合并。",
              },
            ],
        nextAction:
          targetSetupStatus.nextAction ||
          "先重新运行 production env setup，确认目标安全 env 文件 ready 后再执行正式合并。",
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
      body: buildV1ProductionFirstStageValuesApplyLiveRunBody({
        operatorId,
        checkedAt,
        status: "audit_blocked",
        ready: false,
        applyEnabled,
        report: {},
        valuesFileConfig,
        configuredValuesFileCount: configuredValuesFiles.length,
        targetSetupStatus,
        valuesFileAuditStatus,
        dryRunProofStatus,
        blockingItems: valuesFileAuditStatus.blockingItems.length
          ? valuesFileAuditStatus.blockingItems
          : [
              {
                key: "production-env-values-file-audit-blocked",
                label: "真实值片段安全审计未通过",
                status: "blocked",
                detail: "正式合并开关和目标 env 已就绪，但真实值片段文件未通过安全审计，不能写目标生产 env 草稿。",
                nextAction: "先修正真实值片段文件的安全审计阻塞项，再重启 API 并重新执行正式合并。",
              },
            ],
        nextAction:
          valuesFileAuditStatus.nextAction ||
          "先修正真实值片段文件的安全审计阻塞项，再重启 API 并重新执行正式合并。",
      }),
    };
  }
  if (dryRunProofStatus.ready !== true) {
    const dryRunProofBlockedStatus = isV1ProductionEnvValuesDryRunProofFileBindingBlockedStatus(
      dryRunProofStatus.status,
    )
      ? "dry_run_file_binding_blocked"
      : dryRunProofStatus.status === "stale_or_expired"
        ? "dry_run_expired"
      : dryRunProofStatus.status === "stale_or_mismatched"
        ? "dry_run_stale_or_mismatched"
        : "dry_run_not_ready";
    return {
      httpStatus: 200,
      body: buildV1ProductionFirstStageValuesApplyLiveRunBody({
        operatorId,
        checkedAt,
        status: dryRunProofBlockedStatus,
        ready: false,
        applyEnabled,
        report: {},
        valuesFileConfig,
        configuredValuesFileCount: configuredValuesFiles.length,
        targetSetupStatus,
        valuesFileAuditStatus,
        dryRunProofStatus,
        blockingItems: [
          {
            key: "production-env-values-dry-run-proof-not-ready",
            label:
              dryRunProofBlockedStatus === "dry_run_file_binding_blocked"
                ? "最近真实值 dry-run 片段绑定未通过"
                : "最近真实值 dry-run 证明未通过",
            status: "blocked",
            detail:
              dryRunProofBlockedStatus === "dry_run_file_binding_blocked"
                ? "正式合并开关、真实值片段、目标 env 和片段审计已就绪，但最近 dry-run 没有证明当前真实值片段指纹一致。"
                : "正式合并开关、真实值片段、目标 env 和片段审计已就绪，但最近第一阶段 latest 未证明最小阻塞补值 dry-run 覆盖。",
            nextAction:
              dryRunProofStatus.nextAction ||
              "先执行真实值 dry-run，确认最小阻塞补值覆盖并刷新上线状态，再重新执行正式合并。",
          },
        ],
        nextAction:
          dryRunProofStatus.nextAction ||
          "先执行真实值 dry-run，确认最小阻塞补值覆盖并刷新上线状态，再重新执行正式合并。",
      }),
    };
  }

  try {
    const report = await runV1ProductionFirstStageValuesApplyCommand({
      valuesFile: configuredValuesFiles[0],
    });
    const sanitizedReport = sanitizeV1ProductionEnvValuesApplyReport(report);
    return {
      httpStatus: 200,
      body: buildV1ProductionFirstStageValuesApplyLiveRunBody({
        operatorId,
        checkedAt,
        status: sanitizedReport.status || (sanitizedReport.ready ? "ready" : "blocked"),
        ready: sanitizedReport.ready === true,
        applyEnabled,
        report,
        valuesFileConfig,
        configuredValuesFileCount: configuredValuesFiles.length,
        targetSetupStatus,
        valuesFileAuditStatus,
        dryRunProofStatus,
        nextAction: sanitizedReport.ready
          ? "真实值已合并且 setup / 生产 env 预检 / intake 校验均 ready；下一步用该安全 env 文件重启生产 API 并继续第一阶段。"
          : sanitizedReport.nextActions[0] || "真实值已按允许边界处理；继续按 setup / intake 校验结果补齐剩余生产 env 项。",
      }),
    };
  } catch {
    return {
      httpStatus: 200,
      body: buildV1ProductionFirstStageValuesApplyLiveRunBody({
        operatorId,
        checkedAt,
        status: "error",
        ready: false,
        applyEnabled,
        report: {},
        valuesFileConfig,
        configuredValuesFileCount: configuredValuesFiles.length,
        targetSetupStatus,
        valuesFileAuditStatus,
        dryRunProofStatus,
        blockingItems: [
          {
            key: "production-first-stage-values-apply-command-failed",
            label: "真实值正式合并执行失败",
            status: "error",
            detail: "服务端执行真实值白名单合并失败，可能是生产 env setup 安全 env 文件、真实值片段或 intake CSV 未就绪。",
            nextAction: "由技术/管理检查服务端安全文件配置、权限和 intake apply 报告后重试；不要把真实路径或 env 值传给前端。",
          },
        ],
        nextAction: "检查服务端安全 env 文件、真实值片段和 production env setup 报告后重试。",
        error: {
          code: "V1_PRODUCTION_FIRST_STAGE_VALUES_APPLY_LIVE_RUN_FAILED",
          message: "第一阶段真实值正式合并失败。",
        },
      }),
    };
  }
}

async function runSystemV1ProductionFirstStageExecution({ request, operatorId }) {
  const checkedAt = new Date().toISOString();
  try {
    const report = await runV1ProductionFirstStageExecutionCommand({
      apiBaseUrl: getCurrentV1ApiBaseUrl(request),
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

async function buildCurrentV1RuntimeReadinessReport({ request, operatorId }) {
  const apiBaseUrl = buildCurrentApiBaseUrl(request);
  const driverOperatorId = cleanServerText(process.env.ERP_V1_READINESS_DRIVER_OPERATOR_ID) || "U-DRIVER-A";
  const headers = buildV1ReadinessHeaders({ operatorId, bearerToken: "" });
  const driverHeaders = buildV1ReadinessHeaders({ operatorId: driverOperatorId, bearerToken: "" });
  const responses = await readV1ReadinessSources({ apiBaseUrl, headers, driverHeaders });
  return buildV1ReadinessReport({
    apiBaseUrl,
    operatorId,
    driverOperatorId,
    responses,
  });
}

function buildV1ProductionGoLiveMissingEnvFileAudit({ checkedAt }) {
  return {
    scope: "v1_production_env_file_audit",
    status: "not_configured",
    ready: false,
    checkedAt,
    envFileCount: 0,
    summary: {
      label: "服务端未配置 API 启动应用生产 env 文件",
      fileCount: 0,
      blockingCount: 1,
      warningCount: 0,
      passedCount: 0,
      placeholderAssignmentCount: 0,
      uncommentedAssignmentCount: 0,
      sensitiveVariableNameCount: 0,
      crossFileDuplicateVariableCount: 0,
    },
    files: [],
    blockingFindings: [
      {
        key: "server-env-file-audit-path-not-configured",
        label: "服务端 env 文件审计路径未配置",
        status: "blocked",
        severity: "blocking",
        detail: "API 进程未配置 ERP_V1_PRODUCTION_ENV_FILE 或 ERP_V1_ENV_FILE。",
        nextAction: "在服务端配置 ERP_V1_PRODUCTION_ENV_FILE=<secure-env-file> 后重启 API，并重新执行生产上线组合预检。",
        variables: [],
      },
    ],
    warningFindings: [],
    nextActions: ["在 API 进程配置 ERP_V1_PRODUCTION_ENV_FILE=<secure-env-file>，指向安全未跟踪 env 文件并重启 API；不要只配置 audit-only 变量。"],
    safeguards: {
      nonMutating: true,
      envValuesExposed: false,
      connectionStringExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      commentsCopied: false,
      rawLineContentCopied: false,
    },
  };
}

function buildV1ProductionGoLiveMissingEnvIntakeVerification({ checkedAt }) {
  return {
    scope: "v1_production_env_real_value_intake_verification",
    status: "blocked",
    ready: false,
    checkedAt,
    summary: {
      label: "未配置安全 env 文件，真实值 intake 校验未执行",
      envFileCount: 0,
      envFilePathIncluded: false,
      intakeCsvPathIncluded: false,
      intakeRowCount: 0,
      configuredRowCount: 0,
      missingRowCount: 0,
      alternativeGroupCount: 0,
      alternativeGroupBlockingCount: 0,
      alternativeGroupWarningCount: 0,
      passedRowCount: 0,
      blockingCount: 1,
      warningCount: 0,
      auditReady: false,
      intakeCsvReady: false,
    },
    blockingFindings: [
      {
        key: "production-env-intake-env-file-missing",
        label: "生产 env 真实值 intake 校验",
        status: "blocked",
        severity: "blocking",
        detail: "API 进程未配置 ERP_V1_PRODUCTION_ENV_FILE 或 ERP_V1_ENV_FILE，不能校验真实值 intake 清单。",
        nextAction: "先在服务端配置安全生产 env 文件，再重跑生产上线组合预检。",
      },
    ],
    warningFindings: [],
    nextActions: ["先在服务端配置安全生产 env 文件，再重跑生产 env 真实值 intake 校验。"],
    safeguards: {
      nonMutating: true,
      envFilePathIncluded: false,
      intakeCsvPathIncluded: false,
      envValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageEndpointIncluded: false,
      objectStorageBucketIncluded: false,
      secretFieldsIncluded: false,
      commandValueIncluded: false,
      spoolPathIncluded: false,
      tokenIncluded: false,
      rawEnvLineIncluded: false,
      rawEvidenceRefIncluded: false,
    },
  };
}

function buildV1ProductionEnvIntakeLivePrecheckBody({
  operatorId,
  checkedAt,
  status,
  ready,
  report = {},
  setupEnvResolution = {},
  blockingItems = [],
  nextAction = "",
  error = null,
} = {}) {
  const verification = sanitizeV1ProductionEnvIntakeVerification(report);
  const sanitizedBlockingItems = Array.isArray(blockingItems)
    ? blockingItems.map(sanitizeV1ProductionFirstStageValuesDryRunBlockingItem).filter(Boolean)
    : [];
  const resultStatus =
    cleanServerText(status) ||
    (ready === true
      ? "ready"
      : verification.available
        ? verification.status || "blocked"
        : setupEnvResolution.status || "not_configured");
  const verificationBlockingCount = normalizeV1NonNegativeInteger(verification.summary?.blockingCount);
  const verificationWarningCount = normalizeV1NonNegativeInteger(verification.summary?.warningCount);
  const blockingCount = sanitizedBlockingItems.length + verificationBlockingCount;
  const label =
    ready === true
      ? "生产 env 真实值校验通过"
      : resultStatus === "not_configured"
        ? "生产 env setup 安全文件未配置"
        : resultStatus === "error"
          ? "生产 env 真实值校验失败"
          : "生产 env 真实值校验仍有阻塞";
  const resolvedNextAction =
    cleanServerText(nextAction) ||
    verification.nextActions[0] ||
    (ready === true
      ? "继续执行生产 env 变量预检和生产环境 / 持久化第一阶段。"
      : "按真实值 intake 校验阻塞项补齐安全 env 文件或清单验收列后重试。");
  const body = {
    version: "p0-v1-production-env-intake-live-precheck-v1",
    scope: "v1_production_env_intake_live_precheck",
    status: resultStatus,
    ready: ready === true,
    checkedAt: verification.checkedAt || checkedAt || new Date().toISOString(),
    operatorId,
    summary: {
      label,
      verificationLabel: verification.summary.label,
      verificationStatus: verification.status,
      configuredLabel: verification.summary.configuredLabel,
      fullIntakeConfiguredLabel: verification.summary.fullIntakeConfiguredLabel,
      intakeRowCount: verification.summary.intakeRowCount,
      configuredRowCount: verification.summary.configuredRowCount,
      missingRowCount: verification.summary.missingRowCount,
      minimumBlockingLabel: verification.summary.minimumBlockingLabel,
      minimumWarningLabel: verification.summary.minimumWarningLabel,
      minimumBlockingMissingCount: verification.summary.minimumBlockingMissingCount,
      minimumWarningMissingCount: verification.summary.minimumWarningMissingCount,
      blockingCount,
      warningCount: verificationWarningCount,
      blockerLabel: `${blockingCount} 项`,
      warningLabel: `${verificationWarningCount} 项`,
      auditReady: verification.summary.auditReady === true,
      intakeCsvReady: verification.summary.intakeCsvReady === true,
      setupReportAvailable: setupEnvResolution.setupReportAvailable === true,
      setupReady: setupEnvResolution.setupReady === true,
      envFileFromProductionSetup: setupEnvResolution.ready === true,
      envFileCount: normalizeV1NonNegativeInteger(setupEnvResolution.envFileCount),
      requestBodyIgnored: true,
      envFilePathAccepted: false,
      envFilePathExposed: false,
      intakeCsvPathExposed: false,
      productionEnvFileMutated: false,
      productionEnvValuesApplyExecuted: false,
      businessDataMutated: false,
      schemaMigrationApplyExecuted: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      physicalPrinterCalled: false,
      driverDeliveryStatusChanged: false,
    },
    verification,
    blockingItems: sanitizedBlockingItems,
    minimumBlockingItems: verification.minimumBlockingItems,
    blockingFindings: verification.blockingFindings,
    warningFindings: verification.warningFindings,
    serverConfigGuidance: buildV1ProductionEnvIntakeLivePrecheckServerConfigGuidance({
      setupEnvResolution,
      ready: ready === true,
      status: resultStatus,
    }),
    nextActions: [resolvedNextAction, ...verification.nextActions].filter(Boolean).slice(0, 8),
    nextAction: resolvedNextAction,
    safeguards: {
      nonMutating: true,
      requestBodyIgnored: true,
      envFileReadFromServerProductionSetupOnly: true,
      envFilePathAcceptedFromRequest: false,
      envFilePathExposed: false,
      intakeCsvPathExposed: false,
      rawProductionEnvIntakeVerificationIncluded: false,
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
      productionEnvValuesApplyExecuted: false,
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

function buildV1ProductionEnvIntakeLivePrecheckServerConfigGuidance({
  setupEnvResolution = {},
  ready = false,
  status = "blocked",
} = {}) {
  return {
    label: setupEnvResolution.ready === true ? "复用 production env setup 安全 env 文件" : "production env setup 安全 env 文件待就绪",
    status: cleanServerText(status) || "blocked",
    ready: ready === true,
    envFileSource: "production-env-setup-latest",
    intakeCsvSource: "production-env-setup-real-value-intake-csv",
    primaryInput: "production env setup latest 安全 env 文件",
    acceptsFrontendPath: false,
    pathValueExposed: false,
    restartRequired: false,
    setupReportAvailable: setupEnvResolution.setupReportAvailable === true,
    setupReady: setupEnvResolution.setupReady === true,
    envFileCount: normalizeV1NonNegativeInteger(setupEnvResolution.envFileCount),
    steps: [
      "先用 production env setup 生成安全未跟踪、0600 权限的生产 env 文件和真实值 intake CSV。",
      "把真实 PostgreSQL、对象存储、打印、readiness 变量填入安全 env 文件，或先用真实值片段 dry-run / 正式合并。",
      "点击重新校验真实值，系统只复用服务端 setup 安全 env 文件和固定 intake CSV，不接收浏览器路径或 env 值。",
      "本入口只读校验，不写 env 文件、不运行迁移、不刷新 release candidate / go-live suite。",
    ],
    verificationActions: [
      "node scripts/run-v1-production-env-intake-verify.mjs --env-file <secure-env-file> --intake-csv <production-env-intake-csv> --json",
      "POST /api/system/v1-production-env-intake/live-precheck",
    ],
    safeguards: {
      frontendPathAccepted: false,
      envFilePathValueIncluded: false,
      intakeCsvPathValueIncluded: false,
      sourceNamesOnly: true,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      productionEnvFileMutated: false,
      schemaMigrationApplyExecuted: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
  };
}

function buildV1ProductionGoLivePrecheckBody({
  report,
  operatorId,
  checkedAt,
  configuredEnvFileCount,
  envFileConfig = {},
}) {
  const source = isPlainServerObject(report) ? report : {};
  const stages = Array.isArray(source.stages) ? source.stages.map(sanitizeV1ProductionGoLiveStage).filter(Boolean) : [];
  const blockingStages = stages.filter((item) => item.status !== "passed");
  const fixChecklist = Array.isArray(source.fixChecklist)
    ? source.fixChecklist.map(sanitizeV1ProductionEnvFixItem).filter(Boolean)
    : [];
  const unblockChecklist = Array.isArray(source.unblockChecklist)
    ? source.unblockChecklist.map(sanitizeV1ProductionGoLiveUnblockItem).filter(Boolean)
    : [];
  const fieldEvidenceCoverage = sanitizeV1ProductionGoLiveFieldEvidenceCoverage(source.fieldEvidenceCoverage);
  const passedCount = toNonNegativeInteger(source.summary?.passedCount || stages.filter((item) => item.ready).length);
  const totalCount = toNonNegativeInteger(source.summary?.totalCount || stages.length);
  const blockingCount = toNonNegativeInteger(source.summary?.blockingCount || blockingStages.length);
  const warningCount = toNonNegativeInteger(source.summary?.warningCount);
  const ready = source.ready === true && blockingStages.length === 0;
  const sourceStatuses = sanitizeV1ProductionEnvFileConfigSourceStatuses(envFileConfig);
  return {
    version: "p0-v1-production-go-live-live-precheck-v1",
    scope: "v1_production_go_live_live_precheck",
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt: cleanServerText(source.checkedAt) || checkedAt || new Date().toISOString(),
    operatorId,
    summary: {
      label: ready ? "生产上线组合预检通过" : "生产上线组合预检仍未通过",
      readinessLabel: `${passedCount}/${totalCount}`,
      passedCount,
      totalCount,
      blockingCount,
      warningCount,
      blockerCount: blockingStages.length,
      blockerLabel: `${blockingStages.length} 项`,
      stageLabel: `${passedCount}/${totalCount}`,
      envFileCount: toNonNegativeInteger(source.envFileCount),
      configuredEnvFileCount: toNonNegativeInteger(configuredEnvFileCount),
      sourceStatuses,
      currentRuntime: true,
      requestBodyIgnored: true,
      envFilePathAccepted: false,
      productionEnvAppliedToProcess: source.safeguards?.productionEnvAppliedToProcess === true,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      physicalPrinterCalled: Boolean(source.safeguards?.physicalPrinterCalled),
    },
    stages,
    blockingStages,
    fixChecklist,
    unblockChecklist,
    fieldEvidenceCoverage,
    runtimeReadiness: sanitizeV1ProductionGoLiveRuntimeReadiness(source.runtimeReadiness),
    nextActions: sanitizeStringList(source.nextActions).slice(0, 10),
    nextAction:
      sanitizeStringList(source.nextActions)[0] ||
      (ready
        ? "保存本预检结果，继续生成 release candidate 并完成现场证据 / 签字 / V1-V2 边界确认。"
        : "先处理生产上线组合预检阻塞，再继续 release candidate。"),
    safeguards: {
      ...sanitizeV1ProductionGoLiveSafeguards(source.safeguards),
      nonMutating: true,
      currentRuntime: true,
      requestBodyIgnored: true,
      envFilePathAccepted: false,
      envFileReadByRequest: false,
      envFilePathExposed: false,
      rawProductionGoLivePrecheckIncluded: false,
      rawProductionEnvPreflightIncluded: false,
      rawRuntimeReadinessReportIncluded: false,
      rawEnvFileAuditIncluded: false,
      rawEnvFileIncluded: false,
      environmentValuesIncluded: false,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      localPathExposed: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
  };
}

function buildV1ProductionGoLivePrecheckErrorBody({ operatorId, checkedAt, configuredEnvFileCount, envFileConfig = {} }) {
  const sourceStatuses = sanitizeV1ProductionEnvFileConfigSourceStatuses(envFileConfig);
  return {
    version: "p0-v1-production-go-live-live-precheck-v1",
    scope: "v1_production_go_live_live_precheck",
    status: "error",
    ready: false,
    checkedAt,
    operatorId,
    summary: {
      label: "生产上线组合预检失败",
      readinessLabel: "0/5",
      passedCount: 0,
      totalCount: 5,
      blockingCount: 1,
      warningCount: 0,
      blockerCount: 1,
      blockerLabel: "1 项",
      stageLabel: "0/5",
      envFileCount: toNonNegativeInteger(configuredEnvFileCount),
      configuredEnvFileCount: toNonNegativeInteger(configuredEnvFileCount),
      sourceStatuses,
      currentRuntime: true,
      requestBodyIgnored: true,
      envFilePathAccepted: false,
      productionEnvAppliedToProcess: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      physicalPrinterCalled: false,
    },
    stages: [],
    blockingStages: [],
    fixChecklist: [],
    unblockChecklist: [],
    fieldEvidenceCoverage: sanitizeV1ProductionGoLiveFieldEvidenceCoverage(),
    runtimeReadiness: null,
    nextActions: ["检查服务端 env 文件配置、当前 API readiness 端点和生产组合预检脚本后重试。"],
    nextAction: "检查服务端 env 文件配置、当前 API readiness 端点和生产组合预检脚本后重试。",
    error: {
      code: "V1_PRODUCTION_GO_LIVE_LIVE_PRECHECK_FAILED",
      message: "生产上线组合预检失败。",
    },
    safeguards: {
      nonMutating: true,
      currentRuntime: true,
      requestBodyIgnored: true,
      envFilePathAccepted: false,
      envFileReadByRequest: false,
      envFilePathExposed: false,
      rawProductionGoLivePrecheckIncluded: false,
      rawProductionEnvPreflightIncluded: false,
      rawRuntimeReadinessReportIncluded: false,
      rawEnvFileAuditIncluded: false,
      rawEnvFileIncluded: false,
      environmentValuesIncluded: false,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      localPathExposed: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      physicalPrinterCalled: false,
    },
  };
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

function sanitizeV1ProductionEnvValuesApplyReport(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const validScope = cleanServerText(source.scope) === "v1_production_env_real_value_intake_apply";
  const summary = isPlainServerObject(source.summary) ? source.summary : {};
  const sourceEnvFile = isPlainServerObject(source.sourceEnvFile) ? source.sourceEnvFile : {};
  const targetEnvFile = isPlainServerObject(source.targetEnvFile) ? source.targetEnvFile : {};
  const intakeCsv = isPlainServerObject(source.intakeCsv) ? source.intakeCsv : {};
  const blockingFindings = Array.isArray(source.blockingFindings)
    ? source.blockingFindings.map(sanitizeV1ProductionEnvValuesApplyFinding).filter(Boolean)
    : [];
  const warningFindings = Array.isArray(source.warningFindings)
    ? source.warningFindings.map(sanitizeV1ProductionEnvValuesApplyFinding).filter(Boolean)
    : [];
  const appliedVariables = sanitizeV1EnvVariableKeyList(source.appliedVariables);
  return {
    status: validScope ? cleanServerText(source.status) || "blocked" : "missing",
    ready: validScope && source.ready === true,
    checkedAt: cleanServerText(source.checkedAt),
    dryRun: source.dryRun === true,
    summary: {
      label: cleanServerText(summary.label),
      sourceAssignmentCount: normalizeV1NonNegativeInteger(summary.sourceAssignmentCount),
      allowedVariableCount: normalizeV1NonNegativeInteger(summary.allowedVariableCount),
      applicableValueCount: normalizeV1NonNegativeInteger(summary.applicableValueCount),
      blankSourceValueCount: normalizeV1NonNegativeInteger(summary.blankSourceValueCount),
      unknownSourceVariableCount: normalizeV1NonNegativeInteger(summary.unknownSourceVariableCount),
      appliedVariableCount: normalizeV1NonNegativeInteger(summary.appliedVariableCount, appliedVariables.length),
      targetChanged: summary.targetChanged === true,
      targetMode: cleanServerText(summary.targetMode),
      setupReady: summary.setupReady === true,
      envPreflightReady: summary.envPreflightReady === true,
      envPreflightPassedCount: normalizeV1NonNegativeInteger(summary.envPreflightPassedCount),
      envPreflightTotalCount: normalizeV1NonNegativeInteger(summary.envPreflightTotalCount),
      intakeVerificationReady: summary.intakeVerificationReady === true,
      intakeVerificationBlockingCount: normalizeV1NonNegativeInteger(summary.intakeVerificationBlockingCount),
      intakeVerificationWarningCount: normalizeV1NonNegativeInteger(summary.intakeVerificationWarningCount),
      blockingCount: normalizeV1NonNegativeInteger(summary.blockingCount, blockingFindings.length),
      warningCount: normalizeV1NonNegativeInteger(summary.warningCount, warningFindings.length),
    },
    sourceEnvFile: {
      pathIncluded: false,
      exists: sourceEnvFile.exists === true,
      auditReady: sourceEnvFile.auditReady === true,
      auditStatus: cleanServerText(sourceEnvFile.auditStatus) || "not_run",
      assignmentCount: normalizeV1NonNegativeInteger(sourceEnvFile.assignmentCount),
      unknownVariableCount: normalizeV1NonNegativeInteger(sourceEnvFile.unknownVariableCount),
      blankValueCount: normalizeV1NonNegativeInteger(sourceEnvFile.blankValueCount),
    },
    targetEnvFile: {
      pathIncluded: false,
      exists: targetEnvFile.exists === true,
      auditReadyBefore: targetEnvFile.auditReadyBefore === true,
      auditStatusBefore: cleanServerText(targetEnvFile.auditStatusBefore) || "not_run",
      applied: targetEnvFile.applied === true,
      changed: targetEnvFile.changed === true,
      fileMode: cleanServerText(targetEnvFile.fileMode),
    },
    intakeCsv: {
      pathIncluded: false,
      ready: intakeCsv.ready === true,
      rowCount: normalizeV1NonNegativeInteger(intakeCsv.rowCount),
      allowedVariableCount: normalizeV1NonNegativeInteger(intakeCsv.allowedVariableCount),
      missingHeaderCount: normalizeV1NonNegativeInteger(intakeCsv.missingHeaderCount),
      missingHeaders: sanitizeStringList(intakeCsv.missingHeaders).slice(0, 8),
    },
    appliedVariables,
    skippedVariables: {
      blankSourceVariables: sanitizeV1EnvVariableKeyList(source.skippedVariables?.blankSourceVariables),
      unknownSourceVariables: sanitizeV1EnvVariableKeyList(source.skippedVariables?.unknownSourceVariables),
      safeLiteralMismatches: sanitizeV1EnvVariableKeyList(source.skippedVariables?.safeLiteralMismatches),
    },
    alternativeGroups: Array.isArray(source.alternativeGroups)
      ? source.alternativeGroups.map(sanitizeV1ProductionEnvValuesApplyAlternativeGroup).filter(Boolean).slice(0, 8)
      : [],
    setupRefresh: sanitizeV1ProductionEnvValuesApplySetupRefresh(source.setupRefresh),
    intakeVerification: sanitizeV1ProductionEnvValuesApplyIntakeVerification(source.intakeVerification),
    blockingFindings,
    warningFindings,
    nextActions: sanitizeStringList(source.nextActions).slice(0, 8),
    safeguards: {
      envValuesExposed: false,
      envFilePathIncluded: false,
      sourceEnvFilePathIncluded: false,
      targetEnvFilePathIncluded: false,
      intakeCsvPathIncluded: false,
      connectionStringExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      spoolPathExposed: false,
      tokenIncluded: false,
      rawEnvLineIncluded: false,
      onlyIntakeVariablesApplied: source.safeguards?.onlyIntakeVariablesApplied !== false,
      targetFileMode0600: source.safeguards?.targetFileMode0600 !== false,
    },
  };
}

function sanitizeV1ProductionEnvValuesApplyFinding(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const label = cleanServerText(source.label);
  const key = cleanServerText(source.key);
  if (!label && !key) return null;
  return {
    key,
    label: label || key,
    severity: cleanServerText(source.severity) || "blocking",
    status: cleanServerText(source.status) || (source.severity === "warning" ? "warning" : "blocked"),
    detail: sanitizeV1RoleTaskActionText(source.detail),
    nextAction: sanitizeV1RoleTaskActionText(source.nextAction),
    variables: sanitizeV1EnvVariableKeyList(source.variables).slice(0, 8),
  };
}

function sanitizeV1ProductionEnvValuesApplyAlternativeGroup(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const groupKey = cleanServerText(source.groupKey);
  if (!groupKey) return null;
  return {
    groupKey,
    variableCount: normalizeV1NonNegativeInteger(source.variableCount),
    configuredKeyCount: normalizeV1NonNegativeInteger(source.configuredKeyCount),
    configuredKeys: sanitizeV1EnvVariableKeyList(source.configuredKeys).slice(0, 8),
    status: cleanServerText(source.status),
    severity: cleanServerText(source.severity),
    rawValuesIncluded: false,
  };
}

function sanitizeV1ProductionEnvValuesApplySetupRefresh(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const envPreflight = isPlainServerObject(source.envPreflight) ? source.envPreflight : {};
  return {
    status: cleanServerText(source.status),
    ready: source.ready === true,
    setupReady: source.setupReady === true,
    checkedAt: cleanServerText(source.checkedAt),
    summary: {
      label: cleanServerText(source.summary?.label),
      remainingFixItemCount: normalizeV1NonNegativeInteger(source.summary?.remainingFixItemCount),
    },
    envPreflight: {
      ready: envPreflight.ready === true,
      status: cleanServerText(envPreflight.status),
      passedCount: normalizeV1NonNegativeInteger(envPreflight.passedCount),
      totalCount: normalizeV1NonNegativeInteger(envPreflight.totalCount),
      blockingCount: normalizeV1NonNegativeInteger(envPreflight.blockingCount),
      warningCount: normalizeV1NonNegativeInteger(envPreflight.warningCount),
      firstRemainingFixItems: Array.isArray(envPreflight.firstRemainingFixItems)
        ? envPreflight.firstRemainingFixItems.map(sanitizeV1ProductionEnvValuesApplyRemainingFixItem).filter(Boolean).slice(0, 6)
        : [],
    },
    safeguards: {
      envFilePathIncluded: false,
      envValuesExposed: false,
      connectionStringExposed: false,
      secretFieldsExposed: false,
    },
  };
}

function sanitizeV1ProductionEnvValuesApplyRemainingFixItem(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const label = cleanServerText(source.label);
  const key = cleanServerText(source.key);
  if (!label && !key) return null;
  return {
    key,
    label: label || key,
    status: cleanServerText(source.status),
    missingVariables: sanitizeV1EnvVariableKeyList(source.missingVariables).slice(0, 8),
  };
}

function sanitizeV1ProductionEnvValuesApplyIntakeVerification(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  return {
    status: cleanServerText(source.status),
    ready: source.ready === true,
    checkedAt: cleanServerText(source.checkedAt),
    summary: {
      intakeRowCount: normalizeV1NonNegativeInteger(source.summary?.intakeRowCount),
      configuredRowCount: normalizeV1NonNegativeInteger(source.summary?.configuredRowCount),
      missingRowCount: normalizeV1NonNegativeInteger(source.summary?.missingRowCount),
      blockingCount: normalizeV1NonNegativeInteger(source.summary?.blockingCount),
      warningCount: normalizeV1NonNegativeInteger(source.summary?.warningCount),
      alternativeGroupBlockingCount: normalizeV1NonNegativeInteger(source.summary?.alternativeGroupBlockingCount),
    },
    firstBlockingFindings: Array.isArray(source.firstBlockingFindings)
      ? source.firstBlockingFindings.map(sanitizeV1ProductionEnvValuesApplyIntakeFinding).filter(Boolean).slice(0, 6)
      : [],
    safeguards: {
      envFilePathIncluded: false,
      envValuesIncluded: false,
      rawEvidenceRefIncluded: false,
    },
  };
}

function sanitizeV1ProductionEnvValuesApplyIntakeFinding(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const label = cleanServerText(source.label);
  const variableKey = sanitizeV1EnvVariableKey(source.variableKey);
  if (!label && !variableKey) return null;
  return {
    type: cleanServerText(source.type),
    label: label || variableKey,
    variableKey,
    status: cleanServerText(source.status),
    detail: sanitizeV1RoleTaskActionText(source.detail),
    nextAction: sanitizeV1RoleTaskActionText(source.nextAction),
  };
}

function sanitizeV1EnvVariableKeyList(values) {
  return sanitizeStringList(values)
    .map(sanitizeV1EnvVariableKey)
    .filter(Boolean);
}

function sanitizeV1EnvVariableKey(value) {
  const text = cleanServerText(value);
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? text : "";
}

function sanitizeV1ProductionGoLiveStage(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const summary = isPlainServerObject(source.summary) ? source.summary : {};
  const blockingItems = Array.isArray(source.blockingItems)
    ? source.blockingItems.map(sanitizeV1ProductionGoLiveBlockingItem).filter(Boolean)
    : [];
  const checks = Array.isArray(source.checks)
    ? source.checks.map(sanitizeV1ProductionGoLiveBlockingItem).filter(Boolean)
    : [];
  const passedCount = toNonNegativeInteger(summary.passedCount);
  const totalCount = toNonNegativeInteger(summary.totalCount);
  return {
    key: cleanServerText(source.key),
    label: cleanServerText(source.label),
    status: cleanServerText(source.status) || "pending",
    sourceStatus: cleanServerText(source.sourceStatus),
    ready: source.ready === true,
    summary: {
      label: cleanServerText(summary.label) || (totalCount ? `${passedCount}/${totalCount} 通过` : ""),
      passedCount,
      totalCount,
      blockingCount: toNonNegativeInteger(summary.blockingCount || blockingItems.length),
      warningCount: toNonNegativeInteger(summary.warningCount),
    },
    blockingItems,
    checks,
    nextActions: sanitizeStringList(source.nextActions).slice(0, 8),
  };
}

function sanitizeV1ProductionGoLiveBlockingItem(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  return {
    key: cleanServerText(source.key),
    label: cleanServerText(source.label),
    status: cleanServerText(source.status || "unknown"),
    blocking: source.blocking !== false,
    detail: cleanServerText(source.detail || source.nextAction || source.message),
  };
}

function sanitizeV1ProductionGoLiveUnblockItem(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const label = cleanServerText(source.label);
  if (!label) return null;
  const blockers = Array.isArray(source.blockers)
    ? source.blockers.map(sanitizeV1ProductionGoLiveBlockingItem).filter(Boolean)
    : [];
  const fixItems = Array.isArray(source.fixItems)
    ? source.fixItems.map(sanitizeV1ProductionEnvFixItem).filter(Boolean)
    : [];
  return {
    key: cleanServerText(source.key),
    label,
    stageOrder: normalizeV1NonNegativeInteger(source.stageOrder),
    status: cleanServerText(source.status) || "pending",
    ready: source.ready === true,
    ownerRole: cleanServerText(source.ownerRole) || "技术/管理",
    blockingCount: normalizeV1NonNegativeInteger(source.blockingCount, blockers.length),
    nextAction: cleanServerText(source.nextAction),
    verificationSteps: sanitizeStringList(source.verificationSteps).slice(0, 5),
    evidenceToKeep: sanitizeStringList(source.evidenceToKeep).slice(0, 5),
    blockers,
    fixItems,
  };
}

function sanitizeV1ProductionGoLiveFieldEvidenceCoverage(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const items = Array.isArray(source.items)
    ? source.items.map(sanitizeV1ProductionGoLiveFieldEvidenceCoverageItem).filter(Boolean)
    : [];
  const reportSupportedCount = normalizeV1NonNegativeInteger(
    source.summary?.reportSupportedCount,
    items.filter((item) => item.status === "report_supported").length,
  );
  const totalCount = normalizeV1NonNegativeInteger(source.summary?.totalCount, items.length);
  const needsOnsiteRefCount = normalizeV1NonNegativeInteger(
    source.summary?.needsOnsiteRefCount,
    items.filter((item) => item.status === "needs_onsite_ref").length,
  );
  const waitingForStageCount = normalizeV1NonNegativeInteger(
    source.summary?.waitingForStageCount,
    items.filter((item) => item.status === "waiting_for_stage").length,
  );
  const onsiteRequiredCount = normalizeV1NonNegativeInteger(
    source.summary?.onsiteRequiredCount,
    items.filter((item) => item.status === "onsite_required").length,
  );
  return {
    summary: {
      label:
        cleanServerText(source.summary?.label) ||
        `${reportSupportedCount}/${totalCount} 可由本报告直接支持`,
      reportSupportedCount,
      needsOnsiteRefCount,
      waitingForStageCount,
      onsiteRequiredCount,
      totalCount,
      reportSupportedLabel:
        cleanServerText(source.summary?.reportSupportedLabel) || `${reportSupportedCount}/${totalCount}`,
      stillNeedsFieldEvidenceCount: normalizeV1NonNegativeInteger(
        source.summary?.stillNeedsFieldEvidenceCount,
        Math.max(0, totalCount - reportSupportedCount),
      ),
      nextAction:
        cleanServerText(source.summary?.nextAction) ||
        "先补等待阶段项；对只需现场引用或现场单独证明的项，回填证据编号后再刷新 go-live suite。",
    },
    items,
  };
}

function sanitizeV1ProductionGoLiveFieldEvidenceCoverageItem(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const itemLabel = cleanServerText(source.itemLabel);
  if (!itemLabel) return null;
  return {
    groupKey: cleanServerText(source.groupKey),
    groupLabel: cleanServerText(source.groupLabel),
    itemKey: cleanServerText(source.itemKey),
    itemLabel,
    status: cleanServerText(source.status) || "waiting_for_stage",
    statusLabel: cleanServerText(source.statusLabel) || "待处理",
    ready: source.ready === true,
    supportingStageKey: cleanServerText(source.supportingStageKey),
    supportingStageLabel: cleanServerText(source.supportingStageLabel),
    nextAction: cleanServerText(source.nextAction),
  };
}

function sanitizeV1ProductionGoLiveRuntimeReadiness(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  if (!source.status && source.ready !== true) return null;
  return {
    status: cleanServerText(source.status || "unknown"),
    ready: source.ready === true,
    summary: {
      label: cleanServerText(source.summary?.label),
      passedCount: toNonNegativeInteger(source.summary?.passedCount),
      totalCount: toNonNegativeInteger(source.summary?.totalCount),
      blockingCount: toNonNegativeInteger(source.summary?.blockingCount),
    },
    systemPersistence: {
      status: cleanServerText(source.systemPersistence?.status || "unknown"),
      ready: source.systemPersistence?.ready === true,
      localRepositoryCount: toNonNegativeInteger(source.systemPersistence?.localRepositoryCount),
      localMemoryCount: toNonNegativeInteger(source.systemPersistence?.localMemoryCount),
      localPersistenceAcceptedForV1: source.systemPersistence?.localPersistenceAcceptedForV1 === true,
    },
    attachmentReadiness: {
      status: cleanServerText(source.attachmentReadiness?.status || "unknown"),
      ready: source.attachmentReadiness?.ready === true,
      storageKind: cleanServerText(source.attachmentReadiness?.storageMode?.storageKind),
      storageProvider: cleanServerText(source.attachmentReadiness?.storageMode?.storageProvider),
      objectStorageLive: source.attachmentReadiness?.storageMode?.objectStorageLive === true,
      localFsAcceptedForV1: source.attachmentReadiness?.storageMode?.localFsAcceptedForV1 === true,
    },
    productionEnvFileApplication: sanitizeV1ProductionEnvFileApplication(source.productionEnvFileApplication),
    remainingV1Risks: sanitizeStringList(source.remainingV1Risks).slice(0, 8),
  };
}

function sanitizeV1ProductionEnvFileApplication(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  return {
    status: cleanServerText(source.status || "unknown"),
    ready: source.ready === true,
    applied: source.applied === true,
    selectedSourceKind: cleanServerText(source.selectedSourceKind || "none"),
    configuredEnvFileCount: normalizeV1NonNegativeInteger(source.configuredEnvFileCount),
    auditReady: source.auditReady === true,
    auditStatus: cleanServerText(source.auditStatus || "unknown"),
    auditBlockingCount: normalizeV1NonNegativeInteger(source.auditBlockingCount),
    auditWarningCount: normalizeV1NonNegativeInteger(source.auditWarningCount),
    assignmentCount: normalizeV1NonNegativeInteger(source.assignmentCount),
  };
}

function sanitizeV1ProductionGoLiveSafeguards(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  return {
    nonMutating: source.nonMutating !== false,
    envValuesExposed: false,
    rawEnvFileContentExposed: false,
    connectionStringExposed: false,
    objectStorageEndpointExposed: false,
    objectStorageBucketExposed: false,
    secretFieldsExposed: false,
    commandValueExposed: false,
    commandArgsExposed: false,
    spoolPathExposed: false,
    localPathExposed: false,
    productionEnvAppliedToProcess: source.productionEnvAppliedToProcess === true,
    releaseCandidateRefreshed: source.releaseCandidateRefreshed === true,
    goLiveSuiteRefreshed: source.goLiveSuiteRefreshed === true,
    physicalPrinterCalled: source.physicalPrinterCalled === true,
    driverReadOnly: source.driverReadOnly !== false,
    readinessRunnerReadOnly: source.readinessRunnerReadOnly !== false,
  };
}

const V1_PRODUCTION_ENV_FILE_AUDIT_CONFIG_SOURCES = [
  {
    envVariable: "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS",
    kind: "primary",
    label: "只读审计变量",
  },
  {
    envVariable: "ERP_V1_PRODUCTION_ENV_FILE",
    kind: "fallback",
    label: "API 启动应用变量",
  },
  {
    envVariable: "ERP_V1_ENV_FILE",
    kind: "fallback",
    label: "fallback 应用变量",
  },
];

const V1_PRODUCTION_ENV_FILE_APPLICATION_CONFIG_SOURCES = [
  {
    envVariable: "ERP_V1_PRODUCTION_ENV_FILE",
    kind: "primary",
    label: "API 启动应用变量",
  },
  {
    envVariable: "ERP_V1_ENV_FILE",
    kind: "fallback",
    label: "fallback 应用变量",
  },
  {
    envVariable: "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS",
    kind: "audit_only",
    label: "只读审计 / 预览变量",
  },
];

const V1_PRODUCTION_ENV_VALUES_FILE_CONFIG_SOURCES = [
  {
    envVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FILE",
    kind: "primary",
    label: "真实值片段变量",
  },
  {
    envVariable: "ERP_V1_PRODUCTION_ENV_MINIMUM_VALUES_FILE",
    kind: "fallback",
    label: "最小阻塞补值片段变量",
  },
  {
    envVariable: "ERP_V1_PRODUCTION_ENV_VALUES_FRAGMENT_FILE",
    kind: "fallback",
    label: "兼容真实值片段变量",
  },
];

const V1_PRODUCTION_ENV_SETUP_JSON_PATH = ".erp-local-storage/v1-production-env-setup/latest.json";
const V1_PRODUCTION_ENV_INTAKE_CSV_PATH =
  ".erp-local-storage/v1-production-env-setup/production-env-real-value-intake.csv";

function parseV1ProductionEnvAuditFileList(raw) {
  return String(raw || "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getConfiguredV1ProductionEnvAuditFileConfig() {
  return buildConfiguredV1ProductionEnvFileConfig(V1_PRODUCTION_ENV_FILE_AUDIT_CONFIG_SOURCES);
}

function getConfiguredV1ProductionEnvApplicationFileConfig({ allowAuditOnlyFallback = false } = {}) {
  const sources = V1_PRODUCTION_ENV_FILE_APPLICATION_CONFIG_SOURCES.map((source) =>
    source.kind === "audit_only"
      ? {
          ...source,
          selectable: allowAuditOnlyFallback,
          label: allowAuditOnlyFallback ? "只读审计 / 预览变量" : "只读审计变量（go-live 不使用）",
        }
      : source,
  );
  return buildConfiguredV1ProductionEnvFileConfig(sources);
}

function getConfiguredV1ProductionEnvValuesFileConfig() {
  return buildConfiguredV1ProductionEnvFileConfig(V1_PRODUCTION_ENV_VALUES_FILE_CONFIG_SOURCES);
}

function resolveV1ProductionEnvSetupSafeEnvFileForIntakeLivePrecheck() {
  const setupJsonPath = resolve(V1_PRODUCTION_ENV_SETUP_JSON_PATH);
  if (!existsSync(setupJsonPath)) {
    return {
      status: "not_configured",
      ready: false,
      setupReportAvailable: false,
      setupReady: false,
      envFileCount: 0,
      envFiles: [],
      blockingItems: [
        {
          key: "production-env-setup-latest-missing",
          label: "production env setup 报告未生成",
          status: "blocked",
          detail: "未找到 production env setup latest 报告，无法安全定位生产 env 文件。",
          nextAction: "先运行生产 env setup，生成安全未跟踪 env 文件和 latest 报告后，再重新校验真实值。",
        },
      ],
      nextAction: "先生成 production env setup latest，再重新执行真实值校验。",
    };
  }

  let setup = null;
  try {
    setup = JSON.parse(readFileSync(setupJsonPath, "utf8"));
  } catch {
    return {
      status: "blocked",
      ready: false,
      setupReportAvailable: true,
      setupReady: false,
      envFileCount: 0,
      envFiles: [],
      blockingItems: [
        {
          key: "production-env-setup-latest-unreadable",
          label: "production env setup 报告不可读",
          status: "blocked",
          detail: "production env setup latest 不是有效 JSON，无法安全定位生产 env 文件。",
          nextAction: "重新运行 production env setup，生成脱敏 latest 报告后再重试。",
        },
      ],
      nextAction: "重新生成 production env setup latest 后重试。",
    };
  }

  const blockingItems = [];
  if (setup?.scope !== "v1_production_env_setup") {
    blockingItems.push({
      key: "production-env-setup-latest-shape",
      label: "production env setup 报告形状不正确",
      status: "blocked",
      detail: "latest 报告 scope 不是 v1_production_env_setup，不能复用其中的 env 文件。",
      nextAction: "重新运行 production env setup，确认报告来源正确。",
    });
  }
  const envFilePath = cleanServerText(setup?.envFile?.path);
  if (!envFilePath) {
    blockingItems.push({
      key: "production-env-setup-env-file-missing",
      label: "setup 报告没有安全 env 文件",
      status: "blocked",
      detail: "production env setup latest 未记录 envFile.path，不能执行真实值 intake 校验。",
      nextAction: "重新运行 production env setup，生成安全未跟踪 env 文件。",
    });
  }
  if (setup?.setupReady !== true) {
    blockingItems.push({
      key: "production-env-setup-not-ready",
      label: "production env setup 未 ready",
      status: "blocked",
      detail: "setupReady 不是 true，不能复用该 env 文件做真实值校验。",
      nextAction: "按 setup 报告阻塞项修正后重新运行 setup，再重试真实值校验。",
    });
  }
  if (setup?.envFile?.gitIgnored !== true || setup?.envFile?.gitTracked === true) {
    blockingItems.push({
      key: "production-env-setup-env-file-git-safety",
      label: "setup env 文件未确认 git 安全",
      status: "blocked",
      detail: "setup 报告未确认 env 文件已 git ignore 且未被 git 跟踪。",
      nextAction: "把真实 env 文件放在安全未跟踪位置，确认 git ignore 后重新运行 setup。",
    });
  }
  if (setup?.envFile?.fileMode && setup.envFile.fileMode !== "600") {
    blockingItems.push({
      key: "production-env-setup-env-file-mode",
      label: "setup env 文件权限不符合要求",
      status: "blocked",
      detail: "setup 报告显示 env 文件权限不是 600，不能在页面入口复用。",
      nextAction: "把安全 env 文件权限收窄到 600，重新运行 setup 后重试。",
    });
  }
  const resolvedEnvFilePath = envFilePath ? resolve(envFilePath) : "";
  if (envFilePath && !existsSync(resolvedEnvFilePath)) {
    blockingItems.push({
      key: "production-env-setup-env-file-not-found",
      label: "setup env 文件不存在",
      status: "blocked",
      detail: "setup 报告引用的安全 env 文件当前不存在。",
      nextAction: "恢复或重新生成安全 env 文件，再运行 setup 和真实值校验。",
    });
  }

  if (blockingItems.length) {
    return {
      status: "blocked",
      ready: false,
      setupReportAvailable: true,
      setupReady: setup?.setupReady === true,
      envFileCount: 0,
      envFiles: [],
      blockingItems,
      nextAction: blockingItems[0]?.nextAction || "修正 production env setup 后重试。",
    };
  }

  return {
    status: "configured",
    ready: true,
    setupReportAvailable: true,
    setupReady: true,
    envFileCount: 1,
    envFiles: [resolvedEnvFilePath],
    blockingItems: [],
    nextAction: "已复用 production env setup 安全 env 文件，可执行真实值 intake 校验。",
  };
}

function isV1ProductionEnvValuesApplyEnabled() {
  const value = cleanServerText(process.env.ERP_V1_PRODUCTION_ENV_VALUES_APPLY_ENABLED).toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

function buildConfiguredV1ProductionEnvFileConfig(configSources) {
  const sources = Array.isArray(configSources) ? configSources : [];
  const sourceStatuses = sources.map((source, index) => {
    const raw = process.env[source.envVariable];
    const envFiles = parseV1ProductionEnvAuditFileList(raw);
    return {
      envVariable: source.envVariable,
      kind: source.kind,
      label: source.label,
      selectable: source.selectable !== false,
      order: index + 1,
      configured: envFiles.length > 0,
      envFileCount: envFiles.length,
    };
  });
  const selected = sourceStatuses.find((item) => item.configured && item.selectable !== false) || null;
  const selectedSource = selected
    ? sources.find((item) => item.envVariable === selected.envVariable)
    : null;
  const envFiles = selected ? parseV1ProductionEnvAuditFileList(process.env[selected.envVariable]) : [];
  return {
    envFiles,
    sources: sourceStatuses.map((item) => ({
      ...item,
      selected: selected?.envVariable === item.envVariable,
      ignored: item.configured && selected?.envVariable !== item.envVariable,
    })),
    primaryEnvVariable: sources[0]?.envVariable || "",
    fallbackEnvVariables: sources.slice(1).filter((item) => item.kind !== "audit_only").map((item) => item.envVariable),
    auditOnlyEnvVariables: sources.filter((item) => item.kind === "audit_only").map((item) => item.envVariable),
    selectedEnvVariable: selected?.envVariable || "",
    selectedEnvVariableLabel: selectedSource?.label || "未配置",
    selectedSourceKind: selectedSource?.kind || "none",
    configuredSourceVariableCount: sourceStatuses.filter((item) => item.configured).length,
    configuredEnvFileCount: envFiles.length,
    fallbackSourceUsed: selectedSource?.kind === "fallback",
    auditOnlySourceUsed: selectedSource?.kind === "audit_only",
    ignoredConfiguredFallbackVariableCount: sourceStatuses.filter(
      (item) => item.configured && item.kind === "fallback" && selected?.envVariable !== item.envVariable,
    ).length,
    ignoredConfiguredAuditOnlyVariableCount: sourceStatuses.filter(
      (item) => item.configured && item.kind === "audit_only" && selected?.envVariable !== item.envVariable,
    ).length,
  };
}

function getConfiguredV1ProductionEnvApplicationFiles() {
  return getConfiguredV1ProductionEnvApplicationFileConfig({ allowAuditOnlyFallback: false }).envFiles;
}

function buildV1ProductionEnvPreviewEnvironment(envFiles) {
  const env = { ...process.env };
  for (const envFile of envFiles) {
    const content = readFileSync(resolve(envFile), "utf8");
    Object.assign(env, parseEnvFile(content));
  }
  return env;
}

function buildV1ProductionEnvPreviewFallbackCheck({
  key,
  label,
  detail,
  nextAction,
  requiredVariables = [],
  missingVariables = [],
}) {
  return {
    key,
    label,
    ownerRole: "技术/管理",
    severity: "blocking",
    status: "blocked",
    ready: false,
    blocking: true,
    configuredVariableCount: 0,
    totalVariableCount: Math.max(requiredVariables.length, 1),
    requiredVariables,
    recommendedVariables: [],
    missingVariables,
    placeholderVariables: [],
    detail,
    nextAction,
  };
}

function buildV1ProductionEnvFilePreviewStageDiagnosis({
  status,
  ready,
  sanitizedAudit = null,
  productionEnvGate = null,
  envFilePathConfigured,
  appliedInMemory,
  processEnvMutated: _processEnvMutated,
  nextAction,
  envFileConfig = null,
}) {
  const configSource = isPlainServerObject(envFileConfig) ? envFileConfig : {};
  const selectedEnvVariable = cleanServerText(configSource.selectedEnvVariable);
  const selectedEnvVariableLabel = cleanServerText(configSource.selectedEnvVariableLabel) || "未配置";
  const selectedSourceKind = cleanServerText(configSource.selectedSourceKind) || "none";
  const fallbackSourceUsed = configSource.fallbackSourceUsed === true;
  const configuredSourceVariableCount = normalizeV1NonNegativeInteger(configSource.configuredSourceVariableCount);
  const ignoredConfiguredFallbackVariableCount = normalizeV1NonNegativeInteger(
    configSource.ignoredConfiguredFallbackVariableCount,
  );
  const ignoredConfiguredAuditOnlyVariableCount = normalizeV1NonNegativeInteger(
    configSource.ignoredConfiguredAuditOnlyVariableCount,
  );
  const sourceStatuses = sanitizeV1ProductionEnvFileConfigSourceStatuses(configSource);
  const sourceDiagnosis = {
    selectedEnvVariable,
    selectedEnvVariableLabel,
    selectedSourceKind,
    fallbackSourceUsed,
    auditOnlySourceUsed: configSource.auditOnlySourceUsed === true,
    configuredSourceVariableCount,
    ignoredConfiguredFallbackVariableCount,
    ignoredConfiguredAuditOnlyVariableCount,
    sourceStatuses,
    pathValueExposed: false,
  };
  const envPreflightReady = productionEnvGate?.ready === true;
  if (status === "not_configured") {
    return {
      currentStage: "server_env_file_path",
      currentStageLabel: "服务端路径配置",
      stageStatus: "not_configured",
      stageStatusLabel: "未配置",
      nextStage: "env_file_audit",
      nextStageLabel: "env 文件安全审计",
      auditReady: false,
      envPreflightReady: false,
      envFilePathConfigured: false,
      appliedInMemory: false,
      processEnvMutated: false,
      ...sourceDiagnosis,
      detail: "API 进程未配置服务端安全 env 文件路径，系统没有读取任何 env 文件。",
      nextAction: nextAction || "先在服务端配置安全未跟踪 env 文件路径，再执行文件应用预检。",
    };
  }
  if (status === "audit_blocked") {
    return {
      currentStage: "env_file_audit",
      currentStageLabel: "env 文件安全审计",
      stageStatus: "audit_blocked",
      stageStatusLabel: "审计阻塞",
      nextStage: "env_preflight",
      nextStageLabel: "生产 env 变量预检",
      auditReady: false,
      envPreflightReady: false,
      envFilePathConfigured: envFilePathConfigured === true,
      appliedInMemory: false,
      processEnvMutated: false,
      ...sourceDiagnosis,
      detail: "服务端 env 文件路径已配置，但安全审计未通过，系统没有继续读取变量做应用预检。",
      nextAction: nextAction || "先修正 env 文件审计阻塞，再重新执行文件应用预检。",
    };
  }
  if (status === "error") {
    return {
      currentStage: "env_file_preview",
      currentStageLabel: "env 文件应用预检",
      stageStatus: "error",
      stageStatusLabel: "预检失败",
      nextStage: "retry_env_file_preview",
      nextStageLabel: "修正后重试",
      auditReady: sanitizedAudit?.ready === true,
      envPreflightReady: false,
      envFilePathConfigured: envFilePathConfigured === true,
      appliedInMemory: appliedInMemory === true,
      processEnvMutated: false,
      ...sourceDiagnosis,
      detail: "服务端 env 文件缺失、不可读或无法解析为预检环境。",
      nextAction: nextAction || "检查服务端 env 文件路径、权限和 KEY=VALUE 格式后重试。",
    };
  }
  if (ready === true && envPreflightReady) {
    return {
      currentStage: "env_preflight",
      currentStageLabel: "生产 env 变量预检",
      stageStatus: "ready",
      stageStatusLabel: "已通过",
      nextStage: "runtime_readiness",
      nextStageLabel: "运行时 readiness / release candidate",
      auditReady: sanitizedAudit?.ready === true,
      envPreflightReady: true,
      envFilePathConfigured: envFilePathConfigured === true,
      appliedInMemory: appliedInMemory === true,
      processEnvMutated: false,
      ...sourceDiagnosis,
      detail: "env 文件安全审计已通过，文件变量以内存叠加方式通过生产 env 预检。",
      nextAction:
        nextAction ||
        "用同一安全 env 文件启动 API，再跑运行时 readiness、生产 profile 和 release candidate。",
    };
  }
  return {
    currentStage: "env_preflight",
    currentStageLabel: "生产 env 变量预检",
    stageStatus: "env_preflight_blocked",
    stageStatusLabel: "变量预检阻塞",
    nextStage: "fix_production_env_values",
    nextStageLabel: "补齐生产 env 变量",
    auditReady: sanitizedAudit?.ready === true,
    envPreflightReady: false,
    envFilePathConfigured: envFilePathConfigured === true,
    appliedInMemory: appliedInMemory === true,
    processEnvMutated: false,
    ...sourceDiagnosis,
    detail: "env 文件安全审计已通过，系统已用内存叠加方式读取变量，但生产 env 变量预检仍有阻塞。",
    nextAction: nextAction || productionEnvGate?.nextAction || "补齐生产 env 变量后重新执行文件应用预检。",
  };
}

function buildV1ProductionEnvFilePreviewPrecheckBody({
  operatorId,
  checkedAt,
  status,
  ready,
  audit = null,
  productionEnvGate = null,
  configuredEnvFileCount = 0,
  fallbackChecks = [],
  nextAction = "",
  envFileConfig = null,
}) {
  const sanitizedAudit = audit ? sanitizeV1ProductionEnvFileAuditLivePrecheck(audit) : null;
  const checks = productionEnvGate?.checks || fallbackChecks;
  const blockingChecks = productionEnvGate
    ? checks.filter((item) => item.severity === "blocking" && !item.ready)
    : fallbackChecks.filter((item) => item.severity === "blocking" && !item.ready);
  const warningChecks = productionEnvGate
    ? checks.filter((item) => item.severity === "warning" && !item.ready)
    : [];
  const passedCount = productionEnvGate?.summary?.passedCount ?? checks.filter((item) => item.ready).length;
  const totalCount = productionEnvGate?.summary?.totalCount ?? (productionEnvGate ? checks.length : 9);
  const blockingCount = productionEnvGate?.summary?.blockingCount ?? blockingChecks.length;
  const warningCount = productionEnvGate?.summary?.warningCount ?? warningChecks.length;
  const readinessLabel = productionEnvGate?.summary?.readinessLabel || `${passedCount}/${totalCount}`;
  const normalizedConfiguredEnvFileCount = normalizeV1NonNegativeInteger(configuredEnvFileCount);
  const configSource = isPlainServerObject(envFileConfig) ? envFileConfig : {};
  const selectedEnvVariable = cleanServerText(configSource.selectedEnvVariable);
  const selectedEnvVariableLabel = cleanServerText(configSource.selectedEnvVariableLabel) || "未配置";
  const selectedSourceKind = cleanServerText(configSource.selectedSourceKind) || "none";
  const configuredSourceVariableCount = normalizeV1NonNegativeInteger(configSource.configuredSourceVariableCount);
  const ignoredConfiguredFallbackVariableCount = normalizeV1NonNegativeInteger(
    configSource.ignoredConfiguredFallbackVariableCount,
  );
  const ignoredConfiguredAuditOnlyVariableCount = normalizeV1NonNegativeInteger(
    configSource.ignoredConfiguredAuditOnlyVariableCount,
  );
  const sourceStatuses = sanitizeV1ProductionEnvFileConfigSourceStatuses(configSource);
  const envFileAuditReady = sanitizedAudit?.ready === true;
  const appliedInMemory = productionEnvGate !== null;
  const envFilePathConfigured = normalizedConfiguredEnvFileCount > 0;
  const responseReady = ready === true && blockingChecks.length === 0;
  const resolvedNextAction =
    nextAction ||
    productionEnvGate?.nextAction ||
    "先确认服务端 env 文件安全审计通过，再执行文件应用预检。";
  const stageDiagnosis = buildV1ProductionEnvFilePreviewStageDiagnosis({
    status,
    ready: responseReady,
    sanitizedAudit,
    productionEnvGate,
    envFilePathConfigured,
    appliedInMemory,
    processEnvMutated: false,
    nextAction: resolvedNextAction,
    envFileConfig,
  });
  return {
    version: "p0-v1-production-env-file-preview-live-precheck-v1",
    scope: "v1_production_env_file_preview_live_precheck",
    status,
    ready: responseReady,
    checkedAt: productionEnvGate?.checkedAt || sanitizedAudit?.checkedAt || checkedAt,
    operatorId,
    summary: {
      label:
        ready === true
          ? "服务端 env 文件应用预检通过"
          : status === "not_configured"
            ? "服务端 env 文件应用预检未配置"
            : status === "audit_blocked"
              ? "服务端 env 文件安全审计阻塞应用预检"
              : status === "error"
                ? "服务端 env 文件应用预检失败"
                : "服务端 env 文件应用预检仍未通过",
      readinessLabel,
      passedCount,
      totalCount,
      blockingCount,
      warningCount,
      placeholderValueCount: productionEnvGate?.summary?.placeholderValueCount ?? 0,
      envFileCount: normalizedConfiguredEnvFileCount,
      configuredEnvFileCount: normalizedConfiguredEnvFileCount,
      currentRuntime: true,
      envFilePathAccepted: false,
      envFilePathConfigured,
      selectedEnvVariable,
      selectedEnvVariableLabel,
      selectedSourceKind,
      fallbackSourceUsed: configSource.fallbackSourceUsed === true,
      auditOnlySourceUsed: configSource.auditOnlySourceUsed === true,
      configuredSourceVariableCount,
      ignoredConfiguredFallbackVariableCount,
      ignoredConfiguredAuditOnlyVariableCount,
      sourceStatuses,
      appliedInMemory,
      processEnvMutated: false,
      envPreflightReady: productionEnvGate?.ready === true,
      envFileAuditReady,
      envFileAuditStatus: sanitizedAudit?.status || (normalizedConfiguredEnvFileCount > 0 ? "not_run" : "not_configured"),
      envFileAuditStatusLabel: sanitizedAudit?.statusLabel || (normalizedConfiguredEnvFileCount > 0 ? "未执行" : "未配置"),
      envFileAuditBlockingCount: sanitizedAudit?.summary?.blockingCount ?? (status === "not_configured" ? 1 : 0),
      currentStage: stageDiagnosis.currentStage,
      currentStageLabel: stageDiagnosis.currentStageLabel,
      stageStatus: stageDiagnosis.stageStatus,
      stageStatusLabel: stageDiagnosis.stageStatusLabel,
      nextStage: stageDiagnosis.nextStage,
      nextStageLabel: stageDiagnosis.nextStageLabel,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      blockerCount: blockingChecks.length,
      warningCheckCount: warningChecks.length,
    },
    checks,
    blockingChecks,
    warningChecks,
    stageDiagnosis,
    nextActions: productionEnvGate?.nextActions || (nextAction ? [nextAction] : []),
    nextAction: resolvedNextAction,
    safeguards: {
      ...(productionEnvGate?.safeguards || {}),
      nonMutating: true,
      currentRuntime: true,
      requestBodyIgnored: true,
      envFilePathAccepted: false,
      envFileReadByRequest: false,
      envFilePathExposed: false,
      liveProcessEnvChecked: false,
      liveProcessEnvOverlayChecked: appliedInMemory,
      envFileValuesAppliedInMemoryOnly: appliedInMemory,
      processEnvMutated: false,
      rawProductionEnvPreflightIncluded: false,
      rawEnvFileAuditIncluded: false,
      rawEnvFileIncluded: false,
      rawLineContentIncluded: false,
      environmentValuesIncluded: false,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      connectionStringExposed: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
  };
}

function buildV1ProductionEnvFileAuditPrecheckBody({
  operatorId,
  checkedAt,
  status,
  ready,
  audit,
  configuredEnvFileCount,
  envFileConfig = null,
}) {
  const sanitizedAudit = sanitizeV1ProductionEnvFileAuditLivePrecheck(audit);
  const blockingFindings = sanitizedAudit.blockingFindings;
  const warningFindings = sanitizedAudit.warningFindings;
  const configSource = isPlainServerObject(envFileConfig) ? envFileConfig : {};
  const selectedEnvVariable = cleanServerText(configSource.selectedEnvVariable);
  const selectedEnvVariableLabel = cleanServerText(configSource.selectedEnvVariableLabel) || "未配置";
  const selectedSourceKind = cleanServerText(configSource.selectedSourceKind) || "none";
  const configuredSourceVariableCount = normalizeV1NonNegativeInteger(configSource.configuredSourceVariableCount);
  const ignoredConfiguredFallbackVariableCount = normalizeV1NonNegativeInteger(
    configSource.ignoredConfiguredFallbackVariableCount,
  );
  const ignoredConfiguredAuditOnlyVariableCount = normalizeV1NonNegativeInteger(
    configSource.ignoredConfiguredAuditOnlyVariableCount,
  );
  return {
    version: "p0-v1-production-env-file-audit-live-precheck-v1",
    scope: "v1_production_env_file_audit_live_precheck",
    status,
    ready: ready === true && blockingFindings.length === 0,
    checkedAt: sanitizedAudit.checkedAt || checkedAt,
    operatorId,
    summary: {
      label: ready
        ? "服务端 env 文件安全审计通过"
        : status === "not_configured"
          ? "服务端 env 文件审计未配置"
          : "服务端 env 文件安全审计仍未通过",
      auditLabel: sanitizedAudit.summary.label,
      auditStatus: sanitizedAudit.status,
      auditStatusLabel: sanitizedAudit.statusLabel,
      envFileCount: sanitizedAudit.envFileCount,
      configuredEnvFileCount: normalizeV1NonNegativeInteger(configuredEnvFileCount),
      fileCount: sanitizedAudit.summary.fileCount,
      blockingCount: sanitizedAudit.summary.blockingCount,
      blockingLabel: `${sanitizedAudit.summary.blockingCount} 项`,
      warningCount: sanitizedAudit.summary.warningCount,
      warningLabel: `${sanitizedAudit.summary.warningCount} 项`,
      passedCount: sanitizedAudit.summary.passedCount,
      placeholderAssignmentCount: sanitizedAudit.summary.placeholderAssignmentCount,
      uncommentedAssignmentCount: sanitizedAudit.summary.uncommentedAssignmentCount,
      sensitiveVariableNameCount: sanitizedAudit.summary.sensitiveVariableNameCount,
      crossFileDuplicateVariableCount: sanitizedAudit.summary.crossFileDuplicateVariableCount,
      requestBodyIgnored: true,
      envFilePathAccepted: false,
      envFilePathConfigured: normalizeV1NonNegativeInteger(configuredEnvFileCount) > 0,
      selectedEnvVariable,
      selectedEnvVariableLabel,
      selectedSourceKind,
      fallbackSourceUsed: configSource.fallbackSourceUsed === true,
      auditOnlySourceUsed: configSource.auditOnlySourceUsed === true,
      configuredSourceVariableCount,
      ignoredConfiguredFallbackVariableCount,
      ignoredConfiguredAuditOnlyVariableCount,
      currentRuntime: true,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
    files: sanitizedAudit.files,
    blockingFindings,
    warningFindings,
    serverConfigGuidance: buildV1ProductionEnvFileAuditServerConfigGuidance({
      configuredEnvFileCount,
      ready: ready === true && blockingFindings.length === 0,
      status,
      envFileConfig,
    }),
    nextActions: sanitizedAudit.nextActions,
    nextAction:
      sanitizedAudit.nextActions[0] ||
      (ready ? "继续运行生产 env 变量预检和 release candidate 检查。" : "修正 env 文件安全审计阻塞后重试。"),
    safeguards: {
      ...sanitizedAudit.safeguards,
      nonMutating: true,
      currentRuntime: true,
      requestBodyIgnored: true,
      envFilePathAccepted: false,
      envFileReadByRequest: false,
      envFilePathExposed: false,
      envFilePathSetupGuidanceIncluded: true,
      rawEnvFileIncluded: false,
      rawEnvFileAuditIncluded: false,
      rawLineContentIncluded: false,
      commentsCopied: false,
      envValuesIncluded: false,
      secretValuesIncluded: false,
      commandValuesIncluded: false,
      connectionStringExposed: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
  };
}

function buildV1ProductionEnvFileAuditServerConfigGuidance({
  configuredEnvFileCount,
  ready,
  status,
  envFileConfig = null,
} = {}) {
  const configuredCount = normalizeV1NonNegativeInteger(configuredEnvFileCount);
  const configSource = isPlainServerObject(envFileConfig) ? envFileConfig : {};
  const sourceStatuses = sanitizeV1ProductionEnvFileConfigSourceStatuses(configSource);
  const selectedEnvVariable = cleanServerText(configSource.selectedEnvVariable);
  const selectedSourceKind = cleanServerText(configSource.selectedSourceKind) || "none";
  const selectedEnvVariableLabel = cleanServerText(configSource.selectedEnvVariableLabel) || "未配置";
  const configuredSourceVariableCount = normalizeV1NonNegativeInteger(configSource.configuredSourceVariableCount);
  const ignoredConfiguredFallbackVariableCount = normalizeV1NonNegativeInteger(
    configSource.ignoredConfiguredFallbackVariableCount,
  );
  const ignoredConfiguredAuditOnlyVariableCount = normalizeV1NonNegativeInteger(
    configSource.ignoredConfiguredAuditOnlyVariableCount,
  );
  return {
    label: configuredCount > 0 ? "服务端 env 文件路径已配置" : "服务端 env 文件路径待配置",
    status: configuredCount > 0 ? "configured" : "not_configured",
    ready: ready === true,
    primaryEnvVariable: "ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS",
    fallbackEnvVariables: ["ERP_V1_PRODUCTION_ENV_FILE", "ERP_V1_ENV_FILE"],
    selectedEnvVariable,
    selectedEnvVariableLabel,
    selectedSourceKind,
    fallbackSourceUsed: configSource.fallbackSourceUsed === true,
    auditOnlySourceUsed: configSource.auditOnlySourceUsed === true,
    configuredSourceVariableCount,
    ignoredConfiguredFallbackVariableCount,
    ignoredConfiguredAuditOnlyVariableCount,
    sourceStatuses,
    configuredEnvFileCount: configuredCount,
    acceptsFrontendPath: false,
    pathValueExposed: false,
    restartRequired: true,
    currentAuditStatus: cleanServerText(status) || "unknown",
    steps: [
      "从交接包的 production-env-fill-template.env.example 复制到安全、未跟踪的生产 env 文件。",
      "把真实 PostgreSQL、对象存储、打印和验收变量只填入该安全 env 文件。",
      "在 API 进程环境中配置 ERP_V1_PRODUCTION_ENV_FILE_AUDIT_PATHS，指向该安全 env 文件；多个文件用逗号、分号或换行分隔。",
      "重启 API 进程后，在上线状态页重新点击 env 文件审计、文件应用预检和组合预检。",
    ],
    verificationActions: [
      "node scripts/run-v1-production-env-file-audit.mjs --env-file <secure-env-file> --json",
      "node scripts/run-v1-production-env-preflight.mjs --env-file <secure-env-file> --json",
      "POST /api/system/v1-production-env-file-audit/live-precheck",
      "POST /api/system/v1-production-env-file-preview/live-precheck",
      "POST /api/system/v1-production-go-live/live-precheck",
    ],
    safeguards: {
      envFilePathAcceptedFromFrontend: false,
      envFilePathValueIncluded: false,
      sourceVariableNamesOnly: true,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
  };
}

function sanitizeV1ProductionEnvFileConfigSourceStatuses(configSource = {}) {
  return Array.isArray(configSource.sources)
    ? configSource.sources
        .map((item) => ({
          envVariable: cleanServerText(item.envVariable),
          kind: cleanServerText(item.kind) || "fallback",
          label: cleanServerText(item.label) || "变量",
          order: normalizeV1NonNegativeInteger(item.order),
          selectable: item.selectable !== false,
          configured: item.configured === true,
          selected: item.selected === true,
          ignored: item.ignored === true,
          envFileCount: normalizeV1NonNegativeInteger(item.envFileCount),
        }))
        .filter((item) => item.envVariable)
    : [];
}

function sanitizeV1ProductionEnvFileAuditLivePrecheck(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const base = sanitizeV1ProductionEnvFileAudit({ ...source, included: source.included !== false });
  const files = Array.isArray(source.files)
    ? source.files.map((item, index) => sanitizeV1ProductionEnvFileAuditFile(item, index)).filter(Boolean)
    : [];
  const blockingFindings = Array.isArray(source.blockingFindings)
    ? source.blockingFindings.map(sanitizeV1ProductionEnvFileAuditFinding).filter(Boolean)
    : [];
  const warningFindings = Array.isArray(source.warningFindings)
    ? source.warningFindings.map(sanitizeV1ProductionEnvFileAuditFinding).filter(Boolean)
    : [];
  const status = cleanServerText(source.status) || base.status;
  return {
    ...base,
    status,
    statusLabel:
      status === "not_configured"
        ? "未配置"
        : base.ready && blockingFindings.length === 0
          ? "已通过"
          : blockingFindings.length > 0
            ? "阻塞"
            : warningFindings.length > 0
              ? "警告"
              : base.statusLabel,
    checkedAt: cleanServerText(source.checkedAt),
    files,
    blockingFindings,
    warningFindings,
    nextActions: sanitizeStringList(source.nextActions).slice(0, 8),
    safeguards: {
      ...base.safeguards,
      nonMutating: true,
      envValuesIncluded: false,
      envFilePathExposed: false,
      rawEnvFileIncluded: false,
      rawLineContentIncluded: false,
      commentsCopied: false,
    },
  };
}

function sanitizeV1ProductionEnvFileAuditFile(value = {}, index = 0) {
  if (!isPlainServerObject(value)) return null;
  return {
    key: `env-file-${index + 1}`,
    label: `env 文件 ${index + 1}`,
    insideWorkspace: value.insideWorkspace === true,
    outsideWorkspace: value.git?.outsideWorkspace === true,
    gitTracked: value.git?.tracked === true,
    gitIgnored: value.git?.ignored === true,
    fileMode: cleanServerText(value.fileMode),
    uncommentedAssignmentCount: normalizeV1NonNegativeInteger(value.uncommentedAssignmentCount),
    placeholderAssignmentCount: normalizeV1NonNegativeInteger(value.placeholderAssignmentCount),
    duplicateVariableCount: normalizeV1NonNegativeInteger(value.duplicateVariableCount),
    sensitiveVariableNameCount: normalizeV1NonNegativeInteger(value.sensitiveVariableNameCount),
    variableCount: Array.isArray(value.variableNames) ? value.variableNames.length : 0,
  };
}

function sanitizeV1ProductionEnvFileAuditFinding(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const key = cleanServerText(value.key) || "env-file-audit-finding";
  const severity = cleanServerText(value.severity) || (value.status === "passed" ? "ok" : "blocking");
  return {
    key,
    label: cleanServerText(value.label) || key,
    status: cleanServerText(value.status) || (severity === "warning" ? "warning" : severity === "ok" ? "passed" : "blocked"),
    severity,
    detail: cleanServerText(value.detail),
    variables: sanitizeStringList(value.variables).slice(0, 12),
    variableLabel: sanitizeStringList(value.variables).length ? `${sanitizeStringList(value.variables).length} 个变量` : "",
    nextAction: cleanServerText(value.nextAction),
  };
}

function precheckSystemV1Persistence({ workspace, operatorId }) {
  const checkedAt = new Date().toISOString();
  try {
    const readiness = getSystemV1ReadinessResponse({ workspace, operatorId });
    return {
      httpStatus: 200,
      body: sanitizeV1PersistenceLivePrecheck(readiness, { checkedAt, operatorId }),
    };
  } catch (error) {
    return {
      httpStatus: 500,
      body: {
        version: "p0-v1-persistence-live-precheck-v1",
        scope: "v1_persistence_live_precheck",
        status: "error",
        ready: false,
        checkedAt,
        operatorId,
        summary: {
          label: "当前系统 V1 持久化预检失败",
          readinessLabel: "0/7",
          passedCount: 0,
          totalCount: 0,
          blockingCount: 0,
          blockerCount: 0,
          repositoryGroupCount: 0,
          repositoryCount: 0,
          productionReadyRepositoryCount: 0,
          localRepositoryCount: 0,
          localMemoryCount: 0,
          localJsonCount: 0,
          localFsCount: 0,
          currentRuntime: true,
          requestBodyIgnored: true,
          localPersistenceAcceptedForV1: false,
          releaseCandidateRefreshed: false,
          goLiveSuiteRefreshed: false,
        },
        criteria: [],
        blockingCriteria: [],
        repositoryGroups: [],
        nextActions: [],
        nextAction: "检查当前 API workspace 初始化和系统 V1 readiness 是否可用后重试。",
        error: {
          code: "V1_PERSISTENCE_LIVE_PRECHECK_FAILED",
          message: "当前系统 V1 持久化预检失败。",
        },
        safeguards: buildV1PersistenceLivePrecheckSafeguards({ readiness: null }),
      },
    };
  }
}

function sanitizeV1PersistenceLivePrecheck(readiness = {}, { checkedAt, operatorId } = {}) {
  const criteria = Array.isArray(readiness.criteria) ? readiness.criteria.map(sanitizeV1RuntimeCriterion) : [];
  const blockingCriteria = criteria.filter((item) => item.blocking && !item.ready);
  const repositoryGroups = Array.isArray(readiness.repositoryGroups)
    ? readiness.repositoryGroups.map(sanitizeV1PersistenceRepositoryGroup).filter((item) => item.label)
    : [];
  const repositories = repositoryGroups.flatMap((group) => group.repositories);
  const passedCount = toNonNegativeInteger(readiness.summary?.passedCount || criteria.filter((item) => item.ready).length);
  const totalCount = toNonNegativeInteger(readiness.summary?.totalCount || criteria.length);
  const blockingCount = toNonNegativeInteger(readiness.summary?.blockingCount || blockingCriteria.length);
  const productionReadyRepositoryCount = repositories.filter((item) => item.productionReady).length;
  const localRepositoryCount = repositories.filter((item) => item.localKind).length;
  const localMemoryCount = repositories.filter((item) => item.kind === "local_memory").length;
  const localJsonCount = repositories.filter((item) => item.kind === "local_json").length;
  const localFsCount = repositories.filter((item) => item.kind === "local_fs").length;
  const ready = readiness.ready === true && blockingCount === 0;
  const readinessLabel = totalCount ? `${passedCount}/${totalCount}` : cleanServerText(readiness.summary?.label || "0/7");
  const nextActions = [
    ...blockingCriteria.slice(0, 3).map((item) => `${item.label}：${item.detail}`),
    localRepositoryCount
      ? "将 V1 仓储切到 PostgreSQL，将附件 / 对账导出切到对象存储后重新执行系统持久化预检。"
      : "",
  ].filter(Boolean);
  return {
    version: "p0-v1-persistence-live-precheck-v1",
    scope: "v1_persistence_live_precheck",
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt: cleanServerText(readiness.checkedAt) || checkedAt || new Date().toISOString(),
    operatorId,
    summary: {
      label: ready ? "当前系统 V1 持久化已通过" : "当前系统 V1 持久化仍未通过",
      readinessLabel,
      passedCount,
      totalCount,
      blockingCount,
      blockerCount: blockingCriteria.length,
      passedLabel: readinessLabel,
      blockerLabel: `${blockingCriteria.length} 项`,
      repositoryGroupCount: repositoryGroups.length,
      repositoryGroupLabel: `${repositoryGroups.length} 组`,
      repositoryCount: repositories.length,
      repositoryLabel: `${productionReadyRepositoryCount}/${repositories.length}`,
      productionReadyRepositoryCount,
      localRepositoryCount,
      localRepositoryLabel: `${localRepositoryCount} 个`,
      localMemoryCount,
      localJsonCount,
      localFsCount,
      currentRuntime: true,
      requestBodyIgnored: true,
      localPersistenceAcceptedForV1: readiness.safeguards?.localPersistenceAcceptedForV1 === true,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
    criteria,
    blockingCriteria,
    repositoryGroups,
    nextActions: nextActions.slice(0, 5),
    nextAction: ready
      ? "当前系统 V1 持久化门禁已通过；仍需结合生产 env、现场证据、签字和 release candidate 复核。"
      : nextActions[0] || "先处理系统 V1 持久化阻塞，再重新跑 runtime readiness 和 release candidate。",
    safeguards: buildV1PersistenceLivePrecheckSafeguards({ readiness }),
  };
}

function sanitizeV1PersistenceRepositoryGroup(group = {}) {
  const repositories = Array.isArray(group.repositories)
    ? group.repositories.map(sanitizeV1PersistenceRepository).filter((item) => item.label)
    : [];
  const ready = group.ready === true;
  const repositoryCount = toNonNegativeInteger(group.repositoryCount || repositories.length);
  const localRepositoryCount = toNonNegativeInteger(group.localRepositoryCount || repositories.filter((item) => item.localKind).length);
  const productionReadyCount = toNonNegativeInteger(
    group.productionReadyCount || repositories.filter((item) => item.productionReady).length,
  );
  return {
    key: cleanServerText(group.key) || "system-persistence-group",
    label: cleanServerText(group.label) || "系统持久化分组",
    status: ready ? "passed" : "pending",
    statusLabel: ready ? "已通过" : "阻塞",
    ready,
    acceptedByLocalPolicy: group.acceptedByLocalPolicy === true,
    repositoryCount,
    productionReadyCount,
    localRepositoryCount,
    localMemoryCount: toNonNegativeInteger(group.localMemoryCount || repositories.filter((item) => item.kind === "local_memory").length),
    localJsonCount: toNonNegativeInteger(group.localJsonCount || repositories.filter((item) => item.kind === "local_json").length),
    localFsCount: toNonNegativeInteger(group.localFsCount || repositories.filter((item) => item.kind === "local_fs").length),
    repositoryLabel: `${productionReadyCount}/${repositoryCount}`,
    localRepositoryLabel: `${localRepositoryCount} 个`,
    nextAction: ready
      ? "该分组已满足 V1 持久化要求。"
      : "将该分组仍为 local_memory / local_json / local_fs 的仓储切到生产 PostgreSQL 或对象存储。",
    repositories,
  };
}

function sanitizeV1PersistenceRepository(repository = {}) {
  const kind = cleanServerText(repository.kind) || "unknown";
  const productionReady = repository.productionReady === true;
  const localKind = repository.localKind === true;
  return {
    key: cleanServerText(repository.key) || "system-repository",
    label: cleanServerText(repository.label) || "系统仓储",
    kind,
    kindLabel: getSystemPersistenceKindLabel(kind),
    status: productionReady ? "passed" : "pending",
    statusLabel: productionReady ? "生产级" : "本地/内存",
    productionReady,
    localKind,
  };
}

function getSystemPersistenceKindLabel(kind) {
  return (
    {
      postgres: "PostgreSQL",
      object_storage: "对象存储",
      local_memory: "本地内存",
      local_json: "本地 JSON",
      local_fs: "本地文件",
    }[kind] || kind || "未知"
  );
}

function buildV1PersistenceLivePrecheckSafeguards({ readiness }) {
  const safeguards = readiness?.safeguards && typeof readiness.safeguards === "object" ? readiness.safeguards : {};
  return {
    nonMutating: true,
    currentRuntime: true,
    requestBodyIgnored: true,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    rawSystemV1ReadinessIncluded: false,
    repositoryPayloadExposed: Boolean(safeguards.repositoryPayloadExposed),
    connectionStringExposed: Boolean(safeguards.connectionStringExposed),
    localPathExposed: Boolean(safeguards.localPathExposed),
    persistenceProfileConnectionStringExposed: Boolean(safeguards.persistenceProfileConnectionStringExposed),
    persistenceProfileLocalPathExposed: Boolean(safeguards.persistenceProfileLocalPathExposed),
    persistenceProfileSecretFieldsExposed: Boolean(safeguards.persistenceProfileSecretFieldsExposed),
    localPersistenceAcceptanceReferenceIncluded: false,
    environmentValuesIncluded: false,
    commandValuesIncluded: false,
    secretValuesIncluded: false,
  };
}

async function precheckSystemV1AttachmentRetention({ workspace, operatorId }) {
  const checkedAt = new Date().toISOString();
  try {
    const readiness = await getAttachmentV1ReadinessResponse({ workspace, operatorId });
    return {
      httpStatus: 200,
      body: sanitizeV1AttachmentRetentionLivePrecheck(readiness, { checkedAt, operatorId }),
    };
  } catch (error) {
    return {
      httpStatus: 500,
      body: {
        version: "p0-v1-attachment-retention-live-precheck-v1",
        scope: "v1_attachment_retention_live_precheck",
        status: "error",
        ready: false,
        checkedAt,
        operatorId,
        summary: {
          label: "当前附件 V1 留档预检失败",
          readinessLabel: "0/5",
          passedCount: 0,
          totalCount: 0,
          blockingCount: 0,
          blockerCount: 0,
          currentRuntime: true,
          requestBodyIgnored: true,
          diagnosticReady: false,
          diagnosticObjectCleanedUp: false,
          configured: false,
          missingConfigFieldCount: 0,
          storageKind: "",
          storageProvider: "",
          storageKindLabel: "未知",
          objectStorageLive: false,
          localFsAcceptedForV1: false,
          releaseCandidateRefreshed: false,
          goLiveSuiteRefreshed: false,
        },
        criteria: [],
        blockingCriteria: [],
        diagnostics: {},
        storageMode: {},
        remainingV1Risks: [],
        nextActions: [],
        nextAction: "检查附件对象存储适配器和 V1 留档门禁是否可用后重试。",
        error: {
          code: "V1_ATTACHMENT_RETENTION_LIVE_PRECHECK_FAILED",
          message: "当前附件 V1 留档预检失败。",
        },
        safeguards: buildV1AttachmentRetentionLivePrecheckSafeguards({ readiness: null }),
      },
    };
  }
}

function sanitizeV1AttachmentRetentionLivePrecheck(readiness = {}, { checkedAt, operatorId } = {}) {
  const criteria = Array.isArray(readiness.criteria) ? readiness.criteria.map(sanitizeV1RuntimeCriterion) : [];
  const blockingCriteria = criteria.filter((item) => item.blocking && !item.ready);
  const diagnostics = sanitizeV1AttachmentDiagnostics(readiness.diagnostics);
  const storageMode = sanitizeV1AttachmentStorageMode(readiness.storageMode);
  const passedCount = toNonNegativeInteger(readiness.summary?.passedCount || criteria.filter((item) => item.ready).length);
  const totalCount = toNonNegativeInteger(readiness.summary?.totalCount || criteria.length);
  const blockingCount = toNonNegativeInteger(readiness.summary?.blockingCount || blockingCriteria.length);
  const ready = readiness.ready === true && blockingCount === 0;
  const readinessLabel = totalCount ? `${passedCount}/${totalCount}` : cleanServerText(readiness.summary?.label || "0/5");
  const remainingV1Risks = sanitizeStringList(readiness.remainingV1Risks).slice(0, 5);
  const nextActions = [
    ...blockingCriteria.slice(0, 3).map((item) => `${item.label}：${item.detail}`),
    storageMode.objectStorageLive
      ? ""
      : "将附件留档切到真实 OSS/S3/COS 对象存储，或完成本地留档 V1 特批签字后重新预检。",
  ].filter(Boolean);
  return {
    version: "p0-v1-attachment-retention-live-precheck-v1",
    scope: "v1_attachment_retention_live_precheck",
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt: cleanServerText(readiness.checkedAt) || checkedAt || new Date().toISOString(),
    operatorId,
    summary: {
      label: ready ? "当前附件 V1 留档已通过" : "当前附件 V1 留档仍未通过",
      readinessLabel,
      passedCount,
      totalCount,
      blockingCount,
      blockerCount: blockingCriteria.length,
      passedLabel: readinessLabel,
      blockerLabel: `${blockingCriteria.length} 项`,
      currentRuntime: true,
      requestBodyIgnored: true,
      diagnosticReady: diagnostics.ready,
      diagnosticObjectCleanedUp: diagnostics.cleanupOk,
      configured: diagnostics.configured,
      missingConfigFieldCount: diagnostics.missingConfigFields.length,
      storageKind: storageMode.storageKind,
      storageProvider: storageMode.storageProvider,
      storageKindLabel: getAttachmentStorageKindLabel(storageMode.storageKind || storageMode.storageProvider),
      objectStorageLive: storageMode.objectStorageLive,
      localFsAcceptedForV1: storageMode.localFsAcceptedForV1,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
    criteria,
    blockingCriteria,
    diagnostics,
    storageMode,
    remainingV1Risks,
    nextActions: nextActions.slice(0, 5),
    nextAction: ready
      ? "当前附件 V1 留档门禁已通过；仍需结合现场证据、签字和 release candidate 复核。"
      : nextActions[0] || "先处理附件 V1 留档阻塞，再重新跑 runtime readiness 和 release candidate。",
    safeguards: buildV1AttachmentRetentionLivePrecheckSafeguards({ readiness }),
  };
}

function sanitizeV1AttachmentDiagnostics(diagnostics = {}) {
  return {
    status: cleanServerText(diagnostics.status),
    ready: diagnostics.ready === true,
    storageKind: cleanServerText(diagnostics.storageKind),
    storageProvider: cleanServerText(diagnostics.storageProvider),
    configured: diagnostics.configured === true,
    missingConfigFields: sanitizeStringList(diagnostics.missingConfigFields),
    writeOk: diagnostics.writeOk === true,
    readOk: diagnostics.readOk === true,
    digestOk: diagnostics.digestOk === true,
    cleanupOk: diagnostics.cleanupOk === true,
    secretFieldsExposed: diagnostics.secretFieldsExposed === true,
  };
}

function sanitizeV1AttachmentStorageMode(storageMode = {}) {
  return {
    storageKind: cleanServerText(storageMode.storageKind),
    storageProvider: cleanServerText(storageMode.storageProvider),
    objectStorageLive: storageMode.objectStorageLive === true,
    localFsAcceptedForV1: storageMode.localFsAcceptedForV1 === true,
  };
}

function getAttachmentStorageKindLabel(kind) {
  return (
    {
      object_storage: "对象存储",
      local_fs: "本地文件",
      local_json: "本地 JSON",
      local_memory: "本地内存",
    }[cleanServerText(kind)] || cleanServerText(kind) || "未知"
  );
}

function buildV1AttachmentRetentionLivePrecheckSafeguards({ readiness }) {
  const safeguards = readiness?.safeguards && typeof readiness.safeguards === "object" ? readiness.safeguards : {};
  return {
    nonMutating: true,
    currentRuntime: true,
    requestBodyIgnored: true,
    diagnosticObjectCreated: Boolean(readiness),
    diagnosticObjectCleanedUp: Boolean(safeguards.diagnosticObjectCleanedUp),
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    rawAttachmentV1ReadinessIncluded: false,
    rawStorageDiagnosticsIncluded: false,
    diagnosticObjectIdIncluded: false,
    diagnosticStorageKeyIncluded: false,
    digestValuesIncluded: false,
    localFsAcceptanceReferenceIncluded: false,
    payloadExposed: Boolean(safeguards.payloadExposed),
    secretFieldsExposed: Boolean(safeguards.secretFieldsExposed),
    environmentValuesIncluded: false,
    commandValuesIncluded: false,
    secretValuesIncluded: false,
    localPathExposed: false,
  };
}

async function precheckSystemV1RuntimeReadiness({ request, operatorId }) {
  const checkedAt = new Date().toISOString();
  try {
    const apiBaseUrl = buildCurrentApiBaseUrl(request);
    const driverOperatorId = cleanServerText(process.env.ERP_V1_READINESS_DRIVER_OPERATOR_ID) || "U-DRIVER-A";
    const headers = buildV1ReadinessHeaders({ operatorId, bearerToken: "" });
    const driverHeaders = buildV1ReadinessHeaders({ operatorId: driverOperatorId, bearerToken: "" });
    const responses = await readV1ReadinessSources({ apiBaseUrl, headers, driverHeaders });
    const report = buildV1ReadinessReport({
      apiBaseUrl,
      operatorId,
      driverOperatorId,
      responses,
    });
    return {
      httpStatus: 200,
      body: sanitizeV1RuntimeReadinessLivePrecheck(report, {
        checkedAt,
        operatorId,
        driverOperatorId,
      }),
    };
  } catch (error) {
    return {
      httpStatus: 500,
      body: {
        version: "p0-v1-runtime-readiness-live-precheck-v1",
        scope: "v1_runtime_readiness_live_precheck",
        status: "error",
        ready: false,
        checkedAt,
        operatorId,
        summary: {
          label: "当前运行时 V1 总门禁预检失败",
          readinessLabel: "0/11",
          passedCount: 0,
          totalCount: 0,
          blockingCount: 0,
          blockerCount: 0,
          currentRuntime: true,
          requestBodyIgnored: true,
          apiBaseUrlAccepted: false,
          releaseCandidateRefreshed: false,
          goLiveSuiteRefreshed: false,
        },
        criteria: [],
        blockingCriteria: [],
        nextActions: [],
        nextAction: "检查当前 API 是否可访问、权限账号是否存在，以及 readiness 端点是否能正常返回。",
        error: {
          code: "V1_RUNTIME_READINESS_LIVE_PRECHECK_FAILED",
          message: "当前运行时 V1 总门禁预检失败。",
        },
        safeguards: buildV1RuntimeReadinessLiveSafeguards({ report: null }),
      },
    };
  }
}

function buildCurrentApiBaseUrl(request) {
  const host = cleanServerText(request?.headers?.host) || `127.0.0.1:${API_DEFAULT_PORT}`;
  const protocol = cleanServerText(request?.headers?.["x-forwarded-proto"]).split(",")[0] || "http";
  return `${protocol}://${host}/api`;
}

function sanitizeV1RuntimeReadinessLivePrecheck(report = {}, { checkedAt, operatorId, driverOperatorId } = {}) {
  const criteria = Array.isArray(report.criteria) ? report.criteria.map(sanitizeV1RuntimeCriterion) : [];
  const blockingCriteria = criteria.filter((item) => item.blocking && !item.ready);
  const passedCount = toNonNegativeInteger(report.summary?.passedCount || criteria.filter((item) => item.ready).length);
  const totalCount = toNonNegativeInteger(report.summary?.totalCount || criteria.length);
  const blockingCount = toNonNegativeInteger(report.summary?.blockingCount || blockingCriteria.length);
  const ready = report.ready === true && blockingCount === 0;
  const readinessLabel = totalCount ? `${passedCount}/${totalCount}` : cleanServerText(report.summary?.label || "0/11");
  const nextActions = sanitizeStringList(report.nextActions).slice(0, 5);
  return {
    version: "p0-v1-runtime-readiness-live-precheck-v1",
    scope: "v1_runtime_readiness_live_precheck",
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt: cleanServerText(report.checkedAt) || checkedAt || new Date().toISOString(),
    operatorId,
    driverOperatorId: cleanServerText(driverOperatorId),
    summary: {
      label: ready ? "当前运行时 V1 总门禁已通过" : "当前运行时 V1 总门禁仍未通过",
      readinessLabel,
      passedCount,
      totalCount,
      blockingCount,
      blockerCount: blockingCriteria.length,
      passedLabel: readinessLabel,
      blockerLabel: `${blockingCriteria.length} 项`,
      currentRuntime: true,
      requestBodyIgnored: true,
      apiBaseUrlAccepted: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      physicalPrinterCalled: Boolean(report.safeguards?.physicalPrinterCalled),
      nonPrinting: report.safeguards?.nonPrinting !== false,
      driverStatusChanged: Boolean(report.safeguards?.driverDeliveryStatusChanged),
    },
    criteria,
    blockingCriteria,
    nextActions,
    nextAction: ready
      ? "当前 API 运行时总门禁已通过；仍需结合现场证据、签字、V1/V2 边界和 release candidate 复核。"
      : nextActions[0] || "先处理当前运行时总门禁阻塞，再重新跑 release candidate。",
    safeguards: buildV1RuntimeReadinessLiveSafeguards({ report }),
  };
}

function sanitizeV1RuntimeCriterion(item = {}) {
  const status = cleanServerText(item.status) || "pending";
  const ready = status === "passed";
  return {
    key: cleanServerText(item.key) || "runtime-readiness-criterion",
    label: cleanServerText(item.label) || "运行时门禁项",
    status,
    statusLabel: ready ? "已通过" : "阻塞",
    ready,
    blocking: item.blocking !== false,
    detail: cleanServerText(item.detail),
  };
}

function toNonNegativeInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
}

function buildV1RuntimeReadinessLiveSafeguards({ report }) {
  const safeguards = report?.safeguards && typeof report.safeguards === "object" ? report.safeguards : {};
  return {
    nonMutating: true,
    liveApiReadback: true,
    requestBodyIgnored: true,
    apiBaseUrlAccepted: false,
    bearerTokenAccepted: false,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    rawRuntimeReadinessReportIncluded: false,
    rawReadinessSourcesIncluded: false,
    rawPermissionsIncluded: false,
    apiBaseUrlExposed: false,
    environmentValuesIncluded: false,
    envValuesIncluded: false,
    commandValuesIncluded: Boolean(safeguards.commandValueExposed),
    commandArgsIncluded: Boolean(safeguards.commandArgsExposed),
    secretValuesIncluded: Boolean(safeguards.secretFieldsExposed),
    payloadIncluded: Boolean(safeguards.payloadExposed || safeguards.attachmentPayloadExposed || safeguards.driverPayloadExposed),
    spoolPathExposed: Boolean(safeguards.spoolPathExposed),
    localPathExposed: Boolean(safeguards.systemLocalPathExposed),
    physicalPrinterCalled: Boolean(safeguards.physicalPrinterCalled),
    printFileCreated: Boolean(safeguards.printFileCreated),
    driverDeliveryStatusChanged: Boolean(safeguards.driverDeliveryStatusChanged),
    nonPrinting: safeguards.nonPrinting !== false,
    attachmentReadOnly: safeguards.attachmentReadOnly !== false,
    driverReadOnly: safeguards.driverReadOnly !== false,
    systemReadOnly: safeguards.systemReadOnly !== false,
  };
}

async function precheckSystemV1DriverReadiness({ workspace, operatorId }) {
  const checkedAt = new Date().toISOString();
  const driverOperatorId = cleanServerText(process.env.ERP_V1_READINESS_DRIVER_OPERATOR_ID) || "U-DRIVER-A";
  try {
    const readiness = await getDriverV1ReadinessResponse({
      workspace,
      operatorId: driverOperatorId,
    });
    return {
      httpStatus: 200,
      body: sanitizeV1DriverReadinessLivePrecheck(readiness, {
        checkedAt,
        operatorId,
        driverOperatorId,
      }),
    };
  } catch (error) {
    return {
      httpStatus: 500,
      body: {
        version: "p0-v1-driver-readiness-live-precheck-v1",
        scope: "v1_driver_readiness_live_precheck",
        status: "error",
        ready: false,
        checkedAt,
        operatorId,
        driverOperatorId,
        summary: {
          label: "司机端 V1 真机门禁预检失败",
          readinessLabel: "0/6",
          passedCount: 0,
          totalCount: 0,
          blockingCount: 0,
          blockerCount: 0,
          currentRuntime: true,
          requestBodyIgnored: true,
          deliveryTaskStatusChanged: false,
          releaseCandidateRefreshed: false,
          goLiveSuiteRefreshed: false,
          requiresNativeShell: true,
          browserOnlyNotReady: true,
          payloadExposed: false,
        },
        criteria: [],
        blockingCriteria: [],
        nextActions: [],
        nextAction: "检查司机验收账号、送货任务读模型和 driver V1 readiness 门禁是否可读。",
        error: {
          code: "V1_DRIVER_READINESS_LIVE_PRECHECK_FAILED",
          message: "司机端 V1 真机门禁预检失败。",
        },
        safeguards: buildV1DriverReadinessLiveSafeguards({ readiness: null }),
      },
    };
  }
}

function sanitizeV1DriverReadinessLivePrecheck(readiness = {}, { checkedAt, operatorId, driverOperatorId } = {}) {
  const criteria = Array.isArray(readiness.criteria) ? readiness.criteria.map(sanitizeV1DriverCriterion) : [];
  const blockingCriteria = criteria.filter((item) => item.blocking && !item.ready);
  const passedCount = toNonNegativeInteger(readiness.summary?.passedCount || criteria.filter((item) => item.ready).length);
  const totalCount = toNonNegativeInteger(readiness.summary?.totalCount || criteria.length);
  const blockingCount = toNonNegativeInteger(readiness.summary?.blockingCount || blockingCriteria.length);
  const ready = readiness.ready === true && blockingCount === 0;
  const latestFieldTestRecord = readiness.latestFieldTestRecord && typeof readiness.latestFieldTestRecord === "object"
    ? readiness.latestFieldTestRecord
    : null;
  const latestFieldTestSummary = readiness.latestFieldTestSummary && typeof readiness.latestFieldTestSummary === "object"
    ? readiness.latestFieldTestSummary
    : null;
  const nativeDiagnostics = readiness.nativeBridgeDiagnostics && typeof readiness.nativeBridgeDiagnostics === "object"
    ? readiness.nativeBridgeDiagnostics
    : null;
  const packageLabelScanSample = readiness.packageLabelScanSample && typeof readiness.packageLabelScanSample === "object"
    ? readiness.packageLabelScanSample
    : null;
  const deliveryTaskReadiness = readiness.deliveryTaskReadiness && typeof readiness.deliveryTaskReadiness === "object"
    ? readiness.deliveryTaskReadiness
    : {};
  const remainingV1Risks = sanitizeStringList(readiness.remainingV1Risks).slice(0, 7);
  const readinessLabel = totalCount ? `${passedCount}/${totalCount}` : cleanServerText(readiness.summary?.label || "0/6");
  return {
    version: "p0-v1-driver-readiness-live-precheck-v1",
    scope: "v1_driver_readiness_live_precheck",
    status: ready ? "ready" : "blocked",
    ready,
    checkedAt: cleanServerText(readiness.checkedAt) || checkedAt || new Date().toISOString(),
    operatorId,
    driverOperatorId,
    summary: {
      label: ready ? "司机端 V1 真机门禁已通过" : "司机端 V1 真机门禁仍未通过",
      readinessLabel,
      passedCount,
      totalCount,
      blockingCount,
      blockerCount: blockingCriteria.length,
      passedLabel: readinessLabel,
      blockerLabel: `${blockingCriteria.length} 项`,
      currentRuntime: true,
      requestBodyIgnored: true,
      deliveryTaskStatusChanged: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      deliveryTaskCount: toNonNegativeInteger(deliveryTaskReadiness.total),
      fieldTestRecordAvailable: Boolean(latestFieldTestRecord),
      fieldTestLabel: cleanServerText(latestFieldTestSummary?.label) || "未验收",
      nativeSupportedLabel: nativeDiagnostics
        ? `${toNonNegativeInteger(nativeDiagnostics.supportedCount)}/${toNonNegativeInteger(nativeDiagnostics.total)}`
        : "0/2",
      packageLabelScanMatched: packageLabelScanSample?.result === "matched" || packageLabelScanSample?.result === "duplicate",
      packageLabelScanNative: packageLabelScanSample?.method === "native_sdk",
      requiresNativeShell: readiness.safeguards?.requiresNativeShell !== false,
      browserOnlyNotReady: Boolean(readiness.safeguards?.browserOnlyNotReady),
      payloadExposed: Boolean(readiness.safeguards?.payloadExposed),
    },
    criteria,
    blockingCriteria,
    deliveryTaskReadiness: {
      total: toNonNegativeInteger(deliveryTaskReadiness.total),
      metrics: {
        pendingCount: toNonNegativeInteger(deliveryTaskReadiness.metrics?.pendingCount),
        deliveringCount: toNonNegativeInteger(deliveryTaskReadiness.metrics?.deliveringCount),
        completedCount: toNonNegativeInteger(deliveryTaskReadiness.metrics?.completedCount),
        exceptionCount: toNonNegativeInteger(deliveryTaskReadiness.metrics?.exceptionCount),
      },
      sampleFulfillmentCount: Array.isArray(deliveryTaskReadiness.sampleFulfillmentIds)
        ? deliveryTaskReadiness.sampleFulfillmentIds.length
        : 0,
    },
    latestFieldTest: latestFieldTestRecord
      ? {
          recordId: cleanServerText(latestFieldTestRecord.recordId),
          fulfillmentId: cleanServerText(latestFieldTestRecord.fulfillmentId),
          checkedAt: cleanServerText(latestFieldTestRecord.checkedAt),
          deviceLabel: cleanServerText(latestFieldTestRecord.deviceLabel),
          summaryLabel: cleanServerText(latestFieldTestSummary?.label) || "已记录",
        }
      : null,
    nativeBridge: nativeDiagnostics
      ? {
          label: cleanServerText(nativeDiagnostics.label),
          supportedCount: toNonNegativeInteger(nativeDiagnostics.supportedCount),
          total: toNonNegativeInteger(nativeDiagnostics.total),
          items: Array.isArray(nativeDiagnostics.items)
            ? nativeDiagnostics.items.slice(0, 2).map((item) => ({
                key: cleanServerText(item.key),
                label: cleanServerText(item.label),
                supported: item.supported === true,
                statusLabel: cleanServerText(item.statusLabel),
                bridgeTypeLabel: cleanServerText(item.bridgeTypeLabel),
                version: cleanServerText(item.version),
              }))
            : [],
        }
      : null,
    packageLabelScanSample: packageLabelScanSample
      ? {
          sampleId: cleanServerText(packageLabelScanSample.sampleId),
          fulfillmentId: cleanServerText(packageLabelScanSample.fulfillmentId),
          method: cleanServerText(packageLabelScanSample.method),
          methodLabel: cleanServerText(packageLabelScanSample.methodLabel),
          result: cleanServerText(packageLabelScanSample.result),
          resultLabel: cleanServerText(packageLabelScanSample.resultLabel),
          checkedAt: cleanServerText(packageLabelScanSample.checkedAt),
          expectedPackageIdPresent: Boolean(packageLabelScanSample.expectedPackageId),
          matchedPackageIdPresent: Boolean(packageLabelScanSample.matchedPackageId),
          scanTextPresent: Boolean(packageLabelScanSample.scannedText),
        }
      : null,
    remainingV1Risks,
    nextActions: remainingV1Risks.slice(0, 5),
    nextAction: ready
      ? "司机端 V1 真机门禁已通过；仍需结合现场证据、签字、V1/V2 边界和 release candidate 复核。"
      : remainingV1Risks[0] || "用真实司机手机补齐原生扫码、原生导航、现场验收和纸质包裹标签扫码样本后重跑门禁。",
    safeguards: buildV1DriverReadinessLiveSafeguards({ readiness }),
  };
}

function sanitizeV1DriverCriterion(item = {}) {
  const status = cleanServerText(item.status) || "pending";
  const ready = status === "passed";
  return {
    key: cleanServerText(item.key) || "driver-readiness-criterion",
    label: cleanServerText(item.label) || "司机真机门禁项",
    status,
    statusLabel: ready ? "通过" : "阻塞",
    ready,
    blocking: item.blocking !== false,
    detail: cleanServerText(item.detail),
  };
}

function buildV1DriverReadinessLiveSafeguards({ readiness }) {
  const safeguards = readiness?.safeguards && typeof readiness.safeguards === "object" ? readiness.safeguards : {};
  return {
    nonMutating: true,
    currentRuntime: true,
    requestBodyIgnored: true,
    deliveryTaskStatusChanged: Boolean(safeguards.deliveryStatusChanged),
    deliveryRecordCreated: false,
    deliveryRecordUpdated: false,
    cameraPermissionRequested: false,
    navigationAppOpened: false,
    nativeBridgeInvoked: false,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    rawDriverReadinessIncluded: false,
    rawDeliveryTasksIncluded: false,
    rawFieldTestRecordIncluded: false,
    rawNativePayloadIncluded: false,
    rawScanTextIncluded: false,
    rawPhotoIncluded: false,
    rawLocationIncluded: false,
    requiresNativeShell: safeguards.requiresNativeShell !== false,
    browserOnlyNotReady: Boolean(safeguards.browserOnlyNotReady),
    physicalLabelScanRequired: safeguards.physicalLabelScanRequired !== false,
    navigationAppRequired: safeguards.navigationAppRequired !== false,
    payloadExposed: Boolean(safeguards.payloadExposed),
    secretValuesIncluded: false,
    localPathExposed: false,
  };
}

function precheckSystemV1V2Boundary({ operatorId }) {
  const checkedAt = new Date().toISOString();
  const artifacts = readV1GoLiveStatusArtifacts();
  const completion = artifacts.completionSnapshot.value ?? {};
  const v1V2Scope = artifacts.v1V2Scope.value ?? {};
  const boundaryBrief = sanitizeV1V2BoundaryBrief(v1V2Scope, completion);
  const signoffSummary = summarizeV1FieldEvidenceIntakeSignoffRows(
    artifacts.fieldEvidenceSignoffBoundaryCsv.value,
  );
  const blockers = buildV1V2BoundaryPrecheckBlockers({ boundaryBrief, signoffSummary });
  const ready =
    boundaryBrief.available === true &&
    boundaryBrief.canDeclareV1Complete === true &&
    signoffSummary.boundaryReady === true &&
    blockers.length === 0;

  return {
    httpStatus: 200,
    body: {
      version: "p0-v1-v2-boundary-precheck-v1",
      scope: "v1_v2_boundary_precheck",
      status: ready ? "ready" : signoffSummary.boundaryReady ? "confirmed_but_v1_blocked" : "pending_confirmation",
      ready,
      checkedAt,
      operatorId,
      summary: {
        label: ready ? "V1/V2 边界已确认且 V1 可继续放行复核" : "V1/V2 边界仍不能作为 V1 放行依据",
        boundaryLabel: signoffSummary.boundaryLabel,
        boundaryReady: signoffSummary.boundaryReady,
        canDeclareV1Complete: boundaryBrief.canDeclareV1Complete,
        scopeBriefAvailable: boundaryBrief.available,
        v1MustContinueCount: boundaryBrief.summary.v1MustContinueCount,
        v2CategoryCount: boundaryBrief.summary.v2CategoryCount,
        v2DifferenceCount: boundaryBrief.summary.v2DifferenceCount,
        moduleDifferenceCount: boundaryBrief.summary.moduleDifferenceCount,
        ownerReviewRuleCount: boundaryBrief.summary.ownerReviewRuleCount,
        v1MustContinueLabel: `${boundaryBrief.summary.v1MustContinueCount} 项`,
        v2CategoryLabel: `${boundaryBrief.summary.v2CategoryCount} 类`,
        v2DifferenceLabel: `${boundaryBrief.summary.v2DifferenceCount} 项`,
        moduleDifferenceLabel: `${boundaryBrief.summary.moduleDifferenceCount} 个模块`,
        blockerCount: blockers.length,
        blockerShownCount: blockers.length,
        releaseCandidateRefreshed: false,
        goLiveSuiteRefreshed: false,
        requestBodyIgnored: true,
      },
      v1MustContinue: boundaryBrief.v1MustContinue,
      v2Categories: boundaryBrief.v2Categories,
      v2Differences: boundaryBrief.v2Differences.slice(0, 5),
      moduleDifferences: boundaryBrief.moduleDifferences.slice(0, 5),
      ownerReview: boundaryBrief.ownerReview,
      blockers,
      nextAction: ready
        ? "边界确认已满足；继续刷新 release candidate / go-live suite，并复核现场证据和签字。"
        : blockers[0]?.nextAction || "负责人先复核 V1 必做项和 V2 延后项，再填写边界确认人和确认时间。",
      safeguards: buildV1V2BoundaryPrecheckSafeguards(),
    },
  };
}

function buildV1V2BoundaryPrecheckBlockers({ boundaryBrief, signoffSummary }) {
  const blockers = [];
  if (boundaryBrief.available !== true) {
    blockers.push(buildV1V2BoundaryPrecheckBlocker({
      key: "v1-v2-brief-missing",
      label: "V1/V2 差异摘要缺失",
      detail: "当前没有可供负责人复核的 V1/V2 差异摘要。",
      nextAction: "先生成 V1/V2 差异摘要，再做边界确认。",
    }));
  }
  if (boundaryBrief.summary.v1MustContinueCount > 0 && boundaryBrief.canDeclareV1Complete !== true) {
    blockers.push(buildV1V2BoundaryPrecheckBlocker({
      key: "v1-must-continue-open",
      label: "V1 必做项仍未完成",
      detail: `还有 ${boundaryBrief.summary.v1MustContinueCount} 项 V1 必做内容不能后移到 V2。`,
      nextAction: "先按 V1 必做清单处理生产配置、真实设备、现场证据和签字。",
    }));
  }
  if (signoffSummary.boundaryReady !== true) {
    blockers.push(buildV1V2BoundaryPrecheckBlocker({
      key: "v1-v2-boundary-confirmation-missing",
      label: "V1/V2 边界确认未完成",
      detail: `边界状态：${signoffSummary.boundaryLabel || "待确认"}。`,
      nextAction: "负责人确认 V1 必做项和 V2 延后项，并填写确认人和确认时间。",
    }));
  }
  if (boundaryBrief.summary.ownerReviewRuleCount <= 0) {
    blockers.push(buildV1V2BoundaryPrecheckBlocker({
      key: "owner-review-rule-missing",
      label: "负责人复核规则缺失",
      detail: "V1/V2 差异摘要没有负责人复核问题、建议或放行规则。",
      nextAction: "补齐负责人复核规则，明确 V2 差异不能替代 V1 门禁。",
    }));
  }
  return blockers.slice(0, 8);
}

function buildV1V2BoundaryPrecheckBlocker({ key, label, detail, nextAction }) {
  return {
    key: cleanServerText(key),
    label: sanitizeV1RoleTaskActionText(label),
    status: "blocked",
    blocking: true,
    detail: sanitizeV1RoleTaskActionText(detail),
    nextAction: sanitizeV1RoleTaskActionText(nextAction),
  };
}

function buildV1V2BoundaryPrecheckSafeguards() {
  return {
    nonMutating: true,
    requestBodyIgnored: true,
    boundaryConfirmationMutated: false,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    rawV1V2ScopeIncluded: false,
    rawEvidenceRefsIncluded: false,
    rawSignersIncluded: false,
    rawNotesIncluded: false,
    artifactPathExposed: false,
    rawSecretsIncluded: false,
    environmentValuesIncluded: false,
    commandValuesIncluded: false,
  };
}

async function refreshSystemV1V2ScopeBrief({ operatorId }) {
  const checkedAt = new Date().toISOString();
  const artifactRoot = getV1GoLiveArtifactRoot();
  try {
    await runV1V2ScopeBriefRefreshCommand({ artifactRoot });
    const artifacts = readV1GoLiveStatusArtifacts();
    const completion = artifacts.completionSnapshot.value ?? {};
    const scopeBrief = sanitizeV1V2BoundaryBrief(artifacts.v1V2Scope.value ?? {}, completion);
    return {
      httpStatus: 200,
      body: buildV1V2ScopeBriefRefreshSuccessBody({
        checkedAt,
        operatorId,
        scopeBrief,
      }),
    };
  } catch {
    return {
      httpStatus: 500,
      body: buildV1V2ScopeBriefRefreshErrorBody({ checkedAt, operatorId }),
    };
  }
}

function buildV1V2ScopeBriefRefreshSuccessBody({ checkedAt, operatorId, scopeBrief }) {
  const ready = scopeBrief.ready === true;
  return {
    version: "p0-v1-v2-scope-brief-refresh-v1",
    scope: "v1_v2_scope_brief_refresh",
    status: ready ? "ready_scope_brief_refreshed" : "blocked_scope_brief_refreshed",
    ready,
    checkedAt,
    operatorId,
    summary: {
      label: ready ? "V1/V2 差异摘要已刷新且 V1 边界可复核" : "V1/V2 差异摘要已刷新但 V1 仍未完成",
      canDeclareV1Complete: scopeBrief.canDeclareV1Complete === true,
      scopeBriefAvailable: scopeBrief.available === true,
      v1MustContinueCount: scopeBrief.summary.v1MustContinueCount,
      v2CategoryCount: scopeBrief.summary.v2CategoryCount,
      v2DifferenceCount: scopeBrief.summary.v2DifferenceCount,
      moduleDifferenceCount: scopeBrief.summary.moduleDifferenceCount,
      ownerReviewRuleCount: scopeBrief.summary.ownerReviewRuleCount,
      v1MustContinueLabel: `${scopeBrief.summary.v1MustContinueCount} 项`,
      v2CategoryLabel: `${scopeBrief.summary.v2CategoryCount} 类`,
      v2DifferenceLabel: `${scopeBrief.summary.v2DifferenceCount} 项`,
      moduleDifferenceLabel: `${scopeBrief.summary.moduleDifferenceCount} 个模块`,
      scopeBriefRefreshed: true,
      boundaryConfirmationMutated: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      requestBodyIgnored: true,
    },
    conclusion: scopeBrief.conclusion,
    v1MustContinue: scopeBrief.v1MustContinue,
    v2Categories: scopeBrief.v2Categories,
    v2Differences: scopeBrief.v2Differences.slice(0, 10),
    moduleDifferences: scopeBrief.moduleDifferences.slice(0, 8),
    ownerReview: scopeBrief.ownerReview,
    nextAction: ready
      ? "差异摘要已刷新；继续由负责人复核 V1/V2 边界并刷新 release candidate。"
      : scopeBrief.nextAction || "差异摘要已刷新；先按 V1 必做清单处理阻塞，再复核 V2 延后项。",
    safeguards: buildV1V2ScopeBriefRefreshSafeguards({ refreshed: true }),
  };
}

function buildV1V2ScopeBriefRefreshErrorBody({ checkedAt, operatorId }) {
  return {
    version: "p0-v1-v2-scope-brief-refresh-v1",
    scope: "v1_v2_scope_brief_refresh",
    status: "scope_brief_refresh_failed",
    ready: false,
    checkedAt,
    operatorId,
    error: {
      code: "V1_V2_SCOPE_BRIEF_REFRESH_FAILED",
      message: "刷新 V1/V2 差异摘要失败，命令输出已脱敏且未返回前端。",
    },
    summary: {
      label: "V1/V2 差异摘要刷新失败",
      canDeclareV1Complete: false,
      scopeBriefAvailable: false,
      v1MustContinueCount: 0,
      v2CategoryCount: 0,
      v2DifferenceCount: 0,
      moduleDifferenceCount: 0,
      ownerReviewRuleCount: 0,
      v1MustContinueLabel: "0 项",
      v2CategoryLabel: "0 类",
      v2DifferenceLabel: "0 项",
      moduleDifferenceLabel: "0 个模块",
      scopeBriefRefreshed: false,
      boundaryConfirmationMutated: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
      requestBodyIgnored: true,
    },
    v1MustContinue: [],
    v2Categories: [],
    v2Differences: [],
    moduleDifferences: [],
    ownerReview: {},
    nextAction: "由技术/管理复核 V1/V2 范围文档和完成度快照是否存在，再重新刷新差异摘要。",
    safeguards: buildV1V2ScopeBriefRefreshSafeguards({ refreshed: false }),
  };
}

function buildV1V2ScopeBriefRefreshSafeguards({ refreshed = false } = {}) {
  return {
    requestBodyIgnored: true,
    scopeBriefRefreshed: Boolean(refreshed),
    sourceScopeMarkdownMutated: false,
    completionSnapshotMutated: false,
    fieldEvidenceMutated: false,
    boundaryConfirmationMutated: false,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    businessDataMutated: false,
    rawV1V2ScopeIncluded: false,
    rawEvidenceRefsIncluded: false,
    rawSignersIncluded: false,
    rawNotesIncluded: false,
    rawCommandStdoutIncluded: false,
    rawCommandStderrIncluded: false,
    artifactPathExposed: false,
    localPathExposed: false,
    environmentValuesIncluded: false,
    commandValuesIncluded: false,
    rawSecretsIncluded: false,
  };
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
  const checkedAt = new Date().toISOString();
  const artifacts = readV1GoLiveStatusArtifacts();
  const completion = artifacts.completionSnapshot.value ?? {};
  const suite = artifacts.goLiveSuite.value ?? {};
  const releaseCandidateArtifact = artifacts.releaseCandidate.value ?? {};
  const productionEnvGate = sanitizeV1ProductionEnvGate(
    releaseCandidateArtifact.envPreflight,
    releaseCandidateArtifact.envFileAudit,
    completion.releaseCandidate?.envPreflight?.fixChecklist ??
      suite.releaseCandidate?.envPreflight?.fixChecklist ??
      [],
  );
  const productionGoLivePrecheck = await precheckSystemV1ProductionGoLive({ request, operatorId });
  const productionGoLiveGate = sanitizeV1ProductionGoLiveGateForReleasePrecheck(productionGoLivePrecheck.body);
  const fieldEvidenceDraftFreshness = buildV1FieldEvidenceDraftFreshness(
    artifacts.fieldEvidenceItemsCsv.value,
    artifacts.fieldEvidenceSignoffBoundaryCsv.value,
    artifacts.fieldEvidenceDraftManifest,
  );
  const fieldEvidenceQuality = sanitizeV1FieldEvidenceIntakeQuality(
    artifacts.fieldEvidenceItemsCsv.value,
    artifacts.fieldEvidenceSignoffBoundaryCsv.value,
    {
      rulesArtifact: artifacts.fieldEvidenceIntakeRules,
      draftManifestArtifact: artifacts.fieldEvidenceDraftManifest,
      draftFreshness: fieldEvidenceDraftFreshness,
    },
  );
  const draftManifestStatus = normalizeV1FieldEvidenceDraftManifestStatus(artifacts.fieldEvidenceDraftManifest);
  const draftValidation = buildV1ReleaseCandidateRefreshDraftValidation(
    artifacts.fieldEvidenceDraftManifest,
    fieldEvidenceDraftFreshness,
  );
  const evidenceProgress =
    draftValidation.summary.evidenceProgress || fieldEvidenceQuality.summary.evidenceProgress || "0/34";
  const signoffProgress =
    draftValidation.summary.signoffProgress || fieldEvidenceQuality.summary.signoffProgress || "0/6";
  const evidenceGroupsReadyLabel = draftValidation.summary.evidenceGroupsReadyLabel || "0/6";
  const boundaryReady = Boolean(draftValidation.boundary.ready || fieldEvidenceQuality.summary.boundaryReady);
  const boundaryLabel = draftValidation.boundary.label || fieldEvidenceQuality.summary.boundaryLabel || "待确认";
  const refreshAllowed =
    draftManifestStatus === "available" &&
    fieldEvidenceDraftFreshness.ready === true &&
    draftValidation.ready === true &&
    productionEnvGate.ready === true &&
    productionGoLiveGate.ready === true &&
    boundaryReady;
  const blockers = buildV1ReleaseCandidateRefreshPrecheckBlockers({
    draftManifestStatus,
    draftFreshness: fieldEvidenceDraftFreshness,
    draftValidation,
    productionEnvGate,
    productionGoLiveGate,
    evidenceProgress,
    signoffProgress,
    evidenceGroupsReadyLabel,
    boundaryReady,
    boundaryLabel,
  });
  const ready = refreshAllowed && blockers.length === 0;

  return {
    httpStatus: 200,
    body: {
      version: "p0-v1-release-candidate-refresh-precheck-v1",
      scope: "v1_release_candidate_refresh_precheck",
      status: ready ? "ready_to_refresh" : "blocked",
      ready,
      checkedAt,
      operatorId,
      summary: {
        label: ready ? "已具备刷新 release candidate 条件" : "暂不能刷新 release candidate",
        draftManifestStatus,
        draftManifestLabel: formatV1DraftManifestStatusLabel(draftManifestStatus),
        draftFreshnessStatus: fieldEvidenceDraftFreshness.status,
        draftFreshnessLabel: fieldEvidenceDraftFreshness.label,
        draftFreshnessReady: fieldEvidenceDraftFreshness.ready === true,
        draftValidationStatus: draftValidation.status,
        evidenceProgress,
        signoffProgress,
        evidenceGroupsReadyLabel,
        productionEnvPreflightLabel: productionEnvGate.summary.readinessLabel || "0/10",
        productionEnvBlockingCount: productionEnvGate.summary.blockingCount,
        productionEnvWarningCount: productionEnvGate.summary.warningCount,
        productionGoLiveStatus: productionGoLiveGate.status,
        productionGoLiveLabel: productionGoLiveGate.summary.label,
        productionGoLiveReadinessLabel: productionGoLiveGate.summary.readinessLabel,
        productionGoLiveBlockingCount: productionGoLiveGate.summary.blockingCount,
        productionGoLiveFirstBlockedStageKey: productionGoLiveGate.summary.firstBlockedStageKey,
        productionGoLiveFirstBlockedStageLabel: productionGoLiveGate.summary.firstBlockedStageLabel,
        productionGoLiveSourceStatuses: productionGoLiveGate.summary.sourceStatuses,
        productionGoLiveReady: productionGoLiveGate.ready,
        boundaryLabel,
        releaseCandidateRefreshAllowed: ready,
        releaseCandidateRefreshed: false,
        goLiveSuiteRefreshed: false,
        blockerCount: blockers.length,
        blockerShownCount: blockers.length,
      },
      blockers,
      nextAction: ready
        ? "可以使用安全 env 文件刷新 release candidate / go-live suite；刷新后仍需负责人按页面门禁复核。"
        : "先补齐现场证据、负责人签字、V1/V2 边界、生产 env 和当前生产上线组合门禁，再刷新 release candidate / go-live suite。",
      safeguards: buildV1ReleaseCandidateRefreshPrecheckSafeguards({
        draftManifestAvailable: draftManifestStatus === "available",
        draftFreshnessChecked: true,
        productionGoLivePrecheckIncluded: true,
      }),
    },
  };
}

function sanitizeV1ProductionGoLiveGateForReleasePrecheck(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const summary = isPlainServerObject(source.summary) ? source.summary : {};
  const blockingStages = Array.isArray(source.blockingStages)
    ? source.blockingStages.map(sanitizeV1ProductionGoLiveStage).filter(Boolean)
    : [];
  const stages = Array.isArray(source.stages)
    ? source.stages.map(sanitizeV1ProductionGoLiveStage).filter(Boolean)
    : [];
  const status = cleanServerText(source.status) || "error";
  const blockingCount = toNonNegativeInteger(summary.blockingCount || blockingStages.length || (source.ready === true ? 0 : 1));
  const readinessLabel = cleanServerText(summary.readinessLabel) || `${stages.filter((item) => item.ready).length}/${stages.length || 4}`;
  const firstBlockedStage = blockingStages[0] || stages.find((item) => item.ready !== true) || null;
  const sourceStatuses = sanitizeV1ProductionEnvFileConfigSourceStatuses({ sources: summary.sourceStatuses });
  return {
    status,
    ready: source.ready === true && status === "ready",
    summary: {
      label: cleanServerText(summary.label) || (source.ready === true ? "生产上线组合预检通过" : "生产上线组合预检仍未通过"),
      readinessLabel,
      blockingCount,
      blockerLabel: cleanServerText(summary.blockerLabel) || `${blockingCount} 项`,
      currentRuntime: summary.currentRuntime === true,
      productionEnvAppliedToProcess: summary.productionEnvAppliedToProcess === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      physicalPrinterCalled: summary.physicalPrinterCalled === true,
      firstBlockedStageKey: cleanServerText(firstBlockedStage?.key),
      firstBlockedStageLabel: sanitizeV1RoleTaskActionText(firstBlockedStage?.label),
      sourceStatuses,
    },
    blockingStages,
  };
}

function buildV1ReleaseCandidateRefreshDraftValidation(draftManifestArtifact = {}, draftFreshness = null) {
  if (!isPlainServerObject(draftManifestArtifact) || draftManifestArtifact.status !== "loaded") {
    return {
      status: "missing",
      ready: false,
      schemaValid: false,
      summary: {
        evidenceProgress: "0/34",
        signoffProgress: "0/6",
        evidenceGroupsReadyLabel: "0/6",
        blockingIssueCount: 0,
      },
      boundary: {
        status: "pending",
        label: "待确认",
        ready: false,
      },
    };
  }
  const validation = validateV1FieldEvidenceManifest(draftManifestArtifact.value);
  const sanitized = sanitizeV1FieldEvidenceDraftManifestValidationResult(validation, {
    checkedAt: new Date().toISOString(),
    draftManifestAvailable: true,
    draftFreshness,
  });
  return {
    status: sanitized.status,
    ready: sanitized.ready,
    schemaValid: sanitized.schemaValid,
    summary: sanitized.summary,
    boundary: sanitized.boundary,
  };
}

function buildV1ReleaseCandidateRefreshPrecheckBlockers({
  draftManifestStatus,
  draftFreshness,
  draftValidation,
  productionEnvGate,
  productionGoLiveGate,
  evidenceProgress,
  signoffProgress,
  evidenceGroupsReadyLabel,
  boundaryReady,
  boundaryLabel,
}) {
  const blockers = [];
  if (draftManifestStatus !== "available") {
    blockers.push(buildV1ReleaseCandidateRefreshPrecheckBlocker({
      key: "field-evidence-draft-missing",
      label: "现场证据 manifest 草稿未生成",
      detail: "页面还没有可用于刷新候选的现场证据草稿。",
      nextAction: "先点击生成草稿，再校验草稿。",
    }));
  } else if (isPlainServerObject(draftFreshness) && draftFreshness.ready !== true) {
    blockers.push(buildV1ReleaseCandidateRefreshPrecheckBlocker({
      key: "field-evidence-draft-stale",
      label: "现场证据 manifest 草稿不是当前 CSV 版本",
      detail: `草稿新鲜度：${draftFreshness.label || "需重生成"}。`,
      nextAction: "重新生成现场证据 manifest 草稿，再执行校验和刷新预检。",
    }));
  } else if (draftValidation.schemaValid === false) {
    blockers.push(buildV1ReleaseCandidateRefreshPrecheckBlocker({
      key: "field-evidence-draft-invalid",
      label: "现场证据 manifest 草稿结构异常",
      detail: "草稿结构不符合 V1 现场证据 manifest。",
      nextAction: "重新生成草稿或按模板修正后再校验。",
    }));
  } else if (draftValidation.ready !== true) {
    blockers.push(buildV1ReleaseCandidateRefreshPrecheckBlocker({
      key: "field-evidence-draft-blocked",
      label: "现场证据草稿校验未通过",
      detail: `证据 ${evidenceProgress}，签字 ${signoffProgress}，证据组 ${evidenceGroupsReadyLabel}。`,
      nextAction: "补齐真实生产、打印、司机真机、业务试跑证据和负责人签字。",
    }));
  }

  if (productionEnvGate.ready !== true) {
    blockers.push(buildV1ReleaseCandidateRefreshPrecheckBlocker({
      key: "production-env-preflight-blocked",
      label: "生产环境变量预检未通过",
      detail: `生产 env ${productionEnvGate.summary.readinessLabel || "0/10"} 通过，${productionEnvGate.summary.blockingCount} 项阻塞。`,
      nextAction: "先填写安全 env 文件，完成 env 文件审计和生产环境变量预检。",
    }));
  }

  if (productionGoLiveGate.ready !== true) {
    const firstBlockedStageDetail = productionGoLiveGate.summary.firstBlockedStageLabel
      ? `首个阶段：${productionGoLiveGate.summary.firstBlockedStageLabel}。`
      : "";
    blockers.push(buildV1ReleaseCandidateRefreshPrecheckBlocker({
      key: "production-go-live-combo-blocked",
      label: "当前生产上线组合预检未通过",
      detail: `生产上线组合门禁 ${productionGoLiveGate.summary.readinessLabel || "0/5"} 通过，${productionGoLiveGate.summary.blockerLabel || "1 项"} 阻塞。${firstBlockedStageDetail}`,
      nextAction: "先在当前 API 实例完成安全 env 文件审计、生产 env 预检、运行时 readiness 和生产 profile 确认。",
    }));
  }

  if (!isV1ProgressComplete(signoffProgress)) {
    blockers.push(buildV1ReleaseCandidateRefreshPrecheckBlocker({
      key: "signoff-incomplete",
      label: "负责人签字未完成",
      detail: `负责人签字 ${signoffProgress}。`,
      nextAction: "补齐办公室、仓库/出库、车间、司机、财务、技术/管理签字。",
    }));
  }

  if (!boundaryReady) {
    blockers.push(buildV1ReleaseCandidateRefreshPrecheckBlocker({
      key: "v1-v2-boundary-pending",
      label: "V1/V2 边界未确认",
      detail: `边界状态：${boundaryLabel || "待确认"}。`,
      nextAction: "负责人确认 V1 必做项和 V2 延后项，并填写确认人和时间。",
    }));
  }

  return blockers.slice(0, 8);
}

function buildV1ReleaseCandidateRefreshPrecheckBlocker({
  key,
  label,
  detail,
  nextAction,
}) {
  return {
    key: cleanServerText(key),
    label: sanitizeV1RoleTaskActionText(label),
    status: "blocked",
    blocking: true,
    detail: sanitizeV1RoleTaskActionText(detail),
    nextAction: sanitizeV1RoleTaskActionText(nextAction),
  };
}

function isV1ProgressComplete(value) {
  const text = cleanServerText(value);
  const match = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return false;
  const completed = Number(match[1]);
  const total = Number(match[2]);
  return total > 0 && completed >= total;
}

function formatV1DraftManifestStatusLabel(status) {
  if (status === "available") return "已生成";
  if (status === "invalid") return "草稿异常";
  return "未生成";
}

function buildV1ReleaseCandidateRefreshPrecheckSafeguards({
  draftManifestAvailable = false,
  draftFreshnessChecked = false,
  productionGoLivePrecheckIncluded = false,
} = {}) {
  return {
    nonMutating: true,
    refreshPrecheckOnly: true,
    draftManifestAvailable: Boolean(draftManifestAvailable),
    draftFreshnessChecked: Boolean(draftFreshnessChecked),
    productionGoLivePrecheckIncluded: Boolean(productionGoLivePrecheckIncluded),
    sourceManifestMutated: false,
    draftManifestMutated: false,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    rawEvidenceRefsIncluded: false,
    rawSignersIncluded: false,
    rawNotesIncluded: false,
    rawFieldEvidenceDraftManifestIncluded: false,
    digestValuesIncluded: false,
    rawProductionGoLivePrecheckIncluded: false,
    rawProductionEnvPreflightIncluded: false,
    rawEnvFileAuditIncluded: false,
    artifactPathExposed: false,
    localPathExposed: false,
    currentRuntimeChecked: Boolean(productionGoLivePrecheckIncluded),
    productionEnvAppliedToProcess: false,
    physicalPrinterCalled: false,
    environmentValuesIncluded: false,
    commandValuesIncluded: false,
    rawSecretsIncluded: false,
  };
}

async function refreshSystemV1ReleaseCandidate({ request, operatorId }) {
  const checkedAt = new Date().toISOString();
  const precheck = (await precheckSystemV1ReleaseCandidateRefresh({ request, operatorId })).body;
  if (precheck.ready !== true) {
    return {
      httpStatus: 409,
      body: buildV1ReleaseCandidateRefreshBlockedBody({ checkedAt, operatorId, precheck }),
    };
  }

  try {
    const artifactRoot = getV1GoLiveArtifactRoot();
    const result = await runV1ReleaseCandidateRefreshCommand({
      artifactRoot,
      apiBaseUrl: getCurrentV1ApiBaseUrl(request),
      operatorId,
      driverOperatorId: String(
        process.env.ERP_V1_RELEASE_DRIVER_OPERATOR_ID ||
          process.env.ERP_V1_FIELD_ACCEPTANCE_DRIVER_OPERATOR_ID ||
          process.env.ERP_V1_READINESS_DRIVER_OPERATOR_ID ||
          "U-DRIVER-A",
      ).trim(),
      envFiles: getConfiguredV1ProductionEnvApplicationFiles(),
    });
    return {
      httpStatus: 200,
      body: buildV1ReleaseCandidateRefreshSuccessBody({ checkedAt, operatorId, commandResult: result }),
    };
  } catch {
    return {
      httpStatus: 500,
      body: buildV1ReleaseCandidateRefreshErrorBody({ checkedAt, operatorId }),
    };
  }
}

function buildV1ReleaseCandidateRefreshBlockedBody({ checkedAt, operatorId, precheck = {} }) {
  const summary = isPlainServerObject(precheck.summary) ? precheck.summary : {};
  const blockers = Array.isArray(precheck.blockers)
    ? precheck.blockers.slice(0, 8).map((item) => ({
        key: cleanServerText(item.key),
        label: sanitizeV1RoleTaskActionText(item.label),
        status: cleanServerText(item.status) || "blocked",
        blocking: item.blocking !== false,
        detail: sanitizeV1RoleTaskActionText(item.detail),
        nextAction: sanitizeV1RoleTaskActionText(item.nextAction),
      }))
    : [];
  return {
    version: "p0-v1-release-candidate-refresh-v1",
    scope: "v1_release_candidate_refresh",
    status: "blocked_by_precheck",
    ready: false,
    checkedAt,
    operatorId,
    summary: {
      label: "未满足刷新 release candidate 条件",
      precheckStatus: cleanServerText(precheck.status) || "blocked",
      evidenceProgress: cleanServerText(summary.evidenceProgress) || "0/34",
      signoffProgress: cleanServerText(summary.signoffProgress) || "0/6",
      productionEnvPreflightLabel: cleanServerText(summary.productionEnvPreflightLabel) || "0/10",
      productionGoLiveReadinessLabel: cleanServerText(summary.productionGoLiveReadinessLabel) || "0/5",
      productionGoLiveBlockingCount: normalizeV1NonNegativeInteger(summary.productionGoLiveBlockingCount),
      productionGoLiveFirstBlockedStageKey: cleanServerText(summary.productionGoLiveFirstBlockedStageKey),
      productionGoLiveFirstBlockedStageLabel: sanitizeV1RoleTaskActionText(summary.productionGoLiveFirstBlockedStageLabel),
      productionGoLiveSourceStatuses: sanitizeV1ProductionEnvFileConfigSourceStatuses({
        sources: summary.productionGoLiveSourceStatuses,
      }),
      productionGoLiveReady: summary.productionGoLiveReady === true,
      boundaryLabel: cleanServerText(summary.boundaryLabel) || "待确认",
      blockerCount: normalizeV1NonNegativeInteger(summary.blockerCount, blockers.length),
      blockerShownCount: blockers.length,
      releaseCandidateRefreshAllowed: false,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
    blockers,
    nextAction: "先按预检阻塞项补齐生产 env、现场证据、负责人签字和 V1/V2 边界，再刷新 release candidate / go-live suite。",
    safeguards: buildV1ReleaseCandidateRefreshSafeguards({
      precheckReady: false,
      envFileCount: getConfiguredV1ProductionEnvApplicationFiles().length,
    }),
  };
}

function buildV1ReleaseCandidateRefreshSuccessBody({ checkedAt, operatorId, commandResult = {} }) {
  const summary = isPlainServerObject(commandResult.summary) ? commandResult.summary : {};
  const ready = commandResult.ready === true;
  return {
    version: "p0-v1-release-candidate-refresh-v1",
    scope: "v1_release_candidate_refresh",
    status: ready ? "ready_after_refresh" : "blocked_after_refresh",
    ready,
    checkedAt: cleanServerText(commandResult.generatedAt || commandResult.checkedAt) || checkedAt,
    operatorId,
    summary: {
      label: ready ? "release candidate / go-live suite 已刷新且门禁通过" : "release candidate / go-live suite 已刷新但仍阻塞",
      precheckStatus: "ready_to_refresh",
      releaseGateLabel: cleanServerText(summary.releaseCandidate),
      ownerDecision: cleanServerText(summary.ownerDecision),
      p0Prototype: cleanServerText(summary.p0Prototype),
      v1Readiness: cleanServerText(summary.v1Readiness),
      fieldEvidenceLabel: cleanServerText(summary.fieldEvidence),
      onsiteTaskCount: normalizeV1NonNegativeInteger(summary.onsiteTasks),
      v2DifferenceCount: normalizeV1NonNegativeInteger(summary.v2DifferenceCount),
      releaseCandidateRefreshAllowed: true,
      releaseCandidateRefreshed: true,
      goLiveSuiteRefreshed: true,
    },
    blockers: [],
    nextAction: ready
      ? "刷新完成；负责人仍需复核 release candidate、现场证据和签字记录后再宣布 V1 完成。"
      : "刷新完成但仍有上线阻塞；按最新 go-live suite 的阻塞清单继续处理。",
    safeguards: buildV1ReleaseCandidateRefreshSafeguards({
      precheckReady: true,
      releaseCandidateRefreshed: true,
      goLiveSuiteRefreshed: true,
      envFileCount: getConfiguredV1ProductionEnvApplicationFiles().length,
    }),
  };
}

function buildV1ReleaseCandidateRefreshErrorBody({ checkedAt, operatorId }) {
  return {
    version: "p0-v1-release-candidate-refresh-v1",
    scope: "v1_release_candidate_refresh",
    status: "refresh_failed",
    ready: false,
    checkedAt,
    operatorId,
    error: {
      code: "V1_RELEASE_CANDIDATE_REFRESH_FAILED",
      message: "刷新 release candidate / go-live suite 失败，命令输出已脱敏且未返回前端。",
    },
    summary: {
      label: "刷新 release candidate 失败",
      precheckStatus: "ready_to_refresh",
      releaseCandidateRefreshAllowed: true,
      releaseCandidateRefreshed: false,
      goLiveSuiteRefreshed: false,
    },
    blockers: [],
    nextAction: "由技术/管理在服务器日志中复核刷新命令失败原因，确认安全 env 文件、API 地址和现场证据草稿后再重试。",
    safeguards: buildV1ReleaseCandidateRefreshSafeguards({
      precheckReady: true,
      envFileCount: getConfiguredV1ProductionEnvApplicationFiles().length,
    }),
  };
}

function buildV1ReleaseCandidateRefreshSafeguards({
  precheckReady = false,
  releaseCandidateRefreshed = false,
  goLiveSuiteRefreshed = false,
  envFileCount = 0,
} = {}) {
  return {
    requestBodyIgnored: true,
    precheckRequired: true,
    precheckReady: Boolean(precheckReady),
    serverConfiguredEnvFileCount: normalizeV1NonNegativeInteger(envFileCount),
    frontendEnvFilePathAccepted: false,
    frontendTokenAccepted: false,
    commandArgsAcceptedFromRequest: false,
    sourceManifestMutated: false,
    draftManifestMutated: false,
    releaseCandidateRefreshed: Boolean(releaseCandidateRefreshed),
    goLiveSuiteRefreshed: Boolean(goLiveSuiteRefreshed),
    rawCommandStdoutIncluded: false,
    rawCommandStderrIncluded: false,
    rawEvidenceRefsIncluded: false,
    rawSignersIncluded: false,
    rawNotesIncluded: false,
    rawFieldEvidenceDraftManifestIncluded: false,
    rawProductionGoLivePrecheckIncluded: false,
    rawProductionEnvPreflightIncluded: false,
    rawEnvFileAuditIncluded: false,
    artifactPathExposed: false,
    localPathExposed: false,
    environmentValuesIncluded: false,
    commandValuesIncluded: false,
    rawSecretsIncluded: false,
  };
}

function getCurrentV1ApiBaseUrl(request) {
  const configured = String(process.env.ERP_V1_RELEASE_API_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  const host = String(request?.headers?.host || "").trim();
  if (host) return `http://${host}/api`;
  return "http://127.0.0.1:8787/api";
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

function sanitizeV1FieldEvidenceIntakeDraftManifestResult(result = {}, { operatorId, checkedAt } = {}) {
  const summary = isPlainServerObject(result.summary) ? result.summary : {};
  const invalidRows = Array.isArray(result.invalidRows)
    ? result.invalidRows.slice(0, 12).map(sanitizeV1FieldEvidenceDraftInvalidRow).filter(Boolean)
    : [];
  const outputWritten = result.files?.outputWritten === true;
  const invalidRowCount = normalizeV1NonNegativeInteger(summary.invalidRowCount);
  const status = cleanServerText(result.status) || (invalidRowCount > 0 ? "invalid" : outputWritten ? "blocked_draft_written" : "blocked");
  const ready = result.ready === true;
  return {
    version: "p0-v1-field-evidence-intake-draft-v1",
    scope: "v1_field_evidence_intake_draft_manifest",
    status,
    ready,
    checkedAt: checkedAt || new Date().toISOString(),
    generatedAt: cleanServerText(result.generatedAt),
    operatorId,
    summary: {
      appliedRowCount: normalizeV1NonNegativeInteger(summary.appliedRowCount),
      appliedEvidenceRowCount: normalizeV1NonNegativeInteger(summary.appliedEvidenceRowCount),
      appliedSignoffRowCount: normalizeV1NonNegativeInteger(summary.appliedSignoffRowCount),
      appliedBoundaryRowCount: normalizeV1NonNegativeInteger(summary.appliedBoundaryRowCount),
      skippedRowCount: normalizeV1NonNegativeInteger(summary.skippedRowCount),
      invalidRowCount,
      evidenceLabel: cleanServerText(summary.evidence),
      evidenceProgress: cleanServerText(summary.requiredEvidenceItems) || "0/34",
      signoffProgress: cleanServerText(summary.signoffs) || "0/6",
      boundaryStatus: cleanServerText(summary.boundary) || "pending",
      draftManifestStatus: outputWritten ? "available" : "not_written",
      inputSnapshot: isPlainServerObject(summary.inputSnapshot)
        ? {
            schema: cleanServerText(summary.inputSnapshot.schema),
            evidenceCsvIncluded: summary.inputSnapshot.evidenceCsvIncluded === true,
            evidenceRowCount: normalizeV1NonNegativeInteger(summary.inputSnapshot.evidenceRowCount),
            signoffBoundaryCsvIncluded: summary.inputSnapshot.signoffBoundaryCsvIncluded === true,
            signoffBoundaryRowCount: normalizeV1NonNegativeInteger(summary.inputSnapshot.signoffBoundaryRowCount),
            rawCsvIncluded: false,
            digestValuesIncluded: false,
          }
        : null,
      releaseCandidateRefreshed: false,
    },
    validation: {
      status: cleanServerText(result.validation?.status),
      ready: result.validation?.ready === true,
      label: cleanServerText(result.validation?.summary?.label),
    },
    invalidRows,
    invalidRowsShown: invalidRows.length,
    output: {
      draftWritten: outputWritten,
      draftManifestStatus: outputWritten ? "available" : "not_written",
      sourceManifestMutated: false,
      releaseCandidateRefreshed: false,
    },
    nextAction:
      invalidRowCount > 0
        ? "先按错误行提示修正 CSV，再重新生成 manifest 草稿。"
        : ready
          ? "草稿已生成且校验通过；下一步才能用安全 env 文件刷新 release candidate。"
          : "草稿已生成，但现场证据、负责人签字或 V1/V2 边界仍未完成，不能刷新为 READY。",
    safeguards: buildV1FieldEvidenceIntakeDraftSafeguards({ outputWritten }),
  };
}

function sanitizeV1FieldEvidenceDraftManifestValidationResult(
  validation = {},
  { operatorId, checkedAt, draftManifestAvailable = true, draftFreshness = null } = {},
) {
  const summary = isPlainServerObject(validation.summary) ? validation.summary : {};
  const groups = Array.isArray(validation.groups)
    ? validation.groups.slice(0, 8).map(sanitizeV1FieldEvidenceValidationGroup).filter(Boolean)
    : [];
  const signoffs = Array.isArray(validation.signoffs)
    ? validation.signoffs.slice(0, 8).map(sanitizeV1FieldEvidenceValidationSignoff).filter(Boolean)
    : [];
  const baseBlockers = Array.isArray(validation.blockers)
    ? validation.blockers.slice(0, 12).map(sanitizeV1FieldEvidenceValidationBlocker).filter(Boolean)
    : [];
  const freshness = isPlainServerObject(draftFreshness) ? draftFreshness : null;
  const freshnessReady = !draftManifestAvailable || freshness?.ready === true;
  const freshnessStatus = cleanServerText(freshness?.status) || (draftManifestAvailable ? "metadata_missing" : "missing");
  const freshnessLabel = cleanServerText(freshness?.label) || formatV1FieldEvidenceDraftFreshnessLabel(freshnessStatus);
  const freshnessBlocker =
    draftManifestAvailable && freshnessReady !== true
      ? sanitizeV1FieldEvidenceValidationBlocker({
          type: "draft_freshness",
          label: "现场证据草稿已过期或缺少输入快照",
          detail: `草稿新鲜度：${freshnessLabel}。`,
          nextAction: "重新生成现场证据 manifest 草稿后，再执行校验和刷新预检。",
        })
      : null;
  const blockers = [freshnessBlocker, ...baseBlockers].filter(Boolean).slice(0, 12);
  const requiredEvidenceItemsCompleted = normalizeV1NonNegativeInteger(summary.requiredEvidenceItemsCompleted);
  const requiredEvidenceItemsTotal = normalizeV1NonNegativeInteger(summary.requiredEvidenceItemsTotal);
  const requiredSignoffsCompleted = normalizeV1NonNegativeInteger(summary.requiredSignoffsCompleted);
  const requiredSignoffsTotal = normalizeV1NonNegativeInteger(summary.requiredSignoffsTotal);
  const evidenceGroupsReady = normalizeV1NonNegativeInteger(summary.evidenceGroupsReady);
  const evidenceGroupsTotal = normalizeV1NonNegativeInteger(summary.evidenceGroupsTotal);
  const blockingIssueCount =
    normalizeV1NonNegativeInteger(summary.blockingCount) + (freshnessBlocker ? 1 : 0);
  const schemaValid = validation.schemaValid !== false;
  const ready = validation.ready === true && freshnessReady;
  const status = !schemaValid
    ? "invalid"
    : ready
      ? "ready"
      : freshnessBlocker
        ? "stale"
        : "blocked";
  return {
    version: "p0-v1-field-evidence-draft-validation-v1",
    scope: "v1_field_evidence_draft_manifest_validation",
    status,
    ready,
    schemaValid,
    checkedAt: checkedAt || new Date().toISOString(),
    operatorId,
    summary: {
      label: cleanServerText(summary.label),
      evidenceProgress: `${requiredEvidenceItemsCompleted}/${requiredEvidenceItemsTotal || 34}`,
      signoffProgress: `${requiredSignoffsCompleted}/${requiredSignoffsTotal || 6}`,
      evidenceGroupsReadyLabel: `${evidenceGroupsReady}/${evidenceGroupsTotal || 6}`,
      blockingIssueCount,
      blockerShownCount: blockers.length,
      draftManifestStatus: draftManifestAvailable ? "available" : "missing",
      draftFreshnessStatus: freshnessStatus,
      draftFreshnessLabel: freshnessLabel,
      draftFreshnessReady: freshnessReady,
      releaseCandidateRefreshed: false,
    },
    blockers,
    groups,
    signoffs,
    boundary: sanitizeV1FieldEvidenceValidationBoundary(validation.boundary),
    nextAction: ready
      ? "草稿校验已通过；下一步必须使用安全 env 文件刷新 release candidate 并复核上线门禁。"
      : freshnessBlocker
        ? "草稿结构可读，但不是当前 CSV 生成的版本；请重新生成草稿后再校验。"
      : schemaValid
        ? "草稿格式可读，但现场证据、负责人签字或 V1/V2 边界仍未完成，不能刷新为 READY。"
        : "草稿格式不符合 V1 现场证据 manifest 结构，需重新生成或修正后再校验。",
    safeguards: buildV1FieldEvidenceDraftValidationSafeguards({ draftManifestAvailable }),
  };
}

function sanitizeV1FieldEvidenceValidationGroup(value = {}) {
  if (!isPlainServerObject(value)) return null;
  return {
    label: cleanServerText(value.label),
    ownerRole: cleanServerText(value.ownerRole),
    status: cleanServerText(value.status) || (value.ready === true ? "ready" : "blocked"),
    ready: value.ready === true,
    progress: `${normalizeV1NonNegativeInteger(value.completedRequired)}/${normalizeV1NonNegativeInteger(value.requiredTotal)}`,
    blockedRequired: normalizeV1NonNegativeInteger(value.blockedRequired),
  };
}

function sanitizeV1FieldEvidenceValidationSignoff(value = {}) {
  if (!isPlainServerObject(value)) return null;
  return {
    role: cleanServerText(value.role),
    status: cleanServerText(value.status),
    ready: value.blocking !== true,
    signerFilled: value.signerFilled === true,
    signedAtFilled: value.signedAtFilled === true,
  };
}

function sanitizeV1FieldEvidenceValidationBoundary(value = {}) {
  if (!isPlainServerObject(value)) {
    return {
      status: "pending",
      label: "待确认",
      ready: false,
    };
  }
  const status = cleanServerText(value.status) || "pending";
  const ready = value.blocking !== true;
  return {
    status,
    label: status === "confirmed" && ready ? "已确认" : "待确认",
    ready,
    confirmedByFilled: value.confirmedByFilled === true,
    confirmedAtFilled: value.confirmedAtFilled === true,
  };
}

function sanitizeV1FieldEvidenceValidationBlocker(value = {}) {
  if (!isPlainServerObject(value)) return null;
  return {
    type: cleanServerText(value.type),
    groupLabel: cleanServerText(value.groupLabel),
    label: cleanServerText(value.label),
    status: cleanServerText(value.status),
    reason: cleanServerText(value.reason),
    nextAction: formatV1FieldEvidenceValidationBlockerAction(value),
  };
}

function formatV1FieldEvidenceValidationBlockerAction(value = {}) {
  const type = cleanServerText(value.type);
  if (type === "draft_freshness") return "重新生成现场证据 manifest 草稿后，再执行草稿校验。";
  if (type === "signoff") return "补负责人签字人和签字时间。";
  if (type === "v1_v2_boundary") return "补 V1/V2 边界确认人和确认时间。";
  if (type === "schema") return "重新生成草稿或按 manifest 模板修正结构。";
  return "补现场证据状态和证据编号。";
}

function sanitizeV1FieldEvidenceDraftInvalidRow(value = {}) {
  if (!isPlainServerObject(value)) return null;
  return {
    type: cleanServerText(value.type),
    row: normalizeV1NonNegativeInteger(value.row),
    groupKey: cleanServerText(value.groupKey),
    itemKey: cleanServerText(value.itemKey),
    reason: cleanServerText(value.reason),
    fixHint: cleanServerText(value.fixHint),
  };
}

function buildV1FieldEvidenceIntakeDraftSafeguards({ outputWritten = false } = {}) {
  return {
    sourceManifestMutated: false,
    outputWritesDraftOnly: true,
    outputWritten: Boolean(outputWritten),
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    rawEvidenceRefsIncluded: false,
    rawSignersIncluded: false,
    rawNotesIncluded: false,
    rawCsvIncluded: false,
    rawFieldEvidenceDraftManifestIncluded: false,
    inputSnapshotWritten: Boolean(outputWritten),
    digestValuesIncluded: false,
    artifactPathExposed: false,
    localPathExposed: false,
    environmentValuesIncluded: false,
    commandValuesIncluded: false,
    rawSecretsIncluded: false,
  };
}

function buildV1FieldEvidenceStageRowErrorBody({ checkedAt, operatorId, error = {}, row = null } = {}) {
  return {
    version: "p0-v1-field-evidence-intake-stage-row-v1",
    scope: "v1_field_evidence_intake_stage_row",
    status: "invalid",
    ready: false,
    checkedAt: checkedAt || new Date().toISOString(),
    operatorId,
    error: {
      code: cleanServerText(error.code) || "V1_FIELD_EVIDENCE_STAGE_ROW_INVALID",
      message: cleanServerText(error.message) || "现场证据草稿行无效。",
    },
    row,
    summary: {
      rowType: row?.type || "",
      rowLabel: row?.label || "",
      rowStatus: row?.status || "",
      csvUpdated: false,
      draftWritten: false,
      evidenceProgress: "0/34",
      signoffProgress: "0/6",
      boundaryLabel: "待确认",
      invalidRowCount: 1,
      releaseCandidateRefreshed: false,
    },
    draftManifest: null,
    nextAction: "按页面提示补齐状态、证据编号、签字人和时间后再保存草稿行。",
    safeguards: buildV1FieldEvidenceStageRowSafeguards({ csvUpdated: false, draftWritten: false }),
  };
}

function buildV1FieldEvidenceStageRowCloseout(signoffBoundaryCsv = "", fallback = {}) {
  const signoffSummary = summarizeV1FieldEvidenceIntakeSignoffRows(signoffBoundaryCsv);
  const validationSummary = isPlainServerObject(fallback.summary) ? fallback.summary : {};
  const validationBoundary = isPlainServerObject(fallback.boundary) ? fallback.boundary : null;
  const validationSignoffRows = normalizeV1NonNegativeInteger(validationSummary.requiredSignoffsTotal);
  const validationCompletedSignoffRows = normalizeV1NonNegativeInteger(validationSummary.requiredSignoffsCompleted);
  const signoffRows = validationSignoffRows || signoffSummary.signoffRows;
  const completedSignoffRows = validationSignoffRows ? validationCompletedSignoffRows : signoffSummary.completedSignoffRows;
  const boundaryReady = validationBoundary ? validationBoundary.blocking === false : signoffSummary.boundaryReady;
  const boundaryStatus = validationBoundary ? cleanServerText(validationBoundary.status) || "pending" : signoffSummary.boundaryStatus;
  const boundaryLabel = boundaryReady ? "已确认" : boundaryStatus === "blocked" ? "已阻塞" : "待确认";
  const signoffBoundaryActions = parseV1FieldEvidenceSignoffBoundaryActions(signoffBoundaryCsv, fallback);
  const missingSignoffRows = Math.max(
    0,
    signoffRows - completedSignoffRows,
  );
  const actionCount =
    normalizeV1NonNegativeInteger(signoffBoundaryActions.totalCount) ||
    missingSignoffRows + (boundaryReady ? 0 : 1);
  const ready =
    signoffRows > 0 &&
    missingSignoffRows === 0 &&
    boundaryReady &&
    signoffSummary.invalidSignoffRows === 0;
  const actions = signoffBoundaryActions.items.slice(0, 5);
  const signoffBoundarySummary = buildV1SignoffBoundarySummaryForStatus({
    boundary: {
      ready: boundaryReady,
      status: boundaryStatus,
    },
    actions,
    actionCount,
    actionShownCount: actions.length,
    requiredSignoffsTotal: signoffRows,
    requiredSignoffsCompleted: completedSignoffRows,
  });
  return {
    status: ready ? "ready" : "blocked",
    ready,
    signoffProgress: `${completedSignoffRows}/${signoffRows}`,
    missingSignoffRows,
    invalidSignoffRows: signoffSummary.invalidSignoffRows,
    boundaryStatus,
    boundaryLabel,
    boundaryReady,
    actionCount,
    actionShownCount: actions.length,
    actions,
    signoffBoundarySummary,
    nextAction: ready
      ? "签字和 V1/V2 边界草稿已满足；继续校验证据草稿和刷新预检。"
      : missingSignoffRows > 0
        ? `还差 ${missingSignoffRows} 个负责人签字；先处理下方签字/边界待办。`
        : boundaryReady
          ? "签字 / 边界仍有无效行；按提示补齐人员和时间后再保存。"
          : "负责人确认 V1 必做项和 V2 延后项后，补齐 V1/V2 边界确认人和时间。",
    safeguards: {
      rawSignersIncluded: false,
      rawNotesIncluded: false,
      rawCsvIncluded: false,
      artifactPathExposed: false,
      localPathExposed: false,
    },
  };
}

function buildV1FieldEvidenceStageRowEvidenceCloseout(fieldEvidenceCsv = "", fallback = {}) {
  const evidenceSummary = summarizeV1FieldEvidenceIntakeRows(fieldEvidenceCsv);
  const validationSummary = isPlainServerObject(fallback.summary) ? fallback.summary : {};
  const validationRequiredEvidenceRows = normalizeV1NonNegativeInteger(validationSummary.requiredEvidenceItemsTotal);
  const validationCompletedEvidenceRows = normalizeV1NonNegativeInteger(validationSummary.requiredEvidenceItemsCompleted);
  const requiredEvidenceRows = validationRequiredEvidenceRows || evidenceSummary.requiredEvidenceRows;
  const completedEvidenceRows = validationRequiredEvidenceRows
    ? validationCompletedEvidenceRows
    : evidenceSummary.completedEvidenceRows;
  const missingItems = parseV1FieldEvidenceMissingItems(fieldEvidenceCsv, fallback);
  const missingEvidenceRows = Math.max(
    0,
    requiredEvidenceRows - completedEvidenceRows,
  );
  const actionCount = normalizeV1NonNegativeInteger(missingItems.totalCount) || missingEvidenceRows;
  const ready =
    requiredEvidenceRows > 0 &&
    missingEvidenceRows === 0 &&
    evidenceSummary.invalidEvidenceRows === 0;
  const actions = missingItems.items.slice(0, 5);
  return {
    status: ready ? "ready" : "blocked",
    ready,
    evidenceProgress: `${completedEvidenceRows}/${requiredEvidenceRows}`,
    requiredEvidenceRows,
    completedEvidenceRows,
    filledEvidenceRows: evidenceSummary.filledEvidenceRows,
    missingEvidenceRows,
    invalidEvidenceRows: evidenceSummary.invalidEvidenceRows,
    blockedEvidenceRows: evidenceSummary.blockedEvidenceRows,
    notApplicableEvidenceRows: evidenceSummary.notApplicableEvidenceRows,
    actionCount,
    actionShownCount: actions.length,
    actions,
    nextAction: ready
      ? "现场证据草稿已满足；继续补负责人签字、V1/V2 边界并刷新预检。"
      : evidenceSummary.invalidEvidenceRows > 0
        ? `还有 ${evidenceSummary.invalidEvidenceRows} 条证据行状态和证据编号不匹配；按提示修正后再保存。`
        : missingEvidenceRows > 0
          ? `还差 ${missingEvidenceRows} 条现场证据；先处理下方证据待办。`
          : "现场证据仍有阻塞项；按证据待办补材料或确认状态。",
    safeguards: {
      rawEvidenceRefsIncluded: false,
      rawNotesIncluded: false,
      rawCsvIncluded: false,
      artifactPathExposed: false,
      localPathExposed: false,
    },
  };
}

function buildV1FieldEvidenceStageRowSafeguards({ csvUpdated = false, draftWritten = false } = {}) {
  return {
    csvUpdated: Boolean(csvUpdated),
    draftManifestWritten: Boolean(draftWritten),
    sourceManifestMutated: false,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    rawEvidenceRefsIncluded: false,
    rawSignersIncluded: false,
    rawNotesIncluded: false,
    rawCsvIncluded: false,
    rawFieldEvidenceDraftManifestIncluded: false,
    artifactPathExposed: false,
    localPathExposed: false,
    environmentValuesIncluded: false,
    commandValuesIncluded: false,
    rawSecretsIncluded: false,
  };
}

function stageV1FieldEvidenceCsvRow({ csvPath, payload }) {
  const groupKey = cleanServerText(payload.groupKey);
  const itemKey = cleanServerText(payload.itemKey);
  const onsiteStatus = cleanServerText(payload.onsiteStatus || payload.status || "pending");
  const onsiteEvidenceRef = cleanV1FieldEvidenceStageValue(payload.onsiteEvidenceRef);
  const onsiteNotes = cleanV1FieldEvidenceStageValue(payload.onsiteNotes);

  if (!groupKey || !itemKey) {
    return v1FieldEvidenceStageInvalid("V1_FIELD_EVIDENCE_STAGE_EVIDENCE_KEY_MISSING", "必须选择现场证据项。");
  }
  if (!["pending", "passed", "accepted", "blocked", "not_applicable"].includes(onsiteStatus)) {
    return v1FieldEvidenceStageInvalid("V1_FIELD_EVIDENCE_STAGE_EVIDENCE_STATUS_INVALID", "证据状态只能是 pending、passed、accepted、blocked 或 not_applicable。");
  }
  if (["passed", "accepted"].includes(onsiteStatus) && !onsiteEvidenceRef) {
    return v1FieldEvidenceStageInvalid("V1_FIELD_EVIDENCE_STAGE_EVIDENCE_REF_REQUIRED", "passed / accepted 必须填写证据编号、截图文件名或内部归档编号。");
  }
  if (hasV1FieldEvidenceStageSensitiveMarker(onsiteEvidenceRef) || hasV1FieldEvidenceStageSensitiveMarker(onsiteNotes)) {
    return v1FieldEvidenceStageInvalid("V1_FIELD_EVIDENCE_STAGE_SENSITIVE_VALUE", "草稿行不能包含连接串、密钥、命令路径、spool 路径或 token。");
  }

  const csv = readV1MutableCsv(csvPath);
  const rowIndex = csv.rows.findIndex((row) =>
    cleanServerText(row.groupKey) === groupKey && cleanServerText(row.itemKey) === itemKey
  );
  if (rowIndex < 0) {
    return v1FieldEvidenceStageInvalid("V1_FIELD_EVIDENCE_STAGE_EVIDENCE_ROW_NOT_FOUND", "采集包里找不到该证据项，请先刷新现场证据采集包。");
  }

  const row = csv.rows[rowIndex];
  row.onsiteStatus = onsiteStatus;
  row.onsiteEvidenceRef = onsiteEvidenceRef;
  row.onsiteNotes = onsiteNotes;
  writeV1MutableCsv(csvPath, csv);

  return {
    ok: true,
    row: {
      type: "evidence",
      row: rowIndex + 2,
      key: itemKey,
      groupKey,
      itemKey,
      groupLabel: cleanServerText(row.groupLabel),
      label: cleanServerText(row.itemLabel),
      ownerRole: cleanServerText(row.ownerRole),
      status: onsiteStatus,
      evidenceRefFilled: Boolean(onsiteEvidenceRef),
      notesFilled: Boolean(onsiteNotes),
    },
  };
}

function stageV1SignoffBoundaryCsvRow({ csvPath, payload }) {
  const rowType = cleanServerText(payload.rowType);
  const role = cleanServerText(payload.role || (rowType === "boundary" ? "v1_v2_boundary" : ""));
  const onsiteStatus = cleanServerText(payload.onsiteStatus || payload.status || "pending");
  const onsiteSigner = cleanV1FieldEvidenceStageValue(payload.onsiteSigner);
  const onsiteSignedAt = cleanV1FieldEvidenceStageValue(payload.onsiteSignedAt);
  const onsiteConfirmedBy = cleanV1FieldEvidenceStageValue(payload.onsiteConfirmedBy);
  const onsiteConfirmedAt = cleanV1FieldEvidenceStageValue(payload.onsiteConfirmedAt);
  const onsiteNotes = cleanV1FieldEvidenceStageValue(payload.onsiteNotes);

  if (!role) {
    return v1FieldEvidenceStageInvalid("V1_FIELD_EVIDENCE_STAGE_SIGNOFF_ROLE_MISSING", "必须选择签字角色或边界确认项。");
  }
  if (rowType === "signoff" && !["pending", "signed", "accepted", "blocked"].includes(onsiteStatus)) {
    return v1FieldEvidenceStageInvalid("V1_FIELD_EVIDENCE_STAGE_SIGNOFF_STATUS_INVALID", "签字状态只能是 pending、signed、accepted 或 blocked。");
  }
  if (rowType === "boundary" && !["pending", "confirmed", "blocked"].includes(onsiteStatus)) {
    return v1FieldEvidenceStageInvalid("V1_FIELD_EVIDENCE_STAGE_BOUNDARY_STATUS_INVALID", "边界状态只能是 pending、confirmed 或 blocked。");
  }
  if (rowType === "signoff" && ["signed", "accepted"].includes(onsiteStatus) && (!onsiteSigner || !onsiteSignedAt)) {
    return v1FieldEvidenceStageInvalid("V1_FIELD_EVIDENCE_STAGE_SIGNOFF_FIELDS_REQUIRED", "signed / accepted 必须填写签字人和签字时间。");
  }
  if (rowType === "boundary" && onsiteStatus === "confirmed" && (!onsiteConfirmedBy || !onsiteConfirmedAt)) {
    return v1FieldEvidenceStageInvalid("V1_FIELD_EVIDENCE_STAGE_BOUNDARY_FIELDS_REQUIRED", "confirmed 必须填写确认人和确认时间。");
  }
  if (
    hasV1FieldEvidenceStageSensitiveMarker(onsiteSigner) ||
    hasV1FieldEvidenceStageSensitiveMarker(onsiteSignedAt) ||
    hasV1FieldEvidenceStageSensitiveMarker(onsiteConfirmedBy) ||
    hasV1FieldEvidenceStageSensitiveMarker(onsiteConfirmedAt) ||
    hasV1FieldEvidenceStageSensitiveMarker(onsiteNotes)
  ) {
    return v1FieldEvidenceStageInvalid("V1_FIELD_EVIDENCE_STAGE_SENSITIVE_VALUE", "草稿行不能包含连接串、密钥、命令路径、spool 路径或 token。");
  }

  const csv = readV1MutableCsv(csvPath);
  const rowIndex = csv.rows.findIndex((row) =>
    cleanServerText(row.recordType) === rowType && cleanServerText(row.role) === role
  );
  if (rowIndex < 0) {
    return v1FieldEvidenceStageInvalid("V1_FIELD_EVIDENCE_STAGE_SIGNOFF_ROW_NOT_FOUND", "采集包里找不到该签字或边界确认项，请先刷新现场证据采集包。");
  }

  const row = csv.rows[rowIndex];
  row.onsiteStatus = onsiteStatus;
  row.onsiteNotes = onsiteNotes;
  if (rowType === "signoff") {
    row.onsiteSigner = onsiteSigner;
    row.onsiteSignedAt = onsiteSignedAt;
  } else {
    row.onsiteConfirmedBy = onsiteConfirmedBy;
    row.onsiteConfirmedAt = onsiteConfirmedAt;
  }
  writeV1MutableCsv(csvPath, csv);

  return {
    ok: true,
    row: {
      type: rowType,
      row: rowIndex + 2,
      key: role,
      role,
      label: cleanServerText(row.label || role),
      status: onsiteStatus,
      personFilled: rowType === "boundary" ? Boolean(onsiteConfirmedBy) : Boolean(onsiteSigner),
      timeFilled: rowType === "boundary" ? Boolean(onsiteConfirmedAt) : Boolean(onsiteSignedAt),
      notesFilled: Boolean(onsiteNotes),
    },
  };
}

function v1FieldEvidenceStageInvalid(code, message) {
  return {
    ok: false,
    httpStatus: 422,
    error: {
      code,
      message,
    },
    row: null,
  };
}

function cleanV1FieldEvidenceStageValue(value) {
  return String(value || "").replace(/\r?\n/g, " ").trim().slice(0, 160);
}

function hasV1FieldEvidenceStageSensitiveMarker(value) {
  return /postgres:\/\/|mysql:\/\/|mongodb:\/\/|AKIA[0-9A-Z_]{8,}|secret|password|passwd|access[_-]?key|\/var\/spool|\/usr\/bin\/lp|token/i.test(
    String(value || ""),
  );
}

function readV1MutableCsv(path) {
  const records = parseV1MutableCsvRecords(readFileSync(path, "utf8"));
  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0].map((header) => cleanServerText(header));
  const rows = records
    .slice(1)
    .filter((record) => record.some((entry) => cleanServerText(entry)))
    .map((record) => {
      const row = {};
      headers.forEach((header, index) => {
        if (header) row[header] = cleanServerText(record[index]);
      });
      return row;
    });
  return { headers, rows };
}

function writeV1MutableCsv(path, csv) {
  const lines = [
    csv.headers.map(formatV1MutableCsvCell).join(","),
    ...csv.rows.map((row) =>
      csv.headers.map((header) => formatV1MutableCsvCell(row[header] ?? "")).join(",")
    ),
  ];
  writeFileSync(path, `${lines.join("\n")}\n`);
}

function parseV1MutableCsvRecords(text) {
  const records = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < String(text || "").length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char === "\r") continue;
    cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    records.push(row);
  }
  return records;
}

function formatV1MutableCsvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildV1FieldEvidenceDraftValidationSafeguards({ draftManifestAvailable = true } = {}) {
  return {
    draftManifestAvailable: Boolean(draftManifestAvailable),
    sourceManifestMutated: false,
    draftManifestMutated: false,
    releaseCandidateRefreshed: false,
    goLiveSuiteRefreshed: false,
    rawEvidenceRefsIncluded: false,
    rawSignersIncluded: false,
    rawNotesIncluded: false,
    rawFieldEvidenceDraftManifestIncluded: false,
    fieldEvidenceDraftFreshnessChecked: true,
    digestValuesIncluded: false,
    artifactPathExposed: false,
    localPathExposed: false,
    environmentValuesIncluded: false,
    commandValuesIncluded: false,
    rawSecretsIncluded: false,
  };
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

function normalizeV1GoLiveStatus(value) {
  const status = cleanServerText(value);
  if (["ready", "blocked"].includes(status)) return status;
  return "blocked";
}

function sanitizeV1GoLiveSummary(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  return {
    label: cleanServerText(source.label) || "V1 完成度快照：BLOCKED",
    requirements: cleanServerText(source.requirements) || "85-90%",
    p0Prototype: cleanServerText(source.p0Prototype) || "97-98%",
    v1Readiness: cleanServerText(source.v1Readiness) || "80-83%",
    releaseGate: cleanServerText(source.releaseGate || source.releaseCandidate) || "0/4 发布门禁通过",
    runtimeReadiness: cleanServerText(source.runtimeReadiness) || "",
    fieldEvidence: cleanServerText(source.fieldEvidence) || "",
    fieldAcceptance: cleanServerText(source.fieldAcceptance) || "",
    onsiteTaskCount: normalizeV1NonNegativeInteger(source.onsiteTaskCount ?? source.onsiteTasks),
    v2DifferenceCount: normalizeV1NonNegativeInteger(source.v2DifferenceCount),
  };
}

function sanitizeV1ReleaseCandidate(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const summary = isPlainServerObject(source.summary) ? source.summary : {};
  return {
    status: normalizeV1GoLiveStatus(source.status),
    ready: Boolean(source.ready),
    summary: {
      label: cleanServerText(summary.label) || "0/4 发布门禁通过",
      passedGateCount: normalizeV1NonNegativeInteger(summary.passedGateCount),
      totalGateCount: normalizeV1NonNegativeInteger(summary.totalGateCount),
      blockingCount: normalizeV1NonNegativeInteger(summary.blockingCount),
      envPreflight: cleanServerText(summary.envPreflight),
      fieldEvidence: cleanServerText(summary.fieldEvidence),
      runtimeReadiness: cleanServerText(summary.runtimeReadiness),
      fieldAcceptance: cleanServerText(summary.fieldAcceptance),
    },
    gates: Array.isArray(source.gates)
      ? source.gates.map(sanitizeV1ReleaseGate).filter(Boolean)
      : [],
  };
}

function sanitizeV1ReleaseGate(value = {}) {
  if (!isPlainServerObject(value)) return null;
  return {
    key: cleanServerText(value.key),
    label: cleanServerText(value.label),
    status: normalizeV1GoLiveStatus(value.status),
    ready: Boolean(value.ready),
    summary: cleanServerText(value.summary),
    detail: cleanServerText(value.detail),
  };
}

function buildV1CompletionAudit({
  ready = false,
  summary = {},
  releaseCandidate = {},
  ownerDecisionBrief = {},
  runtimeReadinessBlockers = {},
  fieldAcceptanceReport = {},
  productionEnvGate = {},
  fieldEvidenceProgress = {},
  roleTaskBoard = {},
  v1V2BoundaryBrief = {},
} = {}) {
  const fieldSummary = isPlainServerObject(fieldEvidenceProgress.summary)
    ? fieldEvidenceProgress.summary
    : {};
  const evidenceTotal = normalizeV1NonNegativeInteger(fieldSummary.requiredEvidenceItemsTotal);
  const evidenceCompleted = normalizeV1NonNegativeInteger(fieldSummary.requiredEvidenceItemsCompleted);
  const signoffTotal = normalizeV1NonNegativeInteger(fieldSummary.requiredSignoffsTotal);
  const signoffCompleted = normalizeV1NonNegativeInteger(fieldSummary.requiredSignoffsCompleted);
  const evidenceReady = evidenceTotal > 0 && evidenceCompleted >= evidenceTotal;
  const signoffReady = signoffTotal > 0 && signoffCompleted >= signoffTotal;
  const boundaryReady = Boolean(fieldEvidenceProgress.boundary?.ready || v1V2BoundaryBrief.ready);
  const v2DifferenceCount =
    normalizeV1NonNegativeInteger(v1V2BoundaryBrief.summary?.v2DifferenceCount) ||
    normalizeV1NonNegativeInteger(summary.v2DifferenceCount);
  const v1MustContinueCount =
    normalizeV1NonNegativeInteger(v1V2BoundaryBrief.summary?.v1MustContinueCount);
  const releaseCandidateGaps = buildV1CompletionProofGapsFromItems(releaseCandidate.gates);
  const productionEnvGaps = buildV1CompletionProofGapsFromItems(productionEnvGate.checks);
  const runtimeReadinessGaps = buildV1CompletionProofGapsFromItems(runtimeReadinessBlockers.blockers);
  const fieldAcceptanceGaps = buildV1CompletionProofGapsFromItems(fieldAcceptanceReport.blockingCriteria);
  const fieldEvidenceGaps = buildV1CompletionFieldEvidenceGaps(fieldEvidenceProgress);
  const ownerSignoffGaps = buildV1CompletionOwnerSignoffGaps(fieldEvidenceProgress);
  const boundaryGaps = buildV1CompletionBoundaryGaps(fieldEvidenceProgress, v1V2BoundaryBrief);
  const criteria = [
    buildV1CompletionAuditCriterion({
      key: "release_candidate",
      label: "发布候选门禁",
      ready: releaseCandidate.ready === true,
      evidenceLabel: cleanServerText(releaseCandidate.summary?.label) || "0/4 发布门禁通过",
      current: cleanServerText(releaseCandidate.summary?.label) || cleanServerText(summary.releaseGate),
      proofRequirements: [
        "发布候选报告显示 4/4 发布门禁通过。",
        "受控刷新候选结果为 ready，且没有生产 env、运行时、现场证据、签字或边界阻塞。",
      ],
      proofGaps: releaseCandidateGaps,
      nextAction: releaseCandidate.ready === true
        ? "发布候选已通过；进入负责人最终复核。"
        : "先补齐生产 env、运行时门禁、现场证据、签字和 V1/V2 边界，再刷新发布候选。",
    }),
    buildV1CompletionAuditCriterion({
      key: "production_env",
      label: "生产环境配置",
      ready: productionEnvGate.ready === true,
      evidenceLabel:
        cleanServerText(productionEnvGate.summary?.readinessLabel) ||
        cleanServerText(productionEnvGate.summary?.label) ||
        "生产 env 未通过",
      current: cleanServerText(productionEnvGate.summary?.label),
      proofRequirements: [
        "生产 env 文件安全审计通过。",
        "PostgreSQL、对象存储、打印 command_bridge、CUPS 和 readiness 账号变量预检通过。",
        "生产上线组合预检四阶段通过。",
      ],
      proofGaps: productionEnvGaps,
      nextAction: cleanServerText(productionEnvGate.nextAction) ||
        "补齐生产 env 文件、PostgreSQL、对象存储、打印和 CUPS 变量后重新预检。",
    }),
    buildV1CompletionAuditCriterion({
      key: "runtime_readiness",
      label: "运行时 V1 门禁",
      ready: runtimeReadinessBlockers.ready === true,
      evidenceLabel:
        cleanServerText(runtimeReadinessBlockers.summary?.readinessLabel) ||
        cleanServerText(summary.runtimeReadiness) ||
        "运行时未通过",
      current: cleanServerText(runtimeReadinessBlockers.summary?.label),
      proofRequirements: [
        "运行中 API 的 V1 readiness 达到 11/11 通过。",
        "系统持久化、附件留档、打印 V1 门禁和司机真机 readiness 均通过。",
      ],
      proofGaps: runtimeReadinessGaps,
      nextAction: cleanServerText(runtimeReadinessBlockers.nextAction) ||
        "处理持久化、附件、打印和司机真机阻塞后重新跑 runtime readiness。",
    }),
    buildV1CompletionAuditCriterion({
      key: "field_acceptance",
      label: "现场验收报告",
      ready: fieldAcceptanceReport.ready === true,
      evidenceLabel:
        cleanServerText(fieldAcceptanceReport.summary?.label) ||
        cleanServerText(summary.fieldAcceptance) ||
        "现场验收未通过",
      current: cleanServerText(fieldAcceptanceReport.conclusion),
      proofRequirements: [
        "现场验收报告显示全部模块验收通过。",
        "生产持久化、附件留档、打印设备、司机真机和业务试跑均有现场留档。",
      ],
      proofGaps: fieldAcceptanceGaps,
      nextAction:
        sanitizeStringList(fieldAcceptanceReport.nextActions)[0] ||
        "补齐现场验收报告里的阻塞项和必需留档。",
    }),
    buildV1CompletionAuditCriterion({
      key: "field_evidence",
      label: "现场证据",
      ready: evidenceReady,
      evidenceLabel: fieldSummary.evidenceItemsLabel || `${evidenceCompleted}/${evidenceTotal}`,
      current:
        cleanServerText(fieldSummary.evidenceLabel) ||
        cleanServerText(summary.fieldEvidence) ||
        "现场证据仍未完成",
      proofRequirements: [
        "34 项真实现场证据全部回填并通过草稿校验。",
        "证据来自真实现场附件、记录或签单，不使用占位值。",
      ],
      proofGaps: fieldEvidenceGaps,
      nextAction: evidenceReady
        ? "现场证据已满足；继续确认签字和 V1/V2 边界。"
        : "补齐 34 项真实现场证据并回填 evidence-items.csv / 附件引用。",
    }),
    buildV1CompletionAuditCriterion({
      key: "owner_signoff",
      label: "负责人签字",
      ready: signoffReady,
      evidenceLabel: fieldSummary.signoffLabel || `${signoffCompleted}/${signoffTotal}`,
      current: signoffReady ? "负责人签字已满足" : "负责人签字未完成",
      proofRequirements: [
        "6 个负责人签字均有签字人和签字时间。",
        "签字建立在真实现场证据复核之后。",
      ],
      proofGaps: ownerSignoffGaps,
      nextAction: signoffReady
        ? "签字已满足；继续复核 V1/V2 边界和发布候选。"
        : "负责人复核真实证据后补齐签字人和签字时间。",
    }),
    buildV1CompletionAuditCriterion({
      key: "v1_v2_boundary",
      label: "V1/V2 边界确认",
      ready: boundaryReady,
      evidenceLabel: cleanServerText(v1V2BoundaryBrief.summary?.label) ||
        (boundaryReady ? "已确认" : "待确认"),
      current: cleanServerText(v1V2BoundaryBrief.conclusion),
      proofRequirements: [
        "负责人已确认 V1 必做项不能后移到 V2。",
        "V1/V2 边界确认人和确认时间已回填，并通过边界预检。",
      ],
      proofGaps: boundaryGaps,
      nextAction: boundaryReady
        ? "V1/V2 边界已确认；继续刷新发布候选。"
        : "负责人确认 V1 必做项和 V2 延后项，填写确认人和确认时间。",
    }),
  ];
  const passedCriteriaCount = criteria.filter((criterion) => criterion.ready).length;
  const blockingCriteria = criteria.filter((criterion) => !criterion.ready);
  const onsiteTaskCount =
    normalizeV1NonNegativeInteger(roleTaskBoard.summary?.taskCount) ||
    normalizeV1NonNegativeInteger(ownerDecisionBrief.completion?.onsiteTaskCount) ||
    normalizeV1NonNegativeInteger(summary.onsiteTaskCount);
  return {
    status: ready ? "ready" : "blocked",
    ready: Boolean(ready),
    canDeclareV1Complete: Boolean(ready),
    summary: {
      label: ready
        ? "V1 完成审计：可以进入负责人最终确认"
        : "V1 完成审计：仍不能宣布完成",
      criteriaCount: criteria.length,
      passedCriteriaCount,
      blockingCriteriaCount: blockingCriteria.length,
      blockingCriteriaLabel: `${blockingCriteria.length}/${criteria.length}`,
      onsiteTaskCount,
      onsiteTaskLabel: onsiteTaskCount ? `${onsiteTaskCount} 项` : "",
      v1MustContinueCount,
      v2DifferenceCount,
      v2DifferenceLabel: `${v2DifferenceCount} 项`,
    },
    criteria,
    blockingCriteria: blockingCriteria.slice(0, 7),
    v2Boundary: {
      ready: boundaryReady,
      v1MustContinueCount,
      v2CategoryCount: normalizeV1NonNegativeInteger(v1V2BoundaryBrief.summary?.v2CategoryCount),
      v2DifferenceCount,
      moduleDifferenceCount: normalizeV1NonNegativeInteger(v1V2BoundaryBrief.summary?.moduleDifferenceCount),
      label: cleanServerText(v1V2BoundaryBrief.summary?.label) ||
        "V1/V2 边界待确认：V1 必做项不能后移到 V2",
      nextAction: boundaryReady
        ? "边界已确认；V2 差异只作为后续范围，不替代 V1 门禁。"
        : "先确认 V1 必做项和 V2 延后项，V2 差异不能替代 V1 完成条件。",
    },
    safeguards: {
      nonMutating: true,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawNotesIncluded: false,
      rawCsvIncluded: false,
      rawReleaseCandidateIncluded: false,
      rawOwnerDecisionBriefIncluded: false,
      rawV1V2ScopeIncluded: false,
      artifactPathExposed: false,
      localPathExposed: false,
      environmentValuesIncluded: false,
      commandValuesIncluded: false,
      rawSecretsIncluded: false,
    },
  };
}

function buildV1CompletionProofGapsFromItems(items = [], limit = Number.POSITIVE_INFINITY) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => isV1CompletionGapItem(item))
    .map((item) => {
      const label = cleanServerText(item?.label || item?.key);
      const detail =
        cleanServerText(item?.summary) ||
        cleanServerText(item?.detail) ||
        cleanServerText(item?.nextAction) ||
        cleanServerText(item?.progressLabel) ||
        cleanServerText(item?.statusLabel) ||
        cleanServerText(item?.status);
      return sanitizeV1RoleTaskActionText([label, detail].filter(Boolean).join("："));
    })
    .filter(Boolean)
    .slice(0, limit);
}

function buildV1CompletionFieldEvidenceGaps(fieldEvidenceProgress = {}) {
  const source = isPlainServerObject(fieldEvidenceProgress) ? fieldEvidenceProgress : {};
  const groups = Array.isArray(source.groupSummaries)
    ? source.groupSummaries
    : Array.isArray(source.groups)
      ? source.groups
      : [];
  return groups
    .filter((group) => isV1CompletionGapItem(group))
    .map((group) => {
      const label = cleanServerText(group?.label || group?.key);
      const missingCount =
        normalizeV1NonNegativeInteger(group?.missingCount) ||
        normalizeV1NonNegativeInteger(group?.blockedRequired);
      const totalCount = normalizeV1NonNegativeInteger(group?.requiredTotal);
      const progress = missingCount && totalCount
        ? `缺 ${missingCount}/${totalCount} 项证据`
        : cleanServerText(group?.progressLabel || group?.nextAction || "缺现场证据");
      return sanitizeV1RoleTaskActionText([label, progress].filter(Boolean).join("："));
    })
    .filter(Boolean)
    .slice(0, Number.POSITIVE_INFINITY);
}

function buildV1CompletionOwnerSignoffGaps(fieldEvidenceProgress = {}) {
  const source = isPlainServerObject(fieldEvidenceProgress) ? fieldEvidenceProgress : {};
  const signoffs = Array.isArray(source.signoffs) ? source.signoffs : [];
  return signoffs
    .filter((signoff) => isV1CompletionGapItem(signoff))
    .map((signoff) => {
      const role = cleanServerText(signoff?.role || signoff?.label || signoff?.key);
      const progress = cleanServerText(signoff?.progressLabel || "缺签字人 / 缺时间");
      return sanitizeV1RoleTaskActionText([role, progress].filter(Boolean).join("："));
    })
    .filter(Boolean)
    .slice(0, Number.POSITIVE_INFINITY);
}

function buildV1CompletionBoundaryGaps(fieldEvidenceProgress = {}, v1V2BoundaryBrief = {}) {
  const source = isPlainServerObject(fieldEvidenceProgress) ? fieldEvidenceProgress : {};
  const boundaryAction = Array.isArray(source.signoffBoundaryActions)
    ? source.signoffBoundaryActions.find((item) => item?.type === "boundary")
    : null;
  const boundary = isPlainServerObject(source.boundary) ? source.boundary : {};
  const gaps = [];
  if (boundaryAction && isV1CompletionGapItem(boundaryAction)) {
    const label = cleanServerText(boundaryAction.label || "V1/V2 边界确认");
    const progress = cleanServerText(boundaryAction.progressLabel || boundaryAction.nextAction || "待确认");
    gaps.push([label, progress].filter(Boolean).join("："));
  } else if (!boundary.ready) {
    const progress = cleanServerText(boundary.nextAction || v1V2BoundaryBrief.nextAction || "待确认");
    gaps.push(["V1/V2 边界确认", progress].filter(Boolean).join("："));
  }
  return sanitizeStringList(gaps)
    .map((item) => sanitizeV1RoleTaskActionText(item))
    .filter(Boolean)
    .slice(0, Number.POSITIVE_INFINITY);
}

function isV1CompletionGapItem(item = {}) {
  if (!isPlainServerObject(item)) return false;
  const status = cleanServerText(item.status);
  return item.ready !== true && status !== "passed" && status !== "ready";
}

function buildV1CompletionAuditCriterion({
  key,
  label,
  ready = false,
  evidenceLabel = "",
  current = "",
  proofRequirements = [],
  proofGaps = [],
  nextAction = "",
}) {
  const done = Boolean(ready);
  const sanitizedProofRequirements = sanitizeStringList(proofRequirements)
    .map((item) => sanitizeV1RoleTaskActionText(item))
    .filter(Boolean);
  const sanitizedProofGaps = sanitizeStringList(proofGaps)
    .map((item) => sanitizeV1RoleTaskActionText(item))
    .filter(Boolean);
  const proofGapTotalCount = sanitizedProofGaps.length;
  const proofGapShownCount = Math.min(proofGapTotalCount, 4);
  return {
    key: cleanServerText(key),
    label: cleanServerText(label),
    required: true,
    ready: done,
    status: done ? "ready" : "blocked",
    statusLabel: done ? "已满足" : "阻塞",
    evidenceLabel: cleanServerText(evidenceLabel),
    current: sanitizeV1RoleTaskActionText(current),
    proofRequirements: sanitizedProofRequirements.slice(0, 3),
    proofGaps: sanitizedProofGaps.slice(0, proofGapShownCount),
    proofGapShownCount,
    proofGapTotalCount,
    proofGapCountLabel: proofGapTotalCount ? `${proofGapShownCount}/${proofGapTotalCount}` : "",
    nextAction: sanitizeV1RoleTaskActionText(nextAction),
  };
}

function sanitizeV1RuntimeReadinessBlockers(
  releaseCandidate = {},
  fieldAcceptance = {},
  completion = {},
) {
  const releaseSource = isPlainServerObject(releaseCandidate) ? releaseCandidate : {};
  const fieldSource = isPlainServerObject(fieldAcceptance) ? fieldAcceptance : {};
  const completionSource = isPlainServerObject(completion) ? completion : {};
  const releaseSummary = isPlainServerObject(releaseSource.summary) ? releaseSource.summary : {};
  const fieldSummary = isPlainServerObject(fieldSource.summary) ? fieldSource.summary : {};
  const completionSummary = isPlainServerObject(completionSource.summary) ? completionSource.summary : {};
  const runtimeLabel =
    cleanServerText(fieldSummary.label) ||
    cleanServerText(releaseSummary.runtimeReadiness) ||
    cleanServerText(completionSummary.runtimeReadiness) ||
    "5/11 通过";
  const runtimeCounts = parseV1ReadinessCountLabel(runtimeLabel);
  const blockers = Array.isArray(releaseSource.blockingItems)
    ? releaseSource.blockingItems
        .filter(isV1RuntimeReadinessBlockingItem)
        .map(sanitizeV1RuntimeReadinessBlocker)
        .filter(Boolean)
    : [];
  const fallbackBlockers = blockers.length
    ? []
    : sanitizeV1RuntimeReadinessNextActions(fieldSource.nextActions ?? releaseSource.nextActions);
  const items = blockers.length ? blockers : fallbackBlockers;
  const passedCount =
    normalizeV1NonNegativeInteger(fieldSummary.passedCount) ||
    runtimeCounts.passedCount;
  const totalCount =
    normalizeV1NonNegativeInteger(fieldSummary.totalCount) ||
    runtimeCounts.totalCount ||
    Math.max(items.length, passedCount + items.length);
  const blockingCount =
    normalizeV1NonNegativeInteger(fieldSummary.blockingCount) ||
    items.filter((item) => !item.ready).length ||
    Math.max(0, totalCount - passedCount);
  const ready =
    Boolean(fieldSource.ready === true || releaseSource.ready === true) &&
    totalCount > 0 &&
    blockingCount === 0;
  const shownBlockingCount = items.slice(0, 8).length;
  return {
    status: ready ? "ready" : "blocked",
    ready,
    available: items.length > 0 || Boolean(runtimeLabel),
    summary: {
      label: `运行时 V1 readiness：${passedCount}/${totalCount} 通过，${blockingCount} 项阻塞`,
      readinessLabel: runtimeLabel,
      passedCount,
      totalCount,
      blockingCount,
      shownBlockingCount,
    },
    blockers: items.slice(0, 8),
    nextAction: ready
      ? "运行时门禁已通过，仍需现场证据、签字和 V1/V2 边界确认同步通过。"
      : "先处理这 6 个运行时门禁，再重新跑 release candidate / go-live suite。",
    safeguards: {
      nonMutating: true,
      rawRuntimeReadinessReportIncluded: false,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawSecretsIncluded: false,
      artifactPathExposed: false,
      environmentValuesIncluded: false,
      commandValuesIncluded: false,
      physicalPrinterCalledByCheck: false,
      driverDeliveryStatusChangedByCheck: false,
    },
  };
}

function isV1RuntimeReadinessBlockingItem(value = {}) {
  if (!isPlainServerObject(value)) return false;
  const gate = cleanServerText(value.gate);
  const key = cleanServerText(value.key);
  return gate === "运行时 V1 readiness" || Boolean(getV1RuntimeReadinessBlockerDefaults(key));
}

function sanitizeV1RuntimeReadinessBlocker(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const key = cleanServerText(value.key);
  const label = cleanServerText(value.label);
  if (!key || !label) return null;
  const defaults = getV1RuntimeReadinessBlockerDefaults(key) ?? {};
  const ready = Boolean(value.ready);
  const status = ready ? "ready" : cleanServerText(value.status) || "pending";
  return {
    key,
    label,
    group: defaults.group || "运行时门禁",
    ownerRole: defaults.ownerRole || "技术/管理",
    status,
    ready,
    detail: sanitizeV1RoleTaskActionText(value.detail),
    nextAction: sanitizeV1RoleTaskActionText(value.nextAction) || defaults.nextAction || "补齐该项运行时门禁后重新跑 release candidate。",
  };
}

function sanitizeV1RuntimeReadinessNextActions(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const text = sanitizeV1RoleTaskActionText(item);
      const match = text.match(/^([^：:]+)[：:]\s*(.+)$/);
      const label = match ? cleanServerText(match[1]) : cleanServerText(text);
      const detail = match ? cleanServerText(match[2]) : "";
      if (!label || !isV1RuntimeReadinessLabel(label)) return null;
      const defaults = getV1RuntimeReadinessBlockerDefaultsByLabel(label) ?? {};
      return {
        key: defaults.key || `runtime-readiness-${index + 1}`,
        label,
        group: defaults.group || "运行时门禁",
        ownerRole: defaults.ownerRole || "技术/管理",
        status: "pending",
        ready: false,
        detail,
        nextAction: defaults.nextAction || "补齐该项运行时门禁后重新跑 release candidate。",
      };
    })
    .filter(Boolean);
}

function isV1RuntimeReadinessLabel(value) {
  const label = cleanServerText(value);
  return [
    "系统 V1 持久化门禁",
    "附件 V1 留档门禁",
    "打印 spool 状态回读",
    "CUPS 队列预检",
    "打印 V1 上线门禁",
    "司机端 V1 真机门禁",
  ].some((candidate) => label === candidate);
}

function getV1RuntimeReadinessBlockerDefaultsByLabel(label) {
  const entries = [
    ["system-v1-persistence", "系统 V1 持久化门禁"],
    ["attachment-v1-readiness", "附件 V1 留档门禁"],
    ["print-spool-diagnostics", "打印 spool 状态回读"],
    ["print-cups-diagnostics", "CUPS 队列预检"],
    ["print-v1-readiness", "打印 V1 上线门禁"],
    ["driver-v1-readiness", "司机端 V1 真机门禁"],
  ];
  const match = entries.find(([, candidate]) => candidate === cleanServerText(label));
  return match ? { key: match[0], ...getV1RuntimeReadinessBlockerDefaults(match[0]) } : null;
}

function getV1RuntimeReadinessBlockerDefaults(key) {
  const defaults = {
    "system-v1-persistence": {
      group: "生产级持久化",
      ownerRole: "技术/管理",
      nextAction: "切到生产 PostgreSQL / 对象存储 profile，并重新跑系统 V1 readiness。",
    },
    "attachment-v1-readiness": {
      group: "附件留档",
      ownerRole: "技术/管理",
      nextAction: "补齐附件对象存储上传、读回、短链和访问审计证据。",
    },
    "print-spool-diagnostics": {
      group: "真实打印链路",
      ownerRole: "技术/管理",
      nextAction: "配置 command_bridge spool 状态目录，并验证 queued 到终态的状态回读。",
    },
    "print-cups-diagnostics": {
      group: "真实打印链路",
      ownerRole: "技术/管理",
      nextAction: "在真实打印服务器执行 CUPS 队列 non-printing 预检。",
    },
    "print-v1-readiness": {
      group: "真实打印链路",
      ownerRole: "技术/管理",
      nextAction: "补齐打印 V1 门禁里的配置、spool、CUPS、设备模式和现场 QA。",
    },
    "driver-v1-readiness": {
      group: "司机真机验收",
      ownerRole: "技术/管理",
      nextAction: "用真实 Android / iOS 设备完成登录、扫码、拍照水印、定位和导航桥接验证。",
    },
  };
  return defaults[cleanServerText(key)] ?? null;
}

function sanitizeV1FieldAcceptanceReport(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const summary = isPlainServerObject(source.summary) ? source.summary : {};
  const modules = Array.isArray(source.modules)
    ? source.modules.map(sanitizeV1FieldAcceptanceModule).filter(Boolean)
    : [];
  const blockingCriteria = Array.isArray(source.blockingCriteria)
    ? source.blockingCriteria.map(sanitizeV1FieldAcceptanceCriterion).filter(Boolean)
    : [];
  const requiredFieldEvidence = Array.isArray(source.requiredFieldEvidence)
    ? source.requiredFieldEvidence.map(sanitizeV1RequiredFieldEvidence).filter(Boolean)
    : [];
  const remainingV1Risks = sanitizeStringList(source.remainingV1Risks)
    .map(sanitizeV1RoleTaskActionText)
    .filter(Boolean);
  const nextActions = sanitizeStringList(source.nextActions)
    .map(sanitizeV1RoleTaskActionText)
    .filter(Boolean);
  const passedCount =
    normalizeV1NonNegativeInteger(summary.passedCount) ||
    modules.filter((module) => module.ready).length;
  const totalCount =
    normalizeV1NonNegativeInteger(summary.totalCount) ||
    modules.length;
  const blockingCount =
    normalizeV1NonNegativeInteger(summary.blockingCount) ||
    blockingCriteria.filter((item) => item.blocking).length ||
    Math.max(0, totalCount - passedCount);
  const ready = source.ready === true && blockingCount === 0 && totalCount > 0;
  return {
    status: ready ? "ready" : "blocked",
    ready,
    available:
      Boolean(cleanServerText(source.status)) ||
      modules.length > 0 ||
      blockingCriteria.length > 0 ||
      requiredFieldEvidence.length > 0,
    generatedAt: cleanServerText(source.generatedAt),
    conclusion:
      sanitizeV1RoleTaskActionText(source.conclusion) ||
      "现场验收报告仍未通过；不能声明 V1 已完成或已可上线。",
    summary: {
      label:
        cleanServerText(summary.label) ||
        `${passedCount}/${totalCount} 通过`,
      passedCount,
      totalCount,
      blockingCount,
      shownModuleCount: modules.slice(0, 6).length,
      shownBlockingCount: blockingCriteria.slice(0, 8).length,
      shownEvidenceGroupCount: requiredFieldEvidence.slice(0, 5).length,
      shownNextActionCount: nextActions.slice(0, 8).length,
    },
    modules: modules.slice(0, 6),
    blockingCriteria: blockingCriteria.slice(0, 8),
    requiredFieldEvidence: requiredFieldEvidence.slice(0, 5),
    remainingV1Risks: remainingV1Risks.slice(0, 8),
    nextActions: nextActions.slice(0, 8),
    safeguards: {
      nonMutating: true,
      rawFieldAcceptanceReportIncluded: false,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawNotesIncluded: false,
      rawSecretsIncluded: false,
      artifactPathExposed: false,
      localPathExposed: false,
      systemRepositoryPayloadExposed: false,
      systemConnectionStringExposed: false,
      attachmentPayloadExposed: false,
      printCommandExposed: false,
      spoolPathExposed: false,
      printPayloadExposed: false,
      driverPayloadExposed: false,
      physicalPrinterCalledByCheck: false,
      driverDeliveryStatusChangedByCheck: false,
    },
  };
}

function sanitizeV1FieldAcceptanceModule(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const key = cleanServerText(value.key);
  const label = cleanServerText(value.label);
  if (!key || !label) return null;
  const evidence = sanitizeStringList(value.evidence)
    .map(sanitizeV1RoleTaskActionText)
    .filter(Boolean)
    .slice(0, 3);
  return {
    key,
    label,
    status: cleanServerText(value.status) || (value.ready === true ? "passed" : "pending"),
    ready: value.ready === true,
    detail: sanitizeV1RoleTaskActionText(value.detail),
    evidence,
  };
}

function sanitizeV1FieldAcceptanceCriterion(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const key = cleanServerText(value.key);
  const label = cleanServerText(value.label);
  if (!key || !label) return null;
  return {
    key,
    label,
    status: cleanServerText(value.status) || "pending",
    blocking: value.blocking === true,
    detail: sanitizeV1RoleTaskActionText(value.detail),
    nextAction:
      getV1RuntimeReadinessBlockerDefaults(key)?.nextAction ||
      "补齐该现场验收阻塞项后重新跑现场验收报告和 release candidate。",
  };
}

function sanitizeV1RequiredFieldEvidence(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const key = cleanServerText(value.key);
  const label = cleanServerText(value.label);
  if (!key || !label) return null;
  const required = sanitizeStringList(value.required)
    .map(sanitizeV1RoleTaskActionText)
    .filter(Boolean)
    .slice(0, 4);
  return {
    key,
    label,
    required,
    requiredCount: required.length,
  };
}

function parseV1ReadinessCountLabel(value) {
  const text = cleanServerText(value);
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return { passedCount: 0, totalCount: 0 };
  return {
    passedCount: normalizeV1NonNegativeInteger(match[1]),
    totalCount: normalizeV1NonNegativeInteger(match[2]),
  };
}

function sanitizeV1ModuleCompletion(value = []) {
  return Array.isArray(value)
    ? value.map(sanitizeV1ModuleCompletionRow).filter(Boolean)
    : [];
}

function sanitizeV1ModuleCompletionRow(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const module = cleanServerText(value.module);
  if (!module) return null;
  return {
    module,
    requirementCompletion: cleanServerText(value.requirementCompletion),
    p0CodeCompletion: cleanServerText(value.p0CodeCompletion),
    v1Readiness: cleanServerText(value.v1Readiness),
    currentStatus: cleanServerText(value.currentStatus),
    remaining: cleanServerText(value.remaining),
  };
}

function sanitizeV1UnblockPlan(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const summary = isPlainServerObject(source.summary) ? source.summary : {};
  return {
    status: normalizeV1GoLiveStatus(source.status),
    ready: Boolean(source.ready),
    summary: {
      label: cleanServerText(summary.label) || "V1 解除阻塞仍有 52 项待处理",
      taskCount: normalizeV1NonNegativeInteger(summary.taskCount),
      releaseTaskCount: normalizeV1NonNegativeInteger(summary.releaseTaskCount),
      evidenceTaskCount: normalizeV1NonNegativeInteger(summary.evidenceTaskCount),
      signoffTaskCount: normalizeV1NonNegativeInteger(summary.signoffTaskCount),
      boundaryTaskCount: normalizeV1NonNegativeInteger(summary.boundaryTaskCount),
      phaseCount: normalizeV1NonNegativeInteger(summary.phaseCount),
      roleCount: normalizeV1NonNegativeInteger(summary.roleCount),
    },
    phases: Array.isArray(source.phases)
      ? source.phases.map(sanitizeV1UnblockPhase).filter(Boolean)
      : [],
    roleBuckets: Array.isArray(source.roleBuckets)
      ? source.roleBuckets.map(sanitizeV1RoleBucket).filter(Boolean)
      : [],
    firstActions: Array.isArray(source.firstActions)
      ? source.firstActions.map(sanitizeV1UnblockTask).filter(Boolean)
      : [],
    safeguards: {
      rawEvidenceRefsIncluded: false,
      rawSecretsIncluded: false,
    },
  };
}

function sanitizeV1UnblockPhase(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const key = cleanServerText(value.key);
  const label = cleanServerText(value.label);
  if (!key || !label) return null;
  return {
    key,
    label,
    taskCount: normalizeV1NonNegativeInteger(value.taskCount),
    releaseTaskCount: normalizeV1NonNegativeInteger(value.releaseTaskCount),
    evidenceTaskCount: normalizeV1NonNegativeInteger(value.evidenceTaskCount),
    signoffTaskCount: normalizeV1NonNegativeInteger(value.signoffTaskCount),
    boundaryTaskCount: normalizeV1NonNegativeInteger(value.boundaryTaskCount),
    roles: sanitizeStringList(value.roles),
    nextStep: cleanServerText(value.nextStep),
    groups: Array.isArray(value.groups)
      ? value.groups
          .map((group) => ({
            group: cleanServerText(group?.group),
            count: normalizeV1NonNegativeInteger(group?.count),
          }))
          .filter((group) => group.group)
      : [],
    firstTasks: Array.isArray(value.firstTasks)
      ? value.firstTasks.map(sanitizeV1UnblockTask).filter(Boolean)
      : [],
  };
}

function sanitizeV1UnblockTask(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const title = cleanServerText(value.title);
  if (!title) return null;
  return {
    id: cleanServerText(value.id),
    type: cleanServerText(value.type),
    primaryRole: cleanServerText(value.primaryRole),
    roles: sanitizeStringList(value.roles),
    group: cleanServerText(value.group),
    title,
    status: cleanServerText(value.status),
    action: sanitizeV1RoleTaskActionText(value.action),
  };
}

function sanitizeV1RoleBucket(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const role = cleanServerText(value.role);
  if (!role) return null;
  return {
    role,
    taskCount: normalizeV1NonNegativeInteger(value.taskCount),
    p0TaskCount: normalizeV1NonNegativeInteger(value.p0TaskCount),
  };
}

function sanitizeV1RoleTaskBoard(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const summary = isPlainServerObject(source.summary) ? source.summary : {};
  const tasks = Array.isArray(source.tasks)
    ? source.tasks.map(sanitizeV1RoleTaskBoardTask).filter(Boolean)
    : [];
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const roleRows = Array.isArray(source.roleBuckets)
    ? source.roleBuckets
        .map((bucket) => sanitizeV1RoleTaskBoardRole(bucket, tasks, taskById))
        .filter(Boolean)
    : deriveV1RoleTaskBoardRoles(tasks);
  const taskCount = normalizeV1NonNegativeInteger(summary.taskCount) || tasks.length;
  const releaseTaskCount = normalizeV1NonNegativeInteger(summary.releaseTaskCount) ||
    tasks.filter(isV1ReleaseTask).length;
  const evidenceTaskCount = normalizeV1NonNegativeInteger(summary.evidenceTaskCount) ||
    tasks.filter(isV1EvidenceTask).length;
  const signoffTaskCount = normalizeV1NonNegativeInteger(summary.signoffTaskCount) ||
    tasks.filter(isV1SignoffTask).length;
  const boundaryTaskCount = normalizeV1NonNegativeInteger(summary.boundaryTaskCount) ||
    tasks.filter(isV1BoundaryTask).length;
  const categorySummaries = buildV1RoleTaskBoardCategorySummaries({
    releaseTaskCount,
    evidenceTaskCount,
    signoffTaskCount,
    boundaryTaskCount,
    tasks,
  });

  return {
    status: normalizeV1GoLiveStatus(source.status),
    ready: Boolean(source.ready),
    available: tasks.length > 0 || roleRows.length > 0,
    summary: {
      label: cleanServerText(summary.label) ||
        (taskCount ? `V1 现场仍有 ${taskCount} 个待处理任务` : "V1 现场角色任务清单未生成"),
      taskCount,
      releaseTaskCount,
      evidenceTaskCount,
      signoffTaskCount,
      boundaryTaskCount,
      roleCount: normalizeV1NonNegativeInteger(summary.roleCount) || roleRows.length,
      categoryCount: categorySummaries.length,
      shownRoleCount: roleRows.slice(0, 6).length,
      shownTaskCount: roleRows
        .slice(0, 6)
        .reduce((total, role) => total + role.tasks.length, 0),
    },
    categorySummaries,
    roles: roleRows.slice(0, 6),
    firstActions: tasks.slice(0, 10),
    safeguards: {
      nonMutating: true,
      rawOnsiteTaskBoardIncluded: false,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawNotesIncluded: false,
      rawSecretsIncluded: false,
      artifactPathExposed: false,
    },
  };
}

function buildV1RoleTaskBoardCategorySummaries({
  releaseTaskCount = 0,
  evidenceTaskCount = 0,
  signoffTaskCount = 0,
  boundaryTaskCount = 0,
  tasks = [],
} = {}) {
  const taskRows = Array.isArray(tasks) ? tasks.filter(Boolean) : [];
  const categories = [
    {
      key: "release",
      title: "发布门禁",
      type: "发布门禁",
      count: releaseTaskCount,
      nextAction: "先处理生产配置门禁、运行时门禁、真实持久化、对象存储、打印和司机真机门禁。",
      predicate: isV1ReleaseTask,
    },
    {
      key: "evidence",
      title: "现场证据",
      type: "现场证据",
      count: evidenceTaskCount,
      nextAction: "按证据组补真实 PostgreSQL、对象存储、打印、司机真机和业务试跑留档。",
      predicate: isV1EvidenceTask,
    },
    {
      key: "signoff",
      title: "负责人签字",
      type: "负责人签字",
      count: signoffTaskCount,
      nextAction: "补齐办公室、仓库/出库、车间、司机、财务、技术/管理负责人签字。",
      predicate: isV1SignoffTask,
    },
    {
      key: "boundary",
      title: "V1/V2 边界",
      type: "V1/V2 边界",
      count: boundaryTaskCount,
      nextAction: "确认 V1 必做项不能后移到 V2，再复核计划 V2 差异。",
      predicate: isV1BoundaryTask,
    },
  ];

  return categories.map((category) => {
    const firstTasks = taskRows.filter(category.predicate).slice(0, 3);
    return {
      key: category.key,
      title: category.title,
      type: category.type,
      count: normalizeV1NonNegativeInteger(category.count),
      status: category.count > 0 ? "pending" : "cleared",
      statusLabel: category.count > 0 ? "待处理" : "已清空",
      nextAction: category.nextAction,
      firstTasks,
    };
  });
}

function sanitizeV1RoleTaskBoardRole(value = {}, tasks = [], taskById = new Map()) {
  if (!isPlainServerObject(value)) return null;
  const role = cleanServerText(value.role);
  if (!role) return null;
  const taskIds = Array.isArray(value.tasks) ? value.tasks.map((item) => cleanServerText(item)).filter(Boolean) : [];
  const roleTasks = taskIds.length
    ? taskIds.map((taskId) => taskById.get(taskId)).filter(Boolean)
    : tasks.filter((task) => task.roles.includes(role) || task.primaryRole === role);
  return buildV1RoleTaskBoardRole({
    role,
    sourceCount: normalizeV1NonNegativeInteger(value.taskCount),
    p0TaskCount: normalizeV1NonNegativeInteger(value.p0TaskCount),
    tasks: roleTasks,
  });
}

function deriveV1RoleTaskBoardRoles(tasks = []) {
  const roles = [];
  for (const task of tasks) {
    for (const role of task.roles) {
      if (!roles.includes(role)) roles.push(role);
    }
  }
  return roles
    .map((role) => buildV1RoleTaskBoardRole({
      role,
      sourceCount: 0,
      p0TaskCount: 0,
      tasks: tasks.filter((task) => task.roles.includes(role) || task.primaryRole === role),
    }))
    .filter(Boolean);
}

function buildV1RoleTaskBoardRole({ role, sourceCount, p0TaskCount, tasks }) {
  const taskRows = Array.isArray(tasks) ? tasks.filter(Boolean) : [];
  return {
    role,
    taskCount: sourceCount || taskRows.length,
    p0TaskCount: p0TaskCount || taskRows.length,
    releaseTaskCount: taskRows.filter(isV1ReleaseTask).length,
    evidenceTaskCount: taskRows.filter(isV1EvidenceTask).length,
    signoffTaskCount: taskRows.filter(isV1SignoffTask).length,
    boundaryTaskCount: taskRows.filter(isV1BoundaryTask).length,
    tasks: taskRows.slice(0, 5),
  };
}

function sanitizeV1RoleTaskBoardTask(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const id = cleanServerText(value.id);
  const title = cleanServerText(value.title);
  if (!id || !title) return null;
  const roles = sanitizeStringList(value.roles);
  const primaryRole = cleanServerText(value.primaryRole) || roles[0] || "";
  const type = cleanServerText(value.type);
  return {
    id,
    type,
    group: cleanServerText(value.group),
    title,
    status: cleanServerText(value.status) || "pending",
    priority: cleanServerText(value.priority) || "P0",
    primaryRole,
    roles,
    action: sanitizeV1RoleTaskActionText(value.action),
  };
}

function sanitizeV1V2BoundaryBrief(scope = {}, completion = {}) {
  const source = isPlainServerObject(scope) ? scope : {};
  const summarySource = isPlainServerObject(source.summary) ? source.summary : {};
  const ownerReviewSource = isPlainServerObject(source.ownerReview) ? source.ownerReview : {};
  const v1MustContinue = sanitizeStringList(source.v1MustContinue ?? completion.v1MustContinue ?? []).slice(0, 8);
  const v2Categories = sanitizeStringList(source.v2Categories ?? []).slice(0, 7);
  const v2Differences = sanitizeStringList(source.v2Differences ?? completion.v2Differences ?? []).slice(0, 20);
  const moduleDifferences = sanitizeV1ModuleDifferences(
    source.moduleDifferences ?? completion.moduleV1V2Differences ?? [],
  ).slice(0, 12);
  const ownerReview = {
    question: cleanServerText(ownerReviewSource.question),
    recommendation: cleanServerText(ownerReviewSource.recommendation),
    approvalRule: cleanServerText(ownerReviewSource.approvalRule),
  };
  const ownerReviewRuleCount = Object.values(ownerReview).filter(Boolean).length;
  const available =
    v1MustContinue.length > 0 ||
    v2Categories.length > 0 ||
    v2Differences.length > 0 ||
    moduleDifferences.length > 0 ||
    ownerReviewRuleCount > 0;
  const ready = source.ready === true;
  return {
    status: ready ? "confirmed" : "pending_confirmation",
    ready,
    available,
    canDeclareV1Complete: ready === true && source.canDeclareV1Complete === true,
    conclusion:
      cleanServerText(source.conclusion) ||
      "V1/V2 边界已整理，但 V1 仍未完成；不得把生产配置、真实设备、现场证据或签字后移到 V2。",
    summary: {
      label:
        cleanServerText(summarySource.label) ||
        "V1/V2 边界待确认：V1 必做项不能后移到 V2",
      v1MustContinueCount:
        normalizeV1NonNegativeInteger(summarySource.v1MustContinueCount) || v1MustContinue.length,
      v2CategoryCount:
        normalizeV1NonNegativeInteger(summarySource.v2CategoryCount) || v2Categories.length,
      v2DifferenceCount:
        normalizeV1NonNegativeInteger(summarySource.v2DifferenceCount) || v2Differences.length,
      moduleDifferenceCount:
        normalizeV1NonNegativeInteger(summarySource.moduleDifferenceCount) || moduleDifferences.length,
      ownerReviewRuleCount,
    },
    v1MustContinue,
    v2Categories,
    v2Differences,
    moduleDifferences,
    ownerReview,
    nextAction: ownerReview.recommendation || "先处理 V1 必做阻塞，再复核 V2 延后项。",
    safeguards: {
      nonMutating: true,
      boundaryConfirmationMutated: false,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawNotesIncluded: false,
      rawSecretsIncluded: false,
      artifactPathExposed: false,
    },
  };
}

function sanitizeV1OwnerDecisionBrief(value = {}, completion = {}, suite = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const decisionSource = isPlainServerObject(source.decision) ? source.decision : {};
  const completionSource = isPlainServerObject(source.completion)
    ? source.completion
    : isPlainServerObject(completion.summary)
      ? completion.summary
      : {};
  const suiteSummary = isPlainServerObject(suite.summary) ? suite.summary : {};
  const doneHighlights = sanitizeStringList(source.doneHighlights).slice(0, 4);
  const unfinishedItems = Array.isArray(source.unfinishedItems)
    ? source.unfinishedItems.map(sanitizeV1OwnerDecisionItem).filter(Boolean)
    : [];
  const releaseGates = Array.isArray(source.releaseGates)
    ? source.releaseGates.map(sanitizeV1OwnerDecisionGate).filter(Boolean)
    : [];
  const blockerGroups = Array.isArray(source.blockerGroups)
    ? source.blockerGroups.map(sanitizeV1OwnerDecisionBlockerGroup).filter(Boolean)
    : [];
  const nextActions = sanitizeStringList(source.nextActions)
    .map(sanitizeV1RoleTaskActionText)
    .filter(Boolean);
  const topBlockers = Array.isArray(source.topBlockers)
    ? source.topBlockers.map(sanitizeV1OwnerDecisionTopBlocker).filter(Boolean)
    : [];
  const ready = source.ready === true && source.canDeclareV1Complete === true;
  const available = Boolean(
    cleanServerText(source.status) ||
      cleanServerText(source.conclusion) ||
      cleanServerText(decisionSource.label) ||
      doneHighlights.length ||
      unfinishedItems.length ||
      releaseGates.length ||
      nextActions.length ||
      topBlockers.length,
  );
  const onsiteTaskCount =
    normalizeV1NonNegativeInteger(completionSource.onsiteTaskCount ?? completionSource.onsiteTasks) ||
    normalizeV1NonNegativeInteger(suiteSummary.onsiteTaskCount ?? suiteSummary.onsiteTasks);

  return {
    status:
      cleanServerText(source.status) ||
      (available ? (ready ? "ready_owner_brief_written" : "blocked_owner_brief_written") : "missing"),
    ready,
    available,
    canDeclareV1Complete: ready,
    generatedAt: cleanServerText(source.generatedAt),
    conclusion:
      sanitizeV1RoleTaskActionText(source.conclusion) ||
      "当前不能宣布 V1 完成；必须先补齐发布门禁、现场证据、负责人签字和 V1/V2 边界确认。",
    decision: {
      label: cleanServerText(decisionSource.label) || (ready ? "可以宣布 V1 已完成" : "不能宣布 V1 已完成"),
      recommendation:
        sanitizeV1RoleTaskActionText(decisionSource.recommendation) ||
        "先补齐生产环境、现场证据、真实设备 / 真机验收和负责人签字，再重新生成 release candidate。",
      ownerQuestion:
        sanitizeV1RoleTaskActionText(decisionSource.ownerQuestion) ||
        "是否继续按阻塞清单补齐后再评审？",
    },
    completion: {
      requirements: cleanServerText(completionSource.requirements) || "85-90%",
      p0Prototype: cleanServerText(completionSource.p0Prototype) || "97-98%",
      v1Readiness: cleanServerText(completionSource.v1Readiness) || "80-83%",
      releaseGate:
        cleanServerText(completionSource.releaseGate || completionSource.releaseCandidate) ||
        "0/4 发布门禁通过",
      runtimeReadiness: cleanServerText(completionSource.runtimeReadiness) || "5/11 通过",
      fieldEvidence:
        sanitizeV1RoleTaskActionText(completionSource.fieldEvidence) ||
        "V1 现场证据清单仍阻塞：证据 0/34，签字 0/6",
      fieldAcceptance: cleanServerText(completionSource.fieldAcceptance) || "5/11 通过",
      onsiteTaskCount,
    },
    summary: {
      unfinishedItemCount: Array.isArray(source.unfinishedItems) ? source.unfinishedItems.length : unfinishedItems.length,
      shownUnfinishedItemCount: unfinishedItems.slice(0, 8).length,
      releaseGateCount: releaseGates.length,
      doneHighlightCount: doneHighlights.length,
      blockerGroupCount: blockerGroups.length,
      nextActionCount: nextActions.length,
      shownNextActionCount: nextActions.slice(0, 8).length,
      topBlockerCount: topBlockers.length,
      shownTopBlockerCount: topBlockers.slice(0, 5).length,
    },
    doneHighlights,
    unfinishedItems: unfinishedItems.slice(0, 8),
    releaseGates: releaseGates.slice(0, 4),
    blockerGroups,
    nextActions: nextActions.slice(0, 8),
    topBlockers: topBlockers.slice(0, 5),
    nextAction:
      sanitizeV1RoleTaskActionText(decisionSource.recommendation) ||
      "继续处理 V1 阻塞项，全部门禁通过后再由负责人复核。",
    safeguards: {
      nonMutating: true,
      rawOwnerDecisionBriefIncluded: false,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawNotesIncluded: false,
      rawSecretsIncluded: false,
      artifactPathExposed: false,
      localPathExposed: false,
      sourceArtifactIncluded: false,
      v2FullListDuplicated: false,
      environmentValuesIncluded: false,
      commandValuesIncluded: false,
      rawTopBlockersIncluded: false,
    },
  };
}

function sanitizeV1OwnerDecisionItem(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const label = cleanServerText(value.label);
  if (!label) return null;
  return {
    type: cleanServerText(value.type),
    label,
    detail: sanitizeV1RoleTaskActionText(value.detail),
  };
}

function sanitizeV1OwnerDecisionGate(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const label = cleanServerText(value.label);
  if (!label) return null;
  return {
    label,
    status: cleanServerText(value.status) || "blocked",
    summary: sanitizeV1RoleTaskActionText(value.summary),
    detail: sanitizeV1RoleTaskActionText(value.detail),
  };
}

function sanitizeV1OwnerDecisionBlockerGroup(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const gate = cleanServerText(value.gate);
  if (!gate) return null;
  return {
    gate,
    count: normalizeV1NonNegativeInteger(value.count),
  };
}

function sanitizeV1OwnerDecisionTopBlocker(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const label = cleanServerText(value.label);
  if (!label) return null;
  return {
    gate: cleanServerText(value.gate),
    label,
    status: cleanServerText(value.status) || "pending",
    detail: sanitizeV1RoleTaskActionText(value.detail),
  };
}

function sanitizeV1RoleTaskActionText(value) {
  return cleanServerText(value)
    .replace(/\bevidenceRef\b/g, "现场证据编号")
    .replace(/\bsigner\s*\/\s*signedAt\b/g, "签字人 / 签字时间")
    .replace(/\bsigner\b/g, "签字人")
    .replace(/\bsignedAt\b/g, "签字时间")
    .replace(/\bonsiteSigner\b/g, "现场签字人")
    .replace(/\bonsiteSignedAt\b/g, "现场签字时间")
    .replace(/\bonsiteConfirmedBy\b/g, "现场确认人")
    .replace(/\bonsiteConfirmedAt\b/g, "现场确认时间")
    .replace(/\/Users\/\S+/g, "<本地路径已隐藏>")
    .replace(/\/private\/\S+/g, "<本地路径已隐藏>")
    .replace(/\.erp-local-storage\/\S+/g, "<本地产物路径已隐藏>")
    .replace(/REPLACE_WITH_[A-Z0-9_]+/g, "<待填写>");
}

function isV1ReleaseTask(task = {}) {
  return cleanServerText(task.id).startsWith("release.") || cleanServerText(task.type).includes("发布");
}

function isV1EvidenceTask(task = {}) {
  return cleanServerText(task.id).startsWith("evidence.") || cleanServerText(task.type).includes("证据");
}

function isV1SignoffTask(task = {}) {
  return cleanServerText(task.id).startsWith("signoff.") || cleanServerText(task.type).includes("签字");
}

function isV1BoundaryTask(task = {}) {
  return cleanServerText(task.id).startsWith("boundary.") || cleanServerText(task.type).includes("边界");
}

function sanitizeV1FieldEvidenceProgress(
  value = {},
  releaseCandidateFieldEvidence = {},
  fieldEvidenceItemsCsv = "",
  signoffBoundaryCsv = "",
) {
  const source = isPlainServerObject(value) ? value : {};
  const releaseSource = isPlainServerObject(releaseCandidateFieldEvidence)
    ? releaseCandidateFieldEvidence
    : {};
  const sourceSummary = isPlainServerObject(source.summary) ? source.summary : {};
  const releaseSummary = isPlainServerObject(releaseSource.summary) ? releaseSource.summary : {};
  const groups = Array.isArray(source.groups)
    ? source.groups.map(sanitizeV1FieldEvidenceGroup).filter(Boolean)
    : [];
  const groupRows = groups.slice(0, 6);
  const missingItems = parseV1FieldEvidenceMissingItems(fieldEvidenceItemsCsv);
  const groupSummaries = buildV1FieldEvidenceGroupSummariesForStatus(groupRows, missingItems.items);
  const signoffs = Array.isArray(source.signoffs)
    ? source.signoffs.map(sanitizeV1FieldEvidenceSignoff).filter(Boolean)
    : [];
  const boundary = sanitizeV1FieldEvidenceBoundary(source.boundary);
  const signoffBoundaryActions = parseV1FieldEvidenceSignoffBoundaryActions(signoffBoundaryCsv, {
    signoffs,
    boundary,
  });
  const requiredEvidenceItemsTotal =
    normalizeV1NonNegativeInteger(releaseSummary.requiredEvidenceItemsTotal) ||
    groups.reduce((total, group) => total + group.requiredTotal, 0);
  const requiredEvidenceItemsCompleted =
    normalizeV1NonNegativeInteger(releaseSummary.requiredEvidenceItemsCompleted) ||
    groups.reduce((total, group) => total + group.completedRequired, 0);
  const requiredSignoffsTotal =
    normalizeV1NonNegativeInteger(releaseSummary.requiredSignoffsTotal) ||
    signoffs.filter((item) => item.required).length;
  const requiredSignoffsCompleted =
    normalizeV1NonNegativeInteger(releaseSummary.requiredSignoffsCompleted) ||
    signoffs.filter((item) => item.ready).length;
  const evidenceGroupsTotal =
    normalizeV1NonNegativeInteger(releaseSummary.evidenceGroupsTotal) || groups.length;
  const evidenceGroupsReady =
    normalizeV1NonNegativeInteger(releaseSummary.evidenceGroupsReady) ||
    groups.filter((item) => item.ready).length;
  const blockingCount =
    normalizeV1NonNegativeInteger(releaseSummary.blockingCount) ||
    groups.reduce((total, group) => total + group.blockedRequired, 0) +
      Math.max(0, requiredSignoffsTotal - requiredSignoffsCompleted) +
      (boundary.ready ? 0 : 1);
  const missingEvidenceItemCount =
    missingItems.totalCount || Math.max(0, requiredEvidenceItemsTotal - requiredEvidenceItemsCompleted);
  const missingEvidenceItemsShown = missingItems.items.length;
  const signoffBoundaryActionCount =
    signoffBoundaryActions.totalCount ||
    Math.max(0, requiredSignoffsTotal - requiredSignoffsCompleted) +
      (boundary.ready ? 0 : 1);
  const signoffBoundaryActionsShown = signoffBoundaryActions.items.length;
  const signoffBoundarySummary = buildV1SignoffBoundarySummaryForStatus({
    signoffs,
    boundary,
    actions: signoffBoundaryActions.items,
    actionCount: signoffBoundaryActionCount,
    actionShownCount: signoffBoundaryActionsShown,
    requiredSignoffsTotal,
    requiredSignoffsCompleted,
  });
  const ready =
    Boolean(source.ready) ||
    (requiredEvidenceItemsTotal > 0 &&
      requiredEvidenceItemsCompleted >= requiredEvidenceItemsTotal &&
      requiredSignoffsTotal > 0 &&
      requiredSignoffsCompleted >= requiredSignoffsTotal &&
      boundary.ready);
  return {
    status: ready ? "ready" : "blocked",
    ready,
    available: groups.length > 0 || signoffs.length > 0 || Boolean(releaseSummary.label),
    summary: {
      label:
        cleanServerText(sourceSummary.label) ||
        cleanServerText(releaseSummary.label) ||
        "V1 现场证据采集进度：BLOCKED",
      evidenceLabel:
        cleanServerText(sourceSummary.evidence) ||
        cleanServerText(releaseSummary.label) ||
        `证据 ${requiredEvidenceItemsCompleted}/${requiredEvidenceItemsTotal}，签字 ${requiredSignoffsCompleted}/${requiredSignoffsTotal}`,
      evidenceGroupsTotal,
      evidenceGroupsReady,
      requiredEvidenceItemsTotal,
      requiredEvidenceItemsCompleted,
      requiredSignoffsTotal,
      requiredSignoffsCompleted,
      blockingCount,
      missingEvidenceItemCount,
      missingEvidenceItemsShown,
      groupSummaryCount: groupSummaries.length,
      signoffBoundaryActionCount,
      signoffBoundaryActionsShown,
      boundaryStatus: boundary.status,
    },
    groups: groupRows,
    groupSummaries,
    missingItems: missingItems.items,
    signoffBoundarySummary,
    signoffBoundaryActions: signoffBoundaryActions.items,
    signoffs,
    boundary,
    safeguards: {
      nonMutating: true,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawNotesIncluded: false,
      rawEvidenceItemsCsvIncluded: false,
      rawSignoffBoundaryCsvIncluded: false,
      artifactPathExposed: false,
    },
  };
}

function buildV1SignoffBoundarySummaryForStatus({
  signoffs = [],
  boundary = {},
  actions = [],
  actionCount = 0,
  actionShownCount = 0,
  requiredSignoffsTotal = 0,
  requiredSignoffsCompleted = 0,
} = {}) {
  const signoffTotal =
    normalizeV1NonNegativeInteger(requiredSignoffsTotal) ||
    signoffs.filter((item) => item.required).length;
  const signoffCompleted =
    normalizeV1NonNegativeInteger(requiredSignoffsCompleted) ||
    signoffs.filter((item) => item.ready).length;
  const missingSignoffCount = Math.max(0, signoffTotal - signoffCompleted);
  const boundaryReady = boundary.ready === true;
  const previewActions = actions.slice(0, 3);
  const totalActionCount =
    normalizeV1NonNegativeInteger(actionCount) ||
    missingSignoffCount + (boundaryReady ? 0 : 1);
  const shownActionCount =
    normalizeV1NonNegativeInteger(actionShownCount) ||
    actions.length;
  const ready = signoffTotal > 0 && missingSignoffCount === 0 && boundaryReady;
  return {
    status: ready ? "ready" : "blocked",
    ready,
    signoffTotal,
    signoffCompleted,
    missingSignoffCount,
    signoffProgressLabel: signoffTotal > 0 ? `${signoffCompleted}/${signoffTotal}` : "",
    boundaryStatus: cleanServerText(boundary.status) || "pending",
    boundaryLabel: boundaryReady ? "已确认" : "待确认",
    boundaryReady,
    actionCount: totalActionCount,
    actionShownCount: shownActionCount,
    actionLabel: `${shownActionCount}/${totalActionCount}`,
    previewActions,
    hiddenActionCount: Math.max(0, totalActionCount - previewActions.length),
    nextAction: ready
      ? "签字和 V1/V2 边界已满足；重新跑 release candidate 复核。"
      : missingSignoffCount > 0
        ? `还差 ${missingSignoffCount} 个负责人签字；先处理签字 / 边界待办。`
        : "负责人确认 V1 必做项和 V2 延后项后，补齐 V1/V2 边界确认人和时间。",
  };
}

function sanitizeV1FieldEvidenceIntakeGuidance(
  fieldEvidenceItemsCsv = "",
  signoffBoundaryCsv = "",
  options = {},
) {
  const rulesArtifact = isPlainServerObject(options.rulesArtifact) ? options.rulesArtifact : {};
  const draftManifestArtifact = isPlainServerObject(options.draftManifestArtifact)
    ? options.draftManifestArtifact
    : {};
  const draftFreshness = isPlainServerObject(options.draftFreshness)
    ? options.draftFreshness
    : buildV1FieldEvidenceDraftFreshness(fieldEvidenceItemsCsv, signoffBoundaryCsv, draftManifestArtifact);
  const evidenceSummary = summarizeV1FieldEvidenceIntakeRows(fieldEvidenceItemsCsv);
  const signoffSummary = summarizeV1FieldEvidenceIntakeSignoffRows(signoffBoundaryCsv);
  const draftManifestStatus = normalizeV1FieldEvidenceDraftManifestStatus(draftManifestArtifact);
  const draftFreshnessReady = draftFreshness.ready === true;
  const ready =
    evidenceSummary.requiredEvidenceRows > 0 &&
    evidenceSummary.completedEvidenceRows >= evidenceSummary.requiredEvidenceRows &&
    signoffSummary.signoffRows > 0 &&
    signoffSummary.completedSignoffRows >= signoffSummary.signoffRows &&
    signoffSummary.boundaryReady &&
    draftManifestStatus === "available" &&
    draftFreshnessReady;
  const blockedParts = [];
  if (evidenceSummary.requiredEvidenceRows > evidenceSummary.completedEvidenceRows) {
    blockedParts.push(`现场证据 ${evidenceSummary.completedEvidenceRows}/${evidenceSummary.requiredEvidenceRows}`);
  }
  if (signoffSummary.signoffRows > signoffSummary.completedSignoffRows) {
    blockedParts.push(`负责人签字 ${signoffSummary.completedSignoffRows}/${signoffSummary.signoffRows}`);
  }
  if (!signoffSummary.boundaryReady) {
    blockedParts.push(`V1/V2 边界 ${signoffSummary.boundaryLabel}`);
  }
  if (draftManifestStatus !== "available") {
    blockedParts.push(`草稿 ${draftManifestStatus === "missing" ? "未生成" : "不可用"}`);
  } else if (!draftFreshnessReady) {
    blockedParts.push(`草稿 ${draftFreshness.label || "需重生成"}`);
  }

  return {
    status: ready ? "ready" : "blocked",
    ready,
    available:
      evidenceSummary.evidenceCsvStatus === "present" ||
      signoffSummary.signoffCsvStatus === "present" ||
      rulesArtifact.status === "loaded" ||
      draftManifestStatus === "available",
    summary: {
      label: ready ? "现场证据回填已具备复核条件" : "现场证据回填仍未完成",
      evidenceCsvStatus: evidenceSummary.evidenceCsvStatus,
      signoffCsvStatus: signoffSummary.signoffCsvStatus,
      evidenceRows: evidenceSummary.requiredEvidenceRows,
      filledEvidenceRows: evidenceSummary.filledEvidenceRows,
      completedEvidenceRows: evidenceSummary.completedEvidenceRows,
      invalidEvidenceRows: evidenceSummary.invalidEvidenceRows,
      blockedEvidenceRows: evidenceSummary.blockedEvidenceRows,
      notApplicableEvidenceRows: evidenceSummary.notApplicableEvidenceRows,
      signoffRows: signoffSummary.signoffRows,
      filledSignoffRows: signoffSummary.filledSignoffRows,
      completedSignoffRows: signoffSummary.completedSignoffRows,
      invalidSignoffRows: signoffSummary.invalidSignoffRows,
      boundaryStatus: signoffSummary.boundaryStatus,
      boundaryLabel: signoffSummary.boundaryLabel,
      boundaryReady: signoffSummary.boundaryReady,
      draftManifestStatus,
      draftFreshnessStatus: cleanServerText(draftFreshness.status) || "missing",
      draftFreshnessLabel: cleanServerText(draftFreshness.label) || formatV1FieldEvidenceDraftFreshnessLabel(draftFreshness.status),
      draftFreshnessReady,
      rulesAvailable: rulesArtifact.status === "loaded",
      commandCount: V1_FIELD_EVIDENCE_INTAKE_GUIDANCE_COMMANDS.length,
    },
    ruleTopics: [
      "passed / accepted 必须填写现场证据编号",
      "签字 signed / accepted 必须填写负责人和时间",
      "V1/V2 边界 confirmed 必须填写确认人和时间",
      "回填先生成 draft manifest，再校验并刷新 go-live suite",
    ],
    commands: V1_FIELD_EVIDENCE_INTAKE_GUIDANCE_COMMANDS,
    blockedReason: blockedParts.length
      ? blockedParts.join("；")
      : "现场证据、签字、边界和草稿状态仍需重新跑 release candidate 复核。",
    nextAction: ready
      ? "使用草稿 manifest 校验并刷新 go-live suite / release candidate，由负责人复核是否可宣布 V1 完成。"
      : "现场负责人先填写 evidence-items.csv 和 signoff-boundary.csv；再生成 draft manifest、校验并刷新 go-live suite / release candidate。",
    safeguards: {
      nonMutating: true,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawNotesIncluded: false,
      rawCsvIncluded: false,
      rawEvidenceItemsCsvIncluded: false,
      rawSignoffBoundaryCsvIncluded: false,
      rawFieldEvidenceIntakeRulesIncluded: false,
      rawFieldEvidenceDraftManifestIncluded: false,
      rawManifestIncluded: false,
      fieldEvidenceDraftFreshnessChecked: true,
      digestValuesIncluded: false,
      artifactPathExposed: false,
      localPathExposed: false,
      commandSecretsIncluded: false,
      realEnvValuesIncluded: false,
    },
  };
}

const V1_FIELD_EVIDENCE_INTAKE_GUIDANCE_COMMANDS = [
  {
    key: "apply-draft",
    label: "生成现场证据 manifest 草稿",
    command:
      "node scripts/apply-v1-field-evidence-intake.mjs --manifest <current-field-evidence-manifest> --csv <field-evidence-intake-csv> --signoff-boundary-csv <signoff-boundary-csv> --output <filled-field-evidence-manifest-draft>",
    description: "只生成草稿，不修改源 manifest。",
  },
  {
    key: "validate-draft",
    label: "校验现场证据 manifest 草稿",
    command:
      "node scripts/validate-v1-field-evidence-manifest.mjs --manifest <filled-field-evidence-manifest-draft>",
    description: "先确认 draft 结构和必填项，再进入 release candidate。",
  },
  {
    key: "refresh-suite",
    label: "刷新 go-live suite 和 release candidate",
    command:
      "node scripts/run-v1-go-live-suite.mjs --refresh-release-candidate --field-evidence-manifest <current-field-evidence-manifest> --field-evidence-intake-csv <field-evidence-intake-csv> --field-evidence-signoff-boundary-csv <signoff-boundary-csv> --field-evidence-draft-output <filled-field-evidence-manifest-draft> --output-root <v1-go-live-suite-output> --sync-canonical-latest",
    description: "刷新后再看发布门禁、现场证据和签字是否全部通过。",
  },
];

function summarizeV1FieldEvidenceIntakeRows(csvText) {
  const rows = parseV1GoLiveCsvRows(csvText)
    .filter((row) => normalizeV1BooleanLike(row.required, true));
  let filledEvidenceRows = 0;
  let completedEvidenceRows = 0;
  let invalidEvidenceRows = 0;
  let blockedEvidenceRows = 0;
  let notApplicableEvidenceRows = 0;
  rows.forEach((row) => {
    const status = normalizeV1IntakeStatus(row.onsiteStatus || row.status || "pending");
    const evidenceFilled =
      normalizeV1BooleanLike(row.evidenceRefFilled, false) ||
      Boolean(cleanServerText(row.onsiteEvidenceRef));
    if (evidenceFilled) filledEvidenceRows += 1;
    if (["passed", "accepted"].includes(status)) {
      if (evidenceFilled) {
        completedEvidenceRows += 1;
      } else {
        invalidEvidenceRows += 1;
      }
    } else if (status === "not_applicable") {
      notApplicableEvidenceRows += 1;
      completedEvidenceRows += 1;
    } else if (status === "blocked") {
      blockedEvidenceRows += 1;
    } else if (evidenceFilled) {
      invalidEvidenceRows += 1;
    }
  });
  return {
    evidenceCsvStatus: rows.length > 0 ? "present" : "missing",
    requiredEvidenceRows: rows.length,
    filledEvidenceRows,
    completedEvidenceRows,
    invalidEvidenceRows,
    blockedEvidenceRows,
    notApplicableEvidenceRows,
  };
}

function summarizeV1FieldEvidenceIntakeSignoffRows(csvText) {
  const rows = parseV1GoLiveCsvRows(csvText);
  const signoffRows = rows.filter((row) =>
    cleanServerText(row.recordType) === "signoff" &&
    normalizeV1BooleanLike(row.required, true)
  );
  const boundaryRows = rows.filter((row) =>
    cleanServerText(row.recordType) === "boundary" &&
    normalizeV1BooleanLike(row.required, true)
  );
  let filledSignoffRows = 0;
  let completedSignoffRows = 0;
  let invalidSignoffRows = 0;
  signoffRows.forEach((row) => {
    const status = normalizeV1IntakeStatus(row.onsiteStatus || row.status || "pending");
    const personFilled =
      normalizeV1BooleanLike(row.filledName, false) ||
      Boolean(cleanServerText(row.onsiteSigner));
    const timeFilled =
      normalizeV1BooleanLike(row.filledTime, false) ||
      Boolean(cleanServerText(row.onsiteSignedAt));
    if (personFilled || timeFilled) filledSignoffRows += 1;
    if (["signed", "accepted"].includes(status) && personFilled && timeFilled) {
      completedSignoffRows += 1;
    } else if (["signed", "accepted"].includes(status) || personFilled || timeFilled) {
      invalidSignoffRows += 1;
    }
  });
  const boundaryRow = boundaryRows[0] ?? {};
  const boundaryStatus = normalizeV1IntakeStatus(
    boundaryRow.onsiteStatus || boundaryRow.status || "pending",
  );
  const boundaryPersonFilled =
    normalizeV1BooleanLike(boundaryRow.filledName, false) ||
    Boolean(cleanServerText(boundaryRow.onsiteConfirmedBy));
  const boundaryTimeFilled =
    normalizeV1BooleanLike(boundaryRow.filledTime, false) ||
    Boolean(cleanServerText(boundaryRow.onsiteConfirmedAt));
  const boundaryReady =
    ["confirmed", "accepted"].includes(boundaryStatus) &&
    boundaryPersonFilled &&
    boundaryTimeFilled;
  const boundaryInvalid =
    ["confirmed", "accepted"].includes(boundaryStatus) ||
    boundaryPersonFilled ||
    boundaryTimeFilled;
  return {
    signoffCsvStatus: rows.length > 0 ? "present" : "missing",
    signoffRows: signoffRows.length,
    filledSignoffRows,
    completedSignoffRows,
    invalidSignoffRows: invalidSignoffRows + (!boundaryReady && boundaryInvalid ? 1 : 0),
    boundaryStatus,
    boundaryLabel: boundaryReady ? "已确认" : boundaryStatus === "blocked" ? "已阻塞" : "待确认",
    boundaryReady,
  };
}

function normalizeV1FieldEvidenceDraftManifestStatus(artifact = {}) {
  const status = cleanServerText(artifact.status);
  if (status === "loaded") return "available";
  if (status === "invalid") return "invalid";
  return "missing";
}

function buildV1FieldEvidenceDraftFreshness(
  fieldEvidenceItemsCsv = "",
  signoffBoundaryCsv = "",
  draftManifestArtifact = {},
) {
  const draftManifestStatus = normalizeV1FieldEvidenceDraftManifestStatus(draftManifestArtifact);
  if (draftManifestStatus !== "available") {
    const label = draftManifestStatus === "invalid" ? "草稿异常" : "未生成";
    return {
      status: draftManifestStatus === "invalid" ? "invalid" : "missing",
      ready: false,
      label,
      summary: {
        label,
        draftManifestStatus,
        evidenceCsvMatched: false,
        signoffBoundaryCsvMatched: false,
        evidenceRowCount: parseV1GoLiveCsvRows(fieldEvidenceItemsCsv).length,
        signoffBoundaryRowCount: parseV1GoLiveCsvRows(signoffBoundaryCsv).length,
        draftSnapshotAvailable: false,
        staleReasonCount: 0,
      },
      checks: [],
      nextAction:
        draftManifestStatus === "invalid"
          ? "重新生成现场证据 manifest 草稿，再执行校验和刷新预检。"
          : "先生成现场证据 manifest 草稿，再执行校验和刷新预检。",
      safeguards: buildV1FieldEvidenceDraftFreshnessSafeguards(),
    };
  }

  const snapshot = isPlainServerObject(draftManifestArtifact.value?.fieldEvidenceIntakeSnapshot)
    ? draftManifestArtifact.value.fieldEvidenceIntakeSnapshot
    : {};
  const evidenceSnapshot = isPlainServerObject(snapshot.evidenceCsv) ? snapshot.evidenceCsv : {};
  const signoffBoundarySnapshot = isPlainServerObject(snapshot.signoffBoundaryCsv)
    ? snapshot.signoffBoundaryCsv
    : {};
  const expectedEvidence = buildV1FieldEvidenceInputSnapshotPart(fieldEvidenceItemsCsv);
  const expectedSignoffBoundary = buildV1FieldEvidenceInputSnapshotPart(signoffBoundaryCsv);
  const snapshotAvailable = snapshot.schema === "erp-v1-field-evidence-intake-snapshot-v1";
  const evidenceCsvMatched =
    snapshotAvailable &&
    evidenceSnapshot.included === true &&
    cleanServerText(evidenceSnapshot.digest) === expectedEvidence.digest &&
    normalizeV1NonNegativeInteger(evidenceSnapshot.rowCount) === expectedEvidence.rowCount;
  const signoffBoundaryCsvMatched =
    snapshotAvailable &&
    signoffBoundarySnapshot.included === true &&
    cleanServerText(signoffBoundarySnapshot.digest) === expectedSignoffBoundary.digest &&
    normalizeV1NonNegativeInteger(signoffBoundarySnapshot.rowCount) === expectedSignoffBoundary.rowCount;
  const staleReasons = [];
  if (!snapshotAvailable) {
    staleReasons.push("草稿缺少输入快照，无法确认是否对应当前 CSV。");
  } else {
    if (!evidenceCsvMatched) staleReasons.push("现场证据 CSV 已变化或快照不匹配。");
    if (!signoffBoundaryCsvMatched) staleReasons.push("签字 / 边界 CSV 已变化或快照不匹配。");
  }
  const ready = snapshotAvailable && evidenceCsvMatched && signoffBoundaryCsvMatched;
  const status = ready ? "fresh" : snapshotAvailable ? "stale" : "metadata_missing";
  const label = formatV1FieldEvidenceDraftFreshnessLabel(status);
  const checks = [
    buildV1FieldEvidenceIntakeQualityCheck({
      key: "evidence-csv-snapshot",
      label: "现场证据 CSV 快照",
      ready: evidenceCsvMatched,
      blocking: true,
      detail: evidenceCsvMatched
        ? `草稿匹配当前现场证据 CSV，行数 ${expectedEvidence.rowCount}。`
        : snapshotAvailable
          ? "当前现场证据 CSV 与草稿快照不一致。"
          : "草稿未记录现场证据 CSV 快照。",
      nextAction: evidenceCsvMatched
        ? "继续校验草稿。"
        : "重新生成 manifest 草稿，让草稿匹配当前 evidence-items.csv。",
    }),
    buildV1FieldEvidenceIntakeQualityCheck({
      key: "signoff-boundary-csv-snapshot",
      label: "签字 / 边界 CSV 快照",
      ready: signoffBoundaryCsvMatched,
      blocking: true,
      detail: signoffBoundaryCsvMatched
        ? `草稿匹配当前签字 / 边界 CSV，行数 ${expectedSignoffBoundary.rowCount}。`
        : snapshotAvailable
          ? "当前签字 / 边界 CSV 与草稿快照不一致。"
          : "草稿未记录签字 / 边界 CSV 快照。",
      nextAction: signoffBoundaryCsvMatched
        ? "继续校验草稿。"
        : "重新生成 manifest 草稿，让草稿匹配当前 signoff-boundary.csv。",
    }),
  ];
  return {
    status,
    ready,
    label,
    generatedAt: cleanServerText(snapshot.generatedAt),
    summary: {
      label,
      draftManifestStatus,
      evidenceCsvMatched,
      signoffBoundaryCsvMatched,
      evidenceRowCount: expectedEvidence.rowCount,
      signoffBoundaryRowCount: expectedSignoffBoundary.rowCount,
      draftSnapshotAvailable: snapshotAvailable,
      staleReasonCount: staleReasons.length,
    },
    checks,
    staleReasons: staleReasons.slice(0, 3).map(sanitizeV1RoleTaskActionText),
    nextAction: ready
      ? "草稿已匹配当前 CSV，可继续校验和刷新预检。"
      : "重新生成现场证据 manifest 草稿后，再执行草稿校验和 release candidate 刷新预检。",
    safeguards: buildV1FieldEvidenceDraftFreshnessSafeguards(),
  };
}

function buildV1FieldEvidenceInputSnapshotPart(csvText = "") {
  return {
    digest: createHash("sha256").update(String(csvText || ""), "utf8").digest("hex"),
    rowCount: parseV1GoLiveCsvRows(csvText).length,
  };
}

function formatV1FieldEvidenceDraftFreshnessLabel(status) {
  if (status === "fresh") return "已匹配";
  if (status === "stale") return "已过期";
  if (status === "metadata_missing") return "需重生成";
  if (status === "invalid") return "草稿异常";
  return "未生成";
}

function buildV1FieldEvidenceDraftFreshnessSafeguards() {
  return {
    nonMutating: true,
    rawCsvIncluded: false,
    rawEvidenceRefsIncluded: false,
    rawSignersIncluded: false,
    rawFieldEvidenceDraftManifestIncluded: false,
    digestValuesIncluded: false,
    artifactPathExposed: false,
    localPathExposed: false,
  };
}

function normalizeV1IntakeStatus(value) {
  return cleanServerText(value).toLowerCase() || "pending";
}

function sanitizeV1FieldEvidenceIntakeQuality(
  fieldEvidenceItemsCsv = "",
  signoffBoundaryCsv = "",
  options = {},
) {
  const rulesArtifact = isPlainServerObject(options.rulesArtifact) ? options.rulesArtifact : {};
  const draftManifestArtifact = isPlainServerObject(options.draftManifestArtifact)
    ? options.draftManifestArtifact
    : {};
  const draftFreshness = isPlainServerObject(options.draftFreshness)
    ? options.draftFreshness
    : buildV1FieldEvidenceDraftFreshness(fieldEvidenceItemsCsv, signoffBoundaryCsv, draftManifestArtifact);
  const evidenceSummary = summarizeV1FieldEvidenceIntakeRows(fieldEvidenceItemsCsv);
  const signoffSummary = summarizeV1FieldEvidenceIntakeSignoffRows(signoffBoundaryCsv);
  const draftManifestStatus = normalizeV1FieldEvidenceDraftManifestStatus(draftManifestArtifact);
  const draftFreshnessStatus = cleanServerText(draftFreshness.status) || "missing";
  const draftFreshnessReady = draftFreshness.ready === true;
  const missingEvidenceRows = Math.max(
    0,
    evidenceSummary.requiredEvidenceRows - evidenceSummary.completedEvidenceRows,
  );
  const missingSignoffRows = Math.max(0, signoffSummary.signoffRows - signoffSummary.completedSignoffRows);
  const rulesAvailable = rulesArtifact.status === "loaded";
  const canGenerateDraft =
    evidenceSummary.evidenceCsvStatus === "present" &&
    signoffSummary.signoffCsvStatus === "present" &&
    rulesAvailable;
  const canRefreshReleaseCandidate =
    draftManifestStatus === "available" &&
    draftFreshnessReady &&
    evidenceSummary.requiredEvidenceRows > 0 &&
    missingEvidenceRows === 0 &&
    signoffSummary.signoffRows > 0 &&
    missingSignoffRows === 0 &&
    signoffSummary.boundaryReady &&
    evidenceSummary.invalidEvidenceRows === 0 &&
    signoffSummary.invalidSignoffRows === 0;
  const checks = [
    buildV1FieldEvidenceIntakeQualityCheck({
      key: "evidence-csv",
      label: "现场证据 CSV",
      ready: evidenceSummary.evidenceCsvStatus === "present",
      blocking: true,
      detail:
        evidenceSummary.evidenceCsvStatus === "present"
          ? `已读取 ${evidenceSummary.requiredEvidenceRows} 项必填证据。`
          : "缺少 evidence-items.csv，无法生成现场证据草稿。",
      nextAction:
        evidenceSummary.evidenceCsvStatus === "present"
          ? "现场负责人继续填写证据状态和归档编号。"
          : "先生成现场证据采集包，或把填写后的 evidence-items.csv 放回采集目录。",
    }),
    buildV1FieldEvidenceIntakeQualityCheck({
      key: "signoff-csv",
      label: "签字 / 边界 CSV",
      ready: signoffSummary.signoffCsvStatus === "present",
      blocking: true,
      detail:
        signoffSummary.signoffCsvStatus === "present"
          ? `已读取 ${signoffSummary.signoffRows} 个负责人签字和 V1/V2 边界行。`
          : "缺少 signoff-boundary.csv，无法核对签字和边界确认。",
      nextAction:
        signoffSummary.signoffCsvStatus === "present"
          ? "继续补负责人、签字时间和 V1/V2 边界确认。"
          : "把填写后的 signoff-boundary.csv 放回采集目录。",
    }),
    buildV1FieldEvidenceIntakeQualityCheck({
      key: "intake-rules",
      label: "填写规则文件",
      ready: rulesAvailable,
      blocking: true,
      detail: rulesAvailable
        ? "现场证据填写规则已随采集包生成。"
        : "缺少 intake-rules.zh-CN.md，现场容易填错状态和必填字段。",
      nextAction: rulesAvailable
        ? "按规则文件状态字典填写 CSV。"
        : "重新生成现场证据采集包，确保规则文件随包分发。",
    }),
    buildV1FieldEvidenceIntakeQualityCheck({
      key: "draft-manifest",
      label: "manifest 草稿",
      ready: draftManifestStatus === "available",
      blocking: true,
      detail:
        draftManifestStatus === "available"
          ? "已生成现场证据 manifest 草稿，可继续校验。"
          : draftManifestStatus === "invalid"
            ? "草稿 manifest 无法读取或结构异常。"
            : "尚未生成 manifest 草稿。",
      nextAction:
        draftManifestStatus === "available"
          ? "执行 manifest 校验，再刷新 go-live suite / release candidate。"
          : "先执行生成现场证据 manifest 草稿命令。",
    }),
    buildV1FieldEvidenceIntakeQualityCheck({
      key: "draft-freshness",
      label: "草稿新鲜度",
      ready: draftManifestStatus === "available" ? draftFreshnessReady : true,
      blocking: draftManifestStatus === "available",
      detail:
        draftManifestStatus !== "available"
          ? "草稿未生成前不检查新鲜度。"
          : draftFreshnessReady
            ? `草稿已匹配当前 CSV：证据 ${draftFreshness.summary?.evidenceRowCount || 0} 行，签字 / 边界 ${draftFreshness.summary?.signoffBoundaryRowCount || 0} 行。`
            : `草稿${draftFreshness.label || "需重生成"}，不能用于刷新 release candidate。`,
      nextAction:
        draftManifestStatus !== "available"
          ? "先生成 manifest 草稿。"
          : draftFreshnessReady
            ? "继续执行 manifest 校验和刷新预检。"
            : "重新生成 manifest 草稿，让草稿匹配当前 evidence-items.csv 和 signoff-boundary.csv。",
    }),
    buildV1FieldEvidenceIntakeQualityCheck({
      key: "evidence-completion",
      label: "证据完成度",
      ready: missingEvidenceRows === 0 && evidenceSummary.requiredEvidenceRows > 0,
      blocking: true,
      detail: `已完成 ${evidenceSummary.completedEvidenceRows}/${evidenceSummary.requiredEvidenceRows} 项必填证据，缺 ${missingEvidenceRows} 项。`,
      nextAction:
        missingEvidenceRows === 0 && evidenceSummary.requiredEvidenceRows > 0
          ? "重新生成草稿并刷新 release candidate 复核。"
          : "继续补真实生产、对象存储、打印、司机真机和业务试跑证据。",
    }),
    buildV1FieldEvidenceIntakeQualityCheck({
      key: "signoff-completion",
      label: "负责人签字",
      ready: missingSignoffRows === 0 && signoffSummary.signoffRows > 0,
      blocking: true,
      detail: `已完成 ${signoffSummary.completedSignoffRows}/${signoffSummary.signoffRows} 个负责人签字，缺 ${missingSignoffRows} 个。`,
      nextAction:
        missingSignoffRows === 0 && signoffSummary.signoffRows > 0
          ? "继续复核 V1/V2 边界确认。"
          : "补齐办公室、仓库/出库、车间、司机、财务、技术/管理签字。",
    }),
    buildV1FieldEvidenceIntakeQualityCheck({
      key: "v1-v2-boundary",
      label: "V1/V2 边界确认",
      ready: signoffSummary.boundaryReady,
      blocking: true,
      detail: `边界状态：${signoffSummary.boundaryLabel}。`,
      nextAction: signoffSummary.boundaryReady
        ? "边界已确认，等待 release candidate 复核。"
        : "由负责人确认哪些必须留在 V1、哪些进入 V2，并填写确认人和时间。",
    }),
    buildV1FieldEvidenceIntakeQualityCheck({
      key: "invalid-row-check",
      label: "无效回填行",
      ready: evidenceSummary.invalidEvidenceRows === 0 && signoffSummary.invalidSignoffRows === 0,
      blocking: true,
      detail: `证据无效行 ${evidenceSummary.invalidEvidenceRows}，签字/边界无效行 ${signoffSummary.invalidSignoffRows}。`,
      nextAction:
        evidenceSummary.invalidEvidenceRows === 0 && signoffSummary.invalidSignoffRows === 0
          ? "无无效回填行，继续补缺失项。"
          : "先修正状态已填但缺证据编号、负责人或时间的行。",
    }),
  ];
  const blockingIssueCount = checks.filter((item) => item.blocking && !item.ready).length;
  const warningIssueCount = checks.filter((item) => !item.blocking && !item.ready).length;
  const ready = canRefreshReleaseCandidate && blockingIssueCount === 0;

  return {
    status: ready ? "ready" : "blocked",
    ready,
    available:
      evidenceSummary.evidenceCsvStatus === "present" ||
      signoffSummary.signoffCsvStatus === "present" ||
      rulesAvailable ||
      draftManifestStatus === "available",
    summary: {
      label: ready ? "现场回填质量已具备刷新发布候选条件" : "现场回填质量仍未达标",
      evidenceCsvStatus: evidenceSummary.evidenceCsvStatus,
      signoffCsvStatus: signoffSummary.signoffCsvStatus,
      evidenceProgress: `${evidenceSummary.completedEvidenceRows}/${evidenceSummary.requiredEvidenceRows}`,
      signoffProgress: `${signoffSummary.completedSignoffRows}/${signoffSummary.signoffRows}`,
      missingEvidenceRows,
      missingSignoffRows,
      filledEvidenceRows: evidenceSummary.filledEvidenceRows,
      filledSignoffRows: signoffSummary.filledSignoffRows,
      invalidEvidenceRows: evidenceSummary.invalidEvidenceRows,
      invalidSignoffRows: signoffSummary.invalidSignoffRows,
      blockedEvidenceRows: evidenceSummary.blockedEvidenceRows,
      notApplicableEvidenceRows: evidenceSummary.notApplicableEvidenceRows,
      boundaryStatus: signoffSummary.boundaryStatus,
      boundaryLabel: signoffSummary.boundaryLabel,
      boundaryReady: signoffSummary.boundaryReady,
      draftManifestStatus,
      draftFreshnessStatus,
      draftFreshnessLabel: cleanServerText(draftFreshness.label) || formatV1FieldEvidenceDraftFreshnessLabel(draftFreshnessStatus),
      draftFreshnessReady,
      rulesAvailable,
      canGenerateDraft,
      canRefreshReleaseCandidate,
      checkCount: checks.length,
      blockingIssueCount,
      warningIssueCount,
    },
    checks,
    nextAction: ready
      ? "使用 draft manifest 刷新 go-live suite / release candidate，并由负责人复核。"
      : canGenerateDraft
        ? "先补缺失证据、签字和边界确认；必要时重新生成 draft manifest 后再校验。"
        : "先补齐现场证据 CSV、签字/边界 CSV 和规则文件，再进入草稿生成。",
    safeguards: {
      nonMutating: true,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawNotesIncluded: false,
      rawCsvIncluded: false,
      rawFieldEvidenceDraftManifestIncluded: false,
      fieldEvidenceDraftFreshnessChecked: true,
      digestValuesIncluded: false,
      artifactPathExposed: false,
      localPathExposed: false,
      commandSecretsIncluded: false,
      realEnvValuesIncluded: false,
    },
  };
}

function buildV1FieldEvidenceIntakeQualityCheck({
  key,
  label,
  ready,
  blocking = true,
  detail,
  nextAction,
}) {
  return {
    key,
    label,
    status: ready ? "passed" : "blocked",
    ready: Boolean(ready),
    blocking: Boolean(blocking),
    statusLabel: ready ? "通过" : blocking ? "阻塞" : "待处理",
    detail: sanitizeV1RoleTaskActionText(detail),
    nextAction: sanitizeV1RoleTaskActionText(nextAction),
  };
}

function parseV1FieldEvidenceMissingItems(csvText, fallback = {}) {
  const rows = parseV1GoLiveCsvRows(csvText);
  const missing = rows
    .map(sanitizeV1FieldEvidenceMissingItem)
    .filter(Boolean)
    .filter((item) => item.required && !item.ready);
  const fallbackItems = parseV1FieldEvidenceMissingItemsFromValidation(fallback);
  if (fallbackItems.length > 0) {
    return {
      totalCount: fallbackItems.length,
      items: fallbackItems,
    };
  }
  return {
    totalCount: missing.length,
    items: missing,
  };
}

function parseV1FieldEvidenceMissingItemsFromValidation(validation = {}) {
  const blockers = Array.isArray(validation.blockers) ? validation.blockers : [];
  const groups = Array.isArray(validation.groups) ? validation.groups : [];
  const groupsByKey = new Map(
    groups.map((group) => [cleanServerText(group?.key), group]).filter(([key]) => key),
  );
  return blockers
    .filter((blocker) => cleanServerText(blocker?.type) === "evidence_item")
    .map((blocker) => {
      const groupKey = cleanServerText(blocker.groupKey);
      const key = cleanServerText(blocker.key);
      const group = groupsByKey.get(groupKey) || {};
      const item = Array.isArray(group.items)
        ? group.items.find((candidate) => cleanServerText(candidate?.key) === key) || {}
        : {};
      const evidenceFilled = item.evidenceRefFilled === true;
      return {
        key,
        groupKey,
        groupLabel: cleanServerText(blocker.groupLabel || group.label),
        ownerRole: cleanServerText(group.ownerRole),
        label: cleanServerText(blocker.label || item.label),
        required: true,
        status: cleanServerText(blocker.status || item.status || "pending") || "pending",
        ready: false,
        evidenceFilled,
        progressLabel: evidenceFilled ? "已填证据 / 待确认状态" : "缺证据",
        nextAction: evidenceFilled
          ? "确认现场证据有效后，把 onsiteStatus 更新为 passed 或 accepted。"
          : "补现场截图、报告名或内部归档编号后，回填 evidence-items.csv。",
      };
    })
    .filter((item) => item.groupKey && item.key && item.label);
}

function sanitizeV1FieldEvidenceMissingItem(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const key = cleanServerText(value.itemKey || value.key);
  const label = cleanServerText(value.itemLabel || value.label);
  if (!key || !label) return null;
  const groupKey = cleanServerText(value.groupKey);
  const groupLabel = cleanServerText(value.groupLabel);
  const ownerRole = cleanServerText(value.ownerRole);
  const required = normalizeV1BooleanLike(value.required, true);
  const status = cleanServerText(value.onsiteStatus || value.status || "pending") || "pending";
  const sourceStatus = cleanServerText(value.status || "pending") || "pending";
  const evidenceFilled = normalizeV1BooleanLike(value.evidenceRefFilled, false) || Boolean(cleanServerText(value.onsiteEvidenceRef));
  const ready = ["passed", "accepted", "ready", "completed", "done", "not_applicable"].includes(status) ||
    ["passed", "accepted", "ready", "completed", "done"].includes(sourceStatus);
  return {
    key,
    groupKey,
    groupLabel,
    ownerRole,
    label,
    required,
    status: ready ? "ready" : status,
    ready,
    evidenceFilled,
    progressLabel: ready ? "已通过" : evidenceFilled ? "已填证据 / 待确认状态" : "缺证据",
    nextAction: ready
      ? "该项已满足，重新跑 release candidate 复核。"
      : evidenceFilled
        ? "确认现场证据有效后，把 onsiteStatus 更新为 passed 或 accepted。"
        : "补现场截图、报告名或内部归档编号后，回填 evidence-items.csv。",
  };
}

function parseV1FieldEvidenceSignoffBoundaryActions(csvText, fallback = {}) {
  const rows = parseV1GoLiveCsvRows(csvText);
  const parsedActions = rows
    .map(sanitizeV1FieldEvidenceSignoffBoundaryAction)
    .filter(Boolean)
    .filter((item) => item.required && !item.ready);
  const fallbackActions = [
    ...(Array.isArray(fallback.signoffs)
      ? fallback.signoffs.map((signoff) => ({
          type: "signoff",
          key: signoff.role,
          label: signoff.role,
          required: signoff.required,
          status: signoff.status,
          ready: signoff.ready === true || signoff.blocking === false,
          personFilled: signoff.signerFilled,
          timeFilled: signoff.signedAtFilled,
          progressLabel: signoff.progressLabel,
          nextAction: signoff.nextAction,
        }))
      : []),
    fallback.boundary
      ? {
          type: "boundary",
          key: "v1_v2_boundary",
          label: "V1/V2 边界确认",
          required: true,
          status: fallback.boundary.status,
          ready: fallback.boundary.ready === true || fallback.boundary.blocking === false,
          personFilled: fallback.boundary.confirmedByFilled,
          timeFilled: fallback.boundary.confirmedAtFilled,
          progressLabel: fallback.boundary.ready
            ? "已确认"
            : `${fallback.boundary.confirmedByFilled ? "已填确认人" : "缺确认人"} / ${fallback.boundary.confirmedAtFilled ? "已填时间" : "缺时间"}`,
          nextAction: fallback.boundary.nextAction,
        }
      : null,
  ].filter((item) => item && item.required && !item.ready);
  if (fallbackActions.length > 0) {
    return {
      totalCount: fallbackActions.length,
      items: fallbackActions.slice(0, 8),
    };
  }
  if (parsedActions.length > 0) {
    return {
      totalCount: parsedActions.length,
      items: parsedActions.slice(0, 8),
    };
  }
  return {
    totalCount: fallbackActions.length,
    items: fallbackActions.slice(0, 8),
  };
}

function sanitizeV1FieldEvidenceSignoffBoundaryAction(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const type = cleanServerText(value.recordType);
  if (!["signoff", "boundary"].includes(type)) return null;
  const key = cleanServerText(type === "boundary" ? value.role || "v1_v2_boundary" : value.role);
  const label = cleanServerText(value.label || key);
  if (!key || !label) return null;
  const required = normalizeV1BooleanLike(value.required, true);
  const status = cleanServerText(value.onsiteStatus || value.status || "pending") || "pending";
  const personFilled = type === "boundary"
    ? normalizeV1BooleanLike(value.filledName, false) || Boolean(cleanServerText(value.onsiteConfirmedBy))
    : normalizeV1BooleanLike(value.filledName, false) || Boolean(cleanServerText(value.onsiteSigner));
  const timeFilled = type === "boundary"
    ? normalizeV1BooleanLike(value.filledTime, false) || Boolean(cleanServerText(value.onsiteConfirmedAt))
    : normalizeV1BooleanLike(value.filledTime, false) || Boolean(cleanServerText(value.onsiteSignedAt));
  const ready = type === "boundary"
    ? ["confirmed", "accepted", "ready", "completed", "done"].includes(status) && personFilled && timeFilled
    : ["signed", "accepted", "ready", "completed", "done"].includes(status) && personFilled && timeFilled;
  return {
    type,
    key,
    label,
    required,
    status: ready ? "ready" : status,
    ready,
    personFilled,
    timeFilled,
    progressLabel: ready
      ? (type === "boundary" ? "已确认" : "已签字")
      : type === "boundary"
        ? `${personFilled ? "已填确认人" : "缺确认人"} / ${timeFilled ? "已填时间" : "缺时间"}`
        : `${personFilled ? "已填签字人" : "缺签字人"} / ${timeFilled ? "已填时间" : "缺时间"}`,
    nextAction: ready
      ? "已填写，重新跑 release candidate 复核。"
      : type === "boundary"
        ? "负责人确认 V1 必做项和 V2 延后项后，填写确认人和时间。"
        : "负责人复核真实证据后，填写签字人和签字时间。",
  };
}

function normalizeV1BooleanLike(value, fallback = false) {
  if (value === true || value === false) return value;
  const text = cleanServerText(value).toLowerCase();
  if (["yes", "true", "1", "y", "required"].includes(text)) return true;
  if (["no", "false", "0", "n", "optional"].includes(text)) return false;
  return fallback;
}

function parseV1GoLiveCsvRows(text) {
  if (!text || typeof text !== "string") return [];
  const records = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char === "\r") continue;
    cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    records.push(row);
  }
  if (records.length === 0) return [];
  const headers = records[0].map((header) => cleanServerText(header));
  return records
    .slice(1)
    .filter((record) => record.some((entry) => cleanServerText(entry)))
    .map((record) => {
      const rowObject = {};
      headers.forEach((header, index) => {
        if (header) rowObject[header] = cleanServerText(record[index]);
      });
      return rowObject;
    });
}

function buildV1FieldEvidenceGroupSummariesForStatus(groups = [], missingItems = []) {
  const missingByGroup = new Map();
  missingItems.forEach((item) => {
    const groupKey = cleanServerText(item.groupKey || item.group || "ungrouped");
    if (!groupKey) return;
    if (!missingByGroup.has(groupKey)) {
      missingByGroup.set(groupKey, []);
    }
    missingByGroup.get(groupKey).push(item);
  });

  return groups
    .map((group) => {
      const groupKey = cleanServerText(group.key);
      const groupMissingItems = missingByGroup.get(groupKey) || [];
      const requiredTotal = normalizeV1NonNegativeInteger(group.requiredTotal);
      const completedRequired = normalizeV1NonNegativeInteger(group.completedRequired);
      const missingCount =
        groupMissingItems.length || normalizeV1NonNegativeInteger(group.blockedRequired);
      return {
        key: groupKey,
        label: cleanServerText(group.label),
        ownerRole: cleanServerText(group.ownerRole),
        ready: Boolean(group.ready),
        status: group.ready ? "ready" : "blocked",
        statusLabel: group.ready ? "已满足" : "阻塞",
        requiredTotal,
        completedRequired,
        blockedRequired: missingCount,
        progressLabel: cleanServerText(group.progressLabel) || `${completedRequired}/${requiredTotal}`,
        missingCount,
        missingLabel: requiredTotal > 0 ? `${missingCount}/${requiredTotal}` : `${missingCount}`,
        nextAction: cleanServerText(group.nextAction),
        firstMissingItems: groupMissingItems.slice(0, 3),
      };
    })
    .filter((group) => group.key);
}

function sanitizeV1FieldEvidenceGroup(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const key = cleanServerText(value.key);
  const label = cleanServerText(value.label);
  if (!key || !label) return null;
  const requiredTotal = normalizeV1NonNegativeInteger(value.requiredTotal);
  const completedRequired = normalizeV1NonNegativeInteger(value.completedRequired);
  const blockedRequired = normalizeV1NonNegativeInteger(value.blockedRequired);
  const ready = value.ready === true;
  return {
    key,
    label,
    ownerRole: cleanServerText(value.ownerRole),
    status: ready ? "ready" : "blocked",
    ready,
    requiredTotal,
    completedRequired,
    blockedRequired,
    progressLabel: `${completedRequired}/${requiredTotal}`,
    nextAction: blockedRequired
      ? `补齐 ${blockedRequired} 项现场证据并回填 evidence-items.csv。`
      : "该组现场证据已满足，重新跑 release candidate 复核。",
  };
}

function sanitizeV1FieldEvidenceSignoff(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const role = cleanServerText(value.role);
  if (!role) return null;
  const signerFilled = Boolean(value.signerFilled);
  const signedAtFilled = Boolean(value.signedAtFilled);
  const ready = Boolean(value.ready);
  return {
    role,
    required: value.required !== false,
    status: ready ? "ready" : cleanServerText(value.status) || "pending",
    ready,
    signerFilled,
    signedAtFilled,
    progressLabel: ready ? "已签字" : `${signerFilled ? "已填签字人" : "缺签字人"} / ${signedAtFilled ? "已填时间" : "缺时间"}`,
    nextAction: ready
      ? "签字已满足，重新跑 release candidate 复核。"
      : "负责人复核真实证据后填写签字人 / 签字时间。",
  };
}

function sanitizeV1FieldEvidenceBoundary(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const status = cleanServerText(source.status) || "pending";
  const ready = Boolean(source.ready);
  return {
    status: ready ? "confirmed" : status,
    ready,
    confirmedByFilled: Boolean(source.confirmedByFilled),
    confirmedAtFilled: Boolean(source.confirmedAtFilled),
    v1ItemCount: normalizeV1NonNegativeInteger(source.v1ItemCount),
    v2ItemCount: normalizeV1NonNegativeInteger(source.v2ItemCount),
    nextAction: ready
      ? "V1/V2 边界已确认，重新跑 release candidate 复核。"
      : "负责人确认 V1 必做项和 V2 延后项后填写确认人 / 时间。",
  };
}

function sanitizeV1ProductionEnvGate(envPreflight = {}, envFileAudit = {}, fallbackFixChecklist = []) {
  const preflight = isPlainServerObject(envPreflight) ? envPreflight : {};
  const preflightSummary = isPlainServerObject(preflight.summary) ? preflight.summary : {};
  const checksSource = Array.isArray(preflight.fixChecklist) && preflight.fixChecklist.length
    ? preflight.fixChecklist
    : fallbackFixChecklist;
  const checks = Array.isArray(checksSource)
    ? checksSource.map(sanitizeV1ProductionEnvFixItem).filter(Boolean)
    : [];
  const passedCount = normalizeV1NonNegativeInteger(
    preflightSummary.passedCount,
    checks.filter((item) => item.ready || item.status === "passed").length,
  );
  const totalCount = normalizeV1NonNegativeInteger(preflightSummary.totalCount, checks.length);
  const blockingCount = normalizeV1NonNegativeInteger(
    preflightSummary.blockingCount,
    checks.filter((item) => item.severity === "blocking" && !item.ready).length,
  );
  const warningCount = normalizeV1NonNegativeInteger(
    preflightSummary.warningCount,
    checks.filter((item) => item.severity === "warning" && !item.ready).length,
  );
  const placeholderValueCount = normalizeV1NonNegativeInteger(preflightSummary.placeholderValueCount);
  const audit = sanitizeV1ProductionEnvFileAudit(envFileAudit);
  const rawStatus = cleanServerText(preflight.status);
  const status = ["blocked", "warning", "passed", "ready"].includes(rawStatus)
    ? (rawStatus === "ready" ? "passed" : rawStatus)
    : blockingCount > 0
      ? "blocked"
      : warningCount > 0
        ? "warning"
        : "passed";
  const readinessLabel = totalCount ? `${passedCount}/${totalCount}` : cleanServerText(preflightSummary.label);
  const nextActions = sanitizeStringList(preflight.nextActions).slice(0, 6);

  return {
    status,
    ready: Boolean(preflight.ready === true && blockingCount === 0 && status === "passed"),
    available: Object.keys(preflight).length > 0 || checks.length > 0 || audit.available,
    checkedAt: cleanServerText(preflight.checkedAt || envFileAudit?.checkedAt),
    summary: {
      label: totalCount
        ? `生产配置门禁：${readinessLabel} 通过，${blockingCount} 项阻塞`
        : "生产配置门禁未生成",
      readinessLabel,
      passedCount,
      totalCount,
      blockingCount,
      warningCount,
      placeholderValueCount,
      envFileCount: audit.envFileCount,
      auditStatus: audit.status,
      auditLabel: audit.statusLabel,
    },
    checks,
    audit,
    nextActions,
    nextAction: nextActions[0] || "先补齐生产 env 文件，再重新跑 env 文件审计和生产环境变量预检。",
    safeguards: {
      nonMutating: true,
      envValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      rawEnvFileIncluded: false,
      rawEnvFileAuditIncluded: false,
      rawProductionEnvPreflightIncluded: false,
      rawLineContentIncluded: false,
      envFilePathExposed: false,
      artifactPathExposed: false,
    },
  };
}

function sanitizeV1ProductionEnvSetupReport(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const validScope = cleanServerText(source.scope) === "v1_production_env_setup";
  const summary = isPlainServerObject(source.summary) ? source.summary : {};
  const envFile = isPlainServerObject(source.envFile) ? source.envFile : {};
  const audit = isPlainServerObject(source.audit) ? source.audit : {};
  const envPreflight = isPlainServerObject(source.envPreflight) ? source.envPreflight : {};
  const remainingFixItems = Array.isArray(envPreflight.remainingFixItems)
    ? envPreflight.remainingFixItems.map(sanitizeV1ProductionEnvSetupRemainingFixItem).filter(Boolean).slice(0, 10)
    : [];
  const setupFindings = Array.isArray(source.setupFindings)
    ? source.setupFindings.map(sanitizeV1ProductionEnvSetupFinding).filter(Boolean).slice(0, 8)
    : [];
  const commands = Array.isArray(source.commands)
    ? source.commands.map(sanitizeV1ProductionEnvSetupCommand).filter(Boolean).slice(0, 10)
    : [];
  const envPreflightPassedCount = normalizeV1NonNegativeInteger(summary.envPreflightPassedCount ?? envPreflight.passedCount);
  const envPreflightTotalCount = normalizeV1NonNegativeInteger(summary.envPreflightTotalCount ?? envPreflight.totalCount);
  const envPreflightBlockingCount = normalizeV1NonNegativeInteger(summary.envPreflightBlockingCount ?? envPreflight.blockingCount);
  const envPreflightWarningCount = normalizeV1NonNegativeInteger(summary.envPreflightWarningCount ?? envPreflight.warningCount);
  const remainingFixItemCount = normalizeV1NonNegativeInteger(summary.remainingFixItemCount, remainingFixItems.length);
  const status = validScope
    ? cleanServerText(source.status) || (source.ready === true ? "ready" : source.setupReady === true ? "prepared" : "blocked")
    : "missing";
  const available = validScope && (Object.keys(summary).length > 0 || Object.keys(envFile).length > 0);
  const setupReady = validScope && source.setupReady === true;
  const ready = validScope && source.ready === true;
  return {
    status,
    ready,
    setupReady,
    available,
    checkedAt: cleanServerText(source.checkedAt),
    summary: {
      label: available
        ? sanitizeV1RoleTaskActionText(summary.label) ||
          (ready ? "生产 env 文件已通过安全审计和变量预检" : "生产 env 安全草稿已准备")
        : "生产 env setup 报告未生成",
      generated: summary.generated === true,
      imported: summary.imported === true,
      overwritten: summary.overwritten === true,
      targetExistedBefore: summary.targetExistedBefore === true,
      setupBlockingCount: normalizeV1NonNegativeInteger(summary.setupBlockingCount, setupFindings.length),
      auditReady: summary.auditReady === true || audit.ready === true,
      envPreflightReady: summary.envPreflightReady === true || envPreflight.ready === true,
      envPreflightPassedCount,
      envPreflightTotalCount,
      envPreflightBlockingCount,
      envPreflightWarningCount,
      envPreflightLabel: envPreflightTotalCount ? `${envPreflightPassedCount}/${envPreflightTotalCount}` : "",
      remainingFixItemCount,
    },
    envFile: {
      insideWorkspace: envFile.insideWorkspace === true,
      gitIgnored: envFile.gitIgnored === true,
      gitTracked: envFile.gitTracked === true,
      existedBefore: envFile.existedBefore === true,
      generated: envFile.generated === true,
      imported: envFile.imported === true,
      overwritten: envFile.overwritten === true,
      fileMode: cleanServerText(envFile.fileMode),
      assignmentCount: normalizeV1NonNegativeInteger(envFile.assignmentCount),
      placeholderAssignmentCount: normalizeV1NonNegativeInteger(envFile.placeholderAssignmentCount),
      pathExposed: false,
    },
    audit: {
      status: cleanServerText(audit.status) || "not_run",
      ready: audit.ready === true,
      blockingCount: normalizeV1NonNegativeInteger(audit.blockingCount),
      warningCount: normalizeV1NonNegativeInteger(audit.warningCount),
      crossFileDuplicateVariableCount: normalizeV1NonNegativeInteger(audit.crossFileDuplicateVariableCount),
    },
    envPreflight: {
      status: cleanServerText(envPreflight.status) || (remainingFixItemCount ? "blocked" : "not_run"),
      ready: envPreflight.ready === true,
      passedCount: envPreflightPassedCount,
      totalCount: envPreflightTotalCount,
      readinessLabel: envPreflightTotalCount ? `${envPreflightPassedCount}/${envPreflightTotalCount}` : "",
      blockingCount: envPreflightBlockingCount,
      warningCount: envPreflightWarningCount,
      remainingFixItems,
    },
    setupFindings,
    commands,
    nextActions: sanitizeStringList(source.nextActions).slice(0, 8),
    safeguards: {
      envValuesExposed: false,
      connectionStringExposed: false,
      objectStorageEndpointExposed: false,
      objectStorageBucketExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      spoolPathExposed: false,
      rawTemplateValuesCopied: false,
      importedEnvValuesExposed: false,
      envValueIntakeRealValuesExposed: false,
      productionEnvValueIntakeChecklistIncluded: source.safeguards?.productionEnvValueIntakeChecklistIncluded === true,
      productionEnvMinimumValuesFragmentTemplateIncluded: source.safeguards?.productionEnvMinimumValuesFragmentTemplateIncluded === true,
      productionEnvMinimumValuesFragmentTemplateRealValuesExposed: false,
      productionEnvValuesFragmentTemplateIncluded: source.safeguards?.productionEnvValuesFragmentTemplateIncluded === true,
      productionEnvValuesFragmentTemplateRealValuesExposed: false,
      generatedFileMode0600: source.safeguards?.generatedFileMode0600 === true || cleanServerText(envFile.fileMode) === "600",
      targetMustBeIgnoredOrOutsideWorkspace: true,
      envFilePathExposed: false,
      importSourcePathExposed: false,
      rawReportIncluded: false,
    },
  };
}

function sanitizeV1ProductionEnvSetupRemainingFixItem(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const key = cleanServerText(source.key);
  const label = sanitizeV1RoleTaskActionText(source.label);
  if (!key && !label) return null;
  return {
    key,
    label: label || key,
    ownerRole: sanitizeV1RoleTaskActionText(source.ownerRole),
    status: cleanServerText(source.status) || "pending",
    missingVariables: sanitizeStringList(source.missingVariables).slice(0, 12),
    placeholderVariables: sanitizeStringList(source.placeholderVariables).slice(0, 12),
    nextAction: sanitizeV1RoleTaskActionText(source.nextAction),
  };
}

function sanitizeV1ProductionEnvSetupFinding(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const key = cleanServerText(source.key);
  const label = sanitizeV1RoleTaskActionText(source.label);
  if (!key && !label) return null;
  return {
    key,
    label: label || key,
    status: cleanServerText(source.status) || "blocked",
    severity: cleanServerText(source.severity || source.status) || "blocking",
    detail: sanitizeV1RoleTaskActionText(source.detail),
    nextAction: sanitizeV1RoleTaskActionText(source.nextAction),
  };
}

function sanitizeV1ProductionEnvSetupCommand(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const key = cleanServerText(source.key);
  const label = sanitizeV1RoleTaskActionText(source.label);
  if (!key && !label) return null;
  const command = sanitizeV1ProductionEnvSetupCommandText(source.command);
  return {
    key,
    label: label || key,
    command,
  };
}

function sanitizeV1ProductionEnvSetupCommandText(value) {
  const text = cleanServerText(value);
  if (!text) return "";
  return text
    .replace(/(?:\/Users|\/private|\/var|\/tmp)[^\s'"]+/g, "<server-path>")
    .replace(/\.erp-local-storage\/[^\s'"]+/g, "<server-artifact>")
    .replace(/secure-prod\.env/g, "<secure-env-file>");
}

function sanitizeV1ProductionEnvFileAudit(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const summary = isPlainServerObject(source.summary) ? source.summary : {};
  const included = Boolean(source.included);
  const status = cleanServerText(source.status) || (included ? "missing" : "not_applicable");
  const ready = Boolean(source.ready);
  const envFileCount = normalizeV1NonNegativeInteger(source.envFileCount ?? summary.fileCount);
  const blockingCount = normalizeV1NonNegativeInteger(summary.blockingCount);
  const warningCount = normalizeV1NonNegativeInteger(summary.warningCount);
  const statusLabel = !included && status === "not_applicable"
    ? "未执行"
    : ready && blockingCount === 0
      ? "已通过"
      : blockingCount > 0
        ? "阻塞"
        : warningCount > 0
          ? "警告"
          : cleanServerText(summary.label) || status;
  return {
    status,
    statusLabel,
    ready,
    included,
    available: Object.keys(source).length > 0,
    envFileCount,
    summary: {
      label: cleanServerText(summary.label) || (included ? "env 文件安全审计未生成" : "未提供 --env-file，未执行 env 文件安全审计"),
      fileCount: normalizeV1NonNegativeInteger(summary.fileCount, envFileCount),
      blockingCount,
      warningCount,
      passedCount: normalizeV1NonNegativeInteger(summary.passedCount),
      placeholderAssignmentCount: normalizeV1NonNegativeInteger(summary.placeholderAssignmentCount),
      uncommentedAssignmentCount: normalizeV1NonNegativeInteger(summary.uncommentedAssignmentCount),
      sensitiveVariableNameCount: normalizeV1NonNegativeInteger(summary.sensitiveVariableNameCount),
      crossFileDuplicateVariableCount: normalizeV1NonNegativeInteger(summary.crossFileDuplicateVariableCount),
    },
    nextActions: sanitizeStringList(source.nextActions).slice(0, 4),
    safeguards: {
      nonMutating: true,
      envValuesIncluded: false,
      connectionStringExposed: false,
      secretFieldsExposed: false,
      commandValueExposed: false,
      commentsCopied: false,
      rawLineContentCopied: false,
      envFilePathExposed: false,
    },
  };
}

function sanitizeV1ProductionEnvIntakeVerification(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const allowedScopes = new Set([
    "v1_production_env_real_value_intake_verification",
    "v1_production_env_intake_verify",
  ]);
  const validScope = allowedScopes.has(cleanServerText(source.scope));
  const summary = isPlainServerObject(source.summary) ? source.summary : {};
  const blockingFindings = Array.isArray(source.blockingFindings)
    ? source.blockingFindings.map(sanitizeV1ProductionEnvIntakeFinding).filter(Boolean)
    : [];
  const warningFindings = Array.isArray(source.warningFindings)
    ? source.warningFindings.map(sanitizeV1ProductionEnvIntakeFinding).filter(Boolean)
    : [];
  const alternativeGroups = Array.isArray(source.alternativeGroups)
    ? source.alternativeGroups.map(sanitizeV1ProductionEnvIntakeFinding).filter(Boolean)
    : [];
  const intakeRowCount = normalizeV1NonNegativeInteger(summary.intakeRowCount);
  const configuredRowCount = normalizeV1NonNegativeInteger(summary.configuredRowCount);
  const missingRowCount = normalizeV1NonNegativeInteger(
    summary.missingRowCount,
    Math.max(0, intakeRowCount - configuredRowCount),
  );
  const blockingCount = normalizeV1NonNegativeInteger(summary.blockingCount, blockingFindings.length);
  const warningCount = normalizeV1NonNegativeInteger(summary.warningCount, warningFindings.length);
  const minimumBlockingTargetCount = normalizeV1NonNegativeInteger(summary.minimumBlockingTargetCount);
  const minimumBlockingSatisfiedCount = normalizeV1NonNegativeInteger(summary.minimumBlockingSatisfiedCount);
  const minimumWarningTargetCount = normalizeV1NonNegativeInteger(summary.minimumWarningTargetCount);
  const minimumWarningSatisfiedCount = normalizeV1NonNegativeInteger(summary.minimumWarningSatisfiedCount);
  const status = validScope
    ? cleanServerText(source.status) || (blockingCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "passed")
    : "missing";
  const ready = validScope && source.ready === true && blockingCount === 0;
  const available = validScope && (Object.keys(summary).length > 0 || blockingFindings.length > 0 || warningFindings.length > 0);
  const minimumBlockingItems = blockingFindings
    .filter((item) =>
      item.severity === "blocking" &&
      (item.type === "alternative_group" || item.type === "variable_row")
    )
    .slice(0, minimumBlockingTargetCount || 12);

  return {
    status,
    ready,
    available,
    checkedAt: cleanServerText(source.checkedAt),
    summary: {
      label: available
        ? cleanServerText(summary.label) ||
          `${blockingCount} 项真实值 intake / env 校验${blockingCount > 0 ? "阻塞" : warningCount > 0 ? "提醒" : "通过"}`
        : "生产 env 真实值校验未生成",
      envFileCount: normalizeV1NonNegativeInteger(summary.envFileCount),
      envFilePathIncluded: false,
      intakeCsvPathIncluded: false,
      intakeRowCount,
      configuredRowCount,
      missingRowCount,
      configuredLabel: cleanServerText(summary.configuredLabel) || `${configuredRowCount}/${intakeRowCount}`,
      fullIntakeConfiguredLabel: cleanServerText(summary.fullIntakeConfiguredLabel) || `${configuredRowCount}/${intakeRowCount}`,
      alternativeGroupCount: normalizeV1NonNegativeInteger(summary.alternativeGroupCount, alternativeGroups.length),
      alternativeGroupBlockingCount: normalizeV1NonNegativeInteger(summary.alternativeGroupBlockingCount),
      alternativeGroupWarningCount: normalizeV1NonNegativeInteger(summary.alternativeGroupWarningCount),
      minimumBlockingTargetCount,
      minimumBlockingSatisfiedCount,
      minimumBlockingMissingCount: normalizeV1NonNegativeInteger(
        summary.minimumBlockingMissingCount,
        Math.max(0, minimumBlockingTargetCount - minimumBlockingSatisfiedCount),
      ),
      minimumBlockingVariableRowCount: normalizeV1NonNegativeInteger(summary.minimumBlockingVariableRowCount),
      minimumBlockingAlternativeGroupCount: normalizeV1NonNegativeInteger(summary.minimumBlockingAlternativeGroupCount),
      minimumBlockingTargetSignature: cleanServerText(summary.minimumBlockingTargetSignature),
      minimumBlockingTargetSignatureIncluded: Boolean(cleanServerText(summary.minimumBlockingTargetSignature)),
      minimumBlockingLabel: cleanServerText(summary.minimumBlockingLabel) || `${minimumBlockingSatisfiedCount}/${minimumBlockingTargetCount}`,
      minimumWarningTargetCount,
      minimumWarningSatisfiedCount,
      minimumWarningMissingCount: normalizeV1NonNegativeInteger(
        summary.minimumWarningMissingCount,
        Math.max(0, minimumWarningTargetCount - minimumWarningSatisfiedCount),
      ),
      minimumWarningVariableRowCount: normalizeV1NonNegativeInteger(summary.minimumWarningVariableRowCount),
      minimumWarningAlternativeGroupCount: normalizeV1NonNegativeInteger(summary.minimumWarningAlternativeGroupCount),
      minimumWarningTargetSignature: cleanServerText(summary.minimumWarningTargetSignature),
      minimumWarningTargetSignatureIncluded: Boolean(cleanServerText(summary.minimumWarningTargetSignature)),
      minimumWarningLabel: cleanServerText(summary.minimumWarningLabel) || `${minimumWarningSatisfiedCount}/${minimumWarningTargetCount}`,
      passedRowCount: normalizeV1NonNegativeInteger(summary.passedRowCount),
      blockingCount,
      warningCount,
      blockingLabel: `${blockingCount} 项`,
      warningLabel: `${warningCount} 项`,
      auditReady: summary.auditReady === true,
      intakeCsvReady: summary.intakeCsvReady === true,
      minimumBlockingItemCount: minimumBlockingItems.length,
    },
    minimumBlockingItems,
    alternativeGroups: alternativeGroups.slice(0, 6),
    blockingFindings: blockingFindings.slice(0, 12),
    warningFindings: warningFindings.slice(0, 8),
    nextActions: sanitizeStringList(source.nextActions).slice(0, 8),
    safeguards: {
      nonMutating: true,
      envFilePathIncluded: false,
      intakeCsvPathIncluded: false,
      envValuesIncluded: false,
      connectionStringIncluded: false,
      objectStorageEndpointIncluded: false,
      objectStorageBucketIncluded: false,
      secretFieldsIncluded: false,
      commandValueIncluded: false,
      spoolPathIncluded: false,
      tokenIncluded: false,
      rawEnvLineIncluded: false,
      rawProofRefIncluded: false,
      artifactPathExposed: false,
    },
  };
}

function sanitizeV1ProductionPersistenceEvidence(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const validScope = cleanServerText(source.scope) === "v1_production_persistence_evidence";
  const summary = isPlainServerObject(source.summary) ? source.summary : {};
  const stages = Array.isArray(source.stages)
    ? source.stages.map(sanitizeV1ProductionPersistenceEvidenceStage).filter(Boolean)
    : [];
  const blockingStages = Array.isArray(source.blockingStages)
    ? source.blockingStages.map(sanitizeV1ProductionPersistenceEvidenceStage).filter(Boolean)
    : stages.filter((stage) => stage.status === "blocked" || stage.status === "error");
  const passedCount = normalizeV1NonNegativeInteger(summary.passedCount);
  const totalCount = normalizeV1NonNegativeInteger(summary.totalCount, stages.length);
  const blockingCount = normalizeV1NonNegativeInteger(summary.blockingCount, blockingStages.length);
  const warningCount = normalizeV1NonNegativeInteger(summary.warningCount);
  const status = validScope
    ? cleanServerText(source.status) || (blockingCount > 0 ? "blocked" : "ready")
    : "missing";
  const available = validScope && (Object.keys(summary).length > 0 || stages.length > 0 || blockingStages.length > 0);
  const ready = available && source.ready === true && blockingCount === 0;
  return {
    status,
    ready,
    available,
    checkedAt: cleanServerText(source.checkedAt),
    envFileCount: normalizeV1NonNegativeInteger(source.envFileCount),
    envFileSource: cleanServerText(source.envFileSource),
    envFileSourceLabel: cleanServerText(source.envFileSourceLabel),
    envFileFromProductionSetup: source.envFileFromProductionSetup === true,
    summary: {
      label: available
        ? cleanServerText(summary.label) || `${passedCount}/${totalCount} 阶段通过`
        : "生产持久化留证未生成",
      passedCount,
      totalCount,
      blockingCount,
      warningCount,
      passedLabel: `${passedCount}/${totalCount}`,
      blockingLabel: `${blockingCount} 项`,
      warningLabel: `${warningCount} 项`,
      postgresReady: summary.postgresReady === true,
      postgresBackupRestoreReady: summary.postgresBackupRestoreReady === true,
      objectStorageReady: summary.objectStorageReady === true,
      objectStorageGovernanceReady: summary.objectStorageGovernanceReady === true,
      persistenceEnvReady: summary.persistenceEnvReady === true,
      envFileFromProductionSetup: summary.envFileFromProductionSetup === true || source.envFileFromProductionSetup === true,
      envFileSource: cleanServerText(summary.envFileSource || source.envFileSource),
      envFileSourceLabel: cleanServerText(summary.envFileSourceLabel || source.envFileSourceLabel),
    },
    stages: stages.slice(0, 8),
    blockingStages: blockingStages.slice(0, 6),
    nextActions: sanitizeStringList(source.nextActions).slice(0, 8),
    safeguards: sanitizeV1ProductionPersistenceEvidenceSafeguards(source.safeguards),
  };
}

function sanitizeV1ProductionPersistenceEvidenceStage(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const label = cleanServerText(source.label);
  const key = cleanServerText(source.key);
  if (!label && !key) return null;
  const evidence = isPlainServerObject(source.evidence) ? source.evidence : {};
  return {
    key,
    label: label || key,
    status: cleanServerText(source.status) || "blocked",
    ready: source.ready === true,
    detail: sanitizeV1RoleTaskActionText(source.detail),
    nextAction: sanitizeV1RoleTaskActionText(source.nextAction),
    evidence: {
      passedCount: normalizeV1NonNegativeInteger(evidence.passedCount),
      totalCount: normalizeV1NonNegativeInteger(evidence.totalCount),
      blockingCount: normalizeV1NonNegativeInteger(evidence.blockingCount),
      warningCount: normalizeV1NonNegativeInteger(evidence.warningCount),
      reportStatus: cleanServerText(evidence.reportStatus),
      migrationApplyExecuted: evidence.migrationApplyExecuted === true,
      restoreDatabaseMutated: evidence.restoreDatabaseMutated === true,
      dumpFilesRemoved: evidence.dumpFilesRemoved === true,
      readsBucketGovernanceOnly: evidence.readsBucketGovernanceOnly === true,
      envFilePathIncluded: false,
      databaseUrlIncluded: false,
      objectStorageEndpointIncluded: false,
      objectStorageBucketIncluded: false,
      objectKeyIncluded: false,
      signedUrlIncluded: false,
      rawBucketPolicyIncluded: false,
      commandValueIncluded: false,
      payloadIncluded: false,
    },
  };
}

function sanitizeV1ProductionPersistenceEvidenceSafeguards(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  return {
    nonMutatingBusinessData: source.nonMutatingBusinessData !== false,
    migrationApplyExecuted: source.migrationApplyExecuted === true,
    postgresTempTableWriteProbeRolledBack: source.postgresTempTableWriteProbeRolledBack === true,
    postgresBackupRestoreSourceDatabaseMutated: source.postgresBackupRestoreSourceDatabaseMutated === true,
    postgresBackupRestoreRestoreDatabaseMutated: source.postgresBackupRestoreRestoreDatabaseMutated === true,
    postgresBackupRestoreResetExplicitlyAllowed: source.postgresBackupRestoreResetExplicitlyAllowed === true,
    postgresBackupRestoreDumpFilesRemoved: source.postgresBackupRestoreDumpFilesRemoved === true,
    objectStorageDiagnosticObjectsDeleted: source.objectStorageDiagnosticObjectsDeleted === true,
    objectStorageGovernanceWritesObjects: source.objectStorageGovernanceWritesObjects === true,
    objectStorageGovernanceReadsBucketMetadata: source.objectStorageGovernanceReadsBucketMetadata === true,
    envFileReadFromProductionSetup: source.envFileReadFromProductionSetup === true,
    envFilePathAcceptedFromRequest: source.envFilePathAcceptedFromRequest === true,
    envFilePathExposed: false,
    envValuesExposed: false,
    databaseUrlExposed: false,
    objectStorageEndpointExposed: false,
    objectStorageBucketExposed: false,
    secretFieldsExposed: false,
    objectKeyExposed: false,
    signedUrlExposed: false,
    rawBucketPolicyExposed: false,
    payloadExposed: false,
  };
}

function sanitizeV1ProductionFirstStageExecution(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const validScope = cleanServerText(source.scope) === "v1_production_first_stage_execution";
  const summary = isPlainServerObject(source.summary) ? source.summary : {};
  const execution = isPlainServerObject(source.execution) ? source.execution : {};
  const stages = Array.isArray(source.stages)
    ? source.stages.map(sanitizeV1ProductionFirstStage).filter(Boolean)
    : [];
  const blockingStages = Array.isArray(source.blockingStages)
    ? source.blockingStages.map(sanitizeV1ProductionFirstStage).filter(Boolean)
    : stages.filter((stage) => stage.status === "blocked" || stage.status === "error");
  const passedCount = normalizeV1NonNegativeInteger(summary.passedCount);
  const totalCount = normalizeV1NonNegativeInteger(summary.totalCount, stages.length);
  const blockingCount = normalizeV1NonNegativeInteger(summary.blockingCount, blockingStages.length);
  const errorCount = normalizeV1NonNegativeInteger(summary.errorCount);
  const status = validScope
    ? cleanServerText(source.status) || (blockingCount > 0 || errorCount > 0 ? "blocked" : "passed")
    : "missing";
  const available = validScope && (Object.keys(summary).length > 0 || stages.length > 0 || blockingStages.length > 0);
  const ready = available && source.ready === true && blockingCount === 0 && errorCount === 0;
  const dryRunCoverage = sanitizeV1ProductionFirstStageDryRunCoverage(
    summary.productionEnvValuesDryRunCoverage,
    available,
  );
  const intakeCoverage = sanitizeV1ProductionFirstStageIntakeCoverage(
    summary.productionEnvIntakeCoverage,
    available,
  );
  const nextActions = sanitizeStringList(source.nextActions).slice(0, 8);
  const defaultNextAction = dryRunCoverage.included
    ? dryRunCoverage.minimumBlockingReady
      ? "真实值片段 dry-run 的最小阻塞补值已覆盖；确认真实值后去掉 dry-run 正式合并，再继续第一阶段。"
      : "修正真实值片段后重新运行第一阶段 values dry-run。"
    : "先运行第一阶段真实值片段 dry-run，确认最小 blocking 补值覆盖后再正式合并。";

  return {
    status,
    ready,
    available,
    checkedAt: cleanServerText(source.checkedAt),
    summary: {
      label: available
        ? cleanServerText(summary.label) || `${passedCount}/${totalCount} 步骤通过`
        : "生产环境 / 持久化第一阶段执行未生成",
      passedCount,
      plannedCount: normalizeV1NonNegativeInteger(summary.plannedCount),
      totalCount,
      blockingCount,
      errorCount,
      passedLabel: `${passedCount}/${totalCount}`,
      blockingLabel: `${blockingCount} 项`,
      errorLabel: `${errorCount} 项`,
    },
    execution: {
      envFileCount: normalizeV1NonNegativeInteger(execution.envFileCount),
      envFileSourceLabel: cleanServerText(execution.envFileSourceLabel),
      envFileFromProductionSetup: execution.envFileFromProductionSetup === true,
      planOnly: execution.planOnly === true,
      applyMigrations: execution.applyMigrations === true,
      restoreResetExplicitlyAllowed: execution.restoreResetExplicitlyAllowed === true,
      migrationApplyRequiresExplicitFlag: execution.migrationApplyRequiresExplicitFlag !== false,
      runtimeSmokeUsesExistingApi: execution.runtimeSmokeUsesExistingApi === true,
      fieldEvidenceManifestSourceLabel: cleanServerText(execution.fieldEvidenceManifestSourceLabel),
      fieldEvidenceManifestConfigured: execution.fieldEvidenceManifestConfigured === true,
      fieldEvidenceManifestDefaultTemplateUsed: execution.fieldEvidenceManifestDefaultTemplateUsed === true,
      productionEnvValuesFileProvided: execution.productionEnvValuesFileProvided === true,
      productionEnvValuesDryRun: execution.productionEnvValuesDryRun === true,
      productionEnvValuesDryRunStopsBeforeFirstStage: execution.productionEnvValuesDryRunStopsBeforeFirstStage === true,
      actualEnvFilePathsIncluded: false,
      fieldEvidenceManifestPathIncluded: false,
      productionEnvValuesFilePathIncluded: false,
      productionEnvIntakeCsvPathIncluded: false,
      outputDirIncluded: false,
      apiBaseUrlIncluded: false,
    },
    intakeCoverage,
    dryRunCoverage,
    stages: stages.slice(0, 8),
    blockingStages: blockingStages.slice(0, 5),
    nextActions: nextActions.length ? nextActions : (available ? [defaultNextAction] : []),
    safeguards: {
      nonMutating: true,
      envValuesIncluded: false,
      databaseUrlIncluded: false,
      objectStorageEndpointIncluded: false,
      objectStorageBucketIncluded: false,
      secretFieldsIncluded: false,
      commandValueIncluded: false,
      commandArgsIncluded: false,
      spoolPathIncluded: false,
      tokenIncluded: false,
      envFilePathIncluded: false,
      productionEnvValuesFilePathIncluded: false,
      fieldEvidenceManifestPathIncluded: false,
      rawStageCommandsIncluded: false,
      businessDataMutated: false,
      productionEnvFileMutated: false,
      schemaMigrationApplyExecuted: execution.applyMigrations === true,
      declaresFullV1Complete: false,
      artifactPathExposed: false,
    },
  };
}

function sanitizeV1ProductionFirstStage(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const label = cleanServerText(source.label);
  const key = cleanServerText(source.key);
  if (!label && !key) return null;
  const evidence = isPlainServerObject(source.evidence) ? source.evidence : {};
  return {
    key,
    label: label || key,
    status: cleanServerText(source.status),
    detail: cleanServerText(source.detail),
    exitCode: Number.isFinite(Number(source.exitCode)) ? Number(source.exitCode) : null,
    commandIncluded: false,
    evidence: {
      reportParsed: evidence.reportParsed === true,
      reportStatus: cleanServerText(evidence.reportStatus),
      reportReady: evidence.reportReady === true,
      dryRun: evidence.dryRun === true,
      dryRunProjectionIncluded: evidence.dryRunProjectionIncluded === true,
      summaryLabel: cleanServerText(evidence.summaryLabel),
      intakeCoverageIncluded: evidence.intakeCoverageIncluded === true,
      intakeAuditReady: evidence.intakeAuditReady === true,
      intakeCsvReady: evidence.intakeCsvReady === true,
      intakeConfiguredRowCount: normalizeV1NonNegativeInteger(evidence.intakeConfiguredRowCount),
      intakeRowCount: normalizeV1NonNegativeInteger(evidence.intakeRowCount),
      intakeMissingRowCount: normalizeV1NonNegativeInteger(evidence.intakeMissingRowCount),
      fullIntakeConfiguredLabel: cleanServerText(evidence.fullIntakeConfiguredLabel),
      intakeConfiguredLabel: cleanServerText(evidence.intakeConfiguredLabel),
      minimumBlockingLabel: cleanServerText(evidence.minimumBlockingLabel),
      minimumBlockingMissingCount: normalizeV1NonNegativeInteger(evidence.minimumBlockingMissingCount),
      minimumWarningLabel: cleanServerText(evidence.minimumWarningLabel),
      minimumWarningMissingCount: normalizeV1NonNegativeInteger(evidence.minimumWarningMissingCount),
      passedCount: normalizeV1NonNegativeInteger(evidence.passedCount),
      blockingCount: normalizeV1NonNegativeInteger(evidence.blockingCount),
      warningCount: normalizeV1NonNegativeInteger(evidence.warningCount),
      scope: cleanServerText(evidence.scope),
      actualCommandArgsIncluded: false,
      envFilePathIncluded: false,
    },
    nextActions: sanitizeStringList(source.nextActions).slice(0, 5),
  };
}

function sanitizeV1ProductionFirstStageIntakeCoverage(value = {}, firstStageAvailable = false) {
  const source = isPlainServerObject(value) ? value : {};
  const included = firstStageAvailable && source.included === true;
  const configuredRowCount = normalizeV1NonNegativeInteger(source.configuredRowCount);
  const intakeRowCount = normalizeV1NonNegativeInteger(source.intakeRowCount);
  const minimumBlockingSatisfiedCount = normalizeV1NonNegativeInteger(source.minimumBlockingSatisfiedCount);
  const minimumBlockingTargetCount = normalizeV1NonNegativeInteger(source.minimumBlockingTargetCount);
  const minimumWarningSatisfiedCount = normalizeV1NonNegativeInteger(source.minimumWarningSatisfiedCount);
  const minimumWarningTargetCount = normalizeV1NonNegativeInteger(source.minimumWarningTargetCount);
  const minimumBlockingMissingCount = normalizeV1NonNegativeInteger(
    source.minimumBlockingMissingCount,
    Math.max(0, minimumBlockingTargetCount - minimumBlockingSatisfiedCount),
  );
  const minimumWarningMissingCount = normalizeV1NonNegativeInteger(
    source.minimumWarningMissingCount,
    Math.max(0, minimumWarningTargetCount - minimumWarningSatisfiedCount),
  );
  return {
    available: firstStageAvailable,
    included,
    status: included ? cleanServerText(source.stageStatus) || "unknown" : firstStageAvailable ? "not_included" : "missing",
    statusLabel: included
      ? source.reportReady === true
        ? "已通过"
        : "阻塞"
      : firstStageAvailable
        ? "未纳入"
        : "未生成",
    reportReady: included && source.reportReady === true,
    auditReady: included && source.auditReady === true,
    intakeCsvReady: included && source.intakeCsvReady === true,
    configuredRowCount,
    intakeRowCount,
    missingRowCount: normalizeV1NonNegativeInteger(source.missingRowCount, Math.max(0, intakeRowCount - configuredRowCount)),
    configuredLabel: cleanServerText(source.configuredLabel) || `${configuredRowCount}/${intakeRowCount}`,
    fullIntakeConfiguredLabel: cleanServerText(source.fullIntakeConfiguredLabel) || `${configuredRowCount}/${intakeRowCount}`,
    blockingCount: normalizeV1NonNegativeInteger(source.blockingCount),
    warningCount: normalizeV1NonNegativeInteger(source.warningCount),
    alternativeGroupBlockingCount: normalizeV1NonNegativeInteger(source.alternativeGroupBlockingCount),
    alternativeGroupWarningCount: normalizeV1NonNegativeInteger(source.alternativeGroupWarningCount),
    minimumBlockingReady: included && source.reportReady === true && minimumBlockingMissingCount === 0,
    minimumBlockingSatisfiedCount,
    minimumBlockingTargetCount,
    minimumBlockingMissingCount,
    minimumBlockingVariableRowCount: normalizeV1NonNegativeInteger(source.minimumBlockingVariableRowCount),
    minimumBlockingAlternativeGroupCount: normalizeV1NonNegativeInteger(source.minimumBlockingAlternativeGroupCount),
    minimumBlockingLabel: cleanServerText(source.minimumBlockingLabel) || `${minimumBlockingSatisfiedCount}/${minimumBlockingTargetCount}`,
    minimumWarningReady: included && minimumWarningMissingCount === 0,
    minimumWarningSatisfiedCount,
    minimumWarningTargetCount,
    minimumWarningMissingCount,
    minimumWarningVariableRowCount: normalizeV1NonNegativeInteger(source.minimumWarningVariableRowCount),
    minimumWarningAlternativeGroupCount: normalizeV1NonNegativeInteger(source.minimumWarningAlternativeGroupCount),
    minimumWarningLabel: cleanServerText(source.minimumWarningLabel) || `${minimumWarningSatisfiedCount}/${minimumWarningTargetCount}`,
    nextAction: included
      ? source.reportReady === true
        ? "真实值 intake 已通过；继续生产 env 变量预检和第一阶段后续步骤。"
        : "先补齐最小阻塞真实值片段并运行 values dry-run，通过后再正式合并。"
      : firstStageAvailable
        ? "当前第一阶段 latest 未纳入真实值 intake 覆盖；重新执行第一阶段后刷新。"
        : "先生成生产环境 / 持久化第一阶段执行报告。",
  };
}

function sanitizeV1ProductionFirstStageDryRunCoverage(value = {}, firstStageAvailable = false) {
  const source = isPlainServerObject(value) ? value : {};
  const included = firstStageAvailable && source.included === true;
  const minimumBlockingSatisfiedCount = normalizeV1NonNegativeInteger(source.minimumBlockingSatisfiedCount);
  const minimumBlockingTargetCount = normalizeV1NonNegativeInteger(source.minimumBlockingTargetCount);
  const minimumWarningSatisfiedCount = normalizeV1NonNegativeInteger(source.minimumWarningSatisfiedCount);
  const minimumWarningTargetCount = normalizeV1NonNegativeInteger(source.minimumWarningTargetCount);
  const envPreflightPassedCount = normalizeV1NonNegativeInteger(source.envPreflightPassedCount);
  const envPreflightTotalCount = normalizeV1NonNegativeInteger(source.envPreflightTotalCount);
  const intakeConfiguredRowCount = normalizeV1NonNegativeInteger(source.intakeConfiguredRowCount);
  const intakeRowCount = normalizeV1NonNegativeInteger(source.intakeRowCount);

  return {
    available: firstStageAvailable,
    included,
    status: included ? cleanServerText(source.stageStatus) || "unknown" : firstStageAvailable ? "not_included" : "missing",
    statusLabel: included ? (source.stageStatus === "passed" ? "已纳入" : "需复核") : firstStageAvailable ? "未纳入" : "未生成",
    targetWouldBeWritten: false,
    envPreflightReady: included && source.envPreflightReady === true,
    envPreflightPassedCount,
    envPreflightTotalCount,
    envPreflightBlockingCount: normalizeV1NonNegativeInteger(source.envPreflightBlockingCount),
    envPreflightLabel: `${envPreflightPassedCount}/${envPreflightTotalCount}`,
    intakeConfiguredRowCount,
    intakeRowCount,
    intakeLabel: `${intakeConfiguredRowCount}/${intakeRowCount}`,
    intakeMissingRequiredVariableCount: normalizeV1NonNegativeInteger(source.intakeMissingRequiredVariableCount),
    intakeAlternativeGroupBlockingCount: normalizeV1NonNegativeInteger(source.intakeAlternativeGroupBlockingCount),
    minimumBlockingReady: included && source.minimumBlockingReady === true,
    minimumBlockingSatisfiedCount,
    minimumBlockingTargetCount,
    minimumBlockingMissingCount: normalizeV1NonNegativeInteger(
      source.minimumBlockingMissingCount,
      Math.max(0, minimumBlockingTargetCount - minimumBlockingSatisfiedCount),
    ),
    minimumBlockingVariableRowCount: normalizeV1NonNegativeInteger(source.minimumBlockingVariableRowCount),
    minimumBlockingAlternativeGroupCount: normalizeV1NonNegativeInteger(source.minimumBlockingAlternativeGroupCount),
    minimumBlockingTargetSignature: cleanServerText(source.minimumBlockingTargetSignature),
    minimumBlockingTargetSignatureIncluded: Boolean(cleanServerText(source.minimumBlockingTargetSignature)),
    minimumBlockingLabel: `${minimumBlockingSatisfiedCount}/${minimumBlockingTargetCount}`,
    minimumWarningReady: included && source.minimumWarningReady === true,
    minimumWarningSatisfiedCount,
    minimumWarningTargetCount,
    minimumWarningMissingCount: normalizeV1NonNegativeInteger(
      source.minimumWarningMissingCount,
      Math.max(0, minimumWarningTargetCount - minimumWarningSatisfiedCount),
    ),
    minimumWarningLabel: `${minimumWarningSatisfiedCount}/${minimumWarningTargetCount}`,
    minimumWarningTargetSignature: cleanServerText(source.minimumWarningTargetSignature),
    minimumWarningTargetSignatureIncluded: Boolean(cleanServerText(source.minimumWarningTargetSignature)),
    nextAction: included
      ? source.minimumBlockingReady === true
        ? "最小阻塞补值 dry-run 已覆盖；确认后可正式合并并继续第一阶段。"
        : "dry-run 已纳入但最小阻塞补值仍未覆盖，需修正真实值片段。"
      : firstStageAvailable
        ? "当前第一阶段 latest 不是 values dry-run 产物；先运行 `--production-env-values-dry-run` 后刷新上线状态。"
        : "先生成生产环境 / 持久化第一阶段执行报告。",
  };
}

function sanitizeV1ProductionEnvIntakeFinding(value = {}) {
  const source = isPlainServerObject(value) ? value : {};
  const label = cleanServerText(source.label);
  const variableKey = cleanServerText(source.variableKey);
  const alternativeGroup = cleanServerText(source.alternativeGroup);
  if (!label && !variableKey && !alternativeGroup) return null;
  return {
    type: cleanServerText(source.type),
    key: cleanServerText(source.key),
    itemKey: cleanServerText(source.itemKey),
    label: label || variableKey || alternativeGroup,
    ownerRole: cleanServerText(source.ownerRole),
    severity: cleanServerText(source.severity) || "warning",
    status: cleanServerText(source.status),
    variableKey,
    alternativeGroup,
    variables: sanitizeStringList(source.variables).slice(0, 6),
    configuredKeyCount: normalizeV1NonNegativeInteger(source.configuredKeyCount),
    sourceSystem: cleanServerText(source.sourceSystem),
    expectedValueType: cleanServerText(source.expectedValueType),
    configured: source.configured === true,
    safeLiteralRequired: source.safeLiteralRequired === true,
    safeLiteralMatches: source.safeLiteralMatches !== false,
    filledMarked: source.filledMarked === true,
    verifiedMarked: source.verifiedMarked === true,
    evidenceProvided: source.evidenceRefProvided === true,
    rawProofRefIncluded: false,
    detail: cleanServerText(source.detail),
    nextAction: cleanServerText(source.nextAction),
  };
}

function sanitizeV1ProductionEnvFixChecklist(value = []) {
  const items = Array.isArray(value)
    ? value.map(sanitizeV1ProductionEnvFixItem).filter(Boolean)
    : [];
  const blockingCount = items.filter((item) => item.severity === "blocking").length;
  const warningCount = items.filter((item) => item.severity === "warning").length;
  const passedCount = items.filter((item) => item.status === "passed" || item.ready).length;
  const configuredVariableCount = items.reduce(
    (total, item) => total + normalizeV1NonNegativeInteger(item.configuredVariableCount),
    0,
  );
  const totalVariableCount = items.reduce(
    (total, item) => total + normalizeV1NonNegativeInteger(item.totalVariableCount),
    0,
  );
  return {
    status: blockingCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "passed",
    ready: blockingCount === 0 && warningCount === 0 && items.length > 0,
    summary: {
      label: items.length
        ? `生产环境修正清单：${items.length} 项，${blockingCount} 项阻塞`
        : "生产环境修正清单未生成",
      itemCount: items.length,
      blockingCount,
      warningCount,
      passedCount,
      configuredVariableCount,
      totalVariableCount,
    },
    items,
    safeguards: {
      environmentValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      artifactPathExposed: false,
    },
  };
}

function sanitizeV1ProductionEnvFillTemplate(value = "", options = {}) {
  const raw = typeof value === "string" ? value : "";
  const rawLines = raw.split(/\r?\n/);
  const sanitizedLines = rawLines
    .map(sanitizeV1ProductionEnvTemplateLine)
    .filter((line) => line !== null);
  const variableNames = Array.from(
    new Set(
      sanitizedLines
        .map((line) => line.match(/^\s*#?\s*([A-Z][A-Z0-9_]+)=/)?.[1] ?? "")
        .filter(Boolean),
    ),
  );
  const placeholderCount = sanitizedLines.filter((line) => line.includes("<待填写>")).length;
  const blockingSectionCount = sanitizedLines.filter((line) => line.includes("# BLOCKING |")).length;
  const warningSectionCount = sanitizedLines.filter((line) => line.includes("# WARNING |")).length;
  const label = cleanServerText(options.label) || "安全 env 填写草稿";
  const missingLabel = cleanServerText(options.missingLabel) || `${label}未生成`;
  const targetLabel = cleanServerText(options.targetLabel);
  return {
    status: raw ? "available" : "missing",
    ready: false,
    summary: {
      label: raw
        ? `${label}：${variableNames.length} 个变量，${placeholderCount} 个待填写`
        : missingLabel,
      lineCount: sanitizedLines.length,
      variableCount: variableNames.length,
      placeholderCount,
      blockingSectionCount,
      warningSectionCount,
      templateKind: cleanServerText(options.templateKind) || "env_fill_template",
      fileName: cleanServerText(options.fileName),
      targetLabel,
      commandLineCount: sanitizedLines.filter((line) => line.includes("node ") || line.includes("npm ")).length,
    },
    variableNames,
    previewLines: sanitizedLines,
    safeguards: {
      realEnvValuesIncluded: false,
      commandValuesIncluded: false,
      secretValuesIncluded: false,
      artifactPathExposed: false,
      localPathExposed: false,
      placeholderValuesOnly: true,
      templateOnly: true,
      browserEnvValuesAccepted: false,
      targetEnvMutated: false,
      productionEnvFileMutated: false,
    },
  };
}

function sanitizeV1ProductionEnvTemplateLine(line) {
  const text = cleanServerText(line);
  if (!text) return "";
  const assignment = text.match(/^(\s*#?\s*)([A-Z][A-Z0-9_]+)=(.*)$/);
  if (!assignment) {
    return text
      .replace(/<REPLACE_WITH_[^>]+>/g, "<待填写>")
      .replace(/<OPTIONAL_[^>]+>/g, "<待填写>");
  }
  const [, prefix, key, rawValue] = assignment;
  const value = cleanServerText(rawValue);
  const safeLiteralValues = new Set([
    "postgres",
    "object_storage",
    "true",
    "command_bridge",
    "cups_lp",
  ]);
  const safeValue = safeLiteralValues.has(value) ? value : "<待填写>";
  return `${prefix}${key}=${safeValue}`;
}

function sanitizeV1ProductionEnvFixItem(value = {}) {
  if (!isPlainServerObject(value)) return null;
  const label = cleanServerText(value.label);
  if (!label) return null;
  const severity = normalizeV1FixSeverity(value.severity);
  const status = cleanServerText(value.status) || (value.ready ? "passed" : "pending");
  return {
    key: cleanServerText(value.key),
    label,
    ownerRole: cleanServerText(value.ownerRole) || "技术/管理",
    severity,
    status,
    ready: Boolean(value.ready || status === "passed"),
    blocking: Boolean(value.blocking || severity === "blocking"),
    configuredVariableCount: normalizeV1NonNegativeInteger(value.configuredVariableCount),
    totalVariableCount: normalizeV1NonNegativeInteger(value.totalVariableCount),
    requiredVariables: sanitizeStringList(value.requiredVariables),
    missingVariables: sanitizeStringList(value.missingVariables),
    placeholderVariables: sanitizeStringList(value.placeholderVariables),
    valueGuidance: sanitizeStringList(value.valueGuidance).slice(0, 5),
    verificationSteps: sanitizeStringList(value.verificationSteps).slice(0, 5),
    nextAction: cleanServerText(value.nextAction),
  };
}

function normalizeV1FixSeverity(value) {
  const severity = cleanServerText(value);
  if (["blocking", "warning", "ok"].includes(severity)) return severity;
  return "warning";
}

function sanitizeV1TopBlockers(value = []) {
  return Array.isArray(value)
    ? value
        .map((item) => ({
          gate: cleanServerText(item?.gate),
          key: cleanServerText(item?.key),
          label: cleanServerText(item?.label),
          status: cleanServerText(item?.status),
          detail: cleanServerText(item?.detail),
        }))
        .filter((item) => item.label)
    : [];
}

function sanitizeV1ModuleDifferences(value = []) {
  return Array.isArray(value)
    ? value
        .map((item) => ({
          module: cleanServerText(item?.module),
          v1: cleanServerText(item?.v1),
          v2: cleanServerText(item?.v2),
        }))
        .filter((item) => item.module || item.v2)
    : [];
}

function sanitizeStringList(value = []) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return raw.map((item) => cleanServerText(item)).filter(Boolean);
}

function normalizeV1NonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function isPlainServerObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildSystemPersistenceGroupReadiness({ workspace, group, localPersistenceAcceptance }) {
  const repositories = group.repositories.map(([repositoryKey, label]) => {
    const kind = normalizeSystemPersistenceKind(workspace?.[repositoryKey]?.kind);
    const productionReady = isV1ProductionPersistenceKind(kind);
    const localKind = isLocalPersistenceKind(kind);
    return {
      key: repositoryKey,
      label,
      kind,
      productionReady,
      localKind,
    };
  });
  const localRepositories = repositories.filter((repository) => repository.localKind);
  const localMemoryRepositories = repositories.filter((repository) => repository.kind === "local_memory");
  const allProductionReady = repositories.every((repository) => repository.productionReady);
  const ready = allProductionReady || localPersistenceAcceptance.accepted;
  return {
    key: group.key,
    label: group.label,
    ready,
    acceptedByLocalPolicy: !allProductionReady && localPersistenceAcceptance.accepted,
    repositoryCount: repositories.length,
    productionReadyCount: repositories.filter((repository) => repository.productionReady).length,
    localRepositoryCount: localRepositories.length,
    localMemoryCount: localMemoryRepositories.length,
    localJsonCount: repositories.filter((repository) => repository.kind === "local_json").length,
    localFsCount: repositories.filter((repository) => repository.kind === "local_fs").length,
    repositories,
  };
}

function buildSystemPersistenceRemainingRisks({
  criteria,
  localPersistenceAcceptance,
  localRepositories,
  localMemoryRepositories,
}) {
  const risks = [];
  for (const item of criteria) {
    if (item.blocking && item.status !== "passed") risks.push(`${item.label}：${item.detail}`);
  }
  if (localRepositories.length && !localPersistenceAcceptance.accepted) {
    risks.push("核心业务仓储仍包含 local_memory / local_json / local_fs，生产 V1 默认需要 PostgreSQL / 对象存储等生产级持久化");
  }
  if (localMemoryRepositories.length) {
    risks.push(`${localMemoryRepositories.length} 个仓储仍为 local_memory，进程重启会丢失运行期业务状态`);
  }
  if (localRepositories.length && localPersistenceAcceptance.accepted) {
    risks.push("本地持久化已被显式批准用于 V1；仍需现场确认备份、并发、权限、磁盘和灾备巡检");
  }
  return [...new Set(risks)].filter(Boolean);
}

function getSystemLocalPersistenceAcceptance(workspace) {
  const options = workspace.systemV1ReadinessOptions ?? {};
  const accepted = parseBooleanConfig(
    options.localPersistenceAccepted ?? process.env.ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTED,
  );
  const reference = normalizeAttachmentText(
    options.acceptanceReference ??
      options.localPersistenceAcceptanceReference ??
      process.env.ERP_SYSTEM_LOCAL_PERSISTENCE_V1_ACCEPTANCE_REF,
  );
  return {
    accepted,
    reference,
  };
}

function normalizeSystemPersistenceKind(kind) {
  return normalizeAttachmentText(kind || "missing");
}

function isV1ProductionPersistenceKind(kind) {
  return ["postgres", "object_storage"].includes(normalizeSystemPersistenceKind(kind));
}

function isLocalPersistenceKind(kind) {
  return ["local_memory", "local_json", "local_fs"].includes(normalizeSystemPersistenceKind(kind));
}

const v1DriverRequiredFieldTestChecks = DRIVER_DEVICE_FIELD_TEST_ITEMS.map((item) => item.key);

async function getDriverV1ReadinessResponse({ workspace, operatorId }) {
  const checkedAt = new Date().toISOString();
  const deliveryTaskList = await workspace.driverDeliveryTaskReadRepository.listDriverDeliveryTasks({
    workspace,
    query: { page: 1, pageSize: 200 },
    operatorId,
  });
  const deliveryTasks = Array.isArray(deliveryTaskList.items) ? deliveryTaskList.items : [];
  const latestFieldTestRecord = getLatestDriverDeviceFieldTestRecord({ workspace, deliveryTasks });
  const fieldTestEvaluation = evaluateDriverDeviceFieldTest(latestFieldTestRecord);
  const nativeDiagnostics = normalizeDriverNativeCapabilityDiagnostics(latestFieldTestRecord?.nativeBridgeDiagnostics);
  const nativePackageScanEvaluation = evaluateDriverNativeCapability({
    diagnostics: nativeDiagnostics,
    key: "native_package_scan",
    label: "原生扫码桥接",
  });
  const nativeNavigationEvaluation = evaluateDriverNativeCapability({
    diagnostics: nativeDiagnostics,
    key: "native_navigation",
    label: "原生导航桥接",
  });
  const packageLabelScanEvaluation = evaluateDriverPackageLabelScanSample(latestFieldTestRecord?.packageLabelScanSample);
  const criteria = [
    buildReadinessCriterion({
      key: "driver-delivery-task-read-model",
      label: "司机送货任务读取",
      passed: deliveryTasks.length > 0,
      detail: deliveryTasks.length
        ? `可读取 ${deliveryTasks.length} 条司机送货任务`
        : "未读取到司机送货任务，无法验证装车、导航和送达流程",
      blocking: true,
      evidence: {
        total: deliveryTaskList.total ?? deliveryTasks.length,
        metrics: deliveryTaskList.metrics ?? {},
        sampleFulfillmentIds: deliveryTasks.slice(0, 5).map((item) => item.fulfillmentId).filter(Boolean),
      },
    }),
    buildReadinessCriterion({
      key: "driver-device-field-test-record",
      label: "司机真机现场验收记录",
      passed: Boolean(latestFieldTestRecord),
      detail: latestFieldTestRecord
        ? `最新记录 ${latestFieldTestRecord.recordId} / ${latestFieldTestRecord.checkedAt}`
        : "尚未保存司机手机现场验收记录",
      blocking: true,
      evidence: {
        latestRecordId: latestFieldTestRecord?.recordId ?? "",
        latestFulfillmentId: latestFieldTestRecord?.fulfillmentId ?? "",
        latestCheckedAt: latestFieldTestRecord?.checkedAt ?? "",
      },
    }),
    buildReadinessCriterion({
      key: "driver-device-field-test-checks",
      label: "司机手机 6 项现场检查",
      passed: fieldTestEvaluation.ready,
      detail: fieldTestEvaluation.ready ? "相机、水印拍照、扫码、定位、上传兜底和导航均已通过" : fieldTestEvaluation.detail,
      blocking: true,
      evidence: {
        summary: fieldTestEvaluation.summary,
        missingChecks: fieldTestEvaluation.missingChecks,
        failedChecks: fieldTestEvaluation.failedChecks,
        blockedChecks: fieldTestEvaluation.blockedChecks,
        untestedChecks: fieldTestEvaluation.untestedChecks,
      },
    }),
    buildReadinessCriterion({
      key: "driver-native-package-scan",
      label: "原生扫码能力",
      passed: nativePackageScanEvaluation.ready,
      detail: nativePackageScanEvaluation.detail,
      blocking: true,
      evidence: nativePackageScanEvaluation.evidence,
    }),
    buildReadinessCriterion({
      key: "driver-native-navigation",
      label: "原生导航能力",
      passed: nativeNavigationEvaluation.ready,
      detail: nativeNavigationEvaluation.detail,
      blocking: true,
      evidence: nativeNavigationEvaluation.evidence,
    }),
    buildReadinessCriterion({
      key: "driver-native-package-label-scan-sample",
      label: "纸质包裹标签原生扫码样本",
      passed: packageLabelScanEvaluation.ready,
      detail: packageLabelScanEvaluation.detail,
      blocking: true,
      evidence: packageLabelScanEvaluation.evidence,
    }),
  ];
  const summary = buildReadinessSummary(criteria);
  return {
    status: summary.blockingCount === 0 ? "ready" : "blocked",
    ready: summary.blockingCount === 0,
    checkedAt,
    operatorId,
    scope: "v1_driver_mobile_readiness",
    summary,
    criteria,
    deliveryTaskReadiness: {
      total: deliveryTaskList.total ?? deliveryTasks.length,
      metrics: deliveryTaskList.metrics ?? {},
      sampleFulfillmentIds: deliveryTasks.slice(0, 5).map((item) => item.fulfillmentId).filter(Boolean),
    },
    latestFieldTestRecord: latestFieldTestRecord ?? null,
    latestFieldTestSummary: latestFieldTestRecord?.summary ?? null,
    nativeBridgeDiagnostics: nativeDiagnostics,
    packageLabelScanSample: normalizeDriverPackageLabelScanSample(latestFieldTestRecord?.packageLabelScanSample),
    remainingV1Risks: buildDriverV1ReadinessRemainingRisks({ criteria, latestFieldTestRecord }),
    safeguards: {
      nonMutating: true,
      deliveryStatusChanged: false,
      requiresNativeShell: true,
      browserOnlyNotReady: nativePackageScanEvaluation.ready !== true || nativeNavigationEvaluation.ready !== true,
      physicalLabelScanRequired: true,
      navigationAppRequired: true,
      payloadExposed: false,
    },
  };
}

function getLatestDriverDeviceFieldTestRecord({ workspace, deliveryTasks }) {
  const candidates = [];
  for (const record of workspace.driverDeviceFieldTests ?? []) candidates.push(record);
  for (const fulfillment of workspace.fulfillments ?? []) {
    if (fulfillment?.deviceFieldTestRecord) candidates.push(fulfillment.deviceFieldTestRecord);
  }
  for (const task of deliveryTasks ?? []) {
    if (task?.deviceFieldTestRecord) candidates.push(task.deviceFieldTestRecord);
    if (task?.latestDeviceFieldTestRecord) candidates.push(task.latestDeviceFieldTestRecord);
  }
  const byId = new Map();
  for (const candidate of candidates) {
    const record = normalizeDriverDeviceFieldTestRecord(candidate);
    if (!record) continue;
    byId.set(record.recordId, record);
  }
  return [...byId.values()].sort(compareCheckedAtDesc)[0] ?? null;
}

function compareCheckedAtDesc(left, right) {
  return (Date.parse(right?.checkedAt ?? "") || 0) - (Date.parse(left?.checkedAt ?? "") || 0);
}

function evaluateDriverDeviceFieldTest(record) {
  if (!record) {
    return {
      ready: false,
      detail: "尚未记录现场验收，无法证明司机真机相机、水印拍照、扫码、定位、上传兜底和导航可用",
      summary: null,
      missingChecks: v1DriverRequiredFieldTestChecks,
      failedChecks: [],
      blockedChecks: [],
      untestedChecks: [],
    };
  }
  const normalizedChecks = normalizeDriverDeviceFieldTestChecks(record.checks ?? []);
  const originalKeys = new Set((record.checks ?? []).map((item) => cleanServerText(item?.key)).filter(Boolean));
  const byKey = new Map(normalizedChecks.map((item) => [item.key, item]));
  const missingChecks = v1DriverRequiredFieldTestChecks.filter((key) => !originalKeys.has(key));
  const failedChecks = [];
  const blockedChecks = [];
  const untestedChecks = [];
  for (const key of v1DriverRequiredFieldTestChecks) {
    const status = cleanServerText(byKey.get(key)?.status);
    if (status === "failed") failedChecks.push(key);
    if (status === "blocked") blockedChecks.push(key);
    if (!status || status === "untested") untestedChecks.push(key);
  }
  const ready = !missingChecks.length && !failedChecks.length && !blockedChecks.length && !untestedChecks.length;
  const summary = getDriverDeviceFieldTestSummary(normalizedChecks);
  return {
    ready,
    detail: ready
      ? "司机手机现场检查全部通过"
      : `现场检查未通过：缺 ${missingChecks.length} 项，失败 ${failedChecks.length} 项，受限 ${blockedChecks.length} 项，未测 ${untestedChecks.length} 项`,
    summary,
    missingChecks,
    failedChecks,
    blockedChecks,
    untestedChecks,
  };
}

function evaluateDriverNativeCapability({ diagnostics, key, label }) {
  const item = (diagnostics?.items ?? []).find((candidate) => candidate.key === key);
  const ready = item?.supported === true;
  return {
    ready,
    detail: ready
      ? `${label}可用，桥接类型 ${item.bridgeTypeLabel || item.bridgeType || "已接入"}`
      : `${label}未接入原生壳，普通浏览器不能作为 V1 真机验收通过证据`,
    evidence: {
      key,
      supported: Boolean(item?.supported),
      statusLabel: item?.statusLabel ?? "",
      bridgeType: item?.bridgeType ?? "",
      bridgeTypeLabel: item?.bridgeTypeLabel ?? "",
      version: item?.version ?? "",
      diagnosticsLabel: diagnostics?.label ?? "",
      supportedCount: diagnostics?.supportedCount ?? 0,
      total: diagnostics?.total ?? 0,
    },
  };
}

function evaluateDriverPackageLabelScanSample(value) {
  const sample = normalizeDriverPackageLabelScanSample(value);
  if (!sample) {
    return {
      ready: false,
      detail: "未记录纸质包裹标签扫码样本",
      evidence: {
        sampleId: "",
        method: "",
        result: "",
        expectedPackageId: "",
        matchedPackageId: "",
      },
    };
  }
  const matched = sample.result === "matched" || sample.result === "duplicate";
  const nativeMethod = sample.method === "native_sdk";
  const packageMatched = Boolean(sample.expectedPackageId && sample.matchedPackageId);
  const scanTextPresent = Boolean(sample.scannedText);
  const ready = matched && nativeMethod && packageMatched && scanTextPresent;
  return {
    ready,
    detail: ready
      ? `原生扫码样本 ${sample.sampleId} 已匹配 ${sample.matchedPackageId}`
      : "扫码样本未达到 V1 要求：必须是原生扫码 SDK、纸质标签文本已读回且匹配包裹",
    evidence: {
      sampleId: sample.sampleId,
      fulfillmentId: sample.fulfillmentId,
      expectedPackageId: sample.expectedPackageId,
      matchedPackageId: sample.matchedPackageId,
      method: sample.method,
      methodLabel: sample.methodLabel,
      result: sample.result,
      resultLabel: sample.resultLabel,
      checkedAt: sample.checkedAt,
      scanTextPresent,
      nativeMethod,
      packageMatched,
    },
  };
}

function buildDriverV1ReadinessRemainingRisks({ criteria, latestFieldTestRecord }) {
  const risks = [];
  for (const item of criteria) {
    if (item.blocking && item.status !== "passed") risks.push(`${item.label}：${item.detail}`);
  }
  if (!latestFieldTestRecord) risks.push("缺少真实司机手机现场验收记录");
  if (latestFieldTestRecord && latestFieldTestRecord.nativeBridgeDiagnostics?.supportedCount < 2) {
    risks.push("原生扫码 / 原生导航桥接未达到 2/2 可用");
  }
  if (!latestFieldTestRecord?.packageLabelScanSample) risks.push("缺少真实纸质包裹标签扫码样本");
  if (!risks.length) {
    risks.push("仍需保留司机真机权限、纸质标签扫码、地图打开和送达水印照片现场抽检记录");
  }
  return [...new Set(risks)];
}

async function upsertFulfillmentDispatchRoute({ response, workspace, fulfillmentId, body, operatorId }) {
  const beforeFulfillment = findFulfillment(workspace, fulfillmentId);
  if (!beforeFulfillment) return sendNotFound(response, "FULFILLMENT_NOT_FOUND");
  if (beforeFulfillment.method !== "送货") {
    return sendBusinessError(response, 409, "FULFILLMENT_DISPATCH_NOT_APPLICABLE", "Driver dispatch only applies to delivery fulfillments.");
  }
  if (body.fulfillmentId && body.fulfillmentId !== fulfillmentId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "fulfillmentId in path and body must match");
  }

  const driverId = String(body.driverId ?? body.assignedDriverId ?? "").trim();
  if (!driverId) return sendBusinessError(response, 422, "VALIDATION_ERROR", "driverId is required.");

  const routeDate = normalizeDateInput(body.routeDate ?? body.deliveryDate);
  if (!routeDate) return sendBusinessError(response, 422, "VALIDATION_ERROR", "routeDate must be a valid YYYY-MM-DD date.");

  const routeNo = String(body.routeNo ?? body.routeBatchNo ?? body.route_batch_no ?? "").trim();
  if (!routeNo) return sendBusinessError(response, 422, "VALIDATION_ERROR", "routeNo is required.");

  const routeSequence = Math.trunc(Number(body.routeSequence ?? body.stopSequence ?? body.stop_sequence));
  if (!Number.isFinite(routeSequence) || routeSequence <= 0) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "routeSequence must be greater than 0.");
  }

  const plannedDepartureAt = normalizeOptionalTimestampInput(body.plannedDepartureAt ?? body.departureAt);
  if (plannedDepartureAt === null) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "plannedDepartureAt must be a valid timestamp when provided.");
  }

  const existingDispatch = findActiveDriverDeliveryDispatch(workspace, fulfillmentId);
  const assignedAt = normalizeTimestamp(body.assignedAt, new Date().toISOString());
  const dispatchId =
    String(body.dispatchId ?? body.id ?? existingDispatch.dispatchId ?? existingDispatch.id ?? "").trim() ||
    nextPlainId("DDIS", `${fulfillmentId}-${(workspace.driverDeliveryDispatches ?? []).length + 1}`);
  const dispatch = {
    id: dispatchId,
    dispatchId,
    bizNo: String(body.bizNo ?? existingDispatch.bizNo ?? existingDispatch.biz_no ?? dispatchId).trim() || dispatchId,
    fulfillmentId,
    driverId,
    routeDate,
    routeNo,
    routeBatchNo: routeNo,
    stopSequence: routeSequence,
    routeSequence,
    dispatchStatus: String(body.dispatchStatus ?? existingDispatch.dispatchStatus ?? "已派单").trim() || "已派单",
    plannedDepartureAt: plannedDepartureAt || "",
    assignedBy: operatorId,
    assignedAt,
    remark: String(body.remark ?? "").trim(),
    createdAt: existingDispatch.createdAt ?? existingDispatch.created_at ?? assignedAt,
    updatedAt: assignedAt,
  };
  const projectedFulfillment = buildFulfillmentDispatchProjection(beforeFulfillment, dispatch);
  const operationLog = buildOperationLog(workspace, {
    targetType: "fulfillment",
    targetId: fulfillmentId,
    action: "update_driver_dispatch",
    operatorId,
    before: {
      fulfillment: beforeFulfillment,
      dispatch: Object.keys(existingDispatch).length ? existingDispatch : null,
    },
    after: {
      fulfillment: projectedFulfillment,
      dispatch,
    },
    reason: dispatch.remark || "office_driver_dispatch_update",
  });

  const transaction = await workspace.driverDeliveryDispatchRepository.upsertDriverDeliveryDispatch({
    workspace,
    dispatch,
    operationLog,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: body,
  });
  const savedDispatch = transaction.dispatch ?? dispatch;
  const savedFulfillment = applyFulfillmentDispatchProjection(workspace, fulfillmentId, savedDispatch) ?? projectedFulfillment;
  const task =
    (await workspace.driverDeliveryTaskReadRepository.getDriverDeliveryTask({
      workspace,
      fulfillmentId,
      operatorId: savedDispatch.driverId,
    })) ??
    buildDriverDeliveryTask(workspace, savedFulfillment, {
      driverId: savedDispatch.driverId,
      sortSequence: getFulfillmentSortSequence(workspace, fulfillmentId),
    });

  return sendJson(response, 200, {
    fulfillmentId,
    dispatch: savedDispatch,
    task,
    operationLogId: transaction.operationLogId || operationLog.id,
  });
}

async function confirmDriverDeliveryLoadedRoute({ response, workspace, fulfillmentId, body, operatorId }) {
  const before = findDriverDeliveryFulfillment(workspace, fulfillmentId);
  if (!before) return sendNotFound(response, "DRIVER_DELIVERY_TASK_NOT_FOUND");
  if (body.fulfillmentId && body.fulfillmentId !== fulfillmentId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "fulfillmentId in path and body must match");
  }
  if (before.status === "已交付") {
    return sendBusinessError(response, 409, "DRIVER_DELIVERY_ALREADY_COMPLETED", "Completed delivery tasks cannot be loaded again.");
  }

  const loadedAt = normalizeTimestamp(body.loadedAt, new Date().toISOString());
  const after = {
    ...before,
    status: "配送中",
    driverStatus: "配送中",
    driverId: operatorId,
    loadedBy: operatorId,
    loadedAt,
    driverRemark: body.remark ?? before.driverRemark ?? "",
  };
  const operationLog = buildOperationLog(workspace, {
    targetType: "fulfillment",
    targetId: fulfillmentId,
    action: "driver_confirm_loaded",
    operatorId,
    before,
    after,
    reason: body.remark ?? "",
  });
  const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
    workspace,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: body,
    fulfillment: buildFulfillmentActionRecord(workspace, after, {
      operatorId,
      actualQty: after.actualQty ?? after.qty,
      confirmedBy: after.confirmedBy ?? "",
    }),
    operationLog,
  });
  const savedFulfillment = findFulfillment(workspace, fulfillmentId) ?? after;
  return sendJson(response, 200, {
    fulfillmentId,
    status: "配送中",
    task: await getDriverDeliveryTaskResponseProjection(workspace, { fulfillmentId, operatorId, fallbackFulfillment: savedFulfillment }),
    operationLogId: transaction.operationLogId,
  });
}

async function recordDriverDeviceFieldTestRoute({ response, workspace, fulfillmentId, body, operatorId }) {
  const before = findDriverDeliveryFulfillment(workspace, fulfillmentId);
  if (!before) return sendNotFound(response, "DRIVER_DELIVERY_TASK_NOT_FOUND");
  if (body.fulfillmentId && body.fulfillmentId !== fulfillmentId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "fulfillmentId in path and body must match");
  }

  const record = normalizeDriverDeviceFieldTestApiRecord({
    ...body,
    fulfillmentId,
    orderLineId: body.orderLineId ?? before.orderLineId ?? before.lineId,
    driverId: body.driverId ?? before.driverId ?? operatorId,
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
  const before = findDriverDeliveryFulfillment(workspace, fulfillmentId);
  if (!before) return sendNotFound(response, "DRIVER_DELIVERY_TASK_NOT_FOUND");
  if (body.fulfillmentId && body.fulfillmentId !== fulfillmentId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "fulfillmentId in path and body must match");
  }
  if (!hasDriverWatermarkEvidence(body)) {
    return sendBusinessError(
      response,
      422,
      "WATERMARK_PHOTO_REQUIRED",
      "Driver delivery completion requires a watermarked delivery photo.",
    );
  }
  const isDeliveryEvidenceRetake = before.status === "已交付" && before.deliveryEvidenceReviewStatus === "需重拍";
  if (before.status === "已交付" && !isDeliveryEvidenceRetake) {
    return sendBusinessError(response, 409, "DRIVER_DELIVERY_ALREADY_COMPLETED", "This delivery task has already been completed.");
  }

  const fulfillments = isDeliveryEvidenceRetake
    ? workspace.fulfillments
    : updateFulfillmentsForAction(workspace.fulfillments, fulfillmentId, "完成送货");
  const baseAfter = fulfillments.find((item) => item.id === fulfillmentId) ?? before;
  const completedAt = normalizeTimestamp(body.completedAt, new Date().toISOString());
  const actualQty = Math.max(0, Number(body.actualQty ?? baseAfter.actualQty ?? baseAfter.qty ?? 0));
  const watermarkCapturedAt = normalizeTimestamp(body.watermarkCapturedAt ?? body.watermarkedPhotoCapturedAt, completedAt);
  const watermarkLocationLabel = String(body.watermarkLocationLabel ?? body.locationLabel ?? "").trim();
  const watermarkGeoPoint = String(body.watermarkGeoPoint ?? body.geoPoint ?? "").trim();
  const watermarkAddress = String(body.watermarkAddress ?? body.address ?? before.address ?? "").trim();
  const watermarkId = String(body.watermarkId ?? body.watermarkedPhotoWatermarkId ?? "").trim();
  const watermarkText = String(body.watermarkText ?? "").trim();
  const after = {
    ...baseAfter,
    driverStatus: "已完成",
    driverId: operatorId,
    actualQty,
    receiverName: String(body.receiverName ?? "").trim(),
    paperNoteStatus: String(body.paperNoteStatus ?? "已交回").trim() || "已交回",
    watermarkedPhotoAttached: true,
    watermarkedPhotoAttachmentId: String(body.watermarkedPhotoAttachmentId ?? body.watermarkedPhotoId ?? "").trim(),
    watermarkedPhotoUrl: String(body.watermarkedPhotoUrl ?? "").trim(),
    watermarkId,
    watermarkText,
    watermarkCapturedAt,
    watermarkLocationLabel,
    watermarkGeoPoint,
    watermarkAddress,
    watermarkOperatorId: String(body.watermarkOperatorId ?? operatorId ?? "").trim(),
    watermarkOperatorName: String(body.watermarkOperatorName ?? "").trim(),
    signaturePhotoAttached: body.signaturePhotoAttached === true,
    signaturePhotoAttachmentId: String(body.signaturePhotoAttachmentId ?? body.signaturePhotoId ?? "").trim(),
    deliveryEvidenceReviewStatus: "待复核",
    deliveryEvidenceReviewedAt: "",
    deliveryEvidenceReviewedBy: "",
    deliveryEvidenceReviewedByUserId: "",
    deliveryEvidenceIssueReason: "",
    deliveryEvidenceReviewRemark: isDeliveryEvidenceRetake ? "司机已补拍，待办公室复核" : "",
    deliveryEvidenceReviewUpdatedAt: completedAt,
    completedAt: isDeliveryEvidenceRetake ? (baseAfter.completedAt ?? baseAfter.deliveredAt ?? completedAt) : completedAt,
    deliveredAt: isDeliveryEvidenceRetake ? (baseAfter.deliveredAt ?? completedAt) : completedAt,
    confirmedAt: isDeliveryEvidenceRetake ? (baseAfter.confirmedAt ?? completedAt) : completedAt,
    confirmedBy: isDeliveryEvidenceRetake ? (baseAfter.confirmedBy ?? operatorId) : operatorId,
    driverRemark: body.remark ?? baseAfter.driverRemark ?? "",
  };
  const resolvedRetakeTodo = isDeliveryEvidenceRetake
    ? buildResolvedDeliveryEvidenceRetakeTodo(workspace, before, operatorId, completedAt)
    : null;
  const operationLog = buildOperationLog(workspace, {
    targetType: "fulfillment",
    targetId: fulfillmentId,
    action: isDeliveryEvidenceRetake ? "driver_resubmit_delivery_evidence" : "driver_complete_delivery",
    operatorId,
    before,
    after,
    reason: body.remark ?? body.receiverName ?? (isDeliveryEvidenceRetake ? "driver_delivery_evidence_resubmitted" : "driver_delivery_complete"),
  });
  const inventoryMovements = isDeliveryEvidenceRetake
    ? emptyFulfillmentInventoryMovements("skipped_delivery_evidence_resubmission")
    : buildFulfillmentInventoryMovements(workspace, after, {
        actualQty,
        operatorId,
        action: "完成送货",
        allowUnreservedInventoryDeduction:
          body.allowUnreservedInventoryDeduction === true || body.inventoryDeductionPolicy === "legacy_stock_match",
      });
  if (inventoryMovements.error) {
    return sendBusinessError(response, 409, inventoryMovements.error.code, inventoryMovements.error.message);
  }
  const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
    workspace,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: body,
    fulfillment: buildFulfillmentActionRecord(workspace, after, {
      operatorId,
      actualQty,
      deliveredAt: completedAt,
      confirmedAt: completedAt,
    }),
    inventoryReservations: inventoryMovements.inventoryReservations,
    inventoryLedgerEntries: inventoryMovements.inventoryLedgerEntries,
    inventoryAdjustments: inventoryMovements.inventoryAdjustments,
    todo: resolvedRetakeTodo,
    operationLog,
  });
  const savedFulfillment = findFulfillment(workspace, fulfillmentId) ?? after;
  return sendJson(response, 200, {
    fulfillmentId,
    status: "已完成",
    actualQty,
    statementCandidate: true,
    evidenceResubmission: isDeliveryEvidenceRetake,
    retakeTodoId: transaction.todo?.id ?? resolvedRetakeTodo?.id ?? "",
    inventoryDeductionMode: inventoryMovements.inventoryDeductionMode,
    inventoryLedgerIds: transaction.inventoryLedgerEntries.map((entry) => entry.ledgerId),
    task: await getDriverDeliveryTaskResponseProjection(workspace, { fulfillmentId, operatorId, fallbackFulfillment: savedFulfillment }),
    operationLogId: transaction.operationLogId,
  });
}

async function reportDriverDeliveryExceptionRoute({ response, workspace, fulfillmentId, body, operatorId }) {
  const before = findDriverDeliveryFulfillment(workspace, fulfillmentId);
  if (!before) return sendNotFound(response, "DRIVER_DELIVERY_TASK_NOT_FOUND");
  if (body.fulfillmentId && body.fulfillmentId !== fulfillmentId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "fulfillmentId in path and body must match");
  }
  if (before.status === "已交付") {
    return sendBusinessError(response, 409, "DRIVER_DELIVERY_ALREADY_COMPLETED", "Completed delivery tasks cannot report delivery exceptions.");
  }
  const reasonText = String(body.reasonText ?? body.reasonCode ?? body.reason ?? "other").trim() || "other";
  const reasonCode = String(body.reasonCode ?? "other").trim() || "other";
  const exceptionOccurredAt = body.occurredAt ?? new Date().toISOString();
  const after = {
    ...before,
    status: "送货异常",
    driverStatus: "送货异常",
    driverId: operatorId,
    exceptionReasonCode: reasonCode,
    exceptionReason: reasonText,
    exceptionOccurredAt,
    actualQty: Math.max(0, Number(body.actualQty ?? before.actualQty ?? before.qty ?? 0)),
  };
  const orderLine = findOrderLine(workspace, after.lineId ?? after.orderLineId) ?? {};
  const todo = buildTodo(workspace, {
    type: "送货异常待处理",
    customerId: after.customerId,
    ref: after.lineId ?? after.orderLineId,
    summary: `${after.goods ?? orderLine.product ?? "送货任务"}：${reasonText}`,
    latest: after.latest ?? orderLine.latest ?? "待确认",
    urgency: "异常",
    impact: "需办公室联系客户、仓库或司机确认下一步",
    createdBy: operatorId,
  });
  const fulfillmentException = buildFulfillmentExceptionRecord(
    workspace,
    before,
    {
      exceptionType: "delivery_exception",
      expectedQty: before.qty,
      actualQty: after.actualQty,
      reasonCode,
      reason: reasonText,
      occurredAt: exceptionOccurredAt,
    },
    "driver_delivery_exception",
    todo,
    operatorId,
  );
  const operationLog = buildOperationLog(workspace, {
    targetType: "fulfillment",
    targetId: fulfillmentId,
    action: "driver_report_delivery_exception",
    operatorId,
    before,
    after,
    reason: reasonText,
  });
  const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
    workspace,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: body,
    fulfillment: buildFulfillmentActionRecord(workspace, after, {
      operatorId,
      actualQty: after.actualQty,
    }),
    fulfillmentException,
    todo,
    operationLog,
  });
  const savedFulfillment = findFulfillment(workspace, fulfillmentId) ?? after;
  return sendJson(response, 200, {
    fulfillmentId,
    status: "送货异常",
    todoId: transaction.todo?.id ?? todo.id,
    todoType: transaction.todo?.type ?? todo.type,
    task: await getDriverDeliveryTaskResponseProjection(workspace, { fulfillmentId, operatorId, fallbackFulfillment: savedFulfillment }),
    operationLogId: transaction.operationLogId,
  });
}

async function reviewDeliveryEvidenceRoute({ response, workspace, fulfillmentId, body, operatorId }) {
  const before = findFulfillment(workspace, fulfillmentId);
  if (!before) return sendNotFound(response, "FULFILLMENT_NOT_FOUND");
  if (body.fulfillmentId && body.fulfillmentId !== fulfillmentId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "fulfillmentId in path and body must match");
  }
  if (before.method !== "送货") {
    return sendBusinessError(
      response,
      409,
      "DELIVERY_EVIDENCE_REVIEW_NOT_APPLICABLE",
      "Delivery evidence review only applies to delivery fulfillments.",
    );
  }
  if (!hasDriverWatermarkEvidence(before)) {
    return sendBusinessError(
      response,
      409,
      "DELIVERY_EVIDENCE_WATERMARK_REQUIRED",
      "Delivery evidence review requires a submitted watermarked delivery photo.",
    );
  }

  const reviewStatus = normalizeDeliveryEvidenceReviewStatus(body.reviewStatus ?? body.decision ?? body.status);
  if (!reviewStatus) {
    return sendBusinessError(
      response,
      422,
      "DELIVERY_EVIDENCE_REVIEW_STATUS_INVALID",
      "reviewStatus must be approved/reviewed/已复核 or rejected/retake_required/需重拍.",
    );
  }

  const reviewedAt = normalizeTimestamp(body.reviewedAt, new Date().toISOString());
  const reviewerLabel =
    String(body.reviewerName ?? body.reviewedBy ?? body.reviewerLabel ?? "").trim() ||
    String(operatorId ?? "U-OFFICE-A").trim();
  const reason = String(body.reason ?? body.reasonText ?? body.remark ?? "").trim();
  const issueReason = reviewStatus === "需重拍" ? reason || "水印/定位/照片清晰度需补充" : "";
  const after = {
    ...before,
    deliveryEvidenceReviewStatus: reviewStatus,
    deliveryEvidenceReviewedAt: reviewedAt,
    deliveryEvidenceReviewedBy: reviewerLabel,
    deliveryEvidenceReviewedByUserId: operatorId,
    deliveryEvidenceIssueReason: issueReason,
    deliveryEvidenceReviewRemark: reason,
    deliveryEvidenceReviewUpdatedAt: reviewedAt,
  };
  const todo = reviewStatus === "需重拍" ? buildDeliveryEvidenceRetakeTodo(workspace, after, issueReason, operatorId) : null;
  const operationLog = buildOperationLog(workspace, {
    targetType: "fulfillment",
    targetId: fulfillmentId,
    action: reviewStatus === "需重拍" ? "reject_delivery_evidence" : "review_delivery_evidence",
    operatorId,
    before,
    after,
    reason: issueReason || reason || "delivery_evidence_reviewed",
  });
  const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
    workspace,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: body,
    fulfillment: buildFulfillmentActionRecord(workspace, after, {
      operatorId,
      actualQty: after.actualQty ?? after.qty ?? 0,
      deliveredAt: after.deliveredAt ?? after.completedAt ?? "",
      confirmedAt: after.confirmedAt ?? after.completedAt ?? "",
    }),
    todo,
    operationLog,
  });
  const savedFulfillment = findFulfillment(workspace, fulfillmentId) ?? after;
  return sendJson(response, 200, {
    fulfillmentId,
    reviewStatus,
    reviewedAt,
    reviewedBy: reviewerLabel,
    reviewedByUserId: operatorId,
    issueReason,
    todoId: transaction.todo?.id ?? todo?.id ?? "",
    todoType: transaction.todo?.type ?? todo?.type ?? "",
    task: await getDriverDeliveryTaskResponseProjection(workspace, {
      fulfillmentId,
      operatorId: savedFulfillment.driverId ?? operatorId,
      fallbackFulfillment: savedFulfillment,
    }),
    operationLogId: transaction.operationLogId || operationLog.id,
  });
}

async function createFulfillmentExceptionRoute({ response, workspace, fulfillmentId, body }) {
  const selected = findFulfillment(workspace, fulfillmentId);
  if (!selected) return sendNotFound(response, "FULFILLMENT_NOT_FOUND");
  const modalType = body.exceptionType === "unable_to_outbound" ? "unable" : "mismatch";
  const operatorId = body.operatorId ?? "U-OFFICE-A";
  const payload = {
    actualQty: Number(body.actualQty ?? 0),
    reason: body.reasonCode ?? body.reason ?? "other",
  };
  const result = confirmFulfillmentException(workspace.fulfillments, selected, modalType, payload);
  const after = result.fulfillments.find((item) => item.id === fulfillmentId);
  const todo = buildTodo(workspace, {
    ...result.todoInput,
    createdBy: operatorId,
  });
  const fulfillmentException = buildFulfillmentExceptionRecord(workspace, selected, body, modalType, todo, operatorId);
  const operationLog = buildOperationLog(workspace, {
    targetType: "fulfillment",
    targetId: fulfillmentId,
    action: "create_fulfillment_exception",
    operatorId,
    before: selected,
    after,
    reason: payload.reason,
  });
  const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
    workspace,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: body,
    fulfillment: buildFulfillmentActionRecord(workspace, after, {
      operatorId,
      actualQty: payload.actualQty,
    }),
    fulfillmentException,
    todo,
    operationLog,
  });

  return sendJson(response, 200, {
    fulfillmentId,
    status: modalType === "unable" ? "无法出库" : "数量差异待处理",
    todoId: transaction.todo?.id ?? todo.id,
    todoType: transaction.todo?.type ?? todo.type,
    inventoryHoldStatus: "pending_review",
    operationLogId: transaction.operationLogId,
  });
}

async function printFulfillmentRoute({ response, workspace, fulfillmentId, body }) {
  const result = await fulfillmentPrintCommandService.printFulfillment({ workspace, fulfillmentId, body });
  if (result.notFound) return sendNotFound(response, "FULFILLMENT_NOT_FOUND");
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result);
}

async function upsertPrintDeviceRoute({ response, workspace, body }) {
  const result = await printDeviceCommandService.upsertPrintDevice({ workspace, body });
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
  findInventoryItem,
  toInventoryQuantitySnapshot,
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

async function updatePrintJobStatusRoute({ response, workspace, printJobId, body }) {
  const result = await printJobLifecycleService.updatePrintJobStatus({ workspace, printJobId, body });
  if (result.notFound) return sendNotFound(response, "PRINT_JOB_NOT_FOUND");
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result);
}

async function dispatchPrintJobRoute({ response, workspace, printJobId, body }) {
  const result = await printJobLifecycleService.dispatchPrintJob({ workspace, printJobId, body });
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

async function retryPrintJobRoute({ response, workspace, printJobId, body }) {
  const result = await printJobLifecycleService.retryPrintJob({ workspace, printJobId, body });
  if (result.notFound) return sendNotFound(response, "PRINT_JOB_NOT_FOUND");
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result);
}

async function voidPrintRecordRoute({ response, workspace, printRecordId, body }) {
  const result = await fulfillmentPrintCommandService.voidPrintRecord({ workspace, printRecordId, body });
  if (result.notFound) return sendNotFound(response, "PRINT_RECORD_NOT_FOUND");
  if (result.error) return sendBusinessError(response, result.statusCode, result.code, result.message);
  return sendJson(response, 200, result);
}

async function updateFulfillmentStatusRoute({ response, workspace, fulfillmentId, action, body }) {
  const before = findFulfillment(workspace, fulfillmentId);
  if (!before) return sendNotFound(response, "FULFILLMENT_NOT_FOUND");
  if (
    action === "确认已拉走" &&
    mapFulfillmentMethod(before.method) === "express_ltl" &&
    (!before.printed || before.status !== "待确认拉走")
  ) {
    return sendBusinessError(
      response,
      409,
      "FULFILLMENT_PRINT_NOT_CONFIRMED",
      "Express/LTL pickup requires a trusted printed status before confirmation.",
    );
  }
  const operatorId = body.operatorId ?? "U-OFFICE-A";
  const fulfillments = updateFulfillmentsForAction(workspace.fulfillments, fulfillmentId, action);
  const after = fulfillments.find((item) => item.id === fulfillmentId);
  const operationLog = buildOperationLog(workspace, {
    targetType: "fulfillment",
    targetId: fulfillmentId,
    action:
      action === "确认已拉走"
        ? "confirm_fulfillment_pickup"
        : action === "标记已备货"
          ? "mark_fulfillment_prepared"
          : "complete_fulfillment",
    operatorId,
    before,
    after,
  });
  const actualQty = Number(body.actualQty ?? after.qty ?? 0);
  const inventoryMovements = buildFulfillmentInventoryMovements(workspace, after, {
    actualQty,
    operatorId,
    action,
    allowUnreservedInventoryDeduction:
      body.allowUnreservedInventoryDeduction === true || body.inventoryDeductionPolicy === "legacy_stock_match",
  });
  if (inventoryMovements.error) {
    return sendBusinessError(response, 409, inventoryMovements.error.code, inventoryMovements.error.message);
  }
  const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
    workspace,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: body,
    fulfillment: buildFulfillmentActionRecord(workspace, after, {
      operatorId,
      actualQty,
      deliveredAt: body.completedAt ?? body.pickedAt ?? (after.status === "已交付" ? new Date().toISOString() : ""),
      confirmedAt: after.status === "已交付" ? new Date().toISOString() : "",
    }),
    inventoryReservations: inventoryMovements.inventoryReservations,
    inventoryLedgerEntries: inventoryMovements.inventoryLedgerEntries,
    inventoryAdjustments: inventoryMovements.inventoryAdjustments,
    operationLog,
  });
  return sendJson(response, 200, {
    fulfillmentId,
    status: after.status,
    actualQty,
    statementCandidate: after.status === "已交付",
    statementId: after.status === "已交付" ? "" : undefined,
    inventoryDeductionMode: inventoryMovements.inventoryDeductionMode,
    inventoryLedgerIds: transaction.inventoryLedgerEntries.map((entry) => entry.ledgerId),
    operationLogId: transaction.operationLogId,
  });
}

async function cancelFulfillmentRoute({ response, workspace, fulfillmentId, body }) {
  const before = findFulfillment(workspace, fulfillmentId);
  if (!before) return sendNotFound(response, "FULFILLMENT_NOT_FOUND");
  if (body.fulfillmentId && body.fulfillmentId !== fulfillmentId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "fulfillmentId in path and body must match");
  }
  if (!isCancelableFulfillment(before)) {
    return sendBusinessError(
      response,
      409,
      "FULFILLMENT_NOT_CANCELABLE",
      "Delivered or already-cancelled fulfillment records cannot be cancelled through this route.",
    );
  }

  const operatorId = body.operatorId ?? "U-OFFICE-A";
  const canceledAt = body.canceledAt ?? new Date().toISOString();
  const reason = mapFulfillmentCancelReason(body.reason ?? "office_correction", body.reasonText);
  const after = {
    ...before,
    fulfillmentId: before.fulfillmentId ?? before.id,
    orderLineId: before.orderLineId ?? before.lineId,
    lineId: before.lineId ?? before.orderLineId,
    status: "已取消",
    actualQty: 0,
    canceledAt,
    cancelReason: reason,
    confirmedBy: operatorId,
  };
  const inventoryRelease = buildFulfillmentCancelInventoryRelease(workspace, after, {
    operatorId,
    reason,
  });
  const operationLog = buildOperationLog(workspace, {
    targetType: "fulfillment",
    targetId: fulfillmentId,
    action: "cancel_fulfillment",
    operatorId,
    before,
    after: {
      ...after,
      releasedReservationIds: inventoryRelease.inventoryReservations.map((reservation) => reservation.reservationId),
    },
    reason,
  });
  const transaction = await workspace.fulfillmentActionTransactionRepository.recordFulfillmentAction({
    workspace,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: body,
    fulfillment: buildFulfillmentActionRecord(workspace, after, {
      operatorId,
      actualQty: 0,
      confirmedAt: canceledAt,
    }),
    inventoryReservations: inventoryRelease.inventoryReservations,
    inventoryLedgerEntries: inventoryRelease.inventoryLedgerEntries,
    inventoryAdjustments: inventoryRelease.inventoryAdjustments,
    operationLog,
  });

  return sendJson(response, 200, {
    fulfillmentId,
    orderLineId: transaction.fulfillment?.orderLineId ?? after.orderLineId,
    status: transaction.fulfillment?.status ?? after.status,
    releasedReservations: transaction.inventoryReservations.map(toInventoryReservationTransactionSummary),
    inventoryLedgerIds: transaction.inventoryLedgerEntries.map((entry) => entry.ledgerId),
    operationLogId: transaction.operationLogId,
  });
}

function resolvePersistableCreatedBy(workspace, candidateUserId, fallbackUserId) {
  const candidate = cleanServerText(candidateUserId);
  const knownUserIds = new Set(
    (Array.isArray(workspace.users) ? workspace.users : []).map((user) => cleanServerText(user?.userId ?? user?.id)),
  );
  return candidate && knownUserIds.has(candidate) ? candidate : cleanServerText(fallbackUserId);
}

async function publishProductionScheduleRoute({ response, workspace, productionTaskId, body, operatorId }) {
  const beforeTask = findProductionTask(workspace, productionTaskId) ?? buildProductionTaskFromBody(workspace, productionTaskId, body);
  if (!beforeTask) return sendNotFound(response, "PRODUCTION_TASK_NOT_FOUND");
  if (body.productionTaskId && body.productionTaskId !== productionTaskId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "productionTaskId in path and body must match");
  }
  if (isProductionTaskCompletedStatus(beforeTask.taskStatus ?? beforeTask.status)) {
    return sendBusinessError(response, 409, "PRODUCTION_TASK_ALREADY_COMPLETED", "Completed production tasks cannot be published again.");
  }

  const orderLineId = body.orderLineId ?? beforeTask.orderLineId ?? beforeTask.lineId;
  const beforeOrderLine = findOrderLine(workspace, orderLineId);
  if (!beforeOrderLine) return sendNotFound(response, "ORDER_LINE_NOT_FOUND");
  if (String(beforeOrderLine.orderType ?? "").includes("外加工")) {
    return sendBusinessError(
      response,
      409,
      "PRODUCTION_SCHEDULE_EXTERNAL_PROCESSING_NOT_SUPPORTED",
      "External-processing print service tasks are not published to the in-house workshop task pool.",
    );
  }

  const publishedAt = body.publishedAt ?? new Date().toISOString();
  const taskType =
    cleanServerText(body.processType ?? beforeTask.taskType) || inferProductionTaskTypeFromOrderLine(beforeOrderLine);
  const machineId =
    cleanServerText(body.machineId ?? beforeTask.machineId) || inferProductionMachineIdFromTaskType(taskType);
  const plannedQty = Math.trunc(Number(body.plannedQty ?? beforeTask.plannedQty ?? beforeTask.qty ?? beforeOrderLine.qty ?? beforeOrderLine.originalQty ?? 0));
  if (!machineId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "machineId is required when publishing a production schedule.");
  }
  if (!Number.isFinite(plannedQty) || plannedQty <= 0) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "plannedQty must be greater than 0.");
  }

  const publishedScheduleId =
    cleanServerText(body.publishedScheduleId) ||
    cleanServerText(beforeTask.publishedScheduleId) ||
    nextPlainId("SCH", `${machineId}-${productionTaskId}-${compactTimestamp(publishedAt)}`);
  const taskStatus = body.taskStatus ?? resolvePublishedProductionTaskStatus({ taskType, beforeTask, beforeOrderLine });
  const afterTask = {
    ...beforeTask,
    id: productionTaskId,
    productionTaskId,
    bizNo: beforeTask.bizNo ?? productionTaskId,
    orderLineId,
    lineId: orderLineId,
    taskType,
    machineId,
    plannedQty,
    qty: plannedQty,
    taskStatus,
    status: taskStatus,
    publishedScheduleId,
    createdBy: resolvePersistableCreatedBy(workspace, beforeTask.createdBy, operatorId),
    createdAt: beforeTask.createdAt ?? publishedAt,
    updatedAt: publishedAt,
  };
  const lineStatus = body.lineStatus ?? resolvePublishedProductionLineStatus({ taskType, beforeOrderLine, taskStatus });
  const afterOrderLine = {
    ...beforeOrderLine,
    orderLineId: beforeOrderLine.orderLineId ?? beforeOrderLine.id,
    lineStatus,
    status: lineStatus,
    exceptionTags: beforeOrderLine.exceptionTags ?? beforeOrderLine.exceptions ?? [],
  };
  const operationLog = buildOperationLog(workspace, {
    targetType: "production_task",
    targetId: productionTaskId,
    action: "publish_production_schedule",
    operatorId,
    before: {
      productionTask: beforeTask,
      orderLine: summarizeOrderLineForChange(beforeOrderLine),
    },
    after: {
      productionTask: afterTask,
      orderLine: summarizeOrderLineForChange(afterOrderLine),
      inventoryCreated: false,
      reservationCreated: false,
      packingTaskCreated: false,
    },
    reason: body.remark ?? "办公室发布排产到车间任务池",
  });
  const transaction = await workspace.productionPackingTransactionRepository.publishProductionSchedule({
    workspace,
    productionTask: afterTask,
    orderLine: afterOrderLine,
    operationLog,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: { ...body, operatorId },
  });

  return sendJson(response, 200, {
    productionTaskId,
    orderLineId,
    publishedScheduleId: transaction.productionTask.publishedScheduleId,
    status: transaction.productionTask.taskStatus,
    taskStatus: transaction.productionTask.taskStatus,
    orderLineStatus: transaction.orderLine?.lineStatus ?? lineStatus,
    taskType: transaction.productionTask.taskType,
    machineId: transaction.productionTask.machineId,
    plannedQty: transaction.productionTask.plannedQty,
    publishedAt: transaction.productionTask.updatedAt || publishedAt,
    productionTask: transaction.productionTask,
    orderLine: transaction.orderLine,
    inventoryCreated: false,
    reservationCreated: false,
    packingTaskCreated: false,
    operationLogId: transaction.operationLogId,
  });
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
  const machineId = cleanServerText(body.machineId);
  const orderedProductionTaskIds = normalizeStringArray(body.orderedProductionTaskIds ?? body.productionTaskIds);
  if (!machineId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "machineId is required for production queue resequencing.");
  }
  if (orderedProductionTaskIds.length < 1) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "orderedProductionTaskIds must contain at least one production task.");
  }
  if (new Set(orderedProductionTaskIds).size !== orderedProductionTaskIds.length) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "orderedProductionTaskIds must not contain duplicates.");
  }

  const beforeQueue = await buildProductionMachineQueueResponse({ workspace, query: { machineId, status: "open" } });
  const machineQueueItems = beforeQueue.items.filter((item) => item.machineId === machineId);
  const queueByTaskId = new Map(machineQueueItems.map((item) => [item.productionTaskId, item]));
  const unknownIds = orderedProductionTaskIds.filter((productionTaskId) => !queueByTaskId.has(productionTaskId));
  if (unknownIds.length) {
    return sendBusinessError(
      response,
      422,
      "PRODUCTION_SCHEDULE_QUEUE_ITEM_NOT_FOUND",
      `Production tasks are not in the active queue for ${machineId}: ${unknownIds.join(", ")}`,
    );
  }
  const missingIds = machineQueueItems
    .map((item) => item.productionTaskId)
    .filter((productionTaskId) => !orderedProductionTaskIds.includes(productionTaskId));
  if (missingIds.length) {
    return sendBusinessError(
      response,
      422,
      "PRODUCTION_SCHEDULE_QUEUE_SEQUENCE_INCOMPLETE",
      `The new sequence must include every active queue item for ${machineId}: ${missingIds.join(", ")}`,
    );
  }

  const updatedAt = cleanServerText(body.updatedAt) || new Date().toISOString();
  const remark = cleanServerText(body.remark) || "办公室调整同机台排产队列顺序";
  const beforeRecords = cloneJson(workspace.productionScheduleRecords ?? []);
  const nextRecords = buildProductionScheduleRecordsForSequence({
    records: workspace.productionScheduleRecords ?? [],
    orderedItems: orderedProductionTaskIds.map((productionTaskId, index) => ({
      ...queueByTaskId.get(productionTaskId),
      queueSeq: index + 1,
    })),
    machineId,
    operatorId,
    updatedAt,
    remark,
  });
  const operationLog = buildOperationLog(workspace, {
    targetType: "production_schedule_queue",
    targetId: machineId,
    action: "resequence_production_schedule_queue",
    operatorId,
    before: {
      machineId,
      items: machineQueueItems.map((item) => summarizeProductionScheduleQueueItem(item)),
      records: beforeRecords.filter((record) => cleanServerText(record.machineId) === machineId),
    },
    after: {
      machineId,
      items: nextRecords.map((item) => summarizeProductionScheduleQueueItem(item)),
      inventoryCreated: false,
      reservationCreated: false,
      packingTaskCreated: false,
    },
    reason: remark,
  });
  const transaction = await workspace.productionScheduleRecordRepository.resequenceMachineQueue({
    workspace,
    records: nextRecords,
    expectedRecords: beforeRecords.filter((record) => cleanServerText(record.machineId) === machineId),
    lockedMachineIds: [machineId],
    transactionContext: {
      machineId,
      updatedAt,
      updatedBy: operatorId,
      updatedCount: orderedProductionTaskIds.length,
    },
    operationLog,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: { ...body, operatorId },
  });
  const afterQueue = await buildProductionMachineQueueResponse({ workspace, query: { machineId, status: "open" } });

  return sendJson(response, 200, {
    machineId,
    updatedCount: Number(transaction.transactionContext.updatedCount ?? orderedProductionTaskIds.length),
    updatedAt: cleanServerText(transaction.transactionContext.updatedAt) || updatedAt,
    updatedBy: cleanServerText(transaction.transactionContext.updatedBy) || operatorId,
    operationLogId: transaction.operationLogId,
    productionScheduleRecords: transaction.productionScheduleRecords,
    inventoryCreated: false,
    reservationCreated: false,
    packingTaskCreated: false,
    ...afterQueue,
  });
}

async function moveProductionMachineQueueItemRoute({ response, workspace, body, operatorId }) {
  const productionTaskId = cleanServerText(body.productionTaskId);
  const targetMachineId = cleanServerText(body.targetMachineId ?? body.machineId);
  if (!productionTaskId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "productionTaskId is required for moving a production schedule item.");
  }
  if (!targetMachineId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "targetMachineId is required for moving a production schedule item.");
  }

  const beforeQueue = await buildProductionMachineQueueResponse({ workspace, query: { status: "open" } });
  const movingItem = beforeQueue.items.find((item) => item.productionTaskId === productionTaskId);
  if (!movingItem) {
    return sendBusinessError(
      response,
      404,
      "PRODUCTION_SCHEDULE_QUEUE_ITEM_NOT_FOUND",
      `Production task is not in the active machine queue: ${productionTaskId}`,
    );
  }
  const sourceMachineId = cleanServerText(movingItem.machineId);
  const targetQueueBase = beforeQueue.items.filter(
    (item) => item.machineId === targetMachineId && item.productionTaskId !== productionTaskId,
  );
  const positionedTargetQueue = insertProductionScheduleQueueItem({
    items: targetQueueBase,
    item: {
      ...movingItem,
      machineId: targetMachineId,
      machineLabel: targetMachineId,
      scheduleRecordId: "",
    },
    body,
  });
  if (positionedTargetQueue.error) {
    return sendBusinessError(response, 422, positionedTargetQueue.error.code, positionedTargetQueue.error.message);
  }

  const updatedAt = cleanServerText(body.updatedAt) || new Date().toISOString();
  const remark =
    cleanServerText(body.remark) ||
    (sourceMachineId === targetMachineId
      ? "办公室插入调整机台排产队列顺序"
      : `办公室将生产任务从 ${sourceMachineId} 调整到 ${targetMachineId}`);
  const beforeRecords = cloneJson(workspace.productionScheduleRecords ?? []);
  const nextRecords = [];

  if (sourceMachineId !== targetMachineId) {
    const sourceQueueAfterMove = beforeQueue.items
      .filter((item) => item.machineId === sourceMachineId && item.productionTaskId !== productionTaskId)
      .map((item, index) => ({ ...item, queueSeq: index + 1 }));
    nextRecords.push(
      ...buildProductionScheduleRecordsForSequence({
        records: workspace.productionScheduleRecords ?? [],
        orderedItems: sourceQueueAfterMove,
        machineId: sourceMachineId,
        operatorId,
        updatedAt,
        remark,
        sourceKind: "machine_reassignment",
        reuseItemScheduleRecordId: true,
      }),
    );
    nextRecords.push(
      buildMovedProductionScheduleRecord({
        records: workspace.productionScheduleRecords ?? [],
        item: movingItem,
        sourceMachineId,
        operatorId,
        updatedAt,
        remark,
      }),
    );
  }

  const targetQueueAfterMove = positionedTargetQueue.items.map((item, index) => ({ ...item, queueSeq: index + 1 }));
  nextRecords.push(
    ...buildProductionScheduleRecordsForSequence({
      records: workspace.productionScheduleRecords ?? [],
      orderedItems: targetQueueAfterMove,
      machineId: targetMachineId,
      operatorId,
      updatedAt,
      remark,
      sourceKind: sourceMachineId === targetMachineId ? "queue_insert" : "machine_reassignment",
      reuseItemScheduleRecordId: false,
    }),
  );

  const beforeTask = findProductionTask(workspace, productionTaskId);
  if (!beforeTask) return sendNotFound(response, "PRODUCTION_TASK_NOT_FOUND");
  const afterTask = {
    ...beforeTask,
    id: productionTaskId,
    productionTaskId,
    machineId: targetMachineId,
    updatedAt,
  };
  const movedTargetItem = targetQueueAfterMove.find((item) => item.productionTaskId === productionTaskId);
  const operationLog = buildOperationLog(workspace, {
    targetType: "production_schedule_queue",
    targetId: productionTaskId,
    action: sourceMachineId === targetMachineId ? "insert_production_schedule_queue_item" : "move_production_schedule_queue_item",
    operatorId,
    before: {
      productionTask: beforeTask,
      sourceMachineId,
      targetMachineId,
      sourceItems: beforeQueue.items
        .filter((item) => item.machineId === sourceMachineId)
        .map((item) => summarizeProductionScheduleQueueItem(item)),
      targetItems: beforeQueue.items
        .filter((item) => item.machineId === targetMachineId)
        .map((item) => summarizeProductionScheduleQueueItem(item)),
      records: beforeRecords.filter((record) => cleanServerText(record.productionTaskId) === productionTaskId),
    },
    after: {
      productionTask: afterTask,
      sourceMachineId,
      targetMachineId,
      targetQueueSeq: movedTargetItem?.queueSeq ?? 0,
      records: nextRecords.map((record) => summarizeProductionScheduleRecord(record)),
      inventoryCreated: false,
      reservationCreated: false,
      packingTaskCreated: false,
    },
    reason: remark,
  });
  const transaction = await workspace.productionScheduleRecordRepository.moveMachineQueueItem({
    workspace,
    productionTask: afterTask,
    records: nextRecords,
    expectedRecords: beforeRecords.filter((record) =>
      [sourceMachineId, targetMachineId].includes(cleanServerText(record.machineId)),
    ),
    lockedMachineIds: [sourceMachineId, targetMachineId],
    transactionContext: {
      productionTaskId,
      sourceMachineId,
      targetMachineId,
      targetQueueSeq: movedTargetItem?.queueSeq ?? 0,
      updatedCount: nextRecords.length,
      updatedAt,
      updatedBy: operatorId,
    },
    operationLog,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: { ...body, operatorId },
  });
  const afterQueue = await buildProductionMachineQueueResponse({ workspace, query: { status: "open" } });

  return sendJson(response, 200, {
    productionTaskId,
    sourceMachineId: cleanServerText(transaction.transactionContext.sourceMachineId) || sourceMachineId,
    targetMachineId: cleanServerText(transaction.transactionContext.targetMachineId) || targetMachineId,
    targetQueueSeq: Number(transaction.transactionContext.targetQueueSeq ?? movedTargetItem?.queueSeq ?? 0),
    updatedCount: Number(transaction.transactionContext.updatedCount ?? nextRecords.length),
    updatedAt: cleanServerText(transaction.transactionContext.updatedAt) || updatedAt,
    updatedBy: cleanServerText(transaction.transactionContext.updatedBy) || operatorId,
    operationLogId: transaction.operationLogId,
    productionTask: transaction.productionTask,
    productionScheduleRecords: transaction.productionScheduleRecords,
    inventoryCreated: false,
    reservationCreated: false,
    packingTaskCreated: false,
    ...afterQueue,
  });
}

function buildProductionScheduleRecordsForSequence({
  records,
  orderedItems,
  machineId,
  operatorId,
  updatedAt,
  remark,
  sourceKind = "manual_resequence",
  status = "active",
  reuseItemScheduleRecordId = true,
}) {
  const nextByKey = new Map((records ?? []).map((record) => [getProductionScheduleRecordKey(record), { ...record }]));
  const nextRecords = [];
  for (const item of orderedItems) {
    const key = getProductionScheduleRecordKey(item);
    const current = nextByKey.get(key) ?? {};
    nextRecords.push({
      ...current,
      scheduleRecordId:
        cleanServerText(current.scheduleRecordId) ||
        (reuseItemScheduleRecordId ? cleanServerText(item.scheduleRecordId) : "") ||
        `SQR-${safeRecordPart(machineId)}-${safeRecordPart(item.publishedScheduleId || item.productionTaskId)}`,
      productionTaskId: item.productionTaskId,
      orderLineId: item.orderLineId,
      machineId,
      publishedScheduleId: item.publishedScheduleId,
      queueSeq: item.queueSeq,
      status,
      source: sourceKind,
      createdAt: cleanServerText(current.createdAt) || updatedAt,
      createdBy: cleanServerText(current.createdBy) || operatorId,
      updatedAt,
      updatedBy: operatorId,
      remark,
    });
  }
  return nextRecords.sort((left, right) => {
    const leftMachine = cleanServerText(left.machineId);
    const rightMachine = cleanServerText(right.machineId);
    if (leftMachine !== rightMachine) return leftMachine.localeCompare(rightMachine);
    return Math.max(0, Math.trunc(Number(left.queueSeq ?? 0))) - Math.max(0, Math.trunc(Number(right.queueSeq ?? 0)));
  });
}

function buildMovedProductionScheduleRecord({ records, item, sourceMachineId, operatorId, updatedAt, remark }) {
  const current =
    (records ?? []).find(
      (record) =>
        cleanServerText(record.machineId) === sourceMachineId &&
        cleanServerText(record.productionTaskId) === cleanServerText(item.productionTaskId),
    ) ?? {};
  return {
    ...current,
    scheduleRecordId:
      cleanServerText(current.scheduleRecordId) ||
      cleanServerText(item.scheduleRecordId) ||
      `SQR-${safeRecordPart(sourceMachineId)}-${safeRecordPart(item.publishedScheduleId || item.productionTaskId)}`,
    productionTaskId: item.productionTaskId,
    orderLineId: item.orderLineId,
    machineId: sourceMachineId,
    publishedScheduleId: item.publishedScheduleId,
    queueSeq: 0,
    status: "moved",
    source: "machine_reassignment",
    createdAt: cleanServerText(current.createdAt) || updatedAt,
    createdBy: cleanServerText(current.createdBy) || operatorId,
    updatedAt,
    updatedBy: operatorId,
    remark,
  };
}

function insertProductionScheduleQueueItem({ items, item, body }) {
  const beforeProductionTaskId = cleanServerText(body.insertBeforeProductionTaskId ?? body.beforeProductionTaskId);
  const afterProductionTaskId = cleanServerText(body.insertAfterProductionTaskId ?? body.afterProductionTaskId);
  const requestedQueueSeq = Math.trunc(Number(body.targetQueueSeq ?? body.queueSeq ?? body.insertAtQueueSeq ?? 0));
  const next = [...items];
  let insertIndex = next.length;
  if (beforeProductionTaskId) {
    insertIndex = next.findIndex((candidate) => candidate.productionTaskId === beforeProductionTaskId);
    if (insertIndex < 0) {
      return {
        error: {
          code: "PRODUCTION_SCHEDULE_INSERT_TARGET_NOT_FOUND",
          message: `insertBeforeProductionTaskId is not in the target machine queue: ${beforeProductionTaskId}`,
        },
      };
    }
  } else if (afterProductionTaskId) {
    insertIndex = next.findIndex((candidate) => candidate.productionTaskId === afterProductionTaskId);
    if (insertIndex < 0) {
      return {
        error: {
          code: "PRODUCTION_SCHEDULE_INSERT_TARGET_NOT_FOUND",
          message: `insertAfterProductionTaskId is not in the target machine queue: ${afterProductionTaskId}`,
        },
      };
    }
    insertIndex += 1;
  } else if (requestedQueueSeq > 0) {
    insertIndex = Math.min(Math.max(requestedQueueSeq - 1, 0), next.length);
  }
  next.splice(insertIndex, 0, item);
  return {
    items: next.map((candidate, index) => ({
      ...candidate,
      queueSeq: index + 1,
    })),
  };
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

function getProductionScheduleRecordKey(record = {}) {
  return `${cleanServerText(record.machineId)}::${cleanServerText(record.productionTaskId) || cleanServerText(record.publishedScheduleId)}`;
}

function summarizeProductionScheduleQueueItem(item) {
  return {
    scheduleRecordId: cleanServerText(item.scheduleRecordId),
    queueSeq: Math.max(0, Math.trunc(Number(item.queueSeq ?? 0))),
    machineId: cleanServerText(item.machineId),
    publishedScheduleId: cleanServerText(item.publishedScheduleId),
    productionTaskId: cleanServerText(item.productionTaskId),
    orderLineId: cleanServerText(item.orderLineId),
    customerName: cleanServerText(item.customerName),
    productName: cleanServerText(item.productName),
    plannedQty: Math.max(0, Math.trunc(Number(item.plannedQty ?? 0))),
    remainingQty: Math.max(0, Math.trunc(Number(item.remainingQty ?? 0))),
    status: cleanServerText(item.status),
  };
}

function summarizeProductionScheduleRecord(record) {
  return {
    scheduleRecordId: cleanServerText(record.scheduleRecordId ?? record.id),
    productionTaskId: cleanServerText(record.productionTaskId),
    orderLineId: cleanServerText(record.orderLineId),
    publishedScheduleId: cleanServerText(record.publishedScheduleId),
    machineId: cleanServerText(record.machineId),
    queueSeq: Math.max(0, Math.trunc(Number(record.queueSeq ?? 0))),
    status: cleanServerText(record.status ?? record.scheduleStatus),
    sourceKind: cleanServerText(record.sourceKind ?? record.source),
    sequenceUpdatedAt: cleanServerText(record.sequenceUpdatedAt ?? record.updatedAt),
    sequenceUpdatedBy: cleanServerText(record.sequenceUpdatedBy ?? record.updatedBy),
    remark: cleanServerText(record.remark),
  };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanServerText(item)).filter(Boolean);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

async function recordProductionDailyProgressRoute({ response, workspace, productionTaskId, body, operatorId }) {
  const beforeTask = findProductionTask(workspace, productionTaskId) ?? buildProductionTaskFromBody(workspace, productionTaskId, body);
  if (!beforeTask) return sendNotFound(response, "PRODUCTION_TASK_NOT_FOUND");
  if (body.productionTaskId && body.productionTaskId !== productionTaskId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "productionTaskId in path and body must match");
  }
  if (isProductionTaskCompletedStatus(beforeTask.taskStatus ?? beforeTask.status)) {
    return sendBusinessError(response, 409, "PRODUCTION_TASK_ALREADY_COMPLETED", "Completed production tasks cannot record daily progress.");
  }

  const orderLineId = body.orderLineId ?? beforeTask.orderLineId ?? beforeTask.lineId;
  const beforeOrderLine = findOrderLine(workspace, orderLineId);
  if (!beforeOrderLine) return sendNotFound(response, "ORDER_LINE_NOT_FOUND");
  if (String(beforeOrderLine.orderType ?? "").includes("外加工")) {
    return sendBusinessError(
      response,
      409,
      "PRODUCTION_PROGRESS_EXTERNAL_PROCESSING_NOT_SUPPORTED",
      "External-processing print service tasks do not use workshop daily progress.",
    );
  }

  const dailyQualifiedQty = Math.trunc(Number(body.dailyQualifiedQty ?? body.qualifiedQty ?? 0));
  if (!Number.isFinite(dailyQualifiedQty) || dailyQualifiedQty <= 0) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "dailyQualifiedQty must be greater than 0.");
  }
  const reportedAt = body.reportedAt ?? body.completedAt ?? new Date().toISOString();
  const reportDate = normalizeDateInput(body.progressDate ?? reportedAt);
  const machineCount = body.machineCount === undefined || body.machineCount === null ? undefined : Math.trunc(Number(body.machineCount));
  const plannedQty = Math.trunc(Number(beforeTask.plannedQty ?? beforeTask.qty ?? beforeOrderLine.qty ?? beforeOrderLine.originalQty ?? dailyQualifiedQty));
  const previousQualifiedQty = sumProductionDailyProgressQty(workspace, {
    productionTaskId,
    orderLineId,
    excludeReportId: body.reportId,
  });
  const cumulativeQualifiedQty = Number.isFinite(Math.trunc(Number(body.cumulativeQualifiedQty)))
    ? Math.max(0, Math.trunc(Number(body.cumulativeQualifiedQty)))
    : previousQualifiedQty + dailyQualifiedQty;
  const remainingQty = Math.max(0, plannedQty - cumulativeQualifiedQty);
  const nextWorkDate = body.nextWorkDate ?? (remainingQty > 0 ? getNextDateText(reportDate) : "");
  const effectiveMachineId = cleanServerText(beforeTask.machineId ?? body.machineId);
  const afterTask = {
    ...beforeTask,
    productionTaskId,
    orderLineId,
    taskType: body.processType ?? beforeTask.taskType ?? "制袋",
    machineId: effectiveMachineId,
    plannedQty,
    taskStatus: remainingQty > 0 ? "跨日继续" : "待完工确认",
    createdBy: resolvePersistableCreatedBy(workspace, beforeTask.createdBy, operatorId),
  };
  const reportId = body.reportId ?? nextPlainId("WDP", `${productionTaskId}-${workspace.workshopReports.length + 1}`);
  const workshopReport = {
    reportId,
    productionTaskId,
    orderLineId,
    processType: body.processType ?? afterTask.taskType,
    machineId: effectiveMachineId,
    operatorId,
    qualifiedQty: dailyQualifiedQty,
    exceptionQty: Math.max(0, Math.trunc(Number(body.exceptionQty ?? 0))),
    machineCount,
    startedAt: body.startedAt ?? "",
    completedAt: reportedAt,
    remark: body.remark ?? "",
    evidence: {
      ...(body.evidence ?? {}),
      reportKind: "daily_progress",
      progressDate: reportDate,
      plannedQty,
      dailyQualifiedQty,
      previousQualifiedQty,
      cumulativeQualifiedQty,
      remainingQty,
      carryOver: remainingQty > 0,
      nextWorkDate,
      inventoryCreated: false,
      reservationCreated: false,
      packingTaskCreated: false,
      machineCountAffectsInventory: false,
      machineCountLabel: machineCount === undefined ? "" : "机器计数/动作次数，非合格成品数量",
    },
    createdAt: reportedAt,
  };
  const operationLog = buildOperationLog(workspace, {
    targetType: "production_task",
    targetId: productionTaskId,
    action: "record_production_daily_progress",
    operatorId,
    before: beforeTask,
    after: {
      productionTask: afterTask,
      workshopReport,
      orderLine: summarizeOrderLineForChange(beforeOrderLine),
      dailyQualifiedQty,
      previousQualifiedQty,
      cumulativeQualifiedQty,
      remainingQty,
      inventoryCreated: false,
      reservationCreated: false,
      packingTaskCreated: false,
      machineCount: machineCount ?? null,
    },
    reason: body.remark ?? "生产跨日当日报数",
  });
  const transaction = await workspace.productionPackingTransactionRepository.recordProductionDailyProgress({
    workspace,
    productionTask: afterTask,
    workshopReport,
    orderLine: beforeOrderLine,
    operationLog,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: { ...body, operatorId },
  });
  const savedEvidence = transaction.workshopReport.evidence ?? {};

  return sendJson(response, 200, {
    productionTaskId,
    reportId: transaction.workshopReport.reportId,
    orderLineId,
    status: transaction.productionTask.taskStatus,
    taskStatus: transaction.productionTask.taskStatus,
    plannedQty: Number(savedEvidence.plannedQty ?? plannedQty),
    progressDate: savedEvidence.progressDate ?? reportDate,
    dailyQualifiedQty: transaction.workshopReport.qualifiedQty,
    previousQualifiedQty: Number(savedEvidence.previousQualifiedQty ?? previousQualifiedQty),
    cumulativeQualifiedQty: Number(savedEvidence.cumulativeQualifiedQty ?? cumulativeQualifiedQty),
    remainingQty: Number(savedEvidence.remainingQty ?? remainingQty),
    carryOver: savedEvidence.carryOver ?? remainingQty > 0,
    nextWorkDate: savedEvidence.nextWorkDate ?? nextWorkDate,
    machineCount: transaction.workshopReport.machineCount ?? null,
    machineCountAffectsInventory: false,
    inventoryCreated: false,
    reservationCreated: false,
    packingTaskCreated: false,
    operationLogId: transaction.operationLogId,
  });
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
  const beforeTask = findProductionTask(workspace, productionTaskId) ?? buildProductionTaskFromBody(workspace, productionTaskId, body);
  if (!beforeTask) return sendNotFound(response, "PRODUCTION_TASK_NOT_FOUND");
  if (body.productionTaskId && body.productionTaskId !== productionTaskId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "productionTaskId in path and body must match");
  }
  const orderLineId = body.orderLineId ?? beforeTask.orderLineId ?? beforeTask.lineId;
  const beforeOrderLine = findOrderLine(workspace, orderLineId);
  if (!beforeOrderLine) return sendNotFound(response, "ORDER_LINE_NOT_FOUND");
  if (String(beforeOrderLine.orderType ?? "").includes("外加工")) {
    return sendBusinessError(
      response,
      409,
      "PRODUCTION_REPORT_EXTERNAL_PROCESSING_NOT_INVENTORY",
      "External-processing print service reports do not create finished-goods inventory.",
    );
  }
  const qualifiedQty = Math.trunc(Number(body.qualifiedQty ?? 0));
  if (!Number.isFinite(qualifiedQty) || qualifiedQty <= 0) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "qualifiedQty must be greater than 0.");
  }
  const inventoryItem = body.inventoryItemId
    ? findInventoryItem(workspace, body.inventoryItemId)
    : findUniqueMatchingInventory(workspace, beforeOrderLine);
  if (!inventoryItem) return sendNotFound(response, "INVENTORY_ITEM_NOT_FOUND");

  const completedAt = body.completedAt ?? new Date().toISOString();
  const machineCount = body.machineCount === undefined || body.machineCount === null ? undefined : Math.trunc(Number(body.machineCount));
  const effectiveMachineId = cleanServerText(beforeTask.machineId ?? body.machineId);
  const afterTask = {
    ...beforeTask,
    productionTaskId,
    orderLineId,
    taskType: body.processType ?? beforeTask.taskType ?? "制袋",
    machineId: effectiveMachineId,
    plannedQty: Number(beforeTask.plannedQty ?? beforeTask.qty ?? beforeOrderLine.qty ?? qualifiedQty),
    taskStatus: "已完成",
    createdBy: resolvePersistableCreatedBy(workspace, beforeTask.createdBy, operatorId),
  };
  const afterOrderLine = {
    ...beforeOrderLine,
    orderLineId: beforeOrderLine.orderLineId ?? beforeOrderLine.id,
    lineStatus: body.createPackingTask === false ? "待出库" : "待打包",
    status: body.createPackingTask === false ? "待出库" : "待打包",
    exceptionTags: beforeOrderLine.exceptionTags ?? beforeOrderLine.exceptions ?? [],
  };
  const reportId = body.reportId ?? nextPlainId("WR", `${productionTaskId}-${workspace.workshopReports.length + 1}`);
  const workshopReport = {
    reportId,
    productionTaskId,
    orderLineId,
    processType: body.processType ?? afterTask.taskType,
    machineId: effectiveMachineId,
    operatorId,
    qualifiedQty,
    exceptionQty: Math.max(0, Math.trunc(Number(body.exceptionQty ?? 0))),
    machineCount,
    startedAt: body.startedAt ?? "",
    completedAt,
    remark: body.remark ?? "",
    evidence: {
      ...(body.evidence ?? {}),
      machineCountLabel: machineCount === undefined ? "" : "机器计数/动作次数，非合格成品数量",
    },
    createdAt: completedAt,
  };
  const machineCapacityBaseline = buildProductionMachineCapacityBaseline({
    productionTask: afterTask,
    workshopReport,
    orderLine: beforeOrderLine,
    inventoryItem,
    operatorId,
    completedAt,
  });
  const packingTask =
    body.createPackingTask === false
      ? null
      : {
          packingTaskId: body.packingTaskId ?? nextPlainId("PKT", orderLineId),
          bizNo: body.packingTaskBizNo ?? body.packingTaskId ?? nextPlainId("PKT", orderLineId),
          orderLineId,
          plannedQty: qualifiedQty,
          actualPackedQty: 0,
          status: "待打包",
          createdBy: operatorId,
          createdAt: completedAt,
        };
  const onHandBefore = Number(inventoryItem.inStock ?? inventoryItem.onHand ?? 0);
  const reservedBefore = Number(inventoryItem.reserved ?? 0);
  const reservation = {
    reservationId: body.reservationId ?? nextPlainId("RSV", `${productionTaskId}-PROD`),
    orderLineId,
    inventoryItemId: inventoryItem.id,
    reservedQty: qualifiedQty,
    reservationType: "生产完成待出库占用",
    status: "生效",
    createdBy: operatorId,
    createdAt: completedAt,
  };
  const inventoryLedgerEntries = [
    {
      ledgerId: body.inboundLedgerId ?? nextPlainId("LEDGER", `${reportId}-IN`),
      inventoryItemId: inventoryItem.id,
      changeType: "生产入库",
      qtyBefore: onHandBefore,
      qtyChange: qualifiedQty,
      qtyAfter: onHandBefore + qualifiedQty,
      sourceType: "production_report",
      sourceId: reportId,
      operatorId,
      confirmedBy: operatorId,
      occurredAt: completedAt,
      createdAt: completedAt,
      reason: "车间合格报工入库",
      remark: `合格数量 ${qualifiedQty}；机器计数 ${machineCount ?? "未填"} 不参与库存`,
    },
    {
      ledgerId: body.reserveLedgerId ?? nextPlainId("LEDGER", `${reportId}-RESERVE`),
      inventoryItemId: inventoryItem.id,
      changeType: "生产完成占用",
      qtyBefore: reservedBefore,
      qtyChange: qualifiedQty,
      qtyAfter: reservedBefore + qualifiedQty,
      sourceType: "production_report_reservation",
      sourceId: reportId,
      operatorId,
      confirmedBy: operatorId,
      occurredAt: completedAt,
      createdAt: completedAt,
      reason: "生产完成后锁定给订单明细",
      remark: `订单明细 ${orderLineId} 生产完成占用 ${qualifiedQty}`,
    },
  ];
  const operationLog = buildOperationLog(workspace, {
    targetType: "production_task",
    targetId: productionTaskId,
    action: "complete_production_report",
    operatorId,
    before: beforeTask,
    after: {
      productionTask: afterTask,
      workshopReport,
      orderLine: summarizeOrderLineForChange(afterOrderLine),
      packingTaskId: packingTask?.packingTaskId ?? "",
      inventoryItemId: inventoryItem.id,
      qualifiedQty,
      machineCount: machineCount ?? null,
      capacityBaselineId: machineCapacityBaseline?.capacityBaselineId ?? "",
    },
    reason: body.remark ?? "生产报工完成",
  });
  const transaction = await workspace.productionPackingTransactionRepository.recordProductionReport({
    workspace,
    productionTask: afterTask,
    workshopReport,
    orderLine: afterOrderLine,
    packingTask,
    machineCapacityBaseline,
    inventoryReservations: [reservation],
    inventoryAdjustments: [
      {
        inventoryItemId: inventoryItem.id,
        onHandQtyChange: qualifiedQty,
        reservedQtyChange: qualifiedQty,
        expectedRevision: Number(inventoryItem.revision ?? 1),
        expectedOnHandQty: onHandBefore,
        expectedReservedQty: reservedBefore,
      },
    ],
    inventoryLedgerEntries,
    operationLog,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: { ...body, operatorId },
  });

  return sendJson(response, 200, {
    productionTaskId,
    reportId: transaction.workshopReport.reportId,
    orderLineId,
    status: transaction.productionTask.taskStatus,
    orderLineStatus: transaction.orderLine?.lineStatus ?? afterOrderLine.status,
    qualifiedQty: transaction.workshopReport.qualifiedQty,
    machineCount: transaction.workshopReport.machineCount ?? null,
    machineCountAffectsInventory: false,
    capacityCalibrationCreated: Boolean(transaction.machineCapacityBaseline?.capacityBaselineId),
    capacityBaselineId: transaction.machineCapacityBaseline?.capacityBaselineId ?? "",
    capacityCalibration: transaction.machineCapacityBaseline
      ? {
          capacityBaselineId: transaction.machineCapacityBaseline.capacityBaselineId,
          machineId: transaction.machineCapacityBaseline.machineId,
          sizeKey: transaction.machineCapacityBaseline.sizeKey,
          dailyCapacityQty: transaction.machineCapacityBaseline.dailyCapacityQty,
          sourceKind: transaction.machineCapacityBaseline.sourceKind,
          confidence: transaction.machineCapacityBaseline.confidence,
          effectiveFrom: transaction.machineCapacityBaseline.effectiveFrom,
        }
      : null,
    inventoryItemId: inventoryItem.id,
    reservationId: transaction.inventoryReservations[0]?.reservationId ?? reservation.reservationId,
    packingTaskId: transaction.packingTask?.packingTaskId ?? "",
    inventoryLedgerIds: transaction.inventoryLedgerEntries.map((entry) => entry.ledgerId),
    operationLogId: transaction.operationLogId,
  });
}

function buildProductionMachineCapacityBaseline({ productionTask, workshopReport, orderLine, inventoryItem, operatorId, completedAt }) {
  const machineId = cleanServerText(workshopReport?.machineId ?? productionTask?.machineId);
  const sizeKey = buildProductionCapacitySizeKey(orderLine, inventoryItem);
  const qualifiedQty = Math.trunc(Number(workshopReport?.qualifiedQty ?? 0));
  const effectiveFrom = normalizeDateInput(completedAt);
  if (!machineId || !sizeKey || !Number.isFinite(qualifiedQty) || qualifiedQty <= 0 || !effectiveFrom) return null;
  return {
    capacityBaselineId: nextPlainId("MCB", `${machineId}-${sizeKey}-production-report-${effectiveFrom}`),
    machineId,
    sizeKey,
    dailyCapacityQty: qualifiedQty,
    hourlyCapacityQty: null,
    sourceKind: "production_report",
    confidence: "medium",
    effectiveFrom,
    remark: `生产报工 ${workshopReport.reportId} 合格 ${qualifiedQty}；机器计数仅作动作证据，不参与产能数量`,
    createdBy: operatorId,
    createdAt: completedAt,
  };
}

function sumProductionDailyProgressQty(workspace, input = {}) {
  const productionTaskId = cleanServerText(input.productionTaskId);
  const orderLineId = cleanServerText(input.orderLineId);
  const excludeReportId = cleanServerText(input.excludeReportId);
  return (workspace.workshopReports ?? []).reduce((total, report) => {
    const reportId = cleanServerText(report?.reportId ?? report?.id);
    if (excludeReportId && reportId === excludeReportId) return total;
    const matchesTask = productionTaskId && cleanServerText(report?.productionTaskId ?? report?.production_task_id) === productionTaskId;
    const matchesLine = orderLineId && cleanServerText(report?.orderLineId ?? report?.order_line_id) === orderLineId;
    const evidence = report?.evidence ?? report?.evidence_json ?? {};
    if (!(matchesTask || matchesLine) || evidence?.reportKind !== "daily_progress") return total;
    return total + Math.max(0, Math.trunc(Number(report.qualifiedQty ?? report.qualified_qty ?? 0)));
  }, 0);
}

function isProductionTaskCompletedStatus(status) {
  const text = cleanServerText(status);
  return text === "已完成" || text.toLowerCase() === "completed" || text.toLowerCase() === "done";
}

function getNextDateText(value) {
  const dateText = normalizeDateInput(value);
  if (!dateText) return "";
  const [year, month, day] = dateText.split("-").map((item) => Number(item));
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return date.toISOString().slice(0, 10);
}

function buildProductionCapacitySizeKey(orderLine, inventoryItem) {
  const sizeText = cleanServerText(
    orderLine?.size ??
      orderLine?.productSize ??
      orderLine?.specSize ??
      orderLine?.standardSize ??
      inventoryItem?.size ??
      inventoryItem?.model,
  );
  return sizeText.replace(/\s+/g, "");
}

async function completePackingTaskRoute({ response, workspace, packingTaskId, body, operatorId }) {
  const beforeTask = findPackingTask(workspace, packingTaskId);
  if (!beforeTask) return sendNotFound(response, "PACKING_TASK_NOT_FOUND");
  if (body.packingTaskId && body.packingTaskId !== packingTaskId) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "packingTaskId in path and body must match");
  }
  const orderLineId = body.orderLineId ?? beforeTask.orderLineId ?? beforeTask.lineId;
  const beforeOrderLine = findOrderLine(workspace, orderLineId);
  if (!beforeOrderLine) return sendNotFound(response, "ORDER_LINE_NOT_FOUND");
  const fulfillment = findFulfillmentByOrderLineId(workspace, orderLineId);
  const actualPackedQty = Math.trunc(Number(body.actualPackedQty ?? beforeTask.plannedQty ?? beforeOrderLine.qty ?? 0));
  if (!Number.isFinite(actualPackedQty) || actualPackedQty <= 0) {
    return sendBusinessError(response, 422, "VALIDATION_ERROR", "actualPackedQty must be greater than 0.");
  }
  const completedAt = body.completedAt ?? new Date().toISOString();
  const packageRecords = buildPackageRecordsForPacking(workspace, {
    body,
    packingTaskId,
    orderLineId,
    fulfillmentId: fulfillment?.id ?? fulfillment?.fulfillmentId ?? "",
    actualPackedQty,
    operatorId,
    createdAt: completedAt,
  });
  const nextStatus = getPackingCompletionStatus({
    fulfillment,
    orderLine: beforeOrderLine,
    labelsPrinted: body.labelsPrinted === true,
  });
  const afterPackingTask = {
    ...beforeTask,
    packingTaskId,
    orderLineId,
    plannedQty: Number(beforeTask.plannedQty ?? beforeTask.qty ?? actualPackedQty),
    actualPackedQty,
    status: "已完成",
    createdBy: resolvePersistableCreatedBy(workspace, beforeTask.createdBy, operatorId),
  };
  const afterOrderLine = {
    ...beforeOrderLine,
    orderLineId: beforeOrderLine.orderLineId ?? beforeOrderLine.id,
    lineStatus: nextStatus.orderLineStatus,
    status: nextStatus.orderLineStatus,
    exceptionTags: beforeOrderLine.exceptionTags ?? beforeOrderLine.exceptions ?? [],
  };
  const afterFulfillment = fulfillment
    ? {
        ...fulfillment,
        fulfillmentId: fulfillment.id ?? fulfillment.fulfillmentId,
        orderLineId,
        expectedQty: Number(fulfillment.expectedQty ?? fulfillment.qty ?? actualPackedQty),
        actualQty: actualPackedQty,
        status: nextStatus.fulfillmentStatus,
        confirmedBy: operatorId,
      }
    : null;
  const inventoryTrace = buildPackingInventoryTrace(workspace, {
    orderLineId,
    inventoryItemId: body.inventoryItemId,
    packingTaskId,
    actualPackedQty,
    operatorId,
    completedAt,
  });
  const operationLog = buildOperationLog(workspace, {
    targetType: "packing_task",
    targetId: packingTaskId,
    action: "complete_packing_task",
    operatorId,
    before: beforeTask,
    after: {
      packingTask: afterPackingTask,
      packageIds: packageRecords.map((record) => record.packageId),
      fulfillment: afterFulfillment,
      inventoryDeducted: false,
    },
    reason: body.remark ?? "打包完成",
  });
  const transaction = await workspace.productionPackingTransactionRepository.completePackingTask({
    workspace,
    packingTask: afterPackingTask,
    packages: packageRecords,
    fulfillment: afterFulfillment,
    orderLine: afterOrderLine,
    inventoryLedgerEntries: inventoryTrace.inventoryLedgerEntries,
    operationLog,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: { ...body, operatorId },
  });

  return sendJson(response, 200, {
    packingTaskId,
    orderLineId,
    status: transaction.packingTask.status,
    actualPackedQty: transaction.packingTask.actualPackedQty,
    packageIds: transaction.packages.map((record) => record.packageId),
    fulfillmentId: transaction.fulfillment?.fulfillmentId ?? afterFulfillment?.fulfillmentId ?? "",
    fulfillmentStatus: transaction.fulfillment?.status ?? afterFulfillment?.status ?? "",
    orderLineStatus: transaction.orderLine?.lineStatus ?? afterOrderLine.status,
    inventoryDeducted: false,
    inventoryLedgerIds: transaction.inventoryLedgerEntries.map((entry) => entry.ledgerId),
    operationLogId: transaction.operationLogId,
  });
}

async function previewStatementRoute({ response, workspace, statementId, body }) {
  const statement = findStatement(workspace, statementId);
  if (!statement) return sendNotFound(response, "STATEMENT_NOT_FOUND");
  const previewType = body.previewType === "internal_archive" ? "internal_archive" : "customer_send";
  const templateId = getStatementExcelTemplateId(previewType);
  const lines = buildStatementPreviewLines(workspace, statement);
  const summary = {
    receivable: Number(statement.receivable ?? 0),
    received: Number(statement.received ?? 0),
    variance: Number(statement.variance ?? Math.max(0, Number(statement.receivable ?? 0) - Number(statement.received ?? 0))),
    lineCount: lines.length,
  };
  const downloadToken = nextPlainId(
    "DL",
    `${statementId}-${previewType}-${workspace.operationLogs.length + workspace.statementExportFiles.length + 1}`,
  );
  const operationLog = buildOperationLog(workspace, {
    targetType: "statement",
    targetId: statementId,
    action: "preview_statement",
    operatorId: body.operatorId ?? "U-OFFICE-A",
    after: {
      previewType,
      templateId,
      templateVersion: STATEMENT_EXCEL_TEMPLATE_VERSION,
      lineCount: lines.length,
      downloadToken,
    },
  });
  const exportFile = await storeStatementExportFile(
    workspace,
    buildStatementExportFile(workspace, statement, {
      previewType,
      summary,
      lines,
      downloadToken,
      operationLogId: operationLog.id,
      createdBy: body.operatorId ?? "U-OFFICE-A",
      templateId,
    }),
  );
  const transaction = await workspace.statementExportRepository.createExportFile({
    workspace,
    exportFile,
    statementLines: lines,
    operationLog,
  });

  return sendJson(response, 200, {
    statementId,
    previewType,
    templateId,
    templateVersion: STATEMENT_EXCEL_TEMPLATE_VERSION,
    summary,
    lines,
    downloadToken: transaction.exportFile.downloadToken,
    operationLogId: transaction.operationLogId,
  });
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

async function markStatementSentRoute({ response, workspace, statementId, body }) {
  const before = findStatement(workspace, statementId);
  if (!before) return sendNotFound(response, "STATEMENT_NOT_FOUND");
  const latestCustomerExport =
    await workspace.statementExportRepository.findLatestExportFile({
      workspace,
      statementId,
      previewType: "customer_send",
    }) ?? null;
  const sendRecord = {
    sendRecordId: nextId("SEND", workspace.statementSendRecords),
    statementId,
    channel: body.channel ?? "wechat",
    sentTo: body.sentTo ?? "",
    exportFileId: body.exportFileId ?? latestCustomerExport?.downloadToken ?? "",
    includePaymentQr: Boolean(body.includePaymentQr ?? false),
    sentBy: body.operatorId ?? "U-OFFICE-A",
    sentAt: body.sentAt ?? new Date().toISOString(),
    remark: body.remark ?? "",
  };
  const nextStatements = markStatementSent(workspace.statements, statementId, {
    sendRecordId: sendRecord.sendRecordId,
    channel: body.channel ?? "wechat",
    sentTo: sendRecord.sentTo,
    sentAt: sendRecord.sentAt,
    operatorName: body.operatorName ?? body.operatorId ?? "U-OFFICE-A",
    remark: sendRecord.remark,
    exportRecord: latestCustomerExport ? toStatementExportSummary(latestCustomerExport) : null,
  });
  const after = nextStatements.find((item) => item.id === statementId);
  const operationLog = buildOperationLog(workspace, {
    targetType: "statement",
    targetId: statementId,
    action: "mark_statement_sent",
    operatorId: body.operatorId ?? "U-OFFICE-A",
    before,
    after,
    reason: sendRecord.remark,
  });
  const transaction = await workspace.statementSendTransactionRepository.markStatementSent({
    workspace,
    statements: nextStatements,
    statement: after,
    sendRecord,
    operationLog,
  });
  return sendJson(response, 200, {
    statementId,
    status: mapStatementApiStatus(transaction.statement.status),
    sendRecordId: transaction.sendRecord.sendRecordId,
    operationLogId: transaction.operationLogId,
  });
}

async function markStatementSendReceiptRoute({ response, workspace, statementId, body }) {
  const statement = findStatement(workspace, statementId);
  if (!statement) return sendNotFound(response, "STATEMENT_NOT_FOUND");
  const requestedSendRecordId = String(body.sendRecordId ?? "").trim();
  const before =
    (workspace.statementSendRecords ?? []).find((record) => record.sendRecordId === requestedSendRecordId) ??
    (workspace.statementSendRecords ?? []).find((record) => record.statementId === statementId) ??
    null;
  if (!before) return sendBusinessError(response, 409, "STATEMENT_SEND_RECORD_NOT_FOUND", "当前对账单还没有可登记回执的发送记录。");

  const receiptStatus = normalizeStatementSendReceiptStatus(body.receiptStatus ?? "read");
  const receiptAt = body.receiptAt ?? new Date().toISOString();
  const receiptBy = body.operatorId ?? "U-OFFICE-A";
  const receiptNote = body.remark ?? "";
  const after = {
    ...before,
    receiptStatus,
    receiptAt,
    receiptBy,
    receiptNote,
  };
  const operationLog = buildOperationLog(workspace, {
    targetType: "statement_send_record",
    targetId: before.sendRecordId,
    action: "mark_statement_send_receipt",
    operatorId: receiptBy,
    before,
    after,
    reason: receiptNote,
  });
  const transaction = await workspace.statementSendTransactionRepository.markStatementSendReceipt({
    workspace,
    sendRecord: after,
    operationLog,
  });
  return sendJson(response, 200, {
    statementId,
    status: mapStatementApiStatus(statement.status),
    sendRecordId: transaction.sendRecord.sendRecordId,
    receiptStatus: transaction.sendRecord.receiptStatus,
    receiptAt: transaction.sendRecord.receiptAt,
    operationLogId: transaction.operationLogId,
  });
}

function normalizeStatementSendReceiptStatus(value) {
  const status = String(value ?? "").trim();
  if (["delivered", "read", "confirmed", "no_response"].includes(status)) return status;
  return "read";
}

async function recordStatementCustomerConfirmationRoute({ response, workspace, statementId, body }) {
  const beforeStatement = findStatement(workspace, statementId);
  if (!beforeStatement) return sendNotFound(response, "STATEMENT_NOT_FOUND");
  const requestedSendRecordId = String(body.sendRecordId ?? "").trim();
  const beforeSendRecord =
    (workspace.statementSendRecords ?? []).find((record) => record.sendRecordId === requestedSendRecordId) ??
    (workspace.statementSendRecords ?? []).find((record) => record.statementId === statementId) ??
    null;
  if (!beforeSendRecord) {
    return sendBusinessError(response, 409, "STATEMENT_SEND_RECORD_NOT_FOUND", "当前对账单还没有可登记客户确认的发送记录。");
  }

  const confirmedAt = body.confirmedAt ?? new Date().toISOString();
  const recordedBy = body.operatorId ?? "U-OFFICE-A";
  const confirmationContent =
    String(body.content ?? "").trim() || String(body.remark ?? "").trim() || "客户回复确认无误";
  const attachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.map((attachmentId) => String(attachmentId ?? "").trim()).filter(Boolean)
    : [];
  const confirmationRecord = {
    confirmationRecordId: nextId("SCONF", workspace.statementConfirmationRecords ?? []),
    statementId,
    sendRecordId: beforeSendRecord.sendRecordId,
    confirmationType: body.confirmationType ?? "customer_reply",
    channel: body.channel ?? beforeSendRecord.channel ?? "wechat",
    confirmedByCustomer: body.confirmedByCustomer ?? body.confirmedBy ?? beforeSendRecord.sentTo ?? "",
    confirmedAt,
    content: confirmationContent,
    attachmentIds,
    recordedBy,
  };
  const afterSendRecord = {
    ...beforeSendRecord,
    receiptStatus: "confirmed",
    receiptAt: confirmedAt,
    receiptBy: recordedBy,
    receiptNote: confirmationContent,
  };
  const nextStatements = recordStatementCustomerConfirmation(workspace.statements, statementId, {
    confirmationRecordId: confirmationRecord.confirmationRecordId,
    channel: confirmationRecord.channel,
    confirmedByCustomer: confirmationRecord.confirmedByCustomer,
    confirmedAt,
    content: confirmationContent,
    attachmentIds,
    operatorName: body.operatorName ?? recordedBy,
  });
  const afterStatement = nextStatements.find((item) => item.id === statementId);
  const operationLog = buildOperationLog(workspace, {
    targetType: "statement",
    targetId: statementId,
    action: "record_statement_customer_confirmation",
    operatorId: recordedBy,
    before: { statement: beforeStatement, sendRecord: beforeSendRecord },
    after: { statement: afterStatement, sendRecord: afterSendRecord, confirmationRecord },
    reason: confirmationContent,
  });
  const transaction = await workspace.statementSendTransactionRepository.recordStatementCustomerConfirmation({
    workspace,
    statements: nextStatements,
    statement: afterStatement,
    sendRecord: afterSendRecord,
    confirmationRecord,
    operationLog,
  });
  return sendJson(response, 200, {
    statementId,
    status: mapStatementApiStatus(transaction.statement.status),
    sendRecordId: transaction.sendRecord.sendRecordId,
    receiptStatus: transaction.sendRecord.receiptStatus,
    confirmationRecord: transaction.confirmationRecord,
    confirmationRecordId: transaction.confirmationRecord.confirmationRecordId,
    operationLogId: transaction.operationLogId,
  });
}

async function recordStatementPaymentRoute({ response, workspace, statementId, body }) {
  const statement = findStatement(workspace, statementId);
  if (!statement) return sendNotFound(response, "STATEMENT_NOT_FOUND");
  const result = confirmStatementPayment(workspace.statements, statement, { amount: body.amount, reason: body.remark ?? body.method });
  const nextStatement = result.statements.find((item) => item.id === statementId);
  const todo = result.todoInput ? buildTodo(workspace, result.todoInput) : null;
  const paymentRecord = {
    paymentRecordId: nextId("PAY", workspace.paymentRecords),
    bizNo: nextId("PAY", workspace.paymentRecords),
    statementId,
    customerId: statement.customerId,
    amount: Number(body.amount ?? 0),
    paidAt: body.paidAt ?? new Date().toISOString(),
    method: body.method ?? "other",
    status: "recorded",
    attachmentIds: body.attachmentIds ?? [],
    operatorId: body.operatorId ?? "U-OFFICE-A",
    remark: body.remark ?? "",
  };
  const operationLog = buildOperationLog(workspace, {
    targetType: "statement",
    targetId: statementId,
    action: "record_statement_payment",
    operatorId: body.operatorId ?? "U-OFFICE-A",
    before: statement,
    after: nextStatement,
  });
  const transaction = await workspace.statementPaymentTransactionRepository.recordStatementPayment({
    workspace,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: body,
    statements: result.statements,
    statement: nextStatement,
    paymentRecord,
    todo,
    operationLog,
  });
  return sendJson(response, 200, {
    payment: transaction.payment,
    statementStatus: mapStatementApiStatus(nextStatement.status),
    varianceAmount: nextStatement.variance,
    todoId: transaction.todo?.id ?? todo?.id,
    operationLogId: transaction.operationLogId,
  });
}

async function handleStatementVarianceRoute({ response, workspace, statementId, body }) {
  const statement = findStatement(workspace, statementId);
  if (!statement) return sendNotFound(response, "STATEMENT_NOT_FOUND");
  const reason = mapVarianceHandlingResult(body.handlingResult, body.reason);
  const varianceAmount = Number(body.varianceAmount ?? statement.variance ?? Math.max(0, statement.receivable - statement.received));
  const hasOpenVarianceTodo = workspace.todos.some((todo) => todo.ref === statementId && todo.type === "收款差额待确认" && !todo.handled);
  const result = confirmStatementVariance(workspace.statements, statement, varianceAmount, { reason }, hasOpenVarianceTodo);
  const nextStatement = result.statements.find((item) => item.id === statementId);
  const todo = result.todoInput ? buildTodo(workspace, result.todoInput) : null;
  const varianceRecord = {
    varianceRecordId: nextId("VAR", workspace.varianceRecords),
    statementId,
    paymentRecordId: body.paymentRecordId ?? "",
    amount: varianceAmount,
    handlingResult: body.handlingResult ?? reason,
    reason,
    status: "recorded",
    attachmentId: Array.isArray(body.attachmentIds) ? body.attachmentIds[0] ?? "" : "",
    operatorId: body.operatorId ?? "U-OFFICE-A",
  };
  const operationLog = buildOperationLog(workspace, {
    targetType: "statement",
    targetId: statementId,
    action: "handle_statement_variance",
    operatorId: body.operatorId ?? "U-OFFICE-A",
    before: statement,
    after: nextStatement,
    reason,
  });
  const transaction = await workspace.statementSettlementTransactionRepository.handleStatementVariance({
    workspace,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: body,
    statements: result.statements,
    statement: nextStatement,
    varianceRecord,
    todo,
    operationLog,
  });
  return sendJson(response, 200, {
    varianceRecord: transaction.varianceRecord,
    statementStatus: mapStatementApiStatus(nextStatement.status),
    debtAmount: nextStatement.status.includes("欠款") ? varianceAmount : 0,
    todoId: transaction.todo?.id ?? todo?.id,
    operationLogId: transaction.operationLogId,
  });
}

async function writeOffStatementRoute({ response, workspace, statementId, body }) {
  const statement = findStatement(workspace, statementId);
  if (!statement) return sendNotFound(response, "STATEMENT_NOT_FOUND");
  const blockingAmount = Number(statement.variance ?? Math.max(0, statement.receivable - statement.received));
  const blocker = getStatementWriteOffBlocker(statement, blockingAmount);
  if (blocker) return sendBusinessError(response, 409, "STATEMENT_WRITE_OFF_BLOCKED", blocker);
  const result = confirmStatementWriteOff(workspace.statements, statement, blockingAmount);
  const nextStatement = result.statements.find((item) => item.id === statementId);
  const operationLog = buildOperationLog(workspace, {
    targetType: "statement",
    targetId: statementId,
    action: "write_off_statement",
    operatorId: body.operatorId ?? "U-OFFICE-A",
    before: statement,
    after: nextStatement,
    reason: body.confirmReason,
  });
  const transaction = await workspace.statementSettlementTransactionRepository.writeOffStatement({
    workspace,
    idempotencyKey: body.idempotencyKey,
    idempotencyPayload: body,
    statements: result.statements,
    statement: nextStatement,
    operationLog,
  });
  const variance = Number(nextStatement.variance ?? Math.max(0, nextStatement.receivable - nextStatement.received));
  return sendJson(response, 200, {
    statementId,
    status: mapStatementApiStatus(nextStatement.status),
    receivable: Number(nextStatement.receivable ?? 0),
    received: Number(nextStatement.received ?? 0),
    variance,
    debtAmount: nextStatement.status.includes("欠款") ? variance : 0,
    operationLogId: transaction.operationLogId,
  });
}

async function createAttachmentRoute({ response, workspace, body }) {
  const result = await createAttachmentRecord({
    workspace,
    body,
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


function normalizeAttachmentText(value) {
  return String(value ?? "").trim();
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
  return sendJson(response, 200, await getAttachmentV1ReadinessResponse({ workspace, operatorId }));
}

async function getAttachmentV1ReadinessResponse({ workspace, operatorId }) {
  const diagnostics = await runAttachmentStorageDiagnostics(workspace.attachmentObjectStorage);
  const localFsAcceptance = getAttachmentLocalFsV1Acceptance(workspace);
  const storageKind = normalizeAttachmentText(diagnostics.storageKind || diagnostics.storageProvider);
  const storageProvider = normalizeAttachmentText(diagnostics.storageProvider || storageKind);
  const isObjectStorage = storageKind === "object_storage" || storageProvider === "object_storage";
  const isLocalFs = storageKind === "local_fs" || storageProvider === "local_fs";
  const productionRetentionAccepted = isObjectStorage || (isLocalFs && localFsAcceptance.accepted);
  const criteria = [
    buildReadinessCriterion({
      key: "attachment-storage-diagnostic-readwrite",
      label: "附件存储读写诊断",
      passed: diagnostics.ready === true,
      detail:
        diagnostics.ready === true
          ? "诊断对象可写、可读且摘要一致"
          : "诊断对象写入、读回或摘要校验未通过",
      blocking: true,
      evidence: {
        status: diagnostics.status,
        writeOk: diagnostics.writeOk,
        readOk: diagnostics.readOk,
        digestOk: diagnostics.digestOk,
      },
    }),
    buildReadinessCriterion({
      key: "attachment-storage-cleanup",
      label: "诊断对象清理",
      passed: diagnostics.cleanupOk === true,
      detail: diagnostics.cleanupOk === true ? "诊断对象已清理" : "诊断对象未确认清理成功",
      blocking: true,
      evidence: {
        cleanupOk: diagnostics.cleanupOk,
      },
    }),
    buildReadinessCriterion({
      key: "attachment-storage-config-complete",
      label: "存储配置完整性",
      passed: diagnostics.configured === true && !diagnostics.missingConfigFields?.length,
      detail:
        diagnostics.configured === true && !diagnostics.missingConfigFields?.length
          ? "当前存储配置字段完整"
          : `缺少配置字段：${(diagnostics.missingConfigFields ?? []).join(" / ") || "未知"}`,
      blocking: true,
      evidence: {
        configured: diagnostics.configured,
        missingConfigFields: diagnostics.missingConfigFields ?? [],
      },
    }),
    buildReadinessCriterion({
      key: "attachment-production-retention-mode",
      label: "生产留档存储模式",
      passed: productionRetentionAccepted,
      detail: productionRetentionAccepted
        ? isObjectStorage
          ? "当前使用对象存储，可作为 V1 生产附件留档模式"
          : `本地文件存储已被显式批准用于 V1 留档：${localFsAcceptance.reference || "未填写引用"}`
        : "当前仍是本地文件存储；V1 默认要求真实 OSS/S3/COS 或明确批准本地留档方案",
      blocking: true,
      evidence: {
        storageKind,
        storageProvider,
        objectStorageLive: isObjectStorage,
        localFsAcceptedForV1: localFsAcceptance.accepted,
        acceptanceReference: localFsAcceptance.reference,
      },
    }),
    buildReadinessCriterion({
      key: "attachment-storage-redaction",
      label: "密钥脱敏护栏",
      passed: diagnostics.secretFieldsExposed !== true,
      detail: diagnostics.secretFieldsExposed === true ? "诊断输出疑似暴露密钥字段" : "诊断输出未暴露密钥字段",
      blocking: true,
      evidence: {
        secretFieldsExposed: diagnostics.secretFieldsExposed === true,
      },
    }),
  ];
  const summary = buildReadinessSummary(criteria);
  return {
    status: summary.blockingCount === 0 ? "ready" : "blocked",
    ready: summary.blockingCount === 0,
    checkedAt: diagnostics.checkedAt || new Date().toISOString(),
    operatorId,
    scope: "v1_attachment_storage_readiness",
    summary,
    criteria,
    blockingCriteria: criteria.filter((item) => item.blocking && item.status !== "passed"),
    diagnostics: summarizeAttachmentStorageDiagnosticsForReadiness(diagnostics),
    storageMode: {
      storageKind,
      storageProvider,
      objectStorageLive: isObjectStorage,
      localFsAcceptedForV1: localFsAcceptance.accepted,
      acceptanceReference: localFsAcceptance.reference,
    },
    remainingV1Risks: buildAttachmentV1ReadinessRemainingRisks({
      criteria,
      diagnostics,
      isObjectStorage,
      isLocalFs,
      localFsAcceptance,
    }),
    safeguards: {
      nonMutating: true,
      diagnosticObjectCleanedUp: diagnostics.cleanupOk === true,
      secretFieldsExposed: diagnostics.secretFieldsExposed === true,
      requiresObjectStorageLive: !localFsAcceptance.accepted,
      localStorageAcceptedForV1: localFsAcceptance.accepted,
      payloadExposed: false,
    },
  };
}

async function runAttachmentStorageDiagnostics(attachmentObjectStorage) {
  const checkedAt = new Date().toISOString();
  const storageKind = normalizeAttachmentText(attachmentObjectStorage?.kind);
  const configured = attachmentObjectStorage?.configured === false ? false : true;
  const missingConfigFields = Array.isArray(attachmentObjectStorage?.missingFields)
    ? attachmentObjectStorage.missingFields.map((field) => String(field))
    : [];
  const result = {
    status: configured ? "failed" : "not_configured",
    ready: false,
    checkedAt,
    storageKind,
    storageProvider: normalizeAttachmentText(attachmentObjectStorage?.provider || storageKind),
    configured,
    missingConfigFields,
    diagnosticAttachmentId: "",
    diagnosticStorageKey: "",
    writeOk: false,
    readOk: false,
    digestOk: false,
    cleanupOk: false,
    contentDigest: "",
    expectedDigest: "",
    readDigest: "",
    secretFieldsExposed: false,
  };

  if (!configured) return result;
  if (
    !attachmentObjectStorage ||
    typeof attachmentObjectStorage.putObject !== "function" ||
    typeof attachmentObjectStorage.readObject !== "function"
  ) {
    result.error = {
      code: "ATTACHMENT_STORAGE_DIAGNOSTIC_UNAVAILABLE",
      message: "Attachment object storage adapter is missing required methods.",
    };
    return result;
  }

  const diagnosticAttachmentId = createAttachmentStorageDiagnosticId(checkedAt);
  const diagnosticText = `ERP attachment storage diagnostic ${diagnosticAttachmentId} ${checkedAt}`;
  const contentPayload = {
    contentType: "text/plain",
    buffer: Buffer.from(diagnosticText, "utf8"),
  };
  const expectedDigest = createHash("sha256").update(contentPayload.buffer).digest("hex");
  result.diagnosticAttachmentId = diagnosticAttachmentId;
  result.expectedDigest = expectedDigest;

  let storedContent = null;
  try {
    storedContent = await attachmentObjectStorage.putObject({
      attachmentId: diagnosticAttachmentId,
      fileName: "storage-diagnostics.txt",
      contentPayload,
    });
    result.storageProvider = normalizeAttachmentText(storedContent?.storageProvider || result.storageProvider);
    result.diagnosticStorageKey = normalizeAttachmentText(storedContent?.storageKey);
    result.contentDigest = normalizeAttachmentText(storedContent?.contentDigest);
    result.writeOk = Boolean(result.storageProvider && result.diagnosticStorageKey && result.contentDigest);

    const readContent = await attachmentObjectStorage.readObject({
      attachment: {
        attachmentId: diagnosticAttachmentId,
        storageProvider: storedContent?.storageProvider,
        storageKey: storedContent?.storageKey,
        mimeType: contentPayload.contentType,
      },
    });
    if (Buffer.isBuffer(readContent?.buffer)) {
      result.readDigest = createHash("sha256").update(readContent.buffer).digest("hex");
      result.readOk = readContent.buffer.toString("utf8") === diagnosticText;
      result.digestOk = result.contentDigest === expectedDigest && result.readDigest === expectedDigest;
    }
  } catch (error) {
    result.error = toAttachmentStorageDiagnosticError(error);
  } finally {
    if (storedContent?.storageKey && typeof attachmentObjectStorage.deleteObject === "function") {
      try {
        await attachmentObjectStorage.deleteObject({ storageKey: storedContent.storageKey });
        result.cleanupOk = true;
      } catch (error) {
        result.cleanupOk = false;
        result.cleanupError = toAttachmentStorageDiagnosticError(error);
      }
    }
  }

  result.ready = result.writeOk && result.readOk && result.digestOk;
  if (result.ready && result.cleanupOk) {
    result.status = "ok";
  } else if (result.ready) {
    result.status = "degraded";
  } else {
    result.status = "failed";
  }
  return result;
}

function summarizeAttachmentStorageDiagnosticsForReadiness(diagnostics = {}) {
  return {
    status: normalizeAttachmentText(diagnostics.status),
    ready: diagnostics.ready === true,
    checkedAt: normalizeAttachmentText(diagnostics.checkedAt),
    storageKind: normalizeAttachmentText(diagnostics.storageKind),
    storageProvider: normalizeAttachmentText(diagnostics.storageProvider),
    configured: diagnostics.configured === true,
    missingConfigFields: Array.isArray(diagnostics.missingConfigFields)
      ? diagnostics.missingConfigFields.map((item) => normalizeAttachmentText(item)).filter(Boolean)
      : [],
    writeOk: diagnostics.writeOk === true,
    readOk: diagnostics.readOk === true,
    digestOk: diagnostics.digestOk === true,
    cleanupOk: diagnostics.cleanupOk === true,
    secretFieldsExposed: diagnostics.secretFieldsExposed === true,
  };
}

function buildAttachmentV1ReadinessRemainingRisks({
  criteria,
  diagnostics,
  isObjectStorage,
  isLocalFs,
  localFsAcceptance,
}) {
  const risks = [];
  for (const item of criteria) {
    if (item.blocking && item.status !== "passed") risks.push(`${item.label}：${item.detail}`);
  }
  if (!isObjectStorage && !localFsAcceptance.accepted) {
    risks.push("真实 OSS/S3/COS bucket live 尚未作为附件生产留档模式验证通过");
  }
  if (isLocalFs && localFsAcceptance.accepted) {
    risks.push("本地文件存储已被显式批准用于 V1；仍需现场确认备份、磁盘容量、访问权限和运维巡检");
  }
  if (diagnostics.cleanupOk !== true) risks.push("诊断对象清理未通过，需检查存储删除权限或生命周期策略");
  if (diagnostics.secretFieldsExposed === true) risks.push("附件存储诊断输出疑似暴露密钥字段");
  return [...new Set(risks)].filter(Boolean);
}

function getAttachmentLocalFsV1Acceptance(workspace) {
  const options = workspace.attachmentV1ReadinessOptions ?? {};
  const accepted = parseBooleanConfig(
    options.localFsAccepted ?? process.env.ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTED,
  );
  const reference = normalizeAttachmentText(
    options.acceptanceReference ??
      options.localFsAcceptanceReference ??
      process.env.ERP_ATTACHMENT_LOCAL_FS_V1_ACCEPTANCE_REF,
  );
  return {
    accepted,
    reference,
  };
}

async function getStatementExportStorageDiagnosticsRoute({ response, workspace }) {
  return sendJson(response, 200, await runStatementExportStorageDiagnostics(workspace.statementExportObjectStorage));
}

async function getStatementExportV1ReadinessRoute({ response, workspace, operatorId }) {
  return sendJson(response, 200, await getStatementExportV1ReadinessResponse({ workspace, operatorId }));
}

async function getStatementExportV1ReadinessResponse({ workspace, operatorId }) {
  const diagnostics = await runStatementExportStorageDiagnostics(workspace.statementExportObjectStorage);
  const localFsAcceptance = getStatementExportLocalFsV1Acceptance(workspace);
  const storageKind = normalizeAttachmentText(diagnostics.storageKind || diagnostics.storageProvider);
  const storageProvider = normalizeAttachmentText(diagnostics.storageProvider || storageKind);
  const isObjectStorage = storageKind === "object_storage" || storageProvider === "object_storage";
  const isLocalFs = storageKind === "local_fs" || storageProvider === "local_fs";
  const productionRetentionAccepted = isObjectStorage || (isLocalFs && localFsAcceptance.accepted);
  const criteria = [
    buildReadinessCriterion({
      key: "statement-export-storage-diagnostic-readwrite",
      label: "对账导出存储读写诊断",
      passed: diagnostics.ready === true,
      detail:
        diagnostics.ready === true
          ? "诊断导出文件可写、可读且摘要一致"
          : "诊断导出文件写入、读回或摘要校验未通过",
      blocking: true,
      evidence: {
        status: diagnostics.status,
        writeOk: diagnostics.writeOk,
        readOk: diagnostics.readOk,
        digestOk: diagnostics.digestOk,
      },
    }),
    buildReadinessCriterion({
      key: "statement-export-storage-cleanup",
      label: "对账导出诊断文件清理",
      passed: diagnostics.cleanupOk === true,
      detail: diagnostics.cleanupOk === true ? "诊断导出文件已清理" : "诊断导出文件未确认清理成功",
      blocking: true,
      evidence: {
        cleanupOk: diagnostics.cleanupOk,
      },
    }),
    buildReadinessCriterion({
      key: "statement-export-storage-config-complete",
      label: "对账导出存储配置完整性",
      passed: diagnostics.configured === true && !diagnostics.missingConfigFields?.length,
      detail:
        diagnostics.configured === true && !diagnostics.missingConfigFields?.length
          ? "当前对账导出存储配置字段完整"
          : `缺少配置字段：${(diagnostics.missingConfigFields ?? []).join(" / ") || "未知"}`,
      blocking: true,
      evidence: {
        configured: diagnostics.configured,
        missingConfigFields: diagnostics.missingConfigFields ?? [],
      },
    }),
    buildReadinessCriterion({
      key: "statement-export-production-retention-mode",
      label: "对账导出生产留档模式",
      passed: productionRetentionAccepted,
      detail: productionRetentionAccepted
        ? isObjectStorage
          ? "当前使用对象存储，可作为 V1 生产对账导出留档模式"
          : `本地文件存储已被显式批准用于 V1 对账导出留档：${localFsAcceptance.reference || "未填写引用"}`
        : "当前仍是本地文件存储；V1 默认要求真实 OSS/S3/COS 或明确批准本地对账导出留档方案",
      blocking: true,
      evidence: {
        storageKind,
        storageProvider,
        objectStorageLive: isObjectStorage,
        localFsAcceptedForV1: localFsAcceptance.accepted,
        acceptanceReference: localFsAcceptance.reference,
      },
    }),
    buildReadinessCriterion({
      key: "statement-export-storage-redaction",
      label: "对账导出密钥脱敏护栏",
      passed: diagnostics.secretFieldsExposed !== true,
      detail: diagnostics.secretFieldsExposed === true ? "诊断输出疑似暴露密钥字段" : "诊断输出未暴露密钥字段",
      blocking: true,
      evidence: {
        secretFieldsExposed: diagnostics.secretFieldsExposed === true,
      },
    }),
  ];
  const summary = buildReadinessSummary(criteria);
  return {
    status: summary.blockingCount === 0 ? "ready" : "blocked",
    ready: summary.blockingCount === 0,
    checkedAt: diagnostics.checkedAt || new Date().toISOString(),
    operatorId,
    scope: "v1_statement_export_storage_readiness",
    summary,
    criteria,
    blockingCriteria: criteria.filter((item) => item.blocking && item.status !== "passed"),
    diagnostics: summarizeStatementExportStorageDiagnosticsForReadiness(diagnostics),
    storageMode: {
      storageKind,
      storageProvider,
      objectStorageLive: isObjectStorage,
      localFsAcceptedForV1: localFsAcceptance.accepted,
      acceptanceReference: localFsAcceptance.reference,
    },
    remainingV1Risks: buildStatementExportV1ReadinessRemainingRisks({
      criteria,
      diagnostics,
      isObjectStorage,
      isLocalFs,
      localFsAcceptance,
    }),
    safeguards: {
      nonMutating: true,
      diagnosticObjectCleanedUp: diagnostics.cleanupOk === true,
      secretFieldsExposed: diagnostics.secretFieldsExposed === true,
      requiresObjectStorageLive: !localFsAcceptance.accepted,
      localStorageAcceptedForV1: localFsAcceptance.accepted,
      payloadExposed: false,
    },
  };
}

async function runStatementExportStorageDiagnostics(statementExportObjectStorage) {
  const checkedAt = new Date().toISOString();
  const storageKind = normalizeAttachmentText(statementExportObjectStorage?.kind);
  const configured = statementExportObjectStorage?.configured === false ? false : true;
  const missingConfigFields = Array.isArray(statementExportObjectStorage?.missingFields)
    ? statementExportObjectStorage.missingFields.map((field) => String(field))
    : [];
  const result = {
    status: configured ? "failed" : "not_configured",
    ready: false,
    checkedAt,
    storageKind,
    storageProvider: normalizeAttachmentText(statementExportObjectStorage?.provider || storageKind),
    configured,
    missingConfigFields,
    diagnosticExportFileId: "",
    diagnosticStorageKey: "",
    writeOk: false,
    readOk: false,
    digestOk: false,
    cleanupOk: false,
    contentDigest: "",
    expectedDigest: "",
    readDigest: "",
    secretFieldsExposed: false,
  };

  if (!configured) return result;
  if (
    !statementExportObjectStorage ||
    typeof statementExportObjectStorage.putExportFile !== "function" ||
    typeof statementExportObjectStorage.readExportFile !== "function"
  ) {
    result.error = {
      code: "STATEMENT_EXPORT_STORAGE_DIAGNOSTIC_UNAVAILABLE",
      message: "Statement export object storage adapter is missing required methods.",
    };
    return result;
  }

  const diagnosticExportFileId = createStatementExportStorageDiagnosticId(checkedAt);
  const diagnosticText = `ERP statement export storage diagnostic ${diagnosticExportFileId} ${checkedAt}`;
  const contentBuffer = Buffer.from(diagnosticText, "utf8");
  const expectedDigest = createHash("sha256").update(contentBuffer).digest("hex");
  const diagnosticExportFile = {
    exportFileId: diagnosticExportFileId,
    statementId: "ST-STORAGE-DIAGNOSTIC",
    previewType: "storage_diagnostic",
    downloadToken: diagnosticExportFileId,
    fileName: "statement-export-storage-diagnostics.xlsx",
    contentType: STATEMENT_EXCEL_CONTENT_TYPE,
    content: contentBuffer.toString("base64"),
    contentEncoding: "base64",
  };
  result.diagnosticExportFileId = diagnosticExportFileId;
  result.expectedDigest = expectedDigest;

  let storedContent = null;
  try {
    storedContent = await statementExportObjectStorage.putExportFile({ exportFile: diagnosticExportFile });
    result.storageProvider = normalizeAttachmentText(storedContent?.storageProvider || result.storageProvider);
    result.diagnosticStorageKey = normalizeAttachmentText(storedContent?.storageKey);
    result.contentDigest = normalizeAttachmentText(storedContent?.contentDigest);
    result.writeOk = Boolean(result.storageProvider && result.diagnosticStorageKey && result.contentDigest);

    const readContent = await statementExportObjectStorage.readExportFile({
      exportFile: {
        ...diagnosticExportFile,
        storageProvider: storedContent?.storageProvider,
        storageKey: storedContent?.storageKey,
        contentDigest: storedContent?.contentDigest,
      },
    });
    if (Buffer.isBuffer(readContent?.buffer)) {
      result.readDigest = createHash("sha256").update(readContent.buffer).digest("hex");
      result.readOk = readContent.buffer.toString("utf8") === diagnosticText;
      result.digestOk =
        normalizeStatementExportDigestHex(result.contentDigest) === expectedDigest && result.readDigest === expectedDigest;
    }
  } catch (error) {
    result.error = toStatementExportStorageDiagnosticError(error);
  } finally {
    if (storedContent?.storageKey && typeof statementExportObjectStorage.deleteExportFile === "function") {
      try {
        await statementExportObjectStorage.deleteExportFile({ storageKey: storedContent.storageKey });
        result.cleanupOk = true;
      } catch (error) {
        result.cleanupOk = false;
        result.cleanupError = toStatementExportStorageDiagnosticError(error);
      }
    }
  }

  result.ready = result.writeOk && result.readOk && result.digestOk;
  if (result.ready && result.cleanupOk) {
    result.status = "ok";
  } else if (result.ready) {
    result.status = "degraded";
  } else {
    result.status = "failed";
  }
  return result;
}

function summarizeStatementExportStorageDiagnosticsForReadiness(diagnostics = {}) {
  return {
    status: normalizeAttachmentText(diagnostics.status),
    ready: diagnostics.ready === true,
    checkedAt: normalizeAttachmentText(diagnostics.checkedAt),
    storageKind: normalizeAttachmentText(diagnostics.storageKind),
    storageProvider: normalizeAttachmentText(diagnostics.storageProvider),
    configured: diagnostics.configured === true,
    missingConfigFields: Array.isArray(diagnostics.missingConfigFields)
      ? diagnostics.missingConfigFields.map((item) => normalizeAttachmentText(item)).filter(Boolean)
      : [],
    writeOk: diagnostics.writeOk === true,
    readOk: diagnostics.readOk === true,
    digestOk: diagnostics.digestOk === true,
    cleanupOk: diagnostics.cleanupOk === true,
    secretFieldsExposed: diagnostics.secretFieldsExposed === true,
  };
}

function buildStatementExportV1ReadinessRemainingRisks({
  criteria,
  diagnostics,
  isObjectStorage,
  isLocalFs,
  localFsAcceptance,
}) {
  const risks = [];
  for (const item of criteria) {
    if (item.blocking && item.status !== "passed") risks.push(`${item.label}：${item.detail}`);
  }
  if (!isObjectStorage && !localFsAcceptance.accepted) {
    risks.push("真实 OSS/S3/COS bucket live 尚未作为对账导出生产留档模式验证通过");
  }
  if (isLocalFs && localFsAcceptance.accepted) {
    risks.push("对账导出本地文件存储已被显式批准用于 V1；仍需现场确认备份、磁盘容量、访问权限和运维巡检");
  }
  if (diagnostics.cleanupOk !== true) risks.push("对账导出诊断文件清理未通过，需检查存储删除权限或生命周期策略");
  if (diagnostics.secretFieldsExposed === true) risks.push("对账导出存储诊断输出疑似暴露密钥字段");
  return [...new Set(risks)].filter(Boolean);
}

function getStatementExportLocalFsV1Acceptance(workspace) {
  const options = workspace.statementExportV1ReadinessOptions ?? {};
  const accepted = parseBooleanConfig(
    options.localFsAccepted ?? process.env.ERP_STATEMENT_EXPORT_LOCAL_FS_V1_ACCEPTED,
  );
  const reference = normalizeAttachmentText(
    options.acceptanceReference ??
      options.localFsAcceptanceReference ??
      process.env.ERP_STATEMENT_EXPORT_LOCAL_FS_V1_ACCEPTANCE_REF,
  );
  return {
    accepted,
    reference,
  };
}

function createStatementExportStorageDiagnosticId(checkedAt) {
  const timestamp = checkedAt.replace(/\D/g, "").slice(0, 14);
  const suffix = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
  return `DL-STMT-STORAGE-CHECK-${timestamp}-${suffix}`;
}

function normalizeStatementExportDigestHex(value) {
  return normalizeAttachmentText(value).replace(/^sha256:/i, "");
}

function toStatementExportStorageDiagnosticError(error) {
  return {
    code: "STATEMENT_EXPORT_STORAGE_DIAGNOSTIC_FAILED",
    message: sanitizeStatementExportStorageDiagnosticMessage(error?.message),
  };
}

function sanitizeStatementExportStorageDiagnosticMessage(message) {
  const cleaned = normalizeAttachmentText(message || "Statement export storage diagnostic failed.");
  return cleaned
    .replace(/(secretAccessKey|accessKeyId|authorization|x-amz-security-token)([^,;\n]*)/gi, "$1=<redacted>")
    .slice(0, 240);
}

function parseBooleanConfig(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  return ["1", "true", "yes", "y", "accepted", "allow", "allowed"].includes(String(value).trim().toLowerCase());
}

function createAttachmentStorageDiagnosticId(checkedAt) {
  const timestamp = checkedAt.replace(/\D/g, "").slice(0, 14);
  const suffix = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
  return `ATT-STORAGE-CHECK-${timestamp}-${suffix}`;
}

function toAttachmentStorageDiagnosticError(error) {
  return {
    code: "ATTACHMENT_STORAGE_DIAGNOSTIC_FAILED",
    message: sanitizeAttachmentStorageDiagnosticMessage(error?.message),
  };
}

function sanitizeAttachmentStorageDiagnosticMessage(message) {
  const cleaned = normalizeAttachmentText(message || "Attachment storage diagnostic failed.");
  return cleaned
    .replace(/(secretAccessKey|accessKeyId|authorization|x-amz-security-token)([^,;\n]*)/gi, "$1=<redacted>")
    .slice(0, 240);
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

function buildDraftProjection(previous, draft) {
  const timestamp = new Date().toISOString();
  return {
    ...(previous ?? {}),
    ...draft,
    createdAt: previous?.createdAt ?? draft.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

function parseDraftExpectedRevision(value) {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1) return 0;
  return revision;
}

function buildDraftOperationLogId(action, draftId, revision, idempotencyKey = "") {
  const digest = createHash("sha256")
    .update([action, draftId, revision, idempotencyKey].join(":"))
    .digest("hex")
    .slice(0, 20)
    .toUpperCase();
  return `LOG-DRAFT-${digest}`;
}

function normalizeDraftRows(lines, workspace, body) {
  return lines.map((line, index) => {
    const customerId = line.customerId ?? body.customerId ?? "";
    const printFlag = line.printFlag ?? line.print === "是";
    return {
      id: line.draftLineId ?? line.id ?? `DRAFT-LINE-${index + 1}`,
      customerId,
      customer: line.customer ?? findCustomerName(workspace, customerId) ?? "待确认客户",
      product: line.productName ?? line.product ?? "",
      size: line.size ?? "待确认",
      color: line.bagColor ?? line.color ?? "待确认",
      handle: line.handleType ?? line.handle ?? "普通提",
      style: line.style ?? "空白袋",
      print: printFlag ? "是" : "否",
      qty: Number(line.qty ?? 0),
      fulfillment: line.fulfillmentMethod ?? line.fulfillment ?? "待确认",
      latest: line.latestNeededAt ?? line.latest ?? "待确认",
      printColor: line.printColor ?? (printFlag ? "待确认" : "非印刷"),
      printSide: mapPrintSide(line.printSide),
      artworkStatus: line.artworkStatus ?? (printFlag ? "待上传" : "非印刷"),
      handleColor: line.handleColor ?? "",
      note: line.officeNote ?? line.customerNote ?? line.note ?? "",
      source: body.sourceText ?? line.source ?? "",
      inventory: line.inventory ?? "",
      confidence: line.confidence ?? "",
      amount: line.amount ?? 0,
    };
  });
}

function toRecognizedDraftLine(row) {
  return {
    draftLineId: row.id,
    customerId: row.customerId,
    customerName: row.customer,
    productName: row.product,
    orderType: row.print === "是" ? "custom_print" : "stock",
    size: row.size,
    bagColor: row.color,
    handleType: row.handle,
    handleColor: row.handleColor,
    style: row.style,
    qty: row.qty,
    fulfillmentMethod: row.fulfillment,
    latestNeededAt: row.latest,
    printFlag: row.print === "是",
    printColor: row.printColor,
    printSide: mapPrintSide(row.printSide),
    customerNote: row.note,
    officeNote: "",
    recognitionStatus: row.confidence === "high" ? "high_confidence" : row.confidence === "low" ? "low_confidence" : "medium_confidence",
    missingFields: getMissingDraftFields(row),
    recognitionEvidence: { sourceText: row.source },
  };
}

function summarizeDraft(draft) {
  return {
    draftId: draft.id,
    status: draft.status,
    sourceText: draft.sourceText,
    sourceChannel: draft.sourceChannel,
    sourceMessageId: draft.sourceMessageId,
    customerId: draft.customerId,
    customerName: draft.customerName,
    clientRevision: draft.clientRevision,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

function buildDraftRiskHints(lines) {
  return lines.flatMap((line) =>
    getMissingDraftFields(line).map((field) => ({
      riskType: "missing_required_field",
      level: "blocking",
      message: `${line.id} 缺 ${field}`,
      relatedField: field,
      relatedId: line.id,
    })),
  );
}

function getMissingDraftFields(row) {
  const missing = [];
  if (!row.customerId) missing.push("customerId");
  if (!row.size || row.size === "待确认") missing.push("size");
  if (!row.color || row.color === "待确认") missing.push("bagColor");
  if (!row.qty) missing.push("qty");
  return missing;
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
  const createdAt = new Date().toISOString();
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

function buildDeliveryEvidenceRetakeTodo(workspace, fulfillment, reason, operatorId) {
  const orderLineId = fulfillment.lineId ?? fulfillment.orderLineId ?? "";
  const existingTodo = (workspace.todos ?? []).find(
    (todo) => todo.type === "照片待重拍" && !todo.handled && (todo.ref === orderLineId || todo.ref === fulfillment.id),
  );
  const customerName = findCustomerName(workspace, fulfillment.customerId);
  const goods = fulfillment.goods ?? (orderLineId || fulfillment.id);
  return buildTodo(workspace, {
    ...(existingTodo ?? {}),
    type: "照片待重拍",
    customerId: fulfillment.customerId ?? "",
    ref: orderLineId || fulfillment.id,
    summary: `${customerName} ${goods}：${reason}`,
    latest: fulfillment.latest ?? fulfillment.latestNeededAt ?? "待确认",
    urgency: "异常",
    impact: "需司机补拍水印照片或办公室补充说明",
    createdBy: existingTodo?.createdBy ?? operatorId,
  });
}

function buildResolvedDeliveryEvidenceRetakeTodo(workspace, fulfillment, operatorId, handledAt) {
  const orderLineId = fulfillment.lineId ?? fulfillment.orderLineId ?? "";
  const existingTodo = (workspace.todos ?? []).find(
    (todo) => todo.type === "照片待重拍" && !todo.handled && (todo.ref === orderLineId || todo.ref === fulfillment.id),
  );
  if (!existingTodo) return null;
  return {
    ...existingTodo,
    status: "已处理",
    handled: true,
    handledBy: operatorId,
    handledAt,
    handlingResult: "司机已补拍送达水印照片，待办公室复核",
  };
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

const v1PrintReadinessDeviceRequirements = [
  {
    key: "express-ltl-label-printer",
    label: "快递/快运标签机",
    deviceType: "label_printer",
    documentTypes: ["express_ltl_label", "package_label"],
    requiredChecks: ["sample_print", "paper_alignment", "barcode_scan", "driver_callback", "legibility", "void_reprint"],
  },
  {
    key: "dot-matrix-notes-printer",
    label: "针式出库/自提/送货单",
    deviceType: "dot_matrix",
    documentTypes: ["outbound_note", "pickup_note", "delivery_note"],
    requiredChecks: ["sample_print", "paper_alignment", "barcode_scan", "driver_callback", "legibility", "void_reprint"],
  },
];

function getPrintDriverV1ReadinessResponse({ workspace, operatorId }) {
  const checkedAt = new Date().toISOString();
  const configResponse = getPrintDriverConfigurationResponse(workspace);
  const printDriverAdapter = configResponse.printDriverAdapter;
  const spoolDiagnostics = getPrintDriverSpoolDiagnosticsResponse({ workspace, operatorId });
  const cupsDiagnostics = getPrintDriverCupsDiagnosticsResponse({ workspace, operatorId });
  const deviceReadiness = v1PrintReadinessDeviceRequirements.map((requirement) =>
    buildPrintDeviceV1Readiness({ workspace, requirement }),
  );
  const criteria = [
    buildReadinessCriterion({
      key: "print-driver-config",
      label: "系统打印配置",
      passed:
        printDriverAdapter?.realDispatchAvailable === true &&
        printDriverAdapter?.environmentPreflight?.summary?.blockingCount === 0,
      detail:
        printDriverAdapter?.realDispatchAvailable === true
          ? "打印驱动配置允许 command_bridge 真实派发"
          : "系统打印配置仍未达到真实派发条件",
      blocking: true,
    }),
    buildReadinessCriterion({
      key: "spool-status-readback",
      label: "spool 状态回读",
      passed: spoolDiagnostics.ready === true,
      detail: spoolDiagnostics.ready
        ? "诊断 spool 文件可写、pending / completed 可回读且已清理"
        : "spool 状态回读诊断未通过或尚未配置",
      blocking: true,
      evidence: {
        status: spoolDiagnostics.status,
        writeOk: spoolDiagnostics.writeOk,
        pendingPollOk: spoolDiagnostics.pendingPollOk,
        completedPollOk: spoolDiagnostics.completedPollOk,
        cleanupOk: spoolDiagnostics.cleanupOk,
      },
    }),
    buildReadinessCriterion({
      key: "cups-queue-preflight",
      label: "CUPS 队列预检",
      passed: cupsDiagnostics.ready === true,
      detail: cupsDiagnostics.ready
        ? "CUPS 队列状态命令可运行且目标队列命中白名单"
        : "CUPS 队列预检未通过或尚未配置",
      blocking: true,
      evidence: {
        status: cupsDiagnostics.status,
        cupsPrinterConfigured: cupsDiagnostics.cupsPrinterConfigured,
        cupsPrinterAllowed: cupsDiagnostics.cupsPrinterAllowed,
        cupsStatusCommandConfigured: cupsDiagnostics.cupsStatusCommandConfigured,
        cupsStatusCommandRunnable: cupsDiagnostics.cupsStatusCommandRunnable,
      },
    }),
    ...deviceReadiness.flatMap((item) => item.criteria),
  ];
  const summary = buildReadinessSummary(criteria);
  return {
    status: summary.blockingCount === 0 ? "ready" : "blocked",
    ready: summary.blockingCount === 0,
    checkedAt,
    operatorId,
    scope: "v1_print_go_live_readiness",
    summary,
    requiredDocumentTypes: [...new Set(v1PrintReadinessDeviceRequirements.flatMap((item) => item.documentTypes))],
    criteria,
    deviceReadiness,
    printDriverAdapter,
    spoolDiagnostics,
    cupsDiagnostics,
    remainingV1Risks: buildPrintReadinessRemainingRisks({ summary, deviceReadiness, spoolDiagnostics, cupsDiagnostics, printDriverAdapter }),
    safeguards: {
      nonPrinting: true,
      physicalPrinterCalled: false,
      commandValueExposed: false,
      commandArgsExposed: false,
      spoolPathExposed: false,
      payloadExposed: false,
    },
  };
}

function buildPrintDeviceV1Readiness({ workspace, requirement }) {
  const devices = filterPrintDevices(workspace.printDevices, { status: "active" });
  const device =
    devices.find((item) => item.deviceType === requirement.deviceType && supportsAllDocumentTypes(item, requirement.documentTypes)) ??
    null;
  const latestFieldTestRecord = device
    ? filterPrinterDeviceFieldTests(workspace.printerDeviceFieldTests, {
        printDeviceId: device.printDeviceId,
        limit: 1,
      })[0] ?? device.latestFieldTestRecord ?? null
    : null;
  const driverMode = String(device?.settings?.driverMode ?? "").trim() || "preview_only";
  const qaEvaluation = evaluatePrinterDeviceFieldTest({
    record: latestFieldTestRecord,
    requiredChecks: requirement.requiredChecks,
  });
  const criteria = [
    buildReadinessCriterion({
      key: `${requirement.key}-device-configured`,
      label: `${requirement.label}设备资料`,
      passed: Boolean(device),
      detail: device
        ? `已配置 ${device.name}，覆盖 ${requirement.documentTypes.join(" / ")}`
        : `缺少 active ${requirement.deviceType}，需覆盖 ${requirement.documentTypes.join(" / ")}`,
      blocking: true,
      evidence: {
        printDeviceId: device?.printDeviceId ?? "",
        deviceType: device?.deviceType ?? requirement.deviceType,
        documentTypes: requirement.documentTypes,
      },
    }),
    buildReadinessCriterion({
      key: `${requirement.key}-driver-mode`,
      label: `${requirement.label}驱动模式`,
      passed: driverMode === "system_printer",
      detail:
        driverMode === "system_printer"
          ? "设备已设置为 system_printer，可进入真实驱动派发"
          : `设备仍为 ${driverMode}，不会进入真实系统打印`,
      blocking: true,
      evidence: {
        printDeviceId: device?.printDeviceId ?? "",
        driverMode,
      },
    }),
    buildReadinessCriterion({
      key: `${requirement.key}-field-qa`,
      label: `${requirement.label}现场 QA`,
      passed: qaEvaluation.ready,
      detail: qaEvaluation.ready
        ? "最新现场 QA 记录全部关键项通过"
        : qaEvaluation.detail,
      blocking: true,
      evidence: {
        printDeviceId: device?.printDeviceId ?? "",
        latestRecordId: latestFieldTestRecord?.recordId ?? "",
        latestCheckedAt: latestFieldTestRecord?.checkedAt ?? "",
        missingChecks: qaEvaluation.missingChecks,
        failedChecks: qaEvaluation.failedChecks,
        blockedChecks: qaEvaluation.blockedChecks,
        untestedChecks: qaEvaluation.untestedChecks,
      },
    }),
  ];
  return {
    key: requirement.key,
    label: requirement.label,
    ready: criteria.every((item) => item.status === "passed"),
    documentTypes: requirement.documentTypes,
    requiredChecks: requirement.requiredChecks,
    printDevice: summarizePrintDeviceForReadiness(device),
    latestFieldTestRecord: latestFieldTestRecord ?? null,
    latestFieldTestSummary: latestFieldTestRecord?.summary ?? null,
    criteria,
  };
}

function supportsAllDocumentTypes(device, documentTypes) {
  const supported = new Set([...(device?.supportedDocumentTypes ?? []), ...(device?.defaultDocumentTypes ?? [])]);
  return documentTypes.every((documentType) => supported.has(documentType));
}

function evaluatePrinterDeviceFieldTest({ record, requiredChecks }) {
  if (!record) {
    return {
      ready: false,
      detail: "尚未记录现场 QA，无法证明样张、对位、扫码、回写、清晰度、作废重打和证据签认已通过",
      missingChecks: requiredChecks,
      failedChecks: [],
      blockedChecks: [],
      untestedChecks: [],
      missingEvidence: [],
    };
  }
  const byKey = new Map((record.checks ?? []).map((check) => [String(check.key ?? "").trim(), check]));
  const missingChecks = requiredChecks.filter((key) => !byKey.has(key));
  const failedChecks = [];
  const blockedChecks = [];
  const untestedChecks = [];
  for (const key of requiredChecks) {
    const status = String(byKey.get(key)?.status ?? "").trim();
    if (status === "failed") failedChecks.push(key);
    if (status === "blocked") blockedChecks.push(key);
    if (!status || status === "untested") untestedChecks.push(key);
  }
  const evidenceSummary = getPrinterDeviceFieldTestEvidenceSummary(record.evidence ?? record.summary?.evidence);
  const missingEvidence = evidenceSummary.missingKeys ?? [];
  const ready = !missingChecks.length && !failedChecks.length && !blockedChecks.length && !untestedChecks.length && evidenceSummary.complete;
  return {
    ready,
    detail: ready
      ? "最新现场 QA 记录全部关键项通过，且证据摘要完整"
      : `现场 QA 未通过：缺 ${missingChecks.length} 项，失败 ${failedChecks.length} 项，受限 ${blockedChecks.length} 项，未测 ${untestedChecks.length} 项，证据缺 ${missingEvidence.length} 项`,
    missingChecks,
    failedChecks,
    blockedChecks,
    untestedChecks,
    missingEvidence,
  };
}

function summarizePrintDeviceForReadiness(device) {
  if (!device) return null;
  return {
    printDeviceId: device.printDeviceId,
    name: device.name,
    deviceType: device.deviceType,
    status: device.status,
    connectionType: device.connectionType,
    driverName: device.driverName,
    supportedDocumentTypes: device.supportedDocumentTypes ?? [],
    defaultDocumentTypes: device.defaultDocumentTypes ?? [],
    paperWidthMm: device.paperWidthMm,
    paperHeightMm: device.paperHeightMm,
    paperName: device.paperName,
    isContinuous: Boolean(device.isContinuous),
    driverMode: String(device.settings?.driverMode ?? "").trim() || "preview_only",
  };
}

function buildReadinessCriterion({ key, label, passed, detail, blocking, evidence = {} }) {
  return {
    key,
    label,
    status: passed ? "passed" : "pending",
    tone: passed ? "success" : "warning",
    blocking: Boolean(blocking),
    detail,
    evidence,
  };
}

function buildReadinessSummary(criteria) {
  const passedCount = criteria.filter((item) => item.status === "passed").length;
  const blockingCount = criteria.filter((item) => item.blocking && item.status !== "passed").length;
  return {
    label: `${passedCount}/${criteria.length} 通过`,
    passedCount,
    totalCount: criteria.length,
    blockingCount,
    tone: blockingCount ? "danger" : "success",
  };
}

function buildPrintReadinessRemainingRisks({ summary, deviceReadiness, spoolDiagnostics, cupsDiagnostics, printDriverAdapter }) {
  const risks = [];
  if (printDriverAdapter?.realDispatchAvailable !== true) risks.push("系统打印 command_bridge 尚未达到真实派发条件");
  if (spoolDiagnostics.ready !== true) risks.push("spool 状态回读诊断未通过或未配置");
  if (cupsDiagnostics?.ready !== true) risks.push("CUPS 队列预检未通过或未配置");
  for (const item of deviceReadiness) {
    if (!item.printDevice) risks.push(`${item.label}缺少 active 设备资料`);
    if (item.printDevice && item.printDevice.driverMode !== "system_printer") {
      risks.push(`${item.label}仍是 ${item.printDevice.driverMode} 模式，未接真实系统打印`);
    }
    if (!item.latestFieldTestRecord) risks.push(`${item.label}缺少现场 QA 记录`);
    if (item.latestFieldTestRecord && !item.ready) risks.push(`${item.label}现场 QA 仍有未通过项目`);
  }
  if (summary.blockingCount === 0) {
    risks.push("仍需保留现场抽检、纸张耗材更换后复验和异常重打演练");
  }
  return [...new Set(risks)];
}

function buildFulfillmentExceptionRecord(workspace, selected, body, modalType, todo, operatorId) {
  const reasonCode = String(body.reasonCode ?? body.exceptionReasonCode ?? "").trim();
  const reasonText = String(body.reasonText ?? body.reason ?? reasonCode ?? "other").trim() || "other";
  const occurredAt = body.occurredAt ?? body.createdAt ?? new Date().toISOString();
  return {
    exceptionId: nextId("FEX", workspace.fulfillmentExceptions),
    fulfillmentId: selected.id,
    exceptionType: body.exceptionType ?? (modalType === "unable" ? "unable_to_outbound" : "quantity_mismatch"),
    expectedQty: Number(body.expectedQty ?? selected.qty ?? 0),
    actualQty: modalType === "unable" ? 0 : Number(body.actualQty ?? 0),
    reasonCode: reasonCode || reasonText,
    reason: reasonText,
    status: "待办公室处理",
    todoId: todo.id,
    reportedBy: operatorId,
    occurredAt,
    createdAt: body.createdAt ?? occurredAt,
  };
}

function buildFulfillmentInventoryMovements(workspace, fulfillment, input = {}) {
  if (fulfillment.status !== "已交付") {
    return emptyFulfillmentInventoryMovements("not_delivered");
  }
  const orderLineId = fulfillment.orderLineId ?? fulfillment.lineId ?? "";
  const activeReservations = (workspace.inventoryReservations ?? []).filter(
    (reservation) => reservation.orderLineId === orderLineId && isActiveInventoryReservation(reservation),
  );
  if (activeReservations.length === 0) {
    return input.allowUnreservedInventoryDeduction
      ? buildUnreservedLegacyFulfillmentInventoryMovements(workspace, fulfillment, input)
      : emptyFulfillmentInventoryMovements("skipped_no_reservation");
  }

  let remainingActualQty = Math.max(0, Number(input.actualQty ?? fulfillment.actualQty ?? fulfillment.qty ?? 0));
  const inventoryReservations = [];
  const inventoryLedgerEntries = [];
  const inventoryAdjustments = [];
  const projectedOnHandByItem = new Map();
  const sourceType = input.action === "确认已拉走" ? "fulfillment_pickup" : "fulfillment_complete";

  for (const reservation of activeReservations) {
    const reservedQty = Math.max(0, Number(reservation.reservedQty ?? reservation.qty ?? 0));
    if (!reservedQty) continue;
    const deliveredQty = Math.min(remainingActualQty, reservedQty);
    remainingActualQty = Math.max(0, remainingActualQty - deliveredQty);
    inventoryReservations.push({
      ...reservation,
      reservationId: reservation.reservationId ?? reservation.id,
      reservedQty,
      status: "已出库",
    });
    inventoryAdjustments.push({
      inventoryItemId: reservation.inventoryItemId,
      onHandQtyChange: -deliveredQty,
      reservedQtyChange: -reservedQty,
    });
    if (!deliveredQty) continue;

    const inventoryItem = findInventoryItem(workspace, reservation.inventoryItemId);
    const projectedBefore = projectedOnHandByItem.has(reservation.inventoryItemId)
      ? projectedOnHandByItem.get(reservation.inventoryItemId)
      : Number(inventoryItem?.inStock ?? inventoryItem?.onHand ?? 0);
    const projectedAfter = Math.max(0, projectedBefore - deliveredQty);
    projectedOnHandByItem.set(reservation.inventoryItemId, projectedAfter);
    inventoryLedgerEntries.push({
      ledgerId: nextPlainId("LEDGER", `${fulfillment.id}-${reservation.reservationId ?? reservation.id}-OUT`),
      inventoryItemId: reservation.inventoryItemId,
      changeType: "出库扣减",
      qtyBefore: projectedBefore,
      qtyChange: -deliveredQty,
      qtyAfter: projectedAfter,
      sourceType,
      sourceId: fulfillment.id,
      operatorId: input.operatorId ?? "U-OFFICE-A",
      confirmedBy: input.operatorId ?? "U-OFFICE-A",
      reason: "完成出库扣减库存",
      remark: `释放占用 ${reservedQty}`,
    });
  }

  return {
    inventoryReservations,
    inventoryLedgerEntries,
    inventoryAdjustments,
    inventoryDeductionMode: "reservation",
  };
}

function emptyFulfillmentInventoryMovements(inventoryDeductionMode = "none") {
  return {
    inventoryReservations: [],
    inventoryLedgerEntries: [],
    inventoryAdjustments: [],
    inventoryDeductionMode,
  };
}

function buildUnreservedLegacyFulfillmentInventoryMovements(workspace, fulfillment, input = {}) {
  const fulfillmentId = fulfillment.fulfillmentId ?? fulfillment.id;
  const orderLineId = fulfillment.orderLineId ?? fulfillment.lineId ?? "";
  const orderLine = findOrderLine(workspace, orderLineId);
  const actualQty = Math.max(0, Number(input.actualQty ?? fulfillment.actualQty ?? fulfillment.qty ?? 0));
  if (!orderLine) {
    return fulfillmentInventoryMovementError(
      "LEGACY_FULFILLMENT_ORDER_LINE_NOT_FOUND",
      "Cannot deduct unreserved legacy fulfillment because the order line was not found.",
    );
  }
  if (!actualQty) {
    return fulfillmentInventoryMovementError(
      "LEGACY_FULFILLMENT_ACTUAL_QTY_REQUIRED",
      "Cannot deduct unreserved legacy fulfillment without an actual quantity.",
    );
  }
  if (!isLegacyStockDeductionEligible(orderLine)) {
    return fulfillmentInventoryMovementError(
      "LEGACY_FULFILLMENT_NOT_STOCK_LINE",
      "Unreserved legacy deduction is only allowed for stock/common-goods or printed-stock lines.",
    );
  }
  const inventoryItem = findUniqueMatchingInventory(workspace, orderLine);
  if (!inventoryItem) {
    return fulfillmentInventoryMovementError(
      "LEGACY_FULFILLMENT_INVENTORY_NOT_MATCHED",
      "Cannot deduct unreserved legacy fulfillment because no unique inventory item matched the order line.",
    );
  }

  const onHandBefore = Math.max(0, Number(inventoryItem.inStock ?? inventoryItem.onHand ?? 0));
  const reservedBefore = Math.max(0, Number(inventoryItem.reserved ?? 0));
  const lockedBefore = Math.max(0, Number(inventoryItem.locked ?? inventoryItem.waitingPickupLocked ?? 0));
  const shouldReleaseReserved = shouldReleaseLegacyReservedInventory(orderLine, fulfillment);
  const reservedQtyChange = shouldReleaseReserved ? -Math.min(actualQty, reservedBefore) : 0;
  const availableForUnreserved = Math.max(0, onHandBefore - reservedBefore - lockedBefore);
  if (!shouldReleaseReserved && availableForUnreserved < actualQty) {
    return fulfillmentInventoryMovementError(
      "LEGACY_FULFILLMENT_AVAILABLE_INVENTORY_INSUFFICIENT",
      "Cannot deduct unreserved legacy fulfillment because available inventory is insufficient.",
    );
  }
  if (shouldReleaseReserved && onHandBefore < actualQty) {
    return fulfillmentInventoryMovementError(
      "LEGACY_FULFILLMENT_ON_HAND_INVENTORY_INSUFFICIENT",
      "Cannot deduct unreserved legacy fulfillment because on-hand inventory is insufficient.",
    );
  }

  return {
    inventoryReservations: [],
    inventoryAdjustments: [
      {
        inventoryItemId: inventoryItem.id,
        onHandQtyChange: -actualQty,
        reservedQtyChange,
      },
    ],
    inventoryLedgerEntries: [
      {
        ledgerId: nextPlainId("LEDGER", `${fulfillmentId}-LEGACY-OUT`),
        inventoryItemId: inventoryItem.id,
        changeType: "旧单无占用出库扣减",
        qtyBefore: onHandBefore,
        qtyChange: -actualQty,
        qtyAfter: Math.max(0, onHandBefore - actualQty),
        sourceType: input.action === "确认已拉走" ? "fulfillment_pickup_legacy" : "fulfillment_complete_legacy",
        sourceId: fulfillmentId,
        operatorId: input.operatorId ?? "U-OFFICE-A",
        confirmedBy: input.operatorId ?? "U-OFFICE-A",
        reason: "旧单无 reservation，经库存匹配后完成出库扣减",
        remark: shouldReleaseReserved ? `同步释放旧汇总占用 ${Math.abs(reservedQtyChange)}` : "未发现旧汇总占用，仅扣在库",
      },
    ],
    inventoryDeductionMode: shouldReleaseReserved ? "legacy_reserved_stock_match" : "legacy_available_stock_match",
  };
}

function fulfillmentInventoryMovementError(code, message) {
  return {
    ...emptyFulfillmentInventoryMovements("error"),
    error: { code, message },
  };
}

function isLegacyStockDeductionEligible(orderLine) {
  const orderType = String(orderLine.orderType ?? orderLine.order_type ?? "").trim();
  if (orderType.includes("定制") || orderType.includes("外加工")) return false;
  if (orderType.includes("现货") || orderType.includes("通货")) return true;
  const printFlag = String(orderLine.print ?? orderLine.printFlag ?? "").trim();
  return printFlag === "否" || printFlag === "false" || printFlag === "";
}

function shouldReleaseLegacyReservedInventory(orderLine, fulfillment) {
  const values = [
    orderLine.inventory,
    orderLine.inventoryStatus,
    orderLine.status,
    orderLine.lineStatus,
    fulfillment.source,
    fulfillment.status,
  ]
    .map((value) => String(value ?? ""))
    .join(" ");
  return /已占用|待提货锁定|已备货|reserved|locked/i.test(values);
}

function findUniqueMatchingInventory(workspace, line) {
  const matches = (workspace.inventories ?? []).filter(
    (item) =>
      item.size === line.size &&
      item.color === (line.color ?? line.bagColor) &&
      item.handle === (line.handle ?? line.handleType) &&
      item.style === line.style &&
      !String(item.state ?? "").includes("待处理") &&
      !String(item.state ?? "").includes("报废"),
  );
  return matches.length === 1 ? matches[0] : null;
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

function findPackingTask(workspace, id) {
  return (workspace.packingTasks ?? []).find((item) => item.id === id || item.packingTaskId === id);
}

function findFulfillmentByOrderLineId(workspace, orderLineId) {
  return (workspace.fulfillments ?? []).find((item) => (item.orderLineId ?? item.lineId) === orderLineId) ?? null;
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
    createdBy: body.operatorId ?? "U-OFFICE-A",
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

function buildPackageRecordsForPacking(workspace, input) {
  const rawPackages = Array.isArray(input.body.packages) ? input.body.packages : [];
  const requestedPackageCount = input.body.packageCount ?? input.body.packagesCount ?? rawPackages.length;
  const packageCount = Math.max(
    1,
    Math.trunc(Number(requestedPackageCount || 1)),
  );
  const quantities = rawPackages.length
    ? rawPackages.map((item) => Math.max(0, Math.trunc(Number(item.packedQty ?? item.qty ?? 0))))
    : distributeIntegerQty(input.actualPackedQty, packageCount);
  const normalizedQuantities =
    quantities.reduce((sum, qty) => sum + qty, 0) > 0 ? quantities : distributeIntegerQty(input.actualPackedQty, packageCount);
  const recordCount = Math.max(packageCount, normalizedQuantities.length);
  return Array.from({ length: recordCount }, (_, index) => {
    const source = rawPackages[index] ?? {};
    const packageSeq = Math.trunc(Number(source.packageSeq ?? index + 1));
    const packageId = source.packageId ?? nextPlainId("PKG", `${input.packingTaskId}-${packageSeq}`);
    return {
      packageId,
      bizNo: source.bizNo ?? packageId,
      orderLineId: source.orderLineId ?? input.orderLineId,
      fulfillmentId: source.fulfillmentId ?? input.fulfillmentId,
      packageSeq,
      packageCount: recordCount,
      packedQty: Math.max(0, Math.trunc(Number(source.packedQty ?? source.qty ?? normalizedQuantities[index] ?? 0))),
      labelPrintRecordId: source.labelPrintRecordId ?? input.body.labelPrintRecordId ?? "",
      status: source.status ?? (input.body.labelsPrinted === true ? "待提货" : "待打印标签"),
      createdBy: source.createdBy ?? input.operatorId,
      createdAt: source.createdAt ?? input.createdAt,
    };
  });
}

function distributeIntegerQty(totalQty, packageCount) {
  const count = Math.max(1, Math.trunc(Number(packageCount)));
  const total = Math.max(0, Math.trunc(Number(totalQty)));
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function getPackingCompletionStatus({ fulfillment, orderLine, labelsPrinted }) {
  const method = String(
    fulfillment?.method ?? fulfillment?.fulfillmentMethod ?? orderLine?.fulfillmentMethod ?? orderLine?.fulfillment ?? "",
  ).trim();
  if (method === "快递快运" || method === "express_ltl") {
    return labelsPrinted
      ? { orderLineStatus: "待快运拉走", fulfillmentStatus: "待确认拉走" }
      : { orderLineStatus: "待打印标签", fulfillmentStatus: "待打印标签" };
  }
  return { orderLineStatus: "待出库", fulfillmentStatus: "已备货" };
}

function buildPackingInventoryTrace(workspace, input) {
  const activeReservations = (workspace.inventoryReservations ?? []).filter(
    (reservation) => reservation.orderLineId === input.orderLineId && isReleasableInventoryReservation(reservation),
  );
  const reservation = activeReservations[0] ?? null;
  const inventoryItem = input.inventoryItemId
    ? findInventoryItem(workspace, input.inventoryItemId)
    : reservation
      ? findInventoryItem(workspace, reservation.inventoryItemId)
      : null;
  if (!inventoryItem) return { inventoryLedgerEntries: [] };

  const reservedBefore = Number(reservation?.reservedQty ?? reservation?.qty ?? inventoryItem.reserved ?? 0);
  return {
    inventoryLedgerEntries: [
      {
        ledgerId: input.ledgerId ?? nextPlainId("LEDGER", `${input.packingTaskId}-PACK`),
        inventoryItemId: inventoryItem.id,
        changeType: "打包完成确认",
        qtyBefore: reservedBefore,
        qtyChange: 0,
        qtyAfter: reservedBefore,
        sourceType: "packing_complete",
        sourceId: input.packingTaskId,
        operatorId: input.operatorId,
        confirmedBy: input.operatorId,
        occurredAt: input.completedAt,
        createdAt: input.completedAt,
        reason: "打包完成不扣减库存",
        remark: `打包 ${input.actualPackedQty}，仍保留库存占用，出库/拉走确认时再扣减`,
      },
    ],
  };
}

function buildFulfillmentCancelInventoryRelease(workspace, fulfillment, input = {}) {
  const fulfillmentId = fulfillment.fulfillmentId ?? fulfillment.id;
  const orderLineId = fulfillment.orderLineId ?? fulfillment.lineId ?? "";
  const activeReservations = (workspace.inventoryReservations ?? []).filter(
    (reservation) => reservation.orderLineId === orderLineId && isReleasableInventoryReservation(reservation),
  );
  const inventoryReservations = [];
  const inventoryLedgerEntries = [];
  const inventoryAdjustments = [];
  const projectedReservedByItem = new Map();

  for (const reservation of activeReservations) {
    const reservedQty = Math.max(0, Number(reservation.reservedQty ?? reservation.qty ?? 0));
    if (!reservedQty) continue;
    const reservationId = reservation.reservationId ?? reservation.id;
    inventoryReservations.push({
      ...reservation,
      reservationId,
      reservedQty: 0,
      qty: 0,
      status: "已释放",
    });
    inventoryAdjustments.push({
      inventoryItemId: reservation.inventoryItemId,
      reservedQtyChange: -reservedQty,
    });

    const inventoryItem = findInventoryItem(workspace, reservation.inventoryItemId);
    const projectedBefore = projectedReservedByItem.has(reservation.inventoryItemId)
      ? projectedReservedByItem.get(reservation.inventoryItemId)
      : Number(inventoryItem?.reserved ?? 0);
    const projectedAfter = Math.max(0, projectedBefore - reservedQty);
    projectedReservedByItem.set(reservation.inventoryItemId, projectedAfter);
    inventoryLedgerEntries.push({
      ledgerId: nextPlainId("LEDGER", `${fulfillmentId}-${reservationId}-CANCEL`),
      inventoryItemId: reservation.inventoryItemId,
      changeType: "取消出库释放占用",
      qtyBefore: projectedBefore,
      qtyChange: -reservedQty,
      qtyAfter: projectedAfter,
      sourceType: "fulfillment_cancel",
      sourceId: fulfillmentId,
      operatorId: input.operatorId ?? "U-OFFICE-A",
      confirmedBy: input.operatorId ?? "U-OFFICE-A",
      reason: input.reason ?? "取消出库任务释放占用",
      remark: `取消出库任务释放占用 ${reservedQty}`,
    });
  }

  return { inventoryReservations, inventoryLedgerEntries, inventoryAdjustments };
}

function isCancelableFulfillment(fulfillment) {
  const status = String(fulfillment.status ?? "").trim();
  return Boolean(status) && !status.includes("已交付") && !status.includes("已取消");
}

function isActiveInventoryReservation(reservation) {
  const status = String(reservation.status ?? "").trim();
  return status === "生效" || status === "active" || status === "reserved" || status === "部分释放" || status === "partially_released";
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

function mapInventoryReservationReleaseReason(reason) {
  const reasonMap = {
    order_cancelled: "订单取消释放库存",
    qty_changed: "订单改量释放库存",
    customer_rejected: "客户拒绝等待释放库存",
    outbound_completed: "出库完成释放库存",
    manual_release: "人工释放库存占用",
    reservation_correction: "库存占用修正",
  };
  return reasonMap[reason] ?? reasonMap.manual_release;
}

function mapFulfillmentCancelReason(reason, fallback) {
  const reasonMap = {
    customer_cancelled: "客户取消出库",
    outbound_cancelled: "出库任务取消",
    duplicate_fulfillment: "重复出库任务取消",
    stock_recheck_failed: "库存复核后取消出库",
    office_correction: "办公室修正取消出库",
    other: fallback || "其他原因取消出库",
  };
  return reasonMap[reason] ?? fallback ?? reasonMap.office_correction;
}

function isVoidableOrderLine(orderLine, workspace) {
  const status = String(orderLine.status ?? orderLine.lineStatus ?? "").trim();
  if (!status || status.includes("已关闭") || status.includes("已取消") || status.includes("已交付")) return false;
  if (status.includes("丝印") || status.includes("制袋") || status.includes("打包")) return false;
  const fulfillments = (workspace.fulfillments ?? []).filter(
    (fulfillment) => (fulfillment.lineId ?? fulfillment.orderLineId) === (orderLine.id ?? orderLine.orderLineId),
  );
  return !fulfillments.some((fulfillment) => String(fulfillment.status ?? "").includes("已交付"));
}

function isQuantityAdjustableOrderLine(orderLine, workspace) {
  return isVoidableOrderLine(orderLine, workspace);
}

function getOrderLineOriginalQty(orderLine) {
  const qty = Math.trunc(Number(orderLine?.originalQty ?? orderLine?.qty ?? 0));
  return Number.isFinite(qty) ? qty : 0;
}

function buildOrderLineQuantityAdjustmentInventoryChange(workspace, input) {
  const activeReservations = (workspace.inventoryReservations ?? []).filter(
    (reservation) => reservation.orderLineId === input.orderLineId && isReleasableInventoryReservation(reservation),
  );
  if (input.qtyDelta < 0) {
    return buildOrderLineQuantityReductionInventoryChange(workspace, activeReservations, input);
  }
  return buildOrderLineQuantityIncreaseInventoryChange(workspace, activeReservations, input);
}

function buildOrderLineQuantityReductionInventoryChange(workspace, activeReservations, input) {
  const inventoryReservations = [];
  const inventoryAdjustments = [];
  const inventoryLedgerEntries = [];
  const projectedReservedByItem = new Map();
  let remainingReleaseQty = Math.abs(input.qtyDelta);

  for (const reservation of activeReservations) {
    if (remainingReleaseQty <= 0) break;
    const reservedQty = Math.max(0, Number(reservation.reservedQty ?? reservation.qty ?? 0));
    if (!reservedQty) continue;
    const releasedQty = Math.min(reservedQty, remainingReleaseQty);
    const remainingReservedQty = Math.max(0, reservedQty - releasedQty);
    const reservationId = reservation.reservationId ?? reservation.id;
    const inventoryItem = findInventoryItem(workspace, reservation.inventoryItemId);
    if (!inventoryItem) {
      return {
        ok: false,
        statusCode: 404,
        code: "INVENTORY_ITEM_NOT_FOUND",
        message: `Inventory item ${reservation.inventoryItemId} was not found for quantity adjustment.`,
      };
    }

    inventoryReservations.push({
      ...reservation,
      reservationId,
      reservedQty: remainingReservedQty,
      qty: remainingReservedQty,
      status: remainingReservedQty > 0 ? "生效" : "已释放",
    });
    inventoryAdjustments.push({
      inventoryItemId: reservation.inventoryItemId,
      reservedQtyChange: -releasedQty,
    });

    const projectedBefore = projectedReservedByItem.has(reservation.inventoryItemId)
      ? projectedReservedByItem.get(reservation.inventoryItemId)
      : Number(inventoryItem.reserved ?? 0);
    const projectedAfter = Math.max(0, projectedBefore - releasedQty);
    projectedReservedByItem.set(reservation.inventoryItemId, projectedAfter);
    inventoryLedgerEntries.push({
      ledgerId: nextPlainId(
        "LEDGER",
        `${input.orderLineId}-${reservationId}-QTY-${input.newQty}-${inventoryLedgerEntries.length + 1}`,
      ),
      inventoryItemId: reservation.inventoryItemId,
      changeType: "订单改量释放占用",
      qtyBefore: projectedBefore,
      qtyChange: -releasedQty,
      qtyAfter: projectedAfter,
      sourceType: "order_line_quantity_adjustment",
      sourceId: input.orderLineId,
      operatorId: input.operatorId,
      confirmedBy: input.operatorId,
      reason: input.reason,
      remark: `订单改量 ${input.previousQty} -> ${input.newQty}，释放占用 ${releasedQty}`,
    });
    remainingReleaseQty -= releasedQty;
  }

  return {
    ok: true,
    inventoryReservations,
    inventoryAdjustments,
    inventoryLedgerEntries,
  };
}

function buildOrderLineQuantityIncreaseInventoryChange(workspace, activeReservations, input) {
  const increaseQty = input.qtyDelta;
  const reservation = activeReservations[0];
  if (!reservation) {
    return {
      ok: false,
      statusCode: 409,
      code: "ORDER_LINE_RESERVATION_REQUIRED_FOR_QUANTITY_INCREASE",
      message: "Quantity increase requires an active inventory reservation to extend.",
    };
  }
  const inventoryItem = findInventoryItem(workspace, reservation.inventoryItemId);
  if (!inventoryItem) {
    return {
      ok: false,
      statusCode: 404,
      code: "INVENTORY_ITEM_NOT_FOUND",
      message: `Inventory item ${reservation.inventoryItemId} was not found for quantity adjustment.`,
    };
  }
  const currentAvailableQty = toInventoryQuantitySnapshot(inventoryItem).available;
  if (currentAvailableQty < increaseQty) {
    return {
      ok: false,
      statusCode: 409,
      code: "AVAILABLE_QTY_NOT_ENOUGH",
      message: `Only ${currentAvailableQty} units are available; ${increaseQty} more units are required.`,
    };
  }

  const reservationId = reservation.reservationId ?? reservation.id;
  const reservedBefore = Math.max(0, Number(reservation.reservedQty ?? reservation.qty ?? 0));
  const reservedAfter = reservedBefore + increaseQty;
  const itemReservedBefore = Number(inventoryItem.reserved ?? 0);
  const itemReservedAfter = itemReservedBefore + increaseQty;
  return {
    ok: true,
    inventoryReservations: [
      {
        ...reservation,
        reservationId,
        reservedQty: reservedAfter,
        qty: reservedAfter,
        status: "生效",
      },
    ],
    inventoryAdjustments: [
      {
        inventoryItemId: reservation.inventoryItemId,
        reservedQtyChange: increaseQty,
      },
    ],
    inventoryLedgerEntries: [
      {
        ledgerId: nextPlainId("LEDGER", `${input.orderLineId}-${reservationId}-QTY-${input.newQty}`),
        inventoryItemId: reservation.inventoryItemId,
        changeType: "订单改量补占用",
        qtyBefore: itemReservedBefore,
        qtyChange: increaseQty,
        qtyAfter: itemReservedAfter,
        sourceType: "order_line_quantity_adjustment",
        sourceId: input.orderLineId,
        operatorId: input.operatorId,
        confirmedBy: input.operatorId,
        reason: input.reason,
        remark: `订单改量 ${input.previousQty} -> ${input.newQty}，补占用 ${increaseQty}`,
      },
    ],
  };
}

function buildOrderLineVoidInventoryRelease(workspace, input) {
  const activeReservations = (workspace.inventoryReservations ?? []).filter(
    (reservation) => reservation.orderLineId === input.orderLineId && isReleasableInventoryReservation(reservation),
  );
  const inventoryReservations = [];
  const inventoryAdjustments = [];
  const inventoryLedgerEntries = [];
  const projectedReservedByItem = new Map();

  for (const reservation of activeReservations) {
    const reservedQty = Math.max(0, Number(reservation.reservedQty ?? reservation.qty ?? 0));
    if (!reservedQty) continue;
    const reservationId = reservation.reservationId ?? reservation.id;
    inventoryReservations.push({
      ...reservation,
      reservationId,
      reservedQty: 0,
      qty: 0,
      status: "已释放",
    });
    inventoryAdjustments.push({
      inventoryItemId: reservation.inventoryItemId,
      reservedQtyChange: -reservedQty,
    });

    const inventoryItem = findInventoryItem(workspace, reservation.inventoryItemId);
    const projectedBefore = projectedReservedByItem.has(reservation.inventoryItemId)
      ? projectedReservedByItem.get(reservation.inventoryItemId)
      : Number(inventoryItem?.reserved ?? 0);
    const projectedAfter = Math.max(0, projectedBefore - reservedQty);
    projectedReservedByItem.set(reservation.inventoryItemId, projectedAfter);
    inventoryLedgerEntries.push({
      ledgerId: nextPlainId("LEDGER", `${input.orderLineId}-${reservationId}-VOID`),
      inventoryItemId: reservation.inventoryItemId,
      changeType: "释放占用",
      qtyBefore: projectedBefore,
      qtyChange: -reservedQty,
      qtyAfter: projectedAfter,
      sourceType: "order_line_void",
      sourceId: input.orderLineId,
      operatorId: input.operatorId,
      confirmedBy: input.operatorId,
      reason: input.reason,
      remark: `订单作废释放占用 ${reservedQty}`,
    });
  }

  return { inventoryReservations, inventoryAdjustments, inventoryLedgerEntries };
}

function mapOrderLineVoidReason(reason, fallback) {
  const reasonMap = {
    order_cancelled: "客户取消订单",
    duplicate_order: "重复订单作废",
    recognition_error: "识别错误作废",
    stock_not_available: "库存不足取消",
    management_rejected: "管理拒绝接单",
    qty_changed: "订单改量作废重建",
    customer_rejected: "客户拒绝等待取消",
    other: fallback || "其他原因作废",
  };
  return reasonMap[reason] ?? fallback ?? reasonMap.order_cancelled;
}

function mapOrderLineQuantityAdjustmentReason(reason, fallback) {
  const reasonMap = {
    customer_change: "客户改量",
    recognition_error: "识别数量修正",
    stock_recheck: "库存复核后改量",
    office_correction: "办公室修正数量",
    management_approved: "管理批准改量",
    other: fallback || "其他原因改量",
  };
  return reasonMap[reason] ?? fallback ?? reasonMap.customer_change;
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

function appendUniqueText(values, value) {
  const list = Array.isArray(values) ? values.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
  if (!list.includes(value)) list.push(value);
  return list;
}

function buildOrderConfirmationInventoryReservations(workspace, checkedRows, orderLines, operatorId) {
  return checkedRows
    .map((row, index) => {
      if (row.inventory !== "可用") return null;
      const inventoryItem = findMatchingInventory(workspace, row);
      const orderLine = orderLines[index];
      if (!inventoryItem || !orderLine) return null;
      return {
        reservationId: nextPlainId("RSV", orderLine.id),
        orderLineId: orderLine.id,
        inventoryItemId: inventoryItem.id,
        reservedQty: Number(row.qty ?? 0),
        reservationType: mapFulfillmentMethod(row.fulfillment) === "pickup" ? "待提货锁定" : "出库占用",
        status: "生效",
        createdBy: operatorId,
      };
    })
    .filter(Boolean);
}

function buildOrderConfirmationInventoryLedgerEntries(workspace, reservations, operatorId) {
  return reservations.map((reservation) => {
    const inventoryItem = findInventoryItem(workspace, reservation.inventoryItemId);
    const qtyBefore = Number(inventoryItem?.reserved ?? 0);
    const qtyChange = Number(reservation.reservedQty ?? 0);
    return {
      ledgerId: nextPlainId("LEDGER", reservation.reservationId),
      inventoryItemId: reservation.inventoryItemId,
      changeType: "订单占用",
      qtyBefore,
      qtyChange,
      qtyAfter: qtyBefore + qtyChange,
      sourceType: "order_confirm",
      sourceId: reservation.orderLineId,
      operatorId,
      confirmedBy: operatorId,
      reason: "订单确认占用库存",
      remark: reservation.reservationType,
    };
  });
}

function buildOrderConfirmationTodos(workspace, todoInputs, operatorId) {
  const todos = [];
  for (const todoInput of todoInputs) {
    todos.push(
      buildTodo(
        { ...workspace, todos: [...(workspace.todos ?? []), ...todos] },
        {
          ...todoInput,
          createdBy: operatorId,
        },
      ),
    );
  }
  return todos;
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

function buildConfirmedOrderRecord(workspace, draftId, result, body) {
  const customerId = result.newLines[0]?.customerId ?? body.customerId ?? "";
  return {
    orderId: result.orderNo,
    bizNo: result.orderNo,
    sourceDraftId: draftId,
    draftId,
    customerId,
    customerSnapshot: buildCustomerSnapshot(workspace, customerId),
    sourceText: body.sourceText ?? "",
    summaryStatus: "处理中",
    createdBy: body.operatorId ?? "U-OFFICE-A",
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
