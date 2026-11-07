import clsx from "clsx";
import { useState, type MouseEvent as ReactMouseEvent } from "react";
import type { WorkflowSet } from "../store/types";
import type { ChartPoint } from "../../../../lib/chart";
import type { DiagramLevel } from "../../../../lib/energyDiagram";
import type { StyleChoice } from "../../../../lib/chem/style";
import { CHART_PX, NAME_DOWN, SET_PAD, PX, SUMMARY_PX, TABLE_PX, tableBodyPx } from "./look";
import { ChartBody, DiagramBody, NumberBody, TableBody } from "./ValueBody";
import SummaryBody from "./SummaryBody";

export type SetFrameProps = {
  set: WorkflowSet;
  /** Its tab's name: "Input". */
  name: string;
  /** Its words too small to read at this zoom: what it holds, as such. */
  compact: boolean;
  onContextMenu: (e: ReactMouseEvent) => void;
  /** A chemist's set being named anew (two clicks on its tab, drawn by WebGL): its name in a field over the tab - Enter, or a click away, keeps it; Escape leaves it as it was. */
  renaming?: boolean;
  onRename?: (name: string | null) => void;
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

/**
 * What a set holds, inside its frame (docs/WORKFLOWS.md, *What is on the
 * page*): a large result set's summary, a table, a number or a chart -
 * HTML still; its frame, its tab and its edges, which drag and size it,
 * and its ports are drawn by WebGL (pageGl/FrameTabs, pageGl/ports). Its
 * name, while a chemist names it anew, in a field over its tab.
 */
export default function SetFrame(p: SetFrameProps) {
  const [naming, setNaming] = useState(p.set.name ?? p.name);
  const w = (p.set.x1 - p.set.x0) / PX;
  const h = (p.set.y1 - p.set.y0) / PX;
  return (
    <div className="meno-fade-in relative select-none" style={{ width: w, height: h, pointerEvents: "none" }} onContextMenu={p.onContextMenu}>
      {p.renaming && (
        <div className="absolute flex items-center text-[11px] leading-4" style={{ left: SET_PAD / PX, top: 0, height: (2 * NAME_DOWN) / PX, pointerEvents: "auto" }}>
          <input
            autoFocus
            aria-label="Set name"
            value={naming}
            onChange={(e) => setNaming(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") p.onRename?.(naming);
              else if (e.key === "Escape") p.onRename?.(null);
            }}
            onBlur={() => p.onRename?.(naming)}
            className="font-medium text-gh-black bg-white rounded px-0.5 -mx-0.5 outline-none ring-1 ring-gh-line"
            style={{ width: `${Math.max(6, naming.length + 1)}ch` }}
          />
        </div>
      )}
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
    </div>
  );
}
