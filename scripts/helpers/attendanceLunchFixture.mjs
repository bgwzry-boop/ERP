export const lunchTestMonth = "2026-09";
export const lunchTestDate = "2026-09-15";
export const lunchTestNow = "2026-10-24T02:00:00.000Z";

// Deliberately synthetic rates; no factory wage policy is inferred or published.
export function attendanceLunchFixture(repository, employeeId = "EMP-LUNCH-SYNTHETIC") {
  const workspace = {
    employees: [{ id: employeeId, name: "合成考勤员工", profileStatus: "active", roleName: "丝印", defaultWorkshop: "丝印车间",
      birthDate: "1990-01-01", hireDate: "2020-01-01", payrollPositionKey: "PAY-LUNCH-SYNTHETIC",
      attendanceProvider: "synthetic", attendanceExternalId: "PERSON-LUNCH-SYNTHETIC" }],
    users: [{ id: "U-MANAGER-A", employeeId, enabled: true, loginEnabled: true, passwordStatus: "active", mustChangePassword: false }],
    attendancePunches: [], attendanceDayReviews: [], payrollRuns: [], payrollLines: [], payrollLineAdjustments: [], payrollExportEvents: [],
    attendanceImportBatches: [{ id: "ATB-LUNCH-SYNTHETIC", provider: "synthetic", rangeStart: "2026-09-01T00:00:00+08:00",
      rangeEnd: "2026-10-01T00:00:00+08:00", status: "completed", fetchedCount: 2, importedCount: 2,
      duplicateCount: 0, unmatchedCount: 0, issues: [], requestedBy: "U-MANAGER-A", createdAt: lunchTestNow, completedAt: lunchTestNow }],
    payrollPolicyVersions: [{ id: "PPV-LUNCH-SYNTHETIC", versionLabel: "合成专项政策", status: "published", effectiveFrom: "2026-09-01", effectiveTo: "",
      policy: { schemaVersion: "payroll-policy-v2", regularMinutesPerDay: 480, overtimeMultiplier: 1, seniorityAwards: [],
        positionRates: [{ payrollPositionKey: "PAY-LUNCH-SYNTHETIC", positionName: "合成时薪", mode: "hourly", baseHourlyWage: 1, positionAllowanceHourly: 1 }] } }],
    attendancePayrollRepository: repository,
  };
  setLunchPunches(workspace, ["08:00", "18:00"]);
  return workspace;
}

export function setLunchPunches(workspace, times, workDate = lunchTestDate) {
  workspace.attendancePunches = times.map((time, index) => ({ id: `ATP-LUNCH-${index}`, provider: "synthetic",
    externalPunchId: `PUNCH-LUNCH-${index}`, employeeId: workspace.employees[0].id, externalEmployeeId: "PERSON-LUNCH-SYNTHETIC",
    punchedAt: `${workDate}T${time}:00+08:00`, localWorkDate: workDate, eventType: "punch", sourceHash: "a".repeat(64),
    rawPayload: { source: "synthetic-lunch-check" }, importBatchId: "ATB-LUNCH-SYNTHETIC", createdAt: lunchTestNow }));
}
