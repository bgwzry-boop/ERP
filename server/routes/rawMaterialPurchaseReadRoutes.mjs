export async function handleRawMaterialPurchaseReadRoutes({ url, response, workspace, sendJson, sendNotFound }) {
  if (url.pathname === "/api/raw-material-purchase-requests") {
    const items = await workspace.rawMaterialPurchaseRepository.listPurchaseRequests({
      workspace,
      filters: {
        status: url.searchParams.get("status"),
        supplierId: url.searchParams.get("supplierId"),
      },
    });
    sendJson(response, 200, { items, total: items.length });
    return true;
  }

  const purchaseMatch = url.pathname.match(/^\/api\/raw-material-purchase-requests\/([^/]+)$/);
  if (!purchaseMatch) return false;
  const purchaseRequest = await workspace.rawMaterialPurchaseRepository.getPurchaseRequest({
    workspace,
    requestId: decodeURIComponent(purchaseMatch[1]),
  });
  if (purchaseRequest) sendJson(response, 200, { purchaseRequest });
  else sendNotFound(response, "RAW_MATERIAL_PURCHASE_NOT_FOUND");
  return true;
}
