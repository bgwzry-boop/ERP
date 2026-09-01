import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  BarcodeOutlined,
  CheckCircleOutlined,
  InboxOutlined,
  SearchOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  findRawMaterialRollByScan,
  getRawMaterialScanOutboundBlocker,
  RAW_MATERIAL_MACHINE_OPTIONS,
} from "../../domain/rawMaterialScanOutbound.js";
import { evaluateRawMaterialOrderSupport } from "../../../shared/rawMaterialInventorySupport.js";
import { MobileRoleBottomNavigation } from "../../shared/ui/MobileRoleBottomNavigation.jsx";

const MOBILE_VIEWS = [
  ["current", "今日任务", InboxOutlined],
  ["pending", "可领卷", UnorderedListOutlined],
  ["all", "全部功能", AppstoreOutlined],
];

export function RawMaterialScannerPage({
  inbounds = [],
  productionState = {},
  onAction,
  helpers = {},
}) {
  const {
    currentUser = {},
    findCustomer = () => ({ name: "" }),
    getUiActionState = () => ({ disabled: false, title: "" }),
  } = helpers;
  const productionTasks = productionState.productionTasks ?? [];
  const taskListLoading = productionState.taskListLoading === true;
  const taskListError = productionState.taskListError ?? "";
  const issueState = getUiActionState("rawMaterial", "扫码出库");
  const scanInputRef = useRef(null);
  const [scanCode, setScanCode] = useState("");
  const [matchedCode, setMatchedCode] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [temporaryIssue, setTemporaryIssue] = useState(false);
  const [machineId, setMachineId] = useState("");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mobileView, setMobileView] = useState("current");
  const match = useMemo(() => findRawMaterialRollByScan(inbounds, matchedCode), [inbounds, matchedCode]);
  const baseBlocker = matchedCode ? getRawMaterialScanOutboundBlocker(match) : "";
  const taskRows = useMemo(
    () => buildRawMaterialIssueTaskRows({ currentUser, findCustomer, inbounds, productionTasks }),
    [currentUser, findCustomer, inbounds, productionTasks],
  );
  const selectedTask = taskRows.find((task) => task.productionTaskId === selectedTaskId) ?? null;
  const activeMachineId = temporaryIssue ? machineId : selectedTask?.machineId ?? "";
  const taskBlocker = selectedTask && match ? getRawMaterialTaskRollBlocker(selectedTask, match) : "";
  const blocker = baseBlocker || taskBlocker;
  const availableRolls = useMemo(() => inbounds.flatMap((inbound) => (
    (inbound.rolls ?? []).map((roll) => ({ inbound, roll, scanCode: roll.id }))
  )).filter((item) => !getRawMaterialScanOutboundBlocker(item)), [inbounds]);
  const workflowStarted = temporaryIssue || Boolean(selectedTask);

  useEffect(() => {
    if (workflowStarted && mobileView === "current") scanInputRef.current?.focus();
  }, [mobileView, workflowStarted]);

  function handleScanSubmit(event) {
    event.preventDefault();
    const found = findRawMaterialRollByScan(inbounds, scanCode);
    setFeedback(null);
    if (!found) {
      setMatchedCode(scanCode);
      return;
    }
    setMatchedCode(found.scanCode);
    setScanCode("");
  }

  async function handleConfirmOutbound() {
    if (!match || blocker || !activeMachineId || submitting || issueState.disabled) return;
    const productionTaskId = selectedTask?.productionTaskId ?? "";
    setSubmitting(true);
    try {
      const result = await onAction?.("扫码出库", match.inbound.id, {
        rollId: match.roll.id,
        machineId: activeMachineId,
        productionTaskId,
        issuePurpose: productionTaskId ? "按生产任务领料" : "临时生产领料",
        issuedWeightKg: match.roll.weightKg || undefined,
        issuedQuantity: match.roll.weightKg ? undefined : 1,
        note: note || (productionTaskId
          ? `员工扫描卷码 ${match.roll.id}，按任务 ${productionTaskId} 领到 ${activeMachineId}。`
          : `员工扫描卷码 ${match.roll.id}，临时领到 ${activeMachineId}。`),
      });
      if (!result) return;
      setFeedback({
        tone: "success",
        message: productionTaskId
          ? `${match.roll.id} 已领到${selectedTask.machineLabel}，并关联任务 ${productionTaskId}。可以继续扫描下一卷。`
          : `${match.roll.id} 已临时领到 ${activeMachineId}。`,
      });
      setMatchedCode("");
      setScanCode("");
      setNote("");
      if (temporaryIssue) setMachineId("");
      requestAnimationFrame(() => scanInputRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  function startTask(taskId) {
    setSelectedTaskId(taskId);
    setTemporaryIssue(false);
    setMachineId("");
    setScanCode("");
    setMatchedCode("");
    setNote("");
    setFeedback(null);
    setMobileView("current");
  }

  function startTemporaryIssue() {
    setSelectedTaskId("");
    setTemporaryIssue(true);
    setMachineId("");
    setScanCode("");
    setMatchedCode("");
    setNote("");
    setFeedback(null);
    setMobileView("current");
  }

  function returnToTasks() {
    setSelectedTaskId("");
    setTemporaryIssue(false);
    setMachineId("");
    setScanCode("");
    setMatchedCode("");
    setNote("");
    setFeedback(null);
    setMobileView("current");
  }

  return (
    <section className={`raw-material-scanner-page guided-mobile-page view-${mobileView}`} aria-label="原材料扫码出库">
      <header className="raw-material-scanner-hero">
        <div>
          <span>{workflowStarted ? "领料任务已锁定" : "按任务领料"}</span>
          <h1>{workflowStarted ? (selectedTask?.machineLabel || "临时领料") : "今日领料任务"}</h1>
        </div>
        <BarcodeOutlined aria-hidden="true" />
      </header>

      {mobileView === "current" && !workflowStarted ? (
        <TaskSelection
          error={taskListError}
          loading={taskListLoading}
          onSelect={startTask}
          onTemporaryIssue={startTemporaryIssue}
          rows={taskRows}
        />
      ) : null}

      {mobileView === "current" && workflowStarted ? <>
        <button className="raw-material-task-back" onClick={returnToTasks} type="button">
          <ArrowLeftOutlined /> 返回今日任务
        </button>

        {selectedTask ? <SelectedTaskSummary task={selectedTask} /> : (
          <section className="raw-material-selected-task is-temporary">
            <div><span>例外流程</span><strong>临时领料</strong></div>
            <p>没有已下达任务时才使用；系统仍会记录本人、卷码、时间和去向。</p>
          </section>
        )}

        <ol className="raw-material-scanner-steps" aria-label="扫码领料步骤">
          <li className="done"><b>1</b><span>{temporaryIssue ? "临时领料" : "选择任务"}</span></li>
          <li className={!match ? "active" : "done"}><b>2</b><span>扫描布卷</span></li>
          <li className={match ? "active" : ""}><b>3</b><span>确认领料</span></li>
        </ol>

        {temporaryIssue ? (
          <label className="raw-material-machine-field raw-material-temporary-machine">送到哪台机 / 哪个区域
            <select
              aria-label="送到哪台机 / 哪个区域"
              onChange={(event) => setMachineId(event.target.value)}
              value={machineId}
            >
              <option value="">请选择机台或区域</option>
              {RAW_MATERIAL_MACHINE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        ) : null}

        <form className="raw-material-scan-form" onSubmit={handleScanSubmit}>
          <label htmlFor="raw-material-scan-code">扫描布卷标签</label>
          <div>
            <SearchOutlined aria-hidden="true" />
            <input
              autoComplete="off"
              id="raw-material-scan-code"
              onChange={(event) => setScanCode(event.target.value)}
              placeholder="对准条码，或输入卷码"
              ref={scanInputRef}
              value={scanCode}
            />
            <button disabled={!scanCode.trim()} type="submit">识别</button>
          </div>
          <small>{selectedTask ? `本次领料固定送往${selectedTask.machineLabel}，不用再次选择机台。` : "临时领料必须先选择去向，再扫描布卷。"}</small>
        </form>

        {matchedCode && !match ? <p className="raw-material-scan-feedback danger">没有找到卷码“{matchedCode}”，请检查标签后重试。</p> : null}
        {match ? (
          <section className="raw-material-scan-result">
            <div className="raw-material-scan-result-head">
              <div><span>已识别布卷</span><strong>{match.roll.id}</strong></div>
              <em className={blocker ? "danger" : "success"}>{blocker ? "不能领用" : "核对通过"}</em>
            </div>
            <dl>
              <div><dt>布料颜色</dt><dd>{match.roll.factoryColor || match.inbound.factoryColor || match.inbound.supplierColor || "待补"}</dd></div>
              <div><dt>送往机台</dt><dd>{selectedTask?.machineLabel || activeMachineId || "待选择"}</dd></div>
              <div><dt>布卷规格</dt><dd>{match.roll.spec || match.inbound.spec || "待补"}</dd></div>
              <div><dt>本卷重量</dt><dd>{match.roll.weightKg ? `${formatNumber(match.roll.weightKg)}kg` : match.inbound.unit || "待补"}</dd></div>
              <div><dt>布卷宽幅</dt><dd>{match.roll.widthCm || match.inbound.widthCm ? `${match.roll.widthCm || match.inbound.widthCm}cm` : "待补"}</dd></div>
              <div><dt>生产任务</dt><dd>{selectedTask?.productionTaskId || "临时领料"}</dd></div>
            </dl>
            {blocker ? <p className="raw-material-scan-feedback danger">{blocker}</p> : (
              <>
                <div className="raw-material-scan-confirmation">
                  <strong>确认后</strong>
                  <span>这卷布会从可用库存转到{selectedTask?.machineLabel || activeMachineId}，领料人、任务、时间和卷码自动留痕。</span>
                </div>
                <button
                  className="raw-material-scan-submit"
                  disabled={!activeMachineId || submitting || issueState.disabled}
                  onClick={handleConfirmOutbound}
                  title={issueState.title || ""}
                  type="button"
                >
                  <CheckCircleOutlined /> {submitting ? "正在确认…" : `确认领到${selectedTask?.machineLabel || activeMachineId}`}
                </button>
              </>
            )}
          </section>
        ) : null}

        {feedback ? <p className={`raw-material-scan-feedback ${feedback.tone}`}>{feedback.message}</p> : null}
      </> : null}

      {mobileView === "pending" ? (
        <section className="guided-mobile-queue raw-material-available-rolls" aria-label="可领用原材料卷">
          <header><div><h2>可领用布卷</h2><span>这里只查库存；领料仍从生产任务进入</span></div><strong>{availableRolls.length}</strong></header>
          {availableRolls.length ? availableRolls.map((item) => (
            <article key={item.roll.id}>
              <span>{item.roll.id}</span>
              <strong>{item.roll.factoryColor || item.inbound.factoryColor || item.inbound.supplierColor || "颜色待补"} · {item.roll.spec || item.inbound.spec || "规格待补"}</strong>
              <small>{item.roll.weightKg ? `${formatNumber(item.roll.weightKg)}kg` : item.inbound.unit || "数量待补"} · {item.inbound.supplierName || "供应商待补"}</small>
            </article>
          )) : <p>当前没有可领用布卷。</p>}
        </section>
      ) : null}

      {mobileView === "all" ? (
        <section className="guided-mobile-functions" aria-label="原料经手人全部功能">
          <header><h2>全部功能</h2></header>
          <div>
            <button onClick={returnToTasks} type="button"><InboxOutlined /><strong>今日任务</strong><span>{taskRows.length} 项</span></button>
            <button disabled={!availableRolls.length} onClick={() => setMobileView("pending")} type="button"><BarcodeOutlined /><strong>可领布卷</strong><span>{availableRolls.length} 卷</span></button>
            <button onClick={startTemporaryIssue} type="button"><UnorderedListOutlined /><strong>临时领料</strong><span>无任务时</span></button>
          </div>
        </section>
      ) : null}

      <MobileRoleBottomNavigation
        ariaLabel="原材料经手人手机导航"
        badgeCount={(key) => key === "current" ? taskRows.length : key === "pending" ? availableRolls.length : 0}
        items={MOBILE_VIEWS}
        onChange={setMobileView}
        value={mobileView}
      />
    </section>
  );
}

function TaskSelection({ error, loading, onSelect, onTemporaryIssue, rows }) {
  return (
    <section className="raw-material-task-selection" aria-label="今日领料任务">
      <header>
        <div><h2>先选择要送料的任务</h2><p>机台和订单由任务自动带出。</p></div>
        <strong>{rows.length}项</strong>
      </header>
      {loading ? <p className="raw-material-task-state">正在读取已下达任务…</p> : null}
      {error ? <p className="raw-material-scan-feedback danger">任务读取失败：{error}</p> : null}
      {!loading && !error && rows.length ? <div className="raw-material-task-list">
        {rows.map((task) => <TaskCard key={task.productionTaskId} onSelect={onSelect} task={task} />)}
      </div> : null}
      {!loading && !error && !rows.length ? (
        <div className="raw-material-task-empty">
          <strong>今天没有已下达的制袋任务</strong>
          <span>办公室排产发布后会自动显示；急用料可走临时领料。</span>
          <button onClick={onTemporaryIssue} type="button">临时领料</button>
        </div>
      ) : null}
    </section>
  );
}

function TaskCard({ onSelect, task }) {
  return (
    <article className="raw-material-task-card">
      <div className="raw-material-task-card-head">
        <div><strong>{task.machineLabel}</strong><span>{task.statusLabel}</span></div>
        <small>{task.productionTaskId}</small>
      </div>
      <h3>{task.productLabel}</h3>
      <p>{task.customerName ? `${task.customerName} · ` : ""}{task.orderLineId}</p>
      <dl>
        <div><dt>袋子要求</dt><dd>{task.bagRequirementLabel}</dd></div>
        <div><dt>建议布料</dt><dd>{task.materialLabel}</dd></div>
        <div><dt>预计用量</dt><dd>{task.estimatedUsageLabel}</dd></div>
        <div><dt>已经领料</dt><dd>{task.issuedLabel}</dd></div>
      </dl>
      <button onClick={() => onSelect(task.productionTaskId)} type="button">为这个任务领料</button>
    </article>
  );
}

function SelectedTaskSummary({ task }) {
  return (
    <section className="raw-material-selected-task">
      <div className="raw-material-selected-task-head">
        <div><span>{task.statusLabel}</span><strong>{task.productLabel}</strong></div>
        <b>{task.machineLabel}</b>
      </div>
      <dl>
        <div><dt>建议布料</dt><dd>{task.materialLabel}</dd></div>
        <div><dt>预计用量</dt><dd>{task.estimatedUsageLabel}</dd></div>
        <div><dt>已经领料</dt><dd>{task.issuedLabel}</dd></div>
      </dl>
      <small>{task.productionTaskId} · {task.orderLineId}</small>
    </section>
  );
}

export function buildRawMaterialIssueTaskRows({ currentUser = {}, findCustomer = () => ({ name: "" }), inbounds = [], productionTasks = [] } = {}) {
  const currentMachineId = cleanText(currentUser.defaultMachineId ?? currentUser.default_machine_id ?? currentUser.currentMachineId ?? currentUser.machineId);
  return (Array.isArray(productionTasks) ? productionTasks : [])
    .map((task) => buildRawMaterialIssueTaskRow({ task, findCustomer, inbounds }))
    .filter(Boolean)
    .filter((task) => !currentMachineId || normalizeMachineId(task.machineId) === normalizeMachineId(currentMachineId))
    .sort((left, right) => {
      const machineSort = left.machineLabel.localeCompare(right.machineLabel, "zh-CN", { numeric: true });
      if (machineSort) return machineSort;
      return left.productionTaskId.localeCompare(right.productionTaskId);
    });
}

function buildRawMaterialIssueTaskRow({ task = {}, findCustomer, inbounds }) {
  const productionTask = task.productionTask ?? {};
  const productionTaskId = cleanText(task.productionTaskId ?? productionTask.productionTaskId ?? task.id);
  const taskType = cleanText(task.taskType ?? productionTask.taskType);
  const status = cleanText(task.taskStatus ?? task.status ?? productionTask.taskStatus ?? productionTask.status);
  const publishedScheduleId = cleanText(task.publishedScheduleId ?? productionTask.publishedScheduleId);
  const carryOver = task.dailyProgress?.carryOver === true || status.includes("跨日") || status.includes("待完工");
  if (!productionTaskId || (taskType && !taskType.includes("制袋")) || status.includes("已完成") || (!publishedScheduleId && !carryOver)) return null;

  const machineId = cleanText(task.machineId ?? productionTask.machineId);
  if (!machineId) return null;
  const orderLine = task.orderLine ?? task;
  const orderLineId = cleanText(task.orderLineId ?? task.id ?? productionTask.orderLineId);
  const productName = cleanText(orderLine.productName ?? orderLine.product) || "制袋任务";
  const size = cleanText(orderLine.size);
  const bagColor = cleanText(orderLine.bagColor ?? orderLine.color);
  const plannedQty = positiveNumber(productionTask.plannedQty ?? task.plannedQty ?? task.qty ?? orderLine.originalQty);
  const remainingQty = positiveNumber(task.dailyProgress?.remainingQty) || plannedQty;
  const support = evaluateRawMaterialOrderSupport({
    inbounds,
    order: { ...orderLine, plannedQty: remainingQty },
  });
  const averageCompatibleRollWeight = support.availableRollCount > 0 && support.availableWeightKg > 0
    ? support.availableWeightKg / support.availableRollCount
    : 0;
  const estimatedRolls = support.requiredWeightKg > 0 && averageCompatibleRollWeight > 0
    ? support.requiredWeightKg / averageCompatibleRollWeight
    : 0;
  const issueRecords = inbounds.flatMap((inbound) => inbound.rawMaterialIssueRecords ?? [])
    .filter((record) => cleanText(record.productionTaskId) === productionTaskId);
  const issuedRollCount = new Set(issueRecords.map((record) => record.rollId).filter(Boolean)).size;
  const issuedWeightKg = issueRecords.reduce((total, record) => total + positiveNumber(record.issuedWeightKg), 0);
  const customerName = cleanText(findCustomer(orderLine.customerId)?.name);

  return {
    productionTaskId,
    orderLineId,
    machineId,
    machineLabel: formatMachineLabel(machineId),
    statusLabel: carryOver ? "跨日继续" : status || "已下达",
    productLabel: [productName, size].filter(Boolean).join(" · "),
    customerName,
    bagRequirementLabel: [bagColor || "颜色待确认", remainingQty ? `${formatNumber(remainingQty)}个` : "数量待确认"].join(" · "),
    materialLabel: support.status === "已计算"
      ? [bagColor || "颜色待确认", `${formatNumber(support.requiredWidthCm)}cm`, `${formatNumber(support.gramWeightGsm)}g`].join(" · ")
      : `${bagColor || "颜色待确认"} · 宽幅待复核`,
    estimatedUsageLabel: support.requiredWeightKg > 0
      ? `${estimatedRolls > 0 ? `约${formatNumber(estimatedRolls, 1)}卷 / ` : ""}${formatNumber(support.requiredWeightKg, 1)}kg`
      : "待办公室补齐尺寸后计算",
    issuedLabel: `${issuedRollCount}卷${issuedWeightKg > 0 ? ` / ${formatNumber(issuedWeightKg, 1)}kg` : ""}`,
    requiredWidthCm: support.requiredWidthCm,
    bagColor,
  };
}

export function getRawMaterialTaskRollBlocker(task = {}, match = {}) {
  const roll = match.roll ?? {};
  const inbound = match.inbound ?? {};
  const actualColor = cleanText(roll.factoryColor ?? inbound.factoryColor ?? inbound.supplierColor);
  const actualWidthCm = positiveNumber(roll.widthCm ?? inbound.widthCm);
  const requiredColorKey = normalizeColorKey(task.bagColor);
  const actualColorKey = normalizeColorKey(actualColor);
  if (requiredColorKey && actualColorKey && requiredColorKey !== actualColorKey) {
    return `颜色不符：任务需要“${task.bagColor}”，这卷是“${actualColor}”。请换一卷再扫。`;
  }
  if (task.requiredWidthCm > 0 && actualWidthCm > 0 && task.requiredWidthCm !== actualWidthCm) {
    return `宽幅不符：任务需要 ${formatNumber(task.requiredWidthCm)}cm，这卷是 ${formatNumber(actualWidthCm)}cm。请换一卷再扫。`;
  }
  return "";
}

function formatMachineLabel(value) {
  const text = cleanText(value);
  const bagMatch = text.match(/^BAG-0*(\d+)$/i);
  if (bagMatch) return `${Number(bagMatch[1])}号制袋机`;
  const bagNameMatch = text.match(/^(\d+)号(?:制袋)?机$/);
  if (bagNameMatch) return `${Number(bagNameMatch[1])}号制袋机`;
  const printMatch = text.match(/^PRINT-0*(\d+)$/i);
  if (printMatch) return `${Number(printMatch[1])}号丝印机`;
  return text || "机台待确认";
}

function normalizeMachineId(value) {
  const text = cleanText(value).toUpperCase();
  const bagMatch = text.match(/^(?:BAG-0*|)(\d+)号?(?:制袋)?机?$/);
  if (bagMatch) return `BAG-${String(Number(bagMatch[1])).padStart(2, "0")}`;
  return text;
}

function normalizeColorKey(value) {
  const text = cleanText(value)
    .replace(/本白/g, "白")
    .replace(/大红|浅红|深红/g, "红")
    .replace(/浅黄|深黄/g, "黄")
    .replace(/色/g, "")
    .replace(/\s+/g, "");
  const colorMap = [["白", "白"], ["黑", "黑"], ["红", "红"], ["黄", "黄"], ["蓝", "蓝"], ["绿", "绿"], ["灰", "灰"], ["粉", "粉"], ["紫", "紫"], ["橙", "橙"]];
  return colorMap.find(([token]) => text.includes(token))?.[1] ?? text;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function formatNumber(value, maximumFractionDigits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString("zh-CN", { maximumFractionDigits });
}

function cleanText(value) {
  return String(value ?? "").trim();
}
