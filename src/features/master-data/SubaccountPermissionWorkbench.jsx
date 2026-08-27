import { useEffect, useMemo, useState } from "react";
import { DataState, StatusPill } from "../../shared/ui/operational.jsx";
import {
  actOfficeMasterDataSubaccount,
  createOfficeMasterDataSubaccount,
  listOfficeMasterDataSubaccounts,
  updateOfficeMasterDataSubaccount,
} from "../../services/officeMasterDataImportApiClient.js";

const statusTone = { draft: "warning", active: "success", suspended: "neutral", disabled: "danger" };
const positionPresentation = Object.freeze({
  office: { description: "录单、排产与日常业务跟进", scopes: ["订单录入", "业务跟进", "原料复核"] },
  warehouse: { description: "查库存、出库和原料领用", scopes: ["库存查询", "出库交付", "原料领用"] },
  finance: { description: "客户对账、收款与工资核算", scopes: ["客户对账", "收付款", "工资核算"] },
  driver: { description: "查看送货任务并回传凭证", scopes: ["送货任务", "装车确认", "送达凭证"] },
  workshop: { description: "领取生产任务并完成报工", scopes: ["生产任务", "完工报数", "领用原料"] },
  packing: { description: "打包、贴标和余料退回", scopes: ["打包完成", "标签确认", "余料退回"] },
  maintenance: { description: "接收报修、巡检和维修反馈", scopes: ["设备报修", "维修进度", "巡检记录"] },
  management: { description: "跨部门审核与系统管理", scopes: ["业务审核", "人员资料", "系统管理"] },
  decision_maker: { description: "处理经营决定和重大业务例外", scopes: ["经营决定", "订单优先级", "重大例外"] },
  decision_maker_primary: { description: "在经营决策岗位上增加最终决定权", scopes: ["最终决定", "重大异常"] },
  technical_operations: { description: "系统配置、上线检查与账号维护", scopes: ["账号维护", "系统配置", "上线检查"] },
});

const positionGroupDefinitions = Object.freeze([
  { key: "daily", label: "日常岗位", roleKeys: ["office", "warehouse", "finance", "driver", "workshop", "packing", "maintenance"] },
  { key: "management", label: "管理与特殊岗位", roleKeys: ["management", "decision_maker", "decision_maker_primary", "technical_operations"] },
]);

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
  const operatorId = currentUser?.userId ?? currentUser?.id ?? "";

  async function refresh(preferredId = "") {
    setLoading(true);
    setError("");
    const result = await listOfficeMasterDataSubaccounts({ authState, operatorId }, { serverRequired: true });
    setLoading(false);
    if (result.blocked) {
      setItems([]);
      setError(result.error?.message || "岗位分配工作台读取失败。");
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
    setDraft(selected ? draftFromSubaccount(selected) : emptyDraft());
    setCredential(null);
  }, [selected?.userId, selected?.permissionRevision, catalog.roles.length]);

  const visibleItems = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => [item.displayName, item.loginName, item.employeeName, item.userId, ...(item.roleLabels ?? [])]
      .some((value) => String(value ?? "").toLowerCase().includes(normalized)));
  }, [items, keyword]);

  const positionGroups = useMemo(() => {
    const roleByKey = new Map(catalog.roles.map((role) => [role.roleKey, role]));
    const knownKeys = new Set(positionGroupDefinitions.flatMap((group) => group.roleKeys));
    const groups = positionGroupDefinitions.map((group) => ({
      ...group,
      roles: group.roleKeys.map((roleKey) => roleByKey.get(roleKey)).filter(Boolean),
    }));
    const remaining = catalog.roles.filter((role) => !knownKeys.has(role.roleKey));
    return remaining.length ? [...groups, { key: "other", label: "其他岗位", roles: remaining }] : groups;
  }, [catalog.roles]);

  const selectedRoles = catalog.roles.filter((role) => draft.roleKeys.includes(role.roleKey));
  const specialPermissionCount = draft.permissionAllowlist.length + draft.permissionDenylist.length;

  function startCreate() {
    setSelectedId("");
    setDraft(emptyDraft());
    setCredential(null);
    setError("");
  }

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function toggleRole(roleKey) {
    setDraft((current) => {
      const isSelected = current.roleKeys.includes(roleKey);
      if (roleKey === "decision_maker_primary") {
        return {
          ...current,
          roleKeys: isSelected
            ? current.roleKeys.filter((item) => item !== roleKey)
            : [...new Set([...current.roleKeys, "decision_maker", roleKey])],
        };
      }
      if (roleKey === "decision_maker" && isSelected) {
        return { ...current, roleKeys: current.roleKeys.filter((item) => !["decision_maker", "decision_maker_primary"].includes(item)) };
      }
      return {
        ...current,
        roleKeys: isSelected
          ? current.roleKeys.filter((item) => item !== roleKey)
          : [...current.roleKeys, roleKey],
      };
    });
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
            <p>选择一个人，再给他分配岗位。</p>
          </div>
          <button className="primary-action" onClick={startCreate}>创建子账号</button>
        </div>
        <label className="subaccount-search">
          <span>搜索子账号</span>
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="姓名、登录名、员工或岗位" />
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
            <h2>{selected ? `${selected.displayName} · 岗位分配` : "创建子账号并分配岗位"}</h2>
            <p>{selected ? `${selected.loginName} · 换岗时直接调整下方岗位` : "选好人员和岗位后保存；账号不会立即启用。"}</p>
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
              <p>账号用于确认是谁在操作；可以绑定现有员工。</p>
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
              <h3>分配岗位</h3>
              <p>点选岗位即可。系统会自动带出这个岗位需要的功能，不用逐项设置权限。</p>
            </div>
            <div className="subaccount-position-picker">
              <div className={`subaccount-position-summary ${draft.roleKeys.length ? "has-selection" : ""}`}>
                <span>
                  <strong>{draft.roleKeys.length ? `已分配 ${draft.roleKeys.length} 个岗位` : "还没有分配岗位"}</strong>
                  <small>{draft.roleKeys.length ? "岗位对应功能已自动配置" : "请在下方至少选择一个岗位"}</small>
                </span>
                <span className="subaccount-selected-positions">
                  {selectedRoles.map((role) => <em key={role.roleKey}>{role.displayName}</em>)}
                </span>
              </div>
              {positionGroups.map((group) => group.roles.length ? (
                <section key={group.key} className="subaccount-position-group">
                  <h4>{group.label}</h4>
                  <div className="subaccount-role-grid">
                    {group.roles.map((role) => {
                      const presentation = positionPresentation[role.roleKey] ?? { description: "使用该岗位的日常业务功能", scopes: [] };
                      const checked = draft.roleKeys.includes(role.roleKey);
                      return (
                        <label key={role.roleKey} className={checked ? "is-selected" : ""}>
                          <input type="checkbox" disabled={isDisabled} checked={checked} onChange={() => toggleRole(role.roleKey)} />
                          <span className="subaccount-position-copy">
                            <strong>{role.displayName}</strong>
                            <small>{presentation.description}</small>
                            <span className="subaccount-position-scopes">
                              {presentation.scopes.map((scope) => <em key={scope}>{scope}</em>)}
                            </span>
                          </span>
                          <span className="subaccount-position-choice" aria-hidden="true">{checked ? "已选" : "选择"}</span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ) : null)}
              {specialPermissionCount ? (
                <div className="subaccount-special-permission-note">
                  <strong>已保留 {specialPermissionCount} 项特殊设置</strong>
                  <span>这是该账号原有的管理员设置，调整岗位时不会被清空。</span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="subaccount-form-section subaccount-reason-section">
            <div className="subaccount-section-heading"><h3>调整说明</h3><p>简单写明为什么分配或调整岗位，方便以后追溯。</p></div>
            <textarea rows={3} disabled={isDisabled} value={draft.reason} onChange={(event) => update("reason", event.target.value)} placeholder="例如：李师傅负责库房出库工作" />
          </section>
        </div>

        <footer className="subaccount-editor-actions">
          <button className="primary-action" disabled={saveDisabled} onClick={save}>{saving ? "正在保存…" : selected ? "保存岗位分配" : "保存子账号与岗位"}</button>
          {selected?.accountStatus === "draft" ? <button disabled={saving || !draft.reason.trim()} onClick={() => runAction("temporary-password")}>发放临时密码并启用</button> : null}
          {selected?.accountStatus === "active" ? <button disabled={saving || !draft.reason.trim()} onClick={() => runAction("suspend")}>暂停登录</button> : null}
          {selected?.accountStatus === "suspended" ? <button disabled={saving || !draft.reason.trim()} onClick={() => runAction("reactivate")}>恢复登录</button> : null}
          {selected && selected.accountStatus !== "disabled" ? <button className="danger-action" disabled={saving || !draft.reason.trim()} onClick={() => runAction("disable")}>永久停用</button> : null}
          <span>{selected ? `当前 ${draft.roleKeys.length} 个岗位` : "保存后仍需单独启用"}</span>
        </footer>
      </section>
    </section>
  );
}

function emptyDraft() {
  return {
    displayName: "",
    loginName: "",
    employeeId: "",
    roleKeys: [],
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
