import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useOfficeWorkspace } from "../src/app/useOfficeWorkspace.js";
import { loadOfficeWorkspace } from "../src/services/officeMockService.js";

const scenarioData = loadOfficeWorkspace();
let workspace;
let productionWorkspace;

function WorkspaceProbe() {
  workspace = useOfficeWorkspace(scenarioData);
  return React.createElement("div", null, "workspace-ready");
}

function ProductionWorkspaceProbe() {
  productionWorkspace = useOfficeWorkspace({ ...scenarioData, serverRequired: true });
  return React.createElement("div", null, "production-workspace-ready");
}

assert.equal(renderToStaticMarkup(React.createElement(WorkspaceProbe)), "<div>workspace-ready</div>");
assert.equal(workspace.todos.length, scenarioData.initialTodos.length);
assert.equal(workspace.orderLines.length, scenarioData.initialOrderLines.length);
assert.equal(workspace.inventoryRecords.length, scenarioData.initialInventories.length);
assert.equal(workspace.fulfillments.length, scenarioData.initialFulfillments.length);
assert.equal(workspace.statements.length, scenarioData.initialStatements.length);
assert.equal(workspace.rawMaterialInbounds.length, scenarioData.initialRawMaterialInbounds.length);
assert.equal(workspace.draftRows.length > 0, true);
assert.equal(Array.isArray(workspace.productionPacking.productionTasks), true);
assert.equal(Array.isArray(workspace.driverDeliveryTasks), true);
assert.equal(workspace.printJobQueue.source, "idle");
assert.equal(workspace.v1GoLiveStatusState.source, "unavailable");
assert.equal(workspace.v1FieldEvidenceAttachmentListAction.ownerId, "");
assert.equal(workspace.todosRef.current, workspace.todos);
assert.equal(workspace.orderLinesRef.current, workspace.orderLines);
assert.equal(workspace.inventoryRecordsRef.current, workspace.inventoryRecords);
assert.equal("authState" in workspace, false);
assert.equal("activePage" in workspace, false);
assert.equal("toast" in workspace, false);
assert.equal("modal" in workspace, false);

assert.equal(
  renderToStaticMarkup(React.createElement(ProductionWorkspaceProbe)),
  "<div>production-workspace-ready</div>",
);
for (const key of ["todos", "orderLines", "inventoryRecords", "fulfillments", "statements", "rawMaterialInbounds", "draftRows"]) {
  assert.deepEqual(productionWorkspace[key], [], `formal workspace ${key} must not initialize from demo fixtures`);
}
assert.equal(productionWorkspace.entryText, "");
assert.equal(productionWorkspace.draftStatus, "待录入");
assert.equal(productionWorkspace.todoMeta.source, "idle");
assert.equal(productionWorkspace.orderPoolMeta.source, "idle");
assert.equal(productionWorkspace.inventoryMeta.source, "idle");
assert.equal(productionWorkspace.fulfillmentMeta.source, "idle");
assert.equal(productionWorkspace.statementReadMeta.source, "idle");
assert.equal(productionWorkspace.rawMaterialInboundMeta.source, "idle");
for (const key of ["selectedTodoId", "selectedOrderId", "selectedStockId", "selectedFulfillmentId", "selectedStatementId", "selectedRawMaterialInboundId", "selectedDriverTaskId", "selectedMasterDataId"]) {
  assert.equal(productionWorkspace[key], "", `formal workspace ${key} must not initialize from a demo selection`);
}
assert.deepEqual(productionWorkspace.productionPacking.productionTasks, []);
assert.deepEqual(productionWorkspace.driverDeliveryTasks, []);

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../src/app/useOfficeWorkspace.js", import.meta.url), "utf8");
assert.match(appSource, /useOfficeWorkspace\(\{/);
assert.match(appSource, /serverRequired: runtimeServerRequired/);
assert.doesNotMatch(appSource, /useState\(initialTodos\)/);
assert.doesNotMatch(appSource, /useState\(initialOrderLines\)/);
assert.doesNotMatch(appSource, /useState\(initialInventories\)/);
assert.match(hookSource, /todosRef\.current = todos/);
assert.match(hookSource, /printJobQueueItemsRef\.current = printJobQueue\.items/);
assert.doesNotMatch(hookSource, /createInitialAuthState|setActivePage|setToast|setModal/);

console.log("Office workspace hook check passed: business state ownership moved out of App while shell/auth state stays outside.");
