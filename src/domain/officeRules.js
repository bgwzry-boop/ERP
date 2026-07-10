export const money = (value) => `¥${Number(value).toLocaleString("zh-CN", { minimumFractionDigits: value % 1 ? 1 : 0, maximumFractionDigits: 1 })}`;

export const editableColors = ["黄色", "红色", "黑色", "白色", "蓝色", "绿色", "米白", "浅蓝", "牛仔蓝", "大红", "粉色"];

export function findCustomer(customers, id) {
  return customers.find((item) => item.id === id) ?? customers[0];
}

export function findCustomerByName(customers, name) {
  return customers.find((item) => item.name === name);
}

export function findOrderLine(orderLines, id) {
  return orderLines.find((item) => item.id === id);
}

export function availableQty(stock) {
  return stock.inStock - stock.reserved - stock.locked - stock.pending;
}

export function isPendingStock(stock) {
  return stock.state.includes("待处理") || stock.state.includes("报废");
}

export function getStockStateGroup(stock) {
  if (isPendingStock(stock)) return "待处理";
  if (stock.locked > 0 || stock.state.includes("待提货")) return "待提货锁定";
  if (stock.reserved > 0 || stock.state.includes("占用")) return "已占用";
  if (availableQty(stock) <= 0) return "缺货";
  return "可用";
}

export function getStockTrustLabel(stock) {
  if (stock.estimated) return "估算/待复核";
  if (stock.state.includes("车间")) return "车间报数";
  if (stock.state.includes("打包")) return "打包清点";
  if (stock.state.includes("待提货")) return "待提货锁定";
  if (isPendingStock(stock)) return "待处理/报废";
  return "仓库已清点";
}

export function getStockTone(stock) {
  if (isPendingStock(stock) || availableQty(stock) <= 0) return "danger";
  if (stock.estimated || stock.locked > 0 || stock.reserved > 0) return "medium";
  return "success";
}

export function getStockStateTone(group) {
  if (group === "缺货" || group === "待处理") return "danger";
  if (group === "已占用" || group === "待提货锁定") return "warning";
  if (group === "可用") return "success";
  return "neutral";
}

export function formatStockKey(stock) {
  return `${stock.size} / ${stock.color} / ${stock.handle} / ${stock.style}`;
}

export function uniqueStockOptions(records, field) {
  return [...new Set(records.map((item) => item[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function statusTone(status) {
  if (status.includes("缺货") || status.includes("异常") || status.includes("差异") || status.includes("不足") || status.includes("无法") || status.includes("差额") || status.includes("欠款") || status.includes("账单待调整")) return "danger";
  if (status.includes("待") || status.includes("确认") || status.includes("备货") || status.includes("打印")) return "warning";
  if (status.includes("已") || status.includes("有货") || status.includes("可用")) return "success";
  return "neutral";
}

export function nextId(prefix, rowsOrLength, offset = 0) {
  if (Number.isInteger(rowsOrLength)) {
    return `${prefix}${String(rowsOrLength + offset + 1).padStart(3, "0")}`;
  }

  const rows = Array.isArray(rowsOrLength) ? rowsOrLength : [];
  const escapedPrefix = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedPrefix}(\\d+)$`);
  const maxSequence = rows.reduce((max, row) => {
    const values =
      row && typeof row === "object"
        ? [row.id, row.bizNo, row.orderId, row.orderNo, row.fulfillmentId]
        : [row];
    for (const value of values) {
      const match = String(value ?? "").match(pattern);
      if (match) max = Math.max(max, Number(match[1]));
    }
    return max;
  }, 0);
  return `${prefix}${String(maxSequence + offset + 1).padStart(3, "0")}`;
}

export function findStockForDraft(row, inventoryRecords) {
  return inventoryRecords.find(
    (item) =>
      item.size === row.size &&
      item.color === row.color &&
      item.handle === row.handle &&
      item.style === row.style &&
      !item.state.includes("待处理"),
  );
}

export function getDraftOrderType(row) {
  if (row.product.includes("同行")) return "外加工印刷";
  if (row.print === "是") return row.product.includes("喜") || row.product.includes("福") ? "印刷通货" : "定制印刷";
  return row.inventory.startsWith("缺货") ? "现货缺货" : "现货有货";
}

export function isCustomPrintDraft(row) {
  return getDraftOrderType(row) === "定制印刷";
}

export function isArtworkReady(status) {
  return status === "已上传" || status === "已有稿件";
}

export function getDraftMissingFields(row) {
  const missing = [];
  if (!row.customerId) missing.push("客户");
  if (!row.size || row.size === "待确认") missing.push("尺寸");
  if (!row.color || row.color === "待确认") missing.push("颜色");
  if (!Number(row.qty)) missing.push("数量");

  if (isCustomPrintDraft(row)) {
    if (!row.product || row.product === "空白袋") missing.push("印刷内容/品名");
    if (!row.printColor || row.printColor === "待确认" || row.printColor === "非印刷") missing.push("印刷颜色");
    if (!row.printSide || row.printSide === "待确认" || row.printSide === "非印刷") missing.push("印刷面");
    if (!isArtworkReady(row.artworkStatus)) missing.push("印刷图/稿件");
  }

  return missing;
}

export function getDraftBlockingRows(rows) {
  return rows
    .map((row) => ({ row, missing: getDraftMissingFields(row) }))
    .filter((item) => item.missing.length);
}

export function getDraftTypeLabel(row) {
  if (row.product.includes("同行")) return "外加工印刷";
  if (row.print === "是" && !row.product.includes("喜") && !row.product.includes("福")) return "定制印刷";
  return row.style;
}

export function getDraftTypeTone(row) {
  const type = getDraftTypeLabel(row);
  if (type === "定制印刷" || type === "外加工印刷") return "warning";
  if (type === "印刷通货") return "blue";
  return "neutral";
}

export function getDraftStatusTone(status) {
  if (status.includes("作废") || status.includes("空")) return "neutral";
  if (status.includes("缺") || status.includes("拦截")) return "danger";
  if (status.includes("保存") || status.includes("调整")) return "warning";
  return "blue";
}

export function joinUniqueNotes(values) {
  return [...new Set(values.flatMap((value) => String(value || "").split("、")).map((value) => value.trim()).filter(Boolean))].join("、");
}

export function getDraftNote(row) {
  return joinUniqueNotes([row.handle !== "普通提" ? row.handle : "", row.note]);
}

export function shortColorName(color = "") {
  if (!color) return "";
  if (color.endsWith("色")) return color.slice(0, -1);
  return color;
}

export function getDraftColorSpecLabel(row) {
  if (!row) return "";
  const labels = [];
  if (row.print === "是" && row.printColor && row.printColor !== "待确认" && row.printColor !== "非印刷") {
    labels.push(`${shortColorName(row.color)}印${shortColorName(row.printColor)}`);
  }
  if (row.handleColor && row.handleColor !== "待确认") {
    labels.push(`${shortColorName(row.color)}袋${shortColorName(row.handleColor)}提`);
  }
  return labels.length ? labels.join(" / ") : row.color;
}

export function getOptionalColor(value) {
  return value && value !== "待确认" ? value : "";
}

export function getDraftStatus(row) {
  if (row.inventory.startsWith("缺货")) return "缺货待处理";
  if (row.print === "是" && !row.product.includes("喜") && !row.product.includes("福")) return "待排产";
  if (row.inventory === "需复核" || row.latest === "待确认") return "待确认";
  return "待出库";
}

export function isFulfillmentDone(status) {
  return status === "已交付";
}

export function getFulfillmentActions(item) {
  const hasTrackablePrintRecord = Boolean(
    item.activePrintRecordId || item.printRecordId || ["printed", "reprinted"].includes(item.printRecordStatus),
  );
  const printedDocument = Boolean(item.printed || hasTrackablePrintRecord);

  if (isFulfillmentDone(item.status)) {
    return [
      { label: "打印预览", variant: "secondary" },
      { label: "打开订单", variant: "secondary" },
    ];
  }

  const exceptionActions = [
    { label: "数量不符", variant: "secondary" },
    { label: "无法出库", variant: "secondary" },
  ];

  if (item.status.includes("数量") || item.status.includes("无法")) {
    return [
      { label: "打开待办", variant: "primary" },
      { label: "打开订单", variant: "secondary" },
      { label: "打印预览", variant: "secondary" },
    ];
  }

  if (item.method === "快递快运") {
    if (item.printRecordStatus === "voided") {
      return [
        { label: "重打标签", variant: "primary" },
        { label: "打印预览", variant: "secondary" },
        { label: "打开订单", variant: "secondary" },
        ...exceptionActions,
      ];
    }
    if (item.status === "待确认拉走" || item.printed) {
      return [
        { label: "确认已拉走", variant: "primary" },
        { label: hasTrackablePrintRecord ? "作废旧标签" : "打印标签", variant: "secondary" },
        { label: "打印预览", variant: "secondary" },
        { label: "打开订单", variant: "secondary" },
        ...exceptionActions,
      ];
    }
    return [
      { label: "打印标签", variant: "primary" },
      { label: "标记已备货", variant: "secondary" },
      { label: "打开订单", variant: "secondary" },
      ...exceptionActions,
    ];
  }

  if (item.method === "送货") {
    if (item.printRecordStatus === "voided") {
      return [
        { label: "重打送货单", variant: "primary" },
        { label: "编辑派单", variant: "secondary" },
        { label: "打印预览", variant: "secondary" },
        { label: "打开订单", variant: "secondary" },
        ...exceptionActions,
      ];
    }
    return [
      { label: "完成送货", variant: "primary" },
      { label: "编辑派单", variant: "secondary" },
      { label: "标记已备货", variant: "secondary" },
      { label: printedDocument && hasTrackablePrintRecord ? "作废旧单据" : "打印送货单", variant: "secondary" },
      { label: "打开订单", variant: "secondary" },
      ...exceptionActions,
    ];
  }

  if (item.printRecordStatus === "voided") {
    return [
      { label: "重打自提单", variant: "primary" },
      { label: "打印预览", variant: "secondary" },
      { label: "打开订单", variant: "secondary" },
      ...exceptionActions,
    ];
  }
  return [
    { label: "完成自提", variant: "primary" },
    { label: "标记已备货", variant: "secondary" },
    { label: printedDocument && hasTrackablePrintRecord ? "作废旧单据" : "打印自提单", variant: "secondary" },
    { label: "打开订单", variant: "secondary" },
    ...exceptionActions,
  ];
}

export function getFulfillmentNextStep(item) {
  const evidenceReviewStatus = getDeliveryEvidenceReviewStatus(item);
  if (item.method === "送货" && item.status === "已交付" && evidenceReviewStatus === "待复核") {
    return "送货已完成，等待办公室复核水印照片、签收照片和定位信息。";
  }
  if (item.method === "送货" && evidenceReviewStatus === "需重拍") {
    return "送达证据被退回，需通知司机补拍或补充说明后再复核。";
  }
  if (item.status === "已交付") return "已完成交付；后续进入对账或收款确认。";
  if (item.status.includes("数量")) return "等待办公室处理数量差异，不能直接改订单数量。";
  if (item.status.includes("无法")) return "等待办公室处理无法出库原因，决定客户沟通、改单或补货。";
  if (item.printRecordStatus === "voided") {
    const documentLabel = getFulfillmentDocumentLabel(item);
    const nextAction = item.method === "快递快运" ? "确认快递/快运拉走" : "完成交付";
    return `旧${documentLabel}已作废，需要先重打${documentLabel}；生成新有效${documentLabel}后才能${nextAction}。`;
  }
  if (item.method === "快递快运" && item.status === "待确认拉走") return "等待确认快递/快运已拉走；确认后才扣交付并进入对账。";
  if (item.method === "快递快运" && !item.printed) return "先打印包裹标签，包裹进入待提货区后再确认拉走。";
  if (item.method === "送货") return "送货完成后记录交付凭证；数量不一致必须走数量不符。";
  return "客户自提完成后记录交付；数量不一致必须走数量不符。";
}

export function getDeliveryEvidenceReviewStatus(item) {
  if (item?.method !== "送货") return "不适用";
  if (item.deliveryEvidenceReviewStatus) return item.deliveryEvidenceReviewStatus;
  if (item.watermarkedPhotoAttachmentId || item.watermarkedPhotoAttached || item.watermarkedPhotoUrl) return "待复核";
  return "待提交";
}

export function getDeliveryEvidenceReviewTone(status) {
  if (status === "已复核") return "success";
  if (status === "需重拍") return "danger";
  if (status === "待复核") return "warning";
  if (status === "待提交") return "neutral";
  return "neutral";
}

export function getFulfillmentDocumentLabel(item) {
  if (item.method === "快递快运") return "包裹标签";
  if (item.method === "送货") return "送货单";
  return "出库/自提单";
}

export function getOrderLineShortNo(row) {
  return `#${row.orderNo.replace(/^ORD-\d{4}-/, "")}-${row.lineNo}`;
}

export function isCustomProductLine(line) {
  return line?.orderType === "定制印刷" || line?.orderType === "外加工印刷";
}

export function getLinePrintSide(line) {
  if (!line?.print || line.print === "否") return "非印刷";
  return line.printSide || "单/双面待确认";
}

export function getLineColorPrintLabel(line) {
  if (!line) return "";
  if (!isCustomProductLine(line) || !line.printColor) return line.color;
  return `${shortColorName(line.color)}印${shortColorName(line.printColor)}`;
}

export function getLineBagHandleLabel(line) {
  if (!line?.handleColor) return "";
  return `${shortColorName(line.color)}袋${shortColorName(line.handleColor)}提`;
}

export function getLineColorSpecLabel(line) {
  if (!line) return "";
  const labels = [];
  if (isCustomProductLine(line) && line.printColor) labels.push(getLineColorPrintLabel(line));
  if (line.handleColor) labels.push(getLineBagHandleLabel(line));
  return labels.length ? labels.join(" / ") : line.color;
}

export function getLineRemark(line) {
  if (!line) return "";
  const remarks = [];
  if (line.handle && line.handle !== "普通提") remarks.push(line.handle);
  if (line.note && !remarks.includes(line.note)) remarks.push(line.note);
  return remarks.join("、");
}

export function getFulfillmentGoodsDisplay(item, line) {
  if (!line) return `${item.goods} / ${item.qty}个`;
  if (isCustomProductLine(line)) {
    const remark = getLineRemark(line);
    return [line.product, line.size, getLineColorSpecLabel(line), getLinePrintSide(line), `${line.qty}个`, remark].filter(Boolean).join(" / ");
  }
  return [line.product, line.size, getLineColorSpecLabel(line), line.handle, `${line.qty}个`].filter(Boolean).join(" / ");
}

export const defaultOrderFilters = {
  customerId: "全部",
  status: "全部",
  orderType: "全部",
  fulfillment: "全部",
  exception: "全部",
  finance: "全部",
};

export const defaultStatementFilters = {
  query: "",
  status: "默认待处理",
};

export const statementFilterOptions = ["默认待处理", "本期待对账", "欠款/差额", "收款待确认", "已结清", "全部"];
export const varianceHandlingOptions = ["未收差额转欠款", "抹零/减免已审批", "账单有误待重算", "多笔付款待齐", "其他"];
export const writeOffAllowedVarianceHandling = ["未收差额转欠款", "抹零/减免已审批"];

export function getStatementForLine(statements, lineId) {
  return statements.find((item) => item.lineIds.includes(lineId));
}

export function getOrderExceptionState(row) {
  return row.exceptions.length > 0 || statusTone(row.status) === "danger" ? "有异常" : "正常";
}

export function getOrderFinanceState(row, statements, customers) {
  const statement = getStatementForLine(statements, row.id);
  const customer = findCustomer(customers, row.customerId);
  if (row.status.includes("收款") || statement?.status.includes("收款")) return "收款待确认";
  if (statement?.variance > 0 || statement?.status.includes("差额") || statement?.status.includes("欠款") || customer.debt > 0) return "差额/欠款";
  if (row.status.includes("对账") || statement?.status.includes("待生成") || statement?.status.includes("待发送")) return "待对账";
  if (statement?.status.includes("已核销") || (statement && statement.received >= statement.receivable && statement.variance === 0)) return "已结清/无差额";
  return "未入账";
}

export function getStatementBlockingAmount(statement, customers) {
  if (!statement) return 0;
  const customer = findCustomer(customers, statement.customerId);
  const currentGap = Math.max(0, Number(statement.receivable || 0) - Number(statement.received || 0));
  const hasPaymentProgress =
    Number(statement.received || 0) > 0 ||
    statement.status.includes("收款") ||
    statement.status.includes("差额") ||
    statement.status.includes("欠款") ||
    Boolean(statement.varianceHandling);
  const priorDebt = statement.status.includes("欠款") || statement.status.includes("差额") ? Number(customer?.debt || 0) : 0;
  return Math.max(Number(statement.variance || 0), hasPaymentProgress ? currentGap : 0, priorDebt);
}

export function getStatementDisplayDebt(statement, customers) {
  if (!statement) return 0;
  const customer = findCustomer(customers, statement.customerId);
  return Math.max(getStatementBlockingAmount(statement, customers), Number(customer?.debt || 0));
}

export function getStatementBucket(statement, customers) {
  if (!statement) return "本期待对账";
  const blockingAmount = getStatementBlockingAmount(statement, customers);
  if ((statement.status.includes("已核销") || statement.status.includes("已结清")) && blockingAmount <= 0) return "已结清";
  if (statement.status.includes("收款")) return "收款待确认";
  if (statement.status.includes("差额") || statement.status.includes("欠款") || blockingAmount > 0) return "欠款/差额";
  if (statement.status.includes("待生成") || statement.status.includes("待发送") || statement.status.includes("已发送")) return "本期待对账";
  return "本期待对账";
}

export function getStatementNextStatusForVariance(reason) {
  if (reason === "抹零/减免已审批") return "收款待确认";
  if (reason === "未收差额转欠款") return "有欠款";
  if (reason === "账单有误待重算") return "账单待调整";
  if (reason === "多笔付款待齐") return "多笔付款待齐";
  return "差额待确认";
}

export function statementMatchesFilters(statement, filters, customers) {
  const customer = findCustomer(customers, statement.customerId);
  const bucket = getStatementBucket(statement, customers);
  const query = filters.query.trim().toLowerCase();
  const queryText = [customer.name, customer.cycle, customer.contact, statement.id, statement.period, statement.status].join(" ").toLowerCase();
  if (query && !queryText.includes(query)) return false;
  if (filters.status === "全部") return true;
  if (filters.status === "默认待处理") return bucket !== "已结清";
  if (filters.status === "欠款/差额") return bucket === "欠款/差额" || getStatementDisplayDebt(statement, customers) > 0;
  return bucket === filters.status;
}

export function matchesOrderStatus(row, status) {
  if (status === "全部") return true;
  if (status === "待处理") return row.status.includes("待") || row.exceptions.length > 0;
  if (status === "生产中") return row.status.includes("排产") || row.status.includes("丝印") || row.status.includes("制袋") || row.status.includes("打包") || row.status.includes("补印");
  if (status === "待出库") return row.status.includes("待出库") || row.status.includes("备货");
  if (status === "已交付") return row.status.includes("已交付") || row.inventory.includes("已完成");
  return row.status.includes(status);
}

export function orderMatchesFilters(row, filters, statements, customers) {
  if (filters.customerId !== "全部" && row.customerId !== filters.customerId) return false;
  if (!matchesOrderStatus(row, filters.status)) return false;
  if (filters.orderType !== "全部" && row.orderType !== filters.orderType) return false;
  if (filters.fulfillment !== "全部" && row.fulfillment !== filters.fulfillment) return false;
  if (filters.exception === "仅异常" && getOrderExceptionState(row) !== "有异常") return false;
  if (filters.exception === "无异常" && getOrderExceptionState(row) !== "正常") return false;
  if (filters.finance !== "全部" && getOrderFinanceState(row, statements, customers) !== filters.finance) return false;
  return true;
}

export function resolveLineFromRef(orderLines, statements, ref) {
  if (!ref) return null;
  const exact = orderLines.find((item) => item.id === ref);
  if (exact) return exact;
  const statement = statements.find((item) => item.id === ref);
  if (statement) return orderLines.find((item) => item.id === statement.lineIds[0]) ?? null;
  const byOrder = orderLines.find((item) => item.orderNo === ref);
  if (byOrder) return byOrder;
  const normalized = ref.replace(/-(\d{2})$/, "");
  return orderLines.find((item) => item.orderNo === normalized) ?? null;
}

export function getWaitMinutes(wait = "") {
  if (wait.includes("刚刚")) return 0;
  const value = Number(wait.match(/\d+/)?.[0] ?? 0);
  if (wait.includes("天")) return value * 24 * 60;
  if (wait.includes("小时")) return value * 60;
  if (wait.includes("分钟")) return value;
  return value;
}

export function getLatestRank(latest = "") {
  if (latest.includes("昨天")) return 0;
  if (latest.includes("今天")) {
    const match = latest.match(/(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : 24 * 60;
  }
  if (latest.includes("明天")) return 2 * 24 * 60;
  if (latest.includes("本期")) return 4 * 24 * 60;
  if (latest.includes("本周")) return 7 * 24 * 60;
  return 9 * 24 * 60;
}

export function getTodoPriority(todo) {
  if (todo.urgency === "急") return 0;
  if (todo.urgency === "异常") return 1;
  if (todo.urgency === "今天" || todo.latest.includes("今天")) return 2;
  if (todo.urgency === "关注") return 3;
  return 4;
}

export function sortTodos(todos) {
  return [...todos].sort((a, b) => {
    if (a.handled !== b.handled) return a.handled ? 1 : -1;
    const priorityDiff = getTodoPriority(a) - getTodoPriority(b);
    if (priorityDiff) return priorityDiff;
    const latestDiff = getLatestRank(a.latest) - getLatestRank(b.latest);
    if (latestDiff) return latestDiff;
    return getWaitMinutes(b.wait) - getWaitMinutes(a.wait);
  });
}

export function getTodoTone(todo) {
  if (todo.handled) return "success";
  if (todo.printResultStatus === "unknown") return "danger";
  if (todo.printResultStatus === "partial" || todo.printResultStatus === "not_printed") return "warning";
  if (todo.urgency === "异常") return "danger";
  if (todo.urgency === "急" || todo.urgency === "今天") return "warning";
  if (todo.urgency === "关注") return "blue";
  return "neutral";
}

export function isPrintTodo(todo) {
  return todo.type.includes("打印") || todo.type.includes("标签");
}

export function getTodoHandlingRule(todo) {
  if (todo.type.includes("数量") || todo.type.includes("差额") || todo.type.includes("缺货")) return "必须逐条处理";
  if (todo.type.includes("待通知客户")) return "先复制话术，人工发送后确认";
  if (todo.type.includes("成品图需重拍")) return "通知车间重拍后关闭";
  if (todo.printResultStatus === "unknown") return "打印异常，需核对";
  if (todo.printResultStatus === "partial") return "部分未打出，待重打";
  if (todo.printResultStatus === "not_printed") return "未打出，待重打";
  if (isPrintTodo(todo)) return "低风险，可批量处理";
  if (todo.type.includes("老板") || todo.type.includes("管理")) return "查看后记录处理人";
  return "普通待办，可稍后提醒";
}

export function getTodoActions(todo) {
  if (todo.handled) {
    return [
      { label: "重新打开", variant: "secondary" },
      { label: "打印预览", variant: "secondary" },
    ];
  }

  if (todo.type.includes("订单草稿")) {
    return [
      { label: "打开订单录入", variant: "primary" },
      { label: "处理完成", variant: "secondary" },
      { label: "打开订单池", variant: "secondary" },
    ];
  }

  if (todo.type.includes("缺货")) {
    return [
      { label: "打开库存查询", variant: "primary" },
      { label: "客户待确认", variant: "secondary" },
      { label: "打开订单池", variant: "secondary" },
      { label: "处理完成", variant: "secondary" },
    ];
  }

  if (todo.type.includes("数量")) {
    return [
      { label: "打开出库异常", variant: "primary" },
      { label: "处理完成", variant: "secondary" },
      { label: "打印预览", variant: "secondary" },
    ];
  }

  if (todo.type.includes("打印") || todo.type.includes("标签")) {
    return [
      { label: "打印标签", variant: "primary" },
      { label: "批量打印标签", variant: "secondary" },
      { label: "打开出库异常", variant: "secondary" },
    ];
  }

  if (todo.type.includes("快递") || todo.type.includes("快运")) {
    return [
      { label: "打开出库异常", variant: "primary" },
      { label: "确认已查看", variant: "secondary" },
      { label: "打印预览", variant: "secondary" },
    ];
  }

  if (todo.type.includes("对账") || todo.type.includes("收款")) {
    return [
      { label: "打开对账收款", variant: "primary" },
      { label: "处理完成", variant: "secondary" },
      { label: "打印预览", variant: "secondary" },
    ];
  }

  if (todo.type.includes("待通知客户")) {
    return [
      { label: "复制通知话术", variant: "primary" },
      { label: "确认已通知客户", variant: "secondary" },
      { label: "打开订单", variant: "secondary" },
    ];
  }

  if (todo.type.includes("成品图需重拍")) {
    return [
      { label: "打开订单", variant: "primary" },
      { label: "处理完成", variant: "secondary" },
    ];
  }

  if (todo.type.includes("老板") || todo.type.includes("管理")) {
    return [
      { label: "打开管理查看", variant: "primary" },
      { label: "确认已查看", variant: "secondary" },
    ];
  }

  return [
    { label: "打开订单池", variant: "primary" },
    { label: "处理完成", variant: "secondary" },
  ];
}

export function getTodoCustomerNotificationDraft(todo, customer) {
  if (!todo || !String(todo.type ?? "").includes("待通知客户")) return null;
  const channel = todo.notificationChannel || "微信 / 企业微信人工发送";
  const contact = customer?.contact || "客户";
  const ref = todo.ref || todo.refId || "";
  const copyText =
    todo.notificationCopyText ||
    `您好，${contact}，您这单${ref ? ` ${ref}` : ""} 成品已经做好，成品图发您确认。确认可以的话，我们按原交付方式安排发货。`;
  const photoPrompt =
    todo.photoPrompt ||
    todo.finishedGoodsPhotoPrompt ||
    "发送时请附上已复核的成品图；客户回复确认后再按原交付方式继续安排。";
  return {
    channel,
    copyText,
    photoPrompt,
    status: todo.notificationStatus || (todo.handled ? "已通知客户" : "待人工发送"),
  };
}
