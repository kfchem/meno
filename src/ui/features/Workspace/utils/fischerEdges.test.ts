/**
 * The edges of the rules of a Fischer projection's crosses (found in review): how far a column may lean from upright (the reader's 10
 * degrees, however many crosses it has, and either way), the reader's 10 degrees for a cross (not 20), a bond that is bold, hashed, dative or double, a cross of three
 * on the axes and a fourth off them (each of the four), five bonds, a ring atom whose ring neighbours are unlike (the earlier ring test passes by its
 * neighbours being alike, so it does not hold the ring check), a pseudo-asymmetric middle with one arm holding no cross, and a CH2 in the column.
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
/** The column sheared sideways by `dx` a row: level bonds stay level, each chain bond leans atan(dx) - so the centres drift 3 x dx over four crosses. */
const sheared = (dx: number): Model => {
  const m = fischer("CHO", [["H", "OH"], ["OH", "H"], ["H", "OH"], ["H", "OH"]], "CH2OH");
  return { ...m, atoms: m.atoms.map((a) => ({ ...a, x: a.x - dx * a.y })) };
};
/** A centre of four different atoms on the axes: F right, Cl left, Br up, I down - and `moved` (right, left, up, down) turned 45 degrees off it. */
const four = (moved?: "right" | "left" | "up" | "down"): Model => {
  const ways = { right: 0, left: Math.PI, up: Math.PI / 2, down: -Math.PI / 2 };
  const at = (d: keyof typeof ways, el: string, id: number) => {
    const t = ways[d] + (d === moved ? Math.PI / 4 : 0);
    return A(id, el, Math.cos(t), Math.sin(t));
  };
  return { atoms: [A(1, "C", 0, 0), at("right", "F", 2), at("left", "Cl", 3), at("up", "Br", 4), at("down", "I", 5)], bonds: [B(11, 1, 2), B(12, 1, 3), B(13, 1, 4), B(14, 1, 5)] } as Model;
};

describe("how far a column may drift, and the reader's ten degrees", () => {
  it("a column of four crosses leaning 8.5 degrees from upright, either way: taken; 11.3 degrees: not (the reader's 10, however long the column)", () => {
    expect(fischerCentres(sheared(0.15), 1)).toHaveLength(4);
    expect(fischerCentres(sheared(-0.15), 1)).toHaveLength(4);
    expect(fischerCentres(sheared(0.2), 1)).toEqual([]);
    expect(fischerCentres(sheared(-0.2), 1)).toEqual([]);
  });

  it("a cross turned 12 degrees is past the reader's 10: not taken", () => {
    expect(fischerCentres(fischer("CHO", [["H", "OH"]], "CH2OH", (12 * Math.PI) / 180), 1)).toEqual([]);
  });
});

describe("what is a plain bond, and four of them on the axes", () => {
  const level = (m: Model) => m.bonds.find((b) => {
    const [p, q] = [m.atoms.find((a) => a.id === b.a)!, m.atoms.find((a) => a.id === b.b)!];
    return Math.abs(p.y - q.y) < 1e-9 && (p.el === "O" || q.el === "O");
  })!;
  it("a cross with a bold, a hashed, a dashed, a dative or a double bond of its own is not taken", () => {
    const base = () => fischer("CHO", [["H", "OH"]], "CH2OH");
    for (const change of [{ display: "bold" }, { display: "hashed" }, { display: "dashed" }, { dative: true }, { order: 2 }] as Partial<Bond>[]) {
      const m = base();
      Object.assign(level(m), change);
      expect(fischerCentres(m, 1), JSON.stringify(change)).toEqual([]);
    }
    expect(fischerCentres(base(), 1)).toHaveLength(1);
  });

  it("three bonds on the axes and the fourth 45 degrees off, each of the four: none; all four on them: one", () => {
    expect(fischerCentres(four(), 1)).toHaveLength(1);
    for (const d of ["right", "left", "up", "down"] as const) expect(fischerCentres(four(d), 1), d).toEqual([]);
  });

  it("five bonds, four on the axes: none", () => {
    const m = four();
    m.atoms[0].el = "P";
    m.atoms.push(A(6, "H", 0.7, 0.7));
    m.bonds.push(B(15, 1, 6));
    expect(fischerCentres(m, 1)).toEqual([]);
  });

  it("a ring atom whose two ring neighbours are unlike (a square ring up and right, a methyl on one corner), an F left and a Cl down: none", () => {
    const m = {
      atoms: [A(1, "C", 0, 0), A(2, "C", 0, 1), A(3, "C", 1, 1), A(4, "C", 1, 0), A(5, "C", -0.7, 1.7), A(6, "F", -1, 0), A(7, "Cl", 0, -1)],
      bonds: [B(11, 1, 2), B(12, 2, 3), B(13, 3, 4), B(14, 4, 1), B(15, 2, 5), B(16, 1, 6), B(17, 1, 7)],
    } as Model;
    expect(fischerCentres(m, 1)).toEqual([]);
    // (the same atoms with the ring opened - no bond from the third to the fourth - are one centre)
    expect(fischerCentres({ ...m, bonds: m.bonds.filter((b) => b.id !== 13) }, 1)).toHaveLength(1);
  });
});

describe("a centre told by the configurations about it", () => {
  const right: [string, string] = ["H", "OH"];
  it("ribitol with its lowest cross turned off the axes: the middle's lower arm holds no cross, so it is not taken (the upper cross alone)", () => {
    const m = fischer("CH2OH", [right, right, right], "CH2OH");
    // (the third centre's level groups, the H and the OH, turned 30 degrees about it: it is no cross)
    const c = m.atoms.find((a) => Math.abs(a.y + 2) < 1e-9 && Math.abs(a.x) < 1e-9)!;
    const turned = m.atoms.map((a) => {
      if (Math.abs(a.y + 2) > 1e-9 || Math.abs(a.x) < 1e-9) return a;
      const t = (30 * Math.PI) / 180;
      return { ...a, x: c.x + (a.x - c.x) * Math.cos(t), y: c.y + (a.x - c.x) * Math.sin(t) };
    });
    expect(fischerCentres({ ...m, atoms: turned }, m.atoms[0].id)).toHaveLength(1);
  });

  it("a CH2 in the column (two hydrogens beside it, its two arms alike and each holding a taken cross) is no centre: only the two crosses beside it", () => {
    const m = fischer("CH2OH", [right, ["H", "H"], right], "CH2OH");
    expect(fischerCentres(m, m.atoms[0].id)).toHaveLength(2);
  });
});

/** A centre drawn as a plus of four different atoms on the axes: Cl left, Br right, N up, I down. */
const plus = (centre: string): Model =>
  ({ atoms: [A(1, centre, 0, 0), A(2, "Cl", -1, 0), A(3, "Br", 1, 0), A(4, "N", 0, 1), A(5, "I", 0, -1)], bonds: [B(11, 1, 2), B(12, 1, 3), B(13, 1, 4), B(14, 1, 5)] }) as Model;

describe("a metal drawn as a plus is no Fischer projection's centre", () => {
  it("Pt(II) and Pd(II) with four different donors on the axes: none - read as drawn, square planar where it surely is", () => {
    expect(fischerCentres(plus("Pt"), 1)).toEqual([]);
    expect(fischerCentres(plus("Pd"), 1)).toEqual([]);
  });
  it("a carbon of the same four groups is one", () => {
    expect(fischerCentres(plus("C"), 1)).toHaveLength(1);
  });
});

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
