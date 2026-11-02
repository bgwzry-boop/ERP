import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Exercise the real queue component. The detail is a stateful stand-in so a
// queue rerender cannot quietly discard an operator's unfinished correction.
const require = createRequire(import.meta.url);
const directory = await mkdtemp(join(tmpdir(), "erp-receiving-queue-state-"));
const saved = Object.fromEntries(["window", "localStorage", "fetch", "IS_REACT_ACT_ENVIRONMENT", "__receivingQueueTest"]
  .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const timers = new Map();
const storage = new Map([["erp.receiving.queueWidth.v1", "34"]]);
const lifecycle = { mounts: 0, unmounts: 0 };
let timerId = 0;
let tree;
let act;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__receivingQueueTest = lifecycle;
globalThis.window = {
  setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
  clearTimeout(id) { timers.delete(id); },
};
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
};
globalThis.fetch = () => { throw new Error("Queue interaction tests must not access an API."); };

try {
  const bundle = await build({
    stdin: {
      contents: `import {create, act} from 'react-test-renderer';
        import {ReceiptWorkspace} from './docs/prototypes/raw-material-roll-inventory-review/src/ReceiptWorkspace.jsx';
        export {create, act}; export const element = props => <ReceiptWorkspace {...props} />;`,
      resolveDir: process.cwd(), loader: "jsx",
    },
    bundle: true, platform: "node", format: "cjs", jsx: "automatic", write: false, logLevel: "silent",
    plugins: [{
      name: "receiving-queue-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /^(react(?:\/.*)?|react-test-renderer)$/ }, (args) => ({ path: require.resolve(args.path), external: true }));
        builder.onResolve({ filter: /^@ant-design\/icons$/ }, () => ({ path: "queue-icons", namespace: "queue-mock" }));
        builder.onLoad({ filter: /.*/, namespace: "queue-mock" }, () => ({ contents: "export const PlusOutlined=()=>null, ReloadOutlined=()=>null, SearchOutlined=()=>null, FileTextOutlined=()=>null, WarningOutlined=()=>null;" }));
        builder.onLoad({ filter: /FormalReceivingWorkspace\.jsx$/ }, () => ({ loader: "jsx", contents: `
          import {useEffect, useState} from 'react';
          export function FormalReceivingWorkspace({selectedId}) {
            const [draft, setDraft] = useState('');
            useEffect(() => { globalThis.__receivingQueueTest.mounts++;
              return () => { globalThis.__receivingQueueTest.unmounts++; }; }, []);
            return <section data-detail-id={selectedId}>
              <input aria-label="尚未提交的逐卷核对" value={draft} onChange={event => setDraft(event.target.value)} />
              <button type="button" data-review-action>确认当前单据</button>
            </section>;
          }` }));
        builder.onLoad({ filter: /shared\/ui\/operational\.jsx$/ }, () => ({ loader: "jsx", contents: "export const SemanticTag = ({label}) => <span>{label}</span>;" }));
        builder.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
      },
    }],
  });
  const file = join(directory, "queue-test.cjs");
  await writeFile(file, bundle.outputFiles[0].text);
  const runtime = require(file);
  act = runtime.act;

  const receipt = (id) => ({ id, revision: 1, supplierName: `供应商-${id}`, status: "已识别待复核",
    receivedAt: "2026-11-02 09:00", rollCount: 2, totalWeightKg: 30 });
  const selected = receipt("RMI-SELECTED");
  const calls = [];
  let receiving = {
    hasLoaded: true, loading: false, error: "", status: "ready", matchesQuery: true,
    items: [selected, receipt("RMI-OTHER")], selectedId: selected.id, selectedInbound: selected,
    detailState: { hasLoaded: true, loading: false, error: "", stale: false },
    query: { keyword: "", receiptStage: "全部", page: 1, pageSize: 20 }, page: 1, pageSize: 20, total: 57,
    stageCounts: { 待核对: 2, 退货单: 1, 待打印: 1, 待贴标: 1, 异常: 0 }, metrics: { totalCount: 57 },
  };
  const actions = {
    refreshReceipts: () => calls.push(["refresh"]),
    selectReceipt: (id) => calls.push(["select", id]),
    setReceiptQuery(patch) {
      calls.push(["query", patch]);
      transition({ query: { ...receiving.query, ...patch, page: 1 }, page: 1, items: [],
        total: null, stageCounts: null, loading: true, matchesQuery: false });
    },
    changeReceiptPage(page) {
      calls.push(["page", page]);
      transition({ query: { ...receiving.query, page }, page, items: [],
        total: null, stageCounts: null, loading: true, matchesQuery: false });
    },
  };
  const props = () => ({ formal: { receiving, actions }, onOpenReceive() {} });
  function transition(patch) {
    receiving = { ...receiving, ...patch };
    tree.update(runtime.element(props()));
  }
  const hosts = (predicate) => tree.root.findAll((node) => typeof node.type === "string" && predicate(node));
  const text = (node) => typeof node === "string" ? node : (node.children || []).map(text).join("");
  const field = (label) => hosts((node) => node.type === "input" && node.props["aria-label"] === label)[0];
  const button = (label) => hosts((node) => node.type === "button" && node.props["aria-label"] === label)[0];
  const detailSlot = () => hosts((node) => node.props.className === "receiving-detail-slot")[0];
  const allTab = () => hosts((node) => node.props.role === "tab").find((node) => text(node).startsWith("全部 "));
  const isHidden = (node) => {
    for (let current = node; current; current = current.parent) if (current.props?.hidden) return true;
    return false;
  };
  const flushDebounce = async () => act(async () => {
    const pending = [...timers.values()];
    timers.clear();
    for (const callback of pending) callback();
  });

  await act(async () => { tree = runtime.create(runtime.element(props())); });
  assert.equal(text(allTab()), "全部 57", "the all-tab count must use authoritative total, not the sum of five stages");
  assert.equal(lifecycle.mounts, 1);
  await act(async () => field("尚未提交的逐卷核对").props.onChange({ target: { value: "第2卷实称20.125kg，尚未提交" } }));

  // A page transition deliberately has no statistics yet. It must not crash
  // or unmount the currently selected record's pending review/print sequence.
  await act(async () => button("收货下一页").props.onClick());
  assert.deepEqual(calls.at(-1), ["page", 2]);
  assert.ok(allTab(), "null stageCounts during loading must leave the queue rendered");
  assert.equal(lifecycle.mounts, 1);
  assert.equal(lifecycle.unmounts, 0, "pagination must not discard the selected detail");
  assert.equal(detailSlot().props.hidden, false);
  assert.equal(field("尚未提交的逐卷核对").props.value, "第2卷实称20.125kg，尚未提交");
  await act(async () => transition({ loading: false, matchesQuery: true, items: [receipt("RMI-PAGE-2")],
    total: 57, stageCounts: { 待核对: 2, 退货单: 1, 待打印: 1, 待贴标: 1, 异常: 0 } }));
  assert.equal(lifecycle.unmounts, 0, "a completed next-page read must not unmount the previously selected detail");
  assert.equal(detailSlot().props.hidden, false);

  // A changed query hides the old record's commands but keeps its correction
  // mounted, including when the new read fails or returns no matching rows.
  await act(async () => field("搜索送货单位或单号").props.onChange({ target: { value: "不存在的供应商" } }));
  await flushDebounce();
  assert.deepEqual(calls.at(-1), ["query", { keyword: "不存在的供应商" }]);
  assert.equal(detailSlot().props.hidden, true);
  assert.ok(isHidden(hosts((node) => node.props["data-review-action"])[0]), "a hidden old selection must not offer an apparently current review action");
  await act(async () => transition({ loading: false, status: "error", error: "连接中断" }));
  assert.equal(lifecycle.unmounts, 0, "a failed changed-query read must preserve the mounted draft");
  assert.equal(field("尚未提交的逐卷核对").props.value, "第2卷实称20.125kg，尚未提交");
  await act(async () => transition({ loading: false, error: "", status: "empty", matchesQuery: true,
    items: [], total: 0, stageCounts: {}, metrics: { totalCount: 57 } }));
  assert.ok(hosts((node) => node.type === "strong" && text(node) === "没有匹配的单据").length);
  assert.equal(detailSlot().props.hidden, true);
  assert.equal(lifecycle.unmounts, 0);
  await act(async () => field("搜索送货单位或单号").props.onChange({ target: { value: "" } }));
  await flushDebounce();
  assert.equal(detailSlot().props.hidden, false, "returning to the selection's query reveals its existing draft");
  assert.equal(field("尚未提交的逐卷核对").props.value, "第2卷实称20.125kg，尚未提交");

  const separator = () => hosts((node) => node.props.role === "separator")[0];
  let prevented = 0;
  async function key(value) {
    await act(async () => separator().props.onKeyDown({ key: value, preventDefault() { prevented += 1; } }));
  }
  for (const [pressed, expected] of [["Home", 27], ["ArrowLeft", 27], ["ArrowRight", 28], ["End", 44], ["ArrowRight", 44], ["ArrowLeft", 43]]) {
    await key(pressed);
    assert.equal(separator().props["aria-valuenow"], expected, `${pressed} must adjust the accessible split width within its bounds`);
    assert.equal(storage.get("erp.receiving.queueWidth.v1"), String(expected));
    assert.equal(hosts((node) => node.props.className?.includes("receiving-workbench"))[0].props.style["--receiving-queue-width"], `${expected}%`);
  }
  assert.equal(prevented, 6, "handled splitter keys must not also scroll the page");
  await key("Escape");
  assert.equal(separator().props["aria-valuenow"], 43);
  assert.equal(prevented, 6);
  assert.equal(lifecycle.mounts, 1);
  assert.equal(lifecycle.unmounts, 0);
  await act(async () => tree.unmount());
  tree = null;
  assert.equal(lifecycle.unmounts, 1);
  console.log("Receiving queue interactions passed: null statistics, authoritative totals, pagination retention, hidden filtered selection with preserved draft, failed reads, and keyboard splitter bounds/persistence. No API access.");
} finally {
  if (tree) await act(async () => tree.unmount());
  for (const [key, descriptor] of Object.entries(saved)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
  await rm(directory, { recursive: true, force: true });
}
