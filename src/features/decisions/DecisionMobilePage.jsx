import {
  AppstoreOutlined,
  CheckCircleOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  InboxOutlined,
  SafetyCertificateOutlined,
  UnorderedListOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { BusinessDecisionHistoryPanel } from "../../components/BusinessDecisionHistoryPanel.jsx";
import { MobileRoleBottomNavigation } from "../../shared/ui/MobileRoleBottomNavigation.jsx";
import {
  listOfficeBusinessDecisions,
  recordOfficeBusinessDecision,
} from "../../services/officeBusinessDecisionApiClient.js";

const MOBILE_VIEWS = [
  ["current", "当前决策", InboxOutlined],
  ["pending", "待处理", UnorderedListOutlined],
  ["all", "全部功能", AppstoreOutlined],
];

export function DecisionMobilePage({
  authState,
  currentUser = {},
  todos = [],
  orderLines = [],
  fulfillments = [],
  statements = [],
  rawMaterialInbounds = [],
  helpers = {},
}) {
  const [view, setView] = useState("current");
  const [selectedId, setSelectedId] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [decisionRecords, setDecisionRecords] = useState([]);
  const [decisionReadError, setDecisionReadError] = useState("");
  const [submissionNotice, setSubmissionNotice] = useState(null);
  const isBackup = currentUser.decisionAuthority === "backup";
  const isFormalSession = authState?.source === "api_runtime" && authState?.authenticated === true;
  const candidateTasks = useMemo(() => buildDecisionTasks({
    todos,
    orderLines,
    fulfillments,
    statements,
    rawMaterialInbounds,
    findCustomer: helpers.findCustomer,
  }).filter((task) => !isBackup || task.backupAllowed), [fulfillments, helpers.findCustomer, isBackup, orderLines, rawMaterialInbounds, statements, todos]);
  const tasks = useMemo(() => candidateTasks.filter((task) => !decisionRecords.some((record) =>
    record.status === "active"
    && record.businessType === task.businessType
    && record.businessId === task.businessId
    && record.decisionScope === task.scope)), [candidateTasks, decisionRecords]);
  const selected = tasks.find((task) => task.id === selectedId) ?? tasks[0] ?? null;

  useEffect(() => {
    if (!isFormalSession) {
      setDecisionRecords([]);
      setDecisionReadError("");
      return undefined;
    }
    let active = true;
    listOfficeBusinessDecisions({ authState, operatorId: currentUser.userId }).then((result) => {
      if (!active) return;
      if (result.blocked) {
        setDecisionReadError(result.error?.message || "决定记录暂时无法读取，请刷新后再操作。");
        return;
      }
      setDecisionReadError("");
      setDecisionRecords(result.items ?? []);
    });
    return () => { active = false; };
  }, [authState, currentUser.userId, isFormalSession]);

  function openTask(taskId) {
    setSelectedId(taskId);
    setConfirmation(null);
    setView("current");
  }

  function prepareConfirmation(outcome, actionLabel) {
    setSubmissionNotice(null);
    setConfirmation({
      outcome,
      actionLabel,
      note: "",
      idempotencyKey: createDecisionIdempotencyKey(),
      submitting: false,
      error: "",
    });
  }

  async function submitDecision() {
    if (!selected || !confirmation || !isFormalSession || confirmation.submitting) return;
    const note = confirmation.note.trim();
    if (note.length < 2) {
      setConfirmation((current) => ({ ...current, error: "请填写至少 2 个字的决定说明。" }));
      return;
    }
    setConfirmation((current) => ({ ...current, submitting: true, error: "" }));
    const result = await recordOfficeBusinessDecision({
      authState,
      operatorId: currentUser.userId,
      idempotencyKey: confirmation.idempotencyKey,
      businessType: selected.businessType,
      businessId: selected.businessId,
      decisionScope: selected.scope,
      outcome: confirmation.outcome,
      actionLabel: confirmation.actionLabel,
      note,
      taskTitle: selected.title,
      factsSnapshot: selected.facts,
      authorizationAmount: selected.authorizationAmount ?? null,
    });
    if (result.blocked) {
      const conflict = result.error?.code === "BUSINESS_DECISION_ALREADY_TERMINAL";
      setConfirmation((current) => ({
        ...current,
        submitting: false,
        error: conflict ? "另一位授权人已经先提交决定。请返回并刷新决定记录。" : (result.error?.message || "提交失败，请稍后重试。"),
      }));
      if (conflict) {
        const refreshed = await listOfficeBusinessDecisions({ authState, operatorId: currentUser.userId });
        if (!refreshed.blocked) setDecisionRecords(refreshed.items ?? []);
      }
      return;
    }
    if (result.businessDecision) {
      setDecisionRecords((current) => [result.businessDecision, ...current.filter((item) => item.businessDecisionId !== result.businessDecision.businessDecisionId)]);
    }
    setSubmissionNotice({
      tone: "success",
      text: `已记录“${confirmation.actionLabel}”，并生成办公室执行待办。决定本身不会直接改写订单、库存或账款。`,
    });
    setSelectedId("");
    setConfirmation(null);
  }

  function openScope(scope) {
    const task = tasks.find((item) => item.scope === scope);
    if (task) openTask(task.id);
  }

  return (
    <section className={`decision-mobile-page guided-mobile-page view-${view}`} aria-label="经营决策手机工作台">
      <header className="guided-mobile-hero decision-mobile-hero">
        <div>
          <span>{isBackup ? "辅助决策人" : "主要决策人"}</span>
          <h1>待我决定</h1>
        </div>
        <strong>{tasks.length}<small>待处理</small></strong>
      </header>

      {submissionNotice ? <p className={`decision-mobile-notice ${submissionNotice.tone}`} role="status">{submissionNotice.text}</p> : null}
      {decisionReadError ? <p className="decision-mobile-notice danger" role="alert">{decisionReadError} 为避免覆盖已有决定，当前暂停提交。</p> : null}

      {view === "current" ? (
        selected ? <section className="decision-mobile-card">
          <header>
            <div><span>{selected.scopeLabel}</span><h2>{selected.title}</h2></div>
            <em className={selected.tone}>{selected.urgency}</em>
          </header>
          <p className="decision-mobile-summary">{selected.summary}</p>
          <dl>
            {selected.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          <section className="decision-mobile-evidence">
            <strong><FileSearchOutlined /> 决策依据</strong>
            <p>{selected.evidence}</p>
          </section>
          <section className="decision-mobile-impact">
            <strong><WarningOutlined /> 决定后的影响</strong>
            <p>{selected.impact}</p>
          </section>
          <details className="decision-mobile-history">
            <summary><HistoryOutlined aria-hidden="true" /><span>决定历史</span></summary>
            {isFormalSession ? (
              <BusinessDecisionHistoryPanel
                authState={authState}
                businessId={selected.businessId}
                businessType={selected.businessType}
                operatorId={currentUser.userId}
                title="该事项的决定与授权记录"
              />
            ) : <p>演示模式不显示决定历史。</p>}
          </details>
          {!confirmation ? <div className="decision-mobile-actions">
            <button onClick={() => prepareConfirmation("return_for_more_information", "退回补充")} type="button">退回补充</button>
            <button className="primary-action" onClick={() => prepareConfirmation("approve", selected.primaryOutcome)} type="button">{selected.primaryOutcome}</button>
          </div> : (
            <section className="decision-mobile-confirmation" aria-live="polite">
              <strong>最终确认：{confirmation.actionLabel}</strong>
              <p>提交后形成不可覆盖的有效决定，并进入办公室共享待办；不会直接修改订单数量、库存或账款。另一位授权人若已先提交，本次会被服务器拦截。</p>
              <label>
                <span>决定说明（必填）</span>
                <textarea
                  disabled={confirmation.submitting || !isFormalSession}
                  maxLength={500}
                  onChange={(event) => setConfirmation((current) => ({ ...current, note: event.target.value, error: "" }))}
                  placeholder="说明同意、退回或处理依据，便于办公室执行和后续追溯"
                  value={confirmation.note}
                />
              </label>
              {confirmation.error ? <p className="decision-mobile-confirmation-error" role="alert">{confirmation.error}</p> : null}
              <div>
                <button disabled={confirmation.submitting} onClick={() => setConfirmation(null)} type="button">返回查看证据</button>
                <button
                  className="primary-action"
                  disabled={!isFormalSession || Boolean(decisionReadError) || confirmation.note.trim().length < 2 || confirmation.submitting}
                  onClick={submitDecision}
                  type="button"
                >{confirmation.submitting ? "正在提交…" : isFormalSession ? "确认并生成待办" : "正式账号登录后提交"}</button>
              </div>
            </section>
          )}
        </section> : <section className="decision-mobile-empty"><CheckCircleOutlined /><strong>当前没有待决策事项</strong><span>新的排产、差额或重大异常会出现在这里。</span></section>
      ) : null}

      {view === "pending" ? (
        <section className="guided-mobile-queue decision-mobile-queue" aria-label="经营决策待处理">
          <header><div><h2>待处理事项</h2></div><strong>{tasks.length}</strong></header>
          {tasks.map((task) => <button key={task.id} onClick={() => openTask(task.id)} type="button">
            <span>{task.scopeLabel} · {task.urgency}</span>
            <strong>{task.title}</strong>
            <small>{task.summary}</small>
          </button>)}
        </section>
      ) : null}

      {view === "all" ? (
        <section className="guided-mobile-functions decision-mobile-functions" aria-label="经营决策全部功能">
          <header><h2>我的权限</h2></header>
          <div>
            <ScopeButton count={countScope(tasks, "order_priority")} icon={SafetyCertificateOutlined} label="订单优先级" onClick={() => openScope("order_priority")} />
            <ScopeButton count={countScope(tasks, "production_schedule")} icon={UnorderedListOutlined} label="生产排期" onClick={() => openScope("production_schedule")} />
            <ScopeButton count={countScope(tasks, "raw_material_purchase")} icon={InboxOutlined} label="原料采购" onClick={() => openScope("raw_material_purchase")} />
            <ScopeButton count={countScope(tasks, "fulfillment_quantity_variance")} icon={WarningOutlined} label="出货差异" onClick={() => openScope("fulfillment_quantity_variance")} />
            <ScopeButton count={countScope(tasks, "statement_variance")} icon={FileSearchOutlined} label="对账差额" onClick={() => openScope("statement_variance")} />
            <ScopeButton count={countScope(tasks, "statement_write_off")} icon={CheckCircleOutlined} label="抹零核销" onClick={() => openScope("statement_write_off")} />
            {!isBackup ? <ScopeButton count={countScope(tasks, "major_exception")} icon={WarningOutlined} label="重大异常" onClick={() => openScope("major_exception")} /> : null}
          </div>
        </section>
      ) : null}

      <MobileRoleBottomNavigation
        ariaLabel="经营决策手机导航"
        badgeCount={(key) => key === "pending" ? tasks.length : 0}
        items={MOBILE_VIEWS}
        onChange={setView}
        value={view}
      />
    </section>
  );
}

function ScopeButton({ count, icon: Icon, label, onClick }) {
  return <button disabled={!count} onClick={onClick} type="button"><Icon /><strong>{label}</strong><span>{count} 项</span></button>;
}

function countScope(tasks, scope) {
  return tasks.filter((task) => task.scope === scope).length;
}

function buildDecisionTasks({ todos, orderLines, fulfillments, statements, rawMaterialInbounds, findCustomer }) {
  const tasks = [];
  const priorityLine = orderLines.find((line) => line.latest?.includes("今天") && line.status !== "已交付") ?? orderLines[0];
  if (priorityLine) tasks.push(decisionTask({
    id: `decision-priority-${priorityLine.id}`,
    scope: "order_priority",
    scopeLabel: "订单优先级",
    title: `${findCustomer?.(priorityLine.customerId)?.name || priorityLine.customerName || "客户"} · ${priorityLine.product || "订单"}`,
    summary: `${priorityLine.size || "规格待补"} · ${priorityLine.qty || 0} 个 · ${priorityLine.latest || "交期待补"}`,
    evidence: `订单状态 ${priorityLine.status || "待处理"}，库存 ${priorityLine.inventory || "待核对"}，交付方式 ${priorityLine.fulfillment || "待确认"}。`,
    impact: "决定将影响共享任务池排序，但不会自动修改客户订单数量。",
    facts: [["订单", priorityLine.id], ["交期", priorityLine.latest || "待补"], ["库存", priorityLine.inventory || "待核对"], ["当前状态", priorityLine.status || "待处理"]],
    urgency: "今天",
    tone: "warning",
    primaryOutcome: "设为优先",
    businessType: "order",
    businessId: priorityLine.originalOrderId || priorityLine.orderId || priorityLine.id,
  }));

  const scheduleLine = orderLines.find((line) => ["待排产", "丝印中", "制袋中"].includes(line.status));
  if (scheduleLine) tasks.push(decisionTask({
    id: `decision-schedule-${scheduleLine.id}`,
    scope: "production_schedule",
    scopeLabel: "生产排期",
    title: `${scheduleLine.product || "生产任务"}排期`,
    summary: `${scheduleLine.size || "规格待补"} · ${scheduleLine.qty || 0} 个 · ${scheduleLine.status}`,
    evidence: `交期 ${scheduleLine.latest || "待补"}，印刷 ${scheduleLine.print === "是" ? "需要" : "不需要"}，库存 ${scheduleLine.inventory || "待核对"}。`,
    impact: "决定会进入正式排产版本，其他已打开客户端必须刷新后才能继续编辑。",
    facts: [["任务", scheduleLine.id], ["数量", `${scheduleLine.qty || 0} 个`], ["交期", scheduleLine.latest || "待补"], ["工序", scheduleLine.status || "待排产"]],
    urgency: "待排",
    tone: "warning",
    primaryOutcome: "同意排期",
    businessType: "production_schedule_queue",
    businessId: scheduleLine.productionTaskId || scheduleLine.id,
  }));

  const inbound = rawMaterialInbounds.find((item) => item.status !== "已完成") ?? rawMaterialInbounds[0];
  if (inbound) tasks.push(decisionTask({
    id: `decision-purchase-${inbound.id}`,
    scope: "raw_material_purchase",
    scopeLabel: "原材料采购",
    title: `${inbound.productName || inbound.materialType || "原材料"}采购建议`,
    summary: `${inbound.factoryColor || inbound.supplierColor || "颜色待补"} · ${inbound.spec || "规格待补"}`,
    evidence: `当前到货 ${inbound.rollCount || 0} 卷，${inbound.totalWeightKg ? `${inbound.totalWeightKg}kg` : "重量待补"}；建议仍需服务端库存和消耗数据校验。`,
    impact: "同意后只生成供应商分组建议，不自动形成采购订单或库存写入。",
    facts: [["供应商", inbound.supplierName || "待确认"], ["当前到货", `${inbound.rollCount || 0} 卷`], ["规格", inbound.spec || "待补"], ["数据状态", inbound.status || "待复核"]],
    urgency: "下班前",
    tone: "neutral",
    primaryOutcome: "采纳建议",
    businessType: "raw_material_inbound",
    businessId: inbound.id,
  }));

  const varianceFulfillment = fulfillments.find((item) => Number(item.actualQty ?? item.qty) !== Number(item.expectedQty ?? item.qty) || item.status?.includes("数量"));
  if (varianceFulfillment) tasks.push(decisionTask({
    id: `decision-fulfillment-${varianceFulfillment.id}`,
    scope: "fulfillment_quantity_variance",
    scopeLabel: "出货数量差异",
    title: `${varianceFulfillment.goods || "出库任务"}数量差异`,
    summary: `应出 ${varianceFulfillment.expectedQty ?? varianceFulfillment.qty ?? 0}，实际 ${varianceFulfillment.actualQty ?? varianceFulfillment.qty ?? 0}`,
    evidence: `任务 ${varianceFulfillment.id}，${varianceFulfillment.packages || "包裹待确认"}，当前状态 ${varianceFulfillment.status || "待处理"}。`,
    impact: "决定影响重新出库或差异处理，不会静默改写原订单。",
    facts: [["任务", varianceFulfillment.id], ["应出", `${varianceFulfillment.expectedQty ?? varianceFulfillment.qty ?? 0}`], ["实际", `${varianceFulfillment.actualQty ?? varianceFulfillment.qty ?? 0}`], ["交付方式", varianceFulfillment.method || "待确认"]],
    urgency: "异常",
    tone: "danger",
    primaryOutcome: "确认处理方式",
    businessType: "fulfillment",
    businessId: varianceFulfillment.id,
  }));

  const varianceStatement = statements.find((item) => Number(item.variance) > 0 || item.status?.includes("差额"));
  if (varianceStatement) {
    tasks.push(decisionTask({
      id: `decision-statement-variance-${varianceStatement.id}`,
      scope: "statement_variance",
      scopeLabel: "对账差额",
      title: `${findCustomer?.(varianceStatement.customerId)?.name || "客户"}差额处理`,
      summary: `应收 ¥${varianceStatement.receivable || 0}，已收 ¥${varianceStatement.received || 0}`,
      evidence: `差额 ¥${varianceStatement.variance || 0}，账期 ${varianceStatement.period || "待确认"}。`,
      impact: "记录实际收款，剩余金额继续保持未结清，除非另行批准抹零。",
      facts: [["对账单", varianceStatement.id], ["应收", `¥${varianceStatement.receivable || 0}`], ["实收", `¥${varianceStatement.received || 0}`], ["差额", `¥${varianceStatement.variance || 0}`]],
      urgency: "待确认",
      tone: "danger",
      primaryOutcome: "确认差额处理",
      authorizationAmount: Number(varianceStatement.variance || 0),
      businessType: "statement",
      businessId: varianceStatement.id,
    }));
    tasks.push(decisionTask({
      id: `decision-writeoff-${varianceStatement.id}`,
      scope: "statement_write_off",
      scopeLabel: "抹零 / 核销",
      title: `${findCustomer?.(varianceStatement.customerId)?.name || "客户"}抹零申请`,
      summary: `当前差额 ¥${varianceStatement.variance || 0}，需要单独决定`,
      evidence: "正式核销必须保留收款渠道、交易凭证、决定人和授权依据。",
      impact: "批准抹零会形成独立财务决定记录，与足额收款核销保持区分。",
      facts: [["对账单", varianceStatement.id], ["差额", `¥${varianceStatement.variance || 0}`], ["收款状态", varianceStatement.status || "待确认"], ["凭证", "待办公室核对"]],
      urgency: "财务",
      tone: "warning",
      primaryOutcome: "批准抹零",
      authorizationAmount: Number(varianceStatement.variance || 0),
      businessType: "statement",
      businessId: varianceStatement.id,
    }));
  }

  const major = todos.find((item) => item.type?.includes("老板") || item.urgency === "异常");
  if (major) tasks.push(decisionTask({
    id: `decision-major-${major.id}`,
    scope: "major_exception",
    scopeLabel: "重大异常",
    title: major.type || "重大异常待处理",
    summary: major.summary || "异常摘要待补",
    evidence: `${major.impact || "影响待确认"}；业务引用 ${major.ref || major.refId || "待补"}。`,
    impact: "仅老板或主要经营决策人可以作出终局决定，辅助决策人不可提交。",
    facts: [["待办", major.id], ["业务引用", major.ref || major.refId || "待补"], ["最晚", major.latest || "待补"], ["等待", major.wait || "待补"]],
    urgency: "重大",
    tone: "danger",
    primaryOutcome: "进入重大异常处理",
    backupAllowed: false,
    businessType: "todo",
    businessId: major.id,
  }));
  return tasks;
}

function decisionTask(input) {
  return { backupAllowed: true, facts: [], tone: "neutral", urgency: "待处理", ...input };
}

function createDecisionIdempotencyKey() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `decision-${uuid}`;
  return `decision-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}
