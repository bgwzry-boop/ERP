import assert from "node:assert/strict";

import { customers, initialInventories } from "../src/data/fixtures.js";
import { editableColors } from "../src/domain/officeRules.js";
import { recognizeOrderConversation } from "../src/lib/orderConversationRecognition.js";

const shorthandOptions = { customers: [...customers, { id: "TEST-HUANG", name: "黄松" }], inventories: initialInventories };
for (const text of ["3037 红 500 个", "3037 红 500 个 黄松"]) {
  const result = recognizeOrderConversation(text, shorthandOptions);
  assert.equal(result.sourceMessages[0].intentType, "explicit_order", text);
  assert.equal(result.orderRows.length, 1);
  const [row] = result.orderRows;
  assert.equal(row.size, "30*37*10");
  assert.equal(row.color, "红色");
  assert.equal(row.qty, 500);
  assert.equal(row.source, text);
  assert.equal(row.customerId, text.includes("黄松") ? "TEST-HUANG" : "");
}
for (const [text, expected] of [
  ["3037 红500 黑300 黄松", [["红色", 500], ["黑色", 300]]],
  ["3037 红500 黑色 黄松", [["红色", 500], ["黑色", 0]]],
  ["3037 黄500个 黄松", [["黄色", 500]]],
  ["3037 500个 黄松", [["待确认", 500]]],
  ["3037 红500个 黄松 2026-11-10自提", [["红色", 500]]],
]) {
  const result = recognizeOrderConversation(text, shorthandOptions);
  assert.deepEqual(result.orderRows.map(({ color, qty }) => [color, qty]), expected, text);
  assert.ok(result.orderRows.every(row => row.customerId === "TEST-HUANG"));
}
for (const text of ["3037", "3037 红", "3037 个", "2026-11-10 500个", "13830375000 红500个", "订单号3037 红500个", "电话3037 红500个", "订单号：3037 红500个", "电话：3037 红500个",
  "3037 红 13830375000", "3037 红13830375000个", "单号ABC3037 红500个", "3037 红500个 取消", "取消3037红500个", "3037 红500个 不要了", "3037 红500个 查库存", "3037 红500个 留一下",
  "3037 红2026/11/10", "3037 红11月10日", "3037 红2026.11.10", "3037 红11/10", "3037 红500个 库存还有多少"]) {
  assert.equal(recognizeOrderConversation(text, shorthandOptions).orderRows.length, 0, text);
}
const similarCustomers = [
  { id: "HS", name: "东莞市黄松包装有限公司", shortName: "黄松" },
  { id: "HSL", name: "黄松林" },
];
// 2026-11-08 负责人规则：不做主观判断。黄松 / 黄松林 同时存在时两者都算相关，
// 一律不自动认定，交给录入人选择；只有唯一相关客户时才自动带出。
for (const name of ["黄松", "黄松林"]) {
  const [row] = recognizeOrderConversation(`3037 500个 ${name}`, { customers: similarCustomers }).orderRows;
  assert.equal(row.customerId, "", `${name} 存在相似客户时不得自动认定`);
  assert.equal(row.color, "待确认");
}
const [onlyRelated] = recognizeOrderConversation("3037 500个 黄松", { customers: [similarCustomers[0]] }).orderRows;
assert.equal(onlyRelated.customerId, "HS", "唯一相关客户时自动带出");
assert.equal(onlyRelated.color, "待确认");
const ambiguousCustomers = [...similarCustomers, { id: "HS2", name: "黄松商贸", shortName: "黄松" }];
const [ambiguous] = recognizeOrderConversation("3037 500个 黄松", { customers: ambiguousCustomers }).orderRows;
assert.equal(ambiguous.customerId, "");
assert.equal(ambiguous.color, "待确认");
const [selectedCustomer] = recognizeOrderConversation("3037 红500个 黄松", { customers: similarCustomers, customerId: "HSL" }).orderRows;
assert.equal(selectedCustomer.customerId, "HSL", "the office's explicit customer selection stays authoritative");
for (const customer of [
  { id: "DISABLED", name: "黄松", status: "停用" },
  { id: "DISABLED", name: "黄松", enabled: false },
  { id: "DISABLED", name: "黄松包装有限公司", shortName: "黄松", status: "停用" },
]) {
  const [row] = recognizeOrderConversation("3037 500个 黄松", { customers: [customer] }).orderRows;
  assert.equal(row.customerId, "", "a disabled customer cannot be restored by legacy aliases");
  assert.equal(row.color, "待确认", "a disabled customer's name is still a name");
}

for (const [text, intent] of [
  ["3037 红500个有吗", "inventory_inquiry"],
  ["3037 红有的话给我留500个", "temporary_hold"],
  ["3037 红500个 整单取消", "shortage_cancellation"],
]) {
  const result = recognizeOrderConversation(text, shorthandOptions);
  assert.equal(result.sourceMessages[0].intentType, intent, text);
  assert.equal(result.orderRows.length, 0);
}

const datedPickup = recognizeOrderConversation("王五包装 30*38*10 红色40个 黑色20个 白色 2026-11-10自提", { customers, inventories: initialInventories });
assert.deepEqual(datedPickup.orderRows.map(({ color, qty, latest, fulfillment }) => [color, qty, latest, fulfillment]), [
  ["红色", 40, "2026-11-10", "自提"],
  ["黑色", 20, "2026-11-10", "自提"],
  ["白色", 0, "2026-11-10", "自提"],
], "multi-colour recognition keeps the calendar date and leaves the white quantity unfilled");
assert.equal(datedPickup.orderRows[2].confidence, "low");
assert.ok(datedPickup.orderRows[2].reviewReasons.includes("白色数量待确认"));

for (const [message, expected] of [
  ["30*38*10 红色100个、黑色 送货", [["红色", 100], ["黑色", 0]]],
  ["覆膜袋40*30*10 橘色100个 宝蓝色 送货", [["橘色", 100], ["宝蓝色", 0]]],
  ["30*38*10 红色、黑色 共100个 送货", [["红色", 0], ["黑色", 0]]],
  ["30*38*10 红色100个、黑色 送货，印刷颜色：蓝色", [["红色", 100], ["黑色", 0]]],
  ["30*38*10 红色100个、黑色 送货，提手颜色：蓝色", [["红色", 100], ["黑色", 0]]],
]) {
  const result = recognizeOrderConversation(message, { customers, inventories: initialInventories });
  assert.deepEqual(result.orderRows.map(({ color, qty }) => [color, qty]), expected, message);
  for (const row of result.orderRows.filter(row => !row.qty)) {
    assert.equal(row.confidence, "low");
    assert.ok(row.reviewReasons.includes(`${row.color}数量待确认`));
  }
}

for (const [message, expected] of [
  ["30*38*10 红色100个，单面黑色印", [["红色", 100, "黑色", ""]]],
  ["30*38*10 红色100个，黑色印刷", [["红色", 100, "黑色", ""]]],
  ["30*38*10 红色100个，提手黑色", [["红色", 100, "非印刷", "黑色"]]],
  ["30*38*10 白色印黑色100个", [["白色", 100, "黑色", ""]]],
  ["30*38*10 红色100个、绿色，单面黑色印", [["红色", 100, "黑色", ""], ["绿色", 0, "黑色", ""]]],
]) {
  const result = recognizeOrderConversation(message, { customers, inventories: initialInventories });
  assert.deepEqual(result.orderRows.map(({ color, qty, printColor, handleColor }) => [color, qty, printColor, handleColor]), expected, message);
}

for (const color of ["橘色", "宝蓝色", "焦糖色", "米色", "咖色", "米白色", "安哥拉红"]) {
  assert(editableColors.includes(color), `recognized business color ${color} must remain selectable in order entry`);
}

const messages = [
  {
    id: "MSG-AM-ORDER",
    conversationId: "GROUP-STOCK-01",
    customerId: "C001",
    sender: "张经理",
    sentAt: "2026-07-12 09:02",
    text: "覆膜袋 40*30 橘色100 宝蓝200",
  },
  {
    id: "MSG-INQUIRY",
    conversationId: "GROUP-STOCK-01",
    customerId: "C001",
    sender: "张经理",
    sentAt: "2026-07-12 10:11",
    text: "35*27 焦糖米提100个有吗？",
  },
  {
    id: "MSG-OFFICE-REPLY",
    conversationId: "GROUP-STOCK-01",
    sender: "办公室A",
    senderRole: "office",
    sentAt: "2026-07-12 10:12",
    text: "有",
  },
  {
    id: "MSG-CUSTOMER-CONFIRM",
    conversationId: "GROUP-STOCK-01",
    customerId: "C001",
    sender: "张经理",
    sentAt: "2026-07-12 10:14",
    text: "要",
  },
  {
    id: "MSG-PM-ORDER",
    conversationId: "GROUP-STOCK-01",
    customerId: "C001",
    sender: "张经理",
    sentAt: "2026-07-12 15:03",
    text: "40+30 米白咖提300个",
  },
  {
    id: "MSG-PM-ADD",
    conversationId: "GROUP-STOCK-01",
    customerId: "C001",
    sender: "张经理",
    sentAt: "2026-07-12 15:04",
    text: "再加 40*30 安哥拉红安哥拉红提手100个",
  },
  {
    id: "MSG-HOLD",
    conversationId: "GROUP-STOCK-01",
    customerId: "C001",
    sender: "张经理",
    sentAt: "2026-07-12 16:20",
    text: "35*27白色有的话给我留50个",
  },
  {
    id: "MSG-DUPLICATE",
    conversationId: "GROUP-STOCK-01",
    customerId: "C001",
    sender: "张经理",
    sentAt: "2026-07-12 16:21",
    text: "40+30 米白咖提300个",
  },
  {
    id: "MSG-SHORTAGE-CANCEL",
    conversationId: "GROUP-STOCK-01",
    customerId: "C001",
    sender: "张经理",
    sentAt: "2026-07-12 16:30",
    text: "没货的那两款不要了，其他继续",
  },
];

const recognition = recognizeOrderConversation(messages, {
  customers,
  inventories: initialInventories,
  currentDraftStatus: "待审核",
  now: () => new Date("2026-07-12T08:00:00.000Z"),
});

assert.deepEqual(recognition.sourceMessages.map((item) => item.id), messages.map((item) => item.id));
assert.equal(recognition.summary.messageCount, 9);
assert.equal(recognition.summary.originalOrderCount, 2, "afternoon explicit block must be a new original order");
assert.equal(recognition.summary.orderRowCount, 4, "inquiry, reply, hold, duplicate, and cancellation must not become order rows");
assert.equal(recognition.summary.inventoryInquiryCount, 1);
assert.equal(recognition.summary.temporaryHoldCount, 1);
assert.equal(recognition.summary.duplicateCandidateCount, 1);

const laminatedRows = recognition.orderRows.filter((item) => item.sourceMessageId === "MSG-AM-ORDER");
assert.deepEqual(laminatedRows.map((item) => [item.color, item.qty]), [["橘色", 100], ["宝蓝色", 200]]);
assert(laminatedRows.every((item) => item.style === "覆膜袋" && item.print === "否"));

const inquiry = recognition.nonOrderIntents.find((item) => item.id === "MSG-INQUIRY");
assert.equal(inquiry.status, "询库存-待客户确认");
assert.equal(inquiry.reservesInventory, false);
assert.equal(recognition.nonOrderIntents.find((item) => item.id === "MSG-OFFICE-REPLY").advancesCustomerIntent, false);
assert.equal(recognition.nonOrderIntents.find((item) => item.id === "MSG-CUSTOMER-CONFIRM").intentType, "inventory_confirmation");

const afternoon = recognition.orderRows.find((item) => item.sourceMessageId === "MSG-PM-ORDER");
assert.equal(afternoon.color, "米白色");
assert.equal(afternoon.handleColor, "咖色");
assert.equal(afternoon.size, "40*30*10");
assert.equal(afternoon.dimensionEvidence.requiresConfirmation, true);
assert.equal(afternoon.fieldReviews[0].field, "size");
assert.equal(afternoon.fieldReviews[0].status, "pending");
assert.equal(afternoon.fieldReviews[0].suggestedValue, "40*30*10");
assert.equal(afternoon.confidence, "low");
assert.equal(afternoon.appendDecision, "new_original_order");

const appended = recognition.orderRows.find((item) => item.sourceMessageId === "MSG-PM-ADD");
assert.equal(appended.color, "安哥拉红");
assert.equal(appended.handleColor, "安哥拉红");
assert.equal(appended.originalOrderGroupId, afternoon.originalOrderGroupId);
assert.equal(appended.appendDecision, "append_to_unconfirmed_draft");

const hold = recognition.temporaryHolds[0];
assert.equal(hold.expiresAt, "2026-07-12T19:30:00+08:00");
assert.equal(hold.requiresExpiryReview, false);
assert.equal(hold.expiryRule, "same_day_1930");
assert.equal(hold.reservesInventory, "pending_authorized_hold_creation");

const afterCutoffRecognition = recognizeOrderConversation([{
  id: "MSG-HOLD-AFTER-CUTOFF",
  conversationId: "GROUP-STOCK-AFTER-CUTOFF",
  customerId: "C001",
  sender: "张经理",
  sentAt: "2026-07-12 20:05",
  text: "35*27白色有的话给我留20个",
}], { customers, inventories: initialInventories, now: () => new Date("2026-07-12T12:05:00.000Z") });
const afterCutoffHold = afterCutoffRecognition.temporaryHolds[0];
assert.equal(afterCutoffHold.expiresAt, "2026-07-12T19:30:00+08:00");
assert.equal(afterCutoffHold.requiresExpiryReview, true);
assert.equal(afterCutoffHold.expiryRule, "manual_future_expiry_required_after_1930");
assert.equal(afterCutoffRecognition.riskHints.some((item) => item.riskType === "temporary_hold_expiry"), true);
const shortageCancellation = recognition.nonOrderIntents.find((item) => item.id === "MSG-SHORTAGE-CANCEL");
assert.equal(shortageCancellation.cancellationScope, "shortage_lines_only");
assert.equal(shortageCancellation.status, "库存不足取消-已关联草稿明细");
assert.equal(shortageCancellation.targetBasis, "current_inventory_shortage");
assert.deepEqual(shortageCancellation.relatedDraftLineIds.sort(), [afternoon.id, appended.id].sort());
assert.equal(afternoon.cancellationStatus, "库存不足取消");
assert.equal(appended.excludedFromConfirmation, true);
assert.equal(recognition.summary.cancelledDraftLineCount, 2);
assert.equal(recognition.sourceMessages.find((item) => item.id === "MSG-DUPLICATE").duplicateOf, "MSG-PM-ORDER");

const unresolvedCancellation = recognizeOrderConversation([{
  id: "MSG-CANCEL-NO-ORDER",
  conversationId: "GROUP-STOCK-02",
  customerId: "C001",
  text: "没货的不要了",
}], { customers, inventories: initialInventories });
assert.equal(unresolvedCancellation.nonOrderIntents[0].requiresReview, true);
assert.equal(unresolvedCancellation.riskHints[0].riskType, "shortage_cancellation_target");

const confirmedDraftRecognition = recognizeOrderConversation(messages.slice(0, 6), {
  customers,
  inventories: initialInventories,
  currentDraftStatus: "已生成正式订单",
});
assert.equal(confirmedDraftRecognition.summary.originalOrderCount, 3);
assert.equal(
  confirmedDraftRecognition.orderRows.find((item) => item.sourceMessageId === "MSG-PM-ADD").appendDecision,
  "new_original_order_after_confirmation",
);

const sourceAliasRecognition = recognizeOrderConversation([{
  id: "MSG-SOURCE-ALIAS",
  conversationId: "GROUP-STOCK-01",
  customerId: "C001",
  text: "30*38 蜜糖奶提100个",
}], {
  customers,
  inventories: initialInventories,
  standardColors: [
    { id: "SC-HONEY", name: "蜜糖色" },
    { id: "SC-MILK", name: "奶色" },
  ],
  colorAliases: [
    { alias: "蜜糖", standardColorId: "SC-HONEY", sourceType: "customer", sourceId: "C001", enabled: true },
    { alias: "奶", standardColorId: "SC-MILK", sourceType: "customer", sourceId: "C001", enabled: true },
  ],
});
assert.equal(sourceAliasRecognition.orderRows[0].color, "蜜糖色");
assert.equal(sourceAliasRecognition.orderRows[0].handleColor, "奶色");
assert.equal(sourceAliasRecognition.orderRows[0].aliasEvidence.status, "confirmed_source_alias");
assert(!sourceAliasRecognition.orderRows[0].reviewReasons.includes("颜色/提手短写需确认"));

const pastedConversation = recognizeOrderConversation(
  "[09:10] 张经理：30*38红色100个有吗？\n[09:11] 办公室A：有",
  { customers, inventories: initialInventories },
);
assert.equal(pastedConversation.nonOrderIntents[0].intentType, "inventory_inquiry");
assert.equal(pastedConversation.nonOrderIntents[1].intentType, "merchant_reply");
assert.equal(pastedConversation.summary.orderRowCount, 0);

console.log("Order conversation recognition checks passed: message traceability, intent isolation, aliases, holds, duplicate control, and draft grouping are covered.");
