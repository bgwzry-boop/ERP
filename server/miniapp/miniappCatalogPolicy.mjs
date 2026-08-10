import { getPublicSpecialQuoteRules } from "../../shared/pricing/specialBagPricing.js";

const PRODUCT_GROUPS = [
  { id: "nonwoven", name: "无纺布手提袋", description: "轻便 · 常用现货", iconPath: "/assets/icons/material-nonwoven.png", iconTone: "green" },
  { id: "laminated_nonwoven", name: "覆膜无纺布手提袋", description: "表面覆膜 · 更挺括", iconPath: "/assets/icons/material-laminated.png", iconTone: "blue" },
];

const PRODUCT_TYPES = [
  { id: "stock_plain", materialGroup: "nonwoven", shortName: "纯色袋", name: "现货纯色袋", description: "常备尺寸与常规、服装店颜色", image: "/assets/colors/regular-red.jpg", iconPath: "/assets/icons/stock-plain.png", iconTone: "green", requiresPrint: false, laminated: false },
  { id: "stock_printed", materialGroup: "nonwoven", shortName: "印刷通货袋", name: "印刷通货袋", description: "福、喜、小狗等常备图案", image: "/assets/products/fu-bag-30x37x10.jpg", iconPath: "/assets/icons/stock-printed.png", iconTone: "orange", requiresPrint: false, laminated: false },
  { id: "custom_print", materialGroup: "nonwoven", shortName: "定制印刷", name: "定制印刷", description: "选常备尺寸，上传自己的印刷稿", image: "/assets/colors/regular-white.jpg", iconPath: "/assets/icons/custom-print.png", iconTone: "blue", requiresPrint: true, laminated: false },
  { id: "laminated_plain", materialGroup: "laminated_nonwoven", shortName: "纯色袋", name: "覆膜纯色袋", description: "覆膜常备尺寸与颜色", image: "/assets/colors/regular-darkgreen-cream-handle.jpg", iconPath: "/assets/icons/laminated-plain.png", iconTone: "cyan", requiresPrint: false, laminated: true },
  { id: "laminated_printed", materialGroup: "laminated_nonwoven", shortName: "印刷通货袋", name: "覆膜印刷通货袋", description: "覆膜福、喜等常备图案", image: "/assets/colors/regular-yellow.jpg", iconPath: "/assets/icons/laminated-printed.png", iconTone: "purple", requiresPrint: false, laminated: true },
  { id: "laminated_custom", materialGroup: "laminated_nonwoven", shortName: "定制印刷", name: "覆膜定制印刷", description: "覆膜袋定制图案与文字", image: "/assets/colors/regular-royalblue.jpg", iconPath: "/assets/icons/laminated-custom.png", iconTone: "navy", requiresPrint: true, laminated: true },
];

const BAG_SERIES = [
  { id: "advertising", name: "广告袋", description: "常规颜色 · 竖款 3＋横款 5", colorGroup: "regular", allowedOrientations: ["vertical", "horizontal"], defaultSizeId: "30x37x10", defaultColorId: "red", defaultHandleId: "regular" },
  { id: "fashion", name: "服装店袋", description: "服装店颜色 · 仅横款 · 偏向长提手", colorGroup: "fashion", allowedOrientations: ["horizontal"], defaultSizeId: "40x30x10", defaultColorId: "matcha", defaultHandleId: "extended" },
];

const REGULAR_SIZES = [
  { id: "26x27x10", label: "26×27×10", orientation: "legacy", customerVisible: false },
  { id: "25x23x8", label: "25×23×8", orientation: "legacy", customerVisible: false },
  { id: "25x32x10", label: "25×32×10", orientation: "vertical", styleGroup: "vertical-small", styleLabel: "竖款小号" },
  { id: "30x36x8", label: "30×36×8", orientation: "legacy", customerVisible: false },
  { id: "30x37x10", label: "30×37×10", orientation: "vertical", styleGroup: "vertical-medium", styleLabel: "竖款中号", aliases: ["30×38", "30×38×10", "30×37"] },
  { id: "35x41x12", label: "35×41×12", orientation: "vertical", styleGroup: "vertical-large", styleLabel: "竖款大号" },
  { id: "35x27x10", label: "35×27×10", orientation: "horizontal", styleGroup: "horizontal-small", styleLabel: "横款小号" },
  { id: "40x30x10", label: "40×30×10", orientation: "horizontal", styleGroup: "horizontal-medium", styleLabel: "横款中号" },
  { id: "40x32x10", label: "40×32×10", orientation: "horizontal", styleGroup: "horizontal-medium", styleLabel: "横款中号 · 加高 2cm" },
  { id: "45x37x10", label: "45×37×10", orientation: "horizontal", styleGroup: "horizontal-large", styleLabel: "横款大号" },
  { id: "50x40x12", label: "50×40×12", orientation: "horizontal", styleGroup: "horizontal-extra-large", styleLabel: "横款加大号" },
];

const LAMINATED_SIZES = [
  { id: "l30x27x10", label: "30×27×10" },
  { id: "l32x25x10", label: "32×25×10" },
  { id: "l40x30x10", label: "40×30×10" },
  { id: "l45x35x10", label: "45×35×10" },
  { id: "l50x40x12", label: "50×40×12" },
];

const PRINTED_PATTERNS = [
  { id: "fu", name: "福字袋", description: "红底金色福字", colorLabel: "红色", image: "/assets/products/fu-bag-30x37x10.jpg", imageSize: "30×37×10", imageColorId: "red", imageHandleId: "regular", defaultSizeLabel: "30×37×10", discountFromQty: 1000, discountUnitAmount: 0.05, sizes: [{ id: "fu25x30x10", label: "25×30×10" }, { id: "fu30x37x10", label: "30×37×10", aliases: ["30×38", "30×38×10"] }, { id: "fu35x41x12", label: "35×41×12" }, { id: "fu30x30", label: "30×30" }] },
  { id: "xi", name: "喜字袋", description: "红底金色双喜", colorLabel: "红色", image: "/assets/products/xi-bag-30x37x10.jpg", imageSize: "30×37×10", imageColorId: "red", imageHandleId: "regular", defaultSizeLabel: "30×37×10", discountFromQty: 1000, discountUnitAmount: 0.05, sizes: [{ id: "xi25x30x10", label: "25×30×10" }, { id: "xi30x37x10", label: "30×37×10", aliases: ["30×38", "30×38×10"] }, { id: "xi35x41x12", label: "35×41×12" }] },
  { id: "dog", name: "小狗袋", description: "小狗常备图案", colorLabel: "多色可选", colorMode: "multiple", sizes: [{ id: "dog25x23x8", label: "25×23×8" }, { id: "dog30x27x10", label: "30×27×10" }, { id: "dog35x32x10", label: "35×32×10" }, { id: "dog40x35x12", label: "40×35×12" }, { id: "dog50x40x12", label: "50×40×12" }] },
];

const REGULAR_COLORS = [
  { id: "red", name: "红色", bagColor: "红色", handleColor: "红色", swatch: "#e52124", handleSwatch: "#e52124", image: "/assets/colors/regular-red.jpg", photoOrientation: "horizontal", photoHandleId: "regular", verticalImage: "/assets/colors/regular-red-vertical-30x37.jpg", verticalImageSize: "30×37×10" },
  { id: "black", name: "黑色", bagColor: "黑色", handleColor: "黑色", swatch: "#202323", handleSwatch: "#202323", image: "/assets/colors/regular-black.jpg", photoOrientation: "horizontal", photoHandleId: "regular" },
  { id: "white", name: "白色", bagColor: "白色", handleColor: "白色", swatch: "#ffffff", handleSwatch: "#ffffff", image: "/assets/colors/regular-white.jpg", photoOrientation: "horizontal", photoHandleId: "regular" },
  { id: "darkgreen-cream", name: "墨绿米提", shortName: "墨绿", bagColor: "墨绿", handleColor: "米白", swatch: "#145642", handleSwatch: "#e9dfc7", image: "/assets/colors/regular-darkgreen-cream-handle.jpg", photoOrientation: "horizontal", photoHandleId: "regular", fixedColorCombination: true },
  { id: "royalblue", name: "宝蓝", bagColor: "宝蓝", handleColor: "宝蓝", swatch: "#1745b8", handleSwatch: "#1745b8", image: "/assets/colors/regular-royalblue.jpg", photoOrientation: "horizontal", photoHandleId: "regular" },
  { id: "yellow", name: "黄色", bagColor: "黄色", handleColor: "黄色", swatch: "#f2ba22", handleSwatch: "#f2ba22", image: "/assets/colors/regular-yellow.jpg", photoOrientation: "horizontal", photoHandleId: "regular" },
  { id: "gray", name: "灰色", bagColor: "灰色", handleColor: "灰色", swatch: "#6b7074", handleSwatch: "#6b7074", image: "/assets/colors/regular-gray.jpg", photoOrientation: "horizontal", photoHandleId: "regular" },
  { id: "purple", name: "紫色", bagColor: "紫色", handleColor: "紫色", swatch: "#6038b6", handleSwatch: "#6038b6", image: "/assets/colors/regular-purple.jpg", photoOrientation: "horizontal", photoHandleId: "regular" },
];

const FASHION_COLORS = [
  ["matcha", "抹茶绿", "抹茶绿", "抹茶绿", "#708a43", "#708a43", "/assets/colors/fashion-matcha.jpg", false, false],
  ["denim", "牛仔蓝", "牛仔蓝", "牛仔蓝", "#3f6384", "#3f6384", "/assets/colors/fashion-denim.jpg", false, false],
  ["coral", "珊瑚粉", "珊瑚粉", "珊瑚粉", "#e7a08d", "#e7a08d", "/assets/colors/fashion-coral.jpg", true, false],
  ["angola-coffee", "安哥拉红咖提", "安哥拉红", "咖色", "#8f2f2a", "#5d372d", "/assets/colors/fashion-angola-coffee.jpg", true, true],
  ["ivory-khaki", "米白卡其提", "米白", "卡其", "#e9e1cf", "#b49c70", "/assets/colors/fashion-ivory-khaki.jpg", true, true],
  ["taro", "香芋紫", "香芋紫", "香芋紫", "#96759b", "#96759b", "/assets/colors/fashion-taro.jpg", false, false],
  ["olive", "橄榄绿", "橄榄绿", "橄榄绿", "#566642", "#566642", "/assets/colors/fashion-olive.jpg", false, false],
  ["haze-blue", "雾霾蓝", "雾霾蓝", "雾霾蓝", "#758c9d", "#758c9d", "/assets/colors/fashion-haze-blue.jpg", true, false],
].map(([id, name, bagColor, handleColor, swatch, handleSwatch, image, photoCompatible, fixedColorCombination]) => ({
  id, name, bagColor, handleColor, swatch, handleSwatch, image,
  photoOrientation: "horizontal",
  photoHandleId: "extended",
  ...(photoCompatible ? {} : { photoCompatible: false }),
  ...(fixedColorCombination ? { fixedColorCombination: true } : {}),
}));

const REGULAR_COLOR_NAMES = ["亮绿", "咖米提", "咖色", "墨绿", "墨绿米提", "天蓝", "宝蓝", "果绿", "橘色", "海蓝", "灰色", "灰袋米提", "玫红", "玫红黑提", "白色", "白袋黑提", "紫色", "红色", "草绿", "黄色", "黑色"];
const FASHION_COLOR_NAMES = ["云雅绿", "冰梅", "卡其", "天池蓝", "安哥拉红", "安哥拉红咖提", "小鸡黄", "抹茶绿", "梦幻紫", "橄榄绿", "湖蓝", "焦糖咖提", "焦糖米提", "牛仔蓝", "珊瑚粉", "米白", "米白卡其提", "米白袋墨绿提", "粉袋米提", "粉袋酒红提", "芋泥紫", "荧光绿", "豆绿", "酒红", "酒红米提", "酱黄", "雾霾蓝", "香芋紫", "香芋紫米提"];

function normalizeSize(value) {
  const size = String(value || "").replaceAll("×", "*").replaceAll(" ", "");
  return ["30*38", "30*38*10", "30*37"].includes(size) ? "30*37*10" : size;
}

function mergePrices(items, prices, styleKeys = []) {
  return items.map((item) => {
    const match = prices.find((price) => normalizeSize(price.size || price.sizeKey) === normalizeSize(item.label)
      && (!styleKeys.length || styleKeys.includes(String(price.styleKey || "").toLowerCase())));
    return { ...item, ...(match ? { price: Number(match.bagPrice), priceConfigured: true } : { priceConfigured: false }) };
  });
}

function mergePatternPrices(pattern, prices) {
  const styleKeys = [pattern.id, pattern.name, `${pattern.id}-bag`, `${pattern.id}_bag`].map((item) => item.toLowerCase());
  return { ...pattern, sizes: mergePrices(pattern.sizes, prices, styleKeys) };
}

export function createMiniappCatalogPolicy(masterData = {}) {
  const prices = Array.isArray(masterData.priceItems) ? masterData.priceItems : [];
  const colorKeys = new Set((masterData.colors || []).flatMap((color) => [String(color.colorKey || "").toLowerCase(), String(color.name || "")]));
  const allowKnownColor = (color) => !colorKeys.size || colorKeys.has(color.id) || colorKeys.has(color.name) || colorKeys.has(color.bagColor);
  const colorCardColors = REGULAR_COLOR_NAMES.map((name, index) => ({ id: `regular-${index}`, name, group: "常规颜色" }))
    .concat(FASHION_COLOR_NAMES.map((name, index) => ({ id: `fashion-${index}`, name, group: "服装店颜色" })));
  const priceVersion = masterData.priceTable
    ? `${masterData.priceTable.bizNo || masterData.priceTable.id}-v${Number(masterData.priceTable.versionNo) || 1}`
    : "";
  return {
    priceVersion,
    productGroups: PRODUCT_GROUPS,
    productTypes: PRODUCT_TYPES,
    bagSeries: BAG_SERIES,
    regularSizes: mergePrices(REGULAR_SIZES, prices, ["blank-bag", "blank_bag", "空白袋", "stock_plain"]),
    laminatedSizes: mergePrices(LAMINATED_SIZES, prices, ["laminated", "laminated_plain", "覆膜袋"]),
    printedPatterns: PRINTED_PATTERNS.map((pattern) => mergePatternPrices(pattern, prices)),
    colors: {
      regular: REGULAR_COLORS.filter(allowKnownColor),
      fashion: FASHION_COLORS.filter(allowKnownColor),
      counts: { regular: REGULAR_COLOR_NAMES.length, fashion: FASHION_COLOR_NAMES.length },
    },
    colorCardColors,
    singleColorCardColors: colorCardColors.filter((item) => !/[袋提]/.test(item.name)),
    specialQuotePresetColors: [
      ...REGULAR_COLORS.filter((item) => ["red", "black", "white", "royalblue", "yellow", "gray", "purple"].includes(item.id))
        .map(({ id, name, swatch }) => ({ id, name, swatch })),
      { id: "darkgreen", name: "墨绿", swatch: "#145642" },
    ],
    handles: [{ id: "regular", name: "普通提", lengthCm: 38, addon: 0 }, { id: "extended", name: "加长提", lengthCm: 50, addon: 0.03 }],
    printPriceRules: { below3000Single: 0.09, below3000Double: 0.13, from3000: 0.09, from5000: 0.08, from10000: 0.06 },
    specialRequirementRules: { snapButtonAddon: 0.1 },
    deliveryOptions: ["到厂自提", "送货上门", "快递 / 快运到厂提货"],
    specialQuoteRules: getPublicSpecialQuoteRules(),
  };
}

export const miniappCatalogPolicyCounts = Object.freeze({ productGroups: 2, productTypes: 6, regularSizes: 11, laminatedSizes: 5, printedPatterns: 3, regularColors: 8, fashionColors: 8 });
