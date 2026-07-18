import {
  handleOfficeTodoAction as handleOfficeTodoActionDefault,
  repairOfficeTodoFulfillment as repairOfficeTodoFulfillmentDefault,
  repairOfficeTodoReference as repairOfficeTodoReferenceDefault,
} from "../services/officeTodoApiClient.js";
import { createOfficeTodo } from "../services/officeMockService.js";
import {
  getBatchPrintPackageRows,
  getBatchPrintStats,
  getNextOpenTodoId,
  markTodoCustomerNotificationSent,
  markTodoCustomerPending,
  markTodoHandled,
  markTodoManagementViewed,
  markTodoNotificationCopyPrepared,
  reopenTodo,
  snoozeTodo,
} from "../state/officeTodoActions.js";

export function createOfficeTodoAppender({ createTodo = createOfficeTodo, setSelectedTodoId, setTodos }) {
  return (input) => {
    const todo = createTodo(input);
    setTodos((current) => [todo, ...current]);
    setSelectedTodoId(todo.id);
    return todo;
  };
}

const defaultApi = {
  handleOfficeTodoAction: handleOfficeTodoActionDefault,
  repairOfficeTodoFulfillment: repairOfficeTodoFulfillmentDefault,
  repairOfficeTodoReference: repairOfficeTodoReferenceDefault,
};

export function createOfficeTodoActions({
  allowLocalFallback,
  api = defaultApi,
  authState,
  copyTextToClipboard,
  currentUser,
  currentUserId,
  findCustomer,
  focusFulfillmentByRef,
  focusInventoryByRef,
  focusOrderDraftByRef,
  focusOrderLine,
  focusStatementByRef,
  getTodoCustomerNotificationDraft,
  guardUiAction,
  isPrintTodo,
  openModal,
  refreshFulfillments,
  refreshTodos,
  selectedTodoId,
  setSelectedTodoId,
  setTodos,
  setTodoView,
  setToast,
  sortTodos,
  todos,
}) {
  const todoApi = { ...defaultApi, ...api };
  const apiOptions = { serverRequired: !allowLocalFallback };

  async function handleOfficeTodoAction(input) {
    const result = await todoApi.handleOfficeTodoAction(input, apiOptions);
    if (!allowLocalFallback && result?.source !== "api") {
      return {
        ...result,
        source: result?.source ?? "api_error",
        blocked: true,
        error: result?.error ?? {
          code: "TODO_LOCAL_FALLBACK_FORBIDDEN",
          message: "正式后端模式禁止公共待办使用本地降级结果。",
        },
      };
    }
    return result;
  }

  function refreshCommittedTodos(result) {
    if (result?.source === "api") void refreshTodos({ showToast: false });
  }

  async function handleTodo(action, todoId = selectedTodoId) {
    if (!guardUiAction("todo", action)) return;
    const selected = todos.find((item) => item.id === todoId);
    if (!selected && action !== "批量打印标签") return;
    if (blockedReferenceStatuses.has(selected?.referenceStatus) && referenceNavigationActions.has(action)) {
      setToast(`待办引用不可直接使用：${selected.referenceReason || "目标不存在或暂不可校验"}。本次未执行，请核对来源后重新关联或关闭待办。`);
      return;
    }

    if (action === "打印标签") {
      if (!selected || !isPrintTodo(selected)) {
        setToast("当前待办不是打印类待办，不能走标签打印确认。");
        return;
      }
      const stats = getBatchPrintStats([selected]);
      openModal({
        type: "batchPrintResult",
        action,
        todoIds: [selected.id],
        printPackages: getBatchPrintPackageRows([selected]),
        totalTasks: stats.totalTasks,
        totalLabels: stats.totalLabels,
      });
      return;
    }

    if (action === "补建出库交付") {
      const result = await todoApi.repairOfficeTodoFulfillment({
        authState,
        todoId,
        operatorId: currentUserId,
        reason: "办公室根据已完成打包记录和包裹明细补建出库交付",
        idempotencyKey: `fulfillment-repair:${todoId}:${selected.updatedAt || selected.ref}`,
      }, { serverRequired: true });
      if (result?.source !== "api" || result.blocked) {
        setToast(
          result?.error?.requiredPermission
            ? `后端拒绝补建出库交付：缺少权限 ${result.error.requiredPermission}。`
            : `后端拒绝补建出库交付：${result?.error?.message ?? "未知错误"}`,
        );
        return;
      }
      await Promise.all([
        refreshTodos({ showToast: false }),
        refreshFulfillments({ showToast: false }),
      ]);
      setTodoView("未处理");
      setSelectedTodoId(result.labelTodo.id);
      setToast(`已补建出库交付 ${result.fulfillment.fulfillmentId}，${result.packageIds.length} 个包裹已回填，下一步打印标签。`);
      return;
    }

    if (action === "处理完成" || action === "确认已查看") {
      const apiResult = await handleOfficeTodoAction({
        authState,
        todoId,
        action,
        operatorId: currentUserId,
        handlingResult: action,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝处理待办：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝处理待办：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      setTodos((current) => markTodoHandled(current, todoId, action, currentUser.displayName));
      refreshCommittedTodos(apiResult);
      const nextOpenId = getNextOpenTodoId(todos, todoId, sortTodos);
      if (nextOpenId) setSelectedTodoId(nextOpenId);
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`${selected.type} 已通过${sourceLabel}记录实际处理人：${currentUser.displayName}，进入今日已处理。`);
      return;
    }

    if (action === "重新打开") {
      const apiResult = await handleOfficeTodoAction({
        authState,
        todoId,
        action,
        operatorId: currentUserId,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝重新打开待办：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝重新打开待办：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      setTodos((current) => reopenTodo(current, todoId));
      refreshCommittedTodos(apiResult);
      setTodoView("未处理");
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`已通过${sourceLabel}重新打开该待办，回到未处理列表。`);
      return;
    }

    if (action === "批量打印标签") {
      const printTodos = todos.filter((item) => !item.handled && isPrintTodo(item));
      if (!printTodos.length) {
        setToast("当前没有可批量处理的打印类待办。");
        return;
      }
      const stats = getBatchPrintStats(printTodos);
      openModal({
        type: "batchPrintResult",
        action,
        todoIds: printTodos.map((item) => item.id),
        printPackages: getBatchPrintPackageRows(printTodos),
        totalTasks: stats.totalTasks,
        totalLabels: stats.totalLabels,
      });
      return;
    }

    if (action.startsWith("稍后")) {
      const apiResult = await handleOfficeTodoAction({
        authState,
        todoId,
        action,
        operatorId: currentUserId,
        reason: action,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝设置稍后提醒：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝设置稍后提醒：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      const result = snoozeTodo(todos, todoId, action);
      setTodos((current) => snoozeTodo(current, todoId, action).todos);
      refreshCommittedTodos(apiResult);
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`已通过${sourceLabel}给 ${selected.type} 设置稍后提醒：${result.reminder}，不改变待办处理状态。`);
      return;
    }

    if (action === "打开订单录入") {
      await focusOrderDraftByRef(selected.ref);
      return;
    }
    if (action === "打开订单池" || action === "打开订单") {
      focusOrderLine(selected.ref, "待办");
      return;
    }
    if (action === "打开库存查询") {
      await focusInventoryByRef(selected.ref, selected);
      return;
    }
    if (action === "打开出库异常") {
      focusFulfillmentByRef(selected.ref);
      return;
    }
    if (action === "打开对账收款") {
      focusStatementByRef(selected.ref);
      return;
    }
    if (action === "打开管理查看") {
      const apiResult = await handleOfficeTodoAction({
        authState,
        todoId,
        action,
        operatorId: currentUserId,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝记录管理查看：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝记录管理查看：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      setTodos((current) => markTodoManagementViewed(current, todoId));
      refreshCommittedTodos(apiResult);
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`管理手机端仍是后续模块，P0 已通过${sourceLabel}记录已提示。`);
      return;
    }
    if (action === "复制通知话术") {
      const customer = selected ? findCustomer(selected.customerId) : null;
      const notificationDraft = getTodoCustomerNotificationDraft(selected, customer);
      const copyText = notificationDraft?.copyText ?? "";
      const copied = await copyTextToClipboard(copyText);
      if (!copied) {
        setToast("当前浏览器未允许自动复制，请在待办详情中手动选中文案发送。");
        return;
      }
      const apiResult = await handleOfficeTodoAction({
        authState,
        todoId,
        action,
        operatorId: currentUserId,
        handlingResult: "已复制客户通知话术",
        notificationChannel: notificationDraft.channel,
        notificationContent: copyText,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝记录通知话术复制：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝记录通知话术复制：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      setTodos((current) =>
        markTodoNotificationCopyPrepared(current, todoId, {
          notificationCopyText: copyText,
          notificationChannel: notificationDraft.channel,
          operatorName: currentUser.displayName,
        }),
      );
      refreshCommittedTodos(apiResult);
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`已复制客户通知话术，并通过${sourceLabel}记录；待办保持未处理，发送后再确认。`);
      return;
    }
    if (action === "确认已通知客户") {
      const customer = selected ? findCustomer(selected.customerId) : null;
      const notificationDraft = getTodoCustomerNotificationDraft(selected, customer);
      const apiResult = await handleOfficeTodoAction({
        authState,
        todoId,
        action,
        operatorId: currentUserId,
        handlingResult: "已人工通知客户",
        notificationChannel: notificationDraft?.channel,
        notificationContent: notificationDraft?.copyText,
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝确认客户通知：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝确认客户通知：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      setTodos((current) =>
        markTodoCustomerNotificationSent(current, todoId, {
          notificationCopyText: notificationDraft?.copyText,
          notificationChannel: notificationDraft?.channel,
          operatorName: currentUser.displayName,
        }),
      );
      refreshCommittedTodos(apiResult);
      const nextOpenId = getNextOpenTodoId(todos, todoId, sortTodos);
      if (nextOpenId) setSelectedTodoId(nextOpenId);
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`已通过${sourceLabel}记录客户已由办公室人工通知；没有自动发送客户消息。`);
      return;
    }
    if (action === "客户待确认") {
      const apiResult = await handleOfficeTodoAction({
        authState,
        todoId,
        action,
        operatorId: currentUserId,
        handlingResult: "客户待确认",
      });
      if (apiResult.blocked) {
        setToast(
          apiResult.error?.requiredPermission
            ? `后端拒绝标记客户待确认：缺少权限 ${apiResult.error.requiredPermission}。`
            : `后端拒绝标记客户待确认：${apiResult.error?.message ?? "未知错误"}`,
        );
        return;
      }
      setTodos((current) => markTodoCustomerPending(current, todoId));
      refreshCommittedTodos(apiResult);
      const sourceLabel = apiResult.source === "api" ? "后端 API" : "本地规则降级";
      setToast(`已通过${sourceLabel}标记客户待确认，不释放库存、不自动改单。`);
      return;
    }
    if (action === "打印预览") {
      if (selected.type.includes("对账") || selected.type.includes("收款")) {
        const statement = await focusStatementByRef(selected.ref);
        if (statement) openModal({ type: "statementPreview", statementId: statement.id, action });
        return;
      }
      const fulfillment = await focusFulfillmentByRef(selected.ref);
      if (fulfillment) openModal({ type: "print", fulfillmentId: fulfillment.id, action });
      return;
    }
    setToast(`“${action}”尚未接入正式处理流程，本次未执行。`);
  }

  async function repairTodoReference(todoId, input) {
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

  return { handleTodo, repairTodoReference };
}

const referenceNavigationActions = new Set([
  "打开订单录入",
  "打开订单池",
  "打开订单",
  "打开库存查询",
  "打开出库异常",
  "打开对账收款",
  "打印预览",
  "打印标签",
  "批量打印标签",
]);
const blockedReferenceStatuses = new Set(["missing", "unverifiable"]);
