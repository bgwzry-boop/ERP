export const FULFILLMENT_DETAIL_TABS = ["任务处理", "单据/证据", "流转记录"];

export const FULFILLMENT_VIEWS = ["全部", "待纸单", "待交库房", "待库房", "待司机", "在途", "异常", "已交付"];

export function fulfillmentMatchesQuery(
  item,
  query,
  { findCustomer, findOrderLine, getFulfillmentGoodsDisplay, orderLines },
) {
  const normalizedQuery = String(query ?? "").trim().toLowerCase();
  if (!normalizedQuery) return true;
  const line = findOrderLine(orderLines, item.lineId);
  const customer = findCustomer(item.customerId);
  const searchable = [
    item.id,
    item.lineId,
    item.method,
    item.status,
    item.latest,
    item.zone,
    item.source,
    item.exceptionReason,
    customer?.name,
    customer?.contact,
    customer?.phone,
    getFulfillmentGoodsDisplay(item, line),
    formatFulfillmentTableRemark(item),
  ].filter(Boolean).join(" ").toLowerCase();
  return searchable.includes(normalizedQuery);
}

export function fulfillmentMatchesView(item, view) {
  const status = String(item?.status ?? "");
  const paperStatus = String(item?.paperOutboundStatus ?? "");
  if (view === "待纸单") return !paperStatus || paperStatus.includes("待生成") || paperStatus.includes("待打印") || paperStatus.includes("待重打") || item?.printRecordStatus === "voided";
  if (view === "待交库房") return paperStatus === "已打印待交库房";
  if (view === "待库房") return paperStatus === "已交库房" && !item?.physicalOutboundAt && !status.includes("数量") && !status.includes("无法");
  if (view === "待司机") return status === "待司机装车";
  if (view === "在途") return status === "配送中" || item?.finalDeliveryStatus === "在途";
  if (view === "异常") return Boolean(item?.exceptionReason) || status.includes("数量") || status.includes("无法");
  if (view === "已交付") return status === "已交付";
  return true;
}

export function getFulfillmentListProduct(item, line, getFulfillmentGoodsDisplay) {
  const summary = getFulfillmentGoodsDisplay(item, line);
  const primary = line?.product || item?.goods || "未命名货品";
  const prefix = `${primary} / `;
  return {
    primary,
    secondary: summary.startsWith(prefix) ? summary.slice(prefix.length) : summary,
  };
}

export function getFulfillmentAttentionTone(item, remark) {
  if (item.status.includes("数量") || item.status.includes("无法") || item.exceptionReason) return "danger";
  if (item.status === "已交付") return "success";
  if (remark === "正常") return "neutral";
  return "warning";
}

export function getFulfillmentPaperTone(item) {
  const paperStatus = String(item?.paperOutboundStatus ?? "");
  if (paperStatus.includes("作废") || paperStatus.includes("待复核")) return "danger";
  if (paperStatus === "已交库房") return "success";
  return "warning";
}

export function formatFulfillmentDispatchSummary(item) {
  const routeDate = item.routeDate || "未排日期";
  const routeNo = item.routeNo || item.routeBatchNo || "未分趟";
  const sequence = Number(item.routeSequence ?? item.stopSequence ?? 0);
  const sequenceText = sequence > 0 ? `第 ${sequence} 站` : "未排站序";
  const status = item.dispatchStatus || "未派单";
  return [routeDate, routeNo, sequenceText, status].filter(Boolean).join(" / ");
}

export function getFulfillmentAttentionScore(item) {
  const status = String(item?.status ?? "");
  const latest = String(item?.latest ?? "");
  let score = 0;
  if (status.includes("数量") || status.includes("无法")) score += 100;
  if (status === "待司机装车" || status === "配送中") score += 60;
  if (status !== "已交付") score += 20;
  if (latest.includes("今天") || latest.includes("急")) score += 40;
  return score;
}

export function formatFulfillmentTableRemark(item) {
  if (item.status.includes("数量") || item.status.includes("无法")) return "需办公室处理";
  if (item.paperOutboundStatus === "已打印待交库房") return "纸单待交库房";
  if (item.paperOutboundStatus === "已交库房" && !item.physicalOutboundAt) return "等库房反馈";
  if (item.status === "待司机装车") return "等司机装车";
  if (item.status === "配送中") return "司机在途";
  const routeSequence = Number(item.routeSequence ?? item.stopSequence ?? 0);
  if (item.method === "送货" && routeSequence > 0) return `${item.routeNo || item.routeBatchNo || "未分趟"} #${routeSequence}`;
  return "正常";
}

export function formatPaperOutboundDocument(item) {
  const document = item?.paperOutboundDocument ?? {};
  const documentNo = document.documentNo || item?.paperOutboundDocumentNo || "纸单待生成";
  const version = document.documentVersion ?? item?.paperOutboundDocumentVersion;
  const versionText = version ? `V${version}` : "";
  const status = item?.paperOutboundStatus || document.status || "待生成";
  return [documentNo, versionText, status].filter(Boolean).join(" / ");
}

export function findDeliveryEvidenceFile(files = [], attachmentId = "", purpose = "") {
  return files.find((file) => (attachmentId && file.attachmentId === attachmentId) || (purpose && file.purpose === purpose)) ?? null;
}
