/**
 * A Markdown text set for reading (docs/PDF.md, *Markdown*): its blocks
 * (lib/text/markdown) laid out at a width, in rows, each a line of words -
 * or the room between blocks - with what is drawn under and round them:
 * code's ground, a quote's bar, a rule, a table's lines, a list's marks.
 * Set as GitHub sets Markdown, in Meno's type: IBM Plex Sans, its code in
 * IBM Plex Mono. In CSS pixels, from the text's top left; a row's parts
 * from its own top. The column draws the rows as pictures (MarkdownText),
 * a sheet on the page and a text on its way to the column in the page's
 * type (MarkdownRows), all from one layout.
 */
import type { Align, Block, Item, Run, Style } from "../../../lib/text/markdown";

/** A typeface, as a part is set in it: how large, how heavy, whether italic, whether monospaced. */
export type Font = { px: number; weight: 400 | 600; italic: boolean; mono: boolean };

/** How wide words are set in a typeface, in CSS pixels. */
export type Measure = (text: string, font: Font) => number;

/** Words drawn: where they begin, across, and their baseline, down from the row's top; how they are set; where they are in the text read (`at`, in `plain`; none, -1, for a list's number) and in the text written (`src`). */
export type Piece = { x: number; y: number; text: string; font: Font; colour: string; at: number; src: number; link?: string; strike?: boolean };

/** What is drawn under or round words: a box filled, its outline, a disc, a ring, a square - a list's marks - a task's box. From the row's top left. */
export type Deco =
  | { kind: "fill"; x: number; y: number; w: number; h: number; colour: string }
  | { kind: "frame"; x: number; y: number; w: number; h: number; colour: string }
  | { kind: "disc" | "ring" | "square"; x: number; y: number; r: number; colour: string }
  | { kind: "check"; x: number; y: number; size: number; checked: boolean };

/** A row: where its top is, how tall it is, its words and what is drawn with them, and where in the text written it begins. */
export type Row = { y: number; h: number; pieces: Piece[]; decos: Deco[]; src: number };

/** A text laid out: how wide and tall, its rows, its words read as one text (what is selected and copied), and where each heading lies, by its name. */
export type Laid = { width: number; height: number; rows: Row[]; plain: string; anchors: Map<string, number> };

/** A code block's colours: each of its lines' parts and their colours, as the text's colouring gives them - none, where its language is not known. */
export type CodeColours = (lang: string, text: string) => { from: number; to: number; colour: string }[][] | null;

// --- the look ----------------------------------------------------------------

/** The type: the text's, its code's, a line of each, in CSS pixels. */
export const BODY_PX = 15;
export const LINE = 24;
export const CODE_PX = 13;
export const CODE_LINE = 20;
/** How far in from the text's edges it is set. */
export const PAD_X = 20;
export const PAD_TOP = 16;
export const PAD_FOOT = 24;
/** The colours, from the palette the column's look is taken from (App.css, `--color-gh-*`). */
export const COLOURS = {
  ink: "rgb(31, 35, 40)",
  muted: "rgb(89, 99, 110)",
  link: "rgb(9, 105, 218)",
  line: "rgb(209, 217, 224)",
  ground: "rgb(246, 248, 250)",
  codeInline: "rgb(239, 241, 243)",
  html: "rgb(130, 139, 149)",
  paper: "#ffffff",
};
/** Headings' sizes as a share of the text's, h1 to h6, and how far above and below them is room. */
const HEADING_EM = [2, 1.5, 1.25, 1, 0.875, 0.85];
const HEADING_ABOVE = 24;
/** Room after a block, and a rule's above and below it. */
const BLOCK_GAP = 16;
const RULE_GAP = 24;
const RULE_PX = 4;
/** A list's indent, and the room between a tight list's items. */
const INDENT = 30;
const TIGHT_GAP = 4;
/** A quote's bar, and how far in from it its words lie. */
const BAR_PX = 4;
const QUOTE_IN = 15;
/** Code's room round it in a block, and an inline code's ground beyond its letters. */
const CODE_PAD = 16;
const CODE_GROUND_X = 3;
/** A table's cells' room round their words. */
const CELL_X = 13;
const CELL_Y = 6;
/** A task's box. */
const CHECK_PX = 13;
/** IBM Plex's ascent and descent, as a share of its size: where a line's baseline lies in it. */
const ASCENT = 1.025;
const DESCENT = 0.275;

const body = (px = BODY_PX): Font => ({ px, weight: 400, italic: false, mono: false });
const mono = (px = CODE_PX): Font => ({ px, weight: 400, italic: false, mono: true });

/** How a run is set, in a block set in `base`: strong heavier, emphasised italic, code in the monospaced type - a size smaller - a link in its colour, HTML grey. */
function setting(style: Style, base: Font, colour: string): { font: Font; colour: string } {
  const font: Font = style.code ? mono(Math.round(base.px * (CODE_PX / BODY_PX) * 4) / 4) : { ...base };
  if (style.strong) font.weight = 600;
  if (style.em || style.image) font.italic = true;
  return { font, colour: style.link ? COLOURS.link : style.html || style.image ? COLOURS.html : colour };
}

// --- lines -------------------------------------------------------------------

const CJK = "\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F\uAC00-\uD7AF";
/** What may not end a line, and what may not begin one (as Japanese is set): kept with the letter after, or before. */
const OPENS = "\uFF08\u300C\u300E\u3010\u3014\u3008\u300A\u3018\u3016\uFF3B\uFF5B(\\[";
const CLOSES = "\u3001\u3002\uFF0C\uFF0E\u30FB\uFF1A\uFF1B\uFF1F\uFF01\u30FC\uFF09\u300D\u300F\u3011\u3015\u3009\u300B\u3019\u3017\uFF3D\uFF5D\u301C\u2026\u2025\u3041\u3043\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308E\u30A1\u30A3\u30A5\u30A7\u30A9\u30C3\u30E3\u30E5\u30E7\u30EE\u30F5\u30F6";
/** Where a line may break: after a word and the spaces after it, or between two Chinese or Japanese letters. */
const SEGMENT = new RegExp(`\\n|[${OPENS}]*[${CJK}][${CLOSES}]*|[^\\s${CJK}]+[ \\t]*|[ \\t]+`, "gu");

/** A part of a run that keeps together on a line. */
type Seg = { text: string; run: number; offset: number };

/** A line of words, as it is set: its parts, across from its start, how wide and how tall, its baseline, and the white space it was broken at (in the text read, not drawn). */
type SetLine = { parts: { x: number; text: string; run: number; offset: number }[]; width: number; ascent: number; descent: number; tail: string };

/** Each run's text in parts that keep together on a line. */
function segmentsOf(runs: readonly Run[]): Seg[] {
  const out: Seg[] = [];
  runs.forEach((r, run) => {
    for (const m of r.text.matchAll(SEGMENT)) out.push({ text: m[0], run, offset: m.index });
  });
  return out;
}

/** The letters of a word too wide for a line: at most as wide as it, each part. */
function splitWide(seg: Seg, width: number, font: Font, measure: Measure): Seg[] {
  const out: Seg[] = [];
  let start = 0;
  const letters = Array.from(seg.text);
  let at = 0;
  let from = 0;
  for (let i = 0; i < letters.length; i++) {
    const next = at + letters[i].length;
    if (i > start && measure(seg.text.slice(from, next), font) > width) {
      out.push({ text: seg.text.slice(from, at), run: seg.run, offset: seg.offset + from });
      from = at;
      start = i;
    }
    at = next;
  }
  out.push({ text: seg.text.slice(from), run: seg.run, offset: seg.offset + from });
  return out;
}

/** Runs set in lines no wider than `width`: broken after a word and its spaces, or between Chinese or Japanese letters; a word too wide broken between its letters; a break where it says. */
function setLines(runs: readonly Run[], width: number, fontOf: (run: number) => Font, measure: Measure): SetLine[] {
  const lines: SetLine[] = [];
  const blank = (): SetLine => ({ parts: [], width: 0, ascent: 0, descent: 0, tail: "" });
  let line = blank();
  let x = 0;
  const grow = (f: Font) => {
    line.ascent = Math.max(line.ascent, f.px * ASCENT);
    line.descent = Math.max(line.descent, f.px * DESCENT);
  };
  const end = () => {
    // (the white space it was broken at: read, not drawn)
    const last = line.parts[line.parts.length - 1];
    if (last) {
      const kept = last.text.replace(/[ \t]+$/, "");
      line.tail = last.text.slice(kept.length) + line.tail;
      last.text = kept;
      if (!kept) line.parts.pop();
    }
    const l2 = line.parts[line.parts.length - 1];
    line.width = l2 ? l2.x + measure(l2.text, fontOf(l2.run)) : 0;
    if (!line.ascent) grow(fontOf(0));
    lines.push(line);
    line = blank();
    x = 0;
  };
  const place = (s: Seg) => {
    const f = fontOf(s.run);
    const last = line.parts[line.parts.length - 1];
    if (last && last.run === s.run && last.offset + last.text.length === s.offset) last.text += s.text;
    else line.parts.push({ x, text: s.text, run: s.run, offset: s.offset });
    x += measure(s.text, f);
    grow(f);
  };
  for (const s of segmentsOf(runs)) {
    if (s.text === "\n") {
      line.tail += "\n";
      end();
      continue;
    }
    const f = fontOf(s.run);
    const w = measure(s.text.replace(/[ \t]+$/, ""), f);
    if (x > 0 && x + w > width) {
      // (spaces at a line's end go with it)
      if (!s.text.trim()) {
        place(s);
        continue;
      }
      end();
    }
    if (!s.text.trim() && x === 0 && lines.length && !lines[lines.length - 1].tail.endsWith("\n")) {
      // (a line begun by a break takes no spaces before its words)
      lines[lines.length - 1].tail += s.text;
      continue;
    }
    if (w > width) for (const part of splitWide(s, width, f, measure)) {
      if (x > 0 && x + measure(part.text, f) > width) end();
      place(part);
    }
    else place(s);
  }
  if (line.parts.length || !lines.length) end();
  return lines;
}

// --- blocks ------------------------------------------------------------------

/** Where blocks are being laid: from where across, how wide, in what colour, how deep in lists, and whether a tight list's item. */
type Ctx = { x: number; w: number; colour: string; depth: number; tight: boolean };

class Layout {
  rows: Row[] = [];
  plain = "";
  anchors = new Map<string, number>();
  private y = 0;

  constructor(
    private readonly measure: Measure,
    private readonly codeColours: CodeColours | null,
  ) {}

  row(h: number, src: number): Row {
    const r: Row = { y: this.y, h, pieces: [], decos: [], src };
    this.rows.push(r);
    this.y += h;
    return r;
  }

  /** Room between blocks: a row with nothing in it, but what goes down the side of a quote or a list. */
  gap(h: number, src: number): void {
    if (h > 0) this.row(h, src);
  }

  /** Runs set in lines across `ctx`, each a row: their words - each run in its colour, where `colours` says - and an inline code's ground and an image's frame under and round them. */
  words(runs: readonly Run[], base: Font, ctx: Ctx, lineH: number, src: number, align: Align = null, w = ctx.w, x0 = ctx.x, colours?: readonly string[]): Row[] {
    const sets = runs.map((r, i) => {
      const set = setting(r.style, base, ctx.colour);
      return colours?.[i] ? { ...set, colour: colours[i] } : set;
    });
    const lines = setLines(runs, w, (i) => sets[i]?.font ?? base, this.measure);
    const out: Row[] = [];
    for (const l of lines) {
      const h = Math.max(lineH, Math.ceil(l.ascent + l.descent));
      const row = this.row(h, l.parts[0] ? runs[l.parts[0].run].src + l.parts[0].offset : src);
      const y = Math.round((h - (l.ascent + l.descent)) / 2 + l.ascent);
      const shift = align === "right" ? w - l.width : align === "center" ? (w - l.width) / 2 : 0;
      for (const p of l.parts) {
        const r = runs[p.run];
        const { font, colour } = sets[p.run];
        const x = x0 + shift + p.x;
        const piece: Piece = { x, y, text: p.text, font, colour, at: this.plain.length, src: r.src + p.offset, ...(r.style.link ? { link: r.style.link } : {}), ...(r.style.strike ? { strike: true } : {}) };
        this.plain += p.text;
        row.pieces.push(piece);
        if (r.style.code || r.style.image) {
          const pw = this.measure(p.text, font);
          const top = y - Math.round(font.px * 0.95);
          const tall = Math.round(font.px * 1.3);
          row.decos.push(r.style.code ? { kind: "fill", x: x - CODE_GROUND_X, y: top, w: pw + 2 * CODE_GROUND_X, h: tall, colour: COLOURS.codeInline } : { kind: "frame", x: x - CODE_GROUND_X, y: top, w: pw + 2 * CODE_GROUND_X, h: tall, colour: COLOURS.line });
        }
      }
      this.plain += l.tail;
      out.push(row);
    }
    return out;
  }

  blocks(blocks: readonly Block[], ctx: Ctx): void {
    let below = 0;
    blocks.forEach((b, i) => {
      if (i > 0) this.gap(ctx.tight ? 0 : Math.max(below, above(b)), b.src);
      this.block(b, ctx);
      below = b.kind === "rule" ? RULE_GAP : BLOCK_GAP;
      if (i < blocks.length - 1 && !this.plain.endsWith("\n")) this.plain += "\n";
    });
  }

  block(b: Block, ctx: Ctx): void {
    switch (b.kind) {
      case "paragraph":
        this.words(b.runs, body(), ctx, LINE, b.src);
        return;
      case "heading": {
        const px = BODY_PX * HEADING_EM[b.level - 1];
        const font: Font = { ...body(px), weight: 600 };
        const start = this.rows.length;
        this.words(b.runs.length ? b.runs : [{ text: "", style: {}, src: b.src }], font, { ...ctx, colour: b.level === 6 ? COLOURS.muted : ctx.colour }, Math.round(px * 1.25), b.src);
        this.anchors.set(b.slug, this.rows[start]?.y ?? this.y);
        if (b.level <= 2) {
          // (under h1 and h2, a rule)
          const r = this.row(Math.round(px * 0.3) + 1, b.src);
          r.decos.push({ kind: "fill", x: ctx.x, y: r.h - 1, w: ctx.w, h: 1, colour: COLOURS.line });
        }
        return;
      }
      case "code":
      case "html":
        this.code(b.text, b.kind === "code" ? b.lang : "", ctx, b.src, b.kind === "html");
        return;
      case "rule": {
        const r = this.row(RULE_PX, b.src);
        r.decos.push({ kind: "fill", x: ctx.x, y: 0, w: ctx.w, h: RULE_PX, colour: COLOURS.line });
        return;
      }
      case "quote": {
        const start = this.rows.length;
        const inner = { ...ctx, x: ctx.x + BAR_PX + QUOTE_IN, w: ctx.w - BAR_PX - QUOTE_IN, colour: COLOURS.muted, tight: false };
        this.blocks(b.blocks, inner);
        for (const r of this.rows.slice(start)) r.decos.unshift({ kind: "fill", x: ctx.x, y: 0, w: BAR_PX, h: r.h, colour: COLOURS.line });
        return;
      }
      case "list":
        this.list(b.items, b.ordered, b.start, b.tight, ctx);
        return;
      case "table":
        this.table(b.align, b.head, b.rows, ctx, b.src);
        return;
    }
  }

  /** Code, or HTML as written: its lines as they are, broken where too long, on its ground - HTML on none, grey. */
  private code(text: string, lang: string, ctx: Ctx, src: number, html: boolean): void {
    const start = this.rows.length;
    const pad = html ? 0 : CODE_PAD;
    if (!html) this.gap(CODE_PAD, src);
    const lines = text.split("\n");
    const tones = !html && this.codeColours ? this.codeColours(lang, text) : null;
    const font = mono();
    const ink = html ? COLOURS.html : COLOURS.ink;
    let offset = 0;
    lines.forEach((line, i) => {
      // (each line's parts in their colours; broken where it is too wide, its parts with it)
      const runs: Run[] = [];
      const colours: string[] = [];
      let at = 0;
      const part = (from: number, to: number, colour: string) => {
        if (to <= from) return;
        runs.push({ text: line.slice(from, to), style: {}, src: src + offset + from });
        colours.push(colour);
      };
      for (const t of tones?.[i] ?? []) {
        part(at, t.from, ink);
        part(t.from, t.to, t.colour);
        at = Math.max(at, t.to);
      }
      part(at, line.length, ink);
      this.words(runs.length ? runs : [{ text: "", style: {}, src: src + offset }], font, ctx, CODE_LINE, src + offset, null, ctx.w - 2 * pad, ctx.x + pad, colours);
      if (i < lines.length - 1) this.plain += "\n";
      offset += line.length + 1;
    });
    if (!html) {
      this.gap(CODE_PAD, src);
      for (const r of this.rows.slice(start)) r.decos.unshift({ kind: "fill", x: ctx.x, y: 0, w: ctx.w, h: r.h, colour: COLOURS.ground });
    }
  }

  private list(items: readonly Item[], ordered: boolean, start: number, tight: boolean, ctx: Ctx): void {
    const inner: Ctx = { ...ctx, x: ctx.x + INDENT, w: ctx.w - INDENT, depth: ctx.depth + 1, tight };
    items.forEach((item, i) => {
      if (i > 0) this.gap(tight ? TIGHT_GAP : BLOCK_GAP, item.src);
      const first = this.rows.length;
      this.blocks(item.blocks.length ? item.blocks : [{ kind: "paragraph", runs: [], src: item.src }], inner);
      if (i < items.length - 1 && !this.plain.endsWith("\n")) this.plain += "\n";
      // its mark, by its first line: a task's box, a number, or a disc, a ring, a square, deeper in
      const r = this.rows[first];
      if (!r) return;
      const base = r.pieces[0]?.y ?? Math.round((r.h - BODY_PX * (ASCENT + DESCENT)) / 2 + BODY_PX * ASCENT);
      const mid = base - Math.round(BODY_PX * 0.32);
      if (item.task != null) r.decos.push({ kind: "check", x: inner.x - CHECK_PX - 8, y: mid - CHECK_PX / 2, size: CHECK_PX, checked: item.task });
      else if (ordered) {
        const text = `${start + i}.`;
        const w = this.measure(text, body());
        r.pieces.push({ x: inner.x - 6 - w, y: base, text, font: body(), colour: ctx.colour, at: -1, src: item.src });
      } else {
        const kind = ctx.depth === 0 ? "disc" : ctx.depth === 1 ? "ring" : "square";
        r.decos.push({ kind, x: inner.x - 14, y: mid, r: 2.75, colour: ctx.colour });
      }
    });
  }

  private table(align: readonly Align[], head: readonly Run[][], rows: readonly Run[][][], ctx: Ctx, src: number): void {
    const n = head.length;
    if (!n) return;
    const bold: Font = { ...body(), weight: 600 };
    const all = [head, ...rows];
    // (each column as wide as its widest cell would be on one line - or, too wide all told, shared out, none narrower than its widest word)
    const natural = Array.from({ length: n }, (_, c) => Math.max(0, ...all.map((r, i) => widthOf(r[c] ?? [], i === 0 ? bold : body(), this.measure))) + 2 * CELL_X);
    const least = Array.from({ length: n }, (_, c) => Math.max(0, ...all.map((r, i) => widestWord(r[c] ?? [], i === 0 ? bold : body(), this.measure))) + 2 * CELL_X);
    const room = ctx.w - (n + 1);
    let widths = natural;
    if (natural.reduce((a, b) => a + b, 0) > room) {
      const spare = room - least.reduce((a, b) => a + b, 0);
      const want = natural.map((w, c) => w - least[c]);
      const total = want.reduce((a, b) => a + b, 0) || 1;
      widths = least.map((w, c) => w + Math.max(0, spare) * (want[c] / total));
    }
    const lefts: number[] = [];
    let x = ctx.x + 1;
    for (const w of widths) {
      lefts.push(x);
      x += w + 1;
    }
    const right = x;
    all.forEach((cells, i) => {
      const startY = this.rowsHeight();
      const was = this.rows.length;
      // (each cell laid as rows of its own, then made one row of them all, the tallest)
      const made: Row[][] = [];
      for (let c = 0; c < n; c++) {
        const before = this.rows.length;
        this.words(cells[c]?.length ? cells[c] : [{ text: "", style: {}, src }], i === 0 ? bold : body(), { ...ctx, colour: ctx.colour }, LINE, src, align[c], widths[c] - 2 * CELL_X, lefts[c] + CELL_X);
        if (c < n - 1) this.plain += "\t";
        made.push(this.rows.splice(before));
        this.setRowsHeight(startY);
      }
      this.rows.length = was;
      const tall = Math.max(...made.map((m) => m.reduce((a, r) => a + r.h, 0))) + 2 * CELL_Y;
      const row = this.row(tall, src);
      made.forEach((m) => {
        let y = CELL_Y;
        for (const r of m) {
          for (const p of r.pieces) row.pieces.push({ ...p, y: y + p.y });
          for (const d of r.decos) row.decos.push({ ...d, y: y + d.y });
          y += r.h;
        }
      });
      if (i > 0 && i % 2 === 0) row.decos.unshift({ kind: "fill", x: ctx.x, y: 0, w: right - ctx.x, h: tall, colour: COLOURS.ground });
      // (its lines: above it - and below the last - and between its cells)
      row.decos.push({ kind: "fill", x: ctx.x, y: 0, w: right - ctx.x, h: 1, colour: COLOURS.line });
      if (i === all.length - 1) row.decos.push({ kind: "fill", x: ctx.x, y: tall - 1, w: right - ctx.x, h: 1, colour: COLOURS.line });
      for (const l of [...lefts, right]) row.decos.push({ kind: "fill", x: l - 1, y: 0, w: 1, h: tall, colour: COLOURS.line });
      if (i < all.length - 1) this.plain += "\n";
    });
  }

  rowsHeight(): number {
    return this.y;
  }
  setRowsHeight(y: number): void {
    this.y = y;
  }

  pad(h: number, src: number): void {
    this.gap(h, src);
  }
}

/** Room above a block, after another. */
const above = (b: Block) => (b.kind === "heading" ? HEADING_ABOVE : b.kind === "rule" ? RULE_GAP : 0);

/** How wide runs would be on one line. */
function widthOf(runs: readonly Run[], base: Font, measure: Measure): number {
  return runs.reduce((w, r) => w + (r.text === "\n" ? 0 : measure(r.text, setting(r.style, base, COLOURS.ink).font)), 0);
}

/** How wide the widest word of runs is. */
function widestWord(runs: readonly Run[], base: Font, measure: Measure): number {
  let most = 0;
  for (const r of runs) {
    const f = setting(r.style, base, COLOURS.ink).font;
    for (const m of r.text.matchAll(SEGMENT)) most = Math.max(most, measure(m[0].trim(), f));
  }
  return most;
}

/**
 * A Markdown text's blocks laid out `width` CSS pixels wide, its words
 * measured by `measure`: rows from its top, the first `PAD_TOP` down, each
 * line's words `PAD_X` in from its edges; its code coloured as `codeColours`
 * says, where it knows the language.
 */
export function layOut(blocks: readonly Block[], width: number, measure: Measure, codeColours: CodeColours | null = null): Laid {
  const l = new Layout(measure, codeColours);
  l.pad(PAD_TOP, 0);
  l.blocks(blocks, { x: PAD_X, w: Math.max(40, width - 2 * PAD_X), colour: COLOURS.ink, depth: 0, tight: false });
  l.pad(PAD_FOOT, blocks[blocks.length - 1]?.src ?? 0);
  return { width, height: l.rowsHeight(), rows: l.rows, plain: l.plain, anchors: l.anchors };
}

/** The row at a height in a text laid out: the last, below them all; the first, above. */
export function rowAt(laid: Laid, y: number): number {
  let lo = 0;
  let hi = laid.rows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (laid.rows[mid].y <= y) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, lo);
}
