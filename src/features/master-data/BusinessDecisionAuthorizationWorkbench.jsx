import { useEffect, useMemo, useState } from "react";
import { businessDecisionScopes, getBusinessDecisionScopeLabel } from "../../../shared/businessDecisionCatalog.js";
import {
  createBusinessDecisionAuthorization,
  deactivateBusinessDecisionAuthorization,
  listManagedBusinessDecisionAuthorizations,
  updateBusinessDecisionAuthorization,
} from "../../services/officeBusinessDecisionApiClient.js";
import { createOfficeIdempotencyKey } from "../../services/officeApiClientCore.js";
import { DataState, StatusPill } from "../../shared/ui/operational.jsx";

export function BusinessDecisionAuthorizationWorkbench({ authState, currentUser, employeeAccountReviews = [] }) {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [scope, setScope] = useState("");
  const [status, setStatus] = useState("");
  const [effectiveOnly, setEffectiveOnly] = useState(true);
  const [form, setForm] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(null);
  const authKey = `${authState?.session?.accessToken ?? ""}:${currentUser?.userId ?? ""}`;
  const formalEmployees = useMemo(() => employeeAccountReviews
    .filter((item) => !String(item.sourceType ?? item.source ?? "").match(/seed|demo|synthetic|sample/i))
    .filter((item) => !String(item.profileStatus ?? "").match(/depart|retir|void|merged/i))
    .map((item) => ({
      employeeId: item.employeeId ?? item.id,
      employeeNo: item.employeeNo ?? item.bizNo ?? item.employeeId,
      name: item.employeeName ?? item.name ?? item.displayName ?? item.employeeId,
      accountEnabled: item.accountEnabled === true,
    })), [employeeAccountReviews]);

  useEffect(() => { void refresh(); }, [authKey, scope, status, effectiveOnly]);

  async function refresh() {
    const result = await listManagedBusinessDecisionAuthorizations({
      authState, operatorId: currentUser?.userId, scope, status, effectiveOnly,
    });
    if (result.blocked) {
      setMessage(result.error?.message ?? "授权读取失败");
      return;
    }
    setItems(result.items ?? []);
    setSelectedId((current) => result.items?.some((item) => item.authorizationId === current) ? current : result.items?.[0]?.authorizationId ?? "");
  }

  const visibleItems = items.filter((item) => {
    const haystack = `${item.employeeName} ${item.employeeNo} ${item.decisionScopeLabel} ${item.authorizationNote}`.toLowerCase();
    return !keyword.trim() || haystack.includes(keyword.trim().toLowerCase());
  });
  const selected = visibleItems.find((item) => item.authorizationId === selectedId) ?? visibleItems[0] ?? null;

  function startCreate() {
    setForm({ kind: "create", employeeId: formalEmployees[0]?.employeeId ?? "", decisionScope: scope || businessDecisionScopes[0], maxAmount: "", activeFrom: toLocalDateTime(new Date().toISOString()), activeTo: "", authorizationNote: "", reason: "负责人确认经营决定授权" });
  }

  function startUpdate() {
    if (!selected || selected.status !== "active") return;
    setForm({ kind: "update", authorizationId: selected.authorizationId, expectedRevision: selected.revision, employeeId: selected.employeeId, decisionScope: selected.decisionScope, maxAmount: selected.maxAmount ?? "", activeFrom: toLocalDateTime(selected.activeFrom), activeTo: toLocalDateTime(selected.activeTo), authorizationNote: selected.authorizationNote, reason: "调整经营决定授权" });
  }

  function reviewForm() {
    if (!form?.employeeId || !form.decisionScope || !form.activeFrom) return;
    const employee = formalEmployees.find((item) => item.employeeId === form.employeeId);
    setPendingAction({
      kind: form.kind,
      form: structuredClone(form),
      employee,
      summary: `${employee?.name || form.employeeId} · ${getBusinessDecisionScopeLabel(form.decisionScope)}`,
    });
  }

  function reviewDeactivate() {
    if (!selected) return;
    setPendingAction({ kind: "deactivate", authorization: structuredClone(selected), reason: "" });
  }

  async function confirmAction() {
    if (!pendingAction || busy) return;
    setBusy(true);
    setMessage("");
    setConflict(null);
    const base = { authState, operatorId: currentUser?.userId, idempotencyKey: createOfficeIdempotencyKey() };
    let result;
    if (pendingAction.kind === "deactivate") {
      result = await deactivateBusinessDecisionAuthorization({ ...base, authorizationId: pendingAction.authorization.authorizationId, expectedRevision: pendingAction.authorization.revision, reason: pendingAction.reason });
    } else {
      const value = pendingAction.form;
      const payload = {
        ...base,
        employeeId: value.employeeId,
        decisionScope: value.decisionScope,
        maxAmount: value.maxAmount === "" ? null : Number(value.maxAmount),
        activeFrom: new Date(value.activeFrom).toISOString(),
        activeTo: value.activeTo ? new Date(value.activeTo).toISOString() : "",
        authorizationNote: value.authorizationNote,
        reason: value.reason,
      };
      result = pendingAction.kind === "create"
        ? await createBusinessDecisionAuthorization(payload)
        : await updateBusinessDecisionAuthorization({ ...payload, authorizationId: value.authorizationId, expectedRevision: value.expectedRevision });
    }
    setBusy(false);
    if (result.blocked) {
      setMessage(result.error?.message ?? "授权写入失败");
      if (result.error?.status === 409) setConflict(result.error?.details ?? result.error);
      return;
    }
    setPendingAction(null);
    setForm(null);
    setMessage(pendingAction.kind === "deactivate" ? "授权已停用，办公室有效授权列表将立即移除。" : "授权已保存并写入操作日志。");
    await refresh();
  }

  return (
    <section className="business-authorization-workbench" aria-label="业务决定授权管理">
      <div className="business-authorization-toolbar">
        <button className="primary-action" onClick={startCreate}>新建授权</button>
        <input aria-label="搜索授权" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索决定人 / 工号 / 备注" />
        <select aria-label="授权范围" value={scope} onChange={(event) => setScope(event.target.value)}><option value="">全部范围</option>{businessDecisionScopes.map((item) => <option key={item} value={item}>{getBusinessDecisionScopeLabel(item)}</option>)}</select>
        <select aria-label="授权状态" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option><option value="active">启用</option><option value="inactive">已停用</option></select>
        <label><input type="checkbox" checked={effectiveOnly} onChange={(event) => setEffectiveOnly(event.target.checked)} />仅看当前有效</label>
      </div>
      <div className="business-authorization-layout">
        <div className="business-authorization-list">
          <header><strong>授权清单</strong><span>{visibleItems.length} 条</span></header>
          {visibleItems.map((item) => (
            <button key={item.authorizationId} className={item.authorizationId === selected?.authorizationId ? "is-selected" : ""} onClick={() => setSelectedId(item.authorizationId)}>
              <span><strong>{item.employeeName || item.employeeId}</strong><small>{item.employeeNo || item.employeeId} · {item.decisionScopeLabel}</small></span>
              <span><StatusPill tone={item.isEffective ? "success" : item.effectiveStatus === "inactive" || item.effectiveStatus === "expired" ? "neutral" : "warning"}>{item.effectiveStatusLabel}</StatusPill><small>{formatDate(item.activeFrom)} → {item.activeTo ? formatDate(item.activeTo) : "长期"}</small></span>
            </button>
          ))}
          {!visibleItems.length ? <DataState title="暂无匹配授权" detail="默认只显示当前有效授权；可切换为全部记录查看已停用或过期授权。" compact /> : null}
        </div>
        <div className="business-authorization-detail">
          {selected ? (
            <>
              <header><div><h3>{selected.employeeName || selected.employeeId}</h3><p>{selected.employeeNo} · {selected.decisionScopeLabel}</p></div><StatusPill tone={selected.isEffective ? "success" : "neutral"}>{selected.effectiveStatusLabel}</StatusPill></header>
              <dl>
                <div><dt>授权额度</dt><dd>{selected.maxAmount == null ? "不限额" : `¥${Number(selected.maxAmount).toLocaleString("zh-CN")}`}</dd></div>
                <div><dt>有效期</dt><dd>{formatDateTime(selected.activeFrom)} → {selected.activeTo ? formatDateTime(selected.activeTo) : "长期"}</dd></div>
                <div><dt>授权说明</dt><dd>{selected.authorizationNote || "未填写"}</dd></div>
                <div><dt>当前版本</dt><dd>v{selected.revision}</dd></div>
                <div><dt>最近操作人</dt><dd>{selected.updatedBy || selected.createdBy || "—"}</dd></div>
                <div><dt>操作日志</dt><dd>{selected.operationLogId || "—"}</dd></div>
              </dl>
              <div className="action-row"><button disabled={selected.status !== "active"} onClick={startUpdate}>编辑授权</button><button className="danger-action" disabled={selected.status !== "active"} onClick={reviewDeactivate}>停用授权</button></div>
              <section className="business-authorization-history"><h4>变更历史</h4>{selected.history?.length ? selected.history.map((entry) => <div key={entry.operationLogId}><strong>{formatAuthorizationAction(entry.action)}</strong><span>{entry.operatorId} · {formatDateTime(entry.occurredAt)}</span><small>{entry.reason || entry.operationLogId}</small></div>) : <p>暂无历史变更。</p>}</section>
            </>
          ) : <DataState title="选择一条授权" detail="右侧将显示授权范围、版本与变更日志。" compact />}
        </div>
      </div>
      {form ? (
        <div className="business-authorization-form" role="dialog" aria-modal="true" aria-label={form.kind === "create" ? "新建业务决定授权" : "编辑业务决定授权"}>
          <h3>{form.kind === "create" ? "新建业务决定授权" : "编辑业务决定授权"}</h3>
          <div className="detail-form">
            <label><span>业务决定人</span><select value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}>{formalEmployees.map((employee) => <option key={employee.employeeId} value={employee.employeeId}>{employee.name}（{employee.employeeNo}）{employee.accountEnabled ? "" : " · 无账号"}</option>)}</select></label>
            <label><span>授权范围</span><select value={form.decisionScope} onChange={(event) => setForm({ ...form, decisionScope: event.target.value })}>{businessDecisionScopes.map((item) => <option key={item} value={item}>{getBusinessDecisionScopeLabel(item)}</option>)}</select></label>
            <label><span>额度上限</span><input type="number" min="0" value={form.maxAmount} onChange={(event) => setForm({ ...form, maxAmount: event.target.value })} placeholder="留空表示不限额" /></label>
            <label><span>生效时间</span><input type="datetime-local" value={form.activeFrom} onChange={(event) => setForm({ ...form, activeFrom: event.target.value })} /></label>
            <label><span>截止时间</span><input type="datetime-local" value={form.activeTo} onChange={(event) => setForm({ ...form, activeTo: event.target.value })} /></label>
            <label><span>授权说明</span><textarea rows={2} value={form.authorizationNote} onChange={(event) => setForm({ ...form, authorizationNote: event.target.value })} /></label>
          </div>
          <div className="action-row"><button onClick={() => setForm(null)}>取消</button><button className="primary-action" disabled={!form.employeeId || !form.decisionScope || !form.activeFrom} onClick={reviewForm}>复核授权摘要</button></div>
        </div>
      ) : null}
      {pendingAction ? (
        <div className="business-authorization-confirmation" role="alertdialog" aria-modal="true" aria-label="确认授权变更">
          <h3>{pendingAction.kind === "deactivate" ? "确认停用授权" : "确认授权内容"}</h3>
          {pendingAction.kind === "deactivate" ? <label><span>停用原因 *</span><textarea rows={2} value={pendingAction.reason} onChange={(event) => setPendingAction({ ...pendingAction, reason: event.target.value })} /></label> : (
            <dl><div><dt>决定人</dt><dd>{pendingAction.employee?.name}（{pendingAction.employee?.employeeNo}）</dd></div><div><dt>授权范围</dt><dd>{getBusinessDecisionScopeLabel(pendingAction.form.decisionScope)}</dd></div><div><dt>额度</dt><dd>{pendingAction.form.maxAmount === "" ? "不限额" : `¥${pendingAction.form.maxAmount}`}</dd></div><div><dt>有效期</dt><dd>{pendingAction.form.activeFrom} → {pendingAction.form.activeTo || "长期"}</dd></div><div><dt>当前操作人</dt><dd>{currentUser?.displayName || currentUser?.userId}</dd></div><div><dt>授权后影响</dt><dd>办公室可在该范围内选择此决定人代录；办公室不会获得管理审批权限。</dd></div></dl>
          )}
          <div className="action-row"><button disabled={busy} onClick={() => setPendingAction(null)}>返回</button><button className={pendingAction.kind === "deactivate" ? "danger-action" : "primary-action"} disabled={busy || (pendingAction.kind === "deactivate" && !pendingAction.reason.trim())} onClick={confirmAction}>{busy ? "提交中…" : "确认提交"}</button></div>
        </div>
      ) : null}
      {conflict ? <div className="business-authorization-conflict" role="alert"><strong>版本冲突</strong><p>当前版本：v{conflict.currentVersion?.revision ?? "?"}；提交版本：v{conflict.submittedVersion?.expectedRevision ?? "?"}。请刷新后重新确认。</p><button onClick={() => { setConflict(null); void refresh(); }}>刷新授权</button></div> : null}
      {message ? <p className="business-authorization-message" role="status">{message}</p> : null}
    </section>
  );
}

function formatAuthorizationAction(action) { return { business_decision_authorization_created: "新建授权", business_decision_authorization_updated: "更新授权", business_decision_authorization_deactivated: "停用授权" }[action] ?? action; }
function toLocalDateTime(value) { if (!value) return ""; const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("zh-CN"); }
function formatDateTime(value) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false }); }
