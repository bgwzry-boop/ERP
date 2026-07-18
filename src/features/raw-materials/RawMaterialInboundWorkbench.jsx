import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import {
  DataTable,
  FilterBar,
  MetricStrip,
  OperationalPanel,
  PanelHeader,
  StatusPill,
} from "../../shared/ui/operational.jsx";
import {
  buildRawMaterialInboundViewItems,
  formatRawMaterialDeliveryNoteNo,
  getRawMaterialNextActionLabel,
  getRawMaterialInboundTone,
  RAW_MATERIAL_INBOUND_VIEW_KEYS,
} from "../../domain/rawMaterialInboundListState.js";
import { buildRawMaterialStockLookup } from "../../../shared/rawMaterialInventorySupport.js";

export const RAW_MATERIAL_INBOUND_TABS = RAW_MATERIAL_INBOUND_VIEW_KEYS;
export const RAW_MATERIAL_DETAIL_TABS = ["入库标签", "领料成本", "供应商账", "记录"];

const RAW_MATERIAL_METRIC_LABELS = {
  入库单: ["待复核", "待打印", "待贴标", "可用卷/件"],
  待贴标: ["待打印", "待贴标", "可用卷/件", "余料待复核"],
  机边领料: ["机边领料", "已消耗", "余料待复核", "余料已复核"],
  供应商对账: ["待复核", "可用卷/件", "机边领料", "待贴标"],
};

const RAW_MATERIAL_FIRST_RELEASE_VIEW_LABELS = Object.freeze({
  入库单: "入库核对",
  待贴标: "待贴标",
  机边领料: "扫码出库",
  供应商对账: "月结对账",
});

export function selectRawMaterialInboundMetrics(metrics, activeTab) {
  const metricByLabel = new Map(metrics.map((metric) => [metric[0], metric]));
  return (RAW_MATERIAL_METRIC_LABELS[activeTab] ?? RAW_MATERIAL_METRIC_LABELS.入库单)
    .map((label) => metricByLabel.get(label))
    .filter(Boolean);
}

export function RawMaterialInboundListPane({
  activeTab,
  inbounds,
  keyword,
  meta,
  metrics,
  onKeywordChange,
  onSelect,
  onTabChange,
  selectedId,
  visibleRecords,
  records,
  firstReleaseMode = false,
}) {
  return (
    <OperationalPanel className="table-pane raw-material-list-panel" ariaLabel="原材料入库列表">
      <PanelHeader
        title="原材料工作台"
        summary={meta.loading ? "正在同步" : meta.source === "api_error" ? "读取失败，请刷新" : undefined}
      />
      <RawMaterialViewTabs activeTab={activeTab} firstReleaseMode={firstReleaseMode} inbounds={inbounds} onChange={onTabChange} />
      <FilterBar
        className="raw-material-filter-bar"
        ariaLabel="原材料搜索"
        summary={`${visibleRecords.length} / ${records.length} 条`}
        actions={(
          <button
            className="icon-button"
            type="button"
            aria-label="重置原材料搜索"
            title="重置搜索"
            disabled={!keyword}
            onClick={() => onKeywordChange("")}
          >
            <ReloadOutlined />
          </button>
        )}
      >
        <label className="search small">
          <SearchOutlined />
          <input
            placeholder="搜索供应商 / 供应商单号 / ERP 入库单 / 原料 / 颜色 / 批号"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
          />
        </label>
      </FilterBar>
      <MetricStrip items={metrics} ariaLabel="原材料状态摘要" />
      <RawMaterialInboundTable inbounds={inbounds} records={visibleRecords} selectedId={selectedId} onSelect={onSelect} />
    </OperationalPanel>
  );
}

export function RawMaterialDetailOverview({ selected }) {
  const rolls = selected.rolls ?? [];
  const availableCount = rolls.filter((roll) => roll.inventoryStatus === "可用").length;
  const totalCount = selected.rollCount || rolls.length || 0;
  const unitLabel = selected.materialType === "提手" ? "件" : "卷";
  return (
    <div className="raw-material-detail-overview">
      <div className="raw-material-detail-status-line">
        <StatusPill tone={getRawMaterialInboundTone(selected.status)}>{selected.status}</StatusPill>
        <span>{getRawMaterialNextActionLabel(selected)}</span>
      </div>
      <div className="raw-material-detail-facts" aria-label="原材料关键事实">
        <RawMaterialFact label="供应商单号" value={selected.deliveryNoteNo || "未提供"} />
        <RawMaterialFact label="ERP 入库单" value={selected.id || "待生成"} />
        <RawMaterialFact label="卷/重量" value={`${totalCount}${unitLabel} / ${formatRawMaterialWeight(selected)}`} />
        <RawMaterialFact label="可用卷/件" value={`${availableCount}/${totalCount}`} />
        <RawMaterialFact label="库位" value={selected.location || "待分配"} />
      </div>
    </div>
  );
}

export function formatRawMaterialWeight(item = {}) {
  const weight = Number(item.totalWeightKg || 0);
  if (!weight) return item.unit === "件" ? `${item.rollCount || item.rolls?.length || 0}件` : "未填重量";
  return `${weight}kg`;
}

function RawMaterialViewTabs({ activeTab, firstReleaseMode = false, inbounds, onChange }) {
  const viewItems = buildRawMaterialInboundViewItems(inbounds);
  return (
    <div className="raw-material-view-tabs" role="tablist" aria-label="原材料视图">
      {viewItems.map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === item.key}
            className={activeTab === item.key ? "active" : ""}
            key={item.key}
            onClick={() => onChange(item.key)}
          >
            <span>{firstReleaseMode ? RAW_MATERIAL_FIRST_RELEASE_VIEW_LABELS[item.key] : item.label}</span>
            <strong>{item.count}</strong>
          </button>
      ))}
    </div>
  );
}

function RawMaterialInboundTable({ inbounds, records, selectedId, onSelect }) {
  return (
    <DataTable
      className="raw-material-inbound-table"
      columns={["供应商 / 单号", "原料 / 规格", "卷 / 重量", "状态", "下一步"]}
      rows={records.map((item) => {
        const stock = buildRawMaterialStockLookup(inbounds, {
          color: item.factoryColor || item.supplierColor,
          widthCm: item.widthCm,
          gramWeightGsm: item.gramWeightGsm,
        });
        return {
        id: item.id,
        active: item.id === selectedId,
        tone: getRawMaterialInboundTone(item.status),
        onClick: () => onSelect(item.id),
        cells: [
          <RawMaterialTableCell primary={item.supplierName} secondary={formatRawMaterialDeliveryNoteNo(item)} />,
          <RawMaterialTableCell
            primary={item.productName || item.materialType}
            secondary={`${item.factoryColor || item.supplierColor} / ${item.widthCm || "?"}cm / 可用${stock.availableWeightKg}kg`}
          />,
          <RawMaterialTableCell
            primary={`${item.rollCount || item.rolls?.length || 0}${item.materialType === "提手" ? "件" : "卷"}`}
            secondary={formatRawMaterialWeight(item)}
          />,
          <StatusPill tone={getRawMaterialInboundTone(item.status)}>{item.status}</StatusPill>,
          <span className="raw-material-next-step">{getRawMaterialNextActionLabel(item)}</span>,
        ],
        };
      })}
    />
  );
}

function RawMaterialTableCell({ primary, secondary }) {
  return (
    <span className="raw-material-table-cell">
      <strong>{primary || "待补"}</strong>
      <small>{secondary || "待补"}</small>
    </span>
  );
}

function RawMaterialFact({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
