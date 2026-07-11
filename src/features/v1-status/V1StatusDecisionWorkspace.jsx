import { StatusPill } from "../../components/ui.jsx";
import { getV1PhaseTaskTone } from "./v1StatusPresentation.js";

export function V1StatusDecisionWorkspace({
  ownerDecisionBrief,
  completionAudit,
  buildCompletionAuditActions,
  selectedPhase,
  selectedPhaseRoles,
  selectedPhaseGroups,
  selectedPhaseTasks,
  selectedPhaseQuickActions,
}) {
  return (
    <>
      {ownerDecisionBrief ? <OwnerDecisionSection ownerDecisionBrief={ownerDecisionBrief} /> : null}
      {completionAudit ? (
        <CompletionAuditSection
          completionAudit={completionAudit}
          buildCompletionAuditActions={buildCompletionAuditActions}
        />
      ) : null}
      <CurrentUnblockPhaseSection
        selectedPhase={selectedPhase}
        selectedPhaseRoles={selectedPhaseRoles}
        selectedPhaseGroups={selectedPhaseGroups}
        selectedPhaseTasks={selectedPhaseTasks}
        selectedPhaseQuickActions={selectedPhaseQuickActions}
      />
    </>
  );
}

function OwnerDecisionSection({ ownerDecisionBrief }) {
  return (
    <section className="detail-section v1-workspace-panel v1-workspace-overview v1-section-owner">
      <h3>负责人决策摘要</h3>
      <div className="v1-owner-decision-head">
        <StatusPill tone={ownerDecisionBrief.canDeclareV1Complete ? "success" : "danger"}>
          {ownerDecisionBrief.decision.label || "不能宣布 V1 已完成"}
        </StatusPill>
        <p>{ownerDecisionBrief.conclusion}</p>
      </div>
      <div className="v1-owner-decision-summary">
        <span>发布门禁 <strong>{ownerDecisionBrief.completion.releaseGate}</strong></span>
        <span>运行时 <strong>{ownerDecisionBrief.completion.runtimeReadiness}</strong></span>
        <span>现场任务 <strong>{ownerDecisionBrief.completion.onsiteTaskLabel}</strong></span>
        <span>现场证据 <strong>{ownerDecisionBrief.completion.fieldEvidence}</strong></span>
      </div>
      <div className="v1-owner-decision-grid">
        <div className="v1-owner-decision-column">
          <strong>已完成基础</strong>
          <div className="v1-owner-decision-list">
            {ownerDecisionBrief.doneHighlights.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </div>
        <div className="v1-owner-decision-column">
          <strong>还没完成</strong>
          <div className="v1-owner-decision-list">
            {ownerDecisionBrief.unfinishedItems.slice(0, 5).map((item) => (
              <p key={`${item.type}-${item.label}`}>
                <b>{item.label}</b>：{item.detail}
              </p>
            ))}
          </div>
        </div>
      </div>
      {ownerDecisionBrief.releaseGates.length ? (
        <div className="v1-owner-decision-gates">
          {ownerDecisionBrief.releaseGates.map((gate) => (
            <div className="v1-owner-decision-gate" key={gate.label}>
              <StatusPill tone={gate.status === "blocked" ? "danger" : "warning"}>{gate.summary}</StatusPill>
              <div>
                <strong>{gate.label}</strong>
                <p>{gate.detail}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {(ownerDecisionBrief.nextActions.length || ownerDecisionBrief.topBlockers.length) ? (
        <div className="v1-owner-action-plan">
          {ownerDecisionBrief.nextActions.length ? (
            <div className="v1-owner-action-column">
              <strong>优先动作 <span>{ownerDecisionBrief.summary.nextActionLabel}</span></strong>
              <div className="v1-owner-action-list">
                {ownerDecisionBrief.nextActions.map((action) => (
                  <p key={action}>{action}</p>
                ))}
              </div>
            </div>
          ) : null}
          {ownerDecisionBrief.topBlockers.length ? (
            <div className="v1-owner-action-column">
              <strong>首批阻塞 <span>{ownerDecisionBrief.summary.topBlockerLabel}</span></strong>
              <div className="v1-owner-blocker-list">
                {ownerDecisionBrief.topBlockers.map((blocker) => (
                  <div className="v1-owner-blocker-row" key={`${blocker.gate}-${blocker.label}`}>
                    <StatusPill tone="danger">{blocker.gate || "阻塞"}</StatusPill>
                    <div>
                      <strong>{blocker.label}</strong>
                      <p>{blocker.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="v1-owner-decision-question">
        <strong>负责人需要判断</strong>
        <p>{ownerDecisionBrief.decision.ownerQuestion}</p>
        <p>{ownerDecisionBrief.decision.recommendation}</p>
      </div>
    </section>
  );
}

function CompletionAuditSection({ completionAudit, buildCompletionAuditActions }) {
  return (
    <section className="detail-section v1-workspace-panel v1-workspace-overview v1-section-audit">
      <h3>V1 完成审计</h3>
      <div className="v1-owner-decision-head">
        <StatusPill tone={completionAudit.canDeclareV1Complete ? "success" : "danger"}>
          {completionAudit.canDeclareV1Complete ? "可以宣布完成" : "不能宣布完成"}
        </StatusPill>
        <p>{completionAudit.summary.label}</p>
      </div>
      <div className="v1-owner-decision-summary">
        <span>完成标准 <strong>{completionAudit.summary.passedCriteriaCount}/{completionAudit.summary.criteriaCount}</strong></span>
        <span>阻塞 <strong>{completionAudit.summary.blockingCriteriaLabel}</strong></span>
        <span>现场任务 <strong>{completionAudit.summary.onsiteTaskLabel}</strong></span>
        <span>V2 差异 <strong>{completionAudit.summary.v2DifferenceLabel}</strong></span>
      </div>
      <div className="v1-owner-decision-gates">
        {completionAudit.criteria.map((criterion) => {
          const criterionActions = buildCompletionAuditActions(criterion);
          return (
            <div className="v1-owner-decision-gate" key={criterion.key}>
              <StatusPill tone={criterion.ready ? "success" : "danger"}>{criterion.statusLabel}</StatusPill>
              <div>
                <strong>{criterion.label}</strong>
                <p>当前：{criterion.evidenceLabel}</p>
                {criterion.proofRequirements?.length ? (
                  <div className="v1-completion-proof-list">
                    <span>需证明</span>
                    {criterion.proofRequirements.map((proof) => (
                      <b key={proof}>{proof}</b>
                    ))}
                  </div>
                ) : null}
                {criterion.proofGaps?.length ? (
                  <div className="v1-completion-gap-list">
                    <span>{criterion.proofGapCountLabel ? `还缺 ${criterion.proofGapCountLabel}` : "还缺"}</span>
                    {criterion.proofGaps.map((gap) => (
                      <b key={gap}>{gap}</b>
                    ))}
                  </div>
                ) : null}
                <p>{criterion.ready ? criterion.current : criterion.nextAction}</p>
                {criterionActions.length ? (
                  <div className="v1-refresh-precheck-actions">
                    {criterionActions.map((action) => (
                      <button
                        className="ghost-button"
                        disabled={action.disabled}
                        key={`${criterion.key}-${action.key}`}
                        onClick={action.onClick}
                        type="button"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="v1-owner-decision-question">
        <strong>V1/V2 边界</strong>
        <p>{completionAudit.v2Boundary.label}</p>
        <p>{completionAudit.v2Boundary.nextAction}</p>
      </div>
    </section>
  );
}

function CurrentUnblockPhaseSection({
  selectedPhase,
  selectedPhaseRoles,
  selectedPhaseGroups,
  selectedPhaseTasks,
  selectedPhaseQuickActions,
}) {
  return (
    <section className="detail-section v1-workspace-panel v1-workspace-overview v1-section-phase">
      <h3>当前解除阻塞阶段</h3>
      <div className="v1-phase-detail">
        <p>{selectedPhase.nextStep}</p>
        <div className="v1-phase-meta">
          <span>发布门禁 {selectedPhase.releaseTaskCount}</span>
          <span>现场证据 {selectedPhase.evidenceTaskCount}</span>
          <span>签字/边界 {selectedPhase.signBoundaryCount}</span>
          {selectedPhase.groupLabel ? <span>分组 {selectedPhase.groupLabel}</span> : null}
          {selectedPhase.firstTaskLabel ? <span>首批任务 {selectedPhase.firstTaskLabel}</span> : null}
        </div>
        <div className="v1-role-strip">
          {selectedPhaseRoles.map((role) => <span key={role}>{role}</span>)}
        </div>
        {selectedPhaseGroups.length ? (
          <div className="v1-phase-group-list">
            {selectedPhaseGroups.map((group) => (
              <span className="v1-phase-group" key={group.key}>
                <strong>{group.group}</strong>
                {group.countLabel ? <em>{group.countLabel}</em> : null}
              </span>
            ))}
          </div>
        ) : null}
        <div className="v1-phase-quick-actions">
          {selectedPhaseQuickActions.map((action) => (
            <button
              className="ghost-button"
              disabled={action.disabled}
              key={`${selectedPhase.key}-${action.key}`}
              onClick={action.onClick}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
      <div className="v1-action-list">
        {selectedPhaseTasks.map((task) => (
          <div className="v1-action-row" key={`${selectedPhase.key}-${task.key}`}>
            <StatusPill tone={getV1PhaseTaskTone(task)}>{task.type || "待办"}</StatusPill>
            <div>
              <strong>{task.title}</strong>
              <p>{task.group} / {task.roleLabel}：{task.action}</p>
              <div className="v1-action-meta">
                <span>{task.statusLabel}</span>
                {task.primaryRole ? <span>{task.primaryRole}</span> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
