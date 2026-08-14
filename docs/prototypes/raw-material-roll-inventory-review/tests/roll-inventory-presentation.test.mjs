import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInventoryWidthOptions,
  compactRollCode,
  resolveRollWidth,
  sortInventoryRollsByWidth,
} from "../src/roll-inventory-presentation.js";

test("formal roll inventory resolves authoritative width before presentation", () => {
  assert.deepEqual(resolveRollWidth({}, { spec: "78*70*2000", widthCm: 70 }), { widthCm: 70, label: "70cm" });
  assert.deepEqual(resolveRollWidth({}, { materialCategory: "提手条", spec: "78*5" }), { widthCm: 5, label: "5cm 提手条" });
  assert.deepEqual(resolveRollWidth({ widthCm: 70 }, { materialCategory: "提手条", spec: "条" }), { widthCm: 5, label: "5cm 提手条" });
  assert.deepEqual(resolveRollWidth({}, { spec: "特殊尺寸" }), { widthCm: 0, label: "宽幅待确认" });
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
    { id: "RM-5", width: "5cm 提手条", widthCm: 5 },
    { id: "RM-70", width: "70cm", widthCm: 70 },
  ];

  assert.deepEqual(buildInventoryWidthOptions(rows), ["全部宽幅", "5cm 提手条", "70cm", "90cm", "宽幅待确认"]);
  assert.equal(compactRollCode("RM-OCR-D8CBC5812426-01"), "RM-…8CBC5812426-01");
  assert.equal(compactRollCode("RM-240704-003-01"), "RM-240704-003-01");
});
