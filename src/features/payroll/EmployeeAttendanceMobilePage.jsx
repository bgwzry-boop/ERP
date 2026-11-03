import { findAttendanceDay } from "./attendanceMobilePresentation.js";
import { useEffect, useRef, useState } from "react";
import { CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, FileDoneOutlined, ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import { acknowledgeMyOfficePayslip, getMyOfficeAttendance, getMyOfficePayslip } from "../../services/officeAttendancePayrollApiClient.js";

export function EmployeeAttendanceMobilePage({ authState, currentUser }) {
  const requestVersion = useRef(0);
  const [month, setMonth] = useState(() => currentMonth());
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [payslip, setPayslip] = useState({ loading: true, data: null, error: "" });
  // The latest month and session on screen. A late reply for another month or an earlier
  // session must never reload this page with stale parameters (release review 2026-11-03).
  const viewRef = useRef({ month, authState, userId: currentUser?.userId });
  viewRef.current = { month, authState, userId: currentUser?.userId };

  async function refresh() {
    const { month, authState, userId } = viewRef.current;
    const version = ++requestVersion.current;
    setState({ loading: true, data: null, error: "" });
    setPayslip({ loading: true, data: null, error: "" });
    const [result, payslipResult] = await Promise.all([
      getMyOfficeAttendance({ authState, operatorId: userId, month }),
      getMyOfficePayslip({ authState, operatorId: userId, month }),
    ]);
    if (version !== requestVersion.current || viewRef.current.month !== month || viewRef.current.authState !== authState) return;
    setPayslip(payslipResult.blocked
      ? { loading: false, data: null, error: payslipResult.error?.message || "本人工资条读取失败。" }
      : { loading: false, data: payslipResult.data, error: "" });
    if (result.blocked) {
      setState({ loading: false, data: null, error: result.error?.message || "本人考勤读取失败。" });
      return;
    }
    setState({ loading: false, data: result.data, error: "" });
  }

  useEffect(() => { refresh(); return () => { requestVersion.current += 1; }; }, [month, authState, currentUser?.userId]);
  const data = state.data;
  const today = findAttendanceDay(data?.days, todayDate());
  const isCurrentMonth = month === currentMonth();

  return <main className="attendance-self-page">
    <header className="attendance-self-bar"><label><span>考勤月份</span><input aria-label="考勤月份" onChange={(event) => { if (event.target.value) setMonth(event.target.value); }} type="month" value={month} /></label><button aria-label="刷新" disabled={state.loading} onClick={refresh} type="button"><ReloadOutlined /></button></header>
    <div className="attendance-phone-scroll">
      {state.loading ? <section className="attendance-mobile-empty" role="status">正在读取 {formatMonth(month)} 的本人考勤…</section> : state.error && !data ? <section className="attendance-mobile-blocked" role="alert"><WarningOutlined /><strong>暂时无法读取本人考勤</strong><p>{state.error}</p><small>系统没有返回员工、打卡、工时或工资数据；请管理员完成正式员工编号和账号关联后再试。</small><button disabled={state.loading} onClick={refresh} type="button"><ReloadOutlined />重新读取</button></section> : <>
        {state.error ? <section className="attendance-mobile-alert"><WarningOutlined /><div><strong>部分数据读取失败</strong><p>{state.error}</p></div></section> : null}
        {isCurrentMonth ? <section className="attendance-mobile-hero">
          <span>{data?.employee?.name || currentUser?.displayName || "当前员工"} · {data?.employee?.roleName || "正式员工"}</span>
          <h1>{today ? `今日已打 ${today.actualPunchCount} 次卡` : state.loading ? "正在读取打卡" : "今日暂无打卡"}</h1>
          <div className="attendance-mobile-punches" aria-label="今日打卡时间">{today?.punchTimes?.map((time, index) => <span key={`${time}-${index}`}><small>{index % 2 ? "下班" : "上班"}</small><strong>{time}</strong></span>)}</div>
          <p><ClockCircleOutlined /> 今日确认工时 <strong>{formatDayHours(today?.status === "pending_review" ? 0 : today?.workMinutes)}</strong></p>
        </section> : null}
        {data?.summary?.pendingExceptionCount ? <section className="attendance-mobile-alert"><WarningOutlined /><div><strong>{data.summary.pendingExceptionCount} 天考勤待复核</strong><p>预计工资已排除这些日期，复核完成后会自动重算。</p></div></section> : <section className="attendance-mobile-ok"><CheckCircleOutlined /><span>所选月份已读取的打卡没有待复核项</span></section>}
        <section className="attendance-mobile-month">
          <header><div><span>{formatMonth(month)}{isCurrentMonth ? " · 截至今日" : " · 月度记录"}</span><h2>{formatHours(data?.summary?.totalWorkMinutes)}</h2></div><CalendarOutlined /></header>
          <div className="attendance-mobile-pay"><span>所选月份暂估工资</span><strong>{data?.payrollEstimate ? formatMoney(data.payrollEstimate.netWage) : "待计薪规则"}</strong><small>{data?.payrollEstimate ? "仅按已确认工时计算，非最终工资" : "计薪规则发布后显示；系统不会使用演示金额"}</small></div>
          <dl><div><dt>考勤天数</dt><dd>{data?.summary?.attendanceDayCount || 0} 天</dd></div><div><dt>待复核</dt><dd>{data?.summary?.pendingExceptionCount || 0} 天</dd></div><div><dt>考勤身份</dt><dd>{data?.summary?.attendanceMapped ? "已关联" : "未关联"}</dd></div><div><dt>预计排除</dt><dd>{data?.summary?.estimatedExcludedDayCount || 0} 天</dd></div></dl>
        </section>
        <PayslipSection
          key={month}
          month={month}
          state={payslip}
          onConfirm={async (slip) => {
            // Confirm exactly the payslip on screen: its own month, revision and amount, never the picker's month.
            const sent = viewRef.current;
            const result = await acknowledgeMyOfficePayslip({ authState: sent.authState, operatorId: sent.userId, month: slip.payrollMonth, revision: slip.revision, netWage: slip.netWage });
            // A late reply after switching month or account must not touch the page now on screen.
            const current = viewRef.current;
            if (current.month !== slip.payrollMonth || current.authState !== sent.authState || current.userId !== sent.userId) return "";
            if (result.blocked) return result.error?.message || "工资条确认失败。";
            await refresh();
            return "";
          }}
        />
        <section className="attendance-mobile-days"><header><h2>每日打卡与工时</h2><span>{data?.days?.length || 0} 天</span></header>{data?.days?.length ? data.days.map((day) => <article key={day.workDate}><div><strong>{day.workDate.slice(5)}</strong><small>{weekday(day.workDate)}</small></div><div className="attendance-day-times">{day.punchTimes.map((time, index) => <span key={`${day.workDate}-${time}-${index}`}>{time}</span>)}</div><div><strong>{formatHours(day.status === "pending_review" ? 0 : day.workMinutes)}</strong><small className={day.status === "pending_review" ? "is-warning" : ""}>{day.statusLabel}</small></div></article>) : <div className="attendance-mobile-empty">所选月份还没有已关联的正式打卡记录。</div>}</section>
        <section className="attendance-mobile-note"><WarningOutlined /><p>原始打卡记录不能由员工修改。漏卡、临时离厂或时间异常由管理人员保留说明后复核，工资只采用确认后的工时。</p></section>
      </>}
    </div>
  </main>;
}

// Online payslip: only reviewed / paid wages appear; deposit and held month wait for year end.
function PayslipSection({ month, state, onConfirm }) {
  // A response for another month (slow request, month just switched) is never shown or confirmed.
  const forThisMonth = state.data?.month === month;
  const slip = forThisMonth && state.data?.payslip?.payrollMonth === month ? state.data.payslip : null;
  const yearEnd = forThisMonth ? state.data?.yearEndSettlement : null;
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  async function confirm() {
    if (!slip || confirming) return;
    setConfirming(true);
    setConfirmError("");
    try {
      setConfirmError(await onConfirm?.(slip) || "");
    } finally {
      setConfirming(false);
    }
  }
  return <section className="attendance-mobile-payslip" aria-label="本人工资条">
    <header><div><span>{formatMonth(month)} · 工资条</span><h2>{slip ? formatMoney(slip.payableNow) : "—"}</h2></div><FileDoneOutlined /></header>
    {state.loading || (state.data && !forThisMonth) ? <p role="status">正在读取工资条…</p> : state.error ? <p className="is-warning" role="alert">{state.error}</p> : !slip ? <p>本月工资还没有复核，复核后在这里显示工资条。</p> : <>
      <p className="attendance-payslip-status">{slip.statusLabel}{slip.paidAt ? ` · ${slip.paidAt.slice(0, 10)}` : ""} · 本次发放</p>
      <dl>
        {slip.items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd className={item.amount < 0 ? "is-negative" : undefined}>{formatMoney(item.amount)}</dd></div>)}
        <div className="is-total"><dt>实发工资</dt><dd>{formatMoney(slip.netWage)}</dd></div>
        {slip.insuranceDepositWithheld ? <div><dt>保险押金（年底结算）</dt><dd className="is-negative">{formatMoney(-slip.insuranceDepositWithheld)}</dd></div> : null}
        {slip.heldWage ? <div><dt>压月工资（年底结算）</dt><dd className="is-negative">{formatMoney(-slip.heldWage)}</dd></div> : null}
      </dl>
      {slip.adjustmentReason ? <p className="attendance-payslip-reason">调整说明：{slip.adjustmentReason}</p> : null}
      {slip.acknowledgedAt
        ? <p className="attendance-payslip-confirmed"><CheckCircleOutlined /> 已于 {slip.acknowledgedAt.slice(0, 10)} 确认工资条无误</p>
        : <>
          <button className="attendance-payslip-confirm" disabled={confirming} onClick={confirm} type="button">{confirming ? "正在确认…" : "核对无误，确认工资条"}</button>
          <p className="attendance-payslip-hint">有疑问请先找办公室核对，不要点确认。</p>
        </>}
      {confirmError ? <p className="is-warning" role="alert">{confirmError}</p> : null}
    </>}
    {yearEnd?.total ? <p className="attendance-payslip-yearend">{yearEnd.settledAt
      ? yearEnd.remainingAfterSettlement > 0
        ? `${yearEnd.year} 年度已年底结算 ${formatMoney(yearEnd.settledAmount)}，还有 ${formatMoney(yearEnd.remainingAfterSettlement)} 待结算`
        : `${yearEnd.year} 年度年底结算已发放 ${formatMoney(yearEnd.settledAmount)}`
      : `${yearEnd.year} 年度待年底结算 ${formatMoney(yearEnd.total)}（保险押金 ${formatMoney(yearEnd.insuranceDeposit)} + 压月工资 ${formatMoney(yearEnd.heldWage)}）`}</p> : null}
  </section>;
}

function currentMonth() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(new Date()); }
function todayDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function formatMonth(month) { const [year, value] = month.split("-"); return `${year}年${Number(value)}月`; }
function formatMoney(value) { return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function formatHours(minutes) { return `${(Number(minutes || 0) / 60).toFixed(2)}小时`; }
function formatDayHours(minutes) { const safe = Number(minutes || 0); return `${Math.floor(safe / 60)}小时${String(Math.round(safe % 60)).padStart(2, "0")}分`; }
function weekday(value) { return new Intl.DateTimeFormat("zh-CN", { weekday: "short", timeZone: "Asia/Shanghai" }).format(new Date(`${value}T12:00:00+08:00`)); }
