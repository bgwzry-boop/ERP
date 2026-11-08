// 负责人 2026-11-05：客户消息开头或结尾直接写客户名字，识别时自动填到客户；不对再手动改。
// 只看第一行开头（第一个数字之前）和最后一行（不带数字的一行），去掉打招呼、交付等常用词后剩下的就是名字。
// 系统里有这个客户就带出客户编号；没有就只给出名字，开单页提示是否新建。

import { looksLikePrintOrderLine, parsePrintOrderLine } from "./printOrderLineParser.js";

const FILLER_WORDS = [
  "你好", "您好", "老板", "老板娘", "在吗", "在么", "麻烦", "帮我", "帮忙", "谢谢", "辛苦", "辛苦了", "收到",
  "客户", "订单", "下单", "要货", "订货", "我要", "要", "定", "订",
  "明天", "今天", "后天", "今晚", "明早", "上午", "下午", "晚上", "尽快", "加急", "急",
  "自提", "自取", "来拿", "来取", "送货", "送到", "送过来", "发货", "快递", "快运", "物流",
  "印刷", "印字", "不印", "空白", "现货", "备注", "规格", "颜色", "数量",
];
const STRIP_CHARS = /[\s，。,.:：;；!！?？、~～（）()【】[\]“”"'‘’@#/\\-]+/gu;

const clean = (value) => String(value ?? "").trim();

function stripFillers(text) {
  let rest = clean(text).replace(STRIP_CHARS, " ");
  for (const word of [...FILLER_WORDS].sort((a, b) => b.length - a.length)) rest = rest.split(word).join(" ");
  return rest.replace(/\s+/gu, " ").trim();
}

function candidateName(text) {
  const name = stripFillers(text);
  if (!name || /\d/u.test(name) || /袋子|颜色|色$|号$|提手|个$/u.test(name)) return "";
  const compact = name.replace(/\s+/gu, "");
  return compact.length >= 2 && compact.length <= 20 ? compact : "";
}

/** Name candidates from the start of the first line and from a last line without numbers. */
export function messageCustomerNameCandidates(sourceText) {
  const lines = String(sourceText ?? "").split(/\r?\n/u).map(clean).filter(Boolean);
  if (!lines.length) return [];
  // 负责人 2026-11-08：车间单写法「【印刷内容】……  客户简称」：【】里不是客户，客户在最后，可能只有一个字。
  if (looksLikePrintOrderLine(lines[0])) {
    const names = lines.filter(looksLikePrintOrderLine).map((line) => parsePrintOrderLine(line).customerName).filter(Boolean);
    return [...new Set(names)].slice(0, 1);
  }
  const candidates = [];
  const firstLead = lines[0].split(/\d/u)[0];
  const first = candidateName(firstLead);
  if (first) candidates.push(first);
  if (lines.length > 1 && !/\d/u.test(lines.at(-1))) {
    const last = candidateName(lines.at(-1));
    if (last) candidates.push(last);
  } else if (lines.length === 1) {
    // One line: a name after the last quantity, e.g. "30*38红5000个 明天自提 王五包装".
    const tail = lines[0].replace(/^.*\d\s*(?:个|只|件|包|卷|条)?/u, "");
    const last = candidateName(tail);
    if (last && last !== first) candidates.push(last);
  }
  return [...new Set(candidates)];
}

function matchesCustomer(candidate, customer) {
  const names = [customer?.name, customer?.shortName].map(clean).filter(Boolean);
  return names.some((name) => name === candidate || (candidate.length >= 2 && name.includes(candidate)) || (name.length >= 2 && candidate.includes(name)));
}

export function isActiveMessageCustomer(customer) {
  return Boolean(clean(customer?.id ?? customer?.customerId)) && customer?.enabled !== false && clean(customer?.status) !== "停用";
}

/**
 * The customer named at the start or end of an order message.
 * Returns { name, customerId } when exactly one active customer matches, { name } when the
 * name is not in the system (the office may create it), or null when no name is written.
 */
export function detectMessageCustomer(sourceText, customers = []) {
  const active = customers.filter(isActiveMessageCustomer);
  for (const candidate of messageCustomerNameCandidates(sourceText)) {
    // 2026-11-08：不做主观判断。只要还有别的客户也沾边（例如「黄松」与「黄松林」），
    // 就全部列出来让人选；只有唯一一个相关客户时才自动带出。
    const related = active.filter((customer) => matchesCustomer(candidate, customer));
    const exactNames = related.filter((customer) => [customer.name, customer.shortName].map(clean).includes(candidate));
    if (related.length === 1 && exactNames.length === 1) {
      const customer = related[0];
      return { name: clean(customer.name), customerId: clean(customer.id ?? customer.customerId), matchedText: candidate };
    }
    if (related.length > 1) return { name: candidate, customerId: "", ambiguous: related.map((customer) => clean(customer.name)).slice(0, 5) };
  }
  const [unknown] = messageCustomerNameCandidates(sourceText);
  return unknown ? { name: unknown, customerId: "" } : null;
}
