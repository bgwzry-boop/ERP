export const defaultCommandArgTemplate = Object.freeze([
  "--print-job-id",
  "{printJobId}",
  "--print-device-id",
  "{printDeviceId}",
  "--print-device-name",
  "{printDeviceName}",
]);

export function normalizeCommandArgs(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  const raw = String(value ?? "").trim();
  if (!raw) return [...defaultCommandArgTemplate];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
  } catch {
    return [raw];
  }
  return [...defaultCommandArgTemplate];
}

export function renderCommandArgs(commandArgs, normalized) {
  return normalizeCommandArgs(commandArgs).map((arg) =>
    String(arg)
      .replaceAll("{printJobId}", normalized.printJobId)
      .replaceAll("{printDeviceId}", normalized.printDeviceId)
      .replaceAll("{printDeviceName}", normalized.printDeviceName)
      .replaceAll("{driverName}", normalized.driverName)
      .replaceAll("{connectionUri}", normalized.connectionUri)
      .replaceAll("{documentType}", normalized.documentType)
      .replaceAll("{targetType}", normalized.targetType)
      .replaceAll("{targetId}", normalized.targetId),
  );
}

export function buildCommandBridgePayload({ printJob, normalized }) {
  return JSON.stringify({
    printJobId: normalized.printJobId,
    printDeviceId: normalized.printDeviceId,
    printDeviceName: normalized.printDeviceName,
    driverName: normalized.driverName,
    connectionUri: normalized.connectionUri,
    documentType: normalized.documentType,
    targetType: normalized.targetType,
    targetId: normalized.targetId,
    payloadSnapshot: printJob?.payloadSnapshot ?? {},
    printDeviceSnapshot: printJob?.printDeviceSnapshot ?? {},
  });
}

export function normalizeCommandRunnerResult(result = {}) {
  if (result.error) {
    const timedOut = result.error.code === "ETIMEDOUT";
    return {
      ok: false,
      exitCode: null,
      signal: String(result.signal ?? "").trim(),
      stdout: String(result.stdout ?? "").trim(),
      stderr: String(result.stderr ?? "").trim(),
      errorCode: timedOut ? "SYSTEM_PRINTER_COMMAND_TIMEOUT" : "SYSTEM_PRINTER_COMMAND_FAILED",
      message: timedOut ? "System printer command timed out." : "System printer command could not be started.",
    };
  }
  const exitCode = normalizeOptionalInteger(result.status ?? result.exitCode ?? result.code, 0);
  return {
    ok: exitCode === 0,
    exitCode,
    signal: String(result.signal ?? "").trim(),
    stdout: String(result.stdout ?? "").trim(),
    stderr: String(result.stderr ?? "").trim(),
    externalJobId: String(result.externalJobId ?? "").trim(),
  };
}

export function buildCommandBridgeDispatchMetadata(result) {
  return {
    commandBridge: {
      commandValueExposed: false,
      argsValueExposed: false,
      exitCode: result.exitCode,
      signal: result.signal,
      stdoutBytes: byteLength(result.stdout),
      stderrBytes: byteLength(result.stderr),
    },
  };
}

export function extractCommandExternalJobId(result, normalized) {
  if (result.externalJobId) return result.externalJobId;
  const stdout = String(result.stdout ?? "").trim();
  if (stdout) {
    try {
      const parsed = JSON.parse(stdout);
      const parsedExternalJobId = String(parsed.externalJobId ?? parsed.external_job_id ?? "").trim();
      if (parsedExternalJobId) return parsedExternalJobId;
    } catch {
      const match = stdout.match(/\bexternalJobId=([A-Za-z0-9_.:-]+)/);
      if (match?.[1]) return match[1];
    }
  }
  return `CMD-${normalized.printJobId}`;
}

export function normalizeOptionalInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
}

export function byteLength(value) {
  return Buffer.byteLength(String(value ?? ""), "utf8");
}
