import { describe, expect, it } from "vitest";
import { distances, fitToPicture, maskOf, narrowEnd, placesOnInk, type Pixels } from "./inkFit";

type Pt = [number, number];
/** A line from one point to another, and - a wedge - how wide it is at its end, from nothing at its start. */
type Line = [Pt, Pt, number?];

/** A white picture `w` by `h` with black lines drawn on it, each `width` pixels thick. */
function drawn(w: number, h: number, lines: Line[], width = 2): Pixels {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (const [p, q, wide] of lines) {
        const d = [q[0] - p[0], q[1] - p[1]];
        const t = Math.min(Math.max(((x - p[0]) * d[0] + (y - p[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]), 0), 1);
        const dist = Math.hypot(x - (p[0] + t * d[0]), y - (p[1] + t * d[1]));
        const half = wide != null ? (wide * t) / 2 : width / 2;
        if (dist <= Math.max(half, width / 2)) data.fill(0, 4 * (y * w + x), 4 * (y * w + x) + 3);
      }
  return { width: w, height: h, data };
}

/** Each place as far as `within` from where it should be. */
const near = (got: Pt[], want: Pt[], within: number) => got.every(([x, y], i) => Math.hypot(x - want[i][0], y - want[i][1]) < within);

// a zigzag of four carbons, 40 pixels a bond, as the picture draws it
const PTS: Pt[] = [
  [40, 80],
  [75, 60],
  [110, 80],
  [145, 60],
];
const BONDS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
];
const zigzag = () => drawn(190, 140, BONDS.map(([a, b]) => [PTS[a], PTS[b]] as Line));

describe("how far each pixel is from the ink", () => {
  it("is the exact Euclidean distance to the nearest drawn pixel", () => {
    const mask = new Uint8Array(5 * 4);
    mask[1 * 5 + 1] = 1;
    mask[3 * 5 + 4] = 1;
    const far = distances(mask, 5, 4);
    expect(far[1 * 5 + 1]).toBe(0);
    expect(far[0]).toBeCloseTo(Math.SQRT2, 12);
    expect(far[3 * 5 + 0]).toBeCloseTo(Math.hypot(1, 2), 12);
    expect(far[0 * 5 + 4]).toBe(3);
    expect(far[2 * 5 + 4]).toBe(1);
  });

  it("finds the ink by its red, green and blue together: three times the mean below", () => {
    const p: Pixels = { width: 2, height: 1, data: [159, 159, 161, 255, 159, 160, 161, 255] };
    expect([...maskOf(p, 160)]).toEqual([1, 0]);
  });
});

describe("a picture's atoms laid on its lines", () => {
  it("puts atoms given across the structure where the picture has them", () => {
    const xs = PTS.map((p) => p[0]);
    const ys = PTS.map((p) => p[1]);
    // (as a model may give them: 0 to 1 across the structure's own extent, each way)
    const given = PTS.map(([x, y]) => [(x - 40) / (Math.max(...xs) - 40), (y - 60) / (Math.max(...ys) - 60)] as Pt);
    const p = zigzag();
    expect(near(placesOnInk(maskOf(p, 160), p.width, p.height, given, BONDS, 5), PTS, 3)).toBe(true);
    // (and with no crop said)
    expect(near(placesOnInk(maskOf(p, 160), p.width, p.height, given, BONDS), PTS, 3)).toBe(true);
  });

  it("puts atoms given across the picture as the model cropped it, its white round it, where the picture has them", () => {
    const p = zigzag();
    const dark = maskOf(p, 160);
    let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let y = 0; y < p.height; y++)
      for (let x = 0; x < p.width; x++)
        if (dark[y * p.width + x]) [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x + 1), Math.max(bottom, y + 1)];
    for (const pad of [5, 50]) {
      const [l, t] = [left - pad, top - pad];
      const [cw, ch] = [right + pad - l, bottom + pad - t];
      const given = PTS.map(([x, y]) => [(x - l) / cw, (y - t) / ch] as Pt);
      expect(near(placesOnInk(dark, p.width, p.height, given, BONDS, pad), PTS, 3)).toBe(true);
    }
  });

  it("leaves them as they are where nothing is drawn", () => {
    const blank = drawn(20, 20, []);
    expect(placesOnInk(maskOf(blank, 160), 20, 20, [[0.5, 0.25]], [], 5)).toEqual([[0.5, 0.25]]);
  });
});

describe("which end of a wedge the picture draws narrow", () => {
  const a: Pt = [40, 60];
  const b: Pt = [100, 60];
  const ink = (p: Pixels) => maskOf(p, 210);

  it("is the end its ink reaches less far from, for a wedge and for a hash", () => {
    const wedge = drawn(140, 120, [[a, b, 12]]);
    expect(narrowEnd(ink(wedge), 140, 120, a, b)).toBe("a");
    expect(narrowEnd(ink(wedge), 140, 120, b, a)).toBe("b");
    const strokes: Line[] = [];
    for (let x = 44; x <= 100; x += 7) strokes.push([[x, 60 - (6 * (x - 40)) / 60], [x, 60 + (6 * (x - 40)) / 60]]);
    expect(narrowEnd(ink(drawn(140, 120, strokes, 1.5)), 140, 120, a, b)).toBe("a");
  });

  it("is not told where the bond is as wide all along, or too short", () => {
    expect(narrowEnd(ink(drawn(140, 120, [[a, b]])), 140, 120, a, b)).toBeNull();
    expect(narrowEnd(ink(drawn(140, 120, [[a, b, 12]])), 140, 120, a, [44, 60])).toBeNull();
  });
});

describe("a picture's reading laid on the picture", () => {
  const xs = PTS.map((p) => p[0]);
  const ys = PTS.map((p) => p[1]);
  const across = PTS.map(([x, y]) => ({ x: (x - 40) / (Math.max(...xs) - 40), y: (y - 60) / (Math.max(...ys) - 60) }));

  it("puts its atoms where the picture has them, and keeps what each is", () => {
    const fitted = fitToPicture(
      {
        atoms: across.map((p, i) => ({ ...p, ...(i === 3 ? { label: "OTBS" } : { el: "C" }) })),
        bonds: BONDS.map(([a, b]) => ({ a, b, order: 1 as const })),
        pad: 5,
      },
      zigzag(),
    );
    expect(
      near(
        fitted.atoms.map((p) => [p.x, p.y]),
        PTS,
        3,
      ),
    ).toBe(true);
    expect(fitted.atoms.map((a) => a.el ?? a.label)).toEqual(["C", "C", "C", "OTBS"]);
    expect(fitted.atoms.some((a) => "unsure" in a || "confidence" in a)).toBe(false);
  });

  it("says unsure what the model is less sure of than its plugin declares, an isotope, and an atom with no symbol, a carbon", () => {
    const fitted = fitToPicture(
      {
        atoms: [
          { ...across[0], el: "C", confidence: 0.9 },
          { ...across[1], el: "C", confidence: 0.4 },
          { ...across[2], el: "H", isotope: 2, confidence: 0.99 },
          { ...across[3] },
        ],
        bonds: [
          { a: 0, b: 1, order: 1, confidence: 0.3 },
          { a: 1, b: 2, order: 2, confidence: 0.8 },
          { a: 2, b: 3, order: 1 },
        ],
      },
      zigzag(),
      0.5,
    );
    expect(fitted.atoms.map((a) => [a.el, !!a.unsure])).toEqual([
      ["C", false],
      ["C", true],
      ["H", true],
      ["C", true],
    ]);
    expect(fitted.bonds.map((b) => !!b.unsure)).toEqual([true, false, false]);
    // (no threshold declared: the model's confidence says nothing)
    const none = fitToPicture({ atoms: [{ ...across[0], el: "C", confidence: 0.1 }, { ...across[1], el: "C" }], bonds: [{ a: 0, b: 1, order: 1, confidence: 0.1 }] }, zigzag());
    expect(none.atoms.some((a) => a.unsure) || none.bonds.some((b) => b.unsure)).toBe(false);
  });

  it("says which end of a wedge is drawn narrow, from its places on the picture", () => {
    const a: Pt = [40, 60];
    const b: Pt = [100, 60];
    const fitted = fitToPicture(
      {
        atoms: [
          { x: 0, y: 0.5, el: "C" },
          { x: 1, y: 0.5, el: "O" },
        ],
        bonds: [{ a: 0, b: 1, order: 1, stereo: "up" }],
      },
      drawn(140, 120, [[a, b, 12]]),
    );
    expect(fitted.bonds[0]).toEqual({ a: 0, b: 1, order: 1, stereo: "up", narrow: "a" });
  });

  it("leaves what is not as the contract says as it is", () => {
    const fitted = fitToPicture({ atoms: [{ x: Number.NaN, y: 0, el: "C" }, { x: 1, y: 1, el: "C" }], bonds: [{ a: 0, b: 1, order: 1 }] }, zigzag());
    expect(fitted.atoms[0].x).toBeNaN();
    expect(fitToPicture({} as never, zigzag())).toEqual({ atoms: [], bonds: [] });
  });
});
