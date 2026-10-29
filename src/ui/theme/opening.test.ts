import { describe, expect, it } from "vitest";
import { easingAt, GROW_MS, OPENED, openingAfter, settled, SHOW_MS, SHUT, type Opening } from "./opening";
import { EASE, eased } from "./motion";

/** What is seen of an opening. */
const seen = (o: Opening) => ({ grown: o.grown, shown: o.shown });

/** An opening taken `ms` on, a frame of `frame` ms at a time, each frame's opening kept. */
function run(from: Opening, open: boolean, ms: number, frame = 1000 / 60): Opening[] {
  const frames: Opening[] = [];
  let at = from;
  for (let t = 0; t < ms - 1e-9; t += frame) {
    at = openingAfter(at, open, Math.min(frame, ms - t));
    frames.push(at);
  }
  return frames;
}

describe("a card opening: it grows, and only then its new lines come in", () => {
  it("takes GROW_MS to grow and SHOW_MS more for its lines: 160 ms and 120 ms", () => {
    expect([GROW_MS, SHOW_MS]).toEqual([160, 120]);
    const half = openingAfter(SHUT, true, GROW_MS / 2);
    expect(half.grown).toBeCloseTo(eased(EASE, 0.5), 6);
    expect(half.shown).toBe(0);
    expect(seen(openingAfter(SHUT, true, GROW_MS))).toEqual({ grown: 1, shown: 0 });
    expect(seen(openingAfter(SHUT, true, GROW_MS + SHOW_MS))).toEqual(seen(OPENED));
    expect(settled(openingAfter(SHUT, true, GROW_MS + SHOW_MS), true)).toBe(true);
  });

  it("shows none of its lines until it has grown, frame by frame - at 60 and at 120 frames a second", () => {
    for (const frame of [1000 / 60, 1000 / 120]) {
      const frames = run(SHUT, true, GROW_MS + SHOW_MS, frame);
      expect(frames.every((o) => o.shown === 0 || o.grown === 1)).toBe(true);
      // (each only one way, and there in the end)
      expect(frames.every((o, k) => k === 0 || (o.grown >= frames[k - 1].grown && o.shown >= frames[k - 1].shown))).toBe(true);
      expect(seen(frames[frames.length - 1])).toEqual(seen(OPENED));
    }
  });

  it("carries a frame's time past its growing into its lines, not lost", () => {
    const nearly = openingAfter(SHUT, true, GROW_MS - 4);
    const next = openingAfter(nearly, true, 16);
    expect(next.grown).toBe(1);
    expect(next.shown).toBeGreaterThan(0);
    expect(next.shown).toBeCloseTo(openingAfter(SHUT, true, GROW_MS + 12).shown, 9);
  });

  it("shutting, takes its lines out first, then goes back to its size: the reverse, as long", () => {
    const frames = run(OPENED, false, SHOW_MS + GROW_MS);
    expect(frames.every((o) => o.grown === 1 || o.shown === 0)).toBe(true);
    expect(seen(openingAfter(OPENED, false, SHOW_MS))).toEqual({ grown: 1, shown: 0 });
    expect(seen(frames[frames.length - 1])).toEqual(seen(SHUT));
    // (going, gentle out of its start as well as into its end: its first frame takes it only a little way)
    expect(1 - frames[0].shown).toBeLessThan(0.1);
  });

  it("asked the other way mid-way, goes back from where it is - in either part, no jump", () => {
    const step = 1000 / 60;
    const turnsAt: [Opening, boolean][] = [
      [openingAfter(SHUT, true, GROW_MS * 0.4), false],
      [openingAfter(SHUT, true, GROW_MS + SHOW_MS * 0.5), false],
      [openingAfter(OPENED, false, SHOW_MS * 0.5), true],
      [openingAfter(OPENED, false, SHOW_MS + GROW_MS * 0.6), true],
    ];
    // (the most a frame takes it, opening or shutting from rest)
    const most = (key: "grown" | "shown") =>
      Math.max(
        ...[[SHUT, ...run(SHUT, true, GROW_MS + SHOW_MS, step)], [OPENED, ...run(OPENED, false, GROW_MS + SHOW_MS, step)]].flatMap((frames) =>
          frames.slice(1).map((o, k) => Math.abs(o[key] - frames[k][key])),
        ),
      );
    const fresh = { grown: most("grown"), shown: most("shown") };
    for (const [at, open] of turnsAt) {
      const next = openingAfter(at, open, step);
      // (no further in a frame, turned back, than it goes in one from rest)
      expect(Math.abs(next.grown - at.grown)).toBeLessThanOrEqual(fresh.grown + 1e-9);
      expect(Math.abs(next.shown - at.shown)).toBeLessThanOrEqual(fresh.shown + 1e-9);
      // (and the way it was asked)
      if (open) expect(next.grown + next.shown).toBeGreaterThan(at.grown + at.shown);
      else expect(next.grown + next.shown).toBeLessThan(at.grown + at.shown);
      // (and it gets there, in no more than the whole of it)
      const rest = run(next, open, GROW_MS + SHOW_MS);
      expect(seen(rest[rest.length - 1])).toEqual(seen(open ? OPENED : SHUT));
    }
    // (turned back as it grows, its lines never come in)
    const grew = openingAfter(SHUT, true, GROW_MS * 0.4);
    expect(run(grew, false, GROW_MS).every((o) => o.shown === 0)).toBe(true);
    // (turned back as its lines go, it does not shrink before they are back)
    const going = openingAfter(OPENED, false, SHOW_MS * 0.5);
    expect(run(going, true, SHOW_MS).every((o) => o.grown === 1)).toBe(true);
  });

  it("stays where it is once there, and takes no time backwards", () => {
    expect(seen(openingAfter(OPENED, true, 100))).toEqual(seen(OPENED));
    expect(seen(openingAfter(SHUT, false, 100))).toEqual(seen(SHUT));
    const half = openingAfter(SHUT, true, GROW_MS / 2);
    expect(openingAfter(half, true, -10)).toEqual(half);
  });
});

describe("a length easing to where it is sent", () => {
  it("runs from where it was to where it is going in GROW_MS, on Meno's curve, and stays", () => {
    const e = { from: 100, to: 200, start: 1000 };
    expect(easingAt(e, 1000)).toBe(100);
    expect(easingAt(e, 1000 + GROW_MS / 2)).toBeCloseTo(100 + 100 * eased(EASE, 0.5), 6);
    expect(easingAt(e, 1000 + GROW_MS)).toBe(200);
    expect(easingAt(e, 5000)).toBe(200);
  });
});
