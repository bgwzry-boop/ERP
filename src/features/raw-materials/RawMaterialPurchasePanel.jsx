import { useEffect, useMemo, useRef, useState } from "react";
import {
  createOfficeRawMaterialPurchaseRequest,
  listOfficeRawMaterialPurchaseRequests,
  updateOfficeRawMaterialPurchaseRequestStatus,
} from "../../services/officeRawMaterialApiClient.js";
import {
  DelegatedBusinessDecisionFields,
  isDelegatedBusinessDecisionComplete,
} from "../../components/DelegatedBusinessDecisionFields.jsx";
import { BusinessDecisionHistoryPanel } from "../../components/BusinessDecisionHistoryPanel.jsx";
import { BusinessWriteConflictDialog } from "../../components/BusinessWriteConflictDialog.jsx";
import {
  formatBusinessDecisionChannelAndTime,
  getBusinessDecisionContentSummary,
} from "../../components/businessDecisionPresentation.js";

const statusOptions = ["待执行", "已联系供应商", "已下单", "部分到货", "已完成", "已取消"];

export function RawMaterialPurchasePanel({ authState, currentUser }) {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(() => buildEmptyPurchaseDraft());
  const [decision, setDecision] = useState(() => buildEmptyDelegatedDecision());
  const [cancelDecision, setCancelDecision] = useState(() => buildEmptyDelegatedDecision());
  const [confirmation, setConfirmation] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const confirmationDialogRef = useRef(null);
  const confirmationTriggerRef = useRef(null);
  const restoreConfirmationTriggerRef = useRef(false);
  const [conflict, setConflict] = useState(null);
  const [message, setMessage] = useState("");
  const authDependencyKey = buildAuthDependencyKey(authState);
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const directAllowed = authState?.permissions?.actionPermissions?.includes("raw_material.purchase.direct") === true;
  const formReady = Boolean(draft.supplierName.trim() && draft.materialName.trim() && Number(draft.quantity) > 0)
    && (directAllowed || isDelegatedBusinessDecisionComplete(decision));
  const decisionPayload = useMemo(() => directAllowed
    ? { directDecisionContent: { summary: decision.decisionContent?.summary || `采购 ${draft.materialName}` } }
    : { delegatedDecision: decision }, [decision, directAllowed, draft.materialName]);

  useEffect(() => { void refresh(); }, [authDependencyKey, currentUser?.userId]);

  useEffect(() => {
    setCancelDecision(buildEmptyDelegatedDecision());
  }, [selectedId]);

  useEffect(() => {
    if (confirmation) {
      confirmationDialogRef.current?.focus();
      return;
    }
    if (!restoreConfirmationTriggerRef.current) return;
    restoreConfirmationTriggerRef.current = false;
    confirmationTriggerRef.current?.focus();
  }, [confirmation]);

  async function refresh() {
    const result = await listOfficeRawMaterialPurchaseRequests({ authState, operatorId: currentUser?.userId });
    if (result.blocked) {
      setMessage(result.error?.message || "采购请求读取失败。");
      return result;
    }
    setItems(result.items);
    setSelectedId((current) => result.items.some((item) => item.id === current) ? current : result.items[0]?.id ?? "");
    return result;
  }

  function openConfirmation() {
    if (!formReady) return;
    setConfirmation({
      kind: "create",
      draft: structuredClone(draft),
      decision: structuredClone(decisionPayload),
      operatorName: currentUser?.displayName || currentUser?.userId,
      idempotencyKey: buildPurchaseIdempotencyKey(),
    });
  }

  function returnToEdit() {
    if (submitting) return;
    restoreConfirmationTriggerRef.current = true;
    setConfirmation(null);
  }

  async function confirmCreate() {
    if (!confirmation || submitting) return;
    setSubmitting(true);
    const snapshot = confirmation;
    const result = await createOfficeRawMaterialPurchaseRequest({
      authState,
      operatorId: currentUser?.userId,
      idempotencyKey: snapshot.idempotencyKey,
      requestId: snapshot.draft.requestId,
      supplierNameSnapshot: snapshot.draft.supplierName,
      requiredAt: snapshot.draft.requiredAt ? new Date(snapshot.draft.requiredAt).toISOString() : undefined,
      materialLines: [{
        materialName: snapshot.draft.materialName,
        spec: snapshot.draft.spec,
        plannedQty: Number(snapshot.draft.quantity),
        unit: snapshot.draft.unit,
      }],
      ...snapshot.decision,
    });
    setSubmitting(false);
    if (isConflict(result)) {
      setConfirmation(null);
      setConflict(result.error);
      return;
    }
    if (result.blocked) {
      setMessage(result.error?.message || "采购请求创建失败。");
      return;
    }
    setConfirmation(null);
    setMessage("采购请求已创建；实际到货仍须走送货单 OCR 和逐卷入库。");
    setDraft(buildEmptyPurchaseDraft());
    setDecision(buildEmptyDelegatedDecision());
    await refresh();
    setSelectedId(result.purchaseRequest?.id ?? "");
  }

  async function changeStatus(status) {
    if (!selected || submitting || confirmation || status === selected.status) return;
    const needsDecision = status === "已取消";
    if (needsDecision && !directAllowed && !isDelegatedBusinessDecisionComplete(cancelDecision)) {
      setMessage("取消采购请求前请完整填写经营决定代录信息。");
      return;
    }
    const idempotencyKey = buildPurchaseStatusIdempotencyKey(selected.id, selected.revision, status);
    if (needsDecision) {
      if (typeof document !== "undefined") confirmationTriggerRef.current = document.activeElement;
      setConfirmation({
        kind: "status",
        purchaseRequest: structuredClone(selected),
        nextStatus: status,
        reason: `办公室更新采购状态：${selected.status} → ${status}`,
        decision: structuredClone(directAllowed
          ? { directDecisionContent: { summary: `取消采购请求 ${selected.id}：${selected.status} → ${status}` } }
          : { delegatedDecision: cancelDecision }),
        operatorName: currentUser?.displayName || currentUser?.userId,
        idempotencyKey,
      });
      return;
    }
    await submitStatusChange({
      purchaseRequest: structuredClone(selected),
      nextStatus: status,
      reason: `办公室更新采购状态：${selected.status} → ${status}`,
      idempotencyKey,
    });
  }

  async function confirmStatusChange() {
    if (confirmation?.kind !== "status" || submitting) return;
    await submitStatusChange(confirmation);
  }

  async function submitStatusChange(snapshot) {
    setSubmitting(true);
    const result = await updateOfficeRawMaterialPurchaseRequestStatus({
      authState,
      operatorId: currentUser?.userId,
      requestId: snapshot.purchaseRequest.id,
      expectedRevision: snapshot.purchaseRequest.revision,
      idempotencyKey: snapshot.idempotencyKey,
      status: snapshot.nextStatus,
      reason: snapshot.reason,
      ...(snapshot.decision ?? {}),
    });
    setSubmitting(false);
    if (isConflict(result)) {
      if (snapshot.decision) setConfirmation(null);
      setConflict(result.error);
      return;
    }
    if (result.blocked) {
      setMessage(result.error?.message || "采购状态更新失败。");
      return;
    }
    if (snapshot.decision) setConfirmation(null);
    if (snapshot.nextStatus === "已取消") setCancelDecision(buildEmptyDelegatedDecision());
    setMessage(`采购状态已更新为“${snapshot.nextStatus}”。`);
    await refresh();
  }

  return (
    <details className="raw-material-purchase-disclosure">
      <summary>
        <span>
          <strong>采购请求与经营决定</strong>
          <small>收货处理优先；需要新增或跟进采购请求时再展开。</small>
        </span>
        <b>{items.length} 条</b>
      </summary>
      <section className="raw-material-purchase-panel">
        <div className="section-title-row">
          <div><h3>新建采购请求</h3><p>经营决定与实际到货分开；本区不会增加库存或生成卷标。</p></div>
          <span>{items.length} 条采购请求</span>
        </div>
      <div className="raw-material-purchase-panel__layout">
        <div className="raw-material-purchase-panel__form">
          <div className="raw-material-purchase-panel__fields">
            <label><span>供应商</span><input disabled={submitting || Boolean(confirmation)} value={draft.supplierName} onChange={(event) => setDraft({ ...draft, supplierName: event.target.value })} /></label>
            <label><span>物料</span><input disabled={submitting || Boolean(confirmation)} value={draft.materialName} onChange={(event) => setDraft({ ...draft, materialName: event.target.value })} /></label>
            <label><span>规格</span><input disabled={submitting || Boolean(confirmation)} value={draft.spec} onChange={(event) => setDraft({ ...draft, spec: event.target.value })} /></label>
            <label><span>数量</span><input disabled={submitting || Boolean(confirmation)} min="0" type="number" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} /></label>
            <label><span>单位</span><select disabled={submitting || Boolean(confirmation)} value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })}><option>卷</option><option>件</option><option>kg</option></select></label>
            <label><span>要求到货</span><input disabled={submitting || Boolean(confirmation)} type="datetime-local" value={draft.requiredAt} onChange={(event) => setDraft({ ...draft, requiredAt: event.target.value })} /></label>
          </div>
          {!directAllowed ? (
            <DelegatedBusinessDecisionFields
              scope="raw_material_purchase"
              businessType="raw_material_purchase_request"
              businessId={draft.requestId}
              authState={authState}
              operatorId={currentUser?.userId}
              operatorName={currentUser?.displayName}
              value={decision}
              onChange={setDecision}
              title="采购决定代录"
              disabled={submitting || Boolean(confirmation)}
            />
          ) : null}
          <div className="action-row"><button ref={confirmationTriggerRef} className="primary-action" disabled={!formReady || submitting || Boolean(confirmation)} onClick={openConfirmation}>复核并创建采购请求</button></div>
          {message ? <p className="raw-material-purchase-panel__message">{message}</p> : null}
        </div>
        <div className="raw-material-purchase-panel__list">
          {items.length ? items.map((item) => (
            <button disabled={submitting || Boolean(confirmation)} key={item.id} className={item.id === selected?.id ? "active" : ""} onClick={() => setSelectedId(item.id)}>
              <strong>{item.supplierNameSnapshot || item.id}</strong>
              <span>{item.materialLines?.map((line) => `${line.materialName || line.productName} ${line.plannedQty ?? line.quantity ?? 0}${line.unit || ""}`).join(" / ")}</span>
              <small>{item.status} · 版本 {item.revision}</small>
            </button>
          )) : <p>暂无采购请求</p>}
          {selected ? (
            <div className="raw-material-purchase-panel__status">
              <label><span>更新状态</span><select disabled={submitting || Boolean(confirmation)} value={selected.status} onChange={(event) => changeStatus(event.target.value)}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
              {!directAllowed && selected.status !== "已取消" ? (
                <DelegatedBusinessDecisionFields
                  scope="raw_material_purchase"
                  businessType="raw_material_purchase_request"
                  businessId={selected.id}
                  authState={authState}
                  operatorId={currentUser?.userId}
                  operatorName={currentUser?.displayName}
                  value={cancelDecision}
                  onChange={setCancelDecision}
                  title="取消采购决定代录"
                  disabled={submitting || Boolean(confirmation)}
                />
              ) : null}
              <BusinessDecisionHistoryPanel authState={authState} operatorId={currentUser?.userId} businessType="raw_material_purchase_request" businessId={selected.id} />
            </div>
          ) : null}
        </div>
      </div>
      {confirmation ? (
        <div
          className="raw-material-purchase-confirmation"
          role="dialog"
          aria-modal="true"
          aria-label="确认采购请求"
          ref={confirmationDialogRef}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            returnToEdit();
          }}
        >
          <h3>{confirmation.kind === "status" ? "确认取消采购请求" : "确认创建采购请求"}</h3>
          <dl>
            <div><dt>原业务数据</dt><dd>{confirmation.kind === "status" ? `${confirmation.purchaseRequest.id} · ${confirmation.purchaseRequest.supplierNameSnapshot} · 当前状态 ${confirmation.purchaseRequest.status} · 版本 ${confirmation.purchaseRequest.revision}` : `供应商 ${confirmation.draft.supplierName} · 尚未创建采购请求`}</dd></div>
            <div><dt>本次变更</dt><dd>{confirmation.kind === "status" ? `${confirmation.purchaseRequest.status} → ${confirmation.nextStatus}` : `创建采购请求：${confirmation.draft.materialName} ${confirmation.draft.spec} · ${confirmation.draft.quantity}${confirmation.draft.unit}`}</dd></div>
            <div><dt>业务决定人</dt><dd>{confirmation.decision.delegatedDecision?.decisionMakerEmployeeId || "当前管理账号"}</dd></div>
            <div><dt>系统操作人</dt><dd>{confirmation.operatorName}</dd></div>
            <div><dt>决定渠道 / 时间</dt><dd>{formatBusinessDecisionChannelAndTime(confirmation.decision.delegatedDecision)}</dd></div>
            <div><dt>决定内容</dt><dd>{getBusinessDecisionContentSummary({ delegatedDecision: confirmation.decision.delegatedDecision, directSummary: confirmation.decision.directDecisionContent?.summary })}</dd></div>
            <div><dt>授权依据</dt><dd>{confirmation.decision.delegatedDecision?.authorizationBasis || "本人当前有效授权"}</dd></div>
            <div><dt>预计影响</dt><dd>{confirmation.kind === "status" ? "取消采购执行请求并保留决定证据与审计；不减少或增加库存、不改已入库卷。" : "只创建采购请求；不增加库存、不生成入库卷。"}</dd></div>
          </dl>
          <div className="action-row"><button disabled={submitting} onClick={returnToEdit}>返回修改</button><button className="primary-action" disabled={submitting} onClick={confirmation.kind === "status" ? confirmStatusChange : confirmCreate}>{submitting ? "提交中…" : "确认提交"}</button></div>
        </div>
      ) : null}
        <BusinessWriteConflictDialog
          open={Boolean(conflict)}
          error={conflict}
          onBack={() => setConflict(null)}
          onRefresh={async () => { setConflict(null); setConfirmation(null); await refresh(); }}
        />
      </section>
    </details>
  );
}

function buildAuthDependencyKey(authState) {
  return [
    authState?.source,
    authState?.session?.accessToken,
    authState?.permissions?.user?.userId,
  ].map((item) => String(item ?? "")).join(":");
}

function isConflict(result) {
  return result?.error?.code === "BUSINESS_WRITE_CONFLICT" || result?.error?.status === 409;
}

function buildPurchaseIdempotencyKey() {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `raw-material-purchase:create:${uuid}`;
}

function buildPurchaseStatusIdempotencyKey(requestId, revision, status) {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const statusToken = status === "已取消" ? "cancel" : "status";
  return `raw-material-purchase:${statusToken}:${requestId}:${revision}:${uuid}`;
}

function buildEmptyPurchaseDraft() {
  return { requestId: buildClientPurchaseRequestId(), supplierName: "", materialName: "", spec: "", quantity: "", unit: "卷", requiredAt: "" };
}

function buildEmptyDelegatedDecision() {
  return {
    decisionChannel: "wechat",
    decidedAt: new Date().toISOString(),
    decisionContent: { summary: "" },
    authorizationBasis: "",
    evidenceDraftId: "",
    evidenceAttachmentIds: [],
  };
}

function buildClientPurchaseRequestId() {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `RMP-${String(uuid).replace(/[^a-z0-9]/gi, "").slice(0, 20).toUpperCase()}`;
}
