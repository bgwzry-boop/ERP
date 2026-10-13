import { createLazyApiClient } from "./createLazyApiClient.js";

const lazyApiCall = createLazyApiClient(() => import("./officeFulfillmentApiClient.js"));

export const cancelOfficeFulfillment = lazyApiCall("cancelOfficeFulfillment");
export const completeOfficeFulfillment = lazyApiCall("completeOfficeFulfillment");
export const confirmOfficeFulfillmentPickup = lazyApiCall("confirmOfficeFulfillmentPickup");
export const createOfficeFulfillmentException = lazyApiCall("createOfficeFulfillmentException");
export const handoffOfficePaperOutbound = lazyApiCall("handoffOfficePaperOutbound");
export const listOfficeFulfillments = lazyApiCall("listOfficeFulfillments");
export const markOfficeFulfillmentPrepared = lazyApiCall("markOfficeFulfillmentPrepared");
export const printOfficeFulfillment = lazyApiCall("printOfficeFulfillment");
export const recordOfficeWarehouseOutboundExecution = lazyApiCall("recordOfficeWarehouseOutboundExecution");
export const resolveOfficeFulfillmentQuantityVariance = lazyApiCall("resolveOfficeFulfillmentQuantityVariance");
export const reviewOfficeDeliveryEvidence = lazyApiCall("reviewOfficeDeliveryEvidence");
export const updateOfficeFulfillmentDispatch = lazyApiCall("updateOfficeFulfillmentDispatch");
export const voidOfficePrintRecord = lazyApiCall("voidOfficePrintRecord");
