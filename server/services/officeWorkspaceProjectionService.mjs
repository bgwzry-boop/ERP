const officeWorkspaceProjectionCollectionKeys = Object.freeze([
  "customers",
  "orderLines",
  "inventories",
  "todos",
  "fulfillments",
  "statements",
  "statementLines",
  "statementSendRecords",
  "statementConfirmationRecords",
  "operationLogs",
]);

const sensitiveKeyPattern =
  /(?:password|secret|token|authorization|connectionstring|databaseurl|accesskey|privatekey)/i;

export function isOfficeWorkspaceProjectionEnabled(workspace = {}) {
  const mode = cleanText(workspace.runtimeConfig?.mode).toLowerCase();
  return workspace.runtimeConfig?.production !== true && mode !== "production";
}

export function buildOfficeWorkspaceProjection(workspace = {}) {
  const projection = {
    projectionVersion: "office-workspace-legacy-v1",
    runtime: {
      mode: cleanText(workspace.runtimeConfig?.mode) || "demo",
      production: workspace.runtimeConfig?.production === true,
      backendAuthenticated: true,
    },
  };
  for (const key of officeWorkspaceProjectionCollectionKeys) {
    projection[key] = sanitizeProjectionValue(
      Array.isArray(workspace[key]) ? workspace[key] : [],
    );
  }
  return projection;
}

function sanitizeProjectionValue(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeProjectionValue(item));
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (sensitiveKeyPattern.test(key.replace(/[^a-z0-9]/gi, ""))) continue;
    if (typeof nestedValue === "function") continue;
    result[key] = sanitizeProjectionValue(nestedValue);
  }
  return result;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
