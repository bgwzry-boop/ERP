import assert from "node:assert/strict";

import { customers, initialInventories } from "../src/data/fixtures.js";
import { parseOrderText } from "../src/lib/orderParser.js";

const redBlankBag = parseOrderText(
  "张三服饰，30*38*10红色空白袋10个，普通提，自提，明天下午",
  { customers, inventories: initialInventories },
)[0];
assert.equal(redBlankBag.color, "红色");
assert.equal(redBlankBag.inventory, "可用");
assert.equal(redBlankBag.confidence, "high");

const noColorBlankBag = parseOrderText(
  "张三服饰，30*38*10空白袋10个，普通提，自提，明天",
  { customers, inventories: initialInventories },
)[0];
assert.equal(noColorBlankBag.color, "待确认");

const compactHandle = parseOrderText(
  "白鲸自营店，35*27白袋黑提100个，单面，今天快运",
  { customers, inventories: initialInventories },
)[0];
assert.equal(compactHandle.color, "白色");
assert.equal(compactHandle.handleColor, "黑色");

const namedCustomerWithoutColor = parseOrderText(
  "红叶电商，30*38*10空白袋20个，普通提，自提，明天",
  { customers, inventories: initialInventories },
)[0];
assert.equal(namedCustomerWithoutColor.color, "待确认");

console.log("order parser checks passed");
