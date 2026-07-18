#!/usr/bin/env node

import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  normalizeEmployeeNumber,
  normalizeEmployeeNumberKey,
  isValidEmployeeNumber,
} from "../shared/auth/employeeIdentity.js";
import {
  normalizeV1RuntimeEmployeeRoleKey,
  normalizeV1RuntimeEmployeeRoleKeys,
  roleCatalog,
  splitV1RuntimeEmployeeRoleInputs,
  v1RuntimeEmployeeRoleKeys,
} from "../shared/auth/roleCatalog.js";
import { buildMasterDataImportTemplateWorkbook } from "../src/domain/masterDataImportTemplate.js";

const DEFAULT_DRAFT_PATH = join(
  ".erp-local-storage",
  "v1-d49-employee-intake",
  "employee-intake.draft.json",
);
const DEFAULT_WORKBOOK_PATH = join(
  ".erp-local-storage",
  "v1-d49-employee-intake",
  "d49-formal-employee-machine-import-draft.xlsx",
);
const MAX_DRAFT_BYTES = 512 * 1024;
const MAX_EMPLOYEE_ROWS = 500;

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(formatHelp());
  } else {
    if (!options.confirmControlledRebuild) throw new Error("confirmation_required");
    const draftPath = resolve(options.draftJson || DEFAULT_DRAFT_PATH);
    const workbookPath = resolve(options.outputFile || DEFAULT_WORKBOOK_PATH);
    const draft = loadControlledDraft(draftPath);
    const employees = normalizeEmployees(draft.employees);
    const identityMigrationCount = validateIdentityMigrations(draft.identityMigrations, employees);
    const workbook = buildMasterDataImportTemplateWorkbook({
      templateKey: "workshop",
      generatedAt: new Date().toISOString(),
      generatedBy: "D49 controlled intake",
      dataRowsByKey: {
        employees_machines: employees.map(projectEmployeeRow),
      },
    });
    writePrivateWorkbook(workbookPath, workbook);
    const result = buildResult(employees, workbook.length, identityMigrationCount);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : formatResult(result));
  }
} catch (error) {
  const code = safeErrorCode(error);
  const result = {
    version: "v1-d49-employee-intake-draft-build-v1",
    scope: "v1_d49_employee_intake_draft_build",
    status: "error",
    ready: false,
    error: {
      code,
      message: errorMessage(code),
    },
    safeguards: buildSafeguards(),
  };
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stderr.write(`D49 controlled intake build failed: ${result.error.message}\n`);
  process.exitCode = 1;
}

function loadControlledDraft(path) {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_DRAFT_BYTES) throw new Error("draft_unreadable");
  if ((stat.mode & 0o077) !== 0) throw new Error("draft_file_mode_unsafe");
  const draft = JSON.parse(readFileSync(path, "utf8"));
  if (draft?.scope !== "v1_d49_employee_intake_draft" || !Array.isArray(draft.employees)) {
    throw new Error("draft_contract_invalid");
  }
  if (!draft.employees.length || draft.employees.length > MAX_EMPLOYEE_ROWS) {
    throw new Error("draft_row_count_invalid");
  }
  return draft;
}

function normalizeEmployees(rows) {
  const employeeNumberKeys = new Set();
  return rows.map((row) => {
    const employeeName = cleanText(row?.employeeName, 80);
    const roleKey = normalizeV1RuntimeEmployeeRoleKey(row?.roleKey, row?.role);
    const additionalRoleInputs = splitV1RuntimeEmployeeRoleInputs([
      row?.additionalRoleKeys,
      row?.additionalRoles,
    ]);
    if (additionalRoleInputs.some((value) => !normalizeV1RuntimeEmployeeRoleKey(value, value))) {
      throw new Error("employee_role_invalid");
    }
    const roleKeys = normalizeV1RuntimeEmployeeRoleKeys([
      roleKey,
      additionalRoleInputs,
    ]);
    const employeeNumber = normalizeEmployeeNumber(row?.employeeNumber);
    if (!employeeName) throw new Error("employee_name_missing");
    if (!roleKey) throw new Error("employee_role_invalid");
    if (employeeNumber && !isValidEmployeeNumber(employeeNumber)) throw new Error("employee_number_invalid");
    if (employeeNumber) {
      const numberKey = normalizeEmployeeNumberKey(employeeNumber);
      if (employeeNumberKeys.has(numberKey)) throw new Error("employee_number_duplicate");
      employeeNumberKeys.add(numberKey);
    }
    return {
      employeeNumber,
      employeeName,
      roleKey,
      roleKeys,
      roleLabel: roleCatalog[roleKey].displayName,
      additionalRoleLabels: roleKeys
        .filter((candidate) => candidate !== roleKey)
        .map((candidate) => roleCatalog[candidate].displayName),
      defaultWorkshop: cleanText(row?.defaultWorkshop, 80),
      defaultMachine: cleanText(row?.defaultMachine, 80),
    };
  });
}

function projectEmployeeRow(employee) {
  return {
    员工编号: employee.employeeNumber,
    员工姓名: employee.employeeName,
    角色: employee.roleLabel,
    附加角色: employee.additionalRoleLabels.join("、"),
    默认车间: employee.defaultWorkshop,
    默认机台: employee.defaultMachine,
    基础时薪: "",
    "岗位补贴/小时": "",
    生效日期: "",
    机台编号: "",
    机台名称: "",
    机台车间: "",
    产能尺寸: "",
    粗略日产量: "",
    启用状态: "",
    备注: "",
  };
}

function validateIdentityMigrations(migrations, employees) {
  if (migrations === undefined) return 0;
  if (!Array.isArray(migrations)) throw new Error("identity_migrations_invalid");
  const employeeNumbers = new Set(employees.map((employee) => normalizeEmployeeNumberKey(employee.employeeNumber)));
  for (const migration of migrations) {
    const fromNumber = normalizeEmployeeNumber(migration?.fromEmployeeNumber);
    const toNumber = normalizeEmployeeNumber(migration?.toEmployeeNumber);
    if (!fromNumber || !toNumber || fromNumber === toNumber || !cleanText(migration?.reason, 120)) {
      throw new Error("identity_migrations_invalid");
    }
    if (!employeeNumbers.has(normalizeEmployeeNumberKey(fromNumber)) || !employeeNumbers.has(normalizeEmployeeNumberKey(toNumber))) {
      throw new Error("identity_migrations_invalid");
    }
  }
  return migrations.length;
}

function writePrivateWorkbook(path, bytes) {
  const outputDir = dirname(path);
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  chmodSync(outputDir, 0o700);
  const tempPath = `${path}.tmp-${process.pid}`;
  writeFileSync(tempPath, bytes, { mode: 0o600 });
  chmodSync(tempPath, 0o600);
  renameSync(tempPath, path);
  chmodSync(path, 0o600);
}

function buildResult(employees, workbookByteLength, identityMigrationCount) {
  const roleCounts = Object.fromEntries(v1RuntimeEmployeeRoleKeys.map((roleKey) => [roleKey, 0]));
  let missingEmployeeNumberCount = 0;
  for (const employee of employees) {
    for (const roleKey of employee.roleKeys) roleCounts[roleKey] += 1;
    if (!employee.employeeNumber) missingEmployeeNumberCount += 1;
  }
  const coveredRoleCount = Object.values(roleCounts).filter((count) => count > 0).length;
  return {
    version: "v1-d49-employee-intake-draft-build-v1",
    scope: "v1_d49_employee_intake_draft_build",
    status: "written",
    ready: true,
    summary: {
      employeeRowCount: employees.length,
      coveredRoleCount,
      requiredRoleCount: v1RuntimeEmployeeRoleKeys.length,
      coverageLabel: `${coveredRoleCount}/${v1RuntimeEmployeeRoleKeys.length}`,
      missingEmployeeNumberCount,
      identityMigrationCount,
      workbookByteLength,
    },
    roles: v1RuntimeEmployeeRoleKeys.map((roleKey) => ({
      roleKey,
      roleLabel: roleCatalog[roleKey].displayName,
      covered: roleCounts[roleKey] > 0,
      rowCount: roleCounts[roleKey],
    })),
    safeguards: buildSafeguards(),
  };
}

function buildSafeguards() {
  return {
    controlledRebuildConfirmed: process.argv.includes("--confirm-controlled-rebuild"),
    outputMode: "0600",
    employeeNamesIncluded: false,
    employeeNumbersIncluded: false,
    identityMigrationDetailsIncluded: false,
    draftPathIncluded: false,
    workbookPathIncluded: false,
    workbookDigestIncluded: false,
    formalDataWritten: false,
    serverPrecheckStillRequired: true,
  };
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--confirm-controlled-rebuild") options.confirmControlledRebuild = true;
    else if (arg === "--draft-json") options.draftJson = readArgValue(args, ++index, arg);
    else if (arg === "--output-file") options.outputFile = readArgValue(args, ++index, arg);
    else throw new Error("unknown_argument");
  }
  return options;
}

function readArgValue(args, index, label) {
  const value = String(args[index] || "").trim();
  if (!value || value.startsWith("--")) throw new Error(`missing_${label}`);
  return value;
}

function formatHelp() {
  return [
    "Usage: node scripts/run-d49-employee-intake-draft-build.mjs --confirm-controlled-rebuild [options]",
    "",
    "Options:",
    "  --draft-json <file>            Controlled Git-excluded intake draft JSON",
    "  --output-file <file>           Controlled Git-excluded employee-machine XLSX",
    "  --confirm-controlled-rebuild   Required before replacing the controlled XLSX",
    "  --json                         Print an identity-redacted result",
    "  --help                         Show this help",
    "",
    "The result never prints employee names, employee numbers, paths, workbook digests, or import rows.",
    "",
  ].join("\n");
}

function formatResult(result) {
  return [
    `D49 controlled intake workbook: ${result.status}`,
    `Rows: ${result.summary.employeeRowCount}`,
    `Role coverage: ${result.summary.coverageLabel}`,
    `Missing employee numbers: ${result.summary.missingEmployeeNumberCount}`,
    "",
  ].join("\n");
}

function safeErrorCode(error) {
  const code = String(error?.message || "draft_build_failed");
  return /^[a-z0-9_-]{1,80}$/.test(code) ? code : "draft_build_failed";
}

function errorMessage(code) {
  const messages = {
    confirmation_required: "需要显式确认后才能重建受控员工工作簿。",
    draft_unreadable: "受控员工草稿不可读取或文件过大。",
    draft_contract_invalid: "受控员工草稿格式不符合D49合同。",
    draft_file_mode_unsafe: "受控员工草稿权限必须为0600，避免员工资料被其他本机账号读取。",
    draft_row_count_invalid: "受控员工草稿行数为空或超过上限。",
    employee_name_missing: "受控员工草稿存在姓名缺失行。",
    employee_role_invalid: "受控员工草稿存在未知岗位。",
    employee_number_invalid: "受控员工草稿存在格式不合规的员工编号。",
    employee_number_duplicate: "受控员工草稿存在重复员工编号。",
    identity_migrations_invalid: "受控员工草稿的身份迁移证据不完整或与当前编号不一致。",
  };
  return messages[code] || "受控员工工作簿重建失败，请检查草稿格式后重试。";
}

function cleanText(value, maxLength) {
  return [...String(value ?? "").trim()]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? " " : character;
    })
    .join("")
    .slice(0, maxLength);
}
