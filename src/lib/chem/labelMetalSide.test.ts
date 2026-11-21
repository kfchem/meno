// Held beside layout2d.test.ts: a P's or an S's label writes the H the page counts whichever way the bond to a metal is written - the
// metal first or the P first - and a phosphine on a metal by a dative bond writes none either way.
import { describe, expect, it } from "vitest";
import { buildTextLabels, type Atom, type Bond } from "./layout2d";
import { acsWorldOptions } from "./acs";

const opts = () => acsWorldOptions([], [], { units: "world" });
const L = 1.5;
/** A P of three methyls, and a Pd on the stated side, the P-Pd bond written metal first or P first. */
const phosphineOn = (metalFirst: boolean, kind: Partial<Bond> = {}) => {
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 0, el: "P" },
    { id: 2, x: 0, y: -L, el: "Pd" },
    { id: 3, x: L, y: 0, el: "C" },
    { id: 4, x: -L, y: 0, el: "C" },
    { id: 5, x: 0, y: L, el: "C" },
  ];
  const bonds: Bond[] = [
    metalFirst ? { a1: 1, a2: 0, order: 1, ...kind } : { a1: 0, a2: 1, order: 1, ...kind },
    { a1: 0, a2: 2, order: 1 },
    { a1: 0, a2: 3, order: 1 },
    { a1: 0, a2: 4, order: 1 },
  ];
  return buildTextLabels(atoms, opts(), bonds).find((l) => l.atom === 0)?.text;
};

describe("a phosphine on a metal, its bond to the metal written either way round", () => {
  it("writes no H by a plain bond: the metal first or the P first", () => {
    expect(phosphineOn(false)).toBe("P");
    expect(phosphineOn(true)).toBe("P");
  });

  it("writes no H by a dative bond either way round", () => {
    expect(phosphineOn(false, { dative: true })).toBe("P");
    expect(phosphineOn(true, { dative: true })).toBe("P");
  });
});
