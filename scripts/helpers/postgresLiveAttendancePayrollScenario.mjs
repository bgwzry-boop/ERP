import assert from "node:assert/strict";

export async function checkPostgresLiveAttendancePayrollScenario({ repository, runPsql }) {
  const imported = await repository.importPunches({
    workspace: attendancePayrollWorkspace(),
    batch: {
      id: "ATB-LIVE-PAYROLL-202608",
      provider: "deli",
      rangeStart: "2026-08-01T00:00:00.000+08:00",
      rangeEnd: "2026-09-01T00:00:00.000+08:00",
      status: "completed",
      fetchedCount: 1,
      importedCount: 1,
      duplicateCount: 0,
      unmatchedCount: 0,
      issues: [],
      requestedBy: "U-FINANCE-A",
      createdAt: "2026-09-02T00:30:00.000Z",
      completedAt: "2026-09-02T00:30:00.000Z",
    },
    punches: [{
      id: "ATP-LIVE-PAYROLL-001",
      provider: "deli",
      externalPunchId: "DELI-LIVE-PUNCH-001",
      employeeId: "EMP-LIVE-MANAGER-001",
      externalEmployeeId: "DELI-LIVE-MANAGER-001",
      punchedAt: "2026-08-03T08:01:00.000+08:00",
      localWorkDate: "2026-08-03",
      eventType: "punch",
      sourceHash: "b".repeat(64),
      rawPayload: { source: "postgres-live" },
      createdAt: "2026-09-02T00:30:00.000Z",
    }],
  });
  assert.equal(imported.batch.id, "ATB-LIVE-PAYROLL-202608");
  assert.equal(imported.punches.length, 1);
  const duplicateOnlyImport = await repository.importPunches({
    workspace: attendancePayrollWorkspace(),
    batch: {
      ...imported.batch,
      id: "ATB-LIVE-PAYROLL-202608-DUPLICATE",
      importedCount: 0,
      duplicateCount: 1,
    },
    punches: [],
  });
  assert.equal(duplicateOnlyImport.batch.id, "ATB-LIVE-PAYROLL-202608-DUPLICATE");
  assert.equal(duplicateOnlyImport.punches.length, 0);

  const policyWorkspace = attendancePayrollWorkspace();
  const policyVersion = {
    id: "PPV-LIVE-PAYROLL-202608",
    versionLabel: "PostgreSQL live payroll policy",
    status: "published",
    effectiveFrom: "2026-08-01",
    effectiveTo: "",
    policy: { schemaVersion: "payroll-policy-v1", regularMinutesPerDay: 480, overtimeMultiplier: 1.5, seniorityAwards: [] },
    integrityDigest: "a".repeat(64),
    createdBy: "U-MANAGER-A",
    reviewedBy: "U-MANAGER-A",
    reviewedAt: "2026-09-02T01:00:00.000Z",
    publishedAt: "2026-09-02T01:00:00.000Z",
    createdAt: "2026-09-02T01:00:00.000Z",
    updatedAt: "2026-09-02T01:00:00.000Z",
  };
  await repository.savePolicyVersion({ workspace: policyWorkspace, policyVersion });

  const candidateA = payrollDraftCandidate("PAY-LIVE-CONCURRENT-A", "PAYL-LIVE-CONCURRENT-A");
  const candidateB = payrollDraftCandidate("PAY-LIVE-CONCURRENT-B", "PAYL-LIVE-CONCURRENT-B");
  const createResults = await Promise.allSettled([
    repository.createPayrollRun({
      workspace: attendancePayrollWorkspace(),
      ...candidateA,
      expectedLatestRevision: 0,
    }),
    repository.createPayrollRun({
      workspace: attendancePayrollWorkspace(),
      ...candidateB,
      expectedLatestRevision: 0,
    }),
  ]);
  const created = exactlyOneSuccess(createResults, "PAYROLL_DRAFT_REVISION_CONFLICT");
  assert.equal(
    Number(runPsql("SELECT COUNT(*) FROM payroll_runs WHERE payroll_month = '2026-08' AND revision = 1;", { capture: true }).trim()),
    1,
  );
  assert.equal(created.payrollRun.status, "draft");
  assert.equal(created.payrollLines.length, 1);

  const adjustmentResults = await Promise.allSettled([
    repository.savePayrollLineAdjustment(payrollAdjustmentCandidate(created, "PAYA-LIVE-CONCURRENT-A", 100)),
    repository.savePayrollLineAdjustment(payrollAdjustmentCandidate(created, "PAYA-LIVE-CONCURRENT-B", 200)),
  ]);
  const adjusted = exactlyOneSuccess(adjustmentResults, "PAYROLL_LINE_ADJUSTMENT_CONFLICT");
  assert.equal(
    Number(runPsql(`SELECT COUNT(*) FROM payroll_line_adjustments WHERE payroll_run_id = '${created.payrollRun.id}';`, { capture: true }).trim()),
    1,
  );
  assert.equal(adjusted.adjustment.evidenceAttachmentIds.length, 1);
  assert.equal(
    runPsql(
      `SELECT evidence_attachment_ids_json->>0 FROM payroll_line_adjustments WHERE id = '${adjusted.adjustment.id}';`,
      { capture: true },
    ).trim(),
    adjusted.adjustment.evidenceAttachmentIds[0],
  );
  assert.throws(
    () => runPsql(
      `UPDATE payroll_line_adjustments SET evidence_attachment_ids_json = '[]'::jsonb WHERE id = '${adjusted.adjustment.id}';`,
    ),
    /payroll line adjustments are immutable/i,
  );

  const reviewedTarget = {
    ...created.payrollRun,
    status: "reviewed",
    reviewedBy: "U-FINANCE-A",
    reviewedAt: "2026-09-02T02:00:00.000Z",
    updatedAt: "2026-09-02T02:00:00.000Z",
  };
  const reviewResults = await Promise.allSettled([
    repository.transitionPayrollRun({
      workspace: workspaceWithRun(created),
      payrollRun: reviewedTarget,
      expectedStatus: "draft",
    }),
    repository.transitionPayrollRun({
      workspace: workspaceWithRun(created),
      payrollRun: { ...reviewedTarget },
      expectedStatus: "draft",
    }),
  ]);
  const reviewed = exactlyOneSuccess(reviewResults, "PAYROLL_RUN_TRANSITION_CONFLICT");
  assert.equal(reviewed.payrollRun.reviewedBy, "U-FINANCE-A");
  assert.equal(reviewed.payrollLines[0].netWage, adjusted.payrollLine.netWage);
  const recordedExport = await repository.recordPayrollExport({
    workspace: workspaceWithRun(reviewed),
    exportEvent: {
      id: "PAYX-LIVE-REVIEWED-001",
      payrollRunId: reviewed.payrollRun.id,
      payrollMonth: reviewed.payrollRun.payrollMonth,
      revision: reviewed.payrollRun.revision,
      runStatus: reviewed.payrollRun.status,
      fileName: "工资表-2026-08-第1版-reviewed.csv",
      contentDigest: "c".repeat(64),
      rowCount: reviewed.payrollLines.length,
      exportedBy: "U-FINANCE-A",
      exportedAt: "2026-09-02T02:15:00.000Z",
    },
  });
  assert.equal(recordedExport.exportEvent.runStatus, "reviewed");
  assert.equal(
    Number(runPsql(`SELECT COUNT(*) FROM payroll_export_events WHERE payroll_run_id = '${reviewed.payrollRun.id}';`, { capture: true }).trim()),
    1,
  );
  assert.throws(
    () => runPsql("UPDATE payroll_export_events SET row_count = row_count + 1 WHERE id = 'PAYX-LIVE-REVIEWED-001';"),
    /payroll export audit events are immutable/i,
  );
  assert.throws(
    () => runPsql(`UPDATE payroll_lines SET net_wage = net_wage + 1 WHERE payroll_run_id = '${reviewed.payrollRun.id}';`),
    /payroll lines are mutable only while the run is draft/i,
  );
  assert.throws(
    () => runPsql(`UPDATE payroll_runs SET status = 'paid', updated_at = now() WHERE id = '${reviewed.payrollRun.id}';`),
    /invalid payroll run status transition|paid payroll run audit evidence is invalid/i,
  );

  const locked = await repository.transitionPayrollRun({
    workspace: workspaceWithRun(reviewed),
    payrollRun: {
      ...reviewed.payrollRun,
      status: "locked",
      lockedBy: "U-MANAGER-A",
      lockedAt: "2026-09-02T03:00:00.000Z",
      updatedAt: "2026-09-02T03:00:00.000Z",
    },
    expectedStatus: "reviewed",
  });
  await assert.rejects(
    repository.recordPayrollExport({
      workspace: workspaceWithRun(reviewed),
      exportEvent: {
        ...recordedExport.exportEvent,
        id: "PAYX-LIVE-STALE-001",
        exportedAt: "2026-09-02T03:05:00.000Z",
      },
    }),
    (error) => error?.statusCode === 409 && error?.code === "PAYROLL_EXPORT_SNAPSHOT_CONFLICT",
  );
  const paidTarget = {
    ...locked.payrollRun,
    status: "paid",
    paidBy: "U-FINANCE-A",
    paidAt: "2026-09-02T04:00:00.000Z",
    paymentReference: "BANK-LIVE-202608-001",
    updatedAt: "2026-09-02T04:00:00.000Z",
  };
  const paid = await repository.transitionPayrollRun({
    workspace: workspaceWithRun(locked),
    payrollRun: paidTarget,
    expectedStatus: "locked",
  });
  assert.equal(paid.payrollRun.status, "paid");
  assert.equal(paid.payrollRun.paymentReference, "BANK-LIVE-202608-001");
  await assert.rejects(
    repository.transitionPayrollRun({
      workspace: workspaceWithRun(locked),
      payrollRun: { ...paidTarget, paymentReference: "BANK-LIVE-DUPLICATE" },
      expectedStatus: "locked",
    }),
    (error) => error?.statusCode === 409 && error?.code === "PAYROLL_RUN_TRANSITION_CONFLICT",
  );
  const audit = runPsql(
    `SELECT status || '|' || reviewed_by || '|' || locked_by || '|' || paid_by || '|' || payment_reference
     FROM payroll_runs WHERE id = '${paid.payrollRun.id}';`,
    { capture: true },
  ).trim();
  assert.equal(audit, "paid|U-FINANCE-A|U-MANAGER-A|U-FINANCE-A|BANK-LIVE-202608-001");

  const apiEvidenceDraftCandidate = payrollDraftCandidate(
    "PAY-LIVE-API-EVIDENCE-202608",
    "PAYL-LIVE-API-EVIDENCE-202608",
    2,
  );
  const apiEvidenceDraft = await repository.createPayrollRun({
    workspace: attendancePayrollWorkspace(),
    ...apiEvidenceDraftCandidate,
    expectedLatestRevision: 1,
  });
  assert.equal(apiEvidenceDraft.payrollRun.status, "draft");
  assert.equal(apiEvidenceDraft.payrollRun.revision, 2);
}

function payrollAdjustmentCandidate(created, adjustmentId, performanceAward) {
  const previous = created.payrollLines[0];
  const updatedAt = "2026-09-02T01:45:00.000Z";
  return {
    workspace: workspaceWithRun(created),
    payrollLine: {
      ...previous,
      performanceAward,
      grossWage: previous.grossWage + performanceAward,
      netWage: previous.netWage + performanceAward,
      updatedAt,
    },
    adjustment: {
      id: adjustmentId,
      payrollLineId: previous.id,
      payrollRunId: previous.payrollRunId,
      employeeId: previous.employeeId,
      performanceAward,
      leaveDeduction: 0,
      otherDeduction: 0,
      reason: "PostgreSQL live concurrent payroll adjustment",
      previousValues: {
        performanceAward: previous.performanceAward,
        leaveDeduction: previous.leaveDeduction,
        otherDeduction: previous.otherDeduction,
      },
      newValues: { performanceAward, leaveDeduction: 0, otherDeduction: 0 },
      evidenceAttachmentIds: [`ATT-${adjustmentId}`],
      changedBy: "U-FINANCE-A",
      changedAt: updatedAt,
    },
  };
}

function payrollDraftCandidate(runId, lineId, revision = 1) {
  const changedAt = "2026-09-02T01:30:00.000Z";
  return {
    payrollRun: {
      id: runId,
      payrollMonth: "2026-08",
      policyVersionId: "PPV-LIVE-PAYROLL-202608",
      status: "draft",
      revision,
      generatedBy: "U-FINANCE-A",
      generatedAt: changedAt,
      reviewedBy: "",
      reviewedAt: "",
      lockedBy: "",
      lockedAt: "",
      paidBy: "",
      paidAt: "",
      paymentReference: "",
      createdAt: changedAt,
      updatedAt: changedAt,
    },
    payrollLines: [{
      id: lineId,
      payrollRunId: runId,
      employeeId: "EMP-LIVE-MANAGER-001",
      attendanceWorkMinutes: 10_000,
      baseWage: 2_000,
      positionAllowance: 300,
      seniorityAward: 100,
      performanceAward: 0,
      overtimeWage: 200,
      leaveDeduction: 0,
      otherDeduction: 0,
      grossWage: 2_600,
      netWage: 2_600,
      calculation: { schemaVersion: "payroll-calculation-v1" },
      createdAt: changedAt,
      updatedAt: changedAt,
    }],
  };
}

function attendancePayrollWorkspace() {
  return {
    attendanceImportBatches: [],
    attendancePunches: [],
    attendanceDayReviews: [],
    payrollPolicyVersions: [],
    payrollRuns: [],
    payrollLines: [],
    payrollLineAdjustments: [],
    payrollExportEvents: [],
  };
}

function workspaceWithRun(result) {
  return {
    ...attendancePayrollWorkspace(),
    payrollRuns: [{ ...result.payrollRun }],
    payrollLines: result.payrollLines.map((line) => ({ ...line })),
  };
}

function exactlyOneSuccess(results, expectedConflictCode) {
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  const reason = rejected[0].reason;
  const diagnostic = `unexpected conflict: status=${reason?.statusCode ?? ""} code=${reason?.code ?? ""} constraint=${reason?.constraint ?? ""} message=${reason?.message ?? ""}`;
  assert.equal(reason?.statusCode, 409, diagnostic);
  assert.equal(reason?.code, expectedConflictCode, diagnostic);
  return fulfilled[0].value;
}
