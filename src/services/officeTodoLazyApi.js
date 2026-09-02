import { createLazyApiClient } from "./createLazyApiClient.js";

const lazyApiCall = createLazyApiClient(() => import("./officeTodoApiClient.js"));

export const listOfficeTodos = lazyApiCall("listOfficeTodos");
export const handleOfficeTodoAction = lazyApiCall("handleOfficeTodoAction");
export const repairOfficeTodoReference = lazyApiCall("repairOfficeTodoReference");
export const repairOfficeTodoFulfillment = lazyApiCall("repairOfficeTodoFulfillment");
export const handleOfficeTodoBatch = lazyApiCall("handleOfficeTodoBatch");
