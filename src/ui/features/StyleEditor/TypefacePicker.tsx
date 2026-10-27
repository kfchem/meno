import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_LABEL_FAMILY } from "../../../lib/chem/labelFonts";
import {
  BUNDLED_TYPEFACES,
  useLabelFonts,
  useSystemTypefaces,
  useTypefaces,
} from "../../fonts/typefaces";

/**
 * Picks the typeface labels are set in: those that come with Meno and those
 * the journals' styles use first, then every one on this computer, each
 * shown in itself. Below it, what became of the one picked, if it cannot be
 * used as it is.
 */
export default function TypefacePicker({
  value,
  suggested,
  label,
  onChange,
}: {
  value: string;
  suggested: readonly string[];
  label: string;
  onChange: (family: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const system = useSystemTypefaces();
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useTypefaces(value);
  const state = useLabelFonts((s) => s.state[value]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (f: string) => !q || f.toLowerCase().includes(q);
    const first = suggested.filter(match);
    const shown = new Set(suggested.map((f) => f.toLowerCase()));
    const rest = system.filter((f) => !shown.has(f.toLowerCase()) && match(f));
    return [
      { title: "Suggested", families: first },
      { title: "On this computer", families: rest },
    ].filter((g) => g.families.length > 0);
  }, [query, suggested, system]);
  const flat = groups.flatMap((g) => g.families);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (family: string) => {
    onChange(family);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={box} className="relative flex flex-col items-end gap-1">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="h-7 min-w-[11rem] max-w-[16rem] rounded-md border border-gh-line bg-white pl-2 pr-1 text-sm text-gh-black flex items-center justify-between gap-2"
      >
        <span className="truncate" style={{ fontFamily: `'${value}'` }}>
          {value}
        </span>
        <ChevronUpDownIcon className="h-4 w-4 shrink-0 text-gh-gray" />
      </button>
      {(state === "missing" || state === "unreadable") && (
        <span className="text-[11px] text-accel-accent max-w-[16rem] text-right">
          {state === "missing"
            ? `Not on this computer: drawn in ${DEFAULT_LABEL_FAMILY}.`
            : `Its file cannot be read: drawn in ${DEFAULT_LABEL_FAMILY}.`}
        </span>
      )}
      {open && (
        <div className="absolute right-0 top-8 z-30 w-72 rounded-lg border border-gh-line bg-white shadow-lg">
          <div className="p-2 border-b border-gh-line">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a typeface"
              aria-label="Find a typeface"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, flat.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter" && flat[active]) {
                  e.preventDefault();
                  pick(flat[active]);
                } else if (e.key === "Escape") {
                  // (the list closed, not what it is in: a card round it)
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
              className="w-full h-7 rounded-md border border-gh-line px-2 text-sm outline-none focus:border-accel-base focus:ring-2 focus:ring-accel-lightbase"
            />
          </div>
          <ul
            ref={list}
            role="listbox"
            aria-label={label}
            className="max-h-72 overflow-auto py-1"
          >
            {groups.map((g) => (
              <li key={g.title}>
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gh-gray">
                  {g.title}
                </div>
                <ul>
                  {g.families.map((family) => {
                    const index = flat.indexOf(family);
                    return (
                      <li
                        key={family}
                        role="option"
                        aria-selected={family === value}
                        data-index={index}
                        onMouseEnter={() => setActive(index)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pick(family)}
                        className={clsx(
                          "px-3 py-1.5 text-sm flex items-center justify-between gap-2 cursor-default",
                          index === active && "bg-gh-base",
                        )}
                      >
                        <span
                          className="truncate"
                          style={{ fontFamily: `'${family}'` }}
                        >
                          {family}
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          {family in BUNDLED_TYPEFACES && (
                            <span className="text-[10px] text-gh-gray">
                              with Meno
                            </span>
                          )}
                          {family === value && (
                            <CheckIcon className="h-4 w-4 text-accel-base" />
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {flat.length === 0 && (
              <li className="px-3 py-2 text-xs text-gh-gray">
                No typeface matches.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
