export function openProductionTodo({ authState, selected, focusProductionTask, setToast }) {
      if (!authState?.permissions?.actionPermissions?.includes("production.read")) {
        setToast("当前账号没有查看生产任务的权限。");
        return;
      }
      if (selected.type === "生产异常") {
        if (selected.referenceStatus !== "valid" || selected.resolvedRefType !== "production_task" || !selected.resolvedRefId || !selected.productionExceptionId || !focusProductionTask) {
          setToast("生产异常的任务归属缺失或冲突，请刷新并核对来源。");
          return;
        }
        return focusProductionTask({ mode: "production", taskId: selected.resolvedRefId, productionExceptionId: selected.productionExceptionId, focusKey: `${selected.id}-${Date.now()}` });
      }
      if (selected.productionTaskReferenceStatus !== "valid" || !selected.productionTaskId || !focusProductionTask) {
        setToast("重拍任务归属缺失或冲突，请刷新并核对来源，不能按订单猜测生产工序。");
        return;
      }
      return focusProductionTask({ mode: "production", taskId: selected.productionTaskId, orderLineId: selected.refId || selected.ref, focusKey: `${selected.id}-${Date.now()}` });
}

export async function repairTodoReferenceAction({ todoId, input, guardUiAction, todos, setToast, todoApi, authState, currentUserId, setTodos, refreshTodos }) {
    if (!guardUiAction("todo", "重新关联待办")) return;
    const selected = todos.find((item) => item.id === todoId);
    if (!selected || selected.referenceStatus === "valid") {
      setToast("当前待办引用有效，无需重新关联。");
      return;
    }
    const result = await todoApi.repairOfficeTodoReference({
      authState,
      todoId,
      operatorId: currentUserId,
      ...input,
      idempotencyKey: `${todoId}:${input.refType}:${input.refId}:${selected.updatedAt || selected.ref}`,
    }, { serverRequired: true });
    if (result?.source !== "api" || result.blocked) {
      setToast(
        result?.error?.requiredPermission
          ? `后端拒绝重新关联：缺少权限 ${result.error.requiredPermission}。`
          : `后端拒绝重新关联：${result?.error?.message ?? "未知错误"}`,
      );
      return;
    }
    setTodos((current) => current.map((item) => item.id === todoId ? result.todo : item));
    await refreshTodos({ showToast: false });
    setToast(`待办已重新关联到 ${result.todo.ref}，服务端已记录操作人、原因和修改前后引用。`);
}
