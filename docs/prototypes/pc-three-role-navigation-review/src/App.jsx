import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppstoreOutlined,
  BellOutlined,
  BookOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  DatabaseOutlined,
  DollarCircleOutlined,
  DownOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  FundProjectionScreenOutlined,
  HomeOutlined,
  InboxOutlined,
  LeftOutlined,
  LineChartOutlined,
  PayCircleOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReconciliationOutlined,
  ReloadOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  TagsOutlined,
  ToolOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { SemanticTag } from "../../../../src/shared/ui/operational.jsx";
import {
  decisions,
  navGroups,
  roles,
  rollInventory,
  supplierMonthEnd,
  workbenches,
} from "./data.js";

const navIcons = {
  home: HomeOutlined,
  orders: ReconciliationOutlined,
  materials: FileTextOutlined,
  production: ToolOutlined,
  finance: DollarCircleOutlined,
  master: BookOutlined,
  system: SettingOutlined,
};

const statusValue = (label) => {
  if (/异常|差异|冻结|阻塞|逾期|失败|缺/.test(label)) return "blocked";
  if (/已完成|已匹配|有效|通过|正常|在线|可用|可出库|可生产|已核算|已结清/.test(label)) return "done";
  if (/生产中|运行中/.test(label)) return "running";
  return "pending";
};

function StateTag({ children, size = "compact" }) {
  return <SemanticTag kind="state" label={children} size={size} value={statusValue(String(children))} />;
}

function Sidebar({ activeRole, activeView, expandedGroups, onRoleChange, onToggleGroup, onNavigate }) {
  const visibleGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.roles.includes(activeRole)) }))
    .filter((group) => group.items.length);

  return (
    <aside className="sidebar" aria-label="PC 业务导航">
      <div className="brand">
        <AppstoreOutlined aria-hidden="true" />
        <div>
          <strong>袋袋赢 ERP</strong>
          <span>无纺布袋工厂</span>
        </div>
      </div>

      <div className="role-switcher" aria-label="预览岗位">
        <span className="role-switcher-caption">预览岗位</span>
        {roles.map((role) => (
          <button
            aria-pressed={activeRole === role.id}
            className={activeRole === role.id ? "active" : ""}
            key={role.id}
            onClick={() => onRoleChange(role.id)}
            type="button"
          >
            <UserOutlined aria-hidden="true" />
            <span>{role.label}{activeRole === role.id ? ` · ${role.scope}` : ""}</span>
            {activeRole === role.id ? <DownOutlined aria-hidden="true" /> : null}
          </button>
        ))}
      </div>

      <nav className="business-tree">
        {visibleGroups.map((group) => {
          const Icon = navIcons[group.icon];
          const expanded = expandedGroups.has(group.id);
          const activeInside = group.items.some((item) => item.id === activeView);
          return (
            <section className={`nav-group ${activeInside ? "contains-active" : ""}`} key={group.id}>
              <button
                aria-expanded={expanded}
                className="nav-group-button"
                onClick={() => onToggleGroup(group.id)}
                type="button"
              >
                <Icon aria-hidden="true" />
                <span>{group.label}</span>
                <DownOutlined className={expanded ? "expanded" : ""} aria-hidden="true" />
              </button>
              {expanded ? (
                <div className="nav-children">
                  {group.items.map((item) => (
                    <button
                      aria-current={activeView === item.id ? "page" : undefined}
                      className={activeView === item.id ? "active" : ""}
                      data-view-id={item.id}
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      type="button"
                    >
                      <span>{item.label}</span>
                      {item.id === "shared-todos" ? <b>8</b> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </nav>
    </aside>
  );
}

function Topbar({ activeRole, search, onSearch, onNavigate }) {
  const role = roles.find((item) => item.id === activeRole);
  return (
    <header className="topbar">
      <strong className="factory-name">虎门工厂</strong>
      <label className="global-search">
        <SearchOutlined aria-hidden="true" />
        <span className="sr-only">全局搜索</span>
        <input
          onChange={(event) => onSearch(event.target.value)}
          placeholder="搜索客户 / 订单 / 尺寸 / 颜色 / 单据"
          value={search}
        />
      </label>
      {activeRole !== "finance" ? (
        <button className="primary top-create" onClick={() => onNavigate("order-entry")} type="button">
          <PlusOutlined aria-hidden="true" /> 新建订单
        </button>
      ) : (
        <button className="primary top-create" onClick={() => onNavigate("customer-statements")} type="button">
          <PayCircleOutlined aria-hidden="true" /> 对账收款
        </button>
      )}
      <span className="top-divider" aria-hidden="true" />
      <button className="icon-button notification" aria-label="8 条通知" type="button">
        <BellOutlined aria-hidden="true" />
        <b>8</b>
      </button>
      <div className="top-role">
        <span className="avatar"><UserOutlined aria-hidden="true" /></span>
        <div>
          <strong>{role.label}</strong>
          <span>{role.scope}</span>
        </div>
        <DownOutlined aria-hidden="true" />
      </div>
    </header>
  );
}

function PageHeading({ title, onRefresh, refreshedAt }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {refreshedAt ? <span>数据更新于 {refreshedAt}</span> : null}
      </div>
      <button className="refresh-button" onClick={onRefresh} type="button">
        <ReloadOutlined aria-hidden="true" /> 刷新
      </button>
    </div>
  );
}

const metricIcons = [FileDoneOutlined, SafetyCertificateOutlined, PayCircleOutlined, LineChartOutlined];
const metricTones = ["blue", "orange", "green", "purple"];

function MetricCard({ metrics, labelsAreValues = false }) {
  return (
    <section className="metric-card" aria-label="状态摘要">
      {metrics.map((metric, index) => {
        const Icon = metricIcons[index % metricIcons.length];
        const [label, value] = metric;
        return (
          <div className="metric-item" key={label}>
            <span className={`metric-icon ${metricTones[index % metricTones.length]}`}><Icon aria-hidden="true" /></span>
            <div>
              <span>{label}</span>
              <strong className={labelsAreValues ? "small" : ""}>{value}</strong>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function DecisionBadge({ tone, children }) {
  return <span className={`decision-badge ${tone}`}>{children}</span>;
}

function DecisionDetail({ decision, resolved, onClose, onAction }) {
  if (!decision) return null;
  return (
    <aside className="decision-detail" aria-label="决策详情">
      <div className="detail-titlebar">
        <div>
          <h2>{decision.title}</h2>
          <DecisionBadge tone={decision.tone}>{decision.category}</DecisionBadge>
        </div>
        <button aria-label="关闭详情" className="icon-button" onClick={onClose} type="button"><CloseOutlined /></button>
      </div>
      <section className="detail-section">
        <h3>事项说明</h3>
        {decision.description.map((line) => <p key={line}>{line}</p>)}
      </section>
      <section className="detail-section">
        <h3>相关信息</h3>
        <dl className="facts-list">
          {decision.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      </section>
      <section className="detail-section">
        <h3>影响评估</h3>
        <ul className="impact-list">{decision.impact.map((item) => <li key={item}>{item}</li>)}</ul>
        <h3 className="action-title">操作建议</h3>
        <div className="detail-actions">
          <button className="primary" disabled={resolved} onClick={() => onAction(decision.primaryAction)} type="button">
            {resolved ? "已处理" : decision.primaryAction}
          </button>
          {decision.secondaryActions.map((action) => <button disabled={resolved} key={action} onClick={() => onAction(action)} type="button">{action}</button>)}
        </div>
      </section>
      <section className="detail-section operation-log">
        <div><strong>{resolved ? "老板已提交决定" : "系统自动触发"}</strong><span>{resolved ? "刚刚" : decision.triggeredAt}</span></div>
        <p>{resolved ? "决定已记录到原业务对象，等待下一岗位继续。" : "依据交期、差异或到账证据生成待决定事项。"}</p>
      </section>
    </aside>
  );
}

function Overview({ search, selectedId, onSelect, detailOpen, onCloseDetail, resolvedIds, onDecisionAction }) {
  const [queueTab, setQueueTab] = useState("all");
  const tabs = [
    ["all", "全部", 4],
    ["insert", "插单决定", 1],
    ["exception", "差异处理", 2],
    ["finance", "对账核销", 1],
  ];
  const filtered = decisions.filter((item) => {
    const tabMatches = queueTab === "all" || item.categoryKey === queueTab;
    const queryMatches = !search || `${item.title}${item.subject}${item.reference}`.toLowerCase().includes(search.toLowerCase());
    return tabMatches && queryMatches;
  });
  const selected = decisions.find((item) => item.id === selectedId) ?? decisions[0];

  const changeTab = (key) => {
    setQueueTab(key);
    const next = decisions.find((item) => key === "all" || item.categoryKey === key);
    if (next) onSelect(next.id);
  };

  return (
    <div className={`overview-grid ${detailOpen ? "" : "detail-closed"}`}>
      <div className="overview-main">
        <MetricCard metrics={[["今日待决定", String(4 - resolvedIds.size)], ["交期风险", "2"], ["待核销", "¥18,460"], ["本月毛利待复核", "1"]]} />
        <section className="decision-panel">
          <div className="panel-heading">
            <h2>决策队列</h2>
            <div className="queue-tabs" role="tablist" aria-label="决策类型">
              {tabs.map(([key, label, count]) => (
                <button aria-selected={queueTab === key} className={queueTab === key ? "active" : ""} key={key} onClick={() => changeTab(key)} role="tab" type="button">
                  {label} <span>{count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="decision-table" role="table" aria-label="决策队列">
            <div className="decision-row head" role="row">
              <span>事项</span><span>对象</span><span>类型</span><span>金额/数量</span><span>相关单据</span><span>触发时间</span>
            </div>
            {filtered.map((item) => (
              <button
                aria-pressed={selectedId === item.id}
                className={`decision-row ${selectedId === item.id ? "selected" : ""} ${resolvedIds.has(item.id) ? "resolved" : ""}`}
                data-decision-id={item.id}
                key={item.id}
                onClick={() => onSelect(item.id)}
                role="row"
                type="button"
              >
                <span className="decision-name"><i className={item.tone} aria-hidden="true" /><span><strong>{item.title}</strong><small>{item.subjectLabel}：{item.subject}</small></span></span>
                <span>{item.subject}</span>
                <span><DecisionBadge tone={item.tone}>{resolvedIds.has(item.id) ? "已处理" : item.category}</DecisionBadge></span>
                <span>{item.amount}</span>
                <span>{item.reference}</span>
                <span>{item.triggeredAt}</span>
              </button>
            ))}
            {!filtered.length ? <div className="empty-state">没有匹配的决策事项</div> : null}
          </div>
          <div className="table-footer"><span>共 {filtered.length} 项</span><div><button aria-label="上一页" type="button"><LeftOutlined /></button><b>1</b><button aria-label="下一页" type="button"><RightOutlined /></button><span>20条/页</span></div></div>
        </section>
      </div>
      {detailOpen ? <DecisionDetail decision={selected} resolved={resolvedIds.has(selected.id)} onAction={(action) => onDecisionAction(selected, action)} onClose={onCloseDetail} /> : null}
    </div>
  );
}

function GenericDetail({ config, row, roleId, viewId, onAction }) {
  const readOnly = roleId === "finance" && viewId === "order-pool";
  const actionLabel = readOnly ? "仅可查看结算证据" : viewId === "order-entry" ? "继续校验" : viewId === "customer-statements" ? "打开对账单" : "查看完整记录";
  return (
    <aside className="workbench-detail">
      <div className="detail-titlebar compact">
        <div><span>当前选中</span><h2>{row?.[0] ?? config.title}</h2></div>
        <StateTag>{row?.[row.length - 1] ?? "待处理"}</StateTag>
      </div>
      <section className="detail-section">
        <h3>业务事实</h3>
        <dl className="facts-list">
          {config.columns.map((column, index) => <div key={column}><dt>{column}</dt><dd>{row?.[index] ?? "—"}</dd></div>)}
          <div><dt>当前岗位</dt><dd>{roles.find((role) => role.id === roleId)?.label}</dd></div>
        </dl>
      </section>
      <section className="detail-section evidence-block">
        <h3>同一对象的后续</h3>
        <p>订单、库存、出库与对账沿用同一业务编号；切换岗位不会复制记录。</p>
        {readOnly ? <div className="permission-note"><SafetyCertificateOutlined /> 财会仅可读取订单与交付证据，不能修改订单。</div> : null}
      </section>
      <section className="detail-section detail-bottom-action">
        <button className="primary wide" disabled={readOnly} onClick={() => onAction(actionLabel)} type="button">{actionLabel}</button>
      </section>
    </aside>
  );
}

function GenericWorkbench({ config, roleId, search, viewId, onAction }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const rows = config.rows.filter((row) => !search || row.join(" ").toLowerCase().includes(search.toLowerCase()));
  const selectedRow = rows[selectedIndex] ?? rows[0];
  return (
    <>
      <MetricCard labelsAreValues metrics={config.metrics} />
      <div className="workbench-grid">
        <section className="workbench-panel">
          <div className="workbench-intro"><div><h2>{config.title}</h2><p>{config.description}</p></div><span>{rows.length} 条</span></div>
          <div className="generic-table" role="table" aria-label={config.title}>
            <div className="generic-row head" role="row">{config.columns.map((column) => <span key={column}>{column}</span>)}</div>
            {rows.map((row, index) => (
              <button aria-pressed={selectedIndex === index} className={`generic-row ${selectedIndex === index ? "selected" : ""}`} key={`${row[0]}-${index}`} onClick={() => setSelectedIndex(index)} role="row" type="button">
                {row.map((cell, cellIndex) => <span key={`${cell}-${cellIndex}`}>{cellIndex === row.length - 1 ? <StateTag>{cell}</StateTag> : cell}</span>)}
              </button>
            ))}
          </div>
          {!rows.length ? <div className="empty-state">没有匹配记录，请调整全局搜索。</div> : null}
        </section>
        <GenericDetail config={config} onAction={onAction} roleId={roleId} row={selectedRow} viewId={viewId} />
      </div>
    </>
  );
}

function DistributionBar({ label, value, percent, tone }) {
  return (
    <div className="distribution-row">
      <div><strong>{label}</strong><span>{value}</span></div>
      <span className="distribution-track"><i className={tone} style={{ width: `${percent}%` }} /></span>
    </div>
  );
}

function RollInventory({ search, onAction }) {
  const [selectedId, setSelectedId] = useState(rollInventory[0].id);
  const rows = rollInventory.filter((roll) => !search || Object.values(roll).join(" ").toLowerCase().includes(search.toLowerCase()));
  const selected = rollInventory.find((roll) => roll.id === selectedId) ?? rollInventory[0];
  return (
    <>
      <section className="business-rule-strip">
        <div><FileDoneOutlined /><span><strong>票据层</strong> 用供应商、单号、图片指纹查重，避免同一张票重复录入。</span></div>
        <RightOutlined />
        <div><DatabaseOutlined /><span><strong>库存层</strong> 核对后拆成每一卷，日常按卷码、颜色与宽幅管理。</span></div>
      </section>
      <MetricCard labelsAreValues metrics={[["可用卷", "6卷"], ["可用重量", "526.8kg"], ["待复核", "2卷"], ["机边领用", "1卷"]]} />
      <div className="workbench-grid roll-grid">
        <section className="workbench-panel">
          <div className="workbench-intro"><div><h2>每卷库存</h2><p>默认查看物理卷；来源票据只作为追溯字段。</p></div><span>{rows.length} / {rollInventory.length} 卷</span></div>
          <div className="roll-table" role="table" aria-label="每卷库存">
            <div className="roll-row head" role="row"><span>卷码</span><span>颜色 / 规格</span><span>本卷重量</span><span>库位</span><span>状态</span></div>
            {rows.map((roll) => (
              <button aria-pressed={selected.id === roll.id} className={`roll-row ${selected.id === roll.id ? "selected" : ""}`} key={roll.id} onClick={() => setSelectedId(roll.id)} role="row" type="button">
                <span><strong>{roll.id}</strong><small>{roll.supplier}</small></span>
                <span><strong>{roll.color}</strong><small>{roll.spec}</small></span>
                <span>{roll.weight}</span><span>{roll.location}</span><span><StateTag>{roll.state}</StateTag></span>
              </button>
            ))}
          </div>
        </section>
        <aside className="workbench-detail roll-detail">
          <div className="detail-titlebar compact"><div><span>当前卷</span><h2>{selected.id}</h2></div><StateTag>{selected.state}</StateTag></div>
          <section className="detail-section">
            <h3>本卷事实</h3>
            <dl className="facts-list">
              <div><dt>颜色</dt><dd>{selected.color}</dd></div><div><dt>规格</dt><dd>{selected.spec}</dd></div><div><dt>本卷重量</dt><dd>{selected.weight}</dd></div><div><dt>库位</dt><dd>{selected.location}</dd></div><div><dt>供应商</dt><dd>{selected.supplier}</dd></div><div><dt>来源票据</dt><dd>{selected.inbound}</dd></div>
            </dl>
          </section>
          <section className="detail-section distribution-section">
            <div className="section-title-line"><h3>当前可用分布</h3><span>按卷统计</span></div>
            <h4>宽幅</h4>
            <DistributionBar label="70cm" value="4卷 · 335.2kg" percent={76} tone="green" />
            <DistributionBar label="80cm" value="2卷 · 191.6kg" percent={44} tone="blue" />
            <DistributionBar label="90cm" value="0卷 · 待复核2卷" percent={18} tone="amber" />
            <h4>颜色</h4>
            <DistributionBar label="翠绿" value="2卷 · 167.1kg" percent={58} tone="green" />
            <DistributionBar label="深灰" value="2卷 · 191.6kg" percent={64} tone="slate" />
            <DistributionBar label="天兰 / 果绿" value="2卷 · 168.1kg" percent={58} tone="blue" />
          </section>
          <section className="detail-section detail-bottom-action"><button className="primary wide" onClick={() => onAction(`已打开 ${selected.id} 的完整卷档案`)} type="button">查看卷档案</button></section>
        </aside>
      </div>
    </>
  );
}

const monthEndSteps = [
  ["difference", "差异决定"],
  ["approved", "办公室确认匹配"],
  ["matched", "财会生成应付"],
  ["payable", "付款确认"],
];

function SupplierMonthEnd({ roleId, stage, onAdvance, search }) {
  const roleCopy = {
    owner: { label: "老板", action: stage === "difference" ? "批准差异并继续" : "查看完整证据", note: "处理重大差异，查看同一月结对象的完整链路。" },
    office: { label: "办公室", action: stage === "approved" ? "确认匹配并交财会" : "等待老板决定", note: "导入、自动匹配并确认差异，不执行付款。" },
    finance: { label: "财会", action: stage === "matched" ? "生成应付" : stage === "payable" ? "确认付款" : "等待上一步完成", note: "读取确认后的匹配证据，生成应付并确认付款。" },
  }[roleId];
  const currentIndex = stage === "paid" ? monthEndSteps.length : monthEndSteps.findIndex(([key]) => key === stage);
  const actionDisabled = (roleId === "owner" && stage !== "difference") || (roleId === "office" && stage !== "approved") || (roleId === "finance" && !["matched", "payable"].includes(stage));
  const lines = supplierMonthEnd.lines.filter((line) => !search || line.join(" ").toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <section className="role-scope-banner"><UserOutlined /><div><strong>{roleCopy.label}当前职责</strong><span>{roleCopy.note}</span></div><span className="object-id">同一对象 · {supplierMonthEnd.id}</span></section>
      <MetricCard labelsAreValues metrics={[["供应商金额", supplierMonthEnd.supplierAmount], ["系统核算", supplierMonthEnd.systemAmount], ["差异", supplierMonthEnd.difference], ["匹配卷数", `${supplierMonthEnd.matched}/${supplierMonthEnd.rolls}`]]} />
      <div className="workbench-grid month-end-grid">
        <section className="workbench-panel">
          <div className="workbench-intro"><div><h2>{supplierMonthEnd.supplier} · {supplierMonthEnd.period}</h2><p>月结按供应商 + 期间组织，不是另一份入库单列表。</p></div><StateTag>{supplierMonthEnd.status}</StateTag></div>
          <ol className="step-strip" aria-label="月结进度">
            {monthEndSteps.map(([key, label], index) => <li className={index < currentIndex ? "done" : index === currentIndex ? "active" : ""} key={key}><i>{index < currentIndex ? <CheckCircleOutlined /> : index + 1}</i><span>{label}</span></li>)}
          </ol>
          <div className="generic-table month-lines" role="table" aria-label="月结来源">
            <div className="generic-row head" role="row"><span>日期</span><span>来源收货单</span><span>物理卷</span><span>系统金额</span><span>匹配结果</span></div>
            {lines.map((line) => <div className="generic-row" key={line[1]} role="row">{line.map((cell, index) => <span key={`${cell}-${index}`}>{index === line.length - 1 ? <StateTag>{cell}</StateTag> : cell}</span>)}</div>)}
          </div>
        </section>
        <aside className="workbench-detail">
          <div className="detail-titlebar compact"><div><span>供应商月结对象</span><h2>{supplierMonthEnd.id}</h2></div><StateTag>{supplierMonthEnd.status}</StateTag></div>
          <section className="detail-section"><h3>结算事实</h3><dl className="facts-list"><div><dt>供应商</dt><dd>{supplierMonthEnd.supplier}</dd></div><div><dt>结算期间</dt><dd>{supplierMonthEnd.period}</dd></div><div><dt>来源收货单</dt><dd>{supplierMonthEnd.receipts}</dd></div><div><dt>物理卷</dt><dd>{supplierMonthEnd.rolls}</dd></div><div><dt>供应商金额</dt><dd>{supplierMonthEnd.supplierAmount}</dd></div><div><dt>系统核算</dt><dd>{supplierMonthEnd.systemAmount}</dd></div><div><dt>差异</dt><dd className="danger-text">{supplierMonthEnd.difference}</dd></div></dl></section>
          <section className="detail-section evidence-block"><h3>差异证据</h3><p>2 卷纸管扣重与 1 行重复计价；来源收货单和每卷重量保持只读追溯。</p><button className="text-link" type="button">查看 3 项来源证据 <RightOutlined /></button></section>
          <section className="detail-section detail-bottom-action"><button className="primary wide" disabled={actionDisabled} onClick={() => onAdvance(roleCopy.action)} type="button">{roleCopy.action}</button>{actionDisabled ? <span className="action-help">请先由上一岗位完成当前环节。</span> : null}</section>
        </aside>
      </div>
    </>
  );
}

function AppContent({ activeView, roleId, search, monthEndStage, onMonthEndAdvance, onAction, overviewProps }) {
  if (activeView === "overview") return <Overview search={search} {...overviewProps} />;
  if (activeView === "roll-inventory") return <RollInventory onAction={onAction} search={search} />;
  if (activeView === "supplier-month-end") return <SupplierMonthEnd onAdvance={onMonthEndAdvance} roleId={roleId} search={search} stage={monthEndStage} />;
  const config = workbenches[activeView] ?? workbenches["shared-todos"];
  return <GenericWorkbench config={config} key={activeView} onAction={onAction} roleId={roleId} search={search} viewId={activeView} />;
}

export function App() {
  const [activeRole, setActiveRole] = useState("owner");
  const [activeView, setActiveView] = useState("overview");
  const [expandedGroups, setExpandedGroups] = useState(() => new Set(navGroups.map((group) => group.id)));
  const [selectedDecision, setSelectedDecision] = useState(decisions[0].id);
  const [detailOpen, setDetailOpen] = useState(true);
  const [resolvedIds, setResolvedIds] = useState(() => new Set());
  const [monthEndStage, setMonthEndStage] = useState("difference");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshedAt, setRefreshedAt] = useState("");
  const workspaceRef = useRef(null);
  const scrollPositions = useRef({});

  const pageLabel = useMemo(() => navGroups.flatMap((group) => group.items).find((item) => item.id === activeView)?.label ?? "经营总览", [activeView]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return undefined;
    window.requestAnimationFrame(() => {
      workspace.scrollTop = scrollPositions.current[activeView] ?? 0;
    });
    return () => {
      scrollPositions.current[activeView] = workspace.scrollTop;
    };
  }, [activeView]);

  const showNotice = (message) => {
    setNotice(message);
    window.clearTimeout(window.__erpNoticeTimer);
    window.__erpNoticeTimer = window.setTimeout(() => setNotice(""), 3200);
  };

  const handleRoleChange = (roleId) => {
    const role = roles.find((item) => item.id === roleId);
    setActiveRole(roleId);
    setActiveView(role.defaultView);
    setSearch("");
    setDetailOpen(true);
    showNotice(`已切换为${role.label}预览，菜单按岗位权限重新整理。`);
  };

  const handleToggleGroup = (groupId) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleNavigate = (viewId) => {
    const allowed = navGroups.flatMap((group) => group.items).find((item) => item.id === viewId)?.roles.includes(activeRole);
    if (!allowed) {
      showNotice("当前岗位没有这个工作台的操作权限。");
      return;
    }
    setActiveView(viewId);
    setSearch("");
  };

  const handleDecisionAction = (decision, action) => {
    if (action === decision.primaryAction || action === "拒绝插单" || action === "安排补产" || action === "按实发货" || action === "退回复点" || action === "退回财会") {
      setResolvedIds((current) => new Set([...current, decision.id]));
    }
    if (decision.id === "supplier-diff" && action === decision.primaryAction) setMonthEndStage("approved");
    showNotice(`${action}已记录到 ${decision.reference}，原业务对象未复制。`);
  };

  const handleMonthEndAdvance = (action) => {
    const transitions = { difference: "approved", approved: "matched", matched: "payable", payable: "paid" };
    const next = transitions[monthEndStage];
    if (next) setMonthEndStage(next);
    showNotice(`${action}已写入 ${supplierMonthEnd.id}，下一岗位可继续处理。`);
  };

  const handleRefresh = () => {
    const now = new Date();
    setRefreshedAt(now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }));
    showNotice("已刷新当前工作台数据。 ");
  };

  const overviewProps = {
    selectedId: selectedDecision,
    onSelect: (id) => { setSelectedDecision(id); setDetailOpen(true); },
    detailOpen,
    onCloseDetail: () => setDetailOpen(false),
    resolvedIds,
    onDecisionAction: handleDecisionAction,
  };

  return (
    <>
      <div className="desktop-boundary"><AppstoreOutlined /><h1>三岗位 PC 全流程评审稿</h1><p>此原型按电脑工作台设计，请使用 900px 以上宽度查看。</p></div>
      <div className="erp-shell" data-active-role={activeRole} data-active-view={activeView}>
        <Sidebar activeRole={activeRole} activeView={activeView} expandedGroups={expandedGroups} onNavigate={handleNavigate} onRoleChange={handleRoleChange} onToggleGroup={handleToggleGroup} />
        <div className="app-stage">
          <Topbar activeRole={activeRole} onNavigate={handleNavigate} onSearch={setSearch} search={search} />
          <main className="workspace" ref={workspaceRef}>
            <PageHeading onRefresh={handleRefresh} refreshedAt={refreshedAt} title={pageLabel} />
            <AppContent activeView={activeView} monthEndStage={monthEndStage} onAction={showNotice} onMonthEndAdvance={handleMonthEndAdvance} overviewProps={overviewProps} roleId={activeRole} search={search} />
          </main>
        </div>
        <div aria-live="polite" className={`toast ${notice ? "show" : ""}`} role="status"><CheckCircleOutlined /> {notice}</div>
      </div>
    </>
  );
}
