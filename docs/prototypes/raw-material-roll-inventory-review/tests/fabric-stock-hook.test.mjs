// 负责人 2026-11-08：开单用布提醒。卷料库存读成功（含空库存）后必须退出"正在看卷料库存…"；
// 读失败可重试；换了登录身份要重新读，旧身份的迟到结果不能顶替。
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(new URL("../../../../package.json", import.meta.url));
const React = require("react");
const { act, create } = require("react-test-renderer");
const bundle = await build({ stdin: { contents: "export { useFabricStock } from './src/useFabricStock.js';", resolveDir: fileURLToPath(new URL("..", import.meta.url)), loader: "js" },
  bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent",
  plugins: [{ name: "single-react-runtime", setup(builder) { builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: require.resolve(args.path), external: true })); } }] });
const loaded = new Module(fileURLToPath(import.meta.url));
loaded._compile(bundle.outputFiles[0].text, fileURLToPath(import.meta.url));
const { useFabricStock } = loaded.exports;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const auth = (token) => ({ authenticated: true, session: { accessToken: token, userId: "U-1" } });

async function mount(props) {
  let value; let tree;
  function Harness(current) { value = useFabricStock(current.wanted, current.owner, { read: current.read }); return null; }
  await act(async () => { tree = create(React.createElement(Harness, props)); });
  return { get value() { return value; }, update: (next) => act(async () => { tree.update(React.createElement(Harness, next)); }), unmount: () => act(async () => tree.unmount()) };
}

test("a delayed successful read (empty or not) leaves loading", async () => {
  for (const items of [[], [{ id: "R1" }]]) {
    let calls = 0;
    const read = async () => { calls += 1; await delay(30); return { source: "api", items }; };
    const hook = await mount({ wanted: true, owner: { authState: auth("A"), operatorId: "U-1" }, read });
    assert.equal(hook.value.status, "loading");
    await act(async () => { await delay(60); });
    assert.equal(hook.value.status, "ready", "读成功后必须退出读取中");
    assert.deepEqual(hook.value.items, items);
    assert.equal(calls, 1, "成功后不能反复读");
    await hook.unmount();
  }
});

test("failure can be retried; not wanted means idle and no read", async () => {
  let fail = true; let calls = 0;
  const read = async () => { calls += 1; await delay(10); if (fail) throw new Error("断网"); return { source: "api", items: [{ id: "R1" }] }; };
  const hook = await mount({ wanted: false, owner: { authState: auth("A") }, read });
  assert.equal(hook.value.status, "idle"); assert.equal(calls, 0);
  const props = { wanted: true, owner: { authState: auth("A") }, read };
  await hook.update(props);
  await act(async () => { await delay(30); });
  assert.equal(hook.value.status, "failed");
  fail = false;
  await act(async () => { hook.value.retry(); });
  assert.equal(hook.value.status, "loading");
  await act(async () => { await delay(30); });
  assert.equal(hook.value.status, "ready");
  await hook.unmount();
});

test("an old account's late response cannot replace the new account's read", async () => {
  const read = async ({ authState }) => { await delay(authState.session.accessToken === "OLD" ? 60 : 10); return { source: "api", items: [{ id: authState.session.accessToken }] }; };
  const hook = await mount({ wanted: true, owner: { authState: auth("OLD") }, read });
  await hook.update({ wanted: true, owner: { authState: auth("NEW") }, read });
  await act(async () => { await delay(100); });
  assert.equal(hook.value.status, "ready");
  assert.deepEqual(hook.value.items, [{ id: "NEW" }]);
  await hook.unmount();
});

test("an api_error result is a failure, not an empty stock", async () => {
  const hook = await mount({ wanted: true, owner: { authState: auth("A") }, read: async () => ({ source: "api_error", items: [] }) });
  await act(async () => { await delay(10); });
  assert.equal(hook.value.status, "failed");
  await hook.unmount();
});
