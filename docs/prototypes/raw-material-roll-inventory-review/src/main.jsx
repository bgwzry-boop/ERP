import React from "react";
import { createRoot } from "react-dom/client";
import { establishLocalPreviewIdentity } from "../../../../src/config/localPreviewIdentity.js";
import { exposeReleaseIdentity } from "../../../../src/config/releaseIdentity.js";
import "../../../../src/styles/tokens.css";
import "../../../../src/styles/semantic-tags.css";

const root = createRoot(document.getElementById("root"));
establishLocalPreviewIdentity("bagwin-complete-review-4174");
exposeReleaseIdentity();
const isPhoneViewport = window.matchMedia("(max-width: 767px)").matches;

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
