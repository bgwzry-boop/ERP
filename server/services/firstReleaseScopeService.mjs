export const RAW_MATERIAL_FIRST_RELEASE_SCOPE = "raw_material_only";

const disabledScopeValues = new Set(["", "0", "false", "off", "none", "disabled"]);
const rawMaterialScopeValues = new Set([
  "1",
  "true",
  "raw_material",
  "raw_material_only",
  "raw-material",
]);
const writeMethods = new Set(["POST", "PATCH"]);
const rawMaterialInboundActions = new Set([
  "review",
  "print-labels",
  "print_labels",
  "defer-labels",
  "defer_labels",
  "attach-confirm",
  "attach_confirm",
  "void-label",
  "void_label",
  "reprint-label",
  "reprint_label",
  "stage-supplier-return",
  "stage_supplier_return",
  "confirm-supplier-return-shipment",
  "confirm_supplier_return_shipment",
  "issue-to-machine",
  "issue_to_machine",
  "exception",
]);
const rawMaterialSupplierStatementActions = new Set([
  "confirm-review",
  "confirm-statement",
]);

export function resolveFirstReleaseScope(options = {}, env = process.env) {
  const productionRuntime = isProductionRuntime(options, env);
  if (Object.prototype.hasOwnProperty.call(options, "firstReleaseScope")) {
    return requireProductionFirstReleaseScope(
      normalizeFirstReleaseScope(options.firstReleaseScope, "firstReleaseScope"),
      productionRuntime,
    );
  }

  const configuredScope = String(env?.ERP_FIRST_RELEASE_SCOPE ?? "").trim();
  if (configuredScope) {
    return requireProductionFirstReleaseScope(
      normalizeFirstReleaseScope(configuredScope, "ERP_FIRST_RELEASE_SCOPE"),
      productionRuntime,
    );
  }

  if (productionRuntime) throw buildProductionFirstReleaseScopeRequiredError();

  const compatibilityValue = String(env?.ERP_RAW_MATERIAL_FIRST_RELEASE ?? "").trim();
  if (compatibilityValue) {
    return normalizeFirstReleaseScope(compatibilityValue, "ERP_RAW_MATERIAL_FIRST_RELEASE");
  }

  return null;
}

function isProductionRuntime(options, env) {
  const runtimeMode = String(options?.runtimeMode ?? env?.ERP_RUNTIME_MODE ?? "").trim().toLowerCase();
  if (runtimeMode === "production" || runtimeMode === "strict") return true;
  return !runtimeMode && String(env?.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

function requireProductionFirstReleaseScope(scope, productionRuntime) {
  if (productionRuntime && scope !== RAW_MATERIAL_FIRST_RELEASE_SCOPE) {
    throw buildProductionFirstReleaseScopeRequiredError();
  }
  return scope;
}

function buildProductionFirstReleaseScopeRequiredError() {
  const error = new Error(
    "Production API startup requires ERP_FIRST_RELEASE_SCOPE=raw_material while the first rollout is raw-material-only.",
  );
  error.code = "FIRST_RELEASE_SCOPE_REQUIRED";
  return error;
}

export function evaluateFirstReleaseWrite({ scope, method, pathname, body = {} } = {}) {
  const releaseScope = normalizeFirstReleaseScope(scope, "scope");
  const requestMethod = String(method ?? "").trim().toUpperCase();
  const requestPathname = normalizePathname(pathname);

  if (releaseScope !== RAW_MATERIAL_FIRST_RELEASE_SCOPE) {
    return { allowed: true, scope: releaseScope, writePolicy: "unrestricted" };
  }

  if (!writeMethods.has(requestMethod)) {
    return {
      allowed: true,
      scope: releaseScope,
      writePolicy: "allowlist",
      allowedBusinessDomain: "raw_material",
    };
  }

  const allowed = isOperationalWrite(requestPathname)
    || isRawMaterialFirstReleaseWrite(requestMethod, requestPathname, body);
  return {
    allowed,
    scope: releaseScope,
    writePolicy: "allowlist",
    allowedBusinessDomain: "raw_material",
  };
}

export function buildFirstReleaseBlockedResponse(scope) {
  const releaseScope = normalizeFirstReleaseScope(scope, "scope");
  return {
    code: "FIRST_RELEASE_SCOPE_BLOCKED",
    message: "当前正式系统处于原材料首发模式，此业务写接口暂未开放。",
    releaseScope,
    allowedBusinessDomain: "raw_material",
  };
}

function isOperationalWrite(pathname) {
  return (
    /^\/api\/(?:auth|system)(?:\/|$)/.test(pathname) ||
    /^\/api\/master-data\/personnel(?:\/|$)/.test(pathname)
  );
}

function isRawMaterialFirstReleaseWrite(method, pathname, body = {}) {
  if (method !== "POST") return false;
  if (pathname === "/api/raw-material-inbounds/recognize-delivery-note") return true;
  if (pathname === "/api/raw-material-inbounds/ocr-jobs") return true;
  if (/^\/api\/raw-material-inbounds\/ocr-jobs\/[^/]+\/(?:status|retry)$/u.test(pathname)) return true;
  if (
    pathname === "/api/attachments/binary" &&
    String(body.ownerType ?? "").trim() === "raw_material_inbound_capture" &&
    String(body.purpose ?? "").trim() === "raw_material_delivery_note"
  ) return true;
  if (pathname === "/api/raw-material-supplier-statement-reviews") return true;

  const inboundActionMatch = pathname.match(/^\/api\/raw-material-inbounds\/[^/]+\/([^/]+)$/);
  if (inboundActionMatch) return rawMaterialInboundActions.has(inboundActionMatch[1]);

  const statementActionMatch = pathname.match(
    /^\/api\/raw-material-supplier-statement-reviews\/[^/]+\/([^/]+)$/,
  );
  return Boolean(statementActionMatch && rawMaterialSupplierStatementActions.has(statementActionMatch[1]));
}

function normalizeFirstReleaseScope(value, source) {
  if (value === null || value === undefined || value === false) return null;
  if (value === true) return RAW_MATERIAL_FIRST_RELEASE_SCOPE;
  const normalized = String(value).trim().toLowerCase();
  if (disabledScopeValues.has(normalized)) return null;
  if (rawMaterialScopeValues.has(normalized)) return RAW_MATERIAL_FIRST_RELEASE_SCOPE;
  const error = new Error(`${source} contains an unsupported ERP first-release scope.`);
  error.code = "FIRST_RELEASE_SCOPE_INVALID";
  throw error;
}

function normalizePathname(value) {
  const pathname = String(value ?? "").trim();
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}
