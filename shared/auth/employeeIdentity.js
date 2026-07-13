export const EMPLOYEE_NUMBER_MAX_LENGTH = 32;

const employeeNumberPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export function normalizeEmployeeNumber(value) {
  return String(value ?? "").trim();
}

export function normalizeEmployeeNumberKey(value) {
  return normalizeEmployeeNumber(value).toLowerCase();
}

export function isValidEmployeeNumber(value) {
  return employeeNumberPattern.test(normalizeEmployeeNumber(value));
}
