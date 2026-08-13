function parseDateParts(value) {
  const match = String(value || "").trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null;

  return {
    year,
    month,
    day,
    label: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function todayParts(today) {
  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  };
}

function compareDateParts(left, right) {
  return (left.year - right.year) || (left.month - right.month) || (left.day - right.day);
}

export function formatEmployeeAge(birthDate, today = new Date()) {
  const birth = parseDateParts(birthDate);
  if (!birth) return birthDate ? "日期待核对" : "未维护";

  const current = todayParts(today);
  if (compareDateParts(birth, current) > 0) return "日期待核对";

  let years = current.year - birth.year;
  if (current.month < birth.month || (current.month === birth.month && current.day < birth.day)) years -= 1;
  return `${years}岁`;
}

export function formatEmployeeTenure(hireDate, today = new Date()) {
  const hire = parseDateParts(hireDate);
  if (!hire) return hireDate ? "日期待核对" : "待维护入职日期";

  const current = todayParts(today);
  if (compareDateParts(hire, current) > 0) return "日期待核对";

  let totalMonths = (current.year - hire.year) * 12 + current.month - hire.month;
  if (current.day < hire.day) totalMonths -= 1;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (!years) return `${months}个月`;
  if (!months) return `${years}年`;
  return `${years}年${months}个月`;
}

export function buildEmployeeProfile(employee = {}, today = new Date()) {
  const birthDate = employee.birthDate || employee.dateOfBirth || employee.birthday || "";
  const hireDate = employee.hireDate || employee.entryDate || employee.employmentStartedAt || employee.joinedAt || "";
  const parsedHireDate = parseDateParts(hireDate);
  const status = String(employee.status || "").toLowerCase();
  const employmentStatus = status === "departed"
    ? "已离职"
    : /merged|retired|voided/.test(status)
      ? "已停用"
      : "在职";

  return {
    birthDate: parseDateParts(birthDate)?.label || (birthDate ? "日期待核对" : "未维护"),
    age: formatEmployeeAge(birthDate, today),
    hireDate: parsedHireDate?.label || (hireDate ? "日期待核对" : "未维护"),
    tenure: formatEmployeeTenure(hireDate, today),
    employmentStatus,
  };
}
