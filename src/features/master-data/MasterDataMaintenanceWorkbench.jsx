import { CheckCircleOutlined, ReloadOutlined, SearchOutlined, UploadOutlined } from "@ant-design/icons";
import {
  DataState,
  DataTable,
  FilterBar,
  MetricStrip,
  OperationalPanel,
  PanelHeader,
  Segmented,
  StatusPill,
} from "../../shared/ui/operational.jsx";
import {
  getMasterDataMaintenanceTableClass,
  getMasterDataSearchPlaceholder,
  isMasterDataEmployeeEnableCandidate,
  requiresMasterDataEmployeeIdentityConfirmation,
  MASTER_DATA_EMPLOYEE_REVIEW_FILTERS,
  MASTER_DATA_EMPLOYEE_VIEWS,
  requiresMasterDataEmployeeMachineReview,
} from "../../domain/masterDataMaintenanceListState.js";

export function MasterDataMaintenanceListPane({
  activeTab,
  employeeAccountReadiness,
  employeeScopedRecords,
  employeeReviewFilter,
  employeeReviewFilterCounts,
  employeeView,
  keyword,
  batchEnableState,
  batchEnableCandidates,
  pendingAccountReviews,
  batchSelectedEmployeeIds,
  selectedBatchReviews,
  onToggleBatchEmployee,
  onToggleAllBatchEmployees,
  onBatchEnableEmployeeAccounts,
  onEmployeeReviewFilterChange,
  onEmployeeViewChange,
  onKeywordChange,
  onOpenImportTemplate,
  onSelect,
  onTabChange,
  selectedId,
  stats,
  tableColumns,
  viewItems,
  visibleRecords,
}) {
  return (
    <OperationalPanel className="table-pane master-data-list-panel" ariaLabel="基础资料列表">
      <PanelHeader
        title="基础资料工作台"
        actions={(
          <div className="master-data-header-actions">
            {activeTab === "员工机台" && employeeView === "正式账号" ? (
              <button
                className="ghost-button"
                type="button"
                disabled={!selectedBatchReviews.length || batchEnableState?.disabled}
                title={batchEnableState?.title || (selectedBatchReviews.length
                  ? `批量启用已选择的 ${selectedBatchReviews.length} 个待复核账号`
                  : "请先勾选待启用账号")}
                onClick={() => onBatchEnableEmployeeAccounts?.(selectedBatchReviews)}
              >
                <CheckCircleOutlined /> 启用所选 {selectedBatchReviews.length}
              </button>
            ) : null}
            <button className="ghost-button master-data-import-button" onClick={() => onOpenImportTemplate?.(activeTab)}>
              <UploadOutlined /> 导入模板
            </button>
          </div>
        )}
      />
      <MasterDataViewTabs activeTab={activeTab} items={viewItems} onChange={onTabChange} />
      <FilterBar
        className="master-data-filter-bar"
        ariaLabel="基础资料搜索"
        summary={`${visibleRecords.length} / ${employeeScopedRecords.length} 条`}
        actions={(
          <div className="master-data-filter-actions">
            {activeTab === "员工机台" ? (
              <Segmented ariaLabel="员工账号来源" value={employeeView} onChange={onEmployeeViewChange} items={MASTER_DATA_EMPLOYEE_VIEWS} />
            ) : null}
            <button
              className="icon-button"
              type="button"
              aria-label="重置基础资料搜索"
              title="重置搜索"
              disabled={!keyword}
              onClick={() => onKeywordChange("")}
            >
              <ReloadOutlined />
            </button>
          </div>
        )}
      >
        <label className="search small">
          <SearchOutlined />
          <input
            placeholder={getMasterDataSearchPlaceholder(activeTab)}
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
          />
        </label>
      </FilterBar>
      {activeTab === "员工机台" && employeeView === "正式账号" ? (
        <EmployeeReviewFilterBar
          counts={employeeReviewFilterCounts}
          value={employeeReviewFilter}
          onChange={onEmployeeReviewFilterChange}
        />
      ) : null}
      <MetricStrip items={stats} ariaLabel="基础资料状态摘要" />
      {activeTab === "员工机台" ? (
        <EmployeeRoleReadiness readiness={employeeAccountReadiness} pendingAccountReviews={pendingAccountReviews} />
      ) : null}
      {activeTab === "员工机台" && employeeView === "正式账号" ? (
        <div className="master-data-batch-toolbar" aria-label="正式员工账号批量选择">
          <label>
            <input
              type="checkbox"
              checked={batchEnableCandidates.length > 0 && batchSelectedEmployeeIds.length === batchEnableCandidates.length}
              onChange={(event) => onToggleAllBatchEmployees(event.target.checked)}
              disabled={!batchEnableCandidates.length}
            />
            全选当前筛选
          </label>
          <span>已选 {batchSelectedEmployeeIds.length} / 当前可启用 {batchEnableCandidates.length} · 待身份 {employeeReviewFilterCounts?.待身份 ?? 0} · 待机台 {employeeReviewFilterCounts?.待机台 ?? 0}</span>
        </div>
      ) : null}
      {visibleRecords.length ? (
        <DataTable
          className={`master-data-maintenance-table ${getMasterDataMaintenanceTableClass(activeTab)}`}
          columns={tableColumns}
          rows={visibleRecords.map((record) => {
            const canEnable = isMasterDataEmployeeEnableCandidate(record);
            const selectorTitle = requiresMasterDataEmployeeIdentityConfirmation(record)
              ? record.employeeReview?.accountActivationBlockerLabel || "请先完成员工身份确认"
              : requiresMasterDataEmployeeMachineReview(record)
                ? "请先在右侧完成真实机台复核"
              : canEnable ? "选择待启用账号" : "该账号当前不可启用";
            return {
              id: record.id,
              active: record.id === selectedId,
              tone: record.tone,
              onClick: () => onSelect(record.id),
              interactive: activeTab === "员工机台" && employeeView === "正式账号",
              cells: activeTab === "员工机台" && employeeView === "正式账号"
                ? [
                    <label
                      className="master-data-row-selector"
                      key={`${record.id}-selector`}
                      title={selectorTitle}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label={`${selectorTitle}：${record.label || record.id}`}
                        checked={batchSelectedEmployeeIds.includes(record.employeeReview?.employeeId)}
                        disabled={!canEnable}
                        onChange={(event) => onToggleBatchEmployee(record.employeeReview?.employeeId, event.target.checked)}
                      />
                    </label>,
                    ...record.cells,
                  ]
                : record.cells,
            };
          })}
        />
      ) : (
        <DataState
          title={activeTab === "员工机台" && employeeView === "正式账号"
            ? (employeeAccountReadiness ? "尚未导入正式员工账号" : "正式员工账号状态待同步")
            : "当前没有匹配的基础资料"}
          detail={activeTab === "员工机台" && employeeView === "正式账号"
            ? (employeeAccountReadiness ? "使用员工机台导入模板，复核岗位、权限和默认机台后再启用账号。" : "正在读取后端正式账号；读取失败或无权限时不会保留旧员工列表。")
            : "保留当前筛选条件，调整关键字后重试。"}
          compact
        />
      )}
    </OperationalPanel>
  );
}

function EmployeeReviewFilterBar({ counts = {}, value, onChange }) {
  return (
    <div className="master-data-employee-review-filter-bar">
      <span>账号复核</span>
      <div className="segmented" role="tablist" aria-label="员工账号复核状态">
        {MASTER_DATA_EMPLOYEE_REVIEW_FILTERS.map((filter) => (
          <button
            type="button"
            role="tab"
            aria-selected={value === filter}
            className={value === filter ? "selected" : ""}
            key={filter}
            onClick={() => onChange(filter)}
          >
            <span>{filter}</span>
            <strong>{counts[filter] ?? 0}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

export function MasterDataDetailOverview({ activeTab, selected }) {
  const facts = getMasterDataDetailFacts(activeTab, selected);
  return (
    <div className="master-data-detail-overview">
      <div className="master-data-detail-status-line">
        <StatusPill tone={selected.tone}>{selected.statusLabel}</StatusPill>
        <span>{getMasterDataNextStep(activeTab, selected)}</span>
      </div>
      <div className="master-data-detail-facts" aria-label="基础资料关键事实">
        {facts.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value || "待补"}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function MasterDataViewTabs({ activeTab, items, onChange }) {
  return (
    <div className="master-data-view-tabs" role="tablist" aria-label="基础资料类型">
      {items.map((item) => (
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === item.key}
          className={activeTab === item.key ? "active" : ""}
          key={item.key}
          onClick={() => onChange(item.key)}
        >
          <span>{item.label}</span>
          <strong>{item.count}</strong>
        </button>
      ))}
    </div>
  );
}

function EmployeeRoleReadiness({ readiness, pendingAccountReviews = [] }) {
  if (!readiness) {
    return <DataState title="岗位就绪状态待同步" detail="进入页面会自动读取正式八岗位覆盖；失败或无权限时不展示旧投影。" compact />;
  }
  const pendingRoleCounts = pendingAccountReviews.reduce((counts, review) => {
    const roleKeys = Array.isArray(review?.recommendedRoleKeys) && review.recommendedRoleKeys.length
      ? review.recommendedRoleKeys
      : [review?.recommendedRoleKey];
    for (const value of roleKeys) {
      const roleKey = String(value ?? "").trim();
      if (roleKey) counts.set(roleKey, (counts.get(roleKey) ?? 0) + 1);
    }
    return counts;
  }, new Map());
  return (
    <section className={`master-data-role-readiness ${readiness.ready ? "ready" : "blocked"}`} aria-label="正式员工岗位上线就绪">
      <header>
        <div>
          <strong>正式员工岗位上线就绪</strong>
          <span>
            可用岗位 {readiness.coveredRoleCount}/{readiness.requiredRoleCount}
            {` · 可用账号 ${readiness.readyFormalAccountCount}/${readiness.formalAccountCount} · 待启用 ${pendingAccountReviews.length}`}
          </span>
        </div>
        <StatusPill tone={readiness.ready ? "success" : "danger"}>{readiness.ready ? "可放行" : `缺 ${readiness.missingRoleCount} 岗位`}</StatusPill>
      </header>
      <div className="master-data-role-readiness-grid" role="list">
        {readiness.roles.map((role) => (
          <article className={role.ready ? "ready" : "blocked"} role="listitem" key={role.roleKey}>
            <div><strong>{role.roleLabel}</strong><span>{role.readyAccountCount}/{role.accountCount} 可用</span></div>
            <small>{role.ready ? "账号、改密、有效期和绑定门禁通过" : formatRoleBlockers(role, pendingRoleCounts.get(role.roleKey) ?? 0)}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function getMasterDataDetailFacts(activeTab, selected) {
  const detailByLabel = new Map(selected.detailRows ?? []);
  if (activeTab === "员工机台") {
    return [
      ["员工", detailByLabel.get("员工") ?? detailByLabel.get("显示名") ?? selected.label],
      ["岗位", detailByLabel.get("岗位") ?? "岗位待补"],
      ["工作安排", detailByLabel.get("工作安排") ?? detailByLabel.get("默认机台") ?? "暂未分配"],
      ["账号状态", selected.sourceType === "seed" ? "演示账号只读" : detailByLabel.get("账号状态") ?? "待复核"],
    ];
  }
  const labels = activeTab === "客户档案"
    ? ["客户编号", "结算周期", "应收/欠款", "最近对账"]
    : activeTab === "价格表"
      ? ["客户", "品名/尺寸", "单双面", "参考单价"]
      : activeTab === "规格库存"
        ? ["库存键", "库区", "在库/占用/锁定", "可用/可信"]
        : [];
  return labels.map((label) => [label, detailByLabel.get(label) ?? "待补"]);
}

function getMasterDataNextStep(activeTab, selected) {
  if (activeTab === "员工机台") {
    if (selected.sourceType === "seed") return "只读演示账号";
    if (requiresMasterDataEmployeeMachineReview(selected)) return "分配真实机台";
    if (!selected.employeeReview?.accountEnabled) return "核对后启用";
    return "调整工作安排";
  }
  if (activeTab === "价格表") return "保存价格变更草稿";
  if (activeTab === "规格库存") return "维护规格或修正库存";
  return selected.statusLabel === "需财务关注" ? "核对欠款后变更" : "需要时保存变更草稿";
}

function formatRoleBlockers(role, pendingCount = 0) {
  if (!role.accountCount && pendingCount) return `待复核启用 ${pendingCount} 人`;
  if (!role.accountCount) return "尚未导入待启用账号";
  return (role.blockers ?? []).map((blocker) => `${blocker.label}${blocker.count > 1 ? `×${blocker.count}` : ""}`).join("、") || "尚无可放行账号";
}
