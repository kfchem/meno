import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { useEditor, useEditorStore } from "../store";
import type { WorkflowSet } from "../store/types";
import { setName } from "./doers";
import { setMolecules } from "./entries";
import { aboveSaid, chooseRows, chosenMolecules, sortRows, tableRows, type SortKey, type TableRow } from "./setTable";

/** How tall a row is, in px: the column's text, one line. */
export const ROW_PX = 24;
/** How many rows are drawn beyond those in view, each way: none blank as it scrolls. */
const BEYOND = 8;

type Column = {
  /** What it is sorted by; none, a column not sorted by. */
  key: SortKey | null;
  name: string;
  /** Said where the pointer rests on its name. */
  title: string;
  width: string;
  /** A number, set to the right. */
  numeric?: boolean;
  text: (row: TableRow) => string;
};

const fixed = (digits: number) => (v: number | undefined) => (v == null ? "" : v.toFixed(digits));

/**
 * A set's columns, as its rows have them: its place; in a conformer set its
 * compound and conformer; its name; its energy, in hartrees, with what
 * worked it out, and its energy above its compound's lowest, in kcal/mol;
 * and how many forms of it were found alike.
 */
function columnsOf(rows: readonly TableRow[]): Column[] {
  const has = (k: keyof TableRow) => rows.some((r) => r[k] != null);
  return [
    { key: "at", name: "#", title: "Its place in the set, in the step's order", width: "3rem", numeric: true, text: (r) => String(r.at + 1) },
    ...(has("compound") ? [{ key: "compound", name: "Compound", title: "Its compound, by its letter in the set", width: "4.75rem", text: (r: TableRow) => r.compound ?? "" } as Column] : []),
    ...(has("number") ? [{ key: "number", name: "Conformer", title: "Its number among its compound's conformers", width: "5rem", numeric: true, text: (r: TableRow) => (r.number != null ? String(r.number) : "") } as Column] : []),
    ...(has("name") ? [{ key: "name", name: "Name", title: "Its name", width: "minmax(6rem, 1fr)", text: (r: TableRow) => r.name ?? "" } as Column] : []),
    ...(has("energy") ? [{ key: "energy", name: "E (Eh)", title: "Its energy, in hartrees", width: "7rem", numeric: true, text: (r: TableRow) => fixed(6)(r.energy) } as Column] : []),
    ...(has("above")
      ? [
          {
            key: "above",
            name: aboveSaid(rows) ? "ΔE (kcal/mol)*" : "ΔE (kcal/mol)",
            title: `Its energy above its compound's lowest, in kcal/mol, among energies worked out the same way${aboveSaid(rows) ? ` - ${aboveSaid(rows)}` : ""}`,
            width: "7rem",
            numeric: true,
            text: (r: TableRow) => fixed(2)(r.above),
          } as Column,
        ]
      : []),
    ...(has("failed") ? [{ key: null, name: "Failed", title: "Where it did not finish: why, in words - its energy no result", width: "minmax(6rem, 1fr)", text: (r: TableRow) => r.failed ?? "" } as Column] : []),
    ...(has("degeneracy") ? [{ key: "degeneracy", name: "Alike", title: "How many forms of it the search found alike", width: "4rem", numeric: true, text: (r: TableRow) => (r.degeneracy != null ? String(r.degeneracy) : "") } as Column] : []),
    ...(has("energy") ? [{ key: null, name: "From", title: "What worked its energy out", width: "minmax(7rem, 2fr)", text: (r: TableRow) => (r.energy != null ? r.from || "not stated" : "") } as Column] : []),
  ];
}

/**
 * A set read as a table in the column (docs/WORKFLOWS-FOUNDATION.md, *What
 * a set shows*): a row for each entry, in the step's order, sorted by any
 * column - its name pressed, once up and again down - and as many rows as
 * there are drawn only where they are seen. Rows are chosen as in a list -
 * a click, ⌘ or Ctrl with it to add or take one, Shift to take those
 * between - and *Put on the page* puts those chosen there, each a molecule
 * of its own, as a set of their own beside it.
 */
export default function SetTableBody({ set }: { set: WorkflowSet }) {
  const store = useEditorStore();
  const steps = useEditor((s) => s.steps);
  const holds = set.made?.holds === "conformers" ? "conformers" : "molecules";
  // (worked out again only as what it holds changes - not as its frame is moved)
  const collection = set.collection;
  const rows = useMemo(() => (collection ? tableRows(setMolecules(store.getState(), { x0: 0, x1: 0, y0: 0, y1: 0, collection }), holds) : []), [store, collection, holds]);
  const columns = useMemo(() => columnsOf(rows), [rows]);
  const [sort, setSort] = useState<{ key: SortKey; down: boolean }>({ key: "at", down: false });
  const sorted = useMemo(() => (sort.key === "at" && !sort.down ? rows : sortRows(rows, sort.key, sort.down)), [rows, sort]);
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set());
  const anchor = useRef<number | null>(null);
  // (what it held changed - the step run again: nothing chosen of what it was)
  useEffect(() => {
    setChosen(new Set());
    anchor.current = null;
  }, [rows]);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const [view, setView] = useState({ top: 0, height: 0 });
  useEffect(() => {
    if (!body) return;
    const seen = new ResizeObserver(() => setView({ top: body.scrollTop, height: body.clientHeight }));
    seen.observe(body);
    setView({ top: body.scrollTop, height: body.clientHeight });
    return () => seen.disconnect();
  }, [body]);
  // (the rows in view, under the row of names)
  const first = Math.max(0, Math.floor(view.top / ROW_PX) - 1 - BEYOND);
  const last = Math.min(sorted.length, Math.ceil((view.top + view.height) / ROW_PX) + BEYOND);
  const grid = columns.map((c) => c.width).join(" ");
  const name = setName(set, steps);

  const choose = (row: TableRow, e: React.MouseEvent) => {
    const next = chooseRows(sorted, chosen, anchor.current, row.at, { add: e.metaKey || e.ctrlKey, range: e.shiftKey });
    anchor.current = next.anchor;
    setChosen(next.chosen);
  };

  const putOnPage = () => {
    const ms = chosenMolecules(rows, chosen);
    const id = store.getState().placeAsSet(ms, { x: set.x1 + (set.x1 - set.x0) / 2, y: (set.y0 + set.y1) / 2 }, `From ${name}`);
    const made = id != null ? store.getState().sets.find((b) => b.id === id) : undefined;
    if (made) store.getState().requestShow(made);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-white text-xs text-gh-black">
      <div className="h-9 shrink-0 flex items-center gap-2 px-3 border-b border-gh-line">
        <span className="flex-1 min-w-0 truncate text-gh-gray" title={name}>
          {chosen.size ? `${chosen.size.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")} chosen` : `${rows.length.toLocaleString("en-US")} ${holds === "conformers" ? "conformers" : rows.length === 1 ? "molecule" : "molecules"}`}
          {aboveSaid(rows) ? ` · ΔE ${aboveSaid(rows)}` : ""}
        </span>
        <button
          onClick={putOnPage}
          disabled={!chosen.size}
          className="h-7 shrink-0 rounded-md px-2 transition-colors duration-150 ease-meno enabled:hover:bg-gh-base disabled:text-gh-gray"
        >
          Put on the page
        </button>
      </div>
      {/* (one scroll for its names and its rows: they stay in line as it goes sideways, its names at the top as it goes down) */}
      <div ref={setBody} onScroll={(e) => setView({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })} className="flex-1 min-h-0 overflow-auto">
        <div role="grid" aria-label={name} aria-rowcount={rows.length + 1} className="w-max min-w-full">
          <div role="row" className="sticky top-0 z-10 grid bg-white border-b border-gh-line text-gh-gray" style={{ gridTemplateColumns: grid, height: ROW_PX }}>
            {columns.map((c) => {
              const on = c.key != null && sort.key === c.key;
              return (
                <div key={c.name} role="columnheader" aria-sort={on ? (sort.down ? "descending" : "ascending") : "none"} className="min-w-0">
                  {c.key ? (
                    <button
                      title={c.title}
                      onClick={() => setSort(on ? { key: c.key!, down: !sort.down } : { key: c.key!, down: false })}
                      className={clsx("w-full h-full px-2 flex items-center gap-0.5 whitespace-nowrap hover:text-gh-black transition-colors duration-150 ease-meno", c.numeric && "justify-end", on && "text-gh-black")}
                    >
                      <span>{c.name}</span>
                      {on && (sort.down ? <ChevronDownIcon className="h-3 w-3 shrink-0" /> : <ChevronUpIcon className="h-3 w-3 shrink-0" />)}
                    </button>
                  ) : (
                    <span title={c.title} className="h-full px-2 flex items-center whitespace-nowrap">
                      {c.name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="relative" style={{ height: sorted.length * ROW_PX }}>
            {sorted.slice(first, last).map((r, k) => (
              <div
                key={r.at}
                role="row"
                aria-rowindex={first + k + 2}
                aria-selected={chosen.has(r.at)}
                onClick={(e) => choose(r, e)}
                className={clsx("absolute inset-x-0 grid tabular-nums cursor-default select-none", chosen.has(r.at) ? "bg-gh-base" : "hover:bg-gh-base/60")}
                style={{ gridTemplateColumns: grid, height: ROW_PX, top: (first + k) * ROW_PX }}
              >
                {columns.map((c) => (
                  <div key={c.name} role="gridcell" className={clsx("min-w-0 px-2 flex items-center", c.numeric && "justify-end", c.key == null && "text-gh-gray")}>
                    <span className="truncate" title={c.key == null ? c.text(r) : undefined}>
                      {c.text(r)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
