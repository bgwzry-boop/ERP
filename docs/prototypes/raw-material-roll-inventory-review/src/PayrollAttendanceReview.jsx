/*
THESIS: One employee identity joins device punches, reviewed minutes, and a monthly payroll draft without turning the personnel file into a payroll ledger.
OWN-WORLD: The accountant keeps the existing blue, dense list-detail workbench; the employee view uses the approved forest/moss mobile sheet language.
STORY: Finance finds an employee, sees attendance exceptions before money, then opens the same employee's self-view without exposing anyone else's records.
FIRST VIEWPORT: Desktop leads with the monthly employee ledger and one selected calculation; the phone preview leads with today's punch points and hours before the month estimate.
FORM: Established Operate world, direct extension of the approved PC workbench and mobile role atlas; no new visual identity.
*/
import { useMemo, useState } from "react";
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  InfoCircleOutlined,
  MobileOutlined,
  ReloadOutlined,
  SearchOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import "./payroll-attendance.css";

const previewPatterns = [
  { punches: ["07:54", "12:02", "12:55", "18:07"], todayMinutes: 560, monthMinutes: 4820, performance: 300, exceptionCount: 0 },
  { punches: ["08:01", "12:00", "13:02", "17:46"], todayMinutes: 523, monthMinutes: 4560, performance: 180, exceptionCount: 1 },
  { punches: ["07:48", "12:04", "12:58", "18:16"], todayMinutes: 574, monthMinutes: 5055, performance: 320, exceptionCount: 0 },
  { punches: ["07:57", "12:01", "13:01", "17:53"], todayMinutes: 536, monthMinutes: 4680, performance: 240, exceptionCount: 0 },
  { punches: ["07:51", "12:03", "12:57"], todayMinutes: 247, monthMinutes: 4320, performance: 160, exceptionCount: 1 },
  { punches: ["08:03", "18:09"], todayMinutes: 546, monthMinutes: 4920, performance: 260, exceptionCount: 0 },
];

const fallbackEmployees = [
  { employeeId: "ERP-PREVIEW-01", name: "员工示例A", roleName: "制袋工", defaultWorkshop: "1号车间" },
  { employeeId: "ERP-PREVIEW-02", name: "员工示例B", roleName: "办公室", defaultWorkshop: "办公室" },
  { employeeId: "ERP-PREVIEW-03", name: "员工示例C", roleName: "打包", defaultWorkshop: "打包区" },
];

const formatMoney = (value) => `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatHours = (minutes) => `${(Number(minutes || 0) / 60).toFixed(2)}小时`;
const formatDayHours = (minutes) => `${Math.floor(minutes / 60)}小时${String(minutes % 60).padStart(2, "0")}分`;

function buildPayrollPreviewRows(employees = []) {
  const source = employees.length ? employees.slice(0, 12) : fallbackEmployees;
  return source.map((employee, index) => {
    const pattern = previewPatterns[index % previewPatterns.length];
    const roleName = employee.roleName || "岗位待维护";
    const isSilkWorker = /丝印/.test(`${roleName} ${employee.defaultWorkshop || ""}`);
    const baseHourlyWage = 10 + (index % 3) * 0.5;
    const positionAllowanceHourly = /制袋|丝印/.test(roleName) ? 5 : /打包|库房/.test(roleName) ? 3 : 2;
    const estimatedPay = (pattern.monthMinutes / 60) * (baseHourlyWage + positionAllowanceHourly) + pattern.performance;
    return {
      id: employee.employeeId || employee.id || `ERP-PREVIEW-${index + 1}`,
      name: employee.name || `员工示例${index + 1}`,
      roleName,
      workshop: employee.defaultWorkshop || "所在车间待维护",
      attendanceRule: isSilkWorker ? "每日2次卡" : "每日4次卡",
      ...pattern,
      baseHourlyWage,
      positionAllowanceHourly,
      estimatedPay,
      status: pattern.exceptionCount ? "待考勤复核" : "工资草稿",
    };
  });
}

function buildRecentDays(row) {
  return [
    { date: "8月10日", week: "周一", punches: row.punches, minutes: row.todayMinutes, status: row.exceptionCount ? "待核对" : "正常" },
    { date: "8月9日", week: "周日", punches: ["07:56", "12:01", "12:58", "17:42"], minutes: 529, status: "正常" },
    { date: "8月8日", week: "周六", punches: ["07:59", "12:03", "13:00", "18:11"], minutes: 555, status: "正常" },
    { date: "8月7日", week: "周五", punches: ["07:53", "12:02", "12:56", "17:58"], minutes: 551, status: "正常" },
    { date: "8月6日", week: "周四", punches: ["07:58", "12:00", "13:01"], minutes: 242, status: "漏卡待说明" },
  ];
}

function PreviewState({ children }) {
  const tone = /待|异常|漏卡/.test(String(children)) ? "warning" : "success";
  return <span className={`payroll-state ${tone}`}>{children}</span>;
}

function EmployeeAttendancePhone({ onClose, row }) {
  const recentDays = buildRecentDays(row);
  return <div className="attendance-phone-overlay" role="presentation">
    <button aria-label="关闭员工手机端预览" className="attendance-phone-close" onClick={onClose} type="button"><CloseOutlined /></button>
    <section aria-labelledby="my-attendance-title" aria-modal="true" className="attendance-phone" role="dialog">
      <header className="attendance-phone-bar"><button aria-label="返回工资核算" onClick={onClose} type="button">‹</button><div><strong>我的考勤</strong><small>仅可查看本人</small></div><span>8月</span></header>
      <div className="attendance-phone-scroll">
        <div className="attendance-mobile-preview-label"><InfoCircleOutlined />界面评审示例 · 时间与金额非真实数据</div>
        <section className="attendance-mobile-hero">
          <span>{row.name} · {row.attendanceRule}</span>
          <h1 id="my-attendance-title">今天已打 {row.punches.length} 次卡</h1>
          <div className="attendance-mobile-punches" aria-label="今日打卡时间">{row.punches.map((time, index) => <span key={`${time}-${index}`}><small>{index % 2 ? "下班" : "上班"}</small><strong>{time}</strong></span>)}</div>
          <p><ClockCircleOutlined /> 今日确认工时 <strong>{formatDayHours(row.todayMinutes)}</strong></p>
        </section>

        {row.exceptionCount ? <section className="attendance-mobile-alert"><WarningOutlined /><div><strong>{row.exceptionCount} 条考勤待核对</strong><p>暂估工资只计算已确认工时；可提交漏卡或临时离厂说明。</p></div></section> : <section className="attendance-mobile-ok"><CheckCircleOutlined /><span>今天的打卡已完整匹配</span></section>}

        <section className="attendance-mobile-month">
          <header><div><span>本月截至今日</span><h2>{formatHours(row.monthMinutes)}</h2></div><CalendarOutlined /></header>
          <div className="attendance-mobile-pay"><span>本月暂估工资</span><strong>{formatMoney(row.estimatedPay)}</strong><small>按已确认工时计算，非最终工资</small></div>
          <dl><div><dt>基础时薪</dt><dd>{formatMoney(row.baseHourlyWage)} / 小时</dd></div><div><dt>岗位补贴</dt><dd>{formatMoney(row.positionAllowanceHourly)} / 小时</dd></div><div><dt>绩效</dt><dd>{formatMoney(row.performance)}</dd></div><div><dt>工龄奖</dt><dd>规则待确认</dd></div></dl>
        </section>

        <section className="attendance-mobile-days">
          <header><h2>每日打卡与工时</h2><span>最近5天</span></header>
          {recentDays.map((day) => <article key={day.date}><div><strong>{day.date}</strong><small>{day.week}</small></div><div className="attendance-day-times">{day.punches.map((time, index) => <span key={`${day.date}-${time}-${index}`}>{time}</span>)}</div><div><strong>{formatHours(day.minutes)}</strong><small className={/待|漏卡/.test(day.status) ? "is-warning" : ""}>{day.status}</small></div></article>)}
        </section>

        <section className="attendance-mobile-note"><InfoCircleOutlined /><p>原始打卡不能由员工修改。发现漏卡、临时离厂或时间不对，可提交说明交人事复核。</p></section>
      </div>
      <footer><button type="button">提交考勤说明</button></footer>
    </section>
  </div>;
}

export function PayrollAttendanceReview({ formal }) {
  const rows = useMemo(() => buildPayrollPreviewRows(formal.data.employeeAccountReviews), [formal.data.employeeAccountReviews]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部状态");
  const [selectedId, setSelectedId] = useState(rows[0]?.id || "");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const filteredRows = rows.filter((row) => {
    const queryMatches = !query.trim() || `${row.name} ${row.id} ${row.roleName} ${row.workshop}`.toLowerCase().includes(query.trim().toLowerCase());
    const statusMatches = status === "全部状态" || row.status === status;
    return queryMatches && statusMatches;
  });
  const selected = filteredRows.find((row) => row.id === selectedId) || filteredRows[0] || null;
  const recentDays = selected ? buildRecentDays(selected) : [];

  return <div className="payroll-review-workbench">
    <section className="payroll-review-list">
      <header className="payroll-review-heading"><div><h2>工资核算</h2><span>2026年8月 · 自然月工资草稿</span></div><div><button disabled title="真实打卡机接口尚未接入" type="button"><ReloadOutlined />同步考勤</button><button className="primary" onClick={() => setNotice("评审稿不会生成真实工资；正式版需先处理考勤异常并由会计复核。") } type="button">生成工资草稿</button></div></header>
      <section className="payroll-preview-disclosure"><InfoCircleOutlined /><p><strong>界面评审示例</strong>：以下打卡时间、工时、时薪和金额均非员工真实数据，不会保存或参与发薪。</p></section>
      <div className="payroll-review-filters"><label><SearchOutlined /><input aria-label="搜索员工工资草稿" onChange={(event) => setQuery(event.target.value)} placeholder="搜索员工 / 编号 / 岗位 / 车间" value={query} /></label><select aria-label="工资草稿状态" onChange={(event) => setStatus(event.target.value)} value={status}><option>全部状态</option><option>工资草稿</option><option>待考勤复核</option></select><span>{filteredRows.length} / {rows.length} 人</span></div>
      <div className="payroll-review-table" role="table" aria-label="工资核算列表">
        <div className="payroll-review-row head" role="row"><span>员工 / 规则</span><span>今日打卡</span><span>本月工时</span><span>本月暂估</span><span>异常</span><span>状态</span></div>
        <div className="payroll-review-body">{filteredRows.map((row) => <button aria-pressed={selected?.id === row.id} className={`payroll-review-row${selected?.id === row.id ? " selected" : ""}`} key={row.id} onClick={() => { setSelectedId(row.id); setNotice(""); }} role="row" type="button"><span><strong>{row.name}</strong><small>{row.roleName} · {row.attendanceRule}</small></span><span className="payroll-punch-summary">{row.punches.map((time) => <small key={time}>{time}</small>)}</span><strong>{formatHours(row.monthMinutes)}</strong><strong className="payroll-money">{formatMoney(row.estimatedPay)}</strong><span>{row.exceptionCount ? `${row.exceptionCount}条待核对` : "—"}</span><PreviewState>{row.status}</PreviewState></button>)}</div>
      </div>
    </section>

    <aside className="payroll-review-detail">
      {selected ? <><header><span>2026年8月 · 截至8月10日</span><h2>{selected.name}</h2><PreviewState>{selected.status}</PreviewState></header><div className="payroll-review-detail-scroll">
        <section className="payroll-estimate"><span>本月暂估工资</span><strong>{formatMoney(selected.estimatedPay)}</strong><small>{formatHours(selected.monthMinutes)} 已确认工时 · 非最终工资</small></section>
        {selected.exceptionCount ? <section className="payroll-detail-warning"><WarningOutlined /><div><strong>{selected.exceptionCount}条考勤待核对</strong><p>先完成漏卡或异常处理，再确认工资草稿。</p></div></section> : null}
        <section className="payroll-detail-section"><header><h3>今日考勤</h3><strong>{formatDayHours(selected.todayMinutes)}</strong></header><div className="payroll-detail-punches">{selected.punches.map((time, index) => <span key={`${time}-${index}`}><small>{index % 2 ? "下班" : "上班"}</small><strong>{time}</strong></span>)}</div></section>
        <section className="payroll-detail-section"><header><h3>计薪依据</h3><span>按生效快照</span></header><dl><div><dt>基础时薪</dt><dd>{formatMoney(selected.baseHourlyWage)} / 小时</dd></div><div><dt>岗位补贴</dt><dd>{formatMoney(selected.positionAllowanceHourly)} / 小时</dd></div><div><dt>绩效</dt><dd>{formatMoney(selected.performance)}</dd></div><div><dt>工龄奖</dt><dd>规则待确认</dd></div></dl></section>
        <section className="payroll-detail-section payroll-recent-days"><header><h3>最近工时</h3><span>逐日可追溯</span></header>{recentDays.slice(0, 4).map((day) => <div key={day.date}><span>{day.date}</span><span>{day.punches.join(" · ")}</span><strong>{formatHours(day.minutes)}</strong></div>)}</section>
        {notice ? <section className="payroll-review-notice"><InfoCircleOutlined />{notice}</section> : null}
      </div><footer><button className="primary" onClick={() => setNotice("已进入评审状态：正式版会先锁定考勤、工资快照与复核人。") } type="button">进入工资核对</button><button onClick={() => setMobileOpen(true)} type="button"><MobileOutlined />预览员工本人页面</button></footer></> : <div className="payroll-review-empty"><strong>没有匹配的工资草稿</strong><span>调整筛选条件后重试。</span></div>}
    </aside>
    {mobileOpen && selected ? <EmployeeAttendancePhone onClose={() => setMobileOpen(false)} row={selected} /> : null}
  </div>;
}
