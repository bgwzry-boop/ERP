import assert from "node:assert/strict";
import { receivingReceiptTab } from "../src/domain/officeRawMaterialInboundFlow.js";
import { buildRawMaterialInboundListResponse } from "../server/services/rawMaterialInboundReadProjectionService.mjs";
import { resolveRawMaterialReceiptStage } from "../shared/rawMaterialReceiptStage.js";
import {
  annotateRawMaterialDeliveryNoteDuplicates,
  buildRawMaterialDeliveryNoteDuplicateKey,
  findRawMaterialDeliveryNoteDuplicateCandidates,
} from "../shared/rawMaterialDeliveryNoteDuplicate.js";

function receipt({ id, supplierName, deliveryNoteNo = "", receivedAt = "2026-08-12 09:00", rollCount = 1, totalWeightKg = 58, status = "已识别待复核", ...rest }) {
  return { id, supplierName, deliveryNoteNo, receivedAt, rollCount, totalWeightKg, status, rolls: rest.rolls ?? [{ id: `${id}-ROLL`, weightKg: totalWeightKg }], ...rest };
}

const xsth = ["RMI-XSTH-1", "RMI-XSTH-2", "RMI-XSTH-3", "RMI-XSTH-4"].map((id, index) => receipt({
  id,
  supplierName: index === 1 ? "新乐市鑫隆宏无纺布有限公司" : "鑫隆宏无纺布",
  deliveryNoteNo: index === 2 ? "xsth 202607000003" : "XSTH202607000003",
  receivedAt: `2026-07-${20 + index}`,
  totalWeightKg: 96.2,
}));
const datedPair = ["RMI-DATE-1", "RMI-DATE-2"].map((id) => receipt({
  id,
  supplierName: "腾胜无纺布",
  deliveryNoteNo: "202608114107",
  receivedAt: "2026-08-11",
  rollCount: 2,
  totalWeightKg: 30,
  rolls: [{ id: `${id}-A`, weightKg: 14 }, { id: `${id}-B`, weightKg: 16 }],
}));
const xt = ["RMI-XT-1", "RMI-XT-2", "RMI-XT-3"].map((id, index) => receipt({
  id,
  supplierName: index === 2 ? "宁晋县腾胜无纺布有限公司" : "腾胜无纺布",
  deliveryNoteNo: index === 1 ? "XT 2026-08-08-027" : "XT-2026-08-08-027",
  receivedAt: "2026-08-08",
  documentDirection: index === 2 ? "supplier_return" : "supplier_delivery",
  rollCount: 1,
  totalWeightKg: index === 2 ? -12 : 40 + index,
}));
const renyi = ["RMI-RY-1", "RMI-RY-2", "RMI-RY-3"].map((id, index) => receipt({
  id,
  supplierName: "人意无纺布",
  deliveryNoteNo: "",
  receivedAt: index === 2 ? "2026-08-12T01:30:00.000Z" : `2026-08-12 0${index + 8}:15`,
  rollCount: 1,
  totalWeightKg: 58,
}));
const voidedTwin = receipt({
  id: "RMI-XSTH-VOID",
  supplierName: "鑫隆宏无纺布",
  deliveryNoteNo: "XSTH202607000003",
  status: "已作废",
  totalWeightKg: 96.2,
});
const differentWeight = receipt({
  id: "RMI-RY-OTHER-WEIGHT",
  supplierName: "人意无纺布",
  deliveryNoteNo: "",
  receivedAt: "2026-08-12 18:00",
  totalWeightKg: 61.4,
});
const differentColor = receipt({
  id: "RMI-RY-OTHER-COLOR",
  supplierName: "人意无纺布",
  deliveryNoteNo: "",
  receivedAt: "2026-08-12 18:10",
  totalWeightKg: 58,
  supplierColor: "大红",
  rolls: [{ id: "RMI-RY-OTHER-COLOR-ROLL", weightKg: 58, supplierColor: "大红" }],
});
const renyiWithColor = renyi.map((item) => ({ ...item, supplierColor: "本白" }));
const unique = receipt({
  id: "RMI-UNIQUE",
  supplierName: "宏尚无纺布",
  deliveryNoteNo: "HS-UNIQUE-1",
  receivedAt: "2026-08-01",
  rollCount: 3,
  totalWeightKg: 180,
});

const inbounds = [
  ...xsth,
  ...datedPair,
  ...xt,
  ...renyiWithColor,
  voidedTwin,
  differentWeight,
  differentColor,
  unique,
  receipt({
    id: "RMI-LOOKALIKE",
    supplierName: "宏尚无纺布",
    deliveryNoteNo: "HS-UNIQUE-2",
    receivedAt: "2026-08-01",
    rollCount: 3,
    totalWeightKg: 180,
  }),
];
const annotated = annotateRawMaterialDeliveryNoteDuplicates(inbounds);
const summary = (id) => annotated.find((item) => item.id === id).duplicateSummary;

for (const id of ["RMI-XSTH-1", "RMI-XSTH-2", "RMI-XSTH-3", "RMI-XSTH-4"]) {
  const row = annotated.find((item) => item.id === id);
  assert.equal(summary(id), "单号相同，另有 3 张", `${id} must flag the other three XSTH202607000003 receipts`);
  assert.equal(row.duplicate, undefined);
  assert.equal(receivingReceiptTab(row), "待核对", "a duplicate flag stays in the 查重结果 column and does not move the waiting list");
  assert.equal(resolveRawMaterialReceiptStage(row), "待核对");
}
assert.deepEqual(
  findRawMaterialDeliveryNoteDuplicateCandidates(inbounds, xsth[0]).map((item) => item.id).sort(),
  ["RMI-XSTH-2", "RMI-XSTH-3", "RMI-XSTH-4"],
  "a voided copy of the same ticket must not count",
);
for (const id of ["RMI-DATE-1", "RMI-DATE-2"]) {
  assert.equal(summary(id), "单号相同，另有 1 张");
}
for (const id of ["RMI-XT-1", "RMI-XT-2", "RMI-XT-3"]) {
  assert.equal(summary(id), "单号相同，另有 2 张", "ticket collisions stay visible across spacing, supplier text, weight and return direction");
}
for (const id of ["RMI-RY-1", "RMI-RY-2", "RMI-RY-3"]) {
  assert.equal(summary(id), "供应商、日期和重量相同，另有 2 张", `${id} must flag the same-day 人意 1卷 58.0kg receipts`);
}
assert.equal(summary("RMI-RY-OTHER-WEIGHT"), "");
assert.equal(summary("RMI-RY-OTHER-COLOR"), "");
assert.equal(summary("RMI-LOOKALIKE"), "", "different ticket numbers stay distinct even when supplier, date and weight match");
assert.equal(summary("RMI-UNIQUE"), "");
assert.equal(summary("RMI-XSTH-VOID"), "");
assert.equal(
  buildRawMaterialDeliveryNoteDuplicateKey({ supplierName: "另一家无纺布", deliveryNoteNo: "XS-2026-08-14-573" }),
  buildRawMaterialDeliveryNoteDuplicateKey({ supplierName: "待复核供应商", deliveryNoteNo: "XS 2026-08-14-573" }),
  "ticket identity ignores supplier text, spaces and dashes",
);

const listed = buildRawMaterialInboundListResponse(inbounds, { keyword: "xsth", page: 1, pageSize: 1 });
assert.equal(listed.total, 4, "voided ticket copies stay out of the operational list");
assert.equal(listed.items[0].duplicateSummary, "单号相同，另有 3 张", "a paged row still reports matches that are not on the same page");
assert.equal(buildRawMaterialInboundListResponse(inbounds, { status: "已作废" }).items.length, 0);

const headerOnly = receipt({
  id: "RMI-HEADER-1",
  supplierName: "人意无纺布",
  deliveryNoteNo: "",
  receivedAt: "2026-08-12",
  totalWeightKg: 58,
  rolls: [],
});
const rolled = receipt({
  id: "RMI-HEADER-2",
  supplierName: "人意无纺布",
  deliveryNoteNo: "",
  receivedAt: "2026-08-12 16:40",
  totalWeightKg: 58,
});
assert.equal(
  annotateRawMaterialDeliveryNoteDuplicates([headerOnly, rolled])[0].duplicateSummary,
  "供应商、日期和重量相同，另有 1 张",
  "a header total and one physical roll of the same weight are the same fingerprint",
);

console.log("raw-material delivery-note duplicate checks passed");
