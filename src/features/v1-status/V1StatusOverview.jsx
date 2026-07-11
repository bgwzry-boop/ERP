import { useState } from "react";
import { DataTable, MetricStrip, StatusPill } from "../../components/ui.jsx";

export const v1StatusWorkspaceViews = [
  { key: "overview", label: "决策总览" },
  { key: "production", label: "生产配置" },
  { key: "runtime", label: "运行门禁" },
  { key: "field", label: "现场验收" },
  { key: "boundary", label: "V1/V2" },
  { key: "module", label: "模块详情" },
];

export function V1StatusWorkspaceTabs({ value, onChange }) {
  return (
    <div className="v1-status-workspace-tabs" role="tablist" aria-label="V1 上线工作视图">
      {v1StatusWorkspaceViews.map((item) => (
        <button
          aria-selected={item.key === value}
          className={item.key === value ? "active" : ""}
          key={item.key}
          onClick={() => onChange(item.key)}
          role="tab"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function V1StatusSectionTabs({ items, value, onChange }) {
  if (!items?.length || items.length < 2) return null;
  return (
    <div className="v1-status-section-tabs" role="tablist" aria-label="V1 当前工作区阶段">
      {items.map((item) => (
        <button
          aria-selected={item.key === value}
          className={item.key === value ? "active" : ""}
          key={item.key}
          onClick={() => onChange(item.key)}
          role="tab"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function V1StatusUnavailable({ loading, statusSourceLabel, statusSourceDetail }) {
  return (
    <section className="v1-status-page">
      <div className="v1-status-banner v1-status-unavailable-banner">
        <div>
          <StatusPill tone="warning">{loading ? "状态读取中" : "状态未读取"}</StatusPill>
          <h2>V1 完成度快照</h2>
          <p>未能从后端取得 V1 上线状态，不展示固定完成度、发布门禁、现场证据或签字数字。</p>
        </div>
        <div className="v1-status-source">
          <span>最近成功快照：--</span>
          <strong>{statusSourceLabel}</strong>
          <em>{statusSourceDetail}</em>
        </div>
      </div>
      <div className="v1-status-unavailable">
        <strong>当前不能据此判断 V1 是否可上线。</strong>
        <span>{loading ? "正在读取后端 go-live 产物。" : "接口恢复后将自动读取最新后端 go-live 产物。"}</span>
      </div>
    </section>
  );
}

export function V1StatusHeader({ ready, statusSummary, snapshotExpired, statusSourceLabel, statusSourceDetail }) {
  return (
    <>
      <div className="v1-status-banner">
        <div>
          <StatusPill tone={ready ? "success" : "danger"}>{statusSummary.statusLabel}</StatusPill>
          <h2>V1 完成度快照</h2>
          <p>{statusSummary.conclusion}</p>
        </div>
        <div className="v1-status-source">
          <span>快照：{statusSummary.generatedAt}</span>
          <strong className={snapshotExpired ? "status-stale" : ""}>{statusSourceLabel}</strong>
          <em>{statusSourceDetail}</em>
        </div>
      </div>
      <MetricStrip items={statusSummary.metrics} ariaLabel="V1 完成度摘要" />
    </>
  );
}

export function V1StatusGateModulePanel({
  statusSummary,
  unblockPlan,
  selectedPhase,
  setSelectedPhaseKey,
  moduleCompletionRows,
  selectedModule,
  setSelectedModuleName,
}) {
  const [panelView, setPanelView] = useState("gates");
  const panelViews = [
    { key: "gates", label: "发布门禁" },
    { key: "phases", label: "解除阻塞" },
    { key: "modules", label: "模块" },
  ];

  return (
    <div className="list-pane v1-status-control-panel">
      <div className="v1-status-control-tabs" role="tablist" aria-label="V1 状态控制面板">
        {panelViews.map((item) => (
          <button
            aria-selected={item.key === panelView}
            className={item.key === panelView ? "active" : ""}
            key={item.key}
            onClick={() => setPanelView(item.key)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      {panelView === "gates" ? (
        <section className="v1-status-control-stage">
          <div className="panel-head compact">
            <div>
              <h2>发布门禁</h2>
              <span>门禁、现场证据和签字全部通过后，才能宣布完成。</span>
            </div>
          </div>
          <div className="v1-gate-list">
            {statusSummary.gates.map(([label, value, status, detail]) => (
              <div className="v1-gate-row" key={label}>
                <div>
                  <strong>{label}</strong>
                  <p>{detail}</p>
                </div>
                <StatusPill tone={status === "blocked" ? "danger" : "warning"}>{value}</StatusPill>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {panelView === "phases" ? (
        <section className="v1-status-control-stage">
          <div className="panel-head compact">
            <div>
              <h2>最小解除阻塞路径</h2>
              <span>按阶段完成后，重新跑 release candidate。</span>
            </div>
          </div>
          <div className="v1-unblock-summary">
            <div><span>待处理</span><strong>{unblockPlan.summary.taskCount}</strong></div>
            <div><span>发布门禁</span><strong>{unblockPlan.summary.releaseTaskCount}</strong></div>
            <div><span>现场证据</span><strong>{unblockPlan.summary.evidenceTaskCount}</strong></div>
            <div><span>签字</span><strong>{unblockPlan.summary.signoffTaskCount}</strong></div>
            <div><span>边界</span><strong>{unblockPlan.summary.boundaryTaskCount}</strong></div>
          </div>
          <div className="v1-phase-list">
            {unblockPlan.phases.map((phase) => (
              <button
                className={`v1-phase-row${phase.key === selectedPhase.key ? " active" : ""}`}
                key={phase.key}
                type="button"
                onClick={() => setSelectedPhaseKey(phase.key)}
              >
                <div>
                  <strong>{phase.label}</strong>
                  <p>{phase.nextStep}</p>
                </div>
                <span>{phase.taskCount} 项</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {panelView === "modules" ? (
        <section className="v1-status-control-stage">
          <div className="panel-head compact">
            <div>
              <h2>分模块完成度</h2>
              <span>百分比是代码和验收证据口径，不是上线承诺。</span>
            </div>
          </div>
          <DataTable
            className="v1-module-table"
            columns={["模块", "需求", "P0/代码", "V1"]}
            rows={moduleCompletionRows.map((item) => {
              const readiness = Number.parseInt(item.v1Readiness, 10);
              const tone = readiness < 50 ? "danger" : readiness < 65 ? "warning" : "success";
              return {
                id: item.module,
                active: item.module === selectedModule.module,
                tone,
                onClick: () => setSelectedModuleName(item.module),
                cells: [
                  item.module,
                  item.requirements,
                  item.p0Code,
                  <StatusPill key={`${item.module}-v1`} tone={tone}>{item.v1Readiness}</StatusPill>,
                ],
              };
            })}
          />
        </section>
      ) : null}
    </div>
  );
}

export function V1ProductionEnvFileSourceStatusList({ sourceStatuses = [] }) {
  const rows = Array.isArray(sourceStatuses) ? sourceStatuses.filter((source) => source?.envVariable) : [];
  if (!rows.length) return null;
  return (
    <div className="v1-production-env-file-audit-source-list">
      <strong>服务端来源状态</strong>
      {rows.map((source) => (
        <span key={source.envVariable}>
          <em>{source.label}</em>
          <strong>{source.envVariable}</strong>
          <small>
            {source.selected
              ? "当前使用"
              : source.ignored
                ? "已配置但未使用"
                : source.configured
                  ? "已配置"
                  : "未配置"}
            {source.envFileCount ? ` / ${source.envFileCount} 个文件` : ""}
          </small>
        </span>
      ))}
    </div>
  );
}

export function renderV1ProductionEnvFileSourceStatusList(sourceStatuses = []) {
  return <V1ProductionEnvFileSourceStatusList sourceStatuses={sourceStatuses} />;
}
