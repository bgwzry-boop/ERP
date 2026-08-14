import {
  normalizeProductionEnvFixItem,
} from "./officeV1GoLiveStatusProductionTemplateNormalizers.js";
import {
  normalizeV1ProductionEnvFileAuditConfigSourceStatus,
} from "./officeV1GoLiveStatusProductionEnvNormalizers.js";
import {
  cleanText,
  formatDateTimeLabel,
  isPlainObject,
  normalizeStringList,
} from "./officeV1GoLiveStatusNormalizerUtils.js";

export function normalizeV1D49Readiness(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const employees = isPlainObject(source.employees) ? source.employees : {};
  const employeeIntake = normalizeV1D49EmployeeIntakeStatus(source.employeeIntake);
  const environment = isPlainObject(source.environment) ? source.environment : {};
  const roles = Array.isArray(employees.roles)
    ? employees.roles.map((role) => ({
        roleKey: cleanText(role.roleKey),
        roleLabel: cleanText(role.roleLabel),
        ready: role.ready === true,
        accountCount: Number(role.accountCount) || 0,
        readyAccountCount: Number(role.readyAccountCount) || 0,
        blockers: Array.isArray(role.blockers)
          ? role.blockers.map((item) => ({
              code: cleanText(item.code),
              label: cleanText(item.label),
              count: Number(item.count) || 0,
            }))
          : [],
      })).filter((role) => role.roleKey)
    : [];
  const blockers = Array.isArray(source.blockers)
    ? source.blockers.map((item) => ({
        key: cleanText(item.key),
        category: cleanText(item.category),
        label: cleanText(item.label),
        detail: cleanText(item.detail),
        nextAction: cleanText(item.nextAction),
      })).filter((item) => item.label)
    : [];
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  return {
    available: cleanText(source.scope) === "v1_d49_readiness",
    status,
    ready: source.ready === true,
    statusLabel: source.ready === true ? "D49 已就绪" : status === "error" ? "D49 预检失败" : "D49 仍有阻塞",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label),
      employeeRoleLabel: cleanText(summary.employeeRoleLabel) || "0/8",
      coveredRoleCount: Number(summary.coveredRoleCount) || 0,
      requiredRoleCount: Number(summary.requiredRoleCount) || 8,
      missingRoleCount: Number(summary.missingRoleCount) || 0,
      formalAccountCount: Number(summary.formalAccountCount) || 0,
      readyFormalAccountCount: Number(summary.readyFormalAccountCount) || 0,
      employeeIntakeAvailable: summary.employeeIntakeAvailable === true,
      employeeIntakeFresh: summary.employeeIntakeFresh === true,
      employeeIntakeStatusLabel: cleanText(summary.employeeIntakeStatusLabel),
      employeeIntakeRowCount: Number(summary.employeeIntakeRowCount) || employeeIntake.summary.employeeRowCount,
      employeeIntakeCoverageLabel: cleanText(summary.employeeIntakeCoverageLabel) || employeeIntake.summary.coverageLabel,
      employeeNumberMissingCount: Number(summary.employeeNumberMissingCount) || employeeIntake.summary.missingEmployeeNumberCount,
      envSetupReady: summary.envSetupReady === true,
      envAuditReady: summary.envAuditReady === true,
      envPreflightLabel: cleanText(summary.envPreflightLabel) || "0/12",
      envIntakeReady: summary.envIntakeReady === true,
      envIntakeConfiguredLabel: cleanText(summary.envIntakeConfiguredLabel) || "0/0",
      blockerCount: Number(summary.blockerCount) || blockers.length,
      blockerLabel: cleanText(summary.blockerLabel) || `${blockers.length} 项`,
      currentRuntimeMode: cleanText(summary.currentRuntimeMode) || "unknown",
      blocksRegardlessOfDemoMode: summary.blocksRegardlessOfDemoMode === true,
    },
    employees: {
      ready: employees.ready === true,
      roles,
    },
    employeeIntake,
    environment: {
      status: cleanText(environment.status),
      ready: environment.ready === true,
      setupReady: environment.setupReady === true,
      auditReady: environment.auditReady === true,
      preflightReady: environment.preflightReady === true,
      preflightLabel: cleanText(environment.preflightLabel) || "0/12",
      intakeReady: environment.intakeReady === true,
      intakeConfiguredLabel: cleanText(environment.intakeConfiguredLabel) || "0/0",
    },
    blockers,
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1D49EmployeeIntakeStatus(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const status = cleanText(source.status) || "unavailable";
  const available = source.available === true && cleanText(source.scope) === "v1_d49_employee_intake_status";
  const fresh = available && source.fresh === true;
  const freshness = isPlainObject(source.freshness) ? source.freshness : {};
  const payrollAttendanceCoverage = normalizeV1D49PayrollAttendanceCoverage(source.payrollAttendanceCoverage);
  const roles = Array.isArray(source.roles)
    ? source.roles.map((role) => ({
        roleKey: cleanText(role.roleKey),
        roleLabel: cleanText(role.roleLabel),
        covered: role.covered === true,
        rowCount: Number(role.rowCount) || 0,
      })).filter((role) => role.roleKey)
    : [];
  return {
    available,
    fresh,
    status,
    ready: fresh && source.ready === true,
    uploadAllowed: fresh && source.uploadAllowed === true,
    statusLabel: fresh && source.ready === true
      ? "离线预检已通过"
      : status === "needs_employee_numbers"
        ? "待补员工编号"
        : status === "stale"
          ? "预检结果已过期"
          : status === "needs_role_coverage"
            ? "岗位未覆盖"
            : status === "review_required"
              ? "待人工复核"
              : "预检结果不可用",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    freshness: {
      fresh,
      status: cleanText(freshness.status) || "unavailable",
      label: cleanText(freshness.label) || "未验证",
      checkedAtValid: freshness.checkedAtValid === true,
      withinMaxAge: freshness.withinMaxAge === true,
      sourceMatched: freshness.sourceMatched === true,
      maxAgeHours: Number(freshness.maxAgeHours) || 72,
      ageHours: Number.isFinite(Number(freshness.ageHours)) ? Number(freshness.ageHours) : null,
    },
    summary: {
      label: cleanText(summary.label),
      employeeRowCount: Number(summary.employeeRowCount) || 0,
      coveredRoleCount: Number(summary.coveredRoleCount) || 0,
      requiredRoleCount: Number(summary.requiredRoleCount) || 8,
      missingRoleCount: Number(summary.missingRoleCount) || 0,
      coverageLabel: cleanText(summary.coverageLabel) || "0/8",
      errorCount: Number(summary.errorCount) || 0,
      warningCount: Number(summary.warningCount) || 0,
      issueCount: Number(summary.issueCount) || 0,
      missingEmployeeNumberCount: Number(summary.missingEmployeeNumberCount) || 0,
      blockerCount: Number(summary.blockerCount) || 0,
      blockerLabel: cleanText(summary.blockerLabel) || "未读取",
      freshnessLabel: cleanText(summary.freshnessLabel) || "未验证",
      payrollAttendanceCoverageLabel: cleanText(summary.payrollAttendanceCoverageLabel)
        || payrollAttendanceCoverage.coverageLabel,
    },
    roles,
    payrollAttendanceCoverage,
    missingRoleLabels: normalizeStringList(source.missingRoleLabels),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1D49PayrollAttendanceCoverage(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const available = source.available === true;
  const employeeCount = available ? Math.max(0, Number(source.employeeCount) || 0) : 0;
  const completeCount = Math.min(employeeCount, Math.max(0, Number(source.completeCount) || 0));
  return {
    available,
    required: available && source.required === true,
    ready: available && source.ready === true,
    complete: available && source.complete === true,
    employeeCount,
    completeCount,
    incompleteCount: available
      ? Math.max(0, Number(source.incompleteCount) || employeeCount - completeCount)
      : 0,
    profileReadyCount: available ? Math.min(employeeCount, Math.max(0, Number(source.profileReadyCount) || 0)) : 0,
    wageReadyCount: available ? Math.min(employeeCount, Math.max(0, Number(source.wageReadyCount) || 0)) : 0,
    attendanceMappingReadyCount: available
      ? Math.min(employeeCount, Math.max(0, Number(source.attendanceMappingReadyCount) || 0))
      : 0,
    coverageLabel: available ? `${completeCount}/${employeeCount}` : "未读取",
  };
}

export function normalizeV1PersistenceLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const criteria = Array.isArray(source.criteria)
    ? source.criteria.map(normalizeV1RuntimeReadinessLiveCriterion).filter((item) => item.label)
    : [];
  const blockingCriteria = Array.isArray(source.blockingCriteria) && source.blockingCriteria.length
    ? source.blockingCriteria.map(normalizeV1RuntimeReadinessLiveCriterion).filter((item) => item.label)
    : criteria.filter((item) => item.blocking && !item.ready);
  const repositoryGroups = Array.isArray(source.repositoryGroups)
    ? source.repositoryGroups.map(normalizeV1PersistenceRepositoryGroup).filter((item) => item.label)
    : [];
  const passedCount = Number(summary.passedCount) || criteria.filter((item) => item.ready).length;
  const totalCount = Number(summary.totalCount) || criteria.length;
  const blockingCount = Number(summary.blockingCount) || blockingCriteria.length;
  const readinessLabel = cleanText(summary.readinessLabel) || (totalCount ? `${passedCount}/${totalCount}` : "0/7");
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel: source.ready === true ? "已通过" : status === "error" ? "预检失败" : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || (source.ready === true ? "当前系统 V1 持久化已通过" : "当前系统 V1 持久化仍未通过"),
      readinessLabel,
      passedCount,
      totalCount,
      passedLabel: readinessLabel,
      blockingCount,
      blockingLabel: `${blockingCount} 项`,
      blockerCount: Number(summary.blockerCount) || blockingCriteria.length,
      blockerLabel: `${Number(summary.blockerCount) || blockingCriteria.length} 项`,
      repositoryGroupCount: Number(summary.repositoryGroupCount) || repositoryGroups.length,
      repositoryGroupLabel: cleanText(summary.repositoryGroupLabel) || `${Number(summary.repositoryGroupCount) || repositoryGroups.length} 组`,
      repositoryCount: Number(summary.repositoryCount) || repositoryGroups.reduce((sum, group) => sum + group.repositoryCount, 0),
      repositoryLabel: cleanText(summary.repositoryLabel),
      productionReadyRepositoryCount: Number(summary.productionReadyRepositoryCount) || 0,
      localRepositoryCount: Number(summary.localRepositoryCount) || 0,
      localRepositoryLabel: cleanText(summary.localRepositoryLabel) || `${Number(summary.localRepositoryCount) || 0} 个`,
      localMemoryCount: Number(summary.localMemoryCount) || 0,
      localJsonCount: Number(summary.localJsonCount) || 0,
      localFsCount: Number(summary.localFsCount) || 0,
      currentRuntime: summary.currentRuntime === true,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      localPersistenceAcceptedForV1: summary.localPersistenceAcceptedForV1 === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
    },
    criteria,
    blockingCriteria,
    repositoryGroups,
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}
function normalizeV1PersistenceRepositoryGroup(value = {}) {
  const repositories = Array.isArray(value.repositories)
    ? value.repositories.map(normalizeV1PersistenceRepository).filter((item) => item.label)
    : [];
  const repositoryCount = Number(value.repositoryCount) || repositories.length;
  const productionReadyCount = Number(value.productionReadyCount) || repositories.filter((item) => item.productionReady).length;
  const localRepositoryCount = Number(value.localRepositoryCount) || repositories.filter((item) => item.localKind).length;
  return {
    key: cleanText(value.key),
    label: cleanText(value.label),
    status: cleanText(value.status) || (value.ready ? "passed" : "pending"),
    statusLabel: cleanText(value.statusLabel) || (value.ready ? "已通过" : "阻塞"),
    ready: value.ready === true,
    acceptedByLocalPolicy: value.acceptedByLocalPolicy === true,
    repositoryCount,
    productionReadyCount,
    localRepositoryCount,
    localMemoryCount: Number(value.localMemoryCount) || 0,
    localJsonCount: Number(value.localJsonCount) || 0,
    localFsCount: Number(value.localFsCount) || 0,
    repositoryLabel: cleanText(value.repositoryLabel) || `${productionReadyCount}/${repositoryCount}`,
    localRepositoryLabel: cleanText(value.localRepositoryLabel) || `${localRepositoryCount} 个`,
    nextAction: cleanText(value.nextAction),
    repositories,
  };
}

function normalizeV1PersistenceRepository(value = {}) {
  return {
    key: cleanText(value.key),
    label: cleanText(value.label),
    kind: cleanText(value.kind),
    kindLabel: cleanText(value.kindLabel) || cleanText(value.kind),
    status: cleanText(value.status) || (value.productionReady ? "passed" : "pending"),
    statusLabel: cleanText(value.statusLabel) || (value.productionReady ? "生产级" : "本地/内存"),
    productionReady: value.productionReady === true,
    localKind: value.localKind === true,
  };
}

export function normalizeV1AttachmentRetentionLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const criteria = Array.isArray(source.criteria)
    ? source.criteria.map(normalizeV1RuntimeReadinessLiveCriterion).filter((item) => item.label)
    : [];
  const blockingCriteria = Array.isArray(source.blockingCriteria) && source.blockingCriteria.length
    ? source.blockingCriteria.map(normalizeV1RuntimeReadinessLiveCriterion).filter((item) => item.label)
    : criteria.filter((item) => item.blocking && !item.ready);
  const diagnostics = normalizeV1AttachmentRetentionDiagnostics(source.diagnostics);
  const storageMode = normalizeV1AttachmentRetentionStorageMode(source.storageMode);
  const passedCount = Number(summary.passedCount) || criteria.filter((item) => item.ready).length;
  const totalCount = Number(summary.totalCount) || criteria.length;
  const blockingCount = Number(summary.blockingCount) || blockingCriteria.length;
  const readinessLabel = cleanText(summary.readinessLabel) || (totalCount ? `${passedCount}/${totalCount}` : "0/5");
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel: source.ready === true ? "已通过" : status === "error" ? "预检失败" : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || (source.ready === true ? "当前附件 V1 留档已通过" : "当前附件 V1 留档仍未通过"),
      readinessLabel,
      passedCount,
      totalCount,
      passedLabel: cleanText(summary.passedLabel) || readinessLabel,
      blockingCount,
      blockingLabel: cleanText(summary.blockingLabel) || `${blockingCount} 项`,
      blockerCount: Number(summary.blockerCount) || blockingCriteria.length,
      blockerLabel: cleanText(summary.blockerLabel) || `${Number(summary.blockerCount) || blockingCriteria.length} 项`,
      currentRuntime: summary.currentRuntime === true,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      diagnosticReady: summary.diagnosticReady === true,
      diagnosticObjectCleanedUp: summary.diagnosticObjectCleanedUp === true,
      configured: summary.configured === true,
      missingConfigFieldCount: Number(summary.missingConfigFieldCount) || 0,
      missingConfigFieldLabel: `${Number(summary.missingConfigFieldCount) || 0} 项`,
      storageKind: cleanText(summary.storageKind) || storageMode.storageKind,
      storageProvider: cleanText(summary.storageProvider) || storageMode.storageProvider,
      storageKindLabel: cleanText(summary.storageKindLabel) || storageMode.storageKindLabel,
      objectStorageLive: summary.objectStorageLive === true || storageMode.objectStorageLive === true,
      localFsAcceptedForV1: summary.localFsAcceptedForV1 === true || storageMode.localFsAcceptedForV1 === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
    },
    criteria,
    blockingCriteria,
    diagnostics,
    storageMode,
    remainingV1Risks: normalizeStringList(source.remainingV1Risks),
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1AttachmentRetentionDiagnostics(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    status: cleanText(source.status),
    ready: source.ready === true,
    storageKind: cleanText(source.storageKind),
    storageProvider: cleanText(source.storageProvider),
    configured: source.configured === true,
    missingConfigFields: normalizeStringList(source.missingConfigFields),
    writeOk: source.writeOk === true,
    readOk: source.readOk === true,
    digestOk: source.digestOk === true,
    cleanupOk: source.cleanupOk === true,
    secretFieldsExposed: source.secretFieldsExposed === true,
  };
}

function normalizeV1AttachmentRetentionStorageMode(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const storageKind = cleanText(source.storageKind);
  const storageProvider = cleanText(source.storageProvider);
  return {
    storageKind,
    storageProvider,
    storageKindLabel: formatAttachmentStorageKindLabel(storageKind || storageProvider),
    objectStorageLive: source.objectStorageLive === true,
    localFsAcceptedForV1: source.localFsAcceptedForV1 === true,
  };
}

function formatAttachmentStorageKindLabel(kind) {
  if (kind === "object_storage") return "对象存储";
  if (kind === "local_fs") return "本地文件";
  if (kind === "local_json") return "本地 JSON";
  if (kind === "local_memory") return "本地内存";
  return cleanText(kind) || "未知";
}

export function normalizeV1DriverReadinessLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const criteria = Array.isArray(source.criteria)
    ? source.criteria.map(normalizeV1RuntimeReadinessLiveCriterion).filter((item) => item.label)
    : [];
  const blockingCriteria = Array.isArray(source.blockingCriteria) && source.blockingCriteria.length
    ? source.blockingCriteria.map(normalizeV1RuntimeReadinessLiveCriterion).filter((item) => item.label)
    : criteria.filter((item) => item.blocking && !item.ready);
  const deliveryTaskReadiness = normalizeV1DriverDeliveryTaskReadiness(source.deliveryTaskReadiness);
  const latestFieldTest = isPlainObject(source.latestFieldTest)
    ? {
        recordId: cleanText(source.latestFieldTest.recordId),
        fulfillmentId: cleanText(source.latestFieldTest.fulfillmentId),
        checkedAt: formatDateTimeLabel(source.latestFieldTest.checkedAt),
        deviceLabel: cleanText(source.latestFieldTest.deviceLabel),
        summaryLabel: cleanText(source.latestFieldTest.summaryLabel),
        acceptanceStatusLabel: cleanText(source.latestFieldTest.acceptanceStatusLabel) || "现场验收未通过",
      }
    : null;
  const nativeBridge = normalizeV1DriverNativeBridge(source.nativeBridge);
  const packageLabelScanSample = isPlainObject(source.packageLabelScanSample)
    ? {
        sampleId: cleanText(source.packageLabelScanSample.sampleId),
        fulfillmentId: cleanText(source.packageLabelScanSample.fulfillmentId),
        method: cleanText(source.packageLabelScanSample.method),
        methodLabel: cleanText(source.packageLabelScanSample.methodLabel),
        result: cleanText(source.packageLabelScanSample.result),
        resultLabel: cleanText(source.packageLabelScanSample.resultLabel),
        checkedAt: formatDateTimeLabel(source.packageLabelScanSample.checkedAt),
        expectedPackageIdPresent: source.packageLabelScanSample.expectedPackageIdPresent === true,
        matchedPackageIdPresent: source.packageLabelScanSample.matchedPackageIdPresent === true,
        scanTextPresent: source.packageLabelScanSample.scanTextPresent === true,
      }
    : null;
  const passedCount = Number(summary.passedCount) || criteria.filter((item) => item.ready).length;
  const totalCount = Number(summary.totalCount) || criteria.length;
  const blockingCount = Number(summary.blockingCount) || blockingCriteria.length;
  const readinessLabel = cleanText(summary.readinessLabel) || (totalCount ? `${passedCount}/${totalCount}` : "0/6");
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel: source.ready === true ? "已通过" : status === "error" ? "预检失败" : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    driverOperatorId: cleanText(source.driverOperatorId),
    summary: {
      label: cleanText(summary.label) || (source.ready === true ? "司机端 V1 真机门禁已通过" : "司机端 V1 真机门禁仍未通过"),
      readinessLabel,
      passedCount,
      totalCount,
      passedLabel: cleanText(summary.passedLabel) || readinessLabel,
      blockingCount,
      blockingLabel: cleanText(summary.blockingLabel) || `${blockingCount} 项`,
      blockerCount: Number(summary.blockerCount) || blockingCriteria.length,
      blockerLabel: cleanText(summary.blockerLabel) || `${Number(summary.blockerCount) || blockingCriteria.length} 项`,
      currentRuntime: summary.currentRuntime === true,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      deliveryTaskStatusChanged: summary.deliveryTaskStatusChanged === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      deliveryTaskCount: Number(summary.deliveryTaskCount) || deliveryTaskReadiness.total,
      fieldTestRecordAvailable: summary.fieldTestRecordAvailable === true,
      fieldTestLabel: cleanText(summary.fieldTestLabel) || (latestFieldTest ? latestFieldTest.summaryLabel : "未验收"),
      onsiteAcceptancePassed: summary.onsiteAcceptancePassed === true,
      nativeSupportedLabel: cleanText(summary.nativeSupportedLabel) || nativeBridge.supportedLabel,
      packageLabelScanMatched: summary.packageLabelScanMatched === true,
      packageLabelScanNative: summary.packageLabelScanNative === true,
      requiresNativeShell: summary.requiresNativeShell !== false,
      browserOnlyNotReady: summary.browserOnlyNotReady === true,
      payloadExposed: summary.payloadExposed === true,
    },
    criteria,
    blockingCriteria,
    deliveryTaskReadiness,
    latestFieldTest,
    nativeBridge,
    packageLabelScanSample,
    remainingV1Risks: normalizeStringList(source.remainingV1Risks),
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1DriverDeliveryTaskReadiness(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const metrics = isPlainObject(source.metrics) ? source.metrics : {};
  return {
    total: Number(source.total) || 0,
    sampleFulfillmentCount: Number(source.sampleFulfillmentCount) || 0,
    metrics: {
      pendingCount: Number(metrics.pendingCount) || 0,
      deliveringCount: Number(metrics.deliveringCount) || 0,
      completedCount: Number(metrics.completedCount) || 0,
      exceptionCount: Number(metrics.exceptionCount) || 0,
    },
  };
}

function normalizeV1DriverNativeBridge(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const supportedCount = Number(source.supportedCount) || 0;
  const total = Number(source.total) || 0;
  const items = Array.isArray(source.items)
    ? source.items.map((item) => ({
        key: cleanText(item.key),
        label: cleanText(item.label),
        supported: item.supported === true,
        statusLabel: cleanText(item.statusLabel),
        bridgeTypeLabel: cleanText(item.bridgeTypeLabel),
        version: cleanText(item.version),
      })).filter((item) => item.key || item.label)
    : [];
  return {
    label: cleanText(source.label),
    supportedCount,
    total,
    supportedLabel: total ? `${supportedCount}/${total}` : "0/2",
    items,
  };
}

export function normalizeV1ProductionGoLiveLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const stages = Array.isArray(source.stages)
    ? source.stages.map(normalizeV1ProductionGoLiveStage).filter((item) => item.label)
    : [];
  const blockingStages = Array.isArray(source.blockingStages) && source.blockingStages.length
    ? source.blockingStages.map(normalizeV1ProductionGoLiveStage).filter((item) => item.label)
    : stages.filter((item) => !item.ready);
  const fixChecklist = Array.isArray(source.fixChecklist)
    ? source.fixChecklist.map(normalizeProductionEnvFixItem).filter((item) => item.label)
    : [];
  const unblockChecklist = Array.isArray(source.unblockChecklist)
    ? source.unblockChecklist.map(normalizeV1ProductionGoLiveUnblockItem).filter((item) => item.label)
    : [];
  const fieldEvidenceCoverage = normalizeV1ProductionGoLiveFieldEvidenceCoverage(source.fieldEvidenceCoverage);
  const passedCount = Number(summary.passedCount) || stages.filter((item) => item.ready).length;
  const totalCount = Number(summary.totalCount) || stages.length;
  const blockingCount = Number(summary.blockingCount) || blockingStages.length;
  const warningCount = Number(summary.warningCount) || 0;
  const readinessLabel = cleanText(summary.readinessLabel || summary.stageLabel) || (totalCount ? `${passedCount}/${totalCount}` : "0/5");
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  const runtimeReadiness = isPlainObject(source.runtimeReadiness) ? source.runtimeReadiness : null;
  const sourceStatuses = Array.isArray(summary.sourceStatuses)
    ? summary.sourceStatuses.map(normalizeV1ProductionEnvFileAuditConfigSourceStatus).filter((item) => item.envVariable)
    : [];
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel:
      source.ready === true
        ? "已通过"
        : status === "not_configured"
          ? "未配置"
          : status === "error"
            ? "预检失败"
            : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || (source.ready === true ? "生产上线组合预检通过" : "生产上线组合预检仍未通过"),
      readinessLabel,
      passedCount,
      totalCount,
      passedLabel: readinessLabel,
      blockingCount,
      blockingLabel: `${blockingCount} 项`,
      warningCount,
      warningLabel: `${warningCount} 项`,
      blockerCount: Number(summary.blockerCount) || blockingStages.length,
      blockerLabel: `${Number(summary.blockerCount) || blockingStages.length} 项`,
      envFileCount: Number(summary.envFileCount) || 0,
      configuredEnvFileCount: Number(summary.configuredEnvFileCount) || 0,
      sourceStatuses,
      currentRuntime: summary.currentRuntime === true,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      envFilePathAccepted: summary.envFilePathAccepted === true,
      productionEnvAppliedToProcess: summary.productionEnvAppliedToProcess === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      physicalPrinterCalled: summary.physicalPrinterCalled === true,
    },
    stages,
    blockingStages,
    fixChecklist,
    unblockChecklist,
    fieldEvidenceCoverage,
    runtimeReadiness: runtimeReadiness
      ? {
          status: cleanText(runtimeReadiness.status),
          ready: runtimeReadiness.ready === true,
          summary: isPlainObject(runtimeReadiness.summary) ? runtimeReadiness.summary : {},
          systemPersistence: isPlainObject(runtimeReadiness.systemPersistence) ? runtimeReadiness.systemPersistence : {},
          attachmentReadiness: isPlainObject(runtimeReadiness.attachmentReadiness) ? runtimeReadiness.attachmentReadiness : {},
          remainingV1Risks: normalizeStringList(runtimeReadiness.remainingV1Risks),
        }
      : null,
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1ProductionGoLiveStage(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const blockingItems = Array.isArray(source.blockingItems)
    ? source.blockingItems.map(normalizeV1ProductionGoLiveBlockingItem).filter((item) => item.label)
    : [];
  const checks = Array.isArray(source.checks)
    ? source.checks.map(normalizeV1ProductionGoLiveBlockingItem).filter((item) => item.label)
    : [];
  const passedCount = Number(summary.passedCount) || checks.filter((item) => item.ready).length;
  const totalCount = Number(summary.totalCount) || checks.length;
  return {
    key: cleanText(source.key),
    label: cleanText(source.label),
    status: cleanText(source.status) || (source.ready ? "passed" : "pending"),
    sourceStatus: cleanText(source.sourceStatus),
    ready: source.ready === true || source.status === "passed",
    summary: {
      label: cleanText(summary.label) || (totalCount ? `${passedCount}/${totalCount} 通过` : ""),
      passedCount,
      totalCount,
      blockingCount: Number(summary.blockingCount) || blockingItems.length,
      warningCount: Number(summary.warningCount) || 0,
    },
    blockingItems,
    checks,
    nextActions: normalizeStringList(source.nextActions),
  };
}

function normalizeV1ProductionGoLiveBlockingItem(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    status: cleanText(value?.status) || "unknown",
    ready: value?.ready === true || value?.status === "passed",
    blocking: value?.blocking !== false,
    detail: cleanText(value?.detail),
  };
}

function normalizeV1ProductionGoLiveUnblockItem(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const blockers = Array.isArray(source.blockers)
    ? source.blockers.map(normalizeV1ProductionGoLiveBlockingItem).filter((item) => item.label)
    : [];
  const fixItems = Array.isArray(source.fixItems)
    ? source.fixItems.map(normalizeProductionEnvFixItem).filter((item) => item.label)
    : [];
  return {
    key: cleanText(source.key),
    label: cleanText(source.label),
    stageOrder: Number(source.stageOrder) || 0,
    status: cleanText(source.status) || "pending",
    ready: source.ready === true,
    ownerRole: cleanText(source.ownerRole),
    blockingCount: Number(source.blockingCount) || blockers.length,
    nextAction: cleanText(source.nextAction),
    verificationSteps: normalizeStringList(source.verificationSteps),
    evidenceToKeep: normalizeStringList(source.evidenceToKeep),
    blockers,
    fixItems,
  };
}

function normalizeV1ProductionGoLiveFieldEvidenceCoverage(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const rawSummary = isPlainObject(source.summary) ? source.summary : {};
  const items = Array.isArray(source.items)
    ? source.items.map(normalizeV1ProductionGoLiveFieldEvidenceCoverageItem).filter((item) => item.itemLabel)
    : [];
  const reportSupportedCount =
    Number(rawSummary.reportSupportedCount) || items.filter((item) => item.status === "report_supported").length;
  const needsOnsiteRefCount =
    Number(rawSummary.needsOnsiteRefCount) || items.filter((item) => item.status === "needs_onsite_ref").length;
  const waitingForStageCount =
    Number(rawSummary.waitingForStageCount) || items.filter((item) => item.status === "waiting_for_stage").length;
  const onsiteRequiredCount =
    Number(rawSummary.onsiteRequiredCount) || items.filter((item) => item.status === "onsite_required").length;
  const totalCount = Number(rawSummary.totalCount) || items.length;
  const stillNeedsFieldEvidenceCount =
    Number(rawSummary.stillNeedsFieldEvidenceCount) || Math.max(0, totalCount - reportSupportedCount);
  return {
    summary: {
      label: cleanText(rawSummary.label) || `${reportSupportedCount}/${totalCount} 可由本报告直接支持`,
      reportSupportedCount,
      needsOnsiteRefCount,
      waitingForStageCount,
      onsiteRequiredCount,
      totalCount,
      reportSupportedLabel: cleanText(rawSummary.reportSupportedLabel) || `${reportSupportedCount}/${totalCount}`,
      stillNeedsFieldEvidenceCount,
      stillNeedsFieldEvidenceLabel: `${stillNeedsFieldEvidenceCount} 项`,
      nextAction: cleanText(rawSummary.nextAction),
    },
    items,
  };
}

function normalizeV1ProductionGoLiveFieldEvidenceCoverageItem(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    groupKey: cleanText(source.groupKey),
    groupLabel: cleanText(source.groupLabel),
    itemKey: cleanText(source.itemKey),
    itemLabel: cleanText(source.itemLabel),
    status: cleanText(source.status) || "waiting_for_stage",
    statusLabel: cleanText(source.statusLabel) || "待处理",
    ready: source.ready === true,
    supportingStageKey: cleanText(source.supportingStageKey),
    supportingStageLabel: cleanText(source.supportingStageLabel),
    nextAction: cleanText(source.nextAction),
  };
}

export function normalizeV1RuntimeReadinessLivePrecheckResult(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const criteria = Array.isArray(source.criteria)
    ? source.criteria.map(normalizeV1RuntimeReadinessLiveCriterion).filter((item) => item.label)
    : [];
  const blockingCriteria = Array.isArray(source.blockingCriteria) && source.blockingCriteria.length
    ? source.blockingCriteria.map(normalizeV1RuntimeReadinessLiveCriterion).filter((item) => item.label)
    : criteria.filter((item) => item.blocking && !item.ready);
  const passedCount = Number(summary.passedCount) || criteria.filter((item) => item.ready).length;
  const totalCount = Number(summary.totalCount) || criteria.length;
  const blockingCount = Number(summary.blockingCount) || blockingCriteria.length;
  const readinessLabel = cleanText(summary.readinessLabel) || (totalCount ? `${passedCount}/${totalCount}` : "0/11");
  const status = cleanText(source.status) || (source.ready === true ? "ready" : "blocked");
  return {
    version: cleanText(source.version),
    scope: cleanText(source.scope),
    status,
    ready: source.ready === true,
    statusLabel: source.ready === true ? "已通过" : status === "error" ? "预检失败" : "仍未通过",
    checkedAt: formatDateTimeLabel(source.checkedAt),
    summary: {
      label: cleanText(summary.label) || (source.ready === true ? "当前运行时 V1 总门禁已通过" : "当前运行时 V1 总门禁仍未通过"),
      readinessLabel,
      passedCount,
      totalCount,
      passedLabel: readinessLabel,
      blockingCount,
      blockingLabel: `${blockingCount} 项`,
      blockerCount: Number(summary.blockerCount) || blockingCriteria.length,
      blockerLabel: `${Number(summary.blockerCount) || blockingCriteria.length} 项`,
      currentRuntime: summary.currentRuntime === true,
      requestBodyIgnored: summary.requestBodyIgnored === true,
      apiBaseUrlAccepted: summary.apiBaseUrlAccepted === true,
      releaseCandidateRefreshed: summary.releaseCandidateRefreshed === true,
      goLiveSuiteRefreshed: summary.goLiveSuiteRefreshed === true,
      physicalPrinterCalled: summary.physicalPrinterCalled === true,
      nonPrinting: summary.nonPrinting !== false,
      driverStatusChanged: summary.driverStatusChanged === true,
    },
    criteria,
    blockingCriteria,
    nextActions: normalizeStringList(source.nextActions),
    nextAction: cleanText(source.nextAction),
    safeguards: isPlainObject(source.safeguards) ? source.safeguards : {},
  };
}

function normalizeV1RuntimeReadinessLiveCriterion(value = {}) {
  return {
    key: cleanText(value?.key),
    label: cleanText(value?.label),
    status: cleanText(value?.status) || (value?.ready ? "passed" : "pending"),
    statusLabel: cleanText(value?.statusLabel) || (value?.ready ? "已通过" : "阻塞"),
    ready: value?.ready === true,
    blocking: value?.blocking !== false,
    detail: cleanText(value?.detail),
  };
}
