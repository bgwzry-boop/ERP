import {
  AppstoreOutlined,
  BellOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  InboxOutlined,
  PrinterOutlined,
  UnorderedListOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useMemo, useState } from "react";

const MOBILE_VIEWS = [
  ["current", "当前任务", InboxOutlined],
  ["pending", "待处理", UnorderedListOutlined],
  ["all", "全部功能", AppstoreOutlined],
];

const MOBILE_SAFE_ACTIONS = new Set(["处理完成", "确认已查看", "客户待确认", "重新打开"]);

export function OfficeMobilePage({
  todos = [],
  selectedTodoId,
  setSelectedTodoId,
  onAction,
  onNavigate,
  helpers = {},
}) {
  const [view, setView] = useState("current");
  const {
    findCustomer = () => ({}),
    getTodoActions = () => [],
    getTodoHandlingRule = () => "核对后处理",
    getTodoTone = () => "neutral",
    sortTodos = (rows) => rows,
  } = helpers;
  const openTodos = useMemo(() => sortTodos(todos).filter((item) => !item.handled), [sortTodos, todos]);
  const exceptions = openTodos.filter((item) => ["异常", "急"].includes(item.urgency) || /异常|缺货|差异|老板|管理/.test(item.type));
  const selected = openTodos.find((item) => item.id === selectedTodoId) ?? openTodos[0] ?? null;
  const customer = selected ? findCustomer(selected.customerId) : null;
  const safeActions = selected ? getTodoActions(selected).filter((action) => MOBILE_SAFE_ACTIONS.has(action.label)) : [];
  const handlingRule = selected ? getTodoHandlingRule(selected) : "";
  const showHandlingRule = handlingRule && !["普通待办，可稍后提醒", "低风险，可批量处理"].includes(handlingRule);

  function openTodo(todoId) {
    setSelectedTodoId?.(todoId);
    setView("current");
  }

  async function runAction(action) {
    if (!selected) return;
    await onAction?.(action, selected.id);
  }

  return (
    <section className={`office-mobile-page guided-mobile-page view-${view}`} aria-label="办公室手机工作台">
      <header className="guided-mobile-hero office-mobile-hero">
        <div>
          <h1>随手处理</h1>
        </div>
        <strong>{openTodos.length}<small>待处理</small></strong>
      </header>

      {view === "current" ? (
        selected ? <section className="office-mobile-task-card">
          <header>
            <div><span>{selected.id} · {customer?.name || "客户待确认"}</span><h2>{selected.type}</h2></div>
            <em className={getTodoTone(selected)}>{selected.urgency || "待办"}</em>
          </header>
          <p className="office-mobile-task-summary">{selected.summary}</p>
          <dl>
            <div><dt>最晚</dt><dd>{selected.latest || "待补"}</dd></div>
            <div><dt>已等待</dt><dd>{selected.waitingLabel || selected.wait || "刚刚"}</dd></div>
            <div><dt>业务编号</dt><dd>{selected.ref || selected.refId || "待补"}</dd></div>
            {selected.impact ? <div><dt>影响</dt><dd>{selected.impact}</dd></div> : null}
          </dl>
          {showHandlingRule ? <section className="office-mobile-next-step">
            <strong><BellOutlined /> 下一步</strong>
            <p>{handlingRule}</p>
          </section> : null}
          <div className="office-mobile-task-actions">
            {safeActions.length
              ? safeActions.slice(0, 2).map((action) => <button className={action.variant === "primary" ? "primary-action" : ""} key={action.label} onClick={() => runAction(action.label)} type="button">{action.label}</button>)
              : <button disabled type="button">到电脑端继续业务处理</button>}
          </div>
        </section> : <section className="office-mobile-empty"><CheckCircleOutlined /><strong>当前没有未处理待办</strong><span>有新工单或异常时会在这里提醒。</span></section>
      ) : null}

      {view === "pending" ? <section className="guided-mobile-queue office-mobile-queue" aria-label="办公室待处理任务">
        <header><div><h2>办公室共享任务</h2></div><strong>{openTodos.length}</strong></header>
        {openTodos.map((todo) => <button key={todo.id} onClick={() => openTodo(todo.id)} type="button">
          <span>{todo.urgency || "待办"} · {todo.latest || "待补"}</span>
          <strong>{todo.type}</strong>
          <small>{findCustomer(todo.customerId)?.name || "客户待确认"} · {todo.summary}</small>
        </button>)}
      </section> : null}

      {view === "all" ? <section className="guided-mobile-functions office-mobile-functions" aria-label="办公室手机全部功能">
        <header><h2>全部功能</h2></header>
        <div>
          <button onClick={() => setView("pending")} type="button"><UnorderedListOutlined /><strong>工单待办</strong><span>{openTodos.length} 项</span></button>
          <button disabled={!exceptions.length} onClick={() => exceptions[0] && openTodo(exceptions[0].id)} type="button"><WarningOutlined /><strong>异常提醒</strong><span>{exceptions.length} 项</span></button>
          <button onClick={() => onNavigate?.("rawMaterials")} type="button"><CameraOutlined /><strong>原料拍单</strong><span>拍照核对</span></button>
          <button onClick={() => onNavigate?.("rawMaterials")} type="button"><PrinterOutlined /><strong>卷标打印</strong><span>蓝牙设备</span></button>
        </div>
      </section> : null}

      <nav className="mobile-role-bottom-nav" aria-label="办公室手机导航">
        {MOBILE_VIEWS.map(([key, label, Icon]) => <button aria-current={view === key ? "page" : undefined} className={view === key ? "active" : ""} key={key} onClick={() => setView(key)} type="button">
          <Icon aria-hidden="true" /><span>{label}</span>{key === "pending" && openTodos.length ? <b>{openTodos.length}</b> : null}
        </button>)}
      </nav>
    </section>
  );
}
