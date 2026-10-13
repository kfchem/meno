import clsx from "clsx";
import { useAppSettings, type PointerSettings as Pointer } from "../../../lib/settings/appSettings";

const WHEEL: { value: Pointer["wheelUp"]; label: string }[] = [
  { value: "in", label: "Zooms in" },
  { value: "out", label: "Zooms out" },
];

const LARGE: { value: Pointer["largeZoom"]; label: string }[] = [
  { value: "exact", label: "Every step" },
  { value: "settle", label: "Once it stops" },
  { value: "picture", label: "Quick, then sharp" },
];

/** The mouse and the trackpad in Settings: which way a turn of the wheel zooms the canvas, and how a very large drawing is drawn as it zooms. */
export default function PointerSettings() {
  const pointer = useAppSettings((s) => s.pointer);
  const setPointer = useAppSettings((s) => s.setPointer);
  return (
    <div className="rounded-lg border border-gh-line bg-white divide-y divide-gh-line">
      <div className="px-3 py-2.5 flex gap-3 items-start">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-gh-black">The wheel turned upwards</div>
          <p className="text-xs leading-snug text-gh-gray mt-0.5">
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
          <div className="text-sm text-gh-black">Zooming a very large drawing</div>
          <p className="text-xs leading-snug text-gh-gray mt-0.5">
            How a drawing of more than 20 000 atoms is drawn as the view zooms: laid out again at every step; laid out once the zoom stops; or zoomed as a picture, then drawn sharp once it stops. A trial, to choose one.
          </p>
        </div>
        <div className="shrink-0 flex rounded-md border border-gh-line overflow-hidden" role="radiogroup" aria-label="Zooming a very large drawing">
          {LARGE.map((o) => (
            <button
              key={o.value}
              role="radio"
              aria-checked={pointer.largeZoom === o.value}
              onClick={() => setPointer({ ...pointer, largeZoom: o.value })}
              className={clsx(
                "h-7 px-2.5 text-xs border-l border-gh-line first:border-l-0",
                pointer.largeZoom === o.value ? "bg-accel-base text-white" : "bg-white text-gh-black hover:bg-gh-base",
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
