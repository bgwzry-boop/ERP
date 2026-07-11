import { getProductionEnvTemplateSectionLabel } from "./v1StatusPresentation.js";

export function V1StatusProductionEnvMinimumStage({
  productionEnvMinimumValuesFragmentTemplate,
  sectionRef,
  productionEnvMinimumTemplateLinesForPage,
  productionEnvMinimumTemplatePreviewLines,
  showAllProductionEnvMinimumTemplateLines,
  setShowAllProductionEnvMinimumTemplateLines,
}) {
  const productionEnvMinimumValuesFragmentTemplateRef = sectionRef;
  return (
    <>
          {productionEnvMinimumValuesFragmentTemplate ? (
            <section className="detail-section v1-production-env-minimum-values-template v1-workspace-panel v1-workspace-production v1-section-env_minimum" ref={productionEnvMinimumValuesFragmentTemplateRef}>
              <h3>最小真实值片段模板</h3>
              <div className="v1-env-template-summary">
                <span>变量 <strong>{productionEnvMinimumValuesFragmentTemplate.summary.variableCount}</strong></span>
                <span>待填写 <strong>{productionEnvMinimumValuesFragmentTemplate.summary.placeholderCount}</strong></span>
                <span>目标 <strong>{productionEnvMinimumValuesFragmentTemplate.summary.targetLabel || "最小补值"}</strong></span>
                <span>阻塞段 <strong>{productionEnvMinimumValuesFragmentTemplate.summary.blockingSectionCount}</strong></span>
                <span>写 env <strong>{productionEnvMinimumValuesFragmentTemplate.safeguards?.productionEnvFileMutated ? "是" : "否"}</strong></span>
                <span>浏览器值 <strong>{productionEnvMinimumValuesFragmentTemplate.safeguards?.browserEnvValuesAccepted ? "接收" : "不接收"}</strong></span>
              </div>
              <p className="v1-production-env-gate-note">
                只展示模板和占位符；真实 PostgreSQL、对象存储、打印命令、spool 路径和 token 仍必须填到安全未跟踪片段后再 dry-run。
              </p>
              <div className="v1-env-list-head">
                <strong>脱敏预览</strong>
                <span>{productionEnvMinimumTemplateLinesForPage.length}/{productionEnvMinimumTemplatePreviewLines.length}</span>
              </div>
              <pre className="v1-env-template-preview">
                {productionEnvMinimumTemplateLinesForPage.map((line, index) => {
                  const sectionLabel = getProductionEnvTemplateSectionLabel(line);
                  return (
                    <span
                      className={[
                        "v1-env-template-line",
                        sectionLabel ? "section" : "",
                      ].filter(Boolean).join(" ")}
                      key={`minimum-${index}-${line}`}
                    >
                      {line}
                    </span>
                  );
                })}
              </pre>
              {productionEnvMinimumTemplatePreviewLines.length > 34 ? (
                <button className="ghost-button v1-env-list-toggle" type="button" onClick={() => setShowAllProductionEnvMinimumTemplateLines((value) => !value)}>
                  {showAllProductionEnvMinimumTemplateLines ? "收起最小片段" : "展开完整最小片段"}
                </button>
              ) : null}
            </section>
          ) : null}
    </>
  );
}
