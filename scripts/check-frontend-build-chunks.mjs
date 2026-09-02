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
const v1StatusRouteKey = "src/app/routes/V1StatusRoute.jsx";
const v1StatusRouteAsset = manifest[v1StatusRouteKey];
assert.ok(
  workbenchAsset.dynamicImports?.includes(v1StatusRouteKey),
  "OfficeWorkbench must lazy-load the V1 status route",
);
assert.ok(v1StatusRouteAsset?.isDynamicEntry, "V1 status route must remain a dynamic entry");
assert.equal(
  initialAssets.has(v1StatusRouteAsset.file),
  false,
  "V1 status route must not return to the initial HTML dependency graph",
);
assert.ok(
  (v1StatusRouteAsset.css?.length ?? 0) > 0,
  "V1 status styles must remain deferred with the route",
);
const workbenchSource = await readFile(resolve(distRoot, workbenchAsset.file));
const workbenchBytes = (await stat(resolve(distRoot, workbenchAsset.file))).size;
const workbenchGzipBytes = gzipSync(workbenchSource).length;
const workspaceOverlayRouteKey = "src/app/WorkspaceOverlayRoute.jsx";
const workspaceOverlayRouteAsset = manifest[workspaceOverlayRouteKey];
assert.ok(
  workbenchAsset.dynamicImports?.includes(workspaceOverlayRouteKey),
  "OfficeWorkbench must lazy-load the workspace overlays",
);
assert.ok(workspaceOverlayRouteAsset?.isDynamicEntry, "workspace overlays must remain a dynamic entry");
assert.equal(
  initialAssets.has(workspaceOverlayRouteAsset.file),
  false,
  "workspace overlays must not return to the initial HTML dependency graph",
);
assert.ok(
  (workspaceOverlayRouteAsset.css?.length ?? 0) > 0,
  "attachment styles must load with the workspace overlay route",
);
for (const cssFile of workspaceOverlayRouteAsset.css) {
  assert.equal(
    initialAssets.has(cssFile),
    false,
    "workspace overlay styles must not return to the initial HTML dependency graph",
  );
}
const printDocumentStyleAsset = manifest["src/styles/features/print-documents.css"];
assert.ok(printDocumentStyleAsset?.file, "print-document styles must remain in the production build");
assert.equal(
  initialAssets.has(printDocumentStyleAsset.file),
  false,
  "print-document styles must not return to the initial HTML dependency graph",
);
const masterDataTemplateDownloadAsset = Object.values(manifest).find(
  (asset) => asset.name === "masterDataTemplateDownload",
);
assert.ok(
  masterDataTemplateDownloadAsset?.isDynamicEntry,
  "master-data XLSX generation must remain behind its download action",
);
const masterDataTemplateDownloadSource = await readFile(
  resolve(distRoot, masterDataTemplateDownloadAsset.file),
  "utf8",
);
assert.doesNotMatch(
  workbenchSource.toString("utf8"),
  /\[Content_Types\]\.xml/,
  "OfficeWorkbench must not eagerly contain the XLSX archive generator",
);
assert.match(
  masterDataTemplateDownloadSource,
  /\[Content_Types\]\.xml/,
  "master-data template download chunk must contain the XLSX archive generator",
);
const maxWorkbenchBytes = 500_000;
const maxWorkbenchGzipBytes = 150 * 1024;
assert.ok(
  workbenchBytes <= maxWorkbenchBytes,
  `OfficeWorkbench is ${formatBytes(workbenchBytes)} raw; budget is ${formatBytes(maxWorkbenchBytes)} raw`,
);
assert.ok(
  workbenchGzipBytes <= maxWorkbenchGzipBytes,
  `OfficeWorkbench is ${formatBytes(workbenchGzipBytes)} gzip; budget is ${formatBytes(maxWorkbenchGzipBytes)} gzip`,
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
  `Frontend build budgets passed: initial ${measuredAssets.length} JS/CSS assets, ${formatBytes(initialGzipBytes)} gzip (budget ${formatBytes(maxInitialGzipBytes)}); OfficeWorkbench ${formatBytes(workbenchBytes)} raw / ${formatBytes(workbenchGzipBytes)} gzip.`,
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
