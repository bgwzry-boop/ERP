import { useMemo, useState } from "react";
import {
  CheckCircleOutlined,
  FileDoneOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { SemanticTag } from "./components/SemanticTag.jsx";

const money = (value) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 }).format(value);

const rawMaterialWorkspaces = {
  送货单核对: [
    { id: "RM-0730-01", title: "宁晋县鹏胜无纺布有限公司", subtitle: "送货单 XS-2026-07-04-104 · 9卷 / 853.8kg", state: "待复核", facts: [["识别结果", "9卷"], ["已确认", "8卷"], ["缺少信息", "1卷"], ["当前问题", "第7卷规格待补"]], timeline: ["10:06 OCR 识别完成，生成逐卷核对清单", "10:18 办公室A已确认第1—6卷", "10:22 第7卷转入规格补全"], action: "继续核对第7卷" },
    { id: "RM-0730-02", title: "白侯无纺布", subtitle: "送货单 BH-2026-07-30-015 · 6卷 / 637.2kg", state: "待确认", facts: [["识别结果", "6卷"], ["已确认", "0卷"], ["缺少信息", "0卷"], ["当前问题", "等待人工开始"]], timeline: ["09:48 原始送货单已保存", "09:49 OCR 识别完成", "09:50 已进入办公室共享待办"], action: "开始逐卷核对" },
    { id: "RM-0729-06", title: "安平县宏远无纺布", subtitle: "送货单 AP-0729-06 · 11卷 / 1,082.6kg", state: "已完成", facts: [["识别结果", "11卷"], ["已确认", "11卷"], ["缺少信息", "0卷"], ["打印状态", "11张已打印"]], timeline: ["昨天 16:20 人工核对完成", "昨天 16:26 卷标打印完成", "昨天 17:03 逐卷贴标确认完成"], action: "查看核对记录" },
  ],
  卷标与贴标: [
    { id: "LBL-0730-08", title: "鹏胜送货单 · 第1—8卷", subtitle: "8张不同卷标 · LQ-615KII", state: "待打印", facts: [["待打印", "8张"], ["已打印", "0张"], ["逐卷已贴", "0卷"], ["打印设备", "LQ-615KII"]], timeline: ["10:25 核对通过的8卷进入打印清单", "10:25 第7卷暂不生成卷标", "等待办公室确认打印"], action: "打印8张卷标" },
    { id: "LBL-0729-11", title: "宏远送货单 · 11卷", subtitle: "11张已打印 · 10卷已贴", state: "待复核", facts: [["已打印", "11张"], ["逐卷已贴", "10卷"], ["不一致", "1卷"], ["隔离卷", "RMI-0729-11-07"]], timeline: ["昨天 16:26 标签打印完成", "昨天 17:00 第7卷发现重量不符", "其余10卷已进入可用库存"], action: "处理不一致卷" },
  ],
  库存领用: [
    { id: "RMI-0730-003", title: "本白 · 78克×70宽×2000米", subtitle: "109.8kg · 原料库-可用区", state: "正常", facts: [["卷码", "RMI-0730-003"], ["供应商", "鹏胜无纺布"], ["当前重量", "109.8kg"], ["当前状态", "可用库存"]], timeline: ["10:18 逐卷核对通过", "10:30 标签与实物一致", "尚未登记机边领用"], action: "查看卷码履历" },
    { id: "RMI-0729-027", title: "大红 · 70克×78宽×2000米", subtitle: "83.6kg · 1号机机边", state: "生产中", facts: [["卷码", "RMI-0729-027"], ["供应商", "宏远无纺布"], ["领用机台", "1号机"], ["当前重量", "83.6kg"]], timeline: ["昨天 17:03 入库可用", "今天 08:42 扫码领用到1号机", "未绑定订单，保留卷码追溯"], action: "查看领用记录" },
  ],
  供应商对账: [
    { id: "SUP-ST-0730-01", title: "白侯无纺布 · 7月对账", subtitle: "ERP入库 18,426.4kg · Excel 18,415.9kg", state: "差额/欠款", facts: [["ERP金额", money(158467.04)], ["供应商金额", money(158376.74)], ["重量差额", "10.5kg"], ["待复核", "纸管扣项1条"]], timeline: ["10:05 供应商Excel已导入", "10:08 自动匹配17条，候选1条", "等待办公室确认纸管扣项"], action: "进入差额复核" },
    { id: "SUP-ST-0729-02", title: "鹏胜无纺布 · 7月对账", subtitle: "ERP入库 24,318.8kg · 已全部匹配", state: "已完成", facts: [["ERP金额", money(209141.68)], ["供应商金额", money(209141.68)], ["重量差额", "0kg"], ["匹配结果", "22 / 22"]], timeline: ["昨天 15:10 Excel导入完成", "昨天 15:16 办公室复核通过", "付款仍进入财务授权流程"], action: "查看对账结果" },
  ],
};

const maintenanceRecords = {
  客户档案: [
    { id: "C001", title: "郑蓉", subtitle: "7天一结 · 联系人郑蓉", state: "正常", facts: [["联系电话", "138****1234"], ["交付偏好", "送货"], ["当前应收", money(18650)], ["历史欠款", money(2400)], ["常用标签", "定制多 / 加急"], ["最近订单", "ORD-0729-026-07"]] },
    { id: "C002", title: "王芳", subtitle: "15天一结 · 联系人王芳", state: "待复核", facts: [["联系电话", "139****6221"], ["交付偏好", "自提"], ["当前应收", money(36800)], ["历史欠款", money(1800)], ["常用标签", "现货通货"], ["最近订单", "ORD-0729-026-08"]] },
    { id: "C003", title: "陈敏", subtitle: "月结 · 联系人陈敏", state: "正常", facts: [["联系电话", "137****5510"], ["交付偏好", "送货"], ["当前应收", money(14800)], ["历史欠款", money(0)], ["常用标签", "印刷通货"], ["最近订单", "ORD-0729-026-09"]] },
    { id: "C004", title: "孙玲", subtitle: "7天一结 · 联系人孙玲", state: "正常", facts: [["联系电话", "135****9901"], ["交付偏好", "快递快运"], ["当前应收", money(1282)], ["历史欠款", money(622)], ["常用标签", "加长提"], ["最近订单", "ORD-0729-026-10"]] },
  ],
  规格库存: [
    { id: "SKU-303810", title: "无纺布袋 · 纯色袋 · 30×38×10", subtitle: "标准尺寸 · 接受别名 30×38 / 30×37×10", state: "正常", facts: [["标准尺寸", "30×38×10"], ["匹配别名", "30×38 / 30×37×10"], ["当前使用", "18个库存键"], ["可用总量", "2,390个"], ["缺货颜色", "白色"], ["最近维护", "今天 09:46"]] },
    { id: "SKU-253210", title: "无纺布袋 · 纯色袋 · 25×32×10", subtitle: "标准尺寸 · 服装袋常用", state: "正常", facts: [["标准尺寸", "25×32×10"], ["匹配别名", "25×32"], ["当前使用", "12个库存键"], ["可用总量", "1,250个"], ["缺货颜色", "无"], ["最近维护", "昨天 17:20"]] },
    { id: "SKU-352512", title: "覆膜无纺布袋 · 印刷通货袋 · 35×25×12", subtitle: "标准尺寸 · 双面印常用", state: "待复核", facts: [["标准尺寸", "35×25×12"], ["匹配别名", "35×25"], ["当前使用", "8个库存键"], ["可用总量", "300个"], ["待复核", "新增米色库存键"], ["最近维护", "今天 10:12"]] },
  ],
  员工机台: [
    { id: "EMP-001", title: "办公室A · 周敏", subtitle: "办公室录单 / 对账 · 正式账号", state: "正常", facts: [["岗位", "办公室"], ["登录账号", "office-a"], ["默认终端", "办公室电脑"], ["默认机台", "不适用"], ["账号状态", "已启用"], ["最近复核", "7月29日"]] },
    { id: "EMP-018", title: "制袋工 · 李秀兰", subtitle: "固定机台 · 1号机", state: "生产中", facts: [["岗位", "制袋工"], ["登录账号", "手机岗位端"], ["分配方式", "固定机台"], ["默认机台", "1号机"], ["机台状态", "生产中"], ["当前任务", "BAG-01"]] },
    { id: "EMP-023", title: "丝印工 · 王建军", subtitle: "固定机台 · 3号机", state: "印刷中", facts: [["岗位", "丝印工"], ["登录账号", "手机岗位端"], ["分配方式", "固定机台"], ["默认机台", "3号机"], ["机台状态", "印刷中"], ["当前任务", "PRINT-03"]] },
    { id: "EMP-031", title: "杂工 · 赵红", subtitle: "杂工 / 流动 · 暂未分配机台", state: "待确认", facts: [["岗位", "杂工"], ["登录账号", "尚未启用"], ["分配方式", "杂工 / 流动"], ["默认机台", "暂未分配"], ["账号状态", "待复核"], ["当前任务", "无"]] },
  ],
};

const priceRows = [
  { id: "P-001", category: "无纺布袋", bagType: "纯色袋", size: "25×32×10", price: 0.34, rule: "2,000个起按通用价", pending: false },
  { id: "P-002", category: "无纺布袋", bagType: "纯色袋", size: "30×38×10", price: 0.36, rule: "3,000个以上 ¥0.34", pending: true },
  { id: "P-003", category: "无纺布袋", bagType: "纯色袋", size: "35×41×12", price: 0.48, rule: "2,000个起按通用价", pending: false },
  { id: "P-004", category: "无纺布袋", bagType: "印刷通货袋", size: "30×37×10", price: 0.58, rule: "印刷费另按共享规则", pending: false },
  { id: "P-005", category: "无纺布袋", bagType: "印刷通货袋", size: "40×32×10", price: 0.69, rule: "印刷费另按共享规则", pending: true },
  { id: "P-006", category: "覆膜无纺布袋", bagType: "纯色袋", size: "30×38×10", price: 0.62, rule: "2,000个以上 ¥0.59", pending: false },
  { id: "P-007", category: "覆膜无纺布袋", bagType: "印刷通货袋", size: "35×41×12", price: 0.78, rule: "印刷费另按共享规则", pending: false },
  { id: "P-008", category: "覆膜无纺布袋", bagType: "印刷通货袋", size: "40×32×10", price: 0.89, rule: "印刷费另按共享规则", pending: false },
];

const releaseRows = [
  { id: "D49", title: "真实基础资料导入验收", owner: "办公室 / 管理", state: "待复核", progress: 72, detail: "客户、价格、规格和员工机台需要真实 Excel 样本与签字证据。" },
  { id: "D50", title: "正式员工账号与权限验证", owner: "管理 / 技术运维", state: "待复核", progress: 70, detail: "首个正式账号已准备；真实登录、改密、过期与权限边界仍待现场验证。" },
  { id: "D51", title: "打印设备现场验收", owner: "办公室 / 现场技术", state: "异常暂停", progress: 64, detail: "EPSON LQ-615KII 仍需真实 Windows 11 驱动、走纸、回读和签字证据。" },
  { id: "D52–D53", title: "完整业务闭环与发布签字", owner: "管理 / 各岗位", state: "待确认", progress: 58, detail: "需用真实订单跑完录单、库存、生产打包、出库、对账和异常待办闭环。" },
];

function Panel({ as: Element = "section", className = "", children, label }) {
  return <Element aria-label={label} className={`pc-flow-panel ${className}`.trim()}>{children}</Element>;
}

function Facts({ rows }) {
  return <dl className="flow-facts">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function WorkspaceHeader({ title, meta, children }) {
  return <header className="support-workspace-header"><div><strong>{title}</strong><small>{meta}</small></div>{children}</header>;
}

export function RawMaterialsPage() {
  const [mode, setMode] = useState("送货单核对");
  const [selectedId, setSelectedId] = useState(rawMaterialWorkspaces["送货单核对"][0].id);
  const [notice, setNotice] = useState("");
  const rows = rawMaterialWorkspaces[mode];
  const selected = rows.find((item) => item.id === selectedId) || rows[0];
  function switchMode(nextMode) { setMode(nextMode); setSelectedId(rawMaterialWorkspaces[nextMode][0].id); setNotice(""); }
  return <div className="support-workspace raw-material-workspace">
    <WorkspaceHeader title="原材料" meta="送货单 OCR、逐卷核对、一卷一标、库存领用与供应商对账">
      <div className="support-tabs" role="tablist">{Object.keys(rawMaterialWorkspaces).map((item) => <button aria-selected={mode === item} key={item} onClick={() => switchMode(item)} role="tab" type="button">{item}</button>)}</div>
    </WorkspaceHeader>
    <Panel className="support-list-panel" label={`${mode}列表`}>
      <div className="support-list-toolbar"><strong>{mode}</strong><span>{rows.length} 项</span></div>
      <div className="support-record-list">{rows.map((item) => <button aria-pressed={selected.id === item.id} className={selected.id === item.id ? "selected" : ""} key={item.id} onClick={() => { setSelectedId(item.id); setNotice(""); }} type="button"><span><small>{item.id}</small><SemanticTag kind="state" value={item.state} /></span><strong>{item.title}</strong><p>{item.subtitle}</p></button>)}</div>
    </Panel>
    <Panel as="aside" className="flow-detail-panel support-detail-panel" label={`${mode}详情`}>
      <header className="flow-detail-header"><span>{selected.id}</span><SemanticTag kind="state" size="standard" value={selected.state} /><h2>{selected.title}</h2><p>{selected.subtitle}</p></header>
      <div className="flow-detail-body"><h3>当前事实</h3><Facts rows={selected.facts} /><h3>处理记录</h3><ol className="support-timeline">{selected.timeline.map((item, index) => <li key={item}><b>{String(index + 1).padStart(2, "0")}</b><span>{item}</span></li>)}</ol>{notice ? <div className="flow-success-note"><CheckCircleOutlined />{notice}</div> : null}</div>
      <div className="flow-primary-actions"><button className="primary-button" onClick={() => setNotice(`${selected.action}已打开；正式数据仍以服务器记录为准。`)} type="button">{selected.action}</button><button type="button">查看审计记录</button></div>
    </Panel>
  </div>;
}

export function MaintenancePage({ view }) {
  const records = maintenanceRecords[view];
  const [selectedId, setSelectedId] = useState(records[0].id);
  const [query, setQuery] = useState("");
  const [draftValue, setDraftValue] = useState("");
  const [notice, setNotice] = useState("");
  const visible = records.filter((record) => !query || `${record.title}${record.subtitle}${record.id}`.includes(query));
  const selected = visible.find((item) => item.id === selectedId) || visible[0] || records[0];
  return <div className="support-workspace maintenance-workspace">
    <WorkspaceHeader title={view} meta={`${records.length} 条当前资料 · 单条维护优先，批量导入仅用于首次建库或批量变更`}>
      <button className="secondary-header-action" onClick={() => setNotice(`${view}批量导入说明已打开；日常维护仍从单条草稿进入。`)} type="button">首次建库 / 批量导入</button>
    </WorkspaceHeader>
    <Panel className="support-list-panel" label={`${view}列表`}>
      <label className="support-search"><SearchOutlined /><input aria-label={`${view}搜索`} onChange={(event) => setQuery(event.target.value)} placeholder={`搜索${view} / 编号 / 关键事实`} value={query} /></label>
      <div className="support-record-list">{visible.map((item) => <button aria-pressed={selected.id === item.id} className={selected.id === item.id ? "selected" : ""} key={item.id} onClick={() => { setSelectedId(item.id); setDraftValue(""); setNotice(""); }} type="button"><span><small>{item.id}</small><SemanticTag kind="state" value={item.state} /></span><strong>{item.title}</strong><p>{item.subtitle}</p></button>)}</div>
    </Panel>
    <Panel as="aside" className="flow-detail-panel support-detail-panel" label={`${view}单条维护`}>
      <header className="flow-detail-header"><span>{selected.id}</span><SemanticTag kind="state" size="standard" value={selected.state} /><h2>{selected.title}</h2><p>{selected.subtitle}</p></header>
      <div className="flow-detail-body"><h3>当前资料</h3><Facts rows={selected.facts} /><section className="maintenance-edit"><h3>单条维护草稿</h3><label><span>建议改为</span><input onChange={(event) => setDraftValue(event.target.value)} placeholder="输入新的字段值" value={draftValue} /></label><label><span>原因 / 备注</span><textarea defaultValue="日常维护，待管理复核后写入。" /></label></section>{notice ? <div className="flow-success-note"><CheckCircleOutlined />{notice}</div> : null}</div>
      <div className="flow-primary-actions"><button className="primary-button" disabled={!draftValue.trim()} onClick={() => setNotice(`已生成${view}维护草稿，正式写入仍需复核。`)} type="button">保存维护草稿</button><button type="button">查看关联记录</button></div>
    </Panel>
  </div>;
}

export function PriceTablePage() {
  const [category, setCategory] = useState("全部");
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [publishHistoryOpen, setPublishHistoryOpen] = useState(false);
  const visible = useMemo(() => priceRows.filter((row) => (category === "全部" || row.category === category) && (!query || `${row.bagType}${row.size}`.includes(query))), [category, query]);
  const creating = selectedId === "NEW";
  const selected = creating ? { id: "NEW", category: "无纺布袋", bagType: "纯色袋", size: "待填写", price: 0, rule: "待填写", pending: true } : priceRows.find((row) => row.id === selectedId) || null;
  return <div className={`support-workspace price-workspace ${selected ? "has-detail" : "is-browse"}`}>
    <WorkspaceHeader title="通用价格表" meta="当前使用 8条 · 其中 2条有修改待复核 · 全厂共用，不按客户拆表">
      <button className="secondary-header-action" onClick={() => setPublishHistoryOpen((open) => !open)} type="button">统一发布记录</button>
    </WorkspaceHeader>
    <Panel className="price-browse-panel" label="通用价格表浏览">
      <div className="price-tools"><div className="price-categories"><strong>袋子分类</strong>{["全部", "无纺布袋", "覆膜无纺布袋"].map((item) => <button className={category === item ? "selected" : ""} key={item} onClick={() => setCategory(item)} type="button">{item}</button>)}<button aria-label="新增价格" className="price-add" onClick={() => { setSelectedId("NEW"); setNotice(""); }} type="button"><PlusOutlined /></button></div><label><SearchOutlined /><input onChange={(event) => setQuery(event.target.value)} placeholder="搜索袋型 / 标准尺寸" value={query} /></label></div>
      {publishHistoryOpen ? <div className="price-publish-note"><CheckCircleOutlined /><span><strong>最近统一发布：7月29日 17:40</strong><small>办公室A发布 · 变更 3 条 · 正式价格表仍保留历史快照</small></span></div> : null}
      <div className="price-table"><div className="price-row head"><span>一级分类</span><span>袋型</span><span>标准尺寸</span><span>通用单价</span><span>次级价格 / 规则</span><span>待处理</span></div>{visible.map((row) => <button className={`price-row ${selected?.id === row.id ? "selected" : ""}`} key={row.id} onClick={() => { setSelectedId(row.id); setNotice(""); }} type="button"><span>{row.category}</span><strong>{row.bagType}</strong><strong>{row.size}</strong><span>{money(row.price)} / 个</span><span>{row.rule}</span><span>{row.pending ? <SemanticTag kind="state" value="待复核" /> : "—"}</span></button>)}</div>
    </Panel>
    {selected ? <Panel as="aside" className="flow-detail-panel price-detail-panel" label="通用价格单条维护">
      <header className="flow-detail-header"><span>{selected.id}</span>{selected.pending ? <SemanticTag kind="state" size="standard" value={creating ? "待确认" : "待复核"} /> : null}<h2>{creating ? "新增通用价格" : `${selected.bagType} · ${selected.size}`}</h2><p>{creating ? "先选择一级分类、袋型和标准尺寸，再填写全厂通用价" : `${selected.category} · 当前通用价 ${money(selected.price)} / 个`}</p></header>
      <div className="flow-detail-body"><Facts rows={[["一级分类", selected.category], ["袋型", selected.bagType], ["标准尺寸", selected.size], ["当前通用价", `${money(selected.price)} / 个`], ["次级规则", selected.rule], ["应用范围", "全厂所有客户"]]} /><section className="maintenance-edit"><h3>价格维护草稿</h3><label><span>建议通用价</span><input defaultValue={selected.price.toFixed(2)} inputMode="decimal" /></label><label><span>次级价格 / 规则</span><textarea defaultValue={selected.rule} /></label></section>{notice ? <div className="flow-success-note"><CheckCircleOutlined />{notice}</div> : null}</div>
      <div className="flow-primary-actions"><button className="primary-button" onClick={() => setNotice(`${creating ? "新增价格" : "价格维护"}草稿已保存，将进入统一复核与发布。`) } type="button">{creating ? "保存新增草稿" : "保存价格草稿"}</button><button onClick={() => setSelectedId(null)} type="button">返回完整价格表</button></div>
    </Panel> : null}
  </div>;
}

export function ReleaseStatusPage() {
  const [selectedId, setSelectedId] = useState(releaseRows[0].id);
  const [notice, setNotice] = useState("");
  const selected = releaseRows.find((item) => item.id === selectedId) || releaseRows[0];
  return <div className="support-workspace release-workspace">
    <WorkspaceHeader title="上线状态" meta="当前代码门禁已通过；正式上线仍由 D49—D53 的真实现场证据决定">
      <SemanticTag kind="state" size="standard" value="异常暂停" />
    </WorkspaceHeader>
    <Panel className="support-list-panel" label="上线门禁列表">
      <div className="release-summary"><WarningOutlined /><span><strong>4项现场门禁尚未关闭</strong><small>不把演示、截图或本地通过当成正式上线证据。</small></span></div>
      <div className="release-list">{releaseRows.map((item) => <button aria-pressed={selected.id === item.id} className={selected.id === item.id ? "selected" : ""} key={item.id} onClick={() => { setSelectedId(item.id); setNotice(""); }} type="button"><span><b>{item.id}</b><SemanticTag kind="state" value={item.state} /></span><strong>{item.title}</strong><small>{item.owner}</small><progress max="100" value={item.progress} /><em>{item.progress}% 资料就绪</em></button>)}</div>
    </Panel>
    <Panel as="aside" className="flow-detail-panel support-detail-panel" label="上线门禁详情">
      <header className="flow-detail-header"><span>{selected.id}</span><SemanticTag kind="state" size="standard" value={selected.state} /><h2>{selected.title}</h2><p>{selected.owner}</p></header>
      <div className="flow-detail-body"><section className="release-detail-callout"><FileDoneOutlined /><div><strong>当前缺口</strong><p>{selected.detail}</p></div></section><h3>关闭门禁需要</h3><ol className="support-timeline"><li><b>01</b><span>真实设备、真实账号或真实业务单据执行记录</span></li><li><b>02</b><span>服务器产生的权威结果与失败恢复记录</span></li><li><b>03</b><span>对应岗位、负责人和时间完整的现场签字</span></li></ol>{notice ? <div className="flow-success-note"><CheckCircleOutlined />{notice}</div> : null}</div>
      <div className="flow-primary-actions"><button className="primary-button" onClick={() => setNotice(`${selected.id} 现场证据清单已展开；尚未产生新的正式证据。`)} type="button">打开现场证据清单</button><button type="button"><ReloadOutlined />刷新状态</button></div>
    </Panel>
  </div>;
}

export function PcSupportPage({ view }) {
  if (view === "原材料") return <RawMaterialsPage />;
  if (view === "通用价格表") return <PriceTablePage />;
  if (["客户档案", "规格库存", "员工机台"].includes(view)) return <MaintenancePage view={view} />;
  if (view === "上线状态") return <ReleaseStatusPage />;
  return null;
}
