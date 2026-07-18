import assert from "node:assert/strict";
import {
  buildCommandBridgeDispatchMetadata,
  buildCommandBridgePayload,
  byteLength,
  defaultCommandArgTemplate,
  extractCommandExternalJobId,
  normalizeCommandArgs,
  normalizeCommandRunnerResult,
  normalizeOptionalInteger,
  renderCommandArgs,
} from "../server/printDriverCommandBridgeDispatchProjection.mjs";

const normalized = {
  printJobId: "PJ-DISPATCH-001",
  printDeviceId: "PRN-DISPATCH-001",
  printDeviceName: "Office Label Printer",
  driverName: "CUPS",
  connectionUri: "usb://office-label-printer",
  documentType: "express_label",
  targetType: "fulfillment",
  targetId: "FUL-001",
};

assert.deepEqual(normalizeCommandArgs(""), [...defaultCommandArgTemplate]);
assert.deepEqual(normalizeCommandArgs('[" --job ", "{printJobId}"]'), ["--job", "{printJobId}"]);
assert.deepEqual(normalizeCommandArgs("--raw-command-argument"), ["--raw-command-argument"]);
assert.deepEqual(normalizeCommandArgs('{"not":"an array"}'), [...defaultCommandArgTemplate]);
assert.deepEqual(renderCommandArgs(["--job", "{printJobId}", "--device", "{printDeviceName}"], normalized), [
  "--job",
  "PJ-DISPATCH-001",
  "--device",
  "Office Label Printer",
]);

const payload = JSON.parse(
  buildCommandBridgePayload({
    normalized,
    printJob: { payloadSnapshot: { copies: 2 }, printDeviceSnapshot: { name: "Office Label Printer" } },
  }),
);
assert.equal(payload.printJobId, "PJ-DISPATCH-001");
assert.equal(payload.payloadSnapshot.copies, 2);
assert.equal(payload.printDeviceSnapshot.name, "Office Label Printer");

const timeoutResult = normalizeCommandRunnerResult({ error: { code: "ETIMEDOUT" }, stdout: "partial" });
assert.equal(timeoutResult.errorCode, "SYSTEM_PRINTER_COMMAND_TIMEOUT");
const exitResult = normalizeCommandRunnerResult({ status: 2, signal: " SIGTERM ", stdout: "out", stderr: "err" });
assert.equal(exitResult.ok, false);
assert.equal(exitResult.exitCode, 2);
assert.equal(exitResult.signal, "SIGTERM");

const metadata = buildCommandBridgeDispatchMetadata({ exitCode: 0, signal: "", stdout: "完成", stderr: "" });
assert.equal(metadata.commandBridge.commandValueExposed, false);
assert.equal(metadata.commandBridge.stdoutBytes, byteLength("完成"));
assert.equal(metadata.commandBridge.stdoutBytes, 6);
assert.equal(metadata.commandBridge.command, undefined);

assert.equal(extractCommandExternalJobId({ externalJobId: "BRIDGE-001" }, normalized), "BRIDGE-001");
assert.equal(extractCommandExternalJobId({ stdout: '{"external_job_id":"BRIDGE-002"}' }, normalized), "BRIDGE-002");
assert.equal(extractCommandExternalJobId({ stdout: "externalJobId=BRIDGE-003" }, normalized), "BRIDGE-003");
assert.equal(extractCommandExternalJobId({ stdout: '{"unknown":"value"}' }, normalized), "CMD-PJ-DISPATCH-001");
assert.equal(normalizeOptionalInteger("3.9", 0), 3);
assert.equal(normalizeOptionalInteger("invalid", 7), 7);

console.log("Print driver command-bridge dispatch projection checks passed.");
