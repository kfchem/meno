import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { ArrowUpTrayIcon, ChevronDoubleRightIcon, ChevronDownIcon, ChevronUpIcon, CodeBracketIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { exists, writeTextFile } from "@tauri-apps/plugin-fs";
import TextBody from "../TextEditor";
import { columnText, markdownReaderOf, setShowsSource, useShowsSource } from "../TextEditor/columnText";
import MarkdownBody from "../TextEditor/MarkdownBody";
import { isMarkdown } from "../../../lib/text/markdown";
import { DURATION, EASE_SLIDE, FADE } from "../../theme/motion";
import { useEditor, useEditorStore } from "./store";
import type { PdfFind, PdfItem, WordPlace, WorkspaceText } from "./store/types";
import { COLUMN_NARROWEST, COLUMN_WIDEST, columnWidthFor, textExportPath } from "./utils/texts";
import { takenBeside } from "../../../lib/io/beside";
import { isPinch, wheelReader } from "../../../lib/input/wheel";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { pageUnder, pointOn } from "../../../lib/pdf/column";
import { letterAt, letterNear, lineAt, placeAt, textHad, wordAt, wordsBetween } from "../../../lib/pdf/text";
import { goToFound, runFind, stepFound } from "./components/pdfFind";
import { FOUND_COLOR } from "./components/pdfMarks";
import { placeBefore, selects } from "./utils/pdfSelection";
import { dragWords, onSelected } from "./components/wordsDrag";
import { dragBox, inBox } from "./components/boxDrag";
import { figureAt, figuresHad, type Box } from "../../../lib/pdf/figures";
import { linkAt, linksOf, type PdfLink } from "../../../lib/pdf/reader";
import { followLink, goBack, isBackKey, readerOf } from "./components/pdfColumnReader";
import { DOUBLE_CLICK_MS } from "./constants";

/** How far a pinch's step zooms the column, by ratio, per px of it, and how far a notch of the wheel with Ctrl or ⌘ does: as on the canvas (PanZoom2D). */
const PINCH_PER_PX = 0.01;
const NOTCH_RATIO = 1.2;
/** How far an arrow key moves the column, in pixels; Page Up or Down, as a share of what is seen. */
const ARROW_PX = 48;
const PAGE_SHARE = 0.9;
/** How long the page number stays once the column has stopped, in ms. */
const NUMBER_STAYS_MS = 1200;
/** How far a press may move and still be a click, in pixels. */
const CLICK_PX = 4;
/** How near the column's top or foot words being selected move it on, in pixels. */
const EDGE_PX = 28;
/** How small a box drawn may be, either way, in points: less, it is let go. */
const MIN_BOX_PT = 6;

/**
 * The texts the workspace holds, in a column beside the canvas (docs/
 * WORKSPACE.md, *Texts*): one shown, the others named above it to be
 * switched to; each read and edited there - the workspace's edits, undone
 * as any other - and written to a file by Export. Closing a text takes it
 * out of the workspace; hiding the column keeps them all. The column slides
 * open and shut as the panel beside the canvas does, and is as wide as its
 * left edge is dragged. It lies over the canvas's right side (docs/PDF.md,
 * *One canvas*), and says how much of it it covers as it goes (`cover`).
 *
 * The PDFs read there are named among the texts (docs/PDF.md, *In the
 * column*); one shown is drawn on the canvas under the column's header
 * (PdfColumn), and what is done over it - the wheel, a pinch, the keys,
 * the pointer - goes to the column's reader.
 *
 * Open as it comes, it shows at once, as wide as it is - but slides in,
 * made again after it failed (`slideIn`: Workspace, ColumnBoundary).
 */
export default function TextColumn({ slideIn = false }: { slideIn?: boolean }) {
  const texts = useEditor((s) => s.texts);
  const pdfs = useEditor((s) => s.pdfs);
  const shownId = useEditor((s) => s.textShown);
  const pdfShownId = useEditor((s) => s.pdfShown);
  const open = useEditor((s) => s.textsOpen);
  const read = useMemo(() => pdfs.filter((p) => p.reading), [pdfs]);
  const pdf = read.find((p) => p.id === pdfShownId);
  const shown = pdf ? undefined : texts.find((t) => t.id === shownId);
  // as wide as it was dragged - a text's, as it first opened; a PDF's, most of the canvas
  const [room, setRoom] = useState(0);
  const [roomEl, setRoomEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!roomEl) return;
    const seen = new ResizeObserver(() => setRoom(roomEl.clientWidth));
    seen.observe(roomEl);
    setRoom(roomEl.clientWidth);
    return () => seen.disconnect();
  }, [roomEl]);
  const [textWidth, setTextWidth] = useState<number | null>(null);
  const pdfWidth = useEditor((s) => s.pdfColumnWidth);
  const setPdfWidth = useEditor((s) => s.setPdfColumnWidth);
  const canvas = room || window.innerWidth;
  const widest = Math.max(COLUMN_NARROWEST, canvas * COLUMN_WIDEST);
  const width = columnWidthFor(canvas, !!pdf, pdf ? pdfWidth : textWidth);
  const setWidth = pdf ? setPdfWidth : setTextWidth;
  const [dragging, setDragging] = useState(false);
  // (how much of the canvas it covers, as it slides and as it is dragged: what is in view is the rest)
  const store = useEditorStore();
  // (the width the canvas lays a PDF out at in it - not changed as it shuts on what it showed)
  const showing = open && !!(shown || pdf);
  useEffect(() => {
    if (showing) store.getState().setColumnWidth(width);
  }, [showing, width, store]);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!el) {
      store.getState().setCover(0);
      return;
    }
    const seen = new ResizeObserver(() => store.getState().setCover(el.getBoundingClientRect().width));
    seen.observe(el);
    return () => {
      seen.disconnect();
      store.getState().setCover(0);
    };
  }, [el, store]);
  return (
    <>
      {/* (the canvas's width, measured: what the column's share is of) */}
      <div ref={setRoomEl} aria-hidden className="absolute inset-0 pointer-events-none" />
      <AnimatePresence initial={slideIn}>
        {open && (shown || pdf) && (
          <motion.div
            key="texts"
            ref={setEl}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            // (dragged, it follows the pointer)
            transition={dragging ? { duration: 0 } : { duration: DURATION.move, ease: EASE_SLIDE }}
            className={clsx("absolute top-0 right-0 z-20 h-full overflow-hidden", dragging && "select-none")}
          >
            <Column texts={texts} read={read} shown={shown} pdf={pdf} width={width} />
            <Edge width={width} widest={widest} setWidth={setWidth} setDragging={setDragging} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Column({ texts, read, shown, pdf, width }: { texts: WorkspaceText[]; read: PdfItem[]; shown?: WorkspaceText; pdf?: PdfItem; width: number }) {
  const store = useEditorStore();
  const showText = useEditor((s) => s.showText);
  const stopReadingText = useEditor((s) => s.stopReadingText);
  const showPdf = useEditor((s) => s.showPdf);
  const stopReadingPdf = useEditor((s) => s.stopReadingPdf);
  const find = useEditor((s) => s.pdfFind);
  const editText = useEditor((s) => s.editText);
  const closeTexts = useEditor((s) => s.closeTexts);
  const [error, setError] = useState<string | null>(null);
  // (a Markdown text read formatted, or its source written)
  const markdown = !!shown && isMarkdown(shown.name);
  const source = useShowsSource(store, shown?.id ?? null);
  const exportText = async (t: WorkspaceText) => {
    try {
      setError(null);
      const picked = await saveDialog({ title: "Export", defaultPath: textExportPath(t, t.path ? await takenBeside(t.path, (p) => exists(p)) : undefined) });
      if (picked) await writeTextFile(picked, t.text);
    } catch (e) {
      setError(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return (
    // (the column's body, where a PDF is read, is the canvas's: see-through, the canvas drawing it under it)
    <aside aria-label="Texts" style={{ width }} className="h-full border-l border-gh-line flex flex-col">
      <header className="flex items-center gap-1 pl-2 pr-1.5 h-11 border-b border-gh-line bg-white">
        <div role="tablist" aria-label="Texts" className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto">
          {/* (those read here: a text's sheet on the page, its tab closed, is not) */}
          {texts
            .filter((t) => t.reading !== false)
            .map((t) => (
              <Name key={`text-${t.id}`} name={t.name} title={t.path ?? t.name} chosen={t.id === shown?.id} onShow={() => showText(t.id)} onClose={() => stopReadingText(t.id)} />
            ))}
          {read.map((p) => (
            <Name key={`pdf-${p.id}`} name={p.name} title={p.name} chosen={p.id === pdf?.id} onShow={() => showPdf(p.id)} onClose={() => stopReadingPdf(p.id)} />
          ))}
        </div>
        {shown && markdown && (
          <button
            onClick={() => setShowsSource(store, shown.id, !source, shown.text)}
            aria-label="Source"
            aria-pressed={source}
            title={source ? "Show formatted" : "Show source"}
            className={clsx("h-7 w-7 shrink-0 rounded-md flex items-center justify-center transition-colors duration-150 ease-meno", source ? "bg-gh-base text-gh-black" : "hover:bg-gh-base")}
          >
            <CodeBracketIcon className="h-4 w-4" />
          </button>
        )}
        {shown && (
          <button
            onClick={() => void exportText(shown)}
            aria-label="Export…"
            title="Export…"
            className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center hover:bg-gh-base"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={closeTexts}
          aria-label="Hide texts"
          title="Hide texts"
          className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center hover:bg-gh-base"
        >
          <ChevronDoubleRightIcon className="h-4 w-4" />
        </button>
      </header>
      <AnimatePresence initial={false}>
        {error && (
          <motion.div key="error" {...FADE} role="alert" className="px-3 py-2 text-xs text-gh-black border-b border-gh-line flex items-start gap-2">
            <span className="flex-1 break-words">{error}</span>
            <button aria-label="Dismiss" title="Dismiss" onClick={() => setError(null)} className="h-4 w-4 shrink-0 rounded-full hover:bg-gh-line">
              <XMarkIcon className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex-1 min-h-0 relative">
        <AnimatePresence initial={false}>
          {shown && (
            // (see-through: the canvas draws the text under it, in the column's pass - components/ColumnText)
            <div key={`text-${shown.id}-${markdown && !source ? "read" : "write"}`} className="absolute inset-0">
              {markdown && !source ? (
                <MarkdownBody entry={columnText(store, shown.id, shown.text)} reader={markdownReaderOf(columnText(store, shown.id, shown.text), shown.text)} value={shown.text} />
              ) : (
                <TextBody entry={columnText(store, shown.id, shown.text)} value={shown.text} onChange={(v) => editText(shown.id, v)} />
              )}
            </div>
          )}
        </AnimatePresence>
        {pdf && <PdfBody key={`pdf-${pdf.id}`} pdf={pdf} />}
        {/* (over the top of what is read: what is read stays where the canvas draws it) */}
        <AnimatePresence initial={false}>{find && <FindRow key="find" />}</AnimatePresence>
        <AnimatePresence initial={false}>{find?.all && find.q.trim() && <FoundList key="found" />}</AnimatePresence>
      </div>
    </aside>
  );
}

/** How long typing rests before what is typed is looked for, in ms. */
const FIND_AFTER_MS = 160;

/**
 * Looking for words in the PDFs (docs/PDF.md, *Search*), at the column's
 * top: what is looked for, in this PDF or all of them, how many places are
 * found and which is gone to; Enter goes to the next, Shift+Enter to the
 * one before, Esc closes it.
 */
/** The search, as it is - or, closed and going, as it was last (it is drawn as it goes out of view). */
function useFindKept(): PdfFind {
  const live = useEditor((s) => s.pdfFind);
  const kept = useRef<PdfFind>(live ?? { q: "", all: false, found: [], now: 0, busy: false });
  if (live) kept.current = live;
  return kept.current;
}

function FindRow() {
  const store = useEditorStore();
  const find = useFindKept();
  const [q, setQ] = useState(find.q);
  const timer = useRef<number | null>(null);
  useEffect(() => () => void (timer.current != null && window.clearTimeout(timer.current)), []);
  const look = (text: string, all: boolean) => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void runFind(store, text, all), FIND_AFTER_MS);
  };
  // (a search begun with words in it - those selected - looked for at once)
  useEffect(() => {
    if (find.q && !find.found.length && !find.busy) void runFind(store, find.q, find.all);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const said = find.busy ? "…" : find.found.length ? `${find.now + 1} of ${find.found.length}` : q.trim() ? "None" : "";
  const choice = (all: boolean, name: string) => (
    <button
      onClick={() => void runFind(store, q, all)}
      aria-pressed={find.all === all}
      className={clsx("h-6 px-2 rounded text-[11px] transition-colors duration-150 ease-meno", find.all === all ? "bg-gh-base text-gh-black" : "text-gh-gray hover:text-gh-black")}
    >
      {name}
    </button>
  );
  return (
    <motion.div {...FADE} role="search" className="absolute inset-x-0 top-0 z-20 flex items-center gap-1 pl-2.5 pr-1.5 h-10 border-b border-gh-line bg-white/95 backdrop-blur">
      <MagnifyingGlassIcon className="h-4 w-4 shrink-0 text-gh-gray" />
      <input
        data-pdf-find
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Find in PDF"
        placeholder="Find"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          look(e.target.value, find.all);
        }}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            stepFound(store, e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            store.getState().setPdfFind(null);
          }
        }}
        className="flex-1 min-w-0 h-7 bg-transparent outline-none text-xs text-gh-black placeholder:text-gh-gray"
      />
      <span className="shrink-0 text-[11px] text-gh-gray tabular-nums">{said}</span>
      <div className="shrink-0 flex items-center rounded-md border border-gh-line p-px">
        {choice(false, "This PDF")}
        {choice(true, "All PDFs")}
      </div>
      <button aria-label="Previous" title="Previous (Shift+Enter)" onClick={() => stepFound(store, -1)} className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center hover:bg-gh-base">
        <ChevronUpIcon className="h-4 w-4" />
      </button>
      <button aria-label="Next" title="Next (Enter)" onClick={() => stepFound(store, 1)} className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center hover:bg-gh-base">
        <ChevronDownIcon className="h-4 w-4" />
      </button>
      <button aria-label="Close" title="Close (Esc)" onClick={() => store.getState().setPdfFind(null)} className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center hover:bg-gh-base">
        <XMarkIcon className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

/** The places found in all the PDFs, listed under each one's name with the words round them: one clicked is gone to, its PDF shown. */
function FoundList() {
  const store = useEditorStore();
  const find = useFindKept();
  const pdfs = useEditor((s) => s.pdfs);
  const [, setTick] = useState(0);
  const groups = pdfs
    .map((p) => ({ p, places: find.found.map((f, i) => ({ f, i })).filter(({ f }) => f.id === p.id) }))
    .filter((g) => g.places.length);
  return (
    <motion.div {...FADE} className="absolute inset-x-0 top-10 max-h-[45%] overflow-y-auto border-b border-gh-line bg-white/95 backdrop-blur shadow-sm text-xs z-10">
      {groups.map(({ p, places }) => (
        <section key={p.id} aria-label={p.name}>
          <h3 className="sticky top-0 bg-white/95 px-3 pt-2 pb-1 text-[11px] font-medium text-gh-gray">
            {p.name} <span className="font-normal tabular-nums">{places.length}</span>
          </h3>
          {places.slice(0, FOUND_LISTED).map(({ f, i }) => {
            const t = textHad(p.sha256, f.page, () => setTick((n) => n + 1));
            return (
              <button
                key={i}
                onClick={() => void goToFound(store, i)}
                className={clsx("w-full text-left px-3 py-1 flex gap-2 hover:bg-gh-base", i === find.now && "bg-gh-base")}
              >
                <span className="shrink-0 w-8 text-gh-gray tabular-nums">p. {f.page + 1}</span>
                <span className="min-w-0 truncate text-gh-black">
                  {t ? (
                    <>
                      {wordsBetween(t, f.from - AROUND, f.from).slice(-AROUND)}{" "}
                      <mark className="bg-transparent font-medium text-gh-black underline decoration-2 underline-offset-2" style={{ textDecorationColor: FOUND_COLOR }}>
                        {wordsBetween(t, f.from, f.to)}
                      </mark>{" "}
                      {wordsBetween(t, f.to, f.to + AROUND)}
                    </>
                  ) : (
                    "…"
                  )}
                </span>
              </button>
            );
          })}
          {places.length > FOUND_LISTED && <p className="px-3 py-1 text-gh-gray">and {places.length - FOUND_LISTED} more</p>}
        </section>
      ))}
    </motion.div>
  );
}

/** How many places a PDF's list shows, and how many letters round each. */
const FOUND_LISTED = 50;
const AROUND = 40;

/** A text's or a PDF's name along the column's top: shown by a click, closed by its cross. */
function Name({ name, title, chosen, onShow, onClose }: { name: string; title: string; chosen: boolean; onShow: () => void; onClose: () => void }) {
  return (
    <div
      role="tab"
      aria-selected={chosen}
      title={title}
      className={clsx(
        "group shrink-0 max-w-[12rem] h-7 flex items-center rounded-md text-xs transition-colors duration-150 ease-meno",
        chosen ? "bg-gh-base text-gh-black" : "text-gh-gray hover:bg-gh-base hover:text-gh-black",
      )}
    >
      <button onClick={onShow} className="min-w-0 truncate pl-2 pr-1 h-full">
        {name}
      </button>
      <button
        onClick={onClose}
        aria-label={`Close ${name}`}
        title={`Close ${name}`}
        className={clsx(
          "h-5 w-5 mr-1 shrink-0 rounded flex items-center justify-center hover:bg-gh-line transition-opacity duration-150 ease-meno",
          chosen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <XMarkIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Where a PDF is read in the column: see-through, the canvas drawing its
 * pages under it (PdfColumn). The wheel, or two fingers, move it; a pinch,
 * or Ctrl or ⌘ with the wheel, make its pages larger or smaller about the
 * pointer - the column's own, never the canvas's; the arrow keys, Page Up
 * and Down, Home and End move it while the pointer is over it. A page under
 * the pointer lights its PDF on the page.
 *
 * Its links work: a place in the PDF is gone to, and Back - ⌘[ on a Mac,
 * Alt+← on Windows, or the mouse's back button - comes back; a web page
 * opens in the system's browser. Its page number shows as it moves, and
 * while the pointer is over it.
 */
function PdfBody({ pdf }: { pdf: PdfItem }) {
  const store = useEditorStore();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [over, setOver] = useState(false);
  const id = pdf.id;
  useEffect(() => {
    if (!el) return;
    const reader = readerOf(store);
    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { sx: e.clientX - r.left, sy: e.clientY - r.top };
    };
    const readWheel = wheelReader();
    // (a pinch in WebKit: gestures, while they last, rather than wheels)
    let pinch: number | null = null;
    let over = false;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (pinch !== null) return;
      const { sx, sy } = local(e);
      if (e.ctrlKey || e.metaKey) {
        if (isPinch(e)) reader.zoomAt(Math.exp(-e.deltaY * PINCH_PER_PX), sx, sy, true);
        else {
          // (a notch, upwards in - or out, where Settings says so, as on the canvas)
          const way = useAppSettings.getState().pointer.wheelUp === "out" ? -1 : 1;
          reader.zoomAt(Math.pow(NOTCH_RATIO, -way * Math.sign(e.deltaY)), sx, sy, false);
        }
        return;
      }
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? reader.tall : 1;
      let dx = e.deltaX * unit;
      let dy = e.deltaY * unit;
      // (Shift turns a wheel sideways)
      if (e.shiftKey && !dx) [dx, dy] = [dy, 0];
      // (fingers followed as they go; a wheel's notch eased)
      reader.scrollBy(dx, dy, readWheel(e) === "pan");
    };
    type Gesture = Event & { scale: number; clientX: number; clientY: number };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      pinch = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Gesture;
      if (pinch === null || !(g.scale > 0)) return;
      const { sx, sy } = local(g);
      reader.zoomAt(g.scale / pinch, sx, sy, true);
      pinch = g.scale;
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      pinch = null;
    };
    const lit = (on: boolean) => {
      const st = store.getState();
      if (on && st.litPdf !== id) st.setLitPdf(id);
      if (!on && st.litPdf === id) st.setLitPdf(null);
    };
    /** The link, if any, under a point of the body: on the page there, among its links once they have come. */
    const linkUnder = (e: { clientX: number; clientY: number }): PdfLink | null => {
      const { sx, sy } = local(e);
      const { l, top, left } = reader.seen();
      const page = pageUnder(l, left + sx, top + sy);
      if (page == null) return null;
      const p = l.pages[page];
      const sha = store.getState().pdfs.find((x) => x.id === id)?.sha256;
      const links = sha ? linksOf(sha, page, () => reader.redraw()) : null;
      return links ? linkAt(links, (left + sx - p.x) / l.scale, (top + sy - p.y) / l.scale) : null;
    };
    /** Where a point of the body lies in the PDF: on the page under it - or the nearest - in points from its top left. */
    const inPdf = (e: { clientX: number; clientY: number }) => {
      const { sx, sy } = local(e);
      const { l, top, left } = reader.seen();
      const at = pointOn(l, left + sx, top + sy);
      const [w, h] = reader.sizes[at.page] ?? [0, 0];
      return { page: at.page, x: at.u * w, y: at.v * h, on: pageUnder(l, left + sx, top + sy) != null, sy };
    };
    const shaOf = () => store.getState().pdfs.find((x) => x.id === id)?.sha256;
    /** A page's letters, once they have come (asked for as the pointer first comes over it). */
    const lettersOf = (page: number) => {
      const sha = shaOf();
      return sha ? textHad(sha, page, () => reader.redraw()) : null;
    };
    // a selection being drawn: by letters, words or lines, from the first's ends
    let drawing: { unit: "letter" | "word" | "line"; first: [WordPlace, WordPlace]; x: number; y: number; moved: boolean } | null = null;
    let clicks = { n: 0, t: 0, x: 0, y: 0 };
    // words selected, pressed: carried out once the pointer moves (components/wordsDrag)
    let lifting: { x: number; y: number; carried: boolean } | null = null;
    // a box being drawn, from where it was pressed - in a figure, its box were it let go there
    let boxing: { page: number; x: number; y: number; fig: Box | null; cx: number; cy: number; moved: boolean } | null = null;
    // a box drawn, pressed: carried out once the pointer moves (components/boxDrag)
    let carrying: { x: number; y: number; carried: boolean } | null = null;
    /** How a point of a page lies on the screen now, for something carried out of it. */
    const onScreen = () => {
      const { l, top, left } = reader.seen();
      const r = el.getBoundingClientRect();
      return {
        pxPerPoint: l.scale,
        at: (page: number, x: number, y: number) => {
          const p = l.pages[page] ?? l.pages[0];
          return { x: r.left + p.x - left + x * l.scale, y: r.top + p.y - top + y * l.scale };
        },
      };
    };
    const onMove = (e: PointerEvent) => {
      over = true;
      setOver(true);
      const q = inPdf(e);
      lit(q.on);
      if (lifting) {
        if (!lifting.carried && e.buttons & 1 && Math.hypot(e.clientX - lifting.x, e.clientY - lifting.y) >= CLICK_PX) {
          lifting.carried = true;
          const st = store.getState();
          const pdfNow = st.pdfs.find((x) => x.id === id);
          // (from where it was pressed, where the words lie on the screen now)
          if (pdfNow && selects(st.pdfSel)) void dragWords(store, pdfNow, st.pdfSel, { x: lifting.x, y: lifting.y }, onScreen());
        }
        return;
      }
      if (carrying) {
        if (!carrying.carried && e.buttons & 1 && Math.hypot(e.clientX - carrying.x, e.clientY - carrying.y) >= CLICK_PX) {
          carrying.carried = true;
          const st = store.getState();
          const pdfNow = st.pdfs.find((x) => x.id === id);
          if (pdfNow && st.pdfBox) void dragBox(store, pdfNow, st.pdfBox, { x: carrying.x, y: carrying.y }, onScreen());
        }
        return;
      }
      if (boxing && e.buttons & 1) {
        if (!boxing.moved && Math.hypot(e.clientX - boxing.cx, e.clientY - boxing.cy) < CLICK_PX) return;
        boxing.moved = true;
        // (near the column's top or foot, it goes on with the pointer)
        if (q.sy < EDGE_PX) reader.scrollBy(0, -(EDGE_PX - q.sy) / 2, true);
        else if (q.sy > reader.tall - EDGE_PX) reader.scrollBy(0, (q.sy - reader.tall + EDGE_PX) / 2, true);
        // (on its own page, to its edge where the pointer has gone on to another)
        const [w, h] = reader.sizes[boxing.page] ?? [0, 0];
        const x = Math.min(Math.max(q.x, 0), w);
        const y = q.page === boxing.page ? Math.min(Math.max(q.y, 0), h) : q.page > boxing.page ? h : 0;
        store.getState().setPdfBox({ id, page: boxing.page, box: [Math.min(boxing.x, x), Math.min(boxing.y, y), Math.max(boxing.x, x), Math.max(boxing.y, y)] });
        return;
      }
      if (drawing && e.buttons & 1) {
        if (!drawing.moved && Math.hypot(e.clientX - drawing.x, e.clientY - drawing.y) < CLICK_PX) return;
        drawing.moved = true;
        // (near the column's top or foot, it goes on with the pointer)
        if (q.sy < EDGE_PX) reader.scrollBy(0, -(EDGE_PX - q.sy) / 2, true);
        else if (q.sy > reader.tall - EDGE_PX) reader.scrollBy(0, (q.sy - reader.tall + EDGE_PX) / 2, true);
        const t = lettersOf(q.page);
        if (!t) return;
        let place: WordPlace = { page: q.page, at: placeAt(t, q.x, q.y) };
        if (drawing.unit !== "letter") {
          const i = letterAt(t, q.x, q.y, 2) ?? Math.min(Math.max(0, place.at), t.codes.length - 1);
          const [a, b] = drawing.unit === "word" ? wordAt(t, i) : lineAt(t, i);
          place = placeBefore(place, drawing.first[0]) ? { page: q.page, at: a } : { page: q.page, at: b };
        }
        const [a, b] = drawing.first;
        store.getState().setPdfSel({ id, anchor: placeBefore(place, a) ? b : a, focus: place });
        return;
      }
      // (over a link, the system's hand, and where it goes; over words, the text cursor)
      const link = linkUnder(e);
      const t = q.on ? lettersOf(q.page) : null;
      el.style.cursor = link ? "pointer" : t && letterNear(t, q.x, q.y) != null ? "text" : "";
      el.title = link ? (link.uri ?? (link.page != null ? `Page ${link.page + 1}` : "")) : "";
    };
    const onLeave = () => {
      over = false;
      setOver(false);
      lit(false);
    };
    let press: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      // (on the page number: its own)
      press = e.button === 0 && e.target === el ? { x: e.clientX, y: e.clientY } : null;
      if (!press) return;
      const near = e.timeStamp - clicks.t < DOUBLE_CLICK_MS && Math.hypot(e.clientX - clicks.x, e.clientY - clicks.y) < CLICK_PX * 2;
      clicks = { n: near ? clicks.n + 1 : 1, t: e.timeStamp, x: e.clientX, y: e.clientY };
      // on words: a selection begun - a letter's place, a word, a line - and drawn on
      const q = inPdf(e);
      const t = q.on ? lettersOf(q.page) : null;
      // (on words selected, once: carried out, as the pointer moves)
      const sel = store.getState().pdfSel;
      if (t && clicks.n === 1 && selects(sel) && sel.id === id && onSelected(t, sel, q.page, q.x, q.y)) {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        drawing = null;
        lifting = { x: e.clientX, y: e.clientY, carried: false };
        return;
      }
      // (on a box drawn, once: carried out, as the pointer moves)
      const box = store.getState().pdfBox;
      if (q.on && clicks.n === 1 && box?.id === id && inBox(box, q.page, q.x, q.y)) {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        drawing = null;
        carrying = { x: e.clientX, y: e.clientY, carried: false };
        return;
      }
      const letter = t ? letterNear(t, q.x, q.y) : null;
      // in a figure, or where there are no words: a box drawn as the pointer goes - in a figure, let go where it
      // was pressed, the figure's (two clicks and three are words', its labels' too)
      const sha = shaOf();
      const figures = q.on && sha ? figuresHad(sha, q.page, () => reader.redraw()) : null;
      const fig = figures ? figureAt(figures, q.x, q.y) : null;
      if (q.on && clicks.n === 1 && (fig || letter == null)) {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        drawing = null;
        boxing = { page: q.page, x: q.x, y: q.y, fig, cx: e.clientX, cy: e.clientY, moved: false };
        return;
      }
      if (!t || letter == null) {
        drawing = null;
        store.getState().setPdfSel(null);
        return;
      }
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const unit = clicks.n >= 3 ? "line" : clicks.n === 2 ? "word" : "letter";
      const [a, b] = unit === "letter" ? [placeAt(t, q.x, q.y), placeAt(t, q.x, q.y)] : unit === "word" ? wordAt(t, letter, q.x) : lineAt(t, letter);
      drawing = { unit, first: [{ page: q.page, at: a }, { page: q.page, at: b }], x: e.clientX, y: e.clientY, moved: false };
      store.getState().setPdfSel({ id, anchor: drawing.first[0], focus: drawing.first[1] });
    };
    const onUp = (e: PointerEvent) => {
      // (the mouse's back button)
      if (e.button === 3) {
        e.preventDefault();
        goBack(store, id);
        return;
      }
      const drawn = drawing;
      drawing = null;
      // (words selected pressed and let go where they were: a click, nothing selected)
      const lifted = lifting;
      lifting = null;
      if (lifted) {
        if (!lifted.carried) store.getState().setPdfSel(null);
        return;
      }
      // (a box pressed and let go where it was: it stays)
      const carried = carrying;
      carrying = null;
      if (carried) return;
      const boxed = boxing;
      boxing = null;
      if (boxed?.moved) {
        // (a box drawn: kept - unless it is next to nothing)
        const b = store.getState().pdfBox;
        if (b && (b.box[2] - b.box[0] < MIN_BOX_PT || b.box[3] - b.box[1] < MIN_BOX_PT)) store.getState().setPdfBox(null);
        return;
      }
      // (let go where it was pressed, in a figure - its figures come since, if they had not - its box; on a link, the link followed)
      const sha = shaOf();
      const fig = boxed && !linkUnder(e) ? (boxed.fig ?? (sha ? figureAt(figuresHad(sha, boxed.page) ?? [], boxed.x, boxed.y) : null)) : null;
      if (boxed && fig) {
        store.getState().setPdfBox({ id, page: boxed.page, box: fig });
        return;
      }
      if (boxed) {
        store.getState().setPdfBox(null);
        store.getState().setPdfSel(null);
      }
      if (e.button !== 0 || !press || Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_PX) return;
      press = null;
      // a click: a link followed, nothing selected
      const link = linkUnder(e);
      const now = store.getState().pdfs.find((x) => x.id === id);
      if (drawn?.unit === "letter" && !drawn.moved) store.getState().setPdfSel(null);
      if (link && now) followLink(store, now, link);
    };
    // (a right-click: the PDF's menu, its words' Copy in it)
    const onMenu = (e: MouseEvent) => {
      e.preventDefault();
      store.getState().askPdfMenu({ id, clientX: e.clientX, clientY: e.clientY });
    };
    // (the webview's own Back, on the mouse's back button, is not Meno's)
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      // (Back: over the column, or over nothing on the page that has its own)
      if (isBackKey(e) && (over || store.getState().hoveredPdf == null)) {
        if (goBack(store, id)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (!over || e.metaKey || e.ctrlKey || e.altKey) return;
      const last = reader.sizes.length - 1;
      const moves: Record<string, () => void> = {
        ArrowDown: () => reader.scrollBy(0, ARROW_PX, false),
        ArrowUp: () => reader.scrollBy(0, -ARROW_PX, false),
        PageDown: () => reader.scrollBy(0, reader.tall * PAGE_SHARE, false),
        PageUp: () => reader.scrollBy(0, -reader.tall * PAGE_SHARE, false),
        ArrowRight: () => reader.goTo(Math.min(last, reader.page + 1)),
        ArrowLeft: () => reader.goTo(Math.max(0, reader.page - 1)),
        Home: () => reader.goTo(0),
        End: () => reader.goTo(last),
      };
      const move = moves[e.key];
      if (!move) return;
      e.preventDefault();
      e.stopPropagation();
      move();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    el.addEventListener("gestureend", onGestureEnd);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("mouseup", onMouseUp);
    el.addEventListener("contextmenu", onMenu);
    window.addEventListener("keydown", onKey, true);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureEnd);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("contextmenu", onMenu);
      window.removeEventListener("keydown", onKey, true);
      lit(false);
    };
  }, [el, store, id]);
  return (
    <div ref={setEl} role="document" aria-label={pdf.name} className="absolute inset-0">
      <PageNumber pages={pdf.pages.length} over={over} />
    </div>
  );
}

/**
 * The page most in view, of how many (*3 / 12*), at the foot of the column:
 * there as it moves, and while the pointer is over it. A click on it asks
 * for a page to go to; a double-click makes the pages as wide as the
 * column again.
 */
function PageNumber({ pages, over }: { pages: number; over: boolean }) {
  const store = useEditorStore();
  const reader = readerOf(store);
  const [page, setPage] = useState(reader.page);
  const [moving, setMoving] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  useEffect(() => {
    let rest: number | null = null;
    const off = reader.listen((what) => {
      setPage(reader.page);
      if (what !== "moved") return;
      setMoving(true);
      if (rest != null) window.clearTimeout(rest);
      rest = window.setTimeout(() => setMoving(false), NUMBER_STAYS_MS);
    });
    return () => {
      off();
      if (rest != null) window.clearTimeout(rest);
    };
  }, [reader]);
  const click = useRef<number | null>(null);
  useEffect(() => () => void (click.current != null && window.clearTimeout(click.current)), []);
  const shown = over || moving || asking != null;
  const go = () => {
    const n = Number.parseInt(asking ?? "", 10);
    if (Number.isFinite(n)) reader.goTo(Math.min(Math.max(1, n), pages) - 1);
    setAsking(null);
  };
  return (
    <div
      className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-gh-line bg-white/85 backdrop-blur shadow-sm text-[11px] leading-[22px] tabular-nums text-gh-black whitespace-nowrap select-none transition-opacity duration-150 ease-meno"
      style={{ opacity: shown ? 1 : 0, pointerEvents: shown ? undefined : "none" }}
    >
      {asking != null ? (
        <span className="flex items-center px-2.5">
          <input
            autoFocus
            aria-label="Go to page"
            inputMode="numeric"
            value={asking}
            onChange={(e) => setAsking(e.target.value.replace(/[^0-9]/g, ""))}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") go();
              else if (e.key === "Escape") setAsking(null);
            }}
            onBlur={() => setAsking(null)}
            className="bg-transparent outline-none text-right tabular-nums"
            style={{ width: `${String(pages).length + 0.5}ch` }}
          />
          <span className="text-gh-gray">&nbsp;/ {pages}</span>
        </span>
      ) : (
        <button
          aria-label={`Page ${page + 1} of ${pages}`}
          title="Go to page…"
          className="px-2.5"
          onClick={() => {
            // (once no second click has come: a double-click fits the width)
            if (click.current != null) window.clearTimeout(click.current);
            click.current = window.setTimeout(() => {
              click.current = null;
              setAsking(String(reader.page + 1));
            }, DOUBLE_CLICK_MS);
          }}
          onDoubleClick={() => {
            if (click.current != null) window.clearTimeout(click.current);
            click.current = null;
            reader.fitWidth();
          }}
        >
          {page + 1} <span className="text-gh-gray">/ {pages}</span>
        </button>
      )}
    </div>
  );
}

/** The column's left edge, dragged to make it wider or narrower. */
function Edge({
  width,
  widest,
  setWidth,
  setDragging,
}: {
  width: number;
  widest: number;
  setWidth: (w: number) => void;
  setDragging: (on: boolean) => void;
}) {
  const from = useRef<{ x: number; width: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Width of the texts"
      aria-valuenow={Math.round(width)}
      // (Meno's own pointer for dragging sideways, as a slider's: theme/cursors)
      data-cursor="sideways"
      className="absolute left-0 top-0 h-full w-1.5 -ml-0.5 z-10"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // (a drag, not a selection of the words it passes over)
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        from.current = { x: e.clientX, width };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!from.current) return;
        setWidth(Math.min(widest, Math.max(COLUMN_NARROWEST, from.current.width + from.current.x - e.clientX)));
      }}
      onPointerUp={() => {
        from.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        from.current = null;
        setDragging(false);
      }}
    />
  );
}
