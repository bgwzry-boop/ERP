import { createLazyApiClient } from "./createLazyApiClient.js";

const lazyApiCall = createLazyApiClient(() => import("./officeAttachmentApiClient.js"));

export const createOfficeAttachment = lazyApiCall("createOfficeAttachment");
export const uploadOfficeAttachmentFile = lazyApiCall("uploadOfficeAttachmentFile");
export const listOfficeAttachments = lazyApiCall("listOfficeAttachments");
export const downloadOfficeAttachmentContent = lazyApiCall("downloadOfficeAttachmentContent");
export const createOfficeAttachmentAccessUrl = lazyApiCall("createOfficeAttachmentAccessUrl");
export const listOfficeAttachmentAccessLogs = lazyApiCall("listOfficeAttachmentAccessLogs");
