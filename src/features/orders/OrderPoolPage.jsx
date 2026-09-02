import { useState } from "react";
import {
  AccountBookOutlined,
  CopyOutlined,
  EditOutlined,
  InboxOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  DataState,
  DataTable,
  DetailPane,
  FilterBar,
  OperationalPanel,
  Segmented,
  SemanticTag,
  Timeline,
} from "../../shared/ui/operational.jsx";
import {
  getBusinessTypeTagValue,
  getOperationalStateTagValue,
} from "../../shared/labels.js";
import {
  ORDER_DETAIL_TABS,
  ORDER_STATUS_FILTERS,
  getActiveFilterCount,
  getOrderActionState,
  getOrderDetailInventoryLabel,
  getOrderLineMutationBlocker,
  getOrderPoolSourceLabel,
  orderMatchesQuery,
} from "./orderPoolPageModel.js";

export function OrderPoolPage({ orderLines, fulfillments, statements, selectedOrderId, setSelectedOrderId, filters, setFilters, orderPoolMeta, selectedOrderDetail, onLocateFulfillment, onLocateStatement, onOrderAction, setToast, helpers }) {
  const [detailTab, setDetailTab] = useState("订单");
  const [query, setQuery] = useState("");
  const {
    customers,
    defaultOrderFilters,
    findCustomer,
    getLineColorSpecLabel,
    getLineRemark,
    getOrderExceptionState,
    getOrderFinanceState,
    getOrderLineShortNo,
    getUiActionState,
    getStatementForLine,
    money,
    orderMatchesFilters,
    statusTone,
  } = helpers;
  const queryMatched = orderLines.filter((item) => orderMatchesQuery(item, query, findCustomer, getLineColorSpecLabel, getLineRemark));
  const filtered = queryMatched.filter((item) => orderMatchesFilters(item, filters, statements));
  const selected = filtered.find((item) => item.id === selectedOrderId) ?? filtered[0] ?? null;
  const statusCounts = Object.fromEntries(ORDER_STATUS_FILTERS.map((status) => [
    status,
    queryMatched.filter((item) => orderMatchesFilters(item, { ...filters, status }, statements)).length,
  ]));
  const activeFilterCount = getActiveFilterCount(filters, defaultOrderFilters, query);
  const filterOptions = {
    orderType: ["全部", "现货有货", "现货缺货", "定制印刷", "印刷通货", "外加工印刷"],
    fulfillment: ["全部", "自提", "送货", "快递快运"],
    exception: ["全部", "仅异常", "无异常"],
    finance: ["全部", "待对账", "差额/欠款", "收款待确认", "已结清/无差额"],
  };

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters() {
    setFilters(defaultOrderFilters);
    setQuery("");
    setToast("订单池筛选已重置。");
  }

  const filterBar = (
    <>
      <OrderStatusTabs
        value={filters.status}
        counts={statusCounts}
        onChange={(value) => updateFilter("status", value)}
      />
      <FilterBar
        className="order-pool-filter-bar"
        ariaLabel="订单池筛选"
        summary={`命中 ${filtered.length} / ${orderLines.length} 行；${getOrderPoolSourceLabel(orderPoolMeta)}。`}
        secondarySummary={activeFilterCount ? `已启用 ${activeFilterCount} 个筛选条件` : "当前显示全部订单"}
        actions={(
          <button type="button" disabled={!activeFilterCount} onClick={resetFilters}>
            <ReloadOutlined /> 重置
          </button>
        )}
      >
        <div className="filter-grid order-filter-grid">
          <label className="order-query-field">
            <span>关键词</span>
            <div className="order-query-control">
              <SearchOutlined aria-hidden="true" />
              <input
                aria-label="订单池关键词"
                placeholder="订单号 / 客户 / 货品 / 规格"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </label>
          <label>
            <span>客户</span>
            <select value={filters.customerId} onChange={(event) => updateFilter("customerId", event.target.value)}>
              <option value="全部">全部客户</option>
              {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
            </select>
          </label>
          <label>
            <span>类型</span>
            <select value={filters.orderType} onChange={(event) => updateFilter("orderType", event.target.value)}>
              {filterOptions.orderType.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>交付</span>
            <select value={filters.fulfillment} onChange={(event) => updateFilter("fulfillment", event.target.value)}>
              {filterOptions.fulfillment.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>异常</span>
            <select value={filters.exception} onChange={(event) => updateFilter("exception", event.target.value)}>
              {filterOptions.exception.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>对账/欠款</span>
            <select value={filters.finance} onChange={(event) => updateFilter("finance", event.target.value)}>
              {filterOptions.finance.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </FilterBar>
    </>
  );

  if (!selected) {
    return (
      <section className="page-grid split-detail operational-split-workbench order-pool-workbench">
        <OperationalPanel className="table-pane order-pool-list-panel" ariaLabel="订单明细列表">
          {filterBar}
          <DataState title="暂无订单明细" detail="请检查筛选条件或确认订单数据是否已同步。" />
        </OperationalPanel>
        <DetailPane className="order-pool-detail-pane" title="订单池" subtitle="暂无可显示明细">
          <OrderDetailFacts rows={[["列表来源", getOrderPoolSourceLabel(orderPoolMeta)]]} />
          <DataState title="没有可显示的订单详情" compact />
        </DetailPane>
      </section>
    );
  }
  const apiDetail = selectedOrderDetail?.orderLine?.id === selected.id ? selectedOrderDetail : null;
  const customerInfo = findCustomer(selected.customerId);
  const selectedFulfillment = fulfillments.find((item) => item.lineId === selected.id);
  const apiFulfillment = apiDetail?.fulfillment?.[0];
  const selectedStatement = getStatementForLine(statements, selected.id);
  const apiStatement = apiDetail?.statement?.[0];
  const financeState = getOrderFinanceState(selected, statements);
  const exceptionState = getOrderExceptionState(selected);
  const orderActionBlocker = getOrderLineMutationBlocker(selected);
  const quantityActionState = getOrderActionState(getUiActionState, "调整正式单数量", orderActionBlocker);
  const voidActionState = getOrderActionState(getUiActionState, "作废正式单", orderActionBlocker);
  const colorSpec = getLineColorSpecLabel(selected);
  const lineRemark = getLineRemark(selected);

  async function copyOrderSummary() {
    const summary = [
      customerInfo.name,
      `${selected.orderNo}-${selected.lineNo}`,
      selected.product,
      selected.size,
      colorSpec,
      `${selected.qty}个`,
      selected.fulfillment,
      selected.latest,
      lineRemark,
    ].filter(Boolean).join(" / ");
    try {
      await navigator.clipboard.writeText(summary);
      setToast("订单摘要已复制。");
    } catch {
      setToast("复制失败，请检查浏览器剪贴板权限。");
    }
  }

  return (
    <section className="page-grid split-detail operational-split-workbench order-pool-workbench">
      <OperationalPanel className="table-pane order-pool-list-panel" ariaLabel="订单明细列表">
        {filterBar}
        <DataTable
          className="order-table"
          columns={["订单 / 客户", "货品与规格", "数量", "状态", "交付", "异常", "对账"]}
          rows={filtered.map((row) => {
            const rowColorSpec = getLineColorSpecLabel(row);
            const rowRemark = getLineRemark(row);
            const rowException = getOrderExceptionState(row);
            const rowFinance = getOrderFinanceState(row, statements);
            return {
              id: row.id,
              active: row.id === selected.id,
              tone: statusTone(row.status),
              onClick: () => setSelectedOrderId(row.id),
              cells: [
                <OrderCell primary={getOrderLineShortNo(row)} secondary={findCustomer(row.customerId).name} />,
                <OrderCell
                  primary={row.product}
                  secondary={[row.size, rowColorSpec, rowRemark].filter(Boolean).join(" · ")}
                  tags={(
                    <SemanticTag
                      kind="business"
                      size="compact"
                      value={getBusinessTypeTagValue(row.orderType)}
                    />
                  )}
                />,
                <span className="order-quantity-cell"><strong>{row.qty}</strong><small>个</small></span>,
                <SemanticTag kind="state" label={row.status} size="compact" value={getOperationalStateTagValue(row.status)} />,
                <OrderCell primary={row.fulfillment} secondary={row.latest} />,
                <SemanticTag kind="state" label={rowException} size="compact" value={getOperationalStateTagValue(rowException)} />,
                <SemanticTag kind="state" label={rowFinance} size="compact" value={getOperationalStateTagValue(rowFinance)} />,
              ],
            };
          })}
        />
      </OperationalPanel>
      <DetailPane className="order-pool-detail-pane" title={`${selected.orderNo}-${selected.lineNo}`} subtitle={customerInfo.name}>
        <div className="order-pool-detail-scroll">
          <div className="order-pool-detail-overview">
            <div className="order-detail-statuses" aria-label="当前订单状态">
              <SemanticTag kind="business" size="compact" value={getBusinessTypeTagValue(selected.orderType)} />
              <SemanticTag kind="state" label={selected.status} size="compact" value={getOperationalStateTagValue(selected.status)} />
              {exceptionState !== "正常" ? (
                <SemanticTag kind="state" label={exceptionState} size="compact" value="blocked" />
              ) : (
                <SemanticTag kind="state" label={financeState} size="compact" value={getOperationalStateTagValue(financeState)} />
              )}
            </div>
            <div className="order-detail-product">
              <div>
                <span>货品摘要</span>
                <strong>{selected.product}</strong>
                <small>{[selected.size, colorSpec, lineRemark].filter(Boolean).join(" · ")}</small>
              </div>
              <dl>
                <div><dt>数量</dt><dd>{selected.qty}<small> 个</small></dd></div>
                <div><dt>金额</dt><dd>{money(selected.amount)}</dd></div>
              </dl>
            </div>
          </div>
          <div className="operational-detail-tabs">
            <Segmented ariaLabel="订单详情视图" value={detailTab} onChange={setDetailTab} items={ORDER_DETAIL_TABS} />
          </div>
          {detailTab === "订单" ? (
            <>
              <OrderDetailSection title="订单信息">
                <OrderDetailFacts
                  rows={[
                    ["订单类型", <SemanticTag kind="business" value={getBusinessTypeTagValue(selected.orderType)} />],
                    ["交付方式", selected.fulfillment],
                    ["最晚时间", selected.latest],
                    ["库存状态", getOrderDetailInventoryLabel(apiDetail, selected.inventory)],
                  ]}
                />
              </OrderDetailSection>
              <OrderDetailSection title="印刷与生产">
                <OrderDetailFacts
                  rows={[
                    ["印刷", selected.print === "是" ? "需要印刷" : "非印刷"],
                    ["印刷颜色", selected.print === "是" ? selected.printColor || "待确认" : "非印刷"],
                    ["印刷面", selected.print === "是" ? selected.printSide || "待确认" : "非印刷"],
                    ["提手颜色", selected.handleColor || "同袋色/未特殊"],
                    ["生产状态", selected.print === "是" ? selected.status : "不进生产"],
                    ["备注", lineRemark || "无"],
                  ]}
                />
              </OrderDetailSection>
              <OrderDetailSection title="流转记录" className="order-flow-section">
                <Timeline items={["订单确认", selected.print === "是" ? "丝印/制袋" : "查库存", selectedFulfillment ? `交付：${selectedFulfillment.status}` : apiFulfillment ? `交付：${apiFulfillment.status}` : selected.status, selectedStatement ? `对账：${selectedStatement.status}` : apiStatement ? `对账：${apiStatement.status}` : "待进入对账", orderPoolMeta?.detailLoading ? "详情读取中" : apiDetail ? "详情已同步" : "关键修改需留痕"]} />
              </OrderDetailSection>
            </>
          ) : detailTab === "交付" ? (
            <OrderDetailSection title="打包与交付" className="operational-detail-section-first">
              <OrderDetailFacts
                rows={[
                  ["交付方式", selected.fulfillment],
                  ["交付状态", selectedFulfillment?.status ?? apiFulfillment?.status ?? selected.status],
                  ["包裹/单据", selectedFulfillment ? `${selectedFulfillment.packages} / ${selectedFulfillment.printed ? "已打印" : "未打印"}` : apiFulfillment ? `${apiFulfillment.expectedQty} 个 / ${apiFulfillment.status}` : "未生成出库记录"],
                  ["交付定位", selectedFulfillment ? selectedFulfillment.lineId : apiFulfillment?.orderLineId ?? "无对应出库记录"],
                  ["最晚时间", selected.latest],
                  ["库存来源", getOrderDetailInventoryLabel(apiDetail, selected.inventory)],
                ]}
              />
            </OrderDetailSection>
          ) : (
            <OrderDetailSection title="对账与收款" className="operational-detail-section-first">
              <OrderDetailFacts
                rows={[
                  ["财务状态", financeState],
                  ["对账单", selectedStatement?.id ?? apiStatement?.statementId ?? "未生成"],
                  ["应收/已收", selectedStatement ? `${money(selectedStatement.receivable)} / ${money(selectedStatement.received)}` : apiStatement ? `${money(apiStatement.receivable)} / ${money(apiStatement.received)}` : `${money(selected.amount)} / 未登记`],
                  ["差额", selectedStatement ? money(selectedStatement.variance || 0) : apiStatement ? money(apiStatement.variance || 0) : customerInfo.debt ? money(customerInfo.debt) : "无"],
                  ["客户欠款", customerInfo.debt ? money(customerInfo.debt) : "无"],
                  ["账期", selectedStatement?.period ?? apiStatement?.period ?? "待生成"],
                ]}
              />
            </OrderDetailSection>
          )}
        </div>
        <div className="action-row operational-detail-actions order-pool-detail-actions">
          <button type="button" className="icon-button" aria-label="复制订单摘要" title="复制订单摘要" onClick={copyOrderSummary}><CopyOutlined /></button>
          <button type="button" className="primary-action" onClick={() => selectedFulfillment ? onLocateFulfillment(selected.id) : setToast("当前明细没有对应出库记录。")}> <InboxOutlined />定位出库</button>
          <button type="button" onClick={() => selectedStatement ? onLocateStatement(selected.id) : setToast("当前明细没有对应对账记录。")}> <AccountBookOutlined />定位对账</button>
          <button type="button" disabled={quantityActionState.disabled} title={quantityActionState.title} onClick={() => onOrderAction("quantity", selected)}><EditOutlined />调整数量</button>
          <button type="button" className="order-danger-action" disabled={voidActionState.disabled} title={voidActionState.title} onClick={() => onOrderAction("void", selected)}><StopOutlined />作废</button>
        </div>
      </DetailPane>
    </section>
  );
}

function OrderStatusTabs({ value, counts, onChange }) {
  return (
    <div className="order-status-tabs" role="tablist" aria-label="订单状态快捷筛选">
      {ORDER_STATUS_FILTERS.map((status) => (
        <button
          type="button"
          role="tab"
          aria-selected={value === status}
          className={value === status ? "active" : ""}
          key={status}
          onClick={() => onChange(status)}
        >
          <span>{status === "全部" ? "全部订单" : status}</span>
          <strong>{counts[status] ?? 0}</strong>
        </button>
      ))}
    </div>
  );
}

function OrderCell({ primary, secondary, tags = null }) {
  return (
    <span className="order-cell-stack" title={[primary, secondary].filter(Boolean).join(" / ")}>
      <strong>{primary}</strong>
      {secondary || tags ? (
        <span className="order-cell-support">
          {secondary ? <small>{secondary}</small> : null}
          {tags ? <span className="order-cell-tags">{tags}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

function OrderDetailSection({ title, className = "", children }) {
  return (
    <section className={`detail-section order-pool-detail-section ${className}`.trim()}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function OrderDetailFacts({ rows }) {
  return (
    <dl className="order-detail-facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
