// 负责人 2026-11-08：定制印刷单的识别，按工厂实际下发给印刷、制袋车间的单子写法来认。
// 一行一单，典型写法：
//   【金菊】30*38*10 双面印刷 3000个 橘黄白字（双面一样） 等通知印刷  松
//   【全优科创思维馆】35*27  紫袋黄字  双面不同版满版印2000个 腾腾  自己写30号发
//   【斐然】尺寸是35*27*10的   5000个双面  陈梦赛印
// - 开头【】里是印在袋子上的内容（店名、品牌），不是客户。
// - 客户写在最后，常是简称（松、元宝、腾腾、晓佳……），以后也可能简写。
// - 「某某印」表示某某送卷来加工，只印不制袋（来料加工）；平口、有底无侧也只印不制袋。
// - 「30号发」「自己写31号发」「11月1号发货」是客户要求的发货日期，按录单当天推算月份。
// - 尺寸叫法按工厂报价单：竖款小/中/大号、横款小/中/大/特大号。

const COLOR_WORDS = [
  "安哥拉红", "安格拉红", "芋泥紫", "香芋紫", "抹茶绿", "橄榄绿", "雾霾蓝", "荧光绿", "宝石蓝", "宝石兰", "海盐蓝", "牛仔蓝",
  "小鸡黄", "柠檬黄", "冰梅粉", "珊瑚粉", "蓝绿",
  "米白", "本白", "大红", "枣红", "酒红", "玫红", "桔红", "橘红", "橘黄", "桔黄", "米黄", "金黄", "土黄", "酱黄",
  "宝蓝", "宝兰", "天蓝", "天兰", "海蓝", "海兰", "湖蓝", "深蓝", "浅蓝", "藏蓝", "亮绿", "果绿", "草绿", "墨绿", "豆绿", "深绿", "军绿", "青绿",
  "深紫", "浅紫", "深灰", "浅灰", "焦糖", "咖啡", "卡其", "冰梅",
  "红", "橘", "桔", "橙", "黄", "绿", "蓝", "篮", "兰", "紫", "粉", "黑", "白", "灰", "咖", "米", "金", "银", "青",
];
const COLOR_RE = COLOR_WORDS.join("|");
const COLOR_ALIASES = new Map([
  ["大红", "红色"], ["红", "红色"], ["黑", "黑色"], ["白", "白色"], ["本白", "白色"], ["黄", "黄色"], ["绿", "绿色"],
  ["蓝", "蓝色"], ["篮", "蓝色"], ["兰", "蓝色"], ["紫", "紫色"], ["粉", "粉色"], ["灰", "灰色"], ["橘", "橘色"], ["桔", "橘色"], ["橙", "橘色"],
  ["咖", "咖色"], ["咖啡", "咖色"], ["米", "米白"], ["金", "金色"], ["银", "银色"], ["青", "青色"],
  ["宝兰", "宝蓝"], ["天兰", "天蓝"], ["海兰", "海蓝"], ["宝石兰", "宝石蓝"], ["安格拉红", "安哥拉红"], ["桔红", "橘红"], ["桔黄", "橘黄"],
]);

// 工厂报价单的尺寸叫法。横款中号有 40*30 和 40*32 两种，单子上一般直接写 4030 / 4032；只写「横款中号」时按 40*30。
const SIZE_NAMES = [
  { re: /[竖直](?:版|款)?\s*小号/u, size: "25*32*10" },
  { re: /[竖直](?:版|款)?\s*中号/u, size: "30*37*10" },
  { re: /[竖直](?:版|款)?\s*大号/u, size: "35*41*12" },
  { re: /横(?:版|款)?\s*小号/u, size: "35*27*10" },
  { re: /横(?:版|款)?\s*中号/u, size: "40*30*10", review: "横款中号有 40*30 和 40*32，请核对" },
  { re: /横(?:版|款)?\s*特大号/u, size: "50*40*12" },
  { re: /横(?:版|款)?\s*大号/u, size: "45*37*10" },
];
// 「竖版30」「横版35」：只写了宽，按报价单里对应的那一款。
const SIZE_BY_WIDTH = {
  竖: { 25: "25*32*10", 30: "30*37*10", 35: "35*41*12" },
  横: { 35: "35*27*10", 40: "40*30*10", 45: "45*37*10", 50: "50*40*12" },
};
const DEFAULT_SIDE = { "50*40": 12, "35*41": 12 };
// 负责人 2026-11-08：单子上写 3038 的，开票一律按 3037。
const SIZE_SAME_AS = { "30*38": "30*37" };
const sizeText = (width, height, side) => {
  const key = SIZE_SAME_AS[`${width}*${height}`] ?? `${width}*${height}`;
  return `${key}*${side ?? DEFAULT_SIDE[key] ?? 10}`;
};

const CN_DIGITS = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const NAME_STOP = /[印字面版袋提色号发货急刷件个千万双单款寸送拍照覆膜范围文件通知尺寸清晰足数机器内容同样相同不同一样加安排做的是有无按照之前上次新旧包装层]/u;
const LEADING_SIZE = String.raw`(\d{2})\s*[*xX×.\-+/]\s*(\d{2})(?:\s*[*xX×.]\s*(\d{1,2}))?`;

const clean = (value) => String(value ?? "").trim();

export function normalizePrintOrderColor(word) {
  const text = clean(word).replace(/色$/u, "");
  if (!text) return "";
  const alias = COLOR_ALIASES.get(text);
  if (alias) return alias;
  return /色$/u.test(text) || text.length >= 2 ? text : `${text}色`;
}

/** A line that looks like a custom print order (the workshop list format). */
export function looksLikePrintOrderLine(text) {
  const line = clean(text);
  if (!line) return false;
  // 只认开头带【印刷内容】的车间单写法；普通客户消息仍走原来的识别。
  return (/^【[^】【\n]{1,40}】/u.test(line) || /^【[^\s\d【】]{1,30}/u.test(line)) && /\d/u.test(line) && /双|单面|印|字|满版|袋|\d{2}\s*[*xX×.\-+/]\s*\d{2}|[竖横](?:版|款)/u.test(line);
}

/**
 * Parses one workshop-format print order line.
 * Returns { printContent, customerName, peerProcessor, rows: [{ size, bagColor, printColor, handleColor, qty, ... }], ... }.
 */
export function parsePrintOrderLine(text, { now = new Date() } = {}) {
  let line = clean(text).replace(/　/gu, " ");
  // 开头【】是印刷内容；漏写了右括号时取到第一个空格或数字前（「【兔斯康24号发 ……」）。
  const opening = line.match(/^【([^】【\n]{1,40})】/u) ?? line.match(/^【([^\s\d【】]{1,30})/u);
  const first = opening ? clean(opening[1]).replace(/[：:]+$/u, "") : "";
  if (opening) line = line.slice(opening[0].length);
  const brackets = [...line.matchAll(/【([^】]*)】/gu)];
  const notes = [];

  const latest = detectRequiredDate(line, now);
  const body = removeDatePhrases(line);
  const { customerName, peerProcessor, rest } = detectTrailingCustomer(body);
  const working = rest;

  const flatOnly = /平口|有底无侧|无侧/u.test(working);
  const external = Boolean(peerProcessor) || flatOnly;
  if (/平口/u.test(working)) notes.push("平口");
  if (/有底无侧/u.test(working)) notes.push("有底无侧");

  // 负责人 2026-11-08：印刷面三种——单面印刷、双面相同、双面不同（不写进备注）。
  // 只写了双面、没说两面一不一样的，标「双面待确认」，开单页提醒办公室补全。
  const different = /(?:双面?|正反面?)\s*不同|不同版|不同内容|正反版|双不同/u.test(working);
  const same = /(?:双面?|正反面?)\s*(?:一样|相同)|同样内容|内容相同|相同内容/u.test(working);
  const side = /单面/u.test(working) ? "单面" : different ? "双面不同" : same ? "双面" : "双面待确认";
  if (/满版|满印/u.test(working)) notes.push("满版");
  if (/超范围/u.test(working)) notes.push("超范围印刷");
  if (/不覆膜/u.test(working)) notes.push("不覆膜");
  if (/加急/u.test(working)) notes.push("加急");
  if (/旧版/u.test(working)) notes.push("旧版");
  if (/新版/u.test(working)) notes.push("新版");
  if (/拍照/u.test(working)) notes.push("印刷时拍照");
  if (/等通知/u.test(working)) notes.push("等通知再印");
  if (/有文件|按文件|之前有文件/u.test(working)) notes.push("按文件印");
  for (const bracket of brackets) {
    const extra = clean(bracket[1]);
    if (extra && !notes.includes(extra) && extra !== customerName && !/双|满版|发货|印刷|相同|不同|一样|^\d+号/u.test(extra) && extra.length <= 20) notes.push(extra);
  }

  const handleLong = /加长|长提|\d{2}\s*(?:cm|CM|厘米)\s*(?:的)?\s*提|提手\s*\d{2}\s*(?:cm|CM|厘米)/u.test(working);
  if (handleLong) {
    const length = working.match(/(\d{2})\s*(?:cm|CM|厘米)\s*(?:的)?\s*提|提手\s*(\d{2})\s*(?:cm|CM|厘米)|加长提?手?\s*(\d{2})\s*(?:cm|CM|厘米)/u);
    const value = length ? (length[1] ?? length[2] ?? length[3]) : "";
    notes.push(value ? `加长提${value}cm` : "加长提");
  }
  const printColorCount = /双色|两色/u.test(working) ? 2 : /三色/u.test(working) ? 3 : /四色/u.test(working) ? 4 : 0;

  const segments = splitBySize(working);
  const sharedQty = matchEachQty(working);
  const sharedColors = detectColors(working);
  const rows = [];
  for (const segment of segments) {
    const colors = detectColors(segment.text);
    const bagColors = colors.bags.length ? colors.bags : sharedColors.bags;
    const printColor = colors.print || sharedColors.print || (printColorCount ? (printColorCount === 2 ? "双色" : `${printColorCount}色`) : "");
    const handleColor = colors.handle || sharedColors.handle || (colors.handleSameAsBag || sharedColors.handleSameAsBag ? bagColors[0] ?? "" : "");
    const qty = detectQty(segment.text) || sharedQty || (segments.length === 1 ? detectQty(working) : 0);
    const eachColor = bagColors.length > 1 && /各/u.test(working);
    const colorList = eachColor ? bagColors : [bagColors[0] ?? ""];
    for (const bagColor of colorList) {
      rows.push({
        size: segment.size,
        sizeReview: segment.review ?? "",
        bagColor,
        printColor: colors.sameAsHandle ? handleColor : printColor,
        handleColor,
        qty: eachColor ? (sharedQty || qty) : qty,
      });
    }
  }
  return {
    printContent: first,
    customerName,
    peerProcessor,
    external,
    side,
    latest,
    handle: handleLong ? "加长提" : "普通提",
    printColorCount,
    notes: [...new Set(notes)],
    rows,
  };
}

function detectRequiredDate(line, now) {
  const match = line.match(/(?:(\d{1,2})\s*月\s*)?(\d{1,2})\s*号?\s*(?:\d{1,2}\s*号\s*)?(?:必须|左右)?\s*发(?!票)/u)
    ?? line.match(/最晚\s*(?:(\d{1,2})\s*月\s*)?(\d{1,2})\s*号/u)
    ?? line.match(/自己(?:写|做)\s*(?:(\d{1,2})\s*月\s*)?(\d{1,2})\s*号?/u);
  if (!match) return "";
  const day = Number(match[2]);
  if (!(day >= 1 && day <= 31)) return "";
  const base = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  const local = new Date(base.getTime() + 8 * 3600 * 1000);
  let year = local.getUTCFullYear();
  let month = match[1] ? Number(match[1]) : local.getUTCMonth() + 1;
  if (!match[1] && day < local.getUTCDate() - 10) month += 1;
  if (match[1] && month < local.getUTCMonth() + 1 - 6) year += 1;
  if (month > 12) { month -= 12; year += 1; }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return "";
  return date.toISOString().slice(0, 10);
}

function removeDatePhrases(line) {
  return line
    .replace(/(?:最晚|自己写|自己做|必须)?\s*(?:\d{1,2}\s*月\s*)?\d{1,2}\s*号?\s*(?:\d{1,2}\s*号\s*)?(?:必须)?\s*发(?:货)?(?:货)?/gu, " ")
    .replace(/最晚\s*(?:\d{1,2}\s*月\s*)?\d{1,2}\s*号/gu, " ")
    .replace(/自己(?:写|做)\s*(?:\d{1,2}\s*月\s*)?\d{1,2}\s*号?/gu, " ")
    .replace(/\d+\s*天左右发货?/gu, " ")
    .replace(/(?:自己写|自己做)/gu, " ");
}

function detectTrailingCustomer(text) {
  const tokens = text.replace(/[【】（）()]/gu, " ").split(/[\s，,、;；。:：]+/u).filter(Boolean);
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    const peer = token.match(/^([一-龥]{2,4})印$/u);
    if (peer && !NAME_STOP.test(peer[1]) && !isColorWord(peer[1])) {
      return { customerName: peer[1], peerProcessor: peer[1], rest: tokens.filter((_, i) => i !== index).join(" ") };
    }
    if (/^[一-龥]{1,4}$/u.test(token) && !NAME_STOP.test(token) && !isColorWord(token)) {
      return { customerName: token, peerProcessor: "", rest: tokens.filter((_, i) => i !== index).join(" ") };
    }
    if (/^[A-Za-z][A-Za-z\s]{1,15}$/u.test(token) && index === tokens.length - 1 && tokens.length > 3) continue;
  }
  return { customerName: "", peerProcessor: "", rest: tokens.join(" ") };
}

function isColorWord(token) {
  const text = token.replace(/色$/u, "");
  return new RegExp(`^(?:${COLOR_RE})+$`, "u").test(text);
}

function splitBySize(text) {
  const found = [];
  const explicit = new RegExp(LEADING_SIZE, "gu");
  for (const match of text.matchAll(explicit)) {
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 3);
    if (/^\s*(?:号|月|cm|厘米|mm)/u.test(after)) continue;
    const width = match[1];
    const height = match[2];
    const sideText = match[3] ?? text.slice(match.index + match[0].length).match(/^\s*侧\s*(\d{1,2})/u)?.[1];
    found.push({ index: match.index, end: match.index + match[0].length, size: sizeText(width, height, sideText) });
  }
  for (const match of text.matchAll(/(?<![\d.*xX×/+-])([2-5]\d)([2-5]\d)(?![\d.*xX×/+-]|\s*[个件只号])/gu)) {
    if (found.some((item) => match.index >= item.index && match.index < item.end)) continue;
    found.push({ index: match.index, end: match.index + match[0].length, size: sizeText(match[1], match[2]) });
  }
  const custom = text.match(/(\d{2})\s*宽\s*(\d{2})\s*高\s*(\d{1,2})\s*底/u);
  if (custom) found.push({ index: custom.index, end: custom.index + custom[0].length, size: `${custom[1]}*${custom[2]}*${custom[3]}` });
  if (!found.length) {
    const named = SIZE_NAMES.find((item) => item.re.test(text));
    if (named) found.push({ index: text.search(named.re), end: text.search(named.re) + 3, size: named.size, review: named.review });
    else {
      const byWidth = text.match(/([竖直横])(?:版|款)\s*(\d{2})(?!\s*[*xX×/.\-+\d])/u);
      if (byWidth) {
        const size = SIZE_BY_WIDTH[byWidth[1] === "直" ? "竖" : byWidth[1]]?.[byWidth[2]];
        if (size) found.push({ index: byWidth.index, end: byWidth.index + byWidth[0].length, size });
      }
    }
  }
  if (!found.length) return [{ size: "待确认", text }];
  found.sort((a, b) => a.index - b.index);
  // 切片尺寸（印完切成的片）不是袋子尺寸。
  const bags = found.filter((item) => !/切片/u.test(text.slice(Math.max(0, item.index - 4), item.index)));
  const list = bags.length ? bags : found;
  if (list.length === 1) return [{ size: list[0].size, review: list[0].review, text }];
  return list.map((item, index) => ({
    size: item.size,
    review: item.review,
    text: text.slice(index === 0 ? 0 : item.index, index + 1 < list.length ? list[index + 1].index : text.length),
  }));
}

function chineseNumber(text) {
  if (/^\d+(?:\.\d+)?$/u.test(text)) return Number(text);
  if (text === "十") return 10;
  return [...text].reduce((sum, char) => sum * 10 + (CN_DIGITS[char] ?? 0), 0);
}

function detectQty(text) {
  const scaled = text.match(/(\d+(?:\.\d+)?|[一二两三四五六七八九十])\s*([万千wWkK])\s*(?:个|件|只)?/u);
  if (scaled) {
    const value = chineseNumber(scaled[1]);
    return Math.round(value * (/[万wW]/u.test(scaled[2]) ? 10000 : 1000));
  }
  const withUnit = [...text.matchAll(/(?<![\d*xX×./-])(\d{1,6})\s*(?:个|件|只)/gu)];
  if (withUnit.length) return Math.max(...withUnit.map((match) => Number(match[1])));
  const bare = [...text.matchAll(/(?<![\d*xX×./+-])(\d{3,6})(?![\d*xX×./+-]|\s*(?:号|月|cm|CM|厘米|mm|宽|高|长|底))/gu)]
    .find((match) => !/^[2-5]\d[2-5]\d$/u.test(match[1]));
  return bare ? Number(bare[1]) : 0;
}

function matchEachQty(text) {
  const match = text.match(/各\s*(\d+(?:\.\d+)?|[一二两三四五六七八九十])\s*([万千])?\s*(?:个|件|只)?/u);
  if (!match) return 0;
  const value = chineseNumber(match[1]);
  return match[2] ? Math.round(value * (match[2] === "万" ? 10000 : 1000)) : value;
}

// 分出袋身色、字色、提手色。写法：橘黄白字、海蓝 白字、紫袋黄字、宝蓝印白、红色袋子提手-黑色字、焦糖白字咖提、米袋绿手提同色字。
function detectColors(text) {
  const source = text.replace(/双色|两色|三色|四色|同色字|单面|双面|厘米|毫米/gu, (word) => " ".repeat(word.length));
  const colorRe = new RegExp(`(${COLOR_RE})(色)?`, "gu");
  const mentions = [];
  for (const match of source.matchAll(colorRe)) {
    const before = source.slice(Math.max(0, match.index - 2), match.index);
    const after = source.slice(match.index + match[0].length, match.index + match[0].length + 3);
    mentions.push({ word: match[1], index: match.index, before, after });
  }
  let bag = [];
  let print = "";
  let handle = "";
  let handleSameAsBag = /袋子?和提手|袋子?提手同色|本提|同色提/u.test(text);
  const unlabeled = [];
  for (const mention of mentions) {
    const { word, before, after } = mention;
    if (/^(?:字|体)/u.test(after) || /^\s*字/u.test(after)) { print ||= normalizePrintOrderColor(word); continue; }
    if (/^(?:手提|提手|提)/u.test(after) || /^\s*(?:手提|提手)/u.test(after)) { handle ||= normalizePrintOrderColor(word); continue; }
    if (/印(?:刷)?\s*$/u.test(before) || /^印刷/u.test(after) && false) { print ||= normalizePrintOrderColor(word); continue; }
    if (/^\s*印刷/u.test(after)) { print ||= normalizePrintOrderColor(word); continue; }
    if (/^(?:袋|底|印)/u.test(after) || /^\s*(?:袋|底)/u.test(after)) { bag.push(normalizePrintOrderColor(word)); continue; }
    unlabeled.push(normalizePrintOrderColor(word));
  }
  if (!bag.length && unlabeled.length) {
    bag = /各/u.test(text) ? unlabeled.slice(0, print ? unlabeled.length : Math.max(1, unlabeled.length - 1)) : [unlabeled[0]];
    if (!print && unlabeled.length > bag.length && !/各/u.test(text)) print = unlabeled[bag.length];
    if (!print && /各/u.test(text) && unlabeled.length > bag.length) print = unlabeled.at(-1);
  } else if (/各/u.test(text) && unlabeled.length) {
    // 「橘袋白字 // 天蓝白字 各10000个」：没标「袋」的也是另一种袋色。
    bag.push(...unlabeled);
  } else if (!print && unlabeled.length) {
    print = unlabeled[0];
  }
  // 「25*32 黑 2000个双面白」：数量后面的颜色是字色。
  if (!print) {
    const after = text.match(new RegExp(`[双单]面\\s*(${COLOR_RE})(?!色?\\s*(?:袋|底))`, "u"));
    if (after) print = normalizePrintOrderColor(after[1]);
  }
  const sameAsHandle = /同色字/u.test(text);
  return { bags: [...new Set(bag.filter(Boolean))], print, handle, handleSameAsBag, sameAsHandle };
}
