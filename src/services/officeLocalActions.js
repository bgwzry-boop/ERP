import {
  confirmDraftOrder,
  getDraftSaveTodoInput,
} from "../state/officeOrderActions.js";
import {
  getFulfillmentExceptionTodoInput,
  updateFulfillmentsForAction,
} from "../state/officeFulfillmentActions.js";
import {
  confirmStatementWriteOff,
  markStatementSent,
} from "../state/officeStatementActions.js";

export function createOfficeTodo(input) {
  const id = input.id ?? createMockId("T-P0");
  const timestamp = new Date().toISOString();
  return makeOfficeTodo({ id, wait: "刚刚", createdAt: timestamp, updatedAt: timestamp, ...input });
}

export function createDraftSaveTodo(input) {
  return createOfficeTodo(getDraftSaveTodoInput(input));
}

export function confirmOfficeDraftOrder(input) {
  return confirmDraftOrder(input);
}

export function updateOfficeFulfillmentAction(input) {
  return updateFulfillmentsForAction(input.fulfillments, input.fulfillmentId, input.action);
}

export function createOfficeFulfillmentExceptionTodo(input) {
  return createOfficeTodo(getFulfillmentExceptionTodoInput(input.fulfillment, input.todoType));
}

export function markOfficeStatementSent(input) {
  return markStatementSent(input.statements, input.statementId, input.payload);
}

export function confirmOfficeStatementWriteOff(input) {
  return confirmStatementWriteOff(input.statements, input.statement, input.blockingAmount);
}

function createMockId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
}

function makeOfficeTodo(input) {
  return {
    id: input.id,
    type: input.type,
    customerId: input.customerId,
    ref: input.ref,
    refType: input.refType ?? "",
    refId: input.refId ?? input.ref,
    summary: input.summary,
    wait: input.wait,
    latest: input.latest,
    urgency: input.urgency,
    impact: input.impact,
    handled: input.handled === true,
    ...input,
  };
}
