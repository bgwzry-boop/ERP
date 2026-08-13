import { useEffect, useMemo, useState } from "react";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  generateOfficePayrollDraft,
  getOfficeEmployeeAttendance,
  createOfficePayrollExport,
  getOfficePayrollHistory,
  getOfficePayrollRun,
  getOfficePayrollWorkbench,
  precheckOfficeAttendanceSync,
  reviewOfficeAttendanceDay,
  saveOfficePayrollPolicy,
  syncOfficeAttendance,
  transitionOfficePayrollRun,
  updateOfficePayrollLineAdjustment,
} from "../../services/officeAttendancePayrollApiClient.js";
import {
  createPayrollAdjustmentEvidenceAttachmentInput,
  uploadOfficeAttachmentFile,
} from "../../services/officeAttachmentApiClient.js";

const runStatusLabels = Object.freeze({ draft: "工资草稿", reviewed: "会计已复核", locked: "已锁定", paid: "已发薪" });

const workbookPositionRates = Object.freeze([
  { key: "PAY-BAG", name: "制袋机-理袋女工", people: 10, mode: "hourly", baseRate: 10, allowanceRate: 5, machineScope: "1–9号制袋机", note: "原表包含3月14日前的调薪前记录" },
  { key: "PAY-PRINT", name: "印刷机-男工", people: 4, mode: "hourly", baseRate: 15, allowanceRate: 5, machineScope: "1–4号印刷机" },
  { key: "PAY-MALE", name: "普工-男杂工", people: 4, mode: "hourly", baseRate: 15, allowanceRate: 3, machineScope: "按车间安排", note: "原表包含3月份的调薪前记录" },
  { key: "PAY-FEMALE", name: "女杂工", people: 3, mode: "hourly", baseRate: 10, allowanceRate: 2, machineScope: "按车间安排", note: "原表包含3月份的调薪前记录" },
  { key: "PAY-LEAD", name: "普工组长", people: 1, mode: "hourly", baseRate: 15, allowanceRate: 5, machineScope: "生产车间" },
  { key: "PAY-WARE", name: "库管-女", people: 1, mode: "hourly", baseRate: 10, allowanceRate: 5, machineScope: "库房 / 出库" },
  { key: "PAY-OFFICE", name: "办公室-女", people: 2, mode: "hourly", baseRate: 10, allowanceRate: 2, machineScope: "办公室", note: "原表包含2–3月份的调薪前记录" },
  { key: "PAY-HANDLE", name: "提手-拿袋", people: 1, mode: "hourly", baseRate: 10, allowanceRate: 2, machineScope: "提手工序", note: "原表另保留早期“提手”岗位名称" },
  { key: "PAY-TECH", name: "技术工", people: 1, mode: "hourly", baseRate: 15, allowanceRate: 5, machineScope: "技术支持" },
  { key: "PAY-DRIVER", name: "送货司机", people: 2, mode: "daily", baseRate: 180, allowanceRate: null, machineScope: "送货 / 提货" },
]);

const seniorityAwardsFromWorkbook = Object.freeze([
  { years: 1, amount: 30 }, { years: 2, amount: 45 }, { years: 3, amount: 60 }, { years: 4, amount: 75 },
  { years: 5, amount: 90 }, { years: 6, amount: 105 }, { years: 7, amount: 120 }, { years: 8, amount: 135 },
]);

export function PayrollAttendancePage({ authState, currentUser, permissionContext }) {
  const [view, setView] = useState(() => new URLSearchParams(window.location.search).get("payrollView") === "positions" ? "positions" : "employees");
  const [month, setMonth] = useState(() => currentMonth());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部状态");
  const [positionQuery, setPositionQuery] = useState("");
  const [positionMode, setPositionMode] = useState("全部方式");
  const [selectedPositionKey, setSelectedPositionKey] = useState(workbookPositionRates[0].key);
  const [workbench, setWorkbench] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeAttendance, setEmployeeAttendance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRevision, setDetailRevision] = useState(0);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyForm, setPolicyForm] = useState({ versionLabel: "", effectiveFrom: "", regularHours: "", overtimeMultiplier: "", seniorityAwards: "" });
  const [reviewForm, setReviewForm] = useState({ workDate: "", status: "approved", adjustedHours: "", explanation: "" });
  const [paymentReference, setPaymentReference] = useState("");
  const [runDetail, setRunDetail] = useState(null);
  const [payrollHistory, setPayrollHistory] = useState(null);
  const [adjustmentForm, setAdjustmentForm] = useState({ performanceAward: "", leaveDeduction: "", otherDeduction: "", reason: "" });
  const [adjustmentEvidence, setAdjustmentEvidence] = useState([]);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const operatorId = currentUser?.userId || "";
  const permissions = new Set([...(permissionContext?.actionPermissions || []), ...(permissionContext?.buttonPermissions || [])]);
  const canSync = permissions.has("attendance.sync");
  const canReviewAttendance = permissions.has("attendance.review");
  const canManagePolicy = permissions.has("payroll.policy.manage");
  const canExportPayroll = permissions.has("payroll.export");
  const canReviewPayroll = permissions.has("payroll.review");
  const canLockPayroll = permissions.has("payroll.lock");
  const canConfirmPayment = permissions.has("payroll.payment.confirm");

  async function refresh({ preserveSelection = true } = {}) {
    setLoading(true);
    setError("");
    const result = await getOfficePayrollWorkbench({ authState, operatorId, month });
    setLoading(false);
    if (result.blocked) {
      setWorkbench(null);
      setError(result.error?.message || "工资核算工作台读取失败。");
      return;
    }
    const next = result.data;
    setWorkbench(next);
    const currentSelection = preserveSelection ? selectedEmployeeId : "";
    const nextSelection = next.employees?.some((employee) => employee.employeeId === currentSelection)
      ? currentSelection
      : next.employees?.[0]?.employeeId || "";
    setSelectedEmployeeId(nextSelection);
  }

  useEffect(() => {
    if (view === "employees") refresh({ preserveSelection: false });
  }, [month, view]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setEmployeeAttendance(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    getOfficeEmployeeAttendance({ authState, operatorId, employeeId: selectedEmployeeId, month }).then((result) => {
      if (!active) return;
      setDetailLoading(false);
      if (result.blocked) {
        setEmployeeAttendance(null);
        setError(result.error?.message || "员工考勤读取失败。");
        return;
      }
      setEmployeeAttendance(result.data);
      const firstPending = result.data?.days?.find((day) => day.status === "pending_review");
      setReviewForm((current) => ({ ...current, workDate: firstPending?.workDate || "" }));
    });
    return () => { active = false; };
  }, [selectedEmployeeId, month, detailRevision]);

  const rows = useMemo(() => (workbench?.employees || []).filter((employee) => {
    const text = `${employee.name} ${employee.employeeId} ${employee.roleName} ${employee.workshop}`.toLowerCase();
    const queryMatches = !query.trim() || text.includes(query.trim().toLowerCase());
    const state = employee.readyForDraft ? "可生成草稿" : "资料待补齐";
    return queryMatches && (filter === "全部状态" || state === filter);
  }), [workbench, query, filter]);
  const positionRows = useMemo(() => workbookPositionRates.filter((position) => {
    const text = `${position.key} ${position.name} ${position.machineScope}`.toLowerCase();
    const queryMatches = !positionQuery.trim() || text.includes(positionQuery.trim().toLowerCase());
    const modeMatches = positionMode === "全部方式" || (positionMode === "按小时" ? position.mode === "hourly" : position.mode === "daily");
    return queryMatches && modeMatches;
  }), [positionMode, positionQuery]);
  const selectedPosition = positionRows.find((position) => position.key === selectedPositionKey)
    || workbookPositionRates.find((position) => position.key === selectedPositionKey)
    || positionRows[0]
    || null;
  const selected = rows.find((employee) => employee.employeeId === selectedEmployeeId)
    || workbench?.employees?.find((employee) => employee.employeeId === selectedEmployeeId)
    || rows[0]
    || null;
  const latestRun = workbench?.payrollRuns?.[0] || null;
  const latestPayrollLine = runDetail?.payrollLines?.find((line) => line.employeeId === selectedEmployeeId) || null;

  useEffect(() => {
    if (!selectedEmployeeId) {
      setRunDetail(null);
      setPayrollHistory(null);
      return undefined;
    }
    let active = true;
    setRunDetail(null);
    Promise.all([
      latestRun
        ? getOfficePayrollRun({ authState, operatorId, payrollRunId: latestRun.id })
        : Promise.resolve({ blocked: false, data: null }),
      getOfficePayrollHistory({ authState, operatorId, employeeId: selectedEmployeeId, limit: 24 }),
    ]).then(([runResult, historyResult]) => {
      if (!active) return;
      if (runResult.blocked || historyResult.blocked) {
        setError(runResult.error?.message || historyResult.error?.message || "工资明细读取失败。");
        return;
      }
      setRunDetail(runResult.data);
      setPayrollHistory(historyResult.data);
      const line = runResult.data?.payrollLines?.find((item) => item.employeeId === selectedEmployeeId);
      setAdjustmentForm({
        performanceAward: line ? String(line.performanceAward || 0) : "",
        leaveDeduction: line ? String(line.leaveDeduction || 0) : "",
        otherDeduction: line ? String(line.otherDeduction || 0) : "",
        reason: "",
      });
    });
    return () => { active = false; };
  }, [selectedEmployeeId, latestRun?.id, detailRevision]);

  async function perform(key, request, successMessage) {
    setActionLoading(key);
    setError("");
    setNotice("");
    const result = await request();
    setActionLoading("");
    if (result.blocked) {
      const blockers = result.error?.details?.blockers;
      setError(Array.isArray(blockers) && blockers.length
        ? `${result.error.message} ${blockers.slice(0, 3).map((item) => `${item.employeeId}：${item.message}`).join("；")}${blockers.length > 3 ? "……" : ""}`
        : result.error?.message || "操作失败。");
      return false;
    }
    setNotice(successMessage);
    await refresh();
    setDetailRevision((revision) => revision + 1);
    return true;
  }

  async function handleSync() {
    const rangeStart = `${month}-01T00:00:00+08:00`;
    const nextMonth = monthAfter(month);
    const rangeEnd = `${nextMonth}-01T00:00:00+08:00`;
    setActionLoading("sync-precheck");
    setError("");
    setNotice("");
    const precheck = await precheckOfficeAttendanceSync({ authState, operatorId, rangeStart, rangeEnd });
    if (precheck.blocked) {
      setActionLoading("");
      setError(precheck.error?.message || "考勤来源预检失败。");
      return;
    }
    if (!precheck.data?.ready) {
      setActionLoading("");
      const reasons = (precheck.data?.blockingReasons || [])
        .slice(0, 3)
        .map((item) => item.message)
        .filter(Boolean);
      setError(`考勤只读预检未通过，未写入任何打卡。${reasons.length ? ` ${reasons.join("；")}` : ""}`);
      return;
    }
    if (!precheck.data?.importRecommended) {
      setActionLoading("");
      setNotice("考勤只读预检通过，本时间范围没有新增打卡，无需重复导入。");
      return;
    }
    setActionLoading("sync");
    const syncResult = await syncOfficeAttendance({ authState, operatorId, rangeStart, rangeEnd });
    setActionLoading("");
    if (syncResult.blocked) {
      setError(syncResult.error?.message || "考勤同步失败。");
      return;
    }
    const importedCount = Number(syncResult.data?.batch?.importedCount ?? syncResult.data?.importedCount ?? 0);
    setNotice(`考勤预检通过并完成导入：实际新增 ${importedCount} 条。`);
    await refresh();
    setDetailRevision((revision) => revision + 1);
  }

  async function handlePolicyPublish(event) {
    event.preventDefault();
    const regularHours = Number(policyForm.regularHours);
    let seniorityAwards;
    try {
      seniorityAwards = parseSeniorityAwards(policyForm.seniorityAwards);
    } catch (policyError) {
      setError(policyError?.message || "工龄奖格式无效。");
      return;
    }
    const policyDefinition = {
      regularMinutesPerDay: Math.round(regularHours * 60),
      overtimeMultiplier: Number(policyForm.overtimeMultiplier),
      seniorityAwards,
    };
    const success = await perform("policy", async () => {
      const draftResult = await saveOfficePayrollPolicy({
        authState,
        operatorId,
        policyVersion: {
          versionLabel: policyForm.versionLabel,
          effectiveFrom: policyForm.effectiveFrom,
          status: "draft",
          policy: policyDefinition,
        },
      });
      if (draftResult.blocked) return draftResult;
      const draft = draftResult.data?.policyVersion;
      if (!draft?.id) {
        return { blocked: true, error: { message: "计薪规则草稿保存后未返回版本编号，未执行发布。" } };
      }
      return saveOfficePayrollPolicy({
        authState,
        operatorId,
        policyVersion: {
          id: draft.id,
          versionLabel: draft.versionLabel,
          effectiveFrom: draft.effectiveFrom,
          effectiveTo: draft.effectiveTo,
          status: "published",
          policy: draft.policy,
        },
      });
    }, "计薪规则已先保存草稿，再发布为不可变版本。");
    if (success) setPolicyOpen(false);
  }

  async function handleAttendanceReview(event) {
    event.preventDefault();
    if (!selected) return;
    const success = await perform("attendance-review", () => reviewOfficeAttendanceDay({
      authState,
      operatorId,
      employeeId: selected.employeeId,
      workDate: reviewForm.workDate,
      status: reviewForm.status,
      adjustedWorkMinutes: reviewForm.status === "adjusted" ? Math.round(Number(reviewForm.adjustedHours) * 60) : undefined,
      explanation: reviewForm.explanation,
    }), "该日考勤已复核，工资预估已按确认工时重算。");
    if (success) setReviewForm((current) => ({ ...current, explanation: "", adjustedHours: "" }));
  }

  async function handleRunTransition(action) {
    if (!latestRun) return;
    const confirmation = payrollTransitionConfirmation({ action, payrollRun: latestRun, paymentReference });
    if (!window.confirm(confirmation)) return;
    const label = action === "review" ? "工资草稿已由会计复核。" : action === "lock" ? "工资批次已锁定。" : "发薪已确认并记录付款凭证。";
    const success = await perform(`run-${action}`, () => transitionOfficePayrollRun({ authState, operatorId, payrollRunId: latestRun.id, action, paymentReference }), label);
    if (success && action === "payment") setPaymentReference("");
  }

  async function handleAdjustment(event) {
    event.preventDefault();
    if (!latestRun || !selected) return;
    const success = await perform("payroll-adjustment", () => updateOfficePayrollLineAdjustment({
      authState,
      operatorId,
      payrollRunId: latestRun.id,
      employeeId: selected.employeeId,
      performanceAward: Number(adjustmentForm.performanceAward || 0),
      leaveDeduction: Number(adjustmentForm.leaveDeduction || 0),
      otherDeduction: Number(adjustmentForm.otherDeduction || 0),
      reason: adjustmentForm.reason,
      evidenceAttachmentIds: adjustmentEvidence.map((item) => item.attachmentId),
    }), "工资调整已保存，并记录调整前后值和会计依据。");
    if (success) {
      setAdjustmentForm((current) => ({ ...current, reason: "" }));
      setAdjustmentEvidence([]);
    }
  }

  async function handleAdjustmentEvidenceUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !latestRun || !selected || adjustmentEvidence.length >= 5) return;
    setEvidenceBusy(true);
    setError("");
    const attachmentInput = createPayrollAdjustmentEvidenceAttachmentInput({
      payrollRunId: latestRun.id,
      employeeId: selected.employeeId,
      operatorId,
      remark: adjustmentForm.reason,
      file,
    });
    const result = await uploadOfficeAttachmentFile({
      ...attachmentInput,
      authState,
      file,
    });
    setEvidenceBusy(false);
    if (result.blocked || !result.attachment?.attachmentId) {
      setError(result.error?.message || "工资调整凭证上传失败。");
      return;
    }
    setAdjustmentEvidence((current) => [...current, result.attachment].slice(0, 5));
  }

  async function handleExport() {
    if (!latestRun) return;
    setActionLoading("export");
    setError("");
    const result = await createOfficePayrollExport({ authState, operatorId, payrollRunId: latestRun.id });
    setActionLoading("");
    if (result.blocked) {
      setError(result.error?.message || "工资表导出失败。");
      return;
    }
    downloadPayrollCsv(result.data);
    setNotice(`工资表已导出：${result.data.fileName}`);
  }

  return <div className="payroll-review-workbench">
    <section className="payroll-review-list">
      <header className="payroll-review-heading">
        <div><h2>工资核算</h2><span>{view === "positions" ? "按原工资表统一维护岗位和薪资构成" : `${formatMonth(month)} · 次月核对上月完整考勤后生成工资草稿`}</span></div>
        {view === "employees" ? <div>
          <input aria-label="工资月份" className="payroll-month-input" onChange={(event) => setMonth(event.target.value)} type="month" value={month} />
          {canSync ? <button disabled={actionLoading === "sync" || actionLoading === "sync-precheck" || !workbench?.sourceStatus?.configured} onClick={handleSync} title={workbench?.sourceStatus?.configured ? "先只读预检，再同步真实打卡机数据" : "真实考勤来源尚未配置"} type="button"><ReloadOutlined />同步考勤</button> : null}
          {canManagePolicy ? <button onClick={() => setPolicyOpen(true)} type="button"><SettingOutlined />计薪规则</button> : null}
          {latestRun && latestRun.status !== "draft" && canExportPayroll ? <button disabled={actionLoading === "export"} onClick={handleExport} type="button"><DownloadOutlined />导出工资表</button> : null}
          {canReviewPayroll ? <button className="primary" disabled={actionLoading === "draft" || workbench?.summary?.draftReady !== true} onClick={() => perform("draft", () => generateOfficePayrollDraft({ authState, operatorId, month }), "工资草稿已生成。") } title={payrollDraftActionTitle(workbench)} type="button">生成工资草稿</button> : null}
        </div> : <div className="payroll-position-summary"><strong>29 人</strong><span>已覆盖原表岗位</span></div>}
      </header>
      <nav aria-label="工资核算工作台" className="payroll-workbench-tabs"><button aria-pressed={view === "employees"} className={view === "employees" ? "active" : ""} onClick={() => setView("employees")} type="button">员工工资核算</button><button aria-pressed={view === "positions"} className={view === "positions" ? "active" : ""} onClick={() => setView("positions")} type="button">岗位工资标准</button></nav>
      {view === "employees" ? <>
        <section className={`payroll-source-strip ${workbench?.sourceStatus?.configured ? "success" : "warning"}`}>
          {workbench?.sourceStatus?.configured ? <CheckCircleOutlined /> : <WarningOutlined />}
          <span>{workbench?.sourceStatus?.label || "正在确认考勤来源"}</span>
          {workbench?.policyVersion ? <small>计薪版本：{workbench.policyVersion.versionLabel}</small> : <small>本月计薪规则未发布，暂不显示金额</small>}
        </section>
        <div className="payroll-review-filters">
          <label><SearchOutlined /><input aria-label="搜索员工工资" onChange={(event) => setQuery(event.target.value)} placeholder="搜索员工 / 编号 / 岗位 / 车间" value={query} /></label>
          <select aria-label="工资准备状态" onChange={(event) => setFilter(event.target.value)} value={filter}><option>全部状态</option><option>可生成草稿</option><option>资料待补齐</option></select>
          <span>{rows.length} / {workbench?.employees?.length || 0} 人</span>
        </div>
        {error ? <div className="payroll-inline-error" role="alert"><WarningOutlined />{error}</div> : null}
        {notice ? <div className="payroll-inline-notice"><CheckCircleOutlined />{notice}</div> : null}
        <div className="payroll-review-table" role="table" aria-label="工资核算列表">
          <div className="payroll-review-row head" role="row"><span>员工 / 考勤规则</span><span>本月确认工时</span><span>待复核</span><span>本月暂估</span><span>准备状态</span></div>
          <div className="payroll-review-body">
            {loading ? <EmptyRows title="正在读取正式考勤" /> : rows.length ? rows.map((employee) => <button aria-pressed={selected?.employeeId === employee.employeeId} className={`payroll-review-row${selected?.employeeId === employee.employeeId ? " selected" : ""}`} key={employee.employeeId} onClick={() => setSelectedEmployeeId(employee.employeeId)} role="row" type="button">
              <span><strong>{employee.name}</strong><small>{employee.roleName || "岗位待维护"} · {/丝印/.test(`${employee.roleName} ${employee.workshop}`) ? "每日2次卡" : "每日4次卡"}</small></span>
              <strong>{formatHours(employee.totalWorkMinutes)}</strong>
              <span className={employee.pendingExceptionCount ? "payroll-warning-text" : ""}>{employee.pendingExceptionCount ? `${employee.pendingExceptionCount}天` : "—"}</span>
              <strong className="payroll-money">{employee.estimate ? formatMoney(employee.estimate.netWage) : "待发布规则"}</strong>
              <StatusLabel warning={!employee.readyForDraft}>{employee.readyForDraft ? "可生成草稿" : "资料待补齐"}</StatusLabel>
            </button>) : <EmptyRows title="没有符合条件的员工" />}
          </div>
        </div>
      </> : <>
        <section className="payroll-source-strip success"><CheckCircleOutlined /><span>已读取《26年工资 (2).xlsx》的岗位与薪资构成</span><small>9 类时薪 · 1 类日薪 · 发布前待会计确认生效日期</small></section>
        <div className="payroll-review-filters">
          <label><SearchOutlined /><input aria-label="搜索岗位工资" onChange={(event) => setPositionQuery(event.target.value)} placeholder="搜索岗位 / 编号 / 工序" value={positionQuery} /></label>
          <select aria-label="计薪方式" onChange={(event) => setPositionMode(event.target.value)} value={positionMode}><option>全部方式</option><option>按小时</option><option>按天</option></select>
          <span>{positionRows.length} / {workbookPositionRates.length} 个岗位</span>
        </div>
        <div className="payroll-position-table" role="table" aria-label="岗位工资标准列表">
          <div className="payroll-position-row head" role="row"><span>工资表岗位</span><span>人数</span><span>计薪方式</span><span>基础工资</span><span>岗位补贴</span><span>合计</span></div>
          <div className="payroll-review-body">
            {positionRows.length ? positionRows.map((position) => <button aria-pressed={selectedPosition?.key === position.key} className={`payroll-position-row${selectedPosition?.key === position.key ? " selected" : ""}`} key={position.key} onClick={() => setSelectedPositionKey(position.key)} role="row" type="button">
              <span><strong>{position.name}</strong><small>{position.key} · {position.machineScope}</small></span>
              <strong>{position.people} 人</strong>
              <span>{position.mode === "hourly" ? "按小时" : "按天"}</span>
              <strong>{formatPositionRate(position.baseRate, position.mode)}</strong>
              <span>{position.allowanceRate === null ? "不适用" : `¥${position.allowanceRate}/时`}</span>
              <strong className="payroll-money">{formatPositionTotal(position)}</strong>
            </button>) : <EmptyRows title="没有符合条件的岗位" />}
          </div>
        </div>
      </>}
    </section>

    <aside className="payroll-review-detail">
      {view === "positions" ? <PositionRateDetail position={selectedPosition} /> : selected ? <>
        <header><span>{formatMonth(month)} · {selected.employeeId}</span><h2>{selected.name}</h2><StatusLabel warning={!selected.readyForDraft}>{selected.readyForDraft ? "可生成草稿" : "资料待补齐"}</StatusLabel></header>
        <div className="payroll-review-detail-scroll">
          <section className="payroll-estimate"><span>本月暂估工资</span><strong>{selected.estimate ? formatMoney(selected.estimate.netWage) : "—"}</strong><small>{selected.estimate ? `${formatHours(selected.estimate.totalWorkMinutes)} 已确认工时 · 非最终工资` : "发布计薪规则并补齐员工资料后计算"}</small></section>
          {selected.blockers?.length ? <section className="payroll-detail-warning"><WarningOutlined /><div><strong>生成草稿前还需处理</strong><p>{selected.blockers.join("；")}</p></div></section> : null}
          {latestPayrollLine ? <section className="payroll-detail-section"><header><h3>本期工资构成</h3><span>{runStatusLabels[latestRun?.status] || latestRun?.status}</span></header><dl className="payroll-line-breakdown"><div><dt>基础工资</dt><dd>{formatMoney(latestPayrollLine.baseWage)}</dd></div><div><dt>岗位补贴</dt><dd>{formatMoney(latestPayrollLine.positionAllowance)}</dd></div><div><dt>加班工资</dt><dd>{formatMoney(latestPayrollLine.overtimeWage)}</dd></div><div><dt>工龄奖</dt><dd>{formatMoney(latestPayrollLine.seniorityAward)}</dd></div><div><dt>绩效/奖励</dt><dd>{formatMoney(latestPayrollLine.performanceAward)}</dd></div><div><dt>请假/缺勤扣款</dt><dd>-{formatMoney(latestPayrollLine.leaveDeduction)}</dd></div><div><dt>其他扣款</dt><dd>-{formatMoney(latestPayrollLine.otherDeduction)}</dd></div><div><dt>实发工资</dt><dd>{formatMoney(latestPayrollLine.netWage)}</dd></div></dl></section> : null}
          {latestPayrollLine && latestRun?.status === "draft" && canReviewPayroll ? <form className="payroll-adjustment-form" onSubmit={handleAdjustment}><header><h3>调整工资草稿</h3><span>复核后不可修改</span></header><div className="payroll-adjustment-amounts"><label><span>绩效/奖励</span><input aria-label="绩效或奖励" min="0" onChange={(event) => setAdjustmentForm((current) => ({ ...current, performanceAward: event.target.value }))} required step="0.01" type="number" value={adjustmentForm.performanceAward} /></label><label><span>请假/缺勤扣款</span><input aria-label="请假或缺勤扣款" min="0" onChange={(event) => setAdjustmentForm((current) => ({ ...current, leaveDeduction: event.target.value }))} required step="0.01" type="number" value={adjustmentForm.leaveDeduction} /></label><label><span>其他扣款</span><input aria-label="其他扣款" min="0" onChange={(event) => setAdjustmentForm((current) => ({ ...current, otherDeduction: event.target.value }))} required step="0.01" type="number" value={adjustmentForm.otherDeduction} /></label></div><textarea aria-label="工资调整依据" maxLength={500} onChange={(event) => setAdjustmentForm((current) => ({ ...current, reason: event.target.value }))} placeholder="填写绩效、请假、缺勤或扣款依据" required value={adjustmentForm.reason} /><section className="payroll-adjustment-evidence" aria-label="工资调整凭证"><header><div><strong>调整凭证</strong><span>金额变化时必填</span></div><label className={adjustmentEvidence.length >= 5 || evidenceBusy ? "disabled" : ""}>＋ {evidenceBusy ? "上传中" : "选择图片 / PDF"}<input accept="image/*,.pdf,application/pdf" disabled={adjustmentEvidence.length >= 5 || evidenceBusy} onChange={handleAdjustmentEvidenceUpload} type="file" /></label></header>{adjustmentEvidence.length ? <div className="payroll-adjustment-evidence-list">{adjustmentEvidence.map((item) => <span key={item.attachmentId}><b>{item.fileName || "调整凭证"}</b><small>已上传</small></span>)}</div> : <p>至少 1 份，最多 5 份；凭证与本次调整一起留痕。</p>}</section><button className="primary" disabled={actionLoading === "payroll-adjustment" || evidenceBusy} type="submit">保存调整并留痕</button></form> : null}
          <section className="payroll-detail-section"><header><h3>考勤明细</h3><span>{detailLoading ? "读取中" : `${employeeAttendance?.days?.length || 0} 天`}</span></header>
            {employeeAttendance?.days?.length ? <div className="payroll-attendance-days">{employeeAttendance.days.slice(0, 8).map((day) => <button className={day.status === "pending_review" ? "pending" : ""} key={day.workDate} onClick={() => setReviewForm((current) => ({ ...current, workDate: day.workDate }))} type="button"><span>{day.workDate.slice(5)}</span><span>{day.punchTimes.join(" · ") || "无打卡"}</span><strong>{formatHours(day.workMinutes)}</strong><small>{day.statusLabel}</small></button>)}</div> : <p className="payroll-detail-empty">本月尚无已关联的正式打卡记录。</p>}
          </section>
          {canReviewAttendance && employeeAttendance?.days?.some((day) => day.status === "pending_review") ? <form className="payroll-review-form" onSubmit={handleAttendanceReview}>
            <header><h3>复核考勤</h3><span>原始打卡保留不改</span></header>
            <select aria-label="待复核日期" onChange={(event) => setReviewForm((current) => ({ ...current, workDate: event.target.value }))} required value={reviewForm.workDate}><option value="">选择日期</option>{employeeAttendance.days.filter((day) => day.status === "pending_review").map((day) => <option key={day.workDate} value={day.workDate}>{day.workDate} · {day.actualPunchCount}/{day.expectedPunchCount}次</option>)}</select>
            <select aria-label="复核结果" onChange={(event) => setReviewForm((current) => ({ ...current, status: event.target.value }))} value={reviewForm.status}><option value="approved">确认原工时</option><option value="adjusted">调整工时</option><option value="rejected">暂不计薪</option></select>
            {reviewForm.status === "adjusted" ? <input aria-label="调整后工时" min="0" onChange={(event) => setReviewForm((current) => ({ ...current, adjustedHours: event.target.value }))} placeholder="调整后工时（小时）" required step="0.01" type="number" value={reviewForm.adjustedHours} /> : null}
            <textarea aria-label="考勤复核说明" onChange={(event) => setReviewForm((current) => ({ ...current, explanation: event.target.value }))} placeholder="填写漏卡、临时离厂或调整依据" required value={reviewForm.explanation} />
            <button className="primary" disabled={actionLoading === "attendance-review"} type="submit">保存复核</button>
          </form> : null}
          <section className="payroll-detail-section"><header><h3>工资批次</h3><span>{latestRun ? `第 ${latestRun.revision} 版` : "尚未生成"}</span></header>{latestRun ? <dl><div><dt>批次状态</dt><dd>{runStatusLabels[latestRun.status] || latestRun.status}</dd></div><div><dt>计薪版本</dt><dd>{workbench?.policyVersion?.versionLabel || latestRun.policyVersionId}</dd></div><div><dt>生成时间</dt><dd>{formatDateTime(latestRun.generatedAt)}</dd></div><div><dt>付款凭证</dt><dd>{latestRun.paymentReference || "—"}</dd></div></dl> : <p className="payroll-detail-empty">员工资料、考勤复核和计薪规则全部就绪后才能生成。</p>}</section>
          <section className="payroll-detail-section"><header><h3>历史工资</h3><span>{payrollHistory?.total || 0} 条</span></header>{payrollHistory?.items?.length ? <div className="payroll-history-list">{payrollHistory.items.map(({ payrollRun, payrollLine }) => <div key={payrollLine.id}><span>{formatMonth(payrollRun.payrollMonth)} · 第{payrollRun.revision}版</span><strong>{formatMoney(payrollLine.netWage)}</strong><small>{runStatusLabels[payrollRun.status] || payrollRun.status}</small></div>)}</div> : <p className="payroll-detail-empty">尚无历史工资记录。</p>}</section>
        </div>
        {latestRun ? <footer>
          {latestRun.status === "draft" && canReviewPayroll ? <button className="primary" disabled={Boolean(actionLoading)} onClick={() => handleRunTransition("review")} type="button">会计复核通过</button> : null}
          {latestRun.status === "reviewed" && canLockPayroll ? <button className="primary" disabled={Boolean(actionLoading)} onClick={() => handleRunTransition("lock")} type="button">锁定工资批次</button> : null}
          {latestRun.status === "locked" && canConfirmPayment ? <><input aria-label="付款凭证编号" onChange={(event) => setPaymentReference(event.target.value)} placeholder="输入付款凭证编号" value={paymentReference} /><button className="primary" disabled={!paymentReference.trim() || Boolean(actionLoading)} onClick={() => handleRunTransition("payment")} type="button">确认发薪</button></> : null}
        </footer> : null}
      </> : <div className="payroll-review-empty"><strong>请选择员工</strong><span>查看考勤和工资准备情况。</span></div>}
    </aside>

    {policyOpen ? <div className="payroll-policy-overlay" role="presentation"><form aria-modal="true" className="payroll-policy-dialog" onSubmit={handlePolicyPublish} role="dialog"><header><div><h2>发布计薪规则</h2><p>岗位薪资来源已读取；这里维护标准日工时、加班倍率和工龄奖，发布后生成不可变版本。</p></div><button aria-label="关闭" onClick={() => setPolicyOpen(false)} type="button">×</button></header><label><span>规则版本名称</span><input onChange={(event) => setPolicyForm((current) => ({ ...current, versionLabel: event.target.value }))} required value={policyForm.versionLabel} /></label><label><span>生效日期</span><input onChange={(event) => setPolicyForm((current) => ({ ...current, effectiveFrom: event.target.value }))} required type="date" value={policyForm.effectiveFrom} /></label><label><span>标准日工时（小时）</span><input min="0.01" onChange={(event) => setPolicyForm((current) => ({ ...current, regularHours: event.target.value }))} required step="0.01" type="number" value={policyForm.regularHours} /></label><label><span>加班倍率</span><input min="1" max="5" onChange={(event) => setPolicyForm((current) => ({ ...current, overtimeMultiplier: event.target.value }))} required step="0.01" type="number" value={policyForm.overtimeMultiplier} /></label><label><span>工龄奖（每行：年数:月奖金额）</span><textarea onChange={(event) => setPolicyForm((current) => ({ ...current, seniorityAwards: event.target.value }))} placeholder={"1:30\n2:45"} value={policyForm.seniorityAwards} /></label><footer><button onClick={() => setPolicyOpen(false)} type="button">取消</button><button className="primary" disabled={actionLoading === "policy"} type="submit">确认发布</button></footer></form></div> : null}
  </div>;
}

function PositionRateDetail({ position }) {
  if (!position) return <div className="payroll-review-empty"><strong>请选择岗位</strong><span>查看原工资表中的薪资构成。</span></div>;
  const isHourly = position.mode === "hourly";
  return <>
    <header><span>原工资表岗位 · {position.key}</span><h2>{position.name}</h2><StatusLabel warning>待发布</StatusLabel></header>
    <div className="payroll-review-detail-scroll">
      <section className="payroll-position-current"><span>当前岗位标准</span><strong>{formatPositionTotal(position)}</strong><small>{isHourly ? `基础 ¥${position.baseRate}/时 ＋ 岗位补贴 ¥${position.allowanceRate}/时` : "按实际出勤天数计薪"}</small></section>
      <section className="payroll-detail-section"><header><h3>岗位定义</h3><span>{position.people} 名表内员工</span></header><dl><div><dt>岗位编号</dt><dd>{position.key}</dd></div><div><dt>计薪方式</dt><dd>{isHourly ? "按小时" : "按天"}</dd></div><div><dt>工作范围</dt><dd>{position.machineScope}</dd></div><div><dt>来源状态</dt><dd>原表待发布</dd></div></dl></section>
      <section className="payroll-detail-section"><header><h3>薪资构成</h3><span>《26年工资 (2).xlsx》</span></header><dl><div><dt>{isHourly ? "基础时薪" : "日薪"}</dt><dd>{formatPositionRate(position.baseRate, position.mode)}</dd></div><div><dt>岗位补贴</dt><dd>{position.allowanceRate === null ? "不适用" : `¥${position.allowanceRate}/小时`}</dd></div><div><dt>综合绩效</dt><dd>按月录入</dd></div><div><dt>工龄奖</dt><dd>按在厂工龄</dd></div></dl><p className="payroll-position-formula">{isHourly ? "工资＝工时 ×（基础时薪＋岗位补贴）＋综合绩效＋工龄奖" : "工资＝日薪 × 出勤天数＋综合绩效＋工龄奖"}</p></section>
      <section className="payroll-detail-section"><header><h3>工龄奖</h3><span>每多 1 年增加 ¥15</span></header><div className="payroll-seniority-grid">{seniorityAwardsFromWorkbook.map((item) => <span key={item.years}><small>满{item.years}年</small><strong>¥{item.amount}</strong></span>)}</div></section>
      {position.note ? <section className="payroll-position-note"><WarningOutlined /><div><strong>原表存在历史变化</strong><p>{position.note}；正式发布时需要保留对应生效日期，不能覆盖历史月份。</p></div></section> : null}
    </div>
  </>;
}

function formatPositionRate(value, mode) { return `¥${Number(value).toLocaleString("zh-CN")}/${mode === "hourly" ? "时" : "天"}`; }
function formatPositionTotal(position) { return position.mode === "hourly" ? `¥${position.baseRate + position.allowanceRate}/小时` : `¥${position.baseRate}/天`; }

function payrollDraftActionTitle(workbench) {
  if (workbench?.summary?.draftReady === true) return "生成本月工资草稿";
  if (workbench?.summary?.payrollPeriodClosed === false) return "所选月份尚未结束；次月才能核对并生成上月工资草稿";
  if (workbench?.summary?.attendanceCoverageComplete !== true) return "需先完成所选自然月的整月真实考勤导入";
  return "需先完成员工打卡关联、资料和考勤异常复核";
}

function StatusLabel({ children, warning }) { return <span className={`payroll-state ${warning ? "warning" : "success"}`}>{children}</span>; }
function EmptyRows({ title }) { return <div className="payroll-table-empty"><ClockCircleOutlined /><span>{title}</span></div>; }
function formatMoney(value) { return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function formatHours(minutes) { return `${(Number(minutes || 0) / 60).toFixed(2)}小时`; }
function formatDateTime(value) { return value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—"; }
function currentMonth() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(new Date()); }
function formatMonth(month) { const [year, value] = month.split("-"); return `${year}年${Number(value)}月`; }
function monthAfter(month) { const [year, value] = month.split("-").map(Number); const date = new Date(Date.UTC(year, value, 1)); return date.toISOString().slice(0, 7); }
function parseSeniorityAwards(value) {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [minYears, monthlyAmount] = line.split(":").map((item) => Number(item.trim()));
    if (!Number.isInteger(minYears) || minYears < 0 || !Number.isFinite(monthlyAmount) || monthlyAmount < 0) throw new Error("工龄奖格式应为：年数:月奖金额。");
    return { minYears, monthlyAmount };
  });
}

function payrollTransitionConfirmation({ action, payrollRun, paymentReference }) {
  const period = `${formatMonth(payrollRun?.payrollMonth || "")} · 第${Number(payrollRun?.revision || 0)}版`;
  if (action === "review") {
    return `确认将 ${period} 标记为“会计已复核”？复核后工资明细不可继续修改，如需变更必须生成新版本。`;
  }
  if (action === "lock") {
    return `确认锁定 ${period}？锁定后只能进入发薪确认，不能返回草稿或会计复核状态。`;
  }
  return `确认 ${period} 已完成发薪？付款凭证：${String(paymentReference || "").trim()}。该操作会写入发薪人和发薪时间。`;
}

function downloadPayrollCsv(payload = {}) {
  const columns = Array.isArray(payload.columns) ? payload.columns : [];
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const lines = [
    columns.map((column) => escapeCsv(column.label)).join(","),
    ...rows.map((row) => columns.map((column) => escapeCsv(row[column.key])).join(",")),
  ];
  const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = String(payload.fileName || "工资表.csv");
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
