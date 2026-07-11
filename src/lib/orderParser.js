import { sampleText } from "../data/fixtures.js";
import { calculateLinePricing } from "../domain/priceTable.js";

const colorWords = ["米白", "浅蓝", "牛仔蓝", "大红", "红", "黑", "白", "蓝", "绿", "黄", "粉"];
const colorPattern = colorWords.join("|");
const sizeAliases = [
  { words: ["中号横款", "中号横版"], size: "40*30*10" },
  { words: ["小号横款", "小号横版"], size: "35*27*10" },
  { words: ["大号横款", "大号横版"], size: "50*40*12" },
  { words: ["中号"], size: "30*38*10" },
  { words: ["小号"], size: "25*32*10" },
  { words: ["大号"], size: "35*41*12" },
];

const customerAliases = {
  C001: ["张三", "张三服饰"],
  C002: ["李四", "李四电商"],
  C003: ["王五", "王五包装"],
  C004: ["美的", "空调"],
  C005: ["小熊", "童装"],
  C006: ["喜铺", "喜字"],
  C007: ["福袋", "福字"],
  C008: ["同行", "来料"],
  C009: ["红叶"],
  C010: ["黑马"],
  C011: ["白鲸", "自营"],
  C012: ["宏尚", "布业"],
};

export function parseOrderText(text, { customers = [], inventories = [] } = {}) {
  const normalized = (text || sampleText).replace(/\s+/g, " ").trim();
  const chunks = normalized
    .split(/[；;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const sourceChunks = chunks.length ? chunks : [normalized];

  let lastCustomer = null;
  const rows = [];

  sourceChunks.forEach((chunk, index) => {
    const customer = detectCustomer(chunk, customers, lastCustomer);
    if (customer) lastCustomer = customer;

    const size = detectSize(chunk);
    const quantities = detectQuantities(chunk);
    const product = detectProduct(chunk);
    const fulfillment = detectFulfillment(chunk);
    const print = chunk.includes("印") || chunk.includes("美的") || chunk.includes("图") || chunk.includes("logo") ? "是" : "否";
    const handle = chunk.includes("长提") || chunk.includes("加长") ? "加长提" : "普通提";
    const latest = detectLatest(chunk);
    const printColor = print === "是" ? detectPrintColor(chunk) : "非印刷";
    const printSide = print === "是" ? detectPrintSide(chunk) : "非印刷";
    const artworkStatus = print === "是" ? "待上传" : "非印刷";
    const handleColor = detectHandleColor(chunk);
    const note = detectNote(chunk, { handle });

    quantities.forEach((item, qtyIndex) => {
      const color = item.color || detectColor(chunk);
      const qty = Number(item.qty || 0);
      const baseRow = {
        id: `DRAFT-${index + 1}-${qtyIndex + 1}`,
        customer: customer?.name ?? "待确认客户",
        customerId: customer?.id ?? "",
        product,
        size,
        color,
        handle,
        style: product === "小熊袋" ? "小熊袋" : product.includes("喜") ? "喜" : product.includes("福") ? "福" : "空白袋",
        print,
        qty,
        fulfillment,
        latest,
        printColor,
        printSide,
        artworkStatus,
        handleColor,
        note,
        source: chunk,
      };
      rows.push(enrichDraftRow(baseRow, inventories));
    });
  });

  return rows;
}

export function enrichDraftRow(row, inventories = []) {
  const amount = estimateAmount(row);
  const inventory = estimateInventory(row, inventories);
  const confidence = getConfidence(row, inventory);
  return { ...row, amount, inventory, confidence };
}

export function estimateAmount(rowOrQty, print = "否") {
  const row = typeof rowOrQty === "object" && rowOrQty !== null ? rowOrQty : { qty: rowOrQty, print };
  return calculateLinePricing(row).amount;
}

function detectCustomer(chunk, customers, fallback) {
  return (
    customers.find((customer) => chunk.includes(customer.name)) ||
    customers.find((customer) => {
      const aliases = customerAliases[customer.id] ?? [customer.name.slice(0, 2)];
      return aliases.some((alias) => chunk.includes(alias));
    }) ||
    fallback
  );
}

function detectSize(chunk) {
  const explicit = chunk.match(/(\d{2})\s*[*xX×]\s*(\d{2})(?:\s*[*xX×]\s*(\d{1,2}))?/);
  if (explicit) return `${explicit[1]}*${explicit[2]}*${explicit[3] ?? "10"}`;

  const compact = chunk.match(/(?:^|[^\d])([2-5]\d)([2-5]\d)(?:[^\d]|$)/);
  if (compact) return `${compact[1]}*${compact[2]}*10`;

  const alias = sizeAliases.find((item) => item.words.some((word) => chunk.includes(word)));
  return alias?.size ?? "待确认";
}

function detectQuantities(chunk) {
  const matches = [];
  const colorQtyRegExp = new RegExp(`(${colorPattern})色?\\s*(\\d{2,5})(?:\\s*个)?`, "g");
  for (const match of chunk.matchAll(colorQtyRegExp)) {
    const before = chunk.slice(Math.max(0, match.index - 3), match.index);
    if (before.includes("印")) continue;
    matches.push({ color: normalizeColor(match[1]), qty: Number(match[2]) });
  }

  if (matches.length) return matches;

  const qty = chunk.match(/(\d{2,5})\s*个/);
  return [{ color: detectColor(chunk), qty: qty ? Number(qty[1]) : 0 }];
}

function detectColor(chunk) {
  const bagColor = detectBagColor(chunk);
  if (bagColor) return bagColor;

  const colorSource = chunk.replace(/空白袋|白鲸|红叶|黑马/g, "");
  const color = colorWords.find((item) => colorSource.includes(item));
  return color ? normalizeColor(color) : "待确认";
}

function normalizeColor(color) {
  return color.endsWith("色") ? color : `${color}色`;
}

function detectProduct(chunk) {
  if (chunk.includes("同行") || chunk.includes("来料")) return "同行来料印刷";
  if (chunk.includes("外卖")) return "外卖活动袋";
  if (chunk.includes("白鲸") || chunk.includes("活动袋")) return "白鲸活动袋";
  if (chunk.includes("美的")) return "美的空调";
  if (chunk.includes("小熊袋") || chunk.includes("小熊小狗") || chunk.includes("小狗")) return "小熊袋";
  if (chunk.includes("喜")) return "喜字袋";
  if (chunk.includes("福")) return "福字袋";
  return "空白袋";
}

function detectFulfillment(chunk) {
  if (chunk.includes("快运") || chunk.includes("快递")) return "快递快运";
  if (chunk.includes("送货") || chunk.includes("送到")) return "送货";
  if (chunk.includes("自提") || chunk.includes("来取") || chunk.includes("拿货")) return "自提";
  return "待确认";
}

function detectLatest(chunk) {
  if (chunk.includes("今天") && chunk.includes("下午")) return "今天下午";
  if (chunk.includes("今天")) return "今天";
  if (chunk.includes("明天")) return "明天";
  if (chunk.includes("后天")) return "后天";
  if (chunk.includes("周五")) return "周五";
  return "待确认";
}

function detectPrintColor(chunk) {
  const compactColorPrint = chunk.match(new RegExp(`(${colorPattern})色?印(${colorPattern})色?`));
  if (compactColorPrint) return normalizeColor(compactColorPrint[2]);

  const printColorField = chunk.match(new RegExp(`印色\\s*[:：]?\\s*(${colorPattern})色?`));
  if (printColorField) return normalizeColor(printColorField[1]);

  const colorAfterPrint = chunk.match(new RegExp(`印(?:刷)?\\s*(${colorPattern})色?`));
  if (colorAfterPrint) return normalizeColor(colorAfterPrint[1]);

  const colorBeforePrint = chunk.match(new RegExp(`(${colorPattern})色?\\s*印`));
  if (colorBeforePrint) return normalizeColor(colorBeforePrint[1]);

  return "待确认";
}

function detectBagColor(chunk) {
  const compactColorPrint = chunk.match(new RegExp(`(${colorPattern})色?印(${colorPattern})色?`));
  if (compactColorPrint) return normalizeColor(compactColorPrint[1]);

  const explicitBlankBag = chunk.match(new RegExp(`(${colorPattern})色?\\s*空白袋`));
  if (explicitBlankBag) return normalizeColor(explicitBlankBag[1]);

  const compactBagHandle = chunk.match(new RegExp(`(?<!空)(${colorPattern})色?袋\\s*(${colorPattern})色?提`));
  if (compactBagHandle) return normalizeColor(compactBagHandle[1]);

  const explicitBag = chunk.match(new RegExp(`(?<!空)(${colorPattern})色?\\s*(?:底袋|袋子|袋)`));
  if (explicitBag) return normalizeColor(explicitBag[1]);

  return "";
}

function detectHandleColor(chunk) {
  const compactBagHandle = chunk.match(new RegExp(`(?<!空)(${colorPattern})色?袋\\s*(${colorPattern})色?提`));
  if (compactBagHandle) return normalizeColor(compactBagHandle[2]);

  const colorBeforeHandle = chunk.match(new RegExp(`(${colorPattern})色?\\s*(?:提手|手提|提)(?!货|醒|示)`));
  if (colorBeforeHandle) return normalizeColor(colorBeforeHandle[1]);

  const colorAfterHandle = chunk.match(new RegExp(`(?:提手|手提)\\s*(${colorPattern})色?`));
  if (colorAfterHandle) return normalizeColor(colorAfterHandle[1]);

  return "";
}

function detectNote(chunk, { handle }) {
  const notes = [];
  if (handle === "加长提") notes.push("加长提");
  if (/提手颜色更换|提手更换|换.*提/.test(chunk)) notes.push("提手颜色更换");

  const explicitNote = chunk.match(/备注[:：]?\s*([^；;，,]+)/);
  if (explicitNote) notes.push(explicitNote[1].trim());

  return [...new Set(notes.filter(Boolean))].join("、");
}

function detectPrintSide(chunk) {
  if (chunk.includes("双面") || chunk.includes("两面")) return "双面";
  if (chunk.includes("单面") || chunk.includes("一面")) return "单面";
  return "待确认";
}

function estimateInventory(row, inventories) {
  if (!row.customerId || row.size === "待确认" || row.color === "待确认" || !row.qty) return "待确认";
  if (row.print === "是" && !row.product.includes("喜") && !row.product.includes("福")) return "需复核";

  const stock = inventories.find(
    (item) =>
      item.size === row.size &&
      item.color === row.color &&
      item.handle === row.handle &&
      item.style === row.style &&
      !item.state.includes("待处理"),
  );

  if (!stock) return "缺货";
  const available = stock.inStock - stock.reserved - stock.locked - stock.pending;
  if (available >= row.qty && !stock.estimated) return "可用";
  if (available >= row.qty && stock.estimated) return "需复核";
  return `缺货 ${row.qty - Math.max(0, available)}`;
}

function getConfidence(row, inventory) {
  if (!row.customerId || row.size === "待确认" || row.color === "待确认" || !row.qty) return "low";
  if (row.latest === "待确认" || inventory === "待确认" || inventory === "需复核" || inventory.startsWith("缺货")) return "medium";
  return "high";
}
