import { describe, expect, it } from "vitest";
import { COLORS } from "../../../theme/colors";
import { cardState } from "../workflow/cardState";
import { CARD_H, CARD_W, PORT_STEP, portDown } from "../workflow/look";
import { CARD, cardFace, cardLines, clamped, type CardFaceOf } from "./cardFace";
import type { Box } from "./shapes";
import { textWidth } from "./texts";
import { pagePx } from "./units";

const card = (over: Partial<CardFaceOf> = {}): CardFaceOf => ({
  key: "step:4",
  x: 2,
  y: 3,
  icon: "rings",
  who: "Tight",
  summary: "Optimise · Method: Loose",
  state: cardState("ready", undefined, undefined, 0),
  selected: false,
  words: 1,
  inputs: [],
  ...over,
});
const words = (d: ReturnType<typeof cardFace>) => d.texts.map((t) => t.text);

describe("a step's card, shut, drawn by WebGL", () => {
  it("is as wide as its HTML, at least as tall, its top left where the step stands: white, a hairline, Meno's colour selected", () => {
    const d = cardFace(card());
    const box = d.shapes[0] as Box;
    expect(box.x1 - box.x0).toBeCloseTo(CARD_W, 9);
    expect(box.y1 - box.y0).toBeCloseTo(CARD_H + pagePx(2 * CARD.hair), 9);
    expect([box.x0, box.y1]).toEqual([2, 3]);
    expect(box).toMatchObject({ radiusPx: 12, fill: COLORS.background, line: { widthPx: 1, color: COLORS.hairline }, shadow: CARD.shadow });
    expect((cardFace(card({ selected: true })).shapes[0] as Box).line?.color).toBe(COLORS.base);
    // (it takes the pointer over its box)
    expect(d.regions).toEqual([{ key: "step:4", part: "card", rect: { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 }, z: 0 }]);
  });

  it("says who does it in its words' colour and weight, what it does and how quietly, and its state in its tone, with their icons", () => {
    const d = cardFace(card({ state: cardState("done", "3 conformers", undefined, 0) }));
    expect(words(d)).toEqual(["Tight", "Optimise · Method: Loose", "3 conformers"]);
    expect(d.texts[0]).toMatchObject({ sizePx: 13, weight: 500, color: COLORS.ink });
    expect(d.texts[1]).toMatchObject({ sizePx: 11, color: COLORS.quiet });
    expect(d.texts[2]).toMatchObject({ sizePx: 11, color: COLORS.base });
    expect(d.icons.map((i) => i.icon)).toEqual(["rings", "done"]);
    // (the who's line first, the state's last, top to bottom)
    expect(d.texts[0].y).toBeGreaterThan(d.texts[1].y);
    expect(d.texts[1].y).toBeGreaterThan(d.texts[2].y);
  });

  it("turns its state's icon while it runs, says its log's last line in Plex Mono, and how far its jobs are in a bar", () => {
    const d = cardFace(card({ state: cardState("running", undefined, { since: 0, ended: 1, total: 4 }, 1000), said: "cycle 12", progress: 0.25 }));
    expect(d.icons.find((i) => i.key.endsWith(":state"))?.spin).toBe(0.5);
    expect(d.texts.find((t) => t.text === "cycle 12")).toMatchObject({ mono: true, sizePx: 10 });
    const [track, done] = d.shapes.slice(1) as Box[];
    expect((done.x1 - done.x0) / (track.x1 - track.x0)).toBeCloseTo(0.25, 9);
    expect(done.fill).toBe(COLORS.base);
  });

  it("grows down where what it says takes more lines, two at most each, the second cut", () => {
    const long = "Optimise, then the frequencies of each conformer found, at a level a good way higher than the first, kept apart";
    const lines = clamped(long, 11, 158, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
    expect(textWidth(lines[1], 11)).toBeLessThanOrEqual(158);
    expect(cardFace(card({ summary: long, state: { text: long, tone: "attention" } })).heightPx).toBeGreaterThan(CARD.h);
  });

  it("shows its icons alone and large where its words are too small to read, the one fading out as the other comes in", () => {
    const half = cardFace(card({ words: 0.5, state: cardState("done", undefined, undefined, 0) }));
    expect(half.icons.map((i) => [i.key.split(":").pop(), i.sizePx, i.opacity])).toEqual([
      ["kind", 16, 0.5],
      ["state", 14, 0.5],
      ["big", 28, 0.5],
      ["bigState", 24, 0.5],
    ]);
    expect(half.texts.every((t) => t.opacity === 0.5)).toBe(true);
    const none = cardFace(card({ words: 0 }));
    expect(none.icons.map((i) => i.key.split(":").pop())).toEqual(["big"]);
  });

  it("names its inputs left of it, half a port's step above each, where it takes more than one", () => {
    const d = cardFace(card({ inputs: ["Molecules", "Reference"] }));
    const names = d.texts.filter((t) => t.key.includes(":input:"));
    expect(names.map((t) => [t.text, t.anchor, t.x, t.y])).toEqual([
      ["Molecules", "end", 2 - pagePx(8), 3 - (portDown(0) - PORT_STEP / 2)],
      ["Reference", "end", 2 - pagePx(8), 3 - (portDown(1) - PORT_STEP / 2)],
    ]);
    expect(cardFace(card({ inputs: [] })).texts.some((t) => t.key.includes(":input:"))).toBe(false);
  });

  it("says its state in full in the page's tip as it is pointed at, and only then", () => {
    const c = card({ state: { icon: "failed", text: "Failed · the program stopped", tone: "attention" }, stateTip: "Failed · the program stopped\nRun 2" });
    expect(cardFace(c).tip).toBeNull();
    expect(cardFace(c).regions.map((r) => r.part)).toEqual(["card", "state"]);
    expect(cardFace(c, true).tip).toMatchObject({ text: "Failed · the program stopped\nRun 2" });
    expect(cardFace({ ...c, words: 0 }, true).tip).toBeNull();
  });

  it("is a card's least height with one line each, counts a log's line in its height, and draws its bar from its words' column, never past full", () => {
    // (one line of summary and of state: its HTML's least height, inside its hair)
    expect(cardLines({ summary: "Optimise", state: { text: "Ready", tone: "quiet" } }).height).toBe(CARD.h + 2 * CARD.hair);
    const tall = { summary: "Optimise · a method · a solvent · converged to tight, a good way", state: { text: "Running 1:02", tone: "base" as const } };
    expect(cardLines({ ...tall, said: "cycle 12" }).words - cardLines(tall).words).toBe(CARD.line);
    const d = cardFace(card({ state: cardState("running", undefined, { since: 0, ended: 0, total: 2 }, 1000), progress: 1.5 }));
    const [track, done] = d.shapes.slice(1) as Box[];
    expect(track.x0).toBeCloseTo(2 + pagePx(CARD.hair + CARD.side + CARD.icon + CARD.gap), 9);
    expect(done.x1 - done.x0).toBeCloseTo(track.x1 - track.x0, 9);
  });

  it("fades its icons alone in as its words fade out - three quarters in with its words a quarter read - and takes no pointer for its state's tip then", () => {
    const c = card({ words: 0.25, state: { icon: "failed", text: "Failed", tone: "attention" }, stateTip: "Failed · why" });
    const d = cardFace(c);
    const by = (k: string) => d.icons.find((i) => i.key.endsWith(`:${k}`))!.opacity;
    expect([by("kind"), by("big")]).toEqual([0.25, 0.75]);
    expect(d.regions.map((r) => r.part)).toEqual(["card"]);
  });

  it("says its state in the colour it is given as it eases from one tone to the next, its tone's where none is given", () => {
    const d = cardFace(card({ state: cardState("done", undefined, undefined, 0), toneColour: "#123456" }));
    expect(d.texts.find((t) => t.key.endsWith(":state:0"))?.color).toBe("#123456");
    expect(cardFace(card({ state: cardState("done", undefined, undefined, 0) })).texts.find((t) => t.key.endsWith(":state:0"))?.color).toBe(COLORS.base);
  });
});
