import {
  readOfficeApiJson as readJson,
  requestOfficeApi,
  toOfficeApiError as toApiError,
} from "./officeApiClientCore.js";

export async function listOfficeBusinessDecisionAuthorizations(input = {}, options = {}) {
  const { authState, operatorId, scope = "", asOf = "" } = input;
  const query = new URLSearchParams({ scope, effectiveOnly: "true" });
  if (asOf) query.set("asOf", asOf);
  return readList(
    `/business-decision-authorizations?${query.toString()}`,
    { authState, operatorId },
    options,
    "经营决定授权读取失败。",
  );
}

export async function listManagedBusinessDecisionAuthorizations(input = {}, options = {}) {
  const { authState, operatorId, employeeId = "", scope = "", status = "", effectiveOnly = false } = input;
  const query = new URLSearchParams({ includeAll: "true" });
  if (employeeId) query.set("employeeId", employeeId);
  if (scope) query.set("scope", scope);
  if (status) query.set("status", status);
  if (effectiveOnly) query.set("effectiveOnly", "true");
  return readList(`/business-decision-authorizations?${query.toString()}`, { authState, operatorId }, options, "经营决定授权读取失败。");
}

export async function createBusinessDecisionAuthorization(input = {}, options = {}) {
  const { authState, operatorId, idempotencyKey, ...body } = input;
  return writeJson("/business-decision-authorizations", { authState, operatorId, idempotencyKey, body: { ...body, idempotencyKey } }, options, "新建经营决定授权失败。");
}

export async function updateBusinessDecisionAuthorization(input = {}, options = {}) {
  const { authState, operatorId, authorizationId, idempotencyKey, ...body } = input;
  return writeJson(`/business-decision-authorizations/${encodeURIComponent(authorizationId)}/update`, { authState, operatorId, idempotencyKey, body: { ...body, idempotencyKey } }, options, "更新经营决定授权失败。");
}

export async function deactivateBusinessDecisionAuthorization(input = {}, options = {}) {
  const { authState, operatorId, authorizationId, idempotencyKey, ...body } = input;
  return writeJson(`/business-decision-authorizations/${encodeURIComponent(authorizationId)}/deactivate`, { authState, operatorId, idempotencyKey, body: { ...body, idempotencyKey } }, options, "停用经营决定授权失败。");
}

export async function createBusinessDecisionEvidenceDraft(input = {}, options = {}) {
  const { authState, operatorId, idempotencyKey, ...body } = input;
  return writeJson("/business-decision-evidence-drafts", { authState, operatorId, idempotencyKey, body: { ...body, idempotencyKey } }, options, "创建决定凭据草稿失败。");
}

export async function getBusinessDecisionEvidenceDraft(input = {}, options = {}) {
  const { authState, operatorId, draftId } = input;
  try {
    const response = await requestOfficeApi(`/business-decision-evidence-drafts/${encodeURIComponent(draftId)}`, { ...options, authState, operatorId, method: "GET" });
    const json = await readJson(response);
    if (!response.ok) return { source: "api_error", blocked: true, error: toApiError(json, response.status, "读取决定凭据草稿失败。") };
    return { source: "api", draft: json?.draft, attachments: Array.isArray(json?.attachments) ? json.attachments : [] };
  } catch (error) {
    return { source: "api_error", blocked: true, error: { code: "BUSINESS_DECISION_EVIDENCE_DRAFT_READ_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}

export async function voidBusinessDecisionEvidenceAttachment(input = {}, options = {}) {
  const { authState, operatorId, draftId, attachmentId, idempotencyKey, reason = "" } = input;
  return writeJson(`/business-decision-evidence-drafts/${encodeURIComponent(draftId)}/attachments/${encodeURIComponent(attachmentId)}/void`, {
    authState, operatorId, idempotencyKey, body: { idempotencyKey, reason },
  }, options, "删除未使用凭据附件失败。");
}

export async function voidBusinessDecisionEvidenceDraft(input = {}, options = {}) {
  const { authState, operatorId, draftId, idempotencyKey, expectedRevision, reason } = input;
  return writeJson(`/business-decision-evidence-drafts/${encodeURIComponent(draftId)}/void`, {
    authState, operatorId, idempotencyKey, body: { idempotencyKey, expectedRevision, reason },
  }, options, "作废决定凭据草稿失败。");
}

export async function listOfficeBusinessDecisions(input = {}, options = {}) {
  const { authState, operatorId, businessType = "", businessId = "" } = input;
  const query = new URLSearchParams({ businessType, businessId });
  return readList(`/business-decisions?${query.toString()}`, { authState, operatorId }, options, "决定与授权记录读取失败。");
}

export async function recordOfficeBusinessDecision(input = {}, options = {}) {
  const { authState, operatorId, idempotencyKey, ...body } = input;
  return writeJson(
    "/business-decisions",
    { authState, operatorId, idempotencyKey, body: { ...body, idempotencyKey } },
    options,
    "提交经营决定失败。",
  );
}

async function readList(path, auth, options, fallbackMessage) {
  try {
    const response = await requestOfficeApi(path, { ...options, ...auth, method: "GET" });
    const json = await readJson(response);
    if (!response.ok) {
      return { source: "api_error", blocked: true, items: [], error: toApiError(json, response.status, fallbackMessage) };
    }
    return { source: "api", items: Array.isArray(json?.items) ? json.items : [], total: Number(json?.total ?? 0) };
  } catch (error) {
    return { source: "api_error", blocked: true, items: [], error: { code: "BUSINESS_DECISION_READ_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}

async function writeJson(path, request, options, fallbackMessage) {
  try {
    const response = await requestOfficeApi(path, { ...options, ...request, method: "POST" });
    const json = await readJson(response);
    if (!response.ok) return { source: "api_error", blocked: true, error: toApiError(json, response.status, fallbackMessage) };
    return { source: "api", ...json };
  } catch (error) {
    return { source: "api_error", blocked: true, error: { code: "BUSINESS_DECISION_WRITE_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}
