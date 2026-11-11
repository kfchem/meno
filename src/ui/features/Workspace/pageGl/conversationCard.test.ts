import { describe, expect, it } from "vitest";
import { COLORS } from "../../../theme/colors";
import type { Said } from "../conversation/types";
import { CARD, cardBlocks, cardLayout, cardRect, cardWindow, clampScroll, FRAME_LEAST, historyHeight, replyBlocks, scrollMax, spansOf, type CardBlock } from "./conversationCard";
import { textWidth } from "./texts";

const text = (l: { runs: { text: string }[] }) => l.runs.map((r) => r.text).join("");

describe("a conversation's words as the card's blocks", () => {
  it("reads a pair of backticks as inline code, and one alone as a letter", () => {
    expect(spansOf("Use `xtb --opt` now")).toEqual([{ text: "Use " }, { text: "xtb --opt", code: true }, { text: " now" }]);
    expect(spansOf("`a` and `b`")).toEqual([{ text: "a", code: true }, { text: " and " }, { text: "b", code: true }]);
    expect(spansOf("it's a ` alone")).toEqual([{ text: "it's a ` alone" }]);
    expect(spansOf("")).toEqual([]);
  });

  it("reads lines as paragraphs, lists and code: a blank line the gap, a line after a line close under it, a marker as written", () => {
    const b = replyBlocks("First line\nsecond line\n\nNext:\n- one\n* two with `code`\n3. three\n```\n  x = 1\n```\nlast");
    expect(b).toEqual<CardBlock[]>([
      { kind: "reply", spans: [{ text: "First line" }] },
      { kind: "reply", spans: [{ text: "second line" }], gap: 0 },
      { kind: "reply", spans: [{ text: "Next:" }] },
      { kind: "item", marker: "•", spans: [{ text: "one" }] },
      { kind: "item", marker: "•", spans: [{ text: "two with " }, { text: "code", code: true }], gap: CARD.itemGap },
      { kind: "item", marker: "3.", spans: [{ text: "three" }], gap: CARD.itemGap },
      // (a line between fences: code, as written, the spaces too)
      { kind: "reply", spans: [{ text: "  x = 1", code: true }] },
      { kind: "reply", spans: [{ text: "last" }] },
    ]);
  });

  it("is the exchange as blocks - question, reply, a call with what came of it, Meno's word - then that it works, then the changes waiting", () => {
    const said: Said[] = [
      { by: "person", text: "Optimise these", at: 1 },
      { by: "model", text: "Done.\n- A", calls: [{ tool: "list" }, { tool: "put_plus" }], at: 2 },
      { by: "tool", tool: "list", answer: { things: [{ id: "structure:1" }, { id: "structure:2" }] }, ok: true, at: 3 },
      { by: "tool", tool: "put_plus", answer: "No room", ok: false, at: 4 },
      { by: "meno", text: "Stopped at its limit", at: 5 },
    ];
    expect(cardBlocks(said)).toEqual<CardBlock[]>([
      { kind: "question", text: "Optimise these" },
      { kind: "reply", spans: [{ text: "Done." }] },
      { kind: "item", marker: "•", spans: [{ text: "A" }] },
      { kind: "tool", text: "Listed what lies in the frame · 2 things in the frame", failed: false },
      { kind: "tool", text: 'Put down a "+" · No room', failed: true },
      { kind: "note", text: "Stopped at its limit" },
    ]);
    expect(cardBlocks(said, { running: true, changed: true }).slice(-2)).toEqual<CardBlock[]>([{ kind: "note", text: "Talking…" }, { kind: "changes" }]);
    expect(cardBlocks([])).toEqual([]);
  });
});

describe("a card's blocks laid in lines", () => {
  const wide = 2 * CARD.side + 1000;

  it("is the room above and below alone where nothing was said", () => {
    expect(cardLayout([])).toEqual({ lines: [], boxes: [], chips: [], height: CARD.top + CARD.bottom });
    expect(CARD.top + CARD.bottom).toBe(24);
  });

  it("breaks a word wider than a line where it runs out - 70 letters of code, 7.8 px each at 13 px, 404 px inside: 51, then 19", () => {
    const l = cardLayout([{ kind: "reply", spans: [{ text: "x".repeat(70), code: true }] }]);
    expect(l.lines.map((x) => [text(x), x.x, x.y])).toEqual([["x".repeat(51), 14, 12], ["x".repeat(19), 14, 31]]);
    expect(l.lines.every((x) => x.runs.every((r) => r.mono))).toBe(true);
    expect(l.lines[0].width).toBeCloseTo(51 * 7.8, 6);
    // (12 above, two lines of 19, 12 below)
    expect(l.height).toBe(12 + 38 + 12);
  });

  it("breaks at the space the words run out at, as the page's other words do", () => {
    const room = textWidth("alpha beta", CARD.size) + 1;
    const l = cardLayout([{ kind: "reply", spans: [{ text: "alpha beta gamma" }] }], 2 * CARD.side + room);
    expect(l.lines.map(text)).toEqual(["alpha beta", "gamma"]);
  });

  it("keeps a code run's face across a break and in the line it sits in: words, then code, words", () => {
    const l = cardLayout([{ kind: "reply", spans: [{ text: "run " }, { text: "xtb", code: true }, { text: " now" }] }], wide);
    expect(l.lines).toHaveLength(1);
    expect(l.lines[0].runs.map((r) => [r.text, !!r.mono])).toEqual([["run ", false], ["xtb", true], [" now", false]]);
  });

  it("puts a gap of 10 between blocks, none after a line of its own paragraph, 4 between list items; the first block at 12", () => {
    const l = cardLayout(
      [
        { kind: "reply", spans: [{ text: "a" }] },
        { kind: "reply", spans: [{ text: "b" }], gap: 0 },
        { kind: "reply", spans: [{ text: "c" }] },
        { kind: "item", marker: "1.", spans: [{ text: "d" }] },
        { kind: "item", marker: "2.", spans: [{ text: "e" }], gap: CARD.itemGap },
      ],
      wide,
    );
    // (a at 12, b under it at 31, c 10 below b's end at 60, d at 89, e 4 below d's end at 112; each marker on its item's first line, its words 16 in)
    expect(l.lines.map((x) => [text(x), x.x, x.y])).toEqual([["a", 14, 12], ["b", 14, 31], ["c", 14, 60], ["1.", 14, 89], ["d", 30, 89], ["2.", 14, 112], ["e", 30, 112]]);
    expect(l.height).toBe(112 + 19 + 12);
    // (the baseline of 13 px Plex in a line 19 high: 3.075 + 13.325 = 16.4 below its top)
    expect(l.lines[0].baseline).toBeCloseTo(12 + (19 - 1.3 * 13) / 2 + 1.025 * 13, 6);
  });

  it("hangs a list item's second line under its first line's words, not under its marker", () => {
    const room = textWidth("alpha beta", CARD.size) + 1;
    const l = cardLayout([{ kind: "item", marker: "1.", spans: [{ text: "alpha beta gamma" }] }], 2 * CARD.side + CARD.indent + room);
    expect(l.lines.map((x) => [text(x), x.x, x.y])).toEqual([["1.", 14, 12], ["alpha beta", 30, 12], ["gamma", 30, 31]]);
  });

  it("stands a question against the right in a ground as wide as its words, 10 in either side, and no wider than 85% of the width inside", () => {
    const short = cardLayout([{ kind: "question", text: "Hi" }]);
    const w = textWidth("Hi", CARD.size);
    expect(short.boxes).toEqual([{ x: CARD.w - 14 - (w + 20), y: 12, w: w + 20, h: 19 + 16, radius: 10, fill: COLORS.ground, block: 0 }]);
    expect(short.lines.map((x) => [text(x), x.x, x.y])).toEqual([["Hi", CARD.w - 14 - (w + 20) + 10, 12 + 8]]);
    expect(short.height).toBe(12 + 35 + 12);
    // (404 inside: 85% is 343.4; less its 20 of room, 323.4 for words)
    const long = cardLayout([{ kind: "question", text: "word ".repeat(80) }]);
    const box = long.boxes[0];
    expect(long.lines.length).toBeGreaterThan(3);
    expect(box.w).toBeLessThanOrEqual(404 * 0.85 + 1e-9);
    expect(box.x + box.w).toBeCloseTo(CARD.w - 14, 9);
    expect(Math.max(...long.lines.map((x) => x.width))).toBeLessThanOrEqual(404 * 0.85 - 20 + 1e-6);
    expect(box.h).toBe(long.lines.length * 19 + 16);
    // (the words' room is 85% of the inside less the ground's 20: one 5 px short of "alpha beta" breaks it, one 1 px over keeps it)
    const room = textWidth("alpha beta", CARD.size);
    const at = (words: number) => cardLayout([{ kind: "question", text: "alpha beta" }], 2 * CARD.side + (words + 20) / 0.85);
    expect(at(room - 5).lines.map(text)).toEqual(["alpha", "beta"]);
    expect(at(room + 1).lines.map(text)).toEqual(["alpha beta"]);
  });

  it("sets a call's line and Meno's word small and quiet - a failed call in the attention colour - in lines of 16", () => {
    const l = cardLayout([
      { kind: "tool", text: "Listed what lies in the frame \u00b7 2 things in the frame", failed: false },
      { kind: "tool", text: "Put down a \"+\" \u00b7 No room", failed: true },
      { kind: "note", text: "Talking\u2026" },
    ], wide);
    expect(l.lines.map((x) => [x.size, x.y, x.runs[0].color])).toEqual([[11, 12, COLORS.quiet], [11, 38, COLORS.attention], [11, 64, COLORS.quiet]]);
    expect(l.height).toBe(64 + 16 + 12);
  });

  it("puts what changed, then Keep and Discard in a row under it - chips 22 high, 10 in, 6 apart, from the left inside", () => {
    const l = cardLayout([{ kind: "reply", spans: [{ text: "ok" }] }, { kind: "changes" }], wide);
    // (ok 12 to 31; the changes 10 below at 41, one line of 16 to 57, 6 gap, the chips at 63 to 85)
    expect(l.lines.map((x) => [text(x), x.size, x.y])).toEqual([["ok", 13, 12], ["It changed the page, as one undo step.", 11, 41]]);
    const keep = textWidth("Keep", 11) + 20;
    expect(l.chips).toEqual([
      { key: "keep", text: "Keep", x: 14, y: 63, w: keep, h: 22, radius: 11, block: 1 },
      { key: "discard", text: "Discard", x: 14 + keep + 6, y: 63, w: textWidth("Discard", 11) + 20, h: 22, radius: 11, block: 1 },
    ]);
    expect(l.height).toBe(85 + 12);
  });
});

describe("what a scroll offset shows of a laid card", () => {
  /** Thirty one-line replies a, b, ...: lines 19 high, 10 apart - the first at 12, the last at 12 + 29 x 29 = 853, the end at 872 + 12. */
  const many = cardLayout(Array.from({ length: 30 }, (_, k) => ({ kind: "reply", spans: [{ text: `line ${k}` }] }) as CardBlock), 2 * CARD.side + 1000);
  const view = 200;

  it("is 884 high, and is scrolled at most 684", () => {
    expect(many.height).toBe(884);
    expect(scrollMax(many.height, view)).toBe(684);
    expect(scrollMax(100, view)).toBe(0);
  });

  it("keeps an offset between 0 and the end: before the start 0, past the end the end, the end itself for Infinity, none for no number", () => {
    expect([-5, 0, 100, 684, 685, 1e9, Infinity, NaN].map((o) => clampScroll(o, many.height, view))).toEqual([0, 0, 100, 684, 684, 684, 684, 0]);
    expect(clampScroll(50, 100, view)).toBe(0);
  });

  it("shows, from the top, the lines that lie in the view - one cut by its foot too - and says there is more below, none above", () => {
    const w = cardWindow(many, 0, view);
    // (lines at 12, 41, ..., the 7th at 186, the 8th at 215 past the view's 200)
    expect(w.lines.map(text)).toEqual(Array.from({ length: 7 }, (_, k) => `line ${k}`));
    expect([w.offset, w.max, w.earlier, w.later]).toEqual([0, 684, false, true]);
    expect(w.lines[6].y).toBe(186);
  });

  it("holds the last line at the bottom - its foot at the view's, 12 above it - and says there is more above, none below", () => {
    const w = cardWindow(many, Infinity, view);
    expect([w.offset, w.earlier, w.later]).toEqual([684, true, false]);
    const last = w.lines[w.lines.length - 1];
    expect([text(last), last.y, last.y + 19 + CARD.bottom]).toEqual(["line 29", 853 - 684, view]);
    expect(last.baseline - last.y).toBeCloseTo(many.lines[29].baseline - many.lines[29].y, 9);
  });

  it("shows a line cut by the view's top, its y above the top - and none wholly above it", () => {
    // (line 3 at 99 to 118: an offset of 110 cuts it; line 2 at 70 to 89 is wholly above)
    const w = cardWindow(many, 110, view);
    expect(w.lines[0]).toMatchObject({ y: 99 - 110 });
    expect(text(w.lines[0])).toBe("line 3");
    expect(w.lines.some((l) => text(l) === "line 2")).toBe(false);
    // (a line that only touches the top: its foot at the offset exactly - not in)
    expect(cardWindow(many, 118, view).lines.some((l) => text(l) === "line 3")).toBe(false);
    expect(cardWindow(many, 117, view).lines.some((l) => text(l) === "line 3")).toBe(true);
    // (and one that only touches the foot: line 7 at 215, the foot at 215 with an offset of 15 - not in; at 16, in)
    expect(cardWindow(many, 15, view).lines.some((l) => text(l) === "line 7")).toBe(false);
    expect(cardWindow(many, 16, view).lines.some((l) => text(l) === "line 7")).toBe(true);
  });

  it("shows all of what fits, no more above or below - and boxes and chips as they come in the view", () => {
    const small = cardLayout([{ kind: "question", text: "Hi" }, { kind: "changes" }]);
    const w = cardWindow(small, 40, 1000);
    expect([w.offset, w.max, w.earlier, w.later, w.lines.length, w.boxes.length, w.chips.length]).toEqual([0, 0, false, false, 2, 1, 2]);
    // (scrolled past the question's box - 12 to 47 - it is out; the chips stay)
    const tall = cardLayout([{ kind: "question", text: "Hi" }, ...Array.from({ length: 30 }, () => ({ kind: "reply", spans: [{ text: "x" }] }) as CardBlock), { kind: "changes" }]);
    const at = cardWindow(tall, Infinity, 100);
    expect([at.boxes.length, at.chips.length, at.chips[0].y + at.chips[0].h + CARD.bottom]).toEqual([0, 2, 100]);
    expect(cardWindow(tall, 0, 100).chips).toEqual([]);
  });
});

describe("where a card lies in its frame", () => {
  it("lies against the frame's right edge, 12 page px in from it and from the top and foot, 432 wide", () => {
    // (a frame put down: 24 by 14 bonds of 1.8 world units; a page px is 1.8 / 48 of one)
    const r = cardRect({ x0: 0, y0: 0, x1: 43.2, y1: 25.2 })!;
    expect([r.x0, r.y0, r.x1, r.y1].map((v) => Number(v.toFixed(6)))).toEqual([26.55, 0.45, 42.75, 24.75]);
    // (moved with its frame)
    const m = cardRect({ x0: 10, y0: -5, x1: 53.2, y1: 20.2 })!;
    expect([m.x0, m.y0, m.x1, m.y1].map((v) => Number(v.toFixed(6)))).toEqual([36.55, -4.55, 52.75, 19.75]);
  });

  it("is as wide as the frame leaves it where that is less than 432, and none where no room is left", () => {
    const narrow = cardRect({ x0: 0, y0: 0, x1: 10, y1: 25.2 })!;
    expect([narrow.x0, narrow.x1].map((v) => Number(v.toFixed(6)))).toEqual([0.45, 9.55]);
    expect(cardRect({ x0: 0, y0: 0, x1: 0.8, y1: 25.2 })).toBeNull();
    expect(cardRect({ x0: 0, y0: 0, x1: 43.2, y1: 0.8 })).toBeNull();
    expect(cardRect({ x0: 0, y0: 0, x1: Number.NaN, y1: 25.2 })).toBeNull();
  });

  it("gives its history the card's height less its ask field's, never under none; and a frame is least 456 by 130 to hold it", () => {
    expect([historyHeight(600), historyHeight(600, 80), historyHeight(30)]).toEqual([556, 520, 0]);
    expect(FRAME_LEAST).toEqual({ w: 456, h: 44 + 19 + 12 + 12 + 24 });
  });
});

describe("what is said of the changes waiting", () => {
  it("is each note a quiet line in the attention colour under the chips, 6 below them or the note before", () => {
    const state = { changed: true, notes: ["This makes Filter run again, when you next run it.", "The page has changed since: undo is yours, step by step."] };
    const blocks = cardBlocks([], state);
    expect(blocks).toEqual<CardBlock[]>([{ kind: "changes", notes: state.notes }]);
    const l = cardLayout(blocks, 2 * CARD.side + 1000);
    // (the changes line at 12 to 28, 6, the chips at 34 to 56, then each note: 6 below, 16 high - 62, 84)
    expect(l.chips.map((c) => c.y)).toEqual([34, 34]);
    expect(l.lines.map((x) => [text(x), x.y, x.runs[0].color])).toEqual([
      ["It changed the page, as one undo step.", 12, COLORS.ink],
      [state.notes[0], 62, COLORS.attention],
      [state.notes[1], 84, COLORS.attention],
    ]);
    expect(l.height).toBe(84 + 16 + 12);
    expect(cardBlocks([], { changed: true })).toEqual<CardBlock[]>([{ kind: "changes" }]);
    expect(cardBlocks([], { notes: ["x"] })).toEqual([]);
  });
});
