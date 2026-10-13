import assert from "node:assert/strict";
import {
  prepareRawMaterialDeliveryNoteFile,
  prepareRawMaterialDeliveryNotePages,
} from "../src/services/rawMaterialDeliveryNoteImageClient.js";

const smallPhoto = {
  name: "delivery-note.jpg",
  type: "image/jpeg",
  size: 3 * 1024 * 1024,
  contentDataUrl: "data:image/jpeg;base64,c21hbGw=",
};
const smallPrepared = await prepareRawMaterialDeliveryNoteFile(smallPhoto);
assert.equal(smallPrepared.normalized, false);
assert.equal(smallPrepared.fileSize, smallPhoto.size);
assert.equal(smallPrepared.contentDataUrl, smallPhoto.contentDataUrl);

await assert.rejects(
  prepareRawMaterialDeliveryNoteFile({ ...smallPhoto, size: 30 * 1024 * 1024 + 1 }),
  (error) => error.code === "RAW_MATERIAL_DELIVERY_NOTE_SOURCE_TOO_LARGE",
);
const pdfPages = await prepareRawMaterialDeliveryNotePages({
  ...smallPhoto,
  name: "delivery-note.pdf",
  type: "application/pdf",
  size: 5 * 1024 * 1024,
}, {
  File: class TestFile {
    constructor(parts, name, { type }) {
      this.name = name;
      this.type = type;
      this.size = parts[0].size;
      this.contentDataUrl = parts[0].contentDataUrl;
    }
  },
  renderPdfPages: async () => [
    { size: 1000, contentDataUrl: "data:image/jpeg;base64,cGFnZTE=" },
    { size: 1200, contentDataUrl: "data:image/jpeg;base64,cGFnZTI=" },
  ],
});
assert.equal(pdfPages.length, 2);
assert.equal(pdfPages[0].pdfPageNumber, 1);
assert.equal(pdfPages[1].pdfPageNumber, 2);
assert.equal(pdfPages[0].sourceFile.name, "delivery-note-第1页.jpg");
assert.equal(pdfPages[1].sourceFile.name, "delivery-note-第2页.jpg");

const largePhoto = {
  ...smallPhoto,
  size: 18 * 1024 * 1024,
  contentDataUrl: "data:image/jpeg;base64,b3JpZ2luYWw=",
};
const normalizedPrepared = await prepareRawMaterialDeliveryNoteFile(largePhoto, {
  createImageBitmap: async () => ({ width: 5000, height: 3800, close() {} }),
  createCanvas: () => ({
    getContext: () => ({ fillRect() {}, drawImage() {} }),
    toBlob: (callback) => callback({
      size: 3.5 * 1024 * 1024,
      contentDataUrl: "data:image/jpeg;base64,bm9ybWFsaXplZA==",
    }),
  }),
});
assert.equal(normalizedPrepared.normalized, true);
assert.equal(normalizedPrepared.sourceFileSize, largePhoto.size);
assert.equal(normalizedPrepared.sourceContentDataUrl, "");
assert.equal(normalizedPrepared.sourceFile, largePhoto);
assert.equal(normalizedPrepared.fileSize, 3.5 * 1024 * 1024);
assert.match(normalizedPrepared.contentDataUrl, /^data:image\/jpeg/);

console.log("Raw-material delivery-note image client check passed: original files stay binary and OCR derivatives remain within 4MB.");
