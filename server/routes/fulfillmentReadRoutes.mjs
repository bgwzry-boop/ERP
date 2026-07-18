export async function handleFulfillmentReadRoutes({
  url,
  response,
  workspace,
  sendJson,
  sendNotFound,
  paginate,
  fulfillmentReadProjectionService,
}) {
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
