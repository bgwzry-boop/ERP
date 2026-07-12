import assert from "node:assert/strict";

import { customers, initialInventories } from "../src/data/fixtures.js";
import { editableColors } from "../src/domain/officeRules.js";
import { recognizeOrderConversation } from "../src/lib/orderConversationRecognition.js";

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
assert.equal(afternoon.confidence, "low");
assert.equal(afternoon.appendDecision, "new_original_order");

const appended = recognition.orderRows.find((item) => item.sourceMessageId === "MSG-PM-ADD");
assert.equal(appended.color, "安哥拉红");
assert.equal(appended.handleColor, "安哥拉红");
assert.equal(appended.originalOrderGroupId, afternoon.originalOrderGroupId);
assert.equal(appended.appendDecision, "append_to_unconfirmed_draft");

const hold = recognition.temporaryHolds[0];
assert.equal(hold.expiresAt, "2026-07-12T19:30:00+08:00");
assert.equal(hold.reservesInventory, "pending_authorized_hold_creation");
assert.equal(recognition.nonOrderIntents.find((item) => item.id === "MSG-SHORTAGE-CANCEL").cancellationScope, "shortage_lines_only");
assert.equal(recognition.sourceMessages.find((item) => item.id === "MSG-DUPLICATE").duplicateOf, "MSG-PM-ORDER");

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
