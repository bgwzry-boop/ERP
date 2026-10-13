import { useCallback, useEffect, useRef, useState } from "react";
import { useOfficeCoreReads } from "./useOfficeCoreReads.js";
import { useOfficeFulfillmentWrites } from "./useOfficeFulfillmentWrites.js";
import { useOfficeInventoryDetailReads } from "./useOfficeInventoryDetailReads.js";
import { useOfficeInventoryWrites } from "./useOfficeInventoryWrites.js";
import { useOfficeMasterDataReads } from "./useOfficeMasterDataReads.js";
import { useOfficeMasterDataEntryRefresh } from "./useOfficeMasterDataEntryRefresh.js";
import { useOfficeOrderWrites } from "./useOfficeOrderWrites.js";
import { useOfficePrintReads } from "./useOfficePrintReads.js";
import { useOfficePrintWrites } from "./useOfficePrintWrites.js";
import { useOfficeProductionReads } from "./useOfficeProductionReads.js";
import { useOfficeProductionWrites } from "./useOfficeProductionWrites.js";
import { useOfficeRoleToolReads } from "./useOfficeRoleToolReads.js";
import { useOfficeStatementReads } from "./useOfficeStatementReads.js";
import { useOfficeV1StatusReads } from "./useOfficeV1StatusReads.js";
import { buildPackingTaskId } from "../services/officeProductionPackingSelectors.js";
import {
  createPrinterDeviceFieldTestChecks,
  createPrinterDeviceFieldTestEvidence,
} from "../services/printerDeviceFieldTestClient.js";
import { parseOrderText } from "../lib/orderParser.js";
import { defaultOrderFilters } from "../domain/officeRules.js";
import {
  createInitialProductionPackingState,
} from "../state/officeProductionPackingState.js";
import {
  createInitialPrintDriverConfigState,
  createInitialPrintDriverCupsDiagnosticsState,
  createInitialPrintDriverReadinessState,
  createInitialPrintJobQueueState,
  createInitialPrinterDeviceQaState,
} from "../state/officePrintState.js";

const defaultInventoryLedgerFilters = {
  keyword: "",
  changeType: "全部",
  sourceType: "全部",
  dateFrom: "",
  dateTo: "",
};

function createAsyncActionState() {
  return {
    loading: false,
    error: "",
    result: null,
    lastSyncedAt: "",
  };
}

function createAsyncOwnerActionState() {
  return {
    ...createAsyncActionState(),
    ownerId: "",
  };
}

function createGoLiveStatusState() {
  return {
    source: "unavailable",
    statusData: null,
    loading: false,
    error: "",
    lastSyncedAt: "",
    lastSuccessfulAt: "",
    lastAttemptedAt: "",
  };
}

export function useOfficeWorkspace({
  activePage,
  authState,
  customers,
  currentUser,
  currentUserId,
  defaultSelections,
  initialFulfillments,
  initialInventories,
  initialOrderLines,
  initialRawMaterialInbounds,
  initialStatements,
  initialTodos,
  sampleText,
  serverRequired = false,
}) {
  const isSharedServerRequired = useCallback(() => serverRequired, [serverRequired]);
  const initialWorkspaceRecords = serverRequired
    ? { fulfillments: [], inventories: [], orderLines: [], rawMaterialInbounds: [], statements: [], todos: [] }
    : {
        fulfillments: initialFulfillments,
        inventories: initialInventories,
        orderLines: initialOrderLines,
        rawMaterialInbounds: initialRawMaterialInbounds,
        statements: initialStatements,
        todos: initialTodos,
      };
  const initialEntryText = serverRequired ? "" : sampleText;
  const initialSource = serverRequired ? "idle" : "local";
  const initialSelections = serverRequired ? {} : defaultSelections;
  const [todos, setTodos] = useState(initialWorkspaceRecords.todos);
  const [todoMeta, setTodoMeta] = useState({
    source: initialSource,
    total: initialWorkspaceRecords.todos.length,
    reminderPolicy: null,
    loading: false,
    error: "",
    lastSyncedAt: "",
  });
  const [printBatchRecords, setPrintBatchRecords] = useState([]);
  const [selectedTodoId, setSelectedTodoId] = useState(initialSelections.todoId ?? "");
  const [todoView, setTodoView] = useState("未处理");

  const [orderLines, setOrderLines] = useState(initialWorkspaceRecords.orderLines);
  const [orderPoolMeta, setOrderPoolMeta] = useState({
    source: initialSource,
    total: initialWorkspaceRecords.orderLines.length,
    loading: false,
    error: "",
    lastSyncedAt: "",
    detailSource: initialSource,
    detailLoading: false,
    detailError: "",
  });
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [entryText, setEntryText] = useState(initialEntryText);
  const [draftRows, setDraftRows] = useState(() =>
    parseOrderText(initialEntryText, { customers, inventories: initialWorkspaceRecords.inventories }),
  );
  const [draftStatus, setDraftStatus] = useState(serverRequired ? "待录入" : "已识别待确认");
  const [draftApiMeta, setDraftApiMeta] = useState({ draftId: "", clientRevision: 0, source: initialSource });
  const [selectedDraftId, setSelectedDraftId] = useState(serverRequired ? "" : "DRAFT-2-1");
  const [orderFilters, setOrderFilters] = useState(defaultOrderFilters);
  const [selectedOrderId, setSelectedOrderId] = useState(initialSelections.orderId ?? "");

  const [inventoryRecords, setInventoryRecords] = useState(initialWorkspaceRecords.inventories);
  const [inventoryMeta, setInventoryMeta] = useState({
    source: initialSource,
    total: initialWorkspaceRecords.inventories.length,
    loading: false,
    error: "",
    lastSyncedAt: "",
  });
  const [inventoryLedgerState, setInventoryLedgerState] = useState({
    source: initialSource,
    items: [],
    total: 0,
    loading: false,
    error: "",
    lastSyncedAt: "",
    filters: defaultInventoryLedgerFilters,
  });
  const [inventoryLedgerFilters, setInventoryLedgerFilters] = useState(defaultInventoryLedgerFilters);
  const [inventoryCorrectionDetailState, setInventoryCorrectionDetailState] = useState({
    source: "idle",
    detail: null,
    requestedId: "",
    loading: false,
    error: "",
    lastSyncedAt: "",
  });
  const [inventoryCorrectionDrafts, setInventoryCorrectionDrafts] = useState([]);
  const [inventoryCorrectionQueueState, setInventoryCorrectionQueueState] = useState({
    source: initialSource,
    items: [],
    total: 0,
    loading: false,
    confirmingId: "",
    error: "",
    lastSyncedAt: "",
    filters: { status: "待确认生效" },
  });
  const [inventoryIntentState, setInventoryIntentState] = useState({
    source: initialSource,
    items: [],
    holds: [],
    loading: false,
    mutatingId: "",
    error: "",
    lastSyncedAt: "",
  });
  const [selectedStockId, setSelectedStockId] = useState(initialSelections.stockId ?? "");

  const [fulfillmentTab, setFulfillmentTab] = useState("全部");
  const [fulfillments, setFulfillments] = useState(initialWorkspaceRecords.fulfillments);
  const [fulfillmentMeta, setFulfillmentMeta] = useState({
    source: initialSource,
    total: initialWorkspaceRecords.fulfillments.length,
    loading: false,
    error: "",
    lastSyncedAt: "",
  });
  const [selectedFulfillmentId, setSelectedFulfillmentId] = useState(initialSelections.fulfillmentId ?? "");

  const [productionPacking, setProductionPacking] = useState(() =>
    createInitialProductionPackingState(initialWorkspaceRecords.orderLines, { buildPackingTaskId }),
  );
  const [productionPackingFocus, setProductionPackingFocus] = useState(null);
  const [productionPackingDetailState, setProductionPackingDetailState] = useState({
    source: initialSource,
    detail: null,
    requestedType: "",
    requestedId: "",
    loading: false,
    error: "",
    lastSyncedAt: "",
  });

  const [printerDeviceQa, setPrinterDeviceQa] = useState(() =>
    createInitialPrinterDeviceQaState({
      createChecks: createPrinterDeviceFieldTestChecks,
      createEvidence: createPrinterDeviceFieldTestEvidence,
    }),
  );
  const [printJobQueue, setPrintJobQueue] = useState(createInitialPrintJobQueueState);
  const [printDriverConfig, setPrintDriverConfig] = useState(createInitialPrintDriverConfigState);
  const [printDriverReadiness, setPrintDriverReadiness] = useState(createInitialPrintDriverReadinessState);
  const [printDriverCupsDiagnostics, setPrintDriverCupsDiagnostics] = useState(
    createInitialPrintDriverCupsDiagnosticsState,
  );

  const [driverDeliveryTasks, setDriverDeliveryTasks] = useState([]);
  const [driverDeliveryMeta, setDriverDeliveryMeta] = useState({
    source: initialSource,
    total: initialWorkspaceRecords.fulfillments.filter((item) => item.method === "送货").length,
    loading: false,
    error: "",
    lastSyncedAt: "",
  });
  const [selectedDriverTaskId, setSelectedDriverTaskId] = useState(serverRequired ? "" : "F002");

  const [statements, setStatements] = useState(initialWorkspaceRecords.statements);
  const [selectedStatementId, setSelectedStatementId] = useState(initialSelections.statementId ?? "");
  const [statementReadMeta, setStatementReadMeta] = useState({
    source: initialSource,
    total: initialWorkspaceRecords.statements.length,
    loading: false,
    error: "",
    lastSyncedAt: "",
    detailSource: initialSource,
    detailLoading: false,
    detailError: "",
    detailLastSyncedAt: "",
  });

  const [masterDataPrecheckState, setMasterDataPrecheckState] = useState({ status: "idle" });
  const [masterDataImportReviewDrafts, setMasterDataImportReviewDrafts] = useState([]);
  const [masterDataImportConfirmationPlans, setMasterDataImportConfirmationPlans] = useState([]);
  const [masterDataImportExecutions, setMasterDataImportExecutions] = useState([]);
  const [masterDataEmployeeAccountReviews, setMasterDataEmployeeAccountReviews] = useState([]);
  const [masterDataEmployeeAccountReadiness, setMasterDataEmployeeAccountReadiness] = useState(null);
  const [masterDataEmployeeAssignmentOptions, setMasterDataEmployeeAssignmentOptions] = useState({ workshops: [], machines: [], allMachines: [] });
  const [lastIssuedEmployeeCredential, setLastIssuedEmployeeCredential] = useState(null);
  const [masterDataMaintenanceDrafts, setMasterDataMaintenanceDrafts] = useState([]);
  const [masterDataMaintenanceTab, setMasterDataMaintenanceTab] = useState("客户档案");
  const [selectedMasterDataId, setSelectedMasterDataId] = useState(serverRequired ? "" : "C001");

  const [rawMaterialInbounds, setRawMaterialInbounds] = useState(initialWorkspaceRecords.rawMaterialInbounds);
  const [rawMaterialInboundMeta, setRawMaterialInboundMeta] = useState({
    source: initialSource,
    total: initialWorkspaceRecords.rawMaterialInbounds.length,
    loading: false,
    error: "",
    lastSyncedAt: "",
  });
  const [rawMaterialSupplierStatementReviews, setRawMaterialSupplierStatementReviews] = useState([]);
  const [rawMaterialSupplierStatementReviewMeta, setRawMaterialSupplierStatementReviewMeta] = useState({
    source: initialSource,
    total: 0,
    loading: false,
    error: "",
    lastSyncedAt: "",
  });
  const [selectedRawMaterialInboundId, setSelectedRawMaterialInboundId] = useState(
    initialSelections.rawMaterialInboundId ?? "",
  );

  const [v1GoLiveStatusState, setV1GoLiveStatusState] = useState(createGoLiveStatusState);
  const [v1FieldEvidenceDraftAction, setV1FieldEvidenceDraftAction] = useState(createAsyncActionState);
  const [v1FieldEvidenceValidationAction, setV1FieldEvidenceValidationAction] = useState(createAsyncActionState);
  const [v1FieldEvidenceStageRowAction, setV1FieldEvidenceStageRowAction] = useState(createAsyncActionState);
  const [v1FieldEvidenceAttachmentAction, setV1FieldEvidenceAttachmentAction] = useState(createAsyncActionState);
  const [v1FieldEvidenceAttachmentListAction, setV1FieldEvidenceAttachmentListAction] = useState(
    createAsyncOwnerActionState,
  );
  const [v1SignoffBoundaryAttachmentAction, setV1SignoffBoundaryAttachmentAction] = useState(
    createAsyncActionState,
  );
  const [v1SignoffBoundaryAttachmentListAction, setV1SignoffBoundaryAttachmentListAction] = useState(
    createAsyncOwnerActionState,
  );
  const [v1ProductionEnvPrecheckAction, setV1ProductionEnvPrecheckAction] = useState(createAsyncActionState);
  const [v1ProductionEnvSetupAction, setV1ProductionEnvSetupAction] = useState(createAsyncActionState);
  const [v1ProductionEnvIntakePrecheckAction, setV1ProductionEnvIntakePrecheckAction] = useState(
    createAsyncActionState,
  );
  const [v1ProductionEnvFileAuditPrecheckAction, setV1ProductionEnvFileAuditPrecheckAction] = useState(
    createAsyncActionState,
  );
  const [v1ProductionEnvFilePreviewPrecheckAction, setV1ProductionEnvFilePreviewPrecheckAction] = useState(
    createAsyncActionState,
  );
  const [v1ProductionGoLivePrecheckAction, setV1ProductionGoLivePrecheckAction] = useState(
    createAsyncActionState,
  );
  const [v1ProductionPersistenceEvidenceAction, setV1ProductionPersistenceEvidenceAction] = useState(
    createAsyncActionState,
  );
  const [v1ProductionFirstStageExecutionAction, setV1ProductionFirstStageExecutionAction] = useState(
    createAsyncActionState,
  );
  const [v1ProductionFirstStageValuesDryRunAction, setV1ProductionFirstStageValuesDryRunAction] = useState(
    createAsyncActionState,
  );
  const [v1ProductionFirstStageValuesApplyAction, setV1ProductionFirstStageValuesApplyAction] = useState(
    createAsyncActionState,
  );
  const [v1PersistencePrecheckAction, setV1PersistencePrecheckAction] = useState(createAsyncActionState);
  const [v1AttachmentRetentionPrecheckAction, setV1AttachmentRetentionPrecheckAction] = useState(
    createAsyncActionState,
  );
  const [v1PrintSpoolPrecheckAction, setV1PrintSpoolPrecheckAction] = useState(createAsyncActionState);
  const [v1PrintCupsPrecheckAction, setV1PrintCupsPrecheckAction] = useState(createAsyncActionState);
  const [v1PrintReadinessPrecheckAction, setV1PrintReadinessPrecheckAction] = useState(createAsyncActionState);
  const [v1DriverReadinessPrecheckAction, setV1DriverReadinessPrecheckAction] = useState(createAsyncActionState);
  const [v1RuntimeReadinessPrecheckAction, setV1RuntimeReadinessPrecheckAction] = useState(createAsyncActionState);
  const [v1V2BoundaryPrecheckAction, setV1V2BoundaryPrecheckAction] = useState(createAsyncActionState);
  const [v1V2ScopeBriefRefreshAction, setV1V2ScopeBriefRefreshAction] = useState(createAsyncActionState);
  const [v1ReleaseCandidateRefreshPrecheckAction, setV1ReleaseCandidateRefreshPrecheckAction] = useState(
    createAsyncActionState,
  );
  const [v1ReleaseCandidateRefreshAction, setV1ReleaseCandidateRefreshAction] = useState(createAsyncActionState);

  const todosRef = useRef(initialWorkspaceRecords.todos);
  const orderLinesRef = useRef(initialWorkspaceRecords.orderLines);
  const inventoryRecordsRef = useRef(initialWorkspaceRecords.inventories);
  const fulfillmentsRef = useRef(initialWorkspaceRecords.fulfillments);
  const productionPackingRef = useRef(productionPacking);
  const rawMaterialInboundsRef = useRef(initialWorkspaceRecords.rawMaterialInbounds);
  const selectedRawMaterialInboundIdRef = useRef(initialSelections.rawMaterialInboundId ?? "");
  const rawMaterialSupplierStatementReviewsRef = useRef([]);
  const statementsRef = useRef(initialWorkspaceRecords.statements);
  const selectedStatementIdRef = useRef(initialSelections.statementId ?? "");
  const inventoryCorrectionDraftsRef = useRef([]);
  const inventoryLedgerEntriesRef = useRef([]);
  const masterDataImportReviewDraftsRef = useRef([]);
  const masterDataEmployeeAccountReviewsRef = useRef([]);
  const selectedStockIdRef = useRef(initialSelections.stockId ?? "");
  const inventoryLedgerFiltersRef = useRef(defaultInventoryLedgerFilters);
  const printerDeviceQaSelectedIdRef = useRef("");
  const printerDeviceQaRef = useRef(printerDeviceQa);
  const printBatchRecordsRef = useRef([]);
  const printJobQueueItemsRef = useRef([]);
  const paymentAttachmentSyncKeysRef = useRef(new Set());
  const customerConfirmationAttachmentSyncKeysRef = useRef(new Set());

  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);
  useEffect(() => {
    orderLinesRef.current = orderLines;
  }, [orderLines]);
  useEffect(() => {
    inventoryRecordsRef.current = inventoryRecords;
  }, [inventoryRecords]);
  useEffect(() => {
    fulfillmentsRef.current = fulfillments;
  }, [fulfillments]);
  useEffect(() => {
    productionPackingRef.current = productionPacking;
  }, [productionPacking]);
  useEffect(() => {
    rawMaterialInboundsRef.current = rawMaterialInbounds;
  }, [rawMaterialInbounds]);
  useEffect(() => {
    selectedRawMaterialInboundIdRef.current = selectedRawMaterialInboundId;
  }, [selectedRawMaterialInboundId]);
  useEffect(() => {
    rawMaterialSupplierStatementReviewsRef.current = rawMaterialSupplierStatementReviews;
  }, [rawMaterialSupplierStatementReviews]);
  useEffect(() => {
    statementsRef.current = statements;
  }, [statements]);
  useEffect(() => {
    selectedStatementIdRef.current = selectedStatementId;
  }, [selectedStatementId]);
  useEffect(() => {
    inventoryCorrectionDraftsRef.current = inventoryCorrectionDrafts;
  }, [inventoryCorrectionDrafts]);
  useEffect(() => {
    inventoryLedgerEntriesRef.current = inventoryLedgerState.items;
  }, [inventoryLedgerState.items]);
  useEffect(() => {
    masterDataImportReviewDraftsRef.current = masterDataImportReviewDrafts;
  }, [masterDataImportReviewDrafts]);
  useEffect(() => {
    masterDataEmployeeAccountReviewsRef.current = masterDataEmployeeAccountReviews;
  }, [masterDataEmployeeAccountReviews]);
  useEffect(() => {
    selectedStockIdRef.current = selectedStockId;
  }, [selectedStockId]);
  useEffect(() => {
    inventoryLedgerFiltersRef.current = inventoryLedgerFilters;
  }, [inventoryLedgerFilters]);
  useEffect(() => {
    printerDeviceQaSelectedIdRef.current = printerDeviceQa.selectedDeviceId;
  }, [printerDeviceQa.selectedDeviceId]);
  useEffect(() => {
    printerDeviceQaRef.current = printerDeviceQa;
  }, [printerDeviceQa]);
  useEffect(() => {
    printBatchRecordsRef.current = printBatchRecords;
  }, [printBatchRecords]);
  useEffect(() => {
    printJobQueueItemsRef.current = printJobQueue.items;
  }, [printJobQueue.items]);

  const coreReads = useOfficeCoreReads({
    authState,
    currentUserId,
    todosRef,
    orderLinesRef,
    inventoryRecordsRef,
    selectedStockIdRef,
    fulfillmentsRef,
    setTodos,
    setSelectedTodoId,
    setTodoMeta,
    setOrderLines,
    setSelectedOrderId,
    setOrderPoolMeta,
    setInventoryRecords,
    setSelectedStockId,
    setInventoryMeta,
    setFulfillments,
    setFulfillmentMeta,
    setSelectedFulfillmentId,
  });
  const roleToolReads = useOfficeRoleToolReads({
    authState,
    currentUserId,
    customers,
    fulfillmentsRef,
    orderLinesRef,
    rawMaterialInboundsRef,
    selectedRawMaterialInboundIdRef,
    serverRequired: isSharedServerRequired,
    setDriverDeliveryTasks,
    setSelectedDriverTaskId,
    setDriverDeliveryMeta,
    setRawMaterialInbounds,
    setSelectedRawMaterialInboundId,
    setRawMaterialInboundMeta,
    setRawMaterialSupplierStatementReviews,
    setRawMaterialSupplierStatementReviewMeta,
  });
  const productionReads = useOfficeProductionReads({
    activePage,
    authState,
    currentUser,
    currentUserId,
    orderLinesRef,
    setProductionPacking,
  });
  const printReads = useOfficePrintReads({
    authState,
    currentUserId,
    printerDeviceQaSelectedIdRef,
    printJobQueueItemsRef,
    setPrintDriverConfig,
    setPrintDriverCupsDiagnostics,
    setPrintDriverReadiness,
    setPrinterDeviceQa,
    setPrintJobQueue,
  });
  const printWrites = useOfficePrintWrites({
    authState,
    currentUserDisplayName: currentUser?.displayName ?? currentUserId,
    currentUserId,
    fulfillmentsRef,
    printerDeviceQaRef,
    printBatchRecordsRef,
    refreshFulfillments: coreReads.refreshFulfillments,
    refreshOfficePrintJobQueue: printReads.refreshOfficePrintJobQueue,
    refreshPrinterDeviceQa: printReads.refreshPrinterDeviceQa,
    refreshPrintDriverReadiness: printReads.refreshPrintDriverReadiness,
    refreshTodos: coreReads.refreshTodos,
    setFulfillments,
    setPrinterDeviceQa,
    setPrintBatchRecords,
    setPrintJobQueue,
    setSelectedTodoId,
    setTodos,
    todosRef,
  });
  const inventoryDetailReads = useOfficeInventoryDetailReads({
    authState,
    currentUserId,
    inventoryCorrectionDraftsRef,
    inventoryLedgerEntriesRef,
    inventoryLedgerFiltersRef,
    selectedStockIdRef,
    setInventoryCorrectionDrafts,
    setInventoryCorrectionDetailState,
    setInventoryCorrectionQueueState,
    setInventoryIntentState,
    setInventoryLedgerState,
  });
  const inventoryWrites = useOfficeInventoryWrites({
    authState,
    currentUserDisplayName: currentUser?.displayName ?? currentUserId,
    currentUserId,
    inventoryCorrectionDraftsRef,
    loadInventoryCorrectionDetail: inventoryDetailReads.loadInventoryCorrectionDetail,
    refreshInventoryCorrectionQueue: inventoryDetailReads.refreshInventoryCorrectionQueue,
    refreshInventoryLedgerEntries: inventoryDetailReads.refreshInventoryLedgerEntries,
    refreshInventoryIntents: inventoryDetailReads.refreshInventoryIntents,
    refreshInventoryRecords: coreReads.refreshInventoryRecords,
    refreshTodos: coreReads.refreshTodos,
    selectedStockIdRef,
    setInventoryCorrectionDrafts,
    setInventoryCorrectionQueueState,
    setInventoryIntentState,
    setSelectedStockId,
  });
  const masterDataReads = useOfficeMasterDataReads({
    authState,
    currentUserId,
    masterDataEmployeeAccountReviewsRef,
    masterDataImportReviewDraftsRef,
    permissionContext: authState?.permissions ?? {},
    setMasterDataEmployeeAccountReviews,
    setMasterDataEmployeeAccountReadiness,
    setMasterDataEmployeeAssignmentOptions,
    setMasterDataImportReviewDrafts,
  });
  useOfficeMasterDataEntryRefresh({
    activePage,
    authState,
    currentUserId,
    refreshEmployeeAccountReviews: masterDataReads.refreshMasterDataEmployeeAccountReviews,
    refreshImportReviewDrafts: masterDataReads.refreshMasterDataImportReviewDrafts,
  });
  const statementReads = useOfficeStatementReads({
    authState,
    currentUserId,
    selectedStatementIdRef,
    statementsRef,
    setSelectedStatementId,
    setStatementReadMeta,
    setStatements,
  });
  const v1StatusReads = useOfficeV1StatusReads({
    authState,
    currentUserId,
    setV1GoLiveStatusState,
  });
  const fulfillmentWrites = useOfficeFulfillmentWrites({
    authState,
    currentUserDisplayName: currentUser?.displayName ?? currentUserId,
    currentUserId,
    fulfillmentsRef,
    refreshFulfillments: coreReads.refreshFulfillments,
    refreshInventoryRecords: coreReads.refreshInventoryRecords,
    refreshStatements: statementReads.refreshStatements,
    refreshTodos: coreReads.refreshTodos,
    setFulfillments,
    setSelectedTodoId,
    setTodos,
    todosRef,
  });
  const productionWrites = useOfficeProductionWrites({
    authState,
    currentUserDisplayName: currentUser?.displayName ?? currentUserId,
    currentUserId,
    customers,
    fulfillmentsRef,
    inventoryRecordsRef,
    orderLinesRef,
    productionPackingRef,
    refreshFulfillments: coreReads.refreshFulfillments,
    refreshInventoryRecords: coreReads.refreshInventoryRecords,
    refreshOrderPool: coreReads.refreshOrderPool,
    refreshProductionPackingTaskLists: productionReads.refreshProductionPackingTaskLists,
    refreshTodos: coreReads.refreshTodos,
    setFulfillments,
    setInventoryRecords,
    setOrderLines,
    setProductionPacking,
    setSelectedTodoId,
    setTodos,
    todosRef,
  });
  const orderWrites = useOfficeOrderWrites({
    authState,
    currentUserId,
    customers,
    draftApiMeta,
    draftRows,
    entryText,
    fulfillments,
    inventoryRecords,
    orderLines,
    selectedDraftId,
    refreshFulfillments: coreReads.refreshFulfillments,
    refreshInventoryRecords: coreReads.refreshInventoryRecords,
    refreshOrderPool: coreReads.refreshOrderPool,
    refreshTodos: coreReads.refreshTodos,
    setDraftApiMeta,
    setDraftRows,
    setDraftStatus,
    setEntryText,
    setFulfillments,
    setInventoryRecords,
    setOrderLines,
    setSelectedDraftId,
    setSelectedOrderId,
    setSelectedTodoId,
    setStatements,
    setTodos,
  });

  const v1StatusRouteState = {
    goLiveMeta: v1GoLiveStatusState,
    goLiveStatus: v1GoLiveStatusState.statusData,
    fieldEvidenceDraftAction: v1FieldEvidenceDraftAction,
    fieldEvidenceValidationAction: v1FieldEvidenceValidationAction,
    fieldEvidenceStageRowAction: v1FieldEvidenceStageRowAction,
    fieldEvidenceAttachmentAction: v1FieldEvidenceAttachmentAction,
    fieldEvidenceAttachmentListAction: v1FieldEvidenceAttachmentListAction,
    signoffBoundaryAttachmentAction: v1SignoffBoundaryAttachmentAction,
    signoffBoundaryAttachmentListAction: v1SignoffBoundaryAttachmentListAction,
    productionEnvPrecheckAction: v1ProductionEnvPrecheckAction,
    productionEnvSetupAction: v1ProductionEnvSetupAction,
    productionEnvIntakePrecheckAction: v1ProductionEnvIntakePrecheckAction,
    productionEnvFileAuditPrecheckAction: v1ProductionEnvFileAuditPrecheckAction,
    productionEnvFilePreviewPrecheckAction: v1ProductionEnvFilePreviewPrecheckAction,
    productionGoLivePrecheckAction: v1ProductionGoLivePrecheckAction,
    productionPersistenceEvidenceAction: v1ProductionPersistenceEvidenceAction,
    productionFirstStageExecutionAction: v1ProductionFirstStageExecutionAction,
    productionFirstStageValuesDryRunAction: v1ProductionFirstStageValuesDryRunAction,
    productionFirstStageValuesApplyAction: v1ProductionFirstStageValuesApplyAction,
    persistencePrecheckAction: v1PersistencePrecheckAction,
    attachmentRetentionPrecheckAction: v1AttachmentRetentionPrecheckAction,
    printSpoolPrecheckAction: v1PrintSpoolPrecheckAction,
    printCupsPrecheckAction: v1PrintCupsPrecheckAction,
    printReadinessPrecheckAction: v1PrintReadinessPrecheckAction,
    driverReadinessPrecheckAction: v1DriverReadinessPrecheckAction,
    runtimeReadinessPrecheckAction: v1RuntimeReadinessPrecheckAction,
    v1V2BoundaryPrecheckAction: v1V2BoundaryPrecheckAction,
    v1V2ScopeBriefRefreshAction: v1V2ScopeBriefRefreshAction,
    releaseCandidateRefreshPrecheckAction: v1ReleaseCandidateRefreshPrecheckAction,
    releaseCandidateRefreshAction: v1ReleaseCandidateRefreshAction,
  };
  const v1StatusActionSetters = {
    attachmentRetentionPrecheck: setV1AttachmentRetentionPrecheckAction,
    driverReadinessPrecheck: setV1DriverReadinessPrecheckAction,
    fieldEvidenceAttachment: setV1FieldEvidenceAttachmentAction,
    fieldEvidenceAttachmentList: setV1FieldEvidenceAttachmentListAction,
    fieldEvidenceDraft: setV1FieldEvidenceDraftAction,
    fieldEvidenceStageRow: setV1FieldEvidenceStageRowAction,
    fieldEvidenceValidation: setV1FieldEvidenceValidationAction,
    persistencePrecheck: setV1PersistencePrecheckAction,
    printCupsPrecheck: setV1PrintCupsPrecheckAction,
    printReadinessPrecheck: setV1PrintReadinessPrecheckAction,
    printSpoolPrecheck: setV1PrintSpoolPrecheckAction,
    productionEnvFileAuditPrecheck: setV1ProductionEnvFileAuditPrecheckAction,
    productionEnvFilePreviewPrecheck: setV1ProductionEnvFilePreviewPrecheckAction,
    productionEnvIntakePrecheck: setV1ProductionEnvIntakePrecheckAction,
    productionEnvPrecheck: setV1ProductionEnvPrecheckAction,
    productionEnvSetup: setV1ProductionEnvSetupAction,
    productionFirstStageExecution: setV1ProductionFirstStageExecutionAction,
    productionFirstStageValuesApply: setV1ProductionFirstStageValuesApplyAction,
    productionFirstStageValuesDryRun: setV1ProductionFirstStageValuesDryRunAction,
    productionGoLivePrecheck: setV1ProductionGoLivePrecheckAction,
    productionPersistenceEvidence: setV1ProductionPersistenceEvidenceAction,
    releaseCandidateRefresh: setV1ReleaseCandidateRefreshAction,
    releaseCandidateRefreshPrecheck: setV1ReleaseCandidateRefreshPrecheckAction,
    runtimeReadinessPrecheck: setV1RuntimeReadinessPrecheckAction,
    signoffBoundaryAttachment: setV1SignoffBoundaryAttachmentAction,
    signoffBoundaryAttachmentList: setV1SignoffBoundaryAttachmentListAction,
    v1V2BoundaryPrecheck: setV1V2BoundaryPrecheckAction,
    v1V2ScopeBriefRefresh: setV1V2ScopeBriefRefreshAction,
  };

  return {
    ...coreReads,
    ...roleToolReads,
    ...productionReads,
    ...printReads,
    ...printWrites,
    ...inventoryDetailReads,
    ...inventoryWrites,
    ...masterDataReads,
    ...statementReads,
    ...v1StatusReads,
    ...fulfillmentWrites,
    ...productionWrites,
    ...orderWrites,
    todos, setTodos, todoMeta, setTodoMeta, printBatchRecords, setPrintBatchRecords,
    selectedTodoId, setSelectedTodoId, todoView, setTodoView,
    orderLines, setOrderLines, orderPoolMeta, setOrderPoolMeta,
    selectedOrderDetail, setSelectedOrderDetail, entryText, setEntryText,
    draftRows, setDraftRows, draftStatus, setDraftStatus, draftApiMeta, setDraftApiMeta,
    selectedDraftId, setSelectedDraftId, orderFilters, setOrderFilters,
    selectedOrderId, setSelectedOrderId,
    inventoryRecords, setInventoryRecords, inventoryMeta, setInventoryMeta,
    inventoryLedgerState, setInventoryLedgerState, inventoryLedgerFilters, setInventoryLedgerFilters,
    inventoryCorrectionDetailState, setInventoryCorrectionDetailState,
    inventoryCorrectionDrafts, setInventoryCorrectionDrafts,
    inventoryCorrectionQueueState, setInventoryCorrectionQueueState,
    inventoryIntentState, setInventoryIntentState,
    selectedStockId, setSelectedStockId,
    fulfillmentTab, setFulfillmentTab, fulfillments, setFulfillments, fulfillmentMeta, setFulfillmentMeta,
    selectedFulfillmentId, setSelectedFulfillmentId,
    productionPacking, setProductionPacking, productionPackingFocus, setProductionPackingFocus,
    productionPackingDetailState, setProductionPackingDetailState,
    printerDeviceQa, setPrinterDeviceQa, printJobQueue, setPrintJobQueue,
    printDriverConfig, setPrintDriverConfig, printDriverReadiness, setPrintDriverReadiness,
    printDriverCupsDiagnostics, setPrintDriverCupsDiagnostics,
    driverDeliveryTasks, setDriverDeliveryTasks, driverDeliveryMeta, setDriverDeliveryMeta,
    selectedDriverTaskId, setSelectedDriverTaskId,
    statements, setStatements, selectedStatementId, setSelectedStatementId,
    statementReadMeta, setStatementReadMeta,
    masterDataPrecheckState, setMasterDataPrecheckState,
    masterDataImportReviewDrafts, setMasterDataImportReviewDrafts,
    masterDataImportConfirmationPlans, setMasterDataImportConfirmationPlans,
    masterDataImportExecutions, setMasterDataImportExecutions,
    masterDataEmployeeAccountReviews, setMasterDataEmployeeAccountReviews,
    masterDataEmployeeAccountReadiness, setMasterDataEmployeeAccountReadiness,
    masterDataEmployeeAssignmentOptions, setMasterDataEmployeeAssignmentOptions,
    lastIssuedEmployeeCredential, setLastIssuedEmployeeCredential,
    masterDataMaintenanceDrafts, setMasterDataMaintenanceDrafts,
    masterDataMaintenanceTab, setMasterDataMaintenanceTab,
    selectedMasterDataId, setSelectedMasterDataId,
    rawMaterialInbounds, setRawMaterialInbounds, rawMaterialInboundMeta, setRawMaterialInboundMeta,
    rawMaterialSupplierStatementReviews, setRawMaterialSupplierStatementReviews,
    rawMaterialSupplierStatementReviewMeta, setRawMaterialSupplierStatementReviewMeta,
    selectedRawMaterialInboundId, setSelectedRawMaterialInboundId,
    v1StatusRouteState, v1StatusActionSetters,
    todosRef, orderLinesRef, inventoryRecordsRef, fulfillmentsRef, productionPackingRef, rawMaterialInboundsRef,
    rawMaterialSupplierStatementReviewsRef, inventoryCorrectionDraftsRef, inventoryLedgerEntriesRef,
    selectedStockIdRef, inventoryLedgerFiltersRef, printerDeviceQaSelectedIdRef, printerDeviceQaRef,
    printBatchRecordsRef, printJobQueueItemsRef, paymentAttachmentSyncKeysRef, customerConfirmationAttachmentSyncKeysRef,
  };
}
