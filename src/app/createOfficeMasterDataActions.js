import {
  canCreateMasterDataImportConfirmationPlan,
} from "../domain/masterDataImportConfirmationPlan.js";
import { precheckMasterDataImportWorkbook } from "../domain/masterDataImportPrecheck.js";
import {
  canCreateMasterDataImportReviewDraft,
  createMasterDataImportReviewDraft,
} from "../domain/masterDataImportReviewQueue.js";
import {
  createOfficeMasterDataImportConfirmationPlan as createOfficeMasterDataImportConfirmationPlanDefault,
  createOfficeMasterDataImportFailedRowsCorrectionDraft as createOfficeMasterDataImportFailedRowsCorrectionDraftDefault,
  createOfficeMasterDataImportExecution as createOfficeMasterDataImportExecutionDefault,
  createOfficeMasterDataMachine as createOfficeMasterDataMachineDefault,
  confirmOfficeMasterDataEmployeeIdentity as confirmOfficeMasterDataEmployeeIdentityDefault,
  downloadOfficeMasterDataImportFailedRows as downloadOfficeMasterDataImportFailedRowsDefault,
  enableOfficeMasterDataEmployeeAccount as enableOfficeMasterDataEmployeeAccountDefault,
  enableOfficeMasterDataEmployeeAccounts as enableOfficeMasterDataEmployeeAccountsDefault,
  issueOfficeMasterDataEmployeeAccountPassword as issueOfficeMasterDataEmployeeAccountPasswordDefault,
  revokeOfficeMasterDataEmployeeAccountPassword as revokeOfficeMasterDataEmployeeAccountPasswordDefault,
  updateOfficeMasterDataMachine as updateOfficeMasterDataMachineDefault,
  updateOfficeMasterDataEmployeeAssignment as updateOfficeMasterDataEmployeeAssignmentDefault,
  updateOfficeMasterDataEmployeeProfile as updateOfficeMasterDataEmployeeProfileDefault,
} from "../services/officeMasterDataLazyApi.js";
import {
  mergeMasterDataEmployeeAccountReviews,
  upsertMasterDataEmployeeAccountReview,
  upsertMasterDataImportExecution,
  upsertMasterDataImportReviewDraft,
} from "../state/officeMasterDataState.js";

const defaultApi = {
  createOfficeMasterDataImportConfirmationPlan: createOfficeMasterDataImportConfirmationPlanDefault,
  createOfficeMasterDataImportFailedRowsCorrectionDraft: createOfficeMasterDataImportFailedRowsCorrectionDraftDefault,
  createOfficeMasterDataImportExecution: createOfficeMasterDataImportExecutionDefault,
  createOfficeMasterDataMachine: createOfficeMasterDataMachineDefault,
  confirmOfficeMasterDataEmployeeIdentity: confirmOfficeMasterDataEmployeeIdentityDefault,
  downloadOfficeMasterDataImportFailedRows: downloadOfficeMasterDataImportFailedRowsDefault,
  enableOfficeMasterDataEmployeeAccount: enableOfficeMasterDataEmployeeAccountDefault,
  enableOfficeMasterDataEmployeeAccounts: enableOfficeMasterDataEmployeeAccountsDefault,
  issueOfficeMasterDataEmployeeAccountPassword: issueOfficeMasterDataEmployeeAccountPasswordDefault,
  revokeOfficeMasterDataEmployeeAccountPassword: revokeOfficeMasterDataEmployeeAccountPasswordDefault,
  updateOfficeMasterDataMachine: updateOfficeMasterDataMachineDefault,
  updateOfficeMasterDataEmployeeAssignment: updateOfficeMasterDataEmployeeAssignmentDefault,
  updateOfficeMasterDataEmployeeProfile: updateOfficeMasterDataEmployeeProfileDefault,
};

export function createOfficeMasterDataActions({
  allowLocalFallback,
  api = defaultApi,
  authState,
  confirmAction,
  currentUser,
  currentUserId,
  downloadMasterDataImportTemplateWorkbook,
  downloadTextFile,
  getActionState,
  lastIssuedEmployeeCredential,
  masterDataMaintenanceTab,
  masterDataPrecheckState,
  now = () => new Date(),
  refreshMasterDataEmployeeAccountReviews,
  refreshMasterDataImportReviewDrafts,
  refreshV1GoLiveStatus = async () => {},
  setLastIssuedEmployeeCredential,
  setMasterDataEmployeeAccountReviews,
  setMasterDataImportConfirmationPlans,
  setMasterDataImportExecutions,
  setMasterDataImportReviewDrafts,
  setMasterDataMaintenanceDrafts,
  setMasterDataPrecheckState,
  setToast,
  showMasterDataTemplatePanel,
}) {
  const masterDataApi = { ...defaultApi, ...api };
  const apiOptions = { serverRequired: !allowLocalFallback };

  async function callMasterDataWrite(operation, input, operationLabel) {
    const result = await operation(input, apiOptions);
    if (!allowLocalFallback && result?.source !== "api") {
      return {
        ...result,
        source: result?.source ?? "api_error",
        blocked: true,
        error: result?.error ?? {
          code: "MASTER_DATA_LOCAL_FALLBACK_FORBIDDEN",
          message: `正式后端模式禁止${operationLabel}使用本地降级结果。`,
        },
      };
    }
    return result;
  }

  const createOfficeMasterDataImportConfirmationPlan = (input) =>
    callMasterDataWrite(
      masterDataApi.createOfficeMasterDataImportConfirmationPlan,
      input,
      "生成基础资料导入确认计划",
    );
  const createOfficeMasterDataImportExecution = (input) =>
    callMasterDataWrite(masterDataApi.createOfficeMasterDataImportExecution, input, "生成基础资料导入执行记录");
  const createOfficeMasterDataImportFailedRowsCorrectionDraft = (input) =>
    callMasterDataWrite(
      masterDataApi.createOfficeMasterDataImportFailedRowsCorrectionDraft,
      input,
      "生成基础资料失败行修正草稿",
    );
  const confirmOfficeMasterDataEmployeeIdentity = (input) =>
    callMasterDataWrite(masterDataApi.confirmOfficeMasterDataEmployeeIdentity, input, "确认员工账号身份");
  const downloadOfficeMasterDataImportFailedRows = (input) =>
    masterDataApi.downloadOfficeMasterDataImportFailedRows(input, apiOptions);
  const enableOfficeMasterDataEmployeeAccount = (input) =>
    callMasterDataWrite(masterDataApi.enableOfficeMasterDataEmployeeAccount, input, "启用员工账号");
  const enableOfficeMasterDataEmployeeAccounts = (input) =>
    callMasterDataWrite(masterDataApi.enableOfficeMasterDataEmployeeAccounts, input, "批量启用员工账号");
  const issueOfficeMasterDataEmployeeAccountPassword = (input) =>
    callMasterDataWrite(masterDataApi.issueOfficeMasterDataEmployeeAccountPassword, input, "发放员工临时密码");
  const revokeOfficeMasterDataEmployeeAccountPassword = (input) =>
    callMasterDataWrite(masterDataApi.revokeOfficeMasterDataEmployeeAccountPassword, input, "撤销员工密码");
  const updateOfficeMasterDataEmployeeAssignment = (input) =>
    callMasterDataWrite(masterDataApi.updateOfficeMasterDataEmployeeAssignment, input, "保存员工车间 / 机台调配");
  const updateOfficeMasterDataEmployeeProfile = (input) =>
    callMasterDataWrite(masterDataApi.updateOfficeMasterDataEmployeeProfile, input, "保存员工档案");
  const createOfficeMasterDataMachine = (input) =>
    callMasterDataWrite(masterDataApi.createOfficeMasterDataMachine, input, "新增机台配置");
  const updateOfficeMasterDataMachine = (input) =>
    callMasterDataWrite(masterDataApi.updateOfficeMasterDataMachine, input, "修改机台配置");

  async function refreshEmployeeD49ReadModels() {
    await Promise.allSettled([
      refreshMasterDataEmployeeAccountReviews({ silent: true }),
      refreshV1GoLiveStatus({ showToast: false }),
    ]);
  }

  async function updateMasterDataEmployeeAssignment(review, assignment = {}) {
    const actionState = getActionState("保存员工调配");
    if (actionState.disabled) {
      setToast(actionState.title);
      return;
    }
    const result = await updateOfficeMasterDataEmployeeAssignment({
      authState,
      operatorId: currentUserId,
      employeeId: review?.employeeId,
      assignmentMode: assignment.assignmentMode,
      workshop: assignment.workshop,
      machineId: assignment.machineId,
      reason: assignment.reason,
      changedAt: now().toISOString(),
    });
    if (result.blocked) {
      setToast(`保存员工调配失败：${result.error?.message || "权限或接口错误"}`);
      return;
    }
    if (!result.employeeAccountReview) {
      setToast("保存员工调配失败：未返回员工复核记录。");
      return;
    }
    setMasterDataEmployeeAccountReviews((items) => upsertMasterDataEmployeeAccountReview(items, result.employeeAccountReview));
    setToast(`已更新员工调配：${result.employeeAccountReview.name || result.employeeAccountReview.employeeId}。`);
    await refreshEmployeeD49ReadModels();
  }

  async function updateMasterDataEmployeeProfile(review, profile = {}) {
    const result = await updateOfficeMasterDataEmployeeProfile({
      authState,
      operatorId: currentUserId,
      employeeId: review?.employeeId,
      ...profile,
    });
    if (result.blocked) {
      setToast(`保存员工档案失败：${result.error?.message || "权限或接口错误"}`);
      return null;
    }
    if (!result.employeeAccountReview) {
      setToast("保存员工档案失败：未返回员工记录。");
      return null;
    }
    setMasterDataEmployeeAccountReviews((items) =>
      upsertMasterDataEmployeeAccountReview(items, result.employeeAccountReview));
    setToast(`已更新员工档案：${result.employeeAccountReview.name || result.employeeAccountReview.employeeId}。`);
    await refreshEmployeeD49ReadModels();
    return result.employeeAccountReview;
  }

  async function saveMasterDataMachine(machineDraft = {}) {
    const actionState = getActionState("保存机台配置");
    if (actionState.disabled) {
      setToast(actionState.title);
      return null;
    }
    const isNew = machineDraft.isNew === true;
    const operation = isNew ? createOfficeMasterDataMachine : updateOfficeMasterDataMachine;
    const result = await operation({
      authState,
      operatorId: currentUserId,
      machineId: machineDraft.machineId,
      bizNo: machineDraft.bizNo,
      name: machineDraft.name,
      machineType: machineDraft.machineType,
      workshop: machineDraft.workshop,
      status: machineDraft.status,
      reason: machineDraft.reason,
      expectedUpdatedAt: machineDraft.updatedAt,
    });
    if (result.blocked) {
      setToast(`保存机台配置失败：${result.error?.message || "权限、占用或接口错误"}`);
      return null;
    }
    if (!result.machine) {
      setToast("保存机台配置失败：未返回机台记录。");
      return null;
    }
    setToast(`已${isNew ? "新增" : "更新"}机台：${result.machine.name || result.machine.machineId}。`);
    await refreshEmployeeD49ReadModels();
    return result.machine;
  }

  function openMasterDataTemplatePanel(sourceLabel) {
    showMasterDataTemplatePanel({
      sourceLabel,
      openedAt: now().toISOString(),
    });
    setMasterDataPrecheckState({ status: "idle" });
    void refreshMasterDataImportReviewDrafts({ silent: true });
    setToast(`已打开${sourceLabel || "基础资料"}导入模板；正式写入仍需经过确认计划和导入执行记录。`);
  }

  function saveMasterDataMaintenanceDraft(input = {}) {
    const actionState = getActionState("生成维护草稿");
    if (actionState.disabled) {
      setToast(actionState.title);
      return null;
    }
    const createdAt = now();
    const draftId = `MDM-${createdAt.getTime().toString(36).toUpperCase()}`;
    const recordLabel = String(
      input.recordLabel ?? input.record?.label ?? input.record?.name ?? input.recordId ?? "主数据记录",
    ).trim();
    const fieldLabel = String(input.fieldLabel ?? input.field ?? "字段").trim();
    const draft = {
      draftId,
      tab: String(input.tab ?? masterDataMaintenanceTab).trim() || "基础资料",
      recordId: String(input.recordId ?? input.record?.id ?? "").trim(),
      recordLabel,
      field: String(input.field ?? fieldLabel).trim(),
      fieldLabel,
      nextValue: String(input.nextValue ?? "").trim(),
      reason: String(input.reason ?? "").trim() || "办公室维护草稿，待管理复核后通过导入确认流程写入。",
      status: "待复核",
      createdBy: currentUser.displayName || currentUserId,
      createdAt: createdAt.toISOString(),
    };
    setMasterDataMaintenanceDrafts((current) => [draft, ...current].slice(0, 12));
    setToast(`已生成基础资料维护草稿 ${draftId}：${recordLabel} / ${fieldLabel}。正式写入仍需走导入确认。`);
    return draft;
  }

  function downloadMasterDataTemplate(templateKey) {
    const metadata = downloadMasterDataImportTemplateWorkbook(
      templateKey,
      currentUser.displayName || currentUser.name || currentUserId || "ERP",
    );
    if (!metadata) {
      setToast("当前环境未触发模板下载。");
      return;
    }
    setToast(`已生成${metadata.templateLabel}导入模板：${metadata.fileName}。`);
  }

  async function precheckMasterDataTemplate(file) {
    if (!file) return;
    setMasterDataPrecheckState({
      status: "checking",
      fileName: file.name,
    });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await precheckMasterDataImportWorkbook({
        bytes,
        fileName: file.name,
        checkedAt: now().toISOString(),
      });
      setMasterDataPrecheckState({
        status: "done",
        fileName: file.name,
        result,
      });
      setToast(`预检查完成：${result.summary.statusLabel}，阻断 ${result.summary.errorCount} 项，需确认 ${result.summary.warningCount} 项。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMasterDataPrecheckState({
        status: "error",
        fileName: file.name,
        error: message,
      });
      setToast(`预检查失败：${message}`);
    }
  }

  function createMasterDataImportReviewDraftFromPrecheck() {
    const precheckResult = masterDataPrecheckState.result;
    if (!precheckResult) {
      setToast("请先上传基础资料模板并完成预检查。");
      return;
    }
    if (!canCreateMasterDataImportReviewDraft(precheckResult)) {
      setToast("预检查存在阻断项，需先修正后重新上传，暂不能进入确认队列。");
      return;
    }
    const draft = createMasterDataImportReviewDraft({
      precheckResult,
      requestedBy: currentUser.displayName || currentUser.name || currentUserId,
      createdAt: now().toISOString(),
    });
    setMasterDataImportReviewDrafts((items) => upsertMasterDataImportReviewDraft(items, draft));
    setToast(`已加入导入确认队列：${draft.draftId}（${draft.statusLabel}）。`);
  }

  async function createMasterDataImportConfirmationPlanFromDraft(draft) {
    if (!canCreateMasterDataImportConfirmationPlan(draft)) {
      setToast("该导入草稿存在阻断项，不能生成正式导入确认计划。");
      return;
    }
    const result = await createOfficeMasterDataImportConfirmationPlan({
      authState,
      operatorId: currentUserId,
      reviewDraft: draft,
      createdBy: currentUser.displayName || currentUser.name || currentUserId,
    });
    if (result.blocked) {
      setToast(`生成导入确认计划失败：${result.error?.message || "权限或接口错误"}`);
      return;
    }
    const plan = result.confirmationPlan;
    if (!plan) {
      setToast("生成导入确认计划失败：未返回计划内容。");
      return;
    }
    setMasterDataImportConfirmationPlans((items) => {
      const next = [plan, ...items.filter((item) => item.draftId !== plan.draftId)];
      return next.slice(0, 6);
    });
    const sourceLabel = result.source === "api" ? "API 已保存" : "本地草稿";
    setToast(`已生成导入确认计划：${plan.planId}（${plan.statusLabel}，${sourceLabel}）。`);
  }

  async function createMasterDataImportExecutionFromPlan(plan) {
    const actionState = getActionState("生成执行记录");
    if (actionState.disabled) {
      setToast(actionState.title);
      return;
    }
    const result = await createOfficeMasterDataImportExecution({
      authState,
      operatorId: currentUserId,
      planId: plan.planId,
      confirmationPlan: plan,
      requestedBy: currentUser.displayName || currentUser.name || currentUserId,
    });
    if (result.blocked) {
      setToast(`生成导入执行记录失败：${result.error?.message || "权限或接口错误"}`);
      return;
    }
    const execution = result.importExecution;
    if (!execution) {
      setToast("生成导入执行记录失败：未返回执行记录。");
      return;
    }
    setMasterDataImportExecutions((items) => upsertMasterDataImportExecution(items, execution));
    setToast(`已生成导入执行记录：${execution.executionId}（${execution.statusLabel}）。`);
  }

  async function commitMasterDataImportExecutionFromPlan(plan) {
    const actionState = getActionState("正式导入");
    if (actionState.disabled) {
      setToast(actionState.title);
      return;
    }
    const result = await createOfficeMasterDataImportExecution({
      authState,
      operatorId: currentUserId,
      planId: plan.planId,
      confirmationPlan: plan,
      requestedAt: now().toISOString(),
      requestedBy: currentUser.displayName || currentUser.name || currentUserId,
      officialImportEnabled: true,
    });
    if (result.importExecution) {
      setMasterDataImportExecutions((items) => upsertMasterDataImportExecution(items, result.importExecution));
    }
    if (result.blocked) {
      setToast(`正式导入失败：${result.error?.message || "权限或事务错误"}`);
      return;
    }
    const execution = result.importExecution;
    if (!execution) {
      setToast("正式导入失败：未返回执行记录。");
      return;
    }
    if (result.source !== "api") {
      setToast("正式导入失败：正式主数据只能由后端事务提交，本地执行记录不能作为成功结果。");
      return;
    }
    if (
      execution.status !== "committed" ||
      execution.officialWriteAttempted !== true ||
      execution.officialWriteScope !== "master_data_import_v1"
    ) {
      setToast(`正式导入未完成：${execution.statusLabel || execution.status || "后端事务未提交"}。`);
      return;
    }
    const recordCount = execution.summary?.transactionRecordCount ?? execution.summary?.targetRecordCount ?? 0;
    setToast(`已正式导入：${execution.executionId}，写入 ${recordCount} 条主数据记录。`);
    await refreshEmployeeD49ReadModels();
  }

  async function downloadMasterDataImportFailedRows(execution) {
    const actionState = getActionState("下载失败行");
    if (actionState.disabled) {
      setToast(actionState.title);
      return;
    }
    const inlineDownload = execution?.failedRowsDownload;
    try {
      const result = await downloadOfficeMasterDataImportFailedRows({
        authState,
        operatorId: currentUserId,
        executionId: execution.executionId,
      });
      if (!result.blocked && result.content) {
        const downloaded = downloadTextFile(result.content, {
          fileName: result.fileName || inlineDownload?.fileName,
          contentType: result.contentType || inlineDownload?.contentType,
        });
        setToast(downloaded ? `已下载失败行：${result.fileName || inlineDownload?.fileName}。` : "当前环境未触发失败行下载。");
        return;
      }
      if (!inlineDownload?.content) {
        setToast(`下载失败行失败：${result.error?.message || "接口未返回失败行内容"}`);
        return;
      }
    } catch {
      if (!inlineDownload?.content) {
        setToast("下载失败行失败：接口不可用且本地没有失败行内容。");
        return;
      }
    }
    const downloaded = downloadTextFile(inlineDownload.content, {
      fileName: inlineDownload.fileName,
      contentType: inlineDownload.contentType,
    });
    setToast(downloaded ? `已下载失败行：${inlineDownload.fileName}。` : "当前环境未触发失败行下载。");
  }

  async function createMasterDataFailedRowsCorrectionDraft(execution, rowCorrections = []) {
    const actionState = getActionState("生成修正草稿");
    if (actionState.disabled) {
      setToast(actionState.title);
      return;
    }
    if (!execution?.executionId) {
      setToast("缺少导入执行记录 ID，不能生成修正草稿。");
      return;
    }
    const result = await createOfficeMasterDataImportFailedRowsCorrectionDraft({
      authState,
      operatorId: currentUserId,
      executionId: execution.executionId,
      rowCorrections,
      createdAt: now().toISOString(),
    });
    if (result.blocked) {
      setToast(`生成失败行修正草稿失败：${result.error?.message || "权限或接口错误"}`);
      return;
    }
    const draft = result.reviewDraft;
    if (!draft) {
      setToast("生成失败行修正草稿失败：未返回草稿内容。");
      return;
    }
    setMasterDataImportReviewDrafts((items) => upsertMasterDataImportReviewDraft(items, draft));
    const unresolved = Number(draft.correctionSummary?.unresolvedRowCount ?? draft.summary?.unresolvedRowCount ?? 0);
    const rowCount = Number(draft.correctionSummary?.failedRowCount ?? draft.summary?.failedRowCount ?? draft.summary?.dataRowCount ?? 0);
    setToast(unresolved > 0
      ? `已生成失败行修正草稿：${draft.draftId}，共 ${rowCount} 行，需先核对修正后再生成计划。`
      : `已生成失败行修正草稿：${draft.draftId}，共 ${rowCount} 行，可继续生成确认计划。`);
  }

  async function enableMasterDataEmployeeAccount(review) {
    const actionState = getActionState("复核启用员工账号");
    if (actionState.disabled) {
      setToast(actionState.title);
      return;
    }
    const selectedRoleKeys = Array.isArray(review?.recommendedRoleKeys)
      ? review.recommendedRoleKeys.filter(Boolean)
      : [];
    if (selectedRoleKeys.length > 1) {
      const selectedRoleLabels = Array.isArray(review?.recommendedRoleLabels)
        ? review.recommendedRoleLabels.filter(Boolean)
        : selectedRoleKeys;
      const confirmed = confirmAction(
        `确认启用 ${review.name || review.employeeId} 的多角色账号？\n账号角色：${selectedRoleLabels.join("、")}\n启用后不能通过发放密码操作删减已复核角色。`,
      );
      if (!confirmed) return;
    }
    const result = await enableOfficeMasterDataEmployeeAccount({
      authState,
      operatorId: currentUserId,
      employeeId: review.employeeId,
      roleKey: review.recommendedRoleKey,
      roleKeys: selectedRoleKeys.length ? selectedRoleKeys : review.recommendedRoleKeys,
      loginName: review.loginName,
      userId: review.userId,
      reviewNote: "已复核导入员工岗位、默认机台、主角色和附加角色，启用内部账号资料。",
    });
    if (result.blocked) {
      setToast(`启用员工账号失败：${result.error?.message || "权限或接口错误"}`);
      return;
    }
    if (!result.employeeAccountReview) {
      setToast("启用员工账号失败：未返回复核记录。");
      return;
    }
    setMasterDataEmployeeAccountReviews((items) => upsertMasterDataEmployeeAccountReview(items, result.employeeAccountReview));
    setToast(`已启用员工账号：${result.employeeAccountReview.name || result.employeeAccountReview.employeeId}（${result.employeeAccountReview.loginName || result.employeeAccountReview.userId}）。`);
    await refreshEmployeeD49ReadModels();
  }

  async function confirmMasterDataEmployeeIdentity(review, draft = {}) {
    const actionState = getActionState("复核启用员工账号");
    if (actionState.disabled) {
      setToast(actionState.title);
      return;
    }
    const confirmedName = String(draft.confirmedName ?? "").trim();
    const reason = String(draft.reason ?? "").trim();
    if (!confirmedName || !reason) {
      setToast("确认员工身份前，请填写正式显示名和确认依据。");
      return;
    }
    const confirmed = confirmAction(
      `确认 ${review.employeeId} 的正式身份？\n正式显示名：${confirmedName}\n确认依据：${reason}\n确认记录会写入审计日志，候选资料变化后需重新确认。`,
    );
    if (!confirmed) return;
    const result = await confirmOfficeMasterDataEmployeeIdentity({
      authState,
      operatorId: currentUserId,
      employeeId: review.employeeId,
      confirmed: true,
      confirmedEmployeeId: review.employeeId,
      confirmedName,
      reason,
    });
    if (result.blocked) {
      setToast(`确认员工身份失败：${result.error?.message || "权限、身份或审计写入错误"}`);
      return;
    }
    if (!result.employeeAccountReview) {
      setToast("确认员工身份失败：未返回员工复核记录。");
      return;
    }
    setMasterDataEmployeeAccountReviews((items) => upsertMasterDataEmployeeAccountReview(items, result.employeeAccountReview));
    setToast(result.identityAlreadyConfirmed
      ? `员工身份已经确认：${result.employeeAccountReview.name || result.employeeAccountReview.employeeId}。`
      : `已确认员工身份：${result.employeeAccountReview.name || result.employeeAccountReview.employeeId}。`);
    await refreshEmployeeD49ReadModels();
  }

  async function enableMasterDataEmployeeAccounts(reviews = []) {
    const actionState = getActionState("复核启用员工账号");
    if (actionState.disabled) {
      setToast(actionState.title);
      return;
    }
    const pendingReviews = [...new Map(
      (Array.isArray(reviews) ? reviews : [])
        .filter((review) => review?.employeeId && !review.accountEnabled)
        .map((review) => [review.employeeId, review]),
    ).values()];
    if (!pendingReviews.length) {
      setToast("当前筛选中没有待启用的正式员工账号。");
      return;
    }
    const sampleNames = pendingReviews
      .slice(0, 5)
      .map((review) => review.name || review.bizNo || review.employeeId)
      .join("、");
    const remainingLabel = pendingReviews.length > 5 ? `等 ${pendingReviews.length} 人` : `${pendingReviews.length} 人`;
    const confirmed = confirmAction(
      `确认批量启用已勾选的 ${remainingLabel}？\n${sampleNames}\n系统会先校验全部岗位、机台、角色和账号标识；任一失败则整批不启用。`,
    );
    if (!confirmed) return;

    const result = await enableOfficeMasterDataEmployeeAccounts({
      authState,
      operatorId: currentUserId,
      employeeIds: pendingReviews.map((review) => review.employeeId),
      confirmed: true,
      reviewNote: "管理员批量复核导入员工岗位、默认机台和角色，启用内部账号资料。",
      reviewedAt: now().toISOString(),
    });
    if (result.blocked) {
      setToast(`批量启用员工账号失败：${result.error?.message || "权限、账号资料或接口错误"}`);
      return;
    }
    if (result.atomic !== true || !Array.isArray(result.employeeAccountReviews)) {
      setToast("批量启用员工账号失败：后端未返回原子提交结果。");
      return;
    }
    setMasterDataEmployeeAccountReviews((items) =>
      mergeMasterDataEmployeeAccountReviews(items, result.employeeAccountReviews));
    setToast(
      `已批量启用 ${result.enabledCount} 个员工账号${result.skippedCount ? `，跳过已启用 ${result.skippedCount} 个` : ""}。临时密码仍需按员工分别发放。`,
    );
    await refreshEmployeeD49ReadModels();
  }

  async function issueMasterDataEmployeeAccountPassword(review) {
    const actionState = getActionState("发放员工临时密码");
    if (actionState.disabled) {
      setToast(actionState.title);
      return;
    }
    if (!review?.accountEnabled) {
      setToast("请先复核启用员工账号，再发放临时密码。");
      return;
    }
    const result = await issueOfficeMasterDataEmployeeAccountPassword({
      authState,
      operatorId: currentUserId,
      employeeId: review.employeeId,
      roleKey: review.recommendedRoleKey,
      roleKeys: review.recommendedRoleKeys,
      loginName: review.loginName,
      userId: review.userId,
      issueNote: "管理员发放员工首次临时登录密码。",
    });
    if (result.blocked) {
      setToast(`发放员工临时密码失败：${result.error?.message || "权限或接口错误"}`);
      return;
    }
    if (!result.employeeAccountReview || !result.issuedCredential) {
      setToast("发放员工临时密码失败：未返回本次账号密码。");
      return;
    }
    setMasterDataEmployeeAccountReviews((items) => upsertMasterDataEmployeeAccountReview(items, result.employeeAccountReview));
    setLastIssuedEmployeeCredential({
      ...result.issuedCredential,
      employeeId: result.employeeAccountReview.employeeId,
      employeeName: result.employeeAccountReview.name,
      operationLogId: result.operationLogId,
    });
    setToast(`已发放临时密码：${result.issuedCredential.loginName || result.issuedCredential.userId}。`);
    await refreshEmployeeD49ReadModels();
  }

  async function revokeMasterDataEmployeeAccountPassword(review) {
    const actionState = getActionState("撤销员工密码");
    if (actionState.disabled) {
      setToast(actionState.title);
      return;
    }
    if (!review?.accountEnabled || !review?.userId) {
      setToast("该员工账号还未启用，不能撤销密码。");
      return;
    }
    if (review.passwordStatus === "password_revoked" || review.loginEnabled === false) {
      setToast("该员工密码已撤销，无需重复操作。");
      return;
    }
    const confirmed = confirmAction(`确认撤销 ${review.name || review.loginName || review.employeeId} 的登录密码？撤销后该员工无法继续登录，已有会话会失效。`);
    if (!confirmed) return;

    const result = await revokeOfficeMasterDataEmployeeAccountPassword({
      authState,
      operatorId: currentUserId,
      employeeId: review.employeeId,
      revokeNote: "管理员在基础资料员工账号复核中撤销员工登录密码。",
    });
    if (result.blocked) {
      setToast(`撤销员工密码失败：${result.error?.message || "权限或接口错误"}`);
      return;
    }
    if (!result.employeeAccountReview) {
      setToast("撤销员工密码失败：未返回复核记录。");
      return;
    }
    setMasterDataEmployeeAccountReviews((items) => upsertMasterDataEmployeeAccountReview(items, result.employeeAccountReview));
    if (lastIssuedEmployeeCredential?.employeeId === result.employeeAccountReview.employeeId) {
      setLastIssuedEmployeeCredential(null);
    }
    setToast(`已撤销员工密码：${result.employeeAccountReview.name || result.employeeAccountReview.loginName || result.employeeAccountReview.employeeId}。`);
    await refreshEmployeeD49ReadModels();
  }


  return {
    commitMasterDataImportExecutionFromPlan,
    confirmMasterDataEmployeeIdentity,
    createMasterDataFailedRowsCorrectionDraft,
    createMasterDataImportConfirmationPlanFromDraft,
    createMasterDataImportExecutionFromPlan,
    createMasterDataImportReviewDraftFromPrecheck,
    downloadMasterDataImportFailedRows,
    downloadMasterDataTemplate,
    enableMasterDataEmployeeAccount,
    enableMasterDataEmployeeAccounts,
    issueMasterDataEmployeeAccountPassword,
    openMasterDataTemplatePanel,
    precheckMasterDataTemplate,
    revokeMasterDataEmployeeAccountPassword,
    saveMasterDataMachine,
    updateMasterDataEmployeeAssignment,
    updateMasterDataEmployeeProfile,
    saveMasterDataMaintenanceDraft,
  };
}
