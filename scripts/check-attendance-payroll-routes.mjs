import assert from "node:assert/strict";
import { handleAttendancePayrollReadRoutes, handleAttendancePayrollWriteRoutes } from "../server/routes/attendancePayrollRoutes.mjs";

const calls = [];
const response = {};
const workspace = {
  users: [{ userId: "U-EMP-1", employeeId: "ERP-0001" }],
  payrollPolicyVersions: [],
  payrollRuns: [{ id: "PAY-1" }],
  payrollLines: [{ id: "LINE-1", payrollRunId: "PAY-1" }],
};
const writeActionPermissions = {
  viewOwnAttendance: "attendance.self.read",
  previewPayroll: "payroll.preview",
  exportPayroll: "payroll.export",
  syncAttendance: "attendance.sync",
  reviewAttendance: "attendance.review",
  managePayrollPolicy: "payroll.policy.manage",
  reviewPayroll: "payroll.review",
  lockPayroll: "payroll.lock",
  confirmPayrollPayment: "payroll.payment.confirm",
};
const service = {
  buildOwnAttendance(input) { calls.push({ kind: "self", ...input }); return { view: "self" }; },
  buildEmployeeAttendance(input) { calls.push({ kind: "employee", ...input }); return { view: "employee" }; },
  buildPayrollWorkbench(input) { calls.push({ kind: "workbench", ...input }); return { view: "workbench" }; },
  buildPayrollReadiness(input) { calls.push({ kind: "readiness", ...input }); return { view: "readiness" }; },
  buildPayrollHistory(input) { calls.push({ kind: "history", ...input }); return { view: "history" }; },
  async createPayrollExport(input) { calls.push({ kind: "export", ...input }); return { view: "export" }; },
  async precheckAttendanceSync(input) { calls.push({ kind: "sync-precheck", ...input }); return { checked: true }; },
  async syncAttendance(input) { calls.push({ kind: "sync", ...input }); return { synced: true }; },
  async reviewAttendanceDay(input) { calls.push({ kind: "day-review", ...input }); return { reviewed: true }; },
  async savePayrollPolicyVersion(input) { calls.push({ kind: "policy", ...input }); return { saved: true }; },
  async generatePayrollDraft(input) { calls.push({ kind: "draft", ...input }); return { generated: true }; },
  async updatePayrollLineAdjustment(input) { calls.push({ kind: "adjustment", ...input }); return { adjusted: true }; },
  async transitionPayrollRun(input) { calls.push({ kind: `transition-${input.action}`, ...input }); return { transitioned: true }; },
};
const common = {
  response,
  workspace,
  permissionContext: {},
  authContext: { userId: "U-EMP-1" },
  writeActionPermissions,
  requireActionPermission(_response, _context, permission) { calls.push({ kind: "permission", permission }); return true; },
  getPermissionOperatorId() { return "U-AUTH"; },
  attendancePayrollService: service,
  sendJson(_response, status, body) { calls.push({ kind: "response", status, body }); },
  sendNotFound() { calls.push({ kind: "not-found" }); },
};

await expectRead("/api/attendance/me?month=2026-08", "attendance.self.read", "self");
assert.equal(calls.find((call) => call.kind === "self").authContext.user.employeeId, "ERP-0001");
await expectRead("/api/attendance/employees/ERP-0001?month=2026-08", "payroll.preview", "employee");
await expectRead("/api/payroll/workbench?month=2026-08", "payroll.preview", "workbench");
await expectRead("/api/payroll/readiness?month=2026-08", "payroll.preview", "readiness");
await expectRead("/api/payroll/policy-versions", "payroll.preview", "response");
await expectRead("/api/payroll/employees/ERP-0001/history?limit=12", "payroll.preview", "history");
assert.equal(calls.find((call) => call.kind === "history").limit, "12");
await expectRead("/api/payroll/runs/PAY-1", "payroll.preview", "response");

await expectWrite("/api/attendance/sync-precheck", "attendance.sync", "sync-precheck", {});
await expectWrite("/api/attendance/sync", "attendance.sync", "sync", {});
await expectWrite("/api/attendance/employees/ERP-0001/days/2026-08-10/review", "attendance.review", "day-review", { employeeId: "ERP-0001", workDate: "2026-08-10" });
await expectWrite("/api/payroll/policy-versions", "payroll.policy.manage", "policy", {});
await expectWrite("/api/payroll/drafts", "payroll.review", "draft", {});
await expectWrite("/api/payroll/runs/PAY-1/export", "payroll.export", "export", { payrollRunId: "PAY-1" });
await expectWrite("/api/payroll/runs/PAY-1/lines/ERP-0001/adjustment", "payroll.review", "adjustment", { payrollRunId: "PAY-1", employeeId: "ERP-0001" });
await expectWrite("/api/payroll/runs/PAY-1/review", "payroll.review", "transition-review", { payrollRunId: "PAY-1", action: "review" });
await expectWrite("/api/payroll/runs/PAY-1/lock", "payroll.lock", "transition-lock", { payrollRunId: "PAY-1", action: "lock" });
await expectWrite("/api/payroll/runs/PAY-1/payment", "payroll.payment.confirm", "transition-payment", { payrollRunId: "PAY-1", action: "payment" });

calls.length = 0;
assert.equal(await handleAttendancePayrollReadRoutes({
  ...common,
  url: new URL("http://erp.test/api/attendance/me"),
  requireActionPermission() { return false; },
}), true);
assert.equal(calls.length, 0);

calls.length = 0;
assert.equal(await handleAttendancePayrollReadRoutes({
  ...common,
  url: new URL("http://erp.test/api/attendance/employees/ERP-0002?month=2026-08"),
  requireActionPermission(_response, _context, permission) {
    return permission === "attendance.self.read";
  },
}), true);
assert.equal(calls.some((call) => call.kind === "employee"), false, "self-attendance permission must never unlock a coworker's attendance route");
assert.equal(calls.some((call) => call.kind === "response"), false, "denied coworker reads must not return attendance data");

console.log("Attendance and payroll route checks passed.");

async function expectRead(path, permission, serviceCall) {
  calls.length = 0;
  const handled = await handleAttendancePayrollReadRoutes({ ...common, url: new URL(`http://erp.test${path}`) });
  assert.equal(handled, true);
  assert.equal(calls[0].kind, "permission");
  assert.equal(calls[0].permission, permission);
  assert.ok(calls.some((call) => call.kind === serviceCall));
  assert.ok(calls.some((call) => call.kind === "response"));
}

async function expectWrite(path, permission, serviceCall, identifiers) {
  calls.length = 0;
  const body = { example: true };
  const handled = await handleAttendancePayrollWriteRoutes({
    ...common,
    method: "POST",
    url: new URL(`http://erp.test${path}`),
    body,
  });
  assert.equal(handled, true);
  assert.equal(calls[0].kind, "permission");
  assert.equal(calls[0].permission, permission);
  const serviceRecord = calls.find((call) => call.kind === serviceCall);
  assert.ok(serviceRecord);
  assert.equal(serviceRecord.operatorId, "U-AUTH");
  assert.equal(serviceRecord.body, body);
  for (const [key, value] of Object.entries(identifiers)) assert.equal(serviceRecord[key], value);
  assert.ok(calls.some((call) => call.kind === "response"));
}
