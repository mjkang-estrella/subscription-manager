import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import PublicDashboard from "./PublicDashboard";
import "./styles.css";
import "./features.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname === "/workspace" ? <App /> : <PublicDashboard />}
  </React.StrictMode>,
);
