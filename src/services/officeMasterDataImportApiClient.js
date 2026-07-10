import { isOfficeApiServerRequired } from "./officeAuthService.js";
import {
  buildOfficeServerRequiredWriteError as buildServerRequiredWriteError,
  readOfficeApiJson as readJson,
  requestOfficeApi as requestMasterDataImportApi,
} from "./officeApiClientCore.js";
import { createMasterDataImportConfirmationPlan } from "../domain/masterDataImportConfirmationPlan.js";
import { createMasterDataImportExecution } from "../domain/masterDataImportExecution.js";

export async function createOfficeMasterDataImportConfirmationPlan(input = {}, options = {}) {
  const { authState, operatorId, reviewDraft, createdAt = new Date().toISOString() } = input;

  try {
    const response = await requestMasterDataImportApi("/master-data/import-confirmation-plans", {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        reviewDraft,
        createdAt,
        operatorId,
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "基础资料确认计划 API 返回错误。"),
      };
    }

    return {
      source: "api",
      confirmationPlan: normalizeConfirmationPlan(json?.confirmationPlan, {
        operationLogId: json?.operationLogId,
        persistenceStatus: "已保存到 API",
      }),
      reviewDraft: json?.reviewDraft ?? reviewDraft,
      operationLogId: cleanText(json?.operationLogId),
      officialImportEnabled: Boolean(json?.officialImportEnabled),
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("MASTER_DATA_IMPORT_API_UNAVAILABLE", error);
    }
    const localPlan = createMasterDataImportConfirmationPlan({
      reviewDraft,
      createdBy: cleanText(input.createdBy) || cleanText(operatorId) || "当前用户",
      createdAt,
    });
    return {
      source: "local_fallback",
      confirmationPlan: normalizeConfirmationPlan(localPlan, {
        persistenceStatus: "API 不可用，本地草稿",
      }),
      reviewDraft,
      operationLogId: "",
      error: {
        code: "MASTER_DATA_IMPORT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      officialImportEnabled: false,
    };
  }
}

export async function listOfficeMasterDataImportReviewDrafts(input = {}, options = {}) {
  const { authState, operatorId, filters = {}, page = 1, pageSize = 20, localDrafts = [] } = input;

  try {
    const response = await requestMasterDataImportApi(
      `/master-data/import-review-drafts${buildReviewDraftQuery({ filters, page, pageSize })}`,
      {
        ...options,
        authState,
        operatorId,
      },
    );
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "基础资料确认草稿列表 API 返回错误。"),
        items: [],
        page,
        pageSize,
        total: 0,
      };
    }

    const items = Array.isArray(json?.items) ? json.items.map((item) => normalizeReviewDraft(item)).filter(Boolean) : [];
    return {
      source: "api",
      items,
      page: Number(json?.page) || page,
      pageSize: Number(json?.pageSize) || pageSize,
      total: Number(json?.total) || items.length,
    };
  } catch (error) {
    const items = localDrafts.map((item) => normalizeReviewDraft(item)).filter(Boolean);
    return {
      source: "local_fallback",
      items,
      page,
      pageSize,
      total: items.length,
      error: {
        code: "MASTER_DATA_IMPORT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function listOfficeMasterDataImportConfirmationPlans(input = {}, options = {}) {
  const { authState, operatorId, filters = {}, page = 1, pageSize = 20, localPlans = [] } = input;

  try {
    const response = await requestMasterDataImportApi(
      `/master-data/import-confirmation-plans${buildConfirmationPlanQuery({ filters, page, pageSize })}`,
      {
        ...options,
        authState,
        operatorId,
      },
    );
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "基础资料确认计划列表 API 返回错误。"),
        items: [],
        page,
        pageSize,
        total: 0,
      };
    }

    const items = Array.isArray(json?.items) ? json.items.map((item) => normalizeConfirmationPlan(item)).filter(Boolean) : [];
    return {
      source: "api",
      items,
      page: Number(json?.page) || page,
      pageSize: Number(json?.pageSize) || pageSize,
      total: Number(json?.total) || items.length,
    };
  } catch (error) {
    const items = localPlans.map((item) => normalizeConfirmationPlan(item)).filter(Boolean);
    return {
      source: "local_fallback",
      items,
      page,
      pageSize,
      total: items.length,
      error: {
        code: "MASTER_DATA_IMPORT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function createOfficeMasterDataImportFailedRowsCorrectionDraft(input = {}, options = {}) {
  const {
    authState,
    operatorId,
    executionId,
    rowCorrections = [],
    createdAt = new Date().toISOString(),
  } = input;
  const safeExecutionId = cleanText(executionId);
  if (!safeExecutionId) {
    return {
      source: "client",
      blocked: true,
      error: {
        code: "MASTER_DATA_IMPORT_EXECUTION_ID_REQUIRED",
        message: "缺少基础资料导入执行记录 ID。",
      },
    };
  }

  try {
    const response = await requestMasterDataImportApi(
      `/master-data/import-executions/${encodeURIComponent(safeExecutionId)}/failed-rows/correction-draft`,
      {
        ...options,
        authState,
        method: "POST",
        operatorId,
        body: {
          operatorId,
          rowCorrections: Array.isArray(rowCorrections) ? rowCorrections : [],
          createdAt,
        },
      },
    );
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "基础资料失败行修正草稿 API 返回错误。"),
      };
    }

    return {
      source: "api",
      reviewDraft: normalizeReviewDraft(json?.reviewDraft),
      sourceExecution: json?.sourceExecution ?? null,
      correctionSummary: json?.correctionSummary ?? json?.reviewDraft?.correctionSummary ?? null,
      operationLogId: cleanText(json?.operationLogId),
      officialImportEnabled: false,
      officialWriteScope: "none",
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "MASTER_DATA_IMPORT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function createOfficeMasterDataImportExecution(input = {}, options = {}) {
  const {
    authState,
    operatorId,
    planId,
    confirmationPlan,
    requestedAt = new Date().toISOString(),
    officialImportEnabled = false,
    officialWriterKind = "",
  } = input;

  try {
    const response = await requestMasterDataImportApi("/master-data/import-executions", {
      ...options,
      authState,
      method: "POST",
      operatorId,
      body: {
        planId: cleanText(planId) || cleanText(confirmationPlan?.planId),
        requestedAt,
        operatorId,
        officialImportEnabled: officialImportEnabled === true,
        officialWriterKind: cleanText(officialWriterKind),
      },
    });
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "基础资料导入执行 API 返回错误。"),
      };
    }

    return {
      source: "api",
      confirmationPlan: normalizeConfirmationPlan(json?.confirmationPlan),
      importExecution: normalizeImportExecution(json?.importExecution, {
        operationLogId: json?.operationLogId,
        persistenceStatus: "已保存到 API",
      }),
      operationLogId: cleanText(json?.operationLogId),
      officialWriteAttempted: Boolean(json?.officialWriteAttempted),
      officialWriteScope: cleanText(json?.officialWriteScope) || "none",
    };
  } catch (error) {
    if (isOfficeApiServerRequired(options)) {
      return buildServerRequiredWriteError("MASTER_DATA_IMPORT_API_UNAVAILABLE", error);
    }
    if (!confirmationPlan) {
      return {
        source: "local_fallback",
        blocked: true,
        error: {
          code: "MASTER_DATA_IMPORT_API_UNAVAILABLE",
          message: error?.message ?? String(error),
        },
      };
    }
    const localExecution = createMasterDataImportExecution({
      confirmationPlan,
      requestedBy: cleanText(input.requestedBy) || cleanText(operatorId) || "当前用户",
      requestedAt,
      officialWriterKind: "not_configured",
    });
    return {
      source: "local_fallback",
      confirmationPlan: normalizeConfirmationPlan(confirmationPlan),
      importExecution: normalizeImportExecution(localExecution, {
        persistenceStatus: "API 不可用，本地阻断记录",
      }),
      operationLogId: "",
      error: {
        code: "MASTER_DATA_IMPORT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      officialWriteAttempted: false,
      officialWriteScope: "none",
    };
  }
}

export async function listOfficeMasterDataImportExecutions(input = {}, options = {}) {
  const { authState, operatorId, filters = {}, page = 1, pageSize = 20, localExecutions = [] } = input;

  try {
    const response = await requestMasterDataImportApi(
      `/master-data/import-executions${buildImportExecutionQuery({ filters, page, pageSize })}`,
      {
        ...options,
        authState,
        operatorId,
      },
    );
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "基础资料导入执行记录列表 API 返回错误。"),
        items: [],
        page,
        pageSize,
        total: 0,
      };
    }

    const items = Array.isArray(json?.items) ? json.items.map((item) => normalizeImportExecution(item)).filter(Boolean) : [];
    return {
      source: "api",
      items,
      page: Number(json?.page) || page,
      pageSize: Number(json?.pageSize) || pageSize,
      total: Number(json?.total) || items.length,
    };
  } catch (error) {
    const items = localExecutions.map((item) => normalizeImportExecution(item)).filter(Boolean);
    return {
      source: "local_fallback",
      items,
      page,
      pageSize,
      total: items.length,
      error: {
        code: "MASTER_DATA_IMPORT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function downloadOfficeMasterDataImportFailedRows(input = {}, options = {}) {
  const { authState, operatorId, executionId } = input;
  const safeExecutionId = cleanText(executionId);
  if (!safeExecutionId) {
    return {
      source: "client",
      blocked: true,
      error: {
        code: "MASTER_DATA_IMPORT_EXECUTION_ID_REQUIRED",
        message: "缺少基础资料导入执行记录 ID。",
      },
    };
  }

  try {
    const response = await requestMasterDataImportApi(
      `/master-data/import-executions/${encodeURIComponent(safeExecutionId)}/failed-rows`,
      {
        ...options,
        authState,
        operatorId,
      },
    );
    const contentType = cleanText(response.headers?.get?.("content-type")) || "text/csv; charset=utf-8";
    const contentDisposition = cleanText(response.headers?.get?.("content-disposition"));
    const content = await response.text();

    if (!response.ok) {
      let json = null;
      try {
        json = JSON.parse(content);
      } catch {
        json = null;
      }
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "基础资料失败行下载 API 返回错误。"),
      };
    }

    return {
      source: "api",
      executionId: safeExecutionId,
      fileName: getFileNameFromContentDisposition(contentDisposition) || `master-data-import-failed-rows-${safeExecutionId}.csv`,
      contentType,
      content,
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "MASTER_DATA_IMPORT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function listOfficeMasterDataEmployeeAccountReviews(input = {}, options = {}) {
  const { authState, operatorId, filters = {}, page = 1, pageSize = 20, localReviews = [] } = input;

  try {
    const response = await requestMasterDataImportApi(
      `/master-data/employee-account-reviews${buildEmployeeAccountReviewQuery({ filters, page, pageSize })}`,
      {
        ...options,
        authState,
        operatorId,
      },
    );
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "员工账号复核列表 API 返回错误。"),
        items: [],
        page,
        pageSize,
        total: 0,
      };
    }

    const items = Array.isArray(json?.items) ? json.items.map((item) => normalizeEmployeeAccountReview(item)).filter(Boolean) : [];
    return {
      source: "api",
      items,
      page: Number(json?.page) || page,
      pageSize: Number(json?.pageSize) || pageSize,
      total: Number(json?.total) || items.length,
    };
  } catch (error) {
    const items = localReviews.map((item) => normalizeEmployeeAccountReview(item)).filter(Boolean);
    return {
      source: "local_fallback",
      items,
      page,
      pageSize,
      total: items.length,
      error: {
        code: "MASTER_DATA_EMPLOYEE_ACCOUNT_REVIEW_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function enableOfficeMasterDataEmployeeAccount(input = {}, options = {}) {
  const { authState, operatorId, employeeId, roleKey, loginName, userId, reviewNote } = input;
  const safeEmployeeId = cleanText(employeeId);
  if (!safeEmployeeId) {
    return {
      source: "client",
      blocked: true,
      error: {
        code: "MASTER_DATA_EMPLOYEE_ID_REQUIRED",
        message: "缺少员工 ID。",
      },
    };
  }

  try {
    const response = await requestMasterDataImportApi(
      `/master-data/employee-account-reviews/${encodeURIComponent(safeEmployeeId)}/enable`,
      {
        ...options,
        authState,
        method: "POST",
        operatorId,
        body: {
          operatorId,
          roleKey: cleanText(roleKey),
          loginName: cleanText(loginName),
          userId: cleanText(userId),
          reviewNote: cleanText(reviewNote),
        },
      },
    );
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "员工账号复核启用 API 返回错误。"),
      };
    }

    return {
      source: "api",
      employeeAccountReview: normalizeEmployeeAccountReview(json?.employeeAccountReview),
      user: json?.user ?? null,
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "MASTER_DATA_EMPLOYEE_ACCOUNT_REVIEW_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function issueOfficeMasterDataEmployeeAccountPassword(input = {}, options = {}) {
  const { authState, operatorId, employeeId, roleKey, loginName, userId, issueNote } = input;
  const safeEmployeeId = cleanText(employeeId);
  if (!safeEmployeeId) {
    return {
      source: "client",
      blocked: true,
      error: {
        code: "MASTER_DATA_EMPLOYEE_ID_REQUIRED",
        message: "缺少员工 ID。",
      },
    };
  }

  try {
    const response = await requestMasterDataImportApi(
      `/master-data/employee-account-reviews/${encodeURIComponent(safeEmployeeId)}/password`,
      {
        ...options,
        authState,
        method: "POST",
        operatorId,
        body: {
          operatorId,
          roleKey: cleanText(roleKey),
          loginName: cleanText(loginName),
          userId: cleanText(userId),
          issueNote: cleanText(issueNote),
        },
      },
    );
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "员工临时密码发放 API 返回错误。"),
      };
    }

    return {
      source: "api",
      employeeAccountReview: normalizeEmployeeAccountReview(json?.employeeAccountReview),
      issuedCredential: normalizeIssuedEmployeeCredential(json?.issuedCredential),
      user: json?.user ?? null,
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "MASTER_DATA_EMPLOYEE_ACCOUNT_PASSWORD_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function revokeOfficeMasterDataEmployeeAccountPassword(input = {}, options = {}) {
  const { authState, operatorId, employeeId, revokeNote } = input;
  const safeEmployeeId = cleanText(employeeId);
  if (!safeEmployeeId) {
    return {
      source: "client",
      blocked: true,
      error: {
        code: "MASTER_DATA_EMPLOYEE_ID_REQUIRED",
        message: "缺少员工 ID。",
      },
    };
  }

  try {
    const response = await requestMasterDataImportApi(
      `/master-data/employee-account-reviews/${encodeURIComponent(safeEmployeeId)}/password/revoke`,
      {
        ...options,
        authState,
        method: "POST",
        operatorId,
        body: {
          operatorId,
          revokeNote: cleanText(revokeNote),
        },
      },
    );
    const json = await readJson(response);

    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "员工登录密码撤销 API 返回错误。"),
      };
    }

    return {
      source: "api",
      revoked: json?.revoked === true,
      employeeAccountReview: normalizeEmployeeAccountReview(json?.employeeAccountReview),
      user: json?.user ?? null,
      sessionsRevokedAfter: cleanText(json?.sessionsRevokedAfter),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "MASTER_DATA_EMPLOYEE_ACCOUNT_PASSWORD_REVOKE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

function buildConfirmationPlanQuery({ filters = {}, page, pageSize }) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  for (const key of ["draftId", "planId", "status"]) {
    const value = cleanText(filters[key]);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildReviewDraftQuery({ filters = {}, page, pageSize }) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  for (const key of ["draftId", "status", "sourceExecutionId"]) {
    const value = cleanText(filters[key]);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildImportExecutionQuery({ filters = {}, page, pageSize }) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  for (const key of ["draftId", "planId", "executionId", "status"]) {
    const value = cleanText(filters[key]);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildEmployeeAccountReviewQuery({ filters = {}, page, pageSize }) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  for (const key of ["employeeId", "status", "keyword"]) {
    const value = cleanText(filters[key]);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function normalizeReviewDraft(draft, extra = {}) {
  if (!draft || typeof draft !== "object") return null;
  const draftId = cleanText(draft.draftId);
  if (!draftId) return null;
  return {
    ...draft,
    ...extra,
    draftId,
    status: cleanText(draft.status),
    statusLabel: cleanText(draft.statusLabel),
    statusTone: cleanText(draft.statusTone),
    fileName: cleanText(draft.fileName),
    requestedBy: cleanText(draft.requestedBy),
    createdAt: cleanText(draft.createdAt),
    checkedAt: cleanText(draft.checkedAt),
    operationLogId: cleanText(extra.operationLogId ?? draft.operationLogId),
    sourceExecutionId: cleanText(draft.sourceExecutionId),
    sourcePlanId: cleanText(draft.sourcePlanId),
    sourceDraftId: cleanText(draft.sourceDraftId),
    correctionMode: cleanText(draft.correctionMode),
    canEnterReviewQueue: draft.canEnterReviewQueue !== false,
    officialImportEnabled: false,
    officialWriteScope: "none",
  };
}

function normalizeConfirmationPlan(plan, extra = {}) {
  if (!plan || typeof plan !== "object") return null;
  const planId = cleanText(plan.planId);
  if (!planId) return null;
  return {
    ...plan,
    ...extra,
    planId,
    draftId: cleanText(plan.draftId),
    status: cleanText(plan.status),
    statusLabel: cleanText(plan.statusLabel),
    operationLogId: cleanText(extra.operationLogId ?? plan.operationLogId),
    officialImportEnabled: false,
    officialWriteScope: "none",
  };
}

function normalizeImportExecution(execution, extra = {}) {
  if (!execution || typeof execution !== "object") return null;
  const executionId = cleanText(execution.executionId);
  if (!executionId) return null;
  return {
    ...execution,
    ...extra,
    executionId,
    planId: cleanText(execution.planId),
    draftId: cleanText(execution.draftId),
    status: cleanText(execution.status),
    statusLabel: cleanText(execution.statusLabel),
    operationLogId: cleanText(extra.operationLogId ?? execution.operationLogId),
    officialImportEnabled: execution.officialImportEnabled === true,
    officialWriteAttempted: execution.officialWriteAttempted === true,
    officialWriteScope: cleanText(execution.officialWriteScope) || "none",
  };
}

function normalizeEmployeeAccountReview(review, extra = {}) {
  if (!review || typeof review !== "object") return null;
  const employeeId = cleanText(review.employeeId);
  if (!employeeId) return null;
  return {
    ...review,
    ...extra,
    employeeId,
    bizNo: cleanText(review.bizNo),
    name: cleanText(review.name),
    roleName: cleanText(review.roleName),
    defaultWorkshop: cleanText(review.defaultWorkshop),
    defaultMachineId: cleanText(review.defaultMachineId),
    status: cleanText(review.status),
    statusLabel: cleanText(review.statusLabel),
    profileStatus: cleanText(review.profileStatus),
    recommendedRoleKey: cleanText(review.recommendedRoleKey),
    recommendedRoleLabel: cleanText(review.recommendedRoleLabel),
    loginName: cleanText(review.loginName),
    userId: cleanText(review.userId),
    loginEnabled: review.loginEnabled === true,
    passwordIssuedAt: cleanText(review.passwordIssuedAt),
    passwordStatus: cleanText(review.passwordStatus),
    passwordIssuedBy: cleanText(review.passwordIssuedBy),
    passwordChangedAt: cleanText(review.passwordChangedAt),
    passwordChangedBy: cleanText(review.passwordChangedBy),
    passwordExpiresAt: cleanText(review.passwordExpiresAt),
    passwordExpiredAt: cleanText(review.passwordExpiredAt),
    passwordRevokedAt: cleanText(review.passwordRevokedAt),
    passwordRevokedBy: cleanText(review.passwordRevokedBy),
    failedLoginCount: Number(review.failedLoginCount) || 0,
    lastFailedLoginAt: cleanText(review.lastFailedLoginAt),
    lockedUntil: cleanText(review.lockedUntil),
    mustChangePassword: review.mustChangePassword === true,
    accountEnabled: review.accountEnabled === true,
    requestedEnabled: review.requestedEnabled === true,
    actionRequired: review.actionRequired !== false,
  };
}

function normalizeIssuedEmployeeCredential(credential) {
  if (!credential || typeof credential !== "object") return null;
  const userId = cleanText(credential.userId);
  const loginName = cleanText(credential.loginName);
  const temporaryPassword = cleanText(credential.temporaryPassword);
  if (!userId || !temporaryPassword) return null;
  return {
    userId,
    loginName,
    temporaryPassword,
    passwordIssuedAt: cleanText(credential.passwordIssuedAt),
    passwordStatus: cleanText(credential.passwordStatus),
    mustChangePassword: credential.mustChangePassword === true,
    visibleOnce: credential.visibleOnce !== false,
  };
}

function toApiError(json, status, fallbackMessage) {
  return {
    code: cleanText(json?.code) || `HTTP_${status}`,
    message: cleanText(json?.message) || fallbackMessage,
    requiredPermission: cleanText(json?.requiredPermission),
    status,
  };
}

function getFileNameFromContentDisposition(contentDisposition = "") {
  const encodedMatch = String(contentDisposition).match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }
  const plainMatch = String(contentDisposition).match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? "";
}

function cleanText(value) {
  return String(value ?? "").trim();
}
