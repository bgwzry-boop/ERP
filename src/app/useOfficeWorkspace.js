import { useEffect, useRef, useState } from "react";
import { useOfficeCoreReads } from "./useOfficeCoreReads.js";
import { useOfficeFulfillmentWrites } from "./useOfficeFulfillmentWrites.js";
import { useOfficeInventoryDetailReads } from "./useOfficeInventoryDetailReads.js";
import { useOfficeInventoryWrites } from "./useOfficeInventoryWrites.js";
import { useOfficeMasterDataReads } from "./useOfficeMasterDataReads.js";
import { useOfficeOrderWrites } from "./useOfficeOrderWrites.js";
import { useOfficePrintReads } from "./useOfficePrintReads.js";
import { useOfficePrintWrites } from "./useOfficePrintWrites.js";
import { useOfficeProductionReads } from "./useOfficeProductionReads.js";
import { useOfficeProductionWrites } from "./useOfficeProductionWrites.js";
import { useOfficeRoleToolReads } from "./useOfficeRoleToolReads.js";
import { useOfficeStatementReads } from "./useOfficeStatementReads.js";
import { useOfficeV1StatusReads } from "./useOfficeV1StatusReads.js";
import { buildPackingTaskId } from "../services/officeProductionPackingApiClient.js";
import {
  createPrinterDeviceFieldTestChecks,
  createPrinterDeviceFieldTestEvidence,
} from "../services/printerDeviceFieldTestClient.js";
import { buildLocalDriverDeliveryTasks } from "../services/driverMobileApiClient.js";
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
}) {
  const [todos, setTodos] = useState(initialTodos);
  const [todoMeta, setTodoMeta] = useState({
    source: "local",
    total: initialTodos.length,
    loading: false,
    error: "",
    lastSyncedAt: "",
  });
  const [printBatchRecords, setPrintBatchRecords] = useState([]);
  const [selectedTodoId, setSelectedTodoId] = useState(defaultSelections.todoId);
  const [todoView, setTodoView] = useState("未处理");

  const [orderLines, setOrderLines] = useState(initialOrderLines);
  const [orderPoolMeta, setOrderPoolMeta] = useState({
    source: "local",
    total: initialOrderLines.length,
    loading: false,
    error: "",
    lastSyncedAt: "",
    detailSource: "local",
    detailLoading: false,
    detailError: "",
  });
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [entryText, setEntryText] = useState(sampleText);
  const [draftRows, setDraftRows] = useState(() =>
    parseOrderText(sampleText, { customers, inventories: initialInventories }),
  );
  const [draftStatus, setDraftStatus] = useState("已识别待确认");
  const [draftApiMeta, setDraftApiMeta] = useState({ draftId: "", clientRevision: 0, source: "local" });
  const [selectedDraftId, setSelectedDraftId] = useState("DRAFT-1-1");
  const [orderFilters, setOrderFilters] = useState(defaultOrderFilters);
  const [selectedOrderId, setSelectedOrderId] = useState(defaultSelections.orderId);

  const [inventoryRecords, setInventoryRecords] = useState(initialInventories);
  const [inventoryMeta, setInventoryMeta] = useState({
    source: "local",
    total: initialInventories.length,
    loading: false,
    error: "",
    lastSyncedAt: "",
  });
  const [inventoryLedgerState, setInventoryLedgerState] = useState({
    source: "local",
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
    source: "local",
    items: [],
    total: 0,
    loading: false,
    confirmingId: "",
    error: "",
    lastSyncedAt: "",
    filters: { status: "待确认生效" },
  });
  const [selectedStockId, setSelectedStockId] = useState(defaultSelections.stockId);

  const [fulfillmentTab, setFulfillmentTab] = useState("全部");
  const [fulfillments, setFulfillments] = useState(initialFulfillments);
  const [fulfillmentMeta, setFulfillmentMeta] = useState({
    source: "local",
    total: initialFulfillments.length,
    loading: false,
    error: "",
    lastSyncedAt: "",
  });
  const [selectedFulfillmentId, setSelectedFulfillmentId] = useState(defaultSelections.fulfillmentId);

  const [productionPacking, setProductionPacking] = useState(() =>
    createInitialProductionPackingState(initialOrderLines, { buildPackingTaskId }),
  );
  const [productionPackingFocus, setProductionPackingFocus] = useState(null);
  const [productionPackingDetailState, setProductionPackingDetailState] = useState({
    source: "local",
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

  const [driverDeliveryTasks, setDriverDeliveryTasks] = useState(() =>
    buildLocalDriverDeliveryTasks({
      fulfillments: initialFulfillments,
      orderLines: initialOrderLines,
      customers,
      driverId: "U-DRIVER-A",
    }),
  );
  const [driverDeliveryMeta, setDriverDeliveryMeta] = useState({
    source: "local",
    total: initialFulfillments.filter((item) => item.method === "送货").length,
    loading: false,
    error: "",
    lastSyncedAt: "",
  });
  const [selectedDriverTaskId, setSelectedDriverTaskId] = useState("F002");

  const [statements, setStatements] = useState(initialStatements);
  const [selectedStatementId, setSelectedStatementId] = useState(defaultSelections.statementId);
  const [statementReadMeta, setStatementReadMeta] = useState({
    source: "local",
    total: initialStatements.length,
    loading: false,
    error: "",
    lastSyncedAt: "",
    detailSource: "local",
    detailLoading: false,
    detailError: "",
    detailLastSyncedAt: "",
  });

  const [masterDataPrecheckState, setMasterDataPrecheckState] = useState({ status: "idle" });
  const [masterDataImportReviewDrafts, setMasterDataImportReviewDrafts] = useState([]);
  const [masterDataImportConfirmationPlans, setMasterDataImportConfirmationPlans] = useState([]);
  const [masterDataImportExecutions, setMasterDataImportExecutions] = useState([]);
  const [masterDataEmployeeAccountReviews, setMasterDataEmployeeAccountReviews] = useState([]);
  const [lastIssuedEmployeeCredential, setLastIssuedEmployeeCredential] = useState(null);
  const [masterDataMaintenanceDrafts, setMasterDataMaintenanceDrafts] = useState([]);
  const [masterDataMaintenanceTab, setMasterDataMaintenanceTab] = useState("客户档案");
  const [selectedMasterDataId, setSelectedMasterDataId] = useState("C001");

  const [rawMaterialInbounds, setRawMaterialInbounds] = useState(initialRawMaterialInbounds);
  const [rawMaterialInboundMeta, setRawMaterialInboundMeta] = useState({
    source: "local",
    total: initialRawMaterialInbounds.length,
    loading: false,
    error: "",
    lastSyncedAt: "",
  });
  const [rawMaterialSupplierStatementReviews, setRawMaterialSupplierStatementReviews] = useState([]);
  const [rawMaterialSupplierStatementReviewMeta, setRawMaterialSupplierStatementReviewMeta] = useState({
    source: "local",
    total: 0,
    loading: false,
    error: "",
    lastSyncedAt: "",
  });
  const [selectedRawMaterialInboundId, setSelectedRawMaterialInboundId] = useState(
    defaultSelections.rawMaterialInboundId,
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

  const todosRef = useRef(initialTodos);
  const orderLinesRef = useRef(initialOrderLines);
  const inventoryRecordsRef = useRef(initialInventories);
  const fulfillmentsRef = useRef(initialFulfillments);
  const productionPackingRef = useRef(productionPacking);
  const rawMaterialInboundsRef = useRef(initialRawMaterialInbounds);
  const selectedRawMaterialInboundIdRef = useRef(defaultSelections.rawMaterialInboundId);
  const rawMaterialSupplierStatementReviewsRef = useRef([]);
  const statementsRef = useRef(initialStatements);
  const selectedStatementIdRef = useRef(defaultSelections.statementId);
  const inventoryCorrectionDraftsRef = useRef([]);
  const inventoryLedgerEntriesRef = useRef([]);
  const masterDataImportReviewDraftsRef = useRef([]);
  const masterDataEmployeeAccountReviewsRef = useRef([]);
  const selectedStockIdRef = useRef(defaultSelections.stockId);
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
    refreshInventoryRecords: coreReads.refreshInventoryRecords,
    refreshTodos: coreReads.refreshTodos,
    selectedStockIdRef,
    setInventoryCorrectionDrafts,
    setInventoryCorrectionQueueState,
    setSelectedStockId,
  });
  const masterDataReads = useOfficeMasterDataReads({
    authState,
    currentUserId,
    masterDataEmployeeAccountReviewsRef,
    masterDataImportReviewDraftsRef,
    permissionContext: authState?.permissions ?? {},
    setMasterDataEmployeeAccountReviews,
    setMasterDataImportReviewDrafts,
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
    setFulfillments,
    setInventoryRecords,
    setOrderLines,
    setSelectedDraftId,
    setSelectedOrderId,
    setSelectedTodoId,
    setStatements,
    setTodos,
  });

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
    lastIssuedEmployeeCredential, setLastIssuedEmployeeCredential,
    masterDataMaintenanceDrafts, setMasterDataMaintenanceDrafts,
    masterDataMaintenanceTab, setMasterDataMaintenanceTab,
    selectedMasterDataId, setSelectedMasterDataId,
    rawMaterialInbounds, setRawMaterialInbounds, rawMaterialInboundMeta, setRawMaterialInboundMeta,
    rawMaterialSupplierStatementReviews, setRawMaterialSupplierStatementReviews,
    rawMaterialSupplierStatementReviewMeta, setRawMaterialSupplierStatementReviewMeta,
    selectedRawMaterialInboundId, setSelectedRawMaterialInboundId,
    v1GoLiveStatusState, setV1GoLiveStatusState,
    v1FieldEvidenceDraftAction, setV1FieldEvidenceDraftAction,
    v1FieldEvidenceValidationAction, setV1FieldEvidenceValidationAction,
    v1FieldEvidenceStageRowAction, setV1FieldEvidenceStageRowAction,
    v1FieldEvidenceAttachmentAction, setV1FieldEvidenceAttachmentAction,
    v1FieldEvidenceAttachmentListAction, setV1FieldEvidenceAttachmentListAction,
    v1SignoffBoundaryAttachmentAction, setV1SignoffBoundaryAttachmentAction,
    v1SignoffBoundaryAttachmentListAction, setV1SignoffBoundaryAttachmentListAction,
    v1ProductionEnvPrecheckAction, setV1ProductionEnvPrecheckAction,
    v1ProductionEnvSetupAction, setV1ProductionEnvSetupAction,
    v1ProductionEnvIntakePrecheckAction, setV1ProductionEnvIntakePrecheckAction,
    v1ProductionEnvFileAuditPrecheckAction, setV1ProductionEnvFileAuditPrecheckAction,
    v1ProductionEnvFilePreviewPrecheckAction, setV1ProductionEnvFilePreviewPrecheckAction,
    v1ProductionGoLivePrecheckAction, setV1ProductionGoLivePrecheckAction,
    v1ProductionPersistenceEvidenceAction, setV1ProductionPersistenceEvidenceAction,
    v1ProductionFirstStageExecutionAction, setV1ProductionFirstStageExecutionAction,
    v1ProductionFirstStageValuesDryRunAction, setV1ProductionFirstStageValuesDryRunAction,
    v1ProductionFirstStageValuesApplyAction, setV1ProductionFirstStageValuesApplyAction,
    v1PersistencePrecheckAction, setV1PersistencePrecheckAction,
    v1AttachmentRetentionPrecheckAction, setV1AttachmentRetentionPrecheckAction,
    v1PrintSpoolPrecheckAction, setV1PrintSpoolPrecheckAction,
    v1PrintCupsPrecheckAction, setV1PrintCupsPrecheckAction,
    v1PrintReadinessPrecheckAction, setV1PrintReadinessPrecheckAction,
    v1DriverReadinessPrecheckAction, setV1DriverReadinessPrecheckAction,
    v1RuntimeReadinessPrecheckAction, setV1RuntimeReadinessPrecheckAction,
    v1V2BoundaryPrecheckAction, setV1V2BoundaryPrecheckAction,
    v1V2ScopeBriefRefreshAction, setV1V2ScopeBriefRefreshAction,
    v1ReleaseCandidateRefreshPrecheckAction, setV1ReleaseCandidateRefreshPrecheckAction,
    v1ReleaseCandidateRefreshAction, setV1ReleaseCandidateRefreshAction,
    todosRef, orderLinesRef, inventoryRecordsRef, fulfillmentsRef, productionPackingRef, rawMaterialInboundsRef,
    rawMaterialSupplierStatementReviewsRef, inventoryCorrectionDraftsRef, inventoryLedgerEntriesRef,
    selectedStockIdRef, inventoryLedgerFiltersRef, printerDeviceQaSelectedIdRef, printerDeviceQaRef,
    printBatchRecordsRef, printJobQueueItemsRef, paymentAttachmentSyncKeysRef, customerConfirmationAttachmentSyncKeysRef,
  };
}
