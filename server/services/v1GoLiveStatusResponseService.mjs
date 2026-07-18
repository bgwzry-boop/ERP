import {
  buildV1FieldEvidenceDraftFreshness,
  sanitizeV1FieldEvidenceIntakeGuidance,
  sanitizeV1FieldEvidenceIntakeQuality,
  sanitizeV1FieldEvidenceProgress,
} from "./v1FieldEvidenceProjectionService.mjs";
import { sanitizeV1SensitiveStatusText } from "./v1StatusTextSanitizer.mjs";
import {
  sanitizeV1ProductionEnvFillTemplate,
  sanitizeV1ProductionEnvFixChecklist,
  sanitizeV1ProductionEnvGate,
  sanitizeV1ProductionEnvIntakeVerification,
  sanitizeV1ProductionFirstStageExecution,
  sanitizeV1ProductionPersistenceEvidence,
  sanitizeV1TodoLoadPrecheck,
} from "./v1ProductionStatusProjectionService.mjs";
import { buildV1D49Readiness } from "./v1D49ReadinessService.mjs";
import {
  normalizeV1GoLiveStatus,
  sanitizeV1GoLiveSummary,
  sanitizeV1ModuleCompletion,
  sanitizeV1ModuleDifferences,
  sanitizeV1OwnerDecisionBrief,
  sanitizeV1ReleaseCandidate,
  sanitizeV1StatusTextList,
  sanitizeV1TopBlockers,
} from "./v1ReleaseStatusProjectionService.mjs";
import {
  sanitizeV1RoleTaskBoard,
  sanitizeV1UnblockPlan,
  sanitizeV1V2BoundaryBrief,
} from "./v1FieldCoordinationProjectionService.mjs";
import {
  buildV1CompletionAudit,
  sanitizeV1FieldAcceptanceReport,
  sanitizeV1RuntimeReadinessBlockers,
} from "./v1CompletionAuditProjectionService.mjs";

export function createV1GoLiveStatusResponseService({
  readStatusArtifacts,
  buildD49Readiness = buildV1D49Readiness,
  buildProductionEnvValuesFragmentSourceStatus,
  buildProductionEnvValuesApplyGateStatus,
  now = () => new Date(),
} = {}) {
  requireFunction(readStatusArtifacts, "readStatusArtifacts");
  requireFunction(buildD49Readiness, "buildD49Readiness");
  requireFunction(
    buildProductionEnvValuesFragmentSourceStatus,
    "buildProductionEnvValuesFragmentSourceStatus",
  );
  requireFunction(buildProductionEnvValuesApplyGateStatus, "buildProductionEnvValuesApplyGateStatus");
  requireFunction(now, "now");

  return { build };

  function build({ workspace, operatorId } = {}) {
    const checkedAt = now().toISOString();
    const artifacts = readStatusArtifacts();
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
    const todoLoadPrecheck = sanitizeV1TodoLoadPrecheck(artifacts.todoLoadPrecheck.value, { now: checkedAt });
    const productionEnvValuesFragmentSourceStatus = buildProductionEnvValuesFragmentSourceStatus({
      productionEnvIntakeVerification,
    });
    const productionEnvValuesApplyGateStatus = buildProductionEnvValuesApplyGateStatus({
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
    const d49Readiness = buildD49Readiness({ workspace, operatorId });

    return {
      version: "p0-v1-go-live-status-v1",
      scope: "v1_go_live_status",
      status,
      ready,
      canDeclareV1Complete: ready,
      checkedAt,
      generatedAt: cleanText(suite.generatedAt || completion.generatedAt || v1V2Scope.generatedAt),
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
      todoLoadPrecheck,
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
        rawTodoLoadPrecheckIncluded: false,
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
}

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
}

function cleanText(value) {
  return String(value ?? "").trim();
}
