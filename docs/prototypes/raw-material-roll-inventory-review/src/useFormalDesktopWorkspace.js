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
  todos: (authState) => listOfficeTodos({ authState, operatorId, status: "all", pageSize: 200, localTodos: [] }, readOptions),
  orderDrafts: (authState) => listOfficeDraftQueue({ authState, operatorId, pageSize: 100, inventories: [] }, readOptions),
  orderLines: (authState) => listOfficeOrderLines({ authState, operatorId, pageSize: 200, includeHistory: false, localOrderLines: [] }, readOptions),
  inventoryItems: (authState) => listOfficeInventoryItems({ authState, operatorId, pageSize: 200, localInventoryRecords: [] }, readOptions),
  fulfillments: (authState) => listOfficeFulfillments({ authState, operatorId, pageSize: 200, localFulfillments: [] }, readOptions),
  statements: (authState) => listOfficeStatementCustomers({ authState, operatorId, pageSize: 200, localStatements: [] }, readOptions),
  rawMaterialInbounds: (authState) => listOfficeRawMaterialInbounds({ authState, operatorId, pageSize: 200, localInbounds: [] }, readOptions),
  supplierStatementReviews: (authState) => listOfficeRawMaterialSupplierStatementReviews({ authState, operatorId, pageSize: 100 }, readOptions),
  productionTasks: (authState) => listOfficeProductionTasks({ authState, operatorId, query: { pageSize: 200 } }, readOptions),
  packingTasks: (authState) => listOfficePackingTasks({ authState, operatorId, query: { pageSize: 200 } }, readOptions),
  printJobs: (authState) => listOfficePrintJobs({ authState, operatorId, query: { pageSize: 200 }, localPrintJobs: [] }, readOptions),
  printDevices: (authState) => listOfficePrintDevices({ authState, operatorId, query: { pageSize: 200 }, localPrintDevices: [] }, readOptions),
  employeeAccountReviews: (authState) => listOfficeMasterDataEmployeeAccountReviews({ authState, operatorId, pageSize: 200, localReviews: [] }, readOptions),
  machines: (authState) => listOfficeMasterDataMachines({ authState, operatorId, pageSize: 200 }, readOptions),
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
  const authStateRef = useRef(null);
  const [data, setData] = useState(emptyData);
  const [meta, setMeta] = useState({ loading: true, errors: {}, lastSyncedAt: "" });

  const refreshAll = useCallback(async (nextAuthState = authStateRef.current) => {
    if (!nextAuthState?.authenticated || !nextAuthState?.session?.accessToken) {
      setData(emptyData);
      setMeta({ loading: false, errors: { auth: "正式接口身份验证未通过。" }, lastSyncedAt: "" });
      return { source: "api_error", blocked: true };
    }
    setMeta((current) => ({ ...current, loading: true, errors: {} }));
    const entries = await Promise.all(Object.entries(readDefinitions).map(async ([key, read]) => [key, await read(nextAuthState)]));
    const nextData = {};
    const errors = {};
    for (const [key, result] of entries) {
      nextData[key] = normalizeItems(result);
      const error = resultError(result, key);
      if (error) errors[key] = error;
    }
    setData({ ...emptyData, ...nextData });
    setMeta({
      loading: false,
      errors,
      lastSyncedAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    });
    return { source: Object.keys(errors).length ? "api_partial" : "api", errors };
  }, []);

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
      setData((current) => ({
        ...current,
        rawMaterialInbounds: current.rawMaterialInbounds.map((item) => item.id === inboundId ? result.inbound : item),
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
      setData((current) => ({
        ...current,
        rawMaterialInbounds: [result.inbound, ...current.rawMaterialInbounds.filter((item) => item.id !== result.inbound.id)],
      }));
    }
    return result;
  }, []);

  const recognizeOrderText = useCallback(async (sourceText) => recognizeOfficeDraft({
    authState: authStateRef.current,
    operatorId,
    sourceText,
    sourceMessages: [],
    customers: [],
    inventories: data.inventoryItems,
  }, readOptions), [data.inventoryItems]);

  const saveOrderDraft = useCallback(async ({ draftId, clientRevision = 0, rows, sourceText }) => saveOfficeDraft({
    authState: authStateRef.current,
    operatorId,
    draftId,
    clientRevision,
    draftRows: rows,
    sourceText,
    draftStatus: "待审核",
  }, readOptions), []);

  const confirmOrderDraft = useCallback(async ({ draftId, clientRevision = 0, rows, sourceText }) => confirmOfficeDraftViaApi({
    authState: authStateRef.current,
    operatorId,
    draftId,
    clientRevision,
    draftRows: rows,
    sourceText,
    confirmMode: "confirm_now",
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
    authState,
    data,
    meta,
    operatorId,
    permissionContext: authState?.permissions || null,
  };
}
