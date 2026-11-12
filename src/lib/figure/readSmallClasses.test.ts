import { describe, expect, it } from "vitest";
import type { FigureDrawn, FigureLetter, FigurePath, PathStep } from "./drawn";
import { labelText, lyingAlong, readFigure, wordsOf } from "./read";

// Made samples, drawn as a drawing program draws (bonds 14.4 points, lines 0.6 thick, 10-point letters): the small ways a
// perspective drawing or a page of a paper is misread, each with what Meno's own drawing would be.
const L = 14.4;
type P = [number, number];
const line = (a: P, b: P, w = 0.6, colour = "#000000ff"): FigurePath => ({ fill: null, stroke: colour, width: w, d: [["M", a[0], a[1]], ["L", b[0], b[1]]] as PathStep[] });
/** A bar filled: a thick line as a drawing program may write it, a rectangle. */
const bar = (a: P, b: P, w: number): FigurePath => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [nx, ny] = [(-(b[1] - a[1]) / l) * (w / 2), ((b[0] - a[0]) / l) * (w / 2)];
  return { fill: "#000000ff", stroke: null, width: 0, d: [["M", a[0] + nx, a[1] + ny], ["L", b[0] + nx, b[1] + ny], ["L", b[0] - nx, b[1] - ny], ["L", a[0] - nx, a[1] - ny], ["Z"]] as PathStep[] };
};
const hex = (cx: number, cy: number): P[] => Array.from({ length: 6 }, (_, i) => [cx + L * Math.cos((Math.PI / 3) * i), cy + L * Math.sin((Math.PI / 3) * i)] as P);
/** A line beside the one from `a` to `b`, `by` of a bond to its left. */
const beside = (a: P, b: P, by: number): [P, P] => {
  const [nx, ny] = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
  return [[a[0] + nx * by * L, a[1] + ny * by * L], [b[0] + nx * by * L, b[1] + ny * by * L]];
};
const figure = (paths: FigurePath[], letters: FigureLetter[] = []): FigureDrawn => ({ paths, letters, pictures: [] });

describe("a double bond on a perspective drawing's near edge", () => {
  // (measured on a real page: the near edge's double bond is three lines - a bold bar a bond long, twice a thin line's width; a hairline
  //  bar along it, the same middle; and the double bond's thin inner line, shorter, a fifth of a bond off - read as a triple bond)
  const thin = 0.073 * L;
  const near = (inner: boolean, hairline = true): FigurePath[] => {
    const [p1, p2]: [P, P] = [[100, 100], [100 + L, 100]];
    const m = 100 + L / 2;
    return [
      line([p1[0] - L / 2, 100 - 0.87 * L], p1, thin),
      line(p2, [p2[0] + L / 2, 100 - 0.87 * L], thin),
      bar([m - 0.465 * L, 100], [m + 0.465 * L, 100], 0.15 * L),
      ...(hairline ? [line([m - 0.455 * L, 100], [m + 0.455 * L, 100], 0.009 * L)] : []),
      ...(inner ? [line([m + 0.15 * L - 0.34 * L, 100 + 0.2 * L], [m + 0.15 * L + 0.34 * L, 100 + 0.2 * L], thin)] : []),
    ];
  };

  it("is one double bond, drawn bold: not a triple bond of its three lines", () => {
    const read = readFigure(figure(near(true)));
    expect(read.bonds).toHaveLength(3);
    const double = read.bonds.filter((b) => b.order > 1);
    expect(double).toHaveLength(1);
    expect(double[0]).toMatchObject({ order: 2, bold: true });
  });

  it("is a single bold bond where it has no inner line: its hairline is the same line, never a second one", () => {
    const read = readFigure(figure(near(false)));
    expect(read.bonds).toHaveLength(3);
    expect(read.bonds.filter((b) => b.bold).map((b) => b.order)).toEqual([1]);
    expect(Math.max(...read.bonds.map((b) => b.order))).toBe(1);
  });
});

describe("a bold bond of a perspective drawing (a thick front bond)", () => {
  // (a ring's edge drawn thick, thin edges of the ring's other side running parallel to it a third of a bond off - as a chair's back
  //  and front bonds do - were taken for the lines of a double or a triple bond: a carbon with five bonds)
  const ring = hex(60, 60);
  const front = (w: number, draw: (a: P, b: P, w: number) => FigurePath): FigurePath[] => {
    const edges = ring.map((p, i) => (i === 0 ? draw(p, ring[1], w) : line(p, ring[(i + 1) % 6])));
    const [a0, b0] = [ring[0], ring[1]];
    const [p, q] = beside(a0, b0, 0.3);
    const [r, s] = beside(a0, b0, -0.3);
    return [...edges, line(p, q), line(r, s)];
  };

  it("is one single bond, drawn bold, whatever thin lines run beside it - a stroke or a filled bar alike", () => {
    for (const draw of [(a: P, b: P, w: number) => line(a, b, w), bar]) {
      const read = readFigure(figure(front(2.2, draw)));
      const bold = read.bonds.filter((b) => b.bold);
      expect(bold).toHaveLength(1);
      expect(bold[0].order).toBe(1);
      // (no line of it taken for a double or triple bond)
      expect(read.bonds.every((b) => b.order === 1)).toBe(true);
    }
  });

  it("is still a double bond where its thin lines are the same thickness: the rule is about thickness, not the place", () => {
    const read = readFigure(figure(front(0.6, (a, b, w) => line(a, b, w))));
    expect(Math.max(...read.bonds.map((b) => b.order))).toBeGreaterThanOrEqual(2);
    expect(read.bonds.some((b) => b.bold)).toBe(false);
  });
});

/** A label drawn as typeset: each part its text, its size in points and how far its baseline stands above the line's (negative: below). */
function label(parts: [string, number, number][], x = 100, y = 100): FigureLetter[] {
  let at = x;
  return parts.flatMap(([text, size, up]) =>
    [...text].map((c): FigureLetter => {
      const w = size * 0.6;
      const base = y - up;
      const letter: FigureLetter = { c, box: [at, base - size * 0.72, at + w, base], at: [at, base], size, loose: [at, base - size, at + w + 0.2, base + 0.2 * size] };
      at += w + 0.2;
      return letter;
    }),
  );
}
const read = (parts: [string, number, number][]) => {
  const words = wordsOf(label(parts));
  expect(words).toHaveLength(1);
  return labelText(words[0]);
};

describe("a locant beside an atom's label (the small atom numbers of a drawing)", () => {
  it("is no part of the label: a number set small and high after its letters - Me7, O14 - is left out", () => {
    expect(read([["Me", 10, 0], ["7", 6, 4]])).toBe("Me");
    expect(read([["O", 10, 0], ["14", 6, 4]])).toBe("O");
    // (level with them, smaller: as a locant is set beside a label)
    expect(read([["Me", 10, 0], ["7", 6.5, 0]])).toBe("Me");
  });

  it("is a run of digits, whatever its length, dropped together - and kept, all of it, where a charge's sign follows the run", () => {
    expect(read([["O", 10, 0], ["14", 6, 4]])).toBe("O");
    expect(read([["O", 10, 0], ["123", 6, 4]])).toBe("O");
    // (a charge's digits, a sign after them in any of its forms: plus, hyphen, minus, en dash)
    expect(read([["Ca", 10, 0], ["12", 6, 4], ["+", 6, 4]])).toBe("Ca12+");
    expect(read([["S", 10, 0], ["2", 6, 4], ["-", 6, 4]])).toBe("S2-");
    expect(read([["S", 10, 0], ["2", 6, 4], ["\u2212", 6, 4]])).toBe("S2-");
    expect(read([["S", 10, 0], ["2", 6, 4], ["\u2013", 6, 4]])).toBe("S2-");
    // (the sign must be as small as the digits: a sign of the label's own size is not a charge's, and the locant before it goes)
    expect(read([["O", 10, 0], ["1", 6, 4], ["+", 10, 0]])).toBe("O+");
  });

  it("ends its run at a digit set low - a count - and at a letter", () => {
    expect(read([["O", 10, 0], ["1", 6, 4], ["4", 6, -2.5]])).toBe("O4");
    expect(read([["C", 10, 0], ["1", 6, 4], ["Me", 10, 0]])).toBe("CMe");
  });

  it("leaves what a label's own numbers are: a count set low, a charge's digit, a mass number, an R group's number", () => {
    expect(read([["CO", 10, 0], ["2", 7, -2.5], ["Me", 10, 0]])).toBe("CO2Me");
    expect(read([["NH", 10, 0], ["2", 7, -2.5]])).toBe("NH2");
    expect(read([["Ca", 10, 0], ["2+", 7, 4]])).toBe("Ca2+");
    expect(read([["13", 6, 4], ["C", 10, 0]])).toBe("13C");
    expect(read([["R", 10, 0], ["1", 6, 4]])).toBe("R1");
    expect(read([["O", 10, 0], ["Me", 10, 0]])).toBe("OMe");
  });
});

describe("a protecting group's label on the left of its bond, its letters written", () => {
  it("is the same group as on the right: PMBO as OPMB, TBSO as OTBS", () => {
    const word = (text: string, x0: number): FigureLetter[] => [...text].map((c, i) => ({ c, box: [x0 + 6.8 * i, 96.4, x0 + 6.8 * i + 6.4, 103.6], at: [x0 + 6.8 * i, 103.6], size: 10 }));
    const a: P = [100, 100];
    const b: P = [100 + L * 0.87, 100 - L * 0.5];
    const c: P = [b[0] + L * 0.87, 100];
    const right = (text: string) => readFigure(figure([line(a, b), line(b, [c[0] - 1, c[1] + 0.2])], word(text, c[0] + 2)), (l) => /^(OPMB|OTBS)$/.test(l));
    // (its bond at the label's right end: mirrored)
    const m = (p: P): P => [300 - (p[0] - 100), p[1]];
    const left = (text: string) => readFigure(figure([line(m(a), m(b)), line(m(b), [m(c)[0] + 1, c[1] + 0.2])], word(text, m(c)[0] - 2 - 6.8 * text.length)), (l) => /^(OPMB|OTBS)$/.test(l));
    for (const [on, off] of [["OPMB", "PMBO"], ["OTBS", "TBSO"]]) {
      expect(right(on).atoms.map((x) => x.label)).toContain(on);
      expect(left(off).atoms.map((x) => x.label)).toContain(off);
    }
  });
});

describe("the thresholds of a bold bond and its thin neighbours, each one just over and one just under", () => {
  const thin = 0.073 * L;
  /** A ring of thin bonds - the figure's usual width, and its bond length - and, apart from it, what is under test. */
  const ringOfThin = (): FigurePath[] => hex(60, 60).map((p, i, all) => line(p, all[(i + 1) % 6], thin));
  const at: P = [300, 300];
  const end: P = [at[0] + L, at[1]];
  const read = (extra: FigurePath[]) => readFigure(figure([...ringOfThin(), ...extra]));
  /** The bonds the test's own part of the figure reads as: those to the right of the ring. */
  const own = (r: ReturnType<typeof readFigure>) => r.bonds.filter((b) => Math.min(r.atoms[b.a].x, r.atoms[b.b].x) > 200);

  it("is bold at 1.8 times the thin lines' width, no less - and a bond long enough over a tenth of its own", () => {
    // (a bar 1.8 times 0.073 of a bond, a hair over it and a hair under it: the line's width, not a drawing program's rounding, tells)
    expect(own(read([bar(at, end, 1.8 * thin * 1.01)])).map((b) => !!b.bold)).toEqual([true]);
    expect(own(read([bar(at, end, 1.8 * thin * 0.99)])).map((b) => !!b.bold)).toEqual([false]);
  });

  it("is bold only above 0.12 of a bond across, however thin the thin lines are", () => {
    const finer = hex(60, 60).map((p, i, all) => line(p, all[(i + 1) % 6], 0.04 * L));
    const fine = (w: number) => readFigure(figure([...finer, bar(at, end, w * L)]));
    expect(own(fine(0.121)).map((b) => !!b.bold)).toEqual([true]);
    expect(own(fine(0.119)).map((b) => !!b.bold)).toEqual([false]);
  });

  it("is a double bond where the thin line beside it is shorter than 0.85 of it, two bonds where it is as long: a chair's back bond beside its front one", () => {
    const [p, q] = beside(at, end, 0.2);
    const shorter = (ratio: number): FigurePath => {
      const mid: P = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      return line([mid[0] - (ratio * L) / 2, mid[1]], [mid[0] + (ratio * L) / 2, mid[1]], thin);
    };
    const wide = 0.15 * L;
    const under = own(read([bar(at, end, wide), shorter(0.84)]));
    expect(under).toHaveLength(1);
    expect(under[0]).toMatchObject({ order: 2, bold: true });
    const over = own(read([bar(at, end, wide), shorter(0.86)]));
    expect(over).toHaveLength(2);
    expect(over.every((b) => b.order === 1)).toBe(true);
    expect(over.filter((b) => b.bold)).toHaveLength(1);
  });

  it("is at most two lines with a bold one - a double bond - where three thin lines are a triple bond", () => {
    const [p, q] = beside(at, end, 0.2);
    const [r, s] = beside(at, end, -0.2);
    const inner = (a: P, b: P): FigurePath => line([a[0] + 0.2 * L, a[1]], [b[0] - 0.2 * L, b[1]], thin);
    const withBold = own(read([bar(at, end, 0.15 * L), inner(p, q), inner(r, s)]));
    expect(withBold.map((b) => [b.order, !!b.bold]).sort()).toEqual([[1, false], [2, true]]);
    const triple = own(read([line(at, end, thin), line(p, q, thin), line(r, s, thin)]));
    expect(triple.map((b) => b.order)).toEqual([3]);
  });

  it("lies along a line within 3 degrees of its direction, no more - the hairline of a bold bar is the bar's own line", () => {
    // (a bar a bond long on level, a line half a bond long about its middle, turned by `deg`)
    const bold = { a: { x: 0, y: 0 }, b: { x: L, y: 0 }, w: 0.15 * L };
    const hair = (deg: number) => {
      const [dx, dy] = [Math.cos((deg * Math.PI) / 180) * 0.25 * L, Math.sin((deg * Math.PI) / 180) * 0.25 * L];
      return { a: { x: L / 2 - dx, y: -dy }, b: { x: L / 2 + dx, y: dy }, w: 0.009 * L };
    };
    expect(lyingAlong(hair(2.9), bold, L)).toBe(true);
    expect(lyingAlong(hair(3.1), bold, L)).toBe(false);
  });

  it("lies along a line with its middle within 0.06 of a bond of it, no more", () => {
    const bold = { a: { x: 0, y: 0 }, b: { x: L, y: 0 }, w: 0.15 * L };
    const at = (off: number) => ({ a: { x: 0.25 * L, y: off * L }, b: { x: 0.75 * L, y: off * L }, w: 0.009 * L });
    expect(lyingAlong(at(0.059), bold, L)).toBe(true);
    expect(lyingAlong(at(0.061), bold, L)).toBe(false);
  });

  it("lies along a line within its stretch, 0.05 of a bond past either end at the most", () => {
    const bold = { a: { x: 0, y: 0 }, b: { x: L, y: 0 }, w: 0.15 * L };
    // (half a bond long, its far end `past` of a bond beyond the bold line's end - and the other way, past its start)
    const beyond = (past: number) => ({ a: { x: (1 + past) * L - 0.5 * L, y: 0 }, b: { x: (1 + past) * L, y: 0 }, w: 0.009 * L });
    const before = (past: number) => ({ a: { x: -past * L, y: 0 }, b: { x: -past * L + 0.5 * L, y: 0 }, w: 0.009 * L });
    expect(lyingAlong(beyond(0.049), bold, L)).toBe(true);
    expect(lyingAlong(beyond(0.051), bold, L)).toBe(false);
    expect(lyingAlong(before(0.049), bold, L)).toBe(true);
    expect(lyingAlong(before(0.051), bold, L)).toBe(false);
  });
});

describe("a hashed bond of round-capped marks: how thin a mark is at the most (THIN_MARK)", () => {
  const stadium = (mid: P, length: number, width: number): FigurePath => {
    const [h, r] = [length / 2, width / 2];
    const k = 0.5523 * r;
    const pt = (a: number, b: number): [number, number] => [mid[0] + a, mid[1] + b];
    const d: PathStep[] = [
      ["M", ...pt(-r, -h + r)], ["L", ...pt(-r, h - r)],
      ["C", ...pt(-r, h - r + k)], ["C", ...pt(-k, h)], ["C", ...pt(0, h)],
      ["C", ...pt(k, h)], ["C", ...pt(r, h - r + k)], ["C", ...pt(r, h - r)],
      ["L", ...pt(r, -h + r)],
      ["C", ...pt(r, -h + r - k)], ["C", ...pt(k, -h)], ["C", ...pt(0, -h)],
      ["C", ...pt(-k, -h)], ["C", ...pt(-r, -h + r - k)], ["C", ...pt(-r, -h + r)], ["Z"],
    ];
    return { fill: "#000000ff", stroke: null, width: 0, d };
  };
  /** The bond length the figure's own bonds are read at: what a mark's width is measured against. */
  const bondRead = readFigure(figure(hex(60, 60).map((p, i, all) => line(p, all[(i + 1) % 6], 0.073 * L)))).bond!;
  /**
   * A ring, and off its first atom a bond hashed with two round-capped marks across it and, at the ring atom, a round dot `dot` of a bond (as read)
   * across. (A mark long enough to be a line - twice its width - and no more than 0.3 of a bond is thinner than 0.15 of a bond: the dot alone
   * can be as thick as THIN_MARK lets it.)
   */
  const hashed = (dot: number) => {
    const ring = hex(60, 60);
    const out = ring.map((p, i) => line(p, ring[(i + 1) % 6], 0.073 * L));
    const from = ring[0];
    const marks = [stadium([from[0] + 0.14 * L, from[1]], dot * bondRead, dot * bondRead), stadium([from[0] + 0.33 * L, from[1]], 0.22 * L, 0.073 * L), stadium([from[0] + 0.52 * L, from[1]], 0.28 * L, 0.073 * L)];
    return readFigure(figure([...out, ...marks]));
  };

  it("reads a dot 0.15 of a bond across as a mark of a hashed bond, and one 0.17 across as none: a hash with two marks only is no hash", () => {
    const hashes = (dot: number) => hashed(dot).bonds.filter((b) => b.stereo === "down").length;
    expect(hashes(0.1)).toBe(1);
    expect(hashes(0.15)).toBe(1);
    expect(hashes(0.17)).toBe(0);
    // (a hair either side of 0.16)
    expect(hashes(0.159)).toBe(1);
    expect(hashes(0.161)).toBe(0);
  });
});
