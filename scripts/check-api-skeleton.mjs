import { createApiServer } from "../server/apiServer.mjs";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { assertStatementXlsxWorkbook } from "./xlsxTestUtils.mjs";

const checkStorageRoot = join(process.cwd(), ".erp-local-storage", "checks", "api-skeleton");
const printCommandBridgeScript = join(process.cwd(), "scripts", "print-command-bridge.mjs");
const fakeCupsStatusScript = join(process.cwd(), "scripts", "fake-cups-lpstat.mjs");
rmSync(checkStorageRoot, { recursive: true, force: true });
process.env.ERP_LOCAL_STORAGE_DIR = checkStorageRoot;
delete process.env.ERP_PRINT_DRIVER_DRY_RUN;
delete process.env.ERP_SYSTEM_PRINTER_ENABLED;
delete process.env.ERP_SYSTEM_PRINTER_ADAPTER;
delete process.env.ERP_SYSTEM_PRINTER_COMMAND;
delete process.env.ERP_SYSTEM_PRINTER_COMMAND_ARGS_JSON;
delete process.env.ERP_SYSTEM_PRINTER_COMMAND_TIMEOUT_MS;
delete process.env.ERP_SYSTEM_PRINTER_ALLOWLIST;

let server = createApiServer();
let restartedServer = null;
let readinessServer = null;

try {
  await listen(server);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const checks = [
    [
      "/api/health",
      (json) =>
        json.status === "ok" &&
        json.openapi?.valid === true &&
        json.seed?.attachmentRepository === "local_json" &&
        json.seed?.attachmentAccessAuditRepository === "local_json" &&
        json.seed?.attachmentObjectStorage === "local_fs" &&
        json.seed?.statementExportObjectStorage === "local_fs" &&
        json.seed?.orderPoolReadRepository === "local_memory" &&
        json.seed?.driverDeviceFieldTestRepository === "local_memory" &&
        json.seed?.driverDeliveryTaskReadRepository === "local_memory" &&
        json.seed?.inventoryLedgerReadRepository === "local_memory" &&
        json.seed?.productionPackingTransactionRepository === "local_memory" &&
        json.seed?.printBatchRepository === "local_json" &&
        json.seed?.printDeviceRepository === "local_json" &&
        json.seed?.printJobRepository === "local_json" &&
        json.seed?.printerDeviceFieldTestRepository === "local_json" &&
        json.seed?.rawMaterialInboundRepository === "local_json" &&
        json.seed?.rawMaterialSupplierStatementReviewRepository === "local_json" &&
        json.seed?.printDriverAdapter === "guarded_adapter" &&
        json.seed?.productionEnvFileApplication?.status === "not_configured" &&
        json.seed?.productionEnvFileApplication?.applied === false &&
        json.seed?.productionEnvFileApplication?.safeguards?.envValuesIncluded === false &&
        json.seed?.v1PersistenceProfile?.repositoryProfile === "disabled" &&
        json.seed?.v1PersistenceProfile?.connectionStringExposed === false,
    ],
    ["/api/openapi/status", (json) => json.valid === true && json.pathCount >= 29],
    [
      "/api/system/v1-readiness",
      (json) =>
        json.status === "blocked" &&
        json.ready === false &&
        json.scope === "v1_system_persistence_readiness" &&
        json.summary?.totalCount === 7 &&
        json.summary?.blockingCount === 6 &&
        json.localPersistenceAcceptance?.accepted === false &&
        json.persistenceProfile?.repositoryProfile === "disabled" &&
        json.persistenceProfile?.connectionStringExposed === false &&
        json.repositories?.some(
          (repository) =>
            repository.key === "runtimeIdentityRepository" &&
            repository.kind === "local_json" &&
            repository.localKind === true,
        ) &&
        json.repositories?.some(
          (repository) =>
            repository.key === "rawMaterialInboundRepository" &&
            repository.kind === "local_json" &&
            repository.localKind === true,
        ) &&
        json.repositories?.some(
          (repository) =>
            repository.key === "rawMaterialSupplierStatementReviewRepository" &&
            repository.kind === "local_json" &&
            repository.localKind === true,
        ) &&
        json.repositoryGroups?.some((group) =>
          group.repositories?.some((repository) => repository.key === "runtimeIdentityRepository"),
        ) &&
        json.repositoryGroups?.some((group) =>
          group.repositories?.some((repository) => repository.key === "rawMaterialSupplierStatementReviewRepository"),
        ) &&
        json.safeguards?.persistenceProfileConnectionStringExposed === false &&
        json.repositories?.some((repository) => repository.kind === "local_memory" && repository.localKind === true) &&
        json.repositoryGroups?.some(
          (group) =>
            group.key === "file-retention-stores" &&
            group.localFsCount >= 1 &&
            group.ready === false,
        ) &&
        json.safeguards?.nonMutating === true &&
        json.safeguards?.repositoryPayloadExposed === false &&
        json.safeguards?.connectionStringExposed === false &&
        json.safeguards?.localPathExposed === false &&
        json.remainingV1Risks?.some((risk) => risk.includes("local_memory")),
    ],
    [
      "/api/print-driver/config",
      (json) =>
        json.printDriverAdapter?.kind === "guarded_adapter" &&
        json.printDriverAdapter?.systemPrinterEnabled === false &&
        json.printDriverAdapter?.systemPrinterCommandConfigured === false &&
        json.printDriverAdapter?.systemPrinterCommandArgsConfigured === true &&
        json.printDriverAdapter?.systemPrinterCommandTimeoutMs === 5000 &&
        json.printDriverAdapter?.realDispatchAvailable === false &&
        json.printDriverAdapter?.environmentPreflight?.summary?.totalCount === 9 &&
        json.printDriverAdapter?.environmentPreflight?.safeguards?.nonPrinting === true &&
        json.printDriverAdapter?.environmentPreflight?.safeguards?.commandValueExposed === false &&
        json.printDriverAdapter?.environmentPreflight?.safeguards?.spoolPathExposed === false &&
        json.printDriverAdapter?.environmentPreflight?.items?.some(
          (item) => item.key === "command-executable" && item.status === "pending",
        ) &&
        json.printDriverAdapter?.safeguards?.commandValueExposed === false &&
        !Object.hasOwn(json.printDriverAdapter, "systemPrinterCommand"),
    ],
    [
      "/api/print-driver/spool-diagnostics",
      (json) =>
        json.status === "not_configured" &&
        json.ready === false &&
        json.scope === "non_printing_command_bridge_spool_diagnostics" &&
        json.writeOk === false &&
        json.pendingPollOk === false &&
        json.completedPollOk === false &&
        json.cleanupOk === false &&
        json.secretFieldsExposed === false &&
        json.spoolPathExposed === false &&
        json.physicalPrinterCalled === false &&
        json.safeguards?.nonPrinting === true &&
        json.safeguards?.payloadExposed === false &&
        json.blockers?.some((item) => item.key === "system-printer-enabled") &&
        !JSON.stringify(json).includes(checkStorageRoot),
    ],
    [
      "/api/print-driver/cups-diagnostics",
      (json) =>
        json.status === "not_configured" &&
        json.ready === false &&
        json.scope === "non_printing_cups_queue_preflight" &&
        json.cupsQueueStatusReadback === "cups_status_command" &&
        json.cupsPrinterConfigured === false &&
        json.cupsPrinterAllowed === false &&
        json.cupsStatusCommandConfigured === false &&
        json.cupsStatusCommandRunnable === false &&
        json.physicalPrinterCalled === false &&
        json.commandValueExposed === false &&
        json.commandArgsExposed === false &&
        json.stdoutExposed === false &&
        json.stderrExposed === false &&
        json.safeguards?.nonPrinting === true &&
        json.safeguards?.payloadExposed === false &&
        json.safeguards?.printFileCreated === false &&
        json.blockers?.some((item) => item.key === "system-printer-enabled") &&
        !JSON.stringify(json).includes(checkStorageRoot),
    ],
    [
      "/api/print-driver/v1-readiness",
      (json) =>
        json.status === "blocked" &&
        json.ready === false &&
        json.scope === "v1_print_go_live_readiness" &&
        json.summary?.totalCount === 9 &&
        json.summary?.blockingCount >= 7 &&
        json.safeguards?.nonPrinting === true &&
        json.safeguards?.physicalPrinterCalled === false &&
        json.printDriverAdapter?.realDispatchAvailable === false &&
        json.spoolDiagnostics?.ready === false &&
        json.cupsDiagnostics?.ready === false &&
        json.criteria?.some((item) => item.key === "print-driver-config" && item.status === "pending") &&
        json.criteria?.some((item) => item.key === "spool-status-readback" && item.status === "pending") &&
        json.criteria?.some((item) => item.key === "cups-queue-preflight" && item.status === "pending") &&
        json.deviceReadiness?.some(
          (item) =>
            item.key === "express-ltl-label-printer" &&
            item.printDevice?.printDeviceId === "PRN-LABEL-A" &&
            item.printDevice?.driverMode === "preview_only" &&
            item.ready === false,
        ) &&
        json.deviceReadiness?.some(
          (item) =>
            item.key === "dot-matrix-notes-printer" &&
            item.printDevice?.printDeviceId === "PRN-DOT-A" &&
            item.printDevice?.driverMode === "preview_only" &&
            item.ready === false,
        ) &&
        json.remainingV1Risks?.some((item) => item.includes("现场 QA")) &&
        !JSON.stringify(json).includes(checkStorageRoot),
    ],
    ["/api/office/workspace", (json) => json.customers?.length >= 12 && json.orderLines?.length >= 30],
    ["/api/order-lines?pageSize=2", (json) => json.items?.length === 2 && json.total >= 30],
    ["/api/inventory/items?pageSize=3", (json) => json.items?.length === 3 && json.total >= 10],
    [
      "/api/fulfillments?method=快递快运",
      (json) =>
        json.items?.length >= 1 &&
        Boolean(json.items?.[0]?.fulfillmentId) &&
        Boolean(json.items?.[0]?.customerId) &&
        Boolean(json.items?.[0]?.orderLineId) &&
        typeof json.items?.[0]?.packageCount === "number",
    ],
    ["/api/statements/customers", (json) => json.items?.length >= 6],
    ["/api/todos?status=open", (json) => json.items?.length >= 8],
    ["/api/permissions/effective", (json) => json.user?.userId === "U-OFFICE-A" && json.actionPermissions?.length > 0],
  ];

  for (const [route, assert] of checks) {
    const json = await getJson(baseUrl, route);
    if (!assert(json)) {
      throw new Error(`${route} returned an unexpected payload`);
    }
  }

  const defaultDriverReadiness = await getJson(baseUrl, "/api/driver/v1-readiness", {
    headers: { "x-erp-user-id": "U-DRIVER-A" },
  });
  if (
    defaultDriverReadiness.status !== "blocked" ||
    defaultDriverReadiness.ready !== false ||
    defaultDriverReadiness.scope !== "v1_driver_mobile_readiness" ||
    defaultDriverReadiness.summary?.totalCount !== 6 ||
    !defaultDriverReadiness.criteria?.some((item) => item.key === "driver-native-package-scan" && item.status === "pending") ||
    !defaultDriverReadiness.criteria?.some((item) => item.key === "driver-native-navigation" && item.status === "pending") ||
    defaultDriverReadiness.safeguards?.nonMutating !== true ||
    defaultDriverReadiness.safeguards?.deliveryStatusChanged !== false ||
    defaultDriverReadiness.safeguards?.requiresNativeShell !== true
  ) {
    throw new Error("/api/driver/v1-readiness did not return the default blocked driver-readiness gate");
  }

  const deniedDriverReadiness = await getJson(baseUrl, "/api/driver/v1-readiness", {
    expectedStatus: 403,
    headers: { "x-erp-user-id": "U-FINANCE-A" },
  });
  if (deniedDriverReadiness.requiredPermission !== "delivery.view") {
    throw new Error("/api/driver/v1-readiness should deny users without delivery.view permission");
  }

  const deniedPrintDriverSpoolDiagnostics = await getJson(baseUrl, "/api/print-driver/spool-diagnostics", {
    expectedStatus: 403,
    headers: { "x-erp-user-id": "U-FINANCE-A" },
  });
  if (deniedPrintDriverSpoolDiagnostics.requiredPermission !== "fulfillment.print") {
    throw new Error("/api/print-driver/spool-diagnostics should deny users without print permission");
  }
  const deniedPrintDriverCupsDiagnostics = await getJson(baseUrl, "/api/print-driver/cups-diagnostics", {
    expectedStatus: 403,
    headers: { "x-erp-user-id": "U-FINANCE-A" },
  });
  if (deniedPrintDriverCupsDiagnostics.requiredPermission !== "fulfillment.print") {
    throw new Error("/api/print-driver/cups-diagnostics should deny users without print permission");
  }
  const deniedPrintDriverReadiness = await getJson(baseUrl, "/api/print-driver/v1-readiness", {
    expectedStatus: 403,
    headers: { "x-erp-user-id": "U-FINANCE-A" },
  });
  if (deniedPrintDriverReadiness.requiredPermission !== "fulfillment.print") {
    throw new Error("/api/print-driver/v1-readiness should deny users without print permission");
  }
  await checkPositivePrintDriverReadiness();

  const firstOrderLineList = await getJson(baseUrl, "/api/order-lines?pageSize=1");
  const firstOrderLineId = firstOrderLineList.items?.[0]?.id;
  if (!firstOrderLineId || !firstOrderLineList.items[0].productName || !firstOrderLineList.items[0].lineStatus) {
    throw new Error("/api/order-lines did not return normalized order-pool list fields");
  }
  const firstOrderLineDetail = await getJson(baseUrl, `/api/order-lines/${encodeURIComponent(firstOrderLineId)}`);
  if (
    firstOrderLineDetail.orderLine?.id !== firstOrderLineId ||
    !firstOrderLineDetail.originalOrder?.orderId ||
    !firstOrderLineDetail.priceSnapshot?.orderLineId ||
    !Array.isArray(firstOrderLineDetail.fulfillment)
  ) {
    throw new Error("/api/order-lines/{id} did not return a normalized order-pool detail payload");
  }

  const noPermissionContext = await getJson(baseUrl, "/api/permissions/effective", {
    headers: { "x-erp-action-permissions": "none" },
  });
  if (noPermissionContext.actionPermissions?.length !== 0) {
    throw new Error("/api/permissions/effective did not honor the action-permission override header");
  }

  const anonymousMe = await getJson(baseUrl, "/api/auth/me", { expectedStatus: 401 });
  if (anonymousMe.code !== "AUTH_SESSION_REQUIRED") {
    throw new Error("/api/auth/me did not require a signed seed session token");
  }

  const failedLogin = await postJson(
    baseUrl,
    "/api/auth/login",
    { loginName: "finance.a", password: "wrong-password" },
    { expectedStatus: 401 },
  );
  if (failedLogin.code !== "AUTHENTICATION_FAILED") {
    throw new Error("/api/auth/login did not reject an invalid seed password");
  }

  const financeLogin = await postJson(baseUrl, "/api/auth/login", {
    loginName: "finance.a",
    password: "finance123",
  });
  if (
    financeLogin.session?.tokenType !== "Bearer" ||
    !financeLogin.session?.accessToken?.startsWith("seed-session.") ||
    financeLogin.permissions?.user?.userId !== "U-FINANCE-A"
  ) {
    throw new Error("/api/auth/login returned an unexpected seed session payload");
  }

  const prototypeLogin = await postJson(baseUrl, "/api/auth/prototype-login", { userId: "U-FINANCE-A" });
  if (
    prototypeLogin.session?.tokenType !== "Bearer" ||
    !prototypeLogin.session?.accessToken?.startsWith("seed-session.") ||
    prototypeLogin.permissions?.user?.userId !== "U-FINANCE-A"
  ) {
    throw new Error("/api/auth/prototype-login returned an unexpected local prototype session payload");
  }

  const financeMe = await getJson(baseUrl, "/api/auth/me", {
    headers: { authorization: `Bearer ${financeLogin.session.accessToken}` },
  });
  if (
    financeMe.authenticated !== true ||
    financeMe.session?.userId !== "U-FINANCE-A" ||
    !financeMe.permissions?.actionPermissions?.includes("statement.payment.record")
  ) {
    throw new Error("/api/auth/me did not return the logged-in finance seed context");
  }

  const logout = await postJson(
    baseUrl,
    "/api/auth/logout",
    {},
    { headers: { authorization: `Bearer ${financeLogin.session.accessToken}` } },
  );
  if (logout.loggedOut !== true || logout.sessionUserId !== "U-FINANCE-A" || logout.tokenRevoked !== true) {
    throw new Error("/api/auth/logout returned an unexpected payload");
  }
  const financeMeAfterLogout = await getJson(baseUrl, "/api/auth/me", {
    headers: { authorization: `Bearer ${financeLogin.session.accessToken}` },
    expectedStatus: 401,
  });
  if (financeMeAfterLogout.code !== "AUTH_TOKEN_REVOKED") {
    throw new Error("/api/auth/logout did not revoke the current seed session token");
  }

  const warehouseContext = await getJson(baseUrl, "/api/permissions/effective", {
    headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
  });
  if (
    warehouseContext.user?.userId !== "U-WAREHOUSE-A" ||
    !warehouseContext.roles?.includes("warehouse") ||
    !warehouseContext.actionPermissions?.includes("inventory.correction.create") ||
    !warehouseContext.actionPermissions?.includes("fulfillment.print") ||
    warehouseContext.actionPermissions?.includes("fulfillment.dispatch.update") ||
    warehouseContext.actionPermissions?.includes("statement.payment.record")
  ) {
    throw new Error("/api/permissions/effective did not return the expected warehouse seed permissions");
  }

  const financeContext = await getJson(baseUrl, "/api/permissions/effective", {
    headers: { "x-erp-user-id": "U-FINANCE-A" },
  });
  if (
    financeContext.user?.userId !== "U-FINANCE-A" ||
    !financeContext.actionPermissions?.includes("statement.payment.record") ||
    financeContext.actionPermissions?.includes("order.draft.recognize")
  ) {
    throw new Error("/api/permissions/effective did not return the expected finance seed permissions");
  }

  const unknownContext = await getJson(baseUrl, "/api/permissions/effective", {
    headers: { "x-erp-user-id": "U-UNKNOWN" },
  });
  if (unknownContext.user?.enabled !== false || unknownContext.actionPermissions?.length !== 0) {
    throw new Error("/api/permissions/effective did not return an empty disabled context for an unknown user");
  }

  const inventoryBeforeList = await getJson(baseUrl, "/api/inventory/items?pageSize=1");
  const inventoryBefore = inventoryBeforeList.items?.[0];
  if (!inventoryBefore?.id || typeof inventoryBefore.inStock !== "number") {
    throw new Error("/api/inventory/items did not return a usable inventory item for correction checks");
  }

  const deniedFinanceCorrection = await postJson(
    baseUrl,
    "/api/inventory/correction-drafts",
    {
      inventoryItemId: inventoryBefore.id,
      expectedQty: inventoryBefore.inStock,
      actualQty: inventoryBefore.inStock + 5,
      reason: "cycle_count",
      operatorId: "U-FINANCE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-FINANCE-A" },
    },
  );
  if (
    deniedFinanceCorrection.code !== "PERMISSION_DENIED" ||
    deniedFinanceCorrection.requiredPermission !== "inventory.correction.create"
  ) {
    throw new Error("/api/inventory/correction-drafts did not deny the finance seed user");
  }

  const correctionDraft = await postJson(
    baseUrl,
    "/api/inventory/correction-drafts",
    {
      inventoryItemId: inventoryBefore.id,
      expectedQty: inventoryBefore.inStock,
      actualQty: inventoryBefore.inStock + 5,
      reason: "cycle_count",
      operatorId: "U-WAREHOUSE-A",
      remark: "API skeleton check",
    },
    {
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    !correctionDraft.correctionDraftId ||
    correctionDraft.inventoryItemId !== inventoryBefore.id ||
    correctionDraft.status !== "待确认生效" ||
    correctionDraft.qtyBefore?.onHand !== inventoryBefore.inStock ||
    correctionDraft.requestedQtyAfter?.onHand !== inventoryBefore.inStock + 5 ||
    !correctionDraft.todoId ||
    !correctionDraft.operationLogId
  ) {
    throw new Error("/api/inventory/correction-drafts returned an unexpected correction draft payload");
  }

  const inventoryAfterDraftList = await getJson(baseUrl, `/api/inventory/items?keyword=${encodeURIComponent(inventoryBefore.id)}&pageSize=1`);
  if (inventoryAfterDraftList.items?.[0]?.inStock !== inventoryBefore.inStock) {
    throw new Error("/api/inventory/correction-drafts changed inventory before confirmation");
  }

  const correctionDraftQueueBeforeConfirm = await getJson(
    baseUrl,
    `/api/inventory/correction-drafts?status=${encodeURIComponent("待确认生效")}&keyword=${encodeURIComponent(
      correctionDraft.correctionDraftId,
    )}&pageSize=5`,
  );
  if (
    correctionDraftQueueBeforeConfirm.total !== 1 ||
    correctionDraftQueueBeforeConfirm.items?.[0]?.correctionDraftId !== correctionDraft.correctionDraftId ||
    correctionDraftQueueBeforeConfirm.items?.[0]?.status !== "待确认生效" ||
    correctionDraftQueueBeforeConfirm.items?.[0]?.todoId !== correctionDraft.todoId
  ) {
    throw new Error("/api/inventory/correction-drafts list did not return the open correction draft");
  }

  const correctionDraftDetailBeforeConfirm = await getJson(
    baseUrl,
    `/api/inventory/correction-drafts/${correctionDraft.correctionDraftId}`,
  );
  if (
    correctionDraftDetailBeforeConfirm.correctionDraftId !== correctionDraft.correctionDraftId ||
    correctionDraftDetailBeforeConfirm.status !== "待确认生效" ||
    correctionDraftDetailBeforeConfirm.qtyBefore?.onHand !== inventoryBefore.inStock ||
    correctionDraftDetailBeforeConfirm.requestedQtyAfter?.onHand !== inventoryBefore.inStock + 5 ||
    correctionDraftDetailBeforeConfirm.ledger !== null ||
    !correctionDraftDetailBeforeConfirm.operationLogs?.some((log) => log.action === "create_inventory_correction_draft")
  ) {
    throw new Error("/api/inventory/correction-drafts/{id} did not return the open correction detail");
  }

  const deniedWarehouseCorrectionConfirm = await postJson(
    baseUrl,
    `/api/inventory/correction-drafts/${correctionDraft.correctionDraftId}/confirm`,
    {
      correctionDraftId: correctionDraft.correctionDraftId,
      approvalReason: "API skeleton denied confirm check",
      operatorId: "U-WAREHOUSE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehouseCorrectionConfirm.code !== "PERMISSION_DENIED" ||
    deniedWarehouseCorrectionConfirm.requiredPermission !== "inventory.correction.confirm"
  ) {
    throw new Error("/api/inventory/correction-drafts/{id}/confirm did not deny the warehouse seed user");
  }

  const correctionConfirm = await postJson(
    baseUrl,
    `/api/inventory/correction-drafts/${correctionDraft.correctionDraftId}/confirm`,
    {
      correctionDraftId: correctionDraft.correctionDraftId,
      approvalReason: "API skeleton check confirm",
      operatorId: "U-MANAGER-A",
    },
    {
      headers: { "x-erp-user-id": "U-MANAGER-A" },
    },
  );
  if (
    correctionConfirm.qtyBefore?.onHand !== inventoryBefore.inStock ||
    correctionConfirm.qtyAfter?.onHand !== inventoryBefore.inStock + 5 ||
    correctionConfirm.ledger?.changeType !== "correction" ||
    correctionConfirm.ledger?.qtyChange !== 5 ||
    !correctionConfirm.operationLogId
  ) {
    throw new Error("/api/inventory/correction-drafts/{id}/confirm returned an unexpected payload");
  }

  const inventoryAfterConfirmList = await getJson(baseUrl, `/api/inventory/items?keyword=${encodeURIComponent(inventoryBefore.id)}&pageSize=1`);
  if (inventoryAfterConfirmList.items?.[0]?.inStock !== inventoryBefore.inStock + 5) {
    throw new Error("/api/inventory/correction-drafts/{id}/confirm did not update inventory on confirmation");
  }

  const correctionDraftQueueAfterConfirm = await getJson(
    baseUrl,
    `/api/inventory/correction-drafts?status=${encodeURIComponent("待确认生效")}&keyword=${encodeURIComponent(
      correctionDraft.correctionDraftId,
    )}&pageSize=5`,
  );
  if (correctionDraftQueueAfterConfirm.total !== 0) {
    throw new Error("/api/inventory/correction-drafts list did not remove confirmed correction draft from open queue");
  }

  const handledCorrectionTodos = await getJson(
    baseUrl,
    `/api/todos?status=handled&type=${encodeURIComponent("库存修正待确认")}&keyword=${encodeURIComponent(correctionDraft.correctionDraftId)}`,
  );
  if (
    handledCorrectionTodos.total !== 1 ||
    handledCorrectionTodos.items?.[0]?.todoId !== correctionDraft.todoId ||
    !handledCorrectionTodos.items?.[0]?.handledAt
  ) {
    throw new Error("/api/inventory/correction-drafts/{id}/confirm did not mark the related todo as handled");
  }

  const correctionDraftDetailAfterConfirm = await getJson(
    baseUrl,
    `/api/inventory/correction-drafts/${correctionDraft.correctionDraftId}`,
  );
  if (
    correctionDraftDetailAfterConfirm.status !== "已确认生效" ||
    correctionDraftDetailAfterConfirm.ledger?.ledgerId !== correctionConfirm.ledger?.ledgerId ||
    correctionDraftDetailAfterConfirm.ledger?.sourceType !== "inventory_correction" ||
    correctionDraftDetailAfterConfirm.ledger?.sourceId !== correctionDraft.correctionDraftId ||
    correctionDraftDetailAfterConfirm.operationLogs?.length < 2 ||
    !correctionDraftDetailAfterConfirm.operationLogs.some((log) => log.action === "confirm_inventory_correction_draft")
  ) {
    throw new Error("/api/inventory/correction-drafts/{id} did not return the confirmed correction detail");
  }
  const correctionLedgerList = await getJson(
    baseUrl,
    `/api/inventory/ledger-entries?inventoryItemId=${encodeURIComponent(
      inventoryBefore.id,
    )}&changeType=correction&sourceType=inventory_correction&pageSize=5`,
  );
  if (
    correctionLedgerList.total < 1 ||
    correctionLedgerList.items?.[0]?.ledgerId !== correctionConfirm.ledger?.ledgerId ||
    correctionLedgerList.items?.[0]?.sourceId !== correctionDraft.correctionDraftId ||
    correctionLedgerList.items?.[0]?.qtyChange !== 5 ||
    correctionLedgerList.items?.[0]?.colorName !== inventoryBefore.color
  ) {
    throw new Error("/api/inventory/ledger-entries did not return the confirmed inventory correction ledger");
  }

  const deniedRecognition = await postJson(
    baseUrl,
    "/api/order-drafts/recognize",
    {
      sourceText: "王五包装 30*38红10个 明天自提",
      operatorId: "U-OFFICE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-action-permissions": "none" },
    },
  );
  if (
    deniedRecognition.code !== "PERMISSION_DENIED" ||
    deniedRecognition.requiredPermission !== "order.draft.recognize"
  ) {
    throw new Error("/api/order-drafts/recognize did not return the expected permission denial");
  }

  const deniedFinanceRecognition = await postJson(
    baseUrl,
    "/api/order-drafts/recognize",
    {
      sourceText: "王五包装 30*38红10个 明天自提",
      operatorId: "U-FINANCE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-FINANCE-A" },
    },
  );
  if (
    deniedFinanceRecognition.code !== "PERMISSION_DENIED" ||
    deniedFinanceRecognition.requiredPermission !== "order.draft.recognize"
  ) {
    throw new Error("/api/order-drafts/recognize did not deny the finance seed user");
  }

  const recognition = await postJson(baseUrl, "/api/order-drafts/recognize", {
    sourceText: "王五包装 30*38红10个 明天自提",
    operatorId: "U-OFFICE-A",
  });
  if (!recognition.draft?.draftId || recognition.lines?.length < 1) {
    throw new Error("/api/order-drafts/recognize returned an unexpected payload");
  }
  if (recognition.lines[0]?.customerId !== "C003" || recognition.lines[0]?.customerName !== "王五包装") {
    throw new Error("/api/order-drafts/recognize did not return line-level customer fields");
  }

  const draftLineInput = {
    draftLineId: "API-DRAFT-LINE-1",
    customerId: "C003",
    customer: "王五包装",
    productName: "空白袋",
    orderType: "stock",
    size: "30*38*10",
    bagColor: "红色",
    handleType: "普通提",
    style: "空白袋",
    qty: 10,
    fulfillmentMethod: "自提",
    latestNeededAt: "明天",
    printFlag: false,
  };

  const savedDraft = await patchJson(baseUrl, `/api/order-drafts/${recognition.draft.draftId}`, {
    draftId: recognition.draft.draftId,
    sourceText: "王五包装 30*38红10个 明天自提",
    customerId: "C003",
    operatorId: "U-OFFICE-A",
    clientRevision: recognition.draft.clientRevision,
    draftStatus: "待补充信息",
    saveReason: "API skeleton check",
    lines: [draftLineInput],
  });
  if (
    savedDraft.draft?.status !== "待补充信息" ||
    savedDraft.draft?.clientRevision !== recognition.draft.clientRevision + 1 ||
    savedDraft.todos?.[0]?.type !== "订单草稿待确认" ||
    !savedDraft.operationLogId
  ) {
    throw new Error("/api/order-drafts/{draftId} did not save draft state, todo, and operation log");
  }

  const confirm = await postJson(baseUrl, `/api/order-drafts/${recognition.draft.draftId}/confirm`, {
    draftId: recognition.draft.draftId,
    sourceText: "王五包装 30*38红10个 明天自提",
    customerId: "C003",
    operatorId: "U-OFFICE-A",
    confirmMode: "confirm_now",
    clientRevision: savedDraft.draft.clientRevision,
    lines: [draftLineInput],
  });
  if (!confirm.orderId || confirm.orderLines?.length !== 1 || confirm.fulfillmentTasks?.length !== 1) {
    throw new Error("/api/order-drafts/{draftId}/confirm returned an unexpected payload");
  }
  if (
    !confirm.priceSnapshots?.[0]?.priceVersion ||
    confirm.inventoryChecks?.[0]?.requestedQty !== 10 ||
    confirm.reservations?.[0]?.status !== "active" ||
    !confirm.fulfillmentTasks?.[0]?.fulfillmentId
  ) {
    throw new Error("/api/order-drafts/{draftId}/confirm did not return the expected OpenAPI-shaped summaries");
  }
  const confirmedOrderProjection = await getJson(
    baseUrl,
    `/api/order-lines?keyword=${encodeURIComponent(confirm.orderLines[0].id)}&pageSize=5`,
  );
  const confirmedFulfillmentProjection = await getJson(
    baseUrl,
    `/api/fulfillments?keyword=${encodeURIComponent(confirm.fulfillmentTasks[0].fulfillmentId)}&pageSize=5`,
  );
  if (
    !confirmedOrderProjection.items?.some((item) => item.id === confirm.orderLines[0].id) ||
    !confirmedFulfillmentProjection.items?.some(
      (item) =>
        item.fulfillmentId === confirm.fulfillmentTasks[0].fulfillmentId &&
        item.orderLineId === confirm.orderLines[0].id &&
        item.customerId === "C003",
    )
  ) {
    throw new Error("order confirmation did not expose server order and fulfillment projections for client refresh");
  }
  const releasedReservation = await postJson(
    baseUrl,
    `/api/inventory/reservations/${confirm.reservations[0].reservationId}/release`,
    {
      releaseQty: 4,
      reason: "manual_release",
      operatorId: "U-OFFICE-A",
      relatedActionId: confirm.orderLines[0].id,
    },
  );
  if (
    releasedReservation.status !== "partially_released" ||
    releasedReservation.qty !== 6 ||
    releasedReservation.releasedQty !== 4 ||
    !releasedReservation.ledgerId ||
    !releasedReservation.operationLogId
  ) {
    throw new Error("/api/inventory/reservations/{reservationId}/release returned an unexpected payload");
  }
  const releaseLedgerList = await getJson(
    baseUrl,
    `/api/inventory/ledger-entries?sourceId=${encodeURIComponent(confirm.orderLines[0].id)}&sourceType=inventory_reservation_release&pageSize=5`,
  );
  if (
    releaseLedgerList.total < 1 ||
    releaseLedgerList.items?.[0]?.ledgerId !== releasedReservation.ledgerId ||
    releaseLedgerList.items?.[0]?.changeType !== "释放占用" ||
    releaseLedgerList.items?.[0]?.qtyChange !== -4
  ) {
    throw new Error("/api/inventory/ledger-entries did not return the inventory reservation release ledger");
  }
  const voidedOrderLine = await postJson(baseUrl, `/api/order-lines/${confirm.orderLines[0].id}/void`, {
    orderLineId: confirm.orderLines[0].id,
    reason: "order_cancelled",
    operatorId: "U-OFFICE-A",
  });
  if (
    voidedOrderLine.status !== "已关闭" ||
    voidedOrderLine.releasedReservations?.[0]?.status !== "released" ||
    voidedOrderLine.releasedReservations?.[0]?.qty !== 0 ||
    !voidedOrderLine.canceledFulfillmentIds?.includes(confirm.fulfillmentTasks[0].fulfillmentId) ||
    voidedOrderLine.inventoryLedgerIds?.length !== 1 ||
    !voidedOrderLine.orderLineChangeRecordId ||
    !voidedOrderLine.operationLogId
  ) {
    throw new Error("/api/order-lines/{orderLineId}/void did not close the line, release remaining reservation, and cancel fulfillment");
  }

  const qtyRecognition = await postJson(baseUrl, "/api/order-drafts/recognize", {
    sourceText: "王五包装 30*38红10个 明天自提",
    operatorId: "U-OFFICE-A",
  });
  if (!qtyRecognition.draft?.draftId) {
    throw new Error("/api/order-drafts/recognize did not return a draft for quantity adjustment checks");
  }
  const qtyDraftLineInput = {
    ...draftLineInput,
    draftLineId: "API-DRAFT-LINE-QTY",
    qty: 10,
  };
  const qtyConfirm = await postJson(baseUrl, `/api/order-drafts/${qtyRecognition.draft.draftId}/confirm`, {
    draftId: qtyRecognition.draft.draftId,
    sourceText: "王五包装 30*38红10个 明天自提",
    customerId: "C003",
    operatorId: "U-OFFICE-A",
    confirmMode: "confirm_now",
    clientRevision: qtyRecognition.draft.clientRevision,
    lines: [qtyDraftLineInput],
  });
  const qtyOrderLineId = qtyConfirm.orderLines?.[0]?.id;
  if (!qtyOrderLineId || qtyConfirm.reservations?.[0]?.qty !== 10) {
    throw new Error("/api/order-drafts/{draftId}/confirm did not create a usable line for quantity adjustment checks");
  }
  const deniedWarehouseQuantityAdjustment = await postJson(
    baseUrl,
    `/api/order-lines/${qtyOrderLineId}/quantity-adjustment`,
    {
      orderLineId: qtyOrderLineId,
      newQty: 6,
      reason: "customer_change",
      operatorId: "U-WAREHOUSE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehouseQuantityAdjustment.code !== "PERMISSION_DENIED" ||
    deniedWarehouseQuantityAdjustment.requiredPermission !== "order.quantity.adjust"
  ) {
    throw new Error("/api/order-lines/{orderLineId}/quantity-adjustment did not deny the warehouse seed user");
  }
  const decreasedOrderLine = await postJson(baseUrl, `/api/order-lines/${qtyOrderLineId}/quantity-adjustment`, {
    orderLineId: qtyOrderLineId,
    newQty: 6,
    reason: "customer_change",
    operatorId: "U-OFFICE-A",
  });
  if (
    decreasedOrderLine.previousQty !== 10 ||
    decreasedOrderLine.newQty !== 6 ||
    decreasedOrderLine.qtyDelta !== -4 ||
    decreasedOrderLine.priceSnapshot?.chargeableQty !== 6 ||
    decreasedOrderLine.priceSnapshot?.finalAmount !== 2.04 ||
    decreasedOrderLine.finalAmount !== 2.04 ||
    decreasedOrderLine.adjustedReservations?.[0]?.qty !== 6 ||
    decreasedOrderLine.adjustedReservations?.[0]?.status !== "active" ||
    !decreasedOrderLine.adjustedFulfillmentIds?.includes(qtyConfirm.fulfillmentTasks?.[0]?.fulfillmentId) ||
    decreasedOrderLine.inventoryLedgerIds?.length !== 1 ||
    !decreasedOrderLine.orderLineChangeRecordId ||
    !decreasedOrderLine.operationLogId
  ) {
    throw new Error("/api/order-lines/{orderLineId}/quantity-adjustment did not decrease quantity and release reservation");
  }
  const increasedOrderLine = await postJson(baseUrl, `/api/order-lines/${qtyOrderLineId}/quantity-adjustment`, {
    orderLineId: qtyOrderLineId,
    newQty: 8,
    reason: "customer_change",
    operatorId: "U-OFFICE-A",
  });
  if (
    increasedOrderLine.previousQty !== 6 ||
    increasedOrderLine.newQty !== 8 ||
    increasedOrderLine.qtyDelta !== 2 ||
    increasedOrderLine.priceSnapshot?.chargeableQty !== 8 ||
    increasedOrderLine.priceSnapshot?.finalAmount !== 2.72 ||
    increasedOrderLine.finalAmount !== 2.72 ||
    increasedOrderLine.adjustedReservations?.[0]?.qty !== 8 ||
    increasedOrderLine.adjustedReservations?.[0]?.status !== "active" ||
    increasedOrderLine.inventoryLedgerIds?.length !== 1 ||
    !increasedOrderLine.orderLineChangeRecordId ||
    !increasedOrderLine.operationLogId
  ) {
    throw new Error("/api/order-lines/{orderLineId}/quantity-adjustment did not increase quantity and add reservation");
  }
  const deniedWarehouseFulfillmentCancel = await postJson(
    baseUrl,
    `/api/fulfillments/${qtyConfirm.fulfillmentTasks[0].fulfillmentId}/cancel`,
    {
      fulfillmentId: qtyConfirm.fulfillmentTasks[0].fulfillmentId,
      reason: "office_correction",
      operatorId: "U-WAREHOUSE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehouseFulfillmentCancel.code !== "PERMISSION_DENIED" ||
    deniedWarehouseFulfillmentCancel.requiredPermission !== "fulfillment.cancel"
  ) {
    throw new Error("/api/fulfillments/{fulfillmentId}/cancel did not deny the warehouse seed user");
  }
  const cancelledFulfillment = await postJson(baseUrl, `/api/fulfillments/${qtyConfirm.fulfillmentTasks[0].fulfillmentId}/cancel`, {
    fulfillmentId: qtyConfirm.fulfillmentTasks[0].fulfillmentId,
    reason: "office_correction",
    operatorId: "U-OFFICE-A",
  });
  if (
    cancelledFulfillment.status !== "已取消" ||
    cancelledFulfillment.orderLineId !== qtyOrderLineId ||
    cancelledFulfillment.releasedReservations?.[0]?.qty !== 0 ||
    cancelledFulfillment.releasedReservations?.[0]?.status !== "released" ||
    cancelledFulfillment.inventoryLedgerIds?.length !== 1 ||
    !cancelledFulfillment.operationLogId
  ) {
    throw new Error("/api/fulfillments/{fulfillmentId}/cancel did not cancel fulfillment and release active reservation");
  }

  const productionInventoryItemId = "30*38*10-白色-普通提-空白袋-待快运区";
  const productionInventoryBefore = await getJson(
    baseUrl,
    `/api/inventory/items?keyword=${encodeURIComponent(productionInventoryItemId)}&pageSize=1`,
  );
  const productionInventoryBeforeItem = productionInventoryBefore.items?.[0];
  if (
    productionInventoryBeforeItem?.id !== productionInventoryItemId ||
    typeof productionInventoryBeforeItem.inStock !== "number" ||
    typeof productionInventoryBeforeItem.reserved !== "number"
  ) {
    throw new Error("/api/inventory/items did not return the production inventory item for production report checks");
  }
  const scheduleProductionTaskId = "PT-ORD-0629-016-01";
  const scheduleOrderLineId = "ORD-0629-016-01";
  const deniedWarehouseSchedulePublish = await postJson(
    baseUrl,
    `/api/production-tasks/${scheduleProductionTaskId}/publish-schedule`,
    {
      orderLineId: scheduleOrderLineId,
      plannedQty: 1800,
      machineId: "BAG-01",
      operatorId: "U-WAREHOUSE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehouseSchedulePublish.code !== "PERMISSION_DENIED" ||
    deniedWarehouseSchedulePublish.requiredPermission !== "production.schedule.publish"
  ) {
    throw new Error("/api/production-tasks/{id}/publish-schedule did not deny the warehouse seed user");
  }
  const workshopVisibleBeforeSchedulePublish = await getJson(
    baseUrl,
    `/api/production-tasks?visibility=${encodeURIComponent("workshop_mobile")}&machineId=${encodeURIComponent("BAG-01")}&status=${encodeURIComponent("open")}&pageSize=20`,
    { headers: { "x-erp-user-id": "U-WORKSHOP-A" } },
  );
  if (workshopVisibleBeforeSchedulePublish.items?.some((item) => item.productionTaskId === scheduleProductionTaskId)) {
    throw new Error("/api/production-tasks workshop_mobile visibility exposed an unpublished scheduled task");
  }
  const machineQueueBeforeSchedulePublish = await getJson(
    baseUrl,
    `/api/production-schedules/machine-queue?machineId=${encodeURIComponent("BAG-01")}&status=${encodeURIComponent("open")}`,
    { headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  if (machineQueueBeforeSchedulePublish.items?.some((item) => item.productionTaskId === scheduleProductionTaskId)) {
    throw new Error("/api/production-schedules/machine-queue exposed an unpublished scheduled task");
  }
  const schedulePublish = await postJson(baseUrl, `/api/production-tasks/${scheduleProductionTaskId}/publish-schedule`, {
    orderLineId: scheduleOrderLineId,
    plannedQty: 1800,
    machineId: "BAG-01",
    processType: "制袋",
    operatorId: "U-OFFICE-A",
    publishedAt: new Date().toISOString(),
    remark: "API skeleton schedule publish check",
  });
  if (
    schedulePublish.productionTaskId !== scheduleProductionTaskId ||
    schedulePublish.orderLineId !== scheduleOrderLineId ||
    schedulePublish.status !== "制袋已排产" ||
    schedulePublish.orderLineStatus !== "制袋已排产" ||
    schedulePublish.machineId !== "BAG-01" ||
    !schedulePublish.publishedScheduleId ||
    schedulePublish.inventoryCreated !== false ||
    schedulePublish.reservationCreated !== false ||
    schedulePublish.packingTaskCreated !== false ||
    !schedulePublish.operationLogId
  ) {
    throw new Error("/api/production-tasks/{id}/publish-schedule returned an unexpected payload");
  }
  const workshopVisibleAfterSchedulePublish = await getJson(
    baseUrl,
    `/api/production-tasks?visibility=${encodeURIComponent("workshop_mobile")}&machineId=${encodeURIComponent("BAG-01")}&status=${encodeURIComponent("open")}&pageSize=20`,
    { headers: { "x-erp-user-id": "U-WORKSHOP-A" } },
  );
  if (
    !workshopVisibleAfterSchedulePublish.items?.some(
      (item) =>
        item.productionTaskId === scheduleProductionTaskId &&
        item.productionTask?.publishedScheduleId === schedulePublish.publishedScheduleId &&
        item.productionTask?.machineId === "BAG-01",
    )
  ) {
    throw new Error("/api/production-tasks workshop_mobile visibility did not expose the published schedule task");
  }
  const machineQueueAfterSchedulePublish = await getJson(
    baseUrl,
    `/api/production-schedules/machine-queue?machineId=${encodeURIComponent("BAG-01")}&status=${encodeURIComponent("open")}`,
    { headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  const scheduledQueueItem = machineQueueAfterSchedulePublish.items?.find(
    (item) =>
      item.productionTaskId === scheduleProductionTaskId &&
      item.publishedScheduleId === schedulePublish.publishedScheduleId &&
      item.machineId === "BAG-01",
  );
  if (
    !scheduledQueueItem ||
    scheduledQueueItem.queueSeq < 1 ||
    scheduledQueueItem.queueReason !== "已发布排产" ||
    scheduledQueueItem.plannedQty !== 1800 ||
    !machineQueueAfterSchedulePublish.machines?.some((item) => item.machineId === "BAG-01" && item.total >= 1)
  ) {
    throw new Error("/api/production-schedules/machine-queue did not expose the published schedule task");
  }
  const deniedWarehouseQueueResequence = await postJson(
    baseUrl,
    "/api/production-schedules/machine-queue/resequence",
    {
      machineId: "BAG-01",
      orderedProductionTaskIds: machineQueueAfterSchedulePublish.items
        ?.filter((item) => item.machineId === "BAG-01")
        .map((item) => item.productionTaskId) ?? [],
      operatorId: "U-WAREHOUSE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehouseQueueResequence.code !== "PERMISSION_DENIED" ||
    deniedWarehouseQueueResequence.requiredPermission !== "production.schedule.sequence.update"
  ) {
    throw new Error("/api/production-schedules/machine-queue/resequence did not deny the warehouse seed user");
  }
  const bag01QueueOrder = machineQueueAfterSchedulePublish.items
    ?.filter((item) => item.machineId === "BAG-01")
    .map((item) => item.productionTaskId) ?? [];
  if (bag01QueueOrder.length < 2) {
    throw new Error("/api/production-schedules/machine-queue did not have enough BAG-01 tasks for resequence coverage");
  }
  const reversedBag01QueueOrder = [...bag01QueueOrder].reverse();
  const resequencedQueue = await postJson(
    baseUrl,
    "/api/production-schedules/machine-queue/resequence",
    {
      machineId: "BAG-01",
      orderedProductionTaskIds: reversedBag01QueueOrder,
      operatorId: "U-OFFICE-A",
      remark: "API skeleton queue resequence check",
    },
    { headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  const resequencedBag01Items = resequencedQueue.items?.filter((item) => item.machineId === "BAG-01") ?? [];
  if (
    resequencedQueue.machineId !== "BAG-01" ||
    resequencedQueue.updatedCount !== reversedBag01QueueOrder.length ||
    resequencedQueue.inventoryCreated !== false ||
    resequencedQueue.reservationCreated !== false ||
    resequencedQueue.packingTaskCreated !== false ||
    !resequencedQueue.operationLogId ||
    resequencedQueue.productionScheduleRecords?.length !== reversedBag01QueueOrder.length ||
    resequencedQueue.productionScheduleRecords?.some(
      (record, index) =>
        record.productionTaskId !== reversedBag01QueueOrder[index] ||
        record.queueSeq !== index + 1 ||
        record.sequenceUpdatedBy !== "U-OFFICE-A" ||
        record.sourceKind !== "manual_resequence",
    ) ||
    resequencedBag01Items.map((item) => item.productionTaskId).join("|") !== reversedBag01QueueOrder.join("|") ||
    resequencedBag01Items.some((item, index) => item.queueSeq !== index + 1 || item.sequenceUpdatedBy !== "U-OFFICE-A")
  ) {
    throw new Error("/api/production-schedules/machine-queue/resequence returned an unexpected payload");
  }
  const machineQueueAfterResequence = await getJson(
    baseUrl,
    `/api/production-schedules/machine-queue?machineId=${encodeURIComponent("BAG-01")}&status=${encodeURIComponent("open")}`,
    { headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  if (
    machineQueueAfterResequence.items?.filter((item) => item.machineId === "BAG-01").map((item) => item.productionTaskId).join("|") !==
    reversedBag01QueueOrder.join("|")
  ) {
    throw new Error("/api/production-schedules/machine-queue did not preserve the resequenced order");
  }
  const deniedWarehouseQueueMove = await postJson(
    baseUrl,
    "/api/production-schedules/machine-queue/move",
    {
      productionTaskId: reversedBag01QueueOrder[0],
      targetMachineId: "BAG-02",
      targetQueueSeq: 1,
      operatorId: "U-WAREHOUSE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehouseQueueMove.code !== "PERMISSION_DENIED" ||
    deniedWarehouseQueueMove.requiredPermission !== "production.schedule.sequence.update"
  ) {
    throw new Error("/api/production-schedules/machine-queue/move did not deny the warehouse seed user");
  }
  const movedProductionTaskId = reversedBag01QueueOrder[0];
  const movedQueue = await postJson(
    baseUrl,
    "/api/production-schedules/machine-queue/move",
    {
      productionTaskId: movedProductionTaskId,
      targetMachineId: "BAG-02",
      targetQueueSeq: 1,
      operatorId: "U-OFFICE-A",
      remark: "API skeleton machine move check",
    },
    { headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  const movedTargetItem = movedQueue.items?.find((item) => item.productionTaskId === movedProductionTaskId);
  if (
    movedQueue.productionTaskId !== movedProductionTaskId ||
    movedQueue.sourceMachineId !== "BAG-01" ||
    movedQueue.targetMachineId !== "BAG-02" ||
    movedQueue.targetQueueSeq !== 1 ||
    movedQueue.inventoryCreated !== false ||
    movedQueue.reservationCreated !== false ||
    movedQueue.packingTaskCreated !== false ||
    !movedQueue.operationLogId ||
    movedQueue.productionTask?.machineId !== "BAG-02" ||
    !movedQueue.productionScheduleRecords?.some(
      (record) => record.productionTaskId === movedProductionTaskId && record.machineId === "BAG-01" && record.status === "moved",
    ) ||
    !movedQueue.productionScheduleRecords?.some(
      (record) =>
        record.productionTaskId === movedProductionTaskId &&
        record.machineId === "BAG-02" &&
        record.status === "active" &&
        record.queueSeq === 1 &&
        record.sourceKind === "machine_reassignment",
    ) ||
    movedTargetItem?.machineId !== "BAG-02" ||
    movedTargetItem?.queueSeq !== 1 ||
    movedTargetItem?.sequenceUpdatedBy !== "U-OFFICE-A"
  ) {
    throw new Error("/api/production-schedules/machine-queue/move returned an unexpected payload");
  }
  const machineQueueAfterMoveSource = await getJson(
    baseUrl,
    `/api/production-schedules/machine-queue?machineId=${encodeURIComponent("BAG-01")}&status=${encodeURIComponent("open")}`,
    { headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  if (machineQueueAfterMoveSource.items?.some((item) => item.productionTaskId === movedProductionTaskId)) {
    throw new Error("/api/production-schedules/machine-queue/move did not remove the task from the source machine");
  }
  const machineQueueAfterMoveTarget = await getJson(
    baseUrl,
    `/api/production-schedules/machine-queue?machineId=${encodeURIComponent("BAG-02")}&status=${encodeURIComponent("open")}`,
    { headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  if (machineQueueAfterMoveTarget.items?.[0]?.productionTaskId !== movedProductionTaskId) {
    throw new Error("/api/production-schedules/machine-queue/move did not insert the task into the target machine");
  }
  const deniedWarehouseProductionReport = await postJson(
    baseUrl,
    "/api/production-tasks/PT-ORD-0629-003-01/report-complete",
    {
      orderLineId: "ORD-0629-003-01",
      qualifiedQty: 1000,
      machineCount: 1888,
      inventoryItemId: productionInventoryItemId,
      operatorId: "U-WAREHOUSE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehouseProductionReport.code !== "PERMISSION_DENIED" ||
    deniedWarehouseProductionReport.requiredPermission !== "production.report.complete"
  ) {
    throw new Error("/api/production-tasks/{id}/report-complete did not deny the warehouse seed user");
  }
  const deniedWarehouseDailyProgress = await postJson(
    baseUrl,
    "/api/production-tasks/PT-ORD-0629-003-01/daily-progress",
    {
      orderLineId: "ORD-0629-003-01",
      dailyQualifiedQty: 420,
      machineCount: 820,
      operatorId: "U-WAREHOUSE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehouseDailyProgress.code !== "PERMISSION_DENIED" ||
    deniedWarehouseDailyProgress.requiredPermission !== "production.report.complete"
  ) {
    throw new Error("/api/production-tasks/{id}/daily-progress did not deny the warehouse seed user");
  }
  const dailyProgress = await postJson(baseUrl, "/api/production-tasks/PT-ORD-0629-003-01/daily-progress", {
    orderLineId: "ORD-0629-003-01",
    dailyQualifiedQty: 420,
    exceptionQty: 3,
    machineCount: 820,
    machineId: "BAG-03",
    operatorId: "U-OFFICE-A",
    reportedAt: new Date().toISOString(),
    remark: "API skeleton production daily progress check",
  });
  if (
    dailyProgress.status !== "跨日继续" ||
    dailyProgress.dailyQualifiedQty !== 420 ||
    dailyProgress.cumulativeQualifiedQty !== 420 ||
    dailyProgress.remainingQty !== 580 ||
    dailyProgress.machineCount !== 820 ||
    dailyProgress.machineCountAffectsInventory !== false ||
    dailyProgress.inventoryCreated !== false ||
    dailyProgress.reservationCreated !== false ||
    dailyProgress.packingTaskCreated !== false ||
    !dailyProgress.operationLogId
  ) {
    throw new Error("/api/production-tasks/{id}/daily-progress returned an unexpected payload");
  }
  const productionInventoryAfterDailyProgress = await getJson(
    baseUrl,
    `/api/inventory/items?keyword=${encodeURIComponent(productionInventoryItemId)}&pageSize=1`,
  );
  if (
    productionInventoryAfterDailyProgress.items?.[0]?.inStock !== productionInventoryBeforeItem.inStock ||
    productionInventoryAfterDailyProgress.items?.[0]?.reserved !== productionInventoryBeforeItem.reserved
  ) {
    throw new Error("/api/production-tasks/{id}/daily-progress must not add finished goods or reserve inventory");
  }
  const deniedWarehouseFinishedPhotoUpload = await postJson(
    baseUrl,
    "/api/production-tasks/PT-ORD-0629-003-01/finished-goods-photo",
    {
      orderLineId: "ORD-0629-003-01",
      attachmentId: "ATT-FINISHED-DENIED",
      operatorId: "U-WAREHOUSE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehouseFinishedPhotoUpload.code !== "PERMISSION_DENIED" ||
    deniedWarehouseFinishedPhotoUpload.requiredPermission !== "production.report.complete"
  ) {
    throw new Error("/api/production-tasks/{id}/finished-goods-photo did not deny the warehouse seed user");
  }
  const finishedGoodsPhotoAttachment = await postJson(baseUrl, "/api/attachments", {
    ownerType: "production_task",
    ownerId: "PT-ORD-0629-003-01",
    fileType: "image",
    purpose: "finished_goods_photo",
    fileName: "finished-goods-pt-ord-0629-003-01.png",
    contentRef: "p0://production-finished-goods/PT-ORD-0629-003-01/check.png",
    mimeType: "image/png",
    fileSize: 68,
    contentDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    uploadedBy: "U-WORKSHOP-A",
    remark: "API skeleton workshop finished-goods photo attachment check",
  }, { headers: { "x-erp-user-id": "U-WORKSHOP-A" } });
  if (!finishedGoodsPhotoAttachment.attachmentId || finishedGoodsPhotoAttachment.purpose !== "finished_goods_photo") {
    throw new Error("/api/attachments did not let workshop create a finished-goods photo attachment");
  }
  const finishedGoodsPhotoUpload = await postJson(
    baseUrl,
    "/api/production-tasks/PT-ORD-0629-003-01/finished-goods-photo",
    {
      orderLineId: "ORD-0629-003-01",
      attachmentId: finishedGoodsPhotoAttachment.attachmentId,
      fileName: finishedGoodsPhotoAttachment.fileName,
      operatorId: "U-WORKSHOP-A",
      uploadedAt: new Date().toISOString(),
      remark: "API skeleton workshop finished goods photo upload check",
    },
    { headers: { "x-erp-user-id": "U-WORKSHOP-A" } },
  );
  if (
    finishedGoodsPhotoUpload.finishedGoodsPhoto?.status !== "待确认" ||
    finishedGoodsPhotoUpload.finishedGoodsPhoto?.attachmentId !== finishedGoodsPhotoAttachment.attachmentId ||
    finishedGoodsPhotoUpload.customerNotificationTodoCreated !== false ||
    finishedGoodsPhotoUpload.inventoryCreated !== false ||
    finishedGoodsPhotoUpload.reservationCreated !== false ||
    finishedGoodsPhotoUpload.packingTaskCreated !== false ||
    !finishedGoodsPhotoUpload.operationLogId
  ) {
    throw new Error("/api/production-tasks/{id}/finished-goods-photo returned an unexpected payload");
  }
  const deniedWarehouseFinishedPhotoReview = await postJson(
    baseUrl,
    "/api/production-tasks/PT-ORD-0629-003-01/finished-goods-photo-review",
    {
      orderLineId: "ORD-0629-003-01",
      reviewStatus: "已接受",
      operatorId: "U-WAREHOUSE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehouseFinishedPhotoReview.code !== "PERMISSION_DENIED" ||
    deniedWarehouseFinishedPhotoReview.requiredPermission !== "production.schedule.publish"
  ) {
    throw new Error("/api/production-tasks/{id}/finished-goods-photo-review did not deny the warehouse seed user");
  }
  const finishedGoodsPhotoReview = await postJson(
    baseUrl,
    "/api/production-tasks/PT-ORD-0629-003-01/finished-goods-photo-review",
    {
      orderLineId: "ORD-0629-003-01",
      reviewStatus: "已接受",
      reason: "API skeleton finished goods photo accepted",
      operatorId: "U-OFFICE-A",
      reviewedAt: new Date().toISOString(),
    },
    { headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  if (
    finishedGoodsPhotoReview.finishedGoodsPhoto?.status !== "已接受" ||
    finishedGoodsPhotoReview.todo?.type !== "待通知客户" ||
    finishedGoodsPhotoReview.customerNotificationTodoCreated !== true ||
    finishedGoodsPhotoReview.inventoryCreated !== false ||
    finishedGoodsPhotoReview.reservationCreated !== false ||
    finishedGoodsPhotoReview.packingTaskCreated !== false ||
    !finishedGoodsPhotoReview.operationLogId
  ) {
    throw new Error("/api/production-tasks/{id}/finished-goods-photo-review returned an unexpected payload");
  }
  const finishedGoodsNotificationTodos = await getJson(baseUrl, "/api/todos?status=open&type=待通知客户");
  const finishedGoodsNotificationTodo = finishedGoodsNotificationTodos.items?.find(
    (item) => item.type === "待通知客户" && item.refId === "ORD-0629-003-01",
  );
  if (
    finishedGoodsNotificationTodos.total < 1 ||
    !finishedGoodsNotificationTodo ||
    !finishedGoodsNotificationTodo.notificationCopyText ||
    !finishedGoodsNotificationTodo.photoPrompt
  ) {
    throw new Error("/api/production-tasks/{id}/finished-goods-photo-review did not expose the customer notification todo copy fields");
  }
  const copiedCustomerNotificationTodo = await postJson(
    baseUrl,
    `/api/todos/${encodeURIComponent(finishedGoodsNotificationTodo.todoId)}/handle`,
    {
      action: "customer_notification_copied",
      operatorId: "U-OFFICE-A",
      handlingResult: "已复制客户通知话术",
      notificationChannel: finishedGoodsNotificationTodo.notificationChannel,
      notificationContent: finishedGoodsNotificationTodo.notificationCopyText,
    },
    { headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  if (
    copiedCustomerNotificationTodo.todo?.handled !== false ||
    copiedCustomerNotificationTodo.todo?.notificationStatus !== "话术已复制" ||
    !copiedCustomerNotificationTodo.operationLogId
  ) {
    throw new Error("/api/todos/{todoId}/handle did not keep copied customer notification todo open");
  }
  const sentCustomerNotificationTodo = await postJson(
    baseUrl,
    `/api/todos/${encodeURIComponent(finishedGoodsNotificationTodo.todoId)}/handle`,
    {
      action: "customer_notification_sent",
      operatorId: "U-OFFICE-A",
      handlingResult: "已人工通知客户",
      notificationChannel: finishedGoodsNotificationTodo.notificationChannel,
      notificationContent: finishedGoodsNotificationTodo.notificationCopyText,
    },
    { headers: { "x-erp-user-id": "U-OFFICE-A" } },
  );
  if (
    sentCustomerNotificationTodo.todo?.handled !== true ||
    sentCustomerNotificationTodo.todo?.notificationStatus !== "已通知客户" ||
    !sentCustomerNotificationTodo.operationLogId
  ) {
    throw new Error("/api/todos/{todoId}/handle did not close sent customer notification todo");
  }
  const workshopVisibleProductionList = await getJson(
    baseUrl,
    `/api/production-tasks?visibility=${encodeURIComponent("workshop_mobile")}&machineId=${encodeURIComponent("BAG-03")}&status=${encodeURIComponent("open")}&pageSize=5`,
    { headers: { "x-erp-user-id": "U-WORKSHOP-A" } },
  );
  if (
    workshopVisibleProductionList.total < 1 ||
    !workshopVisibleProductionList.items?.some(
      (item) =>
        item.productionTaskId === dailyProgress.productionTaskId &&
        item.productionTask?.machineId === "BAG-03" &&
        item.dailyProgress?.carryOver === true &&
        item.dailyProgress?.remainingQty === 580,
    )
  ) {
    throw new Error("/api/production-tasks workshop_mobile visibility did not return the same-machine carry-over task");
  }
  const productionReport = await postJson(baseUrl, "/api/production-tasks/PT-ORD-0629-003-01/report-complete", {
    orderLineId: "ORD-0629-003-01",
    qualifiedQty: 1000,
    exceptionQty: 0,
    machineCount: 1888,
    machineId: "BAG-03",
    inventoryItemId: productionInventoryItemId,
    operatorId: "U-OFFICE-A",
    completedAt: new Date().toISOString(),
    remark: "API skeleton production report check",
  });
  if (
    productionReport.status !== "已完成" ||
    productionReport.orderLineStatus !== "待打包" ||
    productionReport.qualifiedQty !== 1000 ||
    productionReport.machineCount !== 1888 ||
    productionReport.machineCountAffectsInventory !== false ||
    productionReport.capacityCalibrationCreated !== true ||
    productionReport.capacityCalibration?.sourceKind !== "production_report" ||
    productionReport.capacityCalibration?.confidence !== "medium" ||
    productionReport.capacityCalibration?.dailyCapacityQty !== 1000 ||
    productionReport.inventoryItemId !== productionInventoryItemId ||
    !productionReport.reservationId ||
    !productionReport.packingTaskId ||
    productionReport.inventoryLedgerIds?.length !== 2 ||
    !productionReport.operationLogId
  ) {
    throw new Error("/api/production-tasks/{id}/report-complete returned an unexpected payload");
  }
  const productionInventoryAfterReport = await getJson(
    baseUrl,
    `/api/inventory/items?keyword=${encodeURIComponent(productionInventoryItemId)}&pageSize=1`,
  );
  if (
    productionInventoryAfterReport.items?.[0]?.inStock !== productionInventoryBeforeItem.inStock + 1000 ||
    productionInventoryAfterReport.items?.[0]?.reserved !== productionInventoryBeforeItem.reserved + 1000
  ) {
    throw new Error("/api/production-tasks/{id}/report-complete did not add finished goods and reserve them for the order line");
  }
  const productionTaskDetail = await getJson(baseUrl, `/api/production-tasks/${productionReport.productionTaskId}`);
  if (
    productionTaskDetail.productionTaskId !== productionReport.productionTaskId ||
    productionTaskDetail.latestReport?.reportId !== productionReport.reportId ||
    productionTaskDetail.latestReport?.machineCountAffectsInventory !== false ||
    productionTaskDetail.dailyProgress?.cumulativeQualifiedQty !== 420 ||
    productionTaskDetail.dailyProgress?.remainingQty !== 580 ||
    productionTaskDetail.dailyProgress?.inventoryCreated !== false ||
    productionTaskDetail.finishedGoodsPhoto?.status !== "已接受" ||
    productionTaskDetail.finishedGoodsPhoto?.attachmentId !== finishedGoodsPhotoAttachment.attachmentId ||
    productionTaskDetail.packingTask?.packingTaskId !== productionReport.packingTaskId ||
    productionTaskDetail.inventoryLedgerEntries?.length !== 2 ||
    !productionTaskDetail.operationLogs?.some((log) => log.action === "upload_finished_goods_photo") ||
    !productionTaskDetail.operationLogs?.some((log) => log.action === "accept_finished_goods_photo") ||
    !productionTaskDetail.operationLogs?.some((log) => log.action === "complete_production_report")
  ) {
    throw new Error("/api/production-tasks/{id} did not return the production report detail chain");
  }
  const productionTaskList = await getJson(
    baseUrl,
    `/api/production-tasks?status=${encodeURIComponent("已完成")}&keyword=${encodeURIComponent("美的")}&pageSize=5`,
  );
  if (
    productionTaskList.total < 1 ||
    !productionTaskList.items?.some(
      (item) =>
        item.productionTaskId === productionReport.productionTaskId &&
        item.latestReport?.machineCountAffectsInventory === false &&
        item.packingTask?.packingTaskId === productionReport.packingTaskId,
    )
  ) {
    throw new Error("/api/production-tasks did not return the production task list item after report completion");
  }
  const deniedFinancePackingComplete = await postJson(
    baseUrl,
    `/api/packing-tasks/${productionReport.packingTaskId}/complete`,
    {
      orderLineId: "ORD-0629-003-01",
      actualPackedQty: 1000,
      packageCount: 3,
      operatorId: "U-FINANCE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-FINANCE-A" },
    },
  );
  if (
    deniedFinancePackingComplete.code !== "PERMISSION_DENIED" ||
    deniedFinancePackingComplete.requiredPermission !== "packing.complete"
  ) {
    throw new Error("/api/packing-tasks/{id}/complete did not deny the finance seed user");
  }
  const packingComplete = await postJson(
    baseUrl,
    `/api/packing-tasks/${productionReport.packingTaskId}/complete`,
    {
      orderLineId: "ORD-0629-003-01",
      actualPackedQty: 1000,
      packageCount: 3,
      labelsPrinted: false,
      inventoryItemId: productionInventoryItemId,
      operatorId: "U-WAREHOUSE-A",
      completedAt: new Date().toISOString(),
      remark: "API skeleton packing complete check",
    },
    {
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    packingComplete.status !== "已完成" ||
    packingComplete.actualPackedQty !== 1000 ||
    packingComplete.packageIds?.length !== 3 ||
    packingComplete.orderLineStatus !== "待打印标签" ||
    packingComplete.inventoryDeducted !== false ||
    packingComplete.inventoryLedgerIds?.length !== 1 ||
    !packingComplete.operationLogId
  ) {
    throw new Error("/api/packing-tasks/{id}/complete returned an unexpected payload");
  }
  const productionInventoryAfterPacking = await getJson(
    baseUrl,
    `/api/inventory/items?keyword=${encodeURIComponent(productionInventoryItemId)}&pageSize=1`,
  );
  if (
    productionInventoryAfterPacking.items?.[0]?.inStock !== productionInventoryBeforeItem.inStock + 1000 ||
    productionInventoryAfterPacking.items?.[0]?.reserved !== productionInventoryBeforeItem.reserved + 1000
  ) {
    throw new Error("/api/packing-tasks/{id}/complete changed inventory even though packing completion must not deduct stock");
  }
  const packingTaskDetail = await getJson(baseUrl, `/api/packing-tasks/${packingComplete.packingTaskId}`);
  if (
    packingTaskDetail.packingTaskId !== packingComplete.packingTaskId ||
    packingTaskDetail.packingTask?.status !== "已完成" ||
    packingTaskDetail.packages?.length !== 3 ||
    packingTaskDetail.inventoryDeducted !== false ||
    packingTaskDetail.inventoryLedgerEntries?.length !== 1 ||
    !packingTaskDetail.operationLogs?.some((log) => log.action === "complete_packing_task")
  ) {
    throw new Error("/api/packing-tasks/{id} did not return the packing detail chain");
  }
  const packingTaskList = await getJson(
    baseUrl,
    `/api/packing-tasks?status=${encodeURIComponent("已完成")}&keyword=${encodeURIComponent("美的")}&pageSize=5`,
  );
  if (
    packingTaskList.total < 1 ||
    !packingTaskList.items?.some(
      (item) =>
        item.packingTaskId === packingComplete.packingTaskId &&
        item.packingTask?.packageCount === 3 &&
        item.inventoryDeducted === false,
    )
  ) {
    throw new Error("/api/packing-tasks did not return the packing task list item after packing completion");
  }

  const expressFulfillmentList = await getJson(baseUrl, "/api/fulfillments?method=快递快运&pageSize=1");
  const expressFulfillmentId = expressFulfillmentList.items?.[0]?.fulfillmentId;
  if (!expressFulfillmentId || !expressFulfillmentList.metrics) {
    throw new Error("/api/fulfillments did not return OpenAPI-shaped list items and metrics");
  }

  const defaultPrintDevices = await getJson(baseUrl, "/api/print-devices?documentType=express_ltl_label");
  if (
    defaultPrintDevices.total < 1 ||
    !defaultPrintDevices.items?.some(
      (device) =>
        device.printDeviceId === "PRN-LABEL-A" &&
        device.deviceType === "label_printer" &&
        device.paperWidthMm === 80 &&
        device.defaultDocumentTypes?.includes("express_ltl_label"),
    )
  ) {
    throw new Error("/api/print-devices did not return the default label printer profile");
  }

  const defaultDotMatrixDevices = await getJson(baseUrl, "/api/print-devices?documentType=pickup_note");
  if (
    defaultDotMatrixDevices.total < 1 ||
    !defaultDotMatrixDevices.items?.some(
      (device) =>
        device.printDeviceId === "PRN-DOT-A" &&
        device.deviceType === "dot_matrix" &&
        device.paperWidthMm === 241 &&
        device.defaultDocumentTypes?.includes("pickup_note"),
    )
  ) {
    throw new Error("/api/print-devices did not return the default dot-matrix printer profile");
  }

  const savedPrintDevice = await postJson(baseUrl, "/api/print-devices", {
    printDeviceId: "PRN-API-CHECK-1",
    name: "API 校验标签机",
    deviceType: "label_printer",
    status: "active",
    connectionType: "system_printer",
    connectionUri: "system://api-check-label",
    driverName: "API Check 203dpi Driver",
    supportedDocumentTypes: ["express_ltl_label", "package_label"],
    defaultDocumentTypes: ["express_ltl_label"],
    paperWidthMm: 76,
    paperHeightMm: 50,
    paperName: "76x50 热敏标签",
    dpi: 203,
    defaultCopies: 1,
    darkness: 9,
    speed: 4,
    cutterEnabled: false,
    settings: { driverMode: "preview_only" },
    operatorId: "U-OFFICE-A",
  });
  if (
    savedPrintDevice.printDevice?.printDeviceId !== "PRN-API-CHECK-1" ||
    savedPrintDevice.printDevice?.paperWidthMm !== 76 ||
    !savedPrintDevice.operationLogId
  ) {
    throw new Error("/api/print-devices did not save a print device profile");
  }

  const savedDriverModeDevice = await postJson(baseUrl, "/api/print-devices", {
    printDeviceId: "PRN-API-MODE-CHECK",
    name: "API 模式校验标签机",
    deviceType: "label_printer",
    status: "active",
    connectionType: "system_printer",
    connectionUri: "system://api-mode-label",
    driverName: "API Mode Check 203dpi Driver",
    supportedDocumentTypes: ["package_label"],
    defaultDocumentTypes: ["package_label"],
    paperWidthMm: 92,
    paperHeightMm: 38,
    paperName: "92x38 热敏标签",
    dpi: 203,
    defaultCopies: 1,
    darkness: 7,
    speed: 4,
    cutterEnabled: false,
    settings: { driverMode: "preview_only", note: "mode route should preserve this note" },
    operatorId: "U-OFFICE-A",
  });
  if (savedDriverModeDevice.printDevice?.settings?.driverMode !== "preview_only") {
    throw new Error("/api/print-devices did not save the initial driver mode");
  }

  const deniedDriverModeUpdate = await postJson(
    baseUrl,
    "/api/print-devices/PRN-API-MODE-CHECK/driver-mode",
    {
      driverMode: "system_printer",
      operatorId: "U-FINANCE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-FINANCE-A" },
    },
  );
  if (deniedDriverModeUpdate.requiredPermission !== "fulfillment.print") {
    throw new Error("/api/print-devices/{printDeviceId}/driver-mode should deny users without print permission");
  }

  const invalidDriverModeUpdate = await postJson(
    baseUrl,
    "/api/print-devices/PRN-API-MODE-CHECK/driver-mode",
    {
      driverMode: "manual",
      operatorId: "U-OFFICE-A",
    },
    { expectedStatus: 422 },
  );
  if (invalidDriverModeUpdate.code !== "INVALID_PRINT_DEVICE_DRIVER_MODE") {
    throw new Error("/api/print-devices/{printDeviceId}/driver-mode should reject unsupported driver modes");
  }

  const driverModeUpdate = await postJson(baseUrl, "/api/print-devices/PRN-API-MODE-CHECK/driver-mode", {
    driverMode: "system_printer",
    operatorId: "U-OFFICE-A",
    reason: "API skeleton verifies narrow driver mode update",
  });
  if (
    driverModeUpdate.printDeviceId !== "PRN-API-MODE-CHECK" ||
    driverModeUpdate.previousDriverMode !== "preview_only" ||
    driverModeUpdate.driverMode !== "system_printer" ||
    driverModeUpdate.printDevice?.settings?.driverMode !== "system_printer" ||
    driverModeUpdate.printDevice?.settings?.note !== "mode route should preserve this note" ||
    driverModeUpdate.printDevice?.paperWidthMm !== 92 ||
    !driverModeUpdate.operationLogId
  ) {
    throw new Error("/api/print-devices/{printDeviceId}/driver-mode did not narrowly update driver mode");
  }

  const printFulfillment = await postJson(baseUrl, `/api/fulfillments/${expressFulfillmentId}/print`, {
    templateId: "tpl-p0-express-label",
    documentType: "express_ltl_label",
    printDeviceId: "PRN-API-CHECK-1",
    printAction: "first_print",
    operatorId: "U-OFFICE-A",
  });
  if (
    printFulfillment.printRecord?.status !== "printed" ||
    printFulfillment.printRecord?.printAction !== "first_print" ||
    !printFulfillment.printRecord?.templateId ||
    printFulfillment.printRecord?.printDeviceId !== "PRN-API-CHECK-1" ||
    printFulfillment.printRecord?.printDeviceSnapshot?.paperWidthMm !== 76 ||
    printFulfillment.printTemplate?.documentType !== "express_ltl_label" ||
    printFulfillment.printTemplate?.priceHidden !== true ||
    !printFulfillment.printTemplate?.fields?.goodsSummary ||
    printFulfillment.printJob?.printRecordId !== printFulfillment.printRecord.printRecordId ||
    printFulfillment.printJob?.printDeviceId !== "PRN-API-CHECK-1" ||
    printFulfillment.printJob?.jobStatus !== "preview_only" ||
    !printFulfillment.printJobOperationLogId
  ) {
    throw new Error("/api/fulfillments/{fulfillmentId}/print returned an unexpected OpenAPI-shaped payload");
  }

  const printJobList = await getJson(
    baseUrl,
    `/api/print-jobs?printRecordId=${encodeURIComponent(printFulfillment.printRecord.printRecordId)}`,
  );
  if (
    printJobList.total < 1 ||
    !printJobList.items?.some((job) => job.printJobId === printFulfillment.printJob.printJobId)
  ) {
    throw new Error("/api/print-jobs did not return the generated fulfillment print job");
  }

  const printJobDetail = await getJson(baseUrl, `/api/print-jobs/${printFulfillment.printJob.printJobId}`);
  if (
    printJobDetail.printJob?.printJobId !== printFulfillment.printJob.printJobId ||
    printJobDetail.printJob?.jobStatus !== "preview_only"
  ) {
    throw new Error("/api/print-jobs/{printJobId} did not return the generated fulfillment print job detail");
  }

  const deniedPrinterDeviceFieldTest = await postJson(
    baseUrl,
    "/api/print-devices/PRN-API-CHECK-1/field-tests",
    {
      recordId: "PDQA-API-DENIED-PRN-API-CHECK-1",
      printDeviceId: "PRN-API-CHECK-1",
      printJobId: printFulfillment.printJob.printJobId,
      operatorId: "U-WAREHOUSE-A",
      checks: [{ key: "sample_print", status: "passed" }],
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (deniedPrinterDeviceFieldTest.requiredPermission !== "print.device_qa.record") {
    throw new Error("/api/print-devices/{printDeviceId}/field-tests should deny users without print device QA permission");
  }

  const printerDeviceFieldTest = await postJson(baseUrl, "/api/print-devices/PRN-API-CHECK-1/field-tests", {
    recordId: "PDQA-API-SMOKE-PRN-API-CHECK-1",
    printDeviceId: "PRN-API-CHECK-1",
    printJobId: printFulfillment.printJob.printJobId,
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    checkedAt: "2026-07-02T11:25:00.000Z",
    deviceLabel: "API 校验标签机",
    driverLabel: "API Check 203dpi Driver",
    paperLabel: "76x50 热敏标签",
    checks: [
      { key: "sample_print", status: "passed" },
      { key: "paper_alignment", status: "passed" },
      { key: "barcode_scan", status: "passed" },
      { key: "driver_callback", status: "blocked" },
      { key: "legibility", status: "passed" },
      { key: "void_reprint", status: "untested" },
    ],
    evidence: {
      samplePrintReference: "PJ sample printed on 76x50",
      barcodeScanText: "F010-PKG-1",
      driverCallbackStatus: "",
      voidReprintReference: "",
      operatorAcceptance: "办公室A 待回写复测",
    },
    note: "API skeleton printer device field QA check",
  });
  if (
    printerDeviceFieldTest.record?.recordId !== "PDQA-API-SMOKE-PRN-API-CHECK-1" ||
    printerDeviceFieldTest.record?.printJobId !== printFulfillment.printJob.printJobId ||
    printerDeviceFieldTest.record?.summary?.passedCount !== 4 ||
    printerDeviceFieldTest.record?.summary?.issueCount !== 1 ||
    printerDeviceFieldTest.record?.summary?.evidenceSummary?.missingCount !== 2 ||
    printerDeviceFieldTest.record?.evidence?.barcodeScanText !== "F010-PKG-1" ||
    printerDeviceFieldTest.printDevice?.latestFieldTestRecord?.recordId !== printerDeviceFieldTest.record.recordId ||
    !printerDeviceFieldTest.operationLogId
  ) {
    throw new Error("/api/print-devices/{printDeviceId}/field-tests returned an unexpected payload");
  }
  const printerDeviceFieldTestList = await getJson(baseUrl, "/api/print-devices/PRN-API-CHECK-1/field-tests");
  if (
    printerDeviceFieldTestList.total !== 1 ||
    printerDeviceFieldTestList.latestRecord?.recordId !== printerDeviceFieldTest.record.recordId ||
    printerDeviceFieldTestList.printDevice?.printDeviceId !== "PRN-API-CHECK-1"
  ) {
    throw new Error("/api/print-devices/{printDeviceId}/field-tests did not list the recorded field QA item");
  }
  const printerDeviceFieldTestLogs = await getJson(baseUrl, "/api/operation-logs?targetType=print_device&targetId=PRN-API-CHECK-1");
  if (
    !printerDeviceFieldTestLogs.items?.some(
      (item) =>
        item.id === printerDeviceFieldTest.operationLogId &&
        item.action === "record_printer_device_field_test" &&
        item.after?.recordId === printerDeviceFieldTest.record.recordId,
    )
  ) {
    throw new Error("/api/operation-logs did not include the printer device field QA action");
  }

  const dispatchPreviewPrintJob = await postJson(baseUrl, `/api/print-jobs/${printFulfillment.printJob.printJobId}/dispatch`, {
    reason: "校验 preview-only 派发边界",
    operatorId: "U-OFFICE-A",
  });
  if (
    dispatchPreviewPrintJob.printJob?.jobStatus !== "preview_only" ||
    dispatchPreviewPrintJob.dispatchResult?.adapterStatus !== "skipped" ||
    !dispatchPreviewPrintJob.operationLogId
  ) {
    throw new Error("/api/print-jobs/{printJobId}/dispatch did not preserve a preview-only print job boundary");
  }

  const deniedPreviewDriverStatus = await postJson(
    baseUrl,
    `/api/print-jobs/${printFulfillment.printJob.printJobId}/driver-status`,
    {
      status: "printed",
      adapterName: "api-check-preview",
      driverStatus: "completed",
      operatorId: "PRINT-DRIVER",
    },
    { expectedStatus: 403, headers: { "x-erp-user-id": "U-WAREHOUSE-A" } },
  );
  if (deniedPreviewDriverStatus.requiredPermission !== "print.job.callback") {
    throw new Error("/api/print-jobs/{printJobId}/driver-status did not enforce print callback permission");
  }

  const rejectedPreviewDriverStatus = await postJson(
    baseUrl,
    `/api/print-jobs/${printFulfillment.printJob.printJobId}/driver-status`,
    {
      status: "printed",
      adapterName: "api-check-preview",
      driverStatus: "completed",
      operatorId: "PRINT-DRIVER",
    },
    { expectedStatus: 409, headers: { "x-erp-user-id": "U-PRINT-DRIVER-A" } },
  );
  if (rejectedPreviewDriverStatus.code !== "PRINT_JOB_DRIVER_CALLBACK_NOT_EXPECTED") {
    throw new Error("/api/print-jobs/{printJobId}/driver-status did not reject preview-only callbacks");
  }

  const deniedPreviewStatusPoll = await postJson(
    baseUrl,
    `/api/print-jobs/${printFulfillment.printJob.printJobId}/poll-status`,
    {
      reason: "校验 preview-only 轮询权限",
    },
    { expectedStatus: 403, headers: { "x-erp-user-id": "U-WAREHOUSE-A" } },
  );
  if (deniedPreviewStatusPoll.requiredPermission !== "print.job.callback") {
    throw new Error("/api/print-jobs/{printJobId}/poll-status did not enforce print callback permission");
  }

  const previewStatusPoll = await postJson(
    baseUrl,
    `/api/print-jobs/${printFulfillment.printJob.printJobId}/poll-status`,
    {
      reason: "校验 preview-only 轮询边界",
    },
    { headers: { "x-erp-user-id": "U-PRINT-DRIVER-A" } },
  );
  if (
    previewStatusPoll.updated !== false ||
    previewStatusPoll.printJob?.jobStatus !== "preview_only" ||
    previewStatusPoll.pollResult?.adapterStatus !== "no_poll_needed"
  ) {
    throw new Error("/api/print-jobs/{printJobId}/poll-status did not preserve preview-only print jobs");
  }

  const previewStatusPollBatch = await postJson(
    baseUrl,
    "/api/print-jobs/status-poll",
    {
      statuses: ["sent"],
      reason: "校验批量轮询无候选边界",
    },
    { headers: { "x-erp-user-id": "U-PRINT-DRIVER-A" } },
  );
  if (previewStatusPollBatch.totalCandidates !== 0 || previewStatusPollBatch.updatedCount !== 0) {
    throw new Error("/api/print-jobs/status-poll did not preserve an empty candidate batch");
  }

  const failedPrintJob = await postJson(baseUrl, `/api/print-jobs/${printFulfillment.printJob.printJobId}/status`, {
    status: "failed",
    errorCode: "CHECK_DRIVER_TIMEOUT",
    errorMessage: "API check simulated driver timeout",
    reason: "校验打印失败回写",
    operatorId: "U-OFFICE-A",
  });
  if (
    failedPrintJob.printJob?.jobStatus !== "failed" ||
    failedPrintJob.printJob?.errorCode !== "CHECK_DRIVER_TIMEOUT" ||
    !failedPrintJob.operationLogId
  ) {
    throw new Error("/api/print-jobs/{printJobId}/status did not persist a failed print job status");
  }

  const retryPrintJob = await postJson(baseUrl, `/api/print-jobs/${printFulfillment.printJob.printJobId}/retry`, {
    retryReason: "校验失败重试",
    operatorId: "U-OFFICE-A",
  });
  if (
    retryPrintJob.sourcePrintJob?.printJobId !== printFulfillment.printJob.printJobId ||
    retryPrintJob.printJob?.sourcePrintJobId !== printFulfillment.printJob.printJobId ||
    retryPrintJob.printJob?.attemptNo !== 2 ||
    retryPrintJob.printJob?.jobStatus !== "preview_only" ||
    !retryPrintJob.operationLogId
  ) {
    throw new Error("/api/print-jobs/{printJobId}/retry did not create a retry print job");
  }

  const blockedReprint = await postJson(
    baseUrl,
    `/api/fulfillments/${expressFulfillmentId}/print`,
    {
      templateId: "tpl-p0-express-label",
      documentType: "express_ltl_label",
      printDeviceId: "PRN-API-CHECK-1",
      printAction: "reprint",
      previousPrintRecordId: printFulfillment.printRecord.printRecordId,
      reprintReason: "info_changed",
      operatorId: "U-OFFICE-A",
    },
    { expectedStatus: 409 },
  );
  if (blockedReprint.code !== "REPRINT_REQUIRES_VOIDED_RECORD") {
    throw new Error("/api/fulfillments/{fulfillmentId}/print allowed reprint before voiding the old label");
  }

  const voidPrint = await postJson(baseUrl, `/api/print-records/${printFulfillment.printRecord.printRecordId}/void`, {
    voidReason: "info_changed",
    operatorId: "U-OFFICE-A",
  });
  if (
    voidPrint.printRecord?.status !== "voided" ||
    voidPrint.printRecord?.voidReason !== "info_changed" ||
    !voidPrint.operationLogId
  ) {
    throw new Error("/api/print-records/{printRecordId}/void returned an unexpected payload");
  }

  const reprintFulfillment = await postJson(baseUrl, `/api/fulfillments/${expressFulfillmentId}/print`, {
    templateId: "tpl-p0-express-label",
    documentType: "express_ltl_label",
    printDeviceId: "PRN-API-CHECK-1",
    printAction: "reprint",
    previousPrintRecordId: printFulfillment.printRecord.printRecordId,
    reprintReason: "info_changed",
    operatorId: "U-OFFICE-A",
  });
  if (
    reprintFulfillment.printRecord?.status !== "reprinted" ||
    reprintFulfillment.printRecord?.previousPrintRecordId !== printFulfillment.printRecord.printRecordId ||
    reprintFulfillment.printRecord?.printDeviceId !== "PRN-API-CHECK-1" ||
    reprintFulfillment.printTemplate?.priceHidden !== true ||
    !reprintFulfillment.operationLogId
  ) {
    throw new Error("/api/fulfillments/{fulfillmentId}/print did not create a reprint record after voiding");
  }

  const pickupFulfillment = await postJson(baseUrl, `/api/fulfillments/${expressFulfillmentId}/pickup-confirm`, {
    fulfillmentId: expressFulfillmentId,
    pickedAt: new Date().toISOString(),
    operatorId: "U-OFFICE-A",
  });
  if (pickupFulfillment.statementCandidate !== true || !pickupFulfillment.operationLogId) {
    throw new Error("/api/fulfillments/{fulfillmentId}/pickup-confirm returned an unexpected payload");
  }

  const deliveryFulfillmentList = await getJson(baseUrl, "/api/fulfillments?method=送货&pageSize=1");
  const deliveryFulfillment = deliveryFulfillmentList.items?.[0];
  if (!deliveryFulfillment?.fulfillmentId) {
    throw new Error("/api/fulfillments did not return a delivery fulfillment for completion checks");
  }

  const deliveryPrintPreview = await postJson(baseUrl, `/api/fulfillments/${deliveryFulfillment.fulfillmentId}/print`, {
    templateId: "tpl-p0-delivery-note",
    documentType: "delivery_note",
    printAction: "preview",
    operatorId: "U-OFFICE-A",
  });
  if (
    deliveryPrintPreview.printRecord?.status !== "previewed" ||
    deliveryPrintPreview.printRecord?.printDeviceId !== "PRN-DOT-A" ||
    deliveryPrintPreview.printTemplate?.documentType !== "delivery_note" ||
    deliveryPrintPreview.printTemplate?.title !== "送货单" ||
    deliveryPrintPreview.printTemplate?.priceHidden !== false ||
    deliveryPrintPreview.printTemplate?.paper?.copies !== 2 ||
    !deliveryPrintPreview.printTemplate?.fields?.lineItems?.[0]?.amountText?.startsWith("¥") ||
    deliveryPrintPreview.printJob?.documentType !== "delivery_note"
  ) {
    throw new Error("/api/fulfillments/{fulfillmentId}/print did not return the delivery dot-matrix template");
  }

  const deliveryFirstPrint = await postJson(baseUrl, `/api/fulfillments/${deliveryFulfillment.fulfillmentId}/print`, {
    templateId: "tpl-p0-delivery-note",
    documentType: "delivery_note",
    printAction: "first_print",
    operatorId: "U-OFFICE-A",
  });
  if (
    deliveryFirstPrint.printRecord?.status !== "printed" ||
    deliveryFirstPrint.printRecord?.printAction !== "first_print" ||
    deliveryFirstPrint.printRecord?.printDeviceId !== "PRN-DOT-A" ||
    deliveryFirstPrint.printTemplate?.documentType !== "delivery_note" ||
    deliveryFirstPrint.printTemplate?.priceHidden !== false ||
    deliveryFirstPrint.printJob?.documentType !== "delivery_note" ||
    !deliveryFirstPrint.operationLogId
  ) {
    throw new Error("/api/fulfillments/{fulfillmentId}/print did not create a printed delivery note record");
  }

  const blockedDeliveryReprint = await postJson(
    baseUrl,
    `/api/fulfillments/${deliveryFulfillment.fulfillmentId}/print`,
    {
      templateId: "tpl-p0-delivery-note",
      documentType: "delivery_note",
      printAction: "reprint",
      previousPrintRecordId: deliveryFirstPrint.printRecord.printRecordId,
      reprintReason: "customer_change",
      operatorId: "U-OFFICE-A",
    },
    { expectedStatus: 409 },
  );
  if (blockedDeliveryReprint.code !== "REPRINT_REQUIRES_VOIDED_RECORD") {
    throw new Error("/api/fulfillments/{fulfillmentId}/print allowed delivery note reprint before voiding");
  }

  const voidDeliveryPrint = await postJson(
    baseUrl,
    `/api/print-records/${deliveryFirstPrint.printRecord.printRecordId}/void`,
    {
      voidReason: "customer_change",
      operatorId: "U-OFFICE-A",
    },
  );
  if (
    voidDeliveryPrint.printRecord?.status !== "voided" ||
    voidDeliveryPrint.printRecord?.voidReason !== "customer_change" ||
    !voidDeliveryPrint.operationLogId
  ) {
    throw new Error("/api/print-records/{printRecordId}/void did not void the delivery note print record");
  }

  const deliveryReprint = await postJson(baseUrl, `/api/fulfillments/${deliveryFulfillment.fulfillmentId}/print`, {
    templateId: "tpl-p0-delivery-note",
    documentType: "delivery_note",
    printAction: "reprint",
    previousPrintRecordId: deliveryFirstPrint.printRecord.printRecordId,
    reprintReason: "customer_change",
    operatorId: "U-OFFICE-A",
  });
  if (
    deliveryReprint.printRecord?.status !== "reprinted" ||
    deliveryReprint.printRecord?.previousPrintRecordId !== deliveryFirstPrint.printRecord.printRecordId ||
    deliveryReprint.printTemplate?.documentType !== "delivery_note" ||
    deliveryReprint.printTemplate?.priceHidden !== false ||
    deliveryReprint.printJob?.documentType !== "delivery_note" ||
    !deliveryReprint.operationLogId
  ) {
    throw new Error("/api/fulfillments/{fulfillmentId}/print did not create a delivery note reprint after voiding");
  }

  const completeFulfillment = await postJson(baseUrl, `/api/fulfillments/${deliveryFulfillment.fulfillmentId}/complete`, {
    fulfillmentId: deliveryFulfillment.fulfillmentId,
    actualQty: deliveryFulfillment.expectedQty,
    handoverEvidence: [],
    operatorId: "U-OFFICE-A",
    completedAt: new Date().toISOString(),
    remark: "API skeleton complete check",
    allowUnreservedInventoryDeduction: true,
  });
  if (
    completeFulfillment.status !== "已交付" ||
    completeFulfillment.statementCandidate !== true ||
    completeFulfillment.inventoryDeductionMode !== "legacy_reserved_stock_match" ||
    completeFulfillment.inventoryLedgerIds?.length !== 1 ||
    !completeFulfillment.operationLogId
  ) {
    throw new Error("/api/fulfillments/{fulfillmentId}/complete returned an unexpected payload");
  }

  const deniedWarehouseDriverTasks = await getJson(baseUrl, "/api/driver/delivery-tasks", {
    expectedStatus: 403,
    headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
  });
  if (
    deniedWarehouseDriverTasks.code !== "PERMISSION_DENIED" ||
    deniedWarehouseDriverTasks.requiredPermission !== "delivery.view"
  ) {
    throw new Error("/api/driver/delivery-tasks did not deny a non-driver seed user");
  }

  const driverContext = await getJson(baseUrl, "/api/permissions/effective", {
    headers: { "x-erp-user-id": "U-DRIVER-A" },
  });
  if (
    driverContext.user?.userId !== "U-DRIVER-A" ||
    !driverContext.actionPermissions?.includes("delivery.view") ||
    !driverContext.actionPermissions?.includes("delivery.load_confirm") ||
    !driverContext.actionPermissions?.includes("delivery.complete") ||
    !driverContext.actionPermissions?.includes("delivery.exception.create") ||
    !driverContext.actionPermissions?.includes("delivery.device_qa.record") ||
    !driverContext.actionPermissions?.includes("attachment.delivery_evidence.create") ||
    driverContext.actionPermissions?.includes("attachment.create") ||
    driverContext.actionPermissions?.includes("fulfillment.dispatch.update") ||
    driverContext.actionPermissions?.includes("fulfillment.print")
  ) {
    throw new Error("/api/permissions/effective did not return the expected driver seed permissions");
  }

  const driverTaskList = await getJson(baseUrl, "/api/driver/delivery-tasks?driverId=U-DRIVER-A", {
    headers: { "x-erp-user-id": "U-DRIVER-A" },
  });
  const driverPendingTask = driverTaskList.items?.find(
    (item) => item.status === "待送货" && item.fulfillmentId !== deliveryFulfillment.fulfillmentId,
  );
  const driverExceptionTask = driverTaskList.items?.find((item) => item.status === "送货异常");
  if (
    driverTaskList.total < 2 ||
    driverTaskList.metrics?.pendingCount < 1 ||
    !driverPendingTask?.fulfillmentId ||
    !driverPendingTask.goodsSummary?.includes("黄印黑") ||
    !driverPendingTask.goodsSummary?.includes("黄袋红提") ||
    !Array.isArray(driverPendingTask.packageChecklist) ||
    driverPendingTask.packageChecklist.length < 1 ||
    !driverExceptionTask?.fulfillmentId
  ) {
    throw new Error("/api/driver/delivery-tasks did not return driver-facing delivery task fields");
  }

  const deniedWarehouseDispatch = await postJson(
    baseUrl,
    `/api/fulfillments/${driverPendingTask.fulfillmentId}/dispatch`,
    {
      fulfillmentId: driverPendingTask.fulfillmentId,
      driverId: "U-DRIVER-A",
      routeDate: "2026-07-02",
      routeNo: "虎门线-A",
      routeSequence: 1,
      operatorId: "U-WAREHOUSE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehouseDispatch.code !== "PERMISSION_DENIED" ||
    deniedWarehouseDispatch.requiredPermission !== "fulfillment.dispatch.update"
  ) {
    throw new Error("/api/fulfillments/{fulfillmentId}/dispatch did not deny a warehouse seed user");
  }

  const officeDispatch = await postJson(
    baseUrl,
    `/api/fulfillments/${driverPendingTask.fulfillmentId}/dispatch`,
    {
      fulfillmentId: driverPendingTask.fulfillmentId,
      driverId: "U-DRIVER-A",
      routeDate: "2026-07-02",
      routeNo: "虎门线-A",
      routeSequence: 1,
      plannedDepartureAt: "2026-07-02T08:30:00.000Z",
      operatorId: "U-OFFICE-A",
      remark: "API skeleton dispatch check",
    },
    {
      headers: { "x-erp-user-id": "U-OFFICE-A" },
    },
  );
  if (
    officeDispatch.dispatch?.fulfillmentId !== driverPendingTask.fulfillmentId ||
    officeDispatch.dispatch?.routeNo !== "虎门线-A" ||
    officeDispatch.dispatch?.routeSequence !== 1 ||
    officeDispatch.task?.routeNo !== "虎门线-A" ||
    officeDispatch.task?.routeSequence !== 1 ||
    !officeDispatch.operationLogId
  ) {
    throw new Error("/api/fulfillments/{fulfillmentId}/dispatch returned an unexpected payload");
  }

  const driverLoadedAt = "2026-07-02T09:05:00.000Z";
  const driverLoadRemark = `API skeleton driver load check；装车核对：${driverPendingTask.packageChecklist.length}/${driverPendingTask.packageChecklist.length}包`;
  const driverLoadConfirm = await postJson(
    baseUrl,
    `/api/driver/delivery-tasks/${driverPendingTask.fulfillmentId}/load-confirm`,
    {
      fulfillmentId: driverPendingTask.fulfillmentId,
      loadedAt: driverLoadedAt,
      operatorId: "U-DRIVER-A",
      checkedPackageIds: driverPendingTask.packageChecklist.map((item) => item.packageId),
      packageCheckSummary: `${driverPendingTask.packageChecklist.length}/${driverPendingTask.packageChecklist.length}包`,
      remark: driverLoadRemark,
    },
    {
      headers: { "x-erp-user-id": "U-DRIVER-A" },
    },
  );
  if (
    driverLoadConfirm.status !== "配送中" ||
    driverLoadConfirm.task?.status !== "配送中" ||
    driverLoadConfirm.task?.routeNo !== "虎门线-A" ||
    driverLoadConfirm.task?.routeSequence !== 1 ||
    driverLoadConfirm.task?.loadedAt !== driverLoadedAt ||
    driverLoadConfirm.task?.loadedBy !== "U-DRIVER-A" ||
    driverLoadConfirm.task?.driverRemark !== driverLoadRemark ||
    !Array.isArray(driverLoadConfirm.task?.packageChecklist) ||
    driverLoadConfirm.task.packageChecklist.length < 1 ||
    !driverLoadConfirm.operationLogId
  ) {
    throw new Error("/api/driver/delivery-tasks/{id}/load-confirm returned an unexpected payload");
  }

  const deniedWarehouseDeviceFieldTest = await postJson(
    baseUrl,
    `/api/driver/delivery-tasks/${driverPendingTask.fulfillmentId}/device-field-tests`,
    {
      recordId: `DQA-API-DENIED-${driverPendingTask.fulfillmentId}`,
      fulfillmentId: driverPendingTask.fulfillmentId,
      operatorId: "U-WAREHOUSE-A",
      checkedAt: new Date().toISOString(),
      deviceLabel: "iPhone 15",
      browserLabel: "Safari 17",
      checks: [],
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (deniedWarehouseDeviceFieldTest.requiredPermission !== "delivery.device_qa.record") {
    throw new Error("/api/driver/delivery-tasks/{id}/device-field-tests should deny non-driver field QA permission");
  }

  const driverDeviceFieldTest = await postJson(
    baseUrl,
    `/api/driver/delivery-tasks/${driverPendingTask.fulfillmentId}/device-field-tests`,
    {
      recordId: `DQA-API-SMOKE-${driverPendingTask.fulfillmentId}`,
      fulfillmentId: driverPendingTask.fulfillmentId,
      orderLineId: driverPendingTask.orderLineId,
      driverId: "U-DRIVER-A",
      operatorId: "U-DRIVER-A",
      operatorName: "司机A",
      checkedAt: "2026-07-02T09:35:00.000Z",
      deviceLabel: "iPhone 15 Pro",
      browserLabel: "Safari 17",
      userAgent: "Mozilla/5.0 Safari/604.1",
      language: "zh-CN",
      checks: [
        { key: "camera_permission", status: "passed" },
        { key: "watermark_photo", status: "passed" },
        { key: "package_label_scan", status: "failed" },
        { key: "geolocation", status: "blocked" },
        { key: "file_upload", status: "untested" },
        { key: "navigation", status: "untested" },
      ],
      packageLabelScanSample: {
        sampleId: `DPLS-API-SMOKE-${driverPendingTask.fulfillmentId}`,
        fulfillmentId: driverPendingTask.fulfillmentId,
        expectedPackageId: driverPendingTask.packageChecklist?.[0]?.packageId ?? "",
        scannedText: driverPendingTask.packageChecklist?.[0]?.packageId ?? "",
        matchedPackageId: driverPendingTask.packageChecklist?.[0]?.packageId ?? "",
        method: "scanner_wedge",
        result: "matched",
        message: "API skeleton label sample",
        checkedAt: "2026-07-02T09:34:59.000Z",
      },
      nativeBridgeDiagnostics: {
        items: [
          {
            key: "native_package_scan",
            label: "原生扫码",
            target: "包裹标签",
            supported: false,
            statusLabel: "未接入",
            tone: "warning",
            bridgeType: "",
            bridgeTypeLabel: "未发现",
            version: "p0-driver-native-bridge-v1",
          },
          {
            key: "native_navigation",
            label: "原生导航",
            target: "地图打开",
            supported: false,
            statusLabel: "未接入",
            tone: "warning",
            bridgeType: "",
            bridgeTypeLabel: "未发现",
            version: "p0-driver-native-navigation-bridge-v1",
          },
        ],
        total: 2,
        supportedCount: 0,
        issueCount: 2,
        tone: "warning",
        label: "原生 0/2",
        message: "普通浏览器未接原生壳。",
      },
      note: "API skeleton field device QA check",
    },
    {
      headers: { "x-erp-user-id": "U-DRIVER-A" },
    },
  );
  if (
    driverDeviceFieldTest.record?.recordId !== `DQA-API-SMOKE-${driverPendingTask.fulfillmentId}` ||
    driverDeviceFieldTest.record?.summary?.passedCount !== 2 ||
    driverDeviceFieldTest.record?.summary?.issueCount !== 2 ||
    driverDeviceFieldTest.record?.packageLabelScanSample?.matchedPackageId !== driverPendingTask.packageChecklist?.[0]?.packageId ||
    driverDeviceFieldTest.record?.nativeBridgeDiagnostics?.label !== "原生 0/2" ||
    driverDeviceFieldTest.task?.deviceFieldTestRecord?.recordId !== driverDeviceFieldTest.record.recordId ||
    driverDeviceFieldTest.task?.deviceFieldTestRecord?.packageLabelScanSample?.method !== "scanner_wedge" ||
    driverDeviceFieldTest.task?.deviceFieldTestRecord?.nativeBridgeDiagnostics?.items?.length !== 2 ||
    driverDeviceFieldTest.task?.deviceFieldTestSummary?.label !== driverDeviceFieldTest.record.summary.label ||
    !driverDeviceFieldTest.operationLogId
  ) {
    throw new Error("/api/driver/delivery-tasks/{id}/device-field-tests returned an unexpected payload");
  }
  const driverDeviceFieldTestLogs = await getJson(
    baseUrl,
    `/api/operation-logs?targetType=fulfillment&targetId=${driverPendingTask.fulfillmentId}`,
  );
  if (
    !driverDeviceFieldTestLogs.items?.some(
      (item) =>
        item.id === driverDeviceFieldTest.operationLogId &&
        item.action === "driver_record_device_field_test" &&
        item.after?.recordId === driverDeviceFieldTest.record.recordId,
    )
  ) {
    throw new Error("/api/operation-logs did not include the driver field device QA record");
  }

  const blockedDriverComplete = await postJson(
    baseUrl,
    `/api/driver/delivery-tasks/${driverPendingTask.fulfillmentId}/complete`,
    {
      fulfillmentId: driverPendingTask.fulfillmentId,
      actualQty: driverPendingTask.qty,
      operatorId: "U-DRIVER-A",
      watermarkedPhotoAttached: false,
    },
    {
      expectedStatus: 422,
      headers: { "x-erp-user-id": "U-DRIVER-A" },
    },
  );
  if (blockedDriverComplete.code !== "WATERMARK_PHOTO_REQUIRED") {
    throw new Error("/api/driver/delivery-tasks/{id}/complete did not require a watermarked photo");
  }

  const driverWatermarkAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "fulfillment",
      ownerId: driverPendingTask.fulfillmentId,
      purpose: "delivery_watermark_photo",
      fileType: "image",
      fileName: "driver-watermark-api-smoke.png",
      contentRef: `p0://driver-delivery/${driverPendingTask.fulfillmentId}/delivery_watermark_photo/api-smoke`,
      mimeType: "image/png",
      fileSize: 96,
      contentDataUrl: "data:image/png;base64,ZHJpdmVyLXdh dGVybWFyaw==".replace(" ", ""),
      uploadedBy: "U-DRIVER-A",
      metadata: {
        watermarkId: "WM-API-SMOKE-1",
        watermarkCapturedAt: "2026-07-02T09:10:00.000Z",
        watermarkLocationLabel: "厚街仓库门岗",
        watermarkGeoPoint: "22.920000,113.680000",
      },
      remark: "driver delivery watermark smoke",
    },
    {
      headers: { "x-erp-user-id": "U-DRIVER-A" },
    },
  );
  if (
    !driverWatermarkAttachment.attachmentId ||
    driverWatermarkAttachment.ownerType !== "fulfillment" ||
    driverWatermarkAttachment.purpose !== "delivery_watermark_photo" ||
    driverWatermarkAttachment.uploadedBy !== "U-DRIVER-A" ||
    driverWatermarkAttachment.metadata?.watermarkId !== "WM-API-SMOKE-1"
  ) {
    throw new Error("/api/attachments did not allow driver delivery evidence upload");
  }

  const blockedDriverPaymentAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "statement",
      ownerId: "ST-DRIVER-DENIED",
      purpose: "payment_screenshot",
      fileType: "image",
      fileName: "driver-payment-denied.png",
      contentRef: "p0://driver-denied/payment-screenshot",
      mimeType: "image/png",
      contentDataUrl: "data:image/png;base64,AAAA",
      uploadedBy: "U-DRIVER-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-DRIVER-A" },
    },
  );
  if (blockedDriverPaymentAttachment.requiredPermission !== "attachment.create") {
    throw new Error("/api/attachments should not let driver create non-delivery evidence attachments");
  }

  const driverComplete = await postJson(
    baseUrl,
    `/api/driver/delivery-tasks/${driverPendingTask.fulfillmentId}/complete`,
    {
      fulfillmentId: driverPendingTask.fulfillmentId,
      actualQty: driverPendingTask.qty,
      operatorId: "U-DRIVER-A",
      watermarkedPhotoAttached: false,
      watermarkedPhotoAttachmentId: driverWatermarkAttachment.attachmentId,
      watermarkId: "WM-API-SMOKE-1",
      watermarkText: "白鲸自营店 / 厚街仓库门岗 / 水印 WM-API-SMOKE-1",
      watermarkCapturedAt: "2026-07-02T09:10:00.000Z",
      watermarkLocationLabel: "厚街仓库门岗",
      watermarkGeoPoint: "22.920000,113.680000",
      watermarkAddress: "厚街仓库 A 区",
      watermarkOperatorId: "U-DRIVER-A",
      watermarkOperatorName: "司机A",
      signaturePhotoAttached: true,
      receiverName: "API 客户签收",
      paperNoteStatus: "已交回",
      completedAt: new Date().toISOString(),
      remark: "API skeleton driver complete check",
    },
    {
      headers: { "x-erp-user-id": "U-DRIVER-A" },
    },
  );
  if (
    driverComplete.status !== "已完成" ||
    driverComplete.task?.status !== "已完成" ||
    driverComplete.task?.watermarkedPhotoAttached !== true ||
    driverComplete.task?.watermarkedPhotoAttachmentId !== driverWatermarkAttachment.attachmentId ||
    driverComplete.task?.watermarkId !== "WM-API-SMOKE-1" ||
    driverComplete.task?.watermarkLocationLabel !== "厚街仓库门岗" ||
    driverComplete.task?.watermarkGeoPoint !== "22.920000,113.680000" ||
    driverComplete.task?.loadedAt !== driverLoadedAt ||
    driverComplete.task?.receiverName !== "API 客户签收" ||
    driverComplete.task?.paperNoteStatus !== "已交回" ||
    driverComplete.statementCandidate !== true ||
    !driverComplete.operationLogId
  ) {
    throw new Error("/api/driver/delivery-tasks/{id}/complete returned an unexpected payload");
  }

  const deniedDriverDeliveryEvidenceReview = await postJson(
    baseUrl,
    `/api/fulfillments/${driverPendingTask.fulfillmentId}/delivery-evidence-review`,
    {
      fulfillmentId: driverPendingTask.fulfillmentId,
      reviewStatus: "approved",
      operatorId: "U-DRIVER-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-DRIVER-A" },
    },
  );
  if (deniedDriverDeliveryEvidenceReview.requiredPermission !== "delivery.evidence.review") {
    throw new Error("/api/fulfillments/{id}/delivery-evidence-review should not allow driver review permission");
  }

  const deliveryEvidenceReview = await postJson(baseUrl, `/api/fulfillments/${driverPendingTask.fulfillmentId}/delivery-evidence-review`, {
    fulfillmentId: driverPendingTask.fulfillmentId,
    reviewStatus: "approved",
    operatorId: "U-OFFICE-A",
    reviewerName: "办公室A",
    remark: "API skeleton delivery evidence review check",
  });
  if (
    deliveryEvidenceReview.reviewStatus !== "已复核" ||
    deliveryEvidenceReview.reviewedBy !== "办公室A" ||
    deliveryEvidenceReview.task?.deliveryEvidenceReviewStatus !== "已复核" ||
    deliveryEvidenceReview.task?.watermarkedPhotoAttachmentId !== driverWatermarkAttachment.attachmentId ||
    !deliveryEvidenceReview.operationLogId
  ) {
    throw new Error("/api/fulfillments/{id}/delivery-evidence-review did not approve delivery evidence");
  }

  const deliveryEvidenceRetake = await postJson(baseUrl, `/api/fulfillments/${driverPendingTask.fulfillmentId}/delivery-evidence-review`, {
    fulfillmentId: driverPendingTask.fulfillmentId,
    reviewStatus: "retake_required",
    operatorId: "U-OFFICE-A",
    reviewerName: "办公室A",
    reason: "水印定位不清晰",
  });
  if (
    deliveryEvidenceRetake.reviewStatus !== "需重拍" ||
    deliveryEvidenceRetake.issueReason !== "水印定位不清晰" ||
    deliveryEvidenceRetake.todoType !== "照片待重拍" ||
    deliveryEvidenceRetake.task?.deliveryEvidenceReviewStatus !== "需重拍" ||
    !deliveryEvidenceRetake.todoId ||
    !deliveryEvidenceRetake.operationLogId
  ) {
    throw new Error("/api/fulfillments/{id}/delivery-evidence-review did not create a retake todo");
  }

  const deliveryEvidenceResubmission = await postJson(
    baseUrl,
    `/api/driver/delivery-tasks/${driverPendingTask.fulfillmentId}/complete`,
    {
      fulfillmentId: driverPendingTask.fulfillmentId,
      actualQty: driverPendingTask.qty,
      operatorId: "U-DRIVER-A",
      watermarkedPhotoAttachmentId: "ATT-DRIVER-WM-RETAKE-1",
      watermarkId: "WM-DRIVER-RETAKE-1",
      watermarkText: "补拍水印 WM-DRIVER-RETAKE-1",
      watermarkCapturedAt: "2026-07-02T10:45:00.000Z",
      watermarkLocationLabel: "客户门店补拍",
      remark: "司机补拍送达水印照片",
    },
    {
      headers: { "x-erp-user-id": "U-DRIVER-A" },
    },
  );
  if (
    deliveryEvidenceResubmission.status !== "已完成" ||
    deliveryEvidenceResubmission.evidenceResubmission !== true ||
    deliveryEvidenceResubmission.retakeTodoId !== deliveryEvidenceRetake.todoId ||
    deliveryEvidenceResubmission.inventoryDeductionMode !== "skipped_delivery_evidence_resubmission" ||
    deliveryEvidenceResubmission.inventoryLedgerIds?.length !== 0 ||
    deliveryEvidenceResubmission.task?.deliveryEvidenceReviewStatus !== "待复核" ||
    deliveryEvidenceResubmission.task?.deliveryEvidenceIssueReason !== "" ||
    deliveryEvidenceResubmission.task?.watermarkedPhotoAttachmentId !== "ATT-DRIVER-WM-RETAKE-1"
  ) {
    throw new Error("/api/driver/delivery-tasks/{id}/complete did not resubmit retake evidence correctly");
  }

  const driverExceptionOccurredAt = "2026-07-02T09:40:00.000Z";
  const driverException = await postJson(
    baseUrl,
    `/api/driver/delivery-tasks/${driverExceptionTask.fulfillmentId}/exception`,
    {
      fulfillmentId: driverExceptionTask.fulfillmentId,
      reasonCode: "customer_unavailable",
      reasonText: "客户不在",
      actualQty: driverExceptionTask.qty,
      operatorId: "U-DRIVER-A",
      occurredAt: driverExceptionOccurredAt,
      remark: "API skeleton driver exception check",
    },
    {
      headers: { "x-erp-user-id": "U-DRIVER-A" },
    },
  );
  if (
    driverException.status !== "送货异常" ||
    driverException.todoType !== "送货异常待处理" ||
    driverException.task?.exceptionReasonCode !== "customer_unavailable" ||
    driverException.task?.exceptionReason !== "客户不在" ||
    new Date(driverException.task?.exceptionOccurredAt).toISOString() !== driverExceptionOccurredAt ||
    !driverException.operationLogId
  ) {
    throw new Error("/api/driver/delivery-tasks/{id}/exception returned an unexpected payload");
  }

  const fulfillmentId = confirm.fulfillmentTasks[0].fulfillmentId;
  const fulfillmentException = await postJson(baseUrl, `/api/fulfillments/${fulfillmentId}/exception`, {
    fulfillmentId,
    orderLineId: confirm.orderLines[0].id,
    exceptionType: "quantity_mismatch",
    expectedQty: 10,
    actualQty: 8,
    reasonCode: "stock_shortage",
    operatorId: "U-OFFICE-A",
    occurredAt: new Date().toISOString(),
  });
  if (!fulfillmentException.todoId || fulfillmentException.status !== "数量差异待处理") {
    throw new Error("/api/fulfillments/{fulfillmentId}/exception returned an unexpected payload");
  }

  const statementCustomers = await getJson(baseUrl, "/api/statements/customers");
  const statementId = statementCustomers.items?.find((item) => item.currentReceivable > 0)?.statementId;
  if (!statementId) {
    throw new Error("/api/statements/customers did not return a payable statement");
  }

  const preview = await postJson(baseUrl, `/api/statements/${statementId}/preview`, {
    templateId: "tpl-p0-statement-customer-send",
    previewType: "customer_send",
    operatorId: "U-OFFICE-A",
  });
  if (
    preview.statementId !== statementId ||
    preview.previewType !== "customer_send" ||
    preview.templateId !== "tpl-p0-statement-customer-send" ||
    preview.templateVersion !== "p0-statement-xlsx-v1" ||
    !preview.operationLogId ||
    !preview.downloadToken ||
    typeof preview.summary?.receivable !== "number" ||
    !Array.isArray(preview.lines) ||
    preview.lines.length < 1 ||
    !preview.lines[0].statementLineId
  ) {
    throw new Error("/api/statements/{statementId}/preview returned an unexpected payload");
  }

  const exportFile = await getBinary(baseUrl, `/api/statements/${statementId}/exports/${preview.downloadToken}`);
  if (
    exportFile.contentType !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    exportFile.bytes[0] !== 0x50 ||
    exportFile.bytes[1] !== 0x4b
  ) {
    throw new Error("/api/statements/{statementId}/exports/{downloadToken} returned an unexpected XLSX workbook");
  }
  assertStatementXlsxWorkbook(exportFile.bytes, {
    templateVersion: "p0-statement-xlsx-v1",
    productName: preview.lines[0].productName,
  });

  const exportList = await getJson(baseUrl, `/api/statements/${statementId}/exports`);
  if (
    exportList.total !== 1 ||
    exportList.items?.[0]?.downloadToken !== preview.downloadToken ||
    !exportList.items?.[0]?.fileName?.endsWith(".xlsx") ||
    exportList.items?.[0]?.templateVersion !== "p0-statement-xlsx-v1" ||
    !exportList.items?.[0]?.worksheetNames?.includes("交付明细") ||
    exportList.items?.[0]?.storageProvider !== "local_fs" ||
    exportList.items?.[0]?.storageKeyStored !== true ||
    !String(exportList.items?.[0]?.contentDigest ?? "").startsWith("sha256:") ||
    !(Number(exportList.items?.[0]?.contentLength ?? 0) > 0) ||
    exportList.items?.[0]?.content
  ) {
    throw new Error("/api/statements/{statementId}/exports did not return export metadata");
  }
  if (!existsSync(join(checkStorageRoot, "statement-exports", preview.downloadToken))) {
    throw new Error("/api/statements/{statementId}/preview did not write a retained statement export object");
  }

  const deniedWarehouseExport = await getJson(
    baseUrl,
    `/api/statements/${statementId}/exports/${preview.downloadToken}`,
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehouseExport.code !== "PERMISSION_DENIED" ||
    deniedWarehouseExport.requiredPermission !== "statement.preview"
  ) {
    throw new Error("/api/statements/{statementId}/exports/{downloadToken} did not deny the warehouse seed user");
  }

  const deniedWarehouseExportList = await getJson(baseUrl, `/api/statements/${statementId}/exports`, {
    expectedStatus: 403,
    headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
  });
  if (
    deniedWarehouseExportList.code !== "PERMISSION_DENIED" ||
    deniedWarehouseExportList.requiredPermission !== "statement.preview"
  ) {
    throw new Error("/api/statements/{statementId}/exports did not deny the warehouse seed user");
  }

  const deniedWarehousePreview = await postJson(
    baseUrl,
    `/api/statements/${statementId}/preview`,
    {
      previewType: "customer_send",
      operatorId: "U-WAREHOUSE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehousePreview.code !== "PERMISSION_DENIED" ||
    deniedWarehousePreview.requiredPermission !== "statement.preview"
  ) {
    throw new Error("/api/statements/{statementId}/preview did not deny the warehouse seed user");
  }

  const markedSent = await postJson(baseUrl, `/api/statements/${statementId}/mark-sent`, {
    channel: "wechat",
    sentTo: "API skeleton check customer",
    sentAt: new Date().toISOString(),
    operatorId: "U-OFFICE-A",
    remark: "API skeleton check mark sent",
  });
  if (!markedSent.sendRecordId || markedSent.status !== "已发送" || !markedSent.operationLogId) {
    throw new Error("/api/statements/{statementId}/mark-sent returned an unexpected payload");
  }

  const receiptResult = await postJson(baseUrl, `/api/statements/${statementId}/send-receipt`, {
    sendRecordId: markedSent.sendRecordId,
    receiptStatus: "read",
    receiptAt: "2026-07-01T11:00:00.000Z",
    operatorId: "U-OFFICE-A",
    remark: "API skeleton check customer read receipt",
  });
  if (
    receiptResult.sendRecordId !== markedSent.sendRecordId ||
    receiptResult.receiptStatus !== "read" ||
    !receiptResult.operationLogId
  ) {
    throw new Error("/api/statements/{statementId}/send-receipt returned an unexpected payload");
  }

  const customerConfirmationAttachment = await postJson(baseUrl, "/api/attachments", {
    ownerType: "statement",
    ownerId: statementId,
    fileType: "image",
    purpose: "statement_customer_confirmation",
    fileName: "customer-confirmation-api-check.png",
    contentRef: "p0://statement-customer-confirmation/api-check",
    mimeType: "image/png",
    fileSize: 12,
    contentDataUrl: "data:image/png;base64,Y29uZmlybWF0aW9u",
    uploadedBy: "U-OFFICE-A",
    remark: "API skeleton check customer confirmation attachment",
  });
  if (
    !customerConfirmationAttachment.attachmentId ||
    customerConfirmationAttachment.ownerType !== "statement" ||
    customerConfirmationAttachment.ownerId !== statementId ||
    customerConfirmationAttachment.purpose !== "statement_customer_confirmation" ||
    customerConfirmationAttachment.fileName !== "customer-confirmation-api-check.png" ||
    customerConfirmationAttachment.mimeType !== "image/png" ||
    customerConfirmationAttachment.hasContent !== true ||
    customerConfirmationAttachment.status !== "uploaded"
  ) {
    throw new Error("/api/attachments did not create a customer confirmation attachment");
  }

  const customerConfirmationPdfAttachment = await postJson(baseUrl, "/api/attachments", {
    ownerType: "statement",
    ownerId: statementId,
    fileType: "pdf",
    purpose: "statement_customer_confirmation",
    fileName: "customer-confirmation-api-check.pdf",
    contentRef: "p0://statement-customer-confirmation/api-check-pdf",
    mimeType: "application/pdf",
    fileSize: 10,
    contentDataUrl: "data:application/pdf;base64,cGRmLWNoZWNr",
    uploadedBy: "U-OFFICE-A",
    remark: "API skeleton check customer confirmation PDF attachment",
  });
  if (
    !customerConfirmationPdfAttachment.attachmentId ||
    customerConfirmationPdfAttachment.fileType !== "pdf" ||
    customerConfirmationPdfAttachment.mimeType !== "application/pdf" ||
    customerConfirmationPdfAttachment.hasContent !== true
  ) {
    throw new Error("/api/attachments did not create a customer confirmation PDF attachment");
  }
  const customerConfirmationPdfContent = await getText(baseUrl, `/api/attachments/${customerConfirmationPdfAttachment.attachmentId}/content`);
  if (
    customerConfirmationPdfContent.text !== "pdf-check" ||
    !customerConfirmationPdfContent.contentType.includes("application/pdf") ||
    !customerConfirmationPdfContent.contentDisposition.includes("customer-confirmation-api-check.pdf")
  ) {
    throw new Error("/api/attachments/{attachmentId}/content did not return the customer confirmation PDF attachment");
  }

  const blockedPaymentPdfAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "statement",
      ownerId: statementId,
      fileType: "pdf",
      purpose: "payment_screenshot",
      fileName: "payment-proof-api-check.pdf",
      contentRef: `p0://payment-screenshot/${statementId}/api-check-pdf`,
      mimeType: "application/pdf",
      fileSize: 10,
      contentDataUrl: "data:application/pdf;base64,cGRmLWNoZWNr",
      uploadedBy: "U-FINANCE-A",
      remark: "API skeleton blocked payment screenshot PDF check",
    },
    {
      expectedStatus: 422,
      headers: { "x-erp-user-id": "U-FINANCE-A" },
    },
  );
  if (blockedPaymentPdfAttachment.code !== "ATTACHMENT_FILE_TYPE_NOT_ALLOWED") {
    throw new Error("/api/attachments did not reject a non-image payment screenshot");
  }

  const blockedOversizedFinishedPhoto = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "production_task",
      ownerId: "PT-ORD-0629-003-01",
      fileType: "image",
      purpose: "finished_goods_photo",
      fileName: "finished-goods-too-large.jpg",
      contentRef: "p0://production-finished-goods/PT-ORD-0629-003-01/too-large",
      mimeType: "image/jpeg",
      fileSize: 13 * 1024 * 1024,
      uploadedBy: "U-WORKSHOP-A",
      remark: "API skeleton oversized finished-goods photo check",
    },
    {
      expectedStatus: 422,
      headers: { "x-erp-user-id": "U-WORKSHOP-A" },
    },
  );
  if (blockedOversizedFinishedPhoto.code !== "ATTACHMENT_FILE_TOO_LARGE") {
    throw new Error("/api/attachments did not reject an oversized finished-goods photo");
  }

  const customerConfirmation = await postJson(baseUrl, `/api/statements/${statementId}/customer-confirmation`, {
    sendRecordId: markedSent.sendRecordId,
    confirmationType: "customer_reply",
    channel: "wechat",
    confirmedByCustomer: "API skeleton check customer",
    confirmedAt: "2026-07-01T11:10:00.000Z",
    content: "客户回复确认无误",
    attachmentIds: [customerConfirmationAttachment.attachmentId],
    operatorId: "U-OFFICE-A",
    remark: "API skeleton check customer confirmation",
  });
  if (
    customerConfirmation.sendRecordId !== markedSent.sendRecordId ||
    customerConfirmation.receiptStatus !== "confirmed" ||
    customerConfirmation.status !== "客户已确认" ||
    customerConfirmation.confirmationRecord?.content !== "客户回复确认无误" ||
    customerConfirmation.confirmationRecord?.attachmentIds?.[0] !== customerConfirmationAttachment.attachmentId ||
    !customerConfirmation.confirmationRecordId ||
    !customerConfirmation.operationLogId
  ) {
    throw new Error("/api/statements/{statementId}/customer-confirmation returned an unexpected payload");
  }

  const paymentAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "statement",
      ownerId: statementId,
      fileType: "image",
      purpose: "payment_screenshot",
      fileName: "payment-proof-api-check.png",
      contentRef: `p0://payment-screenshot/${statementId}/api-check`,
      mimeType: "image/png",
      fileSize: 17,
      contentDataUrl: "data:image/png;base64,cGF5bWVudC1wcm9vZg==",
      uploadedBy: "U-FINANCE-A",
      remark: "API skeleton payment screenshot check",
    },
    {
      headers: { "x-erp-user-id": "U-FINANCE-A" },
    },
  );
  if (
    !paymentAttachment.attachmentId ||
    paymentAttachment.ownerType !== "statement" ||
    paymentAttachment.ownerId !== statementId ||
    paymentAttachment.purpose !== "payment_screenshot" ||
    paymentAttachment.fileName !== "payment-proof-api-check.png" ||
    paymentAttachment.mimeType !== "image/png" ||
    paymentAttachment.hasContent !== true ||
    paymentAttachment.storageProvider !== "local_fs" ||
    !paymentAttachment.storageKey?.startsWith(`attachments/${paymentAttachment.attachmentId}/`) ||
    !paymentAttachment.contentDigest ||
    !paymentAttachment.url?.endsWith(`/api/attachments/${paymentAttachment.attachmentId}/content`) ||
    paymentAttachment.status !== "uploaded" ||
    !paymentAttachment.url
  ) {
    throw new Error("/api/attachments returned an unexpected payload");
  }
  const paymentAttachmentFilePath = join(checkStorageRoot, paymentAttachment.storageKey);
  if (!existsSync(paymentAttachmentFilePath)) {
    throw new Error("/api/attachments did not persist payment screenshot content to local storage");
  }
  const paymentAttachmentFileBuffer = readFileSync(paymentAttachmentFilePath);
  const paymentAttachmentDigest = createHash("sha256").update(paymentAttachmentFileBuffer).digest("hex");
  if (
    paymentAttachmentFileBuffer.toString("utf8") !== "payment-proof" ||
    paymentAttachmentDigest !== paymentAttachment.contentDigest
  ) {
    throw new Error("/api/attachments local storage content or digest is incorrect");
  }
  const paymentAttachmentRecordPath = join(checkStorageRoot, "metadata", "attachment-records.json");
  if (!existsSync(paymentAttachmentRecordPath)) {
    throw new Error("/api/attachments did not persist the attachment record index");
  }
  const paymentAttachmentRecords = JSON.parse(readFileSync(paymentAttachmentRecordPath, "utf8"));
  if (
    !paymentAttachmentRecords.attachments?.some(
      (record) =>
        record.attachmentId === paymentAttachment.attachmentId &&
        record.storageKey === paymentAttachment.storageKey &&
        record.contentDigest === paymentAttachment.contentDigest,
    ) ||
    !paymentAttachmentRecords.attachmentLinks?.some(
      (record) =>
        record.attachmentId === paymentAttachment.attachmentId &&
        record.ownerType === "statement" &&
        record.ownerId === statementId,
    )
  ) {
    throw new Error("/api/attachments did not persist attachment metadata and owner link");
  }

  const paymentAttachmentList = await getJson(
    baseUrl,
    `/api/attachments?ownerType=statement&ownerId=${encodeURIComponent(statementId)}&purpose=payment_screenshot`,
  );
  if (
    paymentAttachmentList.total < 1 ||
    !paymentAttachmentList.items?.some(
      (record) =>
        record.attachmentId === paymentAttachment.attachmentId &&
        record.storageKey === paymentAttachment.storageKey &&
        record.contentDigest === paymentAttachment.contentDigest,
    )
  ) {
    throw new Error("/api/attachments did not list the payment screenshot by owner and purpose");
  }

  const paymentAttachmentContent = await getText(baseUrl, `/api/attachments/${paymentAttachment.attachmentId}/content`);
  if (
    paymentAttachmentContent.text !== "payment-proof" ||
    !paymentAttachmentContent.contentType.includes("image/png") ||
    !paymentAttachmentContent.contentDisposition.includes("payment-proof-api-check.png")
  ) {
    throw new Error("/api/attachments/{attachmentId}/content returned an unexpected payload");
  }

  const paymentAttachmentAccessUrl = await getJson(
    baseUrl,
    `/api/attachments/${paymentAttachment.attachmentId}/access-url?ttlSeconds=120`,
  );
  if (
    paymentAttachmentAccessUrl.attachmentId !== paymentAttachment.attachmentId ||
    !paymentAttachmentAccessUrl.accessUrl?.includes(`/api/attachments/${paymentAttachment.attachmentId}/content`) ||
    !paymentAttachmentAccessUrl.accessUrl.includes("accessToken=") ||
    !paymentAttachmentAccessUrl.accessUrl.includes("expiresAt=") ||
    paymentAttachmentAccessUrl.ttlSeconds !== 120 ||
    paymentAttachmentAccessUrl.deliveryMode !== "api_proxy" ||
    paymentAttachmentAccessUrl.storageProvider !== "local_fs" ||
    !paymentAttachmentAccessUrl.operationLogId
  ) {
    throw new Error("/api/attachments/{attachmentId}/access-url returned an unexpected payload");
  }
  const signedPaymentAttachmentContent = await getText(baseUrl, paymentAttachmentAccessUrl.accessUrl, {
    headers: { "x-erp-action-permissions": "none" },
  });
  if (
    signedPaymentAttachmentContent.text !== "payment-proof" ||
    !signedPaymentAttachmentContent.contentType.includes("image/png")
  ) {
    throw new Error("/api/attachments/{attachmentId}/content did not honor the signed access URL");
  }
  const paymentAttachmentAccessLogs = await getJson(
    baseUrl,
    `/api/attachments/${paymentAttachment.attachmentId}/access-logs`,
  );
  if (
    paymentAttachmentAccessLogs.attachmentId !== paymentAttachment.attachmentId ||
    paymentAttachmentAccessLogs.total < 3 ||
    !paymentAttachmentAccessLogs.items?.some(
      (record) =>
        record.operationLogId === paymentAttachmentAccessUrl.operationLogId &&
        record.action === "attachment_access_url_created" &&
        record.operatorId === "U-OFFICE-A" &&
        record.deliveryMode === "api_proxy",
    ) ||
    !paymentAttachmentAccessLogs.items?.some(
      (record) =>
        record.action === "attachment_content_read" &&
        record.operatorId === "SIGNED_URL" &&
        record.accessMode === "signed_url",
    ) ||
    !paymentAttachmentAccessLogs.items?.some(
      (record) =>
        record.action === "attachment_content_read" &&
        record.operatorId === "U-OFFICE-A" &&
        record.accessMode === "permission",
    )
  ) {
    throw new Error("/api/attachments/{attachmentId}/access-logs did not return the expected access audit records");
  }
  const paymentAttachmentAccessLogPath = join(checkStorageRoot, "metadata", "attachment-access-logs.json");
  if (!existsSync(paymentAttachmentAccessLogPath)) {
    throw new Error("/api/attachments/{attachmentId}/access-logs did not persist the access-audit index");
  }
  const paymentAttachmentAccessLogRecords = JSON.parse(readFileSync(paymentAttachmentAccessLogPath, "utf8"));
  if (
    paymentAttachmentAccessLogRecords.attachmentAccessLogs?.filter(
      (record) => record.attachmentId === paymentAttachment.attachmentId,
    ).length < 3
  ) {
    throw new Error("/api/attachments access audit did not persist all access events");
  }

  const attachmentStorageDiagnostics = await getJson(baseUrl, "/api/attachments/storage-diagnostics");
  if (
    attachmentStorageDiagnostics.status !== "ok" ||
    attachmentStorageDiagnostics.ready !== true ||
    attachmentStorageDiagnostics.storageKind !== "local_fs" ||
    attachmentStorageDiagnostics.storageProvider !== "local_fs" ||
    attachmentStorageDiagnostics.configured !== true ||
    attachmentStorageDiagnostics.writeOk !== true ||
    attachmentStorageDiagnostics.readOk !== true ||
    attachmentStorageDiagnostics.digestOk !== true ||
    attachmentStorageDiagnostics.cleanupOk !== true ||
    attachmentStorageDiagnostics.secretFieldsExposed !== false ||
    !attachmentStorageDiagnostics.diagnosticAttachmentId?.startsWith("ATT-STORAGE-CHECK-") ||
    !attachmentStorageDiagnostics.diagnosticStorageKey?.startsWith(
      `attachments/${attachmentStorageDiagnostics.diagnosticAttachmentId}/`,
    ) ||
    !/^[a-f0-9]{64}$/.test(attachmentStorageDiagnostics.contentDigest) ||
    attachmentStorageDiagnostics.contentDigest !== attachmentStorageDiagnostics.expectedDigest ||
    attachmentStorageDiagnostics.readDigest !== attachmentStorageDiagnostics.expectedDigest
  ) {
    throw new Error("/api/attachments/storage-diagnostics returned an unexpected payload");
  }
  const attachmentStorageDiagnosticsFilePath = join(
    checkStorageRoot,
    attachmentStorageDiagnostics.diagnosticStorageKey,
  );
  if (existsSync(attachmentStorageDiagnosticsFilePath)) {
    throw new Error("/api/attachments/storage-diagnostics did not clean up the diagnostic object");
  }

  const attachmentV1Readiness = await getJson(baseUrl, "/api/attachments/v1-readiness");
  if (
    attachmentV1Readiness.status !== "blocked" ||
    attachmentV1Readiness.ready !== false ||
    attachmentV1Readiness.scope !== "v1_attachment_storage_readiness" ||
    attachmentV1Readiness.summary?.totalCount !== 5 ||
    attachmentV1Readiness.summary?.blockingCount !== 1 ||
    attachmentV1Readiness.storageMode?.storageKind !== "local_fs" ||
    attachmentV1Readiness.storageMode?.objectStorageLive !== false ||
    attachmentV1Readiness.storageMode?.localFsAcceptedForV1 !== false ||
    attachmentV1Readiness.safeguards?.nonMutating !== true ||
    attachmentV1Readiness.safeguards?.diagnosticObjectCleanedUp !== true ||
    attachmentV1Readiness.safeguards?.secretFieldsExposed !== false ||
    attachmentV1Readiness.safeguards?.requiresObjectStorageLive !== true ||
    attachmentV1Readiness.safeguards?.payloadExposed !== false ||
    attachmentV1Readiness.criteria?.find((item) => item.key === "attachment-production-retention-mode")?.status !==
      "pending"
  ) {
    throw new Error("/api/attachments/v1-readiness did not block the default local filesystem storage mode");
  }

  const expiredPaymentAttachmentContent = await getText(
    baseUrl,
    `/api/attachments/${paymentAttachment.attachmentId}/content?accessToken=expired-token&expiresAt=2020-01-01T00%3A00%3A00.000Z`,
    {
      expectedStatus: 403,
      headers: { "x-erp-action-permissions": "none" },
    },
  );
  const expiredPaymentAttachmentContentJson = JSON.parse(expiredPaymentAttachmentContent.text);
  if (expiredPaymentAttachmentContentJson.code !== "ATTACHMENT_ACCESS_TOKEN_INVALID") {
    throw new Error("/api/attachments/{attachmentId}/content did not reject an expired signed access URL");
  }
  const deniedWarehouseAttachmentContent = await getText(
    baseUrl,
    `/api/attachments/${paymentAttachment.attachmentId}/content`,
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  const deniedWarehouseAttachmentContentJson = JSON.parse(deniedWarehouseAttachmentContent.text);
  if (
    deniedWarehouseAttachmentContentJson.code !== "PERMISSION_DENIED" ||
    deniedWarehouseAttachmentContentJson.requiredPermission !== "attachment.view"
  ) {
    throw new Error("/api/attachments/{attachmentId}/content did not deny the warehouse seed user");
  }
  const deniedWarehouseAttachmentList = await getJson(
    baseUrl,
    `/api/attachments?ownerType=statement&ownerId=${encodeURIComponent(statementId)}`,
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehouseAttachmentList.code !== "PERMISSION_DENIED" ||
    deniedWarehouseAttachmentList.requiredPermission !== "attachment.view"
  ) {
    throw new Error("/api/attachments list did not deny the warehouse seed user");
  }
  const deniedWarehouseAttachmentAccessLogs = await getJson(
    baseUrl,
    `/api/attachments/${paymentAttachment.attachmentId}/access-logs`,
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehouseAttachmentAccessLogs.code !== "PERMISSION_DENIED" ||
    deniedWarehouseAttachmentAccessLogs.requiredPermission !== "attachment.view"
  ) {
    throw new Error("/api/attachments/{attachmentId}/access-logs did not deny the warehouse seed user");
  }
  const deniedWarehouseAttachmentStorageDiagnostics = await getJson(
    baseUrl,
    "/api/attachments/storage-diagnostics",
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehouseAttachmentStorageDiagnostics.code !== "PERMISSION_DENIED" ||
    deniedWarehouseAttachmentStorageDiagnostics.requiredPermission !== "attachment.view"
  ) {
    throw new Error("/api/attachments/storage-diagnostics did not deny the warehouse seed user");
  }
  const deniedWarehouseAttachmentV1Readiness = await getJson(
    baseUrl,
    "/api/attachments/v1-readiness",
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehouseAttachmentV1Readiness.code !== "PERMISSION_DENIED" ||
    deniedWarehouseAttachmentV1Readiness.requiredPermission !== "attachment.view"
  ) {
    throw new Error("/api/attachments/v1-readiness did not deny the warehouse seed user");
  }

  const deniedWarehouseAttachment = await postJson(
    baseUrl,
    "/api/attachments",
    {
      ownerType: "statement",
      ownerId: statementId,
      fileType: "image",
      purpose: "payment_screenshot",
      fileName: "warehouse-denied.png",
      contentRef: "p0://denied",
      uploadedBy: "U-WAREHOUSE-A",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehouseAttachment.code !== "PERMISSION_DENIED" ||
    deniedWarehouseAttachment.requiredPermission !== "attachment.create"
  ) {
    throw new Error("/api/attachments did not deny the warehouse seed user");
  }

  const deniedWarehousePayment = await postJson(
    baseUrl,
    `/api/statements/${statementId}/payments`,
    {
      amount: 1,
      paidAt: new Date().toISOString(),
      method: "cash",
      operatorId: "U-WAREHOUSE-A",
      remark: "API skeleton permission check",
    },
    {
      expectedStatus: 403,
      headers: { "x-erp-user-id": "U-WAREHOUSE-A" },
    },
  );
  if (
    deniedWarehousePayment.code !== "PERMISSION_DENIED" ||
    deniedWarehousePayment.requiredPermission !== "statement.payment.record"
  ) {
    throw new Error("/api/statements/{statementId}/payments did not deny the warehouse seed user");
  }

  const payment = await postJson(baseUrl, `/api/statements/${statementId}/payments`, {
    amount: 1,
    paidAt: new Date().toISOString(),
    method: "cash",
    operatorId: "U-OFFICE-A",
    attachmentIds: [paymentAttachment.attachmentId],
    remark: "API skeleton check",
  });
  if (
    !payment.payment?.paymentRecordId ||
    payment.payment.attachmentIds?.[0] !== paymentAttachment.attachmentId ||
    payment.varianceAmount <= 0 ||
    !payment.operationLogId
  ) {
    throw new Error("/api/statements/{statementId}/payments returned an unexpected payload");
  }

  const variance = await postJson(baseUrl, `/api/statements/${statementId}/variance`, {
    statementId,
    varianceAmount: payment.varianceAmount,
    handlingResult: "carry_to_debt",
    reason: "API skeleton check",
    operatorId: "U-OFFICE-A",
  });
  if (!variance.varianceRecord?.varianceRecordId || !variance.operationLogId) {
    throw new Error("/api/statements/{statementId}/variance returned an unexpected payload");
  }

  const todoId = payment.todoId ?? fulfillmentException.todoId;
  const todoHandle = await postJson(baseUrl, `/api/todos/${todoId}/handle`, {
    action: "mark_handled",
    operatorId: "U-OFFICE-A",
    handlingResult: "API skeleton check handled",
  });
  if (!todoHandle.todo?.handled || !todoHandle.operationLogId) {
    throw new Error("/api/todos/{todoId}/handle returned an unexpected payload");
  }
  if (!todoHandle.todo.todoId || !todoHandle.todo.refType || !todoHandle.todo.createdAt) {
    throw new Error("/api/todos/{todoId}/handle did not return an OpenAPI-shaped todo");
  }

  const todoReopen = await postJson(baseUrl, `/api/todos/${todoId}/handle`, {
    action: "reopen",
    operatorId: "U-OFFICE-A",
    reason: "API skeleton check reopen",
  });
  if (todoReopen.todo?.handled !== false || todoReopen.todo?.status !== "open" || !todoReopen.operationLogId) {
    throw new Error("/api/todos/{todoId}/handle did not reopen the todo");
  }

  const todoSnooze = await postJson(baseUrl, `/api/todos/${todoId}/handle`, {
    action: "snooze",
    operatorId: "U-OFFICE-A",
    reason: "稍后30分钟",
  });
  if (todoSnooze.todo?.status !== "snoozed" || !todoSnooze.operationLogId) {
    throw new Error("/api/todos/{todoId}/handle did not snooze the todo");
  }

  const todoPrintPending = await postJson(baseUrl, `/api/todos/${todoId}/handle`, {
    action: "batch_print_result_pending",
    operatorId: "U-OFFICE-A",
    reason: "部分打出",
    handlingResult: "批量打印标签：已打出 1/2，剩余待重打",
    printResultStatus: "partial",
    printedLabelCount: 1,
    pendingLabelCount: 1,
    totalLabelCount: 2,
    printedPackageIds: ["PKG-API-1"],
    pendingPackageIds: ["PKG-API-2"],
    printPackages: [
      { packageId: "PKG-API-1", packageSeq: 1, packageCount: 2, status: "printed" },
      { packageId: "PKG-API-2", packageSeq: 2, packageCount: 2, status: "not_printed" },
    ],
  });
  if (
    todoPrintPending.todo?.handled !== false ||
    todoPrintPending.todo?.printPackages?.[0]?.packageId !== "PKG-API-1" ||
    todoPrintPending.todo?.pendingPackageIds?.[0] !== "PKG-API-2" ||
    !todoPrintPending.operationLogId
  ) {
    throw new Error("/api/todos/{todoId}/handle did not keep pending print-result todo open");
  }

  const printBatchRecord = await postJson(baseUrl, "/api/print-batches", {
    printBatchId: "PB-API-CHECK-1",
    action: "批量打印标签",
    resultLabel: "部分打出",
    status: "partial",
    todoIds: [todoId],
    todoRefs: ["ORD-API-CHECK-1"],
    totalTaskCount: 1,
    totalLabelCount: 2,
    printedLabelCount: 1,
    pendingLabelCount: 1,
    printedPackageIds: ["PKG-API-1"],
    pendingPackageIds: ["PKG-API-2"],
    printPackages: [
      { packageId: "PKG-API-1", packageSeq: 1, packageCount: 2, status: "printed" },
      { packageId: "PKG-API-2", packageSeq: 2, packageCount: 2, status: "not_printed" },
    ],
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    createdAt: "今天 10:30",
  });
  if (
    printBatchRecord.printBatchRecord?.printBatchId !== "PB-API-CHECK-1" ||
    printBatchRecord.printBatchRecord?.pendingPackageIds?.[0] !== "PKG-API-2" ||
    printBatchRecord.printBatchRecord?.status !== "partial" ||
    !printBatchRecord.operationLogId
  ) {
    throw new Error("/api/print-batches did not create a traceable print batch record");
  }
  const printBatchList = await getJson(baseUrl, `/api/print-batches?todoId=${encodeURIComponent(todoId)}`);
  if (
    printBatchList.total < 1 ||
    !printBatchList.items?.some((item) => item.printBatchId === "PB-API-CHECK-1" && item.pendingPackageIds?.[0] === "PKG-API-2")
  ) {
    throw new Error("/api/print-batches did not return batch records filtered by todoId");
  }

  const writeOff = await postJson(baseUrl, `/api/statements/${statementId}/write-off`, {
    confirmReason: "API skeleton check",
    operatorId: "U-OFFICE-A",
    confirmedAt: new Date().toISOString(),
  });
  if (
    !writeOff.operationLogId ||
    typeof writeOff.receivable !== "number" ||
    typeof writeOff.received !== "number" ||
    typeof writeOff.variance !== "number" ||
    typeof writeOff.debtAmount !== "number"
  ) {
    throw new Error("/api/statements/{statementId}/write-off returned an unexpected OpenAPI-shaped payload");
  }

  const operationLogs = await getJson(baseUrl, `/api/operation-logs?targetType=statement&targetId=${statementId}`);
  if (operationLogs.total < 3) {
    throw new Error("/api/operation-logs did not return write-operation logs");
  }

  await close(server);
  server = null;
  restartedServer = createApiServer();
  await listen(restartedServer);
  const restartedBaseUrl = `http://127.0.0.1:${restartedServer.address().port}`;
  const restartedPaymentAttachmentContent = await getText(
    restartedBaseUrl,
    `/api/attachments/${paymentAttachment.attachmentId}/content`,
  );
  if (
    restartedPaymentAttachmentContent.text !== "payment-proof" ||
    !restartedPaymentAttachmentContent.contentType.includes("image/png") ||
    !restartedPaymentAttachmentContent.contentDisposition.includes("payment-proof-api-check.png")
  ) {
    throw new Error("/api/attachments/{attachmentId}/content did not survive an API server restart");
  }
  const restartedPaymentAttachmentList = await getJson(
    restartedBaseUrl,
    `/api/attachments?ownerType=statement&ownerId=${encodeURIComponent(statementId)}&purpose=payment_screenshot`,
  );
  if (
    restartedPaymentAttachmentList.total < 1 ||
    !restartedPaymentAttachmentList.items?.some((record) => record.attachmentId === paymentAttachment.attachmentId)
  ) {
    throw new Error("/api/attachments list did not survive an API server restart");
  }
  const restartedPaymentAttachmentAccessLogs = await getJson(
    restartedBaseUrl,
    `/api/attachments/${paymentAttachment.attachmentId}/access-logs`,
  );
  if (
    restartedPaymentAttachmentAccessLogs.total < 3 ||
    !restartedPaymentAttachmentAccessLogs.items?.some(
      (record) =>
        record.operationLogId === paymentAttachmentAccessUrl.operationLogId &&
        record.action === "attachment_access_url_created",
    )
  ) {
    throw new Error("/api/attachments/{attachmentId}/access-logs did not survive an API server restart");
  }
  const restartedPrintBatchList = await getJson(
    restartedBaseUrl,
    `/api/print-batches?todoId=${encodeURIComponent(todoId)}`,
  );
  if (
    restartedPrintBatchList.total < 1 ||
    !restartedPrintBatchList.items?.some(
      (item) => item.printBatchId === "PB-API-CHECK-1" && item.pendingPackageIds?.[0] === "PKG-API-2",
    )
  ) {
    throw new Error("/api/print-batches did not survive an API server restart");
  }
  const restartedPrintDevices = await getJson(restartedBaseUrl, "/api/print-devices?documentType=express_ltl_label");
  if (
    restartedPrintDevices.total < 1 ||
    !restartedPrintDevices.items?.some(
      (device) => device.printDeviceId === "PRN-API-CHECK-1" && device.paperWidthMm === 76,
    )
  ) {
    throw new Error("/api/print-devices did not survive an API server restart");
  }
  const restartedPrintJobs = await getJson(
    restartedBaseUrl,
    `/api/print-jobs?printRecordId=${encodeURIComponent(printFulfillment.printRecord.printRecordId)}`,
  );
  if (
    restartedPrintJobs.total < 2 ||
    !restartedPrintJobs.items?.some((job) => job.printJobId === retryPrintJob.printJob.printJobId && job.attemptNo === 2)
  ) {
    throw new Error("/api/print-jobs did not survive an API server restart");
  }

  console.log(`API skeleton check passed on ${baseUrl}`);
} finally {
  await close(server);
  await close(restartedServer);
  await close(readinessServer);
}

async function checkPositivePrintDriverReadiness() {
  const readinessStorageRoot = join(checkStorageRoot, "print-readiness-positive");
  const readinessSpoolDir = join(readinessStorageRoot, "print-command-bridge-spool");
  rmSync(readinessStorageRoot, { recursive: true, force: true });
  mkdirSync(readinessSpoolDir, { recursive: true });
  readinessServer = createApiServer({
    printDeviceRepositoryOptions: { storageRoot: readinessStorageRoot },
    printerDeviceFieldTestRepositoryOptions: { storageRoot: readinessStorageRoot },
    printDriverAdapterOptions: {
      systemPrinterEnabled: true,
      systemPrinterAdapterKind: "command_bridge",
      systemPrinterCommand: process.execPath,
      systemPrinterCommandArgs: [
        printCommandBridgeScript,
        "--storage-root",
        readinessStorageRoot,
        "--cups-status-command",
        process.execPath,
        "--cups-status-args-json",
        JSON.stringify([fakeCupsStatusScript, "--printer", "{cupsPrinterName}"]),
      ],
      commandBridgeSpoolDir: readinessSpoolDir,
      allowedPrinterNames: ["PRN-LABEL-A", "PRN-DOT-A", "标签机A", "针式打印机A"],
    },
  });
  await listen(readinessServer);
  const baseUrl = `http://127.0.0.1:${readinessServer.address().port}`;
  const labelDevices = await getJson(baseUrl, "/api/print-devices?documentType=express_ltl_label");
  const labelDevice = labelDevices.items?.find((device) => device.printDeviceId === "PRN-LABEL-A");
  const dotDevices = await getJson(baseUrl, "/api/print-devices?documentType=delivery_note");
  const dotDevice = dotDevices.items?.find((device) => device.printDeviceId === "PRN-DOT-A");
  if (!labelDevice || !dotDevice) {
    throw new Error("Positive print readiness setup did not load default print devices");
  }
  await postJson(baseUrl, "/api/print-devices", {
    ...labelDevice,
    settings: { ...(labelDevice.settings ?? {}), driverMode: "system_printer" },
    operatorId: "U-OFFICE-A",
  });
  await postJson(baseUrl, "/api/print-devices", {
    ...dotDevice,
    settings: { ...(dotDevice.settings ?? {}), driverMode: "system_printer" },
    operatorId: "U-OFFICE-A",
  });
  await postJson(baseUrl, "/api/print-devices/PRN-LABEL-A/field-tests", buildPassedPrinterDeviceFieldTest({
    recordId: "PDQA-READY-LABEL-A",
    printDeviceId: "PRN-LABEL-A",
    documentType: "express_ltl_label",
    deviceLabel: "标签机A",
    driverLabel: "Generic 203dpi Label",
    paperLabel: "80x60 热敏标签",
  }));
  await postJson(baseUrl, "/api/print-devices/PRN-DOT-A/field-tests", buildPassedPrinterDeviceFieldTest({
    recordId: "PDQA-READY-DOT-A",
    printDeviceId: "PRN-DOT-A",
    documentType: "delivery_note",
    deviceLabel: "针式打印机A",
    driverLabel: "Generic Dot Matrix",
    paperLabel: "连续二联针式纸",
  }));
  const readiness = await getJson(baseUrl, "/api/print-driver/v1-readiness");
  if (
    readiness.status !== "ready" ||
    readiness.ready !== true ||
    readiness.summary?.blockingCount !== 0 ||
    readiness.spoolDiagnostics?.ready !== true ||
    readiness.cupsDiagnostics?.ready !== true ||
    !readiness.criteria?.some((item) => item.key === "cups-queue-preflight" && item.status === "passed") ||
    readiness.deviceReadiness?.length !== 2 ||
    !readiness.deviceReadiness.every((item) => item.ready === true) ||
    !readiness.criteria?.every((item) => item.status === "passed") ||
    readiness.safeguards?.physicalPrinterCalled !== false ||
    JSON.stringify(readiness).includes(readinessSpoolDir) ||
    JSON.stringify(readiness).includes(process.execPath)
  ) {
    throw new Error("/api/print-driver/v1-readiness did not return a positive ready result under configured test settings");
  }
  const cupsDiagnostics = await getJson(baseUrl, "/api/print-driver/cups-diagnostics");
  if (
    cupsDiagnostics.status !== "ok" ||
    cupsDiagnostics.ready !== true ||
    cupsDiagnostics.scope !== "non_printing_cups_queue_preflight" ||
    cupsDiagnostics.cupsPrinterAllowed !== true ||
    cupsDiagnostics.cupsStatusCommandRunnable !== true ||
    cupsDiagnostics.safeguards?.nonPrinting !== true ||
    cupsDiagnostics.safeguards?.physicalPrinterCalled !== false ||
    cupsDiagnostics.safeguards?.printFileCreated !== false ||
    JSON.stringify(cupsDiagnostics).includes(readinessStorageRoot) ||
    JSON.stringify(cupsDiagnostics).includes(process.execPath) ||
    JSON.stringify(cupsDiagnostics).includes(fakeCupsStatusScript)
  ) {
    throw new Error("/api/print-driver/cups-diagnostics did not return a redacted positive ready result");
  }
}

function buildPassedPrinterDeviceFieldTest({
  recordId,
  printDeviceId,
  documentType,
  deviceLabel,
  driverLabel,
  paperLabel,
}) {
  return {
    recordId,
    printDeviceId,
    documentType,
    operatorId: "U-OFFICE-A",
    operatorName: "办公室A",
    checkedAt: "2026-07-04T10:00:00.000Z",
    deviceLabel,
    driverLabel,
    paperLabel,
    checks: [
      { key: "sample_print", status: "passed" },
      { key: "paper_alignment", status: "passed" },
      { key: "barcode_scan", status: "passed" },
      { key: "driver_callback", status: "passed" },
      { key: "legibility", status: "passed" },
      { key: "void_reprint", status: "passed" },
    ],
    evidence: {
      samplePrintReference: `${recordId} 样张已出纸且纸张对位通过`,
      barcodeScanText: `${printDeviceId}-SAMPLE-CODE 可扫码`,
      driverCallbackStatus: "spool completed -> printed",
      voidReprintReference: `${recordId}-VOID-REPRINT 作废后重打通过`,
      operatorAcceptance: "办公室A 现场签认",
    },
    note: "Positive V1 print readiness check",
  };
}

async function getJson(baseUrl, route, options = {}) {
  const expectedStatus = options.expectedStatus ?? 200;
  const response = await fetch(`${baseUrl}${route}`, {
    headers: options.headers ?? {},
  });
  const json = await readJson(response);
  if (response.status !== expectedStatus) {
    throw new Error(`${route} returned HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  if (expectedStatus < 400 && !response.ok) {
    throw new Error(`${route} returned HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function getText(baseUrl, route, options = {}) {
  const expectedStatus = options.expectedStatus ?? 200;
  const response = await fetch(`${baseUrl}${route}`, {
    headers: options.headers ?? {},
  });
  const text = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(`${route} returned HTTP ${response.status}: ${text}`);
  }
  if (expectedStatus < 400 && !response.ok) {
    throw new Error(`${route} returned HTTP ${response.status}: ${text}`);
  }
  return {
    text,
    contentType: response.headers.get("content-type") ?? "",
    contentDisposition: response.headers.get("content-disposition") ?? "",
  };
}

async function getBinary(baseUrl, route, options = {}) {
  const expectedStatus = options.expectedStatus ?? 200;
  const response = await fetch(`${baseUrl}${route}`, {
    headers: options.headers ?? {},
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (response.status !== expectedStatus) {
    throw new Error(`${route} returned HTTP ${response.status}: ${new TextDecoder().decode(bytes)}`);
  }
  if (expectedStatus < 400 && !response.ok) {
    throw new Error(`${route} returned HTTP ${response.status}: ${new TextDecoder().decode(bytes)}`);
  }
  return {
    bytes,
    contentType: response.headers.get("content-type") ?? "",
    contentDisposition: response.headers.get("content-disposition") ?? "",
  };
}

async function postJson(baseUrl, route, body, options = {}) {
  const expectedStatus = options.expectedStatus ?? 200;
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    body: JSON.stringify(body),
  });
  const json = await readJson(response);
  if (response.status !== expectedStatus) {
    throw new Error(`${route} returned HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  if (expectedStatus < 400 && !response.ok) {
    throw new Error(`${route} returned HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function patchJson(baseUrl, route, body, options = {}) {
  const expectedStatus = options.expectedStatus ?? 200;
  const response = await fetch(`${baseUrl}${route}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    body: JSON.stringify(body),
  });
  const json = await readJson(response);
  if (response.status !== expectedStatus) {
    throw new Error(`${route} returned HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  if (expectedStatus < 400 && !response.ok) {
    throw new Error(`${route} returned HTTP ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  if (!server || !server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
