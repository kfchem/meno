import { describe, expect, it } from "vitest";
import { COLORS } from "../../../theme/colors";
import { CARD, cardLayout, type CardBlock } from "./conversationCard";
import { cardParts, edgeFade, EDGE_FADE, turnsSaid, type CardOf } from "./conversationCardParts";

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
    expect(start.regions.map((r) => r.part)).toEqual(["card"]);
    // (scrolled 10: line 0 at 2 with more above it - 2 of 19; line 20 at 582 ending at 601, 3 from the foot - 3 of 19)
    const part = cardParts({ ...laid, offset: 10 });
    expect(["line 0", "line 1", "line 20"].map((n) => near(part.texts.find((t) => t.text === n)?.opacity ?? -1))).toEqual([near(2 / 19), 1, near(3 / 19)]);
    // (at the end: the chips in the view, whole)
    const end = cardParts({ ...laid, offset: Infinity });
    expect(end.regions.map((r) => r.part)).toEqual(["card", "keep", "discard"]);
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
    expect(cardParts(card([reply("hello")], { frame: { x0: 0, y0: 0, x1: 0.5, y1: 25.2 } }))).toEqual({ shapes: [], texts: [], regions: [], rect: null, offset: 0, max: 0 });
  });

  it("keeps a card's lengths as the layout has them", () => {
    expect([CARD.w, CARD.ask]).toEqual([432, 44]);
  });
});
