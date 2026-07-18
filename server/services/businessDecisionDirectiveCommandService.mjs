import { createHash } from "node:crypto";
import { getBusinessDecisionScopeLabel } from "../../shared/businessDecisionCatalog.js";
import { normalizeIdempotencyKey } from "../idempotency.mjs";

const outcomeLabels = Object.freeze({
  approve: "同意",
  return_for_more_information: "退回补充",
  reject: "不同意",
  defer: "暂缓",
});

const targetCollections = Object.freeze({
  order: ["originalOrders", "orderLines"],
  production_schedule_queue: ["productionTasks", "orderLines"],
  raw_material_inbound: ["rawMaterialInbounds"],
  fulfillment: ["fulfillments"],
  statement: ["statements"],
  todo: ["todos"],
});

export function createBusinessDecisionDirectiveCommandService({
  businessDecisionEvidenceService,
  buildOperationLog,
  now = () => new Date(),
} = {}) {
  if (typeof businessDecisionEvidenceService?.prepareDecision !== "function") {
    throw new TypeError("businessDecisionEvidenceService.prepareDecision must be a function.");
  }
  if (typeof buildOperationLog !== "function") throw new TypeError("buildOperationLog must be a function.");
  if (typeof now !== "function") throw new TypeError("now must be a function.");

  return Object.freeze({ recordDecisionDirective });

  async function recordDecisionDirective({ workspace, body = {}, operatorId, actionPermissions = [] } = {}) {
    const input = validateInput(workspace, body);
    if (input.error) return input;
    let idempotencyKey;
    try {
      idempotencyKey = normalizeIdempotencyKey(body.idempotencyKey);
    } catch (caught) {
      return error(caught.statusCode || 400, caught.code || "IDEMPOTENCY_KEY_INVALID", caught.message);
    }
    if (!idempotencyKey) return error(400, "IDEMPOTENCY_KEY_REQUIRED", "提交经营决定必须提供幂等键。");

    const timestamp = now().toISOString();
    const decisionSummary = `${getBusinessDecisionScopeLabel(input.value.decisionScope)}：${input.value.actionLabel}`;
    const operationLog = buildOperationLog(workspace, {
      targetType: input.value.businessType,
      targetId: input.value.businessId,
      action: "business_decision_directive_recorded",
      before: null,
      after: null,
      reason: input.value.note,
      operatorId,
      pageKey: "decision_mobile",
    });
    const prepared = businessDecisionEvidenceService.prepareDecision({
      workspace,
      businessType: input.value.businessType,
      businessId: input.value.businessId,
      decisionScope: input.value.decisionScope,
      operatorId,
      actionPermissions,
      directDecisionContent: {
        summary: decisionSummary,
        outcome: input.value.outcome,
        outcomeLabel: outcomeLabels[input.value.outcome],
        actionLabel: input.value.actionLabel,
        note: input.value.note,
        taskTitle: input.value.taskTitle,
        factsSnapshot: input.value.factsSnapshot,
      },
      authorizationAmount: input.value.authorizationAmount,
      operationLogId: operationLog.id,
      idempotencyKey,
    });
    if (prepared.error) return prepared;

    const todo = buildOfficeExecutionTodo({
      decisionRecord: prepared.record,
      decisionSummary,
      actionLabel: input.value.actionLabel,
      note: input.value.note,
      taskTitle: input.value.taskTitle,
      operatorId,
      timestamp,
    });
    operationLog.after = {
      businessDecisionId: prepared.record.id,
      businessType: prepared.record.businessType,
      businessId: prepared.record.businessId,
      decisionScope: prepared.record.decisionScope,
      outcome: input.value.outcome,
      actionLabel: input.value.actionLabel,
      officeTodoId: todo.id,
    };

    const idempotencyPayload = {
      businessType: input.value.businessType,
      businessId: input.value.businessId,
      decisionScope: input.value.decisionScope,
      outcome: input.value.outcome,
      actionLabel: input.value.actionLabel,
      note: input.value.note,
      taskTitle: input.value.taskTitle,
      factsSnapshot: input.value.factsSnapshot,
      authorizationAmount: input.value.authorizationAmount,
    };
    try {
      const saved = await workspace.businessDecisionEvidenceRepository.writeDecisionDirective({
        workspace,
        decisionRecord: prepared.record,
        attachmentLinks: prepared.attachmentLinks,
        todo,
        operationLog,
        idempotencyScope: "business_decision.directive.create",
        idempotencyKey,
        idempotencyPayload,
      });
      const savedDecision = saved.businessDecision ?? saved.businessResult?.businessDecision ?? prepared.record;
      const savedTodo = saved.todo ?? saved.businessResult?.todo ?? todo;
      return {
        statusCode: saved.replayed === true ? 200 : 201,
        response: {
          businessDecision: businessDecisionEvidenceService.toProjection(savedDecision, { workspace }),
          todo: savedTodo,
          operationLogId: saved.operationLogId || savedDecision.operationLogId || operationLog.id,
          replayed: saved.replayed === true,
        },
      };
    } catch (caught) {
      if (Number.isInteger(caught?.statusCode)) {
        return error(caught.statusCode, caught.code, caught.message, caught.details);
      }
      if (
        cleanText(caught?.code) === "ERP_BUSINESS_DECISION_ALREADY_TERMINAL"
        || String(caught?.message ?? "").includes("ERP_BUSINESS_DECISION_ALREADY_TERMINAL")
      ) {
        return error(409, "BUSINESS_DECISION_ALREADY_TERMINAL", "该事项已经由另一位授权人作出决定，请刷新后查看。", caught.details);
      }
      throw caught;
    }
  }
}

function validateInput(workspace, body) {
  const businessType = cleanText(body.businessType);
  const businessId = cleanText(body.businessId);
  const decisionScope = cleanText(body.decisionScope);
  const outcome = cleanText(body.outcome);
  const actionLabel = cleanText(body.actionLabel) || outcomeLabels[outcome] || "";
  const note = cleanText(body.note ?? body.reason);
  const taskTitle = cleanText(body.taskTitle);
  if (!targetCollections[businessType] || !businessId) {
    return error(422, "BUSINESS_DECISION_TARGET_INVALID", "经营决定必须绑定受支持的业务事项。");
  }
  if (!targetExists(workspace, businessType, businessId)) {
    return error(404, "BUSINESS_DECISION_TARGET_NOT_FOUND", "经营决定对应的业务事项不存在或已经移除。");
  }
  if (!decisionScope) return error(422, "BUSINESS_DECISION_SCOPE_REQUIRED", "请选择经营决定范围。");
  if (!outcomeLabels[outcome]) return error(422, "BUSINESS_DECISION_OUTCOME_INVALID", "请选择固定的决定结果。");
  if (!actionLabel || actionLabel.length > 40) return error(422, "BUSINESS_DECISION_ACTION_LABEL_INVALID", "决定动作名称必须在 40 个字以内。");
  if (note.length < 2 || note.length > 500) return error(422, "BUSINESS_DECISION_NOTE_REQUIRED", "请填写 2–500 个字的决定说明。");
  if (taskTitle.length > 120) return error(422, "BUSINESS_DECISION_TASK_TITLE_INVALID", "事项标题不能超过 120 个字。");
  const authorizationAmount = nullableAmount(body.authorizationAmount);
  if (body.authorizationAmount !== null && body.authorizationAmount !== undefined && body.authorizationAmount !== "" && authorizationAmount === null) {
    return error(422, "BUSINESS_DECISION_AMOUNT_INVALID", "授权金额必须为非负数。");
  }
  return {
    ok: true,
    value: {
      businessType,
      businessId,
      decisionScope,
      outcome,
      actionLabel,
      note,
      taskTitle,
      factsSnapshot: normalizeFacts(body.factsSnapshot),
      authorizationAmount,
    },
  };
}

function targetExists(workspace, businessType, businessId) {
  return targetCollections[businessType].some((collectionKey) =>
    (workspace?.[collectionKey] ?? []).some((record) => {
      const candidates = [record.id, record.businessId, record.originalOrderId, record.orderId, record.productionTaskId];
      return candidates.some((candidate) => cleanText(candidate) === businessId);
    }));
}

function buildOfficeExecutionTodo({ decisionRecord, decisionSummary, actionLabel, note, taskTitle, operatorId, timestamp }) {
  const suffix = createHash("sha256").update(decisionRecord.id).digest("hex").slice(0, 20).toUpperCase();
  const id = `T-BD-${suffix}`;
  return {
    id,
    todoId: id,
    bizNo: id,
    type: "经营决定待执行",
    refType: decisionRecord.businessType,
    refId: decisionRecord.businessId,
    priority: decisionRecord.decisionScope === "major_exception" ? "异常" : "关注",
    status: "未处理",
    summary: `${taskTitle ? `${taskTitle} · ` : ""}${decisionSummary}；${note}`,
    dueAt: "",
    remindAt: "",
    handledBy: "",
    handledAt: "",
    handlingResult: actionLabel,
    createdBy: operatorId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeFacts(value) {
  return (Array.isArray(value) ? value : []).slice(0, 12).map((item) => {
    if (Array.isArray(item)) return [cleanText(item[0]).slice(0, 40), cleanText(item[1]).slice(0, 160)];
    return [cleanText(item?.label).slice(0, 40), cleanText(item?.value).slice(0, 160)];
  }).filter(([label, fact]) => label && fact);
}

function nullableAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(2)) : null;
}

function error(statusCode, code, message, details) {
  return { error: true, statusCode, code, message, ...(details === undefined ? {} : { details }) };
}

function cleanText(value) {
  return String(value ?? "").trim();
}
