import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInventoryWidthOptions,
  compactRollCode,
  compactSupplierName,
  resolveInventoryRollStatus,
  resolveRollSpecification,
  resolveRollWidth,
  sortInventoryRollsByWidth,
} from "../src/roll-inventory-presentation.js";

test("formal roll inventory resolves authoritative width before presentation", () => {
  assert.deepEqual(resolveRollWidth({}, { spec: "78*70*2000", widthCm: 70 }), { widthCm: 70, label: "70cm" });
  assert.deepEqual(resolveRollWidth({}, { materialCategory: "提手条", spec: "65*5" }), { widthCm: 5, label: "5cm 把条" });
  assert.deepEqual(resolveRollWidth({ widthCm: 70 }, { materialCategory: "提手条", spec: "条" }), { widthCm: 5, label: "5cm 把条" });
  assert.deepEqual(resolveRollWidth({}, { spec: "特殊尺寸" }), { widthCm: 0, label: "宽幅待确认" });
  assert.deepEqual(resolveRollSpecification({}, { materialCategory: "提手条", spec: "条" }), {
    widthCm: 5,
    widthLabel: "5cm 把条",
    gramWeightGsm: 65,
    gramWeightLabel: "65克",
    fullLabel: "65克 × 5cm",
    isHandleStrip: true,
  });
  assert.deepEqual(resolveRollSpecification({}, { materialType: "无纺布", spec: "78*70*2000" }), {
    widthCm: 70,
    widthLabel: "70cm",
    gramWeightGsm: 78,
    gramWeightLabel: "78克",
    fullLabel: "78克 × 70cm × 2000米",
    isHandleStrip: false,
  });
});

test("formal roll inventory sorts by numeric width and leaves unknown widths last", () => {
  const rows = [
    { id: "RM-UNKNOWN", widthCm: 0, color: "本白" },
    { id: "RM-90", widthCm: 90, color: "大红" },
    { id: "RM-70-B", widthCm: 70, color: "墨绿" },
    { id: "RM-70-A", widthCm: 70, color: "本白" },
    { id: "RM-5", widthCm: 5, color: "大红" },
  ];

  assert.deepEqual(sortInventoryRollsByWidth(rows).map((row) => row.id), [
    "RM-5", "RM-70-A", "RM-70-B", "RM-90", "RM-UNKNOWN",
  ]);
});

test("width filters follow the same warehouse ordering and roll codes stay traceable", () => {
  const rows = [
    { id: "RM-UNKNOWN", width: "宽幅待确认", widthCm: 0 },
    { id: "RM-90", width: "90cm", widthCm: 90 },
    { id: "RM-5", width: "5cm 把条", widthCm: 5 },
    { id: "RM-70", width: "70cm", widthCm: 70 },
  ];

  assert.deepEqual(buildInventoryWidthOptions(rows), ["全部宽幅", "5cm 把条", "70cm", "90cm", "宽幅待确认"]);
  assert.equal(compactRollCode("RM-OCR-D8CBC5812426-01"), "RM-…8CBC5812426-01");
  assert.equal(compactRollCode("RM-240704-003-01"), "RM-240704-003-01");
});

test("roll list uses compact supplier aliases without changing authoritative legal names", () => {
  assert.equal(compactSupplierName("宁晋县腾胜无纺布有限公司"), "腾胜无纺布");
  assert.equal(compactSupplierName("宁晋县达翔塑料制品有限公司"), "北陈无纺布");
  assert.equal(compactSupplierName("北陈辅料"), "北陈无纺布");
  assert.equal(compactSupplierName("河北宏尚无纺布有限公司"), "宏尚无纺布");
  assert.equal(compactSupplierName("河北某某包装制品有限公司"), "某某包装制品");
  assert.equal(compactSupplierName(""), "供应商待确认");
});

test("unreviewed OCR drafts never masquerade as leftover inventory", () => {
  assert.equal(resolveInventoryRollStatus(
    { status: "已识别待复核" },
    { inventoryStatus: "不可用", labelStatus: "待人工复核" },
  ), "");
  assert.equal(resolveInventoryRollStatus(
    { status: "余料待复核" },
    { inventoryStatus: "余料待复核", labelStatus: "待复核" },
  ), "余料待复核");
  assert.equal(resolveInventoryRollStatus({}, { inventoryStatus: "可用" }), "可用");
  assert.equal(resolveInventoryRollStatus({}, { inventoryStatus: "不可用", machineId: "PRINT-01" }), "机边领用");
});
