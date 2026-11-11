/**
 * A conversation's card as the page lays it out (docs/CONVERSATIONS.md, *The
 * Conversation object*; docs/WORKSPACE.md, *Drawn by WebGL*): what was said,
 * as blocks - a question in the person's tone, a reply's paragraphs, lists
 * and inline code, a tool call on one quiet line, the changes waiting to be
 * kept - laid in lines at the card's width by the page's own rules for
 * words (`wrapRuns`), their total height, and the part of them a scroll
 * offset shows. Pure: the drawing (`conversation/ConversationFrames`) places
 * what comes out; nothing here knows a camera or a pointer.
 *
 * Lengths are page pixels (pageGl/units) from the card's top left, y down;
 * only `cardRect` gives world units, y up, as the frame has them.
 */
import { COLORS } from "../../../theme/colors";
import { answerLine, callSaid, exchangeRows } from "../conversation/said";
import type { Said } from "../conversation/types";
import { baselineIn, textWidth, wrapRuns, type Run } from "./texts";
import { pagePx } from "./units";

/**
 * Its lengths, in page px: its width - 9 bonds of 48, a little over a third of a frame put down 24 bonds wide - and the room it keeps from
 * the frame's edge; its room inside; its reply words' size and line, and its quiet words'; the gap between blocks and after a list item; the
 * ground a question stands on, and the chips (Keep, Discard); the least the ask field at its foot takes (pageGl/field).
 */
export const CARD = {
  w: 432,
  pad: 12,
  side: 14,
  top: 12,
  bottom: 12,
  size: 13,
  line: 19,
  quietSize: 11,
  quietLine: 16,
  gap: 10,
  itemGap: 4,
  indent: 16,
  question: { share: 0.85, padX: 10, padY: 8, radius: 10 },
  chip: { h: 22, padX: 10, gap: 6, size: 11, radius: 11 },
  ask: 44,
  chipShadow: { blurPx: 2, offsetYPx: 1, alpha: 0.05 },
  radius: 12,
} as const;

/** What a card is made of: a run of words, as inline code (Plex Mono) or not. */
export type Span = { text: string; code?: true };

/**
 * One thing in the card, in order. `gap` is the room above it where it is not the block gap (a line of the same
 * paragraph follows its own line closely).
 */
export type CardBlock =
  | { kind: "question"; text: string }
  | { kind: "reply"; spans: Span[]; gap?: number }
  | { kind: "item"; marker: string; spans: Span[]; gap?: number }
  | { kind: "tool"; text: string; failed: boolean }
  | { kind: "note"; text: string }
  /** The changes waiting; `notes`, what is to be said of them in the attention colour - the steps they make run again, why Discard left them. */
  | { kind: "changes"; notes?: string[] };

/** What else the card says besides what was said: that the model is working, and that it changed the page, its changes waiting to be kept or discarded. */
export type CardState = { running?: boolean; changed?: boolean; notes?: string[] };

const BULLET = /^\s*(?:[-*•])\s+(.*)$/;
const NUMBERED = /^\s*(\d+[.)])\s+(.*)$/;

/** `text` as inline code and the words between it: a pair of backticks makes code of what is between them; one alone is a letter like any. */
export function spansOf(text: string): Span[] {
  const spans: Span[] = [];
  let at = 0;
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    if (m.index > at) spans.push({ text: text.slice(at, m.index) });
    spans.push({ text: m[1], code: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) spans.push({ text: text.slice(at) });
  return spans;
}

/**
 * A model's words as blocks: each line a line of its own (as the column shows them), a blank line the gap between paragraphs, a line that
 * starts "- ", "* " or "1. " a list item (its marker kept as written, "-" and "*" a bullet), and a line between two lines of three
 * backticks in code, as it was written. Nothing else is read as a mark.
 */
export function replyBlocks(text: string): CardBlock[] {
  const blocks: CardBlock[] = [];
  let paragraph = false;
  let fenced = false;
  let before: CardBlock["kind"] | null = null;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      before = null;
      paragraph = false;
      continue;
    }
    if (!fenced && !line.trim()) {
      paragraph = false;
      before = null;
      continue;
    }
    if (fenced) {
      blocks.push({ kind: "reply", spans: [{ text: line, code: true }], ...(before === "reply" ? { gap: 0 } : {}) });
      before = "reply";
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      blocks.push({ kind: "item", marker: bullet ? "•" : numbered![1], spans: spansOf(bullet ? bullet[1] : numbered![2]), ...(before === "item" ? { gap: CARD.itemGap } : {}) });
      before = "item";
      paragraph = true;
      continue;
    }
    blocks.push({ kind: "reply", spans: spansOf(line.trim()), ...(paragraph && before === "reply" ? { gap: 0 } : {}) });
    before = "reply";
    paragraph = true;
  }
  return blocks;
}

/**
 * What was said as blocks, in turn (`exchangeRows`): the person's words a question, the model's its paragraphs and lists, each of its
 * calls one line - what it did, and what came of it, in a line - Meno's own word a quiet line; then that it is working, and the
 * changes waiting, with what is said of them - last, where the person looks for them.
 */
export function cardBlocks(said: readonly Said[], state: CardState = {}): CardBlock[] {
  const blocks: CardBlock[] = [];
  for (const r of exchangeRows(said)) {
    if (r.kind === "call") {
      blocks.push({ kind: "tool", text: r.answer ? `${callSaid(r.call)} · ${answerLine(r.answer)}` : callSaid(r.call), failed: !!r.answer && !r.answer.ok });
      continue;
    }
    const s = r.said;
    if (s.by === "person") blocks.push({ kind: "question", text: s.text });
    else if (s.by === "model") blocks.push(...replyBlocks(s.text));
    else if (s.by === "meno") blocks.push({ kind: "note", text: s.text });
  }
  if (state.running) blocks.push({ kind: "note", text: "Talking…" });
  if (state.changed) blocks.push({ kind: "changes", ...(state.notes?.length ? { notes: state.notes } : {}) });
  return blocks;
}

/** One line of words, laid: its runs, where its box begins and how wide the runs are, its top and baseline from the top of the card's history, and its size. */
export type CardLine = { runs: Run[]; x: number; y: number; baseline: number; width: number; size: number; block: number };

/** A box laid behind words - a question's ground - its top left, size and corner. */
export type CardBox = { x: number; y: number; w: number; h: number; radius: number; fill: string; block: number };

/** A chip control: `key` is what it does, `text` what it says. */
export type CardChip = { key: "keep" | "discard"; text: string; x: number; y: number; w: number; h: number; radius: number; block: number };

/** What the blocks come to, laid: its lines, boxes and chips, and the height of it all - its room above and below included. */
export type CardLayout = { lines: CardLine[]; boxes: CardBox[]; chips: CardChip[]; height: number };

const TEXT_TONE = { reply: COLORS.ink, tool: COLORS.quiet, failed: COLORS.attention } as const;

/** Spans as runs of one colour, code in Plex Mono. */
const runsOf = (spans: readonly Span[], color: string): Run[] => spans.map((s) => ({ text: s.text, color, ...(s.code ? { mono: true as const } : {}) }));

/** The changes bar's words, and its chips: Keep, then Discard. */
export const CHANGED_SAID = "It changed the page, as one undo step.";
export const CHIPS = [
  { key: "keep", text: "Keep" },
  { key: "discard", text: "Discard" },
] as const;

/**
 * `blocks` laid in a card `widthPx` wide: each block in its room, one under the other, their gap between them (`CARD.gap`, or
 * the block's own), the card's own room above the first and below the last. A question stands against the right, in a ground as wide as
 * its widest line needs, at most `CARD.question.share` of the width inside; a list item hangs its words under its first line's, after its
 * marker.
 */
export function cardLayout(blocks: readonly CardBlock[], widthPx: number = CARD.w): CardLayout {
  const lines: CardLine[] = [];
  const boxes: CardBox[] = [];
  const chips: CardChip[] = [];
  const inner = Math.max(widthPx - 2 * CARD.side, 0);
  let y = CARD.top;
  blocks.forEach((b, block) => {
    y += block === 0 ? 0 : "gap" in b && b.gap != null ? b.gap : CARD.gap;
    // (a line of words of this size, at this x, in a line this high)
    const put = (runs: Run[], x: number, top: number, size: number, line: number, width: number) =>
      lines.push({ runs, x, y: top, baseline: top + baselineIn(line, size), width, size, block });
    if (b.kind === "question") {
      const q = CARD.question;
      const wrapped = wrapRuns([{ text: b.text, color: COLORS.ink }], CARD.size, Math.max(inner * q.share - 2 * q.padX, 1));
      const text = wrapped.length ? wrapped : [{ runs: [] as Run[], width: 0 }];
      const w = Math.max(...text.map((l) => l.width)) + 2 * q.padX;
      const h = text.length * CARD.line + 2 * q.padY;
      const x = widthPx - CARD.side - w;
      boxes.push({ x, y, w, h, radius: q.radius, fill: COLORS.ground, block });
      text.forEach((l, k) => put(l.runs, x + q.padX, y + q.padY + k * CARD.line, CARD.size, CARD.line, l.width));
      y += h;
    } else if (b.kind === "reply" || b.kind === "item") {
      const hang = b.kind === "item" ? CARD.indent : 0;
      const wrapped = wrapRuns(runsOf(b.spans, TEXT_TONE.reply), CARD.size, Math.max(inner - hang, 1));
      const text = wrapped.length ? wrapped : [{ runs: [] as Run[], width: 0 }];
      if (b.kind === "item") put([{ text: b.marker, color: COLORS.quiet }], CARD.side, y, CARD.size, CARD.line, textWidth(b.marker, CARD.size));
      text.forEach((l, k) => put(l.runs, CARD.side + hang, y + k * CARD.line, CARD.size, CARD.line, l.width));
      y += text.length * CARD.line;
    } else if (b.kind === "tool" || b.kind === "note") {
      const color = b.kind === "tool" && b.failed ? TEXT_TONE.failed : TEXT_TONE.tool;
      const wrapped = wrapRuns([{ text: b.text, color }], CARD.quietSize, inner);
      wrapped.forEach((l, k) => put(l.runs, CARD.side, y + k * CARD.quietLine, CARD.quietSize, CARD.quietLine, l.width));
      y += wrapped.length * CARD.quietLine;
    } else {
      const wrapped = wrapRuns([{ text: CHANGED_SAID, color: COLORS.ink }], CARD.quietSize, inner);
      wrapped.forEach((l, k) => put(l.runs, CARD.side, y + k * CARD.quietLine, CARD.quietSize, CARD.quietLine, l.width));
      y += wrapped.length * CARD.quietLine + CARD.chip.gap;
      let x = CARD.side;
      for (const c of CHIPS) {
        const w = textWidth(c.text, CARD.chip.size) + 2 * CARD.chip.padX;
        chips.push({ key: c.key, text: c.text, x, y, w, h: CARD.chip.h, radius: CARD.chip.radius, block });
        x += w + CARD.chip.gap;
      }
      y += CARD.chip.h;
      for (const note of b.notes ?? []) {
        y += CARD.chip.gap;
        const said = wrapRuns([{ text: note, color: TEXT_TONE.failed }], CARD.quietSize, inner);
        said.forEach((l, k) => put(l.runs, CARD.side, y + k * CARD.quietLine, CARD.quietSize, CARD.quietLine, l.width));
        y += said.length * CARD.quietLine;
      }
    }
  });
  return { lines, boxes, chips, height: y + CARD.bottom };
}

/** The room of its history: the card's height less the ask field's at its foot, never under none. */
export const historyHeight = (cardHeightPx: number, askPx: number = CARD.ask): number => Math.max(cardHeightPx - askPx, 0);

/** The most a history `height` tall is scrolled, in a view `view` tall: none where it fits. */
export const scrollMax = (height: number, view: number): number => Math.max(height - view, 0);

/** `offset` kept in 0 to `scrollMax` - a number past the end (`Infinity`) is the end; one that is no number, the start. */
export function clampScroll(offset: number, height: number, view: number): number {
  if (Number.isNaN(offset)) return 0;
  return Math.min(Math.max(offset, 0), scrollMax(height, view));
}

/** The part of a laid card that a view `view` tall shows scrolled `offset` down: each line, box and chip that is in it - wholly or in part - from the view's top. */
export type CardWindow = {
  offset: number;
  max: number;
  /** There is more above, or more below: what the Earlier and Latest chips (and a track's thumb) say. */
  earlier: boolean;
  later: boolean;
  lines: CardLine[];
  boxes: CardBox[];
  chips: CardChip[];
};

/** `layout` as seen through a view `view` tall at `offset` (clamped): what lies in it, its y taken from the view's top. */
export function cardWindow(layout: CardLayout, offset: number, view: number): CardWindow {
  const at = clampScroll(offset, layout.height, view);
  const max = scrollMax(layout.height, view);
  const seen = (y: number, h: number) => y + h > at && y < at + view;
  const lineHigh = (l: CardLine) => (l.size === CARD.size ? CARD.line : CARD.quietLine);
  return {
    offset: at,
    max,
    earlier: at > 0,
    later: at < max,
    lines: layout.lines.filter((l) => seen(l.y, lineHigh(l))).map((l) => ({ ...l, y: l.y - at, baseline: l.baseline - at })),
    boxes: layout.boxes.filter((b) => seen(b.y, b.h)).map((b) => ({ ...b, y: b.y - at })),
    chips: layout.chips.filter((c) => seen(c.y, c.h)).map((c) => ({ ...c, y: c.y - at })),
  };
}

/**
 * Where its card lies in a frame (world units, y up, as a frame has them): against its right edge, `CARD.pad` in from it, from the top
 * padding to the bottom - the frame's height less its padding - `CARD.w` wide, or the frame's width less its padding where that is less.
 * None where no room is left.
 */
export function cardRect(frame: { x0: number; y0: number; x1: number; y1: number }): { x0: number; y0: number; x1: number; y1: number } | null {
  const pad = pagePx(CARD.pad);
  const w = Math.min(pagePx(CARD.w), frame.x1 - frame.x0 - 2 * pad);
  const h = frame.y1 - frame.y0 - 2 * pad;
  if (!(w > 0) || !(h > 0)) return null;
  return { x0: frame.x1 - pad - w, y0: frame.y0 + pad, x1: frame.x1 - pad, y1: frame.y1 - pad };
}

/** The least a frame is, in page px, to hold its card at its full width, its history a line high, and its ask field. */
export const FRAME_LEAST = { w: CARD.w + 2 * CARD.pad, h: CARD.ask + CARD.line + CARD.top + CARD.bottom + 2 * CARD.pad } as const;
