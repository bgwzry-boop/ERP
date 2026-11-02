import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Actual React hooks/components, anonymous in-memory command receipts. No API,
// OCR, attachment upload, inventory write or physical printing is performed.
const require = createRequire(import.meta.url);
const directory = await mkdtemp(join(tmpdir(), "erp-stock-operations-"));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.document = { activeElement: null };
let tree;
try {
  const bundle = await build({
    stdin: { contents: `import React from "react"; import {create,act} from "react-test-renderer"; import {RawMaterialStockOperationsDialog} from "./docs/prototypes/raw-material-roll-inventory-review/src/RawMaterialStockOperationsDialog.jsx"; export {create,act}; export const element=props=><RawMaterialStockOperationsDialog {...props}/>;`, resolveDir: process.cwd(), loader: "jsx" },
    bundle: true, platform: "node", format: "cjs", jsx: "automatic", write: false, logLevel: "silent",
    loader: { ".jpg": "dataurl", ".jpeg": "dataurl", ".png": "dataurl", ".svg": "dataurl" },
    plugins: [{ name: "component-test-boundaries", setup(builder) {
      builder.onResolve({ filter: /^(react(?:\/.*)?|react-test-renderer)$/ }, args => ({ path: require.resolve(args.path), external: true }));
      builder.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
    } }],
  });
  const path = join(directory, "test.cjs");
  await writeFile(path, bundle.outputFiles[0].text);
  const { create, act, element } = require(path);
  const makeSource = (status = "可用", revision = 7) => ({
    id: "RMI-ANONYMOUS", revision, status: status === "可用" ? "已贴标/可用库存" : "部分领料/机边",
    supplierName: "测试原料厂", materialType: "无纺布", unit: "kg", factoryColor: "红色", spec: "78*090*1500",
    rolls: [
      { id: "ROLL-SELECTED", inventoryStatus: status, labelStatus: "已贴标/可用库存", weightKg: 100, factoryColor: "红色", supplierColor: "大红", machineId: status === "可用" ? "" : "1号机" },
      { id: "ROLL-OTHER", inventoryStatus: "可用", labelStatus: "已贴标/可用库存", weightKg: 80, factoryColor: "宝蓝" },
    ],
    rawMaterialIssueRecords: [], rawMaterialConsumptionRecords: [],
  });
  const calls = [], queue = [];
  let closed = 0;
  const permissions = ["raw_material.issue.create", "raw_material.consumption.confirm"];
  const makeProps = (source, allowed = permissions) => ({
    formal: {
      authState: { session: { accessToken: "anonymous-test-session" } },
      permissionContext: { user: { userId: "U-ANONYMOUS" }, actionPermissions: allowed },
      data: { rawMaterialInbounds: [source], productionTasks: [] },
      actions: { updateRawMaterialInbound: (...args) => { calls.push(args); return new Promise((resolve, reject) => queue.push({ resolve, reject })); } },
    },
    inboundId: source.id, rollId: "ROLL-SELECTED", onClose: () => { closed += 1; },
  });
  const text = node => typeof node === "string" ? node : (node.children || []).map(text).join("");
  const button = name => tree.root.findAllByType("button").find(node => text(node) === name);
  const outer = () => tree.root.findByProps({ className: "raw-stock-operations-dialog" });
  const issueForm = () => tree.root.findByProps({ className: "raw-material-label-verification raw-material-issue-selection" });
  const measure = () => tree.root.findByProps({ className: "raw-material-measurement-dialog" });
  const render = async props => {
    await act(async () => {
      tree = create(element(props), { createNodeMock: () => ({ showModal() {}, close() {}, querySelector() { return null; } }) });
    });
  };
  const update = async props => { await act(async () => tree.update(element(props))); };
  const unmount = async () => { await act(async () => tree.unmount()); tree = null; };
  const submit = form => form.props.onSubmit({ preventDefault() {} });

  const source = makeSource();
  await render(makeProps(source));
  const rows = tree.root.findAllByProps({ className: "raw-material-roll-row" });
  assert.equal(rows.length, 1, "inventory operations must render only the selected physical roll");
  assert.ok(text(rows[0]).includes("ROLL-SELECTED"));
  assert.ok(!text(rows[0]).includes("ROLL-OTHER"));
  for (const name of ["生成成本草稿", "确认成本草稿", "校准损耗", "生成毛利快照", "复核毛利快照"]) assert.equal(button(name), undefined);
  assert.equal(button("机边领料").props.disabled, false);
  assert.equal(button("确认消耗").props.disabled, true);
  await act(async () => button("机边领料").props.onClick());
  await act(async () => issueForm().findByType("select").props.onChange({ target: { value: "1号机" } }));
  await act(async () => { void submit(issueForm()); void submit(issueForm()); });
  assert.equal(calls.length, 1, "double-click issue must send one command");
  assert.equal(calls[0][0], "扫码出库");
  assert.equal(calls[0][2].rollId, "ROLL-SELECTED");
  assert.equal(calls[0][2].expectedRevision, 7);
  assert.match(calls[0][2].idempotencyKey, /^erp-stock-issue-/u);
  assert.equal(tree.root.findByProps({ "aria-label": "关闭卷料操作" }).props.disabled, true);
  let prevented = false;
  await act(async () => outer().props.onCancel({ preventDefault() { prevented = true; } }));
  assert.equal(prevented, true); assert.equal(closed, 0);
  const issued = makeSource("机边领用", 8);
  issued.rolls[0].issueRecordId = "ISSUE-SELECTED";
  await act(async () => queue.shift().resolve({ source: "api", inbound: issued }));
  await update(makeProps(issued));
  assert.equal(button("机边领料").props.disabled, true);
  assert.equal(button("确认消耗").props.disabled, false);
  await act(async () => button("部分消耗").props.onClick());
  assert.equal(calls.length, 1, "opening measurement must not directly call a command");
  assert.equal(tree.root.findByProps({ "aria-label": "关闭卷料操作" }).props.disabled, true);
  await act(async () => outer().props.onCancel({ preventDefault() {} }));
  assert.equal(closed, 0, "outer dialog must not dismiss a pending measurement");
  assert.equal(measure().findByType("input").props.value, "", "never prefill an assumed half consumption");
  await act(async () => { void submit(measure().findByType("form")); });
  assert.equal(calls.length, 1, "empty measured quantity and basis must block submission");
  await act(async () => {
    measure().findByType("input").props.onChange({ target: { value: "20" } });
    measure().findByType("textarea").props.onChange({ target: { value: "现场实称，剩余80kg" } });
  });
  await act(async () => { void submit(measure().findByType("form")); void submit(measure().findByType("form")); });
  assert.equal(calls.length, 2);
  assert.equal(calls[1][0], "确认消耗");
  assert.equal(calls[1][2].consumedWeightKg, 20);
  assert.equal(calls[1][2].expectedRevision, 8);
  assert.equal(calls[1][2].partialConsumption, true);
  const measuredKey = calls[1][2].idempotencyKey;
  await act(async () => queue.shift().resolve({ source: "api_error", blocked: true, error: { message: "版本已变化，请核实" } }));
  assert.equal(measure().findByType("input").props.value, "20", "failed receipt must retain measurement input");
  const concurrentlyChanged = { ...issued, revision: 9 };
  await update(makeProps(concurrentlyChanged));
  await act(async () => { void submit(measure().findByType("form")); });
  assert.equal(calls.length, 3);
  assert.equal(calls[2][2].expectedRevision, 8, "retry must preserve measured snapshot CAS instead of upgrading it");
  assert.equal(calls[2][2].idempotencyKey, measuredKey, "uncertain measurement retry must retain one request identity");
  const consumed = structuredClone(issued);
  consumed.revision = 10;
  consumed.rolls[0].weightKg = 80;
  consumed.rawMaterialConsumptionRecords = [{ consumptionRecordId: "CONSUMPTION-SELECTED", rollId: "ROLL-SELECTED", consumedWeightKg: 20 }];
  await act(async () => queue.shift().resolve({ source: "api", inbound: consumed }));
  assert.equal(tree.root.findAllByProps({ className: "raw-material-measurement-dialog" }).length, 0);
  await unmount();

  const wholeSource = makeSource("机边领用", 11);
  await render(makeProps(wholeSource));
  await act(async () => button("确认消耗").props.onClick());
  assert.equal(calls.length, 3, "whole consumption must also open measurement before any command");
  assert.equal(measure().findByType("input").props.value, "");
  await act(async () => {
    measure().findByType("input").props.onChange({ target: { value: "100" } });
    measure().findByType("textarea").props.onChange({ target: { value: "本卷全部实测消耗100kg" } });
  });
  await act(async () => { void submit(measure().findByType("form")); });
  assert.equal(calls.length, 4);
  assert.equal(calls[3][2].consumedWeightKg, 100);
  assert.equal(calls[3][2].expectedRevision, 11);
  assert.equal(calls[3][2].partialConsumption, undefined);
  const wholeConsumed = structuredClone(wholeSource);
  wholeConsumed.revision = 12;
  wholeConsumed.rolls[0].inventoryStatus = "已消耗";
  wholeConsumed.rolls[0].weightKg = 0;
  wholeConsumed.rawMaterialConsumptionRecords = [{ consumptionRecordId: "CONSUMPTION-WHOLE", rollId: "ROLL-SELECTED", consumedWeightKg: 100 }];
  await act(async () => queue.shift().resolve({ source: "api", inbound: wholeConsumed }));
  assert.equal(tree.root.findAllByProps({ className: "raw-material-measurement-dialog" }).length, 0);
  await unmount();

  await render(makeProps(makeSource(), []));
  assert.equal(button("机边领料").props.disabled, true);
  assert.equal(button("确认消耗").props.disabled, true);
  assert.ok(text(outer()).includes("当前账号没有领料或消耗权限"));
  await unmount();
  const invalid = makeProps(makeSource()); invalid.rollId = "ROLL-NOT-FOUND";
  await render(invalid);
  assert.ok(text(outer()).includes("未找到所选实物卷"));
  assert.equal(button("机边领料"), undefined);
  await unmount();
  await render(makeProps(makeSource("余料待复核")));
  assert.equal(button("机边领料"), undefined);
  assert.equal(button("确认消耗"), undefined);
  assert.equal(calls.length, 4);
  await unmount();
  console.log("PASS selected real-roll isolation, permission/state gates, single-flight issue, exact CAS, measured whole/partial consumption, retained retry key/input, protected close and no cost actions; anonymous in-memory commands only.");
} finally {
  if (tree) tree.unmount();
  await rm(directory, { recursive: true, force: true });
}
