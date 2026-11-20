/**
 * A Fischer projection's column, held at its edges (found in review): the line from its topmost centre to its lowest within the reader's
 * 10 degrees of upright, asked of two crosses as of more; the lean's edges where the crosses are not adjacent; and each centre within a
 * quarter of a bond of that line.
 */
import { describe, expect, it } from "vitest";
import type { Atom, Bond, Model } from "../store/types";
import { fischerCentres } from "./fischer";

/**
 * A Fischer projection drawn as a chemist draws one, the model's y up: a
 * column of centres a bond apart, each a cross of plain bonds; `rows`, from
 * the top, each centre's left and right groups; `top` and `foot`, the
 * chain's ends. A group is an element (an atom of its own) or "CHO",
 * "COOH", "CH2OH", "CH3", "NH2", "OH" (built of atoms). Then turned by
 * `turn` radians, if asked.
 */
function fischer(top: string, rows: [string, string][], foot: string, turn = 0): Model {
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  let id = 0;
  const atom = (el: string, x: number, y: number) => {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    atoms.push({ id: ++id, el, x: x * c - y * s, y: x * s + y * c, r: 0.9 } as Atom);
    return id;
  };
  const bond = (a: number, b: number, order: 1 | 2 = 1) => bonds.push({ id: 1000 + bonds.length, a, b, order } as Bond);
  // (a group from atom `at`, its first atom at `x`, `y` and the rest on out the same way, `dx`, `dy` a step)
  const group = (g: string, at: number, x: number, y: number, dx: number, dy: number) => {
    const first = (el: string) => {
      const n = atom(el, x, y);
      bond(at, n);
      return n;
    };
    switch (g) {
      case "CHO": {
        const c = first("C");
        bond(c, atom("O", x + dx * 0.9 - dy * 0.5, y + dy * 0.9 + dx * 0.5), 2);
        return;
      }
      case "COOH": {
        const c = first("C");
        bond(c, atom("O", x + dx * 0.9 - dy * 0.5, y + dy * 0.9 + dx * 0.5), 2);
        bond(c, atom("O", x + dx * 0.9 + dy * 0.5, y + dy * 0.9 - dx * 0.5));
        return;
      }
      case "CH2OH": {
        const c = first("C");
        bond(c, atom("O", x + dx, y + dy));
        return;
      }
      case "CH3":
        first("C");
        return;
      case "NH2":
        first("N");
        return;
      case "OH":
        first("O");
        return;
      default:
        first(g);
    }
  };
  // (the column, from the top down: y falls a bond a row)
  const centres = rows.map((_, k) => atom("C", 0, -k));
  centres.forEach((c, k) => k && bond(centres[k - 1], c));
  group(top, centres[0], 0, 1, 0, 1);
  group(foot, centres[centres.length - 1], 0, -rows.length, 0, -1);
  rows.forEach(([left, right], k) => {
    group(left, centres[k], -1, -k, -1, 0);
    group(right, centres[k], 1, -k, 1, 0);
  });
  return { atoms, bonds } as Model;
}

const A = (id: number, el: string, x: number, y: number) => ({ id, el, x, y, r: 0.9 }) as Atom;
const B = (id: number, a: number, b: number, order = 1, extra: Partial<Bond> = {}) => ({ id, a, b, order, ...extra }) as Bond;

/**
 * Two crosses a chain of two atoms apart - the upper cross A at the origin (Cl up, F left, Br right), a vertical bond down to P, a bond across to
 * Q, a vertical bond down from Q to the lower cross B (O left, N right, I below) - the line from A to B leaning `deg` degrees to the right (left if
 * negative): B at x = 2 tan(deg), two bonds below A.
 */
function apart(deg: number): Model {
  const x = 2 * Math.tan((deg * Math.PI) / 180);
  return {
    atoms: [A(1, "C", 0, 0), A(2, "Cl", 0, 1), A(3, "F", -1, 0), A(4, "Br", 1, 0), A(5, "C", 0, -1), A(6, "C", x, -1), A(7, "C", x, -2), A(8, "O", x - 1, -2), A(9, "N", x + 1, -2), A(10, "I", x, -3)],
    bonds: [B(11, 1, 2), B(12, 1, 3), B(13, 1, 4), B(14, 1, 5), B(15, 5, 6), B(16, 6, 7), B(17, 7, 8), B(18, 7, 9), B(19, 7, 10)],
  } as Model;
}

describe("a column of two crosses, however they are joined", () => {
  it("a lean of 8 degrees either way is taken (two crosses), of 15 either way is not", () => {
    for (const s of [1, -1]) {
      expect(fischerCentres(apart(8 * s), 1), `${8 * s}`).toHaveLength(2);
      expect(fischerCentres(apart(15 * s), 1), `${15 * s}`).toEqual([]);
    }
    expect(fischerCentres(apart(0), 1)).toHaveLength(2);
  });

  it("two crosses side by side - tartaric acid's chain turned a quarter - are not one above another: none", () => {
    // (the same two crosses, the whole drawing turned 90 degrees: each cross still on the axes, the line between them level)
    const m = apart(0);
    const turned = { ...m, atoms: m.atoms.map((a) => ({ ...a, x: -a.y, y: a.x })) };
    expect(fischerCentres(turned, 1)).toEqual([]);
  });
});

/** Five crosses bulging sideways: centre k shifted `bulge` x [0, 1, 2, 1, 0] - each bond leans atan(bulge) (9.6 degrees at 0.17, inside the reader's 10), the line from the top to the foot upright. */
const banana = (bulge: number): Model => {
  const m = fischer("CHO", [["H", "OH"], ["OH", "H"], ["H", "OH"], ["OH", "H"], ["H", "OH"]], "CH2OH");
  const shift = (y: number) => bulge * [0, 1, 2, 1, 0][Math.min(4, Math.max(0, Math.round(-y)))];
  return { ...m, atoms: m.atoms.map((a) => ({ ...a, x: a.x + shift(a.y) })) };
};

describe("each centre within a quarter of a bond of the line from the topmost to the lowest", () => {
  it("a column bulging 0.2 of a bond is taken (five crosses); bulging 0.34, not (each bond still within the reader's 10 degrees)", () => {
    expect(fischerCentres(banana(0.1), 1)).toHaveLength(5);
    expect(fischerCentres(banana(0.17), 1)).toEqual([]);
  });
});
