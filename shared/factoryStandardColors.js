// 首批工厂标准色来自“下单小程序”的横款/竖款袋子实拍。
// 图片中的“袋色 + 提手色”成品组合会拆成两个单一布料颜色，组合名本身不是标准色。
export const FACTORY_STANDARD_COLOR_SOURCE = Object.freeze({
  authority: "下单小程序横款/竖款袋子实拍",
  regularPhotoCount: 21,
  fashionPhotoCount: 24,
  horizontalReferencePhotoCount: 16,
  rule: "图片文件名及小程序结构化袋身/提手字段共同确认单一布料颜色",
});

export const FACTORY_STANDARD_COLOR_DEFINITIONS = Object.freeze([
  color("红色", "red", "#e52124"),
  color("黑色", "black", "#202323"),
  color("白色", "white", "#ffffff"),
  color("墨绿", "dark-green", "#145642"),
  color("米白", "ivory", "#e9dfc7"),
  color("宝蓝", "royal-blue", "#1745b8"),
  color("黄色", "yellow", "#f2ba22"),
  color("灰色", "gray", "#6b7074"),
  color("紫色", "purple", "#6038b6"),
  color("亮绿", "bright-green", "#63b94b"),
  color("咖色", "coffee", "#76533c"),
  color("天蓝", "sky-blue", "#55a7d9"),
  color("果绿", "fruit-green", "#55a630"),
  color("橘色", "orange", "#e8792f"),
  color("海蓝", "ocean-blue", "#246d9b"),
  color("玫红", "rose", "#c52264"),
  color("草绿", "grass-green", "#78a843"),
  color("抹茶绿", "matcha-green", "#708a43"),
  color("牛仔蓝", "denim-blue", "#3f6384"),
  color("珊瑚粉", "coral-pink", "#e7a08d"),
  color("安哥拉红", "angola-red", "#8f2f2a"),
  color("卡其", "khaki", "#b49c70"),
  color("香芋紫", "taro-purple", "#96759b"),
  color("橄榄绿", "olive-green", "#566642"),
  color("雾霾蓝", "haze-blue", "#758c9d"),
  color("冰梅", "ice-plum", "#b76c86"),
  color("小鸡黄", "chick-yellow", "#efc64a"),
  color("湖蓝", "lake-blue", "#3c9bb5"),
  color("焦糖", "caramel", "#b17a42"),
  color("粉色", "pink", "#e7a0ad"),
  color("酒红", "wine-red", "#6f1d38"),
  color("芋泥紫", "taro-mud-purple", "#806b91"),
  color("荧光绿", "fluorescent-green", "#72c94a"),
  color("豆绿", "bean-green", "#88a98b"),
  color("酱黄", "sauce-yellow", "#b58c2e"),
]);

export const FACTORY_STANDARD_COLORS = Object.freeze(
  FACTORY_STANDARD_COLOR_DEFINITIONS.map((item) => item.name),
);

// 工厂已明确确认这些名称并非现有颜色；不得作为标准色、候选色或自动映射结果。
export const FACTORY_NONEXISTENT_COLORS = Object.freeze([
  "云雅绿",
  "天池蓝",
  "梦幻紫",
]);

// 只保留已有历史数据所需的明确同义/字形别名；厂家自己的叫法仍走厂家专属映射。
export const FACTORY_STANDARD_COLOR_INPUT_ALIASES = Object.freeze([
  "本白",
  "大红",
  "米白色",
  "米色",
  "宝兰",
  "宝蓝色",
  "天兰",
  "天蓝色",
  "桔色",
  "桔红",
  "橘红",
  "焦糖色",
]);

const definitionByName = new Map(
  FACTORY_STANDARD_COLOR_DEFINITIONS.map((item) => [normalizeColorText(item.name), item]),
);

const aliasToStandardName = new Map([
  ["白", "白色"],
  ["本白", "白色"],
  ["日白", "白色"],
  ["曰白", "白色"],
  ["口白", "白色"],
  ["红", "红色"],
  ["大红", "红色"],
  ["大红色", "红色"],
  ["黑", "黑色"],
  ["米白色", "米白"],
  ["米色", "米白"],
  ["宝兰", "宝蓝"],
  ["宝蓝色", "宝蓝"],
  ["天兰", "天蓝"],
  ["天蓝色", "天蓝"],
  ["桔色", "橘色"],
  ["桔红", "橘色"],
  ["橘红", "橘色"],
  ["焦糖色", "焦糖"],
]);

export function normalizeFactoryStandardColor(value) {
  const normalized = normalizeColorText(value);
  if (!normalized) return "";
  if (definitionByName.has(normalized)) return definitionByName.get(normalized).name;
  return aliasToStandardName.get(normalized) ?? "";
}

export function getFactoryStandardColorDefinition(value) {
  const name = normalizeFactoryStandardColor(value);
  return name ? definitionByName.get(name) ?? null : null;
}

export function getFactoryStandardColorSwatch(value, fallback = "") {
  return getFactoryStandardColorDefinition(value)?.swatch ?? fallback;
}

export function isFactoryNonexistentColor(value) {
  const normalized = normalizeColorText(value);
  return FACTORY_NONEXISTENT_COLORS.some((name) => normalizeColorText(name) === normalized);
}

function color(name, colorKey, swatch) {
  return Object.freeze({ name, colorKey, swatch });
}

function normalizeColorText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/[\s·•]+/gu, "");
}
