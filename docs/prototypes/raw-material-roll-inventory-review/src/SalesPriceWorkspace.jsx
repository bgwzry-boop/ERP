// 负责人 2026-11-12「销售价格」：全厂统一价，以 ERP 为准。开单时按这里生效的价格自动套价；
// 改价 = 存成一个新版本，立即对之后开的单生效，已下的订单保留下单时的价格。只有负责人能改。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditOutlined, HistoryOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { createOfficeIdempotencyKey } from "../../../../src/services/officeApiClientCore.js";
import { getSalesPrices, saveSalesPriceVersion } from "../../../../src/services/salesPriceApiClient.js";
import {
  FACTORY_SALES_PRICE_LIST_20261028,
  SALES_PRICE_LIST_SOURCE,
  diffSalesPriceTables,
  formatSalesPriceSize,
  normalizeSalesPriceRules,
  normalizeSalesPriceSizeKey,
} from "../../../../shared/pricing/factorySalesPriceList.js";
import { LARGE_MACHINE_PRINT_TIERS, MANUAL_PRINT_UNIT_PRICES } from "../../../../shared/largeMachinePrintPricing.js";
import { hasEffectivePermission } from "./navigation.js";
import "./sales-prices.css";

// 每个分类怎么排成表：覆膜款一行放「普通 / 金银」两个价，礼品袋一行放「喜 / 福」两个价。
const SECTIONS = [
  { key: "regular", title: "常规尺寸", note: "裸布、酒袋、特殊尺寸", columns: [{ styleKey: "空白袋", label: "单价" }] },
  { key: "laminated", title: "覆膜款", note: "", columns: [{ styleKey: "覆膜袋", label: "单价" }, { styleKey: "覆膜金银", label: "金银" }] },
  { key: "gift", title: "礼品袋（丝印金色）", note: "喜字、福字", columns: [{ styleKey: "喜", label: "喜" }, { styleKey: "福", label: "福" }] },
  { key: "bear_dog", title: "小熊小狗（加扣）", note: "价格已含扣子", columns: [{ styleKey: "小熊小狗", label: "单价" }] },
];

const clean = (value) => String(value ?? "").trim();
const money = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  // 价目表的写法：至少两位小数（0.80、0.335）。
  const text = String(Math.round(number * 10_000) / 10_000);
  const decimals = text.split(".")[1]?.length ?? 0;
  return decimals >= 2 ? text : number.toFixed(2);
};
const dateText = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
function baseLabel(label, styleKey) {
  if (styleKey === "喜" || styleKey === "福") return "礼品袋";
  return styleKey === "覆膜金银" ? clean(label).replace(/^覆膜金银/u, "覆膜") : clean(label);
}
const autoRowId = (item) => {
  const sizeKey = normalizeSalesPriceSizeKey(item.sizeKey);
  return item.category === "regular" || item.category === "bear_dog" ? `${item.category}|${sizeKey}|${clean(item.label)}` : `${item.category}|${sizeKey}`;
};
let newRowSequence = 0;

/** 把价格行按分类、尺寸并成表格行：一行 = 一个尺寸，列 = 款式。 */
function buildSectionRows(items, section) {
  const rows = new Map();
  for (const item of items) {
    if (item.category !== section.key) continue;
    const sizeKey = normalizeSalesPriceSizeKey(item.sizeKey);
    // 编辑时每个格子带着自己所在的行号（rowId），新加的行在输入尺寸时不会跳行、丢焦点。
    const rowKey = item.rowId ?? autoRowId(item);
    const row = rows.get(rowKey) ?? { key: rowKey, sizeKey, label: baseLabel(item.label, item.styleKey), sortOrder: item.sortOrder ?? 0, cells: {} };
    row.cells[item.styleKey] = item;
    if (item.styleKey === section.columns[0].styleKey) { row.label = baseLabel(item.label, item.styleKey); row.sortOrder = item.sortOrder ?? row.sortOrder; }
    rows.set(rowKey, row);
  }
  return [...rows.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

const toDraft = (current) => ({
  items: (current?.items ?? []).map((item) => ({ ...item, bagPrice: money(item.bagPrice), rowId: autoRowId(item) })),
  rules: normalizeSalesPriceRules(current?.rules),
  changeSummary: "",
});

const seedDraft = () => ({
  items: FACTORY_SALES_PRICE_LIST_20261028.items.map((item, index) => ({ ...item, bagPrice: money(item.bagPrice), sortOrder: index + 1, rowId: autoRowId(item) })),
  rules: normalizeSalesPriceRules(FACTORY_SALES_PRICE_LIST_20261028.rules),
  changeSummary: `按${SALES_PRICE_LIST_SOURCE}建立`,
});

export function SalesPriceWorkspace({ formal }) {
  const permissionContext = formal.permissionContext || {};
  const authState = formal.authState;
  const operatorId = permissionContext.user?.userId;
  const canEdit = hasEffectivePermission(permissionContext, "master_data.sales_price.manage");
  const [data, setData] = useState(null);
  const [state, setState] = useState({ loading: true, busy: false, error: "", message: "" });
  const [draft, setDraft] = useState(null);
  const pendingKey = useRef("");
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const reload = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    const result = await getSalesPrices({ authState, operatorId });
    if (!live.current) return;
    if (result.blocked) { setState((current) => ({ ...current, loading: false, error: result.error?.message || "销售价格读取失败。" })); return; }
    setData(result.salesPrices);
    setState((current) => ({ ...current, loading: false }));
  }, [authState, operatorId]);
  useEffect(() => { void reload(); }, [reload]);

  const current = data?.current ?? null;
  const shown = draft ?? (current ? toDraft(current) : null);
  const changes = useMemo(() => {
    if (!draft) return [];
    if (!current) return [{ kind: "created", text: `建立价格表，共 ${draft.items.length} 个价` }];
    return diffSalesPriceTables(current, { items: draft.items.map((item) => ({ ...item, bagPrice: Number(item.bagPrice) })), rules: draft.rules });
  }, [current, draft]);

  const startEdit = (seed = false) => { pendingKey.current = ""; setDraft(seed ? seedDraft() : toDraft(current)); setState((s) => ({ ...s, message: "", error: "" })); };
  const cancelEdit = () => { pendingKey.current = ""; setDraft(null); setState((s) => ({ ...s, error: "" })); };
  const updateItem = (target, patch) => setDraft((value) => ({ ...value, items: value.items.map((item) => (item === target ? { ...item, ...patch } : item)) }));
  const removeItem = (target) => setDraft((value) => ({ ...value, items: value.items.filter((item) => item !== target) }));
  const addRow = (section) => setDraft((value) => {
    const sortOrder = Math.max(0, ...value.items.map((item) => item.sortOrder ?? 0)) + 1;
    newRowSequence += 1;
    return { ...value, items: [...value.items, { category: section.key, styleKey: section.columns[0].styleKey, sizeKey: "", label: section.key === "bear_dog" ? "小熊小狗" : section.key === "gift" ? "喜字礼品袋" : "", bagPrice: "", sortOrder, isNew: true, rowId: `new-${newRowSequence}` }] };
  });
  const addCell = (section, row, column) => setDraft((value) => ({ ...value, items: [...value.items, {
    category: section.key, styleKey: column.styleKey, sizeKey: row.sizeKey,
    label: column.styleKey === "覆膜金银" ? row.label.replace(/^覆膜/u, "覆膜金银") : column.styleKey === "喜" ? "喜字礼品袋" : column.styleKey === "福" ? "福字礼品袋" : row.label,
    bagPrice: "", sortOrder: row.sortOrder, isNew: true, rowId: row.key,
  }] }));
  const updateRule = (patch) => setDraft((value) => ({ ...value, rules: { ...value.rules, ...patch } }));

  const save = async () => {
    if (!draft || state.busy) return;
    pendingKey.current ||= createOfficeIdempotencyKey();
    setState((s) => ({ ...s, busy: true, error: "" }));
    const result = await saveSalesPriceVersion({
      authState, operatorId, expectedCurrentId: current?.id ?? "", idempotencyKey: pendingKey.current, changeSummary: draft.changeSummary,
      rules: draft.rules,
      items: draft.items.map(({ category, styleKey, sizeKey, label, bagPrice }) => ({ category, styleKey, sizeKey: normalizeSalesPriceSizeKey(sizeKey), label, bagPrice: clean(bagPrice) })),
    });
    if (!live.current) return;
    if (result.blocked) {
      if (result.error?.code !== "SALES_PRICE_INVALID") pendingKey.current = "";
      setState((s) => ({ ...s, busy: false, error: result.error?.message || "销售价格保存失败。" }));
      return;
    }
    pendingKey.current = "";
    setData(result.salesPrices);
    setDraft(null);
    setState({ loading: false, busy: false, error: "", message: `已存为第 ${result.saved?.versionNo ?? result.salesPrices?.current?.versionNo} 版，之后开的单按新价算。` });
  };

  const editing = Boolean(draft);
  return <div className="sales-price-workbench">
    <section className="sales-price-main" aria-label="销售价格">
      <header className="sales-price-head">
        <div>
          <h1>销售价格</h1>
          <p>全厂统一价，以 ERP 为准。开单时自动带出单价；改价存成新版本，已下的订单保留下单时的价格。</p>
        </div>
        <div className="sales-price-actions">
          {current && !editing ? <span className="sales-price-current">当前生效：第 {current.versionNo} 版 · {dateText(current.effectiveFrom)} 起</span> : null}
          {!editing ? <button aria-label="刷新销售价格" onClick={() => void reload()} type="button"><ReloadOutlined />刷新</button> : null}
          {canEdit && !editing && current ? <button className="primary" onClick={() => startEdit(false)} type="button"><EditOutlined />改价</button> : null}
          {editing ? <><button disabled={state.busy} onClick={cancelEdit} type="button">取消</button><button className="primary" disabled={state.busy || !changes.length} onClick={() => void save()} type="button">{state.busy ? "正在保存…" : current ? "保存为新版本" : "建立价格表"}</button></> : null}
        </div>
      </header>
      {state.message ? <div className="sales-price-notice" role="status">{state.message}</div> : null}
      {state.error ? <div className="sales-price-error" role="alert">{state.error}</div> : null}
      {data?.conflict ? <div className="sales-price-error" role="alert">库里同时有两个生效的价格表，开单会拒绝自动套价，请联系技术处理。</div> : null}
      {state.loading && !data ? <div className="sales-price-empty"><strong>正在读取销售价格…</strong></div> : null}
      {!state.loading && !shown ? <div className="sales-price-empty">
        <strong>还没有销售价格表</strong>
        <span>开单暂时不能自动套价。{canEdit ? `可以先按「${SALES_PRICE_LIST_SOURCE}」原样建立，核对无误后保存。` : "请负责人先建立价格表。"}</span>
        {canEdit ? <button className="primary" onClick={() => startEdit(true)} type="button"><PlusOutlined />按 2026-10-28 价目表建立</button> : null}
      </div> : null}
      {shown ? <div className="sales-price-scroll">
        {editing ? <label className="sales-price-summary"><b>改价说明</b><input aria-label="改价说明" maxLength={200} onChange={(event) => setDraft((value) => ({ ...value, changeSummary: event.target.value }))} placeholder="比如：裸布竖中号涨到 0.42" value={draft.changeSummary} /></label> : null}
        {editing ? <div className={`sales-price-changes${changes.length ? "" : " none"}`} aria-live="polite">{changes.length ? <><b>这次改了 {changes.length} 处</b>{changes.slice(0, 8).map((change) => <span key={change.text}>{change.text}</span>)}{changes.length > 8 ? <span>…等 {changes.length} 处</span> : null}</> : "还没有改动"}</div> : null}
        <div className="sales-price-grid">
          {SECTIONS.map((section) => <PriceSection key={section.key} editing={editing} items={shown.items} onAddCell={addCell} onAddRow={addRow} onRemove={removeItem} onUpdate={updateItem} original={current?.items ?? []} section={section} />)}
          <section className="sales-price-card" aria-label="加长提手和加扣子">
            <header><h2>加长手提另加</h2><small>元/个 · 没写长度按最短一档</small></header>
            <div className="sales-price-chips">{shown.rules.handleAddons.map((rule, index) => <span className="sales-price-chip" key={index}>
              {editing ? <><input aria-label={`加长提手第 ${index + 1} 档长度`} inputMode="numeric" onChange={(event) => updateRule({ handleAddons: draft.rules.handleAddons.map((item, i) => (i === index ? { ...item, lengthCm: event.target.value } : item)) })} value={rule.lengthCm} />cm +<input aria-label={`${rule.lengthCm}cm 提手加价`} inputMode="decimal" onChange={(event) => updateRule({ handleAddons: draft.rules.handleAddons.map((item, i) => (i === index ? { ...item, addon: event.target.value } : item)) })} value={rule.addon} /><button aria-label={`删除 ${rule.lengthCm}cm 这一档`} onClick={() => updateRule({ handleAddons: draft.rules.handleAddons.filter((_, i) => i !== index) })} type="button">×</button></> : <>{rule.lengthCm}cm <b>+{money(rule.addon)}</b></>}
            </span>)}{editing ? <button className="sales-price-add" onClick={() => updateRule({ handleAddons: [...draft.rules.handleAddons, { lengthCm: "", addon: "" }] })} type="button"><PlusOutlined />加一档</button> : null}</div>
            <header><h2>加扣另加</h2><small>元/个</small></header>
            <p className="sales-price-rule">每个袋子 {editing ? <input aria-label="加扣子每个加多少" inputMode="decimal" onChange={(event) => updateRule({ snapAddon: { ...draft.rules.snapAddon, addon: event.target.value } })} value={draft.rules.snapAddon.addon} /> : <b>+{money(shown.rules.snapAddon.addon)}</b>}，小熊小狗已含扣子，不再加</p>
            <header><h2>礼品袋优惠</h2><small>喜字、福字</small></header>
            <p className="sales-price-rule">{editing ? <input aria-label="礼品袋优惠起始数量" inputMode="numeric" onChange={(event) => updateRule({ giftDiscount: { ...draft.rules.giftDiscount, minQty: event.target.value } })} value={draft.rules.giftDiscount.minQty} /> : <b>{shown.rules.giftDiscount.minQty}</b>} 个起每个减 {editing ? <input aria-label="礼品袋每个减多少" inputMode="decimal" onChange={(event) => updateRule({ giftDiscount: { ...draft.rules.giftDiscount, discount: event.target.value } })} value={draft.rules.giftDiscount.discount} /> : <b>{money(shown.rules.giftDiscount.discount)}</b>}</p>
          </section>
          <section className="sales-price-card" aria-label="丝网印刷">
            <header><h2>丝网印刷</h2><small>元/个/色 · 几色翻几倍</small></header>
            <p className="sales-price-rule">手工：单面 <b>{MANUAL_PRINT_UNIT_PRICES.single}</b>，双面 <b>{MANUAL_PRINT_UNIT_PRICES.double}</b>（版费另收）</p>
            <div className="sales-price-tiers" role="table" aria-label="机印分档">{LARGE_MACHINE_PRINT_TIERS.map((tier) => <div key={tier.label} role="row"><span role="cell">{tier.label}</span><b role="cell">{tier.unitPrice}</b></div>)}</div>
            <p className="sales-price-hint">机印按下单数量定档，单面、双面同价。来料加工只收丝印费，按丝印工报的实际产量收。印刷价改动请找技术。</p>
          </section>
        </div>
      </div> : null}
    </section>
    <aside className="sales-price-history" aria-label="改价记录">
      <header><HistoryOutlined /><h2>改价记录</h2></header>
      <div className="sales-price-history-list">{(data?.history ?? []).length ? data.history.map((version) => <article className={version.status === "active" && version.id === current?.id ? "active" : ""} key={version.id}>
        <div><strong>第 {version.versionNo} 版</strong><span>{version.status === "active" && version.id === current?.id ? "生效中" : "已停用"}</span></div>
        <small>{dateText(version.effectiveFrom)}{version.createdByName ? ` · ${version.createdByName}` : ""}</small>
        {version.changeSummary ? <p>{version.changeSummary}</p> : null}
        <ul>{version.changes.slice(0, 6).map((change) => <li key={change.text}>{change.text}</li>)}{version.changes.length > 6 ? <li>…共 {version.changes.length} 处</li> : null}</ul>
      </article>) : <p className="sales-price-hint">还没有改价记录。</p>}</div>
    </aside>
  </div>;
}

function PriceSection({ section, items, original, editing, onUpdate, onRemove, onAddRow, onAddCell }) {
  const rows = buildSectionRows(items, section);
  const originalPrice = new Map(original.map((item) => [`${item.styleKey}|${normalizeSalesPriceSizeKey(item.sizeKey)}`, Number(item.bagPrice)]));
  const columns = `minmax(0, 1.4fr) minmax(0, 1.1fr) ${section.columns.map(() => "minmax(64px, 0.8fr)").join(" ")}${editing ? " 28px" : ""}`;
  return <section className="sales-price-card" aria-label={section.title}>
    <header><h2>{section.title}</h2><small>{section.note ? `${section.note} · ` : ""}元/个 · 宽×高×侧 cm</small></header>
    <div className="sales-price-table" role="table" aria-label={`${section.title}价格`}>
      <div className="sales-price-row head" role="row" style={{ gridTemplateColumns: columns }}><span role="columnheader">品名</span><span role="columnheader">规格</span>{section.columns.map((column) => <span className="num" key={column.styleKey} role="columnheader">{column.label}</span>)}{editing ? <span /> : null}</div>
      {rows.map((row) => {
        const first = row.cells[section.columns[0].styleKey] ?? Object.values(row.cells)[0];
        return <div className="sales-price-row" key={row.key} role="row" style={{ gridTemplateColumns: columns }}>
          <span role="cell" title={row.label}>{editing && first?.isNew && section.key !== "gift" ? <input aria-label={`${section.title}新行品名`} onChange={(event) => Object.values(row.cells).forEach((cell) => onUpdate(cell, { label: event.target.value }))} placeholder="品名" value={first.label} /> : row.label || "（未命名）"}</span>
          <span role="cell">{editing && first?.isNew ? <input aria-label={`${section.title}新行规格`} onChange={(event) => Object.values(row.cells).forEach((cell) => onUpdate(cell, { sizeKey: event.target.value }))} placeholder="30*37*10" value={first.sizeKey} /> : formatSalesPriceSize(row.sizeKey)}</span>
          {section.columns.map((column) => {
            const cell = row.cells[column.styleKey];
            if (!cell) return <span className="num muted" key={column.styleKey} role="cell">{editing && row.sizeKey ? <button aria-label={`给 ${row.label} ${formatSalesPriceSize(row.sizeKey)} 加${column.label}价`} className="sales-price-add" onClick={() => onAddCell(section, row, column)} type="button">+</button> : "—"}</span>;
            const before = originalPrice.get(`${cell.styleKey}|${normalizeSalesPriceSizeKey(cell.sizeKey)}`);
            const changed = editing && Number(cell.bagPrice) !== before;
            return <span className={`num${changed ? " changed" : ""}`} key={column.styleKey} role="cell">{editing
              ? <input aria-label={`${row.label} ${formatSalesPriceSize(row.sizeKey || cell.sizeKey)} ${column.label}`} inputMode="decimal" onChange={(event) => onUpdate(cell, { bagPrice: event.target.value })} value={cell.bagPrice} />
              : <>{money(cell.bagPrice)}{cell.sizeKey === "30*30" && cell.styleKey === "福" ? <small>只限福</small> : null}</>}</span>;
          })}
          {editing ? <button aria-label={`删除 ${row.label} ${formatSalesPriceSize(row.sizeKey)}`} className="sales-price-remove" onClick={() => Object.values(row.cells).forEach((cell) => onRemove(cell))} type="button">×</button> : null}
        </div>;
      })}
    </div>
    {editing ? <button className="sales-price-add" onClick={() => onAddRow(section)} type="button"><PlusOutlined />加一个尺寸</button> : null}
  </section>;
}
