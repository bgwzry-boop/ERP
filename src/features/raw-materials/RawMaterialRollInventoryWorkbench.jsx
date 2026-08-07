import { useMemo, useState } from "react";
import {
  DownOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  buildRawMaterialAvailableDistribution,
  buildRawMaterialRollLedger,
  filterRawMaterialRollLedger,
  getRawMaterialRollFilterOptions,
  summarizeRawMaterialRollLedger,
} from "../../domain/rawMaterialRollInventoryState.js";

export function RawMaterialRollInventoryWorkbench({
  inbounds = [],
  meta = {},
  onOpenReceiving,
  onOpenSource,
}) {
  const rolls = useMemo(() => buildRawMaterialRollLedger(inbounds), [inbounds]);
  const summary = useMemo(() => summarizeRawMaterialRollLedger(rolls), [rolls]);
  const options = useMemo(() => getRawMaterialRollFilterOptions(rolls), [rolls]);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("全部状态");
  const [width, setWidth] = useState("全部宽幅");
  const [color, setColor] = useState("全部颜色");
  const [location, setLocation] = useState("全部库位");
  const [activeBucket, setActiveBucket] = useState("");
  const [selectedRollId, setSelectedRollId] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const filteredRolls = useMemo(() => filterRawMaterialRollLedger(rolls, {
    keyword,
    status,
    width,
    color,
    location,
  }), [color, keyword, location, rolls, status, width]);
  const visibleDistribution = useMemo(() => buildRawMaterialAvailableDistribution(filteredRolls), [filteredRolls]);
  const bucketRolls = useMemo(() => {
    if (!activeBucket) return filteredRolls;
    const [bucketWidth, bucketColor] = activeBucket.split("::");
    return filteredRolls.filter((roll) => roll.status === "可用" && roll.widthLabel === bucketWidth && roll.color === bucketColor);
  }, [activeBucket, filteredRolls]);
  const pageCount = Math.max(1, Math.ceil(bucketRolls.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRolls = bucketRolls.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedRoll = pageRolls.find((roll) => roll.id === selectedRollId) || pageRolls[0] || bucketRolls[0] || null;
  const hasFilters = Boolean(
    keyword.trim()
    || status !== "全部状态"
    || width !== "全部宽幅"
    || color !== "全部颜色"
    || location !== "全部库位"
    || activeBucket,
  );

  function changeFilter(setter, value) {
    setter(value);
    setActiveBucket("");
    setPage(1);
  }

  function resetFilters() {
    setKeyword("");
    setStatus("全部状态");
    setWidth("全部宽幅");
    setColor("全部颜色");
    setLocation("全部库位");
    setActiveBucket("");
    setPage(1);
  }

  function selectBucket(bucket) {
    setActiveBucket((current) => current === bucket ? "" : bucket);
    setPage(1);
  }

  return (
    <div className="raw-material-roll-inventory" aria-label="原材料逐卷总账">
      <header className="raw-material-roll-dock">
        <RawMaterialRollStatusCards summary={summary} />
        <div className="raw-material-roll-dock-actions">
          <span>{formatRawMaterialRollSource(meta)}</span>
          <button className="raw-material-receiving-entry" onClick={onOpenReceiving} type="button">
            <PlusOutlined />收货录入
          </button>
        </div>
      </header>
      <div className="raw-material-roll-workbench">
        <section className={`raw-material-roll-ledger${hasFilters ? " has-filter-feedback" : ""}`}>
          <div className="raw-material-roll-filters">
            <label className="raw-material-roll-search">
              <SearchOutlined />
              <input
                aria-label="搜索卷料"
                onChange={(event) => changeFilter(setKeyword, event.target.value)}
                placeholder="搜索卷码 / 颜色 / 宽幅 / 供应商"
                value={keyword}
              />
            </label>
            <RawMaterialRollSelect label="库存状态" onChange={(value) => changeFilter(setStatus, value)} options={["全部状态", ...options.statuses]} value={status} />
            <RawMaterialRollSelect label="宽幅" onChange={(value) => changeFilter(setWidth, value)} options={["全部宽幅", ...options.widths]} value={width} />
            <RawMaterialRollSelect label="厂内颜色" onChange={(value) => changeFilter(setColor, value)} options={["全部颜色", ...options.colors]} value={color} />
            <RawMaterialRollSelect label="库位" onChange={(value) => changeFilter(setLocation, value)} options={["全部库位", ...options.locations]} value={location} />
          </div>
          {hasFilters ? (
            <div className="raw-material-roll-filter-feedback" aria-live="polite">
              <span>已筛选 {bucketRolls.length} 条</span>
              {activeBucket ? <button onClick={() => setActiveBucket("")} type="button">{activeBucket.replace("::", " · ")} ×</button> : null}
              <button className="reset" onClick={resetFilters} type="button"><ReloadOutlined />重置</button>
            </div>
          ) : null}
          <div className="raw-material-roll-table" role="table" aria-label="物理卷料台账">
            <div className="raw-material-roll-row head" role="row">
              <span role="columnheader">卷码</span>
              <span role="columnheader">厂内颜色</span>
              <span role="columnheader">规格</span>
              <span role="columnheader">当前重量</span>
              <span role="columnheader">库位</span>
              <span role="columnheader">状态</span>
              <span role="columnheader">供应商 / 入库日期</span>
            </div>
            <div className="raw-material-roll-table-body">
              {pageRolls.length ? pageRolls.map((roll) => (
                <button
                  aria-pressed={selectedRoll?.id === roll.id}
                  className={`raw-material-roll-row${selectedRoll?.id === roll.id ? " selected" : ""}`}
                  key={roll.id}
                  onClick={() => setSelectedRollId(roll.id)}
                  role="row"
                  type="button"
                >
                  <span className="roll-id" role="cell">{roll.id}</span>
                  <span className="roll-color" role="cell"><RawMaterialColorChip color={roll.color} />{roll.color}</span>
                  <span title={roll.specDisplay} role="cell">{roll.specDisplay}</span>
                  <span className="roll-weight" role="cell">{formatRawMaterialRollWeight(roll)}</span>
                  <span role="cell">{roll.location}</span>
                  <span role="cell"><RawMaterialRollStatus status={roll.status} /></span>
                  <span className="roll-supplier" role="cell"><strong>{roll.supplierName}</strong><small>{roll.receivedDate}</small></span>
                </button>
              )) : (
                <div className="raw-material-roll-empty">
                  <SearchOutlined />
                  <strong>{rolls.length ? "没有符合条件的卷料" : "暂无已确认卷料"}</strong>
                  <span>{rolls.length ? "清除筛选后再查找。" : "待核对、待打印和待贴标的记录请到收货录入处理。"}</span>
                  <button onClick={rolls.length ? resetFilters : onOpenReceiving} type="button">{rolls.length ? "清除筛选" : "打开收货录入"}</button>
                </div>
              )}
            </div>
          </div>
          <footer className="raw-material-roll-pagination">
            <span>共 {bucketRolls.length} 条</span>
            <div>
              <span>20 条/页 <DownOutlined /></span>
              <button aria-label="上一页" disabled={safePage === 1} onClick={() => setPage(Math.max(1, safePage - 1))} type="button">‹</button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).slice(0, 7).map((pageNumber) => (
                <button aria-current={safePage === pageNumber ? "page" : undefined} className={safePage === pageNumber ? "current" : ""} key={pageNumber} onClick={() => setPage(pageNumber)} type="button">{pageNumber}</button>
              ))}
              <button aria-label="下一页" disabled={safePage === pageCount} onClick={() => setPage(Math.min(pageCount, safePage + 1))} type="button">›</button>
            </div>
          </footer>
        </section>
        <aside className="raw-material-roll-rail">
          <section className="raw-material-distribution-panel">
            <header><div><h2>可用库存分布</h2><small>不含机边库存</small></div><InfoCircleOutlined /></header>
            <div className="raw-material-distribution-scroll">
              {visibleDistribution.length ? visibleDistribution.map((group) => (
                <section className="raw-material-distribution-group" key={group.widthLabel}>
                  <div className="group-head"><strong>{group.widthLabel}</strong><span>{formatRawMaterialDistributionTotal(group)}</span></div>
                  {group.items.map((item) => {
                    const bucket = `${group.widthLabel}::${item.color}`;
                    return (
                      <button aria-pressed={activeBucket === bucket} className={activeBucket === bucket ? "active" : ""} key={item.color} onClick={() => selectBucket(bucket)} type="button">
                        <span className="distribution-label"><RawMaterialColorChip color={item.color} /><strong>{item.color}</strong></span>
                        <span className="distribution-bar"><i style={{ "--distribution-width": `${item.percent}%`, "--raw-roll-color": getRawMaterialColorValue(item.color) }} /></span>
                        <span className="distribution-count">{formatRawMaterialDistributionItem(item)}</span>
                      </button>
                    );
                  })}
                </section>
              )) : <div className="raw-material-distribution-empty"><strong>当前没有可用卷料</strong><span>可调整筛选，或先完成收货核对与贴标。</span></div>}
            </div>
            <div className="raw-material-machine-side-disclosure"><span><RightOutlined />机边库存（不计入可用）</span><strong>{summary.machineSide.count}卷</strong></div>
          </section>
          <section className="raw-material-trace-panel">
            <header><h2>选中卷料来源</h2></header>
            {selectedRoll ? (
              <>
                <dl>
                  <div><dt>卷码</dt><dd>{selectedRoll.id}</dd></div>
                  <div><dt>卷料</dt><dd>{selectedRoll.color} · {selectedRoll.specDisplay}</dd></div>
                  <div><dt>来源票据</dt><dd>{selectedRoll.inboundId}</dd></div>
                  <div><dt>供应商</dt><dd>{selectedRoll.supplierName}</dd></div>
                  <div><dt>入库日期</dt><dd>{selectedRoll.receivedDate}</dd></div>
                </dl>
                <button className="raw-material-trace-action" onClick={() => onOpenSource?.(selectedRoll)} type="button">查看来源票据 <RightOutlined /></button>
              </>
            ) : <div className="raw-material-trace-empty">选择一卷后查看来源。</div>}
          </section>
        </aside>
      </div>
    </div>
  );
}

function RawMaterialRollStatusCards({ summary }) {
  return (
    <div className="raw-material-roll-status-cards" role="list" aria-label="卷料状态概览">
      <div className="available" role="listitem"><span>可用</span><strong>{summary.available.count}</strong><small>{summary.available.weightKg > 0 ? `卷/件 · ${formatWeightKg(summary.available.weightKg)}` : "卷/件"}</small></div>
      <div className="machine" role="listitem"><span>机边</span><strong>{summary.machineSide.count}</strong><small>{summary.machineSide.weightKg > 0 ? `卷 · ${formatWeightKg(summary.machineSide.weightKg)}` : "卷"}</small></div>
      <div className="review" role="listitem"><span>余料待复核</span><strong>{summary.review.count}</strong><small>卷</small></div>
    </div>
  );
}

function RawMaterialRollSelect({ label, onChange, options, value }) {
  return (
    <label className="raw-material-roll-select">
      <span className="visually-hidden">{label}</span>
      <select aria-label={label} onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function RawMaterialColorChip({ color }) {
  return <i aria-hidden="true" className="raw-material-color-chip" style={{ "--raw-roll-color": getRawMaterialColorValue(color) }} />;
}

function RawMaterialRollStatus({ status }) {
  return <span className={`raw-material-roll-status status-${getRawMaterialRollStatusKey(status)}`}>{status}</span>;
}

function formatRawMaterialRollWeight(roll) {
  if (roll.currentWeightKg > 0) return formatWeightKg(roll.currentWeightKg);
  return `1${roll.unitLabel}`;
}

function formatRawMaterialDistributionTotal(group) {
  const countText = `${group.count}${group.unitLabel}`;
  return group.weightKg > 0 ? `${countText} / ${formatWeightKg(group.weightKg)}` : countText;
}

function formatRawMaterialDistributionItem(item) {
  const countText = `${item.count}${item.unitLabel}`;
  return item.weightKg > 0 ? `${countText} / ${formatWeightKg(item.weightKg)}` : countText;
}

function formatWeightKg(value) {
  return `${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}kg`;
}

function formatRawMaterialRollSource(meta) {
  if (meta.loading) return "正在同步卷料";
  if (meta.source === "api_error") return "读取失败";
  if (meta.lastSyncedAt) return `已同步 · ${meta.lastSyncedAt}`;
  return "逐卷库存总账";
}

function getRawMaterialRollStatusKey(status) {
  if (status === "可用") return "available";
  if (status === "机边领用") return "machine";
  if (status === "余料待复核") return "review";
  if (status === "已消耗") return "consumed";
  return "unknown";
}

function getRawMaterialColorValue(color) {
  const map = {
    本白: "#f8f8f2",
    白色: "#f8f8f2",
    黑: "#17191c",
    黑色: "#17191c",
    大红: "#d8232a",
    红色: "#d8232a",
    枣红: "#8f2535",
    宝兰: "#183f92",
    蓝色: "#2466ad",
    天兰: "#25a8dc",
    深灰: "#62676c",
    浅紫: "#c4a7da",
    翠绿: "#188d2a",
    果绿: "#8ccb2c",
    豆沙绿: "#9ebd84",
  };
  return map[color] || "#9aa6b2";
}
