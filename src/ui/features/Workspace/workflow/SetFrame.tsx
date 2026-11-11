import clsx from "clsx";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { WorkflowSet } from "../store/types";
import type { ChartPoint } from "../../../../lib/chart";
import type { DiagramLevel } from "../../../../lib/energyDiagram";
import { CHART_PX, NAME_DOWN, SET_PAD, PX, TABLE_PX, tableBodyPx } from "./look";
import { ChartBody, DiagramBody, NumberBody, TableBody } from "./ValueBody";

export type SetFrameProps = {
  set: WorkflowSet;
  /** Its tab's name: "Input". */
  name: string;
  /** Its words too small to read at this zoom: what it holds, as such. */
  compact: boolean;
  onContextMenu: (e: ReactMouseEvent) => void;
  /**
   * A large result set's (`WorkflowSet.collection`, `drawnCollection`): what it holds, said in its frame.
   * Molecules in 3D are drawn in it, one at a time (workflow/heldView), by WebGL: its words are the count
   * in its tab and *Open as a table*; structures drawn, how many, as yet.
   */
  summary?: { count: string; nouns: string };
  /** A chart it holds: a point or a level pressed - the entry it is of shown, where that is on the page. */
  onEntry?: (entry: string | undefined) => void;
  /** Its *Open as a table*: what it holds read in the column. */
  onOpenTable?: () => void;
};

/**
 * What a set holds, inside its frame (docs/WORKFLOWS.md, *What is on the
 * page*): a large result set's summary, a table, a number or a chart -
 * HTML still; its frame, its tab and its edges, which drag and size it,
 * and its ports are drawn by WebGL (pageGl/FrameTabs, pageGl/ports). Its
 * name, while a chemist names it anew, in a field over its tab.
 */
export default function SetFrame(p: SetFrameProps) {
  const w = (p.set.x1 - p.set.x0) / PX;
  const h = (p.set.y1 - p.set.y0) / PX;
  return (
    <div className="meno-fade-in relative select-none" style={{ width: w, height: h, pointerEvents: "none" }} onContextMenu={p.onContextMenu}>
      {/* (molecules in 3D held in the set: drawn one at a time by WebGL, its count in its tab - and what it holds read as a table, from a chip in the tab's line) */}
      {p.set.collection && p.onOpenTable && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={p.onOpenTable}
          className="meno-words absolute h-6 rounded-md px-2 text-xs leading-4 text-gh-black bg-white ring-1 ring-gh-line transition-colors duration-150 ease-meno hover:bg-gh-base"
          style={{ right: SET_PAD / PX, top: NAME_DOWN / PX - 12, pointerEvents: p.compact ? "none" : "auto" }}
        >
          Open as a table
        </button>
      )}
      {/* (structures drawn held in the set: how many, and that they are on no page - none of them drawn yet) */}
      {p.summary && p.set.drawnCollection && (
        <div className="meno-words absolute overflow-hidden" style={{ left: SET_PAD / PX, right: SET_PAD / PX, top: (2 * NAME_DOWN) / PX, bottom: SET_PAD / PX }}>
          <div className="flex flex-col gap-2" data-set-summary="">
            <div className="flex items-center gap-1.5">
              <span className="text-2xl leading-8 font-medium text-gh-black tabular-nums">{p.summary.count}</span>
              <span className="flex-1 text-xs leading-4 text-gh-gray">{p.summary.nouns}</span>
            </div>
            <span className="-mt-2 text-[10px] leading-4 text-gh-gray">On no page: deleting the set deletes them</span>
          </div>
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
    </div>
  );
}
