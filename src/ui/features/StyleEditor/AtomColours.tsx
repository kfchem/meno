import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useState } from "react";
import { ELEMENTS } from "../../../lib/chem/elements";
import { SERIES_PLACES, TABLE_COLUMNS, TABLE_ROWS, tablePlace } from "../../../lib/chem/periodicTable";
import { colourSet3d, inkOn, type MoleculeLook } from "../../../lib/chem/style3d";
import { BY_SYMBOL, COMMON, elementColours, nameOf } from "./atomColourCells";
import CardMenu from "./CardMenu";

/**
 * A style's atoms' colours (docs/WORKSPACE.md, *Styles in 3D*): every
 * element's, in the periodic table, each cell in its colour - the elements
 * most drawn in a row above it as well. A click on a cell sets its
 * colour; one changed is ringed, and goes back to its colour set's from
 * its menu, or from the line under the table, which names the element
 * last chosen; all go back at once from the heading.
 */
export default function AtomColours({
  look,
  preset,
  onSet,
  onReset,
}: {
  look: MoleculeLook;
  preset: MoleculeLook;
  /** An element's colour set - or, none, set back to its colour set's. */
  onSet: (el: string, colour: string | null) => void;
  /** These elements' colours set back to their colour set's, at once. */
  onReset: (els: string[]) => void;
}) {
  const set = colourSet3d(look.colourSet);
  const all = elementColours(look, preset);
  const of = new Map(all.map((c) => [c.symbol, c]));
  const changedCount = all.filter((c) => c.changed).length;
  const [chosen, setChosen] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ el: string; x: number; y: number; byKey: boolean } | null>(null);
  const shown = chosen ? BY_SYMBOL.get(chosen) : undefined;
  const shownColour = chosen ? of.get(chosen) : undefined;

  const cell = (symbol: string, big = false) => {
    const e = BY_SYMBOL.get(symbol)!;
    const c = of.get(symbol)!;
    return (
      <label
        key={symbol}
        title={`${nameOf(e)}${c.changed ? " (changed)" : ""}`}
        onContextMenu={(ev) => {
          ev.preventDefault();
          setChosen(symbol);
          setMenu({ el: symbol, x: ev.clientX, y: ev.clientY, byKey: false });
        }}
        onKeyDown={(ev) => {
          if (ev.key === "ContextMenu" || (ev.shiftKey && ev.key === "F10")) {
            ev.preventDefault();
            const r = ev.currentTarget.getBoundingClientRect();
            setChosen(symbol);
            setMenu({ el: symbol, x: r.left, y: r.bottom + 4, byKey: true });
          }
        }}
        style={{ background: c.colour, color: inkOn(c.colour), ...(big ? {} : { gridRow: tablePlace(e.number)!.row, gridColumn: tablePlace(e.number)!.column }) }}
        className={clsx(
          "relative flex items-center justify-center rounded-[3px] font-medium select-none cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accel-base",
          big ? "h-7 w-9 text-xs" : "aspect-square min-w-0 text-[10px] leading-none",
          c.changed ? "ring-2 ring-accel-base ring-offset-1" : "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]",
        )}
      >
        {symbol}
        <input
          type="color"
          value={c.colour.toLowerCase()}
          aria-label={`${nameOf(e)}'s colour`}
          onClick={() => setChosen(symbol)}
          onChange={(ev) => onSet(symbol, ev.target.value.toLowerCase())}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    );
  };

  return (
    <section className="mt-3">
      <div className="flex items-center gap-2">
        <h4 className="flex-1 text-xs font-semibold uppercase tracking-wider text-gh-gray">Atom colours</h4>
        {changedCount > 0 && (
          <button
            onClick={() => onReset(all.filter((c) => c.changed).map((c) => c.symbol))}
            className="h-7 px-2.5 rounded-md border border-gh-line bg-white text-xs text-gh-black hover:bg-gh-base whitespace-nowrap"
            title={`Take ${changedCount === 1 ? "the colour" : `all ${changedCount} colours`} changed back`}
          >
            Back to {set.name}&apos;s colours ({changedCount})
          </button>
        )}
      </div>
      <div className="mt-2 rounded-lg border border-gh-line bg-white px-3 py-2.5">
        <div className="flex flex-wrap gap-1.5" aria-label="Elements most drawn">
          {COMMON.map((el) => cell(el, true))}
        </div>
        {/* (the table fits the column, or scrolls inside its box where it is narrow) */}
        <div className="mt-3 overflow-x-auto">
          <div
            role="group"
            aria-label="Every element"
            className="grid gap-[3px] min-w-[26rem]"
            style={{ gridTemplateColumns: `repeat(${TABLE_COLUMNS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${TABLE_ROWS}, auto)` }}
          >
            {ELEMENTS.map((e) => cell(e.symbol))}
            {SERIES_PLACES.map((p) => (
              <div
                key={p.from}
                style={{ gridRow: p.row, gridColumn: p.column }}
                className="flex items-center justify-center rounded-[3px] border border-dashed border-gh-line text-[8px] leading-none text-gh-gray"
              >
                {p.from}–{p.to}
              </div>
            ))}
            {/* (the gap above the two series) */}
            <div style={{ gridRow: 8, gridColumn: 1 }} className="h-1.5" />
          </div>
        </div>
        <div className="mt-2.5 flex h-7 items-center gap-2 text-xs text-gh-gray">
          {shown && shownColour ? (
            <>
              <span className="h-4 w-4 rounded-[3px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]" style={{ background: shownColour.colour }} />
              <span className="text-gh-black">
                {nameOf(shown)} <span className="text-gh-gray">({shown.symbol}, {shown.number})</span>
              </span>
              <span className="tabular-nums">{shownColour.colour.toLowerCase()}</span>
              {shownColour.changed && (
                <button
                  onClick={() => onSet(shown.symbol, null)}
                  title={`Back to ${set.name}'s colour`}
                  aria-label={`Set ${nameOf(shown)}'s colour back to ${set.name}'s`}
                  className="ml-1 h-6 px-1.5 rounded-md flex items-center gap-1 text-gh-gray hover:bg-gh-base hover:text-gh-black"
                >
                  <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                  {set.name}&apos;s
                </button>
              )}
            </>
          ) : (
            <span>Click an element to set its colour.</span>
          )}
        </div>
      </div>
      {menu && (
        <CardMenu
          at={menu}
          label={`${nameOf(BY_SYMBOL.get(menu.el)!)}'s colour`}
          items={[{ name: `Back to ${set.name}'s colour`, run: () => onSet(menu.el, null), disabled: !of.get(menu.el)?.changed }]}
          onClose={() => setMenu(null)}
        />
      )}
    </section>
  );
}
