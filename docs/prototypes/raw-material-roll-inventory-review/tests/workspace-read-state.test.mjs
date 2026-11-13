import test from "node:test";
import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { UNLOADED_READ, beginRead, finishRead, validateReceiptPage, workspaceReadDependencies } from "../src/formal-workspace-read-state.js";
import { readCompleteCollection } from "../src/read-complete-collection.js";

// The review app and root have separate React installations. Use the same
// runtime as the renderer, just as Vite dedupes React for the mounted app.
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const React = require("react");
const { act, create } = require("react-test-renderer");
const bundle = await build({ stdin: { contents: `export { useReceivingData } from './src/useReceivingData.js'; export { useFormalDesktopWorkspace } from './src/useFormalDesktopWorkspace.js';`,
  resolveDir: fileURLToPath(new URL("..", import.meta.url)), loader: "js" }, bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent",
  plugins: [{ name: "single-react-runtime", setup(builder) { builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: require.resolve(args.path), external: true })); } }] });
const module = new Module(fileURLToPath(import.meta.url));
module._compile(bundle.outputFiles[0].text, fileURLToPath(import.meta.url));
const { useReceivingData, useFormalDesktopWorkspace } = module.exports;

const stages = { 待核对: 34, 退货单: 2, 待打印: 6, 待贴标: 3, 异常: 0 };
const receipts = Array.from({ length: 46 }, (_, index) => ({ id: `RECEIPT-${index + 1}`, supplierName: "读取测试供应商", revision: 2, status: "已识别待复核", rolls: [] }));
const auth = { authenticated: true, session: { accessToken: "isolated-read-test", userId: "U-MANAGER-A" }, permissions: { user: { userId: "U-MANAGER-A", defaultRole: "management" }, actionPermissions: ["master_data.import.plan.create", "statement.preview"] } };
const json = value => new Response(JSON.stringify(value), { status: 200 });

test("failed first load, empty success, and failed refresh have distinct states", () => {
  const fail = { source: "api_error", error: { message: "断网" } };
  const firstFailure = finishRead(beginRead(), fail);
  assert.equal(firstFailure.status, "error");
  assert.equal(firstFailure.hasLoaded, false);
  const empty = finishRead(firstFailure, { source: "api", items: [] }, "saved-at");
  assert.equal(empty.status, "empty");
  const stale = finishRead(beginRead(empty), fail);
  assert.equal(stale.status, "stale");
  assert.equal(stale.lastSyncedAt, "saved-at");
  assert.equal(stale.hasLoaded, true);
  assert.equal(UNLOADED_READ.status, "unloaded");
});

test("receipt summary is required independently of page rows, while full-ledger dependencies stay explicit", () => {
  const page = { source: "api", items: receipts.slice(0, 20), total: 46, page: 1, pageSize: 20, receiptStageCounts: stages };
  assert.equal(validateReceiptPage(page, { page: 1, pageSize: 20 }), page);
  assert.equal(validateReceiptPage({ ...page, receiptStageCounts: undefined }, page).source, "api_error");
  assert.equal(validateReceiptPage({ ...page, receiptStageCounts: { 待核对: 20 } }, page).source, "api_error");
  assert.deepEqual(workspaceReadDependencies["material-receiving"], []);
  for (const view of ["supplier-month-end", "raw-material-cost", "roll-inventory"]) assert.ok(workspaceReadDependencies[view].includes("rawMaterialInbounds"));
});

test("superseded full scans stop before requesting another page", async () => {
  let current = true;
  let calls = 0;
  const result = await readCompleteCollection(async () => {
    calls++;
    current = false;
    return { source: "api", page: 1, pageSize: 1, total: 40, items: [{ id: "first" }] };
  }, { isCurrent: () => current });
  assert.equal(result.source, "superseded");
  assert.equal(calls, 1);
});

function browserHarness() {
  const originals = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  const timers = new Map();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = { setInterval: callback => { const id = Symbol(); timers.set(id, callback); return id; }, clearInterval: id => timers.delete(id), addEventListener() {}, removeEventListener() {} };
  globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
  return { timers, restore() { globalThis.fetch = originals.fetch; globalThis.window = originals.window; globalThis.document = originals.document; globalThis.IS_REACT_ACT_ENVIRONMENT = originals.act; } };
}

test("receipt reader pages on the server, retains a selected receipt and last good page after an outage", async () => {
  const env = browserHarness();
  const requests = [];
  let fail = false;
  let hook;
  let tree;
  globalThis.fetch = async address => {
    const url = new URL(address); requests.push(url);
    if (fail) throw new Error("network disconnected");
    if (url.pathname === "/api/raw-material-inbounds") {
      const page = Number(url.searchParams.get("page")); const size = Number(url.searchParams.get("pageSize"));
      const items = url.searchParams.get("keyword") ? [] : receipts;
      return json({ items: items.slice((page - 1) * size, page * size), page, pageSize: size, total: items.length,
        receiptStageCounts: stages, metrics: { totalCount: 46 } });
    }
    const inbound = receipts.find(item => url.pathname.endsWith(`/${item.id}`));
    assert.ok(inbound, `unexpected read ${url.pathname}`);
    return json({ inbound });
  };
  function Harness({ active = true }) { hook = useReceivingData({ authState: auth, active, operatorId: "U-MANAGER-A" }); return null; }
  try {
    await act(async () => { tree = create(React.createElement(Harness)); });
    assert.equal(hook.receiving.items.length, 20);
    assert.equal(hook.receiving.total, 46);
    assert.deepEqual(hook.receiving.stageCounts, stages);
    assert.equal(requests.length, 1, "initial receipt read must not walk every page");
    await act(async () => { await hook.actions.selectReceipt("RECEIPT-5"); });
    await act(async () => { hook.actions.changeReceiptPage(2); });
    assert.equal(hook.receiving.items[0].id, "RECEIPT-21");
    assert.equal(hook.receiving.selectedInbound.id, "RECEIPT-5");
    fail = true;
    await act(async () => { await hook.actions.refreshReceipts(); });
    assert.equal(hook.receiving.status, "stale");
    assert.equal(hook.receiving.items.length, 20);
    assert.equal(hook.receiving.selectedInbound.id, "RECEIPT-5");
    assert.equal(hook.receiving.detailState.status, "stale");
    await act(async () => { hook.actions.setReceiptQuery({ keyword: "missing" }); });
    assert.deepEqual(hook.receiving.items, [], "failed new filter cannot present the previous page as matching");
    assert.equal(hook.receiving.previousItems.length, 20);
    assert.equal(hook.receiving.total, null);
    fail = false;
    await act(async () => { await hook.actions.refreshReceipts(); });
    assert.equal(hook.receiving.status, "empty");
    assert.equal(hook.receiving.total, 0);
    assert.equal(hook.receiving.selectedInbound.id, "RECEIPT-5");
    const count = requests.length;
    globalThis.document.visibilityState = "hidden";
    await act(async () => { for (const timer of env.timers.values()) await timer(); });
    assert.equal(requests.length, count, "hidden workspaces must not poll");
    await act(async () => { tree.update(React.createElement(Harness, { active: false })); });
    assert.equal(env.timers.size, 0, "leaving receiving stops its timer");
  } finally { if (tree) await act(async () => tree.unmount()); env.restore(); }
});

test("desktop initial reads follow the active page and search loads only its own dependencies", async () => {
  const env = browserHarness();
  const paths = [];
  let fail = false;
  let hook;
  let tree;
  globalThis.fetch = async address => {
    const url = new URL(address); paths.push(url.pathname);
    if (url.pathname.includes("/auth/")) return json(auth);
    if (fail) throw new Error("network disconnected");
    const page = Number(url.searchParams.get("page") || 1); const pageSize = Number(url.searchParams.get("pageSize") || 200);
    const items = url.pathname === "/api/todos" ? [{ id: "T-1", title: "已有待办", handled: false }] : [];
    return json({ items, total: items.length, page, pageSize });
  };
  function Harness() { hook = useFormalDesktopWorkspace(); return null; }
  try {
    await act(async () => { tree = create(React.createElement(Harness)); });
    assert.ok(hook.authState.authenticated);
    assert.ok(paths.every(path => path.includes("/auth/")), "authentication must not trigger all 14 collections");
    await act(async () => { hook.actions.setActiveView("shared-todos"); });
    assert.equal(hook.data.todos.length, 1);
    assert.equal(hook.meta.hasLoaded, true);
    assert.deepEqual(Object.keys(hook.meta.collections), ["todos"]);
    fail = true;
    await act(async () => { await hook.actions.refreshAll(); });
    assert.equal(hook.data.todos.length, 1);
    assert.equal(hook.meta.collections.todos.status, "stale");
    assert.equal(hook.meta.blockingError, false);
    fail = false;
    await act(async () => { await hook.actions.ensureSearchData(); });
    assert.deepEqual(Object.keys(hook.meta.collections).sort(), ["customers", "orderLines", "todos"]);
    assert.ok(paths.includes("/api/master-data/customer-records"), "global search must include customer profiles without business records");
    assert.ok(!paths.some(path => path.includes("/statements")), "customer search must not read finance data");
    await act(async () => { hook.actions.setActiveView("customer-records"); });
    assert.ok(paths.some(path => path.includes("/statements")), "archive reads receivables only for an authorized role");
    assert.ok(!paths.some(path => path.includes("raw-material-inbounds")));
    assert.equal(env.timers.size, 0, "non-receipt pages must not start a whole-material timer");
  } finally { if (tree) await act(async () => tree.unmount()); env.restore(); }
});

// 负责人 2026-11-08 工作台「今天」：冷启动必须真的去读订单、出库、原料收货三类数据；
// 读失败或没读完时不能显示"没有要办的事"。
test("today cold start reads order lines, fulfillments and raw-material inbounds; failure is not an empty day", async () => {
  assert.deepEqual([...workspaceReadDependencies.today].sort(), ["fulfillments", "orderLines", "rawMaterialInbounds"]);
  const env = browserHarness();
  const paths = [];
  let fail = true;
  let hook;
  let tree;
  globalThis.fetch = async address => {
    const url = new URL(address); paths.push(url.pathname);
    if (url.pathname.includes("/auth/")) return json(auth);
    if (fail) throw new Error("network disconnected");
    const page = Number(url.searchParams.get("page") || 1); const pageSize = Number(url.searchParams.get("pageSize") || 200);
    const items = url.pathname === "/api/order-lines"
      ? [{ id: "ORD-1-01", customerName: "鑫源超市", printFlag: true, printContent: "鑫源超市", size: "30*37*10", bagColor: "红色", printColor: "白", printSide: "双面", qty: 5000, exceptionTags: ["缺料"], lineStatus: "待排产" }]
      : [];
    return json({ items, total: items.length, page, pageSize });
  };
  function Harness() { hook = useFormalDesktopWorkspace(); return null; }
  try {
    await act(async () => { tree = create(React.createElement(Harness)); });
    await act(async () => { hook.actions.setActiveView("today"); });
    for (const segment of ["/api/order-lines", "fulfillment", "raw-material-inbounds"]) assert.ok(paths.some(path => path.includes(segment)), `今天必须读 ${segment}`);
    assert.equal(hook.meta.blockingError, true, "第一次读失败要报错");
    assert.equal(hook.meta.hasLoaded, false);
    fail = false;
    await act(async () => { await hook.actions.refreshAll(); });
    assert.equal(hook.meta.blockingError, false);
    assert.equal(hook.meta.hasLoaded, true);
    assert.equal(hook.data.orderLines.length, 1);
    assert.equal(hook.data.orderLines[0].printContent, "鑫源超市", "接口给的印刷内容不能在映射时丢掉");
  } finally { if (tree) await act(async () => tree.unmount()); env.restore(); }
});

test("an older filter response cannot replace the current receipt query", async () => {
  const env = browserHarness();
  let hook, tree, releaseOld;
  globalThis.fetch = async address => {
    const url = new URL(address);
    const keyword = url.searchParams.get("keyword");
    if (keyword === "old") await new Promise(resolve => { releaseOld = resolve; });
    const items = keyword === "new" ? [] : receipts.slice(0, 20);
    return json({ items, page: 1, pageSize: 20, total: items.length, receiptStageCounts: stages, metrics: { totalCount: 46 } });
  };
  function Harness() { hook = useReceivingData({ authState: auth, active: true, operatorId: "U-MANAGER-A" }); return null; }
  try {
    await act(async () => { tree = create(React.createElement(Harness)); });
    await act(async () => { hook.actions.setReceiptQuery({ keyword: "old" }); });
    await act(async () => { hook.actions.setReceiptQuery({ keyword: "new" }); });
    assert.equal(hook.receiving.total, 0);
    await act(async () => { releaseOld(); });
    assert.equal(hook.receiving.query.keyword, "new");
    assert.equal(hook.receiving.total, 0);
    assert.deepEqual(hook.receiving.items, []);
  } finally { if (tree) await act(async () => tree.unmount()); env.restore(); }
});

test("receipt commands retain explicit draft revision, update selected cache and refresh complete counters", async () => {
  const env = browserHarness();
  let hook, tree;
  let current = { ...receipts[4] };
  let disconnected = false;
  const sent = [];
  globalThis.fetch = async (address, init) => {
    const url = new URL(address);
    if (url.pathname.includes("/auth/")) return json(auth);
    if (disconnected) throw new Error("network disconnected");
    if (init.method === "POST") {
      sent.push(JSON.parse(init.body));
      if (sent.at(-1).expectedRevision !== current.revision) return new Response(JSON.stringify({ error: { message: "单据版本已经变化" } }), { status: 409 });
      current = { ...current, revision: current.revision + 1, status: "已复核待打印标签" };
      return json({ inbound: current });
    }
    if (url.pathname === "/api/raw-material-inbounds") return json({
      items: receipts.slice(0, 20).map(item => item.id === current.id ? current : item), page: 1, pageSize: 20, total: 46,
      receiptStageCounts: { ...stages, 待打印: current.revision === 2 ? 6 : 7 }, metrics: { totalCount: 46 },
    });
    assert.equal(url.pathname, `/api/raw-material-inbounds/${current.id}`);
    return json({ inbound: current });
  };
  function Harness() { hook = useFormalDesktopWorkspace(); return null; }
  try {
    await act(async () => { tree = create(React.createElement(Harness)); });
    await act(async () => { hook.actions.setActiveView("material-receiving"); });
    await act(async () => { await hook.actions.selectReceipt(current.id); });
    let result;
    await act(async () => { result = await hook.actions.updateRawMaterialInbound("复核送货单", current.id, { expectedRevision: 1 }); });
    assert.equal(sent[0].expectedRevision, 1, "old draft revisions must reach the server conflict guard unchanged");
    assert.notEqual(result.source, "api");
    assert.equal(hook.receiving.selectedInbound.revision, 2);
    await act(async () => { result = await hook.actions.updateRawMaterialInbound("复核送货单", current.id, { expectedRevision: 2 }); });
    assert.equal(result.source, "api");
    assert.equal(hook.receiving.selectedId, current.id);
    assert.equal(hook.receiving.selectedInbound.revision, 3);
    assert.equal(hook.receiving.stageCounts.待打印, 7);
    assert.deepEqual(hook.data.rawMaterialInbounds, [], "paged receiving must not populate a falsely complete inventory ledger");
    disconnected = true;
    await act(async () => { await hook.actions.refreshReceipts(); });
    await act(async () => { result = await hook.actions.updateRawMaterialInbound("复核送货单", current.id); });
    assert.equal(result.blocked, true);
    assert.equal(sent.length, 2, "stale detail must not issue a command");
  } finally { if (tree) await act(async () => tree.unmount()); env.restore(); }
});
