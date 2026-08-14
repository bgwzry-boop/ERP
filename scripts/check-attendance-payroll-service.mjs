import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCreatePayrollRunQuery,
  buildImportPunchesQuery,
  buildRecordPayrollExportQuery,
  buildSavePayrollLineAdjustmentQuery,
  buildTransitionPayrollRunQuery,
  createLocalAttendancePayrollRepository,
} from "../server/attendancePayrollRepository.mjs";
import { createAttendancePayrollService } from "../server/services/attendancePayrollService.mjs";

const fixedNow = new Date("2026-09-02T10:00:00+08:00");
const sourcePunches = [
  ["P-1", "2026-08-10T07:55:00+08:00"],
  ["P-2", "2026-08-10T12:00:00+08:00"],
  ["P-3", "2026-08-10T13:00:00+08:00"],
  ["P-4", "2026-08-10T18:05:00+08:00"],
  ["P-5", "2026-08-11T07:58:00+08:00"],
  ["P-6", "2026-08-11T12:00:00+08:00"],
  ["P-7", "2026-08-11T13:00:00+08:00"],
].map(([id, punchedAt]) => ({
  externalPunchId: id,
  externalEmployeeId: "DL-1001",
  punchedAt,
}));

const repository = createLocalAttendancePayrollRepository();
const workspace = {
  users: [{ id: "U-EMP-1", userId: "U-EMP-1", employeeId: "ERP-0001", enabled: true, loginEnabled: true, passwordStatus: "active", mustChangePassword: false }],
  employees: [
    {
      id: "ERP-0001",
      name: "测试员工",
      roleName: "车间报工",
      defaultWorkshop: "1号车间",
      defaultMachineId: "BAG-01",
      profileStatus: "active",
      birthDate: "1990-03-01",
      hireDate: "2021-09-01",
      baseHourlyWage: 10,
      positionAllowanceHourly: 2,
      wageEffectiveFrom: "2026-01-01",
      attendanceProvider: "deli",
      attendanceExternalId: "DL-1001",
    },
    {
      id: "ERP-0098",
      name: "已离职员工",
      profileStatus: "departed",
      departedAt: "2026-07-31T18:00:00+08:00",
      attendanceProvider: "deli",
      attendanceExternalId: "DL-1098",
    },
    {
      id: "ERP-0099",
      name: "重复合并档案",
      profileStatus: "merged_duplicate",
      attendanceProvider: "deli",
      attendanceExternalId: "DL-1099",
    },
  ],
  attendanceImportBatches: [],
  attendancePunches: [],
  attendanceDayReviews: [],
  payrollPolicyVersions: [],
  payrollRuns: [],
  payrollLines: [],
  payrollLineAdjustments: [],
  payrollExportEvents: [],
  attendancePayrollRepository: repository,
};
const service = createAttendancePayrollService({
  now: () => new Date(fixedNow),
  attendanceProvider: { key: "deli", fetchPunches: async () => sourcePunches },
});

const beforePolicy = service.buildPayrollWorkbench({ workspace, month: "2026-08" });
assert.equal(beforePolicy.employees.length, 1);
assert.deepEqual(beforePolicy.employees.map((employee) => employee.employeeId), ["ERP-0001"]);
assert.equal(beforePolicy.employees[0].readyForDraft, false);
assert.ok(beforePolicy.employees[0].blockers.includes("计薪规则未发布"));
assert.ok(beforePolicy.employees[0].blockers.includes("本月无已关联打卡"));
assert.equal(beforePolicy.summary.draftReady, false);
const blockedReadiness = service.buildPayrollReadiness({ workspace, month: "2026-08" });
assert.equal(blockedReadiness.ready, false);
assert.ok(blockedReadiness.blockingCriteria.some((criterion) => criterion.key === "postgres_repository"));
assert.equal(JSON.stringify(blockedReadiness).includes("测试员工"), false);
assert.throws(
  () => service.buildPayrollWorkbench({ workspace, month: "2026-99" }),
  (error) => error.code === "PAYROLL_MONTH_INVALID" && error.statusCode === 400,
);
await assert.rejects(
  service.reviewAttendanceDay({
    workspace,
    employeeId: "ERP-0001",
    workDate: "2026-99-99",
    body: { status: "approved", explanation: "不应写入的无效日期。" },
    operatorId: "U-MANAGER-A",
  }),
  (error) => error.code === "ATTENDANCE_WORK_DATE_INVALID" && error.statusCode === 400,
);

const sourcePrecheck = await service.precheckAttendanceSync({
  workspace,
  body: { rangeStart: "2026-08-01T00:00:00+08:00", rangeEnd: "2026-09-01T00:00:00+08:00" },
});
assert.equal(sourcePrecheck.ready, true);
assert.equal(sourcePrecheck.summary.fetchedCount, 7);
assert.equal(sourcePrecheck.summary.matchedRecordCount, 7);
assert.equal(sourcePrecheck.summary.newRecordCount, 7);
assert.equal(sourcePrecheck.employeeMappingCoverage.mappedCount, 1);
assert.equal(sourcePrecheck.employeeMappingCoverage.totalCount, 1);
assert.equal(sourcePrecheck.importRecommended, true);
assert.equal(sourcePrecheck.safeguards.formalDataWritten, false);
assert.equal(workspace.attendancePunches.length, 0);
assert.equal(workspace.attendanceImportBatches.length, 0);
assert.equal(JSON.stringify(sourcePrecheck).includes("DL-1001"), false);
assert.equal(JSON.stringify(sourcePrecheck).includes("P-1"), false);

workspace.employees[0].attendanceExternalId = "";
const mappingBlockedPrecheck = await service.precheckAttendanceSync({
  workspace,
  body: { rangeStart: "2026-08-01T00:00:00+08:00", rangeEnd: "2026-09-01T00:00:00+08:00" },
});
assert.equal(mappingBlockedPrecheck.ready, false);
assert.equal(mappingBlockedPrecheck.summary.unmatchedRecordCount, 7);
assert.equal(mappingBlockedPrecheck.employeeMappingCoverage.mappedCount, 0);
assert.ok(mappingBlockedPrecheck.blockingReasons.some((item) => item.code === "EMPLOYEE_MAPPING_COVERAGE_INCOMPLETE"));
assert.equal(JSON.stringify(mappingBlockedPrecheck).includes("DL-1001"), false);
await assert.rejects(
  service.syncAttendance({
    workspace,
    body: { rangeStart: "2026-08-01T00:00:00+08:00", rangeEnd: "2026-09-01T00:00:00+08:00" },
    operatorId: "U-MANAGER-A",
  }),
  (error) => error.code === "ATTENDANCE_SYNC_PRECHECK_BLOCKED",
);
assert.equal(workspace.attendancePunches.length, 0);
assert.equal(workspace.attendanceImportBatches.length, 0);
workspace.employees[0].attendanceExternalId = "DL-1001";

const outOfRangeService = createAttendancePayrollService({
  now: () => new Date(fixedNow),
  attendanceProvider: {
    key: "deli",
    fetchPunches: async () => [{
      externalPunchId: "P-OUTSIDE",
      externalEmployeeId: "DL-1001",
      punchedAt: "2026-09-01T00:00:00+08:00",
    }],
  },
});
const outOfRangePrecheck = await outOfRangeService.precheckAttendanceSync({
  workspace,
  body: { rangeStart: "2026-08-01T00:00:00+08:00", rangeEnd: "2026-09-01T00:00:00+08:00" },
});
assert.equal(outOfRangePrecheck.ready, false);
assert.equal(outOfRangePrecheck.summary.outOfRangeRecordCount, 1);
assert.ok(outOfRangePrecheck.blockingReasons.some((item) => item.code === "OUT_OF_RANGE_SOURCE_RECORDS"));
await assert.rejects(
  outOfRangeService.syncAttendance({
    workspace,
    body: { rangeStart: "2026-08-01T00:00:00+08:00", rangeEnd: "2026-09-01T00:00:00+08:00" },
    operatorId: "U-MANAGER-A",
  }),
  (error) => error.code === "ATTENDANCE_SYNC_PRECHECK_BLOCKED",
);
assert.equal(workspace.attendancePunches.length, 0);
assert.equal(workspace.attendanceImportBatches.length, 0);

const malformedLocalDateService = createAttendancePayrollService({
  now: () => new Date(fixedNow),
  attendanceProvider: {
    key: "deli",
    fetchPunches: async () => [{
      externalPunchId: "P-BAD-LOCAL-DATE",
      externalEmployeeId: "DL-1001",
      punchedAt: "2026-08-10T07:55:00+08:00",
      localWorkDate: "2026-99-99",
    }],
  },
});
const malformedLocalDatePrecheck = await malformedLocalDateService.precheckAttendanceSync({
  workspace,
  body: { rangeStart: "2026-08-01T00:00:00+08:00", rangeEnd: "2026-09-01T00:00:00+08:00" },
});
assert.equal(malformedLocalDatePrecheck.ready, false);
assert.equal(malformedLocalDatePrecheck.summary.invalidRecordCount, 1);
assert.ok(malformedLocalDatePrecheck.blockingReasons.some((item) => item.code === "INVALID_SOURCE_RECORDS"));
await assert.rejects(
  malformedLocalDateService.syncAttendance({
    workspace,
    body: { rangeStart: "2026-08-01T00:00:00+08:00", rangeEnd: "2026-09-01T00:00:00+08:00" },
    operatorId: "U-MANAGER-A",
  }),
  (error) => error.code === "ATTENDANCE_SYNC_PRECHECK_BLOCKED",
);
assert.equal(workspace.attendancePunches.length, 0);
assert.equal(workspace.attendanceImportBatches.length, 0);

const firstImport = await service.syncAttendance({
  workspace,
  body: { rangeStart: "2026-08-01T00:00:00+08:00", rangeEnd: "2026-09-01T00:00:00+08:00" },
  operatorId: "U-MANAGER-A",
});
assert.equal(firstImport.batch.importedCount, 7);
assert.equal(workspace.attendancePunches.length, 7);
const importPunchesQuery = buildImportPunchesQuery(firstImport);
assert.match(importPunchesQuery.text, /WITH saved_batch AS/);
assert.match(importPunchesQuery.text, /inserted_punches AS/);
assert.doesNotMatch(importPunchesQuery.text, /BEGIN;/);
assert.doesNotMatch(importPunchesQuery.text, /COMMIT;/);

const duplicateImport = await service.syncAttendance({
  workspace,
  body: { rangeStart: "2026-08-01T00:00:00+08:00", rangeEnd: "2026-09-01T00:00:00+08:00" },
  operatorId: "U-MANAGER-A",
});
assert.equal(duplicateImport.batch.importedCount, 0);
assert.equal(duplicateImport.batch.duplicateCount, 7);
assert.equal(workspace.attendancePunches.length, 7);
const emptyImportPunchesQuery = buildImportPunchesQuery(duplicateImport);
assert.match(emptyImportPunchesQuery.text, /FROM attendance_punches CROSS JOIN saved_batch WHERE false/);
const repeatSourcePrecheck = await service.precheckAttendanceSync({
  workspace,
  body: { rangeStart: "2026-08-01T00:00:00+08:00", rangeEnd: "2026-09-01T00:00:00+08:00" },
});
assert.equal(repeatSourcePrecheck.ready, true);
assert.equal(repeatSourcePrecheck.summary.alreadyImportedRecordCount, 7);
assert.equal(repeatSourcePrecheck.summary.newRecordCount, 0);
assert.equal(repeatSourcePrecheck.importRecommended, false);

await assert.rejects(
  service.savePayrollPolicyVersion({
    workspace,
    body: {
      versionLabel: "错误日期范围",
      effectiveFrom: "2026-08-02",
      effectiveTo: "2026-08-01",
      status: "draft",
      policy: { regularMinutesPerDay: 480, overtimeMultiplier: 1.5 },
    },
    operatorId: "U-MANAGER-A",
  }),
  (error) => error.code === "PAYROLL_POLICY_DATE_RANGE_INVALID",
);
await assert.rejects(
  service.savePayrollPolicyVersion({
    workspace,
    body: {
      versionLabel: "错误工龄奖规则",
      effectiveFrom: "2026-08-01",
      status: "draft",
      policy: {
        regularMinutesPerDay: 480,
        overtimeMultiplier: 1.5,
        seniorityAwards: [{ minYears: "五年", monthlyAmount: 200 }],
      },
    },
    operatorId: "U-MANAGER-A",
  }),
  (error) => error.code === "PAYROLL_POLICY_SENIORITY_YEARS_INVALID",
);
await assert.rejects(
  service.savePayrollPolicyVersion({
    workspace,
    body: {
      versionLabel: "重复工龄奖档位",
      effectiveFrom: "2026-08-01",
      status: "draft",
      policy: {
        regularMinutesPerDay: 480,
        overtimeMultiplier: 1.5,
        seniorityAwards: [
          { minYears: 5, monthlyAmount: 200 },
          { minYears: 5, monthlyAmount: 300 },
        ],
      },
    },
    operatorId: "U-MANAGER-A",
  }),
  (error) => error.code === "PAYROLL_POLICY_SENIORITY_TIER_DUPLICATE",
);

await assert.rejects(
  service.savePayrollPolicyVersion({
    workspace,
    body: {
      versionLabel: "试图跳过草稿直接发布",
      effectiveFrom: "2026-08-01",
      status: "published",
      policy: {
        regularMinutesPerDay: 480,
        overtimeMultiplier: 1.5,
        seniorityAwards: [{ minYears: 5, monthlyAmount: 200 }],
      },
    },
    operatorId: "U-MANAGER-A",
  }),
  (error) => error.code === "PAYROLL_POLICY_DRAFT_REQUIRED",
);
const savedPolicyDraft = await service.savePayrollPolicyVersion({
  workspace,
  body: {
    versionLabel: "2026-08 正式计薪规则",
    effectiveFrom: "2026-08-01",
    status: "draft",
    policy: {
      regularMinutesPerDay: 480,
      overtimeMultiplier: 1.5,
      seniorityAwards: [{ minYears: 5, monthlyAmount: 200 }],
    },
  },
  operatorId: "U-MANAGER-A",
});
const savedPolicy = await service.savePayrollPolicyVersion({
  workspace,
  body: {
    id: savedPolicyDraft.policyVersion.id,
    versionLabel: savedPolicyDraft.policyVersion.versionLabel,
    effectiveFrom: savedPolicyDraft.policyVersion.effectiveFrom,
    status: "published",
    policy: savedPolicyDraft.policyVersion.policy,
  },
  operatorId: "U-MANAGER-A",
});
assert.equal(savedPolicy.policyVersion.createdBy, "U-MANAGER-A");
assert.equal(savedPolicy.policyVersion.policy.schemaVersion, "payroll-policy-v1");
assert.match(savedPolicy.policyVersion.integrityDigest, /^[a-f0-9]{64}$/);
const idempotentPolicyRetry = await service.savePayrollPolicyVersion({
  workspace,
  body: {
    id: savedPolicy.policyVersion.id,
    versionLabel: "2026-08 正式计薪规则",
    effectiveFrom: "2026-08-01",
    status: "published",
    policy: {
      regularMinutesPerDay: 480,
      overtimeMultiplier: 1.5,
      seniorityAwards: [{ minYears: 5, monthlyAmount: 200 }],
    },
  },
  operatorId: "U-MANAGER-A",
});
assert.equal(idempotentPolicyRetry.idempotent, true);
assert.throws(
  () => repository.savePolicyVersion({
    workspace,
    policyVersion: { ...savedPolicy.policyVersion, versionLabel: "绕过服务覆盖规则" },
  }),
  (error) => error.code === "PAYROLL_POLICY_PUBLISHED_IMMUTABLE",
);
await assert.rejects(
  service.savePayrollPolicyVersion({
    workspace,
    body: {
      id: savedPolicy.policyVersion.id,
      versionLabel: "试图覆盖已发布规则",
      effectiveFrom: "2026-08-01",
      status: "published",
      policy: {
        regularMinutesPerDay: 420,
        overtimeMultiplier: 2,
        seniorityAwards: [],
      },
    },
    operatorId: "U-MANAGER-A",
  }),
  (error) => error.code === "PAYROLL_POLICY_PUBLISHED_IMMUTABLE",
);
const conflictingPolicyDraft = await service.savePayrollPolicyVersion({
  workspace,
  body: {
    versionLabel: "冲突生效日期",
    effectiveFrom: "2026-08-01",
    status: "draft",
    policy: { regularMinutesPerDay: 480, overtimeMultiplier: 1.5 },
  },
  operatorId: "U-MANAGER-A",
});
await assert.rejects(
  service.savePayrollPolicyVersion({
    workspace,
    body: { ...conflictingPolicyDraft.policyVersion, status: "published" },
    operatorId: "U-MANAGER-A",
  }),
  (error) => error.code === "PAYROLL_POLICY_EFFECTIVE_DATE_CONFLICT",
);

const draftPolicy = await service.savePayrollPolicyVersion({
  workspace,
  body: {
    id: "PPV-CONTROLLED-DRAFT",
    versionLabel: "2027 年计薪规则草稿",
    effectiveFrom: "2027-01-01",
    status: "draft",
    createdBy: "U-SPOOFED-CREATOR",
    createdAt: "2000-01-01T00:00:00.000Z",
    policy: { regularMinutesPerDay: 480, overtimeMultiplier: 1.5, seniorityAwards: [] },
  },
  operatorId: "U-MANAGER-A",
});
assert.equal(draftPolicy.policyVersion.createdBy, "U-MANAGER-A");
assert.notEqual(draftPolicy.policyVersion.createdAt, "2000-01-01T00:00:00.000Z");
const publishedDraftPolicy = await service.savePayrollPolicyVersion({
  workspace,
  body: {
    id: "PPV-CONTROLLED-DRAFT",
    versionLabel: "2027 年计薪规则草稿",
    effectiveFrom: "2027-01-01",
    status: "published",
    policy: { regularMinutesPerDay: 480, overtimeMultiplier: 1.5, seniorityAwards: [] },
  },
  operatorId: "U-MANAGER-A",
});
assert.equal(publishedDraftPolicy.policyVersion.status, "published");
assert.equal(publishedDraftPolicy.policyVersion.createdBy, "U-MANAGER-A");
assert.equal(publishedDraftPolicy.policyVersion.createdAt, draftPolicy.policyVersion.createdAt);
assert.equal(publishedDraftPolicy.policyVersion.reviewedBy, "U-MANAGER-A");

const selfBeforeReview = service.buildOwnAttendance({
  workspace,
  authContext: { user: { employeeId: "ERP-0001" } },
  month: "2026-08",
});
assert.equal(selfBeforeReview.summary.pendingExceptionCount, 1);
assert.equal(selfBeforeReview.summary.estimatedExcludedDayCount, 1);
assert.equal(selfBeforeReview.payrollEstimate.totalWorkMinutes, 550);

await service.reviewAttendanceDay({
  workspace,
  employeeId: "ERP-0001",
  workDate: "2026-08-11",
  body: { status: "adjusted", adjustedWorkMinutes: 480, explanation: "员工提交漏卡说明，管理人员核对后补足工时。" },
  operatorId: "U-MANAGER-A",
});

const selfAfterReview = service.buildOwnAttendance({
  workspace,
  authContext: { user: { employeeId: "ERP-0001" } },
  month: "2026-08",
});
assert.equal(selfAfterReview.summary.pendingExceptionCount, 0);
assert.equal(selfAfterReview.payrollEstimate.totalWorkMinutes, 1030);
assert.equal(selfAfterReview.employee.seniorityYears, 4);
assert.equal(selfAfterReview.payrollEstimate.seniorityYears, 4);
assert.equal(selfAfterReview.payrollEstimate.seniorityAward, 0);

await service.reviewAttendanceDay({
  workspace,
  employeeId: "ERP-0001",
  workDate: "2026-08-11",
  body: { status: "rejected", explanation: "核对后确认该日异常打卡不计入本月工资。" },
  operatorId: "U-MANAGER-A",
});
const selfAfterRejectedReview = service.buildOwnAttendance({
  workspace,
  authContext: { user: { employeeId: "ERP-0001" } },
  month: "2026-08",
});
const rejectedDay = selfAfterRejectedReview.days.find((day) => day.workDate === "2026-08-11");
assert.equal(rejectedDay.status, "rejected");
assert.equal(rejectedDay.statusLabel, "暂不计薪");
assert.equal(rejectedDay.rawWorkMinutes, 242);
assert.equal(rejectedDay.workMinutes, 0);
assert.equal(selfAfterRejectedReview.summary.pendingExceptionCount, 0);
assert.equal(selfAfterRejectedReview.payrollEstimate.totalWorkMinutes, 550);

await service.reviewAttendanceDay({
  workspace,
  employeeId: "ERP-0001",
  workDate: "2026-08-11",
  body: { status: "adjusted", adjustedWorkMinutes: 480, explanation: "恢复本用例后续工资草稿所需的已确认工时。" },
  operatorId: "U-MANAGER-A",
});

const persistedPunches = workspace.attendancePunches;
workspace.attendancePunches = [];
const noAttendanceEstimate = service.buildOwnAttendance({
  workspace,
  authContext: { user: { employeeId: "ERP-0001" } },
  month: "2026-08",
});
assert.equal(noAttendanceEstimate.payrollEstimate, null);
assert.equal(noAttendanceEstimate.estimateStatus, "attendance_not_available");
workspace.attendancePunches = persistedPunches;

const verifiedImportBatches = workspace.attendanceImportBatches;
workspace.attendanceImportBatches = [];
await assert.rejects(
  service.generatePayrollDraft({ workspace, body: { month: "2026-08" }, operatorId: "U-FINANCE-A" }),
  (error) => error.code === "PAYROLL_ATTENDANCE_IMPORT_REQUIRED",
);
workspace.attendanceImportBatches = verifiedImportBatches;

workspace.attendanceImportBatches = [{
  ...verifiedImportBatches[0],
  rangeStart: "2026-07-31T16:00:00.000Z",
  rangeEnd: "2026-08-01T16:00:00.000Z",
}];
const partialCoverageWorkbench = service.buildPayrollWorkbench({ workspace, month: "2026-08" });
assert.equal(partialCoverageWorkbench.summary.verifiedAttendanceImportCount, 1);
assert.equal(partialCoverageWorkbench.summary.payrollPeriodClosed, true);
assert.equal(partialCoverageWorkbench.summary.attendanceCoverageComplete, false);
assert.equal(partialCoverageWorkbench.summary.attendanceCoverageGapCount, 1);
assert.equal(partialCoverageWorkbench.summary.draftReady, false);
const partialCoverageReadiness = service.buildPayrollReadiness({ workspace, month: "2026-08" });
const partialCoverageCriterion = partialCoverageReadiness.criteria.find((criterion) => criterion.key === "attendance_import");
assert.equal(partialCoverageCriterion.status, "pending");
assert.equal(partialCoverageCriterion.blocking, true);
assert.equal(partialCoverageCriterion.evidence.periodClosed, true);
assert.equal(partialCoverageCriterion.evidence.coverageGapCount, 1);
await assert.rejects(
  service.generatePayrollDraft({ workspace, body: { month: "2026-08" }, operatorId: "U-FINANCE-A" }),
  (error) => error.code === "PAYROLL_ATTENDANCE_COVERAGE_INCOMPLETE",
);
workspace.attendanceImportBatches = [
  {
    ...verifiedImportBatches[0],
    id: "ATB-FIRST-HALF",
    rangeStart: "2026-07-31T16:00:00.000Z",
    rangeEnd: "2026-08-14T16:00:00.000Z",
  },
  {
    ...verifiedImportBatches[0],
    id: "ATB-SECOND-HALF",
    rangeStart: "2026-08-14T16:00:00.000Z",
    rangeEnd: "2026-08-31T16:00:00.000Z",
  },
];
const combinedCoverageWorkbench = service.buildPayrollWorkbench({ workspace, month: "2026-08" });
assert.equal(combinedCoverageWorkbench.summary.verifiedAttendanceImportCount, 2);
assert.equal(combinedCoverageWorkbench.summary.attendanceCoverageComplete, true);
assert.equal(combinedCoverageWorkbench.summary.attendanceCoverageGapCount, 0);
assert.equal(combinedCoverageWorkbench.summary.draftReady, true);
workspace.attendanceImportBatches = verifiedImportBatches;

const readyWorkbench = service.buildPayrollWorkbench({ workspace, month: "2026-08" });
assert.equal(readyWorkbench.summary.verifiedAttendanceImportCount, 2);
assert.equal(readyWorkbench.summary.payrollPeriodClosed, true);
assert.equal(readyWorkbench.summary.attendanceCoverageComplete, true);
assert.equal(readyWorkbench.summary.attendanceCoverageGapCount, 0);
assert.equal(readyWorkbench.summary.draftReady, true);

const draft = await service.generatePayrollDraft({ workspace, body: { month: "2026-08" }, operatorId: "U-FINANCE-A" });
assert.equal(draft.payrollRun.status, "draft");
assert.equal(draft.payrollLines.length, 1);
assert.equal(draft.payrollLines[0].attendanceWorkMinutes, 1030);
assert.equal(draft.payrollLines[0].seniorityAward, 0);
assert.equal(draft.payrollLines[0].calculation.seniorityYears, 4);
assert.equal(draft.payrollLines[0].calculation.asOf, "2026-08-31T15:59:59.999Z");
const originalNetWage = draft.payrollLines[0].netWage;
const createRunQuery = buildCreatePayrollRunQuery({
  payrollRun: draft.payrollRun,
  payrollLines: draft.payrollLines,
  expectedLatestRevision: 0,
});
assert.match(createRunQuery.text, /pg_advisory_xact_lock/);
assert.match(createRunQuery.text, /SELECT MAX\(revision\)/);
assert.match(createRunQuery.text, /CROSS JOIN inserted_run/);
assert.doesNotMatch(createRunQuery.text, /BEGIN;/);
assert.doesNotMatch(createRunQuery.text, /ON CONFLICT \(id\) DO UPDATE/);
assert.throws(
  () => repository.createPayrollRun({
    workspace,
    payrollRun: { ...draft.payrollRun, id: "PAY-CONCURRENT-REVISION", generatedAt: fixedNow.toISOString() },
    payrollLines: draft.payrollLines.map((line) => ({ ...line, id: "PAYL-CONCURRENT", payrollRunId: "PAY-CONCURRENT-REVISION" })),
    expectedLatestRevision: 0,
  }),
  (error) => error.code === "PAYROLL_DRAFT_REVISION_CONFLICT" && error.statusCode === 409,
);

const payrollEvidenceAttachment = {
  ownerType: "payroll_run",
  ownerId: draft.payrollRun.id,
  purpose: "payroll_adjustment_evidence",
  uploadedBy: "U-FINANCE-A",
  status: "uploaded",
  fileType: "pdf",
  mimeType: "application/pdf",
  fileSize: 1024,
  hasContent: true,
  metadata: { employeeId: "ERP-0001" },
};
workspace.attachments = [
  { ...payrollEvidenceAttachment, attachmentId: "ATT-PAYROLL-ADJUSTMENT-1" },
  { ...payrollEvidenceAttachment, attachmentId: "ATT-PAYROLL-WRONG-OWNER", ownerId: "PAY-OTHER" },
  { ...payrollEvidenceAttachment, attachmentId: "ATT-PAYROLL-WRONG-UPLOADER", uploadedBy: "U-MANAGER-A" },
  { ...payrollEvidenceAttachment, attachmentId: "ATT-PAYROLL-WRONG-EMPLOYEE", metadata: { employeeId: "ERP-0002" } },
  { ...payrollEvidenceAttachment, attachmentId: "ATT-PAYROLL-NO-EMPLOYEE", metadata: {} },
  { ...payrollEvidenceAttachment, attachmentId: "ATT-PAYROLL-NO-CONTENT", hasContent: false },
];
const adjustmentAttempt = (evidenceAttachmentIds) => service.updatePayrollLineAdjustment({
  workspace,
  payrollRunId: draft.payrollRun.id,
  employeeId: "ERP-0001",
  operatorId: "U-FINANCE-A",
  body: {
    performanceAward: 300,
    leaveDeduction: 50,
    otherDeduction: 25,
    reason: "本月绩效确认；请假与其他扣款凭会计附件核定。",
    evidenceAttachmentIds,
  },
});
await assert.rejects(
  adjustmentAttempt([]),
  (error) => error.code === "PAYROLL_ADJUSTMENT_EVIDENCE_REQUIRED" && error.statusCode === 400,
);
await assert.rejects(
  adjustmentAttempt(["ATT-PAYROLL-WRONG-OWNER"]),
  (error) => error.code === "PAYROLL_ADJUSTMENT_EVIDENCE_OWNER_MISMATCH" && error.statusCode === 422,
);
await assert.rejects(
  adjustmentAttempt(["ATT-PAYROLL-WRONG-UPLOADER"]),
  (error) => error.code === "PAYROLL_ADJUSTMENT_EVIDENCE_UPLOADER_MISMATCH" && error.statusCode === 422,
);
await assert.rejects(
  adjustmentAttempt(["ATT-PAYROLL-WRONG-EMPLOYEE"]),
  (error) => error.code === "PAYROLL_ADJUSTMENT_EVIDENCE_EMPLOYEE_MISMATCH" && error.statusCode === 422,
);
await assert.rejects(
  adjustmentAttempt(["ATT-PAYROLL-NO-EMPLOYEE"]),
  (error) => error.code === "PAYROLL_ADJUSTMENT_EVIDENCE_EMPLOYEE_REQUIRED" && error.statusCode === 422,
);
await assert.rejects(
  adjustmentAttempt(["ATT-PAYROLL-NO-CONTENT"]),
  (error) => error.code === "PAYROLL_ADJUSTMENT_EVIDENCE_INVALID" && error.statusCode === 422,
);
assert.equal(workspace.payrollLineAdjustments.length, 0);

const adjusted = await adjustmentAttempt(["ATT-PAYROLL-ADJUSTMENT-1"]);
assert.equal(adjusted.payrollLine.performanceAward, 300);
assert.equal(adjusted.payrollLine.netWage, originalNetWage + 225);
assert.equal(workspace.payrollLineAdjustments.length, 1);
assert.deepEqual(workspace.payrollLineAdjustments[0].evidenceAttachmentIds, ["ATT-PAYROLL-ADJUSTMENT-1"]);
assert.deepEqual(workspace.payrollLineAdjustments[0].previousValues, {
  performanceAward: 0,
  leaveDeduction: 0,
  otherDeduction: 0,
});
const adjustmentQuery = buildSavePayrollLineAdjustmentQuery({
  payrollLine: adjusted.payrollLine,
  adjustment: adjusted.adjustment,
});
assert.match(adjustmentQuery.text, /UPDATE payroll_lines/);
assert.match(adjustmentQuery.text, /INSERT INTO payroll_line_adjustments/);
assert.match(adjustmentQuery.text, /payroll_runs\.status = 'draft'/);
assert.match(adjustmentQuery.text, /performance_award = /);
assert.doesNotMatch(adjustmentQuery.text, /BEGIN;/);
assert.doesNotMatch(adjustmentQuery.text, /COMMIT;/);
assert.ok(adjustmentQuery.values.includes("本月绩效确认；请假与其他扣款凭会计附件核定。"));

const history = service.buildPayrollHistory({ workspace, employeeId: "ERP-0001" });
assert.equal(history.total, 1);
assert.equal(history.items[0].adjustments.length, 1);
assert.equal(history.items[0].payrollLine.netWage, originalNetWage + 225);

const payrollExport = service.buildPayrollExport({ workspace, payrollRunId: draft.payrollRun.id });
assert.match(payrollExport.fileName, /工资表-2026-08-第1版-draft\.csv/);
assert.equal(payrollExport.rows.length, 1);
assert.equal(payrollExport.rows[0].name, "测试员工");
assert.equal(payrollExport.rows[0].netWage, originalNetWage + 225);
assert.match(payrollExport.digest, /^[a-f0-9]{64}$/);
await assert.rejects(
  service.createPayrollExport({
    workspace,
    payrollRunId: draft.payrollRun.id,
    operatorId: "U-FINANCE-A",
  }),
  (error) => error.code === "PAYROLL_EXPORT_REVIEW_REQUIRED" && error.statusCode === 409,
);
assert.equal(workspace.payrollExportEvents.length, 0);

const reviewed = await service.transitionPayrollRun({ workspace, payrollRunId: draft.payrollRun.id, action: "review", operatorId: "U-FINANCE-A" });
assert.equal(reviewed.payrollRun.status, "reviewed");
const formalExport = await service.createPayrollExport({
  workspace,
  payrollRunId: draft.payrollRun.id,
  operatorId: "U-FINANCE-A",
});
assert.equal(formalExport.exportEvent.runStatus, "reviewed");
assert.equal(formalExport.exportEvent.contentDigest, formalExport.digest);
assert.equal(formalExport.exportEvent.rowCount, 1);
assert.equal(formalExport.exportEvent.exportedBy, "U-FINANCE-A");
assert.equal(workspace.payrollExportEvents.length, 1);
const exportAuditQuery = buildRecordPayrollExportQuery({ exportEvent: formalExport.exportEvent });
assert.match(exportAuditQuery.text, /INSERT INTO payroll_export_events/);
assert.match(exportAuditQuery.text, /AND status = /);
assert.doesNotMatch(exportAuditQuery.text, /ON CONFLICT/);
const reviewTransitionQuery = buildTransitionPayrollRunQuery({
  payrollRun: reviewed.payrollRun,
  expectedStatus: "draft",
});
assert.match(reviewTransitionQuery.text, /WITH updated_run AS/);
assert.match(reviewTransitionQuery.text, /AND status = /);
assert.match(reviewTransitionQuery.text, /RETURNING \*/);
assert.doesNotMatch(reviewTransitionQuery.text, /UPDATE payroll_lines/);
assert.doesNotMatch(reviewTransitionQuery.text, /INSERT INTO payroll_lines/);
assert.throws(
  () => repository.transitionPayrollRun({
    workspace,
    payrollRun: reviewed.payrollRun,
    expectedStatus: "draft",
  }),
  (error) => error.code === "PAYROLL_RUN_TRANSITION_CONFLICT" && error.statusCode === 409,
);
await assert.rejects(
  service.updatePayrollLineAdjustment({
    workspace,
    payrollRunId: draft.payrollRun.id,
    employeeId: "ERP-0001",
    operatorId: "U-FINANCE-A",
    body: { performanceAward: 0, leaveDeduction: 0, otherDeduction: 0, reason: "复核后尝试修改" },
  }),
  (error) => error.code === "PAYROLL_LINE_ADJUSTMENT_LOCKED",
);
const locked = await service.transitionPayrollRun({ workspace, payrollRunId: draft.payrollRun.id, action: "lock", operatorId: "U-MANAGER-A" });
assert.equal(locked.payrollRun.status, "locked");
const paid = await service.transitionPayrollRun({ workspace, payrollRunId: draft.payrollRun.id, action: "payment", body: { paymentReference: "BANK-202608-001" }, operatorId: "U-FINANCE-A" });
assert.equal(paid.payrollRun.status, "paid");
assert.equal(paid.payrollRun.paymentReference, "BANK-202608-001");

const revisionTwo = await service.generatePayrollDraft({ workspace, body: { month: "2026-08" }, operatorId: "U-FINANCE-A" });
assert.equal(revisionTwo.payrollRun.revision, 2);
const boundedHistory = service.buildPayrollHistory({ workspace, employeeId: "ERP-0001", limit: 1 });
assert.equal(boundedHistory.total, 2);
assert.equal(boundedHistory.items.length, 1);
assert.equal(boundedHistory.items[0].payrollRun.revision, 2);

workspace.attendancePayrollRepository = { ...repository, kind: "postgres" };
const ready = service.buildPayrollReadiness({ workspace, month: "2026-08" });
assert.equal(ready.ready, true);
assert.equal(ready.summary.passedCount, ready.summary.totalCount);
assert.equal(ready.criteria.every((criterion) => criterion.blocking === false), true);
assert.equal(ready.safeguards.employeeIdentitiesExposed, false);

const futureMonthReadiness = service.buildPayrollReadiness({ workspace, month: "2026-09" });
assert.equal(futureMonthReadiness.ready, false);
const openMonthWorkbench = service.buildPayrollWorkbench({ workspace, month: "2026-09" });
assert.equal(openMonthWorkbench.summary.payrollPeriodClosed, false);
assert.equal(openMonthWorkbench.summary.attendanceCoverageComplete, false);
await assert.rejects(
  service.generatePayrollDraft({ workspace, body: { month: "2026-09" }, operatorId: "U-FINANCE-A" }),
  (error) => error.code === "PAYROLL_MONTH_NOT_CLOSED",
);
assert.equal(
  futureMonthReadiness.blockingCriteria.some((criterion) => criterion.key === "attendance_import"),
  true,
  "a successful import from another month must not satisfy the selected payroll month",
);
assert.equal(
  futureMonthReadiness.criteria.find((criterion) => criterion.key === "attendance_reviews")?.blocking,
  false,
  "a passed criterion must not be marked as currently blocking",
);

assert.throws(
  () => service.buildOwnAttendance({ workspace, authContext: { user: {} }, month: "2026-08" }),
  (error) => error.code === "ATTENDANCE_SELF_EMPLOYEE_ID_REQUIRED",
);

const employmentBoundaryRepository = createLocalAttendancePayrollRepository();
const employmentBoundaryPunches = [
  ["P-DEPART-1", "2026-08-10T07:55:00+08:00"],
  ["P-DEPART-2", "2026-08-10T12:00:00+08:00"],
  ["P-DEPART-3", "2026-08-10T13:00:00+08:00"],
  ["P-DEPART-4", "2026-08-10T18:05:00+08:00"],
].map(([externalPunchId, punchedAt]) => ({
  externalPunchId,
  externalEmployeeId: "DL-DEPARTED",
  punchedAt,
}));
const employmentBoundaryWorkspace = {
  users: [],
  employees: [
    {
      id: "ERP-DEPARTED-IN-AUGUST",
      name: "八月离职员工",
      roleName: "打包",
      profileStatus: "departed",
      birthDate: "1990-01-01",
      hireDate: "2020-01-01",
      departedAt: "2026-08-25T09:30:00+08:00",
      departureEffectiveDate: "2026-08-20",
      baseHourlyWage: 10,
      positionAllowanceHourly: 0,
      wageEffectiveFrom: "2026-01-01",
      attendanceProvider: "deli",
      attendanceExternalId: "DL-DEPARTED",
    },
    {
      id: "ERP-FUTURE-HIRE",
      name: "九月入职员工",
      roleName: "打包",
      profileStatus: "active",
      birthDate: "1995-01-01",
      hireDate: "2026-09-01",
      baseHourlyWage: 10,
      positionAllowanceHourly: 0,
      wageEffectiveFrom: "2026-09-01",
      attendanceProvider: "deli",
      attendanceExternalId: "DL-FUTURE",
    },
  ],
  attendanceImportBatches: [],
  attendancePunches: [],
  attendanceDayReviews: [],
  payrollPolicyVersions: [],
  payrollRuns: [],
  payrollLines: [],
  payrollLineAdjustments: [],
  payrollExportEvents: [],
  attendancePayrollRepository: employmentBoundaryRepository,
};
const employmentBoundaryService = createAttendancePayrollService({
  now: () => new Date(fixedNow),
  attendanceProvider: { key: "deli", fetchPunches: async () => employmentBoundaryPunches },
});
const boundaryPrecheck = await employmentBoundaryService.precheckAttendanceSync({
  workspace: employmentBoundaryWorkspace,
  body: { rangeStart: "2026-08-01T00:00:00+08:00", rangeEnd: "2026-09-01T00:00:00+08:00" },
});
assert.equal(boundaryPrecheck.ready, true);
assert.equal(boundaryPrecheck.employeeMappingCoverage.totalCount, 1);
assert.equal(boundaryPrecheck.employeeMappingCoverage.mappedCount, 1);
await employmentBoundaryService.syncAttendance({
  workspace: employmentBoundaryWorkspace,
  body: { rangeStart: "2026-08-01T00:00:00+08:00", rangeEnd: "2026-09-01T00:00:00+08:00" },
  operatorId: "U-MANAGER-A",
});
const boundaryPolicyDraft = await employmentBoundaryService.savePayrollPolicyVersion({
  workspace: employmentBoundaryWorkspace,
  body: {
    versionLabel: "八月离职结算规则",
    effectiveFrom: "2026-08-01",
    status: "draft",
    policy: { regularMinutesPerDay: 480, overtimeMultiplier: 1.5, seniorityAwards: [] },
  },
  operatorId: "U-MANAGER-A",
});
await employmentBoundaryService.savePayrollPolicyVersion({
  workspace: employmentBoundaryWorkspace,
  body: { ...boundaryPolicyDraft.policyVersion, status: "published" },
  operatorId: "U-MANAGER-A",
});
const boundaryWorkbench = employmentBoundaryService.buildPayrollWorkbench({
  workspace: employmentBoundaryWorkspace,
  month: "2026-08",
});
assert.deepEqual(
  boundaryWorkbench.employees.map((employee) => employee.employeeId),
  ["ERP-DEPARTED-IN-AUGUST"],
  "the final payroll month must include a departed employee and exclude a future hire",
);
assert.equal(
  boundaryWorkbench.employees[0].departureDate,
  "2026-08-20",
  "payroll must use the explicit final work date instead of the later account-departure audit timestamp",
);
assert.equal(boundaryWorkbench.summary.draftReady, true);
const boundaryPayrollDraft = await employmentBoundaryService.generatePayrollDraft({
  workspace: employmentBoundaryWorkspace,
  body: { month: "2026-08" },
  operatorId: "U-FINANCE-A",
});
assert.deepEqual(boundaryPayrollDraft.payrollLines.map((line) => line.employeeId), ["ERP-DEPARTED-IN-AUGUST"]);

const postDepartureService = createAttendancePayrollService({
  now: () => new Date(fixedNow),
  attendanceProvider: {
    key: "deli",
    fetchPunches: async () => [{
      externalPunchId: "P-AFTER-DEPARTURE",
      externalEmployeeId: "DL-DEPARTED",
      punchedAt: "2026-08-21T08:00:00+08:00",
    }],
  },
});
const postDeparturePrecheck = await postDepartureService.precheckAttendanceSync({
  workspace: employmentBoundaryWorkspace,
  body: { rangeStart: "2026-08-01T00:00:00+08:00", rangeEnd: "2026-09-01T00:00:00+08:00" },
});
assert.equal(postDeparturePrecheck.ready, false);
assert.equal(postDeparturePrecheck.summary.outOfEmploymentRecordCount, 1);
assert.ok(postDeparturePrecheck.blockingReasons.some((item) => item.code === "OUT_OF_EMPLOYMENT_RECORDS"));

const immutabilityMigration = readFileSync(
  new URL("../db/migrations/0039_payroll_policy_immutability.sql", import.meta.url),
  "utf8",
);
assert.match(immutabilityMigration, /trg_payroll_policy_immutable/);
assert.match(immutabilityMigration, /OLD\.status IN \('published', 'retired'\)/);
const payrollRunGuardMigration = readFileSync(
  new URL("../db/migrations/0040_payroll_run_state_guards.sql", import.meta.url),
  "utf8",
);
assert.match(payrollRunGuardMigration, /payroll_runs_month_check/);
assert.match(payrollRunGuardMigration, /trg_payroll_run_state_transition/);
assert.match(payrollRunGuardMigration, /OLD\.status = 'draft' AND NEW\.status = 'reviewed'/);
assert.match(payrollRunGuardMigration, /OLD\.status = 'reviewed' AND NEW\.status = 'locked'/);
assert.match(payrollRunGuardMigration, /OLD\.status = 'locked' AND NEW\.status = 'paid'/);
assert.match(payrollRunGuardMigration, /trg_payroll_line_draft_mutation/);
assert.match(payrollRunGuardMigration, /target_status IS DISTINCT FROM 'draft'/);
const payrollExportAuditMigration = readFileSync(
  new URL("../db/migrations/0041_payroll_export_audit.sql", import.meta.url),
  "utf8",
);
assert.match(payrollExportAuditMigration, /CREATE TABLE IF NOT EXISTS payroll_export_events/);
assert.match(payrollExportAuditMigration, /payroll_export_status_check/);
assert.match(payrollExportAuditMigration, /trg_payroll_export_audit_immutable/);
const employmentWindowMigration = readFileSync(
  new URL("../db/migrations/0043_employee_employment_window.sql", import.meta.url),
  "utf8",
);
assert.match(employmentWindowMigration, /ADD COLUMN IF NOT EXISTS departed_at TIMESTAMPTZ/);
assert.match(employmentWindowMigration, /employees_departure_boundary_required/);
assert.match(employmentWindowMigration, /idx_employees_employment_window/);

console.log("Attendance and payroll service checks passed.");
