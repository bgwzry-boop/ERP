import { isOfficeApiServerRequired } from "./officeAuthService.js";
import {
  buildOfficeServerRequiredWriteError as buildServerRequiredWriteError,
  readOfficeApiJson as readJson,
  requestOfficeApi as requestMasterDataImportApi,
  toOfficeApiError as toApiError,
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
        importExecution: normalizeImportExecution(json?.importExecution, {
          operationLogId: json?.operationLogId,
          persistenceStatus: json?.importExecution ? "后端事务未提交，已保存失败记录" : "",
        }),
        operationLogId: cleanText(json?.operationLogId),
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
      readiness: normalizeEmployeeAccountReadiness(json?.readiness),
      assignmentOptions: normalizeEmployeeAssignmentOptions(json?.assignmentOptions),
      machineRecords: normalizeMasterDataMachines(json?.machineRecords),
      page: Number(json?.page) || page,
      pageSize: Number(json?.pageSize) || pageSize,
      total: Number(json?.total) || items.length,
    };
  } catch (error) {
    const items = localReviews.map((item) => normalizeEmployeeAccountReview(item)).filter(Boolean);
    return {
      source: "local_fallback",
      items,
      readiness: null,
      assignmentOptions: normalizeEmployeeAssignmentOptions(),
      machineRecords: [],
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

export async function listOfficeMasterDataSubaccounts(input = {}, options = {}) {
  try {
    const [accountsResponse, catalogResponse] = await Promise.all([
      requestMasterDataImportApi("/master-data/subaccounts", {
        ...options,
        authState: input.authState,
        operatorId: input.operatorId,
      }),
      requestMasterDataImportApi("/master-data/permission-catalog", {
        ...options,
        authState: input.authState,
        operatorId: input.operatorId,
      }),
    ]);
    const [accountsJson, catalogJson] = await Promise.all([readJson(accountsResponse), readJson(catalogResponse)]);
    if (!accountsResponse.ok || !catalogResponse.ok) {
      const response = !accountsResponse.ok ? accountsResponse : catalogResponse;
      const json = !accountsResponse.ok ? accountsJson : catalogJson;
      return {
        source: "api_error",
        blocked: true,
        items: [],
        catalog: { roles: [], permissions: [] },
        error: toApiError(json, response.status, "子账号权限工作台 API 返回错误。"),
      };
    }
    return {
      source: "api",
      items: (Array.isArray(accountsJson?.items) ? accountsJson.items : []).map(normalizeSubaccount).filter(Boolean),
      catalog: normalizePermissionCatalog(catalogJson),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      items: [],
      catalog: { roles: [], permissions: [] },
      error: { code: "SUBACCOUNT_API_UNAVAILABLE", message: error?.message ?? String(error) },
    };
  }
}

export async function createOfficeMasterDataSubaccount(input = {}, options = {}) {
  return mutateOfficeMasterDataSubaccount("/master-data/subaccounts", "POST", input, options, "创建子账号");
}

export async function updateOfficeMasterDataSubaccount(input = {}, options = {}) {
  return mutateOfficeMasterDataSubaccount(
    `/master-data/subaccounts/${encodeURIComponent(cleanText(input.userId))}`,
    "PATCH",
    input,
    options,
    "保存子账号权限",
  );
}

export async function actOfficeMasterDataSubaccount(input = {}, options = {}) {
  const action = cleanText(input.action);
  if (!["temporary-password", "suspend", "reactivate", "disable"].includes(action)) {
    return { source: "client", blocked: true, error: { code: "SUBACCOUNT_ACTION_INVALID", message: "未知的子账号操作。" } };
  }
  return mutateOfficeMasterDataSubaccount(
    `/master-data/subaccounts/${encodeURIComponent(cleanText(input.userId))}/${action}`,
    "POST",
    input,
    options,
    "更新子账号状态",
  );
}

async function mutateOfficeMasterDataSubaccount(pathname, method, input, options, fallbackMessage) {
  try {
    const response = await requestMasterDataImportApi(pathname, {
      ...options,
      authState: input.authState,
      method,
      operatorId: input.operatorId,
      body: {
        displayName: cleanText(input.displayName),
        loginName: cleanText(input.loginName),
        employeeId: cleanText(input.employeeId),
        roleKeys: Array.isArray(input.roleKeys) ? input.roleKeys.map(cleanText).filter(Boolean) : [],
        permissionAllowlist: Array.isArray(input.permissionAllowlist) ? input.permissionAllowlist.map(cleanText).filter(Boolean) : [],
        permissionDenylist: Array.isArray(input.permissionDenylist) ? input.permissionDenylist.map(cleanText).filter(Boolean) : [],
        expectedRevision: input.expectedRevision,
        reason: cleanText(input.reason),
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return { source: "api_error", blocked: true, error: toApiError(json, response.status, `${fallbackMessage} API 返回错误。`) };
    }
    return {
      source: "api",
      subaccount: normalizeSubaccount(json?.subaccount),
      credential: json?.credential ? {
        userId: cleanText(json.credential.userId),
        loginName: cleanText(json.credential.loginName),
        temporaryPassword: cleanText(json.credential.temporaryPassword),
        issuedAt: cleanText(json.credential.issuedAt),
      } : null,
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return { source: "api_error", blocked: true, error: { code: "SUBACCOUNT_API_UNAVAILABLE", message: error?.message ?? String(error) } };
  }
}

export async function enableOfficeMasterDataEmployeeAccount(input = {}, options = {}) {
  const { authState, operatorId, employeeId, roleKey, roleKeys, loginName, userId, reviewNote } = input;
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
          roleKeys: Array.isArray(roleKeys) ? roleKeys.map(cleanText).filter(Boolean) : undefined,
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

export async function confirmOfficeMasterDataEmployeeIdentity(input = {}, options = {}) {
  const safeEmployeeId = cleanText(input.employeeId);
  if (!safeEmployeeId) {
    return {
      source: "client",
      blocked: true,
      error: { code: "MASTER_DATA_EMPLOYEE_ID_REQUIRED", message: "缺少员工 ID。" },
    };
  }
  try {
    const response = await requestMasterDataImportApi(
      `/master-data/employee-account-reviews/${encodeURIComponent(safeEmployeeId)}/identity-confirmation`,
      {
        ...options,
        authState: input.authState,
        method: "POST",
        operatorId: input.operatorId,
        body: {
          confirmed: input.confirmed === true,
          confirmedEmployeeId: cleanText(input.confirmedEmployeeId),
          confirmedName: cleanText(input.confirmedName),
          reason: cleanText(input.reason),
        },
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "员工身份确认 API 返回错误。"),
      };
    }
    return {
      source: "api",
      employeeAccountReview: normalizeEmployeeAccountReview(json?.employeeAccountReview),
      operationLogId: cleanText(json?.operationLogId),
      identityAlreadyConfirmed: json?.identityAlreadyConfirmed === true,
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "MASTER_DATA_EMPLOYEE_IDENTITY_CONFIRMATION_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function enableOfficeMasterDataEmployeeAccounts(input = {}, options = {}) {
  const employeeIds = [...new Set(
    (Array.isArray(input.employeeIds) ? input.employeeIds : [])
      .map(cleanText)
      .filter(Boolean),
  )];
  if (!employeeIds.length) {
    return {
      source: "client",
      blocked: true,
      error: {
        code: "MASTER_DATA_EMPLOYEE_ACCOUNT_BATCH_IDS_REQUIRED",
        message: "请至少选择一个待复核员工账号。",
      },
    };
  }
  if (employeeIds.length > 100) {
    return {
      source: "client",
      blocked: true,
      error: {
        code: "MASTER_DATA_EMPLOYEE_ACCOUNT_BATCH_LIMIT_EXCEEDED",
        message: "一次最多批量启用 100 个员工账号。",
      },
    };
  }

  try {
    const response = await requestMasterDataImportApi(
      "/master-data/employee-account-reviews/batch-enable",
      {
        ...options,
        authState: input.authState,
        method: "POST",
        operatorId: input.operatorId,
        body: {
          employeeIds,
          confirmed: input.confirmed === true,
          reviewNote: cleanText(input.reviewNote),
          reviewedAt: cleanText(input.reviewedAt),
        },
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "员工账号批量复核启用 API 返回错误。"),
      };
    }
    return {
      source: "api",
      employeeAccountReviews: (Array.isArray(json?.employeeAccountReviews) ? json.employeeAccountReviews : [])
        .map((item) => normalizeEmployeeAccountReview(item))
        .filter(Boolean),
      requestedCount: Number(json?.requestedCount) || 0,
      enabledCount: Number(json?.enabledCount) || 0,
      skippedCount: Number(json?.skippedCount) || 0,
      skippedEmployeeIds: Array.isArray(json?.skippedEmployeeIds)
        ? json.skippedEmployeeIds.map(cleanText).filter(Boolean)
        : [],
      operationLogIds: Array.isArray(json?.operationLogIds)
        ? json.operationLogIds.map(cleanText).filter(Boolean)
        : [],
      reviewedAt: cleanText(json?.reviewedAt),
      atomic: json?.atomic === true,
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "MASTER_DATA_EMPLOYEE_ACCOUNT_BATCH_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function updateOfficeMasterDataEmployeeAssignment(input = {}, options = {}) {
  const { authState, operatorId, employeeId, assignmentMode, workshop, machineId, reason } = input;
  const safeEmployeeId = cleanText(employeeId);
  if (!safeEmployeeId) {
    return {
      source: "client",
      blocked: true,
      error: { code: "MASTER_DATA_EMPLOYEE_ID_REQUIRED", message: "缺少员工 ID。" },
    };
  }
  try {
    const response = await requestMasterDataImportApi(
      `/master-data/employee-account-reviews/${encodeURIComponent(safeEmployeeId)}/assignment`,
      {
        ...options,
        authState,
        method: "POST",
        operatorId,
        body: {
          assignmentMode: cleanText(assignmentMode),
          workshop: cleanText(workshop),
          machineId: cleanText(machineId),
          reason: cleanText(reason),
        },
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "员工车间 / 机台调配 API 返回错误。"),
      };
    }
    return {
      source: "api",
      employeeAccountReview: normalizeEmployeeAccountReview(json?.employeeAccountReview),
      assignmentOptions: normalizeEmployeeAssignmentOptions(json?.assignmentOptions),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "MASTER_DATA_EMPLOYEE_ASSIGNMENT_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function updateOfficeMasterDataEmployeeProfile(input = {}, options = {}) {
  const safeEmployeeId = cleanText(input.employeeId);
  if (!safeEmployeeId) {
    return {
      source: "client",
      blocked: true,
      error: { code: "MASTER_DATA_EMPLOYEE_ID_REQUIRED", message: "缺少员工 ID。" },
    };
  }
  try {
    const response = await requestMasterDataImportApi(
      `/master-data/employee-account-reviews/${encodeURIComponent(safeEmployeeId)}/profile`,
      {
        ...options,
        authState: input.authState,
        method: "POST",
        operatorId: input.operatorId,
        body: {
          birthDate: cleanText(input.birthDate),
          hireDate: cleanText(input.hireDate),
          payrollPositionKey: cleanText(input.payrollPositionKey),
          baseHourlyWage: input.baseHourlyWage,
          positionAllowanceHourly: input.positionAllowanceHourly,
          wageEffectiveFrom: cleanText(input.wageEffectiveFrom),
          attendanceProvider: cleanText(input.attendanceProvider),
          attendanceExternalId: cleanText(input.attendanceExternalId),
          remark: cleanText(input.remark),
          reason: cleanText(input.reason),
        },
      },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "员工档案保存 API 返回错误。"),
      };
    }
    return {
      source: "api",
      employeeAccountReview: normalizeEmployeeAccountReview(json?.employeeAccountReview),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "MASTER_DATA_EMPLOYEE_PROFILE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function listOfficeMasterDataMachines(input = {}, options = {}) {
  const { authState, operatorId, filters = {}, page = 1, pageSize = 100 } = input;
  try {
    const response = await requestMasterDataImportApi(
      `/master-data/machines${buildMasterDataMachineQuery({ filters, page, pageSize })}`,
      { ...options, authState, operatorId },
    );
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "机台配置列表 API 返回错误。"),
        items: [],
        page,
        pageSize,
        total: 0,
      };
    }
    const items = normalizeMasterDataMachines(json?.items);
    return {
      source: "api",
      items,
      page: Number(json?.page) || page,
      pageSize: Number(json?.pageSize) || pageSize,
      total: Number(json?.total) || items.length,
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "MASTER_DATA_MACHINE_LIST_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
      items: [],
      page,
      pageSize,
      total: 0,
    };
  }
}

export async function createOfficeMasterDataMachine(input = {}, options = {}) {
  return saveOfficeMasterDataMachine(input, { ...options, method: "POST" });
}

export async function updateOfficeMasterDataMachine(input = {}, options = {}) {
  const machineId = cleanText(input.machineId);
  if (!machineId) {
    return {
      source: "client",
      blocked: true,
      error: { code: "MASTER_DATA_MACHINE_ID_REQUIRED", message: "缺少机台 ID。" },
    };
  }
  return saveOfficeMasterDataMachine(input, {
    ...options,
    method: "PATCH",
    path: `/master-data/machines/${encodeURIComponent(machineId)}`,
  });
}

async function saveOfficeMasterDataMachine(input = {}, options = {}) {
  const { authState, operatorId } = input;
  const path = options.path || "/master-data/machines";
  try {
    const response = await requestMasterDataImportApi(path, {
      ...options,
      authState,
      operatorId,
      body: {
        machineId: cleanText(input.machineId),
        bizNo: cleanText(input.bizNo),
        name: cleanText(input.name),
        machineType: cleanText(input.machineType),
        workshop: cleanText(input.workshop),
        status: cleanText(input.status),
        reason: cleanText(input.reason),
        expectedUpdatedAt: cleanText(input.expectedUpdatedAt),
      },
    });
    const json = await readJson(response);
    if (!response.ok) {
      return {
        source: "api_error",
        blocked: true,
        error: toApiError(json, response.status, "机台配置保存 API 返回错误。"),
      };
    }
    return {
      source: "api",
      machine: normalizeMasterDataMachine(json?.machine),
      operationLogId: cleanText(json?.operationLogId),
    };
  } catch (error) {
    return {
      source: "api_error",
      blocked: true,
      error: {
        code: "MASTER_DATA_MACHINE_WRITE_API_UNAVAILABLE",
        message: error?.message ?? String(error),
      },
    };
  }
}

export async function issueOfficeMasterDataEmployeeAccountPassword(input = {}, options = {}) {
  const { authState, operatorId, employeeId, roleKey, roleKeys, loginName, userId, issueNote } = input;
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
          roleKeys: Array.isArray(roleKeys) ? roleKeys.map(cleanText).filter(Boolean) : undefined,
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

function buildMasterDataMachineQuery({ filters = {}, page, pageSize }) {
  const params = new URLSearchParams();
  if (filters.keyword) params.set("keyword", cleanText(filters.keyword));
  if (filters.status) params.set("status", cleanText(filters.status));
  if (filters.workshop) params.set("workshop", cleanText(filters.workshop));
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
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
    birthDate: cleanText(review.birthDate),
    age: review.age === null || review.age === undefined ? null : Number(review.age),
    hireDate: cleanText(review.hireDate),
    payrollPositionKey: cleanText(review.payrollPositionKey),
    seniorityYears: review.seniorityYears === null || review.seniorityYears === undefined
      ? null
      : Number(review.seniorityYears),
    baseHourlyWage: Number(review.baseHourlyWage) || 0,
    positionAllowanceHourly: Number(review.positionAllowanceHourly) || 0,
    wageEffectiveFrom: cleanText(review.wageEffectiveFrom),
    attendanceProvider: cleanText(review.attendanceProvider),
    attendanceExternalId: cleanText(review.attendanceExternalId),
    attendanceMappingUpdatedBy: cleanText(review.attendanceMappingUpdatedBy),
    attendanceMappingUpdatedAt: cleanText(review.attendanceMappingUpdatedAt),
    attendanceMapped: review.attendanceMapped === true,
    departedAt: cleanText(review.departedAt),
    departureEffectiveDate: cleanText(review.departureEffectiveDate),
    departedBy: cleanText(review.departedBy),
    departureReason: cleanText(review.departureReason),
    configuredMachineId: cleanText(review.configuredMachineId),
    configuredMachineLabel: cleanText(review.configuredMachineLabel),
    machineConfigurationStatus: cleanText(review.machineConfigurationStatus),
    machineConfigurationStatusLabel: cleanText(review.machineConfigurationStatusLabel),
    assignmentMode: cleanText(review.assignmentMode),
    assignmentUpdatedBy: cleanText(review.assignmentUpdatedBy),
    assignmentUpdatedAt: cleanText(review.assignmentUpdatedAt),
    assignmentNote: cleanText(review.assignmentNote),
    status: cleanText(review.status),
    statusLabel: cleanText(review.statusLabel),
    profileStatus: cleanText(review.profileStatus),
    recommendedRoleKey: cleanText(review.recommendedRoleKey),
    recommendedRoleLabel: cleanText(review.recommendedRoleLabel),
    recommendedRoleKeys: (Array.isArray(review.recommendedRoleKeys) ? review.recommendedRoleKeys : [])
      .map(cleanText)
      .filter(Boolean),
    recommendedRoleLabels: (Array.isArray(review.recommendedRoleLabels) ? review.recommendedRoleLabels : [])
      .map(cleanText)
      .filter(Boolean),
    identityConfirmationRequired: review.identityConfirmationRequired === true,
    identityConfirmed: review.identityConfirmed === true,
    identityConfirmationStatus: cleanText(review.identityConfirmationStatus),
    identityConfirmationStatusLabel: cleanText(review.identityConfirmationStatusLabel),
    identityConfirmedBy: cleanText(review.identityConfirmedBy),
    identityConfirmedAt: cleanText(review.identityConfirmedAt),
    identityConfirmationNote: cleanText(review.identityConfirmationNote),
    accountActivationBlocked: review.accountActivationBlocked === true,
    accountActivationBlockerCode: cleanText(review.accountActivationBlockerCode),
    accountActivationBlockerLabel: cleanText(review.accountActivationBlockerLabel),
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

function normalizeEmployeeAssignmentOptions(value = {}) {
  const workshops = Array.isArray(value?.workshops)
    ? value.workshops.map(cleanText).filter(Boolean)
    : [];
  const machines = Array.isArray(value?.machines)
    ? normalizeMasterDataMachines(value.machines)
    : [];
  return { workshops, machines };
}

function normalizeMasterDataMachines(value) {
  return (Array.isArray(value) ? value : []).map(normalizeMasterDataMachine).filter(Boolean);
}

function normalizeMasterDataMachine(machine) {
  if (!machine || typeof machine !== "object") return null;
  const machineId = cleanText(machine.machineId);
  if (!machineId) return null;
  const name = cleanText(machine.name ?? machine.machineLabel ?? machineId);
  return {
    machineId,
    bizNo: cleanText(machine.bizNo ?? machineId),
    name,
    machineLabel: cleanText(machine.machineLabel ?? name),
    machineType: cleanText(machine.machineType),
    machineTypeLabel: cleanText(machine.machineTypeLabel),
    workshop: cleanText(machine.workshop),
    status: cleanText(machine.status) || (machine.enabled === false ? "inactive" : "active"),
    statusLabel: cleanText(machine.statusLabel),
    enabled: machine.enabled !== false && (cleanText(machine.status) || "active") === "active",
    assignedEmployeeCount: Number(machine.assignedEmployeeCount) || 0,
    assignedEmployees: (Array.isArray(machine.assignedEmployees) ? machine.assignedEmployees : [])
      .map(normalizeMachineAssignedEmployee)
      .filter(Boolean),
    lastChange: normalizeMachineLastChange(machine.lastChange),
    createdAt: cleanText(machine.createdAt),
    updatedAt: cleanText(machine.updatedAt),
  };
}

function normalizeMachineAssignedEmployee(employee) {
  if (!employee || typeof employee !== "object") return null;
  const employeeId = cleanText(employee.employeeId);
  if (!employeeId) return null;
  return {
    employeeId,
    name: cleanText(employee.name) || employeeId,
    roleName: cleanText(employee.roleName),
    assignmentMode: cleanText(employee.assignmentMode),
  };
}

function normalizeMachineLastChange(value) {
  if (!value || typeof value !== "object") return null;
  const changedAt = cleanText(value.changedAt);
  const operatorId = cleanText(value.operatorId);
  if (!changedAt && !operatorId) return null;
  return {
    action: cleanText(value.action),
    operatorId,
    changedAt,
    reason: cleanText(value.reason),
  };
}

function normalizeEmployeeAccountReadiness(readiness) {
  if (!readiness || typeof readiness !== "object") return null;
  return {
    ready: readiness.ready === true,
    requiredRoleCount: Number(readiness.requiredRoleCount) || 0,
    coveredRoleCount: Number(readiness.coveredRoleCount) || 0,
    missingRoleCount: Number(readiness.missingRoleCount) || 0,
    formalAccountCount: Number(readiness.formalAccountCount) || 0,
    readyFormalAccountCount: Number(readiness.readyFormalAccountCount) || 0,
    roles: (Array.isArray(readiness.roles) ? readiness.roles : []).map((role) => ({
      roleKey: cleanText(role.roleKey),
      roleLabel: cleanText(role.roleLabel),
      ready: role.ready === true,
      accountCount: Number(role.accountCount) || 0,
      readyAccountCount: Number(role.readyAccountCount) || 0,
      blockers: (Array.isArray(role.blockers) ? role.blockers : []).map((blocker) => ({
        code: cleanText(blocker.code),
        label: cleanText(blocker.label),
        count: Number(blocker.count) || 0,
      })).filter((blocker) => blocker.code && blocker.label),
    })).filter((role) => role.roleKey && role.roleLabel),
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

function normalizeSubaccount(value) {
  if (!value || typeof value !== "object") return null;
  const userId = cleanText(value.userId ?? value.id);
  if (!userId) return null;
  return {
    ...value,
    id: userId,
    userId,
    loginName: cleanText(value.loginName),
    displayName: cleanText(value.displayName) || userId,
    employeeId: cleanText(value.employeeId),
    employeeName: cleanText(value.employeeName),
    accountStatus: cleanText(value.accountStatus),
    accountStatusLabel: cleanText(value.accountStatusLabel),
    roles: Array.isArray(value.roles) ? value.roles.map(cleanText).filter(Boolean) : [],
    roleLabels: Array.isArray(value.roleLabels) ? value.roleLabels.map(cleanText).filter(Boolean) : [],
    permissionAllowlist: Array.isArray(value.permissionAllowlist) ? value.permissionAllowlist.map(cleanText).filter(Boolean) : [],
    permissionDenylist: Array.isArray(value.permissionDenylist) ? value.permissionDenylist.map(cleanText).filter(Boolean) : [],
    effectiveButtonPermissions: Array.isArray(value.effectiveButtonPermissions) ? value.effectiveButtonPermissions.map(cleanText).filter(Boolean) : [],
    effectiveActionPermissions: Array.isArray(value.effectiveActionPermissions) ? value.effectiveActionPermissions.map(cleanText).filter(Boolean) : [],
    permissionRevision: Number(value.permissionRevision) || 0,
    effectivePermissionCount: Number(value.effectivePermissionCount) || 0,
    updatedAt: cleanText(value.updatedAt),
  };
}

function normalizePermissionCatalog(value) {
  return {
    roles: (Array.isArray(value?.roles) ? value.roles : []).map((role) => ({
      roleKey: cleanText(role.roleKey),
      displayName: cleanText(role.displayName),
      department: cleanText(role.department),
      permissionCount: Number(role.permissionCount) || 0,
    })).filter((role) => role.roleKey),
    permissions: (Array.isArray(value?.permissions) ? value.permissions : []).map((permission) => ({
      permissionKey: cleanText(permission.permissionKey),
      groupKey: cleanText(permission.groupKey),
      kinds: Array.isArray(permission.kinds) ? permission.kinds.map(cleanText).filter(Boolean) : [],
      roleKeys: Array.isArray(permission.roleKeys) ? permission.roleKeys.map(cleanText).filter(Boolean) : [],
    })).filter((permission) => permission.permissionKey),
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
