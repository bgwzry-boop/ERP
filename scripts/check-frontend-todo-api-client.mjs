import { createLocalSeedAuthState } from "../src/services/officeAuthService.js";
import {
  handleOfficeTodoAction,
  handleOfficeTodoBatch,
  listOfficeTodos,
  mapTodoUiActionToApiPayload,
  repairOfficeTodoFulfillment,
  repairOfficeTodoReference,
} from "../src/services/officeTodoApiClient.js";
import { createOfficePrintBatchRecord } from "../src/services/officePrintBatchApiClient.js";
import {
  applyBatchPrintResult,
  createPrintBatchRecord,
  getBatchPrintPackageRows,
  getBatchPrintStats,
  getTodoPrintLabelCount,
} from "../src/state/officeTodoActions.js";

const authState = createLocalSeedAuthState("U-OFFICE-A");

const handledPayload = mapTodoUiActionToApiPayload("处理完成");
assert(handledPayload.action === "mark_handled", "handled todo action was not mapped to mark_handled");
assert(handledPayload.handlingResult === "处理完成", "handled todo result was not preserved");

const snoozePayload = mapTodoUiActionToApiPayload("稍后30分钟");
assert(snoozePayload.action === "snooze" && snoozePayload.reason === "稍后30分钟", "snooze action was not mapped correctly");

const batchPayload = mapTodoUiActionToApiPayload("批量打印标签");
assert(batchPayload.action === "batch_print_confirm", "batch print action was not mapped correctly");

const pendingPrintPayload = mapTodoUiActionToApiPayload("批量打印结果待处理", {
  reason: "部分打出",
  handlingResult: "已打出 1/2",
});
assert(pendingPrintPayload.action === "batch_print_result_pending", "pending print result action was not mapped correctly");

const notificationCopyPayload = mapTodoUiActionToApiPayload("复制通知话术");
assert(notificationCopyPayload.action === "customer_notification_copied", "customer notification copy action was not mapped correctly");

const notificationSentPayload = mapTodoUiActionToApiPayload("确认已通知客户");
assert(notificationSentPayload.action === "customer_notification_sent", "customer notification sent action was not mapped correctly");

const customerPendingPayload = mapTodoUiActionToApiPayload("客户待确认");
assert(customerPendingPayload.action === "customer_pending", "customer pending action was not mapped correctly");

const printTodoA = { id: "T-PRINT-A", type: "待打印标签", summary: "快运 3 包，打包工已提交包裹明细", urgency: "今天" };
const printTodoB = { id: "T-PRINT-B", type: "待打印标签", summary: "快运 2 包，打包工已提交包裹明细", urgency: "今天" };
const nonPrintTodo = { id: "T-NORMAL", type: "订单草稿待确认", summary: "普通待办", urgency: "普通" };
assert(getTodoPrintLabelCount(printTodoA) === 3, "print todo package count was not inferred");
assert(getBatchPrintStats([printTodoA, printTodoB]).totalLabels === 5, "batch print total labels were not calculated");
assert(getBatchPrintPackageRows([printTodoA]).map((item) => item.labelText).join(",") === "第 1/3 包,第 2/3 包,第 3/3 包", "print package rows were not generated");
const partialPrintProjection = applyBatchPrintResult([printTodoA, printTodoB, nonPrintTodo], (todo) => todo.type.includes("打印") || todo.type.includes("标签"), {
  todoIds: ["T-PRINT-A", "T-PRINT-B"],
  result: "部分打出",
  printedLabelCount: 4,
  operatorName: "办公室A",
});
assert(partialPrintProjection.fullPrintedTodos.length === 1, "partial batch print should fully handle one todo");
assert(partialPrintProjection.todos.find((todo) => todo.id === "T-PRINT-A")?.handled === true, "fully printed todo should be handled");
assert(partialPrintProjection.todos.find((todo) => todo.id === "T-PRINT-B")?.printResultStatus === "partial", "partially printed todo should remain open with partial status");
assert(partialPrintProjection.todos.find((todo) => todo.id === "T-PRINT-B")?.pendingLabelCount === 1, "partial pending label count is incorrect");
assert(getTodoPrintLabelCount(partialPrintProjection.todos.find((todo) => todo.id === "T-PRINT-B")) === 1, "partial reprint should use pending label count");
const packageSpecificProjection = applyBatchPrintResult([printTodoA], (todo) => todo.type.includes("打印") || todo.type.includes("标签"), {
  todoIds: ["T-PRINT-A"],
  result: "部分打出",
  printedLabelCount: 2,
  printedPackageIds: ["T-PRINT-A-PKG-1", "T-PRINT-A-PKG-3"],
});
assert(packageSpecificProjection.todos[0].printPackages.find((item) => item.packageId === "T-PRINT-A-PKG-1")?.status === "printed", "selected package 1 should be printed");
assert(packageSpecificProjection.todos[0].printPackages.find((item) => item.packageId === "T-PRINT-A-PKG-2")?.status === "not_printed", "unselected package 2 should remain pending for reprint");
assert(packageSpecificProjection.todos[0].printPackages.find((item) => item.packageId === "T-PRINT-A-PKG-3")?.status === "printed", "selected package 3 should be printed");
const unknownPrintProjection = applyBatchPrintResult([printTodoA], (todo) => todo.type.includes("打印") || todo.type.includes("标签"), {
  todoIds: ["T-PRINT-A"],
  result: "不确定",
  printedLabelCount: 0,
});
assert(unknownPrintProjection.todos[0].printResultStatus === "unknown", "uncertain print result should be marked unknown");
assert(unknownPrintProjection.todos[0].urgency === "异常", "uncertain print result should become an exception");
const printBatchDraft = createPrintBatchRecord({
  printBatchId: "PB-CHECK-1",
  resultLabel: "部分打出",
  todoIds: ["T-PRINT-A"],
  todoRefs: ["ORD-CHECK-1"],
  totalTaskCount: 1,
  totalLabelCount: 3,
  printedLabelCount: 2,
  pendingLabelCount: 1,
  printedPackageIds: ["T-PRINT-A-PKG-1", "T-PRINT-A-PKG-3"],
  pendingPackageIds: ["T-PRINT-A-PKG-2"],
  printPackages: packageSpecificProjection.todos[0].printPackages,
  operatorId: "U-OFFICE-A",
  operatorName: "办公室A",
});
assert(printBatchDraft.status === "partial", "print batch partial status was not derived");
assert(printBatchDraft.summary === "部分打出：已打出 2/3，待重打 1", "print batch summary is incorrect");
assert(printBatchDraft.pendingPackages[0]?.packageId === "T-PRINT-A-PKG-2", "print batch pending package detail was not preserved");

const listCalls = [];
const listResult = await listOfficeTodos(
  {
    authState,
    operatorId: "U-OFFICE-A",
    status: "all",
    localTodos: [],
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      listCalls.push({ url, init });
      return createJsonResponse(200, {
        items: [
          {
            todoId: "T-LIST-NOTIFY-1",
            type: "待通知客户",
            customerId: "C004",
            refType: "order_line",
            refId: "ORD-CHECK-1",
            handled: false,
            status: "open",
            priority: "normal",
            customerName: "美的空调网店",
            title: "待通知客户",
            summary: "成品图已确认",
            latestNeededAt: "明天 18:00",
            impact: "V1 人工发送客户通知",
            notificationCopyText: "客户通知文案",
            notificationChannel: "微信 / 企业微信人工发送",
            notificationStatus: "待人工发送",
            photoPrompt: "请附成品图",
            referenceStatus: "missing",
            allowedRefTypes: ["order_line"],
            resolvedRefTypeLabel: "订单行",
            referenceCandidates: [{ refType: "order_line", refId: "ORD-CHECK-1-01", label: "订单行 · ORD-CHECK-1-01" }],
            createdAt: "2026-07-01T00:00:00.000Z",
            waitingMinutes: 60,
            waitingLabel: "1小时",
            waitingSource: "created_at",
            reminderLevel: "red_dot",
            reminderLevelLabel: "红点提醒",
            activeSnooze: false,
            dueToday: false,
            overdue: false,
            serverSortRank: 400,
            serverSortIndex: 0,
          },
        ],
        page: 1,
        pageSize: 200,
        total: 1,
        reminderPolicy: {
          source: "server",
          version: "v1",
          redDotAfterMinutes: 30,
          followUpAfterMinutes: 1440,
          pinDueToday: true,
        },
      });
    },
  },
);

assert(listResult.source === "api", "todo list API client did not use API response");
assert(listCalls[0]?.url === "http://127.0.0.1:8787/api/todos?status=all&pageSize=200", "todo list API URL is incorrect");
assert(listResult.items[0]?.id === "T-LIST-NOTIFY-1", "todo list API id was not mapped");
assert(listResult.items[0]?.ref === "ORD-CHECK-1", "todo list API ref was not mapped");
assert(listResult.items[0]?.notificationCopyText === "客户通知文案", "todo list API notification copy text was not mapped");
assert(listResult.items[0]?.photoPrompt === "请附成品图", "todo list API photo prompt was not mapped");
assert(listResult.items[0]?.referenceCandidates[0]?.refId === "ORD-CHECK-1-01", "todo reference candidates were not mapped");
assert(listResult.items[0]?.allowedRefTypes[0] === "order_line", "todo allowed reference types were not mapped");
assert(listResult.items[0]?.resolvedRefTypeLabel === "订单行", "todo reference type label was not mapped");
assert(listResult.items[0]?.waitingMinutes === 60, "todo waiting minutes were not mapped");
assert(listResult.items[0]?.reminderLevel === "red_dot", "todo reminder level was not mapped");
assert(listResult.items[0]?.serverSortIndex === 0, "todo server sort index was not mapped");
assert(listResult.reminderPolicy?.followUpAfterMinutes === 1440, "todo reminder policy metadata was not mapped");

const apiCalls = [];
const apiResult = await handleOfficeTodoAction(
  {
    authState: {
      ...authState,
      session: { accessToken: "seed-session.todo-check" },
    },
    todoId: "T-CHECK-1",
    action: "处理完成",
    operatorId: "U-OFFICE-A",
    handlingResult: "处理完成",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      apiCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        todo: {
          todoId: "T-CHECK-1",
          type: "订单草稿待确认",
          refType: "order_draft",
          refId: "DRAFT-CHECK-1",
          handled: true,
          status: "handled",
          title: "订单草稿待确认",
          summary: "API check handled",
          createdAt: "2026-07-01T00:00:00.000Z",
        },
        operationLogId: "LOG-TODO-CHECK-1",
      });
    },
  },
);

assert(apiResult.source === "api", "handleOfficeTodoAction did not use the API response");
assert(apiCalls[0]?.url === "http://127.0.0.1:8787/api/todos/T-CHECK-1/handle", "todo handle API URL is incorrect");
assert(apiCalls[0]?.init.method === "POST", "todo handle API method is incorrect");
assert(apiCalls[0]?.init.headers.authorization === "Bearer seed-session.todo-check", "todo API did not send bearer auth");
assert(apiCalls[0]?.body.action === "mark_handled", "todo handle request action is incorrect");
assert(apiCalls[0]?.body.operatorId === "U-OFFICE-A", "todo handle request did not send operatorId");
assert(apiResult.todo.handled === true && apiResult.operationLogId === "LOG-TODO-CHECK-1", "todo handle API response was not mapped");

const repairCalls = [];
const repairResult = await repairOfficeTodoReference(
  {
    authState: { ...authState, session: { accessToken: "seed-session.todo-repair" } },
    todoId: "T-CHECK-REPAIR",
    refType: "order_line",
    refId: "ORD-CHECK-1-01",
    reason: "办公室核对原始消息",
    operatorId: "U-OFFICE-A",
    idempotencyKey: "todo-reference-repair-check-1",
  },
  {
    fetchImpl: async (url, init) => {
      repairCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        todo: {
          todoId: "T-CHECK-REPAIR",
          type: "订单异常",
          refType: "order_line",
          refId: "ORD-CHECK-1-01",
          referenceStatus: "valid",
          handled: false,
        },
        operationLogId: "LOG-TODO-REPAIR-CHECK-1",
      });
    },
  },
);
assert(repairCalls[0]?.url.endsWith("/todos/T-CHECK-REPAIR/reference"), "todo reference repair URL is incorrect");
assert(repairCalls[0]?.body.reason === "办公室核对原始消息", "todo reference repair reason was not sent");
assert(repairCalls[0]?.init.headers.authorization === "Bearer seed-session.todo-repair", "todo reference repair did not send bearer auth");
assert(repairResult.todo?.ref === "ORD-CHECK-1-01", "todo reference repair response was not mapped");

const fulfillmentRepairCalls = [];
const fulfillmentRepairResult = await repairOfficeTodoFulfillment(
  {
    authState: { ...authState, session: { accessToken: "seed-session.fulfillment-repair" } },
    todoId: "T-CHECK-FULFILLMENT-REPAIR",
    reason: "根据打包完成记录补建",
    operatorId: "U-OFFICE-A",
    idempotencyKey: "todo-fulfillment-repair-check-1",
  },
  {
    fetchImpl: async (url, init) => {
      fulfillmentRepairCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        todo: { todoId: "T-CHECK-FULFILLMENT-REPAIR", type: "出库交付待补建", handled: true, status: "handled" },
        labelTodo: { todoId: "T-LABEL-CHECK", type: "待打印标签", refType: "fulfillment", refId: "F-REPAIR-CHECK", handled: false },
        fulfillment: { fulfillmentId: "F-REPAIR-CHECK", orderLineId: "OL-REPAIR-CHECK", status: "待打印标签" },
        packageIds: ["PKG-REPAIR-CHECK-1", "PKG-REPAIR-CHECK-2"],
        operationLogId: "LOG-TODO-FULFILLMENT-REPAIR-CHECK",
      });
    },
  },
);
assert(fulfillmentRepairCalls[0]?.url.endsWith("/todos/T-CHECK-FULFILLMENT-REPAIR/fulfillment-repair"), "todo fulfillment repair URL is incorrect");
assert(fulfillmentRepairCalls[0]?.body.reason === "根据打包完成记录补建", "todo fulfillment repair reason was not sent");
assert(fulfillmentRepairCalls[0]?.init.headers.authorization === "Bearer seed-session.fulfillment-repair", "todo fulfillment repair did not send bearer auth");
assert(fulfillmentRepairResult.labelTodo?.ref === "F-REPAIR-CHECK", "todo fulfillment repair label todo was not mapped");
assert(fulfillmentRepairResult.fulfillment?.fulfillmentId === "F-REPAIR-CHECK", "todo fulfillment repair record was not mapped");
assert(fulfillmentRepairResult.packageIds.length === 2, "todo fulfillment repair package ids were not mapped");

const batchCalls = [];
const batchResult = await handleOfficeTodoBatch(
  {
    authState,
    todoIds: ["T-CHECK-2", "T-CHECK-3"],
    action: "批量打印标签",
    operatorId: "U-OFFICE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      batchCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        todo: {
          todoId: url.endsWith("T-CHECK-2/handle") ? "T-CHECK-2" : "T-CHECK-3",
          type: "待打印标签",
          refType: "fulfillment",
          refId: "F-CHECK",
          handled: true,
          status: "handled",
          title: "待打印标签",
          summary: "API check batch handled",
          createdAt: "2026-07-01T00:00:00.000Z",
        },
        operationLogId: `LOG-TODO-CHECK-${batchCalls.length + 1}`,
      });
    },
  },
);

assert(batchResult.source === "api", "handleOfficeTodoBatch did not use API responses");
assert(batchCalls.length === 2, "todo batch API did not handle each todo id");
assert(batchCalls[0]?.body.action === "batch_print_confirm", "todo batch request action is incorrect");
assert(batchResult.operationLogIds.length === 2, "todo batch API operation logs were not collected");

const pendingPrintCalls = [];
const pendingPrintResult = await handleOfficeTodoAction(
  {
    authState,
    todoId: "T-CHECK-6",
    action: "批量打印结果待处理",
    operatorId: "U-OFFICE-A",
    reason: "部分打出",
    handlingResult: "批量打印标签：已打出 1/2，剩余待重打",
    printResultStatus: "partial",
    printedLabelCount: 1,
    pendingLabelCount: 1,
    totalLabelCount: 2,
    printedPackageIds: ["PKG-CHECK-1"],
    pendingPackageIds: ["PKG-CHECK-2"],
    printPackages: [
      { packageId: "PKG-CHECK-1", packageSeq: 1, packageCount: 2, status: "printed" },
      { packageId: "PKG-CHECK-2", packageSeq: 2, packageCount: 2, status: "not_printed" },
    ],
  },
  {
    fetchImpl: async (url, init) => {
      pendingPrintCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        todo: {
          todoId: "T-CHECK-6",
          type: "待打印标签",
          refType: "fulfillment",
          refId: "F-CHECK",
          handled: false,
          status: "open",
          title: "待打印标签",
          summary: "API check pending print result",
          createdAt: "2026-07-01T00:00:00.000Z",
        },
        operationLogId: "LOG-TODO-CHECK-PENDING-1",
      });
    },
  },
);

assert(pendingPrintCalls[0]?.body.action === "batch_print_result_pending", "pending print API action is incorrect");
assert(pendingPrintCalls[0]?.body.printResultStatus === "partial", "pending print request status is incorrect");
assert(pendingPrintCalls[0]?.body.pendingLabelCount === 1, "pending print request count is incorrect");
assert(JSON.stringify(pendingPrintCalls[0]?.body.printedPackageIds) === JSON.stringify(["PKG-CHECK-1"]), "pending print request printed package ids are incorrect");
assert(JSON.stringify(pendingPrintCalls[0]?.body.pendingPackageIds) === JSON.stringify(["PKG-CHECK-2"]), "pending print request pending package ids are incorrect");
assert(pendingPrintResult.todo?.handled === false, "pending print response should keep todo open");

const notificationCalls = [];
const notificationCopyResult = await handleOfficeTodoAction(
  {
    authState,
    todoId: "T-CUSTOMER-NOTIFY-1",
    action: "复制通知话术",
    operatorId: "U-OFFICE-A",
    handlingResult: "已复制客户通知话术",
    notificationChannel: "微信 / 企业微信人工发送",
    notificationContent: "客户通知文案",
  },
  {
    fetchImpl: async (url, init) => {
      notificationCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        todo: {
          todoId: "T-CUSTOMER-NOTIFY-1",
          type: "待通知客户",
          refType: "order_line",
          refId: "ORD-CHECK-1",
          handled: false,
          status: "open",
          title: "待通知客户",
          summary: "API check customer notification copied",
          notificationCopyText: "客户通知文案",
          notificationStatus: "话术已复制",
          createdAt: "2026-07-01T00:00:00.000Z",
        },
        operationLogId: "LOG-TODO-CUSTOMER-NOTIFY-COPY-1",
      });
    },
  },
);

assert(notificationCalls[0]?.body.action === "customer_notification_copied", "customer notification copy API action is incorrect");
assert(notificationCalls[0]?.body.notificationContent === "客户通知文案", "customer notification copy content was not sent");
assert(notificationCopyResult.todo?.handled === false, "copying customer notification should keep todo open");

const customerPendingResult = await handleOfficeTodoAction(
  {
    authState,
    todoId: "T-CUSTOMER-NOTIFY-1",
    action: "客户待确认",
    operatorId: "U-OFFICE-A",
    handlingResult: "客户待确认",
  },
  {
    fetchImpl: async (url, init) => {
      notificationCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        todo: {
          todoId: "T-CUSTOMER-NOTIFY-1",
          handled: false,
          status: "open",
          reminder: "等待客户回复",
          lastAction: "客户待确认",
        },
        operationLogId: "LOG-TODO-CUSTOMER-PENDING-1",
      });
    },
  },
);
assert(notificationCalls[1]?.body.action === "customer_pending", "customer pending API action is incorrect");
assert(customerPendingResult.todo?.handled === false, "customer pending should keep the todo open");

const notificationSentResult = await handleOfficeTodoAction(
  {
    authState,
    todoId: "T-CUSTOMER-NOTIFY-1",
    action: "确认已通知客户",
    operatorId: "U-OFFICE-A",
    handlingResult: "已人工通知客户",
    notificationChannel: "微信 / 企业微信人工发送",
    notificationContent: "客户通知文案",
  },
  {
    fetchImpl: async (url, init) => {
      notificationCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        todo: {
          todoId: "T-CUSTOMER-NOTIFY-1",
          type: "待通知客户",
          refType: "order_line",
          refId: "ORD-CHECK-1",
          handled: true,
          status: "handled",
          title: "待通知客户",
          summary: "API check customer notification sent",
          notificationCopyText: "客户通知文案",
          notificationStatus: "已通知客户",
          createdAt: "2026-07-01T00:00:00.000Z",
        },
        operationLogId: "LOG-TODO-CUSTOMER-NOTIFY-SENT-1",
      });
    },
  },
);

assert(notificationCalls[2]?.body.action === "customer_notification_sent", "customer notification sent API action is incorrect");
assert(notificationCalls[2]?.body.notificationChannel === "微信 / 企业微信人工发送", "customer notification channel was not sent");
assert(notificationSentResult.todo?.handled === true, "sent customer notification should close todo");

const printBatchCalls = [];
const printBatchApiResult = await createOfficePrintBatchRecord(
  {
    authState,
    operatorId: "U-OFFICE-A",
    printBatchRecord: printBatchDraft,
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async (url, init) => {
      printBatchCalls.push({ url, init, body: JSON.parse(init.body) });
      return createJsonResponse(200, {
        printBatchRecord: {
          ...printBatchDraft,
          operationLogId: "LOG-PRINT-BATCH-CHECK-1",
        },
        operationLogId: "LOG-PRINT-BATCH-CHECK-1",
      });
    },
  },
);

assert(printBatchApiResult.source === "api", "print batch API client did not use API response");
assert(printBatchCalls[0]?.url === "http://127.0.0.1:8787/api/print-batches", "print batch API URL is incorrect");
assert(printBatchCalls[0]?.init.method === "POST", "print batch API method is incorrect");
assert(printBatchCalls[0]?.body.printBatchId === "PB-CHECK-1", "print batch request id is incorrect");
assert(JSON.stringify(printBatchCalls[0]?.body.pendingPackageIds) === JSON.stringify(["T-PRINT-A-PKG-2"]), "print batch request pending package ids are incorrect");
assert(printBatchApiResult.printBatchRecord.operationLogId === "LOG-PRINT-BATCH-CHECK-1", "print batch API response was not mapped");

const strictPrintBatchResult = await createOfficePrintBatchRecord(
  {
    authState,
    operatorId: "U-OFFICE-A",
    printBatchRecord: printBatchDraft,
  },
  strictOfflineOptions(),
);

assert(strictPrintBatchResult.blocked === true, "strict print batch creation must not use the local projection");
assert(strictPrintBatchResult.source === "api_error", "strict print batch creation should report an API error");
assert(strictPrintBatchResult.error?.code === "PRINT_BATCH_API_UNAVAILABLE", "strict print batch creation reported the wrong API error");

const deniedResult = await handleOfficeTodoAction(
  {
    authState,
    todoId: "T-CHECK-4",
    action: "处理完成",
    operatorId: "U-FINANCE-A",
  },
  {
    apiBaseUrl: "http://127.0.0.1:8787/api",
    fetchImpl: async () =>
      createJsonResponse(403, {
        code: "PERMISSION_DENIED",
        message: "Missing action permission: todo.handle",
        requiredPermission: "todo.handle",
      }),
  },
);

assert(deniedResult.blocked === true, "todo API permission denial should block local fallback");
assert(deniedResult.error.requiredPermission === "todo.handle", "todo permission denial was not surfaced");

const fallbackResult = await handleOfficeTodoAction(
  {
    authState,
    todoId: "T-CHECK-5",
    action: "稍后30分钟",
    operatorId: "U-OFFICE-A",
  },
  {
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  },
);

assert(fallbackResult.source === "local_fallback", "todo network failure should fall back to local handling");

const strictFallbackResult = await handleOfficeTodoAction(
  {
    authState,
    todoId: "T-CHECK-STRICT-1",
    action: "处理完成",
    operatorId: "U-OFFICE-A",
  },
  strictOfflineOptions(),
);

assert(strictFallbackResult.blocked === true, "strict todo handling must not use the local projection");
assert(strictFallbackResult.source === "api_error", "strict todo handling should report an API error");
assert(strictFallbackResult.error?.code === "TODO_HANDLE_API_UNAVAILABLE", "strict todo handling reported the wrong API error");

const strictBatchFallbackResult = await handleOfficeTodoBatch(
  {
    authState,
    todoIds: ["T-CHECK-STRICT-2", "T-CHECK-STRICT-3"],
    action: "批量打印标签",
    operatorId: "U-OFFICE-A",
  },
  strictOfflineOptions(),
);

assert(strictBatchFallbackResult.blocked === true, "strict todo batch handling must not use the local projection");
assert(strictBatchFallbackResult.source === "api_error", "strict todo batch handling should report an API error");
assert(strictBatchFallbackResult.error?.code === "TODO_HANDLE_API_UNAVAILABLE", "strict todo batch handling reported the wrong API error");

console.log("Frontend todo API client check passed: action mapping, customer notification actions, print-result confirmation, print batch records, API calls, denial blocking, batch handling, and local fallback are covered.");

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function strictOfflineOptions() {
  return {
    serverRequired: true,
    fetchImpl: async () => {
      throw new Error("api offline");
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
