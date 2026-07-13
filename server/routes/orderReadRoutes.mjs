export async function handleOrderReadRoutes({ url, response, workspace, sendJson, sendNotFound }) {
  if (url.pathname === "/api/order-drafts") {
    const state = workspace.orderDraftRepository?.kind === "postgres"
      ? await workspace.orderDraftRepository.loadState()
      : { orderDrafts: workspace.orderDrafts ?? [] };
    if (workspace.orderDraftRepository?.kind === "postgres") workspace.orderDrafts = state.orderDrafts;
    const status = cleanText(url.searchParams.get("status"));
    const draftId = cleanText(url.searchParams.get("draftId"));
    const queueBatchId = cleanText(url.searchParams.get("queueBatchId"));
    const queueKind = cleanText(url.searchParams.get("queueKind"));
    const customerId = cleanText(url.searchParams.get("customerId"));
    const queueOnly = url.searchParams.get("queueOnly") === "true";
    const page = positiveInteger(url.searchParams.get("page"), 1);
    const pageSize = Math.min(200, positiveInteger(url.searchParams.get("pageSize"), 50));
    const filtered = (state.orderDrafts ?? []).filter((draft) => {
      const context = draft.recognitionContext ?? {};
      return (!draftId || draft.id === draftId || draft.draftId === draftId)
        && (!status || draft.status === status)
        && (!queueBatchId || context.queueBatchId === queueBatchId)
        && (!queueKind || context.queueKind === queueKind)
        && (!customerId || draft.customerId === customerId)
        && (!queueOnly || Boolean(context.queueItemId));
    }).map((draft) => ({
      ...draft,
      inventoryIntents: (workspace.inventoryIntents ?? []).filter((intent) => intent.sourceDraftId === draft.id),
    }));
    const start = (page - 1) * pageSize;
    sendJson(response, 200, {
      items: filtered.slice(start, start + pageSize),
      page,
      pageSize,
      total: filtered.length,
      summary: {
        orderDraftCount: filtered.filter((draft) => draft.recognitionContext?.queueKind === "order_draft").length,
        intentDraftCount: filtered.filter((draft) => draft.recognitionContext?.queueKind && draft.recognitionContext.queueKind !== "order_draft").length,
        reviewCount: filtered.filter((draft) => /待(?:客户)?确认|待审核|待关联|复核/.test(draft.status)).length,
      },
    });
    return true;
  }

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

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function cleanText(value) {
  return String(value ?? "").trim();
}
