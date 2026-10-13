const catalog = [
  { key: "PAY-BAG", name: "制袋机-理袋女工", people: 10, mode: "hourly", baseHourlyWage: 10, positionAllowanceHourly: 5, scope: "1–9号制袋机", note: "原表包含3月14日前的调薪前记录" },
  { key: "PAY-PRINT", name: "印刷机-男工", people: 4, mode: "hourly", baseHourlyWage: 15, positionAllowanceHourly: 5, scope: "1–4号印刷机" },
  { key: "PAY-MALE", name: "普工-男杂工", people: 4, mode: "hourly", baseHourlyWage: 15, positionAllowanceHourly: 3, scope: "按车间安排", note: "原表包含3月份的调薪前记录" },
  { key: "PAY-FEMALE", name: "女杂工", people: 3, mode: "hourly", baseHourlyWage: 10, positionAllowanceHourly: 2, scope: "按车间安排", note: "原表包含3月份的调薪前记录" },
  { key: "PAY-LEAD", name: "普工组长", people: 1, mode: "hourly", baseHourlyWage: 15, positionAllowanceHourly: 5, scope: "生产车间" },
  { key: "PAY-WARE", name: "库管-女", people: 1, mode: "hourly", baseHourlyWage: 10, positionAllowanceHourly: 5, scope: "库房 / 出库" },
  { key: "PAY-OFFICE", name: "办公室-女", people: 2, mode: "hourly", baseHourlyWage: 10, positionAllowanceHourly: 2, scope: "办公室", note: "原表包含2–3月份的调薪前记录" },
  { key: "PAY-HANDLE", name: "提手-拿袋", people: 1, mode: "hourly", baseHourlyWage: 10, positionAllowanceHourly: 2, scope: "提手工序", note: "原表另保留早期“提手”岗位名称" },
  { key: "PAY-TECH", name: "技术工", people: 1, mode: "hourly", baseHourlyWage: 15, positionAllowanceHourly: 5, scope: "技术支持" },
  { key: "PAY-DRIVER", name: "送货司机", people: 2, mode: "daily", dailyWage: 180, scope: "送货 / 提货" },
];

export const PAYROLL_POSITION_CATALOG = Object.freeze(catalog.map((position) => Object.freeze({ ...position })));

export const PAYROLL_SENIORITY_AWARDS = Object.freeze([
  { minYears: 1, monthlyAmount: 30 },
  { minYears: 2, monthlyAmount: 45 },
  { minYears: 3, monthlyAmount: 60 },
  { minYears: 4, monthlyAmount: 75 },
  { minYears: 5, monthlyAmount: 90 },
  { minYears: 6, monthlyAmount: 105 },
  { minYears: 7, monthlyAmount: 120 },
  { minYears: 8, monthlyAmount: 135 },
]);

const byKey = new Map(PAYROLL_POSITION_CATALOG.map((position) => [position.key, position]));

export function findPayrollPosition(key) {
  return byKey.get(cleanText(key).toUpperCase()) ?? null;
}

export function payrollPositionPolicyRates() {
  return PAYROLL_POSITION_CATALOG.map((position) => position.mode === "daily"
    ? {
        payrollPositionKey: position.key,
        positionName: position.name,
        mode: position.mode,
        dailyWage: position.dailyWage,
      }
    : {
        payrollPositionKey: position.key,
        positionName: position.name,
        mode: position.mode,
        baseHourlyWage: position.baseHourlyWage,
        positionAllowanceHourly: position.positionAllowanceHourly,
      });
}

export function suggestPayrollPosition(employee = {}) {
  const current = findPayrollPosition(employee.payrollPositionKey);
  if (current) {
    return Object.freeze({ status: "confirmed", payrollPositionKey: current.key, candidates: [current.key], reasons: ["员工档案已维护工资岗位键"] });
  }

  const role = cleanText(employee.roleName ?? employee.role);
  const workshop = cleanText(employee.defaultWorkshop ?? employee.workshop);
  const machine = firstText(
    employee.configuredMachineLabel,
    employee.defaultMachineLabel,
    employee.defaultMachineId,
    employee.defaultMachine,
    employee.machineId,
    employee.machine,
  );
  const combined = `${role} ${workshop} ${machine}`;
  const deterministic = [];
  const reasons = [];

  if (/司机/.test(role)) addSuggestion(deterministic, reasons, "PAY-DRIVER", "权限岗位明确为司机");
  if (/技术|机修|运维/.test(role)) addSuggestion(deterministic, reasons, "PAY-TECH", "权限岗位明确为技术/机修/运维");
  if (/丝印/.test(workshop) || /^PRINT-0[1-4]$/i.test(machine) || /^[1-4]号(?:丝印|印刷)机$/.test(machine)) {
    addSuggestion(deterministic, reasons, "PAY-PRINT", "丝印车间或固定印刷机台");
  }
  if (/提手/.test(combined)) addSuggestion(deterministic, reasons, "PAY-HANDLE", "工作安排明确为提手工序");
  if (/^[1-9]号(?:制袋)?机$/.test(machine)) addSuggestion(deterministic, reasons, "PAY-BAG", "固定绑定1–9号制袋机");

  const exact = unique(deterministic);
  if (exact.length === 1) {
    return Object.freeze({ status: "suggested", payrollPositionKey: exact[0], candidates: exact, reasons: Object.freeze(reasons) });
  }
  if (exact.length > 1) {
    return Object.freeze({ status: "ambiguous", payrollPositionKey: "", candidates: Object.freeze(exact), reasons: Object.freeze(reasons) });
  }

  const rateCandidates = legacyRateCandidates(employee);
  return Object.freeze({
    status: rateCandidates.length === 1 ? "suggested" : rateCandidates.length > 1 ? "ambiguous" : "unmatched",
    payrollPositionKey: rateCandidates.length === 1 ? rateCandidates[0] : "",
    candidates: Object.freeze(rateCandidates),
    reasons: Object.freeze(rateCandidates.length ? ["仅按旧工资字段匹配；保存前仍需负责人复核"] : []),
  });
}

function legacyRateCandidates(employee) {
  const baseHourlyWage = finiteOrNull(employee.baseHourlyWage);
  const positionAllowanceHourly = finiteOrNull(employee.positionAllowanceHourly);
  const dailyWage = finiteOrNull(employee.dailyWage);
  if (dailyWage !== null && dailyWage > 0) {
    return PAYROLL_POSITION_CATALOG
      .filter((position) => position.mode === "daily" && position.dailyWage === dailyWage)
      .map((position) => position.key);
  }
  if (baseHourlyWage === null || baseHourlyWage <= 0 || positionAllowanceHourly === null) return [];
  return PAYROLL_POSITION_CATALOG
    .filter((position) => position.mode === "hourly" && position.baseHourlyWage === baseHourlyWage && position.positionAllowanceHourly === positionAllowanceHourly)
    .map((position) => position.key);
}

function addSuggestion(keys, reasons, key, reason) {
  keys.push(key);
  reasons.push(reason);
}

function unique(values) {
  return [...new Set(values)];
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}
