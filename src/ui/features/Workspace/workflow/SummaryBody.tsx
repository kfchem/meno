import { useEffect, useMemo, useState } from "react";
import { styleOf, type StyleChoice } from "../../../../lib/chem/style";
import type { Molecule3D } from "../store/types";
import { chartOf, sampleOf, type Bin, type Chart } from "./setSummary";
import { sampleDrawings, type Cell } from "./sampleDrawings";

/** A cell of the sample's grid, in px: four to a row, three rows. */
const CELL = { w: 104, h: 84 };
/** The chart's bars, in px. */
const CHART = { w: 448, h: 56 };

type Collection = readonly Omit<Molecule3D, "id" | "at">[];

// (a collection's drawings, made once for each style it is drawn in: a collection changed is a new one)
const drawings = new WeakMap<Collection, Map<string, Promise<Cell[]>>>();

function drawingsOf(collection: Collection, picks: readonly { molecule: number; frame: number }[], choice: StyleChoice): Promise<Cell[]> {
  const key = JSON.stringify(choice);
  let of = drawings.get(collection);
  if (!of) drawings.set(collection, (of = new Map()));
  let made = of.get(key);
  if (!made) {
    made = sampleDrawings(
      picks.map((p) => ({ m: collection[p.molecule], frame: p.frame })),
      styleOf(choice),
    );
    of.set(key, made);
  }
  return made;
}

const fixed = (v: number) => (Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1));

/**
 * A cell's picture at `scale` of the style's own size: every structure at
 * one scale, so that their bonds are alike. An image of its SVG, not the
 * SVG laid into the page: the summary lies on the page's layer, turned in
 * 3D, where the drawing's words - its labels - are too small for the view
 * to draw them.
 */
function Drawing({ cell, scale }: { cell: Extract<Cell, { svg: string }>; scale: number }) {
  return (
    <div className="flex items-center justify-center" style={{ width: CELL.w, height: CELL.h }}>
      <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(cell.svg)}`} width={cell.w * scale} height={cell.h * scale} alt="" draggable={false} />
    </div>
  );
}

function Bars({ bins, unit }: { bins: readonly Bin[]; unit: string }) {
  const most = Math.max(...bins.map((b) => b.count));
  const w = CHART.w / bins.length;
  return (
    <svg width={CHART.w} height={CHART.h} className="block" role="img" aria-label="Histogram">
      {bins.map((b, i) => {
        const h = most ? (b.count / most) * (CHART.h - 1) : 0;
        return (
          <rect key={i} x={i * w + 0.5} y={CHART.h - h} width={Math.max(0, w - 1)} height={h} className="fill-gh-gray/40">
            <title>{`${fixed(b.from)} to ${fixed(b.to)} ${unit}: ${b.count.toLocaleString("en-US")}`}</title>
          </rect>
        );
      })}
      <line x1={0} x2={CHART.w} y1={CHART.h - 0.5} y2={CHART.h - 0.5} className="stroke-gh-line" />
    </svg>
  );
}

function ChartOf({ chart }: { chart: Chart }) {
  if ("none" in chart) return <div className="text-[10px] leading-4 text-gh-gray">{chart.none}</div>;
  const left = chart.left.map((l) => `${l.count.toLocaleString("en-US")} ${l.why}, not charted`).join(" · ");
  return (
    <div className="flex flex-col gap-0.5" data-set-chart="">
      <div className="text-[10px] leading-4 text-gh-black truncate">
        {chart.quantity} ({chart.unit}) <span className="text-gh-gray">· {chart.by} · {chart.counted.toLocaleString("en-US")} entries</span>
      </div>
      <Bars bins={chart.bins} unit={chart.unit} />
      <div className="flex justify-between text-[10px] leading-3 text-gh-gray tabular-nums" style={{ width: CHART.w }}>
        <span>{fixed(chart.bins[0].from)}</span>
        <span>{fixed(chart.bins[chart.bins.length - 1].to)}</span>
      </div>
      {left && <div className="text-[10px] leading-4 text-gh-gray truncate">{left}</div>}
    </div>
  );
}

/**
 * A large result set summed up in its frame (docs/WORKFLOWS.md, *A large
 * result set*): how many it holds; a grid of a sample of its structures,
 * drawn in 2D by Meno's engine - one not shown as given marked so, one not
 * drawn saying why - with what the sample is of; and a histogram of its
 * entries' energies, saying what of, in what units, by what, and of how many.
 */
export default function SummaryBody(p: { count: string; nouns: string; collection: Collection; holds: "molecules" | "conformers"; style: StyleChoice }) {
  // (the workspace's drawing style, given: the frame is drawn on the workflow's layer, outside the editor's store)
  const choice = p.style;
  const sample = useMemo(() => sampleOf(p.collection, p.holds), [p.collection, p.holds]);
  const chart = useMemo(() => chartOf(p.collection, p.holds), [p.collection, p.holds]);
  const [cells, setCells] = useState<Cell[] | null>(null);
  useEffect(() => {
    let live = true;
    setCells(null);
    drawingsOf(p.collection, sample.picks, choice).then(
      (c) => live && setCells(c),
      (e: unknown) => live && setCells(sample.picks.map(() => ({ why: e instanceof Error ? e.message : String(e) }))),
    );
    return () => {
      live = false;
    };
  }, [p.collection, sample, choice]);
  // (one scale for all: the largest fits its cell)
  const scale = useMemo(() => {
    const drawn = (cells ?? []).filter((c): c is Extract<Cell, { svg: string }> => "svg" in c && c.w > 0 && c.h > 0);
    return drawn.length ? Math.min(1, ...drawn.map((c) => Math.min((CELL.w - 8) / c.w, (CELL.h - 8) / c.h))) : 1;
  }, [cells]);
  return (
    <div className="flex flex-col gap-2 w-full" data-set-summary="">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl leading-8 font-medium text-gh-black tabular-nums">{p.count}</span>
        <span className="text-xs leading-4 text-gh-gray">{p.nouns}</span>
      </div>
      <div className="grid grid-cols-4" style={{ width: 4 * CELL.w }}>
        {sample.picks.map((s, i) => {
          const c = cells?.[i];
          return (
            <div key={s.molecule} className="relative" style={{ width: CELL.w, height: CELL.h }}>
              {!c ? (
                <div className="flex items-center justify-center h-full text-[10px] text-gh-gray">Drawing…</div>
              ) : "why" in c ? (
                <div className="flex items-center justify-center h-full px-1 text-center text-[10px] leading-3 text-gh-gray" title={c.why}>
                  Not drawn
                </div>
              ) : (
                <>
                  <Drawing cell={c} scale={scale} />
                  {c.notAsGiven.length > 0 && (
                    <span className="absolute top-0.5 right-0.5 rounded px-1 text-[9px] leading-3 bg-white text-accel-accent ring-1 ring-accel-accent" title={c.notAsGiven.join("\n")}>
                      Not as given
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="text-[10px] leading-4 text-gh-gray">{sample.said}</div>
      <ChartOf chart={chart} />
    </div>
  );
}
