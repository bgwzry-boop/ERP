import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const defaultProductionEnvSetupJsonPath = ".erp-local-storage/v1-production-env-setup/latest.json";
const setupFreshnessToleranceMs = 2000;

export function resolveProductionEnvSetupEnvFiles({
  envFiles = [],
  productionEnvSetupJsonPath = defaultProductionEnvSetupJsonPath,
  useProductionEnvSetupEnvFile = false,
  noneSummary = "未传入 env 文件",
  cliSummary,
} = {}) {
  if (envFiles.length > 0) {
    return {
      envFiles,
      source: "cli",
      summary: cliSummary || `${envFiles.length} 个命令行 env 文件`,
      usedProductionEnvSetup: false,
    };
  }
  if (!useProductionEnvSetupEnvFile) {
    return {
      envFiles: [],
      source: "none",
      summary: noneSummary,
      usedProductionEnvSetup: false,
    };
  }

  const setupPath = cleanString(productionEnvSetupJsonPath);
  if (!setupPath || !existsSync(resolve(setupPath))) {
    throw new Error(
      "--use-production-env-setup-env-file requires a production env setup report. Run scripts/run-v1-production-env-setup.mjs first or pass --production-env-setup-json.",
    );
  }
  const setup = readJsonFile(setupPath, "V1 production env setup JSON");
  if (setup?.scope !== "v1_production_env_setup") {
    throw new Error("V1 production env setup JSON has an unexpected shape.");
  }
  const envFilePath = cleanString(setup.envFile?.path);
  if (!envFilePath) {
    throw new Error("V1 production env setup report does not include an env file path.");
  }
  if (setup.setupReady !== true) {
    throw new Error("V1 production env setup report is not setupReady; rerun the setup tool before reusing its env file.");
  }
  if (setup.envFile?.gitIgnored !== true || setup.envFile?.gitTracked === true) {
    throw new Error("V1 production env setup env file is not confirmed as git-ignored and untracked.");
  }
  if (setup.envFile?.fileMode && setup.envFile.fileMode !== "600") {
    throw new Error("V1 production env setup env file is not mode 600.");
  }
  const resolvedEnvFilePath = resolve(envFilePath);
  if (!existsSync(resolvedEnvFilePath)) {
    throw new Error("V1 production env setup env file is missing.");
  }
  const envFileStats = statSync(resolvedEnvFilePath);
  assertProductionEnvSetupReportFresh({ setup, envFileStats });

  return {
    envFiles: [resolvedEnvFilePath],
    source: "production_env_setup",
    summary: "已复用生产 env setup 报告中的安全 env 文件",
    usedProductionEnvSetup: true,
    productionEnvSetupReportFresh: true,
    productionEnvSetupCheckedAt: cleanString(setup.checkedAt),
  };
}

export function productionEnvFileSourceLabel(source) {
  if (source === "production_env_setup") return "生产 env setup 安全文件";
  if (source === "cli") return "命令行安全 env 文件";
  return "未传入 env 文件";
}

function readJsonFile(filePath, label) {
  try {
    return JSON.parse(readFileSync(resolve(filePath), "utf8"));
  } catch (error) {
    throw new Error(`${label} could not be read as JSON: ${error?.message || String(error)}`);
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function assertProductionEnvSetupReportFresh({ setup, envFileStats }) {
  const checkedAt = cleanString(setup?.checkedAt);
  const setupCheckedAtMs = Date.parse(checkedAt);
  if (!checkedAt || !Number.isFinite(setupCheckedAtMs)) {
    throw new Error("V1 production env setup report does not include a valid checkedAt; rerun the setup tool before reusing its env file.");
  }
  const envFileMtimeMs = Number(envFileStats?.mtimeMs);
  if (Number.isFinite(envFileMtimeMs) && envFileMtimeMs - setupCheckedAtMs > setupFreshnessToleranceMs) {
    throw new Error("V1 production env setup report is stale because the safe env file changed after setup; rerun the setup tool before reusing its env file.");
  }
}
