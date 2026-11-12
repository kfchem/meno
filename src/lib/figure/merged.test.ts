import { describe, expect, it } from "vitest";
import type { FigureDrawn, FigureLetter, FigurePath, PathStep } from "./drawn";
import { readFigure } from "./read";

// Made samples: two labels set close - Me beside an O - read as one word or two, by the drawing: its bonds, then its sizes, then its line. Letter size s
// is 10 points; M 0.69 s wide, e 0.49 s, O 0.71 s, H 0.6 s; a bond 14.3 points.
const S = 10;
type P = [number, number];
const line = (a: P, b: P): FigurePath => ({ fill: null, stroke: "#000000ff", width: 0.6, d: [["M", a[0], a[1]], ["L", b[0], b[1]]] as PathStep[] });
const WIDTH: Record<string, number> = { M: 0.69, e: 0.49, O: 0.71, H: 0.6, A: 0.67, c: 0.5, P: 0.67, B: 0.67 };

/** A word of letters set one after another from `x`: each with its gap before it (in letter sizes), its size (share of S) and how far it is set up (in S). */
function word(parts: { c: string; gap: number; size?: number; up?: number }[], x: number, y: number): FigureLetter[] {
  let at = x;
  return parts.map((p, i) => {
    const size = S * (p.size ?? 1);
    const w = WIDTH[p.c] * size;
    at += i ? p.gap * S : 0;
    const base = y - (p.up ?? 0) * S;
    const l: FigureLetter = { c: p.c, box: [at, base - 0.72 * size, at + w, base], at: [at, base], size, loose: [at, base - size, at + w, base + 0.2 * size] };
    at += w;
    return l;
  });
}
const READS = new Set(["Me", "O", "OH", "MeO", "OMe", "MeOH", "H", "C", "Ac", "AcO", "OAc", "PMB", "PMBO", "OPMB"]);
const reads = (l: string) => READS.has(l);
const figure = (paths: FigurePath[], letters: FigureLetter[]): FigureDrawn => ({ paths, letters, pictures: [] });
const labelsOf = (d: FigureDrawn) => readFigure(d, reads).atoms.map((a) => a.label ?? a.el ?? "").filter(Boolean).sort();

/** The word MeO: M at 100, e at gap `g1`, O at gap `g2`; the bonds given by where they end (pointing at the word). */
const meo = (g1: number, g2: number, o: { size?: number; up?: number }, bonds: P[][]): FigureDrawn =>
  figure(
    bonds.map(([a, b]) => line(a, b)),
    word([{ c: "M", gap: 0 }, { c: "e", gap: g1 }, { c: "O", gap: g2, ...o }], 100, 100),
  );
// (the word spans 100 to about 121; bonds: one from the left into the M, others from the right into the O)
const intoM: P[] = [[84, 96], [97, 96]];
const intoO: P[][] = [[[135, 90], [123.5, 95]], [[135, 104], [123.5, 99]]];
const intoOOne: P[] = [[135, 94], [123.5, 96.5]];
// (and the rest of the structure: a ring's bond, so that the figure has its own bond length)
const ringBonds = (): FigurePath[] => Array.from({ length: 6 }, (_, i): FigurePath => line([200 + 14.3 * Math.cos((Math.PI / 3) * i), 200 + 14.3 * Math.sin((Math.PI / 3) * i)], [200 + 14.3 * Math.cos((Math.PI / 3) * (i + 1)), 200 + 14.3 * Math.sin((Math.PI / 3) * (i + 1))]));

describe("two labels set close, read as one word or two", () => {
  it("is one label, MeO, where the gaps are a label's own (0.11, 0.09), the O on the line, one bond ending at the O", () => {
    const d = meo(0.11, 0.09, { up: 0.014 }, [intoOOne]);
    expect(labelsOf({ ...d, paths: [...d.paths, ...ringBonds()] })).toContain("MeO");
  });

  it("is two atoms, Me and O, where bonds come to both - one into the M, two into the O - at a gap of 0.15 and the O raised 0.09", () => {
    const d = meo(0.11, 0.15, { up: 0.09 }, [intoM, ...intoO]);
    const labels = labelsOf({ ...d, paths: [...d.paths, ...ringBonds()] });
    expect(labels).toContain("Me");
    expect(labels).toContain("O");
    expect(labels).not.toContain("MeO");
  });

  it("is two atoms at a gap of 0.20, the same, and at a gap of 0.08 with the O at 0.87 of the size", () => {
    for (const d of [meo(0.11, 0.2, { up: 0.09 }, [intoM, ...intoO]), meo(0.11, 0.08, { size: 0.87 }, [intoM, ...intoO])]) {
      const labels = labelsOf({ ...d, paths: [...d.paths, ...ringBonds()] });
      expect(labels).toContain("Me");
      expect(labels).toContain("O");
      expect(labels).not.toContain("MeO");
    }
  });

  it("is ONE label where the size or the line differs but only one bond comes to the word: no bond of its own for the other piece, no cut", () => {
    for (const o of [{ size: 0.87 }, { up: 0.09 }]) {
      const d = meo(0.11, 0.09, o, [intoM]);
      const labels = labelsOf({ ...d, paths: [...d.paths, ...ringBonds()] });
      expect(labels).toContain("MeO");
    }
  });

  it("is two atoms, with nothing said, where the size or the line shows it too: an O at 0.87 of the size, a bond to each", () => {
    const d = meo(0.11, 0.08, { size: 0.87 }, [intoM, ...intoO]);
    const atoms = readFigure({ ...d, paths: [...d.paths, ...ringBonds()] }, reads).atoms.filter((a) => a.label === "Me" || a.label === "O");
    expect(atoms).toHaveLength(2);
    expect(atoms.every((a) => !a.unsure)).toBe(true);
  });

  it("says, where only the bonds cut the word - one size on one line - that it was cut so", () => {
    const d = meo(0.11, 0.15, { up: 0.014 }, [intoM, ...intoO]);
    const read = readFigure({ ...d, paths: [...d.paths, ...ringBonds()] }, reads);
    const atoms = read.atoms.filter((a) => a.label === "Me" || a.label === "O");
    expect(atoms).toHaveLength(2);
    expect(atoms.every((a) => a.unsure?.some((t) => t.startsWith("Two labels")))).toBe(true);
  });

  it("is one word with no bond at all, one size on one line, whatever the gap up to the word's own limit: MeOH as a solvent's name", () => {
    const parts = [{ c: "M", gap: 0 }, { c: "e", gap: 0.11 }, { c: "O", gap: 0.13 }, { c: "H", gap: 0.13 }];
    const d = figure(ringBonds(), word(parts, 100, 100));
    expect(labelsOf(d)).not.toContain("Me");
  });

  it("keeps a lone H a part of its atom, and the NH of a chain - a bond at each end - one label", () => {
    const d = figure([line([84, 96], [97, 96]), line([135, 96], [123, 96]), ...ringBonds()], word([{ c: "O", gap: 0 }, { c: "H", gap: 0.1 }, { c: "H", gap: 0.1 }], 100, 100));
    expect(labelsOf(d).some((l) => l === "O" || l === "H")).toBe(false);
  });

  it("is one label, unmarked, for an acetate and a PMB ether on their one bond - AcO, PMBO - and a bond that merely comes near the group's letters", () => {
    const acO = word([{ c: "A", gap: 0 }, { c: "c", gap: 0.1 }, { c: "O", gap: 0.1 }], 100, 100);
    const pmbO = word([{ c: "P", gap: 0 }, { c: "M", gap: 0.1 }, { c: "B", gap: 0.1 }, { c: "O", gap: 0.1 }], 100, 100);
    for (const letters of [acO, pmbO]) {
      // (the one bond: into the O from the right; another bond's end pointing at the group's letters from far off - beyond a bond's reach)
      const end = letters[letters.length - 1].box[2];
      const one = figure([line([end + 14, 96], [end + 3, 96]), line([84, 70], [96, 94]), ...ringBonds()], letters);
      const read = readFigure(one, (l) => reads(l) || l === "Ac" || l === "PMB");
      const atoms = read.atoms.filter((a) => /O$/.test(a.label ?? "") || a.label === "O" || a.label === "Ac" || a.label === "PMB");
      expect(atoms.map((a) => a.label)).toEqual(expect.not.arrayContaining(["O"]));
      expect(read.atoms.every((a) => !a.unsure?.some((t) => t.startsWith("Two labels")))).toBe(true);
    }
  });

  it("is two atoms for a Me and a ring's O, each with its own bond end", () => {
    const d = meo(0.11, 0.15, { up: 0.014 }, [intoM, ...intoO]);
    const labels = labelsOf({ ...d, paths: [...d.paths, ...ringBonds()] });
    expect(labels).toEqual(expect.arrayContaining(["Me", "O"]));
  });
});
