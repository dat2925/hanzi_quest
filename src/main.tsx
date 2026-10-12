import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AccountGate } from "./cloud/Account";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AccountGate>
      <App />
    </AccountGate>
  </React.StrictMode>,
);
