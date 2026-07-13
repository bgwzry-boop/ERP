import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { applyV1FieldEvidenceIntakeFromFiles } from "../../scripts/apply-v1-field-evidence-intake.mjs";
import { validateV1FieldEvidenceManifest } from "../../scripts/v1FieldEvidenceManifest.mjs";
import {
  buildV1FieldEvidenceDraftFreshness,
  formatV1FieldEvidenceDraftFreshnessLabel,
} from "./v1FieldEvidenceProjectionService.mjs";

export function createV1FieldEvidenceDraftService({
  applyIntakeFromFiles = applyV1FieldEvidenceIntakeFromFiles,
  validateManifest = validateV1FieldEvidenceManifest,
  getArtifactRoot = defaultArtifactRoot,
  getTemplatePath = defaultTemplatePath,
  now = () => new Date(),
} = {}) {
  requireFunction(applyIntakeFromFiles, "applyIntakeFromFiles");
  requireFunction(validateManifest, "validateManifest");
  requireFunction(getArtifactRoot, "getArtifactRoot");
  requireFunction(getTemplatePath, "getTemplatePath");
  requireFunction(now, "now");

  return { generateDraft, validateDraft };

  function generateDraft({ operatorId }) {
    const checkedAt = now().toISOString();
    const artifactRoot = getArtifactRoot();
    try {
      const intakeDir = join(artifactRoot, "v1-field-evidence-intake");
      const result = applyIntakeFromFiles({
        manifestPath: getTemplatePath(),
        csvPath: join(intakeDir, "evidence-items.csv"),
        signoffBoundaryCsvPath: join(intakeDir, "signoff-boundary.csv"),
        outputPath: join(intakeDir, "filled-manifest.draft.json"),
        writeOutput: true,
      });
      const invalidRowCount = nonNegativeInteger(result.summary?.invalidRowCount);
      return {
        httpStatus: invalidRowCount > 0 ? 422 : 200,
        body: sanitizeV1FieldEvidenceIntakeDraftManifestResult(result, { operatorId, checkedAt }),
      };
    } catch {
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
          safeguards: buildDraftSafeguards({ outputWritten: false }),
        },
      };
    }
  }

  function validateDraft({ operatorId }) {
    const checkedAt = now().toISOString();
    const artifactRoot = getArtifactRoot();
    try {
      const intakeDir = join(artifactRoot, "v1-field-evidence-intake");
      const draftManifestPath = join(intakeDir, "filled-manifest.draft.json");
      const manifest = JSON.parse(readFileSync(draftManifestPath, "utf8"));
      const fieldEvidenceCsvPath = join(intakeDir, "evidence-items.csv");
      const signoffBoundaryCsvPath = join(intakeDir, "signoff-boundary.csv");
      const fieldEvidenceCsv = existsSync(fieldEvidenceCsvPath) ? readFileSync(fieldEvidenceCsvPath, "utf8") : "";
      const signoffBoundaryCsv = existsSync(signoffBoundaryCsvPath)
        ? readFileSync(signoffBoundaryCsvPath, "utf8")
        : "";
      const draftFreshness = buildV1FieldEvidenceDraftFreshness(fieldEvidenceCsv, signoffBoundaryCsv, {
        status: "loaded",
        value: manifest,
      });
      const validation = validateManifest(manifest);
      return {
        httpStatus: validation.schemaValid === false ? 422 : 200,
        body: sanitizeV1FieldEvidenceDraftManifestValidationResult(validation, {
          operatorId,
          checkedAt,
          draftManifestAvailable: true,
          draftFreshness,
        }),
      };
    } catch {
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
          boundary: { status: "pending", label: "待确认", ready: false },
          nextAction: "先生成 manifest 草稿，再执行草稿校验。",
          safeguards: buildValidationSafeguards({ draftManifestAvailable: false }),
        },
      };
    }
  }
}

export function sanitizeV1FieldEvidenceIntakeDraftManifestResult(
  result = {},
  { operatorId, checkedAt } = {},
) {
  const summary = isPlainObject(result.summary) ? result.summary : {};
  const invalidRows = Array.isArray(result.invalidRows)
    ? result.invalidRows.slice(0, 12).map(sanitizeInvalidRow).filter(Boolean)
    : [];
  const outputWritten = result.files?.outputWritten === true;
  const invalidRowCount = nonNegativeInteger(summary.invalidRowCount);
  const status =
    cleanText(result.status) ||
    (invalidRowCount > 0 ? "invalid" : outputWritten ? "blocked_draft_written" : "blocked");
  const ready = result.ready === true;
  return {
    version: "p0-v1-field-evidence-intake-draft-v1",
    scope: "v1_field_evidence_intake_draft_manifest",
    status,
    ready,
    checkedAt: checkedAt || new Date().toISOString(),
    generatedAt: cleanText(result.generatedAt),
    operatorId,
    summary: {
      appliedRowCount: nonNegativeInteger(summary.appliedRowCount),
      appliedEvidenceRowCount: nonNegativeInteger(summary.appliedEvidenceRowCount),
      appliedSignoffRowCount: nonNegativeInteger(summary.appliedSignoffRowCount),
      appliedBoundaryRowCount: nonNegativeInteger(summary.appliedBoundaryRowCount),
      skippedRowCount: nonNegativeInteger(summary.skippedRowCount),
      invalidRowCount,
      evidenceLabel: cleanText(summary.evidence),
      evidenceProgress: cleanText(summary.requiredEvidenceItems) || "0/34",
      signoffProgress: cleanText(summary.signoffs) || "0/6",
      boundaryStatus: cleanText(summary.boundary) || "pending",
      draftManifestStatus: outputWritten ? "available" : "not_written",
      inputSnapshot: isPlainObject(summary.inputSnapshot)
        ? {
            schema: cleanText(summary.inputSnapshot.schema),
            evidenceCsvIncluded: summary.inputSnapshot.evidenceCsvIncluded === true,
            evidenceRowCount: nonNegativeInteger(summary.inputSnapshot.evidenceRowCount),
            signoffBoundaryCsvIncluded: summary.inputSnapshot.signoffBoundaryCsvIncluded === true,
            signoffBoundaryRowCount: nonNegativeInteger(summary.inputSnapshot.signoffBoundaryRowCount),
            rawCsvIncluded: false,
            digestValuesIncluded: false,
          }
        : null,
      releaseCandidateRefreshed: false,
    },
    validation: {
      status: cleanText(result.validation?.status),
      ready: result.validation?.ready === true,
      label: cleanText(result.validation?.summary?.label),
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
    safeguards: buildDraftSafeguards({ outputWritten }),
  };
}

export function sanitizeV1FieldEvidenceDraftManifestValidationResult(
  validation = {},
  { operatorId, checkedAt, draftManifestAvailable = true, draftFreshness = null } = {},
) {
  const summary = isPlainObject(validation.summary) ? validation.summary : {};
  const groups = Array.isArray(validation.groups)
    ? validation.groups.slice(0, 8).map(sanitizeValidationGroup).filter(Boolean)
    : [];
  const signoffs = Array.isArray(validation.signoffs)
    ? validation.signoffs.slice(0, 8).map(sanitizeValidationSignoff).filter(Boolean)
    : [];
  const baseBlockers = Array.isArray(validation.blockers)
    ? validation.blockers.slice(0, 12).map(sanitizeValidationBlocker).filter(Boolean)
    : [];
  const freshness = isPlainObject(draftFreshness) ? draftFreshness : null;
  const freshnessReady = !draftManifestAvailable || freshness?.ready === true;
  const freshnessStatus = cleanText(freshness?.status) || (draftManifestAvailable ? "metadata_missing" : "missing");
  const freshnessLabel =
    cleanText(freshness?.label) || formatV1FieldEvidenceDraftFreshnessLabel(freshnessStatus);
  const freshnessBlocker =
    draftManifestAvailable && freshnessReady !== true
      ? sanitizeValidationBlocker({
          type: "draft_freshness",
          label: "现场证据草稿已过期或缺少输入快照",
          detail: `草稿新鲜度：${freshnessLabel}。`,
          nextAction: "重新生成现场证据 manifest 草稿后，再执行校验和刷新预检。",
        })
      : null;
  const blockers = [freshnessBlocker, ...baseBlockers].filter(Boolean).slice(0, 12);
  const requiredEvidenceItemsCompleted = nonNegativeInteger(summary.requiredEvidenceItemsCompleted);
  const requiredEvidenceItemsTotal = nonNegativeInteger(summary.requiredEvidenceItemsTotal);
  const requiredSignoffsCompleted = nonNegativeInteger(summary.requiredSignoffsCompleted);
  const requiredSignoffsTotal = nonNegativeInteger(summary.requiredSignoffsTotal);
  const evidenceGroupsReady = nonNegativeInteger(summary.evidenceGroupsReady);
  const evidenceGroupsTotal = nonNegativeInteger(summary.evidenceGroupsTotal);
  const blockingIssueCount = nonNegativeInteger(summary.blockingCount) + (freshnessBlocker ? 1 : 0);
  const schemaValid = validation.schemaValid !== false;
  const ready = validation.ready === true && freshnessReady;
  const status = !schemaValid ? "invalid" : ready ? "ready" : freshnessBlocker ? "stale" : "blocked";
  return {
    version: "p0-v1-field-evidence-draft-validation-v1",
    scope: "v1_field_evidence_draft_manifest_validation",
    status,
    ready,
    schemaValid,
    checkedAt: checkedAt || new Date().toISOString(),
    operatorId,
    summary: {
      label: cleanText(summary.label),
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
    boundary: sanitizeValidationBoundary(validation.boundary),
    nextAction: ready
      ? "草稿校验已通过；下一步必须使用安全 env 文件刷新 release candidate 并复核上线门禁。"
      : freshnessBlocker
        ? "草稿结构可读，但不是当前 CSV 生成的版本；请重新生成草稿后再校验。"
        : schemaValid
          ? "草稿格式可读，但现场证据、负责人签字或 V1/V2 边界仍未完成，不能刷新为 READY。"
          : "草稿格式不符合 V1 现场证据 manifest 结构，需重新生成或修正后再校验。",
    safeguards: buildValidationSafeguards({ draftManifestAvailable }),
  };
}

function sanitizeValidationGroup(value = {}) {
  if (!isPlainObject(value)) return null;
  return {
    label: cleanText(value.label),
    ownerRole: cleanText(value.ownerRole),
    status: cleanText(value.status) || (value.ready === true ? "ready" : "blocked"),
    ready: value.ready === true,
    progress: `${nonNegativeInteger(value.completedRequired)}/${nonNegativeInteger(value.requiredTotal)}`,
    blockedRequired: nonNegativeInteger(value.blockedRequired),
  };
}

function sanitizeValidationSignoff(value = {}) {
  if (!isPlainObject(value)) return null;
  return {
    role: cleanText(value.role),
    status: cleanText(value.status),
    ready: value.blocking !== true,
    signerFilled: value.signerFilled === true,
    signedAtFilled: value.signedAtFilled === true,
  };
}

function sanitizeValidationBoundary(value = {}) {
  if (!isPlainObject(value)) return { status: "pending", label: "待确认", ready: false };
  const status = cleanText(value.status) || "pending";
  const ready = value.blocking !== true;
  return {
    status,
    label: status === "confirmed" && ready ? "已确认" : "待确认",
    ready,
    confirmedByFilled: value.confirmedByFilled === true,
    confirmedAtFilled: value.confirmedAtFilled === true,
  };
}

function sanitizeValidationBlocker(value = {}) {
  if (!isPlainObject(value)) return null;
  return {
    type: cleanText(value.type),
    groupLabel: cleanText(value.groupLabel),
    label: cleanText(value.label),
    status: cleanText(value.status),
    reason: cleanText(value.reason),
    nextAction: formatValidationBlockerAction(value),
  };
}

function formatValidationBlockerAction(value = {}) {
  const type = cleanText(value.type);
  if (type === "draft_freshness") return "重新生成现场证据 manifest 草稿后，再执行草稿校验。";
  if (type === "signoff") return "补负责人签字人和签字时间。";
  if (type === "v1_v2_boundary") return "补 V1/V2 边界确认人和确认时间。";
  if (type === "schema") return "重新生成草稿或按 manifest 模板修正结构。";
  return "补现场证据状态和证据编号。";
}

function sanitizeInvalidRow(value = {}) {
  if (!isPlainObject(value)) return null;
  return {
    type: cleanText(value.type),
    row: nonNegativeInteger(value.row),
    groupKey: cleanText(value.groupKey),
    itemKey: cleanText(value.itemKey),
    reason: cleanText(value.reason),
    fixHint: cleanText(value.fixHint),
  };
}

function buildDraftSafeguards({ outputWritten = false } = {}) {
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

function buildValidationSafeguards({ draftManifestAvailable = true } = {}) {
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

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function defaultArtifactRoot() {
  return process.env.ERP_V1_GO_LIVE_ARTIFACT_ROOT
    ? resolve(process.env.ERP_V1_GO_LIVE_ARTIFACT_ROOT)
    : join(process.cwd(), ".erp-local-storage");
}

function defaultTemplatePath() {
  return join(process.cwd(), "docs", "development", "v1-field-evidence-manifest.template.json");
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
