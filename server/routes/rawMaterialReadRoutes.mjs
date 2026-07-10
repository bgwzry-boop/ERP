export async function handleRawMaterialReadRoutes({ url, response, workspace, sendJson, sendNotFound }) {
  if (url.pathname === "/api/raw-material-inbounds") {
    sendJson(
      response,
      200,
      await workspace.rawMaterialInboundRepository.listRawMaterialInbounds({
        workspace,
        query: url.searchParams,
      }),
    );
    return true;
  }

  if (url.pathname === "/api/raw-material-supplier-statement-reviews") {
    sendJson(
      response,
      200,
      await workspace.rawMaterialSupplierStatementReviewRepository.listReviews({
        workspace,
        query: url.searchParams,
      }),
    );
    return true;
  }

  const inboundMatch = url.pathname.match(/^\/api\/raw-material-inbounds\/([^/]+)$/);
  if (!inboundMatch) return false;

  const inbound = await workspace.rawMaterialInboundRepository.getRawMaterialInbound({
    workspace,
    inboundId: decodeURIComponent(inboundMatch[1]),
  });
  if (inbound) sendJson(response, 200, { inbound });
  else sendNotFound(response, "RAW_MATERIAL_INBOUND_NOT_FOUND");
  return true;
}
