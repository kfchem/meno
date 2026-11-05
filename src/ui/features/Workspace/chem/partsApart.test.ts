import { describe, expect, it } from "vitest";
import { partsOf, partsSideBySide } from "./partsApart";

describe("a structure of more than one part, made in 3D", () => {
  // (sodium acetate as a search gives it: Na+ 0, the acetate's C 1, C 2, O 3, O 4 - both parts at the origin, on one another)
  const atoms = [{ el: "Na" }, { el: "C" }, { el: "C" }, { el: "O" }, { el: "O" }];
  const bonds = [{ a1: 1, a2: 2 }, { a1: 2, a2: 3 }, { a1: 2, a2: 4 }];
  const acetate = [-1.5, 0, 0, 0, 0, 0, 0.7, 1.1, 0, 0.7, -1.1, 0];

  it("is in its parts, largest first - an eta ring's with its metal's", () => {
    expect(partsOf(atoms, bonds)).toEqual([[1, 2, 3, 4], [0]]);
    // (a ring bound through all its atoms, a star apart from it: one part with its metal)
    expect(partsOf([{ el: "Fe" }, { el: "C" }, { el: "C" }, { el: "C" }, { el: "*" }], [{ a1: 1, a2: 2 }, { a1: 2, a2: 3 }, { a1: 0, a2: 4 }], [{ metal: 0, atoms: [1, 2, 3] }])).toEqual([[0, 1, 2, 3, 4]]);
  });

  it("has its parts set side by side along x, largest first, the facing atoms their van der Waals contact apart, and says so", () => {
    const made = { atoms, frames: [[0, 0, 0, ...acetate]], how: [{ label: "Kept", text: "1 of 1 embedded (10 sought)" }, { label: "Made by", text: "Sketchkit" }] };
    const out = partsSideBySide(made, partsOf(atoms, bonds));
    const f = out.frames[0];
    // (the acetate's furthest O at x 0.7 + 1.5, the sodium 2.5 beyond: x 0.7 + 1.5 + 2.5)
    expect(f[0]).toBeCloseTo(0.7 + 1.5 + 2.5, 4);
    expect(f.slice(3)).toEqual(acetate);
    expect(out.how).toEqual([{ label: "Parts", text: "2, side by side: where they lie against each other is not modelled" }, ...made.how]);
  });

  it("turns each conformer's parts as the first conformer's are", () => {
    // (the second conformer's acetate turned half round about z: laid back over the first's)
    const turned = [-acetate[0], -acetate[1], 0, 0, 0, 0, -0.7, -1.1, 0, -0.7, 1.1, 0];
    const out = partsSideBySide({ atoms, frames: [[0, 0, 0, ...acetate], [0, 0, 0, ...turned]] }, partsOf(atoms, bonds));
    out.frames[1].slice(3).forEach((v, i) => expect(v).toBeCloseTo(acetate[i], 3));
    // (one part: as it came)
    const one = { atoms: atoms.slice(1), frames: [acetate] };
    expect(partsSideBySide(one, partsOf(one.atoms, [{ a1: 0, a2: 1 }, { a1: 1, a2: 2 }, { a1: 1, a2: 3 }]))).toBe(one);
  });
});
