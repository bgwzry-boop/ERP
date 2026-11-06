import assert from "node:assert/strict";

import { customers, initialInventories, sampleText } from "../src/data/fixtures.js";
import { parseOrderText } from "../src/lib/orderParser.js";

assert.deepEqual(parseOrderText(""), [], "empty order input must not inject demo fixture rows");

const redBlankBag = parseOrderText(
  "张三服饰，30*38*10红色空白袋10个，普通提，自提，明天下午",
  { customers, inventories: initialInventories },
)[0];
assert.equal(redBlankBag.color, "红色");
assert.equal(redBlankBag.inventory, "可用");
assert.equal(redBlankBag.confidence, "high");

for (const instruction of ["不印刷", "不用印字", "不要印图案", "不需要印刷", "无需印刷", "非印刷", "不印双面", "不要双面印"]) {
  const [blank] = parseOrderText(`王五包装 43*31*12 红色袋30个，${instruction}，自提`, { customers });
  assert.equal(blank.orderType, "custom_special", instruction);
  assert.equal(blank.print, "否", instruction);
  assert.equal(blank.printColor, "非印刷", instruction);
  assert.equal(blank.printSide, "非印刷", instruction);
}

const [standardBlank] = parseOrderText("张三服饰 25x32x10 红袋，不印刷，500 个", { customers });
assert.equal(standardBlank.orderType, "stock");
assert.equal(standardBlank.print, "否");

for (const instruction of ["不要双面，单面印黑色", "不印双面，单面印黑色"]) {
  const [singleSide] = parseOrderText(`王五包装 30*38*10 红色袋60个，${instruction}，送货`, { customers });
  assert.equal(singleSide.orderType, "custom_print", instruction);
  assert.equal(singleSide.print, "是", instruction);
  assert.equal(singleSide.printSide, "单面", instruction);
  assert.equal(singleSide.printColor, "黑色", instruction);
}

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

const smallTemporaryHold = parseOrderText(
  "张三服饰 30*38 红色有的话给我留5个",
  { customers, inventories: initialInventories },
)[0];
assert.equal(smallTemporaryHold.qty, 5);
assert.equal(smallTemporaryHold.color, "红色");

const colorBeforeDimension = parseOrderText(
  "张三服饰 红色30*38 空白袋5个",
  { customers, inventories: initialInventories },
)[0];
assert.equal(colorBeforeDimension.qty, 5, "a dimension after color must not be parsed as quantity");

const parsePickup = suffix => parseOrderText(`王五包装 30*38*10 红色 40个 ${suffix}`, { customers })[0];
const pickup = parsePickup("2026-11-10自提");
assert.equal(pickup.latest, "2026-11-10");
assert.equal(pickup.fulfillment, "自提");
assert.equal(pickup.qty, 40);
assert.equal(parsePickup("2028-02-29自提").latest, "2028-02-29");
assert.equal(parsePickup("2026-02-30自提").latest, "待确认", "an invalid calendar day must not roll over into March");
assert.equal(parsePickup("2026-11-10或2026-11-11自提").latest, "待确认");
assert.equal(parsePickup("订单号：2026-11-10 自提").latest, "待确认");
assert.equal(parsePickup("订单号：2026-11-08 2026-11-10自提").latest, "2026-11-10");
assert.equal(parsePickup("ORD-2026-11-10 自提").latest, "待确认");
assert.equal(parsePickup("2026-11-10-001 自提").latest, "待确认");
assert.equal(parsePickup("明天自提").latest, "明天");
for (const [message, expected] of [
  ["周五 后天 明天 今天自提 下午", "今天下午"],
  ["周五 后天 明天 今天自提", "今天"],
  ["周五 后天 明天自提", "明天"],
  ["周五 后天自提", "后天"],
  ["周五自提", "周五"],
  ["今天 2026-11-10 2026-11-10自提", "2026-11-10"],
]) {
  assert.equal(parsePickup(message).latest, expected, message);
}
const missingQuantity = parseOrderText("王五包装 30*38*10 红色 2026-11-10自提", { customers })[0];
assert.equal(missingQuantity.latest, "2026-11-10");
assert.equal(missingQuantity.qty, 0, "the date's year cannot fill a missing quantity");

const singleCustomerSample = parseOrderText(sampleText, { customers, inventories: initialInventories });
assert.equal(singleCustomerSample.length, 6);
assert.deepEqual([...new Set(singleCustomerSample.map((row) => row.customerId))], ["C001"]);
assert.equal(singleCustomerSample.reduce((sum, row) => sum + row.qty, 0), 7300);
assert.equal(new Set(singleCustomerSample.map((row) => `${row.fulfillment}-${row.latest}`)).size, 4);

console.log("order parser checks passed");
