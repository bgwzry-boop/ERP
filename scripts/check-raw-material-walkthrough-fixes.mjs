// 负责人 2026-11-08 原料走查：已入库的单不能显示成「待确认」；一单多种宽幅要全部列出；
// 核对人显示名字；领料 / 消耗的服务器提示用中文。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getOperationalStateTagValue } from "../src/shared/labels.js";
import { buildReceiptMaterialPresentation } from "../docs/prototypes/raw-material-roll-inventory-review/src/receipt-presentation.js";
import { formatRawMaterialLabelVerification } from "../src/features/raw-materials/rawMaterialInboundWorkflow.js";

for (const [status, tone] of [["已贴标/可用库存", "done"], ["部分贴标", "pending"], ["部分领料/机边", "running"], ["部分消耗确认", "running"], ["已消耗确认", "done"]]) {
  assert.equal(getOperationalStateTagValue(status), tone, status);
}

const mixed = buildReceiptMaterialPresentation({ widthCm: 70, specDisplay: "78克 × 70cm × 1500米", rolls: [{ widthCm: 70 }, { widthCm: 90 }, { widthCm: 80 }, { widthCm: 70 }] });
assert.equal(mixed.widthLabel, "70 / 80 / 90cm");
assert.equal(buildReceiptMaterialPresentation({ widthCm: 70, rolls: [{ widthCm: 70 }, { widthCm: 70 }] }).widthLabel, "70cm");

const verified = formatRawMaterialLabelVerification({ labelVersion: 1, labelVerification: { matchResult: "matched", labelVersion: 1, verifiedBy: "管理A", verifiedByUserId: "U-MANAGER-A" } });
assert.equal(verified, "实物一致 · 标签V1 · 管理A");

const traceability = readFileSync(new URL("../server/rawMaterialTraceabilityActionService.mjs", import.meta.url), "utf8");
assert.doesNotMatch(traceability, /new Error\("[A-Za-z]/u, "领料 / 消耗的提示要用中文");

const inventory = readFileSync(new URL("../docs/prototypes/raw-material-roll-inventory-review/src/App.jsx", import.meta.url), "utf8");
assert.doesNotMatch(inventory, /"原材料仓库", "1号机边", "2号机边", "余料区"/u, "库位筛选按库里实际的库位生成");
assert.match(inventory, /formatRawMaterialColorDisplay\(factoryColor, supplierColor\)/u, "库存颜色按「我厂颜色（送货颜色）」显示");

const dialogCss = readFileSync(new URL("../docs/prototypes/raw-material-roll-inventory-review/src/raw-material-stock-operations.css", import.meta.url), "utf8");
assert.match(dialogCss, /\.raw-stock-operations-dialog \[hidden\] \{ display: none !important; \}/u);
console.log("raw-material walkthrough fixes ok: inbound statuses labelled, mixed widths listed, verifier name shown, Chinese issue/consumption messages, real location/color filters, hidden dialog buttons stay hidden.");
