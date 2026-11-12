// 负责人 2026-11-08：开单时提醒这单要用的布——用跟小程序一样的公式（布宽 = 袋高×2+侧宽+6，
// 每个用布长 = 袋宽+侧宽+2，78 克），对比卷料库存里同颜色同宽幅的可用卷。只提醒、不拦下单。
import { evaluateRawMaterialOrderSupport } from "../../../../shared/rawMaterialInventorySupport.js";
import { normalizeOrderType } from "../../../../shared/orderRouting.js";

const NEEDS_FABRIC = new Set(["custom_print", "custom_special"]);
const DEFAULT_ROLL_KG = 100;

export function needsFabricHint(line = {}) {
  return NEEDS_FABRIC.has(normalizeOrderType(line.orderType));
}

const rolls = (kg, perRoll) => Math.round((kg / perRoll) * 10) / 10;

/** One hint per line that consumes our own fabric. inbounds may be null when stock could not be read. */
export function buildOrderFabricHints(rows = [], inbounds = null) {
  return rows.map((line, index) => ({ line, index })).filter(({ line }) => needsFabricHint(line)).map(({ line, index }) => {
    const color = String(line.color || line.bagColor || "").trim();
    const support = evaluateRawMaterialOrderSupport({ inbounds: inbounds ?? [], order: { size: line.size, qty: line.qty, color } });
    if (support.status !== "已计算" || !color) return { index, ok: null, text: "尺寸、数量或袋色没填全，算不出用布" };
    const perRoll = support.availableRollCount > 0 ? support.availableWeightKg / support.availableRollCount : DEFAULT_ROLL_KG;
    const need = `${support.requiredWidthCm}cm ${color} 约 ${Math.round(support.requiredWeightKg)}kg（约 ${rolls(support.requiredWeightKg, perRoll)} 卷）`;
    if (inbounds === null) return { index, ok: null, text: `${need}；卷料库存没读到，开单后去「卷料库存」看` };
    if (support.shortageWeightKg > 0) {
      const short = Math.max(1, Math.ceil(support.shortageWeightKg / perRoll));
      return { index, ok: false, text: `${need}；库里 ${support.availableRollCount} 卷，还差约 ${short} 卷，记得订购 / 采购` };
    }
    return { index, ok: true, text: `${need}；库里 ${support.availableRollCount} 卷，够用` };
  });
}
