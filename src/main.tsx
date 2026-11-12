// Before anything else: the page's errors and warnings into Meno's log as well (lib/log)
import "./lib/logStart";
// Before anything draws text: where text finds the characters its font lacks.
import "./ui/fonts/textRenderer";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isTauri } from "@tauri-apps/api/core";
import { refreshPlugins } from "./lib/plugins/known";
import { installCursors } from "./ui/theme/cursors";
import { watchInput } from "./lib/core/calm";

// Meno's own pointers, for whatever asks for one (ui/theme/cursors)
installCursors();

// What the window does for itself in the background waits for the hands to rest (lib/core/calm)
watchInput();

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

// The plugins Meno knows of, taken from its backend before anything reads them (lib/plugins/known): where that
// fails, Meno starts knowing of none, and says so in its log (lib/log: the reason given only as what it is, as it
// may name a folder).
void (isTauri() ? refreshPlugins() : Promise.resolve())
  .catch((e) => console.error("Meno: the plugins in place could not be read.", e))
  .then(() =>
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    ),
  );
