export async function handleTodoReadRoutes({
  url,
  response,
  workspace,
  sendJson,
  todoReadProjectionService,
}) {
  if (url.pathname !== "/api/todos") return false;
  sendJson(response, 200, todoReadProjectionService.listTodos({ workspace, searchParams: url.searchParams }));
  return true;
}
