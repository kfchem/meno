import { forwardRef } from "react";

/**
 * A card's rows, group by group: each row its name and its value, written;
 * `marked`, said in the accent colour; `source`, the reader the groups from
 * it on came from - where two readers' stand on the card.
 */
export type CardGroups = {
  source?: string;
  group: string;
  rows: { label: string; text: string; marked?: boolean }[];
}[];

/** Results said group by group - under each reader's name, where there are two - each group's name, then its rows, each its name and value. */
export function ResultGroups({ groups }: { groups: CardGroups }) {
  return (
    <>
      {groups.map((g, k) => (
        <div key={`${k}:${g.group}`} className="mt-1">
          {g.source && <div className="mt-1.5 text-[10px] font-medium text-gh-black">{g.source}</div>}
          <div className="text-[10px] text-gh-gray">{g.group}</div>
          {/* (a value too long for the card goes on to another line, inside it) */}
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
            {g.rows.map((r, k) => (
              <div key={k} className="contents">
                <span className="text-gh-gray whitespace-nowrap">{r.label}</span>
                <span className={`text-right [overflow-wrap:anywhere] ${r.marked ? "text-accel-accent" : "text-gh-black"}`}>{r.text}</span>
              </div>
            ))}
          </div>
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
      <ResultGroups groups={groups} />
    </div>
  );
});

export default PointedCard3D;
