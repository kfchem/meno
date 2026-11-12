import { describe, expect, it } from "vitest";
import type { FigureDrawn, FigureLetter, FigurePath, PathStep } from "./drawn";
import { labelText, readFigure, wordsOf } from "./read";

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
