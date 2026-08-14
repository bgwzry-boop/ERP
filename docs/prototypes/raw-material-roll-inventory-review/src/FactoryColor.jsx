export const FACTORY_COLORS = {
  宝兰: "#173f91",
  蓝色: "#173f91",
  本白: "#fbfcf7",
  白色: "#fbfcf7",
  米白: "#efe5cf",
  浅紫: "#c5a7da",
  深灰: "#62666a",
  黑色: "#151719",
  豆沙绿: "#a8c88b",
  翠绿: "#188d2a",
  绿色: "#188d2a",
  天兰: "#25a8dc",
  果绿: "#8cd62d",
  大红: "#dc171f",
  红色: "#dc171f",
  金色: "#c28a1b",
};

export const RAW_MATERIAL_COLOR_NAMES = ["宝兰", "本白", "浅紫", "深灰", "黑色", "豆沙绿", "翠绿", "天兰", "果绿", "大红"];

export function ColorChip({ color }) {
  return <span aria-hidden="true" className="color-chip" style={{ background: FACTORY_COLORS[color] || "#d2d7dd" }} />;
}

export function FactoryColorLabel({ color }) {
  return <span className="factory-color-label"><ColorChip color={color} /><span>{color}</span></span>;
}
