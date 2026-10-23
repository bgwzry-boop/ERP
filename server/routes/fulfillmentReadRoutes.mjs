import { fulfillmentOperatorCandidatePermissions, listFulfillmentOperatorCandidates } from "../services/fulfillmentOperatorCandidatesService.mjs";
export async function handleFulfillmentReadRoutes({
  url,
  response,
  workspace,
  permissionContext,
  sendJson,
  sendNotFound,
  paginate,
  fulfillmentReadProjectionService,
}) {
  if (url.pathname === "/api/fulfillments/operator-candidates") {
    const actionPermissions = permissionContext?.actionPermissions ?? [];
    if (!fulfillmentOperatorCandidatePermissions.some(permission => actionPermissions.includes(permission))) {
      sendJson(response, 403, { code: "FORBIDDEN", requiredPermissions: fulfillmentOperatorCandidatePermissions, message: "当前账号没有出库执行或送货派单权限。" });
      return true;
    }
    sendJson(response, 200, listFulfillmentOperatorCandidates({ workspace, actionPermissions }));
    return true;
  }
  if (url.pathname === "/api/fulfillments") {
    const projection = fulfillmentReadProjectionService.listFulfillments({
      workspace,
      searchParams: url.searchParams,
    });
    sendJson(response, 200, {
      ...paginate(projection.items, url.searchParams),
      metrics: projection.metrics,
    });
    return true;
  }

  const fulfillmentMatch = url.pathname.match(/^\/api\/fulfillments\/([^/]+)$/);
  if (!fulfillmentMatch) return false;

  const item = fulfillmentReadProjectionService.getFulfillment({
    workspace,
    fulfillmentId: decodeURIComponent(fulfillmentMatch[1]),
  });
  if (item) sendJson(response, 200, item);
  else sendNotFound(response, "FULFILLMENT_NOT_FOUND");
  return true;
}
