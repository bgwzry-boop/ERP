import { mkdirSync, rmSync } from "node:fs";
import { createApiServer } from "../../server/apiServer.mjs";
import {
  buildPassedPrinterDeviceFieldTest,
  seedPrintedPrintReadinessJobs,
} from "./printReadinessTestFixture.mjs";
import {
  closeTestServer,
  getJson,
  getTestServerBaseUrl,
  listenTestServer,
  postJson,
} from "./apiIntegrationTestHarness.mjs";

export async function checkPositivePrintDriverReadiness({
  storageRoot,
  printCommandBridgeScript,
  fakeCupsStatusScript,
}) {
  if (!storageRoot) throw new TypeError("checkPositivePrintDriverReadiness requires storageRoot");
  if (!printCommandBridgeScript) throw new TypeError("checkPositivePrintDriverReadiness requires printCommandBridgeScript");
  if (!fakeCupsStatusScript) throw new TypeError("checkPositivePrintDriverReadiness requires fakeCupsStatusScript");

  const readinessStorageRoot = `${storageRoot}/print-readiness-positive`;
  const readinessSpoolDir = `${readinessStorageRoot}/print-command-bridge-spool`;
  let server = null;

  try {
    rmSync(readinessStorageRoot, { recursive: true, force: true });
    mkdirSync(readinessSpoolDir, { recursive: true });
    seedPrintedPrintReadinessJobs({ storageRoot: readinessStorageRoot, idPrefix: "PJ-READY" });
    server = createApiServer({
      printDeviceRepositoryOptions: { storageRoot: readinessStorageRoot },
      printJobRepositoryOptions: { storageRoot: readinessStorageRoot },
      printerDeviceFieldTestRepositoryOptions: { storageRoot: readinessStorageRoot },
      printDriverAdapterOptions: {
        systemPrinterEnabled: true,
        systemPrinterAdapterKind: "command_bridge",
        systemPrinterCommand: process.execPath,
        systemPrinterCommandArgs: [
          printCommandBridgeScript,
          "--storage-root",
          readinessStorageRoot,
          "--cups-status-command",
          process.execPath,
          "--cups-status-args-json",
          JSON.stringify([fakeCupsStatusScript, "--printer", "{cupsPrinterName}"]),
        ],
        commandBridgeSpoolDir: readinessSpoolDir,
        allowedPrinterNames: ["PRN-LABEL-A", "PRN-DOT-A", "标签机A", "针式打印机A"],
      },
    });
    await listenTestServer(server);
    const baseUrl = getTestServerBaseUrl(server);
    const labelDevices = await getJson(baseUrl, "/api/print-devices?documentType=express_ltl_label");
    const labelDevice = labelDevices.items?.find((device) => device.printDeviceId === "PRN-LABEL-A");
    const dotDevices = await getJson(baseUrl, "/api/print-devices?documentType=delivery_note");
    const dotDevice = dotDevices.items?.find((device) => device.printDeviceId === "PRN-DOT-A");
    if (!labelDevice || !dotDevice) {
      throw new Error("Positive print readiness setup did not load default print devices");
    }
    await postJson(baseUrl, "/api/print-devices", {
      ...labelDevice,
      settings: { ...(labelDevice.settings ?? {}), driverMode: "system_printer" },
      operatorId: "U-OFFICE-A",
    });
    await postJson(baseUrl, "/api/print-devices", {
      ...dotDevice,
      settings: { ...(dotDevice.settings ?? {}), driverMode: "system_printer" },
      operatorId: "U-OFFICE-A",
    });
    await postJson(
      baseUrl,
      "/api/print-devices/PRN-LABEL-A/field-tests",
      buildPassedPrinterDeviceFieldTest({
        recordId: "PDQA-READY-LABEL-A",
        printDeviceId: "PRN-LABEL-A",
        printJobId: "PJ-READY-LABEL-A",
        documentType: "express_ltl_label",
        deviceLabel: "标签机A",
        driverLabel: "Generic 203dpi Label",
        paperLabel: "80x60 热敏标签",
        checkedAt: "2026-07-04T10:00:00.000Z",
        note: "Positive V1 print readiness check",
      }),
    );
    await postJson(
      baseUrl,
      "/api/print-devices/PRN-DOT-A/field-tests",
      buildPassedPrinterDeviceFieldTest({
        recordId: "PDQA-READY-DOT-A",
        printDeviceId: "PRN-DOT-A",
        printJobId: "PJ-READY-DOT-A",
        documentType: "delivery_note",
        deviceLabel: "针式打印机A",
        driverLabel: "Generic Dot Matrix",
        paperLabel: "连续二联针式纸",
        checkedAt: "2026-07-04T10:00:00.000Z",
        note: "Positive V1 print readiness check",
      }),
    );
    const readiness = await getJson(baseUrl, "/api/print-driver/v1-readiness");
    if (
      readiness.status !== "ready"
      || readiness.ready !== true
      || readiness.summary?.blockingCount !== 0
      || readiness.spoolDiagnostics?.ready !== true
      || readiness.cupsDiagnostics?.ready !== true
      || !readiness.criteria?.some((item) => item.key === "cups-queue-preflight" && item.status === "passed")
      || readiness.deviceReadiness?.length !== 2
      || !readiness.deviceReadiness.every((item) => item.ready === true)
      || !readiness.criteria?.every((item) => item.status === "passed")
      || readiness.safeguards?.physicalPrinterCalled !== false
      || JSON.stringify(readiness).includes(readinessSpoolDir)
      || JSON.stringify(readiness).includes(process.execPath)
    ) {
      throw new Error("/api/print-driver/v1-readiness did not return a positive ready result under configured test settings");
    }
    const cupsDiagnostics = await getJson(baseUrl, "/api/print-driver/cups-diagnostics");
    if (
      cupsDiagnostics.status !== "ok"
      || cupsDiagnostics.ready !== true
      || cupsDiagnostics.scope !== "non_printing_cups_queue_preflight"
      || cupsDiagnostics.cupsPrinterAllowed !== true
      || cupsDiagnostics.cupsStatusCommandRunnable !== true
      || cupsDiagnostics.safeguards?.nonPrinting !== true
      || cupsDiagnostics.safeguards?.physicalPrinterCalled !== false
      || cupsDiagnostics.safeguards?.printFileCreated !== false
      || JSON.stringify(cupsDiagnostics).includes(readinessStorageRoot)
      || JSON.stringify(cupsDiagnostics).includes(process.execPath)
      || JSON.stringify(cupsDiagnostics).includes(fakeCupsStatusScript)
    ) {
      throw new Error("/api/print-driver/cups-diagnostics did not return a redacted positive ready result");
    }
    return { readiness, cupsDiagnostics };
  } finally {
    await closeTestServer(server);
  }
}
