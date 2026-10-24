import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { numberText } from "../../../../lib/calc/results";
import type { Cell, TableColumn } from "../../../../lib/table";
import { useEditor, useEditorStore } from "../store";
import type { WorkflowSet } from "../store/types";
import { setName } from "./doers";
import { SMILES_DRAWING_COLUMN, SMILES_RECORD_COLUMN, sortedRows } from "./structuresTable";
import { setStructuresTable } from "./run";
import { ROW_PX } from "./SetTableBody";
import { DURATION } from "../../../theme/motion";

/** How many rows are drawn beyond those in view, each way: none blank as it scrolls. */
const BEYOND = 8;

/** A column's name as its head shows it: a number's with its unit. */
const headOf = (c: TableColumn) => (c.kind === "number" && c.unit !== "none" ? `${c.name} (${c.unit})` : c.name);
/** A cell as the table shows it: a number as Meno writes numbers, true or false, text as it is, none blank. */
const cellText = (v: Cell) => (v == null ? "" : typeof v === "number" ? numberText(v) : typeof v === "boolean" ? (v ? "true" : "false") : v);
/** How wide a column is - the same in every row, each a grid of its own: a number's narrow, SMILES's widest. */
const widthOf = (c: TableColumn) => (c.name === SMILES_RECORD_COLUMN || c.name === SMILES_DRAWING_COLUMN ? "minmax(14rem, 2fr)" : c.kind === "number" ? "7rem" : "minmax(8rem, 1fr)");

/**
 * A set of structures drawn read as a table in the column (docs/WORKFLOWS.md,
 * *A structures set as a table*): a row for each structure it holds - on
 * the page and off it, all of them - its place, its SMILES, its state, why
 * it was set aside where it was, and each value its record holds, under its
 * own name and unit; sorted by any column, its name pressed, once up and
 * again down; as many rows as there are drawn only where they are seen.
 */
export default function StructuresTableBody({ set }: { set: WorkflowSet }) {
  const store = useEditorStore();
  const steps = useEditor((s) => s.steps);
  const model = useEditor((s) => s.model);
  // (worked out again as the set changes, or the drawing it reads)
  const table = useMemo(() => setStructuresTable({ ...store.getState(), model }, set), [store, model, set]);
  // (its id and what it is are for a chart's points: the place said once, as #)
  const shown = useMemo(() => table.columns.map((c, i) => ({ c, i })).slice(2), [table]);
  const [sort, setSort] = useState<{ at: number; down: boolean } | null>(null);
  // (those with no value - none, or not worked out - last whichever way it is sorted)
  const order = useMemo(() => (sort ? sortedRows(table, sort.at, sort.down) : table.rows.map((_, k) => k)).map((k) => ({ r: table.rows[k], k })), [table, sort]);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const [view, setView] = useState({ top: 0, height: 0, more: false });
  // (where it is now, and whether more columns lie to its right than are seen: a fade there says so)
  const look = (el: HTMLDivElement) => setView({ top: el.scrollTop, height: el.clientHeight, more: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
  useEffect(() => {
    if (!body) return;
    const seen = new ResizeObserver(() => look(body));
    seen.observe(body);
    if (body.firstElementChild) seen.observe(body.firstElementChild);
    look(body);
    return () => seen.disconnect();
  }, [body, table]);
  const first = Math.max(0, Math.floor(view.top / ROW_PX) - 1 - BEYOND);
  const last = Math.min(order.length, Math.ceil((view.top + view.height) / ROW_PX) + BEYOND);
  const grid = ["3rem", ...shown.map(({ c }) => widthOf(c))].join(" ");
  const name = setName(set, steps);
  const n = table.rows.length;
  const left = table.left.map((l) => `${l.column}: ${l.why}`).join("\n");

  return (
    <div className="absolute inset-0 flex flex-col bg-white text-xs text-gh-black">
      <div className="h-9 shrink-0 flex items-center gap-2 px-3 border-b border-gh-line">
        <span className="flex-1 min-w-0 truncate text-gh-gray" title={left || name}>
          {`${n.toLocaleString("en-US")} ${n === 1 ? "structure" : "structures"} · ${shown.length} ${shown.length === 1 ? "column" : "columns"}`}
          {table.left.length ? ` · ${table.left.length} not a column` : ""}
        </span>
      </div>
      <div className="relative flex-1 min-h-0">
      <div ref={setBody} onScroll={(e) => look(e.currentTarget)} className="absolute inset-0 overflow-auto">
        <div role="grid" aria-label={name} aria-rowcount={n + 1} className="w-max min-w-full">
          <div role="row" className="sticky top-0 z-10 grid pr-3 bg-white border-b border-gh-line text-gh-gray" style={{ gridTemplateColumns: grid, height: ROW_PX }}>
            {[{ name: "#", at: -1, numeric: true, title: "Its place in the set, in the step's order" }, ...shown.map(({ c, i }) => ({ name: headOf(c), at: i, numeric: c.kind === "number", title: headOf(c) }))].map((h) => {
              const on = h.at >= 0 ? sort?.at === h.at : !sort;
              return (
                <div key={h.name} role="columnheader" aria-sort={on && sort ? (sort.down ? "descending" : "ascending") : "none"} className="min-w-0">
                  <button
                    title={h.title}
                    onClick={() => setSort(h.at < 0 ? null : on ? { at: h.at, down: !sort!.down } : { at: h.at, down: false })}
                    className={clsx("w-full h-full px-2 flex items-center gap-0.5 whitespace-nowrap hover:text-gh-black transition-colors duration-150 ease-meno", h.numeric && "justify-end", on && "text-gh-black")}
                  >
                    <span className="truncate">{h.name}</span>
                    {/* (its room kept whether or not it is sorted by: a name set to the right does not move as the sort comes and goes) */}
                    {on && sort?.down ? <ChevronDownIcon className="h-3 w-3 shrink-0" /> : <ChevronUpIcon className={clsx("h-3 w-3 shrink-0", !(on && sort) && "invisible")} />}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="relative" style={{ height: order.length * ROW_PX }}>
            {order.slice(first, last).map(({ r, k }, j) => (
              <div
                key={k}
                role="row"
                aria-rowindex={first + j + 2}
                className="absolute inset-x-0 grid pr-3 tabular-nums cursor-default hover:bg-gh-base/60"
                style={{ gridTemplateColumns: grid, height: ROW_PX, top: (first + j) * ROW_PX }}
              >
                <div role="gridcell" className="min-w-0 px-2 flex items-center justify-end text-gh-gray">
                  {k + 1}
                </div>
                {shown.map(({ c, i }) => (
                  <div key={c.name} role="gridcell" className={clsx("min-w-0 px-2 flex items-center", c.kind === "number" && "justify-end")}>
                    <span className="truncate" title={typeof r[i] === "string" ? cellText(r[i]) : undefined}>
                      {cellText(r[i])}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* (more columns to its right than are seen: a fade at its edge, gone once it is scrolled to the end) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent transition-opacity ease-meno"
        style={{ opacity: view.more ? 1 : 0, transitionDuration: `${DURATION.quick * 1000}ms` }}
      />
      </div>
    </div>
  );
}
