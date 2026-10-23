const executionPermission = "fulfillment.warehouse.execute";
const dispatchPermission = "fulfillment.dispatch.update";
export const fulfillmentOperatorCandidatePermissions = Object.freeze([executionPermission, dispatchPermission]);

export function listFulfillmentOperatorCandidates({ workspace = {}, actionPermissions = [] } = {}) {
  const permissions = new Set(actionPermissions);
  const employees = (workspace.employees ?? []).filter(employee => employee.id && employee.name && !employee.departedAt && !["departed", "left", "retired", "inactive_employee", "merged_duplicate"].includes(String(employee.profileStatus ?? "").toLowerCase()));
  const result = {};
  if (permissions.has(executionPermission)) result.warehouseExecutors = employees.map(employee => ({ employeeId: employee.id, name: employee.name }));
  if (permissions.has(dispatchPermission)) {
    const users = workspace.users ?? [];
    result.drivers = employees.flatMap(employee => {
      const matches = users.filter(user => employee.userId ? (user.userId ?? user.id) === employee.userId : user.employeeId === employee.id);
      if (matches.length !== 1) return [];
      const user = matches[0];
      return user.enabled === true && user.loginEnabled === true && (user.roles ?? []).includes("driver")
        ? [{ userId: user.userId ?? user.id, name: employee.name }]
        : [];
    });
  }
  return result;
}
