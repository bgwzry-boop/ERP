import { useState } from "react";
import {
  AccountBookOutlined,
  AppstoreOutlined,
  BellOutlined,
  CheckCircleOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DownOutlined,
  InboxOutlined,
  MenuFoldOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  SyncOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  customers,
  initialFulfillments,
  initialInventories,
  initialOrderLines,
  initialStatements,
  initialTodos,
  makeFulfillment,
  makeOrderLine,
  makeTodo,
  sampleText,
} from "./data/fixtures.js";
import { enrichDraftRow, parseOrderText } from "./lib/orderParser.js";

const pages = [
  { key: "todos", label: "公共待办", icon: DashboardOutlined },
  { key: "entry", label: "订单录入", icon: PlusOutlined },
  { key: "orders", label: "订单池", icon: ShoppingCartOutlined },
  { key: "inventory", label: "库存查询", icon: DatabaseOutlined },
  { key: "fulfillment", label: "出库交付", icon: InboxOutlined },
  { key: "statements", label: "对账收款", icon: AccountBookOutlined },
];

const laterPages = [
  { label: "排产", icon: AppstoreOutlined },
  { label: "打包/标签", icon: UnorderedListOutlined },
  { label: "客户", icon: UserOutlined },
  { label: "价格表", icon: SettingOutlined },
  { label: "车间手机端", icon: AppstoreOutlined },
  { label: "司机端", icon: CheckCircleOutlined },
];

const money = (value) => `¥${Number(value).toLocaleString("zh-CN", { minimumFractionDigits: value % 1 ? 1 : 0, maximumFractionDigits: 1 })}`;

function findCustomer(id) {
  return customers.find((item) => item.id === id) ?? customers[0];
}

function findCustomerByName(name) {
  return customers.find((item) => item.name === name);
}

function findOrderLine(orderLines, id) {
  return orderLines.find((item) => item.id === id);
}

function availableQty(stock) {
  return stock.inStock - stock.reserved - stock.locked - stock.pending;
}

function statusTone(status) {
  if (status.includes("缺货") || status.includes("异常") || status.includes("差异") || status.includes("不足") || status.includes("无法")) return "danger";
  if (status.includes("待") || status.includes("确认") || status.includes("备货") || status.includes("打印")) return "warning";
  if (status.includes("已") || status.includes("有货") || status.includes("可用")) return "success";
  return "neutral";
}

function nextId(prefix, length) {
  return `${prefix}${String(length + 1).padStart(3, "0")}`;
}

function findStockForDraft(row, inventoryRecords) {
  return inventoryRecords.find(
    (item) =>
      item.size === row.size &&
      item.color === row.color &&
      item.handle === row.handle &&
      item.style === row.style &&
      !item.state.includes("待处理"),
  );
}

function getDraftBlockingRows(rows) {
  return rows.filter((row) => !row.customerId || row.size === "待确认" || row.color === "待确认" || !row.qty);
}

function getDraftOrderType(row) {
  if (row.product.includes("同行")) return "外加工印刷";
  if (row.print === "是") return row.product.includes("喜") || row.product.includes("福") ? "印刷通货" : "定制印刷";
  return row.inventory.startsWith("缺货") ? "现货缺货" : "现货有货";
}

function getDraftStatus(row) {
  if (row.inventory.startsWith("缺货")) return "缺货待处理";
  if (row.print === "是" && !row.product.includes("喜") && !row.product.includes("福")) return "待排产";
  if (row.inventory === "需复核" || row.latest === "待确认") return "待确认";
  return "待出库";
}

export function App() {
  const [activePage, setActivePage] = useState("todos");
  const [toast, setToast] = useState("P0 原型已载入：6 个办公室核心页使用本地假数据模拟。");
  const [todos, setTodos] = useState(initialTodos);
  const [selectedTodoId, setSelectedTodoId] = useState(initialTodos[0].id);
  const [orderLines, setOrderLines] = useState(initialOrderLines);
  const [inventoryRecords, setInventoryRecords] = useState(initialInventories);
  const [entryText, setEntryText] = useState(sampleText);
  const [draftRows, setDraftRows] = useState(() => parseOrderText(sampleText, { customers, inventories: initialInventories }));
  const [selectedDraftId, setSelectedDraftId] = useState("DRAFT-1-1");
  const [orderFilter, setOrderFilter] = useState("全部");
  const [selectedOrderId, setSelectedOrderId] = useState(initialOrderLines[0].id);
  const [selectedStockId, setSelectedStockId] = useState(initialInventories[0].id);
  const [fulfillmentTab, setFulfillmentTab] = useState("全部");
  const [fulfillments, setFulfillments] = useState(initialFulfillments);
  const [selectedFulfillmentId, setSelectedFulfillmentId] = useState(initialFulfillments[0].id);
  const [statements, setStatements] = useState(initialStatements);
  const [selectedStatementId, setSelectedStatementId] = useState(initialStatements[0].id);
  const [modal, setModal] = useState(null);

  const activeMeta = pages.find((item) => item.key === activePage) ?? pages[0];
  const unhandledTodos = todos.filter((item) => !item.handled).length;

  function addTodo(input) {
    const id = input.id ?? `T-P0-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
    const todo = makeTodo({ id, wait: "刚刚", ...input });
    setTodos((current) => [todo, ...current]);
    setSelectedTodoId(id);
  }

  function handleTodo(action) {
    if (action === "handled") {
      setTodos((current) => current.map((item) => (item.id === selectedTodoId ? { ...item, handled: true, handledBy: "办公室A" } : item)));
      const nextOpen = todos.find((item) => item.id !== selectedTodoId && !item.handled);
      if (nextOpen) setSelectedTodoId(nextOpen.id);
      setToast("已记录实际处理人：办公室A，事项进入今日已处理。");
      return;
    }
    setToast(action === "snooze" ? "已生成稍后提醒，不影响订单继续流转。" : `${action} 已模拟执行。`);
  }

  function recognize() {
    const rows = parseOrderText(entryText, { customers, inventories: inventoryRecords });
    setDraftRows(rows);
    setSelectedDraftId(rows[0]?.id ?? "");
    setToast(`已识别 ${rows.length} 行明细；库存与价格为识别时快照，保存正式订单前会重新校验。`);
  }

  function updateDraftField(id, field, value) {
    setDraftRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, [field]: field === "qty" ? Number(value || 0) : value };
        if (field === "customerId") {
          const customer = findCustomer(value);
          next.customer = customer.name;
        }
        return enrichDraftRow(next, inventoryRecords);
      }),
    );
  }

  function entryAction(label) {
    if (label === "保存草稿") {
      const first = draftRows[0];
      const customerId = first?.customerId || "C001";
      addTodo({
        type: "订单草稿待确认",
        customerId,
        ref: "DRAFT-P0",
        summary: `${draftRows.length} 行识别结果待人工确认`,
        latest: first?.latest ?? "待确认",
        urgency: "普通",
        impact: "草稿未生成正式订单",
      });
      setToast("草稿已进入公共待办池，未占用库存。");
      return;
    }

    if (label !== "保存并确认") {
      setToast(`${label} 已模拟完成，本地原型不会写入真实数据库。`);
      return;
    }

    const blockingRows = getDraftBlockingRows(draftRows);
    if (!draftRows.length) {
      setToast("没有可保存的识别明细，请先输入订单并点击识别。");
      return;
    }
    if (blockingRows.length) {
      setToast(`有 ${blockingRows.length} 行缺客户、尺寸、颜色或数量，需补齐后才能生成正式订单。`);
      setSelectedDraftId(blockingRows[0].id);
      return;
    }

    const orderNo = `ORD-P0-${String(orderLines.length + 1).padStart(3, "0")}`;
    const newLines = draftRows.map((row, index) =>
      makeOrderLine({
        orderNo,
        lineNo: String(index + 1).padStart(2, "0"),
        customerId: row.customerId || findCustomerByName(row.customer)?.id || "C001",
        product: row.product,
        size: row.size,
        color: row.color,
        handle: row.handle,
        style: row.style,
        print: row.print,
        qty: row.qty,
        orderType: getDraftOrderType(row),
        status: getDraftStatus(row),
        fulfillment: row.fulfillment,
        latest: row.latest,
        amount: row.amount,
        exceptions: row.inventory.startsWith("缺货") ? ["库存不足"] : row.inventory === "需复核" ? ["库存需复核"] : [],
        inventory: row.inventory,
      }),
    );

    const newFulfillments = newLines
      .filter((line) => line.print === "否" && !line.status.includes("缺货") && line.fulfillment !== "待确认")
      .map((line, index) =>
        makeFulfillment({
          id: nextId("F", fulfillments.length + index),
          method: line.fulfillment,
          customerId: line.customerId,
          lineId: line.id,
          goods: `${line.size} ${line.color} ${line.product}`,
          qty: line.qty,
          packages: line.qty >= 1000 ? "3包" : line.qty >= 500 ? "2包" : "1件散装",
          status: line.fulfillment === "快递快运" ? "待打印标签" : "待出库",
          latest: line.latest,
          zone: "按库存推荐",
          source: "正式订单占用",
        }),
      );

    setOrderLines((current) => [...newLines, ...current]);
    setFulfillments((current) => [...newFulfillments, ...current]);
    setInventoryRecords((current) =>
      current.map((stock) => {
        const reservedQty = draftRows
          .filter((row) => row.inventory === "可用")
          .filter((row) => findStockForDraft(row, current)?.id === stock.id)
          .reduce((sum, row) => sum + row.qty, 0);
        return reservedQty ? { ...stock, reserved: stock.reserved + reservedQty } : stock;
      }),
    );

    draftRows
      .filter((row) => row.inventory.startsWith("缺货"))
      .forEach((row) =>
        addTodo({
          type: "缺货待处理",
          customerId: row.customerId,
          ref: orderNo,
          summary: `${row.size} ${row.color} ${row.qty} 个缺货，需客户确认等待或改量`,
          latest: row.latest,
          urgency: "异常",
          impact: "影响出库承诺",
        }),
      );

    setSelectedOrderId(newLines[0].id);
    setActivePage("orders");
    setToast(`已生成正式订单 ${orderNo}，新增 ${newLines.length} 行；可用库存行已模拟占用，缺货行进入公共待办。`);
  }

  function updateFulfillment(action) {
    const selected = fulfillments.find((item) => item.id === selectedFulfillmentId) ?? fulfillments[0];
    if (action === "数量不符") {
      setModal({ type: "mismatch", fulfillmentId: selected.id });
      return;
    }
    if (action === "无法出库") {
      setModal({ type: "unable", fulfillmentId: selected.id });
      return;
    }
    if (action === "打印预览") {
      setModal({ type: "print", fulfillmentId: selected.id });
      return;
    }
    if (action === "确认已拉走" && selected.method !== "快递快运") {
      setToast("确认已拉走只用于快递/快运；自提和送货用完成出库/交付。");
      return;
    }

    setFulfillments((current) =>
      current.map((item) => {
        if (item.id !== selectedFulfillmentId) return item;
        if (action === "标记已备货") return { ...item, status: "已备货" };
        if (action === "完成出库/交付") return { ...item, status: "已交付", printed: true };
        if (action === "确认已拉走") return { ...item, status: "已交付", pickedAt: "可回填昨晚", printed: true };
        return item;
      }),
    );
    setToast(`${action} 已模拟记录，操作人：办公室A。`);
  }

  function statementAction(action) {
    const selected = statements.find((item) => item.id === selectedStatementId) ?? statements[0];
    if (action === "生成对账单预览") {
      setModal({ type: "statementPreview", statementId: selected.id });
      return;
    }
    if (action === "登记实收") {
      setModal({ type: "payment", statementId: selected.id });
      return;
    }
    if (action === "标记已发送") {
      setStatements((current) => current.map((item) => (item.id === selected.id ? { ...item, sent: true, status: "已发送待回款", sentAt: "今天 10:30" } : item)));
      setToast("已记录对账发送渠道、发送人和发送时间。");
      return;
    }
    if (action === "差额待确认") {
      setStatements((current) => current.map((item) => (item.id === selected.id ? { ...item, status: "差额待确认" } : item)));
      addTodo({
        type: "收款差额待确认",
        customerId: selected.customerId,
        ref: selected.id,
        summary: `${findCustomer(selected.customerId).name} 对账差额 ${money(selected.variance || findCustomer(selected.customerId).debt)}`,
        latest: "本期",
        urgency: "异常",
        impact: "影响核销和欠款",
      });
      setToast("已进入差额待确认，不能自动抹零。");
      return;
    }
    if (action === "确认核销") {
      if (selected.receivable > selected.received && selected.variance > 0) {
        setToast("当前仍有差额，需先选择未收差额、抹零、账单有误或多笔付款待齐。");
        return;
      }
      setStatements((current) => current.map((item) => (item.id === selected.id ? { ...item, status: "已核销", variance: 0 } : item)));
      setToast("已确认核销，记录收款确认权限账号：办公室A。");
      return;
    }
    setToast(`${action} 已模拟完成；正式 Excel 样式等拿到模板后适配。`);
  }

  function confirmModal(payload) {
    const activeModal = modal;
    setModal(null);
    if (!activeModal) return;

    if (activeModal.type === "mismatch" || activeModal.type === "unable") {
      const selected = fulfillments.find((item) => item.id === activeModal.fulfillmentId);
      if (!selected) return;
      const nextStatus = activeModal.type === "mismatch" ? "数量差异待处理" : "无法出库";
      setFulfillments((current) => current.map((item) => (item.id === selected.id ? { ...item, status: nextStatus, exceptionReason: payload.reason, actualQty: payload.actualQty } : item)));
      addTodo({
        type: activeModal.type === "mismatch" ? "数量差异待处理" : "无法出库待处理",
        customerId: selected.customerId,
        ref: selected.lineId,
        summary: `${selected.goods} 应出 ${selected.qty}，实际 ${payload.actualQty || 0}；${payload.reason}`,
        latest: selected.latest,
        urgency: "异常",
        impact: "需办公室决定客户沟通、改单或重打单据",
      });
      setToast(`${nextStatus} 已提交，生成办公室公共待办并保留原因。`);
      return;
    }

    if (activeModal.type === "print") {
      setFulfillments((current) =>
        current.map((item) => {
          if (item.id !== activeModal.fulfillmentId) return item;
          const nextStatus = item.status === "待打印标签" && item.method === "快递快运" ? "待确认拉走" : item.status;
          return { ...item, printed: true, status: nextStatus, printBatch: "PB-P0-001" };
        }),
      );
      setToast("已模拟打印成功；若包裹数变更，旧标签需作废重打。");
      return;
    }

    if (activeModal.type === "payment") {
      const amount = Number(payload.amount || 0);
      const selected = statements.find((item) => item.id === activeModal.statementId);
      if (!selected) return;
      const variance = Math.max(0, selected.receivable - amount);
      setStatements((current) =>
        current.map((item) =>
          item.id === selected.id
            ? {
                ...item,
                received: amount,
                variance,
                status: variance > 0 ? "差额待确认" : "收款待确认",
                paymentNote: payload.reason,
              }
            : item,
        ),
      );
      if (variance > 0) {
        addTodo({
          type: "收款差额待确认",
          customerId: selected.customerId,
          ref: selected.id,
          summary: `应收 ${money(selected.receivable)}，实收 ${money(amount)}，差额 ${money(variance)}`,
          latest: "本期",
          urgency: "异常",
          impact: "需确认未收差额、抹零、账单有误或多笔付款待齐",
        });
      }
      setToast(variance > 0 ? "已登记实收金额，少付进入差额待确认。" : "已登记实收金额，等待有收款确认权限账号核销。");
      return;
    }

    if (activeModal.type === "statementPreview") {
      setToast("对账单预览已确认；导出仍是 P0 占位。");
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">ERP</div>
          <div>
            <strong>设计中心小工厂</strong>
            <span>P0 办公室端</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="主导航">
          {pages.map(({ key, label, icon: Icon }) => (
            <button className={activePage === key ? "nav-item active" : "nav-item"} key={key} onClick={() => setActivePage(key)}>
              <Icon />
              <span>{label}</span>
              {key === "todos" && <b className="nav-badge">{unhandledTodos}</b>}
            </button>
          ))}
          <div className="nav-divider">后续模块</div>
          {laterPages.map(({ label, icon: Icon }) => (
            <button className="nav-item disabled" key={label} onClick={() => setToast(`${label} 是后续模块，P0 只做占位。`)}>
              <Icon />
              <span>{label}</span>
              <RightOutlined className="nav-caret" />
            </button>
          ))}
        </nav>
        <button className="collapse-menu">
          <MenuFoldOutlined />
          收起菜单
        </button>
      </aside>

      <div className="workspace">
        <Topbar onNavigate={setActivePage} todoCount={unhandledTodos} />
        <main className="content">
          <PageHead page={activeMeta} onRefresh={() => setToast(`${activeMeta.label} 已刷新本地假数据。`)} />
          {activePage === "todos" && <TodoPage todos={todos} selectedTodoId={selectedTodoId} onSelect={setSelectedTodoId} onAction={handleTodo} />}
          {activePage === "entry" && (
            <EntryPage
              entryText={entryText}
              setEntryText={setEntryText}
              draftRows={draftRows}
              selectedDraftId={selectedDraftId}
              setSelectedDraftId={setSelectedDraftId}
              onRecognize={recognize}
              onDraftFieldChange={updateDraftField}
              onAction={entryAction}
            />
          )}
          {activePage === "orders" && (
            <OrderPoolPage
              orderLines={orderLines}
              selectedOrderId={selectedOrderId}
              setSelectedOrderId={setSelectedOrderId}
              filter={orderFilter}
              setFilter={setOrderFilter}
              setToast={setToast}
            />
          )}
          {activePage === "inventory" && <InventoryPage inventoryRecords={inventoryRecords} selectedStockId={selectedStockId} setSelectedStockId={setSelectedStockId} setToast={setToast} />}
          {activePage === "fulfillment" && (
            <FulfillmentPage
              tab={fulfillmentTab}
              setTab={setFulfillmentTab}
              fulfillments={fulfillments}
              selectedId={selectedFulfillmentId}
              setSelectedId={setSelectedFulfillmentId}
              onAction={updateFulfillment}
            />
          )}
          {activePage === "statements" && (
            <StatementPage
              statements={statements}
              orderLines={orderLines}
              selectedId={selectedStatementId}
              setSelectedId={setSelectedStatementId}
              onAction={statementAction}
            />
          )}
          <div className="toast" role="status">{toast}</div>
        </main>
      </div>

      {modal && <ActionModal modal={modal} fulfillments={fulfillments} statements={statements} orderLines={orderLines} onClose={() => setModal(null)} onConfirm={confirmModal} />}
    </div>
  );
}

function Topbar({ onNavigate, todoCount }) {
  return (
    <header className="topbar">
      <div className="factory-switcher">
        虎门工厂
        <DownOutlined />
      </div>
      <label className="search">
        <SearchOutlined />
        <input placeholder="搜索客户 / 订单 / 尺寸 / 颜色 / 单据" />
      </label>
      <div className="sync-status">
        <span className="dot" />
        本地模拟
      </div>
      <span className="last-sync">当前：2026-06-29 10:30</span>
      <button className="primary-button" onClick={() => onNavigate("entry")}>
        <PlusOutlined />
        新建订单
      </button>
      <button className="icon-button has-badge" aria-label={`通知 ${todoCount}`} data-count={todoCount}>
        <BellOutlined />
      </button>
      <button className="icon-button" aria-label="用户">
        <UserOutlined />
      </button>
      <div className="user-block">
        <strong>办公室A</strong>
        <span>录单 / 对账</span>
      </div>
    </header>
  );
}

function PageHead({ page, onRefresh }) {
  const subtitles = {
    todos: "共享待办池，按急单、异常、最晚要货和等待时长排序。",
    entry: "整段粘贴或手动输入客户消息，规则识别后在表格里修正。",
    orders: "按订单明细查询状态、库存、生产、交付、对账和操作记录。",
    inventory: "按尺寸/颜色/提手/款式/库区/状态精确查询可用库存。",
    fulfillment: "统一处理自提、送货、快递快运的出库和交付确认。",
    statements: "按客户生成对账、登记实收、处理差额和欠款。",
  };

  return (
    <section className="page-head">
      <div>
        <h1>{page.label}</h1>
        <p>{subtitles[page.key]}</p>
      </div>
      <div className="head-actions">
        <button className="ghost-button" onClick={onRefresh}>
          <ReloadOutlined />
          刷新
        </button>
        <button className="ghost-button">
          <SyncOutlined />
          本地演示
        </button>
      </div>
    </section>
  );
}

function TodoPage({ todos, selectedTodoId, onSelect, onAction }) {
  const openTodos = todos.filter((item) => !item.handled);
  const selected = todos.find((item) => item.id === selectedTodoId) ?? openTodos[0] ?? todos[0];
  const customerInfo = findCustomer(selected.customerId);
  const stats = [
    ["未处理", openTodos.length, "warning"],
    ["今天要发", openTodos.filter((item) => item.latest.includes("今天")).length, "blue"],
    ["异常红点", openTodos.filter((item) => item.urgency === "异常").length, "danger"],
    ["已处理(今日)", todos.filter((item) => item.handled).length, "success"],
  ];

  return (
    <section className="page-grid two-col">
      <div className="list-pane">
        <MetricStrip items={stats} />
        <div className="panel-head compact">
          <h2>公共待办池</h2>
          <span>不抢单，记录实际处理人</span>
        </div>
        <div className="todo-list">
          {todos.map((item) => {
            const customer = findCustomer(item.customerId);
            return (
              <button className={`${item.id === selected.id ? "todo-row active" : "todo-row"} ${item.handled ? "handled" : ""}`} key={item.id} onClick={() => onSelect(item.id)}>
                <div className="todo-main">
                  <strong>{item.type}</strong>
                  <span>{customer.name} · {item.ref}</span>
                  <small>{item.summary}</small>
                </div>
                <div className="todo-side">
                  <StatusPill tone={item.handled ? "success" : item.urgency === "异常" ? "danger" : item.urgency === "急" || item.urgency === "今天" ? "warning" : "neutral"}>
                    {item.handled ? "已处理" : item.urgency}
                  </StatusPill>
                  <em>{item.handledBy ? item.handledBy : item.wait}</em>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <DetailPane title={selected.type} subtitle={`${customerInfo.name} · ${selected.ref}`}>
        <InfoGrid
          rows={[
            ["客户", customerInfo.name],
            ["联系人", `${customerInfo.contact} ${customerInfo.phone}`],
            ["最晚时间", selected.latest],
            ["等待时长", selected.wait],
            ["影响", selected.impact],
            ["办公室备注", "按客户沟通结果处理，关键动作写操作记录"],
          ]}
        />
        <section className="detail-section">
          <h3>摘要</h3>
          <p>{selected.summary}</p>
        </section>
        <section className="detail-section">
          <h3>建议动作</h3>
          <div className="action-row">
            <button className="primary-action" onClick={() => onAction("handled")}>处理完成</button>
            <button onClick={() => onAction("snooze")}>稍后提醒</button>
            <button onClick={() => onAction("打开订单")}>打开订单</button>
            <button onClick={() => onAction("打印预览")}>打印预览</button>
          </div>
        </section>
        <Timeline items={["系统创建待办", "办公室A 查看详情", selected.handled ? "已处理" : "等待人工处理"]} />
      </DetailPane>
    </section>
  );
}

function EntryPage({ entryText, setEntryText, draftRows, selectedDraftId, setSelectedDraftId, onRecognize, onDraftFieldChange, onAction }) {
  const selected = draftRows.find((item) => item.id === selectedDraftId) ?? draftRows[0];
  return (
    <section className="page-stack">
      <div className="entry-box">
        <textarea value={entryText} onChange={(event) => setEntryText(event.target.value)} />
        <div className="entry-actions">
          <button className="primary-button" onClick={onRecognize}>识别</button>
          <button onClick={() => setEntryText("")}>清空</button>
          <button onClick={() => setEntryText(sampleText)}>填入样例</button>
        </div>
      </div>
      <section className="page-grid split-detail">
        <div className="table-pane">
          <EntryDraftTable rows={draftRows} selectedId={selected?.id} onSelect={setSelectedDraftId} onChange={onDraftFieldChange} />
          <div className="footer-actions">
            {["保存草稿", "保存并确认", "拆分订单", "作废草稿"].map((item) => (
              <button className={item === "保存并确认" ? "primary-action" : ""} key={item} onClick={() => onAction(item)}>{item}</button>
            ))}
          </div>
        </div>
        <DetailPane title="识别详情" subtitle={selected?.id ?? "未选择"}>
          {selected ? (
            <>
              <InfoGrid
                rows={[
                  ["置信度", selected.confidence === "high" ? "高" : selected.confidence === "medium" ? "中，需要确认" : "低，必须补充"],
                  ["原文片段", selected.source],
                  ["印刷图/稿件", selected.print === "是" ? "待上传 / 侧栏补充" : "非印刷不需要"],
                  ["客户备注", "从原文识别，文员可补充"],
                  ["价格快照", `${money(selected.amount)}，正式保存前重算`],
                ]}
              />
              <section className="detail-section">
                <h3>缺字段检查</h3>
                <StatusPill tone={selected.confidence === "low" ? "danger" : selected.confidence === "medium" ? "warning" : "success"}>
                  {selected.confidence === "low" ? "缺少客户/尺寸/颜色/数量" : selected.confidence === "medium" ? "需确认库存/时间/缺货" : "可保存确认"}
                </StatusPill>
              </section>
            </>
          ) : null}
        </DetailPane>
      </section>
    </section>
  );
}

function EntryDraftTable({ rows, selectedId, onSelect, onChange }) {
  const columns = ["客户", "品名/印刷", "尺寸", "颜色", "提手", "款式", "印刷", "数量", "交付", "最晚", "库存", "预估"];
  return (
    <div className="data-table entry-table" style={{ "--cols": columns.length }}>
      <div className="data-row head">
        {columns.map((column) => <span key={column}>{column}</span>)}
      </div>
      {rows.map((row) => (
        <div className={`data-row entry-edit-row ${row.id === selectedId ? "active" : ""} ${row.confidence}`} key={row.id} onClick={() => onSelect(row.id)}>
          <span>
            <select value={row.customerId} onChange={(event) => onChange(row.id, "customerId", event.target.value)}>
              <option value="">待确认</option>
              {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
            </select>
          </span>
          <span><input value={row.product} onChange={(event) => onChange(row.id, "product", event.target.value)} /></span>
          <span><input value={row.size} onChange={(event) => onChange(row.id, "size", event.target.value)} /></span>
          <span><input value={row.color} onChange={(event) => onChange(row.id, "color", event.target.value)} /></span>
          <span>
            <select value={row.handle} onChange={(event) => onChange(row.id, "handle", event.target.value)}>
              <option>普通提</option>
              <option>加长提</option>
            </select>
          </span>
          <span>
            <select value={row.style} onChange={(event) => onChange(row.id, "style", event.target.value)}>
              <option>空白袋</option>
              <option>小熊袋</option>
              <option>喜</option>
              <option>福</option>
              <option>外加工</option>
            </select>
          </span>
          <span>
            <select value={row.print} onChange={(event) => onChange(row.id, "print", event.target.value)}>
              <option>否</option>
              <option>是</option>
            </select>
          </span>
          <span><input type="number" min="0" value={row.qty} onChange={(event) => onChange(row.id, "qty", event.target.value)} /></span>
          <span>
            <select value={row.fulfillment} onChange={(event) => onChange(row.id, "fulfillment", event.target.value)}>
              <option>自提</option>
              <option>送货</option>
              <option>快递快运</option>
            </select>
          </span>
          <span><input value={row.latest} onChange={(event) => onChange(row.id, "latest", event.target.value)} /></span>
          <span><StatusPill tone={statusTone(row.inventory)}>{row.inventory}</StatusPill></span>
          <span>{money(row.amount)}</span>
        </div>
      ))}
    </div>
  );
}

function OrderPoolPage({ orderLines, selectedOrderId, setSelectedOrderId, filter, setFilter, setToast }) {
  const filtered = orderLines.filter((item) => {
    if (filter === "全部") return true;
    if (filter === "异常") return item.exceptions.length > 0 || statusTone(item.status) === "danger";
    return item.status.includes(filter) || item.orderType.includes(filter) || item.fulfillment === filter;
  });
  const selected = findOrderLine(orderLines, selectedOrderId) ?? filtered[0] ?? orderLines[0];
  const customerInfo = findCustomer(selected.customerId);
  return (
    <section className="page-grid split-detail">
      <div className="table-pane">
        <div className="toolbar-line">
          <Segmented value={filter} onChange={setFilter} items={["全部", "待", "缺货", "异常", "定制印刷", "自提", "送货", "快递快运"]} />
          <span>默认：近30天未完成 + 今日完成</span>
        </div>
        <DataTable
          columns={["订单/明细", "客户", "品名", "尺寸", "颜色", "提手", "数量", "类型", "状态", "交付", "金额"]}
          rows={filtered.map((row) => ({
            id: row.id,
            active: row.id === selected.id,
            tone: statusTone(row.status),
            onClick: () => setSelectedOrderId(row.id),
            cells: [`${row.orderNo}-${row.lineNo}`, findCustomer(row.customerId).name, row.product, row.size, row.color, row.handle, row.qty, row.orderType, row.status, row.fulfillment, money(row.amount)],
          }))}
        />
      </div>
      <DetailPane title={`${selected.orderNo}-${selected.lineNo}`} subtitle={`${customerInfo.name} · ${selected.status}`}>
        <InfoGrid
          rows={[
            ["产品", `${selected.product} / ${selected.size} / ${selected.color}`],
            ["数量", `${selected.qty} 个`],
            ["交付", `${selected.fulfillment} · ${selected.latest}`],
            ["库存", selected.inventory],
            ["金额", money(selected.amount)],
            ["异常", selected.exceptions.length ? selected.exceptions.join("、") : "无"],
          ]}
        />
        <section className="detail-section">
          <h3>流转摘要</h3>
          <Timeline items={["订单确认", selected.print === "是" ? "丝印/制袋" : "查库存", selected.status, "关键修改需留痕"]} />
        </section>
        <div className="action-row">
          <button onClick={() => setToast("已复制订单摘要。")}>复制</button>
          <button onClick={() => setToast("已打开详情抽屉。")}>打开详情</button>
          <button onClick={() => setToast("草稿单可作废；正式单需走关闭流程。")}>作废草稿</button>
        </div>
      </DetailPane>
    </section>
  );
}

function InventoryPage({ inventoryRecords, selectedStockId, setSelectedStockId, setToast }) {
  const [query, setQuery] = useState("");
  const [showPending, setShowPending] = useState(false);
  const visible = inventoryRecords.filter((item) => (showPending || !item.state.includes("待处理")) && `${item.size} ${item.color} ${item.handle} ${item.style} ${item.zone}`.includes(query.trim()));
  const selected = inventoryRecords.find((item) => item.id === selectedStockId) ?? visible[0] ?? inventoryRecords[0];
  const available = availableQty(selected);
  const shortage = Math.max(0, 500 - available);
  return (
    <section className="page-grid split-detail">
      <div className="table-pane">
        <div className="toolbar-line">
          <label className="search small">
            <SearchOutlined />
            <input placeholder="尺寸 / 颜色 / 款式" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button className="ghost-button" onClick={() => setShowPending((value) => !value)}>{showPending ? "隐藏待处理" : "展开待处理"}</button>
        </div>
        <DataTable
          columns={["尺寸", "颜色", "提手", "款式", "库区/状态", "在库", "占用", "锁定", "可用", "可信度"]}
          rows={visible.map((row) => {
            const available = availableQty(row);
            return {
              id: row.id,
              active: row.id === selected.id,
              tone: available <= 0 ? "danger" : row.estimated ? "medium" : "success",
              onClick: () => setSelectedStockId(row.id),
              cells: [row.size, row.color, row.handle, row.style, `${row.zone} / ${row.state}`, row.inStock, row.reserved, row.locked, available, row.estimated ? "估算/待复核" : "已清点"],
            };
          })}
        />
      </div>
      <DetailPane title="库存明细" subtitle={`${selected.size} ${selected.color} ${selected.handle} ${selected.style}`}>
        <InfoGrid
          rows={[
            ["精确库存键", `${selected.size} + ${selected.color} + ${selected.handle} + ${selected.style} + ${selected.zone}`],
            ["在库/占用/锁定", `${selected.inStock} / ${selected.reserved} / ${selected.locked}`],
            ["可用库存", `${available} 个`],
            ["来源摘要", selected.estimated ? "估算库存 / 待复核" : selected.state],
            ["待处理", `${selected.pending} 个`],
          ]}
        />
        {shortage > 0 && (
          <section className="detail-section alert">
            <h3>缺货判断</h3>
            <p>按 500 个示例订单计算，缺口 {shortage} 个。建议生成补货建议，预计 1 卷毛料可先粗算。</p>
          </section>
        )}
        <section className="detail-section">
          <h3>参考提示</h3>
          <p>近似颜色/尺寸只作参考；不能一键替代，也不能自动生成有货话术。</p>
        </section>
        <div className="action-row">
          <button className="primary-action" onClick={() => setToast("已生成库存修正草稿，需有权限账号确认后生效。")}>发起库存修正</button>
          <button onClick={() => setToast("已复制客户话术：这款暂时缺货，可确认是否等待生产。")}>复制客户话术</button>
        </div>
      </DetailPane>
    </section>
  );
}

function FulfillmentPage({ tab, setTab, fulfillments, selectedId, setSelectedId, onAction }) {
  const filtered = fulfillments.filter((item) => tab === "全部" || item.method === tab);
  const selected = fulfillments.find((item) => item.id === selectedId) ?? filtered[0] ?? fulfillments[0];
  const customerInfo = findCustomer(selected.customerId);
  return (
    <section className="page-grid split-detail">
      <div className="table-pane">
        <div className="toolbar-line">
          <Segmented value={tab} onChange={setTab} items={["全部", "自提", "送货", "快递快运"]} />
          <span>今日要交付、未完成、异常优先</span>
        </div>
        <DataTable
          columns={["交付方式", "客户", "订单尾号", "货品摘要", "数量", "包裹", "最晚", "状态", "备注"]}
          rows={filtered.map((row) => ({
            id: row.id,
            active: row.id === selected.id,
            tone: statusTone(row.status),
            onClick: () => setSelectedId(row.id),
            cells: [row.method, findCustomer(row.customerId).name, row.lineId.slice(-5), row.goods, row.qty, row.packages, row.latest, row.status, row.status.includes("数量") || row.status.includes("无法") ? "需办公室处理" : "正常"],
          }))}
        />
      </div>
      <DetailPane title={`${selected.method} · ${selected.status}`} subtitle={`${customerInfo.name} · ${selected.lineId}`}>
        <InfoGrid
          rows={[
            ["联系人", `${customerInfo.contact} ${customerInfo.phone}`],
            ["地址", customerInfo.address],
            ["货品", selected.goods],
            ["数量/包裹", `${selected.qty} 个 / ${selected.packages}`],
            ["库存来源", `${selected.zone} / ${selected.source}`],
            ["单据状态", selected.printed ? "已打印" : "未打印/预览"],
          ]}
        />
        <section className="detail-section document-preview">
          <h3>{selected.method === "快递快运" ? "包裹标签预览" : "单据预览"}</h3>
          <p>{customerInfo.name} / {selected.goods} / {selected.qty} 个 / {selected.packages}</p>
        </section>
        <div className="action-row">
          {["标记已备货", "完成出库/交付", "数量不符", "无法出库", "打印预览", "确认已拉走"].map((item) => (
            <button className={item === "完成出库/交付" ? "primary-action" : ""} key={item} onClick={() => onAction(item)}>{item}</button>
          ))}
        </div>
      </DetailPane>
    </section>
  );
}

function StatementPage({ statements, orderLines, selectedId, setSelectedId, onAction }) {
  const selected = statements.find((item) => item.id === selectedId) ?? statements[0];
  const customerInfo = findCustomer(selected.customerId);
  const lines = selected.lineIds.map((id) => findOrderLine(orderLines, id)).filter(Boolean);
  return (
    <section className="page-grid statement-layout">
      <div className="customer-list">
        <div className="panel-head compact">
          <h2>客户对账</h2>
          <span>默认：本期待对账 / 欠款 / 收款待确认</span>
        </div>
        {statements.map((item) => {
          const customer = findCustomer(item.customerId);
          return (
            <button className={item.id === selected.id ? "customer-row active" : "customer-row"} key={item.id} onClick={() => setSelectedId(item.id)}>
              <strong>{customer.name}</strong>
              <span>{customer.cycle} · 上次 {customer.lastStatement}</span>
              <small>{money(item.receivable)} · {item.status}</small>
            </button>
          );
        })}
      </div>
      <div className="statement-main">
        <div className="statement-summary">
          <div>
            <span>客户</span>
            <strong>{customerInfo.name}</strong>
          </div>
          <div>
            <span>本期应收</span>
            <strong>{money(selected.receivable)}</strong>
          </div>
          <div>
            <span>已收</span>
            <strong>{money(selected.received)}</strong>
          </div>
          <div>
            <span>差额/欠款</span>
            <strong>{money(selected.variance || customerInfo.debt)}</strong>
          </div>
        </div>
        <DataTable
          columns={["订单明细", "产品", "尺寸/颜色", "交付", "计费数量", "原金额", "调整", "最终应收", "备注"]}
          rows={lines.map((row) => ({
            id: row.id,
            tone: row.exceptions.length ? "warning" : "neutral",
            cells: [`${row.orderNo}-${row.lineNo}`, row.product, `${row.size} ${row.color}`, row.fulfillment, row.qty, money(row.amount), row.exceptions.length ? "赠送/差异" : "0", money(row.amount), row.exceptions.join("、") || "正常"],
          }))}
        />
        <div className="statement-actions">
          {["生成对账单预览", "标记已发送", "登记实收", "差额待确认", "确认核销", "导出占位"].map((item) => (
            <button className={item === "确认核销" ? "primary-action" : ""} key={item} onClick={() => onAction(item)}>{item}</button>
          ))}
        </div>
      </div>
    </section>
  );
}

function ActionModal({ modal, fulfillments, statements, orderLines, onClose, onConfirm }) {
  const fulfillment = fulfillments.find((item) => item.id === modal.fulfillmentId);
  const statement = statements.find((item) => item.id === modal.statementId);
  const statementLines = statement ? statement.lineIds.map((id) => findOrderLine(orderLines, id)).filter(Boolean) : [];
  const [numberValue, setNumberValue] = useState(modal.type === "payment" ? String(statement?.received || statement?.receivable || 0) : String(fulfillment?.qty || 0));
  const [reason, setReason] = useState(modal.type === "payment" ? "客户少付，差额待确认" : "库存不足");
  const titleMap = {
    mismatch: "数量不符",
    unable: "无法出库",
    payment: "登记实收金额",
    print: "单据 / 标签预览",
    statementPreview: "对账单预览",
  };

  function confirm() {
    onConfirm({
      actualQty: Number(numberValue),
      amount: Number(numberValue),
      reason,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-label={titleMap[modal.type]}>
        <div className="modal-title">
          <div>
            <span>P0 模拟动作</span>
            <h2>{titleMap[modal.type]}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        {modal.type === "print" ? (
          <div className="print-sheet">
            <h3>设计中心小工厂</h3>
            <p>客户：{fulfillment ? findCustomer(fulfillment.customerId).name : "-"}　货品：{fulfillment?.goods}　数量：{fulfillment?.qty} 个</p>
            <p>此处为浏览器预览，后续对接针式打印机 / 标签机；系统记录打印批次、作废和重打。</p>
          </div>
        ) : modal.type === "statementPreview" ? (
          <div className="print-sheet">
            <h3>{statement ? findCustomer(statement.customerId).name : ""} 对账单</h3>
            <p>账期：{statement?.period}　应收：{money(statement?.receivable || 0)}　已收：{money(statement?.received || 0)}</p>
            {statementLines.map((line) => (
              <p key={line.id}>{line.orderNo}-{line.lineNo}　{line.product}　{line.qty} 个　{money(line.amount)}</p>
            ))}
          </div>
        ) : (
          <div className="form-grid">
            <label>
              {modal.type === "payment" ? "实收金额" : "实际数量"}
              <input value={numberValue} onChange={(event) => setNumberValue(event.target.value)} />
            </label>
            <label>
              原因
              <select value={reason} onChange={(event) => setReason(event.target.value)}>
                <option>库存不足</option>
                <option>找不到货</option>
                <option>颜色/尺寸不符</option>
                <option>包装/标签问题</option>
                <option>客户少付，差额待确认</option>
                <option>多笔付款待齐</option>
                <option>其他</option>
              </select>
            </label>
          </div>
        )}
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary-action" onClick={confirm}>确认模拟</button>
        </div>
      </section>
    </div>
  );
}

function MetricStrip({ items }) {
  return (
    <div className="metric-strip">
      {items.map(([label, value, tone]) => (
        <div className={`metric ${tone}`} key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function DataTable({ columns, rows }) {
  return (
    <div className="data-table" style={{ "--cols": columns.length }}>
      <div className="data-row head">
        {columns.map((column) => <span key={column}>{column}</span>)}
      </div>
      {rows.length ? (
        rows.map((row) => (
          <button className={`data-row ${row.active ? "active" : ""} ${row.tone ?? ""}`} key={row.id} onClick={row.onClick}>
            {row.cells.map((cell, index) => <span key={`${row.id}-${index}`}>{cell}</span>)}
          </button>
        ))
      ) : (
        <div className="empty-row">没有匹配记录</div>
      )}
    </div>
  );
}

function DetailPane({ title, subtitle, children }) {
  return (
    <aside className="detail-pane">
      <div className="detail-head">
        <div>
          <span>{subtitle}</span>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </aside>
  );
}

function InfoGrid({ rows }) {
  return (
    <div className="info-grid">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function Timeline({ items }) {
  return (
    <ol className="timeline">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ol>
  );
}

function StatusPill({ tone = "neutral", children }) {
  return <span className={`status ${tone}`}>{children}</span>;
}

function Segmented({ value, onChange, items }) {
  return (
    <div className="segmented">
      {items.map((item) => (
        <button className={value === item ? "selected" : ""} key={item} onClick={() => onChange(item)}>{item}</button>
      ))}
    </div>
  );
}
