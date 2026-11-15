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
    // (the orbital drawn is checked too, where the list's offer leaves it out)
    expect(() => drawnOrbital(wrongNorm, 1, [0])).toThrow(/not orthonormal as given/);
    // (overlaps that are no number - coefficients past what a double holds - are not within the bound either)
    const huge: Expansion = { ...e, orbitals: [[1e300, 1e300, 0], [1e300, -1e300, 0], e.orbitals[2]] };
    expect(blockStraying(huge, [0, 1])).toBeNaN();
    expect(() => drawnOrbital(huge, 0, [0, 1])).toThrow(/not orthonormal as given/);
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

/** (2k - 1)!!, 1 for k = 0. */
const odd = (k: number): number => (k <= 0 ? 1 : (2 * k - 1) * odd(k - 1));
/** The norm of x^l y^m z^n e^(-a r^2): one over the square root of its square's integral, (pi/2a)^(3/2) (2l-1)!!(2m-1)!!(2n-1)!! / (4a)^(l+m+n). */
const normOf = ([l, m, n]: [number, number, number], b: number) => 1 / Math.sqrt((Math.PI / (2 * b)) ** 1.5 * (odd(l) * odd(m) * odd(n)) / (4 * b) ** (l + m + n));
/** A wavefunction of the primitives given, each its own function, normalised, and its own orbital. */
function eachAlone(prims: { centre: number; powers: [number, number, number]; a: number }[], nuclei: number[]): Expansion {
  return {
    nuclei,
    centres: prims.map((p) => p.centre),
    powers: prims.map((p) => p.powers),
    exponents: prims.map((p) => p.a),
    functions: prims.map((p, i) => ({ primitives: [i], coefficients: [normOf(p.powers, p.a)] })),
    orbitals: prims.map((_, i) => prims.map((_, j) => (i === j ? 1 : 0))),
  };
}

describe("the primitives' overlaps, worked out by Obara and Saika's recurrence", () => {
  it("are one for each primitive normalised as its integral says - d, f, g and h, of every kind of powers", () => {
    const kinds: [number, number, number][] = [
      [2, 0, 0], [1, 1, 0], [0, 1, 1],
      [3, 0, 0], [2, 1, 0], [1, 1, 1], [0, 2, 1],
      [4, 0, 0], [3, 1, 0], [2, 2, 0], [2, 1, 1], [0, 0, 4],
      [5, 0, 0], [3, 2, 0], [1, 2, 2], [0, 1, 4],
    ];
    for (const [i, powers] of kinds.entries()) {
      const e = eachAlone([{ centre: 0, powers, a: 0.3 + 0.2 * i }], [0.4, -0.2, 0.9]);
      expect(blockStraying(e, [0])).toBeLessThan(1e-12);
    }
  });

  it("are as their integrals say between two of one centre: xx and yy a third, xxyy and xxxx, a d and an s of other exponents", () => {
    const one = eachAlone(
      [
        { centre: 0, powers: [2, 0, 0], a: 0.7 },
        { centre: 0, powers: [0, 2, 0], a: 0.7 },
        { centre: 0, powers: [2, 2, 0], a: 0.7 },
        { centre: 0, powers: [4, 0, 0], a: 0.7 },
        { centre: 0, powers: [0, 0, 0], a: 1.9 },
      ],
      [0, 0, 0],
    );
    expect(blockStraying(one, [0, 1])).toBeCloseTo(1 / 3, 12);
    // (xxyy against xxxx: the integral of x^6 y^2 over those of x^4 y^4 and x^8, their factors of a alike - 5!! 1!! / sqrt(3!! 3!! 7!!))
    const want = (odd(3) * odd(1)) / Math.sqrt(odd(2) * odd(2) * odd(4));
    expect(blockStraying(one, [2, 3])).toBeCloseTo(want, 12);
    // (an xx of 0.7 and an s of 1.9: their product's integral over x is 1/(2p), p = 2.6)
    const p = 0.7 + 1.9;
    const ds = normOf([2, 0, 0], 0.7) * normOf([0, 0, 0], 1.9) * (Math.PI / p) ** 1.5 / (2 * p);
    expect(blockStraying(one, [0, 4])).toBeCloseTo(ds, 12);
  });

  it("are as their integrals say between centres apart, a p's sign and a d's with them: an s on one and a z or zz on the other", () => {
    const [a, b, R] = [0.9, 0.5, 1.3];
    const e = eachAlone(
      [
        { centre: 0, powers: [0, 0, 0], a },
        { centre: 1, powers: [0, 0, 1], a: b },
        { centre: 1, powers: [0, 0, 2], a: b },
      ],
      [0, 0, 0, 0, 0, R],
    );
    const p = a + b;
    const PB = (a * 0 + b * R) / p - R;
    const gauss = (Math.PI / p) ** 1.5 * Math.exp(((-a * b) / p) * R * R);
    const sz = normOf([0, 0, 0], a) * normOf([0, 0, 1], b) * PB * gauss;
    const szz = normOf([0, 0, 0], a) * normOf([0, 0, 2], b) * (PB * PB + 1 / (2 * p)) * gauss;
    expect(blockStraying(e, [0, 2])).toBeCloseTo(Math.abs(szz), 12);
    // (a zzz on the s's centre against an s apart: (PA^3 + 3 PA / 2p) times the Gaussian factor)
    const f = eachAlone([{ centre: 0, powers: [0, 0, 3], a }, { centre: 1, powers: [0, 0, 0], a: b }], [0, 0, 0, 0, 0, R]);
    const PA = (b * R) / p;
    const fs = normOf([0, 0, 3], a) * normOf([0, 0, 0], b) * (PA ** 3 + (3 * PA) / (2 * p)) * gauss;
    expect(blockStraying(f, [0, 1])).toBeCloseTo(Math.abs(fs), 12);
    // (an xx on each centre, the centres apart along z: a d against a d of the other centre)
    const dd = eachAlone([{ centre: 0, powers: [2, 0, 0], a }, { centre: 1, powers: [2, 0, 0], a: b }], [0, 0, 0, 0, 0, R]);
    // (along x both centres sit at 0: S_x = 3/(4p^2), the integral of x^4 e^(-p x^2) over sqrt(pi/p))
    const xx = normOf([2, 0, 0], a) * normOf([2, 0, 0], b) * (3 / (4 * p * p)) * gauss;
    expect(blockStraying(dd, [0, 1])).toBeCloseTo(Math.abs(xx), 12);
    // (the sign: an orbital s + z, unnormalised, has 2 + 2 S as its square)
    const both: Expansion = { ...e, orbitals: [[1, 1, 0]] };
    expect(sz).toBeLessThan(0);
    expect(blockStraying(both, [0])).toBeCloseTo(Math.abs(1 + 2 * sz), 12);
  });
});

describe("the primitives grouped by their centre and exponent", () => {
  it("are grouped wherever they lie in the list - one centre and exponent twice, apart, is one group, and a primitive given twice is counted twice", () => {
    const n = normOf([0, 0, 0], 0.8);
    const np = normOf([1, 0, 0], 0.8);
    // (s, px, then the s again: the orbital s/2 + s/2 + 0 px is the normalised s)
    const twice: Expansion = {
      nuclei: [0, 0, 0],
      centres: [0, 0, 0],
      powers: [[0, 0, 0], [1, 0, 0], [0, 0, 0]],
      exponents: [0.8, 0.8, 0.8],
      functions: [{ primitives: [0, 2], coefficients: [n / 2, n / 2] }, { primitives: [1], coefficients: [np] }],
      orbitals: [[1, 0], [0, 1]],
    };
    expect(blockStraying(twice, [0, 1])).toBeLessThan(1e-12);
    // (two exponents on one centre, given in turn: two groups, overlapping as (2 sqrt(ab)/(a+b))^(3/2))
    const [a, b] = [0.8, 2.4];
    const mixed: Expansion = {
      nuclei: [0, 0, 0],
      centres: [0, 0, 0, 0],
      powers: [[0, 0, 0], [0, 0, 0], [1, 0, 0], [1, 0, 0]],
      exponents: [a, b, a, b],
      functions: [
        { primitives: [0], coefficients: [normOf([0, 0, 0], a)] },
        { primitives: [1], coefficients: [normOf([0, 0, 0], b)] },
        { primitives: [2], coefficients: [normOf([1, 0, 0], a)] },
        { primitives: [3], coefficients: [normOf([1, 0, 0], b)] },
      ],
      orbitals: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]],
    };
    const ss = ((2 * Math.sqrt(a * b)) / (a + b)) ** 1.5;
    expect(blockStraying(mixed, [0, 1])).toBeCloseTo(ss, 12);
    expect(blockStraying(mixed, [2, 3])).toBeCloseTo(ss ** (5 / 3), 12);
    // (an s and a p of other exponents still orthogonal)
    expect(blockStraying(mixed, [0, 3])).toBeLessThan(1e-12);
    // (a contracted s - two exponents - on one centre, a third on the other: each pair as e^(-ab/(a+b) R^2) says)
    const c = 1.5;
    const R = 1.1;
    const three = eachAlone(
      [
        { centre: 0, powers: [0, 0, 0], a },
        { centre: 0, powers: [0, 0, 0], a: b },
        { centre: 1, powers: [0, 0, 0], a: c },
      ],
      [0, 0, 0, 0, R, 0],
    );
    const pair = (x: number, y: number, r: number) => ((2 * Math.sqrt(x * y)) / (x + y)) ** 1.5 * Math.exp(((-x * y) / (x + y)) * r * r);
    expect(blockStraying(three, [0, 1])).toBeCloseTo(pair(a, b, 0), 12);
    expect(blockStraying(three, [0, 2])).toBeCloseTo(pair(a, c, R), 12);
    expect(blockStraying(three, [1, 2])).toBeCloseTo(pair(b, c, R), 12);
  });
});
