import assert from "node:assert/strict";
import {
  buildCommandBridgeStatusMetadata,
  normalizeCommandBridgeDriverStatus,
  normalizeCommandBridgeSpoolStatus,
  resolveCommandBridgePollResult,
} from "../server/printDriverCommandBridgeStatusProjection.mjs";

assert.equal(normalizeCommandBridgeSpoolStatus(" completed "), "printed");
assert.equal(normalizeCommandBridgeSpoolStatus("queued"), "sent");
assert.equal(normalizeCommandBridgeSpoolStatus("cancelled"), "canceled");
assert.equal(normalizeCommandBridgeSpoolStatus("unknown"), "");
assert.equal(normalizeCommandBridgeDriverStatus("success"), "completed");
assert.equal(normalizeCommandBridgeDriverStatus("processing"), "processing");
assert.equal(normalizeCommandBridgeDriverStatus(""), "unknown");

const metadata = buildCommandBridgeStatusMetadata({
  record: {
    bridgeJobId: "BRIDGE-001",
    mode: "spool_only",
    createdAt: "2026-07-16T10:00:00.000Z",
    completedAt: "2026-07-16T10:01:00.000Z",
    payloadDigest: "a".repeat(64),
  },
  rawStatus: "completed",
  directoryStatus: "completed",
});
assert.equal(metadata.commandBridge.statusFileValid, true);
assert.equal(metadata.commandBridge.bridgeUpdatedAt, "2026-07-16T10:01:00.000Z");

const missingExternalId = resolveCommandBridgePollResult({ externalJobId: "" });
assert.equal(missingExternalId.errorCode, "SYSTEM_PRINTER_COMMAND_BRIDGE_EXTERNAL_ID_MISSING");

const missingRecord = resolveCommandBridgePollResult({
  externalJobId: "BRIDGE-001",
  bridgeStatus: {
    found: false,
    errorCode: "SYSTEM_PRINTER_COMMAND_BRIDGE_STATUS_NOT_FOUND",
    message: "record missing",
    metadata,
  },
});
assert.equal(missingRecord.adapterStatus, "poll_unavailable");
assert.equal(missingRecord.metadata, metadata);

const unsupportedStatus = resolveCommandBridgePollResult({
  externalJobId: "BRIDGE-001",
  bridgeStatus: { found: true, rawStatus: "paused", metadata },
});
assert.equal(unsupportedStatus.errorCode, "SYSTEM_PRINTER_COMMAND_BRIDGE_STATUS_UNSUPPORTED");

const pendingStatus = resolveCommandBridgePollResult({
  externalJobId: "BRIDGE-001",
  bridgeStatus: { found: true, status: "sent", driverStatus: "queued", metadata },
});
assert.equal(pendingStatus.adapterStatus, "command_bridge_pending");
assert.equal(pendingStatus.status, "sent");

const completedStatus = resolveCommandBridgePollResult({
  externalJobId: "BRIDGE-001",
  bridgeStatus: { found: true, status: "printed", driverStatus: "completed", metadata },
});
assert.equal(completedStatus.adapterStatus, "command_bridge_completed");
assert.equal(completedStatus.driverStatus, "completed");

const failedStatus = resolveCommandBridgePollResult({
  externalJobId: "BRIDGE-001",
  bridgeStatus: { found: true, status: "failed", errorCode: "BRIDGE_OFFLINE", message: "bridge offline", metadata },
});
assert.equal(failedStatus.adapterStatus, "command_bridge_failed");
assert.equal(failedStatus.errorCode, "BRIDGE_OFFLINE");

const canceledStatus = resolveCommandBridgePollResult({
  externalJobId: "BRIDGE-001",
  bridgeStatus: { found: true, status: "canceled", message: "operator canceled", metadata },
});
assert.equal(canceledStatus.adapterStatus, "command_bridge_canceled");
assert.equal(canceledStatus.status, "canceled");

console.log("Print driver command-bridge status projection checks passed.");
