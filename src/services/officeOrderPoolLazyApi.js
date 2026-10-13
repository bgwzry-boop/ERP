import { createLazyApiClient } from "./createLazyApiClient.js";

const lazyApiCall = createLazyApiClient(() => import("./officeOrderPoolApiClient.js"));

export const adjustOfficeOrderLineQuantity = lazyApiCall("adjustOfficeOrderLineQuantity");
export const getOfficeOrderLineDetail = lazyApiCall("getOfficeOrderLineDetail");
export const listOfficeOrderLines = lazyApiCall("listOfficeOrderLines");
export const voidOfficeOrderLine = lazyApiCall("voidOfficeOrderLine");
