import assert from "node:assert/strict";
import test from "node:test";
import { disableCompleteReviewBootstrapCachingPlugin } from "../vite.config.mjs";

test("runtime and browser artifacts do not reload the review; source edits still do", async () => {
  let onFileEvent;
  let revision = 0;
  const provenance = {
    baseCommit: "a".repeat(40), dirty: true,
    state: () => String(revision),
    advance: () => { revision += 1; },
  };
  const plugin = disableCompleteReviewBootstrapCachingPlugin({ provenance });
  plugin.configureServer({
    watcher: { on: (_event, callback) => { onFileEvent = callback; } },
    middlewares: { use: () => {} },
  });
  const before = plugin.transformIndexHtml().find((item) => item.attrs.name === "erp-preview-state").attrs.content;
  for (const path of [
    "/ERP/.erp-local-storage/test/raw-material-inbounds.json",
    "/ERP/.erp-local-storage/e2e/review-test-results/video.webm",
    "/ERP/dist/assets/main.js",
    "/ERP/.git/index",
    "C:\\ERP\\node_modules\\.vite\\deps\\react.js",
  ]) onFileEvent("change", path);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(provenance.state(), before, "test output and runtime writes must not invalidate an unchanged app");
  onFileEvent("change", "/ERP/src/features/raw-materials/InboundDetail.jsx");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.notEqual(provenance.state(), before, "actual source edits must still refresh the document identity");
});
