import { useEffect, useState } from "react";
import { addOfficeCustomerDeliveryAddress, getOfficeCustomerDeliveryAddresses, updateOfficeCustomerDeliveryAddress } from "../../../../src/services/officeOrderApiClient.js";

// 负责人 2026-11-04：客户资料不指望一步填齐，也可以随时编辑。办公室在这里补地址、改地址、
// 设默认、清除定位；开单时另填的、司机送货时记下的定位、以后客户在小程序填的，都会出现在这里。
export function CustomerAddressPanel({ authState, customerId }) {
  const [state, setState] = useState({ loading: true, addresses: [], error: "" });
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const load = () => {
    let live = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    void getOfficeCustomerDeliveryAddresses({ customerId, authState }, { serverRequired: true }).then((result) => {
      if (live) setState({ loading: false, addresses: result.addresses ?? [], error: result.blocked ? result.error?.message || "收货地址读取失败。" : "" });
    });
    return () => { live = false; };
  };
  useEffect(load, [customerId, authState]);
  const add = async () => {
    const address = draft.trim();
    if (!address || saving) return;
    setSaving(true);
    setNotice("");
    const result = await addOfficeCustomerDeliveryAddress({ customerId, address, source: "office", authState }, { serverRequired: true });
    setSaving(false);
    if (result.blocked) { setNotice(result.error?.message || "送货地址保存失败。"); return; }
    setDraft("");
    setNotice(result.created ? "已补充到客户档案。" : "客户档案里已有这个地址。");
    load();
  };
  const change = async (item, patch, done) => {
    if (saving) return;
    setSaving(true);
    setNotice("");
    const result = await updateOfficeCustomerDeliveryAddress({ customerId, addressId: item.addressId, authState, ...patch,
      expected: { address: item.address, isDefault: item.isDefault, located: item.located } }, { serverRequired: true });
    setSaving(false);
    if (result.blocked) { setNotice(result.error?.message || "收货地址修改失败。"); load(); return; }
    setEditing(null);
    setNotice(result.locationCleared && patch.address ? `${done}；地址改了，旧定位已清除，下次送到会重新记。` : done);
    load();
  };
  return (
    <section className="customer-address-panel" aria-label="收货地址">
      <h3>收货地址</h3>
      {state.loading ? <p role="status">正在读取…</p> : state.error ? <p role="alert">{state.error}</p> : state.addresses.length ? (
        <ul>
          {state.addresses.map((item) => (
            <li key={item.addressId}>
              {editing?.addressId === item.addressId ? (
                <>
                  <input aria-label="修改收货地址" maxLength={200} value={editing.address} onChange={(event) => setEditing({ ...editing, address: event.target.value })} />
                  <button className="secondary-button" disabled={saving || !editing.address.trim()} onClick={() => void change(item, { address: editing.address }, "地址已修改")} type="button">保存</button>
                  <button className="secondary-button" disabled={saving} onClick={() => setEditing(null)} type="button">取消</button>
                </>
              ) : (
                <>
                  <span>{item.address}</span>
                  {item.isDefault ? <b>默认</b> : null}
                  {item.remark ? <small>{item.remark}</small> : null}
                  <small>{item.located ? "已记下定位，司机可直接导航" : "还没有定位，下次送到时自动记下"}</small>
                  <span className="customer-address-actions">
                    <button className="link-button" disabled={saving} onClick={() => setEditing({ addressId: item.addressId, address: item.address })} type="button">编辑</button>
                    {!item.isDefault ? <button className="link-button" disabled={saving} onClick={() => void change(item, { makeDefault: true }, "已设为默认地址")} type="button">设为默认</button> : null}
                    {item.located ? <button className="link-button" disabled={saving} onClick={() => void change(item, { clearLocation: true }, "定位已清除，下次送到会重新记")} type="button">清除定位</button> : null}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : <p>还没有收货地址。可以现在补，也可以开单、送货时再补。</p>}
      <label>
        补一个地址
        <input aria-label="补充收货地址" maxLength={200} placeholder="如：厚街镇某村 8 号 李记制袋厂" value={draft} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button className="secondary-button" disabled={saving || !draft.trim()} onClick={() => void add()} type="button">{saving ? "正在保存…" : "保存地址"}</button>
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
