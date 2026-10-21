import { MinusIcon, StopIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const stop = (e: MouseEvent) => e.stopPropagation();

/**
 * How much of the title bar's left a Mac's own window buttons take, their
 * margin to the tabs included: where tauri.macos.conf.json puts them
 * (`trafficLightPosition`), and the three of them as wide as the system
 * draws them.
 */
export const SYSTEM_BUTTONS_ROOM = 80;

/** Minimise, maximise and close, drawn by Meno at the title bar's right (not on a Mac). */
export default function WindowButtons() {
  // (none outside Tauri - the browser dev server - where the buttons do nothing)
  const appWindow = useMemo(() => (isTauri() ? getCurrentWindow() : null), []);
  return (
    <div className="ml-2 h-full flex">
      <button
        aria-label="Minimize"
        title="Minimize"
        onMouseDown={stop}
        onClick={() => appWindow?.minimize()}
        className="h-10 w-11 flex items-center justify-center transition-colors duration-150 ease-meno hover:bg-gray-200"
      >
        <MinusIcon className="h-4 w-4" />
      </button>
      <button
        aria-label="Maximize"
        title="Maximize / Restore"
        onMouseDown={stop}
        onClick={() => appWindow?.toggleMaximize()}
        className="h-10 w-11 flex items-center justify-center transition-colors duration-150 ease-meno hover:bg-gray-200"
      >
        <StopIcon className="h-4 w-4" />
      </button>
      <button
        aria-label="Close"
        title="Close"
        onMouseDown={stop}
        onClick={() => appWindow?.close()}
        className="h-10 w-11 flex items-center justify-center transition-colors duration-150 ease-meno hover:bg-red-500 hover:text-white"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Room at the title bar's left for a Mac's own window buttons, which the
 * system draws over the bar: none in full screen, where it hides them, the
 * tabs moving over as the room closes.
 */
export function SystemButtonsRoom() {
  const full = useFullScreen();
  return (
    <div
      data-tauri-drag-region
      className="shrink-0 h-full transition-[width] duration-150 ease-meno"
      style={{ width: full ? 0 : SYSTEM_BUTTONS_ROOM }}
    />
  );
}

/** Whether the window is in full screen, as it goes in and out. */
function useFullScreen(): boolean {
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    const appWindow = getCurrentWindow();
    let live = true;
    const check = () =>
      void appWindow
        .isFullscreen()
        .then((f) => live && setFull(f))
        .catch(() => {});
    check();
    const stopListening = appWindow.onResized(check);
    return () => {
      live = false;
      void stopListening.then((f) => f()).catch(() => {});
    };
  }, []);
  return full;
}
