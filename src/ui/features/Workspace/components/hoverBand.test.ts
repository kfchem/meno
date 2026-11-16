import { describe, expect, it } from "vitest";
import { bandAround, hull, BAND_STEP_MOST, bandStep, type BandClock } from "./hoverBand";

type P = { x: number; y: number };
const even = (h: number) => ({ left1: h, right1: h, left2: h, right2: h });

/** How far the outline reaches across, below and above, where it crosses `x`. */
function acrossAt(outline: P[], x: number): [number, number] {
  const ys: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue;
    ys.push(a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x));
  }
  return [Math.min(...ys), Math.max(...ys)];
}

// a bond along +x, from (0, 0) to (2, 0): +y is its left
const p = { x: 0, y: 0 };
const q = { x: 2, y: 0 };
const line = 0.04;
const margin = 0.1;
const plainHalf = line + margin;
const ext = 0.06;

describe("the band round a bond under the pointer", () => {
  it("is a plain bond's capsule, ext past either atom", () => {
    const band = bandAround(p, q, even(line), margin, plainHalf, ext, 1);
    const [lo, hi] = acrossAt(band, 1);
    expect(lo).toBeCloseTo(-plainHalf, 3);
    expect(hi).toBeCloseTo(plainHalf, 3);
    const xs = band.map((v) => v.x);
    expect(Math.min(...xs)).toBeCloseTo(-ext, 3);
    expect(Math.max(...xs)).toBeCloseTo(2 + ext, 3);
  });

  it("widens with a wedge to its broad end, the margin past it all the way", () => {
    const broad = 0.2;
    const band = bandAround(p, q, { left1: line, right1: line, left2: broad, right2: broad }, margin, plainHalf, ext, 1);
    // as a plain bond's at the narrow end
    expect(acrossAt(band, 0.2)[1]).toBeLessThan(plainHalf + 0.02);
    // and past the broad end at the atom by most of the margin
    const [lo, hi] = acrossAt(band, 2);
    expect(hi).toBeGreaterThan(broad + margin / 2);
    expect(lo).toBeLessThan(-(broad + margin / 2));
  });

  it("takes in a double bond's second line on its side only", () => {
    const second = 0.3;
    const reach = { left1: line + second, right1: line, left2: line + second, right2: line };
    const [lo, hi] = acrossAt(bandAround(p, q, reach, margin, plainHalf, ext, 1), 1);
    expect(hi).toBeCloseTo(second + line + margin, 3);
    expect(lo).toBeCloseTo(-(line + margin), 3);
  });

  it("shrinks as a whole as it comes in and goes", () => {
    const [lo, hi] = acrossAt(bandAround(p, q, even(line), margin, plainHalf / 2, ext, 0.5), 1);
    expect(hi).toBeCloseTo(plainHalf / 2, 3);
    expect(lo).toBeCloseTo(-plainHalf / 2, 3);
  });

  it("hulls points anticlockwise, without the ones inside", () => {
    const h = hull([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0.5, y: 0.5 },
    ]);
    expect(h).toHaveLength(4);
    let area = 0;
    for (let i = 0; i < h.length; i++) {
      const a = h[i];
      const b = h[(i + 1) % h.length];
      area += a.x * b.y - b.x * a.y;
    }
    expect(area).toBeGreaterThan(0);
  });
});

describe("a band's own clock (no abrupt changes, the same ease every time)", () => {
  /** A band coming in over frames `every` ms apart, from `start`: how far in it is after each frame (0.16 s to come in, as the overlay's). */
  const comingIn = (start: number, every: number, frames: number) => {
    const clock: BandClock = { last: null };
    let u = 0;
    const seen: number[] = [];
    for (let k = 0; k < frames; k++) {
      u = Math.min(1, u + bandStep(clock, start + k * every, u < 1) / 0.16);
      seen.push(u);
    }
    return seen;
  };

  it("starts where it is at its first frame, however long since the canvas last drew - after a zoom, a pause, a pinch", () => {
    // (the page's clock far on, as after seconds with nothing drawn: no frame of its own before, so none of that time counts)
    expect(comingIn(5_000, 16, 1)).toEqual([0]);
    expect(comingIn(123_456, 16, 1)).toEqual([0]);
  });

  it("comes in at the same pace every time, whenever it begins", () => {
    const a = comingIn(1_000, 16, 12);
    const b = comingIn(987_654, 16, 12);
    expect(b.map((x) => x.toFixed(6))).toEqual(a.map((x) => x.toFixed(6)));
    // (in over about 0.16 s of its own frames, not at once)
    expect(a[1]).toBeLessThan(0.2);
    expect(a[a.length - 1]).toBe(1);
  });

  it("a frame held up mid-way takes it no further than BAND_STEP_MOST, a twentieth of a second; a clock gone back, nowhere", () => {
    expect(BAND_STEP_MOST).toBeCloseTo(0.05, 9);
    const clock: BandClock = { last: null };
    bandStep(clock, 0, true);
    expect(bandStep(clock, 2_000, true)).toBe(BAND_STEP_MOST);
    expect(bandStep(clock, 1_990, true)).toBe(0);
  });

  it("at rest its clock stops, so the next motion - going out after a while - starts afresh too", () => {
    const clock: BandClock = { last: null };
    bandStep(clock, 0, true);
    bandStep(clock, 16, true);
    expect(bandStep(clock, 32, false)).toBe(0);
    expect(clock.last).toBeNull();
    // (seconds later the pointer leaves: its first frame out moves it nothing)
    expect(bandStep(clock, 9_000, true)).toBe(0);
    expect(bandStep(clock, 9_016, true)).toBeCloseTo(0.016, 6);
  });
});
