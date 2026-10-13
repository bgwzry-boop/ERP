import { createLazyApiClient } from "./createLazyApiClient.js";

const lazyApiCall = createLazyApiClient(() => import("./officeInventoryApiClient.js"));

export const confirmOfficeInventoryCorrectionDraft = lazyApiCall("confirmOfficeInventoryCorrectionDraft");
export const createOfficeInventoryCorrectionDraft = lazyApiCall("createOfficeInventoryCorrectionDraft");
export const createOfficeTemporaryInventoryHold = lazyApiCall("createOfficeTemporaryInventoryHold");
export const extendOfficeTemporaryInventoryHold = lazyApiCall("extendOfficeTemporaryInventoryHold");
export const getOfficeInventoryCorrectionDetail = lazyApiCall("getOfficeInventoryCorrectionDetail");
export const linkOfficeInventoryCorrectionAttachments = lazyApiCall("linkOfficeInventoryCorrectionAttachments");
export const listOfficeInventoryCorrectionDrafts = lazyApiCall("listOfficeInventoryCorrectionDrafts");
export const listOfficeInventoryIntents = lazyApiCall("listOfficeInventoryIntents");
export const listOfficeInventoryItems = lazyApiCall("listOfficeInventoryItems");
export const listOfficeInventoryLedgerEntries = lazyApiCall("listOfficeInventoryLedgerEntries");
export const listOfficeTemporaryInventoryHolds = lazyApiCall("listOfficeTemporaryInventoryHolds");
export const releaseOfficeTemporaryInventoryHold = lazyApiCall("releaseOfficeTemporaryInventoryHold");
