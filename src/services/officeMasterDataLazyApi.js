import { createLazyApiClient } from "./createLazyApiClient.js";

const lazyApiCall = createLazyApiClient(() => import("./officeMasterDataImportApiClient.js"));

export const confirmOfficeMasterDataEmployeeIdentity = lazyApiCall("confirmOfficeMasterDataEmployeeIdentity");
export const createOfficeMasterDataImportConfirmationPlan = lazyApiCall("createOfficeMasterDataImportConfirmationPlan");
export const createOfficeMasterDataImportExecution = lazyApiCall("createOfficeMasterDataImportExecution");
export const createOfficeMasterDataImportFailedRowsCorrectionDraft = lazyApiCall("createOfficeMasterDataImportFailedRowsCorrectionDraft");
export const createOfficeMasterDataMachine = lazyApiCall("createOfficeMasterDataMachine");
export const downloadOfficeMasterDataImportFailedRows = lazyApiCall("downloadOfficeMasterDataImportFailedRows");
export const enableOfficeMasterDataEmployeeAccount = lazyApiCall("enableOfficeMasterDataEmployeeAccount");
export const enableOfficeMasterDataEmployeeAccounts = lazyApiCall("enableOfficeMasterDataEmployeeAccounts");
export const issueOfficeMasterDataEmployeeAccountPassword = lazyApiCall("issueOfficeMasterDataEmployeeAccountPassword");
export const listOfficeMasterDataEmployeeAccountReviews = lazyApiCall("listOfficeMasterDataEmployeeAccountReviews");
export const listOfficeMasterDataImportReviewDrafts = lazyApiCall("listOfficeMasterDataImportReviewDrafts");
export const revokeOfficeMasterDataEmployeeAccountPassword = lazyApiCall("revokeOfficeMasterDataEmployeeAccountPassword");
export const updateOfficeMasterDataEmployeeAssignment = lazyApiCall("updateOfficeMasterDataEmployeeAssignment");
export const updateOfficeMasterDataEmployeeProfile = lazyApiCall("updateOfficeMasterDataEmployeeProfile");
export const updateOfficeMasterDataMachine = lazyApiCall("updateOfficeMasterDataMachine");
