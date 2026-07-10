export async function handleTodoReadRoutes({
  url,
  response,
  workspace,
  sendJson,
  filterByKeyword,
  filterByValue,
  paginate,
  toTodoListItem,
}) {
  if (url.pathname !== "/api/todos") return false;

  let items = workspace.todos;
  items = filterByKeyword(items, url.searchParams.get("keyword"), ["id", "type", "ref", "summary", "impact"]);
  items = filterByValue(items, url.searchParams.get("type"), "type");
  const status = url.searchParams.get("status") ?? "open";
  if (status === "open") items = items.filter((item) => !item.handled);
  if (status === "handled") items = items.filter((item) => item.handled);
  sendJson(response, 200, paginate(items.map((item) => toTodoListItem(workspace, item)), url.searchParams));
  return true;
}
