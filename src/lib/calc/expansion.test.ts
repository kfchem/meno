import { describe, expect, it } from "vitest";
import { blockStraying, drawnOrbital, expansionOf, primitiveCoefficients, STRAYING_MOST, type Expansion } from "./expansion";
import { floatsOf } from "./results";

/** An s and a px primitive on one centre, and an s on another 1.4 bohr away: a function each, normalised, and an orbital each. */
const a = 0.8;
const nS = (2 * a / Math.PI) ** 0.75;
const nP = nS * 2 * Math.sqrt(a);
const e: Expansion = {
  nuclei: [0, 0, 0, 0, 0, 1.4],
  centres: [0, 0, 1],
  powers: [
    [0, 0, 0],
    [1, 0, 0],
    [0, 0, 0],
  ],
  exponents: [a, a, a],
  functions: [
    { primitives: [0], coefficients: [nS] },
    { primitives: [1], coefficients: [nP] },
    { primitives: [2], coefficients: [nS] },
  ],
  orbitals: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
};

describe("a wavefunction a reader gives whole", () => {
  it("is taken where it reads as the form says", () => {
    expect(expansionOf({ expansion: e })).toEqual(e);
    const bad = [
      { ...e, powers: [[0, 0, 0], [1, 0], [0, 0, 0]] },
      // (an i: past h, as far as Meno works primitives out)
      { ...e, powers: [[0, 0, 0], [6, 0, 0], [0, 0, 0]] },
      { ...e, powers: [[0, 0, 0], [3, 2, 1], [0, 0, 0]] },
      { ...e, centres: [0, 2, 1] },
      { ...e, exponents: [a, 0, a] },
      { ...e, functions: [{ primitives: [0, 3], coefficients: [1, 1] }, ...e.functions.slice(1)] },
      { ...e, functions: [{ primitives: [0], coefficients: [1, 1] }, ...e.functions.slice(1)] },
      { ...e, orbitals: [[1, 2]] },
      { ...e, orbitals: [] },
      { ...e, nuclei: [0] },
    ];
    for (const b of bad) expect(expansionOf({ expansion: b })).toBeUndefined();
    expect(expansionOf(e)).toBeUndefined();
  });

  it("has orbitals over its functions, and so over its primitives", () => {
    const shared: Expansion = { ...e, functions: [{ primitives: [0, 2], coefficients: [2, 3] }, ...e.functions.slice(1)], orbitals: [[0.5, 0.25, -1]] };
    expect(primitiveCoefficients(shared, 0)).toEqual([1, 0.25 * nP, 1.5 - nS]);
  });

  it("has orbitals orthonormal where its primitives' overlaps say so: an s and a p on one centre", () => {
    expect(blockStraying(e, [0, 1])).toBeLessThan(1e-12);
  });

  it("works its overlaps out from the primitives themselves: two s on centres apart overlap as e^(-ab/(a+b) R^2) says", () => {
    const want = nS * nS * (Math.PI / (2 * a)) ** 1.5 * Math.exp(-(a / 2) * 1.4 ** 2);
    expect(blockStraying(e, [0, 2])).toBeCloseTo(want, 12);
  });

  it("is found not as given where a normalisation or an order is wrong, and no orbital of it is drawn, saying why", () => {
    const wrongNorm = { ...e, orbitals: [e.orbitals[0], [0, 2, 0], e.orbitals[2]] };
    expect(blockStraying(wrongNorm, [0, 1])).toBeCloseTo(3, 9);
    // (its p called a d: its overlap with the s no longer naught, its own not one)
    const wrongType: Expansion = { ...e, powers: [[0, 0, 0], [2, 0, 0], [0, 0, 0]] };
    expect(blockStraying(wrongType, [0, 1])).toBeGreaterThan(STRAYING_MOST);
    expect(() => drawnOrbital(wrongNorm, 1, [0, 1])).toThrow(/not orthonormal as given/);
  });

  it("is drawn orbital by orbital, the orbitals offered checked first, on the grid Meno gives", () => {
    const grid = { origin: [-1, -1, -1] as [number, number, number], axes: [[0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5]] as [[number, number, number], [number, number, number], [number, number, number]], counts: [5, 5, 5] as [number, number, number] };
    const g = drawnOrbital(e, 1, [0, 1], grid);
    expect(g).toMatchObject({ origin: grid.origin, counts: [5, 5, 5], signed: true, quantity: "orbital" });
    const v = floatsOf(g.values);
    // (a px: naught on the plane x = 0, the middle of the grid's first axis, and of opposite signs either side)
    expect(v[2 * 25 + 2 * 5 + 2]).toBeCloseTo(0, 9);
    expect(Math.sign(v[1 * 25 + 2 * 5 + 2])).toBe(-Math.sign(v[3 * 25 + 2 * 5 + 2]));
    expect(() => drawnOrbital(e, 5, [0, 1])).toThrow(/no orbital 6/);
  });
});
