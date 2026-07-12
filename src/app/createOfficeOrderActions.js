const persistentEntryActions = new Set(["保存草稿", "保存并确认", "作废草稿"]);
const orderLineActions = new Map([
  ["quantity", "调整正式单数量"],
  ["void", "作废正式单"],
]);

export function createOfficeOrderActions({
  allowLocalFallback,
  defaultOrderFilters,
  executeOrderEntryAction,
  fulfillmentSource,
  fulfillments,
  guardUiAction,
  openOrderActionModal,
  orderLines,
  orderPoolSource,
  recognizeOrderDraft,
  refreshFulfillments,
  refreshOrderPool,
  refreshStatements,
  resolveLineFromRef,
  runOrderDraftCommand,
  setActivePage,
  setFulfillmentTab,
  setOrderFilters,
  setSelectedFulfillmentId,
  setSelectedOrderId,
  setSelectedStatementId,
  setToast,
  statementSource,
  statements,
  updateOrderDraftField,
}) {
  function normalizeFormalWriteResult(result, label) {
    if (!result || result.blocked || allowLocalFallback || result.source === "api") return result;
    return {
      ...result,
      blocked: true,
      upstreamSource: result.source,
      source: "api_error",
      error: {
        code: result.error?.code ?? "ORDER_ACTION_SERVER_REQUIRED",
        message: result.error?.message ?? `生产模式要求通过后端完成${label}。`,
      },
      feedback: `后端未确认${label}，production 不接受本地替代结果。`,
    };
  }

  async function loadFormalOrderLines() {
    if (allowLocalFallback || orderPoolSource === "api") return orderLines;
    const result = await refreshOrderPool({ showToast: false });
    if (result?.blocked || result?.source !== "api") {
      setToast("订单池尚未通过后端 API 刷新，production 不使用本地订单定位。");
      return null;
    }
    return result.items ?? [];
  }

  async function loadFormalFulfillments() {
    if (allowLocalFallback || fulfillmentSource === "api") return fulfillments;
    const result = await refreshFulfillments({ showToast: false });
    if (result?.blocked || result?.source !== "api") {
      setToast("出库交付尚未通过后端 API 刷新，production 不使用本地交付记录定位。");
      return null;
    }
    return result.items ?? [];
  }

  async function loadFormalStatements() {
    if (allowLocalFallback || statementSource === "api") return statements;
    const result = await refreshStatements({ showToast: false });
    if (result?.blocked || result?.source !== "api") {
      setToast("对账列表尚未通过后端 API 刷新，production 不使用本地对账记录定位。");
      return null;
    }
    return result.statements ?? [];
  }

  function focusOrderLineFromItems(ref, reason, candidateOrderLines) {
    const line = resolveLineFromRef(candidateOrderLines, statements, ref);
    setActivePage("orders");
    if (!line) {
      setOrderFilters(defaultOrderFilters);
      setToast(`已打开订单池，但未找到 ${ref} 对应的订单明细。`);
      return null;
    }
    setSelectedOrderId(line.id);
    setOrderFilters({ ...defaultOrderFilters, customerId: line.customerId });
    setToast(`已从${reason}定位到订单明细 ${line.id}。`);
    return line;
  }

  function createOrderFromTopbar() {
    if (!guardUiAction("topbar", "新建订单")) return;
    setActivePage("entry");
  }

  async function focusOrderLine(ref, reason = "订单池") {
    const candidateOrderLines = await loadFormalOrderLines();
    if (!candidateOrderLines) return null;
    return focusOrderLineFromItems(ref, reason, candidateOrderLines);
  }

  async function focusFulfillmentByRef(ref) {
    const candidateFulfillments = await loadFormalFulfillments();
    if (!candidateFulfillments) return null;
    let line = null;
    let candidateOrderLines = null;
    let fulfillment = candidateFulfillments.find((item) => item.lineId === ref);
    if (!fulfillment) {
      candidateOrderLines = await loadFormalOrderLines();
      if (candidateOrderLines) {
        line = resolveLineFromRef(candidateOrderLines, statements, ref);
        fulfillment = candidateFulfillments.find((item) => item.lineId === line?.id)
          ?? candidateFulfillments.find((item) => String(item.lineId ?? "").startsWith(line?.orderNo ?? ref));
      }
    }
    if (fulfillment) {
      setSelectedFulfillmentId(fulfillment.id);
      setFulfillmentTab(fulfillment.method);
      setActivePage("fulfillment");
      setToast(`已定位到出库 / 交付记录 ${fulfillment.lineId}。`);
      return fulfillment;
    }
    if (!candidateOrderLines) candidateOrderLines = await loadFormalOrderLines();
    const locatedLine = line ?? (candidateOrderLines ? resolveLineFromRef(candidateOrderLines, statements, ref) : null);
    if (locatedLine) {
      focusOrderLineFromItems(ref, "待办", candidateOrderLines);
      setToast(`未找到 ${ref} 的出库记录，已定位到订单池明细。`);
      return null;
    }
    setActivePage("orders");
    setOrderFilters(defaultOrderFilters);
    setToast(`未找到 ${ref} 的出库记录或订单明细。`);
    return null;
  }

  async function focusStatementByRef(ref) {
    const candidateStatements = await loadFormalStatements();
    if (!candidateStatements) return null;
    let statement = candidateStatements.find((item) => item.id === ref);
    let line = null;
    let candidateOrderLines = null;
    if (!statement) {
      candidateOrderLines = await loadFormalOrderLines();
      if (candidateOrderLines) {
        line = resolveLineFromRef(candidateOrderLines, candidateStatements, ref);
        statement = candidateStatements.find((item) => (item.lineIds ?? []).includes(line?.id));
      }
    }
    if (statement) {
      setSelectedStatementId(statement.id);
      setActivePage("statements");
      setToast(`已定位到对账 / 收款记录 ${statement.id}。`);
      return statement;
    }
    if (line) {
      focusOrderLineFromItems(ref, "待办", candidateOrderLines);
      setToast(`未找到 ${ref} 的对账记录，已定位到订单池明细。`);
      return null;
    }
    setActivePage("orders");
    setOrderFilters(defaultOrderFilters);
    setToast(`未找到 ${ref} 的对账记录或订单明细。`);
    return null;
  }

  function openOrderLineAction(action, orderLine) {
    if (!orderLine) {
      setToast("请先选择一条订单明细。");
      return;
    }
    const label = orderLineActions.get(action);
    if (!label) {
      setToast(`不支持的订单动作：${String(action ?? "").trim() || "未指定"}。`);
      return;
    }
    if (!guardUiAction("orders", label)) return;
    openOrderActionModal({ type: action, orderLineId: orderLine.id, orderLine });
  }

  async function recognize() {
    if (!guardUiAction("entry", "识别")) return null;
    const result = await recognizeOrderDraft();
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  function updateDraftField(id, field, value) {
    updateOrderDraftField(id, field, value);
  }

  function handleDraftCommand(action) {
    const result = runOrderDraftCommand(action);
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  async function entryAction(label) {
    if (!guardUiAction("entry", label)) return null;
    const rawResult = await executeOrderEntryAction(label);
    const result = persistentEntryActions.has(label)
      ? normalizeFormalWriteResult(rawResult, `订单${label}`)
      : rawResult;
    if (result?.navigateTo && !result.blocked) setActivePage(result.navigateTo);
    if (result?.feedback) setToast(result.feedback);
    return result;
  }

  return {
    createOrderFromTopbar,
    entryAction,
    focusFulfillmentByRef,
    focusOrderLine,
    focusStatementByRef,
    handleDraftCommand,
    openOrderLineAction,
    recognize,
    updateDraftField,
  };
}
