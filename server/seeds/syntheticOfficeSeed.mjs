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
  const initialMaintenanceTasks = [
    buildMaintenanceSeedTask({
      id: "MT-BAG-01",
      machineId: "BAG-01",
      machineName: "制袋 1 号机",
      type: "日常巡检",
      faultCategory: "开机前安全检查",
      priority: "今天",
      status: "待检查",
      summary: "检查温控、封刀、防护罩与急停按钮。",
      dueAt: "2026-07-18T04:00:00.000Z",
    }),
    buildMaintenanceSeedTask({
      id: "MT-PRINT-01",
      machineId: "PRINT-01",
      machineName: "丝印 1 号机",
      type: "设备报修",
      faultCategory: "刮刀回程异响",
      priority: "异常",
      status: "待处理",
      summary: "回程出现连续异响，先检查传动与紧固状态。",
      dueAt: "2026-07-18T02:30:00.000Z",
    }),
    buildMaintenanceSeedTask({
      id: "MT-PACK-01",
      machineId: "PACK-01",
      machineName: "包装封口机",
      type: "预防维护",
      faultCategory: "周保养",
      priority: "本周",
      status: "待维护",
      summary: "清洁压轮并检查加热带磨损。",
      dueAt: "2026-07-20T09:00:00.000Z",
    }),
  ];
  return {
    scenario: data.scenario,
    customers: data.customers,
    orderLines: data.initialOrderLines,
    inventories: data.initialInventories,
    orderDrafts: data.initialOrderDrafts,
    initialOrderDrafts: data.initialOrderDrafts,
    todos: data.initialTodos,
    fulfillments: data.initialFulfillments,
    initialDriverDeliveryDispatches,
    statements: data.initialStatements,
    initialRawMaterialInbounds: data.initialRawMaterialInbounds,
    initialMaintenanceTasks,
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

function buildMaintenanceSeedTask(input) {
  const timestamp = "2026-07-18T00:00:00.000Z";
  return {
    ...input,
    bizNo: input.id,
    finding: "",
    actionTaken: "",
    photoAttachmentIds: [],
    assignedTechnicianEmployeeId: "",
    actualTechnicianEmployeeId: "",
    completedAt: "",
    createdBy: "U-OFFICE-A",
    updatedBy: "U-OFFICE-A",
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
