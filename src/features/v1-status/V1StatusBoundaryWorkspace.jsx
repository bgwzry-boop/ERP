import { StatusPill } from "../../components/ui.jsx";

export function V1StatusBoundaryWorkspace({
  v1V2BoundaryBrief,
  sectionRef,
  onRefreshV1V2ScopeBrief,
  v1V2ScopeBriefRefreshAction,
  onPrecheckV1V2Boundary,
  v1V2BoundaryPrecheckAction,
  v1MustContinueItems,
  v2BoundaryDifferences,
  v1V2ModuleDifferences,
  showAllV1MustContinueItems,
  setShowAllV1MustContinueItems,
  showAllV2BoundaryDifferences,
  setShowAllV2BoundaryDifferences,
  showAllV1V2ModuleDifferences,
  setShowAllV1V2ModuleDifferences,
}) {
  const v1V2BoundaryBriefRef = sectionRef;
  const v1MustContinueItemsForPage = v1MustContinueItems;
  const v2BoundaryDifferencesForPage = v2BoundaryDifferences;
  const v1V2ModuleDifferencesForPage = v1V2ModuleDifferences;

  return (
    <>
          {v1V2BoundaryBrief ? (
            <section className="detail-section v1-workspace-panel v1-workspace-boundary v1-section-boundary" ref={v1V2BoundaryBriefRef}>
              <div className="v1-section-title-row">
                <h3>V1/V2 边界</h3>
                <div className="v1-section-title-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onRefreshV1V2ScopeBrief}
                    disabled={!onRefreshV1V2ScopeBrief || v1V2ScopeBriefRefreshAction.loading || v1V2BoundaryPrecheckAction.loading}
                  >
                    {v1V2ScopeBriefRefreshAction.loading ? "刷新中" : "刷新差异"}
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onPrecheckV1V2Boundary}
                    disabled={!onPrecheckV1V2Boundary || v1V2BoundaryPrecheckAction.loading || v1V2ScopeBriefRefreshAction.loading}
                  >
                    {v1V2BoundaryPrecheckAction.loading ? "预检中" : "边界预检"}
                  </button>
                </div>
              </div>
              <p className="v1-v2-boundary-conclusion">{v1V2BoundaryBrief.conclusion}</p>
              <div className="v1-v2-boundary-summary">
                <span>V1 必做 <strong>{v1V2BoundaryBrief.summary.v1MustContinueLabel}</strong></span>
                <span>V2 分类 <strong>{v1V2BoundaryBrief.summary.v2CategoryLabel}</strong></span>
                <span>V2 差异 <strong>{v1V2BoundaryBrief.summary.v2DifferenceLabel}</strong></span>
                <span>模块 <strong>{v1V2BoundaryBrief.summary.moduleDifferenceLabel}</strong></span>
              </div>
              {v1V2ScopeBriefRefreshAction.result || v1V2ScopeBriefRefreshAction.error ? (
                <div className="v1-v2-boundary-precheck-result">
                  {v1V2ScopeBriefRefreshAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={v1V2ScopeBriefRefreshAction.result.ready ? "success" : "warning"}>
                          {v1V2ScopeBriefRefreshAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近差异刷新</strong>
                      </div>
                      <p>{v1V2ScopeBriefRefreshAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>V1 必做 <strong>{v1V2ScopeBriefRefreshAction.result.summary.v1MustContinueLabel}</strong></span>
                        <span>V2 分类 <strong>{v1V2ScopeBriefRefreshAction.result.summary.v2CategoryLabel}</strong></span>
                        <span>V2 差异 <strong>{v1V2ScopeBriefRefreshAction.result.summary.v2DifferenceLabel}</strong></span>
                        <span>模块 <strong>{v1V2ScopeBriefRefreshAction.result.summary.moduleDifferenceLabel}</strong></span>
                        <span>摘要刷新 <strong>{v1V2ScopeBriefRefreshAction.result.summary.scopeBriefRefreshed ? "是" : "否"}</strong></span>
                        <span>候选刷新 <strong>{v1V2ScopeBriefRefreshAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                    </>
                  ) : (
                    <p>{v1V2ScopeBriefRefreshAction.error}</p>
                  )}
                </div>
              ) : null}
              {v1V2BoundaryPrecheckAction.result || v1V2BoundaryPrecheckAction.error ? (
                <div className="v1-v2-boundary-precheck-result">
                  {v1V2BoundaryPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={v1V2BoundaryPrecheckAction.result.ready ? "success" : "warning"}>
                          {v1V2BoundaryPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近边界预检</strong>
                      </div>
                      <p>{v1V2BoundaryPrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>边界 <strong>{v1V2BoundaryPrecheckAction.result.summary.boundaryLabel}</strong></span>
                        <span>V1 必做 <strong>{v1V2BoundaryPrecheckAction.result.summary.v1MustContinueLabel}</strong></span>
                        <span>V2 差异 <strong>{v1V2BoundaryPrecheckAction.result.summary.v2DifferenceLabel}</strong></span>
                        <span>阻塞 <strong>{v1V2BoundaryPrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>候选刷新 <strong>{v1V2BoundaryPrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {v1V2BoundaryPrecheckAction.result.blockers.length ? (
                        <div className="v1-v2-boundary-precheck-blockers">
                          {v1V2BoundaryPrecheckAction.result.blockers.slice(0, 3).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{v1V2BoundaryPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              <div className="v1-v2-boundary-grid">
                <div className="v1-v2-boundary-column">
                  <div className="v1-v2-list-head">
                    <strong>V1 必须继续完成</strong>
                    <span>{v1MustContinueItemsForPage.length}/{v1V2BoundaryBrief.v1MustContinue.length}</span>
                  </div>
                  <div className="v1-v2-boundary-list">
                    {v1MustContinueItemsForPage.map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                  {v1V2BoundaryBrief.v1MustContinue.length > 4 ? (
                    <button className="ghost-button v1-v2-list-toggle" type="button" onClick={() => setShowAllV1MustContinueItems((value) => !value)}>
                      {showAllV1MustContinueItems ? "收起 V1 必做" : "展开全部 V1 必做"}
                    </button>
                  ) : null}
                </div>
                <div className="v1-v2-boundary-column">
                  <div className="v1-v2-list-head">
                    <strong>计划 V2</strong>
                    <span>{v2BoundaryDifferencesForPage.length}/{v1V2BoundaryBrief.v2Differences.length}</span>
                  </div>
                  <div className="v1-v2-category-list">
                    {v1V2BoundaryBrief.v2Categories.map((item) => <span key={item}>{item}</span>)}
                  </div>
                  <div className="v1-v2-boundary-list">
                    {v2BoundaryDifferencesForPage.map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                  {v1V2BoundaryBrief.v2Differences.length > 5 ? (
                    <button className="ghost-button v1-v2-list-toggle" type="button" onClick={() => setShowAllV2BoundaryDifferences((value) => !value)}>
                      {showAllV2BoundaryDifferences ? "收起 V2 差异" : "展开全部 V2 差异"}
                    </button>
                  ) : null}
                </div>
              </div>
              {v1V2BoundaryBrief.moduleDifferences.length ? (
                <div className="v1-v2-module-list">
                  <div className="v1-v2-list-head">
                    <strong>模块差异</strong>
                    <span>{v1V2ModuleDifferencesForPage.length}/{v1V2BoundaryBrief.moduleDifferences.length}</span>
                  </div>
                  {v1V2ModuleDifferencesForPage.map((item) => (
                    <div className="v1-v2-module-row" key={item.module}>
                      <strong>{item.module}</strong>
                      <span>V1：{item.v1}</span>
                      <span>V2：{item.v2}</span>
                    </div>
                  ))}
                  {v1V2BoundaryBrief.moduleDifferences.length > 5 ? (
                    <button className="ghost-button v1-v2-list-toggle" type="button" onClick={() => setShowAllV1V2ModuleDifferences((value) => !value)}>
                      {showAllV1V2ModuleDifferences ? "收起模块差异" : "展开全部模块差异"}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="v1-v2-owner-review">
                <strong>负责人复核</strong>
                <p>{v1V2BoundaryBrief.ownerReview.question}</p>
                <p>{v1V2BoundaryBrief.ownerReview.approvalRule}</p>
              </div>
            </section>
          ) : null}
    </>
  );
}
