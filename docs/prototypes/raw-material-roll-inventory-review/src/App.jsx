import { receivingReceiptTab } from "../../../../src/domain/officeRawMaterialInboundFlow.js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppstoreOutlined,
  BellOutlined,
  BookOutlined,
  DownOutlined,
  DollarCircleOutlined,
  FileTextOutlined,
  HomeOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  ReconciliationOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  SettingOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import {
  defaultPermissionContext,
  getDefaultWorkspaceView,
  getVisiblePcNavGroups,
  getVisibleRawMaterialViews,
  getVisibleWorkspaceViews,
  hasEffectivePermission,
  navViewMap,
  pcNavGroups,
  viewNavMap,
} from "./navigation.js";
import { BusinessWorkspace } from "./BusinessWorkspaces.jsx";
import { RawMaterialCostWorkspace } from "./RawMaterialCostWorkspace.jsx";
import { RawMaterialStockOperationsDialog } from "./RawMaterialStockOperationsDialog.jsx";
import { RawMaterialPurchasePanel } from "../../../../src/features/raw-materials/RawMaterialPurchasePanel.jsx";
import { getUiActionState } from "../../../../src/auth/seedPermissions.js";
import { RawMaterialReceiveDialog } from "../../../../src/features/raw-materials/RawMaterialReceiveDialog.jsx";
import { RawMaterialSupplierColorMappingDialog } from "../../../../src/features/raw-materials/RawMaterialSupplierColorMappingDialog.jsx";
import { ColorChip, FACTORY_COLORS, RAW_MATERIAL_COLOR_NAMES } from "./FactoryColor.jsx";
import {
  buildInventoryWidthOptions,
  compactRollCode,
  compactSupplierName,
  resolveInventoryRollStatus,
  resolveRollSpecification,
  sortInventoryRollsByWidth,
} from "./roll-inventory-presentation.js";
import { useFormalDesktopWorkspace } from "./useFormalDesktopWorkspace.js";
import { ReceiptWorkspace } from "./ReceiptWorkspace.jsx";
import { CollectionFeedback, EmptyWorkspace, WorkspaceErrorBoundary } from "./WorkspaceFeedback.jsx";
import "./workspace-feedback.css";
import { GlobalSearch } from "./GlobalSearch.jsx";

function buildInventoryRolls(inbounds = []) {
  return inbounds.flatMap((inbound) => (inbound.rolls || []).map((roll) => {
    const resolvedSpec = resolveRollSpecification(inbound, roll);
    return {
      id: roll.id,
      color: roll.factoryColor || roll.supplierColor || inbound.factoryColor || inbound.supplierColor || "颜色待确认",
      width: resolvedSpec.widthLabel,
      widthCm: resolvedSpec.widthCm,
      gramWeight: resolvedSpec.gramWeightLabel,
      weight: Number(roll.remainingMachineSideWeightKg || roll.leftoverReviewedWeightKg || roll.weightKg || 0),
      materialCategory: resolvedSpec.materialCategory,
      materialUsage: resolvedSpec.materialUsage || "用途待确认",
      unitLabel: inbound.unit === "件" ? "件" : "卷",
      status: resolveInventoryRollStatus(inbound, roll),
      supplier: inbound.supplierName || "供应商待确认",
      date: String(inbound.receivedAt || "").slice(0, 10),
      location: roll.location || (roll.machineId ? `${roll.machineId}机边` : inbound.location || "库位待确认"),
      source: inbound.id,
      spec: resolvedSpec.fullLabel,
    };
  })).filter((roll) => roll.id && roll.status);
}

const formatWeight = (value) => `${value.toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}kg`;
const formatInventoryRollAmount = (roll) => roll.weight > 0 ? formatWeight(roll.weight) : "待补重量";
function summarizeInventory(sourceRolls) {
  const summarize = (state) => {
    const stateRolls = sourceRolls.filter((roll) => roll.status === state);
    return { count: stateRolls.length, weight: stateRolls.reduce((sum, roll) => sum + roll.weight, 0) };
  };
  return { available: summarize("可用"), machineSide: summarize("机边领用"), review: summarize("余料待复核") };
}

function InventoryStatusCards({ summary }) {
  return <div aria-label="卷料状态概览" className="dock-status-cards" role="list">
    <div className="dock-status-card available" role="listitem"><span className="dock-status-line"><span className="dock-status-label">可用</span><span className="dock-status-value"><strong>{summary.available.count}</strong>卷/件</span><small>{summary.available.count > 0 ? formatWeight(summary.available.weight) : "暂无"}</small></span></div>
    <div className="dock-status-card machine-side" role="listitem"><span className="dock-status-line"><span className="dock-status-label">机边</span><span className="dock-status-value"><strong>{summary.machineSide.count}</strong>卷</span><small>{summary.machineSide.count > 0 ? formatWeight(summary.machineSide.weight) : "暂无"}</small></span></div>
    <div className="dock-status-card review" role="listitem"><span className="dock-status-line"><span className="dock-status-label">余料待复核</span><span className="dock-status-value"><strong>{summary.review.count}</strong>卷</span></span></div>
  </div>;
}

function buildDistribution(sourceRolls) {
  const groups = new Map();
  sourceRolls.filter((roll) => roll.status === "可用").forEach((roll) => {
    if (!groups.has(roll.width)) groups.set(roll.width, new Map());
    const colors = groups.get(roll.width);
    const current = colors.get(roll.color) || { color: roll.color, countValue: 0, weightValue: 0 };
    current.countValue += 1;
    current.weightValue += roll.weight;
    colors.set(roll.color, current);
  });

  const widthOrder = buildInventoryWidthOptions(sourceRolls).slice(1).filter((width) => groups.has(width));
  return widthOrder.map((width) => {
    const unit = width.includes("把条") ? "件" : "卷";
    const items = Array.from(groups.get(width).values());
    const maxWeight = Math.max(...items.map((item) => item.weightValue));
    const maxCount = Math.max(...items.map((item) => item.countValue));
    const countValue = items.reduce((sum, item) => sum + item.countValue, 0);
    const weightValue = items.reduce((sum, item) => sum + item.weightValue, 0);
    return {
      width,
      total: weightValue > 0 ? `${countValue}${unit} / ${formatWeight(weightValue)}` : `${countValue}${unit}`,
      items: items.map((item) => ({
        color: item.color,
        count: item.weightValue > 0 ? `${item.countValue}${unit} / ${formatWeight(item.weightValue)}` : `${item.countValue}${unit}`,
        percent: Math.max(18, Math.round(((maxWeight > 0 ? item.weightValue / maxWeight : item.countValue / maxCount) || 0) * 100)),
      })),
    };
  });
}

const pcNavIcons = {
  home: HomeOutlined,
  orders: ReconciliationOutlined,
  materials: FileTextOutlined,
  production: ToolOutlined,
  inventory: AppstoreOutlined,
  finance: DollarCircleOutlined,
  master: BookOutlined,
  system: SettingOutlined,
};

function Sidebar({ activeNavId, expandedGroups, onNavigate, onToggleGroup, permissionContext, unhandledTodoCount = 0 }) {
  const visibleGroups = getVisiblePcNavGroups(permissionContext);
  const activeItemRef = useRef(null);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeNavId]);

  return <aside className="sidebar">
    <div className="brand">
      <img
        alt="袋袋赢 BAGWIN"
        className="brand-logo"
        height="205"
        src="/brand/BAGWIN_domestic_horizontal_color.svg"
        width="630"
      />
    </div>
    <nav aria-label="主导航" className="pc-business-tree">
      {visibleGroups.map((group) => {
        const Icon = pcNavIcons[group.icon] || AppstoreOutlined;
        const expanded = expandedGroups.has(group.id);
        return <section className={`pc-nav-group${expanded ? " expanded" : ""}`} data-nav-group={group.id} key={group.id}>
          <button aria-expanded={expanded} className="pc-nav-group-button" onClick={() => onToggleGroup(group.id)} type="button"><Icon /><span>{group.label}</span><DownOutlined className="pc-nav-caret" /></button>
          {expanded ? <div className="pc-nav-children">{group.items.map((item) => {
            const active = activeNavId === item.id;
            return <button aria-current={active ? "page" : undefined} className={active ? "active" : ""} data-nav-id={item.id} key={item.id} onClick={() => onNavigate(item.id)} ref={active ? activeItemRef : undefined} type="button"><span>{item.label}</span>{item.countSource === "unhandledTodos" && unhandledTodoCount > 0 ? <b>{unhandledTodoCount}</b> : null}</button>;
          })}</div> : null}
        </section>;
      })}
    </nav>
  </aside>;
}

function Topbar({ allowedNavIds, onCreateOrder, onSearchSelect, onSearchRequest, permissionContext, searchData, searchPending = false, searchError = "", unhandledTodoCount = null }) {
  const account = permissionContext.user ?? defaultPermissionContext.user;
  const canCreateOrder = hasEffectivePermission(permissionContext, "order.create");
  return <header className="topbar">
    <GlobalSearch allowedNavIds={allowedNavIds} data={searchData} onSelect={onSearchSelect} onRequestData={onSearchRequest} pending={searchPending} error={searchError} />
    <div className="topbar-actions">
      {canCreateOrder ? <button className="primary top-new-order" onClick={onCreateOrder} type="button"><PlusOutlined />新建订单</button> : null}
      <button aria-label={unhandledTodoCount === null ? "查看公共待办" : unhandledTodoCount > 0 ? `通知：${unhandledTodoCount} 条未处理待办` : "通知：没有未处理待办"} className="notification" type="button"><BellOutlined />{unhandledTodoCount > 0 ? <b>{unhandledTodoCount}</b> : null}</button>
      <div aria-label={`当前账号：${account.displayName}，${account.roleLabel || "按账号权限"}`} className="account" role="status"><span><strong>{account.displayName}</strong><small>{account.roleLabel || "按账号权限"}</small></span></div>
    </div>
  </header>;
}

function StatusText({ children }) { return <span className={`status status-${children}`}>{children}</span>; }
function SelectField({ label, value, onChange, options }) {
  return <label className="select-field"><span className="sr-only">{label}</span><select aria-label={label} onChange={(event) => onChange(event.target.value)} value={value}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function DistributionRail({ activeBucket, distributionGroups, machineSideCount, onBucketChange, selectedRoll, onOpenSource, onOpenOperations, formal }) {
  return <aside className="distribution-rail" aria-label="可用库存分布">
    <section className="distribution-panel">
      <header><div><h2>可用库存分布</h2><small>不含机边库存</small></div><InfoCircleOutlined /></header>
      <div className="distribution-scroll">
        {distributionGroups.length ? distributionGroups.map((group) => <section className="distribution-group" key={group.width}>
          <div className="distribution-group-head"><strong>{group.width}</strong><span>{group.total}</span></div>
          {group.items.map((item) => {
            const key = `${group.width}::${item.color}`;
            const active = activeBucket === key;
            return <button aria-pressed={active} className={`distribution-item${active ? " active" : ""}`} key={item.color} onClick={() => onBucketChange(active ? "" : key)} type="button">
              <span className="distribution-label"><ColorChip color={item.color} /><b>{item.color}</b></span>
              <span className="distribution-bar"><i style={{ background: FACTORY_COLORS[item.color], width: `${item.percent}%` }} /></span>
              <span className="distribution-count">{item.count}</span>
            </button>;
          })}
        </section>) : <div className="distribution-empty"><strong>当前筛选没有可用卷料</strong><span>清除状态或库位筛选后再看分布</span></div>}
      </div>
      <button className="machine-side-disclosure" type="button"><span><RightOutlined />机边库存（不计入可用）</span><b>{machineSideCount}卷</b></button>
    </section>
    <section className="trace-panel">
      <header><h2>选中卷料来源</h2></header>
      {selectedRoll ? <><dl>
        <div className="trace-wide"><dt>卷码</dt><dd>{selectedRoll.id}</dd></div>
        <div className="trace-wide"><dt>入库日期</dt><dd>{selectedRoll.date}</dd></div>
        <div><dt>颜色</dt><dd className="trace-color"><ColorChip color={selectedRoll.color} />{selectedRoll.color}</dd></div>
        <div><dt>规格</dt><dd title={selectedRoll.spec}>{selectedRoll.spec}</dd></div>
        <div><dt>原料用途</dt><dd>{selectedRoll.materialUsage}</dd></div>
        <div className="trace-wide"><dt>来源票据</dt><dd>{selectedRoll.source}</dd></div>
        <div className="trace-wide"><dt>供应商</dt><dd title={selectedRoll.supplier}>{selectedRoll.supplier}</dd></div>
      </dl>
      <button className="text-action" onClick={onOpenSource} type="button">查看来源票据 <RightOutlined /></button></> : <div className="distribution-empty"><strong>暂无可选卷料</strong><span>选中卷料后查看对应的来源票据。</span></div>}
      {selectedRoll && onOpenOperations ? <button className="text-action" onClick={() => onOpenOperations(selectedRoll)} type="button">领料 / 消耗 <RightOutlined /></button> : null}
    </section>
    {formal?.authState ? <RawMaterialPurchasePanel authState={formal.authState} currentUser={formal.permissionContext?.user} /> : null}
  </aside>;
}

function RollInventory({ onOpenSource, onOpenOperations, formal, sourceRolls = [] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("可用");
  const [width, setWidth] = useState("全部宽幅");
  const [color, setColor] = useState("全部颜色");
  const [location, setLocation] = useState("全部库位");
  const [selectedId, setSelectedId] = useState(() => sourceRolls[0]?.id || "");
  const [activeBucket, setActiveBucket] = useState("");
  const [page, setPage] = useState(1);

  const filteredRolls = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return sourceRolls.filter((roll) => {
      if (keyword && !`${roll.id}${roll.color}${roll.spec}${roll.supplier}${roll.source}`.toLowerCase().includes(keyword)) return false;
      if (status !== "全部状态" && roll.status !== status) return false;
      if (width !== "全部宽幅" && roll.width !== width) return false;
      if (color !== "全部颜色" && roll.color !== color) return false;
      if (location !== "全部库位" && roll.location !== location) return false;
      return true;
    });
  }, [color, location, query, sourceRolls, status, width]);

  const matchingRolls = useMemo(() => {
    const [bucketWidth, bucketColor] = activeBucket ? activeBucket.split("::") : ["", ""];
    const matching = !bucketWidth
      ? filteredRolls
      : filteredRolls.filter((roll) => roll.status === "可用" && roll.width === bucketWidth && roll.color === bucketColor);
    return sortInventoryRollsByWidth(matching);
  }, [activeBucket, filteredRolls]);

  const inventorySummary = useMemo(() => summarizeInventory(sourceRolls), [sourceRolls]);

  const distributionGroups = useMemo(() => buildDistribution(filteredRolls), [filteredRolls]);
  const widthOptions = useMemo(() => buildInventoryWidthOptions(sourceRolls), [sourceRolls]);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(matchingRolls.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRolls = matchingRolls.slice((safePage - 1) * pageSize, safePage * pageSize);

  const selectedRoll = visibleRolls.find((roll) => roll.id === selectedId) || visibleRolls[0] || null;
  const setFilter = (setter) => (value) => { setter(value); setPage(1); setActiveBucket(""); };
  const setBucket = (value) => { setActiveBucket(value); setPage(1); };
  const resetFilters = () => { setQuery(""); setStatus("可用"); setWidth("全部宽幅"); setColor("全部颜色"); setLocation("全部库位"); setActiveBucket(""); setPage(1); };
  const hasActiveFilters = Boolean(query.trim() || status !== "可用" || width !== "全部宽幅" || color !== "全部颜色" || location !== "全部库位" || activeBucket);

  return <div className="inventory-workbench">
    <section className={`ledger-panel${hasActiveFilters ? " has-filter-feedback" : ""}`}>
      <div className="filter-row">
        <label className="roll-search"><SearchOutlined /><input onChange={(event) => setFilter(setQuery)(event.target.value)} placeholder="搜索卷码 / 颜色 / 宽幅 / 供应商" value={query} /></label>
        <SelectField label="可用状态" onChange={setFilter(setStatus)} options={["全部状态", "可用", "机边领用", "余料待复核"]} value={status} />
        <SelectField label="宽幅" onChange={setFilter(setWidth)} options={widthOptions} value={width} />
        <SelectField label="厂内颜色" onChange={setFilter(setColor)} options={["全部颜色", ...RAW_MATERIAL_COLOR_NAMES]} value={color} />
        <SelectField label="库位" onChange={setFilter(setLocation)} options={["全部库位", "原材料仓库", "1号机边", "2号机边", "余料区"]} value={location} />
      </div>
      {hasActiveFilters ? <div aria-live="polite" className="filter-feedback"><span>已筛选 {matchingRolls.length} 条</span>{activeBucket ? <button className="active-bucket" onClick={() => setBucket("")} type="button">{activeBucket.replace("::", " · ")} ×</button> : null}<button aria-label="重置筛选" className="reset-filter" onClick={resetFilters} type="button"><ReloadOutlined />重置</button></div> : null}
      <div className="roll-table" role="table" aria-label="物理卷料台账">
        <div className="roll-row roll-head" role="row"><span aria-sort="ascending" role="columnheader" title="默认按宽幅从小到大排列">规格（宽幅/克重）</span><span role="columnheader">厂内颜色</span><span role="columnheader">当前重量</span><span role="columnheader">库位</span><span role="columnheader">状态</span><span role="columnheader">供应商 / 入库日期</span><span role="columnheader">卷码（追溯）</span></div>
        <div className="roll-table-body">
          {visibleRolls.length ? visibleRolls.map((roll) => <button aria-pressed={selectedRoll?.id === roll.id} className={`roll-row${selectedRoll?.id === roll.id ? " selected" : ""}`} key={roll.id} onClick={() => setSelectedId(roll.id)} role="row" type="button">
            <span className="roll-spec-cell" role="cell"><strong>{roll.width}</strong><small>{roll.gramWeight}</small></span><span className="roll-color" role="cell"><ColorChip color={roll.color} />{roll.color}</span><span className="weight" role="cell">{formatInventoryRollAmount(roll)}</span><span role="cell">{roll.location}</span><span role="cell"><StatusText>{roll.status}</StatusText></span><span className="supplier-cell" role="cell" title={roll.supplier}><b>{compactSupplierName(roll.supplier)}</b><small>{roll.date}</small></span><span className="roll-id" role="cell" title={roll.id}>{compactRollCode(roll.id)}</span>
          </button>) : <EmptyWorkspace error={Boolean(formal.meta.collections?.rawMaterialInbounds?.error)} title={formal.meta.collections?.rawMaterialInbounds?.error ? "卷料读取失败" : formal.meta.collections?.rawMaterialInbounds?.loading ? "正在读取卷料…" : hasActiveFilters ? "没有符合条件的卷料" : "尚无可用卷料"} description={hasActiveFilters ? "调整颜色、宽幅或状态后继续查看。" : "完成核对、打印和贴标入库后，卷料才会出现在这里。"} actionLabel={formal.meta.collections?.rawMaterialInbounds?.error ? "重新读取" : hasActiveFilters ? "清除筛选" : undefined} onAction={formal.meta.collections?.rawMaterialInbounds?.error ? () => void formal.actions.refreshAll() : hasActiveFilters ? resetFilters : undefined} />}
        </div>
      </div>
      <footer className="table-footer"><span>共 {matchingRolls.length} 条</span><div><button type="button">20 条/页 <DownOutlined /></button><button aria-label="上一页" disabled={safePage === 1} onClick={() => setPage(Math.max(1, safePage - 1))} type="button">‹</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button aria-current={safePage === pageNumber ? "page" : undefined} className={safePage === pageNumber ? "current" : ""} key={pageNumber} onClick={() => setPage(pageNumber)} type="button">{pageNumber}</button>)}<button aria-label="下一页" disabled={safePage === pageCount} onClick={() => setPage(Math.min(pageCount, safePage + 1))} type="button">›</button><span>前往</span><input aria-label="前往页码" max={pageCount} min="1" onChange={(event) => setPage(Math.min(pageCount, Math.max(1, Number(event.target.value) || 1)))} type="number" value={safePage} /><span>页</span></div></footer>
    </section>
    <DistributionRail activeBucket={activeBucket} distributionGroups={distributionGroups} machineSideCount={inventorySummary.machineSide.count} onBucketChange={setBucket} onOpenSource={() => onOpenSource(selectedRoll)} onOpenOperations={onOpenOperations} formal={formal} selectedRoll={selectedRoll} />
  </div>;
}

function SourceDialog({ roll, onClose }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><section aria-labelledby="source-title" aria-modal="true" className="receive-dialog source-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog"><header><div><span>来源追溯</span><h2 id="source-title">{roll.source}</h2></div><button aria-label="关闭" onClick={onClose} type="button">×</button></header><dl><div><dt>当前卷码</dt><dd>{roll.id}</dd></div><div><dt>供应商</dt><dd>{roll.supplier}</dd></div><div><dt>供应商单号</dt><dd>未提供</dd></div><div><dt>OCR 来源</dt><dd>第 1 行 · 第 1 卷</dd></div><div><dt>权威卷料事实</dt><dd>{roll.color} · {roll.spec} · {formatInventoryRollAmount(roll)}</dd></div></dl><p className="source-disclosure">票据与 OCR 原文仅用于追溯；卷料库存以逐卷人工确认后的颜色、规格和重量为准。</p></section></div>;
}

export function App({ permissionContext = defaultPermissionContext }) {
  const formal = useFormalDesktopWorkspace();
  const resolvedPermissionContext = formal.permissionContext || permissionContext;
  // 导航角标和铃铛与「公共待办 · 未处理」列表使用同一规则和同一份服务器数据，不再写死数字。
  const unhandledTodoCount = formal.meta.collections?.todos?.hasLoaded ? formal.data.todos.filter(todo => !todo.handled).length : null;
  const visibleViews = useMemo(() => getVisibleWorkspaceViews(resolvedPermissionContext), [resolvedPermissionContext]);
  const allowedNavIds = useMemo(
    () => getVisiblePcNavGroups(resolvedPermissionContext).flatMap((group) => group.items.map((item) => item.id)),
    [resolvedPermissionContext],
  );
  const visibleRawMaterialViews = useMemo(() => getVisibleRawMaterialViews(resolvedPermissionContext), [resolvedPermissionContext]);
  const [view, setView] = useState(() => {
    const hashNavId = window.location.hash.replace(/^#/, "");
    const hashView = navViewMap[hashNavId === "spec-inventory" ? "general-prices" : hashNavId];
    return visibleViews.includes(hashView) ? hashView : getDefaultWorkspaceView(permissionContext);
  });
  const [expandedGroups, setExpandedGroups] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem("erp.pc.expandedGroups.v1")); if (Array.isArray(saved)) return new Set(saved.filter(id => pcNavGroups.some(group => group.id === id))); } catch { /* Preferences cannot block the workbench. */ }
    const navId = window.location.hash.slice(1) || viewNavMap[getDefaultWorkspaceView(permissionContext)];
    return new Set(pcNavGroups.filter(group => group.items.some(item => item.id === navId)).map(group => group.id));
  });
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiptFocusId, setReceiptFocusId] = useState("");
  const [productionFocusId,setProductionFocusId] = useState("");
  const [receiveBusy, setReceiveBusy] = useState(false);
  const receiveBusyRef = useRef(false);
  const [receiveError, setReceiveError] = useState("");
  const [sourceRoll, setSourceRoll] = useState(null);
  const [stockOperation, setStockOperation] = useState(null);
  const [colorMappingOpen, setColorMappingOpen] = useState(false);
  const [workspaceFocus, setWorkspaceFocus] = useState(null);
  const searchToken = useRef(0);
  const activeView = visibleViews.includes(view) ? view : getDefaultWorkspaceView(permissionContext);
  const activeNavId = viewNavMap[activeView] || "";
  const isRawMaterialView = visibleRawMaterialViews.includes(activeView);
  useEffect(() => { formal.actions.setActiveView(activeNavId); }, [activeNavId, formal.actions.setActiveView]);
  useEffect(() => { try { localStorage.setItem("erp.pc.expandedGroups.v1", JSON.stringify([...expandedGroups])); } catch { /* Optional preference. */ } }, [expandedGroups]);
  const canManageSupplierColors = hasEffectivePermission(
    resolvedPermissionContext,
    "master_data.raw_material_color.manage",
  );
  const canOperateStock = !getUiActionState(resolvedPermissionContext, "rawMaterial", "机边领料").disabled
    || !getUiActionState(resolvedPermissionContext, "rawMaterial", "确认消耗").disabled;
  const currentInventoryRolls = useMemo(() => buildInventoryRolls(formal.data.rawMaterialInbounds), [formal.data.rawMaterialInbounds]);
  const currentInventorySummary = useMemo(() => summarizeInventory(currentInventoryRolls), [currentInventoryRolls]);
  useEffect(() => {
    const handleHashChange = () => {
      if (formal.orderEntryWritePending) { window.history.replaceState(null, "", `#${activeNavId}`); return; }
      const hashNavId = window.location.hash.replace(/^#/, "");
      const nextView = navViewMap[hashNavId === "spec-inventory" ? "general-prices" : hashNavId];
      if (nextView && visibleViews.includes(nextView)) setView(nextView);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [visibleViews, formal.orderEntryWritePending, activeNavId]);
  const toggleGroup = (groupId) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };
  const navigate = (navId, focus = {}) => {
    if (formal.orderEntryWritePending) return;
    const normalizedNavId = navId === "spec-inventory" ? "general-prices" : navId;
    const nextView = navViewMap[normalizedNavId];
    const allowed = Boolean(nextView && visibleViews.includes(nextView));
    setWorkspaceFocus(allowed && focus.preserveWorkspaceFocus && focus.workspaceFocus?.navId === normalizedNavId ? focus.workspaceFocus : null);
    setProductionFocusId(focus.productionTaskId || "");
    if (allowed) {
      setView(nextView);
      const group = pcNavGroups.find(item => item.items.some(child => child.id === normalizedNavId));
      if (group) setExpandedGroups(current => new Set([...current, group.id]));
      window.history.replaceState(null, "", `#${normalizedNavId}`);
    }
  };
  const openSearchResult = (result) => {
    if (!result?.navId || formal.orderEntryWritePending) return;
    searchToken.current += 1;
    navigate(result.navId, {
      preserveWorkspaceFocus: true,
      workspaceFocus: {
        token: `${result.kind}:${result.recordId}:${searchToken.current}`,
        navId: result.navId,
        recordId: result.recordId,
        query: result.query,
      },
    });
    setExpandedGroups((current) => {
      const group = pcNavGroups.find((item) => item.items.some((child) => child.id === result.navId));
      if (!group || current.has(group.id)) return current;
      const next = new Set(current);
      next.add(group.id);
      return next;
    });
  };
  const openReceive = async () => {
    setReceiveError(""); setReceiveOpen(true); setReceiveBusy(true);
    try { const result = await formal.actions.readCollection("rawMaterialInbounds"); if (result.source !== "api") setReceiveError("送货单位暂时无法读取，请关闭后重试。"); }
    finally { setReceiveBusy(false); }
  };
  const recognizeReceiptPages = async (request) => {
    if (receiveBusyRef.current) return;
    receiveBusyRef.current = true;
    setReceiveBusy(true);
    setReceiveError("");
    try {
      const result = await formal.actions.recognizeRawMaterialPages(request);
      if (result.source !== "api" || !result.inbound?.id) {
        setReceiveError(result.error?.message || "正式 OCR 接口没有生成草稿。");
        return;
      }
      formal.actions.setReceiptQuery({ keyword: "", receiptStage: receivingReceiptTab(result.inbound) || "全部" });
      setReceiptFocusId(result.inbound.id);
      setReceiveOpen(false);
      navigate("material-receiving");
    } catch (error) {
      setReceiveError(error?.message || "送货单文件读取失败。");
    } finally {
      receiveBusyRef.current = false;
      setReceiveBusy(false);
    }
  };

  return <div className="app-shell" data-active-view={activeView} data-user-id={resolvedPermissionContext.user?.userId || ""}>
    <Sidebar activeNavId={activeNavId} expandedGroups={expandedGroups} onNavigate={navigate} onToggleGroup={toggleGroup} permissionContext={resolvedPermissionContext} unhandledTodoCount={unhandledTodoCount} /><Topbar allowedNavIds={allowedNavIds} onCreateOrder={() => navigate("order-entry")} onSearchSelect={openSearchResult} permissionContext={resolvedPermissionContext} onSearchRequest={formal.actions.ensureSearchData} searchData={formal.data} searchPending={formal.meta.search.loading} searchError={formal.meta.search.error} unhandledTodoCount={unhandledTodoCount} />
    <main className={`page${isRawMaterialView ? "" : " business-page"}${activeView === "收货录入" ? " receiving-main-page" : ""}`}>
      {activeView !== "收货录入" ? <CollectionFeedback state={{ loading: formal.meta.loading, error: Object.keys(formal.meta.errors).length > 0, hasLoaded: formal.meta.hasLoaded }} label={activeView} onRetry={() => void formal.actions.refreshAll()} /> : null}
      {formal.orderEntryWritePending ? <div className="formal-sync-banner" role="status">本次操作结果正在核对，请先确认结果；结果未明时按原内容重试。</div> : null}
      {isRawMaterialView && activeView !== "收货录入" ? <header className="workbench-dock">
        <div className="dock-primary">{visibleRawMaterialViews.includes("卷料库存") ? <InventoryStatusCards summary={currentInventorySummary} /> : null}</div>
        <div className="dock-actions">
          {canManageSupplierColors ? <button className="factory-color-entry" onClick={() => setColorMappingOpen(true)} type="button">厂家颜色资料</button> : null}
          <button className="page-refresh" onClick={() => void formal.actions.refreshAll()} type="button"><ReloadOutlined />刷新</button>
          {isRawMaterialView && activeView !== "收货录入" && visibleRawMaterialViews.includes("收货录入") ? <button className="receive-entry" onClick={openReceive} type="button"><PlusOutlined />收货录入</button> : null}
        </div>
      </header> : null}
      <WorkspaceErrorBoundary workspaceKey={activeNavId}>
      {activeView !== "收货录入" && (formal.meta.blockingError || formal.meta.pendingInitial) ? <EmptyWorkspace error={formal.meta.blockingError} title={formal.meta.blockingError ? `${activeView}暂时无法读取` : `正在读取${activeView}…`} description={formal.meta.blockingError ? "单据没有被清空。请检查连接后重新读取，也可以先使用其他功能。" : "读取完成后会显示当前记录。"} actionLabel={formal.meta.blockingError ? "重新读取" : undefined} onAction={formal.meta.blockingError ? () => void formal.actions.refreshAll() : undefined} /> : <>
      {activeView === "卷料库存" ? <RollInventory formal={formal} onOpenOperations={canOperateStock ? setStockOperation : undefined} onOpenSource={setSourceRoll} sourceRolls={currentInventoryRolls} /> : null}
      {activeView === "收货录入" && import.meta.env.DEV && import.meta.env.VITE_ERP_REVIEW_DATA_LABEL ? <p className="workspace-data-snapshot">{import.meta.env.VITE_ERP_REVIEW_DATA_LABEL}</p> : null}
      {activeView === "收货录入" ? <ReceiptWorkspace focusId={receiptFocusId} formal={formal} onOpenReceive={openReceive} onManageColors={canManageSupplierColors ? () => setColorMappingOpen(true) : undefined} /> : null}
      {activeNavId === "raw-material-cost" ? <RawMaterialCostWorkspace formal={formal} /> : null}
      {!isRawMaterialView && activeNavId !== "raw-material-cost" ? <BusinessWorkspace formal={formal} navId={activeNavId} onNavigate={navigate} productionFocusId={productionFocusId} workspaceFocus={workspaceFocus} /> : null}
      </>}
      </WorkspaceErrorBoundary>
    </main>
    {receiveOpen ? <RawMaterialReceiveDialog busy={receiveBusy} error={receiveError} inbounds={formal.data.rawMaterialInbounds} onClose={() => { if (!receiveBusyRef.current) setReceiveOpen(false); }} onRecognize={recognizeReceiptPages} /> : null}
    {sourceRoll ? <SourceDialog onClose={() => setSourceRoll(null)} roll={sourceRoll} /> : null}
    {stockOperation ? <RawMaterialStockOperationsDialog key={`${stockOperation.source}:${stockOperation.id}`} formal={formal} inboundId={stockOperation.source} rollId={stockOperation.id} onClose={() => setStockOperation(null)} /> : null}
    {colorMappingOpen ? <RawMaterialSupplierColorMappingDialog
      authState={formal.authState}
      currentUser={resolvedPermissionContext.user}
      onClose={() => setColorMappingOpen(false)}
    /> : null}
  </div>;
}
