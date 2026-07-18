export function createRawMaterialPurchaseCommandService({ rawMaterialCommandService } = {}) {
  if (typeof rawMaterialCommandService?.createPurchaseRequest !== "function") {
    throw new TypeError("rawMaterialCommandService.createPurchaseRequest must be a function");
  }
  if (typeof rawMaterialCommandService?.updatePurchaseRequestStatus !== "function") {
    throw new TypeError("rawMaterialCommandService.updatePurchaseRequestStatus must be a function");
  }

  return Object.freeze({
    createPurchaseRequest(input) {
      return rawMaterialCommandService.createPurchaseRequest(input);
    },
    updatePurchaseRequestStatus(input) {
      return rawMaterialCommandService.updatePurchaseRequestStatus(input);
    },
  });
}
