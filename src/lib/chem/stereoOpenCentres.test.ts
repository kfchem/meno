// Held beside stereoOpen.test.ts: which flagged centres stereoLeft drops by the atom's kind - read from MOL blocks as the page reads them
// (an N+ with no H counted in the block: its H is the valence's), every metal that is no centre element at any count of groups, tin, lead
// and bismuth kept, no atom of another element dropped, and the refusals that turn on a count left to the toolkit.
import { describe, expect, it } from "vitest";
import { v2000 } from "./testdata/v2000";
import { metal } from "./perception/elements";
import { CENTRE_ELEMENTS } from "./perception/stereo/candidates";
import { stereoGraphOf, stereoLeft } from "./stereoOpen";

/** What stereoLeft leaves open when the toolkit flags atom `at` of the block as an unspecified centre. */
const open = (block: string, at: number): number[] => {
  const g = stereoGraphOf([block])!;
  return stereoLeft([{ kind: "centre", at, state: "unspecified" }], g.atoms, g.bonds).atoms;
};
/** An atom `el` (0) bonded singly to `n` carbons. */
const star = (el: string | { el: string; charge: number }, n: number) => v2000([el, ...Array.from({ length: n }, () => "C")], Array.from({ length: n }, (_, i): [number, number, number] => [0, i + 1, 1]));

describe("a centre the toolkit flags, by the atom's kind, read from a MOL block", () => {
  it("is dropped on an N+ with an H the block does not state - its three carbons and the charge leave it one", () => {
    expect(open(star({ el: "N", charge: 1 }, 3), 0)).toEqual([]);
  });

  it("is kept on an N+ of four carbons, which has none, and on a neutral N of four", () => {
    expect(open(star({ el: "N", charge: 1 }, 4), 0)).toEqual([0]);
    expect(open(star("N", 4), 0)).toEqual([0]);
  });

  it("is dropped on every metal that is no centre element, at any count of groups: two, three, four, five, six", () => {
    for (const el of metal) {
      if (CENTRE_ELEMENTS.has(el)) continue;
      for (const n of [2, 3, 4, 5, 6]) expect(open(star(el, n), 0), `${el} with ${n}`).toEqual([]);
    }
  });

  it("is kept on tin, lead and bismuth, the metals that are centres of four", () => {
    for (const el of ["Sn", "Pb", "Bi"]) expect(open(star(el, 4), 0), el).toEqual([0]);
  });

  it("is kept on an atom of any other element, as before: nothing but a metal or an N+ with an H is dropped", () => {
    for (const el of ["B", "C", "Si", "Ge", "P", "As", "Sb", "S", "Se", "Te", "O", "F", "Cl", "Br", "I", "H", "Xe"]) {
      expect(open(star(el, 4), 0), el).toEqual([0]);
    }
  });

  it("leaves the refusals that turn on a count to the toolkit: a P of five groups, flagged, is kept", () => {
    expect(open(star("P", 5), 0)).toEqual([0]);
  });
});
