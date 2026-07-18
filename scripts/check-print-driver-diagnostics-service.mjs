import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createPrintDriverDiagnosticsService } from "../server/services/printDriverDiagnosticsService.mjs";

const checkedAt = "2026-07-14T02:00:00.000Z";
const now = () => new Date(checkedAt);
const service = createPrintDriverDiagnosticsService({ now });
const unavailableWorkspace = {
  printDriverAdapter: { kind: "custom_missing_adapter" },
  printDevices: [],
  printerDeviceFieldTests: [],
};

const configuration = service.getConfiguration({ workspace: unavailableWorkspace });
assert.equal(configuration.printDriverAdapter.kind, "custom_missing_adapter");
assert.equal(configuration.printDriverAdapter.configurationAvailable, false);
assert.equal(configuration.printDriverAdapter.environmentPreflight.checkedAt, checkedAt);
assert.equal(configuration.printDriverAdapter.safeguards.commandValueExposed, false);

const spool = service.getSpoolDiagnostics({ workspace: unavailableWorkspace, operatorId: "U-OFFICE-A" });
assert.equal(spool.status, "not_available");
assert.equal(spool.ready, false);
assert.equal(spool.checkedAt, checkedAt);
assert.equal(spool.operatorId, "U-OFFICE-A");
assert.equal(spool.blockers[0].key, "spool-diagnostics-adapter-method");
assert.equal(spool.safeguards.nonPrinting, true);
assert.equal(spool.safeguards.physicalPrinterCalled, false);

const cups = service.getCupsDiagnostics({ workspace: unavailableWorkspace, operatorId: "U-OFFICE-A" });
assert.equal(cups.status, "not_available");
assert.equal(cups.ready, false);
assert.equal(cups.checkedAt, checkedAt);
assert.equal(cups.reason, "api_print_driver_cups_diagnostics");
assert.equal(cups.blockers[0].key, "cups-diagnostics-adapter-method");
assert.equal(cups.safeguards.printFileCreated, false);
assert.equal(cups.safeguards.physicalPrinterCalled, false);

const blockedReadiness = service.getV1Readiness({ workspace: unavailableWorkspace, operatorId: "U-OFFICE-A" });
assert.equal(blockedReadiness.status, "blocked");
assert.equal(blockedReadiness.ready, false);
assert.equal(blockedReadiness.checkedAt, checkedAt);
assert.equal(blockedReadiness.summary.label, "0/9 通过");
assert.equal(blockedReadiness.safeguards.nonPrinting, true);

const adapterCalls = [];
const configuredWorkspace = {
  printDriverAdapter: {
    getConfiguration() {
      adapterCalls.push({ kind: "configuration" });
      return {
        adapterName: "configured-adapter",
        kind: "guarded_adapter",
        realDispatchAvailable: true,
        environmentPreflight: { summary: { blockingCount: 0 } },
      };
    },
    runSpoolDiagnostics(input) {
      adapterCalls.push({ kind: "spool", input });
      return {
        status: "ok",
        ready: true,
        writeOk: true,
        pendingPollOk: true,
        completedPollOk: true,
        cleanupOk: true,
      };
    },
    runCupsDiagnostics(input) {
      adapterCalls.push({ kind: "cups", input });
      return {
        status: "ok",
        ready: true,
        cupsPrinterConfigured: true,
        cupsPrinterAllowed: true,
        cupsStatusCommandConfigured: true,
        cupsStatusCommandRunnable: true,
      };
    },
  },
  printDevices: [],
  printerDeviceFieldTests: [],
};

assert.equal(service.getConfiguration({ workspace: configuredWorkspace }).printDriverAdapter.adapterName, "configured-adapter");
assert.equal(service.getSpoolDiagnostics({ workspace: configuredWorkspace, operatorId: "U-PRINT" }).ready, true);
assert.equal(service.getCupsDiagnostics({ workspace: configuredWorkspace, operatorId: "U-PRINT" }).ready, true);
const partialReadiness = service.getV1Readiness({ workspace: configuredWorkspace, operatorId: "U-PRINT" });
assert.equal(partialReadiness.summary.label, "3/9 通过");
assert.deepEqual(adapterCalls, [
  { kind: "configuration" },
  {
    kind: "spool",
    input: { operatorId: "U-PRINT", reason: "api_print_driver_spool_diagnostics" },
  },
  {
    kind: "cups",
    input: { operatorId: "U-PRINT", reason: "api_print_driver_cups_diagnostics" },
  },
  { kind: "configuration" },
  {
    kind: "spool",
    input: { operatorId: "U-PRINT", reason: "api_print_driver_spool_diagnostics" },
  },
  {
    kind: "cups",
    input: { operatorId: "U-PRINT", reason: "api_print_driver_cups_diagnostics" },
  },
]);

assert.throws(
  () => createPrintDriverDiagnosticsService({ now: () => new Date("invalid") }).getConfiguration(),
  /valid Date/,
);
assert.throws(() => createPrintDriverDiagnosticsService({ buildReadiness: null }), /buildReadiness must be a function/);

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../server/routes/printReadRoutes.mjs", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url), "utf8");
assert.doesNotMatch(apiSource, /function getPrintDriver(?:Configuration|SpoolDiagnostics|CupsDiagnostics|V1Readiness)Response/);
assert.match(registrySource, /createPrintDriverDiagnosticsService\(\)/);
assert.match(routeSource, /printDriverDiagnosticsService\.getConfiguration/);
assert.match(routeSource, /printDriverDiagnosticsService\[driverMethod\]/);

console.log(
  "Print-driver diagnostics service checks passed: safe fallbacks, adapter delegation, non-printing readiness, clocks, and thin HTTP composition are isolated.",
);
