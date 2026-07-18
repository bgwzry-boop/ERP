import { useEffect, useState } from "react";
import {
  DataState,
  DetailPane,
  InfoGrid,
  Segmented,
  StatusPill,
} from "../../shared/ui/operational.jsx";
import {
  buildMasterDataEmployeeReviewFilterCounts,
  buildMasterDataMaintenanceViewItems,
  filterMasterDataEmployeeReviewRecords,
  filterMasterDataMaintenanceRecords,
  getMasterDataMaintenanceColumns,
  isMasterDataEmployeeEnableCandidate,
  MASTER_DATA_EMPLOYEE_REVIEW_FILTERS,
  MASTER_DATA_MAINTENANCE_TABS,
} from "../../domain/masterDataMaintenanceListState.js";
import {
  buildMasterDataMaintenanceRecords,
  getEmployeeAssignmentMode,
} from "../../domain/masterDataMaintenanceRecords.js";
import {
  MasterDataDetailOverview,
  MasterDataMaintenanceListPane,
} from "./MasterDataMaintenanceWorkbench.jsx";
import { BusinessDecisionAuthorizationWorkbench } from "./BusinessDecisionAuthorizationWorkbench.jsx";

const MASTER_DATA_DETAIL_TABS = ["维护", "关联草稿", "复核规则"];
const EMPLOYEE_MACHINE_DETAIL_TABS = ["维护", "机台配置", "关联草稿", "复核规则"];
const ASSIGNMENT_MODE_OPTIONS = ["固定机台", "杂工 / 流动", "暂未分配"];
const ASSIGNMENT_MODE_LABELS = {
  fixed_machine: "固定机台",
  general_worker: "杂工 / 流动",
  unassigned: "暂未分配",
};
const ASSIGNMENT_MODE_VALUES = Object.fromEntries(Object.entries(ASSIGNMENT_MODE_LABELS).map(([value, label]) => [label, value]));
const MACHINE_TYPE_OPTIONS = [
  ["bag_making", "制袋机"],
  ["screen_printing", "丝印机"],
  ["cutting", "裁切机"],
  ["packing", "打包设备"],
  ["other", "其他设备"],
];
const MACHINE_STATUS_OPTIONS = [["active", "启用"], ["maintenance", "检修中"], ["inactive", "停用"]];

export function MasterDataMaintenancePage({
  authState,
  currentUser,
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
  onSaveMachine,
  onUpdateEmployeeAssignment,
  onBatchEnableEmployeeAccounts,
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
  const [employeeWorkbench, setEmployeeWorkbench] = useState("正式员工");
  const [employeeReviewFilter, setEmployeeReviewFilter] = useState(MASTER_DATA_EMPLOYEE_REVIEW_FILTERS[0]);
  const [batchSelectedEmployeeIds, setBatchSelectedEmployeeIds] = useState([]);
  const [detailTab, setDetailTab] = useState("维护");
  const [draftField, setDraftField] = useState("");
  const [draftValue, setDraftValue] = useState("");
  const [draftReason, setDraftReason] = useState("");
  const activeTab = MASTER_DATA_MAINTENANCE_TABS.includes(selectedTab) ? selectedTab : MASTER_DATA_MAINTENANCE_TABS[0];
  const viewItems = buildMasterDataMaintenanceViewItems({
    customers,
    orderLines,
    inventoryRecords,
    employeeAccountReviews,
  });
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
  const employeeReviewFilterCounts = buildMasterDataEmployeeReviewFilterCounts(records);
  const employeeReviewFilteredRecords = activeTab === "员工机台" && employeeView === "正式账号"
    ? filterMasterDataEmployeeReviewRecords(employeeScopedRecords, employeeReviewFilter)
    : employeeScopedRecords;
  const visibleRecords = filterMasterDataMaintenanceRecords(employeeReviewFilteredRecords, keyword);
  const selected = visibleRecords.find((item) => item.id === selectedId) ?? visibleRecords[0] ?? null;
  const selectedField = selected?.fields.find((field) => field.key === draftField) ?? selected?.fields[0] ?? null;
  const draftValueChanged = String(draftValue).trim() !== String(selectedField?.currentValue ?? "").trim();
  const draftReasonReady = Boolean(draftReason.trim());
  const draftState = getUiActionState("masterData", "生成维护草稿");
  const assignmentState = getUiActionState("masterData", "保存员工调配");
  const machineState = getUiActionState("masterData", "保存机台配置");
  const batchEnableState = getUiActionState("masterData", "复核启用员工账号");
  const batchEnableCandidates = activeTab === "员工机台" && employeeView === "正式账号"
    ? visibleRecords
        .filter(isMasterDataEmployeeEnableCandidate)
        .map((record) => record.employeeReview)
    : [];
  const batchEnableCandidateIdSet = new Set(batchEnableCandidates.map((review) => review.employeeId));
  const selectedBatchReviews = batchEnableCandidates.filter((review) => batchSelectedEmployeeIds.includes(review.employeeId));
  const showEmployeeBatchSelection = activeTab === "员工机台" && employeeView === "正式账号";
  const tableColumns = showEmployeeBatchSelection
    ? ["选择", ...getMasterDataMaintenanceColumns(activeTab)]
    : getMasterDataMaintenanceColumns(activeTab);
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
  const detailTabs = activeTab === "员工机台" ? EMPLOYEE_MACHINE_DETAIL_TABS : MASTER_DATA_DETAIL_TABS;
  const canManageBusinessDecisionAuthorization = authState?.permissions?.actionPermissions?.includes("business_decision.authorization.manage") === true;
  const showBusinessDecisionAuthorization = activeTab === "员工机台" && employeeWorkbench === "业务决定授权" && canManageBusinessDecisionAuthorization;

  useEffect(() => {
    if (!selected) return;
    if (selected.id !== selectedId) setSelectedId(selected.id);
    const firstField = selected.fields[0];
    if (!selected.fields.some((field) => field.key === draftField)) {
      setDraftField(firstField?.key ?? "");
      setDraftValue(String(firstField?.currentValue ?? ""));
    }
    setDraftReason("");
  }, [selected?.id, activeTab]);

  useEffect(() => {
    setBatchSelectedEmployeeIds((current) => {
      const next = current.filter((employeeId) => batchEnableCandidateIdSet.has(employeeId));
      return next.length === current.length ? current : next;
    });
  }, [activeTab, employeeView, employeeReviewFilter, keyword, employeeAccountReviews]);

  function changeTab(tab) {
    setSelectedTab(tab);
    setKeyword("");
    setEmployeeReviewFilter(MASTER_DATA_EMPLOYEE_REVIEW_FILTERS[0]);
    setDetailTab("维护");
    setBatchSelectedEmployeeIds([]);
  }

  function changeEmployeeView(nextView) {
    setEmployeeView(nextView);
    setEmployeeReviewFilter(MASTER_DATA_EMPLOYEE_REVIEW_FILTERS[0]);
    setKeyword("");
    setBatchSelectedEmployeeIds([]);
  }

  function changeEmployeeWorkbench(nextWorkbench) {
    setEmployeeWorkbench(nextWorkbench);
    if (nextWorkbench === "正式员工") {
      changeEmployeeView("正式账号");
      setEmployeeReviewFilter("全部");
    } else if (nextWorkbench === "账号准备") {
      changeEmployeeView("正式账号");
      setEmployeeReviewFilter("可启用");
    } else if (nextWorkbench === "演示数据") {
      changeEmployeeView("演示数据");
    }
  }

  function changeEmployeeReviewFilter(nextFilter) {
    setEmployeeReviewFilter(nextFilter);
    setBatchSelectedEmployeeIds([]);
  }

  function toggleBatchEmployee(employeeId, checked) {
    setBatchSelectedEmployeeIds((current) => checked
      ? [...new Set([...current, employeeId])]
      : current.filter((item) => item !== employeeId));
  }

  function toggleAllVisibleBatchEmployees(checked) {
    setBatchSelectedEmployeeIds(checked ? batchEnableCandidates.map((review) => review.employeeId) : []);
  }

  function changeDraftField(fieldKey) {
    setDraftField(fieldKey);
    const field = selected?.fields.find((item) => item.key === fieldKey);
    setDraftValue(String(field?.currentValue ?? ""));
    setDraftReason("");
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
      {activeTab === "员工机台" ? (
        <nav className="employee-master-secondary-nav" aria-label="员工与机台二级工作台">
          {["正式员工", "账号准备", ...(canManageBusinessDecisionAuthorization ? ["业务决定授权"] : []), "演示数据"].map((item) => (
            <button key={item} className={employeeWorkbench === item ? "is-active" : ""} onClick={() => changeEmployeeWorkbench(item)}>{item}</button>
          ))}
        </nav>
      ) : null}
      {showBusinessDecisionAuthorization ? (
        <BusinessDecisionAuthorizationWorkbench authState={authState} currentUser={currentUser} employeeAccountReviews={employeeAccountReviews} />
      ) : (
        <>
      <MasterDataMaintenanceListPane
        activeTab={activeTab}
        employeeAccountReadiness={employeeAccountReadiness}
        employeeScopedRecords={employeeScopedRecords}
        employeeReviewFilter={employeeReviewFilter}
        employeeReviewFilterCounts={employeeReviewFilterCounts}
        employeeView={employeeView}
        importExecutions={importExecutions}
        importReviewDrafts={importReviewDrafts}
        keyword={keyword}
        batchEnableState={batchEnableState}
        batchEnableCandidates={batchEnableCandidates}
        pendingAccountReviews={employeeAccountReviews.filter((review) => !review.accountEnabled)}
        batchSelectedEmployeeIds={batchSelectedEmployeeIds}
        selectedBatchReviews={selectedBatchReviews}
        onToggleBatchEmployee={toggleBatchEmployee}
        onToggleAllBatchEmployees={toggleAllVisibleBatchEmployees}
        onBatchEnableEmployeeAccounts={onBatchEnableEmployeeAccounts}
        onEmployeeReviewFilterChange={changeEmployeeReviewFilter}
        onEmployeeViewChange={changeEmployeeView}
        onKeywordChange={setKeyword}
        onOpenImportTemplate={onOpenImportTemplate}
        onSelect={setSelectedId}
        onTabChange={changeTab}
        selectedId={selected?.id}
        stats={stats}
        tableColumns={tableColumns}
        viewItems={viewItems}
        visibleRecords={visibleRecords}
      />
      <DetailPane className="master-data-detail-pane" title={selected?.label ?? "基础资料"} subtitle={selected ? `${activeTab} · ${selected.statusLabel}` : "未选择"}>
        {selected ? (
          <>
            <MasterDataDetailOverview activeTab={activeTab} selected={selected} />
            <div className="operational-detail-tabs master-data-detail-tabs">
              <Segmented ariaLabel="基础资料详情视图" value={detailTab} onChange={setDetailTab} items={detailTabs} />
            </div>
            <div className="master-data-detail-scroll">
              <section className="detail-section operational-detail-section-first" hidden={detailTab !== "维护"}>
                <InfoGrid rows={selected.detailRows} />
                {activeTab === "员工机台" ? (
                  selected.sourceType === "formal" ? (
                    <EmployeeAssignmentEditor
                      review={selected.employeeReview}
                      options={employeeAssignmentOptions}
                      actionState={assignmentState}
                      onSave={onUpdateEmployeeAssignment}
                    />
                  ) : (
                    <DataState title="演示账号不可调配" detail="请切换到正式账号后维护车间和机台。" compact />
                  )
                ) : (
                  <>
                    <h3 title="维护草稿不直接写库，提交后等待复核">维护草稿</h3>
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
                        <textarea
                          rows={3}
                          placeholder="填写变更原因"
                          value={draftReason}
                          onChange={(event) => setDraftReason(event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="action-row master-data-maintenance-actions operational-detail-actions">
                      <button
                        className="primary-action"
                        disabled={draftState.disabled || !draftValueChanged || !draftReasonReady}
                        title={draftState.title || (!draftValueChanged ? "修改建议值后保存" : !draftReasonReady ? "填写变更原因" : "")}
                        onClick={saveDraft}
                      >
                        保存维护草稿
                      </button>
                      <button onClick={() => onOpenImportTemplate?.(activeTab)}>打开导入模板</button>
                    </div>
                  </>
                )}
              </section>
              {activeTab === "员工机台" ? (
                <section className="detail-section operational-detail-section-first" hidden={detailTab !== "机台配置"}>
                  <MachineConfigurationEditor
                    machines={employeeAssignmentOptions?.allMachines ?? employeeAssignmentOptions?.machines ?? []}
                    actionState={machineState}
                    onSave={onSaveMachine}
                  />
                </section>
              ) : null}
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
            </div>
          </>
        ) : (
          <DataState title="当前没有匹配的基础资料" detail="保留当前筛选条件，调整关键字后重试。" compact />
        )}
      </DetailPane>
        </>
      )}
    </section>
  );
}

function EmployeeAssignmentEditor({ review, options, actionState, onSave }) {
  const inferredMode = getEmployeeAssignmentMode(review);
  const [assignmentMode, setAssignmentMode] = useState(inferredMode);
  const [workshop, setWorkshop] = useState(review?.defaultWorkshop || "");
  const [machineId, setMachineId] = useState(review?.configuredMachineId || review?.defaultMachineId || "");
  const [reason, setReason] = useState("现场人员调配");
  const workshops = uniqueText([...(options?.workshops ?? []), review?.defaultWorkshop]);
  const machines = (options?.machines ?? []).filter((machine) => machine.enabled !== false);
  const visibleMachines = machines.filter((machine) => !workshop || !machine.workshop || machine.workshop === workshop);

  useEffect(() => {
    setAssignmentMode(getEmployeeAssignmentMode(review));
    setWorkshop(review?.defaultWorkshop || "");
    setMachineId(review?.configuredMachineId || review?.defaultMachineId || "");
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
      <EmployeeAssignmentAuditSummary review={review} />
      <div className="detail-form employee-assignment-form">
        <div className="employee-assignment-mode">
          <span>工作安排</span>
          <Segmented
            ariaLabel="工作安排模式"
            value={ASSIGNMENT_MODE_LABELS[assignmentMode]}
            onChange={(label) => changeMode(ASSIGNMENT_MODE_VALUES[label])}
            items={ASSIGNMENT_MODE_OPTIONS}
          />
        </div>
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
        杂工 / 流动只绑定负责车间；固定机台同时绑定车间和机台。每次保存记录操作人、时间、原因和前后值；车间报工账号未绑定机台时仍不能通过机台就绪门禁。
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

function MachineConfigurationEditor({ machines = [], actionState, onSave }) {
  const normalizedMachines = Array.isArray(machines) ? machines : [];
  const [selectedMachineId, setSelectedMachineId] = useState(normalizedMachines[0]?.machineId ?? "");
  const [draft, setDraft] = useState(() => createMachineDraft(normalizedMachines[0]));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (draft.isNew) return;
    const selectedMachine = normalizedMachines.find((machine) => machine.machineId === selectedMachineId)
      ?? normalizedMachines[0];
    if (!selectedMachine) {
      setSelectedMachineId("");
      setDraft(createMachineDraft());
      return;
    }
    setSelectedMachineId(selectedMachine.machineId);
    setDraft(createMachineDraft(selectedMachine));
  }, [machines, selectedMachineId]);

  function selectMachine(machine) {
    setSelectedMachineId(machine.machineId);
    setDraft(createMachineDraft(machine));
  }

  function startNewMachine() {
    setSelectedMachineId("");
    setDraft(createMachineDraft(null, true));
  }

  function updateField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  const invalid = !draft.machineId.trim() || !draft.name.trim() || !draft.workshop.trim() || !draft.reason.trim();
  const assignedEmployees = Array.isArray(draft.assignedEmployees) ? draft.assignedEmployees : [];

  async function saveMachine() {
    if (invalid || isSaving) return;
    setIsSaving(true);
    try {
      const saved = await onSave?.(draft);
      if (saved?.machineId) {
        setSelectedMachineId(saved.machineId);
        setDraft(createMachineDraft(saved));
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="machine-config-heading">
        <div>
          <h3>车间 / 机台配置</h3>
          <p>机台编号长期稳定；停用或搬迁前必须先解除正式员工绑定。</p>
        </div>
        <button type="button" onClick={startNewMachine}>新增机台</button>
      </div>
      <div className="machine-config-workbench">
        <div className="machine-config-list" role="listbox" aria-label="机台配置列表">
          {normalizedMachines.length ? normalizedMachines.map((machine) => (
            <button
              type="button"
              role="option"
              aria-selected={!draft.isNew && selectedMachineId === machine.machineId}
              className={!draft.isNew && selectedMachineId === machine.machineId ? "is-selected" : ""}
              key={machine.machineId}
              onClick={() => selectMachine(machine)}
            >
              <span>
                <strong>{machine.name || machine.machineLabel || machine.machineId}</strong>
                <small>{machine.machineId} · {machine.workshop || "车间待补"}</small>
              </span>
              <span className="machine-config-list-state">
                <StatusPill tone={getMachineStatusTone(machine.status)}>{machine.statusLabel || getMachineStatusLabel(machine.status)}</StatusPill>
                <small>绑定 {Number(machine.assignedEmployeeCount) || 0} 人</small>
              </span>
            </button>
          )) : (
            <DataState title="暂无机台配置" detail="新增首台设备后，员工调配才会出现可选机台。" compact />
          )}
        </div>
        <div className="detail-form machine-config-form">
          <label>
            <span>机台编号</span>
            <input value={draft.machineId} disabled={!draft.isNew} maxLength={32} onChange={(event) => updateField("machineId", event.target.value.toUpperCase())} />
          </label>
          <label>
            <span>显示名称</span>
            <input value={draft.name} onChange={(event) => updateField("name", event.target.value)} />
          </label>
          <label>
            <span>设备类型</span>
            <select value={draft.machineType} onChange={(event) => updateField("machineType", event.target.value)}>
              {MACHINE_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span>负责车间</span>
            <input value={draft.workshop} onChange={(event) => updateField("workshop", event.target.value)} placeholder="例如：1号车间" />
          </label>
          <label>
            <span>使用状态</span>
            <select value={draft.status} onChange={(event) => updateField("status", event.target.value)}>
              {MACHINE_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="machine-config-reason">
            <span>变更原因</span>
            <textarea rows={2} value={draft.reason} onChange={(event) => updateField("reason", event.target.value)} />
          </label>
        </div>
      </div>
      <div className="machine-config-evidence" aria-label="机台占用与修改记录">
        <div>
          <span>当前绑定</span>
          <strong>{assignedEmployees.length ? assignedEmployees.map((employee) => employee.name || employee.employeeId).join("、") : "暂无员工绑定"}</strong>
          <small>{assignedEmployees.length ? "搬迁或停用前先调整以上员工" : "当前可按权限调整车间或状态"}</small>
        </div>
        <div>
          <span>最近修改</span>
          <strong>{draft.lastChange ? `${draft.lastChange.operatorId || "操作人待确认"} · ${formatEmployeeAssignmentAuditTime(draft.lastChange.changedAt)}` : "暂无人工修改记录"}</strong>
          <small>{draft.lastChange?.reason ? `原因：${draft.lastChange.reason}` : "系统初始资料或历史记录未提供原因"}</small>
        </div>
      </div>
      <div className="action-row master-data-maintenance-actions operational-detail-actions">
        <button
          className="primary-action"
          disabled={actionState.disabled || invalid || isSaving}
          title={actionState.title || (invalid ? "请补齐机台编号、名称、车间和变更原因" : "")}
          onClick={saveMachine}
        >
          {isSaving ? "保存中..." : draft.isNew ? "确认新增" : "保存配置"}
        </button>
      </div>
    </>
  );
}

function createMachineDraft(machine = null, isNew = false) {
  return {
    isNew,
    machineId: machine?.machineId ?? "",
    bizNo: machine?.bizNo ?? machine?.machineId ?? "",
    name: machine?.name ?? machine?.machineLabel ?? "",
    machineType: machine?.machineType || "bag_making",
    workshop: machine?.workshop ?? "",
    status: machine?.status || "active",
    reason: isNew ? "新增现场机台配置" : "现场机台配置调整",
    assignedEmployees: Array.isArray(machine?.assignedEmployees) ? machine.assignedEmployees : [],
    lastChange: machine?.lastChange ?? null,
    updatedAt: machine?.updatedAt ?? "",
  };
}

function getMachineStatusLabel(status) {
  return { active: "启用", maintenance: "检修中", inactive: "停用" }[status] ?? "状态待确认";
}

function getMachineStatusTone(status) {
  return { active: "success", maintenance: "warning", inactive: "neutral" }[status] ?? "neutral";
}

function EmployeeAssignmentAuditSummary({ review }) {
  const hasAudit = Boolean(
    review?.assignmentUpdatedBy || review?.assignmentUpdatedAt || review?.assignmentNote,
  );
  return (
    <div className="employee-assignment-audit" aria-label="最近调配记录">
      <div className="employee-assignment-audit-head">
        <span>最近调配</span>
        <strong>
          {hasAudit
            ? `${review?.assignmentUpdatedBy || "操作人待确认"} · ${formatEmployeeAssignmentAuditTime(review?.assignmentUpdatedAt)}`
            : "暂无人工调配记录"}
        </strong>
      </div>
      <p>{hasAudit ? `调整原因：${review?.assignmentNote || "未填写"}` : "尚未产生人工调配审计"}</p>
    </div>
  );
}

function uniqueText(values = []) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
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

function formatEmployeeAssignmentAuditTime(value) {
  if (!value) return "时间待确认";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待确认";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
