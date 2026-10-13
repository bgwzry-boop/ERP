import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { establishLocalPreviewIdentity } from "./config/localPreviewIdentity.js";
import { exposeReleaseIdentity } from "./config/releaseIdentity.js";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shared.css";
import "./styles/semantic-tags.css";
import "./styles/shell.css";
import "./styles/components.css";
import "./styles/interface-polish.css";

exposeReleaseIdentity();
const identityGuard = establishLocalPreviewIdentity("bagwin-formal-workbench-root");

if (identityGuard) {
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
