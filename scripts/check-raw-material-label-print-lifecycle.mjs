import assert from "node:assert/strict";
import { PRINT_PREVIEW_TIMEOUT_MS, SILENT_PRINT_GRACE_MS, printRawMaterialLabelFrame } from "../src/features/raw-materials/runRawMaterialLabelPrint.js";

function harness(print) {
  const listeners = new Map();
  let removed = 0;
  const win = {
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    focus() {},
    print() { print(type => win.emit(type)); },
    emit(type) { for (const callback of [...(listeners.get(type) ?? [])]) callback(); },
  };
  const frame = {
    contentWindow: win,
    contentDocument: { open() {}, write(html) { assert.match(html, /synthetic label/); }, close() {} },
    remove() { removed += 1; },
  };
  return { frame, win, removed: () => removed,
    listenerCount: () => [...listeners.values()].reduce((sum, items) => sum + items.size, 0) };
}

const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const timers = new Map();
let timerId = 0;
const durations = new Map();
globalThis.setTimeout = (callback, duration) => {
  assert.ok([PRINT_PREVIEW_TIMEOUT_MS, SILENT_PRINT_GRACE_MS].includes(duration), `unexpected timer ${duration}`);
  const id = ++timerId;
  timers.set(id, callback);
  durations.set(id, duration);
  return id;
};
globalThis.clearTimeout = id => timers.delete(id);

async function expectClean(test, pending, expected) {
  let settled = 0;
  const tracked = pending.then(result => { settled += 1; return result; });
  assert.equal(await tracked, expected);
  test.win.emit("beforeprint");
  test.win.emit("afterprint");
  await Promise.resolve();
  assert.equal(settled, 1, "print result must settle once");
  assert.equal(test.removed(), 1, "print frame removed exactly once");
  assert.equal(test.listenerCount(), 0, "both lifecycle listeners removed");
  assert.equal(timers.size, 0, "no timer remains after completion");
}

try {
  const synchronous = harness(emit => { emit("beforeprint"); emit("afterprint"); });
  await expectClean(synchronous, printRawMaterialLabelFrame(synchronous.frame, "synthetic label"), true);
  assert.equal(timerId, 0, "a completed blocking print must not wait for a fallback timer");

  const failed = harness(() => { throw new Error("synthetic printer failure"); });
  await expectClean(failed, printRawMaterialLabelFrame(failed.frame, "synthetic label"), false);

  const failedAfterOpening = harness(emit => { emit("beforeprint"); throw new Error("synthetic cancellation error"); });
  await expectClean(failedAfterOpening, printRawMaterialLabelFrame(failedAfterOpening.frame, "synthetic label"), false);

  const asynchronous = harness(emit => emit("beforeprint"));
  const asyncResult = printRawMaterialLabelFrame(asynchronous.frame, "synthetic label");
  assert.equal(timers.size, 1);
  const staleTimer = [...timers.values()][0];
  asynchronous.win.emit("afterprint");
  await expectClean(asynchronous, asyncResult, true);
  staleTimer();
  assert.equal(asynchronous.removed(), 1, "a queued old timer cannot settle or remove again");

  // 2026-11-05: a Windows Chrome on site printed the labels without firing any print event.
  // print() did not fail, so after a short grace the result is handed to the human confirmation.
  const noEvents = harness(() => {});
  const silentResult = printRawMaterialLabelFrame(noEvents.frame, "synthetic label");
  assert.equal(timers.size, 1);
  assert.equal(durations.get([...timers.keys()][0]), SILENT_PRINT_GRACE_MS);
  [...timers.values()][0]();
  await expectClean(noEvents, silentResult, true);

  // A browser that opens the preview a moment after print() returns: the grace becomes the long wait.
  const late = harness(() => {});
  const lateResult = printRawMaterialLabelFrame(late.frame, "synthetic label");
  late.win.emit("beforeprint");
  assert.deepEqual([...timers.keys()].map(id => durations.get(id)), [PRINT_PREVIEW_TIMEOUT_MS], "late preview cancels the grace and waits for the preview");
  late.win.emit("afterprint");
  await expectClean(late, lateResult, true);

  // afterprint without beforeprint still means the browser handled the print.
  const afterOnly = harness(emit => emit("afterprint"));
  await expectClean(afterOnly, printRawMaterialLabelFrame(afterOnly.frame, "synthetic label"), true);

  const missingAfterPrint = harness(emit => emit("beforeprint"));
  const fallbackResult = printRawMaterialLabelFrame(missingAfterPrint.frame, "synthetic label");
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  await expectClean(missingAfterPrint, fallbackResult, true);
} finally {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
}
console.log("PASS label print lifecycle: blocking and delayed print closure, print errors, silent printing without events (handed to the human confirmation), late preview and missing-afterprint fallback settle once and clean listeners/timers. No browser, physical print or business writes.");
