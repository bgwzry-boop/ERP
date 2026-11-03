import { useEffect, useState } from "react";
import { confirmOfficeYearEndSettlement, getOfficeYearEndSettlement } from "../../services/officeAttendancePayrollApiClient.js";

// Year-end wage settlement (owner 2026-11-02): pay out each employee's held month and the
// insurance deposit; the deposit is forfeited by anyone who left before year end.
export function YearEndSettlementDialog({ authState, operatorId, canConfirm, onClose }) {
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [paymentReference, setPaymentReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    setState({ loading: true, data: null, error: "" });
    const result = await getOfficeYearEndSettlement({ authState, operatorId, year });
    setState(result.blocked ? { loading: false, data: null, error: result.error?.message || "年底结算读取失败。" } : { loading: false, data: result.data, error: "" });
  }
  useEffect(() => { void load(); }, [year]);

  async function confirm() {
    const data = state.data;
    if (!data || saving || !paymentReference.trim() || !data.pendingCount) return;
    setSaving(true);
    setNotice("");
    const result = await confirmOfficeYearEndSettlement({ authState, operatorId, year: data.year, previewDigest: data.previewDigest, paymentReference: paymentReference.trim() });
    setSaving(false);
    if (result.blocked) { setNotice(result.error?.message || "年底结算确认失败。"); return; }
    setNotice(`已记录 ${data.year} 年年底结算，共 ${data.pendingCount} 人。`);
    setPaymentReference("");
    await load();
  }

  const data = state.data;
  return <div className="payroll-policy-overlay" role="presentation">
    <section aria-modal="true" aria-labelledby="year-end-settlement-title" className="payroll-policy-dialog payroll-year-end-dialog" role="dialog">
      <header><div><h2 id="year-end-settlement-title">年底结算</h2><p>发放入职时暂扣的保险押金和压下的一个月工资。只统计已确认发薪的月份；年底前离职的，押金由个人承担。</p></div><button aria-label="关闭" onClick={onClose} type="button">×</button></header>
      <label><span>结算年份</span><input inputMode="numeric" onChange={(event) => setYear(event.target.value)} value={year} /></label>
      {state.loading ? <p role="status">正在读取…</p> : state.error ? <p role="alert">{state.error}</p> : !data?.rows?.length ? <p>{data?.year} 年没有暂扣的押金或压月工资。</p> : <>
        <div className="payroll-year-end-list" role="table" aria-label="年底结算名单">
          <div role="row" className="is-head"><span role="columnheader">员工</span><span role="columnheader">压月工资</span><span role="columnheader">保险押金</span><span role="columnheader">应发</span><span role="columnheader">状态</span></div>
          {data.rows.map((row) => <div role="row" key={row.employeeId}>
            <span role="cell">{row.name || row.employeeId}<small>{row.note}</small></span>
            <span role="cell">{money(row.heldWage)}</span>
            <span role="cell">{row.depositForfeited ? <s>{money(row.insuranceDeposit)}</s> : money(row.insuranceDeposit)}</span>
            <span role="cell"><strong>{money(row.payableAmount)}</strong></span>
            <span role="cell">{row.settledAt ? `已结算 ${row.settledAt.slice(0, 10)}` : "待结算"}</span>
          </div>)}
        </div>
        <p>待结算 {data.pendingCount} 人，合计 <strong>{money(data.pendingTotal)}</strong>。</p>
        {canConfirm && data.pendingCount ? <>
          <label><span>付款凭证编号</span><input aria-label="年底结算付款凭证编号" onChange={(event) => setPaymentReference(event.target.value)} placeholder="实际转账后填写" value={paymentReference} /></label>
          <footer><button onClick={onClose} type="button">取消</button><button className="primary" disabled={saving || !paymentReference.trim()} onClick={confirm} type="button">{saving ? "正在记录…" : "确认已发放年底结算"}</button></footer>
        </> : !canConfirm ? <p>确认发放需要发薪权限。</p> : null}
      </>}
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  </div>;
}

function money(value) { return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
