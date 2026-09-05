import { createLazyApiClient } from "./createLazyApiClient.js";

const lazyPrintBatchApiCall = createLazyApiClient(() => import("./officePrintBatchApiClient.js"));
const lazyPrintDriverApiCall = createLazyApiClient(() => import("./officePrintDriverConfigApiClient.js"));
const lazyPrintJobApiCall = createLazyApiClient(() => import("./officePrintJobApiClient.js"));
const lazyPrinterDeviceApiCall = createLazyApiClient(() => import("./officePrinterDeviceApiClient.js"));

export const createOfficePrintBatchRecord = lazyPrintBatchApiCall("createOfficePrintBatchRecord");

export const getOfficePrintDriverConfig = lazyPrintDriverApiCall("getOfficePrintDriverConfig");
export const getOfficePrintDriverV1Readiness = lazyPrintDriverApiCall("getOfficePrintDriverV1Readiness");
export const getOfficePrintDriverCupsDiagnostics = lazyPrintDriverApiCall("getOfficePrintDriverCupsDiagnostics");
export const getOfficePrintDriverSpoolDiagnostics = lazyPrintDriverApiCall("getOfficePrintDriverSpoolDiagnostics");

export const listOfficePrintJobs = lazyPrintJobApiCall("listOfficePrintJobs");
export const dispatchOfficePrintJob = lazyPrintJobApiCall("dispatchOfficePrintJob");
export const retryOfficePrintJob = lazyPrintJobApiCall("retryOfficePrintJob");

export const listOfficePrintDevices = lazyPrinterDeviceApiCall("listOfficePrintDevices");
export const updateOfficePrintDeviceDriverMode = lazyPrinterDeviceApiCall("updateOfficePrintDeviceDriverMode");
export const listOfficePrinterDeviceFieldTests = lazyPrinterDeviceApiCall("listOfficePrinterDeviceFieldTests");
export const recordOfficePrinterDeviceFieldTest = lazyPrinterDeviceApiCall("recordOfficePrinterDeviceFieldTest");
