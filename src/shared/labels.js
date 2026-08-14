export const fulfillmentMethodLabel = Object.freeze({
  pickup: "自提",
  delivery: "送货",
  express_ltl: "快递快运",
});

export const semanticTagCatalog = Object.freeze({
  business: Object.freeze({
    custom: Object.freeze({ label: "定制单" }),
    stock: Object.freeze({ label: "现货通货" }),
    printed: Object.freeze({ label: "印刷通货" }),
    outsourced: Object.freeze({ label: "外加工" }),
  }),
  requirement: Object.freeze({
    "extended-handle": Object.freeze({ label: "加长提" }),
    snap: Object.freeze({ label: "按扣" }),
    "supplied-material": Object.freeze({ label: "来料加工" }),
    "double-sided": Object.freeze({ label: "双面印" }),
    urgent: Object.freeze({ label: "加急" }),
    "dual-color": Object.freeze({ label: "双色" }),
    "multi-color": Object.freeze({ label: "多色" }),
  }),
  state: Object.freeze({
    normal: Object.freeze({ label: "正常" }),
    running: Object.freeze({ label: "生产中" }),
    carry: Object.freeze({ label: "跨日继续" }),
    pending: Object.freeze({ label: "待复核" }),
    blocked: Object.freeze({ label: "异常暂停" }),
    done: Object.freeze({ label: "已完成" }),
    idle: Object.freeze({ label: "待机" }),
    voided: Object.freeze({ label: "已作废" }),
  }),
  owner: Object.freeze({
    "lane-1": Object.freeze({ label: "印1-01" }),
    "lane-2": Object.freeze({ label: "印2-02" }),
    "lane-3": Object.freeze({ label: "制3-01" }),
    "lane-4": Object.freeze({ label: "外协-01" }),
  }),
});

const businessTypeTagAliases = Object.freeze({
  custom: "custom",
  定制单: "custom",
  定制印刷: "custom",
  stock: "stock",
  现货通货: "stock",
  纯色通货: "stock",
  纯色袋: "stock",
  纯色通货袋: "stock",
  现货有货: "stock",
  现货缺货: "stock",
  printed: "printed",
  印刷通货: "printed",
  印刷通货袋: "printed",
  outsourced: "outsourced",
  外加工: "outsourced",
  外加工印刷: "outsourced",
});

const operationalStateTagAliases = Object.freeze({
  normal: "normal",
  正常: "normal",
  有货: "normal",
  可用: "normal",
  running: "running",
  生产中: "running",
  制袋中: "running",
  丝印中: "running",
  打包中: "running",
  配送中: "running",
  已恢复生产: "running",
  carry: "carry",
  跨日继续: "carry",
  pending: "pending",
  待处理: "pending",
  待复核: "pending",
  待排产: "pending",
  待出库: "pending",
  待备货: "pending",
  待打印: "pending",
  待打印标签: "pending",
  待打包: "pending",
  待交付: "pending",
  待对账: "pending",
  待收款确认: "pending",
  待快运拉走: "pending",
  待补印: "pending",
  收款待确认: "pending",
  已识别待复核: "pending",
  已打印待贴标: "pending",
  blocked: "blocked",
  阻塞: "blocked",
  失败: "blocked",
  异常暂停: "blocked",
  缺库存键: "blocked",
  缺货: "blocked",
  缺货待处理: "blocked",
  数量差异待处理: "blocked",
  有异常: "blocked",
  "差额/欠款": "blocked",
  差额或欠款: "blocked",
  done: "done",
  已完成: "done",
  已交付: "done",
  已备货: "done",
  已结清: "done",
  "已结清/无差额": "done",
  无差额: "done",
  idle: "idle",
  待机: "idle",
  未生产: "idle",
  未入账: "idle",
  voided: "voided",
  已作废: "voided",
  已取消: "voided",
  已关闭: "voided",
});

const requirementTagAliases = Object.freeze({
  "extended-handle": "extended-handle",
  加长提: "extended-handle",
  snap: "snap",
  按扣: "snap",
  "supplied-material": "supplied-material",
  来料: "supplied-material",
  来料加工: "supplied-material",
  "double-sided": "double-sided",
  双面: "double-sided",
  双面印: "double-sided",
  urgent: "urgent",
  加急: "urgent",
  "dual-color": "dual-color",
  双色: "dual-color",
  "multi-color": "multi-color",
  多色: "multi-color",
});

export const fulfillmentMethodValue = Object.freeze(
  Object.fromEntries(Object.entries(fulfillmentMethodLabel).map(([value, label]) => [label, value])),
);

export function labelOf(dictionary, value, fallback = "待确认") {
  return dictionary[String(value ?? "").trim()] ?? fallback;
}

export function getFulfillmentMethodLabel(value, fallback = "待确认") {
  const normalized = String(value ?? "").trim();
  if (fulfillmentMethodValue[normalized]) return normalized;
  return labelOf(fulfillmentMethodLabel, normalized, fallback);
}

export function getFulfillmentMethodValue(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  if (fulfillmentMethodLabel[normalized]) return normalized;
  return fulfillmentMethodValue[normalized] ?? fallback;
}

export function getSemanticTagDefinition(kind, value) {
  const normalizedKind = String(kind ?? "").trim();
  const normalizedValue = String(value ?? "").trim();
  const catalog = semanticTagCatalog[normalizedKind];
  const definition = catalog?.[normalizedValue];
  if (definition) {
    return { kind: normalizedKind, value: normalizedValue, label: definition.label, known: true };
  }
  return {
    kind: catalog ? normalizedKind : "state",
    value: "unknown",
    label: "待确认",
    known: false,
  };
}

export function getBusinessTypeTagValue(value) {
  return businessTypeTagAliases[String(value ?? "").trim()] ?? "unknown";
}

export function getOperationalStateTagValue(value) {
  return operationalStateTagAliases[String(value ?? "").trim()] ?? "unknown";
}

export function getRequirementTagValue(value) {
  return requirementTagAliases[String(value ?? "").trim()] ?? "unknown";
}

export function getStructuredRequirementTagValues(record = {}) {
  const values = [];
  if (record.handle === "加长提" || record.handleType === "加长提") values.push("extended-handle");
  if (record.hasSnap === true || record.snap === true || record.snapRequirement === "按扣") values.push("snap");
  if (["customer_supplied", "supplied", "来料", "来料加工"].includes(record.materialSource)) values.push("supplied-material");
  if (record.printSide === "双面" || record.printSide === "双面印") values.push("double-sided");
  if (record.priority === "urgent" || record.priority === "加急") values.push("urgent");
  const printColorCount = Array.isArray(record.printColors) ? record.printColors.filter(Boolean).length : Number(record.printColorCount || 0);
  if (printColorCount === 2) values.push("dual-color");
  if (printColorCount >= 3) values.push("multi-color");
  return [...new Set(values)];
}
