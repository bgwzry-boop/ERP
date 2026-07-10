export async function handleFulfillmentReadRoutes({
  url,
  response,
  workspace,
  sendJson,
  sendNotFound,
  filterByKeyword,
  filterByValue,
  paginate,
  toFulfillmentListItem,
  buildFulfillmentMetrics,
}) {
  if (url.pathname === "/api/fulfillments") {
    let items = workspace.fulfillments;
    items = filterByKeyword(items, url.searchParams.get("keyword"), ["id", "lineId", "goods", "status", "method"]);
    items = filterByValue(items, url.searchParams.get("method"), "method");
    items = filterByValue(items, url.searchParams.get("status"), "status");
    sendJson(response, 200, {
      ...paginate(items.map((item) => toFulfillmentListItem(workspace, item)), url.searchParams),
      metrics: buildFulfillmentMetrics(workspace.fulfillments),
    });
    return true;
  }

  const fulfillmentMatch = url.pathname.match(/^\/api\/fulfillments\/([^/]+)$/);
  if (!fulfillmentMatch) return false;

  const item = workspace.fulfillments.find((row) => row.id === decodeURIComponent(fulfillmentMatch[1]));
  if (item) sendJson(response, 200, item);
  else sendNotFound(response, "FULFILLMENT_NOT_FOUND");
  return true;
}
