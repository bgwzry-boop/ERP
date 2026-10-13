import assert from "node:assert/strict";
import {
  FULFILLMENT_DETAIL_TABS,
  FULFILLMENT_VIEWS,
  findDeliveryEvidenceFile,
  formatFulfillmentDispatchSummary,
  formatFulfillmentTableRemark,
  formatPaperOutboundDocument,
  fulfillmentMatchesQuery,
  fulfillmentMatchesView,
  getFulfillmentAttentionScore,
  getFulfillmentAttentionTone,
  getFulfillmentListProduct,
  getFulfillmentPaperTone,
} from "../src/features/fulfillment/fulfillmentPageModel.js";

assert.deepEqual(FULFILLMENT_DETAIL_TABS, ["任务处理", "单据/证据", "流转记录"]);
assert.deepEqual(FULFILLMENT_VIEWS, ["全部", "待纸单", "待交库房", "待库房", "待司机", "在途", "异常", "已交付"]);

const orderLines = [{ id: "OL-001", product: "定制印刷袋", size: "30×38" }];
const item = {
  id: "F-001",
  lineId: "OL-001",
  customerId: "C-001",
  method: "送货",
  status: "待司机装车",
  latest: "今天 18:00",
  zone: "成品仓",
  source: "定制订单",
  routeDate: "2026-09-02",
  routeNo: "R-08",
  routeSequence: 2,
  dispatchStatus: "已派单",
};
const queryHelpers = {
  orderLines,
  findCustomer(customerId) {
    return customerId === "C-001"
      ? { name: "张三服饰", contact: "张经理", phone: "13800000000" }
      : null;
  },
  findOrderLine(lines, lineId) {
    return lines.find((line) => line.id === lineId) ?? null;
  },
  getFulfillmentGoodsDisplay(_item, line) {
    return `${line.product} / ${line.size}`;
  },
};

assert.equal(fulfillmentMatchesQuery(item, "", queryHelpers), true);
assert.equal(fulfillmentMatchesQuery(item, "张三服饰", queryHelpers), true);
assert.equal(fulfillmentMatchesQuery(item, "13800000000", queryHelpers), true);
assert.equal(fulfillmentMatchesQuery(item, "定制印刷袋", queryHelpers), true);
assert.equal(fulfillmentMatchesQuery(item, "等司机装车", queryHelpers), true);
assert.equal(fulfillmentMatchesQuery(item, "不存在的客户", queryHelpers), false);

assert.equal(fulfillmentMatchesView({ status: "待备货" }, "待纸单"), true);
assert.equal(fulfillmentMatchesView({ status: "待备货", paperOutboundStatus: "已打印待交库房" }, "待交库房"), true);
assert.equal(fulfillmentMatchesView({ status: "待备货", paperOutboundStatus: "已交库房" }, "待库房"), true);
assert.equal(fulfillmentMatchesView({ status: "数量差异待处理", paperOutboundStatus: "已交库房" }, "待库房"), false);
assert.equal(fulfillmentMatchesView({ status: "待备货", paperOutboundStatus: "已交库房", physicalOutboundAt: "2026-09-02T10:00:00.000Z" }, "待库房"), false);
assert.equal(fulfillmentMatchesView(item, "待司机"), true);
assert.equal(fulfillmentMatchesView({ status: "配送中" }, "在途"), true);
assert.equal(fulfillmentMatchesView({ status: "待司机装车", finalDeliveryStatus: "在途" }, "在途"), true);
assert.equal(fulfillmentMatchesView({ status: "无法出库" }, "异常"), true);
assert.equal(fulfillmentMatchesView({ status: "待备货", exceptionReason: "货物破损" }, "异常"), true);
assert.equal(fulfillmentMatchesView({ status: "已交付" }, "已交付"), true);
assert.equal(fulfillmentMatchesView({ status: "待备货" }, "全部"), true);

assert.deepEqual(
  getFulfillmentListProduct(item, orderLines[0], (_item, line) => `${line.product} / ${line.size}`),
  { primary: "定制印刷袋", secondary: "30×38" },
);
assert.equal(formatFulfillmentTableRemark(item), "等司机装车");
assert.equal(formatFulfillmentTableRemark({ ...item, status: "配送中" }), "司机在途");
assert.equal(formatFulfillmentTableRemark({ ...item, status: "数量差异待处理" }), "需办公室处理");
assert.equal(formatFulfillmentTableRemark({ ...item, status: "待备货", paperOutboundStatus: "已打印待交库房" }), "纸单待交库房");
assert.equal(formatFulfillmentTableRemark({ ...item, status: "待备货", paperOutboundStatus: "已交库房" }), "等库房反馈");
assert.equal(formatFulfillmentTableRemark({ ...item, status: "待备货" }), "R-08 #2");

assert.equal(getFulfillmentAttentionTone({ status: "数量差异待处理" }, "需办公室处理"), "danger");
assert.equal(getFulfillmentAttentionTone({ status: "已交付" }, "正常"), "success");
assert.equal(getFulfillmentAttentionTone({ status: "待备货" }, "正常"), "neutral");
assert.equal(getFulfillmentAttentionTone({ status: "待司机装车" }, "等司机装车"), "warning");
assert.equal(getFulfillmentPaperTone({ paperOutboundStatus: "已作废待重打" }), "danger");
assert.equal(getFulfillmentPaperTone({ paperOutboundStatus: "已交库房" }), "success");
assert.equal(getFulfillmentPaperTone({ paperOutboundStatus: "已打印待交库房" }), "warning");
assert.ok(
  getFulfillmentAttentionScore({ status: "数量差异待处理", latest: "今天" })
    > getFulfillmentAttentionScore({ status: "待备货", latest: "明天" }),
  "exceptions due today should sort ahead of ordinary work",
);

assert.equal(formatFulfillmentDispatchSummary(item), "2026-09-02 / R-08 / 第 2 站 / 已派单");
assert.equal(formatFulfillmentDispatchSummary({}), "未排日期 / 未分趟 / 未排站序 / 未派单");
assert.equal(
  formatPaperOutboundDocument({
    paperOutboundDocument: { documentNo: "OUT-001", documentVersion: 2 },
    paperOutboundStatus: "已打印待交库房",
  }),
  "OUT-001 / V2 / 已打印待交库房",
);
assert.equal(formatPaperOutboundDocument({}), "纸单待生成 / 待生成");

const evidenceFiles = [
  { attachmentId: "ATT-WATERMARK", purpose: "delivery_watermark_photo" },
  { attachmentId: "ATT-SIGNATURE", purpose: "signature_photo" },
];
assert.equal(findDeliveryEvidenceFile(evidenceFiles, "ATT-WATERMARK")?.purpose, "delivery_watermark_photo");
assert.equal(findDeliveryEvidenceFile(evidenceFiles, "", "signature_photo")?.attachmentId, "ATT-SIGNATURE");
assert.equal(findDeliveryEvidenceFile(evidenceFiles, "ATT-MISSING"), null);

console.log("Office fulfillment page model checks passed: filtering, task lanes, priority, paper state, dispatch, and evidence selection are behavior-covered.");
