import { describe, expect, it } from "vitest";
import { COLORS } from "../../../theme/colors";
import { CARD, cardLayout, type CardBlock } from "./conversationCard";
import { cardParts, cardView, CODE, edgeFade, EDGE_FADE, SCROLL_ICONS, turnsSaid, type CardOf } from "./conversationCardParts";
import { SCROLL_CHIP, TRACK } from "./conversationScroll";

/** A frame put down: 24 by 14 bonds of 1.8 world units; its card 432 by 648 page px, its history 604 (the ask field's 44 less). */
const FRAME = { x0: 0, y0: 0, x1: 43.2, y1: 25.2 };
const near = (v: number) => Number(v.toFixed(6));
const reply = (text: string): CardBlock => ({ kind: "reply", spans: [{ text }] });
const card = (blocks: CardBlock[], over: Partial<CardOf> = {}): CardOf => ({ key: "conversation:1", frame: FRAME, layout: cardLayout(blocks), offset: 0, words: 1, turns: 1, running: false, changed: false, ...over });

describe("how present what is scrolled to a card's edge is", () => {
  it("is none touching an edge there is more beyond, all one line (19 px) in from it, between them as far in as it is", () => {
    expect(EDGE_FADE).toBe(19);
    // (the foot: the view 600 tall, more below)
    expect([600 - 19, 600 - 19 - 9.5, 600 - 19 - 19, 600 - 19 - 40].map((y) => edgeFade(y, 19, 600, false, true))).toEqual([0, 0.5, 1, 1]);
    // (the top: more above)
    expect([0, 9.5, 19, 80].map((y) => edgeFade(y, 19, 600, true, false))).toEqual([0, 0.5, 1, 1]);
    // (no more beyond it: a line against the foot - all of it, there being nothing further; one past an edge with more beyond it, none)
    expect([edgeFade(581, 19, 600, false, false), edgeFade(0, 19, 600, false, true), edgeFade(-5, 19, 600, true, false), edgeFade(590, 19, 600, false, true)]).toEqual([1, 1, 0, 0]);
  });
});

describe("a conversation's card as drawn", () => {
  it("lies against its frame's right edge: its box 432 by 648 page px, solid hairline, in the frame's 12 px, and a hairline over its ask field's 44", () => {
    const d = cardParts(card([reply("hello")]));
    expect(d.rect && [d.rect.x0, d.rect.y0, d.rect.x1, d.rect.y1].map(near)).toEqual([26.55, 0.45, 42.75, 24.75]);
    expect(d.shapes[0]).toMatchObject({ kind: "box", key: "conversation:1:card", radiusPx: 12, fill: COLORS.background, line: { widthPx: 1, color: COLORS.hairline }, opacity: 1 });
    const ask = d.shapes.find((s) => s.key === "conversation:1:ask")!;
    // (44 page px above the card's foot: 44 x 0.0375 = 1.65 above 0.45)
    expect([(ask as { y0: number }).y0, (ask as { y1: number }).y1].map(near)).toEqual([2.1, 2.1375]);
    expect(d.regions).toEqual([{ key: "conversation:1", part: "card", rect: d.rect, z: 0, cursor: "default" }]);
  });

  it("gives its history the room its ask area leaves: 44 by default, the hairline over the area, and the view that much shorter as it grows", () => {
    const d = cardParts(card([reply("hello")], { ask: 81 }));
    const hair = d.shapes.find((s) => s.key === "conversation:1:ask") as { y0: number; y1: number };
    // (81 page px above the card's foot: 81 x 0.0375 = 3.0375 above 0.45)
    expect([hair.y0, hair.y1].map(near)).toEqual([3.4875, 3.525]);
    expect([d.view, cardParts(card([reply("hello")])).view]).toEqual([567, 604]);
    expect([cardView(FRAME, 81), cardView(FRAME)]).toEqual([567, 604]);
  });

  it("puts a line's words on its baseline, 14 px in: 12 + 1.05 + 13.325 = 26.375 below the card's top", () => {
    const d = cardParts(card([reply("hello")]));
    const t = d.texts.find((x) => x.text === "hello")!;
    expect([near(t.x), near(t.y), t.sizePx, t.color, t.opacity, t.anchor]).toEqual([27.075, near(24.75 - 26.375 * 0.0375), 13, COLORS.ink, 1, "start"]);
    expect(d.texts.some((x) => x.text.includes("turn"))).toBe(false);
  });

  it("stands a question's ground and a code run's face in place: the box from its top left, the run in Mono", () => {
    const d = cardParts(card([{ kind: "question", text: "Hi" }, { kind: "reply", spans: [{ text: "run " }, { text: "xtb", code: true }] }]));
    const ground = d.shapes.find((s) => s.key === "conversation:1:ground:0") as { x0: number; y1: number; fill: string; y0: number } | undefined;
    expect(ground && [near(ground.y1), near(ground.y1 - ground.y0), ground.fill]).toEqual([near(24.75 - 12 * 0.0375), near(35 * 0.0375), COLORS.ground]);
    expect(d.texts.filter((x) => x.mono).map((x) => x.text)).toEqual(["xtb"]);
  });

  it("lays a ground under each run of inline code, a hair wider than its letters, as present as its line, and none under the words around it", () => {
    const d = cardParts(card([{ kind: "reply", spans: [{ text: "run " }, { text: "C6H14O", code: true }, { text: " now" }] }]));
    const grounds = d.shapes.filter((s) => s.key.startsWith("conversation:1:code:")) as { x0: number; x1: number; y0: number; y1: number; fill: string; opacity: number; radiusPx: number }[];
    expect(grounds).toHaveLength(1);
    // ("run " 4 letters of Plex Sans, then six letters at the mono advance, 13 px: its box begins at the words' x less the pad, as wide as they come to and the pad twice)
    const code = d.texts.find((x) => x.mono)!;
    expect(grounds[0].fill).toBe(COLORS.ground);
    expect(grounds[0].radiusPx).toBe(CODE.radius);
    expect(grounds[0].x0).toBeCloseTo(code.x - CODE.pad * 0.0375, 5);
    expect(grounds[0].x1 - grounds[0].x0).toBeCloseTo((6 * 7.8 + 2 * CODE.pad) * 0.0375, 5);
    // (from 2 px in from its line's top, to 2 in from its foot: 19 - 4 = 15 tall)
    expect(near(grounds[0].y1 - grounds[0].y0)).toBe(near(15 * 0.0375));
    expect(grounds[0].opacity).toBe(1);
    expect(d.shapes.some((s) => s.key.includes(":code:") && s.key.endsWith(":0:0"))).toBe(false);
  });

  it("fades a list item's marker with its words, as one row: a chip over the words takes the marker too, where it does not reach the marker itself", () => {
    const long = "second point that runs well on past the middle of the card where the chip lies";
    const filler = (n: number) => Array.from({ length: n }, (_, i) => reply(`line ${i}`));
    // (long enough to be scrolled: the item well down it)
    const blocks: CardBlock[] = [...filler(20), { kind: "item", marker: "•", spans: [{ text: long }] }, ...filler(30)];
    const layout = cardLayout(blocks);
    const row = layout.lines.find((l) => l.runs.some((r) => r.text.startsWith("second")))!;
    // (scrolled so that the item's row lies where the Earlier chip does)
    const offset = row.y - SCROLL_CHIP.from - 1;
    const shown = (earlier: number) => {
      const d = cardParts(card(blocks, { offset, scroll: { track: 0, earlier, latest: 0 } }));
      return [d.texts.some((x) => x.text === "•"), d.texts.some((x) => x.text.startsWith("second"))];
    };
    // (no chip: both there; the chip over the words: the words go and the marker with them)
    expect(shown(0)).toEqual([true, true]);
    expect(shown(1)).toEqual([false, false]);
  });

  it("draws the changes' chips under their line, Keep in Meno's colour and Discard quiet, each taking the pointer over its box as a pointer", () => {
    const d = cardParts(card([reply("hello"), { kind: "changes" }]));
    // (the chips at 63 to 85 below the card's top, 14 in)
    const keep = d.regions.find((r) => r.part === "keep") as { rect: { x0: number; y0: number; x1: number; y1: number }; cursor: string };
    expect([near(keep.rect.x0), near(keep.rect.y1), near(keep.rect.y1 - keep.rect.y0), keep.cursor]).toEqual([27.075, near(24.75 - 63 * 0.0375), near(22 * 0.0375), "pointer"]);
    expect(d.regions.map((r) => r.part)).toEqual(["card", "keep", "discard"]);
    expect(d.shapes.find((s) => s.key === "conversation:1:chip:keep")).toMatchObject({ line: { color: COLORS.base } });
    expect(d.shapes.find((s) => s.key === "conversation:1:chip:discard")).toMatchObject({ line: { color: COLORS.hairline } });
    expect(d.texts.filter((x) => ["Keep", "Discard"].includes(x.text)).map((x) => [x.text, x.color, x.baseline])).toEqual([["Keep", COLORS.base, "middle"], ["Discard", COLORS.quiet, "middle"]]);
  });

  it("fades what lies at an edge there is more past, as it is scrolled, and takes no press on a chip out of the view", () => {
    // (30 lines: 884 high in a 604 view - 280 to scroll; the changes bar at the end)
    const blocks = [...Array.from({ length: 30 }, (_, k) => reply(`line ${k}`)), { kind: "changes" } as CardBlock];
    const laid = card(blocks);
    expect(laid.layout.height).toBeGreaterThan(900);
    // (at the start: line 0 at 12, nothing above it - all of it; line 19 ends at 582, 22 from the foot - all; line 20 at 592 is past it - none)
    const start = cardParts({ ...laid, offset: 0 });
    expect(["line 0", "line 19", "line 20"].map((n) => start.texts.find((t) => t.text === n)?.opacity)).toEqual([1, 1, undefined]);
    expect(start.regions.map((r) => r.part)).toEqual(["card", "track", "thumb"]);
    // (scrolled 10: line 0 at 2 with more above it - 2 of 19; line 20 at 582 ending at 601, 3 from the foot - 3 of 19)
    const part = cardParts({ ...laid, offset: 10 });
    expect(["line 0", "line 1", "line 20"].map((n) => near(part.texts.find((t) => t.text === n)?.opacity ?? -1))).toEqual([near(2 / 19), 1, near(3 / 19)]);
    // (at the end: the chips in the view, whole)
    const end = cardParts({ ...laid, offset: Infinity });
    expect(end.regions.map((r) => r.part)).toEqual(["card", "keep", "discard", "track", "thumb"]);
    expect(end.offset).toBe(end.max);
    expect(end.texts.find((t) => t.text === "line 0")).toBeUndefined();
  });

  it("is faded as the page's words are: its words as present as they are read, its turns the rest - and its box as it is present", () => {
    const blocks = [{ kind: "question", text: "Hi" } as CardBlock, reply("hello")];
    const half = cardParts(card(blocks, { words: 0.5, turns: 3, opacity: 0.8 }));
    expect(half.texts.map((t) => [t.text, near(t.opacity!)])).toEqual([["3 turns", 0.4], ["Hi", 0.4], ["hello", 0.4]]);
    expect(half.shapes.find((s) => s.key === "conversation:1:card")).toMatchObject({ opacity: 0.8 });
    // (read no more: its turns alone, in the middle of its history - 24 px words - no lines, no chips, no ground)
    const small = cardParts(card([...blocks, { kind: "changes" }], { words: 0, turns: 3, changed: true }));
    expect(small.texts.map((t) => [t.text, t.sizePx, t.anchor, t.baseline, t.opacity])).toEqual([["3 turns · changes waiting", 24, "start", "middle", 1]]);
    expect(small.shapes.map((s) => s.key)).toEqual(["conversation:1:card", "conversation:1:ask"]);
    expect(small.regions.map((r) => r.part)).toEqual(["card"]);
  });

  it("says what a card too small to read holds: nothing, one turn or its count - and that it works, or has changes waiting", () => {
    expect([turnsSaid(0, false, false), turnsSaid(1, false, false), turnsSaid(12, false, false)]).toEqual(["Nothing said", "One turn", "12 turns"]);
    expect([turnsSaid(2, true, true), turnsSaid(2, false, true)]).toEqual(["2 turns · working", "2 turns · changes waiting"]);
  });

  it("is nothing where its frame leaves no room", () => {
    expect(cardParts(card([reply("hello")], { frame: { x0: 0, y0: 0, x1: 0.5, y1: 25.2 } }))).toEqual({ shapes: [], texts: [], icons: [], regions: [], rect: null, offset: 0, max: 0, view: 0, trackPx: 0 });
  });

  it("keeps a card's lengths as the layout has them", () => {
    expect([CARD.w, CARD.ask]).toEqual([432, 44]);
  });
});

describe("a conversation's card scrolled without the wheel", () => {
  // (30 lines: 884 high in a 604 view, 280 to scroll; the track 604 less its 8 at each end: 588; its thumb 588 x 604 / 884 = 401.8 long)
  const many = card(Array.from({ length: 30 }, (_, k) => reply(`line ${k}`)));
  const box = (d: ReturnType<typeof cardParts>, key: string) => d.shapes.find((s) => s.key === `conversation:1:${key}`) as { x0: number; x1: number; y0: number; y1: number; opacity: number; radiusPx: number } | undefined;

  it("has a track on its right edge, 5 px in: the thumb 2 px wide at rest and 6 pointed at, its length and place those of the history it shows", () => {
    expect([TRACK.rest, TRACK.pointed, TRACK.edge, TRACK.ends]).toEqual([2, 6, 5, 8]);
    const rest = cardParts({ ...many, offset: 0 });
    const thumb = box(rest, "thumb")!;
    // (the card's right edge 42.75; 5 px in 42.5625; 2 px wide from 42.4875)
    expect([near(thumb.x1), near(thumb.x0), near(thumb.radiusPx)]).toEqual([near(42.75 - 5 * 0.0375), near(42.75 - 7 * 0.0375), 1]);
    // (at the start: from 8 px below the card's top, 401.8 long)
    expect([near(thumb.y1), near(thumb.y1 - thumb.y0)]).toEqual([near(24.75 - 8 * 0.0375), near((588 * 604 / 884) * 0.0375)]);
    const pointed = box(cardParts({ ...many, offset: 0, scroll: { track: 1, earlier: 0, latest: 0 } }), "thumb")!;
    expect([near(pointed.x1 - pointed.x0), pointed.opacity > thumb.opacity]).toEqual([near(6 * 0.0375), true]);
    // (at the end: the thumb's foot at the track's, 8 px above the history's foot - 604 - that is 596 below the card's top)
    const end = box(cardParts({ ...many, offset: Infinity }), "thumb")!;
    expect(near(end.y0)).toBe(near(24.75 - 596 * 0.0375));
    // (the track under it drawn only as it is pointed at)
    expect([box(rest, "track")!.opacity, box(cardParts({ ...many, scroll: { track: 1, earlier: 0, latest: 0 } }), "track")!.opacity]).toEqual([0, 0.6]);
  });

  it("takes the pointer on a strip 14 px wide along the track, the thumb over it - and none where the history fits", () => {
    const d = cardParts({ ...many, offset: 0 });
    expect(d.regions.map((r) => [r.part, r.cursor])).toEqual([["card", "default"], ["track", "default"], ["thumb", "grab"]]);
    const strip = d.regions[1] as { rect: { x0: number; x1: number; y0: number; y1: number } };
    expect(near(strip.rect.x1 - strip.rect.x0)).toBe(near(14 * 0.0375));
    expect([near(strip.rect.y1), near(strip.rect.y1 - strip.rect.y0)]).toEqual([near(24.75 - 8 * 0.0375), near(588 * 0.0375)]);
    expect([d.view, d.trackPx]).toEqual([604, 588]);
    const fits = cardParts(card([reply("one")]));
    expect(fits.shapes.some((s) => s.key.endsWith(":thumb"))).toBe(false);
    expect(fits.regions.map((r) => r.part)).toEqual(["card"]);
  });

  it("draws Earlier and Latest as chips 22 high at the history's top and foot, 10 in, as present as they are told - an arrow, then the word - where there is more that way", () => {
    const d = cardParts({ ...many, offset: 100, scroll: { track: 0, earlier: 1, latest: 0.5 } });
    const earlier = box(d, "earlier")!;
    const latest = box(d, "latest")!;
    expect([near(earlier.y1), near(earlier.y1 - earlier.y0), earlier.opacity]).toEqual([near(24.75 - 10 * 0.0375), near(22 * 0.0375), 1]);
    expect(latest.y1).toBeCloseTo(24.75 - (604 - 10 - 22) * 0.0375, 9);
    expect(latest.opacity).toBe(0.5);
    // (centred in the card: the same room either side)
    expect(earlier.x0 - 26.55).toBeCloseTo(42.75 - earlier.x1, 9);
    expect(d.icons.map((i) => [i.key, i.icon, i.sizePx, i.opacity])).toEqual([["conversation:1:earlier:icon", SCROLL_ICONS.earlier, 12, 1], ["conversation:1:latest:icon", SCROLL_ICONS.latest, 12, 0.5]]);
    expect(d.texts.filter((t) => ["Earlier", "Latest"].includes(t.text)).map((t) => [t.text, t.opacity, t.baseline])).toEqual([["Earlier", 1, "middle"], ["Latest", 0.5, "middle"]]);
    // (a hand takes one that is half there)
    expect(d.regions.map((r) => r.part)).toEqual(["card", "track", "thumb", "earlier", "latest"]);
    expect(cardParts({ ...many, offset: 100, scroll: { track: 0, earlier: 0.49, latest: 0 } }).regions.map((r) => r.part)).toEqual(["card", "track", "thumb"]);
    // (one told it is not there is not drawn)
    const none = cardParts({ ...many, offset: 100, scroll: { track: 0, earlier: 0, latest: 0 } });
    expect([box(none, "earlier"), box(none, "latest"), none.icons]).toEqual([undefined, undefined, []]);
  });

  it("fades the words a chip lies over, as much as the chip is there - those it does not reach are as they were", () => {
    // (a paragraph of long lines, the first at 12 to 31, within the top chip's 10 to 32 and across the middle where it stands; the 4th at 69 clear of it)
    const long = card([reply("word ".repeat(120))]);
    const opacities = (earlier: number) => cardParts({ ...long, offset: 0, scroll: { track: 0, earlier, latest: 0 } }).texts.filter((t) => t.text.startsWith("word")).map((t) => t.opacity);
    expect(opacities(0).slice(0, 4)).toEqual([1, 1, 1, 1]);
    expect(opacities(0.5).slice(0, 4)).toEqual([0.5, 0.5, 1, 1]);
    // (one there whole hides what is under it: its two lines not drawn at all)
    expect(opacities(1)).toHaveLength(opacities(0).length - 2);
  });

  it("puts a dot on Latest where there is more that is new, 6 px across at its top right corner", () => {
    const d = cardParts({ ...many, offset: 100, scroll: { track: 0, earlier: 0, latest: 1, dot: true } });
    const latest = box(d, "latest")!;
    const dot = box(d, "latest:dot")!;
    expect(dot.x1).toBeCloseTo(latest.x1 - 0.0375, 9);
    expect(dot.y1).toBeCloseTo(latest.y1 - 0.0375, 9);
    expect([near(dot.x1 - dot.x0), dot.radiusPx]).toEqual([near(6 * 0.0375), 3]);
    expect(box(cardParts({ ...many, offset: 100, scroll: { track: 0, earlier: 0, latest: 1 } }), "latest:dot")).toBeUndefined();
  });

  it("draws none of it where its words are too small to read", () => {
    const d = cardParts({ ...many, words: 0, offset: 100, scroll: { track: 1, earlier: 1, latest: 1, dot: true } });
    expect(d.shapes.map((s) => s.key)).toEqual(["conversation:1:card", "conversation:1:ask"]);
    expect(d.icons).toEqual([]);
    expect(d.regions.map((r) => r.part)).toEqual(["card"]);
    expect(SCROLL_CHIP.h).toBe(22);
  });
});
