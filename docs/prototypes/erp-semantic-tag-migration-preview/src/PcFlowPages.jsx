import { useMemo, useState } from "react";
import {
  CheckCircleOutlined,
  FileTextOutlined,
  InboxOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SearchOutlined,
  SendOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { orders } from "./data.js";
import { SemanticTag } from "./components/SemanticTag.jsx";
import { ReceivableSnapshot, ShipmentProgress } from "./components/FulfillmentAccountingFacts.jsx";
import { PcSupportPage } from "./PcSupportPages.jsx";

const formatQuantity = (value) => new Intl.NumberFormat("zh-CN").format(value);

const todoItems = [
  { id: "TD-0730-01", title: "郑蓉订单存在库存账务差额", meta: "白鲸购物袋 · 7月31日送货", state: "异常暂停", target: "订单池", action: "处理订单差额" },
  { id: "TD-0730-02", title: "王芳订单等待库存复核", meta: "京东电器 · 缺货 60个", state: "待复核", target: "订单池", action: "打开库存复核" },
  { id: "TD-0730-03", title: "陈敏印刷任务正在 3号机执行", meta: "米色礼品袋 · 明天 18:00", state: "生产中", target: "打包/标签", action: "查看生产任务" },
  { id: "TD-0730-04", title: "刘静订单等待出库交接", meta: "云杉手提袋 · 8月2日送货", state: "待出库", target: "出库交付", action: "准备出库交付" },
  { id: "TD-0730-05", title: "赵倩账单等待登记实收", meta: "本期应收 ¥2,400", state: "待收款确认", target: "对账收款", action: "进入对账收款" },
];

const productionTasks = [
  { id: "BAG-01", order: orders[0], state: "生产中", note: "1号机 · 已完成620个 · 计划1,200个" },
  { id: "PRINT-03", order: orders[2], state: "印刷中", note: "3号机 · 双面印刷" },
  { id: "BAG-02", order: orders[3], state: "待复核", note: "1号机 · 等待排产复核" },
  { id: "BAG-03", order: orders[5], state: "异常暂停", note: "3号机 · 来料加工待确认" },
];

const packingTasks = [
  { id: "PK-0730-01", order: orders[4], state: "待复核", note: "计划 2,400个 · 待填写包数" },
  { id: "PK-0730-02", order: orders[7], state: "待出库", note: "24包 · 标签已打印" },
  { id: "PK-0730-03", order: orders[0], state: "待确认", note: "生产完成后自动进入" },
];

const printTasks = [
  { id: "PR-0730-01", order: orders[7], state: "待打印", note: "出库标签 · LQ-615KII" },
  { id: "PR-0730-02", order: orders[4], state: "待复核", note: "包装标签 · 设备验收待确认" },
  { id: "PR-0730-03", order: orders[0], state: "待确认", note: "订单完成后生成打印作业" },
];

const inventoryRows = [
  { id: "INV-01", spec: "30×38×10", color: "红色", handle: "普通提", style: "空白袋", zone: "A区-30×38", total: 2480, occupied: 1320, available: 1040, state: "待复核" },
  { id: "INV-02", spec: "30×38×10", color: "黑色", handle: "普通提", style: "空白袋", zone: "A区-30×38", total: 80, occupied: 40, available: 40, state: "正常" },
  { id: "INV-03", spec: "25×32×10", color: "白色", handle: "加长提", style: "空白袋", zone: "B区-服装", total: 2100, occupied: 1200, available: 900, state: "正常" },
  { id: "INV-04", spec: "25×32×10", color: "红色", handle: "普通提", style: "空白袋", zone: "A区-25×32", total: 650, occupied: 300, available: 350, state: "正常" },
  { id: "INV-05", spec: "30×38×10", color: "白色", handle: "普通提", style: "空白袋", zone: "待快速区", total: 1005, occupied: 1005, available: 0, state: "缺货" },
  { id: "INV-06", spec: "35×25×12", color: "米色", handle: "普通提", style: "印刷通货", zone: "印刷通货区", total: 1100, occupied: 800, available: 300, state: "正常" },
];

const statementRows = [
  { id: "ST-0730-01", customer: "郑蓉", cycle: "7天一结", receivable: 1260, received: 0, arrears: 840, variance: 1260, state: "待对账" },
  { id: "ST-0730-02", customer: "王芳", cycle: "15天一结", receivable: 36800, received: 35000, arrears: 1800, variance: 1800, state: "差额/欠款" },
  { id: "ST-0730-03", customer: "陈敏", cycle: "月结", receivable: 14800, received: 14800, arrears: 0, variance: 0, state: "已完成" },
  { id: "ST-0730-04", customer: "孙玲", cycle: "7天一结", receivable: 1282, received: 660, arrears: 622, variance: 622, state: "待收款确认" },
  { id: "ST-0730-05", customer: "赵倩", cycle: "现结", receivable: 2400, received: 0, arrears: 2400, variance: 0, state: "待收款确认" },
];

const supplierStatementRows = [
  { id: "SUP-ST-202607-RY", supplier: "人意无纺布", period: "2026年7月", statementAmount: 96420, payableAmount: 94040, paidAmount: 0, state: "待对账", note: "18张收货单 · 2行差异已复核" },
  { id: "SUP-ST-202607-BH", supplier: "白侯无纺布", period: "2026年7月", statementAmount: 158376.74, payableAmount: 158376.74, paidAmount: 158376.74, state: "已完成", note: "17条全部匹配 · 付款已确认" },
];

const supplierStages = ["对账确认", "生成应付", "付款登记", "付款确认"];
const formatMoney = (value) => `¥${new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2 }).format(value)}`;

function Panel({ as: Element = "section", className = "", children, label }) {
  return <Element aria-label={label} className={`pc-flow-panel ${className}`.trim()}>{children}</Element>;
}

function CompactToolbar({ title, meta, children }) {
  return <div className="flow-toolbar"><strong>{title}</strong>{children}<span>{meta}</span></div>;
}

export function TodoPage({ onNavigate }) {
  const [selectedId, setSelectedId] = useState(todoItems[0].id);
  const [filter, setFilter] = useState("全部");
  const [claimedId, setClaimedId] = useState(null);
  const visible = todoItems.filter((item) => filter === "全部" || (filter === "异常" ? item.state === "异常暂停" : ["待复核", "待出库", "待收款确认"].includes(item.state)));
  const selected = visible.find((item) => item.id === selectedId) || visible[0] || todoItems[0];
  return (
    <>
      <Panel className="flow-list-panel" label="公共待办列表">
        <CompactToolbar title="公共待办" meta={`${visible.length} / ${todoItems.length} 项`}><div className="flow-tabs">{["全部", "异常", "待确认"].map((item) => <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)} type="button">{item}</button>)}</div></CompactToolbar>
        <div className="todo-list">
          {visible.map((item) => <button aria-pressed={selected.id === item.id} className={selected.id === item.id ? "selected" : ""} key={item.id} onClick={() => setSelectedId(item.id)} type="button"><span><SemanticTag kind="state" value={item.state} /><small>{item.id}{claimedId === item.id ? " · 办公室A已接手" : ""}</small></span><strong>{item.title}</strong><small>{item.meta}</small></button>)}
        </div>
      </Panel>
      <Panel as="aside" className="flow-detail-panel" label="待办详情">
        <header className="flow-detail-header"><span>{selected.id}</span><SemanticTag kind="state" size="standard" value={selected.state} /><h2>{selected.title}</h2><p>{selected.meta}</p></header>
        <div className="flow-detail-body">
          <h3>处理依据</h3>
          <dl className="flow-facts"><div><dt>来源工作台</dt><dd>{selected.target}</dd></div><div><dt>负责人</dt><dd>{claimedId === selected.id ? "办公室A" : "办公室共享池"}</dd></div><div><dt>要求完成</dt><dd>今天 16:00 前</dd></div><div><dt>接手状态</dt><dd>{claimedId === selected.id ? "已接手" : "尚未接手"}</dd></div></dl>
          <h3>流转记录</h3>
          <ol className="flow-timeline"><li><b>10:18</b><span>系统根据业务状态生成共享待办</span></li><li><b>10:20</b><span>办公室A打开详情，尚未执行写操作</span></li></ol>
        </div>
        <div className="flow-primary-actions"><button className="primary-button" onClick={() => onNavigate(selected.target)} type="button">{selected.action}</button><button onClick={() => setClaimedId(claimedId === selected.id ? null : selected.id)} type="button">{claimedId === selected.id ? "退回共享池" : "接手待办"}</button></div>
      </Panel>
    </>
  );
}

export function EntryPage({ onNavigate }) {
  const [source, setSource] = useState("郑蓉，白鲸购物袋30×38×10蓝印白1200个7月31日送货加急；王芳，京东电器25×32×10红袋白提2600个自提按扣；陈敏，米色礼品袋35×25×12米色1200个明天送货双面印。");
  const [step, setStep] = useState(2);
  const [saved, setSaved] = useState(false);
  return (
    <>
      <Panel className="entry-panel" label="订单录入工作台">
        <div className="entry-steps" aria-label="订单录入步骤">{[[1, "粘贴原文"], [2, "校对明细"], [3, "库存与确认"]].map(([index, label]) => <button className={step === index ? "active" : step > index ? "done" : ""} key={label} onClick={() => setStep(index)} type="button"><b>{step > index ? <CheckCircleOutlined /> : index}</b><span><strong>{label}</strong><small>{index === 1 ? "粘贴客户消息" : index === 2 ? "识别并校对表格" : "核验库存与金额"}</small></span></button>)}</div>
        <section className="entry-source"><header><strong>原文识别</strong><span>识别时间：今天 10:30</span></header><textarea aria-label="客户订单原文" onChange={(event) => setSource(event.target.value)} value={source} /><footer><button onClick={() => setStep(2)} type="button"><ReloadOutlined />重新识别</button><button onClick={() => setSource("")} type="button">清空文本</button></footer></section>
        <section className="entry-grid-wrap"><header><strong>识别明细</strong><span>共 6 行 · 可直接修正</span><button type="button">批量设置</button></header><div className="entry-grid entry-grid-head"><span>客户 / 货品</span><span>规格</span><span>颜色</span><span>标签</span><span>数量</span><span>交付</span><span>库存</span></div><div className="entry-grid-body">{orders.slice(0, 6).map((order) => <div className="entry-grid" key={order.id}><span><input aria-label={`${order.customer}客户`} defaultValue={order.customer} /><small>{order.product}</small></span><input aria-label={`${order.customer}规格`} defaultValue={order.spec} /><input aria-label={`${order.customer}颜色`} defaultValue={order.color} /><span className="entry-tags"><SemanticTag kind="business" value={order.business} />{order.requirement ? <SemanticTag kind="requirement" value={order.requirement} /> : null}</span><input aria-label={`${order.customer}数量`} defaultValue={order.quantity} /><select aria-label={`${order.customer}交付`} defaultValue={order.deliveryMethod}><option>自提</option><option>送货</option><option>快递快运</option></select><SemanticTag kind="state" value={order.exception === "正常" ? "正常" : "缺货"} /></div>)}</div></section>
        <footer className="entry-confirm-bar"><span>已识别 6 行</span><strong>数量合计 10,700个</strong><span>{saved ? "草稿已保存" : "2 行需要复核"}</span><button onClick={() => setSaved(true)} type="button">保存草稿</button><button className="primary-button" onClick={() => { setSaved(true); setStep(3); }} type="button">保存并确认</button></footer>
      </Panel>
      <Panel as="aside" className="entry-validation" label="订单识别校验">
        <header><span>识别校验</span><button type="button">重新校验</button></header>
        <div className="validation-summary"><span><small>缺字段</small><strong>2</strong></span><span><small>库存异常</small><strong>2</strong></span><span><small>待复核</small><strong>2</strong></span></div>
        <section><h3>必须处理</h3><p><WarningOutlined />王芳订单缺货 60个</p><p><WarningOutlined />张丽订单存在来料确认</p></section>
        <section><h3>识别建议</h3><p>陈敏订单“双面印”已作为特殊要求保留。</p><p>刘静订单交期为 8月2日，无冲突。</p></section>
        <div className="validation-next"><CheckCircleOutlined /><strong>{saved ? "已完成库存与金额校验" : "完成校对后进入订单池"}</strong><button onClick={() => onNavigate("订单池")} type="button">查看订单池</button></div>
      </Panel>
    </>
  );
}

function getModeTasks(mode) {
  if (mode === "打包任务") return packingTasks;
  if (mode === "打印与设备") return printTasks;
  return productionTasks;
}

export function ProductionPage() {
  const [mode, setMode] = useState("生产任务");
  const [selectedId, setSelectedId] = useState(productionTasks[0].id);
  const [notice, setNotice] = useState("");
  const [priorityOnly, setPriorityOnly] = useState(true);
  const allTasks = getModeTasks(mode);
  const tasks = priorityOnly ? allTasks.slice(0, 2) : allTasks;
  const selected = tasks.find((item) => item.id === selectedId) || tasks[0];
  function switchMode(nextMode) { setMode(nextMode); setSelectedId(getModeTasks(nextMode)[0].id); setNotice(""); }
  const actionLabel = mode === "生产任务" ? "打开生产协调" : mode === "打包任务" ? "核对打包结果" : "打开打印作业";
  return (
    <>
      <div className="flow-section-tabs" role="tablist" aria-label="生产打包流程">{["生产任务", "打包任务", "打印与设备"].map((item) => <button aria-selected={mode === item} key={item} onClick={() => switchMode(item)} role="tab" type="button">{item}</button>)}</div>
      <Panel className="flow-list-panel production-list" label={`${mode}列表`}>
        <CompactToolbar title={mode} meta={`${tasks.length} / ${allTasks.length} 条`}><div className="flow-tabs"><button className={priorityOnly ? "active" : ""} onClick={() => setPriorityOnly(true)} type="button">优先处理</button><button className={!priorityOnly ? "active" : ""} onClick={() => setPriorityOnly(false)} type="button">全部任务</button></div></CompactToolbar>
        <div className="production-task-list">{tasks.map((task) => <button aria-pressed={selected.id === task.id} className={selected.id === task.id ? "selected" : ""} key={task.id} onClick={() => { setSelectedId(task.id); setNotice(""); }} type="button"><span><SemanticTag kind="state" value={task.state} /><small>{task.id}</small></span><strong>{task.order.customer} · {task.order.product}</strong><p>{task.order.spec} · {task.order.color}</p><footer><span>{formatQuantity(task.order.quantity)}个</span><span>{task.note}</span></footer></button>)}</div>
      </Panel>
      <Panel as="aside" className="flow-detail-panel production-detail" label={`${mode}详情`}>
        <header className="flow-detail-header"><span>{selected.id}</span><SemanticTag kind="state" size="standard" value={selected.state} /><h2>{selected.order.customer} · {selected.order.product}</h2><div className="detail-tags"><SemanticTag kind="business" size="standard" value={selected.order.business} />{selected.order.requirement ? <SemanticTag kind="requirement" size="standard" value={selected.order.requirement} /> : null}</div></header>
        <div className="flow-detail-body"><dl className="flow-facts"><div><dt>规格颜色</dt><dd>{selected.order.spec} · {selected.order.color}</dd></div><div><dt>计划数量</dt><dd>{formatQuantity(selected.order.quantity)}个</dd></div><div><dt>交付要求</dt><dd>{selected.order.due} · {selected.order.deliveryMethod}</dd></div><div><dt>当前机台</dt><dd>{selected.order.owner}</dd></div></dl><section className="production-evidence"><h3>{mode === "打印与设备" ? "打印门禁" : "当前处理依据"}</h3><p>{selected.note}</p><p>{mode === "生产任务" ? "状态来自车间手机报工；办公室只做协调和异常处理。" : mode === "打包任务" ? "确认实际数量、包数和标签状态后才能进入出库。" : "设备验收、上线门禁与打印作业保持分离。"}</p></section>{notice ? <div className="flow-success-note"><CheckCircleOutlined />{notice}</div> : null}</div>
        <div className="flow-primary-actions"><button className="primary-button" onClick={() => setNotice(`${actionLabel}已打开，原型未执行生产写入。`)} type="button">{actionLabel}</button><button type="button">更多操作</button></div>
      </Panel>
    </>
  );
}

export function InventoryPage() {
  const [selectedId, setSelectedId] = useState(inventoryRows[0].id);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部状态");
  const visible = inventoryRows.filter((row) => (!query || [row.spec, row.color, row.handle, row.zone].some((value) => value.includes(query))) && (status === "全部状态" || row.state === status));
  const selected = inventoryRows.find((row) => row.id === selectedId) || visible[0] || inventoryRows[0];
  return (
    <>
      <Panel className="inventory-list-panel" label="库存查询列表">
        <div className="inventory-tools"><label><SearchOutlined /><input aria-label="库存关键词" onChange={(event) => setQuery(event.target.value)} placeholder="尺寸 / 颜色 / 提手 / 库区" value={query} /></label><select aria-label="库存状态" onChange={(event) => setStatus(event.target.value)} value={status}><option>全部状态</option><option>正常</option><option>缺货</option><option>待复核</option></select><button onClick={() => { setQuery(""); setStatus("全部状态"); }} type="button"><ReloadOutlined />重置</button></div>
        <div className="inventory-metrics"><span><small>可用库存</small><strong>4,930</strong></span><span><small>占用数量</small><strong>4,665</strong></span><span><small>缺货键</small><strong>1</strong></span><span><small>待处理</small><strong>1</strong></span></div>
        <div className="inventory-table"><div className="inventory-table-row head"><span>库存键</span><span>库区</span><span>在库</span><span>占用</span><span>可用</span><span>状态</span></div>{visible.map((row) => <button aria-pressed={selected.id === row.id} className={`inventory-table-row ${selected.id === row.id ? "selected" : ""}`} key={row.id} onClick={() => setSelectedId(row.id)} type="button"><span><strong>{row.spec} · {row.color}</strong><small>{row.handle} · {row.style}</small></span><span>{row.zone}</span><strong>{row.total}</strong><span>{row.occupied}</span><strong>{row.available}</strong><SemanticTag kind="state" value={row.state} /></button>)}{visible.length === 0 ? <div className="flow-inline-empty">没有匹配的库存键，请调整条件。</div> : null}</div>
      </Panel>
      <Panel as="aside" className="flow-detail-panel inventory-detail" label="库存详情">
        <header className="flow-detail-header"><span>{selected.id}</span><SemanticTag kind="state" size="standard" value={selected.state} /><h2>{selected.spec} · {selected.color}</h2><p>{selected.handle} · {selected.style}</p></header>
        <div className="flow-detail-body"><dl className="flow-facts"><div><dt>精确库存键</dt><dd>{selected.spec} / {selected.color} / {selected.handle}</dd></div><div><dt>库区</dt><dd>{selected.zone}</dd></div><div><dt>在库 / 占用</dt><dd>{selected.total} / {selected.occupied}</dd></div><div><dt>可用库存</dt><dd>{selected.available}个</dd></div></dl><h3>库存流水</h3><ol className="flow-timeline"><li><b>09:42</b><span>订单占用更新 +1200</span></li><li><b>10:05</b><span>生产入库登记 +600</span></li><li><b>10:18</b><span>办公室复核当前库存键</span></li></ol></div>
        <div className="flow-primary-actions"><button className="primary-button" type="button">查看占用订单</button><button type="button">库存修正</button></div>
      </Panel>
    </>
  );
}

export function FulfillmentPage() {
  const [selectedId, setSelectedId] = useState(orders[7].id);
  const [method, setMethod] = useState("全部");
  const [notice, setNotice] = useState("");
  const visible = orders.filter((order) => method === "全部" || order.deliveryMethod === method);
  const selected = orders.find((order) => order.id === selectedId) || visible[0] || orders[0];
  return (
    <>
      <Panel className="fulfillment-list-panel" label="出库交付列表">
        <CompactToolbar title="出库交付" meta={`当前 ${visible.length} / ${orders.length}`}><div className="flow-tabs">{["全部", "自提", "送货", "快递快运"].map((item) => <button className={method === item ? "active" : ""} key={item} onClick={() => setMethod(item)} type="button">{item}</button>)}</div></CompactToolbar>
        <div className="fulfillment-metrics"><span><small>未完成</small><strong>7</strong></span><span><small>今天 / 急</small><strong>3</strong></span><span><small>异常</small><strong>2</strong></span><span><small>待拉走</small><strong>1</strong></span></div>
        <div className="fulfillment-table"><div className="fulfillment-row head"><span>方式 / 客户</span><span>货品与规格</span><span>数量</span><span>交期</span><span>状态</span></div>{visible.map((order) => <button aria-pressed={selected.id === order.id} className={`fulfillment-row ${selected.id === order.id ? "selected" : ""}`} key={order.id} onClick={() => { setSelectedId(order.id); setNotice(""); }} type="button"><span><strong>{order.deliveryMethod}</strong><small>{order.customer}</small></span><span><strong>{order.product}</strong><small>{order.spec} · {order.color}</small></span><strong>{formatQuantity(order.quantity)}个</strong><span>{order.due}</span><SemanticTag kind="state" value={order.state === "已完成" ? "待出库" : order.state} /></button>)}</div>
      </Panel>
      <Panel as="aside" className="flow-detail-panel fulfillment-detail" label="交付详情">
        <header className="flow-detail-header"><span>{selected.customer} · {selected.id}</span><SemanticTag kind="state" size="standard" value={selected.state === "已完成" ? "待出库" : selected.state} /><h2>{selected.deliveryMethod} · {selected.product}</h2><p>{selected.spec} · {selected.color} · {formatQuantity(selected.quantity)}个</p></header>
        <div className="flow-detail-body"><ShipmentProgress order={selected} /><ReceivableSnapshot order={selected} /><dl className="flow-facts"><div><dt>交付日期</dt><dd>{selected.due}</dd></div><div><dt>联系人</dt><dd>{selected.customer} 138****1234</dd></div><div><dt>库存来源</dt><dd>A区成品库存</dd></div><div><dt>纸单状态</dt><dd>待打印</dd></div></dl><section className="delivery-preview"><h3>出库 / 自提单预览</h3><p>{selected.customer} / {selected.product} / {selected.spec} / {selected.color} / {formatQuantity(selected.quantity)}个</p></section>{notice ? <div className="flow-success-note"><CheckCircleOutlined />{notice}</div> : null}</div>
        <div className="flow-primary-actions"><button className="primary-button" onClick={() => setNotice("出库纸单已进入打印队列，等待实物交接。") } type="button"><PrinterOutlined />打印出库单</button><button type="button">登记异常</button></div>
      </Panel>
    </>
  );
}

export function StatementPage() {
  const [selectedId, setSelectedId] = useState(statementRows[0].id);
  const [selectedSupplierId, setSelectedSupplierId] = useState(supplierStatementRows[0].id);
  const [mode, setMode] = useState("客户对账");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [supplierStage, setSupplierStage] = useState(1);
  const visible = statementRows.filter((row) => !query || row.customer.includes(query));
  const selected = statementRows.find((row) => row.id === selectedId) || visible[0] || statementRows[0];
  const visibleSuppliers = supplierStatementRows.filter((row) => !query || row.supplier.includes(query));
  const selectedSupplier = supplierStatementRows.find((row) => row.id === selectedSupplierId) || visibleSuppliers[0] || supplierStatementRows[0];

  function switchMode(nextMode) {
    setMode(nextMode);
    setQuery("");
    setNotice("");
  }

  function advanceSupplierStage() {
    const nextStage = Math.min(supplierStages.length, supplierStage + 1);
    setSupplierStage(nextStage);
    setNotice(nextStage === supplierStages.length ? "付款已确认，供应商本期结算闭环完成。" : `${supplierStages[nextStage - 1]}已完成，下一步等待${supplierStages[nextStage]}。`);
  }

  if (mode === "供应商结算") {
    const currentAction = supplierStage >= supplierStages.length ? "付款已确认" : supplierStages[supplierStage];
    return (
      <>
        <Panel className="statement-list-panel" label="供应商结算列表">
          <header className="statement-mode-header"><div><strong>供应商结算</strong><small>从对账确认到付款确认</small></div><div className="statement-mode-tabs" role="tablist"><button onClick={() => switchMode("客户对账")} role="tab" type="button">客户对账</button><button aria-selected="true" role="tab" type="button">供应商结算</button></div></header>
          <label className="statement-search"><SearchOutlined /><input aria-label="供应商结算搜索" onChange={(event) => setQuery(event.target.value)} placeholder="供应商 / 月结单" value={query} /></label>
          <div className="statement-list">{visibleSuppliers.map((row) => <button aria-pressed={selectedSupplier.id === row.id} className={selectedSupplier.id === row.id ? "selected" : ""} key={row.id} onClick={() => { setSelectedSupplierId(row.id); setSupplierStage(row.state === "已完成" ? 4 : 1); setNotice(""); }} type="button"><span><strong>{row.supplier}</strong><SemanticTag kind="state" value={row.state} /></span><small>{row.period} · {row.id}</small><p>{row.note}</p></button>)}</div>
        </Panel>
        <Panel as="section" className="statement-detail-panel supplier-settlement-panel" label="供应商付款闭环">
          <div className="statement-summary supplier-summary"><span><small>供应商</small><strong>{selectedSupplier.supplier}</strong></span><span><small>对账金额</small><strong>{formatMoney(selectedSupplier.statementAmount)}</strong></span><span><small>确认应付</small><strong>{formatMoney(selectedSupplier.payableAmount)}</strong></span><span><small>已付款</small><strong>{formatMoney(supplierStage >= 3 ? selectedSupplier.payableAmount : selectedSupplier.paidAmount)}</strong></span></div>
          <header className="statement-detail-header"><div><span>{selectedSupplier.id} · {selectedSupplier.period}</span><h2>{selectedSupplier.supplier} 月结付款</h2></div><SemanticTag kind="state" size="standard" value={supplierStage >= 4 ? "已完成" : supplierStage >= 2 ? "待复核" : "待对账"} /></header>
          <div className="statement-detail-body"><div className="supplier-flow-steps" aria-label="供应商结算流程">{supplierStages.map((stage, index) => <span className={index < supplierStage ? "is-done" : index === supplierStage ? "is-current" : ""} key={stage}><b>{index < supplierStage ? <CheckCircleOutlined /> : index + 1}</b><small>{stage}</small></span>)}</div><div className="supplier-boundary-note"><strong>一个月结对象走到底</strong><span>办公室确认对账依据，财务生成应付并登记付款，授权人最后确认；不重复建单。</span></div><dl className="flow-facts"><div><dt>结算期间</dt><dd>{selectedSupplier.period}</dd></div><div><dt>来源收货单</dt><dd>18张</dd></div><div><dt>物理卷</dt><dd>126卷</dd></div><div><dt>差异处理</dt><dd>2行已留证确认</dd></div><div><dt>付款方式</dt><dd>{supplierStage >= 3 ? "银行转账" : "待登记"}</dd></div><div><dt>付款凭证</dt><dd>{supplierStage >= 3 ? "已上传待确认" : "尚未登记"}</dd></div></dl>{notice ? <div className="flow-success-note"><CheckCircleOutlined />{notice}</div> : null}</div>
          <div className="statement-actions"><button onClick={() => setNotice("已退回办公室补充对账证据；当前原型不执行正式写入。") } type="button">退回补证</button><button className="primary-button" disabled={supplierStage >= supplierStages.length} onClick={advanceSupplierStage} type="button">{currentAction}</button></div>
        </Panel>
      </>
    );
  }

  return (
    <>
      <Panel className="statement-list-panel" label="客户对账列表">
        <header className="statement-mode-header"><div><strong>客户对账</strong><small>待对账、欠款与收款确认</small></div><div className="statement-mode-tabs" role="tablist"><button aria-selected="true" role="tab" type="button">客户对账</button><button onClick={() => switchMode("供应商结算")} role="tab" type="button">供应商结算</button></div></header>
        <label className="statement-search"><SearchOutlined /><input aria-label="对账客户" onChange={(event) => setQuery(event.target.value)} placeholder="客户名 / 对账单" value={query} /></label>
        <div className="statement-list">{visible.map((row) => <button aria-pressed={selected.id === row.id} className={selected.id === row.id ? "selected" : ""} key={row.id} onClick={() => { setSelectedId(row.id); setNotice(""); }} type="button"><span><strong>{row.customer}</strong><SemanticTag kind="state" value={row.state} /></span><small>{row.cycle} · {row.id}</small><p>应收 ¥{formatQuantity(row.receivable)} · 欠款 ¥{formatQuantity(row.arrears)}</p></button>)}</div>
      </Panel>
      <Panel as="section" className="statement-detail-panel" label="对账收款详情">
        <div className="statement-summary"><span><small>客户</small><strong>{selected.customer}</strong></span><span><small>本期应收</small><strong>¥{formatQuantity(selected.receivable)}</strong></span><span><small>本期实收</small><strong>¥{formatQuantity(selected.received)}</strong></span><span><small>历史欠款</small><strong>¥{formatQuantity(selected.arrears)}</strong></span><span><small>差额</small><strong>¥{formatQuantity(selected.variance)}</strong></span></div>
        <header className="statement-detail-header"><div><span>{selected.id} · {selected.cycle}</span><h2>{selected.customer} 对账单</h2></div><SemanticTag kind="state" size="standard" value={selected.state} /></header>
        <div className="statement-detail-body"><dl className="flow-facts"><div><dt>对账周期</dt><dd>7月22日—7月29日</dd></div><div><dt>客户确认</dt><dd>尚未登记</dd></div><div><dt>付款凭证</dt><dd>{selected.received ? "已上传待复核" : "尚未登记"}</dd></div><div><dt>导出文件</dt><dd>尚未生成</dd></div></dl><h3>本期明细</h3><div className="statement-lines"><span><strong>白鲸购物袋</strong><small>30×38×10 · 蓝印白 · 1,200个</small><b>¥1,260</b></span><span><strong>上期结转</strong><small>历史欠款</small><b>¥{formatQuantity(selected.arrears)}</b></span></div>{notice ? <div className="flow-success-note"><CheckCircleOutlined />{notice}</div> : null}</div>
        <div className="statement-actions"><button onClick={() => setNotice("对账预览已生成，当前为评审数据。") } type="button"><FileTextOutlined />生成对账预览</button><button onClick={() => setNotice("已登记发送线索；客户确认仍需后续回录。") } type="button"><SendOutlined />登记已发送</button><button className="primary-button" onClick={() => setNotice("实收登记面板已打开；正式提交仍需凭证与确认。") } type="button">登记实收</button></div>
      </Panel>
    </>
  );
}

export function PcFlowPage({ view, onNavigate }) {
  if (view === "公共待办") return <TodoPage onNavigate={onNavigate} />;
  if (view === "订单录入") return <EntryPage onNavigate={onNavigate} />;
  if (view === "打包/标签") return <ProductionPage />;
  if (view === "库存查询") return <InventoryPage />;
  if (view === "出库交付") return <FulfillmentPage />;
  if (view === "对账收款") return <StatementPage />;
  if (["原材料", "客户档案", "通用价格表", "规格库存", "员工机台", "上线状态"].includes(view)) return <PcSupportPage view={view} />;
  return <Panel className="flow-empty-panel" label="未找到工作台"><InboxOutlined /><strong>{view}</strong><span>当前导航没有对应工作台。</span></Panel>;
}
