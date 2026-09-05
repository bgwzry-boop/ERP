import { createLazyApiClient } from "./createLazyApiClient.js";

const lazyApiCall = createLazyApiClient(() => import("./officeOrderApiClient.js"));

export const recognizeOfficeDraft = lazyApiCall("recognizeOfficeDraft");
export const recognizeOfficeDraftQueue = lazyApiCall("recognizeOfficeDraftQueue");
export const listOfficeDraftQueue = lazyApiCall("listOfficeDraftQueue");
export const getOfficeDraft = lazyApiCall("getOfficeDraft");
export const saveOfficeDraft = lazyApiCall("saveOfficeDraft");
export const restoreOfficeDraftShortageCancellation = lazyApiCall("restoreOfficeDraftShortageCancellation");
export const linkOfficeDraftShortageCancellation = lazyApiCall("linkOfficeDraftShortageCancellation");
export const confirmOfficeDraftViaApi = lazyApiCall("confirmOfficeDraftViaApi");
export const previewOfficeDraftSplit = lazyApiCall("previewOfficeDraftSplit");
export const confirmOfficeDraftSplit = lazyApiCall("confirmOfficeDraftSplit");
