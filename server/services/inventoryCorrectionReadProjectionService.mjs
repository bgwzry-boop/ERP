export function createInventoryCorrectionReadProjectionService() {
  return {
    listDraftSummaries({ workspace = {}, searchParams } = {}) {
      const filters = readFilters(searchParams);
      let items = list(workspace.inventoryCorrectionDrafts).map((draft) =>
        buildDraftSummary({ workspace, draft }),
      );
      if (filters.status && filters.status !== "全部") {
        items = items.filter((item) => item.status === filters.status);
      }
      if (filters.inventoryItemId) {
        items = items.filter((item) => item.inventoryItemId === filters.inventoryItemId);
      }
      if (filters.keyword) {
        const keyword = filters.keyword.toLowerCase();
        items = items.filter((item) => buildSearchText(item).includes(keyword));
      }
      return { items, filters };
    },

    buildDraftSummary({ workspace = {}, draft = {} } = {}) {
      return buildDraftSummary({ workspace, draft });
    },

    buildDraftDetail({ workspace = {}, draft = {} } = {}) {
      const correctionDraftId = draftId(draft);
      const base = buildDraftSummary({ workspace, draft });
      const inventoryItem = findInventoryItem(workspace, base.inventoryItemId);
      const users = buildUserMap(workspace.users);
      const ledgers = list(workspace.inventoryLedgers)
        .filter((entry) => ledgerDraftId(entry) === correctionDraftId)
        .map((entry) => buildLedgerSummary({ entry, inventoryItem, users, correctionDraftId }))
        .sort(sortNewestFirst);
      const operationLogs = list(workspace.operationLogs)
        .filter(
          (entry) =>
            cleanText(entry.targetType ?? entry.target_type) === "inventory_correction" &&
            cleanText(entry.targetId ?? entry.target_id) === correctionDraftId,
        )
        .map(buildOperationLogSummary)
        .sort(sortNewestFirst);
      const ledger = ledgers[0] ?? null;
      return {
        ...base,
        qtyAfter: ledger
          ? buildInventoryQuantitySnapshot(inventoryItem, {
              ...base.requestedQtyAfter,
              onHand: ledger.qtyAfter,
            })
          : null,
        ledger,
        operationLogs,
      };
    },

    buildLedgerSummary({ entry = {}, inventoryItem = {}, workspace = {}, correctionDraftId = "" } = {}) {
      return buildLedgerSummary({
        entry,
        inventoryItem,
        users: buildUserMap(workspace.users),
        correctionDraftId,
      });
    },
  };
}

export function buildInventoryQuantitySnapshot(inventoryItem = {}, overrides = {}) {
  const item = record(inventoryItem);
  const values = record(overrides);
  const onHand = quantity(values.onHand ?? values.on_hand, item.onHandQty ?? item.on_hand_qty ?? item.inStock ?? item.in_stock);
  const reserved = quantity(values.reserved, item.reserved);
  const waitingPickupLocked = quantity(
    values.waitingPickupLocked ?? values.waiting_pickup_locked,
    item.waitingPickupLocked ?? item.waiting_pickup_locked ?? item.locked,
  );
  const pendingHandling = quantity(
    values.pendingHandling ?? values.pending_handling,
    item.pendingHandling ?? item.pending_handling ?? item.pending,
  );
  return {
    onHand,
    reserved,
    available: onHand - reserved - waitingPickupLocked - pendingHandling,
    waitingPickupLocked,
    pendingHandling,
  };
}

function buildDraftSummary({ workspace, draft }) {
  const source = record(draft);
  const correctionDraftId = draftId(source);
  const inventoryItemId = cleanText(source.inventoryItemId ?? source.inventory_item_id);
  const inventoryItem = findInventoryItem(workspace, inventoryItemId);
  const users = buildUserMap(workspace.users);
  const operatorId = cleanText(source.operatorId ?? source.operator_id ?? source.createdBy ?? source.created_by);
  const confirmedBy = cleanText(source.confirmedBy ?? source.confirmed_by);
  return {
    correctionDraftId,
    inventoryItemId,
    inventoryKey: cleanText(inventoryItem.inventoryKey ?? inventoryItem.inventory_key ?? inventoryItem.id) || inventoryItemId,
    status: cleanText(source.status),
    reason: cleanText(source.reason),
    remark: cleanText(source.remark),
    qtyBefore: buildInventoryQuantitySnapshot(inventoryItem, {
      ...record(source.qtyBefore ?? source.qty_before),
      onHand:
        record(source.qtyBefore ?? source.qty_before).onHand ??
        record(source.qtyBefore ?? source.qty_before).on_hand ??
        source.expectedQty ??
        source.expected_qty,
    }),
    requestedQtyAfter: buildInventoryQuantitySnapshot(inventoryItem, {
      ...record(source.requestedQtyAfter ?? source.requested_qty_after),
      onHand:
        record(source.requestedQtyAfter ?? source.requested_qty_after).onHand ??
        record(source.requestedQtyAfter ?? source.requested_qty_after).on_hand ??
        source.actualQty ??
        source.actual_qty,
    }),
    inventoryItem: projectInventoryItem(inventoryItem),
    operatorId,
    operatorName: userDisplayName(users, operatorId),
    confirmedBy,
    confirmedByName: userDisplayName(users, confirmedBy),
    todoId: cleanText(source.todoId ?? source.todo_id),
    attachmentIds: textList(source.attachmentIds ?? source.attachment_ids),
    createdAt: cleanText(source.createdAt ?? source.created_at),
    updatedAt: cleanText(source.updatedAt ?? source.updated_at),
    confirmedAt: cleanText(source.confirmedAt ?? source.confirmed_at),
  };
}

function buildLedgerSummary({ entry, inventoryItem, users, correctionDraftId }) {
  const source = record(entry);
  const operatorId = cleanText(source.operatorId ?? source.operator_id);
  const confirmedBy = cleanText(source.confirmedBy ?? source.confirmed_by);
  return {
    ledgerId: cleanText(source.ledgerId ?? source.ledger_id ?? source.id),
    inventoryItemId: cleanText(source.inventoryItemId ?? source.inventory_item_id ?? inventoryItem.id),
    inventoryKey: cleanText(source.inventoryKey ?? source.inventory_key ?? inventoryItem.inventoryKey ?? inventoryItem.inventory_key ?? inventoryItem.id),
    size: cleanText(source.size ?? inventoryItem.size),
    colorName: cleanText(source.colorName ?? source.color_name ?? source.color ?? inventoryItem.color),
    color: cleanText(source.color ?? source.colorName ?? source.color_name ?? inventoryItem.color),
    handleType: cleanText(source.handleType ?? source.handle_type ?? source.handle ?? inventoryItem.handle),
    style: cleanText(source.style ?? inventoryItem.style),
    zone: cleanText(source.zone ?? inventoryItem.zone),
    inventoryState: cleanText(source.inventoryState ?? source.inventory_state ?? inventoryItem.state),
    changeType: cleanText(source.changeType ?? source.change_type) || "correction",
    qtyBefore: signedInteger(source.qtyBefore ?? source.qty_before),
    qtyChange: signedInteger(source.qtyChange ?? source.qty_change),
    qtyAfter: quantity(source.qtyAfter ?? source.qty_after),
    sourceType: cleanText(source.sourceType ?? source.source_type) || "inventory_correction",
    sourceId: cleanText(source.sourceId ?? source.source_id ?? source.correctionDraftId ?? source.correction_draft_id) || correctionDraftId,
    operatorId,
    operatorName: userDisplayName(users, operatorId),
    confirmedBy,
    confirmedByName: userDisplayName(users, confirmedBy),
    occurredAt: cleanText(source.occurredAt ?? source.occurred_at ?? source.createdAt ?? source.created_at),
    createdAt: cleanText(source.createdAt ?? source.created_at ?? source.occurredAt ?? source.occurred_at),
    reason: cleanText(source.reason),
    remark: cleanText(source.remark),
  };
}

function buildOperationLogSummary(value) {
  const source = record(value);
  return {
    operationLogId: cleanText(source.operationLogId ?? source.operation_log_id ?? source.id),
    targetType: cleanText(source.targetType ?? source.target_type),
    targetId: cleanText(source.targetId ?? source.target_id),
    action: cleanText(source.action),
    before: objectOrNull(source.before),
    after: objectOrNull(source.after),
    reason: cleanText(source.reason),
    operatorId: cleanText(source.operatorId ?? source.operator_id),
    createdAt: cleanText(source.createdAt ?? source.created_at ?? source.occurredAt ?? source.occurred_at),
  };
}

function projectInventoryItem(value) {
  const item = record(value);
  if (!cleanText(item.id ?? item.inventoryItemId ?? item.inventory_item_id)) return null;
  const id = cleanText(item.id ?? item.inventoryItemId ?? item.inventory_item_id);
  const handle = cleanText(item.handle ?? item.handleType ?? item.handle_type);
  return {
    id,
    size: cleanText(item.size),
    color: cleanText(item.color ?? item.colorName ?? item.color_name),
    handle,
    handleType: handle,
    style: cleanText(item.style),
    zone: cleanText(item.zone),
    state: cleanText(item.state ?? item.inventoryState ?? item.inventory_state),
  };
}

function readFilters(searchParams) {
  return {
    status: cleanText(readQuery(searchParams, "status")) || "待确认生效",
    inventoryItemId: cleanText(readQuery(searchParams, "inventoryItemId")),
    keyword: cleanText(readQuery(searchParams, "keyword")),
  };
}

function buildSearchText(item) {
  return [
    item.correctionDraftId,
    item.inventoryItemId,
    item.inventoryKey,
    item.status,
    item.reason,
    item.remark,
    item.inventoryItem?.size,
    item.inventoryItem?.color,
    item.inventoryItem?.handle,
    item.inventoryItem?.style,
    item.inventoryItem?.zone,
    item.operatorId,
    item.operatorName,
    item.confirmedBy,
    item.confirmedByName,
    item.todoId,
  ]
    .join(" ")
    .toLowerCase();
}

function findInventoryItem(workspace, inventoryItemId) {
  return (
    list(workspace.inventories).find(
      (item) => cleanText(item.id ?? item.inventoryItemId ?? item.inventory_item_id) === inventoryItemId,
    ) ?? {}
  );
}

function buildUserMap(users) {
  return new Map(
    list(users)
      .map((user) => [cleanText(user.id ?? user.userId ?? user.user_id), user])
      .filter(([id]) => id),
  );
}

function userDisplayName(users, userId) {
  const user = users.get(userId);
  return cleanText(user?.displayName ?? user?.display_name ?? user?.name);
}

function draftId(value) {
  return cleanText(value.correctionDraftId ?? value.correction_draft_id ?? value.id);
}

function ledgerDraftId(value) {
  return cleanText(value.correctionDraftId ?? value.correction_draft_id ?? value.sourceId ?? value.source_id);
}

function sortNewestFirst(left, right) {
  return timestamp(right.createdAt) - timestamp(left.createdAt);
}

function timestamp(value) {
  const parsed = Date.parse(cleanText(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function readQuery(searchParams, key) {
  if (typeof searchParams?.get === "function") return searchParams.get(key);
  return record(searchParams)[key];
}

function quantity(value, fallback = 0) {
  return Math.max(0, signedInteger(value, fallback));
}

function signedInteger(value, fallback = 0) {
  const candidate = cleanText(value) ? Number(value) : Number.NaN;
  if (Number.isFinite(candidate)) return Math.trunc(candidate);
  const fallbackCandidate = Number(fallback);
  return Number.isFinite(fallbackCandidate) ? Math.trunc(fallbackCandidate) : 0;
}

function textList(value) {
  return [...new Set(list(value).map(cleanText).filter(Boolean))];
}

function objectOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value) {
  return String(value ?? "").trim();
}
