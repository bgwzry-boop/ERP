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
  assert.ok(duration === 400 || duration === 120000, `unexpected print timer ${duration}`);
  const id = ++timerId;
  timers.set(id, { callback, duration });
  return id;
};
globalThis.clearTimeout = id => timers.delete(id);

function fireTimers(duration) {
  for (const [id, timer] of [...timers]) {
    if (timer.duration !== duration) continue;
    timers.delete(id);
    timer.callback();
  }
}

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
  const staleTimer = [...timers.values()][0].callback;
  asynchronous.win.emit("afterprint");
  await expectClean(asynchronous, asyncResult, true);
  staleTimer();
  assert.equal(asynchronous.removed(), 1, "a queued old timer cannot settle or remove again");

  // Chrome cancel closes the preview with afterprint and never fires beforeprint
  // on the hidden label frame. That preview did open.
  const cancelled = harness(emit => emit("afterprint"));
  await expectClean(cancelled, printRawMaterialLabelFrame(cancelled.frame, "synthetic label"), true);
  assert.equal(timers.size, 0, "a closed preview must not keep the open-grace timer");

  const cancelledBeforeBeforePrint = harness(emit => { emit("afterprint"); emit("beforeprint"); });
  await expectClean(cancelledBeforeBeforePrint, printRawMaterialLabelFrame(cancelledBeforeBeforePrint.frame, "synthetic label"), true);

  const parent = harness(() => {});
  const parentListeners = new Map();
  const parentWin = {
    addEventListener(type, callback) {
      if (!parentListeners.has(type)) parentListeners.set(type, new Set());
      parentListeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { parentListeners.get(type)?.delete(callback); },
    emit(type) { for (const callback of [...(parentListeners.get(type) ?? [])]) callback(); },
  };
  parent.frame.ownerDocument = { defaultView: parentWin };
  const parentResult = printRawMaterialLabelFrame(parent.frame, "synthetic label");
  parentWin.emit("afterprint");
  await expectClean(parent, parentResult, true);
  assert.equal([...parentListeners.values()].reduce((sum, items) => sum + items.size, 0), 0, "parent print listeners removed");

  const noEvents = harness(() => {});
  const noEventsResult = printRawMaterialLabelFrame(noEvents.frame, "synthetic label");
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].duration, 400);
  fireTimers(400);
  await expectClean(noEvents, noEventsResult, false);

  const delayedOpen = harness(() => {});
  const delayedResult = printRawMaterialLabelFrame(delayedOpen.frame, "synthetic label");
  assert.equal([...timers.values()][0].duration, 400);
  delayedOpen.win.emit("beforeprint");
  assert.equal([...timers.values()][0].duration, 120000, "a late beforeprint must wait for the preview to close");
  delayedOpen.win.emit("afterprint");
  await expectClean(delayedOpen, delayedResult, true);

  const missingAfterPrint = harness(emit => emit("beforeprint"));
  const fallbackResult = printRawMaterialLabelFrame(missingAfterPrint.frame, "synthetic label");
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].duration, 120000);
  [...timers.values()][0].callback();
  await expectClean(missingAfterPrint, fallbackResult, true);
} finally {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
}
console.log("PASS label print lifecycle: blocking and delayed print closure, print cancel, parent-window preview, print errors, no-event failure and missing-afterprint fallback settle once and clean listeners/timers. No browser, physical print or business writes.");
