export const todoReminderLabels = {
  稍后30分钟: "30 分钟后",
  稍后2小时: "2 小时后",
  稍后明早: "明早 09:00",
  稍后指定时间: "今天 17:30",
};

export function getNextOpenTodoId(todos, excludedIds, sortTodos) {
  const excluded = new Set(Array.isArray(excludedIds) ? excludedIds : [excludedIds]);
  return sortTodos(todos).find((item) => !excluded.has(item.id) && !item.handled)?.id ?? "";
}

export function markTodoHandled(todos, todoId, action, operatorName = "办公室A") {
  return todos.map((item) =>
    item.id === todoId
      ? {
          ...item,
          handled: true,
          handledBy: operatorName,
          handledAt: "今天 10:30",
          lastAction: action,
        }
      : item,
  );
}

export function reopenTodo(todos, todoId) {
  return todos.map((item) => (item.id === todoId ? { ...item, handled: false, handledBy: "", handledAt: "", lastAction: "重新打开" } : item));
}

export function batchHandlePrintTodos(todos, isPrintTodo, operatorName = "办公室A") {
  const printTodos = todos.filter((item) => !item.handled && isPrintTodo(item));
  const printIds = new Set(printTodos.map((item) => item.id));
  return {
    printTodos,
    printIds,
    todos: todos.map((item) =>
      printIds.has(item.id)
        ? {
            ...item,
            handled: true,
            handledBy: operatorName,
            handledAt: "今天 10:30",
            lastAction: "批量打印标签",
          }
        : item,
    ),
  };
}

export function getTodoPrintLabelCount(todo) {
  const pendingPackages = getTodoPrintPackages(todo);
  if (pendingPackages.length) return pendingPackages.length;
  if (normalizeTodoPrintPackages(todo).length) return 0;
  return getTodoPrintLabelCountFromFields(todo);
}

export function getTodoPrintPackages(todo) {
  const packages = getTodoAllPrintPackages(todo);
  return packages.filter((item) => item.status !== "printed");
}

export function getTodoAllPrintPackages(todo) {
  const packages = normalizeTodoPrintPackages(todo);
  if (packages.length) return packages;
  const count = getTodoPrintLabelCountFromFields(todo);
  return buildDefaultPrintPackages(todo, count, count);
}

export function getBatchPrintPackageRows(printTodos = []) {
  return printTodos.flatMap((todo) =>
    getTodoPrintPackages(todo).map((item) => ({
      ...item,
      todoId: todo.id,
      todoType: todo.type,
      todoRef: todo.ref,
      customerId: todo.customerId,
      summary: todo.summary,
    })),
  );
}

function getTodoPrintLabelCountFromFields(todo) {
  const pendingCount = Number(todo?.pendingLabelCount ?? 0);
  if (["partial", "not_printed", "unknown"].includes(todo?.printResultStatus) && Number.isFinite(pendingCount) && pendingCount > 0) {
    return Math.floor(pendingCount);
  }
  const explicitCount = Number(todo?.labelCount ?? todo?.printLabelCount ?? 0);
  if (Number.isFinite(explicitCount) && explicitCount > 0) return Math.floor(explicitCount);
  const text = [todo?.packages, todo?.summary, todo?.title, todo?.type].filter(Boolean).join(" ");
  const packageMatch = text.match(/(\d+)\s*包/);
  if (packageMatch) return Math.max(1, Number(packageMatch[1]));
  const labelMatch = text.match(/(\d+)\s*张/);
  if (labelMatch) return Math.max(1, Number(labelMatch[1]));
  return 1;
}

export function getBatchPrintStats(printTodos = []) {
  const packageRows = getBatchPrintPackageRows(printTodos);
  const totalLabels = packageRows.length || printTodos.reduce((sum, todo) => sum + getTodoPrintLabelCount(todo), 0);
  return {
    totalTasks: printTodos.length,
    totalLabels,
    totalPackages: totalLabels,
  };
}

export function applyBatchPrintResult(todos, isPrintTodo, input = {}) {
  const candidateIds = new Set(input.todoIds ?? []);
  const printTodos = todos.filter((item) => !item.handled && isPrintTodo(item) && (!candidateIds.size || candidateIds.has(item.id)));
  const result = input.result ?? "全部打出";
  const stats = getBatchPrintStats(printTodos);
  const selectedPackageIds = new Set(input.printedPackageIds ?? []);
  const hasSelectedPackageIds = selectedPackageIds.size > 0;
  const todoPackageRows = new Map(printTodos.map((todo) => [todo.id, getTodoPrintPackages(todo)]));
  const printedLabelLimit =
    result === "全部打出"
      ? stats.totalLabels
      : result === "部分打出"
        ? clampInteger(input.printedLabelCount, 0, stats.totalLabels)
        : 0;
  let remainingPrintedLabels = printedLabelLimit;
  const fullyPrintedIds = new Set();
  const partialPrinted = new Map();
  const notPrintedIds = new Set();
  const attemptedPackageIdsByTodo = new Map();
  const printedPackageIdsByTodo = new Map();

  for (const todo of printTodos) {
    const packageRows = todoPackageRows.get(todo.id) ?? [];
    const labelCount = packageRows.length || getTodoPrintLabelCount(todo);
    const attemptedPackageIds = new Set(packageRows.map((item) => item.packageId));
    const printedPackageIds =
      result === "全部打出"
        ? new Set(packageRows.map((item) => item.packageId))
        : result === "部分打出" && hasSelectedPackageIds
          ? new Set(packageRows.filter((item) => selectedPackageIds.has(item.packageId)).map((item) => item.packageId))
          : result === "部分打出"
            ? new Set(packageRows.slice(0, Math.min(labelCount, remainingPrintedLabels)).map((item) => item.packageId))
            : new Set();
    const printedForTodo = packageRows.length ? printedPackageIds.size : Math.min(labelCount, remainingPrintedLabels);
    remainingPrintedLabels -= printedForTodo;
    attemptedPackageIdsByTodo.set(todo.id, attemptedPackageIds);
    printedPackageIdsByTodo.set(todo.id, printedPackageIds);
    if (printedForTodo >= labelCount) {
      fullyPrintedIds.add(todo.id);
    } else if (printedForTodo > 0) {
      partialPrinted.set(todo.id, { printedForTodo, labelCount });
    } else {
      notPrintedIds.add(todo.id);
    }
  }

  const todosAfterResult = todos.map((item) => {
    if (fullyPrintedIds.has(item.id)) {
      const printPackages = applyPrintPackageResult(item, attemptedPackageIdsByTodo.get(item.id), printedPackageIdsByTodo.get(item.id), result);
      return {
        ...item,
        handled: true,
        handledBy: input.operatorName ?? "办公室A",
        handledAt: "今天 10:30",
        lastAction: result === "全部打出" ? "批量打印标签：全部打出" : "批量打印标签：已完整打出",
        printResultStatus: "printed",
        printedLabelCount: printPackages.filter((pkg) => pkg.status === "printed").length,
        pendingLabelCount: 0,
        printPackages,
        printedPackageIds: printPackages.filter((pkg) => pkg.status === "printed").map((pkg) => pkg.packageId),
        pendingPackageIds: [],
      };
    }
    if (partialPrinted.has(item.id)) {
      const detail = partialPrinted.get(item.id);
      const printPackages = applyPrintPackageResult(item, attemptedPackageIdsByTodo.get(item.id), printedPackageIdsByTodo.get(item.id), result);
      const pendingPackageIds = printPackages.filter((pkg) => pkg.status !== "printed").map((pkg) => pkg.packageId);
      return {
        ...item,
        handled: false,
        urgency: item.urgency === "异常" ? item.urgency : "今天",
        reminder: "部分未打出，待重打",
        lastAction: `批量打印标签：已打出 ${detail.printedForTodo}/${detail.labelCount}，剩余待重打`,
        printResultStatus: "partial",
        printedLabelCount: detail.printedForTodo,
        pendingLabelCount: pendingPackageIds.length,
        printPackages,
        printedPackageIds: printPackages.filter((pkg) => pkg.status === "printed").map((pkg) => pkg.packageId),
        pendingPackageIds,
      };
    }
    if (notPrintedIds.has(item.id) && result === "不确定") {
      const printPackages = applyPrintPackageResult(item, attemptedPackageIdsByTodo.get(item.id), printedPackageIdsByTodo.get(item.id), result);
      const pendingPackageIds = printPackages.filter((pkg) => pkg.status !== "printed").map((pkg) => pkg.packageId);
      return {
        ...item,
        handled: false,
        urgency: "异常",
        reminder: "打印异常待核对",
        lastAction: "批量打印标签：结果不确定，先核对后重打",
        printResultStatus: "unknown",
        printedLabelCount: 0,
        pendingLabelCount: pendingPackageIds.length,
        printPackages,
        printedPackageIds: printPackages.filter((pkg) => pkg.status === "printed").map((pkg) => pkg.packageId),
        pendingPackageIds,
      };
    }
    if (notPrintedIds.has(item.id)) {
      const printPackages = applyPrintPackageResult(item, attemptedPackageIdsByTodo.get(item.id), printedPackageIdsByTodo.get(item.id), result);
      const pendingPackageIds = printPackages.filter((pkg) => pkg.status !== "printed").map((pkg) => pkg.packageId);
      return {
        ...item,
        handled: false,
        reminder: "未打出，待重打",
        lastAction: "批量打印标签：没打出，待重打",
        printResultStatus: "not_printed",
        printedLabelCount: 0,
        pendingLabelCount: pendingPackageIds.length,
        printPackages,
        printedPackageIds: printPackages.filter((pkg) => pkg.status === "printed").map((pkg) => pkg.packageId),
        pendingPackageIds,
      };
    }
    return item;
  });
  const allPrintPackages = todosAfterResult.flatMap((item) => (candidateIds.has(item.id) || (!candidateIds.size && isPrintTodo(item)) ? item.printPackages ?? [] : []));

  return {
    printTodos,
    fullPrintedTodos: printTodos.filter((item) => fullyPrintedIds.has(item.id)),
    fullyPrintedIds,
    printedLabelCount: printedLabelLimit,
    pendingLabelCount: Math.max(0, stats.totalLabels - printedLabelLimit),
    totalLabels: stats.totalLabels,
    totalTasks: stats.totalTasks,
    printedPackageIds: allPrintPackages.filter((pkg) => pkg.status === "printed").map((pkg) => pkg.packageId),
    pendingPackageIds: allPrintPackages.filter((pkg) => pkg.status !== "printed").map((pkg) => pkg.packageId),
    todos: todosAfterResult,
  };
}

export function createPrintBatchRecord(input = {}) {
  const resultLabel = input.resultLabel ?? input.result ?? "全部打出";
  const printPackages = normalizePrintBatchPackages(input.printPackages);
  const printedPackageIds = normalizePrintBatchPackageIds(
    input.printedPackageIds,
    printPackages.filter((item) => item.status === "printed").map((item) => item.packageId),
  );
  const pendingPackageIds = normalizePrintBatchPackageIds(
    input.pendingPackageIds,
    printPackages.filter((item) => item.status !== "printed").map((item) => item.packageId),
  );
  const inferredTotalLabelCount =
    printPackages.length ||
    printedPackageIds.length + pendingPackageIds.length ||
    Number(input.printedLabelCount ?? 0) + Number(input.pendingLabelCount ?? 0);
  const totalLabelCount = clampInteger(input.totalLabelCount ?? input.totalLabels ?? inferredTotalLabelCount, 0, Number.MAX_SAFE_INTEGER);
  const printedLabelCount = clampInteger(input.printedLabelCount ?? printedPackageIds.length, 0, totalLabelCount);
  const pendingLabelCount = clampInteger(input.pendingLabelCount ?? Math.max(0, totalLabelCount - printedLabelCount), 0, totalLabelCount);
  const status = getPrintBatchRecordStatus(resultLabel, printedLabelCount, pendingLabelCount);
  const operatorName = input.operatorName ?? input.operatorId ?? "办公室A";
  const createdAt = input.createdAt ?? "今天 10:30";
  const printBatchId = input.printBatchId ?? buildPrintBatchRecordId(input, createdAt);

  return {
    printBatchId,
    action: input.action ?? "批量打印标签",
    resultLabel,
    status,
    todoIds: normalizePrintBatchPackageIds(input.todoIds),
    todoRefs: normalizePrintBatchPackageIds(input.todoRefs),
    totalTaskCount: clampInteger(input.totalTaskCount ?? input.totalTasks ?? 0, 0, Number.MAX_SAFE_INTEGER),
    totalLabelCount,
    printedLabelCount,
    pendingLabelCount,
    printedPackageIds,
    pendingPackageIds,
    printPackages,
    printedPackages: pickPrintBatchPackages(printPackages, printedPackageIds),
    pendingPackages: pickPrintBatchPackages(printPackages, pendingPackageIds),
    summary: buildPrintBatchRecordSummary(resultLabel, printedLabelCount, pendingLabelCount, totalLabelCount),
    operatorId: input.operatorId ?? "",
    operatorName,
    createdAt,
    operationLogId: input.operationLogId ?? "",
  };
}

export function getPrintBatchRecordsForTodo(records = [], todoId) {
  if (!todoId) return [];
  return records.filter((record) => Array.isArray(record?.todoIds) && record.todoIds.includes(todoId));
}

export function formatPrintBatchPackageList(packages = [], fallbackIds = []) {
  const rows = Array.isArray(packages) && packages.length ? packages : normalizePrintBatchPackageIds(fallbackIds).map((packageId) => ({ packageId }));
  if (!rows.length) return "无";
  return rows
    .map((item) => item.labelText ?? (item.packageSeq && item.packageCount ? `第 ${item.packageSeq}/${item.packageCount} 包` : item.packageId))
    .filter(Boolean)
    .join("、");
}

export function snoozeTodo(todos, todoId, action) {
  const reminder = todoReminderLabels[action] ?? "稍后";
  return {
    reminder,
    todos: todos.map((item) =>
      item.id === todoId
        ? {
            ...item,
            reminder,
            lastAction: `稍后提醒：${reminder}`,
          }
        : item,
    ),
  };
}

function clampInteger(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function normalizeTodoPrintPackages(todo) {
  const packages = Array.isArray(todo?.printPackages) ? todo.printPackages : [];
  if (!packages.length) return [];
  const fallbackCount = packages.length;
  return packages.map((item, index) => {
    const packageSeq = Math.max(1, Math.trunc(Number(item.packageSeq ?? index + 1)) || index + 1);
    const packageCount = Math.max(fallbackCount, Math.trunc(Number(item.packageCount ?? fallbackCount)) || fallbackCount);
    const packageId = String(item.packageId ?? `${todo?.id ?? todo?.ref ?? "PRINT"}-PKG-${packageSeq}`);
    return {
      ...item,
      packageId,
      packageSeq,
      packageCount,
      labelText: item.labelText ?? `第 ${packageSeq}/${packageCount} 包`,
      status: normalizePrintPackageStatus(item.status),
    };
  });
}

function buildDefaultPrintPackages(todo, count, packageCount) {
  const safeCount = Math.max(1, Math.trunc(Number(count || 1)));
  const safePackageCount = Math.max(safeCount, Math.trunc(Number(packageCount || safeCount)));
  const baseId = String(todo?.ref ?? todo?.id ?? "PRINT").replace(/[^\w-]+/g, "-");
  return Array.from({ length: safeCount }, (_, index) => {
    const packageSeq = index + 1;
    return {
      packageId: `${baseId}-PKG-${packageSeq}`,
      packageSeq,
      packageCount: safePackageCount,
      labelText: `第 ${packageSeq}/${safePackageCount} 包`,
      status: "pending",
    };
  });
}

function normalizePrintPackageStatus(status) {
  if (status === "printed") return "printed";
  if (status === "exception" || status === "unknown") return "exception";
  if (status === "not_printed") return "not_printed";
  return "pending";
}

function normalizePrintBatchPackages(packages) {
  if (!Array.isArray(packages)) return [];
  const fallbackCount = packages.length;
  return packages
    .filter((item) => item && (item.packageId || item.labelText || item.packageSeq))
    .map((item, index) => {
      const packageSeq = Math.max(1, Math.trunc(Number(item.packageSeq ?? index + 1)) || index + 1);
      const packageCount = Math.max(fallbackCount, Math.trunc(Number(item.packageCount ?? fallbackCount)) || fallbackCount);
      return {
        ...item,
        packageId: String(item.packageId ?? `PKG-${packageSeq}`),
        packageSeq,
        packageCount,
        labelText: item.labelText ?? `第 ${packageSeq}/${packageCount} 包`,
        status: normalizePrintPackageStatus(item.status),
      };
    });
}

function normalizePrintBatchPackageIds(ids, fallback = []) {
  const source = Array.isArray(ids) ? ids : fallback;
  return [...new Set(source.map((item) => String(item ?? "").trim()).filter(Boolean))];
}

function pickPrintBatchPackages(packages, ids) {
  const packageMap = new Map(packages.map((item) => [item.packageId, item]));
  return ids.map((packageId) => packageMap.get(packageId) ?? { packageId, labelText: packageId });
}

function getPrintBatchRecordStatus(resultLabel, printedLabelCount, pendingLabelCount) {
  if (resultLabel === "不确定") return "exception";
  if (resultLabel === "没打出" || (printedLabelCount === 0 && pendingLabelCount > 0)) return "not_printed";
  if (pendingLabelCount > 0) return "partial";
  return "printed";
}

function buildPrintBatchRecordSummary(resultLabel, printedLabelCount, pendingLabelCount, totalLabelCount) {
  if (resultLabel === "不确定") return `结果不确定：需核对 ${totalLabelCount} 张`;
  if (resultLabel === "没打出") return `没打出：0/${totalLabelCount}，全部待重打`;
  if (pendingLabelCount > 0) return `部分打出：已打出 ${printedLabelCount}/${totalLabelCount}，待重打 ${pendingLabelCount}`;
  return `全部打出：已打出 ${printedLabelCount}/${totalLabelCount}`;
}

function buildPrintBatchRecordId(input, createdAt) {
  const seed = input.sequence ?? input.batchSequence ?? input.totalTaskCount ?? Date.now();
  const safeDate = String(input.dateKey ?? createdAt ?? "PB").replace(/[^\dA-Za-z]+/g, "").slice(0, 12) || "LOCAL";
  return `PB-${safeDate}-${String(seed).replace(/[^a-z0-9]+/gi, "-")}`;
}

function applyPrintPackageResult(todo, attemptedPackageIds = new Set(), printedPackageIds = new Set(), result = "全部打出") {
  return getTodoAllPrintPackages(todo).map((item) => {
    if (!attemptedPackageIds.has(item.packageId)) return item;
    if (printedPackageIds.has(item.packageId)) {
      return {
        ...item,
        status: "printed",
        printedAt: "今天 10:30",
      };
    }
    return {
      ...item,
      status: result === "不确定" ? "exception" : "not_printed",
      printedAt: "",
    };
  });
}

export function markTodoManagementViewed(todos, todoId) {
  return todos.map((item) => (item.id === todoId ? { ...item, lastAction: "管理查看已提示" } : item));
}

export function markTodoCustomerPending(todos, todoId) {
  return todos.map((item) => (item.id === todoId ? { ...item, lastAction: "客户待确认", reminder: "等待客户回复" } : item));
}

export function markTodoNotificationCopyPrepared(todos, todoId, input = {}) {
  return todos.map((item) =>
    item.id === todoId
      ? {
          ...item,
          notificationCopyText: input.notificationCopyText ?? item.notificationCopyText ?? "",
          notificationChannel: input.notificationChannel ?? item.notificationChannel ?? "微信 / 企业微信人工发送",
          notificationStatus: "话术已复制",
          notificationCopiedBy: input.operatorName ?? "办公室A",
          notificationCopiedAt: input.copiedAt ?? "今天 10:30",
          lastAction: "已复制客户通知话术",
        }
      : item,
  );
}

export function markTodoCustomerNotificationSent(todos, todoId, input = {}) {
  return todos.map((item) =>
    item.id === todoId
      ? {
          ...item,
          handled: true,
          handledBy: input.operatorName ?? "办公室A",
          handledAt: input.notifiedAt ?? "今天 10:30",
          notificationCopyText: input.notificationCopyText ?? item.notificationCopyText ?? "",
          notificationChannel: input.notificationChannel ?? item.notificationChannel ?? "微信 / 企业微信人工发送",
          notificationStatus: "已通知客户",
          notifiedBy: input.operatorName ?? "办公室A",
          notifiedAt: input.notifiedAt ?? "今天 10:30",
          lastAction: "已人工通知客户",
        }
      : item,
  );
}
