import assert from "node:assert/strict";
import {
  buildCupsDiagnosticRuntimeBlockers,
  buildDiagnosticSpoolRecord,
  buildSpoolDiagnosticRuntimeBlockers,
  parseCupsPreflightStdout,
  sanitizeCommandBridgeMessage,
  summarizePollResultForDiagnostics,
} from "../server/printDriverDiagnosticProjection.mjs";

const now = "2026-07-16T10:30:00.000Z";
const diagnosticPrintJob = {
  printJobId: "PJ-DIAGNOSTIC-001",
  printDeviceId: "PRN-DIAGNOSTIC-001",
};

const queuedRecord = buildDiagnosticSpoolRecord({
  diagnosticExternalJobId: "DIAGNOSTIC-QUEUED-001",
  diagnosticPrintJob,
  status: "queued",
  now,
});
assert.equal(queuedRecord.mode, "diagnostic_spool_only");
assert.equal(queuedRecord.payloadDigest.length, 64);
assert.equal(queuedRecord.completedAt, undefined);

const completedRecord = buildDiagnosticSpoolRecord({
  diagnosticExternalJobId: "DIAGNOSTIC-COMPLETED-001",
  diagnosticPrintJob,
  status: "completed",
  now,
});
assert.equal(completedRecord.completedAt, now);
assert.equal(completedRecord.updatedAt, now);

const pollSummary = summarizePollResultForDiagnostics({
  adapterStatus: " command_sent ",
  status: " sent ",
  driverStatus: " queued ",
  externalJobId: " DIAGNOSTIC-QUEUED-001 ",
  errorCode: " ",
  message: " pending ",
  metadata: {
    commandBridge: {
      statusReadback: "spool_file",
      statusFileFound: 1,
      statusFileValid: 0,
      bridgeStatus: " queued ",
      bridgeDirectoryStatus: " ready ",
      bridgeMode: " diagnostic_spool_only ",
    },
  },
});
assert.equal(pollSummary.adapterStatus, "command_sent");
assert.equal(pollSummary.metadata.commandBridge.statusFileFound, true);
assert.equal(pollSummary.metadata.commandBridge.statusFileValid, false);
assert.equal(pollSummary.metadata.commandBridge.bridgeMode, "diagnostic_spool_only");

const spoolBlockers = buildSpoolDiagnosticRuntimeBlockers({
  writeOk: false,
  pendingPollOk: false,
  completedPollOk: false,
  cleanupOk: false,
  pendingPoll: { message: "pending readback failed" },
  completedPoll: { message: "completed readback failed" },
});
assert.equal(spoolBlockers.length, 4);
assert.equal(spoolBlockers.find((item) => item.key === "diagnostic-pending-readback")?.detail, "pending readback failed");
assert.equal(spoolBlockers.find((item) => item.key === "diagnostic-cleanup")?.blocking, false);

assert.equal(parseCupsPreflightStdout("").errorCode, "SYSTEM_PRINTER_CUPS_PREFLIGHT_NO_OUTPUT");
assert.equal(parseCupsPreflightStdout("not json").errorCode, "SYSTEM_PRINTER_CUPS_PREFLIGHT_INVALID_OUTPUT");
assert.equal(parseCupsPreflightStdout("[]").errorCode, "SYSTEM_PRINTER_CUPS_PREFLIGHT_INVALID_OUTPUT");
assert.deepEqual(parseCupsPreflightStdout('{"status":"ready","ready":true}'), { status: "ready", ready: true });

const bridgeBlockers = buildCupsDiagnosticRuntimeBlockers({
  result: { ok: false, message: "bridge unavailable" },
  parsed: { ready: false },
});
assert.equal(bridgeBlockers[0].key, "cups-preflight-command-bridge");

const runtimeBlockers = buildCupsDiagnosticRuntimeBlockers({
  result: { ok: true },
  parsed: { errorCode: "CUPS_OFFLINE", message: ` ${"x".repeat(240)} ` },
});
assert.equal(runtimeBlockers[0].key, "cups-preflight-runtime");
assert.equal(runtimeBlockers[0].detail.length, 200);

const pendingBlockers = buildCupsDiagnosticRuntimeBlockers({
  result: { ok: true },
  parsed: { ready: false, message: "queue pending" },
});
assert.equal(pendingBlockers[0].key, "cups-preflight-ready");
assert.deepEqual(buildCupsDiagnosticRuntimeBlockers({ result: { ok: true }, parsed: { ready: true } }), []);
assert.equal(sanitizeCommandBridgeMessage("  message  "), "message");
assert.equal(sanitizeCommandBridgeMessage(" "), "");

console.log("Print driver diagnostic projection checks passed.");
