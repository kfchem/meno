import clsx from "clsx";
import { PICTURE_DPIS, useAppSettings } from "../../../lib/settings/appSettings";

/**
 * Copied pictures in Settings: how sharp a picture a copy puts beside a
 * structure is where it is made of pixels - for programs that take no
 * drawing in vectors, and its molecules in 3D in any picture.
 */
export default function PictureSettings() {
  const pictures = useAppSettings((s) => s.pictures);
  const setPictures = useAppSettings((s) => s.setPictures);
  return (
    <div className="rounded-lg border border-gh-line bg-white px-4 py-3 flex items-start gap-4">
      <div className="flex-1">
        <div className="text-sm text-gh-black">Resolution</div>
        <p className="text-xs text-gh-gray mt-0.5 max-w-2xl">
          Of a copied picture where it is made of pixels: molecules in 3D in it, and the whole of it in a program
          that takes no drawing in lines. Higher is sharper, and takes more room.
        </p>
      </div>
      <div role="radiogroup" aria-label="Resolution of copied pictures" className="flex rounded-md border border-gh-line overflow-hidden shrink-0">
        {PICTURE_DPIS.map((dpi) => (
          <button
            key={dpi}
            role="radio"
            aria-checked={pictures.dpi === dpi}
            onClick={() => setPictures({ dpi })}
            // (as the drawing style's choices are shown)
            className={clsx(
              "h-7 px-3 text-xs tabular-nums border-l first:border-l-0 border-gh-line",
              pictures.dpi === dpi ? "bg-accel-base text-white" : "bg-white text-gh-black hover:bg-gh-base",
            )}
          >
            {dpi} dpi
          </button>
        ))}
      </div>
    </div>
  );
}
