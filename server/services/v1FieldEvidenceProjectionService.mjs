import { createHash } from "node:crypto";
import { sanitizeV1RoleTaskActionText } from "./v1StatusTextSanitizer.mjs";

export function sanitizeV1FieldEvidenceProgress(
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
  const groupRows = groups.slice(0, 7);
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

export function buildV1SignoffBoundarySummaryForStatus({
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

export function sanitizeV1FieldEvidenceIntakeGuidance(
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

export function summarizeV1FieldEvidenceIntakeRows(csvText) {
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

export function summarizeV1FieldEvidenceIntakeSignoffRows(csvText) {
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

export function normalizeV1FieldEvidenceDraftManifestStatus(artifact = {}) {
  const status = cleanServerText(artifact.status);
  if (status === "loaded") return "available";
  if (status === "invalid") return "invalid";
  return "missing";
}

export function buildV1FieldEvidenceDraftFreshness(
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

export function formatV1FieldEvidenceDraftFreshnessLabel(status) {
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

export function sanitizeV1FieldEvidenceIntakeQuality(
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

export function parseV1FieldEvidenceMissingItems(csvText, fallback = {}) {
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

export function parseV1FieldEvidenceSignoffBoundaryActions(csvText, fallback = {}) {
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

export function buildV1FieldEvidenceGroupSummariesForStatus(groups = [], missingItems = []) {
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

export function sanitizeV1FieldEvidenceGroup(value = {}) {
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

export function sanitizeV1FieldEvidenceSignoff(value = {}) {
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

export function sanitizeV1FieldEvidenceBoundary(value = {}) {
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

function cleanServerText(value) {
  return String(value ?? "").trim();
}

function normalizeV1NonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function isPlainServerObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
