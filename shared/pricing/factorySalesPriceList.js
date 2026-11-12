// 负责人 2026-11-08 / 2026-11-12：全厂统一销售价，以 ERP 为准，开单自动套价，以后同步到小程序。
// 这里放「2026-10-28 无纺布手提袋产品报价单」原样录入的数据，和价格表里每一行/每条规则的校验、
// 加长提手、礼品袋满量优惠、加扣子的计算。服务器和网页共用，保证页面上看到的和开单算的是同一套。
//
// 价格表一行 = 一个分类下的一个尺寸：
//   category  分类（常规尺寸 / 覆膜款 / 礼品袋 / 小熊小狗）
//   styleKey  报价时用来匹配订单的款式键（空白袋 / 覆膜袋 / 覆膜金银 / 喜 / 福 / 小熊小狗）
//   sizeKey   尺寸，宽*高*侧（cm），和开单识别出来的尺寸一致
//   label     价目表上的叫法（如「裸布-竖中号」）
//   bagPrice  袋子单价（元/个）
// 丝网印刷的手工价和机印分档在 shared/largeMachinePrintPricing.js（负责人 2026-11-03 定），这里只展示。

export const SALES_PRICE_LIST_SOURCE = "2026-10-28 无纺布手提袋产品报价单";
export const SALES_PRICE_EFFECTIVE_DATE = "2026-10-28";

export const SALES_PRICE_CATEGORIES = Object.freeze([
  Object.freeze({ key: "regular", label: "常规尺寸", note: "裸布、酒袋、特殊尺寸" }),
  Object.freeze({ key: "laminated", label: "覆膜款", note: "金银另列一个价" }),
  Object.freeze({ key: "gift", label: "礼品袋（丝印金色）", note: "喜字、福字" }),
  Object.freeze({ key: "bear_dog", label: "小熊小狗（加扣）", note: "价格已含扣子" }),
]);

export const SALES_PRICE_STYLES = Object.freeze({
  空白袋: "regular",
  覆膜袋: "laminated",
  覆膜金银: "laminated",
  喜: "gift",
  福: "gift",
  小熊小狗: "bear_dog",
});

const row = (category, styleKey, label, sizeKey, bagPrice) => Object.freeze({ category, styleKey, label, sizeKey, bagPrice });

/** 2026-10-28 价目表原样。 */
export const FACTORY_SALES_PRICE_LIST_20261028 = Object.freeze({
  items: Object.freeze([
    row("regular", "空白袋", "裸布-竖小号", "25*32*10", 0.335),
    row("regular", "空白袋", "裸布-竖中号", "30*37*10", 0.41),
    row("regular", "空白袋", "裸布-竖大号", "35*41*12", 0.525),
    row("regular", "空白袋", "裸布-横小号", "35*27*10", 0.365),
    row("regular", "空白袋", "裸布-横中号", "40*30*10", 0.435),
    row("regular", "空白袋", "裸布-横中号", "40*32*10", 0.445),
    row("regular", "空白袋", "裸布-横大号", "45*37*10", 0.545),
    row("regular", "空白袋", "裸布-横特大号", "50*40*12", 0.66),
    row("regular", "空白袋", "酒袋", "29*32*14", 0.52),
    row("regular", "空白袋", "特殊尺寸", "26*27*10", 0.31),
    row("regular", "空白袋", "特殊尺寸", "25*23*8", 0.325),
    row("laminated", "覆膜袋", "覆膜-竖中号", "30*37*10", 0.63),
    row("laminated", "覆膜袋", "覆膜-横小号", "32*25*10", 0.49),
    row("laminated", "覆膜袋", "覆膜-横中号", "40*30*10", 0.63),
    row("laminated", "覆膜袋", "覆膜-横大号", "45*35*10", 0.77),
    row("laminated", "覆膜袋", "覆膜-横大号", "50*40*12", 1.05),
    row("laminated", "覆膜金银", "覆膜金银-竖中号", "30*37*10", 0.66),
    row("laminated", "覆膜金银", "覆膜金银-横小号", "32*25*10", 0.52),
    row("laminated", "覆膜金银", "覆膜金银-横中号", "40*30*10", 0.66),
    row("laminated", "覆膜金银", "覆膜金银-横大号", "45*35*10", 0.80),
    row("laminated", "覆膜金银", "覆膜金银-横大号", "50*40*12", 1.08),
    row("gift", "喜", "喜字礼品袋", "25*30*10", 0.54),
    row("gift", "喜", "喜字礼品袋", "30*37*10", 0.59),
    row("gift", "喜", "喜字礼品袋", "35*41*12", 0.79),
    row("gift", "福", "福字礼品袋", "25*30*10", 0.54),
    row("gift", "福", "福字礼品袋", "30*37*10", 0.59),
    row("gift", "福", "福字礼品袋", "35*41*12", 0.79),
    row("gift", "福", "福字礼品袋（只限福）", "30*30", 0.32),
    row("bear_dog", "小熊小狗", "小熊小狗", "25*23*8", 0.47),
    row("bear_dog", "小熊小狗", "小熊小狗", "30*27*10", 0.53),
    row("bear_dog", "小熊小狗", "小熊小狗", "35*32*10", 0.59),
    row("bear_dog", "小熊小狗", "小熊小狗", "40*35*12", 0.71),
    row("bear_dog", "小熊小狗", "小熊小狗", "50*40*12", 0.82),
  ]),
  rules: Object.freeze({
    // 加长手提另加（元/个）。订单没写长度时按最短的 50cm 算（和以前「加长提 +0.03」一致）。
    handleAddons: Object.freeze([
      Object.freeze({ lengthCm: 50, addon: 0.03 }),
      Object.freeze({ lengthCm: 60, addon: 0.13 }),
      Object.freeze({ lengthCm: 65, addon: 0.14 }),
      Object.freeze({ lengthCm: 70, addon: 0.14 }),
      Object.freeze({ lengthCm: 75, addon: 0.15 }),
      Object.freeze({ lengthCm: 80, addon: 0.15 }),
    ]),
    // 负责人 2026-11-08：礼品袋（喜、福）1000 个起每个减 5 分。
    giftDiscount: Object.freeze({ styleKeys: Object.freeze(["喜", "福"]), minQty: 1000, discount: 0.05 }),
    // 负责人 2026-11-08：加扣子每个袋子 +0.10，小熊小狗价格已含扣子，不再加。
    snapAddon: Object.freeze({ addon: 0.1, exemptStyleKeys: Object.freeze(["小熊小狗"]) }),
  }),
});

export const DEFAULT_SALES_PRICE_RULES = FACTORY_SALES_PRICE_LIST_20261028.rules;

const clean = (value) => String(value ?? "").trim();
const round4 = (value) => Math.round((Number(value) + Number.EPSILON) * 10_000) / 10_000;
const priceNumber = (value) => {
  const text = clean(value);
  if (!/^\d+(?:\.\d{1,4})?$/u.test(text)) return NaN;
  return round4(Number(text));
};

export function normalizeSalesPriceSizeKey(value) {
  return clean(value).replace(/[×xX＊]/gu, "*").replace(/\s+/gu, "").replace(/cm$/iu, "");
}

export function formatSalesPriceSize(sizeKey) {
  return normalizeSalesPriceSizeKey(sizeKey).replaceAll("*", "×");
}

/** 规则缺项时用 10-28 默认值补齐，保证老价格表（没有规则）也能算。 */
export function normalizeSalesPriceRules(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const handleAddons = Array.isArray(source.handleAddons) && source.handleAddons.length
    ? source.handleAddons.map((item) => ({ lengthCm: Number(item.lengthCm), addon: round4(item.addon) }))
      .filter((item) => Number.isFinite(item.lengthCm) && item.lengthCm > 0 && Number.isFinite(item.addon) && item.addon >= 0)
      .sort((a, b) => a.lengthCm - b.lengthCm)
    : DEFAULT_SALES_PRICE_RULES.handleAddons.map((item) => ({ ...item }));
  const gift = source.giftDiscount && typeof source.giftDiscount === "object" ? source.giftDiscount : DEFAULT_SALES_PRICE_RULES.giftDiscount;
  const snap = source.snapAddon && typeof source.snapAddon === "object" ? source.snapAddon : DEFAULT_SALES_PRICE_RULES.snapAddon;
  return {
    handleAddons,
    giftDiscount: {
      styleKeys: (Array.isArray(gift.styleKeys) ? gift.styleKeys : DEFAULT_SALES_PRICE_RULES.giftDiscount.styleKeys).map(clean).filter(Boolean),
      minQty: Number.isSafeInteger(Number(gift.minQty)) && Number(gift.minQty) > 0 ? Number(gift.minQty) : DEFAULT_SALES_PRICE_RULES.giftDiscount.minQty,
      discount: Number.isFinite(Number(gift.discount)) && Number(gift.discount) >= 0 ? round4(gift.discount) : DEFAULT_SALES_PRICE_RULES.giftDiscount.discount,
    },
    snapAddon: {
      addon: Number.isFinite(Number(snap.addon)) && Number(snap.addon) >= 0 ? round4(snap.addon) : DEFAULT_SALES_PRICE_RULES.snapAddon.addon,
      exemptStyleKeys: (Array.isArray(snap.exemptStyleKeys) ? snap.exemptStyleKeys : DEFAULT_SALES_PRICE_RULES.snapAddon.exemptStyleKeys).map(clean).filter(Boolean),
    },
  };
}

/** 从提手文字里取长度：「加长提60cm」「60cm提」「提手65厘米」。没写长度返回 null。 */
export function handleLengthCm(text = "") {
  const value = clean(text);
  const match = value.match(/(\d{2})\s*(?:cm|CM|厘米|公分)/u);
  return match ? Number(match[1]) : null;
}

export function isExtendedHandleText(text = "") {
  return /加长|长提/u.test(clean(text)) || handleLengthCm(text) !== null;
}

/**
 * 加长提手加价。没写长度按最短一档；写了不在表里的长度，按「不短于它的最近一档」，比最长档还长按最长档。
 * @returns {{ addon:number, lengthCm:number|null, matchedLengthCm:number|null }}
 */
export function extendedHandleAddon(rules, handleText = "") {
  if (!isExtendedHandleText(handleText)) return { addon: 0, lengthCm: null, matchedLengthCm: null };
  const { handleAddons } = normalizeSalesPriceRules(rules);
  if (!handleAddons.length) return { addon: 0, lengthCm: null, matchedLengthCm: null };
  const lengthCm = handleLengthCm(handleText);
  const tier = lengthCm === null
    ? handleAddons[0]
    : handleAddons.find((item) => item.lengthCm >= lengthCm) ?? handleAddons[handleAddons.length - 1];
  return { addon: tier.addon, lengthCm, matchedLengthCm: tier.lengthCm };
}

export function giftQuantityDiscount(rules, styleKey, quantity) {
  const { giftDiscount } = normalizeSalesPriceRules(rules);
  return giftDiscount.styleKeys.includes(clean(styleKey)) && Number(quantity) >= giftDiscount.minQty ? giftDiscount.discount : 0;
}

export function snapButtonAddon(rules, styleKey, wanted) {
  if (!wanted) return 0;
  const { snapAddon } = normalizeSalesPriceRules(rules);
  return snapAddon.exemptStyleKeys.includes(clean(styleKey)) ? 0 : snapAddon.addon;
}

/** 订单文字里有没有要加扣子。 */
export function wantsSnapButton(...texts) {
  return /加扣|扣子|按扣|揿扣|摁扣/u.test(texts.map(clean).join(" "));
}

/**
 * 校验页面提交的整张价格表。返回 { items, rules } 或抛出带中文说明的错误（message 直接给用户看）。
 */
export function validateSalesPriceTableInput(input = {}) {
  const fail = (message) => { throw Object.assign(new Error(message), { code: "SALES_PRICE_INVALID", statusCode: 422 }); };
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (!rawItems.length) fail("价格表不能是空的。");
  if (rawItems.length > 500) fail("价格表行数太多，请检查。");
  const seen = new Set();
  const items = rawItems.map((raw, index) => {
    const where = `第 ${index + 1} 行`;
    const category = clean(raw.category);
    const styleKey = clean(raw.styleKey);
    const sizeKey = normalizeSalesPriceSizeKey(raw.sizeKey);
    const label = clean(raw.label);
    if (!SALES_PRICE_CATEGORIES.some((item) => item.key === category)) fail(`${where}分类不对。`);
    if (SALES_PRICE_STYLES[styleKey] !== category) fail(`${where}款式「${styleKey}」不属于这个分类。`);
    if (!/^\d+(?:\.\d+)?\*\d+(?:\.\d+)?(?:\*\d+(?:\.\d+)?)?$/u.test(sizeKey)) fail(`${where}尺寸要写成 宽*高*侧，例如 30*37*10。`);
    if (!label || label.length > 40) fail(`${where}品名要填，最多 40 个字。`);
    const bagPrice = priceNumber(raw.bagPrice);
    if (!Number.isFinite(bagPrice) || bagPrice <= 0 || bagPrice > 100) fail(`${where}（${label} ${formatSalesPriceSize(sizeKey)}）单价要填大于 0 的数字，最多 4 位小数。`);
    const key = `${styleKey}|${sizeKey}`;
    if (seen.has(key)) fail(`${label} ${formatSalesPriceSize(sizeKey)} 重复了，同一款式同一尺寸只能有一个价。`);
    seen.add(key);
    return { category, styleKey, sizeKey, label, bagPrice, sortOrder: index + 1 };
  });
  const rawRules = input.rules && typeof input.rules === "object" ? input.rules : {};
  const handleAddons = (Array.isArray(rawRules.handleAddons) ? rawRules.handleAddons : []).map((item, index) => {
    const lengthCm = Number(item.lengthCm);
    const addon = priceNumber(item.addon);
    if (!Number.isSafeInteger(lengthCm) || lengthCm < 30 || lengthCm > 150) fail(`加长提手第 ${index + 1} 档长度要填 30–150 之间的整数（cm）。`);
    if (!Number.isFinite(addon) || addon > 10) fail(`加长提手 ${lengthCm}cm 的加价要填数字，最多 4 位小数。`);
    return { lengthCm, addon };
  });
  if (!handleAddons.length) fail("加长提手至少要有一档。");
  if (new Set(handleAddons.map((item) => item.lengthCm)).size !== handleAddons.length) fail("加长提手长度重复了。");
  const gift = rawRules.giftDiscount ?? {};
  const giftMinQty = Number(gift.minQty);
  const giftDiscountValue = priceNumber(gift.discount);
  if (!Number.isSafeInteger(giftMinQty) || giftMinQty < 1) fail("礼品袋优惠的起始数量要填正整数。");
  if (!Number.isFinite(giftDiscountValue) || giftDiscountValue > 10) fail("礼品袋每个减多少要填数字，最多 4 位小数。");
  const snap = rawRules.snapAddon ?? {};
  const snapValue = priceNumber(snap.addon);
  if (!Number.isFinite(snapValue) || snapValue > 10) fail("加扣子每个加多少要填数字，最多 4 位小数。");
  const changeSummary = clean(input.changeSummary);
  if (!changeSummary) fail("请写一句改价说明，比如「裸布竖中号涨到 0.42」。");
  if (changeSummary.length > 200) fail("改价说明最多 200 个字。");
  return {
    items,
    rules: {
      handleAddons: handleAddons.sort((a, b) => a.lengthCm - b.lengthCm),
      giftDiscount: { styleKeys: ["喜", "福"], minQty: giftMinQty, discount: giftDiscountValue },
      snapAddon: { addon: snapValue, exemptStyleKeys: ["小熊小狗"] },
    },
    changeSummary,
  };
}

/** 两版价格表之间改了什么，给「改价记录」用。 */
export function diffSalesPriceTables(before = null, after = null) {
  const keyOf = (item) => `${item.styleKey}|${normalizeSalesPriceSizeKey(item.sizeKey)}`;
  const describe = (item) => `${item.label} ${formatSalesPriceSize(item.sizeKey)}`;
  const previous = new Map((before?.items ?? []).map((item) => [keyOf(item), item]));
  const next = new Map((after?.items ?? []).map((item) => [keyOf(item), item]));
  const changes = [];
  for (const [key, item] of next) {
    const old = previous.get(key);
    if (!old) changes.push({ kind: "added", text: `新增 ${describe(item)} ${round4(item.bagPrice)}` });
    else if (round4(old.bagPrice) !== round4(item.bagPrice)) changes.push({ kind: "price", text: `${describe(item)} ${round4(old.bagPrice)} → ${round4(item.bagPrice)}` });
    else if (clean(old.label) !== clean(item.label)) changes.push({ kind: "label", text: `${formatSalesPriceSize(item.sizeKey)} 品名「${old.label}」→「${item.label}」` });
  }
  for (const [key, item] of previous) if (!next.has(key)) changes.push({ kind: "removed", text: `删除 ${describe(item)}` });
  if (before) {
    const a = normalizeSalesPriceRules(before.rules);
    const b = normalizeSalesPriceRules(after?.rules);
    const handles = (rules) => rules.handleAddons.map((item) => `${item.lengthCm}cm +${item.addon}`).join("，");
    if (handles(a) !== handles(b)) changes.push({ kind: "rule", text: `加长提手：${handles(a)} → ${handles(b)}` });
    if (a.giftDiscount.minQty !== b.giftDiscount.minQty || a.giftDiscount.discount !== b.giftDiscount.discount) changes.push({ kind: "rule", text: `礼品袋优惠：${a.giftDiscount.minQty} 个起减 ${a.giftDiscount.discount} → ${b.giftDiscount.minQty} 个起减 ${b.giftDiscount.discount}` });
    if (a.snapAddon.addon !== b.snapAddon.addon) changes.push({ kind: "rule", text: `加扣子：+${a.snapAddon.addon} → +${b.snapAddon.addon}` });
  }
  return changes;
}
