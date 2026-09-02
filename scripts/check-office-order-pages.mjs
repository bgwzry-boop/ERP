import assert from "node:assert/strict";
import {
  ENTRY_STEPS,
  buildValidationIssues,
  formatFileSize,
  getArtworkDisplayValue,
  getCancellationLinkState,
  getConfidenceScore,
  getEntryDraftRowDomId,
  getQueueKindLabel,
  getUnitPrice,
  isCancelledDraftRow,
  toFiniteNumber,
  withCurrentColor,
} from "../src/features/orders/entryPageModel.js";
import {
  ORDER_DETAIL_TABS,
  ORDER_STATUS_FILTERS,
  getActiveFilterCount,
  getOrderActionState,
  getOrderDetailInventoryLabel,
  getOrderLineMutationBlocker,
  getOrderPoolSourceLabel,
  orderMatchesQuery,
} from "../src/features/orders/orderPoolPageModel.js";

assert.deepEqual(ENTRY_STEPS, [
  { id: 1, title: "第一步：粘贴原文" },
  { id: 2, title: "第二步：校对明细" },
  { id: 3, title: "第三步：库存与确认" },
]);
assert.equal(getArtworkDisplayValue({ print: "否" }), "非印刷不需要");
assert.equal(getArtworkDisplayValue({ print: "是", artworkStatus: "待上传" }), "待上传");
assert.equal(
  getArtworkDisplayValue({
    print: "是",
    artworkAttachment: { fileName: "front.pdf", fileSize: 1.5 * 1024 * 1024 },
  }),
  "front.pdf · 1.5MB · 已上传",
);
assert.equal(formatFileSize(512), "512B");
assert.equal(formatFileSize(1536), "1.5KB");
assert.equal(formatFileSize(2 * 1024 * 1024), "2MB");
assert.equal(getConfidenceScore("high"), "0.96");
assert.equal(getConfidenceScore("medium"), "0.92");
assert.equal(getConfidenceScore("low"), "0.68");
assert.equal(getUnitPrice({ qty: 200, amount: 350 }), "¥1.75");
assert.equal(getUnitPrice({ qty: 0, amount: 350 }), "¥0.00");
assert.equal(toFiniteNumber("12.5"), 12.5);
assert.equal(toFiniteNumber("invalid"), 0);
assert.equal(getQueueKindLabel("temporary_hold"), "临时留货");
assert.equal(getQueueKindLabel("cancellation_review"), "取消复核");
assert.equal(getQueueKindLabel("unknown"), "复核上下文");
assert.equal(isCancelledDraftRow({ excludedFromConfirmation: true }), true);
assert.equal(isCancelledDraftRow({ cancellationStatus: "库存不足取消" }), true);
assert.equal(isCancelledDraftRow({ status: "待确认" }), false);
assert.deepEqual(withCurrentColor(["大红", "黑色", "大红"], "黑色"), ["黑色", "大红"]);
assert.equal(getEntryDraftRowDomId(0), "entry-draft-row-1");
assert.equal(getEntryDraftRowDomId(3), "entry-draft-row-4");

const draftRows = [
  { id: "D-001", print: "是", artworkStatus: "待上传", inventory: "缺货 120", missing: ["尺寸"] },
  { id: "D-002", print: "否", inventory: "可用", missing: [] },
];
const issues = buildValidationIssues({
  draftRows,
  missingRows: [draftRows[0]],
  inventoryIssueRows: [draftRows[0]],
  reviewRows: [draftRows[0]],
  getDraftMissingFields: (row) => row.missing,
});
assert.deepEqual(issues.map(({ id, rowIndex, label, tone }) => ({ id, rowIndex, label, tone })), [
  { id: "missing-D-001", rowIndex: 0, label: "缺 尺寸", tone: "danger" },
  { id: "inventory-D-001", rowIndex: 0, label: "库存缺货 120", tone: "danger" },
  { id: "review-D-001", rowIndex: 0, label: "印刷稿件待上传", tone: "warning" },
]);

const cancellationQueueItem = {
  kind: "cancellation_review",
  inventoryIntents: [{ id: "INT-001", intentType: "shortage_cancellation", customerId: "C-001" }],
};
assert.deepEqual(getCancellationLinkState(cancellationQueueItem, { id: "D-001", customerId: "C-001" }), {
  cancellationIntent: cancellationQueueItem.inventoryIntents[0],
  cancellationCustomerId: "C-001",
  canLink: true,
});
assert.equal(getCancellationLinkState(cancellationQueueItem, { customerId: "C-002" }).canLink, false);
assert.equal(
  getCancellationLinkState(cancellationQueueItem, { customerId: "C-001", excludedFromConfirmation: true }).canLink,
  false,
);
assert.equal(getCancellationLinkState({ kind: "order_draft" }, { customerId: "C-001" }).canLink, false);

assert.deepEqual(ORDER_DETAIL_TABS, ["订单", "交付", "财务"]);
assert.deepEqual(ORDER_STATUS_FILTERS, ["全部", "待处理", "生产中", "待出库", "缺货", "已交付", "待对账"]);
const orderLine = {
  id: "OL-001",
  orderNo: "ORD-20260902",
  lineNo: "02",
  customerId: "C-001",
  product: "定制印刷袋",
  size: "30×38",
  color: "红色",
  status: "待生产",
};
const findCustomer = () => ({ name: "张三服饰" });
const getColorSpec = () => "红印白 / 红袋黑提";
const getRemark = () => "双面加长提";
for (const query of ["ORD-20260902", "张三服饰", "定制印刷袋", "红印白", "双面加长提", "待生产"]) {
  assert.equal(orderMatchesQuery(orderLine, query, findCustomer, getColorSpec, getRemark), true, query);
}
assert.equal(orderMatchesQuery(orderLine, "李四电商", findCustomer, getColorSpec, getRemark), false);
assert.equal(orderMatchesQuery(orderLine, "", findCustomer, getColorSpec, getRemark), true);

const defaultFilters = { status: "全部", customerId: "全部", orderType: "全部" };
assert.equal(getActiveFilterCount(defaultFilters, defaultFilters, ""), 0);
assert.equal(getActiveFilterCount({ ...defaultFilters, status: "待处理" }, defaultFilters, ""), 1);
assert.equal(getActiveFilterCount({ ...defaultFilters, status: "待处理" }, defaultFilters, "张三"), 2);

assert.equal(getOrderLineMutationBlocker(null), "没有选中的订单明细。");
assert.equal(getOrderLineMutationBlocker({ status: "" }), "订单状态不完整，不能直接修改。");
assert.match(getOrderLineMutationBlocker({ status: "已交付" }), /不能直接改量或作废/);
assert.match(getOrderLineMutationBlocker({ status: "制袋中" }), /已进入生产或打包/);
assert.equal(getOrderLineMutationBlocker({ status: "待生产" }), "");
assert.deepEqual(
  getOrderActionState(() => ({ disabled: true, title: "无权限" }), "调整正式单数量", "业务阻塞"),
  { disabled: true, title: "无权限" },
);
assert.deepEqual(
  getOrderActionState(() => ({ disabled: false, title: "" }), "调整正式单数量", "已进入生产"),
  { disabled: true, title: "已进入生产" },
);

assert.equal(getOrderPoolSourceLabel({ loading: true }), "正在读取后端订单池");
assert.equal(
  getOrderPoolSourceLabel({ source: "api", total: 31, lastSyncedAt: "09:30" }),
  "后端订单池 31 行，09:30 同步",
);
assert.equal(getOrderPoolSourceLabel({ source: "api_error" }), "后端订单池返回错误，保留当前列表");
assert.equal(getOrderPoolSourceLabel({ source: "local_fallback" }), "后端未连接，使用本地演示数据");
assert.equal(getOrderPoolSourceLabel(), "本地演示数据");

assert.equal(getOrderDetailInventoryLabel({}, "可用"), "可用");
assert.equal(
  getOrderDetailInventoryLabel({
    inventory: [
      { state: "已占用", reservedQty: 100 },
      { state: "已占用", reservedQty: 50 },
      { state: "待补货", reservedQty: 0 },
    ],
  }, "可用"),
  "已占用、待补货；占用 150",
);

console.log("Office order page model checks passed: draft review, cancellation linking, query, mutation gates, source state, and inventory summaries are behavior-covered.");
