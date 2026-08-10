import { useMemo, useState } from "react";
import {
  CheckCircleOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  availableQty,
  getLineColorSpecLabel,
  getStockStateGroup,
  getStockTrustLabel,
  money,
  sortTodos,
} from "../../../../src/domain/officeRules.js";
import {
  getBusinessTypeTagValue,
  getRequirementTagValue,
} from "../../../../src/shared/labels.js";
import { SemanticTag as SharedSemanticTag } from "../../../../src/shared/ui/operational.jsx";
import { FactoryColorLabel } from "./FactoryColor.jsx";
import { completedBusinessWorkspaceIds } from "./workspaceCoverage.js";

const formatNumber = (value) => new Intl.NumberFormat("zh-CN").format(Number(value) || 0);
const customerName = (value, customerNames = new Map()) => {
  if (value && typeof value === "object") return value.customerName || customerNames.get(value.customerId) || value.customerId || "客户待确认";
  return customerNames.get(value) || value || "客户待确认";
};
const visibleEntryProduct = (line = {}) => String(line.product || "").trim() === "空白袋" ? "" : String(line.product || "").trim();

function businessTypeFor(line = {}) {
  const type = String(line.orderType || "");
  if (type.includes("定制")) return "定制单";
  if (type.includes("印刷通货")) return "印刷通货";
  if (type.includes("外加工")) return "外加工";
  return "现货通货";
}

function requirementFor(line = {}) {
  if (line.handle === "加长提" || String(line.note || "").includes("加长提")) return "加长提";
  if (line.printSide === "双面") return "双面印";
  return "";
}

function riskFor(line = {}) {
  if (Array.isArray(line.exceptions) && line.exceptions.length) return line.exceptions.join("、");
  if (String(line.inventory || "").includes("缺货")) return "库存不足";
  return "—";
}

function StateText({ children }) {
  return <span className={`business-state ${stateTone(String(children))}`}>{children}</span>;
}

const activeProductionStatusPattern = /丝印中|制袋中|生产中|印刷中|跨日继续/;

function buildMachineLabels(machines = []) {
  return new Map(machines.map((machine) => [
    String(machine.machineId || machine.id || "").trim(),
    machine.name || machine.machineLabel || machine.machineId || "",
  ]));
}

function productionMachineLabel(line = {}, machineLabels = new Map()) {
  const machineId = String(line.machineId || "").trim();
  if (machineId) return machineLabels.get(machineId) || machineId;
  return activeProductionStatusPattern.test(String(line.status || "")) ? "机台待确认" : "未排定";
}

function miniappProgressLabel(line = {}) {
  const status = String(line.status || "");
  if (/已取消|已作废/.test(status)) return "已取消";
  if (/已完成|已交付|已关闭/.test(status)) return "已完成";
  if (/配送中|运输中/.test(status)) return "运输中";
  if (/待出库|已备货|待交付|待自提|待提货/.test(status)) return "待发货/待自提";
  if (/待排产|已排产|丝印|制袋|生产|待打包|跨日继续|待完工确认|异常暂停|数量差异/.test(status)) return "生产中";
  return line.orderNo ? "备货中" : "工厂确认中";
}

function stateTone(value) {
  if (/异常|差异|阻塞|失败|缺货|冻结|待补|未就绪/.test(value)) return "danger";
  if (/已完成|正常|有效|通过|可用|可出库|已核算|在线|已清点|已交付|已启用/.test(value)) return "success";
  if (/生产中|印刷中|制袋中|打包中|配送中|已备货/.test(value)) return "info";
  return "warning";
}

function SemanticOrderTag({ kind, value }) {
  const resolved = kind === "business" ? getBusinessTypeTagValue(value) : getRequirementTagValue(value);
  return <SharedSemanticTag kind={kind} label={value} size="compact" value={resolved} />;
}

function WorkbenchHeadingActions({ countLabel, onRefresh }) {
  return <div className="business-heading-actions">
    {countLabel ? <span>{countLabel}</span> : null}
    <button aria-label="刷新当前工作台" onClick={onRefresh} type="button"><ReloadOutlined />刷新</button>
  </div>;
}

function buildProductionRows(tasks = [], orderLines = [], customerNames = new Map(), machineLabels = new Map()) {
  const orderById = new Map(orderLines.map((line) => [line.id || line.orderLineId, line]));
  return tasks.map((task) => {
    const taskFacts = task.productionTask || {};
    const taskLine = task.orderLine || orderById.get(task.orderLineId) || {};
    const line = {
      ...taskLine,
      id: task.orderLineId || taskLine.orderLineId,
      product: taskLine.productName || taskLine.product || "货品待确认",
      qty: taskFacts.plannedQty || taskLine.originalQty || taskLine.qty || 0,
      status: taskFacts.status || taskFacts.taskStatus || taskLine.lineStatus || "待确认",
      machineId: taskFacts.machineId,
      color: taskLine.bagColor || taskLine.color,
    };
    return {
      id: task.productionTaskId,
      detailEyebrow: customerName(line, customerNames),
      detailTitle: line.product,
  cells: [
    customerName(line, customerNames),
    line.product,
    `${line.size} · ${getLineColorSpecLabel(line) || line.color}`,
    `${formatNumber(line.qty)}个`,
    productionMachineLabel(line, machineLabels),
    line.status,
  ],
  status: line.status,
  details: [
    ["生产任务", task.productionTaskId],
    ["订单明细", line.id],
    ["客户", customerName(line, customerNames)],
    ["货品", line.product],
    ["规格", line.size],
    ["颜色", getLineColorSpecLabel(line) || line.color],
    ["计划数量", `${formatNumber(line.qty)}个`],
    ["执行机台", productionMachineLabel(line, machineLabels)],
    ["内部工序", line.status],
    ["小程序进度", miniappProgressLabel(line)],
    ...(Array.isArray(line.exceptions) && line.exceptions.length
      ? [["待处理事项", line.exceptions.join("、")]]
      : []),
  ],
    };
  });
}

function buildPackingRows(tasks = [], orderLines = [], customerNames = new Map()) {
  const orderById = new Map(orderLines.map((line) => [line.id || line.orderLineId, line]));
  return tasks.map((task) => {
    const packing = task.packingTask || {};
    const line = task.orderLine || orderById.get(task.orderLineId) || {};
    return {
  id: task.packingTaskId,
  cells: [
    task.packingTaskId,
    `${customerName(line, customerNames)} · ${line.productName || line.product || "货品待确认"}`,
    `${formatNumber(packing.plannedQty)}个`,
    `${formatNumber(packing.actualPackedQty)}个 / ${task.packageCount || packing.packageCount || 0}包`,
    packing.status || "待确认",
  ],
  status: packing.status || "待确认",
  details: [
    ["打包任务", task.packingTaskId],
    ["订单明细", task.orderLineId],
    ["客户", customerName(line, customerNames)],
    ["计划数量", `${formatNumber(packing.plannedQty)}个`],
    ["实际打包", `${formatNumber(packing.actualPackedQty)}个`],
    ["包数", `${task.packageCount || packing.packageCount || 0}包`],
  ],
    };
  });
}

function buildPrintRows(printJobs = [], printDevices = []) {
  const deviceRows = printDevices.map((device) => ({
    id: device.printDeviceId,
    cells: ["设备验收", device.name, device.status === "active" ? "已启用" : device.status || "待确认", device.driverName || "驱动待确认", device.status === "active" ? "在线" : "待检查"],
    status: device.status === "active" ? "在线" : "待检查",
    modes: ["全部", "设备验收"],
    details: [["设备编号", device.printDeviceId], ["设备名称", device.name], ["驱动", device.driverName || "待确认"], ["纸张", device.paperName || "待确认"]],
  }));
  const jobRows = printJobs.map((job) => ({
    id: job.printJobId,
    cells: ["打印作业", job.documentType || "打印任务", job.jobStatus || "待确认", job.printDeviceSnapshot?.name || job.printDeviceId || "设备待确认", job.jobStatus || "待确认"],
    status: job.jobStatus || "待确认",
    modes: ["全部", "打印作业"],
    details: [["打印作业", job.printJobId], ["目标业务", `${job.targetType || "—"} · ${job.targetId || "—"}`], ["文档类型", job.documentType || "待确认"], ["设备", job.printDeviceSnapshot?.name || job.printDeviceId || "待确认"]],
  }));
  return [...deviceRows, ...jobRows];
}

const finishedGoodsCategories = ["全部成品", "无纺布袋", "覆膜无纺布袋"];
const finishedGoodsTypes = ["全部类型", "纯色通货", "印刷通货"];

function classifyFinishedInventory(stock) {
  if (stock.category && stock.goodsType) return stock;
  const laminated = /覆膜/.test(`${stock.style || ""} ${stock.zone || ""}`);
  const printed = !/空白袋|纯色/.test(stock.style || "");
  return {
    ...stock,
    category: laminated ? "覆膜无纺布袋" : "无纺布袋",
    goodsType: printed ? "印刷通货" : "纯色通货",
    pattern: printed ? stock.style || "图案待确认" : "—",
    productName: printed ? "印刷通货袋" : "纯色通货袋",
  };
}

function buildFinishedGoodsInventoryRecords(items = []) {
  return items.map(classifyFinishedInventory).map((stock) => ({
  ...stock,
  available: availableQty(stock),
  trust: getStockTrustLabel(stock),
  stateLabel: getStockStateGroup(stock),
  }));
}

function getFinishedInventoryException(stock) {
  if (!stock) return "";
  const evidence = `${stock.state || ""} ${stock.trust || ""}`;
  if (/冻结/.test(evidence)) return "冻结";
  if (/差异/.test(evidence)) return "盘点差异";
  if (stock.estimated || /待复核/.test(evidence)) return "待复核";
  if (stock.stateLabel === "缺货") return "缺货";
  if (/报废|待处理/.test(evidence) || Number(stock.pending) > 0) return "待处理";
  return "";
}

function InventoryAllocation({ stock, variant = "compact" }) {
  const inStock = Math.max(0, Number(stock?.inStock) || 0);
  const available = Math.max(0, Number(stock?.available) || 0);
  const reserved = Math.max(0, Number(stock?.reserved) || 0);
  const locked = Math.max(0, Number(stock?.locked) || 0);
  const pending = Math.max(0, Number(stock?.pending) || 0);
  const allocationBase = Math.max(inStock, available + reserved + locked + pending, 1);
  const availableRate = inStock > 0 ? Math.round((available / inStock) * 100) : 0;
  const exception = getFinishedInventoryException(stock);
  const parts = [
    ["available", "可用", available],
    ["reserved", "占用", reserved],
    ["locked", "锁定", locked],
    ["pending", "待处理", pending],
  ];
  const allocationLabel = `在库 ${formatNumber(inStock)}，可用 ${formatNumber(available)}，占用 ${formatNumber(reserved)}，锁定 ${formatNumber(locked)}，待处理 ${formatNumber(pending)}`;

  return <div className={`inventory-allocation ${variant}`}>
    {variant === "detail" ? <div className="inventory-allocation-total"><span>在库</span><strong>{formatNumber(inStock)}</strong></div> : null}
    <div aria-label={allocationLabel} className="inventory-allocation-track" role="img">
      {parts.filter(([, , value]) => value > 0).map(([key, label, value]) => <span aria-hidden="true" className={`inventory-allocation-segment ${key}`} key={key} style={{ width: `${(value / allocationBase) * 100}%` }} title={`${label} ${formatNumber(value)}`} />)}
    </div>
    <div className="inventory-allocation-legend">
      <strong className="available">可用 {formatNumber(available)}（{availableRate}%）</strong>
      <span>占用 {formatNumber(reserved)}</span>
      <span>锁定 {formatNumber(locked)}</span>
      {pending > 0 ? <span className="pending">待处理 {formatNumber(pending)}</span> : null}
      {exception && pending <= 0 ? <span className="exception">{exception}</span> : null}
    </div>
  </div>;
}

function buildFulfillmentRows(items = []) {
  return items.map((item) => ({
  id: item.id || item.fulfillmentId,
  cells: [
    `${customerName(item)} · ${item.lineId || item.orderLineId}`,
    item.goods || item.goodsSpec,
    item.methodLabel || item.method,
    `${formatNumber(item.qty ?? item.expectedQty)}个 / ${item.packages || item.package || `${item.packageCount || 0}包`}`,
    item.status,
  ],
  status: item.status,
  details: [
    ["交付任务", item.id || item.fulfillmentId],
    ["客户", customerName(item)],
    ["订单明细", item.lineId || item.orderLineId],
    ["货品", item.goods || item.goodsSpec],
    ["数量与包装", `${formatNumber(item.qty ?? item.expectedQty)}个 / ${item.packages || item.package || `${item.packageCount || 0}包`}`],
    ["交付方式", item.methodLabel || item.method],
    ["要求时间", item.latest || item.latestNeededAt || "待确认"],
    ["库位", item.zone || "待确认"],
  ],
  }));
}

function statementStatusLabel(status) {
  return ({ current_period: "本期待对账", debt_or_variance: "有欠款/差异", payment_pending: "收款待确认", settled: "已结清" })[status] || status || "待确认";
}

function buildStatementRows(items = []) {
  return items.map((statement) => ({
  id: statement.statementId || statement.id,
  cells: [
    `${customerName(statement)} · ${statement.settlementCycle || "账期待确认"}`,
    money(statement.currentReceivable),
    money(Math.max(0, Number(statement.currentReceivable || 0) - Number(statement.debtAmount || 0))),
    money(statement.debtAmount),
    statementStatusLabel(statement.status),
  ],
  status: statementStatusLabel(statement.status),
  details: [
    ["对账单", statement.statementId || statement.id],
    ["客户", customerName(statement)],
    ["结算周期", statement.settlementCycle || "待确认"],
    ["本期应收", money(statement.currentReceivable)],
    ["欠款/差异", money(statement.debtAmount)],
    ["最近对账", statement.lastStatementAt || "待确认"],
  ],
  }));
}

function buildCustomerRows(orderLines = [], statements = []) {
  const records = new Map();
  for (const statement of statements) {
    records.set(statement.customerId, {
      id: statement.customerId,
      name: statement.customerName || statement.customerId,
      settlementCycle: statement.settlementCycle || "待确认",
      receivable: Number(statement.currentReceivable || 0),
      status: statementStatusLabel(statement.status),
    });
  }
  for (const line of orderLines) {
    if (!records.has(line.customerId)) records.set(line.customerId, { id: line.customerId, name: line.customerName || line.customerId, settlementCycle: "待确认", receivable: 0, status: "正常" });
  }
  return [...records.values()].map((item) => ({
    id: item.id,
    cells: [item.name, item.id, item.settlementCycle, money(item.receivable), item.status],
    status: item.status,
    details: [["客户编号", item.id], ["客户名称", item.name], ["结算周期", item.settlementCycle], ["当前应收", money(item.receivable)]],
  }));
}

function buildPeopleMachineRows(employees = [], machines = []) {
  const machineById = new Map(machines.map((machine) => [machine.machineId, machine]));
  return employees.map((employee) => {
    const machine = machineById.get(employee.configuredMachineId || employee.defaultMachineId);
    return {
      id: employee.employeeId,
      cells: [employee.name, employee.loginName || "待分配", employee.roleName || "待确认", employee.defaultWorkshop || "—", machine?.machineLabel || employee.configuredMachineLabel || "未绑定", employee.statusLabel || employee.status],
      status: employee.statusLabel || employee.status,
      details: [["员工编号", employee.employeeId], ["姓名", employee.name], ["账号", employee.loginName || "待分配"], ["岗位", employee.roleName || "待确认"], ["车间", employee.defaultWorkshop || "—"], ["机台", machine?.machineLabel || employee.configuredMachineLabel || "未绑定"]],
    };
  });
}

function buildWorkspaceConfigs(formal) {
  const data = formal.data;
  const customerNames = new Map(data.orderLines.map((line) => [line.customerId, line.customerName || line.customerId]));
  const machineLabels = buildMachineLabels(data.machines);
  const productionRows = buildProductionRows(data.productionTasks, data.orderLines, customerNames, machineLabels);
  const packingRows = buildPackingRows(data.packingTasks, data.orderLines, customerNames);
  const printRows = buildPrintRows(data.printJobs, data.printDevices);
  const fulfillmentRows = buildFulfillmentRows(data.fulfillments);
  const statementRows = buildStatementRows(data.statements);
  return {
  "production-tasks": {
    title: "生产任务",
    description: "来自 ProductionPackingPage；办公室负责发布与协调，现场仍由岗位手机端报工。",
    columns: ["客户", "品名", "规格 / 颜色", "计划数量", "机台", "状态"],
    gridTemplateColumns: "minmax(112px, 1.2fr) minmax(100px, 1.05fr) minmax(140px, 1.35fr) minmax(82px, .75fr) minmax(92px, .8fr) minmax(78px, .72fr)",
    rows: productionRows,
    primaryAction: "查看生产任务",
    source: "正式生产任务 API",
    showSourceEvidence: false,
  },
  "packing-labels": {
    title: "打包任务",
    description: "沿用 ProductionPackingPage 的打包任务生成规则，不把打包完成等同于出库。",
    columns: ["打包任务", "客户 / 货品", "计划数量", "实际 / 包数", "状态"],
    rows: packingRows,
    primaryAction: "查看打包任务",
    source: "正式打包任务 API",
  },
  "print-devices": {
    title: "打印与设备",
    description: "保持设备验收、上线门禁、驱动诊断和打印作业四个真实工作区。",
    modes: ["全部", "设备验收", "上线门禁", "驱动诊断", "打印作业"],
    columns: ["工作区", "处理范围", "当前结果", "同步摘要", "状态"],
    rows: printRows,
    primaryAction: "查看当前工作区",
    source: "正式打印设备与作业 API",
  },
  "outbound-delivery": {
    title: "出库交付",
    description: "沿用 FulfillmentPage 的交付任务、方式、数量、库区和实物状态。",
    columns: ["客户 / 订单", "货品", "交付方式", "数量 / 包装", "状态"],
    rows: fulfillmentRows,
    primaryAction: "查看交付事实",
    source: "正式出库交付 API",
  },
  "customer-statements": {
    title: "对账收款",
    description: "沿用 StatementPage 的客户账期、应收、实收、差额和订单明细。",
    columns: ["客户 / 期间", "应收", "已收", "差额", "状态"],
    rows: statementRows,
    primaryAction: "查看对账明细",
    source: "正式对账 API",
  },
  "customer-records": {
    title: "客户档案",
    columns: ["客户", "客户编号", "结算周期", "当前应收", "状态"],
    rows: buildCustomerRows(data.orderLines, data.statements),
    primaryAction: "查看客户事实",
    source: "正式订单与对账 API",
  },
  "people-machines": {
    title: "员工机台",
    columns: ["员工", "账号", "岗位", "车间", "机台", "状态"],
    rows: buildPeopleMachineRows(data.employeeAccountReviews, data.machines),
    primaryAction: "查看维护字段",
    source: "正式员工账号与机台 API",
  },
  "launch-status": {
    title: "上线状态",
    columns: ["检查对象", "版本 / 范围", "环境", "最后动作", "状态"],
    rows: [],
    primaryAction: "查看发布状态",
    source: "正式发布状态接口尚未提供",
  },
  };
};

function GenericWorkspace({ config, onNavigate }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部状态");
  const [mode, setMode] = useState(config.modes?.[0] || "全部");
  const [selectedId, setSelectedId] = useState(config.rows[0]?.id || "");
  const [notice, setNotice] = useState("");
  const statuses = useMemo(() => [...new Set(config.rows.map((row) => row.status).filter(Boolean))], [config.rows]);
  const rows = useMemo(() => config.rows.filter((row) => {
    const modeMatch = mode === "全部" || row.modes?.includes(mode) || row.cells.some((cell) => String(cell).includes(mode));
    const statusMatch = status === "全部状态" || row.status === status;
    const queryMatch = !query.trim() || [...row.cells, row.id].join(" ").toLowerCase().includes(query.trim().toLowerCase());
    return modeMatch && statusMatch && queryMatch;
  }), [config.rows, mode, query, status]);
  const selected = rows.find((row) => row.id === selectedId) || rows[0] || null;
  const gridTemplateColumns = config.gridTemplateColumns || `minmax(170px, 1.45fr) repeat(${Math.max(0, config.columns.length - 1)}, minmax(92px, 1fr))`;

  function runPrimary() {
    if (selected?.target) onNavigate(selected.target);
    else setNotice("当前记录已从服务器读取；可继续进入对应业务页面处理。 ");
  }

  function reset() {
    setQuery("");
    setStatus("全部状态");
    setMode(config.modes?.[0] || "全部");
    setSelectedId(config.rows[0]?.id || "");
    setNotice("");
  }

  return <div className="business-workbench source-grounded-workbench">
    <section className="business-list-panel">
      <header className="business-panel-heading"><h2>{config.title}</h2><WorkbenchHeadingActions countLabel={`${rows.length} / ${config.rows.length} 条`} onRefresh={config.onRefresh} /></header>
      {config.modes ? <div aria-label={`${config.title}区域`} className="business-subtabs" role="tablist">{config.modes.map((item) => <button aria-selected={mode === item} key={item} onClick={() => { setMode(item); setSelectedId(""); }} role="tab" type="button">{item}</button>)}</div> : null}
      <div className="business-filter-row"><label><SearchOutlined /><input aria-label={`${config.title}搜索`} onChange={(event) => { setQuery(event.target.value); setSelectedId(""); }} placeholder="搜索当前工作台" value={query} /></label><select aria-label={`${config.title}状态`} onChange={(event) => { setStatus(event.target.value); setSelectedId(""); }} value={status}><option>全部状态</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select><button disabled={!query && status === "全部状态" && mode === (config.modes?.[0] || "全部")} onClick={reset} type="button"><ReloadOutlined />重置</button></div>
      <div className="business-table" role="table" aria-label={`${config.title}列表`}>
        <div className="business-row business-head" role="row" style={{ gridTemplateColumns }}>{config.columns.map((column) => <span key={column} role="columnheader">{column}</span>)}</div>
        <div className="business-table-body">{rows.length ? rows.map((row) => <button aria-pressed={selected?.id === row.id} className={`business-row${selected?.id === row.id ? " selected" : ""}`} key={row.id} onClick={() => { setSelectedId(row.id); setNotice(""); }} role="row" style={{ gridTemplateColumns }} type="button">{row.cells.map((cell, index) => <span key={`${row.id}-${index}`} role="cell">{index === row.cells.length - 1 ? <StateText>{cell}</StateText> : cell}</span>)}</button>) : <div className="business-empty"><SearchOutlined /><strong>没有匹配记录</strong><span>调整关键词、状态或区域后重试。</span></div>}</div>
      </div>
    </section>
    <aside className="business-detail-panel">
      <header><span>{selected?.detailEyebrow || `当前选中 · ${config.title}`}</span><h2>{selected?.detailTitle || selected?.cells[0] || config.title}</h2>{selected ? <StateText>{selected.status}</StateText> : null}</header>
      <div className="business-detail-scroll">
        {config.showSourceEvidence === false ? null : <div className="source-provenance"><CheckCircleOutlined /><span>来源已对齐：{config.source}</span></div>}
        <h3>业务事实</h3>
        {selected ? <dl className="business-facts">{selected.details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{String(value || "—")}</dd></div>)}</dl> : <div className="business-empty"><FileTextOutlined /><strong>暂无记录</strong></div>}
        {notice ? <div className="business-notice"><CheckCircleOutlined />{notice}</div> : null}
      </div>
      <footer><button className="primary" disabled={!selected} onClick={runPrimary} type="button">{config.primaryAction}</button>{config.showSourceEvidence === false ? null : <button className="secondary-button" onClick={() => setNotice(`来源：${config.source}`)} type="button">查看数据来源</button>}</footer>
    </aside>
  </div>;
}

function FinishedGoodsClassificationFilters({ category, goodsType, onCategoryChange, onGoodsTypeChange }) {
  return <div className="finished-goods-classification" aria-label="成品分类筛选">
    <div><span>成品大类</span><div role="tablist" aria-label="成品大类">{finishedGoodsCategories.map((item) => <button aria-selected={category === item} key={item} onClick={() => onCategoryChange(item)} role="tab" type="button">{item}</button>)}</div></div>
    <div><span>通货类型</span><div role="tablist" aria-label="通货类型">{finishedGoodsTypes.map((item) => <button aria-selected={goodsType === item} key={item} onClick={() => onGoodsTypeChange(item)} role="tab" type="button">{item}</button>)}</div></div>
  </div>;
}

function FinishedGoodsTypeFilters({ category, goodsType, onGoodsTypeChange }) {
  return <div className="finished-goods-classification inventory-type-filter" aria-label={`${category}通货类型筛选`}>
    <div><span>通货类型</span><div role="tablist" aria-label="通货类型">{finishedGoodsTypes.map((item) => <button aria-selected={goodsType === item} key={item} onClick={() => onGoodsTypeChange(item)} role="tab" type="button">{item}</button>)}</div></div>
  </div>;
}

function filterFinishedGoods(records, category, goodsType, query) {
  const normalized = query.trim().toLowerCase();
  return records.filter((record) => {
    const categoryMatch = category === "全部成品" || record.category === category;
    const typeMatch = goodsType === "全部类型" || record.goodsType === goodsType;
    const queryMatch = !normalized || Object.values(record).join(" ").toLowerCase().includes(normalized);
    return categoryMatch && typeMatch && queryMatch;
  });
}

function FinishedGoodsInventoryWorkspace({ category, formal, onNavigate, title }) {
  const [goodsType, setGoodsType] = useState("全部类型");
  const [query, setQuery] = useState("");
  const finishedGoodsInventoryRecords = useMemo(() => buildFinishedGoodsInventoryRecords(formal.data.inventoryItems), [formal.data.inventoryItems]);
  const categoryRecords = useMemo(() => finishedGoodsInventoryRecords.filter((record) => record.category === category), [category, finishedGoodsInventoryRecords]);
  const [selectedId, setSelectedId] = useState(categoryRecords[0]?.id || "");
  const [notice, setNotice] = useState("");
  const rows = useMemo(() => filterFinishedGoods(finishedGoodsInventoryRecords, category, goodsType, query), [category, goodsType, query]);
  const selected = rows.find((row) => row.id === selectedId) || rows[0] || null;
  const selectedException = getFinishedInventoryException(selected);
  const reset = () => { setGoodsType("全部类型"); setQuery(""); setSelectedId(categoryRecords[0]?.id || ""); setNotice(""); };
  const selectType = (value) => { setGoodsType(value); setSelectedId(""); setNotice(""); };

  return <div className="business-workbench finished-goods-workbench">
    <section className="business-list-panel">
      <header className="business-panel-heading"><h2>{title}</h2><WorkbenchHeadingActions countLabel={`${rows.length} / ${categoryRecords.length} 条`} onRefresh={formal.actions.refreshAll} /></header>
      <FinishedGoodsTypeFilters category={category} goodsType={goodsType} onGoodsTypeChange={selectType} />
      <div className="finished-goods-search"><label><SearchOutlined /><input aria-label={`${title}搜索`} onChange={(event) => { setQuery(event.target.value); setSelectedId(""); }} placeholder="搜索类型 / 规格 / 颜色 / 图案 / 库位" value={query} /></label><button disabled={!query && goodsType === "全部类型"} onClick={reset} type="button"><ReloadOutlined />重置</button></div>
      <div className="finished-goods-table" role="table" aria-label="成品库存列表">
        <div className="finished-inventory-row head" role="row"><span>通货类型</span><span>规格（cm）</span><span>颜色 / 图案</span><span>库位</span><span>在库</span><span>库存结构</span></div>
        <div className="business-table-body">{rows.length ? rows.map((row) => <button aria-pressed={selected?.id === row.id} className={`finished-inventory-row${selected?.id === row.id ? " selected" : ""}`} key={row.id} onClick={() => { setSelectedId(row.id); setNotice(""); }} role="row" type="button"><span><SemanticOrderTag kind="business" value={row.goodsType} /></span><span className="finished-inventory-spec"><strong>{row.size}</strong></span><span className="finished-inventory-attributes"><FactoryColorLabel color={row.color} /><span>· {row.handle}{row.pattern !== "—" ? ` · ${row.pattern}` : ""}</span></span><span className="finished-inventory-location">{row.zone}</span><strong className="finished-inventory-total">{formatNumber(row.inStock)}</strong><InventoryAllocation stock={row} /></button>) : <div className="business-empty"><SearchOutlined /><strong>没有匹配的成品库存</strong><span>切换通货类型或调整搜索条件后重试。</span></div>}</div>
      </div>
    </section>
    <aside className="business-detail-panel finished-goods-detail finished-inventory-detail">
      <header>{selected ? <div className="finished-inventory-detail-meta"><SemanticOrderTag kind="business" value={selected.goodsType} /><span className="finished-inventory-trust"><CheckCircleOutlined />{selected.trust}</span></div> : null}<h2 className="finished-inventory-detail-title">{selected ? <><strong>{selected.size}</strong><span>·</span><FactoryColorLabel color={selected.color} /></> : "暂无库存项"}</h2>{selectedException ? <StateText>{selectedException}</StateText> : null}</header>
      <div className="business-detail-scroll">{selected ? <><dl className="business-facts finished-inventory-context-facts"><div><dt>实际库位</dt><dd>{selected.zone}</dd></div><div><dt>提手</dt><dd>{selected.handle}</dd></div>{selected.pattern !== "—" ? <div><dt>现货图案</dt><dd>{selected.pattern}</dd></div> : null}</dl><section className="finished-inventory-stock-section"><h3>库存结构</h3><InventoryAllocation stock={selected} variant="detail" /></section></> : <div className="business-empty"><FileTextOutlined /><strong>暂无成品库存</strong></div>}{notice ? <div className="business-notice"><CheckCircleOutlined />{notice}</div> : null}</div>
      <footer><button className="primary" disabled={!selected} onClick={() => setNotice("库存数量与结构来自正式库存接口；完整流水请在库存来源功能中继续查看。") } type="button">查看库存来源</button><button className="secondary-button" onClick={() => onNavigate("general-prices")} type="button">查看成品资料</button></footer>
    </aside>
  </div>;
}

function FinishedGoodsMasterWorkspace({ formal, onNavigate }) {
  const finishedGoodsMasterRecords = [];
  const [category, setCategory] = useState("全部成品");
  const [goodsType, setGoodsType] = useState("全部类型");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(finishedGoodsMasterRecords[0]?.id || "");
  const [notice, setNotice] = useState("");
  const rows = useMemo(() => filterFinishedGoods(finishedGoodsMasterRecords, category, goodsType, query), [category, goodsType, query]);
  const selected = rows.find((row) => row.id === selectedId) || rows[0] || null;
  const reset = () => { setCategory("全部成品"); setGoodsType("全部类型"); setQuery(""); setSelectedId(finishedGoodsMasterRecords[0]?.id || ""); setNotice(""); };
  const selectCategory = (value) => { setCategory(value); setSelectedId(""); setNotice(""); };
  const selectType = (value) => { setGoodsType(value); setSelectedId(""); setNotice(""); };

  return <div className="business-workbench finished-goods-workbench finished-master-workbench">
    <section className="business-list-panel">
      <header className="business-panel-heading"><h2>成品资料</h2><WorkbenchHeadingActions countLabel={`${rows.length} / ${finishedGoodsMasterRecords.length} 条`} onRefresh={formal.actions.refreshAll} /></header>
      <FinishedGoodsClassificationFilters category={category} goodsType={goodsType} onCategoryChange={selectCategory} onGoodsTypeChange={selectType} />
      <div className="finished-goods-search"><label><SearchOutlined /><input aria-label="成品资料搜索" onChange={(event) => { setQuery(event.target.value); setSelectedId(""); }} placeholder="搜索袋类 / 类型 / 商品 / 图案 / 规格 / 系列 / 颜色" value={query} /></label><button disabled={!query && category === "全部成品" && goodsType === "全部类型"} onClick={reset} type="button"><ReloadOutlined />重置</button></div>
      <div className="finished-goods-table" role="table" aria-label="成品资料列表">
        <div className="finished-master-row head" role="row"><span>成品大类</span><span>通货类型</span><span>标准规格</span><span>袋子系列</span><span>提手</span><span>通货单价</span></div>
        <div className="business-table-body">{rows.length ? rows.map((row) => <button aria-pressed={selected?.id === row.id} className={`finished-master-row${selected?.id === row.id ? " selected" : ""}`} key={row.id} onClick={() => { setSelectedId(row.id); setNotice(""); }} role="row" type="button"><strong>{row.category}</strong><span className="finished-master-product"><SemanticOrderTag kind="business" value={row.goodsType} /></span><strong>{row.size}</strong><span className="finished-master-scope"><strong>{row.goodsType === "印刷通货" ? row.pattern : row.seriesScope || "—"}</strong></span><span>{row.handleScope}</span><strong className="finished-master-price">{money(row.unitPrice)}</strong></button>) : <div className="business-empty"><SearchOutlined /><strong>正式成品资料接口尚未提供记录</strong><span>本页不再使用硬编码价格；接口上线后会在这里显示服务器发布的现货资料和价格。</span></div>}</div>
      </div>
    </section>
    <aside className="business-detail-panel finished-goods-detail finished-master-detail">
      <header><span>{selected?.priceVersion || "成品资料"}</span><h2>{selected ? `${selected.pattern !== "—" ? selected.pattern : selected.goodsType} · ${selected.size}` : "暂无成品"}</h2></header>
      <div className="business-detail-scroll"><div className="source-provenance"><CheckCircleOutlined /><span>正式成品资料接口</span></div>{selected ? <><h3>成品定义</h3><dl className="business-facts"><div><dt>成品大类</dt><dd>{selected.category}</dd></div><div><dt>通货类型</dt><dd><SemanticOrderTag kind="business" value={selected.goodsType} /></dd></div>{selected.seriesScope || selected.pattern !== "—" ? <div><dt>袋子系列</dt><dd>{selected.seriesScope || selected.pattern}</dd></div> : null}<div><dt>标准规格</dt><dd>{selected.size}</dd></div><div><dt>匹配别名</dt><dd>{selected.aliases}</dd></div>{selected.goodsType === "印刷通货" ? <div><dt>现货颜色</dt><dd>{selected.colorScope}</dd></div> : null}<div><dt>提手范围</dt><dd>{selected.handleScope}</dd></div>{selected.goodsType === "印刷通货" ? <div><dt>图案规则</dt><dd>{selected.patternRule}</dd></div> : null}</dl><h3 className="finished-master-price-heading">价格信息</h3><dl className="business-facts finished-master-price-facts"><div><dt>通货单价</dt><dd>{money(selected.unitPrice)} / 个</dd></div><div><dt>价格说明</dt><dd>{selected.priceNote}</dd></div></dl></> : <div className="business-empty"><FileTextOutlined /><strong>暂无现货成品资料</strong></div>}<section className="business-boundary"><InfoCircleOutlined /><div><strong>资料范围</strong><p>本页只保存现货成品的内部标准规格和价格。定制尺寸按订单生产，生产多少交付多少，不建立成品资料，也不进入成品库存；实际现货数量继续在库存管理中查看。</p></div></section>{notice ? <div className="business-notice"><CheckCircleOutlined />{notice}</div> : null}</div>
      <footer><button className="primary" disabled={!selected} onClick={() => setNotice(`当前查看 ${selected.priceVersion}；评审页不执行价格发布或修改。`)} type="button">查看价格版本</button><button className="secondary-button" onClick={() => onNavigate(selected?.category === "覆膜无纺布袋" ? "laminated-inventory" : "inventory-query")} type="button">查看对应库存</button></footer>
    </aside>
  </div>;
}

const todoViews = ["未处理", "今天要发", "异常/提醒", "待打印", "稍后提醒", "已处理", "全部"];
const todoAreas = ["全部业务", "订单", "库存", "出库", "财务", "生产", "设备", "其他"];

function todoArea(todo) {
  if (["order_draft", "order_line"].includes(todo.refType)) return "订单";
  if (todo.refType === "fulfillment") return "出库";
  if (todo.refType === "statement") return "财务";
  if (todo.refType === "inventory_item" || todo.refType === "inventory_correction") return "库存";
  if (todo.refType === "production_task") return "生产";
  if (todo.refType === "maintenance_task") return "设备";
  return "其他";
}

function todoMatchesView(todo, view) {
  if (view === "全部") return true;
  if (view === "未处理") return !todo.handled;
  if (view === "已处理") return Boolean(todo.handled);
  if (view === "今天要发") return !todo.handled && String(todo.latest).includes("今天");
  if (view === "异常/提醒") return !todo.handled && todo.urgency === "异常";
  if (view === "待打印") return !todo.handled && String(todo.type).includes("打印");
  if (view === "稍后提醒") return !todo.handled && Boolean(todo.snoozedUntil);
  return true;
}

function todoTarget(todo) {
  if (todo.refType === "statement") return "customer-statements";
  if (todo.refType === "fulfillment") return "outbound-delivery";
  if (todo.refType === "order_draft") return "order-entry";
  return "order-pool";
}

function TodoWorkspace({ formal, onNavigate }) {
  const sortedTodos = useMemo(() => sortTodos(formal.data.todos), [formal.data.todos]);
  const [view, setView] = useState("未处理");
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("全部业务");
  const [selectedId, setSelectedId] = useState(sortedTodos[0]?.id || "");
  const [detailTab, setDetailTab] = useState("处理");
  const [notice, setNotice] = useState("");
  const areaMatched = sortedTodos.filter((todo) => area === "全部业务" || todoArea(todo) === area);
  const queryMatched = areaMatched.filter((todo) => !query.trim() || [todo.type, todo.customerName || customerName(todo.customerId), todo.ref, todo.summary, todo.impact].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const rows = queryMatched.filter((todo) => todoMatchesView(todo, view));
  const selected = rows.find((todo) => todo.id === selectedId) || rows[0] || null;
  const resetDisabled = !query && area === "全部业务" && view === "未处理";
  const reset = () => { setQuery(""); setArea("全部业务"); setView("未处理"); setSelectedId(sortedTodos[0]?.id || ""); setNotice(""); };

  return <div className="business-workbench todo-source-workbench">
    <section className="business-list-panel">
      <header className="business-panel-heading"><h2>公共待办</h2><WorkbenchHeadingActions countLabel={`${rows.length} / ${formal.data.todos.length} 条`} onRefresh={formal.actions.refreshAll} /></header>
      <div className="todo-source-tabs" role="tablist" aria-label="待办状态快捷筛选">{todoViews.map((item) => <button aria-selected={view === item} key={item} onClick={() => { setView(item); setSelectedId(""); }} role="tab" type="button"><span>{item}</span><strong>{queryMatched.filter((todo) => todoMatchesView(todo, item)).length}</strong></button>)}</div>
      <div className="todo-source-filter"><label><span>关键词</span><div><SearchOutlined /><input aria-label="公共待办关键词" onChange={(event) => { setQuery(event.target.value); setSelectedId(""); }} placeholder="待办 / 客户 / 业务编号 / 摘要" value={query} /></div></label><label><span>业务范围</span><select aria-label="公共待办业务范围" onChange={(event) => { setArea(event.target.value); setSelectedId(""); }} value={area}>{todoAreas.map((item) => <option key={item}>{item}</option>)}</select></label><button disabled={resetDisabled} onClick={reset} type="button"><ReloadOutlined />重置</button></div>
      <div className="todo-source-table" role="table" aria-label="公共待办列表">
        <div className="todo-source-row head" role="row"><span>待办 / 客户</span><span>摘要 / 影响</span><span>最晚 / 等待</span><span>状态</span><span>业务引用</span></div>
        <div className="business-table-body">{rows.length ? rows.map((todo) => <button aria-pressed={selected?.id === todo.id} className={`todo-source-row${selected?.id === todo.id ? " selected" : ""}`} key={todo.id} onClick={() => { setSelectedId(todo.id); setNotice(""); }} role="row" type="button"><span><strong>{todo.type}</strong><small>{todo.customerName || customerName(todo.customerId)}</small></span><span><strong>{todo.summary}</strong><small>{todo.impact}</small></span><span><strong>{todo.latest}</strong><small>{todo.wait}</small></span><StateText>{todo.handled ? "已处理" : todo.urgency}</StateText><strong className="todo-source-ref">{todo.ref}</strong></button>) : <div className="business-empty"><SearchOutlined /><strong>没有匹配的公共待办</strong><span>调整状态、关键词或业务范围后重试。</span></div>}</div>
      </div>
    </section>
    <aside className="business-detail-panel todo-source-detail">
      <header><span>{selected ? `${selected.customerName || customerName(selected.customerId)} · ${selected.ref}` : "公共待办"}</span><h2>{selected?.type || "暂无待办"}</h2>{selected ? <StateText>{selected.handled ? "已处理" : selected.urgency}</StateText> : null}</header>
      <div className="todo-detail-tabs" role="tablist" aria-label="公共待办详情">{["处理", "通知/打印", "记录"].map((item) => <button aria-selected={detailTab === item} key={item} onClick={() => setDetailTab(item)} role="tab" type="button">{item}</button>)}</div>
      <div className="business-detail-scroll"><div className="source-provenance"><CheckCircleOutlined /><span>正式公共待办 API</span></div>{selected ? <><h3>{detailTab === "处理" ? "任务信息" : detailTab}</h3><dl className="business-facts"><div><dt>待办编号</dt><dd>{selected.id}</dd></div><div><dt>客户</dt><dd>{selected.customerName || customerName(selected.customerId)}</dd></div><div><dt>提醒状态</dt><dd>{selected.handled ? "已处理" : selected.reminderLevelLabel || "正常"}</dd></div><div><dt>业务引用</dt><dd>{selected.ref}</dd></div><div><dt>摘要</dt><dd>{selected.summary}</dd></div><div><dt>最晚 / 等待</dt><dd>{selected.latest} / {selected.wait}</dd></div><div><dt>业务影响</dt><dd>{selected.impact}</dd></div></dl></> : <div className="business-empty"><FileTextOutlined /><strong>没有可显示的待办详情</strong></div>}{notice ? <div className="business-notice"><CheckCircleOutlined />{notice}</div> : null}</div>
      <footer><button className="primary" disabled={!selected} onClick={() => selected && onNavigate(todoTarget(selected))} type="button">进入对应工作台</button><button className="secondary-button" onClick={() => void formal.actions.refreshAll()} type="button">刷新服务器数据</button></footer>
    </aside>
  </div>;
}

function OrderPoolWorkspace({ formal, onNavigate }) {
  const machineLabels = useMemo(() => buildMachineLabels(formal.data.machines), [formal.data.machines]);
  const officeOrders = useMemo(() => formal.data.orderLines.map((line) => ({
    ...line,
    customer: line.customerName || customerName(line.customerId),
    business: businessTypeFor(line),
    requirement: requirementFor(line),
    risk: riskFor(line),
    machine: line.machineId ? (machineLabels.get(line.machineId) || line.machineId) : "机台待确认",
  })), [formal.data.orderLines, machineLabels]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("全部订单");
  const [selectedId, setSelectedId] = useState(officeOrders[0]?.id || "");
  const [notice, setNotice] = useState("");
  const rows = officeOrders.filter((order) => {
    const queryMatch = !query.trim() || Object.values(order).flat().join(" ").toLowerCase().includes(query.trim().toLowerCase());
    const tabMatch = tab === "全部订单" || (tab === "待处理" && /待|缺货|差异/.test(order.status)) || (tab === "生产中" && /制袋中|丝印中|生产中/.test(order.status)) || (tab === "待出库" && /待出库|已备货/.test(order.status));
    return queryMatch && tabMatch;
  });
  const selected = rows.find((order) => order.id === selectedId) || rows[0] || officeOrders[0];
  return <div className="business-workbench order-pool-workbench source-grounded-workbench">
    <section className="business-list-panel">
      <header className="business-panel-heading"><h2>订单池</h2><WorkbenchHeadingActions countLabel={`${rows.length} / ${officeOrders.length} 条`} onRefresh={formal.actions.refreshAll} /></header>
      <div className="order-pool-tools"><div className="business-subtabs" role="tablist">{["全部订单", "待处理", "生产中", "待出库"].map((item) => <button aria-selected={tab === item} key={item} onClick={() => setTab(item)} role="tab" type="button">{item}</button>)}</div><label><SearchOutlined /><input aria-label="订单池搜索" onChange={(event) => setQuery(event.target.value)} placeholder="客户 / 货品 / 规格 / 订单号" value={query} /></label></div>
      <div className="order-ledger" role="table" aria-label="订单池明细"><div className="order-ledger-row head"><span>客户</span><span>货品与规格</span><span>数量</span><span>状态</span><span>交付</span><span>风险</span></div><div className="business-table-body">{rows.length ? rows.map((order) => <button aria-pressed={selected?.id === order.id} className={`order-ledger-row${selected?.id === order.id ? " selected" : ""}`} key={order.id} onClick={() => { setSelectedId(order.id); setNotice(""); }} type="button"><strong>{order.customer}</strong><span className="order-product-cell"><strong>{order.product}</strong><small>{order.size} · {getLineColorSpecLabel(order) || order.color} <SemanticOrderTag kind="business" value={order.business} />{order.requirement ? <SemanticOrderTag kind="requirement" value={order.requirement} /> : null}</small></span><strong>{formatNumber(order.qty)}<small>个</small></strong><span className="order-state-cell"><StateText>{order.status}</StateText>{/制袋中|丝印中|生产中/.test(order.status) ? <small>{order.machine}</small> : null}</span><span>{order.fulfillment}<small>{order.latest}</small></span><span>{order.risk === "—" ? "—" : <StateText>{order.risk}</StateText>}</span></button>) : <div className="business-empty"><FileTextOutlined /><strong>服务器暂无订单</strong><span>刷新后仍为空时，请先在订单录入中创建订单。</span></div>}</div></div>
    </section>
    <aside className="business-detail-panel order-detail-panel"><header><span>{selected ? `${selected.customer} · ${selected.id}` : "订单池"}</span><h2>{selected?.product || "暂无订单"}</h2>{selected ? <div className="order-detail-tags"><SemanticOrderTag kind="business" value={selected.business} />{selected.requirement ? <SemanticOrderTag kind="requirement" value={selected.requirement} /> : null}</div> : null}</header><div className="business-detail-scroll">{selected ? <><h3>订单事实</h3><dl className="business-facts"><div><dt>完整订单明细号</dt><dd>{selected.id}</dd></div><div><dt>规格与颜色</dt><dd>{selected.size} · {getLineColorSpecLabel(selected) || selected.color}</dd></div><div><dt>计划数量</dt><dd>{formatNumber(selected.qty)}个</dd></div><div><dt>库存状态</dt><dd>{selected.inventory}</dd></div><div><dt>当前状态</dt><dd>{selected.status}</dd></div><div><dt>机台</dt><dd>{selected.machine}</dd></div><div><dt>交付方式</dt><dd>{selected.fulfillment}</dd></div><div><dt>要求时间</dt><dd>{selected.latest}</dd></div><div><dt>金额</dt><dd>{money(selected.amount)}</dd></div><div><dt>当前风险</dt><dd>{selected.risk}</dd></div></dl></> : <div className="business-empty"><FileTextOutlined /><strong>服务器暂无订单</strong></div>}{notice ? <div className="business-notice"><CheckCircleOutlined />{notice}</div> : null}</div><footer><button className="primary" disabled={!selected} onClick={() => selected && onNavigate(/待出库|已备货/.test(selected.status) ? "outbound-delivery" : "production-tasks")} type="button">{selected && /待出库|已备货/.test(selected.status) ? "进入出库交付" : "进入生产任务"}</button><button className="secondary-button" onClick={() => void formal.actions.refreshAll()} type="button">刷新服务器数据</button></footer></aside>
  </div>;
}

function OrderEntryWorkspace({ formal, onNavigate }) {
  const queuedDraft = formal.data.orderDrafts[0] || null;
  const [source, setSource] = useState(queuedDraft?.sourceText || "");
  const [draftRows, setDraftRows] = useState(queuedDraft?.lines || queuedDraft?.rows || []);
  const [draftId, setDraftId] = useState(queuedDraft?.id || queuedDraft?.draftId || "");
  const [clientRevision, setClientRevision] = useState(Number(queuedDraft?.clientRevision || queuedDraft?.revision || 0));
  const [step, setStep] = useState(2);
  const [notice, setNotice] = useState("");
  const missingCount = draftRows.filter((line) => !(line.customer || line.customerName || line.customerId) || !line.size || !(line.color || line.bagColor) || !line.qty).length;
  const inventoryIssueCount = draftRows.filter((line) => line.inventory === "缺货").length;
  const updateDraftRow = (index, field, value) => setDraftRows((current) => current.map((line, rowIndex) => rowIndex === index ? { ...line, [field]: field === "qty" ? Number(value) : value } : line));
  const recognize = async () => {
    setNotice("正在调用正式识别接口…");
    const result = await formal.actions.recognizeOrderText(source);
    if (result.source !== "api") { setNotice(`识别失败：${result.error?.message || "接口错误"}`); return; }
    setDraftRows(result.rows || []);
    setDraftId(result.draft?.draftId || result.draft?.id || draftId);
    setClientRevision(Number(result.draft?.revision || 0));
    setStep(2);
    setNotice(`已从服务器识别 ${result.rows?.length || 0} 行，请核对后保存。`);
  };
  const save = async (confirm = false) => {
    setNotice(confirm ? "正在确认并生成正式订单…" : "正在保存正式草稿…");
    const action = confirm ? formal.actions.confirmOrderDraft : formal.actions.saveOrderDraft;
    const result = await action({ draftId, clientRevision, rows: draftRows, sourceText: source });
    if (result.source !== "api") { setNotice(`${confirm ? "确认" : "保存"}失败：${result.error?.message || "接口错误"}`); return; }
    setDraftId(result.draftId || draftId);
    setClientRevision(Number(result.draft?.clientRevision || result.draft?.revision || clientRevision + 1));
    setStep(confirm ? 3 : 2);
    setNotice(confirm ? "正式订单已生成，订单池正在刷新。" : "草稿已保存到服务器。");
    if (confirm) await formal.actions.refreshAll();
  };
  return <div className="entry-workbench source-grounded-workbench">
    <section className="entry-main-panel">
      <div className="entry-steps" aria-label="订单录入步骤">{[[1, "粘贴原文"], [2, "校对明细"], [3, "库存与确认"]].map(([index, label]) => <button className={step === index ? "active" : step > index ? "done" : ""} key={label} onClick={() => setStep(index)} type="button"><b>{step > index ? <CheckCircleOutlined /> : index}</b><span><strong>{label}</strong><small>{index === 1 ? "粘贴客户消息" : index === 2 ? "识别并修正明细" : "重新校验再确认"}</small></span></button>)}</div>
      <section className="entry-source"><header><strong>客户订单原文</strong><span>{draftId || "新草稿"} · 原文随草稿保留</span></header><textarea aria-label="客户订单原文" onChange={(event) => setSource(event.target.value)} value={source} /><footer><button disabled={!source.trim()} onClick={() => void recognize()} type="button"><ReloadOutlined />重新识别</button><button onClick={() => { setSource(""); setDraftRows([]); }} type="button">清空</button></footer></section>
      <section className="entry-lines"><header><div><strong>识别明细</strong><span>{draftRows.length} 行 · 可直接修正</span></div><span className="entry-source-badge">正式订单识别 API</span></header><div className="entry-grid entry-head"><span>客户 / 货品</span><span>规格</span><span>颜色</span><span>类型与要求</span><span>数量</span><span>交付</span></div><div className="entry-grid-body">{draftRows.map((line, index) => <div className="entry-grid" key={line.id || `${draftId}-${index}`}><span><input aria-label={`${line.customer || line.customerName || "客户"}客户`} onChange={(event) => updateDraftRow(index, "customer", event.target.value)} value={line.customer || line.customerName || line.customerId || ""} />{visibleEntryProduct(line) ? <small>{visibleEntryProduct(line)}</small> : null}</span><input aria-label="规格" onChange={(event) => updateDraftRow(index, "size", event.target.value)} value={line.size || ""} /><input aria-label="颜色" onChange={(event) => updateDraftRow(index, "color", event.target.value)} value={line.color || line.bagColor || ""} /><span className="entry-tag-cell"><SemanticOrderTag kind="business" value={businessTypeFor(line)} />{line.handle === "加长提" ? <SemanticOrderTag kind="requirement" value="加长提" /> : null}</span><input aria-label="数量" onChange={(event) => updateDraftRow(index, "qty", event.target.value)} value={line.qty || ""} /><select aria-label="交付" onChange={(event) => updateDraftRow(index, "fulfillment", event.target.value)} value={line.fulfillment || "自提"}><option>自提</option><option>送货</option><option>快递快运</option></select></div>)}</div></section>
      <footer className="entry-confirm-bar"><span>已识别 {draftRows.length} 行</span><strong>数量合计 {formatNumber(draftRows.reduce((sum, line) => sum + Number(line.qty || 0), 0))}个</strong><span>{notice || `${inventoryIssueCount} 行需要重点复核`}</span><button disabled={!draftRows.length} onClick={() => void save(false)} type="button">保存草稿</button><button className="primary" disabled={!draftRows.length || missingCount > 0} onClick={() => void save(true)} type="button">保存并确认</button></footer>
    </section>
    <aside className="entry-validation"><header><div><strong>识别校验</strong><span>正式生成前会重新查库存和价格</span></div><button onClick={() => void recognize()} type="button">重新校验</button></header><dl><div><dt>缺字段</dt><dd>{missingCount}</dd></div><div><dt>库存异常</dt><dd>{inventoryIssueCount}</dd></div><div><dt>待复核</dt><dd>{missingCount + inventoryIssueCount}</dd></div></dl><section><h3>必须处理</h3>{draftRows.filter((line) => line.inventory === "缺货").map((line, index) => <p key={line.id || index}><WarningOutlined />{line.customer || line.customerName || line.customerId} · {line.size} {line.color || line.bagColor}库存不足。</p>)}</section><section><h3>当前草稿事实</h3><p><CheckCircleOutlined />订单原文和识别明细由正式服务器接口保存。</p><p><CheckCircleOutlined />确认动作会生成正式订单并刷新订单池。</p></section><div className="entry-next"><FileTextOutlined /><div><strong>确认后进入同一订单池</strong><p>草稿不占用库存；正式生成前仍需查重、校验库存与价格。</p></div><button onClick={() => onNavigate("order-pool")} type="button">查看订单池</button></div></aside>
  </div>;
}

export function BusinessWorkspace({ formal, navId, onNavigate }) {
  if (navId === "shared-todos") return <TodoWorkspace formal={formal} onNavigate={onNavigate} />;
  if (navId === "order-entry") return <OrderEntryWorkspace formal={formal} onNavigate={onNavigate} />;
  if (navId === "order-pool") return <OrderPoolWorkspace formal={formal} onNavigate={onNavigate} />;
  if (navId === "inventory-query") return <FinishedGoodsInventoryWorkspace category="无纺布袋" formal={formal} onNavigate={onNavigate} title="无纺布袋库存" />;
  if (navId === "laminated-inventory") return <FinishedGoodsInventoryWorkspace category="覆膜无纺布袋" formal={formal} onNavigate={onNavigate} title="覆膜袋库存" />;
  if (navId === "general-prices" || navId === "spec-inventory") return <FinishedGoodsMasterWorkspace formal={formal} onNavigate={onNavigate} />;
  const configs = buildWorkspaceConfigs(formal);
  const config = configs[navId];
  if (!config) return <div className="business-missing"><WarningOutlined /><strong>当前 PC 代码没有这个独立页面</strong><span>{navId}</span></div>;
  return <GenericWorkspace config={{ ...config, onRefresh: formal.actions.refreshAll }} onNavigate={onNavigate} />;
}

export { completedBusinessWorkspaceIds };
