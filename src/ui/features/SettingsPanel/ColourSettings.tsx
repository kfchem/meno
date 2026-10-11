import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { PlusIcon } from "@heroicons/react/24/outline";
import { RISE } from "../../theme/motion";
import { useAppSettings } from "../../../lib/settings/appSettings";
import {
  allSets,
  freshName,
  hexOf,
  isBuiltIn,
  newSetId,
  rgbOf,
  setInUse,
  setName,
  SET_COLOURS_MOST,
  SETS_MOST,
  type ColourSet,
} from "../../../lib/chem/palette";

/** A swatch of the set in use, in px. */
const SWATCH = 24;
/** A box to type in, as the drawing style's are. */
const BOX = "h-7 rounded-md border border-gh-line bg-white px-2 text-xs text-gh-black tabular-nums";

/** What is open over the Colours: a set's menu, a colour's menu, or a colour being changed - each where it was asked for, in px from the box. */
type Open = { kind: "set"; id: string; x: number; y: number } | { kind: "swatch" | "edit"; index: number; x: number; y: number };

/**
 * Colours in Settings, General: the sets a part of a structure is given its
 * colour from, in its colour card (docs/EDITOR-2D.md, *Colour*). They are
 * chosen as the drawing style's presets are, the one chosen the one in use;
 * the plus after them begins a set of the user's own, and a set's menu (a
 * right-click) duplicates, renames and deletes it - Meno's and Okabe and
 * Ito's, built in, are only duplicated. The set in use, where it is the
 * user's own, shows its colours to change: two clicks on one opens the
 * system's chooser beside its hex and its red, green and blue; a drag moves
 * it along; its menu takes it out; the plus adds one.
 */
export default function ColourSettings() {
  const colours = useAppSettings((s) => s.colours);
  const setColours = useAppSettings((s) => s.setColours);
  const sets = allSets(colours);
  const chosen = setInUse(colours);
  const own = !isBuiltIn(chosen.id);
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [dragged, setDragged] = useState<number | null>(null);
  useEffect(() => setOpen(null), [chosen.id]);

  const names = sets.map((s) => s.name);
  const ids = colours.sets.map((s) => s.id);
  const put = (set: ColourSet) => setColours({ ...colours, sets: colours.sets.map((s) => (s.id === set.id ? set : s)) });
  const add = (set: ColourSet) => setColours({ use: set.id, sets: [...colours.sets, set] });
  const recolour = (list: string[]) => put({ ...chosen, colours: list });
  // (where a menu or a box opens: at the pointer, in the Colours' own px)
  const at = (e: ReactMouseEvent) => {
    const r = box.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };

  return (
    <div ref={box} className="relative mt-3 rounded-lg border border-gh-line bg-white px-3 py-2.5">
      <div className="text-sm text-gh-black">Colours</div>
      <p className="text-xs leading-snug text-gh-gray mt-0.5 max-w-2xl">
        The set a part of a structure is given its colour from, in its colour card; a highlight and a ring&apos;s fill
        take the colour exactly as it is. Right-click a set to duplicate, rename or delete it, and double-click a
        colour of your own to change it.
      </p>
      {/* the sets, chosen as the drawing style's presets are, and the plus after them */}
      <div role="radiogroup" aria-label="Colour sets" className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
        {sets.map((s) => {
          const on = s.id === chosen.id;
          return (
            <div
              key={s.id}
              role="radio"
              aria-checked={on}
              tabIndex={0}
              onClick={() => setColours({ ...colours, use: s.id })}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setColours({ ...colours, use: s.id })}
              onContextMenu={(e) => {
                e.preventDefault();
                setOpen({ kind: "set", id: s.id, ...at(e) });
              }}
              className={clsx(
                "text-left rounded-lg border px-3 py-2 transition-colors cursor-pointer outline-none",
                on ? "border-accel-base bg-accel-lightbase/40 ring-1 ring-accel-base" : "border-gh-line bg-white hover:bg-gh-base",
              )}
            >
              {renaming?.id === s.id ? (
                <input
                  autoFocus
                  aria-label="Name of the set"
                  value={renaming.name}
                  maxLength={40}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRenaming({ id: s.id, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  onBlur={() => {
                    const name = setName(renaming.name);
                    if (name) put({ ...s, name });
                    setRenaming(null);
                  }}
                  className={clsx(BOX, "w-full text-sm font-medium")}
                />
              ) : (
                <div className="text-sm font-medium text-gh-black truncate">{s.name}</div>
              )}
              <div className="text-[11px] leading-snug text-gh-gray">{isBuiltIn(s.id) ? "Built in" : "Your own"}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {s.colours.map((c) => (
                  <span key={c} className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: c }} />
                ))}
              </div>
            </div>
          );
        })}
        {colours.sets.length < SETS_MOST && (
          <button
            aria-label="New set"
            title="New set"
            onClick={() => add({ id: newSetId(ids), name: freshName("My colours", names), colours: [] })}
            className="rounded-lg border border-dashed border-gh-line text-gh-gray hover:text-gh-black hover:bg-gh-base flex items-center justify-center min-h-[4.5rem] transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        )}
      </div>
      {/* the user's own set in use: its colours to change */}
      {own && (
        <div role="list" aria-label={`Colours of ${chosen.name}`} className="mt-3 flex flex-wrap items-center gap-2">
          {chosen.colours.map((c, i) => (
            <button
              key={c}
              role="listitem"
              aria-label={c}
              title={c}
              draggable
              onDoubleClick={(e) => setOpen({ kind: "edit", index: i, ...at(e) })}
              onContextMenu={(e) => {
                e.preventDefault();
                setOpen({ kind: "swatch", index: i, ...at(e) });
              }}
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
                if (dragged == null || dragged === i) return;
                const list = chosen.colours.slice();
                const [moved] = list.splice(dragged, 1);
                list.splice(i, 0, moved);
                recolour(list);
                setDragged(null);
              }}
              onDragEnd={() => setDragged(null)}
              className={clsx(
                "shrink-0 rounded-full border border-black/10 transition-shadow duration-150 ease-meno",
                open?.kind !== "set" && open?.index === i && "ring-2 ring-offset-1 ring-gh-gray",
                dragged === i && "opacity-40",
              )}
              style={{ width: SWATCH, height: SWATCH, background: c }}
            />
          ))}
          {chosen.colours.length < SET_COLOURS_MOST && (
            <button
              aria-label="Add a colour"
              title="Add a colour"
              onClick={(e) => {
                // (a gray not in it yet, opened to be changed)
                let c = "#808080";
                for (let k = 1; chosen.colours.includes(c); k++) c = hexOf([128 + k, 128 + k, 128 + k]);
                recolour([...chosen.colours, c]);
                setOpen({ kind: "edit", index: chosen.colours.length, ...at(e) });
              }}
              className="shrink-0 rounded-full border border-dashed border-gh-line text-gh-gray hover:text-gh-black flex items-center justify-center"
              style={{ width: SWATCH, height: SWATCH }}
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      {open?.kind === "set" && (
        <Popover x={open.x} y={open.y} onClose={() => setOpen(null)} menu>
          {[
            ...(colours.sets.length < SETS_MOST
              ? [
                  {
                    name: "Duplicate",
                    run: () => {
                      const s = sets.find((x) => x.id === open.id)!;
                      add({ id: newSetId(ids), name: freshName(`${s.name} copy`, names), colours: [...s.colours] });
                    },
                  },
                ]
              : []),
            ...(isBuiltIn(open.id)
              ? []
              : [
                  { name: "Rename", run: () => setRenaming({ id: open.id, name: sets.find((x) => x.id === open.id)!.name }) },
                  {
                    name: "Delete",
                    run: () => setColours({ use: colours.use === open.id ? "meno" : colours.use, sets: colours.sets.filter((s) => s.id !== open.id) }),
                  },
                ]),
          ].map((item) => (
            <MenuItem key={item.name} name={item.name} run={() => (setOpen(null), item.run())} />
          ))}
        </Popover>
      )}
      {open?.kind === "swatch" && (
        <Popover x={open.x} y={open.y} onClose={() => setOpen(null)} menu>
          <MenuItem name="Change…" run={() => setOpen({ ...open, kind: "edit" })} />
          <MenuItem name="Remove" run={() => (setOpen(null), recolour(chosen.colours.filter((_, i) => i !== open.index)))} />
        </Popover>
      )}
      {open?.kind === "edit" && chosen.colours[open.index] && (
        <Popover x={open.x} y={open.y} onClose={() => setOpen(null)}>
          <ColourFields
            colour={chosen.colours[open.index]}
            onChange={(c) => {
              if (chosen.colours.some((x, i) => x === c && i !== open.index)) return;
              recolour(chosen.colours.map((x, i) => (i === open.index ? c : x)));
            }}
          />
        </Popover>
      )}
    </div>
  );
}

/** A menu's or a small box's card, where it was asked for; it closes on Escape and on a press elsewhere. */
function Popover({ x, y, onClose, menu, children }: { x: number; y: number; onClose: () => void; menu?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onPress = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPress, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPress, true);
    };
  }, [onClose]);
  return (
    <motion.div
      ref={ref}
      {...RISE}
      role={menu ? "menu" : "dialog"}
      className={clsx("absolute z-50 rounded-md border border-gh-line bg-white shadow-lg text-sm text-gh-black", menu ? "py-1 min-w-[9rem]" : "p-2")}
      style={{ left: x, top: y + 4 }}
    >
      {children}
    </motion.div>
  );
}

function MenuItem({ name, run }: { name: string; run: () => void }) {
  return (
    <button role="menuitem" onClick={run} className="w-full h-8 px-3 flex items-center text-left whitespace-nowrap transition-colors duration-150 ease-meno hover:bg-gh-base focus:bg-gh-base outline-none">
      {name}
    </button>
  );
}

/**
 * One colour, to change: in the system's own chooser, as hex (#rrggbb) or as
 * red, green and blue (0 to 255 each), which keep in step - what is typed
 * taken as soon as it is a colour, and put back as it was on leaving the
 * box where it is not one.
 */
function ColourFields({ colour, onChange }: { colour: string; onChange: (c: string) => void }) {
  const [hex, setHex] = useState(colour);
  const [rgb, setRgb] = useState(rgbOf(colour).map(String));
  useEffect(() => {
    setHex(colour);
    setRgb(rgbOf(colour).map(String));
  }, [colour]);
  const typedHex = (v: string) => {
    setHex(v);
    const c = (v.startsWith("#") ? v : `#${v}`).toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(c)) onChange(c);
  };
  const typedRgb = (k: number, v: string) => {
    const next = rgb.map((x, i) => (i === k ? v : x));
    setRgb(next);
    const n = next.map((x) => (/^\d{1,3}$/.test(x.trim()) ? Number(x) : NaN));
    if (n.every((x) => x >= 0 && x <= 255)) onChange(hexOf(n as [number, number, number]));
  };
  const back = () => {
    setHex(colour);
    setRgb(rgbOf(colour).map(String));
  };
  return (
    <div className="flex items-center gap-3 text-xs text-gh-gray">
      <input type="color" aria-label="Colour" value={colour} onChange={(e) => onChange(e.target.value.toLowerCase())} className="h-7 w-9 rounded-md border border-gh-line bg-white p-0.5" />
      <label className="flex items-center gap-1.5">
        Hex
        <input aria-label="Hex" value={hex} maxLength={7} onChange={(e) => typedHex(e.target.value.trim())} onBlur={back} className={clsx(BOX, "w-20 font-mono")} />
      </label>
      {(["R", "G", "B"] as const).map((name, k) => (
        <label key={name} className="flex items-center gap-1.5">
          {name}
          <input
            aria-label={name === "R" ? "Red" : name === "G" ? "Green" : "Blue"}
            inputMode="numeric"
            value={rgb[k]}
            maxLength={3}
            onChange={(e) => typedRgb(k, e.target.value)}
            onBlur={back}
            className={clsx(BOX, "w-12")}
          />
        </label>
      ))}
    </div>
  );
}
