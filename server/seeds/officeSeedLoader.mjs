import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import { loadSyntheticOfficeSeed } from "./syntheticOfficeSeed.mjs";

export const officeSeedSourceKeys = Object.freeze(["synthetic", "real_sample"]);

export const realSampleCoverageKeys = Object.freeze([
  "stock_in",
  "stock_out",
  "custom_print",
  "express_ltl",
  "delivery",
  "pickup",
  "quantity_variance",
  "statement_payment_variance",
]);

const realSampleSchemaVersion = "erp-real-sample-office-seed-v1";
const maxRealSampleFileBytes = 2 * 1024 * 1024;

export function loadOfficeSeedWorkspace(options = {}) {
  if (normalizeText(options.runtimeMode).toLowerCase() === "production") {
    if (
      normalizeText(options.source) ||
      normalizeText(options.scenarioId) ||
      normalizeText(options.realSampleSeedFile) ||
      normalizeText(options.env?.ERP_OFFICE_SEED_SOURCE) ||
      normalizeText(options.env?.ERP_SCENARIO_ID) ||
      normalizeText(options.env?.ERP_REAL_SAMPLE_SEED_FILE)
    ) {
      throw createSeedError(
        "ERP_PRODUCTION_SEED_NOT_ALLOWED",
        "Production runtime cannot load an office scenario or seed dataset.",
      );
    }
    return createEmptyProductionWorkspace();
  }
  const source = normalizeOfficeSeedSource(options.source ?? options.env?.ERP_OFFICE_SEED_SOURCE);
  if (source === "synthetic") {
    return {
      ...loadSyntheticOfficeSeed(options.scenarioId),
      seedDataset: { source: "synthetic", datasetId: "p0-synthetic-fixtures" },
    };
  }
  return loadRealSampleOfficeSeed(options);
}

function createEmptyProductionWorkspace() {
  return {
    scenario: { id: "", label: "" },
    seedDataset: { source: "none", datasetId: "" },
    customers: [],
    orderLines: [],
    inventories: [],
    orderDrafts: [],
    initialOrderDrafts: [],
    todos: [],
    fulfillments: [],
    statements: [],
    initialDriverDeliveryDispatches: [],
    initialRawMaterialInbounds: [],
    initialRawMaterialSupplierStatementReviews: [],
    initialMaintenanceTasks: [],
    sampleText: "",
    defaultSelections: {},
  };
}

export function loadRealSampleOfficeSeed(options = {}) {
  const payload = readRealSamplePayload(options);
  const dataset = validateRealSamplePayload(payload);
  return {
    ...dataset.workspace,
    seedDataset: {
      source: "real_sample",
      datasetId: dataset.datasetId,
      caseCount: dataset.caseCount,
      sourceMessageCount: dataset.sourceMessageCount,
      coverageKeys: dataset.coverageKeys,
    },
  };
}

export function normalizeOfficeSeedSource(value) {
  const normalized = normalizeText(value).toLowerCase().replaceAll("-", "_");
  if (!normalized || normalized === "synthetic") return "synthetic";
  if (["real", "real_sample", "realsample"].includes(normalized)) return "real_sample";
  throw createSeedError(
    "ERP_OFFICE_SEED_SOURCE_INVALID",
    "Office seed source must be synthetic or real_sample.",
  );
}

function readRealSamplePayload(options) {
  const sourceFile = normalizeText(options.realSampleSeedFile ?? options.env?.ERP_REAL_SAMPLE_SEED_FILE);
  if (!sourceFile) {
    throw createSeedError(
      "ERP_REAL_SAMPLE_SEED_FILE_REQUIRED",
      "A private real-sample seed file is required when ERP_OFFICE_SEED_SOURCE=real_sample.",
    );
  }

  let actualPath;
  try {
    actualPath = realpathSync(resolve(sourceFile));
  } catch {
    throw createSeedError(
      "ERP_REAL_SAMPLE_SEED_FILE_UNAVAILABLE",
      "The configured real-sample seed file is unavailable.",
    );
  }

  assertRealSamplePathAllowed(actualPath, options.projectRoot);
  let stats;
  try {
    stats = statSync(actualPath);
  } catch {
    throw createSeedError(
      "ERP_REAL_SAMPLE_SEED_FILE_UNAVAILABLE",
      "The configured real-sample seed file is unavailable.",
    );
  }
  if (!stats.isFile() || stats.size <= 0 || stats.size > maxRealSampleFileBytes) {
    throw createSeedError(
      "ERP_REAL_SAMPLE_SEED_FILE_INVALID",
      "The real-sample seed file must be a non-empty private JSON document within the size limit.",
    );
  }
  if ((stats.mode & 0o077) !== 0) {
    throw createSeedError(
      "ERP_REAL_SAMPLE_SEED_FILE_NOT_PRIVATE",
      "The real-sample seed file must be restricted to its owner.",
    );
  }

  try {
    return JSON.parse(readFileSync(actualPath, "utf8"));
  } catch {
    throw createSeedError(
      "ERP_REAL_SAMPLE_SEED_JSON_INVALID",
      "The real-sample seed file must contain valid JSON.",
    );
  }
}

function assertRealSamplePathAllowed(actualPath, projectRoot) {
  const root = resolve(projectRoot ?? process.cwd());
  const privateWorkspaceRoot = resolve(root, ".erp-local-storage", "real-samples");
  if (isPathWithin(root, actualPath) && !isPathWithin(privateWorkspaceRoot, actualPath)) {
    throw createSeedError(
      "ERP_REAL_SAMPLE_SEED_PATH_RESTRICTED",
      "Real-sample seed data must stay outside the repository or under the private runtime sample directory.",
    );
  }
}

function validateRealSamplePayload(payload) {
  assertPlainObject(payload, "ERP_REAL_SAMPLE_SEED_SCHEMA_INVALID", "The real-sample seed document must be an object.");
  if (payload.schemaVersion !== realSampleSchemaVersion) {
    throw createSeedError(
      "ERP_REAL_SAMPLE_SEED_SCHEMA_INVALID",
      "The real-sample seed document has an unsupported schema version.",
    );
  }
  if (payload.sourceKind !== "confirmed_anonymized_real_sample") {
    throw createSeedError(
      "ERP_REAL_SAMPLE_SEED_SOURCE_INVALID",
      "The real-sample seed document must be confirmed and anonymized.",
    );
  }
  const datasetId = assertSafeIdentifier(payload.datasetId, "dataset");
  const caseSummary = validateRealSampleCases(payload.cases);
  assertNoDirectIdentifiers(payload);
  return {
    datasetId,
    caseCount: caseSummary.caseCount,
    sourceMessageCount: caseSummary.sourceMessageCount,
    coverageKeys: caseSummary.coverageKeys,
    workspace: normalizeWorkspace(payload.workspace, datasetId),
  };
}

function validateRealSampleCases(cases) {
  if (!Array.isArray(cases) || cases.length < 20 || cases.length > 50) {
    throw createSeedError(
      "ERP_REAL_SAMPLE_SEED_CASE_COUNT_INVALID",
      "The real-sample seed document must contain 20 to 50 confirmed cases.",
    );
  }
  const caseIds = new Set();
  const messageIds = new Set();
  const coverage = new Set();
  let sourceMessageCount = 0;
  for (const item of cases) {
    assertPlainObject(item, "ERP_REAL_SAMPLE_SEED_CASE_INVALID", "Every real-sample case must be an object.");
    const caseId = assertSafeIdentifier(item.id, "case");
    if (caseIds.has(caseId)) {
      throw createSeedError("ERP_REAL_SAMPLE_SEED_CASE_INVALID", "Real-sample case identifiers must be unique.");
    }
    caseIds.add(caseId);
    if (!Array.isArray(item.coverage) || item.coverage.length === 0) {
      throw createSeedError("ERP_REAL_SAMPLE_SEED_CASE_INVALID", "Every real-sample case must declare coverage.");
    }
    for (const key of item.coverage) {
      if (!realSampleCoverageKeys.includes(key)) {
        throw createSeedError("ERP_REAL_SAMPLE_SEED_CASE_INVALID", "A real-sample case declares unsupported coverage.");
      }
      coverage.add(key);
    }
    if (!Array.isArray(item.messages) || item.messages.length === 0) {
      throw createSeedError("ERP_REAL_SAMPLE_SEED_CASE_INVALID", "Every real-sample case must retain source messages.");
    }
    for (const message of item.messages) {
      sourceMessageCount += 1;
      assertPlainObject(message, "ERP_REAL_SAMPLE_SEED_CASE_INVALID", "A real-sample source message is invalid.");
      const messageId = assertSafeIdentifier(message.id, "message");
      if (messageIds.has(messageId)) {
        throw createSeedError("ERP_REAL_SAMPLE_SEED_CASE_INVALID", "Real-sample source message identifiers must be unique.");
      }
      messageIds.add(messageId);
      if (!["customer", "office", "warehouse", "workshop", "driver", "finance"].includes(message.senderRole)) {
        throw createSeedError("ERP_REAL_SAMPLE_SEED_CASE_INVALID", "A real-sample source message has an unsupported sender role.");
      }
      if (!normalizeText(message.sentAt) || !normalizeText(message.text)) {
        throw createSeedError("ERP_REAL_SAMPLE_SEED_CASE_INVALID", "A real-sample source message must retain time and text evidence.");
      }
    }
  }
  if (realSampleCoverageKeys.some((key) => !coverage.has(key))) {
    throw createSeedError(
      "ERP_REAL_SAMPLE_SEED_COVERAGE_INCOMPLETE",
      "The real-sample seed document does not cover every required V1 scenario.",
    );
  }
  return {
    caseCount: cases.length,
    sourceMessageCount,
    coverageKeys: realSampleCoverageKeys.filter((key) => coverage.has(key)),
  };
}

function normalizeWorkspace(value, datasetId) {
  assertPlainObject(value, "ERP_REAL_SAMPLE_SEED_WORKSPACE_INVALID", "The real-sample seed workspace must be an object.");
  const collections = [
    "customers",
    "orderLines",
    "inventories",
    "orderDrafts",
    "todos",
    "fulfillments",
    "statements",
    "initialRawMaterialInbounds",
  ];
  const workspace = {};
  for (const key of collections) {
    if (!Array.isArray(value[key])) {
      throw createSeedError("ERP_REAL_SAMPLE_SEED_WORKSPACE_INVALID", `The real-sample workspace is missing ${key}.`);
    }
    workspace[key] = structuredClone(value[key]);
    assertUniqueRecordIds(workspace[key], key);
  }
  if (
    workspace.customers.length === 0
    || workspace.orderLines.length === 0
    || workspace.inventories.length === 0
    || workspace.todos.length === 0
    || workspace.fulfillments.length === 0
    || workspace.statements.length === 0
  ) {
    throw createSeedError(
      "ERP_REAL_SAMPLE_SEED_WORKSPACE_INVALID",
      "The real-sample workspace must retain the core office records used for workflow validation.",
    );
  }
  assertPlainObject(value.scenario, "ERP_REAL_SAMPLE_SEED_WORKSPACE_INVALID", "The real-sample workspace is missing a scenario.");
  workspace.scenario = {
    ...structuredClone(value.scenario),
    id: assertSafeIdentifier(value.scenario.id ?? datasetId, "scenario"),
  };
  workspace.initialOrderDrafts = workspace.orderDrafts;
  workspace.sampleText = typeof value.sampleText === "string" ? value.sampleText : "";
  workspace.defaultSelections = normalizeDefaultSelections(value.defaultSelections, workspace);
  return workspace;
}

function normalizeDefaultSelections(value, workspace) {
  const defaults = isPlainObject(value) ? value : {};
  return {
    todoId: normalizeSelection(defaults.todoId, workspace.todos),
    orderId: normalizeSelection(defaults.orderId, workspace.orderLines),
    stockId: normalizeSelection(defaults.stockId, workspace.inventories),
    fulfillmentId: normalizeSelection(defaults.fulfillmentId, workspace.fulfillments),
    statementId: normalizeSelection(defaults.statementId, workspace.statements),
    rawMaterialInboundId: normalizeSelection(defaults.rawMaterialInboundId, workspace.initialRawMaterialInbounds),
  };
}

function normalizeSelection(value, records) {
  const candidate = normalizeText(value);
  if (candidate && records.some((item) => item.id === candidate)) return candidate;
  return normalizeText(records[0]?.id);
}

function assertUniqueRecordIds(records, label) {
  const ids = new Set();
  for (const record of records) {
    assertPlainObject(record, "ERP_REAL_SAMPLE_SEED_WORKSPACE_INVALID", `Every ${label} record must be an object.`);
    const id = normalizeText(record.id);
    if (!id || id.length > 256 || containsControlCharacter(id)) {
      throw createSeedError("ERP_REAL_SAMPLE_SEED_WORKSPACE_INVALID", `A real-sample ${label} record identifier is invalid.`);
    }
    if (ids.has(id)) {
      throw createSeedError("ERP_REAL_SAMPLE_SEED_WORKSPACE_INVALID", `Real-sample ${label} record identifiers must be unique.`);
    }
    ids.add(id);
  }
}

function assertNoDirectIdentifiers(value) {
  const serialized = JSON.stringify(value);
  const patterns = [
    /(?:\+?86[- ]?)?1[3-9]\d{9}/,
    /\b\d{15,18}[0-9Xx]\b/,
    /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    /\u5f20\u4e09\u670d\u9970|\u7f8e\u7684\u7a7a\u8c03|\u767d\u9cb8\u81ea\u8425\u5e97/,
  ];
  if (patterns.some((pattern) => pattern.test(serialized))) {
    throw createSeedError(
      "ERP_REAL_SAMPLE_SEED_IDENTIFIER_DETECTED",
      "The real-sample seed document contains a direct identity identifier or prototype customer identity.",
    );
  }
}

function assertSafeIdentifier(value, label) {
  const normalized = normalizeText(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(normalized)) {
    throw createSeedError("ERP_REAL_SAMPLE_SEED_SCHEMA_INVALID", `The ${label} identifier is invalid.`);
  }
  return normalized;
}

function assertPlainObject(value, code, message) {
  if (!isPlainObject(value)) throw createSeedError(code, message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPathWithin(root, target) {
  const relativePath = relative(root, target);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function containsControlCharacter(value) {
  return [...value].some((character) => character.codePointAt(0) < 32);
}

function createSeedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
