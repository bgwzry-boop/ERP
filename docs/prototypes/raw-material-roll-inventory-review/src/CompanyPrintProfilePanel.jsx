// P2-07 单据抬头（负责人 2026-11-04）：送货单/自提单最上面的公司名、联系人、电话、工厂地址和最下面的说明。
// 不常改，所以只在「打印与设备」标题栏放一个「单据抬头」按钮，点开弹窗修改。
// 改完后新打的单子用新抬头，已经打过的单子不变。
import { useCallback, useEffect, useRef, useState } from "react";
import { SettingOutlined } from "@ant-design/icons";
import { createOfficeIdempotencyKey } from "../../../../src/services/officeApiClientCore.js";
import { getCompanyPrintProfile, saveCompanyPrintProfile } from "../../../../src/services/companyPrintProfileApiClient.js";
import { hasEffectivePermission } from "./navigation.js";
import { ReviewDialog } from "./ReviewDialog.jsx";
import "./finance-dialogs.css";
import "./company-print-profile.css";

const EMPTY = { companyName: "", contactName: "", address: "", phone: "", footerNote: "", revision: 1 };
const KEYS = ["companyName", "contactName", "address", "phone", "footerNote"];

export function CompanyPrintProfileButton({ formal }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}><SettingOutlined />单据抬头</button>
    {open ? <CompanyPrintProfileDialog formal={formal} onClose={() => setOpen(false)} /> : null}
  </>;
}

function CompanyPrintProfileDialog({ formal, onClose }) {
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

  const changed = KEYS.some(key => form[key] !== saved[key]);
  const update = key => event => { pendingKey.current = ""; setForm(current => ({ ...current, [key]: event.target.value })); setState(current => ({ ...current, message: "" })); };
  const close = () => { if (!state.busy) onClose(); };

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

  const disabled = !canEdit || state.busy;
  return <ReviewDialog labelledBy="company-print-profile-title" className="finance-dialog company-print-profile-dialog" onClose={close}>
    <header><div><h2 id="company-print-profile-title">单据抬头</h2><p>送货单、自提单最上面和最下面的内容</p></div><button type="button" aria-label="关闭单据抬头" disabled={state.busy} onClick={close}>×</button></header>
    <div className="finance-dialog-content company-print-profile" aria-busy={state.loading || state.busy}>
      {state.loading ? <p role="status" className="company-print-profile-muted">正在读取…</p> : <form onSubmit={submit}>
        <div className="company-print-profile-form">
          <label className="wide">公司名称<input value={form.companyName} onChange={update("companyName")} maxLength={60} disabled={disabled} /></label>
          <label>联系人<input value={form.contactName} onChange={update("contactName")} maxLength={20} disabled={disabled} /></label>
          <label>电话<input value={form.phone} onChange={update("phone")} maxLength={40} disabled={disabled} /></label>
          <label className="wide">工厂地址<input value={form.address} onChange={update("address")} maxLength={120} disabled={disabled} /></label>
          <label className="wide">单据底部说明<textarea rows={2} value={form.footerNote} onChange={update("footerNote")} maxLength={200} disabled={disabled} /></label>
        </div>
        <div className="company-print-profile-preview" aria-label="抬头预览">
          <strong>{form.companyName || "（公司名称）"}</strong>
          <span>{[form.contactName && `联系人：${form.contactName}`, form.phone && `电话：${form.phone}`, form.address && `工厂地址：${form.address}`].filter(Boolean).join("　") || "（联系人、电话、工厂地址）"}</span>
          {form.footerNote ? <small>注：{form.footerNote}</small> : null}
        </div>
        {state.error ? <p role="alert" className="company-print-profile-error">{state.error}</p> : null}
        {state.message ? <p role="status" className="company-print-profile-ok">{state.message}</p> : null}
        <div className="company-print-profile-actions">
          {canEdit ? <button className="primary" type="submit" disabled={!changed || state.busy}>{state.busy ? "保存中…" : "保存"}</button> : <p className="company-print-profile-muted">只有能打印单据的人可以修改抬头。</p>}
          <button type="button" disabled={state.busy} onClick={close}>{changed ? "取消" : "关闭"}</button>
        </div>
      </form>}
      {!state.loading && state.error && !form.companyName ? <button type="button" onClick={() => void reload()}>重新读取</button> : null}
    </div>
  </ReviewDialog>;
}
