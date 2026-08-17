import React from "react";
import { createRoot } from "react-dom/client";
import { establishLocalPreviewIdentity } from "../../../../src/config/localPreviewIdentity.js";
import "../../../../src/styles/tokens.css";
import "../../../../src/styles/semantic-tags.css";

const identityGuard = establishLocalPreviewIdentity("bagwin-complete-review-4174");

if (identityGuard) {
  const root = createRoot(document.getElementById("root"));
  const phoneViewportQuery = window.matchMedia("(max-width: 767px)");
  const isPhoneViewport = phoneViewportQuery.matches;
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
