import { useState } from "react";
import clsx from "clsx";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { MENO_PALETTE, OKABE_ITO, PALETTE_MOST } from "../../../lib/chem/palette";

/** Each swatch's square, in px, as the colour card's are a little smaller. */
const SWATCH = 28;

/**
 * Colours in Settings, General: the palette a part of a structure is given
 * its colour from, in its colour card (docs/EDITOR-2D.md, *Colour*). A
 * swatch pressed is changed in the system's own chooser, dragged is moved
 * along, and its cross takes it out; another is added from the plus. Meno's
 * four come back in one press, and Okabe and Ito's take their place in one.
 */
export default function ColourSettings() {
  const palette = useAppSettings((s) => s.palette);
  const setPalette = useAppSettings((s) => s.setPalette);
  // the swatch being dragged along, by where it was
  const [dragged, setDragged] = useState<number | null>(null);
  const same = (a: readonly string[]) => a.length === palette.length && a.every((c, i) => c === palette[i]);
  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = palette.slice();
    const [c] = next.splice(from, 1);
    next.splice(to, 0, c);
    setPalette(next);
  };
  return (
    <div className="mt-3 rounded-lg border border-gh-line bg-white px-3 py-2.5">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="text-sm text-gh-black">Colours</div>
          <p className="text-xs leading-snug text-gh-gray mt-0.5 max-w-xl">
            The colours a part of a structure can be given from its colour card, in this order. A highlight and a
            ring&apos;s fill are light tints of them; any other colour can still be picked there.
          </p>
        </div>
        <div className="flex rounded-md border border-gh-line overflow-hidden shrink-0">
          {(
            [
              ["Meno's colours", MENO_PALETTE],
              ["Okabe–Ito", OKABE_ITO],
            ] as const
          ).map(([name, colours]) => (
            <button
              key={name}
              onClick={() => setPalette([...colours])}
              aria-pressed={same(colours)}
              title={name === "Okabe–Ito" ? "Okabe and Ito's colours, told apart by those who see colours otherwise" : "Meno's own four"}
              className={clsx(
                "h-7 px-3 text-xs border-l first:border-l-0 border-gh-line whitespace-nowrap",
                same(colours) ? "bg-accel-base text-white" : "bg-white text-gh-black hover:bg-gh-base",
              )}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div role="list" aria-label="Palette" className="mt-3 flex flex-wrap items-center gap-2">
        {palette.map((c, i) => (
          <div
            key={c}
            role="listitem"
            draggable
            onDragStart={(e) => {
              setDragged(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (dragged == null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragged != null) move(dragged, i);
              setDragged(null);
            }}
            onDragEnd={() => setDragged(null)}
            className={clsx("group relative shrink-0 transition-opacity duration-150 ease-meno", dragged === i && "opacity-40")}
          >
            <label
              title={c}
              className="block rounded-full cursor-pointer border border-black/10"
              style={{ width: SWATCH, height: SWATCH, background: c }}
            >
              <input
                type="color"
                aria-label={`Change ${c}`}
                className="absolute inset-0 opacity-0 cursor-pointer"
                value={c}
                onChange={(e) => {
                  const next = palette.slice();
                  next[i] = e.target.value.toLowerCase();
                  setPalette(next);
                }}
              />
            </label>
            <button
              aria-label={`Remove ${c}`}
              title="Remove"
              onClick={() => setPalette(palette.filter((_, k) => k !== i))}
              className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full border border-gh-line bg-white text-gh-gray opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-gh-black transition-opacity duration-150 ease-meno flex items-center justify-center"
            >
              <XMarkIcon className="h-3 w-3" />
            </button>
          </div>
        ))}
        {palette.length < PALETTE_MOST && (
          <label
            title="Add a colour"
            className="relative shrink-0 rounded-full cursor-pointer border border-dashed border-gh-line text-gh-gray hover:text-gh-black flex items-center justify-center"
            style={{ width: SWATCH, height: SWATCH }}
          >
            <PlusIcon className="h-4 w-4" />
            <input
              type="color"
              aria-label="Add a colour"
              className="absolute inset-0 opacity-0 cursor-pointer"
              value="#808080"
              onChange={(e) => {
                const c = e.target.value.toLowerCase();
                if (!palette.includes(c)) setPalette([...palette, c]);
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}
