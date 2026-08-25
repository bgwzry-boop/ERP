import { useEffect, useMemo, useState } from "react";
import { DataState, StatusPill } from "../../shared/ui/operational.jsx";
import {
  actOfficeMasterDataSubaccount,
  createOfficeMasterDataSubaccount,
  listOfficeMasterDataSubaccounts,
  updateOfficeMasterDataSubaccount,
} from "../../services/officeMasterDataImportApiClient.js";

const statusTone = { draft: "warning", active: "success", suspended: "neutral", disabled: "danger" };
const groupLabels = {
  order: "订单",
  inventory: "库存",
  production: "生产",
  packing: "打包",
  fulfillment: "出库交付",
  delivery: "送货",
  raw_material: "原材料",
  statement: "对账",
  business_decision: "经营决策",
  master_data: "基础资料",
  attendance: "考勤",
  payroll: "工资",
  attachment: "附件",
  maintenance: "机修",
  system: "系统",
  todo: "待办",
  permission: "账号权限",
  print: "打印",
  payment: "收款",
  major_exception: "重大异常",
};

export function SubaccountPermissionWorkbench({ authState, currentUser, employeeAccountReviews = [] }) {
  const [items, setItems] = useState([]);
  const [catalog, setCatalog] = useState({ roles: [], permissions: [] });
  const [selectedId, setSelectedId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [credential, setCredential] = useState(null);
  const selected = items.find((item) => item.userId === selectedId) ?? null;
  const [draft, setDraft] = useState(() => emptyDraft());
  const [permissionKeyword, setPermissionKeyword] = useState("");
  const operatorId = currentUser?.userId ?? currentUser?.id ?? "";

  async function refresh(preferredId = "") {
    setLoading(true);
    setError("");
    const result = await listOfficeMasterDataSubaccounts({ authState, operatorId }, { serverRequired: true });
    setLoading(false);
    if (result.blocked) {
      setItems([]);
      setError(result.error?.message || "子账号权限工作台读取失败。");
      return;
    }
    setItems(result.items);
    setCatalog(result.catalog);
    const nextId = preferredId || selectedId;
    if (nextId && result.items.some((item) => item.userId === nextId)) setSelectedId(nextId);
    else if (result.items.length) setSelectedId(result.items[0].userId);
    else setSelectedId("");
  }

  useEffect(() => {
    void refresh();
  }, [authState?.session?.accessToken, operatorId]);

  useEffect(() => {
    setDraft(selected ? draftFromSubaccount(selected) : emptyDraft(catalog.roles[0]?.roleKey));
    setCredential(null);
    setPermissionKeyword("");
  }, [selected?.userId, selected?.permissionRevision, catalog.roles.length]);

  const visibleItems = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => [item.displayName, item.loginName, item.employeeName, item.userId, ...(item.roleLabels ?? [])]
      .some((value) => String(value ?? "").toLowerCase().includes(normalized)));
  }, [items, keyword]);

  const groupedPermissions = useMemo(() => {
    const normalized = permissionKeyword.trim().toLowerCase();
    const groups = new Map();
    for (const permission of catalog.permissions) {
      if (normalized && !permission.permissionKey.toLowerCase().includes(normalized)) continue;
      const group = groups.get(permission.groupKey) ?? [];
      group.push(permission);
      groups.set(permission.groupKey, group);
    }
    return [...groups.entries()];
  }, [catalog.permissions, permissionKeyword]);

  function startCreate() {
    setSelectedId("");
    setDraft(emptyDraft(catalog.roles[0]?.roleKey));
    setCredential(null);
    setError("");
  }

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function toggleRole(roleKey) {
    setDraft((current) => ({
      ...current,
      roleKeys: current.roleKeys.includes(roleKey)
        ? current.roleKeys.filter((item) => item !== roleKey)
        : [...current.roleKeys, roleKey],
    }));
  }

  function setPermissionMode(permissionKey, mode) {
    setDraft((current) => ({
      ...current,
      permissionAllowlist: mode === "allow"
        ? [...new Set([...current.permissionAllowlist, permissionKey])]
        : current.permissionAllowlist.filter((item) => item !== permissionKey),
      permissionDenylist: mode === "deny"
        ? [...new Set([...current.permissionDenylist, permissionKey])]
        : current.permissionDenylist.filter((item) => item !== permissionKey),
    }));
  }

  function permissionMode(permissionKey) {
    if (draft.permissionAllowlist.includes(permissionKey)) return "allow";
    if (draft.permissionDenylist.includes(permissionKey)) return "deny";
    return "inherit";
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    setCredential(null);
    const input = { ...draft, authState, operatorId, userId: selected?.userId, expectedRevision: selected?.permissionRevision };
    const result = selected
      ? await updateOfficeMasterDataSubaccount(input, { serverRequired: true })
      : await createOfficeMasterDataSubaccount(input, { serverRequired: true });
    setSaving(false);
    if (result.blocked) {
      setError(result.error?.message || "子账号保存失败。");
      return;
    }
    await refresh(result.subaccount?.userId);
  }

  async function runAction(action) {
    if (!selected || saving || !draft.reason.trim()) return;
    if (action === "disable" && !window.confirm("永久停用后不可恢复，确认停用这个子账号？")) return;
    setSaving(true);
    setError("");
    setCredential(null);
    const result = await actOfficeMasterDataSubaccount({
      authState,
      operatorId,
      userId: selected.userId,
      action,
      reason: draft.reason,
    }, { serverRequired: true });
    setSaving(false);
    if (result.blocked) {
      setError(result.error?.message || "子账号状态更新失败。");
      return;
    }
    setCredential(result.credential);
    await refresh(selected.userId);
  }

  const isDisabled = selected?.accountStatus === "disabled";
  const saveDisabled = saving || isDisabled || !draft.displayName.trim() || !draft.reason.trim() || !draft.roleKeys.length || (!selected && !draft.loginName.trim());

  return (
    <section className="subaccount-permission-workbench">
      <aside className="subaccount-list-pane">
        <div className="subaccount-list-heading">
          <div>
            <h2>子账号</h2>
            <p>独立登录、按人追责，岗位与权限分开。</p>
          </div>
          <button className="primary-action" onClick={startCreate}>创建子账号</button>
        </div>
        <label className="subaccount-search">
          <span>搜索子账号</span>
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="姓名、登录名、员工或权限模板" />
        </label>
        <div className="subaccount-list-summary">
          <span>共 {items.length} 个</span>
          <span>{items.filter((item) => item.accountStatus === "active").length} 个使用中</span>
        </div>
        <div className="subaccount-list-scroll">
          {loading ? <DataState title="正在读取子账号" detail="同步账号状态与权限版本。" compact /> : null}
          {!loading && !visibleItems.length ? <DataState title="暂无子账号" detail="可先创建未启用账号，确认权限后再发放临时密码。" compact /> : null}
          {visibleItems.map((item) => (
            <button
              key={item.userId}
              className={`subaccount-list-row ${selectedId === item.userId ? "is-selected" : ""}`}
              onClick={() => setSelectedId(item.userId)}
            >
              <span className="subaccount-row-main">
                <strong>{item.displayName}</strong>
                <small>{item.loginName} · {item.employeeName || "未绑定员工"}</small>
              </span>
              <span className="subaccount-row-meta">
                <StatusPill tone={statusTone[item.accountStatus] ?? "neutral"}>{item.accountStatusLabel}</StatusPill>
                <small>{item.roleLabels?.join(" + ") || "未分配"}</small>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="subaccount-editor-pane">
        <header className="subaccount-editor-heading">
          <div>
            <h2>{selected ? selected.displayName : "创建子账号"}</h2>
            <p>{selected ? `${selected.loginName} · 权限版本 ${selected.permissionRevision}` : "先保存为未启用账号，不会立即获得登录能力。"}</p>
          </div>
          {selected ? <StatusPill tone={statusTone[selected.accountStatus] ?? "neutral"}>{selected.accountStatusLabel}</StatusPill> : null}
        </header>

        {error ? <div className="subaccount-feedback is-error" role="alert"><strong>操作未完成</strong><span>{error}</span></div> : null}
        {credential ? (
          <div className="subaccount-feedback is-credential">
            <strong>临时密码仅显示这一次</strong>
            <span>登录名：{credential.loginName}</span>
            <code>{credential.temporaryPassword}</code>
            <button onClick={() => navigator.clipboard?.writeText(credential.temporaryPassword)}>复制临时密码</button>
          </div>
        ) : null}

        <div className="subaccount-editor-scroll">
          <section className="subaccount-form-section">
            <div className="subaccount-section-heading">
              <h3>账号资料</h3>
              <p>可以绑定员工用于操作追责，但员工岗位不会自动变成权限。</p>
            </div>
            <div className="subaccount-form-grid">
              <label><span>显示名称</span><input disabled={isDisabled} value={draft.displayName} onChange={(event) => update("displayName", event.target.value)} /></label>
              <label><span>登录名</span><input disabled={Boolean(selected)} value={draft.loginName} onChange={(event) => update("loginName", event.target.value.toLowerCase())} placeholder="例如 warehouse.lisi" /></label>
              <label>
                <span>绑定员工（可选）</span>
                <select disabled={isDisabled} value={draft.employeeId} onChange={(event) => update("employeeId", event.target.value)}>
                  <option value="">不绑定员工</option>
                  {employeeAccountReviews.filter((review) => !["departed", "inactive", "voided"].includes(String(review.profileStatus ?? review.status ?? "").toLowerCase())).map((review) => (
                    <option key={review.employeeId} value={review.employeeId}>{review.name} · {review.employeeId}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="subaccount-form-section">
            <div className="subaccount-section-heading">
              <h3>权限模板</h3>
              <p>模板负责日常权限；如需例外，再到下方单项调整。</p>
            </div>
            <div className="subaccount-role-grid">
              {catalog.roles.map((role) => (
                <label key={role.roleKey} className={draft.roleKeys.includes(role.roleKey) ? "is-selected" : ""}>
                  <input type="checkbox" disabled={isDisabled} checked={draft.roleKeys.includes(role.roleKey)} onChange={() => toggleRole(role.roleKey)} />
                  <span><strong>{role.displayName}</strong><small>{role.permissionCount} 项权限</small></span>
                </label>
              ))}
            </div>
          </section>

          <details className="subaccount-permission-details">
            <summary>
              <span><strong>单项权限调整</strong><small>已额外允许 {draft.permissionAllowlist.length} 项 · 已明确禁止 {draft.permissionDenylist.length} 项</small></span>
              <span>展开</span>
            </summary>
            <div className="subaccount-permission-body">
              <label className="subaccount-permission-search"><span>筛选权限</span><input value={permissionKeyword} onChange={(event) => setPermissionKeyword(event.target.value)} placeholder="输入权限键，如 payroll" /></label>
              {groupedPermissions.map(([groupKey, permissions]) => (
                <section key={groupKey} className="subaccount-permission-group">
                  <h4>{groupLabels[groupKey] || groupKey}</h4>
                  {permissions.map((permission) => (
                    <label key={permission.permissionKey}>
                      <span><strong>{permission.permissionKey}</strong><small>{permission.kinds.includes("action") ? "操作权限" : "界面权限"}</small></span>
                      <select disabled={isDisabled} value={permissionMode(permission.permissionKey)} onChange={(event) => setPermissionMode(permission.permissionKey, event.target.value)}>
                        <option value="inherit">跟随模板</option>
                        <option value="allow">额外允许</option>
                        <option value="deny">明确禁止</option>
                      </select>
                    </label>
                  ))}
                </section>
              ))}
            </div>
          </details>

          <section className="subaccount-form-section subaccount-reason-section">
            <div className="subaccount-section-heading"><h3>本次原因</h3><p>创建、授权和状态变更都会保留操作人、时间及前后值。</p></div>
            <textarea rows={3} disabled={isDisabled} value={draft.reason} onChange={(event) => update("reason", event.target.value)} placeholder="例如：库房李师傅试用出库与库存查询权限" />
          </section>
        </div>

        <footer className="subaccount-editor-actions">
          <button className="primary-action" disabled={saveDisabled} onClick={save}>{saving ? "正在保存…" : selected ? "保存账号与权限" : "创建为未启用账号"}</button>
          {selected?.accountStatus === "draft" ? <button disabled={saving || !draft.reason.trim()} onClick={() => runAction("temporary-password")}>发放临时密码并启用</button> : null}
          {selected?.accountStatus === "active" ? <button disabled={saving || !draft.reason.trim()} onClick={() => runAction("suspend")}>暂停登录</button> : null}
          {selected?.accountStatus === "suspended" ? <button disabled={saving || !draft.reason.trim()} onClick={() => runAction("reactivate")}>恢复登录</button> : null}
          {selected && selected.accountStatus !== "disabled" ? <button className="danger-action" disabled={saving || !draft.reason.trim()} onClick={() => runAction("disable")}>永久停用</button> : null}
          <span>{selected ? `有效权限 ${selected.effectivePermissionCount} 项` : "保存后仍需单独启用"}</span>
        </footer>
      </section>
    </section>
  );
}

function emptyDraft(defaultRole = "") {
  return {
    displayName: "",
    loginName: "",
    employeeId: "",
    roleKeys: defaultRole ? [defaultRole] : [],
    permissionAllowlist: [],
    permissionDenylist: [],
    reason: "",
  };
}

function draftFromSubaccount(value) {
  return {
    displayName: value.displayName ?? "",
    loginName: value.loginName ?? "",
    employeeId: value.employeeId ?? "",
    roleKeys: value.roles ?? [],
    permissionAllowlist: value.permissionAllowlist ?? [],
    permissionDenylist: value.permissionDenylist ?? [],
    reason: "",
  };
}
