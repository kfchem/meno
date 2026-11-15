import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { forwardRef, useState } from "react";
import { EASED } from "../../../theme/motion";
import { useOpening } from "../../../theme/opening";

/**
 * A card's rows, group by group: each row its name and its value, written;
 * `marked`, said in the accent colour; `source`, the reader the groups from
 * it on came from - where two readers' stand on the card; `folded`, its
 * rows shut under its name until it is opened - what would fill the card
 * past what it is of (how a structure was made).
 */
export type CardGroups = {
  source?: string;
  group: string;
  rows: { label: string; text: string; marked?: boolean }[];
  folded?: true;
}[];

/** A group's rows: each its name and value - a value too long for the card goes on to another line, inside it. */
function Rows({ rows }: { rows: CardGroups[number]["rows"] }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
      {rows.map((r, k) => (
        <div key={k} className="contents">
          <span className="text-gh-gray whitespace-nowrap">{r.label}</span>
          <span className={`text-right [overflow-wrap:anywhere] ${r.marked ? "text-accel-accent" : "text-gh-black"}`}>{r.text}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * A group shut under its name, opened and shut by it - its chevron turning -
 * never by the card it is on. Shut, its rows take no room either way.
 * Opened, the card grows to them, wide and tall together, and then they
 * fade in; shut, they fade out, and then the card shrinks back (the
 * maintainer, 2026-10-29).
 */
function FoldedGroup({ group, rows, most }: { group: string; rows: CardGroups[number]["rows"]; most: string }) {
  const [open, setOpen] = useState(false);
  const { grown, shown } = useOpening(open);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        className="flex items-center gap-0.5 text-[10px] text-gh-gray hover:text-gh-black transition-colors duration-150 ease-meno"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <ChevronRightIcon className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-90" : ""}`} style={EASED} strokeWidth={2.5} />
        {group}
      </button>
      <div className="grid" style={{ gridTemplateRows: `${grown}fr`, gridTemplateColumns: `minmax(0, ${grown}fr)`, opacity: shown }}>
        <div className="overflow-hidden min-w-0">
          {/* (laid out at its own width as it opens, and cut on the right until the card has widened to it - never squeezed, its words a letter a line) */}
          <div className="w-max" style={{ maxWidth: most }}>
            <Rows rows={rows} />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Results said group by group - under each reader's name, where there are
 * two - each group's name, then its rows, each its name and value; a group
 * `folded`, shut under its name, and no wider than `most`: the room inside
 * the card it is on.
 */
export function ResultGroups({ groups, most }: { groups: CardGroups; most: string }) {
  return (
    <>
      {groups.map((g, k) => (
        <div key={`${k}:${g.group}`} className="mt-1">
          {g.source && <div className="mt-1.5 text-[10px] font-medium text-gh-black">{g.source}</div>}
          {g.folded ? (
            <FoldedGroup group={g.group} rows={g.rows} most={most} />
          ) : (
            <>
              <div className="text-[10px] text-gh-gray">{g.group}</div>
              <Rows rows={g.rows} />
            </>
          )}
        </div>
      ))}
    </>
  );
}

/**
 * What a calculation found of an atom, or of a bond, said while it is
 * pointed at (lib/calc/results): its name - "C 3", "C 3–C 4" - and its
 * results under it, group by group. Placed beside it by its molecule
 * (Molecule3DView), which fades it in and out; the pointer goes through it.
 */
const PointedCard3D = forwardRef<HTMLDivElement, { title: string; groups: CardGroups }>(function PointedCard3D({ title, groups }, ref) {
  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none select-none w-max max-w-[18rem] rounded-xl border border-gh-line bg-white/90 backdrop-blur shadow-sm px-2.5 py-1.5 text-[11px] leading-[16px] tabular-nums transition-opacity duration-150 ease-meno"
      style={{ opacity: 0 }}
    >
      <div className="text-gh-black font-medium">{title}</div>
      {/* (the card's most, 18rem, less its sides: px-2.5 and its border, the card being border-box) */}
      <ResultGroups groups={groups} most="16.625rem" />
    </div>
  );
});

export default PointedCard3D;
