import { createLazyApiClient } from "./createLazyApiClient.js";

const lazyApiCall = createLazyApiClient(() => import("./officeProductionPackingApiClient.js"));

export const completeOfficePackingTask = lazyApiCall("completeOfficePackingTask");
export const getOfficePackingTaskDetail = lazyApiCall("getOfficePackingTaskDetail");
export const getOfficeProductionTaskDetail = lazyApiCall("getOfficeProductionTaskDetail");
export const listOfficePackingTasks = lazyApiCall("listOfficePackingTasks");
export const listOfficeProductionMachineQueue = lazyApiCall("listOfficeProductionMachineQueue");
export const listOfficeProductionTasks = lazyApiCall("listOfficeProductionTasks");
export const moveOfficeProductionMachineQueueItem = lazyApiCall("moveOfficeProductionMachineQueueItem");
export const publishOfficeProductionSchedule = lazyApiCall("publishOfficeProductionSchedule");
export const reportOfficeProductionComplete = lazyApiCall("reportOfficeProductionComplete");
export const reportOfficeProductionDailyProgress = lazyApiCall("reportOfficeProductionDailyProgress");
export const reportOfficeProductionException = lazyApiCall("reportOfficeProductionException");
export const resequenceOfficeProductionMachineQueue = lazyApiCall("resequenceOfficeProductionMachineQueue");
export const resolveOfficeProductionException = lazyApiCall("resolveOfficeProductionException");
export const reviewOfficeProductionFinishedGoodsPhoto = lazyApiCall("reviewOfficeProductionFinishedGoodsPhoto");
export const uploadOfficeProductionFinishedGoodsPhoto = lazyApiCall("uploadOfficeProductionFinishedGoodsPhoto");
