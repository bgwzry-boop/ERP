import { getProductionEnvTemplateSectionLabel } from "./v1StatusPresentation.js";

export function V1StatusProductionEnvDraftStage({
  productionEnvFillTemplate,
  sectionRef,
  productionEnvTemplateLinesForPage,
  productionEnvTemplatePreviewLines,
  productionEnvTemplatePreviewRef,
  focusedProductionEnvTemplateLineIndex,
  showAllProductionEnvTemplateLines,
  setShowAllProductionEnvTemplateLines,
}) {
  const productionEnvFillTemplateRef = sectionRef;
  return (
    <>
          {productionEnvFillTemplate ? (
            <section className="detail-section v1-workspace-panel v1-workspace-production v1-section-env_draft" ref={productionEnvFillTemplateRef}>
              <h3>安全 env 填写草稿</h3>
              <div className="v1-env-template-summary">
                <span>变量 <strong>{productionEnvFillTemplate.summary.variableCount}</strong></span>
                <span>待填写 <strong>{productionEnvFillTemplate.summary.placeholderCount}</strong></span>
                <span>阻塞段 <strong>{productionEnvFillTemplate.summary.blockingSectionCount}</strong></span>
                <span>警告段 <strong>{productionEnvFillTemplate.summary.warningSectionCount}</strong></span>
              </div>
              <div className="v1-env-list-head">
                <strong>脱敏预览</strong>
                <span>{productionEnvTemplateLinesForPage.length}/{productionEnvTemplatePreviewLines.length}</span>
              </div>
              <pre className="v1-env-template-preview" ref={productionEnvTemplatePreviewRef}>
                {productionEnvTemplateLinesForPage.map((line, index) => {
                  const sectionLabel = getProductionEnvTemplateSectionLabel(line);
                  const envLineIndex = index;
                  const isFocusedLine = focusedProductionEnvTemplateLineIndex === envLineIndex;
                  return (
                    <span
                      className={[
                        "v1-env-template-line",
                        sectionLabel ? "section" : "",
                        isFocusedLine ? "focused" : "",
                      ].filter(Boolean).join(" ")}
                      data-env-line-index={envLineIndex}
                      key={`${envLineIndex}-${index}-${line}`}
                    >
                      {line}
                    </span>
                  );
                })}
              </pre>
              {productionEnvTemplatePreviewLines.length > 36 ? (
                <button className="ghost-button v1-env-list-toggle" type="button" onClick={() => setShowAllProductionEnvTemplateLines((value) => !value)}>
                  {showAllProductionEnvTemplateLines ? "收起 env 草稿" : "展开完整 env 草稿"}
                </button>
              ) : null}
            </section>
          ) : null}
    </>
  );
}
