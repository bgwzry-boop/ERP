import { useEffect, useState } from "react";
import { getOfficeCustomerProfile, updateOfficeCustomerProfile } from "../../../../src/services/officeOrderApiClient.js";

// 负责人 2026-11-04：客户资料可以编辑。名称、简称、结算周期、联系人、电话在这里改；
// 价格表、欠款不在这里改。已开出的订单和送货单保留开单时的客户资料。
const FIELDS = [
  ["name", "客户名称", 40],
  ["shortName", "简称", 20],
  ["contactName", "联系人", 20],
  ["phone", "电话", 20],
];

export function CustomerProfilePanel({ authState, customerId, onSaved }) {
  const [state, setState] = useState({ loading: true, profile: null, options: [], error: "" });
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const load = () => {
    let live = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    void getOfficeCustomerProfile({ customerId, authState }, { serverRequired: true }).then((result) => {
      if (live) setState({ loading: false, profile: result.profile, options: result.settlementCycleOptions ?? [], error: result.blocked ? result.error?.message || "客户资料读取失败。" : "" });
    });
    return () => { live = false; };
  };
  useEffect(load, [customerId, authState]);
  const save = async () => {
    if (!form || saving) return;
    setSaving(true);
    setNotice("");
    const result = await updateOfficeCustomerProfile({ customerId, authState, ...form, expected: state.profile }, { serverRequired: true });
    setSaving(false);
    if (result.blocked) { setNotice(result.error?.message || "客户资料保存失败。"); load(); return; }
    setForm(null);
    setNotice(result.changed ? "客户资料已保存。" : "没有改动。");
    load();
    if (result.changed) onSaved?.();
  };
  const profile = state.profile;
  return (
    <section className="customer-profile-panel" aria-label="客户资料">
      <header><h3>客户资料</h3>{profile && !form ? <button className="link-button" onClick={() => { setNotice(""); setForm({ ...profile }); }} type="button">编辑</button> : null}</header>
      {state.loading ? <p role="status">正在读取…</p> : state.error ? <p role="alert">{state.error}</p> : !profile ? null : form ? (
        <div className="customer-profile-form">
          {FIELDS.map(([key, label, max]) => (
            <label key={key}>{label}<input aria-label={label} maxLength={max} value={form[key] ?? ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>
          ))}
          <label>结算周期
            <select aria-label="结算周期" value={state.options.includes(form.settlementCycle) ? form.settlementCycle : "__other__"}
              onChange={(event) => setForm({ ...form, settlementCycle: event.target.value === "__other__" ? "" : event.target.value })}>
              {state.options.map((option) => <option key={option} value={option}>{option}</option>)}
              <option value="__other__">其他（手填）</option>
            </select>
          </label>
          {!state.options.includes(form.settlementCycle) ? (
            <label>其他结算周期<input aria-label="其他结算周期" maxLength={20} placeholder="如：10天一结" value={form.settlementCycle ?? ""} onChange={(event) => setForm({ ...form, settlementCycle: event.target.value })} /></label>
          ) : null}
          <div className="customer-profile-actions">
            <button className="secondary-button" disabled={saving} onClick={() => setForm(null)} type="button">取消</button>
            <button className="primary" disabled={saving || !String(form.name ?? "").trim()} onClick={() => void save()} type="button">{saving ? "正在保存…" : "保存客户资料"}</button>
          </div>
        </div>
      ) : (
        <dl className="customer-profile-facts">
          <div><dt>客户名称</dt><dd>{profile.name}</dd></div>
          <div><dt>简称</dt><dd>{profile.shortName}</dd></div>
          <div><dt>结算周期</dt><dd>{profile.settlementCycle}</dd></div>
          <div><dt>联系人</dt><dd>{profile.contactName || "待补"}</dd></div>
          <div><dt>电话</dt><dd>{profile.phone || "待补"}</dd></div>
        </dl>
      )}
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
