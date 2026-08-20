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

window.__BE_API_URL__ = import.meta.env.VITE_BE_API_URL?.trim();
window.__BE_STATIC_MODE__ = false;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>,
);
