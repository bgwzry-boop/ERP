import { StatusPill } from "../../components/ui.jsx";
import {
  buildProductionEnvVariableChecksForPage,
  getProductionEnvVariableCheckCountLabelForPage,
  getProductionEnvVariableCheckOverlayItemForPage,
} from "./v1StatusPresentation.js";

export function V1StatusProductionEnvFixStage({
  productionEnvFixChecklist,
  sectionRef,
  productionEnvFixItemsForPage,
  productionEnvVariableCheckOverlay,
  showAllProductionEnvFixItems,
  setShowAllProductionEnvFixItems,
  productionEnvTemplateSectionIndexByLabel,
  focusProductionEnvTemplateSection,
}) {
  const productionEnvFixChecklistRef = sectionRef;
  return (
    <>
          {productionEnvFixChecklist ? (
            <section className="detail-section v1-workspace-panel v1-workspace-production v1-section-env_fix" ref={productionEnvFixChecklistRef}>
              <h3>生产环境修正清单</h3>
              <div className="v1-env-fix-summary">
                <span>清单 <strong>{productionEnvFixChecklist.summary.itemCount} 项</strong></span>
                <span>阻塞 <strong>{productionEnvFixChecklist.summary.blockingCount} 项</strong></span>
                <span>警告 <strong>{productionEnvFixChecklist.summary.warningCount} 项</strong></span>
                <span>变量 <strong>{productionEnvFixChecklist.summary.configuredLabel}</strong></span>
              </div>
              <div className="v1-env-fix-list">
                <div className="v1-env-list-head">
                  <strong>修正项</strong>
                  <span>{productionEnvFixItemsForPage.length}/{productionEnvFixChecklist.items.length}</span>
                </div>
                {productionEnvFixItemsForPage.map((item) => {
                  const liveVariableCheckItem = getProductionEnvVariableCheckOverlayItemForPage(productionEnvVariableCheckOverlay, item);
                  const variableChecks = buildProductionEnvVariableChecksForPage(item, liveVariableCheckItem);
                  const variableCheckSourceLabel = liveVariableCheckItem?.sourceLabel || "交接包快照";
                  const variableCheckCountLabel = getProductionEnvVariableCheckCountLabelForPage(liveVariableCheckItem || item);
                  return (
                    <div className="v1-env-fix-row" key={item.key || item.label}>
                      <div>
                        <StatusPill tone={item.severity === "blocking" ? "danger" : item.severity === "warning" ? "warning" : "success"}>
                          {item.severity === "blocking" ? "阻塞" : item.severity === "warning" ? "警告" : "已通过"}
                        </StatusPill>
                        <strong>{item.label}</strong>
                        {productionEnvTemplateSectionIndexByLabel.has(item.label) ? (
                          <button className="ghost-button v1-env-template-locate-button" type="button" onClick={() => focusProductionEnvTemplateSection(item)}>
                            定位草稿段
                          </button>
                        ) : null}
                      </div>
                      <p>{item.nextAction}</p>
                      <div className="v1-env-fix-meta">
                        <span>{item.ownerRole}</span>
                        <span>{item.configuredVariableCount}/{item.totalVariableCount} 已配置</span>
                        {item.variableLabel ? <span>{item.variableLabel}</span> : null}
                        {!productionEnvTemplateSectionIndexByLabel.has(item.label) ? <span>无 env 草稿段</span> : null}
                      </div>
                      <div className="v1-env-variable-checks">
                        <div className="v1-env-variable-check-head">
                          <strong>变量检查</strong>
                          <span className={`v1-env-variable-check-source ${liveVariableCheckItem ? "live" : ""}`}>
                            {liveVariableCheckItem ? `最近预检：${variableCheckSourceLabel} ${variableCheckCountLabel}` : `来源：${variableCheckSourceLabel} ${variableCheckCountLabel}`}
                          </span>
                        </div>
                        <div className="v1-env-variable-check-list">
                          {variableChecks.length ? variableChecks.map((variable) => (
                            <span className={`v1-env-variable-chip ${variable.status}`} key={`${item.key || item.label}-${variable.name}`}>
                              <strong>{variable.statusLabel}</strong>
                              {variable.name}
                            </span>
                          )) : (
                            <span className="v1-env-variable-chip none">
                              <strong>无需填写</strong>
                              当前项没有待填写变量
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {productionEnvFixChecklist.items.length > 6 ? (
                  <button className="ghost-button v1-env-list-toggle" type="button" onClick={() => setShowAllProductionEnvFixItems((value) => !value)}>
                    {showAllProductionEnvFixItems ? "收起 env 修正项" : "展开全部 env 修正项"}
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
    </>
  );
}
