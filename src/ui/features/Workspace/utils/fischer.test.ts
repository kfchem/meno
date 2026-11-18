import { describe, expect, it } from "vitest";
import type { Atom, Bond, Model } from "../store/types";
import { fischerCentres, fischerWedges } from "./fischer";
import { identityInputOf } from "../chem/identityOf";
import { cipLabels } from "../../../../lib/chem/cip";
import { identityText } from "../../../../lib/chem/identity";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";

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

/** What the reader reads at each centre once the command has written its wedges, from the top. */
function readAfter(m: Model): (string | null)[] {
  const centres = fischerCentres(m, m.atoms[0].id);
  const patches = new Map(fischerWedges(centres));
  const after: Model = { ...m, bonds: m.bonds.map((b) => (patches.has(b.id) ? { ...b, ...patches.get(b.id) } : b)) };
  const { input } = identityInputOf(after);
  const labels = cipLabels(input).centres;
  const index = new Map(after.atoms.map((a, i) => [a.id, i]));
  return centres
    .map((c) => after.atoms[index.get(c.atom)!])
    .sort((p, q) => q.y - p.y)
    .map((a) => {
      const l = labels.get(index.get(a.id)!);
      return l && "label" in l ? l.label : null;
    });
}

describe("a structure drawn as a Fischer projection, read so on the chemist's word", () => {
  it("D-glyceraldehyde (CHO up, OH right): R", () => {
    expect(readAfter(fischer("CHO", [["H", "OH"]], "CH2OH"))).toEqual(["R"]);
  });

  it("L-alanine (COOH up, NH2 left): S", () => {
    expect(readAfter(fischer("COOH", [["NH2", "H"]], "CH3"))).toEqual(["S"]);
  });

  it("D-glucose's open chain, four crosses: 2R, 3S, 4R, 5R", () => {
    const m = fischer(
      "CHO",
      [
        ["H", "OH"],
        ["OH", "H"],
        ["H", "OH"],
        ["H", "OH"],
      ],
      "CH2OH",
    );
    expect(readAfter(m)).toEqual(["R", "S", "R", "R"]);
  });

  it("(2R,3R)-tartaric acid: COOH up, OH right at C-2 and left at C-3; left and right swapped in a row, it is not", () => {
    expect(
      readAfter(
        fischer(
          "COOH",
          [
            ["H", "OH"],
            ["OH", "H"],
          ],
          "COOH",
        ),
      ),
    ).toEqual(["R", "R"]);
    expect(
      readAfter(
        fischer(
          "COOH",
          [
            ["OH", "H"],
            ["OH", "H"],
          ],
          "COOH",
        ),
      ),
    ).not.toEqual(["R", "R"]);
  });

  it("meso-tartaric acid is one identity with its mirror writing (both OH left)", () => {
    const written = (rows: [string, string][]) => {
      const m = fischer("COOH", rows, "COOH");
      const patches = new Map(fischerWedges(fischerCentres(m, m.atoms[0].id)));
      return identityText(identityInputOf({ ...m, bonds: m.bonds.map((b) => (patches.has(b.id) ? { ...b, ...patches.get(b.id) } : b)) }).input);
    };
    expect(
      written([
        ["H", "OH"],
        ["H", "OH"],
      ]),
    ).toBe(
      written([
        ["OH", "H"],
        ["OH", "H"],
      ]),
    );
  });

  it("meso-tartaric acid, both OH on one side: R and S", () => {
    expect(
      readAfter(
        fischer(
          "COOH",
          [
            ["H", "OH"],
            ["H", "OH"],
          ],
          "COOH",
        ),
      ).sort(),
    ).toEqual(["R", "S"]);
  });

  it("each centre's two level bonds become solid wedges narrow at it, the upright ones kept plain", () => {
    const m = fischer("CHO", [["H", "OH"]], "CH2OH");
    const [c] = fischerCentres(m, m.atoms[0].id);
    const wedges = fischerWedges([c]);
    expect(wedges).toHaveLength(2);
    for (const [id, patch] of wedges) {
      const b = m.bonds.find((x) => x.id === id)!;
      const [p, q] = [m.atoms.find((a) => a.id === b.a)!, m.atoms.find((a) => a.id === b.b)!];
      expect(Math.abs(p.y - q.y)).toBeLessThan(1e-9);
      expect(patch).toEqual({ order: 1, stereo: "up", narrow: c.atom });
    }
  });
});

describe("a centre told only by the configurations about it (CHEM, 11-18: alditols and aldaric acids)", () => {
  const right: [string, string] = ["H", "OH"];
  const left: [string, string] = ["OH", "H"];
  const wedgedText = (m: Model, skip?: number) => {
    const patches = new Map(fischerWedges(fischerCentres(m, m.atoms[0].id).filter((c) => c.atom !== skip)));
    return identityText(identityInputOf({ ...m, bonds: m.bonds.map((b) => (patches.has(b.id) ? { ...b, ...patches.get(b.id) } : b)) }).input);
  };

  it("ribitol and xylitol differ only at C-3: it is taken, read s and r, and their identities differ", () => {
    const ribitol = fischer("CH2OH", [right, right, right], "CH2OH");
    const xylitol = fischer("CH2OH", [right, left, right], "CH2OH");
    expect(readAfter(ribitol)[1]).toBe("s");
    expect(readAfter(xylitol)[1]).toBe("r");
    expect(wedgedText(ribitol)).not.toBe(wedgedText(xylitol));
  });

  it("ribaric and xylaric acid differ only at C-3: read r and s, their identities different", () => {
    const ribaric = fischer("COOH", [right, right, right], "COOH");
    const xylaric = fischer("COOH", [right, left, right], "COOH");
    expect(readAfter(ribaric)[1]).toBe("r");
    expect(readAfter(xylaric)[1]).toBe("s");
    expect(wedgedText(ribaric)).not.toBe(wedgedText(xylaric));
  });

  it("D-arabinitol's C-3 is taken, but no centre: no label, and its identity the same as with it plain", () => {
    const arabinitol = fischer("CH2OH", [left, right, right], "CH2OH");
    const centres = fischerCentres(arabinitol, arabinitol.atoms[0].id);
    expect(centres).toHaveLength(3);
    expect(readAfter(arabinitol)[1]).toBeNull();
    const c3 = arabinitol.atoms.find((a) => Math.abs(a.y + 1) < 1e-9 && Math.abs(a.x) < 1e-9)!.id;
    expect(wedgedText(arabinitol)).toBe(wedgedText(arabinitol, c3));
  });
});

describe("where it is not offered", () => {
  it("a cross turned a quarter off the page's axes: none", () => {
    expect(fischerCentres(fischer("CHO", [["H", "OH"]], "CH2OH", Math.PI / 6), 1)).toEqual([]);
  });

  it("D-glucose's chain turned a quarter - its crosses side by side, not one above another: none", () => {
    const rows: [string, string][] = [
      ["H", "OH"],
      ["OH", "H"],
      ["H", "OH"],
      ["H", "OH"],
    ];
    expect(fischerCentres(fischer("CHO", rows, "CH2OH", Math.PI / 2), 1)).toEqual([]);
  });

  it("a cross turned within the reader's 10 degrees: still one", () => {
    expect(fischerCentres(fischer("CHO", [["H", "OH"]], "CH2OH", (8 * Math.PI) / 180), 1)).toHaveLength(1);
  });

  it("a cross whose groups are not all unlike - two hydrogens - is no centre", () => {
    expect(fischerCentres(fischer("CHO", [["H", "H"]], "CH2OH"), 1)).toEqual([]);
  });

  it("a cross with a wedge of its own already: none", () => {
    const m = fischer("CHO", [["H", "OH"]], "CH2OH");
    const level = m.bonds.find((b) => {
      const [p, q] = [m.atoms.find((a) => a.id === b.a)!, m.atoms.find((a) => a.id === b.b)!];
      return Math.abs(p.y - q.y) < 1e-9 && (p.el === "O" || q.el === "O");
    })!;
    level.stereo = "up";
    expect(fischerCentres(m, 1)).toEqual([]);
  });

  it("a ring atom: none", () => {
    // (a cyclopropane carbon drawn with an F and a Cl as a cross on the axes: its two ring bonds up and down)
    const atoms = [
      { id: 1, el: "C", x: 0, y: 0 },
      { id: 2, el: "C", x: 0, y: 1 },
      { id: 3, el: "C", x: 0, y: -1 },
      { id: 4, el: "F", x: -1, y: 0 },
      { id: 5, el: "Cl", x: 1, y: 0 },
    ] as Atom[];
    const bonds = [
      { id: 11, a: 1, b: 2, order: 1 },
      { id: 12, a: 1, b: 3, order: 1 },
      { id: 13, a: 2, b: 3, order: 1 },
      { id: 14, a: 1, b: 4, order: 1 },
      { id: 15, a: 1, b: 5, order: 1 },
    ] as Bond[];
    expect(fischerCentres({ atoms, bonds } as Model, 1)).toEqual([]);
  });
});

describe("the command, on the page", () => {
  it("writes the wedges as one undo step, and undo takes them back; asked of a structure not so drawn, it does nothing", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    // (D-glyceraldehyde, drawn atom by atom as the cross)
    const c = st().addAtom(0, 0, "C");
    const top = st().addAtom(0, 1, "C");
    const o = st().addAtom(0.8, 1.6, "O");
    const foot = st().addAtom(0, -1, "C");
    const o2 = st().addAtom(0, -2, "O");
    const h = st().addAtom(-1, 0, "H");
    const oh = st().addAtom(1, 0, "O");
    st().addBond(c, top);
    st().addBond(top, o, 2);
    st().addBond(c, foot);
    st().addBond(foot, o2);
    st().addBond(c, h);
    st().addBond(c, oh);
    const before = doc.history().undoDepth;
    expect(st().readFischer(c)).toBe(true);
    expect(doc.history().undoDepth).toBe(before + 1);
    const wedged = () => st().model.bonds.filter((b) => b.stereo === "up").map((b) => [b.narrow, b.a === c ? b.b : b.a].join(":")).sort();
    expect(wedged()).toEqual([`${c}:${h}`, `${c}:${oh}`].sort());
    doc.undo();
    expect(wedged()).toEqual([]);
    // (a chain drawn as a zigzag, apart from it: nothing, and no step)
    const p = st().addAtom(5, 0, "C");
    const q = st().addAtom(5.87, 0.5, "C");
    const r = st().addAtom(6.73, 0, "O");
    st().addBond(p, q);
    st().addBond(q, r);
    const depth = doc.history().undoDepth;
    expect(st().readFischer(q)).toBe(false);
    expect(doc.history().undoDepth).toBe(depth);
  });
});
