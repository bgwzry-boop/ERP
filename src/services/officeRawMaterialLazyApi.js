import { createLazyApiClient } from "./createLazyApiClient.js";

const lazyApiCall = createLazyApiClient(() => import("./officeRawMaterialApiClient.js"));

export const confirmOfficeRawMaterialSupplierPayment = lazyApiCall("confirmOfficeRawMaterialSupplierPayment");
export const confirmOfficeRawMaterialSupplierStatement = lazyApiCall("confirmOfficeRawMaterialSupplierStatement");
export const confirmOfficeRawMaterialSupplierStatementReview = lazyApiCall("confirmOfficeRawMaterialSupplierStatementReview");
export const createOfficeRawMaterialSupplierStatementReviewDraft = lazyApiCall("createOfficeRawMaterialSupplierStatementReviewDraft");
export const generateOfficeRawMaterialSupplierPayableDraft = lazyApiCall("generateOfficeRawMaterialSupplierPayableDraft");
export const listOfficeRawMaterialInbounds = lazyApiCall("listOfficeRawMaterialInbounds");
export const listOfficeRawMaterialSupplierStatementReviews = lazyApiCall("listOfficeRawMaterialSupplierStatementReviews");
export const recognizeOfficeRawMaterialDeliveryNote = lazyApiCall("recognizeOfficeRawMaterialDeliveryNote");
export const updateOfficeRawMaterialInboundAction = lazyApiCall("updateOfficeRawMaterialInboundAction");
