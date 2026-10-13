export const RAW_MATERIAL_SUPPLIER_PROFILES = Object.freeze([
  freezeProfile({
    key: "renyi_zhengheng",
    captureName: "振恒",
    aliases: ["人意无纺布", "振恒"],
    documentPriceReferenceOnly: true,
  }),
  freezeProfile({
    key: "daxiang_beichen",
    captureName: "北陈",
    aliases: ["宁晋县达翔塑料制品", "达翔塑料", "北陈", "河北北陈无纺布"],
  }),
  freezeProfile({
    key: "tengsheng",
    captureName: "腾胜",
    aliases: ["宁晋县腾胜无纺布", "腾胜无纺布", "腾胜"],
  }),
  freezeProfile({
    key: "hongshang_baihou",
    captureName: "宏尚",
    aliases: ["河北宏尚无纺布", "宏尚无纺布", "白候"],
  }),
  freezeProfile({
    key: "xinlonghong",
    captureName: "鑫隆宏",
    aliases: ["新乐市鑫隆宏无纺布", "鑫隆宏无纺布", "鑫隆宏"],
    provisional: true,
  }),
]);

export function listRawMaterialCaptureSupplierOptions() {
  return RAW_MATERIAL_SUPPLIER_PROFILES.map((profile) => profile.captureName);
}

function freezeProfile(profile) {
  return Object.freeze({
    ...profile,
    aliases: Object.freeze([...profile.aliases]),
  });
}
