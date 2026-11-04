// 负责人 2026-11-04：丝印按油墨颜色排顺序——先印白色，黑色和多色放到收尾。
// 领任务列表按这个顺序分组，方便丝印工挑。
const WHITE = new Set(["白", "白色", "米白", "乳白"]);
const BLACK = new Set(["黑", "黑色"]);
const PLACEHOLDERS = new Set(["", "待确认", "非印刷", "无印刷", "无", "不印刷", "未印刷"]);
const MULTI_WORDS = /[双两二三四五六多]色|黑白|彩色|套色|彩印/u;

export const INK_ORDER_GROUPS = Object.freeze([
  Object.freeze({ key: "white", label: "白色（先印）", rank: 0 }),
  Object.freeze({ key: "single", label: "其他单色", rank: 1 }),
  Object.freeze({ key: "black", label: "黑色（收尾）", rank: 2 }),
  Object.freeze({ key: "multi", label: "多色（收尾）", rank: 3 }),
  Object.freeze({ key: "unknown", label: "印色待确认", rank: 4 }),
]);

export function inkColorsOf(printColor) {
  const text = String(printColor ?? "").normalize("NFKC").trim();
  if (PLACEHOLDERS.has(text)) return [];
  return [...new Set(text.split(/[、,，/／+＋和与及&\s]+/u).map((part) => part.trim()).filter((part) => part && !PLACEHOLDERS.has(part)))];
}

/** row: an order line ({ printColor, printColorCount }) or a bare print-colour string. */
export function inkOrderGroup(row) {
  const source = typeof row === "object" && row ? row : { printColor: row };
  const colors = inkColorsOf(source.printColor);
  const explicitCount = Number(source.printColorCount);
  const multi = colors.length > 1 || (Number.isSafeInteger(explicitCount) && explicitCount > 1)
    || colors.some((color) => MULTI_WORDS.test(color));
  const key = multi ? "multi" : !colors.length ? "unknown"
    : WHITE.has(colors[0]) ? "white" : BLACK.has(colors[0]) ? "black" : "single";
  return INK_ORDER_GROUPS.find((group) => group.key === key);
}

/** Pool order: ink group first (white → single → black → multi → unknown), then oldest claimable first. */
export function compareSilkScreenPoolItems(left, right) {
  const rank = (item) => inkOrderGroup(item?.orderLine ?? {}).rank;
  return rank(left) - rank(right)
    || String(left?.orderLine?.latestNeededAt ?? "9999").localeCompare(String(right?.orderLine?.latestNeededAt ?? "9999"))
    || String(left?.productionTask?.createdAt ?? "").localeCompare(String(right?.productionTask?.createdAt ?? ""))
    || String(left?.productionTaskId ?? "").localeCompare(String(right?.productionTaskId ?? ""));
}
