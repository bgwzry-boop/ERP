import { StatusPill } from "../../components/ui.jsx";

export function V1StatusFieldAcceptanceWorkspace({ fieldAcceptanceReport, sectionRef }) {
  if (!fieldAcceptanceReport) {
    return null;
  }

  return (
    <section
      className="detail-section v1-workspace-panel v1-workspace-runtime v1-section-acceptance"
      ref={sectionRef}
    >
      <h3>现场验收报告</h3>
      <div className="v1-field-acceptance-summary">
        <span>通过 <strong>{fieldAcceptanceReport.summary.passedLabel}</strong></span>
        <span>阻塞 <strong>{fieldAcceptanceReport.summary.blockingLabel}</strong></span>
        <span>显示 <strong>{fieldAcceptanceReport.summary.shownBlockingLabel}</strong></span>
      </div>
      <p className="v1-field-acceptance-conclusion">{fieldAcceptanceReport.conclusion}</p>
      <div className="v1-field-acceptance-module-list">
        {fieldAcceptanceReport.modules.map((item) => (
          <div className="v1-field-acceptance-module-row" key={item.key}>
            <div>
              <StatusPill tone={item.ready ? "success" : "danger"}>{item.statusLabel}</StatusPill>
              <strong>{item.label}</strong>
            </div>
            <p>{item.detail}</p>
            {item.evidence.length ? (
              <div className="v1-field-acceptance-evidence">
                {item.evidence.map((evidence) => <span key={evidence}>{evidence}</span>)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="v1-field-acceptance-blocker-list">
        {fieldAcceptanceReport.blockingCriteria.map((item) => (
          <div className="v1-field-acceptance-blocker-row" key={item.key}>
            <div>
              <StatusPill tone={item.blocking ? "danger" : "warning"}>{item.statusLabel}</StatusPill>
              <strong>{item.label}</strong>
            </div>
            <p>{item.detail}</p>
            <div className="v1-field-acceptance-meta">
              <span>{item.nextAction}</span>
            </div>
          </div>
        ))}
      </div>
      {fieldAcceptanceReport.requiredFieldEvidence.length ? (
        <div className="v1-field-acceptance-required">
          <strong>现场必须留档</strong>
          <div className="v1-field-acceptance-required-list">
            {fieldAcceptanceReport.requiredFieldEvidence.map((item) => (
              <div className="v1-field-acceptance-required-row" key={item.key}>
                <span>{item.label}<strong>{item.requiredLabel}</strong></span>
                {item.required.slice(0, 2).map((text) => <p key={text}>{text}</p>)}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
