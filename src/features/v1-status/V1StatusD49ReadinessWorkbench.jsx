import { useMemo, useState } from "react";
import {
  CloudServerOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { StatusPill } from "../../components/ui.jsx";

const VIEW_KEYS = Object.freeze({
  actions: "actions",
  roles: "roles",
  environment: "environment",
});

export function V1StatusD49ReadinessWorkbench({ d49Readiness, onOpenEmployeeImport }) {
  const [activeView, setActiveView] = useState(VIEW_KEYS.actions);
  const employeeIntake = d49Readiness.employeeIntake;
  const employeeIntakeCurrent = employeeIntake?.available && employeeIntake?.fresh;
  const employeeRoles = d49Readiness.employees?.roles ?? [];
  const environmentBlockers = d49Readiness.blockers?.filter((item) => item.category !== "employee") ?? [];
  const environmentGroups = useMemo(
    () => groupD49EnvironmentBlockers(environmentBlockers),
    [environmentBlockers],
  );
  const intakeRolesByKey = useMemo(
    () => new Map((employeeIntake?.roles ?? []).map((role) => [role.roleKey, role])),
    [employeeIntake?.roles],
  );
  const views = [
    { key: VIEW_KEYS.actions, label: "当前动作", count: d49Readiness.ready ? "已就绪" : "2 类" },
    { key: VIEW_KEYS.roles, label: "八岗位", count: d49Readiness.summary.employeeRoleLabel },
    { key: VIEW_KEYS.environment, label: "环境门禁", count: `${environmentBlockers.length} 项` },
  ];

  return (
    <section className="v1-d49-workbench" aria-label="D49员工与环境联合预检">
      <header className="v1-d49-workbench-header">
        <div className="v1-d49-workbench-heading">
          <span className="v1-d49-kicker">D49 上线前置</span>
          <div>
            <StatusPill tone={d49Readiness.ready ? "success" : "danger"}>
              {d49Readiness.statusLabel}
            </StatusPill>
            <h4>员工与环境联合预检</h4>
          </div>
          <p>正式账号和 production env 均通过后，才可进入 D50。</p>
        </div>
        {onOpenEmployeeImport ? (
          <button className="ghost-button" type="button" onClick={onOpenEmployeeImport}>
            <UploadOutlined /> 打开员工导入
          </button>
        ) : null}
      </header>

      <div className="v1-d49-metric-strip" aria-label="D49关键指标">
        <D49Metric
          label="受控草稿"
          value={employeeIntakeCurrent ? `${employeeIntake.summary.employeeRowCount} 人` : employeeIntake?.available ? "待重检" : "未读取"}
          detail={employeeIntake?.available && !employeeIntake?.fresh ? `上次记录 ${employeeIntake.summary.employeeRowCount} 人` : "仅显示脱敏聚合"}
          tone={employeeIntakeCurrent ? "neutral" : "warning"}
        />
        <D49Metric
          label="草稿岗位"
          value={employeeIntakeCurrent ? employeeIntake.summary.coverageLabel : employeeIntake?.available ? "待重检" : "0/8"}
          detail={!employeeIntakeCurrent && employeeIntake?.available
            ? `上次 ${employeeIntake.summary.coverageLabel}`
            : employeeIntake?.missingRoleLabels?.length ? `缺 ${employeeIntake.missingRoleLabels.length} 岗` : "覆盖完整"}
          tone={employeeIntakeCurrent && employeeIntake?.ready ? "success" : "warning"}
        />
        <D49Metric
          label="待补员工编号"
          value={employeeIntakeCurrent ? `${employeeIntake.summary.missingEmployeeNumberCount} 个` : employeeIntake?.available ? "待重检" : "未读取"}
          detail={!employeeIntakeCurrent && employeeIntake?.available
            ? `上次缺 ${employeeIntake.summary.missingEmployeeNumberCount} 个`
            : "编号原值不展示"}
          tone={!employeeIntakeCurrent ? "warning" : employeeIntake?.summary.missingEmployeeNumberCount ? "danger" : "success"}
        />
        <D49Metric
          label="正式岗位就绪"
          value={d49Readiness.summary.employeeRoleLabel}
          detail={`正式账号 ${d49Readiness.summary.readyFormalAccountCount}/${d49Readiness.summary.formalAccountCount}`}
          tone={d49Readiness.employees?.ready ? "success" : "danger"}
        />
      </div>

      <div className="v1-d49-view-tabs" role="tablist" aria-label="D49预检视图">
        {views.map((view) => (
          <button
            id={`v1-d49-tab-${view.key}`}
            type="button"
            role="tab"
            aria-selected={activeView === view.key}
            aria-controls={`v1-d49-panel-${view.key}`}
            className={activeView === view.key ? "active" : ""}
            key={view.key}
            onClick={() => setActiveView(view.key)}
          >
            <span>{view.label}</span>
            <strong>{view.count}</strong>
          </button>
        ))}
      </div>

      <div
        id={`v1-d49-panel-${activeView}`}
        className="v1-d49-view-panel"
        role="tabpanel"
        aria-labelledby={`v1-d49-tab-${activeView}`}
      >
        {activeView === VIEW_KEYS.actions ? (
          <D49CurrentActions
            d49Readiness={d49Readiness}
            employeeIntake={employeeIntake}
            environmentBlockers={environmentBlockers}
            environmentGroups={environmentGroups}
          />
        ) : null}
        {activeView === VIEW_KEYS.roles ? (
          <div className="v1-d49-role-grid" aria-label="D49八岗位就绪矩阵">
            {employeeRoles.map((role) => {
              const intakeRole = intakeRolesByKey.get(role.roleKey);
              return (
                <div className={`v1-d49-role-row ${role.ready ? "ready" : "blocked"}`} key={role.roleKey}>
                  <div>
                    <strong>{role.roleLabel}</strong>
                    <StatusPill tone={role.ready ? "success" : "danger"}>{role.ready ? "就绪" : "阻塞"}</StatusPill>
                  </div>
                  <span>草稿 {employeeIntakeCurrent ? intakeRole?.covered ? `${intakeRole.rowCount} 人` : "暂未填写" : employeeIntake?.available ? "待重新预检" : "未读取"}</span>
                  <span>正式可用 {role.readyAccountCount}/{role.accountCount}</span>
                  <small>
                    {role.ready
                      ? "正式账号可用"
                      : role.blockers.length
                        ? role.blockers.map((item) => `${item.label} ${item.count}`).join("、")
                        : "未导入正式账号"}
                  </small>
                </div>
              );
            })}
          </div>
        ) : null}
        {activeView === VIEW_KEYS.environment ? (
          <D49EnvironmentGate
            d49Readiness={d49Readiness}
            environmentBlockers={environmentBlockers}
            environmentGroups={environmentGroups}
          />
        ) : null}
      </div>
    </section>
  );
}

function D49Metric({ label, value, detail, tone = "neutral" }) {
  return (
    <div className={`v1-d49-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function D49CurrentActions({ d49Readiness, employeeIntake, environmentBlockers, environmentGroups }) {
  const employeeIntakeCurrent = employeeIntake?.available && employeeIntake?.fresh;
  const missingRoleText = employeeIntake?.missingRoleLabels?.length
    ? employeeIntake.missingRoleLabels.join("、")
    : "无";
  return (
    <div className="v1-d49-action-grid">
      <article className="v1-d49-action-column employee">
        <div className="v1-d49-action-title">
          <span className="v1-d49-action-icon"><TeamOutlined /></span>
          <div>
            <span>员工侧 · 当前优先</span>
            <strong>{employeeIntake?.statusLabel || "受控预检未就绪"}</strong>
          </div>
          <StatusPill tone={employeeIntake?.ready ? "success" : employeeIntake?.available && !employeeIntake?.fresh ? "warning" : "danger"}>
            {employeeIntake?.ready ? "可上传" : employeeIntake?.available && !employeeIntake?.fresh ? "待重检" : "仍阻塞"}
          </StatusPill>
        </div>
        <p>{employeeIntake?.nextAction || d49Readiness.nextAction}</p>
        <div className="v1-d49-action-meta">
          <span>{employeeIntakeCurrent ? "草稿" : "上次草稿"} {employeeIntake?.available ? `${employeeIntake.summary.employeeRowCount} 人` : "未读取"}</span>
          <span>{employeeIntakeCurrent ? "岗位" : "上次岗位"} {employeeIntake?.available ? employeeIntake.summary.coverageLabel : "0/8"}</span>
          <span>{employeeIntakeCurrent ? "暂未填写" : "新鲜度"} {employeeIntakeCurrent ? missingRoleText : employeeIntake?.freshness?.label || "未验证"}</span>
        </div>
        <small><SafetyCertificateOutlined /> {employeeIntakeCurrent ? "工作簿指纹与72小时内预检一致；" : "当前统计不可用于导入判断；"}页面不显示姓名、编号原值、路径、问题行或指纹。</small>
      </article>
      <article className="v1-d49-action-column environment">
        <div className="v1-d49-action-title">
          <span className="v1-d49-action-icon"><CloudServerOutlined /></span>
          <div>
            <span>环境侧 · 并行补齐</span>
            <strong>{d49Readiness.environment?.ready ? "production env 已就绪" : "production env 仍有阻塞"}</strong>
          </div>
          <StatusPill tone={d49Readiness.environment?.ready ? "success" : "danger"}>
            {d49Readiness.environment?.ready ? "通过" : `${environmentBlockers.length} 项`}
          </StatusPill>
        </div>
        <p>
          setup {d49Readiness.summary.envSetupReady ? "通过" : "阻塞"}，env 审计 {d49Readiness.summary.envAuditReady ? "通过" : "阻塞"}；
          继续补齐真实值并重新校验。
        </p>
        <div className="v1-d49-action-meta">
          <span>env 预检 {d49Readiness.summary.envPreflightLabel}</span>
          <span>intake {d49Readiness.summary.envIntakeConfiguredLabel}</span>
          <span>{environmentGroups.length} 个阻塞组</span>
        </div>
        <small>员工侧与环境侧可并行处理；两侧均通过后D49才解除。</small>
      </article>
    </div>
  );
}

function D49EnvironmentGate({ d49Readiness, environmentBlockers, environmentGroups }) {
  if (!environmentGroups.length) {
    return (
      <div className="v1-d49-empty-state">
        <SafetyCertificateOutlined />
        <strong>环境门禁已通过</strong>
        <span>setup、env 审计、预检和 intake 均已就绪。</span>
      </div>
    );
  }
  return (
    <div className="v1-d49-environment-gate" aria-label="D49环境阻塞">
      <div className="v1-d49-gate-summary">
        <div>
          <strong>环境阻塞 {environmentBlockers.length} 项</strong>
          <span>{environmentGroups.length} 组，按当前服务端预检完整展示</span>
        </div>
        <div className="v1-d49-action-meta">
          <span>预检 {d49Readiness.summary.envPreflightLabel}</span>
          <span>intake {d49Readiness.summary.envIntakeConfiguredLabel}</span>
        </div>
      </div>
      <div className="v1-d49-gate-list">
        {environmentGroups.map((item) => (
          <div className="v1-d49-gate-row" key={item.key || item.label}>
            <StatusPill tone="danger">阻塞</StatusPill>
            <div>
              <strong>{item.label}{item.count > 1 ? ` ×${item.count}` : ""}</strong>
              <p>{item.nextAction || item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function groupD49EnvironmentBlockers(items) {
  const groups = new Map();
  for (const item of items) {
    const signature = [item.category, item.label, item.nextAction, item.detail].join("|");
    const current = groups.get(signature);
    if (current) current.count += 1;
    else groups.set(signature, { ...item, count: 1 });
  }
  return [...groups.values()];
}
