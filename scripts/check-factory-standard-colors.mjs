import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  FACTORY_STANDARD_COLOR_DEFINITIONS,
  FACTORY_STANDARD_COLORS,
  FACTORY_NONEXISTENT_COLORS,
  FACTORY_STANDARD_COLOR_SOURCE,
  getFactoryStandardColorSwatch,
  isFactoryNonexistentColor,
  normalizeFactoryStandardColor,
} from "../shared/factoryStandardColors.js";
import { RAW_MATERIAL_FACTORY_COLORS } from "../shared/rawMaterialFactoryColors.js";
import { editableColors } from "../src/domain/officeRules.js";

const expected = [
  "红色", "黑色", "白色", "墨绿", "米白", "宝蓝", "黄色", "灰色", "紫色", "亮绿",
  "咖色", "天蓝", "果绿", "橘色", "海蓝", "玫红", "草绿", "抹茶绿", "牛仔蓝", "珊瑚粉",
  "安哥拉红", "卡其", "香芋紫", "橄榄绿", "雾霾蓝", "冰梅", "小鸡黄", "湖蓝", "焦糖", "粉色",
  "酒红", "芋泥紫", "荧光绿", "豆绿", "酱黄",
];

assert.deepEqual(FACTORY_STANDARD_COLORS, expected, "the first factory palette must match the 35 photo-evidenced material colours");
assert.deepEqual(RAW_MATERIAL_FACTORY_COLORS, expected, "raw-material receiving must reuse the factory-wide canonical palette");
assert.equal(FACTORY_STANDARD_COLOR_SOURCE.regularPhotoCount, 21);
assert.equal(FACTORY_STANDARD_COLOR_SOURCE.fashionPhotoCount, 24);
assert.equal(FACTORY_STANDARD_COLOR_SOURCE.horizontalReferencePhotoCount, 16);
assert.equal(new Set(FACTORY_STANDARD_COLORS).size, 35, "factory standard colours must be unique");

for (const definition of FACTORY_STANDARD_COLOR_DEFINITIONS) {
  assert.match(definition.swatch, /^#[0-9a-f]{6}$/i, `${definition.name} needs a reusable factory swatch`);
  assert.equal(getFactoryStandardColorSwatch(definition.name), definition.swatch);
  assert(editableColors.includes(definition.name), `${definition.name} must be available to ERP order entry`);
}

for (const composite of ["咖米提", "白黑提", "焦糖米提", "粉袋酒红提", "荧光绿黑提"]) {
  assert(!FACTORY_STANDARD_COLORS.includes(composite), `${composite} is a finished-goods combination, not one material colour`);
}
assert.deepEqual(FACTORY_NONEXISTENT_COLORS, ["云雅绿", "天池蓝", "梦幻紫"]);
for (const nonexistent of FACTORY_NONEXISTENT_COLORS) {
  assert(!FACTORY_STANDARD_COLORS.includes(nonexistent), `${nonexistent} does not exist and must not enter the factory palette`);
  assert.equal(isFactoryNonexistentColor(nonexistent), true);
}

assert.equal(normalizeFactoryStandardColor("本白"), "白色");
assert.equal(normalizeFactoryStandardColor("大红"), "红色");
assert.equal(normalizeFactoryStandardColor("宝兰"), "宝蓝");
assert.equal(normalizeFactoryStandardColor("天兰"), "天蓝");
assert.equal(normalizeFactoryStandardColor("桔红"), "橘色");
assert.equal(normalizeFactoryStandardColor("豆沙绿"), "", "similar-looking manufacturer names must not be merged silently");

const migration = await readFile(new URL("../db/migrations/0046_factory_standard_colors.sql", import.meta.url), "utf8");
for (const name of FACTORY_STANDARD_COLORS) {
  assert(migration.includes(`'${name}'`), `database seed migration must contain ${name}`);
}
assert.match(migration, /WHERE NOT EXISTS[\s\S]*existing\.name = factory_colors\.name/u, "the seed must preserve existing exact-name master data");
assert.match(migration, /ON CONFLICT DO NOTHING/u, "the seed must be safe to reapply against existing master data");

console.log("Factory-standard color checks passed: 35 photo-evidenced material colors, three confirmed nonexistent names excluded, decomposed bag/handle combinations, aliases, swatches, and database seed are aligned.");
