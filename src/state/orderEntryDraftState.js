// 订单录入草稿状态：原文、识别出的明细行、草稿状态、后端草稿元数据、当前选中行。
//
// 这五个字段以前是 useOfficeWorkspace 里五个独立的 useState，
// “识别完成 / 打开草稿 / 留货转草稿 / 新建空白订单”时要连续调用 4–5 个 setter。
// 这里把它们收进一个 reducer：整体替换和清空是一次 dispatch，不会出现半更新的中间状态。
// 本文件不依赖 React，可以直接用 node 测试。

export const EMPTY_DRAFT_STATUS = "待录入";

export function createDraftApiMeta({ draftId = "", clientRevision = 0, source = "local" } = {}) {
  return { draftId, clientRevision, source };
}

export function createOrderEntryDraftState({
  entryText = "",
  draftRows = [],
  draftStatus = EMPTY_DRAFT_STATUS,
  draftApiMeta = createDraftApiMeta(),
  selectedDraftId = "",
} = {}) {
  return { entryText, draftRows, draftStatus, draftApiMeta, selectedDraftId };
}

const SETTABLE_FIELDS = new Set(["entryText", "draftRows", "draftStatus", "draftApiMeta", "selectedDraftId"]);

export function orderEntryDraftReducer(state, action) {
  switch (action?.type) {
    case "set": {
      if (!SETTABLE_FIELDS.has(action.field)) throw new Error(`Unknown order entry draft field: ${action.field}`);
      const current = state[action.field];
      const next = typeof action.value === "function" ? action.value(current) : action.value;
      return Object.is(next, current) ? state : { ...state, [action.field]: next };
    }
    case "replace": {
      // 用一份新草稿整体替换。未提供 entryText 时保留原文（例如直接识别当前原文）。
      const rows = Array.isArray(action.rows) ? action.rows : [];
      return {
        entryText: action.entryText ?? state.entryText,
        draftRows: rows,
        draftStatus: action.status ?? state.draftStatus,
        // 原样保存调用方给的元数据，不做归一化，保证重构前后行为一致。
        draftApiMeta: action.apiMeta ?? createDraftApiMeta(),
        selectedDraftId: action.selectedDraftId ?? rows[0]?.id ?? "",
      };
    }
    case "reset":
      return createOrderEntryDraftState({ draftApiMeta: createDraftApiMeta({ source: action.source ?? "local" }) });
    default:
      return state;
  }
}

// 返回与旧 useState setter 签名一致的函数（接受值或 updater），以及两个原子操作。
export function createOrderEntryDraftActions(dispatch) {
  const setter = (field) => (value) => dispatch({ type: "set", field, value });
  return {
    setEntryText: setter("entryText"),
    setDraftRows: setter("draftRows"),
    setDraftStatus: setter("draftStatus"),
    setDraftApiMeta: setter("draftApiMeta"),
    setSelectedDraftId: setter("selectedDraftId"),
    replaceOrderEntryDraft: ({ entryText, rows, status, apiMeta, selectedDraftId } = {}) =>
      dispatch({ type: "replace", entryText, rows, status, apiMeta, selectedDraftId }),
    resetOrderEntryDraft: ({ source } = {}) => dispatch({ type: "reset", source }),
  };
}

// 兼容只传了单个 setter 的调用方（例如现有检查脚本里的 mock）：
// 用 setter 逐个应用同样的替换/清空，结果与 reducer 一致。
export function createSetterBackedDraftActions({
  setEntryText,
  setDraftRows,
  setDraftStatus,
  setDraftApiMeta,
  setSelectedDraftId,
}) {
  return {
    replaceOrderEntryDraft: ({ entryText, rows, status, apiMeta, selectedDraftId } = {}) => {
      const nextRows = Array.isArray(rows) ? rows : [];
      if (entryText !== undefined) setEntryText(entryText);
      setDraftRows(nextRows);
      setSelectedDraftId(selectedDraftId ?? nextRows[0]?.id ?? "");
      if (status !== undefined) setDraftStatus(status);
      setDraftApiMeta(apiMeta ?? createDraftApiMeta());
    },
    resetOrderEntryDraft: ({ source } = {}) => {
      setEntryText("");
      setDraftRows([]);
      setDraftStatus(EMPTY_DRAFT_STATUS);
      setDraftApiMeta(createDraftApiMeta({ source: source ?? "local" }));
      setSelectedDraftId("");
    },
  };
}
