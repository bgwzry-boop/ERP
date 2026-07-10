import { createOfficeScenarioData, defaultOfficeScenarioId } from "../../src/data/fixtures.js";

export function loadSyntheticOfficeSeed(scenarioId = defaultOfficeScenarioId) {
  const data = createOfficeScenarioData(scenarioId);
  return {
    scenario: data.scenario,
    customers: data.customers,
    orderLines: data.initialOrderLines,
    inventories: data.initialInventories,
    todos: data.initialTodos,
    fulfillments: data.initialFulfillments,
    statements: data.initialStatements,
    initialRawMaterialInbounds: data.initialRawMaterialInbounds,
    sampleText: data.sampleText,
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
