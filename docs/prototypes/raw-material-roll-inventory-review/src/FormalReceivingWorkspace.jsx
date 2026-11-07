import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useInboundPageState } from "../../../../src/features/raw-materials/useInboundPageState.js";
import { inboundReviewGuard } from "./inboundReviewGuard.js";
import { InboundDetail } from "../../../../src/features/raw-materials/InboundDetail.jsx";
import { RawMaterialLabelPrintSheet } from "../../../../src/features/raw-materials/RawMaterialLabelPrintSheet.jsx";
const RawMaterialSupplierColorMappingDialog = lazy(() => import("../../../../src/features/raw-materials/RawMaterialSupplierColorMappingDialog.jsx").then(module => ({ default: module.RawMaterialSupplierColorMappingDialog })));
import { getUiActionState } from "../../../../src/auth/seedPermissions.js";
import { recognizeOfficeRawMaterialDeliveryNote } from "../../../../src/services/officeRawMaterialApiClient.js";
import { buildReceiptMaterialPresentation, buildReceiptRowPresentation } from "./receipt-presentation.js";
import { DataState, SemanticTag } from "../../../../src/shared/ui/operational.jsx";
import { getOperationalStateTagValue } from "../../../../src/shared/labels.js";
import { confirmInApp } from "../../../../src/shared/ui/confirmDialog.js";
import "../../../../src/styles/shared.css";
import "../../../../src/styles/components.css";
import "../../../../src/styles/features/raw-material.css";
import "../../../../src/styles/features/raw-material-roll-inventory.css";
import "../../../../src/styles/features/raw-material-mobile.css";
import "../../../../src/styles/features/raw-material-foundation.css";
import "../../../../src/styles/features/raw-material-print.css";
import "./formal-receiving-focus.css";

export function FormalReceivingWorkspace(props) {
  const [draftEpoch, setDraftEpoch] = useState(0);
  async function reloadDraft() {
    const accepted = await confirmInApp({ title: "重新载入本单", message: "这张单据已被其他操作更新。重新载入会替换本页尚未提交的修改，请先保留需要的内容。", confirmLabel: "放弃本页修改，重新载入", cancelLabel: "保留本页修改" });
    if (accepted) setDraftEpoch((value) => value + 1);
  }
  return <FormalReceivingWorkspaceBody {...props} key={`${props.selectedId || "no-receipt"}:${draftEpoch}`} onReloadDraft={reloadDraft} />;
}

function FormalReceivingWorkspaceBody({ formal, notice = "", selectedId, setSelectedId, onBackToQueue, onReloadDraft }) {
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    setSaveError("");
  }, [selectedId]);
  const user = formal.permissionContext?.user;
  const receiving = formal.receiving;
  const detailState = receiving?.detailState || {};
  const selected = receiving?.selectedInbound?.id === selectedId ? receiving.selectedInbound : null;
  const draftBase = useRef(selected ? { id: selected.id, revision: Number(selected.revision || 0) } : null);
  useEffect(() => {
    if (selected && !draftBase.current) draftBase.current = { id: selected.id, revision: Number(selected.revision || 0) };
  }, [selected]);
  const revisionChanged = Boolean(selected && draftBase.current && Number(selected.revision || 0) !== draftBase.current.revision);
  const detailBlocked = !selected || detailState.loading || detailState.stale || Boolean(detailState.error) || revisionChanged;
  const detailMessage = revisionChanged ? "这张单据已被其他操作更新。本页修改已保留，请重新载入后核对。" : detailState.loading ? "正在读取这张单据的最新内容…" : detailState.error || (detailState.stale ? "当前内容尚未刷新，重新读取后再操作。" : "");
  // Queue rows are summaries. Only the independently loaded detail may enter the command flow.
  const inbounds = selected ? [...(receiving?.items || []).filter((item) => item.id !== selectedId), selected] : [];
  const material = buildReceiptMaterialPresentation(selected || {});
  const listedReceipt = (receiving?.items || []).find((item) => item.id === selected?.id);
  const duplicateSummary = [selected?.duplicateSummary, selected?.duplicate, listedReceipt?.duplicateSummary, listedReceipt?.duplicate]
    .map((value) => String(value ?? "").trim())
    .find(Boolean) || "";
  const receipt = buildReceiptRowPresentation(selected || {});
  async function updateInbound(action, inboundId, options) {
    if (detailBlocked) {
      setSaveError(detailMessage || "请先读取这张单据的最新内容。");
      return null;
    }
    setSaveError("");
    try {
      const result = await formal.actions.updateRawMaterialInbound(action, inboundId, { ...options, expectedRevision: draftBase.current?.revision ?? Number(selected?.revision || 0) });
      if (result?.source !== "api" || !result.inbound?.id) {
        setSaveError(result?.error?.message || "服务器保存失败，请保留当前填写内容后重试。");
        return null;
      }
      draftBase.current = { id: result.inbound.id, revision: Number(result.inbound.revision || 0) };
      return result.inbound;
    } catch (error) {
      setSaveError(error?.message || "服务器保存失败，请保留当前填写内容后重试。");
      return null;
    }
  }
  async function recognizeDeliveryNote(input) {
    const result = await recognizeOfficeRawMaterialDeliveryNote({
      ...input,
      authState: formal.authState,
      operatorId: formal.operatorId,
    }, { serverRequired: true });
    if (result?.source !== "api" || !result.inbound?.id) throw new Error(result?.error?.message || "送货单识别未生成服务器草稿。");
    await formal.actions.refreshAll();
    setSelectedId(result.inbound.id);
    return result.inbound;
  }
  const state = useInboundPageState({
    authState: formal.authState,
    currentUser: user,
    helpers: { getUiActionState: (surface, action) => {
      const permission = getUiActionState(formal.permissionContext, surface, action);
      return detailBlocked && !action.startsWith("查看") ? { ...permission, disabled: true, title: detailMessage || "请先选择并读取单据" } : permission;
    } },
    inbounds,
    initialDesktopView: "收货录入",
    authoritativeSelectedId: true,
    meta: { source: detailState.error ? "api_error" : "api", loading: Boolean(detailState.loading), error: saveError || detailState.error || "", officeActionError: saveError, lastSyncedAt: receiving?.lastSyncedAt },
    onAction: updateInbound,
    onDeliveryNoteRecognize: recognizeDeliveryNote,
    productionTasks: formal.data.productionTasks,
    selectedId,
    setSelectedId,
    statementReviews: formal.data.supplierStatementReviews,
  });
  // 把"当前单据有没有没保存的核对修改"上报给选择动作（useReceivingData 里的 selectReceipt）。
  useEffect(() => (typeof state.isInboundReviewDirty === "function"
    ? inboundReviewGuard.register(() => state.isInboundReviewDirty())
    : undefined), [state.isInboundReviewDirty]);

  return <div className="formal-receiving-workspace">
    {onBackToQueue ? <button className="formal-receiving-back" onClick={onBackToQueue} type="button">← 返回单据队列</button> : null}
    {notice ? <p className="receipt-flow-notice visible" role="status">{notice}</p> : null}
    {selected && detailMessage ? <div className="formal-receiving-read-state" role={detailState.error || revisionChanged ? "alert" : "status"}><span>{detailMessage}{detailState.stale && !revisionChanged ? " 当前填写内容仍保留。" : ""}</span>{revisionChanged ? <button onClick={onReloadDraft} type="button">重新载入本单</button> : !detailState.loading ? <button onClick={() => formal.actions.selectReceipt(selectedId)} type="button">重新读取</button> : null}</div> : null}
    <RawMaterialLabelPrintSheet inbound={state.printSheetInbound} />
    {state.colorMappingOpen ? <Suspense fallback={<p role="status">正在读取厂家颜色规则…</p>}>
      <RawMaterialSupplierColorMappingDialog
        authState={formal.authState}
        currentUser={user}
        initialValues={state.colorMappingContext}
        onClose={state.closeSupplierColorMapping}
        onSaved={state.colorMappingContext ? state.applySavedSupplierColorMapping : undefined}
      />
    </Suspense> : null}
    {selected ? <InboundDetail focusedReceipt headerFacts={<><div className="formal-receiving-state"><SemanticTag kind="state" value={getOperationalStateTagValue(selected.status)} label={selected.status} size="compact" /></div><dl className="receipt-facts raw-material-detail-facts" aria-label="原材料关键事实"><div><dt>供应商单号</dt><dd>{selected.deliveryNoteNo || "未提供"}</dd></div><div><dt>送货时间</dt><dd>{receipt.arrivalTime}</dd></div><div><dt>{selected.documentDirection === "supplier_return" ? "退回/重量" : "卷/重量"}</dt><dd>{receipt.countLabel} / {receipt.totalWeightLabel}</dd></div><div><dt>类型</dt><dd>{material.materialType}</dd></div><div><dt>宽幅</dt><dd>{material.widthLabel}</dd></div><div><dt>{selected.documentDirection === "supplier_return" ? "ERP 退货单" : "ERP 入库单"}</dt><dd title={selected.id}>{selected.id}</dd></div></dl>{duplicateSummary ? <p className="formal-receiving-duplicate" role="status">{duplicateSummary}</p> : null}</>} state={{ ...state, selectedStock: null, selectedOrderSupport: null, mobileOcrReviewActive: false }} /> : <div className="formal-receiving-empty"><DataState title={detailState.loading ? "正在读取单据" : detailState.error ? "这张单据暂时无法读取" : "选择一张单据开始核对"} detail={detailState.error || "从左侧队列选择单据，查看原单和逐卷明细。"} compact />{selectedId && !detailState.loading ? <button onClick={() => formal.actions.selectReceipt(selectedId)} type="button">重新读取</button> : null}</div>}
  </div>;
}
