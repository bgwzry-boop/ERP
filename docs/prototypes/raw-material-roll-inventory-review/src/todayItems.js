// 负责人 2026-11-08：工作台「今天」——办公室一打开就看今天要办的事，一件一行，点按钮直接去办。
// 只放要人动手的事：缺货缺料、待打送货单、原料收货没办完。办完了就从清单里消失。
import { formatOrderLineText } from "./orderLineText.js";

const text = (value) => String(value ?? "").trim();
const DONE_ORDER = /已交付|已完成|已取消|已作废|已关闭/u;
const DONE_FULFILLMENT = new Set(["已交付", "已提货", "已完成", "已取消", "已作废"]);
const UNPRINTED_PAPER = new Set(["", "待生成纸单", "待打印确认"]);

export const TODAY_GROUPS = Object.freeze([
  Object.freeze({ key: "shortage", label: "缺货缺料", tone: "danger" }),
  Object.freeze({ key: "note", label: "待打送货单", tone: "warning" }),
  Object.freeze({ key: "receiving", label: "原料没收完", tone: "warning" }),
]);

const RECEIVING_STEPS = Object.freeze({
  已识别待复核: { note: "待核对", action: "去核对" },
  已复核待打印标签: { note: "待打卷标", action: "打卷标" },
  已入库待补打标签: { note: "待补打卷标", action: "打卷标" },
  已打印待贴标: { note: "待贴标", action: "去贴标" },
  部分贴标: { note: "还有卷没贴标", action: "去贴标" },
});

function customerOf(record, customerNames) {
  return text(record.customerName || record.customerSnapshot?.name) || customerNames.get(record.customerId) || text(record.customerId) || "客户待确认";
}

function shortageNote(line) {
  if (Array.isArray(line.exceptions) && line.exceptions.length) return line.exceptions.join("、");
  if (/缺货/u.test(text(line.inventory)) || /缺货/u.test(text(line.status))) return "库存不足";
  return "";
}

function dateText(value) {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})/u);
  return match ? `${Number(match[2])}月${Number(match[3])}日` : "";
}

/**
 * Builds today's to-do rows from the office data already on the page.
 * Returns [{ id, group, title, text, note, action: { label, navId, focus } }], grouped in TODAY_GROUPS order.
 */
export function buildTodayItems({ orderLines = [], fulfillments = [], rawMaterialInbounds = [], customers = [] } = {}) {
  const customerNames = new Map(customers.map((customer) => [customer.id ?? customer.customerId, customer.name ?? customer.customerName]));
  const lineById = new Map(orderLines.map((line) => [line.id ?? line.orderLineId, line]));
  const items = [];

  for (const line of orderLines) {
    const note = shortageNote(line);
    if (!note || DONE_ORDER.test(text(line.status))) continue;
    const id = line.id ?? line.orderLineId;
    items.push({
      id: `shortage:${id}`,
      group: "shortage",
      title: customerOf(line, customerNames),
      text: formatOrderLineText(line),
      note,
      action: { label: "看订单", navId: "order-pool", focus: { recordId: id } },
    });
  }

  for (const fulfillment of fulfillments) {
    const id = fulfillment.id ?? fulfillment.fulfillmentId;
    if (DONE_FULFILLMENT.has(text(fulfillment.status)) || fulfillment.physicalOutboundAt || fulfillment.finalDeliveryAt) continue;
    if (fulfillment.noteReadiness?.ready !== true) continue;
    const paperStatus = text(fulfillment.paperOutboundDocument?.status) || text(fulfillment.paperOutboundStatus);
    if (!UNPRINTED_PAPER.has(paperStatus)) continue;
    const line = lineById.get(fulfillment.lineId ?? fulfillment.orderLineId) ?? {};
    const packages = Number(fulfillment.actualPackageCount);
    items.push({
      id: `note:${id}`,
      group: "note",
      title: customerOf({ ...line, ...fulfillment }, customerNames),
      text: formatOrderLineText({ ...line, qty: fulfillment.actualQty ?? fulfillment.expectedQty ?? fulfillment.qty ?? line.qty }),
      note: packages > 0 ? `已打包 ${packages} 包` : text(fulfillment.status) || "待出库",
      action: { label: "去打单", navId: "outbound-delivery", focus: { recordId: id } },
    });
  }

  for (const inbound of rawMaterialInbounds) {
    const step = RECEIVING_STEPS[text(inbound.status)];
    if (!step || inbound.documentDirection === "supplier_return") continue;
    const rolls = Number(inbound.rollCount ?? inbound.rolls?.length ?? 0);
    const weight = Number(inbound.totalWeightKg);
    const parts = [
      "送货单",
      rolls > 0 ? `${rolls}${text(inbound.unit) === "件" ? "件" : "卷"}` : "",
      Number.isFinite(weight) && weight > 0 ? `${weight.toFixed(1)}kg` : "",
    ].filter(Boolean).join(" ");
    const arrived = dateText(inbound.receivedAt);
    items.push({
      id: `receiving:${inbound.id}`,
      group: "receiving",
      title: text(inbound.supplierName) || "送货单位待确认",
      text: arrived ? `${parts} · ${arrived}到` : parts,
      note: step.note,
      action: { label: step.action, navId: "material-receiving", focus: { recordId: inbound.id } },
    });
  }

  const order = new Map(TODAY_GROUPS.map((group, index) => [group.key, index]));
  return items.sort((a, b) => order.get(a.group) - order.get(b.group));
}

/**
 * 「今天」标题和空状态。数据没读全或读失败时绝不能说"没有要办的事"，免得办公室漏办。
 * meta 来自 useFormalDesktopWorkspace（loading / pendingInitial / hasLoaded / blockingError）。
 * 返回 { state: "items" | "loading" | "failed" | "empty", count }。
 */
export function todayStatus(items = [], meta = {}) {
  if (items.length) return { state: "items", count: items.length };
  if (meta.blockingError) return { state: "failed", count: 0 };
  if (meta.loading || meta.pendingInitial || !meta.hasLoaded) return { state: "loading", count: 0 };
  return { state: "empty", count: 0 };
}
