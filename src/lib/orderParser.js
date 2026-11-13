import { enrichDraftRow } from "./orderDraftProjection.js";
export { enrichDraftRow, estimateAmount } from "./orderDraftProjection.js";
import { detectMessageCustomer, isActiveMessageCustomer } from "../../shared/orderMessageCustomer.js";
import { looksLikePrintOrderLine, parsePrintOrderLine } from "../../shared/printOrderLineParser.js";

const colorWords = ["米白", "浅蓝", "牛仔蓝", "大红", "红", "黑", "白", "蓝", "绿", "黄", "粉"];
const colorPattern = colorWords.join("|");
const compactInkPattern = new RegExp(`(${colorPattern})色?印(${colorPattern})色?`);
const compactHandlePattern = new RegExp(`(?<!空)(${colorPattern})色?袋\\s*(${colorPattern})色?提`);
const calendarDateShape = String.raw`\d{4}-\d{2}-\d{2}`;
const calendarDateToken = new RegExp(String.raw`(?<![\w-])${calendarDateShape}(?![\w-])`, "gu");
const quantityDateShape = String.raw`(?:\d{4}[-/.年])?\d{1,2}[-/.月]\d{1,2}日?`;
const orderNumberPrefix = /(?:单号|编号|订单|\border(?:\s+(?:id|no\.?))?|\bpo)\s*(?:为|是)?\s*[:：=#]?\s*$/iu;
const negatedPrintSide = /(?:不(?:需要?|用|要|做)?|无需)\s*(?:[双两单一]面\s*(?:印刷?)?|印刷?\s*[双两单一]面)/gu;
const noPrinting = /(?:不(?:需要?|用|要|做)?|无需|非|免|无)\s*印(?:刷|字|花|图案?|标志|logo)?/giu;
// Calendar-shaped text must not supply a quantity, even when its date is invalid.
export const orderQuantityDigitsPattern = String.raw`(?<!\d)(?!${quantityDateShape}(?!\d))\d{1,6}(?!\d)`;
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

export function parseOrderText(text, { customers = [], inventories = [], now = new Date() } = {}) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  // 负责人 2026-11-08：车间单写法（【印刷内容】尺寸 数量 袋色字色 … 客户简称）按行单独识别。
  const rawLines = String(text ?? "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (rawLines.length && rawLines.every(looksLikePrintOrderLine)) {
    return rawLines.flatMap((line, index) => printOrderRows(line, index, { customers, inventories, now }));
  }
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
    const colorText = withoutCustomerColors(chunk, customer, customers);
    const quantities = detectQuantities(colorText);
    const product = detectProduct(chunk);
    const fulfillment = detectFulfillment(chunk);
    const printSideText = chunk.replace(negatedPrintSide, " ");
    const printText = printSideText.replace(noPrinting, " ");
    // An explicit blank-bag instruction overrides loose hints, while a separate
    // affirmative print instruction still applies to the line.
    const prints = printText === printSideText ? /印|美的|图|logo/u.test(printSideText) : printText.includes("印");
    const print = prints ? "是" : "否";
    // 负责人 2026-11-12：加长提手按长度加价，写了长度（「加长提60cm」「提手65厘米」）就带上。
    const handleLength = chunk.match(/(?:加长提?手?|长提手?|提手)\s*(\d{2})\s*(?:cm|CM|厘米)|(\d{2})\s*(?:cm|CM|厘米)\s*(?:的)?\s*(?:加长)?提/u);
    const handle = chunk.includes("长提") || chunk.includes("加长") || handleLength
      ? `加长提${handleLength ? `${handleLength[1] ?? handleLength[2]}cm` : ""}`
      : "普通提";
    const latest = detectLatest(chunk);
    const printColor = prints ? detectPrintColor(printText) : "非印刷";
    const printSide = prints ? detectPrintSide(printText) : "非印刷";
    const artworkStatus = print === "是" ? "待上传" : "非印刷";
    const handleColor = detectHandleColor(chunk);
    const note = detectNote(chunk, { handle });

    quantities.forEach((item, qtyIndex) => {
      const color = item.color || detectColor(colorText);
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

export function detectCustomer(chunk, customers, fallback) {
  customers = customers.filter(isActiveMessageCustomer);
  const hint = detectMessageCustomer(chunk, customers);
  if (hint?.ambiguous) return undefined;
  if (hint?.customerId) return customers.find(customer => customer.id === hint.customerId);
  const fullNames = customers.filter(customer => chunk.includes(customer.name));
  if (fullNames.length) return fullNames.length === 1 ? fullNames[0] : undefined;
  const aliases = customers.filter(customer => (customerAliases[customer.id] ?? [customer.name.slice(0, 2)])
    .some(alias => chunk.includes(alias)));
  if (aliases.length > 1) return undefined;
  return aliases[0] ?? fallback;
}

export function withoutCustomerColors(text, customer, customers = []) {
  const hint = customer ? null : detectMessageCustomer(text, customers);
  const knownName = hint && customers.some(item => [item.name, item.shortName].includes(hint.name)) ? hint.name : "";
  for (const name of [customer?.name, customer?.shortName, knownName, ...(customerAliases[customer?.id] ?? [customer?.name?.slice(0, 2)])]) {
    if (name?.length > 1) text = text.split(name).join(" ".repeat(name.length));
  }
  return text;
}

export function findCompactOrderSize(text) {
  return [...text.matchAll(/(?<![\w./-])([2-5]\d)([2-5]\d)(?![\w./-])/gu)]
    .find(match => !isOrderReferencePrefix(text.slice(0, match.index)));
}

export function isOrderReferencePrefix(text) {
  return orderNumberPrefix.test(text.replace(/[A-Za-z_-]+$/u, "")) || /(?:电话|手机号?)\s*[:：]?\s*$/u.test(text);
}

function detectSize(chunk) {
  const explicit = chunk.match(/(\d{2})\s*[*xX×]\s*(\d{2})(?:\s*[*xX×]\s*(\d{1,2}))?/);
  if (explicit) return `${explicit[1]}*${explicit[2]}*${explicit[3] ?? "10"}`;

  const compact = findCompactOrderSize(chunk);
  if (compact) return `${compact[1]}*${compact[2]}*10`;

  const alias = sizeAliases.find((item) => item.words.some((word) => chunk.includes(word)));
  return alias?.size ?? "待确认";
}

function detectQuantities(chunk) {
  const matches = [];
  const colorQtyRegExp = new RegExp(`(${colorPattern})色?\\s*(${orderQuantityDigitsPattern})(?:\\s*个)?`, "g");
  for (const match of chunk.matchAll(colorQtyRegExp)) {
    const before = chunk.slice(Math.max(0, match.index - 3), match.index);
    const after = chunk.slice(Number(match.index) + match[0].length);
    if (before.includes("印") || /^\s*[*xX×]/.test(after) || isOrderReferencePrefix(chunk.slice(0, match.index))) continue;
    matches.push({ color: normalizeColor(match[1]), qty: Number(match[2]) });
  }

  if (matches.length) return matches;

  const quantitySource = chunk.replace(new RegExp(quantityDateShape, "gu"), " ");
  const qty = [...quantitySource.matchAll(/(?<!\d)(\d{1,6})\s*个/gu)]
    .find(match => !isOrderReferencePrefix(quantitySource.slice(0, match.index)));
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

// 负责人 2026-11-08：交付方式默认送货单；客户写了「自提 / 来拿 / 来取」才是自提，写了「快递 / 快运」才是快递快运。
// 「12号发」「自己写31号发」是要求发货日期，不是交付方式。
function detectFulfillment(chunk) {
  if (/快运|快递/u.test(chunk)) return "快递快运";
  if (/自提|来取|来拿|拿货/u.test(chunk)) return "自提";
  return "送货";
}

function detectLatest(chunk) {
  let date;
  for (const match of chunk.matchAll(calendarDateToken)) {
    if (orderNumberPrefix.test(chunk.slice(0, match.index))) continue;
    if (date && date !== match[0]) return "待确认";
    date = match[0];
  }
  if (date) return new Date(date).toJSON()?.startsWith(date) ? date : "待确认";
  if (chunk.includes("今天") && chunk.includes("下午")) return "今天下午";
  return ["今天", "明天", "后天", "周五"].find((value) => chunk.includes(value)) ?? "待确认";
}

function matchColor(chunk, pattern, group = 1) {
  const match = chunk.match(pattern);
  return match ? normalizeColor(match[group]) : "";
}

function detectPrintColor(chunk) {
  return matchColor(chunk, compactInkPattern, 2)
    || matchColor(chunk, new RegExp(`印色\\s*[:：]?\\s*(${colorPattern})色?`))
    || matchColor(chunk, new RegExp(`印(?:刷)?\\s*(${colorPattern})色?`))
    || matchColor(chunk, new RegExp(`(${colorPattern})色?\\s*印`))
    || "待确认";
}

function detectBagColor(chunk) {
  return matchColor(chunk, compactInkPattern)
    || matchColor(chunk, new RegExp(`(${colorPattern})色?\\s*空白袋`))
    || matchColor(chunk, compactHandlePattern)
    || matchColor(chunk, new RegExp(`(?<!空)(${colorPattern})色?\\s*(?:底袋|袋子|袋)`));
}

function detectHandleColor(chunk) {
  return matchColor(chunk, compactHandlePattern, 2)
    || matchColor(chunk, new RegExp(`(${colorPattern})色?\\s*(?:提手|手提|提)(?!货|醒|示)`))
    || matchColor(chunk, new RegExp(`(?:提手|手提)\\s*(${colorPattern})色?`));
}

function detectNote(chunk, { handle }) {
  const notes = [];
  if (String(handle).startsWith("加长提")) notes.push(handle);
  if (/提手颜色更换|提手更换|换.*提/.test(chunk)) notes.push("提手颜色更换");

  const explicitNote = chunk.match(/备注[:：]?\s*([^；;，,]+)/);
  if (explicitNote) notes.push(explicitNote[1].trim());

  return [...new Set(notes.filter(Boolean))].join("、");
}

function detectPrintSide(chunk) {
  // 负责人 2026-11-08：双面要分相同还是不同；没写清的标待确认，开单页提醒补全。
  if (/(?:[双两]面?|正反面?)\s*不同|不同版|不同内容|正反版/u.test(chunk)) return "双面不同";
  if (/(?:[双两]面?|正反面?)\s*(?:一样|相同)|同样内容|内容相同/u.test(chunk)) return "双面";
  if (/[双两]面/.test(chunk)) return "双面待确认";
  if (/[单一]面/.test(chunk)) return "单面";
  return "待确认";
}

function findPrintOrderCustomer(name, customers) {
  const active = customers.filter(isActiveMessageCustomer);
  if (!name) return undefined;
  const exact = active.filter((customer) => [customer.name, customer.shortName].map((value) => String(value ?? "").trim()).includes(name));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1 || name.length < 2) return undefined;
  const partial = active.filter((customer) => String(customer.name ?? "").includes(name));
  return partial.length === 1 ? partial[0] : undefined;
}

function printOrderRows(line, index, { customers, inventories, now }) {
  const parsed = parsePrintOrderLine(line, { now });
  const customer = findPrintOrderCustomer(parsed.customerName, customers);
  const fulfillment = detectFulfillment(line);
  return parsed.rows.map((item, rowIndex) => {
    const notes = [...parsed.notes];
    if (item.sizeReview) notes.push(item.sizeReview);
    if (parsed.peerProcessor) notes.push(`${parsed.peerProcessor}送卷来加工，只印不制袋`);
    const row = {
      id: `DRAFT-${index + 1}-${rowIndex + 1}`,
      customer: customer?.name ?? "待确认客户",
      customerId: customer?.id ?? "",
      product: parsed.external ? "同行来料印刷" : "空白袋",
      ...(parsed.external ? { orderType: "external_print" } : {}),
      size: item.size,
      color: item.bagColor || "待确认",
      handle: parsed.handle,
      style: "空白袋",
      print: "是",
      qty: item.qty,
      fulfillment,
      latest: parsed.latest || "待确认",
      printColor: item.printColor || "待确认",
      printSide: parsed.side,
      ...(parsed.printColorCount ? { printColorCount: parsed.printColorCount } : {}),
      artworkStatus: "待上传",
      handleColor: item.handleColor,
      printContent: parsed.printContent,
      note: [...new Set(notes)].join("、"),
      source: line,
    };
    return enrichDraftRow(row, inventories);
  });
}
