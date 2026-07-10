export async function handleOrderReadRoutes({ url, response, workspace, sendJson, sendNotFound }) {
  if (url.pathname === "/api/order-lines") {
    sendJson(
      response,
      200,
      await workspace.orderPoolReadRepository.listOrderLines({ workspace, query: url.searchParams }),
    );
    return true;
  }

  const orderLineMatch = url.pathname.match(/^\/api\/order-lines\/([^/]+)$/);
  if (!orderLineMatch) return false;

  const item = await workspace.orderPoolReadRepository.getOrderLineDetail({
    workspace,
    orderLineId: decodeURIComponent(orderLineMatch[1]),
  });
  if (item) sendJson(response, 200, item);
  else sendNotFound(response, "ORDER_LINE_NOT_FOUND");
  return true;
}
