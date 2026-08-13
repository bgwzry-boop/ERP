import {
  readOfficeApiJson,
  requestOfficeApi,
  toOfficeApiError,
} from "./officeApiClientCore.js";

export function getOfficePayrollWorkbench(input = {}, options = {}) {
  return requestJson(`/payroll/workbench?month=${encodeURIComponent(input.month || "")}`, {
    ...options,
    authState: input.authState,
    operatorId: input.operatorId,
  }, "工资核算工作台读取失败。");
}

export function getOfficeEmployeeAttendance(input = {}, options = {}) {
  return requestJson(
    `/attendance/employees/${encodeURIComponent(input.employeeId || "")}?month=${encodeURIComponent(input.month || "")}`,
    { ...options, authState: input.authState, operatorId: input.operatorId },
    "员工考勤读取失败。",
  );
}

export function getMyOfficeAttendance(input = {}, options = {}) {
  return requestJson(`/attendance/me?month=${encodeURIComponent(input.month || "")}`, {
    ...options,
    authState: input.authState,
    operatorId: input.operatorId,
  }, "本人考勤读取失败。");
}

export function syncOfficeAttendance(input = {}, options = {}) {
  return requestJson("/attendance/sync", {
    ...options,
    authState: input.authState,
    operatorId: input.operatorId,
    method: "POST",
    body: { rangeStart: input.rangeStart, rangeEnd: input.rangeEnd },
  }, "考勤同步失败。");
}

export function precheckOfficeAttendanceSync(input = {}, options = {}) {
  return requestJson("/attendance/sync-precheck", {
    ...options,
    authState: input.authState,
    operatorId: input.operatorId,
    method: "POST",
    body: { rangeStart: input.rangeStart, rangeEnd: input.rangeEnd },
  }, "考勤来源预检失败。");
}

export function reviewOfficeAttendanceDay(input = {}, options = {}) {
  return requestJson(
    `/attendance/employees/${encodeURIComponent(input.employeeId || "")}/days/${encodeURIComponent(input.workDate || "")}/review`,
    {
      ...options,
      authState: input.authState,
      operatorId: input.operatorId,
      method: "POST",
      body: {
        status: input.status,
        explanation: input.explanation,
        adjustedWorkMinutes: input.adjustedWorkMinutes,
        evidenceAttachmentIds: input.evidenceAttachmentIds,
      },
    },
    "考勤复核失败。",
  );
}

export function saveOfficePayrollPolicy(input = {}, options = {}) {
  return requestJson("/payroll/policy-versions", {
    ...options,
    authState: input.authState,
    operatorId: input.operatorId,
    method: "POST",
    body: input.policyVersion,
  }, "计薪规则保存失败。");
}

export function generateOfficePayrollDraft(input = {}, options = {}) {
  return requestJson("/payroll/drafts", {
    ...options,
    authState: input.authState,
    operatorId: input.operatorId,
    method: "POST",
    body: { month: input.month },
  }, "工资草稿生成失败。");
}

export function getOfficePayrollRun(input = {}, options = {}) {
  return requestJson(`/payroll/runs/${encodeURIComponent(input.payrollRunId || "")}`, {
    ...options,
    authState: input.authState,
    operatorId: input.operatorId,
  }, "工资批次读取失败。");
}

export function getOfficePayrollHistory(input = {}, options = {}) {
  return requestJson(
    `/payroll/employees/${encodeURIComponent(input.employeeId || "")}/history?limit=${encodeURIComponent(input.limit || 24)}`,
    { ...options, authState: input.authState, operatorId: input.operatorId },
    "历史工资读取失败。",
  );
}

export function createOfficePayrollExport(input = {}, options = {}) {
  return requestJson(`/payroll/runs/${encodeURIComponent(input.payrollRunId || "")}/export`, {
    ...options,
    authState: input.authState,
    operatorId: input.operatorId,
    method: "POST",
    body: {},
  }, "工资表导出失败。");
}

export function updateOfficePayrollLineAdjustment(input = {}, options = {}) {
  return requestJson(
    `/payroll/runs/${encodeURIComponent(input.payrollRunId || "")}/lines/${encodeURIComponent(input.employeeId || "")}/adjustment`,
    {
      ...options,
      authState: input.authState,
      operatorId: input.operatorId,
      method: "POST",
      body: {
        performanceAward: input.performanceAward,
        leaveDeduction: input.leaveDeduction,
        otherDeduction: input.otherDeduction,
        reason: input.reason,
        evidenceAttachmentIds: input.evidenceAttachmentIds,
      },
    },
    "工资调整保存失败。",
  );
}

export function transitionOfficePayrollRun(input = {}, options = {}) {
  return requestJson(
    `/payroll/runs/${encodeURIComponent(input.payrollRunId || "")}/${encodeURIComponent(input.action || "")}`,
    {
      ...options,
      authState: input.authState,
      operatorId: input.operatorId,
      method: "POST",
      body: { paymentReference: input.paymentReference },
    },
    "工资批次状态更新失败。",
  );
}

async function requestJson(path, options, fallbackMessage) {
  try {
    const response = await requestOfficeApi(path, options);
    const json = await readOfficeApiJson(response);
    if (!response.ok) {
      return { blocked: true, source: "api_error", error: toOfficeApiError(json, response.status, fallbackMessage) };
    }
    return { blocked: false, source: "api", data: json };
  } catch (error) {
    return {
      blocked: true,
      source: "api_error",
      error: { code: "ATTENDANCE_PAYROLL_API_UNAVAILABLE", message: error?.message || fallbackMessage },
    };
  }
}
