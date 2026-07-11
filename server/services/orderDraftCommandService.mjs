import { createHash } from "node:crypto";

export function createOrderDraftCommandService(dependencies = {}) {
  const {
    buildCustomerSnapshot,
    buildOperationLog,
    buildTodo,
    confirmDraftOrder,
    findCustomerName,
    findInventoryItem,
    findMatchingInventory,
    mapFulfillmentMethod,
    mapPrintSide,
    nextId,
    nextPlainId,
    parseOrderText,
    toFulfillmentTaskSummary,
    toInventoryCheckResult,
    toInventoryReservationTransactionSummary,
    toOrderLineSummary,
    toPriceSnapshot,
    toTodoSummary,
    now = () => new Date(),
  } = dependencies;
  for (const [name, value] of Object.entries({
    buildCustomerSnapshot,
    buildOperationLog,
    buildTodo,
    confirmDraftOrder,
    findCustomerName,
    findInventoryItem,
    findMatchingInventory,
    mapFulfillmentMethod,
    mapPrintSide,
    nextId,
    nextPlainId,
    parseOrderText,
    toFulfillmentTaskSummary,
    toInventoryCheckResult,
    toInventoryReservationTransactionSummary,
    toOrderLineSummary,
    toPriceSnapshot,
    toTodoSummary,
  })) {
    requireFunction(value, name);
  }

  return {
    recognizeOrderDraft,
    saveOrderDraft,
    confirmOrderDraft,
  };

  async function recognizeOrderDraft({ workspace, body = {}, operatorId }) {
    const sourceText = body.sourceText ?? body.text ?? workspace.sampleText;
    const lines = parseOrderText(sourceText, {
      customers: workspace.customers,
      inventories: workspace.inventories,
    });
    const draftId =
      body.draftId ??
      (body.idempotencyKey
        ? `DRAFT-API-${createHash("sha256").update(body.idempotencyKey).digest("hex").slice(0, 16).toUpperCase()}`
        : nextId("DRAFT-API", workspace.orderDrafts));
    const customerId = body.customerId ?? lines[0]?.customerId ?? "";
    const draft = buildDraftProjection(null, {
      id: draftId,
      draftId,
      sourceText,
      sourceChannel: body.sourceChannel ?? "manual",
      sourceMessageId: body.sourceMessageId ?? "",
      customerId,
      customerName: findCustomerName(workspace, customerId),
      status: "待审核",
      lines,
      revision: 0,
      clientRevision: 0,
      createdBy: operatorId,
    });
    const operationLog = buildOperationLog(workspace, {
      id: buildDraftOperationLogId("recognize", draftId, 1, body.idempotencyKey),
      targetType: "order_draft",
      targetId: draftId,
      action: "recognize_order_draft",
      operatorId,
      after: { lineCount: lines.length, sourceText },
    });
    const transaction = await workspace.orderDraftRepository.saveOrderDraft({
      workspace,
      draft,
      expectedRevision: 0,
      todos: [],
      operationLog,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
    });
    const savedLines = transaction.draft.lines;

    return success({
      draft: summarizeDraft(transaction.draft),
      lines: savedLines.map(toRecognizedDraftLine),
      riskHints: buildDraftRiskHints(savedLines),
      operationLogId: transaction.operationLogId,
    });
  }

  async function saveOrderDraft({ workspace, draftId, body = {}, operatorId }) {
    const lines = normalizeDraftRows(body.lines ?? [], workspace, body);
    if (!lines.length) {
      return businessError(422, "VALIDATION_ERROR", "lines must contain at least one draft line");
    }
    const expectedRevision = parseDraftExpectedRevision(body.clientRevision);
    if (!expectedRevision) {
      return businessError(422, "VALIDATION_ERROR", "clientRevision must be a positive integer");
    }
    const previous = await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId });
    if (!previous) return notFound("ORDER_DRAFT_NOT_FOUND");
    const draft = buildDraftProjection(previous, {
      id: draftId,
      draftId,
      sourceText: body.sourceText ?? previous.sourceText ?? "",
      sourceChannel: body.sourceChannel ?? previous.sourceChannel ?? "manual",
      sourceMessageId: body.sourceMessageId ?? previous.sourceMessageId ?? "",
      customerId: body.customerId ?? previous.customerId ?? lines[0]?.customerId ?? "",
      customerName: findCustomerName(
        workspace,
        body.customerId ?? previous.customerId ?? lines[0]?.customerId,
      ),
      status: body.draftStatus ?? "待审核",
      lines,
      revision: expectedRevision,
      clientRevision: expectedRevision,
    });
    const todos = draft.status === "待补充信息" ? [buildDraftTodo(workspace, draft, lines, operatorId)] : [];
    const operationLog = buildOperationLog(workspace, {
      id: buildDraftOperationLogId("save", draftId, expectedRevision + 1, body.idempotencyKey),
      targetType: "order_draft",
      targetId: draftId,
      action: "save_order_draft",
      operatorId,
      before: previous,
      after: summarizeDraft(draft),
      reason: body.saveReason,
    });
    const transaction = await workspace.orderDraftRepository.saveOrderDraft({
      workspace,
      draft,
      expectedRevision,
      todos,
      operationLog,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
    });

    return success({
      draft: summarizeDraft(transaction.draft),
      todos: transaction.todos.map(toTodoSummary),
      operationLogId: transaction.operationLogId,
    });
  }

  async function confirmOrderDraft({ workspace, draftId, body = {}, operatorId }) {
    const lines = normalizeDraftRows(body.lines ?? [], workspace, body);
    if (!lines.length) {
      return businessError(422, "VALIDATION_ERROR", "lines must contain at least one draft line");
    }
    const expectedRevision = parseDraftExpectedRevision(body.clientRevision);
    if (!expectedRevision) {
      return businessError(422, "VALIDATION_ERROR", "clientRevision must be a positive integer");
    }
    const previous = await workspace.orderDraftRepository.getOrderDraft({ workspace, draftId });
    if (!previous) return notFound("ORDER_DRAFT_NOT_FOUND");
    const confirmation = confirmDraftOrder({
      draftRows: lines,
      inventoryRecords: workspace.inventories,
      orderLines: workspace.orderLines,
      fulfillments: workspace.fulfillments,
      customers: workspace.customers,
    });
    if (confirmation.blocked) {
      const blockedDraft = buildDraftProjection(previous, {
        id: draftId,
        draftId,
        sourceText: body.sourceText ?? previous.sourceText ?? "",
        customerId: body.customerId ?? previous.customerId ?? lines[0]?.customerId ?? "",
        customerName: findCustomerName(
          workspace,
          body.customerId ?? previous.customerId ?? lines[0]?.customerId,
        ),
        status: confirmation.draftStatus,
        lines: confirmation.checkedRows,
        revision: expectedRevision,
        clientRevision: expectedRevision,
      });
      const operationLog = buildOperationLog(workspace, {
        id: buildDraftOperationLogId("blocked", draftId, expectedRevision + 1, body.idempotencyKey),
        targetType: "order_draft",
        targetId: draftId,
        action: "block_order_draft_confirmation",
        operatorId,
        before: summarizeDraft(previous),
        after: summarizeDraft(blockedDraft),
        reason: confirmation.toast,
      });
      await workspace.orderDraftRepository.saveOrderDraft({
        workspace,
        draft: blockedDraft,
        expectedRevision,
        todos: [],
        operationLog,
        idempotencyKey: body.idempotencyKey,
        idempotencyPayload: { ...body, operatorId },
      });
      return businessError(409, "ORDER_DRAFT_BLOCKED", confirmation.toast);
    }

    const confirmedDraft = buildDraftProjection(previous, {
      id: draftId,
      draftId,
      sourceText: body.sourceText ?? previous.sourceText ?? "",
      customerId: body.customerId ?? previous.customerId ?? lines[0]?.customerId ?? "",
      customerName: findCustomerName(
        workspace,
        body.customerId ?? previous.customerId ?? lines[0]?.customerId,
      ),
      status: confirmation.draftStatus,
      lines: confirmation.checkedRows,
      generatedOrderNo: confirmation.orderNo,
      revision: expectedRevision,
      clientRevision: expectedRevision,
    });
    const operationLog = buildOperationLog(workspace, {
      id: buildDraftOperationLogId("confirm", draftId, expectedRevision + 1, body.idempotencyKey),
      targetType: "order_draft",
      targetId: draftId,
      action: "confirm_order_draft",
      operatorId,
      after: { orderNo: confirmation.orderNo, lineCount: confirmation.newLines.length },
    });
    const priceSnapshots = confirmation.newLines.map((line) => ({
      ...toPriceSnapshot(line),
      priceSnapshotId: `PS-${line.id}`,
      snapshotType: "order_confirm",
      versionNo: 1,
      chargeableQty: Number(line.qty ?? 0),
      finalAmount: Number(line.amount ?? 0),
      createdBy: operatorId,
    }));
    const inventoryReservations = buildInventoryReservations(
      workspace,
      confirmation.checkedRows,
      confirmation.newLines,
      operatorId,
    );
    const inventoryLedgerEntries = buildInventoryLedgerEntries(
      workspace,
      inventoryReservations,
      operatorId,
    );
    const todos = buildConfirmationTodos(workspace, confirmation.shortageTodoInputs, operatorId);
    const transaction = await workspace.orderConfirmationTransactionRepository.confirmOrder({
      workspace,
      idempotencyKey: body.idempotencyKey,
      idempotencyPayload: { ...body, operatorId },
      orderDraft: confirmedDraft,
      expectedDraftRevision: expectedRevision,
      order: buildConfirmedOrderRecord(workspace, draftId, confirmation, body, operatorId),
      orderLines: confirmation.newLines.map((line) => ({ ...line, createdBy: operatorId })),
      priceSnapshots,
      fulfillmentRecords: confirmation.newFulfillments.map((fulfillment) => ({
        ...fulfillment,
        expectedQty: fulfillment.qty,
        createdBy: operatorId,
        customerSnapshot: buildCustomerSnapshot(workspace, fulfillment.customerId),
      })),
      inventoryReservations,
      inventoryLedgerEntries,
      todos,
      operationLog,
    });

    return success({
      orderId: transaction.order.orderId,
      orderSummaryStatus: "处理中",
      orderLines: confirmation.newLines.map(toOrderLineSummary),
      priceSnapshots: confirmation.newLines.map(toPriceSnapshot),
      inventoryChecks: confirmation.checkedRows.map((line, index) =>
        toInventoryCheckResult(workspace, line, confirmation.newLines[index]),
      ),
      reservations: transaction.inventoryReservations.map(toInventoryReservationTransactionSummary),
      fulfillmentTasks: confirmation.newFulfillments.map(toFulfillmentTaskSummary),
      todos: transaction.todos.map(toTodoSummary),
      operationLogIds: [transaction.operationLogId],
    });
  }

  function buildDraftProjection(previous, draft) {
    const timestamp = nowIso(now);
    return {
      ...(previous ?? {}),
      ...draft,
      createdAt: previous?.createdAt ?? draft.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
  }

  function normalizeDraftRows(lines, workspace, body) {
    return lines.map((line, index) => {
      const customerId = line.customerId ?? body.customerId ?? "";
      const printFlag = line.printFlag ?? line.print === "是";
      return {
        id: line.draftLineId ?? line.id ?? `DRAFT-LINE-${index + 1}`,
        customerId,
        customer: line.customer ?? findCustomerName(workspace, customerId) ?? "待确认客户",
        product: line.productName ?? line.product ?? "",
        size: line.size ?? "待确认",
        color: line.bagColor ?? line.color ?? "待确认",
        handle: line.handleType ?? line.handle ?? "普通提",
        style: line.style ?? "空白袋",
        print: printFlag ? "是" : "否",
        qty: Number(line.qty ?? 0),
        fulfillment: line.fulfillmentMethod ?? line.fulfillment ?? "待确认",
        latest: line.latestNeededAt ?? line.latest ?? "待确认",
        printColor: line.printColor ?? (printFlag ? "待确认" : "非印刷"),
        printSide: mapPrintSide(line.printSide),
        artworkStatus: line.artworkStatus ?? (printFlag ? "待上传" : "非印刷"),
        handleColor: line.handleColor ?? "",
        note: line.officeNote ?? line.customerNote ?? line.note ?? "",
        source: body.sourceText ?? line.source ?? "",
        inventory: line.inventory ?? "",
        confidence: line.confidence ?? "",
        amount: line.amount ?? 0,
      };
    });
  }

  function toRecognizedDraftLine(row) {
    return {
      draftLineId: row.id,
      customerId: row.customerId,
      customerName: row.customer,
      productName: row.product,
      orderType: row.print === "是" ? "custom_print" : "stock",
      size: row.size,
      bagColor: row.color,
      handleType: row.handle,
      handleColor: row.handleColor,
      style: row.style,
      qty: row.qty,
      fulfillmentMethod: row.fulfillment,
      latestNeededAt: row.latest,
      printFlag: row.print === "是",
      printColor: row.printColor,
      printSide: mapPrintSide(row.printSide),
      customerNote: row.note,
      officeNote: "",
      recognitionStatus:
        row.confidence === "high"
          ? "high_confidence"
          : row.confidence === "low"
            ? "low_confidence"
            : "medium_confidence",
      missingFields: getMissingDraftFields(row),
      recognitionEvidence: { sourceText: row.source },
    };
  }

  function buildDraftRiskHints(lines) {
    return lines.flatMap((line) =>
      getMissingDraftFields(line).map((field) => ({
        riskType: "missing_required_field",
        level: "blocking",
        message: `${line.id} 缺 ${field}`,
        relatedField: field,
        relatedId: line.id,
      })),
    );
  }

  function buildDraftTodo(workspace, draft, lines, operatorId) {
    return buildTodo(workspace, {
      id: nextPlainId("T-DRAFT", draft.id),
      type: "订单草稿待确认",
      customerId: draft.customerId || "C001",
      ref: draft.id,
      refType: "order_draft",
      refId: draft.id,
      summary: `${lines.length} 行草稿需要补充信息`,
      latest: lines[0]?.latest ?? "待确认",
      urgency: "普通",
      impact: "草稿未生成正式订单",
      createdBy: operatorId,
    });
  }

  function buildInventoryReservations(workspace, checkedRows, orderLines, operatorId) {
    return checkedRows
      .map((row, index) => {
        if (row.inventory !== "可用") return null;
        const inventoryItem = findMatchingInventory(workspace, row);
        const orderLine = orderLines[index];
        if (!inventoryItem || !orderLine) return null;
        return {
          reservationId: nextPlainId("RSV", orderLine.id),
          orderLineId: orderLine.id,
          inventoryItemId: inventoryItem.id,
          reservedQty: Number(row.qty ?? 0),
          reservationType:
            mapFulfillmentMethod(row.fulfillment) === "pickup" ? "待提货锁定" : "出库占用",
          status: "生效",
          createdBy: operatorId,
        };
      })
      .filter(Boolean);
  }

  function buildInventoryLedgerEntries(workspace, reservations, operatorId) {
    return reservations.map((reservation) => {
      const inventoryItem = findInventoryItem(workspace, reservation.inventoryItemId);
      const qtyBefore = Number(inventoryItem?.reserved ?? 0);
      const qtyChange = Number(reservation.reservedQty ?? 0);
      return {
        ledgerId: nextPlainId("LEDGER", reservation.reservationId),
        inventoryItemId: reservation.inventoryItemId,
        changeType: "订单占用",
        qtyBefore,
        qtyChange,
        qtyAfter: qtyBefore + qtyChange,
        sourceType: "order_confirm",
        sourceId: reservation.orderLineId,
        operatorId,
        confirmedBy: operatorId,
        reason: "订单确认占用库存",
        remark: reservation.reservationType,
      };
    });
  }

  function buildConfirmationTodos(workspace, todoInputs, operatorId) {
    const todos = [];
    for (const todoInput of todoInputs) {
      todos.push(
        buildTodo(
          { ...workspace, todos: [...(workspace.todos ?? []), ...todos] },
          { ...todoInput, createdBy: operatorId },
        ),
      );
    }
    return todos;
  }

  function buildConfirmedOrderRecord(workspace, draftId, confirmation, body, operatorId) {
    const customerId = confirmation.newLines[0]?.customerId ?? body.customerId ?? "";
    return {
      orderId: confirmation.orderNo,
      bizNo: confirmation.orderNo,
      sourceDraftId: draftId,
      draftId,
      customerId,
      customerSnapshot: buildCustomerSnapshot(workspace, customerId),
      sourceText: body.sourceText ?? "",
      summaryStatus: "处理中",
      createdBy: operatorId,
    };
  }
}

function parseDraftExpectedRevision(value) {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1) return 0;
  return revision;
}

function buildDraftOperationLogId(action, draftId, revision, idempotencyKey = "") {
  const digest = createHash("sha256")
    .update([action, draftId, revision, idempotencyKey].join(":"))
    .digest("hex")
    .slice(0, 20)
    .toUpperCase();
  return `LOG-DRAFT-${digest}`;
}

function summarizeDraft(draft) {
  return {
    draftId: draft.id,
    status: draft.status,
    sourceText: draft.sourceText,
    sourceChannel: draft.sourceChannel,
    sourceMessageId: draft.sourceMessageId,
    customerId: draft.customerId,
    customerName: draft.customerName,
    clientRevision: draft.clientRevision,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

function getMissingDraftFields(row) {
  const missing = [];
  if (!row.customerId) missing.push("customerId");
  if (!row.size || row.size === "待确认") missing.push("size");
  if (!row.color || row.color === "待确认") missing.push("bagColor");
  if (!row.qty) missing.push("qty");
  return missing;
}

function nowIso(now) {
  return new Date(now()).toISOString();
}

function success(response) {
  return { response };
}

function notFound(code) {
  return { notFound: true, code };
}

function businessError(statusCode, code, message) {
  return { error: true, statusCode, code, message };
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
}
