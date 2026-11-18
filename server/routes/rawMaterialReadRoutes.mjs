import { projectRawMaterialRollReadAccess } from "../services/rawMaterialStockAccessProjectionService.mjs";
import { getSupplierReturnAccess } from "../../shared/rawMaterialSupplierReturnStock.js";
export async function handleRawMaterialReadRoutes({ url, response, workspace, permissionContext, sendJson, sendNotFound }) {
  if (url.pathname === "/api/raw-material-rolls/supplier-returns") {
    const access = getSupplierReturnAccess(permissionContext);
    if (!access.canStage && !access.canShip) {
      sendJson(response, 403, { code: "RAW_MATERIAL_SUPPLIER_RETURN_ACCESS_DENIED", message: "当前账号没有供应商退厂操作权限。" });
      return true;
    }
    const result = await workspace.rawMaterialInboundRepository.listSupplierReturnStock({ workspace, query: url.searchParams, access });
    sendJson(response, 200, result);
    return true;
  }
  if (url.pathname === "/api/raw-material-rolls") {
    const result = await workspace.rawMaterialInboundRepository.listRawMaterialRolls({ workspace, query: url.searchParams });
    sendJson(response, 200, projectRawMaterialRollReadAccess(result, permissionContext));
    return true;
  }
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
