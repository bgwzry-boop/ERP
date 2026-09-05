import assert from "node:assert/strict";
import {
  createInitialPrintDriverConfigState,
  createInitialPrintDriverCupsDiagnosticsState,
  createInitialPrintDriverReadinessState,
  createInitialPrintJobQueueState,
  createInitialPrinterDeviceQaState,
  getPrintJobStatusLabel,
  getPrinterDeviceDriverMode,
  getPrinterDeviceQaDriverLabel,
  getPrinterDeviceQaPaperLabel,
  getSortablePrintJobTime,
  mergeOfficePrintJobQueueItems,
} from "../src/state/officePrintState.js";

const printerQa = createInitialPrinterDeviceQaState({
  createChecks: () => [{ key: "sample", status: "pending" }],
  createEvidence: () => ({ photo: "pending" }),
});
assert.deepEqual(printerQa.checks, [{ key: "sample", status: "pending" }]);
assert.deepEqual(printerQa.evidence, { photo: "pending" });
assert.equal(printerQa.driverModeDraft, "preview_only");
assert.equal(createInitialPrintJobQueueState().total, 0);
assert.equal(createInitialPrintDriverConfigState().config, null);
assert.equal(createInitialPrintDriverReadinessState().readiness, null);
assert.equal(createInitialPrintDriverCupsDiagnosticsState().diagnostics, null);

assert.equal(getSortablePrintJobTime({ createdAt: "invalid" }), 0);
assert.ok(getSortablePrintJobTime({ createdAt: "2026-07-10T09:00:00Z" }) > 0);
assert.equal(getPrintJobStatusLabel("queued"), "待派发");
assert.equal(getPrintJobStatusLabel("unknown"), "状态待确认");
assert.equal(getPrintJobStatusLabel(""), "状态待确认");

const printDevice = {
  driverName: "CUPS 标签驱动",
  settings: { driverMode: "system_printer" },
  paperWidthMm: 100,
  paperHeightMm: 150,
};
assert.equal(getPrinterDeviceQaDriverLabel(printDevice), "CUPS 标签驱动");
assert.equal(getPrinterDeviceDriverMode(printDevice), "system_printer");
assert.equal(getPrinterDeviceQaPaperLabel(printDevice), "100x150mm");
assert.equal(getPrinterDeviceDriverMode({}), "preview_only");
assert.equal(getPrinterDeviceQaPaperLabel({ paperName: "热敏标签" }), "热敏标签");

const mergedJobs = mergeOfficePrintJobQueueItems(
  [
    { printJobId: "PJ-OLD", queuedAt: "2026-07-10T08:00:00Z", jobStatus: "queued" },
    { printJobId: "PJ-REPLACE", queuedAt: "2026-07-10T08:30:00Z", jobStatus: "queued" },
  ],
  [
    { printJobId: "PJ-REPLACE", updatedAt: "2026-07-10T10:00:00Z", jobStatus: "printed" },
    { printJobId: "PJ-NEW", queuedAt: "2026-07-10T09:00:00Z", jobStatus: "sent" },
  ],
  { limit: 2 },
);
assert.deepEqual(mergedJobs.map((item) => item.printJobId), ["PJ-REPLACE", "PJ-NEW"]);
assert.equal(mergedJobs[0].jobStatus, "printed");

console.log("office print state checks passed");
