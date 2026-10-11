/**
 * A Markdown text read in the column, formatted (docs/PDF.md, *Markdown*):
 * what it says (lib/text/markdown), laid out as wide as the column (./
 * markdownLayout), how far it is scrolled, and what of it is selected - in
 * its words read as one text (`Laid.plain`). Its HTML half (MarkdownBody)
 * moves and selects it; the canvas draws it (Workspace components/
 * MarkdownText). The text itself is written in its source.
 */
import { caretAt, lineAround, Lines, selFrom, selTo, wordAround, type Sel } from "../../../lib/text/editing";
import { readMarkdown, type MarkdownDoc } from "../../../lib/text/markdown";
import { layOut, rowAt, type CodeColours, type Laid, type Piece } from "./markdownLayout";
import { measureText } from "./markdownType";

/** How far the view's foot may be scrolled past the text's, in px: none. */
const MOST_PAST = 0;

export class MarkdownReader {
  private text = "";
  private doc: MarkdownDoc = { blocks: [] };
  private laid: Laid | null = null;
  private colours: CodeColours | null = null;
  private plainLines: Lines | null = null;
  scrollTop = 0;
  /** How large the view is, in CSS pixels. */
  viewW = 0;
  viewH = 0;
  /** What is selected, in the words read. */
  sel: Sel = caretAt(0);
  focused = false;
  /** Told when anything drawn has changed. */
  onChange: () => void = () => {};

  constructor(text: string) {
    this.setText(text);
  }

  setText(text: string): void {
    if (text === this.text && this.laid) return;
    this.text = text;
    this.doc = readMarkdown(text);
    this.relay();
  }

  /** Its code coloured as `colours` says: laid out again. */
  setColours(colours: CodeColours | null): void {
    this.colours = colours;
    this.relay();
  }

  /** Laid out again: its type come, its colours made. */
  relay(): void {
    this.laid = null;
    this.plainLines = null;
    this.onChange();
  }

  /** The text laid out as wide as the view. */
  get layout(): Laid {
    const w = Math.max(120, Math.round(this.viewW || 440));
    if (!this.laid || this.laid.width !== w) {
      this.laid = layOut(this.doc.blocks, w, measureText, this.colours);
      this.plainLines = null;
      const n = this.laid.plain.length;
      if (this.sel.anchor > n || this.sel.head > n) this.sel = caretAt(Math.min(this.sel.head, n));
      this.scrollTop = Math.min(this.scrollTop, this.mostTop);
    }
    return this.laid;
  }

  private get lines(): Lines {
    return (this.plainLines ??= new Lines(this.layout.plain));
  }

  get mostTop(): number {
    return Math.max(0, (this.laid?.height ?? 0) - this.viewH + MOST_PAST);
  }

  scrollTo(top: number): void {
    const t = Math.min(Math.max(0, top), this.mostTop);
    if (t === this.scrollTop) return;
    this.scrollTop = t;
    this.onChange();
  }

  setView(w: number, h: number): void {
    if (w === this.viewW && h === this.viewH) return;
    // (the words at the top kept at the top as it narrows or widens)
    const src = this.laid && this.viewW ? this.topSrc() : null;
    const before = this.laid?.width;
    this.viewW = w;
    this.viewH = h;
    if (src != null && this.layout.width !== before) this.scrollToSrc(src);
    this.scrollTo(this.scrollTop);
    this.onChange();
  }

  /** Where in the text written the words at the view's top begin. */
  topSrc(): number {
    const l = this.layout;
    const r = l.rows[rowAt(l, this.scrollTop)];
    return r ? r.src : 0;
  }

  /** The view moved so that what begins at a place in the text written lies at its top. */
  scrollToSrc(src: number): void {
    const l = this.layout;
    let best = 0;
    for (const r of l.rows) {
      if (r.src > src) break;
      best = r.y;
    }
    this.scrollTo(best);
  }

  /** The view moved to a heading, by its name: whether it has one so named. */
  goToHeading(slug: string): boolean {
    const y = this.layout.anchors.get(slug.toLowerCase());
    if (y == null) return false;
    this.scrollTo(y - 8);
    return true;
  }

  /** The words drawn on the line nearest a point of the view, in order across: none where the text has none near. */
  private lineNear(y: number): { row: number; pieces: Piece[] } | null {
    const l = this.layout;
    const wy = y + this.scrollTop;
    let i = rowAt(l, wy);
    // (a row of no words - room between blocks, a rule - the nearest that has some: below it, else above)
    const has = (k: number) => l.rows[k]?.pieces.some((p) => p.at >= 0);
    if (!has(i)) {
      let down = i + 1;
      let up = i - 1;
      while (down < l.rows.length && !has(down)) down++;
      while (up >= 0 && !has(up)) up--;
      if (down >= l.rows.length && up < 0) return null;
      i = down < l.rows.length && (up < 0 || l.rows[down].y - wy < wy - (l.rows[up].y + l.rows[up].h)) ? down : up;
    }
    const row = l.rows[i];
    const words = row.pieces.filter((p) => p.at >= 0);
    // (a table's row: its cells' lines, the one nearest)
    const ys = [...new Set(words.map((p) => p.y))];
    const local = wy - row.y;
    const line = ys.reduce((a, b) => (Math.abs(b - local - 5) < Math.abs(a - local - 5) ? b : a), ys[0]);
    return { row: i, pieces: words.filter((p) => p.y === line).sort((a, b) => a.x - b.x) };
  }

  /** The place in the words read nearest a point of the view: between letters, the nearer edge. */
  at(x: number, y: number): number {
    const near = this.lineNear(y);
    if (!near || !near.pieces.length) return this.layout.plain.length;
    const ps = near.pieces;
    if (x <= ps[0].x) return ps[0].at;
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k];
      const w = measureText(p.text, p.font);
      const next = ps[k + 1];
      if (x <= p.x + w || (next && x < next.x)) {
        if (x >= p.x + w) return p.at + p.text.length;
        return p.at + letterAt(p, x - p.x);
      }
    }
    const last = ps[ps.length - 1];
    return last.at + last.text.length;
  }

  /** The link under a point of the view, if any. */
  linkAt(x: number, y: number): string | null {
    const l = this.layout;
    const wy = y + this.scrollTop;
    const row = l.rows[rowAt(l, wy)];
    if (!row) return null;
    const local = wy - row.y;
    for (const p of row.pieces) {
      if (!p.link) continue;
      const w = measureText(p.text, p.font);
      if (x >= p.x && x <= p.x + w && local >= p.y - p.font.px && local <= p.y + p.font.px * 0.35) return p.link;
    }
    return null;
  }

  /** A press: the place there; two, its word; three, its paragraph - or, with Shift, what is selected drawn on to it. */
  pressAt(x: number, y: number, clicks: number, extend: boolean): Sel {
    const at = this.at(x, y);
    let sel: Sel;
    if (clicks >= 3) {
      const [a, b] = lineAround(this.lines, at);
      sel = { anchor: a, head: b };
    } else if (clicks === 2) {
      const [a, b] = wordAround(this.lines, at);
      sel = { anchor: a, head: b };
    } else sel = extend ? { anchor: this.sel.anchor, head: at } : caretAt(at);
    this.select(sel);
    return sel;
  }

  /** A drag on from a press: by letters, or by the words or paragraphs the press selected. */
  dragTo(x: number, y: number, from: Sel, clicks: number): void {
    const at = this.at(x, y);
    if (clicks >= 2) {
      const [a, b] = clicks >= 3 ? lineAround(this.lines, at) : wordAround(this.lines, at);
      const lo = Math.min(selFrom(from), a);
      const hi = Math.max(selTo(from), b);
      this.select(at < selFrom(from) ? { anchor: hi, head: lo } : { anchor: lo, head: hi });
      return;
    }
    this.select({ anchor: from.anchor, head: at });
  }

  select(sel: Sel): void {
    if (sel.anchor === this.sel.anchor && sel.head === this.sel.head) return;
    this.sel = sel;
    this.onChange();
  }

  selectAll(): void {
    this.select({ anchor: 0, head: this.layout.plain.length });
  }

  /** The words selected, as they read: paragraphs and lines on lines of their own, a table's cells apart by tabs. */
  get selected(): string {
    return this.layout.plain.slice(selFrom(this.sel), selTo(this.sel));
  }
}

/** The place in a piece's words nearest a point across it, from its start: between letters, the nearer edge. */
function letterAt(p: Piece, x: number): number {
  let before = 0;
  let at = 0;
  for (const ch of p.text) {
    const next = at + ch.length;
    const w = measureText(p.text.slice(0, next), p.font);
    if (x < w) return x - before < w - x ? at : next;
    before = w;
    at = next;
  }
  return p.text.length;
}
