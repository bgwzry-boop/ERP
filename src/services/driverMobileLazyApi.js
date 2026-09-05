import { createLazyApiClient } from "./createLazyApiClient.js";

const lazyApiCall = createLazyApiClient(() => import("./driverMobileApiClient.js"));

export const completeDriverDeliveryTask = lazyApiCall("completeDriverDeliveryTask");
export const confirmDriverDeliveryLoaded = lazyApiCall("confirmDriverDeliveryLoaded");
export const getDriverLoadPackageCheckState = lazyApiCall("getDriverLoadPackageCheckState");
export const listDriverDeliveryTasks = lazyApiCall("listDriverDeliveryTasks");
export const recordDriverDeviceFieldTest = lazyApiCall("recordDriverDeviceFieldTest");
export const reportDriverDeliveryException = lazyApiCall("reportDriverDeliveryException");
