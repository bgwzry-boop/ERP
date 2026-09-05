import { createLazyApiClient } from "./createLazyApiClient.js";

const lazyApiCall = createLazyApiClient(() => import("./officeV1GoLiveStatusApiClient.js"));

export const applyOfficeV1ProductionFirstStageValues = lazyApiCall("applyOfficeV1ProductionFirstStageValues");
export const generateOfficeV1FieldEvidenceDraftManifest = lazyApiCall("generateOfficeV1FieldEvidenceDraftManifest");
export const getOfficeV1GoLiveStatus = lazyApiCall("getOfficeV1GoLiveStatus");
export const precheckOfficeV1AttachmentRetention = lazyApiCall("precheckOfficeV1AttachmentRetention");
export const precheckOfficeV1DriverReadiness = lazyApiCall("precheckOfficeV1DriverReadiness");
export const precheckOfficeV1Persistence = lazyApiCall("precheckOfficeV1Persistence");
export const precheckOfficeV1ProductionEnv = lazyApiCall("precheckOfficeV1ProductionEnv");
export const precheckOfficeV1ProductionEnvFileAudit = lazyApiCall("precheckOfficeV1ProductionEnvFileAudit");
export const precheckOfficeV1ProductionEnvFilePreview = lazyApiCall("precheckOfficeV1ProductionEnvFilePreview");
export const precheckOfficeV1ProductionEnvIntake = lazyApiCall("precheckOfficeV1ProductionEnvIntake");
export const precheckOfficeV1ProductionFirstStageValuesDryRun = lazyApiCall("precheckOfficeV1ProductionFirstStageValuesDryRun");
export const precheckOfficeV1ProductionGoLive = lazyApiCall("precheckOfficeV1ProductionGoLive");
export const precheckOfficeV1ReleaseCandidateRefresh = lazyApiCall("precheckOfficeV1ReleaseCandidateRefresh");
export const precheckOfficeV1RuntimeReadiness = lazyApiCall("precheckOfficeV1RuntimeReadiness");
export const precheckOfficeV1V2Boundary = lazyApiCall("precheckOfficeV1V2Boundary");
export const refreshOfficeV1ReleaseCandidate = lazyApiCall("refreshOfficeV1ReleaseCandidate");
export const refreshOfficeV1V2ScopeBrief = lazyApiCall("refreshOfficeV1V2ScopeBrief");
export const runOfficeV1ProductionEnvSetup = lazyApiCall("runOfficeV1ProductionEnvSetup");
export const runOfficeV1ProductionFirstStageExecution = lazyApiCall("runOfficeV1ProductionFirstStageExecution");
export const runOfficeV1ProductionPersistenceEvidence = lazyApiCall("runOfficeV1ProductionPersistenceEvidence");
export const stageOfficeV1FieldEvidenceIntakeRow = lazyApiCall("stageOfficeV1FieldEvidenceIntakeRow");
export const validateOfficeV1FieldEvidenceDraftManifest = lazyApiCall("validateOfficeV1FieldEvidenceDraftManifest");
