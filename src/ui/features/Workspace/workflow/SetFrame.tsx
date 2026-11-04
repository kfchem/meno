import clsx from "clsx";
import { useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { WorkflowSet } from "../store/types";
import type { ChartPoint } from "../../../../lib/chart";
import type { DiagramLevel } from "../../../../lib/energyDiagram";
import type { StyleChoice } from "../../../../lib/chem/style";
import { CHART_PX, NAME_DOWN, SET_PAD, PX, SUMMARY_PX, TABLE_PX, tableBodyPx } from "./look";
import { ChartBody, DiagramBody, NumberBody, TableBody } from "./ValueBody";
import { HAIR_LINE, Port } from "./StepCard";
import SummaryBody from "./SummaryBody";

/** How wide the band along a frame's edge is that a press takes to size it, in px. */
const EDGE = 8;

export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type SetFrameProps = {
  set: WorkflowSet;
  /** Its tab's name and count: "Input", "1 structure". */
  name: string;
  count: string;
  hovered: boolean;
  chosen: boolean;
  /** Its words too small to read at this zoom: its frame alone, and what it holds. */
  compact: boolean;
  onTabDown: (e: ReactPointerEvent) => void;
  onEdgeDown: (edge: Edge, e: ReactPointerEvent) => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  onHover: (on: boolean) => void;
  /** A chemist's set: its name changed - two clicks on it, Enter to keep it, Escape to leave it as it was. */
  onRename?: (name: string) => void;
  /**
   * A large result set's (`WorkflowSet.collection`, `drawnCollection`): what it holds, said in its frame
   * where they would lie - molecules in 3D with a sample of them drawn and a chart of their energies
   * (SummaryBody); structures drawn, how many, as yet.
   */
  summary?: { count: string; nouns: string; holds: "molecules" | "conformers" | "structures"; style: StyleChoice };
  /** A chart it holds: a point or a level pressed - the entry it is of shown, where that is on the page. */
  onEntry?: (entry: string | undefined) => void;
  /** Its summary's *Open as a table*: what it holds read in the column. */
  onOpenTable?: () => void;
};

const cursorOf: Record<Edge, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

/**
 * A set (docs/WORKFLOWS.md, *What is on the page*), drawn as Meno's cards
 * are: a rounded frame a hair thick, its name and count along its top,
 * inside it - its top drags it, with all it holds; its edges and corners
 * size it - and a port half-way down its right edge that gives (and, made
 * by a step, one on its left that takes). Its frame darker while its top
 * is under the pointer, in the accent while it is chosen. A chemist's set
 * is named anew with two clicks on its name.
 */
export default function SetFrame(p: SetFrameProps) {
  const [naming, setNaming] = useState<string | null>(null);
  const w = (p.set.x1 - p.set.x0) / PX;
  const h = (p.set.y1 - p.set.y0) / PX;
  const line = p.chosen ? "inset-ring-accel-base" : p.hovered ? "inset-ring-gh-gray" : "inset-ring-gh-line";
  const edge = (e: Edge, style: CSSProperties) => (
    <div key={e} onPointerDown={(ev) => p.onEdgeDown(e, ev)} className="absolute" style={{ pointerEvents: "auto", cursor: cursorOf[e], ...style }} />
  );
  return (
    <div className="meno-fade-in relative select-none" style={{ width: w, height: h, pointerEvents: "none" }} onContextMenu={p.onContextMenu}>
      <div className={clsx("absolute inset-0 rounded-xl transition-shadow duration-150 ease-meno", HAIR_LINE, line)} />
      {edge("n", { left: EDGE, right: EDGE, top: -EDGE / 2, height: EDGE })}
      {edge("s", { left: EDGE, right: EDGE, bottom: -EDGE / 2, height: EDGE })}
      {edge("w", { top: EDGE, bottom: EDGE, left: -EDGE / 2, width: EDGE })}
      {edge("e", { top: EDGE, bottom: EDGE, right: -EDGE / 2, width: EDGE })}
      {edge("nw", { left: -EDGE / 2, top: -EDGE / 2, width: EDGE * 1.5, height: EDGE * 1.5 })}
      {edge("ne", { right: -EDGE / 2, top: -EDGE / 2, width: EDGE * 1.5, height: EDGE * 1.5 })}
      {edge("sw", { left: -EDGE / 2, bottom: -EDGE / 2, width: EDGE * 1.5, height: EDGE * 1.5 })}
      {edge("se", { right: -EDGE / 2, bottom: -EDGE / 2, width: EDGE * 1.5, height: EDGE * 1.5 })}
      <div
        role="button"
        aria-label={`Set: ${p.name}`}
        data-set-tab={p.set.id}
        onPointerDown={p.onTabDown}
        onPointerEnter={() => p.onHover(true)}
        onPointerLeave={() => p.onHover(false)}
        className="absolute flex items-center gap-1.5 whitespace-nowrap overflow-hidden text-[11px] leading-4"
        style={{ left: 0, right: 0, top: 0, height: (2 * NAME_DOWN) / PX, paddingLeft: SET_PAD / PX, paddingRight: SET_PAD / PX, pointerEvents: "auto", cursor: "default" }}
      >
        <span className="meno-words flex items-center gap-1.5">
          {naming != null ? (
            <input
              autoFocus
              aria-label="Set name"
              value={naming}
              onChange={(e) => setNaming(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  p.onRename?.(naming);
                  setNaming(null);
                } else if (e.key === "Escape") setNaming(null);
              }}
              onBlur={() => {
                p.onRename?.(naming);
                setNaming(null);
              }}
              className="font-medium text-gh-black bg-white rounded px-0.5 -mx-0.5 outline-none ring-1 ring-gh-line"
              style={{ width: `${Math.max(6, naming.length + 1)}ch` }}
            />
          ) : (
            <span className="font-medium text-gh-black" onDoubleClick={p.onRename ? () => setNaming(p.set.name ?? p.name) : undefined}>
              {p.name}
            </span>
          )}
          <span className="text-gh-gray">{p.count}</span>
        </span>
      </div>
      {p.summary && (
        <div
          className="meno-words absolute overflow-hidden"
          style={{ left: SET_PAD / PX, right: SET_PAD / PX, top: (2 * NAME_DOWN) / PX, bottom: SET_PAD / PX }}
        >
          {/* (made at its own size, and made smaller to fit a frame sized smaller - by hand, or before it was this large) */}
          {p.set.collection && (
            <div
              className="origin-top-left"
              style={{ width: SUMMARY_PX.w, height: SUMMARY_PX.h, transform: `scale(${Math.min(1, (w - (2 * SET_PAD) / PX) / SUMMARY_PX.w, (h - (2 * NAME_DOWN + SET_PAD) / PX) / SUMMARY_PX.h)})` }}
            >
              <SummaryBody count={p.summary.count} nouns={p.summary.nouns} collection={p.set.collection} holds={p.summary.holds === "conformers" ? "conformers" : "molecules"} style={p.summary.style} onOpenTable={p.onOpenTable} compact={p.compact} />
            </div>
          )}
          {/* (structures drawn held in the set: how many, and that they are on no page - no sample of them drawn yet) */}
          {p.set.drawnCollection && (
            <div className="flex flex-col gap-2" data-set-summary="">
              <div className="flex items-center gap-1.5">
                <span className="text-2xl leading-8 font-medium text-gh-black tabular-nums">{p.summary.count}</span>
                <span className="flex-1 text-xs leading-4 text-gh-gray">{p.summary.nouns}</span>
              </div>
              <span className="-mt-2 text-[10px] leading-4 text-gh-gray">On no page: deleting the set deletes them</span>
            </div>
          )}
        </div>
      )}
      {/* (a table, a number or a chart it holds: what it is, inside it - made smaller to fit a frame sized smaller; a chart's
          points and axes drawn at any zoom, its words alone left out where they are too small to read) */}
      {(p.set.table || p.set.number || p.set.chart) && (
        <div
          className={clsx("absolute overflow-hidden", !p.set.chart && "meno-words")}
          style={{ left: SET_PAD / PX, right: SET_PAD / PX, top: (2 * NAME_DOWN) / PX, bottom: SET_PAD / PX }}
        >
          {p.set.chart ? (
            <div className="origin-top-left" style={{ width: CHART_PX.w, transform: `scale(${Math.min(1, (w - (2 * SET_PAD) / PX) / CHART_PX.w, (h - (2 * NAME_DOWN + SET_PAD) / PX) / CHART_PX.h)})` }}>
              {p.set.chart.kind === "diagram" ? (
                <DiagramBody diagram={p.set.chart} {...(p.onEntry ? { onLevel: (l: DiagramLevel) => p.onEntry!(l.lowest.entry) } : {})} />
              ) : (
                <ChartBody chart={p.set.chart} {...(p.onEntry ? { onPoint: (pt: ChartPoint) => p.onEntry!(pt.entry) } : {})} />
              )}
            </div>
          ) : p.set.table ? (
            <div className="origin-top-left" style={{ width: TABLE_PX.w, transform: `scale(${Math.min(1, (w - (2 * SET_PAD) / PX) / TABLE_PX.w, (h - (2 * NAME_DOWN + SET_PAD) / PX) / tableBodyPx(p.set.table.rows.length))})` }}>
              <TableBody table={p.set.table} />
            </div>
          ) : (
            p.set.number && <NumberBody number={p.set.number} />
          )}
        </div>
      )}
      {p.set.made && <Port look="plain" label={`Into ${p.name}`} data={{}} onPointerDown={(e) => e.stopPropagation()} style={{ left: 0, top: h / 2, pointerEvents: "none" }} of={h} />}
    </div>
  );
}
