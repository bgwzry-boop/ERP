import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const distRoot = resolve(process.cwd(), "dist");
const assetRoot = resolve(distRoot, "assets");
const maxJavaScriptChunkBytes = 450_000;
const requiredChunkPrefixes = [
  "react-vendor-",
  "erp-pages-",
  "erp-runtime-",
  "erp-v1-runtime-",
  "erp-domain-",
  "erp-data-",
];
const requiredLazyChunkPrefixes = ["erp-v1-status-"];

const assetNames = await readdir(assetRoot);
const javaScriptAssets = assetNames.filter((name) => name.endsWith(".js")).sort();
assert.ok(javaScriptAssets.length > 0, "production build should emit JavaScript assets");

const chunks = await Promise.all(
  javaScriptAssets.map(async (name) => ({ name, bytes: (await stat(resolve(assetRoot, name))).size })),
);
const oversized = chunks.filter((chunk) => chunk.bytes > maxJavaScriptChunkBytes);
assert.deepEqual(
  oversized,
  [],
  `production JavaScript chunks must stay at or below ${maxJavaScriptChunkBytes} bytes`,
);

const indexHtml = await readFile(resolve(distRoot, "index.html"), "utf8");
for (const prefix of requiredChunkPrefixes) {
  const matches = javaScriptAssets.filter((name) => name.startsWith(prefix));
  assert.equal(matches.length, 1, `production build should emit exactly one ${prefix}*.js chunk`);
  assert.match(indexHtml, new RegExp(`/assets/${escapeRegExp(matches[0])}`), `${matches[0]} should be linked from index.html`);
}

for (const prefix of requiredLazyChunkPrefixes) {
  const matches = javaScriptAssets.filter((name) => name.startsWith(prefix));
  assert.equal(matches.length, 1, `production build should emit exactly one ${prefix}*.js chunk`);
  assert.doesNotMatch(indexHtml, new RegExp(`/assets/${escapeRegExp(matches[0])}`), `${matches[0]} should remain lazy and stay out of index.html`);
  const referencingChunks = await Promise.all(
    javaScriptAssets
      .filter((name) => name !== matches[0])
      .map(async (name) => ({ name, source: await readFile(resolve(assetRoot, name), "utf8") })),
  );
  assert.ok(
    referencingChunks.some(({ source }) => source.includes(matches[0])),
    `${matches[0]} should be referenced by a JavaScript dynamic import`,
  );
}

const largest = [...chunks].sort((left, right) => right.bytes - left.bytes)[0];
console.log(
  `Frontend build chunk checks passed: ${chunks.length} JS chunks, largest ${largest.name} ${largest.bytes} bytes, budget ${maxJavaScriptChunkBytes} bytes.`,
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
