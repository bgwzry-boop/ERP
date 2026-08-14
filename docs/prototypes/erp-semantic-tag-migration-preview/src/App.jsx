import { useMemo, useState } from "react";
import {
  AppstoreOutlined,
  BellOutlined,
  CameraOutlined,
  CaretDownOutlined,
  CheckCircleOutlined,
  ContainerOutlined,
  DatabaseOutlined,
  DollarOutlined,
  FileTextOutlined,
  HomeOutlined,
  InboxOutlined,
  MenuOutlined,
  FilterOutlined,
  MoreOutlined,
  PlusOutlined,
  ProductOutlined,
  ReconciliationOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  ShoppingOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { orders, overviewTabs } from "./data.js";
import { SemanticTag } from "./components/SemanticTag.jsx";
import { ShipmentProgress } from "./components/FulfillmentAccountingFacts.jsx";
import { PcFlowPage } from "./PcFlowPages.jsx";

const orderMap = new Map(orders.map((order) => [order.id, order]));

const sidebarSections = [
  { label: "工作台", Icon: HomeOutlined, expandable: false, view: "公共待办" },
  { label: "订单管理", Icon: ReconciliationOutlined, expandable: true, children: ["订单录入", "订单池"] },
  { label: "采购管理", Icon: ShoppingOutlined, expandable: true },
  { label: "库存管理", Icon: DatabaseOutlined, expandable: true, children: ["库存查询", "出库交付"] },
  { label: "生产管理", Icon: ToolOutlined, expandable: true, children: ["打包/标签"] },
  { label: "财务管理", Icon: DollarOutlined, expandable: true, children: ["对账收款"] },
];

const productLinks = ["产品资料", "产品列表", "产品单价", "材质管理", "款式图案", "规格管理"];

function formatQuantity(value) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function Sidebar({ activeView, onNavigate }) {
  const [expandedSections, setExpandedSections] = useState(() => new Set(["订单管理"]));

  function toggleSection(label) {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function navigateTo(view, sectionLabel) {
    if (sectionLabel) {
      setExpandedSections((current) => new Set([...current, sectionLabel]));
    }
    onNavigate(view);
  }

  return (
    <aside className="sidebar" aria-label="ERP 主导航">
      <div className="brand-lockup">
        <span aria-hidden="true" className="brand-mark"><ProductOutlined /></span>
        <span><strong>禄兴包装</strong><small>无纺布袋工厂</small></span>
      </div>
      <nav className="reference-nav">
        {sidebarSections.map(({ label, Icon, expandable, children, view }) => {
          const expanded = expandedSections.has(label);
          const primaryActive = view === activeView;
          return (
            <section className={`sidebar-primary-group ${expanded ? "is-expanded" : ""}`} key={label}>
              <button
                aria-controls={children ? `${label}-links` : undefined}
                aria-current={primaryActive ? "page" : undefined}
                aria-expanded={expandable ? expanded : undefined}
                className={`sidebar-section-trigger ${primaryActive ? "is-active-primary" : ""}`}
                onClick={expandable ? () => toggleSection(label) : view ? () => navigateTo(view) : undefined}
                type="button"
              >
                <Icon aria-hidden="true" /><span>{label}</span>{expandable ? <CaretDownOutlined aria-hidden="true" className="sidebar-caret" /> : null}
              </button>
              {children && expanded ? (
                <div className="sidebar-child-links order-links" id={`${label}-links`}>
                  {children.map((childLabel) => <button aria-current={childLabel === activeView ? "page" : undefined} className={childLabel === activeView ? "is-active" : ""} key={childLabel} onClick={() => navigateTo(childLabel, label)} type="button">{childLabel}</button>)}
                </div>
              ) : null}
            </section>
          );
        })}
        <section className={`sidebar-foundation ${expandedSections.has("基础资料") ? "is-expanded" : ""}`}>
          <button aria-controls="foundation-links" aria-expanded={expandedSections.has("基础资料")} className="sidebar-section-trigger" onClick={() => toggleSection("基础资料")} type="button">
            <ContainerOutlined aria-hidden="true" /><span>基础资料</span><CaretDownOutlined aria-hidden="true" className="sidebar-caret" />
          </button>
          {expandedSections.has("基础资料") ? (
            <div className="foundation-links" id="foundation-links">
              <button aria-controls="product-links" aria-expanded={expandedSections.has("产品管理")} className="sidebar-product-trigger" onClick={() => toggleSection("产品管理")} type="button">
                <FileTextOutlined aria-hidden="true" /><span>产品管理</span><CaretDownOutlined aria-hidden="true" className="sidebar-caret" />
              </button>
              {expandedSections.has("产品管理") ? (
                <div className="sidebar-child-links product-links" id="product-links">
                  {productLinks.map((label) => <button key={label} type="button">{label}</button>)}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
        <button aria-expanded="false" className="sidebar-section-trigger sidebar-system-trigger" type="button">
          <SettingOutlined aria-hidden="true" /><span>系统管理</span><CaretDownOutlined aria-hidden="true" className="sidebar-caret" />
        </button>
      </nav>
    </aside>
  );
}

function Topbar({ onCreateOrder, onOpenTodo, onSearch }) {
  const [query, setQuery] = useState("");
  return (
    <header className="topbar">
      <strong>虎门工厂</strong>
      <form className="global-search" onSubmit={(event) => { event.preventDefault(); onSearch(query); }}><button aria-label="执行全局搜索" className="global-search-submit" type="submit"><SearchOutlined aria-hidden="true" /></button><input aria-label="全局搜索" onChange={(event) => setQuery(event.target.value)} placeholder="搜索客户 / 订单 / 尺寸 / 颜色 / 单据" value={query} /></form>
      <div className="topbar-actions">
        <button className="primary-button" onClick={onCreateOrder} type="button"><PlusOutlined />新建订单</button>
        <button className="icon-button" aria-label="公共待办 8 条" onClick={onOpenTodo} type="button"><BellOutlined /><b>8</b></button>
        <span className="account"><strong>办公室A</strong><small>录单 / 对账</small></span>
      </div>
    </header>
  );
}

function FilterBand({ filters, setFilter }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const customers = ["全部客户", ...new Set(orders.map((order) => order.customer))];
  const advancedCount = Number(filters.exception !== "全部") + Number(filters.finance !== "全部");
  return (
    <div className="filter-band" aria-label="订单池筛选">
      <label className="keyword-filter"><span>关键词</span><span className="field-control"><SearchOutlined /><input value={filters.query} onChange={(event) => setFilter("query", event.target.value)} placeholder="订单号 / 客户 / 货品 / 规格" /></span></label>
      <label><span>客户</span><select value={filters.customer} onChange={(event) => setFilter("customer", event.target.value)}>{customers.map((customer) => <option key={customer}>{customer}</option>)}</select></label>
      <label><span>类型</span><select value={filters.business} onChange={(event) => setFilter("business", event.target.value)}><option>全部</option><option>定制单</option><option>现货通货</option><option>印刷通货</option><option>外加工</option></select></label>
      <label><span>交付</span><select value={filters.delivery} onChange={(event) => setFilter("delivery", event.target.value)}><option>全部</option><option>自提</option><option>送货</option><option>快递快运</option></select></label>
      <div className="advanced-filter-wrap">
        <span>风险</span>
        <button aria-expanded={advancedOpen} className={advancedCount ? "is-active" : ""} onClick={() => setAdvancedOpen((open) => !open)} type="button"><FilterOutlined />高级筛选{advancedCount ? <b>{advancedCount}</b> : null}</button>
        {advancedOpen ? <div className="advanced-filter-panel" role="group" aria-label="异常与对账筛选">
          <label><span>异常状态</span><select value={filters.exception} onChange={(event) => setFilter("exception", event.target.value)}><option>全部</option><option>正常</option><option>有异常</option><option>缺货</option></select></label>
          <label><span>对账状态</span><select value={filters.finance} onChange={(event) => setFilter("finance", event.target.value)}><option>全部</option><option>待对账</option><option>未入账</option><option>差额/欠款</option></select></label>
          <button className="clear-advanced" onClick={() => { setFilter("exception", "全部"); setFilter("finance", "全部"); setAdvancedOpen(false); }} type="button">清除高级筛选</button>
        </div> : null}
      </div>
    </div>
  );
}

function OrderRisk({ order }) {
  const risk = order.exception !== "正常" ? order.exception : order.finance === "差额/欠款" ? order.finance : null;
  if (risk) return <SemanticTag kind="state" value={risk} />;
  return <span className="quiet-value">{order.finance === "未入账" ? "未入账" : "—"}</span>;
}

function OrderTable({ rows, selectedId, onSelect }) {
  return (
    <div className="order-table" role="table" aria-label="订单池明细">
      <div className="order-row order-head" role="row"><span>客户</span><span>货品与规格</span><span>数量</span><span>状态</span><span>交付</span><span>风险</span></div>
      <div className="order-table-body">
        {rows.length ? rows.map((order) => (
          <button aria-pressed={selectedId === order.id} className={`order-row ${selectedId === order.id ? "is-selected" : ""}`} data-testid={`order-${order.shortId}`} key={order.id} onClick={() => onSelect(order.id)} role="row" type="button">
            <span className="order-identity"><strong>{order.customer}</strong></span>
            <span className="order-product"><span className="order-product-name"><strong>{order.product}</strong><SemanticTag kind="business" value={order.business} /></span><small><span>{order.spec} · {order.color}</span>{order.requirement ? <SemanticTag kind="requirement" value={order.requirement} /> : null}</small></span>
            <strong className="quantity">{formatQuantity(order.quantity)}<small>个</small></strong>
            <span className="order-state"><SemanticTag kind="state" value={order.state} />{["生产中", "印刷中"].includes(order.state) ? <small>{order.owner || "机台待确认"}</small> : null}</span>
            <span className="delivery"><strong>{order.deliveryMethod}</strong><small>{order.due}</small></span>
            <span><OrderRisk order={order} /></span>
          </button>
        )) : <div className="empty-row">没有匹配订单，请调整筛选条件。</div>}
      </div>
    </div>
  );
}

function DetailPane({ order, onNavigate }) {
  const [tab, setTab] = useState("订单");
  const [notice, setNotice] = useState("");
  const risk = order.exception !== "正常" ? order.exception : order.finance === "差额/欠款" ? order.finance : null;
  const primaryAction = tab === "交付" ? "进入出库交付" : tab === "财务" ? "进入对账收款" : "打开订单";
  function runPrimaryAction() {
    if (tab === "交付") onNavigate("出库交付");
    else if (tab === "财务") onNavigate("对账收款");
    else setNotice("订单工作区已打开；本评审原型不提交正式写入。");
  }
  return (
    <aside className="detail-pane" aria-label="订单详情" data-testid="detail-pane">
      <div className="detail-header">
        <div className="detail-title-line"><span>{order.customer} · {order.id}</span><SemanticTag kind="state" value={order.state} /></div>
        <h2>{order.product}</h2>
        <div className="detail-tags"><SemanticTag kind="business" size="standard" value={order.business} />{order.requirement ? <SemanticTag kind="requirement" size="standard" value={order.requirement} /> : null}</div>
        <div className="detail-summary"><span><small>货品摘要</small><strong>{order.spec} · {order.color}</strong></span><span><small>数量</small><strong>{formatQuantity(order.quantity)}个</strong></span><span><small>机台</small><strong>{order.owner}</strong></span></div>
        <ShipmentProgress compact order={order} />
        {risk ? <div className="detail-risk"><OrderRisk order={order} /><span>{order.exception !== "正常" ? "交付前需要处理订单异常" : "当前订单存在待处理账务差额"}</span></div> : null}
      </div>
      <div className="detail-tabs" role="tablist" aria-label="订单详情视图">{["订单", "交付", "财务"].map((item) => <button aria-selected={tab === item} key={item} onClick={() => setTab(item)} role="tab" type="button">{item}</button>)}</div>
      {tab === "订单" ? (
        <div className="detail-content">
          <h3>交付与生产</h3>
          <dl className="fact-list"><div><dt>需求时间</dt><dd>{order.due}</dd></div><div><dt>交付方式</dt><dd>{order.deliveryMethod}</dd></div><div><dt>印刷</dt><dd>{order.print}</dd></div><div><dt>印刷面</dt><dd>{order.printSide}</dd></div><div><dt>提手工艺</dt><dd>{order.handleType}</dd></div><div><dt>质检标准</dt><dd>常规</dd></div></dl>
          <h3>最近流转</h3>
          <ol className="flow-timeline"><li><b>10:18</b><span>生产任务更新为{order.state}</span></li><li><b>09:42</b><span>库存占用与交付要求已校验</span></li></ol>
          {notice ? <div className="flow-success-note"><CheckCircleOutlined />{notice}</div> : null}
        </div>
      ) : tab === "交付" ? (
        <div className="detail-content"><h3>交付准备</h3><dl className="fact-list"><div><dt>交付方式</dt><dd>{order.deliveryMethod}</dd></div><div><dt>计划时间</dt><dd>{order.due}</dd></div><div><dt>实物状态</dt><dd>{order.state === "待出库" ? "待备货" : "生产流转中"}</dd></div><div><dt>纸质单据</dt><dd>待生成</dd></div><div><dt>包裹标签</dt><dd>{order.state === "待出库" ? "可打印" : "等待打包"}</dd></div><div><dt>交接确认</dt><dd>尚未登记</dd></div></dl><h3>交付边界</h3><p className="detail-guidance">办公室准备纸单和标签；仓库、司机按各自终端回录实物执行结果。</p></div>
      ) : (
        <div className="detail-content"><h3>账务摘要</h3><dl className="fact-list"><div><dt>对账状态</dt><dd>{order.finance}</dd></div><div><dt>客户结算</dt><dd>7天一结</dd></div><div><dt>订单金额</dt><dd>¥{formatQuantity(Math.round(order.quantity * 1.05))}</dd></div><div><dt>已登记实收</dt><dd>¥0</dd></div><div><dt>付款凭证</dt><dd>尚未登记</dd></div><div><dt>客户确认</dt><dd>尚未登记</dd></div></dl><h3>财务边界</h3><p className="detail-guidance">登记线索不等于正式核销；凭证与授权确认完成后才进入收款写入。</p></div>
      )}
      <div className="detail-actions"><button className="primary-button" onClick={runPrimaryAction} type="button">{primaryAction}</button><button aria-label="更多订单操作" onClick={() => setNotice("已展开次要操作：复制摘要、打印留档、查看审计记录。") } type="button"><MoreOutlined />更多操作</button></div>
    </aside>
  );
}

function DesktopWorkbench() {
  const [activeView, setActiveView] = useState("订单池");
  const [selectedId, setSelectedId] = useState(orders[0].id);
  const [activeTab, setActiveTab] = useState("全部订单");
  const [filters, setFilters] = useState({ query: "", customer: "全部客户", business: "全部", delivery: "全部", exception: "全部", finance: "全部" });
  const filtered = useMemo(() => {
    const normalized = filters.query.trim().toLowerCase();
    return orders.filter((order) => {
      const queryMatch = !normalized || [order.id, order.shortId, order.customer, order.product, order.spec, order.color].some((value) => value.toLowerCase().includes(normalized));
      const customerMatch = filters.customer === "全部客户" || order.customer === filters.customer;
      const businessMatch = filters.business === "全部" || order.business === filters.business;
      const deliveryMatch = filters.delivery === "全部" || order.deliveryMethod === filters.delivery;
      const exceptionMatch = filters.exception === "全部" || order.exception === filters.exception;
      const financeMatch = filters.finance === "全部" || order.finance === filters.finance;
      const tabMatch = activeTab === "全部订单"
        || (activeTab === "待处理" && !["已完成", "已交付"].includes(order.state))
        || (activeTab === "生产中" && ["生产中", "印刷中"].includes(order.state))
        || (activeTab === "待出库" && order.state === "待出库")
        || (activeTab === "缺货" && order.exception === "缺货")
        || (activeTab === "已交付" && ["已完成", "已交付"].includes(order.state))
        || (activeTab === "待对账" && ["待对账", "未入账", "差额/欠款"].includes(order.finance));
      return queryMatch && customerMatch && businessMatch && deliveryMatch && exceptionMatch && financeMatch && tabMatch;
    });
  }, [activeTab, filters]);
  const selected = orderMap.get(selectedId) || orders[0];
  const visibleSelected = filtered.find((order) => order.id === selectedId) || filtered[0] || selected;

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function resetFilters() {
    setFilters({ query: "", customer: "全部客户", business: "全部", delivery: "全部", exception: "全部", finance: "全部" });
    setActiveTab("全部订单");
  }

  function navigateDesktop(view) {
    setActiveView(view);
    requestAnimationFrame(() => document.querySelector(".desktop-workbench")?.scrollIntoView({ block: "start" }));
  }

  function runGlobalSearch(value) {
    setFilters((current) => ({ ...current, query: value }));
    setActiveTab("全部订单");
    navigateDesktop("订单池");
  }

  const supportViews = ["原材料", "客户档案", "通用价格表", "规格库存", "员工机台", "上线状态"];
  const mainClassName = ["desktop-main", activeView === "打包/标签" ? "is-staged" : "", activeView === "对账收款" ? "is-statement" : "", supportViews.includes(activeView) ? "is-support" : ""].filter(Boolean).join(" ");

  return (
    <section className="desktop-workbench" aria-label="PC 订单全流程标签迁移">
      <Sidebar activeView={activeView} onNavigate={navigateDesktop} />
      <Topbar onCreateOrder={() => navigateDesktop("订单录入")} onOpenTodo={() => navigateDesktop("公共待办")} onSearch={runGlobalSearch} />
      <main className={mainClassName}>
        {activeView === "订单池" ? <>
          <section className="orders-panel">
            <div className="overview-toolbar">
              <div className="overview-tabs" role="tablist" aria-label="订单状态快捷筛选">{overviewTabs.map(([label, count]) => <button aria-selected={activeTab === label} key={label} onClick={() => setActiveTab(label)} role="tab" type="button"><span>{label}</span><b>{count}</b></button>)}</div>
              <div className="overview-meta"><span>当前 {filtered.length} / 31</span><button onClick={resetFilters} type="button"><ReloadOutlined />重置</button></div>
            </div>
            <FilterBand filters={filters} setFilter={setFilter} />
            <OrderTable onSelect={setSelectedId} rows={filtered} selectedId={visibleSelected.id} />
          </section>
          <DetailPane onNavigate={navigateDesktop} order={visibleSelected} />
        </> : <PcFlowPage onNavigate={navigateDesktop} view={activeView} />}
      </main>
    </section>
  );
}

function PhoneShell({ caption, index, screenTitle, status, activeNav, children, actions }) {
  return (
    <figure className="phone-figure">
      <figcaption><b>{String(index).padStart(2, "0")}</b><span>{caption}</span></figcaption>
      <article className="atlas-phone" aria-label={`制袋任务 · ${screenTitle}`}>
        <header className="phone-role-bar"><span className="phone-role-mark"><SettingOutlined /></span><strong>制袋任务</strong><button aria-label="切换角色" type="button"><MenuOutlined /></button></header>
        <header className="phone-screen-heading"><h2>{screenTitle}</h2>{status ? <SemanticTag kind="state" size="standard" value={status} /> : null}</header>
        <div className="phone-content" tabIndex="0">{children}</div>
        {actions ? <div className="phone-action-bar">{actions}</div> : null}
        <nav className="phone-bottom-nav" aria-label="制袋任务手机导航"><button className={activeNav === "current" ? "active" : ""} type="button"><InboxOutlined /><span>当前任务</span></button><button className={activeNav === "pending" ? "active" : ""} type="button"><BellOutlined /><span>待处理</span><b>3</b></button><button className={activeNav === "all" ? "active" : ""} type="button"><AppstoreOutlined /><span>全部功能</span></button></nav>
      </article>
    </figure>
  );
}

function TaskIdentity({ compact = false }) {
  return (
    <div className={`phone-task-identity ${compact ? "is-compact" : ""}`}>
      <span><small>客户</small><strong>郑蓉</strong></span>
      <span><small>货品</small><strong>白鲸购物袋</strong></span>
      <div className="phone-tags"><SemanticTag kind="business" size="standard" value="定制单" /><SemanticTag kind="requirement" size="standard" value="加急" /><SemanticTag kind="state" size="standard" value="生产中" /></div>
    </div>
  );
}

function QueuePhone({ onContinue }) {
  const queue = [
    ["郑蓉 · 白鲸购物袋", "30×38×10 · 蓝印白 · 1,200个", "定制单", "加急", "生产中"],
    ["孙玲 · 京东电器", "30×40×10 · 白印红 · 1,500个", "定制单", "加长提", "待复核"],
    ["刘静 · 云杉手提袋", "26×34×10 · 墨绿 · 2,400个", "现货通货", "按扣", "待确认"],
  ];
  return (
    <PhoneShell activeNav="pending" caption="本机队列" index={1} screenTitle="3号机任务" status="待确认" actions={<><button type="button">查看全部</button><button className="phone-primary" onClick={onContinue} type="button">继续当前任务</button></>}>
      <section className="phone-section-heading"><h3>今天顺序</h3><span>已发布 3 项</span></section>
      <div className="phone-task-list">{queue.map(([identity, facts, business, requirement, state], itemIndex) => <button className={itemIndex === 0 ? "selected" : ""} key={identity} type="button"><span className="queue-index">{String(itemIndex + 1).padStart(2, "0")}</span><span className="queue-copy"><strong>{identity}</strong><small>{facts}</small><span><SemanticTag kind="business" value={business} /><SemanticTag kind="requirement" value={requirement} /><SemanticTag kind="state" value={state} /></span></span></button>)}</div>
      <div className="phone-note"><CheckCircleOutlined /><span><strong>只显示已发布排产</strong><small>草稿排产不会出现在工人手机。</small></span></div>
    </PhoneShell>
  );
}

function CurrentTaskPhone({ photoSaved, onCapture, onException, onReport }) {
  return (
    <PhoneShell activeNav="current" caption="当前任务" index={2} screenTitle="当前制袋任务" status="生产中" actions={<><button onClick={onException} type="button"><ToolOutlined />报异常</button><button className="phone-primary" disabled={!photoSaved} onClick={onReport} type="button">{photoSaved ? "照片已保存，报数量" : "照片保存后报数量"}</button></>}>
      <section className="phone-business-sheet">
        <TaskIdentity />
        <dl className="phone-facts"><div><dt>机台 / 顺序</dt><dd>制1-03 · 今日第 4 单</dd></div><div><dt>规格</dt><dd>30×38×10</dd></div><div><dt>颜色组合</dt><dd>蓝印白</dd></div><div><dt>计划</dt><dd>1,200个</dd></div><div><dt>此前累计</dt><dd>600个</dd></div><div><dt>还需合格</dt><dd>600个</dd></div></dl>
      </section>
      <section className={`phone-evidence ${photoSaved ? "is-saved" : ""}`}><span><CameraOutlined /></span><div><strong>合格样袋照片 · {photoSaved ? "已保存" : "必需"}</strong><p>{photoSaved ? "照片已关联当前订单，可以继续报数量。" : "拍一张看清袋型、袋色、提手和印刷效果的样袋照片。"}</p></div><button onClick={onCapture} type="button">{photoSaved ? "重拍" : "拍成品图"}</button></section>
      <div className="phone-note success"><CheckCircleOutlined /><span><strong>前置换模已完成</strong><small>当前任务可以继续生产。</small></span></div>
    </PhoneShell>
  );
}

function ReportPhone({ ready }) {
  const [machineCount, setMachineCount] = useState("820");
  const [qualified, setQualified] = useState("800");
  const abnormal = Math.max(Number(machineCount || 0) - Number(qualified || 0), 0);
  const [submittedMode, setSubmittedMode] = useState(null);
  const submitted = Boolean(submittedMode);
  return (
    <PhoneShell activeNav="current" caption="当日报数" index={3} screenTitle="报制袋数量" status={submittedMode === "complete" ? "已完成" : ready ? "待复核" : "待确认"} actions={<><button disabled={!ready || submitted} onClick={() => setSubmittedMode("daily")} type="button">只报当日数量</button><button className="phone-primary" disabled={!ready || submitted} onClick={() => setSubmittedMode("complete")} type="button">{submitted ? "本次报数已提交" : "核对并报工完成"}</button></>}>
      <TaskIdentity compact />
      <section className={`phone-report-form ${ready ? "is-ready" : ""}`}>
        <header><div><h3>本次报数</h3><p>填前两项，异常数自动算</p></div><SemanticTag kind="state" value={ready ? "待复核" : "待确认"} /></header>
        <label><span>机器动作数</span><span><input inputMode="numeric" onChange={(event) => setMachineCount(event.target.value)} type="number" value={machineCount} /><b>次</b></span><small>设备计数器总数</small></label>
        <label><span>预计合格数量</span><span><input inputMode="numeric" onChange={(event) => setQualified(event.target.value)} type="number" value={qualified} /><b>个</b></span><small>检查合格的数量</small></label>
        <div className="phone-formula"><span>预计异常 / 废品</span><strong>{formatQuantity(abnormal)}个</strong><small>{formatQuantity(Number(machineCount || 0))} − {formatQuantity(Number(qualified || 0))} 自动计算</small></div>
      </section>
      {submitted ? <div className="phone-receipt" role="status"><CheckCircleOutlined /><span><strong>{submittedMode === "daily" ? "当日数量已提交" : "报工完成已提交"}</strong><small>{submittedMode === "daily" ? "任务保持生产中，可继续累计报数。" : "订单状态仍以服务器返回为准。"}</small></span></div> : <div className="phone-note"><CheckCircleOutlined /><span><strong>当日报数与整批完成分开</strong><small>最终完成后才进入下游任务。</small></span></div>}
    </PhoneShell>
  );
}

function MobileFlowAtlas() {
  const [photoSaved, setPhotoSaved] = useState(false);
  const [reportReady, setReportReady] = useState(false);
  const [notice, setNotice] = useState("三张手机画面按新版图谱并列，均可在固定机框内独立滚动。");
  return (
    <section className="mobile-atlas" aria-label="新版手机全流程图谱标签迁移">
      <header className="atlas-heading"><div><span>新版手机全流程图谱 · 制袋工人</span><h2>同一套语义，放回真实手机流程</h2><p>任务池 → 当前任务 → 报数量；保持森林绿、连续白色任务面与动作优先的图谱语言。</p></div><strong>电视大屏保持现有版本，不在本次迁移范围</strong></header>
      <div className="phone-track"><QueuePhone onContinue={() => setNotice("当前任务已定位到第 02 屏。")}/><CurrentTaskPhone onCapture={() => { setPhotoSaved(true); setNotice("样袋照片已保存，可以进入报数量。") }} onException={() => setNotice("异常入口已打开；正式版本将进入异常类型与证据页。") } onReport={() => { setReportReady(true); setNotice("报数页已解锁，请在第 03 屏核对数量。") }} photoSaved={photoSaved}/><ReportPhone ready={reportReady}/></div>
      <footer className="atlas-footer"><span><CheckCircleOutlined />{notice}</span><small>固定高度手机框可内部滚动 · 390px 视觉基线 · 演示数据</small></footer>
    </section>
  );
}

export function App() {
  return <main className="preview-canvas"><DesktopWorkbench /></main>;
}
