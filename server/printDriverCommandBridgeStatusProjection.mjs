export function resolveCommandBridgePollResult({ externalJobId, bridgeStatus }) {
  const normalizedExternalJobId = String(externalJobId ?? "").trim();
  if (!normalizedExternalJobId) {
    return {
      adapterStatus: "poll_unavailable",
      errorCode: "SYSTEM_PRINTER_COMMAND_BRIDGE_EXTERNAL_ID_MISSING",
      message: "Command-bridge status readback requires the external bridge job id from dispatch.",
    };
  }
  if (!bridgeStatus?.found) {
    return {
      adapterStatus: "poll_unavailable",
      errorCode: String(bridgeStatus?.errorCode ?? "SYSTEM_PRINTER_COMMAND_BRIDGE_STATUS_NOT_FOUND").trim(),
      externalJobId: normalizedExternalJobId,
      message: String(bridgeStatus?.message ?? "Command-bridge spool status file was not found for this external job id.").trim(),
      metadata: bridgeStatus?.metadata ?? {},
    };
  }
  if (!bridgeStatus.status) {
    return {
      adapterStatus: "poll_unavailable",
      errorCode: "SYSTEM_PRINTER_COMMAND_BRIDGE_STATUS_UNSUPPORTED",
      externalJobId: normalizedExternalJobId,
      message: `Command-bridge spool status is not supported: ${String(bridgeStatus.rawStatus ?? "unknown").trim() || "unknown"}.`,
      metadata: bridgeStatus.metadata ?? {},
    };
  }
  if (bridgeStatus.status === "sent") {
    return {
      adapterStatus: "command_bridge_pending",
      status: "sent",
      driverStatus: bridgeStatus.driverStatus,
      externalJobId: normalizedExternalJobId,
      message: "Command-bridge spool record is still pending; physical completion is not proven yet.",
      metadata: bridgeStatus.metadata ?? {},
    };
  }
  if (bridgeStatus.status === "printed") {
    return {
      adapterStatus: "command_bridge_completed",
      status: "printed",
      driverStatus: "completed",
      externalJobId: normalizedExternalJobId,
      message: "Command-bridge spool status reports the job as completed.",
      metadata: bridgeStatus.metadata ?? {},
    };
  }
  if (bridgeStatus.status === "failed") {
    return {
      adapterStatus: "command_bridge_failed",
      status: "failed",
      driverStatus: "failed",
      errorCode: String(bridgeStatus.errorCode ?? "SYSTEM_PRINTER_COMMAND_BRIDGE_REPORTED_FAILED").trim(),
      externalJobId: normalizedExternalJobId,
      message: String(bridgeStatus.message ?? "Command-bridge spool status reports the job as failed.").trim(),
      metadata: bridgeStatus.metadata ?? {},
    };
  }
  return {
    adapterStatus: "command_bridge_canceled",
    status: "canceled",
    driverStatus: "canceled",
    externalJobId: normalizedExternalJobId,
    message: String(bridgeStatus.message ?? "Command-bridge spool status reports the job as canceled.").trim(),
    metadata: bridgeStatus.metadata ?? {},
  };
}

export function normalizeCommandBridgeSpoolStatus(value) {
  const status = String(value ?? "").trim().toLowerCase();
  if (["completed", "complete", "printed", "done", "success", "succeeded"].includes(status)) return "printed";
  if (["failed", "error", "errored"].includes(status)) return "failed";
  if (["canceled", "cancelled"].includes(status)) return "canceled";
  if (["sent", "processing", "running", "submitted", "queued", "pending", "accepted"].includes(status)) return "sent";
  return "";
}

export function normalizeCommandBridgeDriverStatus(value) {
  const status = String(value ?? "").trim().toLowerCase();
  if (["completed", "complete", "printed", "done", "success", "succeeded"].includes(status)) return "completed";
  if (["failed", "error", "errored"].includes(status)) return "failed";
  if (["canceled", "cancelled"].includes(status)) return "canceled";
  if (status) return status;
  return "unknown";
}

export function buildCommandBridgeStatusMetadata({ record, rawStatus, directoryStatus }) {
  return {
    commandBridge: {
      statusReadback: "spool_file",
      statusFileFound: true,
      statusFileValid: true,
      bridgeJobId: String(record.bridgeJobId ?? record.externalJobId ?? "").trim(),
      bridgeStatus: String(rawStatus ?? "").trim(),
      bridgeDirectoryStatus: String(directoryStatus ?? "").trim(),
      bridgeMode: String(record.mode ?? "").trim(),
      bridgeCreatedAt: String(record.createdAt ?? "").trim(),
      bridgeUpdatedAt: String(record.updatedAt ?? record.completedAt ?? record.failedAt ?? record.canceledAt ?? "").trim(),
      payloadDigest: String(record.payloadDigest ?? "").trim(),
    },
  };
}
