import { chmodSync, existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import {
  loadOfficeSeedWorkspace,
  realSampleCoverageKeys,
} from "./officeSeedLoader.mjs";

export const realSampleSeedTemplateVersion = "erp-real-sample-office-seed-v1";
export const defaultRealSampleSeedTemplatePath = ".erp-local-storage/real-samples/real-sample-seed.template.json";

export function createRealSampleSeedTemplate(options = {}) {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const outputFile = resolve(options.outputFile ?? defaultRealSampleSeedTemplatePath);
  assertPrivateTemplatePath(outputFile, projectRoot);
  if (existsSync(outputFile)) {
    throw createIntakeError("REAL_SAMPLE_TEMPLATE_EXISTS", "The private real-sample template already exists and was not replaced.");
  }
  const outputDir = dirname(outputFile);
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  chmodSync(outputDir, 0o700);
  writeFileSync(outputFile, `${JSON.stringify(buildRealSampleSeedTemplate(), null, 2)}\n`, { mode: 0o600, flag: "wx" });
  chmodSync(outputFile, 0o600);
  return {
    version: "real-sample-seed-intake-v1",
    scope: "real_sample_seed_template",
    status: "written",
    ready: false,
    summary: {
      requiredCaseMin: 20,
      requiredCaseMax: 50,
      requiredCoverageCount: realSampleCoverageKeys.length,
      templateContainsBusinessData: false,
    },
    safeguards: buildSafeguards({ outputWritten: true }),
  };
}

export function buildRealSampleSeedTemplate() {
  return {
    schemaVersion: realSampleSeedTemplateVersion,
    sourceKind: "confirmed_anonymized_real_sample",
    datasetId: "replace-with-safe-dataset-id",
    cases: [],
    workspace: {
      scenario: {
        id: "replace-with-safe-scenario-id",
        label: "",
      },
      customers: [],
      orderLines: [],
      inventories: [],
      orderDrafts: [],
      todos: [],
      fulfillments: [],
      statements: [],
      initialRawMaterialInbounds: [],
      sampleText: "",
      defaultSelections: {},
    },
  };
}

export function precheckRealSampleOfficeSeed(options = {}) {
  try {
    const workspace = loadOfficeSeedWorkspace({
      source: "real_sample",
      realSampleSeedFile: options.file,
      runtimeMode: "test",
      projectRoot: options.projectRoot,
    });
    const dataset = workspace.seedDataset ?? {};
    return {
      version: "real-sample-seed-intake-v1",
      scope: "real_sample_seed_precheck",
      status: "ready",
      ready: true,
      summary: {
        datasetId: String(dataset.datasetId ?? ""),
        caseCount: Number(dataset.caseCount ?? 0),
        sourceMessageCount: Number(dataset.sourceMessageCount ?? 0),
        requiredCoverageCount: realSampleCoverageKeys.length,
        coverageKeys: Array.isArray(dataset.coverageKeys) ? [...dataset.coverageKeys] : [],
        workspaceRecordCounts: {
          customers: workspace.customers.length,
          orderLines: workspace.orderLines.length,
          inventories: workspace.inventories.length,
          orderDrafts: workspace.orderDrafts.length,
          todos: workspace.todos.length,
          fulfillments: workspace.fulfillments.length,
          statements: workspace.statements.length,
          rawMaterialInbounds: workspace.initialRawMaterialInbounds.length,
        },
      },
      safeguards: buildSafeguards({}),
    };
  } catch (error) {
    const code = normalizeErrorCode(error?.code);
    return {
      version: "real-sample-seed-intake-v1",
      scope: "real_sample_seed_precheck",
      status: "blocked",
      ready: false,
      error: {
        code,
        message: getErrorMessage(code),
      },
      safeguards: buildSafeguards({}),
    };
  }
}

function assertPrivateTemplatePath(target, projectRoot) {
  const privateRoot = canonicalizePath(resolve(projectRoot, ".erp-local-storage", "real-samples"));
  const canonicalTarget = canonicalizePath(target);
  if (!isPathWithin(privateRoot, canonicalTarget)) {
    throw createIntakeError(
      "REAL_SAMPLE_TEMPLATE_PATH_RESTRICTED",
      "The real-sample template may be written only under the private runtime sample directory.",
    );
  }
}

function canonicalizePath(target) {
  let current = resolve(target);
  const missingSegments = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    missingSegments.unshift(basename(current));
    current = parent;
  }
  return resolve(realpathSync(current), ...missingSegments);
}

function buildSafeguards({ outputWritten = false } = {}) {
  return {
    readOnlyPrecheck: !outputWritten,
    outputWritten,
    outputMode: outputWritten ? "0600" : "not_applicable",
    outputPathIncluded: false,
    sourcePathIncluded: false,
    sourceMessagesIncluded: false,
    customerDataIncluded: false,
    businessDataWritten: false,
    productionSeedAllowed: false,
  };
}

function normalizeErrorCode(value) {
  const code = String(value ?? "").trim();
  return code.startsWith("ERP_REAL_SAMPLE_") ? code : "REAL_SAMPLE_SEED_PRECHECK_FAILED";
}

function getErrorMessage(code) {
  const messages = {
    ERP_REAL_SAMPLE_SEED_FILE_REQUIRED: "未选择私有真实样例JSON。",
    ERP_REAL_SAMPLE_SEED_FILE_UNAVAILABLE: "无法读取私有真实样例JSON。",
    ERP_REAL_SAMPLE_SEED_FILE_NOT_PRIVATE: "真实样例JSON权限不安全，文件必须仅限所有者读取。",
    ERP_REAL_SAMPLE_SEED_PATH_RESTRICTED: "真实样例JSON必须位于仓库外或私有运行时样例目录。",
    ERP_REAL_SAMPLE_SEED_CASE_COUNT_INVALID: "真实样例必须包含20至50个已确认案例。",
    ERP_REAL_SAMPLE_SEED_COVERAGE_INCOMPLETE: "真实样例没有覆盖全部必需业务场景。",
    ERP_REAL_SAMPLE_SEED_IDENTIFIER_DETECTED: "真实样例包含直接身份信息或原型客户身份。",
    ERP_REAL_SAMPLE_SEED_WORKSPACE_INVALID: "真实样例工作区记录不完整或记录标识无效。",
  };
  return messages[code] ?? "真实样例预检未通过，请按受控模板和错误码复核。";
}

function isPathWithin(root, target) {
  const relativePath = relative(root, target);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function createIntakeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
