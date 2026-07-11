import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles/tokens.css";
import "./styles.css";
import "./styles/shell.css";
import "./styles/components.css";
import "./styles/features/todos.css";
import "./styles/features/orders-entry.css";
import "./styles/features/orders-pool.css";
import "./styles/features/inventory.css";
import "./styles/features/fulfillment.css";
import "./styles/features/statements.css";
import "./styles/features/role-tools.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
