import { sanitizeV1SensitiveStatusText } from "./v1StatusTextSanitizer.mjs";

export function normalizeV1GoLiveStatus(value) {
  const status = cleanText(value);
  if (["ready", "blocked"].includes(status)) return status;
  return "blocked";
}

export function sanitizeV1GoLiveSummary(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    label: sanitizeV1SensitiveStatusText(source.label) || "V1 完成度快照：BLOCKED",
    requirements: sanitizeV1SensitiveStatusText(source.requirements) || "85-90%",
    p0Prototype: sanitizeV1SensitiveStatusText(source.p0Prototype) || "97-98%",
    v1Readiness: sanitizeV1SensitiveStatusText(source.v1Readiness) || "80-83%",
    releaseGate:
      sanitizeV1SensitiveStatusText(source.releaseGate || source.releaseCandidate) || "0/4 发布门禁通过",
    runtimeReadiness: sanitizeV1SensitiveStatusText(source.runtimeReadiness),
    fieldEvidence: sanitizeV1SensitiveStatusText(source.fieldEvidence),
    fieldAcceptance: sanitizeV1SensitiveStatusText(source.fieldAcceptance),
    onsiteTaskCount: normalizeNonNegativeInteger(source.onsiteTaskCount ?? source.onsiteTasks),
    v2DifferenceCount: normalizeNonNegativeInteger(source.v2DifferenceCount),
  };
}

export function sanitizeV1ReleaseCandidate(value = {}) {
  const source = isPlainObject(value) ? value : {};
  const summary = isPlainObject(source.summary) ? source.summary : {};
  return {
    status: normalizeV1GoLiveStatus(source.status),
    ready: source.ready === true,
    summary: {
      label: sanitizeV1SensitiveStatusText(summary.label) || "0/4 发布门禁通过",
      passedGateCount: normalizeNonNegativeInteger(summary.passedGateCount),
      totalGateCount: normalizeNonNegativeInteger(summary.totalGateCount),
      blockingCount: normalizeNonNegativeInteger(summary.blockingCount),
      envPreflight: sanitizeV1SensitiveStatusText(summary.envPreflight),
      fieldEvidence: sanitizeV1SensitiveStatusText(summary.fieldEvidence),
      runtimeReadiness: sanitizeV1SensitiveStatusText(summary.runtimeReadiness),
      fieldAcceptance: sanitizeV1SensitiveStatusText(summary.fieldAcceptance),
    },
    gates: Array.isArray(source.gates)
      ? source.gates.map(sanitizeV1ReleaseGate).filter(Boolean)
      : [],
  };
}

export function sanitizeV1ModuleCompletion(value = []) {
  return Array.isArray(value)
    ? value.map(sanitizeV1ModuleCompletionRow).filter(Boolean)
    : [];
}

export function sanitizeV1OwnerDecisionBrief(value = {}, completion = {}, suite = {}) {
  const source = isPlainObject(value) ? value : {};
  const decisionSource = isPlainObject(source.decision) ? source.decision : {};
  const completionSource = isPlainObject(source.completion)
    ? source.completion
    : isPlainObject(completion.summary)
      ? completion.summary
      : {};
  const suiteSummary = isPlainObject(suite.summary) ? suite.summary : {};
  const doneHighlights = sanitizeV1StatusTextList(source.doneHighlights).slice(0, 4);
  const unfinishedItems = Array.isArray(source.unfinishedItems)
    ? source.unfinishedItems.map(sanitizeV1OwnerDecisionItem).filter(Boolean)
    : [];
  const releaseGates = Array.isArray(source.releaseGates)
    ? source.releaseGates.map(sanitizeV1OwnerDecisionGate).filter(Boolean)
    : [];
  const blockerGroups = Array.isArray(source.blockerGroups)
    ? source.blockerGroups.map(sanitizeV1OwnerDecisionBlockerGroup).filter(Boolean)
    : [];
  const nextActions = sanitizeV1StatusTextList(source.nextActions);
  const topBlockers = Array.isArray(source.topBlockers)
    ? source.topBlockers.map(sanitizeV1OwnerDecisionTopBlocker).filter(Boolean)
    : [];
  const ready = source.ready === true && source.canDeclareV1Complete === true;
  const available = Boolean(
    cleanText(source.status) ||
      sanitizeV1SensitiveStatusText(source.conclusion) ||
      sanitizeV1SensitiveStatusText(decisionSource.label) ||
      doneHighlights.length ||
      unfinishedItems.length ||
      releaseGates.length ||
      nextActions.length ||
      topBlockers.length,
  );
  const onsiteTaskCount =
    normalizeNonNegativeInteger(completionSource.onsiteTaskCount ?? completionSource.onsiteTasks) ||
    normalizeNonNegativeInteger(suiteSummary.onsiteTaskCount ?? suiteSummary.onsiteTasks);

  return {
    status:
      cleanText(source.status) ||
      (available ? (ready ? "ready_owner_brief_written" : "blocked_owner_brief_written") : "missing"),
    ready,
    available,
    canDeclareV1Complete: ready,
    generatedAt: cleanText(source.generatedAt),
    conclusion:
      sanitizeV1SensitiveStatusText(source.conclusion) ||
      "当前不能宣布 V1 完成；必须先补齐发布门禁、现场证据、负责人签字和 V1/V2 边界确认。",
    decision: {
      label:
        sanitizeV1SensitiveStatusText(decisionSource.label) ||
        (ready ? "可以宣布 V1 已完成" : "不能宣布 V1 已完成"),
      recommendation:
        sanitizeV1SensitiveStatusText(decisionSource.recommendation) ||
        "先补齐生产环境、现场证据、真实设备 / 真机验收和负责人签字，再重新生成 release candidate。",
      ownerQuestion:
        sanitizeV1SensitiveStatusText(decisionSource.ownerQuestion) ||
        "是否继续按阻塞清单补齐后再评审？",
    },
    completion: {
      requirements: sanitizeV1SensitiveStatusText(completionSource.requirements) || "85-90%",
      p0Prototype: sanitizeV1SensitiveStatusText(completionSource.p0Prototype) || "97-98%",
      v1Readiness: sanitizeV1SensitiveStatusText(completionSource.v1Readiness) || "80-83%",
      releaseGate:
        sanitizeV1SensitiveStatusText(completionSource.releaseGate || completionSource.releaseCandidate) ||
        "0/4 发布门禁通过",
      runtimeReadiness: sanitizeV1SensitiveStatusText(completionSource.runtimeReadiness) || "5/11 通过",
      fieldEvidence:
        sanitizeV1SensitiveStatusText(completionSource.fieldEvidence) ||
        "V1 现场证据清单仍阻塞：证据 0/40，签字 0/6",
      fieldAcceptance: sanitizeV1SensitiveStatusText(completionSource.fieldAcceptance) || "5/11 通过",
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
      sanitizeV1SensitiveStatusText(decisionSource.recommendation) ||
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

export function sanitizeV1TopBlockers(value = []) {
  return Array.isArray(value)
    ? value
        .map((item) => ({
          gate: sanitizeV1SensitiveStatusText(item?.gate),
          key: cleanText(item?.key),
          label: sanitizeV1SensitiveStatusText(item?.label),
          status: cleanText(item?.status),
          detail: sanitizeV1SensitiveStatusText(item?.detail),
        }))
        .filter((item) => item.label)
    : [];
}

export function sanitizeV1ModuleDifferences(value = []) {
  return Array.isArray(value)
    ? value
        .map((item) => ({
          module: sanitizeV1SensitiveStatusText(item?.module),
          v1: sanitizeV1SensitiveStatusText(item?.v1),
          v2: sanitizeV1SensitiveStatusText(item?.v2),
        }))
        .filter((item) => item.module || item.v2)
    : [];
}

export function sanitizeV1StatusTextList(value = []) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return raw.map((item) => sanitizeV1SensitiveStatusText(item)).filter(Boolean);
}

function sanitizeV1ReleaseGate(value = {}) {
  if (!isPlainObject(value)) return null;
  return {
    key: cleanText(value.key),
    label: sanitizeV1SensitiveStatusText(value.label),
    status: normalizeV1GoLiveStatus(value.status),
    ready: value.ready === true,
    summary: sanitizeV1SensitiveStatusText(value.summary),
    detail: sanitizeV1SensitiveStatusText(value.detail),
  };
}

function sanitizeV1ModuleCompletionRow(value = {}) {
  if (!isPlainObject(value)) return null;
  const module = sanitizeV1SensitiveStatusText(value.module);
  if (!module) return null;
  return {
    module,
    requirementCompletion: sanitizeV1SensitiveStatusText(value.requirementCompletion),
    p0CodeCompletion: sanitizeV1SensitiveStatusText(value.p0CodeCompletion),
    v1Readiness: sanitizeV1SensitiveStatusText(value.v1Readiness),
    currentStatus: sanitizeV1SensitiveStatusText(value.currentStatus),
    remaining: sanitizeV1SensitiveStatusText(value.remaining),
  };
}

function sanitizeV1OwnerDecisionItem(value = {}) {
  if (!isPlainObject(value)) return null;
  const label = sanitizeV1SensitiveStatusText(value.label);
  if (!label) return null;
  return {
    type: cleanText(value.type),
    label,
    detail: sanitizeV1SensitiveStatusText(value.detail),
  };
}

function sanitizeV1OwnerDecisionGate(value = {}) {
  if (!isPlainObject(value)) return null;
  const label = sanitizeV1SensitiveStatusText(value.label);
  if (!label) return null;
  return {
    label,
    status: cleanText(value.status) || "blocked",
    summary: sanitizeV1SensitiveStatusText(value.summary),
    detail: sanitizeV1SensitiveStatusText(value.detail),
  };
}

function sanitizeV1OwnerDecisionBlockerGroup(value = {}) {
  if (!isPlainObject(value)) return null;
  const gate = sanitizeV1SensitiveStatusText(value.gate);
  if (!gate) return null;
  return {
    gate,
    count: normalizeNonNegativeInteger(value.count),
  };
}

function sanitizeV1OwnerDecisionTopBlocker(value = {}) {
  if (!isPlainObject(value)) return null;
  const label = sanitizeV1SensitiveStatusText(value.label);
  if (!label) return null;
  return {
    gate: sanitizeV1SensitiveStatusText(value.gate),
    label,
    status: cleanText(value.status) || "pending",
    detail: sanitizeV1SensitiveStatusText(value.detail),
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
