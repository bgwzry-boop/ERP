import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  apiSharedServiceRegistry,
  createApiSharedServiceRegistry,
} from "../server/apiSharedServiceRegistry.mjs";

const apiSource = readFileSync(new URL("../server/apiServer.mjs", import.meta.url), "utf8");
const registrySource = readFileSync(
  new URL("../server/apiSharedServiceRegistry.mjs", import.meta.url),
  "utf8",
);

const requiredFunctionKeys = [
  "findInventoryCorrectionDraft",
  "findOrderLine",
  "findPrintDevice",
  "findPrintJob",
  "getPermissionOperatorId",
  "requireActionPermission",
  "requireAttachmentCreatePermission",
  "sendBusinessError",
  "sendCommandRecord",
  "sendCommandResponse",
  "sendFile",
  "sendInlineFile",
  "sendJson",
  "sendNotFound",
  "summarizeOrderLineForChange",
  "toProductionTaskSummary",
];

const requiredServiceKeys = [
  "attachmentCreateCommandService",
  "attachmentFileAccessService",
  "demoWorkspaceSeedService",
  "driverDeviceFieldTestCommandService",
  "fulfillmentActionCommandService",
  "fulfillmentPrintCommandService",
  "fulfillmentReadProjectionService",
  "inventoryCorrectionCommandService",
  "inventoryCorrectionReadProjectionService",
  "inventoryReservationReleaseCommandService",
  "masterDataEmployeeAccountCommandService",
  "masterDataImportCommandService",
  "masterDataMachineCommandService",
  "orderDraftCommandService",
  "orderLineMutationCommandService",
  "packingCommandService",
  "printBatchCommandService",
  "printDeviceCommandService",
  "printDriverDiagnosticsService",
  "printJobLifecycleService",
  "productionFinishedGoodsPhotoCommandService",
  "productionFinishedGoodsPhotoProjectionService",
  "productionMachineQueueReadService",
  "productionReportingCommandService",
  "productionSchedulingCommandService",
  "rawMaterialCommandService",
  "runtimeAuthCommandService",
  "statementCommunicationCommandService",
  "statementExportFileService",
  "statementFinancialCommandService",
  "todoCommandService",
  "todoReadProjectionService",
  "v1FieldEvidenceDraftService",
  "v1FieldEvidenceStagingService",
  "v1GoLiveStatusResponseService",
  "v1LocalCommandRunnerService",
  "v1ProductionEnvValuesApplyService",
  "v1ProductionFirstStageExecutionLiveRunService",
  "v1ProductionFirstStageValuesDryRunLivePrecheckService",
  "v1ProductionGoLivePrecheckService",
  "v1ProductionPersistenceEvidenceLiveRunService",
  "v1ReleaseCandidateRefreshPrecheckService",
  "v1ReleaseCandidateRefreshService",
  "v1V2BoundaryService",
];

assert.equal(Object.isFrozen(apiSharedServiceRegistry), true);
for (const key of requiredFunctionKeys) {
  assert.equal(typeof apiSharedServiceRegistry[key], "function", `${key} should remain callable`);
}
for (const key of requiredServiceKeys) {
  assert.equal(
    typeof apiSharedServiceRegistry[key],
    "object",
    `${key} should remain a composed service`,
  );
  assert.notEqual(apiSharedServiceRegistry[key], null);
}

const freshRegistry = createApiSharedServiceRegistry();
assert.equal(Object.isFrozen(freshRegistry), true);
assert.notEqual(freshRegistry, apiSharedServiceRegistry);
assert.equal(
  typeof freshRegistry.fulfillmentActionCommandService.validateDriverTaskAccess,
  "function",
);
assert.equal(typeof freshRegistry.v1GoLiveStatusResponseService.build, "function");
assert.equal(typeof freshRegistry.demoWorkspaceSeedService.buildInitialTaskSeeds, "function");

assert.match(apiSource, /import \{ apiSharedServiceRegistry \} from "\.\/apiSharedServiceRegistry\.mjs";/);
assert.match(apiSource, /\} = apiSharedServiceRegistry;/);
for (const forbiddenFactory of [
  "createHttpResponseService(",
  "createWorkspaceRecordService(",
  "createOrderDraftCommandService(",
  "createFulfillmentActionCommandService(",
  "createProductionSchedulingCommandService(",
  "createStatementFinancialCommandService(",
  "createV1GoLiveStatusResponseService(",
]) {
  assert.equal(
    apiSource.includes(forbiddenFactory),
    false,
    `${forbiddenFactory} should not return to apiServer.mjs`,
  );
  assert.equal(
    registrySource.includes(forbiddenFactory),
    true,
    `${forbiddenFactory} should remain in the shared registry`,
  );
}
assert.doesNotMatch(registrySource, /create[A-Za-z0-9]+Repository\s*\(/);
assert.doesNotMatch(registrySource, /http\.createServer|handle[A-Za-z0-9]+Routes\s*\(/);

console.log(
  `API shared-service registry checks passed: ${requiredFunctionKeys.length} functions and ${requiredServiceKeys.length} composed services are frozen behind one non-repository boundary.`,
);
