// 负责人 2026-11-08 设计稿「原料库存 · 颜色 × 宽幅」：一眼看什么宽幅、什么颜色还有几卷。
// 只算「可用」的卷（机边、余料待复核不算）。点格子 = 按「宽幅::颜色」筛下面的台账。
import { calculateRawMaterialOrderRequirement } from "../../../../shared/rawMaterialInventorySupport.js";

const round1 = (value) => Math.round(value * 10) / 10;
const widthCmOf = (roll) => Number(roll.widthCm) || Number(String(roll.width ?? "").match(/\d+(?:\.\d+)?/)?.[0]) || 0;

/** 一卷及以下算「快用完」。 */
export const LOW_STOCK_ROLLS = 1;

/**
 * @returns {{ widths: Array<{label:string, cm:number}>, strips: Array<{key:string, color:string, count:number}>, rows: Array<{color:string, swatch:string, total:{count:number, kg:number}, cells:Record<string,{count:number, kg:number}>}>, total:{count:number, kg:number} }}
 */
export function buildStockMatrix(rolls = []) {
  const usable = rolls.filter((roll) => roll.status === "可用" && roll.width && roll.color);
  const widths = new Map();
  const rows = new Map();
  const strips = new Map();
  for (const roll of usable) {
    // 把条按件数算，不进宽幅表格，单独一行。
    if (String(roll.width).includes("把条")) {
      const key = `${roll.width}::${roll.color}`;
      const strip = strips.get(key) ?? { key, width: roll.width, color: roll.color, swatch: roll.swatchColor || roll.color, count: 0 };
      strip.count += 1; strips.set(key, strip);
      continue;
    }
    widths.set(roll.width, widthCmOf(roll));
    const row = rows.get(roll.color) ?? { color: roll.color, swatch: roll.swatchColor || roll.color, total: { count: 0, kg: 0 }, cells: {} };
    const cell = row.cells[roll.width] ?? { count: 0, kg: 0 };
    cell.count += 1; cell.kg = round1(cell.kg + (Number(roll.weight) || 0));
    row.total.count += 1; row.total.kg = round1(row.total.kg + (Number(roll.weight) || 0));
    row.cells[roll.width] = cell;
    rows.set(roll.color, row);
  }
  const widthList = [...widths].map(([label, cm]) => ({ label, cm })).sort((a, b) => a.cm - b.cm || a.label.localeCompare(b.label, "zh-CN"));
  // 卷数多的颜色排前面；同卷数按名字。
  const rowList = [...rows.values()].sort((a, b) => b.total.count - a.total.count || a.color.localeCompare(b.color, "zh-CN"));
  return {
    widths: widthList,
    rows: rowList,
    strips: [...strips.values()].sort((a, b) => b.count - a.count || a.color.localeCompare(b.color, "zh-CN")),
    total: { count: usable.length, kg: round1(usable.reduce((sum, roll) => sum + (Number(roll.weight) || 0), 0)) },
  };
}

export function cellTone(cell) {
  if (!cell || !cell.count) return "empty";
  return cell.count <= LOW_STOCK_ROLLS ? "low" : "ok";
}

/**
 * 查布：可以输「90 红」（宽幅 + 颜色），也可以输袋子尺寸「30*37*10 红」，按开单同一个公式换算成布宽。
 * @returns {null | { widthCm:number|null, color:string, fromSize:string, text:string }}
 */
export function parseFabricQuery(input = "") {
  const text = String(input).trim();
  if (!text) return null;
  const size = text.match(/(\d+(?:\.\d+)?)\s*[*×xX＊]\s*(\d+(?:\.\d+)?)(?:\s*[*×xX＊]\s*(\d+(?:\.\d+)?))?/u);
  let widthCm = null;
  let fromSize = "";
  let rest = text;
  if (size) {
    fromSize = size[3] ? `${size[1]}*${size[2]}*${size[3]}` : `${size[1]}*${size[2]}`;
    const requirement = calculateRawMaterialOrderRequirement({ size: size[3] ? fromSize : `${fromSize}*0`, qty: 1 });
    widthCm = requirement.requiredWidthCm || null;
    rest = text.replace(size[0], " ");
  } else {
    const width = text.match(/(\d{2,3}(?:\.\d+)?)\s*(?:cm|CM|厘米)?/u);
    if (width) { widthCm = Number(width[1]); rest = text.replace(width[0], " "); }
  }
  const color = rest.replace(/[色的\s,，、]+/gu, " ").trim().split(/\s+/u).filter(Boolean).join("");
  return { widthCm, color, fromSize, text };
}

/** 查布结果：同宽幅（宽幅没给就不限）、颜色名里含关键字的可用卷，按颜色汇总。 */
export function lookupFabric(rolls = [], query = null) {
  if (!query || (!query.widthCm && !query.color)) return null;
  const matches = new Map();
  for (const roll of rolls) {
    if (roll.status !== "可用") continue;
    if (query.widthCm && Math.abs(widthCmOf(roll) - query.widthCm) > 0.01) continue;
    if (query.color && !`${roll.color}${roll.colorLabel ?? ""}`.includes(query.color)) continue;
    const key = `${roll.width}::${roll.color}`;
    const entry = matches.get(key) ?? { key, width: roll.width, color: roll.color, swatch: roll.swatchColor || roll.color, count: 0, kg: 0 };
    entry.count += 1; entry.kg = round1(entry.kg + (Number(roll.weight) || 0));
    matches.set(key, entry);
  }
  const items = [...matches.values()].sort((a, b) => b.count - a.count || a.color.localeCompare(b.color, "zh-CN"));
  const label = [query.fromSize ? `${query.fromSize} 要用` : "", query.widthCm ? `${query.widthCm}cm` : "", query.color].filter(Boolean).join(" ");
  return { label, items, count: items.reduce((sum, item) => sum + item.count, 0), kg: round1(items.reduce((sum, item) => sum + item.kg, 0)) };
}
