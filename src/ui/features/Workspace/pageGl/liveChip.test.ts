import { describe, expect, it } from "vitest";
import { colourHex, COLORS } from "../../../theme/colors";
import type { ChipFacts } from "../utils/chipSaid";
import { FRAMES_CHIP_GAP } from "../utils/molecule3d";
import { CHIP, CHIP_SHUT } from "./chips";
import { barsLaid, barTone, chipHeights, chipMeasures, chipPressed, frameAtBars, frameAtSlider, liveChip, LIVE, toneColour, type ChipState } from "./liveChip";
import type { Box } from "./shapes";
import { textWidth, wrapRuns } from "./texts";
import { pagePx } from "./units";

const kcal = (e: number) => e / 627.509474;
const VIEW = { zoom: 1 / pagePx(1), dpr: 1 };

/** The chip told `c`, at rest unless `over` says otherwise. */
function state(c: ChipFacts, over: Partial<ChipState> = {}): ChipState {
  const measures = chipMeasures(c, c.frame);
  return {
    key: "chip:4",
    facts: c,
    measures,
    frame: c.frame,
    pointed: null,
    opacity: CHIP_SHUT.opacity,
    fill: CHIP_SHUT.fill,
    read: { grown: 0, shown: 0 },
    made: { grown: 0, shown: 0, turn: 0, pointed: false },
    widths: { shut: measures.said + 2 * CHIP.side, open: Math.max(measures.width, measures.said) + 2 * CHIP.side, details: measures.details.width },
    shuts: false,
    opens: true,
    raised: false,
    seen: true,
    ...over,
  };
}
const opened = (c: ChipFacts, over: Partial<ChipState> = {}) => state(c, { read: { grown: 1, shown: 1 }, opacity: 1, fill: 1, shuts: true, opens: false, ...over });
const words = (d: ReturnType<typeof liveChip>) => d.texts.map((t) => t.text).join(" ");
const boxes = (d: ReturnType<typeof liveChip>, part: string) => d.shapes.filter((s): s is Box => s.kind === "box" && s.key.includes(part));

describe("a frames chip at rest, drawn by WebGL", () => {
  const c: ChipFacts = { count: 19, frame: 6, energies: Array.from({ length: 19 }, (_, i) => kcal(i * 0.1)) };

  it("is as wide as what it says and its room either side, as tall as its line, its padding and its line - hung its gap below where it hangs, its middle under it", () => {
    const s = state(c);
    const d = liveChip(s, { x: 10, y: 5 }, VIEW);
    const box = d.shapes[0] as Box;
    expect(box.x1 - box.x0).toBeCloseTo(pagePx(s.measures.said + 2 * CHIP.side), 9);
    expect(box.y1 - box.y0).toBeCloseTo(pagePx(CHIP.line + 2 * CHIP.pad + 2 * CHIP.border), 9);
    expect(box.y1).toBeCloseTo(5 - pagePx(FRAMES_CHIP_GAP), 9);
    expect((box.x0 + box.x1) / 2).toBeCloseTo(10, 9);
    expect(box).toMatchObject({ radiusPx: CHIP.radius, fill: COLORS.background, fillAlpha: CHIP_SHUT.fill, opacity: CHIP_SHUT.opacity, line: { widthPx: 1, color: COLORS.hairline }, shadow: CHIP.shadow });
    // (it takes the pointer over its box, a hand's pointer: a click opens it)
    expect(d.regions).toEqual([{ key: "chip:4", part: "chip", rect: { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 }, z: 0, cursor: "pointer" }]);
    // (none of its bars, slider or details while shut)
    expect(d.shapes).toHaveLength(1);
    expect(d.heightPx).toBe(chipHeights(s).height);
  });

  it("says its runs one after another from its room's edge, each in its tone, on one baseline", () => {
    const d = liveChip(state(c), { x: 10, y: 5 }, VIEW);
    const box = d.shapes[0] as Box;
    expect(d.texts.map((t) => t.text)).toEqual(["7 / 19", " · 0.60 kcal/mol"]);
    expect(d.texts.map((t) => t.color)).toEqual([COLORS.quiet, COLORS.ink]);
    expect(d.texts[0].x).toBeCloseTo(box.x0 + pagePx(CHIP.side), 9);
    expect(d.texts[1].x).toBeCloseTo(d.texts[0].x + pagePx(textWidth("7 / 19", 11)), 9);
    expect(d.texts[1].y).toBe(d.texts[0].y);
    expect(d.texts[0].y).toBeLessThan(box.y1);
    expect(d.texts[0].y).toBeGreaterThan(box.y0);
    expect(d.texts.every((t) => t.opacity === CHIP_SHUT.opacity)).toBe(true);
  });

  it("holds what the calculation found in itself, shut - drawn only as it opens, never over the molecule", () => {
    const results = [{ id: "dipole", on: "molecule" as const, group: "Properties", label: "Dipole moment", quantity: "dipole" as const, value: 1.85, rank: 2 }];
    const r: ChipFacts = { count: 5, frame: 2, about: "Tight", results };
    expect(words(liveChip(state(r), { x: 0, y: 0 }, VIEW))).not.toContain("Dipole moment");
    const d = liveChip(opened(r), { x: 0, y: 0 }, VIEW);
    expect(words(d)).toContain("Dipole moment");
    // (opened, it grows down, away from the molecule: its top where it hangs)
    expect(d.box.y1).toBeCloseTo(-pagePx(FRAMES_CHIP_GAP), 9);
  });

  it("takes no pointer hidden - a single geometry's, its molecule let go - so it covers nothing under it, a set's port say", () => {
    const one: ChipFacts = { count: 1, frame: 0, about: "a calculation" };
    expect(liveChip(state(one, { seen: false, opacity: 0 }), { x: 0, y: 0 }, VIEW).regions).toEqual([]);
  });
});

describe("a frames chip opened", () => {
  it("names its bars, and lays them on whole device pixels, each as wide as the next and as far from it - a row even", () => {
    for (const dpr of [1, 2])
      for (const count of [2, 3, 7, 13]) {
        const energies = Array.from({ length: count }, (_, i) => i * 1e-4);
        const d = liveChip(opened({ count, frame: 0, energies }), { x: 0.37, y: 0 }, { ...VIEW, dpr });
        const bars = boxes(d, ":bar:").map((b) => [b.x0, b.x1 - b.x0]);
        expect(bars).toHaveLength(count);
        const device = (v: number) => (v / pagePx(1)) * dpr;
        expect(new Set(bars.map(([, w]) => device(w).toFixed(6))).size).toBe(1);
        expect(new Set(bars.slice(1).map(([x], i) => device(x - bars[i][0]).toFixed(6))).size).toBe(1);
        expect(bars.every(([, w]) => Math.abs(device(w) - Math.round(device(w))) < 1e-6)).toBe(true);
      }
    expect(words(liveChip(opened({ count: 4, frame: 0, energies: [0, 1e-3, 2e-3, 3e-3] }), { x: 0, y: 0 }, VIEW))).toContain("Energy above the lowest, each frame");
    expect(words(liveChip(opened({ count: 2, frame: 0, energies: [0, 1e-3], conformers: true }), { x: 0, y: 0 }, VIEW))).toContain("each conformer");
  });

  it("colours the frame shown in Meno's colour and the one pointed at a shade of it, and puts the slider's thumb at the frame shown", () => {
    const c: ChipFacts = { count: 5, frame: 2, energies: [0, 1e-3, 2e-3, 3e-3, 4e-3] };
    // (what it says is of the frame pointed at: useFramesChip measures it so)
    const d = liveChip(opened(c, { pointed: 4, measures: chipMeasures(c, 4) }), { x: 0, y: 0 }, VIEW);
    const bars = boxes(d, ":bar:");
    expect(bars[2].fill).toBe(COLORS.base);
    expect(bars[4].fill).toBe(colourHex(140, 172, 184));
    expect(bars[0].fill).toBe(colourHex(207, 222, 229));
    const thumb = d.shapes.find((s) => s.key.endsWith(":thumb"))!;
    const track = boxes(d, ":track")[0];
    if (thumb.kind !== "ring") throw new Error("a ring");
    expect(thumb.x).toBeCloseTo((track.x0 + track.x1) / 2, 9);
    // (the frame pointed at is the one it says)
    expect(words(d)).toContain("5 / 5");
  });

  it("draws a long run of frames as one profile, broken at one that did not finish - never drawn at the foot, as if the lowest", () => {
    // (200 frames, too many for a bar each: the 101st, not converged, far the lowest)
    const energies = Array.from({ length: 200 }, (_, i) => (i === 100 ? -77 : -76 + i * 1e-5));
    const failed = energies.map((_, i) => (i === 100 ? { kind: "not-converged" as const, why: "x" } : null));
    const d = liveChip(opened({ count: 200, frame: 0, energies, failed, conformers: true }), { x: 0, y: 0 }, VIEW);
    expect(boxes(d, ":bar:")).toHaveLength(0);
    expect(d.polys).toHaveLength(2);
    expect(boxes(d, ":unfinished:100:").length).toBeGreaterThan(0);
    expect(boxes(d, ":unfinished:").every((b) => b.key.includes(":unfinished:100:"))).toBe(true);
  });

  it("outlines a bar that did not finish at the foot, dashed, and says why in the page's tip as it is pointed at", () => {
    const energies = [-76, -76.0015936014, -77];
    const failed = [null, null, { kind: "not-converged" as const, why: "stopped at 200 cycles" }];
    const c: ChipFacts = { count: 3, frame: 0, energies, failed, conformers: true };
    const d = liveChip(opened(c, { pointed: 2 }), { x: 0, y: 0 }, VIEW);
    expect(boxes(d, ":bar:2")[0].line).toMatchObject({ dashed: { onPx: 2, offPx: 1 } });
    expect(d.tip).toMatchObject({ text: "not converged" });
    expect(liveChip(opened(c, { pointed: 1 }), { x: 0, y: 0 }, VIEW).tip).toBeUndefined();
  });

  it("says under a conformer set's bars what its energies are, in the words of what made them - but not a calculation's, which says its own line", () => {
    const energies = [0, kcal(0.5), kcal(1.2)];
    const made = { how: [], energies: "Field X" };
    expect(words(liveChip(opened({ count: 3, frame: 2, energies, made }), { x: 0, y: 0 }, VIEW))).toContain("Energies from Field X");
    expect(chipMeasures({ count: 3, frame: 0, energies, made: { how: [] } }, 0).under).toEqual([]);
    expect(chipMeasures({ count: 3, frame: 0, energies, made, about: "a calculation" }, 0).under.map((l) => l.text).join(" ")).not.toContain("Energies from");
  });

  it("shows a conformer set of one as a set, with its one bar; a single geometry read from a file has none", () => {
    expect(boxes(liveChip(opened({ count: 1, frame: 0, energies: [-100], populations: [1], conformers: true }), { x: 0, y: 0 }, VIEW), ":bar:")).toHaveLength(1);
    expect(chipMeasures({ count: 1, frame: 0, energies: [-100] }, 0).single).toBe(true);
  });

  it("keeps how it was made folded under a chevron alone in the chip's middle, its name in the tip while shut: its rows come only as it opens, no wider than 300 px", () => {
    const made = { method: "ETKDG v3 + MMFF94", how: [{ label: "Kept", text: "17 of 50 embedded, then pruned to those within a few kcal/mol of the lowest of them all" }] };
    const c: ChipFacts = { count: 3, frame: 0, energies: [0, 1e-3, 2e-3], made, conformers: true };
    const shut = liveChip(opened(c), { x: 0, y: 0 }, VIEW);
    // (pointing down, shut, in the chip's middle - the maintainer, 2026-11-06 - and no words beside it)
    expect(shut.icons?.map((i) => [i.icon, i.turn, i.x])).toEqual([["chevron-right", Math.PI / 2, 0]]);
    expect(words(shut)).not.toContain("How it was made");
    expect(words(shut)).not.toContain("ETKDG");
    const fold = shut.regions!.find((r) => r.part === "fold")!;
    expect("rect" in fold && (fold.rect.x0 + fold.rect.x1) / 2).toBeCloseTo(0, 9);
    // (its name said in the page's tip as it is pointed at, and only then)
    expect(shut.tip).toBeUndefined();
    expect(liveChip(opened(c, { made: { grown: 0, shown: 0, turn: 0, pointed: true } }), { x: 0, y: 0 }, VIEW).tip).toMatchObject({ text: "How it was made", x: 0 });
    // (opened, not: its rows say it, and the tip would lie over them)
    expect(liveChip(opened(c, { made: { grown: 1, shown: 1, turn: 1, pointed: true } }), { x: 0, y: 0 }, VIEW).tip).toBeUndefined();
    const m = chipMeasures(c, 0);
    expect(m.details.made!.width).toBeLessThanOrEqual(LIVE.madeMost);
    const open = liveChip(opened(c, { made: { grown: 1, shown: 1, turn: 1, pointed: false } }), { x: 0, y: 0 }, VIEW);
    expect(words(open)).toContain("ETKDG v3 + MMFF94");
    // (turned up, opened; it stays where it was, the chip widened about it)
    expect(open.icons![0].turn).toBeCloseTo((3 * Math.PI) / 2, 9);
    expect(open.icons![0].x).toBe(shut.icons![0].x);
    expect(open.heightPx).toBeCloseTo(shut.heightPx + m.details.made!.height, 9);
    // (widened both ways about its middle as it opens, as the whole chip does - the maintainer, 2026-11-06)
    expect((open.box.x0 + open.box.x1) / 2).toBeCloseTo((shut.box.x0 + shut.box.x1) / 2, 9);
    expect(open.box.x1 - open.box.x0).toBeGreaterThan(shut.box.x1 - shut.box.x0);
  });

  it("eases a bar's colour between the rest's, the pointed one's and the shown one's, as its HTML eased its fill", () => {
    expect(toneColour(0)).toBe(colourHex(207, 222, 229));
    expect(toneColour(1)).toBe(colourHex(140, 172, 184));
    expect(toneColour(2)).toBe(COLORS.base);
    expect(toneColour(0.5)).toBe(colourHex(174, 197, 207));
    expect([barTone(2, 2, 4), barTone(4, 2, 4), barTone(0, 2, 4)]).toEqual([2, 1, 0]);
    // (told the tones, it draws them)
    const c: ChipFacts = { count: 3, frame: 0, energies: [0, 1e-3, 2e-3] };
    expect(boxes(liveChip(opened(c, { tones: [2, 0.5, 0] }), { x: 0, y: 0 }, VIEW), ":bar:")[1].fill).toBe(toneColour(0.5));
  });

  it("finds the frame under the pointer on its bars and its slider, as they are drawn", () => {
    const b = barsLaid(5, LIVE.width, 2);
    for (let i = 0; i < 5; i++) expect(frameAtBars(b, (b.fromD + i * b.stepD + b.barD / 2) / b.k)).toBe(i);
    expect(frameAtBars(b, -10)).toBe(0);
    expect(frameAtBars(b, 1000)).toBe(4);
    expect(frameAtSlider(5, LIVE.width, LIVE.thumb / 2)).toBe(0);
    expect(frameAtSlider(5, LIVE.width, LIVE.width - LIVE.thumb / 2)).toBe(4);
    expect(frameAtSlider(5, LIVE.width, LIVE.width / 2)).toBe(2);
    // (from the thumb's middle at either end: the first frame and the last, however many, and the middle between)
    for (const n of [2, 5, 40]) {
      expect(frameAtSlider(n, LIVE.width, LIVE.thumb / 2), `${n}`).toBe(0);
      expect(frameAtSlider(n, LIVE.width, LIVE.width - LIVE.thumb / 2), `${n}`).toBe(n - 1);
      expect(frameAtSlider(n, LIVE.width, LIVE.width / 2), `${n}`).toBe(Math.round((n - 1) / 2));
    }
  });
});

describe("a single geometry's chip", () => {
  const LONG = "A generative model 4.8.24 · sampled from its prior (priors v2), seed 7, on the CPU; its stereo, unspecified in the SMILES, enumerated";

  it("wraps a long line within 20rem, each line centred, rather than running on past the window", () => {
    const m = chipMeasures({ count: 1, frame: 0, about: LONG }, 0);
    expect(m.lines!.length).toBeGreaterThan(1);
    expect(m.lines!.every((l) => l.width <= LIVE.saidMost + 1e-6)).toBe(true);
    expect(m.said).toBe(LIVE.saidMost);
    const d = liveChip(state({ count: 1, frame: 0, about: LONG }), { x: 0, y: 0 }, VIEW);
    expect(d.heightPx).toBeCloseTo(2 * CHIP.border + 2 * CHIP.pad + m.lines!.length * CHIP.line, 9);
  });

  it("keeps its title whole on a line of its own, cut at 14rem, and breaks a word only where it is wider than a line", () => {
    const lines = wrapRuns(
      [
        { text: "A very long title indeed for a chip", color: "a", atomic: true },
        { text: " · " + "x".repeat(120), color: "b" },
      ],
      11,
      120,
    );
    expect(lines[0].runs[0]).toMatchObject({ text: "A very long title indeed for a chip", color: "a" });
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.slice(1).every((l) => l.width <= 120 + 1e-6)).toBe(true);
  });
});

describe("a press on a chip", () => {
  const at = { single: false, expanded: false, pinned: false, hasMore: false };
  it("opens a set's on a click, shuts it on its words, and leaves it as it is on its bars and slider", () => {
    expect(chipPressed(at, "chip").expanded).toBe(true);
    expect(chipPressed({ ...at, expanded: true }, "said").expanded).toBe(false);
    expect(chipPressed({ ...at, expanded: true }, "chip").expanded).toBe(true);
    expect(chipPressed({ ...at, expanded: true }, "bars")).toEqual({ expanded: true, pinned: false, fold: false });
    expect(chipPressed({ ...at, expanded: true }, "fold").fold).toBe(true);
  });
  it("pins a single geometry's open, and shut again, only where it has more to say than its line", () => {
    expect(chipPressed({ ...at, single: true, hasMore: true }, "chip").pinned).toBe(true);
    expect(chipPressed({ ...at, single: true, hasMore: true, pinned: true }, "chip").pinned).toBe(false);
    expect(chipPressed({ ...at, single: true }, "chip")).toEqual({ expanded: false, pinned: false, fold: false });
    // (a press on its bars or its slider shows a frame, and neither pins it nor opens it)
    for (const part of ["bars", "slider"]) expect(chipPressed({ ...at, single: true, hasMore: true }, part), part).toEqual({ expanded: false, pinned: false, fold: false });
  });
});
