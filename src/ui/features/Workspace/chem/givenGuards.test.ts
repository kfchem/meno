import { describe, expect, it } from "vitest";
import { MENO } from "../../../../lib/chem/style";
import { laidOut } from "./cleanUp";
import { stereoAgainst, stereoOf, type StereoShown } from "./engineLayout";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { centreFrom, plainPicture } from "./testdata/givenPictures";

/**
 * What is given beside a plugin's drawing, and nothing more (backlog 106 B): the drawing laid out states every unit given, each as given,
 * and none more; a centre the field names is given only where it is one of the drawing's and Meno's rules hold one there.
 */

describe("the check after the layout: what was given, and none more (stereoAgainst)", () => {
  const shown = (centres: number[], doubles: [string, [number, number], boolean][] = [], axes: [string, number][] = []): StereoShown => ({
    centres: new Map(centres.map((c) => [c, { neighbours: [c + 1, c + 2, c + 3, -1], volume: 1 as const }])),
    doubles: new Map(doubles.map(([k, refs, cis]) => [k, { refs, cis }])),
    axes: new Map(axes),
  });

  it("finds a centre, a double bond or an axis shown that was not given: gained", () => {
    expect(stereoAgainst(shown([1]), shown([1]))).toBeNull();
    expect(stereoAgainst(shown([1]), shown([1, 10]))).toBe("gained");
    expect(stereoAgainst(shown([1]), shown([1], [["4,5", [3, 6], true]]))).toBe("gained");
    expect(stereoAgainst(shown([1]), shown([1], [], [["7,8", 1]]))).toBe("gained");
  });

  it("takes a double bond's cis or trans against its groups: the other group at one end, the other way round, is the same", () => {
    const given = shown([], [["4,5", [3, 6], true]]);
    expect(stereoAgainst(given, shown([], [["4,5", [9, 6], false]]))).toBeNull();
    expect(stereoAgainst(given, shown([], [["4,5", [9, 6], true]]))).toBe("changed");
    expect(stereoAgainst(given, shown([], [["4,5", [9, 10], true]]))).toBeNull();
  });

  it("lays out no centre the field leaves out, though the picture's own wedge states it", async () => {
    // (C0 C1(O2) C3(N4) C5: the picture wedged at C1 and C3, the field naming C1 alone)
    const picture = drawnFromSmiles("C[C@@H](O)[C@H](N)C");
    const c1 = centreFrom(1, [{ at: 0, deg: 330 }, { at: 2, deg: 90 }, { at: 3, deg: 210 }]);
    const laid = await laidOut(picture, MENO, { axes: [], cumulated: [], configuration: { centres: [c1], doubles: [] } });
    expect([...stereoOf(laid).centres.keys()]).toEqual([laid.atoms[1].id]);
  });
});

describe("a centre the field names, given only where it is the drawing's and Meno's rules hold one", () => {
  it("gives none whose named neighbours are not its own", async () => {
    // (FC(Cl)Br.C: F 0, C 1, Cl 2, Br 3, and a methane's C 4 - which the field names among C 1's neighbours, not bonded to it)
    const picture = plainPicture("FC(Cl)Br.C");
    const wrong = { atom: 1, neighbours: [0, 2, 4], sense: 1 as const };
    const laid = await laidOut(picture, MENO, { axes: [], cumulated: [], configuration: { centres: [wrong], doubles: [] } });
    expect(stereoOf(laid).centres.size).toBe(0);
  });

  it("takes an aziridine's carbon and not its N-methyl N, which keeps no configuration of its own, though the field names both", async () => {
    // (CC1CN1C: C 0, C1 1, C2 2, N 3, C 4 - the N's fourth place a lone pair)
    const picture = plainPicture("CC1CN1C");
    const c = centreFrom(1, [{ at: 0, deg: 90 }, { at: 2, deg: 210 }, { at: 3, deg: 330 }]);
    const n = centreFrom(3, [{ at: 1, deg: 90 }, { at: 2, deg: 210 }, { at: 4, deg: 330 }]);
    const laid = await laidOut(picture, MENO, { axes: [], cumulated: [], configuration: { centres: [c, n], doubles: [] } });
    expect([...stereoOf(laid).centres.keys()]).toEqual([laid.atoms[1].id]);
  });
});
