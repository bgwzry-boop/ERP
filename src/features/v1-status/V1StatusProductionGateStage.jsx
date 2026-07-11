import { StatusPill } from "../../components/ui.jsx";
import { renderV1ProductionEnvFileSourceStatusList } from "./V1StatusOverview.jsx";

export function V1StatusProductionGateStage({
  productionEnvGate,
  sectionRef,
  onPrecheckProductionEnvFileAudit,
  productionEnvFileAuditPrecheckAction,
  onPrecheckProductionEnvFilePreview,
  productionEnvFilePreviewPrecheckAction,
  canShowProductionEnvFrontDoorReview,
  canRunProductionEnvFrontDoorReview,
  runProductionEnvFrontDoorReview,
  productionEnvFrontDoorReviewLoading,
  onRunProductionEnvSetup,
  productionEnvSetupAction,
  onPrecheckProductionEnv,
  productionEnvPrecheckAction,
  onPrecheckProductionGoLive,
  productionGoLivePrecheckAction,
  buildProductionEnvGateActions,
}) {
  const productionEnvGateRef = sectionRef;
  return (
    <>
          {productionEnvGate ? (
            <section className="detail-section v1-workspace-panel v1-workspace-production v1-section-env_gate" ref={productionEnvGateRef}>
              <div className="v1-section-title-row">
                <h3>生产配置门禁</h3>
                <div className="v1-section-title-actions">
                  <button className="ghost-button" type="button" onClick={() => runProductionEnvFrontDoorReview()} disabled={!canShowProductionEnvFrontDoorReview || !canRunProductionEnvFrontDoorReview}>
                    {productionEnvFrontDoorReviewLoading ? "连续预检中" : "env 连续预检"}
                  </button>
                  <button className="primary-button" type="button" onClick={onRunProductionEnvSetup} disabled={!onRunProductionEnvSetup || productionEnvSetupAction.loading}>
                    {productionEnvSetupAction.loading ? "准备中" : "生成/复核安全草稿"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckProductionEnvFileAudit} disabled={!onPrecheckProductionEnvFileAudit || productionEnvFileAuditPrecheckAction.loading}>
                    {productionEnvFileAuditPrecheckAction.loading ? "审计中" : "env 文件审计"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckProductionEnvFilePreview} disabled={!onPrecheckProductionEnvFilePreview || productionEnvFilePreviewPrecheckAction.loading}>
                    {productionEnvFilePreviewPrecheckAction.loading ? "预检中" : "文件应用预检"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onPrecheckProductionEnv} disabled={!onPrecheckProductionEnv || productionEnvPrecheckAction.loading}>
                    {productionEnvPrecheckAction.loading ? "预检中" : "当前预检"}
                  </button>
                  <button className="primary-button" type="button" onClick={onPrecheckProductionGoLive} disabled={!onPrecheckProductionGoLive || productionGoLivePrecheckAction.loading}>
                    {productionGoLivePrecheckAction.loading ? "预检中" : "组合预检"}
                  </button>
                </div>
              </div>
              <div className="v1-production-env-gate-summary">
                <span>通过 <strong>{productionEnvGate.summary.passedLabel}</strong></span>
                <span>阻塞 <strong>{productionEnvGate.summary.blockingLabel}</strong></span>
                <span>警告 <strong>{productionEnvGate.summary.warningLabel}</strong></span>
                <span>env 文件审计 <strong>{productionEnvGate.summary.auditStatusLabel}</strong></span>
              </div>
              {productionEnvSetupAction.result || productionEnvSetupAction.error ? (
                <div className="v1-production-env-setup-live-result">
                  {productionEnvSetupAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={productionEnvSetupAction.result.ready ? "success" : productionEnvSetupAction.result.status === "error" ? "danger" : productionEnvSetupAction.result.status === "prepared" ? "warning" : "danger"}>
                          {productionEnvSetupAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近安全草稿 setup</strong>
                      </div>
                      <p>{productionEnvSetupAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>setup <strong>{productionEnvSetupAction.result.summary.setupReady ? "已准备" : "未就绪"}</strong></span>
                        <span>审计 <strong>{productionEnvSetupAction.result.summary.auditReady ? "通过" : "未通过"}</strong></span>
                        <span>env 预检 <strong>{productionEnvSetupAction.result.summary.envPreflightLabel || "0/0"}</strong></span>
                        <span>剩余修正 <strong>{productionEnvSetupAction.result.summary.remainingFixItemCount || 0} 项</strong></span>
                        <span>目标 env 写入 <strong>{productionEnvSetupAction.result.summary.targetEnvFileWritten ? "是" : "否"}</strong></span>
                        <span>真实值写入 <strong>{productionEnvSetupAction.result.summary.productionEnvRealValuesWritten ? "是" : "否"}</strong></span>
                        <span>路径暴露 <strong>{productionEnvSetupAction.result.summary.targetEnvFilePathExposed ? "是" : "否"}</strong></span>
                        <span>请求体 <strong>{productionEnvSetupAction.result.summary.requestBodyIgnored ? "已忽略" : "未忽略"}</strong></span>
                        <span>候选刷新 <strong>{productionEnvSetupAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {productionEnvSetupAction.result.serverConfigGuidance?.steps?.length ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>服务端 setup 指引</strong>
                          <div className="v1-action-meta">
                            <span>目标来源 {productionEnvSetupAction.result.serverConfigGuidance.targetSource || "server-default"}</span>
                            <span>前端目标路径 {productionEnvSetupAction.result.serverConfigGuidance.acceptsFrontendTargetPath ? "允许" : "不允许"}</span>
                            <span>前端导入路径 {productionEnvSetupAction.result.serverConfigGuidance.acceptsFrontendImportPath ? "允许" : "不允许"}</span>
                            <span>前端 env 值 {productionEnvSetupAction.result.serverConfigGuidance.acceptsFrontendEnvValues ? "允许" : "不允许"}</span>
                            <span>force 覆盖 {productionEnvSetupAction.result.serverConfigGuidance.forceOverwriteEnabled ? "允许" : "不允许"}</span>
                          </div>
                          <ul>
                            {productionEnvSetupAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {productionEnvSetupAction.result.remainingFixItems.length ? (
                        <div className="v1-production-env-live-blockers">
                          {productionEnvSetupAction.result.remainingFixItems.slice(0, 5).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.missingVariables.join(" / ")}
                            </p>
                          ))}
                        </div>
                      ) : productionEnvSetupAction.result.setupFindings.length ? (
                        <div className="v1-production-env-live-blockers">
                          {productionEnvSetupAction.result.setupFindings.slice(0, 5).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionEnvSetupAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionEnvFileAuditPrecheckAction.result || productionEnvFileAuditPrecheckAction.error ? (
                <div className="v1-production-env-file-audit-live-result">
                  {productionEnvFileAuditPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={productionEnvFileAuditPrecheckAction.result.ready ? "success" : productionEnvFileAuditPrecheckAction.result.status === "not_configured" ? "warning" : "danger"}>
                          {productionEnvFileAuditPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近 env 文件审计</strong>
                      </div>
                      <p>{productionEnvFileAuditPrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>服务端路径 <strong>{productionEnvFileAuditPrecheckAction.result.summary.envFilePathConfigured ? "已配置" : "未配置"}</strong></span>
                        <span>审计文件 <strong>{productionEnvFileAuditPrecheckAction.result.summary.fileCount} 个</strong></span>
                        <span>阻塞 <strong>{productionEnvFileAuditPrecheckAction.result.summary.blockingLabel}</strong></span>
                        <span>警告 <strong>{productionEnvFileAuditPrecheckAction.result.summary.warningLabel}</strong></span>
                        <span>跨文件重复 <strong>{productionEnvFileAuditPrecheckAction.result.summary.crossFileDuplicateVariableCount || 0} 个</strong></span>
                        <span>
                          当前来源{" "}
                          <strong>
                            {productionEnvFileAuditPrecheckAction.result.summary.selectedEnvVariable
                              ? `${productionEnvFileAuditPrecheckAction.result.summary.selectedEnvVariableLabel || "变量"} ${productionEnvFileAuditPrecheckAction.result.summary.selectedEnvVariable}`
                              : "未配置"}
                          </strong>
                        </span>
                        <span>前端路径输入 <strong>{productionEnvFileAuditPrecheckAction.result.summary.envFilePathAccepted ? "允许" : "不允许"}</strong></span>
                        <span>路径暴露 <strong>{productionEnvFileAuditPrecheckAction.result.safeguards?.envFilePathExposed ? "是" : "否"}</strong></span>
                      </div>
                      {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance?.primaryEnvVariable ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>服务端配置指引</strong>
                          <p>
                            主变量 {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.primaryEnvVariable}
                            {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.fallbackEnvVariables.length
                              ? `；fallback ${productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.fallbackEnvVariables.join(" / ")}`
                              : ""}
                          </p>
                          <div className="v1-action-meta">
                            <span>
                              当前来源{" "}
                              {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.selectedEnvVariable
                                ? `${productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.selectedEnvVariableLabel || "变量"} ${productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.selectedEnvVariable}`
                                : "未配置"}
                            </span>
                            <span>fallback 使用 {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.fallbackSourceUsed ? "是" : "否"}</span>
                            <span>已配置来源 {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.configuredSourceVariableCount || 0} 个</span>
                            <span>被忽略 fallback {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.ignoredConfiguredFallbackVariableCount || 0} 个</span>
                            <span>重启 API {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.restartRequired ? "需要" : "不需要"}</span>
                            <span>前端传路径 {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.acceptsFrontendPath ? "允许" : "不允许"}</span>
                            <span>真实路径暴露 {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.pathValueExposed ? "是" : "否"}</span>
                          </div>
                          {renderV1ProductionEnvFileSourceStatusList(productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.sourceStatuses)}
                          <ul>
                            {productionEnvFileAuditPrecheckAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {productionEnvFileAuditPrecheckAction.result.files.length ? (
                        <div className="v1-production-env-file-audit-files">
                          {productionEnvFileAuditPrecheckAction.result.files.slice(0, 3).map((item) => (
                            <span key={item.key}>
                              {item.label}：变量 {item.variableCount} 个 / 占位 {item.placeholderAssignmentCount} 个 / 权限 {item.fileMode || "未知"}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {(productionEnvFileAuditPrecheckAction.result.blockingFindings.length || productionEnvFileAuditPrecheckAction.result.warningFindings.length) ? (
                        <div className="v1-production-env-file-audit-blockers">
                          {[...productionEnvFileAuditPrecheckAction.result.blockingFindings, ...productionEnvFileAuditPrecheckAction.result.warningFindings].slice(0, 4).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionEnvFileAuditPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionEnvFilePreviewPrecheckAction.result || productionEnvFilePreviewPrecheckAction.error ? (
                <div className="v1-production-env-file-preview-live-result">
                  {productionEnvFilePreviewPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={productionEnvFilePreviewPrecheckAction.result.ready ? "success" : productionEnvFilePreviewPrecheckAction.result.status === "not_configured" ? "warning" : "danger"}>
                          {productionEnvFilePreviewPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近 env 文件应用预检</strong>
                      </div>
                      <p>{productionEnvFilePreviewPrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>服务端路径 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.envFilePathConfigured ? "已配置" : "未配置"}</strong></span>
                        <span>内存应用 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.appliedInMemory ? "是" : "否"}</strong></span>
                        <span>当前进程改写 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.processEnvMutated ? "是" : "否"}</strong></span>
                        <span>通过 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.passedLabel}</strong></span>
                        <span>阻塞 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>审计 <strong>{productionEnvFilePreviewPrecheckAction.result.summary.envFileAuditStatusLabel || "未执行"}</strong></span>
                        <span>当前阶段 <strong>{productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.currentStageLabel || productionEnvFilePreviewPrecheckAction.result.summary.currentStageLabel || "未识别"}</strong></span>
                        <span>
                          配置源{" "}
                          <strong>
                            {productionEnvFilePreviewPrecheckAction.result.summary.selectedEnvVariable
                              ? `${productionEnvFilePreviewPrecheckAction.result.summary.selectedEnvVariableLabel || "变量"} ${productionEnvFilePreviewPrecheckAction.result.summary.selectedEnvVariable}`
                              : "未配置"}
                          </strong>
                        </span>
                      </div>
                      {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.currentStageLabel ? (
                        <div className="v1-production-env-file-preview-stage">
                          <div>
                            <StatusPill tone={productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.stageStatus === "ready" ? "success" : productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.stageStatus === "not_configured" ? "warning" : "danger"}>
                              {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.stageStatusLabel || "待处理"}
                            </StatusPill>
                            <strong>{productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.currentStageLabel}</strong>
                            {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.nextStageLabel ? (
                              <span>下一阶段：{productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.nextStageLabel}</span>
                            ) : null}
                          </div>
                          <div className="v1-action-meta">
                            <span>
                              配置源{" "}
                              {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.selectedEnvVariable
                                ? `${productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.selectedEnvVariableLabel || "变量"} ${productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.selectedEnvVariable}`
                                : "未配置"}
                            </span>
                            <span>fallback 使用 {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.fallbackSourceUsed ? "是" : "否"}</span>
                            <span>已配置来源 {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.configuredSourceVariableCount || 0} 个</span>
                          </div>
                          {renderV1ProductionEnvFileSourceStatusList(productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.sourceStatuses)}
                          {productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.detail ? (
                            <p>{productionEnvFilePreviewPrecheckAction.result.stageDiagnosis.detail}</p>
                          ) : null}
                        </div>
                      ) : null}
                      {productionEnvFilePreviewPrecheckAction.result.blockingChecks.length ? (
                        <div className="v1-production-env-file-preview-blockers">
                          {productionEnvFilePreviewPrecheckAction.result.blockingChecks.slice(0, 4).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionEnvFilePreviewPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionEnvPrecheckAction.result || productionEnvPrecheckAction.error ? (
                <div className="v1-production-env-live-result">
                  {productionEnvPrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={productionEnvPrecheckAction.result.ready ? "success" : "warning"}>
                          {productionEnvPrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近 env 预检</strong>
                      </div>
                      <p>{productionEnvPrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>当前进程 <strong>{productionEnvPrecheckAction.result.summary.currentRuntime ? "是" : "否"}</strong></span>
                        <span>通过 <strong>{productionEnvPrecheckAction.result.summary.passedLabel}</strong></span>
                        <span>阻塞 <strong>{productionEnvPrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>警告 <strong>{productionEnvPrecheckAction.result.summary.warningLabel}</strong></span>
                        <span>env 路径输入 <strong>{productionEnvPrecheckAction.result.summary.envFilePathAccepted ? "允许" : "不允许"}</strong></span>
                        <span>候选刷新 <strong>{productionEnvPrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {productionEnvPrecheckAction.result.blockingChecks.length ? (
                        <div className="v1-production-env-live-blockers">
                          {productionEnvPrecheckAction.result.blockingChecks.slice(0, 3).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionEnvPrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {productionGoLivePrecheckAction.result || productionGoLivePrecheckAction.error ? (
                <div className="v1-production-go-live-live-result">
                  {productionGoLivePrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill tone={productionGoLivePrecheckAction.result.ready ? "success" : productionGoLivePrecheckAction.result.status === "error" ? "danger" : "warning"}>
                          {productionGoLivePrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近生产上线组合预检</strong>
                      </div>
                      <p>{productionGoLivePrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>阶段 <strong>{productionGoLivePrecheckAction.result.summary.readinessLabel}</strong></span>
                        <span>阻塞 <strong>{productionGoLivePrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>env 文件 <strong>{productionGoLivePrecheckAction.result.summary.configuredEnvFileCount} 个</strong></span>
                        <span>当前实例 <strong>{productionGoLivePrecheckAction.result.summary.currentRuntime ? "是" : "否"}</strong></span>
                        <span>应用 env <strong>{productionGoLivePrecheckAction.result.summary.productionEnvAppliedToProcess ? "是" : "否"}</strong></span>
                        <span>候选刷新 <strong>{productionGoLivePrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {renderV1ProductionEnvFileSourceStatusList(productionGoLivePrecheckAction.result.summary.sourceStatuses)}
                      {productionGoLivePrecheckAction.result.fieldEvidenceCoverage.items.length ? (
                        <div className="v1-production-go-live-evidence-coverage">
                          <div>
                            <strong>现场证据覆盖</strong>
                            <span>
                              报告可支持 <strong>{productionGoLivePrecheckAction.result.fieldEvidenceCoverage.summary.reportSupportedLabel}</strong>
                            </span>
                            <span>
                              仍需补证 <strong>{productionGoLivePrecheckAction.result.fieldEvidenceCoverage.summary.stillNeedsFieldEvidenceLabel}</strong>
                            </span>
                          </div>
                          <p>{productionGoLivePrecheckAction.result.fieldEvidenceCoverage.summary.nextAction}</p>
                          {productionGoLivePrecheckAction.result.fieldEvidenceCoverage.items.slice(0, 5).map((item) => (
                            <div className="v1-production-go-live-evidence-row" key={`${item.groupKey}-${item.itemKey}`}>
                              <StatusPill
                                tone={
                                  item.status === "report_supported"
                                    ? "success"
                                    : item.status === "needs_onsite_ref"
                                      ? "warning"
                                      : "danger"
                                }
                              >
                                {item.statusLabel}
                              </StatusPill>
                              <div>
                                <strong>{item.groupLabel} / {item.itemLabel}</strong>
                                <p>{item.nextAction}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {productionGoLivePrecheckAction.result.stages.length ? (
                        <div className="v1-production-go-live-stages">
                          {productionGoLivePrecheckAction.result.stages.map((stage) => (
                            <div className="v1-production-go-live-stage" key={stage.key || stage.label}>
                              <StatusPill tone={stage.ready ? "success" : "warning"}>
                                {stage.ready ? "通过" : "阻塞"}
                              </StatusPill>
                              <div>
                                <strong>{stage.label}</strong>
                                <p>{stage.summary.label || stage.nextActions[0] || "等待预检结果"}</p>
                                {stage.blockingItems.length ? (
                                  <div className="v1-production-go-live-blockers">
                                    {stage.blockingItems.slice(0, 3).map((item) => (
                                      <span key={item.key || item.label}>{item.label}：{item.detail}</span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {productionGoLivePrecheckAction.result.unblockChecklist.length ? (
                        <div className="v1-production-go-live-unblock-list">
                          <strong>解除阻塞清单</strong>
                          {productionGoLivePrecheckAction.result.unblockChecklist.slice(0, 4).map((item) => (
                            <div className="v1-production-go-live-unblock-row" key={item.key || item.label}>
                              <div>
                                <StatusPill tone={item.ready ? "success" : "warning"}>
                                  {item.ready ? "已通过" : "待处理"}
                                </StatusPill>
                                <strong>{item.stageOrder ? `${item.stageOrder}. ${item.label}` : item.label}</strong>
                                <span>{item.ownerRole}</span>
                              </div>
                              <p>{item.nextAction}</p>
                              {item.verificationSteps.length || item.evidenceToKeep.length ? (
                                <div className="v1-production-go-live-unblock-meta">
                                  {item.verificationSteps[0] ? <span>复核：{item.verificationSteps[0]}</span> : null}
                                  {item.evidenceToKeep[0] ? <span>留证：{item.evidenceToKeep[0]}</span> : null}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionGoLivePrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              <div className="v1-production-env-audit">
                <StatusPill tone={productionEnvGate.audit.included ? productionEnvGate.audit.ready ? "success" : "warning" : "warning"}>
                  {productionEnvGate.audit.statusLabel}
                </StatusPill>
                <div>
                  <strong>env 文件审计</strong>
                  <p>{productionEnvGate.audit.summary.label || "填写安全 env 文件后重新执行 env 文件安全审计。"}</p>
                </div>
              </div>
              <div className="v1-production-env-gate-list">
                {(productionEnvGate.blockingChecks.length ? productionEnvGate.blockingChecks : productionEnvGate.checks).slice(0, 5).map((item) => {
                  const gateActions = buildProductionEnvGateActions(item);
                  return (
                    <div className="v1-production-env-gate-row" key={item.key || item.label}>
                      <div>
                        <StatusPill tone={item.severity === "blocking" ? "danger" : item.severity === "warning" ? "warning" : "success"}>
                          {item.severity === "blocking" ? "阻塞" : item.severity === "warning" ? "警告" : "已通过"}
                        </StatusPill>
                        <strong>{item.label}</strong>
                      </div>
                      <p>{item.nextAction}</p>
                      <div className="v1-production-env-gate-meta">
                        <span>{item.ownerRole}</span>
                        <span>{item.configuredVariableCount}/{item.totalVariableCount} 已配置</span>
                        {item.variableLabel ? <span>{item.variableLabel}</span> : null}
                      </div>
                      {gateActions.length ? (
                        <div className="v1-production-env-gate-actions">
                          {gateActions.map((action) => (
                            <button
                              className="ghost-button"
                              disabled={action.disabled}
                              key={`${item.key || item.label}-${action.key}`}
                              onClick={action.onClick}
                              type="button"
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <p className="v1-production-env-gate-note">{productionEnvGate.nextAction}</p>
            </section>
          ) : null}
    </>
  );
}
