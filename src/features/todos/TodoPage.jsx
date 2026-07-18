import { useEffect, useState } from "react";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  LinkOutlined,
  NotificationOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SearchOutlined,
  UnorderedListOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  DataState,
  DataTable,
  DetailPane,
  FilterBar,
  InfoGrid,
  OperationalPanel,
  Segmented,
  StatusPill,
  Timeline,
} from "../../shared/ui/operational.jsx";
import {
  formatPrintBatchPackageList,
  getPrintBatchRecordsForTodo,
} from "../../state/officeTodoActions.js";

const TODO_DETAIL_TABS = ["处理", "通知/打印", "记录"];
const TODO_VIEWS = ["未处理", "今天要发", "异常/提醒", "待打印", "稍后提醒", "已处理", "全部"];
const TODO_BUSINESS_AREAS = ["全部业务", "订单", "库存", "出库", "财务", "生产", "设备", "其他"];
const TODO_REFERENCE_TYPE_OPTIONS = [
  ["order_draft", "订单草稿"],
  ["order_line", "订单行"],
  ["fulfillment", "出库交付"],
  ["statement", "对账单"],
  ["inventory_item", "库存货品"],
  ["inventory_correction", "库存修正"],
  ["production_task", "生产任务"],
  ["maintenance_task", "设备任务"],
];

export function TodoPage({ todos, printBatchRecords = [], selectedTodoId, onSelect, view, setView, onAction, onRepairReference, helpers }) {
  const [detailTab, setDetailTab] = useState("处理");
  const [query, setQuery] = useState("");
  const [businessArea, setBusinessArea] = useState("全部业务");
  const [repairRefType, setRepairRefType] = useState("order_line");
  const [repairRefId, setRepairRefId] = useState("");
  const [repairReason, setRepairReason] = useState("办公室核对原始待办后重新关联");
  const { currentUser, findCustomer, getTodoActions, getTodoCustomerNotificationDraft, getTodoHandlingRule, getTodoTone, getUiActionState, isPrintTodo, sortTodos } = helpers;
  const sortedTodos = sortTodos(todos);
  const openTodos = sortedTodos.filter((item) => !item.handled);
  const businessMatched = sortedTodos.filter((item) => businessArea === "全部业务" || getTodoBusinessArea(item) === businessArea);
  const queryMatched = businessMatched.filter((item) => todoMatchesQuery(item, query, findCustomer, getTodoHandlingRule));
  const visibleTodos = queryMatched.filter((item) => todoMatchesView(item, view, isPrintTodo));
  const selected = visibleTodos.find((item) => item.id === selectedTodoId) ?? visibleTodos[0] ?? null;
  const viewTabs = TODO_VIEWS.map((label) => ({
    label,
    count: queryMatched.filter((item) => todoMatchesView(item, label, isPrintTodo)).length,
  }));
  const allowedRefTypes = selected?.allowedRefTypes?.length ? selected.allowedRefTypes : TODO_REFERENCE_TYPE_OPTIONS.map(([value]) => value);
  const allowedReferenceOptions = TODO_REFERENCE_TYPE_OPTIONS.filter(([value]) => allowedRefTypes.includes(value));
  const customerInfo = selected ? findCustomer(selected.customerId) : null;
  const actions = selected ? getTodoActions(selected) : [];
  const customerNotificationDraft = selected && customerInfo ? getTodoCustomerNotificationDraft?.(selected, customerInfo) : null;
  const selectedPrintBatchRecords = selected ? getPrintBatchRecordsForTodo(printBatchRecords, selected.id).slice(0, 3) : [];
  const printOpenCount = openTodos.filter(isPrintTodo).length;
  const activeFilterCount = Number(Boolean(query.trim())) + Number(businessArea !== "全部业务") + Number(view !== "未处理");
  useEffect(() => {
    const candidate = selected?.referenceCandidates?.[0];
    setRepairRefType(candidate?.refType || selected?.allowedRefTypes?.[0] || selected?.resolvedRefType || "order_line");
    setRepairRefId(candidate?.refId || "");
    setRepairReason("办公室核对原始待办后重新关联");
  }, [selected?.id, selected?.referenceStatus]);

  const repairActionState = getUiActionState("todo", "重新关联待办");
  const selectReferenceCandidate = (refId) => {
    setRepairRefId(refId);
    const candidate = selected?.referenceCandidates?.find((item) => item.refId === refId);
    if (candidate) setRepairRefType(candidate.refType);
  };
  const filterBar = (
    <>
      <TodoStatusTabs value={view} items={viewTabs} onChange={setView} />
      <FilterBar
        className="todo-filter-bar"
        ariaLabel="公共待办筛选"
        summary={`${visibleTodos.length} / ${todos.length} 条`}
        actions={(
          <div className="todo-filter-actions">
            {printOpenCount > 0 ? (
              <button
                className="todo-batch-print"
                disabled={getUiActionState("todo", "批量打印标签").disabled}
                title={getUiActionState("todo", "批量打印标签").title}
                onClick={() => onAction("批量打印标签")}
                type="button"
              >
                <PrinterOutlined /> 批量打印 {printOpenCount}
              </button>
            ) : null}
            <button type="button" disabled={!activeFilterCount} onClick={resetFilters}>
              <ReloadOutlined /> 重置
            </button>
          </div>
        )}
      >
        <div className="todo-filter-grid">
          <label className="todo-query-field">
            <span>关键词</span>
            <div className="todo-query-control">
              <SearchOutlined aria-hidden="true" />
              <input
                aria-label="公共待办关键词"
                placeholder="待办 / 客户 / 业务编号 / 摘要"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </label>
          <label className="todo-business-field">
            <span>业务范围</span>
            <select aria-label="公共待办业务范围" value={businessArea} onChange={(event) => setBusinessArea(event.target.value)}>
              {TODO_BUSINESS_AREAS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </FilterBar>
    </>
  );

  function resetFilters() {
    setQuery("");
    setBusinessArea("全部业务");
    setView("未处理");
  }

  if (!selected) {
    return (
      <section className="page-grid split-detail operational-split-workbench todo-workbench">
        <OperationalPanel className="list-pane todo-list-panel" ariaLabel="公共待办池">
          {filterBar}
          <DataState title="没有匹配的公共待办" detail="调整状态、关键词或业务范围后重试。" />
        </OperationalPanel>
        <DetailPane className="todo-detail-pane" title="公共待办" subtitle="暂无可显示任务">
          <DataState title="没有可显示的待办详情" compact />
        </DetailPane>
      </section>
    );
  }

  const selectedVisibleState = getTodoVisibleState(selected);
  const selectedReferenceState = getTodoReferenceState(selected);
  const selectedLastAction = selected.lastAction || selected.handledAt || "未处理";
  const selectedHandlingRule = getTodoHandlingRule(selected);
  const showSelectedHandlingRule = !["普通待办，可稍后提醒", "低风险，可批量处理"].includes(selectedHandlingRule);

  return (
    <section className="page-grid split-detail operational-split-workbench todo-workbench">
      <OperationalPanel className="list-pane todo-list-panel" ariaLabel="公共待办池">
        {filterBar}
        <div className="todo-list">
          <DataTable
            className="todo-table"
            columns={["待办 / 客户", "摘要 / 影响", "最晚 / 等待", "状态", "业务引用"]}
            rows={visibleTodos.map((item) => {
              const customer = findCustomer(item.customerId);
              const visibleState = getTodoVisibleState(item);
              const referenceState = getTodoReferenceState(item);
              return {
                id: item.id,
                active: item.id === selected.id,
                tone: item.handled ? "success" : getTodoTone(item),
                onClick: () => onSelect(item.id),
                cells: [
                  <TodoIdentity type={item.type} customer={customer.name} reference={item.ref} />,
                  <TodoSummary summary={item.summary} impact={item.impact} />,
                  <TodoDue latest={item.latest} waiting={item.waitingLabel || item.wait} />,
                  <StatusPill tone={getTodoTone(item)}>{visibleState.label}</StatusPill>,
                  <StatusPill tone={referenceState.tone}>{referenceState.shortLabel}</StatusPill>,
                ],
              };
            })}
          />
        </div>
      </OperationalPanel>
      <DetailPane className="todo-detail-pane" title={selected.type} subtitle={`${customerInfo.name} · ${selected.ref}`}>
        <div className="todo-detail-scroll">
          <div className="todo-detail-overview">
            <div className="todo-detail-statuses" aria-label="当前待办状态">
              <StatusPill tone={getTodoTone(selected)}>{selectedVisibleState.label}</StatusPill>
              <StatusPill tone={selectedReferenceState.tone}>{selectedReferenceState.label}</StatusPill>
              {selected.activeSnooze ? <StatusPill tone="warning">稍后提醒</StatusPill> : null}
              {selected.handled ? <StatusPill tone="success">{selected.handledBy || "已处理"}</StatusPill> : null}
            </div>
            <div className="todo-detail-summary">
              <div>
                <span>待办摘要</span>
                <strong>{selected.summary}</strong>
                {selected.impact ? <small>{selected.impact}</small> : null}
              </div>
              <dl>
                <div><dt>最晚</dt><dd>{selected.latest}</dd></div>
                <div><dt>等待</dt><dd>{selected.waitingLabel || selected.wait}</dd></div>
              </dl>
            </div>
          </div>
          <div className="operational-detail-tabs">
            <Segmented ariaLabel="待办详情视图" value={detailTab} onChange={setDetailTab} items={TODO_DETAIL_TABS} />
          </div>
          <div hidden={detailTab !== "处理"}>
            <TodoDetailSection title="任务信息">
              <TodoDetailFacts
                rows={[
                  ["客户", customerInfo.name],
                  ["联系人", `${customerInfo.contact} ${customerInfo.phone}`],
                  ["提醒状态", selected.activeSnooze ? `稍后提醒：${selected.reminder}` : selected.reminderLevelLabel || selected.reminder || "正常"],
                  ["业务引用", selectedReferenceState.detail],
                  ["最后动作", selectedLastAction],
                ]}
              />
            </TodoDetailSection>
            {showSelectedHandlingRule ? <section className={`todo-next-step ${selectedReferenceState.tone === "danger" ? "danger" : ""}`} aria-label="下一步">
              <strong>{selectedReferenceState.tone === "danger" ? <WarningOutlined /> : <UnorderedListOutlined />} 下一步</strong>
              <p>{selectedHandlingRule}</p>
            </section> : null}
            {selected.referenceStatus === "missing" || selected.referenceStatus === "unverifiable" ? (
              <section className="todo-detail-section todo-reference-repair">
                <h3>重新关联业务</h3>
                <p className="detail-hint">原引用已失效或暂不可校验。请选择候选或手动填写允许的真实业务编号，服务端验证通过后才会保存。</p>
                <div className="form-grid compact-form-grid">
                  <label>
                    业务类型
                    <select value={repairRefType} onChange={(event) => setRepairRefType(event.target.value)}>
                      {allowedReferenceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    业务编号
                    <input list={`todo-reference-candidates-${selected.id}`} value={repairRefId} onChange={(event) => selectReferenceCandidate(event.target.value)} placeholder="输入或选择业务编号" />
                    <datalist id={`todo-reference-candidates-${selected.id}`}>
                      {(selected.referenceCandidates ?? []).map((candidate) => <option key={`${candidate.refType}:${candidate.refId}`} value={candidate.refId}>{candidate.label}</option>)}
                    </datalist>
                  </label>
                  <label className="wide-field">
                    修复原因
                    <input value={repairReason} onChange={(event) => setRepairReason(event.target.value)} placeholder="填写核对依据或修复原因" />
                  </label>
                </div>
                <div className="action-row">
                  <button className="primary-action" disabled={repairActionState.disabled || !repairRefType || !repairRefId.trim() || !repairReason.trim()} title={repairActionState.title} onClick={() => onRepairReference?.(selected.id, { refType: repairRefType, refId: repairRefId.trim(), reason: repairReason.trim() })}><LinkOutlined /> 验证并重新关联</button>
                </div>
              </section>
            ) : null}
            <div className="action-row operational-detail-actions todo-detail-actions">
              {actions.map((item) => {
                const actionState = getUiActionState("todo", item.label);
                return (
                  <button className={item.variant === "primary" ? "primary-action" : ""} disabled={actionState.disabled} key={item.label} title={actionState.title} onClick={() => onAction(item.label, selected.id)}>
                    <TodoActionIcon label={item.label} /> {item.label}
                  </button>
                );
              })}
            </div>
            {!selected.handled && (
              <TodoDetailSection title="稍后提醒">
                <div className="action-row todo-snooze-actions">
                  {[
                    ["稍后30分钟", "30分钟"],
                    ["稍后2小时", "2小时"],
                    ["稍后明早", "明早"],
                    ["稍后指定时间", "指定时间"],
                  ].map(([action, label]) => {
                    const actionState = getUiActionState("todo", action);
                    return <button disabled={actionState.disabled} key={action} title={actionState.title} onClick={() => onAction(action, selected.id)}><ClockCircleOutlined /> {label}</button>;
                  })}
                </div>
              </TodoDetailSection>
            )}
          </div>
          <div hidden={detailTab !== "通知/打印"}>
            {customerNotificationDraft ? (
              <section className="todo-detail-section operational-detail-section-first">
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
              <section className="todo-detail-section">
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
            {!customerNotificationDraft && !selectedPrintBatchRecords.length ? (
              <DataState title="当前待办没有通知或打印记录" detail="需要客户通知或执行打印后，相关记录会显示在这里。" compact />
            ) : null}
          </div>
          <div className="operational-detail-timeline todo-detail-timeline" hidden={detailTab !== "记录"}>
            <Timeline items={["系统创建待办", selectedLastAction || `${currentUser.displayName} 查看详情`, selected.handled ? "已处理" : selected.reminder ? `已设提醒 ${selected.reminder}` : "等待人工处理"]} />
          </div>
        </div>
      </DetailPane>
    </section>
  );
}

function TodoStatusTabs({ value, items, onChange }) {
  return (
    <div className="todo-status-tabs" role="tablist" aria-label="待办状态快捷筛选">
      {items.map((item) => (
        <button type="button" role="tab" aria-selected={value === item.label} className={value === item.label ? "active" : ""} key={item.label} onClick={() => onChange(item.label)}>
          <span>{item.label}</span>
          <strong>{item.count}</strong>
        </button>
      ))}
    </div>
  );
}

function TodoIdentity({ type, customer, reference }) {
  return (
    <span className="todo-cell-stack" title={`${type} / ${customer} / ${reference}`}>
      <strong>{type}</strong>
      <small>{customer} · {reference}</small>
    </span>
  );
}

function TodoSummary({ summary, impact }) {
  return (
    <span className="todo-cell-stack" title={impact ? `${summary} / ${impact}` : summary}>
      <strong>{summary}</strong>
      {impact ? <small>{impact}</small> : null}
    </span>
  );
}

function TodoDue({ latest, waiting }) {
  return (
    <span className="todo-due-cell" title={`${latest} / ${waiting}`}>
      <strong>{latest}</strong>
      <small>{waiting}</small>
    </span>
  );
}

function TodoDetailSection({ title, children }) {
  return (
    <section className="todo-detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function TodoDetailFacts({ rows }) {
  return (
    <dl className="todo-detail-facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TodoActionIcon({ label }) {
  if (label.includes("打印")) return <PrinterOutlined aria-hidden="true" />;
  if (label.includes("完成") || label.includes("确认") || label.includes("重新打开")) return <CheckCircleOutlined aria-hidden="true" />;
  if (label.includes("通知") || label.includes("客户")) return <NotificationOutlined aria-hidden="true" />;
  if (label.includes("关联") || label.includes("补建")) return <LinkOutlined aria-hidden="true" />;
  if (label.includes("打开")) return <FileTextOutlined aria-hidden="true" />;
  return <WarningOutlined aria-hidden="true" />;
}

function todoMatchesQuery(todo, query, findCustomer, getTodoHandlingRule) {
  const normalizedQuery = String(query ?? "").trim().toLowerCase();
  if (!normalizedQuery) return true;
  const customer = findCustomer(todo.customerId);
  const searchable = [
    todo.id,
    todo.type,
    todo.ref,
    todo.summary,
    todo.impact,
    todo.latest,
    todo.waitingLabel,
    todo.wait,
    todo.reminder,
    todo.reminderLevelLabel,
    todo.resolvedRefTypeLabel,
    customer?.name,
    customer?.contact,
    customer?.phone,
    getTodoHandlingRule(todo),
  ].filter(Boolean).join(" ").toLowerCase();
  return searchable.includes(normalizedQuery);
}

function todoMatchesView(todo, view, isPrintTodo) {
  if (view === "未处理") return !todo.handled;
  if (view === "今天要发") return !todo.handled && (todo.dueToday || String(todo.latest ?? "").includes("今天"));
  if (view === "异常/提醒") {
    return !todo.handled && (
      todo.referenceStatus === "missing"
      || todo.referenceStatus === "unverifiable"
      || todo.urgency === "异常"
      || ["red_dot", "follow_up"].includes(todo.reminderLevel)
      || ["unknown", "partial", "not_printed"].includes(todo.printResultStatus)
    );
  }
  if (view === "待打印") return !todo.handled && isPrintTodo(todo);
  if (view === "稍后提醒") return !todo.handled && Boolean(todo.activeSnooze);
  if (view === "已处理") return Boolean(todo.handled);
  return true;
}

function getTodoBusinessArea(todo) {
  const descriptor = [todo.type, todo.resolvedRefType, todo.refType].filter(Boolean).join(" ");
  if (/maintenance|设备|报修|巡检|维护/.test(descriptor)) return "设备";
  if (/statement|对账|收款/.test(descriptor)) return "财务";
  if (/inventory|库存|缺货/.test(descriptor)) return "库存";
  if (/fulfillment|出库|交付|快递|快运|打印|标签|数量/.test(descriptor)) return "出库";
  if (/production|生产|车间|成品图/.test(descriptor)) return "生产";
  if (/order|订单/.test(descriptor)) return "订单";
  return "其他";
}

function getTodoReferenceState(todo) {
  if (todo.referenceStatus === "missing") {
    return { label: "引用失效", shortLabel: "失效", detail: `失效：${todo.referenceReason || "目标不存在"}`, tone: "danger" };
  }
  if (todo.referenceStatus === "unverifiable") {
    return { label: "引用待核", shortLabel: "待核", detail: "暂不可校验，禁止直接跳转", tone: "warning" };
  }
  if (todo.referenceStatus === "valid") {
    return { label: "引用有效", shortLabel: "有效", detail: `有效：${todo.resolvedRefTypeLabel || "业务记录"}`, tone: "success" };
  }
  return { label: "待运行核对", shortLabel: "待核", detail: "待运行时核对", tone: "neutral" };
}

function getTodoVisibleState(todo) {
  if (todo.handled) return { label: "已处理", detail: "" };
  if (todo.referenceStatus === "missing" || todo.urgency === "异常" || todo.printResultStatus === "unknown") {
    return { label: "异常", detail: todo.reminderLevelLabel && todo.reminderLevel !== "normal" ? todo.reminderLevelLabel : "" };
  }
  if (todo.reminderLevel === "follow_up") return { label: "已转跟进", detail: "超过1天未处理" };
  if (todo.reminderLevel === "red_dot") return { label: "红点提醒", detail: "超过30分钟未处理" };
  if (todo.activeSnooze) return { label: "稍后提醒", detail: todo.reminder ? `提醒 ${todo.reminder}` : "" };
  return { label: todo.urgency || "普通", detail: "" };
}
