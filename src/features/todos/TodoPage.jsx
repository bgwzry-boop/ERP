import { DetailPane, InfoGrid, MetricStrip, Segmented, StatusPill, Timeline } from "../../components/ui.jsx";
import {
  formatPrintBatchPackageList,
  getPrintBatchRecordsForTodo,
} from "../../state/officeTodoActions.js";

export function TodoPage({ todos, todoMeta = {}, printBatchRecords = [], selectedTodoId, onSelect, view, setView, onAction, helpers }) {
  const { currentUser, findCustomer, getTodoActions, getTodoCustomerNotificationDraft, getTodoHandlingRule, getTodoTone, getUiActionState, isPrintTodo, sortTodos } = helpers;
  const sortedTodos = sortTodos(todos);
  const openTodos = sortedTodos.filter((item) => !item.handled);
  const handledTodos = sortedTodos.filter((item) => item.handled);
  const visibleTodos = view === "已处理" ? handledTodos : view === "全部" ? sortedTodos : openTodos;
  const selected = visibleTodos.find((item) => item.id === selectedTodoId) ?? visibleTodos[0];
  const customerInfo = selected ? findCustomer(selected.customerId) : null;
  const actions = selected ? getTodoActions(selected) : [];
  const customerNotificationDraft = selected && customerInfo ? getTodoCustomerNotificationDraft?.(selected, customerInfo) : null;
  const selectedPrintBatchRecords = selected ? getPrintBatchRecordsForTodo(printBatchRecords, selected.id).slice(0, 3) : [];
  const printOpenCount = openTodos.filter(isPrintTodo).length;
  const stats = [
    ["未处理", openTodos.length, "warning"],
    ["今天要发", openTodos.filter((item) => item.latest.includes("今天")).length, "blue"],
    ["异常红点", openTodos.filter((item) => item.urgency === "异常").length, "danger"],
    ["已处理(今日)", handledTodos.length, "success"],
  ];

  return (
    <section className="page-grid two-col">
      <div className="list-pane">
        <MetricStrip items={stats} />
        <div className="panel-head compact todo-head">
          <div>
            <h2>公共待办池</h2>
            <span>
              急单、异常、今天要发、等待时长排序
              {todoMeta.source ? ` · ${todoMeta.source === "api" ? "后端公共待办" : "本地公共待办"} ${todoMeta.total ?? todos.length} 条` : ""}
            </span>
          </div>
          <Segmented value={view} onChange={setView} items={["未处理", "已处理", "全部"]} />
        </div>
        {printOpenCount > 0 ? (
          <div className="todo-bulk-row">
            <span>打印类待办 {printOpenCount} 条，人工核对与 spool 状态分开记录</span>
            <button
              disabled={getUiActionState("todo", "批量打印标签").disabled}
              title={getUiActionState("todo", "批量打印标签").title}
              onClick={() => onAction("批量打印标签")}
            >
              批量打印标签
            </button>
          </div>
        ) : null}
        <div className="todo-list">
          {visibleTodos.length ? visibleTodos.map((item) => {
            const customer = findCustomer(item.customerId);
            return (
              <button className={`${item.id === selected?.id ? "todo-row active" : "todo-row"} ${item.handled ? "handled" : ""} ${item.reminder ? "snoozed" : ""}`} key={item.id} onClick={() => onSelect(item.id)}>
                <div className="todo-main">
                  <strong>{item.type}</strong>
                  <span>{customer.name} · {item.ref}</span>
                  <small>{item.summary}</small>
                  <em>{getTodoHandlingRule(item)}{item.reminder ? ` · 提醒 ${item.reminder}` : ""}</em>
                </div>
                <div className="todo-side">
                  <StatusPill tone={getTodoTone(item)}>
                    {item.handled ? "已处理" : item.urgency}
                  </StatusPill>
                  <em>{item.handledBy ? item.handledBy : item.reminder ? `提醒 ${item.reminder}` : item.wait}</em>
                </div>
              </button>
            );
          }) : <div className="empty-row">当前视图没有待办</div>}
        </div>
      </div>
      {selected && customerInfo ? (
      <DetailPane title={selected.type} subtitle={`${customerInfo.name} · ${selected.ref}`}>
        <InfoGrid
          rows={[
            ["客户", customerInfo.name],
            ["联系人", `${customerInfo.contact} ${customerInfo.phone}`],
            ["最晚时间", selected.latest],
            ["等待时长", selected.wait],
            ["处理方式", getTodoHandlingRule(selected)],
            ["提醒状态", selected.reminder ?? "未设置"],
            ["影响", selected.impact],
            ["最后动作", selected.lastAction ?? selected.handledAt ?? "未处理"],
          ]}
        />
        <section className="detail-section">
          <h3>摘要</h3>
          <p>{selected.summary}</p>
        </section>
        {customerNotificationDraft ? (
          <section className="detail-section">
            <h3>客户通知</h3>
            <div className="todo-notification-card">
              <InfoGrid
                rows={[
                  ["发送渠道", customerNotificationDraft.channel],
                  ["通知状态", customerNotificationDraft.status],
                  ["成品图", customerNotificationDraft.photoPrompt],
                ]}
              />
              <p>{customerNotificationDraft.copyText}</p>
            </div>
          </section>
        ) : null}
        {selectedPrintBatchRecords.length ? (
          <section className="detail-section">
            <h3>打印批次</h3>
            <div className="print-batch-records">
              {selectedPrintBatchRecords.map((record) => (
                <div className="print-batch-record" key={record.printBatchId}>
                  <div>
                    <strong>{record.printBatchId}</strong>
                    <StatusPill tone={record.status === "printed" ? "success" : record.status === "partial" ? "warning" : "danger"}>
                      {record.resultLabel}
                    </StatusPill>
                  </div>
                  <p>{record.summary}</p>
                  <small>已打：{formatPrintBatchPackageList(record.printedPackages, record.printedPackageIds)}</small>
                  <small>待打：{formatPrintBatchPackageList(record.pendingPackages, record.pendingPackageIds)}</small>
                  <em>{record.operatorName} · {record.createdAt}</em>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <section className="detail-section">
          <h3>建议动作</h3>
          <div className="action-row">
            {actions.map((item) => {
              const actionState = getUiActionState("todo", item.label);
              return (
                <button className={item.variant === "primary" ? "primary-action" : ""} disabled={actionState.disabled} key={item.label} title={actionState.title} onClick={() => onAction(item.label, selected.id)}>{item.label}</button>
              );
            })}
          </div>
        </section>
        {!selected.handled && (
          <section className="detail-section">
            <h3>稍后提醒</h3>
            <div className="action-row">
              {[
                ["稍后30分钟", "30分钟"],
                ["稍后2小时", "2小时"],
                ["稍后明早", "明早"],
                ["稍后指定时间", "指定时间"],
              ].map(([action, label]) => {
                const actionState = getUiActionState("todo", action);
                return <button disabled={actionState.disabled} key={action} title={actionState.title} onClick={() => onAction(action, selected.id)}>{label}</button>;
              })}
            </div>
          </section>
        )}
        <Timeline items={["系统创建待办", selected.lastAction ?? `${currentUser.displayName} 查看详情`, selected.handled ? "已处理" : selected.reminder ? `已设提醒 ${selected.reminder}` : "等待人工处理"]} />
      </DetailPane>
      ) : (
        <DetailPane title="公共待办" subtitle="未选择">
          <div className="empty-row">没有可显示的待办</div>
        </DetailPane>
      )}
    </section>
  );
}
