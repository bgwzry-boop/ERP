import assert from "node:assert/strict";
import {
  fulfillmentMethodLabel,
  getFulfillmentMethodLabel,
  getFulfillmentMethodValue,
  labelOf,
} from "../src/shared/labels.js";

assert.deepEqual(fulfillmentMethodLabel, {
  pickup: "自提",
  delivery: "送货",
  express_ltl: "快递快运",
});
assert.equal(labelOf(fulfillmentMethodLabel, "delivery"), "送货");
assert.equal(labelOf(fulfillmentMethodLabel, "unknown"), "待确认");
assert.equal(getFulfillmentMethodLabel("pickup"), "自提");
assert.equal(getFulfillmentMethodLabel("快递快运"), "快递快运");
assert.equal(getFulfillmentMethodValue("送货"), "delivery");
assert.equal(getFulfillmentMethodValue("express_ltl"), "express_ltl");

console.log("Shared label check passed: fulfillment values map between API enums and Chinese UI labels.");
