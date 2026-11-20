/**
 * Beside molWriterMetalValence.test.ts (its `valences` copied): what that file leaves unheld of the valence a MOL file says of a P, S or Se
 * on a metal - one whose hydrogen count is set keeps it; the hydrogens the core counts are in the valence (a phosphanide's PH, a hydrosulfide's
 * SH); and the atom's charge is counted (an S- on a metal has the one valence of its one bond).
 */
import { describe, expect, it } from "vitest";
import { writeMolfile, writeMolfile3d, type WriterModel } from "./molWriter";

/** Each atom's V3000 line, by its element and what it says of its valence ("" where it says none). */
const valences = (molfile: string) =>
  molfile
    .split("\n")
    .filter((l) => /^M {2}V30 \d+ [A-Z][a-z]? /.test(l) && !/BEGIN|END|COUNTS/.test(l))
    .map((l) => `${l.split(" ")[4]}${/VAL=(-?\d+)/.exec(l)?.[1] ?? ""}`);

/** An X bonded to a Pd, and to the carbons given (single bonds), X at the first place. */
function on(el: string, carbons: number, extra: Record<string, unknown> = {}): WriterModel {
  const atoms: WriterModel["atoms"] = [
    { id: 1, el, x: 0, y: 0, ...extra },
    { id: 2, el: "Pd", x: 1.5, y: 0 },
  ];
  const bonds: WriterModel["bonds"] = [{ a: 1, b: 2, order: 1 }];
  for (let i = 0; i < carbons; i++) {
    atoms.push({ id: 3 + i, el: "C", x: -1.5, y: i - 1 });
    bonds.push({ a: 1, b: 3 + i, order: 1 });
  }
  return { atoms, bonds };
}
const ofX = (m: WriterModel, el: string) => valences(writeMolfile(m, { version: "V3000" })).filter((x) => x.startsWith(el) && !x.startsWith("Pd"));

describe("a P, S or Se bonded to a metal, as a MOL file says its valence", () => {
  it("leaves one whose hydrogen count is set as it is: no valence of its own over the count", () => {
    expect(ofX(on("P", 3, { hCount: 1 }), "P")).toEqual(["P"]);
    expect(ofX(on("S", 2, { hCount: 0 }), "S")).toEqual(["S"]);
  });

  it("counts the hydrogens the core gives it into the valence: a phosphanide's P-H and a hydrosulfide's S-H", () => {
    // (one carbon and the metal: P(III) takes an H, 1 + 1 + 1; the metal alone on an S: its one bond and an H, 1 + 1)
    expect(ofX(on("P", 1), "P")).toEqual(["P3"]);
    expect(ofX(on("S", 0), "S")).toEqual(["S2"]);
    // (two carbons and the metal: no H, the three bonds; four carbons and the metal: the P(V) step the four reach, 5)
    expect(ofX(on("P", 2), "P")).toEqual(["P3"]);
    expect(ofX(on("P", 4), "P")).toEqual(["P5"]);
  });

  it("counts the atom's charge: an S- on a metal has the one valence of its one bond", () => {
    expect(ofX(on("S", 0, { charge: -1 }), "S")).toEqual(["S1"]);
  });

  it("in 3D, says it of a P whichever way its bond to the metal is listed", () => {
    const atoms = [
      { el: "P", x: 0, y: 0, z: 0 },
      { el: "Pd", x: 2.3, y: 0, z: 0 },
      { el: "C", x: -0.8, y: 1.5, z: 0 },
      { el: "C", x: -0.8, y: -1.5, z: 0 },
      { el: "C", x: -0.8, y: 0, z: 1.5 },
    ];
    const bonds = [1, 2, 3, 4].map((j) => ({ a1: 0, a2: j, order: 1 }));
    expect(valences(writeMolfile3d(atoms, bonds, { version: "V3000" })).filter((x) => /\d/.test(x))).toEqual(["P4"]);
    expect(valences(writeMolfile3d(atoms, bonds.map((b) => ({ a1: b.a2, a2: b.a1, order: b.order })), { version: "V3000" })).filter((x) => /\d/.test(x))).toEqual(["P4"]);
  });

  it("in 3D, says it of no other element on a metal, and of a P on its coordination bond (type 9) by its own three bonds", () => {
    const atoms = [
      { el: "Pd", x: 0, y: 0, z: 0 },
      { el: "N", x: 2, y: 0, z: 0 },
      { el: "O", x: -2, y: 0, z: 0 },
      { el: "C", x: 0, y: 2, z: 0 },
      { el: "Cl", x: 0, y: -2, z: 0 },
    ];
    const bonds = [1, 2, 3, 4].map((j) => ({ a1: 0, a2: j, order: 1 }));
    expect(valences(writeMolfile3d(atoms, bonds, { version: "V3000" })).filter((x) => /\d/.test(x))).toEqual([]);
    const phosphine = [
      { el: "Pd", x: 0, y: 0, z: 0 },
      { el: "P", x: 2.3, y: 0, z: 0 },
      { el: "C", x: 3, y: 1.5, z: 0 },
      { el: "C", x: 3, y: -1.5, z: 0 },
      { el: "C", x: 3, y: 0, z: 1.5 },
    ];
    const coordination = [{ a1: 0, a2: 1, order: 9 }, ...[2, 3, 4].map((j) => ({ a1: 1, a2: j, order: 1 }))];
    expect(valences(writeMolfile3d(phosphine, coordination, { version: "V3000" })).filter((x) => /\d/.test(x))).toEqual(["P3"]);
  });
});

