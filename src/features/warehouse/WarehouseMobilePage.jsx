import {
  AppstoreOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  InboxOutlined,
  UnorderedListOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import { MobileRoleBottomNavigation } from "../../shared/ui/MobileRoleBottomNavigation.jsx";

const MOBILE_VIEWS = [
  ["current", "当前任务", InboxOutlined],
  ["pending", "待处理", UnorderedListOutlined],
  ["all", "全部功能", AppstoreOutlined],
];

export function WarehouseMobilePage({
  fulfillments = [],
  orderLines = [],
  selectedId,
  setSelectedId,
  onAction,
  helpers = {},
}) {
  const [view, setView] = useState("current");
  const visibleTasks = useMemo(
    () => fulfillments.filter(isWarehouseTaskVisible).sort(compareWarehouseTasks),
    [fulfillments],
  );
  const pendingTasks = visibleTasks.filter((item) => !item.physicalOutboundAt && item.status !== "已交付");
  const selected = visibleTasks.find((item) => item.id === selectedId) ?? pendingTasks[0] ?? visibleTasks[0] ?? null;
  const line = selected ? helpers.findOrderLine?.(orderLines, selected.lineId ?? selected.orderLineId) : null;
  const customer = selected ? helpers.findCustomer?.(selected.customerId) : null;
  const goods = selected
    ? helpers.getFulfillmentGoodsDisplay?.(selected, line) || selected.goods || line?.product || "货品待确认"
    : "";
  const paperReady = selected?.paperOutboundStatus === "已交库房";
  const currentStep = getWarehouseStep(selected);

  function openTask(taskId) {
    setSelectedId?.(taskId);
    setView("current");
  }

  function openFirstTask(predicate) {
    const task = visibleTasks.find(predicate);
    if (task) openTask(task.id);
  }

  return (
    <section className="warehouse-mobile-page" aria-label="成品库房手机工作台">
      <header className="warehouse-mobile-hero">
        <div>
          <h1>出库任务</h1>
        </div>
        <strong>{pendingTasks.length}<small>待处理</small></strong>
      </header>

      {view === "current" ? (
        <>
          <ol className="warehouse-mobile-steps" aria-label="库房出库步骤">
            {["任务可见", "备货", "纸单核对", "实物出库"].map((label, index) => {
              const stepNumber = index + 1;
              const state = currentStep > stepNumber ? "done" : currentStep === stepNumber ? "active" : "pending";
              return <li className={state} key={label}><span>{stepNumber}</span><small>{label}</small></li>;
            })}
          </ol>
          {selected ? (
            <section className="warehouse-mobile-task-card">
              <div className="warehouse-mobile-task-heading">
                <div>
                  <span>{selected.id}</span>
                  <h2>{customer?.name || "客户待确认"}</h2>
                </div>
                <em className={selected.status?.includes("数量") || selected.status?.includes("无法") ? "danger" : "warning"}>
                  {selected.status || "待处理"}
                </em>
              </div>
              <div className="warehouse-mobile-quantity">
                <div><span>货品</span><strong>{goods}</strong></div>
                <dl>
                  <div><dt>应出数量</dt><dd>{selected.qty ?? 0}<small> 个</small></dd></div>
                  <div><dt>包裹</dt><dd>{selected.packages || "待确认"}</dd></div>
                </dl>
              </div>
              <dl className="warehouse-mobile-facts">
                <div><dt>交付方式</dt><dd>{selected.method || "待确认"}</dd></div>
                <div><dt>最晚时间</dt><dd>{selected.latest || "待确认"}</dd></div>
                <div><dt>纸质出库单</dt><dd>{formatPaperState(selected)}</dd></div>
                <div><dt>库位来源</dt><dd>{selected.zone || selected.source || "待确认"}</dd></div>
              </dl>
              <section className={`warehouse-mobile-next-step${paperReady ? " ready" : ""}`}>
                <strong>{paperReady ? "下一步：核对纸单与实物" : "下一步：先找货并备货"}</strong>
                <p>{paperReady
                  ? "核对版本、规格和数量一致后提交。"
                  : "可先备货；拿到当前纸单后提交。"}</p>
              </section>
              {paperReady ? (
                <button className="warehouse-mobile-primary" onClick={() => onAction?.("回录库房结果", selected.id)} type="button">
                  <FileTextOutlined /> 核对纸单并回录结果
                </button>
              ) : (
                <button className="warehouse-mobile-primary" disabled type="button">
                  <FileTextOutlined /> 等待当前纸质出库单
                </button>
              )}
              {(selected.status?.includes("数量") || selected.status?.includes("无法")) ? (
                <p className="warehouse-mobile-alert" role="alert"><WarningOutlined /> 当前任务存在异常，等待办公室处理后再继续。</p>
              ) : null}
            </section>
          ) : (
            <section className="warehouse-mobile-empty"><CheckCircleOutlined /><strong>当前没有可执行的出库任务</strong><span>办公室打印成功后，任务会自动出现在这里。</span></section>
          )}
        </>
      ) : null}

      {view === "pending" ? (
        <section className="warehouse-mobile-queue" aria-label="库房待处理任务">
          <header><div><h2>待处理任务</h2></div><strong>{pendingTasks.length}</strong></header>
          {pendingTasks.length ? pendingTasks.map((task) => (
            <button key={task.id} onClick={() => openTask(task.id)} type="button">
              <span>{helpers.findCustomer?.(task.customerId)?.name || task.id}</span>
              <strong>{helpers.getFulfillmentGoodsDisplay?.(task, helpers.findOrderLine?.(orderLines, task.lineId ?? task.orderLineId)) || task.goods}</strong>
              <small>{task.qty ?? 0} 个 · {task.method || "方式待确认"} · {formatPaperState(task)}</small>
            </button>
          )) : <p>当前没有待处理任务。</p>}
        </section>
      ) : null}

      {view === "all" ? (
        <section className="warehouse-mobile-functions" aria-label="库房全部功能">
          <header><h2>出库分类</h2></header>
          <div>
            <FunctionButton label="待备货" count={visibleTasks.filter((item) => item.paperOutboundStatus === "已打印待交库房").length} onClick={() => openFirstTask((item) => item.paperOutboundStatus === "已打印待交库房")} />
            <FunctionButton label="待纸单核对" count={visibleTasks.filter((item) => item.paperOutboundStatus === "已交库房" && !item.physicalOutboundAt).length} onClick={() => openFirstTask((item) => item.paperOutboundStatus === "已交库房" && !item.physicalOutboundAt)} />
            <FunctionButton label="异常任务" count={visibleTasks.filter((item) => item.status?.includes("数量") || item.status?.includes("无法")).length} onClick={() => openFirstTask((item) => item.status?.includes("数量") || item.status?.includes("无法"))} />
            <FunctionButton label="已实物出库" count={visibleTasks.filter((item) => item.physicalOutboundAt).length} onClick={() => openFirstTask((item) => Boolean(item.physicalOutboundAt))} />
          </div>
        </section>
      ) : null}

      <MobileRoleBottomNavigation
        ariaLabel="成品库房手机导航"
        badgeCount={(key) => key === "pending" ? pendingTasks.length : 0}
        items={MOBILE_VIEWS}
        onChange={setView}
        value={view}
      />
    </section>
  );
}

function FunctionButton({ count, label, onClick }) {
  return <button disabled={!count} onClick={onClick} type="button"><InboxOutlined /><strong>{label}</strong><span>{count} 条</span></button>;
}

function isWarehouseTaskVisible(item = {}) {
  if (item.status === "已交付") return Boolean(item.physicalOutboundAt);
  return Boolean(
    item.printed ||
    item.activePrintRecordId ||
    item.paperOutboundDocument ||
    ["已打印待交库房", "已交库房"].includes(item.paperOutboundStatus),
  );
}

function compareWarehouseTasks(left, right) {
  const attention = (item) => Number(item.status?.includes("数量") || item.status?.includes("无法")) * 10
    + Number(item.paperOutboundStatus === "已交库房") * 4
    + Number(!item.physicalOutboundAt) * 2;
  return attention(right) - attention(left);
}

function getWarehouseStep(item) {
  if (!item) return 1;
  if (item.physicalOutboundAt) return 5;
  if (item.paperOutboundStatus === "已交库房") return 3;
  if (item.paperOutboundStatus === "已打印待交库房" || item.printed) return 2;
  return 1;
}

function formatPaperState(item = {}) {
  if (item.paperOutboundStatus === "已交库房") {
    const version = item.paperOutboundDocument?.documentVersion;
    return `已收到${version ? ` · 第${version}版` : ""}`;
  }
  if (item.paperOutboundStatus === "已打印待交库房" || item.printed) return "已打印，等待送达库房";
  return "尚未打印成功";
}
