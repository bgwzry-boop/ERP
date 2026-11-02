import { useEffect, useRef, useState } from "react";
import { getUiActionState } from "../../../../src/auth/seedPermissions.js";
import { canConfirmRawMaterialConsumptionRoll, canIssueRawMaterialRoll } from "../../../../src/domain/rawMaterialInboundListState.js";
import { RawMaterialInboundReceivingSections } from "../../../../src/features/raw-materials/RawMaterialInboundReceivingSections.jsx";
import { RawMaterialColorDisplay } from "../../../../src/features/raw-materials/RawMaterialColorDisplay.jsx";
import { useInboundPageState } from "../../../../src/features/raw-materials/useInboundPageState.js";
import { rawMaterialRecordIdentitySuffix } from "../../../../shared/rawMaterialRecordIdentity.js";
import "./raw-material-stock-operations.css";

const STOCK_ACTIONS = new Set(["扫码出库", "机边领料", "确认消耗"]);

export function RawMaterialStockOperationsDialog({ formal, rollId, inboundId, onClose }) {
  const dialogRef = useRef(null);
  const busyRef = useRef(false);
  const liveRef = useRef(true);
  const issueRequestRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inbounds = formal.data?.rawMaterialInbounds || [];
  const context = formal.permissionContext;
  const user = context?.user;
  const ready = Boolean(formal.authState && user?.userId && formal.actions?.updateRawMaterialInbound);
  const actionState = (surface, action) => ready
    ? getUiActionState(context, surface, action)
    : { disabled: true, title: "账号权限尚未载入，请关闭后重试。" };

  async function updateInbound(action, targetId, options = {}) {
    if (busyRef.current || !liveRef.current) return null;
    const source = inbounds.find((item) => item.id === inboundId && item.status !== "已作废");
    const roll = source?.rolls?.find((item) => item.id === rollId);
    const issuing = action === "扫码出库" || action === "机边领料";
    if (!STOCK_ACTIONS.has(action) || targetId !== inboundId || options.rollId !== rollId || !source || !roll) {
      setError("当前卷料已变化，请关闭后重新选择。");
      return null;
    }
    if (actionState("rawMaterial", action).disabled) {
      setError("当前账号没有执行这项操作的权限。");
      return null;
    }
    if (source.documentDirection === "supplier_return" || (issuing ? !canIssueRawMaterialRoll(roll) : !canConfirmRawMaterialConsumptionRoll(roll))) {
      setError("当前卷料状态不允许这项操作，请核实库存状态。");
      return null;
    }
    let payload = { ...options, expectedRevision: options.expectedRevision ?? source.revision };
    if (issuing) {
      const fingerprint = JSON.stringify(payload);
      if (issueRequestRef.current && issueRequestRef.current.fingerprint !== fingerprint) {
        setError("上次出库结果尚未确认，请保持原内容重试，或关闭后刷新核实。");
        return null;
      }
      issueRequestRef.current ??= { fingerprint, key: `erp-stock-issue-${rawMaterialRecordIdentitySuffix()}` };
      payload = { ...payload, idempotencyKey: issueRequestRef.current.key };
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await formal.actions.updateRawMaterialInbound(action, targetId, payload);
      if (result?.source !== "api" || result.inbound?.id !== inboundId || !result.inbound.rolls?.some((item) => item.id === rollId)) {
        throw new Error(result?.error?.message || "未收到当前卷的完整保存结果，请保留原内容核实后重试。");
      }
      if (issuing) {
        const savedRoll = result.inbound.rolls.find((item) => item.id === rollId);
        if (savedRoll.inventoryStatus !== "机边领用") throw new Error("尚未收到整卷出库结果，请保留原内容核实后重试。");
        issueRequestRef.current = null;
      }
      if (liveRef.current) setNotice(issuing ? "本卷已出库到机边。" : "本次实际消耗已保存。");
      return result.inbound;
    } catch (failure) {
      if (liveRef.current) setError(failure?.message || "保存失败，请保留原内容重试。");
      // The existing issue form expects a null receipt on failure. Measurement
      // owns its own retained input and retry key and must receive the error.
      if (!issuing) throw failure;
      return null;
    } finally {
      busyRef.current = false;
      if (liveRef.current) setBusy(false);
    }
  }

  const state = useInboundPageState({
    authState: formal.authState,
    currentUser: user,
    helpers: { getUiActionState: actionState },
    inbounds,
    productionTasks: formal.data?.productionTasks || [],
    selectedId: inboundId,
    setSelectedId: () => {},
    authoritativeSelectedId: true,
    initialDesktopView: "卷料库存",
    onAction: updateInbound,
  });
  const selected = state.selected;
  const roll = selected?.rolls?.find((item) => item.id === rollId);
  const measurementOpen = Boolean(state.measurementDialog);
  const closeBlocked = busy || measurementOpen;
  const canOperate = Boolean(roll && selected.documentDirection !== "supplier_return" && (canIssueRawMaterialRoll(roll) || canConfirmRawMaterialConsumptionRoll(roll)));
  const noPermission = state.issueState.disabled && state.consumptionState.disabled;

  useEffect(() => {
    liveRef.current = true;
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.showModal?.();
    return () => {
      liveRef.current = false;
      dialog?.close?.();
      if (previous?.isConnected) previous.focus?.();
    };
  }, []);

  function close() {
    if (!busyRef.current && !measurementOpen) onClose?.();
  }

  function setIssueSelection(nextValue) {
    state.setIssueSelection((current) => {
      const next = typeof nextValue === "function" ? nextValue(current) : nextValue;
      return next?.rollId === rollId ? { expectedRevision: selected?.revision, ...next } : null;
    });
  }

  const disabledWhileBusy = (value) => ({ ...value, disabled: value.disabled || busy || measurementOpen });
  return <>
    <dialog aria-labelledby="raw-stock-operations-title" className="raw-stock-operations-dialog" onCancel={(event) => { event.preventDefault(); close(); }} ref={dialogRef}>
      <header><div><span>卷料库存</span><h2 id="raw-stock-operations-title">领料 / 消耗</h2></div><button aria-label="关闭卷料操作" disabled={closeBlocked} onClick={close} type="button">关闭</button></header>
      <div className="raw-stock-operations-scroll">
        {!roll ? <p role="alert">未找到所选实物卷，请关闭后刷新库存。</p> : <>
          <dl className="raw-stock-operations-facts"><div><dt>卷码</dt><dd>{roll.id}</dd></div><div><dt>当前状态</dt><dd>{roll.inventoryStatus || "未确认"}</dd></div><div><dt>颜色</dt><dd><RawMaterialColorDisplay factoryColor={roll.factoryColor} supplierColor={roll.supplierColor} /></dd></div><div><dt>当前重量</dt><dd>{Number(roll.weightKg) > 0 ? `${roll.weightKg} kg` : "重量待核实"}</dd></div><div><dt>来源单据</dt><dd>{selected.id}</dd></div><div><dt>机台</dt><dd>{roll.machineId || "未领到机边"}</dd></div></dl>
          {!canOperate ? <p role="status">本卷当前不是可领用库存或机边卷，不能领料或确认消耗。</p> : null}
          {noPermission ? <p role="status">当前账号没有领料或消耗权限。</p> : null}
          {canOperate ? <fieldset disabled={busy || measurementOpen}>
            <RawMaterialInboundReceivingSections
              actionError=""
              actionStates={{ attach: state.attachState, consumption: disabledWhileBusy(state.consumptionState), exception: state.exceptionState, issue: disabledWhileBusy(state.issueState), print: state.printState, review: state.reviewState, voidDraft: state.voidDraftState }}
              canViewCost={false}
              detailTab="领料成本"
              firstReleaseMode={false}
              issueSelection={state.issueSelection}
              labelVerification={null}
              money={state.money}
              ocrLineReviewDraft={state.ocrLineReviewDraft}
              ocrReviewDraft={state.ocrReviewDraft}
              onAction={state.onAction}
              rollId={rollId}
              selected={selected}
              selectedOrderSupport={state.selectedOrderSupport}
              selectedStock={state.selectedStock}
              selectedTaskCandidate={state.selectedTaskCandidate}
              setIssueSelection={setIssueSelection}
              setLabelVerification={state.setLabelVerification}
              setOcrLineReviewDraft={state.setOcrLineReviewDraft}
              setOcrReviewDraft={state.setOcrReviewDraft}
            />
          </fieldset> : null}
        </>}
        {error ? <p className="raw-stock-operations-error" role="alert">{error}</p> : null}
        {notice ? <p className="raw-stock-operations-notice" role="status">{notice}</p> : null}
      </div>
      <footer><span>{busy ? "正在保存，请稍候。" : measurementOpen ? "请先完成或取消实测核对。" : "仅处理当前选中的一卷。"}</span><button disabled={closeBlocked} onClick={close} type="button">完成</button></footer>
    </dialog>
    {state.measurementDialog}
  </>;
}
