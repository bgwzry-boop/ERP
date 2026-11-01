import assert from "node:assert/strict";
import { printRawMaterialLabelFrame } from "../src/features/raw-materials/runRawMaterialLabelPrint.js";

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
globalThis.setTimeout = (callback, duration) => {
  assert.equal(duration, 120000);
  const id = ++timerId;
  timers.set(id, callback);
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

  const noEvents = harness(() => {});
  await expectClean(noEvents, printRawMaterialLabelFrame(noEvents.frame, "synthetic label"), false);

  const missingAfterPrint = harness(emit => emit("beforeprint"));
  const fallbackResult = printRawMaterialLabelFrame(missingAfterPrint.frame, "synthetic label");
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  await expectClean(missingAfterPrint, fallbackResult, true);
} finally {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
}
console.log("PASS label print lifecycle: blocking and delayed print closure, print errors, no-event failure and missing-afterprint fallback settle once and clean listeners/timers. No browser, physical print or business writes.");
