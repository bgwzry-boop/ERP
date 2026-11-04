// P2-07 单据抬头（负责人 2026-11-04）：送货单/自提单最上面的公司名、地址、电话和最下面的说明，
// 办公室在这里自己改，以后换电话不用找人改程序。改完后新打的单子用新抬头，已经打过的单子不变。
import { useCallback, useEffect, useRef, useState } from "react";
import { createOfficeIdempotencyKey } from "../../../../src/services/officeApiClientCore.js";
import { getCompanyPrintProfile, saveCompanyPrintProfile } from "../../../../src/services/companyPrintProfileApiClient.js";
import { hasEffectivePermission } from "./navigation.js";
import "./company-print-profile.css";

const EMPTY = { companyName: "", address: "", phone: "", footerNote: "", revision: 1 };

export function CompanyPrintProfilePanel({ formal }) {
  const permissionContext = formal.permissionContext || {};
  const authState = formal.authState;
  const operatorId = permissionContext.user?.userId;
  const canEdit = hasEffectivePermission(permissionContext, "fulfillment.print");
  const [saved, setSaved] = useState(EMPTY);
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState({ loading: true, busy: false, error: "", message: "" });
  const live = useRef(true);
  const pendingKey = useRef("");
  useEffect(() => () => { live.current = false; }, []);

  const reload = useCallback(async () => {
    setState(current => ({ ...current, loading: true }));
    const result = await getCompanyPrintProfile({ authState, operatorId });
    if (!live.current) return;
    if (result.blocked) { setState(current => ({ ...current, loading: false, error: result.error?.message || "单据抬头读取失败。" })); return; }
    setSaved(result.companyPrintProfile);
    setForm(result.companyPrintProfile);
    setState(current => ({ ...current, loading: false, error: "" }));
  }, [authState, operatorId]);
  useEffect(() => { void reload(); }, [reload]);

  const changed = ["companyName", "address", "phone", "footerNote"].some(key => form[key] !== saved[key]);
  const update = key => event => { pendingKey.current = ""; setForm(current => ({ ...current, [key]: event.target.value })); setState(current => ({ ...current, message: "" })); };

  async function submit(event) {
    event.preventDefault();
    if (!form.companyName.trim()) { setState(current => ({ ...current, error: "请填写公司名称。" })); return; }
    pendingKey.current ||= createOfficeIdempotencyKey();
    setState(current => ({ ...current, busy: true, error: "", message: "" }));
    const result = await saveCompanyPrintProfile({ authState, operatorId, profile: form, expectedRevision: saved.revision, idempotencyKey: pendingKey.current });
    if (!live.current) return;
    if (result.blocked) { setState(current => ({ ...current, busy: false, error: result.error?.message || "单据抬头保存失败。" })); return; }
    pendingKey.current = "";
    setSaved(result.companyPrintProfile);
    setForm(result.companyPrintProfile);
    setState(current => ({ ...current, busy: false, message: "已保存，之后新打的送货单、自提单用新抬头。" }));
  }

  return <section className="company-print-profile" aria-label="单据抬头">
    <header>
      <h2>单据抬头 <small>送货单、自提单最上面和最下面的内容</small></h2>
    </header>
    {state.loading ? <p className="company-print-profile-muted">正在读取…</p> : <form onSubmit={submit}>
      <div className="company-print-profile-form">
        <label>公司名称<input value={form.companyName} onChange={update("companyName")} maxLength={60} disabled={!canEdit || state.busy} /></label>
        <label>电话<input value={form.phone} onChange={update("phone")} maxLength={40} disabled={!canEdit || state.busy} /></label>
        <label className="wide">地址<input value={form.address} onChange={update("address")} maxLength={120} disabled={!canEdit || state.busy} /></label>
        <label className="wide">单据底部说明<textarea rows={2} value={form.footerNote} onChange={update("footerNote")} maxLength={200} disabled={!canEdit || state.busy} /></label>
      </div>
      <div className="company-print-profile-preview" aria-label="抬头预览">
        <strong>{form.companyName || "（公司名称）"}</strong>
        <span>{[form.address && `地址：${form.address}`, form.phone && `电话：${form.phone}`].filter(Boolean).join("　") || "（地址、电话）"}</span>
        {form.footerNote ? <small>注：{form.footerNote}</small> : null}
      </div>
      {state.error ? <p role="alert" className="company-print-profile-error">{state.error}</p> : null}
      {state.message ? <p role="status" className="company-print-profile-ok">{state.message}</p> : null}
      {canEdit ? <div className="company-print-profile-actions">
        <button className="primary" type="submit" disabled={!changed || state.busy}>{state.busy ? "保存中…" : "保存抬头"}</button>
        {changed ? <button type="button" disabled={state.busy} onClick={() => { pendingKey.current = ""; setForm(saved); }}>还原</button> : null}
      </div> : <p className="company-print-profile-muted">只有能打印单据的人可以修改抬头。</p>}
    </form>}
  </section>;
}
