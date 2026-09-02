import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppstoreOutlined,
  BellOutlined,
  BookOutlined,
  CameraOutlined,
  CheckCircleFilled,
  CheckOutlined,
  DownOutlined,
  DollarCircleOutlined,
  FileTextOutlined,
  FileImageOutlined,
  HomeOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReconciliationOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  SettingOutlined,
  TagOutlined,
  ToolOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  canConfirmRawMaterialAttachment,
  canPrintRawMaterialLabels,
  canReviewRawMaterialInbound,
} from "../../../../src/domain/rawMaterialInboundListState.js";
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
import { RawMaterialSupplierColorMappingDialog } from "../../../../src/features/raw-materials/RawMaterialSupplierColorMappingDialog.jsx";
import { ColorChip, FACTORY_COLORS, RAW_MATERIAL_COLOR_NAMES } from "./FactoryColor.jsx";
import {
  buildInventoryWidthOptions,
  compactRollCode,
  compactSupplierName,
  resolveInventoryRollStatus,
  resolveRollWidth,
  sortInventoryRollsByWidth,
} from "./roll-inventory-presentation.js";
import { useFormalDesktopWorkspace } from "./useFormalDesktopWorkspace.js";

function buildInventoryRolls(inbounds = []) {
  return inbounds.flatMap((inbound) => (inbound.rolls || []).map((roll) => {
    const resolvedWidth = resolveRollWidth(inbound, roll);
    return {
      id: roll.id,
      color: roll.factoryColor || inbound.factoryColor || inbound.supplierColor || "颜色待确认",
      width: resolvedWidth.label,
      widthCm: resolvedWidth.widthCm,
      weight: Number(roll.remainingMachineSideWeightKg || roll.leftoverReviewedWeightKg || roll.weightKg || 0),
      status: resolveInventoryRollStatus(inbound, roll),
      supplier: inbound.supplierName || "供应商待确认",
      date: String(inbound.receivedAt || "").slice(0, 10),
      location: roll.location || (roll.machineId ? `${roll.machineId}机边` : inbound.location || "库位待确认"),
      source: inbound.id,
      spec: roll.specDisplay || roll.spec || inbound.specDisplay || inbound.spec || "规格待确认",
    };
  })).filter((roll) => roll.id && roll.status);
}

const formatWeight = (value) => `${value.toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}kg`;
const formatMoney = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return "金额待确认";
  return `${amount < 0 ? "-" : ""}¥${Math.abs(amount).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function summarizeInventory(sourceRolls) {
  const summarize = (state) => {
    const stateRolls = sourceRolls.filter((roll) => roll.status === state);
    return { count: stateRolls.length, weight: stateRolls.reduce((sum, roll) => sum + roll.weight, 0) };
  };
  return { available: summarize("可用"), machineSide: summarize("机边领用"), review: summarize("余料待复核") };
}

function InventoryStatusCards({ summary }) {
  return <div aria-label="卷料状态概览" className="dock-status-cards" role="list">
    <div className="dock-status-card available" role="listitem"><span className="dock-status-line"><span className="dock-status-label">可用</span><span className="dock-status-value"><strong>{summary.available.count}</strong>卷/件</span><small>{formatWeight(summary.available.weight)}</small></span></div>
    <div className="dock-status-card machine-side" role="listitem"><span className="dock-status-line"><span className="dock-status-label">机边</span><span className="dock-status-value"><strong>{summary.machineSide.count}</strong>卷</span><small>{formatWeight(summary.machineSide.weight)}</small></span></div>
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
    const unit = width.includes("提手条") ? "件" : "卷";
    const items = Array.from(groups.get(width).values());
    const maxWeight = Math.max(...items.map((item) => item.weightValue));
    const countValue = items.reduce((sum, item) => sum + item.countValue, 0);
    const weightValue = items.reduce((sum, item) => sum + item.weightValue, 0);
    return {
      width,
      total: `${countValue}${unit} / ${formatWeight(weightValue)}`,
      items: items.map((item) => ({
        color: item.color,
        count: `${item.countValue}${unit} / ${formatWeight(item.weightValue)}`,
        percent: Math.max(18, Math.round((item.weightValue / maxWeight) * 100)),
      })),
    };
  });
}

const receiptTabs = ["待核对", "退货单", "待打印", "待贴标", "异常"];
const receiptFacts = (row = {}) => {
  const count = row.rollCount || row.rolls?.length || 0;
  const totalWeightKg = Number(row.totalWeightKg) || 0;
  return row.documentDirection === "supplier_return"
    ? `退回 ${count} 件 / ${formatWeight(totalWeightKg)}`
    : `${count}卷 / ${formatWeight(totalWeightKg)}`;
};
const receiptTabFor = (row = {}) => {
  const status = String(row.status || "");
  if (row.documentDirection === "supplier_return") return "退货单";
  if (row.duplicate || status.includes("异常")) return "异常";
  if (["已拍照待识别", "已识别待复核", "待补充/待确认"].includes(status)) return "待核对";
  if (status === "已复核待打印标签") return "待打印";
  if (["已打印待贴标", "部分贴标"].includes(status)) return "待贴标";
  return "";
};


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

function Sidebar({ activeNavId, expandedGroups, onNavigate, onToggleGroup, permissionContext }) {
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
            return <button aria-current={active ? "page" : undefined} className={active ? "active" : ""} data-nav-id={item.id} key={item.id} onClick={() => onNavigate(item.id)} ref={active ? activeItemRef : undefined} type="button"><span>{item.label}</span>{item.count ? <b>{item.count}</b> : null}</button>;
          })}</div> : null}
        </section>;
      })}
    </nav>
  </aside>;
}

function Topbar({ onCreateOrder, permissionContext }) {
  const account = permissionContext.user ?? defaultPermissionContext.user;
  const canCreateOrder = hasEffectivePermission(permissionContext, "order.create");
  return <header className="topbar">
    <label className="global-search"><SearchOutlined /><input aria-label="全局搜索" placeholder="搜索 客户 / 订单 / 尺寸 / 颜色 / 单据" /></label>
    <div className="topbar-actions">
      {canCreateOrder ? <button className="primary top-new-order" onClick={onCreateOrder} type="button"><PlusOutlined />新建订单</button> : null}
      <button aria-label="通知" className="notification" type="button"><BellOutlined /><b>8</b></button>
      <button className="account" type="button"><span><strong>{account.displayName}</strong><small>{account.roleLabel || "按账号权限"}</small></span><DownOutlined /></button>
    </div>
  </header>;
}

function StatusText({ children }) { return <span className={`status status-${children}`}>{children}</span>; }
function SelectField({ label, value, onChange, options }) {
  return <label className="select-field"><span className="sr-only">{label}</span><select aria-label={label} onChange={(event) => onChange(event.target.value)} value={value}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function DistributionRail({ activeBucket, distributionGroups, machineSideCount, onBucketChange, selectedRoll, onOpenSource }) {
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
        <div className="trace-wide"><dt>来源票据</dt><dd>{selectedRoll.source}</dd></div>
        <div className="trace-wide"><dt>供应商</dt><dd title={selectedRoll.supplier}>{selectedRoll.supplier}</dd></div>
      </dl>
      <button className="text-action" onClick={onOpenSource} type="button">查看来源票据 <RightOutlined /></button></> : <div className="distribution-empty"><strong>暂无可选卷料</strong><span>正式库存读取完成后再查看来源。</span></div>}
    </section>
  </aside>;
}

function RollInventory({ onOpenSource, sourceRolls = [] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部状态");
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

  const inventorySummary = useMemo(() => summarizeInventory(filteredRolls), [filteredRolls]);

  const distributionGroups = useMemo(() => buildDistribution(filteredRolls), [filteredRolls]);
  const widthOptions = useMemo(() => buildInventoryWidthOptions(sourceRolls), [sourceRolls]);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(matchingRolls.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRolls = matchingRolls.slice((safePage - 1) * pageSize, safePage * pageSize);

  const selectedRoll = visibleRolls.find((roll) => roll.id === selectedId) || visibleRolls[0] || matchingRolls[0] || sourceRolls[0];
  const setFilter = (setter) => (value) => { setter(value); setPage(1); setActiveBucket(""); };
  const setBucket = (value) => { setActiveBucket(value); setPage(1); };
  const resetFilters = () => { setQuery(""); setStatus("全部状态"); setWidth("全部宽幅"); setColor("全部颜色"); setLocation("全部库位"); setActiveBucket(""); setPage(1); };
  const hasActiveFilters = Boolean(query.trim() || status !== "全部状态" || width !== "全部宽幅" || color !== "全部颜色" || location !== "全部库位" || activeBucket);

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
        <div className="roll-row roll-head" role="row"><span aria-sort="ascending" role="columnheader" title="默认按宽幅从小到大排列">规格（宽幅）</span><span role="columnheader">厂内颜色</span><span role="columnheader">当前重量</span><span role="columnheader">库位</span><span role="columnheader">状态</span><span role="columnheader">供应商 / 入库日期</span><span role="columnheader">卷码（追溯）</span></div>
        <div className="roll-table-body">
          {visibleRolls.length ? visibleRolls.map((roll) => <button aria-pressed={selectedRoll.id === roll.id} className={`roll-row${selectedRoll.id === roll.id ? " selected" : ""}`} key={roll.id} onClick={() => setSelectedId(roll.id)} role="row" type="button">
            <span className="roll-spec-cell" role="cell"><strong>{roll.width}</strong><small>{roll.spec}</small></span><span className="roll-color" role="cell"><ColorChip color={roll.color} />{roll.color}</span><span className="weight" role="cell">{roll.weight.toFixed(1)} kg</span><span role="cell">{roll.location}</span><span role="cell"><StatusText>{roll.status}</StatusText></span><span className="supplier-cell" role="cell" title={roll.supplier}><b>{compactSupplierName(roll.supplier)}</b><small>{roll.date}</small></span><span className="roll-id" role="cell" title={roll.id}>{compactRollCode(roll.id)}</span>
          </button>) : <div className="empty-state"><SearchOutlined /><strong>没有符合条件的卷料</strong><button onClick={resetFilters} type="button">清除筛选</button></div>}
        </div>
      </div>
      <footer className="table-footer"><span>共 {matchingRolls.length} 条</span><div><button type="button">20 条/页 <DownOutlined /></button><button aria-label="上一页" disabled={safePage === 1} onClick={() => setPage(Math.max(1, safePage - 1))} type="button">‹</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button aria-current={safePage === pageNumber ? "page" : undefined} className={safePage === pageNumber ? "current" : ""} key={pageNumber} onClick={() => setPage(pageNumber)} type="button">{pageNumber}</button>)}<button aria-label="下一页" disabled={safePage === pageCount} onClick={() => setPage(Math.min(pageCount, safePage + 1))} type="button">›</button><span>前往</span><input aria-label="前往页码" max={pageCount} min="1" onChange={(event) => setPage(Math.min(pageCount, Math.max(1, Number(event.target.value) || 1)))} type="number" value={safePage} /><span>页</span></div></footer>
    </section>
    <DistributionRail activeBucket={activeBucket} distributionGroups={distributionGroups} machineSideCount={inventorySummary.machineSide.count} onBucketChange={setBucket} onOpenSource={() => onOpenSource(selectedRoll)} selectedRoll={selectedRoll} />
  </div>;
}

function receiptStageIndex(row = {}) {
  const hasLabelException = (row.rolls || []).some((roll) => ["标签或实物不符/待确认", "标签已作废/待重打"].includes(roll.labelStatus));
  if (row.duplicate) return 1;
  if (row.status === "已贴标/可用库存") return 4;
  if (canConfirmRawMaterialAttachment(row) || row.status === "部分贴标" || hasLabelException) return 3;
  if (canPrintRawMaterialLabels(row)) return 2;
  return 1;
}

function ReceiptStage({ row }) {
  if (row.documentDirection === "supplier_return") {
    const reviewed = row.status === "退货单已复核";
    return <div aria-label="退货处理进度" className="receipt-stage">{["拍单", "核对", "留档"].map((label, index) => {
      const step = index + 1;
      const done = step === 1 || reviewed;
      const active = !reviewed && step === 2;
      return <span className={done ? "done" : active ? "active" : ""} key={label}><b>{done ? <CheckOutlined /> : step}</b>{label}</span>;
    })}</div>;
  }
  const activeStep = receiptStageIndex(row);
  return <div aria-label="收货处理进度" className="receipt-stage">{["核对", "打印", "贴标", "入库"].map((label, index) => {
    const step = index + 1;
    const done = step < activeStep || activeStep === 4;
    return <span className={done ? "done" : step === activeStep ? "active" : ""} key={label}><b>{done ? <CheckOutlined /> : step}</b>{label}</span>;
  })}</div>;
}

function ReceiptRollList({ onRollAction, row }) {
  return <section className="receipt-roll-section"><div className="receipt-section-heading"><h3>逐卷状态</h3><span>{row.rolls.filter((roll) => roll.inventoryStatus === "可用").length} / {row.rolls.length} 卷已入库</span></div><div className="receipt-roll-list">{row.rolls.map((roll) => {
    const canVerify = roll.labelStatus === "已打印待贴标" && roll.inventoryStatus !== "可用";
    const canVoid = roll.labelStatus === "标签或实物不符/待确认";
    const canReprint = roll.labelStatus === "标签已作废/待重打";
    return <div className="receipt-roll-row" key={roll.id}><div><strong>{roll.id}</strong><small>{roll.supplierRollNo} · {roll.weightKg}kg</small></div><span className={roll.inventoryStatus === "可用" ? "roll-state-success" : canVoid || canReprint ? "roll-state-danger" : "roll-state-pending"}>{roll.inventoryStatus === "可用" ? "已贴标/可用" : roll.labelStatus}</span>{canVerify ? <button onClick={() => onRollAction("verify", roll)} type="button">核对本卷</button> : null}{canVoid ? <button onClick={() => onRollAction("void", roll)} type="button">作废旧标签</button> : null}{canReprint ? <button onClick={() => onRollAction("reprint", roll)} type="button">重打本卷</button> : null}</div>;
  })}</div></section>;
}

function ReceiptDetail({ activeTab, notice, onOpenInventory, onPrimaryAction, onRollAction, row }) {
  if (!row) return <aside className="secondary-detail receipt-complete-detail"><CheckCircleFilled /><h2>{notice ? "本阶段处理完成" : `${activeTab}暂无单据`}</h2><p>{notice || "当前没有需要处理的记录。"}</p>{notice ? <button className="primary full" onClick={onOpenInventory} type="button">查看卷料库存</button> : null}</aside>;
  const duplicate = Boolean(row.duplicate);
  const isSupplierReturn = row.documentDirection === "supplier_return";
  const printable = canPrintRawMaterialLabels(row);
  const attachable = canConfirmRawMaterialAttachment(row) || row.status === "部分贴标";
  const reviewable = canReviewRawMaterialInbound(row);
  const abnormalRoll = row.rolls.find((roll) => ["标签或实物不符/待确认", "标签已作废/待重打"].includes(roll.labelStatus));
  const primaryLabel = duplicate ? "对照两张票据" : isSupplierReturn && reviewable ? "确认退货单复核" : reviewable ? "确认逐卷核对完成" : printable ? `预览并打印 ${row.rolls.length} 张卷标` : abnormalRoll?.labelStatus === "标签或实物不符/待确认" ? "作废异常卷旧标签" : abnormalRoll ? "重打异常卷标签" : attachable ? "开始逐卷贴标核对" : "查看处理结果";
  const bannerTitle = duplicate ? "疑似同一张票据" : isSupplierReturn && reviewable ? "退货草稿待人工核对" : isSupplierReturn ? "退货凭证已留档" : reviewable ? "业务查重已通过" : printable ? "人工核对已经完成" : row.status.includes("异常") ? "异常卷已隔离" : attachable ? "卷标已经打印" : "当前状态已确认";
  const bannerText = duplicate ? row.duplicate : isSupplierReturn && reviewable ? "请核对供应商、退回重量、金额和原图；确认后只形成负数对账依据。" : isSupplierReturn ? "本退货单不生成卷码、不增加可用库存；供应商月结仅引用这张退货凭证冲减。" : reviewable ? "原图摘要、供应商、票据字段和逐卷重量未命中已有记录。" : printable ? "每个物理卷已经生成唯一卷码，打印后仍不能直接进入可用库存。" : row.status.includes("异常") ? "异常只影响对应卷；其他卷仍可继续逐卷核对，正确卷不被整单阻塞。" : attachable ? "请按重量、颜色和规格逐卷对应实物；确认一致后，该卷才进入可用库存。" : "当前处理结果已经记录。";
  return <aside className="secondary-detail receipt-detail"><span className="detail-kicker">{row.id}</span><h2>{row.supplier}</h2><p>{row.note} · {receiptFacts(row)}</p><ReceiptStage row={row} /><section className={duplicate || row.status.includes("异常") ? "duplicate-warning" : "dedupe-clear"}>{duplicate || row.status.includes("异常") ? <WarningOutlined /> : <CheckCircleFilled />}<div><strong>{bannerTitle}</strong><p>{bannerText}</p></div></section><dl className="receipt-facts"><div><dt>原料 / 厂内颜色</dt><dd>{row.productName} · {row.factoryColor || row.supplierColor || "待确认"}</dd></div><div><dt>规格</dt><dd>{row.spec || "原单未写规格"}</dd></div><div><dt>{isSupplierReturn ? "退货金额" : "当前库位"}</dt><dd>{isSupplierReturn ? formatMoney(row.amount) : row.location}</dd></div><div><dt>当前状态</dt><dd>{row.status}</dd></div></dl>{!isSupplierReturn && (reviewable || printable || attachable || abnormalRoll) ? <ReceiptRollList onRollAction={onRollAction} row={row} /> : null}<p aria-live="polite" className={`receipt-flow-notice${notice ? " visible" : ""}`}>{notice}</p><p className="secondary-note">{isSupplierReturn ? "这里保存退货原图、逐行明细与审核记录；供应商月结只汇总冲减金额，卷料库存只显示库存结果。" : "打印只进入待贴标；逐卷确认标签与实物一致后才进入“卷料库存”。月结仍在“财务管理 → 供应商月结”处理。"}</p>{reviewable || duplicate || printable || attachable || abnormalRoll ? <button className="primary full" onClick={() => onPrimaryAction({ abnormalRoll, attachable, duplicate, printable, reviewable })} type="button">{primaryLabel}</button> : null}</aside>;
}

function ReceiptFlowDialog({ flow, onClose, onConfirm, row }) {
  if (!flow || !row) return null;
  const roll = flow.roll;
  const isSupplierReturn = row.documentDirection === "supplier_return";
  const title = flow.type === "print" ? "卷标打印预览" : flow.type === "verify" ? "标签与实物核对" : flow.type === "review" ? isSupplierReturn ? "确认退货单复核" : "确认送货单复核" : "疑似重复票据对照";
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><section aria-labelledby="receipt-flow-title" aria-modal="true" className="receive-dialog receipt-flow-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog"><header><div><span>收货录入</span><h2 id="receipt-flow-title">{title}</h2></div><button aria-label="关闭" onClick={onClose} type="button">×</button></header>{flow.type === "review" ? <><p>{isSupplierReturn ? "请确认已对照退货原图核对供应商、规格、颜色、退回重量和金额。确认后保存负数对账依据，不打印卷标、不增加库存。" : "请确认已对照原始票据核对供应商、规格、颜色、逐卷重量和单据方向。确认后会保存到服务器，并进入待打印阶段。"}</p><dl className="receipt-verify-facts"><div><dt>{isSupplierReturn ? "退货单" : "入库单"}</dt><dd>{row.id}</dd></div><div><dt>供应商</dt><dd>{row.supplier}</dd></div><div><dt>规格</dt><dd>{row.spec || "原单未写规格"}</dd></div><div><dt>{isSupplierReturn ? "退回数量" : "卷数"}</dt><dd>{row.rollCount || row.rolls.length}{isSupplierReturn ? "件" : "卷"}</dd></div></dl><footer className="receipt-dialog-actions"><button onClick={onClose} type="button">返回继续核对</button><button className="primary" onClick={() => onConfirm("reviewed")} type="button">确认复核并保存</button></footer></> : null}{flow.type === "print" ? <><p>确认后提交正式卷标打印记录；打印不会直接增加可用库存，仍需逐卷贴标核对。</p><div className="label-preview-grid">{row.rolls.map((item) => <article className="label-preview-card" key={item.id}><TagOutlined /><div><strong>{item.id}</strong><span>{item.factoryColor || row.factoryColor} · {item.spec || row.spec}</span><small>{item.supplierRollNo} · {item.weightKg}kg · {row.supplier}</small></div></article>)}</div><footer className="receipt-dialog-actions"><button onClick={onClose} type="button">返回</button><button className="primary" onClick={() => onConfirm("printed")} type="button"><PrinterOutlined />确认提交打印</button></footer></> : null}{flow.type === "verify" ? <><p>逐卷核对，不允许整单一键入库；不一致时只隔离当前卷。</p><dl className="receipt-verify-facts"><div><dt>卷码</dt><dd>{roll.id}</dd></div><div><dt>供应商卷号</dt><dd>{roll.supplierRollNo}</dd></div><div><dt>标签规格</dt><dd>{roll.spec || row.spec}</dd></div><div><dt>标签颜色</dt><dd>{roll.factoryColor || row.factoryColor}</dd></div><div><dt>标签重量</dt><dd>{roll.weightKg}kg</dd></div><div><dt>确认后库位</dt><dd>原材料仓库</dd></div></dl><footer className="receipt-dialog-actions"><button className="danger-button" onClick={() => onConfirm("mismatched")} type="button">标签/实物不符</button><button className="primary" onClick={() => onConfirm("matched")} type="button">一致，确认本卷入库</button></footer></> : null}{flow.type === "duplicate" ? <><p>系统只提供相似候选，由办公室对照原图、供应商单号、日期和逐卷重量后确认。</p><div className="duplicate-compare"><article><span>当前票据</span><strong>{row.id}</strong><small>{row.supplier} · {receiptFacts(row)}</small></article><article><span>系统候选</span><strong>{row.duplicate || "相似票据待确认"}</strong><small>请以服务器保存的原图和票据事实为准</small></article></div><footer className="receipt-dialog-actions"><button onClick={onClose} type="button">返回继续核对</button><button className="primary" onClick={() => onConfirm("different")} type="button">确认为不同票据并复核</button></footer></> : null}</section></div>;
}

function ReceiptWorkspace({ focusId, formal, onOpenInventory, onOpenReceive, records }) {
  const [activeTab, setActiveTab] = useState(() => receiptTabFor(records.find((row) => row.id === focusId)) || "待核对");
  const [selectedId, setSelectedId] = useState(focusId || records.find((row) => receiptTabFor(row) === "待核对")?.id || "");
  const [flow, setFlow] = useState(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!focusId) return;
    const focused = records.find((row) => row.id === focusId);
    const focusedTab = receiptTabFor(focused);
    if (focusedTab) { setActiveTab(focusedTab); setSelectedId(focusId); setNotice("OCR 复核草稿已保存到服务器；人工复核前不会增加可用库存。"); }
  }, [focusId]);
  const tabRows = records.filter((row) => receiptTabFor(row) === activeTab);
  const selected = selectedId ? tabRows.find((row) => row.id === selectedId) || tabRows[0] || null : notice ? null : tabRows[0] || null;
  const selectTab = (tab) => { const rows = records.filter((row) => receiptTabFor(row) === tab); setActiveTab(tab); setSelectedId(rows[0]?.id || ""); setNotice(""); setFlow(null); };
  const applyAction = async (action, options = {}) => {
    if (!selected) return;
    setNotice("正在保存到服务器…");
    const result = await formal.actions.updateRawMaterialInbound(action, selected.id, options);
    if (result.source !== "api" || !result.inbound?.id) { setNotice(`保存失败：${result.error?.message || "正式接口错误"}`); return; }
    const updated = result.inbound;
    setNotice(updated.status === "已贴标/可用库存" ? `${updated.rollCount || updated.rolls.length}卷已完成逐卷核对并进入可用库存。` : `服务器已保存：${updated.status}`);
    setFlow(null);
    const nextTab = receiptTabFor(updated);
    setActiveTab(nextTab || "待贴标");
    setSelectedId(nextTab ? updated.id : "");
  };
  const handlePrimaryAction = ({ abnormalRoll, attachable, duplicate, printable, reviewable }) => {
    if (!selected) return;
    if (duplicate) { setFlow({ type: "duplicate" }); return; }
    if (reviewable) { setFlow({ type: "review" }); return; }
    if (printable) { setFlow({ type: "print" }); return; }
    if (abnormalRoll?.labelStatus === "标签或实物不符/待确认") applyAction("作废卷标", { rollId: abnormalRoll.id });
    else if (abnormalRoll) applyAction("重打卷标", { rollId: abnormalRoll.id });
    else if (attachable) { const roll = selected.rolls.find((item) => item.labelStatus === "已打印待贴标" && item.inventoryStatus !== "可用"); if (roll) setFlow({ type: "verify", roll }); }
  };
  const handleRollAction = (action, roll) => {
    if (action === "verify") setFlow({ type: "verify", roll });
    if (action === "void") applyAction("作废卷标", { rollId: roll.id });
    if (action === "reprint") applyAction("重打卷标", { rollId: roll.id });
  };
  const confirmFlow = (result) => {
    if (result === "different" || result === "reviewed") {
      const isSupplierReturn = selected.documentDirection === "supplier_return";
      const reviewFields = Object.fromEntries((selected.ocrReviewFields || []).map((field) => [field.key, field.value ?? field.recognizedValue ?? ""]));
      const lineReviews = (selected.ocrLines || []).map((line) => ({ lineId: line.lineId, values: line.values || line.recognizedValues || {} }));
      void applyAction("复核送货单", { reviewFields, lineReviews, reason: result === "different" ? "办公室确认与相似候选不是同一张票据，并完成字段复核。" : `办公室对照原始${isSupplierReturn ? "退货" : "送货"}票据完成人工复核。`, note: isSupplierReturn ? "PC 端退货复核已保存；作为负数供应商对账依据，不生成卷码、不增加库存。" : "PC 端复核已保存到服务器；仍需打印、贴标并逐卷核对后才进入可用库存。" });
      return;
    }
    if (result === "printed") { void applyAction("打印卷标"); return; }
    if (flow?.type === "verify" && flow.roll) void applyAction("确认贴标入库", { rollId: flow.roll.id, matchResult: result, checkedWeightKg: flow.roll.weightKg, checkedColor: flow.roll.factoryColor || selected.factoryColor, checkedSpec: flow.roll.spec || selected.spec, location: result === "matched" ? "原材料仓库" : "原料隔离区" });
  };
  return <><div className="secondary-workbench">
    <section className="secondary-list">
      <header><h2>收货录入</h2><button className="primary" onClick={onOpenReceive} type="button"><PlusOutlined />录入送货/退货单</button></header>
      <div aria-label="收货状态" className="secondary-tabs" role="tablist">{receiptTabs.map((tab) => { const count = records.filter((row) => receiptTabFor(row) === tab).length; return <button aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} key={tab} onClick={() => selectTab(tab)} role="tab" type="button">{tab} {count}</button>; })}</div>
      <div className="receipt-table"><div className="receipt-row head"><span>供应商 / 票据</span><span>数量 / 重量</span><span>状态</span><span>查重结果</span></div>{tabRows.length ? tabRows.map((row) => <button aria-pressed={row.id === selected?.id} className={`receipt-row${row.id === selected?.id ? " selected" : ""}`} key={row.id} onClick={() => { setSelectedId(row.id); setNotice(""); }} type="button"><span><strong>{row.supplier}</strong><small>{row.note} · {row.id}</small></span><span>{receiptFacts(row)}</span><StatusText>{row.status}</StatusText><span className={row.duplicate || row.status.includes("异常") ? "danger-text" : "quiet-text"}>{row.duplicate || "未发现重复"}</span></button>) : <div className="receipt-empty-state"><CheckCircleFilled /><strong>{notice ? "本阶段处理完成" : `${activeTab}暂无单据`}</strong><span>{notice || "切换其他状态继续查看。"}</span></div>}</div>
    </section>
    <ReceiptDetail activeTab={activeTab} notice={notice} onOpenInventory={onOpenInventory} onPrimaryAction={handlePrimaryAction} onRollAction={handleRollAction} row={selected} />
  </div><ReceiptFlowDialog flow={flow} onClose={() => setFlow(null)} onConfirm={confirmFlow} row={selected} /></>;
}

function StatementWorkspace({ records }) {
  const [selectedId, setSelectedId] = useState(records[0]?.reviewId || records[0]?.id || "");
  const selected = records.find((row) => (row.reviewId || row.id) === selectedId) || records[0] || null;
  return <div className="secondary-workbench">
    <section className="secondary-list"><header><h2>供应商月结</h2><button className="primary" disabled type="button"><FileImageOutlined />上传月结 Excel</button></header><div className="statement-table"><div className="statement-row head"><span>供应商</span><span>文件</span><span>明细</span><span>匹配结果</span><span>状态</span></div>{records.length ? records.map((row) => { const id = row.reviewId || row.id; const summary = row.summary || {}; return <button className={`statement-row${id === (selected?.reviewId || selected?.id) ? " selected" : ""}`} key={id} onClick={() => setSelectedId(id)} type="button"><strong>{row.supplierName || "供应商待确认"}</strong><span>{row.fileName || "—"}</span><span>{summary.rowCount || row.rows?.length || 0}行</span><span>匹配{summary.matchedRowCount || 0} / 差异{summary.unmatchedRowCount || summary.candidateRowCount || 0}</span><StatusText>{row.status || row.reviewStatus || "待复核"}</StatusText></button>; }) : <div className="receipt-empty-state"><CheckCircleFilled /><strong>服务器暂无月结复核草稿</strong><span>月结 Excel 正式上传入口尚未接入本工作台。</span></div>}</div></section>
    <aside className="secondary-detail">{selected ? <><span className="detail-kicker">{selected.reviewId || selected.id}</span><h2>{selected.supplierName}</h2><p>{selected.fileName || "文件名待确认"}</p><dl className="statement-facts"><div><dt>匹配结果</dt><dd>{selected.summaryText || "待复核"}</dd></div><div><dt>当前状态</dt><dd>{selected.status || selected.reviewStatus || "待复核"}</dd></div><div><dt>库存影响</dt><dd>无</dd></div><div><dt>付款影响</dt><dd>{selected.paymentStatus || "尚未生成"}</dd></div></dl><section className="month-note"><InfoCircleOutlined /><p>月结只核对供应商 Excel 与已记录的卷料事实，不会再次生成卷料，也不等于已付款。</p></section><button className="primary full" type="button">打开差异明细</button></> : <div className="receipt-empty-state"><FileTextOutlined /><strong>暂无复核草稿</strong></div>}</aside>
  </div>;
}

function ReceiveDialog({ busy, error, onClose, onFile }) {
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><section aria-labelledby="receive-title" aria-modal="true" className="receive-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog"><header><div><span>收货录入</span><h2 id="receive-title">选择送货单来源</h2></div><button aria-label="关闭" onClick={onClose} type="button">×</button></header><p>照片或 PDF 会上传到正式服务器并调用腾讯云 OCR；识别后仍需人工复核，当前不会增加可用库存。</p><div className="source-actions"><button disabled={busy} onClick={() => cameraRef.current?.click()} type="button"><CameraOutlined /><span><strong>直接拍照</strong><small>调用相机并上传正式识别</small></span></button><button disabled={busy} onClick={() => fileRef.current?.click()} type="button"><FileImageOutlined /><span><strong>相册 / PDF</strong><small>选择文件并上传正式识别</small></span></button></div><input accept="image/*" capture="environment" hidden onChange={(event) => onFile(event.target.files?.[0])} ref={cameraRef} type="file" /><input accept="image/*,application/pdf" hidden onChange={(event) => onFile(event.target.files?.[0])} ref={fileRef} type="file" />{busy ? <p className="source-disclosure">正在上传并识别，请勿重复提交。</p> : null}{error ? <p className="danger-text">{error}</p> : null}<section className="dedupe-note"><InfoCircleOutlined /><div><strong>系统会进行两层查重</strong><p>先比较原始文件摘要；重拍或重新导出的票据，再比较供应商、单号、日期、规格、颜色和逐卷重量。</p></div></section></section></div>;
}

function SourceDialog({ roll, onClose }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><section aria-labelledby="source-title" aria-modal="true" className="receive-dialog source-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog"><header><div><span>来源追溯</span><h2 id="source-title">{roll.source}</h2></div><button aria-label="关闭" onClick={onClose} type="button">×</button></header><dl><div><dt>当前卷码</dt><dd>{roll.id}</dd></div><div><dt>供应商</dt><dd>{roll.supplier}</dd></div><div><dt>供应商单号</dt><dd>未提供</dd></div><div><dt>OCR 来源</dt><dd>第 1 行 · 第 1 卷</dd></div><div><dt>权威卷料事实</dt><dd>{roll.color} · {roll.spec} · {roll.weight.toFixed(1)}kg</dd></div></dl><p className="source-disclosure">票据与 OCR 原文仅用于追溯；卷料库存以逐卷人工确认后的颜色、规格和重量为准。</p></section></div>;
}

export function App({ permissionContext = defaultPermissionContext }) {
  const formal = useFormalDesktopWorkspace();
  const resolvedPermissionContext = formal.permissionContext || permissionContext;
  const visibleViews = useMemo(() => getVisibleWorkspaceViews(resolvedPermissionContext), [resolvedPermissionContext]);
  const visibleRawMaterialViews = useMemo(() => getVisibleRawMaterialViews(resolvedPermissionContext), [resolvedPermissionContext]);
  const [view, setView] = useState(() => {
    const hashNavId = window.location.hash.replace(/^#/, "");
    const hashView = navViewMap[hashNavId === "spec-inventory" ? "general-prices" : hashNavId];
    return visibleViews.includes(hashView) ? hashView : getDefaultWorkspaceView(permissionContext);
  });
  const [expandedGroups, setExpandedGroups] = useState(() => new Set(pcNavGroups.map((group) => group.id)));
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiptFocusId, setReceiptFocusId] = useState("");
  const [receiveBusy, setReceiveBusy] = useState(false);
  const [receiveError, setReceiveError] = useState("");
  const [sourceRoll, setSourceRoll] = useState(null);
  const [colorMappingOpen, setColorMappingOpen] = useState(false);
  const activeView = visibleViews.includes(view) ? view : getDefaultWorkspaceView(permissionContext);
  const activeNavId = viewNavMap[activeView] || "";
  const visibleNavGroups = useMemo(() => getVisiblePcNavGroups(resolvedPermissionContext), [resolvedPermissionContext]);
  const isRawMaterialView = visibleRawMaterialViews.includes(activeView);
  const canManageSupplierColors = hasEffectivePermission(
    resolvedPermissionContext,
    "master_data.raw_material_color.manage",
  );
  const receiptRecords = useMemo(() => formal.data.rawMaterialInbounds.map((record) => ({
    ...record,
    supplier: record.supplierName || "供应商待确认",
    note: record.deliveryNoteNo || record.note || "供应商未提供单号",
    rolls: Array.isArray(record.rolls) ? record.rolls : [],
    duplicate: record.duplicate || record.duplicateSummary || (record.duplicateCandidates?.length ? `发现 ${record.duplicateCandidates.length} 条相似候选` : ""),
  })), [formal.data.rawMaterialInbounds]);
  const currentInventoryRolls = useMemo(() => buildInventoryRolls(formal.data.rawMaterialInbounds), [formal.data.rawMaterialInbounds]);
  const currentInventorySummary = useMemo(() => summarizeInventory(currentInventoryRolls), [currentInventoryRolls]);
  useEffect(() => {
    const handleHashChange = () => {
      const hashNavId = window.location.hash.replace(/^#/, "");
      const nextView = navViewMap[hashNavId === "spec-inventory" ? "general-prices" : hashNavId];
      if (nextView && visibleViews.includes(nextView)) setView(nextView);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [visibleViews]);
  const toggleGroup = (groupId) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };
  const navigate = (navId) => {
    const normalizedNavId = navId === "spec-inventory" ? "general-prices" : navId;
    const nextView = navViewMap[normalizedNavId];
    if (nextView && visibleViews.includes(nextView)) {
      setView(nextView);
      window.history.replaceState(null, "", `#${normalizedNavId}`);
    }
  };
  const recognizeReceiptFile = async (file) => {
    if (!file || receiveBusy) return;
    setReceiveBusy(true);
    setReceiveError("");
    try {
      const result = await formal.actions.recognizeRawMaterialFile(file);
      if (result.source !== "api" || !result.inbound?.id) {
        setReceiveError(result.error?.message || "正式 OCR 接口没有生成草稿。");
        return;
      }
      setReceiptFocusId(result.inbound.id);
      setReceiveOpen(false);
      navigate("material-receiving");
    } catch (error) {
      setReceiveError(error?.message || "送货单文件读取失败。");
    } finally {
      setReceiveBusy(false);
    }
  };

  return <div className="app-shell" data-active-view={activeView} data-user-id={resolvedPermissionContext.user?.userId || ""}>
    <Sidebar activeNavId={activeNavId} expandedGroups={expandedGroups} onNavigate={navigate} onToggleGroup={toggleGroup} permissionContext={resolvedPermissionContext} /><Topbar onCreateOrder={() => navigate("order-entry")} permissionContext={resolvedPermissionContext} />
    <main className={`page${isRawMaterialView ? "" : " business-page"}`}>
      {formal.meta.loading ? <div className="formal-sync-banner">正在读取正式服务器数据…</div> : null}
      {!formal.meta.loading && Object.keys(formal.meta.errors).length ? <div className="formal-sync-banner error">部分正式接口读取失败；失败页面不会回退到静态数据。<button onClick={() => void formal.actions.refreshAll()} type="button">重试</button></div> : null}
      {isRawMaterialView ? <header className="workbench-dock">
        <div className="dock-primary">{visibleRawMaterialViews.includes("卷料库存") ? <InventoryStatusCards summary={currentInventorySummary} /> : null}</div>
        <div className="dock-actions">
          {canManageSupplierColors ? <button className="factory-color-entry" onClick={() => setColorMappingOpen(true)} type="button">厂家颜色资料</button> : null}
          <button className="page-refresh" onClick={() => void formal.actions.refreshAll()} type="button"><ReloadOutlined />刷新</button>
          {isRawMaterialView && activeView !== "收货录入" && visibleRawMaterialViews.includes("收货录入") ? <button className="receive-entry" onClick={() => setReceiveOpen(true)} type="button"><PlusOutlined />收货录入</button> : null}
        </div>
      </header> : null}
      {activeView === "卷料库存" ? <RollInventory onOpenSource={setSourceRoll} sourceRolls={currentInventoryRolls} /> : null}
      {activeView === "收货录入" ? <ReceiptWorkspace focusId={receiptFocusId} formal={formal} onOpenInventory={() => navigate("roll-inventory")} onOpenReceive={() => setReceiveOpen(true)} records={receiptRecords} /> : null}
      {activeView === "供应商月结" ? <StatementWorkspace records={formal.data.supplierStatementReviews} /> : null}
      {!isRawMaterialView && activeView !== "供应商月结" ? <BusinessWorkspace formal={formal} navId={activeNavId} onNavigate={navigate} /> : null}
    </main>
    {receiveOpen ? <ReceiveDialog busy={receiveBusy} error={receiveError} onClose={() => { if (!receiveBusy) setReceiveOpen(false); }} onFile={recognizeReceiptFile} /> : null}
    {sourceRoll ? <SourceDialog onClose={() => setSourceRoll(null)} roll={sourceRoll} /> : null}
    {colorMappingOpen ? <RawMaterialSupplierColorMappingDialog
      authState={formal.authState}
      currentUser={resolvedPermissionContext.user}
      onClose={() => setColorMappingOpen(false)}
    /> : null}
  </div>;
}
