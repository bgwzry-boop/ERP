import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { FilterBar } from "../../shared/ui/operational.jsx";
import { buildRawMaterialInboundViewItems } from "../../domain/rawMaterialInboundListState.js";

const FIRST_RELEASE_VIEW_LABELS = Object.freeze({
  入库单: "入库核对",
  待贴标: "待贴标",
  机边领料: "扫码出库",
  供应商对账: "月结对账",
});

export function InboundFilters({ activeTab, firstReleaseMode = false, inbounds, keyword, onKeywordChange, onTabChange, recordCount, visibleCount }) {
  const viewItems = buildRawMaterialInboundViewItems(inbounds);
  return (
    <>
      <div className="raw-material-view-tabs" role="tablist" aria-label="原材料视图">
        {viewItems.map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === item.key}
            className={activeTab === item.key ? "active" : ""}
            key={item.key}
            onClick={() => onTabChange(item.key)}
          >
            <span>{firstReleaseMode ? FIRST_RELEASE_VIEW_LABELS[item.key] : item.label}</span>
            <strong>{item.count}</strong>
          </button>
        ))}
      </div>
      <FilterBar
        className="raw-material-filter-bar"
        ariaLabel="原材料搜索"
        summary={`${visibleCount} / ${recordCount} 条`}
        actions={(
          <button className="icon-button" type="button" aria-label="重置原材料搜索" title="重置搜索" disabled={!keyword} onClick={() => onKeywordChange("")}>
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
    </>
  );
}
