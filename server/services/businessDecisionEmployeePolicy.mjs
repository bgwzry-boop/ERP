const invalidEmployeeStatuses = new Set([
  "departed", "left", "retired", "void", "voided", "merged", "merged_duplicate", "inactive_employee",
]);

export function validateFormalBusinessDecisionMaker(workspace, employeeId) {
  const id = cleanText(employeeId);
  const employee = (workspace?.employees ?? []).find((item) => cleanText(item.id ?? item.employeeId) === id);
  if (!id || !employee || !cleanText(employee.name)) return error(422, "BUSINESS_DECISION_AUTHORIZATION_EMPLOYEE_INVALID", "业务决定人必须是有效正式员工档案。");
  const source = cleanText(employee.sourceType ?? employee.source ?? employee.source_type).toLowerCase();
  if (["seed", "demo", "synthetic", "real_sample", "isolated_test_fixture"].some((value) => source.includes(value))) {
    return error(422, "BUSINESS_DECISION_AUTHORIZATION_EMPLOYEE_NOT_FORMAL", "演示、种子或样例员工不能获得经营决定授权。");
  }
  const status = cleanText(employee.profileStatus ?? employee.profile_status).toLowerCase();
  if (invalidEmployeeStatuses.has(status) || ["depart", "retir", "void", "merged"].some((value) => status.includes(value))) {
    return error(422, "BUSINESS_DECISION_AUTHORIZATION_EMPLOYEE_STATUS_INVALID", "离职、作废或已合并员工不能获得经营决定授权。");
  }
  return { ok: true, employee };
}

function error(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}

function cleanText(value) {
  return String(value ?? "").trim();
}
