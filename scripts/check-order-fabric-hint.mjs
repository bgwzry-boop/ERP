// 负责人 2026-11-08：开单只提醒用布、不拦下单；现货和来料加工不提醒。
import assert from "node:assert/strict";
import { buildOrderFabricHints } from "../docs/prototypes/raw-material-roll-inventory-review/src/orderFabricHint.js";

const stock = [{ id: "I1", receivedAt: "2026-11-01", rolls: [
  { id: "r1", inventoryStatus: "可用", factoryColor: "大红", widthCm: 90, gramWeightGsm: 78, weightKg: 107 },
  { id: "r2", inventoryStatus: "可用", factoryColor: "大红", widthCm: 70, gramWeightGsm: 78, weightKg: 84 },
] }];
const rows = [
  { orderType: "custom_print", size: "30*37*10", qty: 5000, color: "红" },
  { orderType: "stock", size: "45*37*10", qty: 2000, color: "本白" },
  { orderType: "external_print", qty: 0 },
];
const [hint, ...others] = buildOrderFabricHints(rows, stock);
assert.equal(others.length, 0, "stock and external lines get no fabric hint");
assert.equal(hint.ok, false);
assert.match(hint.text, /^90cm 红 约 147kg（约 1\.4 卷）；库里 1 卷，还差约 1 卷，记得订购 \/ 采购$/u);
assert.equal(buildOrderFabricHints([{ ...rows[0], qty: 50 }], stock)[0].ok, true);
assert.match(buildOrderFabricHints([rows[0]], null)[0].text, /卷料库存没读到/u);
assert.match(buildOrderFabricHints([{ orderType: "custom_print", size: "30*37", qty: 100, color: "红" }], stock)[0].text, /算不出用布/u);
console.log("order fabric hint ok: same formula as the mini-program, compares same colour and width stock, only reminds.");
