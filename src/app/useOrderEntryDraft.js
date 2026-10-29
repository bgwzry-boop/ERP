import { useMemo, useReducer } from "react";
import {
  createOrderEntryDraftActions,
  createOrderEntryDraftState,
  orderEntryDraftReducer,
} from "../state/orderEntryDraftState.js";

// 订单录入草稿状态 hook。返回的字段名和 setter 与原先 useOfficeWorkspace 中的 useState 完全一致，
// 另外提供 replaceOrderEntryDraft / resetOrderEntryDraft 两个原子操作。
export function useOrderEntryDraft(createInitialState) {
  const [state, dispatch] = useReducer(orderEntryDraftReducer, undefined, () =>
    createOrderEntryDraftState(createInitialState()),
  );
  const actions = useMemo(() => createOrderEntryDraftActions(dispatch), []);
  return { ...state, ...actions };
}
