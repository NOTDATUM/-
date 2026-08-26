import React from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";
import "../app/service-design.css";

declare global {
  interface Window {
    __BE_API_URL__?: string;
    __BE_STATIC_MODE__?: boolean;
  }
}

window.__BE_API_URL__ =
  import.meta.env.VITE_BE_API_URL?.trim() || "https://3-107-160-0.sslip.io";
window.__BE_STATIC_MODE__ = false;

const root = document.getElementById("root");

if (!root) throw new Error("앱을 표시할 루트 요소를 찾지 못했습니다.");

createRoot(root).render(
  <React.StrictMode>
    <a className="skip-link" href="#main-content">
      본문으로 바로가기
    </a>
    <Home />
  </React.StrictMode>,
);
