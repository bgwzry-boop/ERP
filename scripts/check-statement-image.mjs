// 负责人 2026-11-08：对账单画成一张图发到客户群。
import assert from "node:assert/strict";
import { buildStatementImageModel } from "../docs/prototypes/raw-material-roll-inventory-review/src/statementImage.js";

const model = buildStatementImageModel({
  customerName: "松源百货商行", period: "2026-10",
  receivable: 2150, received: 0, currentUnpaid: 2150, historicalDebt: 300,
  statementLines: [{ orderNo: "SH-1003-02", productName: "无纺布袋", goodsSpec: "30*37*10 红", deliveredQty: 5000, chargeableQty: 5000, finalAmount: 2150 }],
}, { now: new Date("2026-11-01T02:00:00Z") });
assert.equal(model.title, "松源百货商行 · 2026-10 对账单");
assert.deepEqual(model.lines, [{ order: "SH-1003-02", spec: "30*37*10 红", qty: "5000 / 5000", amount: "2150.00" }]);
assert.deepEqual(model.summary.map(([label]) => label), ["本期应收", "本期已收", "本期未收", "历史欠款"]);
assert.equal(model.footer, "2026-11-01 生成 · 请核对，有疑问在群里说");
assert.deepEqual(buildStatementImageModel({ receivable: 1, received: 1, currentUnpaid: 0 }).summary.map(([label]) => label), ["本期应收", "本期已收", "本期未收"]);
console.log("statement image ok: customer + period title, one line per delivery, receivable / received / unpaid (+ rounding and history when present).");
