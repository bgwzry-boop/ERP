import { useEffect, useState } from "react";
import { addOfficeCustomerDeliveryAddress, getOfficeCustomerDeliveryAddresses } from "../../../../src/services/officeOrderApiClient.js";

// 负责人 2026-11-04：客户资料不指望一步填齐。办公室可以在客户档案里随时补收货地址，
// 开单时另填的、司机送货时补的、以后客户在小程序填的，都会出现在这里。
export function CustomerAddressPanel({ authState, customerId }) {
  const [state, setState] = useState({ loading: true, addresses: [], error: "" });
  const [draft, setDraft] = useState("");
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
  const save = async () => {
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
  return (
    <section className="customer-address-panel" aria-label="收货地址">
      <h3>收货地址</h3>
      {state.loading ? <p role="status">正在读取…</p> : state.error ? <p role="alert">{state.error}</p> : state.addresses.length ? (
        <ul>
          {state.addresses.map((item) => (
            <li key={item.addressId}>
              <span>{item.address}</span>
              {item.isDefault ? <b>默认</b> : null}
              <small>{item.located ? "已记下定位，司机可直接导航" : "还没有定位，下次送到时自动记下"}</small>
              {item.remark ? <small>{item.remark}</small> : null}
            </li>
          ))}
        </ul>
      ) : <p>还没有收货地址。可以现在补，也可以开单、送货时再补。</p>}
      <label>
        补一个地址
        <input aria-label="补充收货地址" maxLength={200} placeholder="如：厚街镇某村 8 号 李记制袋厂" value={draft} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button className="secondary-button" disabled={saving || !draft.trim()} onClick={() => void save()} type="button">{saving ? "正在保存…" : "保存地址"}</button>
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
