import { createOfficeScenarioData, defaultOfficeScenarioId } from "../../src/data/fixtures.js";

export function loadSyntheticOfficeSeed(scenarioId = defaultOfficeScenarioId) {
  const data = createOfficeScenarioData(scenarioId);
  const initialDriverDeliveryDispatches = data.initialFulfillments
    .filter((fulfillment) => fulfillment.method === "送货")
    .map((fulfillment, index) => ({
      id: `DDIS-DEMO-${fulfillment.id}`,
      dispatchId: `DDIS-DEMO-${fulfillment.id}`,
      bizNo: `DDIS-DEMO-${fulfillment.id}`,
      fulfillmentId: fulfillment.id,
      driverId: "U-DRIVER-A",
      routeDate: "2026-06-29",
      routeNo: "演示送货线-A",
      routeBatchNo: "演示送货线-A",
      stopSequence: index + 1,
      routeSequence: index + 1,
      dispatchStatus: "已派单",
      plannedDepartureAt: "2026-06-29T08:30:00.000Z",
      assignedBy: "U-OFFICE-A",
      assignedAt: "2026-06-29T08:00:00.000Z",
      remark: "演示数据默认派单",
      revision: 0,
      createdAt: "2026-06-29T08:00:00.000Z",
      updatedAt: "2026-06-29T08:00:00.000Z",
    }));
  return {
    scenario: data.scenario,
    customers: data.customers,
    orderLines: data.initialOrderLines,
    inventories: data.initialInventories,
    todos: data.initialTodos,
    fulfillments: data.initialFulfillments,
    initialDriverDeliveryDispatches,
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
