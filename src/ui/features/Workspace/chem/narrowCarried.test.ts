import { describe, expect, it } from "vitest";
import { readMolfile } from "../../../../lib/chem/ctfile";
import { writeMolfile } from "../../../../lib/chem/molWriter";
import { inRow } from "../components/structureDrag";
import { contractToAbbreviation, emptyWorkspaceDocument, expandAbbreviation, replaceDraggedAtomWith } from "../document";
import type { Model } from "../store/types";
import { numberedApart } from "../workflow/run";
import { bondAs } from "../utils/figures";
import { degrees } from "./drawing";

/**
 * A wedge's narrow end goes with its atom wherever atoms are numbered anew
 * (`Bond.narrow`). Each case holds a wedge narrow at its end with FEWER
 * bonds - one the end with more bonds would not give back - so a place that
 * dropped it would be seen: the wedge turned round.
 */

const L = 1.8;

/** A centre C (1) with an O, a C and, wedged narrow at it, an N (4) with no other bond. */
function wedged(): Model {
  return {
    atoms: [
      { id: 1, x: 0, y: 0, r: 0.9, el: "C" },
      { id: 2, x: L, y: 0, r: 0.9, el: "O" },
      { id: 3, x: -L / 2, y: -L, r: 0.9, el: "C" },
      { id: 4, x: -L / 2, y: L, r: 0.9, el: "N" },
    ],
    bonds: [
      { id: 5, a: 1, b: 2, order: 1, stereo: "none" },
      { id: 6, a: 1, b: 3, order: 1, stereo: "none" },
      { id: 7, a: 1, b: 4, order: 1, stereo: "up", narrow: 4 },
    ],
  };
}

/** Each wedge of `m`, narrow at an N with one bond: the end with fewer bonds, as it was drawn. */
function narrowAtTheN(m: Model) {
  const degree = degrees(m.bonds);
  const wedges = m.bonds.filter((b) => b.stereo === "up");
  expect(wedges.length).toBeGreaterThan(0);
  for (const b of wedges) {
    const at = m.atoms.find((a) => a.id === b.narrow);
    expect(at?.el, `bond ${b.id}`).toBe("N");
    expect([b.a, b.b]).toContain(b.narrow);
    expect(degree.get(b.narrow!)).toBe(1);
  }
}

describe("a wedge's narrow end, carried where atoms are numbered anew", () => {
  it("in structures laid in a row", () => {
    narrowAtTheN(inRow([wedged(), wedged()], L));
  });

  it("in structures a workflow step puts on the page", () => {
    narrowAtTheN(numberedApart([wedged(), wedged()]));
  });

  it("where the atom it is narrow at is dropped on another, onto that one", () => {
    const m = wedged();
    m.atoms.push({ id: 9, x: 3 * L, y: 3 * L, r: 0.9, el: "N" });
    const d = replaceDraggedAtomWith({ ...emptyWorkspaceDocument(), model: m, nextId: 10 }, 4, 9);
    const b = d.model.bonds.find((x) => x.id === 7)!;
    expect([b.a, b.b]).toEqual([1, 9]);
    expect(b.narrow).toBe(9);
  });

  it("through a group written as a label and drawn out again", () => {
    // (the whole of it a group on a C (8): its centre the atom it is bound by)
    const m = wedged();
    m.atoms.push({ id: 8, x: 2 * L, y: L, r: 0.9, el: "C" });
    m.bonds.push({ id: 9, a: 8, b: 1, order: 1, stereo: "none" });
    let d = { ...emptyWorkspaceDocument(), model: m, nextId: 20 };
    d = contractToAbbreviation(d, new Set([1, 2, 3, 4]), "R");
    expect(d.model.atoms.find((a) => a.id === 1)?.el).toBe("R");
    d = expandAbbreviation(d, 1);
    narrowAtTheN(d.model);
  });

  it("onto the atom of a group a bond to its label goes to, where the group is bound by more than one", () => {
    // a label (1) between two C, its second bond wedged narrow at it; drawn out as a chain bound by its ends
    const m: Model = {
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "X" },
        { id: 2, x: -L, y: 0, r: 0.9, el: "C" },
        { id: 3, x: L, y: 0, r: 0.9, el: "C" },
      ],
      bonds: [
        { id: 4, a: 2, b: 1, order: 1, stereo: "none" },
        { id: 5, a: 3, b: 1, order: 1, stereo: "up", narrow: 1 },
      ],
    };
    const group = { atoms: [{ el: "C" }, { el: "C" }, { el: "N" }], bonds: [{ a1: 0, a2: 1, order: 1 as const }, { a1: 1, a2: 2, order: 1 as const }], attach: [0, 2] };
    const d = expandAbbreviation({ ...emptyWorkspaceDocument(), model: m, nextId: 10 }, 1, group);
    const b = d.model.bonds.find((x) => x.id === 5)!;
    const end = d.model.atoms.find((a) => a.id === (b.a === 3 ? b.b : b.a))!;
    expect(end.el).toBe("N");
    expect(b.narrow).toBe(end.id);
  });

  it("in a MOL file, a label written out as its group", () => {
    // (a label whose group holds the wedge, narrow at its N: the file's bond from the N)
    const m: Model = {
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "O" },
        {
          id: 2,
          x: L,
          y: 0,
          r: 0.9,
          el: "Grp",
          abbrev: {
            atoms: [
              { el: "C", x: 0, y: 0 },
              { el: "C", x: L, y: 0 },
              { el: "C", x: 0, y: L },
              { el: "N", x: 0, y: -L },
            ],
            bonds: [
              { a1: 0, a2: 1, order: 1 },
              { a1: 0, a2: 2, order: 1 },
              { a1: 0, a2: 3, order: 1, stereo: "up", narrow: 3 },
            ],
            attach: [0],
          },
        },
      ],
      bonds: [{ id: 3, a: 1, b: 2, order: 1, stereo: "none" }],
    };
    const back = readMolfile(writeMolfile(m))!;
    const wedge = back.bonds.find((b) => b.stereo === "up")!;
    // (a MOL file's wedge narrow at its first atom)
    expect(back.atoms[wedge.a1].symbol).toBe("N");
  });

  it("in a figure's note on a bond, kept by which end it is narrow at, not by id: a copy pasted is still the bond the figure read", () => {
    const read = { a: 1, b: 4, order: 1 as const, stereo: "up" as const, narrow: 4 };
    expect(bondAs({ ...read, a: 11, b: 14, narrow: 14 })).toBe(bondAs(read));
    expect(bondAs({ ...read, a: 11, b: 14, narrow: 11 })).not.toBe(bondAs(read));
  });
});
