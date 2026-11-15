import clsx from "clsx";
import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
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
    <div className="space-y-2">
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
      <LabelFonts />
    </div>
  );
}

/**
 * Whether the fonts a copied picture's labels are set in - IBM Plex Sans -
 * are installed for this user, so that Word and PowerPoint draw the labels
 * in them (src-tauri labelfonts.rs: put in by the installer on Windows, at
 * start on the Mac). One line, nothing to choose; none outside the app.
 */
function LabelFonts() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let live = true;
    invoke<boolean>("label_fonts_installed")
      .then((yes) => live && setInstalled(yes))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (installed == null) return null;
  return (
    <div className="rounded-lg border border-gh-line bg-white px-4 py-3">
      <div className="text-sm text-gh-black">
        {installed ? "Meno's label fonts are installed for Office" : "Meno's label fonts are not installed for Office"}
      </div>
      <p className="text-xs text-gh-gray mt-0.5 max-w-2xl">
        {installed
          ? "IBM Plex Sans, which a copied picture's labels are set in. To send a slide to someone without them, turn on PowerPoint's Embed fonts in the file."
          : "Word and PowerPoint draw a copied picture's labels in a font of their own."}
      </p>
    </div>
  );
}
