/**
 * How finely the canvas is drawn (docs/WORKSPACE.md, *Drawing resolution*):
 * the pixels it draws for each of its own on the screen's page, as Settings,
 * General, chooses - twice, the sharpest and as before; as the screen itself
 * shows things; or once, the lightest on the graphics card. Every part of
 * the canvas that reads it reads it from the renderer as it is drawn, so a
 * change shows at once. Pictures made of the drawing are drawn at their own
 * sizes, whichever is chosen.
 */
import { useEffect, useState } from "react";
import { useAppSettings, type CanvasSettings } from "../../../lib/settings/appSettings";

/** Never finer than twice, as before there was a choice: no screen's own makes the canvas dearer than that. */
const FINEST = 2;

/** The pixels drawn for each of the canvas's own, `resolution` chosen, on a screen showing things `screen` times as finely. */
export function canvasRatio(resolution: CanvasSettings["resolution"], screen: number): number {
  if (resolution === "display") return Math.min(FINEST, Math.max(1, Number.isFinite(screen) && screen > 0 ? screen : 1));
  return resolution;
}

/** How finely the screen the window is on shows things - followed as the window goes to another screen, or its scaling is changed. */
function useScreenRatio(): number {
  const [ratio, setRatio] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    // (a query for the ratio as it is: it stops matching as it changes, and is asked again for the new one)
    const query = window.matchMedia(`(resolution: ${ratio}dppx)`);
    const changed = () => setRatio(window.devicePixelRatio || 1);
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, [ratio]);
  return ratio;
}

/** The canvas's pixels for each of its own, as Settings has it now. */
export function useCanvasRatio(): number {
  const resolution = useAppSettings((s) => s.canvas.resolution);
  const screen = useScreenRatio();
  return canvasRatio(resolution, screen);
}
