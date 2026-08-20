import React from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";

declare global {
  interface Window {
    __BE_API_URL__?: string;
    __BE_STATIC_MODE__?: boolean;
  }
}

window.__BE_STATIC_MODE__ = true;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>,
);
