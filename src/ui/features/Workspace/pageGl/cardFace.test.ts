import { afterEach, describe, expect, it, vi } from "vitest";
import { COLORS } from "../../../theme/colors";
import { cardState } from "../workflow/cardState";
import { CARD_H, CARD_W, PORT_STEP, portDown } from "../workflow/look";
import { CARD, NAME_WIDEST, cardFace, cardLines, clamped, markOf, nameBoxOf, nameFits, type CardFaceOf } from "./cardFace";
import { ICON_PX, MARK_PX, NAME_PX } from "./cardBands";
import type { Box, Ring } from "./shapes";
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

  it("shows its name and its state's mark where its words are too small to read, the one fading out as the other comes in", () => {
    const half = cardFace(card({ words: 0.5, scale: 0.5, state: cardState("done", undefined, undefined, 0) }));
    // (its words as they were, half there; its name and its kind's icon half in; its mark)
    expect(half.texts.filter((t) => !t.key.includes("name")).every((t) => t.opacity === 0.5)).toBe(true);
    expect(half.icons.map((i) => [i.key.split(":").pop(), i.opacity])).toEqual([
      ["kind", 0.5],
      ["state", 0.5],
      ["big", 0.5],
    ]);
    expect(half.texts.find((t) => t.key.endsWith(":nameNamed"))?.opacity).toBe(0.5);
    // (nothing of the zoomed-out look where its words are read)
    const read = cardFace(card({ words: 1, scale: 1 }));
    expect(read.texts.some((t) => t.key.includes("name"))).toBe(false);
    expect(read.icons.map((i) => i.key.split(":").pop())).toEqual(["kind"]);
    expect(read.shapes.map((x) => x.key)).toEqual(["step:4"]);
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

  it("fades its name in as its words fade out - three quarters in with its words a quarter read - and takes no pointer for its state's tip then", () => {
    const c = card({ words: 0.25, scale: 0.5, state: { icon: "failed", text: "Failed", tone: "attention" }, stateTip: "Failed · why" });
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("a card zoomed out: named, then marked", () => {
  const far = (over: Partial<CardFaceOf> = {}) => card({ words: 0, scale: 0.5, ...over });
  const name = (d: ReturnType<typeof cardFace>, key = "nameNamed") => d.texts.find((t) => t.key.endsWith(`:${key}`));

  it("names the step in its box, on one line, eleven screen pixels high whatever the zoom, cut at its box's width and half as much again", () => {
    for (const scale of [0.7, 0.5, 0.3]) {
      const t = name(cardFace(far({ scale })))!;
      expect(t).toMatchObject({ text: "Tight", weight: 500, anchor: "start", baseline: "middle", maxWidthPx: CARD.w * 1.5, opacity: 1 });
      expect(t.sizePx * scale).toBeCloseTo(NAME_PX, 12);
    }
    expect(NAME_WIDEST).toBe(1.5 * CARD.w);
    // (its kind's icon before it, as large on the screen)
    const icon = cardFace(far({ scale: 0.4 })).icons.find((i) => i.key.endsWith(":big"))!;
    expect(icon.sizePx * 0.4).toBeCloseTo(ICON_PX, 12);
    expect(icon.icon).toBe("rings");
    // (and none of what it says read: no summary, no state words, no log line, no bar, no inputs' names)
    const d = cardFace(far({ said: "a log line", progress: 0.4, inputs: ["a", "b"], state: cardState("running", undefined, { ended: 1, total: 2, since: 0 } as never, 0) }));
    expect(d.texts.filter((t) => !t.key.includes("name") && !t.key.endsWith(":count")).every((t) => t.opacity === 0)).toBe(true);
  });

  it("is only marked below: its name in the middle of its box, its box tinted by its state, no icon of its kind", () => {
    const d = cardFace(far({ scale: 0.15, named: 0, state: cardState("done", undefined, undefined, 0) }));
    expect(name(d)).toBeUndefined();
    expect(name(d, "nameMarked")).toMatchObject({ anchor: "middle", x: 2 + pagePx(CARD.w / 2), opacity: 1 });
    expect(d.icons.some((i) => i.key.endsWith(":big"))).toBe(false);
    const tint = d.shapes.find((x) => x.key.endsWith(":tint")) as Box;
    expect(tint).toMatchObject({ fill: COLORS.quiet, fillAlpha: 0.12, opacity: 1 });
    expect([tint.x0, tint.x1, tint.y0, tint.y1]).toEqual([(d.shapes[0] as Box).x0, (d.shapes[0] as Box).x1, (d.shapes[0] as Box).y0, (d.shapes[0] as Box).y1]);
    // (named, none)
    expect(cardFace(far({ named: 1 })).shapes.some((x) => x.key.endsWith(":tint"))).toBe(false);
    // (a state with nothing to tint by - waiting, ready - lightly, in the quiet ink: a box is not lost)
    for (const state of ["waiting", "ready"] as const) {
      const quiet = cardFace(far({ named: 0, state: cardState(state, undefined, undefined, 0) })).shapes.find((x) => x.key.endsWith(":tint")) as Box;
      expect(quiet).toMatchObject({ fill: COLORS.quiet, fillAlpha: 0.06 });
    }
  });

  it("leaves a name out of the marked band where it would be cut short: as wide as its box and half as much again, or less, fits", () => {
    expect(nameFits("xtb", 1)).toBe(true);
    expect(nameFits("xtb", 0.05)).toBe(false);
    // (the edge: the width of the name at its size on the page, against its box's and half as much again)
    const scale = 0.4;
    const wide = textWidth("Optimise", NAME_PX / scale, 500);
    expect(nameFits("Optimise", scale)).toBe(wide <= NAME_WIDEST);
  });

  it("measures its name as it is drawn, at its weight: where the heavier is wider, a name that fits only in the lighter does not fit, and its box is as wide", async () => {
    // (a canvas to measure by, six wide a letter at 400, seven at 500)
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ font: "", measureText(t: string) { return { width: t.length * (this.font.startsWith("500") ? 7 : 6) }; } }) }) });
    vi.resetModules();
    const fresh = await import("./cardFace");
    const who = "x".repeat(10);
    expect(fresh.nameFits(who, 1)).toBe(true);
    const box = fresh.nameBoxOf({ key: "k", x: 0, y: 0, who }, 1, false);
    expect(box.x1 - box.x0).toBeCloseTo(pagePx(70), 12);
    // (fits at 400 and not at 500)
    const n = Math.floor(fresh.NAME_WIDEST / 6);
    expect(n * 6).toBeLessThanOrEqual(fresh.NAME_WIDEST);
    expect(n * 7).toBeGreaterThan(fresh.NAME_WIDEST);
    expect(fresh.nameFits("x".repeat(n), 1)).toBe(false);
  });

  it("goes from named to marked as it eases: the name where it was and the one in the middle, each as far as it has come", () => {
    const d = cardFace(far({ named: 0.25 }));
    expect([name(d)?.opacity, name(d, "nameMarked")?.opacity]).toEqual([0.25, 0.75]);
  });

  it("leaves its name out where it is made to, easing it: half there is half shown", () => {
    expect(name(cardFace(far({ label: 0 })))).toBeUndefined();
    expect(name(cardFace(far({ label: 0.5 })))?.opacity).toBe(0.5);
    expect(name(cardFace(far({ label: 0, named: 0 })), "nameMarked")).toBeUndefined();
  });

  it("marks its state at its top right corner: running turns in Meno's colour, done is filled in the quiet ink, waiting is hollow, and none says nothing", () => {
    const mark = (state: CardFaceOf["state"], failed?: number) => cardFace(far({ state, failed }));
    const running = mark(cardState("running", undefined, { ended: 0, total: 1, since: 0 } as never, 0));
    expect(running.icons.find((i) => i.key.endsWith(":mark"))).toMatchObject({ icon: "running", color: COLORS.base, spin: 0.5 });
    const done = mark(cardState("done", undefined, undefined, 0)).shapes.find((x) => x.key.endsWith(":mark")) as Ring;
    expect(done).toMatchObject({ kind: "ring", fill: COLORS.quiet });
    const waiting = mark(cardState("waiting", undefined, undefined, 0)).shapes.find((x) => x.key.endsWith(":mark")) as Ring;
    expect(waiting.fill).toBeUndefined();
    expect(waiting.line?.color).toBe(COLORS.quiet);
    for (const quiet of ["ready", "no-input"] as const) {
      const d = mark(cardState(quiet, undefined, undefined, 0));
      expect([d.shapes.some((x) => x.key.endsWith(":mark")), d.icons.some((i) => i.key.endsWith(":mark"))]).toEqual([false, false]);
    }
    // (at the corner: inside the box's top right, a mark's width from the edge)
    const box = done && (mark(cardState("done", undefined, undefined, 0)).shapes[0] as Box);
    expect(done.x).toBeLessThan(box.x1);
    expect(done.x).toBeGreaterThan(box.x1 - pagePx(CARD.w / 2));
    expect(done.y).toBeLessThan(box.y1);
    expect(done.y).toBeGreaterThan(box.y1 - pagePx(CARD.h / 2));
  });

  it("says in the alert tone how many of its entries failed, in its mark - and a failed step with none counted, the tone alone", () => {
    const failed = cardFace(far({ state: cardState("done", "5 compounds", undefined, 0), failed: 3 }));
    expect(failed.shapes.find((x) => x.key.endsWith(":mark"))).toMatchObject({ fill: COLORS.attention });
    expect(failed.texts.find((t) => t.key.endsWith(":mark:count"))).toMatchObject({ text: "3", color: COLORS.background, anchor: "middle" });
    expect((failed.shapes.find((x) => x.key.endsWith(":tint")) as Box | undefined)?.fill).toBeUndefined();
    const whole = cardFace(far({ named: 0, state: cardState("failed", "why", undefined, 0) }));
    expect(whole.shapes.find((x) => x.key.endsWith(":mark"))).toMatchObject({ fill: COLORS.attention });
    expect(whole.texts.some((t) => t.key.endsWith(":count"))).toBe(false);
    expect(whole.shapes.find((x) => x.key.endsWith(":tint"))).toMatchObject({ fill: COLORS.attention });
    // (none failed: none said)
    expect(markOf({ icon: "done" }, 0)).toMatchObject({ kind: "done" });
    expect(markOf({ icon: "done" }, undefined)).not.toHaveProperty("count");
  });

  it("draws its mark as large on the screen as ten pixels, never more than two fifths of its height, in from its corner", () => {
    const m = (scale: number) => cardFace(far({ scale, state: cardState("done", undefined, undefined, 0) })).shapes.find((x) => x.key.endsWith(":mark")) as Ring;
    expect(m(0.5).diameterPx * 0.5).toBeCloseTo(MARK_PX, 12);
    expect(m(0.4).diameterPx * 0.4).toBeCloseTo(MARK_PX, 12);
    expect(m(0.05).diameterPx).toBeCloseTo(0.4 * CARD.h, 12);
  });

  it("is told where its name lies: after its icon where named, centred where only marked, cut as it is", () => {
    const named = nameBoxOf({ key: "k", x: 2, y: 3, who: "Tight" }, 0.5, true);
    const marked = nameBoxOf({ key: "k", x: 2, y: 3, who: "Tight" }, 0.5, false);
    expect(named.x0).toBeGreaterThan(2 + pagePx(CARD.hair + CARD.side));
    // (after its icon and the gap: at scale a half, fourteen and five screen pixels)
    expect(named.x0).toBeCloseTo(2 + pagePx(CARD.hair + CARD.side + 14 / 0.5 + 5 / 0.5), 12);
    expect(named.x0).not.toBeCloseTo(marked.x0, 6);
    // (its width as it is drawn, at its weight)
    expect(named.x1 - named.x0).toBeCloseTo(pagePx(textWidth("Tight", NAME_PX / 0.5, 500)), 12);
    expect((marked.x0 + marked.x1) / 2).toBeCloseTo(2 + pagePx(CARD.w / 2), 9);
    expect(named.x1 - named.x0).toBeCloseTo(marked.x1 - marked.x0, 12);
    // (eleven screen pixels high, in the middle of its least height)
    expect(named.y1 - named.y0).toBeCloseTo(pagePx(NAME_PX / 0.5), 9);
    expect((named.y0 + named.y1) / 2).toBeCloseTo(3 - pagePx(CARD.h / 2), 9);
    // (a name longer than its box and half as much again: as wide as that)
    const long = nameBoxOf({ key: "k", x: 0, y: 0, who: "w".repeat(200) }, 0.5, false);
    expect(long.x1 - long.x0).toBeCloseTo(pagePx(NAME_WIDEST), 9);
    const longNamed = nameBoxOf({ key: "k", x: 0, y: 0, who: "w".repeat(200) }, 0.5, true);
    expect(longNamed.x1 - longNamed.x0).toBeCloseTo(pagePx(NAME_WIDEST), 9);
  });

  it("keeps the sizes it says as screen pixels: the icon fourteen, the name eleven, the mark ten, its count seven tenths of the mark, the hollow mark's line one and a half", () => {
    expect([ICON_PX, NAME_PX, MARK_PX]).toEqual([14, 11, 10]);
    for (const scale of [0.5, 0.4]) {
      const d = cardFace(far({ scale, state: cardState("waiting", undefined, undefined, 0) }));
      expect((d.shapes.find((x) => x.key.endsWith(":mark")) as Ring).line?.widthPx).toBeCloseTo(1.5 / scale, 12);
      expect(d.icons.find((i) => i.key.endsWith(":big"))!.sizePx).toBeCloseTo(14 / scale, 12);
      expect(name(d)!.sizePx).toBeCloseTo(11 / scale, 12);
      const count = cardFace(far({ scale, state: cardState("done", undefined, undefined, 0), failed: 2 })).texts.find((t) => t.key.endsWith(":mark:count"))!;
      expect(count.sizePx).toBeCloseTo((10 / scale) * 0.7, 12);
    }
  });

  it("puts its icon before its name, five screen pixels between them, and its mark five screen pixels in from its corner - or, small, a seventh of its height", () => {
    const scale = 0.5;
    const d = cardFace(far({ scale, state: cardState("done", undefined, undefined, 0) }));
    const icon = d.icons.find((i) => i.key.endsWith(":big"))!;
    const nameAt = name(d)!.x;
    // (its right edge, the gap, then its name)
    expect(nameAt - (icon.x + pagePx(14 / scale / 2))).toBeCloseTo(pagePx(5 / scale), 12);
    expect(icon.x).toBeCloseTo(2 + pagePx(CARD.hair + CARD.side + 14 / scale / 2), 12);
    const mark = d.shapes.find((x) => x.key.endsWith(":mark")) as Ring;
    expect(mark.x).toBeCloseTo(2 + pagePx(CARD.w - 5 / scale - 10 / scale / 2), 12);
    expect(mark.y).toBeCloseTo(3 - pagePx(5 / scale + 10 / scale / 2), 12);
    // (small: its inset capped at a seventh of its height, its mark at two fifths)
    const small = cardFace(far({ scale: 0.05, state: cardState("done", undefined, undefined, 0) })).shapes.find((x) => x.key.endsWith(":mark")) as Ring;
    expect(small.x).toBeCloseTo(2 + pagePx(CARD.w - CARD.h / 7 - 0.2 * CARD.h), 12);
    expect(small.y).toBeCloseTo(3 - pagePx(CARD.h / 7 + 0.2 * CARD.h), 12);
  });
});

describe("a card's mark, from its state", () => {
  it("a card that is only changed is hollow, not turning: running turns only where it runs", () => {
    expect(markOf({ icon: "running", turning: false })).toEqual({ kind: "waiting", colour: COLORS.quiet, tint: false });
    expect(markOf({ icon: "running" })).toEqual({ kind: "waiting", colour: COLORS.quiet, tint: false });
    expect(markOf({ icon: "running", turning: true })).toEqual({ kind: "running", colour: COLORS.base, tint: true });
  });

  it("a stopped step is hollow as one waiting is, and a state that is none has no mark", () => {
    expect(markOf({ icon: "stopped" })).toEqual({ kind: "waiting", colour: COLORS.quiet, tint: false });
    expect(markOf({ icon: "waiting" })).toEqual({ kind: "waiting", colour: COLORS.quiet, tint: false });
    expect(markOf({ icon: "failed" })).toEqual({ kind: "failed", colour: COLORS.attention, tint: true });
    expect(markOf({ icon: undefined })).toBeNull();
    expect(markOf({ icon: "nothing" })).toBeNull();
  });
});
