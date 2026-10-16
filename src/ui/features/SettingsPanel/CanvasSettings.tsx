import clsx from "clsx";
import { useAppSettings, type CanvasSettings as Canvas } from "../../../lib/settings/appSettings";

const RESOLUTIONS: { value: Canvas["resolution"]; label: string }[] = [
  { value: 2, label: "2×" },
  { value: "display", label: "Matching the screen" },
  { value: 1, label: "1×" },
];

/** How finely the canvas is drawn, in Settings (Workspace canvasRatio): the sharpest, as the screen shows things, or the lightest. */
export default function CanvasSettings() {
  const canvas = useAppSettings((s) => s.canvas);
  const setCanvas = useAppSettings((s) => s.setCanvas);
  return (
    <div className="mt-3 rounded-lg border border-gh-line bg-white divide-y divide-gh-line">
      <div className="px-3 py-2.5 flex gap-3 items-start">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-gh-black">Drawing resolution</div>
          <p className="text-xs leading-snug text-gh-gray mt-0.5">
            How finely the canvas is drawn. 2× is the sharpest; lower is lighter on the graphics card, and moves more smoothly on a slower computer. Exported pictures are the same whichever is chosen.
          </p>
        </div>
        <div className="shrink-0 flex rounded-md border border-gh-line overflow-hidden" role="radiogroup" aria-label="Drawing resolution">
          {RESOLUTIONS.map((o) => (
            <button
              key={String(o.value)}
              role="radio"
              aria-checked={canvas.resolution === o.value}
              onClick={() => setCanvas({ resolution: o.value })}
              className={clsx(
                "h-7 px-2.5 text-xs border-l border-gh-line first:border-l-0",
                canvas.resolution === o.value ? "bg-accel-base text-white" : "bg-white text-gh-black hover:bg-gh-base",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
