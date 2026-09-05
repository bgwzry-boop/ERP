import { createOfficeScenarioData } from "../data/fixtures.js";

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
