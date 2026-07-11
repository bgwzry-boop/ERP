import assert from "node:assert/strict";
import { buildPrintDriverV1Readiness } from "../server/services/printDriverV1ReadinessService.mjs";

const checkedAt = "2026-07-12T14:00:00.000Z";
const now = () => new Date(checkedAt);
const operatorId = "U-WAREHOUSE-FORMAL";

const blockedCalls = [];
const blocked = buildPrintDriverV1Readiness({
  workspace: { printDevices: [], printerDeviceFieldTests: [] },
  operatorId,
  now,
  ...buildDiagnosticDependencies({ calls: blockedCalls, configReady: false, spoolReady: false, cupsReady: false }),
});
assert.equal(blocked.ready, false);
assert.equal(blocked.status, "blocked");
assert.equal(blocked.summary.label, "0/9 通过");
assert.equal(blocked.checkedAt, checkedAt);
assert.equal(blocked.operatorId, operatorId);
assert.equal(blocked.deviceReadiness.length, 2);
assert.equal(blocked.safeguards.nonPrinting, true);
assert.equal(blocked.safeguards.physicalPrinterCalled, false);
assert.deepEqual(blockedCalls, [
  { type: "config" },
  { type: "spool", operatorId },
  { type: "cups", operatorId },
]);

const readyWorkspace = buildReadyWorkspace();
const readySnapshot = JSON.stringify(readyWorkspace);
const ready = buildPrintDriverV1Readiness({
  workspace: readyWorkspace,
  operatorId,
  now,
  ...buildDiagnosticDependencies({ configReady: true, spoolReady: true, cupsReady: true }),
});
assert.equal(ready.ready, true);
assert.equal(ready.summary.label, "9/9 通过");
assert.equal(ready.criteria.every((item) => item.status === "passed"), true);
assert.equal(ready.deviceReadiness.every((item) => item.ready), true);
assert.deepEqual(ready.requiredDocumentTypes, [
  "express_ltl_label",
  "package_label",
  "outbound_note",
  "pickup_note",
  "delivery_note",
]);
assert.equal(ready.spoolDiagnostics.ready, true);
assert.equal(ready.cupsDiagnostics.ready, true);
assert.equal(JSON.stringify(readyWorkspace), readySnapshot);

const environmentBlocked = buildPrintDriverV1Readiness({
  workspace: readyWorkspace,
  operatorId,
  now,
  ...buildDiagnosticDependencies({
    configReady: true,
    environmentBlockingCount: 2,
    spoolReady: true,
    cupsReady: true,
  }),
});
const configCriterion = environmentBlocked.criteria.find((item) => item.key === "print-driver-config");
assert.equal(environmentBlocked.ready, false);
assert.equal(configCriterion.status, "pending");
assert.match(configCriterion.detail, /环境预检仍有 2 项阻断/);

const incompleteWorkspace = buildReadyWorkspace();
incompleteWorkspace.printDevices[0] = {
  ...incompleteWorkspace.printDevices[0],
  settings: { driverMode: "preview_only" },
};
incompleteWorkspace.printerDeviceFieldTests[1] = {
  ...incompleteWorkspace.printerDeviceFieldTests[1],
  checks: incompleteWorkspace.printerDeviceFieldTests[1].checks.filter((item) => item.key !== "void_reprint"),
  evidence: {
    ...incompleteWorkspace.printerDeviceFieldTests[1].evidence,
    operatorAcceptance: "",
  },
};
const incomplete = buildPrintDriverV1Readiness({
  workspace: incompleteWorkspace,
  operatorId,
  now,
  ...buildDiagnosticDependencies({ configReady: true, spoolReady: true, cupsReady: true }),
});
assert.equal(incomplete.ready, false);
assert.equal(incomplete.summary.label, "7/9 通过");
assert.equal(
  incomplete.criteria.find((item) => item.key === "express-ltl-label-printer-driver-mode")?.status,
  "pending",
);
const dotQa = incomplete.criteria.find((item) => item.key === "dot-matrix-notes-printer-field-qa");
assert.equal(dotQa.status, "pending");
assert.equal(dotQa.evidence.missingChecks.includes("void_reprint"), true);
assert.ok(incomplete.remainingV1Risks.some((item) => item.includes("现场 QA 仍有未通过项目")));

assert.throws(
  () => buildPrintDriverV1Readiness({ workspace: readyWorkspace, operatorId, now }),
  /requires getConfiguration/,
);

console.log("print-driver V1 readiness service checks passed");

function buildDiagnosticDependencies({
  calls = [],
  configReady = false,
  environmentBlockingCount = configReady ? 0 : 1,
  spoolReady = false,
  cupsReady = false,
} = {}) {
  return {
    getConfiguration() {
      calls.push({ type: "config" });
      return {
        printDriverAdapter: {
          adapterKind: configReady ? "command_bridge" : "preview_only",
          realDispatchAvailable: configReady,
          environmentPreflight: { summary: { blockingCount: environmentBlockingCount } },
        },
      };
    },
    getSpoolDiagnostics({ operatorId: requestedOperatorId }) {
      calls.push({ type: "spool", operatorId: requestedOperatorId });
      return {
        status: spoolReady ? "ok" : "not_configured",
        ready: spoolReady,
        writeOk: spoolReady,
        pendingPollOk: spoolReady,
        completedPollOk: spoolReady,
        cleanupOk: spoolReady,
      };
    },
    getCupsDiagnostics({ operatorId: requestedOperatorId }) {
      calls.push({ type: "cups", operatorId: requestedOperatorId });
      return {
        status: cupsReady ? "ok" : "not_configured",
        ready: cupsReady,
        cupsPrinterConfigured: cupsReady,
        cupsPrinterAllowed: cupsReady,
        cupsStatusCommandConfigured: cupsReady,
        cupsStatusCommandRunnable: cupsReady,
      };
    },
  };
}

function buildReadyWorkspace() {
  return {
    printDevices: [
      buildDevice({
        printDeviceId: "PRN-LABEL-FORMAL",
        name: "标签机",
        deviceType: "label_printer",
        documentTypes: ["express_ltl_label", "package_label"],
      }),
      buildDevice({
        printDeviceId: "PRN-DOT-FORMAL",
        name: "针式打印机",
        deviceType: "dot_matrix",
        documentTypes: ["outbound_note", "pickup_note", "delivery_note"],
      }),
    ],
    printerDeviceFieldTests: [
      buildQaRecord("PDQA-LABEL", "PRN-LABEL-FORMAL", "express_ltl_label", "2026-07-12T13:40:00.000Z"),
      buildQaRecord("PDQA-DOT", "PRN-DOT-FORMAL", "delivery_note", "2026-07-12T13:45:00.000Z"),
    ],
  };
}

function buildDevice({ printDeviceId, name, deviceType, documentTypes }) {
  return {
    printDeviceId,
    name,
    deviceType,
    status: "active",
    connectionType: "system_printer",
    supportedDocumentTypes: documentTypes,
    defaultDocumentTypes: documentTypes,
    settings: { driverMode: "system_printer" },
  };
}

function buildQaRecord(recordId, printDeviceId, documentType, recordCheckedAt) {
  return {
    recordId,
    printDeviceId,
    documentType,
    checkedAt: recordCheckedAt,
    checks: [
      "sample_print",
      "paper_alignment",
      "barcode_scan",
      "driver_callback",
      "legibility",
      "void_reprint",
    ].map((key) => ({ key, status: "passed" })),
    evidence: {
      samplePrintReference: `${recordId}-SAMPLE`,
      barcodeScanText: `${recordId}-BARCODE`,
      driverCallbackStatus: "spool completed -> printed",
      voidReprintReference: `${recordId}-VOID-REPRINT`,
      operatorAcceptance: "仓库现场签认",
    },
  };
}
