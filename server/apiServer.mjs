import http from "node:http";
import { pathToFileURL } from "node:url";
import { createGracefulShutdownController } from "./gracefulShutdown.mjs";
import { closeSharedPostgresPools } from "./postgresPoolClient.mjs";
import {
  filterByKeyword,
  filterByValue,
  getStatementCustomers,
  loadSeedWorkspace,
  paginate,
} from "./seedData.mjs";
import { tryValidateOpenApi } from "./openapiValidation.mjs";
import { createAttachmentRepository } from "./attachmentRepository.mjs";
import { createAttachmentAccessAuditRepository } from "./attachmentAccessAuditRepository.mjs";
import { createAttachmentObjectStorage } from "./attachmentObjectStorage.mjs";
import { buildSystemV1Readiness } from "./services/systemV1ReadinessService.mjs";
import { buildRuntimeEmployeeAccountReadiness } from "./services/runtimeEmployeeAccountReadiness.mjs";
import {
  buildAttachmentV1Readiness,
  buildStatementExportV1Readiness,
  runAttachmentStorageDiagnostics,
  runStatementExportStorageDiagnostics,
} from "./services/fileRetentionV1ReadinessService.mjs";
import { buildDriverV1Readiness as getDriverV1ReadinessResponse } from "./services/driverV1ReadinessService.mjs";
import { precheckV1DriverReadiness } from "./services/v1DriverLivePrecheckService.mjs";
import { precheckV1RuntimeReadiness } from "./services/v1RuntimeLivePrecheckService.mjs";
import { precheckV1ProductionEnv } from "./services/v1ProductionEnvLivePrecheckService.mjs";
import { precheckV1ProductionEnvFileAudit } from "./services/v1ProductionEnvFileAuditService.mjs";
import { precheckV1ProductionEnvFilePreview } from "./services/v1ProductionEnvFilePreviewService.mjs";
import { runV1ProductionEnvSetup } from "./services/v1ProductionEnvSetupService.mjs";
import { precheckV1ProductionEnvIntake } from "./services/v1ProductionEnvIntakePrecheckService.mjs";
import {
  precheckV1AttachmentRetention,
  precheckV1Persistence,
} from "./services/v1StorageLivePrecheckService.mjs";
import {
  buildEmployeeAssignmentOptions,
  listMasterDataEmployeeAccountReviews,
} from "./services/masterDataEmployeeAccountCommandService.mjs";
import { listMasterDataMachines } from "./services/masterDataMachineCommandService.mjs";
import { buildSystemHealthResponse } from "./services/systemHealthProjectionService.mjs";
import {
  buildFirstReleaseBlockedResponse,
  evaluateFirstReleaseWrite,
  resolveFirstReleaseScope,
} from "./services/firstReleaseScopeService.mjs";
import { hydratePersistentWorkspaceState } from "./services/persistentWorkspaceHydrationService.mjs";
import {
  getRequestAuthContext,
  getRequestHeaderValue,
  getRequestPermissionContext,
} from "./services/requestAuthContextService.mjs";
import { writeActionPermissions } from "./writeActionPermissions.mjs";
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
import { createCoreWorkspaceReadRepository } from "./coreWorkspaceReadRepository.mjs";
import { createOrderDraftRepository } from "./orderDraftRepository.mjs";
import { createOrderConfirmationTransactionRepository } from "./orderConfirmationTransactionRepository.mjs";
import { createOrderPoolReadRepository } from "./orderPoolReadRepository.mjs";
import { createDriverDeliveryDispatchRepository } from "./driverDeliveryDispatchRepository.mjs";
import { createDriverDeviceFieldTestRepository } from "./driverDeviceFieldTestRepository.mjs";
import { createDriverDeliveryTaskReadRepository } from "./driverDeliveryTaskReadRepository.mjs";
import { createInventoryLedgerReadRepository } from "./inventoryLedgerReadRepository.mjs";
import { createInventoryReservationReleaseTransactionRepository } from "./inventoryReservationReleaseTransactionRepository.mjs";
import { createInventoryIntentTransactionRepository } from "./inventoryIntentTransactionRepository.mjs";
import { createOrderLineVoidTransactionRepository } from "./orderLineVoidTransactionRepository.mjs";
import { createOrderLineQuantityAdjustmentTransactionRepository } from "./orderLineQuantityAdjustmentTransactionRepository.mjs";
import { createProductionPackingReadRepository } from "./productionPackingReadRepository.mjs";
import { createProductionScheduleRecordRepository } from "./productionScheduleRecordRepository.mjs";
import { createPrintBatchRepository } from "./printBatchRepository.mjs";
import { createPrintDeviceRepository } from "./printDeviceRepository.mjs";
import { createPrintDriverAdapter } from "./printDriverAdapter.mjs";
import { createPrintJobRepository } from "./printJobRepository.mjs";
import { createPrinterDeviceFieldTestRepository } from "./printerDeviceFieldTestRepository.mjs";
import { createMasterDataImportReviewRepository } from "./masterDataImportReviewRepository.mjs";
import { createMasterDataImportTransactionRepository } from "./masterDataImportTransactionRepository.mjs";
import { createMasterDataMachineConfigurationRepository } from "./masterDataMachineConfigurationRepository.mjs";
import { createRepositories } from "./createRepositories.mjs";
import { createRawMaterialSupplierStatementReviewRepository } from "./rawMaterialSupplierStatementReviewRepository.mjs";
import { createRawMaterialPurchaseRepository } from "./rawMaterialPurchaseRepository.mjs";
import { createMaintenanceTaskRepository } from "./maintenanceTaskRepository.mjs";
import { createAttendancePayrollRepository } from "./attendancePayrollRepository.mjs";
import { createConfiguredAttendanceProvider } from "./attendanceProvider.mjs";
import { createRuntimeIdentityRepository } from "./runtimeIdentityRepository.mjs";
import { createBusinessDecisionEvidenceRepository } from "./businessDecisionEvidenceRepository.mjs";
import { createBusinessDecisionAuthorizationRepository } from "./businessDecisionAuthorizationRepository.mjs";
import { createBusinessDecisionEvidenceDraftRepository } from "./businessDecisionEvidenceDraftRepository.mjs";
import {
  applyV1PersistenceProfileOptions,
  assertV1ProductionPersistenceRuntime,
  v1PersistencePostgresRepositoryOptionKeys,
} from "./v1PersistenceProfile.mjs";
import {
  applyRuntimeConfigOptions,
  buildRuntimeConfigSummary,
  parseRuntimeModeArg,
  resolveRuntimeConfig,
} from "./runtimeConfig.mjs";
import { loadV1ProductionEnvFilesIntoProcess } from "./productionEnvFileLoader.mjs";
import { assertProductionBootAllowed } from "./productionBootGuard.mjs";
import { assertStagingTestCredentials, getSeedUsers } from "./authSeed.mjs";
import { readJsonRequestBody } from "./httpJsonBody.mjs";
import {
  isProductionBusinessWritePath,
  readHttpIdempotencyKey,
  requireHttpIdempotencyKey,
} from "./idempotency.mjs";
import {
  buildApiSecurityPolicy,
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
import { handleRawMaterialPurchaseReadRoutes } from "./routes/rawMaterialPurchaseReadRoutes.mjs";
import { handleRawMaterialPurchaseWriteRoutes } from "./routes/rawMaterialPurchaseWriteRoutes.mjs";
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
import { handleBusinessDecisionReadRoutes } from "./routes/businessDecisionReadRoutes.mjs";
import { handleBusinessDecisionAuthorizationWriteRoutes } from "./routes/businessDecisionAuthorizationWriteRoutes.mjs";
import { handleBusinessDecisionEvidenceDraftRoutes } from "./routes/businessDecisionEvidenceDraftRoutes.mjs";
import { handleBusinessDecisionWriteRoutes } from "./routes/businessDecisionWriteRoutes.mjs";
import {
  handleMaintenanceTaskReadRoutes,
  handleMaintenanceTaskWriteRoutes,
} from "./routes/maintenanceTaskRoutes.mjs";
import {
  handleAttendancePayrollReadRoutes,
  handleAttendancePayrollWriteRoutes,
} from "./routes/attendancePayrollRoutes.mjs";
import { apiSharedServiceRegistry } from "./apiSharedServiceRegistry.mjs";
import { releaseIdentityFromEnvironment } from "../shared/releaseIdentity.js";

export function createApiServer(options = {}) {
  const productionEnvFileApplication =
    options.productionEnvFileApplication ??
    (options.applyProductionEnvFile === false
      ? loadV1ProductionEnvFilesIntoProcess({ env: {}, targetEnv: {}, throwOnBlocked: false })
      : loadV1ProductionEnvFilesIntoProcess());
  const runtimeConfig = resolveRuntimeConfig(options);
  assertProductionBootAllowed({ options, runtimeConfig });
  assertStagingTestCredentials();
  const runtimeOptions = applyRuntimeConfigOptions(options, runtimeConfig);
  const v1PersistenceProfile = applyV1PersistenceProfileOptions(runtimeOptions);
  const effectiveOptions = v1PersistenceProfile.options;
  const securityPolicy = buildApiSecurityPolicy(effectiveOptions);
  const firstReleaseScope = resolveFirstReleaseScope(effectiveOptions);
  const scenarioId = options.scenarioId ?? process.env.ERP_SCENARIO_ID;
  const workspace = loadSeedWorkspace({
    scenarioId,
    source: options.seedSource ?? process.env.ERP_OFFICE_SEED_SOURCE,
    realSampleSeedFile: options.realSampleSeedFile ?? process.env.ERP_REAL_SAMPLE_SEED_FILE,
    runtimeMode: runtimeConfig.mode,
  });
  workspace.statements = (Array.isArray(workspace.statements) ? workspace.statements : []).map((statement) => ({
    ...statement,
    revision: Math.max(1, Number(statement.revision ?? 1) || 1),
  }));
  workspace.securityPolicy = securityPolicy;
  workspace.firstReleaseScope = firstReleaseScope;
  workspace.phoneVerificationSender = effectiveOptions.phoneVerificationSender;
  if (
    securityPolicy.phoneRegistrationEnabled === true &&
    typeof workspace.phoneVerificationSender !== "function"
  ) {
    throw new Error(
      "ERP_PHONE_REGISTRATION_ENABLED requires a configured phoneVerificationSender.",
    );
  }
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
  const repositories = createRepositories(effectiveOptions);
  const { fulfillmentActionTransactionRepository, productionPackingTransactionRepository } = repositories;
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
  const masterDataMachineConfigurationRepository =
    effectiveOptions.masterDataMachineConfigurationRepository ??
    createMasterDataMachineConfigurationRepository(effectiveOptions.masterDataMachineConfigurationRepositoryOptions);
  const { rawMaterialInboundRepository } = repositories;
  const rawMaterialSupplierStatementReviewRepository =
    effectiveOptions.rawMaterialSupplierStatementReviewRepository ??
    createRawMaterialSupplierStatementReviewRepository(
      effectiveOptions.rawMaterialSupplierStatementReviewRepositoryOptions,
    );
  const rawMaterialPurchaseRepository =
    effectiveOptions.rawMaterialPurchaseRepository ??
    createRawMaterialPurchaseRepository(effectiveOptions.rawMaterialPurchaseRepositoryOptions);
  const maintenanceTaskRepository =
    effectiveOptions.maintenanceTaskRepository ??
    createMaintenanceTaskRepository(effectiveOptions.maintenanceTaskRepositoryOptions);
  const attendancePayrollRepository =
    effectiveOptions.attendancePayrollRepository ??
    createAttendancePayrollRepository(effectiveOptions.attendancePayrollRepositoryOptions);
  const attendanceProvider =
    effectiveOptions.attendanceProvider ??
    createConfiguredAttendanceProvider(effectiveOptions.attendanceProviderOptions);
  const runtimeIdentityRepository =
    effectiveOptions.runtimeIdentityRepository ??
    createRuntimeIdentityRepository(effectiveOptions.runtimeIdentityRepositoryOptions);
  const businessDecisionEvidenceRepository =
    effectiveOptions.businessDecisionEvidenceRepository ??
    createBusinessDecisionEvidenceRepository(effectiveOptions.businessDecisionEvidenceRepositoryOptions);
  const businessDecisionAuthorizationRepository =
    effectiveOptions.businessDecisionAuthorizationRepository ??
    createBusinessDecisionAuthorizationRepository(effectiveOptions.businessDecisionAuthorizationRepositoryOptions);
  const businessDecisionEvidenceDraftRepository =
    effectiveOptions.businessDecisionEvidenceDraftRepository ??
    createBusinessDecisionEvidenceDraftRepository(effectiveOptions.businessDecisionEvidenceDraftRepositoryOptions);
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
      masterDataMachineConfigurationRepository,
      rawMaterialInboundRepository,
      rawMaterialSupplierStatementReviewRepository,
      rawMaterialPurchaseRepository,
      maintenanceTaskRepository,
      attendancePayrollRepository,
      runtimeIdentityRepository,
      businessDecisionEvidenceRepository,
      businessDecisionAuthorizationRepository,
      businessDecisionEvidenceDraftRepository,
    },
    fileStorages: {
      attachmentObjectStorage,
      statementExportObjectStorage,
    },
  });
  workspace.orderDrafts = workspace.initialOrderDrafts ?? workspace.orderDrafts ?? [];
  workspace.originalOrders = [];
  workspace.operationLogs = [];
  workspace.businessDecisionRecords = [];
  workspace.businessDecisionAuthorizations = [];
  workspace.businessDecisionEvidenceDrafts = [];
  workspace.rawMaterialPurchaseRequests = [];
  workspace.maintenanceTasks = workspace.initialMaintenanceTasks ?? [];
  workspace.attendanceImportBatches = [];
  workspace.attendancePunches = [];
  workspace.attendanceDayReviews = [];
  workspace.payrollPolicyVersions = [];
  workspace.payrollRuns = [];
  workspace.payrollLines = [];
  workspace.payrollLineAdjustments = [];
  workspace.payrollExportEvents = [];
  workspace.fulfillmentQuantityVarianceResolutions = [];
  workspace.statementWriteOffRecords = [];
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
  const initialTaskSeeds = demoWorkspaceSeedService.buildInitialTaskSeeds({ workspace, runtimeConfig });
  workspace.productionTasks = initialTaskSeeds.productionTasks;
  workspace.productionScheduleRecords = [];
  workspace.workshopReports = [];
  workspace.productionExceptions = [];
  workspace.packingTasks = initialTaskSeeds.packingTasks;
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
  workspace.releaseIdentity = releaseIdentityFromEnvironment(process.env);
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
  workspace.masterDataMachineConfigurationRepository = masterDataMachineConfigurationRepository;
  workspace.rawMaterialInboundRepository = rawMaterialInboundRepository;
  workspace.rawMaterialSupplierStatementReviewRepository = rawMaterialSupplierStatementReviewRepository;
  workspace.rawMaterialPurchaseRepository = rawMaterialPurchaseRepository;
  workspace.maintenanceTaskRepository = maintenanceTaskRepository;
  workspace.attendancePayrollRepository = attendancePayrollRepository;
  workspace.attendanceProvider = attendanceProvider;
  workspace.runtimeIdentityRepository = runtimeIdentityRepository;
  workspace.businessDecisionEvidenceRepository = businessDecisionEvidenceRepository;
  workspace.businessDecisionAuthorizationRepository = businessDecisionAuthorizationRepository;
  workspace.businessDecisionEvidenceDraftRepository = businessDecisionEvidenceDraftRepository;
  workspace.printDriverAdapter = printDriverAdapter;
  const workspaceReady = hydratePersistentWorkspaceState({
    workspace,
    seedDemoPrintJobs: demoWorkspaceSeedService.seedPrintJobs,
    seedUsers: getSeedUsers(),
  }).then(() => applyIsolatedE2eIdentityFixtures(workspace, runtimeConfig));
  const openapi = tryValidateOpenApi();

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host ?? "127.0.0.1"}`);
    response.erpSecurityPolicy = securityPolicy;
    response.erpRequestOrigin = getRequestHeaderValue(request, "origin");

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
        const binaryAttachmentBody = url.pathname === "/api/attachments/binary"
          ? readBinaryAttachmentMetadata(url)
          : null;
        const firstReleaseWrite = evaluateFirstReleaseWrite({
          scope: firstReleaseScope,
          method: request.method,
          pathname: url.pathname,
          body: binaryAttachmentBody ?? {},
        });
        if (!firstReleaseWrite.allowed) {
          return sendJson(response, 403, buildFirstReleaseBlockedResponse(firstReleaseScope));
        }
        const body = binaryAttachmentBody ?? await readJsonRequestBody(request, securityPolicy.maxJsonBodyBytes);
        return await routeWrite({ method: request.method, request, url, response, workspace, body, permissionContext, authContext });
      }
      return sendJson(response, 405, {
        code: "METHOD_NOT_ALLOWED",
        message: "The P0 backend skeleton supports GET plus a first batch of in-memory POST/PATCH routes.",
      });
    } catch (error) {
      const statusCode = Number(error.statusCode ?? 500);
      return sendJson(response, statusCode, {
        ...(error.details && typeof error.details === "object" ? error.details : {}),
        ...(error.currentRevision !== undefined ? { currentRevision: error.currentRevision } : {}),
        code: error.code ?? (statusCode === 400 ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR"),
        message: securityPolicy.strictAuth && statusCode >= 500 ? "Internal server error." : error.message,
      });
    }
  });
  server.ready = workspaceReady;
  return server;
}

async function routeGet(context) {
  const { url, response, workspace, openapi, permissionContext, authContext } = context;

  if (url.pathname === "/api/health") {
    return sendJson(response, 200, buildSystemHealthResponse({ workspace, openapi }));
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
      buildSystemV1Readiness,
      v1GoLiveStatusResponseService,
      filterByValue,
    })
  ) {
    return;
  }

  if (
    await handleAuthReadRoutes({
      url,
      response,
      permissionContext,
      authContext,
      runtimeAuthCommandService,
      sendCommandResponse,
    })
  ) return;

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
      sendJson,
      sendNotFound,
      sendBusinessError,
      sendInlineFile,
      paginate,
      attachmentFileAccessService,
      runAttachmentStorageDiagnostics,
      buildAttachmentV1Readiness,
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
      buildProductionMachineQueueResponse: productionMachineQueueReadService.buildMachineQueue,
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
      findInventoryCorrectionDraft,
      inventoryCorrectionReadProjectionService,
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
      paginate,
      fulfillmentReadProjectionService,
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
      statementExportFileService,
      runStatementExportStorageDiagnostics,
      buildStatementExportV1Readiness,
      sendCommandResponse,
      sendFile,
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
      todoReadProjectionService,
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
      findPrintDevice,
      printDriverDiagnosticsService,
    })
  ) {
    return;
  }

  if (await handleRawMaterialPurchaseReadRoutes({ url, response, workspace, sendJson, sendNotFound })) return;

  if (await handleRawMaterialReadRoutes({ url, response, workspace, sendJson, sendNotFound })) return;

  if (
    await handleMaintenanceTaskReadRoutes({
      method: "GET",
      url,
      response,
      workspace,
      permissionContext,
      requireActionPermission,
      sendJson,
    })
  ) return;

  if (
    await handleBusinessDecisionEvidenceDraftRoutes({
      method: "GET",
      url,
      response,
      workspace,
      body: {},
      permissionContext,
      authContext,
      requireActionPermission,
      getPermissionOperatorId,
      businessDecisionEvidenceDraftCommandService,
      sendCommandResponse,
    })
  ) return;

  if (
    await handleBusinessDecisionReadRoutes({
      method: "GET",
      url,
      response,
      workspace,
      permissionContext,
      requireActionPermission,
      businessDecisionReadProjectionService,
      sendJson,
    })
  ) return;

  if (
    await handleAttendancePayrollReadRoutes({
      url,
      response,
      workspace,
      permissionContext,
      authContext,
      writeActionPermissions,
      requireActionPermission,
      attendancePayrollService,
      sendJson,
      sendNotFound,
    })
  ) return;

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
      listMasterDataMachines,
      masterDataImportCommandService,
      phoneIdentityCommandService,
      sendNotFound,
      sendBusinessError,
      sendFile,
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
      sendNotFound,
      getDriverV1ReadinessResponse,
    })
  ) {
    return;
  }

  return sendNotFound(response, "ROUTE_NOT_FOUND");
}

async function routeWrite(context) {
  const { method, request, url, response, workspace, body, permissionContext, authContext } = context;
  normalizeExpectedRevisionAtApiBoundary(body);
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
      runtimeAuthCommandService,
      phoneIdentityCommandService,
      sendCommandResponse,
    })
  ) {
    return;
  }

  if (
    await handleBusinessDecisionEvidenceDraftRoutes({
      method,
      url,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      requireActionPermission,
      getPermissionOperatorId,
      businessDecisionEvidenceDraftCommandService,
      sendCommandResponse,
    })
  ) {
    return;
  }

  if (
    await handleBusinessDecisionWriteRoutes({
      method,
      url,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      requireActionPermission,
      getPermissionOperatorId,
      businessDecisionDirectiveCommandService,
      sendCommandResponse,
    })
  ) {
    return;
  }

  if (
    await handleBusinessDecisionAuthorizationWriteRoutes({
      method,
      url,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      requireActionPermission,
      getPermissionOperatorId,
      businessDecisionAuthorizationCommandService,
      sendCommandResponse,
    })
  ) {
    return;
  }

  if (
    await handleAttachmentWriteRoutes({
      method,
      request,
      url,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      requireAttachmentCreatePermission,
      getPermissionOperatorId,
      attachmentCreateCommandService,
      attachmentFileAccessService,
      sendJson,
      sendBusinessError,
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
      v1FieldEvidenceDraftService,
      v1FieldEvidenceStagingService,
      precheckV1ProductionEnv,
      runV1ProductionEnvSetup,
      v1LocalCommandRunnerService,
      precheckV1ProductionEnvIntake,
      precheckV1ProductionEnvFileAudit,
      precheckV1ProductionEnvFilePreview,
      v1ProductionGoLivePrecheckService,
      v1ProductionPersistenceEvidenceLiveRunService,
      v1ProductionFirstStageExecutionLiveRunService,
      v1ProductionFirstStageValuesDryRunLivePrecheckService,
      v1ProductionEnvValuesApplyService,
      precheckV1Persistence,
      precheckV1AttachmentRetention,
      precheckV1DriverReadiness,
      precheckV1RuntimeReadiness,
      v1V2BoundaryService,
      v1ReleaseCandidateRefreshPrecheckService,
      v1ReleaseCandidateRefreshService,
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
      todoCommandService,
      todoReadProjectionService,
      fulfillmentReadProjectionService,
      sendJson,
      sendNotFound,
      sendBusinessError,
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
      printBatchCommandService,
      printDeviceCommandService,
      printJobLifecycleService,
      sendJson,
      sendCommandRecord,
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
      inventoryCorrectionCommandService,
      inventoryReservationReleaseCommandService,
      inventoryCorrectionReadProjectionService,
      todoReadProjectionService,
      sendCommandResponse,
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
      fulfillmentActionCommandService,
      fulfillmentPrintCommandService,
      sendCommandResponse,
      sendCommandRecord,
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
      statementCommunicationCommandService,
      statementFinancialCommandService,
      sendCommandResponse,
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
      productionSchedulingCommandService,
      productionReportingCommandService,
      productionFinishedGoodsPhotoCommandService,
      packingCommandService,
      productionFinishedGoodsPhotoProjectionService,
      todoReadProjectionService,
      findOrderLine,
      toProductionTaskSummary,
      summarizeOrderLineForChange,
      sendCommandResponse,
      sendJson,
      sendNotFound,
      sendBusinessError,
    })
  ) {
    return;
  }

  if (
    await handleRawMaterialPurchaseWriteRoutes({
      method,
      url,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      writeActionPermissions,
      requireAnyActionPermission,
      getPermissionOperatorId,
      sendJson,
      sendBusinessError,
      rawMaterialPurchaseCommandService,
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
      sendJson,
      sendBusinessError,
      rawMaterialCommandService,
    })
  ) {
    return;
  }

  if (
    await handleMaintenanceTaskWriteRoutes({
      method,
      url,
      response,
      workspace,
      body,
      permissionContext,
      authContext,
      requireActionPermission,
      getPermissionOperatorId,
      maintenanceTaskCommandService,
      sendCommandResponse,
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
      orderDraftCommandService,
      orderLineMutationCommandService,
      sendCommandResponse,
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
      fulfillmentActionCommandService,
      driverDeviceFieldTestCommandService,
      sendCommandResponse,
    })
  ) {
    return;
  }

  if (
    await handleAttendancePayrollWriteRoutes({
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
      attendancePayrollService,
      sendJson,
    })
  ) return;

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
      masterDataImportCommandService,
      masterDataEmployeeAccountCommandService,
      masterDataMachineCommandService,
      phoneIdentityCommandService,
      sendCommandResponse,
    })
  ) {
    return;
  }

  return sendNotFound(response, "ROUTE_NOT_FOUND");
}

function readBinaryAttachmentMetadata(url) {
  const metadataText = url.searchParams.get("metadata") ?? "";
  let metadata = {};
  if (metadataText) {
    try {
      const parsed = JSON.parse(metadataText);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed;
    } catch {
      const error = new Error("附件 metadata 必须是有效 JSON。");
      error.statusCode = 400;
      error.code = "ATTACHMENT_METADATA_INVALID";
      throw error;
    }
  }
  return {
    ownerType: url.searchParams.get("ownerType") ?? "",
    ownerId: url.searchParams.get("ownerId") ?? "",
    fileType: url.searchParams.get("fileType") ?? "",
    purpose: url.searchParams.get("purpose") ?? "",
    fileName: url.searchParams.get("fileName") ?? "",
    contentRef: url.searchParams.get("contentRef") ?? "",
    mimeType: url.searchParams.get("mimeType") ?? "application/octet-stream",
    fileSize: Number(url.searchParams.get("fileSize")),
    remark: url.searchParams.get("remark") ?? "",
    metadata,
  };
}

export function normalizeExpectedRevisionAtApiBoundary(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  if (body.expectedRevision !== undefined && body.expectedRevision !== null && body.expectedRevision !== "") return body;
  const legacyRevision = [body.clientRevision, body.fulfillmentRevision, body.revision]
    .find((value) => value !== undefined && value !== null && value !== "");
  if (legacyRevision !== undefined) body.expectedRevision = legacyRevision;
  return body;
}

function applyIsolatedE2eIdentityFixtures(workspace, runtimeConfig) {
  if (runtimeConfig?.mode !== "test") return;

  const warehouseEmployeeId = String(process.env.ERP_E2E_WAREHOUSE_EMPLOYEE_ID ?? "").trim();
  const fixtureEmployees = warehouseEmployeeId
    ? [{
        id: warehouseEmployeeId,
        bizNo: warehouseEmployeeId,
        name: "E2E 库房实物执行员",
        roleName: "库房",
        profileStatus: "active",
        source: "master_data_import_review",
        sourceType: "master_data_import_review",
      }]
    : [];

  if (String(process.env.ERP_E2E_BUSINESS_DECISION_FIXTURES ?? "") === "true") {
    const managerEmployeeId = "E2E-MANAGER-001";
    const decisionMakerIds = ["E2E-DM-MOTHER", "E2E-DM-AUNT"];
    fixtureEmployees.push(
      {
        id: managerEmployeeId,
        bizNo: managerEmployeeId,
        name: "E2E 管理决定人",
        roleName: "管理",
        profileStatus: "active",
        source: "master_data_import_review",
        sourceType: "master_data_import_review",
      },
      {
        id: decisionMakerIds[0],
        bizNo: decisionMakerIds[0],
        name: "E2E 业务决定人（母亲）",
        roleName: "经营决策",
        profileStatus: "active",
        source: "master_data_import_review",
        sourceType: "master_data_import_review",
      },
      {
        id: decisionMakerIds[1],
        bizNo: decisionMakerIds[1],
        name: "E2E 业务决定人（姨妈）",
        roleName: "经营决策",
        profileStatus: "active",
        source: "master_data_import_review",
        sourceType: "master_data_import_review",
      },
    );

    const usersById = new Map((workspace.users ?? []).map((user) => [String(user.userId ?? user.id), user]));
    for (const user of getSeedUsers()) {
      usersById.set(user.userId, {
        ...(usersById.get(user.userId) ?? {}),
        ...user,
        identityKind: "seed_fixture",
        loginEnabled: true,
        passwordStatus: "active",
        mustChangePassword: false,
        ...(user.userId === "U-MANAGER-A" ? { employeeId: managerEmployeeId } : {}),
      });
    }
    workspace.users = [...usersById.values()];

  }

  const employeesById = new Map((workspace.employees ?? []).map((employee) => [String(employee.id), employee]));
  for (const employee of fixtureEmployees) employeesById.set(employee.id, employee);
  workspace.employees = [...employeesById.values()];
}

const {
  attendancePayrollService,
  attachmentCreateCommandService,
  attachmentFileAccessService,
  businessDecisionAuthorizationCommandService,
  businessDecisionDirectiveCommandService,
  businessDecisionEvidenceDraftCommandService,
  demoWorkspaceSeedService,
  businessDecisionReadProjectionService,
  driverDeviceFieldTestCommandService,
  findInventoryCorrectionDraft,
  findOrderLine,
  findPrintDevice,
  findPrintJob,
  fulfillmentActionCommandService,
  fulfillmentPrintCommandService,
  fulfillmentReadProjectionService,
  getPermissionOperatorId,
  inventoryCorrectionCommandService,
  inventoryCorrectionReadProjectionService,
  inventoryReservationReleaseCommandService,
  maintenanceTaskCommandService,
  masterDataEmployeeAccountCommandService,
  masterDataImportCommandService,
  masterDataMachineCommandService,
  orderDraftCommandService,
  orderLineMutationCommandService,
  packingCommandService,
  phoneIdentityCommandService,
  printBatchCommandService,
  printDeviceCommandService,
  printDriverDiagnosticsService,
  printJobLifecycleService,
  productionFinishedGoodsPhotoCommandService,
  productionFinishedGoodsPhotoProjectionService,
  productionMachineQueueReadService,
  productionReportingCommandService,
  productionSchedulingCommandService,
  rawMaterialCommandService,
  rawMaterialPurchaseCommandService,
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
  summarizeOrderLineForChange,
  toProductionTaskSummary,
  todoCommandService,
  todoReadProjectionService,
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
} = apiSharedServiceRegistry;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const startupArgs = process.argv.slice(2);
    const allowLocalFixture = startupArgs.includes("--local-fixture");
    const runtimeMode = parseRuntimeModeArg(startupArgs.filter((arg) => arg !== "--local-fixture"));
    if (allowLocalFixture && runtimeMode !== "test") {
      throw new Error("--local-fixture is only available with --mode test.");
    }
    const fixtureRepositoryOptions = allowLocalFixture
      ? Object.fromEntries(v1PersistencePostgresRepositoryOptionKeys.map((key) => [key, { mode: "local", allowLocalFixture: true }]))
      : {};
    const server = createApiServer({
      ...(runtimeMode ? { runtimeMode } : {}),
      allowLocalFixture,
      ...(allowLocalFixture ? { v1PersistenceRepositoryMode: "local" } : {}),
      ...fixtureRepositoryOptions,
    });
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
    console.error(`ERP API startup failed (${error?.code || "unknown"}): ${error.message}`);
    process.exitCode = 1;
  }
}
