import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const distRoot = resolve(process.cwd(), "dist");
const indexHtml = await readFile(resolve(distRoot, "index.html"), "utf8");
const manifest = JSON.parse(await readFile(resolve(distRoot, ".vite/manifest.json"), "utf8"));
const entry = Object.entries(manifest).find(([, asset]) => asset.isEntry);
assert.ok(entry, "production manifest should identify the HTML entry module");

const [entryKey, entryAsset] = entry;
assert.match(indexHtml, new RegExp(`/${escapeRegExp(entryAsset.file)}`), "index.html should load the manifest entry module");

const initialAssets = collectInitialAssets(manifest, entryKey);
const workbenchAsset = Object.values(manifest).find((asset) => asset.name === "OfficeWorkbench");
assert.ok(workbenchAsset?.isDynamicEntry, "authenticated OfficeWorkbench must remain a dynamic entry behind the login shell");
assert.equal(
  initialAssets.has(workbenchAsset.file),
  false,
  "authenticated OfficeWorkbench must not return to the initial HTML dependency graph",
);
const measuredAssets = await Promise.all([...initialAssets].sort().map(async (file) => {
  const source = await readFile(resolve(distRoot, file));
  return {
    file,
    bytes: (await stat(resolve(distRoot, file))).size,
    gzipBytes: gzipSync(source).length,
  };
}));
const initialGzipBytes = measuredAssets.reduce((total, asset) => total + asset.gzipBytes, 0);
const maxInitialGzipBytes = 150 * 1024;
assert.ok(
  initialGzipBytes <= maxInitialGzipBytes,
  `initial HTML dependency graph is ${formatBytes(initialGzipBytes)} gzip; budget is ${formatBytes(maxInitialGzipBytes)} gzip`,
);

console.log(
  `Frontend initial-load budget passed: ${measuredAssets.length} JS/CSS assets, ${formatBytes(initialGzipBytes)} gzip (budget ${formatBytes(maxInitialGzipBytes)}).`,
);

function collectInitialAssets(manifestEntries, entryKey) {
  const files = new Set();
  const visited = new Set();
  const visit = (key) => {
    if (visited.has(key)) return;
    visited.add(key);
    const asset = manifestEntries[key];
    assert.ok(asset, `manifest import ${key} should exist`);
    if (asset.file) files.add(asset.file);
    for (const cssFile of asset.css ?? []) files.add(cssFile);
    for (const importKey of asset.imports ?? []) visit(importKey);
  };
  visit(entryKey);
  return files;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
