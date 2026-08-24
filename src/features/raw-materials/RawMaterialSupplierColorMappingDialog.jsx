import { useEffect, useMemo, useState } from "react";
import { CloseOutlined, ReloadOutlined } from "@ant-design/icons";
import { RAW_MATERIAL_FACTORY_COLORS } from "../../../shared/rawMaterialFactoryColors.js";
import {
  listOfficeRawMaterialSupplierColorMappings,
  saveOfficeRawMaterialSupplierColorMapping,
} from "./rawMaterialSupplierColorMappingApiClient.js";

const EMPTY_FORM = Object.freeze({
  enabled: true,
  factoryColor: "",
  reason: "",
  supplierColor: "",
  supplierName: "",
});

export function RawMaterialSupplierColorMappingDialog({ authState, currentUser, initialValues = null, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState([]);
  const [options, setOptions] = useState({ suppliers: [], factoryColors: RAW_MATERIAL_FACTORY_COLORS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const supplierNameById = useMemo(() => new Map(
    options.suppliers.map((item) => [item.supplierSourceId, item.supplierName]),
  ), [options.suppliers]);

  useEffect(() => {
    void loadMappings();
  }, []);

  useEffect(() => {
    if (!initialValues) return;
    setForm({
      ...EMPTY_FORM,
      enabled: true,
      factoryColor: initialValues.factoryColor ?? "",
      reason: initialValues.reason || "首次确认该厂家票面颜色与厂内标准色的对应关系",
      supplierColor: initialValues.supplierColor ?? "",
      supplierName: initialValues.supplierName ?? "",
    });
  }, [initialValues]);
  async function loadMappings() {
    setLoading(true);
    setError("");
    const result = await listOfficeRawMaterialSupplierColorMappings({
      authState,
      operatorId: currentUser?.userId,
    });
    if (result.blocked) setError(result.error?.message || "厂家颜色资料读取失败。");
    setItems(result.items ?? []);
    setOptions({
      suppliers: result.options?.suppliers ?? [],
      factoryColors: result.options?.factoryColors?.length ? result.options.factoryColors : RAW_MATERIAL_FACTORY_COLORS,
    });
    setLoading(false);
  }

  function editMapping(mapping) {
    setMessage("");
    setError("");
    setForm({
      enabled: mapping.enabled !== false,
      factoryColor: mapping.factoryColor,
      reason: "修正厂家票面颜色与厂内标准色的对应关系",
      supplierColor: mapping.supplierColor,
      supplierName: supplierNameById.get(mapping.supplierSourceId) || mapping.supplierSourceId,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const result = await saveOfficeRawMaterialSupplierColorMapping({
      authState,
      operatorId: currentUser?.userId,
      ...form,
    });
    if (result.blocked) {
      setError(result.error?.message || "厂家颜色规则保存失败。");
      setSaving(false);
      return;
    }
    setMessage("已保存。以后识别该厂家票面颜色时，会优先换算成所选厂内标准色。");
    if (typeof onSaved === "function") {
      onSaved(result.mapping);
      return;
    }
    setForm(EMPTY_FORM);
    await loadMappings();
    setSaving(false);
  }

  return (
    <div className="raw-material-color-mapping-backdrop" role="presentation">
      <section aria-label="厂家颜色资料" aria-modal="true" className="raw-material-color-mapping-dialog" role="dialog">
        <header>
          <div>
            <h2>厂家颜色资料</h2>
            <p>保存厂家票面叫法与厂内标准色的对应关系。OCR 保留原文，再按厂家规则统一。</p>
          </div>
          <button aria-label="关闭厂家颜色资料" onClick={onClose} type="button"><CloseOutlined /></button>
        </header>

        <form onSubmit={handleSubmit}>
          <label>
            <span>供应商</span>
            <input
              list="raw-material-supplier-color-options"
              onChange={(event) => setForm((current) => ({ ...current, supplierName: event.target.value }))}
              placeholder="选择或输入供应商全名"
              required
              value={form.supplierName}
            />
            <datalist id="raw-material-supplier-color-options">
              {options.suppliers.map((item) => <option key={item.supplierSourceId} value={item.supplierName} />)}
            </datalist>
          </label>
          <label>
            <span>票面颜色</span>
            <input
              onChange={(event) => setForm((current) => ({ ...current, supplierColor: event.target.value }))}
              placeholder="例如：184、白、特白"
              required
              value={form.supplierColor}
            />
          </label>
          <label>
            <span>厂内标准色</span>
            <input
              list="raw-material-factory-color-options"
              onChange={(event) => setForm((current) => ({ ...current, factoryColor: event.target.value }))}
              placeholder="选择或输入标准色"
              required
              value={form.factoryColor}
            />
            <datalist id="raw-material-factory-color-options">
              {options.factoryColors.map((color) => <option key={color} value={color}>{color}</option>)}
            </datalist>
            <small>列表中没有时可直接输入新的厂内标准色；保存后纳入资料并用于后续自动识别。</small>
          </label>
          <label className="reason">
            <span>修改原因</span>
            <input
              onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
              placeholder="用于操作审计"
              required
              value={form.reason}
            />
          </label>
          <label className="enabled">
            <input
              checked={form.enabled}
              onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
              type="checkbox"
            />
            <span>启用这条规则</span>
          </label>
          <button className="primary" disabled={saving} type="submit">{saving ? "保存中…" : "保存规则"}</button>
        </form>

        {error ? <p className="raw-material-color-mapping-message error" role="alert">{error}</p> : null}
        {message ? <p className="raw-material-color-mapping-message success">{message}</p> : null}

        <div className="raw-material-color-mapping-list">
          <header>
            <strong>已维护规则</strong>
            <button disabled={loading} onClick={loadMappings} type="button"><ReloadOutlined />刷新</button>
          </header>
          <div className="head"><span>供应商</span><span>票面颜色</span><span>厂内标准色</span><span>状态</span></div>
          {loading ? <p className="empty">正在读取…</p> : items.length ? items.map((item) => (
            <button className="row" key={item.id} onClick={() => editMapping(item)} type="button">
              <span>{supplierNameById.get(item.supplierSourceId) || item.supplierSourceId}</span>
              <span>{item.supplierColor}</span>
              <strong>{item.factoryColor}</strong>
              <span className={item.enabled ? "enabled" : "disabled"}>{item.enabled ? "启用" : "停用"}</span>
            </button>
          )) : <p className="empty">还没有厂家颜色规则，可先新增一条。</p>}
        </div>
      </section>
    </div>
  );
}
