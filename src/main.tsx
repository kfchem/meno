// Before anything draws text: where text finds the characters its font lacks.
import "./ui/fonts/textRenderer";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installCursors } from "./ui/theme/cursors";
import { installLog } from "./lib/log";

// The page's errors and warnings into Meno's log as well (lib/log)
installLog();

// Meno's own pointers, for whatever asks for one (ui/theme/cursors)
installCursors();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
