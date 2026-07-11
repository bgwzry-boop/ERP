import { InfoGrid } from "../../components/ui.jsx";

export function V1StatusModuleWorkspace({
  selectedModule,
  selectedPhase,
  roleBuckets,
  blockers,
  v2DifferenceItems,
}) {
  return (
    <>
      <div className="v1-module-summary">
        <InfoGrid
          rows={[
            ["需求确认", selectedModule.requirements],
            ["P0/代码", selectedModule.p0Code],
            ["V1 上线就绪", selectedModule.v1Readiness],
            ["完成标准", "发布门禁 + 现场证据 + 签字"],
            ["当前阶段", `${selectedPhase.label} / ${selectedPhase.taskCount} 项`],
          ]}
        />
      </div>
      <section className="detail-section v1-workspace-panel v1-workspace-module v1-section-module_pressure">
        <h3>角色压力</h3>
        <div className="v1-role-buckets">
          {roleBuckets.map(([role, count]) => (
            <span key={role}>{role}<strong>{count}</strong></span>
          ))}
        </div>
      </section>
      <section className="detail-section v1-workspace-panel v1-workspace-module v1-section-module_gaps">
        <h3>主要未完成</h3>
        <p>{selectedModule.remaining}</p>
      </section>
      <section className="detail-section v1-workspace-panel v1-workspace-module v1-section-module_blockers">
        <h3>当前最小阻塞</h3>
        <ul className="v1-blocker-list">
          {blockers.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
      <section className="detail-section v1-workspace-panel v1-workspace-module v1-section-module_v2">
        <h3>计划 V2 差异</h3>
        <div className="v2-difference-list">
          {v2DifferenceItems.map(([label, text]) => (
            <div className="v2-difference-row" key={label}>
              <strong>{label}</strong>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
