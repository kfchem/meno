import clsx from "clsx";
import { isoBounds, isoOf, ISO_STEPS, sliderOf } from "../utils/isoSlider";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isMarked, valueText, type ListResult } from "../../../../lib/calc/results";
import { SCALE_STOPS } from "../utils/isosurface";

/** The list's rows' height at most, in pixels; and at least, near the window's edge - three rows; and its heading's, over them. */
const TALLEST = 176;
const LEAST = 72;
const HEAD = 20;
/** The card kept clear of the canvas's lower edge, in pixels. */
const MARGIN = 8;
/** How many frames after it opens it has been placed under its molecule, to ask for room. */
const PLACED_FRAMES = 3;
/** A surface's value as it is written: "0.050", "0.0020" - a minus sign, not a hyphen, an exponent's too. */
const isoText = (iso: number) => (iso >= 0.01 ? iso.toFixed(3) : iso.toPrecision(2)).replace(/-/g, "\u2212");
/** A colour scale's ends, as written: a minus sign, not a hyphen, an exponent's too. */
const scaleText = (v: number) => String(Number(v.toPrecision(3))).replace(/-/g, "\u2212");
/** The scale's colours, as the surface is drawn in them (utils/isosurface `SCALE_STOPS`). */
const SCALE_CSS = SCALE_STOPS.map(([r, g, b]) => `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`).join(", ");

/**
 * One of a molecule's calculation's lists, under it (lib/calc/results): its
 * vibrations, its orbitals, whatever a reader gave as a list - each row its
 * values, column by column, written as Meno writes them, an imaginary
 * frequency marked. A row pointed at marks the atoms it is of; one that
 * moves the molecule, or shows a frame, is chosen with a click, and chosen
 * again let go: the molecule comes to rest. Where some rows can be chosen,
 * one that cannot is shown faint. It opens on the row its reader put
 * first in view.
 *
 * A row that shows a surface, chosen, has the value it is drawn at set by
 * a slider under the list; a row whose motion or surface is still being
 * worked out says so there - or what went wrong.
 *
 * It keeps within the canvas (`area`). Opened with too little room below
 * it, it asks for room (`onRoom`, where it would end at its full height) -
 * the view gliding to make it; and with its molecule moved low on the page
 * it is shorter, three rows at least, and as tall again as it is moved up.
 */
export default function CalcList3D({
  list: result,
  title,
  chosen,
  onChoose,
  onPoint,
  onClose,
  onRoom,
  asking,
  onFind,
  iso,
  isoStart,
  onIso,
  scale,
  area,
}: {
  list: ListResult;
  /** What it is called, where not its own name: its reader's added, where another reader's lists stand beside it. */
  title?: string;
  chosen: number | null;
  onChoose: (row: number | null) => void;
  onPoint: (row: number | null) => void;
  onClose: () => void;
  /** What is said under it of the row chosen: its motion or surface being worked out, or what went wrong; none, nothing. */
  asking?: string | null;
  /** Where what went wrong is that its output is not to be had: the chemist finding it, by what it is called. */
  onFind?: { name: string; find: () => void };
  /** The value the row chosen's surface is drawn at - a slider under it sets it; none, no slider. */
  iso?: number;
  /** The value it is drawn at at first, as its grid says: what the slider reaches round. */
  isoStart?: number;
  onIso?: (iso: number) => void;
  /** The scale the surface shown is coloured on, where another grid colours it: what its values run between, and what they are. */
  scale?: { from: number; to: number; label?: string };
  /** Asks for room below it, opened: where its card would end at its full height, in the window's pixels. */
  onRoom?: (bottom: number) => void;
  /** What it keeps within: the canvas. */
  area: Element;
}) {
  // (the slider's reach, round the value the surface was first drawn at)
  const bounds = isoBounds(isoStart);
  const card = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // (its heading scrolls with it, held at its top, so that it is laid out
  // with the rows - their columns its own - however a scroll bar is)
  const headed = result.columns.some((c) => c.label);
  const tallest = TALLEST + (headed ? HEAD : 0);
  const least = LEAST + (headed ? HEAD : 0);
  const [room, setRoom] = useState(tallest);
  // what its rows reach past it, where its scroll bar takes room it was not
  // given - so a Windows WebView does, the scroll bar come after the columns
  // were laid out - given back as a column of its own at the right, under
  // the scroll bar
  const [spare, setSpare] = useState(0);
  const askRoom = useRef(onRoom);
  askRoom.current = onRoom;
  // (measured as the page moves, every frame it is up: the page is moved
  // by the canvas's camera, and the chip above it opens and shuts, neither
  // of which tells it; and once it has been placed under its molecule, a
  // few frames after it opens, it asks for the room it would take at its
  // full height)
  useEffect(() => {
    let id = 0;
    let frames = 0;
    const fit = () => {
      const el = list.current;
      const box = card.current;
      if (el && box) {
        const l = el.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        if (++frames === PLACED_FRAMES) askRoom.current?.(b.top + box.offsetHeight - el.clientHeight + Math.min(tallest, el.scrollHeight));
        // (the card clear of the edge, its own padding under the list too)
        setRoom(
          Math.round(Math.min(tallest, Math.max(least, area.getBoundingClientRect().bottom - l.top - (b.bottom - l.bottom) - MARGIN))),
        );
        // (never more than the scroll bar's own width: what reaches past it
        // for any other reason - a card as wide as it may be - stays hidden)
        setSpare(Math.min(el.offsetWidth - el.clientWidth, Math.max(0, el.scrollWidth - el.clientWidth)));
      }
      id = requestAnimationFrame(fit);
    };
    fit();
    return () => cancelAnimationFrame(id);
  }, [area, result.id, tallest, least]);
  // (opened on the row its reader put first in view, in the middle of the
  // rows seen under its heading; or else on its first - another list opened
  // in its place starts afresh)
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const row = result.focus != null ? el.querySelector<HTMLElement>(`[data-row="${result.focus}"]`) : null;
    const head = headed ? HEAD : 0;
    el.scrollTop = row ? row.offsetTop - head - (el.clientHeight - head - row.offsetHeight) / 2 : 0;
  }, [result.id, result.focus, headed]);

  const can = (i: number) => !!(result.rows[i].move || result.rows[i].surface || result.rows[i].frame != null);
  const some = result.rows.some((_, i) => can(i));
  // (a column of numbers, or of values with a unit, to the right; of texts, to the left)
  const right = result.columns.map((c, k) => !!(c.quantity || c.unit) || result.rows.every((r) => typeof r.cells[k] !== "string"));
  const columns = {
    display: "grid",
    gridTemplateColumns: "subgrid",
    gridColumn: "1 / -1",
  } as const;
  return (
    <div
      ref={card}
      className="mt-1.5 w-max min-w-52 max-w-[24rem] rounded-2xl border border-gh-line bg-white/90 backdrop-blur shadow-sm py-1 meno-fade-in"
    >
      <div className="flex items-center justify-between gap-3 pl-3 pr-1.5 h-6 text-[11px] text-gh-gray">
        <span className="truncate">{title ?? result.label}</span>
        {/* (a list that keeps only the rows about its focus says which, of how many) */}
        {result.trimmed && (
          <span className="ml-auto shrink-0 tabular-nums">
            rows {result.trimmed.from}–{result.trimmed.to} of {result.trimmed.of}
          </span>
        )}
        <button
          aria-label={`Close ${title ?? result.label}`}
          onClick={onClose}
          className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center hover:bg-gh-base hover:text-gh-black"
        >
          ×
        </button>
      </div>
      <div
        ref={list}
        role="listbox"
        aria-label={title ?? result.label}
        className="relative grid gap-x-3 overflow-y-auto overflow-x-hidden"
        style={{
          gridTemplateColumns: `repeat(${result.columns.length}, auto)${spare ? ` ${spare}px` : ""}`,
          gridAutoRows: "min-content",
          maxHeight: room,
        }}
        onPointerLeave={() => onPoint(null)}
      >
        {headed && (
          <div
            className="sticky top-0 z-10 px-3 h-5 items-center text-[10px] text-gh-gray bg-white"
            style={columns}
            aria-hidden
            onPointerEnter={() => onPoint(null)}
          >
            {result.columns.map((c, k) => (
              <span key={k} className={clsx("whitespace-nowrap", right[k] && "text-right")}>
                {c.label}
              </span>
            ))}
          </div>
        )}
        {result.rows.map((r, i) => {
          const on = chosen === i;
          return (
            <div
              key={i}
              data-row={i}
              role="option"
              aria-selected={on}
              aria-disabled={!can(i)}
              onPointerEnter={() => onPoint(r.atoms ? i : null)}
              onClick={() => can(i) && onChoose(on ? null : i)}
              className={clsx(
                "px-3 h-6 items-center text-[11px] tabular-nums transition-colors duration-150 ease-meno",
                on ? "bg-gh-base" : (can(i) || r.atoms) && "hover:bg-gh-base",
                some && !can(i) && "opacity-40",
              )}
              style={columns}
            >
              {r.cells.map((v, k) => (
                <span
                  key={k}
                  className={clsx(
                    "whitespace-nowrap",
                    right[k] && "text-right",
                    isMarked(v, result.columns[k])
                      ? "text-accel-accent"
                      : k === 0 && result.columns.length > 1
                        ? "text-gh-gray"
                        : "text-gh-black",
                  )}
                >
                  {valueText(v, result.columns[k])}
                </span>
              ))}
            </div>
          );
        })}
      </div>
      {asking && (
        <div className="px-3 pt-1 text-[11px] text-gh-gray meno-fade-in">
          {asking}
          {onFind && (
            <button onClick={onFind.find} className="ml-1.5 underline decoration-gh-line underline-offset-2 hover:text-gh-black">
              Find {onFind.name}…
            </button>
          )}
        </div>
      )}
      {iso != null && onIso && (
        <label className="px-3 pt-1.5 pb-0.5 flex items-center gap-2 text-[11px] text-gh-gray meno-fade-in">
          <span>Isovalue</span>
          <input
            type="range"
            aria-label="Isovalue"
            min={0}
            max={ISO_STEPS}
            step={1}
            value={sliderOf(Math.min(bounds.most, Math.max(bounds.least, iso)), bounds)}
            onChange={(e) => onIso(isoOf(Number(e.target.value), bounds))}
            data-cursor="sideways"
            className="flex-1 min-w-24 h-2 rounded-full appearance-none bg-white/60 border border-gh-line"
          />
          <span className="w-12 text-right tabular-nums text-gh-black">{isoText(iso)}</span>
        </label>
      )}
      {scale && (
        // (the colours the surface is drawn in, blue to green to red, and the values they stand for)
        <div className="px-3 pt-1 pb-0.5 text-[11px] text-gh-gray meno-fade-in" role="img" aria-label={`Colour scale${scale.label ? ` of ${scale.label}` : ""}, from ${scaleText(scale.from)} to ${scaleText(scale.to)}`}>
          <div className="h-2 rounded-full border border-gh-line" style={{ background: `linear-gradient(to right, ${SCALE_CSS})` }} />
          <div className="mt-0.5 flex justify-between tabular-nums">
            <span>{scaleText(scale.from)}</span>
            {/* (whole, its unit or scale factor with it: never cut short) */}
            {scale.label && <span className="px-2 text-center">{scale.label}</span>}
            <span>{scaleText(scale.to)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
