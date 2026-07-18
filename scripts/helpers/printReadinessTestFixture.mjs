import { createLocalPrintJobRepository } from "../../server/printJobRepository.mjs";

const passedPrinterDeviceChecks = [
  "sample_print",
  "paper_alignment",
  "barcode_scan",
  "driver_callback",
  "legibility",
  "void_reprint",
];

export function buildPassedPrinterDeviceFieldTest({
  recordId,
  printDeviceId,
  printJobId,
  documentType,
  deviceLabel,
  driverLabel,
  paperLabel,
  checkedAt = "2026-07-04T10:00:00.000Z",
  note = "Passed printer device field-test fixture",
  evidence,
}) {
  return {
    recordId,
    printDeviceId,
    printJobId,
    documentType,
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    checkedAt,
    deviceLabel,
    driverLabel,
    paperLabel,
    checks: passedPrinterDeviceChecks.map((key) => ({ key, status: "passed" })),
    evidence: evidence ?? {
      samplePrintReference: `${recordId} 样张已出纸且纸张对位通过`,
      barcodeScanText: `${printDeviceId}-SAMPLE-CODE 可扫码`,
      driverCallbackStatus: "spool completed -> printed",
      voidReprintReference: `${recordId}-VOID-REPRINT 作废后重打通过`,
      operatorAcceptance: "办公室A 现场签认",
    },
    note,
  };
}

export function seedPrintedPrintReadinessJobs({ storageRoot, idPrefix }) {
  if (!storageRoot) throw new TypeError("seedPrintedPrintReadinessJobs requires storageRoot");
  if (!idPrefix) throw new TypeError("seedPrintedPrintReadinessJobs requires idPrefix");

  const repository = createLocalPrintJobRepository({ storageRoot });
  const workspace = { printJobs: [], operationLogs: [] };
  const jobs = {
    label: buildPrintedJob(`${idPrefix}-LABEL-A`, "PRN-LABEL-A", "express_ltl_label"),
    dotMatrix: buildPrintedJob(`${idPrefix}-DOT-A`, "PRN-DOT-A", "delivery_note"),
  };

  for (const printJob of Object.values(jobs)) {
    repository.createPrintJob({
      workspace,
      printJob,
      operationLog: {
        id: `LOG-${printJob.printJobId}`,
        targetType: "print_job",
        targetId: printJob.printJobId,
        action: "seed_printed_field_test_job",
        operatorId: "U-TEST",
        occurredAt: printJob.createdAt,
        createdAt: printJob.createdAt,
      },
    });
  }

  return jobs;
}

function buildPrintedJob(printJobId, printDeviceId, documentType) {
  return {
    printJobId,
    printRecordId: `PR-${printJobId}`,
    targetType: "fulfillment",
    targetId: `F-${printJobId}`,
    documentType,
    printDeviceId,
    driverMode: "system_printer",
    jobStatus: "printed",
    attemptNo: 1,
    requestedBy: "U-TEST",
    finishedAt: "2026-07-04T09:59:00.000Z",
    createdAt: "2026-07-04T09:58:00.000Z",
    updatedAt: "2026-07-04T09:59:00.000Z",
  };
}
