import { useEffect, useState } from "react";
import { CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import { getMyOfficeAttendance } from "../../services/officeAttendancePayrollApiClient.js";

export function EmployeeAttendanceMobilePage({ authState, currentUser }) {
  const [month, setMonth] = useState(() => currentMonth());
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  async function refresh() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    const result = await getMyOfficeAttendance({ authState, operatorId: currentUser?.userId, month });
    if (result.blocked) {
      setState({ loading: false, data: null, error: result.error?.message || "本人考勤读取失败。" });
      return;
    }
    setState({ loading: false, data: result.data, error: "" });
  }

  useEffect(() => { refresh(); }, [month]);
  const data = state.data;
  const today = data?.days?.find((day) => day.workDate === todayDate()) || data?.days?.[0] || null;

  return <main className="attendance-self-page">
    <header className="attendance-self-bar"><label><span>考勤月份</span><input aria-label="考勤月份" onChange={(event) => setMonth(event.target.value)} type="month" value={month} /></label><button aria-label="刷新" disabled={state.loading} onClick={refresh} type="button"><ReloadOutlined /></button></header>
    <div className="attendance-phone-scroll">
      {state.error && !data ? <section className="attendance-mobile-blocked" role="alert"><WarningOutlined /><strong>暂时无法读取本人考勤</strong><p>{state.error}</p><small>系统没有返回员工、打卡、工时或工资数据；请管理员完成正式员工编号和账号关联后再试。</small><button disabled={state.loading} onClick={refresh} type="button"><ReloadOutlined />重新读取</button></section> : <>
        {state.error ? <section className="attendance-mobile-alert"><WarningOutlined /><div><strong>部分数据读取失败</strong><p>{state.error}</p></div></section> : null}
        <section className="attendance-mobile-hero">
          <span>{data?.employee?.name || currentUser?.displayName || "当前员工"} · {data?.employee?.roleName || "正式员工"}</span>
          <h1>{today ? `当日已打 ${today.actualPunchCount} 次卡` : state.loading ? "正在读取打卡" : "当日暂无打卡"}</h1>
          <div className="attendance-mobile-punches" aria-label="当日打卡时间">{today?.punchTimes?.map((time, index) => <span key={`${time}-${index}`}><small>{index % 2 ? "下班" : "上班"}</small><strong>{time}</strong></span>)}</div>
          <p><ClockCircleOutlined /> 当日确认工时 <strong>{formatDayHours(today?.status === "pending_review" ? 0 : today?.workMinutes)}</strong></p>
        </section>
        {data?.summary?.pendingExceptionCount ? <section className="attendance-mobile-alert"><WarningOutlined /><div><strong>{data.summary.pendingExceptionCount} 天考勤待复核</strong><p>预计工资已排除这些日期，复核完成后会自动重算。</p></div></section> : <section className="attendance-mobile-ok"><CheckCircleOutlined /><span>本月已读取的打卡没有待复核项</span></section>}
        <section className="attendance-mobile-month">
          <header><div><span>{formatMonth(month)}截至当前</span><h2>{formatHours(data?.summary?.totalWorkMinutes)}</h2></div><CalendarOutlined /></header>
          <div className="attendance-mobile-pay"><span>本月暂估工资</span><strong>{data?.payrollEstimate ? formatMoney(data.payrollEstimate.netWage) : "待计薪规则"}</strong><small>{data?.payrollEstimate ? "仅按已确认工时计算，非最终工资" : "计薪规则发布后显示；系统不会使用演示金额"}</small></div>
          <dl><div><dt>考勤天数</dt><dd>{data?.summary?.attendanceDayCount || 0} 天</dd></div><div><dt>待复核</dt><dd>{data?.summary?.pendingExceptionCount || 0} 天</dd></div><div><dt>考勤身份</dt><dd>{data?.summary?.attendanceMapped ? "已关联" : "未关联"}</dd></div><div><dt>预计排除</dt><dd>{data?.summary?.estimatedExcludedDayCount || 0} 天</dd></div></dl>
        </section>
        <section className="attendance-mobile-days"><header><h2>每日打卡与工时</h2><span>{data?.days?.length || 0} 天</span></header>{data?.days?.length ? data.days.map((day) => <article key={day.workDate}><div><strong>{day.workDate.slice(5)}</strong><small>{weekday(day.workDate)}</small></div><div className="attendance-day-times">{day.punchTimes.map((time, index) => <span key={`${day.workDate}-${time}-${index}`}>{time}</span>)}</div><div><strong>{formatHours(day.status === "pending_review" ? 0 : day.workMinutes)}</strong><small className={day.status === "pending_review" ? "is-warning" : ""}>{day.statusLabel}</small></div></article>) : <div className="attendance-mobile-empty">本月还没有已关联的正式打卡记录。</div>}</section>
        <section className="attendance-mobile-note"><WarningOutlined /><p>原始打卡记录不能由员工修改。漏卡、临时离厂或时间异常由管理人员保留说明后复核，工资只采用确认后的工时。</p></section>
      </>}
    </div>
  </main>;
}

function currentMonth() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(new Date()); }
function todayDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function formatMonth(month) { const [year, value] = month.split("-"); return `${year}年${Number(value)}月`; }
function formatMoney(value) { return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function formatHours(minutes) { return `${(Number(minutes || 0) / 60).toFixed(2)}小时`; }
function formatDayHours(minutes) { const safe = Number(minutes || 0); return `${Math.floor(safe / 60)}小时${String(Math.round(safe % 60)).padStart(2, "0")}分`; }
function weekday(value) { return new Intl.DateTimeFormat("zh-CN", { weekday: "short", timeZone: "Asia/Shanghai" }).format(new Date(`${value}T12:00:00+08:00`)); }
