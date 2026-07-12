import { useState } from "react";
import {
  DownloadOutlined,
  ReloadOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  canRevokeEmployeePassword,
  formatCompactDateTime,
  getEmployeePasswordStatusLabel,
  getEmployeeReviewRowTone,
  getMasterDataExecutionFailedRows,
  getMasterDataExecutionTone,
  getMasterDataFailedRowFields,
  getMasterDataFailedRowKey,
  getMasterDataPrecheckTone,
  hasCommittedMasterDataImportExecution,
  normalizeMasterDataFailedRowValues,
} from "../state/officeMasterDataState.js";
import {
  getMasterDataImportTemplateDefinitions,
  getMasterDataImportTemplateSets,
  getMasterDataImportTemplateSummary,
} from "../domain/masterDataImportTemplate.js";
import {
  canCreateMasterDataImportReviewDraft,
  getMasterDataImportReviewDraftSummary,
} from "../domain/masterDataImportReviewQueue.js";
import {
  canCreateMasterDataImportConfirmationPlan,
  getMasterDataImportConfirmationPlanSummary,
} from "../domain/masterDataImportConfirmationPlan.js";
export function MasterDataImportTemplateModal({
  panel,
  onClose,
  onDownload,
  onPrecheck,
  precheckState,
  reviewDrafts,
  onCreateReviewDraft,
  confirmationPlans,
  onCreateConfirmationPlan,
  importExecutions,
  employeeAccountReviews,
  lastIssuedEmployeeCredential,
  getUiActionState,
  onCreateImportExecution,
  onCommitImportExecution,
  onDownloadFailedRows,
  onCreateFailedRowsCorrectionDraft,
  onRefreshEmployeeAccountReviews,
  onEnableEmployeeAccount,
  onIssueEmployeePassword,
  onRevokeEmployeePassword,
}) {
  const templateSets = getMasterDataImportTemplateSets();
  const definitions = getMasterDataImportTemplateDefinitions();
  const sourceLabel = panel?.sourceLabel || "基础资料";
  const precheck = precheckState ?? { status: "idle" };
  const precheckResult = precheck.result;
  const topIssues = precheckResult?.issues?.slice(0, 6) ?? [];
  const statusTone = getMasterDataPrecheckTone(precheckResult?.summary?.status);
  const draftItems = Array.isArray(reviewDrafts) ? reviewDrafts : [];
  const planItems = Array.isArray(confirmationPlans) ? confirmationPlans : [];
  const executionItems = Array.isArray(importExecutions) ? importExecutions : [];
  const employeeReviewItems = Array.isArray(employeeAccountReviews) ? employeeAccountReviews : [];
  const canQueuePrecheckResult = precheckResult ? canCreateMasterDataImportReviewDraft(precheckResult) : false;
  const createExecutionState = getUiActionState?.("masterData", "生成执行记录") ?? { disabled: false, title: "" };
  const commitExecutionState = getUiActionState?.("masterData", "正式导入") ?? { disabled: false, title: "" };
  const downloadFailedRowsState = getUiActionState?.("masterData", "下载失败行") ?? { disabled: false, title: "" };
  const createCorrectionDraftState = getUiActionState?.("masterData", "生成修正草稿") ?? { disabled: false, title: "" };
  const refreshEmployeeReviewState = getUiActionState?.("masterData", "刷新员工复核") ?? { disabled: false, title: "" };
  const enableEmployeeReviewState = getUiActionState?.("masterData", "复核启用员工账号") ?? { disabled: false, title: "" };
  const issueEmployeePasswordState = getUiActionState?.("masterData", "发放员工临时密码") ?? { disabled: false, title: "" };
  const revokeEmployeePasswordState = getUiActionState?.("masterData", "撤销员工密码") ?? { disabled: false, title: "" };
  const [expandedCorrectionExecutionId, setExpandedCorrectionExecutionId] = useState("");
  const [failedRowCorrectionEditors, setFailedRowCorrectionEditors] = useState({});

  function handlePrecheckFileChange(event) {
    const file = event.target.files?.[0];
    if (file) onPrecheck(file);
    event.target.value = "";
  }

  function toggleFailedRowCorrectionEditor(execution) {
    const executionId = String(execution?.executionId ?? "").trim();
    if (!executionId) return;
    setExpandedCorrectionExecutionId((current) => (current === executionId ? "" : executionId));
  }

  function updateFailedRowCorrectionValue(execution, row, field, value) {
    const executionId = String(execution?.executionId ?? "").trim();
    const rowKey = getMasterDataFailedRowKey(row);
    const fieldKey = String(field ?? "").trim();
    if (!executionId || !rowKey || !fieldKey) return;
    setFailedRowCorrectionEditors((current) => {
      const executionEdits = current[executionId] ?? {};
      const currentRowEdit = executionEdits[rowKey] ?? {
        touched: false,
        values: normalizeMasterDataFailedRowValues(row.values),
      };
      return {
        ...current,
        [executionId]: {
          ...executionEdits,
          [rowKey]: {
            touched: true,
            values: {
              ...currentRowEdit.values,
              [fieldKey]: value,
            },
          },
        },
      };
    });
  }

  function resetFailedRowCorrectionRow(execution, row) {
    const executionId = String(execution?.executionId ?? "").trim();
    const rowKey = getMasterDataFailedRowKey(row);
    if (!executionId || !rowKey) return;
    setFailedRowCorrectionEditors((current) => {
      const executionEdits = { ...(current[executionId] ?? {}) };
      delete executionEdits[rowKey];
      const next = { ...current };
      if (Object.keys(executionEdits).length) next[executionId] = executionEdits;
      else delete next[executionId];
      return next;
    });
  }

  function getFailedRowCorrectionValues(execution, row) {
    const executionId = String(execution?.executionId ?? "").trim();
    const rowKey = getMasterDataFailedRowKey(row);
    return failedRowCorrectionEditors[executionId]?.[rowKey]?.values ?? normalizeMasterDataFailedRowValues(row.values);
  }

  function isFailedRowCorrectionTouched(execution, row) {
    const executionId = String(execution?.executionId ?? "").trim();
    const rowKey = getMasterDataFailedRowKey(row);
    return failedRowCorrectionEditors[executionId]?.[rowKey]?.touched === true;
  }

  function buildFailedRowCorrections(execution) {
    const executionId = String(execution?.executionId ?? "").trim();
    const executionEdits = failedRowCorrectionEditors[executionId] ?? {};
    return getMasterDataExecutionFailedRows(execution)
      .map((row) => {
        const rowEdit = executionEdits[getMasterDataFailedRowKey(row)];
        if (!rowEdit?.touched) return null;
        return {
          sheetKey: row.sheetKey,
          rowNumber: row.rowNumber,
          values: normalizeMasterDataFailedRowValues(rowEdit.values),
        };
      })
      .filter(Boolean);
  }

  function handleCreateFailedRowsCorrectionDraft(execution) {
    onCreateFailedRowsCorrectionDraft?.(execution, buildFailedRowCorrections(execution));
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal master-data-template-modal" role="dialog" aria-modal="true" aria-label="基础资料导入模板">
        <div className="modal-title">
          <div>
            <span>{sourceLabel}</span>
            <h2>基础资料导入模板</h2>
          </div>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        <div className="master-data-template-summary">
          {templateSets.map((item) => (
            <button className="master-data-template-card" key={item.key} onClick={() => onDownload(item.key)}>
              <div>
                <strong>{item.label}</strong>
                <span>{getMasterDataImportTemplateSummary(item.key)}</span>
              </div>
              <DownloadOutlined />
            </button>
          ))}
        </div>
        <section className="master-data-template-fields" aria-label="模板字段">
          <div className="master-data-template-fields-head">
            <strong>模板范围</strong>
            <span>导入前整表预检查，确认后才落正式数据</span>
          </div>
          <div className="master-data-template-field-grid">
            {definitions.map((definition) => (
              <div className="master-data-template-field-row" key={definition.key}>
                <strong>{definition.label}</strong>
                <span>{definition.description}</span>
                <small>必填：{definition.requiredFields.join("、")} · {definition.columnCount} 字段</small>
              </div>
            ))}
          </div>
        </section>
        <section className="master-data-precheck-panel" aria-label="导入预检查">
          <div className="master-data-precheck-head">
            <div>
              <strong>上传预检查</strong>
              <span>只检查字段、重复、价格、库存和规格匹配，不落正式数据</span>
            </div>
            <label className="master-data-upload-button">
              <UploadOutlined />
              上传并预检查
              <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handlePrecheckFileChange} />
            </label>
          </div>
          {precheck.status === "checking" && (
            <div className="master-data-precheck-empty">
              正在检查 {precheck.fileName || "导入模板"}...
            </div>
          )}
          {precheck.status === "error" && (
            <div className="master-data-precheck-error">
              <strong>预检查失败</strong>
              <span>{precheck.error}</span>
            </div>
          )}
          {precheck.status !== "checking" && precheck.status !== "error" && !precheckResult && (
            <div className="master-data-precheck-empty">
              下载模板填写后上传，系统会先生成预检查结果。
            </div>
          )}
          {precheckResult && (
            <div className="master-data-precheck-result">
              <div className="master-data-precheck-stats">
                <span className={`master-data-precheck-status ${statusTone}`}>
                  <strong>{precheckResult.summary.statusLabel}</strong>
                  <small>状态</small>
                </span>
                <span>
                  <strong>{precheckResult.summary.dataRowCount}</strong>
                  <small>数据行</small>
                </span>
                <span>
                  <strong>{precheckResult.summary.errorCount}</strong>
                  <small>阻断</small>
                </span>
                <span>
                  <strong>{precheckResult.summary.warningCount}</strong>
                  <small>需确认</small>
                </span>
              </div>
              <div className="master-data-precheck-note">{precheckResult.summary.recommendedAction}</div>
              <div className="master-data-precheck-sheets">
                {precheckResult.sheets.map((sheet) => (
                  <span className={`master-data-precheck-sheet ${sheet.status}`} key={sheet.key}>
                    {sheet.label} · {sheet.dataRowCount} 行
                  </span>
                ))}
              </div>
              <div className="master-data-precheck-issues">
                {topIssues.length ? topIssues.map((issue, index) => (
                  <div className={`master-data-precheck-issue ${issue.severity}`} key={`${issue.sheet}-${issue.row}-${issue.field}-${index}`}>
                    <strong>{issue.severityLabel}</strong>
                    <span>{issue.sheet}{issue.row ? ` · 第 ${issue.row} 行` : ""}{issue.field ? ` · ${issue.field}` : ""}</span>
                    <small>{issue.message}</small>
                  </div>
                )) : (
                  <div className="master-data-precheck-empty compact">未发现阻断或需确认问题</div>
                )}
              </div>
              <div className="master-data-review-actions">
                <button
                  className="primary-action"
                  disabled={!canQueuePrecheckResult}
                  title={canQueuePrecheckResult ? "生成待确认草稿，不写正式数据" : "存在阻断项，需先修正后重新预检查"}
                  onClick={onCreateReviewDraft}
                >
                  加入确认队列
                </button>
                <span>{canQueuePrecheckResult ? "生成待确认草稿，后续再接权限、审计和正式落库。" : "先处理阻断项，当前不能进入确认队列。"}</span>
              </div>
            </div>
          )}
        </section>
        <section className="master-data-review-panel" aria-label="导入确认队列">
          <div className="master-data-review-head">
            <strong>导入确认队列</strong>
            <span>当前为草稿队列，不写正式客户 / 价格 / 库存资料</span>
          </div>
          {draftItems.length ? (
            <div className="master-data-review-list">
              {draftItems.map((draft) => (
	                <div className={`master-data-review-row ${draft.statusTone}`} key={draft.draftId}>
	                  <div>
	                    <strong>{draft.draftId}</strong>
	                    <span>{getMasterDataImportReviewDraftSummary(draft)}</span>
	                    <small>{draft.fileName || "未记录文件名"} · {draft.requestedBy || "未知账号"}{draft.sourceExecutionId ? ` · 来源 ${draft.sourceExecutionId}` : ""}</small>
	                  </div>
                  <em>{draft.statusLabel}</em>
                  <button
                    className="master-data-review-plan-button"
                    disabled={!canCreateMasterDataImportConfirmationPlan(draft)}
                    title={canCreateMasterDataImportConfirmationPlan(draft) ? "生成正式导入前的审计和事务计划，不写库" : "阻断草稿不能生成确认计划"}
                    onClick={() => onCreateConfirmationPlan?.(draft)}
                  >
                    生成计划
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="master-data-review-empty">
              预检查通过后可加入确认队列，等待后续正式导入确认。
            </div>
          )}
        </section>
        <section className="master-data-confirmation-panel" aria-label="导入确认计划">
          <div className="master-data-review-head">
            <strong>导入确认计划</strong>
            <span>生成目标表和事务保护项，管理账号可执行正式导入</span>
          </div>
          {planItems.length ? (
            <div className="master-data-confirmation-list">
              {planItems.map((plan) => (
                <div className="master-data-confirmation-row" key={plan.planId}>
                  <div>
                    <strong>{plan.planId}</strong>
                    <span>{getMasterDataImportConfirmationPlanSummary(plan)}</span>
                    <small>{plan.operationLogId || plan.operationLogDraft?.action || "待生成操作日志"} · {plan.persistenceStatus || "本地确认计划"} · {plan.createdBy || "未知账号"}</small>
                  </div>
                  <em>{plan.statusLabel}</em>
                  <div className="master-data-confirmation-actions">
                    <button
                      disabled={createExecutionState.disabled}
                      title={createExecutionState.title || "生成 MDE-* 执行记录，默认不写正式数据"}
                      onClick={() => onCreateImportExecution?.(plan)}
                    >
                      生成执行记录
                    </button>
                    <button
                      className="danger-action"
                      disabled={commitExecutionState.disabled || hasCommittedMasterDataImportExecution(executionItems, plan.planId)}
                      title={commitExecutionState.title || (hasCommittedMasterDataImportExecution(executionItems, plan.planId) ? "该计划已有正式导入记录" : "管理账号显式确认后执行本地事务写入")}
                      onClick={() => onCommitImportExecution?.(plan)}
                    >
                      正式导入
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="master-data-review-empty">
              从确认队列草稿生成计划后，管理账号才能生成执行记录或正式导入。
            </div>
          )}
        </section>
        <section className="master-data-execution-panel" aria-label="导入执行记录">
          <div className="master-data-review-head">
            <strong>导入执行记录</strong>
            <span>默认阻断记录不写库；正式导入成功后显示 committed</span>
          </div>
          {executionItems.length ? (
            <div className="master-data-execution-list">
              {executionItems.map((execution) => {
                const failedRowsRequired = execution.failedRowsDownload?.required === true || Number(execution.summary?.failedRowCount) > 0;
                const failedRows = getMasterDataExecutionFailedRows(execution);
                const correctionRows = buildFailedRowCorrections(execution);
                const correctionRowCount = correctionRows.length;
                const editorExpanded = expandedCorrectionExecutionId === execution.executionId;
                return (
	                  <div className={`master-data-execution-row ${getMasterDataExecutionTone(execution.status)}`} key={execution.executionId}>
	                    <div>
	                      <strong>{execution.executionId}</strong>
	                      <span>{execution.statusLabel || execution.status} · {execution.summary?.writableRowCount ?? 0} 可写行 · {execution.summary?.failedRowCount ?? 0} 失败行{correctionRowCount ? ` · 已修正 ${correctionRowCount} 行` : ""}</span>
	                      <small>{execution.planId} · {execution.persistenceStatus || "API 执行记录"} · {execution.officialWriteAttempted ? "已尝试正式写入" : "未写正式数据"}</small>
	                    </div>
	                    <em>{execution.officialWriteScope || "none"}</em>
	                    <div className="master-data-execution-actions">
	                      <button
	                        disabled={!failedRowsRequired || downloadFailedRowsState.disabled}
	                        title={downloadFailedRowsState.title || (failedRowsRequired ? "下载本次执行生成的失败行 CSV" : "当前执行记录没有失败行")}
	                        onClick={() => onDownloadFailedRows?.(execution)}
	                      >
	                        下载失败行
	                      </button>
	                      <button
	                        disabled={!failedRows.length || createCorrectionDraftState.disabled}
	                        title={createCorrectionDraftState.title || (failedRows.length ? "展开失败行字段并在页面内修正" : "当前执行记录没有失败行明细")}
	                        onClick={() => toggleFailedRowCorrectionEditor(execution)}
	                      >
	                        {editorExpanded ? "收起修正" : "修正字段"}
	                      </button>
	                      <button
	                        disabled={!failedRowsRequired || createCorrectionDraftState.disabled}
	                        title={createCorrectionDraftState.title || (failedRowsRequired ? "把失败行生成新的确认草稿，继续走生成计划 / 正式导入流程" : "当前执行记录没有失败行")}
	                        onClick={() => handleCreateFailedRowsCorrectionDraft(execution)}
	                      >
	                        {correctionRowCount ? `生成草稿(${correctionRowCount})` : "生成修正草稿"}
	                      </button>
	                    </div>
	                    {editorExpanded && (
	                      <div className="master-data-failed-row-editor" aria-label="失败行字段修正">
	                        <div className="master-data-failed-row-editor-head">
	                          <strong>失败行字段修正</strong>
	                          <span>已修正 {correctionRowCount}/{failedRows.length} 行；只把改过的行作为修正字段传入草稿。</span>
	                        </div>
	                        <div className="master-data-failed-row-list">
	                          {failedRows.map((row) => {
	                            const values = getFailedRowCorrectionValues(execution, row);
	                            const fields = getMasterDataFailedRowFields({ ...row, values });
	                            const touched = isFailedRowCorrectionTouched(execution, row);
	                            return (
	                              <div className={`master-data-failed-row-card ${touched ? "touched" : ""}`} key={getMasterDataFailedRowKey(row)}>
	                                <div className="master-data-failed-row-meta">
	                                  <div>
	                                    <strong>{row.worksheetName || row.sheetKey} · 第 {row.rowNumber} 行</strong>
	                                    <span>{row.reason || "未记录失败原因"}</span>
	                                  </div>
	                                  <button
	                                    type="button"
	                                    disabled={!touched}
	                                    onClick={() => resetFailedRowCorrectionRow(execution, row)}
	                                  >
	                                    重置
	                                  </button>
	                                </div>
	                                {fields.length ? (
	                                  <div className="master-data-failed-row-fields">
	                                    {fields.map(({ field, value }) => (
	                                      <label key={field}>
	                                        <span>{field}</span>
	                                        <input
	                                          value={value}
	                                          onChange={(event) => updateFailedRowCorrectionValue(execution, row, field, event.target.value)}
	                                        />
	                                      </label>
	                                    ))}
	                                  </div>
	                                ) : (
	                                  <small className="master-data-failed-row-empty">该失败行没有可编辑字段，需下载失败行后重新整理 Excel。</small>
	                                )}
	                              </div>
	                            );
	                          })}
	                        </div>
	                      </div>
	                    )}
	                  </div>
                );
              })}
            </div>
          ) : (
            <div className="master-data-review-empty">
              生成执行记录后会在这里显示阻断原因、失败行下载和正式导入结果。
            </div>
          )}
        </section>
        <section className="master-data-employee-review-panel" aria-label="员工账号复核">
          <div className="master-data-review-head master-data-employee-review-head">
            <div>
              <strong>员工账号复核</strong>
              <span>员工导入后默认未启用，管理账号复核岗位 / 机台 / 角色后启用</span>
            </div>
            <button
              disabled={refreshEmployeeReviewState.disabled}
              title={refreshEmployeeReviewState.title || "刷新正式导入后的员工待复核账号"}
              onClick={() => onRefreshEmployeeAccountReviews?.()}
            >
              <ReloadOutlined />
              刷新复核
            </button>
          </div>
          {employeeReviewItems.length ? (
            <div className="master-data-employee-review-list">
              {employeeReviewItems.map((review) => {
                const passwordStatusLabel = getEmployeePasswordStatusLabel(review);
                const canRevokePassword = canRevokeEmployeePassword(review);
                return (
                  <div className={`master-data-employee-review-row ${getEmployeeReviewRowTone(review)}`} key={review.employeeId}>
                    <div>
                      <strong>{review.name || review.bizNo || review.employeeId}</strong>
                      <span>{review.roleName || review.recommendedRoleLabel || "未填岗位"} · {review.defaultWorkshop || "未填车间"} · {review.defaultMachineId || "未绑机台"}</span>
                      <small>
                        {review.bizNo || review.employeeId} · {review.loginName || "待生成登录名"} · {passwordStatusLabel}
                        {review.passwordRevokedAt ? ` ${formatCompactDateTime(review.passwordRevokedAt)}` : ""}
                        {review.passwordChangedAt ? ` · 改密 ${formatCompactDateTime(review.passwordChangedAt)}` : ""}
                        {review.remark ? ` · ${review.remark}` : ""}
                      </small>
                    </div>
                    <em>{review.statusLabel || review.status}</em>
                    <div className="master-data-employee-review-actions">
                      <button
                        disabled={review.accountEnabled || enableEmployeeReviewState.disabled}
                        title={enableEmployeeReviewState.title || (review.accountEnabled ? "该员工账号已启用" : "复核并启用导入员工账号")}
                        onClick={() => onEnableEmployeeAccount?.(review)}
                      >
                        {review.accountEnabled ? "已启用" : "复核启用"}
                      </button>
                      <button
                        disabled={!review.accountEnabled || issueEmployeePasswordState.disabled}
                        title={issueEmployeePasswordState.title || (review.accountEnabled ? "生成本次可见的临时密码，并启用动态登录" : "先复核启用员工账号")}
                        onClick={() => onIssueEmployeePassword?.(review)}
                      >
                        {review.passwordIssuedAt ? "重发密码" : "发临时密码"}
                      </button>
                      <button
                        className="danger-action"
                        disabled={!canRevokePassword || revokeEmployeePasswordState.disabled}
                        title={revokeEmployeePasswordState.title || (canRevokePassword ? "撤销登录密码并让已有会话失效" : "仅已启用且未撤销的员工账号可撤销密码")}
                        onClick={() => onRevokeEmployeePassword?.(review)}
                      >
                        撤销密码
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="master-data-review-empty">
              正式导入包含员工资料后，点击刷新可查看待管理员复核的员工账号。
            </div>
          )}
          {lastIssuedEmployeeCredential && (
            <div className="master-data-employee-credential">
              <div>
                <strong>{lastIssuedEmployeeCredential.employeeName || lastIssuedEmployeeCredential.userId}</strong>
                <span>临时密码仅本次返回；首次登录需改密，规则：至少 10 位、含字母和数字、不含空格，且不能包含登录名 / 员工 ID</span>
              </div>
              <code>{lastIssuedEmployeeCredential.loginName || lastIssuedEmployeeCredential.userId}</code>
              <code>{lastIssuedEmployeeCredential.temporaryPassword}</code>
            </div>
          )}
        </section>
        <div className="modal-actions">
          <button onClick={() => onDownload("all")}>
            <DownloadOutlined />
            下载全量模板
          </button>
          <button className="primary-action" onClick={onClose}>关闭</button>
        </div>
      </section>
    </div>
  );
}
