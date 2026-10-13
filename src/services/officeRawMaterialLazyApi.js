import { createLazyApiClient } from "./createLazyApiClient.js";

const lazyApiCall = createLazyApiClient(() => import("./officeRawMaterialApiClient.js"));
const lazySupplierStatementApiCall = createLazyApiClient(() => import("./officeRawMaterialSupplierStatementApiClient.js"));

export const confirmOfficeRawMaterialSupplierPayment = lazySupplierStatementApiCall("confirmOfficeRawMaterialSupplierPayment");
export const confirmOfficeRawMaterialSupplierStatement = lazySupplierStatementApiCall("confirmOfficeRawMaterialSupplierStatement");
export const confirmOfficeRawMaterialSupplierStatementReview = lazySupplierStatementApiCall("confirmOfficeRawMaterialSupplierStatementReview");
export const createOfficeRawMaterialSupplierStatementReviewDraft = lazySupplierStatementApiCall("createOfficeRawMaterialSupplierStatementReviewDraft");
export const generateOfficeRawMaterialSupplierPayableDraft = lazySupplierStatementApiCall("generateOfficeRawMaterialSupplierPayableDraft");
export const listOfficeRawMaterialInbounds = lazyApiCall("listOfficeRawMaterialInbounds");
export const listOfficeRawMaterialSupplierStatementReviews = lazySupplierStatementApiCall("listOfficeRawMaterialSupplierStatementReviews");
export const recognizeOfficeRawMaterialDeliveryNote = lazyApiCall("recognizeOfficeRawMaterialDeliveryNote");
export const updateOfficeRawMaterialInboundAction = lazyApiCall("updateOfficeRawMaterialInboundAction");
