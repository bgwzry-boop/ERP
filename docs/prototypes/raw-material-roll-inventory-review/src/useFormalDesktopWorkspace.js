import { mergeRawMaterialCurrentInbound } from "../../../../shared/rawMaterialCurrentInbound.js";
import { readCompleteCollection, createReadGenerationGuard } from "./read-complete-collection.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initializeSeedAuth } from "../../../../src/services/officeAuthService.js";
import { listOfficeTodos } from "../../../../src/services/officeTodoApiClient.js";
import { listOfficeDraftQueue, recognizeOfficeDraft, saveOfficeDraft, confirmOfficeDraftViaApi } from "../../../../src/services/officeOrderApiClient.js";
import { listOfficeOrderLines } from "../../../../src/services/officeOrderPoolApiClient.js";
import { listOfficeInventoryItems } from "../../../../src/services/officeInventoryApiClient.js";
import { listOfficeFulfillments } from "../../../../src/services/officeFulfillmentApiClient.js";
import { listOfficeStatementCustomers } from "../../../../src/services/officeStatementApiClient.js";
import {
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

function normalizeItems(result) {
  return result?.source === "api" && Array.isArray(result.items) ? result.items : [];
}

function replaceEmployeeReview(items, review) {
  if (!review?.employeeId) return items;
  return items.map((item) => item.employeeId === review.employeeId ? review : item);
}

export function useFormalDesktopWorkspace() {
  const [authState, setAuthState] = useState(null);
  const [entryDraftId, focusOrderDraft] = useState("");
  const [entryWriteGuard, setEntryWriteGuard] = useState({ pending: false, ownerKey: "", session: "" });
  const orderEntryWritePending = entryWriteGuard.pending && entryWriteGuard.session === authState?.session?.accessToken;
  const setOrderEntryWritePending = useCallback((pending, ownerKey) => {
    if (!ownerKey) return;
    setEntryWriteGuard(current => pending
      ? { pending: true, ownerKey, session: authStateRef.current?.session?.accessToken || "" }
      : current.ownerKey === ownerKey ? { pending: false, ownerKey: "", session: "" } : current);
  }, []);
  const authStateRef = useRef(null);
  const [data, setData] = useState(emptyData);
  const [meta, setMeta] = useState({ loading: true, errors: {}, lastSyncedAt: "" });

  const live = useRef(false);
  const readGuard = useRef(createReadGenerationGuard());
  const refreshVersion = useRef(0);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const readCollection = useCallback(async (key, session = authStateRef.current) => {
    const generation = readGuard.current.begin(key);
    const result = await readCompleteCollection(params => readDefinitions[key](session, params));
    if (!live.current || !readGuard.current.current(key, generation)
      || session?.session?.accessToken !== authStateRef.current?.session?.accessToken) return { source: "superseded" };
    setData(current => ({ ...current, [key]: normalizeItems(result) }));
    setMeta(current => {
      const errors = { ...current.errors };
      const error = resultError(result, key);
      if (error) errors[key] = error; else delete errors[key];
      return { ...current, errors };
    });
    return result;
  }, []);

  const refreshAll = useCallback(async (requestedAuthState) => {
    const nextAuthState = requestedAuthState?.authenticated ? requestedAuthState : authStateRef.current;
    const version = ++refreshVersion.current;
    if (!nextAuthState?.authenticated || !nextAuthState?.session?.accessToken) {
      setData(emptyData);
      setMeta({ loading: false, errors: { auth: "正式接口身份验证未通过。" }, lastSyncedAt: "" });
      return { source: "api_error", blocked: true };
    }
    setMeta(current => ({ ...current, loading: true }));
    const entries = await Promise.all(Object.keys(readDefinitions).map(async key => [key, await readCollection(key, nextAuthState)]));
    if (!live.current || version !== refreshVersion.current) return { source: "superseded" };
    const errors = Object.fromEntries(entries.filter(([, value]) => value.source !== "superseded" && resultError(value, "列表")).map(([key, value]) => [key, resultError(value, key)]));
    setMeta(current => ({ ...current, loading: false,
      lastSyncedAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) }));
    return { source: Object.keys(errors).length ? "api_partial" : "api", errors };
  }, [readCollection]);

  useEffect(() => {
    let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === "hidden" || !authStateRef.current?.authenticated) return;
      pending = true;
      try { await readCollection("rawMaterialInbounds"); }
      finally { pending = false; }
    };
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [readCollection]);

  useEffect(() => {
    let active = true;
    void initializeSeedAuth(authOptions).then((nextAuthState) => {
      if (!active) return;
      authStateRef.current = nextAuthState;
      setAuthState(nextAuthState);
      return refreshAll(nextAuthState);
    });
    return () => { active = false; };
  }, [refreshAll]);

  const updateRawMaterialInbound = useCallback(async (action, inboundId, options = {}) => {
    const target = data.rawMaterialInbounds.find((item) => item.id === inboundId);
    if (!target) return { source: "ui_error", blocked: true, error: { message: `未找到入库单 ${inboundId}。` } };
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
      readGuard.current.begin("rawMaterialInbounds");
      setData((current) => ({
        ...current,
        rawMaterialInbounds: mergeRawMaterialCurrentInbound(current.rawMaterialInbounds, result.inbound),
      }));
    }
    return result;
  }, [data.rawMaterialInbounds]);

  const recognizeRawMaterialFile = useCallback(async (file) => {
    if (!file) return { source: "ui_error", blocked: true, error: { message: "请选择送货单照片或 PDF。" } };
    const prepared = await prepareRawMaterialDeliveryNoteFile(file, { mimeType: file.type });
    const result = await recognizeOfficeRawMaterialDeliveryNote({
      authState: authStateRef.current,
      operatorId,
      fileName: file.name,
      mimeType: prepared.mimeType,
      fileSize: prepared.fileSize,
      contentDataUrl: prepared.contentDataUrl,
      sourceMimeType: prepared.sourceMimeType,
      sourceFileSize: prepared.sourceFileSize,
      sourceContentDataUrl: prepared.sourceContentDataUrl,
      sourceNormalizedForOcr: prepared.normalized,
      useNewModel: false,
    }, readOptions);
    if (result.source === "api" && result.inbound?.id) {
      readGuard.current.begin("rawMaterialInbounds");
      setData((current) => ({
        ...current,
        rawMaterialInbounds: mergeRawMaterialCurrentInbound(current.rawMaterialInbounds, result.inbound),
      }));
    }
    return result;
  }, []);

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

  const confirmOrderDraft = useCallback(async ({ draftId, clientRevision = 0, rows, sourceText, pricingQuoteId, confirmedAffectedOrderLineIds, idempotencyKey }) => confirmOfficeDraftViaApi({
    authState: authStateRef.current,
    operatorId,
    draftId,
    clientRevision,
    draftRows: rows,
    sourceText,
    confirmMode: "confirm_now",
    pricingQuoteId, confirmedAffectedOrderLineIds, idempotencyKey,
  }, readOptions), []);

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
      setData((current) => ({
        ...current,
        employeeAccountReviews: replaceEmployeeReview(current.employeeAccountReviews, result.employeeAccountReview),
      }));
    }
    return result;
  }, []);

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
      setData((current) => ({
        ...current,
        employeeAccountReviews: replaceEmployeeReview(current.employeeAccountReviews, result.employeeAccountReview),
      }));
    }
    return result;
  }, []);

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
      setData((current) => ({
        ...current,
        employeeAccountReviews: replaceEmployeeReview(current.employeeAccountReviews, result.employeeAccountReview),
      }));
    }
    return result;
  }, []);

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
      setData((current) => ({
        ...current,
        employeeAccountReviews: replaceEmployeeReview(current.employeeAccountReviews, result.employeeAccountReview),
      }));
    }
    return result;
  }, []);

  const actions = useMemo(() => ({
    focusOrderDraft,
    setOrderEntryWritePending,
    confirmEmployeeIdentity,
    confirmOrderDraft,
    enableEmployeeAccount,
    issueEmployeePassword,
    recognizeOrderText,
    recognizeRawMaterialFile,
    refreshAll,
    saveOrderDraft,
    updateEmployeeProfile,
    updateRawMaterialInbound,
  }), [confirmEmployeeIdentity, confirmOrderDraft, enableEmployeeAccount, issueEmployeePassword, recognizeOrderText, recognizeRawMaterialFile, refreshAll, saveOrderDraft, updateEmployeeProfile, updateRawMaterialInbound]);

  return {
    actions,
    entryDraftId,
    orderEntryWritePending,
    authState,
    data,
    meta,
    operatorId,
    permissionContext: authState?.permissions || null,
  };
}
