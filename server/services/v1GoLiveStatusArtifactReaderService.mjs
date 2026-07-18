import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export function createV1GoLiveStatusArtifactReaderService({
  getConfiguredArtifactRoot = () => process.env.ERP_V1_GO_LIVE_ARTIFACT_ROOT,
  getDefaultArtifactRoot = () => join(process.cwd(), ".erp-local-storage"),
  fileExists = existsSync,
  readTextFile = (filePath) => readFileSync(filePath, "utf8"),
} = {}) {
  requireFunction(getConfiguredArtifactRoot, "getConfiguredArtifactRoot");
  requireFunction(getDefaultArtifactRoot, "getDefaultArtifactRoot");
  requireFunction(fileExists, "fileExists");
  requireFunction(readTextFile, "readTextFile");

  return {
    getArtifactRoot,
    readStatusArtifacts,
  };

  function getArtifactRoot() {
    const configuredRoot = String(getConfiguredArtifactRoot() ?? "").trim();
    return resolve(configuredRoot || getDefaultArtifactRoot());
  }

  function readStatusArtifacts() {
    const artifactRoot = getArtifactRoot();
    return {
      completionSnapshot: readJsonArtifact({
        key: "completionSnapshot",
        label: "V1 完成度快照",
        filePath: join(artifactRoot, "v1-completion-snapshot", "latest.json"),
      }),
      goLiveSuite: readJsonArtifact({
        key: "goLiveSuite",
        label: "V1 go-live suite",
        filePath: join(artifactRoot, "v1-go-live-suite", "latest.json"),
      }),
      releaseCandidate: readJsonArtifact({
        key: "releaseCandidate",
        label: "V1 发布候选报告",
        filePath: join(artifactRoot, "v1-release-candidate", "latest.json"),
      }),
      fieldAcceptanceReport: readFirstJsonArtifact({
        key: "fieldAcceptanceReport",
        label: "V1 现场验收报告",
        filePaths: [
          join(artifactRoot, "v1-release-candidate", "field-acceptance", "latest.json"),
          join(artifactRoot, "v1-field-acceptance", "latest.json"),
        ],
      }),
      unblockPlan: readFirstJsonArtifact({
        key: "unblockPlan",
        label: "V1 最小解除阻塞清单",
        filePaths: [
          join(artifactRoot, "v1-go-live-suite", "v1-unblock-plan.json"),
          join(artifactRoot, "v1-go-live-handoff", "v1-unblock-plan.latest.json"),
        ],
      }),
      fieldEvidenceIntake: readJsonArtifact({
        key: "fieldEvidenceIntake",
        label: "V1 现场证据采集包",
        filePath: join(artifactRoot, "v1-field-evidence-intake", "intake-manifest.json"),
      }),
      fieldEvidenceItemsCsv: readTextArtifact({
        key: "fieldEvidenceItemsCsv",
        label: "V1 现场证据明细 CSV",
        filePath: join(artifactRoot, "v1-field-evidence-intake", "evidence-items.csv"),
      }),
      fieldEvidenceSignoffBoundaryCsv: readTextArtifact({
        key: "fieldEvidenceSignoffBoundaryCsv",
        label: "V1 签字与边界 CSV",
        filePath: join(artifactRoot, "v1-field-evidence-intake", "signoff-boundary.csv"),
      }),
      fieldEvidenceIntakeRules: readTextArtifact({
        key: "fieldEvidenceIntakeRules",
        label: "V1 现场证据填写规则",
        filePath: join(artifactRoot, "v1-field-evidence-intake", "intake-rules.zh-CN.md"),
      }),
      fieldEvidenceDraftManifest: readJsonArtifact({
        key: "fieldEvidenceDraftManifest",
        label: "V1 现场证据回填草稿",
        filePath: join(artifactRoot, "v1-field-evidence-intake", "filled-manifest.draft.json"),
      }),
      onsiteTaskBoard: readJsonArtifact({
        key: "onsiteTaskBoard",
        label: "V1 现场角色任务清单",
        filePath: join(artifactRoot, "v1-onsite-task-board", "latest.json"),
      }),
      v1V2Scope: readJsonArtifact({
        key: "v1V2Scope",
        label: "V1/V2 差异摘要",
        filePath: join(artifactRoot, "v1-v2-scope-brief", "latest.json"),
      }),
      ownerDecisionBrief: readJsonArtifact({
        key: "ownerDecisionBrief",
        label: "V1 负责人决策摘要",
        filePath: join(artifactRoot, "v1-owner-decision-brief", "latest.json"),
      }),
      productionEnvFillTemplate: readTextArtifact({
        key: "productionEnvFillTemplate",
        label: "生产 env 安全填写草稿",
        filePath: join(artifactRoot, "v1-go-live-handoff", "production-env-fill-template.env.example"),
      }),
      productionEnvMinimumValuesFragmentTemplate: readTextArtifact({
        key: "productionEnvMinimumValuesFragmentTemplate",
        label: "生产 env 最小真实值片段模板",
        filePath: join(
          artifactRoot,
          "v1-go-live-handoff",
          "production-env-minimum-values-fragment.template.env.example",
        ),
      }),
      productionEnvIntakeVerification: readFirstJsonArtifact({
        key: "productionEnvIntakeVerification",
        label: "生产 env 真实值校验",
        filePaths: [
          join(artifactRoot, "v1-production-env-intake-verify", "latest.json"),
          join(artifactRoot, "v1-go-live-handoff", "production-env-intake-verify.latest.json"),
        ],
      }),
      productionPersistenceEvidence: readFirstJsonArtifact({
        key: "productionPersistenceEvidence",
        label: "生产持久化留证",
        filePaths: [
          join(artifactRoot, "v1-production-persistence-evidence", "latest.json"),
          join(artifactRoot, "v1-go-live-handoff", "production-persistence-evidence.latest.json"),
          join(artifactRoot, "v1-go-live-suite", "go-live-handoff", "production-persistence-evidence.latest.json"),
        ],
      }),
      productionFirstStageExecution: readFirstJsonArtifact({
        key: "productionFirstStageExecution",
        label: "生产环境 / 持久化第一阶段执行",
        filePaths: [
          join(artifactRoot, "v1-production-first-stage-execution", "latest.json"),
          join(artifactRoot, "v1-go-live-handoff", "production-first-stage-execution.latest.json"),
          join(artifactRoot, "v1-go-live-suite", "go-live-handoff", "production-first-stage-execution.latest.json"),
        ],
      }),
      todoLoadPrecheck: readFirstJsonArtifact({
        key: "todoLoadPrecheck",
        label: "生产待办只读容量预检查",
        filePaths: [
          join(artifactRoot, "v1-todo-load-precheck", "latest.json"),
          join(artifactRoot, "v1-go-live-handoff", "todo-load-precheck.latest.json"),
          join(artifactRoot, "v1-go-live-suite", "go-live-handoff", "todo-load-precheck.latest.json"),
        ],
      }),
    };
  }

  function readFirstJsonArtifact({ key, label, filePaths }) {
    let firstInvalidArtifact = null;
    for (const filePath of filePaths) {
      const artifact = readJsonArtifact({ key, label, filePath });
      if (artifact.status === "loaded") return artifact;
      if (artifact.status === "invalid" && !firstInvalidArtifact) firstInvalidArtifact = artifact;
    }
    return firstInvalidArtifact ?? buildUnavailableArtifact({ key, label, status: "missing", reason: "artifact_missing" });
  }

  function readJsonArtifact({ key, label, filePath }) {
    if (!fileExists(filePath)) {
      return buildUnavailableArtifact({ key, label, status: "missing", reason: "artifact_missing" });
    }
    let source;
    try {
      source = readTextFile(filePath);
    } catch {
      return buildUnavailableArtifact({ key, label, status: "invalid", reason: "artifact_read_failed" });
    }
    try {
      return { key, label, status: "loaded", reason: "", value: JSON.parse(source) };
    } catch {
      return buildUnavailableArtifact({ key, label, status: "invalid", reason: "artifact_json_invalid" });
    }
  }

  function readTextArtifact({ key, label, filePath }) {
    if (!fileExists(filePath)) {
      return buildUnavailableArtifact({ key, label, status: "missing", reason: "artifact_missing" });
    }
    try {
      return { key, label, status: "loaded", reason: "", value: readTextFile(filePath) };
    } catch {
      return buildUnavailableArtifact({ key, label, status: "invalid", reason: "artifact_read_failed" });
    }
  }
}

function buildUnavailableArtifact({ key, label, status, reason }) {
  return { key, label, status, reason, value: null };
}

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
}
