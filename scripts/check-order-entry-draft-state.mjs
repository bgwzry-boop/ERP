import assert from "node:assert/strict";
import {
  createOrderEntryDraftActions,
  createOrderEntryDraftState,
  createSetterBackedDraftActions,
  orderEntryDraftReducer,
} from "../src/state/orderEntryDraftState.js";

function createStore(initial) {
  let state = initial;
  const dispatch = (action) => {
    state = orderEntryDraftReducer(state, action);
  };
  return { get state() { return state; }, actions: createOrderEntryDraftActions(dispatch) };
}

// 只用独立 setter 的旧调用方式，模拟检查脚本里的 mock。
function createSetterStore(initial) {
  const state = { ...initial };
  const setter = (field) => (value) => {
    state[field] = typeof value === "function" ? value(state[field]) : value;
  };
  const setters = {
    setEntryText: setter("entryText"),
    setDraftRows: setter("draftRows"),
    setDraftStatus: setter("draftStatus"),
    setDraftApiMeta: setter("draftApiMeta"),
    setSelectedDraftId: setter("selectedDraftId"),
  };
  return { state, actions: { ...setters, ...createSetterBackedDraftActions(setters) } };
}

const rowA = { id: "DRAFT-1", qty: 100 };
const rowB = { id: "DRAFT-2", qty: 200 };
const seeded = createOrderEntryDraftState({
  entryText: "客户A 30*38 白色 100个",
  draftRows: [rowA],
  draftStatus: "已识别待确认",
  draftApiMeta: { draftId: "D-1", clientRevision: 2, source: "api" },
  selectedDraftId: "DRAFT-1",
});

// 默认空状态
assert.deepEqual(createOrderEntryDraftState(), {
  entryText: "",
  draftRows: [],
  draftStatus: "待录入",
  draftApiMeta: { draftId: "", clientRevision: 0, source: "local" },
  selectedDraftId: "",
});

// setter 兼容：值与 updater
{
  const store = createStore(seeded);
  store.actions.setDraftStatus("已调整待确认");
  assert.equal(store.state.draftStatus, "已调整待确认");
  store.actions.setDraftRows((rows) => [...rows, rowB]);
  assert.deepEqual(store.state.draftRows, [rowA, rowB]);
  store.actions.setDraftApiMeta((meta) => ({ ...meta, clientRevision: meta.clientRevision + 1 }));
  assert.equal(store.state.draftApiMeta.clientRevision, 3);
  const before = store.state;
  store.actions.setSelectedDraftId(before.selectedDraftId);
  assert.equal(store.state, before, "相同值不应产生新对象，避免多余渲染");
}

// 未知字段直接报错，防止拼写错误静默丢失状态
assert.throws(() => orderEntryDraftReducer(seeded, { type: "set", field: "draftRow", value: [] }), /Unknown order entry draft field/);
assert.equal(orderEntryDraftReducer(seeded, { type: "unknown" }), seeded);

// 整体替换：默认选中第一行；不传原文时保留原文；元数据原样保存
{
  const store = createStore(seeded);
  const apiMeta = { draftId: "", clientRevision: 0, source: undefined };
  store.actions.replaceOrderEntryDraft({ rows: [rowB], status: "已识别待确认", apiMeta });
  assert.equal(store.state.entryText, seeded.entryText);
  assert.deepEqual(store.state.draftRows, [rowB]);
  assert.equal(store.state.selectedDraftId, "DRAFT-2");
  assert.equal(store.state.draftApiMeta, apiMeta, "元数据不做归一化");

  store.actions.replaceOrderEntryDraft({ entryText: "新原文", rows: [], status: "空草稿", apiMeta });
  assert.equal(store.state.entryText, "新原文");
  assert.equal(store.state.selectedDraftId, "");
  assert.equal(store.state.draftStatus, "空草稿");
}

// 清空
{
  const store = createStore(seeded);
  store.actions.resetOrderEntryDraft({ source: "local" });
  assert.deepEqual(store.state, createOrderEntryDraftState());
}

// reducer 路径与 setter 回退路径结果必须一致
const scenarios = [
  (a) => a.replaceOrderEntryDraft({ rows: [rowA, rowB], status: "已识别待确认", apiMeta: { draftId: "D-9", clientRevision: 1, source: "api" } }),
  (a) => a.replaceOrderEntryDraft({ entryText: "留货转入", rows: [rowB], status: "已识别待确认", apiMeta: { draftId: "", clientRevision: 0, source: "local" } }),
  (a) => a.replaceOrderEntryDraft({ rows: [rowA], status: "待审核", selectedDraftId: "DRAFT-X", apiMeta: { draftId: "Q-1", clientRevision: 4, source: "api" } }),
  (a) => a.resetOrderEntryDraft({ source: "local" }),
];
for (const [index, run] of scenarios.entries()) {
  const reducerStore = createStore(seeded);
  const setterStore = createSetterStore(seeded);
  run(reducerStore.actions);
  run(setterStore.actions);
  assert.deepEqual(reducerStore.state, setterStore.state, `场景 ${index + 1}：两种路径结果不一致`);
}

console.log("Order entry draft state check passed: setter compatibility, atomic replace/reset, and reducer/setter parity are locked.");
