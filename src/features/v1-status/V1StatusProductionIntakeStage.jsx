import { UploadOutlined } from "@ant-design/icons";
import { StatusPill } from "../../components/ui.jsx";

export function V1StatusProductionIntakeStage({
  d49Readiness,
  productionEnvIntakeVerification,
  sectionRef,
  onPrecheckProductionEnvIntake,
  onOpenEmployeeImport,
  productionEnvIntakePrecheckAction,
  productionEnvMinimumBlockingItems,
  productionEnvMinimumValuesFragmentTemplate,
  productionEnvFixChecklistRef,
  productionEnvMinimumValuesFragmentTemplateRef,
  productionEnvFillTemplateRef,
  scrollV1StatusRefIntoView,
}) {
  const productionEnvIntakeVerificationRef = sectionRef;
  const d49EmployeeRoles = d49Readiness?.employees?.roles ?? [];
  const d49EnvironmentBlockers = d49Readiness?.blockers?.filter((item) => item.category !== "employee") ?? [];
  const d49EnvironmentBlockerGroups = groupD49EnvironmentBlockers(d49EnvironmentBlockers);
  return (
    <>
          {productionEnvIntakeVerification ? (
            <section className="detail-section v1-workspace-panel v1-workspace-production v1-section-env_intake" ref={productionEnvIntakeVerificationRef}>
              <div className="v1-section-title-row">
                <h3>生产 env 真实值校验</h3>
                <div className="v1-section-title-actions">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={onPrecheckProductionEnvIntake}
                    disabled={!onPrecheckProductionEnvIntake || productionEnvIntakePrecheckAction.loading}
                  >
                    {productionEnvIntakePrecheckAction.loading ? "校验中" : "重新校验真实值"}
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvFixChecklistRef)}>
                    查看修正清单
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvMinimumValuesFragmentTemplateRef)}>
                    查看最小片段
                  </button>
                  <button className="ghost-button" type="button" onClick={() => scrollV1StatusRefIntoView(productionEnvFillTemplateRef)}>
                    查看填写草稿
                  </button>
                </div>
              </div>
              {d49Readiness ? (
                <div className="v1-production-env-intake-priority">
                  <div className="v1-section-title-row">
                    <div>
                      <StatusPill tone={d49Readiness.ready ? "success" : "danger"}>
                        {d49Readiness.statusLabel}
                      </StatusPill>
                      <strong>D49 员工与环境联合预检</strong>
                    </div>
                    {onOpenEmployeeImport ? (
                      <button className="ghost-button" type="button" onClick={onOpenEmployeeImport}>
                        <UploadOutlined /> 打开员工导入
                      </button>
                    ) : null}
                  </div>
                  <div className="v1-field-intake-summary">
                    <span>正式岗位 <strong>{d49Readiness.summary.employeeRoleLabel}</strong></span>
                    <span>正式账号 <strong>{d49Readiness.summary.readyFormalAccountCount}/{d49Readiness.summary.formalAccountCount}</strong></span>
                    <span>setup <strong>{d49Readiness.summary.envSetupReady ? "通过" : "阻塞"}</strong></span>
                    <span>env 审计 <strong>{d49Readiness.summary.envAuditReady ? "通过" : "阻塞"}</strong></span>
                    <span>env 预检 <strong>{d49Readiness.summary.envPreflightLabel}</strong></span>
                    <span>intake <strong>{d49Readiness.summary.envIntakeConfiguredLabel}</strong></span>
                    <span>阻塞 <strong>{d49Readiness.summary.blockerLabel}</strong></span>
                  </div>
                  <p>{d49Readiness.nextAction}</p>
                  {d49EmployeeRoles.length ? (
                    <div className="v1-d49-role-grid" aria-label="D49八岗位就绪矩阵">
                      {d49EmployeeRoles.map((role) => (
                        <div className={`v1-d49-role-row ${role.ready ? "ready" : "blocked"}`} key={role.roleKey}>
                          <div>
                            <strong>{role.roleLabel}</strong>
                            <StatusPill tone={role.ready ? "success" : "danger"}>{role.ready ? "就绪" : "阻塞"}</StatusPill>
                          </div>
                          <span>可用 {role.readyAccountCount}/{role.accountCount}</span>
                          <small>
                            {role.ready
                              ? "正式账号可用"
                              : role.blockers.length
                                ? role.blockers.map((item) => `${item.label} ${item.count}`).join("、")
                                : "未导入正式账号"}
                          </small>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {d49EnvironmentBlockers.length ? (
                    <div className="v1-production-env-intake-blockers v1-d49-environment-blockers" aria-label="D49环境阻塞">
                      <strong>
                        环境阻塞 {d49EnvironmentBlockers.length} 项
                        {d49EnvironmentBlockerGroups.length < d49EnvironmentBlockers.length
                          ? ` / ${d49EnvironmentBlockerGroups.length} 组`
                          : ""}
                      </strong>
                      {d49EnvironmentBlockerGroups.map((item) => (
                        <p key={item.key || item.label}>
                          {item.label}{item.count > 1 ? ` ×${item.count}` : ""}：{item.nextAction || item.detail}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="v1-field-intake-summary">
                <span>真实值清单 <strong>{productionEnvIntakeVerification.summary.configuredLabel}</strong></span>
                <span>最小阻塞补值 <strong>{productionEnvIntakeVerification.summary.minimumBlockingLabel}</strong></span>
                <span>建议 / 可选补值 <strong>{productionEnvIntakeVerification.summary.minimumWarningLabel}</strong></span>
                <span>缺失 <strong>{productionEnvIntakeVerification.summary.missingRowCount} 行</strong></span>
                <span>阻塞 <strong>{productionEnvIntakeVerification.summary.blockingLabel}</strong></span>
                <span>警告 <strong>{productionEnvIntakeVerification.summary.warningLabel}</strong></span>
                <span>任选组 <strong>{productionEnvIntakeVerification.summary.alternativeGroupBlockingCount}/{productionEnvIntakeVerification.summary.alternativeGroupCount} 阻塞</strong></span>
                <span>安全审计 <strong>{productionEnvIntakeVerification.summary.auditReady ? "通过" : "未通过"}</strong></span>
                <span>清单 CSV <strong>{productionEnvIntakeVerification.summary.intakeCsvReady ? "可读" : "未就绪"}</strong></span>
              </div>
              <div className="v1-production-env-intake-priority">
                <strong>优先补值路径</strong>
                <p>
                  先按最小 blocking 片段补齐 {productionEnvIntakeVerification.summary.minimumBlockingMissingCount} 项：
                  {productionEnvIntakeVerification.summary.minimumBlockingVariableRowCount} 个变量行
                  {productionEnvIntakeVerification.summary.minimumBlockingAlternativeGroupCount
                    ? ` + ${productionEnvIntakeVerification.summary.minimumBlockingAlternativeGroupCount} 个任选组`
                    : ""}
                  。补完后先跑真实值 dry-run，通过后再正式合并真实值。
                </p>
                <div className="v1-action-meta">
                  <span>全量清单 {productionEnvIntakeVerification.summary.fullIntakeConfiguredLabel}</span>
                  <span>最小补值缺 {productionEnvIntakeVerification.summary.minimumBlockingMissingCount} 项</span>
                  <span>建议 / 可选缺 {productionEnvIntakeVerification.summary.minimumWarningMissingCount} 项</span>
                  <span>模板 {productionEnvMinimumValuesFragmentTemplate ? "已生成" : "未生成"}</span>
                  <span>仍不接收浏览器 env 值</span>
                </div>
              </div>
              {productionEnvMinimumBlockingItems.length ? (
                <div className="v1-production-env-intake-blockers">
                  <strong>最小补值清单</strong>
                  <p>
                    先补下面 {productionEnvMinimumBlockingItems.length} 项；真实值只填安全 env 文件，页面只显示变量名和值类型。
                  </p>
                  {productionEnvMinimumBlockingItems.map((item) => (
                    <div className="v1-production-env-gate-row" key={item.key || item.variableLabel || item.label}>
                      <div>
                        <StatusPill tone="danger">待补</StatusPill>
                        <strong>{item.label}</strong>
                      </div>
                      <p>{item.nextAction || item.detail || "补齐安全 env 文件后重新校验真实值。"}</p>
                      <div className="v1-production-env-gate-meta">
                        {item.ownerRole ? <span>{item.ownerRole}</span> : null}
                        {item.variableLabel ? <span>{item.variableLabel}</span> : null}
                        {item.sourceSystem ? <span>{item.sourceSystem}</span> : null}
                        {item.expectedValueType ? <span>{item.expectedValueType}</span> : null}
                        <span>已配置 {item.configured || item.configuredKeyCount > 0 ? "是" : "否"}</span>
                        <span>已验收 {item.verifiedMarked ? "是" : "否"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="v1-production-env-intake-result">
                <div>
                  <StatusPill tone={productionEnvIntakeVerification.ready ? "success" : productionEnvIntakeVerification.status === "blocked" ? "danger" : "warning"}>
                    {productionEnvIntakeVerification.statusLabel}
                  </StatusPill>
                  <strong>{productionEnvIntakeVerification.summary.label}</strong>
                </div>
                <p>{productionEnvIntakeVerification.nextActions[0] || "按真实值清单补齐安全 env 文件，再重新运行生产 env 真实值校验。"}</p>
                <div className="v1-action-meta">
                  <span>env 路径暴露 {productionEnvIntakeVerification.safeguards?.envFilePathIncluded ? "是" : "否"}</span>
                  <span>真实值暴露 {productionEnvIntakeVerification.safeguards?.envValuesIncluded ? "是" : "否"}</span>
                  <span>secret 暴露 {productionEnvIntakeVerification.safeguards?.secretFieldsIncluded ? "是" : "否"}</span>
                  <span>原始证据号暴露 {productionEnvIntakeVerification.safeguards?.rawProofRefIncluded ? "是" : "否"}</span>
                </div>
              </div>
              {productionEnvIntakePrecheckAction.result || productionEnvIntakePrecheckAction.error ? (
                <div className="v1-production-env-intake-live-result">
                  {productionEnvIntakePrecheckAction.result ? (
                    <>
                      <div>
                        <StatusPill
                          tone={
                            productionEnvIntakePrecheckAction.result.ready
                              ? "success"
                              : productionEnvIntakePrecheckAction.result.status === "error"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {productionEnvIntakePrecheckAction.result.statusLabel}
                        </StatusPill>
                        <strong>最近真实值校验</strong>
                      </div>
                      <p>{productionEnvIntakePrecheckAction.result.nextAction}</p>
                      <div className="v1-field-intake-summary">
                        <span>真实值清单 <strong>{productionEnvIntakePrecheckAction.result.summary.configuredLabel}</strong></span>
                        <span>最小补值 <strong>{productionEnvIntakePrecheckAction.result.summary.minimumBlockingLabel}</strong></span>
                        <span>建议 / 可选 <strong>{productionEnvIntakePrecheckAction.result.summary.minimumWarningLabel}</strong></span>
                        <span>阻塞 <strong>{productionEnvIntakePrecheckAction.result.summary.blockerLabel}</strong></span>
                        <span>setup 安全文件 <strong>{productionEnvIntakePrecheckAction.result.summary.envFileFromProductionSetup ? "已复用" : "未就绪"}</strong></span>
                        <span>清单 CSV <strong>{productionEnvIntakePrecheckAction.result.summary.intakeCsvReady ? "可读" : "未就绪"}</strong></span>
                        <span>请求体 <strong>{productionEnvIntakePrecheckAction.result.summary.requestBodyIgnored ? "已忽略" : "未确认"}</strong></span>
                        <span>路径暴露 <strong>{productionEnvIntakePrecheckAction.result.summary.envFilePathExposed ? "是" : "否"}</strong></span>
                        <span>写 env <strong>{productionEnvIntakePrecheckAction.result.summary.productionEnvFileMutated ? "是" : "否"}</strong></span>
                        <span>候选刷新 <strong>{productionEnvIntakePrecheckAction.result.summary.releaseCandidateRefreshed ? "是" : "否"}</strong></span>
                      </div>
                      {productionEnvIntakePrecheckAction.result.serverConfigGuidance?.steps?.length ? (
                        <div className="v1-production-env-file-audit-guidance">
                          <strong>{productionEnvIntakePrecheckAction.result.serverConfigGuidance.label || "真实值校验边界"}</strong>
                          <p>
                            输入 {productionEnvIntakePrecheckAction.result.serverConfigGuidance.primaryInput || "production env setup latest"}
                            ；前端传路径 {productionEnvIntakePrecheckAction.result.serverConfigGuidance.acceptsFrontendPath ? "允许" : "不允许"}
                          </p>
                          <div className="v1-action-meta">
                            <span>setup 报告 {productionEnvIntakePrecheckAction.result.serverConfigGuidance.setupReportAvailable ? "存在" : "缺失"}</span>
                            <span>setup ready {productionEnvIntakePrecheckAction.result.serverConfigGuidance.setupReady ? "是" : "否"}</span>
                            <span>env 文件数 {productionEnvIntakePrecheckAction.result.serverConfigGuidance.envFileCount}</span>
                            <span>路径暴露 {productionEnvIntakePrecheckAction.result.serverConfigGuidance.pathValueExposed ? "是" : "否"}</span>
                          </div>
                          <ul>
                            {productionEnvIntakePrecheckAction.result.serverConfigGuidance.steps.slice(0, 4).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {(productionEnvIntakePrecheckAction.result.blockingItems.length || productionEnvIntakePrecheckAction.result.blockingFindings.length) ? (
                        <div className="v1-production-env-intake-blockers">
                          {[...productionEnvIntakePrecheckAction.result.blockingItems, ...productionEnvIntakePrecheckAction.result.blockingFindings].slice(0, 5).map((item) => (
                            <p key={item.key || item.label}>
                              {item.label}：{item.nextAction || item.detail}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>{productionEnvIntakePrecheckAction.error}</p>
                  )}
                </div>
              ) : null}
              {(productionEnvIntakeVerification.blockingFindings.length || productionEnvIntakeVerification.warningFindings.length) ? (
                <div className="v1-production-env-intake-blockers">
                  {[...productionEnvIntakeVerification.blockingFindings, ...productionEnvIntakeVerification.warningFindings].slice(0, 6).map((item) => (
                    <div className="v1-production-env-gate-row" key={item.key || item.label}>
                      <div>
                        <StatusPill tone={item.severity === "blocking" ? "danger" : item.severity === "warning" ? "warning" : "success"}>
                          {item.severity === "blocking" ? "阻塞" : item.severity === "warning" ? "警告" : "已通过"}
                        </StatusPill>
                        <strong>{item.label}</strong>
                      </div>
                      <p>{item.nextAction || item.detail}</p>
                      <div className="v1-production-env-gate-meta">
                        {item.ownerRole ? <span>{item.ownerRole}</span> : null}
                        {item.variableLabel ? <span>{item.variableLabel}</span> : null}
                        {item.sourceSystem ? <span>{item.sourceSystem}</span> : null}
                        {item.expectedValueType ? <span>{item.expectedValueType}</span> : null}
                        <span>已配置 {item.configured || item.configuredKeyCount > 0 ? "是" : "否"}</span>
                        <span>已验收 {item.verifiedMarked ? "是" : "否"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
    </>
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
