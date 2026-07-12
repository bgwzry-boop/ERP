import { createMasterDataImportConfirmationPlan } from "../../src/domain/masterDataImportConfirmationPlan.js";
import { createMasterDataImportExecution } from "../../src/domain/masterDataImportExecution.js";
import { createMasterDataImportCorrectionDraftFromFailedRows } from "../../src/domain/masterDataImportReviewQueue.js";

export function createMasterDataImportCommandService(dependencies = {}) {
  const {
    buildOperationLog,
    getOfficialWriterKind = () => process.env.ERP_MASTER_DATA_IMPORT_WRITER,
    now = () => new Date(),
  } = dependencies;
  if (typeof buildOperationLog !== "function") {
    throw new TypeError("buildOperationLog must be a function");
  }

  return {
    createConfirmationPlan,
    createFailedRowsCorrectionDraft,
    createImportExecution,
  };

  async function createFailedRowsCorrectionDraft({ workspace, executionId, body = {}, operatorId }) {
    const safeExecutionId = cleanText(executionId);
    if (!safeExecutionId) {
      return businessError(400, "MASTER_DATA_IMPORT_EXECUTION_ID_REQUIRED", "executionId is required.");
    }
    const importExecution = (await workspace.masterDataImportReviewRepository.listImportExecutions({
      workspace,
      filters: { executionId: safeExecutionId },
    }))[0];
    if (!importExecution) return notFound("MASTER_DATA_IMPORT_EXECUTION_NOT_FOUND");

    const failedRows = Array.isArray(importExecution.failedRows)
      ? importExecution.failedRows
      : importExecution.importPayload?.failedRows;
    if (!Array.isArray(failedRows) || failedRows.length === 0) {
      return businessError(
        409,
        "MASTER_DATA_IMPORT_FAILED_ROWS_NOT_AVAILABLE",
        "This import execution has no failed rows to generate a correction draft.",
      );
    }

    let reviewDraft;
    try {
      reviewDraft = createMasterDataImportCorrectionDraftFromFailedRows({
        importExecution,
        rowCorrections: Array.isArray(body.rowCorrections) ? body.rowCorrections : [],
        requestedBy: getOperatorName(workspace, operatorId),
        createdAt: body.createdAt ?? now().toISOString(),
      });
    } catch (error) {
      return businessError(
        422,
        "MASTER_DATA_FAILED_ROWS_CORRECTION_DRAFT_INVALID",
        getErrorMessage(error),
      );
    }

    const operationLog = buildOperationLog(workspace, {
      targetType: "master_data_import_review_draft",
      targetId: reviewDraft.draftId,
      action: "master_data_import_failed_rows_correction_draft_created",
      before: {
        executionId: importExecution.executionId,
        planId: importExecution.planId,
        status: importExecution.status,
        failedRowCount: failedRows.length,
      },
      after: {
        draftId: reviewDraft.draftId,
        sourceExecutionId: reviewDraft.sourceExecutionId,
        sourcePlanId: reviewDraft.sourcePlanId,
        status: reviewDraft.status,
        correctionSummary: reviewDraft.correctionSummary,
        officialImportEnabled: false,
        officialWriteScope: "none",
      },
      reason: "基础资料导入失败行生成修正草稿",
      operatorId,
      pageKey: "master_data",
    });
    const saved = await workspace.masterDataImportReviewRepository.saveReviewDraft({
      workspace,
      reviewDraft,
      operationLog,
    });

    return success(201, {
      ...saved,
      sourceExecution: {
        executionId: importExecution.executionId,
        planId: importExecution.planId,
        status: importExecution.status,
        statusLabel: importExecution.statusLabel,
      },
      correctionSummary: saved.reviewDraft?.correctionSummary ?? reviewDraft.correctionSummary,
      officialImportEnabled: false,
      officialWriteScope: "none",
    });
  }

  async function createConfirmationPlan({ workspace, body = {}, operatorId }) {
    const reviewDraft = body.reviewDraft;
    if (!reviewDraft || typeof reviewDraft !== "object") {
      return businessError(
        400,
        "MASTER_DATA_IMPORT_REVIEW_DRAFT_REQUIRED",
        "reviewDraft is required.",
      );
    }

    let confirmationPlan;
    try {
      confirmationPlan = createMasterDataImportConfirmationPlan({
        reviewDraft,
        createdBy: getOperatorName(workspace, operatorId),
        createdAt: body.createdAt ?? now().toISOString(),
      });
    } catch (error) {
      return businessError(
        422,
        "MASTER_DATA_IMPORT_CONFIRMATION_PLAN_INVALID",
        getErrorMessage(error),
      );
    }

    const operationLog = buildOperationLog(workspace, {
      targetType: "master_data_import_confirmation_plan",
      targetId: confirmationPlan.planId,
      action: "master_data_import_confirmation_plan_created",
      before: null,
      after: {
        planId: confirmationPlan.planId,
        draftId: confirmationPlan.draftId,
        status: confirmationPlan.status,
        summary: confirmationPlan.summary,
        targetTables: confirmationPlan.targetTables,
        officialImportEnabled: false,
        officialWriteScope: "none",
      },
      reason: "基础资料导入确认计划草稿",
      operatorId,
      pageKey: "master_data",
    });
    const saved = await workspace.masterDataImportReviewRepository.saveConfirmationPlan({
      workspace,
      reviewDraft,
      confirmationPlan,
      operationLog,
    });

    return success(201, {
      ...saved,
      officialImportEnabled: false,
      officialWriteScope: "none",
    });
  }

  async function createImportExecution({ workspace, body = {}, operatorId }) {
    const planId = cleanText(body.planId);
    if (!planId) {
      return businessError(
        400,
        "MASTER_DATA_IMPORT_CONFIRMATION_PLAN_ID_REQUIRED",
        "planId is required.",
      );
    }
    const confirmationPlan = (await workspace.masterDataImportReviewRepository.listConfirmationPlans({
      workspace,
      filters: { planId },
    }))[0];
    if (!confirmationPlan) return notFound("MASTER_DATA_IMPORT_CONFIRMATION_PLAN_NOT_FOUND");

    let importExecution;
    try {
      const officialImportEnabled =
        body.officialImportEnabled === true || body.confirmOfficialImport === true;
      const officialWriterKind =
        cleanText(body.officialWriterKind) ||
        cleanText(getOfficialWriterKind()) ||
        "not_configured";
      importExecution = createMasterDataImportExecution({
        confirmationPlan,
        requestedBy: getOperatorName(workspace, operatorId),
        requestedAt: body.requestedAt ?? now().toISOString(),
        officialImportEnabled,
        officialWriterKind,
        officialWriteScope: officialImportEnabled ? "master_data_import_v1" : "none",
      });
    } catch (error) {
      return businessError(422, "MASTER_DATA_IMPORT_EXECUTION_INVALID", getErrorMessage(error));
    }

    const operationLog = buildOperationLog(workspace, {
      targetType: "master_data_import_execution",
      targetId: importExecution.executionId,
      action: importExecution.operationLogDraft.action,
      before: {
        planId: confirmationPlan.planId,
        status: confirmationPlan.status,
        officialImportEnabled: confirmationPlan.officialImportEnabled,
        officialWriteScope: confirmationPlan.officialWriteScope,
      },
      after: {
        executionId: importExecution.executionId,
        planId: importExecution.planId,
        draftId: importExecution.draftId,
        status: importExecution.status,
        summary: importExecution.summary,
        blockingReasons: importExecution.blockingReasons,
        officialWriteAttempted: importExecution.status === "ready_for_transaction_writer",
        officialWriteScope: importExecution.officialWriteScope,
      },
      reason: "基础资料正式导入执行请求",
      operatorId,
      pageKey: "master_data",
    });

    if (importExecution.status === "ready_for_transaction_writer") {
      return commitImportExecution({
        workspace,
        confirmationPlan,
        importExecution,
        operationLog,
        operatorId,
      });
    }

    const saved = await workspace.masterDataImportReviewRepository.saveImportExecution({
      workspace,
      confirmationPlan,
      importExecution,
      operationLog,
    });
    return success(201, {
      ...saved,
      officialWriteAttempted: importExecution.officialWriteAttempted,
      officialWriteScope: importExecution.officialWriteScope,
    });
  }

  async function commitImportExecution({
    workspace,
    confirmationPlan,
    importExecution,
    operationLog,
    operatorId,
  }) {
    try {
      const transaction = await workspace.masterDataImportTransactionRepository.applyImportExecution({
        workspace,
        importExecution,
        operationLog,
      });
      const saved = await workspace.masterDataImportReviewRepository.saveImportExecution({
        workspace,
        confirmationPlan,
        importExecution: transaction.importExecution,
        operationLog,
      });
      return success(201, {
        ...saved,
        transactionSummary: transaction.summary,
        officialWriteAttempted: true,
        officialWriteScope: transaction.importExecution.officialWriteScope,
      });
    } catch (error) {
      const failedAt = now().toISOString();
      const message = getErrorMessage(error);
      const failedExecution = {
        ...importExecution,
        status: "failed",
        statusLabel: "导入失败已回滚",
        officialWriteAttempted: true,
        officialWriteScope: "master_data_import_v1",
        transactionStarted: true,
        finishedAt: failedAt,
        summary: {
          ...importExecution.summary,
          blockedReasonCount: 1,
        },
        blockingReasons: [message],
        transactionSummary: {
          rollbackApplied: true,
          errorMessage: message,
          failedAt,
        },
      };
      const failedLog = buildOperationLog(workspace, {
        targetType: "master_data_import_execution",
        targetId: failedExecution.executionId,
        action: "master_data_import_execution_failed_rolled_back",
        before: operationLog.after,
        after: {
          executionId: failedExecution.executionId,
          status: failedExecution.status,
          blockingReasons: failedExecution.blockingReasons,
          officialWriteAttempted: true,
          officialWriteScope: failedExecution.officialWriteScope,
          rollbackApplied: true,
        },
        reason: "基础资料正式导入失败，事务已回滚",
        operatorId,
        pageKey: "master_data",
      });
      await workspace.masterDataImportReviewRepository.saveImportExecution({
        workspace,
        confirmationPlan,
        importExecution: failedExecution,
        operationLog: failedLog,
      });
      return success(422, {
        code: "MASTER_DATA_IMPORT_TRANSACTION_FAILED_ROLLED_BACK",
        message,
        importExecution: failedExecution,
        operationLogId: failedLog.id,
      });
    }
  }
}

function getOperatorName(workspace, operatorId) {
  const user = (workspace.users ?? []).find(
    (item) => cleanText(item?.id ?? item?.userId) === cleanText(operatorId),
  );
  return cleanText(user?.displayName ?? user?.display_name ?? user?.name) || cleanText(operatorId);
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function success(statusCode, response) {
  return { statusCode, response };
}

function notFound(code) {
  return { notFound: true, code };
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}
