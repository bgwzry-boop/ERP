import assert from "node:assert/strict";
import { prepareRawMaterialDeliveryNoteFile } from "../src/services/rawMaterialDeliveryNoteImageClient.js";

const smallPhoto = {
  name: "delivery-note.jpg",
  type: "image/jpeg",
  size: 6 * 1024 * 1024,
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
await assert.rejects(
  prepareRawMaterialDeliveryNoteFile({
    ...smallPhoto,
    name: "delivery-note.pdf",
    type: "application/pdf",
    size: 8 * 1024 * 1024,
    contentDataUrl: "data:application/pdf;base64,JVBERi0=",
  }),
  (error) => error.code === "RAW_MATERIAL_DELIVERY_NOTE_PDF_TOO_LARGE",
);

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
      size: 6 * 1024 * 1024,
      contentDataUrl: "data:image/jpeg;base64,bm9ybWFsaXplZA==",
    }),
  }),
});
assert.equal(normalizedPrepared.normalized, true);
assert.equal(normalizedPrepared.sourceFileSize, largePhoto.size);
assert.equal(normalizedPrepared.sourceContentDataUrl, largePhoto.contentDataUrl);
assert.equal(normalizedPrepared.fileSize, 6 * 1024 * 1024);
assert.match(normalizedPrepared.contentDataUrl, /^data:image\/jpeg/);

console.log("Raw-material delivery-note image client check passed: 30MB source photos are accepted and OCR derivatives remain within 7.5MB.");
