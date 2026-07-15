import React from "react";
import { createRoot } from "react-dom/client";
import { GameShell } from "@freegamestore/games";
import App from "./App";
import "./styles.css";

void GameShell;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
