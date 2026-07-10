import { createLocalSeedAuthState } from "../src/services/officeAuthService.js";
import {
  buildPrintDriverReadinessChecklist,
  getOfficePrintDriverConfig,
  getOfficePrintDriverCupsDiagnostics,
  getOfficePrintDriverSpoolDiagnostics,
  getOfficePrintDriverV1Readiness,
  getPrintDriverReadinessSummary,
  normalizePrintDriverConfigForClient,
  normalizePrintDriverCupsDiagnosticsForClient,
  normalizePrintDriverSpoolDiagnosticsForClient,
  normalizePrintDriverV1ReadinessForClient,
} from "../src/services/officePrintDriverConfigApiClient.js";
import {
  OFFICE_PRINT_DRIVER_INTEGRATION_KIT_VERSION,
  buildOfficePrintDriverIntegrationKit,
  getOfficePrintDriverIntegrationKitSummary,
} from "../src/services/officePrintDriverIntegrationKitClient.js";

const authState = createLocalSeedAuthState("U-OFFICE-A");
const readyConfig = {
  adapterName: "p0-print-driver-adapter",
  kind: "guarded_adapter",
  dryRunEnabled: false,
  systemPrinterEnabled: true,
  systemPrinterAdapterKind: "command_bridge",
  systemPrinterCommandConfigured: true,
  systemPrinterCommandArgsConfigured: true,
  systemPrinterCommandTimeoutMs: 5000,
  commandBridgeStatusReadbackAvailable: true,
  allowedPrinterNames: ["PRN-LABEL-A", "Office Label Printer"],
  realDispatchAvailable: true,
  systemPrinterCommand: "/usr/bin/lp -d SECRET_PRINTER",
  environmentPreflight: {
    checkedAt: "2026-07-02T10:00:00.000Z",
    scope: "non_printing_environment_preflight",
    summary: {
      label: "9/9 通过",
      passedCount: 9,
      totalCount: 9,
      blockingCount: 0,
      tone: "success",
    },
    items: [
      {
        key: "command-executable",
        label: "打印命令可执行",
        status: "passed",
        tone: "success",
        detail: "命令存在且当前进程可执行",
        blocking: true,
        commandValue: "/usr/bin/lp -d SECRET_PRINTER",
      },
    ],
    safeguards: {
      nonPrinting: true,
      commandValueExposed: false,
      commandArgsExposed: false,
      spoolPathExposed: false,
    },
  },
  safeguards: {
    commandValueExposed: false,
    physicalPrinterCallsBlocked: false,
  },
};

const calls = [];
const apiResult = await getOfficePrintDriverConfig(
  {
    authState,
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return createJsonResponse(200, {
        printDriverAdapter: readyConfig,
      });
    },
  },
);

assert(apiResult.source === "api", "print driver config should use API response");
assert(calls[0]?.url === "http://127.0.0.1:8787/api/print-driver/config", "print driver config URL is incorrect");
assert(calls[0]?.init.method === "GET", "print driver config method is incorrect");
assert(calls[0]?.init.headers["x-erp-user-id"] === "U-OFFICE-A", "print driver config missed seed user header");
assert(apiResult.config.adapterName === "p0-print-driver-adapter", "print driver config missed adapter name");
assert(apiResult.config.systemPrinterAdapterKind === "command_bridge", "print driver config missed adapter kind");
assert(apiResult.config.systemPrinterCommandConfigured === true, "print driver config missed command-configured flag");
assert(apiResult.config.commandBridgeStatusReadbackAvailable === true, "print driver config missed command bridge readback flag");
assert(apiResult.config.allowedPrinterNames.length === 2, "print driver config missed allowlist");
assert(apiResult.config.realDispatchAvailable === true, "print driver config missed real dispatch flag");
assert(apiResult.config.environmentPreflight.summary.passedCount === 9, "print driver config missed environment preflight summary");
assert(apiResult.config.environmentPreflight.items[0].statusLabel === "通过", "print driver config missed environment preflight status label");
assert(apiResult.config.safeguards.physicalPrinterCallsBlocked === false, "print driver config missed physical-printer safeguard");
assert(!Object.hasOwn(apiResult.config, "systemPrinterCommand"), "print driver config must not expose command value to the client");
assert(!JSON.stringify(apiResult.config).includes("SECRET_PRINTER"), "print driver config leaked command value");
assert(!JSON.stringify(apiResult.config.environmentPreflight).includes("/usr/bin/lp"), "environment preflight leaked command value");

const readinessCalls = [];
const readinessResult = await getOfficePrintDriverV1Readiness(
  {
    authState,
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      readinessCalls.push({ url, init });
      return createJsonResponse(200, buildReadyV1ReadinessPayload());
    },
  },
);
assert(readinessResult.source === "api", "print driver V1 readiness should use API response");
assert(readinessCalls[0]?.url === "http://127.0.0.1:8787/api/print-driver/v1-readiness", "print driver V1 readiness URL is incorrect");
assert(readinessCalls[0]?.init.method === "GET", "print driver V1 readiness method is incorrect");
assert(readinessCalls[0]?.init.headers["x-erp-user-id"] === "U-OFFICE-A", "print driver V1 readiness missed seed user header");
assert(readinessResult.readiness.ready === true, "print driver V1 readiness missed ready flag");
assert(readinessResult.readiness.status === "ready", "print driver V1 readiness missed status");
assert(readinessResult.readiness.scope === "v1_print_go_live_readiness", "print driver V1 readiness missed scope");
assert(readinessResult.readiness.summary.blockingCount === 0, "print driver V1 readiness should have no blockers");
assert(readinessResult.readiness.criteria.length === 9, "print driver V1 readiness should normalize nine criteria");
assert(readinessResult.readiness.criteria.every((item) => item.statusLabel === "通过"), "ready criteria should all be marked passed");
assert(readinessResult.readiness.deviceReadiness.length === 2, "print driver V1 readiness should normalize device readiness");
assert(readinessResult.readiness.deviceReadiness.every((item) => item.ready === true), "device readiness should be ready");
assert(readinessResult.readiness.printDriverAdapter.realDispatchAvailable === true, "readiness missed normalized adapter config");
assert(readinessResult.readiness.spoolDiagnostics.ready === true, "readiness missed spool diagnostics");
assert(readinessResult.readiness.cupsDiagnostics.ready === true, "readiness missed CUPS diagnostics");
assert(
  readinessResult.readiness.criteria.some((item) => item.key === "cups-queue-preflight" && item.status === "passed"),
  "readiness missed CUPS queue preflight criterion",
);
assert(readinessResult.readiness.safeguards.physicalPrinterCalled === false, "readiness should not call physical printers");
assert(!JSON.stringify(readinessResult.readiness).includes("SECRET_PRINTER"), "print driver V1 readiness leaked command value");
assert(!JSON.stringify(readinessResult.readiness).includes("/usr/bin/lp"), "print driver V1 readiness leaked command path");

const spoolCalls = [];
const spoolResult = await getOfficePrintDriverSpoolDiagnostics(
  {
    authState,
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      spoolCalls.push({ url, init });
      return createJsonResponse(200, buildReadySpoolDiagnosticsPayload());
    },
  },
);
assert(spoolResult.source === "api", "spool diagnostics should use API response");
assert(spoolCalls[0]?.url === "http://127.0.0.1:8787/api/print-driver/spool-diagnostics", "spool diagnostics URL is incorrect");
assert(spoolCalls[0]?.init.method === "GET", "spool diagnostics method is incorrect");
assert(spoolCalls[0]?.init.headers["x-erp-user-id"] === "U-OFFICE-A", "spool diagnostics missed seed user header");
assert(spoolResult.diagnostics.ready === true, "spool diagnostics missed ready flag");
assert(spoolResult.diagnostics.writeOk === true, "spool diagnostics missed write flag");
assert(spoolResult.diagnostics.pendingPollOk === true, "spool diagnostics missed pending readback flag");
assert(spoolResult.diagnostics.completedPollOk === true, "spool diagnostics missed completed readback flag");
assert(spoolResult.diagnostics.cleanupOk === true, "spool diagnostics missed cleanup flag");
assert(spoolResult.diagnostics.safeguards.nonPrinting === true, "spool diagnostics missed non-printing safeguard");
assert(spoolResult.diagnostics.safeguards.physicalPrinterCalled === false, "spool diagnostics should not call physical printers");
assert(!JSON.stringify(spoolResult.diagnostics).includes("SECRET_PRINTER"), "spool diagnostics leaked command value");
assert(!JSON.stringify(spoolResult.diagnostics).includes("/tmp/erp-print-spool"), "spool diagnostics leaked spool path");
assert(!JSON.stringify(spoolResult.diagnostics).includes("print payload"), "spool diagnostics leaked payload");

const cupsCalls = [];
const cupsResult = await getOfficePrintDriverCupsDiagnostics(
  {
    authState,
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      cupsCalls.push({ url, init });
      return createJsonResponse(200, buildReadyCupsDiagnosticsPayload());
    },
  },
);
assert(cupsResult.source === "api", "CUPS diagnostics should use API response");
assert(cupsCalls[0]?.url === "http://127.0.0.1:8787/api/print-driver/cups-diagnostics", "CUPS diagnostics URL is incorrect");
assert(cupsCalls[0]?.init.method === "GET", "CUPS diagnostics method is incorrect");
assert(cupsCalls[0]?.init.headers["x-erp-user-id"] === "U-OFFICE-A", "CUPS diagnostics missed seed user header");
assert(cupsResult.diagnostics.ready === true, "CUPS diagnostics missed ready flag");
assert(cupsResult.diagnostics.cupsPrinterAllowed === true, "CUPS diagnostics missed allowlist flag");
assert(cupsResult.diagnostics.cupsStatusCommandRunnable === true, "CUPS diagnostics missed runnable flag");
assert(cupsResult.diagnostics.preflightResult.stdoutBytes === 128, "CUPS diagnostics missed stdout byte count");
assert(cupsResult.diagnostics.safeguards.nonPrinting === true, "CUPS diagnostics missed non-printing safeguard");
assert(cupsResult.diagnostics.safeguards.printFileCreated === false, "CUPS diagnostics should not create print files");
assert(cupsResult.diagnostics.safeguards.physicalPrinterCalled === false, "CUPS diagnostics should not call physical printers");
assert(!JSON.stringify(cupsResult.diagnostics).includes("SECRET_PRINTER"), "CUPS diagnostics leaked printer command value");
assert(!JSON.stringify(cupsResult.diagnostics).includes("/usr/bin/lpstat"), "CUPS diagnostics leaked command path");
assert(!JSON.stringify(cupsResult.diagnostics).includes("printer PRN-LABEL-A is idle"), "CUPS diagnostics leaked stdout content");

const deniedReadinessResult = await getOfficePrintDriverV1Readiness(
  {
    authState,
    operatorId: "U-FINANCE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async () => createJsonResponse(403, {
      error: {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: fulfillment.print",
        requiredPermission: "fulfillment.print",
      },
    }),
  },
);
assert(deniedReadinessResult.blocked === true, "print driver V1 readiness permission denial should be blocked");
assert(deniedReadinessResult.source === "api_error", "print driver V1 readiness denial source is incorrect");
assert(deniedReadinessResult.error.requiredPermission === "fulfillment.print", "print driver V1 readiness denial missed permission");
assert(deniedReadinessResult.readiness.ready === false, "denied V1 readiness should not fake ready");

const deniedCupsResult = await getOfficePrintDriverCupsDiagnostics(
  {
    authState,
    operatorId: "U-FINANCE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async () => createJsonResponse(403, {
      error: {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: fulfillment.print",
        requiredPermission: "fulfillment.print",
      },
    }),
  },
);
assert(deniedCupsResult.blocked === true, "CUPS diagnostics permission denial should be blocked");
assert(deniedCupsResult.source === "api_error", "CUPS diagnostics denial source is incorrect");
assert(deniedCupsResult.error.requiredPermission === "fulfillment.print", "CUPS diagnostics denial missed permission");
assert(deniedCupsResult.diagnostics.ready === false, "denied CUPS diagnostics should not fake ready");

const deniedSpoolResult = await getOfficePrintDriverSpoolDiagnostics(
  {
    authState,
    operatorId: "U-FINANCE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async () => createJsonResponse(403, {
      error: {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: fulfillment.print",
        requiredPermission: "fulfillment.print",
      },
    }),
  },
);
assert(deniedSpoolResult.blocked === true, "spool diagnostics permission denial should be blocked");
assert(deniedSpoolResult.source === "api_error", "spool diagnostics denial source is incorrect");
assert(deniedSpoolResult.error.requiredPermission === "fulfillment.print", "spool diagnostics denial missed permission");
assert(deniedSpoolResult.diagnostics.ready === false, "denied spool diagnostics should not fake ready");

const readyChecklist = buildPrintDriverReadinessChecklist(apiResult.config);
const readySummary = getPrintDriverReadinessSummary(apiResult.config);
assert(readySummary.passedCount === readySummary.totalCount, "ready print driver config checklist should pass all items");
assert(readyChecklist.every((item) => item.status === "通过"), "ready print driver config checklist should mark every item passed");
assert(!JSON.stringify(readyChecklist).includes("SECRET_PRINTER"), "readiness checklist leaked command value");

const integrationKit = buildOfficePrintDriverIntegrationKit({
  config: apiResult.config,
  samplePrintJob: {
    printJobId: "PJ-FRONT-KIT-001",
    printDeviceId: "PRN-FRONT-KIT-001",
    printDeviceName: "Front Kit Label Printer",
  },
});
const integrationKitText = JSON.stringify(integrationKit);
assert(integrationKit.version === OFFICE_PRINT_DRIVER_INTEGRATION_KIT_VERSION, "print driver integration kit version is incorrect");
assert(integrationKit.title === "打印联调包", "print driver integration kit title is incorrect");
assert(integrationKit.ready === true, "ready print driver config should generate a ready integration kit");
assert(integrationKit.allowedPrinterCount === 2, "print driver integration kit should expose allowlist count only");
assert(integrationKit.items.length === 2, "print driver integration kit should expose dispatch and status readback items");
assert(integrationKit.items[0].key === "command_bridge_dispatch", "print driver integration kit missed dispatch contract");
assert(integrationKit.items[0].ready === true, "print driver integration kit dispatch contract should be ready");
assert(integrationKit.items[1].key === "command_bridge_status_readback", "print driver integration kit missed readback contract");
assert(integrationKit.items[1].ready === true, "print driver integration kit readback contract should be ready");
assert(integrationKit.commandBridge.argumentTemplate.includes("{printJobId}"), "print driver integration kit missed printJobId placeholder");
assert(integrationKit.commandBridge.argumentTemplate.includes("{printDeviceId}"), "print driver integration kit missed printDeviceId placeholder");
assert(integrationKit.commandBridge.mode.includes("cups_lp"), "print driver integration kit missed CUPS lp bridge mode");
assert(
  integrationKit.items[0].commandContract.bridgeModes.includes("cups_lp"),
  "print driver integration kit dispatch contract missed cups_lp mode",
);
assert(
  integrationKit.items[1].statusMappings.some((item) => item.bridgeStatus.includes("completed") && item.erpPrintJobStatus === "printed"),
  "print driver integration kit missed completed-to-printed mapping",
);
assert(
  getOfficePrintDriverIntegrationKitSummary(integrationKit).includes("command_bridge"),
  "print driver integration kit summary missed command_bridge",
);
assert(
  getOfficePrintDriverIntegrationKitSummary(integrationKit).includes("spool_file"),
  "print driver integration kit summary missed spool_file",
);
assert(!integrationKitText.includes("SECRET_PRINTER"), "print driver integration kit leaked command value");
assert(!integrationKitText.includes("/usr/bin/lp"), "print driver integration kit leaked command path");
assert(!integrationKitText.includes("Office Label Printer"), "print driver integration kit leaked configured printer names");

const bearerCalls = [];
await getOfficePrintDriverConfig(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.print-driver-config-check" },
    },
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      bearerCalls.push({ url, init });
      return createJsonResponse(200, {
        printDriverAdapter: readyConfig,
      });
    },
  },
);
assert(
  bearerCalls[0]?.init.headers.authorization === "Bearer seed-session.print-driver-config-check",
  "print driver config missed bearer auth",
);

const deniedResult = await getOfficePrintDriverConfig(
  {
    authState,
    operatorId: "U-WAREHOUSE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async () => createJsonResponse(403, {
      error: {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: print.driver.view",
        requiredPermission: "print.driver.view",
      },
    }),
  },
);

assert(deniedResult.blocked === true, "print driver config permission denial should be blocked");
assert(deniedResult.source === "api_error", "print driver config denial source is incorrect");
assert(deniedResult.error.requiredPermission === "print.driver.view", "print driver config denial missed permission");
assert(deniedResult.config.realDispatchAvailable === false, "denied config should fall back to protected state");

const guardedConfig = normalizePrintDriverConfigForClient({
  adapterName: "guarded-print-driver-adapter",
  kind: "guarded_adapter",
  configurationAvailable: true,
  dryRunEnabled: false,
  systemPrinterEnabled: false,
  systemPrinterAdapterKind: "none",
  systemPrinterCommandConfigured: false,
  systemPrinterCommandArgsConfigured: false,
  systemPrinterCommandTimeoutMs: 0,
  commandBridgeStatusReadbackAvailable: false,
  allowedPrinterNames: [],
  realDispatchAvailable: false,
  environmentPreflight: {
    summary: {
      passedCount: 3,
      totalCount: 9,
      blockingCount: 6,
      tone: "warning",
    },
    items: [
      {
        key: "system-printer-enabled",
        label: "系统打印开关",
        status: "pending",
        tone: "warning",
        detail: "系统打印仍关闭，真实派发会被阻断",
        blocking: true,
      },
    ],
  },
  safeguards: {
    commandValueExposed: false,
    physicalPrinterCallsBlocked: true,
  },
});
const guardedChecklist = buildPrintDriverReadinessChecklist(guardedConfig);
const guardedSummary = getPrintDriverReadinessSummary(guardedConfig);
assert(guardedSummary.passedCount === 2, "guarded print driver config checklist should only pass readable config and command redaction");
assert(guardedChecklist.find((item) => item.key === "system-printer-enabled")?.status === "待配置", "guarded checklist should require system printer enablement");
assert(guardedChecklist.find((item) => item.key === "command-bridge-selected")?.status === "待配置", "guarded checklist should require command bridge");
assert(guardedChecklist.find((item) => item.key === "printer-allowlist")?.status === "待配置", "guarded checklist should require printer allowlist");
assert(guardedChecklist.find((item) => item.key === "status-readback")?.status === "待配置", "guarded checklist should require status readback");
assert(guardedChecklist.find((item) => item.key === "real-dispatch-available")?.status === "待配置", "guarded checklist should not fake real dispatch");
const guardedIntegrationKit = buildOfficePrintDriverIntegrationKit({ config: guardedConfig });
assert(guardedIntegrationKit.ready === false, "guarded print driver integration kit should not be ready");
assert(
  guardedIntegrationKit.items.every((item) => item.ready === false),
  "guarded print driver integration kit should mark dispatch/readback as pending",
);

const offlineResult = await getOfficePrintDriverConfig(
  {
    authState,
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async () => {
      throw new Error("print driver config offline");
    },
  },
);

assert(offlineResult.source === "local_fallback", "print driver config should fall back locally on network failure");
assert(offlineResult.config.configurationAvailable === false, "offline config should mark configuration unavailable");
assert(offlineResult.config.realDispatchAvailable === false, "offline config should not fake real dispatch");
assert(offlineResult.config.safeguards.physicalPrinterCallsBlocked === true, "offline config should remain protected");
assert(offlineResult.error.code === "PRINT_DRIVER_CONFIG_API_UNAVAILABLE", "offline config code is incorrect");
const offlineSummary = getPrintDriverReadinessSummary(offlineResult.config);
assert(offlineSummary.passedCount === 0, "offline print driver config checklist should not pass any readiness item");

const offlineReadinessResult = await getOfficePrintDriverV1Readiness(
  {
    authState,
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async () => {
      throw new Error("print driver V1 readiness offline");
    },
  },
);
assert(offlineReadinessResult.source === "local_fallback", "print driver V1 readiness should fall back locally on network failure");
assert(offlineReadinessResult.readiness.ready === false, "offline V1 readiness should not fake ready");
assert(offlineReadinessResult.error.code === "PRINT_DRIVER_V1_READINESS_API_UNAVAILABLE", "offline V1 readiness code is incorrect");

const offlineSpoolResult = await getOfficePrintDriverSpoolDiagnostics(
  {
    authState,
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async () => {
      throw new Error("spool diagnostics offline");
    },
  },
);
assert(offlineSpoolResult.source === "local_fallback", "spool diagnostics should fall back locally on network failure");
assert(offlineSpoolResult.diagnostics.ready === false, "offline spool diagnostics should not fake ready");
assert(offlineSpoolResult.error.code === "PRINT_DRIVER_SPOOL_DIAGNOSTICS_API_UNAVAILABLE", "offline spool diagnostics code is incorrect");

const offlineCupsResult = await getOfficePrintDriverCupsDiagnostics(
  {
    authState,
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async () => {
      throw new Error("CUPS diagnostics offline");
    },
  },
);
assert(offlineCupsResult.source === "local_fallback", "CUPS diagnostics should fall back locally on network failure");
assert(offlineCupsResult.diagnostics.ready === false, "offline CUPS diagnostics should not fake ready");
assert(offlineCupsResult.error.code === "PRINT_DRIVER_CUPS_DIAGNOSTICS_API_UNAVAILABLE", "offline CUPS diagnostics code is incorrect");

const normalized = normalizePrintDriverConfigForClient({
  allowedPrinterNames: "PRN-A, PRN-B",
  safeguards: {},
});
assert(normalized.allowedPrinterNames.length === 2, "print driver config normalization should split allowlist string");
assert(normalized.configurationAvailable === true, "print driver config normalization should default configurationAvailable to true");
assert(normalized.safeguards.physicalPrinterCallsBlocked === true, "print driver config normalization should default physical block to true");

const blockedReadiness = normalizePrintDriverV1ReadinessForClient({
  status: "blocked",
  ready: false,
  summary: { passedCount: 2, totalCount: 9, blockingCount: 7, tone: "danger" },
  criteria: [
    { key: "print-driver-config", label: "系统打印配置", status: "pending", blocking: true },
  ],
  deviceReadiness: [
    {
      key: "express-ltl-label-printer",
      label: "快递快运标签机",
      ready: false,
      printDevice: { printDeviceId: "PRN-LABEL-A", name: "标签机A", driverMode: "preview_only" },
    },
  ],
  safeguards: {},
});
assert(blockedReadiness.summary.blockingCount === 7, "blocked V1 readiness should normalize blocker count");
assert(blockedReadiness.criteria[0].statusLabel === "阻塞", "blocked V1 criterion should show blocker label");
assert(blockedReadiness.deviceReadiness[0].printDevice.driverMode === "preview_only", "blocked V1 readiness missed device mode");
assert(blockedReadiness.safeguards.nonPrinting === true, "blocked V1 readiness should default non-printing safeguard");

const normalizedSpoolDiagnostics = normalizePrintDriverSpoolDiagnosticsForClient({
  status: "failed",
  ready: false,
  spoolPath: "/tmp/erp-print-spool/secret",
  payload: "print payload",
  blockers: [{ key: "spool-write", label: "spool 写入", detail: "待配置" }],
  safeguards: {},
});
assert(normalizedSpoolDiagnostics.blockers[0].label === "spool 写入", "spool diagnostics normalization missed blocker");
assert(normalizedSpoolDiagnostics.safeguards.nonPrinting === true, "spool diagnostics should default non-printing safeguard");
assert(!Object.hasOwn(normalizedSpoolDiagnostics, "spoolPath"), "spool diagnostics normalization should not keep spool paths");
assert(!Object.hasOwn(normalizedSpoolDiagnostics, "payload"), "spool diagnostics normalization should not keep payload");

const normalizedCupsDiagnostics = normalizePrintDriverCupsDiagnosticsForClient({
  status: "failed",
  ready: false,
  preflightResult: {
    errorCode: "CUPS_STATUS_COMMAND_FAILED",
    stdoutBytes: 12,
    stderrBytes: 34,
    stdout: "printer PRN-LABEL-A is idle",
  },
  safeguards: {},
});
assert(normalizedCupsDiagnostics.preflightResult.stderrBytes === 34, "CUPS diagnostics normalization missed stderr byte count");
assert(normalizedCupsDiagnostics.safeguards.nonPrinting === true, "CUPS diagnostics should default non-printing safeguard");
assert(!Object.hasOwn(normalizedCupsDiagnostics.preflightResult, "stdout"), "CUPS diagnostics normalization should not keep stdout content");

console.log("Frontend print driver config API client check passed: API read, V1 readiness gate, spool diagnostics, CUPS diagnostics, auth headers, denial blocking, offline fallback, readiness checklist, environment preflight, integration kit, normalization, and command-value redaction are covered.");

function buildReadyV1ReadinessPayload() {
  const criteria = [
    "print-driver-config",
    "spool-status-readback",
    "cups-queue-preflight",
    "express-ltl-label-printer-device-configured",
    "express-ltl-label-printer-driver-mode",
    "express-ltl-label-printer-field-qa",
    "dot-matrix-notes-printer-device-configured",
    "dot-matrix-notes-printer-driver-mode",
    "dot-matrix-notes-printer-field-qa",
  ].map((key) => ({
    key,
    label: key,
    status: "passed",
    tone: "success",
    blocking: true,
    detail: "ready",
  }));
  return {
    status: "ready",
    ready: true,
    checkedAt: "2026-07-04T12:00:00.000Z",
    operatorId: "U-OFFICE-A",
    scope: "v1_print_go_live_readiness",
    summary: {
      label: "9/9 通过",
      passedCount: 9,
      totalCount: 9,
      blockingCount: 0,
      tone: "success",
    },
    requiredDocumentTypes: ["express_ltl_label", "package_label", "outbound_note", "pickup_note", "delivery_note"],
    criteria,
    deviceReadiness: [
      buildDeviceReadiness("express-ltl-label-printer", "快递快运标签机", "PRN-LABEL-A", "标签机A"),
      buildDeviceReadiness("dot-matrix-notes-printer", "针式出库/自提/送货单", "PRN-DOT-A", "针式打印机A"),
    ],
    printDriverAdapter: readyConfig,
    spoolDiagnostics: buildReadySpoolDiagnosticsPayload(),
    cupsDiagnostics: buildReadyCupsDiagnosticsPayload(),
    remainingV1Risks: ["仍需保留现场抽检"],
    safeguards: {
      nonPrinting: true,
      physicalPrinterCalled: false,
      commandValueExposed: false,
      commandArgsExposed: false,
      spoolPathExposed: false,
      payloadExposed: false,
    },
  };
}

function buildReadySpoolDiagnosticsPayload() {
  return {
    status: "ready",
    ready: true,
    checkedAt: "2026-07-04T12:00:00.000Z",
    scope: "non_printing_command_bridge_spool_diagnostics",
    mode: "command_bridge",
    storageKind: "spool_file",
    configured: true,
    writeOk: true,
    pendingPollOk: true,
    completedPollOk: true,
    cleanupOk: true,
    missingConfigFields: [],
    commandValue: "/usr/bin/lp -d SECRET_PRINTER",
    spoolPath: "/tmp/erp-print-spool/secret",
    payload: "print payload",
    blockers: [],
    safeguards: {
      nonPrinting: true,
      physicalPrinterCalled: false,
      commandValueExposed: false,
      commandArgsExposed: false,
      spoolPathExposed: false,
      payloadExposed: false,
    },
  };
}

function buildReadyCupsDiagnosticsPayload() {
  return {
    adapterName: "p0-print-driver-adapter",
    status: "ok",
    ready: true,
    checkedAt: "2026-07-04T12:00:00.000Z",
    scope: "non_printing_cups_queue_preflight",
    operatorId: "U-OFFICE-A",
    reason: "api_print_driver_cups_diagnostics",
    cupsQueueStatusReadback: "cups_status_command",
    cupsPrinterConfigured: true,
    cupsPrinterAllowed: true,
    cupsStatusCommandConfigured: true,
    cupsStatusCommandRunnable: true,
    physicalPrinterCalled: false,
    commandValueExposed: false,
    commandArgsExposed: false,
    stdoutExposed: false,
    stderrExposed: false,
    systemPrinterCommand: "/usr/bin/lpstat -p SECRET_PRINTER",
    configuration: {
      kind: "guarded_adapter",
      dryRunEnabled: false,
      systemPrinterEnabled: true,
      systemPrinterAdapterKind: "command_bridge",
      systemPrinterCommandConfigured: true,
      systemPrinterCommandArgsConfigured: true,
      systemPrinterCommandTimeoutMs: 5000,
      allowedPrinterCount: 2,
      realDispatchAvailable: true,
    },
    blockers: [],
    preflightResult: {
      status: "ok",
      ready: true,
      action: "cups-preflight",
      mode: "cups_lp",
      scope: "non_printing_cups_queue_preflight",
      cupsAllowlistConfigured: true,
      cupsPrinterConfigured: true,
      cupsPrinterAllowed: true,
      cupsStatusCommandConfigured: true,
      cupsStatusCommandRunnable: true,
      exitCode: 0,
      signal: "",
      stdoutBytes: 128,
      stderrBytes: 0,
      errorCode: "",
      message: "CUPS 队列状态命令可运行",
      stdout: "printer PRN-LABEL-A is idle",
    },
    safeguards: {
      nonPrinting: true,
      commandValueExposed: false,
      commandArgsExposed: false,
      stdoutExposed: false,
      stderrExposed: false,
      payloadExposed: false,
      printFileCreated: false,
      physicalPrinterCalled: false,
    },
  };
}

function buildDeviceReadiness(key, label, printDeviceId, name) {
  return {
    key,
    label,
    ready: true,
    documentTypes: ["express_ltl_label"],
    requiredChecks: ["sample_print", "paper_alignment"],
    printDevice: {
      printDeviceId,
      name,
      deviceType: key.includes("dot") ? "dot_matrix" : "label",
      status: "active",
      driverMode: "system_printer",
      systemPrinterCommand: "/usr/bin/lp -d SECRET_PRINTER",
    },
    latestFieldTestRecord: {
      recordId: `PDQA-${printDeviceId}`,
      checkedAt: "2026-07-04T12:00:00.000Z",
    },
    latestFieldTestSummary: {
      label: "6/6 通过",
      passedCount: 6,
      totalCount: 6,
      failedCount: 0,
    },
    criteria: [
      {
        key: `${key}-field-qa`,
        label: `${label}现场 QA`,
        status: "passed",
        tone: "success",
        blocking: true,
        detail: "最新现场 QA 记录全部关键项通过",
      },
    ],
  };
}

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
