import { createOfficeScenarioData } from "../data/fixtures.js";
import { parseOrderText } from "../lib/orderParser.js";

export function loadOfficeWorkspace(scenarioId) {
  const data = createOfficeScenarioData(scenarioId);
  return {
    ...data,
    initialDraftRows: parseOrderText(data.sampleText, { customers: data.customers, inventories: data.initialInventories }),
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
