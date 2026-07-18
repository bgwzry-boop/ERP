import assert from "node:assert/strict";
import {
  buildProductionEnvMinimumValueIntakeChecklist,
  buildProductionEnvMinimumValuesFragmentTemplate,
  buildProductionEnvValueIntakeChecklist,
  buildProductionEnvValuesFragmentTemplate,
  envTemplateAssignmentGroupsForItem,
  formatProductionEnvValueIntakeCsv,
  minimumProductionEnvValueRows,
  sanitizeEnvComment,
} from "./helpers/v1GoLiveHandoffProductionEnvIntake.mjs";

const fixChecklist = {
  included: true,
  ready: false,
  items: [
    {
      key: "v1-persistence-profile",
      label: "持久化|检查",
      ownerRole: "技术/管理",
      severity: "blocking",
      status: "blocked",
      configuredVariableCount: 0,
      missingVariables: ["ERP_V1_PERSISTENCE_PROFILE=postgres", "ERP_V1_DATABASE_URL or DATABASE_URL"],
      placeholderVariables: [],
      verificationSteps: ["预检", "连接测试"],
      nextAction: "填写连接串#不得写入交接包",
    },
    {
      key: "attachment-object-storage-env",
      label: "附件存储",
      ownerRole: "技术/管理",
      severity: "blocking",
      status: "blocked",
      configuredVariableCount: 0,
      missingVariables: ["ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY"],
      placeholderVariables: [],
      verificationSteps: ["对象存储预检"],
      nextAction: "填写真实值",
    },
    {
      key: "statement-export-object-storage-env",
      label: "对账导出",
      ownerRole: "技术/管理",
      severity: "blocking",
      status: "blocked",
      configuredVariableCount: 0,
      missingVariables: ["ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT"],
      placeholderVariables: [],
      verificationSteps: ["导出预检"],
      nextAction: "可选独立 bucket",
    },
  ],
};

const intake = buildProductionEnvValueIntakeChecklist(fixChecklist, "2026-07-16T10:00:00.000Z");
assert.equal(intake.status, "pending_real_values");
assert.equal(intake.rowCount, 5);
assert.equal(intake.chooseOneGroupCount, 1);
assert.equal(intake.safeguards.envValuesIncluded, false);
assert.equal(intake.rows.find((row) => row.variableKey === "ERP_V1_PERSISTENCE_PROFILE")?.safeLiteralValue, "postgres");
assert.equal(
  intake.rows.find((row) => row.variableKey === "ERP_STATEMENT_EXPORT_OBJECT_STORAGE_ENDPOINT")?.status,
  "optional_fallback",
);
assert.match(
  intake.rows.find((row) => row.variableKey === "ERP_V1_DATABASE_URL")?.alternativeRule || "",
  /任选其一，优先使用 ERP_V1_DATABASE_URL/,
);

const groups = envTemplateAssignmentGroupsForItem(fixChecklist.items[0]);
assert.equal(groups.length, 2);
assert.deepEqual(groups[1].assignments.map((assignment) => assignment.key), ["ERP_V1_DATABASE_URL", "DATABASE_URL"]);

const minimum = buildProductionEnvMinimumValueIntakeChecklist(intake);
assert.equal(minimum.rowCount, 2);
assert.equal(minimum.sourceRowCount, 5);
assert.equal(minimum.chooseOneGroupCount, 1);
assert.deepEqual(
  minimum.rows.map((row) => row.variableKey),
  ["ERP_V1_DATABASE_URL", "ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY"],
);
assert.deepEqual(minimumProductionEnvValueRows(null), []);

const fullFragment = buildProductionEnvValuesFragmentTemplate(intake);
const minimumFragment = buildProductionEnvMinimumValuesFragmentTemplate(intake);
assert.equal(fullFragment.rowCount, 5);
assert.equal(minimumFragment.rowCount, 2);
assert.match(minimumFragment.minimumBlockingTargetSignature, /alternative-group:ERP_V1_DATABASE_URL \/ DATABASE_URL/);
assert.match(minimumFragment.minimumBlockingTargetSignature, /variable:ERP_ATTACHMENT_OBJECT_STORAGE_SECRET_ACCESS_KEY/);
assert.equal(minimum.safeguards.safeLiteralRowsExcluded, true);
assert.equal(minimum.safeguards.optionalFallbackRowsExcluded, true);

const csv = formatProductionEnvValueIntakeCsv(intake.rows);
assert.match(csv, /"itemKey","label","ownerRole"/);
assert.match(csv, /"持久化\|检查"/);
assert.match(csv, /"ERP_V1_DATABASE_URL \/ DATABASE_URL"/);
assert.doesNotMatch(csv, /VALID_POSTGRESQL_CONNECTION_STRING|REAL_SECRET/);
assert.equal(sanitizeEnvComment("first#value\nsecond"), "first＃value second");

console.log("V1 go-live handoff production env intake checks passed: row projection, minimum blocking path, safe literals, CSV, and redaction are stable.");
