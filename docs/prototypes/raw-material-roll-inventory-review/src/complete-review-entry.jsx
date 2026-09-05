import React from "react";
import { createRoot } from "react-dom/client";
import { establishLocalPreviewIdentity } from "../../../../src/config/localPreviewIdentity.js";
import "../../../../src/styles/tokens.css";
import "../../../../src/styles/semantic-tags.css";

const identityGuard = establishLocalPreviewIdentity("bagwin-complete-review-4174");

if (identityGuard) {
  const phoneViewportQuery = window.matchMedia("(max-width: 767px)");
  const isPhoneViewport = phoneViewportQuery.matches;
  const expectedViewportFamily = isPhoneViewport ? "mobile" : "desktop";
  const currentUrl = new URL(window.location.href);
  const declaredViewportFamily = currentUrl.searchParams.get("erpViewport");

  if (declaredViewportFamily !== expectedViewportFamily) {
    currentUrl.searchParams.set("erpViewport", expectedViewportFamily);
    window.location.replace(currentUrl.toString());
  } else {
    const root = createRoot(document.getElementById("root"));
    const previewKind = document.documentElement.dataset.erpPreviewKind;
    const previewCommit = document.documentElement.dataset.erpPreviewBaseCommit || "unknown";
    const previewDirty = document.documentElement.dataset.erpPreviewDirty === "true";
    if (previewKind === "local-unreleased") {
      document.title = `本地未部署 · ${document.title.replace(/^本地未部署\s*·\s*/, "")}`;
      const badge = document.createElement("div");
      badge.id = "erp-local-preview-badge";
      badge.setAttribute("role", "status");
      badge.textContent = `本地修改稿 · 未部署 · ${previewCommit.slice(0, 8)}${previewDirty ? " + 未提交改动" : ""}`;
      Object.assign(badge.style, {
        position: "fixed",
        zIndex: "2147483647",
        right: "12px",
        top: "66px",
        padding: "5px 9px",
        border: "1px solid #f0b35f",
        borderRadius: "5px",
        background: "#fff7e8",
        color: "#8a4b08",
        font: "600 12px/1.25 system-ui, sans-serif",
        boxShadow: "0 2px 8px rgb(55 32 7 / 12%)",
        pointerEvents: "none",
      });
      document.body.append(badge);
    }
  let viewportFamilyReloadTimer = null;

  const reloadForViewportFamily = (event) => {
    if (event.matches === isPhoneViewport) return;
    window.clearTimeout(viewportFamilyReloadTimer);
    viewportFamilyReloadTimer = window.setTimeout(() => {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("erpViewport", event.matches ? "mobile" : "desktop");
      window.location.replace(nextUrl.toString());
    }, 120);
  };

  phoneViewportQuery.addEventListener("change", reloadForViewportFamily);
  window.addEventListener("pagehide", () => {
    window.clearTimeout(viewportFamilyReloadTimer);
    phoneViewportQuery.removeEventListener("change", reloadForViewportFamily);
  }, { once: true });

  async function bootstrap() {
    document.documentElement.dataset.erpRuntimeFamily = expectedViewportFamily;
    if (isPhoneViewport) {
      const { FormalMobileEntry } = await import("./FormalMobileEntry.jsx");
      root.render(
        <React.StrictMode>
          <FormalMobileEntry />
        </React.StrictMode>,
      );
      return;
    }

    await Promise.all([
      import("./styles.css"),
      import("./business-workspaces.css"),
    ]);
    const { App } = await import("./App.jsx");
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  }

  void bootstrap();
  }
}
