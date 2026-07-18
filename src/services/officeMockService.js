import { createOfficeScenarioData, makeTodo } from "../data/fixtures.js";
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

export function loadOfficeWorkspace(scenarioId) {
  const data = createOfficeScenarioData(scenarioId);
  return {
    ...data,
    defaultSelections: {
      todoId: data.initialTodos[0]?.id ?? "",
      orderId: data.initialOrderLines[0]?.id ?? "",
      stockId: data.initialInventories[0]?.id ?? "",
      fulfillmentId: data.initialFulfillments[0]?.id ?? "",
      statementId: data.initialStatements[0]?.id ?? "",
      rawMaterialInboundId: data.initialRawMaterialInbounds[0]?.id ?? "",
    },
  };
}

export function createOfficeTodo(input) {
  const id = input.id ?? createMockId("T-P0");
  const timestamp = new Date().toISOString();
  return makeTodo({ id, wait: "刚刚", createdAt: timestamp, updatedAt: timestamp, ...input });
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
