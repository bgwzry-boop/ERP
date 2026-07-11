import { DataTable, MetricStrip, StatusPill } from "../../components/ui.jsx";

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
  return (
    <div className="list-pane">
      <div className="panel-head compact">
        <div>
          <h2>发布门禁</h2>
          <span>只有门禁、现场证据和签字都通过，才可宣布 V1 完成。</span>
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

      <div className="panel-head compact">
        <div>
          <h2>最小解除阻塞路径</h2>
          <span>来自 go-live suite；按阶段完成后，重新跑 release candidate。</span>
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

      <div className="panel-head compact">
        <div>
          <h2>分模块完成度</h2>
          <span>百分比是当前代码和验收证据口径，不是上线承诺。</span>
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
