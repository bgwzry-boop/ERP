import { useEffect, useMemo, useRef, useState } from "react";
import { CloseOutlined, ReloadOutlined } from "@ant-design/icons";
import { RAW_MATERIAL_FACTORY_COLORS, normalizeRawMaterialSupplierColor, normalizeRawMaterialSupplierSourceId } from "../../../shared/rawMaterialFactoryColors.js";
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

export function RawMaterialSupplierColorMappingDialog(props) {
  const sessionKey = JSON.stringify([props.currentUser?.userId ?? "", props.authState?.session?.accessToken ?? "", props.authState?.permissions?.actionPermissions?.includes("master_data.raw_material_color.manage") === true]);
  return <SupplierColorMappingSession key={sessionKey} {...props} />;
}

function SupplierColorMappingSession({ authState, currentUser, initialValues = null, onClose, onSaved }) {
  const canManage = authState?.permissions?.actionPermissions?.includes("master_data.raw_material_color.manage") === true;
  const dialogRef = useRef(null);
  const savingRef = useRef(false);
  const savedNeedsReloadRef = useRef(false);
  const [savedNeedsReload, setSavedNeedsReload] = useState(false);
  const mountedRef = useRef(false);
  const sessionScope = `${currentUser?.userId || ""}:${authState?.session?.accessToken || ""}`;
  const sessionScopeRef = useRef(sessionScope);
  sessionScopeRef.current = sessionScope;
  const firstFieldRef = useRef(null);
  const returnFocusRef = useRef(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState([]);
  const [options, setOptions] = useState({ suppliers: [], factoryColors: RAW_MATERIAL_FACTORY_COLORS });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const supplierNameById = useMemo(() => new Map(
    options.suppliers.map((item) => [item.supplierSourceId, item.supplierName]),
  ), [options.suppliers]);

  const existingMatches = !form.mappingId ? items.filter(item =>
    normalizeRawMaterialSupplierSourceId(item.supplierSourceId) === normalizeRawMaterialSupplierSourceId(form.supplierSourceId || form.supplierName)
    && normalizeRawMaterialSupplierColor(item.supplierColor) === normalizeRawMaterialSupplierColor(form.supplierColor)
  ) : [];

  useEffect(() => {
    mountedRef.current = true;
    void loadMappings();
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    const focusFrame = window.requestAnimationFrame(() => firstFieldRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    };
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
  }, [initialValues?.factoryColor, initialValues?.reason, initialValues?.supplierColor, initialValues?.supplierName]);
  async function loadMappings() {
    const requestScope = sessionScopeRef.current;
    setLoading(true);
    setError("");
    const result = await listOfficeRawMaterialSupplierColorMappings({
      authState,
      operatorId: currentUser?.userId,
    });
    if (!mountedRef.current || requestScope !== sessionScopeRef.current) return;
    setLoadFailed(Boolean(result.blocked));
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
      mappingId: mapping.id,
      expectedMapping: { ...mapping },
      supplierSourceId: mapping.supplierSourceId,
      enabled: mapping.enabled !== false,
      factoryColor: mapping.factoryColor,
      reason: "修正厂家票面颜色与厂内标准色的对应关系",
      supplierColor: mapping.supplierColor,
      supplierName: supplierNameById.get(mapping.supplierSourceId) || mapping.supplierSourceId,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canManage || savingRef.current || savedNeedsReloadRef.current || loading || loadFailed || existingMatches.length) return;
    savingRef.current = true;
    setSaving(true);
    const requestScope = sessionScopeRef.current;
    let persisted = false;
    try {
      setError("");
      setMessage("");
      const result = await saveOfficeRawMaterialSupplierColorMapping({
        authState,
        operatorId: currentUser?.userId,
        ...form,
      });
      if (!mountedRef.current || requestScope !== sessionScopeRef.current) return;
      if (result.blocked) {
        setError(result.error?.message || "厂家颜色规则保存失败。");
        return;
      }
      persisted = true;
      setMessage((result.mapping?.enabled ?? form.enabled) === false
        ? "已停用这条规则，后续识别不再使用它换算颜色。"
        : "已保存。以后识别该厂家票面颜色时，会优先换算成所选厂内标准色。");
      if (typeof onSaved === "function") {
        await onSaved(result.mapping);
        return;
      }
      setForm(EMPTY_FORM);
      await loadMappings();
    } catch (failure) {
      if (!mountedRef.current || requestScope !== sessionScopeRef.current) return;
      if (persisted) { savedNeedsReloadRef.current = true; setSavedNeedsReload(true); }
      setError(persisted ? "规则已保存，但页面更新失败。请关闭后重新打开核对，无需重复保存。" : failure?.message || "厂家颜色规则保存失败，请重试。");
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }

  function requestClose() {
    if (!savingRef.current) onClose?.();
  }

  function handleDialogKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusableElements = Array.from(dialogRef.current?.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    if (!focusableElements.length) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements.at(-1);
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  return (
    <div className="raw-material-color-mapping-backdrop" role="presentation">
      <section
        aria-busy={saving}
        aria-describedby="raw-material-color-mapping-description"
        aria-labelledby="raw-material-color-mapping-title"
        aria-modal="true"
        className="raw-material-color-mapping-dialog"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <div>
            <h2 id="raw-material-color-mapping-title">厂家颜色资料</h2>
            <p id="raw-material-color-mapping-description">保存厂家票面叫法与厂内标准色的对应关系。OCR 保留原文，再按厂家规则统一。</p>
          </div>
          <button aria-label="关闭厂家颜色资料" disabled={saving} onClick={requestClose} type="button"><CloseOutlined /></button>
        </header>

        {!canManage ? <p role="status">当前账号没有厂家颜色维护权限，不能保存或修改规则。</p> : null}
        {existingMatches.length > 0 ? <div role="status">
          <p>该厂家票面颜色已有规则，请选择已有规则核对后修改。</p>
          {existingMatches.map(mapping => <button type="button" key={mapping.id} disabled={!canManage || saving} onClick={() => editMapping(mapping)}>修改已有规则：{mapping.supplierColor} → {mapping.factoryColor}</button>)}
        </div> : null}
        <p>{form.mappingId ? "正在修改已选规则；更换供应商或票面颜色请新增规则。" : "新增厂家颜色规则"}</p>
        {form.mappingId ? <button disabled={!canManage || saving} type="button" onClick={() => { setForm({ ...EMPTY_FORM }); setError(""); setMessage(""); firstFieldRef.current?.focus(); }}>新增另一条规则</button> : null}
        <form onSubmit={handleSubmit}>
          <label>
            <span>供应商</span>
            <input
              readOnly={Boolean(form.mappingId)}
              list="raw-material-supplier-color-options"
              onChange={(event) => setForm((current) => ({ ...current, supplierName: event.target.value }))}
              placeholder="选择或输入供应商全名"
              ref={firstFieldRef}
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
              readOnly={Boolean(form.mappingId)}
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
          <button className="primary" disabled={!canManage || saving || savedNeedsReload || loading || loadFailed || existingMatches.length > 0} type="submit">{saving ? "保存中…" : "保存规则"}</button>
        </form>

        {error ? <p className="raw-material-color-mapping-message error" role="alert">{error}</p> : null}
        {message ? <p className="raw-material-color-mapping-message success">{message}</p> : null}

        <div className="raw-material-color-mapping-list">
          <header>
            <strong>已维护规则</strong>
            <button disabled={loading} onClick={loadMappings} type="button"><ReloadOutlined aria-hidden="true" />刷新</button>
          </header>
          <div className="head"><span>供应商</span><span>票面颜色</span><span>厂内标准色</span><span>状态</span></div>
          {loading ? <p className="empty">正在读取…</p> : loadFailed ? <p className="empty">规则未能读取，请刷新重试。</p> : items.length ? items.map((item) => (
            <button disabled={!canManage || saving} className="row" key={item.id} onClick={() => editMapping(item)} type="button">
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
