import { coreWorkspaceCollectionKeys } from "../coreWorkspaceReadRepository.mjs";
import { mergeRuntimeIdentityStateIntoWorkspace } from "../runtimeIdentityRepository.mjs";
import { ensurePublishedTaskScheduleRecords } from "../productionScheduleRecordRepository.mjs";

export function isProductionWorkspaceRuntime(workspace = {}) {
  const mode = cleanText(workspace.runtimeConfig?.mode).toLowerCase();
  return workspace.runtimeConfig?.production === true || mode === "production";
}

export async function hydratePersistentWorkspaceState({
  workspace,
  seedDemoPrintJobs = async () => {},
  seedUsers = [],
} = {}) {
  if (!workspace || typeof workspace !== "object") {
    throw new TypeError("A workspace is required to hydrate persistent ERP state.");
  }

  const productionRuntime = isProductionWorkspaceRuntime(workspace);
  const persistedCoreWorkspaceState = await loadState(workspace.coreWorkspaceReadRepository);
  for (const key of coreWorkspaceCollectionKeys) {
    const persistedCollection = persistedCoreWorkspaceState[key];
    if (Array.isArray(persistedCollection)) {
      workspace[key] = persistedCollection;
    } else if (productionRuntime) {
      workspace[key] = [];
    }
  }

  const persistedMachineConfigurationState = await loadState(
    workspace.masterDataMachineConfigurationRepository,
  );
  if (Array.isArray(persistedMachineConfigurationState.machines)) {
    workspace.machines = persistedMachineConfigurationState.machines;
  } else if (productionRuntime) {
    workspace.machines = [];
  }
  for (const operationLog of toArray(persistedMachineConfigurationState.operationLogs)) {
    workspace.operationLogs = upsertByKey(workspace.operationLogs, operationLog, "id");
  }

  const persistedOrderDraftState = await loadState(workspace.orderDraftRepository);
  const persistedOrderDrafts = toArray(persistedOrderDraftState.orderDrafts);
  const allowSyntheticOrderDrafts =
    !productionRuntime && workspace.orderDraftRepository?.kind === "local_memory";
  workspace.orderDrafts =
    persistedOrderDrafts.length > 0 || !allowSyntheticOrderDrafts
      ? persistedOrderDrafts
      : toArray(workspace.initialOrderDrafts);

  const persistedDriverDeliveryDispatchState = await loadState(workspace.driverDeliveryDispatchRepository);
  const persistedDriverDeliveryDispatches = toArray(
    persistedDriverDeliveryDispatchState.driverDeliveryDispatches,
  );
  workspace.driverDeliveryDispatches =
    persistedDriverDeliveryDispatches.length > 0 || productionRuntime
      ? persistedDriverDeliveryDispatches
      : toArray(workspace.initialDriverDeliveryDispatches);

  workspace.driverDeviceFieldTests = toArray(
    (await loadState(workspace.driverDeviceFieldTestRepository)).driverDeviceFieldTests,
  );
  workspace.printBatchRecords = toArray(
    (await loadState(workspace.printBatchRepository)).printBatchRecords,
  );
  workspace.printDevices = toArray((await loadState(workspace.printDeviceRepository)).printDevices);
  workspace.printJobs = toArray((await loadState(workspace.printJobRepository)).printJobs);
  workspace.printerDeviceFieldTests = toArray(
    (await loadState(workspace.printerDeviceFieldTestRepository)).printerDeviceFieldTests,
  );

  const persistedMasterDataImportReviewState = await loadState(
    workspace.masterDataImportReviewRepository,
  );
  workspace.masterDataImportReviewDrafts = toArray(
    persistedMasterDataImportReviewState.masterDataImportReviewDrafts,
  );
  workspace.masterDataImportConfirmationPlans = toArray(
    persistedMasterDataImportReviewState.masterDataImportConfirmationPlans,
  );
  workspace.masterDataImportExecutions = toArray(
    persistedMasterDataImportReviewState.masterDataImportExecutions,
  );
  for (const operationLog of toArray(persistedMasterDataImportReviewState.operationLogs)) {
    workspace.operationLogs = upsertByKey(workspace.operationLogs, operationLog, "id");
  }

  const rawMaterialLoadOptions = productionRuntime
    ? undefined
    : { seedInbounds: toArray(workspace.initialRawMaterialInbounds) };
  const persistedRawMaterialInboundState = await loadState(
    workspace.rawMaterialInboundRepository,
    rawMaterialLoadOptions,
  );
  workspace.rawMaterialInbounds = Array.isArray(persistedRawMaterialInboundState.rawMaterialInbounds)
    ? persistedRawMaterialInboundState.rawMaterialInbounds
    : productionRuntime
      ? []
      : toArray(workspace.initialRawMaterialInbounds);

  const persistedRawMaterialSupplierStatementReviewState = await loadState(
    workspace.rawMaterialSupplierStatementReviewRepository,
  );
  workspace.rawMaterialSupplierStatementReviews = toArray(
    persistedRawMaterialSupplierStatementReviewState.rawMaterialSupplierStatementReviews,
  );
  workspace.rawMaterialPurchaseRequests = toArray(
    (await loadState(workspace.rawMaterialPurchaseRepository)).rawMaterialPurchaseRequests,
  );

  const maintenanceLoadOptions = productionRuntime
    ? undefined
    : { seedTasks: toArray(workspace.initialMaintenanceTasks) };
  const persistedMaintenanceState = await loadState(
    workspace.maintenanceTaskRepository,
    maintenanceLoadOptions,
  );
  workspace.maintenanceTasks = Array.isArray(persistedMaintenanceState.maintenanceTasks)
    ? persistedMaintenanceState.maintenanceTasks
    : productionRuntime
      ? []
      : toArray(workspace.initialMaintenanceTasks);

  const attendancePayrollState = await loadState(workspace.attendancePayrollRepository);
  workspace.attendanceImportBatches = toArray(attendancePayrollState.attendanceImportBatches);
  workspace.attendancePunches = toArray(attendancePayrollState.attendancePunches);
  workspace.attendanceDayReviews = toArray(attendancePayrollState.attendanceDayReviews);
  workspace.payrollPolicyVersions = toArray(attendancePayrollState.payrollPolicyVersions);
  workspace.payrollRuns = toArray(attendancePayrollState.payrollRuns);
  workspace.payrollLines = toArray(attendancePayrollState.payrollLines);
  workspace.payrollLineAdjustments = toArray(attendancePayrollState.payrollLineAdjustments);
  workspace.payrollExportEvents = toArray(attendancePayrollState.payrollExportEvents);

  mergeRuntimeIdentityStateIntoWorkspace(
    workspace,
    await loadState(workspace.runtimeIdentityRepository),
  );
  await ensureNonProductionSeedUserReferences({
    workspace,
    seedUsers,
    productionRuntime,
  });
  workspace.productionScheduleRecords = toArray(
    (await loadState(workspace.productionScheduleRecordRepository)).productionScheduleRecords,
  );
  if (!productionRuntime && workspace.productionScheduleRecordRepository?.kind === "local_memory") {
    workspace.productionScheduleRecords = ensurePublishedTaskScheduleRecords({
      productionTasks: workspace.productionTasks,
      records: workspace.productionScheduleRecords,
    });
  }
  const persistedBusinessDecisionState = await loadState(workspace.businessDecisionEvidenceRepository);
  workspace.businessDecisionRecords = toArray(persistedBusinessDecisionState.businessDecisionRecords);
  const persistedAuthorizationState = await loadState(workspace.businessDecisionAuthorizationRepository);
  workspace.businessDecisionAuthorizations = Array.isArray(persistedAuthorizationState.businessDecisionAuthorizations)
    ? persistedAuthorizationState.businessDecisionAuthorizations
    : toArray(persistedBusinessDecisionState.businessDecisionAuthorizations);
  for (const operationLog of toArray(persistedAuthorizationState.operationLogs)) {
    workspace.operationLogs = upsertByKey(workspace.operationLogs, operationLog, "id");
  }
  const persistedEvidenceDraftState = await loadState(workspace.businessDecisionEvidenceDraftRepository);
  workspace.businessDecisionEvidenceDrafts = toArray(persistedEvidenceDraftState.businessDecisionEvidenceDrafts);
  for (const operationLog of toArray(persistedEvidenceDraftState.operationLogs)) {
    workspace.operationLogs = upsertByKey(workspace.operationLogs, operationLog, "id");
  }
  workspace.paymentRecords = toArray(
    (await loadState(workspace.paymentRecordRepository)).paymentRecords,
  );
  workspace.statementExportFiles = toArray(
    (await loadState(workspace.statementExportRepository)).statementExportFiles,
  );

  const persistedAttachmentState = await loadState(workspace.attachmentRepository);
  workspace.attachments = toArray(persistedAttachmentState.attachments);
  workspace.attachmentLinks = toArray(persistedAttachmentState.attachmentLinks);
  workspace.attachmentAccessLogs = toArray(
    (await loadState(workspace.attachmentAccessAuditRepository)).attachmentAccessLogs,
  );

  if (!productionRuntime) await seedDemoPrintJobs(workspace);
  return workspace;
}

async function ensureNonProductionSeedUserReferences({
  workspace,
  seedUsers,
  productionRuntime,
}) {
  if (productionRuntime || !Array.isArray(seedUsers) || seedUsers.length === 0) return;

  const usersById = new Map(
    toArray(workspace.users)
      .map((user) => [cleanText(user?.userId ?? user?.id), user])
      .filter(([userId]) => userId),
  );
  const seedUserReferences = seedUsers
    .map((user) => {
      const userId = cleanText(user?.userId ?? user?.id);
      if (!userId) return null;
      const reference = {
        ...user,
        id: userId,
        userId,
        source: "seed",
        identityKind: "seed_fixture",
        loginEnabled: false,
      };
      usersById.set(userId, {
        ...reference,
        ...(usersById.get(userId) ?? {}),
      });
      return reference;
    })
    .filter(Boolean);
  workspace.users = Array.from(usersById.values());

  if (
    workspace.runtimeIdentityRepository?.kind !== "postgres" ||
    typeof workspace.runtimeIdentityRepository.saveState !== "function"
  ) {
    return;
  }
  await workspace.runtimeIdentityRepository.saveState({
    workspace: {
      users: seedUserReferences,
      employees: [],
      operationLogs: [],
      phoneVerificationChallenges: [],
      revokedSeedSessions: [],
    },
  });
}

async function loadState(repository, options) {
  if (typeof repository?.loadState !== "function") return {};
  return (await repository.loadState(options)) ?? {};
}

function upsertByKey(rows = [], record, key) {
  const normalizedRows = toArray(rows);
  const recordKey = record?.[key];
  const index = normalizedRows.findIndex(
    (item) => item?.[key] === recordKey || item?.id === recordKey,
  );
  if (index === -1) return [record, ...normalizedRows];
  return normalizedRows.map((item, itemIndex) => (itemIndex === index ? record : item));
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value) {
  return String(value ?? "").trim();
}
