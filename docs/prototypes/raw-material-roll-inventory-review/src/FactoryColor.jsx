import {
  FACTORY_STANDARD_COLOR_DEFINITIONS,
  FACTORY_STANDARD_COLOR_INPUT_ALIASES,
  getFactoryStandardColorSwatch,
} from "../../../../shared/factoryStandardColors.js";

// 旧库存的只读显示兼容，不作为标准色或厂家映射候选。
const LEGACY_FACTORY_COLORS = {
  蓝色: "#173f91",
  浅紫: "#c5a7da",
  深灰: "#62666a",
  豆沙绿: "#a8c88b",
  翠绿: "#188d2a",
  绿色: "#188d2a",
  金色: "#c28a1b",
};

export const FACTORY_COLORS = Object.freeze({
  ...LEGACY_FACTORY_COLORS,
  ...Object.fromEntries(FACTORY_STANDARD_COLOR_DEFINITIONS.map(({ name, swatch }) => [name, swatch])),
  ...Object.fromEntries(FACTORY_STANDARD_COLOR_INPUT_ALIASES.map((name) => [name, getFactoryStandardColorSwatch(name)])),
});

export const RAW_MATERIAL_COLOR_NAMES = ["宝兰", "本白", "浅紫", "深灰", "黑色", "豆沙绿", "翠绿", "天兰", "果绿", "大红"];

export function ColorChip({ color }) {
  const swatch = getFactoryStandardColorSwatch(color, FACTORY_COLORS[String(color ?? "").trim()] || "#d2d7dd");
  return <span aria-hidden="true" className="color-chip" style={{ background: swatch }} />;
}

export function FactoryColorLabel({ color }) {
  return <span className="factory-color-label"><ColorChip color={color} /><span>{color}</span></span>;
}
