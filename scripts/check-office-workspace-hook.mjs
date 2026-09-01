import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  copyTextToClipboard,
  downloadMasterDataImportTemplateWorkbook,
  downloadStatementExcelWorkbook,
  downloadTextFile,
  mergeAttachmentSummaries,
  readBlobAsDataUrl,
  readFileAsDataUrl,
  sanitizeDownloadFileName,
} from "../src/app/browserFileActions.js";
import { useOfficeWorkspace } from "../src/app/useOfficeWorkspace.js";
import { shouldRefreshMasterDataOnEntry } from "../src/app/useOfficeMasterDataEntryRefresh.js";
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
assert.equal(workspace.v1StatusRouteState.goLiveMeta.source, "unavailable");
assert.equal(workspace.v1StatusRouteState.fieldEvidenceAttachmentListAction.ownerId, "");
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

const masterDataEntryRef = { current: null };
const masterDataAuth = { authenticated: true };
assert.equal(shouldRefreshMasterDataOnEntry(masterDataEntryRef, { activePage: "todos", authState: masterDataAuth, currentUserId: "U-1" }), false);
assert.equal(shouldRefreshMasterDataOnEntry(masterDataEntryRef, { activePage: "masterData", authState: masterDataAuth, currentUserId: "U-1" }), true);
assert.equal(shouldRefreshMasterDataOnEntry(masterDataEntryRef, { activePage: "masterData", authState: masterDataAuth, currentUserId: "U-1" }), false);
assert.equal(shouldRefreshMasterDataOnEntry(masterDataEntryRef, { activePage: "masterData", authState: { authenticated: true }, currentUserId: "U-1" }), true);
assert.equal(shouldRefreshMasterDataOnEntry(masterDataEntryRef, { activePage: "orders", authState: masterDataAuth, currentUserId: "U-1" }), false);
assert.equal(shouldRefreshMasterDataOnEntry(masterDataEntryRef, { activePage: "masterData", authState: masterDataAuth, currentUserId: "U-1" }), true);

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const browserFileActionsSource = readFileSync(new URL("../src/app/browserFileActions.js", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../src/app/useOfficeWorkspace.js", import.meta.url), "utf8");
const workspaceOverlaysSource = readFileSync(new URL("../src/app/WorkspaceOverlays.jsx", import.meta.url), "utf8");
const workspaceOverlayControllerSource = readFileSync(new URL("../src/app/WorkspaceOverlayController.jsx", import.meta.url), "utf8");
assert.match(appSource, /useOfficeWorkspace\(\{/);
assert.match(appSource, /serverRequired: runtimeServerRequired/);
assert.match(appSource, /from "\.\/app\/browserFileActions\.js"/);
assert.match(appSource, /from "\.\/app\/WorkspaceOverlayController\.jsx"/);
assert.match(workspaceOverlayControllerSource, /WorkspaceOverlays/);
for (const overlayName of ["ActionModal", "OrderLineActionModal", "AttachmentViewerModal", "MasterDataImportTemplateModal"]) {
  assert.doesNotMatch(appSource, new RegExp(`<${overlayName}`));
  assert.match(workspaceOverlaysSource, new RegExp(`<${overlayName}`));
}
for (const helperName of [
  "readFileAsDataUrl",
  "copyTextToClipboard",
  "mergeAttachmentSummaries",
  "readBlobAsDataUrl",
  "sanitizeDownloadFileName",
  "downloadStatementExcelWorkbook",
  "downloadMasterDataImportTemplateWorkbook",
  "downloadTextFile",
]) {
  assert.doesNotMatch(appSource, new RegExp(`(?:async )?function ${helperName}\\(`));
  assert.match(browserFileActionsSource, new RegExp(`export (?:async )?function ${helperName}\\(`));
}
assert.doesNotMatch(appSource, /useState\(initialTodos\)/);
assert.doesNotMatch(appSource, /useState\(initialOrderLines\)/);
assert.doesNotMatch(appSource, /useState\(initialInventories\)/);
assert.match(hookSource, /todosRef\.current = todos/);
assert.match(hookSource, /printJobQueueItemsRef\.current = printJobQueue\.items/);
assert.match(hookSource, /useOfficeMasterDataEntryRefresh/);
assert.doesNotMatch(hookSource, /createInitialAuthState|setActivePage|setToast|setModal/);

assert.equal(await readFileAsDataUrl(null), "");
assert.equal(await readBlobAsDataUrl(null), "");
assert.equal(await copyTextToClipboard(""), false);
assert.equal(await copyTextToClipboard("copy-without-browser"), false);
assert.equal(downloadStatementExcelWorkbook("content"), false);
assert.equal(downloadMasterDataImportTemplateWorkbook("customers"), null);
assert.equal(downloadTextFile("content"), false);
assert.equal(sanitizeDownloadFileName("  bad/name?:file  "), "bad-name-file");
assert.deepEqual(
  mergeAttachmentSummaries(
    [{ attachmentId: "ATT-1", status: "待审" }],
    [null, { attachmentId: "ATT-1", status: "已审" }, { attachmentId: "ATT-2", status: "待传" }],
  ),
  [
    { attachmentId: "ATT-1", status: "已审" },
    { attachmentId: "ATT-2", status: "待传" },
  ],
);

console.log("Office workspace hook check passed: workspace and browser-file boundaries stay outside the App shell.");
