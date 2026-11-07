// 2026-11-07：切换收货单据前，先问一句"核对区的改动要不要留"。
// 选中状态由 useReceivingData 持有，草稿在 WorkSpace 里，中间隔着好几层，
// 所以用一个小注册表把"当前单据脏不脏"从工作区上报到选择动作，避免逐层透传。
export function createInboundReviewGuard() {
  let provider = null;
  return {
    register(nextProvider) {
      provider = typeof nextProvider === "function" ? nextProvider : null;
      return () => {
        if (provider === nextProvider) provider = null;
      };
    },
    isDirty() {
      try {
        return Boolean(provider?.());
      } catch {
        return false;
      }
    },
    shouldSwitch({ nextId, currentId, confirm = defaultConfirm } = {}) {
      const next = String(nextId ?? "");
      if (!next || next === String(currentId ?? "")) return true;
      if (!this.isDirty()) return true;
      return Boolean(confirm({ currentId, nextId: next }));
    },
  };
}

function defaultConfirm() {
  if (typeof window === "undefined" || typeof window.confirm !== "function") return false;
  return window.confirm("当前这张单还有没保存的核对修改，切换后会丢失。确定要切换吗？");
}

export const inboundReviewGuard = createInboundReviewGuard();
