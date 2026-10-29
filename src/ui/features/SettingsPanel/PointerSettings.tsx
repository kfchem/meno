import clsx from "clsx";
import { useAppSettings, type LongPress, type PointerSettings as Pointer } from "../../../lib/settings/appSettings";
import { LONG_PRESSES } from "../Workspace/constants";

const WHEEL: { value: Pointer["wheelUp"]; label: string }[] = [
  { value: "in", label: "Zooms in" },
  { value: "out", label: "Zooms out" },
];

const PRESS: { value: LongPress; label: string }[] = [
  { value: "shorter", label: "Shorter" },
  { value: "normal", label: "Normal" },
  { value: "longer", label: "Longer" },
];

/** The mouse and the trackpad in Settings: which way a turn of the wheel zooms the canvas, and how long a press is held to be a long press. */
export default function PointerSettings() {
  const pointer = useAppSettings((s) => s.pointer);
  const setPointer = useAppSettings((s) => s.setPointer);
  return (
    <div className="rounded-lg border border-gh-line bg-white divide-y divide-gh-line">
      <div className="px-3 py-2.5 flex gap-3 items-start">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-gh-black">The wheel turned upwards</div>
          <p className="text-xs leading-snug text-gh-gray mt-0.5 max-w-2xl">
            Which way a mouse's wheel zooms the canvas. Pinching on a trackpad zooms as the fingers go, whichever is chosen.
          </p>
        </div>
        <div className="shrink-0 flex rounded-md border border-gh-line overflow-hidden" role="radiogroup" aria-label="The wheel turned upwards">
          {WHEEL.map((o) => (
            <button
              key={o.value}
              role="radio"
              aria-checked={pointer.wheelUp === o.value}
              onClick={() => setPointer({ ...pointer, wheelUp: o.value })}
              className={clsx(
                "h-7 px-2.5 text-xs border-l border-gh-line first:border-l-0",
                pointer.wheelUp === o.value ? "bg-accel-base text-white" : "bg-white text-gh-black hover:bg-gh-base",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-3 py-2.5 flex gap-3 items-start">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-gh-black">A long press</div>
          <p className="text-xs leading-snug text-gh-gray mt-0.5 max-w-2xl">
            How long a press is held still to select a whole structure, or to begin a box on empty space: {LONG_PRESSES[pointer.longPress ?? "normal"]} ms. A click is never taken for one.
          </p>
        </div>
        <div className="shrink-0 flex rounded-md border border-gh-line overflow-hidden" role="radiogroup" aria-label="A long press">
          {PRESS.map((o) => {
            const on = (pointer.longPress ?? "normal") === o.value;
            return (
              <button
                key={o.value}
                role="radio"
                aria-checked={on}
                onClick={() => setPointer({ ...pointer, longPress: o.value })}
                className={clsx("h-7 px-2.5 text-xs border-l border-gh-line first:border-l-0", on ? "bg-accel-base text-white" : "bg-white text-gh-black hover:bg-gh-base")}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
