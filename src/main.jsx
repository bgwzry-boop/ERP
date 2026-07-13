import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shared.css";
import "./styles/shell.css";
import "./styles/components.css";
import "./styles/features/todos.css";
import "./styles/features/orders-entry.css";
import "./styles/features/orders-pool.css";
import "./styles/features/inventory.css";
import "./styles/features/fulfillment.css";
import "./styles/features/statements.css";
import "./styles/features/role-tools.css";
import "./styles/features/driver.css";
import "./styles/features/raw-material.css";
import "./styles/features/master-data.css";
import "./styles/features/production-print.css";
import "./styles/features/print-documents.css";
import "./styles/features/attachments.css";
import "./styles/features/v1-status-base.css";
import "./styles/features/v1-status.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
