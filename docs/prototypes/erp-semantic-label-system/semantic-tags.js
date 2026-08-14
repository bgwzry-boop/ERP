export const SEMANTIC_TAG_CATALOG = Object.freeze({
  business: {
    label: "业务类型",
    question: "这是什么单",
    rule: "固定放在客户或品名之后；不能用运行状态代替业务类型。",
    values: [
      { value: "custom", label: "定制单", description: "按客户要求生产的定制订单" },
      { value: "stock", label: "现货通货", description: "从现货库存直接履约的通用商品" },
      { value: "printed", label: "印刷通货", description: "标准袋型上的通用印刷商品" },
      { value: "outsourced", label: "外加工", description: "由外部或来料加工链路完成" },
    ],
  },
  requirement: {
    label: "特殊要求",
    question: "生产要特别做什么",
    rule: "只标会改变生产动作的要求；非阻塞特征不得使用异常红。",
    values: [
      { value: "extended-handle", label: "加长提", description: "提手工艺或长度发生变化" },
      { value: "snap", label: "按扣", description: "需要增加按扣工序" },
      { value: "supplied-material", label: "来料加工", description: "客户或外部提供主要材料" },
      { value: "double-sided", label: "双面印", description: "正反两面均需印刷" },
      { value: "urgent", label: "加急", description: "优先级提高，但不等于阻塞异常" },
      { value: "dual-color", label: "双色", description: "丝印需要两种权威印刷色" },
      { value: "multi-color", label: "多色", description: "丝印需要三种及以上权威印刷色" },
    ],
  },
  state: {
    label: "运行状态",
    question: "现在做到哪一步",
    rule: "蓝=正常，绿=进行，黄=待处理，红=阻塞，灰绿=结束，灰=作废。",
    values: [
      { value: "normal", label: "正常", description: "流程可继续、尚未进入执行" },
      { value: "running", label: "生产中", description: "服务器确认任务正在执行" },
      { value: "pending", label: "待复核", description: "需要人工处理后再继续" },
      { value: "blocked", label: "异常暂停", description: "阻塞下一步的明确异常" },
      { value: "done", label: "已完成", description: "流程已结束并保留结果" },
      { value: "voided", label: "已作废", description: "业务对象不再生效" },
    ],
  },
  owner: {
    label: "人员 / 机台归属",
    question: "谁来做",
    rule: "颜色只帮助扫视，员工或机台编号必须完整显示；归属色不表示状态。",
    values: [
      { value: "lane-1", label: "印1-01", description: "第一归属色槽，必须配合真实编号" },
      { value: "lane-2", label: "印2-02", description: "第二归属色槽，必须配合真实编号" },
      { value: "lane-3", label: "制3-01", description: "第三归属色槽，必须配合真实编号" },
      { value: "lane-4", label: "外协-01", description: "第四归属色槽，必须配合真实编号" },
    ],
  },
});

export const SEMANTIC_TAG_SIZES = Object.freeze(["compact", "standard", "prominent"]);

export function getSemanticTagDefinition(kind, value) {
  const category = SEMANTIC_TAG_CATALOG[kind];
  const definition = category?.values.find((item) => item.value === value);
  if (definition) return { ...definition, kind, categoryLabel: category.label, isFallback: false };
  return {
    kind: "unknown",
    value: "unknown",
    label: "待确认",
    categoryLabel: "未映射",
    description: "业务值尚未进入权威映射表",
    isFallback: true,
  };
}

export function createSemanticTagMarkup({ kind, value, label, size = "standard" }) {
  const definition = getSemanticTagDefinition(kind, value);
  const normalizedSize = SEMANTIC_TAG_SIZES.includes(size) ? size : "standard";
  const visibleLabel = label || definition.label;
  const sizeAttribute = normalizedSize === "standard" ? "" : ` data-size="${normalizedSize}"`;
  return `<span class="erp-semantic-tag" data-kind="${definition.kind}" data-value="${definition.value}"${sizeAttribute}>${visibleLabel}</span>`;
}

export function createReactUsage({ kind, value, size = "standard" }) {
  return `<SemanticTag kind="${kind}" value="${value}" size="${size}" />`;
}
