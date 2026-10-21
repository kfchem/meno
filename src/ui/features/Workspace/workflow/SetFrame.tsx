import clsx from "clsx";
import { useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { WorkflowSet } from "../store/types";
import { NAME_DOWN, SET_PAD, PX } from "./look";
import { HAIR, Port, type PortLook } from "./StepCard";

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
  /** Its port that gives; and, made by a step, the one that takes from it. */
  give: PortLook;
  onTabDown: (e: ReactPointerEvent) => void;
  onEdgeDown: (edge: Edge, e: ReactPointerEvent) => void;
  onGiveDown: (e: ReactPointerEvent) => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  onHover: (on: boolean) => void;
  /** A chemist's set: its name changed - two clicks on it, Enter to keep it, Escape to leave it as it was. */
  onRename?: (name: string) => void;
  /** A large result set's (`WorkflowSet.collection`): what it holds, said in its frame, where its molecules would lie. */
  summary?: { count: string; nouns: string };
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
  const line = p.chosen ? "border-accel-base" : p.hovered ? "border-gh-gray" : "border-gh-line";
  const hair: CSSProperties = { borderWidth: HAIR, borderStyle: "solid" };
  const edge = (e: Edge, style: CSSProperties) => (
    <div key={e} onPointerDown={(ev) => p.onEdgeDown(e, ev)} className="absolute" style={{ pointerEvents: "auto", cursor: cursorOf[e], ...style }} />
  );
  return (
    <div className="meno-fade-in relative select-none" style={{ width: w, height: h, pointerEvents: "none" }} onContextMenu={p.onContextMenu}>
      <div className={clsx("absolute inset-0 rounded-xl transition-colors duration-150 ease-meno", line)} style={hair} />
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
        <span className={clsx("flex items-center gap-1.5 transition-opacity duration-150 ease-meno", p.compact && "opacity-0")}>
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
          className={clsx("absolute flex flex-col items-center justify-center text-center transition-opacity duration-150 ease-meno", p.compact && "opacity-0")}
          style={{ left: SET_PAD / PX, right: SET_PAD / PX, top: (2 * NAME_DOWN) / PX, bottom: SET_PAD / PX }}
        >
          <span className="text-2xl leading-8 font-medium text-gh-black tabular-nums">{p.summary.count}</span>
          <span className="text-xs leading-4 text-gh-gray">{p.summary.nouns}</span>
          {p.onOpenTable && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={p.onOpenTable}
              className="mt-2 h-6 rounded-md px-2 text-xs leading-4 text-gh-black bg-white ring-1 ring-gh-line transition-colors duration-150 ease-meno hover:bg-gh-base"
              style={{ pointerEvents: p.compact ? "none" : "auto" }}
            >
              Open as a table
            </button>
          )}
        </div>
      )}
      <Port look={p.give} label={`Out of ${p.name}`} data={{ "data-give-set": String(p.set.id) }} onPointerDown={p.onGiveDown} style={{ left: w, top: h / 2 }} />
      {p.set.made && <Port look="plain" label={`Into ${p.name}`} data={{}} onPointerDown={(e) => e.stopPropagation()} style={{ left: 0, top: h / 2, pointerEvents: "none" }} />}
    </div>
  );
}
