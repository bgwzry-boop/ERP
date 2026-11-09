// 负责人 2026-11-08：订单跟踪右栏只放工序进度，像小程序的物流进度一样一步一行。
// 各种单子的工序不一样：
//   丝印定制 / 丝印通货：下单 → 备料 → 丝印 → 制袋 → 打包 → 发货
//   纯色通货（补库）：下单 → 备料 → 制袋 → 打包 → 入库
//   来料加工：下单 → 收卷料 → 丝印 → 计数 → 送货
//   现货：下单 → 出库
const text = (value) => String(value ?? "").trim();

const FLOWS = Object.freeze({
  custom: ["下单", "备料", "丝印", "制袋", "打包", "发货"],
  plainStock: ["下单", "备料", "制袋", "打包", "入库"],
  external: ["下单", "收卷料", "丝印", "计数", "送货"],
  stock: ["下单", "出库"],
});

export function orderFlowKind(line = {}) {
  const type = text(line.orderType);
  if (/外加工|来料/u.test(type)) return "external";
  if (/定制|印刷通货/u.test(type)) return "custom";
  if (/补库|生产通货/u.test(type)) return "plainStock";
  return "stock";
}

const DONE = /已交付|已完成|已提货|已签收|已结算|已对账/u;

function currentStep(kind, status) {
  const value = text(status);
  if (DONE.test(value)) return Infinity;
  const steps = FLOWS[kind];
  const at = (label) => steps.indexOf(label);
  if (kind === "stock") return /待出库|已备货|待发货|配送|出库/u.test(value) ? at("出库") : at("出库");
  if (/配送|运输|待出库|待发货|已备货|待自提/u.test(value)) return kind === "plainStock" ? at("入库") : at(kind === "external" ? "送货" : "发货");
  if (/打包|待贴标|待打印标签/u.test(value)) return kind === "external" ? at("计数") : at("打包");
  if (/制袋/u.test(value)) return kind === "external" ? at("丝印") : at("制袋");
  if (/丝印|印刷中/u.test(value)) return at("丝印") >= 0 ? at("丝印") : at("制袋");
  if (/生产中/u.test(value)) return kind === "plainStock" ? at("制袋") : at(kind === "external" ? "丝印" : "丝印");
  if (/收卷|来料/u.test(value) && kind === "external") return at("收卷料");
  return 1; // 已下单，等备料 / 排产
}

/**
 * Timeline steps for one order line.
 * Each step: { label, state: "done" | "current" | "blocked" | "todo", note }.
 */
export function buildOrderTimeline(line = {}) {
  const kind = orderFlowKind(line);
  const steps = FLOWS[kind];
  const index = currentStep(kind, line.status);
  const risk = text(line.risk && line.risk !== "—" ? line.risk : "");
  const shortage = /缺货|缺料|库存不足/u.test(`${text(line.status)} ${risk}`);
  return {
    kind,
    total: steps.length,
    position: Number.isFinite(index) ? Math.min(index + 1, steps.length) : steps.length,
    done: !Number.isFinite(index),
    steps: steps.map((label, position) => {
      const state = !Number.isFinite(index) || position < index ? "done" : position === index ? (shortage || risk ? "blocked" : "current") : "todo";
      let note = "";
      if (position === 0) note = text(line.createdAtLabel || line.orderNo);
      if (state === "blocked") note = risk || text(line.status);
      else if (state === "current") note = text(line.status);
      if (position === steps.length - 1 && state !== "done" && text(line.latest) && text(line.latest) !== "待确认") note = note || `客户要 ${text(line.latest)}`;
      return { label, state, note };
    }),
  };
}
