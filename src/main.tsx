// Before anything else: the page's errors and warnings into Meno's log as well (lib/log)
import "./lib/logStart";
// Before anything draws text: where text finds the characters its font lacks.
import "./ui/fonts/textRenderer";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isTauri } from "@tauri-apps/api/core";
import { refreshPlugins } from "./lib/plugins/known";
import { beforeFirstDraw } from "./startUp";
import { installCursors } from "./ui/theme/cursors";

// Meno's own pointers, for whatever asks for one (ui/theme/cursors)
installCursors();

// A touchpad's pinch comes as the wheel with Ctrl held: what is pinched
// takes it for its own zoom (the canvas, the column), and nowhere does it
// zoom the page itself (Windows: src-tauri/src/pinch.rs).
window.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) e.preventDefault();
  },
  { passive: false },
);

// Before the first draw (startUp): the plugins Meno knows of, and Settings.
void beforeFirstDraw(() => (isTauri() ? refreshPlugins() : Promise.resolve())).then(() =>
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  ),
);
