import { ArrowUturnLeftIcon, ArrowUturnRightIcon, TrashIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { boxPicture, type HeldPdf } from "../../../lib/pdf/reader";
import { makePdf, numberedName, numberText, pagesName, pagesTyped, type PageNumbers, type PageTake } from "../../../lib/pdf/make";
import { DURATION, EASE, RISE } from "../../theme/motion";
import { useLeaving } from "../../theme/leaving";
import type { PdfItem } from "./store/types";

/** A page number's size and how far it is from the page's foot, and a corner's from its side, in points (src-tauri/src/pdfmake.rs). */
const NUMBER_PT = 9;
const NUMBER_MARGIN_PT = 28;

type Placed = { x: number; y: number; within: { width: number; height: number } };

/** A page drawn small, for a card: its picture, once drawn - asked for only once it is in view (`seen`), as a PDF may have hundreds; none till then. */
function usePageThumb(sha: string, page: number, size: readonly [number, number], dpi: number, seen: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!seen) return;
    let live = true;
    let made: string | null = null;
    void boxPicture(sha, page, [0, 0, size[0], size[1]], dpi)
      .then((p) => {
        if (!live) return;
        made = URL.createObjectURL(new Blob([p.png.slice()], { type: "image/png" }));
        setUrl(made);
      })
      .catch(() => {});
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [sha, page, size, dpi, seen]);
  return url;
}

/** Whether an element has come into view (and stays counted so after). */
function useSeen<E extends Element>(): [(el: E | null) => void, boolean] {
  const [el, setEl] = useState<E | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") return setSeen(true);
    const watch = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setSeen(true));
    watch.observe(el);
    return () => watch.disconnect();
  }, [el, seen]);
  return [setEl, seen];
}

/** A page as a card shows it: its picture in a box of its shape, white till it is drawn, turned as asked. */
function PageThumb({ pdf, page, height, turn = 0, children }: { pdf: PdfItem; page: number; height: number; turn?: number; children?: ReactNode }) {
  const size = pdf.pages[page];
  const [watch, seen] = useSeen<HTMLDivElement>();
  const url = usePageThumb(pdf.sha256, page, size, Math.max(18, Math.min(72, (height * 2 * 72) / size[1])), seen);
  const quarter = (((turn % 360) + 360) % 360) % 180 !== 0;
  const w = (height * size[0]) / size[1];
  // (turned, as wide as it is then tall: the box its turned picture fills)
  const box = quarter ? { width: height, height: w } : { width: w, height };
  return (
    <div ref={watch} className="relative shrink-0 flex items-center justify-center" style={{ width: Math.max(box.width, box.height), height: Math.max(box.width, box.height) }}>
      <motion.div
        className="relative bg-white border border-gh-line shadow-sm overflow-hidden"
        style={{ width: w, height }}
        animate={{ rotate: turn }}
        transition={{ duration: DURATION.base, ease: EASE }}
      >
        {url && <img src={url} alt="" draggable={false} className="absolute inset-0 w-full h-full meno-fade-in" />}
        {children}
      </motion.div>
    </div>
  );
}

/** A card's frame: where a right-click's menu was, kept on screen; closed on Escape, a press elsewhere and a turn of the wheel. */
function Card({ label, width, height, at, onClose, children }: { label: string; width: number; height: number; at: Placed; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { leaving, held } = useLeaving();
  useEffect(() => {
    if (leaving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPress = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPress, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPress, true);
    };
  }, [onClose, leaving]);
  return (
    <motion.div
      ref={ref}
      {...RISE}
      {...held}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      className="absolute z-50 rounded-md border border-gh-line bg-white p-3 shadow-lg text-sm text-gh-black outline-none"
      style={{ left: Math.max(8, Math.min(at.x, at.within.width - width - 8)), top: Math.max(8, Math.min(at.y, at.within.height - height - 8)), width }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-gh-gray">{label}</div>
      {children}
    </motion.div>
  );
}

/** A row of choices, one pressed. */
function Choices<T extends string>({ label, value, options, onChoose }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChoose: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="w-fit flex rounded-md border border-gh-line overflow-hidden">
      {options.map(([v, name]) => (
        <button
          key={v}
          aria-pressed={v === value}
          onClick={() => onChoose(v)}
          className={clsx("h-7 px-2.5 text-xs border-l border-gh-line first:border-l-0 transition-colors duration-150 ease-meno", v === value ? "bg-accel-base text-white" : "hover:bg-gh-base")}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

/** The card's button that makes the new PDF: saying so while it is made, and what went wrong if it did. */
function MakeButton({ name, busy, disabled, onMake }: { name: string; busy: boolean; disabled?: boolean; onMake: () => void }) {
  return (
    <button
      onClick={onMake}
      disabled={busy || disabled}
      className="h-8 px-3 rounded-md bg-accel-base text-white text-xs font-medium transition-opacity duration-150 ease-meno hover:opacity-90 disabled:opacity-40"
    >
      {busy ? "Making…" : name}
    </button>
  );
}

/** What a card's make does with what was made: held, and named, it goes on the page beside the PDF. */
type Made = (held: HeldPdf, name: string) => void;

/** Runs `make`, the card busy meanwhile, closed once it is made; what went wrong said in it. */
function useMaking(onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (make: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    make()
      .then(onClose)
      .catch((e: unknown) => {
        setBusy(false);
        setError(`It could not be made: ${e instanceof Error ? e.message : String(e)}`);
      });
  };
  return { busy, error, run };
}

/**
 * Page numbers stamped at the foot of a PDF's pages, as a new PDF beside it
 * (docs/PDF.md, *A new PDF from pages*): 1, 2, 3 or S1, S2, S3 - as
 * supporting information is numbered - from a number chosen, at the foot's
 * left, middle or right. Its first page shows the number as it will be.
 */
export function PdfNumbersCard({ pdf, at, onMade, onClose }: { pdf: PdfItem; at: Placed; onMade: Made; onClose: () => void }) {
  const [numbers, setNumbers] = useState<PageNumbers>({ prefix: "", start: 1, at: "centre" });
  const [typed, setTyped] = useState("1");
  const { busy, error, run } = useMaking(onClose);
  const start = Number(typed);
  const startOk = Number.isInteger(start) && start >= 0 && start <= 99999;
  const shown: PageNumbers = { ...numbers, start: startOk ? start : numbers.start };
  // (the first page, as tall as the card shows it: its number where it will be, as large)
  const tall = 170;
  const [w, h] = pdf.pages[0];
  const s = tall / h;
  const make = () =>
    run(async () => {
      const held = await makePdf({ pages: pdf.pages.map((_, page) => ({ sha: pdf.sha256, page, turn: 0 })), numbers: shown });
      onMade(held, numberedName(pdf.name));
    });
  return (
    <Card label="Page numbers" width={380} height={300} at={at} onClose={onClose}>
      <div className="mt-2 flex gap-4">
        <PageThumb pdf={pdf} page={0} height={tall}>
          <span
            aria-hidden
            className="absolute whitespace-nowrap text-black leading-none transition-[left,right,transform] duration-200 ease-meno"
            style={{
              fontFamily: "Helvetica, Arial, sans-serif",
              fontSize: Math.max(5, NUMBER_PT * s),
              bottom: NUMBER_MARGIN_PT * s,
              ...(shown.at === "left" ? { left: NUMBER_MARGIN_PT * s } : shown.at === "right" ? { right: NUMBER_MARGIN_PT * s } : { left: (w * s) / 2, transform: "translateX(-50%)" }),
            }}
          >
            {numberText(shown, 0)}
          </span>
        </PageThumb>
        <div className="min-w-0 flex-1 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-gh-gray">
            Numbers
            <Choices label="Numbers" value={numbers.prefix} options={[["", "1, 2, 3"], ["S", "S1, S2, S3"]]} onChoose={(prefix) => setNumbers({ ...numbers, prefix })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gh-gray">
            The first page's
            <input
              aria-label="The first page's number"
              inputMode="numeric"
              value={typed}
              onChange={(e) => setTyped(e.target.value.trim())}
              className={clsx("w-20 h-7 rounded-md border px-2 text-sm text-gh-black tabular-nums outline-none", startOk ? "border-gh-line focus:border-accel-base" : "border-accel-accent")}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gh-gray">
            At the foot
            <Choices label="At the foot" value={numbers.at} options={[["left", "Left"], ["centre", "Centre"], ["right", "Right"]]} onChoose={(where) => setNumbers({ ...numbers, at: where })} />
          </label>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-gh-gray">A copy of {pdf.name}, its pages numbered, goes beside it; {pdf.name} stays as it is.</p>
      {error && <p className="mt-1 text-xs text-accel-accent">{error}</p>}
      <div className="mt-2 flex justify-end">
        <MakeButton name="Make numbered copy" busy={busy} disabled={!startOk} onMake={make} />
      </div>
    </Card>
  );
}

/** How far a press goes on a page before it drags it, in pixels. */
const DRAG_PX = 4;

/**
 * A PDF's pages, to make a new PDF of (docs/PDF.md, *A new PDF from
 * pages*): dragged into another order, turned a quarter either way, some
 * taken out - those selected, by a click, Shift and a click for a run, or
 * typed as "3-5" - and made into a new PDF beside it: all of them as they
 * are now, or those selected alone.
 */
export function PdfPagesCard({ pdf, at, onMade, onClose }: { pdf: PdfItem; at: Placed; onMade: Made; onClose: () => void }) {
  type Kept = { page: number; turn: number };
  const [kept, setKept] = useState<Kept[]>(() => pdf.pages.map((_, page) => ({ page, turn: 0 })));
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [last, setLast] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const { busy, error, run } = useMaking(onClose);
  const cells = useRef(new Map<number, HTMLElement>());
  const press = useRef<{ page: number; x: number; y: number; shift: boolean; moved: boolean } | null>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_PX) return;
      p.moved = true;
      setDragging(p.page);
      // (the place of the page nearest the pointer: the one dragged goes there, the others making room)
      let near: number | null = null;
      let best = Infinity;
      for (const [page, el] of cells.current) {
        const r = el.getBoundingClientRect();
        const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
        if (d < best) [best, near] = [d, page];
      }
      if (near == null || near === p.page) return;
      setKept((was) => {
        const from = was.findIndex((k) => k.page === p.page);
        const to = was.findIndex((k) => k.page === near);
        if (from < 0 || to < 0) return was;
        const next = [...was];
        const [k] = next.splice(from, 1);
        next.splice(to, 0, k);
        return next;
      });
    };
    const up = () => {
      const p = press.current;
      press.current = null;
      setDragging(null);
      if (!p || p.moved) return;
      // (a click: that page chosen; with Shift, the run from the one chosen last)
      setChosen((was) => {
        if (p.shift && last != null) {
          const order = kept.map((k) => k.page);
          const [a, b] = [order.indexOf(last), order.indexOf(p.page)].sort((x, y) => x - y);
          return new Set([...was, ...order.slice(a, b + 1)]);
        }
        const next = new Set(was);
        if (!next.delete(p.page)) next.add(p.page);
        return next;
      });
      setLast(p.page);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [kept, last]);
  const turn = (by: number) => setKept((was) => was.map((k) => (chosen.has(k.page) ? { ...k, turn: k.turn + by } : k)));
  const takeOut = () => {
    setKept((was) => was.filter((k) => !chosen.has(k.page)));
    setChosen(new Set());
  };
  const typedPages = typed ? pagesTyped(typed, pdf.pages.length) : null;
  const take = (ks: readonly Kept[]): PageTake[] => ks.map((k) => ({ sha: pdf.sha256, page: k.page, turn: k.turn }));
  const makeOf = (ks: readonly Kept[]) =>
    run(async () => {
      const held = await makePdf({ pages: take(ks) });
      onMade(held, pagesName(pdf.name, ks, pdf.pages.length));
    });
  const selected = kept.filter((k) => chosen.has(k.page));
  const tool = "h-7 px-2 rounded-md flex items-center gap-1 text-xs transition-colors duration-150 ease-meno hover:bg-gh-base disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <Card label="Pages" width={560} height={460} at={at} onClose={onClose}>
      <div className="mt-2 flex items-center gap-1 flex-wrap">
        <button className={tool} disabled={!chosen.size} onClick={() => turn(-90)}>
          <ArrowUturnLeftIcon className="h-4 w-4" /> Turn left
        </button>
        <button className={tool} disabled={!chosen.size} onClick={() => turn(90)}>
          <ArrowUturnRightIcon className="h-4 w-4" /> Turn right
        </button>
        <button className={tool} disabled={!chosen.size || chosen.size === kept.length} onClick={takeOut}>
          <TrashIcon className="h-4 w-4" /> Take out
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-gh-gray">
          Select pages
          <input
            aria-label="Pages to select"
            placeholder="e.g. 1-3"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              const ps = e.target.value ? pagesTyped(e.target.value, pdf.pages.length) : null;
              if (ps) setChosen(new Set(ps.filter((p) => kept.some((k) => k.page === p))));
            }}
            className={clsx("w-24 h-7 rounded-md border px-2 text-sm text-gh-black outline-none placeholder:text-gh-line", !typed || typedPages ? "border-gh-line focus:border-accel-base" : "border-accel-accent")}
          />
        </label>
      </div>
      <div role="list" aria-label="Pages" className="mt-2 h-72 overflow-y-auto rounded-md bg-gh-base/60 p-2 flex flex-wrap content-start gap-2 select-none">
        {kept.map((k) => (
          <motion.div
            key={k.page}
            layout
            transition={{ layout: { duration: DURATION.base, ease: EASE } }}
            role="listitem"
            aria-label={`Page ${k.page + 1}`}
            aria-selected={chosen.has(k.page)}
            ref={(el) => {
              if (el) cells.current.set(k.page, el);
              else cells.current.delete(k.page);
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              press.current = { page: k.page, x: e.clientX, y: e.clientY, shift: e.shiftKey, moved: false };
            }}
            className={clsx(
              "rounded-md p-1 flex flex-col items-center cursor-grab transition-colors duration-150 ease-meno",
              chosen.has(k.page) ? "bg-accel-lightbase/60 ring-1 ring-accel-base" : "hover:bg-white",
              dragging === k.page && "opacity-60 cursor-grabbing",
            )}
          >
            <PageThumb pdf={pdf} page={k.page} height={96} turn={k.turn} />
            <span className="mt-0.5 text-[11px] text-gh-gray tabular-nums">{k.page + 1}</span>
          </motion.div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-gh-gray">
        Drag a page to move it; click to select, Shift-click for a run. A new PDF goes beside {pdf.name}, which stays as it is.
      </p>
      {error && <p className="mt-1 text-xs text-accel-accent">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={() => makeOf(selected)}
          disabled={busy || !selected.length}
          className="h-8 px-3 rounded-md border border-gh-line bg-white text-xs text-gh-black transition-colors duration-150 ease-meno hover:bg-gh-base disabled:opacity-40"
        >
          Extract selected ({selected.length})
        </button>
        <MakeButton name="Make new PDF" busy={busy} onMake={() => makeOf(kept)} />
      </div>
    </Card>
  );
}
