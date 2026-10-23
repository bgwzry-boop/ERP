const executionPermission = "fulfillment.warehouse.execute";
const dispatchPermission = "fulfillment.dispatch.update";
export const fulfillmentOperatorCandidatePermissions = Object.freeze([executionPermission, dispatchPermission]);

function isActiveEmployee(employee) {
  return employee.id && employee.name && !employee.departedAt && !["departed", "left", "retired", "inactive_employee", "merged_duplicate"].includes(String(employee.profileStatus ?? "").toLowerCase());
}

export function findAvailableFulfillmentDriver(workspace = {}, driverId) {
  const users = (workspace.users ?? []).filter(user => (user.userId ?? user.id) === driverId);
  if (users.length !== 1) return null;
  const user = users[0];
  if (user.enabled !== true || user.loginEnabled !== true || !Array.isArray(user.roles) || !user.roles.includes("driver")) return null;
  const employees = (workspace.employees ?? []).filter(employee => employee.userId === driverId || user.employeeId === employee.id);
  if (employees.length !== 1) return null;
  const employee = employees[0];
  if (!isActiveEmployee(employee) || (employee.userId && employee.userId !== driverId) || (user.employeeId && user.employeeId !== employee.id)) return null;
  return { userId: driverId, name: employee.name };
}

export function listFulfillmentOperatorCandidates({ workspace = {}, actionPermissions = [] } = {}) {
  const permissions = new Set(actionPermissions);
  const result = {};
  if (permissions.has(executionPermission)) result.warehouseExecutors = (workspace.employees ?? []).filter(isActiveEmployee).map(employee => ({ employeeId: employee.id, name: employee.name }));
  if (permissions.has(dispatchPermission)) result.drivers = [...new Set((workspace.users ?? []).map(user => user.userId ?? user.id))].map(id => findAvailableFulfillmentDriver(workspace, id)).filter(Boolean);
  return result;
}
