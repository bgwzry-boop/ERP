import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {chromium} from "playwright";

const css = name => readFileSync(new URL(`../src/styles/features/${name}.css`, import.meta.url), "utf8");
const browser = await chromium.launch({headless: true});
try {
  // Production extracts shared chunks in a different order from Vite dev.
  // Both orders must expose the phone review while keeping inventory/detail
  // ownership and the normal phone receiving page unchanged.
  for (const order of [["raw-material-foundation", "raw-material-mobile"], ["raw-material-mobile", "raw-material-foundation"]]) {
    for (const width of [390, 767, 768, 1280]) {
      const page = await browser.newPage({viewport: {width, height: 932}});
      await page.setContent(`<style>${order.map(css).join("\n")}</style>
        <section class="raw-material-workbench raw-material-inbound-page is-roll-inventory-view is-mobile-detail-open">
          <div class="raw-material-mobile-receiving">手机收货首页</div>
          <aside class="raw-material-detail-pane has-mobile-ocr-review">
            <section class="raw-material-mobile-ocr-review"><button>请先核对退货方向</button></section>
          </aside>
        </section>`);
      const detail = page.locator(".raw-material-detail-pane");
      assert.equal(await detail.isVisible(), width <= 767, `${order.join(" → ")} at ${width}px`);
      if (width <= 767) {
        assert.equal(await page.getByRole("button", {name: "请先核对退货方向"}).isVisible(), true);
        assert.equal(await page.locator(".raw-material-mobile-receiving").isVisible(), false);
        await page.locator("section.raw-material-workbench").evaluate(node => node.classList.remove("is-mobile-detail-open"));
        assert.equal(await detail.isVisible(), false);
        assert.equal(await page.locator(".raw-material-mobile-receiving").isVisible(), true);
      }
      await page.close();
    }
  }
  console.log("PASS mobile raw-material CSS cascade: phone review remains visible with either shared-chunk order; home and desktop inventory stay isolated (390/767/768/1280).");
} finally {
  await browser.close();
}
