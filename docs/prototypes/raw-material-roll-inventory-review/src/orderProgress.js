// 订单池右侧「订单进度」与「下一步」：把订单明细的当前状态归到 下单 → 生产 → 出库 → 对账 四个阶段，
// 并给出下一步要做什么、主按钮去哪个工作台。只做展示和导航，不改变任何业务状态。

export const ORDER_PROGRESS_STEPS = Object.freeze(["下单", "生产", "出库", "对账"]);

const STAGES = Object.freeze([
  {
    // 对账阶段先判断：「已交付 / 待对账 / 待收款」都已经离开仓库
    stage: 3,
    pattern: /已交付|已送达|已提货|待对账|对账|待收款|收款|欠款|已完成|已结清/,
    next: "货已交付，在对账收款里核对这笔应收。",
    target: "customer-statements",
    action: "进入对账收款",
  },
  {
    stage: 2,
    pattern: /已备货|待出库|待送货|待发货|待提货|出库|配送|送货中|待打印/,
    next: "货已备好，安排出库：打印出库单，交给司机或等客户自提。",
    target: "outbound-delivery",
    action: "进入出库交付",
  },
  {
    stage: 1,
    pattern: /生产|丝印|印刷|制袋|打包|待排产|排产|机台|完工/,
    next: "在生产任务里跟进机台和完工登记。",
    target: "production-tasks",
    action: "进入生产任务",
  },
  {
    stage: 0,
    pattern: /缺货|待确认|草稿|待处理|待报价|待审核/,
    next: "订单还没进生产：先处理缺货或确认生产安排。",
    target: "production-tasks",
    action: "进入生产任务",
  },
]);

const FALLBACK = Object.freeze({
  stage: null,
  next: "核对订单当前状态后再安排下一步。",
  target: "production-tasks",
  action: "进入生产任务",
});

export function getOrderProgress(status) {
  const text = String(status ?? "").trim();
  const match = text ? STAGES.find((item) => item.pattern.test(text)) : null;
  const resolved = match ?? FALLBACK;
  return {
    stage: resolved.stage,
    next: resolved.next,
    target: resolved.target,
    action: resolved.action,
    steps: ORDER_PROGRESS_STEPS.map((label, index) => ({
      label,
      state: resolved.stage === null ? "todo" : index < resolved.stage ? "done" : index === resolved.stage ? "current" : "todo",
    })),
  };
}
