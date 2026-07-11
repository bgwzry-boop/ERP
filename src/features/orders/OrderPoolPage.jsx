import {
  DataState,
  DataTable,
  DetailPane,
  FilterBar,
  InfoGrid,
  OperationalPanel,
  Timeline,
} from "../../shared/ui/operational.jsx";

export function OrderPoolPage({ orderLines, fulfillments, statements, selectedOrderId, setSelectedOrderId, filters, setFilters, orderPoolMeta, selectedOrderDetail, onLocateFulfillment, onLocateStatement, onOrderAction, setToast, helpers }) {
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
  const filtered = orderLines.filter((item) => orderMatchesFilters(item, filters, statements));
  const selected = filtered.find((item) => item.id === selectedOrderId) ?? filtered[0] ?? orderLines[0];
  const filterOptions = {
    status: ["全部", "待处理", "生产中", "待出库", "缺货", "已交付", "待对账"],
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
    setToast("订单池筛选已重置。");
  }

  const filterBar = (
    <FilterBar
      className="order-pool-filter-bar"
      ariaLabel="订单池筛选"
      summary={`命中 ${filtered.length} / ${orderLines.length} 行；${getOrderPoolSourceLabel(orderPoolMeta)}。`}
      actions={<button onClick={resetFilters}>重置筛选</button>}
    >
      <div className="filter-grid order-filter-grid">
        <label>
          <span>客户</span>
          <select value={filters.customerId} onChange={(event) => updateFilter("customerId", event.target.value)}>
            <option value="全部">全部客户</option>
            {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
          </select>
        </label>
        <label>
          <span>状态</span>
          <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
            {filterOptions.status.map((item) => <option key={item}>{item}</option>)}
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
  );

  if (!selected) {
    return (
      <section className="page-grid split-detail order-pool-workbench">
        <OperationalPanel className="table-pane order-pool-list-panel" ariaLabel="订单明细列表">
          {filterBar}
          <DataState title="暂无订单明细" detail="请检查筛选条件或确认订单数据是否已同步。" />
        </OperationalPanel>
        <DetailPane className="order-pool-detail-pane" title="订单池" subtitle="暂无可显示明细">
          <InfoGrid rows={[["列表", getOrderPoolSourceLabel(orderPoolMeta)]]} />
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
  return (
    <section className="page-grid split-detail order-pool-workbench">
      <OperationalPanel className="table-pane order-pool-list-panel" ariaLabel="订单明细列表">
        {filterBar}
        <DataTable
          className="order-table"
          columns={["订单/明细", "客户", "品名", "尺寸", "颜色", "提手", "数量", "类型", "状态", "交付", "异常", "对账"]}
          rows={filtered.map((row) => ({
            id: row.id,
            active: row.id === selected.id,
            tone: statusTone(row.status),
            onClick: () => setSelectedOrderId(row.id),
            cells: [getOrderLineShortNo(row), findCustomer(row.customerId).name, row.product, row.size, row.color, row.handle, row.qty, row.orderType, row.status, row.fulfillment, getOrderExceptionState(row), getOrderFinanceState(row, statements)],
          }))}
        />
      </OperationalPanel>
      <DetailPane className="order-pool-detail-pane" title={`${selected.orderNo}-${selected.lineNo}`} subtitle={`${customerInfo.name} · ${selected.status}`}>
        <InfoGrid
          rows={[
            ["产品", `${selected.product} / ${selected.size} / ${getLineColorSpecLabel(selected)}`],
            ["数量", `${selected.qty} 个`],
            ["交付", `${selected.fulfillment} · ${selected.latest}`],
            ["库存", getOrderDetailInventoryLabel(apiDetail, selected.inventory)],
            ["金额", money(selected.amount)],
            ["异常", selected.exceptions.length ? selected.exceptions.join("、") : exceptionState],
            ["对账", selectedStatement ? `${selectedStatement.status} · ${selectedStatement.period}` : apiStatement ? `${apiStatement.status} · ${apiStatement.period}` : financeState],
            ["客户欠款", customerInfo.debt ? money(customerInfo.debt) : "无"],
          ]}
        />
        <section className="detail-section">
          <h3>生产 / 库存</h3>
          <InfoGrid
            rows={[
              ["订单类型", selected.orderType],
              ["印刷", selected.print === "是" ? "需要印刷" : "非印刷"],
              ["印刷颜色", selected.print === "是" ? selected.printColor || "待确认" : "非印刷"],
              ["印刷面", selected.print === "是" ? selected.printSide || "待确认" : "非印刷"],
              ["提手颜色", selected.handleColor || "同袋色/未特殊"],
              ["备注", getLineRemark(selected) || "无"],
              ["生产状态", selected.print === "是" ? selected.status : "不进生产"],
              ["库存状态", `${selected.inventory}；正式动作前需重校验`],
            ]}
          />
        </section>
        <section className="detail-section">
          <h3>打包 / 交付</h3>
          <InfoGrid
            rows={[
              ["交付方式", selected.fulfillment],
              ["交付状态", selectedFulfillment?.status ?? apiFulfillment?.status ?? selected.status],
              ["包裹/单据", selectedFulfillment ? `${selectedFulfillment.packages} / ${selectedFulfillment.printed ? "已打印" : "未打印"}` : apiFulfillment ? `${apiFulfillment.expectedQty} 个 / ${apiFulfillment.status}` : "未生成出库记录"],
              ["交付定位", selectedFulfillment ? selectedFulfillment.lineId : apiFulfillment?.orderLineId ?? "无对应出库记录"],
            ]}
          />
        </section>
        <section className="detail-section">
          <h3>对账 / 收款</h3>
          <InfoGrid
            rows={[
              ["财务状态", financeState],
              ["对账单", selectedStatement?.id ?? apiStatement?.statementId ?? "未生成"],
              ["应收/已收", selectedStatement ? `${money(selectedStatement.receivable)} / ${money(selectedStatement.received)}` : apiStatement ? `${money(apiStatement.receivable)} / ${money(apiStatement.received)}` : `${money(selected.amount)} / 未登记`],
              ["差额", selectedStatement ? money(selectedStatement.variance || 0) : apiStatement ? money(apiStatement.variance || 0) : customerInfo.debt ? money(customerInfo.debt) : "无"],
            ]}
          />
        </section>
        <section className="detail-section">
          <h3>流转摘要</h3>
          <Timeline items={["订单确认", selected.print === "是" ? "丝印/制袋" : "查库存", selectedFulfillment ? `交付：${selectedFulfillment.status}` : apiFulfillment ? `交付：${apiFulfillment.status}` : selected.status, selectedStatement ? `对账：${selectedStatement.status}` : apiStatement ? `对账：${apiStatement.status}` : "待进入对账", orderPoolMeta?.detailLoading ? "详情读取中" : apiDetail ? "详情已同步" : "关键修改需留痕"]} />
        </section>
        <div className="action-row">
          <button onClick={() => setToast("已复制订单摘要。")}>复制</button>
          <button onClick={() => selectedFulfillment ? onLocateFulfillment(selected.id) : setToast("当前明细没有对应出库记录。")}>定位出库</button>
          <button onClick={() => selectedStatement ? onLocateStatement(selected.id) : setToast("当前明细没有对应对账记录。")}>定位对账</button>
          <button onClick={() => setToast("已打开订单详情占位；正式详情页后接。")}>打开详情</button>
          <button disabled={quantityActionState.disabled} title={quantityActionState.title} onClick={() => onOrderAction("quantity", selected)}>调整数量</button>
          <button disabled={voidActionState.disabled} title={voidActionState.title} onClick={() => onOrderAction("void", selected)}>作废正式单</button>
        </div>
      </DetailPane>
    </section>
  );
}

function getOrderActionState(getUiActionState, action, blocker) {
  const permissionState = getUiActionState?.("orders", action) ?? { disabled: false, title: "" };
  if (permissionState.disabled) return permissionState;
  if (blocker) return { disabled: true, title: blocker };
  return permissionState;
}

function getOrderLineMutationBlocker(line) {
  const status = String(line?.status ?? line?.lineStatus ?? "").trim();
  if (!line) return "没有选中的订单明细。";
  if (!status) return "订单状态不完整，不能直接修改。";
  if (status.includes("已关闭") || status.includes("已取消") || status.includes("已交付")) return "已交付、已关闭或已取消的订单不能直接改量或作废。";
  if (status.includes("丝印") || status.includes("制袋") || status.includes("打包")) return "已进入生产或打包的订单不能在订单池直接改量或作废。";
  return "";
}

function getOrderPoolSourceLabel(meta = {}) {
  if (meta.loading) return "正在读取后端订单池";
  if (meta.source === "api") {
    const syncText = meta.lastSyncedAt ? `，${meta.lastSyncedAt} 同步` : "";
    return `后端订单池 ${meta.total ?? 0} 行${syncText}`;
  }
  if (meta.source === "api_error") return `后端订单池返回错误，保留当前列表`;
  if (meta.source === "local_fallback") return "后端未连接，使用本地演示数据";
  return "本地演示数据";
}

function getOrderDetailInventoryLabel(detail, fallback) {
  const traces = Array.isArray(detail?.inventory) ? detail.inventory : [];
  if (!traces.length) return fallback || "未记录";
  const states = [...new Set(traces.map((item) => item.state).filter(Boolean))];
  const reservedQty = traces.reduce((sum, item) => sum + Number(item.reservedQty || 0), 0);
  const stateText = states.length ? states.join("、") : fallback || "库存占用";
  return reservedQty > 0 ? `${stateText}；占用 ${reservedQty}` : stateText;
}
