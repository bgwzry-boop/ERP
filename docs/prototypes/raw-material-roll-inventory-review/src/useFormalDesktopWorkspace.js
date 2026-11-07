import { mergeRawMaterialCurrentInbound } from "../../../../shared/rawMaterialCurrentInbound.js";
import { readCompleteCollection, createReadGenerationGuard } from "./read-complete-collection.js";
import { UNLOADED_READ, beginRead, finishRead, invalidateRead, workspaceReadDependencies } from "./formal-workspace-read-state.js";
import { useReceivingData } from "./useReceivingData.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirmInApp } from "../../../../src/shared/ui/confirmDialog.js";
import { initializeSeedAuth } from "../../../../src/services/officeAuthService.js";
import { listOfficeTodos } from "../../../../src/services/officeTodoApiClient.js";
import { listOfficeDraftQueue, recognizeOfficeDraft, saveOfficeDraft, confirmOfficeDraftViaApi, previewOfficeDraftSplit, confirmOfficeDraftSplit } from "../../../../src/services/officeOrderApiClient.js";
import { listOfficeOrderLines } from "../../../../src/services/officeOrderPoolApiClient.js";
import { listOfficeInventoryItems } from "../../../../src/services/officeInventoryApiClient.js";
import { listOfficeFulfillments } from "../../../../src/services/officeFulfillmentApiClient.js";
import { listOfficeStatementCustomers } from "../../../../src/services/officeStatementApiClient.js";
import {
  confirmOfficeRawMaterialSupplierPayment,
  confirmOfficeRawMaterialSupplierStatement,
  confirmOfficeRawMaterialSupplierStatementReview,
  createOfficeRawMaterialSupplierStatementReviewDraft,
  generateOfficeRawMaterialSupplierPayableDraft,
  listOfficeRawMaterialInbounds,
  listOfficeRawMaterialSupplierStatementReviews,
  recognizeOfficeRawMaterialDeliveryNote,
  updateOfficeRawMaterialInboundAction,
} from "../../../../src/services/officeRawMaterialApiClient.js";
import {
  listOfficeProductionTasks,
  listOfficePackingTasks,
} from "../../../../src/services/officeProductionPackingApiClient.js";
import { listOfficePrintJobs } from "../../../../src/services/officePrintJobApiClient.js";
import { listOfficePrintDevices } from "../../../../src/services/officePrinterDeviceApiClient.js";
import {
  confirmOfficeMasterDataEmployeeIdentity,
  enableOfficeMasterDataEmployeeAccount,
  issueOfficeMasterDataEmployeeAccountPassword,
  listOfficeMasterDataEmployeeAccountReviews,
  listOfficeMasterDataMachines,
  updateOfficeMasterDataEmployeeProfile,
} from "../../../../src/services/officeMasterDataImportApiClient.js";
import { prepareRawMaterialDeliveryNoteFile } from "../../../../src/services/rawMaterialDeliveryNoteImageClient.js";
import { assertRawMaterialDeliveryNotePageCapacity } from "../../../../src/features/raw-materials/rawMaterialInboundPageActions.js";
import { precheckRawMaterialSupplierStatementWorkbook } from "../../../../src/domain/rawMaterialSupplierStatementImport.js";

const operatorId = "U-MANAGER-A";
const readOptions = Object.freeze({ serverRequired: true });
const authOptions = Object.freeze({
  defaultUserId: operatorId,
  serverRequired: false,
  stagingAuthBypass: true,
});

const emptyData = Object.freeze({
  todos: [],
  orderDrafts: [],
  orderLines: [],
  inventoryItems: [],
  fulfillments: [],
  statements: [],
  rawMaterialInbounds: [],
  supplierStatementReviews: [],
  productionTasks: [],
  packingTasks: [],
  printJobs: [],
  printDevices: [],
  employeeAccountReviews: [],
  machines: [],
});

const readDefinitions = Object.freeze({
  todos: (authState, params = {}) => listOfficeTodos({ authState, operatorId, status: "all", pageSize: 50, ...params, ...(params.filters || {}), localTodos: [] }, readOptions),
  orderDrafts: (authState, params = {}) => listOfficeDraftQueue({ authState, operatorId, pageSize: 50, ...params, inventories: [] }, readOptions),
  orderLines: (authState, params = {}) => listOfficeOrderLines({ authState, operatorId, pageSize: 50, includeHistory: false, ...params, localOrderLines: [] }, readOptions),
  inventoryItems: (authState, params = {}) => listOfficeInventoryItems({ authState, operatorId, pageSize: 50, ...params, localInventoryRecords: [] }, readOptions),
  fulfillments: (authState, params = {}) => listOfficeFulfillments({ authState, operatorId, pageSize: 50, ...params, localFulfillments: [] }, readOptions),
  statements: (authState, params = {}) => listOfficeStatementCustomers({ authState, operatorId, pageSize: 50, ...params, localStatements: [] }, readOptions),
  rawMaterialInbounds: (authState, params = {}) => listOfficeRawMaterialInbounds({ authState, operatorId, pageSize: 50, ...params, localInbounds: [] }, readOptions),
  supplierStatementReviews: (authState, params = {}) => listOfficeRawMaterialSupplierStatementReviews({ authState, operatorId, pageSize: 50, ...params }, readOptions),
  productionTasks: (authState, params = {}) => listOfficeProductionTasks({ authState, operatorId, query: { pageSize: 50, ...params, ...(params.filters || {}) } }, readOptions),
  packingTasks: (authState, params = {}) => listOfficePackingTasks({ authState, operatorId, query: { pageSize: 50, ...params, ...(params.filters || {}) } }, readOptions),
  printJobs: (authState, params = {}) => listOfficePrintJobs({ authState, operatorId, query: { pageSize: 50, ...params, ...(params.filters || {}) }, localPrintJobs: [] }, readOptions),
  printDevices: (authState, params = {}) => listOfficePrintDevices({ authState, operatorId, query: { pageSize: 50, ...params, ...(params.filters || {}) }, localPrintDevices: [] }, readOptions),
  employeeAccountReviews: (authState, params = {}) => listOfficeMasterDataEmployeeAccountReviews({ authState, operatorId, pageSize: 50, ...params, localReviews: [] }, readOptions),
  machines: (authState, params = {}) => listOfficeMasterDataMachines({ authState, operatorId, pageSize: 50, ...params }, readOptions),
});


function resultError(result, label) {
  if (result?.source === "api") return "";
  return result?.error?.message || `${label}未从正式接口读取。`;
}

function replaceEmployeeReview(items, review) {
  if (!review?.employeeId) return items;
  return items.map((item) => item.employeeId === review.employeeId ? review : item);
}

export function useFormalDesktopWorkspace() {
  const [authState, setAuthState] = useState(null);
  const [entryDraftId, focusOrderDraft] = useState("");
  const [entryCreationId, setEntryCreationId] = useState(0);
  const [entryWriteGuard, setEntryWriteGuard] = useState({ pending: false, ownerKey: "", session: "" });
  const [orderEntryEditorBlocked, setOrderEntryEditorBlocked] = useState(false);
  const entryEditor = useRef(null);
  const newOrderPromptOpen = useRef(false);
  const orderEntryWritePending = entryWriteGuard.pending && entryWriteGuard.session === authState?.session?.accessToken;
  const registerOrderEntryEditor = useCallback((editor) => {
    entryEditor.current = editor;
    setOrderEntryEditorBlocked(editor.blocked);
    return () => {
      if (entryEditor.current !== editor) return;
      entryEditor.current = null;
      setOrderEntryEditorBlocked(false);
    };
  }, []);
  const startNewOrderDraft = useCallback(async () => {
    const editor = entryEditor.current;
    if (orderEntryWritePending || editor?.blocked || newOrderPromptOpen.current) return false;
    if (editor?.dirty) {
      newOrderPromptOpen.current = true;
      try {
        const discard = await confirmInApp({
          title: "放弃当前修改？",
          message: "当前订单还有未保存的内容。放弃这些修改并新建订单？",
          cancelLabel: "继续编辑",
          confirmLabel: "放弃并新建",
          tone: "danger",
        });
        if (!discard || entryEditor.current !== editor) return false;
      } finally {
        newOrderPromptOpen.current = false;
      }
    }
    focusOrderDraft("");
    setEntryCreationId(current => current + 1);
    return true;
  }, [orderEntryWritePending]);
  const setOrderEntryWritePending = useCallback((pending, ownerKey) => {
    if (!ownerKey) return;
    setEntryWriteGuard(current => pending
      ? { pending: true, ownerKey, session: authStateRef.current?.session?.accessToken || "" }
      : current.ownerKey === ownerKey ? { pending: false, ownerKey: "", session: "" } : current);
  }, []);
  const authStateRef = useRef(null);
  const [data, setData] = useState(emptyData);
  const [activeView, setActiveViewState] = useState("");
  const activeViewRef = useRef("");
  const [collections, setCollections] = useState({});
  const collectionsRef = useRef({});
  const pendingReads = useRef(new Map());
  const setActiveView = useCallback(navId => {
    activeViewRef.current = navId;
    setActiveViewState(navId);
  }, []);
  const updateCollectionState = useCallback((key, next) => {
    collectionsRef.current = { ...collectionsRef.current, [key]: next };
    setCollections(collectionsRef.current);
  }, []);
  const receiptReader = useReceivingData({ authState, active: activeView === "material-receiving", operatorId });
  const { acceptInbound, lookupInbound, getDetailState } = receiptReader;
  const { refreshReceipts } = receiptReader.actions;

  const live = useRef(false);
  const readGuard = useRef(createReadGenerationGuard());
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const readCollection = useCallback((key, session = authStateRef.current, { reusePending = false } = {}) => {
    if (!readDefinitions[key] || !session?.authenticated || !session?.session?.accessToken) {
      return Promise.resolve({ source: "api_error", blocked: true, error: { message: "正式接口身份验证未通过。" } });
    }
    const token = session.session.accessToken;
    const pendingKey = `${token}:${key}`;
    if (reusePending && pendingReads.current.has(pendingKey)) return pendingReads.current.get(pendingKey);
    const generation = readGuard.current.begin(key);
    updateCollectionState(key, beginRead(collectionsRef.current[key]));
    const promise = (async () => {
      const isCurrent = () => live.current && readGuard.current.current(key, generation)
        && token === authStateRef.current?.session?.accessToken;
      const result = await readCompleteCollection(params => readDefinitions[key](session, params), { isCurrent });
      if (!isCurrent()) return { source: "superseded" };
      // A failed refresh does not erase the last complete, successful snapshot.
      if (result.source === "api" && !result.blocked) setData(current => ({ ...current, [key]: result.items }));
      updateCollectionState(key, finishRead(collectionsRef.current[key], result));
      return result;
    })();
    pendingReads.current.set(pendingKey, promise);
    void promise.finally(() => { if (pendingReads.current.get(pendingKey) === promise) pendingReads.current.delete(pendingKey); });
    return promise;
  }, [updateCollectionState]);

  const refreshAll = useCallback(async (requestedAuthState) => {
    const nextAuthState = requestedAuthState?.authenticated ? requestedAuthState : authStateRef.current;
    if (!nextAuthState?.authenticated || !nextAuthState?.session?.accessToken) {
      return { source: "api_error", blocked: true };
    }
    const keys = workspaceReadDependencies[activeViewRef.current] || [];
    const entries = await Promise.all(keys.map(async key => [key, await readCollection(key, nextAuthState)]));
    if (activeViewRef.current === "material-receiving") entries.push(["receiving", await refreshReceipts()]);
    const errors = Object.fromEntries(entries.filter(([, value]) => value.source !== "superseded" && resultError(value, "列表")).map(([key, value]) => [key, resultError(value, key)]));
    return { source: Object.keys(errors).length ? "api_partial" : "api", errors };
  }, [readCollection, refreshReceipts]);

  const ensureSearchData = useCallback(() => Promise.all(["orderLines", "statements"].map(key => {
    const state = collectionsRef.current[key];
    return state?.hasLoaded && !state.stale ? { source: "api" } : readCollection(key, authStateRef.current, { reusePending: true });
  })), [readCollection]);
  useEffect(() => {
    if (!authState?.authenticated) return;
    // Each page owns its dependency reads; no background full-ERP timer.
    for (const key of workspaceReadDependencies[activeView] || []) void readCollection(key, authStateRef.current, { reusePending: true });
  }, [activeView, authState?.session?.accessToken, authState?.authenticated, readCollection]);

  useEffect(() => {
    let active = true;
    void initializeSeedAuth(authOptions).then((nextAuthState) => {
      if (!active) return;
      authStateRef.current = nextAuthState;
      setAuthState(nextAuthState);
    });
    return () => { active = false; };
  }, []);

  const acceptRawMaterialInbound = useCallback(inbound => {
    acceptInbound(inbound);
    readGuard.current.begin("rawMaterialInbounds");
    pendingReads.current.delete(`${authStateRef.current?.session?.accessToken}:rawMaterialInbounds`);
    if (collectionsRef.current.rawMaterialInbounds?.hasLoaded) {
      setData(current => ({ ...current, rawMaterialInbounds: mergeRawMaterialCurrentInbound(current.rawMaterialInbounds, inbound) }));
      updateCollectionState("rawMaterialInbounds", invalidateRead(collectionsRef.current.rawMaterialInbounds));
      if ((workspaceReadDependencies[activeViewRef.current] || []).includes("rawMaterialInbounds")) void readCollection("rawMaterialInbounds");
    }
  }, [acceptInbound, readCollection, updateCollectionState]);

  const updateRawMaterialInbound = useCallback(async (action, inboundId, options = {}) => {
    const target = [lookupInbound(inboundId), data.rawMaterialInbounds.find((item) => item.id === inboundId)]
      .filter(Boolean).sort((left, right) => Number(right.revision || 0) - Number(left.revision || 0))[0];
    if (!target) return { source: "ui_error", blocked: true, error: { message: `未找到入库单 ${inboundId}。` } };
    const state = activeViewRef.current === "material-receiving" ? getDetailState(inboundId) : collectionsRef.current.rawMaterialInbounds;
    if (state?.stale || state?.error || state?.loading || (activeViewRef.current === "material-receiving" && !state?.hasLoaded)) {
      return { source: "ui_error", blocked: true, error: { message: "这张单据尚未完成最新读取，请刷新成功后再操作。" } };
    }
    const result = await updateOfficeRawMaterialInboundAction({
      authState: authStateRef.current,
      operatorId,
      operatorName: authStateRef.current?.permissions?.user?.displayName || "办公室A",
      inboundId,
      expectedRevision: Number(target.revision ?? 0),
      action,
      ...options,
    }, readOptions);
    if (result.source === "api" && result.inbound?.id) {
      acceptRawMaterialInbound(result.inbound);
    }
    return result;
  }, [data.rawMaterialInbounds, lookupInbound, getDetailState, acceptRawMaterialInbound]);

  const recognizeRawMaterialPages = useCallback(async ({ pages = [], documentDirectionHint = "supplier_delivery", supplierNameHint = "", onProgress } = {}) => {
    if (!pages.length) return { source: "ui_error", blocked: true, error: { message: "请先添加送货单照片或 PDF。" } };
    assertRawMaterialDeliveryNotePageCapacity(0, pages.length);
    if (documentDirectionHint === "supplier_return" && !String(supplierNameHint).trim()) {
      return { source: "ui_error", blocked: true, error: { message: "请先选择退货供应商。" } };
    }
    const result = await recognizeOfficeRawMaterialDeliveryNote({
      authState: authStateRef.current,
      operatorId,
      pages,
      documentDirectionHint,
      supplierNameHint,
      onProgress,
      useNewModel: false,
    }, readOptions);
    if (result.source === "api" && result.inbound?.id) {
      acceptRawMaterialInbound(result.inbound);
    }
    return result;
  }, [acceptRawMaterialInbound]);

  // Retain the single-file action for existing callers. The exact source File
  // must travel with the OCR copy, including when a large photo is normalized.
  const recognizeRawMaterialFile = useCallback(async (file) => {
    if (!file) return { source: "ui_error", blocked: true, error: { message: "请选择送货单照片或 PDF。" } };
    const prepared = await prepareRawMaterialDeliveryNoteFile(file, { mimeType: file.type });
    return recognizeRawMaterialPages({ pages: [{ ...prepared, fileName: file.name, sourceNormalizedForOcr: prepared.normalized }] });
  }, [recognizeRawMaterialPages]);

  const recognizeOrderText = useCallback(async (sourceText, request = {}) => recognizeOfficeDraft({
    authState: authStateRef.current,
    operatorId,
    sourceText,
    sourceMessages: [],
    idempotencyKey: request.idempotencyKey,
    customers: [],
    inventories: data.inventoryItems,
  }, readOptions), [data.inventoryItems]);

  const saveOrderDraft = useCallback(async ({ draftId, clientRevision = 0, rows, sourceText, idempotencyKey }) => saveOfficeDraft({
    authState: authStateRef.current,
    operatorId,
    draftId,
    clientRevision,
    draftRows: rows,
    sourceText,
    draftStatus: "待审核",
    idempotencyKey,
  }, readOptions), []);

  const confirmOrderDraft = useCallback(async ({ draftId, clientRevision = 0, rows, sourceText, pricingQuoteId, confirmedAffectedOrderLineIds, shortageDecision, idempotencyKey }) => confirmOfficeDraftViaApi({
    authState: authStateRef.current,
    operatorId,
    draftId,
    clientRevision,
    draftRows: rows,
    sourceText,
    confirmMode: "confirm_now",
    pricingQuoteId, confirmedAffectedOrderLineIds, shortageDecision, idempotencyKey,
  }, readOptions), []);

  const previewOrderDraftSplit = useCallback(async (input) => previewOfficeDraftSplit({
    ...input, authState: authStateRef.current, operatorId, draftRows: input.rows,
  }, readOptions), []);
  const confirmOrderDraftSplit = useCallback(async (input) => confirmOfficeDraftSplit({
    ...input, authState: authStateRef.current, operatorId, draftRows: input.rows,
  }, readOptions), []);

  const acceptEmployeeReview = useCallback(review => {
    readGuard.current.begin("employeeAccountReviews");
    pendingReads.current.delete(`${authStateRef.current?.session?.accessToken}:employeeAccountReviews`);
    setData(current => ({ ...current, employeeAccountReviews: replaceEmployeeReview(current.employeeAccountReviews, review) }));
    updateCollectionState("employeeAccountReviews", invalidateRead(collectionsRef.current.employeeAccountReviews));
    if ((workspaceReadDependencies[activeViewRef.current] || []).includes("employeeAccountReviews")) void readCollection("employeeAccountReviews");
  }, [readCollection, updateCollectionState]);

  const updateEmployeeProfile = useCallback(async (review, profile = {}) => {
    const employeeId = String(review?.employeeId || "").trim();
    if (!employeeId) return { source: "ui_error", blocked: true, error: { message: "缺少正式员工编号。" } };
    const result = await updateOfficeMasterDataEmployeeProfile({
      authState: authStateRef.current,
      operatorId,
      employeeId,
      ...profile,
    }, readOptions);
    if (result.source === "api" && result.employeeAccountReview?.employeeId) {
      acceptEmployeeReview(result.employeeAccountReview);
    }
    return result;
  }, [acceptEmployeeReview]);

  const confirmEmployeeIdentity = useCallback(async (review, confirmation = {}) => {
    const result = await confirmOfficeMasterDataEmployeeIdentity({
      authState: authStateRef.current,
      operatorId,
      employeeId: review?.employeeId,
      confirmed: true,
      confirmedEmployeeId: review?.employeeId,
      confirmedName: confirmation.confirmedName,
      reason: confirmation.reason,
    }, readOptions);
    if (result.source === "api" && result.employeeAccountReview?.employeeId) {
      acceptEmployeeReview(result.employeeAccountReview);
    }
    return result;
  }, [acceptEmployeeReview]);

  const enableEmployeeAccount = useCallback(async (review) => {
    const result = await enableOfficeMasterDataEmployeeAccount({
      authState: authStateRef.current,
      operatorId,
      employeeId: review?.employeeId,
      roleKey: review?.recommendedRoleKey,
      roleKeys: review?.recommendedRoleKeys,
      loginName: review?.loginName,
      userId: review?.userId,
      reviewNote: "管理员已复核员工身份、岗位、机台和账号角色。",
    }, readOptions);
    if (result.source === "api" && result.employeeAccountReview?.employeeId) {
      acceptEmployeeReview(result.employeeAccountReview);
    }
    return result;
  }, [acceptEmployeeReview]);

  const issueEmployeePassword = useCallback(async (review) => {
    const result = await issueOfficeMasterDataEmployeeAccountPassword({
      authState: authStateRef.current,
      operatorId,
      employeeId: review?.employeeId,
      roleKey: review?.recommendedRoleKey,
      roleKeys: review?.recommendedRoleKeys,
      loginName: review?.loginName,
      userId: review?.userId,
      issueNote: "管理员发放员工首次临时登录密码。",
    }, readOptions);
    if (result.source === "api" && result.employeeAccountReview?.employeeId) {
      acceptEmployeeReview(result.employeeAccountReview);
    }
    return result;
  }, [acceptEmployeeReview]);

  // 供应商月结：上传对账单 → 核对 → 确认对账 → 生成应付 → 登记付款（可分次、可抹零）。
  const precheckSupplierStatement = useCallback(async (file, supplierName = "") => {
    if (!file) return { source: "ui_error", blocked: true, error: { message: "请选择供应商月结 Excel。" } };
    // Matching cannot use a receipt queue page or a stale complete snapshot.
    const inbounds = await readCollection("rawMaterialInbounds");
    if (inbounds.source !== "api" || !inbounds.complete) return { source: "ui_error", blocked: true,
      error: { message: inbounds.error?.message || "完整入库记录尚未读取成功，暂不能核对月结。" } };
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await precheckRawMaterialSupplierStatementWorkbook({
        bytes,
        fileName: file.name,
        supplierName,
        existingInbounds: inbounds.items,
      });
      return { source: "local_precheck", result };
    } catch (error) {
      return { source: "ui_error", blocked: true, error: { message: `Excel 无法读取，请确认是 .xlsx 文件：${error?.message || error}` } };
    }
  }, [readCollection]);

  const runSupplierStatementWrite = useCallback(async (write) => {
    const result = await write({
      authState: authStateRef.current,
      operatorId,
      operatorName: authStateRef.current?.permissions?.user?.displayName || "办公室A",
    });
    if (result?.source === "api") await readCollection("supplierStatementReviews");
    return result;
  }, [readCollection]);

  const saveSupplierStatementReviewDraft = useCallback((statementResult) => runSupplierStatementWrite((base) =>
    createOfficeRawMaterialSupplierStatementReviewDraft({
      ...base,
      statementResult,
      supplierName: statementResult?.supplierName || "",
      fileName: statementResult?.fileName || "",
      note: "办公室上传供应商月结 Excel 并保存预检结果，等待核对。",
    }, readOptions)), [runSupplierStatementWrite]);

  const confirmSupplierStatementReview = useCallback((reviewId, decision) => runSupplierStatementWrite((base) =>
    confirmOfficeRawMaterialSupplierStatementReview({
      ...base,
      reviewId,
      decision,
      note: decision === "一致" ? "办公室核对：对账单与 ERP 入库一致。" : "办公室核对：对账单与 ERP 入库有差异，需与供应商核实。",
    }, readOptions)), [runSupplierStatementWrite]);

  const confirmSupplierStatement = useCallback((reviewId) => runSupplierStatementWrite((base) =>
    confirmOfficeRawMaterialSupplierStatement({
      ...base,
      reviewId,
      note: "确认供应商月结对账一致；进入待付款，不直接付款。",
    }, readOptions)), [runSupplierStatementWrite]);

  const generateSupplierPayable = useCallback((reviewId) => runSupplierStatementWrite((base) =>
    generateOfficeRawMaterialSupplierPayableDraft({
      ...base,
      reviewId,
      note: "基于已确认的供应商月结生成应付。",
    }, readOptions)), [runSupplierStatementWrite]);

  const confirmSupplierPayment = useCallback((reviewId, payment = {}) => runSupplierStatementWrite((base) =>
    confirmOfficeRawMaterialSupplierPayment({
      ...base,
      reviewId,
      paidAmount: payment.paidAmount,
      roundingAmount: payment.roundingAmount,
      paymentMethod: payment.paymentMethod || "银行转账",
      paymentReferenceNo: payment.paymentReferenceNo,
      note: payment.note || "登记供应商付款；不影响原材料库存。",
    }, readOptions)), [runSupplierStatementWrite]);

  const actions = useMemo(() => ({
    ...receiptReader.actions,
    setActiveView,
    readCollection,
    ensureSearchData,
    focusOrderDraft,
    registerOrderEntryEditor,
    startNewOrderDraft,
    setOrderEntryWritePending,
    confirmEmployeeIdentity,
    confirmOrderDraft,
    previewOrderDraftSplit,
    confirmOrderDraftSplit,
    enableEmployeeAccount,
    issueEmployeePassword,
    recognizeOrderText,
    recognizeRawMaterialFile,
    recognizeRawMaterialPages,
    refreshAll,
    saveOrderDraft,
    updateEmployeeProfile,
    updateRawMaterialInbound,
    precheckSupplierStatement,
    saveSupplierStatementReviewDraft,
    confirmSupplierStatementReview,
    confirmSupplierStatement,
    generateSupplierPayable,
    confirmSupplierPayment,
  }), [receiptReader.actions, registerOrderEntryEditor, startNewOrderDraft, setActiveView, readCollection, ensureSearchData, precheckSupplierStatement, saveSupplierStatementReviewDraft, confirmSupplierStatementReview, confirmSupplierStatement, generateSupplierPayable, confirmSupplierPayment, confirmEmployeeIdentity, confirmOrderDraft, previewOrderDraftSplit, confirmOrderDraftSplit, enableEmployeeAccount, issueEmployeePassword, recognizeOrderText, recognizeRawMaterialFile, recognizeRawMaterialPages, refreshAll, saveOrderDraft, updateEmployeeProfile, updateRawMaterialInbound]);

  const requiredStates = (workspaceReadDependencies[activeView] || []).map(key => [key, collections[key] || UNLOADED_READ]);
  if (activeView === "material-receiving") requiredStates.push(["receiving", receiptReader.receiving]);
  const errors = Object.fromEntries(requiredStates.filter(([, state]) => state.error).map(([key, state]) => [key, state.error]));
  const authFailed = Boolean(authState && (!authState.authenticated || !authState.session?.accessToken));
  if (authFailed) errors.auth = "正式接口身份验证未通过。";
  const syncedDates = requiredStates.map(([, state]) => state.lastSyncedAt).filter(Boolean).sort();
  const meta = {
    loading: !authState || (!authFailed && requiredStates.some(([, state]) => state.loading || state.status === "unloaded")),
    hasLoaded: !authFailed && requiredStates.every(([, state]) => state.hasLoaded),
    blockingError: authFailed || requiredStates.some(([, state]) => state.error && !state.hasLoaded),
    pendingInitial: !authState || (!authFailed && requiredStates.some(([, state]) => !state.hasLoaded && (state.loading || state.status === "unloaded"))),
    errors, collections, stale: requiredStates.some(([, state]) => state.stale),
    lastSyncedAt: syncedDates.length ? new Date(syncedDates[0]).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "",
    search: { loading: ["orderLines", "statements"].some(key => !collections[key]?.hasLoaded || collections[key]?.loading),
      error: ["orderLines", "statements"].map(key => collections[key]?.error).filter(Boolean).join("；") },
  };

  return {
    actions,
    entryDraftId,
    entryCreationId,
    orderEntryEditorBlocked,
    orderEntryWritePending,
    authState,
    data,
    receiving: receiptReader.receiving,
    meta,
    operatorId,
    permissionContext: authState?.permissions || null,
  };
}
