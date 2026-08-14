import {
  sanitizeV1SensitiveStatusText,
} from "./v1StatusTextSanitizer.mjs";
import { sanitizeV1StatusTextList } from "./v1ReleaseStatusProjectionService.mjs";

export function buildV1CompletionAudit({
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
  const fieldSummary = isPlainObject(fieldEvidenceProgress.summary)
    ? fieldEvidenceProgress.summary
    : {};
  const evidenceTotal = normalizeNonNegativeInteger(fieldSummary.requiredEvidenceItemsTotal);
  const evidenceCompleted = normalizeNonNegativeInteger(fieldSummary.requiredEvidenceItemsCompleted);
  const signoffTotal = normalizeNonNegativeInteger(fieldSummary.requiredSignoffsTotal);
  const signoffCompleted = normalizeNonNegativeInteger(fieldSummary.requiredSignoffsCompleted);
  const evidenceReady = evidenceTotal > 0 && evidenceCompleted >= evidenceTotal;
  const signoffReady = signoffTotal > 0 && signoffCompleted >= signoffTotal;
  const boundaryReady = Boolean(fieldEvidenceProgress.boundary?.ready || v1V2BoundaryBrief.ready);
  const v2DifferenceCount =
    normalizeNonNegativeInteger(v1V2BoundaryBrief.summary?.v2DifferenceCount) ||
    normalizeNonNegativeInteger(summary.v2DifferenceCount);
  const v1MustContinueCount = normalizeNonNegativeInteger(
    v1V2BoundaryBrief.summary?.v1MustContinueCount,
  );
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
      evidenceLabel:
        sanitizeV1SensitiveStatusText(releaseCandidate.summary?.label) || "0/4 发布门禁通过",
      current:
        sanitizeV1SensitiveStatusText(releaseCandidate.summary?.label) ||
        sanitizeV1SensitiveStatusText(summary.releaseGate),
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
        sanitizeV1SensitiveStatusText(productionEnvGate.summary?.readinessLabel) ||
        sanitizeV1SensitiveStatusText(productionEnvGate.summary?.label) ||
        "生产 env 未通过",
      current: sanitizeV1SensitiveStatusText(productionEnvGate.summary?.label),
      proofRequirements: [
        "生产 env 文件安全审计通过。",
        "PostgreSQL、对象存储、打印 command_bridge、CUPS 和 readiness 账号变量预检通过。",
        "生产上线组合预检四阶段通过。",
      ],
      proofGaps: productionEnvGaps,
      nextAction:
        sanitizeV1SensitiveStatusText(productionEnvGate.nextAction) ||
        "补齐生产 env 文件、PostgreSQL、对象存储、打印和 CUPS 变量后重新预检。",
    }),
    buildV1CompletionAuditCriterion({
      key: "runtime_readiness",
      label: "运行时 V1 门禁",
      ready: runtimeReadinessBlockers.ready === true,
      evidenceLabel:
        sanitizeV1SensitiveStatusText(runtimeReadinessBlockers.summary?.readinessLabel) ||
        sanitizeV1SensitiveStatusText(summary.runtimeReadiness) ||
        "运行时未通过",
      current: sanitizeV1SensitiveStatusText(runtimeReadinessBlockers.summary?.label),
      proofRequirements: [
        "运行中 API 的 V1 readiness 达到 11/11 通过。",
        "系统持久化、附件留档、打印 V1 门禁和司机真机 readiness 均通过。",
      ],
      proofGaps: runtimeReadinessGaps,
      nextAction:
        sanitizeV1SensitiveStatusText(runtimeReadinessBlockers.nextAction) ||
        "处理持久化、附件、打印和司机真机阻塞后重新跑 runtime readiness。",
    }),
    buildV1CompletionAuditCriterion({
      key: "field_acceptance",
      label: "现场验收报告",
      ready: fieldAcceptanceReport.ready === true,
      evidenceLabel:
        sanitizeV1SensitiveStatusText(fieldAcceptanceReport.summary?.label) ||
        sanitizeV1SensitiveStatusText(summary.fieldAcceptance) ||
        "现场验收未通过",
      current: sanitizeV1SensitiveStatusText(fieldAcceptanceReport.conclusion),
      proofRequirements: [
        "现场验收报告显示全部模块验收通过。",
        "生产持久化、附件留档、打印设备、司机真机和业务试跑均有现场留档。",
      ],
      proofGaps: fieldAcceptanceGaps,
      nextAction:
        sanitizeV1StatusTextList(fieldAcceptanceReport.nextActions)[0] ||
        "补齐现场验收报告里的阻塞项和必需留档。",
    }),
    buildV1CompletionAuditCriterion({
      key: "field_evidence",
      label: "现场证据",
      ready: evidenceReady,
      evidenceLabel:
        sanitizeV1SensitiveStatusText(fieldSummary.evidenceItemsLabel) ||
        `${evidenceCompleted}/${evidenceTotal}`,
      current:
        sanitizeV1SensitiveStatusText(fieldSummary.evidenceLabel) ||
        sanitizeV1SensitiveStatusText(summary.fieldEvidence) ||
        "现场证据仍未完成",
      proofRequirements: [
        "40 项真实现场证据（含工资/考勤真实闭环）全部回填并通过草稿校验。",
        "证据来自真实现场附件、记录或签单，不使用占位值。",
      ],
      proofGaps: fieldEvidenceGaps,
      nextAction: evidenceReady
        ? "现场证据已满足；继续确认签字和 V1/V2 边界。"
        : "补齐 40 项真实现场证据并回填 evidence-items.csv / 附件引用，其中工资/考勤真实闭环6项不得缺失。",
    }),
    buildV1CompletionAuditCriterion({
      key: "owner_signoff",
      label: "负责人签字",
      ready: signoffReady,
      evidenceLabel:
        sanitizeV1SensitiveStatusText(fieldSummary.signoffLabel) ||
        `${signoffCompleted}/${signoffTotal}`,
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
      evidenceLabel:
        sanitizeV1SensitiveStatusText(v1V2BoundaryBrief.summary?.label) ||
        (boundaryReady ? "已确认" : "待确认"),
      current: sanitizeV1SensitiveStatusText(v1V2BoundaryBrief.conclusion),
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
  const auditReady = ready === true && criteria.length > 0 && blockingCriteria.length === 0;
  const onsiteTaskCount =
    normalizeNonNegativeInteger(roleTaskBoard.summary?.taskCount) ||
    normalizeNonNegativeInteger(ownerDecisionBrief.completion?.onsiteTaskCount) ||
    normalizeNonNegativeInteger(summary.onsiteTaskCount);
  return {
    status: auditReady ? "ready" : "blocked",
    ready: auditReady,
    canDeclareV1Complete: auditReady,
    summary: {
      label: auditReady
        ? "V1 完成审计：可以进入负责人最终确认"
        : "V1 完成审计：仍不能宣布完成",
      criteriaCount: criteria.length,
      passedCriteriaCount,
      blockingCriteriaCount: blockingCriteria.length,
      blockingCriteriaLabel: `${blockingCriteria.length}/${criteria.length}`,
      sourceReady: ready === true,
      sourceReadyRejectedByCriteria: ready === true && !auditReady,
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
      v2CategoryCount: normalizeNonNegativeInteger(v1V2BoundaryBrief.summary?.v2CategoryCount),
      v2DifferenceCount,
      moduleDifferenceCount: normalizeNonNegativeInteger(
        v1V2BoundaryBrief.summary?.moduleDifferenceCount,
      ),
      label:
        sanitizeV1SensitiveStatusText(v1V2BoundaryBrief.summary?.label) ||
        "V1/V2 边界待确认：V1 必做项不能后移到 V2",
      nextAction: boundaryReady
        ? "边界已确认；V2 差异只作为后续范围，不替代 V1 门禁。"
        : "先确认 V1 必做项和 V2 延后项，V2 差异不能替代 V1 完成条件。",
    },
    safeguards: {
      nonMutating: true,
      completionRequiresAllCriteria: true,
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

export function sanitizeV1RuntimeReadinessBlockers(
  releaseCandidate = {},
  fieldAcceptance = {},
  completion = {},
) {
  const releaseSource = isPlainObject(releaseCandidate) ? releaseCandidate : {};
  const fieldSource = isPlainObject(fieldAcceptance) ? fieldAcceptance : {};
  const completionSource = isPlainObject(completion) ? completion : {};
  const releaseSummary = isPlainObject(releaseSource.summary) ? releaseSource.summary : {};
  const fieldSummary = isPlainObject(fieldSource.summary) ? fieldSource.summary : {};
  const completionSummary = isPlainObject(completionSource.summary) ? completionSource.summary : {};
  const runtimeLabel =
    sanitizeV1SensitiveStatusText(fieldSummary.label) ||
    sanitizeV1SensitiveStatusText(releaseSummary.runtimeReadiness) ||
    sanitizeV1SensitiveStatusText(completionSummary.runtimeReadiness) ||
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
  const passedCount = normalizeNonNegativeInteger(fieldSummary.passedCount) || runtimeCounts.passedCount;
  const totalCount =
    normalizeNonNegativeInteger(fieldSummary.totalCount) ||
    runtimeCounts.totalCount ||
    Math.max(items.length, passedCount + items.length);
  const blockingCount =
    normalizeNonNegativeInteger(fieldSummary.blockingCount) ||
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
      : `先处理这 ${blockingCount} 个运行时门禁，再重新跑 release candidate / go-live suite。`,
    safeguards: {
      nonMutating: true,
      rawRuntimeReadinessReportIncluded: false,
      rawEvidenceRefsIncluded: false,
      rawSignersIncluded: false,
      rawSecretsIncluded: false,
      artifactPathExposed: false,
      localPathExposed: false,
      environmentValuesIncluded: false,
      commandValuesIncluded: false,
      physicalPrinterCalledByCheck: false,
      driverDeliveryStatusChangedByCheck: false,
    },
  };
}

export function sanitizeV1FieldAcceptanceReport(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  const modules = Array.isArray(source.modules)
    ? source.modules.map(sanitizeV1FieldAcceptanceModule).filter(Boolean)
    : [];
  const blockingCriteria = Array.isArray(source.blockingCriteria)
    ? source.blockingCriteria.map(sanitizeV1FieldAcceptanceCriterion).filter(Boolean)
    : [];
  const requiredFieldEvidence = Array.isArray(source.requiredFieldEvidence)
    ? source.requiredFieldEvidence.map(sanitizeV1RequiredFieldEvidence).filter(Boolean)
    : [];
  const remainingV1Risks = sanitizeV1StatusTextList(source.remainingV1Risks);
  const nextActions = sanitizeV1StatusTextList(source.nextActions);
  const passedCount =
    normalizeNonNegativeInteger(summary.passedCount) ||
    modules.filter((module) => module.ready).length;
  const totalCount = normalizeNonNegativeInteger(summary.totalCount) || modules.length;
  const blockingCount =
    normalizeNonNegativeInteger(summary.blockingCount) ||
    blockingCriteria.filter((item) => item.blocking).length ||
    Math.max(0, totalCount - passedCount);
  const ready = source.ready === true && blockingCount === 0 && totalCount > 0;
  return {
    status: ready ? "ready" : "blocked",
    ready,
    available:
      Boolean(cleanText(source.status)) ||
      modules.length > 0 ||
      blockingCriteria.length > 0 ||
      requiredFieldEvidence.length > 0,
    generatedAt: cleanText(source.generatedAt),
    conclusion:
      sanitizeV1SensitiveStatusText(source.conclusion) ||
      "现场验收报告仍未通过；不能声明 V1 已完成或已可上线。",
    summary: {
      label: sanitizeV1SensitiveStatusText(summary.label) || `${passedCount}/${totalCount} 通过`,
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

function buildV1CompletionProofGapsFromItems(items = [], limit = Number.POSITIVE_INFINITY) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => isV1CompletionGapItem(item))
    .map((item) => {
      const label = sanitizeV1SensitiveStatusText(item?.label || item?.key);
      const detail =
        sanitizeV1SensitiveStatusText(item?.summary) ||
        sanitizeV1SensitiveStatusText(item?.detail) ||
        sanitizeV1SensitiveStatusText(item?.nextAction) ||
        sanitizeV1SensitiveStatusText(item?.progressLabel) ||
        sanitizeV1SensitiveStatusText(item?.statusLabel) ||
        sanitizeV1SensitiveStatusText(item?.status);
      return sanitizeV1SensitiveStatusText([label, detail].filter(Boolean).join("："));
    })
    .filter(Boolean)
    .slice(0, limit);
}

function buildV1CompletionFieldEvidenceGaps(fieldEvidenceProgress = {}) {
  const source = isPlainObject(fieldEvidenceProgress) ? fieldEvidenceProgress : {};
  const groups = Array.isArray(source.groupSummaries)
    ? source.groupSummaries
    : Array.isArray(source.groups)
      ? source.groups
      : [];
  return groups
    .filter((group) => isV1CompletionGapItem(group))
    .map((group) => {
      const label = sanitizeV1SensitiveStatusText(group?.label || group?.key);
      const missingCount =
        normalizeNonNegativeInteger(group?.missingCount) ||
        normalizeNonNegativeInteger(group?.blockedRequired);
      const totalCount = normalizeNonNegativeInteger(group?.requiredTotal);
      const progress = missingCount && totalCount
        ? `缺 ${missingCount}/${totalCount} 项证据`
        : sanitizeV1SensitiveStatusText(
            group?.progressLabel || group?.nextAction || "缺现场证据",
          );
      return sanitizeV1SensitiveStatusText([label, progress].filter(Boolean).join("："));
    })
    .filter(Boolean);
}

function buildV1CompletionOwnerSignoffGaps(fieldEvidenceProgress = {}) {
  const source = isPlainObject(fieldEvidenceProgress) ? fieldEvidenceProgress : {};
  const signoffs = Array.isArray(source.signoffs) ? source.signoffs : [];
  return signoffs
    .filter((signoff) => isV1CompletionGapItem(signoff))
    .map((signoff) => {
      const role = sanitizeV1SensitiveStatusText(signoff?.role || signoff?.label || signoff?.key);
      const progress = sanitizeV1SensitiveStatusText(
        signoff?.progressLabel || "缺签字人 / 缺时间",
      );
      return sanitizeV1SensitiveStatusText([role, progress].filter(Boolean).join("："));
    })
    .filter(Boolean);
}

function buildV1CompletionBoundaryGaps(fieldEvidenceProgress = {}, v1V2BoundaryBrief = {}) {
  const source = isPlainObject(fieldEvidenceProgress) ? fieldEvidenceProgress : {};
  const boundaryAction = Array.isArray(source.signoffBoundaryActions)
    ? source.signoffBoundaryActions.find((item) => item?.type === "boundary")
    : null;
  const boundary = isPlainObject(source.boundary) ? source.boundary : {};
  const gaps = [];
  if (boundaryAction && isV1CompletionGapItem(boundaryAction)) {
    const label = sanitizeV1SensitiveStatusText(boundaryAction.label || "V1/V2 边界确认");
    const progress = sanitizeV1SensitiveStatusText(
      boundaryAction.progressLabel || boundaryAction.nextAction || "待确认",
    );
    gaps.push([label, progress].filter(Boolean).join("："));
  } else if (!boundary.ready) {
    const progress = sanitizeV1SensitiveStatusText(
      boundary.nextAction || v1V2BoundaryBrief.nextAction || "待确认",
    );
    gaps.push(["V1/V2 边界确认", progress].filter(Boolean).join("："));
  }
  return sanitizeV1StatusTextList(gaps);
}

function isV1CompletionGapItem(item = {}) {
  if (!isPlainObject(item)) return false;
  const status = cleanText(item.status);
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
  const done = ready === true;
  const sanitizedProofRequirements = sanitizeV1StatusTextList(proofRequirements);
  const sanitizedProofGaps = sanitizeV1StatusTextList(proofGaps);
  const proofGapTotalCount = sanitizedProofGaps.length;
  const proofGapShownCount = Math.min(proofGapTotalCount, 4);
  return {
    key: cleanText(key),
    label: sanitizeV1SensitiveStatusText(label),
    required: true,
    ready: done,
    status: done ? "ready" : "blocked",
    statusLabel: done ? "已满足" : "阻塞",
    evidenceLabel: sanitizeV1SensitiveStatusText(evidenceLabel),
    current: sanitizeV1SensitiveStatusText(current),
    proofRequirements: sanitizedProofRequirements.slice(0, 3),
    proofGaps: sanitizedProofGaps.slice(0, proofGapShownCount),
    proofGapShownCount,
    proofGapTotalCount,
    proofGapCountLabel: proofGapTotalCount ? `${proofGapShownCount}/${proofGapTotalCount}` : "",
    nextAction: sanitizeV1SensitiveStatusText(nextAction),
  };
}

function isV1RuntimeReadinessBlockingItem(value = {}) {
  if (!isPlainObject(value)) return false;
  const gate = cleanText(value.gate);
  const key = cleanText(value.key);
  return gate === "运行时 V1 readiness" || Boolean(getV1RuntimeReadinessBlockerDefaults(key));
}

function sanitizeV1RuntimeReadinessBlocker(value = {}) {
  if (!isPlainObject(value)) return null;
  const key = cleanText(value.key);
  const label = sanitizeV1SensitiveStatusText(value.label);
  if (!key || !label) return null;
  const defaults = getV1RuntimeReadinessBlockerDefaults(key) ?? {};
  const ready = value.ready === true;
  return {
    key,
    label,
    group: defaults.group || "运行时门禁",
    ownerRole: defaults.ownerRole || "技术/管理",
    status: ready ? "ready" : cleanText(value.status) || "pending",
    ready,
    detail: sanitizeV1SensitiveStatusText(value.detail),
    nextAction:
      sanitizeV1SensitiveStatusText(value.nextAction) ||
      defaults.nextAction ||
      "补齐该项运行时门禁后重新跑 release candidate。",
  };
}

function sanitizeV1RuntimeReadinessNextActions(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const text = sanitizeV1SensitiveStatusText(item);
      const match = text.match(/^([^：:]+)[：:]\s*(.+)$/);
      const label = match ? cleanText(match[1]) : cleanText(text);
      const detail = match ? sanitizeV1SensitiveStatusText(match[2]) : "";
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
  const label = cleanText(value);
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
  const match = entries.find(([, candidate]) => candidate === cleanText(label));
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
  return defaults[cleanText(key)] ?? null;
}

function sanitizeV1FieldAcceptanceModule(value = {}) {
  if (!isPlainObject(value)) return null;
  const key = cleanText(value.key);
  const label = sanitizeV1SensitiveStatusText(value.label);
  if (!key || !label) return null;
  const evidence = sanitizeV1StatusTextList(value.evidence).slice(0, 3);
  return {
    key,
    label,
    status: cleanText(value.status) || (value.ready === true ? "passed" : "pending"),
    ready: value.ready === true,
    detail: sanitizeV1SensitiveStatusText(value.detail),
    evidence,
  };
}

function sanitizeV1FieldAcceptanceCriterion(value = {}) {
  if (!isPlainObject(value)) return null;
  const key = cleanText(value.key);
  const label = sanitizeV1SensitiveStatusText(value.label);
  if (!key || !label) return null;
  return {
    key,
    label,
    status: cleanText(value.status) || "pending",
    blocking: value.blocking === true,
    detail: sanitizeV1SensitiveStatusText(value.detail),
    nextAction:
      getV1RuntimeReadinessBlockerDefaults(key)?.nextAction ||
      "补齐该现场验收阻塞项后重新跑现场验收报告和 release candidate。",
  };
}

function sanitizeV1RequiredFieldEvidence(value = {}) {
  if (!isPlainObject(value)) return null;
  const key = cleanText(value.key);
  const label = sanitizeV1SensitiveStatusText(value.label);
  if (!key || !label) return null;
  const required = sanitizeV1StatusTextList(value.required).slice(0, 4);
  return {
    key,
    label,
    required,
    requiredCount: required.length,
  };
}

function parseV1ReadinessCountLabel(value) {
  const text = cleanText(value);
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return { passedCount: 0, totalCount: 0 };
  return {
    passedCount: normalizeNonNegativeInteger(match[1]),
    totalCount: normalizeNonNegativeInteger(match[2]),
  };
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
