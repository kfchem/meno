/**
 * Where the column is read, as it moves (docs/PDF.md, *In the column*): how
 * far down, how far across and how large, easing to where it is sent - a
 * wheel's notch, a page gone to, a zoom about the pointer - and following
 * fingers on a trackpad as they go. The column's HTML hears the wheel and
 * the pointer (TextColumn), the canvas draws it (PdfColumn): both reach the
 * same reader, one a canvas.
 *
 * Kept with the PDF (`reading`) once it has come to rest; the page most in
 * view is the page on top of it on the page as it goes.
 *
 * A link followed - in the column, or on the stack - is remembered, so
 * that Back comes back to where it was (`followLink`, `goBack`).
 */
import { openUrl } from "@tauri-apps/plugin-opener";
import { follow, TAU } from "../../../theme/motion";
import type { EditorStore } from "../store";
import type { PdfItem } from "../store/types";
import { atOf, columnLayout, deepest, pageInView, pointOf, pointOn, topOf, type ColumnLayout } from "../../../../lib/pdf/column";
import { isWebAddress, type PdfLink } from "../../../../lib/pdf/reader";
import { IS_MAC } from "../../../../lib/doc/shortcuts";

/** The column's header, its names and buttons, over the top of it: what is read begins under it, in CSS pixels. */
export const HEADER_PX = 44;
/** How large the pages may be made in the column: a quarter of its width to eight times it. */
export const ZOOM_LEAST = 0.25;
export const ZOOM_MOST = 8;
/** How long the column rests before where it is is kept, in ms. */
const KEEP_AFTER_MS = 400;
/** How far above a place a link goes to it is shown, in CSS pixels: a line's worth of what leads to it. */
const ABOVE_PX = 24;
/** How many places Back remembers, for each PDF. */
const BACK_MOST = 50;

/** Where Back goes: the page on top - and, read in the column, where it was read there. */
type Place = { page: number; at?: number; zoom?: number };

/** A point on a page held where it is on the column's body, in CSS pixels from its top left: where a zoom goes about. */
type Anchor = { page: number; u: number; v: number; sx: number; sy: number };

export class ColumnReader {
  /** The PDF read, and its pages' sizes in points. */
  id: number | null = null;
  sizes: readonly (readonly [number, number])[] = [];
  /** Where it is: how many pages down (`atOf`), how large, and how far across - the middle of what is seen, as a share of all of it. */
  at = 0;
  zoom = 1;
  across = 0.5;
  /** Where it is going: a point held where it is while the zoom goes there, or how far down and across. */
  goal: { zoom: number; anchor: Anchor | null; at: number; across: number } = { zoom: 1, anchor: null, at: 0, across: 0.5 };
  /** How wide the column is laid out, and how tall what is read of it is, in CSS pixels. */
  width = 440;
  tall = 600;
  /** The page most in view - or the page gone to, until it is moved by a hand. */
  page = 0;
  private goneTo: number | null = null;
  /**
   * A place sent to as a share of what is seen (`goToWhenRead`), and the
   * size it was worked out at: worked out again as the column comes to its
   * size - it is taken before it knows it - until it is moved otherwise.
   */
  private sought: { page: number; y: number | null; above: number; width: number; tall: number } | null = null;
  /** A frame asked for, where the column is drawn. */
  redraw: () => void = () => {};
  private keepTimer: ReturnType<typeof setTimeout> | null = null;
  /** When it was last moved by a hand: the wheel, a key, a link. */
  movedAt = 0;
  private listeners = new Set<(what: "moved" | "page") => void>();
  /** Where Back goes, for each PDF, the latest last. */
  private places = new Map<number, Place[]>();
  /** Whether the PDF taken was read no longer, when it was last taken. */
  private unread = false;

  constructor(private store: EditorStore) {}

  /**
   * The PDF to read, from where it was left - the one before kept where it
   * is; the same PDF, as it is - unless it was read no longer, and is read
   * again, from its page on top.
   */
  take(pdf: Pick<PdfItem, "id" | "pages" | "page" | "reading">): void {
    const again = this.id === pdf.id && !(this.unread && pdf.reading);
    this.unread = !pdf.reading;
    if (again) {
      this.sizes = pdf.pages;
      this.goToPending(pdf.id);
      return;
    }
    this.keep();
    this.id = pdf.id;
    this.goneTo = null;
    this.sought = null;
    this.sizes = pdf.pages;
    this.at = pdf.reading?.at ?? pdf.page;
    this.zoom = pdf.reading?.zoom ?? 1;
    this.across = 0.5;
    this.goal = { zoom: this.zoom, anchor: null, at: this.at, across: 0.5 };
    this.page = pdf.page;
    this.goToPending(pdf.id);
  }

  /** A place asked for in a PDF before it was read, gone to now it is. */
  private goToPending(id: number): void {
    const pending = this.pending;
    if (pending?.id !== id) return;
    this.pending = null;
    this.seek(pending.page, pending.y, pending.above);
  }

  layout(zoom = this.zoom): ColumnLayout {
    return columnLayout(this.sizes, this.width, zoom);
  }

  /** How far down and across what is seen begins, in CSS pixels, at a layout: kept within the pages. */
  private place(l: ColumnLayout, at: number, across: number): { top: number; left: number } {
    const top = Math.min(Math.max(0, topOf(l, at)), deepest(l, this.tall));
    const left = Math.min(Math.max(0, across * l.width - this.width / 2), Math.max(0, l.width - this.width));
    return { top, left };
  }

  /** What is seen now: the layout, and how far down and across it begins. */
  seen(): { l: ColumnLayout; top: number; left: number } {
    const l = this.layout();
    return { l, ...this.place(l, this.at, this.across) };
  }

  /** Moved by the wheel or fingers, by CSS pixels: eased (a notch), or at once (fingers). */
  scrollBy(dx: number, dy: number, atOnce: boolean): void {
    this.goneTo = null;
    this.sought = null;
    const g = this.goal;
    if (g.anchor) {
      g.anchor.sx -= dx;
      g.anchor.sy -= dy;
    } else {
      const l = this.layout(g.zoom);
      const from = this.place(l, g.at, g.across);
      this.aim(l, from.top + dy, from.left + dx);
    }
    if (atOnce && !g.anchor) {
      this.at = g.at;
      this.across = g.across;
    }
    this.moved();
  }

  /** Made larger or smaller by `ratio`, about a point on the column's body: at once (a pinch), or eased (a notch). */
  zoomAt(ratio: number, sx: number, sy: number, atOnce: boolean): void {
    this.goneTo = null;
    this.sought = null;
    const zoom = Math.min(ZOOM_MOST, Math.max(ZOOM_LEAST, this.goal.zoom * ratio));
    const { l, top, left } = this.seen();
    const at = pointOn(l, left + sx, top + sy);
    this.goal = { ...this.goal, zoom, anchor: { ...at, sx, sy } };
    if (atOnce) {
      this.zoom = zoom;
      this.hold();
    }
    this.moved();
  }

  /** As wide as the column again, about the middle of what is seen. */
  fitWidth(): void {
    this.zoomAt(1 / this.goal.zoom, this.width / 2, this.tall / 2, false);
  }

  /** A page gone to: its top at the top of what is seen - or, `y` points down it, `above` pixels below the top (a line's worth). */
  goTo(page: number, y: number | null = null, above = ABOVE_PX): void {
    this.sought = null;
    const i = Math.min(Math.max(0, Math.round(page)), this.sizes.length - 1);
    let at: number = i;
    if (y != null && Number.isFinite(y)) {
      const l = this.layout(this.goal.zoom);
      const p = l.pages[i];
      if (p) at = atOf(l, Math.min(Math.max(0, p.y + y * l.scale - above), deepest(l, this.tall)));
    }
    this.goal = { ...this.goal, anchor: null, at };
    // (the page gone to is the page shown, though its place be low on it, or the last pages be all in view)
    this.goneTo = i;
    this.moved();
  }

  /** A place to go to once the PDF it is in is read: gone to as it is taken. */
  private pending: { id: number; page: number; y: number | null; above: number } | null = null;

  /**
   * A place in a PDF gone to, `above` its share of what is seen below the
   * top - now, where it is the one read; else as soon as it is (one read no
   * longer, though still taken, is about to be read again from its top).
   */
  goToWhenRead(id: number, page: number, y: number | null, above: number): void {
    if (this.id === id && !this.unread) {
      this.pending = null;
      this.seek(page, y, above);
    } else this.pending = { id, page, y, above };
  }

  /** A place gone to, `above` its share of what is seen below the top, kept to as the column comes to its size. */
  private seek(page: number, y: number | null, above: number): void {
    this.goTo(page, y, above * this.tall);
    this.sought = { page, y, above, width: this.width, tall: this.tall };
  }

  /** A place gone back to: where it was read, and how large, its page the page shown. */
  goBackTo(place: Place): void {
    this.sought = null;
    this.goal = { ...this.goal, anchor: null, at: place.at ?? place.page, zoom: place.zoom ?? this.goal.zoom };
    this.goneTo = Math.min(Math.max(0, place.page), this.sizes.length - 1);
    this.moved();
  }

  /** Where it is going, as Back would come back to it. */
  here(): Place {
    return { page: this.page, at: this.goal.anchor ? this.at : this.goal.at, zoom: this.goal.zoom };
  }

  /** A place remembered, for Back to come back to. */
  remember(id: number, place: Place): void {
    const list = this.places.get(id) ?? [];
    list.push(place);
    if (list.length > BACK_MOST) list.shift();
    this.places.set(id, list);
  }

  /** The place Back comes back to, for a PDF, taken; none, if none is remembered. */
  takeBack(id: number): Place | null {
    return this.places.get(id)?.pop() ?? null;
  }

  /** Whether Back has somewhere to come back to, for a PDF. */
  canGoBack(id: number): boolean {
    return !!this.places.get(id)?.length;
  }

  /** Who hears it moved by a hand, and its page most in view change. */
  listen(f: (what: "moved" | "page") => void): () => void {
    this.listeners.add(f);
    return () => void this.listeners.delete(f);
  }

  /** Heard: it has been moved, or come to another page. */
  tell(what: "moved" | "page"): void {
    for (const f of this.listeners) f(what);
  }

  /** The goal, as how far down and across, kept within the pages. */
  private aim(l: ColumnLayout, top: number, left: number): void {
    const t = Math.min(Math.max(0, top), deepest(l, this.tall));
    const w = Math.max(0, l.width - this.width);
    const x = Math.min(Math.max(0, left), w);
    this.goal.at = atOf(l, t);
    this.goal.across = l.width > this.width ? (x + this.width / 2) / l.width : 0.5;
  }

  /** The point held put where it is held, at the zoom now. */
  private hold(): void {
    const a = this.goal.anchor;
    if (!a) return;
    const l = this.layout();
    const p = pointOf(l, a);
    const top = Math.min(Math.max(0, p.y - a.sy), deepest(l, this.tall));
    const w = Math.max(0, l.width - this.width);
    const left = Math.min(Math.max(0, p.x - a.sx), w);
    this.at = atOf(l, top);
    this.across = l.width > this.width ? (left + this.width / 2) / l.width : 0.5;
  }

  /**
   * One step `dt` seconds nearer the goal; whether it is still going. The
   * zoom eases, the point held put as it does; then how far down and
   * across, in pixels.
   */
  step(dt: number): boolean {
    // (a place sent to, worked out again at the size the column has come to)
    const s = this.sought;
    if (s && (s.width !== this.width || s.tall !== this.tall)) this.seek(s.page, s.y, s.above);
    const g = this.goal;
    const zooming = Math.abs(Math.log(this.zoom / g.zoom)) > 1e-4;
    this.zoom = zooming ? Math.exp(follow(Math.log(this.zoom), Math.log(g.zoom), dt, TAU.move)) : g.zoom;
    if (g.anchor) {
      this.hold();
      if (!zooming) {
        // (there: held no longer, but kept where it came to)
        g.at = this.at;
        g.across = this.across;
        g.anchor = null;
      }
      return zooming;
    }
    const l = this.layout();
    const now = this.place(l, this.at, this.across);
    const to = this.place(l, g.at, g.across);
    const top = follow(now.top, to.top, dt, TAU.move);
    const left = follow(now.left, to.left, dt, TAU.move);
    // (there, it is where it was sent, as it was said - not as near as pixels come back to it)
    if (Math.abs(top - to.top) < 0.5 && Math.abs(left - to.left) < 0.5) {
      this.at = g.at;
      this.across = g.across;
      return zooming;
    }
    this.at = atOf(l, top);
    this.across = l.width > this.width ? (left + this.width / 2) / l.width : 0.5;
    return true;
  }

  /** The page most in view now - or the page gone to - and whether it is another than it was. */
  pageNow(): { page: number; changed: boolean } {
    const { l, top } = this.seen();
    const page = this.goneTo ?? pageInView(l, top, this.tall);
    const changed = page !== this.page;
    this.page = page;
    return { page, changed };
  }

  /** Moved: drawn, said, and kept once it rests. */
  moved(): void {
    this.movedAt = performance.now();
    this.redraw();
    this.tell("moved");
    if (this.keepTimer != null) clearTimeout(this.keepTimer);
    this.keepTimer = setTimeout(() => {
      this.keepTimer = null;
      this.keep();
    }, KEEP_AFTER_MS);
  }

  /** None read: the one read kept where it is, and the next taken from where it was left. */
  letGo(): void {
    this.keep();
    this.id = null;
    this.sought = null;
  }

  /** Where it is, kept with the PDF. */
  keep(): void {
    if (this.id == null) return;
    const pdf = this.store.getState().pdfs.find((p) => p.id === this.id);
    if (!pdf?.reading) return;
    const at = Math.round(this.goal.anchor ? this.at * 1000 : this.goal.at * 1000) / 1000;
    const zoom = Math.round(this.goal.zoom * 1000) / 1000;
    if (pdf.reading.at !== at || pdf.reading.zoom !== zoom) this.store.getState().setPdfReading(this.id, { at, zoom });
  }
}

/**
 * Whether a click follows a link it is on (docs/WORKSPACE.md, *PDFs*): only
 * with ⌘ held on a Mac, Ctrl elsewhere, as the system's own links are -
 * a plain click does what it does on the page anywhere else (the
 * maintainer, 2026-10-18: a link opened at a plain click was a surprise).
 */
export function followsLink(e: { metaKey: boolean; ctrlKey: boolean }, mac = IS_MAC): boolean {
  return mac ? e.metaKey : e.ctrlKey;
}

/** What a link does, as it is shown over it: ⌘-click (Ctrl-click) and where it goes. */
export function linkHint(link: PdfLink, mac = IS_MAC): string {
  const how = mac ? "\u2318-click" : "Ctrl+click";
  if (link.uri) return `${how} to open ${link.uri.trim()}`;
  return link.page != null ? `${how} to go to page ${link.page + 1}` : "";
}

/**
 * A link followed: a web page opened in the system's browser - one of the
 * web's, or mail's, only; a place in the PDF gone to, in the column where
 * the column shows the PDF, else on its stack, the page turned there - and
 * where it was remembered, for Back.
 */
export function followLink(store: EditorStore, pdf: Pick<PdfItem, "id" | "page">, link: PdfLink): void {
  if (link.uri) {
    if (isWebAddress(link.uri)) void openUrl(link.uri.trim()).catch(() => {});
    return;
  }
  if (link.page == null) return;
  const r = readerOf(store);
  const st = store.getState();
  if (st.textsOpen && st.pdfShown === pdf.id && r.id === pdf.id) {
    r.remember(pdf.id, r.here());
    r.goTo(link.page, link.y ?? null);
  } else {
    r.remember(pdf.id, { page: pdf.page });
    st.turnPdf(pdf.id, link.page);
  }
}

/** Back, for a PDF: to where it was before the last link followed in it; whether there was somewhere to go. */
export function goBack(store: EditorStore, id: number): boolean {
  const r = readerOf(store);
  const place = r.takeBack(id);
  if (!place) return false;
  const st = store.getState();
  if (st.textsOpen && st.pdfShown === id && r.id === id) r.goBackTo(place);
  else if (st.pdfs.some((p) => p.id === id && p.page !== place.page)) st.turnPdf(id, place.page);
  return true;
}

/** Whether a key is the system's Back: Command and [ on a Mac, Alt and the left arrow elsewhere (either, on both). */
export const isBackKey = (e: KeyboardEvent) =>
  (e.metaKey && !e.altKey && !e.ctrlKey && (e.key === "[" || e.code === "BracketLeft")) || (e.altKey && !e.metaKey && !e.ctrlKey && e.key === "ArrowLeft");

const readers = new WeakMap<EditorStore, ColumnReader>();

/** The column's reader, one a canvas. */
export function readerOf(store: EditorStore): ColumnReader {
  let r = readers.get(store);
  if (!r) readers.set(store, (r = new ColumnReader(store)));
  return r;
}
