import { useEffect, useState } from "react";
import { SearchOutlined, UploadOutlined } from "@ant-design/icons";
import {
  DataState,
  DataTable,
  DetailPane,
  FilterBar,
  InfoGrid,
  MetricStrip,
  OperationalPanel,
  PanelHeader,
  Segmented,
  StatusPill,
} from "../../shared/ui/operational.jsx";

const masterDataMaintenanceTabs = ["客户档案", "价格表", "规格库存", "员工机台"];
const MASTER_DATA_DETAIL_TABS = ["维护", "关联草稿", "复核规则"];
const DEFAULT_WORKSHOPS = ["1号车间", "2号车间", "3号车间"];

export function MasterDataMaintenancePage({
  customers = [],
  orderLines = [],
  inventoryRecords = [],
  statements = [],
  employeeAccountReviews = [],
  employeeAccountReadiness = null,
  employeeAssignmentOptions = null,
  importReviewDrafts = [],
  importExecutions = [],
  maintenanceDrafts = [],
  selectedTab,
  setSelectedTab,
  selectedId,
  setSelectedId,
  onSaveDraft,
  onUpdateEmployeeAssignment,
  onOpenImportTemplate,
  helpers,
}) {
  const {
    availableQty,
    formatStockKey,
    getLineColorSpecLabel,
    getLinePrintSide,
    getLineRemark,
    getStockStateGroup,
    getStockStateTone,
    getStockTrustLabel,
    getUiActionState,
    money,
    seedUserOptions = [],
  } = helpers;
  const [keyword, setKeyword] = useState("");
  const [employeeView, setEmployeeView] = useState("正式账号");
  const [detailTab, setDetailTab] = useState("维护");
  const [draftField, setDraftField] = useState("");
  const [draftValue, setDraftValue] = useState("");
  const [draftReason, setDraftReason] = useState("日常维护，待管理复核后通过导入确认流程写入。");
  const activeTab = masterDataMaintenanceTabs.includes(selectedTab) ? selectedTab : masterDataMaintenanceTabs[0];
  const records = buildMasterDataMaintenanceRecords({
    tab: activeTab,
    customers,
    orderLines,
    inventoryRecords,
    statements,
    employeeAccountReviews,
    seedUserOptions,
    helpers: { availableQty, formatStockKey, getLineColorSpecLabel, getLinePrintSide, getLineRemark, getStockStateGroup, getStockStateTone, getStockTrustLabel, money },
  });
  const employeeScopedRecords = activeTab === "员工机台"
    ? records.filter((record) => employeeView === "正式账号" ? record.sourceType === "formal" : record.sourceType === "seed")
    : records;
  const visibleRecords = filterMasterDataMaintenanceRecords(employeeScopedRecords, keyword);
  const selected = visibleRecords.find((item) => item.id === selectedId) ?? visibleRecords[0] ?? null;
  const selectedField = selected?.fields.find((field) => field.key === draftField) ?? selected?.fields[0] ?? null;
  const draftState = getUiActionState("masterData", "生成维护草稿");
  const assignmentState = getUiActionState("masterData", "保存员工调配");
  const relatedDrafts = maintenanceDrafts
    .filter((draft) => draft.tab === activeTab && (!selected?.id || draft.recordId === selected.id))
    .slice(0, 4);
  const tabDrafts = maintenanceDrafts.filter((draft) => draft.tab === activeTab);
  const blockedExecutions = importExecutions.filter((execution) => String(execution.status ?? "").includes("failed") || String(execution.statusLabel ?? "").includes("失败"));
  const employeeReviewPending = employeeAccountReviews.filter(
    (review) => !review.accountEnabled || ["temporary_password_issued", "password_expired"].includes(review.passwordStatus),
  ).length;
  const stats = [
    ["当前资料", employeeScopedRecords.length, "blue"],
    ["维护草稿", tabDrafts.length, tabDrafts.length ? "warning" : "success"],
    ["导入草稿", importReviewDrafts.length, importReviewDrafts.length ? "blue" : "success"],
    ["待复核", employeeReviewPending + blockedExecutions.length, employeeReviewPending + blockedExecutions.length ? "warning" : "success"],
  ];

  useEffect(() => {
    if (!selected) return;
    if (selected.id !== selectedId) setSelectedId(selected.id);
    const firstField = selected.fields[0];
    if (!selected.fields.some((field) => field.key === draftField)) {
      setDraftField(firstField?.key ?? "");
      setDraftValue(String(firstField?.currentValue ?? ""));
    }
  }, [selected?.id, activeTab]);

  function changeTab(tab) {
    setSelectedTab(tab);
    setKeyword("");
    setDetailTab("维护");
  }

  function changeDraftField(fieldKey) {
    setDraftField(fieldKey);
    const field = selected?.fields.find((item) => item.key === fieldKey);
    setDraftValue(String(field?.currentValue ?? ""));
  }

  function saveDraft() {
    if (!selected || !selectedField) return;
    onSaveDraft?.({
      tab: activeTab,
      recordId: selected.id,
      recordLabel: selected.label,
      field: selectedField.key,
      fieldLabel: selectedField.label,
      nextValue: draftValue,
      reason: draftReason,
    });
  }

  return (
    <section className="page-grid split-detail operational-split-workbench master-data-maintenance-page master-data-workbench">
      <OperationalPanel className="table-pane master-data-list-panel" ariaLabel="基础资料列表">
        <PanelHeader
          title="基础资料维护"
          summary="维护草稿不直接写库，复核后继续走导入确认计划和正式导入。"
          actions={(
            <div className="master-data-panel-actions">
              <Segmented ariaLabel="基础资料类型" value={activeTab} onChange={changeTab} items={masterDataMaintenanceTabs} />
              <button className="ghost-button" onClick={() => onOpenImportTemplate?.(activeTab)}>
                <UploadOutlined /> 导入模板
              </button>
            </div>
          )}
        />
        <FilterBar
          className="master-data-filter-bar"
          ariaLabel="基础资料搜索"
          summary={`命中 ${visibleRecords.length} / ${employeeScopedRecords.length} 条；最近导入草稿 ${importReviewDrafts.length} 条，执行记录 ${importExecutions.length} 条。`}
          secondarySummary={activeTab === "员工机台" ? `正式 ${employeeAccountReviews.length} · seed ${seedUserOptions.length}` : `${activeTab} · 独立维护入口`}
          actions={(
            <div className="master-data-filter-actions">
              {activeTab === "员工机台" ? <Segmented ariaLabel="员工账号来源" value={employeeView} onChange={setEmployeeView} items={["正式账号", "seed演示"]} /> : null}
              <button className="ghost-button" onClick={() => setKeyword("")}>重置</button>
            </div>
          )}
        >
          <label className="search small">
            <SearchOutlined />
            <input placeholder="搜索名称 / 尺寸 / 颜色 / 手机 / 单号" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          </label>
        </FilterBar>
        <MetricStrip items={stats} ariaLabel="基础资料状态摘要" />
        {activeTab === "员工机台" ? <EmployeeRoleReadiness readiness={employeeAccountReadiness} /> : null}
        {visibleRecords.length ? (
          <DataTable
            className={`master-data-maintenance-table ${getMasterDataMaintenanceTableClass(activeTab)}`}
            columns={getMasterDataMaintenanceColumns(activeTab)}
            rows={visibleRecords.map((record) => ({
              id: record.id,
              active: record.id === selected?.id,
              tone: record.tone,
              onClick: () => setSelectedId(record.id),
              cells: record.cells,
            }))}
          />
        ) : (
          <DataState
            title={activeTab === "员工机台" && employeeView === "正式账号" ? "尚未导入正式员工账号" : "当前没有匹配的基础资料"}
            detail={activeTab === "员工机台" && employeeView === "正式账号" ? "使用员工机台导入模板，复核岗位、权限和默认机台后再启用账号。" : "保留当前筛选条件，调整关键字后重试。"}
            compact
          />
        )}
      </OperationalPanel>
      <DetailPane className="master-data-detail-pane" title={selected?.label ?? "基础资料"} subtitle={selected ? `${activeTab} · ${selected.statusLabel}` : "未选择"}>
        {selected ? (
          <>
            <InfoGrid rows={selected.detailRows} />
            <div className="operational-detail-tabs">
              <Segmented ariaLabel="基础资料详情视图" value={detailTab} onChange={setDetailTab} items={MASTER_DATA_DETAIL_TABS} />
            </div>
            <section className="detail-section operational-detail-section-first" hidden={detailTab !== "维护"}>
              {activeTab === "员工机台" ? (
                selected.sourceType === "formal" ? (
                  <EmployeeAssignmentEditor
                    review={selected.employeeReview}
                    options={employeeAssignmentOptions}
                    actionState={assignmentState}
                    onSave={onUpdateEmployeeAssignment}
                  />
                ) : (
                  <DataState title="seed演示账号不可调配" detail="请切换到正式账号后维护车间和机台。" compact />
                )
              ) : (
                <>
                  <h3>维护草稿</h3>
                  <div className="detail-form">
                <label>
                  <span>维护字段</span>
                  <select value={draftField} onChange={(event) => changeDraftField(event.target.value)}>
                    {selected.fields.map((field) => (
                      <option key={field.key} value={field.key}>{field.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>当前值</span>
                  <input value={String(selectedField?.currentValue ?? "")} readOnly />
                </label>
                <label>
                  <span>建议改为</span>
                  <input value={draftValue} onChange={(event) => setDraftValue(event.target.value)} />
                </label>
                <label>
                  <span>原因 / 备注</span>
                  <textarea rows={3} value={draftReason} onChange={(event) => setDraftReason(event.target.value)} />
                </label>
                  </div>
                  <div className="action-row master-data-maintenance-actions operational-detail-actions">
                    <button className="primary-action" disabled={draftState.disabled} title={draftState.title} onClick={saveDraft}>保存维护草稿</button>
                    <button onClick={() => onOpenImportTemplate?.(activeTab)}>打开导入模板</button>
                  </div>
                </>
              )}
            </section>
            <section className="detail-section operational-detail-section-first" hidden={detailTab !== "关联草稿"}>
              <h3>关联草稿</h3>
              {relatedDrafts.length ? (
                <div className="master-data-maintenance-drafts">
                  {relatedDrafts.map((draft) => (
                    <div className="master-data-maintenance-draft" key={draft.draftId}>
                      <StatusPill tone="warning">{draft.status}</StatusPill>
                      <strong>{draft.draftId} · {draft.fieldLabel}</strong>
                      <span>{draft.nextValue || "待补值"} / {draft.createdBy} / {formatMasterDataMaintenanceTime(draft.createdAt)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <DataState title="该记录暂无维护草稿" detail="需要批量更新时优先使用导入模板。" compact />
              )}
            </section>
            <section className="detail-section operational-detail-section-first" hidden={detailTab !== "复核规则"}>
              <h3>复核边界</h3>
              <p>{selected.reviewRule}</p>
            </section>
          </>
        ) : (
          <DataState title="当前没有匹配的基础资料" detail="保留当前筛选条件，调整关键字后重试。" compact />
        )}
      </DetailPane>
    </section>
  );
}

function EmployeeRoleReadiness({ readiness }) {
  if (!readiness) {
    return <DataState title="岗位就绪状态待刷新" detail="刷新员工账号复核后显示正式八岗位覆盖和阻塞原因。" compact />;
  }
  return (
    <section className={`master-data-role-readiness ${readiness.ready ? "ready" : "blocked"}`} aria-label="正式员工岗位上线就绪">
      <header>
        <div>
          <strong>正式员工岗位上线就绪</strong>
          <span>{readiness.coveredRoleCount}/{readiness.requiredRoleCount} 岗位 · 可用账号 {readiness.readyFormalAccountCount}/{readiness.formalAccountCount}</span>
        </div>
        <StatusPill tone={readiness.ready ? "success" : "danger"}>{readiness.ready ? "可放行" : `缺 ${readiness.missingRoleCount} 岗位`}</StatusPill>
      </header>
      <div className="master-data-role-readiness-grid" role="list">
        {readiness.roles.map((role) => (
          <article className={role.ready ? "ready" : "blocked"} role="listitem" key={role.roleKey}>
            <div><strong>{role.roleLabel}</strong><span>{role.readyAccountCount}/{role.accountCount} 可用</span></div>
            <small>{role.ready ? "账号、改密、有效期和绑定门禁通过" : formatRoleBlockers(role)}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function EmployeeAssignmentEditor({ review, options, actionState, onSave }) {
  const inferredMode = getEmployeeAssignmentMode(review);
  const [assignmentMode, setAssignmentMode] = useState(inferredMode);
  const [workshop, setWorkshop] = useState(review?.defaultWorkshop || "");
  const [machineId, setMachineId] = useState(review?.defaultMachineId || "");
  const [reason, setReason] = useState("现场人员调配");
  const workshops = uniqueText([...(options?.workshops ?? []), ...DEFAULT_WORKSHOPS, review?.defaultWorkshop]);
  const machines = (options?.machines ?? []).filter((machine) => machine.enabled !== false);
  const visibleMachines = machines.filter((machine) => !workshop || !machine.workshop || machine.workshop === workshop);

  useEffect(() => {
    setAssignmentMode(getEmployeeAssignmentMode(review));
    setWorkshop(review?.defaultWorkshop || "");
    setMachineId(review?.defaultMachineId || "");
    setReason("现场人员调配");
  }, [review?.employeeId]);

  function changeMode(nextMode) {
    setAssignmentMode(nextMode);
    if (nextMode !== "fixed_machine") setMachineId("");
    if (nextMode === "unassigned") setWorkshop("");
  }

  function changeWorkshop(nextWorkshop) {
    setWorkshop(nextWorkshop);
    const selectedMachine = machines.find((machine) => machine.machineId === machineId);
    if (selectedMachine?.workshop && selectedMachine.workshop !== nextWorkshop) setMachineId("");
  }

  const invalid = assignmentMode === "fixed_machine"
    ? !workshop || !machineId
    : assignmentMode === "general_worker"
      ? !workshop
      : false;

  return (
    <>
      <h3>车间 / 机台调配</h3>
      <div className="detail-form employee-assignment-form">
        <label>
          <span>工作安排</span>
          <select value={assignmentMode} onChange={(event) => changeMode(event.target.value)}>
            <option value="fixed_machine">固定机台</option>
            <option value="general_worker">杂工 / 流动</option>
            <option value="unassigned">暂未分配</option>
          </select>
        </label>
        <label>
          <span>负责车间</span>
          <select value={workshop} disabled={assignmentMode === "unassigned"} onChange={(event) => changeWorkshop(event.target.value)}>
            <option value="">请选择车间</option>
            {workshops.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>默认机台</span>
          <select value={machineId} disabled={assignmentMode !== "fixed_machine"} onChange={(event) => setMachineId(event.target.value)}>
            <option value="">请选择机台</option>
            {visibleMachines.map((machine) => (
              <option key={machine.machineId} value={machine.machineId}>{machine.machineLabel} · {machine.workshop || "车间待定"}</option>
            ))}
          </select>
        </label>
        <label>
          <span>调整原因</span>
          <textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
      </div>
      <p className="employee-assignment-boundary">
        杂工 / 流动只绑定负责车间；固定机台同时绑定车间和机台。车间报工账号未绑定机台时仍不能通过机台就绪门禁。
      </p>
      <div className="action-row master-data-maintenance-actions operational-detail-actions">
        <button
          className="primary-action"
          disabled={actionState.disabled || invalid}
          title={actionState.title || (invalid ? "请补齐当前安排所需字段" : "")}
          onClick={() => onSave?.(review, { assignmentMode, workshop, machineId, reason })}
        >
          保存调配
        </button>
      </div>
    </>
  );
}

function formatRoleBlockers(role) {
  if (!role.accountCount) return "尚未导入正式账号";
  return role.blockers.slice(0, 2).map((blocker) => `${blocker.label}${blocker.count > 1 ? `×${blocker.count}` : ""}`).join("、") || "尚无可放行账号";
}

function buildMasterDataMaintenanceRecords(input) {
  if (input.tab === "价格表") return buildMasterDataPriceRecords(input);
  if (input.tab === "规格库存") return buildMasterDataInventoryRecords(input);
  if (input.tab === "员工机台") return buildMasterDataEmployeeMachineRecords(input);
  return buildMasterDataCustomerRecords(input);
}

function buildMasterDataCustomerRecords({ customers = [], statements = [], helpers = {} }) {
  const money = helpers.money ?? ((value) => `¥${value}`);
  return customers.map((customer) => {
    const customerStatements = statements.filter((statement) => statement.customerId === customer.id);
    const pendingAmount = customerStatements.reduce((total, statement) => total + Number(statement.variance || 0), 0);
    const debt = Number(customer.debt || 0);
    const statusLabel = debt > 0 || pendingAmount > 0 ? "需财务关注" : "正常";
    return {
      id: customer.id,
      label: customer.name,
      statusLabel,
      tone: debt > 0 || pendingAmount > 0 ? "warning" : "success",
      cells: [customer.name, customer.cycle, customer.contact, customer.phone, money(debt), (customer.tags ?? []).join(" / ")],
      detailRows: [
        ["客户编号", customer.id],
        ["联系人", `${customer.contact} ${customer.phone}`],
        ["结算周期", customer.cycle],
        ["地址", customer.address],
        ["应收/欠款", `${money(customer.receivable || 0)} / ${money(debt)}`],
        ["最近对账", customer.lastStatement || "未记录"],
      ],
      fields: [
        { key: "cycle", label: "结算周期", currentValue: customer.cycle },
        { key: "contact", label: "联系人", currentValue: customer.contact },
        { key: "phone", label: "联系电话", currentValue: customer.phone },
        { key: "address", label: "地址", currentValue: customer.address },
        { key: "tags", label: "客户标签", currentValue: (customer.tags ?? []).join("，") },
      ],
      searchText: [customer.id, customer.name, customer.cycle, customer.contact, customer.phone, customer.address, ...(customer.tags ?? [])].join(" "),
      reviewRule: "客户资料影响接单、对账和欠款提醒，保存后先进入维护草稿；结算周期、收货地址和手机号变更需要办公室或管理复核。",
    };
  });
}

function buildMasterDataPriceRecords({ orderLines = [], customers = [], helpers = {} }) {
  const money = helpers.money ?? ((value) => `¥${value}`);
  const getLineColorSpecLabel = helpers.getLineColorSpecLabel ?? (() => "");
  const getLinePrintSide = helpers.getLinePrintSide ?? (() => "");
  const getLineRemark = helpers.getLineRemark ?? (() => "");
  return orderLines.map((line) => {
    const customer = customers.find((item) => item.id === line.customerId);
    const qty = Number(line.qty || line.originalQty || 0);
    const amount = Number(line.amount || 0);
    const unitPrice = qty > 0 ? amount / qty : 0;
    const printSide = getLinePrintSide(line) || (line.print === "是" ? "印刷" : "无印刷");
    const colorSpec = getLineColorSpecLabel(line) || [line.color, line.handle].filter(Boolean).join(" / ");
    const remark = getLineRemark(line);
    const label = `${line.product} ${line.size} ${colorSpec}`;
    return {
      id: `PRICE-${line.id}`,
      label,
      statusLabel: line.orderType || "订单快照",
      tone: line.orderType === "定制印刷" ? "warning" : "neutral",
      cells: [line.product, line.size, colorSpec, printSide, money(unitPrice), customer?.name ?? line.customerId, line.orderNo],
      detailRows: [
        ["来源订单", line.id],
        ["客户", customer?.name ?? line.customerId],
        ["品名/尺寸", `${line.product} / ${line.size}`],
        ["颜色/提手", colorSpec],
        ["单双面", printSide],
        ["参考单价", `${money(unitPrice)} / 个`],
      ],
      fields: [
        { key: "bagPrice", label: "袋子单价", currentValue: money(unitPrice) },
        { key: "printPrice", label: "印刷单价", currentValue: line.print === "是" ? "按订单快照复核" : "0" },
        { key: "customerScope", label: "客户范围", currentValue: customer?.name ?? "通用" },
        { key: "remark", label: "价格备注", currentValue: remark || line.orderType || "订单价格快照" },
      ],
      searchText: [line.id, line.orderNo, customer?.name, line.product, line.size, colorSpec, printSide, remark, line.orderType].join(" "),
      reviewRule: "价格资料直接影响订单金额和对账，应只保存为维护草稿；正式启用价格必须由管理复核，并通过确认计划记录价格版本。",
    };
  });
}

function buildMasterDataInventoryRecords({ inventoryRecords = [], helpers = {} }) {
  const availableQty = helpers.availableQty ?? ((item) => Number(item.inStock || 0) - Number(item.reserved || 0) - Number(item.locked || 0));
  const formatStockKey = helpers.formatStockKey ?? ((item) => [item.size, item.color, item.handle, item.style].filter(Boolean).join(" / "));
  const getStockStateGroup = helpers.getStockStateGroup ?? ((item) => item.state || "状态待确认");
  const getStockStateTone = helpers.getStockStateTone ?? (() => "neutral");
  const getStockTrustLabel = helpers.getStockTrustLabel ?? ((item) => item.estimated ? "估算/待复核" : "已清点");
  return inventoryRecords.map((stock) => {
    const stateLabel = getStockStateGroup(stock);
    const available = availableQty(stock);
    return {
      id: `STOCK-${stock.id}`,
      label: formatStockKey(stock),
      statusLabel: stateLabel,
      tone: getStockStateTone(stateLabel),
      cells: [stock.size, stock.color, stock.handle, stock.style, stock.zone, stateLabel, available],
      detailRows: [
        ["库存键", formatStockKey(stock)],
        ["库区", stock.zone],
        ["状态", stateLabel],
        ["在库/占用/锁定", `${stock.inStock} / ${stock.reserved} / ${stock.locked}`],
        ["待处理", `${stock.pending} 个`],
        ["可用/可信", `${available} / ${getStockTrustLabel(stock)}`],
      ],
      fields: [
        { key: "zone", label: "库区", currentValue: stock.zone },
        { key: "state", label: "库存状态", currentValue: stateLabel },
        { key: "safeStock", label: "安全库存", currentValue: "待设置" },
        { key: "trust", label: "可信度", currentValue: getStockTrustLabel(stock) },
      ],
      searchText: [stock.id, stock.size, stock.color, stock.handle, stock.style, stock.zone, stateLabel, getStockTrustLabel(stock)].join(" "),
      reviewRule: "规格库存主数据会影响识别匹配、可用库存和出库扣减。数量差异请走库存修正草稿；规格、库区和安全库存变更先进入基础资料维护草稿。",
    };
  });
}

function buildMasterDataEmployeeMachineRecords({ employeeAccountReviews = [], seedUserOptions = [] }) {
  const importedEmployees = employeeAccountReviews.map((review) => ({
    id: `EMP-${review.employeeId || review.userId || review.loginName}`,
    label: review.name || review.loginName || review.employeeId,
    statusLabel: review.accountEnabled ? getEmployeePasswordStatusLabel(review.passwordStatus) : "待复核启用",
    tone: review.passwordStatus === "password_revoked" ? "danger" : review.passwordStatus === "password_expired" ? "warning" : review.accountEnabled ? "success" : "warning",
    cells: [review.name || review.employeeId, review.loginName || review.userId, review.roleName || review.roleKey || "岗位待补", review.defaultWorkshop || "未分配", formatEmployeeAssignmentLabel(review), review.accountEnabled ? "已启用" : "待启用"],
    detailRows: [
      ["员工", review.name || review.employeeId],
      ["登录名", review.loginName || review.userId || "待生成"],
      ["岗位", review.roleName || review.roleKey || "岗位待补"],
      ["负责车间", review.defaultWorkshop || "未分配"],
      ["默认机台", review.defaultMachineId || "未绑定"],
      ["工作安排", formatEmployeeAssignmentLabel(review)],
      ["账号状态", review.accountEnabled ? "已启用" : "待复核启用"],
      ["密码状态", getEmployeePasswordStatusLabel(review.passwordStatus)],
    ],
    fields: [
      { key: "role", label: "岗位", currentValue: review.roleName || review.roleKey || "" },
      { key: "defaultMachineId", label: "默认机台", currentValue: review.defaultMachineId || "" },
      { key: "loginName", label: "登录名", currentValue: review.loginName || "" },
      { key: "accountEnabled", label: "账号启用", currentValue: review.accountEnabled ? "是" : "否" },
    ],
    searchText: [review.employeeId, review.name, review.loginName, review.userId, review.roleName, review.roleKey, review.defaultWorkshop, review.defaultMachineId, formatEmployeeAssignmentLabel(review)].join(" "),
    reviewRule: "员工和机台资料影响权限、车间任务可见性和报工归属。账号启用、密码发放和撤销仍必须在员工账号复核区完成。",
    sourceType: "formal",
    employeeReview: review,
  }));
  const seedEmployees = seedUserOptions.map((user) => ({
    id: `SEED-${user.userId}`,
    label: user.displayName,
    statusLabel: user.defaultMachineId ? "seed账号 / 已绑定机台" : "seed账号",
    tone: "neutral",
    cells: [user.displayName, user.userId, user.roleLabel, "演示", user.defaultMachineId || "未绑定", "seed只读"],
    detailRows: [
      ["用户 ID", user.userId],
      ["显示名", user.displayName],
      ["岗位", user.roleLabel],
      ["角色", user.defaultRole],
      ["默认机台", user.defaultMachineId || "未绑定"],
      ["来源", "本地 seed 权限"],
    ],
    fields: [
      { key: "displayName", label: "显示名", currentValue: user.displayName },
      { key: "roleLabel", label: "岗位说明", currentValue: user.roleLabel },
      { key: "defaultMachineId", label: "默认机台", currentValue: user.defaultMachineId || "" },
    ],
    searchText: [user.userId, user.displayName, user.roleLabel, user.defaultRole, user.defaultMachineId].join(" "),
    reviewRule: "seed 账号只用于原型和本地权限演示；真实员工必须通过员工机台导入和账号复核进入运行期身份仓储。",
    sourceType: "seed",
  }));
  return [...importedEmployees, ...seedEmployees];
}

function filterMasterDataMaintenanceRecords(records = [], keyword = "") {
  const query = String(keyword ?? "").trim().toLowerCase();
  if (!query) return records;
  return records.filter((record) => String(record.searchText ?? record.label ?? "").toLowerCase().includes(query));
}

function getMasterDataMaintenanceColumns(tab) {
  if (tab === "价格表") return ["品名", "尺寸", "颜色/提手", "单双面", "参考单价", "客户", "来源"];
  if (tab === "规格库存") return ["尺寸", "颜色", "提手", "款式", "库区", "状态", "可用"];
  if (tab === "员工机台") return ["员工", "账号", "岗位", "车间", "机台 / 安排", "状态"];
  return ["客户", "结算", "联系人", "电话", "欠款", "标签"];
}

function getEmployeeAssignmentMode(review = {}) {
  if (["fixed_machine", "general_worker", "unassigned"].includes(review.assignmentMode)) return review.assignmentMode;
  if (review.defaultMachineId) return "fixed_machine";
  if (review.defaultWorkshop) return "general_worker";
  return "unassigned";
}

function formatEmployeeAssignmentLabel(review = {}) {
  const mode = getEmployeeAssignmentMode(review);
  if (mode === "fixed_machine") return review.defaultMachineId || "机台待补";
  if (mode === "general_worker") return "杂工 / 流动";
  return "暂未分配";
}

function uniqueText(values = []) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function getMasterDataMaintenanceTableClass(tab) {
  if (tab === "价格表") return "price";
  if (tab === "规格库存") return "stock";
  if (tab === "员工机台") return "employee";
  return "customer";
}

function getEmployeePasswordStatusLabel(status = "") {
  const labels = {
    temporary_password_issued: "临时密码待改密",
    active: "正式密码已生效",
    password_expired: "密码已过期待改密",
    password_revoked: "密码已撤销",
  };
  return labels[status] || status || "密码待发放";
}

function formatMasterDataMaintenanceTime(value) {
  if (!value) return "时间待确认";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待确认";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
