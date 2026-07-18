import assert from "node:assert/strict";
import { join } from "node:path";
import { checkPositivePrintDriverReadiness } from "./helpers/apiSkeletonPrintReadinessScenario.mjs";

const storageRoot = join(process.cwd(), ".erp-local-storage", "checks", "api-skeleton-print-readiness-scenario");
const printCommandBridgeScript = join(process.cwd(), "scripts", "print-command-bridge.mjs");
const fakeCupsStatusScript = join(process.cwd(), "scripts", "fake-cups-lpstat.mjs");

const { readiness, cupsDiagnostics } = await checkPositivePrintDriverReadiness({
  storageRoot,
  printCommandBridgeScript,
  fakeCupsStatusScript,
});

assert.equal(readiness.ready, true);
assert.equal(readiness.summary.blockingCount, 0);
assert.equal(cupsDiagnostics.ready, true);
assert.equal(cupsDiagnostics.safeguards.physicalPrinterCalled, false);

console.log("API skeleton print-readiness scenario check passed: ready devices, non-printing CUPS preflight, redaction, and server cleanup are covered.");
