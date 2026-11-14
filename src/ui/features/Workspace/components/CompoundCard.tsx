/**
 * A compound's place by its number in a PDF's text (docs/PDF.md, *A
 * compound's number*): the pointer resting on a number mentioned as a
 * compound's (utils/compoundMentions), a calm card by its word holds the
 * PDF's own picture of the region where the compound is drawn
 * (utils/compoundIndex, utils/lensPicture) - the first, its page said, and
 * the pages it is drawn on again. It never shows the structure Meno read
 * from there: that comes once the compound is on the canvas, where it can be
 * checked and edited - the picture dragged onto it puts the structure there,
 * as one dragged out of its figure is; its page clicked shows the figure,
 * the structure marked there a moment. It fades in once the pointer has
 * rested on the number, and out once the pointer has left both; never over
 * the word itself. While its PDF's figures are still being read for their
 * numbers, it says so - and they are read on at once (`hurryIndex`) - then
 * grows into the picture, its size eased, never a jump; where the number is
 * drawn nowhere in the PDF, it says that in words.
 */
import { useEffect, useRef, useState } from "react";
import { DURATION } from "../../../theme/motion";
import { useEditor, useEditorStore } from "../store";
import type { PdfLens } from "../store/types";
import { hurryIndex, indexWhole, labelPlaces } from "../utils/compoundIndex";
import { pickedStructure } from "../utils/pdfStructures";
import { lensDpi, lensPictureOf, lensSize } from "../utils/lensPicture";
import type { PageStructure } from "../utils/pageStructures";
import { dragStructure } from "./structureDrag";
import { readerOf } from "./pdfColumnReader";
import { cardHolds, cardPlace, restLeft } from "./compoundCardPlace";

/** How long it lingers once the pointer has left, in ms. */
const LINGER_MS = 250;
/** How far the pointer moves before a press on the drawing carries the structure out, in pixels: as in the column. */
const CARRY_PX = 4;
/** How often a card waiting on its PDF's figures looks again, in ms: they are read in idle time. */
const AGAIN_MS = 400;

export default function CompoundCard() {
  const store = useEditorStore();
  const lens = useEditor((s) => s.pdfLens);
  // (the card shown: the lens it is of, kept while it fades out and while the pointer is on it)
  const [held, setHeld] = useState<PdfLens | null>(null);
  const [shown, setShown] = useState(false);
  const [, again] = useState(0);
  const over = useRef(false);
  const card = useRef<HTMLDivElement>(null);
  // (what it holds, measured: the card's own size, eased to it)
  const inner = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (lens) {
      // (its PDF's figures still being read for their numbers: read on at once, someone waiting on them)
      if (!indexWhole(lens.sha256)) hurryIndex(lens.sha256);
      // (a number rested on: its card, after a moment)
      const t = window.setTimeout(() => {
        setHeld(lens);
        setShown(true);
      }, restLeft(lens.since, performance.now()));
      return () => window.clearTimeout(t);
    }
    // (left: gone a moment later, unless the pointer has come onto the card)
    const t = window.setTimeout(() => {
      if (!over.current) setShown(false);
    }, LINGER_MS);
    return () => window.clearTimeout(t);
  }, [lens]);
  useEffect(() => {
    if (shown) return;
    const t = window.setTimeout(() => setHeld(null), DURATION.base * 1000);
    return () => window.clearTimeout(t);
  }, [shown]);

  const places = held ? labelPlaces(held.sha256, held.label) : [];
  const first = places[0];
  const s: PageStructure | null = held && first ? pickedStructure(held.sha256, { page: first.page, figure: first.figure, key: first.key }) : null;
  // (its PDF's figures still being read, or its figure: looked at again shortly)
  const model = s && "model" in s.read ? s.read.model : null;
  const holds = held ? cardHolds({ placed: !!first, read: !!s, whole: indexWhole(held.sha256) }) : null;
  const waiting = holds === "reading";
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => again((n) => n + 1), AGAIN_MS);
    return () => window.clearInterval(t);
  }, [waiting]);

  // (the region's own picture, drawn again from the PDF at the size shown: its place held until it comes)
  const shownBox = s && holds === "picture" ? lensSize(s.box) : null;
  const url = s && first && shownBox ? lensPictureOf(held!.sha256, first.page, s.box, lensDpi(s.box, shownBox, window.devicePixelRatio), () => again((n) => n + 1)) : null;
  // (waiting on its PDF's figures, or its figure's structures: said so, until they come)
  useEffect(() => {
    const el = inner.current;
    if (el) setSize({ width: el.offsetWidth, height: el.offsetHeight });
  }, [url, shownBox?.width, held?.label, holds]);
  // (its drawing come after its words: the drawing and its pages faded in, the words kept a moment to fade out under the
  // card's easing width - never cut mid-letter)
  const before = useRef<typeof holds>(null);
  const [fresh, setFresh] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const was = before.current;
    before.current = holds;
    if (was !== "reading" || holds !== "picture") return;
    setFresh(true);
    setLeaving(true);
    let next = 0;
    const one = requestAnimationFrame(() => (next = requestAnimationFrame(() => setFresh(false))));
    const t = window.setTimeout(() => setLeaving(false), DURATION.base * 1000);
    return () => {
      cancelAnimationFrame(one);
      cancelAnimationFrame(next);
      window.clearTimeout(t);
      setFresh(false);
      setLeaving(false);
    };
  }, [holds]);
  if (!held || !holds) return null;

  const at = cardPlace(held.word, size, { width: window.innerWidth, height: window.innerHeight });
  const ease = `${DURATION.base * 1000}ms`;
  // (over its word, as it mostly is: held by its bottom-left corner, so that it grows upward and its number never moves)
  const above = at.top + size.height <= held.word.top;
  const fade = (on: boolean) => ({ opacity: on ? 1 : 0, transitionProperty: "opacity", transitionDuration: ease });
  const pdf = store.getState().pdfs.find((p) => p.id === held.id);
  const others = first ? [...new Set(places.slice(1).map((p) => p.page + 1))].filter((p) => p !== first.page + 1) : [];

  /** A press on the drawing: carried out once the pointer moves, as a structure pressed in its figure is. */
  const onPress = (e: React.PointerEvent<HTMLImageElement>) => {
    if (e.button !== 0 || !pdf || !s || !first) return;
    e.preventDefault();
    const from = { x: e.clientX, y: e.clientY };
    const img = e.currentTarget.getBoundingClientRect();
    const move = (m: PointerEvent) => {
      if (Math.hypot(m.clientX - from.x, m.clientY - from.y) < CARRY_PX) return;
      stop();
      setShown(false);
      // (lifting off the card's drawing: its page's box laid over the drawing)
      const [x0, y0, x1, y1] = s.box;
      dragStructure(store, pdf, first.page, s, from, {
        pxPerPoint: x1 > x0 ? img.width / (x1 - x0) : 1,
        at: (_p, x, y) => ({ x: img.left + ((x - x0) / Math.max(x1 - x0, 1e-6)) * img.width, y: img.top + ((y - y0) / Math.max(y1 - y0, 1e-6)) * img.height }),
      });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop, true);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, true);
  };

  /** Its figure shown, the structure marked there a moment. */
  const show = (page: number, box: [number, number, number, number]) => {
    const st = store.getState();
    if (!(st.textsOpen && st.pdfShown === held.id)) st.readPdf(held.id);
    readerOf(store).goToWhenRead(held.id, page, box[1], 0.3);
    const place = { page, at: 0 };
    st.setPdfFlash({ id: held.id, from: place, to: place, start: performance.now(), box });
    setShown(false);
  };

  return (
    <div
      ref={card}
      role="dialog"
      aria-label={`Compound ${held.label}`}
      className="fixed z-50 flex select-none flex-col overflow-hidden rounded-xl border border-gh-line bg-white/90 backdrop-blur shadow-sm text-[11px] leading-[16px] ease-meno"
      style={{
        left: at.left,
        ...(above ? { bottom: window.innerHeight - (at.top + size.height + 2), justifyContent: "flex-end" } : { top: at.top }),
        // (its size and place eased as what it holds grows - from its words while its figures are read to its drawing)
        ...(size.width > 0 ? { width: size.width + 2, height: size.height + 2 } : {}),
        opacity: shown ? 1 : 0,
        transitionProperty: "opacity, width, height, left, top, bottom",
        transitionDuration: ease,
        pointerEvents: shown ? "auto" : "none",
      }}
      onPointerEnter={() => (over.current = true)}
      onPointerLeave={() => {
        over.current = false;
        if (!store.getState().pdfLens) setShown(false);
      }}
    >
      <div ref={inner} className="w-max shrink-0 px-2.5 py-2">
        {holds === "picture" && first && s && shownBox ? (
          <>
            {url ? (
              <img
                alt={`Compound ${held.label}, where the PDF draws it`}
                src={url}
                draggable={false}
                width={shownBox.width}
                height={shownBox.height}
                className={`block ease-meno ${model ? "cursor-grab" : ""}`}
                style={fade(!fresh)}
                onPointerDown={model ? onPress : undefined}
              />
            ) : (
              // (the picture not come: its place held, the card there at once)
              <div aria-hidden style={{ width: shownBox.width, height: shownBox.height }} className="rounded bg-gh-line/20" />
            )}
            <div className="mt-1 flex items-baseline gap-1.5 text-gh-gray">
              <span className="font-semibold text-gh-black">{held.label}</span>
              <span className="relative flex items-baseline gap-1.5">
                <span className="flex items-baseline gap-1.5 ease-meno" style={fade(!fresh)}>
                  <button type="button" className="hover:text-gh-black transition-colors duration-150 ease-meno" onClick={() => show(first.page, s.box)}>
                    p. {first.page + 1}
                  </button>
                  {others.length > 0 && <span>· also on p. {others.join(", ")}</span>}
                </span>
                {leaving && (
                  <span className="pointer-events-none absolute left-0 whitespace-nowrap ease-meno" style={fade(fresh)} aria-hidden>
                    Reading this PDF&rsquo;s figures&hellip;
                  </span>
                )}
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-baseline gap-1.5 whitespace-nowrap text-gh-gray">
            <span className="font-semibold text-gh-black">{held.label}</span>
            <span>{holds === "none" ? "No drawing of this compound was found in this PDF." : "Reading this PDF\u2019s figures\u2026"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
