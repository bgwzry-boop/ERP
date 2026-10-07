import assert from "node:assert/strict";

export async function checkPayrollApi(runtime, { baseUrl, scheduleHeaders, postJson }) {
  const { runPsql, sqlLiteral, liveManagerRuntimeUserId } = runtime;
  const payrollEvidenceWithoutEmployee = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "payroll_run",
      ownerId: "PAY-LIVE-API-EVIDENCE-202608",
      purpose: "payroll_adjustment_evidence",
      fileType: "pdf",
      fileName: "payroll-adjustment-missing-employee-live.pdf",
      mimeType: "application/pdf",
      contentRef: "p0://payroll-adjustment/PAY-LIVE-API-EVIDENCE-202608/missing-employee",
      contentDataUrl: "data:application/pdf;base64,JVBERi0xLjQtbWlzc2luZy1lbXBsb3llZQ==",
      metadata: {},
      uploadedBy: "U-SPOOFED",
      idempotencyKey: "payroll-adjustment-missing-employee-live-001",
    },
    { headers: scheduleHeaders },
  );
  assert.equal(payrollEvidenceWithoutEmployee.uploadedBy, liveManagerRuntimeUserId);
  const rejectedPayrollEvidenceWithoutEmployee = await postJson(
    baseUrl,
    "/api/payroll/runs/PAY-LIVE-API-EVIDENCE-202608/lines/EMP-LIVE-MANAGER-001/adjustment",
    {
      performanceAward: 320,
      leaveDeduction: 40,
      otherDeduction: 10,
      reason: "PostgreSQL live missing employee evidence must fail closed",
      evidenceAttachmentIds: [payrollEvidenceWithoutEmployee.attachmentId],
    },
    { headers: scheduleHeaders, expectedStatus: 422 },
  );
  assert.equal(rejectedPayrollEvidenceWithoutEmployee.code, "PAYROLL_ADJUSTMENT_EVIDENCE_EMPLOYEE_REQUIRED");
  const payrollEvidenceAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "payroll_run",
      ownerId: "PAY-LIVE-API-EVIDENCE-202608",
      purpose: "payroll_adjustment_evidence",
      fileType: "pdf",
      fileName: "payroll-adjustment-EMP-LIVE-MANAGER-001-live.pdf",
      mimeType: "application/pdf",
      contentRef: "p0://payroll-adjustment/PAY-LIVE-API-EVIDENCE-202608/EMP-LIVE-MANAGER-001",
      contentDataUrl: "data:application/pdf;base64,JVBERi0xLjQtcGF5cm9sbC1ldmlkZW5jZQ==",
      metadata: {
        payrollRunId: "PAY-LIVE-API-EVIDENCE-202608",
        employeeId: "EMP-LIVE-MANAGER-001",
      },
      uploadedBy: "U-SPOOFED",
      idempotencyKey: "payroll-adjustment-evidence-live-001",
    },
    { headers: scheduleHeaders },
  );
  assert.equal(payrollEvidenceAttachment.uploadedBy, liveManagerRuntimeUserId);
  const apiPayrollAdjustment = await postJson(
    baseUrl,
    "/api/payroll/runs/PAY-LIVE-API-EVIDENCE-202608/lines/EMP-LIVE-MANAGER-001/adjustment",
    {
      performanceAward: 320,
      leaveDeduction: 40,
      otherDeduction: 10,
      reason: "PostgreSQL live authenticated payroll adjustment evidence",
      evidenceAttachmentIds: [payrollEvidenceAttachment.attachmentId],
    },
    { headers: scheduleHeaders },
  );
  assert.deepEqual(apiPayrollAdjustment.adjustment.evidenceAttachmentIds, [payrollEvidenceAttachment.attachmentId]);
  assert.equal(
    runPsql(
      `SELECT evidence_attachment_ids_json->>0 FROM payroll_line_adjustments WHERE id = ${sqlLiteral(apiPayrollAdjustment.adjustment.id)};`,
      { capture: true },
    ).trim(),
    payrollEvidenceAttachment.attachmentId,
  );
}
