import React from "react";
import { createRoot } from "react-dom/client";
import { GameShell } from "@freegamestore/games";
import App from "./App";
import "./styles.css";

void GameShell;

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
