import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("phone viewport reuses the formal ERP mobile raw-material flow", async () => {
  const [mainSource, mobileEntrySource, formalPagesSource, formalNavigationSource, formalRawMaterialPageSource] = await Promise.all([
    readSource("../src/complete-review-entry.jsx"),
    readSource("../src/FormalMobileEntry.jsx"),
    readSource("../../../../src/app/OfficeWorkspacePages.jsx"),
    readSource("../../../../src/app/navigation.js"),
    readSource("../../../../src/features/raw-materials/RawMaterialInboundPage.jsx"),
  ]);

  assert.match(mainSource, /matchMedia\("\(max-width: 767px\)"\)/, "the canonical entry should select the approved phone flow at phone width and reload when the viewport family changes");
  assert.match(mainSource, /await import\("\.\/FormalMobileEntry\.jsx"\)/, "phone entry should load the shared formal mobile app");
  assert.match(mainSource, /await import\("\.\/App\.jsx"\)/, "desktop entry should keep the approved review app");
  assert.match(mobileEntrySource, /import \{ App \} from "\.\.\/\.\.\/\.\.\/\.\.\/src\/App\.jsx"/, "mobile entry should reuse the formal ERP App rather than copy phone screens");
  assert.match(formalNavigationSource, /if \(defaultRole === "office"\) return "rawMaterials";/, "office phones should enter the formal raw-material route");
  assert.match(formalPagesSource, /onDeliveryNoteRecognize: recognizeRawMaterialDeliveryNote/, "formal mobile capture should use the server OCR action");
  assert.match(formalRawMaterialPageSource, /RawMaterialMobileOcrReview/, "formal route should retain the approved OCR review page");
  assert.doesNotMatch(formalRawMaterialPageSource, /1500/, "formal shared page must not use the desktop review's blanket 1500-meter demo value");
});

test("formal mobile OCR keeps evidence, return and server-save boundaries", async () => {
  const [reviewSource, rawMaterialActionSource, specSource] = await Promise.all([
    readSource("../../../../src/features/raw-materials/RawMaterialMobileOcrReview.jsx"),
    readSource("../../../../src/app/createOfficeRawMaterialActions.js"),
    readSource("../../../../shared/rawMaterialSpec.js"),
  ]);

  for (const required of ["documentDirection", "getOcrPageMeta(selected, sourcePageIndex).angle", "orientRawMaterialOcrSourceBounds", "sourceBounds", "excludedRolls"]) {
    assert.ok(reviewSource.includes(required), `formal OCR review should retain ${required}`);
  }
  assert.match(rawMaterialActionSource, /recognizeOfficeRawMaterialDeliveryNote/, "recognition must remain an API operation");
  assert.match(rawMaterialActionSource, /expectedRevision: Number\(options\.expectedRevision \?\? target\.revision \?\? 0\)/, "review saves should retain optimistic revision control");
  assert.match(specSource, /RAW_MATERIAL_STANDARD_FABRIC_GSM = 78/, "body fabric should keep the default 78g rule");
  assert.match(specSource, /RAW_MATERIAL_STANDARD_HANDLE_GSM = 65/, "handle strip should use the default 65g rule");
  assert.match(specSource, /RAW_MATERIAL_HANDLE_WIDTH_CM = 5/, "handle strip should keep the fixed 5cm rule");
});
