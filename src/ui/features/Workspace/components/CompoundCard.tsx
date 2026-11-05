/**
 * A compound's structure by its number in a PDF's text (docs/PDF.md, *A
 * compound's number*): the pointer resting on a number mentioned as a
 * compound's (utils/compoundMentions), a calm card by its word holds Meno's
 * own drawing of the structure it numbers in the PDF's figures
 * (utils/compoundIndex) - the first, its page said, and the pages it is
 * drawn on again. Its drawing dragged onto the canvas puts the structure
 * there, as one dragged out of its figure is; its page clicked shows the
 * figure, the structure marked there a moment. It fades in once the pointer
 * has rested on the number, and out once the pointer has left both; never
 * over the word itself.
 */
import { useEffect, useRef, useState } from "react";
import { styleOf } from "../../../../lib/chem/style";
import { DURATION } from "../../../theme/motion";
import { useEditor, useEditorStore } from "../store";
import type { PdfLens } from "../store/types";
import { drawingSvg } from "../fileActions";
import { indexWhole, labelPlaces } from "../utils/compoundIndex";
import { pickedStructure } from "../utils/pdfStructures";
import type { PageStructure } from "../utils/pageStructures";
import { dragStructure } from "./structureDrag";
import { readerOf } from "./pdfColumnReader";
import { cardPlace, REST_MS } from "./compoundCardPlace";

/** How long it lingers once the pointer has left, in ms. */
const LINGER_MS = 250;
/** How far the pointer moves before a press on the drawing carries the structure out, in pixels: as in the column. */
const CARRY_PX = 4;
/** The drawing's most, in pixels. */
const MOST_W = 220;
const MOST_H = 150;
/** How often a card waiting on its PDF's figures looks again, in ms: they are read in idle time. */
const AGAIN_MS = 400;

export default function CompoundCard() {
  const store = useEditorStore();
  const lens = useEditor((s) => s.pdfLens);
  const docStyle = useEditor((s) => s.docStyle);
  const aromaticEnabled = useEditor((s) => s.aromaticEnabled);
  const aromaticRings = useEditor((s) => s.aromaticRings);
  // (the card shown: the lens it is of, kept while it fades out and while the pointer is on it)
  const [held, setHeld] = useState<PdfLens | null>(null);
  const [shown, setShown] = useState(false);
  const [, again] = useState(0);
  const over = useRef(false);
  const card = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (lens) {
      // (a number rested on: its card, after a moment)
      const t = window.setTimeout(() => {
        setHeld(lens);
        setShown(true);
      }, Math.max(0, REST_MS - (performance.now() - lens.since)));
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
  const waiting = !!held && (!s || !("model" in s.read)) && (!indexWhole(held.sha256) || (first && !s));
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => again((n) => n + 1), AGAIN_MS);
    return () => window.clearInterval(t);
  }, [waiting]);

  const model = s && "model" in s.read ? s.read.model : null;
  const svg = model ? drawingSvg(model, { aromaticEnabled, aromaticRings }, styleOf(docStyle)) : null;
  const w0 = svg ? Number(/width="([\d.e+-]+)"/.exec(svg)?.[1] ?? 0) : 0;
  const h0 = svg ? Number(/height="([\d.e+-]+)"/.exec(svg)?.[1] ?? 0) : 0;
  const k = w0 > 0 && h0 > 0 ? Math.min(1, MOST_W / w0, MOST_H / h0) : 1;
  useEffect(() => {
    const el = card.current;
    if (el) setSize({ width: el.offsetWidth, height: el.offsetHeight });
  }, [svg, held?.label]);
  if (!held || !first || !svg || !s) return null;

  const at = cardPlace(held.word, size, { width: window.innerWidth, height: window.innerHeight });
  const pdf = store.getState().pdfs.find((p) => p.id === held.id);
  const others = [...new Set(places.slice(1).map((p) => p.page + 1))].filter((p) => p !== first.page + 1);

  /** A press on the drawing: carried out once the pointer moves, as a structure pressed in its figure is. */
  const onPress = (e: React.PointerEvent<HTMLImageElement>) => {
    if (e.button !== 0 || !pdf) return;
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
      className="fixed z-50 select-none rounded-xl border border-gh-line bg-white/90 backdrop-blur shadow-sm px-2.5 py-2 text-[11px] leading-[16px] transition-opacity ease-meno"
      style={{ left: at.left, top: at.top, opacity: shown ? 1 : 0, transitionDuration: `${DURATION.base * 1000}ms`, pointerEvents: shown ? "auto" : "none" }}
      onPointerEnter={() => (over.current = true)}
      onPointerLeave={() => {
        over.current = false;
        if (!store.getState().pdfLens) setShown(false);
      }}
    >
      <img
        alt={`Compound ${held.label}, as Meno draws it`}
        src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
        draggable={false}
        width={w0 * k}
        height={h0 * k}
        className="block cursor-grab"
        onPointerDown={onPress}
      />
      <div className="mt-1 flex items-baseline gap-1.5 text-gh-gray">
        <span className="font-semibold text-gh-black">{held.label}</span>
        <button type="button" className="hover:text-gh-black transition-colors duration-150 ease-meno" onClick={() => show(first.page, s.box)}>
          p. {first.page + 1}
        </button>
        {others.length > 0 && <span>· also on p. {others.join(", ")}</span>}
      </div>
    </div>
  );
}
