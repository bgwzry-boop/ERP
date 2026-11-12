// 负责人 2026-11-08：订单跟踪——按情况分类；右栏按单子种类显示工序进度。
import assert from "node:assert/strict";
import { buildOrderTimeline, orderFlowKind } from "../docs/prototypes/raw-material-roll-inventory-review/src/orderTimeline.js";

const labels = (line) => buildOrderTimeline(line).steps.map((step) => step.label).join("→");
assert.equal(labels({ orderType: "定制单" }), "下单→备料→丝印→制袋→打包→发货");
assert.equal(labels({ orderType: "印刷通货" }), "下单→备料→丝印→制袋→打包→发货");
assert.equal(labels({ orderType: "外加工" }), "下单→收卷料→丝印→计数→送货");
assert.equal(labels({ orderType: "现货有货" }), "下单→出库");
assert.equal(orderFlowKind({ orderType: "补库订单" }), "plainStock");

const sewing = buildOrderTimeline({ orderType: "定制单", status: "制袋中", latest: "11月12日" });
assert.deepEqual([sewing.position, sewing.total], [4, 6]);
assert.deepEqual(sewing.steps.map((step) => step.state), ["done", "done", "done", "current", "todo", "todo"]);
assert.equal(sewing.steps.at(-1).note, "客户要 11月12日");

const short = buildOrderTimeline({ orderType: "定制单", status: "待排产", risk: "缺 90cm 大红 约 2 卷" });
assert.equal(short.steps[1].state, "blocked");
assert.equal(short.steps[1].note, "缺 90cm 大红 约 2 卷");

const delivered = buildOrderTimeline({ orderType: "定制单", status: "已交付" });
assert.ok(delivered.done && delivered.steps.every((step) => step.state === "done"));
console.log("order track ok: per-type process steps, current / blocked step with its reason, customer due date on the last step.");
