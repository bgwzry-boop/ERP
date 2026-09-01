import { createLazyApiClient } from "./createLazyApiClient.js";

const lazyApiCall = createLazyApiClient(() => import("./officeStatementApiClient.js"));

export const downloadOfficeStatementExport = lazyApiCall("downloadOfficeStatementExport");
export const getOfficeStatementDetail = lazyApiCall("getOfficeStatementDetail");
export const handleOfficeStatementVariance = lazyApiCall("handleOfficeStatementVariance");
export const listOfficeStatementCustomers = lazyApiCall("listOfficeStatementCustomers");
export const listOfficeStatementExports = lazyApiCall("listOfficeStatementExports");
export const markOfficeStatementSentViaApi = lazyApiCall("markOfficeStatementSentViaApi");
export const previewOfficeStatement = lazyApiCall("previewOfficeStatement");
export const recordOfficeStatementCustomerConfirmation = lazyApiCall("recordOfficeStatementCustomerConfirmation");
export const recordOfficeStatementPayment = lazyApiCall("recordOfficeStatementPayment");
export const recordOfficeStatementSendReceipt = lazyApiCall("recordOfficeStatementSendReceipt");
export const writeOffOfficeStatement = lazyApiCall("writeOffOfficeStatement");
